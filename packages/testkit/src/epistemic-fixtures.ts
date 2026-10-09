import {
  CANON_WRITE_AUTHORITY,
  OWNER_WORLD_STATE,
  worldLocusKey,
  type AccessEvent,
  type BroadcastExposureEvent,
  type CommitGroup,
  type DependencyDeclaration,
  type NamedActorCapabilityBasis,
  type PcCapabilityBasis,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  epistemicPacketDeclaration,
  epistemicPacketProvider,
  epistemicPacketRead,
  namedActorCapabilityCloseProvider,
  namedActorCapabilityDeclaration,
  pcCapabilityCloseProvider,
  pcCapabilityDeclaration,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { ACTOR_FIXTURE_EXTENSION, closeConsumerProvider } from "./actor-fixtures.ts";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import { pcCloseConsumerProvider } from "./pc-capability-fixtures.ts";
import { SYNTH_RULE, T0, T1, TB } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Epistemic Access / Sealed Accessible Content Packet Backbone Foundation. Every owner, key,
 * identifier, coordinate, sentence and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and
 * no calibration — in particular no comprehension, credibility, belief, score, roll or threshold exists here. The
 * Epistemic Access owner is NOT synthetic and lives in @immortalis/engine; what is synthetic are the OTHER parties of
 * the proof:
 *
 *  - a test ACCESS SOURCE, which commits the carrier/context facts an access event may pin — a stand-in for the foreign
 *    owners (a speaker, a document, a scene) whose state is not implemented;
 *  - a test PACKET CONSUMER, a dependent consequence that materially requires a recipient's packet and reads it AS-OF-NOW
 *    after its formation. It is no Actor/KTI implementation: it records exactly the packet it read and decides nothing.
 *
 * Both are registered through an extension (merged with the Named-Actor fixture extension, whose synthetic history source
 * commits the causes a capability basis pins) that cannot write a canonical, kernel, Population, Production, Economy,
 * World-State, Logistics, Named-Actor or Epistemic key space. Production code must never import this package.
 */
export const SYNTH_ACCESS_SOURCE_OWNER = "SYNTHETIC-ACCESS-SOURCE";
const SOURCE_FACET = "synthetic-access-source";
const SOURCE_PREFIX = "synthetic-access-source/";
/**
 * The test DISSEMINATION OBSERVER: an independent, explicitly test-owned producer standing in for the foreign owner (a
 * herald, a town crier, a public notice board) that would witness a public dissemination. It commits its own observation of
 * the dissemination — what was made public and the audience authority it was made to, read at a pinned version — BEFORE any
 * Epistemic event exists, in its own group under its own owner. It is NOT a live production producer and holds no Epistemic
 * authority; it proves only that the event-mode mechanism has an independent committed causal witness to rest on.
 */
export const SYNTH_DISSEMINATION_OBSERVER_OWNER = "SYNTHETIC-DISSEMINATION-OBSERVER";
const OBSERVER_FACET = "synthetic-dissemination-observer";
const OBSERVER_PREFIX = "synthetic-dissemination-observer/";
export const SYNTH_PACKET_CONSUMER_OWNER = "SYNTHETIC-PACKET-CONSUMER";
const CONSUMER_FACET = "synthetic-packet-consumer";
const CONSUMER_PREFIX = "synthetic-packet-consumer/";
export const SYNTH_OP_CONSUME_PACKET = "synthetic-packet-consume";

const prefixAdmission =
  (owner: string, prefix: string): WriteAdmission["check"] =>
  (group) => {
    if (group.owner !== owner) return null;
    for (const w of group.writes) {
      if (!w.key.startsWith(prefix)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  };

const sourceCheck = prefixAdmission(SYNTH_ACCESS_SOURCE_OWNER, SOURCE_PREFIX);
const observerCheck = prefixAdmission(SYNTH_DISSEMINATION_OBSERVER_OWNER, OBSERVER_PREFIX);
const consumerCheck = prefixAdmission(SYNTH_PACKET_CONSUMER_OWNER, CONSUMER_PREFIX);

export const EPISTEMIC_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    ...ACTOR_FIXTURE_EXTENSION.owners,
    [SYNTH_ACCESS_SOURCE_OWNER, new Set([SOURCE_FACET])],
    [SYNTH_DISSEMINATION_OBSERVER_OWNER, new Set([OBSERVER_FACET])],
    [SYNTH_PACKET_CONSUMER_OWNER, new Set([CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      return (
        ACTOR_FIXTURE_EXTENSION.admission?.check(group, state) ??
        sourceCheck(group, state) ??
        observerCheck(group, state) ??
        consumerCheck(group, state)
      );
    },
  },
};

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const EVENT_COUNCIL = "event-council";
export const EVENT_SCHEMATIC = "event-schematic";
export const EVENT_LATER = "event-later";
export const EVENT_BROADCAST = "event-broadcast";
export const SOURCE_SPEAKER = "source-speaker";
export const SOURCE_SCROLL = "source-scroll";
export const PRESENTED_SEAL = "bearing the seal of the Warden";

export const sourceKey = (id: string): string => `${SOURCE_PREFIX}${id}`;
export const SOURCE_PUBLIC_ADDRESS = "source-public-address";
export const disseminationObservationKey = (id: string): string => `${OBSERVER_PREFIX}${id}`;

export const packetConsumerResultKey = (id: string): string => `${CONSUMER_PREFIX}result/${id}`;

/** A committed carrier/context fact of the access source (a fixture sentence; never a value any engine rule reads). */
export function sourceGroup(
  campaignId: string,
  n: number,
  id: string,
  value: unknown = `SYNTHETIC FIXTURE: carrier ${id}.`,
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `access-source-group-${n}`,
    intent_id: `access-source-intent-${n}`,
    owner: SYNTH_ACCESS_SOURCE_OWNER,
    facet: SOURCE_FACET,
    cause: `access-source-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: sourceKey(id),
        owner: SYNTH_ACCESS_SOURCE_OWNER,
        facet: SOURCE_FACET,
        value: value as never,
        unit: null,
        basis: "access-fixture-basis",
        secrecy: "access-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

/** The audience authority an observation was made to: a committed foreign fact, read at its current version. */
export interface ObservedAudience {
  readonly fact_key: string;
  readonly version: number;
  readonly group_id: string;
}

/**
 * A committed, independent causal observation of one public dissemination. It is authored by the test OBSERVER owner, not by
 * the Epistemic owner and not derived from any Epistemic event: its value says what was made public and to which audience
 * authority, and its group READS that audience authority at the pinned version and depends on the group that committed it —
 * so the observation itself rests on the audience reference, and the audience reference provably existed before it. It
 * supplies no recipient, presence, attention, receipt or outcome. `expectedVersion` > 0 re-observes (a later version).
 */
export function disseminationObservationGroup(
  campaignId: string,
  n: number,
  id: string,
  audience: ObservedAudience,
  value: unknown = {
    observed: `SYNTHETIC FIXTURE: ${id} was announced aloud in the open square.`,
    made_to: { fact_key: audience.fact_key, version: audience.version },
  },
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `dissemination-observation-group-${n}`,
    intent_id: `dissemination-observation-intent-${n}`,
    owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
    facet: OBSERVER_FACET,
    cause: `dissemination-observation-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: audience.fact_key, version: audience.version }],
    depends_on: [audience.group_id],
    writes: [
      {
        key: disseminationObservationKey(id),
        owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
        facet: OBSERVER_FACET,
        value: value as never,
        unit: null,
        basis: "access-fixture-basis",
        secrecy: "access-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

/**
 * A causally well-formed BOUNDED_SHARED_ACCESS event for one named non-PC recipient over a spoken payload whose form
 * depends on no Named-Actor capability. `representation` is the one capability the payload's form depends on, if any.
 */
export const accessEvent = (
  eventId: string,
  recipient: string,
  over: Partial<AccessEvent> = {},
): AccessEvent => ({
  event_id: eventId,
  mode: "BOUNDED_SHARED_ACCESS",
  participants: [recipient],
  source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SPEAKER), version: 1 },
  channel: "SPEECH",
  established_at: T0,
  payload: {
    referent: "the gate rota",
    content: "SYNTHETIC FIXTURE: the gate is opened at first light.",
    presented_attribution: PRESENTED_SEAL,
  },
  representation: null,
  ...over,
});

/**
 * The same event for the one canonically bound active Player Character: the event asserts the `role.player_character`
 * recipient role, which admission, registration and load verification check against the committed Role Registry binding.
 */
export const pcAccessEvent = (
  eventId: string,
  pcId: string,
  over: Partial<AccessEvent> = {},
): AccessEvent => accessEvent(eventId, pcId, { recipient_role: "role.player_character", ...over });

/**
 * A causally well-formed BROADCAST_EXPOSURE event resting on the independent test dissemination observation and the coarse
 * audience authority that observation was made to: the committed World-State locus (an area), pinned at its first version. Every sentence is a fixture. It names no recipient and supplies no
 * reach verdict, presence, attention, receipt, adoption or outcome: `reach` is authored prose the engine never reads.
 */
export const broadcastEvent = (
  eventId: string,
  over: Partial<BroadcastExposureEvent> = {},
): BroadcastExposureEvent => ({
  event_id: eventId,
  mode: "BROADCAST_EXPOSURE",
  source: {
    owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
    fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
    version: 1,
  },
  dissemination_basis: T0,
  payload: {
    referent: "the gate rota",
    content: "SYNTHETIC FIXTURE: the gate is opened at first light.",
    presented_attribution: PRESENTED_SEAL,
  },
  reach: {
    channel: "SYNTHETIC FIXTURE: a public address",
    conditions: "SYNTHETIC FIXTURE: spoken aloud across the open square.",
  },
  audience: {
    owner: OWNER_WORLD_STATE,
    fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
    version: 1,
  },
  exceptions: [],
  ...over,
});

export const accessPublication = (n: number) => ({
  group_id: `access-group-${n}`,
  intent_id: `access-intent-${n}`,
  cause: `access-cause-${n}`,
  basis: "access-fixture-basis",
});

// -- the consumer: a dependent consequence that materially requires a recipient's packet -----------------------

export const packetConsumerStage = (consumerId: string) =>
  ({
    causal_process_id: `packet-consumer/${consumerId}`,
    owner_operation: { owner: SYNTH_PACKET_CONSUMER_OWNER, operation: SYNTH_OP_CONSUME_PACKET },
    prospective_result_id: packetConsumerResultKey(consumerId),
  }) as const;

/** The consumer reads the formed packet AS-OF-NOW (F-014D §2.1): the only lawful downstream read of an Epistemic fact. */
export const packetConsumerDeclaration = (
  consumerId: string,
  eventId: string,
  recipient: string,
): DependencyDeclaration => ({
  stage: packetConsumerStage(consumerId),
  reads: [epistemicPacketRead(eventId, recipient)],
  produces: [packetConsumerResultKey(consumerId)],
  declares_close: null,
});

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "access-fixture-basis",
  secrecy: "access-fixture-secrecy",
});

