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
  EstablishCorridorInputSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  WorldCorridorSchema,
  WorldLocusSchema,
  canonicalJson,
  corridorOfInput,
  fail,
  ok,
  worldCorridorKey,
  worldLocusKey,
  type EstablishCorridorInput,
  type OwnerFact,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, type FsOps } from "@immortalis/engine";
import { establishedLocality } from "./additional-source.ts";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Source-qualified local corridor: the shipped, local, out-of-character path by which a trusted, explicitly confirmed scenario author
 * admits ONE World-State physical corridor — the topological fact that one already-committed locus of the established ORIGINAL world is
 * connected TO another, distinct, already-committed locus of the same world, in that order — through the existing
 * `CanonicalCampaign.establishCorridor` World-State owner operation and nothing else.
 *
 * The operator authors exactly one document in a local file: the world, the origin locus, the destination locus and a free statement. All
 * of it is shown back in full for ONE explicit typed confirmation. Nothing is inferred, defaulted, rolled or delegated: the file can carry
 * no owner, version, publication label, duration, speed, capacity, access right, hazard verdict, outcome or "confirmed" claim (every
 * schema is strict), no reverse corridor and no intermediate locus. The service authors only the technical publication identity, derived
 * from the campaign and the exact authored content, so a retry after a crash or a lost reply replays what committed (RC-16) and anything
 * else under the same ordered pair is refused.
 *
 * It writes exactly ONE new World-State key, the corridor. The world, both loci and every other fact are read, never written, and are
 * compared byte for byte on a fresh, owner-verified reopen before success is reported.
 *
 * Mechanism only. A corridor is a topological connection: not a route calibration, a distance, a travel duration, a speed, a right of
 * access, an absence of hazards, a usable service, an actor's willingness or a successful journey, and it does not move or request
 * anything, create any character or advance time. It is the source-owned input a later, independently admitted Movement Service Request
 * may be checked against by Logistics; the corridor itself supplies no delivery boundary and asserts no delivery.
 */

export const CORRIDOR_FORMAT = "immortalis-corridor";
export const CORRIDOR_FORMAT_VERSION = 1;

/** The most a corridor file may hold: far beyond any hand-authored corridor, and a bound on what the console is asked to show. */
const MAX_FILE_BYTES = 16 * 1024;

const BUILD_ID = "immortalis-operator";

/** The operator-authored document: exactly one `EstablishCorridorInput` (the owner operation's own strict input), nothing else. */
export const CorridorFileSchema = z.strictObject({
  format: z.literal(CORRIDOR_FORMAT),
  format_version: z.literal(CORRIDOR_FORMAT_VERSION),
  corridor: EstablishCorridorInputSchema,
});
export type CorridorFile = z.infer<typeof CorridorFileSchema>;

export type CorridorFileErrorCode =
  "CORRIDOR_FILE_UNTRUSTED" | "CORRIDOR_FILE_UNREADABLE" | "INVALID_CORRIDOR";

/**
 * Reads the operator's file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system user,
 * not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readCorridorFile(path: string): Result<CorridorFile, CorridorFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("CORRIDOR_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "CORRIDOR_FILE_UNTRUSTED",
          "the corridor file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_FILE_BYTES)
        return fail("INVALID_CORRIDOR", "the corridor file is larger than a corridor can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("CORRIDOR_FILE_UNREADABLE", "the corridor file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_CORRIDOR", "the corridor file is not valid JSON");
  }
  const parsed = CorridorFileSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_CORRIDOR", "the corridor file is not a complete, valid corridor", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  // the owner's own contract must accept what is shown: a corridor of two distinct loci
  if (!WorldCorridorSchema.safeParse(corridorOfInput(parsed.data.corridor)).success)
    return fail("INVALID_CORRIDOR", "the corridor is not a connection of two distinct loci");
  return ok(parsed.data);
}

/**
 * The identity of one confirmed corridor in one campaign: a hash of exactly the authored content (the campaign and the corridor
 * section), never a clock or a random value. The same confirmed proposal always reaches the same identity; any other content, even for
 * the same ordered pair, meets the committed identity or key and is refused.
 */
export const corridorId = (campaignId: string, d: CorridorFile): string =>
  createHash("sha256")
    .update(canonicalJson({ campaign_id: campaignId, corridor: d.corridor }), "utf8")
    .digest("hex")
    .slice(0, 32);

export type CorridorStatus =
  | "CORRIDOR_READY"
  | "CORRIDOR_OUTCOME_UNKNOWN"
  | "CORRIDOR_REFUSED"
  | "CORRIDOR_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "WORLD_MISMATCH"
  | "LOCUS_NOT_ESTABLISHED"
  | "CORRIDOR_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | CorridorFileErrorCode;

