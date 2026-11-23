/* eslint-disable @typescript-eslint/no-explicit-any -- the harness pokes at raw groups, facts, journal bytes and stores */
// F-014B B1 S1, repair round 1 — a transaction whose player+literal AUTHORITY was lawfully opened before S1, with NO credited stage and NO
// sealed record, must still be able to finish exactly once; a fresh, unbacked stage-free player+literal seal must still be refused.
//
//   [existing law]  behaviour of the build that preceded S1, on FROZEN packages written by that build (tests/fixtures/b1-s1-frozen):
//                     authority-only                   the authority is the head; the first owner stage never committed; no seal
//                     authority-then-stage-free-seal   authority, the owner stage refused (not credited), a stage-free seal over that authority
//   [s1 guard]      the live admission after the repair: the one completion exception, and every refusal around it
//   [pure]          the kernel check (`temporalGroupCheck`) on a hand-built committed state, where the real store cannot reach the state
//
// Design rule: every negative is ONE change from an accepted control. A raw kernel commit is a group the unchanged coordinator built in one
// private copy of a campaign, with ONE field changed, committed straight to the store of a second private copy at the same pre-state; the
// trusted gateway reaches the same group by rewriting it in flight. A refusal must leave the campaign exactly as it was: same head, same
// facts (so same canonical time, same authority, no credited stage), same receipts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  Id,
  gipInstrumentKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  canonicalAdmission,
  temporalGroupCheck,
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
  transactionIntentId,
  verifyTemporalIntegrity,
} from "@immortalis/engine";
import { INSTRUMENT_A, at } from "@immortalis/testkit";
import { temporalOriginPairing } from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import {
  GM_TRIGGER,
  GUARD_MESSAGE,
  NEAR_MISS_TRIGGERS,
  ORDINARY_TRIGGER,
  PLAYER,
  REFUSED,
  capture,
  coordinatorOn,
  copyOf,
  gatewayRig,
  gatewayTemplate,
  isAuthorityGroup,
  isSealGroup,
  literalTransaction,
  log,
  manifestOf,
  identityBeforeB2,
  stampCheckpointPolicy,
  openUnder,
  probeCommits,
  reopenMatrix,
  request,
  summary,
  thaw,
  viaGateway,
  withContext,
  withTriggerKind,
  type OldJournal,
  type Rig,
} from "../support/b1-s1-rigs.ts";
import { B1_S1_FROZEN_PACKAGES } from "../support/b1-s1-frozen-fixtures.ts";
import { advanceOriginal, trustedOriginalHeld } from "../support/original-pc-target.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_TX,
  PC_TARGET_TX2,
  PC_TARGET_UNKNOWN,
  crashWhen,
  pcTargetTransaction,
  refuseGipStageOf,
} from "../support/pc-target-advance.ts";
import { SUNSET_LATER } from "../support/gip-sunset.ts";
import { must } from "../support/temporal.ts";

const OLD = PC_TARGET_TX; // the old transaction: the shipped gateway's transaction id
const SHORT_OF_SUNSET: CanonicalTime = at(120); // nothing is due: the transaction has no owner stage at all
const PAD = 130; // enough ordinary commits that a checkpoint lies after the completed record

let SUNSET_TEMPLATE: string;
let AUTH_ONLY: OldJournal;
let AUTH_SEAL: OldJournal;
let INTERRUPTED: OldJournal;
/** The stage-free seal group the UNCHANGED coordinator builds over the old authority when its owner stage is refused again. */
let REAL_SEAL: CommitGroup;
/** The stage-BEARING seal group the unchanged coordinator builds over the interrupted authority (its credited stage is durable). */
let STAGE_SEAL: CommitGroup;

const rig = (dir: string) => gatewayRig(SUNSET_TEMPLATE, canonicalAdmission, dir);
const oldRig = () => rig(copyOf(AUTH_ONLY.dir));

const sealWriteOf = (g: CommitGroup) =>
  g.writes.find((w) => /^temporal\/transaction\//.test(w.key))!;
const isSeal = (g: CommitGroup) => isSealGroup(g) && !isAuthorityGroup(g);
const isOwnerStage = (g: CommitGroup) =>
  g.writes.some((w) => w.key === gipInstrumentKey(INSTRUMENT_A)) &&
  !g.writes.some((w) => w.key.startsWith("temporal/"));

/** The same group with the transaction value (and the transaction write's labels) edited; every other field is untouched. */
const editSeal = (
  g: CommitGroup,
  edit: (value: any, labels: { basis: string; secrecy: string }) => void,
): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (!/^temporal\/transaction\//.test(w.key)) return w;
    const value = structuredClone(w.value) as any;
    const labels = { basis: w.basis, secrecy: w.secrecy };
    edit(value, labels);
    return { ...w, value, ...labels };
  }),
});

/** The same group with the temporal state write edited; every other field is untouched. */
const withStateWrite = (g: CommitGroup, edit: (state: any) => void): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== "temporal/state") return w;
    const value = structuredClone(w.value) as any;
    edit(value);
    return { ...w, value };
  }),
});

type Facts = Map<string, OwnerFact>;
/** A hand-built committed state from a store's facts (clone), after `edit`. The real store cannot reach a state edited this way. */
const stateOf = (
  store: { listFacts(): readonly OwnerFact[]; head(): { campaign_id: string; revision: number } },
  edit: (facts: Facts) => void = () => undefined,
) => {
  const facts: Facts = new Map(store.listFacts().map((f) => [f.key, structuredClone(f)]));
  edit(facts);
  const head = store.head();
  return { campaign_id: head.campaign_id, revision: head.revision, facts };
};
const authKey = (id = OLD) => temporalTransactionAuthorityKey(id);
const editAuthority =
  (id: string, edit: (fact: OwnerFact, value: any) => void) =>
  (facts: Facts): void => {
    const fact = facts.get(authKey(id))!;
    edit(fact, fact.value as any);
  };

