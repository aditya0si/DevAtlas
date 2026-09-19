"use strict";

/**
 * DevAtlas India Sync Worker
 *
 * Runs in GitHub Actions (free) on the schedule in
 * .github/workflows/sync-github-india.yml — every 2 hours, which is what
 * GitHub actually delivers (finer schedules are throttled hard). Discovers
 * Indian developers via the GitHub Search API, fetches their repos and recent
 * public events, classifies each repo's domain with Gemini, geocodes locations
 * through Nominatim, writes everything to Firestore, and refreshes the
 * server-side aggregate documents the frontend reads.
 *
 * Rules this worker follows (S-09, S-10, S-12):
 *   - Nominatim usage policy: every geocode call goes through one serialized
 *     queue with a >= 1.1 s gap (backend config `geocode_rate_limit_seconds`),
 *     a contact User-Agent, an in-run cache per location, and backoff on 429.
 *   - Backlog sweeps are small and starvation-proof: a document that keeps
 *     failing gets an attempt counter and drops out of the backlog query after
 *     MAX_SYNC_ATTEMPTS, so a poison document cannot hold the window hostage.
 *   - Activity scores are real (derived from public events server-side, see
 *     ./activity.js) and the aggregate documents `stats/ecosystem` +
 *     `stats/coverage` are computed here by paging the collections in
 *     1000-document chunks, so the browser reads two tiny documents instead of
 *     every repository and developer.
 *
 * Env vars (set as GitHub Actions secrets):
 *   GIT_TOKEN                  - GitHub PAT (public_repo scope)
 *   GEMINI_API_KEY             - Google AI Studio API key
 *   FIREBASE_SERVICE_ACCOUNT   - JSON key for a Firebase service account
 *   GEOCODE_RATE_LIMIT_SECONDS - optional, defaults to 1.1 (never below 1.1)
 */

const admin = require("firebase-admin");

const {
  computeActivityScore,
  deriveActivityInputs,
  summarizeEcosystem,
  summarizeCoverage,
} = require("./activity");

// ─── Init Firebase Admin with service account from env ─────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const GITHUB_TOKEN = process.env.GIT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Tunables ──────────────────────────────────────────────────────────────

/** S-09: after this many failures a document leaves the backlog window. */
const MAX_SYNC_ATTEMPTS = 3;
/** S-09: backlog documents handled per phase per run (kept small on purpose). */
const BACKLOG_BATCH = 10;
/** S-09: cap on legacy counter patches written per run by the stats scan. */
const MAX_COUNTER_PATCHES_PER_RUN = 200;
/** S-12: aggregate scan page size / safety valve. */
const STATS_PAGE_SIZE = 1000;
const STATS_MAX_PAGES = 40; // 40k documents — far above the current dataset

// S-10: Nominatim's policy is an absolute maximum of 1 request/second. The
// backend keeps the same value in `geocode_rate_limit_seconds`, and a value
// below the policy floor is ignored.
const CONFIGURED_GEOCODE_SECONDS = Number(process.env.GEOCODE_RATE_LIMIT_SECONDS);
const GEOCODE_RATE_LIMIT_MS = Math.max(
  1100,
  Math.round(
    (Number.isFinite(CONFIGURED_GEOCODE_SECONDS) && CONFIGURED_GEOCODE_SECONDS > 0
      ? CONFIGURED_GEOCODE_SECONDS
      : 1.1) * 1000
  )
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── GitHub API helpers ────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "User-Agent": "DevAtlas/1.0",
  };
}

async function ghFetch(pathname, params = {}) {
  const url = new URL(pathname, GITHUB_API);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: githubHeaders() });

      if (res.status === 200) return await res.json();

      const remaining = parseInt(res.headers.get("x-ratelimit-remaining") || "1", 10);
      if (remaining === 0 || res.status === 403 || res.status === 429) {
        const reset = parseInt(res.headers.get("x-ratelimit-reset") || "0", 10);
        const waitSec = Math.max(reset - Math.floor(Date.now() / 1000), 5);
        if (waitSec < 180) {
          console.log(`Rate limited, waiting ${waitSec}s...`);
          await sleep(waitSec * 1000);
          continue;
        }
        console.error(`Rate limit too long (${waitSec}s), stopping`);
        return null;
      }

      if (res.status === 404) return null;
      console.warn(`GitHub API ${res.status} for ${url.pathname}`);
      return null;
    } catch (err) {
      console.error(`Network error on ${pathname}:`, err.message);
      if (attempt < 2) await sleep(2000);
    }
  }
  return null;
}

