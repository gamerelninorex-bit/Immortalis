/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
// ENFORCEMENT of the original active-PC qualified physical-locus custody (BLUE v5.1) at the ENGINE: the owner path, a raw `store.commit`,
// the rule itself, and a package built outside admission. The campaign each test starts from is built by the shipped paths; the scripted
// referee host is a policy the test wrote (plumbing only). No test supplies a verdict: the engine derives it from the validated answer,
// and every refusal below is re-derived from the committed upstream facts and decisions.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  pcExistenceContractKey,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  worldActorCouplingKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  WORLD_PC_LOCUS_CUSTODY_RULE,
  WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE,
  createFileCampaign,
  deriveOriginalPcPhysicalLocusCustody,
  pcPhysicalLocusCustodyViolation,
  REFEREE_PHYSICAL_RULE,
  REFEREE_RULE,
  contextDigest,
  statementDigest,
} from "@immortalis/engine";
import { group, write } from "@immortalis/testkit";
import { openOrdinary } from "../support/locality.ts";
import {
  CAMPAIGN,
  HOST_ID,
  LOCUS_ID,
  PC_ID,
  WORLD_ID,
  scriptedPolicy,
} from "../support/original-pc.ts";
import { boundCampaign } from "../support/original-pc-locus.ts";
import { tempDir } from "../support/tmp.ts";
import type { PhysicalRule } from "../support/original-pc.ts";

const KEY = worldPcLocusCustodyKey(PC_ID);
const OWNER = { owner: "world_state", facet: "world_fallback_physical_entity" } as const;

interface Ctx {
  c: CanonicalCampaign;
  native: string;
  i002: string;
}

async function opened(): Promise<Ctx> {
  const dirs = await boundCampaign();
  const c = await openOrdinary(dirs.campaignDir);
  const binding = c.binding()!;
  const native = c.store
    .committedGroup(binding.fact.provenance.intent_id)!
    .reads.find((r) => r.key.startsWith("referee/"))!.key;
  const i002 = c.store
    .listFacts()
    .find((f) => (f.value as any)?.operation === "I002_CLASSIFY")!.key;
  return { c, native, i002 };
}

/** The physical-placement decision for the bound character, retained through the engine's adapter under the trusted authority. */
async function physicalDecision(c: CanonicalCampaign, rule: PhysicalRule = {}, attempt = 0) {
  const adapter = new RefereeAdjudicationAdapter(c.store);
  const task = adapter.physicalTask({ pc_id: PC_ID, attempt });
  if (!task.ok) throw new Error(task.error.message);
  const answer = scriptedPolicy({ physical: rule })({
    operation: "IR_PHYSICAL_PLACEMENT",
    task_id: task.value.task_id,
    context: task.value.context,
  });
  const out = await adapter.recordPhysical({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: HOST_ID, claimed_model: null },
    pc_id: PC_ID,
    attempt,
    answer,
  });
  if (!out.ok) throw new Error(`${out.error.code}: ${out.error.message}`);
  return out.value;
}

const pub = (n: number) => ({
  group_id: `loc-group-${n}`,
  intent_id: `loc-intent-${n}`,
  cause: `loc-cause-${n}`,
  basis: "test-basis",
  secrecy: "test-secrecy",
});

const establish = (x: Ctx, physical: string, n = 1, over: Record<string, unknown> = {}) =>
  x.c.establishOriginalPcPhysicalLocusCustody({
    ...pub(n),
    pc_id: PC_ID,
    native_qualified_by: x.native,
    physical_qualified_by: physical,
    ...over,
  } as never);

