/* eslint-disable @typescript-eslint/no-explicit-any -- evidence harness: it pokes at raw groups, manifests, journal bytes and stores */
// F-014B B1 S1 — EVIDENCE E2: discriminating contrasts for the historical-preserve / live-deny contract (Q-HIST-1 Option A).
//
// EVIDENCE ONLY. Builds NO production code. Every wrapper below is TEST CODE. No title claims PASS or ELIGIBLE.
//   [existing law]  characterizes behaviour of the UNCHANGED build (base 0cff287) that S1 must PRESERVE.
//   [simulation]    uses a TEST-LOCAL admission wrapper to show what a phase-aware live deny would do. It claims nothing about S1.
//   [pure]          pure B0 functions imported by relative path (unexported from the contracts index).
//
// Design rule: every negative is ONE change from an accepted control (the trigger kind, the transaction id, the placement, or one
// wrapper switch). The "old" journals are written by the unchanged production admission in `beforeAll`; once S1 lands those
// generators can no longer commit a player+literal record, so S1's own tests must read FROZEN copies of these journals
// (see the answer file); this file shows the rigs that must then pass.
//
// Evidence lines: set B1S1_LOG=<file> to append every observation as one JSON line.
import { appendFileSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalAdmission,
  economyRealizationProvider,
  epistemicPacketProvider,
  gipSunsetExpiryProvider,
  ktiTransferResultCloseProvider,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  namedActorCapabilityCloseProvider,
  pcCapabilityCloseProvider,
  populationStageProvider,
  productionCompletionProvider,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  transactionAuthorityIntentId,
  transactionIntentId,
  verifyTemporalIntegrity,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  worldSourceDeliveryProvider,
  type CampaignStore,
  type WriteAdmission,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  T0,
  at,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import {
  GM_INTERPRETED_PC_WAIT,
  temporalOriginPairing,
} from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 table; unexported from the contracts index
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { SUNSET_LATER, SUNSET_MID } from "../support/gip-sunset.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  PC_TARGET_TX,
  PC_TARGET_UNKNOWN,
  crashWhen,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import {
  advanceOriginal,
  originalSunsetCampaign,
  trustedOriginalTarget,
} from "../support/original-pc-target.ts";

export const GM_TRIGGER = GM_INTERPRETED_PC_WAIT;
export const ORDINARY_TRIGGER = "operator-progression-choice"; // a kind the shipped operator states (operator/src/commands.ts)
export const NEAR_MISS_TRIGGERS = ["gm_interpreted_pc_wait", "GM_INTERPRETED_PC_WAIT_2"] as const; // valid opaque Ids, NOT the literal
export const PLAYER = { ...PLAYER_CHOICE_AUTHORITY };
const REFUSED = JSON.parse(PC_TARGET_REFUSAL);
const PAD = 130; // enough ordinary commits that the journal crosses CHECKPOINT_INTERVAL (128) AFTER the historical record

export const log = (label: string, v: unknown) => {
  if (process.env["B1S1_LOG"])
    appendFileSync(process.env["B1S1_LOG"], `[E2] ${label} ${JSON.stringify(v)}\n`);
};

// ---------------------------------------------------------------------------------------------------------------------------
// shared rigs (copied in spirit from the E1 corpus, which is immutable and exports nothing)
export const shippedProviders = () =>
  new StageProviderRegistry([
    productionCompletionProvider,
    productionSourceDeltaProvider,
    worldSourceDeliveryProvider,
    productionReserveInflowProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    populationStageProvider,
    epistemicPacketProvider,
    ktiTransferResultCloseProvider,
    namedActorCapabilityCloseProvider,
    pcCapabilityCloseProvider,
    gipSunsetExpiryProvider,
  ]);

export const request = (
  id: string,
  kind: string,
  target: unknown = at(200),
  context: object = PLAYER,
) => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind, ref: `ref-${id}` },
  continues: null,
  requested: { target, condition: null },
  context,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});

