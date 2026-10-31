// Referee restart repair composition: trusted wait cancellation only; exchange wire formats, authentication and all owner/spec pins remain unchanged.
// Zero-confirmation request-evidence composition: interface digests only; owner/spec pins remain unchanged.
// PR91 BLUE HOLD composition: readable review adaptation and exact private binding recovery; frozen owners/source locks unchanged.
// Composed implementation pin update: BLUE two-review brief 40620af901e0812d8b30fbaaa33f4bf3. Frozen sources/owners unchanged.
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
  "spec/f027/spec-lock.json": "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "package.json": "b2acccd475eb15d803c5bdb96d77d5566fe1280cdde3ed22c59ad2383c0b0268",
  "pnpm-lock.yaml": "cdc03a8da34594c1b8d9ced92a35975dcbb27a274456183014dc5a7ab8aec08a",
  "packages/contracts/package.json":
    "97fc8d2c066caa2d176bf2d39d4a86d4a4a84fa83308e40168646515e8707cee",
  "packages/engine/package.json":
    "36dd3befb2a4ee36ffa14b42dc8a00e3ac51497bf9baed2d9331e66a1add1f02",
  "packages/operator/package.json":
    "80925fae3972571622e7871ce4925baabdc58aad1071cee951cf402b4167bdd0",
  "packages/protocol/package.json":
    "f920e90c2898236e2aee2e6ba152d28eaa14a927c16681251618b1b3a71db918",
  "packages/testkit/package.json":
    "9ae35b68a741efea5b5b55b46754122035628dea4a5c2235f796747560dc81e4",
  "packages/engine/src/owners/registry.ts":
    "6576bcd346c9f4c8c582f99fe2c04d28912b339399a4465c0bd251e5f57002e4",
  "packages/engine/src/index.ts":
    "35f7107f6313a0970bca81875ecf0ab410c5cda33a0dacf1aae6016db774ca48",
  "packages/contracts/src/index.ts":
    "0326939feab773d2a2807b63833f8afa876c486c4e26b2d0906f16d0db84a9fd",
  "packages/contracts/src/epistemic-access.ts":
    "a7f2d4bf7ae5abedfd34a3f73f45b67ebab3521c7ff60d6a93feeb823cad865c",
  "packages/contracts/src/protocol-current-glance.ts":
    "c51e39c962137b912e05ce24a6590038afead2b32a891e145a43ece1b909ccba",
  "packages/protocol/src/index.ts":
    "d5ab99e3dc2aea16ad113dc1d30cdee5fe7138b50bcb7ab5072a5a51f7051b75",
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
    "52ca74c3537206912d5d43f9bbd47afbbd35cceea13a38081d88e700bdeb7c79",
  "packages/engine/src/referee/integrity.ts":
    "0de08afe1f82134d7b0648a5e4c6979a94915a807648d9b240f4d65c9de5a844",
  "packages/engine/src/world/source-condition.ts":
    "ee3a28dd7b1f5d3efb0928e920e60118e3d069fe407d4da4689d35b6a016adf8",
  "packages/engine/src/world/canonical-campaign.ts":
    "4bfaf68c1383e6cddbed6cb3028d06ef9c0a3cccc26a40f0dbfbac15ec575090",
  "packages/engine/src/source-drawdown/derive.ts":
    "e39c94647d6842e58b01b140d047d5b2280e3079300130ad3ed26aac82f503de",
  "packages/engine/src/source-drawdown/admission.ts":
    "da3af9afbcc5cf70476af11e9e71f7836934dcd556ba0186404566034eb4021d",
  "packages/operator/src/confirmation.ts":
    "c52bb99b5a9bad89490cb9eb5b93a5985e6c1b705de3886bf98523404f0a24a0",
  "packages/operator/src/original-pc.ts":
    "b692d3180afa7a432addfc84a614370095b056a505560c99c0d61434144655c8",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/original-pc-locus.ts":
    "834f0bbbdfe52e1dc68fdec0567c91905bda23b98eddac9fb4eff66c37449c8c",
  "packages/operator/src/locality.ts":
    "808a3e0329822ef6085e48f7db02a7354d25995d7e1b24a7d8f1a90f7a8c6c2a",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/terminal.ts":
    "1e2486167cc16a30ae52a15b8059d73e44f4d68dbd7f51b79ee936ca73a2708e",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  "packages/operator/src/index.ts":
    "e971e2d15b8f0d9011034f8509c35dda72824b61fc3be2eef81a3b24965980e7",
  "packages/operator/src/player-view.ts":
    "639b7e44e13f0467880f8e8e6b1943ce9ac57c298cec4cdddcf953fac9818d31",
  "packages/operator/src/player-view-exchange.ts":
    "b185396a7858b9ab3133bf6e173ae76c7084ffcda335e8dc6cd3e0f22972a04e",
  "packages/operator/src/player-view-mcp.ts":
    "3925495aa279995dc2fc2d41d9040089ab01dcce17eabb5521d75cca8eace6b4",
  "packages/operator/src/referee-mcp.ts":
    "24d11bf7982efc1b2e77cddb59f43724dfb9a40a32d2dcb921d897913f6472cb",
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
    "200300bffc43d404f53ac22a4a24a6aa3c8377b07a41b546bb4b5cd3b47f0d4d",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/engine/src/epistemic/observation.ts":
    "11fccd5aac7da3fb0e09ec0794bb47d26e0f287371ceebcae79af90b20c939ca",
  "packages/engine/src/referee/adapter.ts":
    "366444215f6558c8a407407b86a8a2332560e5093640ab30830d116e39a74314",
  // adjusted openly for N-1 (RED, #72): derive.ts gains `deliveryWithheld` (the completed-collection variant's withheld set) and
  // comment-only authority-label corrections; see tests/integration/collection-observation-withheld.test.ts
  "packages/engine/src/referee/derive.ts":
    "22a7cc87c62145c27df638c1a6da0d319e678999e7b4b62b877d2945f6a0dd69",
  "packages/operator/src/cli.ts":
    "380bdea3f0a0252de4a78514f83e471aa5184058246cfcda67135843b711d7c7",
  "packages/operator/src/observation.ts":
    "f24b70a38eaa59dd21c93e4b7effc96d5bd198dc31e5fae65557462472fae5dc",
  "packages/operator/src/referee-exchange.ts":
    "db4c6f45df99efa11d91807a4d70427ab424f5884c69fcefb85fc5bf70f88d92",
  "packages/operator/src/referee-session.ts":
    "9bcaac5ba355405becb2563f3257f68a7e8b0c50525d6ed3107cd720b1ca973b",
  "packages/protocol/src/current-observation-glance.ts":
    "7c0354e4ecc73ff6329a5c781f3b273ede3f55ae67393bba3a814ea4bf6e633d",
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
    expect(blob).toBe("2df29edfd08b1fb986666c94153f9432cf227324");
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
      "2df29edfd08b1fb986666c94153f9432cf227324",
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
    expect(cli).toMatch(/"observe-surroundings": \["referee-wait", "source", "attention"\]/);
    expect(cli.match(/\bsource\b: \{ type: "string" \}/g)).toHaveLength(1);
    for (const cmd of ["relocate", "advance", "author-character", "establish-character-locus"])
      expect(cli).not.toMatch(new RegExp(`"${cmd}": \\[[^\\]]*"source"`));
  });

  it("the predecessor glance read-count pins moved with the one added slot and nothing else: twelve identity getFacts and one group read after the bounded collection qualification repair, plus the one fixed GM-scene citation slot (thirteen)", () => {
    const body = read("packages/protocol/src/current-observation-glance.ts");
    const fn = body.slice(body.indexOf("export function readCurrentObservationGlance"));
    expect(fn.match(/view\.getFact\(/g)).toHaveLength(13);
    expect(fn.match(/view\.committedGroup\(/g)).toHaveLength(1);
    expect(fn).toMatch(/premiseKey\(5\)/);
    expect(fn.match(/\breturn\b/g)).toHaveLength(2);
  });
});
