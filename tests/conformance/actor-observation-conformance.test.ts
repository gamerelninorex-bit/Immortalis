// BLUE v5.2-A1 conformance — NON-PC NAMED-ACTOR SOURCE-QUALIFIED DIRECT PERCEPTION (bounded brief 2026-10-23, native pin
// 2026-10-22T20:32:06.873Z; exact base c89c1e50727b2b46b7de07ab880c8acc7118c42d, the merge of PR #83). The slice adds a fifth referee operation
// with its own literal, subject and premise kinds, the Epistemic owner's actor-observation-earned event and a trusted operator request. It moves
// no spec-lock pin, runtime-contract snapshot, acceptance-register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays
// unactivated), adds no owner, facet, fact kind, key space, permission, role or dependency, leaves the PC `F014D_DIRECT_PERCEPTION` operation
// and its `pc_id` subject, the PC observation and its Glance, the Named-Actor, World-State and Temporal modules byte-identical, and claims no
// genuine AI-host semantic evidence. Implementation pins change openly; frozen design, source lock, acceptance status and gates do not.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OWNER_EPISTEMIC_ACCESS,
  OWNER_REFEREE_KERNEL,
  REFEREE_OP_ACTOR_OBSERVATION,
  REFEREE_OP_OBSERVATION,
  FACET_EPISTEMIC_ACCESS,
  FACET_REFEREE_PROVENANCE,
} from "@immortalis/contracts";
import {
  ACTOR_OBSERVATION_BRIEF_SOURCE,
  EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_RULE,
  REFEREE_ACTOR_OBSERVATION_RULE,
  REFEREE_OBSERVATION_RULE,
  factKind,
  resolveKey,
} from "@immortalis/engine";
import { lock } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");

