import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Existing-Actor World-State Coupling Anchor Foundation — save → close → load → continue preserves the one coupling and its
// ownership result at every durable cut, a lost reply converges by identity, and a loaded campaign whose coupling has been
// tampered with, or was built outside admission (malformed, rival or provenance-invalid), fails closed with a precise integrity
// code. The slice adds no persistence path: the coupling is one ordinary OwnerFact, so the existing journal, receipts, replay
// and package integrity are the ones in force (no real-OS-process cut is added).
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-03, IM-07, IM-11, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  NAMED_ACTOR_RULE,
  WORLD_ACTOR_COUPLING_RULE,
  createFileCampaign,
  factKind,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  historyGroup,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "../support/actor.ts";
import {
  actorBasisPin,
  bindingInput,
  compileExistingActor,
  coupleActor,
  establishActorBasis,
  existingActorContract,
  existingActorSummary,
  reopenExistingActor,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const key = worldActorCouplingKey(A);
const contractKey = pcExistenceContractKey(A);

/** The uninterrupted lifecycle: actor state, coupling, a later capability establishment, its close. */
async function lifecycle(s: ExistingActorSeeded, upTo: "state" | "coupled" | "later" | "closed") {
  await establishActorBasis(s, 1, A, C);
  if (upTo === "state") return;
  await must(coupleActor(s, 1));
  if (upTo === "coupled") return;
  const later = await establishActorBasis(s, 2, A, D);
  if (upTo === "later") return;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(2),
      object: capabilityConsumerObject("c1", later),
    }),
  );
  await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
}

async function referenceRun() {
  const s = await seededExistingActorCampaign(tempDir());
  await lifecycle(s, "closed");
  const head = s.campaign.store.head();
  const summary = existingActorSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};

/** What must hold of the ownership result, at any cut, before or after a reload. */
async function expectOwnership(s: ExistingActorSeeded, coupled: boolean) {
  expect(s.campaign.verify()).toEqual([]);
  // the coupling is a prerequisite only: it never binds, compiles or creates a PC capability
  expect(s.campaign.binding()).toBeUndefined();
  expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  expect(
    s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
  ).toEqual([]);
  if (!coupled) {
    expect(s.campaign.existingActorCoupling(A)).toBeUndefined();
    return;
  }
  const fact = s.campaign.store.getFact(key)!;
  expect(fact).toMatchObject({ owner: "world_state", version: 1 });
  expect(s.campaign.existingActorCoupling(A)!.value.coupling.locus.entity_id).toBe(L);
  // a second current locus cannot be stated after any cut
  const head = s.campaign.store.head();
  expect((await coupleActor(s, 90)).ok).toBe(false);
  expect(s.campaign.store.head()).toEqual(head);
}

describe("save → close → load → continue preserves the coupling at every durable cut", () => {
  const cuts = [
    { name: "actor state committed, not yet coupled", upTo: "state", coupled: false },
    { name: "coupled, no later establishment", upTo: "coupled", coupled: true },
    { name: "coupled, then a later capability basis established", upTo: "later", coupled: true },
    { name: "coupled, later capability closed and consumed", upTo: "closed", coupled: true },
  ] as const;
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, keeps the same ownership result, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededExistingActorCampaign(dir);
      await lifecycle(s, cut.upTo);
      const before = existingActorSummary(s.campaign, s.coordinator);
      await expectOwnership(s, cut.coupled);
      await s.campaign.close();
      const r = await reopenExistingActor(dir);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(before);
      await expectOwnership(r, cut.coupled);
      if (cut.upTo === "state") await must(coupleActor(r, 1));
      if (cut.upTo === "state" || cut.upTo === "coupled") await establishActorBasis(r, 2, A, D);
      if (cut.upTo !== "closed") {
        await must(
          r.coordinator.registerObject({
            ...temporalPublication(2),
            object: capabilityConsumerObject("c1", r.actors.basis(A, D)!.value),
          }),
        );
        await must(r.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
      } else {
        expect(
          (await must(r.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")))).replayed,
        ).toBe(true);
      }
      same(r.campaign.store.head(), ref.head);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      await expectOwnership(r, true);
      await r.campaign.close();
    });
  }

  it("the coupling survives the reload byte-for-byte, with its provenance, receipt and pinned sources, and survives a second reload", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "coupled");
    const fact = structuredClone(s.campaign.store.getFact(key)!);
    const receipt = s.campaign.store.lookupReceipt(fact.provenance.intent_id)!;
    const sources = [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(W, L)].map(
      (k) => structuredClone(s.campaign.store.getFact(k)!),
    );
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    expect(r.campaign.store.getFact(key)).toEqual(fact);
    expect(r.campaign.store.lookupReceipt(fact.provenance.intent_id)).toEqual(receipt);
    expect(
      [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(W, L)].map((k) =>
        r.campaign.store.getFact(k),
      ),
    ).toEqual(sources);
    await r.campaign.close();
    const again = await reopenExistingActor(dir);
    expect(again.campaign.store.getFact(key)).toEqual(fact);
    await expectOwnership(again, true);
    await again.campaign.close();
  });

  it("after a reload the prior owner still writes, and the compilation and the coupling coexist; the binding stays NULL", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "coupled");
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    await establishActorBasis(r, 2, A, D);
    await must(compileExistingActor(r, 1));
    const bound = await r.campaign.bindPlayerCharacter(bindingInput(A, 4));
    expect(!bound.ok && bound.error.code).toBe("REFERENCE_INVALID");
    await r.campaign.close();
    const again = await reopenExistingActor(dir);
    expect(again.campaign.verify()).toEqual([]);
    expect(again.campaign.binding()).toBeUndefined();
    expect(again.campaign.existingActorCoupling(A)!.fact.version).toBe(1);
    await again.campaign.close();
  });
});

