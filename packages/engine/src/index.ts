// @immortalis/engine — provider-neutral Resurreccion Core.
// Present surface: deterministic commit core (IM-11 subset), the provider-neutral persistence contract
// (IM-17) with a prototype structured-file package (Campaign Continuity Foundation), and the
// specification-backed owner resolution + canonical world/PC/binding path (Canonical World Identity
// & Owner Foundation: IM-03 owner registry, IM-07 PC existence + binding), and the Turnless Temporal &
// Resolution Transaction Foundation (IM-02 coordinator over that same commit/persistence substrate), and
// the Population & Cohort Reconciliation Backbone Foundation (IM-04 owner path over that same substrate), and
// the Production & Resource Conservation Backbone Foundation (IM-05 Production owner path and the World-State
// fallback physical-entity custodian over that same substrate), and the Economy Demand → Production Request →
// Realized Access Backbone Foundation (IM-06 Economy owner path over that same substrate).
export * from "./commit/campaign-core.ts";
export * from "./economy/adapter.ts";
export * from "./economy/admission.ts";
export * from "./economy/declaration.ts";
export * from "./economy/derive.ts";
export * from "./economy/integrity.ts";
export * from "./economy/provider.ts";
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
export * from "./persistence/file-package.ts";
export * from "./persistence/fs-ops.ts";
export * from "./persistence/store.ts";
export * from "./compat.ts";
export * from "./hash.ts";
export * from "./version.ts";