/** Byte-identical to the base c89c1e5: the slice consumes or stands beside every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
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
  "packages/contracts/src/epistemic-access.ts":
    "a7f2d4bf7ae5abedfd34a3f73f45b67ebab3521c7ff60d6a93feeb823cad865c",
  "packages/contracts/src/index.ts":
    "d916c2fb2c3a5b4295dd501ed54ac32e8720296b8e08de711869262619fec382",
  "packages/contracts/src/world-foundation.ts":
    "c22e815d803c4c677db8d3c1d47c9ddf920ac386db2809de37dfd42d47ba9337",
  "packages/contracts/src/actor-capability.ts":
    "1f5a982f7ded00eb1e240a6829550ed837999ff6356fa76e36fd0ad6f19e4a94",
  "packages/contracts/src/actor-coupling.ts":
    "ee204eb2426b4c86c2a80207fbf1eec2192f0d83d5ae5bb22f469fb86830e681",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/commit.ts":
    "a99df55a0c1efbe2ab366a0d3d55cea52496a0ed1e0cdf5974e37c5a8f20d2c8",
  "packages/contracts/src/protocol-current-glance.ts":
    "c51e39c962137b912e05ce24a6590038afead2b32a891e145a43ece1b909ccba",
  "packages/engine/src/actor/adapter.ts":
    "895f7d1586f0ef14ebb6a2113cf3826e8def11a89d789d7136d6a023da96bbcd",
  "packages/engine/src/actor/admission.ts":
    "756b35674886999879d67ce30e1444d96e1e4718b8f8d8eb9277f22529ad76ea",
  "packages/engine/src/actor/declaration.ts":
    "01e89c4f049d32be891bd09cad7352b215f67980c6cc82c55df7586d7c8db92f",
  "packages/engine/src/actor/derive.ts":
    "2db41d7ecba1d15220426acc0b1f4bfb601cffe1a0ce1afc1c15bce69c1a9591",
  "packages/engine/src/actor/integrity.ts":
    "978732804b3209378ef2f16b99a26c554ec6d411d406f77aae67dae51eef6ee6",
  "packages/engine/src/actor/provider.ts":
    "294369e690f0d7c70d5f3750e60809ceabff54768ec4cca2c423e2434a984a2d",
  "packages/engine/src/actor/randomized.ts":
    "f6896c6b0da65054cee21d0f2e5735c2b96622123f3cbc199f44fb4ac3b5abd0",
  "packages/engine/src/epistemic/observation.ts":
    "7c5ee28d4281fa7413cf9fcd7230f331c79ac6851e773e2ad58b96d4d1e1aef1",
  "packages/engine/src/epistemic/direct-observation.ts":
    "a0ca78beee98677b855fa863c449bf88a371b997713e68ce59807dbce8801033",
  "packages/engine/src/epistemic/derive.ts":
    "28fa26e19e7ddb4f3961db2ff093c79f9d284a5acb960042292c5b4127687659",
  "packages/engine/src/epistemic/provider.ts":
    "bfe7857aad391ec1374210ebf81bbb76dfb062ae7a5e27958b3adfcd4891dc5e",
  "packages/engine/src/world/source-condition.ts":
    "ee3a28dd7b1f5d3efb0928e920e60118e3d069fe407d4da4689d35b6a016adf8",
  "packages/engine/src/world/actor-coupling.ts":
    "4469c7605461dc0942fc092e9fa85f180b9f067d6a8ab972edb9db7aca764cf6",
  "packages/engine/src/world/actor-coupling-integrity.ts":
    "ca6638ef984e6d189d915068cb512fc1269ee921ae58dc2460c83a245b5e0f4f",
  "packages/engine/src/world/canonical-campaign.ts":
    "ac41e9a5f54bad92e5bb47f0fdc46daf1ecbfc4ea588fbcc51137b80859cdd9a",
  "packages/engine/src/world/integrity.ts":
    "0bf047d85464ff89ece139655421570d9e0b2dbd0a6859e0d9d52be3f183c516",
  "packages/engine/src/temporal/admission.ts":
    "1aa8b4acca2d0fe9967e93c07ef6d52479e7eba8b96d726e9923149afea0d193",
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/engine/src/temporal/graph.ts":
    "0c1eea854f40f176de165d8f62979fe3f4c8c87055b6def6996aa1b01dd8b124",
  "packages/engine/src/temporal/identity.ts":
    "8319d33aa9a5e0f15055600ec9aad3d9422adfe31e84a5c6d9c71cbfbc777c34",
  "packages/engine/src/temporal/integrity.ts":
    "8e0be8a4635d3827ee65a8388844b512c8fd2413f89cb254cb560e5e90d52918",
  "packages/engine/src/temporal/partition.ts":
    "000880a1d0daab2a3d994b80cbd76f75ecfc9edd7108273b321129ce7ea7d84a",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  "packages/protocol/src/active-pc-target-advance.ts":
    "bc1447da88e8abe9326fee82a84366a8559a22429870ad6631c9bcd5b46547cc",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "packages/protocol/src/current-observation-glance.ts":
    "2ddad80dbc7b1d79a452a1066f8ad3f3efcef5f43e101d789369d5947da32607",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/protocol/src/index.ts":
    "48931f5d25d9a4490d88bbbca5d925ee7534eddff4a64e2a55ed7cec08c8d58f",
  "packages/protocol/src/null-pc-ooc-advance.ts":
    "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68",
  "packages/protocol/src/null-pc-ooc-held-continuation.ts":
    "4040a181a8b081d5d9a8c265185b13a4d559e829500a5c5986e776e4b703343c",
  "packages/protocol/src/pc-corridor-relocation.ts":
    "855b28f4f2f70659249f947b4051940f9950f2b8fd97fe73bfd933a84c7c094c",
  "packages/protocol/src/pc-relocation.ts":
    "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
  "packages/protocol/src/pc-transfer-advance.ts":
    "92ac714a567384f2e4c4410f1525b9f803ea3821b5deee22da3e7ab5c3af6ee1",
  "packages/operator/src/observation.ts":
    "f7f35fd9e4e3c5a4d45683be5f99b43567694a6772f2f26d1ff4f8e7e19147a2",
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
  "packages/operator/src/player-view.ts":
    "639b7e44e13f0467880f8e8e6b1943ce9ac57c298cec4cdddcf953fac9818d31",
  "packages/operator/src/player-view-exchange.ts":
    "0e14d3bca44157903579692a65e2c5762856653e7fbdaba3f2fd3f25352c991d",
  "packages/operator/src/player-view-mcp.ts":
    "3925495aa279995dc2fc2d41d9040089ab01dcce17eabb5521d75cca8eace6b4",
  "packages/operator/src/observe-request.ts":
    "ff97b8f7cc4b4441af72d676b055146881270931c860ae7f9b87d326e5789880",
  "packages/operator/src/observe-request-answer.ts":
    "f8a337c2321371da6a294dbbdd259a2f9a6234f19eff38471d9d88049c4bc430",
  "packages/operator/src/observe-request-mcp.ts":
    "e9eb04b34eb9a15f18d85bdd96c54151b3599e917be20a901edba741f08ad666",
  "packages/operator/src/observe-request-exchange.ts":
    "e92b96cd575b4e6f63dff8c1a0d4888a207a0b01a14e131b123eecafe8d5bb54",
};

/** The existing source files the slice modified: exactly the scoped deltas, pinned at the slice head. */
const MODIFIED: Readonly<Record<string, string>> = {
  "packages/contracts/src/referee.ts":
    "9cd92b021479862c1688faf9bc69bc8bf98e0c22642e89e516c84b3d4d8a1bdd",
  "packages/engine/src/epistemic/adapter.ts":
    "b0034d6bd43c71a109c04b5ff03069f19eac02525bd18b78e3ee0413c085d0ba",
  "packages/engine/src/epistemic/admission.ts":
    "58f68c0ecb1c0da0de9a056694d6b3ce8775be94cfec54a9750d17a6aabdbb76",
  "packages/engine/src/epistemic/declaration.ts":
    "9a64dcff91afbe7230b5f8b2780900a6dd10dbc865c340aeaf46c804fdf57be8",
  "packages/engine/src/epistemic/integrity.ts":
    "0c7431eab036831715c4fe0f349bd8dbd2f0be5a8e90af09338593411a314cc8",
  "packages/engine/src/index.ts":
    "9f717f96c1c1c6255dd8b1e6ba3303533eed0c46d67e12caaa4ee8f3b604dc55",
  "packages/engine/src/owners/registry.ts":
    "13a9b46e8633898efc473f5c8ad77065960f3c82e712d6a9cdb16a64e562b364",
  "packages/engine/src/referee/adapter.ts":
    "7efa630d106c2e12e80fa405e9e246c392f9e2f0356c4f0be4a095d2dd3ac201",
  "packages/engine/src/referee/admission.ts":
    "c9bb21544624656c53b61132853d15e8ea6560f7f6f7f9a83b32bc895e7ac193",
  "packages/engine/src/referee/derive.ts":
    "697a8d92c7a0eab6598d06519d3717e7ab15f5a20279dea5e00ee2028c8f83ef",
  "packages/engine/src/referee/integrity.ts":
    "1b90545cf278d55d457db65ab52aa8bc1b1ef42fb406472feef0e85b2d54d01b",
  "packages/operator/src/cli.ts":
    "bdf3ad73053383f6272baf0cf17b22b6950d17ded0d789a501592dae5277691e",
  "packages/operator/src/confirmation.ts":
    "14bb6413dbd968c13879b0457627ddfe693322df84ad0ad89490ece0f9e2f971",
  "packages/operator/src/index.ts":
    "f5c1ed2f38eb7540da5a467f7c7012c7ffc5e14a7ddb50247728e1936739f552",
  "packages/operator/src/referee-exchange.ts":
    "59179f98e55b5774ef33c830be28da4cdfdc3985ed7c508e5f2d7d81060e3612",
  "packages/operator/src/referee-mcp.ts":
    "0499a87bd642f66c1968888f4156067177926b48f8e56b578ffc8c81fbd3a399",
  "packages/operator/src/referee-session.ts":
    "92a09f989789734efcdd4388d74b1b7535d9b4a7135276253b2e2ab27c018526",
};

