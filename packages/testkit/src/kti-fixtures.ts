import {
  accessPacketKey,
  ktiDevelopmentObjectKey,
  type DependencyDeclaration,
  type KtiDevelopmentObject,
  type KtiTransferBasis,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  epistemicPacketProvider,
  ktiResultCloseRead,
  ktiTransferDeclaration,
  ktiTransferResultCloseProvider,
  namedActorCapabilityCloseProvider,
  transferPackageId,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { closeConsumerProvider } from "./actor-fixtures.ts";
import { EPISTEMIC_FIXTURE_EXTENSION, packetConsumerProvider } from "./epistemic-fixtures.ts";
import { SYNTH_RULE, T0, T1, TB } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the KTI Managed Transfer Package / Result-Close Backbone Foundation. Every owner, key,
 * identifier, coordinate, sentence and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no
 * calibration — in particular no comprehension, competence, adoption, score, roll or threshold exists here. The KTI owner
 * is NOT synthetic and lives in @immortalis/engine; what is synthetic are the OTHER parties of the proof:
 *
 *  - the Epistemic fixtures (a test access source and a test packet consumer, which forms the sealed packet an earlier
 *    consequence needed) and the Named-Actor fixtures they are built on, reused as they are;
 *  - a test KTI RESULT CONSUMER, a dependent consequence that materially requires a Transfer Package and reads it
 *    AS-OF-DECLARED-CLOSE, naming the KTI result close. It is no Diplomacy/F-014D implementation: it records exactly the
 *    package it read and decides nothing.
 *
 * Both are registered through an extension that cannot write a canonical, kernel, Population, Production, Economy,
 * World-State, Logistics, Named-Actor, Epistemic or KTI key space. Production code must never import this package.
 */
export const SYNTH_KTI_CONSUMER_OWNER = "SYNTHETIC-KTI-RESULT-CONSUMER";
const KTI_CONSUMER_FACET = "synthetic-kti-result-consumer";
const KTI_CONSUMER_PREFIX = "synthetic-kti-result-consumer/";
export const SYNTH_OP_CONSUME_KTI_RESULT = "synthetic-kti-consume-result";

const consumerCheck: WriteAdmission["check"] = (group) => {
  if (group.owner !== SYNTH_KTI_CONSUMER_OWNER) return null;
  for (const w of group.writes) {
    if (!w.key.startsWith(KTI_CONSUMER_PREFIX)) {
      return {
        code: "KEY_NOT_ADMITTED",
        message: "not this synthetic owner's key",
        details: { key: w.key },
      };
    }
  }
  return null;
};

export const KTI_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    ...EPISTEMIC_FIXTURE_EXTENSION.owners,
    [SYNTH_KTI_CONSUMER_OWNER, new Set([KTI_CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      return (
        EPISTEMIC_FIXTURE_EXTENSION.admission?.check(group, state) ?? consumerCheck(group, state)
      );
    },
  },
};

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const OBJECT_GATE_ROTA = "kti-object-gate-rota";
export const OBJECT_OTHER = "kti-object-other-practice";
/** Opaque programme source parties (the Class-E source dimension): never the F-014D true source/holder/carrier. */
export const SOURCE_PARTY_MANILA = "source-party-manila";
export const SOURCE_PARTY_OTHER = "source-party-other";

export const ktiConsumerResultKey = (id: string): string => `${KTI_CONSUMER_PREFIX}result/${id}`;

export const ktiPublication = (n: number) => ({
  group_id: `kti-group-${n}`,
  intent_id: `kti-intent-${n}`,
  cause: `kti-cause-${n}`,
  basis: "kti-fixture-basis",
});

/** A well-formed Class-A development object: the canonical identity, its class and the materiality gate. */
export const ktiObject = (
  objectId = OBJECT_GATE_ROTA,
  over: Partial<KtiDevelopmentObject> = {},
): KtiDevelopmentObject => ({
  object_id: objectId,
  object_class: "METHOD_PRACTICE",
  materiality: "MATERIALLY_FUTURE_CAUSAL",
  ...over,
});

/**
 * The payload an access event carries when its Content / Referent IS the canonical KTI `object_id` (the bounded packet →
 * object link of this foundation); `content` and the attribution are fixture sentences no KTI rule reads.
 */
export const ktiPayload = (objectId = OBJECT_GATE_ROTA, referent: string = objectId) => ({
  referent,
  content: "SYNTHETIC FIXTURE: the demonstrated procedure.",
  presented_attribution: null,
});

/**
 * A well-formed Transfer Package basis for one programme source, one recipient, one development object and one sealed packet
 * (by event). The package identity is derived exactly as the owner derives it.
 */
export function ktiBasis(
  recipient: string,
  eventId: string,
  objectId = OBJECT_GATE_ROTA,
  over: Partial<KtiTransferBasis> = {},
): KtiTransferBasis {
  const source_id = over.source_id ?? SOURCE_PARTY_MANILA;
  const dev = over.development_object ?? {
    object_id: objectId,
    fact_key: ktiDevelopmentObjectKey(objectId),
    version: 1,
  };
  return {
    package_id: transferPackageId(source_id, recipient, dev.object_id),
    management: "CROSS_RESOLUTION_MANAGED",
    source_id,
    recipient,
    development_object: dev,
    packet: { fact_key: accessPacketKey(eventId, recipient), version: 1 },
    ...over,
  };
}

// -- the consumer: a dependent consequence that materially requires a Transfer Package -------------------------

export const ktiConsumerStage = (consumerId: string) =>
  ({
    causal_process_id: `kti-result-consumer/${consumerId}`,
    owner_operation: { owner: SYNTH_KTI_CONSUMER_OWNER, operation: SYNTH_OP_CONSUME_KTI_RESULT },
    prospective_result_id: ktiConsumerResultKey(consumerId),
  }) as const;

/** The consumer reads the package AS-OF-DECLARED-CLOSE, naming the KTI result close: the only lawful downstream read. */
export const ktiConsumerDeclaration = (
  consumerId: string,
  packageId: string,
): DependencyDeclaration => ({
  stage: ktiConsumerStage(consumerId),
  reads: [ktiResultCloseRead(packageId)],
  produces: [ktiConsumerResultKey(consumerId)],
  declares_close: null,
});

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "kti-fixture-basis",
  secrecy: "kti-fixture-secrecy",
});

