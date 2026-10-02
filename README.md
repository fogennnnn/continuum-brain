# ContinuumBrain-v1

Deterministic policy kernel (frozen, copied — never rewritten) plus four
new layers. Pure JavaScript ES modules, zero npm dependencies, Node 22+.

## Layout

- `src/kernel/` — untouched core: `engine.js` (allow/refuse/escalate
  evaluator), `ledger.js` (SHA-256 hash-chained audit ledger),
  `integrity.js` (signed-ruleset content hash + tamper refusal),
  `loadgate.js` (signed-ruleset load gate + per-area quarantine).
  Copied from the deterministic debtaur kernels; do not modify.
- `src/contracts.js` — STEP 0 frozen shapes: premise objects, ledger
  entries, ruleset objects, evaluation results with derivation chains,
  refusal/escalation details, provenance tags. Every layer boundary validates.
- `src/debt.js` — LAYER 1 ContextDebtNet (`scoreContext`, `repayDebt`,
  `gateEvaluation`). Debt = (stale + duplicated + missing) / live; score > 0
  hard-refuses until re-anchored or pruned (both ledgered).
- `src/cone.js` — LAYER 2 Cone substrate (`buildCone`, `damageStep`,
  `recover`, `identityMetrics`): local columns -> meso modules -> global
  hubs, structural/functional/effective connectivity, power-law / rich-club /
  small-world stats, seeded 3-phase damage + causal-history re-link recovery.
- `src/residual.js` — LAYER 3 minimal hash-chained state:
  `residual.query()`, `residual.hash()`, `residual.reanchor()`.
  Evaluator call points are documented in `src/brain.js` (CALL-1 pre-check,
  CALL-2 post-decision pin, CALL-3 audit tip).
- `src/modulators.js` — LAYER 4: `setPlasticity(rate)`,
  `setRefusalStrictness(level)`, `getState()`.
- `src/brain.js` — gated evaluator: residual pin check -> debt gate ->
  untouched kernel -> provenance tags (stated/derived/taught) -> ledger ->
  residual re-anchor. Kernel derivations are never rewritten (bit-identical).
- `src/rules/` — 9 signed rulesets (expense, onboarding, hiring, vendor
  payment, seat cover, decision thaw, weekly numbers, process currency,
  client comms).
- `scripts/` — `calibrate.mjs` (deterministic scripted data, no gradients)
  plus strict-order gates, each exiting non-zero on failure.

## Run

```sh
npm run demo        # extended public demo (A/B/B2/C1/C2 + succession + damage + debt)
npm run demo:serve  # same demo, then holds an HTTP server on PORT (default 8082)
npm run calibrate   # five-criteria joint sweep
npm run gates       # all gates in strict order (writes EVALUATION-REPORT.md via gate:full)
```

Single gates: `npm run gate:kernel`, `gate:debt`, `gate:cone`,
`gate:residual`, `gate:full`.

One-command rebuild: `sh rebuild.sh` or `powershell rebuild.ps1`.
Docker: `docker build -t continuumbrain .` then `docker run -p 8082:8082 continuumbrain`.

## Provenance model

Every premise carries a tag: `stated` (human signatures asserted at claim
time), `derived` (computed checks: amounts, dates, thresholds), `taught`
(signed lists the engine checks against: vendors, currencies, allowlists).
Tags ride alongside results; they never alter kernel derivations.
