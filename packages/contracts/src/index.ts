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
// strict Institution Identity Reference: institution_id, identity_label, continuing continuity_status).
export * from "./actor-capability.ts";
export * from "./epistemic-access.ts";
export * from "./campaign-package.ts";
export * from "./commit.ts";
export * from "./economy.ts";
export * from "./entity-transition.ts";
export * from "./gip.ts";
export * from "./ids.ts";
export * from "./json.ts";
export * from "./kti.ts";
export * from "./logistics.ts";
export * from "./owner-fact.ts";
export * from "./population.ts";
export * from "./production.ts";
export * from "./result.ts";
export * from "./source-ref.ts";
export * from "./spec-identity-schema.ts";
export * from "./temporal.ts";
export * from "./world-foundation.ts";
export { BUILD_SPEC_IDENTITY } from "./spec-identity.ts";
