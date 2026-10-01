import {
  CANON_WRITE_AUTHORITY,
  type AccessEvent,
  type CommitGroup,
  type DependencyDeclaration,
  type NamedActorCapabilityBasis,
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
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { ACTOR_FIXTURE_EXTENSION, closeConsumerProvider } from "./actor-fixtures.ts";
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
const consumerCheck = prefixAdmission(SYNTH_PACKET_CONSUMER_OWNER, CONSUMER_PREFIX);

export const EPISTEMIC_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    ...ACTOR_FIXTURE_EXTENSION.owners,
    [SYNTH_ACCESS_SOURCE_OWNER, new Set([SOURCE_FACET])],
    [SYNTH_PACKET_CONSUMER_OWNER, new Set([CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      return (
        ACTOR_FIXTURE_EXTENSION.admission?.check(group, state) ??
        sourceCheck(group, state) ??
        consumerCheck(group, state)
      );
    },
  },
};

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const EVENT_COUNCIL = "event-council";
export const EVENT_SCHEMATIC = "event-schematic";
export const EVENT_LATER = "event-later";
export const SOURCE_SPEAKER = "source-speaker";
export const SOURCE_SCROLL = "source-scroll";
export const PRESENTED_SEAL = "bearing the seal of the Warden";

export const sourceKey = (id: string): string => `${SOURCE_PREFIX}${id}`;
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
 * The engaged object of one dependent consequence: ONE earned boundary (a test coordinate), the actor owner's capability
 * close declared ahead of it where the payload's form depends on a capability (`basis`), the Epistemic packet formation,
 * and the consumer stage that reads the formed packet. `over` lets a test add further (or replace) fields.
 */
export function packetConsumerObject(
  consumerId: string,
  event: AccessEvent,
  basis: NamedActorCapabilityBasis | null = null,
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
      ...(basis ? [namedActorCapabilityDeclaration(basis)] : []),
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
