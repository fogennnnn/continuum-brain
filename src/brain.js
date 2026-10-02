/**
 * ContinuumBrain evaluator: kernel + layers wired in one deterministic path.
 *
 * RESIDUAL CALL POINTS (the evaluator calls residual here — nothing else does):
 *   CALL-1 (pre-evaluation):  residual.query(`pin:${sopId}`) fetches the pinned
 *     rule-version hash; a mismatch with the live ruleset refuses (stale pin).
 *   CALL-2 (post-decision):   residual.reanchor({ key, value }) pins the new
 *     derivation hash under `pin:${sopId}` and `decision:${actionId}`.
 *   CALL-3 (audit/replay):    residual.hash() tip hash is attached to the
 *     returned result as `residual_tip` for consistency checks.
 *
 * Boundary enforcement: every input/output is checked with contracts.js
 * (ruleset, evaluation-result, ledger-entry). Debt gate runs before the
 * kernel; the kernel derivation tree is never rewritten (bit-identical).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAction } from "./kernel/engine.js";
import { appendDecision, getEntries, clearLedger } from "./kernel/ledger.js";
import { verifyRulesetIntegrity } from "./kernel/integrity.js";
import { loadGate } from "./kernel/loadgate.js";
import { assertShape } from "./contracts.js";
import { gateEvaluation, scoreContext, anchorPremise, anchorConstraint, anchorIntent, anchorWhy } from "./debt.js";
import { residual } from "./residual.js";
import { getState } from "./modulators.js";

const PROVENANCE_BY_EVALUATOR = {
  "signature-present": "stated",
  "text-present": "stated",
  "signature-required-when": "stated",
  "positive-amount": "derived",
  "require-all": "derived",
  "amount-over-threshold-needs-override": "derived",
  "date-within-validity": "derived",
  "minimum-floor": "derived",
  "value-in-allowlist": "taught",
  "vendor-active-against-list": "taught",
  "currency-in-supported-set": "taught",
};

export function provenanceForPremise(premise) {
  return PROVENANCE_BY_EVALUATOR[premise?.evaluator_key] ?? "derived";
}

/** Attach provenance tags without touching the derivation tree. */
export function tagProvenance(result, ruleset) {
  const premises = Array.isArray(ruleset?.premises) ? ruleset.premises : [];
  const tags = premises.map((p) => ({ premise: p.id, tag: provenanceForPremise(p) }));
  return { ...result, provenance: tags };
}

const ruleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "rules");

export function loadRulesets() {
  const files = fs.readdirSync(ruleDir).filter((f) => f.endsWith(".json")).sort();
  const inputs = files.map((file) => ({
    file,
    rules: JSON.parse(fs.readFileSync(path.join(ruleDir, file), "utf8")),
  }));
  const gate = loadGate(inputs, {});
  return gate;
}

/** Seed context ledger + residual pins from live rulesets (idempotent per process). */
let seeded = false;
export function seedContextAndResidual(livePolicies) {
  if (seeded) return;
  seeded = true;
  for (const p of livePolicies) {
    const rules = p.rules;
    assertShape("ruleset", rules);
    for (const premise of rules.premises) {
      try { anchorPremise(premise.id, premise.description ?? premise.id, provenanceForPremise(premise)); } catch (_e) { /* duplicate-safe: still ledgered */ }
    }
    anchorConstraint(`${rules.sop_id}:thresholds`, `signed thresholds for ${rules.sop_id}`, "taught");
    anchorIntent(`${rules.sop_id}:intent`, `enforce ${rules.title}`, "stated");
    anchorWhy(`${rules.sop_id}:why`, `owner-signed policy ${rules.version.id}`, "derived");
    const check = verifyRulesetIntegrity(rules);
    residual.reanchor({ key: `pin:${rules.sop_id}`, value: `sha256:${check.recomputed}` });
  }
}

export function resetBrain() {
  seeded = false;
  clearLedger();
}

/**
 * Full gated evaluation. Returns kernel result + provenance (+ residual_tip),
 * or a debt/integrity/provenance refusal (contracts-valid shape).
 */
