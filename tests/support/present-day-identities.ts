// PRESENT-DAY (PR #94 head) identities of the source files and directory trees that PR #94 changed AFTER the older conformance suites were
// written and that those suites used to pin. THE ONLY PLACE that may state them. They are NOT main pins, NOT base pins and NOT slice-head pins
// of any older slice: the older suites record the originals as history (tests/support/historical-pin-inventory.ts) and never compare these
// files with the working tree. A later change to any of them updates THIS table only. Generated from the census; verified by
// tests/conformance/historical-pin-provenance-conformance.test.ts, which also fails if an older suite or document repeats any value below.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";

export const PRESENT_DAY_CODE_IDENTITIES: Readonly<Record<string, string>> = {
  "packages/contracts/src/index.ts":
    "34cd2b85657d46f8641bbb8df09f3896a3c668afa58b5102eab09b95ccc77652",
  "packages/contracts/src/referee.ts":
    "11f76d1df0cac6e0dc67d8298bab4271e6f3edc672c6ed687e64ac38bd35a868",
  "packages/engine/src/epistemic/observation.ts":
    "11fccd5aac7da3fb0e09ec0794bb47d26e0f287371ceebcae79af90b20c939ca",
  "packages/engine/src/index.ts":
    "18a0edbe9aadf9c6aa2282a475d25600c55a1d264141aa2973a0bb46e9fa3f8e",
  "packages/engine/src/owners/admission.ts":
    "2e3ec95e6b0e6c333c789d3baf8a2edb97a260980cd0320d22ab576972f8e1fd",
  "packages/engine/src/referee/adapter.ts":
    "366444215f6558c8a407407b86a8a2332560e5093640ab30830d116e39a74314",
  "packages/engine/src/referee/admission.ts":
    "848f24a880dbab2e4f73eab5d5ce326d04255742d08c9f2b686b8461e3a7e079",
  "packages/engine/src/referee/derive.ts":
    "9dc9780ad928462b3761ff610db30437fe758a6cf3f50c51be524740a215f18a",
  "packages/engine/src/referee/integrity.ts":
    "22134264b0b5be4b2246116f59c116a645b6609037f551d78013e4ce4e1691fa",
  "packages/engine/src/world/canonical-campaign.ts":
    "d9f2a9f59af9de83b092b715c1d6813c919556eb92789b499921ea3a97dcbbcc",
  "packages/engine/src/world/fallback-custody.ts":
    "89a02e4ef44529557c7eb5564e5a3b29b33eb2b11f1aaac1149151c9ef8cf49f",
  "packages/engine/src/world/integrity.ts":
    "5509681a0f30fa21448d0969cbfea44b503559963745eefc6490b223988bb5d4",
  "packages/operator/src/cli.ts":
    "70a1da62e1df7de9c4d9e5cee047a4e8489fe17c20e4907303855ff9afe2b778",
  "packages/operator/src/confirmation.ts":
    "7283bae5d6144fd44f7ea6ec17a3d7e44040745339766e6b72ce274dc8ba16c7",
  "packages/operator/src/index.ts":
    "12b217c21778585ae2400402ed5a3fd63b2d12dedcb8cbcdd057f30fb2721245",
  "packages/operator/src/observation.ts":
    "afb54d18665a1527335cea3cb5c22ceccfbe106e68e708a6f63d2575d7b61669",
  "packages/operator/src/original-pc.ts":
    "eeeb2f272bee74d1f1c37a32c342820247b04598ace307514dc6bfe041356d17",
  "packages/operator/src/referee-exchange.ts":
    "b887dfe9d8b27cc8ef79e04e4e57d706eb6699b4a0077c75d21d9d5a0d4dcc17",
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
  "packages/operator/src": "fd18c6bae4360c7e9871fc0410b1ea2fcbf552d5e828de0ff60ba82e7dbf1532",
  "packages/protocol/src": "566471504652371ea4ad1979354d247b6d94696dcf78f93aabc12c8ab38b7784",
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
