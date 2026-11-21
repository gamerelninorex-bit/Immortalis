/* eslint-disable @typescript-eslint/no-explicit-any -- characterization probes poke at raw groups, facts and journal bytes */
// F-014B B1-HIST-1 — PRODUCTION-ONLY characterization of EXISTING code at main a79fcc64420945024be90ffc7fdcdd9562b8d46b.
// NOT part of any package, NOT committed, NOT a gate. It changes no production authority and widens nothing.
// Labels: MECHANISM ONLY (existing behaviour). Nothing here claims a GM wait, an admission of a GM record, an eligibility or a PASS.
//
// Question: can a transaction under the PLAYER pair whose trigger kind is the literal GM_INTERPRETED_PC_WAIT be opened, sealed and
// replayed under PRODUCTION owner admission (`canonicalAdmission`, no extension, no fixture admission) and under the pre-v0.9
// `legacyContractAdmission(canonicalAdmission)`, with the trusted commit path the shipped code uses? What differs from the
// SYNTH_EXTENSION fixture (B1-X01/X02)?
//
// Copy to tests/integration/zz-b1-hist1-production.test.ts, run `pnpm exec vitest run --project integration <file>`, delete the copy.
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalAdmission,
  canonicalEqual,
  createFileCampaign,
  economyRealizationProvider,
  epistemicPacketProvider,
  fixtureCanonicalAdmission,
  openFileCampaign,
  gipSunsetExpiryProvider,
  ktiTransferResultCloseProvider,
  legacyContractAdmission,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  namedActorCapabilityCloseProvider,
  pcCapabilityCloseProvider,
  populationStageProvider,
  productionCompletionProvider,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  resolveKey,
  storeBindings,
  verifyTemporalIntegrity,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  worldSourceDeliveryProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  SYNTH_EXTENSION,
  T0,
  T1,
  at,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import { classifyGoverningRule } from "../../packages/engine/src/owners/governing-rule.ts"; // not exported from the engine index
import { temporalOriginPairing } from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 table; unexported from the contracts index
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { SUNSET_LATER, SUNSET_MID } from "../support/gip-sunset.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_TX,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import {
  advanceOriginal,
  originalSunsetCampaign,
  reopenOriginal,
  trustedOriginalTarget,
} from "../support/original-pc-target.ts";

const GM_TRIGGER = "GM_INTERPRETED_PC_WAIT";
const ORDINARY_TRIGGER = "operator-progression-choice"; // a kind the shipped operator states (commands.ts:563)
const PLAYER = { ...PLAYER_CHOICE_AUTHORITY };
const GM = { role: "role.gm", permission: "permission.rule.adjudicate" } as const;
const log = (label: string, v: unknown) => {
  const line = `[HIST1] ${label} ${JSON.stringify(v)}`;
  console.log(line);
  // vitest's default reporter hides stdout of passing tests: optionally append the evidence lines to a file named by HIST1_LOG
  if (process.env["HIST1_LOG"]) appendFileSync(process.env["HIST1_LOG"], `${line}\n`);
};

// ---------------------------------------------------------------------------------------------------------------------------
// the production owner-provider set the shipped gateways register (active-pc-target-advance.ts `ownerProviders`)
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

const rejection = (r: any) => (r ? { code: r.code, message: r.message, details: r.details } : null);

interface Probe {
  readonly label: string;
  readonly group: CommitGroup;
  /** the PURE admission verdicts for this very (group, pre-state): production check/verifyHistorical, legacy check/verifyHistorical */
  readonly prodCheck: unknown;
  readonly prodHist: unknown;
  readonly legacyCheck: unknown;
  readonly legacyHist: unknown;
  readonly storeResult: unknown;
}

/**
 * Wraps a store so that, immediately before each Temporal-kernel group is committed, the group is also judged by the PURE
 * admission functions against the exact pre-state it is about to meet. The real commit is unchanged and is still the authority.
 */
