/**
 * DevAtlas API — Cloud Function (Spark/free plan compatible)
 *
 * Only the HTTP API lives here. It reads from Firestore — no secrets needed.
 * The sync worker (GitHub discovery, Gemini classification, geocoding) runs
 * in GitHub Actions (scripts/firebase-sync/sync.js) using the GITHUB_TOKEN
 * and GEMINI_API_KEY stored as GitHub Actions secrets.
 */

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// ─── HTTPS API — matches frontend's existing contract ────────────────────

exports.api = onRequest(
  { cors: true, maxInstances: 10 },
  async (req, res) => {
    const path = req.path.replace(/^\/?(api\/v1\/?)?/, "");
    const [resource, ...rest] = path.split("/");

    try {
      switch (resource) {
        case "india":
          return await handleIndiaRoutes(rest, req, res);
        case "geospatial":
          return await handleGeospatialRoutes(rest, req, res);
        case "repositories":
          return await handleRepositoryRoutes(rest, req, res);
        case "activity":
          return await handleActivityRoutes(rest, req, res);
        case "coverage":
          return await handleCoverageRoute(req, res);
        case "health":
          return res.status(200).json({ status: "ok", service: "devatlas-api" });
        default:
          return res.status(404).json({ detail: `Unknown route: /${path}` });
      }
    } catch (err) {
      logger.error("API error:", err);
      const status = err.statusCode || 500;
      return res.status(status).json({ detail: err.message });
    }
  }
);

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleIndiaRoutes(segments, req, res) {
  const [sub] = segments;
  if (sub === "stats") return res.status(200).json(await getEcosystemStats());
  if (sub === "overview") return res.status(200).json(await getIndiaOverview());
  if (sub === "analytics" && segments[1] === "graphs") return res.status(200).json(await getAnalyticsGraphs());
  if (sub === "discovery") return res.status(200).json(await getDiscovery());
  if (sub === "scores") return res.status(200).json(await getEcosystemScores());
  if (sub === "seed-status") return res.status(200).json(await getSeedStatus());
  return res.status(404).json({ detail: "Not found" });
}

async function handleGeospatialRoutes(segments, req, res) {
  if (segments[0] === "activity") return res.status(200).json(await getGeospatialActivity(req.query));
  return res.status(404).json({ detail: "Not found" });
}

async function handleRepositoryRoutes(segments, req, res) {
  if (!segments[0]) return res.status(200).json(await listRepositories(req.query));
  return res.status(200).json(await getRepositoryDetails(segments[0]));
}

async function handleActivityRoutes(segments, req, res) {
  if (segments[0] === "heatmap") return res.status(200).json(await getGeospatialActivity(req.query));
  if (segments[0] === "layers") return res.status(200).json(await getActivityLayers());
  return res.status(404).json({ detail: "Not found" });
}

async function handleCoverageRoute(req, res) {
  return res.status(200).json(await getCoverageStats());
}

// ─── Data aggregation queries ───────────────────────────────────────────────

async function getGeospatialActivity(params) {
  const { domain, limit = 5000 } = params;
  let query = db.collection("repositories").limit(parseInt(String(limit), 10));
  if (domain && domain !== "all") {
    query = query.where("domain", "==", domain);
  }

  const snapshot = await query.get();
  const features = [];

  snapshot.forEach((doc) => {
    const repo = doc.data();
    if (!repo.coordinates) return;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [repo.coordinates.longitude, repo.coordinates.latitude],
      },
      properties: {
        id: doc.id,
        name: repo.name,
        full_name: repo.full_name,
        language: repo.language,
        stars: repo.stars,
        activity_score: Math.min(100, Math.log((repo.stars || 1) + 1) * 10),
        classification: repo.classification,
        domain: repo.domain,
        description: repo.description,
      },
    });
  });

  return { type: "FeatureCollection", features };
}

async function getActivityLayers() {
  return {
    base_layers: [
      { id: "heatmap", name: "Activity Heatmap", color: "#4F8BFF" },
      { id: "points", name: "Repository Points", color: "#8B5CF6" },
    ],
    domain_overlays: [
      { id: "ai", name: "AI/ML", color: "#8B5CF6" },
      { id: "cybersecurity", name: "Cybersecurity", color: "#4F8BFF" },
      { id: "healthcare", name: "Healthcare", color: "#10B981" },
      { id: "robotics", name: "Robotics", color: "#FFB547" },
      { id: "devops", name: "DevOps", color: "#06B6D4" },
      { id: "blockchain", name: "Web3", color: "#EC4899" },
    ],
    time_windows: [
      { id: "24h", name: "Last 24 hours" },
      { id: "7d", name: "Last 7 days" },
      { id: "30d", name: "Last 30 days" },
    ],
  };
}

