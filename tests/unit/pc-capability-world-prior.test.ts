/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary fact values */
// Unit evidence for the existing-actor world-prior rules (thirty-third slice). `pcHandoverViolation` is the single statement of
// the cutover every existing-actor establishment rests on (shared with the carry-forward); `pcCauseViolation` and
// `pcExistingActorWorldPriorViolation` the single statement of what a world-prior establishment must be;
// `deriveWorldPriorBasis` the mechanical basis the owner path builds; `pcSlotInspector` and `pcRuleAuthority` the PC owner's two
// narrow typed ports to the neutral Causal Draw. All are pure functions of committed facts, by identity, and invent nothing:
// no grade, default prior, weight or sufficiency judgment.
// Register lineage: IA-02/IA-03 (partial); RC-02, RC-13; IM-03, IM-07, IM-11, IM-12. Sources: WS-016 pin
// 2026-09-24T17:38:59.210Z (§16); PC-Control Handover Contract v1 (observed pin 2026-09-25T00:16:16.544Z); F-027-CD1 CD-CC-01.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  capabilityCandidateId,
  causalDrawPrecommitKey,
  pcCapabilityBasisKey,
  pcCapabilityDrawKey,
  pcCapabilityKey,
  pcExistenceContractKey,
  type OwnerFact,
  type PcCapabilityBasis,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  deriveWorldPriorBasis,
  pcBasisPrerequisites,
  pcCapabilityDrawSpecification,
  pcCapabilityEstablishmentViolation,
  pcCauseViolation,
  pcExistingActorWorldPriorViolation,
  pcHandoverPin,
  pcHandoverViolation,
  pcRuleAuthority,
  pcSlotInspector,
} from "@immortalis/engine";
import { ACTOR_SMITH, CAP_SWORDSMANSHIP, FIXTURE_PC_ID } from "@immortalis/testkit";
import {
  handedOverWithUnresolvedCapability,
  seededExistingActorCampaign,
  worldPriorCauses,
  worldPriorInput,
  worldPriorRandomizedInput,
} from "../support/existing-actor.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const D = CAP_SWORDSMANSHIP;
const causes = worldPriorCauses(A, D);

/** The committed facts of a real handed-over campaign, as a mutable map (each test edits its own clone). */
async function committed(): Promise<Map<string, OwnerFact>> {
  const s = await seededExistingActorCampaign(tempDir());
  await handedOverWithUnresolvedCapability(s);
  const facts = new Map<string, OwnerFact>(
    s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]),
  );
  await s.campaign.close();
  return facts;
}
const deterministic = (over: Partial<PcCapabilityBasis> = {}): PcCapabilityBasis => ({
  pc_id: A,
  capability_id: D,
  marker: "B",
  establishment: {
    method: "EXISTING_ACTOR_CAUSALLY_DETERMINED",
    handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
    causes,
  },
  ...over,
});
const edit = (facts: Map<string, OwnerFact>, key: string, change: (f: any) => void) => {
  const copy = new Map(facts);
  const f = structuredClone(copy.get(key)!) as any;
  change(f);
  copy.set(key, f);
  return copy;
};