function recorder(inner: CampaignStore, mutate?: (g: CommitGroup) => CommitGroup) {
  const probes: Probe[] = [];
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g) => {
      const group = mutate ? mutate(g as CommitGroup) : (g as CommitGroup);
      let probe: Omit<Probe, "storeResult"> | undefined;
      if (group.owner === "temporal_kernel" && group.writes.some((w) => /^temporal\/transaction/.test(w.key))) {
        const state = {
          campaign_id: inner.head().campaign_id,
          revision: inner.head().revision,
          facts: new Map(inner.listFacts().map((f) => [f.key, f])),
        } as any;
        canonicalAdmission.initializeView?.(state, () => true); // binds the MS-fence / GIP-head transient views to this state object
        const legacy = legacyContractAdmission(canonicalAdmission);
        probe = {
          label: group.writes.map((w) => w.key).join(","),
          group,
          prodCheck: rejection(canonicalAdmission.check(group, state)),
          prodHist: rejection(canonicalAdmission.verifyHistorical?.(group, state)),
          legacyCheck: rejection(legacy.check(group, state)),
          legacyHist: rejection(legacy.verifyHistorical?.(group, state)),
        };
      }
      const r = await inner.commit(group);
      if (probe) probes.push({ ...probe, storeResult: r.ok ? "OK" : { code: r.error.code, message: r.error.message, details: r.error.details } });
      return r;
    },
  };
  return { store, probes };
}

const request = (id: string, kind: string, context: object, target = at(200)) => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind, ref: `ref-${id}` },
  continues: null,
  requested: { target, condition: null },
  context,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});

/** A PRODUCTION-admission campaign: no extension, no fixture admission, no synthetic owner. World/locus/PC/binding only. */
async function productionCampaign(dir: string) {
  const campaign = await must(
    CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "hist1-production" }),
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

const reopenProduction = async (dir: string, audit: boolean) => {
  const r = await CanonicalCampaign.open(dir, { buildId: "hist1-reopen", ...(audit ? { audit: true } : {}) });
  return r;
};

/** The shape of a Temporal-kernel group with everything that varies by identity or by the one tested field removed. */
const shapeOf = (g: CommitGroup) => ({
  owner: g.owner,
  facet: g.facet,
  rule: g.rule,
  keyKinds: g.writes.map((w) => resolveKey(w.key)?.kind.id),
  writeMeta: g.writes.map((w) => ({
    owner: w.owner,
    facet: w.facet,
    // expected_version is state-position (the second transaction meets state v2), not a marker; the key kind says which write it is
    basis: w.basis,
    secrecy: w.secrecy,
  })),
  readCount: g.reads.length,
  depCount: g.depends_on.length,
  authority: g.authority,
});

// ===========================================================================================================================
describe("H1-A the identity of the two admissions: what the fixture shares with production", () => {
  it("H1-A1 the SYNTH_EXTENSION store binding carries the SAME historyVerificationId and delegates every temporal_kernel group to the SAME canonicalAdmission.check", () => {
    const plain = (storeBindings() as any).value;
    const ext = (storeBindings(SYNTH_EXTENSION) as any).value;
    log("A1.ids", {
      production: canonicalAdmission.historyVerificationId?.slice(-120),
      plainBinding: plain.admission.historyVerificationId === canonicalAdmission.historyVerificationId,
      extensionBinding: ext.admission.historyVerificationId === canonicalAdmission.historyVerificationId,
      fixtureAdmissionSuffixOnly: fixtureCanonicalAdmission.historyVerificationId?.replace(canonicalAdmission.historyVerificationId!, "") ?? null,
    });
    expect(plain.admission.historyVerificationId).toBe(canonicalAdmission.historyVerificationId);
    expect(ext.admission.historyVerificationId).toBe(canonicalAdmission.historyVerificationId); // extension changes NO policy identity
    expect(fixtureCanonicalAdmission.historyVerificationId).not.toBe(canonicalAdmission.historyVerificationId); // control: the REAL fixture admission differs
    expect(fixtureCanonicalAdmission.historyVerificationId).toContain("+fixture-evidence-t1");
    const legacy = legacyContractAdmission(canonicalAdmission);
    expect(legacy.historyVerificationId).toBe(`${canonicalAdmission.historyVerificationId}+LEGACY-PRE-V9-RUNTIME-CONTRACT`);
  });

  it("H1-A2 the registry rows for the two kinds carry ONE rule (KERNEL_RULE), no alternate/legacy rule: no rule-citation marker separates any two eras of authority records", () => {
    for (const id of ["temporal_transaction_authority", "resolution_transaction"] as const) {
      const key =
        id === "temporal_transaction_authority"
          ? temporalTransactionAuthorityKey("x")
          : temporalTransactionKey("x");
      const kind = resolveKey(key)!.kind as any;
      log(`A2.${id}`, {
        owner: kind.owner,
        facet: kind.facet,
        lifecycle: kind.lifecycle,
        hasAlternateRules: kind.alternateRules !== undefined,
        hasLegacyRule: kind.legacyRule !== undefined,
        hasLaterLegacyRules: kind.laterLegacyRules !== undefined,
      });
      expect(kind.alternateRules).toBeUndefined();
      expect(kind.legacyRule).toBeUndefined();
      expect(kind.laterLegacyRules).toBeUndefined();
    }
  });
});

