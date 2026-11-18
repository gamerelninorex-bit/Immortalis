import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  BoundaryIndexSchema,
  JournalEntrySchema,
  ProductionPcCollectionLapseSchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CampaignCore,
  CanonicalCampaign,
  GipAdapter,
  PcCollectionAdapter,
  TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE,
  admissionFactRevision,
  changedPremiseKeys,
  groupSha256,
  nodeFs,
  type AdmissionHistory,
  type CoreParams,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_LOCUS_ID,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  advanceToRequest,
  fixtureWorld,
  gipPublication,
  publication,
} from "@immortalis/testkit";
import { canonicalAdmission } from "../../packages/engine/src/owners/admission.ts";
import {
  CHECKPOINT_INTERVAL,
  CheckpointManifestSchema,
} from "../../packages/engine/src/persistence/checkpoint-package.ts";
import {
  ACT_A,
  PC,
  TAU,
  T0,
  accountOf,
  at,
  collectionCampaign,
  confirmAndStart,
  reserveAmount,
  sourceRemaining,
  type CollectionSeeded,
} from "../support/pc-collection.ts";
import { forge, keys } from "../support/pc-cessation.ts";
import {
  addLedger,
  advanceTo,
  lapseKey,
  lapsePub,
  rawLapseGroup,
  resident,
  resumeHeld,
  settle,
  stateOf,
} from "../support/pc-lapse.ts";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { sunsetInstrument } from "../support/gip-sunset.ts";
import { must } from "../support/temporal.ts";
import { copyDir, tempDir } from "../support/tmp.ts";

const target = T0.value + 4 * TAU;
const causeKey = "population/ledger-arrivals/ledger";
const options = { extension: ACTOR_FIXTURE_EXTENSION };
const settled = { ok: true, value: { status: "COLLECTION_COMMITTED" } };

async function held(extra?: (s: CollectionSeeded) => Promise<void>) {
  const dir = tempDir("immortalis-a26-");
  const s = await collectionCampaign({ dir });
  await confirmAndStart(s, ACT_A, 3);
  await advanceTo(s, T0.value + 4, "tx-pre");
  await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
  if (extra) {
    await extra(s);
    await must(s.coordinator.advance(advanceToRequest("tx-cross", at(target))));
  } else {
    await advanceTo(s, target, "tx-cross");
  }
  const clock = stateOf(s);
  const tx = clock.continuation!.from_transaction;
  expect(clock.canonical_time).toEqual(at(T0.value + 3 * TAU));
  const store = s.campaign.store;
  const receiptAt = (key: string) => store.lookupReceipt(store.getFact(key)!.provenance.intent_id)!;
  const cause = receiptAt(causeKey);
  const opening = receiptAt(temporalTransactionAuthorityKey(tx));
  const seal = receiptAt(temporalTransactionKey(tx));
  expect(cause.revision).toBeLessThan(opening.revision);
  expect(opening.revision).toBeLessThan(seal.revision);
  return { ...s, dir, tx, clock, cause, opening, seal };
}

const readJournal = (dir: string) => readFileSync(join(dir, "journal.jsonl"));
const world = (n: number) => ({
  ...publication(n),
  world: fixtureWorld({ world_id: `a26-world-${n}` }),
});