export interface CorridorResult {
  readonly status: CorridorStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<CorridorStatus, string> = {
  CORRIDOR_READY:
    "the corridor is established and an owner-verified reopen of the package reads back exactly the confirmed connection, with every earlier fact unchanged; it is a topological connection only: no distance, travel time, speed, access right or hazard verdict exists, nothing is requested, moved or delivered, and nobody perceives, knows or may traverse anything because of it",
  CORRIDOR_OUTCOME_UNKNOWN:
    "the outcome of the write is not known; the corridor is NOT reported established; rerun the same command with the same file (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identity",
  CORRIDOR_REFUSED: "the owner refused the write; nothing was replaced",
  CORRIDOR_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed corridor or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, or the established locality has been changed); nothing was changed",
  WORLD_MISMATCH: "the corridor is not for this campaign's established world; nothing was changed",
  LOCUS_NOT_ESTABLISHED:
    "an endpoint of the corridor is not an established locus of this campaign's world; a corridor never creates a locus; nothing was changed",
  CORRIDOR_CONFLICT:
    "this campaign already holds a corridor for this ordered pair of loci, or under this identity, with other content; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  CORRIDOR_FILE_UNTRUSTED: "the corridor file is not trusted; nothing was changed",
  CORRIDOR_FILE_UNREADABLE: "the corridor file cannot be read; nothing was changed",
  INVALID_CORRIDOR:
    "the corridor is not a complete, valid connection of two distinct loci that this path admits; nothing was changed",
};

const result = (
  status: CorridorStatus,
  details: readonly string[] = [],
  code?: string,
): CorridorResult => ({
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

interface Plan {
  readonly id: string;
  readonly key: string;
  readonly publication: Publication;
}

function planOf(campaignId: string, d: CorridorFile): Plan {
  const id = corridorId(campaignId, d);
  const c = d.corridor;
  return {
    id,
    key: worldCorridorKey(c.world_id, c.from_locus_id, c.to_locus_id),
    publication: {
      group_id: `operator-corridor:${id}`,
      intent_id: `operator-corridor-intent:${id}`,
      cause: `operator-corridor-cause:${id}`,
      basis: OPERATOR_PUBLICATION_BASIS,
      secrecy: OPERATOR_PUBLICATION_SECRECY,
    },
  };
}

const provenanceLine = (f: OwnerFact): string =>
  `corridor: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

const quoted = (s: string): string => JSON.stringify(s);

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  c: EstablishCorridorInput,
): string[] {
  return [
    `CONFIRMATION — ONE PHYSICAL CORRIDOR BETWEEN TWO ESTABLISHED LOCI`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  corridor identity: ${id} (established locality ${localityId})`,
    ``,
    `THE TOPOLOGICAL FACT YOU ARE CONFIRMING (authored by you; nothing is inferred, guessed or defaulted):`,
    `  world: ${c.world_id}`,
    `  FROM locus: ${c.from_locus_id}`,
    `  TO   locus: ${c.to_locus_id}`,
    `  statement: ${quoted(c.statement)}`,
    ``,
    `Confirming commits this as ONE further physical setting fact, a DIRECTED connection from the first locus to the second. The world, both`,
    `loci and every other fact are read and left exactly as they are. It states no distance, travel time, speed, throughput, capacity,`,
    `right of access, absence of hazards, usable service or successful journey; it implies NO reverse corridor (the reverse needs its own`,
    `authoring), no intermediate locus and no route calibration. It moves and requests nothing, creates no character, actor, cohort or`,
    `relationship, advances no time, and grants nobody perception, knowledge or permission to traverse anything. A later movement service`,
    `needs its own independently admitted request and its own declared boundary; this corridor supplies neither. Committed facts are never`,
    `replaced.`,
  ];
}

/** The corridor fact value exactly as the owner is asked to establish it: the references derived, never copied. */
const corridorValueOf = (d: CorridorFile) => corridorOfInput(d.corridor);

/**
 * Proves, before anything is written to the operator's campaign, that the genuine World-State operation admits this exact corridor for
 * the campaign's established world: the world and both loci, as committed, are republished on a scratch package, the corridor is run
 * through the genuine owner operation, and the scratch package is removed. Nothing here is reused: the scratch package is not the campaign.
 */
