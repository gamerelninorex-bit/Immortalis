/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Named-Actor Character Capability — enforcement that does not depend on the coordinator or on the owner operation
// behaving. IM-11 admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for
// everyone; a capability is never conjured by a consequence, never overwritten, never written for a Player Character,
// an entity under player control or a Population ledger; hand-written temporal objects are refused; unresolved Named-Actor
// uncertainty fails closed; and load-time verification fails closed on drift.
// Register lineage: IA-02, IA-03, IA-14, IA-06 (partial); RC-02, RC-03, RC-04, RC-07, RC-16; IM-02, IM-03, IM-07,
// IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  type CommitGroup,
  type NamedActorCapabilityBasis,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  NAMED_ACTOR_RULE,
  PopulationAdapter,
  TemporalCoordinator,
  stageGroupId,
  stageIntentId,
  verifyNamedActorIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_COMMAND,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  SYNTH_ACTOR_HISTORY_OWNER,
  SYNTH_CAPABILITY_CONSUMER_OWNER,
  actorProviders,
  actorPublication,
  at,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  consumerResultKey,
  fixtureContract,
  historyGroup,
  historyKey,
  ledgerInput,
  nowConsumerDeclaration,
  popPublication,
  basisConsumerDeclaration,
  closeConsumerDeclaration,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishBasis,
  registerConsumer,
  seededActorCampaign,
  type ActorSeeded,
} from "../support/actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const capKey = actorCapabilityKey(A, C);
const basisKey = actorCapabilityBasisKey(A, C);
const stage = actorCapabilityStage(A, C);
const advance = (s: ActorSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(consumerAdvanceRequest(id, consumer));

/** A raw group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  s: ActorSeeded,
  over: Partial<CommitGroup> & { key?: string; value?: unknown; expected_version?: number } = {},
  n = 900,
): CommitGroup {
  const { key, value, expected_version, ...group } = over;
  const owner = group.owner ?? "named_actor";
  const facet = group.facet ?? "actor_profile";
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: NAMED_ACTOR_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: key ?? basisKey,
        owner,
        facet,
        value: ("value" in over ? value : capabilityBasis(A, C)) as never,
        unit: null,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

/** Commits the default causal history a basis built by `capabilityBasis(actor, …)` pins, for an actor the seed lacks. */
async function withHistory(s: ActorSeeded, actorId: string, n: number): Promise<void> {
  for (const [i, id] of [`${actorId}-biography`, `${actorId}-occupation`].entries())
    await must(s.campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, n * 10 + i, id)));
}

describe("owner exclusivity: only the Named-Actor owner writes Named-Actor state, and only its own (acceptance 1, 7)", () => {
  it("every other registered owner is refused both key spaces — no one can masquerade as the capability owner", async () => {
    const s = await seededActorCampaign(tempDir());
    const owners: [string, string][] = [
      ["world_state", "world_profile"],
      ["world_state", "world_fallback_physical_entity"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["temporal_kernel", "temporal_coordination"],
      ["population", "population_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["logistics", "logistics_state"],
      [SYNTH_ACTOR_HISTORY_OWNER, "synthetic-actor-history"],
      [SYNTH_CAPABILITY_CONSUMER_OWNER, "synthetic-capability-consumer"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      for (const key of [basisKey, capKey])
        expect(
          await codeOf(s.campaign.store.commit(raw(s, { owner, facet, key }, n++))),
          `${owner} → ${key}`,
        ).toBe("KEY_NOT_ADMITTED");
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no generic fallback", async () => {
    const s = await seededActorCampaign(tempDir());
    for (const [owner, facet] of [
      ["actor", "actor_profile"],
      ["named_actors", "actor_profile"],
      ["named_actor", "capability"],
      ["named_actor", "actor_state"],
      ["generic", "fallback"],
      ["character_capability", "actor_profile"],
      ["kti", "actor_profile"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { owner, facet }, 1))),
        owner + facet,
      ).toBe("OWNER_NOT_REGISTERED");
  });

  it("the Named-Actor owner cannot write a foreign key space, nor an unmodelled actor key (personality, goals, development…)", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "role-registry/binding/role.player_character",
      "population/l1/ledger",
      "production/reserve/r1",
      "economy/demand/d1",
      "logistics/commitment/w/e",
      "temporal/state",
      "kti/technique/t1",
      "synthetic-capability-consumer/result/x",
      "actor/a1/personality",
      "actor/a1/goals",
      "actor/a1/capability",
      "actor/a1/capability/c1/extra",
      "actor/a1/development/c1",
      "actor/a1/capability-basis",
      "actor/a1",
      "actors/a1/capability/c1",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("an actor key the Named-Actor owner already holds cannot be taken over by another owner's group", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    const g = raw(s, {
      owner: "world_state",
      facet: "world_profile",
      key: basisKey,
      expected_version: 1,
    });
    expect(await codeOf(s.campaign.store.commit(g))).toBe("FACT_OWNER_CONFLICT");
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona or player role writes nothing", async () => {
    const s = await seededActorCampaign(tempDir());
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { authority }, 3)))).toBe(
        "AUTHORITY_DENIED",
      );
  });

  it("the Named-Actor adapter exposes one authored publication and no capability writer, setter, development, loss or lifecycle method", async () => {
    const { NamedActorAdapter } = await import("@immortalis/engine");
    const methods = adapterMethods(NamedActorAdapter);
    expect(methods).toEqual(expectedAdapterMethods("NamedActorAdapter"));
    expect(
      methods.filter((m) =>
        /set|update|write|develop|promote|lose|loss|decay|train|advance|grade|rank|tick|sweep|copy|transfer/i.test(
          m,
        ),
      ),
    ).toEqual([]);
  });
});

