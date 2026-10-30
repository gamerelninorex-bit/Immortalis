// Referee restart repair composition: trusted wait cancellation only; exchange wire formats, authentication and all owner/spec pins remain unchanged.
// Zero-confirmation request-evidence composition: interface digests only; owner/spec pins remain unchanged.
// PR91 BLUE HOLD composition: readable review adaptation and exact private binding recovery; frozen owners/source locks unchanged.
// Composed implementation pin update: BLUE two-review brief 40620af901e0812d8b30fbaaa33f4bf3. Frozen sources/owners unchanged.
// Conformance evidence for the Original Active-PC Qualified Physical-Locus Custody slice (BLUE v5.1 bounded implementation brief, verified
// native pin 2026-10-11T05:30:16.307Z) on main edad9da9d1ceda032131dbae2fb52df080da55e9. Governing lock: spec/f027/spec-lock.json
// (F-027 v1.0 composed with F-027-CD1), unchanged. The slice adds a THIRD referee operation (physical placement) and a second, exclusive
// basis of the ONE existing `world_pc_locus_custody` fact kind. No register row, status, source pin, gate or lock moved; PF-6/F-028 stays
// BLOCKED / NOT ACTIVATED; IA/V rows are unpromoted. The brief itself is a construction source and is NOT a spec-lock pin.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ORIGINAL_ACTIVATION,
  PHYSICAL_VERDICTS,
  REFEREE_OP_PHYSICAL,
  REFEREE_SOURCES,
  PcPhysicalLocusCustodySchema,
  RefereeDecisionRecordSchema,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  I002_SOURCE,
  IR_SOURCE,
  ORIGINAL_PC_CUSTODY_BRIEF_SOURCE,
  REFEREE_PHYSICAL_RULE,
  REFEREE_RULE,
  WG_SOURCE,
  WORLD_PC_LOCUS_CUSTODY_RULE,
  WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE,
  factKind,
} from "@immortalis/engine";
import { code, gates, lock, register } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const shaJson = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const BRIEF_ID = "3f620af901e0811abc1ee604de833a41";
const BRIEF_PIN = "2026-10-11T05:30:16.307Z";

