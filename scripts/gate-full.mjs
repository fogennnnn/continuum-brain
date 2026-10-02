/** gate:full — joint report over all five criteria to EVALUATION-REPORT.md. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gates = ["gate:kernel", "gate:debt", "gate:cone", "gate:residual"];
const stamp = new Date().toISOString();
const lines = [];
lines.push("# ContinuumBrain-v1 — Evaluation Report");
lines.push("");
lines.push(`Generated: ${stamp} (UTC, deterministic re-run via \`npm run gates\`)`);
lines.push("");
lines.push("Joint acceptance over all five criteria:");
lines.push("1. exact derivation-tree match every case");
lines.push("2. debt forced to 0 before every decision");
lines.push("3. both identity metrics >= 0.99 after any pruning");
lines.push("4. 100% refusal/escalation accuracy on missing-premise, contradiction, provenance-risk cases");
lines.push("5. residual queryable + hash-consistent after Phase 3");
lines.push("");

let allOk = true;
for (const g of gates) {
  const r = spawnSync(process.execPath, ["--no-warnings", "scripts/" + g.replace("gate:", "gate-") + ".mjs"], { cwd: root, encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) allOk = false;
  lines.push(`## ${g}: ${ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("```");
  lines.push(((r.stdout ?? "") + (r.stderr ?? "")).trim());
  lines.push("```");
  lines.push("");
}
{
  const r = spawnSync(process.execPath, ["--no-warnings", "scripts/calibrate.mjs"], { cwd: root, encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) allOk = false;
  lines.push(`## calibrate (joint five-criteria sweep): ${ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("```");
  lines.push(((r.stdout ?? "") + (r.stderr ?? "")).trim());
  lines.push("```");
  lines.push("");
}
lines.push(`## Verdict: ${allOk ? "ALL FIVE GATES PASS" : "FAILURES PRESENT — see sections above"}`);
lines.push("");
const report = lines.join("\n");
fs.writeFileSync(path.join(root, "EVALUATION-REPORT.md"), report, "utf8");
console.log(report);
if (!allOk) { console.error("gate:full FAILED"); process.exit(1); }
console.log("gate:full PASS — report written to EVALUATION-REPORT.md");
