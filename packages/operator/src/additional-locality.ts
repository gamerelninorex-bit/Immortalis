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
  EntityId,
  EstablishSourceConditionInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  Text,
  WorldConstraintSchema,
  WorldLocusSchema,
  WorldSourceConditionSchema,
  canonicalJson,
  fail,
  ok,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  type OwnerFact,
  type Publication,
  type Result,
  type WorldLocus,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, type FsOps } from "@immortalis/engine";
import { establishedLocality, sourceProblems } from "./additional-source.ts";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Additional pre-play locality with one finite source: the shipped, local, out-of-character path that adds ONE more distinct
 * World-State locus, and ONE independently authored EXACT_FINITE Source Condition at that new locus, to a campaign whose ORIGINAL
 * locality `establish-locality` already confirmed and committed — through the existing `CanonicalCampaign.establishLocus` and then
 * `CanonicalCampaign.establishSourceCondition` World-State owner operations and nothing else.
 *
 * The operator authors exactly one document in a local file: a strict second-locus section and exactly one
 * `EstablishSourceConditionInput` (the schema `establish-locality` and `establish-additional-source` already use, unchanged). Both are
 * shown back in full for ONE explicit typed confirmation. Nothing is inferred, defaulted, rolled, enumerated or delegated; the file can
 * carry no owner, version, publication label, route, distance or "confirmed" claim (every schema is strict). The service authors only
 * the technical publication identities, derived from the campaign and the exact authored locus and source, so a retry after a crash or a
 * lost reply replays what committed (RC-16), finishes what did not, and anything else under those keys is refused.
 *
 * It writes exactly two new World-State keys — the locus, then (only once that fact is committed) the source — as two separate durable
 * publications in dependency order. The world, the first locus, the first source, any earlier additional source and every other fact
 * are read, never written, and are compared byte for byte on a fresh, owner-verified reopen before success is reported. A campaign that
 * holds the new locus without its source is incomplete and is never reported as an established additional locality.
 *
 * Mechanism only. This is a physical setting: no game actor, character, perception, knowledge, extraction permission or capability, no
 * route, corridor, distance, traversal duration or travel action, and no time. Two loci do not imply an edge between them. The quantity
 * is a setting fact, never an estimate, availability verdict, yield or renewal. A source must state at least one physical access fact for
 * this operator path to offer it as a later source-qualified observation premise; that is this path's own eligibility condition, not a
 * rule of the Source Condition. Placing the source at the new locus does not make it co-located with, or observable from, any other
 * locus. Quantities and material keys are shown only on this operator console, never to a host.
 */

export const ADDITIONAL_LOCALITY_FORMAT = "immortalis-additional-locality";
export const ADDITIONAL_LOCALITY_FORMAT_VERSION = 1;

/** The most a locality file may hold: far beyond any hand-authored locus and source, and a bound on what the console is asked to show. */
const MAX_FILE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

const LocusSectionSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  designation: Text,
  constraints: z.array(WorldConstraintSchema),
});

/**
 * The operator-authored document: a locus section naming the world it belongs to (the service derives the fact reference) and exactly
 * `EstablishSourceConditionInput` for the source at that locus. The identities must agree across the two sections.
 */
export const AdditionalLocalitySchema = z
  .strictObject({
    format: z.literal(ADDITIONAL_LOCALITY_FORMAT),
    format_version: z.literal(ADDITIONAL_LOCALITY_FORMAT_VERSION),
    locus: LocusSectionSchema,
    source: EstablishSourceConditionInputSchema,
  })
  .superRefine((d, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (d.source.world_id !== d.locus.world_id)
      bad("the source belongs to the locus's world", ["source", "world_id"]);
    if (d.source.locus_id !== d.locus.locus_id)
      bad("the source is at the new locus", ["source", "locus_id"]);
    if (d.source.access_facts.length === 0)
      bad("this path admits only a source that states at least one physical access fact", [
        "source",
        "access_facts",
      ]);
  });
export type AdditionalLocality = z.infer<typeof AdditionalLocalitySchema>;

export type LocalityFileErrorCode =
  "LOCALITY_FILE_UNTRUSTED" | "LOCALITY_FILE_UNREADABLE" | "INVALID_LOCALITY";

