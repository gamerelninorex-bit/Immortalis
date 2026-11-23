// The checked-in B3 successor to the last merged B2 commit. Older suites retain their source pins.
import { execFileSync } from "node:child_process";

export const B3_BASE_COMMIT = "728104565662fece3e76be5b94c28f3c4201dbb7";

export const gitB3BaseFile = (path: string): Buffer =>
  execFileSync("git", ["show", `${B3_BASE_COMMIT}:${path}`], { maxBuffer: 16 * 1024 * 1024 });

// Current shared paths appearing in earlier scoped-delta tables. Other shared sources are in present-day-identities.ts.
export const B3_SHARED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/engine/src/gm-wait-catalogue-current.ts": {
    base: "89854ed0fc59b3efa1c6dde3890fb9ef29bdbe5ecfd5441ea1d36596fe3b9b21",
    head: "2181880fdad6272dc514367b24c35764ae99bea198ced9ed2306314c8c43bf01",
  },
  "packages/engine/src/owners/extension.ts": {
    base: "9bb80e771ad34e6879a2138d08e5801952f2c3c577cc1dd67bd6d3050cb38bf1",
    head: "3206b49d2171835cf895d03dccb7ddf68d65a351c1ce5f22bed8d420c9f78225",
  },
};

export const B3_PACKAGE_PATHS: readonly string[] = [
  "packages/contracts/src/workshop-opening.ts",
  "packages/engine/gm-wait-catalogue/manifests/3c5c47d88ea90e74861d68987c44dda9a94656b5bb88ab18b23a6bcb2ba41ecd.json",
  "packages/engine/src/gm-wait-catalogue-current.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/extension.ts",
  "packages/engine/src/owners/workshop/actor-duty.ts",
  "packages/engine/src/owners/workshop/admission.ts",
  "packages/engine/src/owners/workshop/epistemic-notice.ts",
  "packages/engine/src/owners/workshop/gip-direction.ts",
  "packages/engine/src/owners/workshop/glassbell.ts",
  "packages/engine/src/owners/workshop/health-sensory.ts",
  "packages/engine/src/owners/workshop/index.ts",
  "packages/engine/src/owners/workshop/notice-publication.ts",
  "packages/engine/src/owners/workshop/notice-qualification.ts",
  "packages/engine/src/owners/workshop/notice-temporal.ts",
  "packages/engine/src/owners/workshop/production-stages.ts",
  "packages/engine/src/owners/workshop/publication.ts",
  "packages/engine/src/owners/workshop/registry.ts",
  "packages/engine/src/owners/workshop/source.ts",
  "packages/engine/src/world/canonical-campaign.ts",
  "packages/engine/src/world/integrity.ts",
];

export const B3_SOURCE_PATHS: readonly string[] = [
  "spec/b3/source-c0-v4/2026-11-23/README.md",
  "spec/b3/source-c0-v4/2026-11-23/workshop-opening-glassbell-v4.json",
  "spec/b3/source-c0-v4/2026-11-23/workshop-opening-quiet-v4.json",
];

export const B3_NON_PACKAGE_PATHS: readonly string[] = [
  "docs/evidence/f014b-b3/blue-ci-reconciliation.md",
  ...B3_SOURCE_PATHS,
];
