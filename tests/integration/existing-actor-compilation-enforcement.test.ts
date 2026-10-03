/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor I-002 Pre-Binding Compilation & Ownership Boundary Foundation — enforcement: the exception is exactly the
// explicitly source-backed compilation of an already-existing actor; no fresh/arbitrary PC can use it; ordinary Role
// Registry activation and the ACCEPTED_GENERATION_HISTORY PC-capability receipt both refuse it; a raw `store.commit` cannot
// bypass any of it; and malformed or tampered provenance or classification fails closed. Admission is a pure function of
// (group, state), so every rule below holds for the owner paths and for a raw commit alike.
// Register lineage: IA-01/02/03 (partial), IA-14 (partial); RC-02, RC-13; IM-03, IM-07, IM-11.
// Sources: spec/f027/spec-lock.json — I-002 pin 2026-09-25T00:15:54.536Z, IR pin 2026-09-25T00:17:26.287Z, WS-006 pin
// 2026-09-25T00:18:36.828Z, WS-016 pin 2026-09-24T17:38:59.210Z; PC-CONTROL HANDOVER CONTRACT v1 and I-002 v2.4 as named by the
// slice brief. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { PC_CAPABILITY_RULE, factKind } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_COMMAND,
  CAP_METALWORKING,
  CAP_SAILING,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  fixtureContract,
  fixtureInsertionFact,
  group,
  pcCapabilityBasis,
  write,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  actorCapabilityPin,
  bindingInput,
  compileExistingActor,
  establishActorBasis,
  existingActorContract,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const contractKey = pcExistenceContractKey(A);

/** A campaign whose actor A has committed state (a basis) and is compiled into I-002 form; nothing is bound. */
async function compiled(): Promise<ExistingActorSeeded> {
  const s = await seededExistingActorCampaign(tempDir());
  await establishActorBasis(s, 1, A, C);
  await must(compileExistingActor(s, 1));
  return s;
}

const groupOf = (s: ExistingActorSeeded, key: string) =>
  s.campaign.store.getFact(key)!.provenance.group_id;

/** A raw Existence Contract commit that pins the given sources exactly as the owner path would (or deliberately not). */
function rawContract(
  s: ExistingActorSeeded,
  n: number,
  contract: unknown,
  o: { pcId?: string; reads?: CommitGroup["reads"]; depends_on?: string[]; expected?: number } = {},
): CommitGroup {
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(pcExistenceContractKey(o.pcId ?? A), contract as never, {
        owner: "pc_existence",
        facet: "existence_contract",
        expected_version: o.expected ?? 0,
      }),
    ],
    {
      owner: "pc_existence",
      facet: "existence_contract",
      rule: factKind("pc_existence_contract").rule,
      reads: o.reads ?? [],
      depends_on: o.depends_on ?? [],
    },
  );
}
const pinning = (s: ExistingActorSeeded, ...keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: s.campaign.store.getFact(k)!.version })),
  depends_on: keys.map((k) => groupOf(s, k)),
});

/** A raw first-ACTIVATION binding of `pcId`, pinned exactly as `bindPlayerCharacter` would pin it. */
function rawBinding(s: ExistingActorSeeded, n: number, pcId: string): CommitGroup {
  const pcKey = pcExistenceContractKey(pcId);
  const wKey = worldProfileKey(FIXTURE_WORLD_ID);
  const lKey = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
  const v = (k: string) => s.campaign.store.getFact(k)!.version;
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(
        PLAYER_CHARACTER_BINDING_KEY,
        {
          binding_slot: "role.player_character",
          active_pc: { fact_key: pcKey, entity_id: pcId },
          coupling: {
            world: { fact_key: wKey, entity_id: FIXTURE_WORLD_ID },
            locus: { fact_key: lKey, entity_id: FIXTURE_LOCUS_ID },
          },
          transition: {
            type: "ACTIVATION",
            basis: {
              ...fixtureInsertionFact(),
              pinned_versions: { pc: v(pcKey), world: v(wKey), locus: v(lKey) },
            },
          },
          prior_binding: null,
          replacement_binding: null,
          intrinsic_authority_migration: [],
          writer: { role: "role.archivist", permission: "permission.canon.write" },
        } as never,
        { owner: "role_registry", facet: "player_character_binding" },
      ),
    ],
    {
      owner: "role_registry",
      facet: "player_character_binding",
      rule: factKind("player_character_binding").rule,
      ...pinning(s, pcKey, wKey, lKey),
    },
  );
}

