import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  CohortFactSchema,
  EconomyDemandEnvelopeSchema,
  IssueDemandInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PopulationBasisSchema,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  StartOperationInputSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  canonicalJson,
  compareTime,
  economyDemandKey,
  economyRealizationKey,
  economyRequestId,
  economyRequestKey,
  fail,
  ok,
  populationCohortKey,
  populationLedgerKey,
  productionBoundaryId,
  productionClaimId,
  productionClaimKey,
  productionOperationKey,
  productionOutputReference,
  productionReserveKey,
  worldLocusKey,
  type CanonicalTime,
  type CommitGroup,
  type EconomyDemandEnvelope,
  type OwnerFact,
  type PopulationBasis,
  type ProductionClaim,
  type ProductionOperation,
  type ProductionRequest,
  type ProductionReserve,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  ProductionAdapter,
  canonicalEqual,
  type FsOps,
} from "@immortalis/engine";
import { establishedLocality, type EstablishedLocality } from "./additional-source.ts";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Initial local demand and independently authored production start: the shipped, local, out-of-character path that establishes ONE
 * material demand attributable to ONE already committed Population Unit or Population-owned Cohort and, as a SEPARATE authored act,
 * ONE bounded Production start against ONE already committed same-locality Reserve, in a fresh, operator-confirmed, pre-play scenario
 * — through the existing `EconomyAdapter.issueDemand` and then the existing `ProductionAdapter.startOperation` owner operations and
 * nothing else.
 *
 * The operator authors exactly one document in a local file with two distinct sections, each exactly the strict owner input it names
 * and unchanged: the `IssueDemandInput` (the demand identity, the carrier and the one demanded class and quantity) and the
 * `StartOperationInput` (the request key, the Reserve, the exact input/output transformation and the exact future completion
 * boundary). A demand never grants the second act, allocation priority, title or stock: the production section is required, shown and
 * confirmed expressly, and nothing is inferred, defaulted, rolled, estimated or delegated. The file can carry no owner, facet,
 * version, pin, carrier basis, availability, claim, priority, completion, output, access, publication label or "confirmed" claim
 * (every schema is strict). The service authors only the technical publication identities, derived from the campaign and the exact
 * authored document, so a retry after a crash or a lost reply replays what committed (RC-16), finishes what did not, and anything
 * else under those keys is refused.
 *
 * It writes exactly two Economy facts (the Demand Envelope and its one Production Request, atomically) and then, only once those are
 * committed, the Production operation, its RC-06 claim and the Reserve's open-claim entry (atomically), as two separate durable
 * publications in dependency order. The Population facts, the world, the locus, the canonical time and every other fact are read,
 * never written, and are compared byte for byte on a fresh, owner-verified reopen before success is reported. A campaign that holds
 * the demand without its operation is incomplete and is never reported as an established process.
 *
 * Mechanism only. It advances no time and registers no Temporal object: the operation is IN_PROGRESS, no output exists and the demand
 * is not satisfied. Only a separately authorized canonical advance to the operation's declared boundary — through the existing
 * Temporal coordinator and the existing Production, World-State and Economy stage providers — can consume the Reserve, accept the
 * physical result and record realized access. Nothing here is live Population need formation, valuation, exchange, an actor, a
 * decision, a labour, a rate or a yield.
 */

export const INITIAL_LOCAL_DEMAND_FORMAT = "immortalis-initial-local-demand";
export const INITIAL_LOCAL_DEMAND_FORMAT_VERSION = 1;

/** The most a process file may hold: far beyond any hand-authored process, and a bound on what the console is asked to show. */
const MAX_FILE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

/** The owners and facets, as the specification-backed registry assigns them to these kinds (read, never chosen here). */
const ECONOMY_OWNER = "economy";
const ECONOMY_FACET = "economy_state";
const PRODUCTION_OWNER = "production";
const PRODUCTION_FACET = "production_state";

/**
 * The operator-authored document: the demand input and the production input, each exactly its owner schema. The one cross-section
 * agreement below is THIS path's own consistency condition: the production act names the request the demand allocated to. The owners'
 * admissions still judge everything again (the output the request asked for, the locality, the claim, the time).
 */
export const InitialLocalDemandSchema = z
  .strictObject({
    format: z.literal(INITIAL_LOCAL_DEMAND_FORMAT),
    format_version: z.literal(INITIAL_LOCAL_DEMAND_FORMAT_VERSION),
    demand: IssueDemandInputSchema,
    production: StartOperationInputSchema,
  })
  .superRefine((d, ctx) => {
    if (d.production.request_key !== requestKeyOf(d.demand.demand_envelope_id))
      ctx.addIssue({
        code: "custom",
        message: "the production act names the Production Request this demand allocated to",
        path: ["production", "request_key"],
      });
  });
export type InitialLocalDemand = z.infer<typeof InitialLocalDemandSchema>;

/** The Economy-owned request key the demand fixes (derived from the demand identity alone, as the Economy owner derives it). */
const requestKeyOf = (demandId: string): string => economyRequestKey(economyRequestId(demandId));

export type ProcessFileErrorCode =
  "PROCESS_FILE_UNTRUSTED" | "PROCESS_FILE_UNREADABLE" | "INVALID_PROCESS";

/**
 * Reads the operator's file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system user,
 * not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readInitialLocalDemandFile(
  path: string,
): Result<InitialLocalDemand, ProcessFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("PROCESS_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "PROCESS_FILE_UNTRUSTED",
          "the demand file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_FILE_BYTES)
        return fail("INVALID_PROCESS", "the demand file is larger than a demand can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("PROCESS_FILE_UNREADABLE", "the demand file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_PROCESS", "the demand file is not valid JSON");
  }
  const parsed = InitialLocalDemandSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_PROCESS", "the demand file is not a complete, valid demand and start", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return ok(parsed.data);
}

/**
 * The identity of one confirmed process in one campaign: a hash of exactly the authored content (the campaign, the demand and the
 * production start), never a clock or a random value. The same confirmed proposal always reaches the same identities; any other
 * content, even under the same keys, meets the committed identities and is refused.
 */