// ─── Gemini classification ─────────────────────────────────────────────────

const VALID_DOMAINS = [
  "ai", "cybersecurity", "healthcare", "robotics",
  "devops", "web", "mobile", "blockchain", "opensource",
];

async function classifyWithGemini(repo) {
  const text = [
    repo.full_name,
    repo.description,
    `Language: ${repo.language || "unknown"}`,
    `Topics: ${(repo.topics || []).join(", ")}`,
  ].filter(Boolean).join("\n");

  if (!text.trim()) return "opensource";

  const prompt = `Classify this GitHub repository into exactly ONE domain from this list:
ai, cybersecurity, healthcare, robotics, devops, web, mobile, blockchain, opensource

Repository:
${text}

Respond with only the domain name, nothing else.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 20 },
        }),
      }
    );

    if (!res.ok) {
      console.error(`Gemini classification failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const domain = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    return VALID_DOMAINS.includes(domain) ? domain : "opensource";
  } catch (err) {
    console.error("Gemini classification error:", err.message);
    return null;
  }
}

// ─── Geocoding (Nominatim / OpenStreetMap) ──────────────────────────────────
//
// S-10 — the old code fired up to 20 geocode requests concurrently with
// `User-Agent: DevAtlas/1.0`, which violates the Nominatim usage policy (max
// 1 request/second, no parallel requests, identifiable contact). Every call
// now goes through `geocodeLocation`, which:
//   * queues on a single promise chain, so requests are strictly serialized;
//   * sleeps until at least GEOCODE_RATE_LIMIT_MS has passed since the previous
//     request start (≥ 1.1 s by construction, the policy floor);
//   * sends a descriptive contact User-Agent;
//   * caches results per location string for the run (the policy asks for
//     caching, and repeated city strings are the common case);
//   * backs off and retries on HTTP 429 (Retry-After when present).

const NOMINATIM_USER_AGENT = "DevAtlas/1.0 (+https://github.com/aditya0si/DevAtlas)";
const NOMINATIM_MAX_RETRIES = 2;

const geocodeCache = new Map(); // normalized location -> { lat, lon }
let geocodeChain = Promise.resolve(); // serialization queue (tail promise)
let lastGeocodeAt = 0; // start timestamp of the most recent Nominatim request

function geocodeLocation(location) {
  const run = geocodeChain.then(() => geocodeLocationThrottled(location));
  // keep the chain alive even if a call rejects, so one bad request cannot
  // wedge every later geocode
  geocodeChain = run.then(() => undefined, () => undefined);
  return run;
}

async function geocodeLocationThrottled(location) {
  const query = String(location || "").trim();
  if (!query) return null;

  const key = query.toLowerCase().replace(/\s+/g, " ");
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  for (let attempt = 0; attempt <= NOMINATIM_MAX_RETRIES; attempt++) {
    const waitMs = lastGeocodeAt + GEOCODE_RATE_LIMIT_MS - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastGeocodeAt = Date.now(); // stamp before the request: start-to-start spacing

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      });

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("retry-after") || "");
        const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : GEOCODE_RATE_LIMIT_MS * (attempt + 1) * 4;
        if (attempt < NOMINATIM_MAX_RETRIES) {
          console.warn(`Nominatim 429 for "${query}" — backing off ${Math.round(backoffMs)}ms`);
          await sleep(backoffMs);
          continue;
        }
        console.error(`Nominatim 429 for "${query}" — giving up this run`);
        return null;
      }

      if (!res.ok) {
        console.warn(`Nominatim ${res.status} for "${query}"`);
        if (res.status >= 500 && attempt < NOMINATIM_MAX_RETRIES) {
          await sleep(GEOCODE_RATE_LIMIT_MS * (attempt + 1) * 2);
          continue;
        }
        return null;
      }

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const coords = { lat, lon };
          geocodeCache.set(key, coords);
          return coords;
        }
      }
      return null; // no usable match
    } catch (err) {
      console.error(`Geocode error for "${query}":`, err.message);
      if (attempt < NOMINATIM_MAX_RETRIES) {
        await sleep(GEOCODE_RATE_LIMIT_MS * (attempt + 1) * 2);
        continue;
      }
      return null;
    }
  }
  return null;
}