describe("pcHandoverViolation: the one cutover statement, shared by the carry-forward and the world-prior establishments", () => {
  it("is null for the committed EXISTING_ACTOR_HANDOVER of this identity at the version pinned, which consumed the contract committed now", async () => {
    const facts = await committed();
    expect(
      pcHandoverViolation(A, { version: facts.get(PLAYER_CHARACTER_BINDING_KEY)!.version }, facts),
    ).toBeNull();
  });

  it("fails closed for an absent binding, another version, an ordinary ACTIVATION, another identity, and a contract that is not the compilation", async () => {
    const facts = await committed();
    const pin = { version: facts.get(PLAYER_CHARACTER_BINDING_KEY)!.version };
    const without = new Map(facts);
    without.delete(PLAYER_CHARACTER_BINDING_KEY);
    expect(pcHandoverViolation(A, pin, without)).toMatch(/handover is not committed/);
    expect(pcHandoverViolation(A, { version: 9 }, facts)).toMatch(/exact version/);
    // a real ordinary first ACTIVATION (of a freshly generated PC) is no cutover basis for an existing-actor establishment
    const { seededPcCapabilityCampaign } = await import("../support/pc-capability.ts");
    const fresh = await seededPcCapabilityCampaign(tempDir());
    const activated = new Map(fresh.campaign.store.listFacts().map((f) => [f.key, f]));
    expect((activated.get(PLAYER_CHARACTER_BINDING_KEY)!.value as any).transition.type).toBe(
      "ACTIVATION",
    );
    expect(
      pcHandoverViolation(
        FIXTURE_PC_ID,
        { version: activated.get(PLAYER_CHARACTER_BINDING_KEY)!.version },
        activated,
      ),
    ).toMatch(/not the EXISTING_ACTOR_HANDOVER/);
    await fresh.campaign.close();
    expect(pcHandoverViolation("actor-other", pin, facts)).toMatch(
      /not the EXISTING_ACTOR_HANDOVER/,
    );
    const noClass = edit(facts, pcExistenceContractKey(A), (f) => {
      delete f.value.existing_actor_compilation;
    });
    expect(pcHandoverViolation(A, pin, noClass)).toMatch(/released existing-actor compilation/);
    const moved = edit(facts, pcExistenceContractKey(A), (f) => (f.version = 2));
    expect(pcHandoverViolation(A, pin, moved)).toMatch(/version committed now/);
    const foreign = edit(facts, PLAYER_CHARACTER_BINDING_KEY, (f) => (f.owner = "named_actor"));
    expect(pcHandoverViolation(A, pin, foreign)).toMatch(/handover is not committed/);
  });

  it("the handover pin is read mechanically from the committed binding and absent before the cutover", async () => {
    const facts = await committed();
    const pin = pcHandoverPin(facts);
    expect(pin.ok && pin.value).toEqual({
      fact_key: PLAYER_CHARACTER_BINDING_KEY,
      version: facts.get(PLAYER_CHARACTER_BINDING_KEY)!.version,
    });
    const without = new Map(facts);
    without.delete(PLAYER_CHARACTER_BINDING_KEY);
    const missing = pcHandoverPin(without);
    expect(!missing.ok && missing.error.code).toBe("PREREQUISITE_MISSING");
  });
});

describe("pcCauseViolation: a cause is a foreign, committed fact referenced and never copied", () => {
  const c = (owner: string, fact_key: string) => ({ owner, fact_key });
  it("refuses kernel state, Causal Draw provenance, any PC capability state and the predecessor's capability state", () => {
    expect(pcCauseViolation(c("temporal_kernel", "temporal/state"))).toMatch(/kernel coordination/);
    expect(
      pcCauseViolation(c("causal_draw_kernel", causalDrawPrecommitKey("0".repeat(64)))),
    ).toMatch(/engine-internal evidence/);
    for (const key of [pcCapabilityBasisKey(A, D), pcCapabilityKey(A, D)])
      expect(pcCauseViolation(c("pc_existence", key))).toMatch(/never a cause of a PC capability/);
    for (const key of [`actor/${A}/capability-basis/${D}`, `actor/${A}/capability/${D}`])
      expect(pcCauseViolation(c("named_actor", key))).toMatch(/cold provenance/);
  });

  it("allows any other foreign fact, including the PC's own compiled Existence Contract (compiled I-002 material)", () => {
    expect(pcCauseViolation(c("SYNTHETIC-ACTOR-HISTORY", "history/x"))).toBeNull();
    expect(pcCauseViolation(c("world_state", "world/w/profile"))).toBeNull();
    expect(pcCauseViolation(c("pc_existence", pcExistenceContractKey(A)))).toBeNull();
  });
});

