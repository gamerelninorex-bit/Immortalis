// PRESENT-DAY (PR #94 head) identities of the source files and directory trees that PR #94 changed AFTER the older conformance suites were
// written and that those suites used to pin. THE ONLY PLACE that may state them. They are NOT main pins, NOT base pins and NOT slice-head pins
// of any older slice: the older suites record the originals as history (tests/support/historical-pin-inventory.ts) and never compare these
// files with the working tree. A later change to any of them updates THIS table only. Generated from the census; verified by
// tests/conformance/historical-pin-provenance-conformance.test.ts, which also fails if an older suite or document repeats any value below.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";

export const PRESENT_DAY_CODE_IDENTITIES: Readonly<Record<string, string>> = {
  "packages/contracts/src/index.ts":
    "0326939feab773d2a2807b63833f8afa876c486c4e26b2d0906f16d0db84a9fd",
  "packages/contracts/src/referee.ts":
    "11f76d1df0cac6e0dc67d8298bab4271e6f3edc672c6ed687e64ac38bd35a868",
  "packages/engine/src/epistemic/observation.ts":
    "11fccd5aac7da3fb0e09ec0794bb47d26e0f287371ceebcae79af90b20c939ca",
  "packages/engine/src/index.ts":
    "35f7107f6313a0970bca81875ecf0ab410c5cda33a0dacf1aae6016db774ca48",
  "packages/engine/src/owners/admission.ts":
    "7f140feb8657db6f1296b591f6e99a402b8b20428550aaa2cc641dd1a9c4f279",
  "packages/engine/src/referee/adapter.ts":
    "366444215f6558c8a407407b86a8a2332560e5093640ab30830d116e39a74314",
  "packages/engine/src/referee/admission.ts":
    "52ca74c3537206912d5d43f9bbd47afbbd35cceea13a38081d88e700bdeb7c79",
  "packages/engine/src/referee/derive.ts":
    "9dc9780ad928462b3761ff610db30437fe758a6cf3f50c51be524740a215f18a",
  "packages/engine/src/referee/integrity.ts":
    "0de08afe1f82134d7b0648a5e4c6979a94915a807648d9b240f4d65c9de5a844",
  "packages/engine/src/world/canonical-campaign.ts":
    "4bfaf68c1383e6cddbed6cb3028d06ef9c0a3cccc26a40f0dbfbac15ec575090",
  "packages/engine/src/world/fallback-custody.ts":
    "89a02e4ef44529557c7eb5564e5a3b29b33eb2b11f1aaac1149151c9ef8cf49f",
  "packages/engine/src/world/integrity.ts":
    "ad1272249ed8637f538ef08c3a97cba71c683a13069f44ed5bd7c497376d98da",
  "packages/operator/src/cli.ts":
    "380bdea3f0a0252de4a78514f83e471aa5184058246cfcda67135843b711d7c7",
  "packages/operator/src/confirmation.ts":
    "c52bb99b5a9bad89490cb9eb5b93a5985e6c1b705de3886bf98523404f0a24a0",
  "packages/operator/src/index.ts":
    "e971e2d15b8f0d9011034f8509c35dda72824b61fc3be2eef81a3b24965980e7",
  "packages/operator/src/observation.ts":
    "f24b70a38eaa59dd21c93e4b7effc96d5bd198dc31e5fae65557462472fae5dc",
  "packages/operator/src/original-pc.ts":
    "b692d3180afa7a432addfc84a614370095b056a505560c99c0d61434144655c8",
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
  "packages/engine/src/referee": "8ab00353ae90c0617efc749cabc1541976396c0f843a757e7a467bdfd342fe30",
  "packages/operator/src": "0e0714b1b0939acda9724637c051c53665e654a111bf3161791f87a7661b5067",
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
