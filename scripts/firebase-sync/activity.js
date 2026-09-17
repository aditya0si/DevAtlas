"use strict";

/**
 * DevAtlas — activity scoring + aggregate summaries (S-12)
 * ========================================================
 * Pure, dependency-free helpers used by scripts/firebase-sync/sync.js.
 * No network, no Firestore, no I/O: everything here is deterministic and is
 * unit-tested with `node --test scripts/firebase-sync/activity.test.js`.
 *
 * ---------------------------------------------------------------------------
 * computeActivityScore(input)
 *   -> { activity_score, push_count_30d, activity_source }
 * ---------------------------------------------------------------------------
 * input (every field optional; missing / undefined / null / NaN / negative
 * contributors count as 0):
 *   pushCount30d       pushes (PushEvents) in the last 30 days
 *   distinctActiveDays distinct UTC days with >= 1 push, last 30 days
 *   stars              stars across the developer's known repos (reach proxy)
 *   recencyDays        whole days since the most recent push (null = unknown)
 *
 * Formula — the weights add up to 100, the result is clamped to [0, 100] and
 * rounded to one decimal:
 *   pushes   45 * min(1, pushCount30d / 30)        30 pushes in 30 days   => 45
 *   rhythm   25 * min(1, distinctActiveDays / 30)  a push on 30 days      => 25
 *   reach    20 * min(1, log10(stars + 1) / 3)     ~1000 stars            => 20
 *   recency  10 * max(0, 1 - recencyDays / 30)     pushed today           => 10
 *                                                  (only counted when there
 *                                                   is at least one recent
 *                                                   push; unknown recency
 *                                                   contributes 0)
 *
 * So an unknown or idle developer scores 0 — never a fabricated mid-range
 * number, which is the whole point of computing this server-side instead of
 * letting the browser estimate it from star counts.
 * `activity_source` is always "github_events": the score is derived from the
 * developer's public events.
 *
 * ---------------------------------------------------------------------------
 * summarizeEcosystem(repoRows, developerRows, generatedAt)
 * summarizeCoverage(repoRows, developerRows, generatedAt)
 * ---------------------------------------------------------------------------
 * Pure collection -> aggregate-document maths for the `stats/ecosystem` and
 * `stats/coverage` documents the frontend reads. sync.js does the Firestore
 * paging and hands the projected rows in here; the returned objects carry
 * exactly the fields of the frozen interface (plus { generated_at, version }).
 */

/**
 * Coerce to a usable, non-negative finite number (anything else counts as 0).
 * Strict on purpose: a garbage value must never inflate a score.
 */
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** True when a value is a finite number (including 0). */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Non-empty string check used for location / language / domain coverage. */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Score one developer's GitHub activity on a 0-100 scale.
 * See the module header for the documented formula.
 */
function computeActivityScore(input) {
  const src = input && typeof input === "object" ? input : {};

  const pushCount30d = Math.round(nonNegativeNumber(src.pushCount30d));
  const distinctActiveDays = Math.round(nonNegativeNumber(src.distinctActiveDays));
  const stars = Math.round(nonNegativeNumber(src.stars));

  const hasPushSignal = pushCount30d > 0 || distinctActiveDays > 0;
  const hasRecency = isFiniteNumber(src.recencyDays) && src.recencyDays >= 0;

  const pushScore = 45 * Math.min(1, pushCount30d / 30);
  const rhythmScore = 25 * Math.min(1, distinctActiveDays / 30);
  const reachScore = 20 * Math.min(1, Math.log10(stars + 1) / 3);
  const recencyScore = hasPushSignal && hasRecency
    ? 10 * Math.max(0, 1 - src.recencyDays / 30)
    : 0;

  const raw = pushScore + rhythmScore + reachScore + recencyScore;
  const clamped = Math.min(100, Math.max(0, raw));

  return {
    activity_score: Math.round(clamped * 10) / 10,
    push_count_30d: pushCount30d,
    activity_source: "github_events",
  };
}

/**
 * Derive computeActivityScore's inputs from GitHub's public events payload
 * (`GET /users/{login}/events/public?per_page=100`, up to 90 days of events).
 * pure: pass `nowMs` for deterministic tests.
 */
