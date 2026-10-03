/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor Capability → PC Capability Carry-Forward — enforcement that does not depend on the adapter behaving. IM-11
// admission holds for a raw `store.commit` and for a TAMPERED group: the committed EXISTING_ACTOR_HANDOVER is required and is the
// cutover basis; only the same identity/capability's already-authoritative `named_actor_capability` carries; the marker is
// carried exactly; wrong identity or capability, a mere basis, a missing or ordinary-activation binding, stale or fabricated
// versions, an altered marker and a raw-store bypass all fail closed; and the fresh-PC ACCEPTED_GENERATION_HISTORY rule is
// untouched.
// Register lineage: IA-02, IA-03, IA-14 (partial); RC-02, RC-07, RC-13, RC-16; IM-03, IM-07, IM-11, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import { PC_CAPABILITY_RULE, factKind } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SAILING,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  capabilityBasis,
  group,
  pcCapabilityBasis,
  pcCapabilityPublication,
  write,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  carryForward,
  closeActorCapability,
  coupleActor,
  closePcCapability,
  compileExistingActor,
  establishActorBasis,
  existingActorContract,
  handoverActor,
  rawCarryBasis,
  readyForCarryForward,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const basisKey = pcCapabilityBasisKey(A, C);
const contractKey = pcExistenceContractKey(A);

/** A handed-over actor whose C is authoritative, and whose D is ALSO authoritative (a second lawful source). */
async function handedOver(extra = false): Promise<ExistingActorSeeded> {
  const s = await seededExistingActorCampaign(tempDir());
  await readyForCarryForward(s);
  if (extra) {
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
    await closeActorCapability(s, 11, A, D);
  }
  await must(handoverActor(s, 1));
  return s;
}

const refused = async (s: ExistingActorSeeded, g: ReturnType<typeof rawCarryBasis>) => {
  const head = s.campaign.store.head();
  const code = await codeOf(s.campaign.store.commit(g));
  expect(s.campaign.store.head()).toEqual(head);
  expect(s.campaign.store.getFact(g.writes[0]!.key)).toBeUndefined();
  return code;
};

