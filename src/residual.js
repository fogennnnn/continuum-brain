/**
 * LAYER 3 - Residual state: minimal persistent hash-chained state surviving
 * heavy pruning. EXACT API: residual.query(), residual.hash(), residual.reanchor().
 * The evaluator calls these; call points are documented in src/brain.js:
 *   CALL-1 (pre-evaluation):  residual.query(pinnedKey) — fetch pinned rule hash.
 *   CALL-2 (post-decision):   residual.reanchor(pinRecord) — pin derivation hash.
 *   CALL-3 (audit/replay):    residual.hash() — tip hash for consistency checks.
 */
import { sha256Hex } from "./kernel/ledger.js";

const chain = [];
let seq = 0;

function canonical(r) {
  return JSON.stringify({ seq: r.seq, key: r.key, value: r.value, timestamp: r.timestamp });
}

function appendRow(key, value) {
  const prev = chain.length > 0 ? chain[chain.length - 1].hash : "GENESIS-RESIDUAL";
  seq += 1;
  const timestamp = new Date().toISOString();
  const row = { seq, key, value, timestamp, prev_hash: prev };
  const hash = sha256Hex(prev + canonical(row));
  const full = { ...row, hash };
  chain.push(full);
  return full;
}

export const residual = {
  /**
   * Fetch the latest value pinned under key, or null when absent.
   * @param {string} key
   */
  query(key) {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      if (chain[i].key === key) return chain[i].value;
    }
    return null;
  },
  /** Tip hash of the residual chain ("GENESIS-RESIDUAL" when empty). */
  hash() {
    return chain.length > 0 ? chain[chain.length - 1].hash : "GENESIS-RESIDUAL";
  },
  /**
   * Pin a record: { key, value }. Appends one hash-chained row.
   * @param {{ key: string, value: unknown }} record
   */
  reanchor(record) {
    if (!record || typeof record.key !== "string" || record.key.length === 0) {
      throw new Error("[residual] reanchor requires { key: non-empty string, value }");
    }
    return appendRow(record.key, record.value);
  },
};

export function residualEntries() {
  return [...chain];
}

export function verifyResidualChain() {
  let prev = "GENESIS-RESIDUAL";
  for (const r of chain) {
    if (r.prev_hash !== prev) return { ok: false, failedAt: r.seq };
    const recomputed = sha256Hex(r.prev_hash + canonical(r));
    if (recomputed !== r.hash) return { ok: false, failedAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, checked: chain.length, failedAt: null };
}

export function clearResidual() {
  chain.length = 0;
  seq = 0;
}
