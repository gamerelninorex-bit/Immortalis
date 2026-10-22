// BLUE v5.2-A1 conformance — SOURCE-QUALIFIED original-PC observation (bounded brief 2026-10-22, native pin 2026-10-21T16:38:01.462Z; exact
// base 78644258939d70fca2c94b110eeb1710b3543e7a). The slice adds a trusted-side source selector, a sixth, optional cited premise of the
// existing direct-perception question and one more sentinel-backed read of the Glance gateway. It moves no spec-lock pin, runtime-contract
// snapshot, acceptance-register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays unactivated), adds no owner, facet, fact
// kind, key space, schema, permission or dependency, edits none of the Epistemic admission/integrity/formation, projection, presentation,
// confirmation, referee transport or World-State modules it stands beside, and claims no genuine AI-host semantic evidence. Implementation
// pins change openly; frozen design, source lock, acceptance status and gates do not.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OWNER_WORLD_STATE, worldSourceConditionKey } from "@immortalis/contracts";
import { resolveKey } from "@immortalis/engine";
import { lock } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");

/** Byte-identical to the base 7864425: the slice consumes or stands beside every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "package.json": "66e7975f046947a4b51c51fd920b15ceab3450f81695306f232cdf4c59b80a86",
  "pnpm-lock.yaml": "60ccaabdaabfff2dd66003b0400303663bd072ca78551d112ca1859f3fb3bb28",
  "packages/contracts/package.json":
    "97fc8d2c066caa2d176bf2d39d4a86d4a4a84fa83308e40168646515e8707cee",
  "packages/engine/package.json":
    "9046279f28c13e77bed15960f6a5774b225b00f61df2f957175fc510a8b63d70",
  "packages/operator/package.json":
    "63ee7a2d221f7ded42b346c46cf1f55df468451709c79d10320976cdefd54302",
  "packages/protocol/package.json":
    "f920e90c2898236e2aee2e6ba152d28eaa14a927c16681251618b1b3a71db918",
  "packages/testkit/package.json":
    "9ae35b68a741efea5b5b55b46754122035628dea4a5c2235f796747560dc81e4",
  "packages/engine/src/owners/registry.ts":
    "c3c085fa2a124e9eb3ce86b03742f6be189851d017a461e7245dc2b33c9ad3a8",
  "packages/engine/src/index.ts":
    "979e435c37d3398f0d9d36de3d0998a62bafe15539f1c3bf8b757ff930e451b8",
  "packages/contracts/src/index.ts":
    "9647c60c0a743e641af0891f53f26b1b81eb46bbce6a2daead976add5d7da95a",
  "packages/contracts/src/epistemic-access.ts":
    "a7f2d4bf7ae5abedfd34a3f73f45b67ebab3521c7ff60d6a93feeb823cad865c",
  "packages/contracts/src/protocol-current-glance.ts":
    "c51e39c962137b912e05ce24a6590038afead2b32a891e145a43ece1b909ccba",
  "packages/protocol/src/index.ts":
    "2abd69a045e19c9d08d937fc21a12c895a6eb3d612fbdd01719be31d94052be5",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  "packages/engine/src/epistemic/adapter.ts":
    "91dadeae31967c1363bd010a1459943b2036685305bed7b343c302ce787634ab",
  "packages/engine/src/epistemic/admission.ts":
    "0172458a289e4014b15a1ae3179bd0b5d1cc8985af6acb984cf4818d130ec0d1",
  "packages/engine/src/epistemic/integrity.ts":
    "577777d9fcee52b3b89fb26398ed8c32426b7e769a3ed5a6a13adb507287d7a7",
  "packages/engine/src/epistemic/direct-observation.ts":
    "a0ca78beee98677b855fa863c449bf88a371b997713e68ce59807dbce8801033",
  "packages/engine/src/epistemic/declaration.ts":
    "754866e721064059052d4f37a170a7339d1a81eb29b9dd0ee9b9fa8f812b7257",
  "packages/engine/src/epistemic/provider.ts":
    "bfe7857aad391ec1374210ebf81bbb76dfb062ae7a5e27958b3adfcd4891dc5e",
  "packages/engine/src/epistemic/derive.ts":
    "28fa26e19e7ddb4f3961db2ff093c79f9d284a5acb960042292c5b4127687659",
  "packages/engine/src/referee/admission.ts":
    "91fd5daf300e3676b7b3849415d2f1924d1d32642ce245181ceaf1139d5275c1",
  "packages/engine/src/referee/integrity.ts":
    "77598855c7adfd864090d43725ee52bf2bcfc4d859b0792e0ff769a0a98a0284",
  "packages/engine/src/world/source-condition.ts":
    "ee3a28dd7b1f5d3efb0928e920e60118e3d069fe407d4da4689d35b6a016adf8",
  "packages/engine/src/world/canonical-campaign.ts":
    "956f6fe71ce244037785a4d08ad09acfd419693f91c3f5698b875206a7c70b6e",
  "packages/engine/src/source-drawdown/derive.ts":
    "e39c94647d6842e58b01b140d047d5b2280e3079300130ad3ed26aac82f503de",
  "packages/engine/src/source-drawdown/admission.ts":
    "00b58b5cba3b0552afbeb95d7dd002ad6e6e7ce09795e9f5ef2ed113def09d85",
  "packages/operator/src/confirmation.ts":
    "f0350fbd18cbf971afb30347d4a83400ef59d1fab8591eb07cfb815b98fcdbbf",
  "packages/operator/src/original-pc.ts":
    "ea023957d3ddd4e8dbab14111213d2d46d057a27564f59a413bb65e18a0d3f55",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/original-pc-locus.ts":
    "28d6c27351747faec4f2632f024ef69413629f2cef0cf0f994cb5e2ae9f92397",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  "packages/operator/src/index.ts":
    "3b15338caa7dcbbc6e12c528c76e342612b3eb540b1fd30a631ec81b96515a92",
  "packages/operator/src/player-view.ts":
    "639b7e44e13f0467880f8e8e6b1943ce9ac57c298cec4cdddcf953fac9818d31",
  "packages/operator/src/player-view-exchange.ts":
    "0e14d3bca44157903579692a65e2c5762856653e7fbdaba3f2fd3f25352c991d",
  "packages/operator/src/player-view-mcp.ts":
    "3925495aa279995dc2fc2d41d9040089ab01dcce17eabb5521d75cca8eace6b4",
  "packages/operator/src/referee-mcp.ts":
    "288de65f95267c91608e577c5d4a3338225a10a34b93db2f5d187786c56b22a9",
  "packages/operator/src/observe-request.ts":
    "ff97b8f7cc4b4441af72d676b055146881270931c860ae7f9b87d326e5789880",
  "packages/operator/src/observe-request-answer.ts":
    "f8a337c2321371da6a294dbbdd259a2f9a6234f19eff38471d9d88049c4bc430",
  "packages/operator/src/observe-request-mcp.ts":
    "e9eb04b34eb9a15f18d85bdd96c54151b3599e917be20a901edba741f08ad666",
  "packages/operator/src/observe-request-exchange.ts":
    "e92b96cd575b4e6f63dff8c1a0d4888a207a0b01a14e131b123eecafe8d5bb54",
};

/** The ten existing source files the slice modified: exactly the scoped deltas, pinned at the slice head. */
const MODIFIED: Readonly<Record<string, string>> = {
  "packages/contracts/src/referee.ts":
    "74a99f1aeebf737a472c3324fbb78d1b571f7b3c10503693c255c9518d5c62be",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/engine/src/epistemic/observation.ts":
    "7c5ee28d4281fa7413cf9fcd7230f331c79ac6851e773e2ad58b96d4d1e1aef1",
  "packages/engine/src/referee/adapter.ts":
    "bebb8ed99b72ec1f7eee8df2a9ddc8d41c3c1dbd63a45ddea43a92df8309d297",
  "packages/engine/src/referee/derive.ts":
    "0cb8751f573d8b51697825b44f5ea328d483b73c1360febd4d73f5a69796a8f4",
  "packages/operator/src/cli.ts":
    "9bc43dd47f3875fe825cf5ad3b86b4318eb4dbf0c677a5e2f23ed4309b218fbc",
  "packages/operator/src/observation.ts":
    "f7f35fd9e4e3c5a4d45683be5f99b43567694a6772f2f26d1ff4f8e7e19147a2",
  "packages/operator/src/referee-exchange.ts":
    "9ca6cfa023179e143a671a72baa8c49c49f92b00cfb7693a6bcc4ac228e2cb40",
  "packages/operator/src/referee-session.ts":
    "d2b5931b1d736e4678ff3d97866220b3b2c6f95b5b8a788bf6b42881653a385d",
  "packages/protocol/src/current-observation-glance.ts":
    "2ddad80dbc7b1d79a452a1066f8ad3f3efcef5f43e101d789369d5947da32607",
};

