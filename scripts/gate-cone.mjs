/** gate:cone — 3-phase damage + recovery, identity >= 0.99. */
import { buildCone, damageStep, recover, identityMetrics, historyHashes } from "../src/cone.js";
import { setPlasticity, setRefusalStrictness, getState } from "../src/modulators.js";

let failures = 0;
const fail = (m) => { failures += 1; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`ok: ${m}`);

setPlasticity(1.0);
setRefusalStrictness("strict");
buildCone(1337);
const pre = historyHashes();

for (const phase of [1, 2, 3]) {
  const s = damageStep(phase);
  const m = identityMetrics(pre);
  console.log(`phase ${phase}: edgesLive=${s.edgesLive}/${s.edgesTotal} alpha=${s.powerLawAlpha} richClub=${s.richClub} sigma=${s.smallWorldSigma} overlap=${m.historyOverlap} capacity=${m.residualCapacity}`);
  if (!(m.historyOverlap >= 0.99)) fail(`phase ${phase}: history overlap ${m.historyOverlap} < 0.99`);
  else pass(`phase ${phase}: history overlap ${m.historyOverlap} >= 0.99`);
  if (!(m.residualCapacity >= 0.99)) fail(`phase ${phase}: residual capacity ${m.residualCapacity} < 0.99`);
  else pass(`phase ${phase}: residual capacity ${m.residualCapacity} >= 0.99`);
  // modulators are inside the protocol: plasticity must be modulated, strictness intact
  const st = getState();
  if (typeof st.plasticity !== "number") fail(`phase ${phase}: plasticity not modulated`);
  if (st.refusalStrictness !== "strict") fail(`phase ${phase}: strictness drifted to ${st.refusalStrictness}`);
}

// Recovery restores capacity + history still overlaps.
{
  const rec = recover();
  const m = identityMetrics(pre);
  console.log(`recovered: relinked=${rec.relinked} edgesLive=${rec.edgesLive} overlap=${m.historyOverlap} capacity=${m.residualCapacity}`);
  if (!(m.historyOverlap >= 0.99)) fail(`post-recovery overlap ${m.historyOverlap} < 0.99`);
  else pass("post-recovery overlap >= 0.99");
  if (!(m.residualCapacity >= 0.99)) fail(`post-recovery capacity ${m.residualCapacity} < 0.99`);
  else pass("post-recovery capacity >= 0.99");
  if (getState().plasticity !== 1.0) fail("recovery did not restore plasticity to 1.0");
  else pass("recovery restored plasticity to 1.0");
}

if (failures > 0) { console.log(`gate:cone FAILED (${failures})`); process.exit(1); }
console.log("gate:cone PASS");
