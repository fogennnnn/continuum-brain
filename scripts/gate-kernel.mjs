/** gate:kernel — bit-identical demos on the untouched kernel. */
import { evaluateAction, resetIssueCounter } from "../src/kernel/engine.js";
import { appendDecision, verifyChain, clearLedger } from "../src/kernel/ledger.js";
import { loadGate } from "../src/kernel/loadgate.js";
import { readRulesInputs } from "./lib.mjs";
import { EOS_SEQUENCE, CONTINUITY_CASES, POLICY_OF } from "./corpora.mjs";

let failures = 0;
const fail = (m) => { failures += 1; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`ok: ${m}`);

clearLedger();
resetIssueCounter();
const inputs = readRulesInputs();
const gate = loadGate(inputs, {});
if (!gate.ok) { console.log(`FAIL: load gate refused startup: ${gate.error}`); process.exit(1); }
pass(`load gate live: ${gate.live.map((p) => p.rules.sop_id).join(", ")}`);
const bySop = new Map(gate.live.map((p) => [p.rules.sop_id, p.rules]));

// 1. EOS guided sequence expectations (status + premise).
for (const step of EOS_SEQUENCE) {
  const rules = bySop.get(step.sop);
  const r = evaluateAction(step.request, rules);
  appendDecision(r, step.request);
  if (r.status !== step.expect) { fail(`${step.id}: status ${r.status} != ${step.expect}`); continue; }
  const premise = r.refusal_details?.missing_premise_id ?? r.escalation_details?.unsatisfied_premise_id ?? null;
  if (step.premise && premise !== step.premise) { fail(`${step.id}: premise ${premise} != ${step.premise}`); continue; }
  pass(`${step.id}: ${r.status}${premise ? `/${premise}` : ""} bit-stable`);
}

// 2. Continuity first-week queue: exact expected statuses.
for (const c of CONTINUITY_CASES) {
  const rules = bySop.get(POLICY_OF[c.policy]);
  if (!rules) { fail(`${c.id}: no live ruleset for ${c.policy}`); continue; }
  const req = { ...c.request, action_id: c.id, actor_id: "kernel-probe" };
  const r = evaluateAction(req, rules);
  appendDecision(r, req);
  if (r.status !== c.expect) fail(`${c.id}: status ${r.status} != ${c.expect}`);
  else pass(`${c.id}: ${r.status}`);
}

// 3. Bit-identical replay: same request twice => identical derivation.
{
  const rules = bySop.get("SOP-FIN-01");
  resetIssueCounter();
  const req = { ...EOS_SEQUENCE[0].request };
  const a = evaluateAction(req, rules);
  resetIssueCounter();
  const b = evaluateAction({ ...req }, rules);
  if (JSON.stringify(a.derivation) !== JSON.stringify(b.derivation)) fail("replay: derivation drift between identical runs");
  else pass("replay: derivation bit-identical across runs");
}

// 4. Ledger chain verifies.
{
  const v = verifyChain();
  if (!v.ok) fail(`ledger chain broken at seq ${v.failedAt}`);
  else pass(`ledger chain ok (${v.checked} entries)`);
}

if (failures > 0) { console.log(`gate:kernel FAILED (${failures})`); process.exit(1); }
console.log("gate:kernel PASS");
