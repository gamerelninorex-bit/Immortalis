/* eslint-disable @typescript-eslint/no-explicit-any -- the harness pokes at raw groups, journal bytes and stores */
// F-014B B1 S1 — acceptance cases for the canonical live-versus-historical origin safety guard, beyond the contrast rigs of
// b1-s1-live-origin-guard.test.ts: the raw kernel commit and the trusted in-process gateway, an interrupted old authority completing
// exactly once, retry / conflict / checkpoint / tamper / forged-journal behaviour, a held player-origin continuation, and the
// role/permission/GM-branch matrix under today's player-only schema.
//
//   [existing law]  behaviour of the build that preceded S1, which S1 must PRESERVE (frozen packages: tests/fixtures/b1-s1-frozen)
//   [s1 guard]      the new refusal of a NEW live write of the player pair with the reserved trigger, at the production admission
//   [pure]          pure B0 functions imported by relative path (unexported from the contracts index)
//
// Every negative is one change from an accepted control. A raw kernel commit is a group the coordinator built in one private copy of a
// campaign, with ONE field changed, committed straight to the store of a second private copy at the same pre-state.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  ResolutionRequestSchema,
  TransactionContextSchema,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  canonicalAdmission,
  createFileCampaign,
  verifyTemporalIntegrity,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_CAMPAIGN, T0, at, temporalPublication } from "@immortalis/testkit";
import {
  GmWaitResolutionRequestShapeSchema,
  continuationContextViolation,
  gmContinuationLinkViolation,
  parseGmWaitRequest,
  temporalOriginPairing,
} from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import {
  GM_TRIGGER,
  GUARD_MESSAGE,
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
  openUnder,
  probeCommits,
  proxyStore,
  reopenMatrix,
  request,
  summary,
  thaw,
  viaGateway,
  withContext,
  withTriggerKind,
  type OldJournal,
} from "../support/b1-s1-rigs.ts";
import { SUNSET_LATER } from "../support/gip-sunset.ts";
import { trustedOriginalHeld, advanceOriginal } from "../support/original-pc-target.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_TX,
  PC_TARGET_TX2,
  pcTargetTransaction,
  refuseGipStageOf,
} from "../support/pc-target-advance.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

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
}, 600_000);

const rig = (admission: WriteAdmission | undefined = canonicalAdmission, dir?: string) =>
  gatewayRig(SUNSET_TEMPLATE, admission, dir);
const GM = { ...GM_ADJUDICATION_AUTHORITY };
/** A target strictly short of the sunset: the Temporal kernel finds nothing due, so the transaction has no owner stage. */
const SHORT_OF_SUNSET: CanonicalTime = at(120);

