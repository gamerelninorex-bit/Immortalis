// F-014B P-7 E0 shared test support. Everything here is a TEST fixture of the nonwriting section 10 groundwork: real in-memory campaigns
// built through the ORIGINAL owner adapters (Epistemic Access, Temporal coordinator), real committed owner facts, and three LABELLED
// test-double authorities (ability, first option, history) that stand in for producers the build does not install (RED R-H.1, P-5,
// P-6/T85). A result that depends on one of them is fixture-dependent and can never support more than a fixture.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accessEventKey,
  temporalObjectKey,
  type AccessEvent,
  type CanonicalTime,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import { epistemicPacketDeclaration } from "@immortalis/engine";
import {
  EVENT_COUNCIL,
  FIXTURE_PC_ID,
  accessEvent,
  accessPublication,
  at,
  packetConsumerObject,
  pcAccessEvent,
  temporalPublication,
} from "@immortalis/testkit";
import {
  GmWaitCatalogueManifestV2Schema,
  type DigestAuthority,
  type GmWaitCatalogueManifestV2,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  NEGATIVE_TWIN_CLASSES,
  P7_GOVERNING_SOURCES,
  enumerateMembers,
  providerId,
  refOf,
  type AbilityAuthority,
  type AbilityReading,
  type EvidenceLedger,
  type EvidenceRef,
  type FirstOptionAuthority,
  type FirstOptionReading,
  type HistoryReader,
  type Member,
  type MemberCertificate,
  type OwnerFactRef,
} from "../../tools/gm-wait-section10/proof.ts";
import { MANIFEST_DIR, REPO_ROOT } from "../../tools/gen-gm-wait-catalogue.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";
import { seededEpistemicCampaign, type EpistemicSeeded } from "./epistemic.ts";

export const PC = FIXTURE_PC_ID;
export const PACKET_PROVIDER = "epistemic_access|epistemic-form-accessible-packet";
export const ROUTE_NON_OBSERVATION = "EPISTEMIC_ROUTE:NON_OBSERVATION_ACCESS";
export const PROVIDER_KEY = `PROVIDER:${PACKET_PROVIDER}`;

export const currentManifestBytes = (): string =>
  readFileSync(join(REPO_ROOT, MANIFEST_DIR, `${GM_WAIT_CATALOGUE_CURRENT_SHA256}.json`), "utf8");
export const currentManifest = (): GmWaitCatalogueManifestV2 =>
  GmWaitCatalogueManifestV2Schema.parse(JSON.parse(currentManifestBytes()));
export const currentAuthority = (): DigestAuthority => ({
  current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
  retained: new Map([[GM_WAIT_CATALOGUE_CURRENT_SHA256, currentManifestBytes()]]),
});

export const ledgerOf = (s: EpistemicSeeded): EvidenceLedger => ({
  get: (k) => s.campaign.store.getFact(k),
});

/** A ledger decorator that records every key read: the T0/in-X read-set spy. */
export function spyLedger(inner: EvidenceLedger): EvidenceLedger & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    get(k) {
      reads.push(k);
      return inner.get(k);
    },
  };
}

/** A ledger over an explicit fact map (used only for the labelled forged-fact negative tests and the twin campaigns). */
export const mapLedger = (facts: ReadonlyMap<string, OwnerFact>): EvidenceLedger => ({
  get: (k) => facts.get(k),
});

// -- labelled test-double authorities --------------------------------------------------------------------------------------------------

export const FIXTURE_ABILITY_ID = "FIXTURE_ABILITY_TEST_DOUBLE";
export const FIXTURE_FIRST_OPTION_ID = "FIXTURE_FIRST_OPTION_TEST_DOUBLE";
export const FIXTURE_HISTORY_ID = "FIXTURE_HISTORY_TEST_DOUBLE";
export const FIXTURE_SEGMENT = "fixture-segment-1";

export const fixtureAbility = (state: AbilityReading["state"]): AbilityAuthority => ({
  id: FIXTURE_ABILITY_ID,
  fixture: true,
  read: () => ({ authority_id: FIXTURE_ABILITY_ID, fixture: true, state }),
});
/** the PC can act `lag` coordinate units after it knows (0 = at once); `null` proves nothing */
export const fixtureFirstOption = (lag: number | null): FirstOptionAuthority => ({
  id: FIXTURE_FIRST_OPTION_ID,
  fixture: true,
  read(q): FirstOptionReading {
    return lag === null
      ? { authority_id: FIXTURE_FIRST_OPTION_ID, fixture: true, state: "UNPROVEN" }
      : {
          authority_id: FIXTURE_FIRST_OPTION_ID,
          fixture: true,
          state: "AVAILABLE_AT",
          at: { unit: q.at.unit, value: q.at.value + lag },
        };
  },
});
export const fixtureHistory: HistoryReader = {
  id: FIXTURE_HISTORY_ID,
  fixture: true,
  verifiesSegment: (id) => id === FIXTURE_SEGMENT,
};

// -- the scene: a real campaign with the PC's committed access event and its packet-formation object --------------------------------------

export interface Scene {
  readonly s: EpistemicSeeded;
  readonly event: AccessEvent;
  readonly eventFact: OwnerFact;
  readonly objectFact: OwnerFact;
  readonly object: TemporalObject;
  readonly ledger: EvidenceLedger;
}

