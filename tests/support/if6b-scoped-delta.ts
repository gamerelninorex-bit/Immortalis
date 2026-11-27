import { execFileSync } from "node:child_process";
export const IF6B_BASE_COMMIT = "728104565662fece3e76be5b94c28f3c4201dbb7";
export const IF6B_ENGINE_PATH = "packages/engine/src/temporal/if6b-stage.ts";
export const IF6B_ENGINE_SHA256 =
  "1b08002314846f77252d9512fa8e633c84852bf6d31fbf334c025087167fef53";
export const B3_E_BASE_COMMIT = "d311bcff7d6e9b4a2b5d8ba4a3bcaafd42224323";
/** The accepted, merged B3-E (#146) head: the immutable end of its slice census. */
export const B3_E_HEAD_COMMIT = "7f2b806245486532fdcbb3444239c5c1ad5a6f96";
/** if6b-stage.ts exactly as the accepted B3-E head left it (immutable; checked against the commit itself). */
export const B3_E_IF6B_ENGINE_SHA256 =
  "8fa2f234790cd65c121161a3df5aeee1c24ee29789fef7d0e7397f61effa95c1";
/** if6b-stage.ts at G1 (#148): the forward-class identity check also accepts the G1 segment between the forward segment and the terminal one. */
export const G1_IF6B_ENGINE_SHA256 =
  "7fa528f30ee0d0ca8f6152584599c5d999cc731bafb760ea3c5423d0c6cd01b5";
export const atB3EconomyBase = (path: string): Buffer =>
  execFileSync("git", ["show", `${B3_E_BASE_COMMIT}:${path}`]);
export const IF6B_SETTLEMENT_PATH = "packages/engine/src/temporal/if6b-settlement.ts";
export const IF6B_SETTLEMENT_SHA256 =
  "555c0312b48c407232ff24b31b7f804716d51f63f448b18c7883a9708d439ba5";
export const IF6B_SHARED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/contracts/src/temporal-custody.ts": {
    base: "549da088bd33c78c471832f1e20dde0c4395e907933b5da02a78236a264f14f8",
    head: "375f767cc2040c7b68d7474320af13ba0068160cb0d192c9bb8ff3971e6c7acc",
  },
  "packages/engine/src/commit/campaign-core.ts": {
    base: "41c21034ec40099d606c8672db4e84edf6dfdd4b3221ae3d3d8b8898945d07fc",
    head: "24f88502e71814d0e7c595307dedf648034fce5fd41f77b1057c63d122ec8959",
  },
  "packages/engine/src/economy/integrity.ts": {
    base: "4a5735aecccb687b8268fb859e377287550af161bfe54035491b650afcb3a029",
    head: "b58325dfe71f7573eb14da139d3f54055ed631e45ee66db70eb9aeb7b8cc4949",
  },
  "packages/engine/src/gm-wait-custody.ts": {
    base: "ae884c3cf10c9270f5243368c6fa38ce370d04f888a08165df4de1de752ff0b2",
    head: "2b2951dbf8d378d2d12f2fffd9f157108235c614aede9358b3e2a18328dec1ad",
  },
  "packages/engine/src/production/admission.ts": {
    base: "643166b1a7a3cb1df6fec2b22aefa1a2967145a2f31041b3cbe6dc470bbf5989",
    head: "03f3fba63862c53492f03671a1caa17d6411f9282ccc248e7bbe8c6f389e0551",
  },
  "packages/engine/src/production/integrity.ts": {
    base: "858fd65d9e5829c095362b67c340fc8bfb3c9e8fc07db6864d3788cfb435dd2c",
    head: "4a66b5fc9c429fa1e8a1ef2f3e64404db52cf1bdca2d50daf57fe6eb18105039",
  },
  "packages/engine/src/temporal/admission.ts": {
    base: "0a0eceab61eed0ccd0251e806bdd6db17ed075a413a1e0f8f012cd91fd299ae4",
    head: "942ba230fbf2e78952902a67fcd3519315b646f428e2235d967c2006531d82ba",
  },
  "packages/engine/src/temporal/coordinator.ts": {
    base: "59a082af663a17eccd85dd7f44ac5d51181073d455add0727ea62b89801465fd",
    head: "47a2177b24b00dc05e1b786d03356341e8da265388a25c5eb17a13630d182d2f",
  },
  "packages/engine/src/temporal/integrity.ts": {
    base: "c9c5782736e956bcafac6a6f82e2b1802632c1d344f8e8d4e7240c15bc4eaafd",
    head: "b54177eed4345e021ac4bce724a3ad196fd3d1f23c71b33daca29696e397bef9",
  },
};
export const IF6B_PACKAGE_PATHS: readonly string[] = [
  "packages/contracts/src/temporal-custody.ts",
  "packages/engine/gm-wait-catalogue/manifests/265c74a18ad9f0898ae079189b20b7e24b06bcb58c90798de1f3d6473bea08d3.json",
  "packages/engine/gm-wait-catalogue/manifests/63072512adffc31cd04c621832e5d8165440eb40551f99046675cd4c224ffe17.json",
  "packages/engine/src/commit/campaign-core.ts",
  "packages/engine/src/economy/integrity.ts",
  "packages/engine/src/gm-wait-catalogue-current.ts",
  "packages/engine/src/gm-wait-custody.ts",
  "packages/engine/src/production/admission.ts",
  "packages/engine/src/production/integrity.ts",
  "packages/engine/src/temporal/admission.ts",
  "packages/engine/src/temporal/coordinator.ts",
  "packages/engine/src/temporal/if6b-settlement.ts",
  "packages/engine/src/temporal/if6b-stage.ts",
  "packages/engine/src/temporal/integrity.ts",
];
export const atMergedB2 = (path: string): Buffer =>
  execFileSync("git", ["show", IF6B_BASE_COMMIT + ":" + path]);
export function if6bSuccessorIdentity(path: string, b2Hash: string): string {
  const step = IF6B_SHARED_DELTAS[path];
  if (!step) return b2Hash;
  if (step.base !== b2Hash) throw new Error("IF-6b predecessor identity differs at " + path);
  return step.head;
}
