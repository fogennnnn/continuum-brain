/**
 * Hosted ContinuumBrain-v1 demo (overwrites the test-omni slot).
 * Mirrors the local `node src/demo.js --serve` API shape:
 *   GET /api/report — evaluation report ({ exists, report })
 *   GET /api/rules  — all signed rulesets keyed by filename
 *   GET /           — landing page (static asset)
 * No Durable Objects, no KV. Browsers run nothing here; all reasoning
 * happens in the deterministic engine whose outputs these endpoints quote.
 */
const RULE_FILES = [
  "client-comms.json",
  "client-onboarding.json",
  "decision-thaw.json",
  "expense-signoff.json",
  "hiring-approval.json",
  "process-currency.json",
  "seat-cover.json",
  "vendor-payment.json",
  "weekly-numbers.json",
];

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

async function rulesPayload(env, req) {
  const out = {};
  for (const f of RULE_FILES) {
    const res = await env.ASSETS.fetch(new URL(`/rules/${f}`, req.url));
    if (!res.ok) throw new Error(`missing bundled ruleset ${f}`);
    out[f] = await res.json();
  }
  return out;
}

async function reportPayload(env, req) {
  const res = await env.ASSETS.fetch(new URL("/EVALUATION-REPORT.md", req.url));
  const exists = res.ok;
  return { exists, report: exists ? await res.text() : null };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/rules" || url.pathname === "/api/report") {
      if (req.method !== "GET") {
        return new Response(JSON.stringify({ error: "method not allowed; use GET" }), { status: 405, headers: JSON_HEADERS });
      }
      try {
        const payload = url.pathname === "/api/rules" ? await rulesPayload(env, req) : await reportPayload(env, req);
        return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
      } catch (e) {
        return new Response(JSON.stringify({ error: `api failure: ${e?.message ?? e}` }), { status: 500, headers: JSON_HEADERS });
      }
    }
    return env.ASSETS.fetch(req);
  },
};