// ===========================================================================================================================
describe("A2 [s1 guard] a raw kernel commit of a group the coordinator did not build", () => {
  it("A2 [s1 guard] the SEAL group of a stage-free transaction: the literal trigger is refused VALUE_INVALID with the guard message and nothing is written; the unchanged group commits (control)", async () => {
    // the group the coordinator builds for an ordinary transaction, captured in one private copy of the stage-less journal
    const a = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!a.ok) throw new Error(JSON.stringify(a.error));
    const probe = probeCommits(a.campaign);
    const built = await coordinatorOn(a.campaign.store).advance(
      request("tx-raw-seal", ORDINARY_TRIGGER, at(1000)),
    );
    expect(built.ok).toBe(true);
    expect(probe.seen.length).toBe(1);
    const seal = probe.seen[0]!.group;
    expect(isSealGroup(seal) && !isAuthorityGroup(seal)).toBe(true);
    expect(
      ((seal.writes.find((w) => /^temporal\/transaction\//.test(w.key)) as any).value as any)
        .stages,
    ).toEqual([]);
    await a.campaign.close();

    // a second private copy at the same pre-state; ONE field of the group changed
    const b = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!b.ok) throw new Error(JSON.stringify(b.error));
    const store = b.campaign.store;
    const before = summary(store);
    const literal = withTriggerKind(seal, GM_TRIGGER);
    expect(withTriggerKind(literal, ORDINARY_TRIGGER)).toEqual(seal); // exactly one field differs
    const refused = await store.commit(literal);
    log("A2.rawSeal", refused);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("VALUE_INVALID");
      expect(refused.error.message).toBe(GUARD_MESSAGE);
    }
    expect(summary(store)).toEqual(before);
    expect(store.lookupReceipt(literal.intent_id)).toBeNull();
    const control = await store.commit(seal);
    expect(control.ok).toBe(true);
    expect(store.head().revision).toBe(before.head.revision + 1);
    expect(b.campaign.verify()).toEqual([]);
    await b.campaign.close();
  });

  it("A2 [s1 guard] the AUTHORITY-OPEN group of a stage-bearing transaction: the literal trigger is refused VALUE_INVALID with the guard message before any stage or authority is durable; the unchanged group commits (control)", async () => {
    const a = await rig(canonicalAdmission);
    const probe = probeCommits(a.campaign);
    expect(await viaGateway(a, pcTargetTransaction("tx-raw-open"))).toEqual(PC_TARGET_COMMITTED);
    const groups = probe.seen.map((s) => s.group);
    expect(groups.length).toBe(3); // authority-open, one credited stage, seal
    expect(isAuthorityGroup(groups[0]!)).toBe(true);
    expect(isSealGroup(groups[2]!)).toBe(true);
    const authority = groups[0]!;
    await a.campaign.close();

    const b = await rig(canonicalAdmission);
    const store = b.campaign.store;
    const before = summary(store);
    const literal = withTriggerKind(authority, GM_TRIGGER);
    expect(withTriggerKind(literal, "player-pc-target-choice")).toEqual(authority); // exactly one field differs
    const refused = await store.commit(literal);
    log("A2.rawOpen", refused);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("VALUE_INVALID");
      expect(refused.error.message).toBe(GUARD_MESSAGE);
    }
    expect(summary(store)).toEqual(before);
    expect(store.getFact(temporalTransactionAuthorityKey("tx-raw-open"))).toBeUndefined();
    // the credited stage and the seal of that transaction cannot land either: they depend on an authority that does not exist
    for (const g of groups.slice(1)) {
      const dependent = await store.commit(withTriggerKind(g, GM_TRIGGER));
      expect(dependent.ok).toBe(false);
    }
    expect(summary(store)).toEqual(before);
    const control = await store.commit(authority);
    expect(control.ok).toBe(true);
    expect(store.head().revision).toBe(before.head.revision + 1);
    await b.campaign.close();
  });

  it("A2 [existing law] a raw re-commit of a record stored before S1 is answered from its receipt BEFORE admission: the stored literal seal and authority groups replay with no new revision", async () => {
    const cases: readonly [string, OldJournal, readonly string[]][] = [
      ["stage-less", ZERO, ["tx-old-literal"]],
      ["stage-bearing", STAGE, [PC_TARGET_TX]],
      ["interrupted", INTERRUPTED, [PC_TARGET_TX]],
      ["authority-only", AUTHORITY_ONLY, [PC_TARGET_TX]],
      ["authority-then-stage-free-seal", AUTHORITY_THEN_SEAL, [PC_TARGET_TX, PC_TARGET_TX2]],
    ];
    for (const [label, old, ids] of cases) {
      const o = await openUnder(copyOf(old.dir), canonicalAdmission);
      if (!o.ok) throw new Error(JSON.stringify(o.error));
      const store = o.campaign.store;
      for (const id of ids) {
        const c = capture(store, id);
        for (const group of [c.authorityGroup, c.sealGroup]) {
          if (!group) continue;
          const head = store.head().revision;
          const res = await store.commit(group);
          expect(res.ok, `${label} ${group.group_id}`).toBe(true);
          if (res.ok) expect((res.value as any).replayed, `${label} ${group.group_id}`).toBe(true);
          expect(store.head().revision, label).toBe(head);
          // one changed field of the same stored group is the store's own conflict, never an admission
          const changed = await store.commit({ ...group, cause: `${group.cause}-changed` });
          expect(changed.ok, label).toBe(false);
          expect(changed.ok ? "" : changed.error.code, label).toBe("INTENT_CONFLICT");
        }
      }
      await o.campaign.close();
    }
  });
});

