import { execFileSync } from "node:child_process";
export const IF6B_BASE_COMMIT = "728104565662fece3e76be5b94c28f3c4201dbb7";
export const IF6B_ENGINE_PATH = "packages/engine/src/temporal/if6b-stage.ts";
export const IF6B_ENGINE_SHA256 =
  "59c8abe2bff6924fe8631f06a16c3b64c732115cba8459553695a1896c6da37d";
export const IF6B_SETTLEMENT_PATH = "packages/engine/src/temporal/if6b-settlement.ts";
export const IF6B_SETTLEMENT_SHA256 =
  "d2cb6a9c0ce253287b7621a338805c35b541056b37454f142783a180dcf6f7d1";
export const IF6B_SHARED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/contracts/src/temporal-custody.ts": {
    base: "549da088bd33c78c471832f1e20dde0c4395e907933b5da02a78236a264f14f8",
    head: "6965e250dbdb0b02b77545e8c1b597ad8bacd46852cd985b0b004c3ff58e61c7",
  },
  "packages/engine/src/commit/campaign-core.ts": {
    base: "41c21034ec40099d606c8672db4e84edf6dfdd4b3221ae3d3d8b8898945d07fc",
    head: "68dd0e0c31c63ff8cbdf6e010d565c358913b45d8358853b44c8ce9a7486fdbd",
  },
  "packages/engine/src/economy/integrity.ts": {
    base: "4a5735aecccb687b8268fb859e377287550af161bfe54035491b650afcb3a029",
    head: "b58325dfe71f7573eb14da139d3f54055ed631e45ee66db70eb9aeb7b8cc4949",
  },
  "packages/engine/src/gm-wait-custody.ts": {
    base: "ae884c3cf10c9270f5243368c6fa38ce370d04f888a08165df4de1de752ff0b2",
    head: "fc770652cd6d8e0965e30bd52b9a2b45f123b844ac5ba003099edd6c55860b4b",
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
    head: "e342b84c739dc707f9c66ada34891de0bdcb5c1775ad1529814662b904749c4c",
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
  "packages/engine/gm-wait-catalogue/manifests/50a4f44ee76a590b31a88b719d53e42ddb5d475269feb49b6544312176a3d3f5.json",
  "packages/engine/gm-wait-catalogue/manifests/818c03456cffd2084af2f8e5e1c5f2a5489fa043d5ff6c298cbe307e04437c78.json",
  "packages/engine/gm-wait-catalogue/manifests/acecb5c9010cc6239544c7d926bb72971a8fe8c32cbcced38c43eec2ebd90748.json",
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
