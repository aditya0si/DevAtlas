"use strict";

/**
 * DevAtlas — unit tests for scripts/firebase-sync/activity.js
 *
 * Run: node --test scripts/firebase-sync/activity.test.js
 * Uses only node:test + node:assert (no new dependencies).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeActivityScore,
  deriveActivityInputs,
  summarizeEcosystem,
  summarizeCoverage,
} = require("./activity");

const ECOSYSTEM_KEYS = [
  "total_repositories",
  "total_developers",
  "total_stars",
  "total_forks",
  "top_languages",
  "top_domains",
  "ai_repo_percentage",
  "generated_at",
  "version",
];

const COVERAGE_KEYS = [
  "users_total",
  "users_enriched",
  "users_with_location",
  "repos_total",
  "repos_with_location",
  "avg_geocoding_confidence",
  "generated_at",
  "version",
];

// ─── computeActivityScore ───────────────────────────────────────────────────

test("zero activity scores exactly 0", () => {
  const result = computeActivityScore({
    pushCount30d: 0,
    distinctActiveDays: 0,
    stars: 0,
    recencyDays: null,
  });
  assert.equal(result.activity_score, 0);
  assert.equal(result.push_count_30d, 0);
  assert.equal(result.activity_source, "github_events");
});

test("all-zero inputs (including recencyDays 0) still score 0", () => {
  assert.equal(
    computeActivityScore({ pushCount30d: 0, distinctActiveDays: 0, stars: 0, recencyDays: 0 }).activity_score,
    0
  );
});

test("missing / undefined / null inputs score 0", () => {
  for (const input of [undefined, null, {}, { pushCount30d: undefined }, "not-an-object", 42]) {
    const result = computeActivityScore(input);
    assert.equal(result.activity_score, 0, `input ${JSON.stringify(input)} should score 0`);
    assert.equal(result.push_count_30d, 0);
    assert.equal(result.activity_source, "github_events");
  }
});

test("negative, NaN and non-numeric inputs are ignored (never score below 0)", () => {
  const result = computeActivityScore({
    pushCount30d: -25,
    distinctActiveDays: NaN,
    stars: "1200",
    recencyDays: -3,
  });
  assert.equal(result.activity_score, 0);
  assert.equal(result.push_count_30d, 0);
});

test("a hot repository scores high", () => {
  const result = computeActivityScore({
    pushCount30d: 42,
    distinctActiveDays: 26,
    stars: 1800,
    recencyDays: 0,
  });
  assert.ok(result.activity_score >= 85, `expected a hot repo to score >= 85, got ${result.activity_score}`);
  assert.ok(result.activity_score <= 100);
  assert.equal(result.push_count_30d, 42);
  assert.equal(result.activity_source, "github_events");
});

test("the score is clamped to 100 even for absurd inputs", () => {
  const result = computeActivityScore({
    pushCount30d: 100000,
    distinctActiveDays: 100000,
    stars: 10 ** 9,
    recencyDays: 0,
  });
  assert.equal(result.activity_score, 100);
  assert.equal(computeActivityScore({ pushCount30d: 5000, distinctActiveDays: 3650, stars: 1e12, recencyDays: 0 }).activity_score, 100);
});

test("a dormant developer with stars but no recent pushes scores only on reach", () => {
  const result = computeActivityScore({
    pushCount30d: 0,
    distinctActiveDays: 0,
    stars: 1000,
    recencyDays: 90,
  });
  // reach term only: 20 * min(1, log10(1001)/3) ≈ 20
  assert.equal(result.activity_score, 20);
});

// ─── deriveActivityInputs ───────────────────────────────────────────────────

test("deriveActivityInputs counts pushes and distinct days in the last 30 days", () => {
  const now = Date.parse("2026-01-31T12:00:00Z");
  const events = [
    { type: "PushEvent", created_at: "2026-01-31T08:00:00Z" }, // today
    { type: "PushEvent", created_at: "2026-01-31T09:30:00Z" }, // same day
    { type: "PushEvent", created_at: "2026-01-20T10:00:00Z" }, // 11 days ago
    { type: "PushEvent", created_at: "2025-12-01T10:00:00Z" }, // 61 days ago (out of window)
    { type: "WatchEvent", created_at: "2026-01-25T10:00:00Z" }, // not a push
    { type: "ForkEvent", created_at: "2026-01-26T10:00:00Z" }, // not a push
  ];

  const inputs = deriveActivityInputs(events, now);
  assert.deepEqual(inputs, { pushCount30d: 3, distinctActiveDays: 2, recencyDays: 0 });
});

test("deriveActivityInputs ignores unparseable events and future timestamps", () => {
  const now = Date.parse("2026-01-31T12:00:00Z");
  const events = [
    { type: "PushEvent", created_at: "not-a-date" },
    { type: "PushEvent", created_at: "2026-02-05T00:00:00Z" }, // future (clock skew)
    { type: "PushEvent", created_at: "2026-01-11T12:00:00Z" }, // 20 days ago
  ];
  const inputs = deriveActivityInputs(events, now);
  assert.deepEqual(inputs, { pushCount30d: 1, distinctActiveDays: 1, recencyDays: 20 });
});

test("deriveActivityInputs returns zeros for a non-array payload", () => {
  for (const payload of [undefined, null, {}, "boom"]) {
    assert.deepEqual(deriveActivityInputs(payload, Date.now()), {
      pushCount30d: 0,
      distinctActiveDays: 0,
      recencyDays: null,
    });
  }
});

test("derived inputs feed computeActivityScore end to end", () => {
  const now = Date.parse("2026-01-31T12:00:00Z");
  const inputs = deriveActivityInputs(
    Array.from({ length: 40 }, (_, i) => ({
      type: "PushEvent",
      created_at: new Date(now - i * 12 * 3600 * 1000).toISOString(), // every 12h, 20 days
    })),
    now
  );
  const score = computeActivityScore({ ...inputs, stars: 500 });
  assert.ok(score.activity_score > 80, `expected an active developer to score high, got ${score.activity_score}`);
  assert.equal(score.push_count_30d, 40);
  assert.equal(score.activity_source, "github_events");
});

// ─── summarizeEcosystem (stats/ecosystem contract) ──────────────────────────

test("summarizeEcosystem returns exactly the frozen interface fields", () => {
  const doc = summarizeEcosystem([], [], "2026-01-31T00:00:00.000Z");
  assert.deepEqual(Object.keys(doc).sort(), [...ECOSYSTEM_KEYS].sort());
  assert.equal(doc.version, 1);
  assert.equal(doc.generated_at, "2026-01-31T00:00:00.000Z");
  // empty collections must not produce NaN / Infinity
  assert.equal(doc.total_repositories, 0);
  assert.equal(doc.ai_repo_percentage, 0);
  assert.deepEqual(doc.top_languages, []);
  assert.deepEqual(doc.top_domains, []);
});

test("summarizeEcosystem totals, top-10 and ai_repo_percentage", () => {
  const repos = [
    { language: "Python", domain: "ai", stars: 100, forks: 10 },
    { language: "Python", domain: "ai", stars: 50, forks: 5 },
    { language: "TypeScript", domain: "web", stars: 25, forks: 2 },
    { language: null, domain: null, stars: 0, forks: 0 },
  ];
  const doc = summarizeEcosystem(repos, [{}, {}], "2026-01-31T00:00:00.000Z");
  assert.equal(doc.total_repositories, 4);
  assert.equal(doc.total_developers, 2);
  assert.equal(doc.total_stars, 175);
  assert.equal(doc.total_forks, 17);
  assert.equal(doc.ai_repo_percentage, 50);
  assert.deepEqual(doc.top_languages, [
    { language: "Python", count: 2 },
    { language: "TypeScript", count: 1 },
  ]);
  assert.deepEqual(doc.top_domains, [
    { domain: "ai", count: 2 },
    { domain: "web", count: 1 },
  ]);
});

test("summarizeEcosystem truncates to the top 10 languages and sorts deterministically", () => {
  const repos = [];
  for (let i = 0; i < 9; i += 1) {
    // language i appears i+1 times, so the ranking of the top nine is fixed
    for (let repeat = 0; repeat <= i; repeat += 1) repos.push({ language: `lang-${i}`, domain: "web" });
  }
  // four labels tie at one repo each: alphabetical order must break the tie,
  // and only one of them fits into the tenth slot
  repos.push({ language: "zz-tie", domain: "web" });
  repos.push({ language: "mm-tie", domain: "web" });
  repos.push({ language: "aa-tie", domain: "web" });

  const doc = summarizeEcosystem(repos, [], "2026-01-31T00:00:00.000Z");
  assert.equal(doc.top_languages.length, 10);
  assert.deepEqual(doc.top_languages[0], { language: "lang-8", count: 9 });
  // counts 9..2 fill slots 0-7; the one-repo group starts at slot 8 and the
  // alphabetical tie-break must put "aa-tie" first and push the rest out
  assert.deepEqual(doc.top_languages[8], { language: "aa-tie", count: 1 });
  assert.deepEqual(doc.top_languages[9], { language: "lang-0", count: 1 });
  assert.ok(!doc.top_languages.some((row) => row.language === "zz-tie"));
  assert.ok(!doc.top_languages.some((row) => row.language === "mm-tie"));
  // no duplicates, ever
  assert.equal(new Set(doc.top_languages.map((row) => row.language)).size, 10);
});

// ─── summarizeCoverage (stats/coverage contract) ────────────────────────────

test("summarizeCoverage returns exactly the frozen interface fields", () => {
  const doc = summarizeCoverage([], [], "2026-01-31T00:00:00.000Z");
  assert.deepEqual(Object.keys(doc).sort(), [...COVERAGE_KEYS].sort());
  assert.equal(doc.version, 1);
  assert.equal(doc.avg_geocoding_confidence, 0);
});

test("summarizeCoverage counts locations, geocoded developers and confidence", () => {
  const repos = [
    { location: "Bangalore, India", geocoding_confidence: 0.9 },
    { location: "  ", geocoding_confidence: null },
    { location: "Pune, India", geocoding_confidence: 0.7 },
    { geocoding_confidence: 0.2 },
  ];
  const devs = [
    { location: "Bangalore, India", coordinates: { latitude: 12.9, longitude: 77.6 } },
    { location: "Pune, India", coordinates: null },
    { location: null },
  ];
  const doc = summarizeCoverage(repos, devs, "2026-01-31T00:00:00.000Z");
  assert.equal(doc.users_total, 3);
  assert.equal(doc.users_enriched, 1);
  assert.equal(doc.users_with_location, 2);
  assert.equal(doc.repos_total, 4);
  assert.equal(doc.repos_with_location, 2);
  // mean of the three numeric samples: (0.9 + 0.7 + 0.2) / 3 = 0.6
  assert.equal(doc.avg_geocoding_confidence, 0.6);
});

test("summarizeCoverage tolerates non-array input", () => {
  const doc = summarizeCoverage(undefined, null, "2026-01-31T00:00:00.000Z");
  assert.equal(doc.users_total, 0);
  assert.equal(doc.repos_total, 0);
  assert.equal(doc.avg_geocoding_confidence, 0);
});