// ===========================================================================================================================
describe("H1-P PRODUCTION admission (no extension, no fixture admission), kernel commit path with the shipped provider set", () => {
  it("H1-P1 player pair + GM trigger: authority-open AND seal pass production check/verifyHistorical and legacy check/verifyHistorical; control one change away; strict reopen accepts", async () => {
    const dir = tempDir();
    const campaign = await productionCampaign(dir);
    const rec = recorder(campaign.store);
    const coordinator = new TemporalCoordinator(rec.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    const control = await coordinator.advance(request("tx-ctl", ORDINARY_TRIGGER, PLAYER, at(200)) as any);
    const gap = await coordinator.advance(request("tx-gap", GM_TRIGGER, PLAYER, at(300)) as any);
    log("P1.control.ok", control.ok);
    log("P1.gap.ok", gap.ok);
    expect(control.ok).toBe(true);
    expect(gap.ok).toBe(true);
    const sealed = coordinator.transaction("tx-gap")!.value;
    expect(sealed.trigger.kind).toBe(GM_TRIGGER);
    expect(sealed.context).toEqual(PLAYER);
    expect(sealed.stages).toEqual([]); // no stage: the kernel's lazy carry (no owner effect)
    // every probe: all four PURE verdicts are null (admitted), and the store result is OK
    const view = rec.probes.map((p) => ({
      label: p.label.replace(/^(temporal\/[a-z-]+\/)?(tx-[a-z]+).*/, "$2"),
      prodCheck: p.prodCheck,
      prodHist: p.prodHist,
      legacyCheck: p.legacyCheck,
      legacyHist: p.legacyHist,
      store: p.storeResult,
    }));
    log("P1.probes", view);
    // a transaction with NO stage (the kernel's lazy carry) commits ONE group (state + seal) and no authority record
    // (temporal/admission.ts: the authority is required only `if (tx.stages.length > 0)`); authority-open groups are exercised in H1-G
    expect(rec.probes.length).toBe(2);
    for (const p of rec.probes) {
      expect(p.prodCheck).toBeNull();
      expect(p.prodHist).toBeNull();
      expect(p.legacyCheck).toBeNull();
      expect(p.legacyHist).toBeNull();
      expect(p.storeResult).toBe("OK");
    }
    // NO marker: the gap groups and the control groups differ only in identity fields and the trigger kind inside the value
    const byKey = (needle: string) => rec.probes.find((p) => p.group.writes.some((w) => w.key.includes(needle)))!;
    const sealCtl = byKey("temporal/transaction/tx-ctl");
    const sealGap = byKey("temporal/transaction/tx-gap");
    expect(shapeOf(sealGap.group)).toEqual(shapeOf(sealCtl.group));
    for (const g of [sealGap.group, sealCtl.group]) {
      const w = g.writes.find((x) => /transaction(-authority)?\//.test(x.key))!;
      expect(classifyGoverningRule(resolveKey(w.key)!.kind, g.rule, w.value)).toBe("CURRENT");
    }
    log("P1.shapeEqual", { seal: true, ruleCitation: "CURRENT for both" });
    // integrity and strict reopen
    expect(verifyTemporalIntegrity(campaign.store)).toEqual([]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
    const ordinary = await reopenProduction(dir, false);
    expect(ordinary.ok).toBe(true);
    if (ordinary.ok) await ordinary.value.close();
    const strict = await reopenProduction(dir, true); // audit: the full journal is replayed through verifyHistorical
    log("P1.strictReopen", strict.ok ? "OK" : { code: strict.error.code, message: strict.error.message });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      const c = new TemporalCoordinator(strict.value.store, shippedProviders());
      expect(c.transaction("tx-gap")!.value.trigger.kind).toBe(GM_TRIGGER);
      expect(strict.value.verify()).toEqual([]);
      await strict.value.close();
    }
  });

  it("H1-P2 GM pair is refused at the registry value schema (exact code/message/path), with GM trigger or ordinary trigger; the player-pair control is accepted", async () => {
    const outcomes: Record<string, unknown> = {};
    for (const [label, ctx, kind] of [
      ["gm-pair+gm-trigger", GM, GM_TRIGGER],
      ["gm-pair+ordinary", GM, ORDINARY_TRIGGER],
      ["player+gm-trigger(control)", PLAYER, GM_TRIGGER],
    ] as const) {
      const dir = tempDir();
      const campaign = await productionCampaign(dir);
      // the harness changes ONLY the authority group's context (what a hand-built trusted commit would do)
      const isTx = (key: string) => /^temporal\/transaction(-authority)?\//.test(key);
      const rec = recorder(campaign.store, (g) =>
        g.writes.some((w) => isTx(w.key))
          ? {
              ...g,
              writes: g.writes.map((w) =>
                isTx(w.key) ? { ...w, value: { ...(w.value as any), context: ctx } } : w,
              ),
            }
          : g,
      );
      const coordinator = new TemporalCoordinator(rec.store, shippedProviders());
      await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
      const r = await coordinator.advance(request(`tx-${label.length}`, kind, PLAYER, at(200)) as any);
      const auth = rec.probes[0];
      outcomes[label] = {
        advanceOk: r.ok,
        advanceError: r.ok ? null : { code: (r.error as any).code, detailsCode: (r.error as any).details?.code, message: (r.error as any).message },
        record: auth && {
          keys: auth.group.writes.map((w) => w.key),
          prodCheck: auth.prodCheck,
          prodHist: auth.prodHist,
          legacyCheck: auth.legacyCheck,
          legacyHist: auth.legacyHist,
          store: auth.storeResult,
        },
      };
      await campaign.close();
    }
    log("P2.outcomes", outcomes);
    expect((outcomes["gm-pair+gm-trigger"] as any).advanceOk).toBe(false);
    expect((outcomes["gm-pair+ordinary"] as any).advanceOk).toBe(false);
    expect((outcomes["player+gm-trigger(control)"] as any).advanceOk).toBe(true);
    // the GM-pair refusal is by the typed value, exactly as today (B1-X03), not by the trigger
    expect((outcomes["gm-pair+gm-trigger"] as any).record.prodCheck.code).toBe("VALUE_INVALID");
    expect((outcomes["gm-pair+ordinary"] as any).record.prodCheck.code).toBe("VALUE_INVALID");
    // and the historical hook has NO opinion on either (replay of a group with that value is judged elsewhere: open-time integrity)
    expect((outcomes["gm-pair+gm-trigger"] as any).record.prodHist).toBeNull();
  });

  it("H1-P3 tampered journal bytes are refused on reopen (the chain defends authenticity; no marker or exemption is involved)", async () => {
    const dir = tempDir();
    const campaign = await productionCampaign(dir);
    const coordinator = new TemporalCoordinator(campaign.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    await must(coordinator.advance(request("tx-tamper", GM_TRIGGER, PLAYER, at(200)) as any));
    await campaign.close();
    const journal = join(dir, "journal.jsonl");
    const original = readFileSync(journal, "utf8");
    expect(original).toContain(GM_TRIGGER);
    // same-length edit of ONE byte inside the sealed record's trigger kind; the entry hash no longer matches
    writeFileSync(journal, original.replace(`"${GM_TRIGGER}"`, `"GM_INTERPRETED_PC_WAIX"`));
    const tampered = await reopenProduction(dir, false);
    const tamperedStrict = await reopenProduction(dir, true);
    log("P3.tampered", {
      ordinary: tampered.ok ? "OK" : { code: tampered.error.code, message: tampered.error.message },
      strict: tamperedStrict.ok ? "OK" : { code: tamperedStrict.error.code, message: tamperedStrict.error.message },
    });
    expect(tampered.ok).toBe(false);
    expect(tamperedStrict.ok).toBe(false);
    if (tampered.ok) await tampered.value.close();
    if (tamperedStrict.ok) await tamperedStrict.value.close();
    // control: the untouched journal reopens
    writeFileSync(journal, original);
    const control = await reopenProduction(dir, true);
    expect(control.ok).toBe(true);
    if (control.ok) await control.value.close();
  });
});

// ===========================================================================================================================
describe("H1-L LEGACY admission: a package produced by the pre-v0.9 base build (legacyContractAdmission(canonicalAdmission))", () => {
  it("H1-L1 the same player-pair + GM-trigger transaction is admitted, sealed and strictly replayed under the legacy admission", async () => {
    const FIXTURE = "tests/fixtures/legacy-base-eafbb127/package";
    const dir = mkdtempSync(join(tmpdir(), "immortalis-hist1-legacy-"));
    cpSync(FIXTURE, dir, { recursive: true });
    mkdirSync(join(dir, "history"), { recursive: true });
    const campaign = await must(CanonicalCampaign.open(dir, { buildId: "hist1-legacy" }));
    const rec = recorder(campaign.store);
    const coordinator = new TemporalCoordinator(rec.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    const control = await coordinator.advance(request("tx-lctl", ORDINARY_TRIGGER, PLAYER, at(200)) as any);
    const gap = await coordinator.advance(request("tx-lgap", GM_TRIGGER, PLAYER, at(300)) as any);
    log("L1.ok", { control: control.ok, gap: gap.ok });
    log("L1.probes", rec.probes.map((p) => ({ label: p.label.slice(0, 60), legacyCheck: p.legacyCheck, legacyHist: p.legacyHist, store: p.storeResult })));
    expect(control.ok).toBe(true);
    expect(gap.ok).toBe(true);
    for (const p of rec.probes) {
      expect(p.legacyCheck).toBeNull();
      expect(p.legacyHist).toBeNull();
      expect(p.storeResult).toBe("OK");
    }
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
    const strict = await CanonicalCampaign.open(dir, { buildId: "hist1-legacy-strict", audit: true });
    log("L1.strictReopen", strict.ok ? "OK" : { code: strict.error.code, message: strict.error.message });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      expect(new TemporalCoordinator(strict.value.store, shippedProviders()).transaction("tx-lgap")!.value.trigger.kind).toBe(GM_TRIGGER);
      await strict.value.close();
    }
  });
});

// ===========================================================================================================================
describe("H1-G the SHIPPED gateway (advanceActivePcToTarget over bindTrustedActivePcTargetAdvanceContext), real owners, stage-bearing", () => {
  it("H1-G1 a trusted side that states trigger kind GM_INTERPRETED_PC_WAIT under the player pair is committed by the unchanged gateway, with a real owner stage; control one change away; strict reopen accepts", async () => {
    const ctlSeed = await originalSunsetCampaign(SUNSET_MID);
    const ctl = await advanceOriginal(trustedOriginalTarget(ctlSeed, { target: SUNSET_LATER }));
    expect(ctl).toEqual(PC_TARGET_COMMITTED); // accepted control on an identical campaign
    await ctlSeed.campaign.close();

    const s = await originalSunsetCampaign(SUNSET_MID);
    const rec = recorder(s.campaign.store);
    (s.campaign as any).store = rec.store; // the gateway's frozen campaign view reads `campaign.store` through a getter at call time
    const trusted = trustedOriginalTarget(s, {
      target: SUNSET_LATER,
      transaction: pcTargetTransaction(PC_TARGET_TX, { trigger: { kind: GM_TRIGGER, ref: "choice-gm-literal" } }),
    });
    const out = await advanceOriginal(trusted);
    log("G1.gateway", out);
    expect(out).toEqual(PC_TARGET_COMMITTED);
    const sealed = s.coordinator.transaction(PC_TARGET_TX)!.value;
    log("G1.sealed", { trigger: sealed.trigger, context: sealed.context, stages: sealed.stages.length, outcome: sealed.outcome.stop_reason });
    expect(sealed.trigger.kind).toBe(GM_TRIGGER);
    expect(sealed.context).toEqual(PLAYER);
    expect(sealed.stages.length).toBeGreaterThan(0); // a real owner stage (GIP sunset expiry), not an empty carry
    log("G1.probes", rec.probes.map((p) => ({ keys: p.group.writes.map((w) => w.key), prodCheck: p.prodCheck, prodHist: p.prodHist, legacyCheck: p.legacyCheck, legacyHist: p.legacyHist, store: p.storeResult })));
    expect(rec.probes.length).toBe(2); // the authority-open group and the seal group
    expect(rec.probes.some((p) => p.group.writes.some((w) => w.key.includes("transaction-authority/")))).toBe(true);
    for (const p of rec.probes) {
      expect(p.prodCheck).toBeNull();
      expect(p.prodHist).toBeNull();
      expect(p.legacyCheck).toBeNull();
      expect(p.legacyHist).toBeNull();
      expect(p.storeResult).toBe("OK");
    }
    expect(s.campaign.verify()).toEqual([]);
    const dirs = s.dirs;
    await s.campaign.close();
    const ordinary = await reopenOriginal(dirs);
    expect(ordinary.coordinator.transaction(PC_TARGET_TX)!.value.trigger.kind).toBe(GM_TRIGGER);
    await ordinary.campaign.close();
    const strict = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "hist1-gateway-strict", audit: true });
    log("G1.strictReopen", strict.ok ? "OK" : { code: strict.error.code, message: strict.error.message });
    expect(strict.ok).toBe(true);
    if (strict.ok) await strict.value.close();
  });

  it("H1-G2 through the SHIPPED gateway, a stage-bearing transaction whose authority-open group carries the GM pair is refused at the typed value (exact code/message/path); nothing is committed", async () => {
    const out: Record<string, unknown> = {};
    for (const [label, ctx, kind] of [
      ["gm-pair+gm-trigger", GM, GM_TRIGGER],
      ["gm-pair+ordinary", GM, ORDINARY_TRIGGER],
    ] as const) {
      const s = await originalSunsetCampaign(SUNSET_MID);
      const before = s.campaign.store.head().revision;
      const rec = recorder(s.campaign.store, (g) =>
        g.group_id.startsWith("transaction-authority-group:")
          ? { ...g, writes: g.writes.map((w) => ({ ...w, value: { ...(w.value as any), context: ctx } })) }
          : g,
      );
      (s.campaign as any).store = rec.store;
      const r = await advanceOriginal(
        trustedOriginalTarget(s, {
          target: SUNSET_LATER,
          transaction: pcTargetTransaction(PC_TARGET_TX, { trigger: { kind, ref: "choice-gm-ctx" } }),
        }),
      );
      out[label] = {
        gateway: r,
        probe: rec.probes[0] && {
          prodCheck: rec.probes[0].prodCheck,
          prodHist: rec.probes[0].prodHist,
          legacyCheck: rec.probes[0].legacyCheck,
          store: rec.probes[0].storeResult,
        },
        revisionMoved: s.campaign.store.head().revision !== before,
      };
      await s.campaign.close();
    }
    log("G2.outcomes", out);
    for (const label of ["gm-pair+gm-trigger", "gm-pair+ordinary"]) {
      expect((out[label] as any).probe.prodCheck.code).toBe("VALUE_INVALID");
      expect((out[label] as any).probe.legacyCheck.code).toBe("VALUE_INVALID");
      expect((out[label] as any).probe.prodHist).toBeNull(); // the historical hook has no opinion
      expect((out[label] as any).revisionMoved).toBe(false);
    }
  });
});

// ===========================================================================================================================
describe("H1-F FORGED journals: records written by a store with NO admission (an attacker who can write a self-consistent hash chain), then opened by production", () => {
  /** writes the journal with a store that has the owner registry but no admission, so the value/rule checks never ran at write time */
  async function forgedJournal(label: string, ctx: object, kind: string): Promise<string> {
    const dir = tempDir();
    const created = await createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: CANONICAL_OWNER_REGISTRY,
      buildId: `hist1-forge-${label}`,
    });
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const isTx = (key: string) => /^temporal\/transaction(-authority)?\//.test(key);
    const rec = recorder(created.value, (g) =>
      g.writes.some((w) => isTx(w.key))
        ? { ...g, writes: g.writes.map((w) => (isTx(w.key) ? { ...w, value: { ...(w.value as any), context: ctx } } : w)) }
        : g,
    );
    const coordinator = new TemporalCoordinator(rec.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    const r = await coordinator.advance(request(`tx-forged-${label}`, kind, PLAYER, at(200)) as any);
    expect(r.ok).toBe(true); // no admission at write time: the forged record IS committed into a valid chain
    await created.value.close();
    return dir;
  }

  it("H1-F1 a FORGED GM-pair record (chain-valid) is refused by production open: replay passes it (no historical hook), open-time integrity re-parses the typed value", async () => {
    const dir = await forgedJournal("gm", GM, GM_TRIGGER);
    const strict = await CanonicalCampaign.open(dir, { buildId: "hist1-forged-open", audit: true });
    const ordinary = await CanonicalCampaign.open(dir, { buildId: "hist1-forged-open2" });
    const shape = (r: any) => (r.ok ? "OPENED" : { code: r.error.code, message: r.error.message, violations: (r.error.details as any)?.violations?.slice(0, 3) });
    log("F1.gmPairForged", { strict: shape(strict), ordinary: shape(ordinary) });
    expect(strict.ok).toBe(false);
    expect(ordinary.ok).toBe(false);
    if (strict.ok) await strict.value.close();
    if (ordinary.ok) await ordinary.value.close();
  });

  it("H1-F2 a hand-built PLAYER-pair + GM-trigger record written the same way is NOT distinguishable from an honest one: production open accepts it today", async () => {
    const dir = await forgedJournal("player", PLAYER, GM_TRIGGER);
    const strict = await CanonicalCampaign.open(dir, { buildId: "hist1-handbuilt-open", audit: true });
    log("F2.playerGmTriggerHandBuilt", strict.ok ? "OPENED" : { code: strict.error.code, message: strict.error.message });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      expect(new TemporalCoordinator(strict.value.store, shippedProviders()).transaction("tx-forged-player")!.value.trigger.kind).toBe(GM_TRIGGER);
      expect(strict.value.verify()).toEqual([]);
      await strict.value.close();
    }
  });
});

