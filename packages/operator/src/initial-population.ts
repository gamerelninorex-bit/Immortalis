import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
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
  CohortRefSchema,
  EstablishLedgerInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  POPULATION_CLOSE_BASIS,
  PopulationBasisSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  canonicalJson,
  fail,
  ok,
  populationCohortKey,
  populationLedgerKey,
  timeEquals,
  worldLocusKey,
  worldProfileKey,
  type CohortFact,
  type CommitGroup,
  type EstablishLedgerInput,
  type OwnerFact,
  type PopulationBasis,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PopulationAdapter,
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
 * Initial local Population and residency Cohort: the shipped, local, out-of-character path that establishes ONE disjoint resident
 * Population ledger and ONE Population-owned residency-indexed Cohort reference to it, at an already committed World-State world and
 * locus of a fresh, operator-confirmed, pre-play scenario — through the existing `PopulationAdapter.establishLedger` and then
 * `PopulationAdapter.instantiateCohort` Population owner operations and nothing else.
 *
 * The operator authors exactly one document in a local file: the strict `EstablishLedgerInput` the Population owner already defines
 * (ledger identity, unit class, world, locus, the authored units with their separate residence, presence and burden allocation, and
 * the canonical time the opening state is established at) and exactly one full, strict `CohortRef`, both unchanged. Both are shown
 * back in full for ONE explicit typed confirmation. Nothing is inferred, defaulted, rolled, enumerated, generated or delegated, and the
 * file can carry no owner, facet, version, count, member list, close, result, publication label or "confirmed" claim (every schema is
 * strict). The service authors only the technical publication identities, derived from the campaign and the exact authored document,
 * so a retry after a crash or a lost reply replays what committed (RC-16), finishes what did not, and anything else under those keys
 * is refused.
 *
 * It writes exactly two new Population keys — the ledger, then (only once that fact is committed) the Cohort — as two separate durable
 * publications in dependency order. The world, the locus, the canonical time and every other fact are read, never written, and are
 * compared byte for byte on a fresh, owner-verified reopen before success is reported. A campaign that holds the ledger without its
 * Cohort is incomplete and is never reported as an established initial Population.
 *
 * Mechanism only. The units are authored opening premises, not a conclusion about culture, loyalty, behaviour or labour. The count is
 * the owner's (units held, EXACT); the Cohort is stored with NO result: only a later ordinary Population reconciliation close, engaged
 * by its own owner-and-temporal route, can derive its members. A Population Unit is not a Named Actor: nothing here creates an actor,
 * mind, social truth, labour supply, perception, knowledge, resource collection, movement, origin event or time, and nothing is
 * generated, rated or estimated.
 */

export const INITIAL_POPULATION_FORMAT = "immortalis-initial-population";
export const INITIAL_POPULATION_FORMAT_VERSION = 1;

/** The most a population file may hold: far beyond any hand-authored opening population, and a bound on what the console is asked to show. */
const MAX_FILE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

/** The Population owner and its one state facet, as the specification-backed registry assigns them (read, never chosen here). */
const POPULATION_OWNER = "population";
const POPULATION_FACET = "population_state";

const sortedUnique = (xs: readonly string[]): boolean =>
  xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);

/**
 * The operator-authored document: the ledger input and the Cohort reference, each exactly its owner schema. The cross-section
 * agreement and the bounded Cohort family below are THIS path's own eligibility conditions, not rules of the Population owner, whose
 * admission still judges everything again.
 */
