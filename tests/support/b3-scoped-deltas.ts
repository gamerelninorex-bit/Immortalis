// The checked-in B3 successor to the last merged B2 commit. Older suites retain their source pins.
import { execFileSync } from "node:child_process";

export const B3_BASE_COMMIT = "728104565662fece3e76be5b94c28f3c4201dbb7";

export const gitB3BaseFile = (path: string): Buffer =>
  execFileSync("git", ["show", `${B3_BASE_COMMIT}:${path}`], { maxBuffer: 16 * 1024 * 1024 });

// Current shared paths appearing in earlier scoped-delta tables. Other shared sources are in present-day-identities.ts.
export const B3_SHARED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/engine/src/epistemic/integrity.ts": {
    base: "577777d9fcee52b3b89fb26398ed8c32426b7e769a3ed5a6a13adb507287d7a7",
    head: "902a6d10cb2185e336006d5e6a4de406ecdc21a5ef9057bc92d71e0cace00ca6",
  },
  "packages/engine/src/gm-wait-catalogue-current.ts": {
    base: "89854ed0fc59b3efa1c6dde3890fb9ef29bdbe5ecfd5441ea1d36596fe3b9b21",
    head: "710a3605fbb075d328c39301dcbf5d3e2475a939ca23b24d91d8ee6d6fa7981e",
  },
  "packages/engine/src/owners/extension.ts": {
    base: "9bb80e771ad34e6879a2138d08e5801952f2c3c577cc1dd67bd6d3050cb38bf1",
    head: "3206b49d2171835cf895d03dccb7ddf68d65a351c1ce5f22bed8d420c9f78225",
  },
};

export const B3_PACKAGE_PATHS: readonly string[] = [
  "packages/contracts/src/temporal-custody.ts",
  "packages/contracts/src/workshop-opening.ts",
  "packages/engine/gm-wait-catalogue/manifests/3b30e70540dbc87fd778792b264c71a73047b9433c75eb086a797aa4dc50e46c.json",
  "packages/engine/gm-wait-catalogue/manifests/3c5c47d88ea90e74861d68987c44dda9a94656b5bb88ab18b23a6bcb2ba41ecd.json",
  "packages/engine/gm-wait-catalogue/manifests/50a4f44ee76a590b31a88b719d53e42ddb5d475269feb49b6544312176a3d3f5.json",
  "packages/engine/gm-wait-catalogue/manifests/818c03456cffd2084af2f8e5e1c5f2a5489fa043d5ff6c298cbe307e04437c78.json",
  "packages/engine/gm-wait-catalogue/manifests/82923713f4ebc16717b83dbc41a9050fea221b0c1a266c00f7433e34df697ef4.json",
  "packages/engine/gm-wait-catalogue/manifests/acecb5c9010cc6239544c7d926bb72971a8fe8c32cbcced38c43eec2ebd90748.json",
  "packages/engine/gm-wait-catalogue/manifests/b7735869d890dff3387199020e64e04132d096e8b9f3367cb46dc98a36a1fee7.json",
  "packages/engine/src/commit/campaign-core.ts",
  "packages/engine/src/economy/integrity.ts",
  "packages/engine/src/epistemic/integrity.ts",
  "packages/engine/src/gm-wait-catalogue-current.ts",
  "packages/engine/src/gm-wait-custody.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/extension.ts",
  "packages/engine/src/owners/workshop/actor-duty.ts",
  "packages/engine/src/owners/workshop/admission.ts",
  "packages/engine/src/owners/workshop/epistemic-notice.ts",
  "packages/engine/src/owners/workshop/gip-direction.ts",
  "packages/engine/src/owners/workshop/glassbell.ts",
  "packages/engine/src/owners/workshop/health-sensory.ts",
  "packages/engine/src/owners/workshop/index.ts",
  "packages/engine/src/owners/workshop/lane-x.ts",
  "packages/engine/src/owners/workshop/notice-publication.ts",
  "packages/engine/src/owners/workshop/notice-qualification.ts",
  "packages/engine/src/owners/workshop/notice-temporal.ts",
  "packages/engine/src/owners/workshop/production-auth.ts",
  "packages/engine/src/owners/workshop/production-stages.ts",
  "packages/engine/src/owners/workshop/publication.ts",
  "packages/engine/src/owners/workshop/registry.ts",
  "packages/engine/src/owners/workshop/source.ts",
  "packages/engine/src/owners/workshop/wait-decision.ts",
  "packages/engine/src/production/admission.ts",
  "packages/engine/src/production/integrity.ts",
  "packages/engine/src/temporal/admission.ts",
  "packages/engine/src/temporal/coordinator.ts",
  "packages/engine/src/temporal/if6b-settlement.ts",
  "packages/engine/src/temporal/if6b-stage.ts",
  "packages/engine/src/temporal/integrity.ts",
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
  "docs/evidence/f014b-b3/economy-realization-grant-draft.md",
  ...B3_SOURCE_PATHS,
];