const journalGroupIds = (dir: string): string[] =>
  readFileSync(join(dir, "journal.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l).group.group_id as string);

/** The exact request the shipped gateway states for the old transaction, read back from the stored authority (nothing re-typed). */
const exactRequest = (j: OldJournal) => {
  const a = j.captures[OLD]!.authority!.value as any;
  return {
    transaction_id: a.transaction_id,
    cause: a.cause,
    trigger: a.trigger,
    continues: a.continues,
    requested: a.requested,
    context: a.context,
    publication: a.publication,
  };
};

/** Runs the old transaction through the shipped gateway with its owner stage refused again; returns the commit probe. */
async function completeStageFree(r: Rig, rewrite?: (g: CommitGroup) => CommitGroup) {
  const restoreStage = refuseGipStageOf(r);
  const probe = probeCommits(r.campaign, rewrite);
  const out = await viaGateway(r, literalTransaction());
  probe.restore();
  restoreStage();
  return { out, probe };
}

beforeAll(async () => {
  SUNSET_TEMPLATE = await gatewayTemplate();
  [AUTH_ONLY, AUTH_SEAL, INTERRUPTED] = [
    thaw("authority-only"),
    thaw("authority-then-stage-free-seal"),
    thaw("interrupted"),
  ];
  // the groups are captured as the coordinator builds them, whatever the kernel then says of them: the tests below judge the verdicts
  const a = await oldRig();
  const done = await completeStageFree(a);
  REAL_SEAL = structuredClone(done.probe.seen.find((s) => isSeal(s.group))!.group);
  await a.campaign.close();
  const b = await rig(copyOf(INTERRUPTED.dir));
  const probe = probeCommits(b.campaign);
  await viaGateway(b, literalTransaction());
  STAGE_SEAL = structuredClone(probe.seen.find((s) => isSeal(s.group))!.group);
  await b.campaign.close();
}, 600_000);

// ===========================================================================================================================
describe("R1-A the frozen pre-S1 evidence: a lawfully committed player+literal authority with no credited stage and no seal", () => {
  it("[existing law] authority-only: the authority is the head of the journal, under the player pair and the literal; no stage was credited and nothing was sealed", async () => {
    const row = B1_S1_FROZEN_PACKAGES["authority-only"];
    const c = AUTH_ONLY.captures[OLD]!;
    const a = c.authority!.value as any;
    expect(AUTH_ONLY.headRevision).toBe(row.headRevision);
    expect(c.authorityReceipt!.revision).toBe(row.authorityRevision);
    expect(c.authorityReceipt!.revision).toBe(AUTH_ONLY.headRevision); // the authority-open is the last durable commit
    expect(a.trigger.kind).toBe(GM_TRIGGER);
    expect(a.context).toEqual(PLAYER);
    expect(temporalOriginPairing(a.context, a.trigger.kind)).toBe("DENY"); // the unphased classifier would call it DENY; the pre-S1 build wrote it
    expect(c.seal).toBeNull();
    expect(c.sealReceipt).toBeNull();
    // no credited stage: the owner's instrument was never advanced, and no fact of this campaign is a sealed transaction of it
    const facts = AUTH_ONLY.summary.facts as readonly OwnerFact[];
    expect(facts.find((f) => f.key === gipInstrumentKey(INSTRUMENT_A))!.version).toBe(1);
    expect(facts.some((f) => f.key === temporalTransactionKey(OLD))).toBe(false);
    expect(facts.some((f) => f.provenance.group_id.startsWith("stage-group:"))).toBe(false);
    // the authority is the canonical authority group of the transaction (identities derived from the transaction alone)
    const fact = c.authority!;
    expect(fact.provenance.group_id).toBe(transactionAuthorityGroupId(OLD));
    expect(fact.provenance.intent_id).toBe(transactionAuthorityIntentId(OLD));
    expect(fact.provenance.cause).toBe(transactionCause(OLD));
    // saved under the identity before the one segment F-014B B2 appended (the first open under the current identity replays strictly, once)
    expect(manifestOf(AUTH_ONLY.dir).head.checkpoint.verification_policy).toBe(
      identityBeforeB2(canonicalAdmission.historyVerificationId!),
    );
  });

  it("[existing law] authority-only: WARM, COLD (audit) and COLD (checkpoint invalidated) reopen under S1 keep the exact authority, every receipt and the whole-campaign history", async () => {
    const m = await reopenMatrix(AUTH_ONLY.dir, canonicalAdmission, [OLD]);
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(AUTH_ONLY.summary);
      expect(o.captures![OLD], mode).toEqual(AUTH_ONLY.captures[OLD]);
    }
    // the whole journal is judged by the historical verifier in every mode (the checkpoint is the genesis one)
    for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const) {
      expect(m[mode].calls, mode).toBe(AUTH_ONLY.headRevision);
      expect(
        [...m[mode].verdicts!.values()].every((v) => v === null),
        mode,
      ).toBe(true);
    }
  });

  it("[existing law] authority-then-stage-free-seal: the unchanged build sealed the transaction with stages [] over its own authority, which the seal group neither read nor depended on", () => {
    const row = B1_S1_FROZEN_PACKAGES["authority-then-stage-free-seal"];
    const c = AUTH_SEAL.captures[OLD]!;
    const v = c.seal!.value as any;
    expect(AUTH_SEAL.headRevision).toBe(row.headRevision);
    expect(c.authorityReceipt!.revision).toBe(row.authorityRevision);
    expect(c.sealReceipt!.revision).toBe(row.sealRevision);
    expect(AUTH_SEAL.revisions[PC_TARGET_TX2]).toBe(row.continuationSealRevision);
    expect(v.stages).toEqual([]);
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.outcome.unresolved_dependents.map((u: any) => u.reason)).toEqual([
      "VALIDATION_REJECTED",
    ]);
    // the shape the exception relies on: a coordinator-built stage-free seal pins the temporal state and nothing else
    const sealGroup = c.sealGroup!;
    expect(sealGroup.reads).toEqual([{ key: "temporal/state", version: 1 }]);
    expect(sealGroup.depends_on).not.toContain(transactionAuthorityGroupId(OLD));
    expect(sealGroup.reads.some((r) => r.key === authKey())).toBe(false);
    // inside the checkpoint prefix, so warm and cold reopen are genuinely different rigs
    expect(manifestOf(AUTH_SEAL.dir).head.checkpoint.revision).toBe(128);
    expect(c.sealReceipt!.revision).toBeLessThan(128);
    expect(AUTH_SEAL.headRevision).toBeGreaterThan(128);
  });

  it("[existing law] authority-then-stage-free-seal: WARM, COLD (audit) and COLD (checkpoint invalidated) reopen under S1 keep authority, seal and every receipt, and the historical verifier admits every entry", async () => {
    const m = await reopenMatrix(AUTH_SEAL.dir, canonicalAdmission, [OLD, PC_TARGET_TX2]);
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(AUTH_SEAL.summary);
      expect(o.captures![OLD], mode).toEqual(AUTH_SEAL.captures[OLD]);
      expect(o.captures![PC_TARGET_TX2], mode).toEqual(AUTH_SEAL.captures[PC_TARGET_TX2]);
    }
    expect(m.warm.calls).toBe(AUTH_SEAL.headRevision - 128);
    expect(m.coldAudit.calls).toBe(AUTH_SEAL.headRevision);
    expect(m.coldInvalidated.calls).toBe(AUTH_SEAL.headRevision);
    for (const mode of ["coldAudit", "coldInvalidated"] as const)
      expect(
        [...m[mode].verdicts!.values()].every((v) => v === null),
        mode,
      ).toBe(true);
    // saved under the identity before the one segment F-014B B2 appended (the first open under the current identity replays strictly, once)
    expect(manifestOf(AUTH_SEAL.dir).head.checkpoint.verification_policy).toBe(
      identityBeforeB2(canonicalAdmission.historyVerificationId!),
    );
  });

  it("[existing law] the stage-free seal the unchanged build stored is, group for group, the seal the coordinator builds again over the old authority", () => {
    // two separate generations of the same lawful history: the seal group is deep-equal, so the completion tested below IS the historical shape
    expect(JSON.parse(JSON.stringify(REAL_SEAL))).toEqual(
      JSON.parse(JSON.stringify(AUTH_SEAL.captures[OLD]!.sealGroup)),
    );
  });

  it("[pure] the stored stage-free seal, judged by the live kernel check against the state it was committed on, is no longer refused (it was refused by the guard before this repair)", async () => {
    const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const state = stateOf(o.campaign.store);
    expect(temporalGroupCheck(AUTH_SEAL.captures[OLD]!.sealGroup!, state)).toBeNull();
    await o.campaign.close();
  });
});

