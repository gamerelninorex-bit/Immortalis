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
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
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
  fixtureCanonicalAdmission,
  fixtureMsCanonicalAdmission,
  gipSunsetExpiryProvider,
  ktiTransferResultCloseProvider,
  legacyContractAdmission,
  msCanonicalAdmission,
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
  POPULATION_FIXTURE_EXTENSION,
  POP_TP,
  T0,
  advanceToRequest,
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
  continuationContextViolation,
  gmContinuationLinkViolation,
  temporalOriginPairing,
} from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import { popCoordinator } from "../support/population.ts";
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

const GM_TRIGGER = GM_INTERPRETED_PC_WAIT;
const ORDINARY_TRIGGER = "operator-progression-choice"; // a kind the shipped operator states (operator/src/commands.ts)
const NEAR_MISS_TRIGGERS = ["gm_interpreted_pc_wait", "GM_INTERPRETED_PC_WAIT_2"] as const; // valid opaque Ids, NOT the literal
const PLAYER = { ...PLAYER_CHOICE_AUTHORITY };
const REFUSED = JSON.parse(PC_TARGET_REFUSAL);
const PAD = 130; // enough ordinary commits that the journal crosses CHECKPOINT_INTERVAL (128) AFTER the historical record

const log = (label: string, v: unknown) => {
  if (process.env["B1S1_LOG"])
    appendFileSync(process.env["B1S1_LOG"], `[E2] ${label} ${JSON.stringify(v)}\n`);
};

// ---------------------------------------------------------------------------------------------------------------------------
// shared rigs (copied in spirit from the E1 corpus, which is immutable and exports nothing)
const shippedProviders = () =>
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