/**
 * One PC access event (authored, non-observation-earned) and the ONE engaged object that declares exactly its packet formation,
 * registered through the original coordinator. The object's earned boundary is `boundaryAt`. `n` offsets the publication numbers so
 * several scenes can share one campaign.
 */
export async function sceneIn(
  s: EpistemicSeeded,
  o: {
    readonly n: number;
    readonly consumerId: string;
    readonly eventId?: string;
    readonly recipient?: string;
    readonly boundaryAt: CanonicalTime;
    readonly eventOver?: Partial<AccessEvent>;
  },
): Promise<Scene> {
  const eventId = o.eventId ?? EVENT_COUNCIL;
  const recipient = o.recipient ?? PC;
  const event =
    recipient === PC
      ? pcAccessEvent(eventId, recipient, o.eventOver ?? {})
      : accessEvent(eventId, recipient, o.eventOver ?? {});
  await must(s.access.establishBoundedSharedAccess({ ...accessPublication(o.n), event }));
  const object: TemporalObject = {
    ...packetConsumerObject(o.consumerId, event, null),
    dependencies: [epistemicPacketDeclaration(event)],
    last_resolved_basis: at(100),
    next_boundary: { boundary_id: `boundary-${o.consumerId}`, at: o.boundaryAt },
  };
  await must(s.coordinator.registerObject({ ...temporalPublication(o.n + 1), object }));
  const store = s.campaign.store;
  return {
    s,
    event,
    eventFact: store.getFact(accessEventKey(eventId))!,
    objectFact: store.getFact(temporalObjectKey(object.object_id))!,
    object,
    ledger: ledgerOf(s),
  };
}

export async function freshScene(boundaryAt: CanonicalTime = at(140)): Promise<Scene> {
  const s = await seededEpistemicCampaign(tempDir());
  return sceneIn(s, { n: 1, consumerId: "c1", boundaryAt });
}

// -- certificates ------------------------------------------------------------------------------------------------------------------------

export const TWO_BLOCKER = P7_GOVERNING_SOURCES.find((x) =>
  x.label.startsWith("F-014B Two-Blocker"),
)!;
export const sourceClause = (clause = "section-8.1(2)", src = TWO_BLOCKER): EvidenceRef => ({
  kind: "SOURCE_CLAUSE",
  page_uuid: src.page_uuid,
  native_pin: src.native_pin,
  clause,
});

/** A negative-history twin witness: `key` is committed in the real ledger and absent in the separately committed twin ledger `ledgerId`. */
export const twinRefs = (
  keys: Readonly<
    Record<(typeof NEGATIVE_TWIN_CLASSES)[number], { ledger_id: string; key: string }>
  >,
): EvidenceRef[] =>
  NEGATIVE_TWIN_CLASSES.map((twin) => ({ kind: "TWIN_ABSENCE", twin, ...keys[twin] }));

export interface CertParts {
  readonly scene: Scene;
  readonly twins: EvidenceRef[];
  readonly digest?: string;
  /** the recipient/knowledge witness when it is not the scene's own object and event (a broadcast route, a direct-observation route) */
  readonly knowledge?: OwnerFactRef[];
}

/** The complete evidence a certificate for the packet provider or the non-observation Epistemic route lists, built from real facts. */
export function certificateFor(member: Member, parts: CertParts): MemberCertificate {
  const m = currentManifest();
  const objRef: OwnerFactRef = refOf(parts.scene.objectFact);
  const evRef: OwnerFactRef = refOf(parts.scene.eventFact);
  const provider = m.providers.find((p) => providerId(p) === PACKET_PROVIDER)!;
  const authority = (obligation: "RECIPIENT_ABILITY" | "FIRST_PC_OPTION"): EvidenceRef => ({
    kind: "AUTHORITY_READING",
    authority_id: obligation === "RECIPIENT_ABILITY" ? FIXTURE_ABILITY_ID : FIXTURE_FIRST_OPTION_ID,
    obligation,
  });
  const claims: MemberCertificate["claims"] = {
    SOURCE_POLICY: {
      evidence: [
        sourceClause(),
        ...(member.family === "PROVIDER"
          ? ([{ kind: "RULE_REF", rule_id: provider.rule_ref }] as EvidenceRef[])
          : []),
      ],
    },
    RECIPIENT_KNOWLEDGE_LATENCY: { evidence: parts.knowledge ?? [objRef, evRef] },
    RECIPIENT_ABILITY: { evidence: [authority("RECIPIENT_ABILITY")] },
    FIRST_PC_OPTION: { evidence: [authority("FIRST_PC_OPTION")] },
    NEGATIVE_TWINS: { evidence: parts.twins },
    HISTORICAL_POLICY: { evidence: [{ kind: "HISTORY_SEGMENT", segment_id: FIXTURE_SEGMENT }] },
    ...(member.family === "PROVIDER"
      ? {
          OWNER_STAGE_ROUTE: { evidence: [objRef] },
          EFFECT_CLOSE_INVALIDATOR: { evidence: [objRef] },
        }
      : {}),
  };
  return {
    format: "immortalis-p7-section10-proof",
    version: 1,
    catalogue_sha256: parts.digest ?? GM_WAIT_CATALOGUE_CURRENT_SHA256,
    member: { family: member.family, id: member.id },
    claims,
  };
}

export const memberNamed = (key: string): Member => {
  const found = enumerateMembers(currentManifest()).find((x) => x.key === key);
  if (found === undefined) throw new Error(`no such member ${key}`);
  return found;
};