// ─── Activity (S-12) ───────────────────────────────────────────────────────

/**
 * Derive a developer's real activity score from GitHub's public events.
 * One extra API call per discovered developer (bounded by the discovery cap)
 * and a graceful skip when the call fails: activity is additive, it must never
 * fail the sync. `repos` supplies the star count used as the reach proxy.
 */
async function fetchDeveloperActivity(login, repos) {
  let events;
  try {
    events = await ghFetch(`/users/${login}/events/public`, { per_page: 100 });
  } catch (err) {
    console.warn(`  Events fetch failed for ${login}: ${err.message} — skipping activity`);
    return null;
  }
  if (!Array.isArray(events)) {
    console.warn(`  No public events for ${login} — skipping activity fields`);
    return null;
  }

  const inputs = deriveActivityInputs(events, Date.now());
  const stars = repos.reduce(
    (sum, repo) => (repo && !repo.fork ? sum + (repo.stargazers_count || 0) : sum),
    0
  );
  return computeActivityScore({ ...inputs, stars });
}

// ─── Indian cities rotation ─────────────────────────────────────────────────

const INDIAN_CITIES = [
  "Bangalore", "Bengaluru", "Mumbai", "Delhi", "New Delhi",
  "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad",
  "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur",
  "Indore", "Bhopal", "Patna", "Vadodara", "Ghaziabad",
  "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut",
  "Rajkot", "Varanasi", "Srinagar", "Aurangabad", "Coimbatore",
  "Kochi", "Thiruvananthapuram", "Visakhapatnam", "Chandigarh",
  "Bhubaneswar", "Mysuru", "Mangalore", "Noida", "Gurugram",
];

