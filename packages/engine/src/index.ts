// @immortalis/engine — provider-neutral Resurreccion Core.
// Present surface: deterministic commit core (IM-11 subset), the provider-neutral persistence contract
// (IM-17) with a prototype structured-file package (Campaign Continuity Foundation), and the
// specification-backed owner resolution + canonical world/PC/binding path (Canonical World Identity
// & Owner Foundation: IM-03 owner registry, IM-07 PC existence + binding), and the Turnless Temporal &
// Resolution Transaction Foundation (IM-02 coordinator over that same commit/persistence substrate), and
// the Population & Cohort Reconciliation Backbone Foundation (IM-04 owner path over that same substrate), and
// the Production & Resource Conservation Backbone Foundation (IM-05 Production owner path and the World-State
// fallback physical-entity custodian over that same substrate), and the Economy Demand → Production Request →
// Realized Access Backbone Foundation (IM-06 Economy owner path over that same substrate), and the World-State
// Entity Continuity / Transition Close Backbone Foundation (ECT-01 same-entity locus transition by the fallback
// custodian over that same substrate), and the Single-Leg Logistics Transfer & Destination Handoff Backbone
// Foundation (IM-05 Logistics owner path and the single authoritative current-locus resolver over that same
// substrate), and the Named-Actor Character Capability & Capability-Close Backbone Foundation (IM-07 Named-Actor
// capability owner path and its declared capability close over that same substrate), and the Epistemic Access /
// Sealed Accessible Content Packet Backbone Foundation (IM-10 Epistemic Access owner path: one BOUNDED_SHARED_ACCESS
// event, the capability-close read, and the separately sealed actor-safe packet and engine-only provenance over that
// same substrate), and the KTI Managed Transfer Package / Result-Close Backbone Foundation (IM-09 KTI owner path: one
// development object, one sealed-packet-evidenced active Transfer Package published at the KTI result close over that
// same substrate), and the GIP Stable Institution Identity Backbone Foundation (IM-06 GIP owner path: one explicitly
// established continuing Institution Identity, identity/provenance only, over that same substrate), and the GIP Office /
// Authority Locus Backbone Foundation (the same owner's explicitly established, ADVANCING-compatible office beneath a
// committed Institution Identity, initial establishment only).
export * from "./actor/adapter.ts";
export * from "./actor/admission.ts";
export * from "./actor/declaration.ts";
export * from "./actor/derive.ts";
export * from "./actor/integrity.ts";
export * from "./actor/provider.ts";
export * from "./commit/campaign-core.ts";
export * from "./economy/adapter.ts";
export * from "./economy/admission.ts";
export * from "./economy/declaration.ts";
export * from "./economy/derive.ts";
export * from "./economy/integrity.ts";
export * from "./economy/provider.ts";
export * from "./epistemic/adapter.ts";
export * from "./epistemic/admission.ts";
export * from "./epistemic/declaration.ts";
export * from "./epistemic/derive.ts";
export * from "./epistemic/integrity.ts";
export * from "./epistemic/provider.ts";
export * from "./gip/adapter.ts";
export * from "./gip/admission.ts";
export * from "./gip/declaration.ts";
export * from "./gip/integrity.ts";
export * from "./kti/adapter.ts";
export * from "./kti/admission.ts";
export * from "./kti/declaration.ts";
export * from "./kti/derive.ts";
export * from "./kti/integrity.ts";
export * from "./kti/provider.ts";
export * from "./logistics/adapter.ts";
export * from "./logistics/admission.ts";
export * from "./logistics/declaration.ts";
export * from "./logistics/derive.ts";
export * from "./logistics/integrity.ts";
export * from "./logistics/locus.ts";
export * from "./logistics/provider.ts";
export * from "./owners/admission.ts";
export * from "./owners/extension.ts";
export * from "./owners/registry.ts";
export * from "./temporal/admission.ts";
export * from "./temporal/coordinator.ts";
export * from "./temporal/graph.ts";
export * from "./temporal/identity.ts";
export * from "./temporal/integrity.ts";
export * from "./temporal/partition.ts";
export * from "./temporal/providers.ts";
export * from "./world/canonical-campaign.ts";
export * from "./world/integrity.ts";
export * from "./population/adapter.ts";
export * from "./population/admission.ts";
export * from "./population/barrier.ts";
export * from "./population/declaration.ts";
export * from "./population/derive.ts";
export * from "./population/integrity.ts";
export * from "./population/provider.ts";
export * from "./production/adapter.ts";
export * from "./production/admission.ts";
export * from "./production/declaration.ts";
export * from "./production/derive.ts";
export * from "./production/integrity.ts";
export * from "./production/provider.ts";
export * from "./world/fallback-custody.ts";
export * from "./world/entity-transition.ts";
export * from "./world/entity-transition-integrity.ts";
export * from "./world/entity-transition-provider.ts";
export * from "./persistence/file-package.ts";
export * from "./persistence/fs-ops.ts";
export * from "./persistence/store.ts";
export * from "./compat.ts";
export * from "./hash.ts";
export * from "./version.ts";
