/* eslint-disable @typescript-eslint/no-explicit-any -- the harness pokes at raw groups, manifests, journal bytes and stores */
// F-014B B1 S1 — the canonical live-versus-historical origin safety guard (Q-HIST-1 Option A, Sovereign-ratified): a player-pair record
// that states the trigger kind named by the B0 module and was lawfully admitted before S1 stays valid player-origin history; ONLY a NEW
// LIVE write of that pairing is refused, at the two placements of the production admission.
//
//   [existing law]  behaviour of the build that preceded S1, which S1 must PRESERVE. The "old" journals are FROZEN packages written once by
//                   that build (tests/fixtures/b1-s1-frozen; custody in tests/support/b1-s1-frozen-fixtures.ts) and reopened here as
//                   private copies under the production admission. Nothing is generated: after S1 no build can write such a record.
//   [s1 guard]      the new refusal of a NEW live write: the authority-open group of a stage-bearing transaction, and the seal group of a
//                   stage-free one. Production admission, no wrapper.
//   [pure]          pure B0 functions imported by relative path (unexported from the contracts index).
//
// Design rule: every negative is ONE change from an accepted control (the trigger kind, the transaction id, or the placement). No title
// claims more than the behaviour it executes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  canonicalAdmission,
  fixtureCanonicalAdmission,
  fixtureMsCanonicalAdmission,
  legacyContractAdmission,
  msCanonicalAdmission,
  transactionAuthorityIntentId,
  transactionIntentId,
  verifyTemporalIntegrity,
  type WriteAdmission,
} from "@immortalis/engine";
import { POPULATION_FIXTURE_EXTENSION, POP_TP, advanceToRequest, at } from "@immortalis/testkit";
import {
  continuationContextViolation,
  gmContinuationLinkViolation,
  temporalOriginPairing,
} from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import { popCoordinator } from "../support/population.ts";
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
  identityBeforeB2,
  literalTransaction,
  log,
  manifestOf,
  openUnder,
  reopenMatrix,
  request,
  summary,
  thaw,
  viaGateway,
  type OldJournal,
} from "../support/b1-s1-rigs.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_TX,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import { SUNSET_LATER } from "../support/gip-sunset.ts";

let SUNSET_TEMPLATE: string;
let ZERO: OldJournal;
let STAGE: OldJournal;
let INTERRUPTED: OldJournal;
let AUTHORITY_ONLY: OldJournal;
let AUTHORITY_THEN_SEAL: OldJournal;

beforeAll(async () => {
  SUNSET_TEMPLATE = await gatewayTemplate();
  [ZERO, STAGE, INTERRUPTED, AUTHORITY_ONLY, AUTHORITY_THEN_SEAL] = [
    thaw("zero"),
    thaw("stage"),
    thaw("interrupted"),
    thaw("authority-only"),
    thaw("authority-then-stage-free-seal"),
  ];
  log("frozen", {
    zero: {
      head: ZERO.headRevision,
      revisions: ZERO.revisions,
      checkpoint: manifestOf(ZERO.dir).head.checkpoint.revision,
    },
    stage: {
      head: STAGE.headRevision,
      revisions: STAGE.revisions,
      checkpoint: manifestOf(STAGE.dir).head.checkpoint.revision,
    },
    interrupted: {
      head: INTERRUPTED.headRevision,
      checkpoint: manifestOf(INTERRUPTED.dir).head.checkpoint.revision,
    },
  });
}, 600_000);

const rig = (admission: WriteAdmission = canonicalAdmission, dir?: string) =>
  gatewayRig(SUNSET_TEMPLATE, admission, dir);

// ---------------------------------------------------------------------------------------------------------------------------
describe("a. historical seal-only player+literal transaction (no stage, no authority record)", () => {
  it("[existing law] the frozen record sits INSIDE the checkpoint prefix, so warm and cold reopen are genuinely different rigs", () => {
    const cp = manifestOf(ZERO.dir).head.checkpoint.revision;
    const lit = ZERO.captures["tx-old-literal"]!;
    log("a.record", {
      checkpoint: cp,
      literalRevision: ZERO.revisions["tx-old-literal"],
      head: ZERO.headRevision,
    });
    expect(cp).toBe(128);
    expect(ZERO.revisions["tx-old-literal"]).toBeLessThan(cp);
    expect(ZERO.headRevision).toBeGreaterThan(cp);
    const v = lit.seal!.value as any;
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.stages).toEqual([]); // seal-only: the kernel's lazy carry
    expect(lit.authority).toBeNull(); // no durable authority exists for a zero-stage transaction
    expect(lit.sealReceipt).toBeDefined();
    // the unphased B0 classifier calls this very stored record DENY, although the pre-S1 verifier admitted and sealed it
    expect(temporalOriginPairing(v.context, v.trigger.kind)).toBe("DENY");
  });

  it("[existing law] WARM, COLD (audit) and COLD (checkpoint invalidated) reopen under S1 keep the exact transaction, context, receipt and whole-campaign history", async () => {
    const m = await reopenMatrix(ZERO.dir, canonicalAdmission, [
      "tx-old-ordinary",
      "tx-old-literal",
    ]);
    log(
      "a.matrix",
      Object.fromEntries(
        Object.entries(m).map(([k, o]) => [
          k,
          { ok: o.ok, calls: o.calls, cp: o.checkpointRevisionAfter, v: o.violations },
        ]),
      ),
    );
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(ZERO.summary);
      expect(o.captures!["tx-old-literal"], mode).toEqual(ZERO.captures["tx-old-literal"]);
      expect(o.captures!["tx-old-ordinary"], mode).toEqual(ZERO.captures["tx-old-ordinary"]);
    }
    // how much history each rig actually judged with verifyHistorical: warm = the bounded tail only; the two cold rigs = every entry
    expect(m.warm.calls).toBe(ZERO.headRevision - 128);
    expect(m.coldAudit.calls).toBe(ZERO.headRevision);
    expect(m.coldInvalidated.calls).toBe(ZERO.headRevision);
    // the invalidated-checkpoint open earned a fresh checkpoint under the new verifier identity
    expect(m.coldInvalidated.checkpointRevisionAfter).toBe(ZERO.headRevision);
    // the historical verifier admitted the literal record and every other entry: the verdict per journal entry is "admitted"
    const sealIntent = transactionIntentId("tx-old-literal");
    for (const mode of ["coldAudit", "coldInvalidated"] as const) {
      expect(m[mode].verdicts!.get(sealIntent), mode).toBeNull();
      expect(
        [...m[mode].verdicts!.values()].every((v) => v === null),
        mode,
      ).toBe(true);
    }
  });
});

