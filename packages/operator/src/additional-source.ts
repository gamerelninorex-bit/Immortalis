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
  EstablishSourceConditionInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  WorldSourceConditionSchema,
  canonicalJson,
  fail,
  ok,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  type EstablishSourceConditionInput,
  type OwnerFact,
  type Publication,
  type Result,
  type WorldSourceCondition,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, type FsOps } from "@immortalis/engine";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { establishedLocality } from "./locality.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Additional pre-play finite Source Condition admission: the shipped, local, out-of-character path that adds ONE more authored
 * EXACT_FINITE Source Condition, at the SAME world and locus, to a campaign whose ORIGINAL locality `establish-locality` already
 * confirmed and committed — through the existing `CanonicalCampaign.establishSourceCondition` World-State owner operation and nothing
 * else.
 *
 * The operator authors exactly one `EstablishSourceConditionInput` document (the schema `establish-locality` already uses for its
 * source, unchanged) in a local file; it is shown back in full for ONE explicit typed confirmation. Nothing is inferred, defaulted,
 * rolled, enumerated or delegated, and the file can carry no owner, version, publication label or "confirmed" claim (the schema is
 * strict). The service authors only the technical publication identities, derived from the campaign, world, locus and source key, so a
 * retry after a crash or a lost reply replays what committed (RC-16) and anything else under that identity is refused.
 *
 * It writes exactly the new `world_state/world_source_condition` key and nothing more: the world, the locus, the first source and every
 * other fact are read, never written, and are compared byte for byte on a fresh, owner-verified reopen before success is reported.
 *
 * Mechanism only. This is a physical setting: no actor, character, perception, knowledge, extraction permission or capability, and no
 * time. The quantity is a setting fact, never an estimate, availability verdict, yield or renewal. A source must state at least one
 * physical access fact for this operator path to offer it as a later source-qualified observation target; that is this path's own
 * eligibility condition, not a rule of the Source Condition. It is a slice size, not a cardinality rule, that a campaign admits ONE
 * additional source here. Quantities and material keys are shown only on this operator console, never to a host.
 */

/** The most a source file may hold: far beyond any hand-authored source, and a bound on what the console is asked to show. */
const MAX_SOURCE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

export type SourceFileErrorCode =
  "SOURCE_FILE_UNTRUSTED" | "SOURCE_FILE_UNREADABLE" | "INVALID_SOURCE";

/**
 * Reads the operator's source file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system
 * user, not writable by anyone else, of bounded size, exactly one strictly valid `EstablishSourceConditionInput` that states at least
 * one physical access fact. What was read is what is shown, confirmed and used.
 */
export function readAdditionalSourceFile(
  path: string,
): Result<EstablishSourceConditionInput, SourceFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("SOURCE_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "SOURCE_FILE_UNTRUSTED",
          "the source file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_SOURCE_BYTES)
        return fail("INVALID_SOURCE", "the source file is larger than a source can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("SOURCE_FILE_UNREADABLE", "the source file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_SOURCE", "the source file is not valid JSON");
  }
  const parsed = EstablishSourceConditionInputSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_SOURCE", "the source file is not a complete, valid source condition", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  if (parsed.data.access_facts.length === 0)
    return fail(
      "INVALID_SOURCE",
      "this path admits only a source that states at least one physical access fact",
      { issues: ["access_facts: at least one physical access fact is required here"] },
    );
  return ok(parsed.data);
}

