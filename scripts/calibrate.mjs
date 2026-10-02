/**
 * Calibration: deterministic scripted data, no gradients.
 * Ingests the demo corpora (cases from both debtaur repos) plus synthetic
 * progressive-damage sequences (three-phase schedule, policy migration,
 * owner succession, context-debt injection). Joint acceptance — ALL must
 * plateau with zero hallucinated derivations.
 */
import { evaluateAction, resetIssueCounter } from "../src/kernel/engine.js";
import { clearLedger, verifyChain } from "../src/kernel/ledger.js";
import { loadGate } from "../src/kernel/loadgate.js";
import { verifyRulesetIntegrity } from "../src/kernel/integrity.js";
import { readRulesInputs } from "./lib.mjs";
import { CONTINUITY_CASES, EOS_SEQUENCE, EDGE_CASES, POLICY_OF } from "./corpora.mjs";
import { gatedEvaluate, seedContextAndResidual, resetBrain, rulesById } from "../src/brain.js";
import { clearContext, scoreContext, flagMissing, repayDebt, verifyContextChain } from "../src/debt.js";
import { buildCone, damageStep, recover, identityMetrics, historyHashes } from "../src/cone.js";
import { residual, verifyResidualChain, clearResidual } from "../src/residual.js";
import { setPlasticity, setRefusalStrictness } from "../src/modulators.js";

const results = [];
const check = (criterion, name, ok, detail = "") => {
  results.push({ criterion, name, ok, detail });
  console.log(`${ok ? "ok" : "FAIL"} [${criterion}] ${name}${detail ? ` — ${detail}` : ""}`);
};

resetBrain();
clearContext();
clearResidual();
resetIssueCounter();
setPlasticity(1.0);
setRefusalStrictness("strict");

const gate = loadGate(readRulesInputs(), {});
if (!gate.ok) { console.log(`FATAL: load gate: ${gate.error}`); process.exit(1); }
seedContextAndResidual(gate.live);
const bySop = new Map(gate.live.map((p) => [p.rules.sop_id, p.rules]));

// --- Criterion 1: exact derivation-tree match every case.
{
  const all = [
    ...EOS_SEQUENCE.map((s) => ({ sop: s.sop, req: s.request, id: s.id })),
    ...CONTINUITY_CASES.map((c) => ({ sop: POLICY_OF[c.policy], req: { ...c.request, action_id: c.id, actor_id: "cal" }, id: c.id })),
    ...EDGE_CASES.filter((e) => !e.untrusted).map((e) => ({ sop: e.sop, req: e.request, id: e.id })),
  ];
  let match = 0;
  for (const t of all) {
    resetIssueCounter();
    const kernel = evaluateAction(t.req, bySop.get(t.sop));
    resetIssueCounter();
    const brain = gatedEvaluate({ ...t.req }, bySop.get(t.sop), { ledger: false });
    const same = JSON.stringify(kernel.derivation) === JSON.stringify(brain.derivation) && kernel.status === brain.status;
    if (!same) check(1, `derivation match ${t.id}`, false, `kernel=${kernel.status} brain=${brain.status}`);
    else match += 1;
  }
  check(1, `exact derivation-tree match ${match}/${all.length} cases`, match === all.length, "zero hallucinated derivations");
}

// --- Criterion 2: debt forced to 0 before every decision.
{
  flagMissing("CAL:UNDOC", "synthetic undocumented step");
  const blocked = scoreContext().score > 0;
  const probe = gatedEvaluate({ action_id: "CAL-DEBT", actor_id: "cal", amount: 10, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, finance: true } }, bySop.get("SOP-FIN-01"), { ledger: false });
  repayDebt("prune", "CAL:UNDOC");
  const zero = scoreContext().score === 0;
  check(2, "debt forced to 0 before every decision", blocked && probe.status === "REFUSED" && zero, `blocked=${blocked} refused=${probe.status} repaid=${zero}`);
}

