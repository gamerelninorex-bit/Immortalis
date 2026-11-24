import {
  OWNER_TEMPORAL_KERNEL,
  z,
  Sha256,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  AccessEventSchema,
  AccessDisseminationEventSchema,
  accessEventKey,
  type CanonicalTime,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import { sha256Canonical, canonicalEqual } from "../../../packages/engine/src/hash.ts";
import {
  GmWaitCatalogueManifestV2Schema,
  catalogueCoverageViolations,
  catalogueDigest,
  validateManifest,
  verifySuppliedDigest,
  type CatalogueCensus,
  type DigestAuthority,
  type DigestVerdict,
  type GmWaitCatalogueManifestV2,
} from "../../../packages/engine/src/gm-wait-catalogue.ts";
import {
  deriveAccessProducts,
  requiredCapability,
  isBroadcastEvent,
} from "../../../packages/engine/src/epistemic/derive.ts";
import {
  epistemicPacketDeclaration,
  isObservationEarnedFact,
} from "../../../packages/engine/src/epistemic/declaration.ts";

/**
 * F-014B P-7 E0 - the source-closed per-member proof checker and the all-enrolled coverage / gap report for the Temporal section 10
 * evaluator (BLUE P-7 brief at native pin 2026-11-24T00:22:21.665Z; Two-Blocker v0.3 section 8.1(2); RED terminal R-9, P-7, T74, T85;
 * BLUE final decision N9.1-N9.8).
 *
 * MECHANISM ONLY and NON-WRITING. Every function here is a pure function of its arguments: no clock, no randomness, no filesystem, no
 * store, no network, no canonical write. It installs no writer, registers no owner/facet/kind, classifies no member INERT,
 * PASSIVE_PROVEN or INTERRUPTION_GUARDED, and edits no manifest. The shared catalogue sentinels (`UNDECLARED`, `ACTIONABLE_OR_UNSAFE`,
 * `NONE_SECTION_10_NOT_ACCEPTED`, `NOT_INSTALLED_NO_GM_WRITER`, `UNRETIRED_DENY`) are READ and reported, never changed. This module is
 * deliberately NOT exported from the package index.
 *
 * WHAT A CERTIFICATE IS. A certificate is INTERNAL CANDIDATE ENGINEERING DATA. It is not a source kind, not a manifest field and not a
 * verdict. It has no field in which a verdict could be stated (`safe`, `passive`, `guarded`, `inert`, `proven`, ... are refused by
 * name). It only lists evidence references, and the checker re-derives every positive datum from an independent source:
 *   - the governing source clause, at its exact native pin, from a closed table (SOURCE_CLAUSE);
 *   - the member's own registered rule reference from the verified catalogue (RULE_REF);
 *   - a COMMITTED OWNER FACT re-read from the supplied ledger, whose owner, facet, version, committing group and canonical value digest
 *     must all equal the reference, and whose key must lie in a registered kind of that same owner/facet (OWNER_FACT);
 *   - a negative-history twin, proved ABSENT in a separately committed twin ledger (TWIN_ABSENCE);
 *   - for the producers the build does not install (Health, a first native PC option, retained per-segment history) an injected
 *     authority whose DEFAULT refuses.
 * A matched digest, a source reference alone or a syntactically valid document never closes an obligation: the strongest per-member
 * result this module can return is PROOF_CLOSED_CANDIDATE, which is itself never an acceptance (the aggregate is always NOT_ACCEPTED).
 */

export const P7_PROOF_FORMAT = "immortalis-p7-section10-proof";
export const P7_REPORT_FORMAT = "immortalis-p7-section10-gap-report";
export const P7_PROOF_VERSION = 1;
/** The only status this module can attach to its own output. It is never an acceptance level. */
export const P7_STATUS = "INTERNAL_CANDIDATE_NONWRITING_MECHANISM_ONLY";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const Text = z.string().min(1);

// ---------------------------------------------------------------------------------------------
// 1. The closed table of governing sources (exact identities read at their native pins)
// ---------------------------------------------------------------------------------------------

export interface GoverningSource {
  readonly label: string;
  readonly page_uuid: string;
  readonly native_pin: string;
  readonly clauses: readonly string[];
}

/**
 * Every source below was read in full at the stated native pin for this build (BLUE P-7 brief section 2). A certificate citing any other
 * page, a different pin of one of these pages, or a clause that is not listed is refused. The table is an identity register and not a
 * proof: citing a listed clause never closes an obligation by itself.
 */
export const P7_GOVERNING_SOURCES: readonly GoverningSource[] = [
  {
    label: "BLUE P-7 Hard Preflight PASS and Claude Code bounded build handoff",
    page_uuid: "42220af9-01e0-81d7-9002-e799567e0e7c",
    native_pin: "2026-11-24T00:22:21.665Z",
    clauses: ["section-4", "section-5", "section-6", "section-7"],
  },
  {
    label: "F-014B GM-Mediated Passive Waiting Consolidated v0.6",
    page_uuid: "41520af9-01e0-81f6-b8d5-ec29df56296e",
    native_pin: "2026-11-11T00:34:47.360Z",
    clauses: ["section-5.1", "section-5.2", "section-5.3", "section-6", "section-10"],
  },
  {
    label: "F-014B Two-Blocker Resolution v0.3 (Sovereign ratified design addendum)",
    page_uuid: "41520af9-01e0-817e-bc38-fd479338b87c",
    native_pin: "2026-11-11T02:29:27.464Z",
    clauses: ["section-8.1(2)", "section-8.1(3)", "section-8.1(4)", "section-8.2"],
  },
  {
    label: "F-014B Terminal RED controlling riders",
    page_uuid: "42020af9-01e0-81ba-9830-d14070ec9789",
    native_pin: "2026-11-22T13:02:53.745Z",
    clauses: ["R-9", "P-7", "T74", "T85"],
  },
  {
    label: "Sovereign ratification: F-014B Terminal RED (design only)",
    page_uuid: "42020af9-01e0-81f6-9ab3-e6c32e4f19e7",
    native_pin: "2026-11-22T13:06:43.623Z",
    clauses: ["R-9 (controlling reading)"],
  },
  {
    label: "BLUE F-014B final source-authority decision and engineering closure",
    page_uuid: "42020af9-01e0-81ef-aae2-c0d6994ca46c",
    native_pin: "2026-11-22T12:38:56.838Z",
    clauses: ["N9.1", "N9.2", "N9.3", "N9.4", "N9.5", "N9.6", "N9.7", "N9.8"],
  },
  {
    label: "Temporal Resolution Kernel working operational draft v2",
    page_uuid: "3e020af9-01e0-81fb-88e9-f691748db990",
    native_pin: "2026-10-23T09:37:46.817Z",
    clauses: ["section-6", "section-10", "section-15"],
  },
  {
    label: "Epistemic Access, Provenance and Information Channels working operational draft v2",
    page_uuid: "3e020af9-01e0-8103-b81a-ec5f7119318e",
    native_pin: "2026-10-23T12:28:14.041Z",
    clauses: ["section-2.1", "section-4.4", "section-5-step-4", "section-21"],
  },
];

/**
 * The clauses that define WHAT a member certificate must cover. A certificate's SOURCE_POLICY claim must cite at least one of them, at
 * its exact pin: the ratified fifth class (Two-Blocker 8.1(2)), RED's controlling reading (R-9) or BLUE's N9.2/N9.4.
 */
export const P7_AUTHORITY_CLAUSES: readonly (readonly [string, string])[] = [
  ["41520af9-01e0-817e-bc38-fd479338b87c", "section-8.1(2)"],
  ["42020af9-01e0-81ba-9830-d14070ec9789", "R-9"],
  ["42020af9-01e0-81ef-aae2-c0d6994ca46c", "N9.2"],
  ["42020af9-01e0-81ef-aae2-c0d6994ca46c", "N9.4"],
];

export type SourceClauseVerdict =
  "OK" | "SOURCE_UNKNOWN" | "SOURCE_PIN_MISMATCH" | "SOURCE_CLAUSE_UNKNOWN";

export function verifySourceClause(ref: {
  readonly page_uuid: string;
  readonly native_pin: string;
  readonly clause: string;
}): SourceClauseVerdict {
  const s = P7_GOVERNING_SOURCES.find((x) => x.page_uuid === ref.page_uuid);
  if (s === undefined) return "SOURCE_UNKNOWN";
  if (s.native_pin !== ref.native_pin) return "SOURCE_PIN_MISMATCH";
  return s.clauses.includes(ref.clause) ? "OK" : "SOURCE_CLAUSE_UNKNOWN";
}

// ---------------------------------------------------------------------------------------------
// 2. Vocabulary: obligations, member families, closed reason codes
// ---------------------------------------------------------------------------------------------

/**
 * The per-member obligations of N9.4 ("declared owner stage kinds, effects, causal inputs, exceptions, recipient reach/ability/
 * representation, first native PC options, information latency and all policy-versioned negative dependency invalidators"), plus the
 * identity check and the original historical policy of N9.7.
 */
export const OBLIGATIONS = [
  "IDENTITY",
  "SOURCE_POLICY",
  "OWNER_STAGE_ROUTE",
  "EFFECT_CLOSE_INVALIDATOR",
  "RECIPIENT_KNOWLEDGE_LATENCY",
  "RECIPIENT_ABILITY",
  "FIRST_PC_OPTION",
  "NEGATIVE_TWINS",
  "HISTORICAL_POLICY",
] as const;
export type Obligation = (typeof OBLIGATIONS)[number];

/** N9.3: complete original negative twins for the earlier possibilities. */
export const NEGATIVE_TWIN_CLASSES = [
  "NO_OP",
  "OMITTED_GROUP",
  "HISTORICAL_VERSION",
  "ABSENT_NEW_FACT",
  "SAME_INSTANT_COMPETITOR",
] as const;
export type NegativeTwinClass = (typeof NEGATIVE_TWIN_CLASSES)[number];

export const MEMBER_FAMILIES = [
  "KIND",
  "PROVIDER",
  "OWNER_FACET",
  "SITE",
  "OBJECT_ROUTE",
  "CLOSE",
  "EVENT_TRIGGER",
  "ACCESS_CLASS",
  "AUDIENCE_FACT_KIND",
  "CULTURE_ROUTE",
  "EXTENSION_DISPATCH",
  "HISTORICAL_POLICY",
  "EPISTEMIC_ROUTE",
] as const;
export type MemberFamily = (typeof MEMBER_FAMILIES)[number];

/**
 * The Epistemic paths the manifest does not enumerate as entries but which the sources name as PC-knowledge routes (F-014B v0.6 5.1:
 * Epistemic Access is ACTIONABLE_OR_UNSAFE because source permits a non-observation-earned PC access event; F-014D 4.4 broadcast and
 * audience). They are members of the all-enrolled catalogue for coverage purposes and need their own evidence; a source-derived
 * member is not an invented owner, kind, route or writer.
 */
export const EPISTEMIC_SOURCE_ROUTES = [
  "DIRECT_OBSERVATION",
  "NON_OBSERVATION_ACCESS",
  "BROADCAST_EXPOSURE",
  "AUDIENCE_PROJECTION",
] as const;

export const REASON_CODES = [
  // identity / catalogue
  "MANIFEST_NOT_V2",
  "MANIFEST_INVALID",
  "DIGEST_NOT_CURRENT",
  "MEMBER_NOT_IN_MANIFEST",
  "MEMBER_OWNER_FACET_MISMATCH",
  "CODE_DRIFT_DETECTED",
  // certificate
  "NO_CERTIFICATE",
  "CERT_SCHEMA_INVALID",
  "SELF_ASSERTED_VERDICT",
  "CERT_DUPLICATE",
  "CERT_CATALOGUE_MISMATCH",
  "CERT_MEMBER_MISMATCH",
  "CLAIM_ABSENT",
  // source policy
  "RULE_REF_MISSING",
  "RULE_REF_NOT_MEMBERS",
  "SOURCE_UNKNOWN",
  "SOURCE_PIN_MISMATCH",
  "SOURCE_CLAUSE_UNKNOWN",
  "SOURCE_AUTHORITY_MISSING",
  // evidence
  "EVIDENCE_KIND_MISSING",
  "EVIDENCE_FACT_ABSENT",
  "EVIDENCE_OWNER_MISMATCH",
  "EVIDENCE_VERSION_MISMATCH",
  "EVIDENCE_GROUP_MISMATCH",
  "EVIDENCE_VALUE_MISMATCH",
  "EVIDENCE_KEY_NOT_REGISTERED",
  "WITNESS_VALUE_INVALID",
  // stage / effects
  "STAGE_NOT_DECLARED_BY_MEMBER",
  "EFFECT_OUTSIDE_MEMBER_KINDS",
  "CLOSE_NOT_IN_CENSUS",
  "INVALIDATORS_UNDECLARED",
  "LATENCY_LITERAL_NOT_PROOF",
  // recipient / knowledge time
  "PC_CONTEXT_ABSENT",
  "EVENT_NOT_BOUNDED_ACCESS",
  "BROADCAST_NOT_RECEIPT",
  "EVENT_NOT_BROADCAST",
  "AUDIENCE_KIND_NOT_ENROLLED",
  "EVENT_NOT_OBSERVATION_EARNED",
  "EVENT_OBSERVATION_EARNED",
  "WRONG_RECIPIENT",
  "RECEIPT_NOT_DERIVABLE",
  "PACKET_PRECEDES_ACCESS",
  "CLOCK_UNIT_MISMATCH",
  "DECLARATION_MISMATCH",
  // ability / first option / twins / history
  "ABILITY_UNKNOWN",
  "FIRST_OPTION_UNPROVEN",
  "TWIN_CLASS_MISSING",
  "TWIN_LEDGER_UNKNOWN",
  "TWIN_NOT_ABSENT",
  "HISTORY_NOT_RETIRED",
  // composite / structural
  "CONSTITUENT_OPEN",
  "NO_ATTRIBUTABLE_CONSTITUENT",
  "ROUTE_ATTRIBUTION_NOT_DEFINED",
  "EXTENSION_HISTORY_SKIPPED_IN_SOURCE",
  "AUTHORITY_READING_MISMATCH",
  // P7-E1: the native receipt witness for the DIRECT_OBSERVATION route. Diagnostic only, never a canonical classification.
  "NATIVE_RECEIPT_EVIDENCE_ABSENT",
  "NATIVE_RECEIPT_NOT_PROVEN",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

// ---------------------------------------------------------------------------------------------
// 3. Evidence references and the certificate (strict; no field in which a verdict could be stated)
// ---------------------------------------------------------------------------------------------

export const OwnerFactRefSchema = z.strictObject({
  kind: z.literal("OWNER_FACT"),
  key: Text,
  version: z.number().int().positive(),
  group_id: Text,
  owner: Text,
  facet: Text,
  value_sha256: Sha256,
});
export type OwnerFactRef = z.infer<typeof OwnerFactRefSchema>;

export const EvidenceRefSchema = z.discriminatedUnion("kind", [
  OwnerFactRefSchema,
  z.strictObject({
    kind: z.literal("SOURCE_CLAUSE"),
    page_uuid: Text,
    native_pin: Text,
    clause: Text,
  }),
  z.strictObject({ kind: z.literal("RULE_REF"), rule_id: Sha256 }),
  z.strictObject({
    kind: z.literal("TWIN_ABSENCE"),
    twin: z.enum(NEGATIVE_TWIN_CLASSES),
    ledger_id: Text,
    key: Text,
  }),
  z.strictObject({ kind: z.literal("HISTORY_SEGMENT"), segment_id: Text }),
  z.strictObject({
    kind: z.literal("AUTHORITY_READING"),
    authority_id: Text,
    obligation: z.enum(["RECIPIENT_ABILITY", "FIRST_PC_OPTION"]),
  }),
]);
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

const ClaimSchema = z.strictObject({ evidence: z.array(EvidenceRefSchema) });

export const MemberCertificateSchema = z.strictObject({
  format: z.literal(P7_PROOF_FORMAT),
  version: z.literal(P7_PROOF_VERSION),
  catalogue_sha256: Sha256,
  member: z.strictObject({ family: z.enum(MEMBER_FAMILIES), id: Text }),
  claims: z.strictObject({
    SOURCE_POLICY: ClaimSchema.optional(),
    OWNER_STAGE_ROUTE: ClaimSchema.optional(),
    EFFECT_CLOSE_INVALIDATOR: ClaimSchema.optional(),
    RECIPIENT_KNOWLEDGE_LATENCY: ClaimSchema.optional(),
    RECIPIENT_ABILITY: ClaimSchema.optional(),
    FIRST_PC_OPTION: ClaimSchema.optional(),
    NEGATIVE_TWINS: ClaimSchema.optional(),
    HISTORICAL_POLICY: ClaimSchema.optional(),
  }),
});
export type MemberCertificate = z.infer<typeof MemberCertificateSchema>;

/**
 * Field names under which a certificate (or any nested object in it) would STATE a verdict instead of listing evidence. A certificate
 * never carries a verdict: a classification is derived by a later accepted evaluator, never asserted by its own evidence. Each is
 * refused by name so the diagnosis is precise; the strict schema would refuse any of them in any case.
 */
export const SELF_ASSERTED_VERDICT_KEYS: readonly string[] = [
  "safe",
  "unsafe",
  "passive",
  "passive_proven",
  "inert",
  "guarded",
  "interruption_guarded",
  "proven",
  "certified",
  "accepted",
  "permits",
  "verdict",
  "disposition",
  "actionable",
  "creates_epistemic_interruption",
];

export function selfAssertedVerdictPaths(value: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...selfAssertedVerdictPaths(v, `${path}[${i}]`)));
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (SELF_ASSERTED_VERDICT_KEYS.includes(k)) out.push(`${path}.${k}`);
      out.push(...selfAssertedVerdictPaths(v, `${path}.${k}`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 4. Independent evidence sources and authorities (defaults refuse)
// ---------------------------------------------------------------------------------------------

/** A read-only view of committed owner facts at ONE causal cut. The real implementation is `CampaignState.facts`. */
export interface EvidenceLedger {
  get(key: string): OwnerFact | undefined;
}

export interface AuthorityReadingBase {
  readonly authority_id: string;
  /** true only for a labelled test double: a reading that depends on it can never support anything but a fixture result */
  readonly fixture: boolean;
}
export type AbilityReading = AuthorityReadingBase & {
  readonly state: "AVAILABLE" | "IMPAIRED" | "UNKNOWN";
};
export type FirstOptionReading = AuthorityReadingBase &
  ({ readonly state: "AVAILABLE_AT"; readonly at: CanonicalTime } | { readonly state: "UNPROVEN" });

export interface AuthorityQuery {
  readonly pc_id: string;
  readonly modality: "PERCEPTION" | "SPEECH";
  readonly at: CanonicalTime;
}
/**
 * RED R-H.1: Health is not an installed owner among the registered namespaces, so no production reading of the PC's ability to receive
 * or act exists. The DEFAULT therefore returns UNKNOWN, which refuses (P7-07). A later installed Health owner supplies a real authority.
 */
export interface AbilityAuthority {
  readonly id: string;
  readonly fixture: boolean;
  read(q: AuthorityQuery, ledger: EvidenceLedger): AbilityReading;
}
/** RED P-5: the first native PC option is unretired evidence; the DEFAULT proves nothing. */
export interface FirstOptionAuthority {
  readonly id: string;
  readonly fixture: boolean;
  read(q: AuthorityQuery, ledger: EvidenceLedger): FirstOptionReading;
}
/** RED P-6 / T85: retained per-segment original-policy identity does not exist in the journal today; the DEFAULT retires nothing. */
export interface HistoryReader {
  readonly id: string;
  readonly fixture: boolean;
  verifiesSegment(segmentId: string): boolean;
}

export const NO_HEALTH_OWNER_AUTHORITY: AbilityAuthority = Object.freeze({
  id: "NO_HEALTH_OWNER_INSTALLED",
  fixture: false,
  read: (): AbilityReading => ({
    authority_id: "NO_HEALTH_OWNER_INSTALLED",
    fixture: false,
    state: "UNKNOWN",
  }),
});
export const NO_PROVEN_FIRST_OPTION_AUTHORITY: FirstOptionAuthority = Object.freeze({
  id: "NO_PROVEN_FIRST_OPTION",
  fixture: false,
  read: (): FirstOptionReading => ({
    authority_id: "NO_PROVEN_FIRST_OPTION",
    fixture: false,
    state: "UNPROVEN",
  }),
});
export const NO_RETIRED_HISTORY: HistoryReader = Object.freeze({
  id: "NO_RETIRED_HISTORY",
  fixture: false,
  verifiesSegment: () => false,
});

/**
 * P7-E1: what a DIRECT_OBSERVATION receipt must additionally rest on. A receipt that a derivation COULD produce from a committed event is
 * not the receipt the owner actually COMMITTED. The witness is a test-local, read-only view of an actual campaign journal at one named cut
 * (the real implementation lives beside the E1 tests and takes only the store's read methods); it returns a diagnostic code and detail
 * on refusal. The code is a test diagnostic and never a canonical classification. Absent witness: the route never closes.
 */
export interface NativeObservationVerdict {
  readonly ok: boolean;
  /** diagnostic only */
  readonly code: string;
  readonly detail: string;
}
export interface NativeObservationWitness {
  readonly id: string;
  verify(q: { readonly event: OwnerFact; readonly pc_id: string }): NativeObservationVerdict;
}

export interface CheckerContext {
  /** the presented manifest (any value; it is parsed and validated here, never trusted) */
  readonly manifest: unknown;
  readonly authority: DigestAuthority;
  /** the census taken from the actual declarations; when absent, code drift is UNCHECKED and the aggregate cannot close */
  readonly census?: CatalogueCensus;
  readonly ledger: EvidenceLedger;
  /** separately committed twin ledgers, by id (negative-history witnesses) */
  readonly twins?: ReadonlyMap<string, EvidenceLedger>;
  /** the operative PC and the causal cut the evidence is read at */
  readonly pc?: { readonly entity_id: string };
  readonly cut?: CanonicalTime;
  readonly abilityAuthority?: AbilityAuthority;
  readonly firstOptionAuthority?: FirstOptionAuthority;
  readonly history?: HistoryReader;
  /** the native journal witness the DIRECT_OBSERVATION route requires (P7-E1); absent, that route never closes */
  readonly nativeObservation?: NativeObservationWitness;
}

// ---------------------------------------------------------------------------------------------
// 5. Ledger evidence: a committed owner fact re-read, never trusted by reference
// ---------------------------------------------------------------------------------------------

/** The registered kind whose key space contains `key`, found by the catalogue's own key patterns. */
export function kindForKey(
  m: GmWaitCatalogueManifestV2,
  key: string,
): GmWaitCatalogueManifestV2["kinds"][number] | undefined {
  return m.kinds.find((k) => new RegExp(k.key_pattern.source, k.key_pattern.flags).test(key));
}

export type FactRead =
  | { readonly ok: true; readonly fact: OwnerFact }
  | { readonly ok: false; readonly reason: ReasonCode; readonly detail: string };

/**
 * Re-reads the referenced fact from the ledger and requires it to be exactly the fact the reference names (owner, facet, version,
 * committing group, canonical value digest), and its key to lie in a REGISTERED kind of that same owner and facet. A fabricated
 * owner fact, a stale version, a fact of another group or a key outside every registered key space is refused. Pure.
 */
export function readOwnerFact(
  ref: OwnerFactRef,
  ledger: EvidenceLedger,
  m: GmWaitCatalogueManifestV2,
): FactRead {
  const fact = ledger.get(ref.key);
  if (fact === undefined) return { ok: false, reason: "EVIDENCE_FACT_ABSENT", detail: ref.key };
  if (fact.owner !== ref.owner || fact.facet !== ref.facet)
    return { ok: false, reason: "EVIDENCE_OWNER_MISMATCH", detail: ref.key };
  if (fact.version !== ref.version)
    return {
      ok: false,
      reason: "EVIDENCE_VERSION_MISMATCH",
      detail: `${ref.key}@${ref.version} (ledger ${fact.version})`,
    };
  if (fact.provenance.group_id !== ref.group_id)
    return { ok: false, reason: "EVIDENCE_GROUP_MISMATCH", detail: ref.key };
  if (sha256Canonical(fact.value) !== ref.value_sha256)
    return { ok: false, reason: "EVIDENCE_VALUE_MISMATCH", detail: ref.key };
  const kind = kindForKey(m, ref.key);
  if (kind === undefined || kind.owner !== fact.owner || kind.facet !== fact.facet)
    return { ok: false, reason: "EVIDENCE_KEY_NOT_REGISTERED", detail: ref.key };
  return { ok: true, fact };
}

/** A reference to a fact exactly as the ledger holds it now (a test/audit convenience; the checker never calls it on a certificate). */
export function refOf(fact: OwnerFact): OwnerFactRef {
  return {
    kind: "OWNER_FACT",
    key: fact.key,
    version: fact.version,
    group_id: fact.provenance.group_id,
    owner: fact.owner,
    facet: fact.facet,
    value_sha256: sha256Canonical(fact.value),
  };
}

// ---------------------------------------------------------------------------------------------
// 6. All-enrolled members: every kind, provider (registered or dormant), owner/facet, route, Close, trigger and Epistemic path
// ---------------------------------------------------------------------------------------------

export interface Member {
  /** `FAMILY:id`, the stable identity used by certificates and the report */
  readonly key: string;
  readonly family: MemberFamily;
  readonly id: string;
  readonly owner: string | null;
  readonly facet: string | null;
}

const memberOf = (
  family: MemberFamily,
  id: string,
  owner: string | null = null,
  facet: string | null = null,
): Member => ({ key: `${family}:${id}`, family, id, owner, facet });

export const providerId = (p: { readonly owner: string; readonly operation: string }): string =>
  `${p.owner}|${p.operation}`;

/**
 * The all-enrolled member list derived mechanically from the verified manifest. No count, owner or provider is hard-coded: a new kind,
 * provider, route, Close, trigger or access class in a new manifest is a new member that has NO certificate and therefore refuses.
 */
export function enumerateMembers(m: GmWaitCatalogueManifestV2): readonly Member[] {
  const out: Member[] = [];
  for (const k of m.kinds) out.push(memberOf("KIND", k.id, k.owner, k.facet));
  for (const p of m.providers) out.push(memberOf("PROVIDER", providerId(p), p.owner, p.facet));
  for (const o of m.policy.owner_policy.owners)
    for (const f of o.facets) out.push(memberOf("OWNER_FACET", `${o.owner}|${f}`, o.owner, f));
  for (const s of m.sites) out.push(memberOf("SITE", s.site_id));
  for (const r of m.object_routes) out.push(memberOf("OBJECT_ROUTE", r.route_id));
  for (const c of m.closes) out.push(memberOf("CLOSE", c.name_expr));
  for (const e of m.event_triggers) out.push(memberOf("EVENT_TRIGGER", e.kind));
  for (const a of m.policy.audience_projection.access_classes)
    out.push(memberOf("ACCESS_CLASS", a));
  for (const a of m.policy.audience_projection.audience_fact_kind_ids)
    out.push(memberOf("AUDIENCE_FACT_KIND", a));
  out.push(memberOf("CULTURE_ROUTE", m.culture_route.provider));
  out.push(memberOf("EXTENSION_DISPATCH", m.extension_dispatch.function));
  out.push(memberOf("HISTORICAL_POLICY", "canonical"));
  for (const r of EPISTEMIC_SOURCE_ROUTES)
    out.push(memberOf("EPISTEMIC_ROUTE", r, "epistemic_access", "epistemic_access"));
  return out.sort((a, b) => cmp(a.key, b.key));
}

/** Which obligations a member family must close on its OWN evidence. Composite families close only through their constituents. */
const DIRECT_OBLIGATIONS: Readonly<Record<MemberFamily, readonly Obligation[]>> = {
  KIND: OBLIGATIONS,
  PROVIDER: OBLIGATIONS,
  CLOSE: [
    "IDENTITY",
    "SOURCE_POLICY",
    "OWNER_STAGE_ROUTE",
    "EFFECT_CLOSE_INVALIDATOR",
    "NEGATIVE_TWINS",
    "HISTORICAL_POLICY",
  ],
  EPISTEMIC_ROUTE: [
    "IDENTITY",
    "SOURCE_POLICY",
    "RECIPIENT_KNOWLEDGE_LATENCY",
    "RECIPIENT_ABILITY",
    "FIRST_PC_OPTION",
    "NEGATIVE_TWINS",
    "HISTORICAL_POLICY",
  ],
  OWNER_FACET: ["IDENTITY"],
  SITE: ["IDENTITY"],
  EVENT_TRIGGER: ["IDENTITY"],
  ACCESS_CLASS: ["IDENTITY"],
  AUDIENCE_FACT_KIND: ["IDENTITY"],
  CULTURE_ROUTE: ["IDENTITY"],
  OBJECT_ROUTE: ["IDENTITY"],
  EXTENSION_DISPATCH: ["IDENTITY"],
  HISTORICAL_POLICY: ["IDENTITY", "HISTORICAL_POLICY"],
};

/** The constituents through which a composite member closes (empty = nothing in the census attributes any constituent to it). */
export function constituentsOf(m: GmWaitCatalogueManifestV2, member: Member): readonly string[] {
  switch (member.family) {
    case "OWNER_FACET":
      return [
        ...m.kinds
          .filter((k) => k.owner === member.owner && k.facet === member.facet)
          .map((k) => `KIND:${k.id}`),
        ...m.providers
          .filter((p) => p.owner === member.owner && p.facet === member.facet)
          .map((p) => `PROVIDER:${providerId(p)}`),
      ];
    case "EVENT_TRIGGER": {
      const t = m.event_triggers.find((e) => e.kind === member.id);
      return t === undefined
        ? []
        : [`PROVIDER:${t.provider}`, "EPISTEMIC_ROUTE:DIRECT_OBSERVATION"];
    }
    case "CULTURE_ROUTE":
      return [`PROVIDER:${m.culture_route.provider}`];
    case "ACCESS_CLASS":
      return EPISTEMIC_SOURCE_ROUTES.map((r) => `EPISTEMIC_ROUTE:${r}`);
    case "AUDIENCE_FACT_KIND":
      return ["EPISTEMIC_ROUTE:BROADCAST_EXPOSURE", "EPISTEMIC_ROUTE:AUDIENCE_PROJECTION"];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------
// 7. Verdicts
// ---------------------------------------------------------------------------------------------

export interface ObligationResult {
  readonly obligation: Obligation;
  readonly status: "CLOSED" | "OPEN";
  readonly reason: ReasonCode | "CLOSED";
  readonly detail?: string;
  /** a closure that depended on a labelled test-double authority */
  readonly fixture?: true;
}

export type MemberStatus = "PROOF_CLOSED_CANDIDATE" | "NOT_PROVEN";

export interface MemberVerdict {
  readonly member: string;
  /** the catalogue digest the verdict was issued against: a verdict is about a member of THAT catalogue and no other */
  readonly catalogue_sha256: string;
  readonly status: MemberStatus;
  readonly obligations: readonly ObligationResult[];
  readonly fixture_dependent: boolean;
}

/**
 * A PROOF_CLOSED_CANDIDATE can only be issued by `issueVerdict` in this module: a forged object literal is not in the registry and is
 * refused by `isIssuedProofClosed`. The evaluator accepts only issued verdicts.
 */
const ISSUED = new WeakSet<object>();

function issueVerdict(
  member: string,
  catalogueSha256: string,
  obligations: readonly ObligationResult[],
  expectedObligations: readonly Obligation[],
): MemberVerdict {
  const closed = expectedObligations.every((o) =>
    obligations.some((r) => r.obligation === o && r.status === "CLOSED"),
  );
  const v: MemberVerdict = Object.freeze({
    member,
    catalogue_sha256: catalogueSha256,
    status: closed ? ("PROOF_CLOSED_CANDIDATE" as const) : ("NOT_PROVEN" as const),
    obligations: Object.freeze([...obligations]),
    fixture_dependent: obligations.some((r) => r.fixture === true),
  });
  if (closed) ISSUED.add(v);
  return v;
}

export const isIssuedProofClosed = (v: unknown): v is MemberVerdict =>
  typeof v === "object" && v !== null && ISSUED.has(v);

const open = (obligation: Obligation, reason: ReasonCode, detail?: string): ObligationResult =>
  detail === undefined
    ? { obligation, status: "OPEN", reason }
    : { obligation, status: "OPEN", reason, detail };
const closedResult = (obligation: Obligation, fixture = false): ObligationResult =>
  fixture
    ? { obligation, status: "CLOSED", reason: "CLOSED", fixture: true }
    : { obligation, status: "CLOSED", reason: "CLOSED" };

// ---------------------------------------------------------------------------------------------
// 8. Per-obligation verification
// ---------------------------------------------------------------------------------------------

interface Env {
  readonly m: GmWaitCatalogueManifestV2;
  readonly digest: string;
  readonly digestVerdict: DigestVerdict;
  readonly drift: "CHECKED_CLEAN" | "UNCHECKED" | "DETECTED";
  readonly ctx: CheckerContext;
}

const evidenceOf = (
  cert: MemberCertificate,
  o: Exclude<Obligation, "IDENTITY">,
): readonly EvidenceRef[] | undefined => cert.claims[o]?.evidence;

function lookupProvider(m: GmWaitCatalogueManifestV2, member: Member) {
  return m.providers.find((p) => providerId(p) === member.id);
}
function lookupKind(m: GmWaitCatalogueManifestV2, member: Member) {
  return m.kinds.find((k) => k.id === member.id);
}

function identityResult(env: Env, member: Member): ObligationResult {
  const { m } = env;
  if (env.digestVerdict !== "OK_CURRENT")
    return open("IDENTITY", "DIGEST_NOT_CURRENT", env.digestVerdict);
  let present = false;
  let ownerFacetOk = true;
  switch (member.family) {
    case "KIND": {
      const k = lookupKind(m, member);
      present = k !== undefined;
      ownerFacetOk = k === undefined || (k.owner === member.owner && k.facet === member.facet);
      break;
    }
    case "PROVIDER": {
      const p = lookupProvider(m, member);
      present = p !== undefined;
      ownerFacetOk = p === undefined || (p.owner === member.owner && p.facet === member.facet);
      break;
    }
    case "OWNER_FACET":
      present = m.policy.owner_policy.owners.some(
        (o) => o.owner === member.owner && o.facets.includes(member.facet ?? ""),
      );
      break;
    case "SITE":
      present = m.sites.some((s) => s.site_id === member.id);
      break;
    case "OBJECT_ROUTE":
      present = m.object_routes.some((r) => r.route_id === member.id);
      break;
    case "CLOSE":
      present = m.closes.some((c) => c.name_expr === member.id);
      break;
    case "EVENT_TRIGGER":
      present = m.event_triggers.some((e) => e.kind === member.id);
      break;
    case "ACCESS_CLASS":
      present = m.policy.audience_projection.access_classes.includes(member.id);
      break;
    case "AUDIENCE_FACT_KIND":
      present = m.policy.audience_projection.audience_fact_kind_ids.includes(member.id);
      break;
    case "CULTURE_ROUTE":
      present = m.culture_route.provider === member.id;
      break;
    case "EXTENSION_DISPATCH":
      present = m.extension_dispatch.function === member.id;
      break;
    case "HISTORICAL_POLICY":
      present = member.id === "canonical";
      break;
    case "EPISTEMIC_ROUTE":
      present = (EPISTEMIC_SOURCE_ROUTES as readonly string[]).includes(member.id);
      break;
  }
  if (!present) return open("IDENTITY", "MEMBER_NOT_IN_MANIFEST", member.key);
  if (!ownerFacetOk) return open("IDENTITY", "MEMBER_OWNER_FACET_MISMATCH", member.key);
  if (env.drift === "DETECTED") return open("IDENTITY", "CODE_DRIFT_DETECTED");

  return closedResult("IDENTITY");
}

function sourcePolicyResult(
  env: Env,
  member: Member,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  if (evidence === undefined) return open("SOURCE_POLICY", "CLAIM_ABSENT");
  const clauses = evidence.filter((e) => e.kind === "SOURCE_CLAUSE");
  for (const c of clauses) {
    const v = verifySourceClause(c);
    if (v !== "OK") return open("SOURCE_POLICY", v, `${c.page_uuid} ${c.clause}`);
  }
  if (
    !clauses.some((c) =>
      P7_AUTHORITY_CLAUSES.some(([page, clause]) => c.page_uuid === page && c.clause === clause),
    )
  )
    return open("SOURCE_POLICY", "SOURCE_AUTHORITY_MISSING");
  // a kind or provider must cite ITS OWN registered rule reference from the verified catalogue
  const k = member.family === "KIND" ? lookupKind(env.m, member) : undefined;
  const p = member.family === "PROVIDER" ? lookupProvider(env.m, member) : undefined;
  const own = k !== undefined ? [k.rule_ref] : p !== undefined ? [p.rule_ref] : undefined;
  if (own !== undefined) {
    const refs = evidence.filter((e) => e.kind === "RULE_REF");
    if (refs.length === 0) return open("SOURCE_POLICY", "RULE_REF_MISSING");
    for (const r of refs)
      if (!own.includes(r.rule_id)) return open("SOURCE_POLICY", "RULE_REF_NOT_MEMBERS");
    if (!own.every((id) => refs.some((r) => r.rule_id === id)))
      return open("SOURCE_POLICY", "RULE_REF_MISSING");
  }
  return closedResult("SOURCE_POLICY");
}

/** The ONE original Temporal object the owner-stage claim rests on (a committed `temporal_object` fact of the Temporal owner). */
function temporalWitness(
  env: Env,
  evidence: readonly EvidenceRef[],
):
  | { ok: true; object: TemporalObject; ref: OwnerFactRef }
  | { ok: false; result: ReasonCode; detail: string } {
  const refs = evidence.filter(
    (e): e is OwnerFactRef => e.kind === "OWNER_FACT" && e.owner === OWNER_TEMPORAL_KERNEL,
  );
  if (refs.length !== 1)
    return {
      ok: false,
      result: "EVIDENCE_KIND_MISSING",
      detail: "exactly one Temporal object fact",
    };
  const ref = refs[0]!;
  const read = readOwnerFact(ref, env.ctx.ledger, env.m);
  if (!read.ok) return { ok: false, result: read.reason, detail: read.detail };
  const parsed = TemporalObjectSchema.safeParse(read.fact.value);
  if (!parsed.success) return { ok: false, result: "WITNESS_VALUE_INVALID", detail: ref.key };
  return { ok: true, object: parsed.data, ref };
}

function matchedDependency(env: Env, member: Member, object: TemporalObject) {
  const { m } = env;
  if (member.family === "PROVIDER") {
    const p = lookupProvider(m, member);
    if (p === undefined) return undefined;
    return object.dependencies.find(
      (d) =>
        d.stage.owner_operation.owner === p.owner &&
        d.stage.owner_operation.operation === p.operation,
    );
  }
  if (member.family === "KIND") {
    const k = lookupKind(m, member);
    if (k === undefined) return undefined;
    const re = new RegExp(k.key_pattern.source, k.key_pattern.flags);
    return object.dependencies.find((d) => d.produces.some((key) => re.test(key)));
  }
  if (member.family === "CLOSE") {
    const c = m.closes.find((x) => x.name_expr === member.id);
    if (c === undefined || c.name_value === null) return undefined;
    return object.dependencies.find((d) => d.declares_close?.name === c.name_value);
  }
  return undefined;
}

function stageRouteResult(
  env: Env,
  member: Member,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  if (evidence === undefined) return open("OWNER_STAGE_ROUTE", "CLAIM_ABSENT");
  const w = temporalWitness(env, evidence);
  if (!w.ok) return open("OWNER_STAGE_ROUTE", w.result, w.detail);
  if (matchedDependency(env, member, w.object) === undefined)
    return open("OWNER_STAGE_ROUTE", "STAGE_NOT_DECLARED_BY_MEMBER", w.ref.key);
  return closedResult("OWNER_STAGE_ROUTE");
}

function effectResult(
  env: Env,
  member: Member,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  if (evidence === undefined) return open("EFFECT_CLOSE_INVALIDATOR", "CLAIM_ABSENT");
  const w = temporalWitness(env, evidence);
  if (!w.ok) return open("EFFECT_CLOSE_INVALIDATOR", w.result, w.detail);
  const d = matchedDependency(env, member, w.object);
  if (d === undefined)
    return open("EFFECT_CLOSE_INVALIDATOR", "STAGE_NOT_DECLARED_BY_MEMBER", w.ref.key);
  const { m } = env;
  // every produced key must lie in a registered kind of the member's own owner/facet (and, for a kind, be that kind)
  const p = member.family === "PROVIDER" ? lookupProvider(m, member) : undefined;
  for (const key of d.produces) {
    const kind = kindForKey(m, key);
    if (kind === undefined)
      return open("EFFECT_CLOSE_INVALIDATOR", "EFFECT_OUTSIDE_MEMBER_KINDS", key);
    if (
      p !== undefined &&
      (kind.owner !== p.owner || kind.facet !== p.facet || !p.effect_kind_ids.includes(kind.id))
    )
      return open("EFFECT_CLOSE_INVALIDATOR", "EFFECT_OUTSIDE_MEMBER_KINDS", key);
    if (
      member.family === "KIND" &&
      kind.id !== member.id &&
      !d.produces.some((k) => kindForKey(m, k)?.id === member.id)
    )
      return open("EFFECT_CLOSE_INVALIDATOR", "EFFECT_OUTSIDE_MEMBER_KINDS", key);
  }
  if (d.declares_close !== null && !m.closes.some((c) => c.name_value === d.declares_close!.name))
    return open("EFFECT_CLOSE_INVALIDATOR", "CLOSE_NOT_IN_CENSUS", d.declares_close.name);
  if (d.reads.length > 0 && d.reads.every((r) => r.invalidators.length === 0))
    return open("EFFECT_CLOSE_INVALIDATOR", "INVALIDATORS_UNDECLARED", w.ref.key);
  return closedResult("EFFECT_CLOSE_INVALIDATOR");
}

/** The outcome of reading ONE access candidate from original owner facts and the owner's own pure derivation. */
export type CandidateKnowledge =
  | {
      readonly ok: true;
      readonly event_key: string;
      readonly recipient: string;
      /** F-014D access-established basis time: the earliest the recipient's lawful access exists */
      readonly established_at: CanonicalTime;
    }
  | { readonly ok: false; readonly reason: ReasonCode; readonly detail: string };

/**
 * Derives, for one committed access event, whether the operative PC lawfully receives an intelligible payload, WITHOUT consulting any
 * prediction: the event fact and (where the payload's form depends on one) the recipient's capability fact are re-read from the ledger,
 * and the Epistemic owner's own pure derivation (`deriveAccessProducts`) decides whether a packet can form. A BROADCAST_EXPOSURE event
 * is never individual receipt. The temporal object that declares the packet stage must equal the owner's own derived declaration.
 */
export function readCandidateKnowledge(
  m: GmWaitCatalogueManifestV2,
  ledger: EvidenceLedger,
  eventRef: OwnerFactRef,
  pcId: string,
  object: TemporalObject | null,
): CandidateKnowledge {
  const read = readOwnerFact(eventRef, ledger, m);
  if (!read.ok) return { ok: false, reason: read.reason, detail: read.detail };
  const fact = read.fact;
  const dissemination = AccessDisseminationEventSchema.safeParse(fact.value);
  if (dissemination.success && isBroadcastEvent(dissemination.data))
    return { ok: false, reason: "BROADCAST_NOT_RECEIPT", detail: fact.key };
  const parsed = AccessEventSchema.safeParse(fact.value);
  if (!parsed.success) return { ok: false, reason: "EVENT_NOT_BOUNDED_ACCESS", detail: fact.key };
  const event = parsed.data;
  if (fact.key !== accessEventKey(event.event_id))
    return { ok: false, reason: "WITNESS_VALUE_INVALID", detail: fact.key };
  if (event.participants[0] !== pcId)
    return { ok: false, reason: "WRONG_RECIPIENT", detail: fact.key };
  let capability: Parameters<typeof deriveAccessProducts>[0]["capability"] = null;
  const need = requiredCapability(event);
  if (need !== null) {
    const capFact = ledger.get(need.key);
    if (capFact === undefined)
      return { ok: false, reason: "RECEIPT_NOT_DERIVABLE", detail: "capability fact absent" };
    const capKind = kindForKey(m, capFact.key);
    if (capKind === undefined || capKind.owner !== capFact.owner || capKind.facet !== capFact.facet)
      return { ok: false, reason: "EVIDENCE_KEY_NOT_REGISTERED", detail: capFact.key };
    capability = {
      fact: {
        key: capFact.key,
        owner: capFact.owner,
        version: capFact.version,
        value: capFact.value as never,
      },
      committed_by: capFact.provenance.group_id,
    };
  }
  const derived = deriveAccessProducts({
    event: { key: fact.key, owner: fact.owner, version: fact.version, value: event },
    capability,
  });
  if (!derived.ok)
    return { ok: false, reason: "RECEIPT_NOT_DERIVABLE", detail: derived.error.message };
  if (object !== null) {
    const declared = epistemicPacketDeclaration(event);
    if (!object.dependencies.some((d) => canonicalEqual(d, declared)))
      return { ok: false, reason: "DECLARATION_MISMATCH", detail: fact.key };
  }
  return {
    ok: true,
    event_key: fact.key,
    recipient: pcId,
    established_at: event.established_at,
  };
}

/**
 * The recipient / knowledge-time / latency witness differs by Epistemic route, because the routes differ in what they can lawfully prove:
 *   - a BOUNDED access reaching the PC through a scheduled packet formation (the generic route and NON_OBSERVATION_ACCESS): the Temporal
 *     object that declares the formation plus the committed event, receipt re-derived by the Epistemic owner's own derivation;
 *   - DIRECT_OBSERVATION: an observation-earned event only (its formation is a NOW-only event trigger with no indexed boundary);
 *   - BROADCAST_EXPOSURE / AUDIENCE_PROJECTION: a committed BROADCAST_EXPOSURE event, whose witness is that it is NEVER individual receipt.
 * An event of the wrong route is refused for its own reason; none is a stand-in for another.
 */
function knowledgeResult(
  env: Env,
  member: Member,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  const o = "RECIPIENT_KNOWLEDGE_LATENCY" as const;
  if (evidence === undefined) return open(o, "CLAIM_ABSENT");
  const route = member.family === "EPISTEMIC_ROUTE" ? member.id : null;
  const facts = evidence.filter(
    (e): e is OwnerFactRef => e.kind === "OWNER_FACT" && e.owner !== OWNER_TEMPORAL_KERNEL,
  );
  if (facts.length !== 1) return open(o, "EVIDENCE_KIND_MISSING", "exactly one access event fact");
  const eventRef = facts[0]!;
  if (route === "BROADCAST_EXPOSURE" || route === "AUDIENCE_PROJECTION") {
    const read = readOwnerFact(eventRef, env.ctx.ledger, env.m);
    if (!read.ok) return open(o, read.reason, read.detail);
    const parsed = AccessDisseminationEventSchema.safeParse(read.fact.value);
    if (!parsed.success || !isBroadcastEvent(parsed.data))
      return open(o, "EVENT_NOT_BROADCAST", eventRef.key);
    if (route === "AUDIENCE_PROJECTION") {
      const audience = kindForKey(env.m, parsed.data.audience.fact_key);
      if (
        audience === undefined ||
        !env.m.policy.audience_projection.audience_fact_kind_ids.includes(audience.id)
      )
        return open(o, "AUDIENCE_KIND_NOT_ENROLLED", parsed.data.audience.fact_key);
    }
    return closedResult(o);
  }
  if (env.ctx.pc === undefined) return open(o, "PC_CONTEXT_ABSENT");
  const pcId = env.ctx.pc.entity_id;
  if (route === "DIRECT_OBSERVATION") {
    const k = readCandidateKnowledge(env.m, env.ctx.ledger, eventRef, pcId, null);
    if (!k.ok) return open(o, k.reason, k.detail);
    const eventFact = env.ctx.ledger.get(eventRef.key)!;
    if (!isObservationEarnedFact(eventFact))
      return open(o, "EVENT_NOT_OBSERVATION_EARNED", eventRef.key);
    // P7-E1: derivable is not committed. The route closes only when the actual journal shows the receipt the owner committed.
    const witness = env.ctx.nativeObservation;
    if (witness === undefined) return open(o, "NATIVE_RECEIPT_EVIDENCE_ABSENT", eventRef.key);
    const native = witness.verify({ event: eventFact, pc_id: pcId });
    if (!native.ok) return open(o, "NATIVE_RECEIPT_NOT_PROVEN", `${native.code}: ${native.detail}`);
    return closedResult(o);
  }
  const w = temporalWitness(env, evidence);
  if (!w.ok) return open(o, w.result, w.detail);
  const k = readCandidateKnowledge(env.m, env.ctx.ledger, eventRef, pcId, w.object);
  if (!k.ok) return open(o, k.reason, k.detail);
  if (
    route === "NON_OBSERVATION_ACCESS" &&
    isObservationEarnedFact(env.ctx.ledger.get(eventRef.key)!)
  )
    return open(o, "EVENT_OBSERVATION_EARNED", eventRef.key);
  // information latency (Temporal 10; F-014D 2.1): the recipient's knowledge time is the later of the access-established basis and the
  // packet-formation boundary, and a packet cannot form before the access it renders exists. The `creates_epistemic_interruption:
  // false` literal of the object is NOT latency evidence: an object without an earned boundary has no latency path to read.
  const boundary = w.object.next_boundary;
  if (boundary === null) return open(o, "LATENCY_LITERAL_NOT_PROOF", w.ref.key);
  if (k.established_at.unit !== boundary.at.unit)
    return open(o, "CLOCK_UNIT_MISMATCH", k.event_key);
  if (boundary.at.value < k.established_at.value)
    return open(o, "PACKET_PRECEDES_ACCESS", k.event_key);
  return closedResult(o);
}

function abilityResult(env: Env, evidence: readonly EvidenceRef[] | undefined): ObligationResult {
  const o = "RECIPIENT_ABILITY" as const;
  if (evidence === undefined) return open(o, "CLAIM_ABSENT");
  if (env.ctx.pc === undefined || env.ctx.cut === undefined) return open(o, "PC_CONTEXT_ABSENT");
  const authority = env.ctx.abilityAuthority ?? NO_HEALTH_OWNER_AUTHORITY;
  const cited = evidence.filter(
    (e): e is Extract<EvidenceRef, { kind: "AUTHORITY_READING" }> =>
      e.kind === "AUTHORITY_READING" && e.obligation === o,
  );
  if (cited.length !== 1 || cited[0]!.authority_id !== authority.id)
    return open(o, "AUTHORITY_READING_MISMATCH", authority.id);
  const r = authority.read(
    { pc_id: env.ctx.pc.entity_id, modality: "SPEECH", at: env.ctx.cut },
    env.ctx.ledger,
  );
  if (r.authority_id !== authority.id) return open(o, "AUTHORITY_READING_MISMATCH", r.authority_id);
  // the member route is certified when the ability dimension is DETERMINATE (the owner can say available or impaired); an unknown
  // reading is no evidence at all. Whether THIS PC is able at THIS instant is an instance result of the evaluator, not a member property.
  if (r.state === "UNKNOWN") return open(o, "ABILITY_UNKNOWN", r.authority_id);
  return closedResult(o, r.fixture);
}

function firstOptionResult(
  env: Env,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  const o = "FIRST_PC_OPTION" as const;
  if (evidence === undefined) return open(o, "CLAIM_ABSENT");
  if (env.ctx.pc === undefined || env.ctx.cut === undefined) return open(o, "PC_CONTEXT_ABSENT");
  const authority = env.ctx.firstOptionAuthority ?? NO_PROVEN_FIRST_OPTION_AUTHORITY;
  const cited = evidence.filter(
    (e): e is Extract<EvidenceRef, { kind: "AUTHORITY_READING" }> =>
      e.kind === "AUTHORITY_READING" && e.obligation === o,
  );
  if (cited.length !== 1 || cited[0]!.authority_id !== authority.id)
    return open(o, "AUTHORITY_READING_MISMATCH", authority.id);
  const r = authority.read(
    { pc_id: env.ctx.pc.entity_id, modality: "SPEECH", at: env.ctx.cut },
    env.ctx.ledger,
  );
  if (r.authority_id !== authority.id) return open(o, "AUTHORITY_READING_MISMATCH", r.authority_id);
  if (r.state !== "AVAILABLE_AT") return open(o, "FIRST_OPTION_UNPROVEN", r.authority_id);
  return closedResult(o, r.fixture);
}

function twinsResult(env: Env, evidence: readonly EvidenceRef[] | undefined): ObligationResult {
  const o = "NEGATIVE_TWINS" as const;
  if (evidence === undefined) return open(o, "CLAIM_ABSENT");
  const twins = evidence.filter(
    (e): e is Extract<EvidenceRef, { kind: "TWIN_ABSENCE" }> => e.kind === "TWIN_ABSENCE",
  );
  for (const cls of NEGATIVE_TWIN_CLASSES)
    if (!twins.some((t) => t.twin === cls)) return open(o, "TWIN_CLASS_MISSING", cls);
  for (const t of twins) {
    const ledger = env.ctx.twins?.get(t.ledger_id);
    if (ledger === undefined) return open(o, "TWIN_LEDGER_UNKNOWN", t.ledger_id);
    // the twin must be a different history: the witnessed key is committed in the real ledger and ABSENT in the twin
    if (env.ctx.ledger.get(t.key) === undefined)
      return open(o, "TWIN_NOT_ABSENT", `${t.key} is not committed in the ledger`);
    if (ledger.get(t.key) !== undefined)
      return open(o, "TWIN_NOT_ABSENT", `${t.key} present in ${t.ledger_id}`);
  }
  return closedResult(o);
}

function historyResult(
  env: Env,
  member: Member,
  evidence: readonly EvidenceRef[] | undefined,
): ObligationResult {
  const o = "HISTORICAL_POLICY" as const;
  // N9.7 / T85: the extension-owned group is never historically verified in this source; nothing can close it here
  if (member.family === "EXTENSION_DISPATCH") return open(o, "EXTENSION_HISTORY_SKIPPED_IN_SOURCE");
  if (evidence === undefined) return open(o, "CLAIM_ABSENT");
  const history = env.ctx.history ?? NO_RETIRED_HISTORY;
  const segments = evidence.filter(
    (e): e is Extract<EvidenceRef, { kind: "HISTORY_SEGMENT" }> => e.kind === "HISTORY_SEGMENT",
  );
  if (segments.length === 0) return open(o, "EVIDENCE_KIND_MISSING", "a retained history segment");
  for (const s of segments)
    if (!history.verifiesSegment(s.segment_id)) return open(o, "HISTORY_NOT_RETIRED", s.segment_id);
  return closedResult(o, history.fixture);
}

// ---------------------------------------------------------------------------------------------
// 9. The report
// ---------------------------------------------------------------------------------------------

export interface ReportInput extends CheckerContext {
  /** untrusted presented certificates */
  readonly certificates: readonly unknown[];
}

function parseCertificates(certificates: readonly unknown[]): {
  readonly byMember: ReadonlyMap<
    string,
    readonly (MemberCertificate | { invalid: ReasonCode; detail: string })[]
  >;
} {
  const byMember = new Map<
    string,
    (MemberCertificate | { invalid: ReasonCode; detail: string })[]
  >();
  const add = (k: string, v: MemberCertificate | { invalid: ReasonCode; detail: string }) => {
    const list = byMember.get(k);
    if (list === undefined) byMember.set(k, [v]);
    else list.push(v);
  };
  for (const raw of certificates) {
    const hint =
      typeof raw === "object" && raw !== null && "member" in raw
        ? (raw as { member?: { family?: unknown; id?: unknown } }).member
        : undefined;
    const key =
      typeof hint?.family === "string" && typeof hint.id === "string"
        ? `${hint.family}:${hint.id}`
        : "?";
    const selfAsserted = selfAssertedVerdictPaths(raw);
    if (selfAsserted.length > 0) {
      add(key, { invalid: "SELF_ASSERTED_VERDICT", detail: selfAsserted.join(",") });
      continue;
    }
    const parsed = MemberCertificateSchema.safeParse(raw);
    if (!parsed.success) {
      add(key, {
        invalid: "CERT_SCHEMA_INVALID",
        detail: parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      continue;
    }
    add(`${parsed.data.member.family}:${parsed.data.member.id}`, parsed.data);
  }
  return { byMember };
}

function checkMemberDirect(
  env: Env,
  member: Member,
  certs: readonly (MemberCertificate | { invalid: ReasonCode; detail: string })[] | undefined,
  manifestOk: boolean,
): readonly ObligationResult[] {
  const required = DIRECT_OBLIGATIONS[member.family];
  const out: ObligationResult[] = [];
  const identity = manifestOk ? identityResult(env, member) : open("IDENTITY", "MANIFEST_INVALID");
  out.push(identity);
  const certRequired = required.filter(
    (o): o is Exclude<Obligation, "IDENTITY"> => o !== "IDENTITY",
  );
  if (certRequired.length === 0) return out;
  const failAll = (reason: ReasonCode, detail?: string) => {
    for (const o of certRequired) out.push(open(o, reason, detail));
    return out;
  };
  if (certs === undefined || certs.length === 0) return failAll("NO_CERTIFICATE");
  if (certs.length > 1) return failAll("CERT_DUPLICATE", String(certs.length));
  const cert = certs[0]!;
  if ("invalid" in cert) return failAll(cert.invalid, cert.detail);
  if (cert.member.family !== member.family || cert.member.id !== member.id)
    return failAll("CERT_MEMBER_MISMATCH");
  if (cert.catalogue_sha256 !== env.digest)
    return failAll("CERT_CATALOGUE_MISMATCH", cert.catalogue_sha256);
  for (const o of certRequired) {
    const ev = evidenceOf(cert, o);
    switch (o) {
      case "SOURCE_POLICY":
        out.push(sourcePolicyResult(env, member, ev));
        break;
      case "OWNER_STAGE_ROUTE":
        out.push(stageRouteResult(env, member, ev));
        break;
      case "EFFECT_CLOSE_INVALIDATOR":
        out.push(effectResult(env, member, ev));
        break;
      case "RECIPIENT_KNOWLEDGE_LATENCY":
        out.push(knowledgeResult(env, member, ev));
        break;
      case "RECIPIENT_ABILITY":
        out.push(abilityResult(env, ev));
        break;
      case "FIRST_PC_OPTION":
        out.push(firstOptionResult(env, ev));
        break;
      case "NEGATIVE_TWINS":
        out.push(twinsResult(env, ev));
        break;
      case "HISTORICAL_POLICY":
        out.push(historyResult(env, member, ev));
        break;
    }
  }
  return out;
}

export interface MemberReportRow {
  readonly member: string;
  readonly family: MemberFamily;
  readonly owner: string | null;
  readonly facet: string | null;
  readonly status: MemberStatus;
  readonly signature: number;
}
export interface OpenSignature {
  readonly id: number;
  /** obligation -> reason (+ detail where it names the member-specific obstacle) */
  readonly open: Readonly<Record<string, string>>;
  readonly members: number;
}
export type AggregateBlocker =
  | "EVALUATOR_NOT_INTEGRATED"
  | "FULL_P7_AND_S4_HOLD"
  | "MEMBER_PROOFS_OPEN"
  | "CODE_DRIFT_UNCHECKED"
  | "CODE_DRIFT_DETECTED"
  | "CATALOGUE_NOT_CURRENT"
  | "MANIFEST_INVALID"
  | "EXTENSION_HISTORY_UNRETIRED"
  | "FIXTURE_AUTHORITY_USED";

export interface Section10Report {
  readonly format: typeof P7_REPORT_FORMAT;
  readonly version: typeof P7_PROOF_VERSION;
  readonly status: typeof P7_STATUS;
  readonly catalogue: {
    readonly sha256: string | null;
    readonly digest_verdict: DigestVerdict | "NOT_COMPUTED";
    readonly manifest_version: number | null;
    readonly sentinels: {
      readonly epistemic: string;
      readonly default_disposition: string;
      readonly evaluator_id: string;
      readonly live_admission_id: string;
      readonly extension_historical_coverage: string;
    } | null;
    readonly code_drift: "CHECKED_CLEAN" | "UNCHECKED" | "DETECTED";
  };
  readonly aggregate: {
    readonly accepted: false;
    readonly status: "NOT_ACCEPTED";
    readonly blockers: readonly AggregateBlocker[];
  };
  readonly totals: {
    readonly members: number;
    readonly proof_closed_candidate: number;
    readonly not_proven: number;
  };
  readonly by_family: Readonly<Record<string, { members: number; closed: number; open: number }>>;
  readonly by_owner: readonly { owner: string; members: number; closed: number; open: number }[];
  readonly signatures: readonly OpenSignature[];
  readonly members: readonly MemberReportRow[];
  readonly fixture_dependent_members: readonly string[];
  /** presented certificates that name no enumerated member (an absent member, a wrong family or a stale id): each is denied */
  readonly unmatched_certificates: readonly string[];
  readonly supplied_by_later_work: readonly string[];
}

/**
 * What later, independently accepted work must supply before any member can close on production evidence. It is a statement of the
 * dependency order from the brief, not a plan to build any of it here.
 */
export const SUPPLIED_BY_LATER_WORK: readonly string[] = [
  "B3: the actual original-owner evidence and new kinds (a pending B3 candidate kind joins the census as a new UNDECLARED member and is not certified by existing on a draft branch)",
  "IF-6b: the original-owner stage witness for the stage route and the same-instant predecessor evidence",
  "P-5/P6: one genuine first native PC option and its original history (the first-option authority is unproven by default)",
  "R-H: an installed Health owner and a coverage anchor (the ability authority reads UNKNOWN by default)",
  "P-6/T85: per-segment original-policy identity and closure of the extension-owned history group (history is unretired by default)",
  "S4/full P-7: independent Source-Fidelity PASS, evaluator integration, genuine GM-host and retained-restart acceptance",
];

/** The report and, beside it, the verdicts the checker ISSUED (the only objects the evaluator accepts as route proofs). */
export interface Section10Result {
  readonly report: Section10Report;
  readonly verdicts: ReadonlyMap<string, MemberVerdict>;
}

export const buildSection10Report = (input: ReportInput): Section10Report =>
  checkSection10(input).report;

export function checkSection10(input: ReportInput): Section10Result {
  const blockers = new Set<AggregateBlocker>(["EVALUATOR_NOT_INTEGRATED", "FULL_P7_AND_S4_HOLD"]);
  const parsed = GmWaitCatalogueManifestV2Schema.safeParse(input.manifest);
  const empty = (reason: AggregateBlocker, manifestVersion: number | null): Section10Report => {
    blockers.add(reason);
    return {
      format: P7_REPORT_FORMAT,
      version: P7_PROOF_VERSION,
      status: P7_STATUS,
      catalogue: {
        sha256: null,
        digest_verdict: "NOT_COMPUTED",
        manifest_version: manifestVersion,
        sentinels: null,
        code_drift: "UNCHECKED",
      },
      aggregate: {
        accepted: false,
        status: "NOT_ACCEPTED",
        blockers: [...blockers].sort(cmp) as AggregateBlocker[],
      },
      totals: { members: 0, proof_closed_candidate: 0, not_proven: 0 },
      by_family: {},
      by_owner: [],
      signatures: [],
      members: [],
      fixture_dependent_members: [],
      unmatched_certificates: [],
      supplied_by_later_work: SUPPLIED_BY_LATER_WORK,
    };
  };
  if (!parsed.success) {
    const v =
      typeof input.manifest === "object" &&
      input.manifest !== null &&
      "manifest_version" in input.manifest
        ? Number((input.manifest as { manifest_version: unknown }).manifest_version)
        : null;
    return {
      report: empty("MANIFEST_INVALID", Number.isFinite(v) ? v : null),
      verdicts: new Map(),
    };
  }
  const m = parsed.data;
  const violations = validateManifest(m);
  const manifestOk = violations.length === 0;
  if (!manifestOk) blockers.add("MANIFEST_INVALID");
  let digest = "";
  let digestVerdict: DigestVerdict | "NOT_COMPUTED" = "NOT_COMPUTED";
  if (manifestOk) {
    digest = catalogueDigest(m);
    digestVerdict = verifySuppliedDigest(digest, input.authority);
    if (digestVerdict !== "OK_CURRENT") blockers.add("CATALOGUE_NOT_CURRENT");
  }
  let drift: Env["drift"] = "UNCHECKED";
  if (input.census !== undefined)
    drift =
      catalogueCoverageViolations(input.census, m).length === 0 ? "CHECKED_CLEAN" : "DETECTED";
  if (drift === "UNCHECKED") blockers.add("CODE_DRIFT_UNCHECKED");
  if (drift === "DETECTED") blockers.add("CODE_DRIFT_DETECTED");
  if (m.extension_dispatch.historical_coverage === "UNRETIRED_DENY")
    blockers.add("EXTENSION_HISTORY_UNRETIRED");

  const env: Env = {
    m,
    digest,
    digestVerdict: digestVerdict === "NOT_COMPUTED" ? "DIGEST_UNKNOWN" : digestVerdict,
    drift,
    ctx: input,
  };
  const { byMember } = parseCertificates(input.certificates);
  const members = enumerateMembers(m);
  const verdicts = new Map<string, MemberVerdict>();
  // direct members first
  for (const member of members) {
    if (isComposite(member.family)) continue;
    const results = checkMemberDirect(env, member, byMember.get(member.key), manifestOk);
    verdicts.set(
      member.key,
      issueVerdict(member.key, digest, results, DIRECT_OBLIGATIONS[member.family]),
    );
  }
  // composite members: identity plus every constituent proof-closed
  for (const member of members) {
    if (verdicts.has(member.key)) continue;
    const identity = manifestOk
      ? identityResult(env, member)
      : open("IDENTITY", "MANIFEST_INVALID");
    const parts = constituentsOf(m, member);
    const results: ObligationResult[] = [identity];
    if (member.family === "OBJECT_ROUTE" || member.family === "SITE") {
      // a registration site or an object-registration route is a code location: the census attributes providers to a site but not
      // WHICH route (due boundary, event trigger, raw or extension group) it opens, so no evidence can be attributed to it here
      results.push(open("OWNER_STAGE_ROUTE", "ROUTE_ATTRIBUTION_NOT_DEFINED"));
    } else if (member.family === "EXTENSION_DISPATCH") {
      results.push(open("HISTORICAL_POLICY", "EXTENSION_HISTORY_SKIPPED_IN_SOURCE"));
    } else if (parts.length === 0) {
      results.push(open("OWNER_STAGE_ROUTE", "NO_ATTRIBUTABLE_CONSTITUENT"));
    } else {
      const openParts = parts.filter((p) => verdicts.get(p)?.status !== "PROOF_CLOSED_CANDIDATE");
      results.push(
        openParts.length === 0
          ? closedResult("OWNER_STAGE_ROUTE")
          : open("OWNER_STAGE_ROUTE", "CONSTITUENT_OPEN", String(openParts.length)),
      );
    }
    const expected =
      member.family === "OBJECT_ROUTE" || member.family === "SITE"
        ? (["IDENTITY", "OWNER_STAGE_ROUTE"] as const)
        : member.family === "EXTENSION_DISPATCH"
          ? (["IDENTITY", "HISTORICAL_POLICY"] as const)
          : (["IDENTITY", "OWNER_STAGE_ROUTE"] as const);
    verdicts.set(member.key, issueVerdict(member.key, digest, results, expected));
  }
  const enumerated = new Set(members.map((x) => x.key));
  const unmatched = [...byMember.keys()].filter((k) => !enumerated.has(k)).sort(cmp);
  return {
    report: assemble(env, members, verdicts, blockers, digest, digestVerdict, drift, unmatched),
    verdicts,
  };
}

const isComposite = (f: MemberFamily): boolean =>
  f === "OWNER_FACET" ||
  f === "SITE" ||
  f === "EVENT_TRIGGER" ||
  f === "ACCESS_CLASS" ||
  f === "AUDIENCE_FACT_KIND" ||
  f === "CULTURE_ROUTE" ||
  f === "OBJECT_ROUTE" ||
  f === "EXTENSION_DISPATCH";

function assemble(
  env: Env,
  members: readonly Member[],
  verdicts: ReadonlyMap<string, MemberVerdict>,
  blockers: Set<AggregateBlocker>,
  digest: string,
  digestVerdict: DigestVerdict | "NOT_COMPUTED",
  drift: Env["drift"],
  unmatched: readonly string[],
): Section10Report {
  const sigIndex = new Map<string, number>();
  const sigs: { open: Record<string, string>; members: number }[] = [];
  const rows: MemberReportRow[] = [];
  const byFamily: Record<string, { members: number; closed: number; open: number }> = {};
  const byOwner = new Map<string, { members: number; closed: number; open: number }>();
  const fixtureMembers: string[] = [];
  let closed = 0;
  for (const member of members) {
    const v = verdicts.get(member.key)!;
    const openMap: Record<string, string> = {};
    for (const r of v.obligations) if (r.status === "OPEN") openMap[r.obligation] = r.reason;
    const sigKey = canonicalSig(openMap);
    let idx = sigIndex.get(sigKey);
    if (idx === undefined) {
      idx = sigs.length;
      sigIndex.set(sigKey, idx);
      sigs.push({ open: openMap, members: 0 });
    }
    sigs[idx]!.members += 1;
    const isClosed = v.status === "PROOF_CLOSED_CANDIDATE";
    if (isClosed) closed += 1;
    if (v.fixture_dependent) fixtureMembers.push(member.key);
    rows.push({
      member: member.key,
      family: member.family,
      owner: member.owner,
      facet: member.facet,
      status: v.status,
      signature: idx,
    });
    const f = (byFamily[member.family] ??= { members: 0, closed: 0, open: 0 });
    f.members += 1;
    if (isClosed) f.closed += 1;
    else f.open += 1;
    if (member.owner !== null) {
      const o = byOwner.get(member.owner) ?? { members: 0, closed: 0, open: 0 };
      o.members += 1;
      if (isClosed) o.closed += 1;
      else o.open += 1;
      byOwner.set(member.owner, o);
    }
  }
  if (closed < members.length) blockers.add("MEMBER_PROOFS_OPEN");
  if (fixtureMembers.length > 0) blockers.add("FIXTURE_AUTHORITY_USED");
  const m = env.m;
  return {
    format: P7_REPORT_FORMAT,
    version: P7_PROOF_VERSION,
    status: P7_STATUS,
    catalogue: {
      sha256: digest === "" ? null : digest,
      digest_verdict: digestVerdict,
      manifest_version: m.manifest_version,
      sentinels: {
        epistemic: m.policy.epistemic,
        default_disposition: m.policy.default_disposition,
        evaluator_id: m.policy.evaluator.id,
        live_admission_id: m.policy.live_admission.id,
        extension_historical_coverage: m.extension_dispatch.historical_coverage,
      },
      code_drift: drift,
    },
    aggregate: {
      accepted: false,
      status: "NOT_ACCEPTED",
      blockers: [...blockers].sort(cmp) as AggregateBlocker[],
    },
    totals: {
      members: members.length,
      proof_closed_candidate: closed,
      not_proven: members.length - closed,
    },
    by_family: Object.fromEntries(Object.entries(byFamily).sort(([a], [b]) => cmp(a, b))),
    by_owner: [...byOwner.entries()]
      .sort(([a], [b]) => cmp(a, b))
      .map(([owner, v]) => ({ owner, ...v })),
    signatures: sigs.map((s, id) => ({ id, open: s.open, members: s.members })),
    members: rows,
    fixture_dependent_members: fixtureMembers.sort(cmp),
    unmatched_certificates: unmatched,
    supplied_by_later_work: SUPPLIED_BY_LATER_WORK,
  };
}

const canonicalSig = (open: Record<string, string>): string =>
  JSON.stringify(Object.entries(open).sort(([a], [b]) => cmp(a, b)));

/** The boundary-index fact key and the Temporal object key space the evaluator and the audit read (re-exported for one source of truth). */
export const BOUNDARY_INDEX_KEY = TEMPORAL_BOUNDARY_INDEX_KEY;

// ---------------------------------------------------------------------------------------------
// 10. The later integration seam (a statement, not a wiring)
// ---------------------------------------------------------------------------------------------

/**
 * WHERE a later, separately authorized build attaches to this groundwork. NOTHING below is installed or reachable by this module, and
 * none of it may attach before full P-7 acceptance (independent Source-Fidelity PASS, evaluator integration, B3 and IF-6b accepted,
 * genuine GM host and retained-restart acceptance).
 *   S4 admission (new INITIAL, constant time)  - the fixed verified catalogue verdict/digest it reads today stays the ONLY T0 read; a
 *     future verdict derives from `buildSection10Report().aggregate` and remains NOT_ACCEPTED until every member is proof-closed and
 *     the evaluator is integrated. This module adds no T0 read, scan or future-schedule index.
 *   Inside an OPEN X, at an owner due boundary I  - the protected Temporal coordinator, before it credits time or publishes an owner
 *     effect that would pass the earliest feasible PC option, calls `evaluateEarliestChoice` (tests/support/p7-section10/evaluator.ts) on
 *     typed evidence read at the actual causal cut. Its only outputs are an internal private candidate; a non-actionable verdict still
 *     needs the GM's write-once verdict (Two-Blocker 8.1(3)) where comprehension, significance or standing-contingency discretion exists.
 *   Private pause / disclosed INTERRUPTED  - Two-Blocker 8.1(3)/(4) outcomes PAUSED and INTERRUPTED are written by their owner-bound
 *     writers (not here). The evaluator's candidate selects WHEN the first option is reached; the writers record WHAT happened.
 *   IF-6b original-owner stage witness  - supplies the stage-route evidence of OWNER_STAGE_ROUTE for the notice stage.
 *   B3 owner grants  - a new kind or provider enters `enumerateMembers` as a new member with no certificate.
 */
export const P7_INTEGRATION_SEAM_STATEMENT =
  "NONWRITING_GROUNDWORK_ONLY: attaches after full P-7 acceptance at S4 new-INITIAL catalogue verdict, the inside-X due boundary " +
  "(evaluateEarliestChoice), the owner-bound PAUSED/INTERRUPTED writers, the IF-6b stage witness and B3 owner kinds; none is installed";
