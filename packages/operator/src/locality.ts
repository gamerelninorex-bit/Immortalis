import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
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
  EntityId,
  EstablishSourceConditionInputSchema,
  Text,
  WorldConstraintSchema,
  WorldProfileSchema,
  canonicalJson,
  fail,
  ok,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  type OwnerFact,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, nodeFs, type FsOps } from "@immortalis/engine";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { ensureOperatorStateDirectory, verifyLocalOperator } from "./local-operator.ts";
import { readPin, writePin } from "./locality-pin.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession, defaultOperatorDir } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Confirmed ORIGINAL locality & finite source admission: the shipped, local, out-of-character path that creates (or faithfully
 * resumes) ONE standard campaign package holding ONE curated ORIGINAL World Profile, ONE locus of that world and ONE authored
 * EXACT_FINITE Source Condition at that locus — through the existing `CanonicalCampaign` World-State operations
 * (`establishWorld` → `establishLocus` → `establishSourceCondition`) and nothing else.
 *
 * Everything that is a setting fact is authored by the operator in a local setup file and shown back, in full, for ONE explicit
 * typed confirmation; nothing is inferred, estimated, defaulted or delegated, and the setup file can carry no owner, role,
 * permission, rule, version, publication label or "confirmed" claim (every schema is strict). The service authors only the
 * technical publication identities, and it derives them from the exact confirmed content (a hash of the campaign identity and the
 * three authored sections), so the same confirmed setup always reaches the same group/intent identities: a retry after a crash or
 * a lost reply replays what committed (RC-16) and finishes what did not, and any different setup meets the committed identities
 * and is refused — a campaign never mixes the world of one choice with the locus or source of another.
 *
 * The three commits are separate World-State publications in dependency order, each durable on its own. A campaign that holds
 * only some of them is partially constructed and is never reported as ready; only a verified read of all three is.
 *
 * Mechanism only. This creates a physical setting substrate: no actor, cohort, relationship, character, perception, knowledge,
 * extraction permission or capability, and it advances no time. The authored quantity is a setting fact, never an estimate,
 * availability verdict, yield or renewal.
 */

export const LOCALITY_SETUP_FORMAT = "immortalis-original-locality-setup";
export const LOCALITY_SETUP_FORMAT_VERSION = 1;

/** The most a setup file may hold: far beyond any hand-authored locality, and a bound on what the console is asked to show. */
const MAX_SETUP_BYTES = 64 * 1024;

const OriginalWorldSchema = WorldProfileSchema.extend({
  reference_causal_basis: z.strictObject({ mode: z.literal("ORIGINAL"), established_canon: Text }),
});

const LocusSectionSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  designation: Text,
  constraints: z.array(WorldConstraintSchema),
});

/**
 * The operator-authored setup. The world section is exactly the World Profile restricted to the ORIGINAL reference mode (no other
 * mode, and no delegation, is representable here); the source section is exactly `EstablishSourceConditionInput`. The locus
 * section names the world it belongs to; the service derives the fact reference, and the identities must agree across sections.
 */
export const LocalitySetupSchema = z
  .strictObject({
    format: z.literal(LOCALITY_SETUP_FORMAT),
    format_version: z.literal(LOCALITY_SETUP_FORMAT_VERSION),
    world: OriginalWorldSchema,
    locus: LocusSectionSchema,
    source: EstablishSourceConditionInputSchema,
  })
  .superRefine((s, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (s.locus.world_id !== s.world.world_id)
      bad("the locus belongs to the setup's world", ["locus", "world_id"]);
    if (s.source.world_id !== s.world.world_id)
      bad("the source belongs to the setup's world", ["source", "world_id"]);
    if (s.source.locus_id !== s.locus.locus_id)
      bad("the source is at the setup's locus", ["source", "locus_id"]);
  });
export type LocalitySetup = z.infer<typeof LocalitySetupSchema>;

export type SetupFileErrorCode = "SETUP_FILE_UNTRUSTED" | "SETUP_FILE_UNREADABLE" | "INVALID_SETUP";

