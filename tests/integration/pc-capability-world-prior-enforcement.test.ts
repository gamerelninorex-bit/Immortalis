/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor Unresolved Capability → PC World-Prior Resolution — enforcement that does not depend on the adapter behaving.
// IM-11 admission holds for a raw `store.commit` and for a TAMPERED group: the committed EXISTING_ACTOR_HANDOVER is the cutover
// basis; every cause is a pinned, lawful foreign fact; a capability the predecessor Named-Actor owner already fixed (basis,
// capability or Causal Draw) is never re-resolved; once Causal Draw evidence exists for the PC slot only the establishment that
// reads it may fill the slot, and a randomized basis is exactly what its committed draw determines; the superseded
// governing-rule citation is never stamped on a new write; and the strict contracts carry no marker, prior, weight or seed.
// Register lineage: IA-02, IA-03, IA-14 (partial), IA-30 (partial); RC-02, RC-07, RC-09, RC-13, RC-16; IM-03, IM-07, IM-11, IM-12.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  causalDrawPrecommitKey,
  causalDrawResultKey,
  pcCapabilityBasisKey,
  pcExistenceContractKey,
  worldProfileKey,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  pcCapabilityDrawDigest,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  RESOLVER,
  capabilityBasis,
  pcCapabilityBasis,
  pcCapabilityPublication,
  CAP_SAILING,
} from "@immortalis/testkit";
import {
  carryForward,
  closePcCapability,
  drawPcSlot,
  establishWorldPrior,
  establishWorldPriorRandomized,
  handedOverWithUnresolvedCapability,
  handoverActor,
  pcDrawResultGroup,
  rawWorldPriorBasis,
  readyForCarryForward,
  seededExistingActorCampaign,
  worldPriorCauses,
  worldPriorInput,
  worldPriorPublication,
  worldPriorRandomizedInput,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING; // authoritative before the handover (carry-forward territory)
const D = CAP_SWORDSMANSHIP; // never fixed before the handover
const basisKey = pcCapabilityBasisKey(A, D);
const digest = pcCapabilityDrawDigest(A, D);
const causes = worldPriorCauses(A, D);

async function handedOver(): Promise<ExistingActorSeeded> {
  const s = await seededExistingActorCampaign(tempDir());
  await handedOverWithUnresolvedCapability(s);
  return s;
}

/** A refused raw group wrote nothing: the head is untouched and the slot is still empty. */
const refused = async (s: ExistingActorSeeded, g: ReturnType<typeof rawWorldPriorBasis>) => {
  const head = s.campaign.store.head();
  const code = await codeOf(s.campaign.store.commit(g));
  expect(s.campaign.store.head()).toEqual(head);
  expect(s.campaign.store.getFact(g.writes[0]!.key)).toBeUndefined();
  return code;
};

describe("the lawful world-prior groups are exactly what the owner path builds", () => {
  it("a raw store commit of the mechanically built deterministic group is admitted (the baseline every tamper below departs from)", async () => {
    const s = await handedOver();
    expect((await must(s.campaign.store.commit(rawWorldPriorBasis(s, 50, A, D)))).replayed).toBe(
      false,
    );
    expect(s.pcs.basis(A, D)!.value.establishment.method).toBe(
      "EXISTING_ACTOR_CAUSALLY_DETERMINED",
    );
    expect(s.pcs.basis(A, D)!.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("and so is the mechanically built randomized group over a committed draw", async () => {
    const s = await handedOver();
    await must(drawPcSlot(s.campaign.store, s.entropy, A, D));
    await must(s.campaign.store.commit(rawWorldPriorBasis(s, 50, A, D, { randomized: true })));
    expect(s.pcs.basis(A, D)!.value.establishment.method).toBe(
      "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the committed EXISTING_ACTOR_HANDOVER is required and is the cutover basis", () => {
  it("before the handover a raw world-prior basis is refused: the actor stays the lawful owner", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    const { readyForHandover } = await import("../support/existing-actor.ts");
    await readyForHandover(s);
    const g = rawWorldPriorBasis(s, 50, A, D, {
      edit: (v) => (v.establishment.handover.version = 1),
    });
    expect(await refused(s, g)).toBe("PREREQUISITE_MISSING");
  });

  it("an ordinary ACTIVATION of a freshly generated PC is no basis for a world-prior establishment", async () => {
    const { seededPcCapabilityCampaign } = await import("../support/pc-capability.ts");
    const s = await seededPcCapabilityCampaign(tempDir());
    const P = FIXTURE_PC_ID;
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    expect((binding.value as any).transition.type).toBe("ACTIVATION");
    // a real, committed foreign fact as the cause, read and depended on, so only the handover rule can refuse it
    const world = s.campaign.store.getFact(worldProfileKey(FIXTURE_WORLD_ID))!;
    const keys = [pcExistenceContractKey(P), PLAYER_CHARACTER_BINDING_KEY, world.key];
    const g = rawWorldPriorBasis({ campaign: s.campaign }, 50, P, CAP_SAILING, {
      edit: (v) => {
        v.establishment.handover.version = binding.version;
        v.establishment.causes = [
          { aspect: "WORLD_CONSTRAINT", owner: "world_state", fact_key: world.key, version: 1 },
        ];
      },
      groupOver: {
        reads: keys.map((k) => ({ key: k, version: s.campaign.store.getFact(k)!.version })),
        depends_on: keys.map((k) => s.campaign.store.getFact(k)!.provenance.group_id),
      },
    });
    const head = s.campaign.store.head();
    const r = await s.campaign.store.commit(g);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error.message).toMatch(/not the EXISTING_ACTOR_HANDOVER of this identity/);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(pcCapabilityBasisKey(P, CAP_SAILING))).toBeUndefined();
  });

  it("another identity's, a stale or a fabricated handover version fails closed", async () => {
    const s = await handedOver();
    expect(
      await refused(
        s,
        rawWorldPriorBasis(s, 50, A, D, { edit: (v) => (v.establishment.handover.version = 2) }),
      ),
    ).not.toBe("OK");
    // another identity has no committed contract and is not the handed-over actor
    expect(await codeOf(establishWorldPrior(s, 51, "actor-other", D))).not.toBe("OK");
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
    expect(s.campaign.store.getFact(pcCapabilityBasisKey("actor-other", D))).toBeUndefined();
  });

  it("the handover's own state is read by version: a group that does not read and depend on it is refused", async () => {
    const s = await handedOver();
    const noBinding = rawWorldPriorBasis(s, 50, A, D);
    noBinding.reads = noBinding.reads.filter((r) => r.key !== PLAYER_CHARACTER_BINDING_KEY);
    expect(await refused(s, noBinding)).toBe("REFERENCE_INVALID");
    const noContractDep = rawWorldPriorBasis(s, 51, A, D);
    noContractDep.depends_on = noContractDep.depends_on.slice(1);
    expect(await refused(s, noContractDep)).toBe("REFERENCE_INVALID");
  });
});

describe("every cause is a pinned, lawful, foreign fact", () => {
  it("a cause that is absent, at a stale version, not read, or not depended on is refused", async () => {
    const s = await handedOver();
    const absent = rawWorldPriorBasis(s, 50, A, D, {
      edit: (v) => (v.establishment.causes[0].fact_key = "no-such-fact"),
    });
    expect(await refused(s, absent)).toBe("PREREQUISITE_MISSING");
    const stale = rawWorldPriorBasis(s, 51, A, D, {
      edit: (v) => (v.establishment.causes[0].version = 2),
    });
    expect(await refused(s, stale)).toBe("REFERENCE_INVALID");
    const unread = rawWorldPriorBasis(s, 52, A, D);
    unread.reads = unread.reads.filter((r) => r.key !== causes[0]!.fact_key);
    expect(await refused(s, unread)).toBe("REFERENCE_INVALID");
    const undepended = rawWorldPriorBasis(s, 53, A, D);
    undepended.depends_on = [];
    expect(await refused(s, undepended)).toBe("REFERENCE_INVALID");
    // a cause cited under another owner than the one that committed it
    const owner = rawWorldPriorBasis(s, 54, A, D, {
      edit: (v) => (v.establishment.causes[0].owner = "world_state"),
    });
    expect(await refused(s, owner)).toBe("REFERENCE_INVALID");
  });

  it("kernel coordination state, Causal Draw provenance, a PC capability and the predecessor's capability state are no cause", async () => {
    const s = await handedOver();
    // facts that really exist and are really read and depended on, so only the cause rule can refuse them
    const E = "capability-other";
    await must(establishWorldPrior(s, 1, A, E));
    const F = "capability-third";
    await must(drawPcSlot(s.campaign.store, s.entropy, A, F));
    const cases: [string, string, string, RegExp][] = [
      ["temporal/state", "temporal_kernel", "temporal_kernel", /kernel coordination state/],
      [
        causalDrawPrecommitKey(pcCapabilityDrawDigest(A, F)),
        "causal_draw_kernel",
        "causal_draw_kernel",
        /engine-internal evidence/,
      ],
      [
        pcCapabilityBasisKey(A, E),
        "pc_existence",
        "pc_existence",
        /never a cause of a PC capability/,
      ],
      [
        actorCapabilityBasisKey(A, C),
        "named_actor",
        "named_actor",
        /predecessor Named-Actor capability state is cold provenance/,
      ],
    ];
    const head = s.campaign.store.head();
    for (const [key, owner, , message] of cases) {
      const g = rawWorldPriorBasis(s, 50, A, D, {
        edit: (v) => (v.establishment.causes = [{ ...causes[0]!, fact_key: key, owner }]),
      });
      const fact = s.campaign.store.getFact(key)!;
      g.reads = [
        ...g.reads.filter(
          (r) => r.key === pcExistenceContractKey(A) || r.key === PLAYER_CHARACTER_BINDING_KEY,
        ),
        { key, version: fact.version },
      ];
      g.depends_on = [...g.reads.map((r) => s.campaign.store.getFact(r.key)!.provenance.group_id)];
      const r = await s.campaign.store.commit(g);
      expect(r.ok, key).toBe(false);
      expect(r.ok ? "" : r.error.message, key).toMatch(message);
      expect(s.campaign.store.head(), key).toEqual(head);
    }
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
  });

  it("the owner path refuses the same causes before anything is drawn", async () => {
    const s = await handedOver();
    const head = s.campaign.store.head();
    for (const cause of [
      { ...causes[0]!, owner: "causal_draw_kernel" },
      { ...causes[0]!, owner: "temporal_kernel", fact_key: "temporal/state" },
      { ...causes[0]!, owner: "named_actor", fact_key: actorCapabilityBasisKey(A, "x") },
    ]) {
      expect(
        await codeOf(establishWorldPriorRandomized(s, 60, A, D, { causes: [cause] as never })),
      ).not.toBe("OK");
      expect(await codeOf(establishWorldPrior(s, 61, A, D, { causes: [cause] as never }))).not.toBe(
        "OK",
      );
    }
    expect(s.entropy.calls()).toBe(0);
    expect(s.campaign.store.head()).toEqual(head);
  });
});

describe("the one-owner boundary: nothing the predecessor already fixed is re-resolved, no aggregate is given a record", () => {
  it("a Named-Actor basis or capability for the same capability refuses the establishment, raw or through the owner", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    expect(await refused(s, rawWorldPriorBasis(s, 50, A, C))).toBe("KEY_NOT_ADMITTED");
    expect(await codeOf(establishWorldPrior(s, 51, A, C))).toBe("KEY_NOT_ADMITTED");
    expect(await codeOf(establishWorldPriorRandomized(s, 52, A, C))).toBe("KEY_NOT_ADMITTED");
  });

  it("an actor basis committed before the cutover and never closed refuses the establishment (no reroll across the cutover)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await must(
      s.actors.establishCapabilityBasis({
        group_id: "d-group",
        intent_id: "d-intent",
        cause: "d-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        capability: capabilityBasis(A, D),
      }),
    );
    await handedOverWithUnresolvedCapability(s);
    expect(await refused(s, rawWorldPriorBasis(s, 50, A, D))).toBe("KEY_NOT_ADMITTED");
    expect(await codeOf(establishWorldPrior(s, 51, A, D))).toBe("KEY_NOT_ADMITTED");
  });
});

describe("once Causal Draw evidence exists for the PC slot, only the establishment that reads it may fill the slot", () => {
  it("a deterministic world-prior basis over a committed draw is refused, raw and through the owner", async () => {
    const s = await handedOver();
    await must(drawPcSlot(s.campaign.store, s.entropy, A, D));
    expect(await refused(s, rawWorldPriorBasis(s, 50, A, D))).toBe("REFERENCE_INVALID");
    expect(await codeOf(establishWorldPrior(s, 51, A, D))).toBe("REFERENCE_INVALID");
    expect(s.pcs.basis(A, D)).toBeUndefined();
    // the draw itself is untouched: the owner's randomized establishment still fills the slot, reading exactly that result
    const result = structuredClone(s.campaign.store.getFact(causalDrawResultKey(digest))!);
    const calls = s.entropy.calls();
    await must(establishWorldPriorRandomized(s, 52, A, D));
    expect(s.entropy.calls()).toBe(calls);
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))).toEqual(result);
  });

  it("a precommit alone also closes the slot to the deterministic path", async () => {
    const s = await handedOver();
    const { crashBefore, isResultGroup } = await import("../support/causal-draw.ts");
    const { PcCapabilityAdapter } = await import("@immortalis/engine");
    const { seededEntropy, SEED_1 } = await import("@immortalis/testkit");
    const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isResultGroup), {
      entropy: seededEntropy(SEED_1),
    });
    const r = await crashing.establishExistingActorRandomizedCapabilityBasis({
      ...worldPriorPublication(1),
      capability: worldPriorRandomizedInput(A, D),
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.getFact(causalDrawPrecommitKey(digest))).toBeDefined();
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))).toBeUndefined();
    expect(await refused(s, rawWorldPriorBasis(s, 50, A, D))).toBe("REFERENCE_INVALID");
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });

  it("neither a carried nor a generated basis can sidestep the draw: every other establishment over draw evidence is refused", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    // draw evidence for the PC slot made by anyone holding the ports (a raw draw): the carry-forward may not fill the slot
    await must(drawPcSlot(s.campaign.store, s.entropy, A, C));
    expect(await codeOf(carryForward(s, 1, A, C))).toBe("REFERENCE_INVALID");
    expect(s.pcs.basis(A, C)).toBeUndefined();
  });

  it("a randomized basis is exactly what its committed draw determines: marker, draw identity, result, causes, prior and rule", async () => {
    const s = await handedOver();
    await must(drawPcSlot(s.campaign.store, s.entropy, A, D));
    const lawful = rawWorldPriorBasis(s, 50, A, D, { randomized: true });
    const selected = (lawful.writes[0]!.value as any).marker;
    const otherMarker = selected === "S" ? "A" : "S";
    const cases: Record<string, [Parameters<typeof rawWorldPriorBasis>[4], RegExp?]> = {
      "marker is not the selected candidate's": [
        { randomized: true, edit: (v) => (v.marker = otherMarker) },
      ],
      "marker made ungraded": [{ randomized: true, edit: (v) => (v.marker = null) }],
      "another draw identity": [
        {
          randomized: true,
          edit: (v) => (v.establishment.draw.draw_id = `cdraw:v1:${"0".repeat(64)}`),
        },
      ],
      "result pinned at another version": [
        { randomized: true, edit: (v) => (v.establishment.draw.result.version = 2) },
      ],
      "another result key": [
        {
          randomized: true,
          edit: (v) => (v.establishment.draw.result.fact_key = causalDrawPrecommitKey(digest)),
        },
      ],
      "causes that are not the prior's inputs": [
        { randomized: true, edit: (v) => v.establishment.causes.pop() },
      ],
      "the result is not read": [
        {
          randomized: true,
          groupOver: {
            reads: lawful.reads.filter((r) => r.key !== causalDrawResultKey(digest)),
          },
        },
      ],
      "the canonical result group is not depended on": [
        {
          randomized: true,
          groupOver: { depends_on: lawful.depends_on.filter((d) => d !== pcDrawResultGroup(A, D)) },
        },
      ],
    };
    for (const [name, [o]] of Object.entries(cases)) {
      const g = rawWorldPriorBasis(s, 50, A, D, o);
      expect(await refused(s, g), name).not.toBe("OK");
    }
    // the lawful one still lands, so each refusal above was the rule it names
    await must(s.campaign.store.commit(lawful));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a randomized basis with no committed draw has nothing to read and is refused", async () => {
    const s = await handedOver();
    const g = rawWorldPriorBasis(s, 50, A, D, {
      randomized: true,
      edit: (v) => {
        v.establishment.draw = {
          draw_id: `cdraw:v1:${digest}`,
          result: { fact_key: causalDrawResultKey(digest), version: 1 },
        };
        v.marker = "C";
      },
    });
    expect(await refused(s, g)).toBe("PREREQUISITE_MISSING");
  });

  it("a prior defined for another slot, under another rule or by another owner is not this owner's prior", async () => {
    const s = await handedOver();
    const { pcCapabilityDrawSpecification, CausalDrawAdapter, pcSlotInspector } =
      await import("@immortalis/engine");
    const input = worldPriorRandomizedInput(A, D);
    const refs = causes.map((c) => ({
      owner: c.owner,
      fact_key: c.fact_key,
      version: c.version,
      committed_by: s.campaign.store.getFact(c.fact_key)!.provenance.group_id,
    }));
    // a draw whose owner rule is NOT the PC owner's governing rule (a permissive authority lets it precommit)
    const permissive = new CausalDrawAdapter(s.campaign.store, {
      slotInspectors: new Map([["pc_existence", pcSlotInspector(s.campaign.store)]]),
      ruleAuthority: { isEffectiveForPriorCreation: () => true },
      entropy: s.entropy,
    });
    const spec: any = pcCapabilityDrawSpecification(input, refs);
    spec.owner_rule_ref = { ...spec.owner_rule_ref, clause: "a rule the PC owner does not hold" };
    await must(permissive.draw({ specification: spec, resolution: RESOLVER }));
    const g = rawWorldPriorBasis(s, 50, A, D, { randomized: true });
    expect(await refused(s, g)).toBe("REFERENCE_INVALID");
    // and the owner's own request over that stray draw conflicts instead of redrawing
    const calls = s.entropy.calls();
    expect(await codeOf(establishWorldPriorRandomized(s, 51, A, D))).toBe("DRAW_IDENTITY_CONFLICT");
    expect(s.entropy.calls()).toBe(calls);
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });

  it("a changed prior or cause set under the committed draw is a conflict, never a second draw", async () => {
    const s = await handedOver();
    await must(establishWorldPriorRandomized(s, 1, A, D));
    const calls = s.entropy.calls();
    const changed = await codeOf(
      establishWorldPriorRandomized(s, 2, A, D, {
        prior: [
          { marker: "C", weight: "1" },
          { marker: "S", weight: "9" },
        ],
      }),
    );
    expect(changed).not.toBe("OK");
    expect(s.entropy.calls()).toBe(calls);
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))!.version).toBe(1);
  });
});

