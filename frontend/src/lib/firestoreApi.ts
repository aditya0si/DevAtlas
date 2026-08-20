/**
 * DevAtlas Firestore Direct Client
 *
 * Replaces the HTTP API. Queries Firestore directly from the browser.
 * No server, no Cloud Functions, no Blaze plan needed.
 *
 * Public read access is granted via firestore.rules.
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

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getCollection(name: string, constraints: QueryConstraint[] = []) {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, name), ...constraints));
  const items: any[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  return items;
}

// ─── API Methods (Firestore-backed) ─────────────────────────────────────────

export const firestoreApi = {
  // ── Ecosystem Stats ────────────────────────────────────────────────────────
  async getEcosystemStats(): Promise<EcosystemStats> {
    const repos = await getCollection('repositories');
    const devs = await getCollection('developers');

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

    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([language, count]) => ({ language, count }));

    const topDomains = Object.entries(domains)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));

    const topCities = Object.entries(cities)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([city, count]) => ({ state: city, repositories: count }));

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
      top_language: topLanguages[0]?.language || null,
      top_state: topCities[0]?.state || null,
      top_states: topCities.map((c, i) => ({ ...c, rank: i + 1 })),
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
    };
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
    const constraints: QueryConstraint[] = [limit(options.limit || 5000)];
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
      .map((r) => ({
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
          stars: r.stars || 0,
          activity_score: Math.min(100, Math.log((r.stars || 1) + 1) * 10),
          classification: r.classification || null,
          domain: r.domain || null,
          description: r.description || null,
        },
      }));

    return { type: 'FeatureCollection', features };
  },

  // ── Analytics Graphs ────────────────────────────────────────────────────────
  async getAnalyticsGraphs(_timeRange: string = 'month', _year?: number): Promise<AnalyticsGraphData> {
    const repos = await getCollection('repositories');

    const languages: Record<string, number> = {};
    const domains: Record<string, number> = {};
    const reposOverTime: Record<string, number> = {};

    repos.forEach((r) => {
      if (r.language) languages[r.language] = (languages[r.language] || 0) + 1;
      if (r.domain) domains[r.domain] = (domains[r.domain] || 0) + 1;
      if (r.created_at) {
        const month = String(r.created_at).slice(0, 7);
        reposOverTime[month] = (reposOverTime[month] || 0) + 1;
      }
    });

    return {
      repositories_over_time: Object.entries(reposOverTime)
        .sort().map(([date, value]) => ({ date, value })),
      technology_growth: Object.entries(languages)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([language, count]) => ({ language, count })),
      language_popularity: Object.entries(languages)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([language, count]) => ({ language, count })),
      top_domains: Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => ({ domain, count })),
      growth_trend: [],
      state_comparison: [],
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
    const repos = await getCollection('repositories');
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
    const repos = await getCollection('repositories', [limit(1)]);
    const stats = await getCollection('stats');
    const latest = stats.find((s) => s.id === 'latest') || {};
    return {
      has_data: repos.length > 0,
      total_repos: latest.repos_synced || 0,
      embedded_repos: 0,
      ready: repos.length > 0,
    };
  },

  // ── Coverage Stats ─────────────────────────────────────────────────────────
  async getCoverageStats(): Promise<CoverageStats> {
    const repos = await getCollection('repositories');
    const devs = await getCollection('developers');
    let withLocation = 0;
    repos.forEach((r) => { if (r.coordinates) withLocation++; });
    return {
      users_total: devs.length,
      users_enriched: withLocation,
      users_with_location: withLocation,
      events_total: 0,
      events_enriched: 0,
      repos_total: repos.length,
      repos_with_events: 0,
      avg_geocoding_confidence: 0,
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
