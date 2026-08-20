/**
 * One-time seed script: fetches popular repos from GitHub and writes
 * them to Firestore so the map has data on first deploy.
 *
 * Run locally after `firebase init`:
 *   node functions/src/seed.js
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a
 * service account key JSON, or run via `firebase functions:shell`.
 */

const admin = require("firebase-admin");

// Initialize with application default credentials when run locally
admin.initializeApp();
const db = admin.firestore();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

function ghHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "DevAtlas/1.0",
  };
}

async function ghFetch(pathname, params = {}) {
  const url = new URL(pathname, "https://api.github.com");
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 200) return res.json();
  console.warn(`GitHub API ${res.status} for ${pathname}`);
  return null;
}

const SEED_REPOS = [
  "hasura/graphql-engine",
  "hoppscotch/hoppscotch",
  "chatwoot/chatwoot",
  "frappe/erpnext",
  "frappe/frappe",
  "appsmithorg/appsmith",
  "anuraghazra/github-readme-stats",
  "kovidgoyal/calibre",
  "shivammathur/setup-php",
  "knadh/listmonk",
  "openebs/openebs",
  "fission/fission",
  "TheAlgorithms/Python",
  "bagisto/bagisto",
  "GeekyAnts/NativeBase",
  "covid19india/covid19india-react",
];

async function seed() {
  console.log(`Seeding ${SEED_REPOS.length} repos to Firestore...`);

  for (const fullName of SEED_REPOS) {
    const [owner, repo] = fullName.split("/");
    const repoData = await ghFetch(`/repos/${owner}/${repo}`);
    if (!repoData) continue;

    // Fetch owner for location
    const ownerData = await ghFetch(`/users/${owner}`);

    const repoDoc = {
      github_id: repoData.id,
      name: repoData.name,
      full_name: repoData.full_name,
      owner_login: repoData.owner?.login,
      description: repoData.description || null,
      html_url: repoData.html_url,
      language: repoData.language,
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      open_issues: repoData.open_issues_count || 0,
      topics: repoData.topics || [],
      default_branch: repoData.default_branch,
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      pushed_at: repoData.pushed_at,
      last_activity_at: repoData.updated_at,
      synced_at: admin.firestore.FieldValue.serverTimestamp(),
      location: ownerData?.location || null,
      domain: null,
      classification: null,
    };

    await db.collection("repositories").doc(String(repoData.id)).set(repoDoc, { merge: true });
    console.log(`  ✓ ${fullName} (${repoData.stargazers_count} stars, ${ownerData?.location || "no location"})`);

    // Spacing to avoid rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  // Update stats
  await db.collection("stats").doc("latest").set({
    last_seed_at: admin.firestore.FieldValue.serverTimestamp(),
    seed_count: SEED_REPOS.length,
  }, { merge: true });

  console.log("Seed complete! Triggers will classify and geocode asynchronously.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