describe("the governing-rule citation: the current one on every new write, the superseded one never", () => {
  it("a world-prior basis stamped with the superseded citation, or any other, is refused", async () => {
    const s = await handedOver();
    for (const rule of [
      PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
      { ...PC_CAPABILITY_RULE, clause: "drifted" },
    ]) {
      const g = rawWorldPriorBasis(s, 50, A, D, { groupOver: { rule } });
      expect(await refused(s, g)).toBe("REFERENCE_INVALID");
    }
  });

  it("a historical basis committed under the CURRENT citation is the lawful way new predecessor-class writes arrive (fresh PC and carry-forward)", async () => {
    const { seededPcCapabilityCampaign } = await import("../support/pc-capability.ts");
    const s = await seededPcCapabilityCampaign(tempDir());
    await must(
      s.pcs.receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: pcCapabilityBasis(FIXTURE_PC_ID, CAP_SAILING),
      }),
    );
    expect(s.pcs.basis(FIXTURE_PC_ID, CAP_SAILING)!.fact.provenance.rule).toEqual(
      PC_CAPABILITY_RULE,
    );
  });

  it("the close of a world-prior basis carries the current citation", async () => {
    const s = await handedOver();
    await must(establishWorldPrior(s, 1, A, D));
    await closePcCapability(s, 20, A, D);
    expect(s.pcs.capability(A, D)!.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the strict contracts: no marker, prior, weight, seed, grade, claim or source rides in an establishment", () => {
  it("the owner inputs accept identity, causes and (deterministic) the marker or (randomized) the prior, and nothing else", async () => {
    const s = await handedOver();
    const head = s.campaign.store.head();
    const det = (capability: unknown) =>
      s.pcs.establishExistingActorCapabilityBasis({ ...worldPriorPublication(70), capability });
    const rnd = (capability: unknown) =>
      s.pcs.establishExistingActorRandomizedCapabilityBasis({
        ...worldPriorPublication(71),
        capability,
        resolution: RESOLVER,
      });
    for (const extra of [
      { handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 } },
      { source: { fact_key: "x", version: 1 } },
      { grade: "S" },
      { weight: "1" },
      { claims: [] },
      { seed: "00" },
    ]) {
      expect(await codeOf(det({ ...worldPriorInput(A, D), ...extra }))).toBe("INPUT_INVALID");
      expect(await codeOf(rnd({ ...worldPriorRandomizedInput(A, D), ...extra }))).toBe(
        "INPUT_INVALID",
      );
    }
    // a marker on the randomized input, a prior on the deterministic one
    expect(await codeOf(rnd({ ...worldPriorRandomizedInput(A, D), marker: "S" }))).toBe(
      "INPUT_INVALID",
    );
    expect(await codeOf(det({ ...worldPriorInput(A, D), prior: [] }))).toBe("INPUT_INVALID");
    // no cause at all, a duplicated cause, an unknown aspect
    expect(await codeOf(det({ ...worldPriorInput(A, D), causes: [] }))).toBe("INPUT_INVALID");
    expect(await codeOf(det({ ...worldPriorInput(A, D), causes: [causes[0], causes[0]] }))).toBe(
      "INPUT_INVALID",
    );
    expect(
      await codeOf(det({ ...worldPriorInput(A, D), causes: [{ ...causes[0], aspect: "FAME" }] })),
    ).toBe("INPUT_INVALID");
    expect(s.entropy.calls()).toBe(0);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the establishments are closed on the stored form: a smuggled field, a draw on the deterministic method or a missing draw is VALUE_INVALID", async () => {
    const s = await handedOver();
    const variants: Record<string, (v: any) => void> = {
      "marker in the establishment": (v) => (v.establishment.marker = "S"),
      "prior in the establishment": (v) => (v.establishment.prior = []),
      "draw on the deterministic method": (v) =>
        (v.establishment.draw = {
          draw_id: `cdraw:v1:${digest}`,
          result: { fact_key: "k", version: 1 },
        }),
      "source on the world-prior method": (v) =>
        (v.establishment.source = { fact_key: "k", version: 1 }),
      "unknown method": (v) => (v.establishment.method = "EXISTING_ACTOR_WORLD_PRIOR"),
      "no causes": (v) => (v.establishment.causes = []),
      "claims as a fresh PC": (v) => (v.establishment.claims = []),
    };
    for (const [name, edit] of Object.entries(variants)) {
      const g = rawWorldPriorBasis(s, 50, A, D, { edit });
      expect(await refused(s, g), name).toBe("VALUE_INVALID");
    }
    const randomizedWithoutDraw = rawWorldPriorBasis(s, 51, A, D, {
      randomized: true,
      edit: (v) => delete v.establishment.draw,
    });
    expect(await refused(s, randomizedWithoutDraw)).toBe("VALUE_INVALID");
  });

  it("the fresh-PC receiving path presents only ACCEPTED_GENERATION_HISTORY: the new methods cannot be smuggled through it", async () => {
    const s = await handedOver();
    const base = rawWorldPriorBasis(s, 50, A, D).writes[0]!.value;
    const r = await s.pcs.receiveCapabilityBasis({
      ...pcCapabilityPublication(80),
      capability: base,
    });
    expect(r.ok ? "" : r.error.code).toBe("INPUT_INVALID");
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });
});

describe("after the handover the Named-Actor state is cold provenance and cannot become writable again", () => {
  it("no Named-Actor write for the identity is admitted, before or after the world-prior establishment, raw or through the owner", async () => {
    const s = await handedOver();
    const attempt = async (n: number) =>
      codeOf(
        s.actors.establishCapabilityBasis({
          group_id: `late-${n}`,
          intent_id: `late-${n}`,
          cause: "late",
          basis: "fixture-basis",
          secrecy: "fixture-visibility",
          capability: capabilityBasis(A, D),
        }),
      );
    expect(await attempt(1)).toBe("KEY_NOT_ADMITTED");
    await must(establishWorldPrior(s, 1, A, D));
    expect(await attempt(2)).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.getFact(actorCapabilityBasisKey(A, D))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});