export const InitialPopulationSchema = z
  .strictObject({
    format: z.literal(INITIAL_POPULATION_FORMAT),
    format_version: z.literal(INITIAL_POPULATION_FORMAT_VERSION),
    ledger: EstablishLedgerInputSchema,
    cohort: CohortRefSchema,
  })
  .superRefine((d, ctx) => {
    const bad = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { ledger, cohort } = d;
    if (ledger.units.length === 0)
      bad("an initial resident Population holds at least one authored unit", ["ledger", "units"]);
    if (!sortedUnique(ledger.units.map((u) => u.unit_id).sort()))
      bad("a unit is counted once: unit identifiers are unique", ["ledger", "units"]);
    if (cohort.scope.ledger_id !== ledger.ledger_id)
      bad("the Cohort belongs to this ledger", ["cohort", "scope", "ledger_id"]);
    if (cohort.scope.place !== ledger.locus_id)
      bad("the Cohort is the residents of the selected established locus", [
        "cohort",
        "scope",
        "place",
      ]);
    if (cohort.unit_class !== ledger.unit_class)
      bad("the Cohort has the ledger's unit class", ["cohort", "unit_class"]);
    if (cohort.criterion.owner !== POPULATION_OWNER || cohort.criterion.ref !== null)
      bad("this path admits only a Population-owned criterion with no reference", [
        "cohort",
        "criterion",
      ]);
    if (cohort.indexed_fact !== "RESIDENCE")
      bad("this path admits only the RESIDENCE-indexed Cohort", ["cohort", "indexed_fact"]);
    if (cohort.membership_basis !== "INDEXED_FACT_AT_PLACE")
      bad("this path admits only the indexed-fact-at-place membership basis", [
        "cohort",
        "membership_basis",
      ]);
    if (cohort.form !== "OVERLAPPING_VIEW" || cohort.overlap.declaration !== "OVERLAPPING")
      bad("this path admits only an overlapping view", ["cohort", "form"]);
    if (cohort.cardinality_semantics !== "EXACT")
      bad("this path admits only an EXACT Cohort", ["cohort", "cardinality_semantics"]);
    if (
      !canonicalEqual(cohort.temporal_read.close_basis, POPULATION_CLOSE_BASIS) ||
      !canonicalEqual(cohort.invalidators, [{ fact_key: populationLedgerKey(ledger.ledger_id) }])
    )
      bad("the Cohort is read at the Population close and invalidated by exactly its ledger", [
        "cohort",
        "invalidators",
      ]);
  });
export type InitialPopulation = z.infer<typeof InitialPopulationSchema>;

export type PopulationFileErrorCode =
  "POPULATION_FILE_UNTRUSTED" | "POPULATION_FILE_UNREADABLE" | "INVALID_POPULATION";

const byUnit = (a: { unit_id: string }, b: { unit_id: string }): number =>
  a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0;

/** The document with its units in the owner's order (by identifier), the order in which they are shown, confirmed and committed. */
const normalized = (d: InitialPopulation): InitialPopulation => ({
  ...d,
  ledger: { ...d.ledger, units: [...d.ledger.units].sort(byUnit) },
});

/**
 * Reads the operator's file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system user,
 * not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readInitialPopulationFile(
  path: string,
): Result<InitialPopulation, PopulationFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("POPULATION_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "POPULATION_FILE_UNTRUSTED",
          "the population file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_FILE_BYTES)
        return fail("INVALID_POPULATION", "the population file is larger than a population can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("POPULATION_FILE_UNREADABLE", "the population file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_POPULATION", "the population file is not valid JSON");
  }
  const parsed = InitialPopulationSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_POPULATION", "the population file is not a complete, valid population", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  const doc = normalized(parsed.data);
  // the owner's own ledger shape, judged before anything is shown or written
  const basis = PopulationBasisSchema.safeParse(expectedLedger(doc));
  if (!basis.success)
    return fail("INVALID_POPULATION", "the population is not a valid resident Population ledger", {
      issues: basis.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return ok(doc);
}

/**
 * The identity of one confirmed initial Population in one campaign: a hash of exactly the authored content (the campaign, the ledger
 * and the Cohort), never a clock or a random value. The same confirmed proposal always reaches the same identities; any other content,
 * even under the same keys, meets the committed identities and is refused.
 */
export const initialPopulationId = (campaignId: string, d: InitialPopulation): string =>
  createHash("sha256")
    .update(canonicalJson({ campaign_id: campaignId, ledger: d.ledger, cohort: d.cohort }), "utf8")
    .digest("hex")
    .slice(0, 32);

export type InitialPopulationStatus =
  | "POPULATION_READY"
  | "POPULATION_INCOMPLETE"
  | "POPULATION_OUTCOME_UNKNOWN"
  | "POPULATION_REFUSED"
  | "POPULATION_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "TIME_NOT_ESTABLISHED"
  | "TIME_MISMATCH"
  | "POPULATION_NOT_AT_LOCALITY"
  | "LEDGER_CONFLICT"
  | "COHORT_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | PopulationFileErrorCode;