describe("b. historical stage-bearing player+literal authority + owner stage + seal (shipped gateway)", () => {
  it("[existing law] the frozen journal holds authority-open, one real GIP stage and the seal under the player pair + the literal", () => {
    const c = STAGE.captures[PC_TARGET_TX]!;
    const v = c.seal!.value as any;
    log("b.record", {
      checkpoint: manifestOf(STAGE.dir).head.checkpoint.revision,
      revisions: STAGE.revisions,
      head: STAGE.headRevision,
    });
    expect(manifestOf(STAGE.dir).head.checkpoint.revision).toBe(128);
    expect(STAGE.revisions[PC_TARGET_TX]).toBeLessThan(128);
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.stages.length).toBe(1);
    expect(c.authority).toBeDefined();
    expect(c.authorityReceipt!.revision).toBeLessThan(c.sealReceipt!.revision);
    expect((c.authority!.value as any).trigger).toEqual(v.trigger);
    expect((c.authority!.value as any).context).toEqual(v.context);
  });

  it("[existing law] WARM, COLD (audit) and COLD (checkpoint invalidated) reopen under S1 accept and preserve authority, stage, seal and every receipt", async () => {
    const m = await reopenMatrix(STAGE.dir, canonicalAdmission, [PC_TARGET_TX]);
    log(
      "b.matrix",
      Object.fromEntries(
        Object.entries(m).map(([k, o]) => [k, { ok: o.ok, calls: o.calls, v: o.violations }]),
      ),
    );
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(STAGE.summary);
      expect(o.captures![PC_TARGET_TX], mode).toEqual(STAGE.captures[PC_TARGET_TX]);
    }
    expect(m.warm.calls).toBe(STAGE.headRevision - 128);
    expect(m.coldAudit.calls).toBe(STAGE.headRevision);
    expect(m.coldInvalidated.calls).toBe(STAGE.headRevision);
    for (const mode of ["coldAudit", "coldInvalidated"] as const)
      expect(
        [...m[mode].verdicts!.values()].every((v) => v === null),
        mode,
      ).toBe(true);
  });
});

describe("c. INTERRUPTED stage-bearing player+literal: authority-open and credited stage committed, seal not", () => {
  it("[existing law] the frozen cut is exactly authority + stage durable and no sealed record; closing and reopening keeps that cut", async () => {
    const before = INTERRUPTED.captures[PC_TARGET_TX]!;
    expect(before.authority).toBeDefined();
    expect(before.seal).toBeNull();
    const m = await reopenMatrix(
      INTERRUPTED.dir,
      canonicalAdmission,
      [PC_TARGET_TX],
      ["warm", "coldAudit"],
    );
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.summary, mode).toEqual(INTERRUPTED.summary);
      expect(o.violations, mode).toEqual([]);
    }
    log("c.cut", {
      head: INTERRUPTED.headRevision,
      authorityRevision: before.authorityReceipt!.revision,
    });
  });

  it("[existing law] after reopen under S1 the SAME transaction id resumes and seals under the PRE-EXISTING authority (not re-opened, one new revision), carrying the literal and the player pair", async () => {
    const r = await rig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const head = r.campaign.store.head().revision;
    const authorityBefore = capture(r.campaign.store, PC_TARGET_TX);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    const after = capture(r.campaign.store, PC_TARGET_TX);
    log("c.resume", { head, headAfter: r.campaign.store.head().revision });
    expect(r.campaign.store.head().revision).toBe(head + 1); // the seal group only: authority and stage are adopted, not re-written
    expect(after.authority).toEqual(authorityBefore.authority); // same fact, same version
    expect(after.authorityReceipt).toEqual(authorityBefore.authorityReceipt);
    const v = after.seal!.value as any;
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.stages.length).toBe(1);
    // the seal repeats exactly what the authority opened (the pre-existing authority equality)
    const a = after.authority!.value as any;
    for (const f of [
      "transaction_id",
      "cause",
      "continues",
      "trigger",
      "opening",
      "requested",
      "context",
    ])
      expect(v[f], f).toEqual(a[f]);
    expect(r.campaign.verify()).toEqual([]);
    expect(verifyTemporalIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("[existing law] a DIFFERENTLY stated attempt with the same id conflicts: exact code at the coordinator and the gateway; nothing new is committed", async () => {
    const r = await rig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const before = summary(r.campaign.store);
    // coordinator level: same id, same trigger, same pair, but a different requested target (250, not 300)
    const res = await r.coordinator.advance(request(PC_TARGET_TX, GM_TRIGGER, at(250)));
    const e: any = res.ok ? null : res.error;
    log("c.conflict.coordinator", e && { code: e.code, message: e.message, details: e.details });
    expect(res.ok).toBe(false);
    expect(e.code).toBe("TRANSACTION_CONFLICT");
    expect(e.details.code).toBe("INTENT_CONFLICT"); // the store's own code, mapped by #openAuthority
    // gateway level: the host still sees only the uniform refusal
    const g = await viaGateway(r, literalTransaction(), at(250));
    expect(g).toEqual(REFUSED);
    expect(summary(r.campaign.store)).toEqual(before);
    // one change away: the identical statement resumes (see previous case)
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });
});

