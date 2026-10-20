"use strict";

/**
 * DevAtlas — tests for the truthful sync exit contract.
 *
 * Run: node --test scripts/firebase-sync/status.test.js
 *      node --test scripts/firebase-sync/activity.test.js scripts/firebase-sync/status.test.js
 *
 * Everything here is deterministic and offline: the GitHub API is a queued fake,
 * the clock is fake (so the rate-limit wait costs 0 ms), Firestore is a fake
 * document store that records writes, and the credential is a sentinel that must
 * never appear in output or in a written document.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

// The sentinel is installed BEFORE sync.js is required: it stands in for GIT_TOKEN.
const SENTINEL = "TEST_GIT_TOKEN_SENTINEL_9f9e535d";
const GEMINI_SENTINEL = "TEST_GEMINI_KEY_SENTINEL_9f9e535d";
process.env.GIT_TOKEN = SENTINEL;
process.env.GEMINI_API_KEY = GEMINI_SENTINEL;
delete process.env.FIREBASE_SERVICE_ACCOUNT;

const sync = require("./sync");
const {
  SYNC_ERROR_CODES,
  classifyFailure,
  formatFailureLine,
  redactSecrets,
} = require("./status");

// ─── Fakes ─────────────────────────────────────────────────────────────────

function fakeHeaders(headers = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = String(value);
  return { get: (name) => (name.toLowerCase() in lower ? lower[name.toLowerCase()] : null) };
}

function response(status, body = {}, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: fakeHeaders(headers),
    json: async () => body,
  };
}

/** A fake clock: sleeps are recorded and advance time instead of waiting. */
function fakeClock(start = 1700000000000) {
  let now = start;
  const sleeps = [];
  return {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

/** A queued fake GitHub: each call shifts the next response or throws an Error. */
function queuedFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), headers: init && init.headers });
    if (responses.length === 0) {
      throw new Error(`unexpected extra GitHub request: ${String(url)}`);
    }
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

function emptySnapshot() {
  return { docs: [], size: 0, empty: true };
}

class FakeQuery {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  select() { return this; }
  startAfter() { return this; }
  async get() {
    if (this.db.failCollectionGet && this.db.failCollectionGet.collection === this.name) {
      throw this.db.failCollectionGet.error;
    }
    return emptySnapshot();
  }
}

class FakeDoc {
  constructor(db, name, id) {
    this.db = db;
    this.path = `${name}/${id}`;
  }
  async get() {
    return { exists: false, data: () => undefined };
  }
  async set(data, options) {
    this.db.writes.push({ path: this.path, data, options });
  }
  async update(data, options) {
    this.db.writes.push({ path: this.path, data, options: options || { update: true } });
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }
  doc(id) { return new FakeDoc(this.db, this.name, id); }
  where() { return new FakeQuery(this.db, this.name); }
  orderBy() { return new FakeQuery(this.db, this.name); }
  limit() { return new FakeQuery(this.db, this.name); }
  select() { return new FakeQuery(this.db, this.name); }
  startAfter() { return new FakeQuery(this.db, this.name); }
  get() { return new FakeQuery(this.db, this.name).get(); }
}

/** Records every write so tests can assert exactly what reached Firestore. */
class FakeDb {
  constructor({ failCollectionGet = null } = {}) {
    this.writes = [];
    this.failCollectionGet = failCollectionGet;
  }
  collection(name) { return new FakeCollection(this, name); }
  batch() {
    return { update: () => {}, commit: async () => {} };
  }
}

async function withCapturedConsole(fn) {
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  const record = (...args) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" "));
  };
  console.log = record;
  console.warn = record;
  console.error = record;
  try {
    const value = await fn();
    return { value, lines };
  } finally {
    Object.assign(console, saved);
  }
}

const writesTo = (db, path) => db.writes.filter((write) => write.path === path);

/** The exact `stats/latest` key set at baseline a14c2ae — no new fields. */
const STATS_LATEST_KEYS = [
  "activity_scored",
  "activity_skipped",
  "city_processed",
  "devs_discovered",
  "last_sync_at",
  "legacy_counter_patches",
  "next_city",
  "repos_synced",
  "stats_generated_at",
  "sweep_classified",
  "sweep_failed",
  "sweep_geocoded",
].sort();

// ─── status.js: pure classification ────────────────────────────────────────

test("classifyFailure maps the SyncError codes to exit 1", () => {
  for (const code of SYNC_ERROR_CODES) {
    assert.deepEqual(classifyFailure({ code }), { code, exitCode: 1 });
  }
  assert.deepEqual(classifyFailure(new sync.SyncError("github_auth", "nope")), {
    code: "github_auth",
    exitCode: 1,
  });
});

test("classifyFailure maps Firestore gRPC 9 to firestore_precondition", () => {
  const err = Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index."), { code: 9 });
  assert.deepEqual(classifyFailure(err), { code: "firestore_precondition", exitCode: 1 });
  assert.deepEqual(classifyFailure(Object.assign(new Error("boom"), { code: 5 })), {
    code: "firestore_error",
    exitCode: 1,
  });
  assert.deepEqual(classifyFailure(new Error("something else")), { code: "unknown", exitCode: 1 });
  assert.deepEqual(classifyFailure(null), { code: "unknown", exitCode: 1 });
});