describe("IA-01 source/version fidelity: the composed authority is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice rests on are the exact pins observed at the base, and the lock itself is byte-identical", () => {
    expect(pin("WG").native_pin).toBe("2026-09-25T13:44:22.668Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(WG_SOURCE).toEqual({ artifact: pin("WG").url, native_pin: pin("WG").native_pin });
    expect(IR_SOURCE).toEqual({ artifact: pin("IR").url, native_pin: pin("IR").native_pin });
    expect(I002_SOURCE).toEqual({
      artifact: pin("I-002").url,
      native_pin: pin("I-002").native_pin,
    });
    expect(sha("spec/f027/spec-lock.json")).toBe(
      "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
    );
  });

  it("the BLUE v5.1 brief is recorded as a construction source and is NOT a spec-lock pin", () => {
    expect(ORIGINAL_PC_CUSTODY_BRIEF_SOURCE).toEqual({
      artifact: `https://app.notion.com/p/${BRIEF_ID}`,
      native_pin: BRIEF_PIN,
    });
    expect(JSON.stringify(lock)).not.toContain(BRIEF_ID);
    expect(JSON.stringify(lock)).not.toContain(BRIEF_PIN);
    expect(WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE.authority_lineage.join("\n")).toContain(
      "NOT a spec-lock pin",
    );
    expect(REFEREE_PHYSICAL_RULE.effective_basis).toBe("blue-bounded-brief-not-spec-locked");
    expect(REFEREE_PHYSICAL_RULE.native_pin).toBe(BRIEF_PIN);
  });

  it("the original-activation custody rule cites WG at its lock pin, with IR and I-002 clauses at theirs, the Role Registry binding-time referent and the brief", () => {
    const rule = WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE;
    expect(rule.artifact).toBe(pin("WG").url);
    expect(rule.native_pin).toBe(pin("WG").native_pin);
    expect(rule.clause).toContain("F-016 Ratified Fallback Objective Physical-Entity Custody");
    const lineage = rule.authority_lineage.join("\n");
    for (const s of [IR_SOURCE, I002_SOURCE]) {
      expect(lineage).toContain(s.artifact);
      expect(lineage).toContain(s.native_pin);
    }
    expect(lineage).toContain("IR Player–World Insertion §2");
    expect(lineage).toContain("§17 (world placement/overlap → World owner");
    expect(lineage).toContain("I-002 §2");
    expect(lineage).toContain("§4.3");
    expect(lineage).toContain("never a movable current physical-locus ledger");
    expect(lineage).toContain("2026-09-25T08:21:22.816Z");
    expect(lineage).toContain(BRIEF_PIN);
    // the exact existing-actor handover branch is cited as NOT reclassified
    expect(lineage).toContain("is NOT reclassified");
  });

  it("the handover branch's governing rule and the I-002/IR referee rule are byte-identical to the base (only a new, exclusive sibling was added)", () => {
    expect(shaJson(WORLD_PC_LOCUS_CUSTODY_RULE)).toBe(
      "7bc2945878a115e39090afb362251c8066e32ef33c3e13367534e7392487131c",
    );
    expect(shaJson(REFEREE_RULE)).toBe(
      "255404898fe15f18a64743a1b1fc9e96e25ed5fab86096798c260ce6728b5b61",
    );
    expect(WORLD_PC_LOCUS_CUSTODY_RULE.authority_lineage.join("\n")).not.toContain(BRIEF_PIN);
    expect(REFEREE_RULE.authority_lineage.join("\n")).not.toContain(BRIEF_PIN);
    expect(REFEREE_RULE.effective_basis).toBe(
      "sovereign-approved-not-native-pinned-not-spec-locked",
    );
  });

  it("every new host-delivered source clause is an exact lock-pinned frozen source", () => {
    for (const id of ["I002-4.3", "I002-17.2"] as const) {
      expect(REFEREE_SOURCES[id].artifact).toBe(pin("I-002").url);
      expect(REFEREE_SOURCES[id].native_pin).toBe(pin("I-002").native_pin);
    }
    for (const id of ["IR-2", "IR-12", "IR-14", "IR-17"] as const) {
      expect(REFEREE_SOURCES[id].artifact).toBe(pin("IR").url);
      expect(REFEREE_SOURCES[id].native_pin).toBe(pin("IR").native_pin);
    }
    expect(REFEREE_SOURCES["IR-2"].text).toContain("binding to one world locus, several loci");
    expect(REFEREE_SOURCES["I002-4.3"].text).toContain("incorporeal manifestation");
    expect(REFEREE_SOURCES["IR-12"].text).toContain("willingness");
  });
});

