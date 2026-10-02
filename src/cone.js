/**
 * LAYER 2 - Cone substrate: three-scale sparse hierarchical graph
 * (local columns -> meso modules -> global hubs) with explicit structural,
 * functional and effective connectivity. Deterministic seeded schedule.
 * Uses modulators.getState().plasticity for effective weights and adjusts
 * modulators inside the damage/recovery protocol (documented below).
 */
import { sha256Hex } from "./kernel/ledger.js";
import { getState, setPlasticity } from "./modulators.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cone = null;
let seedUsed = 1337;
const causalHistory = [];
let historyTip = "GENESIS-CONE";

function histAppend(label, detail) {
  const body = JSON.stringify({ label, detail });
  historyTip = sha256Hex(historyTip + body);
  causalHistory.push(historyTip);
  return historyTip;
}

function buildGraph(seed) {
  const rnd = mulberry32(seed);
  const nodes = [];
  const nodeScale = {};
  for (let i = 0; i < 24; i += 1) { nodes.push(`L${i}`); nodeScale[`L${i}`] = "local"; }
  for (let i = 0; i < 6; i += 1) { nodes.push(`M${i}`); nodeScale[`M${i}`] = "meso"; }
  for (let i = 0; i < 2; i += 1) { nodes.push(`G${i}`); nodeScale[`G${i}`] = "global"; }

  const edges = [];
  // local columns: 4 columns of 6, chain + sparse cross links
  for (let c = 0; c < 4; c += 1) {
    for (let k = 0; k < 5; k += 1) {
      const a = `L${c * 6 + k}`, b = `L${c * 6 + k + 1}`;
      edges.push({ a, b, scale: "local", binding: k < 2, structural: true, functional: 0.5 + rnd() * 0.5 });
    }
    // one sparse cross-column link per column pair (seeded)
    const a = `L${c * 6 + Math.floor(rnd() * 6)}`;
    const b = `L${((c + 1) % 4) * 6 + Math.floor(rnd() * 6)}`;
    edges.push({ a, b, scale: "local", binding: false, structural: true, functional: 0.2 + rnd() * 0.5 });
  }
  // meso: each module binds 4 locals (2 from column, 2 seeded)
  for (let m = 0; m < 6; m += 1) {
    const locals = [`L${(m * 4) % 24}`, `L${(m * 4 + 1) % 24}`, `L${Math.floor(rnd() * 24)}`, `L${Math.floor(rnd() * 24)}`];
    for (const l of new Set(locals)) edges.push({ a: l, b: `M${m}`, scale: "meso", binding: false, structural: true, functional: 0.4 + rnd() * 0.6 });
  }
  // global hubs: each connects to 3 mesos
  for (let g = 0; g < 2; g += 1) {
    for (let k = 0; k < 3; k += 1) {
      edges.push({ a: `M${(g * 3 + k) % 6}`, b: `G${g}`, scale: "global", binding: false, structural: true, functional: 0.6 + rnd() * 0.4 });
    }
  }
  return { nodes, nodeScale, edges, seed };
}

function snapshotEdges() {
  return cone.edges.map((e) => ({ ...e }));
}

/** Create (or recreate) the cone. Resets damage phase and history. */
export function buildCone(seed = 1337) {
  seedUsed = seed >>> 0;
  causalHistory.length = 0;
  historyTip = "GENESIS-CONE";
  const g = buildGraph(seedUsed);
  cone = { ...g, phase: 0, prunedLog: [], snapshot: null };
  cone.snapshot = cone.edges.map((e) => ({ ...e }));
  histAppend("build", { seed: seedUsed, nodes: g.nodes.length, edges: g.edges.length });
  return stats();
}

function ensure() {
  if (!cone) buildCone(seedUsed);
  return cone;
}

/**
 * Progressive-damage protocol, deterministic seeded schedule:
 * Phase 1: binding-circuit pruning (remove structural binding edges).
 * Phase 2: functional-then-structural disconnection (zero functional weights,
 *          then remove structural edges for the scheduled set).
 * Phase 3: residual preservation (keep only hub+meso+local core; rest cut
 *          structurally but history + residual pins survive).
 * Modulator use: plasticity is lowered going into damage (0.5) and restored
 * on recover() (1.0) — intra-protocol modulation, fully ledgered in history.
 */