// ===========================================================================================================================
describe("R1-C the exact old transaction finishes after S1", () => {
  it("[s1 guard] ONCE through a stage-free seal over its own old authority: one new revision (the seal), the authority is the same fact and receipt, and it is not opened again", async () => {
    const r = await oldRig();
    const store0 = r.campaign.store;
    const before = capture(store0, OLD);
    const head = store0.head().revision;
    const { out, probe } = await completeStageFree(r);
    expect(out).toEqual(PC_TARGET_COMMITTED);
    // what reached the kernel: the authority re-presented (answered from its stored receipt), the owner stage refused (IM-11, not credited), the seal
    expect(
      probe.seen.map((s) => [
        isAuthorityGroup(s.group) ? "authority" : isSeal(s.group) ? "seal" : "stage",
        s.result.ok ? `committed replayed=${s.result.value.replayed}` : s.result.error.code,
      ]),
    ).toEqual([
      ["authority", "committed replayed=true"],
      ["stage", "VALUE_INVALID"],
      ["seal", "committed replayed=false"],
    ]);
    const store = r.campaign.store;
    expect(store.head().revision).toBe(head + 1); // the seal group only
    const after = capture(store, OLD);
    expect(after.authority).toEqual(before.authority);
    expect(after.authorityReceipt).toEqual(before.authorityReceipt);
    expect(after.authorityGroup).toEqual(before.authorityGroup);
    const sealed = after.seal!.value as any;
    expect(sealed.stages).toEqual([]);
    expect(sealed.trigger.kind).toBe(GM_TRIGGER);
    expect(sealed.context).toEqual(PLAYER);
    expect(after.seal!.version).toBe(1);
    expect(after.sealReceipt!.revision).toBe(head + 1);
    // the shape the unchanged coordinator gives it: pinned to the temporal state only, naming no stage and not the authority
    const seal = probe.seen.find((s) => isSeal(s.group))!.group;
    expect(seal.reads).toEqual([{ key: "temporal/state", version: 1 }]);
    expect(seal.depends_on).not.toContain(transactionAuthorityGroupId(OLD));
    expect(store.getFact(gipInstrumentKey(INSTRUMENT_A))!.version).toBe(1); // no stage was credited
    expect(r.campaign.verify()).toEqual([]);
    expect(verifyTemporalIntegrity(store)).toEqual([]);
    await r.campaign.close();
    // exactly one authority-open in the whole journal, and exactly one seal
    const ids = journalGroupIds(r.dir);
    expect(ids.filter((g) => g === transactionAuthorityGroupId(OLD))).toHaveLength(1);
    expect(ids.filter((g) => g === `transaction-group:${OLD}`)).toHaveLength(1);
  });

  it("[s1 guard] the same-ID, same-digest retry replays the original receipt with zero new revisions (coordinator, gateway and a raw re-commit of the stored group); another request under the id is a conflict", async () => {
    const r = await oldRig();
    expect((await completeStageFree(r)).out).toEqual(PC_TARGET_COMMITTED);
    const store = r.campaign.store;
    const done = capture(store, OLD);
    const sealed = summary(store);
    const head = store.head().revision;
    // coordinator: the exact stored request
    const again = await r.coordinator.advance(exactRequest(AUTH_ONLY));
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.replayed).toBe(true);
      expect(again.value.receipt).toEqual(done.sealReceipt);
    }
    // gateway: the same statement; no commit reaches the kernel at all
    const probe = probeCommits(r.campaign);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(probe.seen).toEqual([]);
    probe.restore();
    // raw: the stored seal group is answered from its receipt BEFORE admission
    const raw = await store.commit(done.sealGroup!);
    expect(raw.ok && (raw.value as any).replayed).toBe(true);
    expect(store.head().revision).toBe(head);
    expect(summary(store)).toEqual(sealed);
    // a different digest under the same identities is the store's own conflict, never an admission
    const changed = await store.commit({
      ...done.sealGroup!,
      cause: `${done.sealGroup!.cause}-changed`,
    });
    expect(changed.ok ? "" : changed.error.code).toBe("INTENT_CONFLICT");
    const other = await r.coordinator.advance({
      ...exactRequest(AUTH_ONLY),
      requested: { target: at(250), condition: null },
    });
    expect(other.ok ? "" : (other.error as any).code).toBe("TRANSACTION_CONFLICT");
    expect(summary(store)).toEqual(sealed);
    await r.campaign.close();
  });

  it("[s1 guard] the sealed result survives WARM, COLD (audit) and COLD (checkpoint invalidated) reopen with identical authority and seal receipts, and the verifier identity is the one it was saved under", async () => {
    // complete, hold the continuation with an ordinary-trigger player continuation, then pad so a checkpoint lies AFTER the completed record
    // F-014B B2: the frozen package's checkpoint is re-stamped with the current identity first (as the matrix below does), so this rig starts
    // from trusted evidence at revision 128 instead of performing the declared policy transition, which would re-earn the checkpoint at the head
    const settled = copyOf(AUTH_ONLY.dir);
    stampCheckpointPolicy(settled, canonicalAdmission.historyVerificationId!);
    const r = await rig(settled);
    expect((await completeStageFree(r)).out).toEqual(PC_TARGET_COMMITTED);
    const resume = pcTargetTransaction(PC_TARGET_TX2, {
      trigger: { kind: "player-pc-target-resume-choice", ref: "choice-resume" },
    });
    expect(await advanceOriginal(trustedOriginalHeld(r, { transaction: resume }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const c = coordinatorOn(r.campaign.store);
    for (let i = 0; i < PAD; i++)
      await must(c.advance(request(`tx-pad-${i}`, ORDINARY_TRIGGER, at(301 + i))));
    const store = r.campaign.store;
    const ids = [OLD, PC_TARGET_TX2];
    const sealedRevision = store.lookupReceipt(transactionIntentId(OLD))!.revision;
    const live = {
      summary: summary(store),
      captures: Object.fromEntries(ids.map((id) => [id, capture(store, id)])),
      head: store.head().revision,
    };
    await r.campaign.close();
    expect(sealedRevision).toBe(AUTH_ONLY.headRevision + 1);
    expect(live.head).toBeGreaterThan(128 + sealedRevision);
    expect(manifestOf(r.dir).head.checkpoint.revision).toBe(128);
    expect(manifestOf(r.dir).head.checkpoint.verification_policy).toBe(
      canonicalAdmission.historyVerificationId,
    );
    const m = await reopenMatrix(r.dir, canonicalAdmission, ids);
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, `${mode}: ${JSON.stringify(o.error)}`).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(live.summary);
      for (const id of ids) expect(o.captures![id], `${mode} ${id}`).toEqual(live.captures[id]);
      expect(o.captures![OLD]!.authorityReceipt, mode).toEqual(
        AUTH_ONLY.captures[OLD]!.authorityReceipt,
      );
      expect(o.captures![OLD]!.authority, mode).toEqual(AUTH_ONLY.captures[OLD]!.authority);
    }
    // the unchanged verifier is consulted exactly as before: the bounded tail when warm, every entry when cold
    expect(m.warm.calls).toBe(live.head - 128);
    expect(m.coldAudit.calls).toBe(live.head);
    expect(m.coldInvalidated.calls).toBe(live.head);
    for (const mode of ["coldAudit", "coldInvalidated"] as const)
      expect(
        [...m[mode].verdicts!.values()].every((v) => v === null),
        mode,
      ).toBe(true);
  }, 300_000);

  it("[existing law] the ordinary completion of the same old authority by a stage-bearing retry (the stage is credited) still works exactly once, with the authority pinned and depended on", async () => {
    const r = await oldRig();
    const before = capture(r.campaign.store, OLD);
    const head = r.campaign.store.head().revision;
    const probe = probeCommits(r.campaign);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(
      probe.seen.map((s) => [
        isAuthorityGroup(s.group) ? "authority" : isSeal(s.group) ? "seal" : "stage",
        s.result.ok ? `committed replayed=${s.result.value.replayed}` : s.result.error.code,
      ]),
    ).toEqual([
      ["authority", "committed replayed=true"],
      ["stage", "committed replayed=false"],
      ["seal", "committed replayed=false"],
    ]);
    const store = r.campaign.store;
    expect(store.head().revision).toBe(head + 2);
    const after = capture(store, OLD);
    expect(after.authority).toEqual(before.authority);
    expect(after.authorityReceipt).toEqual(before.authorityReceipt);
    expect((after.seal!.value as any).stages).toHaveLength(1);
    expect(after.sealGroup!.reads.some((x) => x.key === authKey())).toBe(true);
    expect(after.sealGroup!.depends_on).toContain(transactionAuthorityGroupId(OLD));
    // exactly once: the identical request again reaches the kernel not at all
    const sealed = summary(store);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(probe.seen).toHaveLength(3);
    expect(summary(store)).toEqual(sealed);
    expect(r.campaign.verify()).toEqual([]);
    expect(verifyTemporalIntegrity(store)).toEqual([]);
    probe.restore();
    await r.campaign.close();
    const cold = await reopenMatrix(r.dir, canonicalAdmission, [OLD], ["coldAudit"]);
    expect(cold.coldAudit.ok).toBe(true);
    expect(cold.coldAudit.summary).toEqual(sealed);
  });

  it("[s1 guard] one change away from the completion: the stage-free seal of a transaction whose authority is ABSENT is the refusal (nothing else differs from a fresh unbacked seal)", async () => {
    // the control is the completion above; here the same literal request has no authority behind it: a fresh id on the same campaign
    const r = await oldRig();
    const before = summary(r.campaign.store);
    const probe = probeCommits(r.campaign);
    expect(await viaGateway(r, literalTransaction("tx-fresh-gw"), SHORT_OF_SUNSET)).toEqual(
      REFUSED,
    );
    expect(probe.seen).toHaveLength(1);
    expect(isSeal(probe.seen[0]!.group)).toBe(true);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    probe.restore();
    expect(summary(r.campaign.store)).toEqual(before);
    // and the old transaction beside it still completes
    expect((await completeStageFree(r)).out).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });
});