describe("one fact kind, no new owner, no new facet: the second basis is an exclusive alternate citation", () => {
  it("no fact kind was added: the custody and the referee decision keep their kinds, owners and facets", () => {
    const custody = factKind("world_pc_locus_custody");
    expect(custody.owner).toBe("world_state");
    expect(custody.facet).toBe("world_fallback_physical_entity");
    expect(custody.lifecycle).toBe("SEALED");
    expect(custody.rule).toEqual(WORLD_PC_LOCUS_CUSTODY_RULE);
    expect(ALL_FACT_KINDS.filter((k) => k.id.includes("custody")).map((k) => k.id)).toEqual([
      "world_pc_locus_custody",
    ]);
    const referee = factKind("referee_decision");
    expect(referee.owner).toBe("referee_adjudication_kernel");
    expect(referee.rule).toEqual(REFEREE_RULE);
  });

  it("the original-activation citation governs ONLY activation-basis values; the physical citation ONLY physical decisions", () => {
    const custody = factKind("world_pc_locus_custody");
    expect(custody.alternateRules).toHaveLength(1);
    expect(custody.alternateRules![0]!.rule).toEqual(WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE);
    const act = {
      pc_id: "pc-1",
      stationary_locus: {
        world: { fact_key: "world/w/profile", entity_id: "w" },
        locus: { fact_key: "world/w/locus/l", entity_id: "l" },
      },
      basis: {
        established_from: ORIGINAL_ACTIVATION,
        pinned_versions: { pc: 1, binding: 1, world: 1, locus: 1 },
        qualified_by: {
          native: { fact_key: `referee/${"a".repeat(64)}/decision`, version: 1 },
          physical: { fact_key: `referee/${"b".repeat(64)}/decision`, version: 1 },
        },
      },
      custodian: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
      },
    };
    expect(PcPhysicalLocusCustodySchema.safeParse(act).success).toBe(true);
    expect(custody.alternateRules![0]!.admits(act)).toBe(true);
    const handover = {
      ...act,
      basis: {
        established_from: "EXISTING_ACTOR_HANDOVER",
        pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
      },
    };
    expect(custody.alternateRules![0]!.admits(handover)).toBe(false);
    const referee = factKind("referee_decision");
    // the physical-placement citation, (BLUE v5.2) the direct-perception citation and (GM-led first play) the scene-resolution citation,
    // each exclusive to its own value class
    expect(referee.alternateRules).toHaveLength(3);
    expect(referee.alternateRules![0]!.rule).toEqual(REFEREE_PHYSICAL_RULE);
    expect(referee.alternateRules![1]!.admits({ operation: "IR_PHYSICAL_PLACEMENT" })).toBe(false);
    expect(referee.alternateRules![2]!.admits({ operation: "IR_PHYSICAL_PLACEMENT" })).toBe(false);
    expect(referee.alternateRules![2]!.admits({ operation: "F014D_DIRECT_PERCEPTION" })).toBe(
      false,
    );
    expect(referee.alternateRules![0]!.admits({ operation: "IR_NATIVE_COMPATIBILITY" })).toBe(
      false,
    );
    expect(RefereeDecisionRecordSchema.safeParse({ operation: REFEREE_OP_PHYSICAL }).success).toBe(
      false,
    );
  });

  it("the verdict names of the physical operation are distinct from every other operation's", () => {
    expect([...PHYSICAL_VERDICTS]).toEqual([
      "PHYSICAL_ELIGIBLE",
      "NOT_PHYSICAL_SINGLE_LOCUS",
      "PHYSICAL_WORLD_CONFLICT",
      "PHYSICAL_UNRESOLVED",
    ]);
  });
});

describe("the custody stays a stationary record: nothing downstream is implied", () => {
  const modules = [
    "packages/contracts/src/pc-locus-custody.ts",
    "packages/engine/src/world/pc-locus-custody.ts",
    "packages/engine/src/world/pc-locus-custody-integrity.ts",
    "packages/operator/src/original-pc-locus.ts",
  ].map((f) => [f, code(f)] as const);

  it("no module in the slice names a movement, request, dispatch, transfer, Temporal, perception, knowledge, inventory or actor-decision construct", () => {
    for (const [f, text] of modules) {
      expect(text, f).not.toMatch(
        /MovementServiceRequest|LogisticsAdapter|commitMovement|\.dispatch\(|TemporalCoordinator|establishCanonicalTime|\.advance\(|EpistemicAdapter|KtiAdapter|ActorAdapter|PopulationAdapter|ProductionAdapter|EconomyAdapter|deriveEntityTransition|commitPcVoluntaryMovement|establishPcMovementRequest/,
      );
      expect(text.toLowerCase(), f).not.toMatch(
        /relocat|successor|pathfind|travel_time|passenger|diversion|inventory|perception_event|willingness/,
      );
    }
  });

  it("the operator command composes exactly the existing owner operations plus the one new establishment; it writes no Role Registry, Existence Contract or coupling fact", () => {
    const text = code("packages/operator/src/original-pc-locus.ts");
    expect(text).toMatch(/establishOriginalPcPhysicalLocusCustody/);
    expect(text).toMatch(/recordPhysical/);
    expect(text).not.toMatch(
      /bindPlayerCharacter|releasePlayerCharacter|handoverExistingActor|coupleExistingActor|establishPcPhysicalLocusCustody|createFileCampaign|CANON_WRITE_AUTHORITY|\.commit\(/,
    );
  });

  it("the post-handover movement consumer refuses a custody that is not the handover branch (the stationary target advance later took the original branch for time progression only: BLUE v5.2, see protocol-original-pc-target-advance-conformance)", () => {
    expect(code("packages/engine/src/pc-movement/derive.ts")).toMatch(/isPostHandoverCustody/);
    expect(code("packages/protocol/src/active-pc-target-advance.ts")).toMatch(
      /isPostHandoverCustody/,
    );
  });
});

describe("gates, register and the lock are untouched; nothing was promoted", () => {
  it("PF-6/F-028 stays NOT_ACTIVATED_BLOCKED, IA-07 stays BLOCKED, and no register row cites this slice", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /original-pc-locus|establish-character-locus|IR_PHYSICAL_PLACEMENT|pc-locus-original/,
      );
  });

  it("the frozen F-027 artifacts and every predecessor module the slice consumes unchanged are byte-identical to main", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });
});