async function getNextCityIndex() {
  const doc = await db.collection("stats").doc("sync-pointer").get();
  const current = doc.exists ? (doc.data().city_index || 0) : 0;
  const next = (current + 1) % INDIAN_CITIES.length;
  await db.collection("stats").doc("sync-pointer").set({
    city_index: next,
    current_city: INDIAN_CITIES[current],
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return current;
}

// ─── Main sync ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=== DevAtlas India Sync ===");
  let reposSynced = 0;
  let devsDiscovered = 0;
  let activityScored = 0;
  let activitySkipped = 0;

  const cityIndex = await getNextCityIndex();
  const city = INDIAN_CITIES[cityIndex];
  console.log(`Discovering developers in: ${city}`);

  // Phase 1: Discover Indian developers via GitHub Search API
  const searchResults = await ghFetch("/search/users", {
    q: `location:${city} sort:followers`,
    per_page: 30,
    page: 1,
  });

  const userSummaries = searchResults && Array.isArray(searchResults.items)
    ? searchResults.items
    : [];

  if (userSummaries.length === 0) {
    console.log(`No users found for ${city}`);
  } else {
    console.log(`Found ${userSummaries.length} developers in ${city}`);
  }

  for (const userSummary of userSummaries) {
    const userData = await ghFetch(`/users/${userSummary.login}`);
    if (!userData || userData.type !== "User") continue;

    const location = userData.location || "";
    const isIndian = /\bindia\b|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|kerala|tamil nadu|karnataka|maharashtra|telangana|west bengal|gujarat|rajasthan|uttar pradesh|madhya pradesh/i.test(location);
    if (!isIndian) continue;

    devsDiscovered++;

    // Geocode the developer's location (serialized + rate limited, S-10)
    let coordinates = null;
    if (location) {
      const coords = await geocodeLocation(location);
      if (coords) {
        coordinates = new admin.firestore.GeoPoint(coords.lat, coords.lon);
      }
    }

    // Store the developer
    await db.collection("developers").doc(String(userData.id)).set({
      github_id: userData.id,
      login: userData.login,
      name: userData.name || null,
      bio: userData.bio || null,
      company: userData.company || null,
      blog: userData.blog || null,
      location: location || null,
      raw_location: location || null,
      coordinates: coordinates,
      public_repos: userData.public_repos || 0,
      followers: userData.followers || 0,
      following: userData.following || 0,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
      city: city,
      synced_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Phase 2: Fetch the developer's repos (top 10 most recently updated)
    const repos = await ghFetch(`/users/${userData.login}/repos`, {
      sort: "updated",
      per_page: 10,
      page: 1,
    });
    const repoList = Array.isArray(repos) ? repos : [];

    // S-12: real activity score from the developer's public events. Skipped
    // when the developer has no non-fork repositories to annotate.
    let activityFields = null;
    if (repoList.some((repo) => repo && !repo.fork)) {
      const activity = await fetchDeveloperActivity(userData.login, repoList);
      if (activity) {
        activityFields = {
          ...activity,
          activity_computed_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        activityScored++;
      } else {
        activitySkipped++;
      }
    }

    console.log(
      `  Dev: ${userData.login} (${location})` +
      (activityFields ? ` activity=${activityFields.activity_score} pushes30d=${activityFields.push_count_30d}` : "")
    );

    for (const repoData of repoList) {
      if (repoData.fork) continue; // Skip forks

      const repoRef = db.collection("repositories").doc(String(repoData.id));
      const existing = await repoRef.get();
      const existingData = existing.exists ? existing.data() : null;

      const repoDoc = {
        github_id: repoData.id,
        name: repoData.name,
        full_name: repoData.full_name,
        owner_login: repoData.owner?.login,
        owner_id: userData.id,
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
        location: location || null,
        developer_login: userData.login,
        developer_avatar: userData.avatar_url,
        classified: false,
        geocoded: false,
        // S-09: attempt counters always exist on documents this worker writes,
        // so the backlog query (which ranges on them) can see every document.
        classification_attempts: (existingData && existingData.classification_attempts) || 0,
        geocode_attempts: (existingData && existingData.geocode_attempts) || 0,
        // S-12: real, server-computed activity (absent when the events call failed)
        ...(activityFields || {}),
      };

      // S-09: a location that changed since the last attempt is new
      // information — give the document a fresh geocoding budget instead of
      // leaving it permanently excluded from the backlog.
      const previousLocation = existingData ? (existingData.raw_location || existingData.location || null) : null;
      if (
        existingData &&
        existingData.geocode_attempts >= MAX_SYNC_ATTEMPTS &&
        previousLocation !== (location || null)
      ) {
        repoDoc.geocode_attempts = 0;
      }

      // New repo: set coordinates immediately if we have them
      if (!existing.exists && coordinates) {
        repoDoc.coordinates = coordinates;
        repoDoc.raw_location = location;
        repoDoc.geocoded = true;
        repoDoc.geocoded_at = admin.firestore.FieldValue.serverTimestamp();
      } else if (existing.exists) {
        // Preserve existing coordinates/classification
        if (existingData.coordinates) {
          repoDoc.coordinates = existingData.coordinates;
          repoDoc.geocoded = true;
        }
        if (existingData.domain) {
          repoDoc.domain = existingData.domain;
          repoDoc.classified = true;
          repoDoc.classification = existingData.classification;
        }
      }

      await repoRef.set(repoDoc, { merge: true });
      reposSynced++;

      // Classify the repo's domain with Gemini
      if (!existing.exists || !existingData.domain) {
        const domain = await classifyWithGemini(repoDoc);
        if (domain) {
          await repoRef.update({
            domain: domain,
            classified: true,
            classification: {
              domain: domain,
              classified_at: admin.firestore.FieldValue.serverTimestamp(),
              model: "gemini-2.5-flash",
            },
          });
        } else {
          // S-09: failed attempt is recorded, so a repo Gemini refuses to
          // classify eventually drops out of the backlog instead of being
          // retried forever.
          await recordAttemptFailure(repoRef, "classification_attempts");
        }
      }

      await sleep(100);
    }

    await sleep(200);
  }

  // Phase 3: Sweep — classify and geocode backlog
  const sweep = await sweepBacklog();

  // Phase 4: Aggregate documents the frontend reads (server-side, cheap)
  const stats = await writeAggregateStats();

  // Update stats
  await db.collection("stats").doc("latest").set({
    last_sync_at: admin.firestore.FieldValue.serverTimestamp(),
    repos_synced: reposSynced,
    devs_discovered: devsDiscovered,
    city_processed: city,
    next_city: INDIAN_CITIES[(cityIndex + 1) % INDIAN_CITIES.length],
    sweep_classified: sweep.classified,
    sweep_geocoded: sweep.geocoded,
    sweep_failed: sweep.failed,
    activity_scored: activityScored,
    activity_skipped: activitySkipped,
    stats_generated_at: stats.ecosystem.generated_at,
    legacy_counter_patches: stats.counterPatches,
  }, { merge: true });

  console.log(
    `\nSync complete: city=${city}, devs=${devsDiscovered}, repos=${reposSynced}, ` +
    `activity_scored=${activityScored} (skipped ${activitySkipped}), ` +
    `sweep=[${sweep.classified} classified, ${sweep.geocoded} geocoded, ${sweep.failed} failed], ` +
    `stats=[${stats.ecosystem.total_repositories} repos, ${stats.ecosystem.total_developers} devs]`
  );
  process.exit(0);
}

// ─── Backlog sweep (S-09) ──────────────────────────────────────────────────
//
// Before: `where('classified','==',false).limit(20)` — a document whose
// classification kept failing stayed at the head of that window on every run,
// so the backlog never advanced (same for `geocoded == false`).
// Now: every failed attempt increments `classification_attempts` /
// `geocode_attempts` and the query only returns documents below
// MAX_SYNC_ATTEMPTS, so a poison document leaves the window for good and the
// remaining backlog keeps moving. The batch stays small (BACKLOG_BATCH).
//
// Note on Firestore semantics: range filters never match a document that does
// not have the field, so documents written before these counters existed are
// patched to 0 by the stats scan (`patchLegacyCounters`), which already reads
// every repository. Until that happens they are simply not part of this query.

/**
 * Record a failed backlog attempt: bump the counter, stamp the time.
 * Requires the composite index (flag field ASC, counter field ASC).
 */
async function recordAttemptFailure(ref, counterField) {
  await ref.update({
    [counterField]: admin.firestore.FieldValue.increment(1),
    last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function sweepBacklog() {
  const classified = await sweepClassifyBacklog();
  const geocoded = await sweepGeocodeBacklog();
  console.log(
    `Backlog sweep: classified ${classified.ok}/${classified.scanned} (${classified.failed} failed), ` +
    `geocoded ${geocoded.ok}/${geocoded.scanned} (${geocoded.failed} failed, ${geocoded.skipped} without location)`
  );
  return {
    classified: classified.ok,
    geocoded: geocoded.ok,
    failed: classified.failed + geocoded.failed,
    skipped: geocoded.skipped,
  };
}

async function sweepClassifyBacklog() {
  const snap = await db.collection("repositories")
    .where("classified", "==", false)
    .where("classification_attempts", "<", MAX_SYNC_ATTEMPTS)
    .orderBy("classification_attempts")
    .limit(BACKLOG_BATCH)
    .get();

  let ok = 0;
  let failed = 0;

  await Promise.all(snap.docs.map(async (doc) => {
    const domain = await classifyWithGemini(doc.data());
    if (domain) {
      await doc.ref.update({
        domain: domain,
        classified: true,
        classification: {
          domain: domain,
          classified_at: admin.firestore.FieldValue.serverTimestamp(),
          model: "gemini-2.5-flash",
        },
      });
      ok++;
    } else {
      await recordAttemptFailure(doc.ref, "classification_attempts");
      failed++;
    }
  }));

  return { ok, failed, scanned: snap.size };
}

async function sweepGeocodeBacklog() {
  const snap = await db.collection("repositories")
    .where("geocoded", "==", false)
    .where("geocode_attempts", "<", MAX_SYNC_ATTEMPTS)
    .orderBy("geocode_attempts")
    .limit(BACKLOG_BATCH)
    .get();

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  // Sequential on purpose: geocodeLocation is serialized + rate limited (S-10),
  // so there is no concurrency left to exploit here anyway.
  for (const doc of snap.docs) {
    const row = doc.data();
    if (!row.location) {
      // Nothing to geocode. Counting it as an attempt is what stops these
      // documents from occupying a backlog slot on every single run.
      await recordAttemptFailure(doc.ref, "geocode_attempts");
      skipped++;
      continue;
    }

    const coords = await geocodeLocation(row.location);
    if (coords) {
      await doc.ref.update({
        coordinates: new admin.firestore.GeoPoint(coords.lat, coords.lon),
        raw_location: row.location,
        geocoded: true,
        geocoded_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      ok++;
    } else {
      await recordAttemptFailure(doc.ref, "geocode_attempts");
      failed++;
    }
  }

  return { ok, failed, skipped, scanned: snap.size };
}

// ─── Aggregate documents (S-12) ────────────────────────────────────────────
//
// The frontend used to read the whole `repositories` collection in the
// browser to compute these numbers. The maths now lives in ./activity.js
// (pure, unit tested) and the data comes from paging the collections here with
// the admin SDK in STATS_PAGE_SIZE chunks at roughly zero marginal cost.

/** Fields the aggregate maths needs — keeps the paged payload small. */
const REPO_STATS_FIELDS = [
  "language", "domain", "stars", "forks", "location",
  "classified", "geocoded", "classification_attempts", "geocode_attempts",
  "geocoding_confidence",
];
const DEV_STATS_FIELDS = ["location", "coordinates"];

let useStatsProjection = true;

async function statsPage(name, cursor, projection, withProjection) {
  let query = db.collection(name)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(STATS_PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  if (withProjection) query = query.select(...projection);
  return query.get();
}

/**
 * Page a whole collection in STATS_PAGE_SIZE chunks, returning [{ ref, row }].
 * The projection keeps the response tiny; if the SDK/backend rejects it for any
 * reason we fall back to full documents instead of failing the run.
 */
async function scanCollection(name, projection) {
  const entries = [];
  let cursor = null;

  for (let page = 0; page < STATS_MAX_PAGES; page++) {
    let snap;
    try {
      snap = await statsPage(name, cursor, projection, useStatsProjection);
    } catch (err) {
      if (!useStatsProjection) throw err;
      console.warn(`Projection read on ${name} failed (${err.message}); falling back to full documents`);
      useStatsProjection = false;
      snap = await statsPage(name, cursor, projection, false);
    }
    if (snap.empty) break;

    for (const doc of snap.docs) entries.push({ ref: doc.ref, row: doc.data() });
    cursor = snap.docs[snap.docs.length - 1].id;
    if (snap.size < STATS_PAGE_SIZE) break;
  }

  return entries;
}

/**
 * S-09: documents written before the attempt counters existed carry no counter,
 * and Firestore range filters never match documents that lack the field — such
 * documents would be invisible to the backlog query forever. The stats scan
 * already reads every repository, so they are stamped here for free.
 */
async function patchLegacyCounters(entries) {
  const patches = new Map(); // ref.path -> { ref, fields }

  for (const entry of entries) {
    const row = entry.row || {};
    const fields = {};
    if (row.classified === false && row.classification_attempts === undefined) {
      fields.classification_attempts = 0;
    }
    if (row.geocoded === false && row.geocode_attempts === undefined) {
      fields.geocode_attempts = 0;
    }
    if (Object.keys(fields).length > 0) {
      patches.set(entry.ref.path, { ref: entry.ref, fields });
    }
  }

  const pending = [...patches.values()];
  const limited = pending.slice(0, MAX_COUNTER_PATCHES_PER_RUN);

  for (let i = 0; i < limited.length; i += 400) {
    const batch = db.batch();
    for (const patch of limited.slice(i, i + 400)) {
      batch.update(patch.ref, patch.fields);
    }
    await batch.commit();
  }

  if (pending.length > limited.length) {
    console.warn(
      `Legacy counter backfill: ${pending.length} documents need it, ` +
      `${limited.length} patched this run (cap ${MAX_COUNTER_PATCHES_PER_RUN}) — the rest follow next run`
    );
  }

  return limited.length;
}

/** Compute and write `stats/ecosystem` and `stats/coverage`. */
async function writeAggregateStats() {
  const repoEntries = await scanCollection("repositories", REPO_STATS_FIELDS);
  const devEntries = await scanCollection("developers", DEV_STATS_FIELDS);

  const repoRows = repoEntries.map((entry) => entry.row);
  const devRows = devEntries.map((entry) => entry.row);
  const generatedAt = new Date().toISOString();

  const ecosystem = summarizeEcosystem(repoRows, devRows, generatedAt);
  const coverage = summarizeCoverage(repoRows, devRows, generatedAt);

  // Full replace (no merge): the documents always match the frozen interface.
  await db.collection("stats").doc("ecosystem").set(ecosystem);
  await db.collection("stats").doc("coverage").set(coverage);

  const counterPatches = await patchLegacyCounters(repoEntries);

  console.log(
    `Aggregates written: stats/ecosystem (${ecosystem.total_repositories} repos, ` +
    `${ecosystem.total_developers} devs, top=${ecosystem.top_languages[0]?.language || "n/a"}) + ` +
    `stats/coverage (${coverage.users_enriched} enriched users, ${coverage.repos_with_location} located repos)` +
    (counterPatches > 0 ? ` [legacy counter patches: ${counterPatches}]` : "")
  );

  return { ecosystem, coverage, counterPatches };
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