/** A raw custody group built mechanically as the owner path would build it, then edited, for a store reached without the owner path. */
function rawCustody(
  x: Ctx,
  physical: string,
  n: number,
  edit: (v: any) => void = () => undefined,
  over: Partial<CommitGroup> = {},
  native = x.native,
): CommitGroup {
  const derived = deriveOriginalPcPhysicalLocusCustody(
    { pc_id: PC_ID, native_qualified_by: native, physical_qualified_by: physical },
    x.c.store,
  );
  if (!derived.ok) throw new Error(derived.error.message);
  const value: any = structuredClone(derived.value);
  edit(value);
  const keys = [
    pcExistenceContractKey(PC_ID),
    PLAYER_CHARACTER_BINDING_KEY,
    worldProfileKey(WORLD_ID),
    worldLocusKey(WORLD_ID, LOCUS_ID),
    native,
    physical,
  ];
  return group(CAMPAIGN, n, [write(KEY, value, OWNER)], {
    ...OWNER,
    rule: WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE,
    reads: keys.map((k) => ({ key: k, version: x.c.store.getFact(k)?.version ?? 0 })),
    depends_on: [...new Set(keys.flatMap((k) => x.c.store.getFact(k)?.provenance.group_id ?? []))],
    ...over,
  });
}

/**
 * A physical-placement decision group for a FRESH attempt, built as the adapter would, from the context the committed facts determine
 * and the scripted host's answer to it, then optionally edited: lets a test present a forged decision to a store that has admission
 * (or to one that has none) without going through the adapter.
 */
function physicalRecordGroup(
  x: Ctx,
  attempt: number,
  rule: PhysicalRule,
  edit: (r: any) => void = () => undefined,
  over: Partial<CommitGroup> = {},
): CommitGroup {
  const adapter = new RefereeAdjudicationAdapter(x.c.store);
  const task = adapter.physicalTask({ pc_id: PC_ID, attempt });
  if (!task.ok) throw new Error(task.error.message);
  const ctx = task.value.context;
  const answer = scriptedPolicy({ physical: rule })({
    operation: "IR_PHYSICAL_PLACEMENT",
    task_id: task.value.task_id,
    context: ctx,
  });
  const evaluated = adapter.evaluatePhysical(ctx, answer);
  if (!evaluated.ok) throw new Error(evaluated.error.message);
  const record: any = {
    record_version: 1,
    task_id: task.value.task_id,
    campaign_id: CAMPAIGN,
    attempt,
    authority: { ...REFEREE_AUTHORITY },
    host: { host_id: HOST_ID, claimed_model: null },
    subject: { pc_id: PC_ID },
    input: {
      digest: contextDigest(ctx),
      candidate_digest: null,
      candidate: null,
      statement_digest: statementDigest(ctx.statement),
      statement: ctx.statement,
      refs: ctx.refs.map((r) => ({ ...r })),
    },
    operation: "IR_PHYSICAL_PLACEMENT",
    decision: evaluated.value.decision,
    verdict: evaluated.value.verdict,
  };
  edit(record);
  const tid = record.task_id as string;
  return {
    campaign_id: CAMPAIGN,
    group_id: refereeDecisionGroupId(tid),
    intent_id: refereeDecisionIntentId(tid),
    owner: "referee_adjudication_kernel",
    facet: "referee_provenance",
    cause: refereeDecisionCause(tid),
    rule: REFEREE_PHYSICAL_RULE,
    authority: { role: "role.archivist", permission: "permission.canon.write" },
    reads: record.input.refs.map((r: any) => ({ key: r.fact_key, version: r.version })),
    depends_on: [...new Set<string>(record.input.refs.map((r: any) => r.group_id))],
    writes: [
      write(refereeDecisionKey(tid), record, {
        owner: "referee_adjudication_kernel",
        facet: "referee_provenance",
        basis: "referee-host-decision",
        secrecy: "engine-internal",
      }),
    ],
    ...over,
  };
}

const refusedRaw = async (x: Ctx, g: CommitGroup) => {
  const head = x.c.store.head();
  const r = await x.c.store.commit(g);
  expect(r.ok).toBe(false);
  expect(x.c.store.head()).toEqual(head);
  expect(x.c.pcPhysicalLocusCustody(PC_ID)).toBeUndefined();
  return r.ok ? null : r.error;
};