describe("pcExistingActorWorldPriorViolation and the establishment dispatch", () => {
  it("a lawful deterministic establishment is null, and every violation is named by the rule it breaks", async () => {
    const facts = await committed();
    const basis = deterministic();
    const e = basis.establishment as Parameters<typeof pcExistingActorWorldPriorViolation>[1];
    expect(pcExistingActorWorldPriorViolation(basis, e, facts)).toBeNull();
    expect(pcCapabilityEstablishmentViolation(basis, facts)).toBeNull();
    const without = new Map(facts);
    without.delete(PLAYER_CHARACTER_BINDING_KEY);
    expect(pcCapabilityEstablishmentViolation(basis, without)).toMatch(/handover is not committed/);
    const foreign = deterministic({
      establishment: {
        ...(basis.establishment as any),
        causes: [{ ...causes[0]!, owner: "temporal_kernel" }],
      },
    });
    expect(pcCapabilityEstablishmentViolation(foreign, facts)).toMatch(/kernel coordination/);
  });

  it("a cause that later advanced is not a violation of the establishment itself: currency is judged where the write is judged", async () => {
    const facts = await committed();
    const advanced = edit(facts, causes[0]!.fact_key, (f) => (f.version = 3));
    expect(pcCapabilityEstablishmentViolation(deterministic(), advanced)).toBeNull();
  });

  it("a randomized establishment without its committed draw has nothing to read: the draw rule fails closed", async () => {
    const facts = await committed();
    const basis: PcCapabilityBasis = {
      ...deterministic(),
      establishment: {
        method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
        handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
        causes,
        draw: {
          draw_id: `cdraw:v1:${"0".repeat(64)}`,
          result: { fact_key: "causal-draw/x/result", version: 1 },
        },
      },
    };
    expect(pcCapabilityEstablishmentViolation(basis, facts)).toMatch(
      /stable Causal Draw of this PC/,
    );
  });

  it("the prerequisites each method must read and depend on: the contract and handover, each cause (pinned at its cited version) and, if randomized, the draw result", () => {
    const det = pcBasisPrerequisites(deterministic());
    expect(det.map((n) => n.key)).toEqual([
      pcExistenceContractKey(A),
      PLAYER_CHARACTER_BINDING_KEY,
      ...causes.map((x) => x.fact_key),
    ]);
    expect(det.filter((n) => n.cause).map((n) => n.cause)).toEqual(
      causes.map((x) => ({ owner: x.owner, version: x.version })),
    );
    const rnd = pcBasisPrerequisites({
      ...deterministic(),
      establishment: {
        method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
        handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
        causes,
        draw: {
          draw_id: `cdraw:v1:${"1".repeat(64)}`,
          result: { fact_key: "causal-draw/r/result", version: 1 },
        },
      },
    });
    expect(rnd.at(-1)).toEqual({
      key: "causal-draw/r/result",
      what: "the committed Causal Draw result",
    });
  });
});

describe("deriveWorldPriorBasis: the mechanical basis around what the owner authored", () => {
  it("places the authored causes and marker unchanged, cites the committed binding's version, and invents nothing", async () => {
    const facts = await committed();
    for (const marker of ["C", "S", null, { ex: "a descriptor" }] as const) {
      const built = deriveWorldPriorBasis(A, D, { marker, causes }, facts);
      expect(built.ok && built.value).toEqual({
        pc_id: A,
        capability_id: D,
        marker,
        establishment: {
          method: "EXISTING_ACTOR_CAUSALLY_DETERMINED",
          handover: {
            fact_key: PLAYER_CHARACTER_BINDING_KEY,
            version: facts.get(PLAYER_CHARACTER_BINDING_KEY)!.version,
          },
          causes,
        },
      });
    }
    const draw = { draw_id: `cdraw:v1:${"2".repeat(64)}`, result: { fact_key: "k", version: 1 } };
    const randomized = deriveWorldPriorBasis(A, D, { marker: "A", causes, draw }, facts);
    expect(randomized.ok && (randomized.value as any).establishment).toMatchObject({
      method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
      draw,
    });
  });

  it("fails closed before the ownership cutover", async () => {
    const facts = await committed();
    facts.delete(PLAYER_CHARACTER_BINDING_KEY);
    const built = deriveWorldPriorBasis(A, D, { marker: "C", causes }, facts);
    expect(!built.ok && built.error.code).toBe("PREREQUISITE_MISSING");
  });
});

