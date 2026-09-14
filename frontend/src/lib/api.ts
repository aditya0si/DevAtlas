/**
 * DevAtlas Centralized API Client
 * Queries Firestore directly from the browser — no server, no Cloud Functions.
 * Public read access granted via firestore.rules.
 */

import { firestoreApi } from '@/lib/firestoreApi';

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

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('devatlas_token');
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('devatlas_token', token);
  } else {
    localStorage.removeItem('devatlas_token');
  }
}

// ─── Type definitions (unchanged from original) ─────────────────────────────

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

// ─── API Methods — Firestore direct queries ─────────────────────────────────
// All data comes from Firestore. No server, no Cloud Functions, no Blaze plan.

export const api = {
  // Ecosystem & India Overview
  getEcosystemStats: (_year?: number, _signal?: AbortSignal) =>
    firestoreApi.getEcosystemStats(),

  getInsights: (_limit = 10, _signal?: AbortSignal) =>
    Promise.resolve([] as Insight[]),

  getIndiaOverview: (_year?: number, _signal?: AbortSignal) =>
    firestoreApi.getIndiaOverview(),

  getStateDashboard: (
    _stateCode: string,
    _year?: number,
    _signal?: AbortSignal
  ): Promise<StateDashboardData> =>
    Promise.reject(new Error('State dashboard not available in Firestore mode')),

  // Geospatial Activity (map data)
  getGeospatialActivity: (
    bbox: string,
    options: { domain?: string; timeRange?: string; year?: number; limit?: number; signal?: AbortSignal } = {}
  ) => firestoreApi.getGeospatialActivity(bbox, options),

  // Analytics Graphs
  getAnalyticsGraphs: (timeRange: string = 'month', _year?: number, _signal?: AbortSignal) =>
    firestoreApi.getAnalyticsGraphs(timeRange),

  // Repository Details
  getRepositoryDetails: (repoId: string, _signal?: AbortSignal) =>
    firestoreApi.getRepositoryDetails(repoId),

  // AI & Analytics — require server-side processing, not available
  semanticSearch: (
    _query: string,
    _limit = 10,
    _signal?: AbortSignal
  ): Promise<SemanticSearchResponse> =>
    Promise.reject(new Error('Semantic search requires server-side embeddings')),

  explainTrends: (
    _params: {
      entity_type?: string;
      entity_name: string;
      metric_name?: string;
      current_value: number;
      previous_value: number;
      time_range?: string;
      domain?: string;
    },
    _signal?: AbortSignal
  ): Promise<TrendExplanationData> => Promise.reject(new Error('Trend explanation requires server-side AI')),

  compareStates: (
    _stateA: string,
    _stateB: string,
    _year?: number,
    _signal?: AbortSignal
  ): Promise<StateComparisonResponse> =>
    Promise.reject(new Error('State comparison requires server-side processing')),

  getDiscovery: (_signal?: AbortSignal) => firestoreApi.getDiscovery(),

  // Ecosystem scores for Indian states
  getIndiaEcosystemScores: (_year?: number, _signal?: AbortSignal) =>
    firestoreApi.getIndiaEcosystemScores(),

  // Seed status
  getSeedStatus: (_signal?: AbortSignal) => firestoreApi.getSeedStatus(),

  // Ask DevAtlas Copilot — requires server SSE, not available
  streamAskDevAtlas: (
    _query: string,
    _onChunk: (chunk: string) => void,
    _onComplete?: () => void,
    onError?: (err: any) => void,
    _onSession?: (sessionId: string) => void,
    _onCitations?: (citations: any[]) => void,
    _sessionId?: string,
  ) => {
    onError?.(new Error('Copilot requires server-side streaming'));
    return () => {};
  },

  // Auth — stubbed (Firebase Auth would be configured separately)
  login: (_credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> =>
    Promise.reject(new Error('Auth not configured in Firestore mode')),
  register: (_userData: {
    email: string;
    password: string;
    full_name?: string;
  }): Promise<AuthResponse> =>
    Promise.reject(new Error('Auth not configured in Firestore mode')),
  getCurrentUser: () => Promise.resolve(null),

  // Activity Intelligence
  getActivityHeatmap: (params: { bbox?: string; layer?: string; time_range?: string; limit?: number }) =>
    firestoreApi.getGeospatialActivity(params.bbox || '', { limit: params.limit }),

  getActivityLayers: () => firestoreApi.getActivityLayers(),

  // Activity Scores
  getStateActivityScores: (_period: string = '30d', _limit: number = 20) =>
    firestoreApi.getIndiaEcosystemScores() as Promise<any>,
  getCityActivityScores: (_period: string = '30d', _limit: number = 20) =>
    firestoreApi.getIndiaEcosystemScores() as Promise<any>,

  // Ecosystem Scores
  getEcosystemScores: (_entityType: string = 'state', _period: string = '30d', _limit: number = 20) =>
    firestoreApi.getIndiaEcosystemScores() as Promise<any>,

  // Domain Statistics
  getDomainStatistics: (_period: string = '30d', _limit: number = 20) =>
    Promise.resolve([] as DomainStats[]),

  getLanguageStatistics: (_period: string = '30d', _limit: number = 20) =>
    Promise.resolve([] as Array<{ language: string; push_events: number; unique_developers: number }>),

  // Daily & Monthly Activity
  getDailyActivity: (_days: number = 30) => Promise.resolve([] as Array<Record<string, any>>),
  getMonthlyActivity: (_months: number = 12) => Promise.resolve([] as Array<Record<string, any>>),

  // Growth Metrics
  getGrowthMetrics: () =>
    Promise.resolve({ daily_activity: [], weekly_growth_percent: 0, monthly_growth_percent: 0, year_over_year_growth_percent: 0 } as GrowthMetrics),

  // Coverage Statistics
  getCoverageStats: () => firestoreApi.getCoverageStats(),

  // Admin triggers — no-ops (sync runs via GitHub Actions automatically)
  triggerPushEventIngestion: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerEventEnrichment: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerActivityScore: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerEcosystemScore: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerAggregation: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
};