export interface InitialPopulationResult {
  readonly status: InitialPopulationStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<InitialPopulationStatus, string> = {
  POPULATION_READY:
    "the initial Population ledger and its residency Cohort are established and an owner-verified reopen of the package reads back exactly the confirmed ledger and Cohort reference (the Cohort holds no result), with every earlier fact unchanged; this is an opening setting only: nobody here is an actor, has a mind, belief, loyalty or labour, and no member or count of the Cohort exists until Population's own ordinary close derives it",
  POPULATION_INCOMPLETE:
    "the ledger is committed but its Cohort is NOT; the initial Population is NOT established; rerun the same command with the same file to finish it",
  POPULATION_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; the initial Population is NOT reported established; rerun the same command with the same file (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identities",
  POPULATION_REFUSED: "the Population owner refused the write; nothing was committed",
  POPULATION_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed population or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, the established locality has been changed, or Population has since changed the ledger or Cohort); nothing was changed",
  TIME_NOT_ESTABLISHED:
    "this campaign holds no canonical time; the opening state of a Population is established at an existing canonical time and none is created here; nothing was changed",
  TIME_MISMATCH:
    "the ledger's point is not this campaign's canonical time (or is in another unit); nothing was changed",
  POPULATION_NOT_AT_LOCALITY:
    "the ledger is not at a world and locus this campaign's confirmed scenario established; nothing was changed",
  LEDGER_CONFLICT:
    "this campaign already holds a Population ledger under this identifier, or another initial Population, or this proposal's ledger identity is committed with different content; committed facts are never replaced and nothing was changed",
  COHORT_CONFLICT:
    "this campaign already holds a Cohort under this identifier, or this proposal's Cohort identity is committed with different content or without its ledger; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  POPULATION_FILE_UNTRUSTED: "the population file is not trusted; nothing was changed",
  POPULATION_FILE_UNREADABLE: "the population file cannot be read; nothing was changed",
  INVALID_POPULATION:
    "the population is not a complete, valid initial ledger and Cohort that this path admits; nothing was changed",
};

const result = (
  status: InitialPopulationStatus,
  details: readonly string[] = [],
  code?: string,
): InitialPopulationResult => ({
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

type StageName = "ledger" | "cohort";

interface Stage {
  readonly name: StageName;
  readonly key: string;
  readonly publication: Publication;
}

function planOf(
  campaignId: string,
  d: InitialPopulation,
): { id: string; stages: readonly [Stage, Stage] } {
  const id = initialPopulationId(campaignId, d);
  const pub = (name: StageName): Publication => ({
    group_id: `operator-initial-population:${id}:${name}`,
    intent_id: `operator-initial-population-intent:${id}:${name}`,
    cause: `operator-initial-population-cause:${id}`,
    basis: OPERATOR_PUBLICATION_BASIS,
    secrecy: OPERATOR_PUBLICATION_SECRECY,
  });
  return {
    id,
    stages: [
      { name: "ledger", key: populationLedgerKey(d.ledger.ledger_id), publication: pub("ledger") },
      {
        name: "cohort",
        key: populationCohortKey(d.ledger.ledger_id, d.cohort.cohort_id),
        publication: pub("cohort"),
      },
    ],
  };
}

/**
 * The ledger value the Population owner derives from an input (WS-001 §1, §2; WS-015 §III): the authored units exactly, the count the
 * units held (EXACT), a disjoint resident population attached by reference to the world and locus, nothing consumed, stamped with the
 * establishment point. Written out here independently of the adapter so that what the package holds is compared with the confirmed
 * input, not with itself.
 */
export function expectedLedger(d: InitialPopulation): PopulationBasis {
  const l: EstablishLedgerInput = d.ledger;
  return {
    ledger_id: l.ledger_id,
    unit_class: l.unit_class,
    count_custodian: POPULATION_OWNER,
    locality: {
      world: { fact_key: worldProfileKey(l.world_id), entity_id: l.world_id },
      locus: { fact_key: worldLocusKey(l.world_id, l.locus_id), entity_id: l.locus_id },
    },
    overlap: "DISJOINT_RESIDENT_POPULATION",
    units: [...l.units].sort(byUnit),
    count: { semantics: "EXACT", count: l.units.length },
    consumed_envelopes: [],
    basis_stamp: { basis: { kind: "ESTABLISHMENT", point: l.point }, constituents: [] },
  };
}

/** The Cohort fact the Population owner stores for a reference: the reference exactly, and no result until a close derives one. */
export const expectedCohort = (d: InitialPopulation): CohortFact => ({
  ref: d.cohort,
  result: null,
});

const provenanceLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  d: InitialPopulation,
  pending: readonly StageName[],
): string[] {
  const { ledger, cohort } = d;
  return [
    `CONFIRMATION — INITIAL POPULATION AND RESIDENCY COHORT`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  population identity: ${id} (established locality ${localityId})`,
    `  to commit, in this order: ${pending.join(" → ")}`,
    ``,
    `THE OPENING FACTS YOU ARE CONFIRMING (authored by you; nothing is inferred, estimated, generated or defaulted):`,
    `POPULATION LEDGER — a disjoint resident population, EXACT, count held by Population`,
    `  ledger: ${quoted(ledger.ledger_id)}   unit class: ${quoted(ledger.unit_class)}`,
    `  at locus ${quoted(ledger.locus_id)} of world ${quoted(ledger.world_id)}`,
    `  established at canonical time ${ledger.point.value} ${quoted(ledger.point.unit)}`,
    `  EXACT count: ${ledger.units.length} authored units (residence, presence and burden allocation are separate facts)`,
    ...ledger.units.map(
      (u) =>
        `    - unit ${quoted(u.unit_id)}: residence ${quoted(u.residence)}, presence ${quoted(u.presence)}, burden allocation ${u.burden_allocation === null ? "none" : quoted(u.burden_allocation)}`,
    ),
    `RESIDENCY COHORT REFERENCE — a Population-owned overlapping view, EXACT, read at Population's ordinary close, CURRENT-ONLY`,
    `  cohort: ${quoted(cohort.cohort_id)}   unit class: ${quoted(cohort.unit_class)}`,
    `  members: the units of ledger ${quoted(cohort.scope.ledger_id)} whose RESIDENCE is ${quoted(cohort.scope.place)}`,
    `  criterion: Population's own (no external criterion); invalidated by its ledger`,
    `  result: NONE — no member and no count of this Cohort exists until Population's own ordinary close derives them`,
    ``,
    `Confirming commits these as TWO Population-owned facts (each version 1), one durable Population publication at a time: the ledger`,
    `first, and the Cohort reference only after the ledger is committed. The world, the locus, the canonical time and every other fact are`,
    `read and left exactly as they are. The units are your authored opening premises, not a finding about anyone's culture, loyalty,`,
    `behaviour or labour; a Population Unit is not an actor. It creates no actor, mind, social truth, labour supply, perception,`,
    `knowledge, resource collection, movement or origin event, advances no time, and no close is run. Committed facts are never replaced.`,
  ];
}

/** The ways the world/locus the ledger names can be one of the confirmed scenario's, and the committed facts it will read and pin. */
const ADDITIONAL_LOCUS_GROUP = /^operator-additional-locality:([0-9a-f]{32}):locus$/;

type Place =
  | { readonly ok: true; readonly world: OwnerFact; readonly locus: OwnerFact }
  | { readonly ok: false; readonly reason: string };

/**
 * The world and locus the ledger names, as committed: the ORIGINAL world the confirmed scenario established, and a locus of it that the
 * operator's own confirmed commands committed at version 1 — the first locus `establish-locality` wrote, or a COMPLETE additional
 * locality's locus (its source stage committed too). Anything else, including a locus another writer committed, is not offered here.
 */
function placeOf(
  campaign: CanonicalCampaign,
  locality: Extract<EstablishedLocality, { kind: "ESTABLISHED" }>,
  l: EstablishLedgerInput,
): Place {
  const store = campaign.store;
  if (l.world_id !== locality.world_id)
    return { ok: false, reason: `the established world is ${locality.world_id}` };
  const locus = store.getFact(worldLocusKey(l.world_id, l.locus_id));
  if (!locus) return { ok: false, reason: `no locus ${l.locus_id} is committed in that world` };
  if (locus.key === locality.locus.key) return { ok: true, world: locality.world, locus };
  const m = ADDITIONAL_LOCUS_GROUP.exec(locus.provenance.group_id);
  if (!m || locus.version !== 1 || locus.owner !== "world_state" || locus.facet !== "world_locus")
    return {
      ok: false,
      reason: `locus ${l.locus_id} is not one the operator-confirmed scenario established`,
    };
  const source = store.committedGroup(`operator-additional-locality-intent:${m[1]}:source`);
  if (source === null || source.group_id !== `operator-additional-locality:${m[1]}:source`)
    return {
      ok: false,
      reason: `locus ${l.locus_id} is an incomplete additional locality (its source is not committed)`,
    };
  return { ok: true, world: locality.world, locus };
}

/**
 * The campaign's canonical time against the ledger's point: the Temporal owner's committed state must exist and be a valid state, and
 * the opening state is established at exactly that time. Read only; no time is created, chosen or advanced here.
 */
function timeProblem(
  store: CanonicalCampaign["store"],
  l: EstablishLedgerInput,
): { status: "TIME_NOT_ESTABLISHED" | "TIME_MISMATCH"; reason: string } | undefined {
  const clock = store.getFact(TEMPORAL_STATE_KEY);
  if (!clock) return { status: "TIME_NOT_ESTABLISHED", reason: "no canonical time is committed" };
  const state = TemporalStateSchema.safeParse(clock.value);
  if (!state.success)
    return { status: "TIME_NOT_ESTABLISHED", reason: "the committed canonical time is not valid" };
  if (!timeEquals(l.point, state.data.canonical_time))
    return {
      status: "TIME_MISMATCH",
      reason: `the canonical time is ${state.data.canonical_time.value} ${JSON.stringify(state.data.canonical_time.unit)}`,
    };
  return undefined;
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine Population owner operations admit this exact ledger
 * and Cohort at the campaign's committed world and locus: the world and locus, as committed, are republished on a scratch package, the
 * ledger and then the Cohort are run through the genuine owner operations, and the scratch package is removed. The strict schemas are
 * not the whole of what the owner admission checks, and a refusal after the ledger had committed would strand a half-built population.
 * Nothing here is reused: the scratch package is not the campaign.
 */
async function dryRun(
  campaignId: string,
  place: Extract<Place, { ok: true }>,
  d: InitialPopulation,
  buildId: string,
): Promise<Result<null, "INVALID_POPULATION">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-initial-population-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_POPULATION", "the population could not be checked", {
        issues: [created.error.code],
      });
    try {
      const pub = (name: string): Publication => ({
        group_id: `dry-run-${name}`,
        intent_id: `dry-run-intent-${name}`,
        cause: "dry-run-cause",
        basis: OPERATOR_PUBLICATION_BASIS,
        secrecy: OPERATOR_PUBLICATION_SECRECY,
      });
      const population = new PopulationAdapter(created.value.store);
      const steps: readonly [string, () => Promise<Result<unknown, string>>][] = [
        [
          "world",
          () => created.value.establishWorld({ ...pub("world"), world: place.world.value }),
        ],
        [
          "locus",
          () => created.value.establishLocus({ ...pub("locus"), locus: place.locus.value }),
        ],
        ["ledger", () => population.establishLedger({ ...pub("ledger"), ledger: d.ledger })],
        ["cohort", () => population.instantiateCohort({ ...pub("cohort"), ref: d.cohort })],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_POPULATION", "the owner path refuses this population", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_POPULATION", "the population could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishInitialPopulationParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly populationFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one initial Population ledger with its one residency Cohort.
 *
 *   read the file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character → replay-and-verify when both identities already committed → otherwise (for whatever is still
 *   to be written) require a committed scenario world and locus and, for the ledger, the existing canonical time, prove the owner path
 *   admits it, ask ONE confirmation → commit the ledger, then the Cohort → reopen the package afresh, owner-verified, and compare →
 *   report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A population
 * already committed under this identity is verified and reported without asking again; one committed only in part is finished from the
 * same file.
 */
export async function establishInitialPopulation(
  params: EstablishInitialPopulationParams,
): Promise<InitialPopulationResult> {
  const read = readInitialPopulationFile(params.populationFile);
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
    return result("POPULATION_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishInitialPopulationParams;
  readonly session: LocalOperatorSession;
  readonly doc: InitialPopulation;
  readonly id: string;
  readonly stages: readonly [Stage, Stage];
  readonly buildId: string;
}

/** What this identity has committed so far, judged on the immutable committed groups (never on the facts, which an owner may advance). */
type Committed =
  | { readonly kind: "NONE" }
  | { readonly kind: "LEDGER" }
  | { readonly kind: "BOTH" }
  | {
      readonly kind: "CONFLICT";
      readonly status: InitialPopulationStatus;
      readonly reason: string;
    };

/**
 * One committed stage group against the confirmed document: one Population write, created from nothing, with the exact derived value,
 * the Population owner and facet, the operator's technical identities, and reads of — and dependencies on — exactly what it was
 * established against (the world and locus for the ledger, the ledger at its first version for the Cohort).
 */
function groupProblems(
  store: CanonicalCampaign["store"],
  group: CommitGroup | null,
  stage: Stage,
  stages: readonly [Stage, Stage],
  d: InitialPopulation,
): string[] {
  if (group === null) return [`the ${stage.name} identity is not committed`];
  const write = group.writes[0];
  const l = d.ledger;
  const worldKey = worldProfileKey(l.world_id);
  const locusKey = worldLocusKey(l.world_id, l.locus_id);
  const readKeys = group.reads.map((x) => `${x.key}@${x.version}`).sort();
  const wantReads =
    stage.name === "ledger" ? [`${worldKey}@1`, `${locusKey}@1`].sort() : [`${stages[0].key}@1`];
  let wantDepends: string[];
  if (stage.name === "ledger") {
    const pinned = [worldKey, locusKey].map((k) => store.getFact(k));
    if (pinned.some((f) => f === undefined)) return [`the ${stage.name} basis is not held`];
    wantDepends = [...new Set(pinned.flatMap((f) => f?.provenance.group_id ?? []))].sort();
  } else {
    wantDepends = [stages[0].publication.group_id];
  }
  if (
    group.group_id !== stage.publication.group_id ||
    group.intent_id !== stage.publication.intent_id ||
    group.cause !== stage.publication.cause ||
    group.owner !== POPULATION_OWNER ||
    group.facet !== POPULATION_FACET ||
    group.writes.length !== 1 ||
    write?.key !== stage.key ||
    write.owner !== POPULATION_OWNER ||
    write.facet !== POPULATION_FACET ||
    write.expected_version !== 0 ||
    write.basis !== stage.publication.basis ||
    write.secrecy !== stage.publication.secrecy ||
    !canonicalEqual(write.value, stage.name === "ledger" ? expectedLedger(d) : expectedCohort(d)) ||
    !canonicalEqual(readKeys, wantReads) ||
    !canonicalEqual([...group.depends_on].sort(), wantDepends)
  )
    return [
      `the ${stage.name} identity is committed with different content than the confirmed one`,
    ];
  return [];
}

function committedOf(
  campaign: CanonicalCampaign,
  doc: InitialPopulation,
  stages: readonly [Stage, Stage],
): Committed {
  const store = campaign.store;
  const [ledgerStage, cohortStage] = stages;
  const ledger = store.committedGroup(ledgerStage.publication.intent_id);
  const cohort = store.committedGroup(cohortStage.publication.intent_id);
  if (cohort && !ledger)
    return {
      kind: "CONFLICT",
      status: "COHORT_CONFLICT",
      reason: "the Cohort is committed without its ledger",
    };
  if (ledger) {
    const problems = groupProblems(store, ledger, ledgerStage, stages, doc);
    if (problems.length > 0 || !store.getFact(ledgerStage.key))
      return {
        kind: "CONFLICT",
        status: "LEDGER_CONFLICT",
        reason: problems[0] ?? "this identity's ledger is committed, but its fact is not held",
      };
  }
  if (cohort) {
    const problems = groupProblems(store, cohort, cohortStage, stages, doc);
    if (problems.length > 0 || !store.getFact(cohortStage.key))
      return {
        kind: "CONFLICT",
        status: "COHORT_CONFLICT",
        reason: problems[0] ?? "this identity's Cohort is committed, but its fact is not held",
      };
  }
  return { kind: cohort ? "BOTH" : ledger ? "LEDGER" : "NONE" };
}

/** Another initial Population of this command, or any other ledger, held in the campaign: never abandoned, never built beside. */
function otherLedger(campaign: CanonicalCampaign, ledgerKey: string): string | undefined {
  for (const f of campaign.store.listFacts())
    if (
      f.owner === POPULATION_OWNER &&
      /^population\/[^/]+\/ledger$/.test(f.key) &&
      f.key !== ledgerKey
    )
      return f.key;
  return undefined;
}

async function run(a: RunArgs): Promise<InitialPopulationResult> {
  const { params, session, doc, id, stages, buildId } = a;
  const [ledgerStage, cohortStage] = stages;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);
  // an established locality that a later owner write has advanced ends pre-play, whatever else this identity has committed
  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);

  const committed = committedOf(campaign, doc, stages);
  if (committed.kind === "CONFLICT") return result(committed.status, [committed.reason]);
  if (committed.kind === "BOTH") {
    // the whole identity already committed (a repeat, a lost reply, a restart): verified and reported without asking again
    if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
      return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
    const closed = advancedProblems(store, stages);
    if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
    const problems = factProblems(campaign, doc, stages);
    if (problems.length > 0) return result("POPULATION_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, campaign, stages);
  }

  const violations = campaign.verify();
  if (violations.length > 0)
    return result("POPULATION_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  if (committed.kind === "LEDGER") {
    const closed = advancedProblems(store, [ledgerStage]);
    if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
  }
  const place = placeOf(campaign, locality, doc.ledger);
  if (!place.ok) return result("POPULATION_NOT_AT_LOCALITY", [place.reason]);
  if (committed.kind === "NONE") {
    // the ledger is established at the existing canonical time; a resumed Cohort is judged on its committed ledger alone
    if (store.getFact(ledgerStage.key))
      return result("LEDGER_CONFLICT", [
        `a Population ledger is already held under ${doc.ledger.ledger_id}`,
      ]);
    const time = timeProblem(store, doc.ledger);
    if (time) return result(time.status, [time.reason]);
  }
  if (store.getFact(cohortStage.key))
    return result("COHORT_CONFLICT", [
      `a Cohort is already held under ${doc.cohort.cohort_id} of ledger ${doc.ledger.ledger_id}`,
    ]);
  const other = otherLedger(campaign, ledgerStage.key);
  if (other !== undefined)
    return result("LEDGER_CONFLICT", [`another Population ledger is already held: ${other}`]);

  const admissible = await dryRun(params.campaignId, place, doc, buildId);
  if (!admissible.ok) return result("INVALID_POPULATION", issuesOf(admissible.error));

  const pending: readonly Stage[] = committed.kind === "LEDGER" ? [cohortStage] : stages;
  const before = store.listFacts();
  const revisionBefore = store.head().revision;
  const subject = subjectOf({
    verb: "establish-population",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    population_id: id,
    pending: pending.map((s) => s.name),
    ledger: doc.ledger,
    cohort: doc.cohort,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-population",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      id,
      locality.setup_id,
      doc,
      pending.map((s) => s.name),
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-population", subject))
    return result("DECLINED");

  const population = new PopulationAdapter(store);
  for (const stage of pending) {
    const published =
      stage.name === "ledger"
        ? await population.establishLedger({ ...stage.publication, ledger: doc.ledger })
        : await population.instantiateCohort({ ...stage.publication, ref: doc.cohort });
    if (!published.ok) {
      if (UNKNOWN_OUTCOME.has(published.error.code)) {
        session.markAmbiguous();
        return result("POPULATION_OUTCOME_UNKNOWN", [`${stage.name}: ${published.error.code}`]);
      }
      const ledgerHeld = store.getFact(ledgerStage.key) !== undefined;
      return result(
        ledgerHeld ? "POPULATION_INCOMPLETE" : "POPULATION_REFUSED",
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
    return result("POPULATION_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("POPULATION_VERIFICATION_FAILED", [
        "the reopened campaign has another identity",
      ]);
    const problems = [
      ...factProblems(back, doc, stages),
      ...unchangedProblems(
        before,
        back.store.listFacts(),
        pending.map((s) => s.key),
        revisionBefore,
        back.store.head().revision,
      ),
    ];
    if (problems.length > 0) return result("POPULATION_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, back, stages, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The committed Population facts are still the first versions this path wrote: once Population has reconciled them, pre-play is over. */
function advancedProblems(store: CanonicalCampaign["store"], stages: readonly Stage[]): string[] {
  const problems: string[] = [];
  for (const s of stages) {
    const f = store.getFact(s.key);
    if (f && f.version !== 1)
      problems.push(`the ${s.name} has been changed by Population since it was established`);
  }
  return problems;
}

/** Both new facts against the confirmed document: typed values, owner/facet, keys, versions, and the committed provenance of each one-write group. */
function factProblems(
  campaign: CanonicalCampaign,
  doc: InitialPopulation,
  stages: readonly [Stage, Stage],
): string[] {
  const problems: string[] = [];
  const store = campaign.store;
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  for (const s of stages) {
    const f = store.getFact(s.key);
    if (!f) {
      problems.push(`the ${s.name} is not held`);
      continue;
    }
    problems.push(
      ...groupProblems(store, store.committedGroup(s.publication.intent_id), s, stages, doc),
    );
    if (
      f.key !== s.key ||
      f.owner !== POPULATION_OWNER ||
      f.facet !== POPULATION_FACET ||
      f.version !== 1 ||
      f.provenance.group_id !== s.publication.group_id ||
      f.provenance.intent_id !== s.publication.intent_id ||
      f.provenance.cause !== s.publication.cause ||
      f.basis !== s.publication.basis ||
      f.secrecy !== s.publication.secrecy
    )
      problems.push(
        `the ${s.name} does not carry this identity's owner, key, version or provenance`,
      );
  }
  const ledger = store.getFact(stages[0].key);
  if (ledger) {
    if (!PopulationBasisSchema.safeParse(ledger.value).success)
      problems.push("the ledger is not a valid typed Population ledger");
    else if (!canonicalEqual(ledger.value, expectedLedger(doc)))
      problems.push("the ledger differs from the confirmed ledger");
  }
  const cohort = store.getFact(stages[1].key);
  if (cohort) {
    if (!CohortFactSchema.safeParse(cohort.value).success)
      problems.push("the Cohort is not a valid typed Population Cohort");
    else if (!canonicalEqual(cohort.value, expectedCohort(doc)))
      problems.push("the Cohort differs from the confirmed reference or holds a result");
  }
  return problems;
}

/** Every fact the campaign held before the commit is exactly as it was, and only the expected new keys were added. */
function unchangedProblems(
  before: readonly OwnerFact[],
  after: readonly OwnerFact[],
  newKeys: readonly string[],
  revisionBefore: number,
  revisionAfter: number,
): string[] {
  const now = new Map(after.map((f) => [f.key, f]));
  const problems: string[] = [];
  for (const f of before) {
    const g = now.get(f.key);
    if (!g || !canonicalEqual(f, g)) problems.push(`an earlier fact is not unchanged: ${f.key}`);
  }
  const added = after.filter((f) => !before.some((b) => b.key === f.key));
  if (
    after.length !== before.length + newKeys.length ||
    added.length !== newKeys.length ||
    added.some((f) => !newKeys.includes(f.key)) ||
    revisionAfter !== revisionBefore + newKeys.length
  )
    problems.push("the commit wrote more or less than the expected new facts");
  return problems;
}

function ready(
  campaignId: string,
  id: string,
  doc: InitialPopulation,
  campaign: CanonicalCampaign,
  stages: readonly [Stage, Stage],
  verifiedUnchanged = false,
): InitialPopulationResult {
  const ledger = campaign.store.getFact(stages[0].key);
  const cohort = campaign.store.getFact(stages[1].key);
  const l = doc.ledger;
  return result("POPULATION_READY", [
    `campaign: ${campaignId}`,
    `population identity: ${id}`,
    ...(ledger ? [provenanceLine(stages[0].name, ledger)] : []),
    ...(cohort ? [provenanceLine(stages[1].name, cohort)] : []),
    `ledger: ${l.ledger_id} DISJOINT_RESIDENT_POPULATION, EXACT ${l.units.length} authored unit(s) of class ${l.unit_class}, at locus ${l.locus_id} of world ${l.world_id}, established at canonical time ${l.point.value} ${l.point.unit}`,
    `cohort: ${doc.cohort.cohort_id} RESIDENCE at ${doc.cohort.scope.place}; no result: its members and count do not exist until Population's own ordinary close`,
    ...(verifiedUnchanged
      ? ["the world, the locus, the canonical time and every other earlier fact are unchanged"]
      : []),
  ]);
}