describe("the PC owner's typed ports to the neutral Causal Draw: by identity, narrow, and never a general authority", () => {
  const slot = (owner: string, key: string) =>
    ({ owner_operation: { owner, operation: "x" }, prospective_result_id: key }) as never;

  it("the slot inspector reports a PC capability-basis slot established only when its basis exists, and no other slot at all", () => {
    const store = {
      getFact: (k: string) =>
        k === pcCapabilityBasisKey(A, D)
          ? ({ provenance: { intent_id: "i-1" } } as OwnerFact)
          : undefined,
    } as never;
    const inspector = pcSlotInspector(store);
    expect(inspector.inspectResultSlot(slot("pc_existence", pcCapabilityBasisKey(A, D)))).toEqual({
      established: true,
      establishing_intent_id: "i-1",
    });
    expect(
      inspector.inspectResultSlot(slot("pc_existence", pcCapabilityBasisKey(A, "other"))),
    ).toEqual({
      established: false,
    });
    // another owner, or a key that is no PC basis slot (the capability itself, the Named-Actor basis), is never "established" here
    expect(inspector.inspectResultSlot(slot("named_actor", pcCapabilityBasisKey(A, D)))).toEqual({
      established: false,
    });
    expect(inspector.inspectResultSlot(slot("pc_existence", pcCapabilityKey(A, D)))).toEqual({
      established: false,
    });
  });

  it("the rule authority holds only for the PC owner's rule, operation, opportunity and the stable key of its own basis slot", () => {
    const key = pcCapabilityDrawKey(A, D);
    expect(pcRuleAuthority.isEffectiveForPriorCreation(PC_CAPABILITY_RULE, key)).toBe(true);
    // the superseded citation, a drifted one, another operation/opportunity/slot/owner: none is this owner's prior
    expect(
      pcRuleAuthority.isEffectiveForPriorCreation(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE, key),
    ).toBe(false);
    expect(
      pcRuleAuthority.isEffectiveForPriorCreation({ ...PC_CAPABILITY_RULE, clause: "x" }, key),
    ).toBe(false);
    for (const bad of [
      { ...key, opportunity_id: "another" },
      { ...key, owner_operation: { ...key.owner_operation, operation: "another" } },
      { ...key, owner_operation: { ...key.owner_operation, owner: "named_actor" } },
      { ...key, prospective_result_id: pcCapabilityKey(A, D) },
      { ...key, causal_process_id: `pc-capability/${A}/other` },
    ])
      expect(pcRuleAuthority.isEffectiveForPriorCreation(PC_CAPABILITY_RULE, bad)).toBe(false);
  });

  it("the specification is the owner's prior and nothing else: its key, rule, causes and one opaque candidate per authored possibility; nothing added, defaulted or rescaled", () => {
    const input = worldPriorRandomizedInput(A, D, {
      prior: [
        { marker: "A", weight: "7" },
        { marker: null, weight: "2" },
        { marker: { ex: "a descriptor" }, weight: "1" },
      ],
    });
    const refs = input.causes.map((x) => ({ ...x, committed_by: "g" }));
    const spec = pcCapabilityDrawSpecification(input, refs);
    expect(spec.draw_key).toEqual(pcCapabilityDrawKey(A, D));
    expect(spec.owner_rule_ref).toEqual(PC_CAPABILITY_RULE);
    expect(spec.input_refs).toEqual(refs);
    expect(spec.candidates).toEqual([
      { candidate_id: capabilityCandidateId("A"), weight: "7" },
      { candidate_id: capabilityCandidateId(null), weight: "2" },
      { candidate_id: capabilityCandidateId({ ex: "a descriptor" }), weight: "1" },
    ]);
    // an absent, empty or singleton prior reaches the draw gate as exactly that: no candidate is added
    expect(
      pcCapabilityDrawSpecification(worldPriorRandomizedInput(A, D, { prior: [] }), refs)
        .candidates,
    ).toEqual([]);
    expect(worldPriorInput(A, D).marker).toBe("C"); // the deterministic fixture authors its marker; no engine default exists
  });
});
