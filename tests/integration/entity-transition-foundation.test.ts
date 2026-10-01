/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// World-State Entity Continuity / Transition Close Backbone Foundation — "an already-accepted fallback physical
// entity exists at one locus → an already-established external cause requires one material same-entity locus
// transition → World-State, as fallback custodian, commits the entity's new authoritative current locus exactly
// once and seals it in ECT-01 under the Entity Transition Close → a later consumer reads that committed
// transition → the cause owner never becomes a second entity/location writer."
// Register lineage: IA-01/02/03/04 (partial), IA-05/IA-06/IA-22 (reused / partial); RC-02/04/10/16;
// IM-02, IM-03, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0). CAL-01 stays
// UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EntityTransitionCloseSchema,
  ENTITY_TRANSITION_CLOSE_NAME,
  FallbackPhysicalEntitySchema,
  entityTransitionStage,
  productionCompletionKey,
} from "@immortalis/contracts";
import {
  TemporalCoordinator,
  currentLocusOf,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  CAUSE_1,
  DEST_LOCUS_ID,
  ENT_T_EFFECT,
  ENT_T_LATER,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PROD_T1,
  REQ_1,
  REQ_2,
  RESERVE_OTHER,
  at,
  acceptedEntityId,
  acceptedEntityKey,
  causeKey,
  entStopAtBoundaryRequest,
  entityConsumerResultKey,
  entityProviders,
  prodAdvanceRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptCauseRegister,
  acceptEntity,
  commitCause,
  currentLocusOfRequest,
  registerConsumer,
  registerTransition,
  seededEntityCampaign,
} from "../support/entity.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OP_TRANSITION = "world-state-commit-entity-transition";

