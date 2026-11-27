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
    head: "2cdd3d92c0134f34ba9be42c2b6dddce9cff8d15088ceba095fc0e1b49bd0768",
  },
  "packages/engine/src/gm-wait-catalogue-current.ts": {
    base: "89854ed0fc59b3efa1c6dde3890fb9ef29bdbe5ecfd5441ea1d36596fe3b9b21",
    head: "e6ced2224139830254c1e9fb82e79458fbae4511611923baaeca1b495619bd3e",
  },
  "packages/engine/src/owners/extension.ts": {
    base: "9bb80e771ad34e6879a2138d08e5801952f2c3c577cc1dd67bd6d3050cb38bf1",
    head: "1feef8b74edd31cef64fcd16fb513df9e814eef9dab4346684cb4371a51d9db9",
  },
};

export const B3_E_CATALOGUE_SHA256 =
  "737ad89cf3acb76ee65b16d0c4023f89c1100ecfe4b8e4ddd2d280097b269f0f";
export const B3_E_CATALOGUE_PATH = `packages/engine/gm-wait-catalogue/manifests/${B3_E_CATALOGUE_SHA256}.json`;

export const B3_PACKAGE_PATHS: readonly string[] = [
  "packages/contracts/src/temporal-custody.ts",
  "packages/contracts/src/workshop-opening.ts",
  "packages/engine/gm-wait-catalogue/manifests/04069ddf4ad84c183066366e34a6c8735b94a1e0eda278dfce3d6f53537cb97a.json",
  "packages/engine/gm-wait-catalogue/manifests/265c74a18ad9f0898ae079189b20b7e24b06bcb58c90798de1f3d6473bea08d3.json",
  B3_E_CATALOGUE_PATH,
  "packages/engine/gm-wait-catalogue/manifests/3c5c47d88ea90e74861d68987c44dda9a94656b5bb88ab18b23a6bcb2ba41ecd.json",
  "packages/engine/gm-wait-catalogue/manifests/501f0f3d4fc8cdf7e7cb425e9f6444db74a80524206cc8d760575563b2492e56.json",
  "packages/engine/gm-wait-catalogue/manifests/63072512adffc31cd04c621832e5d8165440eb40551f99046675cd4c224ffe17.json",
  "packages/engine/gm-wait-catalogue/manifests/6d343dec87934ffba04607a2ebef58e8a101cada9f75245eac142980daf84e24.json",
  "packages/engine/gm-wait-catalogue/manifests/81f6ccda0499b45c113c91f2c547892299d587da54e8777425f5fd8e61b6212d.json",
  "packages/engine/gm-wait-catalogue/manifests/f7a4b7ee4094fdf8efa3d17a2f9ee4d3bea36114ce227c6e839489dd10ab9948.json",
  // B3-T1 adds an isolated host archive in the engine package's internal host area.
  "packages/engine/host-storage/workshop-retained-originals.ts",
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
  "packages/engine/src/owners/workshop/generation.ts",
  "packages/engine/src/owners/workshop/glassbell.ts",
  "packages/engine/src/owners/workshop/health-sensory.ts",
  "packages/engine/src/owners/workshop/index.ts",
  "packages/engine/src/owners/workshop/lane-x.ts",
  "packages/engine/src/owners/workshop/lineage.ts",
  "packages/engine/src/owners/workshop/notice-publication.ts",
  "packages/engine/src/owners/workshop/notice-qualification.ts",
  "packages/engine/src/owners/workshop/notice-temporal.ts",
  "packages/engine/src/owners/workshop/production-auth.ts",
  "packages/engine/src/owners/workshop/production-stages.ts",
  "packages/engine/src/owners/workshop/publication.ts",
  "packages/engine/src/owners/workshop/registry.ts",
  "packages/engine/src/owners/workshop/source.ts",
  "packages/engine/src/owners/workshop/wait-decision.ts",
  "packages/engine/src/persistence/checkpoint-package.ts",
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
  "docs/evidence/f014b-b3/retained-originals-archive.md",
  ...B3_SOURCE_PATHS,
];
