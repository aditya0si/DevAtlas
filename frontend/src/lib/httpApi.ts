/**
 * DevAtlas HTTP API client — talks to the FastAPI backend under `/api/v1`.
 *
 * Selected at module load by `api.ts` when `NEXT_PUBLIC_DATA_MODE=api`
 * (`NEXT_PUBLIC_API_URL` supplies the origin). It mirrors the
 * `firestoreApi` method surface so the two data layers are interchangeable:
 * the same method names, the same frontend result types, and bounded
 * repository limits.
 *
 * Transport is `fetch` + `AbortSignal` only — no axios, no new dependencies.
 * Every request carries a 10s timeout and failures surface as `HttpApiError`
 * (typed: kind/status/url/data) instead of generic errors.
 */

import { filterToApiDomain } from '@/lib/domain';
import type {
  AnalyticsGraphData,
  CoverageStats,
  DiscoveryData,
  EcosystemStats,
  GeoJSONFeatureCollection,
  IndiaEcosystemScore,
  Insight,
  RepositoryDetailsData,
  SemanticSearchResponse,
  StateComparisonResponse,
  StateDashboardData,
  TrendExplanationData,
} from '@/lib/api';

// ─── Configuration & errors ─────────────────────────────────────────────────

export const API_PREFIX = '/api/v1';
/** Every HTTP request is cancelled after this many milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * Hard ceiling for repository queries issued by the API client. The FastAPI
 * endpoints accept up to 5000 (geospatial) / 10000 (heatmap); the browser has
 * no business pulling that much JSON for one panel, so the client caps at the
 * same 1200-document budget the realtime listener uses.
 */
export const MAX_REPO_QUERY_LIMIT = 1200;

export type HttpApiErrorKind = 'timeout' | 'abort' | 'network' | 'http' | 'parse';

export interface HttpApiErrorDetails {
  kind: HttpApiErrorKind;
  status?: number;
  url?: string;
  data?: unknown;
}

/** Typed error raised by every failed `httpApi` call. */
export class HttpApiError extends Error {
  readonly kind: HttpApiErrorKind;
  readonly status: number;
  readonly url: string;
  readonly data: unknown;

  constructor(message: string, details: HttpApiErrorDetails) {
    super(message);
    this.name = 'HttpApiError';
    this.kind = details.kind;
    this.status = details.status ?? 0;
    this.url = details.url ?? '';
    this.data = details.data ?? null;
  }
}

/** Configured API origin (no trailing slash). Empty string = same origin. */
export function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || '';
  return raw.replace(/\/+$/, '');
}

/** Absolute (or same-origin) URL for an `/api/v1` path. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl()}${API_PREFIX}${suffix}`;
}

type QueryValue = string | number | boolean | undefined | null;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Clamp a caller-supplied repository limit into the client read budget. */
export function clampRepoLimit(requested?: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return MAX_REPO_QUERY_LIMIT;
  }
  return Math.min(Math.floor(requested), MAX_REPO_QUERY_LIMIT);
}

const BACKEND_DOMAINS = new Set([
  'ai',
  'cybersecurity',
  'healthcare',
  'robotics',
  'web',
  'mobile',
  'devops',
  'blockchain',
  'opensource',
]);

/** Map a UI domain filter onto a backend `domain` value (or omit it). */
export function mapApiDomain(filter?: string): string | undefined {
  if (!filter || filter === 'All Projects') return undefined;
  const mapped = filterToApiDomain(filter) || filter.toLowerCase();
  return BACKEND_DOMAINS.has(mapped) ? mapped : undefined;
}

const TIME_RANGE_ALIASES: Record<string, string> = {
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
  '7d': 'week',
  '30d': 'month',
  '90d': 'quarter',
  '12m': 'year',
  '365d': 'year',
  '1y': 'year',
};

/** Map a UI time range onto the backend enum (week|month|quarter|year). */
export function mapApiTimeRange(value?: string): string | undefined {
  if (!value) return undefined;
  return TIME_RANGE_ALIASES[value.toLowerCase()];
}