const NEW_SOURCES = [
  "packages/engine/src/epistemic/actor-observation.ts",
  "packages/operator/src/actor-observation.ts",
];
const TESTS = [
  "tests/unit/referee-actor-observation-derive.test.ts",
  "tests/contract/actor-observation-schemas.test.ts",
  "tests/integration/actor-observation-foundation.test.ts",
  "tests/integration/actor-observation-enforcement.test.ts",
  "tests/integration/actor-observation-recovery.test.ts",
  "tests/integration/actor-observation-operator.test.ts",
  "tests/integration/actor-observation-mcp.test.ts",
  "tests/security/actor-observation-security.test.ts",
  "tests/conformance/actor-observation-conformance.test.ts",
];
const DOC = "docs/actor-source-observation-foundation.md";
const read = (f: string) => readFileSync(f, "utf8");

describe("the frozen specification, the owners and the surfaces the slice stands beside are untouched", () => {
  it("the F-027 lock, runtime-contract snapshot, register and gates, the PC observation and its Glance, the Named-Actor, World-State and Temporal owners and the protocol are byte-identical to the base", () => {
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
    expect(pin("WS-006")).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("WS-016")).toBe("2026-09-24T17:38:59.210Z");
    expect(pin("WG")).toBe("2026-09-25T13:44:22.668Z");
  });

  it("the existing source files the slice modified are exactly these, each differs from the base and is pinned at the slice head", () => {
    for (const [file, hash] of Object.entries(MODIFIED)) expect(sha(file), file).toBe(hash);
    expect(Object.keys(MODIFIED).sort()).toEqual([
      "packages/contracts/src/referee.ts",
      "packages/engine/src/epistemic/adapter.ts",
      "packages/engine/src/epistemic/admission.ts",
      "packages/engine/src/epistemic/declaration.ts",
      "packages/engine/src/epistemic/integrity.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/referee/adapter.ts",
      "packages/engine/src/referee/admission.ts",
      "packages/engine/src/referee/derive.ts",
      "packages/engine/src/referee/integrity.ts",
      "packages/operator/src/cli.ts",
      "packages/operator/src/confirmation.ts",
      "packages/operator/src/index.ts",
      "packages/operator/src/referee-exchange.ts",
      "packages/operator/src/referee-mcp.ts",
      "packages/operator/src/referee-session.ts",
    ]);
    for (const f of Object.keys(MODIFIED)) expect(Object.keys(UNCHANGED), f).not.toContain(f);
  });

  it("no package gained a module but the two the slice names, and no dependency changed (the manifests and the lockfile are in the pinned set)", () => {
    for (const f of NEW_SOURCES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/epistemic").sort()).toEqual([
      "actor-observation.ts",
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "direct-observation.ts",
      "integrity.ts",
      "observation.ts",
      "provider.ts",
    ]);
    expect(readdirSync("packages/operator/src").filter((f) => /^actor-/.test(f))).toEqual([
      "actor-observation.ts",
    ]);
    for (const dir of ["contracts", "protocol", "testkit"])
      expect(
        readdirSync(`packages/${dir}/src`, { recursive: true })
          .map(String)
          .filter((f) => /actor-observation/.test(f)),
        dir,
      ).toEqual([]);
  });
});