// ===========================================================================================================================
// R1-D. Denials. A refusal is the guard's own (VALUE_INVALID, the guard message) when the seal states the player pair and the literal and
// the exception is not satisfied; it is refused by the typed value earlier when the context is not the player pair; and it is the ordinary
// law's (never the guard's) when the exception IS satisfied but the seal is otherwise unlawful.
// ===========================================================================================================================
interface Refusal {
  readonly code: string;
  readonly message: string | RegExp;
}
const GUARD: Refusal = { code: "VALUE_INVALID", message: GUARD_MESSAGE };
const TYPED: Refusal = { code: "VALUE_INVALID", message: /^value violates the .+ contract$/ };
const matches = (e: any, want: Refusal) => {
  expect(e.code).toBe(want.code);
  if (typeof want.message === "string") expect(e.message).toBe(want.message);
  else expect(e.message).toMatch(want.message);
};

/** The real old seal with ONE field changed. Each is one field of the compared law, so each can be told apart from every other. */
const SEAL_SIDE: readonly (readonly [string, (g: CommitGroup) => CommitGroup, Refusal])[] = [
  ["trigger.ref", (g) => editSeal(g, (v) => (v.trigger.ref = "choice-other")), GUARD],
  ["cause", (g) => editSeal(g, (v) => (v.cause = "cause-other")), GUARD],
  ["continues", (g) => editSeal(g, (v) => (v.continues = "tx-other")), GUARD],
  ["opening.state_version", (g) => editSeal(g, (v) => (v.opening.state_version = 2)), GUARD],
  ["opening.basis_time", (g) => editSeal(g, (v) => (v.opening.basis_time = at(101))), GUARD],
  [
    // the typed value ties the remainder to the requested target, so the state's continuation follows: a coherent seal of ANOTHER target
    "requested.target",
    (g) =>
      withStateWrite(
        editSeal(g, (v) => {
          v.requested.target = at(250);
          if (v.outcome.remainder) v.outcome.remainder.to = at(250);
        }),
        (state) => {
          if (state.continuation) state.continuation.toward = at(250);
        },
      ),
    GUARD,
  ],
  [
    "requested.condition",
    (g) =>
      editSeal(
        g,
        (v) =>
          (v.requested.condition = {
            kind: "STOP_AFTER_BOUNDARY",
            object_id: "obj-other",
            boundary_id: "boundary-other",
          }),
      ),
    GUARD,
  ],
  ["publication.basis", (g) => editSeal(g, (_v, l) => (l.basis = "basis-other")), GUARD],
  ["publication.secrecy", (g) => editSeal(g, (_v, l) => (l.secrecy = "secrecy-other")), GUARD],
  [
    "context.role (not the player pair)",
    (g) => editSeal(g, (v) => (v.context.role = "role.gm")),
    TYPED,
  ],
  [
    "context.permission (not the player pair)",
    (g) => editSeal(g, (v) => (v.context.permission = "permission.rule.adjudicate")),
    TYPED,
  ],
];