test("formatFailureLine is one line with no URL and no credential", () => {
  const err = new Error(
    "index needed: https://console.firebase.google.com/project/x/indexes?create_composite=abc\n" +
    "Authorization=Bearer secret-value-123456"
  );
  const line = formatFailureLine("firestore_precondition", err, ["secret-value-123456"]);
  assert.equal(line.includes("\n"), false);
  assert.equal(line.includes("https://"), false);
  assert.equal(line.includes("secret-value-123456"), false, "a known secret value is removed");
  assert.match(line, /^Sync failed \[firestore_precondition\]: /);
});

test("formatFailureLine clamps an unknown code and keeps the log prefix", () => {
  assert.equal(formatFailureLine("github_forbidden", new Error("x")), "Sync failed [unknown]: x");
  assert.equal(formatFailureLine("github_auth", new Error("")), "Sync failed [github_auth]");
});

test("redactSecrets removes literal secret values", () => {
  assert.equal(redactSecrets(`token=${SENTINEL}`, [SENTINEL]), "token=[redacted]");
  assert.equal(redactSecrets("short", ["abc"]), "short", "values under 8 chars are not touched");
});

test("github_forbidden is not part of the exit contract", () => {
  assert.equal(SYNC_ERROR_CODES.includes("github_forbidden"), false);
  assert.deepEqual(
    [...SYNC_ERROR_CODES].sort(),
    ["firestore_error", "firestore_precondition", "github_auth", "github_http", "github_network", "github_rate_limited", "unknown"]
  );
});

// ─── F2: the 401 that used to look like an empty city ──────────────────────

test("F2: a 401 on the discovery root rejects with SyncError github_auth", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(401, {}, { "x-ratelimit-remaining": "59" })]);
  const db = new FakeDb();

  const err = await withCapturedConsole(() => sync.main({ db, io }).then(
    () => null,
    (thrown) => thrown
  ));

  assert.ok(err.value instanceof sync.SyncError, "main() must reject with a SyncError");
  assert.equal(err.value.code, "github_auth");
  assert.equal(classifyFailure(err.value).exitCode, 1);
  assert.equal(
    err.lines.some((line) => line.includes("No users found")),
    false,
    "an auth failure must never be reported as an empty city"
  );
});

test("F2: runCli exits 1, prints one coded line, and never stamps stats/latest", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(401, {}, { "x-ratelimit-remaining": "59" })]);
  const db = new FakeDb();

  const { value, lines } = await withCapturedConsole(() => sync.runCli({ db, io }));

  assert.equal(value, 1);
  assert.equal(writesTo(db, "stats/latest").length, 0, "a failed run must not stamp stats/latest");
  assert.equal(writesTo(db, "stats/sync-pointer").length, 1, "the pre-existing pointer rotation is unchanged");
  assert.equal(
    lines.filter((line) => line.startsWith("Sync failed")).length,
    1,
    "exactly one failure line"
  );
  assert.ok(lines.some((line) => line.includes("Sync failed [github_auth]")));
  assert.equal(lines.join("\n").includes(SENTINEL), false);
});

// ─── F3: a genuinely empty city is not a failure ───────────────────────────

test("F3: a 200 with no items is not an error and still stamps the success run", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(200, { total_count: 0, items: [] })]);
  const db = new FakeDb();

  const { value, lines } = await withCapturedConsole(() => sync.runCli({ db, io }));

  assert.equal(value, 0);
  assert.ok(lines.some((line) => line.startsWith("No users found for ")));
  assert.equal(lines.some((line) => line.startsWith("Sync failed")), false);

  const latest = writesTo(db, "stats/latest");
  assert.equal(latest.length, 1);
  assert.equal(latest[0].data.devs_discovered, 0);
  assert.equal(latest[0].data.repos_synced, 0);
  assert.ok("last_sync_at" in latest[0].data, "the success stamp is written");
});

test("F3: stats/latest keeps its baseline key set (no schema change)", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(200, { items: [] })]);
  const db = new FakeDb();

  await withCapturedConsole(() => sync.runCli({ db, io }));

  const [latest] = writesTo(db, "stats/latest");
  assert.deepEqual(Object.keys(latest.data).sort(), STATS_LATEST_KEYS);
  assert.deepEqual(latest.options, { merge: true });
});

// ─── F4: Firestore FAILED_PRECONDITION (missing index) ─────────────────────

test("F4: Firestore code 9 yields firestore_precondition, exit 1, no success stamp", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(200, { items: [] })]);
  const db = new FakeDb({
    failCollectionGet: {
      collection: "repositories",
      error: Object.assign(
        new Error("9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/x?key=abc"),
        { code: 9 }
      ),
    },
  });

  const { value, lines } = await withCapturedConsole(() => sync.runCli({ db, io }));

  assert.equal(value, 1);
  assert.ok(lines.some((line) => line.includes("Sync failed [firestore_precondition]")));
  assert.equal(lines.join("\n").includes("https://"), false, "no URL in the operator line");
  assert.equal(writesTo(db, "stats/latest").length, 0, "a failed run must not stamp success");
  assert.equal(writesTo(db, "stats/sync-pointer").length, 1);
});

