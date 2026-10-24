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
import {
  EstablishReserveInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  ProductionReserveSchema,
  canonicalJson,
  fail,
  ok,
  productionReserveKey,
  worldLocusKey,
  worldProfileKey,
  type EstablishReserveInput,
  type OwnerFact,
  type ProductionReserve,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
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
 * Initial Production Reserve admission: the shipped, local, out-of-character path that establishes ONE initially unclaimed Production
 * Reserve at an already committed World-State world and locus of a fresh, operator-confirmed, pre-play scenario — through the existing
 * `ProductionAdapter.establishReserve` Production owner operation and nothing else.
 *
 * The operator authors exactly one `EstablishReserveInput` document (the strict schema the Production owner already defines,
 * unchanged, with no wrapper) in a local file; it is shown back in full for ONE explicit typed confirmation. Nothing is inferred,
 * defaulted, rolled, enumerated or delegated, and the file can carry no owner, facet, version, holding, claim, inflow, consumption,
 * title, publication label or "confirmed" claim (the schema is strict). The service authors only the technical publication
 * identities, derived from the campaign and the exact authored input, so a retry after a crash or a lost reply replays what committed
 * (RC-16) and anything else under the same Reserve key is refused.
 *
 * It writes exactly the new `production/reserve/<reserve_id>` key and nothing more: the world, the locus, any source and every other
 * fact are read, never written, and are compared byte for byte on a fresh, owner-verified reopen before success is reported. The
 * Reserve is established under the Production owner at version 1, held locally by Production, with no claims, no consumption and no
 * inflow; Production's own admission requires the world and locus to be committed and the locus to belong to the world.
 *
 * Mechanism only. The starting quantity (zero or positive) is an authored initial setting, never a demonstrated collection or
 * conversion, a delivery of any Source Delta, an entitlement, title, access right, actor intent, productive success or consumption.
 * Establishing it creates no actor, character, perception, knowledge, labour, movement or time, and credits nothing from any source.
 * Later positive inflow needs a separately owner-produced Source Delta and World-State delivery, never an operator assertion.
 */

/** The most a Reserve file may hold: far beyond any hand-authored Reserve, and a bound on what the console is asked to show. */
const MAX_RESERVE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

/** The Production owner and its one state facet, as the specification-backed registry assigns them to a Reserve (read, never chosen here). */
const PRODUCTION_OWNER = "production";
const PRODUCTION_FACET = "production_state";

export type ReserveFileErrorCode =
  "RESERVE_FILE_UNTRUSTED" | "RESERVE_FILE_UNREADABLE" | "INVALID_RESERVE";

/**
 * Reads the operator's Reserve file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system
 * user, not writable by anyone else, of bounded size, exactly one strictly valid `EstablishReserveInput`. What was read is what is
 * shown, confirmed and used.
 */
export function readProductionReserveFile(
  path: string,
): Result<EstablishReserveInput, ReserveFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("RESERVE_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "RESERVE_FILE_UNTRUSTED",
          "the Reserve file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_RESERVE_BYTES)
        return fail("INVALID_RESERVE", "the Reserve file is larger than a Reserve can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("RESERVE_FILE_UNREADABLE", "the Reserve file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_RESERVE", "the Reserve file is not valid JSON");
  }
  const parsed = EstablishReserveInputSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_RESERVE", "the Reserve file is not a complete, valid Reserve", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return ok(parsed.data);
}

/** The identity of one Reserve proposal in one campaign: a hash of the campaign and the exact authored input, never a clock or a random value. */
export const productionReserveId = (campaignId: string, r: EstablishReserveInput): string =>
  createHash("sha256")
    .update(canonicalJson({ campaign_id: campaignId, reserve: r }), "utf8")
    .digest("hex")
    .slice(0, 32);

export type ProductionReserveStatus =
  | "RESERVE_READY"
  | "RESERVE_OUTCOME_UNKNOWN"
  | "RESERVE_REFUSED"
  | "RESERVE_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "RESERVE_NOT_AT_LOCALITY"
  | "RESERVE_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | ReserveFileErrorCode;

export interface ProductionReserveResult {
  readonly status: ProductionReserveStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<ProductionReserveStatus, string> = {
  RESERVE_READY:
    "the Production Reserve is established and an owner-verified reopen of the package reads back exactly the confirmed Reserve, with every earlier fact unchanged; this is an initial physical setting only: nobody collected, was given, owns, may use or consumed anything because of it",
  RESERVE_OUTCOME_UNKNOWN:
    "the outcome of the write is not known; the Reserve is NOT reported established; rerun the same command (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identity",
  RESERVE_REFUSED: "the Production owner refused the write; nothing was committed",
  RESERVE_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed Reserve or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, the established locality has been changed, or the Reserve has since been changed by Production); nothing was changed",
  RESERVE_NOT_AT_LOCALITY:
    "the Reserve is not at a world and locus this campaign's confirmed scenario established; nothing was changed",
  RESERVE_CONFLICT:
    "this campaign already holds a Reserve under this identifier, or this proposal's identity is committed with different content; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  RESERVE_FILE_UNTRUSTED: "the Reserve file is not trusted; nothing was changed",
  RESERVE_FILE_UNREADABLE: "the Reserve file cannot be read; nothing was changed",
  INVALID_RESERVE:
    "the Reserve is not a complete, valid initial Reserve that the Production owner admits; nothing was changed",
};

const result = (
  status: ProductionReserveStatus,
  details: readonly string[] = [],
  code?: string,
): ProductionReserveResult => ({
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

const publicationOf = (id: string): Publication => ({
  group_id: `operator-production-reserve:${id}`,
  intent_id: `operator-production-reserve-intent:${id}`,
  cause: `operator-production-reserve-cause:${id}`,
  basis: OPERATOR_PUBLICATION_BASIS,
  secrecy: OPERATOR_PUBLICATION_SECRECY,
});

/**
 * The Reserve value the Production owner derives from an input (WS-003 §2, §4, §10): the whole established quantity held, nothing
 * consumed, no claim, no inflow collection, held locally by Production, attached by reference to the world and locus. Written out here
 * independently of the adapter so that what the package holds is compared with the confirmed input, not with itself.
 */
export function expectedReserve(r: EstablishReserveInput): ProductionReserve {
  return ProductionReserveSchema.parse({
    reserve_id: r.reserve_id,
    material_class: r.material_class,
    established: r.quantity,
    quantity: r.quantity,
    consumed: [],
    condition: r.condition,
    locality: {
      world: { fact_key: worldProfileKey(r.world_id), entity_id: r.world_id },
      locus: { fact_key: worldLocusKey(r.world_id, r.locus_id), entity_id: r.locus_id },
    },
    holding: "HELD_LOCAL_BY_PRODUCTION",
    claims: [],
  });
}

const provenanceLine = (f: OwnerFact): string =>
  `reserve: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  r: EstablishReserveInput,
): string[] {
  return [
    `CONFIRMATION — INITIAL PRODUCTION RESERVE`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  reserve identity: ${id} (established locality ${localityId})`,
    ``,
    `THE INITIAL SETTING FACT YOU ARE CONFIRMING (authored by you; nothing is inferred, estimated or defaulted):`,
    `PRODUCTION RESERVE — held locally by Production, unclaimed, nothing consumed`,
    `  reserve: ${quoted(r.reserve_id)}`,
    `  material class: ${quoted(r.material_class)}`,
    `  condition: ${quoted(r.condition)}`,
    `  EXACT starting quantity: ${r.quantity.amount} ${r.quantity.unit}`,
    `  at locus ${quoted(r.locus_id)} of world ${quoted(r.world_id)}`,
    ``,
    `Confirming commits this as ONE Production-owned Reserve fact (version 1) in one durable Production publication.`,
    `The world, the locus, any source and every other fact are read and left exactly as they are. The starting quantity is an`,
    `authored initial setting: it is NOT a collection, conversion or delivery from any source, and grants nobody an entitlement, title,`,
    `access right, permission to collect or use it, perception or knowledge of it. It creates no character, actor or labour,`,
    `advances no time, and consumes nothing. Committed facts are never replaced.`,
  ];
}

/** The ways the world/locus the Reserve names can be one of the confirmed scenario's, and the committed facts it will read and pin. */
const ADDITIONAL_LOCUS_GROUP = /^operator-additional-locality:([0-9a-f]{32}):locus$/;

type Place =
  | { readonly ok: true; readonly world: OwnerFact; readonly locus: OwnerFact }
  | { readonly ok: false; readonly reason: string };

/**
 * The world and locus the Reserve names, as committed: the ORIGINAL world the confirmed scenario established, and a locus of it that the
 * operator's own confirmed commands committed at version 1 — the first locus `establish-locality` wrote, or a COMPLETE additional
 * locality's locus (its source stage committed too). Anything else, including a locus another writer committed, is not offered here.
 */
function placeOf(
  campaign: CanonicalCampaign,
  locality: Extract<EstablishedLocality, { kind: "ESTABLISHED" }>,
  r: EstablishReserveInput,
): Place {
  const store = campaign.store;
  if (r.world_id !== locality.world_id)
    return { ok: false, reason: `the established world is ${locality.world_id}` };
  const locus = store.getFact(worldLocusKey(r.world_id, r.locus_id));
  if (!locus) return { ok: false, reason: `no locus ${r.locus_id} is committed in that world` };
  if (locus.key === locality.locus.key) return { ok: true, world: locality.world, locus };
  const m = ADDITIONAL_LOCUS_GROUP.exec(locus.provenance.group_id);
  if (!m || locus.version !== 1 || locus.owner !== "world_state" || locus.facet !== "world_locus")
    return {
      ok: false,
      reason: `locus ${r.locus_id} is not one the operator-confirmed scenario established`,
    };
  const source = store.committedGroup(`operator-additional-locality-intent:${m[1]}:source`);
  if (source === null || source.group_id !== `operator-additional-locality:${m[1]}:source`)
    return {
      ok: false,
      reason: `locus ${r.locus_id} is an incomplete additional locality (its source is not committed)`,
    };
  return { ok: true, world: locality.world, locus };
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine Production owner operation admits this exact Reserve
 * at the campaign's committed world and locus: the world and locus, as committed, are republished on a scratch package, the Reserve is
 * run through the genuine owner operation, and the scratch package is removed. Nothing here is reused: the scratch is not the campaign.
 */
async function dryRun(
  campaignId: string,
  place: Extract<Place, { ok: true }>,
  reserve: EstablishReserveInput,
  buildId: string,
): Promise<Result<null, "INVALID_RESERVE">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-production-reserve-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_RESERVE", "the Reserve could not be checked", {
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
      const steps: readonly [string, () => Promise<Result<unknown, string>>][] = [
        [
          "world",
          () => created.value.establishWorld({ ...pub("world"), world: place.world.value }),
        ],
        [
          "locus",
          () => created.value.establishLocus({ ...pub("locus"), locus: place.locus.value }),
        ],
        [
          "reserve",
          () =>
            new ProductionAdapter(created.value.store).establishReserve({
              ...pub("reserve"),
              reserve,
            }),
        ],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_RESERVE", "the owner path refuses this Reserve", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_RESERVE", "the Reserve could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishProductionReserveParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly reserveFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one initial Production Reserve.
 *
 *   read the Reserve file (trusted, strict) → open the existing package for the local operator → require the confirmed original
 *   locality, unchanged, no bound player character → replay-and-verify when this identity already committed → otherwise require a
 *   committed scenario world and locus, prove the owner path admits it, ask ONE confirmation → commit the one new key through the
 *   Production owner → reopen the package afresh, owner-verified, and compare → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A Reserve already
 * committed under this identity is verified and reported without asking again.
 */
export async function establishProductionReserve(
  params: EstablishProductionReserveParams,
): Promise<ProductionReserveResult> {
  const read = readProductionReserveFile(params.reserveFile);
  if (!read.ok) return result(read.error.code, issuesOf(read.error));
  const reserve = read.value;
  const id = productionReserveId(params.campaignId, reserve);
  const publication = publicationOf(id);
  const key = productionReserveKey(reserve.reserve_id);
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
    return await run({ params, session, reserve, id, publication, key, buildId });
  } catch {
    // an unexpected failure is never a success and never a clean refusal
    return result("RESERVE_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishProductionReserveParams;
  readonly session: LocalOperatorSession;
  readonly reserve: EstablishReserveInput;
  readonly id: string;
  readonly publication: Publication;
  readonly key: string;
  readonly buildId: string;
}

async function run(a: RunArgs): Promise<ProductionReserveResult> {
  const { params, session, reserve, id, publication, key, buildId } = a;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);

  // this identity may already have committed (a repeat, a lost reply, a restart): it is judged on the immutable committed record
  const group = store.committedGroup(publication.intent_id);
  if (group !== null) {
    const fact = store.getFact(key);
    const problems = groupProblems(store, group, publication, reserve);
    if (problems.length > 0 || !fact)
      return result("RESERVE_CONFLICT", [
        problems[0] ?? "this identity is committed, but its Reserve is not held",
      ]);
    if (locality.kind !== "ESTABLISHED") return result("PRE_PLAY_CLOSED", [locality.reason]);
    if (fact.version !== 1)
      return result("PRE_PLAY_CLOSED", [
        "the Reserve has been changed by Production since it was established",
      ]);
    // a committed Reserve is left as it is, but this pre-play path never advertises readiness once a player character is bound
    if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
      return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
    const verify = factProblems(campaign, fact, publication, reserve);
    if (verify.length > 0) return result("RESERVE_VERIFICATION_FAILED", verify);
    return ready(params.campaignId, id, fact, reserve);
  }

  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("RESERVE_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  const place = placeOf(campaign, locality, reserve);
  if (!place.ok) return result("RESERVE_NOT_AT_LOCALITY", [place.reason]);
  if (store.getFact(key))
    return result("RESERVE_CONFLICT", [`a Reserve is already held under ${reserve.reserve_id}`]);

  const admissible = await dryRun(params.campaignId, place, reserve, buildId);
  if (!admissible.ok) return result("INVALID_RESERVE", issuesOf(admissible.error));

  const before = store.listFacts();
  const subject = subjectOf({
    verb: "establish-reserve",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    reserve_id: id,
    reserve,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-reserve",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      id,
      locality.setup_id,
      reserve,
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-reserve", subject))
    return result("DECLINED");

  const committed = await new ProductionAdapter(store).establishReserve({
    ...publication,
    reserve,
  });
  if (!committed.ok) {
    if (UNKNOWN_OUTCOME.has(committed.error.code)) {
      session.markAmbiguous();
      return result("RESERVE_OUTCOME_UNKNOWN", [`reserve: ${committed.error.code}`]);
    }
    return result(
      "RESERVE_REFUSED",
      [`reserve: ${committed.error.code}`, ...issuesOf(committed.error)],
      committed.error.code,
    );
  }
  params.terminal.say(`PROGRESS reserve COMMITTED ${key}`);
  await session.close();

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(params.campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("RESERVE_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("RESERVE_VERIFICATION_FAILED", ["the reopened campaign has another identity"]);
    const fact = back.store.getFact(key);
    if (!fact) return result("RESERVE_VERIFICATION_FAILED", ["the Reserve is not held"]);
    const problems = [
      ...groupProblems(
        back.store,
        back.store.committedGroup(publication.intent_id),
        publication,
        reserve,
      ),
      ...factProblems(back, fact, publication, reserve),
      ...unchangedProblems(before, back.store.listFacts(), key),
    ];
    if (problems.length > 0) return result("RESERVE_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, fact, reserve, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/**
 * The committed record of this identity against the confirmed input: one Production Reserve write, created from nothing, with the exact
 * derived value, the Production owner and facet, the operator's technical identities, and reads of — and dependencies on — exactly the
 * world and locus it was established against.
 */
function groupProblems(
  store: CanonicalCampaign["store"],
  group: ReturnType<CanonicalCampaign["store"]["committedGroup"]>,
  publication: Publication,
  r: EstablishReserveInput,
): string[] {
  if (group === null) return ["this identity is not committed"];
  const write = group.writes[0];
  const worldKey = worldProfileKey(r.world_id);
  const locusKey = worldLocusKey(r.world_id, r.locus_id);
  const pinned = [worldKey, locusKey].map((k) => store.getFact(k));
  const groups = [...new Set(pinned.flatMap((f) => f?.provenance.group_id ?? []))].sort();
  const readKeys = group.reads.map((x) => `${x.key}@${x.version}`).sort();
  if (
    group.group_id !== publication.group_id ||
    group.intent_id !== publication.intent_id ||
    group.cause !== publication.cause ||
    group.owner !== PRODUCTION_OWNER ||
    group.facet !== PRODUCTION_FACET ||
    group.writes.length !== 1 ||
    write?.key !== productionReserveKey(r.reserve_id) ||
    write.owner !== PRODUCTION_OWNER ||
    write.facet !== PRODUCTION_FACET ||
    write.expected_version !== 0 ||
    write.basis !== publication.basis ||
    write.secrecy !== publication.secrecy ||
    !canonicalEqual(write.value, expectedReserve(r)) ||
    !canonicalEqual(readKeys, [`${worldKey}@1`, `${locusKey}@1`].sort()) ||
    pinned.some((f) => f === undefined) ||
    !canonicalEqual([...group.depends_on].sort(), groups)
  )
    return ["this identity is committed with different content than the confirmed Reserve"];
  return [];
}

/** The new fact against the confirmed Reserve: typed value, owner/facet, key, version 1 and the committed provenance of its one-write group. */
function factProblems(
  campaign: CanonicalCampaign,
  fact: OwnerFact,
  publication: Publication,
  r: EstablishReserveInput,
): string[] {
  const problems: string[] = [];
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  if (
    fact.key !== productionReserveKey(r.reserve_id) ||
    fact.owner !== PRODUCTION_OWNER ||
    fact.facet !== PRODUCTION_FACET ||
    fact.version !== 1 ||
    fact.provenance.group_id !== publication.group_id ||
    fact.provenance.intent_id !== publication.intent_id ||
    fact.provenance.cause !== publication.cause ||
    fact.basis !== publication.basis ||
    fact.secrecy !== publication.secrecy
  )
    problems.push("the Reserve does not carry this identity's owner, key, version or provenance");
  if (!ProductionReserveSchema.safeParse(fact.value).success)
    problems.push("the Reserve is not a valid typed Production Reserve");
  else if (!canonicalEqual(fact.value, expectedReserve(r)))
    problems.push("the Reserve differs from the confirmed Reserve");
  return problems;
}

/** Every fact the campaign held before the commit is exactly as it was (key, owner, facet, value, version, provenance). */
function unchangedProblems(
  before: readonly OwnerFact[],
  after: readonly OwnerFact[],
  newKey: string,
): string[] {
  const now = new Map(after.map((f) => [f.key, f]));
  const problems: string[] = [];
  for (const f of before) {
    const g = now.get(f.key);
    if (!g || !canonicalEqual(f, g)) problems.push(`an earlier fact is not unchanged: ${f.key}`);
  }
  const added = after.filter((f) => f.key !== newKey && !before.some((b) => b.key === f.key));
  if (after.length !== before.length + 1 || added.length > 0)
    problems.push("the commit wrote more than the one new Reserve");
  return problems;
}

function ready(
  campaignId: string,
  id: string,
  fact: OwnerFact,
  r: EstablishReserveInput,
  verifiedUnchanged = false,
): ProductionReserveResult {
  const q = r.quantity;
  return result("RESERVE_READY", [
    `campaign: ${campaignId}`,
    `reserve identity: ${id}`,
    provenanceLine(fact),
    `reserve: ${r.reserve_id} HELD_LOCAL_BY_PRODUCTION, established ${q.amount} ${q.unit} of ${r.material_class}, condition ${r.condition}, at locus ${r.locus_id} of world ${r.world_id}; unclaimed, nothing consumed, no inflow`,
    ...(verifiedUnchanged
      ? ["the world, the locus, any source and every other earlier fact are unchanged"]
      : []),
  ]);
}