export const initialLocalDemandId = (campaignId: string, d: InitialLocalDemand): string =>
  createHash("sha256")
    .update(
      canonicalJson({ campaign_id: campaignId, demand: d.demand, production: d.production }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);

export type InitialLocalDemandStatus =
  | "LOCAL_DEMAND_READY"
  | "LOCAL_DEMAND_INCOMPLETE"
  | "LOCAL_DEMAND_OUTCOME_UNKNOWN"
  | "LOCAL_DEMAND_REFUSED"
  | "LOCAL_DEMAND_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "TIME_NOT_ESTABLISHED"
  | "HORIZON_NOT_AHEAD"
  | "CARRIER_NOT_COMMITTED"
  | "RESERVE_NOT_COMMITTED"
  | "RESERVE_NOT_AT_LOCALITY"
  | "DEMAND_CONFLICT"
  | "OPERATION_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | ProcessFileErrorCode;

export interface InitialLocalDemandResult {
  readonly status: InitialLocalDemandStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<InitialLocalDemandStatus, string> = {
  LOCAL_DEMAND_READY:
    "the demand and its one Production Request are established and, as a separately authored act, the Production operation, its claim and the Reserve's open claim are established; an owner-verified reopen of the package reads back exactly the confirmed facts, with every earlier fact unchanged except the Reserve's open-claim entry; NO time was advanced, no output exists and the demand is NOT satisfied: only a separately authorized canonical advance to the operation's declared boundary can consume the Reserve, accept a physical result and record realized access",
  LOCAL_DEMAND_INCOMPLETE:
    "the demand and its Production Request are committed but the Production start is NOT; the process is NOT established; the earlier demand stays canonical and is not rolled back; rerun the same command with the same file to finish it",
  LOCAL_DEMAND_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; the process is NOT reported established; rerun the same command with the same file (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identities",
  LOCAL_DEMAND_REFUSED: "the owner refused the write; nothing further was committed",
  LOCAL_DEMAND_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed demand and start or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play opening (a player character is bound, the established locality, the Population carrier or the Reserve has been changed, the canonical time has moved, or the operation has been resolved); nothing was changed",
  TIME_NOT_ESTABLISHED:
    "this campaign holds no canonical time; a demand and a Production start are made AS-OF-NOW at an existing canonical time and none is created here; nothing was changed",
  HORIZON_NOT_AHEAD:
    "the declared completion boundary is not after the campaign's canonical time (or is in another unit); nothing was changed",
  CARRIER_NOT_COMMITTED:
    "the named Population Unit or Cohort is not a committed carrier at this campaign's confirmed world and locus (a Cohort carries a demand only once Population has composed it with exact, non-empty membership); nothing was changed",
  RESERVE_NOT_COMMITTED:
    "the named Reserve is not a fresh, unclaimed Reserve this campaign's confirmed pre-play scenario established, unchanged; nothing was changed",
  RESERVE_NOT_AT_LOCALITY:
    "the named Reserve is not at the world and locus of the carrier's Population; nothing was changed",
  DEMAND_CONFLICT:
    "this campaign already holds a demand or request under this identifier, or another initial demand, or this proposal's demand identity is committed with different content; committed facts are never replaced or rolled back and nothing was changed",
  OPERATION_CONFLICT:
    "this campaign already holds a Production operation or claim for this request, or another one, or this proposal's start identity is committed with different content or without its demand; committed facts are never replaced or rolled back and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  PROCESS_FILE_UNTRUSTED: "the demand file is not trusted; nothing was changed",
  PROCESS_FILE_UNREADABLE: "the demand file cannot be read; nothing was changed",
  INVALID_PROCESS:
    "the demand and start are not a complete, valid pair that this path admits and the owners accept; nothing was changed",
};

const result = (
  status: InitialLocalDemandStatus,
  details: readonly string[] = [],
  code?: string,
): InitialLocalDemandResult => ({
  status,
  message: MESSAGES[status],
  details,
  ...(code !== undefined ? { code } : {}),
});

const issuesOf = (error: { details?: unknown }): string[] =>
  (error.details as { issues?: string[] } | undefined)?.issues ?? [];

/** Releases a session whatever the disk does: a close that fails leaves the package lock, which the next run reclaims explicitly. */
const closeQuietly = async (session: { close(): Promise<void> } | undefined): Promise<void> => {
  try {
    await session?.close();
  } catch {
    // nothing more can be done here; the next run reconciles by identity
  }
};
const UNKNOWN_OUTCOME = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

type StageName = "demand" | "start";

interface Stage {
  readonly name: StageName;
  /** the first key the stage writes */
  readonly key: string;
  readonly publication: Publication;
}

function planOf(
  campaignId: string,
  d: InitialLocalDemand,
): { id: string; stages: readonly [Stage, Stage] } {
  const id = initialLocalDemandId(campaignId, d);
  const pub = (name: StageName): Publication => ({
    group_id: `operator-initial-local-demand:${id}:${name}`,
    intent_id: `operator-initial-local-demand-intent:${id}:${name}`,
    cause: `operator-initial-local-demand-cause:${id}`,
    basis: OPERATOR_PUBLICATION_BASIS,
    secrecy: OPERATOR_PUBLICATION_SECRECY,
  });
  const opId = economyRequestId(d.demand.demand_envelope_id);
  return {
    id,
    stages: [
      {
        name: "demand",
        key: economyDemandKey(d.demand.demand_envelope_id),
        publication: pub("demand"),
      },
      { name: "start", key: productionOperationKey(opId), publication: pub("start") },
    ],
  };
}

// -- what the owners derive, written out here independently of the adapters ------------------------------------------------------------

interface DemandBasis {
  readonly ledgerVersion: number;
  readonly cohortVersion: number | null;
  readonly world: PopulationBasis["locality"]["world"];
  readonly locus: PopulationBasis["locality"]["locus"];
  readonly at: CanonicalTime;
  readonly clockVersion: number;
}

/**
 * The Demand Envelope the Economy owner derives from an input and the facts it pins (WS-004 §5.1–§5.3, §27.2): the carrier by
 * identity and pinned version, the carrier's own locality, the one demanded entry, the fixed one-demand-one-request allocation, and
 * the AS-OF-NOW availability sealed with "no supply for the request".
 */
export function expectedDemand(d: InitialLocalDemand, b: DemandBasis): EconomyDemandEnvelope {
  const id = d.demand.demand_envelope_id;
  const carrier = d.demand.carrier;
  const requestId = economyRequestId(id);
  return {
    demand_envelope_id: id,
    carrier_ref: carrier,
    carrier_basis_ref: {
      ledger: { fact_key: populationLedgerKey(carrier.ledger_id), version: b.ledgerVersion },
      cohort:
        carrier.kind === "POPULATION_COHORT" && b.cohortVersion !== null
          ? {
              fact_key: populationCohortKey(carrier.ledger_id, carrier.cohort_id),
              version: b.cohortVersion,
            }
          : null,
    },
    material_scope: { world: b.world, locus: b.locus },
    demand_entry: d.demand.demand_entry,
    allocation: {
      relation: "ONE_DEMAND_ONE_PRODUCTION_REQUEST",
      request: { fact_key: economyRequestKey(requestId), request_id: requestId },
      nature: "ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION",
    },
    pre_commit_availability: {
      read: "AS-OF-NOW",
      at: b.at,
      temporal_state: { fact_key: TEMPORAL_STATE_KEY, version: b.clockVersion },
      supply_for_request: "ABSENT",
    },
  };
}

/** The Production Request the Economy owner issues for a demand: exactly the demanded output at the demand's locality, no priority. */
export function expectedRequest(envelope: EconomyDemandEnvelope): ProductionRequest {
  return {
    request_id: envelope.allocation.request.request_id,
    source: { owner: ECONOMY_OWNER, cause_ref: economyDemandKey(envelope.demand_envelope_id) },
    requested_output: envelope.demand_entry,
    scope: envelope.material_scope,
    priority_authority_ref: null,
  };
}

interface StartBasis {
  readonly reserve: ProductionReserve;
  readonly at: CanonicalTime;
}

/** The operation, claim and advanced Reserve the Production owner derives from a start (WS-003 §3 Tier C, §4, §9, §13A, RC-06). */
export function expectedStart(
  d: InitialLocalDemand,
  b: StartBasis,
): { operation: ProductionOperation; claim: ProductionClaim; reserve: ProductionReserve } {
  const opId = economyRequestId(d.demand.demand_envelope_id);
  const claimId = productionClaimId(opId);
  const t = d.production.transformation;
  return {
    operation: {
      operation_id: opId,
      request: {
        owner: ECONOMY_OWNER,
        fact_key: economyRequestKey(opId),
        request_id: opId,
        version: 1,
      },
      reserve: {
        fact_key: productionReserveKey(b.reserve.reserve_id),
        reserve_id: b.reserve.reserve_id,
      },
      claim: { fact_key: productionClaimKey(claimId), claim_id: claimId },
      transformation: {
        input: { material_class: b.reserve.material_class, quantity: t.input_quantity },
        output: {
          reference: productionOutputReference(opId),
          output_class: t.output_class,
          quantity: t.output_quantity,
          condition: t.output_condition,
        },
      },
      support_basis: {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
      },
      timing: {
        started_at: b.at,
        completion: { boundary_id: productionBoundaryId(opId), at: d.production.completion_at },
      },
      status: { state: "IN_PROGRESS" },
    },
    claim: {
      claim_id: claimId,
      operation_id: opId,
      conserved: {
        kind: "PRODUCTION_RESERVE_QUANTITY",
        fact_key: productionReserveKey(b.reserve.reserve_id),
        reserve_id: b.reserve.reserve_id,
      },
      quantity: t.input_quantity,
      overlap_basis: "SAME_RESERVE_QUANTITY_UNTIL_CONSUMED",
      interval: { from: b.at, until: d.production.completion_at },
      priority_basis: null,
      lifecycle: { status: "ACTIVE" },
      lineage: {
        request: { owner: ECONOMY_OWNER, fact_key: economyRequestKey(opId), version: 1 },
      },
    },
    reserve: { ...b.reserve, claims: [...b.reserve.claims, claimId].sort() },
  };
}

const provenanceLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);
const qty = (q: { amount: number; unit: string }): string => `${q.amount} ${quoted(q.unit)}`;
const instant = (t: CanonicalTime): string => `${t.value} ${quoted(t.unit)}`;

function carrierLine(c: InitialLocalDemand["demand"]["carrier"]): string {
  return c.kind === "POPULATION_UNIT"
    ? `Population Unit ${quoted(c.unit_id)} of ledger ${quoted(c.ledger_id)}`
    : `Population Cohort ${quoted(c.cohort_id)} of ledger ${quoted(c.ledger_id)}`;
}

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  d: InitialLocalDemand,
  now: CanonicalTime,
  pending: readonly StageName[],
): string[] {
  const { demand, production: p } = d;
  const t = p.transformation;
  return [
    `CONFIRMATION — INITIAL LOCAL DEMAND AND PRODUCTION START`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  process identity: ${id} (established locality ${localityId})`,
    `  canonical time (read, never changed): ${instant(now)}`,
    `  to commit, in this order: ${pending.join(" → ")}`,
    ``,
    `TWO SEPARATELY AUTHORED OPENING ACTS YOU ARE CONFIRMING (nothing is inferred, estimated, generated or defaulted):`,
    `ACT 1 — MATERIAL DEMAND (Economy)${pending.includes("demand") ? "" : " — ALREADY COMMITTED, not asked again"}`,
    `  demand: ${quoted(demand.demand_envelope_id)}`,
    `  attributable to: ${carrierLine(demand.carrier)}   (an authored opening premise; the carrier did not choose it in play)`,
    `  demanded: ${qty(demand.demand_entry.quantity)} of ${quoted(demand.demand_entry.output_class)}, at the carrier's own locality`,
    `  Economy fixes ONE Production Request for it; the demand is an economic claim only: NOT stock, title, a reservation or a priority`,
    `ACT 2 — PRODUCTION START (Production) — a SEPARATE act: the demand above does not grant it`,
    `  request: ${quoted(p.request_key)}`,
    `  Reserve: ${quoted(p.reserve_id)}`,
    `  input claimed from the Reserve: ${qty(t.input_quantity)}`,
    `  output stipulated: ${qty(t.output_quantity)} of ${quoted(t.output_class)}, condition ${quoted(t.output_condition)}`,
    `  declared completion boundary: ${instant(p.completion_at)}`,
    `  Production records the operation IN_PROGRESS, its claim, and the Reserve holding that claim open; the Reserve's quantity is NOT consumed`,
    ``,
    `Confirming commits these in two durable publications, the demand and its request first and the Production start only after they are`,
    `committed, through the existing Economy and Production owner operations. It advances NO time and registers no Temporal object: no`,
    `output exists and the demand is NOT satisfied, and neither is until a separately authorized canonical advance reaches the declared`,
    `boundary and the existing owner stages earn it. The input, output, duration and boundary are your stipulated premises, not a rate,`,
    `yield, labour, valuation, exchange or actor decision. Committed facts are never replaced or rolled back.`,
  ];
}

// -- reading the pre-play scenario ---------------------------------------------------------------------------------------------------------

type Store = CanonicalCampaign["store"];

type Established = Extract<EstablishedLocality, { kind: "ESTABLISHED" }>;

interface Carrier {
  readonly basis: PopulationBasis;
}

type Problem = { readonly status: InitialLocalDemandStatus; readonly reason: string };

/**
 * The Population carrier as committed: the Population ledger (and, for a Cohort carrier, the Cohort) the demand names, at the world and
 * locus of the confirmed scenario, naming a Unit it holds or a Cohort of it. Population owns its count, membership and identity; this
 * path reads them and copies none. A Cohort carries a demand only once Population has composed it with exact, non-empty membership
 * (the Economy owner's own rule, stated here only so the refusal is a clear one): composing it is Population's own ordinary close at a
 * later canonical time, which this path neither runs nor requires to be absent.
 */
function carrierOf(
  store: Store,
  locality: Established,
  d: InitialLocalDemand,
): { ok: true; carrier: Carrier } | { ok: false; problem: Problem } {
  const carrier = d.demand.carrier;
  const no = (reason: string) => ({
    ok: false as const,
    problem: { status: "CARRIER_NOT_COMMITTED" as const, reason },
  });
  const ledger = store.getFact(populationLedgerKey(carrier.ledger_id));
  if (!ledger) return no(`no Population ledger ${carrier.ledger_id} is committed`);
  const basis = PopulationBasisSchema.safeParse(ledger.value);
  if (!basis.success || ledger.owner !== "population")
    return no(`the ledger ${carrier.ledger_id} is not a valid Population ledger`);
  const { world, locus } = basis.data.locality;
  const worldFact = store.getFact(world.fact_key);
  const locusFact = store.getFact(locus.fact_key);
  if (
    world.fact_key !== locality.world.key ||
    !worldFact ||
    worldFact.version !== 1 ||
    !locusFact ||
    locusFact.version !== 1 ||
    locusFact.key !== worldLocusKey(world.entity_id, locus.entity_id)
  )
    return no(`ledger ${carrier.ledger_id} is not at a locus this scenario established`);
  if (carrier.kind === "POPULATION_UNIT") {
    if (!basis.data.units.some((u) => u.unit_id === carrier.unit_id))
      return no(`${carrier.unit_id} is not a Unit of ledger ${carrier.ledger_id}`);
    return { ok: true, carrier: { basis: basis.data } };
  }
  const cohort = store.getFact(populationCohortKey(carrier.ledger_id, carrier.cohort_id));
  const fact = cohort ? CohortFactSchema.safeParse(cohort.value) : undefined;
  if (!cohort || !fact?.success || cohort.owner !== "population")
    return no(`no Cohort ${carrier.cohort_id} of ledger ${carrier.ledger_id} is committed`);
  if (
    fact.data.ref.cohort_id !== carrier.cohort_id ||
    fact.data.ref.scope.ledger_id !== carrier.ledger_id
  )
    return no(`Cohort ${carrier.cohort_id} does not belong to ledger ${carrier.ledger_id}`);
  const composed = fact.data.result;
  if (!composed || composed.cardinality.semantics !== "EXACT" || composed.cardinality.count < 1)
    return no(
      `Cohort ${carrier.cohort_id} has not been composed by Population with exact, non-empty membership; a Cohort carries a demand only then`,
    );
  return { ok: true, carrier: { basis: basis.data } };
}

/** A fresh Reserve: unclaimed, nothing consumed, no inflow (the only Reserve this path starts an operation against). */
const isFresh = (r: ProductionReserve): boolean =>
  r.claims.length === 0 && r.consumed.length === 0 && (r.inflows ?? []).length === 0;

/** Whether the Reserve is attached to exactly the carrier's world and locus. */
const reserveAtCarrier = (r: ProductionReserve, basis: PopulationBasis): boolean =>
  canonicalEqual(r.locality.world, basis.locality.world) &&
  canonicalEqual(r.locality.locus, basis.locality.locus);

/**
 * The Reserve the production act names: committed by Production at its first version, fresh (nothing claimed, consumed or credited),
 * and attached to exactly the carrier's own world and locus. Production's admission judges the claim against it again.
 */
function reserveOf(
  store: Store,
  d: InitialLocalDemand,
  basis: PopulationBasis,
): { ok: true } | { ok: false; problem: Problem } {
  const no = (reason: string, status: InitialLocalDemandStatus = "RESERVE_NOT_COMMITTED") => ({
    ok: false as const,
    problem: { status, reason },
  });
  const id = d.production.reserve_id;
  const fact = store.getFact(productionReserveKey(id));
  const value = fact ? ProductionReserveSchema.safeParse(fact.value) : undefined;
  if (!fact || !value?.success || fact.owner !== PRODUCTION_OWNER)
    return no(`no Reserve ${id} is committed`);
  if (fact.version !== 1 || !isFresh(value.data))
    return no(`Reserve ${id} is not a fresh, unclaimed, unchanged Reserve`);
  if (!reserveAtCarrier(value.data, basis))
    return no(
      `Reserve ${id} is not at locus ${basis.locality.locus.entity_id} of world ${basis.locality.world.entity_id}`,
      "RESERVE_NOT_AT_LOCALITY",
    );
  return { ok: true };
}

/** Whether the Reserve a committed start was made against is NOT the named, fresh Reserve at the carrier's own locality. */
const startReserveProblem = (
  r: ProductionReserve,
  d: InitialLocalDemand,
  basis: PopulationBasis,
): boolean =>
  r.reserve_id !== d.production.reserve_id || !isFresh(r) || !reserveAtCarrier(r, basis);

/** The Reserve as it stood before a committed start, read from that start's own group (the start only adds its claim). */
function reserveBeforeStart(group: CommitGroup, claimId: string): ProductionReserve | undefined {
  const after = ProductionReserveSchema.safeParse(group.writes[2]?.value);
  if (!after.success) return undefined;
  return { ...after.data, claims: after.data.claims.filter((c) => c !== claimId) };
}

/** The campaign's canonical time: the Temporal owner's committed state must exist and be valid. Read only; no time is created or advanced. */
function clockOf(
  store: Store,
):
  | { readonly ok: true; readonly fact: OwnerFact; readonly time: CanonicalTime }
  | { readonly ok: false; readonly problem: Problem } {
  const fact = store.getFact(TEMPORAL_STATE_KEY);
  if (!fact)
    return {
      ok: false,
      problem: { status: "TIME_NOT_ESTABLISHED", reason: "no canonical time is committed" },
    };
  const state = TemporalStateSchema.safeParse(fact.value);
  if (!state.success)
    return {
      ok: false,
      problem: {
        status: "TIME_NOT_ESTABLISHED",
        reason: "the committed canonical time is not valid",
      },
    };
  return { ok: true, fact, time: state.data.canonical_time };
}

/** An opening is made AS-OF-NOW: the declared boundary must lie strictly after the canonical time, in the same unit. */
function horizonProblem(now: CanonicalTime, d: InitialLocalDemand): Problem | undefined {
  return compareTime(now, d.production.completion_at) === -1
    ? undefined
    : {
        status: "HORIZON_NOT_AHEAD",
        reason: `the canonical time is ${instant(now)} and the declared boundary is ${instant(d.production.completion_at)}`,
      };
}

/**
 * The foreign Economy or Production process this path never builds beside: it admits ONE initial local process per campaign (its own
 * fail-closed condition, not an Economy or Production rule: the sources fix no inter-process law here and none is invented).
 */
function foreignProcess(store: Store, d: InitialLocalDemand) {
  const opId = economyRequestId(d.demand.demand_envelope_id);
  const own = new Set([
    economyDemandKey(d.demand.demand_envelope_id),
    economyRequestKey(opId),
    productionOperationKey(opId),
    productionClaimKey(productionClaimId(opId)),
  ]);
  for (const f of store.listFacts()) {
    if (own.has(f.key)) continue;
    if (/^economy\/(demand|request|realization)\//.test(f.key))
      return {
        status: "DEMAND_CONFLICT" as const,
        reason: `another demand is already held: ${f.key}`,
      };
    if (/^production\/(operation|claim|completion)\//.test(f.key))
      return {
        status: "OPERATION_CONFLICT" as const,
        reason: `another Production operation is already held: ${f.key}`,
      };
  }
  return undefined;
}

// -- the owner-path dry run ------------------------------------------------------------------------------------------------------------------

/**
 * Proves, before anything is written to the operator's campaign, that the genuine Economy and Production owner operations admit this
 * exact demand and start against the campaign as it stands: the package's committed state (manifest, current state and journal — never
 * its lock) is copied to a scratch directory, opened there through the engine's own owner-verified open, the demand and then the start
 * are run through the genuine owner operations on the copy, and the scratch directory is removed. The strict schemas are not the whole of
 * what the owners check (the output the request asked for, the locality, the claim against the Reserve, the boundary, a composed
 * Cohort), and a refusal of the start after the demand had committed would strand a demand without its process. Nothing here is reused:
 * the copy is not the campaign, it is never given a tick, and the campaign itself is read, never written.
 */
async function dryRun(
  params: EstablishInitialLocalDemandParams,
  store: Store,
  d: InitialLocalDemand,
  buildId: string,
  demandHeld: boolean,
): Promise<Result<null, "INVALID_PROCESS">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-initial-local-demand-dry-run-"));
    const copy = join(scratch, "package");
    mkdirSync(copy, { mode: 0o700 });
    const revision = store.head().revision;
    for (const name of [
      "manifest.json",
      "journal.jsonl",
      `state.${String(revision).padStart(10, "0")}.json`,
    ])
      copyFileSync(join(params.campaignDir, name), join(copy, name));
    const opened = await CanonicalCampaign.open(copy, { buildId });
    if (!opened.ok)
      return fail("INVALID_PROCESS", "the demand and start could not be checked", {
        issues: [opened.error.code],
      });
    try {
      const pub = (name: string): Publication => ({
        group_id: `dry-run-${name}`,
        intent_id: `dry-run-intent-${name}`,
        cause: "dry-run-cause",
        basis: OPERATOR_PUBLICATION_BASIS,
        secrecy: OPERATOR_PUBLICATION_SECRECY,
      });
      const production = new ProductionAdapter(opened.value.store);
      const steps: readonly [string, () => Promise<Result<unknown, string>>][] = [
        ...(demandHeld
          ? []
          : ([
              [
                "demand",
                () =>
                  new EconomyAdapter(opened.value.store).issueDemand({
                    ...pub("demand"),
                    demand: d.demand,
                  }),
              ],
            ] as [string, () => Promise<Result<unknown, string>>][])),
        ["start", () => production.startOperation({ ...pub("start"), start: d.production })],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_PROCESS", "the owner path refuses this demand and start", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await opened.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_PROCESS", "the demand and start could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

// -- the command ------------------------------------------------------------------------------------------------------------------------------

export interface EstablishInitialLocalDemandParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly demandFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one initial local demand with its separately authored Production start.
 *
 *   read the file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character → replay-and-verify when both identities already committed → otherwise (for whatever is
 *   still to be written) require the pre-play Population carrier, the fresh same-locality Reserve and the existing canonical time,
 *   prove the owner path admits it, ask ONE confirmation → commit the demand and its request, then the operation → reopen the package
 *   afresh, owner-verified, and compare → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A process already
 * committed under this identity is verified and reported without asking again; one committed only in part is finished from the same
 * file, and the earlier demand is never rolled back.
 */
export async function establishInitialLocalDemand(
  params: EstablishInitialLocalDemandParams,
): Promise<InitialLocalDemandResult> {
  const read = readInitialLocalDemandFile(params.demandFile);
  if (!read.ok) return result(read.error.code, issuesOf(read.error));
  const doc = read.value;
  const { id, stages } = planOf(params.campaignId, doc);
  const buildId = params.buildId ?? BUILD_ID;

  const opened = await LocalOperatorSession.open({
    campaignDir: params.campaignDir,
    expectedCampaignId: params.campaignId,
    buildId,
    ...(params.operatorDir !== undefined ? { operatorDir: params.operatorDir } : {}),
    ...(params.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(params.campaignFs ? { campaignFs: params.campaignFs } : {}),
    ...(params.ledgerFs ? { ledgerFs: params.ledgerFs } : {}),
  });
  if (!opened.ok) {
    const sub = (opened.error.details as { code?: string } | undefined)?.code;
    return result(
      "SESSION_UNAVAILABLE",
      [opened.error.message],
      `${opened.error.code}${sub ? ` ${sub}` : ""}`,
    );
  }
  const session = opened.value;
  try {
    return await run({ params, session, doc, id, stages, buildId });
  } catch {
    // an unexpected failure is never a success and never a clean refusal
    return result("LOCAL_DEMAND_OUTCOME_UNKNOWN", [
      "an unexpected failure interrupted the command",
    ]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishInitialLocalDemandParams;
  readonly session: LocalOperatorSession;
  readonly doc: InitialLocalDemand;
  readonly id: string;
  readonly stages: readonly [Stage, Stage];
  readonly buildId: string;
}

/** What this identity has committed so far, judged on the immutable committed groups (never on the facts, which an owner may advance). */
type Committed =
  | { readonly kind: "NONE" }
  | { readonly kind: "DEMAND"; readonly envelope: EconomyDemandEnvelope }
  | { readonly kind: "BOTH"; readonly envelope: EconomyDemandEnvelope }
  | { readonly kind: "CLOSED"; readonly reason: string }
  | {
      readonly kind: "CONFLICT";
      readonly status: InitialLocalDemandStatus;
      readonly reason: string;
    };

const readKeys = (g: CommitGroup): string[] => g.reads.map((x) => `${x.key}@${x.version}`).sort();
const groupsOf = (store: Store, keys: readonly string[]): string[] | undefined => {
  const facts = keys.map((k) => store.getFact(k));
  if (facts.some((f) => f === undefined)) return undefined;
  return [...new Set(facts.flatMap((f) => f?.provenance.group_id ?? []))].sort();
};

/**
 * The demand group against the confirmed document: two Economy writes created from nothing (the Demand Envelope and its one Request),
 * with the exact derived values, the Economy owner and facet, the operator's technical identities, and reads of — and dependencies on —
 * exactly the facts the demand was committed against. The AS-OF-NOW instant and the clock version are the record's own; whether the
 * clock has since moved is judged separately.
 */
function demandProblems(store: Store, group: CommitGroup, stage: Stage, d: InitialLocalDemand) {
  const bad = ["the demand identity is committed with different content than the confirmed one"];
  const w = group.writes;
  const env = EconomyDemandEnvelopeSchema.safeParse(w[0]?.value);
  const led = store.getFact(populationLedgerKey(d.demand.carrier.ledger_id));
  const basis = led ? PopulationBasisSchema.safeParse(led.value) : undefined;
  if (!env.success || !basis?.success || !led) return bad;
  const e = env.data;
  const cohortKey =
    d.demand.carrier.kind === "POPULATION_COHORT"
      ? populationCohortKey(d.demand.carrier.ledger_id, d.demand.carrier.cohort_id)
      : null;
  const cohortFact = cohortKey ? store.getFact(cohortKey) : undefined;
  if (cohortKey && !cohortFact) return bad;
  const expected = expectedDemand(d, {
    ledgerVersion: led.version,
    cohortVersion: cohortFact ? cohortFact.version : null,
    world: basis.data.locality.world,
    locus: basis.data.locality.locus,
    at: e.pre_commit_availability.at,
    clockVersion: e.pre_commit_availability.temporal_state.version,
  });
  const pinned = [
    basis.data.locality.world.fact_key,
    basis.data.locality.locus.fact_key,
    led.key,
    ...(cohortKey ? [cohortKey] : []),
  ];
  const wantReads = [
    ...pinned.map((k) => `${k}@${store.getFact(k)?.version}`),
    `${TEMPORAL_STATE_KEY}@${e.pre_commit_availability.temporal_state.version}`,
  ].sort();
  const wantDepends = groupsOf(store, [...pinned, TEMPORAL_STATE_KEY]);
  if (
    group.group_id !== stage.publication.group_id ||
    group.intent_id !== stage.publication.intent_id ||
    group.cause !== stage.publication.cause ||
    group.owner !== ECONOMY_OWNER ||
    group.facet !== ECONOMY_FACET ||
    w.length !== 2 ||
    w[0]?.key !== economyDemandKey(d.demand.demand_envelope_id) ||
    w[1]?.key !== economyRequestKey(economyRequestId(d.demand.demand_envelope_id)) ||
    w.some(
      (x) =>
        x.owner !== ECONOMY_OWNER ||
        x.facet !== ECONOMY_FACET ||
        x.expected_version !== 0 ||
        x.basis !== stage.publication.basis ||
        x.secrecy !== stage.publication.secrecy,
    ) ||
    !canonicalEqual(w[0]?.value, expected) ||
    !canonicalEqual(w[1]?.value, expectedRequest(expected)) ||
    !canonicalEqual(readKeys(group), wantReads) ||
    wantDepends === undefined ||
    !canonicalEqual([...group.depends_on].sort(), wantDepends)
  )
    return bad;
  return [];
}

/**
 * The start group against the confirmed document: the operation, its claim and the advanced Reserve — three Production writes (the
 * first two created from nothing, the Reserve advanced from its fresh version) with the exact derived values, the Production owner and
 * facet, the operator's technical identities, started at the demand's own instant, and reads of — and dependencies on — exactly the
 * Request and the canonical time it was committed against.
 */
function startProblems(
  store: Store,
  group: CommitGroup,
  stage: Stage,
  d: InitialLocalDemand,
  envelope: EconomyDemandEnvelope,
  established: ProductionReserve,
): string[] {
  const bad = ["the start identity is committed with different content than the confirmed one"];
  const opId = economyRequestId(d.demand.demand_envelope_id);
  const e = expectedStart(d, { reserve: established, at: envelope.pre_commit_availability.at });
  const w = group.writes;
  const request = store.getFact(economyRequestKey(opId));
  const wantDepends = groupsOf(store, [economyRequestKey(opId), TEMPORAL_STATE_KEY]);
  const wantReads = [
    `${economyRequestKey(opId)}@1`,
    `${TEMPORAL_STATE_KEY}@${envelope.pre_commit_availability.temporal_state.version}`,
  ].sort();
  if (
    !request ||
    group.group_id !== stage.publication.group_id ||
    group.intent_id !== stage.publication.intent_id ||
    group.cause !== stage.publication.cause ||
    group.owner !== PRODUCTION_OWNER ||
    group.facet !== PRODUCTION_FACET ||
    w.length !== 3 ||
    w[0]?.key !== productionOperationKey(opId) ||
    w[1]?.key !== productionClaimKey(productionClaimId(opId)) ||
    w[2]?.key !== productionReserveKey(established.reserve_id) ||
    w.some(
      (x) =>
        x.owner !== PRODUCTION_OWNER ||
        x.facet !== PRODUCTION_FACET ||
        x.basis !== stage.publication.basis ||
        x.secrecy !== stage.publication.secrecy,
    ) ||
    w[0]?.expected_version !== 0 ||
    w[1]?.expected_version !== 0 ||
    w[2]?.expected_version !== 1 ||
    !canonicalEqual(w[0]?.value, e.operation) ||
    !canonicalEqual(w[1]?.value, e.claim) ||
    !canonicalEqual(w[2]?.value, e.reserve) ||
    !canonicalEqual(readKeys(group), wantReads) ||
    wantDepends === undefined ||
    !canonicalEqual([...group.depends_on].sort(), wantDepends)
  )
    return bad;
  return [];
}

/**
 * Whether the opening the committed demand was made against has moved: the canonical time is no longer its sealed AS-OF-NOW basis, or
 * the world, locus, ledger or Cohort it pinned is no longer the fact, at the version, it pinned. Pre-play is then over for this identity.
 */
function openingMoved(store: Store, envelope: EconomyDemandEnvelope): string | undefined {
  const clock = clockOf(store);
  const sealed = envelope.pre_commit_availability;
  if (
    !clock.ok ||
    clock.fact.version !== sealed.temporal_state.version ||
    compareTime(clock.time, sealed.at) !== 0
  )
    return "the canonical time has moved since the demand was committed";
  const basis = envelope.carrier_basis_ref;
  const pins: [string, number][] = [
    [envelope.material_scope.world.fact_key, 1],
    [envelope.material_scope.locus.fact_key, 1],
    [basis.ledger.fact_key, basis.ledger.version],
    ...(basis.cohort
      ? ([[basis.cohort.fact_key, basis.cohort.version]] as [string, number][])
      : []),
  ];
  for (const [k, v] of pins)
    if (store.getFact(k)?.version !== v)
      return `a fact the demand was committed against has changed since: ${k}`;
  return undefined;
}

function committedOf(
  store: Store,
  doc: InitialLocalDemand,
  stages: readonly [Stage, Stage],
): Committed {
  const [demandStage, startStage] = stages;
  const demand = store.committedGroup(demandStage.publication.intent_id);
  const start = store.committedGroup(startStage.publication.intent_id);
  if (start && !demand)
    return {
      kind: "CONFLICT",
      status: "OPERATION_CONFLICT",
      reason: "the Production start is committed without its demand",
    };
  if (!demand) return { kind: "NONE" };
  const parsed = EconomyDemandEnvelopeSchema.safeParse(demand.writes[0]?.value);
  const conflict = (status: "DEMAND_CONFLICT" | "OPERATION_CONFLICT", reason: string) =>
    ({ kind: "CONFLICT", status, reason }) as const;
  if (!parsed.success)
    return conflict("DEMAND_CONFLICT", "the demand identity is committed with different content");
  const moved = openingMoved(store, parsed.data);
  if (moved) return { kind: "CLOSED", reason: moved };
  const problems = demandProblems(store, demand, demandStage, doc);
  if (problems.length > 0 || !store.getFact(demandStage.key))
    return conflict(
      "DEMAND_CONFLICT",
      problems[0] ?? "this identity's demand is committed, but its fact is not held",
    );
  if (!start) return { kind: "DEMAND", envelope: parsed.data };
  const established = reserveBeforeStart(
    start,
    productionClaimId(economyRequestId(doc.demand.demand_envelope_id)),
  );
  const sp =
    established && startReserveProblem(established, doc, basisOf(store, doc))
      ? ["the Reserve this start was committed against is not the fresh Reserve of the carrier"]
      : established
        ? startProblems(store, start, startStage, doc, parsed.data, established)
        : ["the Reserve this start was committed against is not held"];
  if (sp.length > 0 || !store.getFact(startStage.key))
    return conflict(
      "OPERATION_CONFLICT",
      sp[0] ?? "this identity's start is committed, but its operation is not held",
    );
  return { kind: "BOTH", envelope: parsed.data };
}

/** The ledger's basis for the carrier, as committed (for judging committed records). */
function basisOf(store: Store, doc: InitialLocalDemand): PopulationBasis {
  const led = store.getFact(populationLedgerKey(doc.demand.carrier.ledger_id));
  return PopulationBasisSchema.parse(led?.value);
}

async function run(a: RunArgs): Promise<InitialLocalDemandResult> {
  const { params, session, doc, id, stages, buildId } = a;
  const [demandStage, startStage] = stages;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);
  // an established locality that a later owner write has advanced ends pre-play, whatever else this identity has committed
  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);

  let committed: Committed;
  try {
    committed = committedOf(store, doc, stages);
  } catch {
    committed = {
      kind: "CONFLICT",
      status: "DEMAND_CONFLICT",
      reason: "this identity's committed record cannot be read against the carrier it names",
    };
  }
  if (committed.kind === "CONFLICT") return result(committed.status, [committed.reason]);
  if (committed.kind === "CLOSED") return result("PRE_PLAY_CLOSED", [committed.reason]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);

  if (committed.kind === "BOTH") {
    // the whole identity already committed (a repeat, a lost reply, a restart): verified and reported without asking again
    const closed = advancedProblems(store, doc, stages);
    if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
    const problems = factProblems(campaign, doc, stages, committed.envelope);
    if (problems.length > 0) return result("LOCAL_DEMAND_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, campaign, committed.envelope);
  }

  const violations = campaign.verify();
  if (violations.length > 0)
    return result("LOCAL_DEMAND_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);

  if (committed.kind === "DEMAND") {
    const closed = advancedProblems(store, doc, [demandStage]);
    if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
  }

  // nothing else of this kind is built beside, and nothing is committed under this identity's keys by anyone else
  const foreign = foreignProcess(store, doc);
  if (foreign) return result(foreign.status, [foreign.reason]);
  if (committed.kind === "NONE" && store.getFact(demandStage.key))
    return result("DEMAND_CONFLICT", [
      `a demand is already held under ${doc.demand.demand_envelope_id}`,
    ]);
  if (store.getFact(startStage.key))
    return result("OPERATION_CONFLICT", [
      `a Production operation is already held for ${doc.demand.demand_envelope_id}`,
    ]);

  const carrier = carrierOf(store, locality, doc);
  if (!carrier.ok) return result(carrier.problem.status, [carrier.problem.reason]);
  const clock = clockOf(store);
  if (!clock.ok) return result(clock.problem.status, [clock.problem.reason]);
  const horizon = horizonProblem(clock.time, doc);
  if (horizon) return result(horizon.status, [horizon.reason]);
  const reserve = reserveOf(store, doc, carrier.carrier.basis);
  if (!reserve.ok) return result(reserve.problem.status, [reserve.problem.reason]);

  const admissible = await dryRun(params, store, doc, buildId, committed.kind === "DEMAND");
  if (!admissible.ok) return result("INVALID_PROCESS", issuesOf(admissible.error));

  const pending: readonly Stage[] = committed.kind === "DEMAND" ? [startStage] : stages;
  const before = store.listFacts();
  const revisionBefore = store.head().revision;
  const subject = subjectOf({
    verb: "establish-local-demand",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    process_id: id,
    pending: pending.map((s) => s.name),
    canonical_time: clock.time,
    demand: doc.demand,
    production: doc.production,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-local-demand",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      id,
      locality.setup_id,
      doc,
      clock.time,
      pending.map((s) => s.name),
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-local-demand", subject))
    return result("DECLINED");

  const economy = new EconomyAdapter(store);
  const production = new ProductionAdapter(store);
  for (const stage of pending) {
    const published =
      stage.name === "demand"
        ? await economy.issueDemand({ ...stage.publication, demand: doc.demand })
        : await production.startOperation({ ...stage.publication, start: doc.production });
    if (!published.ok) {
      if (UNKNOWN_OUTCOME.has(published.error.code)) {
        session.markAmbiguous();
        return result("LOCAL_DEMAND_OUTCOME_UNKNOWN", [`${stage.name}: ${published.error.code}`]);
      }
      const demandHeld = store.getFact(demandStage.key) !== undefined;
      return result(
        demandHeld ? "LOCAL_DEMAND_INCOMPLETE" : "LOCAL_DEMAND_REFUSED",
        [
          `${stage.name}: ${published.error.code}`,
          ...issuesOf(published.error),
          `not committed: ${stages
            .filter((s) => !store.getFact(s.key))
            .map((s) => s.name)
            .join(", ")}`,
        ],
        published.error.code,
      );
    }
    params.terminal.say(`PROGRESS ${stage.name} COMMITTED ${stage.key}`);
  }
  await session.close();

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(params.campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("LOCAL_DEMAND_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("LOCAL_DEMAND_VERIFICATION_FAILED", [
        "the reopened campaign has another identity",
      ]);
    const envelope = EconomyDemandEnvelopeSchema.safeParse(
      back.store.getFact(demandStage.key)?.value,
    );
    if (!envelope.success)
      return result("LOCAL_DEMAND_VERIFICATION_FAILED", ["the demand is not held"]);
    const newKeys = pending.flatMap((s) => newKeysOf(s, doc));
    const problems = [
      ...factProblems(back, doc, stages, envelope.data),
      ...unchangedProblems(
        before,
        back.store.listFacts(),
        newKeys,
        productionReserveKey(doc.production.reserve_id),
        pending.includes(startStage),
        revisionBefore,
        back.store.head().revision,
        pending.length,
      ),
    ];
    if (problems.length > 0) return result("LOCAL_DEMAND_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, back, envelope.data, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The keys a stage newly creates (the Reserve, which the start only advances, is accounted separately). */
function newKeysOf(stage: Stage, d: InitialLocalDemand): string[] {
  const opId = economyRequestId(d.demand.demand_envelope_id);
  return stage.name === "demand"
    ? [economyDemandKey(d.demand.demand_envelope_id), economyRequestKey(opId)]
    : [productionOperationKey(opId), productionClaimKey(productionClaimId(opId))];
}

/**
 * The committed facts are still the first versions this path wrote: once an owner has resolved them (the operation completed and its
 * claim consumed, the Reserve debited, access realized), pre-play is over and setup is closed, replay included.
 */
function advancedProblems(store: Store, d: InitialLocalDemand, stages: readonly Stage[]): string[] {
  const problems: string[] = [];
  const opId = economyRequestId(d.demand.demand_envelope_id);
  const check = (key: string, version: number, what: string) => {
    const f = store.getFact(key);
    if (f && f.version !== version)
      problems.push(`the ${what} has been changed since it was established`);
  };
  for (const s of stages) {
    if (s.name === "demand") {
      check(economyDemandKey(d.demand.demand_envelope_id), 1, "demand");
      check(economyRequestKey(opId), 1, "Production Request");
    } else {
      check(productionOperationKey(opId), 1, "Production operation");
      check(productionClaimKey(productionClaimId(opId)), 1, "claim");
      check(productionReserveKey(d.production.reserve_id), 2, "Reserve");
    }
  }
  if (store.getFact(economyRealizationKey(d.demand.demand_envelope_id)))
    problems.push("the demand has been realized");
  return problems;
}

/** Every new fact against the confirmed document: typed values, owner/facet, keys, versions, and the committed provenance of each group. */
function factProblems(
  campaign: CanonicalCampaign,
  doc: InitialLocalDemand,
  stages: readonly [Stage, Stage],
  envelope: EconomyDemandEnvelope,
): string[] {
  const problems: string[] = [];
  const store = campaign.store;
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  const opId = economyRequestId(doc.demand.demand_envelope_id);
  const [demandStage, startStage] = stages;

  const demandGroup = store.committedGroup(demandStage.publication.intent_id);
  if (demandGroup === null) problems.push("the demand identity is not committed");
  else problems.push(...demandProblems(store, demandGroup, demandStage, doc));

  const startGroup = store.committedGroup(startStage.publication.intent_id);
  const established = startGroup
    ? reserveBeforeStart(startGroup, productionClaimId(opId))
    : undefined;
  if (startGroup === null) problems.push("the start identity is not committed");
  else if (!established || startReserveProblem(established, doc, basisOf(store, doc)))
    problems.push("the Reserve this start was committed against is not the fresh Reserve");
  else problems.push(...startProblems(store, startGroup, startStage, doc, envelope, established));

  const at = envelope.pre_commit_availability.at;
  const demandExpected = expectedDemand(doc, {
    ledgerVersion: envelope.carrier_basis_ref.ledger.version,
    cohortVersion: envelope.carrier_basis_ref.cohort?.version ?? null,
    world: envelope.material_scope.world,
    locus: envelope.material_scope.locus,
    at,
    clockVersion: envelope.pre_commit_availability.temporal_state.version,
  });
  interface Held {
    readonly key: string;
    readonly owner: string;
    readonly facet: string;
    readonly what: string;
    readonly version: number;
    readonly stage: Stage;
    readonly value: unknown;
  }
  const held: Held[] = [
    {
      key: economyDemandKey(doc.demand.demand_envelope_id),
      owner: ECONOMY_OWNER,
      facet: ECONOMY_FACET,
      what: "demand",
      version: 1,
      stage: demandStage,
      value: demandExpected,
    },
    {
      key: economyRequestKey(opId),
      owner: ECONOMY_OWNER,
      facet: ECONOMY_FACET,
      what: "Production Request",
      version: 1,
      stage: demandStage,
      value: expectedRequest(demandExpected),
    },
  ];
  if (established) {
    const e = expectedStart(doc, { reserve: established, at });
    const base = { owner: PRODUCTION_OWNER, facet: PRODUCTION_FACET, stage: startStage } as const;
    held.push(
      {
        ...base,
        key: productionOperationKey(opId),
        what: "Production operation",
        version: 1,
        value: e.operation,
      },
      {
        ...base,
        key: productionClaimKey(productionClaimId(opId)),
        what: "claim",
        version: 1,
        value: e.claim,
      },
      {
        ...base,
        key: productionReserveKey(doc.production.reserve_id),
        what: "Reserve",
        version: 2,
        value: e.reserve,
      },
    );
  }
  for (const h of held) {
    const f = store.getFact(h.key);
    if (!f) {
      problems.push(`the ${h.what} is not held`);
      continue;
    }
    const s = h.stage.publication;
    if (
      f.key !== h.key ||
      f.owner !== h.owner ||
      f.facet !== h.facet ||
      f.version !== h.version ||
      f.provenance.group_id !== s.group_id ||
      f.provenance.intent_id !== s.intent_id ||
      f.provenance.cause !== s.cause ||
      f.basis !== s.basis ||
      f.secrecy !== s.secrecy
    )
      problems.push(
        `the ${h.what} does not carry this identity's owner, key, version or provenance`,
      );
    if (!canonicalEqual(f.value, h.value))
      problems.push(`the ${h.what} differs from the confirmed one`);
  }
  for (const [k, schema] of [
    [economyRequestKey(opId), ProductionRequestSchema],
    [productionOperationKey(opId), ProductionOperationSchema],
    [productionClaimKey(productionClaimId(opId)), ProductionClaimSchema],
    [productionReserveKey(doc.production.reserve_id), ProductionReserveSchema],
  ] as const) {
    const f = store.getFact(k);
    if (f && !schema.safeParse(f.value).success) problems.push(`${k} is not a valid typed fact`);
  }
  return problems;
}

/**
 * Every fact the campaign held before the commit is exactly as it was — except the Reserve, which only gained this operation's open
 * claim (and is compared against its own before-value) — and only the expected new keys were added, one revision per publication.
 */
function unchangedProblems(
  before: readonly OwnerFact[],
  after: readonly OwnerFact[],
  newKeys: readonly string[],
  reserveKey: string,
  startPending: boolean,
  revisionBefore: number,
  revisionAfter: number,
  groups: number,
): string[] {
  const now = new Map(after.map((f) => [f.key, f]));
  const problems: string[] = [];
  for (const f of before) {
    const g = now.get(f.key);
    if (f.key === reserveKey && startPending) {
      const was = ProductionReserveSchema.safeParse(f.value);
      const is = ProductionReserveSchema.safeParse(g?.value);
      const claim = newKeys.find((k) => k.startsWith("production/claim/"));
      if (
        !g ||
        !was.success ||
        !is.success ||
        g.version !== f.version + 1 ||
        claim === undefined ||
        !canonicalEqual(is.data, {
          ...was.data,
          claims: [...was.data.claims, claim.slice("production/claim/".length)].sort(),
        })
      )
        problems.push(
          "the Reserve was changed by more than the addition of this operation's claim",
        );
      continue;
    }
    if (!g || !canonicalEqual(f, g)) problems.push(`an earlier fact is not unchanged: ${f.key}`);
  }
  const added = after.filter((f) => !before.some((b) => b.key === f.key));
  if (
    after.length !== before.length + newKeys.length ||
    added.length !== newKeys.length ||
    added.some((f) => !newKeys.includes(f.key)) ||
    revisionAfter !== revisionBefore + groups
  )
    problems.push("the commit wrote more or less than the expected new facts");
  return problems;
}

function ready(
  campaignId: string,
  id: string,
  doc: InitialLocalDemand,
  campaign: CanonicalCampaign,
  envelope: EconomyDemandEnvelope,
  verifiedUnchanged = false,
): InitialLocalDemandResult {
  const store = campaign.store;
  const opId = economyRequestId(doc.demand.demand_envelope_id);
  const keys: [string, string][] = [
    ["demand", economyDemandKey(doc.demand.demand_envelope_id)],
    ["request", economyRequestKey(opId)],
    ["operation", productionOperationKey(opId)],
    ["claim", productionClaimKey(productionClaimId(opId))],
    ["reserve", productionReserveKey(doc.production.reserve_id)],
  ];
  const t = doc.production.transformation;
  return result("LOCAL_DEMAND_READY", [
    `campaign: ${campaignId}`,
    `process identity: ${id}`,
    ...keys.flatMap(([name, key]) => {
      const f = store.getFact(key);
      return f ? [provenanceLine(name, f)] : [];
    }),
    `demand: ${doc.demand.demand_envelope_id} ${qty(doc.demand.demand_entry.quantity)} of ${doc.demand.demand_entry.output_class}, attributable to ${carrierLine(doc.demand.carrier)}, made AS-OF-NOW at canonical time ${instant(envelope.pre_commit_availability.at)}`,
    `start: operation ${opId} IN_PROGRESS, claiming ${qty(t.input_quantity)} of Reserve ${doc.production.reserve_id} toward ${qty(t.output_quantity)} of ${t.output_class}, declared boundary ${instant(doc.production.completion_at)}; nothing consumed, no output exists, the demand is not satisfied`,
    ...(verifiedUnchanged
      ? [
          "the Population carrier, the world, the locus, the canonical time and every other earlier fact are unchanged, except that the Reserve now holds this operation's claim open",
        ]
      : []),
  ]);
}