/** Records exactly the packet the consumer read, and the group that committed it. It decides and infers nothing. */
export const packetConsumerProvider: StageProvider = {
  owner: SYNTH_PACKET_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_PACKET,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    return produces.map((key) =>
      out(key, { observed_packet: fact.value, observed_formation_group: fact.provenance.group_id }),
    );
  },
};

export const epistemicProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    namedActorCapabilityCloseProvider,
    pcCapabilityCloseProvider,
    // a PC-side fixture reader (no Epistemic part), so a PC Capability Close can resolve in an earlier transaction
    pcCloseConsumerProvider,
    // the Named-Actor fixture consumer (a capability reader with no Epistemic part), so a capability close can resolve in
    // an earlier transaction than the packet that later adopts it
    closeConsumerProvider,
    epistemicPacketProvider,
    packetConsumerProvider,
  ]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const packetConsumerObjectId = (consumerId: string): string =>
  `packet-consumer-obj-${consumerId}`;
export const packetConsumerBoundaryId = (consumerId: string): string =>
  `packet-consumer-boundary-${consumerId}`;

/**
 * The engaged object of one dependent consequence: ONE earned boundary (a test coordinate), the capability owner's close
 * declared ahead of it where the payload's form depends on a capability (`basis`: the Named-Actor owner's, or the PC
 * owner's PC Capability Close for a PC basis), the Epistemic packet formation, and the consumer stage that reads the
 * formed packet. `over` lets a test add further (or replace) fields.
 */
export function packetConsumerObject(
  consumerId: string,
  event: AccessEvent,
  basis: NamedActorCapabilityBasis | PcCapabilityBasis | null = null,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: packetConsumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_PACKET_CONSUMER_OWNER,
      process_id: `packet-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: packetConsumerBoundaryId(consumerId), at: TB },
    dependencies: [
      ...(basis
        ? [
            "pc_id" in basis
              ? pcCapabilityDeclaration(basis)
              : namedActorCapabilityDeclaration(basis),
          ]
        : []),
      epistemicPacketDeclaration(event),
      packetConsumerDeclaration(consumerId, event.event_id, event.participants[0]!),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}

/** Toward T1, stopping once the consumer's earned boundary has resolved. */
export const packetAdvanceRequest = (
  id: string,
  consumerId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: {
    target: T1,
    condition: {
      kind: "STOP_AFTER_BOUNDARY",
      object_id: packetConsumerObjectId(consumerId),
      boundary_id: packetConsumerBoundaryId(consumerId),
    },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});