/** A raw PC capability basis group pinned to the PC's own Existence Contract. */
const rawPcBasis = (s: ExistingActorSeeded, n: number, pcId: string, claimSection: any) =>
  group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(
        pcCapabilityBasisKey(pcId, CAP_SAILING),
        pcCapabilityBasis(pcId, CAP_SAILING, {
          establishment: {
            method: "ACCEPTED_GENERATION_HISTORY",
            contract: { fact_key: pcExistenceContractKey(pcId), version: 1 },
            claims: [{ section: claimSection, index: 0 }],
          },
        }) as never,
        { owner: "pc_existence", facet: "pc_capability_profile" },
      ),
    ],
    {
      owner: "pc_existence",
      facet: "pc_capability_profile",
      rule: PC_CAPABILITY_RULE,
      ...pinning(s, pcExistenceContractKey(pcId)),
    },
  );

describe("arbitrary and new PCs cannot exploit the exception (evidence 3)", () => {
  it("a fresh contract for an identity that already has actor state still closes the Named-Actor owner for it", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        cause: "fresh-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: A }),
      }),
    );
    for (const cap of [D, CAP_COMMAND]) {
      const r = await s.actors.establishCapabilityBasis({
        group_id: `actor-group-${cap}`,
        intent_id: `actor-intent-${cap}`,
        cause: `actor-cause-${cap}`,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        capability: capabilityBasis(A, cap),
      });
      expect(!r.ok && r.error.code, cap).toBe("KEY_NOT_ADMITTED");
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a PC with no existing actor state cannot state the classification: a pin to nothing is no source", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    expect(await codeOf(compileExistingActor(s, 1))).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
    // and with the pins forged onto a raw commit that declares reads at version 0
    const raw = rawContract(s, 1, existingActorContract(A), {
      reads: [{ key: actorCapabilityBasisKey(A, C), version: 0 }],
    });
    expect(await codeOf(s.campaign.store.commit(raw))).toMatch(
      /^(PREREQUISITE_MISSING|STALE_READ|MISSING_DEPENDENCY)$/,
    );
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("a pin to another actor's state, another owner's state or another kind's state is no source for this identity", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, ACTOR_OTHER, C);
    // another actor's committed state
    expect(
      await codeOf(
        compileExistingActor(s, 1, existingActorContract(A, [actorBasisPin(ACTOR_OTHER, C)])),
      ),
    ).toBe("REFERENCE_INVALID");
    // the world profile, the binding slot and Population/PC-owner keys (committed or not) are no actor state
    for (const [i, key] of [
      worldProfileKey(FIXTURE_WORLD_ID),
      worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
    ].entries()) {
      const contract = existingActorContract(A, [
        { owner: "world_state", fact_key: key, version: 1 },
      ]);
      const raw = rawContract(s, 10 + i, contract, pinning(s, key));
      expect(await codeOf(s.campaign.store.commit(raw)), key).toBe("REFERENCE_INVALID");
    }
    // a pin whose owner field lies about the committing owner
    const lie = existingActorContract(A, [
      { owner: "world_state", fact_key: actorCapabilityBasisKey(ACTOR_OTHER, C), version: 1 },
    ]);
    expect(await codeOf(compileExistingActor(s, 2, lie))).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("a compilation is no player-authorship pass: any PLAYER-AUTHORED claim or override is refused", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const authored = { statement: "SYNTHETIC FIXTURE: authored.", provenance: "PLAYER-AUTHORED" };
    const base = existingActorContract(A);
    for (const over of [
      { identity_agency: authored },
      { embodiment_topology: authored },
      { continuity_rule: authored },
      { contact: { kind: "CONTACT_ANCHOR", surfaces: [authored] } },
      { entry_envelope: { items: [authored] } },
      { baseline_exception: { ...base.baseline_exception, player_overrides: [authored] } },
    ])
      expect(
        await codeOf(compileExistingActor(s, 1, { ...base, ...over } as never)),
        JSON.stringify(Object.keys(over)),
      ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("the classification cannot be added to, or removed from, a committed contract: sealed canon, no amendment", async () => {
    const s = await compiled();
    const fresh = fixtureContract({ pc_id: A });
    expect(await codeOf(s.campaign.store.commit(rawContract(s, 20, fresh, { expected: 1 })))).toBe(
      "AMENDMENT_NOT_SUPPORTED",
    );
    const t = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(t, 1, A, C);
    await must(
      t.campaign.releasePlayerCharacter({
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        cause: "fresh-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: A }),
      }),
    );
    const upgrade = rawContract(t, 21, existingActorContract(A), {
      expected: 1,
      ...pinning(t, actorCapabilityBasisKey(A, C)),
    });
    expect(await codeOf(t.campaign.store.commit(upgrade))).toBe("AMENDMENT_NOT_SUPPORTED");
    // the committed fresh contract still closes the actor owner
    const r = await t.actors.establishCapabilityBasis({
      group_id: "actor-group-9",
      intent_id: "actor-intent-9",
      cause: "actor-cause-9",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, D),
    });
    expect(!r.ok && r.error.code).toBe("KEY_NOT_ADMITTED");
  });

  it("a second compilation of an identity, or a compilation of an identity whose PC is already bound, cannot be committed", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        cause: "fresh-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: A }),
      }),
    );
    await must(s.campaign.bindPlayerCharacter(bindingInput(A, 4)));
    await establishActorBasis({ actors: s.actors }, 1, ACTOR_OTHER, C);
    // A is a bound fresh PC: its contract key is taken, so nothing can re-state it as an existing-actor compilation
    const again = existingActorContract(A, [actorBasisPin(ACTOR_OTHER, C)]);
    expect(await codeOf(compileExistingActor(s, 3, again))).not.toBe("OK");
    expect(
      (s.campaign.store.getFact(contractKey)!.value as any).existing_actor_compilation,
    ).toBeUndefined();
  });

  it("an existing-actor compilation of one identity grants nothing to any other identity", async () => {
    const s = await compiled();
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-b-group",
        intent_id: "fresh-b-intent",
        cause: "fresh-b-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: ACTOR_OTHER }),
      }),
    );
    const r = await s.actors.establishCapabilityBasis({
      group_id: "actor-group-9",
      intent_id: "actor-intent-9",
      cause: "actor-cause-9",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(ACTOR_OTHER, C),
    });
    expect(!r.ok && r.error.code).toBe("KEY_NOT_ADMITTED");
    // while A, compiled, keeps its own lawful non-PC owner
    await establishActorBasis(s, 2, A, D);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("ordinary Role Registry activation rejects the existing-actor compilation (evidence 4)", () => {
  it("bindPlayerCharacter refuses it and writes nothing; the actor's prior owner stays writable", async () => {
    const s = await compiled();
    const head = s.campaign.store.head();
    const r = await s.campaign.bindPlayerCharacter(bindingInput(A, 4));
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(
      /Existing-Actor → PC handover, which is its own EXISTING_ACTOR_HANDOVER transition/,
    );
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.binding()).toBeUndefined();
    // the actor owner is untouched by the refused attempt
    await establishActorBasis(s, 2, A, D);
    expect(s.actors.basis(A, D)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a raw store.commit of the same first ACTIVATION is refused identically", async () => {
    const s = await compiled();
    const r = await s.campaign.store.commit(rawBinding(s, 30, A));
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/already-existing actor/);
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
  });

  it("the same raw first ACTIVATION of a fresh PC is lawful: the ordinary path is unchanged", async () => {
    const s = await compiled();
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-b-group",
        intent_id: "fresh-b-intent",
        cause: "fresh-b-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: ACTOR_OTHER }),
      }),
    );
    await must(s.campaign.store.commit(rawBinding(s, 31, ACTOR_OTHER)));
    expect(s.campaign.binding()!.value.active_pc.entity_id).toBe(ACTOR_OTHER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a binding does not become lawful by also carrying prior/replacement or migration fields: the schema is closed", async () => {
    const s = await compiled();
    const g = rawBinding(s, 32, A);
    const value = g.writes[0]!.value as any;
    for (const edit of [
      (v: any) => (v.prior_binding = { fact_key: contractKey, entity_id: A }),
      (v: any) => (v.intrinsic_authority_migration = [{ from: "named_actor", to: "pc_existence" }]),
      (v: any) => (v.transition.type = "HANDOVER"),
      (v: any) => (v.handover = { from: "named_actor" }),
    ]) {
      const copy = structuredClone(value);
      edit(copy);
      const mutated = { ...g, writes: [{ ...g.writes[0]!, value: copy }] };
      expect(await codeOf(s.campaign.store.commit(mutated as never))).toBe("VALUE_INVALID");
    }
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
  });
});