describe("raw and tampered values are refused by IM-11 (acceptance 2, 7)", () => {
  const valueFor = (over: any) => ({ ...capabilityBasis(A, C), ...over });

  it("a basis with a malformed or foreign value is refused: no number, no non-ladder marker, no unmodelled field", async () => {
    const s = await seededActorCampaign(tempDir());
    for (const bad of [
      valueFor({ marker: "S+" }),
      valueFor({ marker: 3 }),
      valueFor({ marker: "EX" }),
      valueFor({ marker: { ex: "" } }),
      valueFor({ level: 3 }),
      valueFor({ cohort_id: "cohort-1" }),
      valueFor({ equipment: "a sword" }),
      valueFor({ materiality: "NARRATIVE_NEED" }),
      valueFor({
        establishment: {
          method: "BOUNDED_PRIOR_RANDOMIZED",
          causes: capabilityBasis(A, C).establishment.causes,
        },
      }),
      valueFor({ establishment: { method: "CAUSALLY_DETERMINED", causes: [] } }),
      "C",
      null,
      [],
      {},
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { value: bad }))),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("a mismatch between the key's identities and the value's identities is refused for both kinds", async () => {
    const s = await seededActorCampaign(tempDir());
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: actorCapabilityBasisKey("a-other", C) }))),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: actorCapabilityBasisKey(A, "c-other") }))),
    ).toBe("VALUE_INVALID");
    await establishBasis(s, 1);
    const cap = {
      actor_id: A,
      capability_id: C,
      marker: "C",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "actor-profile-capability-close", stage },
    };
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { key: actorCapabilityKey("a-other", C), value: cap })),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { key: actorCapabilityKey(A, "c-other"), value: cap })),
      ),
    ).toBe("VALUE_INVALID");
  });

  it("a basis cannot be committed in the capability key space, nor a capability in the basis key space", async () => {
    const s = await seededActorCampaign(tempDir());
    expect(await codeOf(s.campaign.store.commit(raw(s, { key: capKey })))).toBe("VALUE_INVALID");
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: basisKey, value: { actor_id: A } }))),
    ).toBe("VALUE_INVALID");
  });

  it("a group that writes anything but one create-only basis or one capability close is refused", async () => {
    const s = await seededActorCampaign(tempDir());
    const w = raw(s).writes[0]!;
    const two = raw(s, {
      writes: [
        w,
        {
          ...w,
          key: actorCapabilityBasisKey(A, "c-second"),
          value: capabilityBasis(A, "c-second") as never,
        },
      ],
    });
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
  });
});