/**
 * Reads the operator's file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system user,
 * not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readAdditionalLocalityFile(
  path: string,
): Result<AdditionalLocality, LocalityFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("LOCALITY_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "LOCALITY_FILE_UNTRUSTED",
          "the locality file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_FILE_BYTES)
        return fail("INVALID_LOCALITY", "the locality file is larger than a locality can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("LOCALITY_FILE_UNREADABLE", "the locality file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_LOCALITY", "the locality file is not valid JSON");
  }
  const parsed = AdditionalLocalitySchema.safeParse(json);
  if (!parsed.success)
    return fail(
      "INVALID_LOCALITY",
      "the locality file is not a complete, valid additional locality",
      {
        issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
      },
    );
  return ok(parsed.data);
}

/**
 * The identity of one confirmed additional locality in one campaign: a hash of exactly the authored content (the campaign, the locus
 * section and the source), never a clock or a random value. The same confirmed proposal always reaches the same identities; any other
 * content, even under the same keys, meets the committed identities and is refused.
 */
export const additionalLocalityId = (campaignId: string, d: AdditionalLocality): string =>
  createHash("sha256")
    .update(canonicalJson({ campaign_id: campaignId, locus: d.locus, source: d.source }), "utf8")
    .digest("hex")
    .slice(0, 32);

export type AdditionalLocalityStatus =
  | "ADDITIONAL_LOCALITY_READY"
  | "ADDITIONAL_LOCALITY_INCOMPLETE"
  | "ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN"
  | "ADDITIONAL_LOCALITY_REFUSED"
  | "ADDITIONAL_LOCALITY_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "WORLD_MISMATCH"
  | "LOCALITY_CONFLICT"
  | "SOURCE_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | LocalityFileErrorCode;