function deriveActivityInputs(events, nowMs = Date.now()) {
  const out = { pushCount30d: 0, distinctActiveDays: 0, recencyDays: null };
  if (!Array.isArray(events)) return out;

  const dayKeys = new Set();
  let latestPushMs = null;

  for (const event of events) {
    if (!event || event.type !== "PushEvent") continue;
    const pushedMs = Date.parse(event.created_at);
    if (!Number.isFinite(pushedMs)) continue;
    const ageDays = (nowMs - pushedMs) / 86400000;
    if (ageDays < 0) continue; // clock skew: ignore events "from the future"

    if (latestPushMs === null || pushedMs > latestPushMs) latestPushMs = pushedMs;
    if (ageDays <= 30) {
      out.pushCount30d += 1;
      dayKeys.add(new Date(pushedMs).toISOString().slice(0, 10)); // distinct UTC day
    }
  }

  out.distinctActiveDays = dayKeys.size;
  out.recencyDays = latestPushMs === null ? null : Math.floor((nowMs - latestPushMs) / 86400000);
  return out;
}

/** Deterministic ordering: count desc, then label asc (locale independent). */
function byCountThenLabel(a, b) {
  if (b[1] !== a[1]) return b[1] - a[1];
  return String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0;
}

/** Group rows by a text field, keeping only non-empty values. */
function countBy(rows, field) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const key = row[field];
    if (!hasText(key)) continue;
    const label = String(key);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return counts;
}

/** Top-N [{ <labelKey>: label, count }] from a Map of counts. */
function topEntries(counts, labelKey, limit = 10) {
  return [...counts.entries()]
    .sort(byCountThenLabel)
    .slice(0, limit)
    .map(([label, count]) => ({ [labelKey]: label, count }));
}

/**
 * Build the `stats/ecosystem` document body.
 * Contract: total_repositories, total_developers, total_stars, total_forks,
 * top_languages[{language,count}], top_domains[{domain,count}],
 * ai_repo_percentage, generated_at, version.
 */
function summarizeEcosystem(repoRows, developerRows, generatedAt = new Date().toISOString()) {
  const repos = Array.isArray(repoRows) ? repoRows.filter(Boolean) : [];
  const developers = Array.isArray(developerRows) ? developerRows.filter(Boolean) : [];

  let totalStars = 0;
  let totalForks = 0;
  for (const repo of repos) {
    totalStars += nonNegativeNumber(repo.stars);
    totalForks += nonNegativeNumber(repo.forks);
  }

  const languageCounts = countBy(repos, "language");
  const domainCounts = countBy(repos, "domain");
  const aiRepos = domainCounts.get("ai") || 0;

  return {
    total_repositories: repos.length,
    total_developers: developers.length,
    total_stars: totalStars,
    total_forks: totalForks,
    top_languages: topEntries(languageCounts, "language", 10),
    top_domains: topEntries(domainCounts, "domain", 10),
    ai_repo_percentage: repos.length > 0 ? Math.round((aiRepos / repos.length) * 1000) / 10 : 0,
    generated_at: generatedAt,
    version: 1,
  };
}

/**
 * Build the `stats/coverage` document body.
 * Contract: users_total, users_enriched, users_with_location, repos_total,
 * repos_with_location, avg_geocoding_confidence, generated_at, version.
 *
 * Definitions (the Firestore dataset has no `enrichment_status` column, so the
 * available server-side proxies are used and named after what they measure):
 *   users_with_location / repos_with_location — non-empty `location` string
 *   users_enriched                            — developer document that was
 *                                               geocoded (has `coordinates`),
 *                                               i.e. enriched enough to appear
 *                                               on the map
 *   avg_geocoding_confidence                  — mean of the numeric
 *                                               `geocoding_confidence` field
 *                                               over the documents that carry
 *                                               one, 0 when nothing does (this
 *                                               worker does not invent a
 *                                               confidence value)
 */
function summarizeCoverage(repoRows, developerRows, generatedAt = new Date().toISOString()) {
  const repos = Array.isArray(repoRows) ? repoRows.filter(Boolean) : [];
  const developers = Array.isArray(developerRows) ? developerRows.filter(Boolean) : [];

  let confidenceSum = 0;
  let confidenceSamples = 0;

  for (const repo of repos) {
    const confidence = repo.geocoding_confidence;
    if (isFiniteNumber(confidence)) {
      confidenceSum += confidence;
      confidenceSamples += 1;
    }
  }

  return {
    users_total: developers.length,
    users_enriched: developers.filter((dev) => dev.coordinates != null).length,
    users_with_location: developers.filter((dev) => hasText(dev.location)).length,
    repos_total: repos.length,
    repos_with_location: repos.filter((repo) => hasText(repo.location)).length,
    avg_geocoding_confidence:
      confidenceSamples > 0 ? Math.round((confidenceSum / confidenceSamples) * 100) / 100 : 0,
    generated_at: generatedAt,
    version: 1,
  };
}

module.exports = {
  computeActivityScore,
  deriveActivityInputs,
  summarizeEcosystem,
  summarizeCoverage,
};