describe("lawful establishment: causally determined from committed, pinned, foreign facts (acceptance 3)", () => {
  it("a cause that is not committed is refused: a capability is never established from nothing", async () => {
    const s = await seededActorCampaign(tempDir());
    const ghost = capabilityBasis(A, C, {}, ["never-committed"]);
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({ ...actorPublication(1), capability: ghost }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("a cause pinned at a version that is not current, or not pinned by the group at all, is refused", async () => {
    const s = await seededActorCampaign(tempDir());
    await must(
      s.campaign.store.commit(
        historyGroup(
          FIXTURE_CAMPAIGN,
          80,
          `${A}-biography`,
          "SYNTHETIC FIXTURE: a later revision",
          1,
        ),
      ),
    );
    // the basis pins version 1 but the source is now at version 2
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: capabilityBasis(A, C),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // a raw group that does not pin its causes
    expect(await codeOf(s.campaign.store.commit(raw(s, { reads: [], depends_on: [] })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("a cause owned by another owner than it names, the actor owner itself, or the kernel is refused", async () => {
    const s = await seededActorCampaign(tempDir());
    const b = capabilityBasis(A, C);
    const cause = b.establishment.causes[0]!;
    const withCause = (c: unknown): NamedActorCapabilityBasis => ({
      ...b,
      establishment: { method: "CAUSALLY_DETERMINED", causes: [c as never] },
    });
    // wrong owner named for a real fact
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: withCause({ ...cause, owner: "world_state" }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // kernel coordination state is no causal input
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(2),
          capability: withCause({
            aspect: "WORLD_CONSTRAINT",
            owner: "temporal_kernel",
            fact_key: clock.key,
            version: clock.version,
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // the actor owner's own state is no cause (no capability grounds itself)
    await establishBasis(s, 3, A, "c-first");
    const own = s.actors.basis(A, "c-first")!.fact;
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(4),
          capability: withCause({
            aspect: "ESTABLISHED_ACCOMPLISHMENT",
            owner: "named_actor",
            fact_key: own.key,
            version: own.version,
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("the genuine-uncertainty branch fails closed — an Implementation Escalation, never a roll or a default", async () => {
    const s = await seededActorCampaign(tempDir());
    const before = s.campaign.store.head();
    const uncertain = {
      ...capabilityBasis(A, C),
      establishment: {
        method: "BOUNDED_PRIOR_RANDOMIZED",
        causes: capabilityBasis(A, C).establishment.causes,
      },
    };
    const r = await s.actors.establishCapabilityBasis({
      ...actorPublication(1),
      capability: uncertain,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("ESTABLISHMENT_UNCERTAINTY_UNSUPPORTED");
    expect(!r.ok && r.error.message).toMatch(/Implementation Escalation/);
    expect(s.campaign.store.head()).toEqual(before);
    expect(s.actors.basis(A, C)).toBeUndefined();
    expect(s.actors.capability(A, C)).toBeUndefined();
  });

  it("the basis is sealed and one per actor/capability: a second is a conflict, an overwrite is an unsupported amendment", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(2),
          capability: capabilityBasis(A, C, { marker: "S" }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { expected_version: 1, value: capabilityBasis(A, C, { marker: "S" }) }),
        ),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.actors.basis(A, C)!.value.marker).toBe("C");
  });

  it("no capability exists without its committed basis: a raw capability, even exactly shaped, has nothing to derive from", async () => {
    const s = await seededActorCampaign(tempDir());
    const cap = {
      actor_id: A,
      capability_id: C,
      marker: "S",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "actor-profile-capability-close", stage },
    };
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            key: capKey,
            value: cap,
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-fake",
          }),
        ),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.actors.capability(A, C)).toBeUndefined();
  });

  it("a dependent consequence cannot conjure the capability it needs: its object is refused without a committed basis", async () => {
    const s = await seededActorCampaign(tempDir());
    const wanted = capabilityBasis(A, C, { marker: "S" });
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(2),
          object: capabilityConsumerObject("c1", wanted),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
  });
});

describe("the capability close is exactly its basis, only as its stage, under an open transaction (acceptance 4, 8)", () => {
  it("a stage group whose value is not what the basis determines publishes nothing: a tampered marker, pin, identity or close is refused", async () => {
    const mutations: Record<string, (v: any) => any> = {
      "marker upgraded": (v) => ({ ...v, marker: "S" }),
      "marker removed": (v) => ({ ...v, marker: null }),
      "pin to another version": (v) => ({ ...v, basis: { ...v.basis, version: 2 } }),
      "close stage altered": (v) => ({
        ...v,
        close: { ...v.close, stage: { ...v.close.stage, causal_process_id: "x" } },
      }),
      "another actor": (v) => ({ ...v, actor_id: ACTOR_SWORD }),
      "an extra field": (v) => ({ ...v, level: 4 }),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededActorCampaign(tempDir());
      const basis = await establishBasis(s, 1);
      await registerConsumer(s, "c1", basis, 2);
      const t = tamperStore(s.campaign.store, "named_actor", (g) => ({
        ...g,
        writes: g.writes.map((w) => ({ ...w, value: mutate(w.value) })),
      }));
      const r = await must(
        new TemporalCoordinator(t.store, actorProviders()).advance(
          consumerAdvanceRequest("tx-1", "c1"),
        ),
      );
      expect(t.tampered(), name).toBe(1);
      expect(
        r.rejections.map((x) => x.code),
        name,
      ).toEqual([expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/)]);
      expect(s.actors.capability(A, C), name).toBeUndefined();
      expect(s.campaign.store.getFact(consumerResultKey("c1")), name).toBeUndefined();
      expect(r.transaction.outcome.stop_reason, name).toBe("DEPENDENCY_UNRESOLVED");
      await s.campaign.close();
    }
  });

  it("a stage commits only under the stage identity and a durable open transaction authority: a forged or absent cause publishes nothing", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    const basis = s.actors.basis(A, C)!;
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const value = {
      actor_id: A,
      capability_id: C,
      marker: "C",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "actor-profile-capability-close", stage },
    };
    const base = {
      key: capKey,
      value,
      reads: [{ key: basisKey, version: 1 }],
      depends_on: [basis.fact.provenance.group_id],
    };
    // the right value under an ordinary group identity
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: "g-ordinary",
            intent_id: "i-ordinary",
            cause: "transaction:tx-x",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right stage identity, but a cause no transaction ever opened
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-never-opened",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right stage identity, but not caused by a transaction at all
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "someone-said-so",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right identities, but the group does not read exactly its basis
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            reads: [
              { key: basisKey, version: 1 },
              { key: clock.key, version: clock.version },
            ],
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-never-opened",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.actors.capability(A, C)).toBeUndefined();
  });

  it("a committed capability is sealed: development, mastery loss or any rewrite is an unsupported amendment, even through the owner", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const committed = s.actors.capability(A, C)!;
    for (const marker of ["B", "A", "S", "C", null, { ex: "SYNTHETIC FIXTURE: descriptor" }])
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(s, { key: capKey, expected_version: 1, value: { ...committed.value, marker } }),
          ),
        ),
        JSON.stringify(marker),
      ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.actors.capability(A, C)).toEqual(committed);
  });
});

describe("temporal registration: a capability is visible cross-owner only AS-OF-DECLARED-CLOSE (acceptance 4)", () => {
  it("refuses a consequence that reads the capability AS-OF-NOW, one that reads the uncommitted basis and a Named-Actor-owned object", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    const reg = (over: any, n: number) =>
      codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(n),
          object: capabilityConsumerObject("c1", basis, over),
        }),
      );
    const stageDecl = capabilityConsumerObject("c1", basis).dependencies[0]!;
    expect(await reg({ dependencies: [stageDecl, nowConsumerDeclaration("c1", A, C)] }, 2)).toBe(
      "REFERENCE_INVALID",
    );
    expect(await reg({ dependencies: [stageDecl, basisConsumerDeclaration("c1", A, C)] }, 3)).toBe(
      "REFERENCE_INVALID",
    );
    expect(await reg({ owning_ref: { owner: "named_actor", process_id: "p" } }, 4)).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await reg(
        { dependencies: [{ ...stageDecl, reads: [] }, closeConsumerDeclaration("c1", A, C)] },
        5,
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
    ).toEqual([]);
    // the lawful shape is accepted
    expect(await reg({}, 6)).toBe("OK");
  });

  it("a consequence whose Named-Actor close is not declared is unresolved — fail closed — and publishes nothing", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    const consumerOnly = capabilityConsumerObject("c1", basis).dependencies[1]!;
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", basis, { dependencies: [consumerOnly] }),
      }),
    );
    const before = s.campaign.store.head().revision;
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents[0]!.reason).toBe("PREDECESSOR_ABSENT");
    expect(s.actors.capability(A, C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c1"))).toBeUndefined();
    // only the transaction's own kernel records were written
    const added = s.campaign.store
      .listFacts()
      .filter(
        (f) =>
          f.provenance.group_id !== undefined &&
          s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision > before,
      );
    expect(added.every((f) => f.owner === "temporal_kernel")).toBe(true);
  });
});

