/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with raw facts */
// CPAA-C1 v0.3 (design RATIFIED; implementation acceptance pending) — the conformity repairs F-1 to F-5, each proved by its positive AND by
// a falsifying counterexample. Every determination below is DERIVED by the owner of the evidence (the engine, Population, the I-002 owner
// through `role.gm` interpretation and `role.archivist` writing); a fixture exercises a mechanism but never states its result. The scripted
// readings are PLUMBING (they read the delivered words); they are not evidence that an AI understood a sentence, and no real authored PC
// states an exact cycle (that stays an irreducible prerequisite). Missing evidence WITHHOLDS: it writes nothing and offers no default.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHOICE_AUTHORITY,
  pcCollectionAttestationKey,
  popPcRepresentationKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import {
  PC_COLLECTION_ATTESTATION_RULE,
  POPULATION_PC_AGGREGATE_STATUS_RULE,
  PopulationAdapter,
} from "@immortalis/engine";
import {
  FIXTURE_INDEPENDENT_PREMISES,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  popPublication,
} from "@immortalis/testkit";
import { PC_TARGET_COMMITTED, pcTargetTransaction } from "../support/pc-target-advance.ts";
import { must } from "../support/temporal.ts";
import {
  ACT_A,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  COMMIT_REQ,
  MECH,
  PC,
  SRC_SOURCE_KEY,
  T0,
  TAU,
  W,
  at,
  attestMechanism,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  cycleAnswer,
  cycleWords,
  determineRepresentation,
  extractionOf,
  prepareToStart,
  reserveAmount,
  sourceRemaining,
  trustedCollection,
  type CollectionSeeded,
} from "../support/pc-collection.ts";
import { cease, forge, keys, rawAdvance, refusedWith, revision } from "../support/pc-cessation.ts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  commitConfirmedPcCollection,
} from "@immortalis/protocol";

const advanceTo = (s: CollectionSeeded, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );
const resident = (id: string, presence = "place-village") => ({
  unit_id: id,
  residence: "place-village",
  presence,
  burden_allocation: null,
});
const addLedger = (
  s: CollectionSeeded,
  id: string,
  units: ReturnType<typeof resident>[],
  n: number,
) =>
  must(
    new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(n),
      ledger: {
        ledger_id: id,
        unit_class: "synthetic-unit-class",
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        units: [...units].sort((a, b) => (a.unit_id < b.unit_id ? -1 : 1)),
        point: T0,
      },
    }),
  );
const populationLedgerCount = (s: CollectionSeeded) =>
  s.campaign.store.listFacts().filter((f) => /^population\/[^/]+\/ledger$/.test(f.key)).length;
const nothingWritten = (s: CollectionSeeded, before: string) => {
  expect(s.campaign.store.head().state_sha256).toBe(before);
  expect(sourceRemaining(s)).toBe(5);
  expect(reserveAmount(s)).toBe(0);
};

