/** Shared deterministic corpora: continuity first-week cases + EOS edge cases. */
export const POLICY_OF = {
  "expense-signoff": "SOP-FIN-01",
  "client-onboarding": "SOP-ONB-01",
  "hiring-approval": "SOP-HIRE-01",
  "vendor-payment": "SOP-PAY-01",
  "seat-cover": "SOP-SEAT-01",
  "decision-thaw": "SOP-THAW-01",
  "weekly-numbers": "SOP-NUM-01",
  "process-currency": "SOP-DOC-01",
  "client-comms": "SOP-COM-01",
};

export const CONTINUITY_CASES = [
  { id: "EXP-01", policy: "expense-signoff", expect: "AUTHORIZED", request: { amount: 4200, currency: "USD", vendor: "Northwind Traders", signatures: { dept_head: true, ceo: false, finance: true } } },
  { id: "EXP-02", policy: "expense-signoff", expect: "ESCALATED", request: { amount: 25000, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } } },
  { id: "ONB-01", policy: "client-onboarding", expect: "AUTHORIZED", request: { client_name: "Blue Lantern Co.", identity_status: "verified", credit_status: "pass", sanctions_status: "clear", prior_rejection: false, signatures: { approver: true, onboarding: true } } },
  { id: "ONB-02", policy: "client-onboarding", expect: "ESCALATED", request: { client_name: "Harbor & Grey Ltd", identity_status: "verified", credit_status: "pass", sanctions_status: "clear", prior_rejection: true, signatures: { approver: true, onboarding: true } } },
  { id: "HIRE-01", policy: "hiring-approval", expect: "REFUSED", request: { candidate_name: "Sam Reyes", role_type: "contractor", compensation: 60000, offer_date: "2026-06-15", is_renewal: true, signatures: { hiring_manager: true, director: false, reapprover: false, hr: true } } },
  { id: "PAY-01", policy: "vendor-payment", expect: "ESCALATED", request: { vendor: "Initech LLC", amount: 8000, currency: "USD", signatures: { approver: true, controller: false, payer: true } } },
  { id: "EXP-03", policy: "expense-signoff", expect: "REFUSED", request: { amount: 3200, currency: "USD", vendor: "Initech LLC", signatures: { dept_head: true, ceo: false, finance: false } } },
  { id: "HIRE-02", policy: "hiring-approval", expect: "AUTHORIZED", request: { candidate_name: "Jordan Lee", role_type: "employee", compensation: 95000, offer_date: "2026-06-15", is_renewal: false, signatures: { hiring_manager: true, director: false, reapprover: false, hr: true } } },
  { id: "SEAT-01", policy: "seat-cover", expect: "AUTHORIZED", request: { absence_level: "72h", cover_name: "Maya", decision_amount: 8000, signatures: { cover_owner: true, executor: true, owner: false } } },
  { id: "THAW-02", policy: "decision-thaw", expect: "ESCALATED", request: { decision_class: "frozen", decision_detail: "$40,000 press loan", discount_pct: 0, signatures: { executor: true, owner: false } } },
  { id: "NUM-01", policy: "weekly-numbers", expect: "AUTHORIZED", request: { cash_weeks: 10, margin_pct: 18, red_weeks: 0, signatures: { reviewer: true, owner: false } } },
  { id: "NUM-02", policy: "weekly-numbers", expect: "ESCALATED", request: { cash_weeks: 6, margin_pct: 12, red_weeks: 2, signatures: { reviewer: true, owner: true } } },
  { id: "DOC-02", policy: "process-currency", expect: "REFUSED", request: { process_name: "Press calibration", documented: false, review_date: "2026-06-15", signatures: { process_owner: false } } },
  { id: "COM-01", policy: "client-comms", expect: "AUTHORIZED", request: { successor_contact: "Maya", introduction: true, response_days: 1, signatures: { sender: true } } },
];

export const EOS_SEQUENCE = [
  { id: "SEQ-01-ALLOW", sop: "SOP-FIN-01", expect: "AUTHORIZED", premise: null, request: { action_id: "SEQ-01-ALLOW", action_type: "execute-payout", actor_id: "dept-head-01", amount: 7500, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } } },
  { id: "SEQ-02-REFUSE", sop: "SOP-FIN-01", expect: "REFUSED", premise: "PREMISE_FIN_05_FINANCE_SIG", request: { action_id: "SEQ-02-REFUSE", action_type: "execute-payout", actor_id: "dept-head-01", amount: 3200, currency: "USD", vendor: "Initech LLC", signatures: { dept_head: true, ceo: false, finance: false } } },
  { id: "SEQ-03-ESCALATE", sop: "SOP-FIN-01", expect: "ESCALATED", premise: "PREMISE_FIN_02_CEO_OVERRIDE_REQUIRED", request: { action_id: "SEQ-03-ESCALATE", action_type: "execute-payout", actor_id: "dept-head-01", amount: 12000, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, ceo: false, finance: true } } },
];

export const EDGE_CASES = [
  { id: "EDGE-EUR", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-EUR", actor_id: "dept-head-01", amount: 4200, currency: "EUR", vendor: "Northwind Traders", signatures: { dept_head: true, finance: false } } },
  { id: "EDGE-VENDOR", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-VENDOR", actor_id: "dept-head-01", amount: 4200, currency: "USD", vendor: "No Such Vendor", signatures: { dept_head: true, finance: false } } },
  { id: "EDGE-VENDOR-SIGNED", sop: "SOP-FIN-01", expect: "ESCALATED", request: { action_id: "EDGE-VENDOR-SIGNED", actor_id: "dept-head-01", amount: 4200, currency: "USD", vendor: "No Such Vendor", signatures: { dept_head: true, finance: true } } },
  { id: "EDGE-NEG", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-NEG", actor_id: "dept-head-01", amount: -5, currency: "USD", vendor: "Northwind Traders", signatures: { dept_head: true, finance: true } } },
  { id: "EDGE-NAN", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-NAN", actor_id: "dept-head-01", amount: NaN, currency: "USD", vendor: "Northwind Traders", signatures: { dept_head: true, finance: true } } },
  { id: "EDGE-MISSING-AMT", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-MISSING-AMT", actor_id: "dept-head-01", currency: "USD", vendor: "Northwind Traders", signatures: { dept_head: true, finance: true } } },
  { id: "EDGE-NOSIG", sop: "SOP-FIN-01", expect: "REFUSED", request: { action_id: "EDGE-NOSIG", actor_id: "dept-head-01", amount: 4200, currency: "USD", vendor: "Northwind Traders", signatures: {} } },
  { id: "EDGE-PROV-RISK", sop: "SOP-FIN-01", expect: "REFUSED", premise: "PROVENANCE_RISK", untrusted: true, request: { action_id: "EDGE-PROV-RISK", actor_id: "dept-head-01", amount: 100, currency: "USD", vendor: "Acme Supplies", signatures: { dept_head: true, finance: true }, __provenance: "untrusted" } },
];