describe("PC authorship boundary and aggregate identity (acceptance 5, 6)", () => {
  it("no basis is authored for a Player Character's identity, bound or merely released", async () => {
    const s = await seededActorCampaign(tempDir());
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: capabilityBasis(FIXTURE_PC_ID, C, {}, [`${A}-biography`]),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    // a released-but-unbound PC is equally outside the actor owner
    const s2 = await seededActorCampaign(tempDir(), { canonical: false });
    await must(
      s2.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "pc-unbound" }),
      }),
    );
    expect(
      await codeOf(
        s2.actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: capabilityBasis("pc-unbound", C, {}, [`${A}-biography`]),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(s.actors.basis(FIXTURE_PC_ID, C)).toBeUndefined();
    expect(s2.actors.basis("pc-unbound", C)).toBeUndefined();
  });

  it("an entity that comes under player control between the basis and the close gets no capability: the close fails closed", async () => {
    const s = await seededActorCampaign(tempDir(), { canonical: false });
    await withHistory(s, "actor-late-pc", 70);
    const basis = await establishBasis(s, 1, "actor-late-pc", C, {});
    await registerConsumer(s, "c-late", basis, 2);
    // the entity is released as a Player Character before its close resolves
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "actor-late-pc" }),
      }),
    );
    const r = await must(s.coordinator.advance(consumerAdvanceRequest("tx-late", "c-late")));
    expect(r.rejections.map((x) => x.code)).toEqual(["KEY_NOT_ADMITTED"]);
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.actors.capability("actor-late-pc", C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c-late"))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("missing authority stops only the dependent operation: independent valid work in the same instant still resolves", async () => {
    const s = await seededActorCampaign(tempDir(), { canonical: false });
    await withHistory(s, "actor-late-pc", 70);
    const bad = await establishBasis(s, 1, "actor-late-pc", C, {});
    const good = await establishBasis(s, 2, ACTOR_SWORD, CAP_COMMAND, {});
    await registerConsumer(s, "c-bad", bad, 3);
    await registerConsumer(s, "c-good", good, 4);
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "actor-late-pc" }),
      }),
    );
    const r = await must(s.coordinator.advance(consumerAdvanceRequest("tx-mixed", "c-good")));
    expect(r.rejections.map((x) => x.code)).toEqual(["KEY_NOT_ADMITTED"]);
    expect(s.actors.capability(ACTOR_SWORD, CAP_COMMAND)).toBeDefined();
    expect(s.campaign.store.getFact(consumerResultKey("c-good"))).toBeDefined();
    expect(s.actors.capability("actor-late-pc", C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c-bad"))).toBeUndefined();
  });

  it("a Population ledger's identity is an aggregate: no individual mastery record is authored for it", async () => {
    const s = await seededActorCampaign(tempDir());
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    expect(populationLedgerKey("ledger-main")).toBeDefined();
    expect(
      await codeOf(
        s.actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: capabilityBasis("ledger-main", C, {}, [`${A}-biography`]),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });
});