describe("the already-accepted entity is the transition's subject (acceptance 1)", () => {
  it("the entity the existing Production path accepted is the subject, at its accepted locus, before any cause exists", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    const resolved = currentLocusOfRequest(s.campaign, REQ_1)!;
    expect(resolved.entity.fact.key).toBe(acceptedEntityKey(REQ_1));
    expect(resolved.entity.fact.version).toBe(1);
    expect(resolved.transition).toBeUndefined();
    // before a transition the accepted locality IS the current locus: one truth
    expect(resolved.current).toEqual(resolved.origin);
    expect(resolved.current.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the primary path: cause → one transition, committed once by World-State (acceptance 2-6)", () => {
  it("a synthetic cause requires one same-entity locus change; World-State, and only World-State, commits it; the entity is untouched", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    const entityKey = acceptedEntityKey(REQ_1);
    const entityBefore = s.campaign.store.getFact(entityKey)!;
    const causeBefore = s.campaign.store.getFact(causeKey(CAUSE_1))!;
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))).toBeUndefined();

    const r = await must(s.coordinator.advance(entStopAtBoundaryRequest("tx-transition", CAUSE_1)));
    // stops exactly at the cause's own declared boundary, the remainder to the target held for continuation
    expect(r.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(r.transaction.outcome.actual_stop).toEqual(ENT_T_EFFECT);
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      OP_TRANSITION,
    ]);

    // the transition: committed by World-State, under the stage identity derived from the cause alone
    const tf = s.campaign.store.getFact(transitionKeyOf(REQ_1))!;
    expect(tf.owner).toBe("world_state");
    expect(tf.facet).toBe("world_fallback_physical_entity");
    expect(tf.version).toBe(1);
    expect(tf.provenance.group_id).toBe(stageGroupId(entityTransitionStage(CAUSE_1)));
    expect(tf.provenance.intent_id).toBe(stageIntentId(entityTransitionStage(CAUSE_1)));
    expect(tf.provenance.cause).toBe("transaction:tx-transition");
    const t = EntityTransitionCloseSchema.parse(tf.value);
    expect(t.close.name).toBe(ENTITY_TRANSITION_CLOSE_NAME);
    expect(t.continuity).toMatchObject({
      relation: "SAME_ENTITY_CONTINUES",
      predecessor: acceptedEntityId(REQ_1),
      successor: acceptedEntityId(REQ_1),
      existence: "CONTINUES",
      form: "UNCHANGED",
      conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
    });
    expect(t.locus.from.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(t.locus.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(t.closed_at).toEqual(ENT_T_EFFECT);
    // it references the causing result (provenance), pinned at the version read
    expect(t.cause).toEqual({
      owner: causeBefore.owner,
      fact_key: causeKey(CAUSE_1),
      version: causeBefore.version,
      cause_id: CAUSE_1,
    });
    expect(t.entity).toEqual({
      fact_key: entityKey,
      entity_id: acceptedEntityId(REQ_1),
      version: entityBefore.version,
    });

    // the cause owner never became a writer: its fact is byte-identical, and nothing of its owner wrote an entity
    expect(s.campaign.store.getFact(causeKey(CAUSE_1))).toEqual(causeBefore);
    const writers = s.campaign.store
      .listFacts()
      .filter((f) => /^world\/[^/]+\/entity\//.test(f.key))
      .map((f) => [f.key, f.owner]);
    expect(writers.every(([, o]) => o === "world_state")).toBe(true);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the SAME entity continues: identity, conserved quantity and physical condition are byte-identical; only the current locus changes (acceptance 4)", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    const entityKey = acceptedEntityKey(REQ_1);
    const before = s.campaign.store.getFact(entityKey)!;
    await must(s.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    const after = s.campaign.store.getFact(entityKey)!;
    // not rewritten, not replaced, not re-versioned: the whole fact, provenance included
    expect(after).toEqual(before);
    expect(after.version).toBe(1);
    const entity = FallbackPhysicalEntitySchema.parse(after.value);
    expect(entity.entity_id).toBe(acceptedEntityId(REQ_1));
    expect(entity.quantity).toEqual({ amount: 1, unit: "synthetic-unit-d" });
    expect(entity.condition).toBe("synthetic-condition-d");
    // no replacement entity was minted to simulate the move
    expect(
      s.campaign.store.listFacts().filter((f) => /^world\/[^/]+\/entity\/[^/]+$/.test(f.key)),
    ).toHaveLength(1);
  });

  it("the origin stays historical truth but ceases to be current; there is one authoritative current locus (acceptance 5)", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    const r = currentLocusOfRequest(s.campaign, REQ_1)!;
    // origin: the accepted locality, still exactly what was sealed at acceptance
    expect(r.origin.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(r.entity.value.locality.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    // current: the transition's destination, and only that
    expect(r.current.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(r.current).not.toEqual(r.origin);
    expect(currentLocusOf(r.entity.value, r.transition?.value)).toEqual(r.current);
    // the historical origin is reconstructible from the transition's own record as well
    expect(r.transition!.value.locus.from).toEqual(r.entity.value.locality);
    // exactly one current-locus truth exists for the entity: one entity fact, one transition slot
    const keys = s.campaign.store
      .listFacts()
      .filter((f) => f.key.includes(`/entity/${acceptedEntityId(REQ_1)}`))
      .map((f) => f.key);
    expect(keys.sort()).toEqual([acceptedEntityKey(REQ_1), transitionKeyOf(REQ_1)].sort());
  });

  it("the Entity Transition Close is the named close of the stage: its commit constitutes it (acceptance 6)", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    const object = s.coordinator.object(`obj-entity-transition-${CAUSE_1}`)!.value;
    const decl = object.dependencies[0]!;
    expect(decl.declares_close).toEqual({ name: ENTITY_TRANSITION_CLOSE_NAME });
    expect(decl.stage).toEqual(entityTransitionStage(CAUSE_1));
    expect(decl.produces).toEqual([transitionKeyOf(REQ_1)]);
    // one earned boundary: the outcome's own instant, never a requested horizon
    expect(object.next_boundary).toEqual({
      boundary_id: `boundary-entity-transition-${CAUSE_1}`,
      at: ENT_T_EFFECT,
    });
  });
});

describe("a downstream NOW read depends on the committed transition without mutating it (acceptance 7)", () => {
  it("a consumer at the transition's instant reads the committed Entity Transition Close AS-OF-NOW, after it, and changes nothing", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    await registerConsumer(s, CAUSE_1, REQ_1, 41);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    const ops = r.transaction.stages.map((x) => x.stage.owner_operation.operation);
    // dependency order: the transition's stage commits before the stage that reads it
    expect(ops).toEqual([OP_TRANSITION, "synthetic-entity-transition-consume-now"]);
    const tf = s.campaign.store.getFact(transitionKeyOf(REQ_1))!;
    const consumed = s.campaign.store.getFact(entityConsumerResultKey(CAUSE_1))!;
    expect((consumed.value as any).observed).toEqual({
      fact_key: tf.key,
      version: 1,
      entity_id: acceptedEntityId(REQ_1),
      current_locus: DEST_LOCUS_ID,
      origin_locus: FIXTURE_LOCUS_ID,
    });
    // the read is a dependency, never a write: the transition is still version 1 under its one stage group
    expect(tf.version).toBe(1);
    const read = r.transaction.stages[1]!.reads[0]!;
    expect(read).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "world_state", fact_key: tf.key },
      source_basis: { version: 1, committed_by: tf.provenance.group_id },
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a consumer whose own boundary lies LATER reads the already-committed transition by identity and does not recreate it", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    await registerConsumer(s, CAUSE_1, REQ_1, 41, { boundary_at: ENT_T_LATER });
    const first = await must(
      s.coordinator.advance(entStopAtBoundaryRequest("tx-transition", CAUSE_1)),
    );
    expect(first.transaction.stages).toHaveLength(1);
    const tfBefore = s.campaign.store.getFact(transitionKeyOf(REQ_1))!;
    const second = await must(
      s.coordinator.continueRemainder({
        transaction_id: "tx-cont",
        cause: "cause-tx-cont",
        trigger: { kind: "fixture-advance-request", ref: "ref-tx-cont" },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(second.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      "synthetic-entity-transition-consume-now",
    ]);
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))).toEqual(tfBefore);
    expect(
      (s.campaign.store.getFact(entityConsumerResultKey(CAUSE_1))!.value as any).observed.version,
    ).toBe(1);
  });

  it("a consumer may also read the named close itself, AS-OF-DECLARED-CLOSE, because the stage declares it", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptCauseRegister(s);
    await registerConsumer(s, CAUSE_1, REQ_1, 41, { mode: "CLOSE" });
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      OP_TRANSITION,
      "synthetic-entity-transition-consume-close",
    ]);
    expect(r.transaction.stages[1]!.reads[0]).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      close_basis: { name: ENTITY_TRANSITION_CLOSE_NAME },
    });
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
  });
});