export function gatedEvaluate(request, ruleset, options = {}) {
  assertShape("ruleset", ruleset);
  const strictness = getState().refusalStrictness;

  // Provenance-risk inputs: explicitly untrusted claims never reach the kernel.
  if (request && request.__provenance === "untrusted") {
    const timestamp = new Date().toISOString();
    const reason = "Provenance risk: request carries an untrusted claim and cannot be evaluated under signed rules. Refusing rather than guessing.";
    const r = {
      status: "REFUSED",
      sop_id: ruleset.sop_id,
      policy_title: ruleset.title,
      action_id: request.action_id ?? "PROV-RISK",
      actor_id: request.actor_id ?? "unknown-actor",
      rule_version_hash: ruleset.version.version_hash,
      timestamp,
      derivation: [`REFUSED at PROVENANCE_RISK: ${reason}`],
      derivation_chain: [`REFUSED at PROVENANCE_RISK: ${reason}`],
      refusal_details: {
        missing_premise_id: "PROVENANCE_RISK",
        reason,
        policy_issue: { id: "ISS-PROV-001", title: "Provenance-risk refusal", missing_premise: "PROVENANCE_RISK", context: { action_id: request.action_id ?? null } },
      },
    };
    assertShape("evaluation-result", r);
    if (options.ledger !== false) assertShape("ledger-entry", appendDecision(r, request));
    return tagProvenance(r, ruleset);
  }

  // CALL-1: residual pin check (stale pin = refuse).
  const pinned = residual.query(`pin:${ruleset.sop_id}`);
  const check = verifyRulesetIntegrity(ruleset);
  const liveHash = `sha256:${check.recomputed}`;
  if (pinned !== null && pinned !== liveHash) {
    const timestamp = new Date().toISOString();
    const reason = `Residual pin mismatch for '${ruleset.sop_id}': pinned ${pinned} vs live ${liveHash}. Rules moved without re-anchor; refusing.`;
    const r = {
      status: "REFUSED",
      sop_id: ruleset.sop_id,
      policy_title: ruleset.title,
      action_id: request?.action_id ?? "RESIDUAL-PIN",
      actor_id: request?.actor_id ?? "unknown-actor",
      rule_version_hash: ruleset.version.version_hash,
      timestamp,
      derivation: [`REFUSED at RESIDUAL_PIN: ${reason}`],
      derivation_chain: [`REFUSED at RESIDUAL_PIN: ${reason}`],
      refusal_details: {
        missing_premise_id: "RESIDUAL_PIN",
        reason,
        policy_issue: { id: "ISS-RES-001", title: "Residual pin mismatch", missing_premise: "RESIDUAL_PIN", context: { pinned, live: liveHash } },
      },
    };
    assertShape("evaluation-result", r);
    return tagProvenance(r, ruleset);
  }

  // Debt gate: score > 0 hard-refuses (all strictness levels; wording varies).
  const gate = gateEvaluation();
  if (!gate.ok) {
    const refusal = { ...gate.refusal, sop_id: ruleset.sop_id };
    if (strictness === "lenient") refusal.derivation = [...refusal.derivation, "(lenient mode: still refused — debt blocks every decision)"];
    assertShape("evaluation-result", refusal);
    if (options.ledger !== false) assertShape("ledger-entry", appendDecision(refusal, request));
    return tagProvenance(refusal, ruleset);
  }

  // Kernel: untouched evaluator, bit-identical derivation.
  const result = evaluateAction(request, ruleset);
  assertShape("evaluation-result", result);
  const tagged = tagProvenance(result, ruleset);

  // Ledger + CALL-2: pin derivation hash for replay.
  let tip = residual.hash();
  if (options.ledger !== false) {
    const entry = appendDecision(result, request);
    assertShape("ledger-entry", entry);
    residual.reanchor({ key: `decision:${result.action_id}`, value: entry.hash });
    if (pinned === null) residual.reanchor({ key: `pin:${ruleset.sop_id}`, value: liveHash });
    tip = residual.hash(); // CALL-3 value
  }
  return { ...tagged, residual_tip: tip, debt: scoreContext() };
}

export function rulesById(livePolicies, sopId) {
  const found = livePolicies.find((p) => p.rules?.sop_id === sopId);
  return found ? found.rules : null;
}
