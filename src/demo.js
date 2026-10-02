/**
 * ContinuumBrain-v1 extended public demo.
 * Existing surfaces (A/B/C1/C2 + succession) plus progressive-damage cases.
 * Run: npm run demo | node src/demo.js --serve (holds HTTP on PORT).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRulesets, seedContextAndResidual, gatedEvaluate, rulesById } from "./brain.js";
import { getEntries, verifyChain } from "./kernel/ledger.js";
import { verifyRulesetIntegrity } from "./kernel/integrity.js";
import { buildCone, damageStep, recover, identityMetrics, historyHashes, stats } from "./cone.js";
import { scoreContext, flagMissing, repayDebt, clearContext } from "./debt.js";
import { residual, verifyResidualChain } from "./residual.js";
import { getState } from "./modulators.js";
import { clearLedger } from "./kernel/ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const line = (s = "") => console.log(s);
const title = (s) => { line(""); line(`== ${s} ==`); };

function showResult(name, r) {
  line(`--- ${name} ---`);
  line(`STATUS: ${r.status}`);
  line(`rule hash: ${r.rule_version_hash}`);
  if (r.status === "AUTHORIZED") {
    line("derivation:");
    for (const d of r.derivation) line(`  ${d}`);
  } else if (r.status === "REFUSED") {
    line(`Violated Premise: ${r.refusal_details.missing_premise_id}`);
    line(`Reason: ${r.refusal_details.reason}`);
    line(`Issue: ${r.refusal_details.policy_issue.id} — ${r.refusal_details.policy_issue.title}`);
  } else {
    line(`Conflict premise: ${r.escalation_details.unsatisfied_premise_id}`);
    line(`Signed without approval: ${r.escalation_details.conflicting_signature_label ?? r.escalation_details.conflicting_signature}`);
    line(`Issue: ${r.escalation_details.policy_issue.id} — ${r.escalation_details.policy_issue.title}`);
  }
  if (r.provenance) line(`provenance: ${r.provenance.map((p) => `${p.premise}=${p.tag}`).join(", ")}`);
}

export function runDemo() {
  clearLedger();
  clearContext();
  const gate = loadRulesets();
  if (!gate.ok) {
    line(`[startup refused] ${gate.error}`);
    process.exitCode = 1;
    return { ok: false };
  }
  seedContextAndResidual(gate.live);
  const fin = rulesById(gate.live, "SOP-FIN-01");
  const onb = rulesById(gate.live, "SOP-ONB-01");

  line("==================================================");
  line("  CONTINUUMBRAIN-v1 | EXTENDED PUBLIC DEMO");
  line("==================================================");
  line(`live areas: ${gate.live.map((p) => p.rules.sop_id).join(", ")}`);
  line(`modulators: ${JSON.stringify(getState())}`);

  title("Scenario A: standard expense ($7,500 — AUTHORIZED)");
  showResult("A", gatedEvaluate({
    action_id: "DEMO-A", action_type: "execute-payout", actor_id: "dept-head-01",
    amount: 7500, currency: "USD", vendor: "Acme Supplies",
    signatures: { dept_head: true, ceo: false, finance: true },
  }, fin));

  title("Scenario B: $25,000 without CEO and without finance (REFUSED)");
  showResult("B", gatedEvaluate({
    action_id: "DEMO-B", action_type: "execute-payout", actor_id: "dept-head-01",
    amount: 25000, currency: "USD", vendor: "Acme Supplies",
    signatures: { dept_head: true, ceo: false, finance: false },
  }, fin));

  title("Scenario B2: $25,000 finance-signed without owner override (ESCALATED)");
  showResult("B2", gatedEvaluate({
    action_id: "DEMO-B2", action_type: "execute-payout", actor_id: "dept-head-01",
    amount: 25000, currency: "USD", vendor: "Acme Supplies",
    signatures: { dept_head: true, ceo: false, finance: true },
  }, fin));

  title("Scenario C1: uncovered currency EUR (REFUSED, silence is not consent)");
  showResult("C1", gatedEvaluate({
    action_id: "DEMO-C1", action_type: "execute-payout", actor_id: "dept-head-01",
    amount: 4200, currency: "EUR", vendor: "Northwind Traders",
    signatures: { dept_head: true, ceo: false, finance: false },
  }, fin));

  title("Scenario C2: change attempt — superseded draft widens limit (REFUSED RULESET_INTEGRITY)");
  const altered = JSON.parse(JSON.stringify(fin));
  altered.threshold = 999999;
  const chk = verifyRulesetIntegrity(altered);
  line(`stored: ${altered.version.version_hash}`);
  line(`recomputed: sha256:${chk.recomputed}`);
  line(`integrity ok: ${chk.ok} (expected false — tamper refused, real files untouched)`);

  title("Succession surfaces (owner handover keeps running)");
  if (onb) {
    showResult("ONB-01 clean intake (AUTHORIZED)", gatedEvaluate({
      action_id: "DEMO-ONB-01", actor_id: "maya-ops",
      client_name: "Blue Lantern Co.", identity_status: "verified", credit_status: "pass",
      sanctions_status: "clear", prior_rejection: false,
      signatures: { approver: true, onboarding: true },
    }, onb));
  }
  const hire = rulesById(gate.live, "SOP-HIRE-01");
  if (hire) {
    showResult("HIRE-01 renewal without re-approval (REFUSED)", gatedEvaluate({
      action_id: "DEMO-HIRE-01", actor_id: "maya-ops",
      candidate_name: "Sam Reyes", role_type: "contractor", compensation: 60000,
      offer_date: "2026-06-15", is_renewal: true,
      signatures: { hiring_manager: true, director: false, reapprover: false, hr: true },
    }, hire));
  }

  title("Progressive-damage cases (Cone substrate, seeded schedule)");
  buildCone(1337);
  line(`baseline: ${JSON.stringify(stats())}`);
  const pre = historyHashes();
  for (const phase of [1, 2, 3]) {
    damageStep(phase);
    const m = identityMetrics(pre);
    line(`after phase ${phase}: ${JSON.stringify(stats())} identity=${JSON.stringify(m)}`);
    const probe = gatedEvaluate({
      action_id: `DEMO-DMG-P${phase}`, action_type: "execute-payout", actor_id: "dept-head-01",
      amount: 25000, currency: "USD", vendor: "Acme Supplies",
      signatures: { dept_head: true, ceo: false, finance: false },
    }, fin);
    line(`  probe under damage: STATUS=${probe.status} (refuse path holds: ${probe.status !== "AUTHORIZED"})`);
  }
  const rec = recover();
  const mRec = identityMetrics(pre);
  line(`recovered: relinked=${rec.relinked} identity=${JSON.stringify(mRec)}`);

  title("Context-debt surface (debt blocks until repaid)");
  flagMissing("DEMO:WHY-press-calibration", "press calibration lives in one head; no document");
  const d = scoreContext();
  line(`debt after injection: ${JSON.stringify(d)}`);
  const blocked = gatedEvaluate({
    action_id: "DEMO-DEBT", action_type: "execute-payout", actor_id: "dept-head-01",
    amount: 100, currency: "USD", vendor: "Acme Supplies",
    signatures: { dept_head: true, ceo: false, finance: true },
  }, fin);
  line(`gated while indebted: STATUS=${blocked.status} premise=${blocked.refusal_details?.missing_premise_id}`);
  repayDebt("prune", "DEMO:WHY-press-calibration");
  const d2 = scoreContext();
  line(`debt after repay: ${JSON.stringify(d2)}`);

  title("Ledger + residual");
  const chain = verifyChain();
  const res = verifyResidualChain();
  line(`audit chain: ok=${chain.ok} entries=${chain.checked} tip=${getEntries().at(-1)?.hash.slice(0, 16) ?? "-"}`);
  line(`residual chain: ok=${res.ok} checked=${res.checked} tip=${residual.hash().slice(0, 16)}`);
  line("");
  line("demo complete: allow + refusal + escalation + tamper-refusal + succession + damage + debt.");
  return { ok: true };
}

const serve = process.argv.includes("--serve");
if (process.argv[1] && String(process.argv[1]).endsWith("demo.js")) {
  runDemo();
  if (serve) {
    const port = Number(process.env.PORT ?? 8082);
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/report" || url.pathname === "/api/rules") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        try {
          if (url.pathname === "/api/rules") {
            const dir = path.join(root, "src", "rules");
            const out = {};
            for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) out[f] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
            res.end(JSON.stringify(out));
          } else {
            const p = path.join(root, "EVALUATION-REPORT.md");
            res.end(JSON.stringify({ exists: fs.existsSync(p), report: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null }));
          }
        } catch (e) { res.end(JSON.stringify({ error: String(e?.message ?? e) })); }
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("continuumbrain-v1 demo. GET /api/report, /api/rules. Terminal run: npm run demo\n");
    });
    server.listen(port, () => console.log(`continuumbrain demo serving: http://localhost:${port}/`));
  }
}