describe("the owner path: only two qualifying, retained, engine-derived decisions let World-State commit the custody", () => {
  it("the lawful path commits one create-only custody; the identical retry is a replay; a different intent is a version conflict", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    expect(phys.verdict).toBe("PHYSICAL_ELIGIBLE");
    const first = await establish(x, phys.record.key);
    expect(first.ok).toBe(true);
    const head = x.c.store.head();
    const again = await establish(x, phys.record.key);
    expect(again.ok && again.value.replayed).toBe(true);
    expect(x.c.store.head()).toEqual(head);
    const dup = await establish(x, phys.record.key, 2);
    expect(!dup.ok && dup.error.code).toBe("VERSION_CONFLICT");
    expect(x.c.store.head()).toEqual(head);
    expect(x.c.verify()).toEqual([]);
    await x.c.close();
  }, 120_000);

  it("a physical decision that does not exist, one for the wrong operation, and a swapped pair are refused with nothing written", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const head = x.c.store.head();
    const bogus = refereeDecisionKey("f".repeat(64));
    const cases: [string, Promise<unknown>][] = [
      ["a decision that is not committed", establish(x, bogus)],
      ["an I-002 classification as the physical decision", establish(x, x.i002)],
      ["the native decision as the physical decision", establish(x, x.native)],
      [
        "the physical decision as the native decision",
        establish(x, phys.record.key, 3, { native_qualified_by: phys.record.key }),
      ],
      [
        "an I-002 classification as the native decision",
        establish(x, phys.record.key, 4, { native_qualified_by: x.i002 }),
      ],
    ];
    for (const [name, p] of cases) {
      const r = (await p) as { ok: boolean };
      expect(r.ok, name).toBe(false);
    }
    expect(x.c.store.head()).toEqual(head);
    expect(x.c.pcPhysicalLocusCustody(PC_ID)).toBeUndefined();
    await x.c.close();
  }, 120_000);

  it("a physical decision whose DERIVED verdict is not PHYSICAL_ELIGIBLE cannot qualify (the host's reading, not a flag, decides)", async () => {
    const x = await opened();
    const bad = await physicalDecision(
      x.c,
      { embodiment: { match: /ordinary human body/i, mode: "INCORPOREAL" } },
      1,
    );
    expect(bad.verdict).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
    const r = await establish(x, bad.record.key);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/physical placement is not qualified/);
    expect(x.c.pcPhysicalLocusCustody(PC_ID)).toBeUndefined();
    // the lawful decision for the same character then still qualifies it
    const good = await physicalDecision(x.c, {}, 0);
    expect((await establish(x, good.record.key, 2)).ok).toBe(true);
    await x.c.close();
  }, 120_000);

  it("another identity, and any caller-supplied locus, verdict, flag or extra field, are refused", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const head = x.c.store.head();
    expect((await establish(x, phys.record.key, 1, { pc_id: "pc-other" })).ok).toBe(false);
    for (const extra of [
      { stationary_locus: { world: WORLD_ID, locus: "locus-x" } },
      { verdict: "PHYSICAL_ELIGIBLE" },
      { physical: true },
      { world_id: WORLD_ID, locus_id: LOCUS_ID },
    ])
      expect((await establish(x, phys.record.key, 1, extra)).ok, JSON.stringify(extra)).toBe(false);
    expect(x.c.store.head()).toEqual(head);
    await x.c.close();
  }, 120_000);

  it("the host cannot lend authority: a physical decision is accepted only under role.gm + permission.rule.adjudicate", async () => {
    const x = await opened();
    const adapter = new RefereeAdjudicationAdapter(x.c.store);
    const task = adapter.physicalTask({ pc_id: PC_ID, attempt: 0 });
    if (!task.ok) throw new Error("no task");
    const answer = scriptedPolicy()({
      operation: "IR_PHYSICAL_PLACEMENT",
      task_id: task.value.task_id,
      context: task.value.context,
    });
    for (const operation of [
      { ...PLAYER_CHOICE_AUTHORITY },
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.gm", permission: "permission.canon.write" },
      "role.gm",
      null,
    ]) {
      const head = x.c.store.head();
      const r = await adapter.recordPhysical({
        operation,
        host: { host_id: HOST_ID, claimed_model: null },
        pc_id: PC_ID,
        attempt: 0,
        answer,
      });
      expect(!r.ok && r.error.code).toBe("AUTHORITY_DENIED");
      expect(x.c.store.head()).toEqual(head);
    }
    await x.c.close();
  }, 120_000);

  it("the same task with a different answer is a DECISION_CONFLICT that replaces nothing; the same answer is a replay", async () => {
    const x = await opened();
    const first = await physicalDecision(x.c);
    const adapter = new RefereeAdjudicationAdapter(x.c.store);
    const task = adapter.physicalTask({ pc_id: PC_ID, attempt: 0 });
    if (!task.ok) throw new Error("no task");
    const doc = {
      operation: "IR_PHYSICAL_PLACEMENT",
      task_id: task.value.task_id,
      context: task.value.context,
    };
    const base = {
      operation: { ...REFEREE_AUTHORITY },
      host: { host_id: HOST_ID, claimed_model: null },
      pc_id: PC_ID,
      attempt: 0,
    };
    const replay = await adapter.recordPhysical({ ...base, answer: scriptedPolicy()(doc) });
    expect(replay.ok && replay.value.disposition).toBe("REPLAYED");
    const other = await adapter.recordPhysical({
      ...base,
      answer: scriptedPolicy({ physical: { embodiment: { match: /body/i, mode: "INCORPOREAL" } } })(
        doc,
      ),
    });
    expect(!other.ok && other.error.code).toBe("DECISION_CONFLICT");
    expect(first.verdict).toBe("PHYSICAL_ELIGIBLE");
    expect(x.c.store.getFact(first.record.key)!.version).toBe(1);
    await x.c.close();
  }, 120_000);
});