// ─── fetch plumbing ─────────────────────────────────────────────────────────

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Perform one JSON request. Rejects with `HttpApiError` on timeout, network
 * failure, non-2xx status, or unparseable body.
 *
 * A caller-supplied `signal` keeps its own semantics: if *it* aborted, the
 * original abort error is rethrown so callers can still detect
 * `err.name === 'AbortError'`.
 */
export async function fetchJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = apiUrl(path);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (callerSignal?.aborted) throw err;
    if (timedOut) {
      throw new HttpApiError(`${url} timed out after ${timeoutMs}ms`, { kind: 'timeout', url });
    }
    throw new HttpApiError(`Network request to ${url} failed: ${errorMessage(err)}`, {
      kind: 'network',
      url,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const data = await readJsonSafe(response);
    throw new HttpApiError(`HTTP ${response.status} from ${url}`, {
      kind: 'http',
      status: response.status,
      url,
      data,
    });
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new HttpApiError(`Invalid JSON from ${url}: ${errorMessage(err)}`, {
      kind: 'parse',
      status: response.status,
      url,
    });
  }
}

// ─── Normalizers (defensive, tolerate nullable backend columns) ─────────────

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTopCounts<T extends Record<string, any>>(
  rows: unknown,
  keyField: string,
  countField: string
): T[] {
  return asArray<any>(rows).map((row) => ({
    [keyField]: String(row?.[keyField] ?? ''),
    [countField]: asNumber(row?.[countField]),
  })) as T[];
}

function normalizeEcosystemStats(data: any): EcosystemStats {
  const topLanguages = normalizeTopCounts<{ language: string; count: number }>(
    data?.top_languages,
    'language',
    'count'
  );
  const topDomains = normalizeTopCounts<{ domain: string; count: number }>(
    data?.top_domains,
    'domain',
    'count'
  );
  const topStates = asArray<any>(data?.top_states).map((row, index) => ({
    state: String(row?.state ?? ''),
    repositories: asNumber(row?.repositories ?? row?.count),
    rank: asNumber(row?.rank, index + 1),
  }));

  return {
    total_repositories: asNumber(data?.total_repositories),
    total_events: asNumber(data?.total_events),
    active_developers: asNumber(data?.active_developers),
    total_developers: asNumber(data?.total_developers),
    total_stars: asNumber(data?.total_stars),
    total_forks: asNumber(data?.total_forks),
    ai_repo_percentage: asNumber(data?.ai_repo_percentage),
    top_language: String(data?.top_language ?? topLanguages[0]?.language ?? ''),
    top_state: String(data?.top_state ?? topStates[0]?.state ?? ''),
    top_states: topStates,
    top_languages: topLanguages,
    top_domains: topDomains,
    growth_metrics: (data?.growth_metrics && typeof data.growth_metrics === 'object'
      ? data.growth_metrics
      : {}) as Record<string, number>,
    ai_repos_count: asNumber(data?.ai_repos_count),
    cybersecurity_repos_count: asNumber(data?.cybersecurity_repos_count),
    healthcare_repos_count: asNumber(data?.healthcare_repos_count),
    robotics_repos_count: asNumber(data?.robotics_repos_count),
    web_repos_count: asNumber(data?.web_repos_count),
    mobile_repos_count: asNumber(data?.mobile_repos_count),
    devops_repos_count: asNumber(data?.devops_repos_count),
    blockchain_repos_count: asNumber(data?.blockchain_repos_count),
    opensource_repos_count: asNumber(data?.opensource_repos_count),
    // Server-computed aggregates: not a client-side estimate.
    estimated: false,
  };
}

function normalizeFeatureCollection(data: any): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: asArray<any>(data?.features).map((feature) => ({
      type: 'Feature' as const,
      geometry: feature?.geometry ?? { type: 'Point', coordinates: [0, 0] },
      properties: feature?.properties ?? {},
    })),
  };
}