describe("identity, stage and source churn are not capability identity (acceptance 8)", () => {
  it("the requested horizon never changes the capability close's identity or value", async () => {
    const ids: string[] = [];
    const values: unknown[] = [];
    for (const target of [200, 260, 400]) {
      const s = await seededActorCampaign(tempDir());
      const basis = await establishBasis(s, 1);
      await registerConsumer(s, "c1", basis, 2);
      const r = await must(
        s.coordinator.advance(
          consumerAdvanceRequest("tx-1", "c1", {
            requested: {
              target: at(target),
              condition: {
                kind: "STOP_AFTER_BOUNDARY",
                object_id: "capability-consumer-obj-c1",
                boundary_id: "capability-consumer-boundary-c1",
              },
            },
          }),
        ),
      );
      ids.push(r.transaction.stages[0]!.group_id);
      values.push(s.actors.capability(A, C)!.value);
      await s.campaign.close();
    }
    expect(new Set(ids)).toEqual(new Set([stageGroupId(stage)]));
    expect(new Set(values.map((v) => JSON.stringify(v))).size).toBe(1);
  });

  it("source-version churn of a cited cause before the close changes neither the capability nor its identity: the pin is history", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    await must(
      s.campaign.store.commit(
        historyGroup(FIXTURE_CAMPAIGN, 81, `${A}-biography`, "SYNTHETIC FIXTURE: churned", 1),
      ),
    );
    expect(s.campaign.store.getFact(historyKey(`${A}-biography`))!.version).toBe(2);
    const r = await must(advance(s));
    expect(r.recomputed_in_place).toEqual([]);
    expect(r.transaction.stages[0]!.group_id).toBe(stageGroupId(stage));
    expect(s.actors.capability(A, C)!.value.marker).toBe("C");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load-time verification fails closed on Named-Actor drift (acceptance 10)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    if (opts.complete !== false) await must(advance(s));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyNamedActorIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify before the close and after it", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });

  it("detects a capability that is not what its basis determines, or whose pin or close reference drifted", async () => {
    for (const f of [
      (v: any) => (v.marker = "S"),
      (v: any) => (v.marker = null),
      (v: any) => (v.basis.version = 2),
      (v: any) => (v.basis.fact_key = actorCapabilityBasisKey(A, "other")),
      (v: any) => (v.close.stage.causal_process_id = "elsewhere"),
      (v: any) => (v.close.stage.prospective_result_id = actorCapabilityKey(A, "other")),
    ])
      expect(await drifted(edit(capKey, f))).not.toBe("");
  });

  it("detects a capability with no basis, a basis with a missing or drifted cause, and a cause that was not committed first", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== basisKey))).toMatch(
      /no committed establishment basis/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== historyKey(`${A}-biography`)))).toMatch(
      /cause is committed/,
    );
    expect(
      await drifted(edit(historyKey(`${A}-biography`), (_v, fact) => (fact.owner = "world_state"))),
    ).toMatch(/owned by its named source/);
    expect(
      await drifted(edit(historyKey(`${A}-biography`), (_v, fact) => (fact.version = 0))),
    ).toMatch(/not behind its pin/);
    // a cause that is really the basis' own later commit: ordering is judged by receipts
    expect(
      await drifted(
        edit(
          historyKey(`${A}-biography`),
          (_v, fact) => (fact.provenance.intent_id = s_lateIntent),
        ),
      ),
    ).not.toBe("");
  });

  it("detects a capability that is no stage (provenance drift) and one that no transaction credits and no object awaits", async () => {
    expect(
      await drifted(edit(capKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).not.toBe("");
    expect(
      await drifted(edit(capKey, (_v, fact) => (fact.provenance.intent_id = "raw-intent"))),
    ).not.toBe("");
    expect(
      await drifted((f) =>
        f.filter(
          (x) =>
            !x.key.startsWith("temporal/transaction/") ||
            x.key.startsWith("temporal/transaction-authority/"),
        ),
      ),
    ).toMatch(/credited by no resolution transaction/);
  });

  it("detects a Named-Actor identity that was a Player Character or a Population ledger when its record was committed", async () => {
    const early = (facts: OwnerFact[]) =>
      facts.find((x) => x.key.startsWith("world/"))!.provenance.intent_id;
    const addAt = (key: string) => (facts: OwnerFact[]) => {
      const template = structuredClone(facts.find((x) => x.key.startsWith("world/"))!);
      return [
        ...facts,
        { ...template, key, provenance: { ...template.provenance, intent_id: early(facts) } },
      ];
    };
    expect(await drifted(addAt(pcExistenceContractKey(A)))).toMatch(/Player Character/);
    expect(await drifted(addAt(populationLedgerKey(A)))).toMatch(/Population ledger/);
  });

  it("detects a hand-written object that reads the capability AS-OF-NOW or the basis, or a standalone Named-Actor object", async () => {
    const tamper = (f: (o: any) => void) => (facts: OwnerFact[]) => {
      const obj = facts.find((x) => x.key.startsWith("temporal/object/"))!;
      f(obj.value);
      return facts;
    };
    expect(
      await drifted(tamper((o) => (o.dependencies[1] = nowConsumerDeclaration("c1", A, C)))),
    ).toMatch(/AS-OF-DECLARED-CLOSE/);
    expect(
      await drifted(tamper((o) => (o.dependencies[1] = basisConsumerDeclaration("c1", A, C)))),
    ).toMatch(/not a cross-owner read/);
    expect(
      await drifted(tamper((o) => (o.owning_ref = { owner: "named_actor", process_id: "p" }))),
    ).toMatch(/no standalone/);
  });
});
const s_lateIntent = "actor-intent-1";