describe("a raw store.commit cannot bypass the rule", () => {
  it("the unmodified mechanical group is the lawful one (control)", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const r = await x.c.store.commit(rawCustody(x, phys.record.key, 1));
    expect(r.ok).toBe(true);
    expect(x.c.verify()).toEqual([]);
    await x.c.close();
  }, 120_000);

  it("stale or forged pins, another locus, another world, a smuggled coupling or field, another basis — every one is refused", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const edits: Record<string, (v: any) => void> = {
      "contract pin moved": (v) => (v.basis.pinned_versions.pc += 1),
      "binding pin moved": (v) => (v.basis.pinned_versions.binding += 1),
      "world pin moved": (v) => (v.basis.pinned_versions.world += 1),
      "locus pin moved": (v) => (v.basis.pinned_versions.locus += 1),
      "decision version moved": (v) => (v.basis.qualified_by.physical.version += 1),
      "native decision swapped for the I-002 classification": (v) =>
        (v.basis.qualified_by.native.fact_key = x.i002),
      "locus moved": (v) => {
        v.stationary_locus.locus = {
          fact_key: worldLocusKey(WORLD_ID, "locus-x"),
          entity_id: "locus-x",
        };
      },
      "another identity": (v) => (v.pc_id = "pc-other"),
      "a handover basis on an activated PC": (v) => {
        v.basis = {
          established_from: "EXISTING_ACTOR_HANDOVER",
          pinned_versions: { ...v.basis.pinned_versions, coupling: 1 },
        };
      },
      "a smuggled coupling pin": (v) => (v.basis.pinned_versions.coupling = 1),
      "a smuggled movement": (v) => (v.movement = { to: "locus-x" }),
      "a second locus": (v) => (v.binding_locus = v.stationary_locus),
      "custodian changed": (v) => (v.custodian.owner = "logistics"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const err = await refusedRaw(x, rawCustody(x, phys.record.key, 1, edit));
      expect(err, name).not.toBeNull();
    }
    await x.c.close();
  }, 120_000);

  it("the group must read and depend on both qualifying decisions, and be written under its own exclusive governing citation", async () => {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const withoutRead =
      (key: string) =>
      (g: CommitGroup): Partial<CommitGroup> => ({
        reads: g.reads.filter((r) => r.key !== key),
      });
    const base = rawCustody(x, phys.record.key, 1);
    await refusedRaw(
      x,
      rawCustody(x, phys.record.key, 1, undefined, withoutRead(phys.record.key)(base)),
    );
    await refusedRaw(x, rawCustody(x, phys.record.key, 1, undefined, withoutRead(x.native)(base)));
    await refusedRaw(
      x,
      rawCustody(x, phys.record.key, 1, undefined, { depends_on: base.depends_on.slice(1) }),
    );
    // the predecessor handover citation is not the original-activation one, and the reverse
    const e = await refusedRaw(
      x,
      rawCustody(x, phys.record.key, 1, undefined, { rule: WORLD_PC_LOCUS_CUSTODY_RULE }),
    );
    expect(e?.message).toMatch(/governing citation/);
    await x.c.close();
  }, 120_000);

  it("a physical decision written under another citation, with a verdict its answer does not derive, or citing other facts, is refused", async () => {
    const x = await opened();
    await physicalDecision(x.c); // the lawful decision (attempt 0) is committed; the forgeries below are fresh attempts
    const lawful = physicalRecordGroup(x, 3, {});
    // control: the mechanical group for a fresh attempt is admitted
    const probe = physicalRecordGroup(x, 4, {});
    expect((await x.c.store.commit(probe)).ok).toBe(true);
    const head = x.c.store.head();
    const forgeries: Record<string, CommitGroup> = {
      "under the I-002/IR citation instead of its own exclusive one": physicalRecordGroup(
        x,
        5,
        {},
        undefined,
        { rule: REFEREE_RULE },
      ),
      "a verdict its answer does not derive": physicalRecordGroup(
        x,
        6,
        { embodiment: { match: /body/i, mode: "INCORPOREAL" } },
        (r) => {
          r.verdict = "PHYSICAL_ELIGIBLE";
        },
      ),
      "a verdict that is not a physical one": physicalRecordGroup(x, 7, {}, (r) => {
        r.verdict = "BIND_ELIGIBLE";
      }),
      "other cited facts (the binding left out)": physicalRecordGroup(x, 8, {}, (r) => {
        r.input.refs = r.input.refs.filter((x: any) => x.fact_key !== PLAYER_CHARACTER_BINDING_KEY);
      }),
      "another statement than the binding's": physicalRecordGroup(x, 9, {}, (r) => {
        r.input.statement = "I stand elsewhere.";
      }),
      "the wrong authority": physicalRecordGroup(x, 10, {}, (r) => {
        r.authority = { ...PLAYER_CHOICE_AUTHORITY };
      }),
    };
    for (const [name, g] of Object.entries(forgeries)) {
      const r = await x.c.store.commit(g);
      expect(r.ok, name).toBe(false);
      expect(x.c.store.head(), name).toEqual(head);
    }
    void lawful;
    await x.c.close();
  }, 120_000);
});