describe("d. same-ID retry, same-ID conflict and a new id", () => {
  it("[existing law] exact retry returns the original receipt with zero new revisions; a different digest is TRANSACTION_CONFLICT at the coordinator and INTENT_CONFLICT at the store; a new ordinary id is a fresh transaction", async () => {
    const opened = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!opened.ok) throw new Error(JSON.stringify(opened.error));
    const campaign = opened.campaign;
    const c = coordinatorOn(campaign.store);
    const out: Record<string, unknown> = {};
    for (const kind of [ORDINARY_TRIGGER, GM_TRIGGER]) {
      const id = kind === GM_TRIGGER ? "tx-old-literal" : "tx-old-ordinary";
      const head = campaign.store.head().revision;
      const stored = capture(campaign.store, id);
      const same = await c.advance(request(id, kind, kind === GM_TRIGGER ? at(200) : at(150)));
      expect(same.ok, kind).toBe(true);
      if (same.ok) {
        expect(same.value.replayed, kind).toBe(true);
        expect(same.value.receipt, kind).toEqual(stored.sealReceipt);
      }
      expect(campaign.store.head().revision, kind).toBe(head); // zero new revisions
      expect(capture(campaign.store, id), kind).toEqual(stored);
      // same id, ONE changed field (the target): the coordinator refuses
      const diff = await c.advance(request(id, kind, at(999)));
      const e: any = diff.ok ? null : diff.error;
      expect(diff.ok, kind).toBe(false);
      expect(e.code, kind).toBe("TRANSACTION_CONFLICT");
      // same intent, different digest, straight at the kernel store: INTENT_CONFLICT
      const raw = await campaign.store.commit({
        ...stored.sealGroup!,
        cause: `${stored.sealGroup!.cause}-changed`,
      });
      expect(raw.ok, kind).toBe(false);
      expect(raw.ok ? "" : raw.error.code, kind).toBe("INTENT_CONFLICT");
      // same group id, a DIFFERENT intent: GROUP_ID_CONFLICT (the identity checks run before admission)
      const regrouped = await campaign.store.commit({
        ...stored.sealGroup!,
        intent_id: `${stored.sealGroup!.intent_id}-other`,
      });
      expect(regrouped.ok, kind).toBe(false);
      expect(regrouped.ok ? "" : regrouped.error.code, kind).toBe("GROUP_ID_CONFLICT");
      expect(campaign.store.head().revision, kind).toBe(head);
      out[kind] = {
        coordinatorCode: e.code,
        coordinatorMessage: e.message,
        storeCode: raw.ok ? null : raw.error.code,
        groupCode: regrouped.ok ? null : regrouped.error.code,
      };
    }
    // a NEW id with the ordinary kind is a fresh transaction
    const head = campaign.store.head().revision;
    const fresh = await c.advance(request("tx-new-ordinary", ORDINARY_TRIGGER, at(1000)));
    expect(fresh.ok).toBe(true);
    expect(campaign.store.head().revision).toBe(head + 1);
    log("d.existing", { ...out, newOrdinaryOk: fresh.ok });
    await campaign.close();
  });

  it("[s1 guard] a NEW id with the literal is refused on the same journal that holds an old literal record, and the old record is untouched", async () => {
    const opened = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!opened.ok) throw new Error(JSON.stringify(opened.error));
    const campaign = opened.campaign;
    const c = coordinatorOn(campaign.store);
    const head = campaign.store.head().revision;
    const before = summary(campaign.store);
    const freshLiteral = await c.advance(request("tx-new-literal", GM_TRIGGER, at(1001)));
    log("d.s1", { newLiteralOk: freshLiteral.ok });
    expect(freshLiteral.ok).toBe(false);
    expect(campaign.store.head().revision).toBe(head);
    expect(summary(campaign.store)).toEqual(before);
    expect(capture(campaign.store, "tx-old-literal")).toEqual(ZERO.captures["tx-old-literal"]);
    await campaign.close();
  });

  it("[existing law] stage-bearing: the gateway replays an exact retry of the sealed literal transaction with no new revision and refuses a changed target", async () => {
    const r = await rig(canonicalAdmission, copyOf(STAGE.dir));
    const head = r.campaign.store.head().revision;
    const stored = capture(r.campaign.store, PC_TARGET_TX);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(r.campaign.store.head().revision).toBe(head);
    expect(capture(r.campaign.store, PC_TARGET_TX)).toEqual(stored);
    expect(await viaGateway(r, literalTransaction(), at(310))).toEqual(REFUSED);
    expect(r.campaign.store.head().revision).toBe(head);
    await r.campaign.close();
  });
});

