/**
 * DevAtlas India Sync Worker
 *
 * Runs in GitHub Actions (free) every 5 minutes. Discovers Indian developers
 * via GitHub Search API, fetches their repos, classifies each repo's domain
 * with Gemini, geocodes locations with Nominatim, and writes everything to
 * Firestore. The frontend's onSnapshot listener picks up changes in real time.
 *
 * Env vars (set as GitHub Actions secrets):
 *   GIT_TOKEN              - GitHub PAT (public_repo scope)
 *   GEMINI_API_KEY         - Google AI Studio API key
 *   FIREBASE_SERVICE_ACCOUNT - JSON key for a Firebase service account
 */

const admin = require("firebase-admin");

// ─── Init Firebase Admin with service account from env ─────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const GITHUB_TOKEN = process.env.GIT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── GitHub API helpers ────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `token ${GITHUB_TOKEN}`,
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
          await new Promise((r) => setTimeout(r, waitSec * 1000));
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
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
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

async function geocodeLocation(location) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": "DevAtlas/1.0" } });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error(`Geocode error for "${location}":`, err.message);
  }
  return null;
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

  const cityIndex = await getNextCityIndex();
  const city = INDIAN_CITIES[cityIndex];
  console.log(`Discovering developers in: ${city}`);

  // Phase 1: Discover Indian developers via GitHub Search API
  const searchResults = await ghFetch("/search/users", {
    q: `location:${city} sort:followers`,
    per_page: 30,
    page: 1,
  });

  if (!searchResults || !searchResults.items) {
    console.log(`No users found for ${city}`);
    await db.collection("stats").doc("latest").set({
      last_sync_at: admin.firestore.FieldValue.serverTimestamp(),
      city_processed: city,
      devs_discovered: 0,
    }, { merge: true });
    process.exit(0);
  }

  console.log(`Found ${searchResults.items.length} developers in ${city}`);

  for (const userSummary of searchResults.items) {
    const userData = await ghFetch(`/users/${userSummary.login}`);
    if (!userData || userData.type !== "User") continue;

    const location = userData.location || "";
    const isIndian = /\bindia\b|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|kerala|tamil nadu|karnataka|maharashtra|telangana|west bengal|gujarat|rajasthan|uttar pradesh|madhya pradesh/i.test(location);
    if (!isIndian) continue;

    devsDiscovered++;

    // Geocode the developer's location
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

    console.log(`  Dev: ${userData.login} (${location})`);

    // Phase 2: Fetch the developer's repos (top 10 most recently updated)
    const repos = await ghFetch(`/users/${userData.login}/repos`, {
      sort: "updated",
      per_page: 10,
      page: 1,
    });

    if (repos && Array.isArray(repos)) {
      for (const repoData of repos) {
        if (repoData.fork) continue; // Skip forks

        const repoRef = db.collection("repositories").doc(String(repoData.id));
        const existing = await repoRef.get();

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
        };

        // New repo: set coordinates immediately if we have them
        if (!existing.exists && coordinates) {
          repoDoc.coordinates = coordinates;
          repoDoc.raw_location = location;
          repoDoc.geocoded = true;
          repoDoc.geocoded_at = admin.firestore.FieldValue.serverTimestamp();
        } else if (existing.exists) {
          // Preserve existing coordinates/classification
          const existingData = existing.data();
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
        if (!existing.exists || !existing.data().domain) {
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
          }
        }

        await new Promise((r) => setTimeout(r, 100));
      }
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  // Phase 3: Sweep — classify and geocode backlog
  await sweepBacklog();

  // Update stats
  await db.collection("stats").doc("latest").set({
    last_sync_at: admin.firestore.FieldValue.serverTimestamp(),
    repos_synced: reposSynced,
    devs_discovered: devsDiscovered,
    city_processed: city,
    next_city: INDIAN_CITIES[(cityIndex + 1) % INDIAN_CITIES.length],
  }, { merge: true });

  console.log(`\nSync complete: city=${city}, devs=${devsDiscovered}, repos=${reposSynced}`);
  process.exit(0);
}

async function sweepBacklog() {
  // Classify unclassified repos
  const backlogSnap = await db.collection("repositories")
    .where("classified", "==", false)
    .limit(20)
    .get();

  const classifyPromises = [];
  backlogSnap.forEach((doc) => {
    const r = doc.data();
    classifyPromises.push(
      classifyWithGemini(r).then((domain) => {
        if (domain) {
          return doc.ref.update({
            domain: domain,
            classified: true,
            classification: {
              domain: domain,
              classified_at: admin.firestore.FieldValue.serverTimestamp(),
              model: "gemini-2.5-flash",
            },
          });
        }
      })
    );
  });
  await Promise.all(classifyPromises);

  // Geocode repos with location but no coordinates
  const unlocatedSnap = await db.collection("repositories")
    .where("geocoded", "==", false)
    .limit(20)
    .get();

  const geocodePromises = [];
  unlocatedSnap.forEach((doc) => {
    const r = doc.data();
    if (r.location) {
      geocodePromises.push(
        geocodeLocation(r.location).then((coords) => {
          if (coords) {
            return doc.ref.update({
              coordinates: new admin.firestore.GeoPoint(coords.lat, coords.lon),
              raw_location: r.location,
              geocoded: true,
              geocoded_at: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        })
      );
    }
  });
  await Promise.all(geocodePromises);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
