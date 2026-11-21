import {
  EXISTING_ACTOR_HANDOVER,
  GIP_SUNSET_ENROLLMENT_KEY,
  LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
  ORIGINAL_ACTIVATION,
  OWNER_GIP,
  EconomyFreightUseConsumptionSchema,
  GovernanceInstrumentSchema,
  LogisticsCommitmentSchema,
  LogisticsFreightDispatchEnrollmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  OwnerFactSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PcMovementCommitmentSchema,
  PcPhysicalLocusCustodySchema,
  PcStandingLedgerHeadSchema,
  PcStandingLedgerVersionSchema,
  PlayerCharacterBindingSchema,
  PopulationPcOccupancySchema,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  ResolutionTransactionSchema,
  SunsetEnrollmentSchema,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  EntityTransitionCloseSchema,
  FallbackPhysicalEntitySchema,
  PC_LEDGER_FIRST_SEQUENCE,
  gipInstrumentKey,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  economyFreightUseConsumptionKey,
  logisticsCommitmentKey,
  logisticsObjectId,
  logisticsTransferKey,
  pcCollectionRequestId,
  pcMovementCommitmentKey,
  pcMovementRequestId,
  pcMovementRequestKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  popPcOccupancyKey,
  productionExtractionKey,
  siOriginWitnessViolation,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  timeEquals,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type CanonicalTime,
  type OwnerFact,
  type PlayerCharacterBinding,
  type SiOriginViolation,
} from "@immortalis/contracts";
import {
  verifySuppliedDigest,
  staticVerdict,
  type DigestAuthority,
  type DigestVerdict,
  type GmWaitCatalogueManifest,
} from "./gm-wait-catalogue.ts";
import { sha256Canonical } from "./hash.ts";

/**
 * F-014B B1 S3 - the pure, authenticated-input-abstracted AS-OF-NOW classifier and spyable read oracle for the eight GM-wait T0
 * source categories (BLUE S2/S3 v6.2 sections 3 and 5; Successor v0.3 LC-04 and v0.4 E: seven general categories plus the eighth,
 * the fixed `temporal/origin` witness, for a genuinely fresh SI INITIAL only).
 *
 * MECHANISM ONLY, NON-WRITING, UNWIRED. It writes nothing, opens no authority, reads no clock and releases nothing. It authenticates
 * no GM: the authenticated GM/session/campaign binding does not exist yet, so the one place it would stand is a typed, labelled test
 * precondition (`UnauthenticatedGmBindingPrecondition`) that every result repeats as `NOT_PROVEN_TEST_PRECONDITION`. Success of a
 * classification means only "these present facts classify this way"; it is never a wait, an eligibility or a production permission.
 *
 * The oracle is the only way this module touches a fact source, and a fact source offers one capability: `getFact(key)`. Every key
 * is a fixed function of the request context and of values an EARLIER recorded read returned (a receipt names its own object), so
 * no future index, schedule, due count, boundary index or whole-world scan is reachable, and no key depends on any requested
 * duration or target (the request type excludes them). The legacy future-sensitive predicates (`isStationaryActivePc`,
 * `pcCollectionCrossingClear`, `gipEnrollmentPendingViolation`, `freightDispatchPendingViolation`) are deliberately not used.
 */

// ---------------------------------------------------------------------------------------------
// Classes and results (closed)
// ---------------------------------------------------------------------------------------------

export type S3Category = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Malformed is never absence: an unparseable source is INVALID, a version-0 witness is VALID_ABSENT. */
export type SourceClass = "VALID_ABSENT" | "COMPLETE" | "PENDING" | "INVALID";

export interface FactSource {
  getFact(key: string): OwnerFact | undefined;
}

export type ReadResult =
  | { readonly tag: "ABSENT"; readonly key: string }
  | { readonly tag: "PRESENT"; readonly key: string; readonly fact: OwnerFact }
  | { readonly tag: "MALFORMED"; readonly key: string };

export interface ReadWitness {
  readonly category: S3Category;
  readonly template: string;
  readonly key: string;
  readonly owner: string | null;
  /** 0 is a version-zero absence witness (the expected_version a later serialized publish would pin); -1 marks a malformed envelope */
  readonly version: number;
  readonly fact_sha256: string | null;
}
export interface ReadTrace {
  readonly reads: readonly ReadWitness[];
  /** templates the oracle refused (not derivable from earlier reads, not in the closed table, or over the read cap) */
  readonly refused_reads: readonly string[];
  /** the proof requirements a category-5 witness is judged against, and whether what was read proved each (empty until classified) */
  readonly proofs: readonly ProofRecord[];
}
export interface ProofRecord {
  readonly category: 5;
  readonly requirement: Cat5Requirement;
  readonly status: "PROVEN" | "UNPROVEN";
}

export interface OracleContext {
  readonly campaign_id: string;
  readonly pc_id: string;
  readonly transaction_id: string;
  readonly from_transaction: string | null;
}

// ---------------------------------------------------------------------------------------------
// The closed key-template table
// ---------------------------------------------------------------------------------------------

type Prior = ReadonlyMap<string, readonly ReadResult[]>;
interface Template {
  readonly id: string;
  readonly category: S3Category;
  /** the keys this template reads, in order; null when a needed earlier read did not yield the identity this key is derived from */
  readonly keys: (ctx: OracleContext, prior: Prior) => readonly string[] | null;
  /** PROVISIONAL source reading: BLUE has not named the exact fact kinds (category 5) */
  readonly provisional?: true;
}

const present = (prior: Prior, id: string, i = 0): OwnerFact | null => {
  const r = prior.get(id)?.[i];
  return r?.tag === "PRESENT" ? r.fact : null;
};

const custodyOf = (prior: Prior) => {
  const f = present(prior, "pc.custody");
  const p = f ? PcPhysicalLocusCustodySchema.safeParse(f.value) : null;
  return p?.success ? p.data : null;
};
const occupancyOf = (prior: Prior) => {
  const f = present(prior, "pc.occupancy");
  const p = f ? PopulationPcOccupancySchema.safeParse(f.value) : null;
  return p?.success ? p.data : null;
};
const extractionOf = (prior: Prior) => {
  const f = present(prior, "pc.extraction");
  const p = f ? ProductionExtractionSchema.safeParse(f.value) : null;
  return p?.success ? p.data : null;
};
const gipReceiptOf = (prior: Prior) => {
  const f = present(prior, "gip.receipt");
  const p = f ? SunsetEnrollmentSchema.safeParse(f.value) : null;
  return p?.success ? p.data : null;
};
const freightReceiptOf = (prior: Prior) => {
  const f = present(prior, "freight.receipt");
  const p = f ? LogisticsFreightDispatchEnrollmentSchema.safeParse(f.value) : null;
  return p?.success ? p.data : null;
};
const worldOf = (prior: Prior): string | null =>
  custodyOf(prior)?.stationary_locus.world.entity_id ?? null;

