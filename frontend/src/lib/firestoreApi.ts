/**
 * DevAtlas Firestore Direct Client
 *
 * Replaces the HTTP API. Queries Firestore directly from the browser.
 * No server, no Cloud Functions, no Blaze plan needed.
 *
 * Public read access is granted via firestore.rules.
 *
 * Read discipline (hardening pass):
 * - Aggregated documents (`stats/ecosystem`, `stats/coverage`) written by the
 *   sync worker are the primary source — one document read per panel.
 * - Every collection query carries an explicit bound (`limit(...)`); nothing in
 *   this module can stream a whole collection into a browser tab.
 * - Client-side aggregation is only a fallback when the aggregate document is
 *   missing, and its result is flagged `estimated: true` so the UI can say so.
 */

import { collection, getDocs, doc, getDoc, query, where, orderBy, limit, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { filterToApiDomain } from '@/lib/domain';
import type {
  EcosystemStats,
  GeoJSONFeatureCollection,
  AnalyticsGraphData,
  DiscoveryData,
  IndiaEcosystemScore,
  RepositoryDetailsData,
  CoverageStats,
} from '@/lib/api';

// ─── Read budget ────────────────────────────────────────────────────────────

/**
 * Hard ceiling for any client-side scan issued by this module. The aggregate
 * documents (stats/ecosystem, stats/coverage) are the intended data path; a
 * scan is only a fallback and must never pull "the whole corpus".
 */
export const MAX_CLIENT_READ_LIMIT = 1200;

/** Documents sampled when a chart needs per-document detail (created_at years). */
export const ANALYTICS_SAMPLE_LIMIT = 500;

/** Documents sampled when ranking states without an aggregate document. */
export const STATE_SCORE_SAMPLE_LIMIT = 1000;

const DOMAIN_KEYS = [
  'ai',
  'cybersecurity',
  'healthcare',
  'robotics',
  'web',
  'mobile',
  'devops',
  'blockchain',
  'opensource',
] as const;

// ─── Aggregate document contracts (written by the sync worker, agent A5) ────
// stats/ecosystem: {total_repositories,total_developers,total_stars,total_forks,
//   top_languages[{language,count}],top_domains[{domain,count}],
//   ai_repo_percentage,generated_at,version}
// stats/coverage:  {users_total,users_enriched,users_with_location,repos_total,
//   repos_with_location,avg_geocoding_confidence,generated_at,version}

export interface EcosystemAggregateDoc {
  total_repositories?: number;
  total_developers?: number;
  total_stars?: number;
  total_forks?: number;
  top_languages?: Array<{ language: string; count: number }>;
  top_domains?: Array<{ domain: string; count: number }>;
  /** Optional extras — consumed when the writer provides them. */
  top_states?: Array<{ state: string; repositories: number; rank?: number }>;
  top_cities?: Array<{ city?: string; state?: string; count?: number; repositories?: number }>;
  ai_repo_percentage?: number;
  ai_repos_count?: number;
  generated_at?: string;
  version?: number;
  [key: string]: unknown;
}

export interface CoverageAggregateDoc {
  users_total?: number;
  users_enriched?: number;
  users_with_location?: number;
  repos_total?: number;
  repos_with_location?: number;
  avg_geocoding_confidence?: number;
  generated_at?: string;
  version?: number;
  [key: string]: unknown;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countEntries(values: Record<string, number>, key: string) {
  return Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ [key]: value, count }));
}

/**
 * Every collection read takes an explicit constraint list; the signature makes
 * an unbounded query impossible to write by accident.
 */
async function getCollection(name: string, constraints: QueryConstraint[]) {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, name), ...constraints));
  const items: any[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  return items;
}

/**
 * Read one aggregate document from the `stats` collection.
 * Returns null when the document is missing (or unreadable), which routes the
 * caller to its bounded fallback instead of failing the panel.
 */
async function getAggregateDoc<T>(docId: string): Promise<T | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'stats', docId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data && typeof data === 'object' ? (data as T) : null;
  } catch {
    return null;
  }
}

// ─── Repository activity properties (shared with useRealtimeRepos) ──────────

export type RepoActivitySource = 'github_events' | 'stars_estimate';

export interface RepoActivityProperties {
  stars: number;
  /**
   * 0-100 activity score. `github_events` scores are measured by the sync
   * worker from PushEvents; `stars_estimate` scores are a clearly-labelled
   * stars-based stand-in, never presented as measured activity.
   */
  activity_score: number;
  activity_source: RepoActivitySource;
  /** Present only when there is no measured score ("stars estimate"). */
  stars_estimate?: number;
}