// ===========================================================================================================================
// e. The S1 guard at BOTH placements, against the production admission. Each rig returns the list of its checks; a rig is green
//    when no check failed. A rig never throws on a refusal.
// ===========================================================================================================================
interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly observed?: unknown;
}
const failed = (list: readonly Check[]) => list.filter((c) => !c.ok).map((c) => c.name);
const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b); // key-order insensitive, undefined-aware

const errOf = (r: { ok: boolean; error?: unknown }) =>
  r.ok
    ? null
    : {
        code: (r.error as any)?.code,
        message: (r.error as any)?.message,
        details: (r.error as any)?.details,
      };

const Z3 = "Z3 a NEW player+literal zero-stage transaction is refused";
const Z4 = "Z4 the refusal left no new revision, no receipt, no sealed record and no time change";
const S3 =
  "S3 a NEW stage-bearing player+literal advance through the shipped gateway is refused (uniform host refusal)";
const S4 =
  "S4 nothing was left behind: no authority record, no credited stage, no receipt, no revision, no time change";

/** RIG-Z: zero-stage placement (the SEAL group is the only commit) over the frozen stage-less journal of case a. */
async function rigZero(admission: WriteAdmission | undefined): Promise<Check[]> {
  const list: Check[] = [];
  const chk = (name: string, ok: boolean, observed?: unknown) => list.push({ name, ok, observed });
  try {
    const opened = await openUnder(copyOf(ZERO.dir), admission);
    chk(
      "Z0 the old stage-less journal reopens WARM under S1",
      opened.ok,
      opened.ok ? null : opened.error,
    );
    if (!opened.ok) return list;
    const { campaign } = opened;
    const store = campaign.store;
    const c = coordinatorOn(store);
    chk(
      "Z1 the old record is intact after reopen",
      same(capture(store, "tx-old-literal"), ZERO.captures["tx-old-literal"]),
    );
    const head0 = store.head().revision;
    const time0 = c.state()!.value.canonical_time;
    const retry = await c.advance(request("tx-old-literal", GM_TRIGGER, at(200)));
    chk(
      "Z2 same-ID exact retry of the old record is a replay with zero new revisions",
      retry.ok && retry.value.replayed && store.head().revision === head0,
      errOf(retry),
    );
    // ---- the contrast: ONE change (the trigger kind) from the accepted control, in the SAME campaign that holds the old record
    const denied = await c.advance(request("tx-new-literal", GM_TRIGGER, at(1000)));
    chk(Z3, !denied.ok, errOf(denied));
    chk(
      Z4,
      store.head().revision === head0 &&
        store.lookupReceipt(transactionIntentId("tx-new-literal")) === null &&
        store.getFact(temporalTransactionKey("tx-new-literal")) === undefined &&
        same(c.state()!.value.canonical_time, time0),
    );
    let target = 1100;
    for (const kind of NEAR_MISS_TRIGGERS) {
      const h = store.head().revision;
      const r = await c.advance(request(`tx-near-${kind}`, kind, at(target)));
      chk(
        `Z5 near-miss kind "${kind}" is an ordinary Id, admitted (exact literal only; no folding, no prefix)`,
        r.ok && store.head().revision === h + 1,
        errOf(r),
      );
      target += 100;
    }
    const hc = store.head().revision;
    const ctl = await c.advance(request("tx-new-ordinary", ORDINARY_TRIGGER, at(target)));
    chk(
      "Z6 the ordinary control is admitted in the same campaign (+1 revision)",
      ctl.ok && store.head().revision === hc + 1,
      errOf(ctl),
    );
    chk(
      "Z7 temporal integrity of the campaign holding both is clean",
      campaign.verify().length === 0 && verifyTemporalIntegrity(store).length === 0,
    );
    await campaign.close();
    if (admission) {
      const m = await reopenMatrix(ZERO.dir, admission, ["tx-old-literal"]);
      for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const)
        chk(
          `Z8 ${mode} reopen keeps the whole old history exactly`,
          m[mode].ok && same(m[mode].summary, ZERO.summary),
          m[mode].ok ? null : m[mode].error,
        );
    }
  } catch (e) {
    chk("Z-abort the rig threw", false, String(e));
  }
  return list;
}

