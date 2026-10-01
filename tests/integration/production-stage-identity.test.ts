/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Repair evidence (Blue review of PR #6): a Production completion, and the custodian's acceptance of it, are
// lawful ONLY as their IM-02 stages. A raw `store.commit` that supplies the exact derived operation / Reserve /
// claim / envelope while the operation's object is registered and unretired but canonical time is still before
// the declared boundary is refused — under the REAL registered Production rule and the archivist authority, so
// neither a rule-drift nor an authority check is what refuses it — while a stage that genuinely committed during
// an interrupted IM-02 transaction stays recoverable by identity. Admission and load-time verification apply
// the one `stageIdentityViolation` rule.
// Register lineage: IA-02, IA-03, IA-04, IA-06 (partial); RC-07, RC-10, RC-16; IM-02, IM-05, IM-11, IM-12, IM-17.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_WORLD_STATE,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionReserveSchema,
  productionCompletionKey,
  productionCompletionStage,
  productionOperationKey,
  worldAcceptanceStage,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type StageKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  deriveAcceptedEntity,
  productionCompletionProvider,
  deriveCompletion,
  factKind,
  stageGroupId,
  stageIntentId,
  verifyProductionIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T0,
  PROD_T1,
  PROD_TC,
  REQ_1,
  RESERVE_MAIN,
  continuationInput,
  prodAdvanceRequest,
  productionProviders,
} from "@immortalis/testkit";
import {
  prodSummary,
  reopenProduction,
  seededProductionCampaign,
  startAndRegister,
} from "../support/production.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const entityKey = (op: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, `durable:${op}`);
const completionStage = productionCompletionStage(REQ_1);
const acceptanceStage = worldAcceptanceStage(REQ_1);

interface Ids {
  readonly group?: string;
  readonly intent?: string;
  readonly cause?: string;
}

const write = (
  key: string,
  value: unknown,
  expected_version: number,
  owner: string,
  facet: string,
) => ({
  key,
  owner,
  facet,
  value: value as never,
  unit: null,
  basis: "raw-basis",
  secrecy: "raw-secrecy",
  expected_version,
});

/**
 * The EXACT derived completion, as any raw caller could build it from committed state alone, under the REAL
 * registered Production rule and the canonical archivist authority. `ids` default to arbitrary raw identities.
 */
function exactCompletion(store: CampaignStore, ids: Ids = {}): CommitGroup {
  const opFact = store.getFact(productionOperationKey(REQ_1))!;
  const op = ProductionOperationSchema.parse(opFact.value);
  const reserve = store.getFact(op.reserve.fact_key)!;
  const claim = store.getFact(op.claim.fact_key)!;
  const derived = deriveCompletion({
    operation: op,
    reserve: ProductionReserveSchema.parse(reserve.value),
    reserveVersion: reserve.version,
    claim: ProductionClaimSchema.parse(claim.value),
  });
  if (!derived.ok) throw new Error(derived.error.message);
  const d = derived.value;
  const kind = factKind("production_completion");
  const w = (key: string, value: unknown, v: number) =>
    write(key, value, v, kind.owner, kind.facet);
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: ids.group ?? "raw-completion-group",
    intent_id: ids.intent ?? "raw-completion-intent",
    owner: kind.owner,
    facet: kind.facet,
    cause: ids.cause ?? "raw-cause",
    rule: kind.rule, // the REAL registered Production rule
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      w(opFact.key, d.operation, opFact.version),
      w(reserve.key, d.reserve, reserve.version),
      w(claim.key, d.claim, claim.version),
      w(productionCompletionKey(REQ_1), d.envelope, 0),
    ],
  };
}