/** 0-100 stars-based stand-in used only when no measured score exists. */
export function starsEstimate(stars: number): number {
  return Math.round(Math.min(100, Math.log((stars || 1) + 1) * 10) * 100) / 100;
}

/**
 * Derive the map feature activity fields from a Firestore repository document.
 * Uses the measured `activity_score` written by the sync worker when present;
 * otherwise labels the value as a stars estimate.
 */
export function deriveRepoActivity(repo: { stars?: number; activity_score?: number }): RepoActivityProperties {
  const stars = num(repo.stars);
  const measured =
    typeof repo.activity_score === 'number' && Number.isFinite(repo.activity_score)
      ? repo.activity_score
      : null;

  if (measured !== null) {
    return { stars, activity_score: measured, activity_source: 'github_events' };
  }

  const estimate = starsEstimate(stars);
  return {
    stars,
    activity_score: estimate,
    activity_source: 'stars_estimate',
    stars_estimate: estimate,
  };
}

// ─── Aggregate → frontend mapping ───────────────────────────────────────────

function normalizeTopLanguages(rows: unknown): Array<{ language: string; count: number }> {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: any) => ({ language: String(row?.language ?? ''), count: num(row?.count) }))
    .sort((a, b) => b.count - a.count);
}

function normalizeTopDomains(rows: unknown): Array<{ domain: string; count: number }> {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: any) => ({ domain: String(row?.domain ?? ''), count: num(row?.count) }))
    .sort((a, b) => b.count - a.count);
}