export interface AdditionalLocalityResult {
  readonly status: AdditionalLocalityStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<AdditionalLocalityStatus, string> = {
  ADDITIONAL_LOCALITY_READY:
    "the additional locus and its source are established and an owner-verified reopen of the package reads back exactly the confirmed locus and source, with every earlier fact unchanged; this is a physical setting only: no route, travel or time exists between any loci, and nobody perceives, knows or may extract anything because of it",
  ADDITIONAL_LOCALITY_INCOMPLETE:
    "the new locus is committed but its source is NOT; the additional locality is NOT established; rerun the same command with the same file to finish it",
  ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; the additional locality is NOT reported established; rerun the same command with the same file (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identities",
  ADDITIONAL_LOCALITY_REFUSED: "the owner refused the write; nothing was replaced",
  ADDITIONAL_LOCALITY_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed locality or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality with its first source; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, or the established locality has been changed); nothing was changed",
  WORLD_MISMATCH:
    "the locus and source are not for this campaign's established world; nothing was changed",
  LOCALITY_CONFLICT:
    "this campaign already holds a locus under this identity with other content, a different additional locality that is not complete, or a fact under this locus key; committed facts are never replaced and nothing was changed",
  SOURCE_CONFLICT:
    "this campaign already holds a source under this key or this identity with other content; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  LOCALITY_FILE_UNTRUSTED: "the locality file is not trusted; nothing was changed",
  LOCALITY_FILE_UNREADABLE: "the locality file cannot be read; nothing was changed",
  INVALID_LOCALITY:
    "the locality is not a complete, valid additional locus and finite source that this path admits; nothing was changed",
};

const result = (
  status: AdditionalLocalityStatus,
  details: readonly string[] = [],
  code?: string,
): AdditionalLocalityResult => ({
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

type StageName = "locus" | "source";
const GROUP = /^operator-additional-locality:([0-9a-f]{32}):(locus|source)$/;

interface Stage {
  readonly name: StageName;
  readonly key: string;
  readonly facet: string;
  readonly publication: Publication;
}

function planOf(
  campaignId: string,
  d: AdditionalLocality,
): { id: string; stages: readonly [Stage, Stage] } {
  const id = additionalLocalityId(campaignId, d);
  const pub = (name: StageName): Publication => ({
    group_id: `operator-additional-locality:${id}:${name}`,
    intent_id: `operator-additional-locality-intent:${id}:${name}`,
    cause: `operator-additional-locality-cause:${id}`,
    basis: OPERATOR_PUBLICATION_BASIS,
    secrecy: OPERATOR_PUBLICATION_SECRECY,
  });
  return {
    id,
    stages: [
      {
        name: "locus",
        key: worldLocusKey(d.locus.world_id, d.locus.locus_id),
        facet: "world_locus",
        publication: pub("locus"),
      },
      {
        name: "source",
        key: worldSourceConditionKey(d.source.world_id, d.source.source_key),
        facet: "world_source_condition",
        publication: pub("source"),
      },
    ],
  };
}

/** The locus fact value exactly as the owner is asked to establish it: the world by reference, never copied. */
const locusOf = (d: AdditionalLocality): WorldLocus => ({
  locus_id: d.locus.locus_id,
  world: { fact_key: worldProfileKey(d.locus.world_id), entity_id: d.locus.world_id },
  designation: d.locus.designation,
  constraints: d.locus.constraints,
});

const provenanceLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);
const listOf = (title: string, items: readonly string[]): string[] =>
  items.length === 0 ? [`  ${title}: none`] : [`  ${title}:`, ...items.map((i) => `    - ${i}`)];

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  d: AdditionalLocality,
  pending: readonly StageName[],
): string[] {
  const { locus, source } = d;
  return [
    `CONFIRMATION — ADDITIONAL LOCUS WITH ONE FINITE SOURCE`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  additional locality identity: ${id} (established locality ${localityId})`,
    `  to commit, in this order: ${pending.join(" → ")}`,
    ``,
    `THE SETTING FACTS YOU ARE CONFIRMING (authored by you; nothing is inferred, estimated or defaulted):`,
    `NEW LOCUS`,
    `  locus id: ${locus.locus_id} (of world ${locus.world_id})`,
    `  designation: ${quoted(locus.designation)}`,
    ...listOf(
      "constraints",
      locus.constraints.map((c) => `${c.aspect}: ${quoted(c.statement)}`),
    ),
    `SOURCE CONDITION AT THE NEW LOCUS — EXACT, FINITE, an initial setting fact`,
    `  source key: ${source.source_key} at locus ${source.locus_id} of world ${source.world_id}`,
    `  dimension: ${source.dimension}`,
    `  material class: ${source.material_class}`,
    `  EXACT quantity: ${source.quantity.amount} ${source.quantity.unit} (the whole recoverable amount; none delivered)`,
    ...listOf(
      "physical access facts",
      source.access_facts.map((a) => `${a.aspect}: ${quoted(a.statement)}`),
    ),
    `  statement: ${quoted(source.statement)}`,
    ``,
    `Confirming commits these as TWO further physical setting facts, one durable World-State publication at a time: the locus first,`,
    `and the source only after the locus is committed. The world, the first locus, the first source and every other fact are read and`,
    `left exactly as they are. It creates no character, actor, cohort, relationship, route, corridor, distance or travel, advances no`,
    `time, and grants nobody perception, knowledge or permission to extract: the new locus is not reachable from, or visible from, any`,
    `other locus merely because it exists, and the quantity is a setting fact, not an estimate, availability verdict or yield.`,
    `Committed facts are never replaced.`,
  ];
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine World-State operations admit this exact locus and
 * source for the campaign's established world: the world, as committed, is republished on a scratch package, the locus and then the
 * source are run through the genuine owner operations, and the scratch package is removed. The strict input schemas are not the whole of
 * what the owner path checks (e.g. the derived Source Condition rejects duplicate access aspects), and a refusal after the locus had
 * committed would strand a half-built locality. Nothing here is reused: the scratch package is not the campaign.
 */
async function dryRun(
  campaignId: string,
  world: OwnerFact,
  d: AdditionalLocality,
  buildId: string,
): Promise<Result<null, "INVALID_LOCALITY">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-additional-locality-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_LOCALITY", "the locality could not be checked", {
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
        ["locus", () => created.value.establishLocus({ ...pub("locus"), locus: locusOf(d) })],
        [
          "source",
          () => created.value.establishSourceCondition({ ...pub("source"), source: d.source }),
        ],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_LOCALITY", "the owner path refuses this locality", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_LOCALITY", "the locality could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishAdditionalLocalityParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly localityFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one additional locus with its one source.
 *
 *   read the file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character → replay-and-verify when both identities already committed → otherwise (for whatever is still
 *   to be written) prove the owner path admits it, ask ONE confirmation → commit the locus, then the source → reopen the package
 *   afresh, owner-verified, and compare → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A locality already
 * committed under this identity is verified and reported without asking again; one committed only in part is finished from the same file.
 */
export async function establishAdditionalLocality(
  params: EstablishAdditionalLocalityParams,
): Promise<AdditionalLocalityResult> {
  const read = readAdditionalLocalityFile(params.localityFile);
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
    return result("ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN", [
      "an unexpected failure interrupted the command",
    ]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishAdditionalLocalityParams;
  readonly session: LocalOperatorSession;
  readonly doc: AdditionalLocality;
  readonly id: string;
  readonly stages: readonly [Stage, Stage];
  readonly buildId: string;
}

/** What this identity has committed so far, judged on the immutable committed groups (never on the facts, which an owner may advance). */
type Committed =
  | { readonly kind: "NONE" }
  | { readonly kind: "LOCUS" }
  | { readonly kind: "BOTH" }
  | {
      readonly kind: "CONFLICT";
      readonly status: AdditionalLocalityStatus;
      readonly reason: string;
    };

function committedOf(
  campaign: CanonicalCampaign,
  doc: AdditionalLocality,
  stages: readonly [Stage, Stage],
): Committed {
  const store = campaign.store;
  const [locusStage, sourceStage] = stages;
  const held = (s: Stage) => {
    const group = store.committedGroup(s.publication.intent_id);
    if (group === null) return undefined;
    if (group.group_id !== s.publication.group_id || group.writes.length !== 1) return null;
    return group;
  };
  const locus = held(locusStage);
  const source = held(sourceStage);
  if (locus === null)
    return {
      kind: "CONFLICT",
      status: "LOCALITY_CONFLICT",
      reason: "the locus identity is committed with other content",
    };
  if (source === null)
    return {
      kind: "CONFLICT",
      status: "SOURCE_CONFLICT",
      reason: "the source identity is committed with other content",
    };
  if (source && !locus)
    return {
      kind: "CONFLICT",
      status: "LOCALITY_CONFLICT",
      reason: "the source is committed without its locus",
    };
  if (locus) {
    const write = locus.writes[0];
    const value = write ? WorldLocusSchema.safeParse(write.value) : undefined;
    if (
      write?.key !== locusStage.key ||
      !value?.success ||
      !canonicalEqual(value.data, locusOf(doc)) ||
      !store.getFact(locusStage.key)
    )
      return {
        kind: "CONFLICT",
        status: "LOCALITY_CONFLICT",
        reason:
          "this identity's locus is committed with different content, or its fact is not held",
      };
  }
  if (source) {
    const write = source.writes[0];
    const value = write ? WorldSourceConditionSchema.safeParse(write.value) : undefined;
    if (
      write?.key !== sourceStage.key ||
      !value?.success ||
      sourceProblems(value.data, doc.source).length > 0 ||
      !store.getFact(sourceStage.key)
    )
      return {
        kind: "CONFLICT",
        status: "SOURCE_CONFLICT",
        reason:
          "this identity's source is committed with different content, or its fact is not held",
      };
  }
  return { kind: source ? "BOTH" : locus ? "LOCUS" : "NONE" };
}

/** A different additional locality of this command that holds its locus without its source: never abandoned, never built over. */
function otherIncomplete(campaign: CanonicalCampaign, id: string): string | undefined {
  const store = campaign.store;
  for (const f of store.listFacts()) {
    if (f.owner !== "world_state" || f.facet !== "world_locus") continue;
    const m = GROUP.exec(f.provenance.group_id);
    if (!m || m[2] !== "locus" || m[1] === id) continue;
    const source = store.committedGroup(`operator-additional-locality-intent:${m[1]}:source`);
    if (source === null) return f.key;
  }
  return undefined;
}

async function run(a: RunArgs): Promise<AdditionalLocalityResult> {
  const { params, session, doc, id, stages, buildId } = a;
  const [locusStage, sourceStage] = stages;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);

  const committed = committedOf(campaign, doc, stages);
  if (committed.kind === "CONFLICT") return result(committed.status, [committed.reason]);
  if (committed.kind === "BOTH") {
    // the whole identity already committed (a repeat, a lost reply, a restart): verified and reported without asking again
    if (locality.kind !== "ESTABLISHED") return result("PRE_PLAY_CLOSED", [locality.reason]);
    const problems = factProblems(campaign, doc, stages);
    if (problems.length > 0) return result("ADDITIONAL_LOCALITY_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, campaign, stages);
  }

  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("ADDITIONAL_LOCALITY_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  if (doc.locus.world_id !== locality.world_id)
    return result("WORLD_MISMATCH", [`the established world is ${locality.world_id}`]);
  if (committed.kind === "NONE" && store.getFact(locusStage.key))
    return result("LOCALITY_CONFLICT", [`a locus is already held under ${doc.locus.locus_id}`]);
  if (store.getFact(sourceStage.key))
    return result("SOURCE_CONFLICT", [
      `a source condition is already held under ${doc.source.source_key}`,
    ]);
  const stranded = otherIncomplete(campaign, id);
  if (stranded !== undefined)
    return result("LOCALITY_CONFLICT", [
      `another additional locus is committed without its source: ${stranded}`,
    ]);

  const admissible = await dryRun(params.campaignId, locality.world, doc, buildId);
  if (!admissible.ok) return result("INVALID_LOCALITY", issuesOf(admissible.error));

  const pending: readonly Stage[] = committed.kind === "LOCUS" ? [sourceStage] : stages;
  const before = store.listFacts();
  const revisionBefore = store.head().revision;
  const subject = subjectOf({
    verb: "establish-additional-locality",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    additional_id: id,
    pending: pending.map((s) => s.name),
    locus: doc.locus,
    source: doc.source,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-additional-locality",
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
  if (!confirmation || !consumeConfirmation(confirmation, "establish-additional-locality", subject))
    return result("DECLINED");

  for (const stage of pending) {
    const published =
      stage.name === "locus"
        ? await campaign.establishLocus({ ...stage.publication, locus: locusOf(doc) })
        : await campaign.establishSourceCondition({ ...stage.publication, source: doc.source });
    if (!published.ok) {
      if (UNKNOWN_OUTCOME.has(published.error.code)) {
        session.markAmbiguous();
        return result("ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN", [
          `${stage.name}: ${published.error.code}`,
        ]);
      }
      const locusHeld = store.getFact(locusStage.key) !== undefined;
      return result(
        locusHeld ? "ADDITIONAL_LOCALITY_INCOMPLETE" : "ADDITIONAL_LOCALITY_REFUSED",
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
    return result("ADDITIONAL_LOCALITY_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("ADDITIONAL_LOCALITY_VERIFICATION_FAILED", [
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
    if (problems.length > 0) return result("ADDITIONAL_LOCALITY_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, back, stages, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** Both new facts against the confirmed locality: typed values, owner/facet, keys, and the committed provenance of each one-write group. */
function factProblems(
  campaign: CanonicalCampaign,
  doc: AdditionalLocality,
  stages: readonly [Stage, Stage],
): string[] {
  const problems: string[] = [];
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  const facts: (OwnerFact | undefined)[] = [
    campaign.locus(doc.locus.world_id, doc.locus.locus_id)?.fact,
    campaign.sourceCondition(doc.source.world_id, doc.source.source_key)?.fact,
  ];
  stages.forEach((s, i) => {
    const f = facts[i];
    if (!f) {
      problems.push(`the ${s.name} is not held or is not valid`);
      return;
    }
    // provenance is judged on the immutable committed group; the current fact carries it too only until its owner advances it
    const group = campaign.store.committedGroup(s.publication.intent_id);
    const write = group?.writes[0];
    if (
      !group ||
      group.writes.length !== 1 ||
      group.group_id !== s.publication.group_id ||
      group.cause !== s.publication.cause ||
      group.owner !== "world_state" ||
      group.facet !== s.facet ||
      write?.key !== s.key ||
      write.basis !== s.publication.basis ||
      write.secrecy !== s.publication.secrecy ||
      f.key !== s.key ||
      f.owner !== "world_state" ||
      f.facet !== s.facet ||
      (f.version === 1 &&
        (f.provenance.group_id !== s.publication.group_id ||
          f.provenance.intent_id !== s.publication.intent_id ||
          f.provenance.cause !== s.publication.cause ||
          f.basis !== s.publication.basis ||
          f.secrecy !== s.publication.secrecy))
    )
      problems.push(`the ${s.name} does not carry this identity's owner, key or provenance`);
  });
  const locus = campaign.locus(doc.locus.world_id, doc.locus.locus_id);
  if (locus && !canonicalEqual(locus.value, locusOf(doc)))
    problems.push("the locus differs from the confirmed locus");
  const source = campaign.sourceCondition(doc.source.world_id, doc.source.source_key);
  if (source) problems.push(...sourceProblems(source.value, doc.source));
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
  doc: AdditionalLocality,
  campaign: CanonicalCampaign,
  stages: readonly [Stage, Stage],
  verifiedUnchanged = false,
): AdditionalLocalityResult {
  const q = doc.source.quantity;
  const locus = campaign.locus(doc.locus.world_id, doc.locus.locus_id)?.fact;
  const source = campaign.sourceCondition(doc.source.world_id, doc.source.source_key);
  const recoverable = source?.value.recoverable.amount ?? 0;
  return result("ADDITIONAL_LOCALITY_READY", [
    `campaign: ${campaignId}`,
    `additional locality identity: ${id}`,
    ...(locus ? [provenanceLine(stages[0].name, locus)] : []),
    ...(source ? [provenanceLine(stages[1].name, source.fact)] : []),
    `source: ${doc.source.source_key} EXACT_FINITE, established ${q.amount} ${q.unit} of ${doc.source.material_class}; recoverable now ${recoverable} ${q.unit}`,
    ...(verifiedUnchanged
      ? ["the world, the first locus, the first source and every other earlier fact are unchanged"]
      : []),
  ]);
}
