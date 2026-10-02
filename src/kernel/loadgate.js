/**
 * Kernel load gate + area quarantine — COPIED behavior from debtaur-eos src/index.js.
 * Fail closed per area, not per estate: an integrity failure in ONE area
 * quarantines that area only (its cases refuse at load naming the dark area);
 * other areas load and evaluate normally; ledger records both the refusal
 * and the areas that stayed live. Only a broken audit chain or zero live
 * areas refuses startup. Ledger-anchor contract included (edit-both attack).
 */
import { appendDecision, getEntries, verifyChain } from "./ledger.js";
import { verifyRulesetIntegrity, buildTamperRefusal } from "./integrity.js";
import { assertShape } from "../contracts.js";

export const INTEGRITY_MEANING =
  "quiet edits cannot widen spend authority — the unsigned change stops at this policy surface; unaffected areas stay live.";

function quarantineRecord({ file, rules, shortReason, refusal }) {
  const entry = appendDecision(refusal);
  assertShape("ledger-entry", entry);
  return { file, rules, live: false, shortReason, refusal, entrySeq: entry.seq };
}

/**
 * Load + gate a list of { file, rules } against in-file signature and anchor.
 * @param {{ file: string, rules: object }[]} inputs
 * @param {{ onAppend?: (e: object) => void }} [options]
 * @returns {{ policies: object[], live: object[], dark: object[], ok: boolean, error: string|null }}
 */
export function loadGate(inputs, options = {}) {
  const onAppend = typeof options?.onAppend === "function" ? options.onAppend : null;
  const tracked = (entry) => { if (onAppend) onAppend(entry); };
  const policies = [];
  for (const { file, rules } of inputs) {
    if (!rules || typeof rules !== "object") {
      const refusal = buildTamperRefusal({
        sourceLabel: file, rules: null,
        recomputedHex: "(unparseable: not an object)",
        issuePrefix: "ISS-2026", extraContext: { file },
      });
      const q = quarantineRecord({ file, rules: null, shortReason: "file is not valid JSON and cannot be trusted", refusal });
      tracked(getEntries()[getEntries().length - 1]);
      policies.push(q);
      continue;
    }
    let shapeOk = true;
    try { assertShape("ruleset", rules); } catch (_e) { shapeOk = false; }
    if (!shapeOk) {
      const refusal = buildTamperRefusal({
        sourceLabel: file, rules, recomputedHex: "(shape-invalid)",
        issuePrefix: "ISS-2026", extraContext: { file },
      });
      policies.push(quarantineRecord({ file, rules, shortReason: "ruleset shape invalid; cannot be trusted", refusal }));
      continue;
    }
    const check = verifyRulesetIntegrity(rules);
    if (!check.ok) {
      const refusal = buildTamperRefusal({ sourceLabel: file, rules, recomputedHex: check.recomputed, extraContext: { file } });
      policies.push(quarantineRecord({ file, rules, shortReason: "stored signature does not match recomputed content", refusal }));
      continue;
    }
    const anchored = getEntries().find((e) => e?.kind === "RULESET_ANCHORED" && e?.sop_id === rules.sop_id);
    if (anchored) {
      const norm = (h) => (String(h).startsWith("sha256:") ? String(h).slice("sha256:".length) : String(h));
      if (norm(anchored.rule_version_hash) !== check.recomputed) {
        const refusal = buildTamperRefusal({
          sourceLabel: file, rules, recomputedHex: check.recomputed,
          reason: `Anchor mismatch for '${file}': content matches in-file signature but not the ledger anchor ` +
            `(recomputed sha256:${check.recomputed}; anchored ${anchored.rule_version_hash}). Deliberate re-anchoring required.`,
          extraContext: { file, anchored_hash: anchored.rule_version_hash },
        });
        policies.push(quarantineRecord({ file, rules, shortReason: "content matches in-file signature but not the ledger anchor", refusal }));
        continue;
      }
      policies.push({ file, rules, live: true });
      continue;
    }
    const timestamp = new Date().toISOString();
    const derivation = [`RULESET_ANCHORED ${rules.sop_id} (${file}) version ${rules.version.id} content hash sha256:${check.recomputed} recorded.`];
    const anchor = {
      status: "ANCHORED", kind: "RULESET_ANCHORED", sop_id: rules.sop_id,
      action_id: `RULESET-ANCHORED-${rules.sop_id}`, actor_id: "system",
      rule_version_hash: `sha256:${check.recomputed}`, timestamp,
      derivation, derivation_chain: derivation,
    };
    const entry = appendDecision(anchor);
    tracked(entry);
    policies.push({ file, rules, live: true });
  }
  const live = policies.filter((p) => p.live);
  const dark = policies.filter((p) => !p.live);
  if (live.length > 0 && dark.length > 0) {
    const timestamp = new Date().toISOString();
    const derivation = [`POLICYSET_LIVE: live areas [${live.map((p) => p.rules.sop_id).join(", ")}]; dark areas [${dark.map((p) => (p.rules ? p.rules.sop_id : p.file)).join(", ")}].`];
    const notice = {
      status: "NOTICE", kind: "POLICYSET_LIVE", action_id: "POLICYSET-LIVE", actor_id: "system",
      rule_version_hash: "ledger", timestamp, derivation, derivation_chain: derivation,
    };
    const entry = appendDecision(notice);
    tracked(entry);
  }
  const chain = verifyChain();
  if (!chain.ok) return { policies, live, dark, ok: false, error: `audit chain broken at seq ${chain.failedAt}` };
  if (live.length === 0) return { policies, live, dark, ok: false, error: "every policy area is dark" };
  return { policies, live, dark, ok: true, error: null };
}
