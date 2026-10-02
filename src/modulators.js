/**
 * LAYER 4 - Modulators. EXACT interface:
 *   modulators.setPlasticity(rate)
 *   modulators.setRefusalStrictness(level)
 *   modulators.getState()
 * Used in normal operation and inside the damage/recovery protocol.
 */
const state = {
  plasticity: 1.0,
  refusalStrictness: "strict",
  updated: new Date().toISOString(),
};

const LEVELS = ["lenient", "standard", "strict"];

export function setPlasticity(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0 || r > 1) {
    throw new Error(`[modulators] plasticity rate must be a number in [0,1], got '${rate}'`);
  }
  state.plasticity = r;
  state.updated = new Date().toISOString();
  return getState();
}

export function setRefusalStrictness(level) {
  if (!LEVELS.includes(level)) {
    throw new Error(`[modulators] strictness must be one of ${LEVELS.join("|")}, got '${level}'`);
  }
  state.refusalStrictness = level;
  state.updated = new Date().toISOString();
  return getState();
}

export function getState() {
  return { ...state };
}

export function strictnessRank() {
  return LEVELS.indexOf(state.refusalStrictness);
}