const TESTS = [
  "tests/unit/referee-source-observation-derive.test.ts",
  "tests/contract/source-observation-schemas.test.ts",
  "tests/integration/source-observation-foundation.test.ts",
  "tests/integration/source-observation-enforcement.test.ts",
  "tests/integration/source-observation-recovery.test.ts",
  "tests/security/source-observation-security.test.ts",
  "tests/security/source-observation-glance-control-flow.test.ts",
  "tests/conformance/source-observation-conformance.test.ts",
];
const DOC = "docs/source-qualified-observation-foundation.md";

describe("the frozen specification, the owners and the surfaces the slice stands beside are untouched", () => {
  it("the F-027 lock, runtime-contract snapshot, register and gates, the owner registry, the Epistemic route, the projection, the presentation, the confirmation, the referee transport and the World-State owners are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the spec lock is the same Git blob the earlier closeouts verified, and the frozen pins are the brief's", () => {
    const blob = createHash("sha1")
      .update(`blob ${readFileSync("spec/f027/spec-lock.json").length}\0`)
      .update(readFileSync("spec/f027/spec-lock.json"))
      .digest("hex");
    expect(blob).toBe("43e4325789488e155c60f2deae5028e44286d795");
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!.native_pin;
    expect(pin("F-014D")).toBe("2026-09-24T16:25:17.059Z");
    expect(pin("I-002")).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("F-014B")).toBe("2026-09-25T23:42:29.547Z");
    expect(pin("I-001")).toBe("2026-09-25T00:17:49.551Z");
    expect(pin("NPK")).toBe("2026-09-25T00:18:32.532Z");
  });

  it("the existing source files the slice modified are exactly these, and each is pinned at the slice head", () => {
    for (const [file, hash] of Object.entries(MODIFIED)) expect(sha(file), file).toBe(hash);
    expect(Object.keys(MODIFIED)).toHaveLength(10);
  });

  it("no owner, facet, fact kind or key space was added: a Source Condition is still World-State's own `world_source_condition` fact at its own key", () => {
    const kind = resolveKey(worldSourceConditionKey("w1", "src-1"))?.kind;
    expect(kind?.id).toBe("world_source_condition");
    expect(kind?.owner).toBe(OWNER_WORLD_STATE);
    expect(kind?.facet).toBe("world_source_condition");
    // a delivery and a profile are other kinds of fact, never mistaken for the source
    expect(resolveKey("world/w1/source-delivery/x")?.kind.id).toBe("world_source_delivery");
    expect(resolveKey("world/w1/profile")?.kind.id).not.toBe("world_source_condition");
  });

  it("no package gained a module, and no dependency changed (the package manifests and the lockfile are in the pinned set)", () => {
    // the slice's additions are tests, test support and one document: no `packages/*/src` file is new to any package
    const operator = readdirSync("packages/operator/src").filter(
      (f) => /source/.test(f) && f !== "additional-source.ts",
    );
    expect(operator).toEqual([]);
    for (const dir of ["engine", "contracts", "protocol", "testkit"])
      expect(
        readdirSync(`packages/${dir}/src`, { recursive: true })
          .map(String)
          .filter((f) => /source-observation|source-qualified/.test(f)),
        dir,
      ).toEqual([]);
  });
});

