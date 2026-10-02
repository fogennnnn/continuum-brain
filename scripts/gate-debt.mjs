/** gate:debt — injected debt blocks until repaid. */
import { clearLedger } from "../src/kernel/ledger.js";
import { loadGate } from "../src/kernel/loadgate.js";
import { readRulesInputs } from "./lib.mjs";
import { gatedEvaluate, seedContextAndResidual, resetBrain, rulesById } from "../src/brain.js";
import { scoreContext, flagMissing, markStale, repayDebt, clearContext, gateEvaluation } from "../src/debt.js";

let failures = 0;
const fail = (m) => { failures += 1; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`ok: ${m}`);

resetBrain();
clearContext();
const gate = loadGate(readRulesInputs(), {});
if (!gate.ok) { console.log(`FAIL: load gate: ${gate.error}`); process.exit(1); }
seedContextAndResidual(gate.live);
const fin = rulesById(gate.live, "SOP-FIN-01");
const goodReq = { action_id: "DEBT-PROBE", actor_id: "dept-head-01", amount: 100, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } };

// 1. Clean: debt 0, evaluation proceeds.
{
  const s = scoreContext();
  if (s.score !== 0) fail(`clean debt score ${s.score} != 0`);
  else pass("clean debt score is 0");
  const r = gatedEvaluate({ ...goodReq }, fin);
  if (r.status !== "AUTHORIZED") fail(`clean evaluation ${r.status} != AUTHORIZED`);
  else pass("clean evaluation AUTHORIZED");
}

// 2. Inject missing-context debt: gate blocks, evaluation hard-refuses.
flagMissing("PRESS-CALIBRATION", "press calibration undocumented");
{
  const s = scoreContext();
  if (!(s.score > 0)) fail("injected debt did not raise score");
  else pass(`injected debt score=${s.score.toFixed(3)}`);
  const g = gateEvaluation();
  if (g.ok) fail("gateEvaluation passed while indebted");
  else pass("gateEvaluation blocks while indebted");
  const r = gatedEvaluate({ ...goodReq, action_id: "DEBT-BLOCKED" }, fin);
  if (r.status !== "REFUSED" || r.refusal_details?.missing_premise_id !== "CONTEXT_DEBT") {
    fail(`indebted evaluation not CONTEXT_DEBT refusal (got ${r.status})`);
  } else pass("indebted evaluation hard-REFUSED at CONTEXT_DEBT");
}

// 3. Repay via prune: score returns to 0, evaluation proceeds.
{
  const res = repayDebt("prune", "PRESS-CALIBRATION");
  if (!res.ok) fail(`repay prune failed: ${res.reason}`);
  const s = scoreContext();
  if (s.score !== 0) fail(`post-repay debt score ${s.score} != 0`);
  else pass("post-prune debt score is 0");
  const r = gatedEvaluate({ ...goodReq, action_id: "DEBT-REPAID" }, fin);
  if (r.status !== "AUTHORIZED") fail(`post-repay evaluation ${r.status} != AUTHORIZED`);
  else pass("post-repay evaluation AUTHORIZED");
}

// 4. Stale + reanchor path.
{
  markStale("SOP-FIN-01:thresholds");
  const s = scoreContext();
  if (!(s.score > 0)) fail("stale injection did not raise score");
  else pass("stale injection raises score");
  const r1 = gatedEvaluate({ ...goodReq, action_id: "DEBT-STALE" }, fin);
  if (r1.status !== "REFUSED") fail("stale evaluation did not refuse");
  else pass("stale evaluation refused");
  repayDebt("reanchor", "SOP-FIN-01:thresholds");
  const s2 = scoreContext();
  // reanchor appends live confirmation; stale history remains but live cancels it:
  // score counts stale rows in history — must be handled: prune stale history too.
  repayDebt("prune", "SOP-FIN-01:thresholds");
  const s3 = scoreContext();
  if (s3.score !== 0) fail(`after reanchor+prune score ${s3.score} != 0 (stale=${s3.stale} dup=${s3.duplicated} missing=${s3.missing} live=${s3.live})`);
  else pass("reanchor+prune repays stale debt");
  void s2;
}

if (failures > 0) { console.log(`gate:debt FAILED (${failures})`); process.exit(1); }
console.log("gate:debt PASS");