// ─── F5: rate limits — short waits keep retrying, long waits fail fast ─────

test("F5: a long rate-limit reset fails immediately with github_rate_limited", async () => {
  const io = fakeClock();
  const resetAt = Math.floor(io.now() / 1000) + 300;
  io.fetch = queuedFetch([
    response(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) }),
  ]);

  const err = await withCapturedConsole(() => sync.ghGetRequired("/search/users", {}, io).then(
    () => null,
    (thrown) => thrown
  ));

  assert.ok(err.value instanceof sync.SyncError);
  assert.equal(err.value.code, "github_rate_limited");
  assert.deepEqual(io.sleeps, [], "a 300 s reset must not be waited out");
});

test("F5: a short 429 still waits with the fake clock and retries", async () => {
  const io = fakeClock();
  const resetAt = Math.floor(io.now() / 1000) + 10;
  io.fetch = queuedFetch([
    response(429, {}, { "x-ratelimit-reset": String(resetAt) }),
    response(200, { items: [{ login: "octocat" }] }),
  ]);

  const { value: body, lines } = await withCapturedConsole(() =>
    sync.ghGetRequired("/search/users", {}, io)
  );

  assert.deepEqual(body, { items: [{ login: "octocat" }] });
  assert.deepEqual(io.sleeps, [10000], "waited exactly the reset delta");
  assert.ok(lines.some((line) => line.startsWith("Rate limited, waiting 10s")));
});

test("F2: a 401 with a zero remaining header is still github_auth, never a wait", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([
    response(401, {}, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(io.now() / 1000) + 5),
    }),
  ]);

  const err = await withCapturedConsole(() => sync.ghGetRequired("/search/users", {}, io).then(
    () => null,
    (thrown) => thrown
  ));

  assert.equal(err.value.code, "github_auth");
  assert.deepEqual(io.sleeps, [], "bad credentials are never waited out");
});

// ─── F6: the sentinel never escapes ───────────────────────────────────────

test("F6: a network error that echoes the token never logs or writes it", async () => {
  const io = fakeClock();
  const leaky = new Error(`connect failed while sending Authorization: Bearer ${SENTINEL}`);
  io.fetch = queuedFetch([leaky, leaky, leaky]);
  const db = new FakeDb();

  const { value, lines } = await withCapturedConsole(() => sync.runCli({ db, io }));

  assert.equal(value, 1);
  assert.ok(lines.some((line) => line.includes("Sync failed [github_network]")));
  assert.equal(lines.join("\n").includes(SENTINEL), false, "the token must not reach the log");
  assert.equal(JSON.stringify(db.writes).includes(SENTINEL), false);
  assert.deepEqual(io.sleeps, [2000, 2000], "the existing network retry spacing is preserved");
});

// ─── Leaf calls: unchanged ─────────────────────────────────────────────────

test("leaf calls still return null on failure and the body on 200", async () => {
  const io = fakeClock();
  io.fetch = queuedFetch([response(401, {}, { "x-ratelimit-remaining": "59" })]);
  const { value: onFailure, lines } = await withCapturedConsole(() =>
    sync.ghFetch("/users/someone", {}, io)
  );
  assert.equal(onFailure, null, "a leaf failure is skipped, as before");
  assert.deepEqual(lines, ["GitHub API 401 for /users/someone"], "the pre-existing warning is unchanged");

  const io2 = fakeClock();
  io2.fetch = queuedFetch([response(404, {})]);
  const { value: on404, lines: notFoundLines } = await withCapturedConsole(() =>
    sync.ghFetch("/users/missing", {}, io2)
  );
  assert.equal(on404, null);
  assert.deepEqual(notFoundLines, [], "404 stays silent, as before");

  const io3 = fakeClock();
  io3.fetch = queuedFetch([response(200, { login: "someone" })]);
  assert.deepEqual(await sync.ghFetch("/users/someone", {}, io3), { login: "someone" });
});

// ─── F7: importing the worker has no side effects ──────────────────────────

test("F7: requiring sync.js touches no credentials, network or Firestore", () => {
  const script = `
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      throw new Error("network disabled by the import-safety check");
    };
    const sync = require(process.cwd() + "/sync.js");
    const admin = require("firebase-admin");
    process.stdout.write(JSON.stringify({
      fetchCalls,
      apps: admin.apps.length,
      main: typeof sync.main,
      runCli: typeof sync.runCli,
    }));
  `;
  const output = execFileSync(process.execPath, ["-e", script], {
    cwd: __dirname,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TOKEN: SENTINEL,
      FIREBASE_SERVICE_ACCOUNT: "not-json", // must not be parsed at import time
    },
  });
  assert.deepEqual(JSON.parse(output), {
    fetchCalls: 0,
    apps: 0,
    main: "function",
    runCli: "function",
  });
});

test("getDb only fails when it is actually used", () => {
  assert.throws(() => sync.getDb(), /FIREBASE_SERVICE_ACCOUNT is not set/);
});
