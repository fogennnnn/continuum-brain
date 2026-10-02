/**
 * LAYER 1 - ContextDebtNet: append-only context ledger versioning every
 * premise, constraint, intent and why. All entries pass contracts.js shapes.
 * Debt score = (stale + duplicated + missing) / total live entries, where
 * stale counts only UNRESOLVED stale rows (a stale row whose ref has no
 * later live confirmation or reanchor). Any evaluation with debt score > 0
 * is hard-refused until explicitly repaid (re-anchor or prune, both ledgered).
 * Rows are immutable once appended; repay operations append new rows.
 */
import { sha256Hex } from "./kernel/ledger.js";
import { assertShape } from "./contracts.js";

const entries = [];
let seq = 0;

function canonical(e) {
  return JSON.stringify({ seq: e.seq, kind: e.kind, ref: e.ref, text: e.text, status: e.status, provenance: e.provenance, timestamp: e.timestamp });
}

function appendRow({ kind, ref, text, status, provenance }) {
  const prev = entries.length > 0 ? entries[entries.length - 1].hash : "GENESIS-CTX";
  seq += 1;
  const timestamp = new Date().toISOString();
  const core = { seq, kind, ref, text, status, provenance, timestamp, prev_hash: prev };
  const hash = sha256Hex(prev + canonical(core));
  const entry = { ...core, hash };
  assertShape("context-entry", entry);
  entries.push(entry);
  return entry;
}

function normText(t) {
  return String(t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function anchorPremise(premiseId, text, provenance = "stated") {
  return appendRow({ kind: "premise", ref: premiseId, text, status: "live", provenance });
}

export function anchorConstraint(ref, text, provenance = "taught") {
  return appendRow({ kind: "constraint", ref, text, status: "live", provenance });
}

export function anchorIntent(ref, text, provenance = "stated") {
  return appendRow({ kind: "intent", ref, text, status: "live", provenance });
}

export function anchorWhy(ref, text, provenance = "derived") {
  return appendRow({ kind: "why", ref, text, status: "live", provenance });
}

/** Append a stale marker for ref (original live rows stay untouched). */
export function markStale(ref) {
  const target = [...entries].reverse().find((e) => e.ref === ref && e.status === "live");
  if (!target) return null;
  return appendRow({ kind: target.kind, ref: target.ref, text: target.text, status: "stale", provenance: target.provenance });
}

export function flagMissing(ref, text) {
  return appendRow({ kind: "missing", ref, text, status: "live", provenance: "derived" });
}

/** A prune receipt covers a ref when it names it (or '*' for all). */
function prunedAfter(row) {
  return entries.some((e) =>
    e.seq > row.seq &&
    e.status === "live" &&
    e.kind === "prune" &&
    (e.ref === row.ref || e.ref === "*")
  );
}

/** A stale row is resolved by a later live confirmation/reanchor or a prune receipt. */
function staleResolved(staleRow) {
  if (prunedAfter(staleRow)) return true;
  return entries.some((e) =>
    e.seq > staleRow.seq &&
    e.status === "live" &&
    e.ref === staleRow.ref &&
    (e.kind === staleRow.kind || e.kind === "reanchor")
  );
}

/** Missing flags and duplicate copies resolve only via explicit prune. */
function retiredByPrune(row) {
  return prunedAfter(row);
}

/**
 * Debt score = (stale + duplicated + missing) / total live entries.
 * stale: unresolved stale rows. duplicated: live rows sharing normalized
 * (kind+ref+text) beyond the first. missing: live kind=missing rows.
 */
export function scoreContext() {
  const live = entries.filter((e) => e.status === "live");
  const stale = entries.filter((e) => e.status === "stale" && !staleResolved(e)).length;
  const seen = new Map();
  let duplicated = 0;
  for (const e of live) {
    if (e.kind === "prune" || e.kind === "reanchor") continue;
    if (retiredByPrune(e)) continue;
    // A live row repeating a previously-staled (kind,ref,text) is a healing
    // confirmation, not a duplicate.
    const heals = entries.some((s) =>
      s.status === "stale" && s.kind === e.kind && s.ref === e.ref &&
      normText(s.text) === normText(e.text) && s.seq < e.seq
    );
    if (heals) continue;
    const k = `${e.kind}|${e.ref}|${normText(e.text)}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) duplicated += 1;
  }
  const missing = live.filter((e) => e.kind === "missing" && !retiredByPrune(e)).length;
  const denom = live.length;
  const numer = stale + duplicated + missing;
  const score = denom === 0 ? 0 : numer / denom;
  return { score, stale, duplicated, missing, live: live.length, total: entries.length };
}

/**
 * Repay debt: op "reanchor" appends a live confirmation that resolves stale
 * rows for the ref; op "prune" retires stale/duplicated/missing rows for the
 * ref (status pruned, excluded from scoring). Both append ledgered receipts.
 */
export function repayDebt(op, ref) {
  if (op === "reanchor") {
    const target = [...entries].reverse().find((e) => e.ref === ref && (e.status === "live" || e.status === "stale"));
    if (!target) return { ok: false, reason: `no entry ref '${ref}' to re-anchor` };
    const receipt = appendRow({ kind: "reanchor", ref: target.ref, text: `re-anchored: ${target.text}`, status: "live", provenance: target.provenance });
    const confirm = appendRow({ kind: target.kind, ref: target.ref, text: target.text, status: "live", provenance: target.provenance });
    return { ok: true, entries: [receipt, confirm] };
  }
  if (op === "prune") {
    // Retirement is ledgered, never mutative: the receipt resolves matching
    // debt units in scoring (history stays hash-verifiable).
    const receipt = appendRow({ kind: "prune", ref, text: `retired debt rows for ref '${ref}'`, status: "live", provenance: "derived" });
    const after = scoreContext();
    return { ok: true, pruned: "ledgered", receipt, debt: after };
  }
  return { ok: false, reason: `unknown op '${op}' (use reanchor|prune)` };
}

/**
 * Gate an evaluation: debt score > 0 hard-refuses until repaid.
 */
export function gateEvaluation() {
  const s = scoreContext();
  if (s.score <= 0) return { ok: true, debt: s };
  const timestamp = new Date().toISOString();
  const reason = `Context debt ${s.score.toFixed(3)} > 0 (stale ${s.stale} + duplicated ${s.duplicated} + missing ${s.missing} over ${s.live} live). Repay via re-anchor or prune before any decision.`;
  return {
    ok: false,
    debt: s,
    refusal: {
      status: "REFUSED",
      action_id: "CONTEXT-GATE",
      actor_id: "system",
      rule_version_hash: "context-debtnet",
      timestamp,
      derivation: [`REFUSED at CONTEXT_DEBT: ${reason}`],
      derivation_chain: [`REFUSED at CONTEXT_DEBT: ${reason}`],
      refusal_details: {
        missing_premise_id: "CONTEXT_DEBT",
        reason,
        policy_issue: {
          id: `ISS-CTX-${String(s.total + 1).padStart(3, "0")}`,
          title: "Context debt must be repaid before evaluation",
          missing_premise: "CONTEXT_DEBT",
          context: { debt: s },
        },
      },
    },
  };
}

export function getContextEntries() {
  return [...entries];
}

export function verifyContextChain() {
  let prev = "GENESIS-CTX";
  for (const e of entries) {
    if (e.prev_hash !== prev) return { ok: false, failedAt: e.seq };
    const recomputed = sha256Hex(e.prev_hash + canonical(e));
    if (recomputed !== e.hash) return { ok: false, failedAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, checked: entries.length, failedAt: null };
}

export function clearContext() {
  entries.length = 0;
  seq = 0;
}
