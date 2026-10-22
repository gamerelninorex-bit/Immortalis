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
  CanonicalTimeSchema,
  GIP_SUNSET_ENROLLMENT_KEY,
  GovernanceInstrumentSchema,
  Id,
  InstitutionIdentitySchema,
  OfficeAuthorityLocusSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  ScopeBindingSchema,
  SunsetEnrollmentSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  canonicalJson,
  compareTime,
  fail,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  gipSunsetObjectId,
  gipSunsetRegistrationGroupId,
  gipSunsetRegistrationIntentId,
  ok,
  temporalObjectKey,
  timeEquals,
  type CommitGroup,
  type OwnerFact,
  type Publication,
  type Result,
  type SunsetEnrollment,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalEqual,
  gipSunsetTemporalObject,
  type FsOps,
} from "@immortalis/engine";
import { establishedLocality } from "./additional-source.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Initial timed governance opening: the shipped, local, out-of-character path that establishes ONE continuing Institution Identity,
 * its ONE Office / Authority Locus, that office's ONE Scope Binding and ONE initially `active` Governance Instrument carrying ONE
 * exact future `sunset_condition`, at an existing canonical time of a fresh, operator-confirmed, pre-play scenario — through the
 * existing `GipAdapter.establishInstitution`, `establishOffice`, `establishScopeBinding` and `establishSunsetInstrument` GIP owner
 * operations and nothing else. The last of them publishes GIP's enrollment receipt and has the Temporal owner register the earned
 * boundary; this module writes no owner fact and no Temporal object of its own.
 *
 * The operator authors exactly one document in a local file: the four strict records the GIP owner already defines, unchanged, the
 * explicit publication `basis` and `secrecy`, and the canonical time the opening is established at. All of it is shown back in full for
 * ONE explicit typed confirmation. Nothing is inferred, defaulted, rolled, derived or delegated: the file can carry no owner, facet,
 * version, receipt, Temporal object, boundary, lifecycle result or "confirmed" claim (every schema is strict). The service authors
 * only the technical publication identities, derived from the campaign and the exact authored document, so a retry after a crash or
 * a lost reply replays what committed (RC-16), finishes what did not, and anything else under those keys is refused.
 *
 * The records are a STIPULATED opening premise: not an engine judgment of historical legal validity, not a finding that anyone chose,
 * consented to or deliberated anything. An opaque `holder_ref` or `decision_body_ref` is only a reference; its referent is neither
 * resolved nor created. The sunset is the earned temporal boundary only: this module never advances time, never expires anything and
 * never writes `expired`. Only a separately authorized canonical advance can reach the boundary, and then only GIP's own stage
 * changes the lifecycle.
 */

export const INITIAL_TIMED_GOVERNANCE_FORMAT = "immortalis-initial-timed-governance";
export const INITIAL_TIMED_GOVERNANCE_FORMAT_VERSION = 1;

/** The most a governance file may hold: far beyond any hand-authored opening premise, and a bound on what the console is asked to show. */
const MAX_FILE_BYTES = 64 * 1024;

const BUILD_ID = "immortalis-operator";

/** The GIP owner, its one facet and the Temporal kernel owner, as the specification-backed registry assigns them (read, never chosen here). */
const GIP_OWNER = "gip";
const GIP_FACET = "gip_institution_identity";
const TEMPORAL_OWNER = "temporal_kernel";

/** C0 and C1 controls, DEL and the line/paragraph separators: nothing authored here may rewrite the operator's console. */
const consoleControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true;
  }
  return false;
};

const hasConsoleControl = (value: unknown): boolean =>
  typeof value === "string"
    ? consoleControl(value)
    : Array.isArray(value)
      ? value.some(hasConsoleControl)
      : value !== null && typeof value === "object"
        ? Object.entries(value).some(([k, v]) => consoleControl(k) || hasConsoleControl(v))
        : false;

/**
 * The operator-authored document: the four GIP records, each exactly its owner schema, the explicit publication labels and the canonical
 * time. The cross-section joins and the bounded family below are THIS path's own eligibility conditions, not rules of the GIP owner,
 * whose admission still judges everything again.
 */
export const InitialTimedGovernanceSchema = z
  .strictObject({
    format: z.literal(INITIAL_TIMED_GOVERNANCE_FORMAT),
    format_version: z.literal(INITIAL_TIMED_GOVERNANCE_FORMAT_VERSION),
    publication: z.strictObject({ basis: Id, secrecy: Id }),
    canonical_time: CanonicalTimeSchema,
    institution: InstitutionIdentitySchema,
    office: OfficeAuthorityLocusSchema,
    scope_binding: ScopeBindingSchema,
    instrument: GovernanceInstrumentSchema,
  })
  .superRefine((d, ctx) => {
    const bad = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { institution, office, scope_binding: binding, instrument, canonical_time: now } = d;
    if (hasConsoleControl(d)) bad("authored text carries no control character or line break", []);
    if (office.institution_id !== institution.institution_id)
      bad("the office belongs to this institution", ["office", "institution_id"]);
    if (
      binding.institution_id !== institution.institution_id ||
      binding.office_id !== office.office_id
    )
      bad("the Scope Binding belongs to this office of this institution", ["scope_binding"]);
    if (
      instrument.source_authority_ref !==
      gipOfficeAuthorityLocusKey(institution.institution_id, office.office_id)
    )
      bad("the Instrument's source authority is exactly this office", [
        "instrument",
        "source_authority_ref",
      ]);
    if (
      instrument.scope_binding_ref !==
      gipScopeBindingKey(institution.institution_id, office.office_id, binding.scope_binding_id)
    )
      bad("the Instrument's Scope Binding is exactly this binding", [
        "instrument",
        "scope_binding_ref",
      ]);
    if (instrument.lifecycle_status !== "active")
      bad("this path opens an initially active Instrument", ["instrument", "lifecycle_status"]);
    const sunset = instrument.sunset_condition;
    if (sunset === undefined)
      bad("the Instrument carries one exact future sunset_condition", [
        "instrument",
        "sunset_condition",
      ]);
    else if (compareTime(now, sunset) !== -1)
      bad("the sunset is an instant strictly after the canonical time, in its unit", [
        "instrument",
        "sunset_condition",
      ]);
  });
