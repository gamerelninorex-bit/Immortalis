/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary phase output */
// Canonical World Identity & Owner Foundation — "the surviving campaign contains a real world, a real
// PC identity, and a lawful connection between them, each written by the correct owner."
// Register lineage: IA-01/02/03 (partial), IA-28 (partial), IA-06/IA-30 (reused); RC-02, RC-13, RC-16;
// IM-03, IM-07, IM-11, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0).
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  FACT_KINDS,
  createFileCampaign,
  factKind,
  type CampaignStore,
  type CreateFileCampaignParams,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  TEST_OWNERS,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  publication,
  write,
} from "@immortalis/testkit";
import { snapshotDir, tempDir } from "../support/tmp.ts";

const WORLD = worldProfileKey(FIXTURE_WORLD_ID);
const LOCUS = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
const PC = pcExistenceContractKey(FIXTURE_PC_ID);
const KEYS = [LOCUS, PC, PLAYER_CHARACTER_BINDING_KEY, WORLD].sort();

async function must<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
const code = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};

const bindInput = (n = 4) => ({
  ...publication(n),
  pc_id: FIXTURE_PC_ID,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  insertion: fixtureInsertionFact(),
});

async function established(dir: string, buildId = "seed"): Promise<CanonicalCampaign> {
  const c = await must(CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId }));
  await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(c.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(c.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  return c;
}

describe("the acceptance path: real owners, canonical identity, lawful binding", () => {
  it("establishes world, locus, PC and binding, each under its specification-backed owner/facet", async () => {
    const c = await established(tempDir());
    await must(c.bindPlayerCharacter(bindInput()));

    const owners = Object.fromEntries(
      c.store.listFacts().map((f) => [f.key, `${f.owner}/${f.facet}`]),
    );
    expect(owners).toEqual({
      [WORLD]: "world_state/world_profile",
      [LOCUS]: "world_state/world_locus",
      [PC]: "pc_existence/existence_contract",
      [PLAYER_CHARACTER_BINDING_KEY]: "role_registry/player_character_binding",
    });
    // each fact carries the exact governing source citation of its kind (RC-01) and the archivist path
    for (const f of c.store.listFacts()) {
      const kind = FACT_KINDS.find((k) => k.owner === f.owner && k.facet === f.facet)!;
      expect(f.provenance.rule).toEqual(kind.rule);
      expect(f.version).toBe(1);
      expect(f.unit).toBeNull();
      expect(c.store.lookupReceipt(f.provenance.intent_id)?.basis.authority).toEqual(
        CANON_WRITE_AUTHORITY,
      );
    }
    expect(c.world(FIXTURE_WORLD_ID)?.value.world_id).toBe(FIXTURE_WORLD_ID);
    expect(c.locus(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)?.value.locus_id).toBe(FIXTURE_LOCUS_ID);
    expect(c.playerCharacter(FIXTURE_PC_ID)?.value.pc_id).toBe(FIXTURE_PC_ID);
    expect(c.binding()?.value).toMatchObject({
      active_pc: { entity_id: FIXTURE_PC_ID },
      coupling: { world: { entity_id: FIXTURE_WORLD_ID }, locus: { entity_id: FIXTURE_LOCUS_ID } },
      transition: {
        type: "ACTIVATION",
        basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
      },
    });
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  it("the binding references the PC and the world; it copies neither (foreign facts are referenced)", async () => {
    const c = await established(tempDir());
    await must(c.bindPlayerCharacter(bindInput()));
    const raw = JSON.stringify(c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)?.value);
    expect(raw).not.toContain(fixtureWorld().premise);
    expect(raw).not.toContain(fixtureContract().identity_agency.statement);
    expect(raw).not.toContain(fixtureLocus().designation);
    expect(JSON.stringify(c.store.getFact(PC)?.value)).not.toContain(FIXTURE_WORLD_ID);
    await c.close();
  });

  it("commits exactly four facts and instantiates nothing else (no hidden expansion)", async () => {
    const dir = tempDir();
    const c = await established(dir);
    await must(c.bindPlayerCharacter(bindInput()));
    expect(c.store.listFacts().map((f) => f.key)).toEqual(KEYS);
    expect(c.store.head().revision).toBe(4);
    expect(c.store.head().journal_entries).toBe(4);
    // only the four key spaces of the four fact kinds exist in this build
    expect(FACT_KINDS.map((k) => k.id).sort()).toEqual([
      "pc_existence_contract",
      "player_character_binding",
      "world_locus",
      "world_profile",
    ]);
    await c.close();
  });

  it("is deterministic: identical inputs give byte-identical packages (no clock, no RNG)", async () => {
    const build = async () => {
      const dir = tempDir();
      const c = await established(dir, "same-build");
      await must(c.bindPlayerCharacter(bindInput()));
      await c.close();
      return snapshotDir(dir);
    };
    expect(await build()).toEqual(await build());
  });
});

describe("dependency direction through the service", () => {
  it("a binding before its prerequisites is rejected and manufactures nothing", async () => {
    const c = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: FIXTURE_CAMPAIGN, buildId: "t" }),
    );
    expect(await code(c.bindPlayerCharacter(bindInput(1)))).toBe("PREREQUISITE_MISSING");
    expect(c.store.listFacts()).toEqual([]);
    expect(c.store.head().revision).toBe(0);
    expect(c.binding()).toBeUndefined(); // NULL: no active PC
    await c.close();
  });

  it("each missing prerequisite blocks the binding; supplying them in order then succeeds", async () => {
    const c = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: FIXTURE_CAMPAIGN, buildId: "t" }),
    );
    await must(c.releasePlayerCharacter({ ...publication(1), contract: fixtureContract() }));
    expect(await code(c.bindPlayerCharacter(bindInput(2)))).toBe("PREREQUISITE_MISSING"); // no world
    // a locus cannot precede its world
    expect(await code(c.establishLocus({ ...publication(3), locus: fixtureLocus() }))).toBe(
      "PREREQUISITE_MISSING",
    );
    await must(c.establishWorld({ ...publication(4), world: fixtureWorld() }));
    expect(await code(c.bindPlayerCharacter(bindInput(5)))).toBe("PREREQUISITE_MISSING"); // no locus
    await must(c.establishLocus({ ...publication(6), locus: fixtureLocus() }));
    await must(c.bindPlayerCharacter(bindInput(7)));
    expect(c.store.listFacts().map((f) => f.key)).toEqual(KEYS);
    await c.close();
  });

  it("the PC contract depends on nothing: it needs no world, and the world needs no PC", async () => {
    const c = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: FIXTURE_CAMPAIGN, buildId: "t" }),
    );
    await must(c.releasePlayerCharacter({ ...publication(1), contract: fixtureContract() }));
    await c.close();
    const d = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: FIXTURE_CAMPAIGN, buildId: "t" }),
    );
    await must(d.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await d.close();
  });
});