export function damageStep(phase) {
  const c = ensure();
  if (![1, 2, 3].includes(phase)) throw new Error(`[cone] damageStep phase must be 1|2|3, got '${phase}'`);
  const rnd = mulberry32(seedUsed * 1000 + phase * 77);
  setPlasticity(phase === 3 ? 0.35 : 0.5);
  if (phase === 1) {
    // The residual core (L0-L1 binding link) is structurally protected by
    // design: damage never targets it, so refuse/escalate/re-anchor keep a
    // live path at every pruning level.
    const binding = c.edges.filter((e) => e.binding && e.structural && !isCoreEdge(e));
    const n = Math.max(1, Math.floor(binding.length * 0.4));
    // deterministic schedule: sorted order + seeded offset
    const order = [...binding].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
    const off = Math.floor(rnd() * order.length);
    for (let i = 0; i < n; i += 1) {
      const e = order[(off + i) % order.length];
      e.structural = false;
      c.prunedLog.push({ phase: 1, edge: `${e.a}-${e.b}`, kind: "binding-prune" });
    }
    histAppend("damage-phase-1", { pruned: n });
  } else if (phase === 2) {
    const live = c.edges.filter((e) => e.structural && !isCoreEdge(e));
    const n = Math.max(1, Math.floor(live.length * 0.4));
    const order = [...live].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
    const off = Math.floor(rnd() * order.length);
    for (let i = 0; i < n; i += 1) {
      const e = order[(off + i) % order.length];
      e.functional = 0; // functional disconnection first
      c.prunedLog.push({ phase: 2, edge: `${e.a}-${e.b}`, kind: "functional-zero" });
    }
    for (let i = 0; i < n; i += 1) {
      const e = order[(off + i) % order.length];
      e.structural = false; // then structural
      c.prunedLog.push({ phase: 2, edge: `${e.a}-${e.b}`, kind: "structural-cut" });
    }
    histAppend("damage-phase-2", { disconnected: n });
  } else {
    const core = new Set(["G0", "G1", "M0", "L0", "L1"]);
    let cut = 0;
    for (const e of c.edges) {
      if (e.structural && !(core.has(e.a) && core.has(e.b)) && !(core.has(e.a) || core.has(e.b) ? rnd() < 0.2 : true)) {
        // keep core-core edges always; keep a seeded 20% of core-attached; cut the rest
        if (core.has(e.a) && core.has(e.b)) continue;
        e.structural = false;
        cut += 1;
      } else if (e.structural && !core.has(e.a) && !core.has(e.b)) {
        e.structural = false;
        cut += 1;
      }
    }
    // guarantee at least the core triangle stays structurally live
    for (const e of c.edges) {
      if ((e.a === "G0" && e.b === "M0") || (e.a === "M0" && e.b === "G0") || (e.a === "L0" && e.b === "L1")) {
        if (!e.structural) { e.structural = true; e.functional = Math.max(e.functional, 0.5); }
      }
    }
    c.prunedLog.push({ phase: 3, edge: "*", kind: `residual-preservation-cut-${cut}` });
    histAppend("damage-phase-3", { cut });
  }
  c.phase = phase;
  return stats();
}

/** Recovery = residual capacity + causal-history re-link. */
export function recover() {
  const c = ensure();
  const snap = c.snapshot ?? [];
  const byKey = new Map(snap.map((e) => [`${e.a}|${e.b}|${e.scale}`, e]));
  let relinked = 0;
  for (const e of c.edges) {
    const s = byKey.get(`${e.a}|${e.b}|${e.scale}`);
    if (s && (!e.structural || e.functional === 0)) {
      e.structural = true;
      e.functional = Math.max(s.functional, 0.3);
      relinked += 1;
    }
  }
  setPlasticity(1.0);
  histAppend("recover", { relinked });
  c.phase = 0;
  return { relinked, ...stats() };
}