/**
 * Every key this module can read, by template. A template is a function of the context and of earlier recorded reads ONLY.
 * Category 5 is ONE row (PROVISIONAL, Q2): the PC's standing-instruction ledger head and its sequence-1 version. A BLUE correction
 * of the category-5 fact kinds is a change to this single row.
 */
export const S3_KEY_TEMPLATES: readonly Template[] = [
  // 1 identity / exact result / custody
  { id: "identity.tx", category: 1, keys: (c) => [temporalTransactionKey(c.transaction_id)] },
  {
    id: "identity.tx_authority",
    category: 1,
    keys: (c) => [temporalTransactionAuthorityKey(c.transaction_id)],
  },
  {
    id: "identity.from_tx",
    category: 1,
    keys: (c) =>
      c.from_transaction === null ? null : [temporalTransactionKey(c.from_transaction)],
  },
  // 2 present Temporal basis / version
  { id: "clock.state", category: 2, keys: () => [TEMPORAL_STATE_KEY] },
  // 3 operative PC binding / locus / movement / collection engagement
  { id: "pc.binding", category: 3, keys: () => [PLAYER_CHARACTER_BINDING_KEY] },
  { id: "pc.custody", category: 3, keys: (c) => [worldPcLocusCustodyKey(c.pc_id)] },
  {
    id: "pc.rival_entity",
    category: 3,
    keys: (c, p) => {
      const w = worldOf(p);
      return w === null ? null : [worldFallbackEntityKey(w, c.pc_id)];
    },
  },
  {
    id: "pc.transition",
    category: 3,
    keys: (c, p) => {
      const w = worldOf(p);
      return w === null ? null : [worldEntityTransitionKey(w, c.pc_id)];
    },
  },
  {
    id: "pc.transfer",
    category: 3,
    keys: (c, p) => {
      const w = worldOf(p);
      return w === null ? null : [logisticsTransferKey(w, c.pc_id)];
    },
  },
  {
    id: "pc.commitment",
    category: 3,
    keys: (c, p) => {
      const w = worldOf(p);
      return w === null ? null : [logisticsCommitmentKey(w, c.pc_id)];
    },
  },
  { id: "pc.move_commitment", category: 3, keys: (c) => [pcMovementCommitmentKey(c.pc_id)] },
  { id: "pc.move_request", category: 3, keys: (c) => [pcMovementRequestKey(c.pc_id)] },
  {
    id: "pc.move_object",
    category: 3,
    keys: (c) => [temporalObjectKey(logisticsObjectId(pcMovementRequestId(c.pc_id)))],
  },
  { id: "pc.occupancy", category: 3, keys: (c) => [popPcOccupancyKey(c.pc_id)] },
  {
    id: "pc.extraction",
    category: 3,
    keys: (c, p) => {
      const o = occupancyOf(p);
      return o === null || o.status !== "OPEN"
        ? null
        : [productionExtractionKey(pcCollectionRequestId(c.pc_id, o.act_id))];
    },
  },
  {
    id: "pc.reserve",
    category: 3,
    keys: (_c, p) => {
      const e = extractionOf(p);
      return e === null ? null : [e.reserve.fact_key];
    },
  },
  // 5 PROVISIONAL (Q2): PC-known present commitments / background = the standing-instruction ledger, head then sequence-1 version
  {
    id: "commitments.ledger",
    category: 5,
    provisional: true,
    keys: (c) => [
      pcStandingLedgerHeadKey(c.pc_id),
      pcStandingLedgerVersionKey(c.pc_id, PC_LEDGER_FIRST_SEQUENCE),
    ],
  },
  // 6 GIP enrollment + receipt-derived Instrument and registered object
  { id: "gip.receipt", category: 6, keys: () => [GIP_SUNSET_ENROLLMENT_KEY] },
  {
    id: "gip.instrument",
    category: 6,
    keys: (_c, p) => {
      const r = gipReceiptOf(p);
      return r === null ? null : [gipInstrumentKey(r.instrument_id)];
    },
  },
  {
    id: "gip.object",
    category: 6,
    keys: (_c, p) => {
      const r = gipReceiptOf(p);
      return r === null ? null : [temporalObjectKey(gipSunsetObjectId(r.instrument_id))];
    },
  },
  // 7 one first-profile freight enrollment + the exact original E1 / TE it names
  { id: "freight.receipt", category: 7, keys: () => [LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY] },
  {
    id: "freight.e1",
    category: 7,
    keys: (_c, p) => {
      const r = freightReceiptOf(p);
      return r === null ? null : [economyFreightUseConsumptionKey(r.directive_use_id)];
    },
  },
  {
    id: "freight.te",
    category: 7,
    keys: (_c, p) => {
      const r = freightReceiptOf(p);
      return r === null ? null : [temporalObjectKey(logisticsObjectId(r.request_id))];
    },
  },
  // 8 the fixed Temporal-owned origin witness (fresh SI INITIAL only; the classifier never asks for it otherwise)
  { id: "origin.witness", category: 8, keys: () => [TEMPORAL_ORIGIN_KEY] },
];

const TEMPLATE_BY_ID: ReadonlyMap<string, Template> = new Map(
  S3_KEY_TEMPLATES.map((t) => [t.id, t]),
);
/** The most keys one classification can read: the sum of the table's maximum keys per template. */
export const S3_MAX_READS = 25;

// ---------------------------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------------------------

const factWitnessHash = (f: OwnerFact): string | null => {
  try {
    return sha256Canonical(f.value);
  } catch {
    return null;
  }
};

/**
 * The only path from this module to a fact source. It builds every key itself from the closed template table, refuses a template
 * whose derivation inputs an earlier read did not supply, enforces a read cap, validates each fact's envelope (a fact whose key or
 * envelope is wrong is MALFORMED, not absent), and records one witness per key read.
 */