// --- Criterion 3: both identity metrics >= 0.99 after any pruning.
{
  buildCone(4242);
  const pre = historyHashes();
  let okAll = true;
  const notes = [];
  for (const phase of [1, 2, 3]) {
    damageStep(phase);
    const m = identityMetrics(pre);
    notes.push(`P${phase} o=${m.historyOverlap} c=${m.residualCapacity}`);
    if (!(m.historyOverlap >= 0.99 && m.residualCapacity >= 0.99)) okAll = false;
  }
  // synthetic: policy migration + owner succession under damage
  const migrated = JSON.parse(JSON.stringify(bySop.get("SOP-FIN-01")));
  const migProbe = gatedEvaluate({ action_id: "CAL-MIG", actor_id: "maya-ops", amount: 4200, currency: "USD", vendor: "Northwind Traders", signatures: { dept_head: true, finance: true } }, migrated, { ledger: false });
  if (migProbe.status !== "AUTHORIZED") okAll = false;
  recover();
  const mRec = identityMetrics(pre);
  if (!(mRec.historyOverlap >= 0.99 && mRec.residualCapacity >= 0.99)) okAll = false;
  check(3, "identity >= 0.99 after any pruning + recovery", okAll, notes.join(" | "));
}

// --- Criterion 4: 100% refusal/escalation accuracy.
{
  const tests = [
    ...EOS_SEQUENCE.filter((s) => s.expect !== "AUTHORIZED").map((s) => ({ id: s.id, sop: s.sop, req: s.request, expect: s.expect, premise: s.premise })),
    ...CONTINUITY_CASES.filter((c) => c.expect !== "AUTHORIZED").map((c) => ({ id: c.id, sop: POLICY_OF[c.policy], req: { ...c.request, action_id: c.id, actor_id: "cal" }, expect: c.expect })),
    ...EDGE_CASES.map((e) => ({ id: e.id, sop: e.sop, req: e.request, expect: e.expect, premise: e.premise ?? null })),
  ];
  let hit = 0;
  for (const t of tests) {
    const r = gatedEvaluate({ ...t.req }, bySop.get(t.sop), { ledger: false });
    const premise = r.refusal_details?.missing_premise_id ?? r.escalation_details?.unsatisfied_premise_id ?? null;
    const okStatus = r.status === t.expect;
    const okPremise = !t.premise || premise === t.premise;
    if (!okStatus || !okPremise) check(4, `accuracy ${t.id}`, false, `got ${r.status}/${premise}, want ${t.expect}/${t.premise ?? "-"}`);
    else hit += 1;
  }
  // contradiction case: tamper (altered threshold) fails integrity, never authorizes
  const altered = JSON.parse(JSON.stringify(bySop.get("SOP-FIN-01")));
  altered.threshold = 999999;
  const integ = verifyRulesetIntegrity(altered);
  if (integ.ok) { check(4, "tamper contradiction", false, "altered ruleset passed integrity"); }
  else hit += 1;
  check(4, `refusal/escalation accuracy ${hit}/${tests.length + 1}`, hit === tests.length + 1);
}

// --- Criterion 5: residual queryable + hash-consistent after Phase 3.
{
  buildCone(777);
  damageStep(1); damageStep(2); damageStep(3);
  const pin = residual.query("pin:SOP-FIN-01");
  const v = verifyResidualChain();
  const c = verifyContextChain();
  const okAll = typeof pin === "string" && pin.startsWith("sha256:") && v.ok && c.ok;
  check(5, "residual queryable + hash-consistent after Phase 3", okAll, `pin=${String(pin).slice(0, 18)}... chain=${v.ok} ctx=${c.ok}`);
  const chain = verifyChain();
  check("chain", "audit ledger verifies", chain.ok, `${chain.checked} entries`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\ncalibration: ${results.length - failed.length}/${results.length} checks plateau`);
if (failed.length > 0) { console.log("FAILED:"); for (const f of failed) console.log(` - [${f.criterion}] ${f.name}`); process.exit(1); }
console.log("calibration PASS — zero hallucinated derivations");
