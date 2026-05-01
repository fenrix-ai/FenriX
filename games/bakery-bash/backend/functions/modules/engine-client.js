/**
 * engine-client.js
 *
 * Thin HTTP client for the Bakery Bash simulation engine (huginX), running
 * as a Cloud Run service. This module is pure transport — it does NOT know
 * about Firestore document shapes or how to translate them. The mapping
 * layer is in `process-round-engine-stub.js` at the functions/ root.
 *
 * Authentication
 *   Cloud Run IAM via google-auth-library. The Cloud Function service
 *   account must be granted roles/run.invoker on the engine service. No
 *   API keys.
 *
 * Configuration
 *   process.env.HUGINX_URL    base URL, e.g. https://huginx-mock-aaerm3z5oq-uc.a.run.app
 *   process.env.HUGINX_TIMEOUT_MS  optional, default 8000
 *
 * Request ID propagation
 *   Pass requestId through opts to stamp the engine's server-side logs
 *   with your trace ID. The engine returns it in the X-Request-ID header
 *   AND embedded in error response bodies. See docs/engine-api.md.
 *
 * Retry policy
 *   simulateRound() retries once on 5xx. 4xx errors are NOT retried —
 *   they're caller bugs. Network errors propagate as thrown Error.
 *
 * Pure-ish: depends on google-auth-library and global fetch (Node 18+)
 * but no Firebase. Safe to unit-test with a mock auth client.
 */

"use strict";

const { GoogleAuth } = require("google-auth-library");

const DEFAULT_TIMEOUT_MS = 8000;
let _client = null;

/**
 * Lazy-init the Google ID-token client. Cached across warm invocations
 * so we don't re-auth on every call (saves ~50-200ms per cold-warm
 * boundary).
 */
async function getClient() {
  if (_client) return _client;
  const url = process.env.HUGINX_URL;
  if (!url) {
    throw new Error("HUGINX_URL env var is not set");
  }
  const auth = new GoogleAuth();
  _client = await auth.getIdTokenClient(url);
  return _client;
}

/**
 * Low-level engine call. Returns { status, body, requestId, durationMs }.
 * Does NOT throw on 4xx/5xx — caller decides retry / surface policy.
 *
 * @param {"GET"|"POST"} method
 * @param {string} path           e.g. "/v1/simulate-round"
 * @param {object} [body]         JSON body for POST
 * @param {object} [opts]
 * @param {string} [opts.requestId]   X-Request-ID propagation
 * @param {number} [opts.timeoutMs]   override DEFAULT_TIMEOUT_MS
 */
async function call(method, path, body, opts = {}) {
  const url = process.env.HUGINX_URL;
  if (!url) throw new Error("HUGINX_URL env var is not set");

  const timeoutMs = opts.timeoutMs ?? Number(process.env.HUGINX_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;
  const headers = { "Content-Type": "application/json" };
  if (opts.requestId) headers["X-Request-ID"] = opts.requestId;

  const client = await getClient();
  const started = Date.now();

  try {
    const res = await client.request({
      url: `${url}${path}`,
      method,
      headers,
      data: body,
      timeout: timeoutMs,
      validateStatus: () => true,
      responseType: "json",
    });
    return {
      status: res.status,
      body: res.data,
      requestId: res.headers && (res.headers["x-request-id"] || res.headers["X-Request-ID"]),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    // Network / timeout errors arrive here. Surface enough context to
    // debug without leaking the full underlying stack to callers.
    err.engineDurationMs = Date.now() - started;
    err.engineRequestId = opts.requestId;
    err.enginePath = path;
    throw err;
  }
}

/**
 * GET /v1/health — service liveness + version.
 */
async function health(opts = {}) {
  return call("GET", "/v1/health", null, opts);
}

/**
 * POST /v1/simulate-round — process one round of decisions.
 *
 * Retries ONCE on 5xx (per FenriX integration contract: Cloud Function
 * retries once after 3s, then surfaces engine_error to the UI). 4xx is
 * not retried — that's a caller bug, retrying won't change the outcome.
 *
 * @param {object} payload  SimulateRoundRequest per docs/engine-api.md
 * @param {object} [opts]   { requestId, timeoutMs }
 * @returns {Promise<{status, body, requestId, durationMs, attempts}>}
 */
async function simulateRound(payload, opts = {}) {
  let attempt = 1;
  let res = await call("POST", "/v1/simulate-round", payload, opts);
  if (res.status >= 500) {
    attempt = 2;
    res = await call("POST", "/v1/simulate-round", payload, opts);
  }
  return { ...res, attempts: attempt };
}

/**
 * POST /v1/generate-dataset — produce the pre-game training CSV.
 * Not retried (deterministic by seed; if it 500s once, it'll 500 again).
 */
async function generateDataset(payload, opts = {}) {
  return call("POST", "/v1/generate-dataset", payload, opts);
}

/**
 * Force a fresh auth client on next call. Use after the underlying
 * service-account credential rotates (rare; mostly for tests).
 */
function resetClient() {
  _client = null;
}

module.exports = {
  health,
  simulateRound,
  generateDataset,
  resetClient,
};