/** RIG-S: stage-bearing placement (AUTHORITY-OPEN is the first canonical commit) through the shipped gateway. */
async function rigStage(admission: WriteAdmission | undefined): Promise<Check[]> {
  const list: Check[] = [];
  const chk = (name: string, ok: boolean, observed?: unknown) => list.push({ name, ok, observed });
  const attempt = async (name: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      chk(`${name} aborted`, false, String(e));
    }
  };
  await attempt("S0", async () => {
    if (!admission) return;
    const m = await reopenMatrix(STAGE.dir, admission, [PC_TARGET_TX]);
    for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const)
      chk(
        `S0 old stage-bearing journal: ${mode} reopen keeps authority, stage, seal and receipts`,
        m[mode].ok && same(m[mode].summary, STAGE.summary),
        m[mode].ok ? null : m[mode].error,
      );
  });
  await attempt("S1", async () => {
    const r = await rig(admission, copyOf(INTERRUPTED.dir));
    const head = r.campaign.store.head().revision;
    const authority = capture(r.campaign.store, PC_TARGET_TX).authority;
    const out = await viaGateway(r, literalTransaction());
    chk(
      "S1 the interrupted OLD authority (credited stage, no seal) still resumes and seals under its pre-existing authority",
      same(out, PC_TARGET_COMMITTED) && r.campaign.store.head().revision === head + 1,
      out,
    );
    chk(
      "S1b the pre-existing authority fact was adopted, not re-written",
      same(capture(r.campaign.store, PC_TARGET_TX).authority, authority),
    );
    await r.campaign.close();
  });
  await attempt("S2", async () => {
    const r = await rig(admission, copyOf(INTERRUPTED.dir));
    const before = summary(r.campaign.store);
    const res = await r.coordinator.advance(request(PC_TARGET_TX, GM_TRIGGER, at(250)));
    const e: any = res.ok ? null : res.error;
    chk(
      "S2 a differently stated attempt on the interrupted old authority conflicts (TRANSACTION_CONFLICT / INTENT_CONFLICT), never an admission",
      !res.ok &&
        e.code === "TRANSACTION_CONFLICT" &&
        e.details?.code === "INTENT_CONFLICT" &&
        same(summary(r.campaign.store), before),
      errOf(res),
    );
    await r.campaign.close();
  });
  await attempt("S3", async () => {
    const r = await rig(admission);
    const before = summary(r.campaign.store);
    const out = await viaGateway(r, literalTransaction("tx-new-stage-literal"));
    const after = summary(r.campaign.store);
    chk(S3, same(out, REFUSED), out);
    chk(
      S4,
      same(after, before) &&
        r.campaign.store.getFact(temporalTransactionAuthorityKey("tx-new-stage-literal")) ===
          undefined &&
        r.campaign.store.lookupReceipt(transactionAuthorityIntentId("tx-new-stage-literal")) ===
          null,
      { revisionBefore: before.head.revision, revisionAfter: after.head.revision },
    );
    await r.campaign.close();
  });
  await attempt("S5", async () => {
    const r = await rig(admission);
    const head = r.campaign.store.head().revision;
    const out = await viaGateway(r, pcTargetTransaction("tx-new-stage-ordinary"));
    chk(
      "S5 the control one change away (the shipped ordinary trigger kind) is admitted: authority, stage and seal commit",
      same(out, PC_TARGET_COMMITTED) && r.campaign.store.head().revision === head + 3,
      out,
    );
    await r.campaign.close();
  });
  await attempt("S6", async () => {
    for (const kind of NEAR_MISS_TRIGGERS) {
      const r = await rig(admission);
      const out = await viaGateway(
        r,
        pcTargetTransaction("tx-near", { trigger: { kind, ref: "choice-near" } }),
      );
      chk(
        `S6 near-miss kind "${kind}" stated by the trusted side is admitted`,
        same(out, PC_TARGET_COMMITTED),
        out,
      );
      await r.campaign.close();
    }
  });
  await attempt("S7", async () => {
    const r = await rig(admission, copyOf(STAGE.dir));
    const head = r.campaign.store.head().revision;
    const out = await viaGateway(r, literalTransaction());
    chk(
      "S7 same-ID exact retry of the sealed old stage-bearing record replays with zero new revisions",
      same(out, PC_TARGET_COMMITTED) && r.campaign.store.head().revision === head,
      out,
    );
    await r.campaign.close();
  });
  return list;
}