/** Everything the slice consumes and must leave untouched, byte-identical to main edad9da9d1ceda032131dbae2fb52df080da55e9. */
// UNCHANGED:BEGIN
const UNCHANGED: Record<string, string> = {
  "spec/f027/spec-lock.json": "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/contracts/src/actor-coupling.ts":
    "ee204eb2426b4c86c2a80207fbf1eec2192f0d83d5ae5bb22f469fb86830e681",
  "packages/contracts/src/pc-movement.ts":
    "35c05f1e78aca3c11c32d141dbb43cdc99c71237027ed7dbceea4e3dd048ea10",
  "packages/engine/src/owners/admission.ts":
    "f6fea96d12a03844564305682a83ac8738d4fc4fde1673b52c8b8078aea4f973",
  "packages/engine/src/owners/rejection.ts":
    "23cb880a764ae525ec424ea3fc2786bc9c45999e7336f162a3c203201f0262aa",
  "packages/engine/src/world/integrity.ts":
    "8877544bedbb4914ed0ddb6e3b22db687810693f5e8206067de5b17d5f322b32",
  "packages/engine/src/world/actor-coupling.ts":
    "19091c16a325fc8e51e26f4bb628f41525598d2ae6342f8f48b6b57771ff8aaa",
  "packages/engine/src/world/actor-coupling-integrity.ts":
    "ca6638ef984e6d189d915068cb512fc1269ee921ae58dc2460c83a245b5e0f4f",
  "packages/engine/src/world/fallback-custody.ts":
    "ff9fa3462be69b3dbbe58436b642a8a7d988b9b82c5707263c7aa5b2129f715a",
  "packages/engine/src/world/physical-subject.ts":
    "64b66f00c8efe66eb023cedd24f3f37c25affcbe394a39f8fb723d741a4510c5",
  "packages/engine/src/pc-movement/integrity.ts":
    "37d20ecd819d9ac330d17a183e00dbd29f81f697f6b4f6c123b5e893c4cdf0ff",
  "packages/engine/src/persistence/file-package.ts":
    "cd57b52e464a06dd6484ae0a30167857b3e24ce8f3052fd5f9c4d2628a55151b", // H-07 S1 scoped persistence successor; H-01 arbitration remains independently byte-locked.
  "packages/operator/src/bin.ts":
    "1b3f71e0f10cb036da1a505a3f26dce25f39957ae577efc5a8a0be7a9c184d4e",
  "packages/operator/src/commands.ts":
    "f14467cae3334d2f13f65ab9b941a7f66b889d157779a7afad53e09eb6baa8af",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/ledger.ts":
    "94092549ec67f9631f05fba78890775c45e574a1e9335a36daa3abe82921c3c9",
  "packages/operator/src/locality.ts":
    "808a3e0329822ef6085e48f7db02a7354d25995d7e1b24a7d8f1a90f7a8c6c2a",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/local-operator.ts":
    "1bf152e2a05e64474beb661b215c33b1e4ab318ceff845856aaef916de3250a8",
  "packages/operator/src/terminal.ts":
    "1e2486167cc16a30ae52a15b8059d73e44f4d68dbd7f51b79ee936ca73a2708e",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
};
// UNCHANGED:END