describe("the slice is what it says: operator-side, trusted-input, mechanism only, with its evidence honestly labelled", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  const NEW_FILES = [...TESTS, "tests/support/source-observation.ts"];

  it("every file the document names exists", () => {
    for (const f of [...NEW_FILES, DOC]) expect(existsSync(f), f).toBe(true);
    const doc = read(DOC);
    for (const f of TESTS.slice(0, -1)) expect(doc, f).toContain(f.replace(/^tests\/[a-z]+\//, ""));
  });

  it("the document claims no acceptance, no genuine-AI evidence, no gate or register movement, and names its brief, base and pins", () => {
    const doc = read(DOC);
    for (const phrase of [
      "No PASS acceptance is claimed here",
      "Evidence level 2",
      "NOT produced and NOT claimed",
      "scripted",
      "plumbing-only",
      "None used a genuine AI host",
      "No spec-lock pin, acceptance-register row, status or open gate moved",
      "40020af901e081279a61d16635561654",
      "2026-10-21T16:38:01.462Z",
      "78644258939d70fca2c94b110eeb1710b3543e7a",
      "43e4325789488e155c60f2deae5028e44286d795",
      "#72",
      "#73",
      "Mechanical conformance-pin adjustments",
    ])
      expect(doc, phrase).toContain(phrase);
    expect(doc).not.toMatch(/\bPASS\b(?! acceptance is claimed)/);
  });

  it("the scripted host says what it is, and no test or support file reaches a model, a provider, a network or a credential", () => {
    const support = read("tests/support/source-observation.ts");
    expect(support).toMatch(/PLUMBING ONLY/);
    expect(support).toMatch(/genuine AI-host semantic evidence and is NOT claimed/);
    for (const f of NEW_FILES.filter((f) => f !== TESTS[TESTS.length - 1]))
      expect(read(f), f).not.toMatch(
        /@anthropic-ai|api\.anthropic|openai|\bfetch\(|https?:\/\/|ANTHROPIC_API_KEY|process\.env\./i,
      );
  });

  it("the source selector is operator-side only: `--source` belongs to `observe-surroundings`, and no other command or surface accepts it", () => {
    const cli = read("packages/operator/src/cli.ts");
    expect(cli).toMatch(/"observe-surroundings": \["referee-wait", "source"\]/);
    expect(cli.match(/\bsource\b: \{ type: "string" \}/g)).toHaveLength(1);
    for (const cmd of ["relocate", "advance", "author-character", "establish-character-locus"])
      expect(cli).not.toMatch(new RegExp(`"${cmd}": \\[[^\\]]*"source"`));
  });

  it("the predecessor glance read-count pins moved with the one added slot and nothing else: nine identity getFacts and one group read of its own", () => {
    const body = read("packages/protocol/src/current-observation-glance.ts");
    const fn = body.slice(body.indexOf("export function readCurrentObservationGlance"));
    expect(fn.match(/view\.getFact\(/g)).toHaveLength(9);
    expect(fn.match(/view\.committedGroup\(/g)).toHaveLength(1);
    expect(fn).toMatch(/premiseKey\(5\)/);
    expect(fn.match(/\breturn\b/g)).toHaveLength(2);
  });
});