describe("e. [s1 guard] the production admission refuses a NEW player+literal write at BOTH placements and preserves every old record", () => {
  it("[s1 guard] the verifier identity is the one the frozen packages were saved under, less the one segment F-014B B2 appended: their first open under the current identity is the declared strict replay", () => {
    for (const j of [ZERO, STAGE, INTERRUPTED, AUTHORITY_ONLY, AUTHORITY_THEN_SEAL])
      expect(manifestOf(j.dir).head.checkpoint.verification_policy).toBe(
        identityBeforeB2(canonicalAdmission.historyVerificationId!),
      );
  });

  it("[s1 guard] RIG-Z (zero-stage, seal placement): the new literal is refused with no new revision, the old stage-less journal reopens cold and warm, the control is admitted", async () => {
    const list = await rigZero(canonicalAdmission);
    log("e.rigZ", list);
    expect(failed(list)).toEqual([]);
  }, 300_000);

  it("[s1 guard] RIG-S (stage-bearing, authority-open placement): the new literal is refused before any authority or credited stage, the interrupted old authority still seals, the old journal reopens", async () => {
    const list = await rigStage(canonicalAdmission);
    log("e.rigS", list);
    expect(failed(list)).toEqual([]);
  }, 300_000);

  it("[s1 guard] both rigs hold through the plain production open path (no test seam, no spy)", async () => {
    const z = await rigZero(undefined);
    const s = await rigStage(undefined);
    log("e.plainOpen", { z, s });
    expect(failed(z)).toEqual([]);
    expect(failed(s)).toEqual([]);
  }, 300_000);

  it("[s1 guard] the refusal surfaces as VALUE_INVALID at the zero-stage seal, and through the coordinator as TRANSACTION_CONFLICT with details.code VALUE_INVALID at the authority-open group", async () => {
    const z = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!z.ok) throw new Error(JSON.stringify(z.error));
    const zr = await coordinatorOn(z.campaign.store).advance(
      request("tx-obs-literal", GM_TRIGGER, at(1000)),
    );
    const zErr = errOf(zr);
    await z.campaign.close();
    // the coordinator maps ANY non-fatal authority-open refusal to TRANSACTION_CONFLICT (existing behaviour)
    const r = await rig(canonicalAdmission);
    const sr = await r.coordinator.advance(request("tx-obs-stage", GM_TRIGGER, SUNSET_LATER));
    const sErr = errOf(sr);
    await r.campaign.close();
    log("e.errors", { zeroStageSeal: zErr, stageBearingAuthorityOpen: sErr });
    expect(zErr).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
      details: { key: temporalTransactionKey("tx-obs-literal") },
    });
    expect(sErr).toMatchObject({
      code: "TRANSACTION_CONFLICT",
      details: { code: "VALUE_INVALID" },
    });
  });
});

