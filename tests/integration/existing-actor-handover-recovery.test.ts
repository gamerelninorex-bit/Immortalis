/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Existing-Actor → PC Role Registry Handover — save → close → load → continue preserves the one handover and its ownership
// result at every durable cut with convergence on the uninterrupted run, a lost reply converges by identity, and a loaded
// campaign whose handover has been tampered with, or was built outside admission (split ownership, fabricated, stale or
// out-of-order), fails closed with a precise integrity code. The slice adds no persistence path: the binding is one ordinary
// OwnerFact, so the existing journal, receipts, replay and package integrity are the ones in force.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-03, IM-07, IM-11, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
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
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  historyGroup,
  write,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "../support/actor.ts";
import {
  actorBasisPin,
  establishActorBasis,
  existingActorContract,
  existingActorSummary,
  handoverActor,
  readyForHandover,
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
const couplingKey = worldActorCouplingKey(A);
const contractKey = pcExistenceContractKey(A);

/** The uninterrupted lifecycle: actor state, coupling, compilation, a later pre-cutover establishment, the handover. */
async function lifecycle(s: ExistingActorSeeded, upTo: "ready" | "later" | "handed") {
  await readyForHandover(s);
  if (upTo === "ready") return;
  await establishActorBasis(s, 2, A, D);
  if (upTo === "later") return;
  await must(handoverActor(s, 1));
}

async function referenceRun() {
  const s = await seededExistingActorCampaign(tempDir());
  await lifecycle(s, "handed");
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

/** What must hold of the ownership result, at any cut, before or after a reload: one writer, never two, never none. */
async function expectOwnership(s: ExistingActorSeeded, handed: boolean) {
  expect(s.campaign.verify()).toEqual([]);
  const head = s.campaign.store.head();
  const write = await s.actors.establishCapabilityBasis({
    group_id: "probe-group",
    intent_id: "probe-intent",
    cause: "probe-cause",
    basis: "fixture-basis",
    secrecy: "fixture-visibility",
    capability: capabilityBasis(A, "capability-probe"),
  });
  if (handed) {
    expect(s.campaign.binding()!.value.transition.type).toBe("EXISTING_ACTOR_HANDOVER");
    expect(!write.ok && write.error.code).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
    // the pre-cutover history is preserved, and no PC capability exists
    expect(s.actors.basis(A, C)).toBeDefined();
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
    ).toEqual([]);
  } else {
    expect(s.campaign.binding()).toBeUndefined();
    expect(write.ok).toBe(true); // the prior non-PC owner is still the writable owner
    expect(s.actors.basis(A, "capability-probe")).toBeDefined();
  }
}

describe("save → close → load → continue preserves the handover at every durable cut", () => {
  const cuts = [
    { name: "compiled and coupled, not yet handed over", upTo: "ready", handed: false },
    {
      name: "a later pre-cutover establishment, not yet handed over",
      upTo: "later",
      handed: false,
    },
    { name: "handed over", upTo: "handed", handed: true },
  ] as const;
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, keeps the same single writer, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededExistingActorCampaign(dir);
      await lifecycle(s, cut.upTo);
      const before = existingActorSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenExistingActor(dir);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(before);
      expect(r.campaign.verify()).toEqual([]);
      if (cut.upTo === "ready") await establishActorBasis(r, 2, A, D);
      if (cut.upTo !== "handed") await must(handoverActor(r, 1));
      else expect((await must(handoverActor(r, 1))).replayed).toBe(true);
      same(r.campaign.store.head(), ref.head);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      await expectOwnership(r, true);
      await r.campaign.close();
    });
  }

  it("the pre-handover ownership result survives a reload: the prior owner still writes and the binding stays NULL", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "ready");
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    await expectOwnership(r, false);
    await r.campaign.close();
  });

  it("the binding survives the reload byte-for-byte with its provenance and receipt, and the consumed facts are unchanged, across a second reload", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "handed");
    const fact = structuredClone(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
    const receipt = s.campaign.store.lookupReceipt(fact.provenance.intent_id)!;
    const consumed = [
      couplingKey,
      contractKey,
      actorCapabilityBasisKey(A, C),
      worldProfileKey(W),
      worldLocusKey(W, L),
    ].map((k) => structuredClone(s.campaign.store.getFact(k)!));
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    expect(r.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(fact);
    expect(r.campaign.store.lookupReceipt(fact.provenance.intent_id)).toEqual(receipt);
    expect(
      [
        couplingKey,
        contractKey,
        actorCapabilityBasisKey(A, C),
        worldProfileKey(W),
        worldLocusKey(W, L),
      ].map((k) => r.campaign.store.getFact(k)),
    ).toEqual(consumed);
    await r.campaign.close();
    const again = await reopenExistingActor(dir);
    await expectOwnership(again, true);
    await again.campaign.close();
  });

  it("after a reload the cutover cannot be re-opened or bypassed: a second handover, an ordinary activation and an actor-side write all fail", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "handed");
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    const head = r.campaign.store.head();
    expect((await handoverActor(r, 2)).ok).toBe(false);
    expect(
      (
        await r.campaign.bindPlayerCharacter({
          group_id: "bind-group-9",
          intent_id: "bind-intent-9",
          cause: "bind-cause-9",
          basis: "fixture-basis",
          secrecy: "fixture-visibility",
          pc_id: A,
          world_id: W,
          locus_id: L,
          insertion: fixtureInsertionFact(),
        })
      ).ok,
    ).toBe(false);
    expect(r.campaign.store.head()).toEqual(head);
    await expectOwnership(r, true);
    await r.campaign.close();
  });
});