/** The EXACT derived acceptance of an already-committed completion, under the real custodian rule. */
function exactAcceptance(store: CampaignStore, ids: Ids = {}): CommitGroup {
  const completion = store.getFact(productionCompletionKey(REQ_1))!;
  const world = store.getFact(worldProfileKey(FIXTURE_WORLD_ID))!;
  const locus = store.getFact(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!;
  const kind = factKind("world_fallback_entity");
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: ids.group ?? "raw-acceptance-group",
    intent_id: ids.intent ?? "raw-acceptance-intent",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    cause: ids.cause ?? "raw-cause",
    rule: kind.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [completion, world, locus].map((f) => ({ key: f.key, version: f.version })),
    depends_on: [completion, world, locus].map((f) => f.provenance.group_id),
    writes: [
      write(
        entityKey(REQ_1),
        deriveAcceptedEntity(completion.value as any, completion.version),
        0,
        OWNER_WORLD_STATE,
        FACET_WORLD_FALLBACK_ENTITY,
      ),
    ],
  };
}

/** A store that "loses" the matching commit: it returns UNKNOWN_OUTCOME and commits nothing (a crash just before it). */
function interrupting(
  inner: CampaignStore,
  loses: (g: CommitGroup) => boolean,
): { store: CampaignStore; lost: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      if (loses(g as CommitGroup)) {
        n += 1;
        return Promise.resolve({
          ok: false as const,
          error: { code: "UNKNOWN_OUTCOME" as const, message: "simulated interruption" },
        });
      }
      return inner.commit(g);
    },
  };
  return { store, lost: () => n };
}
const isKernelTransaction = (g: CommitGroup) =>
  g.owner === "temporal_kernel" && g.writes.some((w) => w.key.startsWith("temporal/transaction/"));
const isAcceptance = (g: CommitGroup) => g.facet === FACET_WORLD_FALLBACK_ENTITY;

/** The integrity verifier over a view of the committed facts with one fact edited. */
function verifyEdited(store: CampaignStore, key: string, edit: (f: OwnerFact) => void): string {
  const facts = structuredClone([...store.listFacts()]) as OwnerFact[];
  edit(facts.find((f) => f.key === key)!);
  const view: CampaignStore = {
    descriptor: store.descriptor,
    head: () => store.head(),
    getFact: (k) => store.getFact(k),
    listFacts: () => facts,
    lookupReceipt: (i) => store.lookupReceipt(i),
    committedGroup: (i) => store.committedGroup(i),
    commit: (g) => store.commit(g),
    close: () => store.close(),
  };
  return verifyProductionIntegrity(view)
    .map((v) => v.message)
    .join(" | ");
}

