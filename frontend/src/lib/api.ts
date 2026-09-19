/**
 * DevAtlas Centralized API Client
 *
 * Two interchangeable data layers, selected once at module load:
 *  - `firestore` (default): the browser queries Firestore directly — this is
 *    what the current static deploy on Firebase Hosting uses.
 *  - `api`: the browser calls the FastAPI backend under `NEXT_PUBLIC_API_URL`.
 *
 *   NEXT_PUBLIC_DATA_MODE=api  NEXT_PUBLIC_API_URL=https://api.example.com
 *
 * The public surface (every `api.*` name, parameter list and result type) is
 * identical in both modes, so components never branch on the mode themselves.
 */

import { firestoreApi } from '@/lib/firestoreApi';
import { httpApi } from '@/lib/httpApi';

export class APIError extends Error {
  status: number;
  data: any;
  /** Machine-readable marker (e.g. `API_UNAVAILABLE`); optional. */
  code?: string;

  constructor(message: string, status: number, data?: any, code?: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

/** Code carried by "this build cannot serve that" rejections. */
export const API_UNAVAILABLE_CODE = 'API_UNAVAILABLE';

// ─── Data mode ──────────────────────────────────────────────────────────────

export type DataMode = 'firestore' | 'api';

/**
 * Resolved once at module load (Next.js inlines NEXT_PUBLIC_* at build time).
 * Anything other than the exact string `api` keeps the Firestore path, so an
 * unset/typo'd variable can never silently change the deployed data source.
 */
export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === 'api' ? 'api' : 'firestore';

/** Configured backend origin (no trailing slash); empty = same origin. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

const useApiDataLayer = DATA_MODE === 'api';

/**
 * Server-side-only features: in `firestore` mode they reject with a typed
 * APIError(501, code `API_UNAVAILABLE`) explaining what is needed (there is no
 * server in the static deploy); in `api` mode the same names hit the FastAPI
 * endpoints below.
 *
 * The message keeps the "requires the DevAtlas API" wording that the UI's
 * unavailability helpers recognise.
 */
export function unavailableInFirestoreMode(feature: string): APIError {
  return new APIError(
    `${feature} requires the DevAtlas API — this build serves Firestore data only (set NEXT_PUBLIC_DATA_MODE=api)`,
    501,
    undefined,
    API_UNAVAILABLE_CODE
  );
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
  /**
   * True when the numbers come from a bounded client-side sample instead of
   * the server-side aggregate document (`stats/ecosystem`). Panels should
   * label such values as estimates.
   */
  estimated?: boolean;
  generated_at?: string;
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
  /** True when the charts come from a bounded sample, not the aggregates. */
  estimated?: boolean;
  /** Number of repository documents sampled for the time series. */
  sample_size?: number;
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
  /** True when computed from a bounded client-side sample, not `stats/coverage`. */
  estimated?: boolean;
  generated_at?: string;
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

// ─── API Methods ────────────────────────────────────────────────────────────
// Data source per mode:
//   firestore → firestoreApi (aggregate docs + bounded queries, no full scans)
//   api       → httpApi      (FastAPI backend under /api/v1)

export const api = {
  // Ecosystem & India Overview
  getEcosystemStats: (year?: number, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getEcosystemStats(year, signal)
      : firestoreApi.getEcosystemStats(),

  getInsights: (limit = 10, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getInsights(limit, signal)
      : Promise.resolve([] as Insight[]),

  getIndiaOverview: (year?: number, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getIndiaOverview(year, signal)
      : firestoreApi.getIndiaOverview(),

  getStateDashboard: (
    stateCode: string,
    year?: number,
    signal?: AbortSignal
  ): Promise<StateDashboardData> =>
    useApiDataLayer
      ? httpApi.getStateDashboard(stateCode, year, signal)
      : Promise.reject(unavailableInFirestoreMode('State dashboard')),

  // Geospatial Activity (map data)
  getGeospatialActivity: (
    bbox: string,
    options: { domain?: string; timeRange?: string; year?: number; limit?: number; signal?: AbortSignal } = {}
  ) =>
    useApiDataLayer
      ? httpApi.getGeospatialActivity(bbox, options)
      : firestoreApi.getGeospatialActivity(bbox, options),

  // Analytics Graphs
  getAnalyticsGraphs: (timeRange: string = 'month', year?: number, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getAnalyticsGraphs(timeRange, year, signal)
      : firestoreApi.getAnalyticsGraphs(timeRange, year),

  // Repository Details
  getRepositoryDetails: (repoId: string, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getRepositoryDetails(repoId, signal)
      : firestoreApi.getRepositoryDetails(repoId),

  // AI & Analytics — server-side processing (real endpoints in api mode)
  semanticSearch: (
    query: string,
    limit = 10,
    signal?: AbortSignal
  ): Promise<SemanticSearchResponse> =>
    useApiDataLayer
      ? httpApi.semanticSearch(query, limit, signal)
      : Promise.reject(unavailableInFirestoreMode('Semantic search')),

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
  ): Promise<TrendExplanationData> =>
    useApiDataLayer
      ? httpApi.explainTrends(params, signal)
      : Promise.reject(unavailableInFirestoreMode('Trend explanation')),

  compareStates: (
    stateA: string,
    stateB: string,
    year?: number,
    signal?: AbortSignal
  ): Promise<StateComparisonResponse> =>
    useApiDataLayer
      ? httpApi.compareStates(stateA, stateB, year, signal)
      : Promise.reject(unavailableInFirestoreMode('State comparison')),

  getDiscovery: (signal?: AbortSignal) =>
    useApiDataLayer ? httpApi.getDiscovery(signal) : firestoreApi.getDiscovery(),

  // Ecosystem scores for Indian states
  getIndiaEcosystemScores: (year?: number, signal?: AbortSignal) =>
    useApiDataLayer
      ? httpApi.getIndiaEcosystemScores(year, signal)
      : firestoreApi.getIndiaEcosystemScores(),

  // Seed status
  getSeedStatus: (signal?: AbortSignal) =>
    useApiDataLayer ? httpApi.getSeedStatus(signal) : firestoreApi.getSeedStatus(),

  // Ask DevAtlas Copilot — SSE over fetch in api mode, unavailable in the
  // static Firestore deploy.
  streamAskDevAtlas: (
    query: string,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (err: any) => void,
    onSession?: (sessionId: string) => void,
    onCitations?: (citations: any[]) => void,
    sessionId?: string,
  ): (() => void) => {
    if (useApiDataLayer) {
      return httpApi.streamAskDevAtlas(
        query,
        onChunk,
        onComplete,
        onError,
        onSession,
        onCitations,
        sessionId
      );
    }
    onError?.(unavailableInFirestoreMode('Ask DevAtlas copilot'));
    return () => {};
  },

  // Auth — stubbed (Firebase Auth would be configured separately)
  login: (_credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> =>
    Promise.reject(unavailableInFirestoreMode('Auth')),
  register: (_userData: {
    email: string;
    password: string;
    full_name?: string;
  }): Promise<AuthResponse> =>
    Promise.reject(unavailableInFirestoreMode('Auth')),
  getCurrentUser: () => Promise.resolve(null),

  // Activity Intelligence
  getActivityHeatmap: (params: { bbox?: string; layer?: string; time_range?: string; limit?: number }) =>
    useApiDataLayer
      ? httpApi.getActivityHeatmap(params)
      : firestoreApi.getGeospatialActivity(params.bbox || '', { limit: params.limit }),

  getActivityLayers: () =>
    useApiDataLayer ? httpApi.getActivityLayers() : firestoreApi.getActivityLayers(),

  // Activity Scores
  getStateActivityScores: (period: string = '30d', limit: number = 20) =>
    useApiDataLayer
      ? httpApi.getStateActivityScores(period, limit)
      : (firestoreApi.getIndiaEcosystemScores() as Promise<any>),
  getCityActivityScores: (period: string = '30d', limit: number = 20) =>
    useApiDataLayer
      ? httpApi.getCityActivityScores(period, limit)
      : (firestoreApi.getIndiaEcosystemScores() as Promise<any>),

  // Ecosystem Scores
  getEcosystemScores: (entityType: string = 'state', period: string = '30d', limit: number = 20) =>
    useApiDataLayer
      ? httpApi.getEcosystemScores(entityType, period, limit)
      : (firestoreApi.getIndiaEcosystemScores() as Promise<any>),

  // Domain Statistics
  getDomainStatistics: (period: string = '30d', limit: number = 20) =>
    useApiDataLayer
      ? httpApi.getDomainStatistics(period, limit)
      : Promise.resolve([] as DomainStats[]),

  getLanguageStatistics: (period: string = '30d', limit: number = 20) =>
    useApiDataLayer
      ? httpApi.getLanguageStatistics(period, limit)
      : Promise.resolve([] as Array<{ language: string; push_events: number; unique_developers: number }>),

  // Daily & Monthly Activity
  getDailyActivity: (days: number = 30) =>
    useApiDataLayer
      ? httpApi.getDailyActivity(days)
      : Promise.resolve([] as Array<Record<string, any>>),
  getMonthlyActivity: (months: number = 12) =>
    useApiDataLayer
      ? httpApi.getMonthlyActivity(months)
      : Promise.resolve([] as Array<Record<string, any>>),

  // Growth Metrics
  getGrowthMetrics: () =>
    useApiDataLayer
      ? httpApi.getGrowthMetrics()
      : Promise.resolve({ daily_activity: [], weekly_growth_percent: 0, monthly_growth_percent: 0, year_over_year_growth_percent: 0 } as GrowthMetrics),

  // Coverage Statistics
  getCoverageStats: () =>
    useApiDataLayer ? httpApi.getCoverageStats() : firestoreApi.getCoverageStats(),

  // Admin triggers — no-ops (sync runs via GitHub Actions automatically)
  triggerPushEventIngestion: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerEventEnrichment: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerActivityScore: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerEcosystemScore: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
  triggerAggregation: () => Promise.resolve({ message: 'Sync runs via GitHub Actions', job_id: 'n/a' }),
};