// ===========================================================================================================================
// f. the pure B0 classifiers against STORED historical player-origin records
// ===========================================================================================================================
describe("f. [pure] B0 classifiers versus a stored historical player-origin transaction", () => {
  const GM = { ...GM_ADJUDICATION_AUTHORITY };

  it("[existing law] the unphased classifier calls the stored player+literal record DENY while the historical verifier admits every entry that carries it: it is not a replay predicate", async () => {
    const out: Record<string, unknown> = {};
    for (const [label, dir, ids] of [
      ["stage-less", ZERO.dir, ["tx-old-literal"]],
      ["stage-bearing", STAGE.dir, [PC_TARGET_TX]],
    ] as const) {
      const r = await openUnder(copyOf(dir), canonicalAdmission, { audit: true });
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      for (const id of ids) {
        const c = capture(r.campaign.store, id);
        const v: any = c.seal!.value;
        expect(temporalOriginPairing(v.context, v.trigger.kind), `${label} seal`).toBe("DENY");
        expect(r.verdicts.get(transactionIntentId(id)), `${label} seal verdict`).toBeNull();
        out[`${label}.seal`] = { pairing: "DENY", historicalVerdict: null };
        if (c.authority) {
          const a: any = c.authority.value;
          expect(temporalOriginPairing(a.context, a.trigger.kind), `${label} authority`).toBe(
            "DENY",
          );
          expect(
            r.verdicts.get(transactionAuthorityIntentId(id)),
            `${label} authority verdict`,
          ).toBeNull();
          out[`${label}.authority`] = { pairing: "DENY", historicalVerdict: null };
        }
      }
      // one change away: the ordinary record of the same journal classifies as legacy player and is admitted
      if (label === "stage-less") {
        const o: any = capture(r.campaign.store, "tx-old-ordinary").seal!.value;
        expect(temporalOriginPairing(o.context, o.trigger.kind)).toBe("LEGACY_PLAYER");
        expect(r.verdicts.get(transactionIntentId("tx-old-ordinary"))).toBeNull();
      }
      await r.campaign.close();
    }
    log("f.unphased", out);
  });

  it("[pure] the B0 pairing table is literal and unphased (rows the reachable schema can or cannot produce)", () => {
    const rows = [
      ["player + ordinary", PLAYER, ORDINARY_TRIGGER, "LEGACY_PLAYER"],
      ["player + literal", PLAYER, GM_TRIGGER, "DENY"],
      ["GM + literal", GM, GM_TRIGGER, "GM_WAIT"],
      ["GM + ordinary", GM, ORDINARY_TRIGGER, "DENY"],
      [
        "mixed (GM role, player permission)",
        { role: GM.role, permission: PLAYER.permission },
        GM_TRIGGER,
        "DENY",
      ],
      ["player + near-miss (case)", PLAYER, "gm_interpreted_pc_wait", "LEGACY_PLAYER"],
      ["player + empty kind", PLAYER, "", "DENY"],
    ] as const;
    for (const [label, ctx, kind, want] of rows)
      expect(temporalOriginPairing(ctx, kind), label).toBe(want);
  });

  it("[pure] continuationContextViolation: the STORED historical player-origin value cannot satisfy a GM remainder; one change away (a player remainder) it is accepted", () => {
    const stored = ZERO.captures["tx-old-literal"]!.seal!.value as any;
    const prior = { context: stored.context };
    const viaGm = continuationContextViolation(prior, { context: GM });
    const viaPlayer = continuationContextViolation(prior, { context: { ...PLAYER } });
    const mixed = continuationContextViolation(prior, {
      context: { role: GM.role, permission: PLAYER.permission },
    });
    log("f.continuationContext", { viaGm, viaPlayer, mixed });
    expect(viaGm).toMatch(/exactly the role and permission/);
    expect(mixed).toMatch(/exactly the role and permission/);
    expect(viaPlayer).toBeNull(); // the control: the same stored record continued under the SAME pair
    // the literal is not part of the rule: a stored record with the ordinary kind gives the same verdicts
    const ord = ZERO.captures["tx-old-ordinary"]!.seal!.value as any;
    expect(continuationContextViolation({ context: ord.context }, { context: GM })).toBe(viaGm);
    // a non-pair context is refused rather than compared
    expect(
      continuationContextViolation({ context: "role.player" as never }, { context: GM }),
    ).toMatch(/must be a pair/);
  });

  it("[pure] gmContinuationLinkViolation compares only a CALLER-SUPPLIED held identity: it does not authenticate stored state", () => {
    const stored = ZERO.captures["tx-old-literal"]!;
    const req = (from: string) => ({
      continues: from,
      gm_wait: { phase: "CONTINUATION" as const, from_transaction: from },
    });
    // 1. a stored historical PLAYER-origin identity, supplied by the caller as `held`, satisfies the link
    expect(
      gmContinuationLinkViolation(req("tx-old-literal"), { from_transaction: "tx-old-literal" }),
    ).toBeNull();
    // 2. a FABRICATED identity that exists nowhere in the store satisfies it just as well
    expect(ZERO.captures["tx-fabricated"]).toBeUndefined();
    expect(
      gmContinuationLinkViolation(req("tx-fabricated"), { from_transaction: "tx-fabricated" }),
    ).toBeNull();
    // 3. only a MISMATCH between the two caller-supplied values, an absent held value, or a non-CONTINUATION is refused
    expect(
      gmContinuationLinkViolation(req("tx-old-literal"), { from_transaction: "tx-other" }),
    ).toMatch(/exactly the persisted continuation/);
    expect(gmContinuationLinkViolation(req("tx-old-literal"), null)).toMatch(
      /no continuation is held/,
    );
    expect(
      gmContinuationLinkViolation(
        { continues: null, gm_wait: { phase: "INITIAL" } as never },
        { from_transaction: "x" },
      ),
    ).toMatch(/only a CONTINUATION/);
    // 4. it has no parameter that could carry a store, a campaign or a transaction record: arity 2, and the record's context and trigger
    //    never reach it. The stored record's origin (player + literal) is invisible to it by construction.
    expect(gmContinuationLinkViolation.length).toBe(2);
    expect((stored.seal!.value as any).context).toEqual(PLAYER);
    log("f.link", {
      storedOrigin: "player+literal",
      acceptedAsHeld: true,
      fabricatedAccepted: true,
    });
  });
});

// ===========================================================================================================================
// g. older NON-literal journals still open under every admission composition the build knows
// ===========================================================================================================================
const MS_BINDING = {
  key_id: "s1-key",
  public_key: "s1-public-key",
  driver_id: "s1-driver",
  driver_config_hash: "0".repeat(64),
};
const ADMISSIONS: readonly { name: string; admission: WriteAdmission }[] = [
  { name: "production canonicalAdmission", admission: canonicalAdmission },
  { name: "MS production (msCanonicalAdmission)", admission: msCanonicalAdmission(MS_BINDING) },
  {
    name: "MS fixture (fixtureMsCanonicalAdmission)",
    admission: fixtureMsCanonicalAdmission(MS_BINDING),
  },
  { name: "T1 fixture (fixtureCanonicalAdmission)", admission: fixtureCanonicalAdmission },
  {
    name: "pre-v0.9 legacy (legacyContractAdmission(production))",
    admission: legacyContractAdmission(canonicalAdmission),
  },
];

