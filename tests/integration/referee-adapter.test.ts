// The engine's referee owner path and its consumers, exercised directly on a campaign whose world and locus came from the shipped
// `establish-locality`. The "host answers" are hand-written by the test: they prove the OWNER path (authority first, validation,
// derived verdict, create-only retention, replay/conflict, consumer enforcement and integrity), not any AI judgment.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  type RefereeDecisionRecord,
  refereeDecisionKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  factKind,
  recordContextViolation,
  refereeCandidateItems,
} from "@immortalis/engine";
import { EMPTY_DRAFT, compileContract, type CharacterDraft } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN } from "../support/locality.ts";
import {
  HOST_ID,
  PC_ID,
  WORDS,
  WORLD_ID,
  LOCUS_ID,
  localityCampaign,
  plainPolicy,
  scriptedPolicy,
} from "../support/original-pc.ts";

const draft: CharacterDraft = {
  ...EMPTY_DRAFT,
  identity: WORDS.identityFinal,
  contact: { kind: "CONTACT_ANCHOR", surfaces: [WORDS.contact] },
  embodiment: WORDS.embodiment,
  continuity: WORDS.continuity,
};
const OTHER: CharacterDraft = {
  ...draft,
  identity: "Tobias Reed, a human ferryman of fifty winters",
};

const host = { host_id: HOST_ID, claimed_model: null };
const pub = (name: string) => ({
  group_id: `g:${name}`,
  intent_id: `i:${name}`,
  cause: `c:${name}`,
  basis: "test",
  secrecy: "test",
});

async function open(dir: string): Promise<CanonicalCampaign> {
  const opened = await CanonicalCampaign.open(dir, { buildId: "test-independent" });
  if (!opened.ok) throw new Error("did not open");
  return opened.value;
}

/** The scripted answer for a task of the adapter (plumbing only). */
const answerFor = (
  a: RefereeAdjudicationAdapter,
  d: CharacterDraft,
  policy = plainPolicy,
  attempt = 0,
) => {
  const items = refereeCandidateItems(compileContract(PC_ID, d)!);
  const { context, task_id } = a.i002Task({ pc_id: PC_ID, attempt, items });
  return {
    items,
    answer: policy({ operation: "I002_CLASSIFY", task_id, context }) as never,
  };
};

describe("the referee owner path", () => {
  it("applies role.gm + permission.rule.adjudicate from the trusted operation FIRST: no other authority, and nothing in an answer, mints it", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const { items, answer } = answerFor(a, draft);
      const before = c.store.head().revision;
      for (const operation of [
        { ...PLAYER_CHOICE_AUTHORITY },
        { ...CANON_WRITE_AUTHORITY },
        { role: "role.gm", permission: "permission.player_choice.commit" },
        { role: "role.player", permission: "permission.rule.adjudicate" },
        { role: "role.gm" },
        null,
        "role.gm",
      ]) {
        const r = await a.recordI002({ operation, host, pc_id: PC_ID, attempt: 0, items, answer });
        expect(r.ok, JSON.stringify(operation)).toBe(false);
        expect(!r.ok && r.error.code).toBe("AUTHORITY_DENIED");
      }
      // a role label smuggled inside the answer changes nothing: the answer is strict
      const smuggled = {
        ...(answer as object),
        role: "role.gm",
        authority: { ...REFEREE_AUTHORITY },
      };
      const r = await a.recordI002({
        operation: { ...PLAYER_CHOICE_AUTHORITY },
        host,
        pc_id: PC_ID,
        attempt: 0,
        items,
        answer: smuggled,
      });
      expect(r.ok).toBe(false);
      expect(c.store.head().revision).toBe(before);
    } finally {
      await c.close();
    }
  }, 60_000);

  it("retains one create-only decision; the same answer replays, a different one for the same task conflicts, nothing is replaced", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const { items, answer } = answerFor(a, draft);
      const input = { operation: { ...REFEREE_AUTHORITY }, host, pc_id: PC_ID, attempt: 0, items };
      const first = await a.recordI002({ ...input, answer });
      expect(first.ok && first.value.disposition).toBe("COMMITTED");
      expect(first.ok && first.value.verdict).toBe("CLOSED");
      const revision = c.store.head().revision;
      const again = await a.recordI002({ ...input, answer });
      expect(again.ok && again.value.disposition).toBe("REPLAYED");
      expect(c.store.head().revision).toBe(revision);

      const changed = {
        ...(answer as { items: Record<string, unknown>[] }),
        items: (answer as { items: Record<string, unknown>[] }).items.map((i, n) =>
          n === 0 ? { ...i, grounds: "a different reasoning" } : i,
        ),
      };
      const conflict = await a.recordI002({ ...input, answer: changed });
      expect(!conflict.ok && conflict.error.code).toBe("DECISION_CONFLICT");
      expect(c.store.head().revision).toBe(revision);
      expect(a.decision(first.ok ? first.value.task_id : "")?.value.verdict).toBe("CLOSED");
      expect(
        c.store.getFact(refereeDecisionKey(first.ok ? first.value.task_id : "")),
      ).toBeDefined();
    } finally {
      await c.close();
    }
  }, 60_000);

  it("refuses an IR decision when the committed world, locus or character is missing, and never takes a world fact from the caller", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const r = a.irTask({
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        attempt: 0,
        statement: WORDS.presence,
      });
      // the character is not released yet
      expect(!r.ok && r.error.code).toBe("CONTEXT_UNAVAILABLE");
    } finally {
      await c.close();
    }
  }, 60_000);
});