describe("F-1 — the solitary class is derived from the owners' scene evidence and enforced over the occupied interval", () => {
  it("positive (the independent owners' complete-scene premise is a fixture stand-in): owner-held presence evidence, that premise and a quoted reading establish the class; the work record's §11 determination follows from it", async () => {
    const s = await collectionCampaign();
    expect((await confirmAndStart(s, ACT_A, 3)).started).toEqual(COLLECTION_COMMITTED);
    const reach = s.collect.reach(PC, ACT_A)!.value;
    expect(reach.scene_verdict).toBe("SOLITARY_CLASS_ESTABLISHED");
    // the evidence is the owners' own: world and locus wording and the Population ledger attached to this locus, pinned
    expect(reach.scene_evidence.ledgers).toHaveLength(1);
    expect(reach.scene_evidence.presence_here).toEqual([]);
    expect(s.collect.work(PC, ACT_A)!.value.derivation.interaction_floor).toBe(
      "NOT_APPLICABLE_SOLITARY_DIRECT_HANDLING",
    );
    expect(await advanceTo(s, T0.value + 3 * TAU, "tx-end")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
  }, 120_000);

  it("withheld, not defaulted: with no Population ledger at the locus the owners hold no presence evidence, so no task, no reading and no act exist", async () => {
    const s = await collectionCampaign({ noLedger: true });
    const before = s.campaign.store.head().state_sha256;
    const r = await confirmAndStart(s, ACT_A, 3);
    // the commitment is a willingness only; but there is nothing to read, so no judgment, no occupancy and no work
    expect(r.task.ok).toBe(false);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.reach(PC, ACT_A)).toBeUndefined();
    expect(s.collect.occupancy(PC)).toBeUndefined();
    expect(extractionOf(s, ACT_A)).toBeUndefined();
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(s.campaign.store.head().revision).toBeGreaterThan(0);
    void before;
  }, 120_000);

  it("BLUE H-1: a Population ledger at the locus and an affirmative reading do not complete the scene — without an independent owner's complete-scene premise nothing is established", async () => {
    // the ledger exists, lists no one else, and a host WOULD read "no co-present interaction": the ledger proves its own members only
    const s = await collectionCampaign({ sceneComplete: false });
    expect(populationLedgerCount(s)).toBe(1);
    const r = await confirmAndStart(s, ACT_A, 3);
    expect(r.task.ok).toBe(false);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.reach(PC, ACT_A)).toBeUndefined();
    expect(s.collect.occupancy(PC)).toBeUndefined();
    expect(extractionOf(s, ACT_A)).toBeUndefined();
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 120_000);

  it("BLUE H-1: the independent premise withdrawn mid-interval re-opens the class — the act is invalidated, never silently completed or credited", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    FIXTURE_INDEPENDENT_PREMISES.sceneComplete = false;
    const hold = s.collect.hold(PC);
    expect(hold.state).toBe("INVALIDATED");
    expect((hold as any).reason).toMatch(/scene evidence changed/);
    await rawAdvance(s, "tx-raw-end-h1", T0.value + 3 * TAU);
    expect(s.collect.closed(PC, ACT_A)).toBe(false);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 180_000);

  it("a model-authored solitary=true is nothing: an undecided reading, an unquoted ground, and a reading that ignores a unit Population records as present all WITHHOLD", async () => {
    const present = [resident("unit-bystander", FIXTURE_LOCUS_ID)];
    // the host does not decide
    const a = await collectionCampaign({ ledgerUnits: [resident("unit-far")] });
    expect(
      (await confirmAndStart(a, ACT_A, 3, ["OPEN", "NOT_AT_ISSUE", "UNDETERMINED"])).started,
    ).toSatisfy((x: unknown) => JSON.stringify(x) === COLLECTION_REFUSAL);
    expect(a.collect.reach(PC, ACT_A)!.value.scene_verdict).toBe("WITHHELD");
    // Population records another unit as present at this very locus, and the host's reading does not acknowledge it
    const b = await collectionCampaign({ ledgerUnits: present });
    const unack = await confirmAndStart(b, ACT_A, 3, [
      "OPEN",
      "NOT_AT_ISSUE",
      "SOLITARY_UNACKNOWLEDGED",
    ]);
    expect(JSON.stringify(unack.started)).toBe(COLLECTION_REFUSAL);
    expect(b.collect.reach(PC, ACT_A)!.value.scene_verdict).toBe("WITHHELD");
    expect(extractionOf(b, ACT_A)).toBeUndefined();
    // the same evidence, the host acknowledging the unit and still reading no co-present consequential interaction: established (the counterexample's pair)
    const c = await collectionCampaign({ ledgerUnits: present });
    expect((await confirmAndStart(c, ACT_A, 3)).started).toEqual(COLLECTION_COMMITTED);
    expect(c.collect.reach(PC, ACT_A)!.value.scene_verdict).toBe("SOLITARY_CLASS_ESTABLISHED");
    expect(c.collect.reach(PC, ACT_A)!.value.scene_evidence.presence_here).toHaveLength(1);
    // an unquoted ground is set aside: nothing is written
    const d = await collectionCampaign();
    const ctx = trustedCollection(d, ACT_A, 3);
    await commitConfirmedPcCollection(ctx, COMMIT_REQ);
    const before = d.campaign.store.head().state_sha256;
    const task = d.collect.reachTask(PC, ACT_A, MECH)!;
    const bad = await d.collect.adjudicateReach({
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
      answer: {
        task_digest: task.digest,
        path: { reading: "OPEN", grounds: [task.source.access_facts[0]!.statement] },
        mechanism: { reading: "NOT_AT_ISSUE", grounds: [] },
        scene: {
          reading: "NO_CO_PRESENT_CONSEQUENTIAL_INTERACTION",
          grounds: ["nobody at all is anywhere near here"],
        },
      },
    });
    expect(bad.ok).toBe(false);
    expect(d.campaign.store.head().state_sha256).toBe(before);
  }, 180_000);

  it("a co-present consequential interaction takes the act OUT of the class: §11 applies and exact completion is withheld, with no invented band", async () => {
    const s = await collectionCampaign();
    const r = await confirmAndStart(s, ACT_A, 3, ["OPEN", "NOT_AT_ISSUE", "ENGAGED"]);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.reach(PC, ACT_A)!.value.scene_verdict).toBe("ENGAGED_NOT_SOLITARY");
    expect(s.collect.reach(PC, ACT_A)!.value.verdict).toBe("REACHABLE"); // the path is open; the CLASS is what fails
    expect(extractionOf(s, ACT_A)).toBeUndefined();
    expect(s.collect.work(PC, ACT_A)).toBeUndefined();
    // admission itself re-derives it (a raw start on that judgment is refused)
    const raw = await s.collect.startWork({
      ...colPublication(310),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
      basis_id: "basis-main",
    });
    expect(raw.ok).toBe(false);
    expect(sourceRemaining(s)).toBe(5);
  }, 120_000);

  it("re-evaluated through the interval: a change of who Population records at the locus re-opens the class — the act is invalidated, never silently completed or credited", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    expect(await advanceTo(s, T0.value + 4, "tx-pre")).toEqual(PC_TARGET_COMMITTED);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    // a consequential counterpart comes to be recorded as present at the locus (Population's own new ledger)
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 951);
    const hold = s.collect.hold(PC);
    expect(hold.state).toBe("INVALIDATED");
    expect((hold as any).reason).toMatch(/scene evidence changed/);
    // the boundary does not credit it: the stage is refused and the source and the Reserve stay as they were
    await rawAdvance(s, "tx-raw-end", T0.value + 3 * TAU);
    expect(s.collect.closed(PC, ACT_A)).toBe(false);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 180_000);
});