describe("history stays valid: Production's acceptance and the entity are not rewritten (acceptance 11)", () => {
  it("after the later transition, the Production completion, the acceptance and its availability are exactly as they were", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    const snapshot = () =>
      Object.fromEntries(
        s.campaign.store
          .listFacts()
          .filter((f) => /^(production|world\/[^/]+\/entity\/[^/]+$)/.test(f.key))
          .map((f) => [f.key, f]),
      );
    const before = snapshot();
    const availabilityBefore = s.production.availability(REQ_1);
    await commitCause(s, CAUSE_1, REQ_1, 1);
    await registerTransition(s, CAUSE_1, 31);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    expect(snapshot()).toEqual(before);
    expect(s.production.availability(REQ_1)).toEqual(availabilityBefore);
    expect(s.production.completion(REQ_1)!.fact.key).toBe(productionCompletionKey(REQ_1));
    // the entity still derives from exactly the completion it accepted
    const entity = s.production.acceptedEntity(FIXTURE_WORLD_ID, `durable:${REQ_1}`)!;
    expect(entity.value.accepted_from.version).toBe(s.production.completion(REQ_1)!.fact.version);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("unrelated state is untouched; nothing is scanned (acceptance 12)", () => {
  it("another accepted entity, its object and the unrelated Reserve are never read, staged or written, and nothing is listed", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    await acceptEntity(s, REQ_2, 2, { reserve_id: RESERVE_OTHER, completion_at: at(160) });
    await commitCause(s, CAUSE_1, REQ_1, 1);
    await registerTransition(s, CAUSE_1, 31);
    const otherEntityKey = acceptedEntityKey(REQ_2);
    const otherBefore = s.campaign.store.getFact(otherEntityKey)!;
    const keysBefore = s.campaign.store.listFacts().map((f) => f.key);
    const spy = spyStore(s.campaign.store);
    const coordinator = new TemporalCoordinator(spy.store, entityProviders());
    await must(coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    expect(spy.listCalls()).toBe(0);
    // by identity only: the engaged cone and nothing of the unrelated entity
    expect(spy.getFacts.some((k) => k.includes(acceptedEntityId(REQ_2)))).toBe(false);
    expect(spy.getFacts.some((k) => k.includes("reserve-other"))).toBe(false);
    expect(s.campaign.store.getFact(otherEntityKey)).toEqual(otherBefore);
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_2))).toBeUndefined();
    // the only new facts are the transition, the retired object's advance, the state and the transaction
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !keysBefore.includes(k));
    expect(added.sort()).toEqual(
      [transitionKeyOf(REQ_1), "temporal/transaction/tx-transition"].sort(),
    );
  });
});