async function dryRun(
  campaignId: string,
  world: OwnerFact,
  loci: readonly OwnerFact[],
  d: CorridorFile,
  buildId: string,
): Promise<Result<null, "INVALID_CORRIDOR">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-corridor-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_CORRIDOR", "the corridor could not be checked", {
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
      const steps: [string, () => ReturnType<CanonicalCampaign["establishWorld"]>][] = [
        ["world", () => created.value.establishWorld({ ...pub("world"), world: world.value })],
        ...loci.map((l, i): [string, () => ReturnType<CanonicalCampaign["establishWorld"]>] => [
          `locus ${i + 1}`,
          () => created.value.establishLocus({ ...pub(`locus-${i}`), locus: l.value }),
        ]),
        [
          "corridor",
          () => created.value.establishCorridor({ ...pub("corridor"), corridor: d.corridor }),
        ],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_CORRIDOR", "the owner path refuses this corridor", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_CORRIDOR", "the corridor could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishCorridorParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly corridorFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one corridor.
 *
 *   read the file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character, both endpoint loci committed in that world → replay-and-verify when this identity already
 *   committed → otherwise prove the owner path admits it, ask ONE confirmation → commit the corridor → reopen the package afresh,
 *   owner-verified, and compare → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. A corridor already
 * committed under this identity is verified and reported without asking again.
 */
export async function establishCorridor(params: EstablishCorridorParams): Promise<CorridorResult> {
  const read = readCorridorFile(params.corridorFile);
  if (!read.ok) return result(read.error.code, issuesOf(read.error));
  const doc = read.value;
  const plan = planOf(params.campaignId, doc);
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
    return await run({ params, session, doc, plan, buildId });
  } catch {
    // an unexpected failure is never a success and never a clean refusal
    return result("CORRIDOR_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishCorridorParams;
  readonly session: LocalOperatorSession;
  readonly doc: CorridorFile;
  readonly plan: Plan;
  readonly buildId: string;
}

/** What this identity has committed so far, judged on the immutable committed group (never on the fact, which is create-only anyway). */
type Committed =
  | { readonly kind: "NONE" }
  | { readonly kind: "HELD" }
  | { readonly kind: "CONFLICT"; readonly reason: string };

function committedOf(campaign: CanonicalCampaign, doc: CorridorFile, plan: Plan): Committed {
  const store = campaign.store;
  const group = store.committedGroup(plan.publication.intent_id);
  if (group === null) {
    // a different identity under this ordered pair's key is a conflict, never a sibling truth
    return store.getFact(plan.key)
      ? { kind: "CONFLICT", reason: `a corridor is already held for ${plan.key}` }
      : { kind: "NONE" };
  }
  const write = group.writes[0];
  const value = write ? WorldCorridorSchema.safeParse(write.value) : undefined;
  if (
    group.group_id !== plan.publication.group_id ||
    group.writes.length !== 1 ||
    write?.key !== plan.key ||
    !value?.success ||
    !canonicalEqual(value.data, corridorValueOf(doc)) ||
    !store.getFact(plan.key)
  )
    return {
      kind: "CONFLICT",
      reason:
        "this identity's corridor is committed with different content, or its fact is not held",
    };
  return { kind: "HELD" };
}

/** The two endpoint loci as committed canon: each an ordinary World-State locus fact of the established world. */
function endpoints(
  campaign: CanonicalCampaign,
  doc: CorridorFile,
): { readonly loci: readonly OwnerFact[] } | { readonly missing: string } {
  const c = doc.corridor;
  const out: OwnerFact[] = [];
  for (const id of [c.from_locus_id, c.to_locus_id]) {
    const fact = campaign.store.getFact(worldLocusKey(c.world_id, id));
    const locus = fact ? WorldLocusSchema.safeParse(fact.value) : undefined;
    if (!fact || !locus?.success || locus.data.world.entity_id !== c.world_id)
      return { missing: id };
    out.push(fact);
  }
  return { loci: out };
}

async function run(a: RunArgs): Promise<CorridorResult> {
  const { params, session, doc, plan, buildId } = a;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);

  const committed = committedOf(campaign, doc, plan);
  if (committed.kind === "CONFLICT") return result("CORRIDOR_CONFLICT", [committed.reason]);
  if (committed.kind === "HELD") {
    // the corridor already committed under this identity (a repeat, a lost reply, a restart): verified and reported without asking again
    if (locality.kind !== "ESTABLISHED") return result("PRE_PLAY_CLOSED", [locality.reason]);
    const problems = factProblems(campaign, doc, plan);
    if (problems.length > 0) return result("CORRIDOR_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, plan, doc, campaign);
  }

  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("CORRIDOR_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  if (doc.corridor.world_id !== locality.world_id)
    return result("WORLD_MISMATCH", [`the established world is ${locality.world_id}`]);
  const ends = endpoints(campaign, doc);
  if ("missing" in ends) return result("LOCUS_NOT_ESTABLISHED", [`no locus ${ends.missing}`]);

  const admissible = await dryRun(params.campaignId, locality.world, ends.loci, doc, buildId);
  if (!admissible.ok) return result("INVALID_CORRIDOR", issuesOf(admissible.error));

  const before = store.listFacts();
  const revisionBefore = store.head().revision;
  const subject = subjectOf({
    verb: "establish-corridor",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    corridor_id: plan.id,
    corridor: doc.corridor,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-corridor",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      plan.id,
      locality.setup_id,
      doc.corridor,
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-corridor", subject))
    return result("DECLINED");

  const published = await campaign.establishCorridor({
    ...plan.publication,
    corridor: doc.corridor,
  });
  if (!published.ok) {
    if (UNKNOWN_OUTCOME.has(published.error.code)) {
      session.markAmbiguous();
      return result("CORRIDOR_OUTCOME_UNKNOWN", [`corridor: ${published.error.code}`]);
    }
    return result(
      "CORRIDOR_REFUSED",
      [`corridor: ${published.error.code}`, ...issuesOf(published.error)],
      published.error.code,
    );
  }
  params.terminal.say(`PROGRESS corridor COMMITTED ${plan.key}`);
  await session.close();

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(params.campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("CORRIDOR_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("CORRIDOR_VERIFICATION_FAILED", ["the reopened campaign has another identity"]);
    const problems = [
      ...factProblems(back, doc, plan),
      ...unchangedProblems(
        before,
        back.store.listFacts(),
        plan.key,
        revisionBefore,
        back.store.head().revision,
      ),
    ];
    if (problems.length > 0) return result("CORRIDOR_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, plan, doc, back, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The new fact against the confirmed corridor: typed value, owner/facet, key, and the committed provenance of its one-write group. */
function factProblems(campaign: CanonicalCampaign, doc: CorridorFile, plan: Plan): string[] {
  const problems: string[] = [];
  if (campaign.verify().length > 0) problems.push("canonical integrity reports violations");
  const c = doc.corridor;
  const held = campaign.corridor(c.world_id, c.from_locus_id, c.to_locus_id);
  if (!held) return [...problems, "the corridor is not held or is not valid"];
  const f = held.fact;
  // provenance is judged on the immutable committed group
  const group = campaign.store.committedGroup(plan.publication.intent_id);
  const write = group?.writes[0];
  if (
    !group ||
    group.writes.length !== 1 ||
    group.group_id !== plan.publication.group_id ||
    group.cause !== plan.publication.cause ||
    group.owner !== "world_state" ||
    group.facet !== "world_locus" ||
    write?.key !== plan.key ||
    write.basis !== plan.publication.basis ||
    write.secrecy !== plan.publication.secrecy ||
    f.key !== plan.key ||
    f.owner !== "world_state" ||
    f.facet !== "world_locus" ||
    f.version !== 1 ||
    f.provenance.group_id !== plan.publication.group_id ||
    f.provenance.intent_id !== plan.publication.intent_id ||
    f.provenance.cause !== plan.publication.cause ||
    f.basis !== plan.publication.basis ||
    f.secrecy !== plan.publication.secrecy
  )
    problems.push("the corridor does not carry this identity's owner, key or provenance");
  if (!canonicalEqual(held.value, corridorValueOf(doc)))
    problems.push("the corridor differs from the confirmed corridor");
  return problems;
}

/** Every fact the campaign held before the commit is exactly as it was, and only the expected new key was added. */
function unchangedProblems(
  before: readonly OwnerFact[],
  after: readonly OwnerFact[],
  newKey: string,
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
    after.length !== before.length + 1 ||
    added.length !== 1 ||
    added[0]?.key !== newKey ||
    revisionAfter !== revisionBefore + 1
  )
    problems.push("the commit wrote more or less than the one expected new fact");
  return problems;
}

function ready(
  campaignId: string,
  plan: Plan,
  doc: CorridorFile,
  campaign: CanonicalCampaign,
  verifiedUnchanged = false,
): CorridorResult {
  const c = doc.corridor;
  const held = campaign.corridor(c.world_id, c.from_locus_id, c.to_locus_id)?.fact;
  return result("CORRIDOR_READY", [
    `campaign: ${campaignId}`,
    `corridor identity: ${plan.id}`,
    ...(held ? [provenanceLine(held)] : []),
    `connection: ${c.from_locus_id} → ${c.to_locus_id} (directed; nothing else is stated or implied)`,
    ...(verifiedUnchanged
      ? ["the world, both loci and every other earlier fact are unchanged"]
      : []),
  ]);
}