describe("consumer enforcement: a release or binding is only as good as the decision it cites", () => {
  it("a release citing a BLOCKED, another candidate's, an unknown or no decision is refused by the engine (or by the operator); one citing its own CLOSED decision lands", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const operation = { ...REFEREE_AUTHORITY };

      // a decision that did not close the candidate
      const blockedPolicy = scriptedPolicy({
        classify: [{ match: /human/, class: "WORLD_STATE_ASSERTION" }],
      });
      const blocked = answerFor(a, draft, blockedPolicy);
      const b = await a.recordI002({
        operation,
        host,
        pc_id: PC_ID,
        attempt: 0,
        items: blocked.items,
        answer: blocked.answer,
      });
      expect(b.ok && b.value.verdict).toBe("BLOCKED");

      // a CLOSED decision, but of ANOTHER candidate
      const other = answerFor(a, OTHER);
      const o = await a.recordI002({
        operation,
        host,
        pc_id: PC_ID,
        attempt: 0,
        items: other.items,
        answer: other.answer,
      });
      expect(o.ok && o.value.verdict).toBe("CLOSED");

      const contract = compileContract(PC_ID, draft)!;
      for (const [name, key] of [
        ["a blocked decision", b.ok ? b.value.record.key : ""],
        ["another candidate's closed decision", o.ok ? o.value.record.key : ""],
        ["an unknown decision", refereeDecisionKey("a".repeat(64))],
      ] as const) {
        const before = c.store.head().revision;
        const r = await c.releasePlayerCharacter({
          ...pub(`release-${name}`),
          contract,
          qualified_by: key,
        });
        expect(r.ok, name).toBe(false);
        expect(c.store.head().revision, name).toBe(before);
      }

      // its own closed decision (the question asked again: the next attempt is another task)
      const own = answerFor(a, draft, plainPolicy, 1);
      const k = await a.recordI002({
        operation,
        host,
        pc_id: PC_ID,
        attempt: 1,
        items: own.items,
        answer: own.answer,
      });
      expect(k.ok && k.value.verdict).toBe("CLOSED");
      const released = await c.releasePlayerCharacter({
        ...pub("release-own"),
        contract,
        qualified_by: k.ok ? k.value.record.key : "",
      });
      expect(released.ok).toBe(true);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 60_000);

  it("a binding is refused unless its cited IR decision is BIND_ELIGIBLE for exactly this statement; a conflict decision never qualifies", async () => {
    const dirs = await localityCampaign((d) => {
      d.world.premise = "A marsh in which no human has ever lived.";
    });
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const operation = { ...REFEREE_AUTHORITY };
      const own = answerFor(a, draft);
      const k = await a.recordI002({
        operation,
        host,
        pc_id: PC_ID,
        attempt: 0,
        items: own.items,
        answer: own.answer,
      });
      const released = await c.releasePlayerCharacter({
        ...pub("release"),
        contract: compileContract(PC_ID, draft)!,
        qualified_by: k.ok ? k.value.record.key : "",
      });
      expect(released.ok).toBe(true);

      const statement = WORDS.presence;
      const task = a.irTask({
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        attempt: 0,
        statement,
      });
      if (!task.ok) throw new Error("no task");
      const asIr = (policy: Parameters<typeof scriptedPolicy>[0]) =>
        scriptedPolicy(policy)({
          operation: "IR_NATIVE_COMPATIBILITY",
          task_id: task.value.task_id,
          context: task.value.context,
        }) as never;

      const conflict = await a.recordIr({
        operation,
        host,
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        attempt: 0,
        statement,
        answer: asIr({ ir: { contradicts: /no human has ever lived/ } }),
      });
      expect(conflict.ok && conflict.value.verdict).toBe("WORLD_CONFLICT");
      const insertion = {
        bridge: "NATIVE_ALREADY_THERE",
        established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
        authored_under: { ...PLAYER_CHOICE_AUTHORITY },
        statement,
      } as const;
      const before = c.store.head().revision;
      const refused = await c.bindPlayerCharacter({
        ...pub("bind-conflict"),
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        insertion,
        qualified_by: conflict.ok ? conflict.value.record.key : "",
      });
      expect(refused.ok).toBe(false);
      expect(c.store.head().revision).toBe(before);
      expect(c.binding()).toBeUndefined();
    } finally {
      await c.close();
    }
  }, 60_000);
});