function normalizeRepoDetails(data: any): RepositoryDetailsData {
  return {
    id: String(data?.id ?? ''),
    name: String(data?.name ?? ''),
    full_name: String(data?.full_name ?? ''),
    description: data?.description ?? null,
    html_url: String(data?.html_url ?? ''),
    language: data?.language ?? null,
    languages: data?.languages ?? null,
    stargazers_count: asNumber(data?.stargazers_count),
    forks_count: asNumber(data?.forks_count),
    open_issues_count: asNumber(data?.open_issues_count),
    topics: asArray<string>(data?.topics),
    default_branch: data?.default_branch ?? null,
    created_at: data?.created_at ?? null,
    updated_at: data?.updated_at ?? null,
    pushed_at: data?.pushed_at ?? null,
    classification: data?.classification ?? null,
    owner: data?.owner
      ? {
          login: String(data.owner.login ?? ''),
          avatar_url: data.owner.avatar_url,
          location: data.owner.location,
          state: data.owner.state,
        }
      : data?.owner_login
        ? { login: String(data.owner_login) }
        : null,
  };
}

// ─── SSE (Ask DevAtlas copilot) ─────────────────────────────────────────────

/**
 * Decode a stream chunk to text. Prefers the platform TextDecoder (browsers,
 * Node) and degrades to a no-op string pass-through where it is missing.
 */
function decodeChunk(value: unknown): string {
  const TextDecoderImpl = (globalThis as any).TextDecoder;
  if (typeof TextDecoderImpl === 'function' && value instanceof Uint8Array) {
    return new TextDecoderImpl().decode(value, { stream: true });
  }
  return typeof value === 'string' ? value : '';
}

function parseSseEvents(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  return { events: parts, rest };
}

function ssePayload(event: string): string {
  return event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
}

// ─── API Methods (HTTP-backed) ──────────────────────────────────────────────