describe("the one rule, judged on the committed facts", () => {
  async function committed() {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    const g = rawCustody(x, phys.record.key, 1);
    const value = structuredClone(g.writes[0]!.value) as any;
    const facts = new Map(x.c.store.listFacts().map((f) => [f.key, f]));
    return { x, value, facts, phys };
  }
  const judge = (v: any, facts: Map<string, any>) => pcPhysicalLocusCustodyViolation(KEY, v, facts);

  it("holds for the mechanical record; fails for any single missing or contradictory upstream fact", async () => {
    const { x, value, facts, phys } = await committed();
    expect(judge(value, facts)).toBeNull();
    const without = (k: string) => {
      const m = new Map(facts);
      m.delete(k);
      return m;
    };
    for (const k of [
      PLAYER_CHARACTER_BINDING_KEY,
      pcExistenceContractKey(PC_ID),
      worldProfileKey(WORLD_ID),
      worldLocusKey(WORLD_ID, LOCUS_ID),
      x.native,
      phys.record.key,
    ])
      expect(judge(value, without(k)), k).not.toBeNull();
    await x.c.close();
  }, 120_000);

  it("is the slot of its own identity, and is exclusive of the handover basis", async () => {
    const { x, value, facts } = await committed();
    expect(
      pcPhysicalLocusCustodyViolation(worldPcLocusCustodyKey("pc-other"), value, facts),
    ).toMatch(/slot derived from its PC identity/);
    const asHandover = structuredClone(value);
    asHandover.basis = {
      established_from: "EXISTING_ACTOR_HANDOVER",
      pinned_versions: { ...value.basis.pinned_versions, coupling: 1 },
    };
    expect(judge(asHandover, facts)).toMatch(
      /handover-basis custody is established only after the completed/,
    );
    await x.c.close();
  }, 120_000);

  it("a freshly authored PC has no actor coupling and no existing-actor compilation; a coupling for its identity refuses the original basis", async () => {
    const { x, value, facts } = await committed();
    const coupled = new Map(facts).set(
      worldActorCouplingKey(PC_ID),
      facts.get(PLAYER_CHARACTER_BINDING_KEY)!,
    );
    expect(judge(value, coupled)).toMatch(/no actor coupling/);
    await x.c.close();
  }, 120_000);

  it("exactly one authority answers where the PC is: a fallback entity, ECT-01 transition or Logistics commitment/transfer under its identity refuses", async () => {
    const { x, value, facts } = await committed();
    const rival = new Map(facts).set(
      worldFallbackEntityKey(WORLD_ID, PC_ID),
      facts.get(PLAYER_CHARACTER_BINDING_KEY)!,
    );
    expect(judge(value, rival)).toMatch(/another current-locus authority/);
    await x.c.close();
  }, 120_000);

  it("the native decision must be the one that qualifies THIS binding's statement at its pins; the physical one must be eligible and over the same statement", async () => {
    const { x, value, facts, phys } = await committed();
    const edit = (key: string, f: (v: any) => void) => {
      const fact = structuredClone(facts.get(key)!);
      f(fact.value);
      return new Map(facts).set(key, fact);
    };
    expect(
      judge(
        value,
        edit(x.native, (v) => (v.verdict = "UNRESOLVED")),
      ),
    ).toMatch(/native presence is not qualified/);
    expect(
      judge(
        value,
        edit(x.native, (v) => (v.input.statement = "I stand elsewhere.")),
      ),
    ).toMatch(/native presence is not qualified/);
    expect(
      judge(
        value,
        edit(phys.record.key, (v) => (v.verdict = "PHYSICAL_UNRESOLVED")),
      ),
    ).toMatch(/physical placement is not qualified/);
    expect(
      judge(
        value,
        edit(phys.record.key, (v) => (v.input.statement = "I stand elsewhere.")),
      ),
    ).toMatch(/physical placement is not qualified/);
    expect(
      judge(
        value,
        edit(phys.record.key, (v) => (v.input.refs[1].version = 2)),
      ),
    ).toMatch(/physical placement is not qualified/);
    expect(
      judge(
        value,
        edit(phys.record.key, (v) => (v.subject.pc_id = "pc-other")),
      ),
    ).toMatch(/physical placement is not qualified/);
    await x.c.close();
  }, 120_000);
});