describe("no owner, facet, fact kind or key space was added: two governing citations were added to kinds that already existed", () => {
  it("a retained actor reading is still the referee kernel's own `referee_decision` fact at its own key, and an actor event is still the Epistemic owner's `epistemic_access_event`", () => {
    const decision = resolveKey(`referee/${"a".repeat(64)}/decision`)?.kind;
    expect(decision?.id).toBe("referee_decision");
    expect(decision?.owner).toBe(OWNER_REFEREE_KERNEL);
    expect(decision?.facet).toBe(FACET_REFEREE_PROVENANCE);
    const event = resolveKey("access/e1/event")?.kind;
    expect(event?.id).toBe("epistemic_access_event");
    expect(event?.owner).toBe(OWNER_EPISTEMIC_ACCESS);
    expect(event?.facet).toBe(FACET_EPISTEMIC_ACCESS);
    // the actor operation has no key space of its own
    expect(resolveKey(`referee/${"a".repeat(64)}/actor-decision`)).toBeNull();
    expect(resolveKey("access/e1/actor-event")).toBeNull();
  });

  it("each new citation is additive and exclusive to its value class, and every existing citation is unchanged", () => {
    const referee = factKind("referee_decision");
    expect(referee.alternateRules!.map((a) => a.rule)).toEqual([
      expect.anything(),
      REFEREE_OBSERVATION_RULE,
      REFEREE_ACTOR_OBSERVATION_RULE,
    ]);
    const actorAlt = referee.alternateRules![2]!;
    expect(actorAlt.rule).toBe(REFEREE_ACTOR_OBSERVATION_RULE);
    expect(actorAlt.admits({ operation: REFEREE_OP_OBSERVATION })).toBe(false);
    expect(actorAlt.admits({ operation: REFEREE_OP_ACTOR_OBSERVATION })).toBe(false); // not a record
    expect(referee.alternateRules![1]!.admits({ operation: REFEREE_OP_ACTOR_OBSERVATION })).toBe(
      false,
    );

    const event = factKind("epistemic_access_event");
    expect(event.alternateRules).toHaveLength(3);
    expect(event.alternateRules![1]!.rule).toBe(EPISTEMIC_ACCESS_OBSERVATION_RULE);
    expect(event.alternateRules![2]!.rule).toBe(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE);
    const base = {
      event_id: "e1",
      mode: "BOUNDED_SHARED_ACCESS",
      participants: ["actor-1"],
      source: { owner: "world_state", fact_key: "world/w/source/s", version: 1 },
      channel: "PERCEPTION",
      established_at: { unit: "u", value: 1 },
      payload: { referent: "r", content: "c", presented_attribution: null },
      representation: null,
    };
    const actorAdmits = event.alternateRules![2]!.admits;
    const pcAdmits = event.alternateRules![1]!.admits;
    expect(actorAdmits(base)).toBe(true);
    expect(pcAdmits(base)).toBe(false);
    const pc = { ...base, recipient_role: "role.player_character" };
    expect(actorAdmits(pc)).toBe(false);
    expect(pcAdmits(pc)).toBe(true);
    expect(actorAdmits({ ...base, channel: "BROADCAST" })).toBe(false);
    expect(actorAdmits({ ...base, representation: { capability_id: "x" } })).toBe(false);
    // the generic citation of the kind is unchanged and still governs the authored event
    expect(EPISTEMIC_ACCESS_RULE).not.toEqual(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE);
    expect(EPISTEMIC_ACCESS_OBSERVATION_RULE).not.toEqual(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE);
    expect(REFEREE_OBSERVATION_RULE).not.toEqual(REFEREE_ACTOR_OBSERVATION_RULE);
  });

  it("the new citations name this brief, its exact native pin and a bounded-brief basis, and cite F-014D at its frozen lock pin", () => {
    expect(ACTOR_OBSERVATION_BRIEF_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/40120af901e0814b98d5de8e1976b58b",
      native_pin: "2026-10-22T20:32:06.873Z",
    });
    expect(REFEREE_ACTOR_OBSERVATION_RULE.artifact).toBe(ACTOR_OBSERVATION_BRIEF_SOURCE.artifact);
    expect(REFEREE_ACTOR_OBSERVATION_RULE.native_pin).toBe(
      ACTOR_OBSERVATION_BRIEF_SOURCE.native_pin,
    );
    expect(REFEREE_ACTOR_OBSERVATION_RULE.effective_basis).toBe(
      "blue-bounded-brief-not-spec-locked",
    );
    expect(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE.native_pin).toBe(
      EPISTEMIC_ACCESS_RULE.native_pin,
    );
    expect(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE.artifact).toBe(EPISTEMIC_ACCESS_RULE.artifact);
    expect(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE.clause).toContain("2026-10-22T20:32:06.873Z");
  });
});