export const httpApi = {
  // ── Ecosystem & overview ──────────────────────────────────────────────────
  async getEcosystemStats(year?: number, signal?: AbortSignal): Promise<EcosystemStats> {
    const data = await fetchJson<any>(withQuery('/india/stats', { year }), { signal });
    return normalizeEcosystemStats(data);
  },

  async getInsights(limit = 10, signal?: AbortSignal): Promise<Insight[]> {
    const data = await fetchJson<any>(withQuery('/india/insights', { limit }), { signal });
    return asArray<Insight>(data);
  },

  async getIndiaOverview(year?: number, signal?: AbortSignal): Promise<any> {
    const data = await fetchJson<any>(withQuery('/india/overview', { year }), { signal });
    return {
      ...data,
      title: 'DevAtlas India Ecosystem Overview',
      summary: data?.ai_summary || 'India developer ecosystem overview',
    };
  },

  async getStateDashboard(
    stateCode: string,
    year?: number,
    signal?: AbortSignal
  ): Promise<StateDashboardData> {
    const data = await fetchJson<any>(
      withQuery(`/india/states/${encodeURIComponent(stateCode)}`, { year }),
      { signal }
    );
    return {
      ...data,
      state: String(data?.state ?? stateCode),
      repository_count: asNumber(data?.repository_count),
      active_developers: asNumber(data?.active_developers),
      top_languages: asArray(data?.top_languages),
      fastest_growing_technologies: asArray(data?.fastest_growing_technologies),
      ai_summary: String(data?.ai_summary ?? ''),
      monthly_growth_percent: asNumber(data?.monthly_growth_percent),
      weekly_growth_percent: asNumber(data?.weekly_growth_percent),
      trending_projects: asArray(data?.trending_projects),
      top_organizations: asArray(data?.top_organizations),
      activity_graph: asArray(data?.activity_graph),
    } as StateDashboardData;
  },

  // ── Geospatial / activity layers ──────────────────────────────────────────
  async getGeospatialActivity(
    bbox: string,
    options: { domain?: string; timeRange?: string; year?: number; limit?: number; signal?: AbortSignal } = {}
  ): Promise<GeoJSONFeatureCollection> {
    const data = await fetchJson<any>(
      withQuery('/geospatial/activity', {
        bbox,
        limit: clampRepoLimit(options.limit),
        domain: mapApiDomain(options.domain),
        time_range: mapApiTimeRange(options.timeRange),
        year: options.year,
      }),
      { signal: options.signal }
    );
    return normalizeFeatureCollection(data);
  },

  async getActivityHeatmap(
    params: { bbox?: string; layer?: string; time_range?: string; limit?: number; signal?: AbortSignal } = {}
  ): Promise<GeoJSONFeatureCollection> {
    const data = await fetchJson<any>(
      withQuery('/heatmap', {
        bbox: params.bbox || '-180,-90,180,90',
        layer: params.layer || 'development_activity',
        time_range: params.time_range || '30d',
        limit: clampRepoLimit(params.limit),
      }),
      { signal: params.signal }
    );
    return normalizeFeatureCollection(data);
  },

  async getActivityLayers(signal?: AbortSignal): Promise<{
    base_layers: { id: string; name: string; color: string }[];
    domain_overlays: { id: string; name: string; color: string }[];
    time_windows: { id: string; name: string }[];
  }> {
    const data = await fetchJson<any>('/layers', { signal });
    return {
      base_layers: asArray(data?.base_layers),
      domain_overlays: asArray(data?.domain_overlays),
      time_windows: asArray(data?.time_windows),
    };
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  async getAnalyticsGraphs(
    timeRange: string = 'month',
    year?: number,
    signal?: AbortSignal
  ): Promise<AnalyticsGraphData> {
    const data = await fetchJson<any>(
      withQuery('/india/analytics/graphs', {
        time_range: mapApiTimeRange(timeRange) ?? 'month',
        year,
      }),
      { signal }
    );
    return {
      repositories_over_time: asArray<{ date: string; value: number }>(data?.repositories_over_time).map(
        (point) => ({ date: String(point?.date ?? ''), value: asNumber(point?.value) })
      ),
      technology_growth: normalizeTopCounts<{ language: string; count: number }>(
        data?.technology_growth,
        'language',
        'count'
      ),
      language_popularity: normalizeTopCounts<{ language: string; count: number }>(
        data?.language_popularity,
        'language',
        'count'
      ),
      top_domains: normalizeTopCounts<{ domain: string; count: number }>(
        data?.top_domains,
        'domain',
        'count'
      ),
      growth_trend: asArray<{ date: string; value: number }>(data?.growth_trend).map((point) => ({
        date: String(point?.date ?? ''),
        value: asNumber(point?.value),
      })),
      state_comparison: normalizeTopCounts<{ state: string; repositories: number }>(
        data?.state_comparison,
        'state',
        'repositories'
      ),
      estimated: false,
    };
  },

  // ── Discovery ─────────────────────────────────────────────────────────────
  async getDiscovery(signal?: AbortSignal): Promise<DiscoveryData> {
    const data = await fetchJson<any>('/india/discovery', { signal });
    return {
      trending_repositories: asArray(data?.trending_repositories),
      trending_technologies: asArray(data?.trending_technologies),
      trending_states: asArray(data?.trending_states),
      trending_organizations: asArray(data?.trending_organizations),
      newest_ai_projects: asArray(data?.newest_ai_projects),
      fastest_growing_domains: asArray(data?.fastest_growing_domains),
    } as DiscoveryData;
  },

  // ── Scores ────────────────────────────────────────────────────────────────
  async getIndiaEcosystemScores(year?: number, signal?: AbortSignal): Promise<IndiaEcosystemScore[]> {
    const data = await fetchJson<any>(withQuery('/india/scores', { year }), { signal });
    return asArray<any>(data).map((row, index) => ({
      state: String(row?.state ?? ''),
      developer_activity_score: asNumber(row?.developer_activity_score),
      innovation_score: asNumber(row?.innovation_score),
      open_source_score: asNumber(row?.open_source_score),
      ai_score: asNumber(row?.ai_score),
      cybersecurity_score: asNumber(row?.cybersecurity_score),
      growth_score: asNumber(row?.growth_score),
      overall_score: asNumber(row?.overall_score),
      rank: asNumber(row?.rank, index + 1),
    }));
  },

  async getStateActivityScores(period: string = '30d', limit: number = 20): Promise<any[]> {
    const data = await fetchJson<any>(withQuery('/scores/states', { period, limit }), {});
    return asArray(data);
  },

  async getCityActivityScores(period: string = '30d', limit: number = 20): Promise<any[]> {
    const data = await fetchJson<any>(withQuery('/scores/cities', { period, limit }), {});
    return asArray(data);
  },

  async getEcosystemScores(
    entityType: string = 'state',
    period: string = '30d',
    limit: number = 20
  ): Promise<any[]> {
    const data = await fetchJson<any>(
      withQuery('/ecosystem/scores', { entity_type: entityType, period, limit }),
      {}
    );
    return asArray(data);
  },

  async getDomainStatistics(period: string = '30d', limit: number = 20): Promise<any[]> {
    const data = await fetchJson<any>(withQuery('/domains/stats', { period, limit }), {});
    return asArray(data);
  },

  async getLanguageStatistics(period: string = '30d', limit: number = 20): Promise<any[]> {
    const data = await fetchJson<any>(withQuery('/languages/stats', { period, limit }), {});
    return asArray(data);
  },

  async getDailyActivity(days: number = 30): Promise<Array<Record<string, any>>> {
    const data = await fetchJson<any>(withQuery('/daily', { days }), {});
    return asArray(data);
  },

  async getMonthlyActivity(months: number = 12): Promise<Array<Record<string, any>>> {
    const data = await fetchJson<any>(withQuery('/monthly', { months }), {});
    return asArray(data);
  },

  async getGrowthMetrics(): Promise<{
    daily_activity: Array<Record<string, any>>;
    weekly_growth_percent: number;
    monthly_growth_percent: number;
    year_over_year_growth_percent: number;
  }> {
    const data = await fetchJson<any>('/growth', {});
    return {
      daily_activity: asArray(data?.daily_activity),
      weekly_growth_percent: asNumber(data?.weekly_growth_percent),
      monthly_growth_percent: asNumber(data?.monthly_growth_percent),
      year_over_year_growth_percent: asNumber(data?.year_over_year_growth_percent),
    };
  },

  // ── Coverage & seed status ────────────────────────────────────────────────
  async getCoverageStats(signal?: AbortSignal): Promise<CoverageStats> {
    const data = await fetchJson<any>('/coverage', { signal });
    return {
      users_total: asNumber(data?.users_total),
      users_enriched: asNumber(data?.users_enriched),
      users_with_location: asNumber(data?.users_with_location),
      events_total: asNumber(data?.events_total),
      events_enriched: asNumber(data?.events_enriched),
      repos_total: asNumber(data?.repos_total),
      repos_with_events: asNumber(data?.repos_with_events),
      avg_geocoding_confidence: asNumber(data?.avg_geocoding_confidence),
      estimated: false,
    };
  },

  async getSeedStatus(
    signal?: AbortSignal
  ): Promise<{ has_data: boolean; total_repos: number; embedded_repos: number; ready: boolean }> {
    const data = await fetchJson<any>('/india/seed-status', { signal });
    return {
      has_data: Boolean(data?.has_data),
      total_repos: asNumber(data?.total_repos),
      embedded_repos: asNumber(data?.embedded_repos),
      ready: Boolean(data?.ready),
    };
  },

  // ── Repository details ────────────────────────────────────────────────────
  async getRepositoryDetails(repoId: string, signal?: AbortSignal): Promise<RepositoryDetailsData> {
    try {
      const data = await fetchJson<any>(`/repositories/${encodeURIComponent(repoId)}`, { signal });
      return normalizeRepoDetails(data);
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 404) {
        throw new HttpApiError('Repository not found', {
          kind: 'http',
          status: 404,
          url: err.url,
          data: err.data,
        });
      }
      throw err;
    }
  },

  // ── AI endpoints ──────────────────────────────────────────────────────────
  async semanticSearch(
    query: string,
    limit: number = 10,
    signal?: AbortSignal
  ): Promise<SemanticSearchResponse> {
    const data = await fetchJson<any>('/india/search/semantic', {
      method: 'POST',
      body: { query, limit },
      signal,
    });
    return {
      query: String(data?.query ?? query),
      results: asArray(data?.results ?? data),
      total: asNumber(data?.total, asArray(data?.results ?? data).length),
    } as SemanticSearchResponse;
  },

  async explainTrends(
    params: {
      entity_type?: string;
      entity_name: string;
      metric_name?: string;
      current_value: number;
      previous_value: number;
      time_range?: string;
      domain?: string;
    },
    signal?: AbortSignal
  ): Promise<TrendExplanationData> {
    const data = await fetchJson<any>('/india/trends/explain', {
      method: 'POST',
      body: params,
      signal,
    });
    return {
      summary: String(data?.summary ?? ''),
      key_drivers: asArray(data?.key_drivers),
      unusual_observations: asArray(data?.unusual_observations),
      notable_changes: asArray(data?.notable_changes),
      confidence_score: asNumber(data?.confidence_score),
      entity_type: String(data?.entity_type ?? params.entity_type ?? 'state'),
      entity_name: String(data?.entity_name ?? params.entity_name),
      time_range: String(data?.time_range ?? params.time_range ?? 'month'),
      generated_at: String(data?.generated_at ?? ''),
    } as TrendExplanationData;
  },

  async compareStates(
    stateA: string,
    stateB: string,
    year?: number,
    signal?: AbortSignal
  ): Promise<StateComparisonResponse> {
    const data = await fetchJson<any>(
      withQuery('/india/compare', { state_a: stateA, state_b: stateB, year }),
      { signal }
    );
    return {
      comparison: data?.comparison ?? ({} as StateComparisonResponse['comparison']),
      summary: data?.summary ?? ({} as StateComparisonResponse['summary']),
      insights: asArray(data?.insights),
    };
  },

  // ── Ask DevAtlas copilot — SSE over fetch ─────────────────────────────────
  streamAskDevAtlas(
    query: string,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (err: any) => void,
    onSession?: (sessionId: string) => void,
    onCitations?: (citations: any[]) => void,
    sessionId?: string
  ): () => void {
    const controller = new AbortController();
    let closed = false;
    let failed = false;

    const close = () => {
      closed = true;
      controller.abort();
    };

    const url = apiUrl(
      withQuery('/india/ask/stream', { query, session_id: sessionId })
    );

    const run = async () => {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await readJsonSafe(response);
          throw new HttpApiError(`HTTP ${response.status} from ${url}`, {
            kind: 'http',
            status: response.status,
            url,
            data,
          });
        }

        const body = response.body;
        if (!body) {
          throw new HttpApiError(`Streaming responses are not supported for ${url}`, {
            kind: 'network',
            url,
          });
        }

        const reader = body.getReader();
        let buffer = '';
        let done = false;

        while (!done && !closed) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;

          buffer += decodeChunk(value);
          const parsed = parseSseEvents(buffer);
          buffer = parsed.rest;

          for (const event of parsed.events) {
            const payload = ssePayload(event);
            if (!payload) continue;
            if (payload === '[DONE]') {
              done = true;
              break;
            }
            let message: any;
            try {
              message = JSON.parse(payload);
            } catch {
              continue;
            }
            if (message?.text) onChunk(String(message.text));
            if (message?.session_id && onSession) onSession(String(message.session_id));
            if (message?.citations && onCitations) onCitations(message.citations);
            if (message?.error) {
              failed = true;
              onError?.(new HttpApiError(String(message.error), { kind: 'http', url }));
            }
          }
        }

        if (!closed && !failed) onComplete?.();
      } catch (err) {
        if (closed || controller.signal.aborted) return;
        if (err instanceof HttpApiError) onError?.(err);
        else onError?.(new HttpApiError(`Streaming request to ${url} failed: ${errorMessage(err)}`, {
          kind: 'network',
          url,
        }));
      }
    };

    void run();

    return close;
  },
};
