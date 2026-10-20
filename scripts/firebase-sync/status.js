"use strict";

/**
 * DevAtlas sync — exit-status helpers.
 *
 * Pure functions only: no I/O, no Firestore, no network, no environment reads.
 * `sync.js` uses these to turn a thrown error into one operator-readable line
 * and a named exit code; the tests import them directly.
 *
 * Why this exists: a failed GitHub discovery request used to be logged as
 * "No users found", which reads like an empty city. From now on every failure
 * carries a code from SYNC_ERROR_CODES and the process exits 1.
 *
 * Codes (the operator-facing contract; documented in README):
 *   github_auth            GitHub rejected the credentials (HTTP 401)
 *   github_rate_limited    a 403/429 whose reset is too far away to wait for
 *   github_network         the request never completed after 3 attempts
 *   github_http            any other non-200 answer on the discovery root
 *   firestore_precondition Firestore gRPC code 9 (e.g. a missing composite index)
 *   firestore_error        any other Firestore failure
 *   unknown                an error this worker does not recognise
 */

const SYNC_ERROR_CODES = [
  "github_auth",
  "github_rate_limited",
  "github_network",
  "github_http",
  "firestore_precondition",
  "firestore_error",
  "unknown",
];

/** Firestore's FAILED_PRECONDITION. A missing composite index surfaces as 9. */
const FIRESTORE_FAILED_PRECONDITION = 9;

/**
 * Classify any thrown value into the operator-facing exit contract.
 *
 * `SyncError` carries its code as a string; Firestore errors carry a numeric
 * gRPC status. Everything else is `unknown`. The exit code is always 1 —
 * there is no partial-success exit.
 */
function classifyFailure(err) {
  if (err && typeof err.code === "string" && SYNC_ERROR_CODES.includes(err.code)) {
    return { code: err.code, exitCode: 1 };
  }
  if (err && typeof err.code === "number") {
    return {
      code: err.code === FIRESTORE_FAILED_PRECONDITION ? "firestore_precondition" : "firestore_error",
      exitCode: 1,
    };
  }
  return { code: "unknown", exitCode: 1 };
}

const URL_PATTERN = /https?:\/\/[^\s)"']+/gi;
const CREDENTIAL_PATTERN = /\b(?:api[_-]?key|access[_-]?token|token|secret|password|authorization)=[^\s&,;"']+/gi;

/** Collapse anything to a single line so one failure is one log line. */
function oneLine(text) {
  return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
}

/** Remove literal secret values from a string (defence in depth, not parsing). */
function redactSecrets(text, secrets = []) {
  let out = String(text == null ? "" : text);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

/**
 * Make an upstream message safe to log or store: no URL (an index hint URL is
 * noisy and a Gemini URL carries ?key=), no `token=`-style assignment, and no
 * literal secret value.
 */
function safeDetail(message, secrets = []) {
  const flat = oneLine(message);
  const withoutUrls = flat.replace(URL_PATTERN, "[url]").replace(CREDENTIAL_PATTERN, "[redacted]");
  return redactSecrets(withoutUrls, secrets);
}

/**
 * One console line for a failed run. Never contains a URL, key or token.
 * The "Sync failed" prefix is kept from the previous worker so existing log
 * greps still match; the bracketed code is new.
 */
function formatFailureLine(code, err, secrets = []) {
  const safeCode = SYNC_ERROR_CODES.includes(code) ? code : "unknown";
  const raw = err && typeof err.message === "string" ? err.message : "";
  const detail = safeDetail(raw, secrets);
  return detail ? `Sync failed [${safeCode}]: ${detail}` : `Sync failed [${safeCode}]`;
}

module.exports = {
  SYNC_ERROR_CODES,
  FIRESTORE_FAILED_PRECONDITION,
  classifyFailure,
  formatFailureLine,
  redactSecrets,
};