export class PresentReadOracle {
  readonly #source: FactSource;
  readonly #ctx: OracleContext;
  readonly #cap: number;
  readonly #prior = new Map<string, readonly ReadResult[]>();
  readonly #reads: ReadWitness[] = [];
  readonly #refused: string[] = [];

  constructor(source: FactSource, ctx: OracleContext, opts: { readonly maxReads?: number } = {}) {
    this.#source = source;
    this.#ctx = ctx;
    this.#cap = opts.maxReads ?? S3_MAX_READS;
  }

  /** Reads the keys of one template. `null` means the template was refused (see the trace); it never throws on data. */
  read(templateId: string): readonly ReadResult[] | null {
    const t = TEMPLATE_BY_ID.get(templateId);
    if (t === undefined) {
      this.#refused.push(templateId);
      return null;
    }
    const keys = t.keys(this.#ctx, this.#prior);
    if (keys === null || this.#reads.length + keys.length > this.#cap) {
      this.#refused.push(templateId);
      return null;
    }
    const results: ReadResult[] = [];
    for (const key of keys) {
      let fact: OwnerFact | undefined;
      let unreadable = false;
      try {
        fact = this.#source.getFact(key);
      } catch {
        // a source that cannot answer is not an absence: it is an unreadable fact, classified INVALID like any malformed one
        unreadable = true;
      }
      if (unreadable) {
        results.push({ tag: "MALFORMED", key });
        this.#reads.push({
          category: t.category,
          template: t.id,
          key,
          owner: null,
          version: -1,
          fact_sha256: null,
        });
        continue;
      }
      if (fact === undefined) {
        results.push({ tag: "ABSENT", key });
        this.#reads.push({
          category: t.category,
          template: t.id,
          key,
          owner: null,
          version: 0,
          fact_sha256: null,
        });
        continue;
      }
      const ok = OwnerFactSchema.safeParse(fact).success && fact.key === key;
      if (!ok) {
        results.push({ tag: "MALFORMED", key });
        this.#reads.push({
          category: t.category,
          template: t.id,
          key,
          owner: typeof fact.owner === "string" ? fact.owner : null,
          version: -1,
          fact_sha256: null,
        });
        continue;
      }
      results.push({ tag: "PRESENT", key, fact });
      this.#reads.push({
        category: t.category,
        template: t.id,
        key,
        owner: fact.owner,
        version: fact.version,
        fact_sha256: factWitnessHash(fact),
      });
    }
    this.#prior.set(t.id, results);
    return results;
  }

  trace(): ReadTrace {
    return { reads: [...this.#reads], refused_reads: [...this.#refused], proofs: [] };
  }
}

/**
 * Re-reads exactly the witnessed keys and returns every witness whose version moved: the falsifier for a stale or inserted zero
 * key (a version-0 witness whose key now exists) and the shape a later serialized publish would pin as `expected_version`.
 */
export function witnessesStillCurrent(
  source: FactSource,
  witnesses: readonly ReadWitness[],
): readonly ReadWitness[] {
  return witnesses.filter((w) => {
    let now: number;
    try {
      const f = source.getFact(w.key);
      now = f === undefined ? 0 : Number.isInteger(f.version) && f.version > 0 ? f.version : -1;
    } catch {
      now = -1;
    }
    return now !== w.version;
  });
}

// ---------------------------------------------------------------------------------------------
// The typed test precondition (the authenticated GM binding does not exist yet)
// ---------------------------------------------------------------------------------------------

declare const NOT_AUTHENTICATED: unique symbol;
export interface UnauthenticatedGmBindingPrecondition {
  readonly [NOT_AUTHENTICATED]: true;
  readonly label: "TEST_PRECONDITION_NOT_AN_AUTHENTICATED_GM_BINDING";
  readonly campaign_id: string;
  readonly pc_id: string;
}
/** Stands in for the absent authenticated GM/session/campaign/PC binding ONLY at this pure oracle boundary. It authenticates nothing. */
export const testPreconditionAtPureOracleBoundary = (x: {
  readonly campaign_id: string;
  readonly pc_id: string;
}): UnauthenticatedGmBindingPrecondition =>
  Object.freeze({
    label: "TEST_PRECONDITION_NOT_AN_AUTHENTICATED_GM_BINDING",
    campaign_id: x.campaign_id,
    pc_id: x.pc_id,
  }) as unknown as UnauthenticatedGmBindingPrecondition;

/** The request, as far as T0 may see it. A duration, a unit, a target or an interpretation mode is excluded by construction. */
export interface PresentBasisRequest {
  readonly phase: "INITIAL" | "CONTINUATION";
  readonly transaction_id: string;
  readonly from_transaction: string | null;
  readonly observed_basis: CanonicalTime | null;
  /** INITIAL: the member the request carries. CONTINUATION: the digest of the sealed original INITIAL (supplied by the caller). */
  readonly catalogue_sha256: string | null;
}

// ---------------------------------------------------------------------------------------------
// Policy input: the production catalogue, or a closed synthetic test policy (the only route to a positive)
// ---------------------------------------------------------------------------------------------

export interface ProductionCataloguePolicy {
  readonly kind: "PRODUCTION_CATALOGUE";
  readonly authority: DigestAuthority;
  readonly manifest: GmWaitCatalogueManifest;
}
export interface SyntheticTestPolicy {
  readonly kind: "SYNTHETIC_TEST_ONLY";
  readonly closed_policy_id: string;
  readonly premises: {
    readonly accept_complete_gip: boolean;
    readonly accept_complete_freight: boolean;
    /** a known fixture premise: no PC-known time-bound commitment exists (v0.6 section 5.2), never inferred from a missing record */
    readonly no_pc_known_time_commitments: boolean;
  };
}
export type PolicyInput = ProductionCataloguePolicy | SyntheticTestPolicy;

/**
 * Builds a closed synthetic TEST policy. Its id may not be 64 hex characters (it can never be mistaken for a catalogue digest) and
 * may not equal any retained production digest. A synthetic policy is never production clearance: its positive result type is not
 * accepted anywhere else.
 */
export function makeSyntheticTestPolicy(
  closed_policy_id: string,
  premises: SyntheticTestPolicy["premises"],
  production?: DigestAuthority,
): SyntheticTestPolicy {
  if (closed_policy_id.length === 0 || /^[0-9a-f]{64}$/.test(closed_policy_id))
    throw new TypeError(
      "a synthetic test policy id must be a non-empty label that is not a digest",
    );
  if (
    production &&
    (closed_policy_id === production.current || production.retained.has(closed_policy_id))
  )
    throw new TypeError("a synthetic test policy id may not equal a production catalogue digest");
  return { kind: "SYNTHETIC_TEST_ONLY", closed_policy_id, premises };
}

// ---------------------------------------------------------------------------------------------
// The present basis (policy-independent evidence) and the closed verdict
// ---------------------------------------------------------------------------------------------

export const CAT5_REQUIREMENTS = [
  "EXACT_OPERATIVE_PC_IDENTITY",
  "CURRENT_SOURCE_PERMISSION_VISIBILITY",
  "GOVERNING_POLICY",
] as const;
export type Cat5Requirement = (typeof CAT5_REQUIREMENTS)[number];
export interface Cat5View {
  readonly cls: "PARTIAL_WITNESS" | "UNKNOWN" | "INVALID";
  readonly proof: Readonly<Record<Cat5Requirement, "PROVEN" | "UNPROVEN">>;
  /** the proof requirements, always carried; the missing producer/consumer authority S4 / section 10 must supply is in the evidence record */
  readonly requires: readonly Cat5Requirement[];
}

export interface SourceView<E> {
  readonly cls: SourceClass;
  readonly evidence: E | null;
}
export type PcState =
  | "NO_OPERATIVE_PC"
  | "PC_MISMATCH"
  | "SOURCE_INVALID"
  | "CUSTODY_NOT_RECOGNISED"
  | "RIVAL_RECORDS"
  | "STATIONARY_SETTLED"
  | "IN_TRANSFER"
  | "RETIREMENT_PENDING"
  | "DESTINATION_COMMITTED"
  | "MOVEMENT_RECORDS_PRESENT"
  | "COLLECTION_ENGAGED";
export type IdentityState = "NONE" | "EXISTING_SEALED" | "OPEN_UNSEALED" | "INVALID";
export type ClockState = "ABSENT" | "INVALID" | "VALID";
export interface GipEvidence {
  readonly instrument_id: string;
}
export interface FreightEvidence {
  readonly request_id: string;
  readonly directive_use_id: string;
  /** which original owner commits are not yet present (evidence only: the class is one normalized PENDING) */
  readonly missing: readonly ("E1" | "TE")[];
}
export interface OriginEvidence {
  readonly violation: SiOriginViolation | null;
}

export interface PresentBasis {
  readonly authentication: "NOT_PROVEN_TEST_PRECONDITION";
  readonly phase: "INITIAL" | "CONTINUATION";
  readonly identity: { readonly cls: SourceClass; readonly state: IdentityState };
  readonly clock: {
    readonly cls: SourceClass;
    readonly state: ClockState;
    readonly held: boolean;
    readonly basis_matches: boolean | null;
    readonly continuation_matches: boolean | null;
  };
  readonly pc: { readonly cls: SourceClass; readonly state: PcState };
  readonly catalogue: {
    readonly mode: "PRODUCTION" | "SYNTHETIC_TEST_ONLY";
    readonly digest: DigestVerdict | "NOT_CHECKED_SYNTHETIC_POLICY";
    readonly disposition: "UNDECLARED";
    readonly epistemic: "ACTIONABLE_OR_UNSAFE";
  };
  /**
   * Category 5 (PROVISIONAL, BLUE Q2 amended): only a PARTIAL candidate witness or UNKNOWN. Never "complete": a ledger entry is not every
   * PC-known commitment or background, an actual observation or unrestricted GM or player knowledge.
   */
  readonly commitments: Cat5View;
  readonly gip: SourceView<GipEvidence>;
  readonly freight: SourceView<FreightEvidence>;
  readonly origin: SourceView<OriginEvidence> | "NOT_READ_BY_RULE" | "NOT_READ_CLOCK_UNAVAILABLE";
}

export type RefusalReason =
  | "IDENTITY_SOURCE_INVALID"
  | "CONTINUATION_SOURCE_ABSENT"
  | "TIME_NOT_INITIALIZED"
  | "TIME_STATE_INVALID"
  | "BASIS_MISSING"
  | "BASIS_STALE"
  | "HELD_REMAINDER_EXISTS"
  | "CONTINUATION_NOT_HELD"
  | "NO_OPERATIVE_PC"
  | "PC_MISMATCH"
  | "PC_SOURCE_INVALID"
  | "PC_CUSTODY_NOT_RECOGNISED"
  | "PC_NOT_STATIONARY"
  | "PC_MOVEMENT_ENGAGED"
  | "PC_COLLECTION_ENGAGED"
  | "CATALOGUE_DIGEST_NOT_ACCEPTED"
  | "GIP_SOURCE_INVALID"
  | "FREIGHT_SOURCE_INVALID"
  | "COMMITMENTS_SOURCE_INVALID"
  | "ORIGIN_NOT_QUALIFIED"
  | "ORIGIN_INVALID"
  | "ENROLLED_INSTRUMENT_NOT_ACCEPTED_BY_POLICY"
  | "CATALOGUE_UNDECLARED";
export type PendingReason = "CUSTODY_OPEN_UNSEALED" | "ENROLLMENT_PENDING";
export type UnknownReason = "PC_KNOWN_COMMITMENTS_UNESTABLISHED";

export type S3Verdict =
  | { readonly kind: "REFUSE"; readonly reason: RefusalReason }
  | { readonly kind: "PENDING"; readonly reason: PendingReason }
  | { readonly kind: "UNKNOWN"; readonly reason: UnknownReason }
  | { readonly kind: "EXISTING_RESULT" }
  /** reachable ONLY under `SYNTHETIC_TEST_ONLY`; never production clearance */
  | { readonly kind: "SYNTHETIC_TEST_POLICY_POSITIVE"; readonly closed_policy_id: string };

export interface S3Result {
  readonly basis: PresentBasis;
  readonly verdict: S3Verdict;
  readonly witnesses: readonly ReadWitness[];
  readonly trace: ReadTrace;
}

// ---------------------------------------------------------------------------------------------
// Per-category mappers (each returns a source class; malformed is INVALID, never VALID_ABSENT)
// ---------------------------------------------------------------------------------------------

type Parsed<T> =
  | { readonly tag: "ABSENT" }
  | { readonly tag: "VALID"; readonly value: T; readonly fact: OwnerFact }
  | { readonly tag: "INVALID" };
const parsed = <T>(
  r: ReadResult | undefined,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Parsed<T> => {
  if (r === undefined) return { tag: "INVALID" };
  if (r.tag === "ABSENT") return { tag: "ABSENT" };
  if (r.tag === "MALFORMED") return { tag: "INVALID" };
  const p = schema.safeParse(r.fact.value);
  return p.success ? { tag: "VALID", value: p.data, fact: r.fact } : { tag: "INVALID" };
};

function identityOf(
  oracle: PresentReadOracle,
  req: PresentBasisRequest,
): { readonly view: PresentBasis["identity"]; readonly fromTxAbsent: boolean } {
  const done = (view: PresentBasis["identity"], fromTxAbsent = false) => ({ view, fromTxAbsent });
  const tx = parsed(oracle.read("identity.tx")?.[0], ResolutionTransactionSchema);
  if (tx.tag === "INVALID") return done({ cls: "INVALID", state: "INVALID" });
  if (tx.tag === "VALID") return done({ cls: "COMPLETE", state: "EXISTING_SEALED" });
  const auth = parsed(oracle.read("identity.tx_authority")?.[0], TransactionAuthoritySchema);
  if (auth.tag === "INVALID") return done({ cls: "INVALID", state: "INVALID" });
  if (auth.tag === "VALID") return done({ cls: "PENDING", state: "OPEN_UNSEALED" });
  if (req.phase === "CONTINUATION") {
    const f = parsed(oracle.read("identity.from_tx")?.[0], ResolutionTransactionSchema);
    if (f.tag === "INVALID") return done({ cls: "INVALID", state: "INVALID" });
    if (f.tag === "ABSENT") return done({ cls: "VALID_ABSENT", state: "NONE" }, true);
  }
  return done({ cls: "VALID_ABSENT", state: "NONE" });
}

function clockOf(
  oracle: PresentReadOracle,
  req: PresentBasisRequest,
): { view: PresentBasis["clock"]; time: CanonicalTime | null } {
  const s = parsed(oracle.read("clock.state")?.[0], TemporalStateSchema);
  if (s.tag === "ABSENT")
    return {
      view: {
        cls: "VALID_ABSENT",
        state: "ABSENT",
        held: false,
        basis_matches: null,
        continuation_matches: null,
      },
      time: null,
    };
  if (s.tag === "INVALID")
    return {
      view: {
        cls: "INVALID",
        state: "INVALID",
        held: false,
        basis_matches: null,
        continuation_matches: null,
      },
      time: null,
    };
  const held = s.value.continuation !== null;
  return {
    view: {
      cls: "COMPLETE",
      state: "VALID",
      held,
      basis_matches:
        req.phase === "INITIAL"
          ? req.observed_basis === null
            ? null
            : timeEquals(req.observed_basis, s.value.canonical_time)
          : null,
      continuation_matches:
        req.phase === "CONTINUATION"
          ? s.value.continuation !== null &&
            s.value.continuation.from_transaction === req.from_transaction
          : null,
    },
    time: s.value.canonical_time,
  };
}

function pcOf(
  oracle: PresentReadOracle,
  pcId: string,
): { readonly view: PresentBasis["pc"]; readonly operative: boolean } {
  const binding = parsed(oracle.read("pc.binding")?.[0], PlayerCharacterBindingSchema);
  const operative = binding.tag === "VALID" && binding.value.active_pc.entity_id === pcId;
  return { view: pcViewOf(oracle, pcId, binding), operative };
}

function pcViewOf(
  oracle: PresentReadOracle,
  pcId: string,
  binding: Parsed<PlayerCharacterBinding>,
): PresentBasis["pc"] {
  const invalid = (): PresentBasis["pc"] => ({ cls: "INVALID", state: "SOURCE_INVALID" });
  const custodyRead = oracle.read("pc.custody")?.[0];
  const custody = parsed(custodyRead, PcPhysicalLocusCustodySchema);
  if (binding.tag === "INVALID") return invalid();
  // read the rest of the chain only when the custody names a world; every key is receipt-derived
  const world = custody.tag === "VALID" ? custody.value.stationary_locus.world.entity_id : null;
  const rival = world === null ? undefined : oracle.read("pc.rival_entity")?.[0];
  const transition = world === null ? undefined : oracle.read("pc.transition")?.[0];
  const transfer = world === null ? undefined : oracle.read("pc.transfer")?.[0];
  const commitment = world === null ? undefined : oracle.read("pc.commitment")?.[0];
  const moveCommitment = oracle.read("pc.move_commitment")?.[0];
  const moveRequest = oracle.read("pc.move_request")?.[0];
  const moveObject = oracle.read("pc.move_object")?.[0];
  const occupancyRead = oracle.read("pc.occupancy")?.[0];
  const occupancy = parsed(occupancyRead, PopulationPcOccupancySchema);

  if (binding.tag === "ABSENT") return { cls: "VALID_ABSENT", state: "NO_OPERATIVE_PC" };
  if (binding.value.active_pc.entity_id !== pcId) return { cls: "COMPLETE", state: "PC_MISMATCH" };
  if (custody.tag === "INVALID") return invalid();
  if (custody.tag === "ABSENT") return { cls: "COMPLETE", state: "CUSTODY_NOT_RECOGNISED" };
  if (custody.value.pc_id !== pcId) return invalid();

  const rivalP = parsed(rival, FallbackPhysicalEntitySchema);
  const transitionP = parsed(transition, EntityTransitionCloseSchema);
  const transferP = parsed(transfer, LogisticsTransferSchema);
  const commitmentP = parsed(commitment, LogisticsCommitmentSchema);
  const moveCommitmentP = parsed(moveCommitment, PcMovementCommitmentSchema);
  const moveRequestP = parsed(moveRequest, MovementServiceRequestSchema);
  const moveObjectP = parsed(moveObject, TemporalObjectSchema);
  if (
    [
      rivalP,
      transitionP,
      transferP,
      commitmentP,
      moveCommitmentP,
      moveRequestP,
      moveObjectP,
      occupancy,
    ].some((x) => x.tag === "INVALID")
  )
    return invalid();
  // two rival records under one identity have no unique authority
  if (rivalP.tag === "VALID") return { cls: "COMPLETE", state: "RIVAL_RECORDS" };

  const basis = custody.value.basis.established_from;
  const recognised =
    (basis === ORIGINAL_ACTIVATION && binding.value.transition.type === ORIGINAL_ACTIVATION) ||
    basis === EXISTING_ACTOR_HANDOVER;
  if (!recognised) return { cls: "COMPLETE", state: "CUSTODY_NOT_RECOGNISED" };

  if (transitionP.tag === "VALID")
    return {
      cls: "COMPLETE",
      state:
        transferP.tag === "VALID" && transferP.value.state.status === "IN_TRANSFER"
          ? "RETIREMENT_PENDING"
          : "DESTINATION_COMMITTED",
    };
  if (transferP.tag === "VALID" && transferP.value.state.status === "IN_TRANSFER")
    return { cls: "COMPLETE", state: "IN_TRANSFER" };
  if (
    [transferP, commitmentP, moveCommitmentP, moveRequestP, moveObjectP].some(
      (x) => x.tag === "VALID",
    )
  )
    return { cls: "COMPLETE", state: "MOVEMENT_RECORDS_PRESENT" };

  // collection engagement: an unreleased occupancy engages the PC unless the extraction it names is already credited
  if (occupancy.tag === "VALID" && occupancy.value.status === "OPEN") {
    const extraction = parsed(oracle.read("pc.extraction")?.[0], ProductionExtractionSchema);
    if (extraction.tag === "INVALID") return invalid();
    if (extraction.tag === "VALID") {
      const reserve = parsed(oracle.read("pc.reserve")?.[0], ProductionReserveSchema);
      if (reserve.tag === "INVALID") return invalid();
      const credited =
        reserve.tag === "VALID" &&
        (reserve.value.inflows ?? []).some(
          (i) => i.inflow_id === pcCollectionRequestId(pcId, occupancy.value.act_id),
        );
      if (!credited) return { cls: "COMPLETE", state: "COLLECTION_ENGAGED" };
    } else {
      return { cls: "COMPLETE", state: "COLLECTION_ENGAGED" };
    }
  }
  return { cls: "COMPLETE", state: "STATIONARY_SETTLED" };
}

/**
 * Category 5 (PROVISIONAL, BLUE Q2 amended). The PC's standing-instruction ledger head plus its qualified sequence-1 version is, at
 * most, an eligible PARTIAL candidate witness, and only if THREE things are proven by what S3 reads: the exact operative PC identity,
 * the current source permission/visibility and the governing policy. Anything unproven is UNKNOWN; an absent ledger is UNKNOWN
 * (absence is not "no commitment" and never a permission); a malformed or half-present ledger is INVALID. The result can never be
 * "complete", and it never turns a verdict positive. Missing producer/consumer authority (who may read this carrier for the GM, under
 * which access class and policy) belongs to S4 / section 10 and is recorded in docs/evidence/f014b-s2s3.
 */
function commitmentsOf(
  oracle: PresentReadOracle,
  pcId: string,
  operative: boolean,
  policy: PolicyInput,
): { readonly view: Cat5View; readonly proofs: readonly ProofRecord[] } {
  const r = oracle.read("commitments.ledger");
  const head = parsed(r?.[0], PcStandingLedgerHeadSchema);
  const version = parsed(r?.[1], PcStandingLedgerVersionSchema);
  const unproven = Object.fromEntries(
    CAT5_REQUIREMENTS.map((q) => [q, "UNPROVEN"]),
  ) as Cat5View["proof"];
  const finish = (cls: Cat5View["cls"], proof: Cat5View["proof"]) => ({
    view: { cls, proof, requires: CAT5_REQUIREMENTS } as Cat5View,
    proofs: CAT5_REQUIREMENTS.map((q) => ({
      category: 5 as const,
      requirement: q,
      status: proof[q],
    })),
  });
  if (head.tag === "INVALID" || version.tag === "INVALID") return finish("INVALID", unproven);
  if (head.tag === "ABSENT" && version.tag === "ABSENT") return finish("UNKNOWN", unproven);
  if (head.tag !== "VALID" || version.tag !== "VALID") return finish("INVALID", unproven);
  const h = head.value;
  const v = version.value;
  const { content_sha256: _digest, ...body } = v;
  void _digest;
  const consistent =
    h.pc_id === pcId &&
    v.pc_id === pcId &&
    h.current.fact_key === pcStandingLedgerVersionKey(pcId, PC_LEDGER_FIRST_SEQUENCE) &&
    h.current.version === version.fact.version &&
    h.content_sha256 === v.content_sha256 &&
    sha256Canonical(body) === v.content_sha256;
  if (!consistent) return finish("INVALID", unproven);
  // 1. the exact operative PC identity: the Role Registry binding names this PC and both records are this PC's, digest-consistent
  const identity = operative ? "PROVEN" : "UNPROVEN";
  // 2 and 3 need the build's catalogue: the registered governing rule and an access class the catalogue names. A synthetic test policy
  // carries no catalogue, so it proves neither.
  let permission: "PROVEN" | "UNPROVEN" = "UNPROVEN";
  let governing: "PROVEN" | "UNPROVEN" = "UNPROVEN";
  if (policy.kind === "PRODUCTION_CATALOGUE") {
    const kinds = policy.manifest.kinds;
    const rules = (id: string): Set<string> => {
      const k = kinds.find((x) => x.id === id);
      return new Set(
        k === undefined
          ? []
          : [k.rule_ref, ...k.legacy_refs, ...k.later_legacy_refs, ...k.alternate_refs],
      );
    };
    const headRules = rules("pc_standing_instruction_ledger_head");
    const versionRules = rules("pc_standing_instruction_ledger_version");
    const headFact = r?.[0];
    const versionFact = r?.[1];
    if (headFact?.tag === "PRESENT" && versionFact?.tag === "PRESENT") {
      governing =
        headRules.has(sha256Canonical(headFact.fact.provenance.rule)) &&
        versionRules.has(sha256Canonical(versionFact.fact.provenance.rule))
          ? "PROVEN"
          : "UNPROVEN";
      const classes = new Set(policy.manifest.policy.audience_projection.access_classes);
      permission =
        classes.has(headFact.fact.secrecy) && classes.has(versionFact.fact.secrecy)
          ? "PROVEN"
          : "UNPROVEN";
    }
  }
  const proof: Cat5View["proof"] = {
    EXACT_OPERATIVE_PC_IDENTITY: identity,
    CURRENT_SOURCE_PERMISSION_VISIBILITY: permission,
    GOVERNING_POLICY: governing,
  };
  const all = CAT5_REQUIREMENTS.every((q) => proof[q] === "PROVEN");
  return finish(all ? "PARTIAL_WITNESS" : "UNKNOWN", proof);
}

function gipOf(oracle: PresentReadOracle): PresentBasis["gip"] {
  const receipt = parsed(oracle.read("gip.receipt")?.[0], SunsetEnrollmentSchema);
  if (receipt.tag === "ABSENT") return { cls: "VALID_ABSENT", evidence: null };
  if (receipt.tag === "INVALID") return { cls: "INVALID", evidence: null };
  const id = receipt.value.instrument_id;
  const instrument = parsed(oracle.read("gip.instrument")?.[0], GovernanceInstrumentSchema);
  const object = parsed(oracle.read("gip.object")?.[0], TemporalObjectSchema);
  if (instrument.tag !== "VALID" || instrument.value.instrument_id !== id)
    return { cls: "INVALID", evidence: { instrument_id: id } };
  if (instrument.value.sunset_condition === undefined || instrument.value.sunset_condition === null)
    return { cls: "INVALID", evidence: { instrument_id: id } };
  if (object.tag === "INVALID") return { cls: "INVALID", evidence: { instrument_id: id } };
  if (object.tag === "ABSENT") return { cls: "PENDING", evidence: { instrument_id: id } };
  const o = object.value;
  const ok =
    o.owning_ref.owner === OWNER_GIP &&
    o.object_id === gipSunsetObjectId(id) &&
    (o.next_boundary === null || o.next_boundary.boundary_id === gipSunsetBoundaryId(id));
  return { cls: ok ? "COMPLETE" : "INVALID", evidence: { instrument_id: id } };
}

function freightOf(oracle: PresentReadOracle): PresentBasis["freight"] {
  const receipt = parsed(
    oracle.read("freight.receipt")?.[0],
    LogisticsFreightDispatchEnrollmentSchema,
  );
  if (receipt.tag === "ABSENT") return { cls: "VALID_ABSENT", evidence: null };
  if (receipt.tag === "INVALID") return { cls: "INVALID", evidence: null };
  const r = receipt.value;
  const e1 = parsed(oracle.read("freight.e1")?.[0], EconomyFreightUseConsumptionSchema);
  const te = parsed(oracle.read("freight.te")?.[0], TemporalObjectSchema);
  const ev = (missing: ("E1" | "TE")[]): FreightEvidence => ({
    request_id: r.request_id,
    directive_use_id: r.directive_use_id,
    missing,
  });
  if (e1.tag === "INVALID" || te.tag === "INVALID") return { cls: "INVALID", evidence: ev([]) };
  if (te.tag === "VALID" && te.value.object_id !== logisticsObjectId(r.request_id))
    return { cls: "INVALID", evidence: ev([]) };
  const missing: ("E1" | "TE")[] = [];
  if (e1.tag === "ABSENT") missing.push("E1");
  if (te.tag === "ABSENT") missing.push("TE");
  return { cls: missing.length === 0 ? "COMPLETE" : "PENDING", evidence: ev(missing) };
}

function originOf(
  oracle: PresentReadOracle,
  clock: CanonicalTime,
  campaignId: string,
): SourceView<OriginEvidence> {
  const r = oracle.read("origin.witness")?.[0];
  if (r === undefined || r.tag === "MALFORMED")
    return { cls: "INVALID", evidence: { violation: "ORIGIN_MALFORMED" } };
  if (r.tag === "ABSENT") return { cls: "VALID_ABSENT", evidence: null };
  const violation = siOriginWitnessViolation(r.fact.value, clock, campaignId);
  return { cls: violation === null ? "COMPLETE" : "INVALID", evidence: { violation } };
}

// ---------------------------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------------------------

/**
 * Classifies the PRESENT facts for one GM wait request. Reads, in order: category 1 (identity; an existing sealed result or an open
 * unsealed authority ends the call before any other read), 2, 3, 5, 6, 7 and, for a genuinely fresh INITIAL only, 8. The catalogue
 * (category 4) is a pure check of the supplied digest, not a store read. Never throws on data.
 */
export function classifyPresentBasis(
  pre: UnauthenticatedGmBindingPrecondition,
  req: PresentBasisRequest,
  source: FactSource,
  policy: PolicyInput,
  opts: { readonly maxReads?: number } = {},
): S3Result {
  const oracle = new PresentReadOracle(
    source,
    {
      campaign_id: pre.campaign_id,
      pc_id: pre.pc_id,
      transaction_id: req.transaction_id,
      from_transaction: req.from_transaction,
    },
    opts,
  );
  // 4. the catalogue is a pure check of the supplied digest, not a store read; it is evaluated first so every early result carries it
  const sv = policy.kind === "PRODUCTION_CATALOGUE" ? staticVerdict(policy.manifest, {}) : null;
  const catalogue: PresentBasis["catalogue"] = {
    mode: policy.kind === "PRODUCTION_CATALOGUE" ? "PRODUCTION" : "SYNTHETIC_TEST_ONLY",
    digest:
      policy.kind === "PRODUCTION_CATALOGUE"
        ? verifySuppliedDigest(req.catalogue_sha256, policy.authority)
        : "NOT_CHECKED_SYNTHETIC_POLICY",
    disposition: sv?.disposition ?? "UNDECLARED",
    epistemic: sv?.epistemic ?? "ACTIONABLE_OR_UNSAFE",
  };
  const done = (
    basis: PresentBasis,
    verdict: S3Verdict,
    proofs: readonly ProofRecord[] = [],
  ): S3Result => {
    const trace = { ...oracle.trace(), proofs };
    return { basis, verdict, witnesses: trace.reads, trace };
  };
  const empty: Pick<PresentBasis, "clock" | "pc" | "commitments" | "gip" | "freight" | "origin"> = {
    clock: {
      cls: "VALID_ABSENT",
      state: "ABSENT",
      held: false,
      basis_matches: null,
      continuation_matches: null,
    },
    pc: { cls: "VALID_ABSENT", state: "NO_OPERATIVE_PC" },
    commitments: {
      cls: "UNKNOWN",
      proof: Object.fromEntries(CAT5_REQUIREMENTS.map((q) => [q, "UNPROVEN"])) as Cat5View["proof"],
      requires: CAT5_REQUIREMENTS,
    },
    gip: { cls: "VALID_ABSENT", evidence: null },
    freight: { cls: "VALID_ABSENT", evidence: null },
    origin: "NOT_READ_BY_RULE",
  };
  const base = {
    authentication: "NOT_PROVEN_TEST_PRECONDITION",
    phase: req.phase,
    catalogue,
  } as const;

  // 1. identity first: nothing else is read while an exact result, an open authority or a corrupt record decides the call
  const { view: identity, fromTxAbsent } = identityOf(oracle, req);
  if (identity.state === "INVALID")
    return done(
      { ...base, identity, ...empty },
      { kind: "REFUSE", reason: "IDENTITY_SOURCE_INVALID" },
    );
  if (identity.state === "EXISTING_SEALED")
    return done({ ...base, identity, ...empty }, { kind: "EXISTING_RESULT" });
  if (identity.state === "OPEN_UNSEALED")
    return done(
      { ...base, identity, ...empty },
      { kind: "PENDING", reason: "CUSTODY_OPEN_UNSEALED" },
    );
  if (fromTxAbsent)
    return done(
      { ...base, identity, ...empty },
      { kind: "REFUSE", reason: "CONTINUATION_SOURCE_ABSENT" },
    );

  // 2. the present Temporal basis
  const { view: clock, time } = clockOf(oracle, req);
  // 3. the operative PC
  const { view: pc, operative } = pcOf(oracle, pre.pc_id);
  // 5. PROVISIONAL PC-known commitments: a partial candidate witness or UNKNOWN, never complete
  const { view: commitments, proofs } = commitmentsOf(oracle, pre.pc_id, operative, policy);
  // 6, 7. the fixed GIP and freight enrollments
  const gip = gipOf(oracle);
  const freight = freightOf(oracle);
  // 8. the origin witness: a genuinely fresh INITIAL only, never CONTINUATION, replay or reconciliation
  const origin: PresentBasis["origin"] =
    req.phase === "CONTINUATION"
      ? "NOT_READ_BY_RULE"
      : time === null
        ? "NOT_READ_CLOCK_UNAVAILABLE"
        : originOf(oracle, time, pre.campaign_id);

  const basis: PresentBasis = { ...base, identity, clock, pc, commitments, gip, freight, origin };
  return done(basis, verdictOf(basis, req, policy), proofs);
}

function verdictOf(basis: PresentBasis, req: PresentBasisRequest, policy: PolicyInput): S3Verdict {
  const refuse = (reason: RefusalReason): S3Verdict => ({ kind: "REFUSE", reason });
  const { clock, pc } = basis;
  if (clock.state === "ABSENT") return refuse("TIME_NOT_INITIALIZED");
  if (clock.state === "INVALID") return refuse("TIME_STATE_INVALID");
  if (req.phase === "INITIAL") {
    if (clock.held) return refuse("HELD_REMAINDER_EXISTS");
    if (clock.basis_matches === null) return refuse("BASIS_MISSING");
    if (!clock.basis_matches) return refuse("BASIS_STALE");
  } else if (!clock.continuation_matches) {
    return refuse("CONTINUATION_NOT_HELD");
  }
  switch (pc.state) {
    case "NO_OPERATIVE_PC":
      return refuse("NO_OPERATIVE_PC");
    case "PC_MISMATCH":
      return refuse("PC_MISMATCH");
    case "SOURCE_INVALID":
    case "RIVAL_RECORDS":
      return refuse("PC_SOURCE_INVALID");
    case "CUSTODY_NOT_RECOGNISED":
      return refuse("PC_CUSTODY_NOT_RECOGNISED");
    case "IN_TRANSFER":
    case "RETIREMENT_PENDING":
    case "DESTINATION_COMMITTED":
      return refuse("PC_NOT_STATIONARY");
    case "MOVEMENT_RECORDS_PRESENT":
      return refuse("PC_MOVEMENT_ENGAGED");
    case "COLLECTION_ENGAGED":
      return refuse("PC_COLLECTION_ENGAGED");
    case "STATIONARY_SETTLED":
      break;
  }
  if (basis.catalogue.mode === "PRODUCTION" && basis.catalogue.digest !== "OK_CURRENT")
    return refuse("CATALOGUE_DIGEST_NOT_ACCEPTED");
  if (basis.gip.cls === "INVALID") return refuse("GIP_SOURCE_INVALID");
  if (basis.freight.cls === "INVALID") return refuse("FREIGHT_SOURCE_INVALID");
  if (basis.commitments.cls === "INVALID") return refuse("COMMITMENTS_SOURCE_INVALID");
  if (basis.origin !== "NOT_READ_BY_RULE" && basis.origin !== "NOT_READ_CLOCK_UNAVAILABLE") {
    if (basis.origin.cls === "VALID_ABSENT") return refuse("ORIGIN_NOT_QUALIFIED");
    if (basis.origin.cls === "INVALID") return refuse("ORIGIN_INVALID");
  }
  if (basis.gip.cls === "PENDING" || basis.freight.cls === "PENDING")
    return { kind: "PENDING", reason: "ENROLLMENT_PENDING" };
  if (policy.kind === "PRODUCTION_CATALOGUE") {
    // missing material evidence is UNKNOWN; and nothing in the catalogue is a permission: every wait horizon refuses
    if (basis.commitments.cls === "UNKNOWN")
      return { kind: "UNKNOWN", reason: "PC_KNOWN_COMMITMENTS_UNESTABLISHED" };
    return refuse("CATALOGUE_UNDECLARED");
  }
  const premises = policy.premises;
  // category 5 is at best a partial witness: it never satisfies the commitments question, so a fixture premise is always required
  if (!premises.no_pc_known_time_commitments)
    return { kind: "UNKNOWN", reason: "PC_KNOWN_COMMITMENTS_UNESTABLISHED" };
  if (
    (basis.gip.cls === "COMPLETE" && !premises.accept_complete_gip) ||
    (basis.freight.cls === "COMPLETE" && !premises.accept_complete_freight)
  )
    return refuse("ENROLLED_INSTRUMENT_NOT_ACCEPTED_BY_POLICY");
  return { kind: "SYNTHETIC_TEST_POLICY_POSITIVE", closed_policy_id: policy.closed_policy_id };
}