describe("ACCEPTED_GENERATION_HISTORY rejects the existing-actor compilation (evidence 5)", () => {
  it("the PC capability receipt refuses it, even with a located accepted (SAFELY-INHERITED) claim at the exact contract version", async () => {
    const s = await compiled();
    const head = s.campaign.store.head();
    const r = await s.pcs.receiveCapabilityBasis({
      group_id: "pccap-group-1",
      intent_id: "pccap-intent-1",
      cause: "pccap-cause-1",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: pcCapabilityBasis(A, CAP_SAILING, {
        establishment: {
          method: "ACCEPTED_GENERATION_HISTORY",
          contract: { fact_key: contractKey, version: 1 },
          claims: [{ section: "baseline_exception.safely_inherited", index: 0 }],
        },
      }),
    });
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/compiles an already-existing actor/);
    expect(s.pcs.basis(A, CAP_SAILING)).toBeUndefined();
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the actor's inherited mastery is never converted: a raw basis over every accepted-claim section is refused, and no PC capability key exists", async () => {
    const s = await compiled();
    for (const [i, section] of (
      [
        "identity_agency",
        "contact",
        "embodiment_topology",
        "continuity_rule",
        "baseline_exception.safely_inherited",
        "entry_envelope",
      ] as const
    ).entries()) {
      const r = await s.campaign.store.commit(rawPcBasis(s, 40 + i, A, section));
      expect(!r.ok && r.error.code, section).toBe("REFERENCE_INVALID");
    }
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
    ).toEqual([]);
    // the one-owner boundary is unchanged for an actor capability the actor holds
    const held = rawPcBasis(s, 50, A, "baseline_exception.safely_inherited");
    (held.writes[0]!.value as any).capability_id = C;
    (held.writes[0] as any).key = pcCapabilityBasisKey(A, C);
    expect((await s.campaign.store.commit(held)).ok).toBe(false);
    expect(s.campaign.store.getFact(pcCapabilityKey(A, C))).toBeUndefined();
  });

  it("a fresh PC's receipt over the same raw shape is lawful: the ordinary path is unchanged", async () => {
    const s = await compiled();
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-b-group",
        intent_id: "fresh-b-intent",
        cause: "fresh-b-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({
          pc_id: ACTOR_OTHER,
          baseline_exception: {
            safely_inherited: [
              { statement: "SYNTHETIC FIXTURE: inherited.", provenance: "SAFELY-INHERITED" },
            ],
            player_overrides: [],
            hypotheses: [],
            unresolved: [],
          },
        }),
      }),
    );
    await must(
      s.campaign.store.commit(
        rawPcBasis(s, 51, ACTOR_OTHER, "baseline_exception.safely_inherited"),
      ),
    );
    expect(s.pcs.basis(ACTOR_OTHER, CAP_SAILING)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a raw store.commit cannot bypass the compilation rules (evidence 6)", () => {
  it("an unpinned compilation (no read, no dependency) is refused: foreign state is pinned, never assumed", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const key = actorCapabilityBasisKey(A, C);
    const bare = rawContract(s, 60, existingActorContract(A));
    expect(await codeOf(s.campaign.store.commit(bare))).toBe("REFERENCE_INVALID");
    const noDependency = rawContract(s, 61, existingActorContract(A), {
      reads: [{ key, version: 1 }],
    });
    expect(await codeOf(s.campaign.store.commit(noDependency))).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
    // pinned exactly, it is lawful
    expect(
      (await s.campaign.store.commit(rawContract(s, 62, existingActorContract(A), pinning(s, key))))
        .ok,
    ).toBe(true);
  });

  it("a raw compilation with the wrong governing owner/facet or an unregistered key is refused", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const key = actorCapabilityBasisKey(A, C);
    for (const [owner, facet] of [
      ["named_actor", "actor_profile"],
      ["world_state", "world_profile"],
      ["pc_existence", "pc_capability_profile"],
    ] as const) {
      const g = rawContract(s, 63, existingActorContract(A), pinning(s, key));
      const wrong = {
        ...g,
        owner,
        facet,
        writes: [{ ...g.writes[0]!, owner, facet }],
      };
      expect(await codeOf(s.campaign.store.commit(wrong))).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT|OWNER_NOT_REGISTERED)$/,
      );
    }
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("the Named-Actor owner may still write only its own two key spaces after a compilation: no PC, binding or contract key", async () => {
    const s = await compiled();
    const actorGroup = (key: string, owner = "named_actor", facet = "actor_profile") =>
      group(FIXTURE_CAMPAIGN, 70, [write(key, {} as never, { owner, facet })], {
        owner,
        facet,
        rule: factKind("named_actor_capability_basis").rule,
      });
    for (const key of [
      contractKey,
      pcCapabilityBasisKey(A, CAP_SAILING),
      pcCapabilityKey(A, CAP_SAILING),
      PLAYER_CHARACTER_BINDING_KEY,
    ])
      expect(await codeOf(s.campaign.store.commit(actorGroup(key))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("the PC owner cannot publish a capability close for the compilation by any route", async () => {
    const s = await compiled();
    const close = group(
      FIXTURE_CAMPAIGN,
      80,
      [
        write(
          pcCapabilityKey(A, CAP_SAILING),
          {
            pc_id: A,
            capability_id: CAP_SAILING,
            marker: "S",
            basis: { fact_key: pcCapabilityBasisKey(A, CAP_SAILING), version: 1 },
            close: { name: "PC Capability Close", stage: {} },
          } as never,
          { owner: "pc_existence", facet: "pc_capability_profile" },
        ),
      ],
      { owner: "pc_existence", facet: "pc_capability_profile", rule: PC_CAPABILITY_RULE },
    );
    expect(await codeOf(s.campaign.store.commit(close))).not.toBe("OK");
    expect(s.campaign.store.getFact(pcCapabilityKey(A, CAP_SAILING))).toBeUndefined();
  });
});

describe("malformed or tampered provenance and classification fails closed (evidence 7)", () => {
  const tampered: Record<string, (c: any) => void> = {
    "classification altered": (c) => (c.existing_actor_compilation.classification = "DEFERRED"),
    "classification lowered": (c) =>
      (c.existing_actor_compilation.classification = "existing_actor_compilation"),
    "third classification": (c) => (c.existing_actor_compilation.classification = "ACTIVE-LIMITED"),
    "classification null": (c) => (c.existing_actor_compilation = null),
    "classification empty": (c) => (c.existing_actor_compilation = {}),
    "sources removed": (c) => (c.existing_actor_compilation.source_state = []),
    "sources missing": (c) => delete c.existing_actor_compilation.source_state,
    "source version zero": (c) => (c.existing_actor_compilation.source_state[0].version = 0),
    "source version fractional": (c) =>
      (c.existing_actor_compilation.source_state[0].version = 1.5),
    "source duplicated": (c) =>
      c.existing_actor_compilation.source_state.push({
        ...c.existing_actor_compilation.source_state[0],
      }),
    "source owner removed": (c) => delete c.existing_actor_compilation.source_state[0].owner,
    "source carries a copy of the actor's state": (c) =>
      (c.existing_actor_compilation.source_state[0].value = { marker: "S" }),
    "binding mode smuggled in": (c) => (c.existing_actor_compilation.binding_mode = "DEFERRED"),
    "readiness condition smuggled in": (c) =>
      (c.existing_actor_compilation.readiness_condition = "when awake"),
    "score smuggled in": (c) => (c.existing_actor_compilation.agency_score = 2),
    "timer smuggled in": (c) => (c.existing_actor_compilation.deadline = "2030"),
    "handover record beside the contract": (c) => (c.handover = { from: "named_actor" }),
    "binding mode beside the contract": (c) => (c.binding_mode = "ACTIVE-LIMITED"),
    unreleased: (c) => (c.release.status = "DRAFT"),
  };

  it("each tampered shape is refused by typed-contract admission, for the owner path and for a raw commit alike", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const key = actorCapabilityBasisKey(A, C);
    let n = 90;
    for (const [name, edit] of Object.entries(tampered)) {
      const c = structuredClone(existingActorContract(A));
      edit(c);
      expect(
        await codeOf(s.campaign.store.commit(rawContract(s, n++, c, pinning(s, key)))),
        name,
      ).toBe("VALUE_INVALID");
      expect(await codeOf(compileExistingActor(s, 5, c as never)), name).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("a pin altered to another version, kind, owner or identity is refused as an invalid reference", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await establishActorBasis(s, 2, ACTOR_OTHER, C);
    const key = actorCapabilityBasisKey(A, C);
    const cases: Record<string, (p: any) => void> = {
      "version moved": (p) => (p.version = 2),
      "owner moved": (p) => (p.owner = "world_state"),
      "another actor": (p) => (p.fact_key = actorCapabilityBasisKey(ACTOR_OTHER, C)),
      "the contract itself": (p) => (p.fact_key = contractKey),
      "a PC capability key": (p) => (p.fact_key = pcCapabilityBasisKey(A, C)),
      "an unregistered key": (p) => (p.fact_key = "actor/elsewhere"),
    };
    let n = 120;
    for (const [name, edit] of Object.entries(cases)) {
      const c = structuredClone(existingActorContract(A));
      edit(c.existing_actor_compilation!.source_state[0]);
      const code = await codeOf(
        s.campaign.store.commit(
          rawContract(s, n++, c, pinning(s, key, actorCapabilityBasisKey(ACTOR_OTHER, C))),
        ),
      );
      expect(code, name).toMatch(/^(REFERENCE_INVALID|PREREQUISITE_MISSING)$/);
    }
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("a source may be the actor's persisted capability as well as its basis, pinned at its exact version", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const capKey = actorCapabilityPin(A, C).fact_key;
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    // a persisted capability does not exist before its close, so a pin to it fails closed
    expect(
      await codeOf(
        compileExistingActor(s, 1, existingActorContract(A, [actorCapabilityPin(A, C)])),
      ),
    ).toBe("PREREQUISITE_MISSING");
  });
});