describe("a lost reply or a retry converges by identity (RC-16)", () => {
  it("the coupling committed with the reply lost is reconciled by identity: replayed, never a second coupling", async () => {
    const ref = await referenceRun();
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key === key)
              ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const lost = await coupleActor(s, 1);
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    (s.campaign as any).store = real;
    const committed = structuredClone(real.getFact(key)!);
    expect(committed.version).toBe(1);
    const head = real.head();
    const retry = await must(coupleActor(s, 1));
    expect(retry.replayed).toBe(true);
    expect(real.head()).toEqual(head);
    expect(real.getFact(key)).toEqual(committed);
    // finishing converges on the uninterrupted run
    await establishActorBasis(s, 2, A, D);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", s.actors.basis(A, D)!.value),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    same(real.head(), ref.head);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("a coupling refused at admission leaves no trace, and the corrected publication under the same identity then commits", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const head = s.campaign.store.head();
    const refused = await coupleActor(s, 1, A, { actor_state: [actorBasisPin(A, C, 2)] });
    expect(refused.ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(coupleActor(s, 1));
    expect(s.campaign.store.getFact(key)!.version).toBe(1);
  });
});

describe("load fails closed on a corrupted saved coupling", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "later");
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  it("an edit of the saved coupling — identity, pins, references, custodian, extra semantics, owner, version — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "actor identity changed": (f) => (f.value.actor_id = "actor-other"),
      "source emptied": (f) => (f.value.actor_state = []),
      "source version moved": (f) => (f.value.actor_state[0].version = 3),
      "source owner moved": (f) => (f.value.actor_state[0].owner = "world_state"),
      "source of another actor": (f) =>
        (f.value.actor_state[0].fact_key = actorCapabilityBasisKey("actor-other", C)),
      "world reference moved": (f) => (f.value.coupling.world.entity_id = "world-other"),
      "locus reference moved": (f) => (f.value.coupling.locus.entity_id = "locus-other"),
      "world pin moved": (f) => (f.value.pinned_versions.world = 2),
      "locus pin moved": (f) => (f.value.pinned_versions.locus = 0),
      "custodian owner moved": (f) => (f.value.custodian.owner = "production"),
      "custodian basis moved": (f) => (f.value.custodian.basis = "x"),
      "a PC binding smuggled in": (f) =>
        (f.value.active_pc = { fact_key: contractKey, entity_id: A }),
      "an insertion basis smuggled in": (f) => (f.value.transition = { type: "ACTIVATION" }),
      "a binding mode smuggled in": (f) => (f.value.binding_mode = "DEFERRED"),
      "owner changed": (f) => (f.owner = "named_actor"),
      "facet changed": (f) => (f.facet = "world_locus"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === key));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of a saved SOURCE (the actor's state) or of the coupling's key is not accepted", async () => {
    const edited = await saved();
    const q = join(edited, stateFile(edited));
    const k = legacyStateFixture(q);
    k.facts.find((f: any) => f.key === actorCapabilityBasisKey(A, C)).value.marker = "S";
    writeFileSync(q, JSON.stringify(k));
    expect(await openOutcome(edited)).not.toBe("OK");
    const moved = await saved();
    const m = join(moved, stateFile(moved));
    const j = legacyStateFixture(m);
    j.facts.find((f: any) => f.key === key).key = `world-state/actor/actor-other/coupling`;
    writeFileSync(m, JSON.stringify(j));
    expect(await openOutcome(moved)).not.toBe("OK");
  });

  it("a journal edit of the coupling's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain(`"world-state/actor/${A}/coupling"`);
    writeFileSync(
      journal,
      text
        .replace(`"locus_id":"${L}"`, '"locus_id":"locus-moved"')
        .replace(`"entity_id":"${L}"`, '"entity_id":"locus-moved"'),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(
    build: (s: CampaignStore, n: () => number) => Promise<void>,
  ): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
      }),
    );
    let i = 0;
    await build(s, () => ++i);
    await s.close();
    return dir;
  }
  const history = async (s: CampaignStore, n: () => number) => {
    for (const id of defaultHistoryIds(A))
      await must(s.commit(historyGroup(FIXTURE_CAMPAIGN, 500 + n(), id)));
  };
  const actorBasisGroup = (n: number, cap = C) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(actorCapabilityBasisKey(A, cap), capabilityBasis(A, cap) as never, {
          owner: "named_actor",
          facet: "actor_profile",
        }),
      ],
      { owner: "named_actor", facet: "actor_profile", rule: NAMED_ACTOR_RULE },
    );
  const worldAndLocus = async (s: CampaignStore, base: number, locus = fixtureLocus()) => {
    await must(
      s.commit(
        group(
          FIXTURE_CAMPAIGN,
          base,
          [
            write(worldProfileKey(W), fixtureWorld() as never, {
              owner: "world_state",
              facet: "world_profile",
            }),
          ],
          { owner: "world_state", facet: "world_profile", rule: factKind("world_profile").rule },
        ),
      ),
    );
    await must(
      s.commit(
        group(
          FIXTURE_CAMPAIGN,
          base + 1,
          [
            write(worldLocusKey(W, L), locus as never, {
              owner: "world_state",
              facet: "world_locus",
            }),
          ],
          {
            owner: "world_state",
            facet: "world_locus",
            rule: factKind("world_locus").rule,
            reads: [{ key: worldProfileKey(W), version: 1 }],
            depends_on: [`group-${base}`],
          },
        ),
      ),
    );
  };
  const goodValue = (over: Record<string, unknown> = {}): any => ({ ...goodBase(), ...over });
  function goodBase() {
    return {
      actor_id: A,
      actor_state: [actorBasisPin(A, C)],
      coupling: {
        world: { fact_key: worldProfileKey(W), entity_id: W },
        locus: { fact_key: worldLocusKey(W, L), entity_id: L },
      },
      pinned_versions: { world: 1, locus: 1 },
      custodian: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
      },
    };
  }
  const fullPin = {
    reads: [
      { key: actorCapabilityBasisKey(A, C), version: 1 },
      { key: worldProfileKey(W), version: 1 },
      { key: worldLocusKey(W, L), version: 1 },
    ],
    depends_on: ["group-1", "group-20", "group-21"],
  };
  const couplingGroup = (n: number, value: unknown, over: Partial<CommitGroup> = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(key, value as never, {
          owner: "world_state",
          facet: "world_fallback_physical_entity",
        }),
      ],
      {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        rule: WORLD_ACTOR_COUPLING_RULE,
        ...fullPin,
        ...over,
      },
    );
  const contractGroup = (n: number, contract: unknown, over: Partial<CommitGroup> = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(contractKey, contract as never, {
          owner: "pc_existence",
          facet: "existence_contract",
        }),
      ],
      {
        owner: "pc_existence",
        facet: "existence_contract",
        rule: factKind("pc_existence_contract").rule,
        ...over,
      },
    );
  /** actor state (group-1), world (group-20), locus (group-21): the lawful prerequisites. */
  const prerequisites = async (s: CampaignStore, n: () => number) => {
    await history(s, n);
    await must(s.commit(actorBasisGroup(1)));
    await worldAndLocus(s, 20);
  };

  it("the lawful order loads: actor state, world, locus, the coupling, then the actor owner's own later write and the compilation", async () => {
    const dir = await rogue(async (s, n) => {
      await prerequisites(s, n);
      await must(s.commit(couplingGroup(30, goodValue())));
      await must(s.commit(actorBasisGroup(31, D)));
      await must(
        s.commit(
          contractGroup(32, existingActorContract(A), {
            reads: [{ key: actorCapabilityBasisKey(A, C), version: 1 }],
            depends_on: ["group-1"],
          }),
        ),
      );
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("a coupling with no committed actor state, or resting on another actor's state, is REFERENCE/ACTOR_COUPLING_STATE", async () => {
    // no actor state at all: the pin is to nothing
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await worldAndLocus(s, 20);
          await must(
            s.commit(
              couplingGroup(30, goodValue(), {
                reads: fullPin.reads.slice(1),
                depends_on: fullPin.depends_on.slice(1),
              }),
            ),
          );
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
    // another actor's state as the source
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(
            s.commit(
              couplingGroup(30, goodValue({ actor_state: [actorBasisPin("actor-other", C)] }), {}),
            ),
          );
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
  });

  it("a coupling that did not read and depend on what it pins, or that precedes its prerequisites, is ACTOR_COUPLING_STATE", async () => {
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(s.commit(couplingGroup(30, goodValue(), { reads: [], depends_on: [] })));
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
    // committed BEFORE the world and the locus it pins (it can read only what already exists)
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await history(s, n);
          await must(s.commit(actorBasisGroup(1)));
          await must(
            s.commit(
              couplingGroup(30, goodValue(), {
                reads: fullPin.reads.slice(0, 1),
                depends_on: fullPin.depends_on.slice(0, 1),
              }),
            ),
          );
          await worldAndLocus(s, 20);
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
    // a pin that is not the committed version
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(
            s.commit(couplingGroup(30, goodValue({ pinned_versions: { world: 1, locus: 5 } }))),
          );
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
  });

  it("a locus that does not belong to the coupled world is ACTOR_COUPLING_STATE", async () => {
    const dir = await rogue(async (s, n) => {
      await history(s, n);
      await must(s.commit(actorBasisGroup(1)));
      await worldAndLocus(
        s,
        20,
        fixtureLocus({
          world: { fact_key: worldProfileKey("world-other"), entity_id: "world-other" },
        }),
      );
      await must(s.commit(couplingGroup(30, goodValue())));
    });
    expect(await openOutcome(dir)).toMatch(/ACTOR_COUPLING_STATE|VALUE_INVALID|REFERENCE_INVALID/);
  });

  it("a Player Character rival — a fresh contract before OR after the coupling, or a binding naming the actor — is ACTOR_COUPLING_STATE", async () => {
    // fresh contract first: the actor was already a PC when it was coupled
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(s.commit(contractGroup(25, fixtureContract({ pc_id: A }))));
          await must(s.commit(couplingGroup(30, goodValue())));
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
    // fresh contract AFTER the coupling: a rival owner and a second current locus
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(s.commit(couplingGroup(30, goodValue())));
          await must(s.commit(contractGroup(31, fixtureContract({ pc_id: A }))));
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE/);
    // a binding naming the coupled actor (built outside admission)
    const binding = group(
      FIXTURE_CAMPAIGN,
      32,
      [
        write(
          PLAYER_CHARACTER_BINDING_KEY,
          {
            binding_slot: "role.player_character",
            active_pc: { fact_key: contractKey, entity_id: A },
            coupling: {
              world: { fact_key: worldProfileKey(W), entity_id: W },
              locus: { fact_key: worldLocusKey(W, L), entity_id: L },
            },
            transition: {
              type: "ACTIVATION",
              basis: {
                ...fixtureInsertionFact(),
                pinned_versions: { pc: 1, world: 1, locus: 1 },
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
        reads: [
          { key: contractKey, version: 1 },
          { key: worldProfileKey(W), version: 1 },
          { key: worldLocusKey(W, L), version: 1 },
        ],
        depends_on: ["group-31", "group-20", "group-21"],
      },
    );
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          await must(s.commit(couplingGroup(30, goodValue())));
          await must(
            s.commit(
              contractGroup(31, existingActorContract(A), {
                reads: [{ key: actorCapabilityBasisKey(A, C), version: 1 }],
                depends_on: ["group-1"],
              }),
            ),
          );
          await must(s.commit(binding));
        }),
      ),
    ).toMatch(/ACTOR_COUPLING_STATE|REFERENCE_INVALID/);
  });

  it("a coupling under the wrong rule, the wrong authority or an unregistered key is RULE_DRIFT / AUTHORITY_DENIED / UNREGISTERED_KEY", async () => {
    const outcome = async (over: Partial<CommitGroup>, at?: string) =>
      openOutcome(
        await rogue(async (s, n) => {
          await prerequisites(s, n);
          const g = couplingGroup(30, goodValue(), over);
          await must(s.commit(at ? { ...g, writes: g.writes.map((w) => ({ ...w, key: at })) } : g));
        }),
      );
    expect(await outcome({ rule: factKind("world_fallback_entity").rule })).toMatch(/RULE_DRIFT/);
    // a non-archivist authority is refused at the commit core, so no such history can even be built
    const store = await must(
      createFileCampaign(tempDir(), {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
      }),
    );
    const refused = await store.commit(
      couplingGroup(30, goodValue(), {
        authority: { role: "role.player", permission: "permission.player_choice.commit" } as never,
      }),
    );
    expect(!refused.ok && refused.error.code).toBe("AUTHORITY_DENIED");
    await store.close();
    expect(CANON_WRITE_AUTHORITY.role).toBe("role.archivist");
    expect(await outcome({}, `world-state/actor/${A}/coupling-2`)).toMatch(/UNREGISTERED_KEY/);
  });
});