const request = (
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
/** absent facts, receipts and groups are `null` (never `undefined`), so a captured record survives a JSON round trip unchanged */
const orNull = <T>(v: T | undefined | null): T | null => (v === undefined || v === null ? null : structuredClone(v));

/** Whole-campaign custody: head, every fact, every receipt of every fact's provenance. Equality of two of these is equality of history. */
function summary(store: CampaignStore) {
  const facts = store.listFacts();
  return {
    head: clone(store.head()),
    facts: facts.map((f) => clone(f)),
    receipts: facts.map((f) => clone(store.lookupReceipt(f.provenance.intent_id))),
  };
}

/** The exact transaction, its context, its (optional) authority and the receipts of both. */
function capture(store: CampaignStore, id: string) {
  const sealIntent = transactionIntentId(id);
  const authIntent = transactionAuthorityIntentId(id);
  return {
    seal: orNull(store.getFact(temporalTransactionKey(id))),
    authority: orNull(store.getFact(temporalTransactionAuthorityKey(id))),
    sealReceipt: orNull(store.lookupReceipt(sealIntent)),
    authorityReceipt: orNull(store.lookupReceipt(authIntent)),
    sealGroup: orNull(store.committedGroup(sealIntent)),
    authorityGroup: orNull(store.committedGroup(authIntent)),
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
interface Spy {
  readonly admission: WriteAdmission;
  readonly calls: () => number;
  /** the historical verifier's verdict per journal group (by intent id): null = admitted, else the rejection code */
  readonly verdicts: Map<string, string | null>;
}
function spy(base: WriteAdmission, idSuffix = ""): Spy {
  let n = 0;
  const verdicts = new Map<string, string | null>();
  const admission: WriteAdmission = {
    ...base,
    ...(idSuffix ? { historyVerificationId: `${base.historyVerificationId ?? "structural"}${idSuffix}` } : {}),
    verifyHistorical: (g, s) => {
      n++;
      const r = base.verifyHistorical?.(g, s) ?? null;
      verdicts.set(g.intent_id, r ? (r as any).code : null);
      return r;
    },
  };
  return { admission, calls: () => n, verdicts };
}

type Opened =
  | { ok: true; campaign: CanonicalCampaign; calls: number; verdicts: Map<string, string | null> }
  | { ok: false; error: { code: string; message: string; details?: unknown }; calls: number };

async function openUnder(
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
    ? { ok: true, campaign: r.value, calls: s.calls(), verdicts: s.verdicts }
    : { ok: false, error: r.error as any, calls: s.calls() };
}

const MODES = {
  warm: {},
  coldAudit: { audit: true },
  // a verifier-identity change is how a checkpoint is invalidated: the open is forced into one strict whole-journal replay
  coldInvalidated: { idSuffix: "+B1S1-E2-CHECKPOINT-INVALIDATED" },
} as const;
type ModeName = keyof typeof MODES;

interface ReopenObservation {
  readonly ok: boolean;
  readonly calls: number;
  readonly error?: { code: string; message: string };
  readonly summary?: ReturnType<typeof summary>;
  readonly captures?: Record<string, ReturnType<typeof capture>>;
  readonly violations?: unknown;
  readonly checkpointRevisionAfter?: number;
}

/** Opens a PRIVATE COPY of `dir` in every mode (a transition open rewrites the manifest), observes, closes. */
async function reopenMatrix(
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

const literalTransaction = (id = PC_TARGET_TX) =>
  pcTargetTransaction(id, { trigger: { kind: GM_TRIGGER, ref: "choice-gm-literal" } });

/** the gateway over a private copy of the template, opened under `admission` */
async function gatewayRig(admission: WriteAdmission = canonicalAdmission, dir = copyOf(SUNSET_TEMPLATE)) {
  const r = await openUnder(dir, admission);
  if (!r.ok) throw new Error(`gateway rig did not open: ${JSON.stringify(r.error)}`);
  return { dir, campaign: r.campaign, coordinator: coordinatorOn(r.campaign.store) };
}
type Rig = Awaited<ReturnType<typeof gatewayRig>>;

const viaGateway = (
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

/**
 * FREEZING. Once S1 lands, the generators above can no longer commit a player+literal record. S1's own tests must therefore read
 * packages written by the UNCHANGED build and committed as immutable fixtures:
 *   B1S1_FREEZE_TO=<dir>  after generating, copy each closed package and its expected custody (expected.json) under <dir>/<name>/
 *   B1S1_FROZEN=<dir>     do not generate; read the packages and the expected custody from <dir>/<name>/
 */
const FROZEN = process.env["B1S1_FROZEN"];
const FREEZE_TO = process.env["B1S1_FREEZE_TO"];
const freeze = (name: string, j: OldJournal): void => {
  const root = join(FREEZE_TO!, name);
  mkdirSync(root, { recursive: true });
  cpSync(j.dir, join(root, "package"), { recursive: true });
  const { dir: _dir, ...expected } = j;
  void _dir;
  writeFileSync(join(root, "expected.json"), JSON.stringify(expected));
};
const thaw = (name: string): OldJournal => {
  const root = join(FROZEN!, name);
  const expected = JSON.parse(readFileSync(join(root, "expected.json"), "utf8"));
  return { ...expected, dir: join(root, "package") };
};

beforeAll(async () => {
  SUNSET_TEMPLATE = await gatewayTemplate();
  if (FROZEN) [ZERO, STAGE, INTERRUPTED] = [thaw("zero"), thaw("stage"), thaw("interrupted")];
  else {
    [ZERO, STAGE, INTERRUPTED] = [await buildOldZeroStage(), await buildOldStageBearing(), await buildOldInterrupted()];
    if (FREEZE_TO) for (const [name, j] of [["zero", ZERO], ["stage", STAGE], ["interrupted", INTERRUPTED]] as const) freeze(name, j);
  }
  log("builds", {
    frozen: FROZEN ?? null,
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
    expect(lit.authority).toBeNull(); // no durable authority exists for a zero-stage transaction
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
    expect(before.seal).toBeNull();
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


// ===========================================================================================================================
// e. SIMULATION: a TEST-LOCAL phase-aware admission wrapper. It is TEST CODE. It is not S1, it names no production seam, and
//    nothing here claims what S1 will do. It exists to make the two placements and the preserve/deny contrast falsifiable.
// ===========================================================================================================================
interface Mutation {
  readonly name: string;
  /** deny a non-LEGACY_PLAYER pairing in the AUTHORITY-OPEN group (a stage-bearing transaction's first canonical commit) */
  readonly authority: boolean;
  /** which SEAL groups carry the deny: only stage-free ones (correct), all, only stage-bearing, none */
  readonly seal: "zero-stage" | "all" | "stage-bearing" | "none";
  /** does verifyHistorical ALSO deny (same verifier id, or a changed one)? the correct wrapper leaves both untouched */
  readonly historical: "none" | "same-id" | "new-id";
  /** the predicate on a stored/proposed record: true means DENY */
  readonly denies: (context: unknown, kind: unknown, ref: unknown) => boolean;
}

const unphasedDeny = (context: unknown, kind: unknown) => temporalOriginPairing(context, kind) === "DENY";
const BASELINE: Mutation = {
  name: "baseline",
  authority: true,
  seal: "zero-stage",
  historical: "none",
  denies: unphasedDeny,
};

const isAuthorityKey = (k: string) => /^temporal\/transaction-authority\//.test(k);
const isSealKey = (k: string) => /^temporal\/transaction\//.test(k);

const refusal = (placement: string, key: string) =>
  ({
    code: "VALUE_INVALID",
    message: `SIMULATED origin pairing deny at ${placement}`,
    details: { key, placement },
  }) as any;

function liveDeny(group: CommitGroup, m: Mutation) {
  for (const w of group.writes) {
    const v: any = w.value;
    if (m.authority && isAuthorityKey(w.key) && m.denies(v?.context, v?.trigger?.kind, v?.trigger?.ref))
      return refusal("authority-open", w.key);
    if (isSealKey(w.key) && m.seal !== "none") {
      const stages = Array.isArray(v?.stages) ? v.stages.length : 0;
      const applies =
        m.seal === "all" ||
        (m.seal === "zero-stage" && stages === 0) ||
        (m.seal === "stage-bearing" && stages > 0);
      if (applies && m.denies(v?.context, v?.trigger?.kind, v?.trigger?.ref)) return refusal("seal", w.key);
    }
  }
  return null;
}

function historicalDeny(group: CommitGroup, m: Mutation) {
  for (const w of group.writes) {
    const v: any = w.value;
    if ((isAuthorityKey(w.key) || isSealKey(w.key)) && m.denies(v?.context, v?.trigger?.kind, v?.trigger?.ref))
      return refusal("historical", w.key);
  }
  return null;
}

function phaseAware(base: WriteAdmission, m: Mutation = BASELINE): WriteAdmission {
  const baseId = base.historyVerificationId ?? "structural";
  return {
    ...base,
    historyVerificationId: m.historical === "new-id" ? `${baseId}+SIM-HISTORICAL-DENY` : baseId,
    check: (g, s, h) => liveDeny(g, m) ?? base.check(g, s, h),
    verifyHistorical:
      m.historical === "none"
        ? base.verifyHistorical
        : (g, s) => historicalDeny(g, m) ?? base.verifyHistorical?.(g, s) ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// the two rigs. Each returns the list of its checks; a rig is "green" when no check failed. A rig never throws on a refusal.
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
const S3 = "S3 a NEW stage-bearing player+literal advance through the shipped gateway is refused (uniform host refusal)";
const S4 = "S4 nothing was left behind: no authority record, no credited stage, no receipt, no revision, no time change";

/** RIG-Z: zero-stage placement (the SEAL group is the only commit) over the stage-less historical journal of case a. */
async function rigZero(admission: WriteAdmission): Promise<Check[]> {
  const list: Check[] = [];
  const chk = (name: string, ok: boolean, observed?: unknown) => list.push({ name, ok, observed });
  try {
    const opened = await openUnder(copyOf(ZERO.dir), admission);
    chk("Z0 the old stage-less journal reopens WARM under the candidate", opened.ok, opened.ok ? null : opened.error);
    if (!opened.ok) return list;
    const { campaign } = opened;
    const store = campaign.store;
    const c = coordinatorOn(store);
    chk("Z1 the old record is intact after reopen", same(capture(store, "tx-old-literal"), ZERO.captures["tx-old-literal"]));
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
    chk("Z6 the ordinary control is admitted in the same campaign (+1 revision)", ctl.ok && store.head().revision === hc + 1, errOf(ctl));
    chk("Z7 temporal integrity of the campaign holding both is clean", campaign.verify().length === 0 && verifyTemporalIntegrity(store).length === 0);
    await campaign.close();
    const m = await reopenMatrix(ZERO.dir, admission, ["tx-old-literal"]);
    for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const)
      chk(
        `Z8 ${mode} reopen keeps the whole old history exactly`,
        m[mode].ok && same(m[mode].summary, ZERO.summary),
        m[mode].ok ? null : m[mode].error,
      );
  } catch (e) {
    chk("Z-abort the rig threw", false, String(e));
  }
  return list;
}

/** RIG-S: stage-bearing placement (AUTHORITY-OPEN is the first canonical commit) through the shipped gateway. */
async function rigStage(admission: WriteAdmission): Promise<Check[]> {
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
    const m = await reopenMatrix(STAGE.dir, admission, [PC_TARGET_TX]);
    for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const)
      chk(
        `S0 old stage-bearing journal: ${mode} reopen keeps authority, stage, seal and receipts`,
        m[mode].ok && same(m[mode].summary, STAGE.summary),
        m[mode].ok ? null : m[mode].error,
      );
  });
  await attempt("S1", async () => {
    const rig = await gatewayRig(admission, copyOf(INTERRUPTED.dir));
    const head = rig.campaign.store.head().revision;
    const authority = capture(rig.campaign.store, PC_TARGET_TX).authority;
    const out = await viaGateway(rig, literalTransaction());
    chk(
      "S1 the interrupted OLD authority (credited stage, no seal) still resumes and seals under its pre-existing authority",
      same(out, PC_TARGET_COMMITTED) && rig.campaign.store.head().revision === head + 1,
      out,
    );
    chk("S1b the pre-existing authority fact was adopted, not re-written", same(capture(rig.campaign.store, PC_TARGET_TX).authority, authority));
    await rig.campaign.close();
  });
  await attempt("S2", async () => {
    const rig = await gatewayRig(admission, copyOf(INTERRUPTED.dir));
    const before = summary(rig.campaign.store);
    const r = await rig.coordinator.advance(request(PC_TARGET_TX, GM_TRIGGER, at(250)));
    const e: any = r.ok ? null : r.error;
    chk(
      "S2 a differently stated attempt on the interrupted old authority conflicts (TRANSACTION_CONFLICT / INTENT_CONFLICT), never an admission",
      !r.ok && e.code === "TRANSACTION_CONFLICT" && e.details?.code === "INTENT_CONFLICT" && same(summary(rig.campaign.store), before),
      errOf(r),
    );
    await rig.campaign.close();
  });
  await attempt("S3", async () => {
    const rig = await gatewayRig(admission);
    const before = summary(rig.campaign.store);
    const out = await viaGateway(rig, literalTransaction("tx-new-stage-literal"));
    const after = summary(rig.campaign.store);
    chk(S3, same(out, REFUSED), out);
    chk(
      S4,
      same(after, before) &&
        rig.campaign.store.getFact(temporalTransactionAuthorityKey("tx-new-stage-literal")) === undefined &&
        rig.campaign.store.lookupReceipt(transactionAuthorityIntentId("tx-new-stage-literal")) === null,
      { revisionBefore: before.head.revision, revisionAfter: after.head.revision },
    );
    await rig.campaign.close();
  });
  await attempt("S5", async () => {
    const rig = await gatewayRig(admission);
    const head = rig.campaign.store.head().revision;
    const out = await viaGateway(rig, pcTargetTransaction("tx-new-stage-ordinary"));
    chk(
      "S5 the control one change away (the shipped ordinary trigger kind) is admitted: authority, stage and seal commit",
      same(out, PC_TARGET_COMMITTED) && rig.campaign.store.head().revision === head + 3,
      out,
    );
    await rig.campaign.close();
  });
  await attempt("S6", async () => {
    for (const kind of NEAR_MISS_TRIGGERS) {
      const rig = await gatewayRig(admission);
      const out = await viaGateway(rig, pcTargetTransaction("tx-near", { trigger: { kind, ref: "choice-near" } }));
      chk(`S6 near-miss kind "${kind}" stated by the trusted side is admitted`, same(out, PC_TARGET_COMMITTED), out);
      await rig.campaign.close();
    }
  });
  await attempt("S7", async () => {
    const rig = await gatewayRig(admission, copyOf(STAGE.dir));
    const head = rig.campaign.store.head().revision;
    const out = await viaGateway(rig, literalTransaction());
    chk(
      "S7 same-ID exact retry of the sealed old stage-bearing record replays with zero new revisions",
      same(out, PC_TARGET_COMMITTED) && rig.campaign.store.head().revision === head,
      out,
    );
    await rig.campaign.close();
  });
  return list;
}

async function bothRigs(admission: WriteAdmission) {
  return { z: await rigZero(admission), s: await rigStage(admission) };
}

describe("e. [simulation] test-local phase-aware wrapper at BOTH placements; verifyHistorical and historyVerificationId untouched", () => {
  it("[simulation] the baseline wrapper changes only check(): the historical verifier is the very same function and the verifier id is byte-equal to production's", () => {
    const w = phaseAware(canonicalAdmission);
    expect(w.verifyHistorical).toBe(canonicalAdmission.verifyHistorical);
    expect(w.historyVerificationId).toBe(canonicalAdmission.historyVerificationId);
    expect(w.check).not.toBe(canonicalAdmission.check);
  });

  it("[simulation] RIG-Z (zero-stage, seal placement): the new literal is refused with no new revision, the old stage-less journal reopens cold and warm, the control is admitted", async () => {
    const list = await rigZero(phaseAware(canonicalAdmission));
    log("e.rigZ.baseline", list);
    expect(failed(list)).toEqual([]);
  }, 300_000);

  it("[simulation] RIG-S (stage-bearing, authority-open placement): the new literal is refused before any authority or credited stage, the interrupted old authority still seals, the old journal reopens", async () => {
    const list = await rigStage(phaseAware(canonicalAdmission));
    log("e.rigS.baseline", list);
    expect(failed(list)).toEqual([]);
  }, 300_000);

  it("[existing law] today's UNCHANGED production admission as the candidate: every PRESERVE check is green and exactly the DENY checks are red (the pre-S1 state of both rigs)", async () => {
    const { z, s } = await bothRigs(canonicalAdmission);
    log("e.rig.productionToday", { z, s });
    expect(failed(z)).toEqual([Z3, Z4]);
    expect(failed(s)).toEqual([S3, S4]);
  }, 300_000);

  it("[simulation] the refusal codes a phase-aware deny produces at each placement (observation only, no S1 claim)", async () => {
    const z = await openUnder(copyOf(ZERO.dir), phaseAware(canonicalAdmission));
    if (!z.ok) throw new Error(JSON.stringify(z.error));
    const r = await coordinatorOn(z.campaign.store).advance(request("tx-obs-literal", GM_TRIGGER, at(1000)));
    const zErr = errOf(r);
    await z.campaign.close();
    // the coordinator maps ANY non-fatal authority-open refusal to TRANSACTION_CONFLICT (existing behaviour)
    const rig = await gatewayRig(phaseAware(canonicalAdmission));
    const s = await rig.coordinator.advance(request("tx-obs-stage", GM_TRIGGER, at(300)));
    const sErr = errOf(s);
    await rig.campaign.close();
    log("e.errors", { zeroStageSeal: zErr, stageBearingAuthorityOpen: sErr });
    expect(zErr).toMatchObject({ code: "VALUE_INVALID", details: { placement: "seal" } });
    expect(sErr).toMatchObject({ code: "TRANSACTION_CONFLICT", details: { code: "VALUE_INVALID" } });
  });

  // -------- mutation table: each mutant is applied to the TEST-LOCAL wrapper and run through BOTH rigs --------
  const MUTANTS: readonly { m: Mutation; killedBy: readonly ("Z" | "S")[]; note: string }[] = [
    { m: { ...BASELINE, name: "M1 authority-only (no seal arm)", seal: "none" }, killedBy: ["Z"], note: "the stage-free seal is the only commit of a zero-stage wait: RIG-Z admits the literal" },
    { m: { ...BASELINE, name: "M2 zero-stage-seal-only (no authority arm)", authority: false }, killedBy: ["S"], note: "RIG-S: authority and stage commit before the seal; the stage-bearing seal is not denied" },
    { m: { ...BASELINE, name: "M3 seal-only on ALL seals (no authority arm)", authority: false, seal: "all" }, killedBy: ["S"], note: "RIG-S: authority + credited stage are left behind, the seal is refused" },
    { m: { ...BASELINE, name: "M4 universal seal veto (authority arm + deny at every seal)", seal: "all" }, killedBy: ["S"], note: "only S1 sees it: the interrupted OLD authority can no longer seal. S7 (exact retry of an already sealed record) stays green because the kernel answers a same-digest retry from its receipt BEFORE admission" },
    { m: { ...BASELINE, name: "M5 inverted stage predicate (seal deny only on stage-bearing seals)", seal: "stage-bearing" }, killedBy: ["Z", "S"], note: "zero-stage literal admitted; interrupted old authority refused at seal" },
    { m: { ...BASELINE, name: "M6 historical deny, SAME verifier id", historical: "same-id" }, killedBy: ["Z", "S"], note: "cold(audit) and cold(invalidated) reopen fail; warm survives only because the checkpoint prefix is skipped" },
    { m: { ...BASELINE, name: "M7 historical deny AND changed verifier id", historical: "new-id" }, killedBy: ["Z", "S"], note: "warm reopen is forced to strict replay by the id change and fails too" },
    { m: { ...BASELINE, name: "M8 case-folded literal", denies: (c, k) => unphasedDeny(c, k) || (typeof k === "string" && k.toLowerCase() === GM_TRIGGER.toLowerCase()) }, killedBy: ["Z", "S"], note: "the near-miss Ids Z5/S6 are refused" },
    { m: { ...BASELINE, name: "M9 prefix match", denies: (c, k) => unphasedDeny(c, k) || (typeof k === "string" && k.startsWith(GM_TRIGGER)) }, killedBy: ["Z", "S"], note: "GM_INTERPRETED_PC_WAIT_2 is refused" },
    { m: { ...BASELINE, name: "M10 wrong field (deny on trigger.ref, never on kind)", denies: (_c, _k, ref) => ref === GM_TRIGGER }, killedBy: ["Z", "S"], note: "the hook never fires on the literal: both new-literal refusals are lost" },
    { m: { ...BASELINE, name: "M11 kind-only (ignores the pair)", denies: (_c, k) => k === GM_TRIGGER }, killedBy: [], note: "SURVIVES: equivalent in the reachable space. Under the player-only schema every record is the player pair, and a GM pair is refused by the typed value; the mutant differs only for a GM pair + literal, which S4's strict GM branch (unbuilt) will make representable" },
  ];

  for (const { m, killedBy, note } of MUTANTS) {
    it(`[simulation] mutant ${m.name}: ${killedBy.length ? `killed by RIG-${killedBy.join(" and RIG-")}` : "survives (documented equivalent)"}`, async () => {
      const { z, s } = await bothRigs(phaseAware(canonicalAdmission, m));
      log(`e.mutant.${m.name}`, { z: failed(z), s: failed(s), note });
      expect(failed(z).length > 0, `RIG-Z kills ${m.name}`).toBe(killedBy.includes("Z"));
      expect(failed(s).length > 0, `RIG-S kills ${m.name}`).toBe(killedBy.includes("S"));
    }, 300_000);
  }
});

// ===========================================================================================================================
// f. the pure B0 classifiers against STORED historical player-origin records
// ===========================================================================================================================
describe("f. [pure] B0 classifiers versus a stored historical player-origin transaction", () => {
  const GM = { ...GM_ADJUDICATION_AUTHORITY };

  it("[existing law] the unphased classifier calls the stored player+literal record DENY while the unchanged historical verifier admitted every entry that carries it: it must not be reused as a replay predicate", async () => {
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
          expect(temporalOriginPairing(a.context, a.trigger.kind), `${label} authority`).toBe("DENY");
          expect(r.verdicts.get(transactionAuthorityIntentId(id)), `${label} authority verdict`).toBeNull();
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
      ["mixed (GM role, player permission)", { role: GM.role, permission: PLAYER.permission }, GM_TRIGGER, "DENY"],
      ["player + near-miss (case)", PLAYER, "gm_interpreted_pc_wait", "LEGACY_PLAYER"],
      ["player + empty kind", PLAYER, "", "DENY"],
    ] as const;
    for (const [label, ctx, kind, want] of rows) expect(temporalOriginPairing(ctx, kind), label).toBe(want);
  });

  it("[pure] continuationContextViolation: the STORED historical player-origin value cannot satisfy a GM remainder; one change away (a player remainder) it is accepted", () => {
    const stored = (ZERO.captures["tx-old-literal"]!.seal!.value as any);
    const prior = { context: stored.context };
    const viaGm = continuationContextViolation(prior, { context: GM });
    const viaPlayer = continuationContextViolation(prior, { context: { ...PLAYER } });
    const mixed = continuationContextViolation(prior, { context: { role: GM.role, permission: PLAYER.permission } });
    log("f.continuationContext", { viaGm, viaPlayer, mixed });
    expect(viaGm).toMatch(/exactly the role and permission/);
    expect(mixed).toMatch(/exactly the role and permission/);
    expect(viaPlayer).toBeNull(); // the control: the same stored record continued under the SAME pair
    // the literal is not part of the rule: a stored record with the ordinary kind gives the same verdicts
    const ord = (ZERO.captures["tx-old-ordinary"]!.seal!.value as any);
    expect(continuationContextViolation({ context: ord.context }, { context: GM })).toBe(viaGm);
    // a non-pair context is refused rather than compared
    expect(continuationContextViolation({ context: "role.player" as never }, { context: GM })).toMatch(/must be a pair/);
  });

  it("[pure] gmContinuationLinkViolation compares only a CALLER-SUPPLIED held identity: it does not authenticate stored state", () => {
    const stored = ZERO.captures["tx-old-literal"]!;
    const req = (from: string) => ({
      continues: from,
      gm_wait: { phase: "CONTINUATION" as const, from_transaction: from },
    });
    // 1. a stored historical PLAYER-origin identity, supplied by the caller as `held`, satisfies the link
    expect(gmContinuationLinkViolation(req("tx-old-literal"), { from_transaction: "tx-old-literal" })).toBeNull();
    // 2. a FABRICATED identity that exists nowhere in the store satisfies it just as well
    expect(ZERO.captures["tx-fabricated"]).toBeUndefined();
    expect(gmContinuationLinkViolation(req("tx-fabricated"), { from_transaction: "tx-fabricated" })).toBeNull();
    // 3. only a MISMATCH between the two caller-supplied values, an absent held value, or a non-CONTINUATION is refused
    expect(gmContinuationLinkViolation(req("tx-old-literal"), { from_transaction: "tx-other" })).toMatch(/exactly the persisted continuation/);
    expect(gmContinuationLinkViolation(req("tx-old-literal"), null)).toMatch(/no continuation is held/);
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
    log("f.link", { storedOrigin: "player+literal", acceptedAsHeld: true, fabricatedAccepted: true });
  });
});

// ===========================================================================================================================
// g. known OLDER non-literal journals still open under every admission composition the build knows
// ===========================================================================================================================
describe("g. known older non-literal journals (retained fixture packages; nothing invented here)", () => {
  const R02 = join(import.meta.dirname, "../fixtures/r02-a01-pre-s4");
  const LEGACY = join(import.meta.dirname, "../fixtures/legacy-base-eafbb127/package");
  const golden = {
    ordinary: ["6101bfd0fcd5ac37887f19853400b7dabd3f3e397381d544b9901de8e545df91", "dfbd13d02efeaa703922eefcc97a3eec400ea176bbb7029608f45314a96de819"],
    pcb: ["710e868d55b2882cc7656b5e4989be194ee0b47db3869a3281081ec0c50bbced", "76eecf5e73f095143d8fe3d96ed7ffb5b6c380f4cc52017404b3c31fe0dabc8a"],
    interrupted: ["793fd9f8eb36783193e1e99f5fa119d7e51fac62ba072b53acaa4dc2ded7fee6", "6528409b884cfdb634e188c458011e58c1bcce72c121e9b80d6aba1b989666ed"],
  } as const;
  const MS_BINDING = { key_id: "e2-key", public_key: "e2-public-key", driver_id: "e2-driver", driver_config_hash: "0".repeat(64) };
  const admissions: readonly { name: string; label: "[existing law]" | "[simulation]"; admission: WriteAdmission }[] = [
    { name: "production canonicalAdmission", label: "[existing law]", admission: canonicalAdmission },
    { name: "MS production (msCanonicalAdmission)", label: "[existing law]", admission: msCanonicalAdmission(MS_BINDING) },
    { name: "MS fixture (fixtureMsCanonicalAdmission)", label: "[existing law]", admission: fixtureMsCanonicalAdmission(MS_BINDING) },
    { name: "T1 fixture (fixtureCanonicalAdmission)", label: "[existing law]", admission: fixtureCanonicalAdmission },
    { name: "pre-v0.9 legacy (legacyContractAdmission(production))", label: "[existing law]", admission: legacyContractAdmission(canonicalAdmission) },
    { name: "phase-aware wrapper over production", label: "[simulation]", admission: phaseAware(canonicalAdmission) },
    { name: "legacy(phase-aware wrapper)", label: "[simulation]", admission: legacyContractAdmission(phaseAware(canonicalAdmission)) },
  ];

  const entriesOf = (dir: string) =>
    readFileSync(join(dir, "journal.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { group: CommitGroup; receipt: unknown });

  for (const mode of ["ordinary", "pcb", "interrupted"] as const) {
    it(`[existing law]+[simulation] retained pre-S-4 ${mode} package: opens warm and cold under every admission, keeping the exact head and every original receipt`, async () => {
      const table: Record<string, unknown> = {};
      for (const a of admissions) {
        for (const m of ["warm", "coldAudit"] as const) {
          const dir = copyOf(join(R02, mode));
          const journal = readFileSync(join(dir, "journal.jsonl"));
          const entries = entriesOf(dir);
          const r = await openUnder(dir, a.admission, { ...MODES[m], extension: POPULATION_FIXTURE_EXTENSION });
          if (!r.ok) {
            table[`${a.name} / ${m}`] = { ok: false, error: { code: r.error.code, message: r.error.message } };
            continue;
          }
          const head = r.campaign.store.head();
          const receiptsKept = entries.every((e) => same(r.campaign.store.lookupReceipt(e.group.intent_id), e.receipt));
          const cell = {
            ok: true,
            golden: same([head.state_sha256, head.journal_head_sha256], golden[mode]),
            receiptsKept,
            violations: r.campaign.verify().length,
            calls: r.calls,
          };
          table[`${a.name} / ${m}`] = cell;
          await r.campaign.close();
          expect(readFileSync(join(dir, "journal.jsonl")).equals(journal), `${a.name} ${m} journal bytes`).toBe(true);
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

  it("[existing law]+[simulation] the RETAINED interrupted old authority (a real pre-S-4 package, non-literal) resumes and seals under production and under the phase-aware wrapper", async () => {
    const out: Record<string, unknown> = {};
    for (const a of admissions.filter((x) => x.name.startsWith("production") || x.name.startsWith("phase-aware"))) {
      const dir = copyOf(join(R02, "interrupted"));
      const r = await openUnder(dir, a.admission, { extension: POPULATION_FIXTURE_EXTENSION });
      if (!r.ok) throw new Error(`${a.name}: ${JSON.stringify(r.error)}`);
      const head = r.campaign.store.head().revision;
      const resumed = await popCoordinator(r.campaign.store).advance(advanceToRequest("tx-baseline-interrupted", POP_TP));
      out[a.name] = { ok: resumed.ok, adopted: resumed.ok ? resumed.value.adopted.length : null, revisions: r.campaign.store.head().revision - head, verify: r.campaign.verify().length };
      expect(resumed.ok, a.name).toBe(true);
      if (resumed.ok) expect(resumed.value.adopted.length, a.name).toBeGreaterThan(0);
      expect(r.campaign.verify(), a.name).toEqual([]);
      await r.campaign.close();
    }
    log("g.r02.interruptedResume", out);
  }, 300_000);

  it("[existing law]+[simulation] the pre-v0.9 base package (3 entries, no Temporal record) opens under its legacy composition of every admission, byte-for-byte", async () => {
    const out: Record<string, unknown> = {};
    for (const a of admissions) {
      const dir = copyOf(LEGACY);
      const before = readFileSync(join(dir, "journal.jsonl"));
      const r = await openUnder(dir, a.admission, { audit: true });
      out[a.name] = r.ok ? { ok: true, revision: r.campaign.store.head().revision } : { ok: false, error: { code: r.error.code, message: r.error.message } };
      if (r.ok) await r.campaign.close();
      expect(r.ok, a.name).toBe(true);
      expect(readFileSync(join(dir, "journal.jsonl")).equals(before), a.name).toBe(true);
    }
    log("g.legacyBase", out);
  });
});