// ===========================================================================================================================
describe("H1-S SIMULATION ONLY (test-local admission wrappers, NO production code): what the two candidate replay policies do to an already-committed player-pair + GM-trigger journal", () => {
  const isTxKey = (key: string) => /^temporal\/transaction(-authority)?\//.test(key);
  /** the B0 table applied to every authority/seal write of a group, exactly as the intake's S1 proposes (DENY and GM_WAIT both refuse in Phase alpha) */
  const pairingDeny = (group: CommitGroup) => {
    for (const w of group.writes) {
      if (!isTxKey(w.key)) continue;
      const v = w.value as any;
      const cls = temporalOriginPairing(v?.context, v?.trigger?.kind);
      if (cls !== "LEGACY_PLAYER")
        return { code: "VALUE_INVALID", message: `SIMULATED B1 origin pairing: ${cls}`, details: { key: w.key } } as any;
    }
    return null;
  };
  const baseId = canonicalAdmission.historyVerificationId!;
  /** option A: deny NEW writes only. check() is extended, verifyHistorical and historyVerificationId are untouched. */
  const liveOnly = {
    ...canonicalAdmission,
    check: (g: CommitGroup, s: any, h?: any) => pairingDeny(g) ?? canonicalAdmission.check(g, s, h),
  };
  /** option B: blanket. check() AND verifyHistorical() deny, and the verifier identity changes in the same transition. */
  const blanket = {
    ...canonicalAdmission,
    historyVerificationId: `${baseId}+SIM-GM-WAIT-DENY`,
    check: (g: CommitGroup, s: any, h?: any) => pairingDeny(g) ?? canonicalAdmission.check(g, s, h),
    verifyHistorical: (g: CommitGroup, s: any) => pairingDeny(g) ?? canonicalAdmission.verifyHistorical?.(g, s) ?? null,
  };

  async function oldJournal(): Promise<string> {
    const dir = tempDir();
    const campaign = await productionCampaign(dir);
    const coordinator = new TemporalCoordinator(campaign.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    await must(coordinator.advance(request("tx-old-ordinary", ORDINARY_TRIGGER, PLAYER, at(150)) as any));
    await must(coordinator.advance(request("tx-old-gap", GM_TRIGGER, PLAYER, at(200)) as any)); // committed by the UNCHANGED code
    await campaign.close();
    return dir;
  }
  const openWith = (dir: string, admission: any) =>
    openFileCampaign(dir, { owners: CANONICAL_OWNER_REGISTRY, admission, audit: true, buildId: "hist1-sim" });

  it("H1-S1 option A (live-only deny): the old journal reopens strictly; the old record is intact; its same-ID retry is a replay; a NEW player+GM-trigger write is denied; the ordinary control is admitted", async () => {
    const dir = await oldJournal();
    const opened = await openWith(dir, liveOnly);
    log("S1.reopen", opened.ok ? "OK" : { code: opened.error.code, message: opened.error.message });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const store = opened.value;
    const coordinator = new TemporalCoordinator(store, shippedProviders());
    expect(coordinator.transaction("tx-old-gap")!.value.trigger.kind).toBe(GM_TRIGGER);
    expect(verifyTemporalIntegrity(store)).toEqual([]);
    const revision = store.head().revision;
    // idempotent retry of the OLD record: the commit core answers a same-intent, same-digest group with its receipt BEFORE validation (campaign-core.ts:401-407)
    const retry = await coordinator.advance(request("tx-old-gap", GM_TRIGGER, PLAYER, at(200)) as any);
    log("S1.retryOld", { ok: retry.ok, revisionMoved: store.head().revision !== revision });
    expect(retry.ok).toBe(true);
    expect(store.head().revision).toBe(revision);
    // contrast in ONE campaign: a NEW live write with the same pairing is denied; one change (the trigger kind) away it is admitted
    const denied = await coordinator.advance(request("tx-new-gap", GM_TRIGGER, PLAYER, at(300)) as any);
    log("S1.newGap", denied.ok ? "ADMITTED" : { code: (denied.error as any).code, message: (denied.error as any).message });
    expect(denied.ok).toBe(false);
    expect(store.head().revision).toBe(revision);
    const control = await coordinator.advance(request("tx-new-ordinary", ORDINARY_TRIGGER, PLAYER, at(300)) as any);
    expect(control.ok).toBe(true);
    await store.close();
  });

  it("H1-S2 option B (blanket historical deny + new verifier identity): the SAME old journal can no longer be opened by this build at all; a journal without the record opens", async () => {
    const dir = await oldJournal();
    const refused = await openWith(dir, blanket);
    log("S2.reopenOld", refused.ok ? "OPENED" : { code: refused.error.code, message: refused.error.message, details: refused.error.details });
    expect(refused.ok).toBe(false);
    if (refused.ok) await refused.value.close();
    // control: the identical journal minus the one record opens under the identical wrapper
    const clean = tempDir();
    const campaign = await productionCampaign(clean);
    const coordinator = new TemporalCoordinator(campaign.store, shippedProviders());
    await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    await must(coordinator.advance(request("tx-old-ordinary", ORDINARY_TRIGGER, PLAYER, at(150)) as any));
    await campaign.close();
    const ok = await openWith(clean, blanket);
    log("S2.reopenClean", ok.ok ? "OPENED" : { code: ok.error.code, message: ok.error.message });
    expect(ok.ok).toBe(true);
    if (ok.ok) await ok.value.close();
  });
});

// ===========================================================================================================================
describe("H1-V provenance: the literal in shipped source", () => {
  it("H1-V1 within packages/*/src and apps/*/src the literal occurs ONLY in the unexported B0 module; the shipped operator states exactly three trigger-kind spellings", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name) && readFileSync(p, "utf8").includes(GM_TRIGGER)) hits.push(p);
      }
    };
    for (const root of ["packages", "apps"]) for (const pkg of readdirSync(root)) {
      try { walk(join(root, pkg)); } catch { /* not a directory */ }
    }
    log("V1.hits", hits);
    expect(hits).toEqual(["packages/contracts/src/temporal-gm-wait.ts"]);
    expect(canonicalEqual(1, 1)).toBe(true);
  });
});
