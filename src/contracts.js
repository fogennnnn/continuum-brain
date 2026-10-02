/**
 * ContinuumBrain-v1 contracts (STEP 0 - frozen).
 * ONE canonical shape registry every new layer imports and checks.
 * Any new code not using these exact shapes is rejected at layer boundaries.
 *
 * Kernel shapes mirror the live debtaur engine.js + ledger.js:
 *   premise objects, ledger entries, ruleset objects, evaluation results
 *   with derivation chains, refusal_details, escalation_details.
 */

export const PREMISE_FIELDS = ["id", "description", "evaluator_key", "params", "escalate_on"];
export const PREMISE_REQUIRED = ["id", "evaluator_key"];
export const RULESET_FIELDS = ["sop_id", "title", "version", "premises"];
export const RULESET_VERSION_FIELDS = ["id", "version_hash", "effective_date", "signed_by"];
export const LEDGER_CORE_FIELDS = ["seq", "timestamp", "status", "action_id", "actor_id", "rule_version_hash", "derivation"];
export const LEDGER_FIELDS = [...LEDGER_CORE_FIELDS, "prev_hash", "hash"];
export const LEDGER_OPTIONAL = ["kind", "sop_id", "request_summary", "policy_title"];
export const EVAL_FIELDS = ["status", "action_id", "actor_id", "rule_version_hash", "timestamp", "derivation"];
export const EVAL_STATUSES = ["AUTHORIZED", "REFUSED", "ESCALATED"];
export const LEDGER_STATUSES = ["AUTHORIZED", "REFUSED", "ESCALATED", "ANCHORED", "NOTICE", "SIGNED", "SUPERSEDED", "NOTE"];
export const PROVENANCE_TAGS = ["stated", "derived", "taught"];
export const CONTEXT_KINDS = ["premise", "constraint", "intent", "why", "missing", "reanchor", "prune"];
export const CONTEXT_FIELDS = ["seq", "kind", "ref", "text", "status", "provenance", "timestamp", "prev_hash", "hash"];
export const CONTEXT_STATUSES = ["live", "stale", "pruned"];

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function err(prefix, msg) {
  return new Error(`[contracts] ${prefix}: ${msg}`);
}

export function validatePremise(p) {
  if (!isObj(p)) throw err("premise", "must be an object");
  for (const k of PREMISE_REQUIRED) {
    if (typeof p[k] !== "string" || p[k].length === 0) throw err("premise", `field '${k}' must be a non-empty string`);
  }
  if (p.description !== undefined && typeof p.description !== "string") throw err("premise", "'description' must be a string");
  if (p.params !== undefined && !isObj(p.params)) throw err("premise", "'params' must be an object");
  if (p.escalate_on !== undefined && !Array.isArray(p.escalate_on)) throw err("premise", "'escalate_on' must be an array");
  return true;
}

export function validateRuleset(r) {
  if (!isObj(r)) throw err("ruleset", "must be an object");
  for (const k of RULESET_FIELDS) {
    if (r[k] === undefined) throw err("ruleset", `missing required field '${k}'`);
  }
  if (typeof r.sop_id !== "string" || r.sop_id.length === 0) throw err("ruleset", "'sop_id' must be non-empty string");
  if (!isObj(r.version)) throw err("ruleset", "'version' must be an object");
  for (const k of RULESET_VERSION_FIELDS) {
    if (typeof r.version[k] !== "string" || r.version[k].length === 0) throw err("ruleset", `version.'${k}' must be non-empty string`);
  }
  if (!Array.isArray(r.premises) || r.premises.length === 0) throw err("ruleset", "'premises' must be a non-empty array");
  for (const p of r.premises) validatePremise(p);
  return true;
}

export function validateLedgerEntry(e, opts = {}) {
  if (!isObj(e)) throw err("ledger-entry", "must be an object");
  for (const k of LEDGER_CORE_FIELDS) {
    if (e[k] === undefined) throw err("ledger-entry", `missing required field '${k}'`);
  }
  if (typeof e.seq !== "number") throw err("ledger-entry", "'seq' must be a number");
  if (typeof e.timestamp !== "string") throw err("ledger-entry", "'timestamp' must be a string");
  if (typeof e.hash !== "string" || typeof e.prev_hash !== "string") throw err("ledger-entry", "'hash'/'prev_hash' must be strings");
  if (!Array.isArray(e.derivation)) throw err("ledger-entry", "'derivation' must be an array");
  const allowed = opts.extraStatuses ?? LEDGER_STATUSES;
  if (!allowed.includes(e.status)) throw err("ledger-entry", `status '${e.status}' not in allowed set`);
  return true;
}