describe("g. [existing law] known older non-literal journals (retained fixture packages; nothing invented here)", () => {
  const R02 = join(import.meta.dirname, "../fixtures/r02-a01-pre-s4");
  const LEGACY = join(import.meta.dirname, "../fixtures/legacy-base-eafbb127/package");
  // the head each retained package recorded when it was written: its own manifest is the custody (the packages are pinned by their own suites)
  const golden = (mode: "ordinary" | "pcb" | "interrupted") => {
    const h = manifestOf(join(R02, mode)).head;
    return [h.state_sha256, h.journal_head_sha256];
  };

  const entriesOf = (dir: string) =>
    readFileSync(join(dir, "journal.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { group: CommitGroup; receipt: unknown });

  for (const mode of ["ordinary", "pcb", "interrupted"] as const) {
    it(`[existing law] retained pre-S-4 ${mode} package: opens warm and cold under every admission, keeping the exact head and every original receipt`, async () => {
      const table: Record<string, unknown> = {};
      for (const a of ADMISSIONS) {
        for (const m of ["warm", "coldAudit"] as const) {
          const dir = copyOf(join(R02, mode));
          const journal = readFileSync(join(dir, "journal.jsonl"));
          const entries = entriesOf(dir);
          const r = await openUnder(dir, a.admission, {
            ...(m === "coldAudit" ? { audit: true } : {}),
            extension: POPULATION_FIXTURE_EXTENSION,
          });
          if (!r.ok) {
            table[`${a.name} / ${m}`] = {
              ok: false,
              error: { code: r.error.code, message: r.error.message },
            };
            continue;
          }
          const head = r.campaign.store.head();
          const receiptsKept = entries.every((e) =>
            same(r.campaign.store.lookupReceipt(e.group.intent_id), e.receipt),
          );
          const cell = {
            ok: true,
            golden: same([head.state_sha256, head.journal_head_sha256], golden(mode)),
            receiptsKept,
            violations: r.campaign.verify().length,
            calls: r.calls,
          };
          table[`${a.name} / ${m}`] = cell;
          await r.campaign.close();
          expect(
            readFileSync(join(dir, "journal.jsonl")).equals(journal),
            `${a.name} ${m} journal bytes`,
          ).toBe(true);
        }
      }
      log(`g.r02.${mode}`, table);
      for (const [cellName, cell] of Object.entries(table)) {
        expect((cell as any).ok, cellName).toBe(true);
        expect((cell as any).golden, cellName).toBe(true);
        expect((cell as any).receiptsKept, cellName).toBe(true);
        expect((cell as any).violations, cellName).toBe(0);
      }
    }, 300_000);
  }

  it("[existing law] the RETAINED interrupted old authority (a real pre-S-4 package, non-literal) resumes and seals under the production admission", async () => {
    const dir = copyOf(join(R02, "interrupted"));
    const r = await openUnder(dir, canonicalAdmission, { extension: POPULATION_FIXTURE_EXTENSION });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const head = r.campaign.store.head().revision;
    const resumed = await popCoordinator(r.campaign.store).advance(
      advanceToRequest("tx-baseline-interrupted", POP_TP),
    );
    log("g.r02.interruptedResume", {
      ok: resumed.ok,
      adopted: resumed.ok ? resumed.value.adopted.length : null,
      revisions: r.campaign.store.head().revision - head,
    });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.adopted.length).toBeGreaterThan(0);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  }, 300_000);

  it("[existing law] the pre-v0.9 base package (3 entries, no Temporal record) opens under its legacy composition of every admission, byte-for-byte", async () => {
    const out: Record<string, unknown> = {};
    for (const a of ADMISSIONS) {
      const dir = copyOf(LEGACY);
      const before = readFileSync(join(dir, "journal.jsonl"));
      const r = await openUnder(dir, a.admission, { audit: true });
      out[a.name] = r.ok
        ? { ok: true, revision: r.campaign.store.head().revision }
        : { ok: false, error: { code: r.error.code, message: r.error.message } };
      if (r.ok) await r.campaign.close();
      expect(r.ok, a.name).toBe(true);
      expect(readFileSync(join(dir, "journal.jsonl")).equals(before), a.name).toBe(true);
    }
    log("g.legacyBase", out);
  });
});

// ===========================================================================================================================
// h. the frozen player+literal journals under EVERY admission composition (production, MS, MS fixture, T1 fixture, legacy)
// ===========================================================================================================================
describe("h. [existing law] the frozen player+literal journals reopen warm and cold under every admission composition, with unchanged receipts", () => {
  for (const [label, pick] of [
    ["stage-less", () => ZERO],
    ["stage-bearing", () => STAGE],
    ["interrupted", () => INTERRUPTED],
    ["authority-only", () => AUTHORITY_ONLY],
    ["authority-then-stage-free-seal", () => AUTHORITY_THEN_SEAL],
  ] as const) {
    it(`[existing law] ${label}: every composition opens warm and audit with the frozen whole-campaign summary and a clean integrity report`, async () => {
      const old = pick();
      const ids = Object.keys(old.captures);
      const table: Record<string, unknown> = {};
      for (const a of ADMISSIONS) {
        const m = await reopenMatrix(old.dir, a.admission, ids, ["warm", "coldAudit"]);
        for (const mode of ["warm", "coldAudit"] as const) {
          const o = m[mode];
          table[`${a.name} / ${mode}`] = {
            ok: o.ok,
            error: o.error ?? null,
            calls: o.calls,
            same: o.ok ? same(o.summary, old.summary) : false,
            violations: o.violations ?? null,
          };
          expect(o.ok, `${a.name} / ${mode}: ${JSON.stringify(o.error)}`).toBe(true);
          expect(o.summary, `${a.name} / ${mode}`).toEqual(old.summary);
          expect(o.violations, `${a.name} / ${mode}`).toEqual([]);
          for (const id of ids)
            expect(o.captures![id], `${a.name} / ${mode} / ${id}`).toEqual(old.captures[id]);
        }
      }
      log(`h.${label}`, table);
    }, 300_000);
  }
});
