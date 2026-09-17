/**
 * httpApi transport tests: URL building against /api/v1, the 10s AbortSignal
 * timeout, typed HttpApiError failures, and the SSE copilot stream — all with
 * a mocked global fetch (the module never uses axios).
 */

import { httpApi, HttpApiError, DEFAULT_TIMEOUT_MS, MAX_REPO_QUERY_LIMIT, apiUrl } from '../httpApi';

// httpApi talks HTTP only — it never touches Firebase. These mocks are
// declared explicitly so the suite stays hermetic (and is recognisably so) even
// if the API layer is imported alongside Firestore-backed modules.
jest.mock('@/lib/firebase', () => ({ db: null }));
jest.mock('firebase/firestore', () => ({}));

const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const badJsonResponse = (status: number) => ({
  ok: true,
  status,
  json: async () => {
    throw new SyntaxError('Unexpected token < in JSON');
  },
});

const streamResponse = (chunks: string[]) => {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { value: chunks[index++], done: false }
            : { value: undefined, done: true },
      }),
    },
  };
};

const lastFetch = () => {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: call[0] as string, init: (call[1] || {}) as RequestInit };
};

describe('httpApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = 'https://api.devatlas.example/';
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('builds /api/v1 URLs from NEXT_PUBLIC_API_URL without doubling slashes', () => {
    expect(apiUrl('/india/stats')).toBe('https://api.devatlas.example/api/v1/india/stats');
    expect(apiUrl('india/stats')).toBe('https://api.devatlas.example/api/v1/india/stats');
  });

  it('issues GETs with an Accept header and no axios', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { total_repositories: 5 }));

    const stats = await httpApi.getEcosystemStats(2024);

    const { url, init } = lastFetch();
    expect(url).toBe('https://api.devatlas.example/api/v1/india/stats?year=2024');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
    expect(stats.total_repositories).toBe(5);
    expect(stats.estimated).toBe(false);
    expect(stats.top_languages).toEqual([]);
    expect(stats.top_states).toEqual([]);
  });

  it('normalizes a full ecosystem stats payload from the backend', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        total_repositories: 4200,
        total_events: 90000,
        active_developers: 900,
        total_developers: 950,
        total_stars: 12000,
        total_forks: 800,
        ai_repo_percentage: 14.29,
        top_language: 'Python',
        top_state: 'Karnataka',
        top_states: [{ state: 'Karnataka', repositories: 600 }],
        top_languages: [{ language: 'Python', count: 1500 }],
        top_domains: [{ domain: 'ai', count: 600 }],
        growth_metrics: { weekly_growth_percent: 2 },
        ai_repos_count: 600,
        cybersecurity_repos_count: 30,
        healthcare_repos_count: 20,
        robotics_repos_count: 10,
        web_repos_count: 500,
        mobile_repos_count: 40,
        devops_repos_count: 45,
        blockchain_repos_count: 12,
        opensource_repos_count: 90,
      })
    );

    const stats = await httpApi.getEcosystemStats();

    expect(stats.total_repositories).toBe(4200);
    expect(stats.active_developers).toBe(900);
    expect(stats.top_languages).toEqual([{ language: 'Python', count: 1500 }]);
    expect(stats.top_states).toEqual([{ state: 'Karnataka', repositories: 600, rank: 1 }]);
    expect(stats.ai_repos_count).toBe(600);
    expect(stats.growth_metrics).toEqual({ weekly_growth_percent: 2 });
  });

  it('raises a typed HttpApiError for non-2xx responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'boom' }));

    await expect(httpApi.getEcosystemStats()).rejects.toMatchObject({
      name: 'HttpApiError',
      kind: 'http',
      status: 500,
      data: { detail: 'boom' },
    });
  });

  it('raises a typed HttpApiError for network failures', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(httpApi.getSeedStatus()).rejects.toMatchObject({
      name: 'HttpApiError',
      kind: 'network',
      status: 0,
    });
  });

  it('raises a parse error when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(badJsonResponse(200));

    await expect(httpApi.getSeedStatus()).rejects.toMatchObject({ kind: 'parse' });
  });

  it('maps a 404 repository lookup onto the "Repository not found" message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: 'Repository not found' }));

    await expect(httpApi.getRepositoryDetails('nope')).rejects.toThrow('Repository not found');
    expect(lastFetch().url).toBe('https://api.devatlas.example/api/v1/repositories/nope');
  });

  it(`aborts the request after ${DEFAULT_TIMEOUT_MS}ms and reports a timeout`, async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const pending = httpApi.getEcosystemStats();
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout', status: 0 });
    jest.advanceTimersByTime(DEFAULT_TIMEOUT_MS + 1);
    await assertion;

    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    jest.useRealTimers();
  });

  it('lets callers abort and preserves the AbortError name', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const controller = new AbortController();
    const pending = httpApi.getEcosystemStats(undefined, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('POSTs semantic search payloads as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [], total: 0 }));

    await httpApi.semanticSearch('vector databases', 5);

    const { url, init } = lastFetch();
    expect(url).toBe('https://api.devatlas.example/api/v1/india/search/semantic');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ query: 'vector databases', limit: 5 });
  });

  it('maps UI filters onto backend query params and clamps repository limits', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { type: 'FeatureCollection', features: [] }));

    await httpApi.getGeospatialActivity('-180,-90,180,90', {
      domain: 'Web3',
      timeRange: '30d',
      year: 2024,
      limit: 5000,
    });

    const url = new URL(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/geospatial/activity');
    expect(url.searchParams.get('bbox')).toBe('-180,-90,180,90');
    expect(url.searchParams.get('domain')).toBe('blockchain');
    expect(url.searchParams.get('time_range')).toBe('month');
    expect(url.searchParams.get('year')).toBe('2024');
    expect(url.searchParams.get('limit')).toBe(String(MAX_REPO_QUERY_LIMIT));
    expect(MAX_REPO_QUERY_LIMIT).toBe(1200);
  });

  it('omits unsupported domain filters instead of sending an invalid enum', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { type: 'FeatureCollection', features: [] }));

    await httpApi.getGeospatialActivity('-180,-90,180,90', { domain: 'Astrology' });

    expect(new URL(lastFetch().url).searchParams.get('domain')).toBeNull();
  });

  it('sends state comparisons as query params', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { comparison: {}, summary: {}, insights: [] }));

    await httpApi.compareStates('Karnataka', 'Kerala', 2023);

    const url = new URL(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/india/compare');
    expect(url.searchParams.get('state_a')).toBe('Karnataka');
    expect(url.searchParams.get('state_b')).toBe('Kerala');
    expect(url.searchParams.get('year')).toBe('2023');
  });

  it('streams SSE text chunks, session ids and citations to the callbacks', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"session_id": "s-1"}\n\n',
        'data: {"citations": [{"repository_id": "r1"}]}\n\n',
        'data: {"text": "Hello "}\n\ndata: {"text": "India"}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();
    const onSession = jest.fn();
    const onCitations = jest.fn();

    httpApi.streamAskDevAtlas('top repos', onChunk, onComplete, onError, onSession, onCitations, 's-1');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSession).toHaveBeenCalledWith('s-1');
    expect(onCitations).toHaveBeenCalledWith([{ repository_id: 'r1' }]);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['Hello ', 'India']);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/india/ask/stream?query=top+repos&session_id=s-1');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
  });

  it('reports SSE error events through the error callback', async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['data: {"error": "provider unavailable"}\n\n', 'data: [DONE]\n\n'])
    );

    const onComplete = jest.fn();
    const onError = jest.fn();

    httpApi.streamAskDevAtlas('top repos', jest.fn(), onComplete, onError);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(HttpApiError);
    expect(onError.mock.calls[0][0].message).toBe('provider unavailable');
    // A failed stream is not also reported as complete.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('closes the SSE stream by aborting the underlying fetch', async () => {
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      captured = init.signal ?? undefined;
      return new Promise(() => {});
    });

    const close = httpApi.streamAskDevAtlas('top repos', jest.fn(), jest.fn(), jest.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(captured?.aborted).toBe(false);
    close();
    expect(captured?.aborted).toBe(true);
  });
});