/** Records exactly the package the consumer read, and the group that committed it. It decides and infers nothing. */
export const ktiConsumerProvider: StageProvider = {
  owner: SYNTH_KTI_CONSUMER_OWNER,
  facet: KTI_CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_KTI_RESULT,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    return produces.map((key) =>
      out(key, { observed_package: fact.value, observed_close_group: fact.provenance.group_id }),
    );
  },
};

export const ktiProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    namedActorCapabilityCloseProvider,
    closeConsumerProvider,
    epistemicPacketProvider,
    packetConsumerProvider,
    ktiTransferResultCloseProvider,
    ktiConsumerProvider,
  ]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const ktiConsumerObjectId = (consumerId: string): string => `kti-consumer-obj-${consumerId}`;
export const ktiConsumerBoundaryId = (consumerId: string): string =>
  `kti-consumer-boundary-${consumerId}`;

/**
 * The engaged object of one dependent consequence that materially requires a Transfer Package: ONE earned boundary (a test
 * coordinate), the KTI owner's result close declared ahead of it, and the consumer stage that reads the package
 * AS-OF-DECLARED-CLOSE. The sealed packet is already committed (an earlier consequence formed it); the KTI stage reads it
 * AS-OF-NOW. `over` lets a test add further (or replace) fields.
 */
export function ktiConsumerObject(
  consumerId: string,
  basis: KtiTransferBasis,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: ktiConsumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_KTI_CONSUMER_OWNER,
      process_id: `kti-result-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: ktiConsumerBoundaryId(consumerId), at: TB },
    dependencies: [
      ktiTransferDeclaration(basis)!,
      ktiConsumerDeclaration(consumerId, basis.package_id),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}

/** Toward T1, stopping once the consumer's earned boundary has resolved. */
export const ktiAdvanceRequest = (
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
      object_id: ktiConsumerObjectId(consumerId),
      boundary_id: ktiConsumerBoundaryId(consumerId),
    },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});