/** PRODUCTION-admission campaign: no extension, no fixture admission, no synthetic owner (as E1 H1-P1). */
async function productionCampaign(dir: string, admission?: WriteAdmission) {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "b1s1-e2",
      ...(admission ? { testkitFixtureAdmission: admission } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  await must(
    campaign.initializePcStandingInstructionLedger({
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
    }),
  );
  await must(
    campaign.bindPlayerCharacter({
      ...publication(4),
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      insertion: fixtureInsertionFact(),
    }),
  );
  return campaign;
}

const coordinatorOn = (store: CampaignStore) => new TemporalCoordinator(store, shippedProviders());

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

/** Whole-campaign custody: head, every fact, every receipt of every fact's provenance. Equality of two of these is equality of history. */
export function summary(store: CampaignStore) {
  const facts = store.listFacts();
  return {
    head: clone(store.head()),
    facts: facts.map((f) => clone(f)),
    receipts: facts.map((f) => clone(store.lookupReceipt(f.provenance.intent_id))),
  };
}

/** The exact transaction, its context, its (optional) authority and the receipts of both. */
export function capture(store: CampaignStore, id: string) {
  const sealIntent = transactionIntentId(id);
  const authIntent = transactionAuthorityIntentId(id);
  return {
    seal: clone(store.getFact(temporalTransactionKey(id))),
    authority: clone(store.getFact(temporalTransactionAuthorityKey(id))),
    sealReceipt: clone(store.lookupReceipt(sealIntent)),
    authorityReceipt: clone(store.lookupReceipt(authIntent)),
    sealGroup: clone(store.committedGroup(sealIntent)),
    authorityGroup: clone(store.committedGroup(authIntent)),
  };
}

const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const copyOf = (dir: string): string => {
  const out = tempDir();
  cpSync(dir, out, { recursive: true });
  mkdirSync(join(out, "history"), { recursive: true });
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------------
// opening a package under a given admission, counting how many journal entries were judged by `verifyHistorical`
export interface Spy {
  readonly admission: WriteAdmission;
  readonly calls: () => number;
}
export function spy(base: WriteAdmission, idSuffix = ""): Spy {
  let n = 0;
  const admission: WriteAdmission = {
    ...base,
    ...(idSuffix ? { historyVerificationId: `${base.historyVerificationId ?? "structural"}${idSuffix}` } : {}),
    verifyHistorical: (g, s) => {
      n++;
      return base.verifyHistorical?.(g, s) ?? null;
    },
  };
  return { admission, calls: () => n };
}

export type Opened =
  | { ok: true; campaign: CanonicalCampaign; calls: number }
  | { ok: false; error: { code: string; message: string; details?: unknown }; calls: number };

export async function openUnder(
  dir: string,
  admission: WriteAdmission,
  o: { audit?: boolean; idSuffix?: string; extension?: any } = {},
): Promise<Opened> {
  const s = spy(admission, o.idSuffix);
  const r = await CanonicalCampaign.open(dir, {
    buildId: "b1s1-e2-reopen",
    ...(o.audit ? { audit: true } : {}),
    ...(o.extension ? { extension: o.extension } : {}),
    testkitFixtureAdmission: s.admission,
  });
  return r.ok
    ? { ok: true, campaign: r.value, calls: s.calls() }
    : { ok: false, error: r.error as any, calls: s.calls() };
}

export const MODES = {
  warm: {},
  coldAudit: { audit: true },
  // a verifier-identity change is how a checkpoint is invalidated: the open is forced into one strict whole-journal replay
  coldInvalidated: { idSuffix: "+B1S1-E2-CHECKPOINT-INVALIDATED" },
} as const;
export type ModeName = keyof typeof MODES;

export interface ReopenObservation {
  readonly ok: boolean;
  readonly calls: number;
  readonly error?: { code: string; message: string };
  readonly summary?: ReturnType<typeof summary>;
  readonly captures?: Record<string, ReturnType<typeof capture>>;
  readonly violations?: unknown;
  readonly checkpointRevisionAfter?: number;
}

/** Opens a PRIVATE COPY of `dir` in every mode (a transition open rewrites the manifest), observes, closes. */
export async function reopenMatrix(
  dir: string,
  admission: WriteAdmission,
  txIds: readonly string[],
  modes: readonly ModeName[] = ["warm", "coldAudit", "coldInvalidated"],
  extension?: any,
): Promise<Record<ModeName, ReopenObservation>> {
  const out: Partial<Record<ModeName, ReopenObservation>> = {};
  for (const mode of modes) {
    const copy = copyOf(dir);
    const r = await openUnder(copy, admission, { ...MODES[mode], ...(extension ? { extension } : {}) });
    if (!r.ok) {
      out[mode] = { ok: false, calls: r.calls, error: { code: r.error.code, message: r.error.message } };
      continue;
    }
    const store = r.campaign.store;
    out[mode] = {
      ok: true,
      calls: r.calls,
      summary: summary(store),
      captures: Object.fromEntries(txIds.map((id) => [id, capture(store, id)])),
      violations: [...r.campaign.verify(), ...verifyTemporalIntegrity(store)],
      checkpointRevisionAfter: manifestOf(copy).head.checkpoint.revision,
    };
    await r.campaign.close();
  }
  return out as Record<ModeName, ReopenObservation>;
}

// ---------------------------------------------------------------------------------------------------------------------------
// journals written by the UNCHANGED production admission (base 0cff287)
interface OldJournal {
  readonly dir: string;
  readonly summary: ReturnType<typeof summary>;
  readonly captures: Record<string, ReturnType<typeof capture>>;
  readonly revisions: Record<string, number>;
  readonly headRevision: number;
}

/** (a) stage-less: ordinary tx, player+literal tx, then PAD ordinary commits so a checkpoint lies AFTER the historical record. */
async function buildOldZeroStage(): Promise<OldJournal> {
  const dir = tempDir();
  const campaign = await productionCampaign(dir);
  const c = coordinatorOn(campaign.store);
  await must(c.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  await must(c.advance(request("tx-old-ordinary", ORDINARY_TRIGGER, at(150))));
  await must(c.advance(request("tx-old-literal", GM_TRIGGER, at(200))));
  for (let i = 0; i < PAD; i++) await must(c.advance(request(`tx-pad-${i}`, ORDINARY_TRIGGER, at(201 + i))));
  const ids = ["tx-old-ordinary", "tx-old-literal"];
  const out: OldJournal = {
    dir,
    summary: summary(campaign.store),
    captures: Object.fromEntries(ids.map((id) => [id, capture(campaign.store, id)])),
    revisions: Object.fromEntries(
      ids.map((id) => [id, campaign.store.lookupReceipt(transactionIntentId(id))!.revision]),
    ),
    headRevision: campaign.store.head().revision,
  };
  await campaign.close();
  return out;
}

/** a closed, pristine gateway campaign built only by shipped owner paths; every use takes a private copy */
let SUNSET_TEMPLATE: string;
async function gatewayTemplate(): Promise<string> {
  const s = await originalSunsetCampaign(SUNSET_MID);
  await s.campaign.close();
  return s.dirs.campaignDir;
}

export const literalTransaction = (id = PC_TARGET_TX) =>
  pcTargetTransaction(id, { trigger: { kind: GM_TRIGGER, ref: "choice-gm-literal" } });

/** the gateway over a private copy of the template, opened under `admission` */
export async function gatewayRig(admission: WriteAdmission = canonicalAdmission, dir = copyOf(SUNSET_TEMPLATE)) {
  const r = await openUnder(dir, admission);
  if (!r.ok) throw new Error(`gateway rig did not open: ${JSON.stringify(r.error)}`);
  return { dir, campaign: r.campaign, coordinator: coordinatorOn(r.campaign.store) };
}
type Rig = Awaited<ReturnType<typeof gatewayRig>>;

export const viaGateway = (
  rig: Pick<Rig, "campaign">,
  transaction: Record<string, unknown>,
  target = SUNSET_LATER,
) => advanceOriginal(trustedOriginalTarget(rig, { target, transaction }));

/** (b) stage-bearing: the shipped gateway commits authority-open, one GIP stage and the seal under player + literal; then padding. */
async function buildOldStageBearing(): Promise<OldJournal> {
  const rig = await gatewayRig();
  expect(await viaGateway(rig, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
  const c = coordinatorOn(rig.campaign.store);
  for (let i = 0; i < PAD; i++) await must(c.advance(request(`tx-pad-${i}`, ORDINARY_TRIGGER, at(301 + i))));
  const out: OldJournal = {
    dir: rig.dir,
    summary: summary(rig.campaign.store),
    captures: { [PC_TARGET_TX]: capture(rig.campaign.store, PC_TARGET_TX) },
    revisions: {
      [PC_TARGET_TX]: rig.campaign.store.lookupReceipt(transactionIntentId(PC_TARGET_TX))!.revision,
    },
    headRevision: rig.campaign.store.head().revision,
  };
  await rig.campaign.close();
  return out;
}

/** (c) interrupted stage-bearing: authority-open and the credited stage committed; the SEAL group is not (store wrapper), then closed. */
async function buildOldInterrupted(): Promise<OldJournal> {
  const rig = await gatewayRig();
  const isSeal = (g: CommitGroup) => g.writes.some((w) => w.key === temporalTransactionKey(PC_TARGET_TX));
  crashWhen(rig as never, isSeal);
  expect(await viaGateway(rig, literalTransaction())).toEqual(PC_TARGET_UNKNOWN);
  const store = (rig.campaign as any).store as CampaignStore;
  const out: OldJournal = {
    dir: rig.dir,
    summary: summary(store),
    captures: { [PC_TARGET_TX]: capture(store, PC_TARGET_TX) },
    revisions: {},
    headRevision: store.head().revision,
  };
  await rig.campaign.close();
  return out;
}

let ZERO: OldJournal;
let STAGE: OldJournal;
let INTERRUPTED: OldJournal;

beforeAll(async () => {
  SUNSET_TEMPLATE = await gatewayTemplate();
  [ZERO, STAGE, INTERRUPTED] = [await buildOldZeroStage(), await buildOldStageBearing(), await buildOldInterrupted()];
  log("builds", {
    zero: { head: ZERO.headRevision, revisions: ZERO.revisions, checkpoint: manifestOf(ZERO.dir).head.checkpoint.revision },
    stage: { head: STAGE.headRevision, revisions: STAGE.revisions, checkpoint: manifestOf(STAGE.dir).head.checkpoint.revision },
    interrupted: { head: INTERRUPTED.headRevision, checkpoint: manifestOf(INTERRUPTED.dir).head.checkpoint.revision },
  });
}, 600_000);

// ---------------------------------------------------------------------------------------------------------------------------
describe("a. historical seal-only player+literal transaction (no stage, no authority record)", () => {
  it("[existing law] original-version production admission recorded it; the record sits INSIDE the checkpoint prefix, so warm and cold reopen are genuinely different rigs", () => {
    const cp = manifestOf(ZERO.dir).head.checkpoint.revision;
    const lit = ZERO.captures["tx-old-literal"]!;
    log("a.record", { checkpoint: cp, literalRevision: ZERO.revisions["tx-old-literal"], head: ZERO.headRevision });
    expect(cp).toBe(128);
    expect(ZERO.revisions["tx-old-literal"]).toBeLessThan(cp);
    expect(ZERO.headRevision).toBeGreaterThan(cp);
    const v = (lit.seal!.value as any);
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.stages).toEqual([]); // seal-only: the kernel's lazy carry
    expect(lit.authority).toBeUndefined(); // no durable authority exists for a zero-stage transaction
    expect(lit.sealReceipt).toBeDefined();
    // the unphased B0 classifier calls this very stored record DENY, although the unchanged verifier admitted and sealed it
    expect(temporalOriginPairing(v.context, v.trigger.kind)).toBe("DENY");
  });

  it("[existing law] WARM, COLD (audit) and COLD (checkpoint invalidated) reopen all keep the exact transaction, context, receipt and whole-campaign history", async () => {
    const m = await reopenMatrix(ZERO.dir, canonicalAdmission, ["tx-old-ordinary", "tx-old-literal"]);
    log("a.matrix", Object.fromEntries(Object.entries(m).map(([k, o]) => [k, { ok: o.ok, calls: o.calls, cp: o.checkpointRevisionAfter, v: o.violations }])));
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
  });
});

describe("b. historical stage-bearing player+literal authority + owner stage + seal (shipped gateway)", () => {
  it("[existing law] the unchanged gateway recorded authority-open, one real GIP stage and the seal under the player pair + the literal", () => {
    const c = STAGE.captures[PC_TARGET_TX]!;
    const v = c.seal!.value as any;
    log("b.record", { checkpoint: manifestOf(STAGE.dir).head.checkpoint.revision, revisions: STAGE.revisions, head: STAGE.headRevision });
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

  it("[existing law] WARM, COLD (audit) and COLD (checkpoint invalidated) reopen accept and preserve authority, stage, seal and every receipt", async () => {
    const m = await reopenMatrix(STAGE.dir, canonicalAdmission, [PC_TARGET_TX]);
    log("b.matrix", Object.fromEntries(Object.entries(m).map(([k, o]) => [k, { ok: o.ok, calls: o.calls, v: o.violations }])));
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.violations, mode).toEqual([]);
      expect(o.summary, mode).toEqual(STAGE.summary);
      expect(o.captures![PC_TARGET_TX], mode).toEqual(STAGE.captures[PC_TARGET_TX]);
    }
    expect(m.warm.calls).toBe(STAGE.headRevision - 128);
    expect(m.coldAudit.calls).toBe(STAGE.headRevision);
    expect(m.coldInvalidated.calls).toBe(STAGE.headRevision);
  });
});

describe("c. INTERRUPTED stage-bearing player+literal: authority-open and credited stage committed, seal not", () => {
  it("[existing law] the store wrapper left exactly authority + stage durable and no sealed record; closing and reopening keeps that cut", async () => {
    const before = INTERRUPTED.captures[PC_TARGET_TX]!;
    expect(before.authority).toBeDefined();
    expect(before.seal).toBeUndefined();
    const m = await reopenMatrix(INTERRUPTED.dir, canonicalAdmission, [PC_TARGET_TX], ["warm", "coldAudit"]);
    for (const [mode, o] of Object.entries(m)) {
      expect(o.ok, mode).toBe(true);
      expect(o.summary, mode).toEqual(INTERRUPTED.summary);
      expect(o.violations, mode).toEqual([]);
    }
    log("c.cut", { head: INTERRUPTED.headRevision, authorityRevision: before.authorityReceipt!.revision });
  });

  it("[existing law] after reopen the SAME transaction id resumes and seals under the PRE-EXISTING authority (not re-opened, one new revision), carrying the literal and the player pair", async () => {
    const rig = await gatewayRig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const head = rig.campaign.store.head().revision;
    const authorityBefore = capture(rig.campaign.store, PC_TARGET_TX);
    expect(await viaGateway(rig, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    const after = capture(rig.campaign.store, PC_TARGET_TX);
    log("c.resume", { head, headAfter: rig.campaign.store.head().revision });
    expect(rig.campaign.store.head().revision).toBe(head + 1); // the seal group only: authority and stage are adopted, not re-written
    expect(after.authority).toEqual(authorityBefore.authority); // same fact, same version
    expect(after.authorityReceipt).toEqual(authorityBefore.authorityReceipt);
    const v = after.seal!.value as any;
    expect(v.trigger.kind).toBe(GM_TRIGGER);
    expect(v.context).toEqual(PLAYER);
    expect(v.stages.length).toBe(1);
    // the seal repeats exactly what the authority opened (the pre-existing authority equality)
    const a = after.authority!.value as any;
    for (const f of ["transaction_id", "cause", "continues", "trigger", "opening", "requested", "context"]) expect(v[f], f).toEqual(a[f]);
    expect(rig.campaign.verify()).toEqual([]);
    await rig.campaign.close();
  });

  it("[existing law] a DIFFERENTLY stated attempt with the same id conflicts: exact code at the coordinator and the gateway; nothing new is committed", async () => {
    const rig = await gatewayRig(canonicalAdmission, copyOf(INTERRUPTED.dir));
    const before = summary(rig.campaign.store);
    // coordinator level: same id, same trigger, same pair, but a different requested target (250, not 300)
    const r = await rig.coordinator.advance(request(PC_TARGET_TX, GM_TRIGGER, at(250)));
    const e: any = r.ok ? null : r.error;
    log("c.conflict.coordinator", e && { code: e.code, message: e.message, details: e.details });
    expect(r.ok).toBe(false);
    expect(e.code).toBe("TRANSACTION_CONFLICT");
    expect(e.details.code).toBe("INTENT_CONFLICT"); // the store's own code, mapped by #openAuthority
    // gateway level: the host still sees only the uniform refusal
    const g = await viaGateway(rig, literalTransaction(), at(250));
    expect(g).toEqual(REFUSED);
    expect(summary(rig.campaign.store)).toEqual(before);
    // one change away: the identical statement resumes (see previous case)
    expect(await viaGateway(rig, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    await rig.campaign.close();
  });
});

describe("d. same-ID retry, same-ID conflict and a new id", () => {
  it("[existing law] exact retry returns the original receipt with zero new revisions; a different digest is TRANSACTION_CONFLICT at the coordinator and INTENT_CONFLICT at the store; a new id is a fresh transaction", async () => {
    const dir = copyOf(ZERO.dir);
    const opened = await openUnder(dir, canonicalAdmission);
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
      const raw = await campaign.store.commit({ ...stored.sealGroup!, cause: `${stored.sealGroup!.cause}-changed` });
      expect(raw.ok, kind).toBe(false);
      expect(raw.ok ? "" : raw.error.code, kind).toBe("INTENT_CONFLICT");
      expect(campaign.store.head().revision, kind).toBe(head);
      out[kind] = { coordinatorCode: e.code, coordinatorMessage: e.message, storeCode: raw.ok ? null : raw.error.code };
    }
    // a NEW id with the ordinary kind is a fresh transaction; under today's unchanged law a NEW id with the literal is ALSO admitted
    const head = campaign.store.head().revision;
    const fresh = await c.advance(request("tx-new-ordinary", ORDINARY_TRIGGER, at(1000)));
    expect(fresh.ok).toBe(true);
    expect(campaign.store.head().revision).toBe(head + 1);
    const freshLiteral = await c.advance(request("tx-new-literal", GM_TRIGGER, at(1001)));
    log("d.existing", { ...out, newOrdinaryOk: fresh.ok, newLiteralOk: freshLiteral.ok });
    expect(freshLiteral.ok).toBe(true); // existing law: this is the very gap S1's prospective deny closes (see e)
    expect(campaign.store.head().revision).toBe(head + 2);
    await campaign.close();
  });

  it("[existing law] stage-bearing: the gateway replays an exact retry of the sealed literal transaction with no new revision and refuses a changed target", async () => {
    const rig = await gatewayRig(canonicalAdmission, copyOf(STAGE.dir));
    const head = rig.campaign.store.head().revision;
    const stored = capture(rig.campaign.store, PC_TARGET_TX);
    expect(await viaGateway(rig, literalTransaction())).toEqual(PC_TARGET_COMMITTED);
    expect(rig.campaign.store.head().revision).toBe(head);
    expect(capture(rig.campaign.store, PC_TARGET_TX)).toEqual(stored);
    expect(await viaGateway(rig, literalTransaction(), at(310))).toEqual(REFUSED);
    expect(rig.campaign.store.head().revision).toBe(head);
    await rig.campaign.close();
  });
});

export { ZERO as _ZERO, STAGE as _STAGE, INTERRUPTED as _INTERRUPTED };