/** The identity of one additional source in one campaign: a hash of exactly where it is, never a clock or a random value. */
export const additionalSourceId = (campaignId: string, s: EstablishSourceConditionInput): string =>
  createHash("sha256")
    .update(
      canonicalJson({
        campaign_id: campaignId,
        world_id: s.world_id,
        locus_id: s.locus_id,
        source_key: s.source_key,
      }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);

export type AdditionalSourceStatus =
  | "ADDITIONAL_SOURCE_READY"
  | "ADDITIONAL_SOURCE_OUTCOME_UNKNOWN"
  | "ADDITIONAL_SOURCE_REFUSED"
  | "ADDITIONAL_SOURCE_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "SOURCE_NOT_AT_LOCALITY"
  | "SOURCE_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | SourceFileErrorCode;

export interface AdditionalSourceResult {
  readonly status: AdditionalSourceStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<AdditionalSourceStatus, string> = {
  ADDITIONAL_SOURCE_READY:
    "the additional source is established and an owner-verified reopen of the package reads back exactly the confirmed source, with every earlier fact unchanged; this is a physical setting only: nobody perceives, knows or may extract anything because of it",
  ADDITIONAL_SOURCE_OUTCOME_UNKNOWN:
    "the outcome of the write is not known; the source is NOT reported established; rerun the same command (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identity",
  ADDITIONAL_SOURCE_REFUSED: "the owner refused the write; nothing was committed",
  ADDITIONAL_SOURCE_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed source or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality with its first source; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, or the established locality has been changed); nothing was changed",
  SOURCE_NOT_AT_LOCALITY:
    "the source is not at this campaign's established world and locus; nothing was changed",
  SOURCE_CONFLICT:
    "this campaign already holds a source under this key, or a different additional source; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  SOURCE_FILE_UNTRUSTED: "the source file is not trusted; nothing was changed",
  SOURCE_FILE_UNREADABLE: "the source file cannot be read; nothing was changed",
  INVALID_SOURCE:
    "the source is not a complete, valid finite source condition that this path admits; nothing was changed",
};

const result = (
  status: AdditionalSourceStatus,
  details: readonly string[] = [],
  code?: string,
): AdditionalSourceResult => ({
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
  group_id: `operator-additional-source:${id}`,
  intent_id: `operator-additional-source-intent:${id}`,
  cause: `operator-additional-source-cause:${id}`,
  basis: OPERATOR_PUBLICATION_BASIS,
  secrecy: OPERATOR_PUBLICATION_SECRECY,
});

/** Problems of a Source Condition value against the confirmed source (identity, material, establishment, locality, access facts). */
function sourceProblems(v: WorldSourceCondition, s: EstablishSourceConditionInput): string[] {
  const problems: string[] = [];
  if (
    v.source_key !== s.source_key ||
    v.dimension !== s.dimension ||
    v.material_class !== s.material_class ||
    v.depth !== "EXACT_FINITE" ||
    v.recoverable.unit !== s.quantity.unit ||
    !canonicalEqual(v.access_facts, s.access_facts) ||
    !canonicalEqual(v.establishment, {
      kind: "INITIAL_SETTING_FACT",
      statement: s.statement,
      quantity: s.quantity,
    }) ||
    !canonicalEqual(v.locality, {
      world: { fact_key: worldProfileKey(s.world_id), entity_id: s.world_id },
      locus: { fact_key: worldLocusKey(s.world_id, s.locus_id), entity_id: s.locus_id },
    })
  )
    problems.push("the source condition differs from the confirmed source");
  return problems;
}

const provenanceLine = (f: OwnerFact): string =>
  `source: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  s: EstablishSourceConditionInput,
): string[] {
  return [
    `CONFIRMATION — ADDITIONAL FINITE SOURCE CONDITION`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  additional source identity: ${id} (established locality ${localityId})`,
    ``,
    `THE SETTING FACT YOU ARE CONFIRMING (authored by you; nothing is inferred, estimated or defaulted):`,
    `SOURCE CONDITION — EXACT, FINITE, an initial setting fact`,
    `  source key: ${s.source_key} at locus ${s.locus_id} of world ${s.world_id}`,
    `  dimension: ${s.dimension}`,
    `  material class: ${s.material_class}`,
    `  EXACT quantity: ${s.quantity.amount} ${s.quantity.unit} (the whole recoverable amount; none delivered)`,
    `  physical access facts:`,
    ...s.access_facts.map((a) => `    - ${a.aspect}: ${quoted(a.statement)}`),
    `  statement: ${quoted(s.statement)}`,
    ``,
    `Confirming commits this as ONE further physical setting fact of the established locality, in one durable World-State publication.`,
    `The world, the locus and the first source are read and left exactly as they are. It creates no character, actor, cohort or`,
    `relationship, advances no time, and grants nobody perception, knowledge or permission to extract: the quantity is a setting fact,`,
    `not an estimate, availability verdict or yield. Committed facts are never replaced.`,
  ];
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine World-State operations admit this exact source at
 * the campaign's established world and locus: the world and locus, as committed, are republished on a scratch package, the source is
 * run through the genuine owner operation, and the scratch package is removed. The strict input schema is not the whole of what the owner
 * path checks (e.g. the derived Source Condition rejects duplicate access aspects). Nothing here is reused: the scratch is not the campaign.
 */