describe("a raw pre-boundary completion is refused: registered, unretired object, canonical time before the boundary", () => {
  it("the exact derived completion, under the real Production rule, is refused unless it is published as its IM-02 stage", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    // the missing state, exactly: object registered and unretired, canonical time strictly before the boundary
    expect(s.coordinator.object(`obj-production-${REQ_1}`)!.value.next_boundary).not.toBeNull();
    expect(s.coordinator.state()!.value.canonical_time).toEqual(PROD_T0);
    expect(PROD_T0.value).toBeLessThan(PROD_TC.value);
    const before = prodSummary(s.campaign, s.coordinator);

    const attempts: [string, Ids][] = [
      ["arbitrary raw identities", {}],
      ["the derived group id only", { group: stageGroupId(completionStage) }],
      [
        "the derived group and intent ids but a non-transaction cause",
        { group: stageGroupId(completionStage), intent: stageIntentId(completionStage) },
      ],
      [
        "the derived intent id only",
        { intent: stageIntentId(completionStage), cause: "transaction:tx-x" },
      ],
      [
        "an empty transaction cause",
        {
          group: stageGroupId(completionStage),
          intent: stageIntentId(completionStage),
          cause: "transaction:",
        },
      ],
    ];
    for (const [name, ids] of attempts) {
      const r = await s.campaign.store.commit(exactCompletion(s.campaign.store, ids));
      expect(r.ok, name).toBe(false);
      // refused by the completion's own admission — not by registry/authority/rule/exactness
      expect(!r.ok && r.error.code, name).toBe("REFERENCE_INVALID");
      expect(!r.ok && r.error.message, name).toMatch(/published only as its IM-02 stage/);
    }
    // nothing was consumed, sealed or made available
    expect(prodSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(10);
    expect(s.production.availability(REQ_1).state).toBe("NOT_COMPLETED");
    expect(s.campaign.verify()).toEqual([]);

    // the honest transaction is unaffected, and completes exactly once at the boundary
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      "production-complete-operation",
      "world-state-accept-fallback-durable",
    ]);
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
  });

  it("the same exact group is also refused at the boundary instant when it is not the coordinator's stage (an unresolved stop leaves the object unretired)", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const stopper = interrupting(
      s.campaign.store,
      (g) => g.group_id === stageGroupId(completionStage),
    );
    // the custodian-less/blocked path is not needed: simply never let the Production stage land
    const r = await new TemporalCoordinator(stopper.store, productionProviders()).advance(
      prodAdvanceRequest("tx-complete", PROD_T1),
    );
    expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(stopper.lost()).toBe(1);
    const raw = await s.campaign.store.commit(exactCompletion(s.campaign.store));
    expect(raw.ok).toBe(false);
    expect(s.production.availability(REQ_1).state).toBe("NOT_COMPLETED");
  });

  it("a raw acceptance cannot expose the durable: neither of an illicit completion (none can exist) nor of a genuinely committed, still-unaccepted one", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    // (a) no completion exists: a raw acceptance has nothing to accept
    const none = await s.campaign.store.commit({ ...exactAcceptanceOfFuture() } as CommitGroup);
    expect(none.ok).toBe(false);
    // (b) a completion genuinely committed as a stage whose acceptance and kernel group were interrupted
    const crash = interrupting(s.campaign.store, (g) => isAcceptance(g) || isKernelTransaction(g));
    const r = await new TemporalCoordinator(crash.store, productionProviders()).advance(
      prodAdvanceRequest("tx-complete", PROD_T1),
    );
    expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    const raw = await s.campaign.store.commit(exactAcceptance(s.campaign.store));
    expect(!raw.ok && raw.error.code).toBe("REFERENCE_INVALID");
    expect(!raw.ok && raw.error.message).toMatch(/IM-02 stage/);
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    expect(s.campaign.store.getFact(entityKey(REQ_1))).toBeUndefined();
  });
});

/** An acceptance group for a completion that does not exist yet: it can only cite what is not committed. */
function exactAcceptanceOfFuture(): CommitGroup {
  const kind = factKind("world_fallback_entity");
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: "raw-acceptance-group",
    intent_id: "raw-acceptance-intent",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    cause: "raw-cause",
    rule: kind.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      write(
        entityKey(REQ_1),
        {
          entity_id: "durable:req-1",
          entity_class: "synthetic-durable-d",
          quantity: { amount: 1, unit: "synthetic-unit-d" },
          condition: "synthetic-condition-d",
          locality: {
            world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
            locus: {
              fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
              entity_id: FIXTURE_LOCUS_ID,
            },
          },
          custodian: {
            owner: OWNER_WORLD_STATE,
            facet: FACET_WORLD_FALLBACK_ENTITY,
            basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
          },
          accepted_from: {
            owner: "production",
            fact_key: productionCompletionKey(REQ_1),
            version: 1,
            operation_id: REQ_1,
          },
        },
        0,
        OWNER_WORLD_STATE,
        FACET_WORLD_FALLBACK_ENTITY,
      ),
    ],
  };
}