// ===========================================================================================================================
describe("A2 [s1 guard] the trusted in-process gateway (advanceActivePcToTarget) reaches the same refusal at the same placements", () => {
  it("A2 [s1 guard] stage-bearing: the literal is refused at the first group the kernel sees (the authority-open), the host sees the uniform refusal, and the ordinary control commits three groups", async () => {
    const r = await rig(canonicalAdmission);
    const probe = probeCommits(r.campaign);
    const before = summary(r.campaign.store);
    expect(await viaGateway(r, literalTransaction("tx-gw-open"))).toEqual(REFUSED);
    expect(probe.seen.length).toBe(1);
    expect(isAuthorityGroup(probe.seen[0]!.group)).toBe(true);
    expect(probe.seen[0]!.result.ok).toBe(false);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    expect(summary(r.campaign.store)).toEqual(before);
    // control, one change away: the ordinary kind
    expect(await viaGateway(r, pcTargetTransaction("tx-gw-open"))).toEqual(PC_TARGET_COMMITTED);
    expect(probe.seen.slice(1).map((s) => s.result.ok)).toEqual([true, true, true]);
    expect(r.campaign.store.head().revision).toBe(before.head.revision + 3);
    await r.campaign.close();
  });

  it("A2 [s1 guard] stage-free: a target short of the sunset has no owner stage, so the seal group is the only commit; the literal is refused there and the control commits it", async () => {
    const r = await rig(canonicalAdmission);
    const probe = probeCommits(r.campaign);
    const before = summary(r.campaign.store);
    expect(await viaGateway(r, literalTransaction("tx-gw-seal"), SHORT_OF_SUNSET)).toEqual(REFUSED);
    expect(probe.seen.length).toBe(1);
    expect(isSealGroup(probe.seen[0]!.group) && !isAuthorityGroup(probe.seen[0]!.group)).toBe(true);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    expect(summary(r.campaign.store)).toEqual(before);
    expect(await viaGateway(r, pcTargetTransaction("tx-gw-seal"), SHORT_OF_SUNSET)).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(probe.seen.length).toBe(2);
    expect(r.campaign.store.head().revision).toBe(before.head.revision + 1);
    const sealed = capture(r.campaign.store, "tx-gw-seal");
    expect((sealed.seal!.value as any).stages).toEqual([]);
    expect(sealed.authority).toBeNull();
    await r.campaign.close();
  });

  it("A2 [s1 guard] a refused literal is not remembered: after the refusal the same transaction id is still free for an ordinary request, and a near-miss kind is admitted", async () => {
    const r = await rig(canonicalAdmission);
    expect(await viaGateway(r, literalTransaction("tx-gw-reuse"))).toEqual(REFUSED);
    expect(r.campaign.store.lookupReceipt("tx-gw-reuse")).toBeNull();
    expect(
      await viaGateway(
        r,
        pcTargetTransaction("tx-gw-reuse", {
          trigger: { kind: "GM_INTERPRETED_PC_WAIT_2", ref: "choice-near" },
        }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });
});

// ===========================================================================================================================
describe("A3 an interrupted pre-S1 authority completes exactly once after S1", () => {
  it("A3 [existing law] the durable authority is adopted and only the seal commits; a second identical request replays with no commit at all; authority and seal are each written once", async () => {
    const r = await rig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const probe = probeCommits(r.campaign);
    const before = summary(r.campaign.store);
    const authorityBefore = capture(r.campaign.store, PC_TARGET_TX).authority!;
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    // the coordinator re-presents the authority group, which the kernel answers from the stored receipt BEFORE admission (a replay: the
    // literal it carries is never judged again), and the seal is the one new commit; the credited stage is adopted, not re-written
    expect(
      probe.seen.map((s) => [
        isAuthorityGroup(s.group) ? "authority" : isSealGroup(s.group) ? "seal" : "other",
        s.result.ok ? s.result.value.replayed : s.result.error.code,
      ]),
    ).toEqual([
      ["authority", true],
      ["seal", false],
    ]);
    const after = capture(r.campaign.store, PC_TARGET_TX);
    expect(after.authority).toEqual(authorityBefore);
    expect(after.authority!.version).toBe(1);
    expect(after.seal!.version).toBe(1);
    expect((after.seal!.value as any).trigger.kind).toBe(GM_TRIGGER);
    expect(r.campaign.store.head().revision).toBe(before.head.revision + 1);
    const sealed = summary(r.campaign.store);
    // exactly once: the identical request again is the stored outcome, with no commit and no revision
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(probe.seen.length).toBe(2);
    expect(summary(r.campaign.store)).toEqual(sealed);
    expect(r.campaign.verify()).toEqual([]);
    expect(verifyTemporalIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("A3 [s1 guard] no fresh forbidden opening beside it: a NEW id stating the literal is refused at authority-open and leaves no authority behind, while the old authority still resumes afterwards", async () => {
    const r = await rig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const probe = probeCommits(r.campaign);
    const before = summary(r.campaign.store);
    expect(await viaGateway(r, literalTransaction("tx-fresh-forbidden"))).toEqual(REFUSED);
    expect(probe.seen.length).toBe(1);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    expect(r.campaign.store.getFact(temporalTransactionAuthorityKey("tx-fresh-forbidden"))).toBe(
      undefined,
    );
    expect(summary(r.campaign.store)).toEqual(before);
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });

  it("A3 [existing law] every conflicting restatement of the interrupted id is refused as a conflict, creates no duplicate and changes nothing; the original statement then still completes", async () => {
    const r = await rig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const before = summary(r.campaign.store);
    const base = request(PC_TARGET_TX, GM_TRIGGER, SUNSET_LATER);
    const variants: readonly [string, Record<string, unknown>][] = [
      ["different target", { ...base, requested: { target: at(250), condition: null } }],
      [
        "different trigger kind (ordinary)",
        { ...base, trigger: { kind: ORDINARY_TRIGGER, ref: base.trigger.ref } },
      ],
      ["different trigger ref", { ...base, trigger: { kind: GM_TRIGGER, ref: "ref-other" } }],
      ["different cause", { ...base, cause: "cause-other" }],
      [
        "different publication",
        { ...base, publication: { basis: "basis-other", secrecy: base.publication.secrecy } },
      ],
    ];
    for (const [label, variant] of variants) {
      const res = await r.coordinator.advance(variant);
      const e: any = res.ok ? null : res.error;
      expect(res.ok, label).toBe(false);
      expect(e.code, label).toBe("TRANSACTION_CONFLICT");
      expect(e.details.code, label).toBe("INTENT_CONFLICT");
      expect(summary(r.campaign.store), label).toEqual(before);
    }
    expect(await viaGateway(r, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(r.campaign.store.head().revision).toBe(before.head.revision + 1);
    expect(capture(r.campaign.store, PC_TARGET_TX).authority!.version).toBe(1);
    await r.campaign.close();
  });
});

// ===========================================================================================================================
describe("A4 retry, checkpoint re-verification, tamper and journal integrity", () => {
  it("A4 [existing law] replay never consults the live check: every frozen journal opens warm and cold under an admission whose live check throws", async () => {
    const noLive: WriteAdmission = {
      ...canonicalAdmission,
      check: () => {
        throw new Error("the live check was consulted while opening a journal");
      },
    };
    for (const old of [ZERO, STAGE, INTERRUPTED, AUTHORITY_ONLY, AUTHORITY_THEN_SEAL]) {
      const m = await reopenMatrix(old.dir, noLive, Object.keys(old.captures));
      for (const [mode, o] of Object.entries(m)) {
        expect(o.ok, `${mode}: ${JSON.stringify(o.error)}`).toBe(true);
        expect(o.summary, mode).toEqual(old.summary);
      }
    }
  });

  it("A4 [existing law] checkpoint old-history re-verification: a forced strict replay judges every entry of the old journals with the unchanged verifier and finds every one admitted", async () => {
    for (const old of [ZERO, STAGE, AUTHORITY_THEN_SEAL]) {
      const m = await reopenMatrix(old.dir, canonicalAdmission, Object.keys(old.captures), [
        "coldAudit",
        "coldInvalidated",
      ]);
      for (const mode of ["coldAudit", "coldInvalidated"] as const) {
        expect(m[mode].ok, mode).toBe(true);
        expect(m[mode].calls, mode).toBe(old.headRevision);
        expect(m[mode].verdicts!.size, mode).toBe(old.headRevision);
        expect(
          [...m[mode].verdicts!.values()].every((v) => v === null),
          mode,
        ).toBe(true);
        expect(m[mode].summary, mode).toEqual(old.summary);
      }
      // the invalidated mode earned a fresh checkpoint over the whole old journal
      expect(m.coldInvalidated.checkpointRevisionAfter).toBe(old.headRevision);
    }
  });

  it("A4 [existing law] canonical tamper: one same-length byte edit of the stored literal record is refused by a cold open of each frozen journal; the untouched copy opens (control)", async () => {
    for (const [label, old] of [
      ["stage-less", ZERO],
      ["stage-bearing", STAGE],
      ["interrupted", INTERRUPTED],
      ["authority-only", AUTHORITY_ONLY],
      ["authority-then-stage-free-seal", AUTHORITY_THEN_SEAL],
    ] as const) {
      for (const mode of ["audit", "invalidated"] as const) {
        const options =
          mode === "audit" ? { audit: true } : { idSuffix: "+B1S1-CHECKPOINT-INVALIDATED" };
        const dir = copyOf(old.dir);
        const journal = join(dir, "journal.jsonl");
        const original = readFileSync(journal, "utf8");
        expect(original).toContain(`"${GM_TRIGGER}"`);
        writeFileSync(journal, original.replace(`"${GM_TRIGGER}"`, `"GM_INTERPRETED_PC_WAIX"`));
        const tampered = await openUnder(dir, canonicalAdmission, options);
        log("A4.tamper", {
          label,
          mode,
          result: tampered.ok
            ? "OPENED"
            : { code: tampered.error.code, message: tampered.error.message },
        });
        expect(tampered.ok, `${label} ${mode}`).toBe(false);
        if (tampered.ok) await tampered.campaign.close();
        writeFileSync(journal, original);
        const control = await openUnder(dir, canonicalAdmission, options);
        expect(control.ok, `${label} ${mode} control`).toBe(true);
        if (control.ok) await control.campaign.close();
      }
    }
  });

  it("A4 [existing law] a chain-valid FORGED journal: a hand-built GM-pair record is refused by a production open (typed value), while a hand-built player+literal record opens as player-origin history, exactly as before S1 (the authorship limit is unchanged, not solved)", async () => {
    /** writes the journal with a store that has the owner registry but NO admission, so no check ran at write time */
    const forged = async (label: string, context: object, kind: string): Promise<string> => {
      const dir = tempDir();
      const created = await createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: CANONICAL_OWNER_REGISTRY,
        buildId: `s1-forge-${label}`,
      });
      if (!created.ok) throw new Error(JSON.stringify(created.error));
      const proxied = proxyStore(created.value, (g) => withContext(g, context));
      const c = coordinatorOn(proxied.store);
      await must(c.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
      const res = await c.advance(request(`tx-forged-${label}`, kind, at(200)));
      expect(res.ok, label).toBe(true); // no admission at write time: the forged record IS committed into a valid chain
      await created.value.close();
      return dir;
    };
    const gmDir = await forged("gm", GM, GM_TRIGGER);
    const gmStrict = await CanonicalCampaign.open(gmDir, {
      buildId: "s1-forged-open",
      audit: true,
    });
    const gmWarm = await CanonicalCampaign.open(gmDir, { buildId: "s1-forged-open-2" });
    expect(gmStrict.ok).toBe(false);
    expect(gmWarm.ok).toBe(false);
    if (gmStrict.ok) await gmStrict.value.close();
    if (gmWarm.ok) await gmWarm.value.close();

    const playerDir = await forged("player", PLAYER, GM_TRIGGER);
    const playerStrict = await CanonicalCampaign.open(playerDir, {
      buildId: "s1-handbuilt-open",
      audit: true,
    });
    expect(playerStrict.ok).toBe(true);
    if (playerStrict.ok) {
      const stored = coordinatorOn(playerStrict.value.store).transaction("tx-forged-player")!.value;
      expect(stored.trigger.kind).toBe(GM_TRIGGER);
      expect(stored.context).toEqual(PLAYER);
      expect(playerStrict.value.verify()).toEqual([]);
      await playerStrict.value.close();
    }
  });
});

// ===========================================================================================================================
describe("A5 a held player-origin continuation", () => {
  /** A held remainder from an ORDINARY player transaction: GIP's stage is refused once, so the kernel holds the work. */
  async function heldRig() {
    const r = await rig(canonicalAdmission);
    const restore = refuseGipStageOf(r);
    expect(await viaGateway(r, pcTargetTransaction(PC_TARGET_TX), SUNSET_LATER)).toEqual(
      PC_TARGET_COMMITTED,
    );
    restore();
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    return r;
  }
  const otherOrdinary = (id: string) =>
    pcTargetTransaction(id, {
      trigger: { kind: "player-pc-target-resume-choice", ref: "choice-resume" },
    });

  it("A5 [existing law] the continuation may state a DIFFERENT ordinary trigger: it consumes exactly the held remainder and keeps the durable player provenance of the sealed prior transaction", async () => {
    const r = await heldRig();
    const held = r.coordinator.transaction(PC_TARGET_TX)!.value;
    expect(held.context).toEqual(PLAYER);
    const resume = otherOrdinary(PC_TARGET_TX2);
    expect((resume as any).trigger.kind).not.toBe(held.trigger.kind);
    expect(await advanceOriginal(trustedOriginalHeld(r, { transaction: resume }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const resumed = r.coordinator.transaction(PC_TARGET_TX2)!.value;
    expect(resumed.continues).toBe(PC_TARGET_TX);
    expect(resumed.context).toEqual(held.context);
    expect(resumed.trigger.kind).toBe("player-pc-target-resume-choice");
    expect(resumed.requested).toEqual(held.requested);
    expect(r.coordinator.state()!.value.continuation).toBeNull();
    // the prior sealed record is untouched
    expect(r.coordinator.transaction(PC_TARGET_TX)!.value).toEqual(held);
    await r.campaign.close();
  });

  it("A5 [s1 guard] the continuation itself may not state the reserved literal: it is refused at authority-open, the hold stays intact, and the ordinary continuation still resumes it", async () => {
    const r = await heldRig();
    const probe = probeCommits(r.campaign);
    const before = summary(r.campaign.store);
    const literal = pcTargetTransaction(PC_TARGET_TX2, {
      trigger: { kind: GM_TRIGGER, ref: "choice-resume-literal" },
    });
    expect(await advanceOriginal(trustedOriginalHeld(r, { transaction: literal }))).toEqual(
      REFUSED,
    );
    expect(probe.seen.length).toBe(1);
    expect(isAuthorityGroup(probe.seen[0]!.group)).toBe(true);
    expect(probe.seen[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    expect(summary(r.campaign.store)).toEqual(before);
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    expect(
      await advanceOriginal(trustedOriginalHeld(r, { transaction: otherOrdinary(PC_TARGET_TX2) })),
    ).toEqual(PC_TARGET_COMMITTED);
    await r.campaign.close();
  });

  it("A5 [s1 guard] a stage-free CONTINUATION seal (its stage is refused again, so nothing is credited) may not state the literal either; the unchanged seal commits and holds the work again (control)", async () => {
    const r = await heldRig();
    const restoreStage = refuseGipStageOf(r); // the continuing transaction credits no stage: its seal group is the last commit
    const probe = probeCommits(r.campaign, (g) =>
      isSealGroup(g) && !isAuthorityGroup(g) ? withTriggerKind(g, GM_TRIGGER) : g,
    );
    await advanceOriginal(trustedOriginalHeld(r, { transaction: otherOrdinary(PC_TARGET_TX2) }));
    const sealAttempts = probe.seen.filter((x) => isSealGroup(x.group));
    expect(sealAttempts.length).toBe(1);
    const judged = sealAttempts[0]!.group.writes.find((w) =>
      /^temporal\/transaction\//.test(w.key),
    )!.value as any;
    expect(judged.stages).toEqual([]);
    expect(judged.continues).toBe(PC_TARGET_TX);
    expect(judged.trigger.kind).toBe(GM_TRIGGER);
    expect(sealAttempts[0]!.result.error).toMatchObject({
      code: "VALUE_INVALID",
      message: GUARD_MESSAGE,
    });
    expect(r.campaign.store.getFact(temporalTransactionKey(PC_TARGET_TX2))).toBeUndefined();
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    // control, one change away: the seal is not rewritten
    probe.restore();
    expect(
      await advanceOriginal(trustedOriginalHeld(r, { transaction: otherOrdinary(PC_TARGET_TX2) })),
    ).toEqual(PC_TARGET_COMMITTED);
    const sealed = r.coordinator.transaction(PC_TARGET_TX2)!.value;
    expect(sealed.stages).toEqual([]);
    expect(sealed.continues).toBe(PC_TARGET_TX);
    expect(sealed.trigger.kind).toBe("player-pc-target-resume-choice");
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX2,
    });
    restoreStage();
    await r.campaign.close();
  });

  it("A5 [pure] the held remainder cannot become a GM remainder: origin read from the SEALED prior record refuses a GM context, and the kernel refuses a GM-pair continuation at the typed value", async () => {
    const r = await heldRig();
    // the origin comes from the durable sealed record, not from a caller-supplied argument
    const prior = capture(r.campaign.store, PC_TARGET_TX).seal!.value as any;
    expect(prior.context).toEqual(PLAYER);
    expect(continuationContextViolation({ context: prior.context }, { context: GM })).toMatch(
      /exactly the role and permission/,
    );
    expect(
      continuationContextViolation({ context: prior.context }, { context: { ...PLAYER } }),
    ).toBeNull();
    // and the link check alone does not authenticate it (documented: S4 must bind origin to the sealed record separately)
    expect(
      gmContinuationLinkViolation(
        {
          continues: PC_TARGET_TX,
          gm_wait: { phase: "CONTINUATION", from_transaction: PC_TARGET_TX },
        },
        { from_transaction: PC_TARGET_TX },
      ),
    ).toBeNull();
    // the kernel: the same ordinary continuation with its context rewritten to the GM pair is refused (typed value), literal or not
    for (const kind of [undefined, GM_TRIGGER] as const) {
      const probe = probeCommits(r.campaign, (g) =>
        withContext(kind ? withTriggerKind(g, kind) : g, GM),
      );
      const before = summary(r.campaign.store);
      expect(
        await advanceOriginal(
          trustedOriginalHeld(r, { transaction: otherOrdinary(PC_TARGET_TX2) }),
        ),
      ).toEqual(REFUSED);
      expect(probe.seen.length).toBe(1);
      const e = probe.seen[0]!.result.error;
      expect(e.code).toBe("VALUE_INVALID");
      expect(e.message).toMatch(/^value violates the .+ contract$/);
      expect(e.message).not.toBe(GUARD_MESSAGE); // refused by the typed value, before the origin guard is reached
      expect(summary(r.campaign.store)).toEqual(before);
      probe.restore();
    }
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    await r.campaign.close();
  });

  it("A5 [existing law] a wrong context, a wrong or fabricated id and a wrong destination are each refused with nothing written, the hold intact", async () => {
    const r = await heldRig();
    const before = summary(r.campaign.store);
    const bad: readonly [string, () => Promise<unknown>][] = [
      [
        "GM context",
        () =>
          advanceOriginal(
            trustedOriginalHeld(r, {
              transaction: pcTargetTransaction(PC_TARGET_TX2, { context: GM }),
            }),
          ),
      ],
      [
        "fabricated held id",
        () =>
          advanceOriginal(
            trustedOriginalHeld(r, {
              held: { from_transaction: "tx-never-committed", target: SUNSET_LATER },
              transaction: otherOrdinary(PC_TARGET_TX2),
            }),
          ),
      ],
      [
        "the held id as the new id",
        () => advanceOriginal(trustedOriginalHeld(r, { transaction: otherOrdinary(PC_TARGET_TX) })),
      ],
      [
        "wrong destination",
        () =>
          advanceOriginal(
            trustedOriginalHeld(r, {
              held: { from_transaction: PC_TARGET_TX, target: at(250) },
              transaction: otherOrdinary(PC_TARGET_TX2),
            }),
          ),
      ],
      [
        "wrong unit",
        () =>
          advanceOriginal(
            trustedOriginalHeld(r, {
              held: { from_transaction: PC_TARGET_TX, target: { unit: "other-unit", value: 300 } },
              transaction: otherOrdinary(PC_TARGET_TX2),
            }),
          ),
      ],
      [
        "fresh forbidden literal on a wrong destination",
        () =>
          advanceOriginal(
            trustedOriginalHeld(r, {
              held: { from_transaction: PC_TARGET_TX, target: at(250) },
              transaction: pcTargetTransaction(PC_TARGET_TX2, {
                trigger: { kind: GM_TRIGGER, ref: "choice-x" },
              }),
            }),
          ),
      ],
    ];
    for (const [label, attempt] of bad) {
      expect(await attempt(), label).toEqual(REFUSED);
      expect(summary(r.campaign.store), label).toEqual(before);
    }
    expect(r.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    await r.campaign.close();
  });
});

// ===========================================================================================================================
describe("A6 every role/permission combination and the GM branch under today's player-only schema", () => {
  const ROLES = ["role.player", "role.gm", "role.referee", "role.operator", "ROLE.PLAYER", ""];
  const PERMISSIONS = [
    "permission.player_choice.commit",
    "permission.rule.adjudicate",
    "permission.other",
    "",
  ];
  const isPlayerPair = (role: string, permission: string) =>
    role === PLAYER.role && permission === PLAYER.permission;

  it("A6 [existing law] the shared context and request schemas accept exactly one pair of the whole role x permission grid, for the ordinary kind and for the literal alike", () => {
    let accepted = 0;
    for (const role of ROLES)
      for (const permission of PERMISSIONS)
        for (const kind of [ORDINARY_TRIGGER, GM_TRIGGER]) {
          const context = { role, permission };
          const want = isPlayerPair(role, permission);
          expect(TransactionContextSchema.safeParse(context).success, `${role}/${permission}`).toBe(
            want,
          );
          const parsed = ResolutionRequestSchema.safeParse(
            request("tx-grid", kind, at(200), context),
          );
          expect(parsed.success, `${role}/${permission}/${kind}`).toBe(want);
          if (parsed.success) accepted++;
          // the pure B0 pairing agrees where the schema can express the row
          if (want && kind === GM_TRIGGER)
            expect(temporalOriginPairing(context, kind)).toBe("DENY");
        }
    expect(accepted).toBe(2); // the player pair, with each of the two kinds: the schema alone does not tell the literal apart
  });

  it("A6 [s1 guard] through the coordinator the grid commits one cell only (player pair, ordinary kind); every other cell writes nothing, and the player pair with the literal is the S1 refusal", async () => {
    const o = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const c = coordinatorOn(o.campaign.store);
    const store = o.campaign.store;
    let n = 0;
    let committed = 0;
    for (const role of ROLES)
      for (const permission of PERMISSIONS)
        for (const kind of [ORDINARY_TRIGGER, GM_TRIGGER]) {
          const head = store.head().revision;
          const res = await c.advance(
            request(`tx-grid-${n}`, kind, at(1000 + n), { role, permission }),
          );
          n++;
          const ok = isPlayerPair(role, permission) && kind === ORDINARY_TRIGGER;
          expect(res.ok, `${role}/${permission}/${kind}`).toBe(ok);
          expect(store.head().revision, `${role}/${permission}/${kind}`).toBe(head + (ok ? 1 : 0));
          if (res.ok) committed++;
          else if (isPlayerPair(role, permission))
            expect((res.error as any).code, kind).toBe("VALUE_INVALID");
          else expect((res.error as any).code, `${role}/${permission}`).toBe("INPUT_INVALID");
        }
    expect(committed).toBe(1);
    await o.campaign.close();
  });

  it("A6 [existing law] a GM-pair value cannot reach the kernel by any trigger: a raw group rewritten to the GM pair is refused at the typed value (not by the S1 guard) with the literal or without", async () => {
    const r = await rig(canonicalAdmission);
    for (const [label, rewrite] of [
      ["GM pair + ordinary", (g: any) => withContext(g, GM)],
      ["GM pair + literal", (g: any) => withContext(withTriggerKind(g, GM_TRIGGER), GM)],
      [
        "mixed pair + literal",
        (g: any) =>
          withContext(withTriggerKind(g, GM_TRIGGER), {
            role: GM.role,
            permission: PLAYER.permission,
          }),
      ],
    ] as const) {
      const rr = await rig(canonicalAdmission);
      const probe = probeCommits(rr.campaign, rewrite);
      const before = summary(rr.campaign.store);
      expect(await viaGateway(rr, pcTargetTransaction("tx-gm-ctx")), label).toEqual(REFUSED);
      expect(probe.seen.length, label).toBe(1);
      const e = probe.seen[0]!.result.error;
      expect(e.code, label).toBe("VALUE_INVALID");
      expect(e.message, label).toMatch(/^value violates the .+ contract$/);
      expect(summary(rr.campaign.store), label).toEqual(before);
      await rr.campaign.close();
    }
    await r.campaign.close();
  });

  it("A6 [existing law] the strict GM waiting request of the B0 module is a shape verdict only: the shared request schema and the coordinator refuse it, and no malformed variant is admitted either", async () => {
    const gmRequest = {
      transaction_id: "gm-wait-tx-1",
      cause: "cause-gm-wait-1",
      trigger: { kind: GM_TRIGGER, ref: "ref-gm-wait-1" },
      continues: null,
      requested: { target: { unit: "time-unit-fixture", value: 1120 }, condition: null },
      context: { ...GM },
      publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
      gm_wait: {
        phase: "INITIAL",
        duration_value: 2,
        duration_unit: "minute",
        observed_basis: { unit: "time-unit-fixture", value: 1000 },
        interpretation_mode: "EXPLICIT_DURATION",
        conversion_rule_version: "SI_SUBDAY_V1",
        catalogue_sha256: "0123456789abcdef".repeat(4),
      },
    };
    // the B0 shape accepts it (the positive strict branch exists only as a pure shape)
    expect(GmWaitResolutionRequestShapeSchema.safeParse(gmRequest).success).toBe(true);
    expect(parseGmWaitRequest(gmRequest).ok).toBe(true);
    const variants: readonly [string, Record<string, unknown>][] = [
      ["the strict GM request", gmRequest],
      ["GM request with the player pair", { ...gmRequest, context: { ...PLAYER } }],
      [
        "GM pair, gm_wait member removed",
        Object.fromEntries(Object.entries(gmRequest).filter(([k]) => k !== "gm_wait")),
      ],
      [
        "GM pair + ordinary trigger + gm_wait",
        { ...gmRequest, trigger: { kind: ORDINARY_TRIGGER, ref: "r" } },
      ],
      ["player pair + literal + gm_wait member", { ...gmRequest, context: { ...PLAYER } }],
      ["gm_wait with a wrong phase", { ...gmRequest, gm_wait: { phase: "RESUME" } }],
      [
        "gm_wait with an extra member",
        { ...gmRequest, gm_wait: { ...gmRequest.gm_wait, extra: 1 } },
      ],
    ];
    const o = await openUnder(copyOf(ZERO.dir), canonicalAdmission);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const store = o.campaign.store;
    const c = coordinatorOn(store);
    const before = summary(store);
    for (const [label, variant] of variants) {
      expect(ResolutionRequestSchema.safeParse(variant).success, label).toBe(false);
      const res = await c.advance(variant);
      expect(res.ok, label).toBe(false);
      expect(res.ok ? "" : (res.error as any).code, label).toBe("INPUT_INVALID");
    }
    expect(summary(store)).toEqual(before);
    await o.campaign.close();
  });
});