/**
 * Reads the operator's setup file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system
 * user, not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readLocalitySetupFile(path: string): Result<LocalitySetup, SetupFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("SETUP_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "SETUP_FILE_UNTRUSTED",
          "the setup file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_SETUP_BYTES)
        return fail("INVALID_SETUP", "the setup file is larger than a locality setup can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("SETUP_FILE_UNREADABLE", "the setup file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_SETUP", "the setup file is not valid JSON");
  }
  const parsed = LocalitySetupSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_SETUP", "the setup file is not a complete, valid locality setup", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return ok(parsed.data);
}

/** The identity of one confirmed setup in one campaign: a hash of exactly the authored content, never a clock or a random value. */
export const localitySetupId = (campaignId: string, setup: LocalitySetup): string =>
  createHash("sha256")
    .update(
      canonicalJson({
        campaign_id: campaignId,
        world: setup.world,
        locus: setup.locus,
        source: setup.source,
      }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);

export type LocalityStatus =
  | "LOCALITY_READY"
  | "LOCALITY_INCOMPLETE"
  | "LOCALITY_OUTCOME_UNKNOWN"
  | "LOCALITY_REFUSED"
  | "LOCALITY_VERIFICATION_FAILED"
  | "SETUP_CONFLICT"
  | "PACKAGE_UNUSABLE"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | SetupFileErrorCode;

export interface LocalityResult {
  readonly status: LocalityStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<LocalityStatus, string> = {
  LOCALITY_READY:
    "the original locality is established and an owner-verified open of the package reads back exactly the confirmed setup; this is a physical setting only: nobody perceives, knows or may extract anything because of it",
  LOCALITY_INCOMPLETE:
    "the campaign is partially constructed and is NOT ready; rerun the same confirmed setup to finish it",
  LOCALITY_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; the campaign is NOT reported ready; rerun the same setup (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identities",
  LOCALITY_REFUSED: "an owner refused a write; the campaign is NOT ready and nothing was replaced",
  LOCALITY_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed setup; it is NOT ready",
  SETUP_CONFLICT:
    "this campaign holds a different setup, or other content, and nothing was changed: a campaign has one original locality and committed facts are never replaced",
  PACKAGE_UNUSABLE:
    "the campaign package cannot be created or used here; nothing was changed. A directory that is not an empty or complete campaign is never adopted or cleared",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  SETUP_FILE_UNTRUSTED: "the setup file is not trusted; nothing was changed",
  SETUP_FILE_UNREADABLE: "the setup file cannot be read; nothing was changed",
  INVALID_SETUP: "the setup is not a complete, valid ORIGINAL locality setup; nothing was changed",
};

const result = (
  status: LocalityStatus,
  details: readonly string[] = [],
  code?: string,
): LocalityResult => ({
  status,
  message: MESSAGES[status],
  details,
  ...(code !== undefined ? { code } : {}),
});

type StageName = "world" | "locus" | "source";
const STAGES: readonly StageName[] = ["world", "locus", "source"];
const GROUP = /^operator-locality:([0-9a-f]{32}):(world|locus|source)$/;

interface Stage {
  readonly name: StageName;
  readonly key: string;
  readonly publication: Publication;
  readonly owner: string;
  readonly facet: string;
}

function planOf(campaignId: string, setup: LocalitySetup): { id: string; stages: Stage[] } {
  const id = localitySetupId(campaignId, setup);
  const pub = (name: StageName): Publication => ({
    group_id: `operator-locality:${id}:${name}`,
    intent_id: `operator-locality-intent:${id}:${name}`,
    cause: `operator-locality-cause:${id}`,
    basis: OPERATOR_PUBLICATION_BASIS,
    secrecy: OPERATOR_PUBLICATION_SECRECY,
  });
  const w = setup.world.world_id;
  return {
    id,
    stages: [
      {
        name: "world",
        key: worldProfileKey(w),
        publication: pub("world"),
        owner: "world_state",
        facet: "world_profile",
      },
      {
        name: "locus",
        key: worldLocusKey(w, setup.locus.locus_id),
        publication: pub("locus"),
        owner: "world_state",
        facet: "world_locus",
      },
      {
        name: "source",
        key: worldSourceConditionKey(w, setup.source.source_key),
        publication: pub("source"),
        owner: "world_state",
        facet: "world_source_condition",
      },
    ],
  };
}

function runStage(campaign: CanonicalCampaign, setup: LocalitySetup, stage: Stage) {
  const publication = stage.publication;
  if (stage.name === "world")
    return campaign.establishWorld({ ...publication, world: setup.world });
  if (stage.name === "locus")
    return campaign.establishLocus({
      ...publication,
      locus: {
        locus_id: setup.locus.locus_id,
        world: {
          fact_key: worldProfileKey(setup.world.world_id),
          entity_id: setup.world.world_id,
        },
        designation: setup.locus.designation,
        constraints: setup.locus.constraints,
      },
    });
  return campaign.establishSourceCondition({ ...publication, source: setup.source });
}

type Plan =
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "PENDING"; readonly pending: readonly Stage[] }
  | { readonly kind: "CONFLICT"; readonly reason: string };

/**
 * What the open campaign holds of this exact confirmed setup. A stage is done when the group of this setup's identity is
 * committed; a fact at a stage's key that this identity did not commit, any later stage without its predecessor, and (while
 * anything is still to be written) any other fact in the campaign are conflicts — never reconciled, never overwritten.
 */
function inspect(campaign: CanonicalCampaign, stages: readonly Stage[]): Plan {
  const store = campaign.store;
  const done = stages.map((s) => {
    const group = store.committedGroup(s.publication.intent_id);
    return group !== null && group.group_id === s.publication.group_id;
  });
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    const fact = store.getFact(s.key);
    if (done[i]) {
      // the committed group is the immutable record; the fact itself may since have advanced under its own owner (the Source
      // Condition changes when World-State delivers a Production-caused Source Delta), so only its presence is required here
      const wrote = store
        .committedGroup(s.publication.intent_id)
        ?.writes.some((w) => w.key === s.key);
      if (!fact || !wrote)
        return { kind: "CONFLICT", reason: `the ${s.name} committed by this setup is not held` };
      if (i > 0 && !done[i - 1])
        return { kind: "CONFLICT", reason: `the ${s.name} is held without its predecessor` };
    } else if (fact) {
      return { kind: "CONFLICT", reason: `a different ${s.name} is already committed` };
    }
  }
  const pending = stages.filter((_, i) => !done[i]);
  if (pending.length === 0) return { kind: "COMPLETE" };
  // a full listing is an exceptional diagnostic path; it is taken only while a setup is still being written
  const mine = new Set(stages.map((s) => s.key));
  if (store.listFacts().some((f) => !mine.has(f.key)))
    return { kind: "CONFLICT", reason: "the campaign holds content other than this setup" };
  return { kind: "PENDING", pending };
}

const provenanceLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

/**
 * Reads the three facts back from an owner-verified campaign and compares them with the confirmed setup: the typed values, the
 * owners/facets and the committed provenance. Returns the problems found (empty = the campaign holds exactly this setup).
 */
function readBack(campaign: CanonicalCampaign, setup: LocalitySetup, stages: readonly Stage[]) {
  const problems: string[] = [];
  const violations = campaign.verify();
  if (violations.length > 0)
    problems.push(`canonical integrity reports ${violations.length} violation(s)`);
  const attempt = <T>(read: () => T | undefined): T | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  const w = setup.world.world_id;
  const world = attempt(() => campaign.world(w));
  const locus = attempt(() => campaign.locus(w, setup.locus.locus_id));
  const source = attempt(() => campaign.sourceCondition(w, setup.source.source_key));
  const facts = [world?.fact, locus?.fact, source?.fact];
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
      group.owner !== s.owner ||
      group.facet !== s.facet ||
      write?.key !== s.key ||
      write.basis !== s.publication.basis ||
      write.secrecy !== s.publication.secrecy ||
      f.key !== s.key ||
      f.owner !== s.owner ||
      f.facet !== s.facet ||
      (f.version === 1 &&
        (f.provenance.group_id !== s.publication.group_id ||
          f.provenance.intent_id !== s.publication.intent_id ||
          f.provenance.cause !== s.publication.cause ||
          f.basis !== s.publication.basis ||
          f.secrecy !== s.publication.secrecy))
    )
      problems.push(`the ${s.name} does not carry this setup's owner, key or provenance`);
  });
  if (world && !canonicalEqual(world.value, setup.world))
    problems.push("the world differs from the confirmed setup");
  if (
    locus &&
    !canonicalEqual(locus.value, {
      locus_id: setup.locus.locus_id,
      world: { fact_key: worldProfileKey(w), entity_id: w },
      designation: setup.locus.designation,
      constraints: setup.locus.constraints,
    })
  )
    problems.push("the locus differs from the confirmed setup");
  if (source) {
    const v = source.value;
    const s = setup.source;
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
      problems.push("the source condition differs from the confirmed setup");
  }
  return { problems, facts };
}

