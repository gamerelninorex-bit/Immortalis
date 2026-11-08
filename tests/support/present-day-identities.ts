// PRESENT-DAY (PR #94 head) identities of the source files and directory trees that PR #94 changed AFTER the older conformance suites were
// written and that those suites used to pin. THE ONLY PLACE that may state them. They are NOT main pins, NOT base pins and NOT slice-head pins
// of any older slice: the older suites record the originals as history (tests/support/historical-pin-inventory.ts) and never compare these
// files with the working tree. A later change to any of them updates THIS table only. Generated from the census; verified by
// tests/conformance/historical-pin-provenance-conformance.test.ts, which also fails if an older suite or document repeats any value below.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";

export const PRESENT_DAY_CODE_IDENTITIES: Readonly<Record<string, string>> = {
  "packages/contracts/src/index.ts":
    "6f182fc931f94d0a819c159d2fded2ae1fc81c5ffbdab744b3f873fb7aa94af4",
  "packages/contracts/src/referee.ts":
    "11f76d1df0cac6e0dc67d8298bab4271e6f3edc672c6ed687e64ac38bd35a868",
  "packages/engine/src/epistemic/observation.ts":
    "11fccd5aac7da3fb0e09ec0794bb47d26e0f287371ceebcae79af90b20c939ca",
  "packages/engine/src/index.ts":
    "8fc1229fb31349f6b9ec3afbdb5b273c9031b352a777d9c090b424c8cebc135d",
  "packages/engine/src/owners/admission.ts":
    "67a526f091dec113647d6100cd2660612ebf2c2e9435f61fad3c72aa246a80f9",
  "packages/engine/src/referee/adapter.ts":
    "366444215f6558c8a407407b86a8a2332560e5093640ab30830d116e39a74314",
  "packages/engine/src/referee/admission.ts":
    "848f24a880dbab2e4f73eab5d5ce326d04255742d08c9f2b686b8461e3a7e079",
  "packages/engine/src/referee/derive.ts":
    "9dc9780ad928462b3761ff610db30437fe758a6cf3f50c51be524740a215f18a",
  "packages/engine/src/referee/integrity.ts":
    "22134264b0b5be4b2246116f59c116a645b6609037f551d78013e4ce4e1691fa",
  "packages/engine/src/world/canonical-campaign.ts":
    "8d53dd9affa1c46734abde91045735cb7fdad8e9a4b5633b3d836ef7a96db276",
  "packages/engine/src/world/fallback-custody.ts":
    "89a02e4ef44529557c7eb5564e5a3b29b33eb2b11f1aaac1149151c9ef8cf49f",
  "packages/engine/src/world/integrity.ts":
    "ad1272249ed8637f538ef08c3a97cba71c683a13069f44ed5bd7c497376d98da",
  "packages/operator/src/cli.ts":
    "70a1da62e1df7de9c4d9e5cee047a4e8489fe17c20e4907303855ff9afe2b778",
  "packages/operator/src/confirmation.ts":
    "7283bae5d6144fd44f7ea6ec17a3d7e44040745339766e6b72ce274dc8ba16c7",
  "packages/operator/src/index.ts":
    "20c9574bc69ed925888a1b232829b7a98a82bcf8c1484a0adb40a30a8e782b34",
  "packages/operator/src/observation.ts":
    "afb54d18665a1527335cea3cb5c22ceccfbe106e68e708a6f63d2575d7b61669",
  "packages/operator/src/original-pc.ts":
    "3ba2c4a726e080d697c3edc7610971d2c4318eb293f9aed27fab8cdee4f8347a",
  "packages/operator/src/referee-exchange.ts":
    "4a90c9c2fbd76ca69611652d4af86d172d4e3155b245eea835e8b411b1d5a4ed",
  "packages/operator/src/referee-mcp.ts":
    "24d11bf7982efc1b2e77cddb59f43724dfb9a40a32d2dcb921d897913f6472cb",
  "packages/operator/src/referee-session.ts":
    "9bcaac5ba355405becb2563f3257f68a7e8b0c50525d6ed3107cd720b1ca973b",
  "packages/protocol/src/current-observation-glance.ts":
    "7c0354e4ecc73ff6329a5c781f3b273ede3f55ae67393bba3a814ea4bf6e633d",
  // directory trees (sorted `path\0sha256(bytes)\n`, the algorithm auditory-premises-conformance uses)
  "packages/engine/src/epistemic":
    "bc43048c097c34959bf42e82ebee7ffdb31048bd69faf3ebbf446aae88a1807a",
  "packages/engine/src/referee": "83e5b0450fe94bcdc2b35e979976dffa2175e830a46f82acff0c82b6f9a8c0eb",
  "packages/operator/src": "0e8a59599374f7f4ca23b5955493d4aa41698b06b1d2d3331c6be1f53e833738",
  "packages/protocol/src": "8fc3a1cabfd3d2415ca15013ec946d65c2c59bd363c9e35a826ff07447403186",
};

const fileSha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const walkFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );

/** Present-day identity of a file or of a directory tree. */
export const identityOf = (path: string): string => {
  if (!statSync(path).isDirectory()) return fileSha256(path);
  const h = createHash("sha256");
  for (const f of walkFiles(path).sort()) h.update(`${f}\0${fileSha256(f)}\n`);
  return h.digest("hex");
};
