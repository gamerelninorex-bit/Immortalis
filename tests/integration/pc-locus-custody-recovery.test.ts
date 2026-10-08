/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Active-PC Post-Handover Physical Locus Custody — save → close → load → continue preserves the one stationary physical owner and
// its provenance at every durable cut with convergence on the uninterrupted run, a lost reply converges by identity, and a loaded
// campaign whose custody record (or what it consumed) has been tampered with, or was built outside admission, fails closed with
// a precise integrity code. The slice adds no persistence path: the record is one ordinary OwnerFact, so the existing journal,
// receipts, replay and package integrity are the ones in force.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-03, IM-11, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  createFileCampaign,
  factKind,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  write,
} from "@immortalis/testkit";
import {
  existingActorSummary,
  reopenExistingActor,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import {
  PC,
  custodyKey,
  establishCustody,
  handedOverCampaign,
} from "../support/pc-locus-custody.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;

async function referenceRun() {
  const s = await handedOverCampaign();
  await must(establishCustody(s, 1));
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

/** What must hold of the ownership result at any cut: exactly one stationary owner when established, none otherwise. */
function expectOwner(s: ExistingActorSeeded, established: boolean) {
  expect(s.campaign.verify()).toEqual([]);
  const custody = s.campaign.store
    .listFacts()
    .filter((f) => f.key.startsWith("world-state/pc/") && f.key.endsWith("/locus-custody"));
  expect(custody).toHaveLength(established ? 1 : 0);
  if (established) {
    expect(s.campaign.pcPhysicalLocusCustody(PC)!.value.stationary_locus.locus.entity_id).toBe(L);
  } else {
    expect(s.campaign.pcPhysicalLocusCustody(PC)).toBeUndefined();
  }
  // no in-transfer owner can coexist: no Logistics fact exists at all
  expect(s.campaign.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
}

describe("save → close → load → continue preserves the one stationary physical owner at every durable cut", () => {
  for (const cut of [
    { name: "handed over, custody not yet established", established: false },
    { name: "custody established", established: true },
  ]) {
    it(`${cut.name}: reloads unchanged, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await handedOverCampaign(dir);
      if (cut.established) await must(establishCustody(s, 1));
      const before = existingActorSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenExistingActor(dir);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(before);
      expectOwner(r, cut.established);
      const again = await must(establishCustody(r, 1));
      expect(again.replayed).toBe(cut.established);
      same(r.campaign.store.head(), ref.head);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      expectOwner(r, true);
      await r.campaign.close();
    });
  }

  it("the record survives the reload byte-for-byte with its provenance and receipt; the binding, the coupling and the consumed facts are unchanged, across a second reload", async () => {
    const dir = tempDir();
    const s = await handedOverCampaign(dir);
    const consumed = [
      PLAYER_CHARACTER_BINDING_KEY,
      worldActorCouplingKey(PC),
      pcExistenceContractKey(PC),
      worldProfileKey(W),
      worldLocusKey(W, L),
    ];
    const consumedBefore = consumed.map((k) => structuredClone(s.campaign.store.getFact(k)!));
    await must(establishCustody(s, 1));
    const fact = structuredClone(s.campaign.store.getFact(custodyKey())!);
    const receipt = s.campaign.store.lookupReceipt(fact.provenance.intent_id)!;
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    expect(r.campaign.store.getFact(custodyKey())).toEqual(fact);
    expect(r.campaign.store.lookupReceipt(fact.provenance.intent_id)).toEqual(receipt);
    expect(consumed.map((k) => r.campaign.store.getFact(k))).toEqual(consumedBefore);
    await r.campaign.close();
    const twice = await reopenExistingActor(dir);
    expectOwner(twice, true);
    await twice.campaign.close();
  });

  it("after a reload a duplicate establishment (a new intent) is a version conflict, and re-presenting the old intent is a replay: still exactly one record", async () => {
    const dir = tempDir();
    const s = await handedOverCampaign(dir);
    await must(establishCustody(s, 1));
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    const head = r.campaign.store.head();
    const dup = await establishCustody(r, 2);
    expect(!dup.ok && dup.error.code).toBe("VERSION_CONFLICT");
    expect(r.campaign.store.head()).toEqual(head);
    expect((await must(establishCustody(r, 1))).replayed).toBe(true);
    expectOwner(r, true);
    await r.campaign.close();
  });
});

describe("a lost reply or a retry converges by identity (RC-16)", () => {
  it("the custody committed with the reply lost is reconciled by identity: replayed, never a second record", async () => {
    const ref = await referenceRun();
    const s = await handedOverCampaign();
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key === custodyKey())
              ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const lost = await establishCustody(s, 1);
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    (s.campaign as any).store = real;
    const committed = structuredClone(real.getFact(custodyKey())!);
    const head = real.head();
    const retry = await must(establishCustody(s, 1));
    expect(retry.replayed).toBe(true);
    expect(real.head()).toEqual(head);
    expect(real.getFact(custodyKey())).toEqual(committed);
    same(real.head(), ref.head);
    expectOwner(s, true);
    await s.campaign.close();
  });

  it("an establishment refused at admission leaves no trace, and the lawful publication under the same identity then commits", async () => {
    const s = await handedOverCampaign();
    const head = s.campaign.store.head();
    expect((await establishCustody(s, 1, "actor-nobody")).ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(establishCustody(s, 1));
    expectOwner(s, true);
  });
});

describe("load fails closed on a corrupted saved custody record", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await handedOverCampaign(dir);
    await must(establishCustody(s, 1));
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
  const tamper = async (edit: (j: any) => void) => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    edit(j);
    writeFileSync(p, JSON.stringify(j));
    return openOutcome(dir);
  };
  const custody = (j: any) => j.facts.find((f: any) => f.key === custodyKey());

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  it("an edit of the saved custody record — identity, locus, pins, basis, custodian, extras, owner, version, rule — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "PC identity moved": (f) => (f.value.pc_id = "actor-other"),
      "locus moved": (f) => (f.value.stationary_locus.locus.entity_id = "locus-x"),
      "locus key moved": (f) =>
        (f.value.stationary_locus.locus.fact_key = worldLocusKey(W, "locus-x")),
      "world moved": (f) => (f.value.stationary_locus.world.entity_id = "world-x"),
      "contract pin moved": (f) => (f.value.basis.pinned_versions.pc = 2),
      "binding pin moved": (f) => (f.value.basis.pinned_versions.binding = 2),
      "coupling pin moved": (f) => (f.value.basis.pinned_versions.coupling = 2),
      "world pin moved": (f) => (f.value.basis.pinned_versions.world = 0),
      "locus pin moved": (f) => (f.value.basis.pinned_versions.locus = 2),
      "basis downgraded": (f) => (f.value.basis.established_from = "ACTIVATION"),
      "custodian changed": (f) => (f.value.custodian.owner = "logistics"),
      "a movement smuggled in": (f) => (f.value.movement = { to: "locus-x" }),
      "a second locus smuggled in": (f) => (f.value.binding_locus = f.value.stationary_locus),
      "owner changed": (f) => (f.owner = "logistics"),
      "facet changed": (f) => (f.facet = "world_locus"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      expect(await tamper((j) => edit(custody(j))), name).not.toBe("OK");
    }
  });

  it("an edit of a fact the custody consumed — the coupling, the binding or the contract — is not accepted", async () => {
    const edits: Record<string, (j: any) => void> = {
      "coupling locus moved": (j) =>
        (j.facts.find(
          (f: any) => f.key === worldActorCouplingKey(PC),
        ).value.coupling.locus.entity_id = "locus-x"),
      "coupling removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== worldActorCouplingKey(PC))),
      "binding removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY)),
      "binding downgraded to a first ACTIVATION": (j) => {
        const f = j.facts.find((x: any) => x.key === PLAYER_CHARACTER_BINDING_KEY);
        f.value.transition = {
          type: "ACTIVATION",
          basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
        };
        f.value.intrinsic_authority_migration = [];
      },
      "contract classification removed": (j) =>
        delete j.facts.find((f: any) => f.key === pcExistenceContractKey(PC)).value
          .existing_actor_compilation,
    };
    for (const [name, edit] of Object.entries(edits)) {
      expect(await tamper(edit), name).not.toBe("OK");
    }
  });

  it("removing the saved custody record while keeping the journal fails, as does a second record under another identity", async () => {
    expect(
      await tamper((j) => (j.facts = j.facts.filter((f: any) => f.key !== custodyKey()))),
    ).not.toBe("OK");
    expect(
      await tamper((j) => {
        const copy = structuredClone(custody(j));
        copy.key = custodyKey("actor-other");
        copy.value.pc_id = "actor-other";
        j.facts.push(copy);
      }),
    ).not.toBe("OK");
  });

  it("a journal edit of the custody's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("EXISTING_ACTOR_HANDOVER");
    const edited = text.replace('"binding":1,"coupling":1,', '"binding":1,"coupling":2,');
    expect(edited).not.toBe(text);
    writeFileSync(journal, edited);
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
      }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const canon = (
    n: number,
    key: string,
    value: unknown,
    owner: string,
    facet: string,
    kindId: Parameters<typeof factKind>[0],
    reads: { key: string; version: number }[] = [],
    depends: string[] = [],
  ) =>
    group(FIXTURE_CAMPAIGN, n, [write(key, value as never, { owner, facet })], {
      owner,
      facet,
      rule: factKind(kindId).rule,
      reads,
      depends_on: depends,
    });

  it("a custody record over a PC that was activated by ordinary first ACTIVATION — with no handover — is refused on load", async () => {
    const dir = await rogue(async (s) => {
      await must(
        s.commit(
          canon(
            1,
            worldProfileKey(W),
            fixtureWorld(),
            "world_state",
            "world_profile",
            "world_profile",
          ),
        ),
      );
      await must(
        s.commit(
          canon(
            2,
            worldLocusKey(W, L),
            fixtureLocus(),
            "world_state",
            "world_locus",
            "world_locus",
            [{ key: worldProfileKey(W), version: 1 }],
            ["group-1"],
          ),
        ),
      );
      await must(
        s.commit(
          canon(
            3,
            pcExistenceContractKey(FIXTURE_PC_ID),
            fixtureContract(),
            "pc_existence",
            "existence_contract",
            "pc_existence_contract",
          ),
        ),
      );
      const reads = [
        { key: pcExistenceContractKey(FIXTURE_PC_ID), version: 1 },
        { key: worldProfileKey(W), version: 1 },
        { key: worldLocusKey(W, L), version: 1 },
      ];
      await must(
        s.commit(
          canon(
            4,
            PLAYER_CHARACTER_BINDING_KEY,
            {
              binding_slot: "role.player_character",
              active_pc: {
                fact_key: pcExistenceContractKey(FIXTURE_PC_ID),
                entity_id: FIXTURE_PC_ID,
              },
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
            },
            "role_registry",
            "player_character_binding",
            "player_character_binding",
            reads,
            ["group-3", "group-1", "group-2"],
          ),
        ),
      );
      await must(
        s.commit(
          canon(
            5,
            custodyKey(FIXTURE_PC_ID),
            {
              pc_id: FIXTURE_PC_ID,
              stationary_locus: {
                world: { fact_key: worldProfileKey(W), entity_id: W },
                locus: { fact_key: worldLocusKey(W, L), entity_id: L },
              },
              basis: {
                established_from: "EXISTING_ACTOR_HANDOVER",
                pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
              },
              custodian: {
                owner: "world_state",
                facet: "world_fallback_physical_entity",
                basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
              },
            },
            "world_state",
            "world_fallback_physical_entity",
            "world_pc_locus_custody",
            [...reads, { key: PLAYER_CHARACTER_BINDING_KEY, version: 1 }],
            ["group-3", "group-1", "group-2", "group-4"],
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).toMatch(/PC_LOCUS_CUSTODY_STATE/);
  });
});

describe("the custody is persisted by the existing machinery only", () => {
  it("no new persistence artifact exists: the saved package holds the same files before and after the custody", async () => {
    const dir = tempDir();
    const s = await handedOverCampaign(dir);
    await s.campaign.close();
    const files = () =>
      readdirSync(dir)
        .map((f) => f.replace(/\d+/g, "N"))
        .sort();
    const before = files();
    const r = await reopenExistingActor(dir);
    await must(establishCustody(r, 1));
    await r.campaign.close();
    expect(files()).toEqual(before);
  });
});