async function padCheckpoint(campaign: CanonicalCampaign) {
  const start = campaign.store.head().revision;
  const end = Math.ceil((start + 1) / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
  for (let revision = start; revision < end; revision++)
    await must(campaign.establishWorld(world(2000 + revision)));
}

describe("A26-CB1 live historical admission", () => {
  it("admits a raw owner lapse for a real pre-opening cause despite later changes, then replays only its exact intent", async () => {
    const s = await held();
    const store = s.campaign.store;
    await addLedger(s, "ledger-after", [resident("unit-after", "place-elsewhere")], 954);
    const raw = rawLapseGroup(s, "pre-opening");
    const work = s.collect.work(PC, ACT_A)!.value;
    expect(changedPremiseKeys(work, store.canonicalState!().facts)).toContain(causeKey);
    const lapse = ProductionPcCollectionLapseSchema.parse(raw.writes[0]!.value);
    const beforeLapse = store.head();
    for (const value of [
      { ...lapse, pc_id: "pc-other" },
      { ...lapse, act_id: "act-other" },
      {
        ...lapse,
        pins: { ...lapse.pins, held_transaction: { ...lapse.pins.held_transaction, version: 2 } },
      },
    ]) {
      expect(
        await store.commit({ ...raw, writes: [{ ...raw.writes[0]!, value }, raw.writes[1]!] }),
      ).toMatchObject({ ok: false });
      expect(store.head()).toEqual(beforeLapse);
    }
    expect(accountOf(s)?.open).toHaveLength(1);
    const result = await must(store.commit(raw));
    expect(result.replayed).toBe(false);
    expect(result.receipt.basis.rule).toEqual(raw.rule);
    expect(store.getFact(lapseKey())?.value).toMatchObject({
      reason: "NOT_ESTABLISHED",
      derivation: {
        units_credited: 0,
        source_effect: "NONE",
        reserve_effect: "NONE",
        claim: "RELEASED",
      },
    });
    expect(accountOf(s)?.open).toEqual([]);
    expect(await settle(s)).toEqual(settled);
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "LAPSED",
    });
    expect([sourceRemaining(s), reserveAmount(s)]).toEqual([5, 0]);
    expect(stateOf(s)).toEqual(s.clock);
    expect((await resumeHeld(s, s.tx, at(target), "tx-resume")).ok).toBe(true);
    const before = store.head();
    expect(await must(store.commit(raw))).toEqual({ ...result, replayed: true });
    expect(await store.commit({ ...raw, cause: "changed" })).toMatchObject({
      ok: false,
      error: { code: "INTENT_CONFLICT" },
    });
    expect(store.head()).toEqual(before);
    const journal = readJournal(s.dir);
    await s.campaign.close();
    const reopened = await must(CanonicalCampaign.open(s.dir, { ...options, audit: true }));
    expect(reopened.store.head()).toEqual(before);
    expect(reopened.store.committedGroup(raw.intent_id)).toEqual(raw);
    expect(reopened.store.lookupReceipt(raw.intent_id)).toEqual(result.receipt);
    expect(readJournal(s.dir)).toEqual(journal);
    await reopened.close();
  });

  it("binds evidence to the live state, original group, receipt and fact version", async () => {
    const s = await held();
    const store = s.campaign.store;
    const state = store.canonicalState!();
    const raw = rawLapseGroup(s, "evidence");
    const original = (id: string) => {
      const group = store.committedGroup(id);
      const receipt = store.lookupReceipt(id);
      return group && receipt && receipt.revision <= state.revision ? { group, receipt } : null;
    };
    const originalCause = original(s.cause.intent_id)!;
    const originalOpening = original(s.opening.intent_id)!;
    const history: NonNullable<CoreParams["history"]> = {
      byIntent: original,
      byGroup(id) {
        const group = store.committedGroupById!(id);
        return group && original(group.intent_id);
      },
      ruleChecked: () => false,
      checkedIds() {
        throw new Error("unexpected history enumeration");
      },
    };
    const params = {
      owners: CANONICAL_OWNER_REGISTRY,
      campaignId: state.campaign_id,
      specLockSha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
      headSha256: store.head().journal_head_sha256,
      state,
      history,
    };
    expect(canonicalAdmission.check(raw, state)).toMatchObject({ code: "REFERENCE_INVALID" });
    const forged = { revisionOf: () => 1 } as unknown as AdmissionHistory;
    expect(canonicalAdmission.check(raw, state, forged)).toMatchObject({
      code: "REFERENCE_INVALID",
    });
    expect(await store.commit({ ...raw, history: forged })).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_INVALID" },
    });
    expect(await store.commit({ ...raw, campaign_id: "foreign" })).toMatchObject({
      ok: false,
      error: { code: "CAMPAIGN_MISMATCH" },
    });

    const changedGroup = (changes: Partial<CommitGroup>) => {
      const group = { ...originalCause.group, ...changes };
      return { group, receipt: { ...originalCause.receipt, group_sha256: groupSha256(group) } };
    };
    const cases = [
      ["missing cause", s.cause.intent_id, null],
      [
        "unknown revision",
        s.cause.intent_id,
        { ...originalCause, receipt: { ...originalCause.receipt, revision: 0 } },
      ],
      [
        "foreign receipt",
        s.cause.intent_id,
        { ...originalCause, receipt: { ...originalCause.receipt, campaign_id: "foreign" } },
      ],
      [
        "stale version",
        s.cause.intent_id,
        changedGroup({
          writes: originalCause.group.writes.map((write) =>
            write.key === causeKey
              ? { ...write, expected_version: write.expected_version + 1 }
              : write,
          ),
        }),
      ],
      ["mismatched held receipt", s.seal.intent_id, originalOpening],
      ["wrong opening", s.opening.intent_id, originalCause],
      ["missing opening", s.opening.intent_id, null],
    ] as const;
    for (const [index, [name, intent, evidence]] of cases.entries()) {
      const core = new CampaignCore({
        ...params,
        admission: canonicalAdmission,
        history: { ...history, byIntent: (id) => (id === intent ? evidence : original(id)) },
      });
      expect(core.prepare(raw), name).toMatchObject({
        ok: false,
        error: { code: "REFERENCE_INVALID" },
      });
      expect(core.state, name).toBe(state);
      expect(core.headSha256, name).toEqual(params.headSha256);
      const ordinary = await must(s.campaign.establishWorld(world(3000 + index)));
      expect(core.prepare(store.committedGroup(ordinary.receipt.intent_id)!), name).toMatchObject({
        ok: true,
      });
    }

    let oldHistory: AdmissionHistory | undefined;
    const core = new CampaignCore({
      ...params,
      admission: {
        check(group, preState, history) {
          oldHistory ??= history;
          return canonicalAdmission.check(group, preState, oldHistory);
        },
      },
    });
    expect(core.prepare(raw).ok).toBe(true);
    expect(admissionFactRevision(oldHistory, state, causeKey)).toBe(s.cause.revision);
    const ordinary = await must(s.campaign.establishWorld(world(3100)));
    const next = core.prepare(store.committedGroup(ordinary.receipt.intent_id)!);
    if (!next.ok || next.value.kind !== "apply") throw new Error("expected a fresh ordinary write");
    core.accept(next.value);
    expect(admissionFactRevision(oldHistory, state, causeKey)).toBeUndefined();
    expect(core.prepare(raw)).toMatchObject({ ok: false, error: { code: "REFERENCE_INVALID" } });
    await s.campaign.close();
  });

  it("uses addressed cold history for the entire commit and refuses corrupted cause bytes before publication", async () => {
    const s = await held();
    await padCheckpoint(s.campaign);
    const raw = rawLapseGroup(s, "cold");
    const dir = s.dir;
    const before = s.campaign.store.head();
    const manifest = CheckpointManifestSchema.parse(
      JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
    );
    expect(manifest.head.checkpoint.revision).toBe(before.revision);
    await s.campaign.close();

    const recorded: { group: string; bytes: number }[] = [];
    let trace = false;
    let ranges = 0;
    let indexedBytes = 0;
    const fs = {
      ...nodeFs,
      async readFile(path: string) {
        if (trace) expect(path.endsWith("journal.jsonl")).toBe(false);
        return nodeFs.readFile(path);
      },
      readRangeSync(path: string, offset: number, length: number) {
        const bytes = nodeFs.readRangeSync(path, offset, length);
        if (trace) {
          ranges++;
          indexedBytes += length;
          if (path.endsWith("journal.jsonl")) {
            const entry = JournalEntrySchema.parse(JSON.parse(bytes.toString("utf8")));
            recorded.push({ group: entry.group.group_id, bytes: length });
          }
        }
        return bytes;
      },
    };
    const corruptDir = copyDir(dir);
    const tampered = await must(CanonicalCampaign.open(corruptDir, options));
    const head = tampered.store.head();
    const journal = readJournal(corruptDir).toString("utf8");
    const originalCause = journal.split("\n")[s.cause.revision - 1]!;
    const changed = originalCause.replace('"unit-arrival"', '"unit-corrupt"');
    expect(changed).not.toBe(originalCause);
    writeFileSync(join(corruptDir, "journal.jsonl"), journal.replace(originalCause, changed));
    const poisonBytes = readJournal(corruptDir);
    expect(await tampered.store.commit(raw)).toMatchObject({
      ok: false,
      error: { code: "STORE_POISONED" },
    });
    expect(tampered.store.head()).toEqual(head);
    expect(readJournal(corruptDir)).toEqual(poisonBytes);
    await tampered.close();

    const cold = await must(CanonicalCampaign.open(dir, { ...options, fs }));
    trace = true;
    await must(cold.establishWorld(world(3200)));
    expect(recorded).toEqual([]);
    recorded.length = 0;
    ranges = 0;
    indexedBytes = 0;
    const result = await must(cold.store.commit(raw));
    trace = false;
    expect(recorded.map((read) => read.group).sort()).toEqual(
      [...raw.depends_on, s.opening.group_id, s.seal.group_id, s.cause.group_id].sort(),
    );
    expect(ranges).toBeLessThan(160);
    expect(indexedBytes).toBeLessThan(manifest.head.journal_bytes);
    console.info("A26 exact cold commit work", {
      checkpointRevision: before.revision,
      journalRanges: recorded.length,
      journalBytes: recorded.reduce((sum, read) => sum + read.bytes, 0),
      indexRanges: ranges - recorded.length,
      indexBytes: indexedBytes - recorded.reduce((sum, read) => sum + read.bytes, 0),
      fullJournalBytes: manifest.head.journal_bytes,
    });
    expect(await settle({ campaign: cold })).toEqual(settled);
    expect(stateOf({ campaign: cold })).toEqual(s.clock);
    await cold.close();
    const reopened = await must(CanonicalCampaign.open(dir, options));
    expect(reopened.store.lookupReceipt(raw.intent_id)).toEqual(result.receipt);
    expect([
      sourceRemaining({ campaign: reopened }),
      reserveAmount({ campaign: reopened }),
    ]).toEqual([5, 0]);
    await reopened.close();
  }, 120_000);

  it("reconciles each interrupted owner publication by original identity", async () => {
    const s = await held();
    const before = s.campaign.store.head().revision;
    await s.campaign.close();
    for (const [step, phase] of [
      [1, "after"],
      [2, "after"],
      [3, "before"],
      [3, "after"],
    ] as const) {
      const dir = copyDir(s.dir);
      let hit = false;
      const fs = {
        ...nodeFs,
        async writeFileDurable(path: string, data: string | Buffer) {
          const cut =
            path.endsWith("manifest.json") &&
            JSON.parse(data.toString()).head.revision === before + step;
          if (cut) hit = true;
          if (cut && phase === "before") throw new Error("interrupted before head publication");
          await nodeFs.writeFileDurable(path, data);
          if (cut) throw new Error("interrupted after head publication");
        },
      };
      const cut = await must(CanonicalCampaign.open(dir, { ...options, fs }));
      expect(await settle({ campaign: cut })).toMatchObject({
        ok: false,
        error: { code: "COLLECTION_OUTCOME_UNKNOWN" },
      });
      expect(hit).toBe(true);
      await cut.close();
      const recovered = await must(CanonicalCampaign.open(dir, options));
      const store = recovered.store;
      expect(store.head().revision).toBe(before + (phase === "before" ? step - 1 : step));
      expect(await settle({ campaign: recovered })).toEqual(settled);
      const head = store.head();
      expect(head.revision).toBe(before + 3);
      expect(stateOf({ campaign: recovered })).toEqual(s.clock);
      expect([
        sourceRemaining({ campaign: recovered }),
        reserveAmount({ campaign: recovered }),
      ]).toEqual([5, 0]);
      expect(accountOf({ campaign: recovered })?.open).toEqual([]);
      expect(new PcCollectionAdapter(store).occupancyState(PC)).toEqual({
        state: "RELEASED",
        act_id: ACT_A,
        why: "LAPSED",
      });
      const entries = readJournal(dir)
        .toString("utf8")
        .trimEnd()
        .split("\n")
        .slice(before)
        .map((line) => JournalEntrySchema.parse(JSON.parse(line)));
      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(await must(store.commit(entry.group))).toEqual({
          receipt: entry.receipt,
          replayed: true,
        });
        expect(store.lookupReceipt(entry.group.intent_id)).toEqual(entry.receipt);
      }
      expect(await settle({ campaign: recovered })).toEqual(settled);
      expect(store.head()).toEqual(head);
      await recovered.close();
    }
  }, 120_000);

  it("replays the adapter's original intent after settlement without accepting changed content", async () => {
    const s = await held();
    const request = { ...lapsePub("a26-retry"), pc_id: PC, act_id: ACT_A };
    const result = await must(s.collect.lapse(request));
    expect(await settle(s)).toEqual(settled);
    expect((await resumeHeld(s, s.tx, at(target), "tx-resume")).ok).toBe(true);
    const head = s.campaign.store.head();
    expect(await must(s.collect.lapse(request))).toEqual({ ...result, replayed: true });
    expect(await s.collect.lapse({ ...request, cause: "changed" })).toMatchObject({
      ok: false,
      error: { code: "INTENT_CONFLICT" },
    });
    expect(s.campaign.store.head()).toEqual(head);
    await s.campaign.close();
  });

  it("keeps an independent unresolved dependent at the same boundary", async () => {
    const s = await held(async ({ campaign }) => {
      const gip = new GipAdapter(campaign.store);
      await establishInstitution({ gip }, 1, INSTITUTION_COURT);
      await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
      await establishScopeBinding(
        { gip },
        3,
        INSTITUTION_COURT,
        OFFICE_MAGISTRATE,
        SCOPE_BINDING_A,
      );
      await must(
        gip.establishSunsetInstrument({
          ...gipPublication(4),
          instrument: sunsetInstrument(INSTRUMENT_A, at(T0.value + 3 * TAU)),
        }),
      );
    });
    const dependents = s.clock.continuation!.unresolved_dependents;
    expect(dependents.some((entry) => entry.stage.owner_operation.owner === "gip")).toBe(true);
    expect(await settle(s)).toEqual(settled);
    expect(stateOf(s)).toEqual(s.clock);
    await must(
      s.coordinator.advance(advanceToRequest("tx-resume", at(target), { continues: s.tx })),
    );
    const after = stateOf(s);
    expect(after.canonical_time).toEqual(s.clock.canonical_time);
    expect(after.continuation?.unresolved_dependents).toEqual(
      expect.arrayContaining(
        dependents.filter((entry) => entry.stage.owner_operation.owner === "gip"),
      ),
    );
    await s.campaign.close();
  });

  it("independently refuses both raw owner groups against a condition-bearing held lineage", async () => {
    const s = await held();
    const store = s.campaign.store;
    const objectFact = store.getFact(keys().object)!;
    const object = TemporalObjectSchema.parse(objectFact.value);
    const stateWithCondition = () => {
      const state = store.canonicalState!();
      const facts = new Map(state.facts);
      const key = temporalTransactionKey(s.tx);
      const original = facts.get(key)!;
      const tx = ResolutionTransactionSchema.parse(original.value);
      facts.set(key, {
        ...original,
        value: {
          ...tx,
          requested: {
            ...tx.requested,
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: object.object_id,
              boundary_id: object.next_boundary!.boundary_id,
            },
          },
        },
      });
      const preState = { ...state, facts };
      const checked = store.ruleCheckedGroupIds!();
      canonicalAdmission.initializeView!(preState, (id) => checked.has(id));
      return preState;
    };
    const raw = rawLapseGroup(s, "condition");
    expect(canonicalAdmission.check(raw, stateWithCondition())).toMatchObject({
      code: "REFERENCE_INVALID",
      message: expect.stringContaining("condition-free"),
    });
    await must(store.commit(raw));
    const k = keys();
    const indexFact = store.getFact(k.index)!;
    const index = BoundaryIndexSchema.parse(indexFact.value);
    const retirement = forge(
      s,
      "condition-retirement",
      "temporal_kernel",
      "temporal_coordination",
      TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE,
      [
        {
          key: k.object,
          value: { ...object, next_boundary: null },
          expected_version: objectFact.version,
        },
        {
          key: k.index,
          value: { entries: index.entries.filter((entry) => entry.object_id !== object.object_id) },
          expected_version: indexFact.version,
        },
      ],
      [lapseKey(), k.object, k.index],
    );
    expect(canonicalAdmission.check(retirement, stateWithCondition())).toMatchObject({
      code: "CLAIM_INCOMPATIBLE",
      details: { reason: "HELD_LINEAGE_NOT_ACCEPTABLE" },
    });
    await s.campaign.close();
  });
});