/** The same hand-built-state edits of the old AUTHORITY, one field each (the seal is the real, unchanged one). */
const AUTHORITY_SIDE: readonly (readonly [string, (fact: OwnerFact, value: any) => void])[] = [
  ["transaction_id", (_f, v) => (v.transaction_id = "tx-other")],
  ["cause", (_f, v) => (v.cause = "cause-other")],
  ["continues", (_f, v) => (v.continues = "tx-other")],
  ["trigger.kind (ordinary)", (_f, v) => (v.trigger.kind = "player-pc-target-choice")],
  ["trigger.kind (near miss, case)", (_f, v) => (v.trigger.kind = NEAR_MISS_TRIGGERS[0])],
  ["trigger.kind (near miss, suffix)", (_f, v) => (v.trigger.kind = NEAR_MISS_TRIGGERS[1])],
  ["trigger.ref", (_f, v) => (v.trigger.ref = "choice-other")],
  ["opening.state_version", (_f, v) => (v.opening.state_version = 2)],
  ["opening.basis_time", (_f, v) => (v.opening.basis_time = at(101))],
  ["requested.target", (_f, v) => (v.requested.target = at(250))],
  [
    "requested.condition",
    (_f, v) =>
      (v.requested.condition = {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: "obj-other",
        boundary_id: "boundary-other",
      }),
  ],
  ["publication.basis", (_f, v) => (v.publication.basis = "basis-other")],
  ["publication.secrecy", (_f, v) => (v.publication.secrecy = "secrecy-other")],
  [
    "context.role (an authority that is not a TransactionAuthority)",
    (_f, v) => (v.context.role = "role.gm"),
  ],
  ["a member the authority contract does not have", (_f, v) => (v.extra = 1)],
];