describe("a package built OUTSIDE admission fails closed on load", () => {
  /** Replays every committed group of a real campaign into a store with NO admission, then appends one forged group. */
  async function rogue(
    forge: (x: Ctx, physical: string, tamperedPhysical: string) => Promise<CommitGroup[]>,
    editReplayed: (g: CommitGroup, physical: string) => CommitGroup = (g) => g,
  ): Promise<string> {
    const x = await opened();
    const phys = await physicalDecision(x.c);
    // a second, lawful decision whose derived verdict is NOT eligible (a fresh attempt is a fresh task)
    const bad = await physicalDecision(
      x.c,
      { embodiment: { match: /body/i, mode: "INCORPOREAL" } },
      1,
    );
    const forged = await forge(x, phys.record.key, bad.record.key);
    const groups: CommitGroup[] = [];
    const seen = new Set<string>();
    const facts = [...x.c.store.listFacts()].sort(
      (a, b) =>
        (x.c.store.lookupReceipt(a.provenance.intent_id)?.revision ?? 0) -
        (x.c.store.lookupReceipt(b.provenance.intent_id)?.revision ?? 0),
    );
    for (const f of facts) {
      if (seen.has(f.provenance.intent_id)) continue;
      seen.add(f.provenance.intent_id);
      groups.push(editReplayed(x.c.store.committedGroup(f.provenance.intent_id)!, phys.record.key));
    }
    await x.c.close();
    const dir = join(tempDir(), "rogue");
    mkdirSync(join(dir, ".."), { recursive: true });
    const created = await createFileCampaign(dir, {
      campaignId: CAMPAIGN,
      owners: CANONICAL_OWNER_REGISTRY,
    });
    if (!created.ok) throw new Error(created.error.message);
    const s = created.value;
    for (const g of [...groups, ...forged]) {
      const r = await s.commit(g);
      if (!r.ok) throw new Error(`replay failed: ${r.error.code} ${r.error.message}`);
    }
    await s.close();
    return dir;
  }
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { buildId: "rogue-test" });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("the lawful custody replayed outside admission opens (control)", async () => {
    const dir = await rogue(async (x, phys) => [rawCustody(x, phys, 1)]);
    expect(await openOutcome(dir)).toBe("OK");
  }, 180_000);

  it("a custody that cites a decision whose derived verdict is not eligible is refused on load", async () => {
    const dir = await rogue(async (x, _phys, bad) => [rawCustody(x, bad, 1)]);
    expect(await openOutcome(dir)).toMatch(/PC_LOCUS_CUSTODY_STATE/);
  }, 180_000);

  it("a custody under the predecessor handover citation is refused on load: each basis carries its own", async () => {
    const dir = await rogue(async (x, phys) => [
      rawCustody(x, phys, 1, undefined, { rule: WORLD_PC_LOCUS_CUSTODY_RULE }),
    ]);
    expect(await openOutcome(dir)).toMatch(/PC_LOCUS_CUSTODY_STATE/);
  }, 180_000);

  it("a custody that never read or depended on a qualifying decision is refused on load", async () => {
    const dir = await rogue(async (x, phys) => {
      const g = rawCustody(x, phys, 1);
      return [
        {
          ...g,
          reads: g.reads.filter((r) => r.key !== phys),
          depends_on: g.depends_on,
        },
      ];
    });
    expect(await openOutcome(dir)).toMatch(/PC_LOCUS_CUSTODY_STATE/);
  }, 180_000);

  it("a physical decision committed under the I-002/IR citation (not its own exclusive one) is refused on load", async () => {
    const dir = await rogue(
      async (x, phys) => [rawCustody(x, phys, 1)],
      (g, phys) => (g.writes[0]!.key === phys ? { ...g, rule: REFEREE_RULE } : g),
    );
    expect(await openOutcome(dir)).toMatch(/REFEREE_STATE/);
  }, 180_000);
});