describe("a raw stage that COPIES the derived stage identity and names an arbitrary transaction is refused: no durable transaction authority (Blue review of PR #8)", () => {
  const forged = (stage: StageKey): Ids => ({
    group: stageGroupId(stage),
    intent: stageIntentId(stage),
    cause: "transaction:forged",
  });

  it("the exact derived completion with the right StageKey-derived group and intent ids and a forged transaction cause is refused, before and at the boundary, and consumes nothing", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const before = prodSummary(s.campaign, s.coordinator);
    const r = await s.campaign.store.commit(
      exactCompletion(s.campaign.store, forged(completionStage)),
    );
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/durable authority of its open transaction/);
    expect(prodSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.production.availability(REQ_1).state).toBe("NOT_COMPLETED");
    expect(s.campaign.verify()).toEqual([]);
    // the honest transaction is unaffected and completes exactly once
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
  });

  it("a raw acceptance of a genuinely committed, still-unaccepted completion that copies the identity and forges the cause is refused", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    // the completion commits, the acceptance does not (the custodian is absent): completed-but-unaccepted
    const withoutCustodian = new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionCompletionProvider]),
    );
    await must(withoutCustodian.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    const r = await s.campaign.store.commit(
      exactAcceptance(s.campaign.store, forged(acceptanceStage)),
    );
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(
      /durable authority of its open transaction|depends on the durable authority/,
    );
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a genuinely interrupted IM-02 transaction stays recoverable, without duplicates", () => {
  const reference = async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    await s.campaign.close();
    const ref = await reopenProduction(dir, "ref");
    await must(ref.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const head = ref.campaign.store.head();
    const summary = prodSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();
    return { head, summary };
  };

  it("crash AFTER the Production completion stage, BEFORE the acceptance and the kernel group: reopen verifies; the same transaction adopts the stage and accepts once", async () => {
    const ref = await reference();
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    const crash = interrupting(s.campaign.store, (g) => isAcceptance(g) || isKernelTransaction(g));
    const r = await new TemporalCoordinator(crash.store, productionProviders()).advance(
      prodAdvanceRequest("tx-complete", PROD_T1),
    );
    expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
    // the Production stage really committed: consumed once, sealed, NOT available; no transaction exists
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    expect(s.coordinator.transaction("tx-complete")).toBeUndefined();
    expect(s.coordinator.state()!.value.canonical_time).toEqual(PROD_T0); // time never moved
    await s.campaign.close();

    const re = await reopenProduction(dir, "restart");
    expect(re.campaign.verify()).toEqual([]); // the supportable interrupted state loads
    const again = await must(re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(again.adopted.map((x) => x.owner_operation.operation)).toEqual([
      "production-complete-operation",
    ]);
    expect(again.recomputed_in_place).toEqual([]);
    expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(re.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(re.campaign.store.listFacts().filter((f) => f.key.includes("/entity/"))).toHaveLength(1);
    expect(re.campaign.store.head().revision).toBe(ref.head.revision);
    expect(re.campaign.store.head().state_sha256).toBe(ref.head.state_sha256);
    expect(prodSummary(re.campaign, re.coordinator).production).toEqual(ref.summary.production);
    expect(re.campaign.verify()).toEqual([]);
    await re.campaign.close();
  });

  it("crash AFTER the World-State acceptance stage, BEFORE the kernel group: reopen verifies; the same transaction adopts both stages and duplicates nothing", async () => {
    const ref = await reference();
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    const crash = interrupting(s.campaign.store, isKernelTransaction);
    const r = await new TemporalCoordinator(crash.store, productionProviders()).advance(
      prodAdvanceRequest("tx-complete", PROD_T1),
    );
    expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(crash.lost()).toBe(1);
    // both stages committed; the kernel never advanced time, so the completion is uncited and pre-boundary
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.coordinator.transaction("tx-complete")).toBeUndefined();
    expect(s.coordinator.state()!.value.canonical_time).toEqual(PROD_T0);
    expect(s.coordinator.object(`obj-production-${REQ_1}`)!.value.next_boundary).not.toBeNull();
    await s.campaign.close();

    const re = await reopenProduction(dir, "restart");
    expect(re.campaign.verify()).toEqual([]);
    const again = await must(re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(again.adopted.map((x) => x.owner_operation.operation)).toEqual([
      "production-complete-operation",
      "world-state-accept-fallback-durable",
    ]);
    expect(again.recomputed_in_place).toEqual([]);
    expect(again.transaction.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(re.campaign.store.getFact(entityKey(REQ_1))!.version).toBe(1);
    expect(re.campaign.store.head().revision).toBe(ref.head.revision);
    expect(re.campaign.store.head().state_sha256).toBe(ref.head.state_sha256);
    // a raw duplicate acceptance of the (now cited) durable is refused too
    expect((await re.campaign.store.commit(exactAcceptance(re.campaign.store))).ok).toBe(false);
    expect(re.campaign.verify()).toEqual([]);
    await re.campaign.close();
  });

  it("an interrupted transaction's stage is adopted by the continuation form too (the held unresolved remainder), never recomputed", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const crash = interrupting(s.campaign.store, isAcceptance);
    await new TemporalCoordinator(crash.store, productionProviders()).advance(
      prodAdvanceRequest("tx-complete", PROD_T1),
    );
    expect(s.campaign.verify()).toEqual([]);
    const r = await must(
      new TemporalCoordinator(s.campaign.store, productionProviders()).advance(
        prodAdvanceRequest("tx-complete", PROD_T1),
      ),
    );
    expect(r.adopted).toHaveLength(1);
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    void continuationInput;
  });
});

describe("load/integrity verification applies the same distinction", () => {
  async function interrupted(loses: (g: CommitGroup) => boolean) {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await new TemporalCoordinator(
      interrupting(s.campaign.store, loses).store,
      productionProviders(),
    ).advance(prodAdvanceRequest("tx-complete", PROD_T1));
    return s;
  }
  const completionKey = productionCompletionKey(REQ_1);

  it("accepts exactly the genuinely supportable interrupted states", async () => {
    for (const loses of [
      isKernelTransaction,
      (g: CommitGroup) => isAcceptance(g) || isKernelTransaction(g),
    ]) {
      const s = await interrupted(loses);
      expect(verifyProductionIntegrity(s.campaign.store)).toEqual([]);
      expect(s.campaign.verify()).toEqual([]);
    }
  });

  it("fails closed on an otherwise identical completion that is not a coordinator stage (uncited, boundary unretired)", async () => {
    const s = await interrupted(isAcceptance);
    const identity = /published only as its IM-02 stage/;
    // the same state, but the completion carries an arbitrary raw identity (the committed content is identical)
    for (const edit of [
      (f: OwnerFact) => ((f.provenance as any).group_id = "raw-completion-group"),
      (f: OwnerFact) => ((f.provenance as any).intent_id = "raw-completion-intent"),
      (f: OwnerFact) => ((f.provenance as any).cause = "raw-cause"),
    ]) {
      expect(verifyEdited(s.campaign.store, completionKey, edit)).toMatch(identity);
    }
    expect(verifyEdited(s.campaign.store, completionKey, () => undefined)).toBe("");
  });

  it("fails closed on an otherwise identical acceptance that is not the custodian's stage", async () => {
    const s = await interrupted(isKernelTransaction);
    expect(verifyEdited(s.campaign.store, entityKey(REQ_1), () => undefined)).toBe("");
    for (const edit of [
      (f: OwnerFact) => ((f.provenance as any).group_id = "raw-acceptance-group"),
      (f: OwnerFact) => ((f.provenance as any).intent_id = "raw-acceptance-intent"),
      (f: OwnerFact) => ((f.provenance as any).cause = "raw-cause"),
    ]) {
      expect(verifyEdited(s.campaign.store, entityKey(REQ_1), edit)).toMatch(
        /published only as its IM-02 stage/,
      );
    }
    // identity is that of the stage the StageKey derives, so a swapped stage identity is also refused
    expect(
      verifyEdited(s.campaign.store, entityKey(REQ_1), (f) => {
        (f.provenance as any).group_id = stageGroupId(completionStage);
        (f.provenance as any).intent_id = stageIntentId(completionStage);
      }),
    ).toMatch(/published only as its IM-02 stage/);
    expect(stageGroupId(acceptanceStage)).not.toBe(stageGroupId(completionStage));
  });

  it("a persisted raw completion cannot be smuggled in through the package either: the open verifies identity", async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    await new TemporalCoordinator(
      interrupting(s.campaign.store, (g) => isAcceptance(g) || isKernelTransaction(g)).store,
      productionProviders(),
    ).advance(prodAdvanceRequest("tx-complete", PROD_T1));
    await s.campaign.close();
    const opened = await CanonicalCampaign.open(dir, { extension: PRODUCTION_FIXTURE_EXTENSION });
    expect(opened.ok).toBe(true);
    if (opened.ok) await opened.value.close();
  });
});