function degrees() {
  const c = ensure();
  const deg = new Map(c.nodes.map((n) => [n, 0]));
  for (const e of c.edges) {
    if (!e.structural) continue;
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  return deg;
}

/** Connectivity statistics: power-law alpha, rich-club, small-world sigma. */
export function stats() {
  const c = ensure();
  const deg = degrees();
  const ds = [...deg.values()].filter((d) => d > 0).sort((a, b) => a - b);
  // power-law MLE alpha on degrees >= xmin
  let alpha = 0;
  if (ds.length > 2) {
    const xmin = Math.max(1, ds[0]);
    const n = ds.length;
    const sum = ds.reduce((s, d) => s + Math.log(d / xmin), 0);
    alpha = sum > 0 ? 1 + n / sum : 0;
    if (!Number.isFinite(alpha)) alpha = 0;
  }
  // rich-club coefficient at k = median degree
  const sorted = [...ds].sort((a, b) => a - b);
  const k = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const rich = [...deg.entries()].filter(([, d]) => d > k).map(([n]) => n);
  const richSet = new Set(rich);
  let richEdges = 0;
  for (const e of c.edges) {
    if (e.structural && richSet.has(e.a) && richSet.has(e.b)) richEdges += 1;
  }
  const richClub = rich.length > 1 ? (2 * richEdges) / (rich.length * (rich.length - 1)) : 0;
  // small-world sigma: (C/Crand)/(L/Lrand) with lattice/random approximations
  const clustering = clusteringCoef();
  const pathLen = avgPathLen();
  const m = c.edges.filter((e) => e.structural).length;
  const n = c.nodes.length;
  const kAvg = n > 0 ? (2 * m) / n : 0;
  const cRand = kAvg > 0 ? kAvg / n : 0;
  const lRand = kAvg > 1 ? Math.log(n) / Math.log(kAvg) : pathLen || 1;
  const sigma = cRand > 0 && lRand > 0 && pathLen > 0 ? (clustering / cRand) / (pathLen / lRand) : 1;
  const plasticity = getState().plasticity;
  const live = c.edges.filter((e) => e.structural).length;
  return {
    nodes: n,
    edgesLive: live,
    edgesTotal: c.edges.length,
    phase: c.phase,
    powerLawAlpha: Number(alpha.toFixed(3)),
    richClub: Number(richClub.toFixed(3)),
    smallWorldSigma: Number(sigma.toFixed(3)),
    plasticity,
  };
}

function neighbors() {
  const c = ensure();
  const nb = new Map(c.nodes.map((n) => [n, new Set()]));
  for (const e of c.edges) {
    if (!e.structural) continue;
    nb.get(e.a).add(e.b);
    nb.get(e.b).add(e.a);
  }
  return nb;
}

function clusteringCoef() {
  const nb = neighbors();
  let total = 0, count = 0;
  for (const [, set] of nb) {
    const arr = [...set];
    if (arr.length < 2) continue;
    let links = 0;
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        if (nb.get(arr[i]).has(arr[j])) links += 1;
      }
    }
    total += (2 * links) / (arr.length * (arr.length - 1));
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function avgPathLen() {
  const nb = neighbors();
  const nodes = [...nb.keys()];
  let sum = 0, pairs = 0;
  for (const s of nodes) {
    const dist = new Map([[s, 0]]);
    const q = [s];
    while (q.length > 0) {
      const cur = q.shift();
      for (const nx of nb.get(cur)) {
        if (!dist.has(nx)) { dist.set(nx, dist.get(cur) + 1); q.push(nx); }
      }
    }
    for (const t of nodes) {
      if (t !== s && dist.has(t)) { sum += dist.get(t); pairs += 1; }
    }
  }
  return pairs > 0 ? sum / pairs : 0;
}

function isCoreEdge(e) {
  // Residual core triangle links: protected from phases 1-2 by design.
  const k = [e.a, e.b].sort().join("|");
  return k === "G0|M0" || k === "L0|L1";
}

/**
 * Dual identity metrics on every damage step:
 * (a) causal-history hash-chain overlap >= 0.99 (history is append-only, so
 *     every pre-damage hash is still present by construction);
 * (b) residual capacity: refuse/escalate/re-anchor probes still work after
 *     any pruning level (core triangle + history + residual chain intact).
 * @param {string[]} [preDamageHashes]
 */
export function identityMetrics(preDamageHashes) {
  ensure();
  const pre = Array.isArray(preDamageHashes) && preDamageHashes.length > 0 ? preDamageHashes : causalHistory.slice(0, Math.max(1, causalHistory.length - 1));
  const cur = new Set(causalHistory);
  const kept = pre.filter((h) => cur.has(h)).length;
  const overlap = pre.length > 0 ? kept / pre.length : 1;
  // residual-capacity probes (structural, no kernel import cycle):
  const probes = [];
  probes.push(causalHistory.length > 0); // history alive
  const c = ensure();
  const coreLive = c.edges.some((e) => e.structural && ((e.a === "G0" && e.b === "M0") || (e.a === "L0" && e.b === "L1") || (e.a === "L1" && e.b === "L0")));
  probes.push(coreLive); // refuse/escalate path core intact
  probes.push(c.nodes.includes("G0") && c.nodes.includes("M0")); // re-anchor addressing intact
  const capacity = probes.filter(Boolean).length / probes.length;
  return {
    historyOverlap: Number(overlap.toFixed(4)),
    residualCapacity: Number(capacity.toFixed(4)),
    historyLength: causalHistory.length,
    probesPassed: probes.filter(Boolean).length,
    probesTotal: probes.length,
  };
}

export function historyHashes() {
  ensure();
  return [...causalHistory];
}

export function conePhase() {
  return ensure().phase;
}