describe("R1-D the stage-free player+literal seal is refused unless it completes the authority its own transaction opened", () => {
  it("[s1 guard] RAW kernel commit, the real old seal with one field changed: each is refused (the guard, or the typed value for a non-player context) and leaves the campaign exactly as it was; the unchanged seal commits (control)", async () => {
    for (const [name, edit, want] of SEAL_SIDE) {
      const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
      if (!o.ok) throw new Error(JSON.stringify(o.error));
      const store = o.campaign.store;
      const before = summary(store);
      const changed = edit(REAL_SEAL);
      expect(changed, name).not.toEqual(REAL_SEAL); // exactly one thing differs, and something does
      const res = await store.commit(changed);
      expect(res.ok, name).toBe(false);
      if (!res.ok) matches(res.error, want);
      expect(summary(store), name).toEqual(before); // same head, facts (time, authority, instrument) and receipts
      expect(store.lookupReceipt(changed.intent_id), name).toBeNull();
      expect(store.getFact(temporalTransactionKey(OLD)), name).toBeUndefined();
      expect(capture(store, OLD).authority, name).toEqual(AUTH_ONLY.captures[OLD]!.authority);
      await o.campaign.close();
    }
    const c = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!c.ok) throw new Error(JSON.stringify(c.error));
    const head = c.campaign.store.head().revision;
    const control = await c.campaign.store.commit(REAL_SEAL);
    expect(control.ok).toBe(true);
    expect(c.campaign.store.head().revision).toBe(head + 1);
    await c.campaign.close();
  });

  it("[s1 guard] the TRUSTED GATEWAY, the same group rewritten in flight: the same refusals, the host sees only the uniform refusal, and the old transaction still completes afterwards", async () => {
    for (const [name, edit, want] of SEAL_SIDE) {
      const r = await oldRig();
      const before = summary(r.campaign.store);
      const { out, probe } = await completeStageFree(r, (g) => (isSeal(g) ? edit(g) : g));
      expect(out, name).toEqual(REFUSED);
      const attempts = probe.seen.filter((s) => isSeal(s.group));
      expect(attempts, name).toHaveLength(1);
      expect(attempts[0]!.result.ok, name).toBe(false);
      matches(attempts[0]!.result.error, want);
      expect(summary(r.campaign.store), name).toEqual(before);
      // the old transaction is not poisoned by the refusal: the unchanged statement completes it
      expect((await completeStageFree(r)).out, name).toEqual(PC_TARGET_COMMITTED);
      await r.campaign.close();
    }
  });

  it("[s1 guard] a seal whose every compared field matches the old authority is still judged by the ordinary law: a state that is not the transaction's actual stop is refused by that law, not waved through", async () => {
    const wrongStop = (g: CommitGroup): CommitGroup => ({
      ...g,
      writes: g.writes.map((w) =>
        w.key === "temporal/state"
          ? {
              ...w,
              value: {
                ...(w.value as any),
                canonical_time: { ...(w.value as any).canonical_time, value: 299 },
              },
            }
          : w,
      ),
    });
    const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const before = summary(o.campaign.store);
    const res = await o.campaign.store.commit(wrongStop(REAL_SEAL));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("REFERENCE_INVALID");
      expect(res.error.message).toBe(
        "the new canonical time must be exactly this transaction's actual stop",
      );
    }
    expect(summary(o.campaign.store)).toEqual(before);
    await o.campaign.close();
  });

  it("[pure] on a hand-built committed state the unchanged old seal passes (control), and each single-field edit of the OLD AUTHORITY, each provenance identity, and every absent or related-key authority is refused by the guard", async () => {
    const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const store = o.campaign.store;
    const refused = (state: ReturnType<typeof stateOf>, label: string) => {
      const res = temporalGroupCheck(REAL_SEAL, state);
      expect(res, label).not.toBeNull();
      expect(res!.code, label).toBe("VALUE_INVALID");
      expect(res!.message, label).toBe(GUARD_MESSAGE);
    };
    expect(temporalGroupCheck(REAL_SEAL, stateOf(store))).toBeNull(); // control: the real state, the real seal
    // 1. each compared field of the authority, one at a time
    for (const [name, edit] of AUTHORITY_SIDE)
      refused(stateOf(store, editAuthority(OLD, edit)), `authority ${name}`);
    // 2. the authority fact is at the right key but is not the canonical authority group of this transaction
    for (const [name, edit] of [
      [
        "provenance.group_id",
        (f: OwnerFact) => (f.provenance.group_id = "transaction-authority-group:tx-other"),
      ],
      [
        "provenance.intent_id",
        (f: OwnerFact) => (f.provenance.intent_id = "transaction-authority-intent:tx-other"),
      ],
      ["provenance.cause", (f: OwnerFact) => (f.provenance.cause = "transaction:tx-other")],
      [
        "the stage group that follows it",
        (f: OwnerFact) => (f.provenance.group_id = "stage-group:x"),
      ],
      [
        "the sealed group id",
        (f: OwnerFact) => (f.provenance.group_id = `transaction-group:${OLD}`),
      ],
    ] as const)
      refused(
        stateOf(
          store,
          editAuthority(OLD, (f) => edit(f)),
        ),
        `provenance ${name}`,
      );
    // 3. no authority at all (a fresh, unbacked seal) and an authority only under a related key
    const value = (store.getFact(authKey()) as OwnerFact).value;
    refused(
      stateOf(store, (facts) => facts.delete(authKey())),
      "absent",
    );
    refused(
      stateOf(store, (facts) => {
        const f = facts.get(authKey())!;
        facts.delete(authKey());
        facts.set(temporalTransactionKey(OLD), { ...f, key: temporalTransactionKey(OLD) });
      }),
      "under the sealed-transaction key",
    );
    refused(
      stateOf(store, (facts) => {
        const f = facts.get(authKey())!;
        facts.delete(authKey());
        facts.set(authKey("tx-pc-target-advance-2"), {
          ...f,
          key: authKey("tx-pc-target-advance-2"),
        });
      }),
      "under another transaction's authority key",
    );
    refused(
      stateOf(store, (facts) => {
        const f = facts.get(authKey())!;
        facts.delete(authKey());
        facts.set(`${authKey()}-2`, { ...f, key: `${authKey()}-2` });
      }),
      "under a key that extends the exact key",
    );
    refused(
      stateOf(store, (facts) => {
        const f = facts.get(authKey())!;
        facts.set(authKey("tx-other"), { ...f, key: authKey("tx-other") });
        facts.delete(authKey());
        // the other transaction's authority is itself well formed: it names tx-other, not this transaction
        (facts.get(authKey("tx-other"))!.value as any).transaction_id = "tx-other";
      }),
      "another transaction's own well-formed authority",
    );
    expect(value).toEqual(AUTH_ONLY.captures[OLD]!.authority!.value); // the state the cases edited is the frozen one
    await o.campaign.close();
  });

  it("[s1 guard] a FRESH player+literal stage-free seal with no authority is refused at the kernel and through the gateway, in a campaign that holds an unrelated old authority; the ordinary-trigger control commits", async () => {
    const a = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!a.ok) throw new Error(JSON.stringify(a.error));
    const probe = probeCommits(a.campaign);
    const built = await coordinatorOn(a.campaign.store).advance(
      request("tx-fresh", ORDINARY_TRIGGER, SHORT_OF_SUNSET),
    );
    expect(built.ok).toBe(true);
    const fresh = structuredClone(probe.seen[0]!.group);
    expect(isSeal(fresh)).toBe(true);
    expect((sealWriteOf(fresh).value as any).stages).toEqual([]);
    await a.campaign.close();

    const b = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!b.ok) throw new Error(JSON.stringify(b.error));
    const store = b.campaign.store;
    const before = summary(store);
    const literal = withTriggerKind(fresh, GM_TRIGGER);
    expect(withTriggerKind(literal, ORDINARY_TRIGGER)).toEqual(fresh); // one field differs
    const res = await store.commit(literal);
    expect(res.ok).toBe(false);
    if (!res.ok) matches(res.error, GUARD);
    expect(summary(store)).toEqual(before);
    expect(store.lookupReceipt(literal.intent_id)).toBeNull();
    expect(store.getFact(authKey("tx-fresh"))).toBeUndefined();
    expect((await store.commit(fresh)).ok).toBe(true); // control
    expect(store.head().revision).toBe(before.head.revision + 1);
    await b.campaign.close();
  });

  it("[s1 guard] a literal stage-free seal over an authority that was opened with ANOTHER trigger kind (ordinary, and two near misses) is refused, one field from the lawful seal of that authority", async () => {
    for (const kind of ["player-pc-target-choice", ...NEAR_MISS_TRIGGERS]) {
      // a lawful post-S1 authority with a non-literal trigger, its first owner stage lost: durable, uncredited, unsealed
      const lost = await rig(copyOf(SUNSET_TEMPLATE));
      const restoreCrash = crashWhen(lost as never, isOwnerStage);
      const tx = pcTargetTransaction(OLD, { trigger: { kind, ref: "choice-gm-literal" } });
      expect(await viaGateway(lost, tx)).toEqual(PC_TARGET_UNKNOWN);
      restoreCrash();
      const authority = capture(lost.campaign.store, OLD).authority!.value as any;
      expect(authority.trigger).toEqual({ kind, ref: "choice-gm-literal" });
      await lost.campaign.close();
      // the seal the coordinator builds over it when its stage is refused: lawful, and it states the same non-literal kind
      const built = await rig(copyOf(lost.dir));
      const restoreStage = refuseGipStageOf(built);
      const probe = probeCommits(built.campaign);
      expect(await viaGateway(built, tx)).toEqual(PC_TARGET_COMMITTED);
      const lawful = structuredClone(probe.seen.find((s) => isSeal(s.group))!.group);
      probe.restore();
      restoreStage();
      await built.campaign.close();
      expect(((sealWriteOf(lawful).value as any).trigger as any).kind).toBe(kind);
      // one field away: the literal
      const o = await openUnder(copyOf(lost.dir), canonicalAdmission);
      if (!o.ok) throw new Error(JSON.stringify(o.error));
      const before = summary(o.campaign.store);
      const res = await o.campaign.store.commit(withTriggerKind(lawful, GM_TRIGGER));
      expect(res.ok, kind).toBe(false);
      if (!res.ok) matches(res.error, GUARD);
      expect(summary(o.campaign.store), kind).toEqual(before);
      // through the gateway: the request is the lawful one, the seal is rewritten in flight
      const g = await rig(copyOf(lost.dir));
      const gBefore = summary(g.campaign.store);
      const restoreG = refuseGipStageOf(g);
      const probeG = probeCommits(g.campaign, (x) =>
        isSeal(x) ? withTriggerKind(x, GM_TRIGGER) : x,
      );
      expect(await viaGateway(g, tx)).toEqual(REFUSED);
      probeG.restore();
      restoreG();
      expect(summary(g.campaign.store), kind).toEqual(gBefore);
      // the control: the unchanged lawful seal commits
      const c = await openUnder(copyOf(lost.dir), canonicalAdmission);
      if (!c.ok) throw new Error(JSON.stringify(c.error));
      expect((await c.campaign.store.commit(lawful)).ok, kind).toBe(true);
      await o.campaign.close();
      await g.campaign.close();
      await c.campaign.close();
    }
  }, 300_000);

  it("[s1 guard] a different group digest for the same transaction id, and the same id under another request, are conflicts that change nothing; a NEW id stating the literal still cannot open an authority beside the old one", async () => {
    const r = await oldRig();
    const before = summary(r.campaign.store);
    // coordinator: the same id under a different request is refused at the authority re-presentation (the store's own INTENT_CONFLICT)
    const base = exactRequest(AUTH_ONLY);
    for (const variant of [
      { ...base, requested: { target: at(250), condition: null } },
      { ...base, trigger: { kind: ORDINARY_TRIGGER, ref: base.trigger.ref } },
      { ...base, cause: "cause-other" },
      { ...base, publication: { basis: "basis-other", secrecy: base.publication.secrecy } },
    ]) {
      const res = await r.coordinator.advance(variant);
      const e: any = res.ok ? null : res.error;
      expect(res.ok).toBe(false);
      expect(e.code).toBe("TRANSACTION_CONFLICT");
      expect(e.details.code).toBe("INTENT_CONFLICT");
      expect(summary(r.campaign.store)).toEqual(before);
    }
    // gateway: a different target is the uniform refusal
    expect(await viaGateway(r, literalTransaction(), at(250))).toEqual(REFUSED);
    expect(summary(r.campaign.store)).toEqual(before);
    // raw: the stored authority group with one changed field is the store's conflict
    const stored = capture(r.campaign.store, OLD).authorityGroup!;
    const changed = await r.campaign.store.commit({ ...stored, cause: `${stored.cause}-changed` });
    expect(changed.ok ? "" : changed.error.code).toBe("INTENT_CONFLICT");
    // post-S1 authority-OPEN of the player pair + literal stays refused: raw (the authority group with a new id) and through the gateway
    const probe = probeCommits(r.campaign);
    expect(await viaGateway(r, literalTransaction("tx-fresh-open"))).toEqual(REFUSED);
    expect(probe.seen).toHaveLength(1);
    expect(isAuthorityGroup(probe.seen[0]!.group)).toBe(true);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    const opened = structuredClone(probe.seen[0]!.group);
    probe.restore();
    const raw = await r.campaign.store.commit(opened);
    expect(raw.ok).toBe(false);
    if (!raw.ok) matches(raw.error, GUARD);
    expect(r.campaign.store.getFact(authKey("tx-fresh-open"))).toBeUndefined();
    expect(summary(r.campaign.store)).toEqual(before);
    // and none of it poisoned the old transaction
    expect((await completeStageFree(r)).out).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });

  it("[s1 guard] in the campaign that already holds the stage-free completion, a NEW literal is still refused (stage-free and stage-bearing), and the old transaction's ordinary same-ID retry still replays", async () => {
    const r = await rig(copyOf(AUTH_SEAL.dir));
    const before = summary(r.campaign.store);
    expect(await viaGateway(r, literalTransaction("tx-new-after"), SHORT_OF_SUNSET)).toEqual(
      REFUSED,
    );
    expect(await viaGateway(r, literalTransaction("tx-new-after"), SUNSET_LATER)).toEqual(REFUSED);
    expect(summary(r.campaign.store)).toEqual(before);
    const probe = probeCommits(r.campaign);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(probe.seen).toEqual([]);
    expect(summary(r.campaign.store)).toEqual(before);
    probe.restore();
    await r.campaign.close();
  });

  // RECORDED LIMIT. While the typed context is the player pair alone, every value that reaches the guard states that pair, so the pair test
  // inside the guard (role and permission) and the context line of the shared equality law cannot be told apart from a kind-only test or from
  // no context comparison by ANY value the kernel can be given: the case below shows the typed value refuses first, and the kernel check
  // throws at its own schema parse. Those mutations are equivalent here. They stop being equivalent the day a later slice admits a second
  // pair to the typed contract (the positive GM waiting path); that slice must add the case then, not this one.
  it("[pure] the player pair is the only context a seal or an authority can state to the kernel: a non-player context is refused by the typed value, and the kernel check itself rejects it at its own schema parse, so the pair test inside the guard is never asked", async () => {
    const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const state = stateOf(o.campaign.store);
    for (const ctx of [
      { role: "role.gm", permission: "permission.rule.adjudicate" },
      { role: "role.gm", permission: PLAYER.permission },
      { role: PLAYER.role, permission: "permission.rule.adjudicate" },
    ]) {
      const gm = editSeal(REAL_SEAL, (v) => (v.context = ctx));
      expect(() => temporalGroupCheck(gm, state)).toThrow(); // ResolutionTransactionSchema.parse inside the kernel check
      const res = await o.campaign.store.commit(gm);
      expect(res.ok).toBe(false);
      if (!res.ok) matches(res.error, TYPED);
    }
    await o.campaign.close();
  });
});

