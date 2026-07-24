/**
 * DevAtlas Centralized API Client
 * Provides typed functions for interacting with the DevAtlas FastAPI backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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
  total_developers: number;
  total_repositories: number;
  total_stars: number;
  total_forks: number;
  ai_repo_percentage: number;
  top_language: string;
  top_state: string;
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
  state_code: string;
  state_name: string;
  total_developers: number;
  total_repositories: number;
  top_languages: Array<{ language: string; count: number; percentage: number }>;
  top_domains: Array<{ domain: string; count: number; percentage: number }>;
  top_repositories: Array<{ id: string; name: string; stars: number; description: string }>;
  ai_readiness_score: number;
  growth_rate: number;
}

export interface RepositoryDetailsData {
  id: string;
  name: string;
  full_name: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string;
  topics: string[];
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
    location?: string;
    state?: string;
  };
  classification?: {
    domain?: string;
    industry?: string;
    technology?: string;
    framework?: string;
    difficulty?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface SemanticSearchResult {
  repository_id: string;
  name: string;
  full_name: string;
  description: string;
  similarity: number;
  domain?: string;
  technology?: string;
  stars: number;
}

export interface TrendExplanationData {
  state_code: string;
  metric_name: string;
  growth_rate: number;
  explanation: string;
  key_drivers: string[];
  unusual_observations: string[];
  confidence_score: number;
}

export interface StateComparisonData {
  state1: string;
  state2: string;
  comparison_summary: string;
  metrics_comparison: Record<string, any>;
  winner: string;
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
  getEcosystemStats: (year?: number) =>
    fetchAPI<EcosystemStats>(`/india/stats${year ? `?year=${year}` : ''}`),

  getIndiaOverview: (year?: number) =>
    fetchAPI<any>(`/india/overview${year ? `?year=${year}` : ''}`),

  getStateDashboard: (stateCode: string, year?: number) =>
    fetchAPI<StateDashboardData>(`/india/states/${stateCode}${year ? `?year=${year}` : ''}`),

  // Geospatial Activity
  getGeospatialActivity: (bbox: string, domain?: string, timeRange?: string) => {
    const params = new URLSearchParams({ bbox });
    if (domain && domain !== 'All Projects') params.append('domain', domain.toLowerCase());
    if (timeRange) params.append('time_range', timeRange);
    return fetchAPI<GeoJSONFeatureCollection>(`/geospatial/activity?${params.toString()}`);
  },

  getGeospatialSummary: () =>
    fetchAPI<any>('/geospatial/summary'),

  // Repository Details
  getRepositoryDetails: (repoId: string) =>
    fetchAPI<RepositoryDetailsData>(`/repositories/${repoId}`),

  // AI & Analytics
  semanticSearch: (query: string, limit = 10) =>
    fetchAPI<{ results: SemanticSearchResult[]; total: number }>('/india/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    }),

  explainTrends: (stateCode: string) =>
    fetchAPI<TrendExplanationData>(`/india/trends/explain?state_code=${stateCode}`),

  compareStates: (state1: string, state2: string) =>
    fetchAPI<StateComparisonData>(`/india/compare?state1=${state1}&state2=${state2}`),

  getDiscovery: () =>
    fetchAPI<any>('/india/discovery'),

  // Seed status for lazy-load interstitial
  getSeedStatus: () =>
    fetchAPI<{ has_data: boolean; total_repos: number; embedded_repos: number; ready: boolean }>('/india/seed-status'),

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