export function validateEvaluationResult(r) {
  if (!isObj(r)) throw err("evaluation-result", "must be an object");
  for (const k of EVAL_FIELDS) {
    if (r[k] === undefined) throw err("evaluation-result", `missing required field '${k}'`);
  }
  if (!EVAL_STATUSES.includes(r.status)) throw err("evaluation-result", `status '${r.status}' must be one of ${EVAL_STATUSES.join("|")}`);
  if (!Array.isArray(r.derivation)) throw err("evaluation-result", "'derivation' must be an array");
  if (r.derivation_chain !== undefined && JSON.stringify(r.derivation_chain) !== JSON.stringify(r.derivation)) {
    throw err("evaluation-result", "'derivation_chain' must equal 'derivation' when present");
  }
  if (r.status === "REFUSED") {
    const d = r.refusal_details;
    if (!isObj(d)) throw err("evaluation-result", "REFUSED must carry refusal_details");
    if (typeof d.missing_premise_id !== "string" || typeof d.reason !== "string") throw err("evaluation-result", "refusal_details needs missing_premise_id + reason strings");
    if (!isObj(d.policy_issue) || typeof d.policy_issue.id !== "string" || typeof d.policy_issue.missing_premise !== "string") {
      throw err("evaluation-result", "refusal_details.policy_issue needs id + missing_premise");
    }
  }
  if (r.status === "ESCALATED") {
    const d = r.escalation_details;
    if (!isObj(d)) throw err("evaluation-result", "ESCALATED must carry escalation_details");
    if (typeof d.unsatisfied_premise_id !== "string" || typeof d.reason !== "string") throw err("evaluation-result", "escalation_details needs unsatisfied_premise_id + reason");
    if (!isObj(d.policy_issue) || typeof d.policy_issue.id !== "string") throw err("evaluation-result", "escalation_details.policy_issue needs id");
  }
  return true;
}

export function validateProvenanceTag(t) {
  if (!PROVENANCE_TAGS.includes(t)) throw err("provenance", `tag '${t}' must be one of ${PROVENANCE_TAGS.join("|")}`);
  return true;
}

export function validateContextEntry(e) {
  if (!isObj(e)) throw err("context-entry", "must be an object");
  for (const k of CONTEXT_FIELDS) {
    if (e[k] === undefined) throw err("context-entry", `missing required field '${k}'`);
  }
  if (!CONTEXT_KINDS.includes(e.kind)) throw err("context-entry", `kind '${e.kind}' must be one of ${CONTEXT_KINDS.join("|")}`);
  if (!CONTEXT_STATUSES.includes(e.status)) throw err("context-entry", `status '${e.status}' must be one of ${CONTEXT_STATUSES.join("|")}`);
  validateProvenanceTag(e.provenance);
  if (typeof e.seq !== "number" || typeof e.ref !== "string" || typeof e.text !== "string") throw err("context-entry", "'seq' number, 'ref'/'text' strings required");
  if (typeof e.hash !== "string" || typeof e.prev_hash !== "string") throw err("context-entry", "'hash'/'prev_hash' strings required");
  return true;
}

/**
 * Enforce shapes at each layer boundary. Throws on first violation.
 * @param {"premise"|"ruleset"|"ledger-entry"|"evaluation-result"|"context-entry"} shape
 * @param {unknown} value
 */
export function assertShape(shape, value) {
  switch (shape) {
    case "premise": return validatePremise(value);
    case "ruleset": return validateRuleset(value);
    case "ledger-entry": return validateLedgerEntry(value);
    case "evaluation-result": return validateEvaluationResult(value);
    case "context-entry": return validateContextEntry(value);
    default: throw err("assert", `unknown shape '${shape}'`);
  }
}