function reportReady(
  campaignId: string,
  id: string,
  setup: LocalitySetup,
  stages: readonly Stage[],
  facts: readonly (OwnerFact | undefined)[],
  recoverable: number,
): LocalityResult {
  const q = setup.source.quantity;
  return result("LOCALITY_READY", [
    `campaign: ${campaignId}`,
    `setup identity: ${id}`,
    ...stages.map((s, i) => provenanceLine(s.name, facts[i]!)),
    `source: ${setup.source.source_key} EXACT_FINITE, established ${q.amount} ${q.unit} of ${setup.source.material_class}; recoverable now ${recoverable} ${q.unit}`,
  ]);
}

/** The recoverable amount the source holds now (net of any later delivery), read from the typed fact. */
const recoverableNow = (campaign: CanonicalCampaign, setup: LocalitySetup): number =>
  campaign.sourceCondition(setup.world.world_id, setup.source.source_key)?.value.recoverable
    .amount ?? 0;

const quoted = (s: string): string => JSON.stringify(s);
const listOf = (title: string, items: readonly string[]): string[] =>
  items.length === 0 ? [`  ${title}: none`] : [`  ${title}:`, ...items.map((i) => `    - ${i}`)];

function shown(
  campaignId: string,
  operator: string,
  id: string,
  setup: LocalitySetup,
  how: string,
  pending: readonly StageName[],
): string[] {
  const { world, locus, source } = setup;
  return [
    `CONFIRMATION — ORIGINAL LOCALITY SETUP`,
    OOC_BANNER,
    `  campaign:  ${campaignId} (${how})`,
    `  operator:  ${operator}`,
    `  setup identity: ${id}`,
    `  to commit, in this order: ${pending.join(" → ")}`,
    ``,
    `THE SETTING FACTS YOU ARE CONFIRMING (authored by you; nothing is inferred, estimated or defaulted):`,
    `WORLD — ORIGINAL`,
    `  world id: ${world.world_id}`,
    `  premise: ${quoted(world.premise)}`,
    `  established canon: ${quoted(world.reference_causal_basis.established_canon)}`,
    ...listOf("material world-law departures", world.material_world_law_departures.map(quoted)),
    ...listOf(
      "insertion-supporting constraints",
      world.insertion_supporting_constraints.map((c) => `${c.aspect}: ${quoted(c.statement)}`),
    ),
    `LOCUS`,
    `  locus id: ${locus.locus_id} (of world ${locus.world_id})`,
    `  designation: ${quoted(locus.designation)}`,
    ...listOf(
      "constraints",
      locus.constraints.map((c) => `${c.aspect}: ${quoted(c.statement)}`),
    ),
    `SOURCE CONDITION — EXACT, FINITE, an initial setting fact`,
    `  source key: ${source.source_key} at locus ${source.locus_id}`,
    `  dimension: ${source.dimension}`,
    `  material class: ${source.material_class}`,
    `  EXACT quantity: ${source.quantity.amount} ${source.quantity.unit} (the whole recoverable amount; none delivered)`,
    ...listOf(
      "physical access facts",
      source.access_facts.map((a) => `${a.aspect}: ${quoted(a.statement)}`),
    ),
    `  statement: ${quoted(source.statement)}`,
    ``,
    `Confirming commits these as the physical setting of this campaign, one durable World-State publication at a time.`,
    `It creates no character, actor, cohort or relationship, advances no time, and grants nobody perception, knowledge or`,
    `permission to extract: the quantity is a setting fact, not an estimate, availability verdict or yield.`,
    `Committed facts are never replaced; a different setup is refused for this campaign.`,
  ];
}