/**
 * The BLUE v5.1 SCOPED DELTAS to existing source files: each differs from main (`base`) and is pinned at this slice's head (`head`), so
 * any further edit is a new, visible change to this table. Files the slice only ADDED are not listed.
 */
// DELTAS:BEGIN
const V51_SCOPED_DELTAS: Record<string, { base: string; head: string }> = {
  "packages/contracts/src/pc-locus-custody.ts": {
    base: "72d543bfb838dfe8d0bfae946da617623e14de7d6235faf5613f5d9de0ea7b9e",
    head: "181218063894d0458e8143ac7a4866d70732ff967410b18846a78cc457b30a0a",
  },
  "packages/contracts/src/referee.ts": {
    base: "e3f927b5e0ecc5b608934ac04d7dca1f1baec4db1b459a7a27cf07fee0769e5f",
    head: "a9b3068dea09db59dd636d897f4dab751a49654f7db84f9f8a9a4189050258b7",
  },
  "packages/engine/src/owners/registry.ts": {
    base: "15cefc0e7a70f61440536ac0e59326cad76889743d11396fbbcd7fda6f4639c3",
    head: "88d9edc79bf7b8b1e9b3b8d97659f56e2cd7099ea9af7ac632f0920014a6ab0a",
  },
  "packages/engine/src/pc-movement/derive.ts": {
    base: "cc1f2dd3fa2ce1ba1c95c9cd9f3748a8bb18d58f432f170474413b93ae3f00a4",
    head: "636f161378d319702782860ba99f70db62ac37887feb975c188681b05e7bfe15",
  },
  "packages/engine/src/referee/adapter.ts": {
    base: "3399b7977bc4d832dcc2cf1428ad0e0331bb01a9826a8efd24cc9c052d6219d4",
    head: "b033bd1df6920ae22303fa1dc70254f0e48810bb29f8fd4a7af9bec249593492",
  },
  "packages/engine/src/referee/admission.ts": {
    base: "2b38fa9521358d4052cfb8ba58a276a222308d392aa0c5596f8bc8b71650cebc",
    head: "67d5000626765cc01f1c8d402513979562727223b1e27490f49701c9b8593791",
  },
  // head adjusted openly for N-1 (RED, #72): derive.ts gains `deliveryWithheld` and comment-only authority-label corrections
  "packages/engine/src/referee/derive.ts": {
    base: "3322515912a51a9179ff316465b0a59532cb0ea05c3c8cae676dab53299189ef",
    head: "dd5c76eeda87503fa5f28e03a6676edd899f9a46c4a632d41a4d7ad6ea4762f6",
  },
  "packages/engine/src/referee/integrity.ts": {
    base: "00b860919ed8e01889d67ccd6d8827f03220e0ceee571ec2bf4293983f1a4df7",
    head: "0de08afe1f82134d7b0648a5e4c6979a94915a807648d9b240f4d65c9de5a844",
  },
  "packages/engine/src/world/canonical-campaign.ts": {
    base: "227ea9fba026f5ac594a12ddc511901559dcd14a0bf29ec1578442063fff46a5",
    head: "97beb648fd916a630e07222c55c9ecac5c26220255373a1273cc0f47c70f7d4c",
  },
  "packages/engine/src/world/pc-locus-custody-integrity.ts": {
    base: "36483247d0f80ac205e76c927ad0ab60f1efecf4b83df07a4ef654cdf7ee23b8",
    head: "f0ecdeba58eb424d25e87e915c2f4b9309d8fd4d4e4fec569f5e8f270793632d",
  },
  "packages/engine/src/world/pc-locus-custody.ts": {
    base: "6f3a2e7045223b1221abd7fd2b19c0cd18e9a1101f19d19e5b8c6d4984f7c03a",
    head: "d54ee795a20712fc64f01c85a86d9de602e87a161b21af35c6610bcbb006ab9f",
  },
  "packages/operator/src/cli.ts": {
    base: "069223d65a2198a9707f86878288f4652568b2a98d6bbe4a88072b05c8b09180",
    head: "7734645c59c0cb375345c1023333d3c6870a55c591e60b0a4252c633b85ff833",
  },
  "packages/operator/src/confirmation.ts": {
    base: "ad807c7402b7ba323e43f5712027a38c2087bc071a9c7e7bf92b0fa630671ad8",
    head: "f8b131a482f86719538bb754900f8a597522e1e355035b5af7c7612caf870cd3",
  },
  "packages/operator/src/index.ts": {
    base: "a5db33bcab750664eeeb240a33ec8b85ce02eb536c9284b3c9f563e774d84284",
    head: "0963a796522254e3f2a6fd2fa9dd53af2419dab6589f9649f5ae30c578994a57",
  },
  "packages/operator/src/original-pc.ts": {
    base: "065e77c316b111081986f0f16f7afb5af348a8c00939641c45210cc2345d5229",
    head: "a3b9563b0c119a344ee81edd71815bb1d821383f3948ccb4b0fced58c9af97d4",
  },
  "packages/operator/src/referee-exchange.ts": {
    base: "57bd77549ea3498607a56e436456fbf6c9d7050bf4c340da9dae8590d49e16b2",
    head: "411cbb63d49e26e105c71a8cf33a55d2222c996bc0d17a45046f1b6eb92a7085",
  },
  "packages/operator/src/referee-mcp.ts": {
    base: "b935a2e2e62f844c48da1bcfd268fe18b0d7e171cc1374a6c888f7a47dbe2923",
    head: "05ecde2220d3eafc74d4afe2c6e4ae22ebfadcd558ee13386ba2c4cbbc5f493d",
  },
  "packages/operator/src/referee-session.ts": {
    base: "a0ef2582f232fd7c23f23f0b777377096f5a76859eb151d33a7b2c26fe08ec16",
    head: "c8a46a7a516d02359d0069b9051e6044a4b757b39b3d8205abb3f63f612b687b",
  },
};
// DELTAS:END