describe("a lost reply or a retry converges by identity (RC-16)", () => {
  it("the handover committed with the reply lost is reconciled by identity: replayed, never a second binding", async () => {
    const ref = await referenceRun();
    const s = await seededExistingActorCampaign(tempDir());
    await lifecycle(s, "later");
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key === PLAYER_CHARACTER_BINDING_KEY)
              ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const lost = await handoverActor(s, 1);
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    (s.campaign as any).store = real;
    const committed = structuredClone(real.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
    const head = real.head();
    const retry = await must(handoverActor(s, 1));
    expect(retry.replayed).toBe(true);
    expect(real.head()).toEqual(head);
    expect(real.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(committed);
    same(real.head(), ref.head);
    await expectOwnership(s, true);
    await s.campaign.close();
  });

  it("a handover refused at admission leaves no trace, and the corrected publication under the same identity then commits", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await lifecycle(s, "later");
    const head = s.campaign.store.head();
    const refused = await handoverActor(s, 1, A, { locus_id: "locus-elsewhere" });
    expect(refused.ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(handoverActor(s, 1));
    expect(s.campaign.binding()!.fact.version).toBe(1);
    await expectOwnership(s, true);
  });
});

describe("load fails closed on a corrupted saved handover", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "handed");
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

  it("an edit of the saved binding — transition, pins, migration, references, writer, extras — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "downgraded to a first ACTIVATION": (f) => {
        f.value.transition = {
          type: "ACTIVATION",
          basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
        };
        f.value.intrinsic_authority_migration = [];
      },
      "contract pin moved": (f) => (f.value.transition.basis.pinned_versions.pc = 2),
      "coupling pin moved": (f) => (f.value.transition.basis.pinned_versions.coupling = 2),
      "world pin moved": (f) => (f.value.transition.basis.pinned_versions.world = 0),
      "migration emptied": (f) => (f.value.intrinsic_authority_migration = []),
      "coupling reference dropped": (f) => f.value.intrinsic_authority_migration.shift(),
      "source reference version moved": (f) =>
        (f.value.intrinsic_authority_migration[1].version = 3),
      "source reference moved to another actor": (f) =>
        (f.value.intrinsic_authority_migration[1].fact_key = actorCapabilityBasisKey(
          "actor-other",
          C,
        )),
      "capability copied into the binding": (f) =>
        (f.value.intrinsic_authority_migration[1].marker = "S"),
      "locus reference moved": (f) => (f.value.coupling.locus.entity_id = "locus-other"),
      "world reference moved": (f) => (f.value.coupling.world.entity_id = "world-other"),
      "active PC moved": (f) => (f.value.active_pc.entity_id = "actor-other"),
      "prior binding invented": (f) => (f.value.prior_binding = f.value.active_pc),
      "an insertion statement smuggled in": (f) => (f.value.transition.basis.statement = "x"),
      "writer changed": (f) => (f.value.writer.role = "role.player"),
      "owner changed": (f) => (f.owner = "named_actor"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === PLAYER_CHARACTER_BINDING_KEY));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of a fact the handover consumed — the coupling, the contract or an actor source — is not accepted", async () => {
    const edits: Record<string, (j: any) => void> = {
      "coupling locus moved": (j) =>
        (j.facts.find((f: any) => f.key === couplingKey).value.coupling.locus.entity_id =
          "locus-x"),
      "coupling removed": (j) => (j.facts = j.facts.filter((f: any) => f.key !== couplingKey)),
      "contract classification removed": (j) =>
        delete j.facts.find((f: any) => f.key === contractKey).value.existing_actor_compilation,
      "contract source moved": (j) =>
        (j.facts.find(
          (f: any) => f.key === contractKey,
        ).value.existing_actor_compilation.source_state[0].version = 2),
      "actor source marker changed": (j) =>
        (j.facts.find((f: any) => f.key === actorCapabilityBasisKey(A, C)).value.marker = "S"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("removing the saved binding while keeping the journal fails: a handover cannot be silently un-done to reopen the actor owner", async () => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY);
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a journal edit of the binding's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("EXISTING_ACTOR_HANDOVER");
    writeFileSync(text === "" ? journal : journal, text.replace('"coupling":1', '"coupling":2'));
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
            write(worldLocusKey(W, locus.locus_id), locus as never, {
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
  const couplingValue = (over: Record<string, unknown> = {}): any => ({
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
    ...over,
  });
  const couplingGroup = (n: number, value: unknown = couplingValue()) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(couplingKey, value as never, {
          owner: "world_state",
          facet: "world_fallback_physical_entity",
        }),
      ],
      {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        rule: WORLD_ACTOR_COUPLING_RULE,
        reads: [
          { key: actorCapabilityBasisKey(A, C), version: 1 },
          { key: worldProfileKey(W), version: 1 },
          { key: worldLocusKey(W, L), version: 1 },
        ],
        depends_on: ["group-1", "group-20", "group-21"],
      },
    );
  const contractGroup = (n: number, contract: unknown, compiled = true) =>
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
        ...(compiled
          ? { reads: [{ key: actorCapabilityBasisKey(A, C), version: 1 }], depends_on: ["group-1"] }
          : {}),
      },
    );
  const handoverValue = (edit: (v: any) => void = () => undefined): any => {
    const v: any = {
      binding_slot: "role.player_character",
      active_pc: { fact_key: contractKey, entity_id: A },
      coupling: {
        world: { fact_key: worldProfileKey(W), entity_id: W },
        locus: { fact_key: worldLocusKey(W, L), entity_id: L },
      },
      transition: {
        type: "EXISTING_ACTOR_HANDOVER",
        basis: { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } },
      },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [
        { owner: "world_state", fact_key: couplingKey, version: 1 },
        actorBasisPin(A, C),
      ],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    };
    edit(v);
    return v;
  };
  const bindingGroup = (
    n: number,
    value: unknown = handoverValue(),
    over: Partial<CommitGroup> = {},
  ) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(PLAYER_CHARACTER_BINDING_KEY, value as never, {
          owner: "role_registry",
          facet: "player_character_binding",
        }),
      ],
      {
        owner: "role_registry",
        facet: "player_character_binding",
        rule: factKind("player_character_binding").rule,
        reads: [
          { key: contractKey, version: 1 },
          { key: worldProfileKey(W), version: 1 },
          { key: worldLocusKey(W, L), version: 1 },
          { key: couplingKey, version: 1 },
          { key: actorCapabilityBasisKey(A, C), version: 1 },
        ],
        depends_on: ["group-32", "group-20", "group-21", "group-30", "group-1"],
        ...over,
      },
    );
  /** What a binding written before any coupling exists can honestly pin: everything but the coupling. */
  const withoutCouplingPins: Partial<CommitGroup> = {
    reads: [
      { key: contractKey, version: 1 },
      { key: worldProfileKey(W), version: 1 },
      { key: worldLocusKey(W, L), version: 1 },
      { key: actorCapabilityBasisKey(A, C), version: 1 },
    ],
    depends_on: ["group-32", "group-20", "group-21", "group-1"],
  };
  /** actor state (group-1), world (group-20), locus (group-21): the lawful prerequisites. */
  const prerequisites = async (s: CampaignStore, n: () => number) => {
    await history(s, n);
    await must(s.commit(actorBasisGroup(1)));
    await worldAndLocus(s, 20);
  };
  /** the lawful history up to (not including) the binding: coupling (30), compilation (32). */
  const throughCompilation = async (s: CampaignStore, n: () => number) => {
    await prerequisites(s, n);
    await must(s.commit(couplingGroup(30)));
    await must(s.commit(contractGroup(32, existingActorContract(A))));
  };

  it("the lawful order loads: state, world, locus, coupling, compilation, a pre-cutover actor write, the handover", async () => {
    const dir = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(s.commit(actorBasisGroup(33, D)));
      await must(s.commit(bindingGroup(40)));
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("split-brain ownership is refused: an actor-side write committed AFTER the binding fails the open", async () => {
    const dir = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(s.commit(bindingGroup(40)));
      await must(s.commit(actorBasisGroup(41, D)));
    });
    expect(await openOutcome(dir)).toMatch(/NAMED_ACTOR_STATE/);
  });

  it("a handover with no committed coupling, or whose coupling was committed after it, is refused", async () => {
    const without = await rogue(async (s, n) => {
      await prerequisites(s, n);
      await must(s.commit(contractGroup(32, existingActorContract(A))));
      await must(s.commit(bindingGroup(40, handoverValue(), withoutCouplingPins)));
    });
    expect(await openOutcome(without)).toMatch(/PREREQUISITE_MISSING|REFERENCE_INVALID/);
    const after = await rogue(async (s, n) => {
      await prerequisites(s, n);
      await must(s.commit(contractGroup(32, existingActorContract(A))));
      await must(s.commit(bindingGroup(40, handoverValue(), withoutCouplingPins)));
      await must(s.commit(couplingGroup(41)));
    });
    expect(await openOutcome(after)).toMatch(/DEPENDENCY_ORDER|ACTOR_COUPLING_STATE/);
  });

  it("a handover over a fresh (non-compilation) contract, with or without a coupling, is refused", async () => {
    const dir = await rogue(async (s, n) => {
      await prerequisites(s, n);
      await must(s.commit(contractGroup(32, fixtureContract({ pc_id: A }), false)));
      await must(s.commit(bindingGroup(40, handoverValue(), withoutCouplingPins)));
    });
    expect(await openOutcome(dir)).not.toBe("OK");
    const coupled = await rogue(async (s, n) => {
      await prerequisites(s, n);
      await must(s.commit(couplingGroup(30)));
      await must(s.commit(contractGroup(32, fixtureContract({ pc_id: A }), false)));
      await must(s.commit(bindingGroup(40)));
    });
    expect(await openOutcome(coupled)).toMatch(/ACTOR_COUPLING_STATE|REFERENCE_INVALID/);
  });

  it("a handover whose world and locus are not the committed coupling's — a rival placement — is refused", async () => {
    const dir = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(
        s.commit(
          group(
            FIXTURE_CAMPAIGN,
            34,
            [
              write(
                worldLocusKey(W, "locus-fixture-2"),
                fixtureLocus({ locus_id: "locus-fixture-2" }) as never,
                { owner: "world_state", facet: "world_locus" },
              ),
            ],
            {
              owner: "world_state",
              facet: "world_locus",
              rule: factKind("world_locus").rule,
              reads: [{ key: worldProfileKey(W), version: 1 }],
              depends_on: ["group-20"],
            },
          ),
        ),
      );
      await must(
        s.commit(
          bindingGroup(
            40,
            handoverValue((v) => {
              v.coupling.locus = {
                fact_key: worldLocusKey(W, "locus-fixture-2"),
                entity_id: "locus-fixture-2",
              };
              v.transition.basis.pinned_versions.locus = 1;
            }),
            {
              reads: [
                { key: contractKey, version: 1 },
                { key: worldProfileKey(W), version: 1 },
                { key: worldLocusKey(W, "locus-fixture-2"), version: 1 },
                { key: couplingKey, version: 1 },
                { key: actorCapabilityBasisKey(A, C), version: 1 },
              ],
              depends_on: ["group-32", "group-20", "group-34", "group-30", "group-1"],
            },
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).toMatch(/REFERENCE_INVALID|ACTOR_COUPLING_STATE/);
  });

  it("a stale basis, tampered migration, or handover that did not read and depend on what it consumed is refused", async () => {
    const variants: Record<string, [(v: any) => void, Partial<CommitGroup>?]> = {
      "stale coupling pin": [(v) => (v.transition.basis.pinned_versions.coupling = 2)],
      "stale contract pin": [(v) => (v.transition.basis.pinned_versions.pc = 2)],
      "migration missing the source": [(v) => v.intrinsic_authority_migration.pop()],
      "migration version moved": [(v) => (v.intrinsic_authority_migration[0].version = 2)],
      "did not read the coupling": [
        () => undefined,
        {
          reads: [
            { key: contractKey, version: 1 },
            { key: worldProfileKey(W), version: 1 },
            { key: worldLocusKey(W, L), version: 1 },
            { key: actorCapabilityBasisKey(A, C), version: 1 },
          ],
        },
      ],
      "did not depend on the coupling's group": [
        () => undefined,
        { depends_on: ["group-32", "group-20", "group-21", "group-1"] },
      ],
    };
    for (const [name, [edit, over]] of Object.entries(variants)) {
      const dir = await rogue(async (s, n) => {
        await throughCompilation(s, n);
        await must(s.commit(bindingGroup(40, handoverValue(edit), over)));
      });
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("the ordinary first ACTIVATION of the compiled, coupled actor, built outside admission, is refused", async () => {
    const dir = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(
        s.commit(
          bindingGroup(
            40,
            handoverValue((v) => {
              v.transition = {
                type: "ACTIVATION",
                basis: {
                  ...fixtureInsertionFact(),
                  pinned_versions: { pc: 1, world: 1, locus: 1 },
                },
              };
              v.intrinsic_authority_migration = [];
            }),
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).toMatch(/ACTOR_COUPLING_STATE|REFERENCE_INVALID/);
  });

  it("a rival fresh Existence Contract for the handed-over actor, committed after the binding, is refused", async () => {
    const dir = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(s.commit(bindingGroup(40)));
      // the contract slot is sealed, so the rival can only be a second write to it: refused by the store itself
      const rival = await s.commit(contractGroup(41, fixtureContract({ pc_id: A }), false));
      expect(rival.ok).toBe(false);
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("a handover under the wrong rule or an unregistered key is RULE_DRIFT / UNREGISTERED_KEY", async () => {
    const wrongRule = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      await must(
        s.commit(bindingGroup(40, handoverValue(), { rule: factKind("world_locus").rule })),
      );
    });
    expect(await openOutcome(wrongRule)).toMatch(/RULE_DRIFT/);
    const wrongKey = await rogue(async (s, n) => {
      await throughCompilation(s, n);
      const g = bindingGroup(40);
      await must(
        s.commit({
          ...g,
          writes: g.writes.map((w) => ({ ...w, key: `${PLAYER_CHARACTER_BINDING_KEY}-2` })),
        }),
      );
    });
    expect(await openOutcome(wrongKey)).toMatch(/UNREGISTERED_KEY/);
  });
});