export interface EstablishLocalityParams {
  readonly campaignDir: string;
  /** the campaign identity to create, or that the existing package must hold */
  readonly campaignId: string;
  readonly setupFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine World-State operations admit this exact setup: the
 * three of them are run, in order, on a scratch package that is then removed. The strict input schemas are not the whole of what the
 * owner path checks (e.g. the derived Source Condition rejects duplicate access aspects), and a refusal after the world or locus had
 * committed would strand a campaign that no setup could ever complete. Nothing here is reused: the scratch package is not the campaign.
 */
async function dryRun(
  campaignId: string,
  setup: LocalitySetup,
  stages: readonly Stage[],
  buildId: string,
): Promise<Result<null, "INVALID_SETUP">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-locality-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_SETUP", "the setup could not be checked", {
        issues: [created.error.code],
      });
    try {
      for (const stage of stages) {
        const admitted = await runStage(created.value, setup, stage);
        if (!admitted.ok) {
          const issues =
            (admitted.error.details as { issues?: string[] } | undefined)?.issues ?? [];
          return fail("INVALID_SETUP", "the owner path refuses this setup", {
            issues: [`${stage.name}: ${admitted.error.code}`, ...issues],
          });
        }
      }
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_SETUP", "the setup could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

const BUILD_ID = "immortalis-operator";

/** Releases a session whatever the disk does: a close that fails leaves the package lock, which the next run reclaims explicitly. */
const closeQuietly = async (session: { close(): Promise<void> } | undefined): Promise<void> => {
  try {
    await session?.close();
  } catch {
    // nothing more can be done here; the next run reconciles by identity
  }
};
const UNKNOWN_OUTCOME = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

/**
 * Creates or resumes the one confirmed original locality of a campaign.
 *
 *   read the setup file (trusted, strict) → decide what the package holds → ask ONE confirmation of everything about to be written
 *   → create the standard package if it is new → commit the missing stages in dependency order → reopen the package afresh, owner-
 *   verified, and compare the three facts with the confirmed setup → report READY only then.
 *
 * Nothing is written before the confirmation. A setup already fully committed is verified and reported without asking again.
 */
export async function establishLocality(params: EstablishLocalityParams): Promise<LocalityResult> {
  const read = readLocalitySetupFile(params.setupFile);
  if (!read.ok) {
    const issues = (read.error.details as { issues?: string[] } | undefined)?.issues ?? [];
    return result(read.error.code, issues);
  }
  const setup = read.value;
  const { id, stages } = planOf(params.campaignId, setup);
  const fs = params.campaignFs ?? nodeFs;
  const buildId = params.buildId ?? BUILD_ID;
  const { terminal, campaignDir } = params;

  // The confirmed setup identity this campaign already retains (BLUE F60-R1): a different setup is refused here, before anything else
  // is looked at, even when the package holds no fact yet — the empty package between its creation and the first World-State commit
  // carries no marker of what was confirmed, so the retained identity is the only thing that can tell a resumption from a new choice.
  const stateDir = params.operatorDir ?? defaultOperatorDir(campaignDir);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const retainedFs = params.ledgerFs ?? nodeFs;
  if (uid === undefined)
    return result("SESSION_UNAVAILABLE", [], "OPERATOR_UNVERIFIED UNSUPPORTED_PLATFORM");
  if (existsSync(stateDir)) {
    const trusted = verifyLocalOperator(stateDir, "operator-state");
    if (!trusted.ok || trusted.value.uid !== uid)
      return result("SESSION_UNAVAILABLE", [], "OPERATOR_UNVERIFIED");
  }
  const retained = await readPin({
    dir: stateDir,
    campaignId: params.campaignId,
    operatorUid: uid,
    fs: retainedFs,
  });
  if (!retained.ok)
    return result(
      "SESSION_UNAVAILABLE",
      [retained.error.message],
      `STATE_UNAVAILABLE ${retained.error.code}`,
    );
  if (retained.value !== null && retained.value !== id)
    return result("SETUP_CONFLICT", [
      `this campaign already has a different confirmed setup (identity ${retained.value}); this one is ${id}`,
    ]);

  // what is on disk: nothing/empty (create), a package (resume) or something that is neither (never adopted)
  let isNew: boolean;
  try {
    const entries = await fs.list(campaignDir);
    const hasManifest = entries.includes("manifest.json");
    if (entries.length > 0 && !hasManifest)
      return result("PACKAGE_UNUSABLE", [
        "the directory is not empty and holds no campaign manifest (an interrupted creation or foreign content)",
      ]);
    isNew = entries.length === 0;
  } catch {
    return result("PACKAGE_UNUSABLE", ["the directory cannot be listed"]);
  }
  // an existing directory the package would be created in must already be the operator's own and closed to others
  if (isNew && existsSync(campaignDir)) {
    const operator = verifyLocalOperator(campaignDir, "campaign");
    if (!operator.ok) return result("PACKAGE_UNUSABLE", [`local operator: ${operator.error.code}`]);
  }

  let existing: LocalOperatorSession | undefined;
  let pending: readonly Stage[] = stages;
  if (!isNew) {
    const opened = await openSession(params);
    if (!opened.ok) return opened.refusal;
    existing = opened.session;
    const plan = inspect(existing.campaign, stages);
    if (plan.kind === "CONFLICT") {
      await closeQuietly(existing);
      return result("SETUP_CONFLICT", [plan.reason]);
    }
    if (plan.kind === "COMPLETE") {
      try {
        const back = readBack(existing.campaign, setup, stages);
        if (back.problems.length > 0) return result("LOCALITY_VERIFICATION_FAILED", back.problems);
        return reportReady(
          params.campaignId,
          id,
          setup,
          stages,
          back.facts,
          recoverableNow(existing.campaign, setup),
        );
      } finally {
        await closeQuietly(existing);
      }
    }
    pending = plan.pending;
  }

  const admissible = await dryRun(params.campaignId, setup, stages, buildId);
  if (!admissible.ok) {
    await closeQuietly(existing);
    const issues = (admissible.error.details as { issues?: string[] } | undefined)?.issues ?? [];
    return result("INVALID_SETUP", issues);
  }

  const operatorName = existing
    ? `${existing.operator.username} (uid ${existing.operator.uid})`
    : `uid ${process.getuid?.() ?? "unknown"}`;
  const how = isNew
    ? "a NEW standard campaign package will be created"
    : `existing package, resuming ${pending.length} of ${stages.length} stages`;
  const subject = subjectOf({
    verb: "establish-locality",
    campaign_id: params.campaignId,
    setup_id: id,
    pending: pending.map((s) => s.name),
    new_package: isNew,
  });
  const confirmation = await requestOperatorConfirmation(
    terminal,
    "establish-locality",
    subject,
    shown(
      params.campaignId,
      operatorName,
      id,
      setup,
      how,
      pending.map((s) => s.name),
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-locality", subject)) {
    await closeQuietly(existing);
    return result("DECLINED");
  }

  try {
    return await commitAndVerify({
      params,
      setup,
      id,
      stages,
      pending,
      existing,
      isNew,
      fs,
      buildId,
      stateDir,
      uid,
      retainedFs,
      retained: retained.value,
    });
  } catch {
    // an unexpected failure after the confirmation is an unknown outcome, never a success and never a clean refusal
    return result("LOCALITY_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the write"]);
  }
}

interface CommitArgs {
  readonly params: EstablishLocalityParams;
  readonly setup: LocalitySetup;
  readonly id: string;
  readonly stages: readonly Stage[];
  readonly pending: readonly Stage[];
  readonly existing: LocalOperatorSession | undefined;
  readonly isNew: boolean;
  readonly fs: FsOps;
  readonly buildId: string;
  /** the owner-only retained-state directory, the operator's uid and the file system seam of the retained setup identity */
  readonly stateDir: string;
  readonly uid: number;
  readonly retainedFs: FsOps;
  /** the identity already retained for this campaign (equal to `id`), or null when this confirmation is the first */
  readonly retained: string | null;
}

/** The confirmed writes: create the package if new, commit the missing stages in order, then verify on a fresh reopen. */
async function commitAndVerify(a: CommitArgs): Promise<LocalityResult> {
  const { params, setup, id, stages, pending, existing, fs, buildId } = a;
  const { terminal, campaignDir } = params;
  const pin = {
    dir: a.stateDir,
    campaignId: params.campaignId,
    operatorUid: a.uid,
    fs: a.retainedFs,
  };

  // The confirmed identity is retained durably BEFORE the package is created (or anything is committed), so that every later
  // durable cut — package created and empty, each fact, the acknowledgement — can tell this setup from a different one. A failed
  // write may or may not have landed; nothing has been created yet, and the next run reads which.
  if (a.retained === null) {
    try {
      ensureOperatorStateDirectory(a.stateDir);
    } catch {
      await closeQuietly(existing);
      return result("SESSION_UNAVAILABLE", [], "STATE_UNAVAILABLE");
    }
    const trusted = verifyLocalOperator(a.stateDir, "operator-state");
    if (!trusted.ok || trusted.value.uid !== a.uid) {
      await closeQuietly(existing);
      return result("SESSION_UNAVAILABLE", [], "OPERATOR_UNVERIFIED");
    }
    const kept = await writePin({ ...pin, setupId: id });
    if (!kept.ok) {
      await closeQuietly(existing);
      return kept.error.code === "PIN_CONFLICT"
        ? result("SETUP_CONFLICT", [kept.error.message])
        : result("LOCALITY_OUTCOME_UNKNOWN", [
            `retaining the confirmed setup identity: ${kept.error.code}`,
          ]);
    }
    terminal.say(`PROGRESS setup PINNED ${id}`);
  }

  let live: LocalOperatorSession;
  if (existing) {
    live = existing;
  } else {
    const created = await createPackage(params, fs, buildId);
    if (created) return created;
    terminal.say(`PROGRESS package CREATED ${params.campaignId}`);
    // defence in depth only: the identity itself is first-writer-wins (exclusive create), so this re-read can differ from ours only if
    // the retained file was tampered with after we won it; go on only if it is still our own
    const still = await readPin(pin);
    if (!still.ok || still.value !== id)
      return result("SETUP_CONFLICT", [
        "the retained setup identity of this campaign is not this setup",
      ]);
    const opened = await openSession(params);
    if (!opened.ok) return opened.refusal;
    live = opened.session;
    // a package created a moment ago holds nothing; anything else is a package someone else wrote in between
    const again = inspect(live.campaign, stages);
    if (again.kind !== "PENDING" || again.pending.length !== stages.length) {
      await closeQuietly(live);
      return result("SETUP_CONFLICT", ["the new package was not empty when it was opened"]);
    }
  }

  for (const stage of pending) {
    const committed = await runStage(live.campaign, setup, stage);
    if (!committed.ok) {
      if (UNKNOWN_OUTCOME.has(committed.error.code)) {
        live.markAmbiguous();
        await closeQuietly(live);
        return result("LOCALITY_OUTCOME_UNKNOWN", [`${stage.name}: ${committed.error.code}`]);
      }
      const remaining = stages
        .filter((s) => !live.campaign.store.getFact(s.key))
        .map((s) => s.name);
      await closeQuietly(live);
      return result(
        "LOCALITY_REFUSED",
        [`${stage.name}: ${committed.error.code}`, `not committed: ${remaining.join(", ")}`],
        committed.error.code,
      );
    }
    terminal.say(`PROGRESS ${stage.name} COMMITTED ${stage.key}`);
  }
  await closeQuietly(live);

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("LOCALITY_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const campaign = reopened.value;
    if (campaign.store.head().campaign_id !== params.campaignId)
      return result("LOCALITY_VERIFICATION_FAILED", ["the reopened campaign has another identity"]);
    const back = readBack(campaign, setup, stages);
    if (back.problems.length > 0) return result("LOCALITY_VERIFICATION_FAILED", back.problems);
    return reportReady(
      params.campaignId,
      id,
      setup,
      stages,
      back.facts,
      recoverableNow(campaign, setup),
    );
  } finally {
    await closeQuietly(reopened.value);
  }
}

type Opened =
  | { readonly ok: true; readonly session: LocalOperatorSession }
  | { readonly ok: false; readonly refusal: LocalityResult };

async function openSession(params: EstablishLocalityParams): Promise<Opened> {
  const opened = await LocalOperatorSession.open({
    campaignDir: params.campaignDir,
    expectedCampaignId: params.campaignId,
    buildId: params.buildId ?? BUILD_ID,
    ...(params.operatorDir !== undefined ? { operatorDir: params.operatorDir } : {}),
    ...(params.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(params.campaignFs ? { campaignFs: params.campaignFs } : {}),
    ...(params.ledgerFs ? { ledgerFs: params.ledgerFs } : {}),
  });
  if (opened.ok) return { ok: true, session: opened.value };
  const sub = (opened.error.details as { code?: string } | undefined)?.code;
  return {
    ok: false,
    refusal: result(
      "SESSION_UNAVAILABLE",
      [opened.error.message],
      `${opened.error.code}${sub ? ` ${sub}` : ""}`,
    ),
  };
}

/** Creates the standard, empty package in a directory only its operator can write; returns a refusal, or undefined on success. */
async function createPackage(
  params: EstablishLocalityParams,
  fs: FsOps,
  buildId: string,
): Promise<LocalityResult | undefined> {
  try {
    mkdirSync(params.campaignDir, { recursive: true, mode: 0o700 });
  } catch {
    return result("PACKAGE_UNUSABLE", ["the directory cannot be prepared"]);
  }
  const operator = verifyLocalOperator(params.campaignDir, "campaign");
  if (!operator.ok) return result("PACKAGE_UNUSABLE", [`local operator: ${operator.error.code}`]);
  const created = await CanonicalCampaign.create(params.campaignDir, {
    campaignId: params.campaignId,
    buildId,
    ...(params.campaignFs ? { fs } : {}),
  });
  if (!created.ok) return result("PACKAGE_UNUSABLE", [`create: ${created.error.code}`]);
  await closeQuietly(created.value);
  return undefined;
}

/**
 * Reports what the open campaign holds of an operator-confirmed locality, read from canon alone (no setup file): the setup identity
 * the world was committed under, which of its three stages are committed, and — only when all three are and the campaign
 * verifies — the facts. A campaign holding fewer than all three is INCOMPLETE and never advertised as ready.
 */
export function localityStatus(session: LocalOperatorSession): LocalityResult {
  const campaign = session.campaign;
  const store = campaign.store;
  const header = [`campaign: ${session.campaignId}`];
  // a full listing is an exceptional diagnostic path; this is an operator inspection, not a runtime read
  const facts = store.listFacts().filter((f) => f.owner === "world_state");
  const world = facts.find((f) => f.facet === "world_profile" && GROUP.test(f.provenance.group_id));
  const match = world ? GROUP.exec(world.provenance.group_id) : null;
  if (!world || !match)
    return result("LOCALITY_INCOMPLETE", [
      ...header,
      "no operator-confirmed locality setup is committed",
    ]);
  const id = match[1]!;
  header.push(`setup identity: ${id}`);
  const groupOf = (name: StageName): string => `operator-locality:${id}:${name}`;
  const held = (name: StageName): boolean => {
    const group = store.committedGroup(`operator-locality-intent:${id}:${name}`);
    return group !== null && group.group_id === groupOf(name);
  };
  const missing = STAGES.filter((n) => !held(n));
  if (missing.length > 0)
    return result("LOCALITY_INCOMPLETE", [...header, `not committed: ${missing.join(", ")}`]);
  const factOf = (name: StageName): OwnerFact | undefined => {
    const key = store.committedGroup(`operator-locality-intent:${id}:${name}`)?.writes[0]?.key;
    return key === undefined ? undefined : store.getFact(key);
  };
  const locusFact = factOf("locus");
  const sourceFact = factOf("source");
  if (!locusFact || !sourceFact)
    return result("LOCALITY_INCOMPLETE", [...header, "a committed stage is not held"]);
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("LOCALITY_VERIFICATION_FAILED", [
      ...header,
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  const parsedWorld = WorldProfileSchema.safeParse(world.value);
  const source = parsedWorld.success
    ? campaign.sourceCondition(parsedWorld.data.world_id, sourceKey(sourceFact))?.value
    : undefined;
  if (!source)
    return result("LOCALITY_VERIFICATION_FAILED", [...header, "the facts are not valid"]);
  const q = source.establishment.quantity;
  return result("LOCALITY_READY", [
    ...header,
    provenanceLine("world", world),
    provenanceLine("locus", locusFact),
    provenanceLine("source", sourceFact),
    `source: ${source.source_key} ${source.depth}, established ${q.amount} ${q.unit} of ${source.material_class}; recoverable now ${source.recoverable.amount} ${source.recoverable.unit}`,
  ]);
}

const sourceKey = (fact: OwnerFact): string =>
  String((fact.value as { source_key?: unknown }).source_key);