async function dryRun(
  campaignId: string,
  world: OwnerFact,
  locus: OwnerFact,
  source: EstablishSourceConditionInput,
  buildId: string,
): Promise<Result<null, "INVALID_SOURCE">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-additional-source-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_SOURCE", "the source could not be checked", {
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
      const steps: readonly [string, () => ReturnType<CanonicalCampaign["establishWorld"]>][] = [
        ["world", () => created.value.establishWorld({ ...pub("world"), world: world.value })],
        ["locus", () => created.value.establishLocus({ ...pub("locus"), locus: locus.value })],
        ["source", () => created.value.establishSourceCondition({ ...pub("source"), source })],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_SOURCE", "the owner path refuses this source", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_SOURCE", "the source could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishAdditionalSourceParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly sourceFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits the one additional source of a campaign.
 *
 *   read the source file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character → replay-and-verify when this identity already committed → otherwise prove the owner path admits
 *   it, ask ONE confirmation → commit the one new key → reopen the package afresh, owner-verified, and compare → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A source already
 * committed under this identity is verified and reported without asking again.
 */
export async function establishAdditionalSource(
  params: EstablishAdditionalSourceParams,
): Promise<AdditionalSourceResult> {
  const read = readAdditionalSourceFile(params.sourceFile);
  if (!read.ok) return result(read.error.code, issuesOf(read.error));
  const source = read.value;
  const id = additionalSourceId(params.campaignId, source);
  const publication = publicationOf(id);
  const key = worldSourceConditionKey(source.world_id, source.source_key);
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
    return await run({ params, session, source, id, publication, key, buildId });
  } catch {
    // an unexpected failure is never a success and never a clean refusal
    return result("ADDITIONAL_SOURCE_OUTCOME_UNKNOWN", [
      "an unexpected failure interrupted the command",
    ]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishAdditionalSourceParams;
  readonly session: LocalOperatorSession;
  readonly source: EstablishSourceConditionInput;
  readonly id: string;
  readonly publication: Publication;
  readonly key: string;
  readonly buildId: string;
}

async function run(a: RunArgs): Promise<AdditionalSourceResult> {
  const { params, session, source, id, publication, key, buildId } = a;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);

  // this identity may already have committed (a repeat, a lost reply, a restart): it is judged on the immutable committed record
  const group = store.committedGroup(publication.intent_id);
  if (group !== null) {
    const write = group.writes[0];
    const committed = write ? WorldSourceConditionSchema.safeParse(write.value) : undefined;
    const fact = store.getFact(key);
    if (
      group.group_id !== publication.group_id ||
      group.writes.length !== 1 ||
      write?.key !== key ||
      !committed?.success ||
      sourceProblems(committed.data, source).length > 0 ||
      !fact
    )
      return result("SOURCE_CONFLICT", [
        "this identity is committed with different content, or its fact is not held",
      ]);
    if (locality.kind !== "ESTABLISHED") return result("PRE_PLAY_CLOSED", [locality.reason]);
    const problems = factProblems(campaign, fact, publication, source);
    if (problems.length > 0) return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, fact, source, campaign);
  }

  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  if (source.world_id !== locality.world_id || source.locus_id !== locality.locus_id)
    return result("SOURCE_NOT_AT_LOCALITY", [
      `the established locality is ${locality.locus_id} of world ${locality.world_id}`,
    ]);
  if (store.getFact(key))
    return result("SOURCE_CONFLICT", [
      `a source condition is already held under ${source.source_key}`,
    ]);
  const sources = store
    .listFacts()
    .filter((f) => f.owner === "world_state" && f.facet === "world_source_condition");
  if (sources.some((f) => f.key !== locality.source.key))
    return result("SOURCE_CONFLICT", ["this campaign already holds a different additional source"]);

  const admissible = await dryRun(
    params.campaignId,
    locality.world,
    locality.locus,
    source,
    buildId,
  );
  if (!admissible.ok) return result("INVALID_SOURCE", issuesOf(admissible.error));

  const before = store.listFacts();
  const subject = subjectOf({
    verb: "establish-additional-source",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    source_id: id,
    source,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-additional-source",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      id,
      locality.setup_id,
      source,
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-additional-source", subject))
    return result("DECLINED");

  const committed = await campaign.establishSourceCondition({ ...publication, source });
  if (!committed.ok) {
    if (UNKNOWN_OUTCOME.has(committed.error.code)) {
      session.markAmbiguous();
      return result("ADDITIONAL_SOURCE_OUTCOME_UNKNOWN", [`source: ${committed.error.code}`]);
    }
    return result(
      "ADDITIONAL_SOURCE_REFUSED",
      [`source: ${committed.error.code}`, ...issuesOf(committed.error)],
      committed.error.code,
    );
  }
  params.terminal.say(`PROGRESS source COMMITTED ${key}`);
  await session.close();

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(params.campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", [
        "the reopened campaign has another identity",
      ]);
    const fact = back.store.getFact(key);
    if (!fact) return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", ["the source is not held"]);
    const problems = [
      ...factProblems(back, fact, publication, source),
      ...unchangedProblems(before, back.store.listFacts(), key),
    ];
    if (problems.length > 0) return result("ADDITIONAL_SOURCE_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, fact, source, back, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The new fact against the confirmed source: typed value, owner/facet, key, and the committed provenance of its one-write group. */
function factProblems(
  campaign: CanonicalCampaign,
  fact: OwnerFact,
  publication: Publication,
  source: EstablishSourceConditionInput,
): string[] {
  const problems: string[] = [];
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  const typed = campaign.sourceCondition(source.world_id, source.source_key);
  const group = campaign.store.committedGroup(publication.intent_id);
  const write = group?.writes[0];
  if (
    !typed ||
    !group ||
    group.writes.length !== 1 ||
    group.group_id !== publication.group_id ||
    group.cause !== publication.cause ||
    group.owner !== "world_state" ||
    group.facet !== "world_source_condition" ||
    write?.key !== fact.key ||
    write.basis !== publication.basis ||
    write.secrecy !== publication.secrecy ||
    fact.key !== worldSourceConditionKey(source.world_id, source.source_key) ||
    fact.owner !== "world_state" ||
    fact.facet !== "world_source_condition" ||
    (fact.version === 1 &&
      (fact.provenance.group_id !== publication.group_id ||
        fact.provenance.intent_id !== publication.intent_id ||
        fact.provenance.cause !== publication.cause ||
        fact.basis !== publication.basis ||
        fact.secrecy !== publication.secrecy))
  )
    problems.push("the source does not carry this identity's owner, key or provenance");
  if (typed) problems.push(...sourceProblems(typed.value, source));
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
    problems.push("the commit wrote more than the one new source");
  return problems;
}

function ready(
  campaignId: string,
  id: string,
  fact: OwnerFact,
  source: EstablishSourceConditionInput,
  campaign: CanonicalCampaign,
  verifiedUnchanged = false,
): AdditionalSourceResult {
  const q = source.quantity;
  const recoverable =
    campaign.sourceCondition(source.world_id, source.source_key)?.value.recoverable.amount ?? 0;
  return result("ADDITIONAL_SOURCE_READY", [
    `campaign: ${campaignId}`,
    `additional source identity: ${id}`,
    provenanceLine(fact),
    `source: ${source.source_key} EXACT_FINITE, established ${q.amount} ${q.unit} of ${source.material_class}; recoverable now ${recoverable} ${q.unit}`,
    ...(verifiedUnchanged
      ? ["the world, the locus, the first source and every other earlier fact are unchanged"]
      : []),
  ]);
}
