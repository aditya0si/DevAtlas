import { api } from '../api';

describe('api query construction', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const mockOk = (body: unknown) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);
  };

  it('builds geospatial activity URL with domain, year and limit', async () => {
    mockOk({ type: 'FeatureCollection', features: [] });
    await api.getGeospatialActivity('-180,-90,180,90', {
      domain: 'AI',
      year: 2024,
      limit: 5000,
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/geospatial/activity');
    expect(url).toContain('bbox=-180%2C-90%2C180%2C90');
    expect(url).toContain('domain=ai');
    expect(url).toContain('year=2024');
    expect(url).toContain('limit=5000');
  });

  it('maps the Web3 filter to the blockchain domain', async () => {
    mockOk({ type: 'FeatureCollection', features: [] });
    await api.getGeospatialActivity('-180,-90,180,90', { domain: 'Web3', year: 2025 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('domain=blockchain');
  });

  it('omits the domain param for "All Projects"', async () => {
    mockOk({ type: 'FeatureCollection', features: [] });
    await api.getGeospatialActivity('-180,-90,180,90', {
      domain: 'All Projects',
      year: 2026,
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain('domain=');
    expect(url).toContain('year=2026');
  });

  it('forwards an AbortSignal to the geospatial activity request', async () => {
    mockOk({ type: 'FeatureCollection', features: [] });
    const controller = new AbortController();
    await api.getGeospatialActivity('-180,-90,180,90', {
      domain: 'AI',
      year: 2025,
      limit: 5000,
      signal: controller.signal,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('omits the AbortSignal for the geospatial activity request when not provided', async () => {
    mockOk({ type: 'FeatureCollection', features: [] });
    await api.getGeospatialActivity('-180,-90,180,90');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeUndefined();
  });

  it('builds ecosystem stats URL with a year for the Time Machine', async () => {
    mockOk({});
    await api.getEcosystemStats(2023);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/india/stats');
    expect(url).toContain('year=2023');
  });

  it('builds ecosystem stats URL without year when omitted', async () => {
    mockOk({});
    await api.getEcosystemStats();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/v1/india/stats');
  });

  it('forwards an AbortSignal to the ecosystem stats request', async () => {
    mockOk({});
    const controller = new AbortController();
    await api.getEcosystemStats(2025, controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('builds the insights URL with the requested limit', async () => {
    mockOk([]);
    await api.getInsights(5);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/v1/india/insights?limit=5');
  });

  it('forwards an AbortSignal to the insights request', async () => {
    mockOk([]);
    const controller = new AbortController();
    await api.getInsights(10, controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('forwards an AbortSignal to the seed-status request', async () => {
    mockOk({ has_data: true, total_repos: 5, embedded_repos: 0, ready: true });
    const controller = new AbortController();
    await api.getSeedStatus(controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('builds analytics graphs URL with time_range and year', async () => {
    mockOk({});
    await api.getAnalyticsGraphs('quarter', 2024);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/india/analytics/graphs');
    expect(url).toContain('time_range=quarter');
    expect(url).toContain('year=2024');
  });

  it('POSTs the trend explanation request with the backend body contract', async () => {
    mockOk({});
    await api.explainTrends({
      entity_type: 'national',
      entity_name: 'India',
      metric_name: 'repository_count',
      current_value: 120,
      previous_value: 100,
      time_range: 'month',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/v1/india/trends/explain');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      entity_type: 'national',
      entity_name: 'India',
      metric_name: 'repository_count',
      current_value: 120,
      previous_value: 100,
      time_range: 'month',
    });
  });

  it('builds the compare URL with backend state_a/state_b params and optional year', async () => {
    mockOk({});
    await api.compareStates('Karnataka', 'Maharashtra', 2024);

    const [url, init] = fetchMock.mock.calls[0];
    const href = String(url);
    expect(href).toContain('/api/v1/india/compare');
    expect(href).toContain('state_a=Karnataka');
    expect(href).toContain('state_b=Maharashtra');
    expect(href).toContain('year=2024');
    // No query string params are passed in the body for a GET.
    expect(init.method).toBeUndefined();
  });

  it('omits year from the compare URL when not provided', async () => {
    mockOk({});
    await api.compareStates('Karnataka', 'Maharashtra');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain('year=');
  });

  it('resolves the full comparison response shape', async () => {
    const comparison = {
      comparison: { state_a: 'Karnataka', state_b: 'Maharashtra' },
      summary: { summary: 'Test summary', winner: null, score_difference: 0 },
      insights: [],
    };
    mockOk(comparison);
    await expect(api.compareStates('Karnataka', 'Maharashtra')).resolves.toEqual(comparison);
  });

  it('builds the state dashboard URL from the state name and year', async () => {
    mockOk({});
    await api.getStateDashboard('Karnataka', 2024);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/v1/india/states/Karnataka?year=2024');
  });

  it('forwards an AbortSignal to the state dashboard request', async () => {
    mockOk({});
    const controller = new AbortController();
    await api.getStateDashboard('Karnataka', 2024, controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('omits the AbortSignal for the state dashboard request when not provided', async () => {
    mockOk({});
    await api.getStateDashboard('Karnataka', 2024);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeUndefined();
  });

  it('builds the India overview URL with a year', async () => {
    mockOk({});
    await api.getIndiaOverview(2024);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/v1/india/overview?year=2024');
  });

  it('forwards an AbortSignal to the India overview request', async () => {
    mockOk({});
    const controller = new AbortController();
    await api.getIndiaOverview(2024, controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('omits the AbortSignal for the India overview request when not provided', async () => {
    mockOk({});
    await api.getIndiaOverview(2024);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeUndefined();
  });

  it('POSTs the semantic search request with query and limit', async () => {
    mockOk({ query: 'Python', results: [], total: 0 });
    await api.semanticSearch('Python', 5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/v1/india/search/semantic');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ query: 'Python', limit: 5 });
  });

  it('forwards an AbortSignal to the semantic search request', async () => {
    mockOk({ query: 'Python', results: [], total: 0 });
    const controller = new AbortController();
    await api.semanticSearch('Python', 5, controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('omits the AbortSignal for the semantic search request when not provided', async () => {
    mockOk({ query: 'Python', results: [], total: 0 });
    await api.semanticSearch('Python', 5);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeUndefined();
  });

  it('builds repository detail URL from the repo id', async () => {
    mockOk({});
    await api.getRepositoryDetails('abc-123');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/v1/repositories/abc-123');
  });

  it('forwards an AbortSignal to the repository details request', async () => {
    mockOk({});
    const controller = new AbortController();
    await api.getRepositoryDetails('abc-123', controller.signal);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('throws APIError with the server detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Repository not found' }),
      text: async () => JSON.stringify({ detail: 'Repository not found' }),
    } as Response);
    await expect(api.getRepositoryDetails('missing')).rejects.toThrow('Repository not found');
  });
});
