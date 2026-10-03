/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Existing-Actor I-002 Pre-Binding Compilation — save → close → load → continue preserves the same ownership result at every
// durable cut (the prior non-PC owner stays writable; ordinary activation and the ACCEPTED_GENERATION_HISTORY receipt still
// refuse the compilation), a lost reply converges by identity, and a loaded campaign whose compilation (or what depends on
// it) has been tampered with, or was built outside admission, fails closed with a precise integrity code. The slice adds no
// persistence path: the compilation is one ordinary OwnerFact, so the existing journal, receipts, replay and package
// integrity are the ones in force (no real-OS-process cut is added).
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-03, IM-07, IM-11, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  PLAYER_CHARACTER_BINDING_KEY,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  NAMED_ACTOR_RULE,
  PC_CAPABILITY_RULE,
  actorBoundaryViolation,
  createFileCampaign,
  factKind,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SAILING,
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
  pcCapabilityBasis,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "../support/actor.ts";
import {
  actorBasisPin,
  bindingInput,
  compilationPublication,
  compileExistingActor,
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
const contractKey = pcExistenceContractKey(A);

const view = (s: ExistingActorSeeded) => ({
  get: (k: string) => s.campaign.store.getFact(k),
  has: (k: string) => s.campaign.store.getFact(k) !== undefined,
});

/** The uninterrupted lifecycle: actor state, compilation, a later capability establishment, its close. */
async function lifecycle(s: ExistingActorSeeded, upTo: "state" | "compiled" | "later" | "closed") {
  await establishActorBasis(s, 1, A, C);
  if (upTo === "state") return;
  await must(compileExistingActor(s, 1));
  if (upTo === "compiled") return;
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
async function expectOwnership(s: ExistingActorSeeded, compiled: boolean) {
  expect(s.campaign.verify()).toEqual([]);
  expect(s.campaign.binding()).toBeUndefined();
  expect(
    s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
  ).toEqual([]);
  if (!compiled) return;
  const head = s.campaign.store.head();
  // the prior non-PC owner is still the writable owner
  expect(actorBoundaryViolation(view(s), A)).toBeNull();
  // ordinary Role Registry activation refuses the compilation and writes nothing
  const bound = await s.campaign.bindPlayerCharacter(bindingInput(A, 4));
  expect(!bound.ok && bound.error.code).toBe("REFERENCE_INVALID");
  // the ACCEPTED_GENERATION_HISTORY receipt refuses it and writes nothing
  const received = await s.pcs.receiveCapabilityBasis({
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
  expect(!received.ok && received.error.code).toBe("REFERENCE_INVALID");
  expect(s.campaign.store.head()).toEqual(head);
}

describe("save → close → load → continue preserves the ownership result at every durable cut", () => {
  const cuts = [
    { name: "actor state committed, not yet compiled", upTo: "state", compiled: false },
    { name: "compiled into I-002 form, no later establishment", upTo: "compiled", compiled: true },
    { name: "compiled, then a later capability basis established", upTo: "later", compiled: true },
    { name: "compiled, later capability closed and consumed", upTo: "closed", compiled: true },
  ] as const;
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, keeps the same ownership result, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededExistingActorCampaign(dir);
      await lifecycle(s, cut.upTo);
      const before = existingActorSummary(s.campaign, s.coordinator);
      await expectOwnership(s, cut.compiled);
      await s.campaign.close();
      const r = await reopenExistingActor(dir);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(before);
      await expectOwnership(r, cut.compiled);
      // continue: whatever the cut, finishing the lifecycle reaches the uninterrupted result
      if (cut.upTo === "state") await must(compileExistingActor(r, 1));
      if (cut.upTo === "state" || cut.upTo === "compiled") await establishActorBasis(r, 2, A, D);
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

  it("the prior owner writes after a reload exactly as it did before the compilation, and that survives a second reload", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "compiled");
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    const later = await establishActorBasis(r, 2, A, D);
    await must(
      r.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", later),
      }),
    );
    await must(r.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    expect(r.actors.capability(A, D)!.fact.owner).toBe("named_actor");
    await r.campaign.close();
    const again = await reopenExistingActor(dir);
    expect(again.actors.capability(A, D)!.fact.owner).toBe("named_actor");
    await expectOwnership(again, true);
    await again.campaign.close();
  });

  it("the compilation survives the reload byte-for-byte, with its provenance, receipt and pinned source", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "compiled");
    const fact = structuredClone(s.campaign.store.getFact(contractKey)!);
    const receipt = s.campaign.store.lookupReceipt(fact.provenance.intent_id)!;
    const source = structuredClone(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))!);
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    expect(r.campaign.store.getFact(contractKey)).toEqual(fact);
    expect(r.campaign.store.lookupReceipt(fact.provenance.intent_id)).toEqual(receipt);
    expect(r.campaign.store.getFact(actorCapabilityBasisKey(A, C))).toEqual(source);
    expect((fact.value as any).existing_actor_compilation.source_state).toEqual([
      actorBasisPin(A, C),
    ]);
    await r.campaign.close();
  });
});