describe("the lawful carry-forward group is exactly what the owner path builds", () => {
  it("a raw store commit of the mechanically built group is admitted (the baseline every tamper below departs from)", async () => {
    const s = await handedOver();
    const g = rawCarryBasis(s, 50);
    expect((await must(s.campaign.store.commit(g))).replayed).toBe(false);
    expect(s.pcs.basis(A, C)!.value.establishment.method).toBe("EXISTING_ACTOR_CARRY_FORWARD");
    expect(s.pcs.basis(A, C)!.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the committed EXISTING_ACTOR_HANDOVER is required and is the cutover basis", () => {
  it("before the handover, a raw carry-forward of an authoritative actor capability is refused: the actor stays the lawful owner", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    const g = rawCarryBasis(s, 50, A, C, (v) => (v.establishment.handover.version = 1));
    expect(await refused(s, g)).toBe("PREREQUISITE_MISSING");
    expect(await codeOf(carryForward(s, 51))).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
  });

  it("a binding that is not the handover of this identity is no basis: an ordinary ACTIVATION of another PC cannot carry an actor's capability", async () => {
    // the freshly generated PC is bound by ACTIVATION; no Named-Actor capability can exist for it (the actor owner refuses a
    // PC identity), so the carry-forward has no source, and the binding is the wrong transition besides
    const { seededPcCapabilityCampaign } = await import("../support/pc-capability.ts");
    const s = await seededPcCapabilityCampaign(tempDir());
    const P = FIXTURE_PC_ID;
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    expect((binding.value as any).transition.type).toBe("ACTIVATION");
    const g = rawCarryBasis(
      { campaign: s.campaign },
      50,
      P,
      CAP_SAILING,
      (v) => {
        v.marker = "C";
        v.establishment.handover.version = binding.version;
        v.establishment.source.version = 1;
      },
      {
        reads: [
          { key: pcExistenceContractKey(P), version: 1 },
          { key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
        ],
        depends_on: [
          s.campaign.store.getFact(pcExistenceContractKey(P))!.provenance.group_id,
          binding.provenance.group_id,
        ],
      },
    );
    expect(await codeOf(s.campaign.store.commit(g))).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(pcCapabilityBasisKey(P, CAP_SAILING))).toBeUndefined();
  });

  it("the handover binding is the one cutover: nothing else may be cited as it", async () => {
    const s = await handedOver();
    const g = rawCarryBasis(s, 50, A, C, (v) => (v.establishment.handover.fact_key = contractKey));
    expect(await refused(s, g)).toBe("VALUE_INVALID");
  });
});

describe("only the same identity's already-authoritative capability carries", () => {
  it("a mere named_actor_capability_basis is no source", async () => {
    const s = await handedOver();
    const g = rawCarryBasis(
      s,
      50,
      A,
      C,
      (v) => (v.establishment.source = { fact_key: actorCapabilityBasisKey(A, C), version: 1 }),
      {
        reads: [
          { key: contractKey, version: 1 },
          { key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
          { key: actorCapabilityBasisKey(A, C), version: 1 },
        ],
      },
    );
    expect(await refused(s, g)).toBe("REFERENCE_INVALID");
  });

  it("an absent capability is no source (a basis that never closed before the cutover)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1, A));
    await must(compileExistingActor(s, 1, existingActorContract(A, [actorBasisPin(A, C)])));
    await must(handoverActor(s, 1));
    expect(s.actors.capability(A, C)).toBeUndefined();
    const g = rawCarryBasis(s, 50, A, C, (v) => (v.establishment.source.version = 1));
    expect(await refused(s, g)).toBe("PREREQUISITE_MISSING");
    expect(await codeOf(carryForward(s, 51))).toBe("PREREQUISITE_MISSING");
  });

  it("wrong identity or capability: another capability's or another actor's capability is refused, whatever it cites", async () => {
    const s = await handedOver(true);
    // D is authoritative for A, but this basis is for C
    const otherCapability = rawCarryBasis(s, 50, A, C, (v) => {
      v.establishment.source = {
        fact_key: actorCapabilityKey(A, D),
        version: s.campaign.store.getFact(actorCapabilityKey(A, D))!.version,
      };
    });
    expect(await refused(s, otherCapability)).toBe("REFERENCE_INVALID");
    // a basis for a different capability/identity than its key names
    const keyIdentity = rawCarryBasis(s, 51, A, C, (v) => (v.capability_id = D));
    expect(await refused(s, keyIdentity)).toBe("VALUE_INVALID");
    const otherPc = rawCarryBasis(s, 52, A, C, (v) => (v.pc_id = ACTOR_OTHER));
    expect(await refused(s, otherPc)).toBe("VALUE_INVALID");
    // another actor's committed capability at its own key is not this identity's source
    const foreign = rawCarryBasis(s, 53, A, C, (v) => {
      v.establishment.source = { fact_key: actorCapabilityKey(ACTOR_OTHER, C), version: 1 };
    });
    expect(await refused(s, foreign)).toBe("PREREQUISITE_MISSING");
    // the owner path agrees: D carries, and a PC identity that is not the handed-over actor has nothing to carry
    expect(await codeOf(carryForward(s, 54, ACTOR_OTHER, C))).toBe("PREREQUISITE_MISSING");
    await must(carryForward(s, 55, A, D));
    expect(s.pcs.basis(A, D)!.value.marker).toBe(s.actors.capability(A, D)!.value.marker);
  });

  it("the PC owner cannot carry what the Named-Actor owner never made authoritative: an `ACCEPTED_GENERATION_HISTORY` basis for the handed-over actor is still refused", async () => {
    const s = await handedOver();
    const fresh = pcCapabilityBasis(A, C);
    const g = group(
      FIXTURE_CAMPAIGN,
      60,
      [
        write(basisKey, fresh as never, {
          owner: "pc_existence",
          facet: "pc_capability_profile",
        }),
      ],
      {
        owner: "pc_existence",
        facet: "pc_capability_profile",
        rule: PC_CAPABILITY_RULE,
        reads: [{ key: contractKey, version: 1 }],
        depends_on: [s.campaign.store.getFact(contractKey)!.provenance.group_id],
      },
    );
    expect(await refused(s, g)).toBe("REFERENCE_INVALID");
    // nor through the owner path: the generation-history method is the fresh PC's, the carry is the other method
    const viaOwner = await s.pcs.receiveCapabilityBasis({
      ...pcCapabilityPublication(61),
      capability: fresh,
    });
    expect(viaOwner.ok).toBe(false);
    expect(s.pcs.basis(A, C)).toBeUndefined();
  });
});

describe("the marker is carried exactly: nothing is rerolled, graded, derived or recalibrated", () => {
  it("an altered, regraded, dropped or invented marker is refused", async () => {
    const s = await handedOver();
    expect(s.actors.capability(A, C)!.value.marker).toBe("C");
    let n = 50;
    for (const marker of ["B", "A", "S", null, { ex: "SYNTHETIC FIXTURE: invented" }] as const) {
      const g = rawCarryBasis(s, n++, A, C, (v) => (v.marker = marker));
      expect(await refused(s, g), JSON.stringify(marker)).toBe("REFERENCE_INVALID");
    }
    // an absent marker is not an explicit null
    const absent = rawCarryBasis(s, n++, A, C, (v) => delete v.marker);
    expect(await refused(s, absent)).toBe("VALUE_INVALID");
    // the lawful group still commits afterwards: nothing above was half-written
    await must(s.campaign.store.commit(rawCarryBasis(s, n)));
  });

  it("no input of any resolution is presentable: a marker, grade, prior, claim, version or source on the owner path is INPUT_INVALID", async () => {
    const s = await handedOver();
    for (const extra of [
      { marker: "S" },
      { grade: "S" },
      { prior: [{ marker: "S", weight: "1" }] },
      { claims: [] },
      { source: { fact_key: actorCapabilityKey(A, C), version: 1 } },
      { handover: { version: 1 } },
    ]) {
      const r = await s.pcs.carryForwardActorCapability({
        ...pcCapabilityPublication(70),
        carry: { pc_id: A, capability_id: C, ...extra },
      });
      expect(!r.ok && r.error.code, JSON.stringify(extra)).toBe("INPUT_INVALID");
    }
    expect(s.pcs.basis(A, C)).toBeUndefined();
  });

  it("the carry-forward establishment is closed: no marker, claim locator, contract pointer, draw or prior can be smuggled into it", async () => {
    const s = await handedOver();
    const edits: Record<string, (v: any) => void> = {
      "a marker": (v: any) => (v.establishment.marker = "S"),
      claims: (v: any) => (v.establishment.claims = [{ section: "identity_agency", index: 0 }]),
      "a contract pointer": (v: any) =>
        (v.establishment.contract = { fact_key: contractKey, version: 1 }),
      "a draw": (v: any) => (v.establishment.draw = { draw_id: "d" }),
      causes: (v: any) => (v.establishment.causes = []),
      "a prior": (v: any) => (v.establishment.prior = []),
      "a materiality": (v: any) => (v.materiality = "ROLE_DEFINING"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(await refused(s, rawCarryBasis(s, 50, A, C, edit)), name).toBe("VALUE_INVALID");
  });
});

describe("stale, fabricated and unpinned references fail closed", () => {
  it("a stale, fabricated or absent version of the handover, the source or the contract is refused", async () => {
    const s = await handedOver();
    const variants: Record<string, [(v: any) => void, string]> = {
      "handover version ahead": [
        (v) => (v.establishment.handover.version = 2),
        "REFERENCE_INVALID",
      ],
      "source version ahead": [(v) => (v.establishment.source.version = 2), "REFERENCE_INVALID"],
      "handover version 0": [(v) => (v.establishment.handover.version = 0), "VALUE_INVALID"],
      "source version 0": [(v) => (v.establishment.source.version = 0), "VALUE_INVALID"],
      "source key fabricated": [
        (v) => (v.establishment.source.fact_key = actorCapabilityKey(A, "capability-nope")),
        "PREREQUISITE_MISSING",
      ],
    };
    let n = 50;
    for (const [name, [edit, code]] of Object.entries(variants))
      expect(await refused(s, rawCarryBasis(s, n++, A, C, edit)), name).toBe(code);
  });

  it("a group that did not read, or did not depend on, what it cites is refused", async () => {
    const s = await handedOver();
    const g = rawCarryBasis(s, 50);
    const reads = g.reads;
    const deps = g.depends_on;
    let n = 51;
    for (const [name, over] of Object.entries({
      "no contract read": { reads: reads.filter((r) => r.key !== contractKey) },
      "no binding read": { reads: reads.filter((r) => r.key !== PLAYER_CHARACTER_BINDING_KEY) },
      "no source read": { reads: reads.filter((r) => r.key !== actorCapabilityKey(A, C)) },
      "stale source read": {
        reads: reads.map((r) => (r.key === actorCapabilityKey(A, C) ? { ...r, version: 9 } : r)),
      },
      "no dependencies": { depends_on: [] },
      "no source dependency": {
        depends_on: deps.filter(
          (d) => d !== s.campaign.store.getFact(actorCapabilityKey(A, C))!.provenance.group_id,
        ),
      },
      "no binding dependency": {
        depends_on: deps.filter(
          (d) => d !== s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!.provenance.group_id,
        ),
      },
    }))
      expect(
        await refused(
          s,
          rawCarryBasis(s, n++, A, C, () => undefined, over),
        ),
        name,
      ).toMatch(/REFERENCE_INVALID|PREREQUISITE_MISSING|STALE_READ/);
  });
});

describe("ownership: the PC owner alone holds the carried capability; the predecessor is cold provenance", () => {
  it("no other owner can write either PC capability key, and the carry-forward is create-only", async () => {
    const s = await handedOver();
    await must(carryForward(s, 1));
    for (const owner of [
      ["named_actor", "actor_profile"],
      ["role_registry", "player_character_binding"],
      ["pc_existence", "existence_contract"],
    ] as const) {
      const g = rawCarryBasis(s, 80, A, C, () => undefined, {
        owner: owner[0],
        facet: owner[1],
      });
      const code = await codeOf(
        s.campaign.store.commit({
          ...g,
          writes: g.writes.map((w) => ({ ...w, owner: owner[0], facet: owner[1], key: basisKey })),
        }),
      );
      expect(code, owner[0]).not.toBe("OK");
    }
    // sealed: an overwrite or a second intent for the same slot is refused
    const again = rawCarryBasis(s, 81);
    expect(await codeOf(s.campaign.store.commit(again))).not.toBe("OK");
    expect(s.pcs.basis(A, C)!.fact.version).toBe(1);
  });

  it("the actor owner stays closed for the identity after the carry-forward, and the predecessor facts are untouched", async () => {
    const s = await handedOver();
    const before = [actorCapabilityKey(A, C), actorCapabilityBasisKey(A, C)].map((k) =>
      structuredClone(s.campaign.store.getFact(k)),
    );
    await must(carryForward(s, 1));
    await closePcCapability(s, 20);
    const late = await s.actors.establishCapabilityBasis({
      group_id: "late-group",
      intent_id: "late-intent",
      cause: "late-cause",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, "capability-late"),
    });
    expect(!late.ok && late.error.code).toBe("KEY_NOT_ADMITTED");
    expect(
      [actorCapabilityKey(A, C), actorCapabilityBasisKey(A, C)].map((k) =>
        s.campaign.store.getFact(k),
      ),
    ).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the PC Capability Close of a carried capability is exactly what its basis determines: a raw close with an altered marker or no authority is refused", async () => {
    const s = await handedOver();
    await must(carryForward(s, 1));
    const capKey = pcCapabilityKey(A, C);
    const basis = s.pcs.basis(A, C)!;
    const forged = (marker: unknown) =>
      group(
        FIXTURE_CAMPAIGN,
        90,
        [
          write(
            capKey,
            {
              pc_id: A,
              capability_id: C,
              marker,
              basis: { fact_key: basisKey, version: 1 },
              close: {
                name: "PC Capability Close",
                stage: {
                  causal_process_id: `pc-capability/${A}/${C}`,
                  owner_operation: {
                    owner: "pc_existence",
                    operation: "pc-publish-capability-close",
                  },
                  prospective_result_id: capKey,
                },
              },
            } as never,
            { owner: "pc_existence", facet: "pc_capability_profile" },
          ),
        ],
        {
          owner: "pc_existence",
          facet: "pc_capability_profile",
          rule: factKind("pc_capability").rule,
          reads: [{ key: basisKey, version: 1 }],
          depends_on: [basis.fact.provenance.group_id],
        },
      );
    for (const marker of ["S", null]) {
      expect(await codeOf(s.campaign.store.commit(forged(marker)))).not.toBe("OK");
    }
    // even the exact marker is refused without the durable authority of an open transaction (the close is a stage only)
    expect(await codeOf(s.campaign.store.commit(forged("C")))).not.toBe("OK");
    expect(s.pcs.capability(A, C)).toBeUndefined();
  });
});