async function getEcosystemStats() {
  const reposSnap = await db.collection("repositories").get();
  const devsSnap = await db.collection("developers").get();

  const repos = [];
  reposSnap.forEach((d) => repos.push(d.data()));

  const languages = {};
  const domains = {};
  const cities = {};
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
    .map(([city, count]) => ({ city, repositories: count }));

  const totalRepos = repos.length;
  const aiRepos = domains["ai"] || 0;

  return {
    total_repositories: totalRepos,
    total_events: 0,
    active_developers: devsSnap.size,
    total_developers: devsSnap.size,
    total_stars: totalStars,
    total_forks: totalForks,
    ai_repo_percentage: totalRepos > 0 ? (aiRepos / totalRepos) * 100 : 0,
    top_language: topLanguages[0]?.language || null,
    top_state: topCities[0]?.city || null,
    top_states: topCities.map((c, i) => ({ state: c.city, repositories: c.repositories, rank: i + 1 })),
    top_languages: topLanguages,
    top_domains: topDomains,
    growth_metrics: {},
    ai_repos_count: domains["ai"] || 0,
    cybersecurity_repos_count: domains["cybersecurity"] || 0,
    healthcare_repos_count: domains["healthcare"] || 0,
    robotics_repos_count: domains["robotics"] || 0,
    web_repos_count: domains["web"] || 0,
    mobile_repos_count: domains["mobile"] || 0,
    devops_repos_count: domains["devops"] || 0,
    blockchain_repos_count: domains["blockchain"] || 0,
    opensource_repos_count: domains["opensource"] || 0,
  };
}

async function getIndiaOverview() {
  const stats = await getEcosystemStats();
  return {
    ...stats,
    title: "DevAtlas India Ecosystem Overview",
    summary: `${stats.total_repositories} repositories tracked across ${stats.top_domains.length} domains from ${stats.active_developers} Indian developers`,
  };
}

async function getAnalyticsGraphs() {
  const reposSnap = await db.collection("repositories").get();

  const languages = {};
  const domains = {};
  const reposOverTime = {};

  reposSnap.forEach((doc) => {
    const r = doc.data();
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
}

async function getDiscovery() {
  const reposSnap = await db.collection("repositories")
    .orderBy("stars", "desc").limit(20).get();

  const trending = [];
  reposSnap.forEach((doc) => {
    const r = doc.data();
    trending.push({
      id: doc.id, name: r.name, full_name: r.full_name,
      stars: r.stars || 0, language: r.language, description: r.description,
    });
  });

  const aiSnap = await db.collection("repositories")
    .where("domain", "==", "ai")
    .orderBy("stars", "desc").limit(10).get();

  const newestAi = [];
  aiSnap.forEach((doc) => {
    const r = doc.data();
    newestAi.push({
      id: doc.id, name: r.name, full_name: r.full_name,
      language: r.language, created_at: r.created_at,
    });
  });

  return {
    trending_repositories: trending,
    trending_technologies: [],
    trending_states: [],
    trending_organizations: [],
    newest_ai_projects: newestAi,
    fastest_growing_domains: [],
  };
}

async function getEcosystemScores() {
  const reposSnap = await db.collection("repositories").get();
  const cityMap = {};

  reposSnap.forEach((doc) => {
    const r = doc.data();
    const city = r.city || "Unknown";
    if (!cityMap[city]) cityMap[city] = { repos: 0, stars: 0, domains: new Set(), ai: 0 };
    cityMap[city].repos++;
    cityMap[city].stars += r.stars || 0;
    if (r.domain) cityMap[city].domains.add(r.domain);
    if (r.domain === "ai") cityMap[city].ai++;
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
    }))
    .sort((a, b) => b.overall_score - a.overall_score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

async function listRepositories(params) {
  const { limit = 20, offset = 0, language } = params;
  let query = db.collection("repositories").orderBy("stars", "desc");
  if (language) query = query.where("language", "==", language);

  const snapshot = await query
    .limit(parseInt(String(limit), 10))
    .offset(parseInt(String(offset), 10))
    .get();

  const items = [];
  snapshot.forEach((doc) => {
    const r = doc.data();
    items.push({
      id: doc.id, name: r.name, full_name: r.full_name,
      description: r.description, html_url: r.html_url,
      language: r.language, stars: r.stars, forks: r.forks,
      open_issues: r.open_issues, topics: r.topics || [],
      classification: r.classification, domain: r.domain,
      owner: r.owner_login ? { login: r.owner_login } : null,
    });
  });
  return items;
}

async function getRepositoryDetails(repoId) {
  const doc = await db.collection("repositories").doc(repoId).get();
  if (!doc.exists) {
    const err = new Error("Repository not found");
    err.statusCode = 404;
    throw err;
  }
  const r = doc.data();
  return {
    id: doc.id, name: r.name, full_name: r.full_name,
    description: r.description, html_url: r.html_url,
    language: r.language, languages: null,
    stargazers_count: r.stars, forks_count: r.forks,
    open_issues_count: r.open_issues, topics: r.topics || [],
    default_branch: r.default_branch,
    created_at: r.created_at, updated_at: r.updated_at, pushed_at: r.pushed_at,
    classification: r.classification,
    owner: { login: r.owner_login },
  };
}

async function getCoverageStats() {
  const reposSnap = await db.collection("repositories").get();
  const devsSnap = await db.collection("developers").get();
  let withLocation = 0;

  reposSnap.forEach((doc) => {
    if (doc.data().coordinates) withLocation++;
  });

  return {
    users_total: devsSnap.size,
    users_enriched: withLocation,
    users_with_location: withLocation,
    events_total: 0,
    events_enriched: 0,
    repos_total: reposSnap.size,
    repos_with_events: 0,
    avg_geocoding_confidence: 0,
  };
}

async function getSeedStatus() {
  const statsDoc = await db.collection("stats").doc("latest").get();
  const stats = statsDoc.exists ? statsDoc.data() : {};
  const reposSnap = await db.collection("repositories").limit(1).get();
  return {
    has_data: !reposSnap.empty,
    total_repos: stats.repos_synced || 0,
    embedded_repos: 0,
    ready: !reposSnap.empty,
  };
}
