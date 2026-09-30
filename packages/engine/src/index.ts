// @immortalis/engine — provider-neutral Resurreccion Core.
// Present surface: deterministic commit core (IM-11 subset), the provider-neutral persistence contract
// (IM-17) with a prototype structured-file package (Campaign Continuity Foundation), and the
// specification-backed owner resolution + canonical world/PC/binding path (Canonical World Identity
// & Owner Foundation: IM-03 owner registry, IM-07 PC existence + binding).
export * from "./commit/campaign-core.ts";
export * from "./owners/admission.ts";
export * from "./owners/registry.ts";
export * from "./world/canonical-campaign.ts";
export * from "./world/integrity.ts";
export * from "./persistence/file-package.ts";
export * from "./persistence/fs-ops.ts";
export * from "./persistence/store.ts";
export * from "./compat.ts";
export * from "./hash.ts";
export * from "./version.ts";
