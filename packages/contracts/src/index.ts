// @immortalis/contracts — executable representation of the RC contracts used so far
// (spec/f027/runtime-contract.md): RC-01, RC-02, RC-07 (input side), RC-13, RC-16, the campaign-package
// format, the typed values of the Canonical World Identity & Owner Foundation facts, and the Turnless
// Temporal & Resolution Transaction Foundation contracts (RC-03/04/05/10, kernel-owned state), and the
// Population & Cohort Reconciliation Backbone Foundation contracts (RC-08 envelope, RC-12 PopulationBasis /
// CohortRef, PCB-01 declaration).
export * from "./campaign-package.ts";
export * from "./commit.ts";
export * from "./ids.ts";
export * from "./json.ts";
export * from "./owner-fact.ts";
export * from "./population.ts";
export * from "./result.ts";
export * from "./source-ref.ts";
export * from "./spec-identity-schema.ts";
export * from "./temporal.ts";
export * from "./world-foundation.ts";
export { BUILD_SPEC_IDENTITY } from "./spec-identity.ts";