describe("the PC operation is not widened, and the actor's route is not the PC's", () => {
  it("the PC observation event derivation, formation, Glance and glance-facing predicate name no actor path", () => {
    for (const f of [
      "packages/engine/src/epistemic/observation.ts",
      "packages/engine/src/epistemic/direct-observation.ts",
      "packages/protocol/src/current-observation-glance.ts",
    ])
      expect(read(f), f).not.toMatch(/actor_id|ACTOR_OBSERVATION|actorObservation|F014D_ACTOR/);
  });

  it("the Glance still reads the Player Character's predicate: `isObservationEarnedFact` is the PC citation alone", () => {
    const decl = read("packages/engine/src/epistemic/declaration.ts");
    expect(decl).toMatch(
      /export const isObservationEarnedFact = [^;]*EPISTEMIC_ACCESS_OBSERVATION_RULE\);/,
    );
    expect(decl).toMatch(/export const isEventTriggeredFormationFact/);
    expect(read("packages/protocol/src/current-observation-glance.ts")).toMatch(
      /isObservationEarnedFact/,
    );
  });

  it("the actor route writes no actor-side, World-State, PC or Temporal key and never names a role", () => {
    for (const f of NEW_SOURCES.filter((f) => /engine/.test(f))) {
      const text = read(f);
      expect(text, f).not.toMatch(
        /NamedActorAdapter|actorCapabilityBasisKey|worldActorCouplingKey|pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|establishCanonicalTime|OWNER_NAMED_ACTOR|OWNER_POPULATION/,
      );
      expect(text, f).not.toMatch(/recipient_role|RECIPIENT_ROLE_PLAYER_CHARACTER/);
    }
  });
});