describe("a lost reply or a retry converges by identity (RC-16)", () => {
  it("the compilation committed with the reply lost is reconciled by identity: replayed, never a second contract", async () => {
    const ref = await referenceRun();
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const real = s.campaign.store;
    // a proxy keeps every other store method bound to the real store; only the reply of the compilation group is lost
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key === contractKey)
              ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const lost = await compileExistingActor(s, 1);
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    (s.campaign as any).store = real;
    const committed = structuredClone(real.getFact(contractKey)!);
    expect(committed.version).toBe(1);
    const head = real.head();
    const retry = await must(compileExistingActor(s, 1));
    expect(retry.replayed).toBe(true);
    expect(real.head()).toEqual(head);
    expect(real.getFact(contractKey)).toEqual(committed);
    // a CHANGED intent under the same identity is a conflict, never a silent reuse of the old receipt
    const changed = await s.campaign.releasePlayerCharacter({
      ...compilationPublication(1),
      contract: existingActorContract(A, [actorBasisPin(A, C)], {
        identity_agency: { statement: "SYNTHETIC FIXTURE: other.", provenance: "SAFELY-INHERITED" },
      }),
    });
    expect(changed.ok).toBe(false);
    expect(real.getFact(contractKey)).toEqual(committed);
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

  it("a compilation refused at admission leaves no trace, and the corrected publication under the same identity then commits", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const head = s.campaign.store.head();
    const refused = await compileExistingActor(
      s,
      1,
      existingActorContract(A, [actorBasisPin(A, C, 2)]),
    );
    expect(refused.ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(compileExistingActor(s, 1));
    expect(s.campaign.store.getFact(contractKey)!.version).toBe(1);
  });
});

describe("load fails closed on a corrupted saved compilation", () => {
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

  it("an edit of the saved compilation — classification, sources, pin, claims — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "classification removed": (f) => delete f.value.existing_actor_compilation,
      "classification altered": (f) =>
        (f.value.existing_actor_compilation.classification = "DEFERRED"),
      "third classification": (f) =>
        (f.value.existing_actor_compilation.classification = "ACTIVE-LIMITED"),
      "sources emptied": (f) => (f.value.existing_actor_compilation.source_state = []),
      "pin version moved": (f) => (f.value.existing_actor_compilation.source_state[0].version = 3),
      "pin owner moved": (f) =>
        (f.value.existing_actor_compilation.source_state[0].owner = "world_state"),
      "pin to another actor": (f) =>
        (f.value.existing_actor_compilation.source_state[0].fact_key = actorCapabilityBasisKey(
          "actor-other",
          C,
        )),
      "binding mode smuggled in": (f) =>
        (f.value.existing_actor_compilation.binding_mode = "DEFERRED"),
      "a claim re-authored": (f) => (f.value.identity_agency.provenance = "PLAYER-AUTHORED"),
      "owner changed": (f) => (f.owner = "named_actor"),
      "version changed": (f) => (f.version = 2),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === contractKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a saved fresh contract that gains the classification, or a saved source that is edited, is not accepted", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await establishActorBasis(s, 1, A, C);
    await must(
      s.campaign.releasePlayerCharacter({
        ...compilationPublication(1),
        contract: fixtureContract({ pc_id: A }),
      }),
    );
    await s.campaign.close();
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    j.facts.find((f: any) => f.key === contractKey).value.existing_actor_compilation = {
      classification: "EXISTING_ACTOR_COMPILATION",
      source_state: [actorBasisPin(A, C)],
    };
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");
    const edited = await saved();
    const q = join(edited, stateFile(edited));
    const k = JSON.parse(readFileSync(q, "utf8"));
    k.facts.find((f: any) => f.key === actorCapabilityBasisKey(A, C)).value.marker = "S";
    writeFileSync(q, JSON.stringify(k));
    expect(await openOutcome(edited)).not.toBe("OK");
  });

  it("a journal edit of the compilation's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain('"classification":"EXISTING_ACTOR_COMPILATION"');
    writeFileSync(
      journal,
      text.replace('"classification":"EXISTING_ACTOR_COMPILATION"', '"classification":"DEFERRED"'),
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
  const sourcePin = {
    reads: [{ key: actorCapabilityBasisKey(A, C), version: 1 }],
    depends_on: ["group-1"],
  };
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
  const worldAndLocus = async (s: CampaignStore, base: number) => {
    await must(
      s.commit(
        group(
          FIXTURE_CAMPAIGN,
          base,
          [
            write(worldProfileKey(FIXTURE_WORLD_ID), fixtureWorld() as never, {
              owner: "world_state",
              facet: "world_profile",
            }),
          ],
          {
            owner: "world_state",
            facet: "world_profile",
            rule: factKind("world_profile").rule,
          },
        ),
      ),
    );
    await must(
      s.commit(
        group(
          FIXTURE_CAMPAIGN,
          base + 1,
          [
            write(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID), fixtureLocus() as never, {
              owner: "world_state",
              facet: "world_locus",
            }),
          ],
          {
            owner: "world_state",
            facet: "world_locus",
            rule: factKind("world_locus").rule,
            reads: [{ key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 }],
            depends_on: [`group-${base}`],
          },
        ),
      ),
    );
  };

  it("the lawful order loads: actor state, then its compilation, then the actor owner's own later write", async () => {
    const dir = await rogue(async (s, n) => {
      await history(s, n);
      await must(s.commit(actorBasisGroup(1)));
      await must(s.commit(contractGroup(2, existingActorContract(A), sourcePin)));
      await must(s.commit(actorBasisGroup(3, D)));
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("the same actor write after an unclassified (fresh) contract is NAMED_ACTOR_STATE: the exception is the classification alone", async () => {
    const dir = await rogue(async (s, n) => {
      await history(s, n);
      await must(s.commit(contractGroup(1, fixtureContract({ pc_id: A }))));
      await must(s.commit(actorBasisGroup(2, D)));
    });
    expect(await openOutcome(dir)).toMatch(/NAMED_ACTOR_STATE/);
  });

  it("a compilation that did not read and depend on the pinned state, or whose source was committed after it, is REFERENCE_INVALID / DEPENDENCY_ORDER", async () => {
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await history(s, n);
          await must(s.commit(actorBasisGroup(1)));
          await must(s.commit(contractGroup(2, existingActorContract(A))));
        }),
      ),
    ).toMatch(/REFERENCE_INVALID/);
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await history(s, n);
          await must(s.commit(contractGroup(1, existingActorContract(A))));
          await must(s.commit(actorBasisGroup(2)));
        }),
      ),
    ).toMatch(/DEPENDENCY_ORDER/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(contractGroup(1, existingActorContract(A))));
        }),
      ),
    ).toMatch(/PREREQUISITE_MISSING/);
  });

  it("a compilation with a mismatched pin, another actor's source or a player-authored claim is REFERENCE_INVALID", async () => {
    const authored = {
      statement: "SYNTHETIC FIXTURE: authored.",
      provenance: "PLAYER-AUTHORED" as const,
    };
    const cases: Record<string, unknown> = {
      "pin version": existingActorContract(A, [actorBasisPin(A, C, 2)]),
      "another actor's source": existingActorContract(A, [actorBasisPin("actor-other", C)]),
      "world fact as source": existingActorContract(A, [
        { owner: "world_state", fact_key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
      ]),
      "player-authored claim": existingActorContract(A, undefined, { identity_agency: authored }),
    };
    for (const [name, contract] of Object.entries(cases)) {
      const dir = await rogue(async (s, n) => {
        await history(s, n);
        await must(s.commit(actorBasisGroup(1)));
        await must(s.commit(contractGroup(2, contract, sourcePin)));
      });
      expect(await openOutcome(dir), name).toMatch(/REFERENCE_INVALID/);
    }
  });

  it("a Role Registry binding of the compilation, built outside admission, is REFERENCE_INVALID on load; a fresh PC's binding loads", async () => {
    const bind = (n: number, pcId: string, pcVersion = 1) =>
      group(
        FIXTURE_CAMPAIGN,
        n,
        [
          write(
            PLAYER_CHARACTER_BINDING_KEY,
            {
              binding_slot: "role.player_character",
              active_pc: { fact_key: pcExistenceContractKey(pcId), entity_id: pcId },
              coupling: {
                world: {
                  fact_key: worldProfileKey(FIXTURE_WORLD_ID),
                  entity_id: FIXTURE_WORLD_ID,
                },
                locus: {
                  fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
                  entity_id: FIXTURE_LOCUS_ID,
                },
              },
              transition: {
                type: "ACTIVATION",
                basis: {
                  ...fixtureInsertionFact(),
                  pinned_versions: { pc: pcVersion, world: 1, locus: 1 },
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
            { key: pcExistenceContractKey(pcId), version: pcVersion },
            { key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
            { key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID), version: 1 },
          ],
          depends_on: [],
        },
      );
    const compiled = await rogue(async (s, n) => {
      await history(s, n);
      await must(s.commit(actorBasisGroup(1)));
      await worldAndLocus(s, 10);
      await must(s.commit(contractGroup(2, existingActorContract(A), sourcePin)));
      await must(s.commit(bind(20, A)));
    });
    expect(await openOutcome(compiled)).toMatch(/REFERENCE_INVALID/);
    const fresh = await rogue(async (s) => {
      await worldAndLocus(s, 10);
      await must(s.commit(contractGroup(2, fixtureContract({ pc_id: A }))));
      await must(s.commit(bind(20, A)));
    });
    expect(await openOutcome(fresh)).toBe("OK");
  });

  it("a PC capability received from the compilation, built outside admission, is PC_CAPABILITY_STATE on load", async () => {
    const dir = await rogue(async (s, n) => {
      await history(s, n);
      await must(s.commit(actorBasisGroup(1)));
      await must(s.commit(contractGroup(2, existingActorContract(A), sourcePin)));
      await must(
        s.commit(
          group(
            FIXTURE_CAMPAIGN,
            3,
            [
              write(
                pcCapabilityBasisKey(A, CAP_SAILING),
                pcCapabilityBasis(A, CAP_SAILING, {
                  establishment: {
                    method: "ACCEPTED_GENERATION_HISTORY",
                    contract: { fact_key: contractKey, version: 1 },
                    claims: [{ section: "baseline_exception.safely_inherited", index: 0 }],
                  },
                }) as never,
                { owner: "pc_existence", facet: "pc_capability_profile" },
              ),
            ],
            {
              owner: "pc_existence",
              facet: "pc_capability_profile",
              rule: PC_CAPABILITY_RULE,
              reads: [{ key: contractKey, version: 1 }],
              depends_on: ["group-2"],
            },
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).toMatch(/PC_CAPABILITY_STATE/);
  });

  it("the actor's persisted capability keeps its own key space after the compilation", async () => {
    expect(actorCapabilityKey(A, C)).toMatch(/^actor\//);
  });
});
