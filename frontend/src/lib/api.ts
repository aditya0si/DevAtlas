/**
 * DevAtlas Centralized API Client
 * Provides typed functions for interacting with the DevAtlas FastAPI backend.
 */

import { filterToApiDomain } from '@/lib/domain';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export class APIError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Get stored JWT authentication token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('devatlas_token');
}

/**
 * Set stored JWT authentication token
 */
export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('devatlas_token', token);
  } else {
    localStorage.removeItem('devatlas_token');
  }
}

/**
 * Core fetch wrapper with JSON handling and Auth headers
 */
export async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    throw new APIError(
      errorData?.detail || `API Request failed with status ${response.status}`,
      response.status,
      errorData
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Interfaces
export interface EcosystemStats {
  total_repositories: number;
  total_events: number;
  active_developers: number;
  total_developers: number;
  total_stars: number;
  total_forks: number;
  ai_repo_percentage: number;
  top_language: string;
  top_state: string;
  top_states: Array<{ state: string; repositories: number; rank: number }>;
  top_languages: Array<{ language: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
  growth_metrics: Record<string, number>;
  // Domain-specific repository counts (returned by /india/stats)
  ai_repos_count: number;
  cybersecurity_repos_count: number;
  healthcare_repos_count: number;
  robotics_repos_count: number;
  web_repos_count: number;
  mobile_repos_count: number;
  devops_repos_count: number;
  blockchain_repos_count: number;
  opensource_repos_count: number;
}

export interface Insight {
  id: string;
  text: string;
  category: string;
  region: string | null;
  metric_type: string;
  metric_value: number | null;
  time_range: string;
  generated_at: string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface StateDashboardData {
  state: string;
  repository_count: number;
  active_developers: number;
  top_languages: Array<{ language: string; count: number }>;
  fastest_growing_technologies: Array<{ language: string; count: number }>;
  ai_summary: string;
  monthly_growth_percent: number;
  weekly_growth_percent: number;
  trending_projects: Array<{ name: string; full_name: string; stars: number; language: string | null }>;
  top_organizations: Array<{ login: string; repositories: number }>;
  activity_graph: Array<{ date: string; activity: number }>;
}

export interface RepositoryDetailsData {
  id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  languages: Record<string, number> | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  topics: string[];
  default_branch: string | null;
  created_at: string | null;
  updated_at: string | null;
  pushed_at: string | null;
  classification?: {
    domain?: string;
    industry?: string;
    technology?: string;
    framework?: string;
    difficulty?: string;
  } | null;
  owner?: {
    login: string;
    avatar_url?: string;
    location?: string;
    state?: string;
  } | null;
}

export interface SemanticSearchResult {
  repository_id: string;
  name: string;
  full_name: string;
  description: string | null;
  similarity: number;
  language: string | null;
  topics: string[];
  stars: number;
  html_url: string;
}

export interface SemanticSearchResponse {
  query: string;
  results: SemanticSearchResult[];
  total: number;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

export interface AnalyticsGraphData {
  repositories_over_time: TimeSeriesDataPoint[];
  technology_growth: Array<{ language: string; count: number }>;
  language_popularity: Array<{ language: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
  growth_trend: TimeSeriesDataPoint[];
  state_comparison: Array<{ state: string; repositories: number }>;
}

export interface TrendDriver {
  factor: string;
  impact: string;
  description: string;
  evidence: string[];
}

export interface UnusualObservation {
  observation: string;
  significance: string;
  deviation: string;
}

export interface TrendExplanationData {
  summary: string;
  key_drivers: TrendDriver[];
  unusual_observations: UnusualObservation[];
  notable_changes: string[];
  confidence_score: number;
  entity_type: string;
  entity_name: string;
  time_range: string;
  generated_at: string;
}

export interface StateComparisonData {
  state_a: string;
  state_b: string;
  repository_count_a: number;
  repository_count_b: number;
  developer_activity_a: number;
  developer_activity_b: number;
  growth_rate_a: number;
  growth_rate_b: number;
  top_languages_a: Array<{ language: string; count: number }>;
  top_languages_b: Array<{ language: string; count: number }>;
  top_domains_a: Array<{ domain: string; count: number }>;
  top_domains_b: Array<{ domain: string; count: number }>;
  ai_repos_a: number;
  ai_repos_b: number;
  cybersecurity_repos_a: number;
  cybersecurity_repos_b: number;
  healthcare_repos_a: number;
  healthcare_repos_b: number;
  robotics_repos_a: number;
  robotics_repos_b: number;
  opensource_repos_a: number;
  opensource_repos_b: number;
  avg_stars_a: number;
  avg_stars_b: number;
  innovation_score_a: number;
  innovation_score_b: number;
  growth_score_a: number;
  growth_score_b: number;
  top_organizations_a: string[];
  top_organizations_b: string[];
}

export interface ComparisonSummaryData {
  entity_a: string;
  entity_b: string;
  summary: string;
  winner: string | null;
  score_difference: number;
  strengths_a: string[];
  strengths_b: string[];
  weaknesses_a: string[];
  weaknesses_b: string[];
  opportunities: string[];
  recommendations: string[];
  confidence_score: number;
  generated_at: string;
}

export interface ComparisonInsightData {
  insight_type: string;
  metric: string;
  winner: string | null;
  entity_a_value: number | null;
  entity_b_value: number | null;
  difference_percent: number;
  insight_text: string;
  confidence: string;
}

export interface StateComparisonResponse {
  comparison: StateComparisonData;
  summary: ComparisonSummaryData;
  insights: ComparisonInsightData[];
}

export interface ActivityScore {
  entity_type: string;
  entity_key: string;
  entity_name: string | null;
  activity_score: number;
  push_activity: number;
  developer_presence: number;
  repository_diversity: number;
  period_start: string | null;
  period_end: string | null;
}

export interface EcosystemScore {
  entity_type: string;
  entity_key: string;
  entity_name: string | null;
  ecosystem_score: number;
  developer_activity_score: number;
  developer_count: number;
  technology_diversity: number;
  domain_diversity: number;
  growth_rate: number;
  rank: number;
  period_start: string | null;
  period_end: string | null;
}

// Ecosystem scores for Indian states (GET /india/scores). Computed from real
// location data (GitHubUser.state + enriched GitHubEvent state fields).
export interface IndiaEcosystemScore {
  state: string;
  developer_activity_score: number;
  innovation_score: number;
  open_source_score: number;
  ai_score: number;
  cybersecurity_score: number;
  growth_score: number;
  overall_score: number;
  rank: number;
}

export interface DiscoveryData {
  trending_repositories: Array<{
    id: string;
    name: string;
    full_name: string;
    stars: number;
    language: string | null;
    description: string | null;
  }>;
  trending_technologies: Array<{ language: string; count: number }>;
  trending_states: Array<{ state: string; repositories: number }>;
  trending_organizations: Array<{ login: string; repositories: number }>;
  newest_ai_projects: Array<{
    id: string;
    name: string;
    full_name: string;
    language: string | null;
    created_at: string | null;
  }>;
  fastest_growing_domains: Array<{ domain: string; count: number }>;
}

export interface DomainStats {
  domain: string;
  push_events: number;
  unique_developers: number;
  unique_repositories: number;
}

export interface GrowthMetrics {
  daily_activity: Array<Record<string, any>>;
  weekly_growth_percent: number;
  monthly_growth_percent: number;
  year_over_year_growth_percent: number;
}

export interface CoverageStats {
  users_total: number;
  users_enriched: number;
  users_with_location: number;
  events_total: number;
  events_enriched: number;
  repos_total: number;
  repos_with_events: number;
  avg_geocoding_confidence: number;
}

export interface ActivityLayer {
  id: string;
  name: string;
  color: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// API Methods
export const api = {
  // Ecosystem & India Overview
  getEcosystemStats: (year?: number, signal?: AbortSignal) =>
    fetchAPI<EcosystemStats>(`/india/stats${year ? `?year=${year}` : ''}`, { signal }),

  getInsights: (limit = 10, signal?: AbortSignal) =>
    fetchAPI<Insight[]>(`/india/insights?limit=${limit}`, { signal }),

  getIndiaOverview: (year?: number, signal?: AbortSignal) =>
    fetchAPI<any>(`/india/overview${year ? `?year=${year}` : ''}`, { signal }),

  getStateDashboard: (stateCode: string, year?: number, signal?: AbortSignal) =>
    fetchAPI<StateDashboardData>(`/india/states/${stateCode}${year ? `?year=${year}` : ''}`, { signal }),

  // Geospatial Activity
  getGeospatialActivity: (
    bbox: string,
    options: { domain?: string; timeRange?: string; year?: number; limit?: number; signal?: AbortSignal } = {}
  ) => {
    const params = new URLSearchParams({ bbox });
    const domain =
      options.domain && options.domain !== 'All Projects'
        ? filterToApiDomain(options.domain) || options.domain.toLowerCase()
        : undefined;
    if (domain) params.append('domain', domain);
    if (options.timeRange) params.append('time_range', options.timeRange);
    if (options.year) params.append('year', String(options.year));
    if (options.limit) params.append('limit', String(options.limit));
    return fetchAPI<GeoJSONFeatureCollection>(`/geospatial/activity?${params.toString()}`, {
      signal: options.signal,
    });
  },

  // Analytics Graphs
  getAnalyticsGraphs: (timeRange: string = 'month', year?: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ time_range: timeRange });
    if (year) params.append('year', String(year));
    return fetchAPI<AnalyticsGraphData>(`/india/analytics/graphs?${params.toString()}`, { signal });
  },

  // Repository Details
  getRepositoryDetails: (repoId: string, signal?: AbortSignal) =>
    fetchAPI<RepositoryDetailsData>(`/repositories/${repoId}`, { signal }),

  // AI & Analytics
  semanticSearch: (query: string, limit = 10, signal?: AbortSignal) =>
    fetchAPI<SemanticSearchResponse>('/india/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
      signal,
    }),

  explainTrends: (
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
  ) =>
    fetchAPI<TrendExplanationData>('/india/trends/explain', {
      method: 'POST',
      body: JSON.stringify({
        entity_type: params.entity_type || 'state',
        entity_name: params.entity_name,
        metric_name: params.metric_name || 'repository_count',
        current_value: params.current_value,
        previous_value: params.previous_value,
        time_range: params.time_range || 'month',
        ...(params.domain ? { domain: params.domain } : {}),
      }),
      signal,
    }),

  compareStates: (stateA: string, stateB: string, year?: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ state_a: stateA, state_b: stateB });
    if (year) params.append('year', String(year));
    return fetchAPI<StateComparisonResponse>(`/india/compare?${params.toString()}`, { signal });
  },

  getDiscovery: (signal?: AbortSignal) =>
    fetchAPI<DiscoveryData>('/india/discovery', { signal }),

  // Ecosystem scores for Indian states (GET /india/scores)
  getIndiaEcosystemScores: (year?: number, signal?: AbortSignal) =>
    fetchAPI<IndiaEcosystemScore[]>(`/india/scores${year ? `?year=${year}` : ''}`, { signal }),

  // Seed status for lazy-load interstitial
  getSeedStatus: (signal?: AbortSignal) =>
    fetchAPI<{ has_data: boolean; total_repos: number; embedded_repos: number; ready: boolean }>('/india/seed-status', { signal }),

  // Ask DevAtlas Copilot SSE helper
  streamAskDevAtlas: (
    query: string,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (err: any) => void,
    onSessionId?: (sessionId: string) => void,
    onCitations?: (citations: Array<{ repository_id: string; full_name: string; description?: string; similarity_score: number; language?: string; stars: number }>) => void,
    sessionId?: string
  ) => {
    const params = new URLSearchParams({ query });
    if (sessionId) params.append('session_id', sessionId);
    const url = `${API_BASE_URL}/india/ask/stream?${params.toString()}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        onComplete?.();
        return;
      }
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.session_id) {
          onSessionId?.(parsed.session_id);
          return;
        }
        if (parsed.citations) {
          onCitations?.(parsed.citations);
          return;
        }
        if (parsed.text) {
          onChunk(parsed.text);
        }
      } catch {
        onChunk(event.data);
      }
    };

    eventSource.onerror = (err) => {
      eventSource.close();
      onError?.(err);
    };

    return () => eventSource.close();
  },

  // Auth Methods
  login: (credentials: { email: string; password: string }) =>
    fetchAPI<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (userData: { email: string; password: string; full_name?: string }) =>
    fetchAPI<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  getCurrentUser: () => fetchAPI<any>('/auth/me'),

  // ── Activity Intelligence (Sprint 11) ──
  // Multi-layer heatmap
  getActivityHeatmap: (params: {
    bbox?: string;
    layer?: string;
    time_range?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.bbox) searchParams.set('bbox', params.bbox);
    if (params.layer) searchParams.set('layer', params.layer);
    if (params.time_range) searchParams.set('time_range', params.time_range);
    if (params.limit) searchParams.set('limit', String(params.limit));
    return fetchAPI<GeoJSONFeatureCollection>(`/activity/heatmap?${searchParams.toString()}`);
  },

  getActivityLayers: () =>
    fetchAPI<{ base_layers: ActivityLayer[]; domain_overlays: ActivityLayer[]; time_windows: Array<{ id: string; name: string }> }>('/activity/layers'),

  // Activity Scores
  getStateActivityScores: (period: string = '30d', limit: number = 20) =>
    fetchAPI<ActivityScore[]>(`/activity/scores/states?period=${period}&limit=${limit}`),

  getCityActivityScores: (period: string = '30d', limit: number = 20) =>
    fetchAPI<ActivityScore[]>(`/activity/scores/cities?period=${period}&limit=${limit}`),

  // Ecosystem Scores
  getEcosystemScores: (entityType: string = 'state', period: string = '30d', limit: number = 20) =>
    fetchAPI<EcosystemScore[]>(`/ecosystem/scores?entity_type=${entityType}&period=${period}&limit=${limit}`),

  // Domain Statistics
  getDomainStatistics: (period: string = '30d', limit: number = 20) =>
    fetchAPI<DomainStats[]>(`/domains/stats?period=${period}&limit=${limit}`),

  getLanguageStatistics: (period: string = '30d', limit: number = 20) =>
    fetchAPI<Array<{ language: string; push_events: number; unique_developers: number }>>(`/languages/stats?period=${period}&limit=${limit}`),

  // Daily & Monthly Activity
  getDailyActivity: (days: number = 30) =>
    fetchAPI<Array<Record<string, any>>>(`/activity/daily?days=${days}`),

  getMonthlyActivity: (months: number = 12) =>
    fetchAPI<Array<Record<string, any>>>(`/activity/monthly?months=${months}`),

  // Growth Metrics
  getGrowthMetrics: () =>
    fetchAPI<GrowthMetrics>('/activity/growth'),

  // Coverage Statistics
  getCoverageStats: () =>
    fetchAPI<CoverageStats>('/coverage'),

  // Admin triggers
  triggerPushEventIngestion: () =>
    fetchAPI<{ message: string; job_id: string }>('/admin/trigger/push-event-ingestion', { method: 'POST' }),

  triggerEventEnrichment: () =>
    fetchAPI<{ message: string; job_id: string }>('/admin/trigger/event-enrichment', { method: 'POST' }),

  triggerActivityScore: () =>
    fetchAPI<{ message: string; job_id: string }>('/admin/trigger/activity-score', { method: 'POST' }),

  triggerEcosystemScore: () =>
    fetchAPI<{ message: string; job_id: string }>('/admin/trigger/ecosystem-score', { method: 'POST' }),

  triggerAggregation: () =>
    fetchAPI<{ message: string; job_id: string }>('/admin/trigger/aggregation', { method: 'POST' }),
};