describe("integrity re-derives what a retained decision claims", () => {
  it("a campaign holding a coherent decision verifies; the identity of the question is a function of its text", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const { items, answer } = answerFor(a, draft);
      const r = await a.recordI002({
        operation: { ...REFEREE_AUTHORITY },
        host,
        pc_id: PC_ID,
        attempt: 0,
        items,
        answer,
      });
      expect(r.ok).toBe(true);
      expect(c.verify()).toEqual([]);
      const t0 = a.i002Task({ pc_id: PC_ID, attempt: 0, items });
      const t1 = a.i002Task({ pc_id: PC_ID, attempt: 1, items });
      expect(t0.task_id).not.toBe(t1.task_id);
      expect(t0.task_id).toBe(a.i002Task({ pc_id: PC_ID, attempt: 0, items }).task_id);
      expect(createHash("sha256").update(t0.task_id).digest("hex")).toHaveLength(64);
      expect(LOCALITY_CAMPAIGN).toBe(t0.context.campaign_id);
    } finally {
      await c.close();
    }
  }, 60_000);
});

describe("R3-4: a later version of a cited fact never stops the verification of a retained record", () => {
  it("the cited kinds are SEALED, so a later version cannot be admitted on the supported path", () => {
    for (const id of ["world_profile", "world_locus", "pc_existence_contract"] as const)
      expect(factKind(id).lifecycle, id).toBe("SEALED");
  });

  it("defence in depth: against facts reported at a newer version the record is still verified on what it retains (a tampered verdict or statement digest is not skipped)", async () => {
    const dirs = await localityCampaign();
    const c = await open(dirs.campaignDir);
    try {
      const a = new RefereeAdjudicationAdapter(c.store);
      const operation = { ...REFEREE_AUTHORITY };
      const own = answerFor(a, draft);
      const k = await a.recordI002({
        operation,
        host,
        pc_id: PC_ID,
        attempt: 0,
        items: own.items,
        answer: own.answer,
      });
      await c.releasePlayerCharacter({
        ...pub("release"),
        contract: compileContract(PC_ID, draft)!,
        qualified_by: k.ok ? k.value.record.key : "",
      });
      const statement = WORDS.presence;
      const task = a.irTask({
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        attempt: 0,
        statement,
      });
      if (!task.ok) throw new Error("no task");
      const ir = await a.recordIr({
        operation,
        host,
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        attempt: 0,
        statement,
        answer: scriptedPolicy()({
          operation: "IR_NATIVE_COMPATIBILITY",
          task_id: task.value.task_id,
          context: task.value.context,
        }) as never,
      });
      if (!ir.ok) throw new Error("not recorded");
      const record = a.decision(ir.value.task_id)!.value;

      const current = (key: string) => c.store.getFact(key);
      const newer = (key: string) => {
        const f = current(key);
        return f ? { ...f, version: f.version + 1 } : f;
      };
      // as committed: coherent
      expect(recordContextViolation(record, current)).toBeNull();
      // facts at a LATER version: a coherent record is still not invalidated ...
      expect(recordContextViolation(record, newer)).toBeNull();
      // ... but the verification does not stop there: a tampered verdict, task binding or statement digest is still found
      const tampered = (over: Partial<RefereeDecisionRecord>) =>
        ({ ...record, ...over }) as RefereeDecisionRecord;
      expect(recordContextViolation(tampered({ verdict: "WORLD_CONFLICT" }), newer)).not.toBeNull();
      expect(recordContextViolation(tampered({ task_id: "a".repeat(64) }), newer)).not.toBeNull();
      expect(
        recordContextViolation(
          tampered({ input: { ...record.input, statement_digest: "0".repeat(64) } }),
          newer,
        ),
      ).not.toBeNull();
      // an EARLIER version than cited, or an absent fact, remains stale/unavailable
      const older = (key: string) => {
        const f = current(key);
        return f ? { ...f, version: f.version - 1 } : f;
      };
      expect(recordContextViolation(record, older)?.stale).toBe(true);
      expect(recordContextViolation(record, () => undefined)?.code).toBe("CONTEXT_UNAVAILABLE");
    } finally {
      await c.close();
    }
  }, 60_000);
});