describe("the existing source files BLUE v5.1 modified are exactly the scoped deltas", () => {
  it("each differs from main and is pinned at the slice head", () => {
    expect(Object.keys(V51_SCOPED_DELTAS).sort()).toEqual(EXPECTED_DELTA_FILES);
    for (const [file, { base, head }] of Object.entries(V51_SCOPED_DELTAS)) {
      expect(base, file).not.toBe(head);
      expect(sha(file), file).toBe(head);
    }
  });
});

const EXPECTED_DELTA_FILES: string[] = [
  "packages/contracts/src/pc-locus-custody.ts",
  "packages/contracts/src/referee.ts",
  "packages/engine/src/owners/registry.ts",
  "packages/engine/src/pc-movement/derive.ts",
  "packages/engine/src/referee/adapter.ts",
  "packages/engine/src/referee/admission.ts",
  "packages/engine/src/referee/derive.ts",
  "packages/engine/src/referee/integrity.ts",
  "packages/engine/src/world/canonical-campaign.ts",
  "packages/engine/src/world/pc-locus-custody-integrity.ts",
  "packages/engine/src/world/pc-locus-custody.ts",
  "packages/operator/src/cli.ts",
  "packages/operator/src/confirmation.ts",
  "packages/operator/src/index.ts",
  "packages/operator/src/original-pc.ts",
  "packages/operator/src/referee-exchange.ts",
  "packages/operator/src/referee-mcp.ts",
  "packages/operator/src/referee-session.ts",
];
