# ContinuumBrain-v1 — Evaluation Report

Generated: 2026-10-02T11:51:34.441Z (UTC, deterministic re-run via `npm run gates`)

Joint acceptance over all five criteria:
1. exact derivation-tree match every case
2. debt forced to 0 before every decision
3. both identity metrics >= 0.99 after any pruning
4. 100% refusal/escalation accuracy on missing-premise, contradiction, provenance-risk cases
5. residual queryable + hash-consistent after Phase 3

## gate:kernel: PASS

```
ok: load gate live: SOP-COM-01, SOP-ONB-01, SOP-THAW-01, SOP-FIN-01, SOP-HIRE-01, SOP-DOC-01, SOP-SEAT-01, SOP-PAY-01, SOP-NUM-01
ok: SEQ-01-ALLOW: AUTHORIZED bit-stable
ok: SEQ-02-REFUSE: REFUSED/PREMISE_FIN_05_FINANCE_SIG bit-stable
ok: SEQ-03-ESCALATE: ESCALATED/PREMISE_FIN_02_CEO_OVERRIDE_REQUIRED bit-stable
ok: EXP-01: AUTHORIZED
ok: EXP-02: ESCALATED
ok: ONB-01: AUTHORIZED
ok: ONB-02: ESCALATED
ok: HIRE-01: REFUSED
ok: PAY-01: ESCALATED
ok: EXP-03: REFUSED
ok: HIRE-02: AUTHORIZED
ok: SEAT-01: AUTHORIZED
ok: THAW-02: ESCALATED
ok: NUM-01: AUTHORIZED
ok: NUM-02: ESCALATED
ok: DOC-02: REFUSED
ok: COM-01: AUTHORIZED
ok: replay: derivation bit-identical across runs
ok: ledger chain ok (26 entries)
gate:kernel PASS
```

## gate:debt: PASS

```
ok: clean debt score is 0
ok: clean evaluation AUTHORIZED
ok: injected debt score=0.013
ok: gateEvaluation blocks while indebted
ok: indebted evaluation hard-REFUSED at CONTEXT_DEBT
ok: post-prune debt score is 0
ok: post-repay evaluation AUTHORIZED
ok: stale injection raises score
ok: stale evaluation refused
ok: reanchor+prune repays stale debt
gate:debt PASS
```

## gate:cone: PASS

```
phase 1: edgesLive=51/53 alpha=1.94 richClub=0.167 sigma=1.875 overlap=1 capacity=1
ok: phase 1: history overlap 1 >= 0.99
ok: phase 1: residual capacity 1 >= 0.99
phase 2: edgesLive=32/53 alpha=2.363 richClub=0.179 sigma=5.443 overlap=1 capacity=1
ok: phase 2: history overlap 1 >= 0.99
ok: phase 2: residual capacity 1 >= 0.99
phase 3: edgesLive=3/53 alpha=3.885 richClub=0 sigma=0 overlap=1 capacity=1
ok: phase 3: history overlap 1 >= 0.99
ok: phase 3: residual capacity 1 >= 0.99
recovered: relinked=50 edgesLive=53 overlap=1 capacity=1
ok: post-recovery overlap >= 0.99
ok: post-recovery capacity >= 0.99
ok: recovery restored plasticity to 1.0
gate:cone PASS
```

## gate:residual: PASS

```
ok: pre-pruning probe AUTHORIZED + pinned
ok: pin queryable after Phase 3 (sha256:291190d1e4a...)
ok: decision pin queryable after Phase 3
ok: residual chain consistent (10 rows, tip 0e4c3c4416440f76...)
ok: refuse works after Phase 3
ok: escalate works after Phase 3
ok: re-anchor works after Phase 3
ok: chain consistent after re-anchor
gate:residual PASS
```

## calibrate (joint five-criteria sweep): PASS

```
ok [1] exact derivation-tree match 24/24 cases — zero hallucinated derivations
ok [2] debt forced to 0 before every decision — blocked=true refused=REFUSED repaid=true
ok [3] identity >= 0.99 after any pruning + recovery — P1 o=1 c=1 | P2 o=1 c=1 | P3 o=1 c=1
ok [4] refusal/escalation accuracy 19/19
ok [5] residual queryable + hash-consistent after Phase 3 — pin=sha256:291190d1e4a... chain=true ctx=true
ok [chain] audit ledger verifies — 9 entries

calibration: 6/6 checks plateau
calibration PASS — zero hallucinated derivations
```

## Verdict: ALL FIVE GATES PASS