describe("the binding consumes an explicit, already-established IR coupling basis (RC-13; IR §6 Step 3)", () => {
  const pins = { pc: 1, world: 1, locus: 1 };

  it("NEGATIVE: valid PC, world and locus exist but no IR basis is supplied -> fails closed, nothing committed", async () => {
    const c = await established(tempDir());
    const before = c.store.head();
    const withoutBasis: Record<string, unknown> = { ...bindInput() };
    delete withoutBasis["insertion"];
    expect(await code(c.bindPlayerCharacter(withoutBasis as never))).toBe("INPUT_INVALID");
    expect(await code(c.bindPlayerCharacter({ ...bindInput(), insertion: null }))).toBe(
      "INPUT_INVALID",
    );
    expect(await code(c.bindPlayerCharacter({ ...bindInput(), insertion: {} }))).toBe(
      "INPUT_INVALID",
    );
    expect(c.store.head()).toEqual(before);
    expect(c.store.head().revision).toBe(3);
    expect(c.binding()).toBeUndefined(); // still NULL: no active PC
    expect(c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    await c.close();
  });

  it.each([
    ["an established transfer/approach", { bridge: "ESTABLISHED_TRANSFER_APPROACH" }],
    ["a deferred activation", { bridge: "DEFERRED_ACTIVATION" }],
    ["a recurrent binding", { bridge: "RECURRENT_BINDING" }],
    ["a degenerate coextensive binding", { bridge: "DEGENERATE_COEXTENSIVE_BINDING" }],
    ["an ACTIVE-LIMITED/bridge-mode label", { bridge: "ACTIVE-LIMITED" }],
    ["a delegated basis", { established_by: "EXPLICIT_BOUNDED_DELEGATION" }],
    ["an implied basis", { established_by: "STRONG_SEMANTIC_IMPLICATION" }],
    [
      "a persona-authored basis",
      { authored_under: { role: "George", permission: "permission.player_choice.commit" } },
    ],
    ["an invented bridge mechanism", { mechanism: "portal" }],
    ["an empty statement", { statement: "" }],
  ])("NEGATIVE: %s is unsupported and fails closed without guessing", async (_n, over) => {
    const c = await established(tempDir());
    const r = await c.bindPlayerCharacter({
      ...bindInput(),
      insertion: { ...fixtureInsertionFact(), ...over },
    });
    expect(!r.ok && r.error.code).toBe("INPUT_INVALID");
    expect(c.store.head().revision).toBe(3);
    expect(c.binding()).toBeUndefined();
    await c.close();
  });

  it("POSITIVE: the authored basis is retained verbatim with only the mechanical version pins added", async () => {
    const c = await established(tempDir());
    await must(c.bindPlayerCharacter(bindInput()));
    const b = c.binding()!;
    expect(b.value.transition).toEqual({
      type: "ACTIVATION",
      basis: { ...fixtureInsertionFact(), pinned_versions: pins },
    });
    expect((b.value.transition.basis as { statement: string }).statement).toBe(
      fixtureInsertionFact().statement,
    );
    // the pins are the versions of the committed prerequisites, not constants
    expect(c.store.getFact(PC)?.version).toBe(pins.pc);
    expect(c.store.getFact(WORLD)?.version).toBe(pins.world);
    expect(c.store.getFact(LOCUS)?.version).toBe(pins.locus);
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  it("the basis is not inferred: two different authored statements give two different canonical bindings", async () => {
    const a = await established(tempDir());
    const b = await established(tempDir());
    await must(a.bindPlayerCharacter(bindInput()));
    await must(
      b.bindPlayerCharacter({
        ...bindInput(),
        insertion: fixtureInsertionFact({
          statement: "SYNTHETIC FIXTURE: another authored wording.",
        }),
      }),
    );
    const statementOf = (c: typeof a) =>
      (c.binding()?.value.transition.basis as { statement: string }).statement;
    expect(statementOf(a)).not.toBe(statementOf(b));
    await a.close();
    await b.close();
  });

  it("RAW store.commit cannot bypass the rule: no basis, stale pins or unsupported basis are refused", async () => {
    const c = await established(tempDir());
    const k = factKind("player_character_binding");
    const value = (transition: unknown) => ({
      binding_slot: "role.player_character",
      active_pc: { fact_key: PC, entity_id: FIXTURE_PC_ID },
      coupling: {
        world: { fact_key: WORLD, entity_id: FIXTURE_WORLD_ID },
        locus: { fact_key: LOCUS, entity_id: FIXTURE_LOCUS_ID },
      },
      transition,
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    });
    const raw = (n: number, v: unknown) =>
      group(
        FIXTURE_CAMPAIGN,
        n,
        [write(PLAYER_CHARACTER_BINDING_KEY, v as never, { owner: k.owner, facet: k.facet })],
        {
          owner: k.owner,
          facet: k.facet,
          rule: k.rule,
          reads: [PC, WORLD, LOCUS].map((key) => ({ key, version: 1 })),
          depends_on: ["wf-group-3", "wf-group-1", "wf-group-2"],
        },
      );
    const basis = { ...fixtureInsertionFact(), pinned_versions: pins };
    const before = c.store.head();
    expect(await code(c.store.commit(raw(10, value({ type: "ACTIVATION" }))))).toBe(
      "VALUE_INVALID",
    );
    expect(
      await code(
        c.store.commit(
          raw(11, value({ type: "ACTIVATION", basis: { ...basis, bridge: "RECURRENT_BINDING" } })),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await code(
        c.store.commit(
          raw(
            12,
            value({
              type: "ACTIVATION",
              basis: { ...basis, pinned_versions: { pc: 1, world: 1, locus: 9 } },
            }),
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(c.store.head()).toEqual(before);
    // the same raw path accepts the lawful value: the rule governs, it does not merely block
    expect(await code(c.store.commit(raw(13, value({ type: "ACTIVATION", basis }))))).toBe("OK");
    expect(c.verify()).toEqual([]);
    await c.close();
  });
});

/** A raw group by `as`'s owner/facet, with `as`'s own rule, writing `key` (which belongs to another owner). */
const intruder = (n: number, as: Parameters<typeof factKind>[0], key: string, value: unknown) => {
  const k = factKind(as);
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [write(key, value as never, { owner: k.owner, facet: k.facet })],
    {
      owner: k.owner,
      facet: k.facet,
      rule: k.rule,
    },
  );
};

describe("owner exclusivity holds for the raw store, before and after reload", () => {
  const attempts = (): [string, unknown][] => [
    [
      "role_registry takes a world locus key",
      intruder(90, "player_character_binding", `world/${FIXTURE_WORLD_ID}/locus/x`, fixtureLocus()),
    ],
    [
      "pc_existence takes the world profile key",
      intruder(91, "pc_existence_contract", `world/w2/profile`, fixtureWorld({ world_id: "w2" })),
    ],
    [
      "world_state takes a PC contract key",
      intruder(92, "world_profile", "pc/p2/existence-contract", fixtureContract({ pc_id: "p2" })),
    ],
    [
      "world_state/world_locus takes the profile key",
      intruder(93, "world_locus", `world/w3/profile`, fixtureWorld({ world_id: "w3" })),
    ],
  ];

  it("wrong-owner and wrong-facet writes are refused and write nothing", async () => {
    const c = await established(tempDir());
    const before = c.store.head();
    for (const [name, g] of attempts()) {
      expect(await code(c.store.commit(g)), name).toBe("KEY_NOT_ADMITTED");
    }
    expect(c.store.head()).toEqual(before);
    await c.close();
  });

  it("admission is wired through the open path too", async () => {
    const dir = tempDir();
    await (await established(dir)).close();
    const r = await must(CanonicalCampaign.open(dir));
    for (const [name, g] of attempts()) {
      expect(await code(r.store.commit(g)), name).toBe("KEY_NOT_ADMITTED");
    }
    expect(r.store.listFacts().map((f) => f.key)).toEqual([LOCUS, PC, WORLD].sort());
    await r.close();
  });

  it("test-only owners cannot write canonical facts and are not accepted as owners", async () => {
    const c = await established(tempDir());
    const [owner] = [...TEST_OWNERS.keys()] as [string];
    const facet = [...(TEST_OWNERS.get(owner) ?? [])][0] as string;
    expect(
      await code(c.store.commit(group(FIXTURE_CAMPAIGN, 91, [write("x", 1)], { owner, facet }))),
    ).toBe("OWNER_NOT_REGISTERED");
    await c.close();
  });
});

describe("idempotence and identity (RC-16, CAL-07) on the new operations", () => {
  it("re-presenting a committed publication returns the original receipt and changes nothing", async () => {
    const c = await established(tempDir());
    const first = await must(c.bindPlayerCharacter(bindInput()));
    const head = c.store.head();
    const again = await must(c.bindPlayerCharacter(bindInput()));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(c.store.head()).toEqual(head);
    await c.close();
  });

  it("the same intent with different content is rejected; a second binding cannot overwrite the first", async () => {
    const c = await established(tempDir());
    await must(c.bindPlayerCharacter(bindInput()));
    expect(
      await code(
        c.establishWorld({
          ...publication(1),
          world: fixtureWorld({ premise: "SYNTHETIC: changed" }),
        }),
      ),
    ).toBe("INTENT_CONFLICT");
    expect(await code(c.bindPlayerCharacter(bindInput(5)))).toBe("VERSION_CONFLICT");
    expect(c.store.head().revision).toBe(4);
    await c.close();
  });

  it("invalid authored input is rejected at the boundary and defaults nothing", async () => {
    const c = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: FIXTURE_CAMPAIGN, buildId: "t" }),
    );
    expect(await code(c.establishWorld({ ...publication(1), world: { world_id: "w" } }))).toBe(
      "INPUT_INVALID",
    );
    expect(
      await code(
        c.establishWorld({ ...(publication(1) as any), secrecy: undefined, world: fixtureWorld() }),
      ),
    ).toBe("INPUT_INVALID");
    expect(c.store.head().revision).toBe(0);
    await c.close();
  });
});

describe("Save. Close. Load. Continue. — the world, the PC and the binding remain themselves", () => {
  it("across real process boundaries", async () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "world-foundation-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", script, phase, dir],
          {
            encoding: "utf8",
          },
        ),
      ) as Record<string, any>;

    // process 1: world + locus + PC, then closed
    const est = run("establish");
    expect(est.violations).toEqual([]);
    expect(est.facts.map((f: any) => f.key)).toEqual([LOCUS, PC, WORLD].sort());
    const world1 = est.facts.find((f: any) => f.key === WORLD);
    const locus1 = est.facts.find((f: any) => f.key === LOCUS);
    const pc1 = est.facts.find((f: any) => f.key === PC);

    // process 2: LOAD, verify identity intact, then CONTINUE by binding (dependency across sessions)
    const bind = run("bind");
    expect(bind.before.head.state_sha256).toBe(est.head.state_sha256);
    expect(bind.before.head.spec_identity).toEqual(BUILD_SPEC_IDENTITY);
    expect(bind.before.head.created_with.build_id).toBe("process-1");
    expect(bind.before.facts).toEqual(est.facts); // byte-identical facts after reload
    expect(bind.after.head.revision).toBe(4);
    expect(bind.after.violations).toEqual([]);

    // process 3: LOAD again; everything from processes 1 and 2 unchanged; replay + second binding
    const insp = run("inspect");
    expect(insp.before.head.state_sha256).toBe(bind.after.head.state_sha256);
    expect(insp.before.facts).toEqual(bind.after.facts);
    expect(insp.replay.replayed).toBe(true);
    expect(insp.replay.receipt).toEqual(bind.receipt.receipt);
    expect(insp.second).toBe("VERSION_CONFLICT");
    expect(insp.after.head).toEqual(insp.before.head);

    // process 4 (this one): LOAD and check every identity, assignment and provenance
    const c = await must(CanonicalCampaign.open(dir));
    const byKey = (k: string) => c.store.getFact(k);
    expect(byKey(WORLD)).toEqual(world1);
    expect(byKey(LOCUS)).toEqual(locus1);
    expect(byKey(PC)).toEqual(pc1);
    expect(c.world(FIXTURE_WORLD_ID)?.value).toEqual(fixtureWorld());
    expect(c.locus(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)?.value).toEqual(fixtureLocus());
    expect(c.playerCharacter(FIXTURE_PC_ID)?.value).toEqual(fixtureContract());
    const b = c.binding()!;
    expect(b.value.active_pc.entity_id).toBe(FIXTURE_PC_ID);
    expect(b.value.coupling.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    // the lawful IR coupling basis survives save -> close -> load -> continue, byte for byte
    expect(b.value.transition).toEqual({
      type: "ACTIVATION",
      basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
    });
    expect(
      bind.after.facts.find((f: any) => f.key === PLAYER_CHARACTER_BINDING_KEY).value.transition
        .basis.statement,
    ).toBe(fixtureInsertionFact().statement);
    expect(b.fact).toMatchObject({
      owner: "role_registry",
      facet: "player_character_binding",
      provenance: { group_id: "wf-group-4", intent_id: "wf-intent-4" },
    });
    expect(c.store.lookupReceipt("wf-intent-4")?.basis.authority).toEqual(CANON_WRITE_AUTHORITY);
    expect(c.store.head().spec_identity).toEqual(BUILD_SPEC_IDENTITY);
    // process 3 only replayed and rejected: nothing was committed, so nothing was re-saved
    expect(c.store.head().last_saved_with.build_id).toBe("process-2");
    expect(c.verify()).toEqual([]);
    await c.close();
  });
});

/** Builds a package with a store that is NOT the canonical one, to prove load-time drift detection. */
async function rogue(
  build: (s: CampaignStore) => Promise<void>,
  options: Omit<CreateFileCampaignParams, "campaignId">,
): Promise<string> {
  const dir = tempDir();
  const s = await must(createFileCampaign(dir, { ...options, campaignId: FIXTURE_CAMPAIGN }));
  await build(s);
  await s.close();
  return dir;
}
const openCode = async (dir: string) => {
  const r = await CanonicalCampaign.open(dir);
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code === "CANON_INTEGRITY"
    ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
    : r.error.code;
};

describe("load fails closed on owner/facet, rule or dependency drift", () => {
  it("a campaign whose facts are outside the registered key spaces is not canonical", async () => {
    const dir = await rogue(
      async (s) => void (await must(s.commit(group(FIXTURE_CAMPAIGN, 1, [write("fact/a", 1)])))),
      {
        owners: TEST_OWNERS,
      },
    );
    expect(await openCode(dir)).toBe("UNREGISTERED_KEY");
  });

  it("a world fact written under a different owner is detected on load (no owner drift)", async () => {
    const dir = await rogue(
      async (s) =>
        void (await must(
          s.commit(group(FIXTURE_CAMPAIGN, 1, [write(WORLD, fixtureWorld() as never)])),
        )),
      { owners: TEST_OWNERS },
    );
    expect(await openCode(dir)).toBe("WRONG_OWNER_FACET");
  });

  it("a fact carrying a different governing rule than the registered citation is detected", async () => {
    const wk = factKind("world_profile");
    const dir = await rogue(
      async (s) =>
        void (await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              1,
              [write(WORLD, fixtureWorld() as never, { owner: wk.owner, facet: wk.facet })],
              {
                owner: wk.owner,
                facet: wk.facet,
              },
            ),
          ),
        )),
      { owners: new Map([[wk.owner, new Set([wk.facet])]]) },
    );
    expect(await openCode(dir)).toBe("RULE_DRIFT");
  });

  it("a binding committed before its prerequisites is detected on load, even if they exist later", async () => {
    const [pk, wk, lk, bk] = (
      ["pc_existence_contract", "world_profile", "world_locus", "player_character_binding"] as const
    ).map(factKind);
    const registry = new Map([
      [pk!.owner, new Set([pk!.facet])],
      [wk!.owner, new Set([wk!.facet, lk!.facet])],
      [bk!.owner, new Set([bk!.facet])],
    ]);
    const put = (n: number, kind: typeof pk, key: string, value: unknown) =>
      group(
        FIXTURE_CAMPAIGN,
        n,
        [write(key, value as never, { owner: kind!.owner, facet: kind!.facet })],
        {
          owner: kind!.owner,
          facet: kind!.facet,
          rule: kind!.rule,
        },
      );
    const binding = {
      binding_slot: "role.player_character",
      active_pc: { fact_key: PC, entity_id: FIXTURE_PC_ID },
      coupling: {
        world: { fact_key: WORLD, entity_id: FIXTURE_WORLD_ID },
        locus: { fact_key: LOCUS, entity_id: FIXTURE_LOCUS_ID },
      },
      transition: {
        type: "ACTIVATION",
        basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
      },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    };
    const dir = await rogue(
      async (s) => {
        await must(s.commit(put(1, bk, PLAYER_CHARACTER_BINDING_KEY, binding)));
        await must(s.commit(put(2, pk, PC, fixtureContract())));
        await must(s.commit(put(3, wk, WORLD, fixtureWorld())));
        await must(s.commit(put(4, lk, LOCUS, fixtureLocus())));
      },
      { owners: registry },
    );
    expect(await openCode(dir)).toContain("DEPENDENCY_ORDER");
  });

  /** PC, world and locus in lawful order, then a binding whose `transition` is chosen by the test. */
  async function rogueBinding(transition: unknown): Promise<string> {
    const [pk, wk, lk, bk] = (
      ["pc_existence_contract", "world_profile", "world_locus", "player_character_binding"] as const
    ).map(factKind);
    const registry = new Map([
      [pk!.owner, new Set([pk!.facet])],
      [wk!.owner, new Set([wk!.facet, lk!.facet])],
      [bk!.owner, new Set([bk!.facet])],
    ]);
    const put = (n: number, kind: typeof pk, key: string, value: unknown) =>
      group(
        FIXTURE_CAMPAIGN,
        n,
        [write(key, value as never, { owner: kind!.owner, facet: kind!.facet })],
        {
          owner: kind!.owner,
          facet: kind!.facet,
          rule: kind!.rule,
        },
      );
    const binding = {
      binding_slot: "role.player_character",
      active_pc: { fact_key: PC, entity_id: FIXTURE_PC_ID },
      coupling: {
        world: { fact_key: WORLD, entity_id: FIXTURE_WORLD_ID },
        locus: { fact_key: LOCUS, entity_id: FIXTURE_LOCUS_ID },
      },
      transition,
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    };
    return rogue(
      async (s) => {
        await must(s.commit(put(1, pk, PC, fixtureContract())));
        await must(s.commit(put(2, wk, WORLD, fixtureWorld())));
        await must(s.commit(put(3, lk, LOCUS, fixtureLocus())));
        await must(s.commit(put(4, bk, PLAYER_CHARACTER_BINDING_KEY, binding)));
      },
      { owners: registry },
    );
  }
  const goodBasis = () => ({
    ...fixtureInsertionFact(),
    pinned_versions: { pc: 1, world: 1, locus: 1 },
  });

  it("control: the same rogue-built package with a lawful basis opens (the drift cases below are not artefacts)", async () => {
    expect(await openCode(await rogueBinding({ type: "ACTIVATION", basis: goodBasis() }))).toBe(
      "OK",
    );
  });

  it("a binding accepted only for coexistence (no retained IR basis) is refused on load", async () => {
    expect(await openCode(await rogueBinding({ type: "ACTIVATION" }))).toBe("VALUE_INVALID");
  });

  it("a retained basis for an unsupported bridge is refused on load", async () => {
    const t = {
      type: "ACTIVATION",
      basis: { ...goodBasis(), bridge: "ESTABLISHED_TRANSFER_APPROACH" },
    };
    expect(await openCode(await rogueBinding(t))).toBe("VALUE_INVALID");
  });

  it("a retained basis pinned to other than the committed PC, world and locus versions is refused on load", async () => {
    for (const pinned_versions of [
      { pc: 2, world: 1, locus: 1 },
      { pc: 1, world: 2, locus: 1 },
      { pc: 1, world: 1, locus: 2 },
      { pc: 0, world: 0, locus: 0 },
    ]) {
      const t = { type: "ACTIVATION", basis: { ...goodBasis(), pinned_versions } };
      expect(await openCode(await rogueBinding(t)), JSON.stringify(pinned_versions)).toBe(
        "REFERENCE_INVALID",
      );
    }
  });

  it("a clean canonical campaign, empty or populated, opens", async () => {
    const dir = tempDir();
    await (await must(CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN }))).close();
    expect(await openCode(dir)).toBe("OK");
    const dir2 = tempDir();
    const c = await established(dir2);
    await must(c.bindPlayerCharacter(bindInput()));
    await c.close();
    expect(await openCode(dir2)).toBe("OK");
  });
});