describe("F-2 — the exact cycle rests on an owner-qualified semantic attestation, effective before the act", () => {
  it("positive: the I-002 owner's attestation records the attestor, the claim and mechanism versions, the accepted meaning and the Temporal Hook; the commitment pins it", async () => {
    const s = await collectionCampaign();
    const att = s.collect.attestation(PC, MECH)!;
    expect(att.value).toMatchObject({
      attestor: { role: "role.gm", permission: "permission.rule.adjudicate" },
      meaning: "ONE_SAME_FORM_UNIT_HANDLED_BY_THE_NAMED_ACTUATOR_IN_ONE_SERIAL_CYCLE",
      temporal_hook: { version: 1, operation: "serial-handling-cycle", per_cycle: { value: TAU } },
      effective_from: T0,
    });
    expect(att.value.cycle_ground).toBe(cycleWords({ unit: T0.unit, value: TAU }));
    expect(att.fact.provenance.rule).toEqual(PC_COLLECTION_ATTESTATION_RULE);
    await confirmAndStart(s, ACT_A, 3);
    const commitment = s.collect.commitment(PC, ACT_A)!.value;
    expect(commitment.basis.cycle.attestation).toEqual({
      fact_key: pcCollectionAttestationKey(PC, MECH),
      version: att.fact.version,
    });
    // the work's causal duration is the attested hook's cycle times the amount
    expect(s.collect.work(PC, ACT_A)!.value.derivation.per_cycle).toEqual(
      att.value.temporal_hook.per_cycle,
    );
  }, 120_000);

  it("no attestation, no exact act: the commitment is refused before anything exists, and a quoted number is not an attestation", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    expect(s.collect.mechanism(PC, MECH)).toBeDefined(); // the lexical mechanism is only the typed carrier
    const before = s.campaign.store.head().state_sha256;
    const r = await confirmAndStart(s, ACT_A, 3);
    expect(JSON.stringify(r.committed)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.commitment(PC, ACT_A)).toBeUndefined();
    nothingWritten(s, before);
  }, 120_000);

  it("a reading that does not establish exactly one same-form unit in one serial cycle with verbatim grounds writes no attestation", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const before = s.campaign.store.head().state_sha256;
    const hostile: Record<string, Record<string, unknown>> = {
      "not one unit in one cycle": { reading: "NOT_ONE_UNIT_ONE_SERIAL_CYCLE" },
      undecided: { reading: "NOT_ESTABLISHED" },
      "a stated verdict": { verdict: "ATTESTED" },
      "a stated role": { role: "role.archivist" },
      "another task": { task_digest: "0".repeat(64) },
      "an actuator that is not the mechanism's": {
        actuator_ground: "the hands of this body gather loose material",
      },
      "a cycle ground without the numeral": { cycle_ground: "one handful every few " + T0.unit },
      "a cycle ground without the unit": { cycle_ground: `one handful every ${TAU} sunsets` },
      "an unquoted ground": { grounds: ["a thing the content never says"] },
      "a ground that is too short to quote": { grounds: ["hands"] },
    };
    for (const [name, over] of Object.entries(hostile)) {
      const r = await s.collect.attestCycle({
        pc_id: PC,
        mechanism_id: MECH,
        answer: cycleAnswer(task, over),
      });
      expect(r.ok, name).toBe(false);
      expect(s.campaign.store.head().state_sha256, name).toBe(before);
    }
    expect(s.collect.attestation(PC, MECH)).toBeUndefined();
  }, 120_000);

  it("Temporal keeps unit authority: a cycle authored in a unit that is not the canonical one cannot be attested, so no exact completion exists", async () => {
    const s = await collectionCampaign({ tau: { unit: "another-unit", value: 5 } });
    expect(s.collect.attestation(PC, MECH)).toBeUndefined();
    const r = await attestMechanism(s);
    expect(r.ok).toBe(false);
    expect(JSON.stringify((await confirmAndStart(s, ACT_A, 3)).started)).toBe(COLLECTION_REFUSAL);
    expect(extractionOf(s, ACT_A)).toBeUndefined();
  }, 120_000);

  it("raw forgeries of the owner's attestation fail: a wrong rule, a retroactive effective time, a rewritten hook, another mechanism's identity, a second attestation", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const mech = s.collect.mechanism(PC, MECH)!;
    const value = (over: Record<string, unknown> = {}) => ({
      attestation_id: `pc-collect-attestation:${PC}:${MECH}`,
      pc_id: PC,
      mechanism: { fact_key: mech.fact.key, version: mech.fact.version },
      contract: mech.value.authored_from.contract,
      claims: mech.value.authored_from.claims,
      attestor: { role: "role.gm", permission: "permission.rule.adjudicate" },
      meaning: "ONE_SAME_FORM_UNIT_HANDLED_BY_THE_NAMED_ACTUATOR_IN_ONE_SERIAL_CYCLE",
      actuator_ground: task.actuator,
      cycle_ground: cycleWords(task.cycle),
      grounds: [task.actuator],
      temporal_hook: {
        hook_id: `pc-collect-hook:${PC}:${MECH}`,
        version: 1,
        operation: "serial-handling-cycle",
        per_cycle: task.cycle,
      },
      effective_from: T0,
      task_digest: task.digest,
      committer: { owner: "pc_existence", facet: "pc_collection_mechanism" },
      ...over,
    });
    const commit = (n: string, v: unknown, rule: any = PC_COLLECTION_ATTESTATION_RULE) =>
      s.campaign.store.commit(
        forge(
          s,
          n,
          "pc_existence",
          "pc_collection_mechanism",
          rule,
          [{ key: pcCollectionAttestationKey(PC, MECH), value: v, expected_version: 0 }],
          [mech.fact.key, `pc/${PC}/existence-contract`, keys().clock],
        ),
      );
    const sha = s.campaign.store.head().state_sha256;
    expect(
      await refusedWith(
        commit("a-rule", value(), { ...PC_COLLECTION_ATTESTATION_RULE, clause: "x" }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(await refusedWith(commit("a-late", value({ effective_from: at(T0.value + 9) })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await refusedWith(
        commit(
          "a-hook",
          value({ temporal_hook: { ...value().temporal_hook, per_cycle: at(TAU + 1) } }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(await refusedWith(commit("a-meaning", value({ meaning: "SOMETHING_ELSE" })))).toBe(
      "VALUE_INVALID",
    );
    expect(await refusedWith(commit("a-pc", value({ pc_id: "someone-else" })))).toBe(
      "VALUE_INVALID",
    );
    expect(await refusedWith(commit("a-digest", value({ task_digest: "1".repeat(64) })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await refusedWith(
        commit("a-stale", value({ mechanism: { fact_key: mech.fact.key, version: 9 } })),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    // the lawful one is admitted once; nothing can amend it afterward (sealed), so it cannot be retrofitted after an act
    expect((await commit("a-ok", value())).ok).toBe(true);
    expect(await refusedWith(commit("a-dup", value()))).toBe("VERSION_CONFLICT");
    // a later reading cannot write a second attestation: the owner's record is sealed, so it can never be retrofitted after an act
    const again = await attestMechanism(s, { grounds: [] });
    expect(again.ok).toBe(false);
    expect(s.collect.attestation(PC, MECH)!.fact.version).toBe(1);
  }, 180_000);
});

describe("F-3 — individual occupancy proceeds only on Population's proof that the PC is outside its aggregate workforce", () => {
  it("positive (the independent outside-the-aggregate proof is a fixture stand-in): with that proof and no ledger counting the PC, Population determines OUTSIDE_AGGREGATE; the registration pins that determination and debits no workforce", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    const rep = s.collect.representation(PC)!;
    expect(rep.value.status).toBe("OUTSIDE_AGGREGATE");
    expect(rep.value.ledgers).toHaveLength(1);
    expect(s.collect.occupancy(PC)!.value.representation).toEqual({
      fact_key: popPcRepresentationKey(PC),
      version: rep.fact.version,
    });
    // distinct from §28 labor accounting: no layer tag, headcount, cohort, draw reference, flexible-labor debit or token is representable
    expect(Object.keys(rep.value).sort()).toEqual(
      ["committer", "determined_at", "ledgers", "locality", "pc_id", "status"].sort(),
    );
    const ledger = s.campaign.store.getFact("population/ledger-col/ledger")!;
    expect(ledger.version).toBe(1); // the aggregate ledger is untouched
  }, 120_000);

  it("BLUE H-2: a ledger that merely omits the PC proves nothing — without the independent owners' separate proof the determination is UNKNOWN and no occupancy can be registered", async () => {
    const s = await collectionCampaign({ outsideAggregate: false });
    expect(populationLedgerCount(s)).toBe(1); // present, disjoint from the PC's identity, and not a proof about the effective workforce
    expect((await determineRepresentation(s)).ok).toBe(true);
    expect(s.collect.representation(PC)!.value.status).toBe("UNKNOWN");
    const ctx = trustedCollection(s, ACT_A, 3);
    await commitConfirmedPcCollection(ctx, COMMIT_REQ);
    const r = await s.collect.registerOccupancy({
      ...colPublication(320),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
    });
    expect(r.ok).toBe(false);
    expect(s.collect.occupancy(PC)).toBeUndefined();
    const started = await confirmAndStart(s, "act-omitted", 1);
    expect(JSON.stringify(started.started)).toBe(COLLECTION_REFUSAL);
    expect(sourceRemaining(s)).toBe(5);
  }, 120_000);

  it("unknown WITHHOLDS: with no ledger at the locus Population proves nothing, the determination is UNKNOWN and no occupancy can be registered", async () => {
    const s = await collectionCampaign({ noLedger: true, outsideAggregate: false });
    expect((await determineRepresentation(s)).ok).toBe(true);
    expect(s.collect.representation(PC)!.value.status).toBe("UNKNOWN");
    const ctx = trustedCollection(s, ACT_A, 3);
    await commitConfirmedPcCollection(ctx, COMMIT_REQ);
    const r = await s.collect.registerOccupancy({
      ...colPublication(321),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
    });
    expect(r.ok).toBe(false);
    expect(s.collect.occupancy(PC)).toBeUndefined();
  }, 120_000);

  it("a forged OUTSIDE determination over a ledger that merely omits the PC is refused when no independent proof exists", async () => {
    const s = await collectionCampaign({ outsideAggregate: false });
    const sha = s.campaign.store.head().state_sha256;
    const forged = await s.campaign.store.commit(
      forge(
        s,
        "rep-omitted",
        "population",
        "population_pc_occupancy",
        POPULATION_PC_AGGREGATE_STATUS_RULE,
        [
          {
            key: popPcRepresentationKey(PC),
            value: {
              pc_id: PC,
              status: "OUTSIDE_AGGREGATE",
              locality: { world_id: FIXTURE_WORLD_ID, locus_id: FIXTURE_LOCUS_ID },
              ledgers: [{ fact_key: "population/ledger-col/ledger", version: 1 }],
              determined_at: T0,
              committer: { owner: "population", facet: "population_pc_occupancy" },
            },
            expected_version: 0,
          },
        ],
        [keys().clock],
      ),
    );
    expect(forged.ok).toBe(false);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.representation(PC)).toBeUndefined();
  }, 120_000);

  it("included WITHHOLDS pending a lawful reconciliation: a ledger that counts the PC is not a free worker, and nothing is assumed or blindly subtracted", async () => {
    const s = await collectionCampaign({ ledgerUnits: [resident(PC), resident("unit-other")] });
    const r = await confirmAndStart(s, ACT_A, 3);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.representation(PC)!.value.status).toBe("INCLUDED");
    expect(s.collect.occupancy(PC)).toBeUndefined();
    expect(extractionOf(s, ACT_A)).toBeUndefined();
    expect(sourceRemaining(s)).toBe(5);
  }, 120_000);

  it("the PC's binding, a caller's silence or a caller's statement is no evidence: a forged OUTSIDE determination over a ledger that counts the PC is refused", async () => {
    const s = await collectionCampaign({ ledgerUnits: [resident(PC)] });
    const sha = s.campaign.store.head().state_sha256;
    const forgedValue = {
      pc_id: PC,
      status: "OUTSIDE_AGGREGATE",
      locality: { world_id: FIXTURE_WORLD_ID, locus_id: FIXTURE_LOCUS_ID },
      ledgers: [{ fact_key: "population/ledger-col/ledger", version: 1 }],
      determined_at: T0,
      committer: { owner: "population", facet: "population_pc_occupancy" },
    };
    const forged = await s.campaign.store.commit(
      forge(
        s,
        "rep",
        "population",
        "population_pc_occupancy",
        (await import("@immortalis/engine")).POPULATION_PC_AGGREGATE_STATUS_RULE,
        [{ key: popPcRepresentationKey(PC), value: forgedValue, expected_version: 0 }],
        [keys().clock],
      ),
    );
    expect(forged.ok).toBe(false);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.representation(PC)).toBeUndefined();
    void CANON_WRITE_AUTHORITY;
  }, 120_000);

  it("re-evaluated through the interval: a ledger that comes to count the PC invalidates the act; and a duplicate or overlapping occupied interval is still refused", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    await addLedger(s, "ledger-census", [resident(PC)], 952);
    const hold = s.collect.hold(PC);
    expect(hold.state).toBe("INVALIDATED");
    // a second personal interval while the first is open: refused (one at a time), whatever Population says
    await determineRepresentation(s, 330);
    expect(JSON.stringify((await confirmAndStart(s, "act-b", 1)).started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.occupancyState(PC)).toEqual({ state: "OPEN", act_id: ACT_A });
  }, 180_000);
});

describe("F-5 — C8: the horizon-dependent refusal is a declared timing-disclosure channel, kept uniform and bare, and excluded from accepted play", () => {
  it("the declaration is carried by the engine and the document, and no gateway or operator output names a boundary, a next time or a cause", async () => {
    const { PC_COLLECTION_C8_DECLARATION } = await import("@immortalis/engine");
    expect(PC_COLLECTION_C8_DECLARATION).toMatch(
      /PROVISIONAL, NOT A COMPLETE OR KNOWLEDGE-NEUTRAL IN-FLIGHT ADVANCE ROUTE/,
    );
    expect(PC_COLLECTION_C8_DECLARATION).toMatch(/timing-disclosure channel/);
    expect(PC_COLLECTION_C8_DECLARATION).toMatch(/D-2/);
    const fs = await import("node:fs");
    const gateway = fs.readFileSync("packages/protocol/src/active-pc-target-advance.ts", "utf8");
    // the one refusal is a constant: no cause, owner, boundary or timestamp is ever attached to it
    expect(gateway).toMatch(/const refusal = \(\)/);
    expect(gateway).not.toMatch(/fail\(\s*PC_TARGET_ADVANCE_UNAVAILABLE,[^)]*details/);
  });

  it("two different horizons that both cross the same hidden boundary get byte-identical refusals, and neither names the boundary", async () => {
    const { GipAdapter } = await import("@immortalis/engine");
    const { INSTRUMENT_A, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, gipPublication } =
      await import("@immortalis/testkit");
    const { establishInstitution, establishOffice, establishScopeBinding } =
      await import("../support/gip.ts");
    const { sunsetInstrument } = await import("../support/gip-sunset.ts");
    const s = await collectionCampaign();
    const gip = new GipAdapter(s.campaign.store);
    await establishInstitution({ gip }, 1, INSTITUTION_COURT);
    await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await must(
      gip.establishSunsetInstrument({
        ...gipPublication(4),
        instrument: sunsetInstrument(INSTRUMENT_A, at(T0.value + 5)),
      }),
    );
    await confirmAndStart(s, ACT_A, 3);
    const a = JSON.stringify(await advanceTo(s, T0.value + 9, "tx-h1"));
    const b = JSON.stringify(await advanceTo(s, T0.value + 17, "tx-h2"));
    expect(a).toBe(b);
    for (const text of [a, b]) {
      expect(text).not.toMatch(/\b105\b|boundary|sunset|instrument|DEPENDENCY|CONTINUATION/i);
    }
    // a horizon short of the hidden boundary is not refused: the channel is exactly the one the declaration names
    expect(await advanceTo(s, T0.value + 4, "tx-h3")).toEqual(PC_TARGET_COMMITTED);
  }, 180_000);
});

describe("F-4 — the cessation fact is the third named PC-side cause fact; a lost premise is never auto-terminated, and it holds the campaign clock", () => {
  it("the cessation names the original act identity, the authority and the owner versions, and carries no result field", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    expect(await cease(s)).toEqual(COLLECTION_COMMITTED);
    const c = s.collect.cessation(PC, ACT_A)!.value;
    expect(c).toMatchObject({
      act_id: ACT_A,
      authored_under: PLAYER_CHOICE_AUTHORITY,
      requested_at: at(T0.value + 4),
    });
    expect(Object.keys(c).sort()).toEqual(
      [
        "act_id",
        "authored_under",
        "basis",
        "cessation_id",
        "committer",
        "intent",
        "pc_id",
        "requested_at",
      ].sort(),
    );
    expect(c.basis.pinned_versions.binding).toBeGreaterThan(0);
    expect(c.intent.target.work.version).toBeGreaterThan(0);
  }, 120_000);

  it("mid-work loss of a premise: the unresolved stage holds the CAMPAIGN clock (CONTINUATION_HELD), nothing terminates, releases or credits by itself, and a stop is refused while it is unresolved", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
    expect(s.collect.hold(PC).state).toBe("INVALIDATED");
    // time reaches the boundary by the kernel itself: the stage is refused and the dependent stays unresolved
    const stop = await rawAdvance(s, "tx-raw-end", T0.value + 3 * TAU);
    const unresolved =
      !stop.ok || (stop.value as any).transaction.outcome.unresolved_dependents.length > 0;
    expect(unresolved).toBe(true);
    const held = s.coordinator.state()!.value.continuation;
    expect(held?.unresolved_dependents.length ?? 0).toBeGreaterThan(0);
    // the clock of the WHOLE campaign is held: a fresh, non-continuing advance anywhere is refused
    const next = await rawAdvance(s, "tx-raw-later", T0.value + 4 * TAU);
    expect(next.ok).toBe(false);
    expect((next as any).error.code).toBe("CONTINUATION_HELD");
    // no automatic transition: the work stays admitted and unfinished, the occupancy stays OPEN, nothing was credited or released
    expect(s.collect.termination(PC, ACT_A)).toBeUndefined();
    expect(s.collect.cessation(PC, ACT_A)).toBeUndefined();
    expect(s.collect.occupancyState(PC)).toEqual({ state: "OPEN", act_id: ACT_A });
    expect(s.collect.closed(PC, ACT_A)).toBe(false);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    // and the voluntary stop cannot force its way across the unresolved boundary: it is refused, writing nothing
    const before = revision(s);
    expect(JSON.stringify(await cease(s))).toBe(COLLECTION_REFUSAL);
    expect(revision(s)).toBe(before);
    expect(s.collect.hold(PC).state).toBe("INVALIDATED");
  }, 180_000);

  it("before the boundary is reached, an INVALIDATED act can still be stopped by the player's separate choice — the only release, never an automatic one", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 954);
    expect(s.collect.hold(PC).state).toBe("INVALIDATED");
    expect(s.collect.termination(PC, ACT_A)).toBeUndefined(); // nothing happened by itself
    expect(await cease(s)).toEqual(COLLECTION_COMMITTED);
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "TERMINATED",
    });
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    void prepareToStart;
    void worldSourceConditionKey;
    void W;
    void SRC_SOURCE_KEY;
  }, 180_000);
});
