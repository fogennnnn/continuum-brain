/** gate:residual — queryable + consistent after heavy pruning. */
import { clearLedger } from "../src/kernel/ledger.js";
import { loadGate } from "../src/kernel/loadgate.js";
import { readRulesInputs } from "./lib.mjs";
import { gatedEvaluate, seedContextAndResidual, resetBrain, rulesById } from "../src/brain.js";
import { residual, residualEntries, verifyResidualChain, clearResidual } from "../src/residual.js";
import { buildCone, damageStep } from "../src/cone.js";
import { clearContext, scoreContext } from "../src/debt.js";

let failures = 0;
const fail = (m) => { failures += 1; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`ok: ${m}`);

resetBrain();
clearContext();
clearResidual();
const gate = loadGate(readRulesInputs(), {});
if (!gate.ok) { console.log(`FAIL: load gate: ${gate.error}`); process.exit(1); }
seedContextAndResidual(gate.live);
const fin = rulesById(gate.live, "SOP-FIN-01");

// Pin decisions, then drive Phase-3 heavy pruning.
const r0 = gatedEvaluate({ action_id: "RES-PROBE-0", actor_id: "dept-head-01", amount: 7500, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } }, fin);
if (r0.status !== "AUTHORIZED") fail(`pre-pruning probe ${r0.status} != AUTHORIZED`);
else pass("pre-pruning probe AUTHORIZED + pinned");

buildCone(2026);
damageStep(1);
damageStep(2);
damageStep(3); // heavy pruning

// 1. Residual queryable after Phase 3.
{
  const pin = residual.query("pin:SOP-FIN-01");
  if (typeof pin !== "string" || !pin.startsWith("sha256:")) fail(`pin:SOP-FIN-01 not queryable after Phase 3 (got ${pin})`);
  else pass(`pin queryable after Phase 3 (${String(pin).slice(0, 18)}...)`);
  const dec = residual.query("decision:RES-PROBE-0");
  if (typeof dec !== "string" || dec.length === 0) fail("decision pin not queryable after Phase 3");
  else pass("decision pin queryable after Phase 3");
}

// 2. Hash-consistent after Phase 3.
{
  const v = verifyResidualChain();
  if (!v.ok) fail(`residual chain broken at seq ${v.failedAt}`);
  else pass(`residual chain consistent (${v.checked} rows, tip ${residual.hash().slice(0, 16)}...)`);
}

// 3. Refuse / escalate / re-anchor still work after heavy pruning.
{
  if (scoreContext().score !== 0) fail("debt nonzero before post-pruning probes");
  const refuse = gatedEvaluate({ action_id: "RES-PROBE-1", actor_id: "x", amount: 3200, currency: "USD", vendor: "Initech LLC", signatures: { dept_head: true, finance: false } }, fin);
  const esc = gatedEvaluate({ action_id: "RES-PROBE-2", actor_id: "x", amount: 25000, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } }, fin);
  if (refuse.status !== "REFUSED") fail(`post-pruning refuse probe ${refuse.status}`);
  else pass("refuse works after Phase 3");
  if (esc.status !== "ESCALATED") fail(`post-pruning escalate probe ${esc.status}`);
  else pass("escalate works after Phase 3");
  const before = residualEntries().length;
  residual.reanchor({ key: "post-pruning-anchor", value: "alive" });
  if (residual.query("post-pruning-anchor") !== "alive") fail("re-anchor not queryable");
  else pass("re-anchor works after Phase 3");
  const v = verifyResidualChain();
  if (!v.ok || residualEntries().length !== before + 1) fail("chain inconsistent after re-anchor");
  else pass("chain consistent after re-anchor");
}

if (failures > 0) { console.log(`gate:residual FAILED (${failures})`); process.exit(1); }
console.log("gate:residual PASS");
