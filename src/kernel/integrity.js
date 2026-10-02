/**
 * Kernel integrity helpers — COPIED semantics from debtaur-eos src/sequence.js
 * and debtaur-continuity src/integrity.js (stable canonicalisation of ruleset
 * content excluding top-level `version`, sha256 content hash, tamper refusal).
 * Hashing delegates to kernel ledger sha256Hex (dual-runtime, bit-identical).
 */
import { nextIssueId } from "./engine.js";
import { sha256Hex } from "./ledger.js";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function canonicalRulesetContent(rules) {
  const { version, ...rest } = rules ?? {};
  void version;
  return stableStringify(rest);
}

export function contentHash(rules) {
  return `sha256:${sha256Hex(canonicalRulesetContent(rules))}`;
}

export function verifyRulesetIntegrity(rules) {
  const stored = String(rules?.version?.version_hash ?? "");
  const expected = stored.startsWith("sha256:") ? stored.slice("sha256:".length) : stored;
  const recomputed = sha256Hex(canonicalRulesetContent(rules));
  return { ok: expected.length > 0 && expected === recomputed, expected, recomputed };
}

export function buildTamperRefusal(opts) {
  const { sourceLabel, rules, recomputedHex, issuePrefix, extraContext } = opts ?? {};
  const timestamp = new Date().toISOString();
  const storedHash = String(rules?.version?.version_hash ?? "(missing or unreadable)");
  const ruleVersionId = rules?.version?.id ?? "unknown-rule-version";
  const sopId = rules?.sop_id ?? String(sourceLabel);
  const policyTitle = typeof rules?.title === "string" && rules.title.length > 0 ? rules.title : sopId;
  const prefix = typeof issuePrefix === "string" && issuePrefix.length > 0
    ? issuePrefix
    : (typeof rules?.issue_prefix === "string" && rules.issue_prefix.length > 0 ? rules.issue_prefix : "ISS-2026");
  const reason = typeof opts?.reason === "string" && opts.reason.length > 0
    ? opts.reason
    : `Ruleset integrity failure for '${sourceLabel}': the stored version hash does not match the recomputed content hash ` +
      `(stored ${storedHash}; recomputed sha256:${recomputedHex}). ` +
      `The ruleset may have been edited after signing. Refusing to proceed with untrusted rules.`;
  const chain = [
    `Integrity check of '${sourceLabel}' rule version '${ruleVersionId}' failed: stored hash does not match recomputed content hash.`,
    `REFUSED at RULESET_INTEGRITY: ${reason}`,
  ];
  return {
    status: "REFUSED",
    sop_id: sopId,
    policy_title: policyTitle,
    action_id: "RULESET-LOAD",
    actor_id: "system",
    rule_version_hash: storedHash,
    timestamp,
    derivation: chain,
    derivation_chain: chain,
    refusal_details: {
      missing_premise_id: "RULESET_INTEGRITY",
      reason,
      policy_issue: {
        id: nextIssueId(prefix),
        title: `Policy refusal on ruleset load — RULESET_INTEGRITY (${sourceLabel})`,
        missing_premise: "RULESET_INTEGRITY",
        context: {
          action_id: "RULESET-LOAD",
          source: sourceLabel,
          rule_version: ruleVersionId,
          stored_hash: storedHash,
          recomputed_hash: `sha256:${recomputedHex}`,
          ...(extraContext ?? {}),
        },
      },
    },
  };
}
