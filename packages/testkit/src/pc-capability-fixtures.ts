import {
  pcExistenceContractKey,
  pcCapabilityKey,
  type DependencyDeclaration,
  type ExistenceContract,
  type PcCapabilityBasis,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  pcCapabilityCloseProvider,
  pcCapabilityCloseRead,
  pcCapabilityDeclaration,
  type StageProvider,
} from "@immortalis/engine";
import {
  ACTOR_BOUNDARY_T,
  SYNTH_CAPABILITY_CONSUMER_OWNER,
  consumerBoundaryId,
  consumerObjectId,
  consumerResultKey,
  consumerStage,
} from "./actor-fixtures.ts";
import { FIXTURE_PC_ID, fixtureContract } from "./canonical-fixtures.ts";
import { SYNTH_RULE, T0 } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the I-002 PC Capability Profile / PC Capability Close Receiving Foundation. Every identifier,
 * claim wording, coordinate and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no
 * calibration — in particular no skill value, level, percentage, roll or prior exists here. The PC owner and its
 * capability profile facet are NOT synthetic and live in @immortalis/engine; what is synthetic are the OTHER parties of the
 * proof:
 *
 *  - a released Existence Contract whose accepted claims stand in for the generation compiler (I-002 §11, not
 *    implemented), so there is an already-accepted history a capability can be established from;
 *  - a test CONSUMER, a dependent consequence that materially requires the PC's mastery and reads it AS-OF-DECLARED-CLOSE.
 *    It is no canonical gameplay subsystem and never owns the capability. It is registered through the existing extension
 *    seam (shared with the Named-Actor fixtures), which cannot write a PC capability key space.
 *
 * Production code must never import this package (Bootstrap Plan §2.2).
 */
export const PC_CAP_CONTRACT_PC = FIXTURE_PC_ID;
export const PC_CAP_OTHER_PC = "pc-fixture-other";
export const CAP_SAILING = "capability-sailing";
export const CAP_LOCKSMITHING = "capability-locksmithing";
export const CAP_NAVIGATION = "capability-navigation";
export const SYNTH_OP_CONSUME_PC_CLOSE = "synthetic-pc-capability-consume-close";
export const SYNTH_OP_CONSUME_PC_NOW = "synthetic-pc-capability-consume-now";
const CONSUMER_FACET = "synthetic-capability-consumer";

/**
 * A released Existence Contract with accepted claims in every claim-bearing place a capability may be located at, plus a
 * hypothesis and an unresolved item (which are NOT claims and can never be located).
 */
export const pcCapabilityContract = (
  pcId: string = PC_CAP_CONTRACT_PC,
  over: Partial<ExistenceContract> = {},
): ExistenceContract =>
  fixtureContract({
    pc_id: pcId,
    baseline_exception: {
      safely_inherited: [
        {
          statement: "SYNTHETIC FIXTURE: an inherited baseline claim.",
          provenance: "SAFELY-INHERITED",
        },
      ],
      player_overrides: [
        {
          statement: "SYNTHETIC FIXTURE: an accepted past of seafaring.",
          provenance: "PLAYER-AUTHORED",
        },
        {
          statement: "SYNTHETIC FIXTURE: an accepted past of lock work.",
          provenance: "PLAYER-AUTHORED",
        },
      ],
      hypotheses: ["SYNTHETIC FIXTURE: a hypothesis that was never accepted."],
      unresolved: ["SYNTHETIC FIXTURE: an unresolved branch."],
    },
    entry_envelope: {
      items: [{ statement: "SYNTHETIC FIXTURE: an entry item.", provenance: "PLAYER-AUTHORED" }],
    },
    ...over,
  });

/**
 * An already-established capability received by the PC owner: pinned to the PC's own released Existence Contract (version 1,
 * the version of a freshly committed sealed fact) and to the accepted claim that establishes it.
 */
export const pcCapabilityBasis = (
  pcId: string = PC_CAP_CONTRACT_PC,
  capabilityId: string = CAP_SAILING,
  over: Partial<PcCapabilityBasis> = {},
): PcCapabilityBasis => ({
  pc_id: pcId,
  capability_id: capabilityId,
  marker: "C",
  establishment: {
    method: "ACCEPTED_GENERATION_HISTORY",
    contract: { fact_key: pcExistenceContractKey(pcId), version: 1 },
    claims: [{ section: "baseline_exception.player_overrides", index: 0 }],
  },
  ...over,
});

export const pcCapabilityPublication = (n: number) => ({
  group_id: `pccap-group-${n}`,
  intent_id: `pccap-intent-${n}`,
  cause: `pccap-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

// -- the consumer: a dependent consequence that materially requires the PC's mastery --------------------------------

/** The consumer reads the PC owner's capability close, AS-OF-DECLARED-CLOSE (the only lawful cross-owner read). */
export const pcCloseConsumerDeclaration = (
  consumerId: string,
  pcId: string,
  capabilityId: string,
): DependencyDeclaration => ({
  stage: consumerStage(consumerId, SYNTH_OP_CONSUME_PC_CLOSE),
  reads: [pcCapabilityCloseRead(pcId, capabilityId)],
  produces: [consumerResultKey(consumerId)],
  declares_close: null,
});

/** The forbidden shape: a consumer that reads the capability AS-OF-NOW (a later effective time cannot bypass the close). */
export const pcNowConsumerDeclaration = (
  consumerId: string,
  pcId: string,
  capabilityId: string,
): DependencyDeclaration => ({
  stage: consumerStage(consumerId, SYNTH_OP_CONSUME_PC_NOW),
  reads: [
    {
      mode: "AS-OF-NOW",
      source: { owner: "pc_existence", fact_key: pcCapabilityKey(pcId, capabilityId) },
      invalidators: [],
    },
  ],
  produces: [consumerResultKey(consumerId)],
  declares_close: null,
});

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "pc-capability-fixture-basis",
  secrecy: "pc-capability-fixture-secrecy",
});

/** Records what the consumer observed of the capability: the marker, and the group that committed the close it read. */
export const pcCloseConsumerProvider: StageProvider = {
  owner: SYNTH_CAPABILITY_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_PC_CLOSE,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    const value = fact.value as { marker: unknown; pc_id: string; capability_id: string };
    return produces.map((key) =>
      out(key, {
        observed_pc: value.pc_id,
        observed_capability: value.capability_id,
        observed_marker: value.marker,
        observed_close_group: fact.provenance.group_id,
      }),
    );
  },
};

export const pcCapabilityProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([pcCapabilityCloseProvider, pcCloseConsumerProvider]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

/**
 * The engaged object of one dependent consequence: ONE earned boundary (a test coordinate), the PC owner's capability-close
 * stage declared ahead of it (the consequence materially requires the mastery), and the consumer stage that reads that
 * close. `over` lets a test add further (or replace) stages.
 */
export function pcCapabilityConsumerObject(
  consumerId: string,
  basis: PcCapabilityBasis,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: consumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_CAPABILITY_CONSUMER_OWNER,
      process_id: `capability-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: consumerBoundaryId(consumerId), at: ACTOR_BOUNDARY_T },
    dependencies: [
      pcCapabilityDeclaration(basis),
      pcCloseConsumerDeclaration(consumerId, basis.pc_id, basis.capability_id),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}