// ===========================================================================================================================
// R1-E. The extracted equality helper serves BOTH arms. The stage-bearing arm is judged here field by field, so that the refactor cannot
// have lost a comparison.
// ===========================================================================================================================
describe("R1-E the seal-to-authority equality law of the stage-bearing arm, field by field", () => {
  const REPEAT = "a transaction repeats exactly what its durable authority opened";

  it("[pure] the real stage-bearing seal of the interrupted old authority passes (control); each single-field edit of that authority is refused by the repeat law, with the authority named", async () => {
    const o = await openUnder(copyOf(INTERRUPTED.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const store = o.campaign.store;
    expect(temporalGroupCheck(STAGE_SEAL, stateOf(store))).toBeNull();
    for (const [name, edit] of AUTHORITY_SIDE) {
      const res = temporalGroupCheck(STAGE_SEAL, stateOf(store, editAuthority(OLD, edit)));
      expect(res, name).not.toBeNull();
      expect(res!.code, name).toBe("REFERENCE_INVALID");
      expect(res!.message, name).toBe(REPEAT);
      expect(res!.details, name).toMatchObject({ authority: authKey() });
    }
    await o.campaign.close();
  });

  it("[s1 guard] the stage-bearing seal is NOT judged by the origin guard: the literal it states was opened before S1, and it commits once; raw, with its seal-side fields edited one at a time, the repeat law or an earlier ordinary check refuses it", async () => {
    const o = await openUnder(copyOf(INTERRUPTED.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    expect((await o.campaign.store.commit(STAGE_SEAL)).ok).toBe(true);
    await o.campaign.close();
    for (const [name, edit] of SEAL_SIDE) {
      const p = await openUnder(copyOf(INTERRUPTED.dir), canonicalAdmission);
      if (!p.ok) throw new Error(JSON.stringify(p.error));
      const before = summary(p.campaign.store);
      const res = await p.campaign.store.commit(edit(STAGE_SEAL));
      expect(res.ok, name).toBe(false);
      if (!res.ok) expect(res.error.message, name).not.toBe(GUARD_MESSAGE); // never the origin guard
      expect(summary(p.campaign.store), name).toEqual(before);
      await p.campaign.close();
    }
  });
});

// ===========================================================================================================================
// R1-B. The live refusal against the rows of the B0 pairing table. The guard is module-private (S1 adds no public engine name), so it is
// judged only by what the kernel and the trusted gateway DO with a seal or an authority-open that states each row.
// ===========================================================================================================================
describe("R1-B the live refusal equals the B0 pairing table, row by row, at the raw kernel and at the trusted gateway", () => {
  const GM = { ...GM_ADJUDICATION_AUTHORITY };
  const CONTEXTS: Record<string, { role: string; permission: string }> = {
    player: { ...PLAYER },
    gm: GM,
    "mixed (gm role, player permission)": { role: GM.role, permission: PLAYER.permission },
    "mixed (player role, gm permission)": { role: PLAYER.role, permission: GM.permission },
  };
  const KINDS = [
    ORDINARY_TRIGGER,
    "player-pc-target-choice",
    GM_TRIGGER,
    GM_TRIGGER.toLowerCase(),
    `${GM_TRIGGER}_2`,
    `x${GM_TRIGGER}`,
    `${GM_TRIGGER} `,
    ` ${GM_TRIGGER}`,
    GM_TRIGGER.replaceAll("_", "-"),
    GM_TRIGGER.slice(0, -1),
    "",
  ];
  type Outcome = "ADMITTED" | "GUARD" | "TYPED" | "OTHER";
  const classify = (res: { ok: boolean; error?: { message: string } }): Outcome =>
    res.ok
      ? "ADMITTED"
      : res.error!.message === GUARD_MESSAGE
        ? "GUARD"
        : TYPED.message instanceof RegExp && TYPED.message.test(res.error!.message)
          ? "TYPED"
          : "OTHER";
  /** What the live kernel does with a stored-contract value stating (context, kind), read off the B0 class of that very row. */
  const expectedLive = (ctx: { role: string; permission: string }, kind: string): Outcome => {
    const b0 = temporalOriginPairing(ctx, kind);
    if (b0 === "LEGACY_PLAYER") return "ADMITTED";
    const player = ctx.role === PLAYER.role && ctx.permission === PLAYER.permission;
    // the one row the stored contract can express and B0 denies is the player pair with the literal: the S1 guard. Every other denied or
    // GM row is refused earlier, by the typed value (no positive GM waiting path is admitted in this slice).
    return player && Id.safeParse(kind).success ? "GUARD" : "TYPED";
  };
  const rows = Object.entries(CONTEXTS).flatMap(([cname, ctx]) =>
    KINDS.filter((k) => cname === "player" || k === GM_TRIGGER || k === ORDINARY_TRIGGER).map(
      (kind) => [cname, ctx, kind] as const,
    ),
  );
  let FRESH_SEAL: CommitGroup;
  let FRESH_OPEN: CommitGroup;
  beforeAll(async () => {
    const a = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
    if (!a.ok) throw new Error(JSON.stringify(a.error));
    const probe = probeCommits(a.campaign);
    await coordinatorOn(a.campaign.store).advance(
      request("tx-row", ORDINARY_TRIGGER, SHORT_OF_SUNSET),
    );
    FRESH_SEAL = structuredClone(probe.seen[0]!.group);
    await a.campaign.close();
    const b = await rig(copyOf(SUNSET_TEMPLATE));
    const p = probeCommits(b.campaign);
    await viaGateway(b, pcTargetTransaction("tx-row"));
    FRESH_OPEN = structuredClone(p.seen[0]!.group);
    await b.campaign.close();
  }, 120_000);

  it("[s1 guard] the sweep covers every B0 class: it contains a LEGACY_PLAYER, a DENY and a GM_WAIT row, and the player pair with the literal is the only row refused by the guard", () => {
    const classes = new Set(rows.map(([, ctx, kind]) => temporalOriginPairing(ctx, kind)));
    expect([...classes].sort()).toEqual(["DENY", "GM_WAIT", "LEGACY_PLAYER"]);
    const guarded = rows.filter(([, ctx, kind]) => expectedLive(ctx, kind) === "GUARD");
    expect(guarded.map(([c, , k]) => `${c}/${k}`)).toEqual([`player/${GM_TRIGGER}`]);
  });

  it("[s1 guard] RAW kernel commit of a fresh STAGE-FREE seal stating each row: refused by the guard only for the player pair with the literal; every other denied or GM row is refused earlier by the typed value; the legacy rows commit", async () => {
    expect(isSeal(FRESH_SEAL) && (sealWriteOf(FRESH_SEAL).value as any).stages.length === 0).toBe(
      true,
    );
    const seen: Record<string, Outcome> = {};
    for (const [cname, ctx, kind] of rows) {
      const o = await openUnder(copyOf(AUTH_ONLY.dir), canonicalAdmission);
      if (!o.ok) throw new Error(JSON.stringify(o.error));
      const before = summary(o.campaign.store);
      const row = withContext(withTriggerKind(FRESH_SEAL, kind), ctx);
      const res = await o.campaign.store.commit(row);
      seen[`${cname}/${JSON.stringify(kind)}`] = classify(res);
      expect(classify(res), `${cname} ${JSON.stringify(kind)}`).toBe(expectedLive(ctx, kind));
      if (!res.ok)
        expect(summary(o.campaign.store), `${cname} ${JSON.stringify(kind)}`).toEqual(before);
      await o.campaign.close();
    }
    log("R1-B.rawSeal", seen);
  }, 300_000);

  it("[s1 guard] RAW kernel commit of a fresh AUTHORITY-OPEN stating each row: the same table", async () => {
    expect(isAuthorityGroup(FRESH_OPEN)).toBe(true);
    for (const [cname, ctx, kind] of rows) {
      const r = await rig(copyOf(SUNSET_TEMPLATE));
      const before = summary(r.campaign.store);
      const res = await r.campaign.store.commit(
        withContext(withTriggerKind(FRESH_OPEN, kind), ctx),
      );
      expect(classify(res), `${cname} ${JSON.stringify(kind)}`).toBe(expectedLive(ctx, kind));
      if (!res.ok)
        expect(summary(r.campaign.store), `${cname} ${JSON.stringify(kind)}`).toEqual(before);
      await r.campaign.close();
    }
  }, 300_000);

  it("[s1 guard] the TRUSTED GATEWAY, stage-free and stage-bearing, stating each well-formed kind under the player pair it is bound to: refused exactly when B0 denies the row, committed otherwise", async () => {
    for (const kind of KINDS.filter((k) => Id.safeParse(k).success)) {
      for (const [label, target] of [
        ["stage-free", SHORT_OF_SUNSET],
        ["stage-bearing", SUNSET_LATER],
      ] as const) {
        const r = await rig(copyOf(SUNSET_TEMPLATE));
        const before = summary(r.campaign.store);
        const tx = pcTargetTransaction("tx-row-gw", { trigger: { kind, ref: "choice-row" } });
        const out = await viaGateway(r, tx, target);
        const denied = temporalOriginPairing(PLAYER, kind) === "DENY";
        expect(out, `${label} ${JSON.stringify(kind)}`).toEqual(
          denied ? REFUSED : PC_TARGET_COMMITTED,
        );
        if (denied)
          expect(summary(r.campaign.store), `${label} ${JSON.stringify(kind)}`).toEqual(before);
        await r.campaign.close();
      }
    }
  }, 300_000);
});
