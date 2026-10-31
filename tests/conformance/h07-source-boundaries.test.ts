// H-07 scoped guard changes do not change source locks, receipt computation or writer arbitration.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const source = (p: string) => readFileSync(p, "utf8");
const unchanged = {
  "spec/f027/spec-lock.json": "2133b8b80f3078c90d84d5d75845169164bafcd8541aa614981da63ac55af18c",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "packages/contracts/src/campaign-package.ts":
    "3aba7a80634026009c1e3331f9d676b784452b0ee072d4aae2233425b4d1d265",
  "packages/contracts/src/commit.ts":
    "a99df55a0c1efbe2ab366a0d3d55cea52496a0ed1e0cdf5974e37c5a8f20d2c8",
  "packages/engine/src/owners/registry.ts":
    "926aa1af36d783ef3760524ad36f3ebc6994f906bf9861bbbdc1e1adb8d97116",
  "packages/engine/src/world/actor-presence.ts":
    "e26e2cc5018c36a1dc401de2fb3545171f8684570ade41ff595247c6ca29d46e",
  "packages/engine/src/world/auditory-premises.ts":
    "4de3420c206f0522a7af3221912fccdf9e3189facff7ffe8a4dbf3c28fdac6e6",
};
it("all frozen artifacts, owner registry and R1/S1-P1 historical rule implementations retain their source bytes", () => {
  for (const [file, hash] of Object.entries(unchanged)) expect(sha(source(file)), file).toBe(hash);
});
it("the H-01 lock arbiter remains byte-identical", () => {
  const s = source("packages/engine/src/persistence/file-package.ts");
  expect(
    sha(
      s.slice(s.indexOf("const LOCK_NAME ="), s.indexOf("export async function openFileCampaign(")),
    ),
  ).toBe("4bce741a625e8b05e6e48c0764e940a2c2d7f81335c2f51488d06f51ef961bd2");
});
it("canonical full-state receipt computation remains byte-identical", () => {
  const s = source("packages/engine/src/commit/campaign-core.ts");
  expect(sha(s.slice(s.indexOf("  #compute(\n"), s.indexOf("  #validate(\n")))).toBe(
    "27b16bb068f5078ac130b88cbb9b295ffbe688670d8eed651ac1f7f9fc942e8a",
  );
});