export type InitialTimedGovernance = z.infer<typeof InitialTimedGovernanceSchema>;

export type GovernanceFileErrorCode =
  "GOVERNANCE_FILE_UNTRUSTED" | "GOVERNANCE_FILE_UNREADABLE" | "INVALID_GOVERNANCE";

/**
 * Reads the operator's file once, from one open descriptor: a regular file (not a link), owned by the invoking operating-system user,
 * not writable by anyone else, of bounded size, strictly valid. What was read is what is shown, confirmed and used.
 */
export function readInitialTimedGovernanceFile(
  path: string,
): Result<InitialTimedGovernance, GovernanceFileErrorCode> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return fail("GOVERNANCE_FILE_UNTRUSTED", "no local operating-system user can be verified here");
  let text: string;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0)
        return fail(
          "GOVERNANCE_FILE_UNTRUSTED",
          "the governance file must be a regular file you own that nobody else can write",
        );
      if (stat.size > MAX_FILE_BYTES)
        return fail("INVALID_GOVERNANCE", "the governance file is larger than an opening can be");
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return fail("GOVERNANCE_FILE_UNREADABLE", "the governance file cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_GOVERNANCE", "the governance file is not valid JSON");
  }
  const parsed = InitialTimedGovernanceSchema.safeParse(json);
  if (!parsed.success)
    return fail("INVALID_GOVERNANCE", "the governance file is not a complete, valid opening", {
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return ok(parsed.data);
}

/**
 * The identity of one confirmed timed governance opening in one campaign: a hash of exactly the authored content, never a clock or a
 * random value. The same confirmed proposal always reaches the same identities; any other content, even under the same keys, meets the
 * committed identities and is refused.
 */
export const initialTimedGovernanceId = (campaignId: string, d: InitialTimedGovernance): string =>
  createHash("sha256")
    .update(canonicalJson({ campaign_id: campaignId, ...d }), "utf8")
    .digest("hex")
    .slice(0, 32);

export type InitialTimedGovernanceStatus =
  | "GOVERNANCE_READY"
  | "GOVERNANCE_INCOMPLETE"
  | "GOVERNANCE_OUTCOME_UNKNOWN"
  | "GOVERNANCE_REFUSED"
  | "GOVERNANCE_VERIFICATION_FAILED"
  | "LOCALITY_NOT_ESTABLISHED"
  | "PRE_PLAY_CLOSED"
  | "TIME_NOT_ESTABLISHED"
  | "TIME_MISMATCH"
  | "GOVERNANCE_CONFLICT"
  | "SESSION_UNAVAILABLE"
  | "DECLINED"
  | GovernanceFileErrorCode;

export interface InitialTimedGovernanceResult {
  readonly status: InitialTimedGovernanceStatus;
  readonly message: string;
  /** an extra code printed after the status (session refusals) */
  readonly code?: string;
  /** operator/debug visibility of what is, or is not, committed */
  readonly details: readonly string[];
}

const MESSAGES: Record<InitialTimedGovernanceStatus, string> = {
  GOVERNANCE_READY:
    "the institution, its office, the office's Scope Binding and the active timed Instrument are established, GIP's enrollment receipt is committed and the Temporal owner holds the Instrument's earned sunset boundary; an owner-verified reopen of the package reads back exactly the confirmed records and registration, with every earlier fact unchanged. This is a stipulated opening premise only: it is not a finding of legal validity, nobody here chose, consented or deliberated, no actor exists, and the Instrument stays active until canonical time is separately advanced to its sunset",
  GOVERNANCE_INCOMPLETE:
    "part of the opening is committed but not all of it; the timed governance is NOT established; rerun the same command with the same file to finish it",
  GOVERNANCE_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; the timed governance is NOT reported established; rerun the same command with the same file (with --reclaim-stale-lock if the package lock was left behind) to reconcile it by its original identities",
  GOVERNANCE_REFUSED: "the GIP owner refused the write; nothing was committed",
  GOVERNANCE_VERIFICATION_FAILED:
    "what the campaign holds does not match the confirmed opening or the earlier setup; it is NOT reported established",
  LOCALITY_NOT_ESTABLISHED:
    "this campaign holds no operator-confirmed ORIGINAL locality; nothing was changed",
  PRE_PLAY_CLOSED:
    "this campaign is no longer at its pre-play setting (a player character is bound, the established locality has been changed, or the governance records have since been advanced); nothing was changed",
  TIME_NOT_ESTABLISHED:
    "this campaign holds no valid canonical time; the opening is established at an existing canonical time and none is created here; nothing was changed",
  TIME_MISMATCH:
    "the authored canonical time is not this campaign's canonical time (or is in another unit); nothing was changed",
  GOVERNANCE_CONFLICT:
    "this campaign already holds governance state this path will not build beside, or this proposal's identities are committed with different content or out of order; committed facts are never replaced and nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not confirmed; nothing was changed",
  GOVERNANCE_FILE_UNTRUSTED: "the governance file is not trusted; nothing was changed",
  GOVERNANCE_FILE_UNREADABLE: "the governance file cannot be read; nothing was changed",
  INVALID_GOVERNANCE:
    "the governance opening is not a complete, valid timed chain that this path admits; nothing was changed",
};

const result = (
  status: InitialTimedGovernanceStatus,
  details: readonly string[] = [],
  code?: string,
): InitialTimedGovernanceResult => ({
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

type StageName = "institution" | "office" | "scope_binding" | "instrument";

interface Stage {
  readonly name: StageName;
  readonly key: string;
  readonly publication: Publication;
}
type Stages = readonly [Stage, Stage, Stage, Stage];

function planOf(
  campaignId: string,
  d: InitialTimedGovernance,
): { id: string; stages: Stages; registration: Publication } {
  const id = initialTimedGovernanceId(campaignId, d);
  const pub = (name: StageName): Publication => ({
    group_id: `operator-initial-timed-governance:${id}:${name}`,
    intent_id: `operator-initial-timed-governance-intent:${id}:${name}`,
    cause: `operator-initial-timed-governance-cause:${id}`,
    basis: d.publication.basis,
    secrecy: d.publication.secrecy,
  });
  const iid = d.instrument.instrument_id;
  return {
    id,
    stages: [
      {
        name: "institution",
        key: gipInstitutionIdentityKey(d.institution.institution_id),
        publication: pub("institution"),
      },
      {
        name: "office",
        key: gipOfficeAuthorityLocusKey(d.office.institution_id, d.office.office_id),
        publication: pub("office"),
      },
      {
        name: "scope_binding",
        key: gipScopeBindingKey(
          d.scope_binding.institution_id,
          d.scope_binding.office_id,
          d.scope_binding.scope_binding_id,
        ),
        publication: pub("scope_binding"),
      },
      { name: "instrument", key: gipInstrumentKey(iid), publication: pub("instrument") },
    ],
    // derived by the GIP owner from the Instrument alone (RC-16); the cause, basis and secrecy are the instrument stage's
    registration: {
      group_id: gipSunsetRegistrationGroupId(iid),
      intent_id: gipSunsetRegistrationIntentId(iid),
      cause: pub("instrument").cause,
      basis: d.publication.basis,
      secrecy: d.publication.secrecy,
    },
  };
}

/**
 * GIP's enrollment receipt for the Instrument, as WS-007 §4.3 and the owner's admission define it, written out here independently of
 * the adapter so that what the package holds is compared with the confirmed input, not with itself: the Instrument, its exact sunset
 * and the canonical time of the commit.
 */
export const expectedEnrollment = (d: InitialTimedGovernance): SunsetEnrollment => ({
  instrument_id: d.instrument.instrument_id,
  sunset_at: d.instrument.sunset_condition!,
  basis_time: d.canonical_time,
});

const quoted = (s: string): string => JSON.stringify(s);

const provenanceLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

function shown(
  campaignId: string,
  operator: string,
  id: string,
  localityId: string,
  d: InitialTimedGovernance,
  pending: readonly string[],
): string[] {
  const { institution: i, office: o, scope_binding: b, instrument: n } = d;
  const holder =
    "holder_ref" in o
      ? `holder reference ${quoted(o.holder_ref)} (a bare reference: nothing says that anyone exists, chose or consented)`
      : `decision-body reference ${quoted(o.decision_body_ref)} (a bare reference: no body, member or deliberation exists)`;
  return [
    `CONFIRMATION — INITIAL TIMED GOVERNANCE OPENING`,
    OOC_BANNER,
    `  campaign:  ${campaignId}`,
    `  operator:  ${operator}`,
    `  governance identity: ${id} (established locality ${localityId})`,
    `  to commit, in this order: ${pending.join(" → ")}`,
    ``,
    `THE OPENING FACTS YOU ARE CONFIRMING (stipulated by you; nothing is inferred, estimated, generated or defaulted):`,
    `  publication basis ${quoted(d.publication.basis)}, secrecy ${quoted(d.publication.secrecy)}`,
    `  established at canonical time ${d.canonical_time.value} ${quoted(d.canonical_time.unit)}`,
    `INSTITUTION IDENTITY — continuing`,
    `  institution: ${quoted(i.institution_id)}   label: ${quoted(i.identity_label)}`,
    `  constitutive source: ${i.constitutive_source_ref === undefined ? "none" : quoted(i.constitutive_source_ref)}`,
    `OFFICE / AUTHORITY LOCUS`,
    `  office: ${quoted(o.office_id)} of institution ${quoted(o.institution_id)}`,
    `  authority source: ${quoted(o.authority_source_ref)}`,
    `  competence scope: ${quoted(o.competence_scope)}`,
    `  powers: ${o.powers.length === 0 ? "none" : o.powers.map(quoted).join("; ")}`,
    `  duties: ${o.duties.length === 0 ? "none" : o.duties.map(quoted).join("; ")}`,
    `  selection rule: ${quoted(o.selection_rule)}`,
    `  succession rule: ${quoted(o.succession_rule)}`,
    `  removal rule: ${quoted(o.removal_rule)}`,
    `  ${holder}`,
    `SCOPE BINDING`,
    `  binding: ${quoted(b.scope_binding_id)} of office ${quoted(b.office_id)}`,
    `  scope type: ${quoted(b.scope_type)}   scope reference: ${quoted(b.scope_ref)}`,
    `  target condition: ${quoted(b.target_condition)}`,
    `  inheritance rule: ${b.inheritance_rule === undefined ? "none" : quoted(b.inheritance_rule)}`,
    `  exception references: ${b.exception_refs === undefined ? "none" : b.exception_refs.map(quoted).join(", ")}`,
    `  priority or conflict rule reference: ${b.priority_or_conflict_rule_ref === undefined ? "none" : quoted(b.priority_or_conflict_rule_ref)}`,
    `GOVERNANCE INSTRUMENT — initially active, with one exact future sunset`,
    `  instrument: ${quoted(n.instrument_id)}   operative effect: ${quoted(n.operative_effect)}`,
    `  source authority: ${quoted(n.source_authority_ref)}`,
    `  scope binding: ${quoted(n.scope_binding_ref)}`,
    `  authority basis reference: ${quoted(n.authority_basis_ref)}`,
    `  predecessor: ${n.predecessor_instrument_ref === undefined ? "none" : quoted(n.predecessor_instrument_ref)}`,
    `  validity by governing order (authored; nothing is derived):`,
    ...(n.validity_by_order.length === 0
      ? [`    - none authored`]
      : n.validity_by_order.map(
          (v) => `    - order ${quoted(v.governing_order_ref)}: ${quoted(v.validity_status)}`,
        )),
    `  lifecycle: ${quoted(n.lifecycle_status)}`,
    `  SUNSET: canonical time ${n.sunset_condition!.value} ${quoted(n.sunset_condition!.unit)}`,
    ``,
    `Confirming commits the records in that order, one durable GIP publication at a time (each version 1), the last together with GIP's`,
    `enrollment receipt for the sunset, after which the Temporal owner registers the Instrument's earned sunset boundary. The canonical`,
    `time and every other fact are read and left exactly as they are. These are your stipulated opening premises, not a finding that the`,
    `Instrument is legally valid or that anyone chose, accepted or deliberated; a holder or decision-body reference creates no actor,`,
    `body or consent. No time is advanced and nothing is expired: the Instrument stays active until canonical time is separately advanced`,
    `to its sunset, and then only GIP's own stage changes its lifecycle. Committed facts are never replaced.`,
  ];
}

/** The campaign's canonical time against the authored one: the Temporal owner's committed state must exist and be valid, and equal. Read only. */
function timeProblem(
  store: CanonicalCampaign["store"],
  d: InitialTimedGovernance,
): { status: "TIME_NOT_ESTABLISHED" | "TIME_MISMATCH"; reason: string } | undefined {
  const clock = store.getFact(TEMPORAL_STATE_KEY);
  if (!clock) return { status: "TIME_NOT_ESTABLISHED", reason: "no canonical time is committed" };
  const state = TemporalStateSchema.safeParse(clock.value);
  if (!state.success)
    return { status: "TIME_NOT_ESTABLISHED", reason: "the committed canonical time is not valid" };
  if (!timeEquals(d.canonical_time, state.data.canonical_time))
    return {
      status: "TIME_MISMATCH",
      reason: `the canonical time is ${state.data.canonical_time.value} ${JSON.stringify(state.data.canonical_time.unit)}`,
    };
  return undefined;
}

/**
 * Proves, before anything is written to the operator's campaign, that the genuine GIP owner operations admit this exact opening and
 * register its sunset: a throwaway package receives the campaign's canonical time through the Temporal owner's own ordinary route and
 * then the four records through the genuine owner operations, and is removed. The strict schemas are not the whole of what the owner
 * admission checks, and a refusal after the first records had committed would strand a half-built chain. Nothing here is reused: the
 * scratch package is not the campaign, and it is never given a clock tick or an advance.
 */
async function dryRun(
  campaignId: string,
  d: InitialTimedGovernance,
  buildId: string,
): Promise<Result<null, "INVALID_GOVERNANCE">> {
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "immortalis-initial-timed-governance-dry-run-"));
    const created = await CanonicalCampaign.create(join(scratch, "package"), {
      campaignId,
      buildId,
    });
    if (!created.ok)
      return fail("INVALID_GOVERNANCE", "the opening could not be checked", {
        issues: [created.error.code],
      });
    try {
      const pub = (name: string): Publication => ({
        group_id: `dry-run-${name}`,
        intent_id: `dry-run-intent-${name}`,
        cause: "dry-run-cause",
        basis: d.publication.basis,
        secrecy: d.publication.secrecy,
      });
      const time = await new TemporalCoordinator(
        created.value.store,
        new StageProviderRegistry(),
      ).establishCanonicalTime({ ...pub("time"), time: d.canonical_time });
      if (!time.ok)
        return fail("INVALID_GOVERNANCE", "the canonical time could not be checked", {
          issues: [`time: ${time.error.code}`],
        });
      const gip = new GipAdapter(created.value.store);
      const steps: readonly [string, () => Promise<Result<unknown, string>>][] = [
        [
          "institution",
          () => gip.establishInstitution({ ...pub("institution"), institution: d.institution }),
        ],
        ["office", () => gip.establishOffice({ ...pub("office"), office: d.office })],
        [
          "scope_binding",
          () =>
            gip.establishScopeBinding({ ...pub("scope_binding"), scope_binding: d.scope_binding }),
        ],
        [
          "instrument",
          () => gip.establishSunsetInstrument({ ...pub("instrument"), instrument: d.instrument }),
        ],
      ];
      for (const [name, run] of steps) {
        const admitted = await run();
        if (!admitted.ok)
          return fail("INVALID_GOVERNANCE", "the owner path refuses this opening", {
            issues: [`${name}: ${admitted.error.code}`, ...issuesOf(admitted.error)],
          });
      }
      if (gip.sunsetEnrollment()?.registered !== true)
        return fail("INVALID_GOVERNANCE", "the owner path did not register the sunset", {
          issues: ["registration: not held"],
        });
    } finally {
      await created.value.close().catch(() => undefined);
    }
    return ok(null);
  } catch {
    return fail("INVALID_GOVERNANCE", "the opening could not be checked", {
      issues: ["scratch check failed"],
    });
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EstablishInitialTimedGovernanceParams {
  readonly campaignDir: string;
  /** the campaign identity the existing package must hold */
  readonly campaignId: string;
  readonly governanceFile: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/**
 * Admits one initial timed governance opening.
 *
 *   read the file (trusted, strict) → open the existing package for the local operator → require the confirmed original locality,
 *   unchanged, no bound player character → replay-and-verify when every identity already committed → otherwise (for whatever is still
 *   to be written) require the existing canonical time, prove the owner path admits and registers it, ask ONE confirmation → commit
 *   the institution, the office, the Scope Binding, then the sunset Instrument (GIP's receipt and the Temporal registration) → reopen
 *   the package afresh, owner-verified, and read every record back → report READY only then.
 *
 * Nothing is written before the confirmation, and nothing is ever created: a missing or foreign package is refused. An opening already
 * committed under this identity is verified and reported without asking again; one committed only in part is finished from the same
 * file.
 */
export async function establishInitialTimedGovernance(
  params: EstablishInitialTimedGovernanceParams,
): Promise<InitialTimedGovernanceResult> {
  const read = readInitialTimedGovernanceFile(params.governanceFile);
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
    return await run({ params, session, doc, ...plan, buildId });
  } catch {
    // an unexpected failure is never a success and never a clean refusal
    return result("GOVERNANCE_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

interface RunArgs {
  readonly params: EstablishInitialTimedGovernanceParams;
  readonly session: LocalOperatorSession;
  readonly doc: InitialTimedGovernance;
  readonly id: string;
  readonly stages: Stages;
  readonly registration: Publication;
  readonly buildId: string;
}

/** What this identity has committed so far, judged on the immutable committed groups (never on the facts, which an owner may advance). */
type Committed =
  | {
      readonly kind: "PROGRESS";
      /** leading stages committed, in dependency order */
      readonly done: number;
      /** the Temporal registration of the sunset (only after the Instrument stage) */
      readonly registered: boolean;
    }
  | { readonly kind: "CONFLICT"; readonly reason: string };

const sortedKeys = (xs: readonly string[]): string[] => [...xs].sort();

/**
 * One committed stage group against the confirmed document: created from nothing, with the exact value, the GIP owner and facet, the
 * operator's technical identities, and reads of — and dependencies on — exactly what it was established against (the institution for
 * the office, the office for the Scope Binding, the office and the binding for the Instrument).
 */
function stageProblems(
  group: CommitGroup | null,
  stage: Stage,
  d: InitialTimedGovernance,
  stages: Stages,
): string[] {
  if (group === null) return [`the ${stage.name} identity is not committed`];
  const [institution, office, binding] = stages;
  const value =
    stage.name === "institution"
      ? d.institution
      : stage.name === "office"
        ? d.office
        : stage.name === "scope_binding"
          ? d.scope_binding
          : d.instrument;
  const wantReads =
    stage.name === "institution"
      ? []
      : stage.name === "office"
        ? [`${institution.key}@1`]
        : stage.name === "scope_binding"
          ? [`${office.key}@1`]
          : [`${office.key}@1`, `${binding.key}@1`];
  const wantDepends =
    stage.name === "institution"
      ? []
      : stage.name === "office"
        ? [institution.publication.group_id]
        : stage.name === "scope_binding"
          ? [office.publication.group_id]
          : [office.publication.group_id, binding.publication.group_id];
  const wantWrites =
    stage.name === "instrument"
      ? new Map<string, unknown>([
          [stage.key, value],
          [GIP_SUNSET_ENROLLMENT_KEY, expectedEnrollment(d)],
        ])
      : new Map<string, unknown>([[stage.key, value]]);
  const problem =
    group.group_id !== stage.publication.group_id ||
    group.intent_id !== stage.publication.intent_id ||
    group.cause !== stage.publication.cause ||
    group.owner !== GIP_OWNER ||
    group.facet !== GIP_FACET ||
    group.writes.length !== wantWrites.size ||
    group.writes.some((w) => {
      const want = wantWrites.get(w.key);
      return (
        want === undefined ||
        w.owner !== GIP_OWNER ||
        w.facet !== GIP_FACET ||
        w.expected_version !== 0 ||
        w.basis !== stage.publication.basis ||
        w.secrecy !== stage.publication.secrecy ||
        !canonicalEqual(w.value, want)
      );
    }) ||
    !canonicalEqual(
      sortedKeys(group.reads.map((x) => `${x.key}@${x.version}`)),
      sortedKeys(wantReads),
    ) ||
    !canonicalEqual(sortedKeys(group.depends_on), sortedKeys(wantDepends));
  return problem
    ? [`the ${stage.name} identity is committed with different content than the confirmed one`]
    : [];
}

/**
 * The Temporal owner's registration of the sunset: one group under the identities GIP derives from the Instrument, writing exactly the
 * earned-boundary object and the boundary index, and the object exactly the one derived from the confirmed Instrument and receipt.
 */
function registrationProblems(
  group: CommitGroup | null,
  d: InitialTimedGovernance,
  registration: Publication,
): string[] {
  if (group === null) return ["the sunset registration is not committed"];
  const objectKey = temporalObjectKey(gipSunsetObjectId(d.instrument.instrument_id));
  const expected = gipSunsetTemporalObject(d.instrument, d.canonical_time);
  const object = group.writes.find((w) => w.key === objectKey);
  const index = group.writes.find((w) => w.key === TEMPORAL_BOUNDARY_INDEX_KEY);
  const entries = (index?.value as { entries?: unknown[] } | undefined)?.entries;
  const mine = {
    object_id: gipSunsetObjectId(d.instrument.instrument_id),
    boundary_id: expected?.next_boundary?.boundary_id,
    at: d.instrument.sunset_condition,
  };
  if (
    !expected ||
    !object ||
    !index ||
    group.writes.length !== 2 ||
    group.group_id !== registration.group_id ||
    group.intent_id !== registration.intent_id ||
    group.cause !== registration.cause ||
    group.owner !== TEMPORAL_OWNER ||
    group.writes.some(
      (w) =>
        w.owner !== TEMPORAL_OWNER ||
        w.basis !== registration.basis ||
        w.secrecy !== registration.secrecy,
    ) ||
    object.expected_version !== 0 ||
    !canonicalEqual(object.value, expected) ||
    !Array.isArray(entries) ||
    entries.filter((e) => canonicalEqual(e, mine)).length !== 1
  )
    return ["the sunset registration is committed with different content than the confirmed one"];
  return [];
}

function committedOf(
  campaign: CanonicalCampaign,
  doc: InitialTimedGovernance,
  stages: Stages,
  registration: Publication,
): Committed {
  const store = campaign.store;
  const groups = stages.map((s) => store.committedGroup(s.publication.intent_id));
  const registered = store.committedGroup(registration.intent_id);
  let done = 0;
  while (done < groups.length && groups[done] !== null) done++;
  if (groups.slice(done).some((g) => g !== null))
    return {
      kind: "CONFLICT",
      reason: "a later part of this opening is committed without its earlier prerequisite",
    };
  if (registered !== null && done < stages.length)
    return { kind: "CONFLICT", reason: "the sunset is registered without its Instrument" };
  for (let i = 0; i < done; i++) {
    const stage = stages[i] as Stage;
    const problems = stageProblems(groups[i] ?? null, stage, doc, stages);
    if (problems.length > 0 || !store.getFact(stage.key))
      return {
        kind: "CONFLICT",
        reason:
          problems[0] ?? `this identity's ${stage.name} is committed, but its fact is not held`,
      };
  }
  if (registered !== null) {
    const problems = registrationProblems(registered, doc, registration);
    if (problems.length > 0) return { kind: "CONFLICT", reason: problems[0] as string };
  }
  return { kind: "PROGRESS", done, registered: registered !== null };
}

/** Another GIP fact, or anything already at one of this opening's keys, held in the campaign: never abandoned, never built beside. */
function governanceConflict(
  campaign: CanonicalCampaign,
  stages: Stages,
  d: InitialTimedGovernance,
  committed: Extract<Committed, { kind: "PROGRESS" }>,
): string | undefined {
  const store = campaign.store;
  const own = new Set<string>([...stages.map((s) => s.key), GIP_SUNSET_ENROLLMENT_KEY]);
  for (const f of store.listFacts())
    if (f.owner === GIP_OWNER && !own.has(f.key))
      return `another GIP fact is already held: ${f.key}`;
  for (let i = committed.done; i < stages.length; i++) {
    const stage = stages[i] as Stage;
    if (store.getFact(stage.key) !== undefined)
      return `a ${stage.name} is already held under ${stage.key}`;
  }
  if (committed.done < stages.length && store.getFact(GIP_SUNSET_ENROLLMENT_KEY) !== undefined)
    return "a sunset enrollment is already held";
  if (
    !committed.registered &&
    store.getFact(temporalObjectKey(gipSunsetObjectId(d.instrument.instrument_id))) !== undefined
  )
    return "a Temporal object is already held for this Instrument's sunset";
  return undefined;
}

/** The committed GIP facts are still the first versions this path wrote: once anything advanced them, pre-play is over. */
function advancedProblems(store: CanonicalCampaign["store"], stages: readonly Stage[]): string[] {
  const problems: string[] = [];
  for (const s of stages) {
    const f = store.getFact(s.key);
    if (f && f.version !== 1)
      problems.push(`the ${s.name} has been changed since it was established`);
  }
  return problems;
}

async function run(a: RunArgs): Promise<InitialTimedGovernanceResult> {
  const { params, session, doc, id, stages, registration, buildId } = a;
  const campaign = session.campaign;
  const store = campaign.store;

  const locality = establishedLocality(campaign);
  if (locality.kind === "ABSENT") return result("LOCALITY_NOT_ESTABLISHED", [locality.reason]);
  // an established locality that a later owner write has advanced ends pre-play, whatever else this identity has committed
  if (locality.kind === "MODIFIED") return result("PRE_PLAY_CLOSED", [locality.reason]);

  const committed = committedOf(campaign, doc, stages, registration);
  if (committed.kind === "CONFLICT") return result("GOVERNANCE_CONFLICT", [committed.reason]);
  const complete = committed.done === stages.length && committed.registered;
  if (complete) {
    // the whole opening already committed (a repeat, a lost reply, a restart): verified and reported without asking again
    if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
      return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
    const closed = advancedProblems(store, stages);
    if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
    const problems = factProblems(campaign, doc, stages, registration);
    if (problems.length > 0) return result("GOVERNANCE_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, campaign, stages);
  }

  const violations = campaign.verify();
  if (violations.length > 0)
    return result("GOVERNANCE_VERIFICATION_FAILED", [
      `canonical integrity reports ${violations.length} violation(s)`,
    ]);
  if (store.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return result("PRE_PLAY_CLOSED", ["a player character is already bound to this campaign"]);
  const closed = advancedProblems(store, stages.slice(0, committed.done));
  if (closed.length > 0) return result("PRE_PLAY_CLOSED", closed);
  const conflict = governanceConflict(campaign, stages, doc, committed);
  if (conflict !== undefined) return result("GOVERNANCE_CONFLICT", [conflict]);
  if (committed.done < stages.length) {
    // the opening is established at the existing canonical time until the Instrument and its receipt have pinned it; a resumed
    // registration is judged on the committed receipt alone
    const time = timeProblem(store, doc);
    if (time) return result(time.status, [time.reason]);
  }

  const admissible = await dryRun(params.campaignId, doc, buildId);
  if (!admissible.ok) return result("INVALID_GOVERNANCE", issuesOf(admissible.error));

  // the stages whose group is not yet committed, and the owner calls still to make: an Instrument committed without its registration
  // is finished by presenting its original intent again, which GIP replays by identity before registering the sunset exactly once
  const pending: readonly Stage[] = stages.slice(committed.done);
  const calls: readonly Stage[] =
    pending.length > 0 ? pending : committed.registered ? [] : [stages[3]];
  const pendingLabels = [
    ...pending.map((s) => s.name),
    ...(committed.registered ? [] : ["sunset registration"]),
  ];
  const before = store.listFacts();
  const revisionBefore = store.head().revision;
  const subject = subjectOf({
    verb: "establish-timed-governance",
    campaign_id: params.campaignId,
    locality_id: locality.setup_id,
    governance_id: id,
    pending: pendingLabels,
    document: doc,
  });
  const confirmation = await requestOperatorConfirmation(
    params.terminal,
    "establish-timed-governance",
    subject,
    shown(
      params.campaignId,
      `${session.operator.username} (uid ${session.operator.uid})`,
      id,
      locality.setup_id,
      doc,
      pendingLabels,
    ),
  );
  if (!confirmation || !consumeConfirmation(confirmation, "establish-timed-governance", subject))
    return result("DECLINED");

  const gip = new GipAdapter(store);
  for (const stage of calls) {
    const published =
      stage.name === "institution"
        ? await gip.establishInstitution({ ...stage.publication, institution: doc.institution })
        : stage.name === "office"
          ? await gip.establishOffice({ ...stage.publication, office: doc.office })
          : stage.name === "scope_binding"
            ? await gip.establishScopeBinding({
                ...stage.publication,
                scope_binding: doc.scope_binding,
              })
            : await gip.establishSunsetInstrument({
                ...stage.publication,
                instrument: doc.instrument,
              });
    if (!published.ok) {
      if (UNKNOWN_OUTCOME.has(published.error.code)) {
        session.markAmbiguous();
        return result("GOVERNANCE_OUTCOME_UNKNOWN", [`${stage.name}: ${published.error.code}`]);
      }
      const held = stages.some((s) => store.getFact(s.key) !== undefined);
      return result(
        held ? "GOVERNANCE_INCOMPLETE" : "GOVERNANCE_REFUSED",
        [
          `${stage.name}: ${published.error.code}`,
          ...issuesOf(published.error),
          `not committed: ${
            stages
              .filter((s) => !store.getFact(s.key))
              .map((s) => s.name)
              .join(", ") || "sunset registration"
          }`,
        ],
        published.error.code,
      );
    }
    params.terminal.say(`PROGRESS ${stage.name} COMMITTED ${stage.key}`);
    if (stage.name === "instrument")
      params.terminal.say(
        `PROGRESS sunset registration COMMITTED ${temporalObjectKey(gipSunsetObjectId(doc.instrument.instrument_id))}`,
      );
  }
  await session.close();

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(params.campaignDir, {
    buildId,
    ...(params.campaignFs ? { fs: params.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("GOVERNANCE_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const back = reopened.value;
    if (back.store.head().campaign_id !== params.campaignId)
      return result("GOVERNANCE_VERIFICATION_FAILED", [
        "the reopened campaign has another identity",
      ]);
    const problems = [
      ...factProblems(back, doc, stages, registration),
      ...unchangedProblems(before, back.store.listFacts(), {
        pending,
        registrationPending: !committed.registered,
        objectKey: temporalObjectKey(gipSunsetObjectId(doc.instrument.instrument_id)),
        revisionBefore,
        revisionAfter: back.store.head().revision,
      }),
    ];
    if (problems.length > 0) return result("GOVERNANCE_VERIFICATION_FAILED", problems);
    return ready(params.campaignId, id, doc, back, stages, true);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/**
 * Every record against the confirmed document, read back from the package as any later consumer reads them: typed values through the
 * GIP owner's own reads, owner/facet, keys, versions, the committed provenance of each group, GIP's receipt, and the Temporal
 * registration of the earned sunset boundary.
 */
function factProblems(
  campaign: CanonicalCampaign,
  doc: InitialTimedGovernance,
  stages: Stages,
  registration: Publication,
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
    problems.push(...stageProblems(store.committedGroup(s.publication.intent_id), s, doc, stages));
    if (
      f.key !== s.key ||
      f.owner !== GIP_OWNER ||
      f.facet !== GIP_FACET ||
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
  const gip = new GipAdapter(store);
  const i = gip.institutionIdentity(doc.institution.institution_id);
  if (!i || !canonicalEqual(i.value, doc.institution))
    problems.push("the institution does not read back as the confirmed institution");
  const o = gip.officeAuthorityLocus(doc.office.institution_id, doc.office.office_id);
  if (!o || !canonicalEqual(o.value, doc.office))
    problems.push("the office does not read back as the confirmed office");
  const b = gip.scopeBinding(
    doc.scope_binding.institution_id,
    doc.scope_binding.office_id,
    doc.scope_binding.scope_binding_id,
  );
  if (!b || !canonicalEqual(b.value, doc.scope_binding))
    problems.push("the Scope Binding does not read back as the confirmed binding");
  const n = gip.governanceInstrument(doc.instrument.instrument_id);
  if (!n || !canonicalEqual(n.value, doc.instrument))
    problems.push("the Instrument does not read back as the confirmed Instrument");
  const receipt = store.getFact(GIP_SUNSET_ENROLLMENT_KEY);
  if (
    !receipt ||
    receipt.version !== 1 ||
    receipt.owner !== GIP_OWNER ||
    receipt.provenance.group_id !== stages[3].publication.group_id ||
    !SunsetEnrollmentSchema.safeParse(receipt.value).success ||
    !canonicalEqual(receipt.value, expectedEnrollment(doc))
  )
    problems.push("GIP's enrollment receipt is not the confirmed one");
  const enrollment = gip.sunsetEnrollment();
  if (!enrollment || !enrollment.registered)
    problems.push("the Temporal owner does not hold the Instrument's sunset registration");
  const objectFact = store.getFact(
    temporalObjectKey(gipSunsetObjectId(doc.instrument.instrument_id)),
  );
  const expected = gipSunsetTemporalObject(doc.instrument, doc.canonical_time);
  if (
    !objectFact ||
    objectFact.owner !== TEMPORAL_OWNER ||
    objectFact.version !== 1 ||
    objectFact.provenance.group_id !== registration.group_id ||
    !TemporalObjectSchema.safeParse(objectFact.value).success ||
    !expected ||
    !canonicalEqual(objectFact.value, expected)
  )
    problems.push("the Temporal object is not the confirmed Instrument's earned sunset boundary");
  problems.push(
    ...registrationProblems(store.committedGroup(registration.intent_id), doc, registration),
  );
  return problems;
}

/**
 * Every fact the campaign held before the commit is exactly as it was — except the Temporal boundary index, which gained exactly this
 * Instrument's one entry — and only the expected new keys were added, in exactly the expected number of commits.
 */
function unchangedProblems(
  before: readonly OwnerFact[],
  after: readonly OwnerFact[],
  c: {
    readonly pending: readonly Stage[];
    readonly registrationPending: boolean;
    readonly objectKey: string;
    readonly revisionBefore: number;
    readonly revisionAfter: number;
  },
): string[] {
  const now = new Map(after.map((f) => [f.key, f]));
  const problems: string[] = [];
  const instrumentPending = c.pending.some((s) => s.name === "instrument");
  const indexBefore = before.find((f) => f.key === TEMPORAL_BOUNDARY_INDEX_KEY);
  for (const f of before) {
    const g = now.get(f.key);
    if (f.key === TEMPORAL_BOUNDARY_INDEX_KEY && c.registrationPending) {
      const was = (f.value as { entries?: unknown[] }).entries ?? [];
      const is = (g?.value as { entries?: unknown[] } | undefined)?.entries ?? [];
      if (
        !g ||
        is.length !== was.length + 1 ||
        !was.every((e) => is.some((x) => canonicalEqual(e, x)))
      )
        problems.push("the boundary index lost an earlier entry");
      continue;
    }
    if (!g || !canonicalEqual(f, g)) problems.push(`an earlier fact is not unchanged: ${f.key}`);
  }
  const newKeys = [
    ...c.pending.map((s) => s.key),
    ...(instrumentPending ? [GIP_SUNSET_ENROLLMENT_KEY] : []),
    ...(c.registrationPending ? [c.objectKey] : []),
    ...(c.registrationPending && !indexBefore ? [TEMPORAL_BOUNDARY_INDEX_KEY] : []),
  ];
  const added = after.filter((f) => !before.some((b) => b.key === f.key));
  const groups = c.pending.length + (c.registrationPending ? 1 : 0);
  if (
    after.length !== before.length + newKeys.length ||
    added.length !== newKeys.length ||
    added.some((f) => !newKeys.includes(f.key)) ||
    c.revisionAfter !== c.revisionBefore + groups
  )
    problems.push("the commit wrote more or less than the expected new facts");
  return problems;
}

function ready(
  campaignId: string,
  id: string,
  doc: InitialTimedGovernance,
  campaign: CanonicalCampaign,
  stages: Stages,
  verifiedUnchanged = false,
): InitialTimedGovernanceResult {
  const store = campaign.store;
  const sunset = doc.instrument.sunset_condition!;
  return result("GOVERNANCE_READY", [
    `campaign: ${campaignId}`,
    `governance identity: ${id}`,
    ...stages.flatMap((s) => {
      const f = store.getFact(s.key);
      return f ? [provenanceLine(s.name, f)] : [];
    }),
    `instrument: ${doc.instrument.instrument_id} lifecycle ${doc.instrument.lifecycle_status}, sunset at canonical time ${sunset.value} ${sunset.unit}; established at canonical time ${doc.canonical_time.value} ${doc.canonical_time.unit}`,
    `sunset registration: ${temporalObjectKey(gipSunsetObjectId(doc.instrument.instrument_id))}; the Instrument is NOT expired and stays active until canonical time is separately advanced to its sunset`,
    ...(verifiedUnchanged ? ["the canonical time and every other earlier fact are unchanged"] : []),
  ]);
}
