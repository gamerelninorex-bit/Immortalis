/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw scripted-host documents */
// TEST SUPPORT for the CPAA-C1 v0.2 PROVISIONAL outcome → perception connection, over an ORIGINAL active PC. The campaign is built by
// the SHIPPED paths only (`establish-locality` commits the world, locus and the finite source; `author-character` releases and binds
// the character; `establish-character-locus` has World-State commit the qualified custody; the Temporal owner establishes the basis),
// and the collection then runs through the unchanged owner paths. The scripted referee host is a policy the TEST wrote that reads the
// DELIVERED words (PLUMBING ONLY: it proves nothing about whether an AI understood any sentence).
import { worldSourceConditionKey } from "@immortalis/contracts";
import {
  PLAYER_CHOICE_AUTHORITY,
  type CanonicalTime,
  type PcCollectionCommitInput,
} from "@immortalis/contracts";
import {
  PcCollectionAdapter,
  PopulationAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  SourceDrawdownAdapter,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedConfirmedPcCollectionContext,
  commitConfirmedPcCollection,
  getPcCollectionReachTask,
  startConfirmedPcCollection,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import { REFEREE_AUTHORITY } from "@immortalis/contracts";
import { drawdownPublication, popPublication, prodPublication } from "@immortalis/testkit";
import { ACCESS, LOCUS_ID, SOURCE_KEY, SOURCE_UNIT, WORLD_ID, openOrdinary } from "./locality.ts";
import {
  BASIS,
  PC_ID,
  PC_WORDS,
  observationAnswer,
  observationCampaign,
  type ObsRule,
} from "./observation.ts";
import {
  ACTUATOR_WORDS,
  COMMIT_REQ,
  START_REQ,
  TASK_REQ,
  TRAVERSAL_CANNOT,
  cycleAnswer,
  cycleWords,
  hostAnswer,
  reachReq,
} from "./pc-collection.ts";
import { pcTargetTransaction } from "./pc-target-advance.ts";
import { must } from "./temporal.ts";
import type { LocalityDirs } from "./locality.ts";

export const SALT = {
  material: "raw-salt",
  reserve: "reserve-salt",
  basis: "basis-salt",
  mechanism: "mech-hands-salt",
};
export const SALT_TAU = 7;
export const TAU_UNIT: CanonicalTime = { unit: BASIS.unit, value: SALT_TAU };

/**
 * An ORIGINAL character (authored, bound and located through the shipped commands) whose accepted embodiment claim also states the
 * hands' work and exact cycle, with the established Production Reserve (empty), Production's Capability / Access basis for the
 * locality's finite source, and the PC's mechanism quoting that claim. Nothing is collected and nothing is observed yet.
 */
export async function originalCollectionCampaign(
  o: { scene?: NonNullable<Parameters<typeof observationCampaign>[0]>["scene"] } = {},
): Promise<{ dirs: LocalityDirs }> {
  const embodiment = `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${cycleWords(TAU_UNIT)}; ${TRAVERSAL_CANNOT}`;
  const { dirs } = await observationCampaign({
    ...(o.scene ? { scene: o.scene } : {}),
    words: { embodiment },
  });
  const campaign = await openOrdinary(dirs.campaignDir);
  try {
    await must(
      new ProductionAdapter(campaign.store).establishReserve({
        ...prodPublication(1),
        reserve: {
          reserve_id: SALT.reserve,
          material_class: "raw-salt",
          quantity: { amount: 0, unit: SOURCE_UNIT },
          condition: "dry",
          world_id: WORLD_ID,
          locus_id: LOCUS_ID,
        },
      }),
    );
    await must(
      new SourceDrawdownAdapter(campaign.store).establishBasis({
        ...drawdownPublication(1),
        extraction_basis: {
          basis_id: SALT.basis,
          world_id: WORLD_ID,
          source_key: SOURCE_KEY,
          material_class: "raw-salt",
          unit: SOURCE_UNIT,
          relies_on: { ...ACCESS },
        },
      }),
    );
    await must(
      new PcCollectionAdapter(campaign.store).establishMechanism({
        group_id: "col-group-mech",
        intent_id: "col-intent-mech",
        cause: "col-cause-mech",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        mechanism: {
          pc_id: PC_ID,
          mechanism_id: SALT.mechanism,
          claims: [{ section: "embodiment_topology", index: 0 }],
          actuator: { statement: ACTUATOR_WORDS },
          traversal: { statement: TRAVERSAL_CANNOT },
          cycle_duration: TAU_UNIT,
          cycle_quote: cycleWords(TAU_UNIT),
        },
      }),
    );
    // v0.3 F-2: the I-002 compiler/adjudicator's reading of the delivered cycle task, validated and written by the archivist path
    const pcAdapter = new PcCollectionAdapter(campaign.store);
    const cycleTask = pcAdapter.cycleTask(PC_ID, SALT.mechanism);
    if (!cycleTask) throw new Error("no cycle task");
    await must(
      pcAdapter.attestCycle({
        pc_id: PC_ID,
        mechanism_id: SALT.mechanism,
        answer: cycleAnswer(cycleTask),
      }),
    );
    // v0.3 F-1 / F-3: Population's own ledger attaches to the locus (one resident who is not the character), the owners' presence evidence
    await must(
      new PopulationAdapter(campaign.store).establishLedger({
        ...popPublication(1),
        ledger: {
          ledger_id: "ledger-salt",
          unit_class: "synthetic-unit-class",
          world_id: WORLD_ID,
          locus_id: LOCUS_ID,
          units: [
            {
              unit_id: "unit-salt-resident",
              residence: "place-village",
              presence: "place-village",
              burden_allocation: null,
            },
          ],
          point: BASIS,
        },
      }),
    );
    // the setting author's declaration (BLUE HOLD H-1/H-2): the locus is a closed domain, the salt is unencumbered in it, and Population's
    // workforce scope is the ledger it holds. Coverage and accounting are DERIVED by the owners, never supplied.
    await must(
      new PcCollectionAdapter(campaign.store).establishSceneClosure({
        group_id: "col-group-closure",
        intent_id: "col-intent-closure",
        cause: "col-cause-closure",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        domain: {
          designation: "SYNTHETIC FIXTURE: a closed salt flat",
          topology: "SYNTHETIC FIXTURE: one salt pan ringed by cliffs; no passage in or out",
        },
        closure: {
          statement:
            "SYNTHETIC FIXTURE: nothing else acts on this flat beyond what the owners cover.",
        },
        source_rights: [
          {
            source_fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
            ground:
              "SYNTHETIC FIXTURE: the loose salt here is held by no one; no claim on it is established.",
          },
        ],
      }),
    );
    await must(
      new PcCollectionAdapter(campaign.store).establishWorkforceScope({
        group_id: "col-group-scope",
        intent_id: "col-intent-scope",
        cause: "col-cause-scope",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        scope: {
          statement:
            "SYNTHETIC FIXTURE: the ledger held is all that accounts workforce for this flat.",
        },
      }),
    );
  } finally {
    await campaign.close();
  }
  return { dirs };
}

/** One confirmed collection attempt of `amount` and the player's separate time passage to its earned boundary, through the unchanged gateways. */
export async function collectAndComplete(
  campaign: CanonicalCampaign,
  act: string,
  amount: number,
  transaction: string,
  boundary: CanonicalTime,
): Promise<void> {
  const choice: PcCollectionCommitInput = {
    pc_id: PC_ID,
    act_id: act,
    source: { world_id: WORLD_ID, source_key: SOURCE_KEY },
    reserve_id: SALT.reserve,
    quantity: { amount, unit: SOURCE_UNIT },
    authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  };
  const ctx = bindTrustedConfirmedPcCollectionContext({
    campaign,
    choice,
    mechanism_id: SALT.mechanism,
    basis_id: SALT.basis,
    publication: { cause: `cause-${act}`, basis: "fixture-basis", secrecy: "fixture-visibility" },
  });
  const expectOk = (r: { ok: boolean }, what: string) => {
    if (!r.ok) throw new Error(`${what} was refused`);
  };
  expectOk(await commitConfirmedPcCollection(ctx, COMMIT_REQ), "the commitment");
  const task = getPcCollectionReachTask(ctx, TASK_REQ);
  if (!task.ok) throw new Error("no reach task");
  expectOk(
    await submitPcCollectionReach(
      ctx,
      reachReq(hostAnswer(task.value.task, "OPEN", "NOT_AT_ISSUE")),
    ),
    "the reading",
  );
  expectOk(await startConfirmedPcCollection(ctx, START_REQ), "the start");
  expectOk(
    await advanceActivePcToTarget(
      bindTrustedActivePcTargetAdvanceContext({
        campaign,
        pc_id: PC_ID,
        target: boundary,
        transaction: pcTargetTransaction(transaction) as never,
      }),
      { operation: "advance_active_pc_to_target" },
    ),
    "the time passage",
  );
}

const quoteOf = (text: string, re: RegExp): string => re.exec(text)![0];

/**
 * The scripted host's direct-perception answer for a question that DELIVERS the character's completed gathering: the ordinary scripted
 * reading of faculty, position, path and the scene, with the gathering fact assessed and — when the whole question is affirmatively
 * answered — the appearance taken from it (`of: "outcome"`) or from the scene (`of: "scene"`). A policy the test wrote, not a verdict.
 */
export function outcomeAnswer(
  doc: Record<string, any>,
  rule: ObsRule & { of?: "outcome" | "scene" } = {},
): any {
  const base: any = observationAnswer(doc, rule);
  const outcome = doc["context"].facts.find((f: any) => f.fact_id === "outcome.collection");
  if (!outcome) return base;
  const quote = quoteOf(outcome.text, /gathering of \d+ \S+ of \S+/);
  base.assessments = base.assessments.map((a: any) =>
    a.fact_id === outcome.fact_id
      ? {
          ...a,
          relation: "SUPPORTS",
          evidence_quote: quote,
          grounds: "scripted host: reading of the fact",
        }
      : a,
  );
  if (rule.of === "outcome" && base.payload !== null)
    base.payload = {
      source_fact_id: outcome.fact_id,
      referent: "the material the character just worked",
      content: "a small heap of loose, pale grains lying gathered together",
      basis: [{ from: "WORLD_FACT", ref: outcome.fact_id, evidence_quote: quote }],
    };
  return base;
}

/** Retains a direct-perception decision through the engine's own adapter with the scripted answer for the delivered question. */
export async function decideOutcome(
  campaign: CanonicalCampaign,
  rule: ObsRule & { of?: "outcome" | "scene" } = {},
  attempt = 0,
  answerOver: (answer: any) => any = (a) => a,
) {
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const task = adapter.observationTask({ pc_id: PC_ID, attempt });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const answer = answerOver(
    outcomeAnswer({ task_id: task.value.task_id, context: task.value.context }, rule),
  );
  const recorded = await adapter.recordObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: PC_ID,
    attempt,
    answer,
  });
  return { recorded, adapter, context: task.value.context };
}