function normalizeTopStates(rows: unknown): Array<{ state: string; repositories: number; rank: number }> {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((row: any) => ({
      state: String(row?.state ?? row?.city ?? ''),
      repositories: num(row?.repositories ?? row?.count),
    }))
    .sort((a, b) => b.repositories - a.repositories)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function domainCount(domains: Array<{ domain: string; count: number }>, domain: string): number {
  return domains.find((d) => d.domain === domain)?.count ?? 0;
}

function ecosystemStatsFromAggregate(aggregate: EcosystemAggregateDoc): EcosystemStats {
  const topLanguages = normalizeTopLanguages(aggregate.top_languages);
  const topDomains = normalizeTopDomains(aggregate.top_domains);
  const topStates = normalizeTopStates(aggregate.top_states ?? aggregate.top_cities);
  const totalRepositories = num(aggregate.total_repositories);
  const totalDevelopers = num(aggregate.total_developers);
  const aiRepoPercentage = num(aggregate.ai_repo_percentage);
  const aiReposCount =
    typeof aggregate.ai_repos_count === 'number'
      ? num(aggregate.ai_repos_count)
      : domainCount(topDomains, 'ai') ||
        Math.round((totalRepositories * aiRepoPercentage) / 100);

  const domainCounts = DOMAIN_KEYS.reduce<Record<string, number>>((acc, domain) => {
    acc[domain] = domainCount(topDomains, domain);
    return acc;
  }, {});

  return {
    total_repositories: totalRepositories,
    total_events: num(aggregate.total_events),
    active_developers: num(aggregate.active_developers, totalDevelopers),
    total_developers: totalDevelopers,
    total_stars: num(aggregate.total_stars),
    total_forks: num(aggregate.total_forks),
    ai_repo_percentage: aiRepoPercentage,
    top_language: topLanguages[0]?.language ?? '',
    top_state: topStates[0]?.state ?? '',
    top_states: topStates,
    top_languages: topLanguages,
    top_domains: topDomains,
    growth_metrics:
      aggregate.growth_metrics && typeof aggregate.growth_metrics === 'object'
        ? (aggregate.growth_metrics as Record<string, number>)
        : {},
    ai_repos_count: aiReposCount,
    cybersecurity_repos_count: domainCounts.cybersecurity,
    healthcare_repos_count: domainCounts.healthcare,
    robotics_repos_count: domainCounts.robotics,
    web_repos_count: domainCounts.web,
    mobile_repos_count: domainCounts.mobile,
    devops_repos_count: domainCounts.devops,
    blockchain_repos_count: domainCounts.blockchain,
    opensource_repos_count: domainCounts.opensource,
    estimated: false,
    generated_at: typeof aggregate.generated_at === 'string' ? aggregate.generated_at : undefined,
  };
}

function coverageStatsFromAggregate(aggregate: CoverageAggregateDoc): CoverageStats {
  return {
    users_total: num(aggregate.users_total),
    users_enriched: num(aggregate.users_enriched),
    users_with_location: num(aggregate.users_with_location),
    events_total: num(aggregate.events_total),
    events_enriched: num(aggregate.events_enriched),
    repos_total: num(aggregate.repos_total),
    repos_with_events: num(aggregate.repos_with_events),
    avg_geocoding_confidence: num(aggregate.avg_geocoding_confidence),
    estimated: false,
    generated_at: typeof aggregate.generated_at === 'string' ? aggregate.generated_at : undefined,
  };
}

// ─── Bounded fallbacks (only when no aggregate document exists) ─────────────

async function estimateEcosystemStats(): Promise<EcosystemStats> {
  const repos = await getCollection('repositories', [limit(MAX_CLIENT_READ_LIMIT)]);
  const devs = await getCollection('developers', [limit(MAX_CLIENT_READ_LIMIT)]);

  const languages: Record<string, number> = {};
  const domains: Record<string, number> = {};
  const cities: Record<string, number> = {};
  let totalStars = 0;
  let totalForks = 0;

  for (const r of repos) {
    if (r.language) languages[r.language] = (languages[r.language] || 0) + 1;
    if (r.domain) domains[r.domain] = (domains[r.domain] || 0) + 1;
    if (r.city) cities[r.city] = (cities[r.city] || 0) + 1;
    totalStars += r.stars || 0;
    totalForks += r.forks || 0;
  }

  const topLanguages = countEntries(languages, 'language').slice(0, 10) as Array<{
    language: string;
    count: number;
  }>;
  const topDomains = countEntries(domains, 'domain') as Array<{ domain: string; count: number }>;
  const topCities = countEntries(cities, 'state').slice(0, 10) as Array<{ state: string; count: number }>;

  const totalRepos = repos.length;
  const aiRepos = domains['ai'] || 0;

  return {
    total_repositories: totalRepos,
    total_events: 0,
    active_developers: devs.length,
    total_developers: devs.length,
    total_stars: totalStars,
    total_forks: totalForks,
    ai_repo_percentage: totalRepos > 0 ? (aiRepos / totalRepos) * 100 : 0,
    top_language: topLanguages[0]?.language ?? '',
    top_state: topCities[0]?.state ?? '',
    top_states: topCities.map((city, index) => ({
      state: city.state,
      repositories: city.count,
      rank: index + 1,
    })),
    top_languages: topLanguages,
    top_domains: topDomains,
    growth_metrics: {},
    ai_repos_count: domains['ai'] || 0,
    cybersecurity_repos_count: domains['cybersecurity'] || 0,
    healthcare_repos_count: domains['healthcare'] || 0,
    robotics_repos_count: domains['robotics'] || 0,
    web_repos_count: domains['web'] || 0,
    mobile_repos_count: domains['mobile'] || 0,
    devops_repos_count: domains['devops'] || 0,
    blockchain_repos_count: domains['blockchain'] || 0,
    opensource_repos_count: domains['opensource'] || 0,
    // Client-side sample, not the full corpus: the UI must be able to say so.
    estimated: true,
  };
}

// ─── API Methods (Firestore-backed) ─────────────────────────────────────────

export const firestoreApi = {
  // ── Ecosystem Stats ────────────────────────────────────────────────────────
  async getEcosystemStats(): Promise<EcosystemStats> {
    const aggregate = await getAggregateDoc<EcosystemAggregateDoc>('ecosystem');
    if (aggregate) return ecosystemStatsFromAggregate(aggregate);

    // No aggregate document yet (pre-backfill deploy): bounded estimate.
    return estimateEcosystemStats();
  },

  // ── India Overview ──────────────────────────────────────────────────────────
  async getIndiaOverview(): Promise<any> {
    const stats = await this.getEcosystemStats();
    return {
      ...stats,
      title: 'DevAtlas India Ecosystem Overview',
      summary: `${stats.total_repositories} repositories tracked across ${stats.top_domains.length} domains from ${stats.active_developers} Indian developers`,
    };
  },

  // ── Geospatial Activity (map data) ─────────────────────────────────────────
  async getGeospatialActivity(
    _bbox: string,
    options: { domain?: string; timeRange?: string; year?: number; limit?: number; signal?: AbortSignal } = {}
  ): Promise<GeoJSONFeatureCollection> {
    const requested = typeof options.limit === 'number' && options.limit > 0 ? options.limit : MAX_CLIENT_READ_LIMIT;
    const constraints: QueryConstraint[] = [limit(Math.min(Math.floor(requested), MAX_CLIENT_READ_LIMIT))];
    const domain =
      options.domain && options.domain !== 'All Projects'
        ? filterToApiDomain(options.domain) || options.domain.toLowerCase()
        : null;

    if (domain) {
      constraints.push(where('domain', '==', domain));
    }

    const repos = await getCollection('repositories', constraints);
    const features = repos
      .filter((r) => r.coordinates)
      .map((r) => {
        const activity = deriveRepoActivity(r);
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [r.coordinates.longitude, r.coordinates.latitude],
          },
          properties: {
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            language: r.language,
            stars: activity.stars,
            activity_score: activity.activity_score,
            activity_source: activity.activity_source,
            ...(activity.stars_estimate !== undefined ? { stars_estimate: activity.stars_estimate } : {}),
            classification: r.classification || null,
            domain: r.domain || null,
            description: r.description || null,
          },
        };
      });

    return { type: 'FeatureCollection', features };
  },

  // ── Analytics Graphs ────────────────────────────────────────────────────────
  async getAnalyticsGraphs(_timeRange: string = 'month', _year?: number): Promise<AnalyticsGraphData> {
    // One bounded sample supplies the creation-date histogram; the aggregate
    // document supplies the language/domain breakdowns (no full scan either way).
    const [aggregate, sample] = await Promise.all([
      getAggregateDoc<EcosystemAggregateDoc>('ecosystem'),
      getCollection('repositories', [limit(ANALYTICS_SAMPLE_LIMIT)]),
    ]);

    const sampleLanguages: Record<string, number> = {};
    const sampleDomains: Record<string, number> = {};
    const reposOverTime: Record<string, number> = {};

    sample.forEach((r) => {
      if (r.language) sampleLanguages[r.language] = (sampleLanguages[r.language] || 0) + 1;
      if (r.domain) sampleDomains[r.domain] = (sampleDomains[r.domain] || 0) + 1;
      if (r.created_at) {
        const month = String(r.created_at).slice(0, 7);
        reposOverTime[month] = (reposOverTime[month] || 0) + 1;
      }
    });

    const topLanguages = aggregate
      ? normalizeTopLanguages(aggregate.top_languages)
      : (countEntries(sampleLanguages, 'language') as Array<{ language: string; count: number }>);
    const topDomains = aggregate
      ? normalizeTopDomains(aggregate.top_domains)
      : (countEntries(sampleDomains, 'domain') as Array<{ domain: string; count: number }>);

    return {
      repositories_over_time: Object.entries(reposOverTime)
        .sort().map(([date, value]) => ({ date, value })),
      technology_growth: topLanguages.slice(0, 10),
      language_popularity: topLanguages.slice(0, 10),
      top_domains: topDomains,
      growth_trend: [],
      state_comparison: [],
      estimated: !aggregate,
      sample_size: sample.length,
    };
  },

  // ── Discovery ──────────────────────────────────────────────────────────────
  async getDiscovery(): Promise<DiscoveryData> {
    const trending = await getCollection('repositories', [
      orderBy('stars', 'desc'),
      limit(20),
    ]);

    const newestAi = await getCollection('repositories', [
      where('domain', '==', 'ai'),
      orderBy('stars', 'desc'),
      limit(10),
    ]);

    return {
      trending_repositories: trending.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        stars: r.stars || 0,
        language: r.language,
        description: r.description,
      })),
      trending_technologies: [],
      trending_states: [],
      trending_organizations: [],
      newest_ai_projects: newestAi.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        language: r.language,
        created_at: r.created_at,
      })),
      fastest_growing_domains: [],
    };
  },

  // ── India Ecosystem Scores ─────────────────────────────────────────────────
  async getIndiaEcosystemScores(): Promise<IndiaEcosystemScore[]> {
    // State ranking needs per-document stars/domain, so this stays a sample —
    // bounded, never the full collection.
    const repos = await getCollection('repositories', [limit(STATE_SCORE_SAMPLE_LIMIT)]);
    const cityMap: Record<string, any> = {};

    repos.forEach((r) => {
      const city = r.city || 'Unknown';
      if (!cityMap[city]) cityMap[city] = { repos: 0, stars: 0, ai: 0 };
      cityMap[city].repos++;
      cityMap[city].stars += r.stars || 0;
      if (r.domain === 'ai') cityMap[city].ai++;
    });

    return Object.entries(cityMap)
      .map(([city, data]) => ({
        state: city,
        developer_activity_score: Math.min(100, data.repos * 5),
        innovation_score: Math.min(100, data.ai * 10),
        open_source_score: Math.min(100, data.stars / 100),
        ai_score: Math.min(100, data.ai * 15),
        cybersecurity_score: 0,
        growth_score: Math.min(100, data.repos * 3),
        overall_score: Math.min(100, (data.repos * 4 + data.ai * 8 + data.stars / 200) / 3),
        rank: 0,
      }))
      .sort((a, b) => b.overall_score - a.overall_score)
      .map((s, i) => ({ ...s, rank: i + 1 }));
  },

  // ── Repository Details ────────────────────────────────────────────────────
  async getRepositoryDetails(repoId: string): Promise<RepositoryDetailsData> {
    if (!db) throw new Error('Firestore not initialized');
    const docSnap = await getDoc(doc(db, 'repositories', repoId));
    if (!docSnap.exists()) throw new Error('Repository not found');
    const r = docSnap.data();
    return {
      id: docSnap.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      language: r.language,
      languages: null,
      stargazers_count: r.stars,
      forks_count: r.forks,
      open_issues_count: r.open_issues,
      topics: r.topics || [],
      default_branch: r.default_branch,
      created_at: r.created_at,
      updated_at: r.updated_at,
      pushed_at: r.pushed_at,
      classification: r.classification,
      owner: { login: r.owner_login },
    };
  },

  // ── Seed Status ────────────────────────────────────────────────────────────
  async getSeedStatus(): Promise<{ has_data: boolean; total_repos: number; embedded_repos: number; ready: boolean }> {
    const aggregate = await getAggregateDoc<EcosystemAggregateDoc>('ecosystem');
    if (aggregate) {
      const total = num(aggregate.total_repositories);
      return {
        has_data: total > 0,
        total_repos: total,
        embedded_repos: num(aggregate.embedded_repos),
        ready: total > 0,
      };
    }

    const repos = await getCollection('repositories', [limit(1)]);
    const latest = await getAggregateDoc<{ repos_synced?: number; embedded_repos?: number }>('latest');
    return {
      has_data: repos.length > 0,
      total_repos: num(latest?.repos_synced),
      embedded_repos: num(latest?.embedded_repos),
      ready: repos.length > 0,
    };
  },

  // ── Coverage Stats ─────────────────────────────────────────────────────────
  async getCoverageStats(): Promise<CoverageStats> {
    const aggregate = await getAggregateDoc<CoverageAggregateDoc>('coverage');
    if (aggregate) return coverageStatsFromAggregate(aggregate);

    // Fallback: bounded sample, flagged as an estimate for the UI.
    const [repos, devs] = await Promise.all([
      getCollection('repositories', [limit(MAX_CLIENT_READ_LIMIT)]),
      getCollection('developers', [limit(MAX_CLIENT_READ_LIMIT)]),
    ]);
    let withLocation = 0;
    repos.forEach((r) => {
      if (r.coordinates) withLocation++;
    });
    return {
      users_total: devs.length,
      users_enriched: withLocation,
      users_with_location: withLocation,
      events_total: 0,
      events_enriched: 0,
      repos_total: repos.length,
      repos_with_events: 0,
      avg_geocoding_confidence: 0,
      estimated: true,
    };
  },

  // ── Activity Layers (static) ───────────────────────────────────────────────
  async getActivityLayers(): Promise<{
    base_layers: { id: string; name: string; color: string }[];
    domain_overlays: { id: string; name: string; color: string }[];
    time_windows: { id: string; name: string }[];
  }> {
    return {
      base_layers: [
        { id: 'heatmap', name: 'Activity Heatmap', color: '#4F8BFF' },
        { id: 'points', name: 'Repository Points', color: '#8B5CF6' },
      ],
      domain_overlays: [
        { id: 'ai', name: 'AI/ML', color: '#8B5CF6' },
        { id: 'cybersecurity', name: 'Cybersecurity', color: '#4F8BFF' },
        { id: 'healthcare', name: 'Healthcare', color: '#10B981' },
        { id: 'robotics', name: 'Robotics', color: '#FFB547' },
        { id: 'devops', name: 'DevOps', color: '#06B6D4' },
        { id: 'blockchain', name: 'Web3', color: '#EC4899' },
      ],
      time_windows: [
        { id: '24h', name: 'Last 24 hours' },
        { id: '7d', name: 'Last 7 days' },
        { id: '30d', name: 'Last 30 days' },
      ],
    };
  },
};
