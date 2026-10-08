// @immortalis/contracts — executable representation of the RC contracts used so far
// (spec/f027/runtime-contract.md): RC-01, RC-02, RC-07 (input side), RC-13, RC-16, the campaign-package
// format, the typed values of the Canonical World Identity & Owner Foundation facts, and the Turnless
// Temporal & Resolution Transaction Foundation contracts (RC-03/04/05/10, kernel-owned state), and the
// Population & Cohort Reconciliation Backbone Foundation contracts (RC-08 envelope, RC-12 PopulationBasis /
// CohortRef, PCB-01 declaration), and the Production & Resource Conservation Backbone Foundation contracts
// (Production Reserve, RC-06 Claim, operation, Durable Completion Envelope, World-State fallback entity), and the
// Economy Demand → Production Request → Realized Access Backbone Foundation contracts (Demand Envelope with its
// fixed allocation relation, Economy-owned Production Request, realized access), and the World-State Entity
// Continuity / Transition Close Backbone Foundation contracts (causing result, ECT-01 same-entity locus transition), and
// the Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation contracts (movement-service request
// envelope, commitment, transfer record, delivery-complete result), and the Named-Actor Character Capability &
// Capability-Close Backbone Foundation contracts (establishment basis, persisted capability, capability close), and
// the Epistemic Access / Sealed Accessible Content Packet Backbone Foundation contracts (BOUNDED_SHARED_ACCESS event,
// actor-safe Accessible Content Packet, engine-only Sealed Engine Provenance), and the KTI Managed Transfer Package /
// Result-Close Backbone Foundation contracts (KTI development-object identity, Transfer Package basis, active Transfer
// Package published at the KTI result close), and the GIP Stable Institution Identity Backbone Foundation contracts (the
// strict Institution Identity Reference: institution_id, identity_label, continuing continuity_status), and the GIP Office /
// Authority Locus Backbone Foundation contracts (the strict WS-007 §3.2 office, holder_ref OR decision_body_ref reference branch), and
// the GIP Authority Scope Binding Backbone Foundation contract (the strict WS-007 §5 Scope Binding beneath one office), and the
// GIP Governance Instrument Core Backbone Foundation contract (the strict WS-007 §4.1 core Instrument beneath one office and one of its Scope Bindings), and the
// Diplomacy External Recognition Core Backbone Foundation contract (the strict WS-008 §6 recognition entry with the v1.1 §29.2/§29.3 overlay fields), and the
// Diplomacy Externalized Claim / Dispute Core Backbone Foundation contract (the strict WS-008 §7 claim/dispute entry with the v1.1 §29.3/§29.4 overlay fields), and the
// Diplomacy Relation Edge Authoritative Core Backbone Foundation contract (the strict WS-008 §5.1 authoritative core; the derived reference/index arrays are not writable), and the
// Diplomacy Framework Authoritative Core Backbone Foundation contract (the strict WS-008 §16 Framework minimum surface; initial authored establishment only), and the
// F-027-CD1 Causal Draw foundation contracts (CausalDrawKey, CausalDrawSpecification, the SEALED precommit and result records, the refusal vocabulary), and the
// I-002 PC Capability Profile / PC Capability Close Receiving Foundation contracts (the received PC capability basis and the persisted PC capability published at the PC Capability Close), and the
// Existing-Actor World-State Coupling Anchor Foundation contract (the World-State fallback custodian's one current actor↔locus/world coupling fact; a prerequisite only, never the PC handover), and the
// Active-PC Post-Handover Physical Locus Custody contract (the World-State custodian's one stationary current physical-locus fact of the active PC, established from the completed handover; never movement, never the Role Registry binding), and the
// Active-PC Voluntary Movement Commitment contracts (the PC-side commitment-of-record and the PC-owned Movement Service Request; willingness only, never a world result), and the
// I-001 Active-PC Event-Signal Projection contract (IM-13/RC-14: the strict, disposable, non-canonical projection of one current Accessible Content Packet; never state), and the
// NPK Event-Signal Presentation contract (IM-14: the strict, disposable, non-canonical rendering of exactly one lawful Event-Signal Projection; never state), and the
// Culture & Society Established Shared Meaning / Norm Result-Close contracts (IM-09: the sealed Social Update Context, the Culture-defined evidence reading and the Culture-owned shared meaning/norm committed at the Communicative Convention Close).
export * from "./actor-capability.ts";
export * from "./actor-coupling.ts";
export * from "./pc-locus-custody.ts";
export * from "./pc-movement.ts";
export * from "./epistemic-access.ts";
export * from "./campaign-package.ts";
export * from "./causal-draw.ts";
export * from "./commit.ts";
export * from "./culture.ts";
export * from "./diplomacy-dispute.ts";
export * from "./diplomacy-framework.ts";
export * from "./diplomacy-recognition.ts";
export * from "./diplomacy-relation.ts";
export * from "./economy.ts";
export * from "./entity-transition.ts";
export * from "./gip.ts";
export * from "./gip-instrument.ts";
export * from "./gip-scope-binding.ts";
export * from "./ids.ts";
export * from "./json.ts";
export * from "./kti.ts";
export * from "./logistics.ts";
export * from "./owner-fact.ts";
export * from "./pc-capability.ts";
export * from "./population.ts";
export * from "./presentation.ts";
export * from "./projection.ts";
export * from "./production.ts";
export * from "./protocol-advance.ts";
export * from "./protocol-null-pc-advance.ts";
export * from "./protocol-causal.ts";
export * from "./protocol-relocation.ts";
export * from "./protocol.ts";
export * from "./result.ts";
export * from "./source-ref.ts";
export * from "./spec-identity-schema.ts";
export * from "./temporal.ts";
export * from "./world-foundation.ts";
export { BUILD_SPEC_IDENTITY } from "./spec-identity.ts";