describe("the slice is what it says: operator-side, trusted-input, mechanism only, with its evidence honestly labelled", () => {
  it("every file the document names exists", () => {
    for (const f of [...NEW_SOURCES, ...TESTS, "tests/support/actor-observation.ts", DOC])
      expect(existsSync(f), f).toBe(true);
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
      "40120af901e0814b98d5de8e1976b58b",
      "2026-10-22T20:32:06.873Z",
      "c89c1e50727b2b46b7de07ab880c8acc7118c42d",
      "#72",
      "#73",
      "Composition choices BLUE should rule on",
      "Mechanical conformance-pin adjustments",
    ])
      expect(doc, phrase).toContain(phrase);
    expect(doc).not.toMatch(/\bPASS\b(?! acceptance is claimed)/);
  });

  it("the scripted host says what it is, and no test or support file reaches a model, a provider, a network or a credential", () => {
    const support = read("tests/support/actor-observation.ts");
    expect(support).toMatch(/PLUMBING ONLY/);
    expect(support).toMatch(/genuine AI-host semantic evidence and is NOT claimed/);
    for (const f of [...TESTS.slice(0, -1), "tests/support/actor-observation.ts"])
      expect(read(f), f).not.toMatch(
        /@anthropic-ai|api\.anthropic|openai|\bfetch\(|https?:\/\/|ANTHROPIC_API_KEY|process\.env\./i,
      );
  });

  it("the actor request is operator-side only: `observe-actor` takes the actor, the capability and the source, and no other command accepts them", () => {
    const cli = read("packages/operator/src/cli.ts");
    expect(cli).toMatch(/"observe-actor": \["actor", "capability", "source"\]/);
    expect(cli.match(/\bactor: \{ type: "string" \}/g)).toHaveLength(1);
    expect(cli.match(/\bcapability: \{ type: "string" \}/g)).toHaveLength(1);
    for (const cmd of ["relocate", "advance", "author-character", "observe-surroundings"])
      expect(cli).not.toMatch(new RegExp(`"${cmd}": \\[[^\\]]*"(actor|capability)"`));
    // the fifth operation is bound only when the trusted operator asks for it; the four-operation default is unchanged
    expect(cli).toMatch(/values\["actor-perception"\] === true/);
  });

  it("the fifth operation has one task document, one answer shape and one MCP branch, each naming the actor's own premise kinds", () => {
    const exchange = read("packages/operator/src/referee-exchange.ts");
    expect(exchange.match(/REFEREE_OP_ACTOR_OBSERVATION/g)!.length).toBeGreaterThanOrEqual(2);
    expect(exchange).toMatch(
      /decide NOTHING about what the actor makes of it|You decide NOTHING about what the actor makes of it/,
    );
    expect(read("packages/operator/src/referee-mcp.ts")).toMatch(
      /ActorObservationHostDecisionSchema/,
    );
  });
});
