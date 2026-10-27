import { parseArgs } from "node:util";
import type { StageOwnerExtension, FsOps } from "@immortalis/engine";
import {
  advance,
  attestCycle,
  cease,
  settleCollectionLapse,
  collectFinish,
  collect,
  collectContinue,
  nullAdvance,
  nullResume,
  pcTargetAdvance,
  pcTargetResume,
  reconcile,
  relocate,
  status,
  type CommandResult,
  type CommandStatus,
} from "./commands.ts";
import {
  establishAdditionalLocality,
  type AdditionalLocalityStatus,
} from "./additional-locality.ts";
import { establishAdditionalSource, type AdditionalSourceStatus } from "./additional-source.ts";
import { establishCorridor, type CorridorStatus } from "./corridor.ts";
import { establishLocality, localityStatus, type LocalityStatus } from "./locality.ts";
import { OOC_BANNER, OOC_DEBUG_NOTE } from "./ooc.ts";
import { observeSurroundings } from "./observation.ts";
import { establishProductionReserve, type ProductionReserveStatus } from "./production-reserve.ts";
import { establishInitialPopulation, type InitialPopulationStatus } from "./initial-population.ts";
import {
  establishInitialLocalDemand,
  type InitialLocalDemandStatus,
} from "./initial-local-demand.ts";
import {
  establishInitialTimedGovernance,
  type InitialTimedGovernanceStatus,
} from "./initial-timed-governance.ts";
import { establishCharacterLocus } from "./original-pc-locus.ts";
import { authorCharacter, characterStatus, type CharacterStatus } from "./original-pc.ts";
import { clarifyCollectionCycle } from "./collection-clarification.ts";
import { bindHost, refereeDir } from "./referee-exchange.ts";
import { collectionRefereeHosts } from "./collection-referee.ts";
import { prepareCollection } from "./collection-preparation.ts";
import { initializeTime } from "./time-initialization.ts";
import { declareClosedSetting } from "./closed-setting.ts";
import { LocalOperatorSession, defaultOperatorDir } from "./session.ts";
import { stdioTerminal, type OperatorTerminal } from "./terminal.ts";

/**
 * The operator-facing local command line: `relocate`, `advance`, `reconcile`, `status`. Each invocation is one process and one
 * session: verify the local operator, open (and lock) the chosen campaign, run the one command (which asks for its own
 * confirmation on the console), close. Nothing is remembered between invocations except the campaign package and the owner-only
 * retained intents, so every reopen is a fresh, re-verified session.
 *
 * The command set is closed: there is no free-text command, no interpreter, no generic action and no way to name a role,
 * permission, identity, owner, status or "already confirmed" on the command line.
 */

export const USAGE = `${OOC_BANNER}
usage:
  immortalis-operator relocate  --campaign <dir> --campaign-id <id> --world <id> --locus <id> --delivery-unit <unit> --delivery-value <n>
  immortalis-operator advance   --campaign <dir> --campaign-id <id>
  immortalis-operator null-advance --campaign <dir> --campaign-id <id> --target-unit <unit> --target-value <n>
  immortalis-operator null-resume  --campaign <dir> --campaign-id <id>
  immortalis-operator pc-target-advance --campaign <dir> --campaign-id <id> --target-unit <unit> --target-value <n>
  immortalis-operator pc-target-resume  --campaign <dir> --campaign-id <id>
  immortalis-operator reconcile --campaign <dir> --campaign-id <id>
  immortalis-operator establish-locality --campaign <dir> --campaign-id <id> --setup <file>
  immortalis-operator locality-status    --campaign <dir> [--campaign-id <id>]
  immortalis-operator establish-additional-source --campaign <dir> --campaign-id <id> --source-file <file>
  immortalis-operator establish-additional-locality --campaign <dir> --campaign-id <id> --locality-file <file>
  immortalis-operator establish-corridor --campaign <dir> --campaign-id <id> --corridor-file <file>
  immortalis-operator establish-reserve --campaign <dir> --campaign-id <id> --reserve-file <file>
  immortalis-operator establish-population --campaign <dir> --campaign-id <id> --population-file <file>
  immortalis-operator establish-timed-governance --campaign <dir> --campaign-id <id> --governance-file <file>
  immortalis-operator establish-local-demand --campaign <dir> --campaign-id <id> --demand-file <file>
  immortalis-operator author-character   --campaign <dir> --campaign-id <id> --world <id> --locus <id> --player-character <id> [--referee-wait <seconds>]
  immortalis-operator establish-character-locus --campaign <dir> --campaign-id <id> --player-character <id> [--referee-wait <seconds>]
  immortalis-operator observe-surroundings --campaign <dir> --campaign-id <id> --player-character <id> [--source <source-key>] [--referee-wait <seconds>]
  immortalis-operator clarify-collection-cycle --campaign <dir> --campaign-id <id> --player-character <id> [--referee-wait <seconds>]
  immortalis-operator character-status   --campaign <dir> [--campaign-id <id>]
  immortalis-operator referee-bind-host  --campaign <dir> --campaign-id <id> --host-id <id>
  immortalis-operator referee-bind-collection-host --campaign <dir> --campaign-id <id> --host-id <id>
  immortalis-operator attest-cycle --campaign <dir> --campaign-id <id> --mechanism <id> [--referee-wait <seconds>]
  immortalis-operator initialize-time --campaign <dir> --campaign-id <id> --setup <file>
  immortalis-operator declare-closed-setting --campaign <dir> --campaign-id <id> --setup <file>
  immortalis-operator prepare-collection --campaign <dir> --campaign-id <id> --setup <file>
  immortalis-operator collect --campaign <dir> --campaign-id <id> --world <id> --source <id> --reserve <id> --amount <n> --quantity-unit <unit> --mechanism <id> --basis <id>
  immortalis-operator collect-continue --campaign <dir> --campaign-id <id> [--referee-wait <seconds>]
  immortalis-operator collect-finish --campaign <dir> --campaign-id <id>
  immortalis-operator cease --campaign <dir> --campaign-id <id>
  immortalis-operator settle-collection-lapse --campaign <dir> --campaign-id <id>
  immortalis-operator status    --campaign <dir> [--campaign-id <id>]
options (all commands): [--operator-dir <dir>] [--reclaim-stale-lock]

relocate: --world/--locus are the character's chosen destination (confirmation 1 of 2).
  --delivery-unit/--delivery-value are NOT part of that choice: they are the out-of-character SCENARIO DELIVERY BOUNDARY, an
  exact canonical-time value you declare from outside the world to exercise the movement foundation. Both are required; there
  is no default, nothing is calculated, and it is no travel time, ETA, forecast or guarantee of arrival.
advance: a separate, second confirmation to advance time to that declared boundary and no further.
null-advance / null-resume: for a campaign with NO active character only (the active-PC commands above refuse it, and these refuse
  a campaign with one). null-advance is ONE explicit OOC choice to advance canonical time to the exact target given by
  --target-unit/--target-value (an exact canonical-time value, not a duration or a date; both required, no default) and no
  further. null-resume is a separate, later OOC choice with its own confirmation to take up the remainder the world kept of an
  earlier null-advance, toward that earlier target only (it accepts no target). A committed status is a transaction status, not a
  report that the target was attained, that anything occurred, or what anyone perceives or knows; nothing resumes on its own.
pc-target-advance / pc-target-resume: for a campaign WITH an active character that is stationary (the NULL-PC commands refuse it, and
  these refuse a campaign without one). pc-target-advance is ONE explicit OOC choice to advance canonical time to the exact target
  given by --target-unit/--target-value (an exact canonical-time value, not a duration or a date; both required, no default) and no
  further; it is not an action the character takes, and a character in transfer or with a movement in flight is refused.
  pc-target-resume is a separate, later choice with its own confirmation to take up the remainder the world kept of an earlier
  pc-target-advance, toward that earlier target only (it accepts no target). A committed status is a transaction status, not a
  report that the target was attained, that anything occurred, or what the character or anyone perceives or knows; nothing
  resumes on its own.
establish-locality: creates (or faithfully resumes) ONE standard campaign package holding ONE curated ORIGINAL world, ONE locus of it
  and ONE authored EXACT_FINITE source condition at that locus, from a local setup file YOU author (a regular file you own that
  nobody else can write; see docs/original-locality-admission-foundation.md). Nothing is inferred, approximated or defaulted: the file
  states the premise, the locus, the exact quantity and the physical access facts, and the whole of it is shown back for ONE explicit
  typed confirmation before anything is written. The same confirmed setup converges after an interruption (pass --reclaim-stale-lock
  if the package lock was left behind); a different setup is refused for a campaign that already holds one. It is a physical
  setting only: it creates no character, actor or relationship, advances no time, and grants nobody perception, knowledge or
  permission to extract.
establish-additional-source: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed, before any character is
  bound: adds ONE further authored EXACT_FINITE source condition at that same world and locus, from a local file YOU author (exactly the
  source section of the setup file: a regular file you own that nobody else can write; it must state at least one physical access fact; see
  docs/additional-source-admission-foundation.md). The whole source is shown back for ONE explicit typed confirmation before anything is
  written; only that one new fact is written, the world, locus and first source are left exactly as they are, and success is reported only
  after a fresh owner-verified reopen. Repeating it converges (pass --reclaim-stale-lock if the package lock was left behind); a different
  source under the same key, or a different additional source, is refused. It is a physical setting only: no character, no time, and nobody
  perceives, knows or may extract anything because of it. This command never creates or alters a campaign package.
establish-additional-locality: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed, before any character is
  bound: adds ONE further distinct locus of that same world and ONE authored EXACT_FINITE source condition AT THAT NEW LOCUS, from a local
  file YOU author (a regular file you own that nobody else can write: a strict locus section and exactly the source section of the setup
  file; the source must state at least one physical access fact; see docs/additional-locality-admission-foundation.md). The whole proposal
  is shown back for ONE explicit typed confirmation before anything is written; the locus is committed first and the source only after it,
  the world, the first locus, the first source and every other fact are left exactly as they are, and success is reported only after a
  fresh owner-verified reopen. Repeating it converges and finishes a locus committed without its source (pass --reclaim-stale-lock if the
  package lock was left behind); anything else under the same keys, or while another additional locus is incomplete, is refused. It is a
  physical setting only: no route, corridor, distance, travel or time between loci, no character, and nobody perceives, knows or may
  extract anything because of it. This command never creates or alters a campaign package.
establish-corridor: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed, before any character is bound: admits ONE
  physical corridor, the directed topological connection from one already-established locus of that world to another, distinct, already-established locus
  of it, from a local file YOU author (a regular file you own that nobody else can write: the world, the origin locus, the destination locus and a
  statement; see docs/world-corridor-logistics-read-foundation.md). The whole connection is shown back for ONE explicit typed confirmation before anything
  is written; only that one new fact is written (through the existing World-State owner operation), the world, both loci and every other fact are left
  exactly as they are, and success is reported only after a fresh owner-verified reopen. Repeating it converges (pass --reclaim-stale-lock if the package
  lock was left behind); a different corridor for the same ordered pair is refused. It is a topological connection only: no reverse corridor, distance,
  travel time, speed, access right, hazard verdict or route calibration is stated or implied, nothing is requested, moved or delivered, no character exists and no
  time passes. This command never creates or alters a campaign package.
establish-reserve: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed, before any character is bound:
  establishes ONE initially unclaimed Production Reserve at the established world and a locus the confirmed scenario established, from a
  local file YOU author (a regular file you own that nobody else can write: exactly one strict EstablishReserveInput, namely reserve_id,
  material_class, quantity {amount, unit}, condition, world_id and locus_id; see docs/production-reserve-admission-foundation.md). The
  whole Reserve is shown back for ONE explicit typed confirmation before anything is written; it is committed only through the existing
  Production owner operation, every other fact is left exactly as it is, and success is reported only after a fresh owner-verified reopen.
  Repeating it converges (pass --reclaim-stale-lock if the package lock was left behind); a different Reserve under the same identifier is
  refused. It is an initial physical setting only: not a collection, conversion or delivery from any source, and no entitlement, title,
  access right, character, time or consumption. This command never creates or replaces a campaign package; it adds exactly one Reserve fact to an existing one.
establish-population: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed and which already holds a canonical
  time, before any character is bound: establishes ONE disjoint resident Population ledger and ONE Population-owned RESIDENCE Cohort reference
  to it, at the established world and a locus the confirmed scenario established, from a local file YOU author (a regular file you own that
  nobody else can write: a strict ledger section, exactly the Population owner's EstablishLedgerInput, whose point must be the campaign's
  canonical time, and exactly one full strict CohortRef; see docs/initial-population-admission-foundation.md). The whole proposal is shown
  back for ONE explicit typed confirmation before anything is written; the ledger is committed first and the Cohort only after it, through
  the existing Population owner operations, every other fact is left exactly as it is, and success is reported only after a fresh
  owner-verified reopen. Repeating it converges and finishes a ledger committed without its Cohort (pass --reclaim-stale-lock if the package
  lock was left behind); anything else under the same keys, or while another ledger is held, is refused. The Cohort holds no result: its
  members and count come only from Population's own later ordinary close. It is an opening setting only: no actor, mind, social truth,
  labour, perception, collection, movement or time. This command never creates or alters a campaign package.
establish-timed-governance: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed and which already holds a
  canonical time, before any character is bound: establishes ONE continuing Institution Identity, its ONE Office / Authority Locus, that
  office's ONE Scope Binding and ONE initially active Governance Instrument with ONE exact future sunset_condition, from a local file YOU author
  (a regular file you own that nobody else can write: the four strict GIP records exactly as the GIP owner defines them, the explicit publication
  basis and secrecy, and the canonical time, which must be the campaign's canonical time; see docs/initial-timed-governance-admission-foundation.md).
  The whole proposal is shown back for ONE explicit typed confirmation before anything is written; the records are committed in dependency order
  through the existing GIP owner operations, the last together with GIP's enrollment receipt and the Temporal owner's registration of the earned
  sunset boundary, every other fact is left exactly as it is, and success is reported only after a fresh owner-verified reopen reads every record
  and the registration back. Repeating it converges and finishes a partly committed opening (pass --reclaim-stale-lock if the package lock was left
  behind); anything else under the same keys, or while other governance state is held, is refused. It is a stipulated opening premise only: no
  finding of legal validity, no actor, consent or deliberation, and NO time is advanced and nothing is expired: only a separately authorized canonical
  advance can reach the sunset, and then only GIP's own stage changes the lifecycle. This command never creates or alters a campaign package.
establish-local-demand: for a campaign whose ORIGINAL locality establish-locality already confirmed and committed, which already holds a canonical
  time, a Population ledger (and, if the demand is carried by a Cohort, its Cohort) that establish-population committed and a fresh Reserve that
  establish-reserve committed at the same world and locus, before any character is bound: establishes ONE material demand attributable to ONE
  Population Unit or Cohort, and, as a SEPARATE act you also author, ONE Production start against that Reserve with an explicit input/output
  transformation and an exact future completion boundary, from a local file YOU author (a regular file you own that nobody else can write: a strict
  demand section, exactly the Economy owner's IssueDemandInput, and a strict production section, exactly the Production owner's StartOperationInput,
  naming the request that demand allocates to; see docs/initial-local-demand-admission-foundation.md). Both acts are shown back, labelled apart, for ONE
  explicit typed confirmation before anything is written; the demand and its one Production Request are committed first and the Production start only
  after them, through the existing Economy and Production owner operations, every other fact is left exactly as it is except the Reserve's open-claim
  entry, and success is reported only after a fresh owner-verified reopen. Repeating it converges and finishes a demand committed without its start
  (pass --reclaim-stale-lock if the package lock was left behind); anything else under the same keys, or while another process is held, is refused, and an
  earlier demand is never rolled back. NO time is advanced, no Temporal object is registered, no output exists and the demand is NOT satisfied: only a
  separately authorized canonical advance to the declared boundary, through the existing owner stages, can consume the Reserve and record realized
  access. It is a stipulated opening premise only: no need formation, valuation, exchange, actor, decision, labour, rate or yield. This command never
  creates, adopts, repairs or clears a campaign package; it does commit the two separately confirmed owner acts (the demand with its request,
  then the Production operation with its claim and the Reserve's open claim) as canonical facts into the existing fresh pre-play package.
locality-status: reports what a campaign holds of an operator-confirmed locality and says READY only when all three facts are
  committed and the campaign verifies; a partially constructed campaign is INCOMPLETE.
author-character: for a campaign whose --world and --locus are ALREADY established (this command never creates, defaults or infers
  either). YOU author an ordinary continuing character in your own words on the console, review the complete Character Mirror, revise
  it as often as you like (every change shows the whole Mirror again) and keep the last display by typing its fresh keep phrase;
  only then is the character released (I-002). Placement is a SEPARATE, second choice: you state in your own words that the character
  is originally present at that locus (native, already there - no arrival, portal or transfer) and confirm it with its own fresh
  phrase; only then is the character bound as the operative player character (Role Registry). --player-character is the character's technical
  identity. A character released but not bound is reported as exactly that, and running the command again resumes at placement
  without repeating anything. Neither step gives the character a physical position or custody, perception, knowledge, action or time.
establish-character-locus: for a character that author-character released AND bound (verified). The binding records that the character
  is originally present at a locus and gives it NO physical position. This is a third, separate choice: the AI referee host is asked ONE
  further question about the words already committed (the character's own statements and your confirmed native-presence statement,
  against the committed world and locus): do they describe ONE material physical body originally present at exactly that locus? An
  incorporeal, coextensive, distributed or bodiless character, an arrival, another place, or a presence resting on another actor's
  cooperation is refused with nothing written. Only a derived PHYSICAL_ELIGIBLE reading can be confirmed, with its own fresh phrase;
  then World-State commits ONE create-only stationary physical-locus fact for the character, citing both qualifying referee decisions.
  The world, the locus and the statement are never typed here: they are the binding's. It gives no perception, knowledge, action,
  movement or time, and the post-handover movement and advance commands still do not take it. Running it again converges.
observe-surroundings: for a character that author-character released and bound AND establish-character-locus placed physically (verified),
  at a campaign whose canonical time is established. This is a fourth, separate choice of yours: that your character LOOKS at its
  surroundings now, at the current canonical basis. The AI referee host is asked ONE bounded question built only from committed facts
  (the character's own statements, your confirmed placement statement, the world and the locus): is the character's sight established,
  are its own exact viewing circumstances established, is the path from the physical feature to it open or blocked - and, only if all
  three are affirmatively answered, what minimal raw appearance follows. The engine validates the answer against the delivered text and
  derives the verdict. Only an established reading earns a receipt: the Epistemic owner then forms the character's sealed Accessible
  Content Packet and you are shown the raw appearance it received. You are NEVER shown the setting, the host's reasoning or why nothing
  was received: every non-receipt is the same message. It advances no time (canonical time stays exactly where it was) and gives the
  character no recognition, comprehension, belief, memory or action. One observation per character per canonical instant; running it
  again at the same basis reaches the same records. A new observation is a new basis and a new choice.
  --source names ONE already committed World-State Source Condition at the character's own locus as the candidate to look at: it is your
  choice of what to investigate, never what the character sees. The host is given only that source's owner-authored access facts (no
  quantity, material, key or establishment statement), and the character can receive only a raw appearance of it. A source that is
  absent, elsewhere, exhausted or undescribed is refused with nothing written. An observation of another scope at the same basis is
  never replaced: a different look needs a new basis.
clarify-collection-cycle: for a character that author-character released and bound (verified), at a campaign whose canonical time is
  established and BEFORE any collection commitment of that character. When the character's accepted content says it can lift and carry but
  states no duration for ONE handling cycle, you may say it in your OWN words (the number in digits and the unit of time); nothing is
  suggested, defaulted or chosen for you, and the choice cannot be delegated to a host. The AI referee host (the same I-002 classification
  your character's Mirror used) is asked whether exactly those words are your own character-local claim; only if it accepts them, and only
  after your separate fresh confirmation, they become a new accepted claim of your character from the current canonical time. The sealed
  release, your keep, the binding, the custody and the clock are untouched; no time passes and no material is created. The exact cycle
  still needs a collection preparation that quotes those words and a separate semantic attestation. Running it again with the same words
  converges.
referee-bind-host: the TRUSTED operator action that binds one concrete AI host identity to the campaign's four referee operations (I-002
  character classification; native/compatibility; physical placement; direct perception) and writes that host's owner-only secret file. It confers nothing by itself: the
  host's tool server (immortalis-referee, a stdio MCP server; point your AI client at it with --operator-dir, --campaign-id,
  --host-id and --secret-file) lets the host read ONE bounded question and submit ONE answer, and the engine validates the answer
  and derives the verdict. No model API, credential or network is used by the engine. author-character waits --referee-wait
  seconds (default 600) for each answer and then stops with nothing changed; running it again finds the same question.
character-status: reports from canon alone whether a character of this command is held, released but unbound, or bound (verified).
referee-bind-collection-host: binds a NEW host identity only to the existing v0.3 cycle and reach/scene questions. An existing four-operation
  setup host is not silently upgraded. The same immortalis-referee MCP server, or immortalis-referee-console for a human GM, reads and
  answers the questions. No model API is required. Binding a host is not player confirmation or substantive owner authority.
attest-cycle: asks the bound referee to interpret an ALREADY accepted PC claim and established mechanism; it never authors a rate or
  a character. A negative or missing answer creates no attestation. collect records one separately confirmed willingness to attempt;
  collect-continue asks for grounded reach/scene interpretation and invokes owner admission without inventing missing evidence. Source
  rights, complete scene/workforce evidence and safe in-flight time remain acceptance prerequisites. These commands do not establish
  those premises, complete the action, expose a hidden boundary or certify a playable loop. cease is the separately confirmed v0.3 D-1
  request to stop the SAME enrolled act, not automatic cancellation or a cure for lost standing. settle-collection-lapse (R-4, NEWLY
  AUTHORIZED) takes no input and asks nothing: it presents the mechanical, nonproductive lapse of an act held at its own earned boundary with its
  eligibility no longer supported, only when canon derives it, and never resumes time (a later, separately confirmed pc-target-resume does).
${OOC_DEBUG_NOTE}`;

import type { OrdinaryAction } from "./ordinary-action.ts";

export interface CliEnvironment {
  /** In-process capability, never parsed from argv. */
  readonly ordinaryAction?: OrdinaryAction;
  readonly terminal?: OperatorTerminal;
  /** owner registrations the saved campaign was written with (an embedding supplies them; the shipped binary has none) */
  readonly extension?: StageOwnerExtension;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly out?: (line: string) => void;
}

export const EXIT = {
  OK: 0,
  DECLINED: 2,
  UNAVAILABLE: 3,
  UNKNOWN: 4,
  USAGE: 64,
} as const;

const exitOf = (
  s:
    | CommandStatus
    | LocalityStatus
    | AdditionalSourceStatus
    | AdditionalLocalityStatus
    | CorridorStatus
    | ProductionReserveStatus
    | InitialPopulationStatus
    | InitialTimedGovernanceStatus
    | InitialLocalDemandStatus
    | CharacterStatus
    | "REFEREE_HOST_BOUND",
): number => {
  switch (s) {
    case "REFEREE_HOST_BOUND":
      return EXIT.OK;
    case "CHARACTER_BOUND":
    case "CHARACTER_NONE":
    case "LOCUS_ESTABLISHED":
    case "OBSERVATION_RECEIVED":
    case "CLARIFICATION_ACCEPTED":
      return EXIT.OK;
    case "CHARACTER_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "LOCALITY_READY":
    case "ADDITIONAL_SOURCE_READY":
    case "ADDITIONAL_LOCALITY_READY":
    case "CORRIDOR_READY":
      return EXIT.OK;
    case "CORRIDOR_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "RESERVE_READY":
      return EXIT.OK;
    case "RESERVE_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "POPULATION_READY":
      return EXIT.OK;
    case "POPULATION_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "LOCAL_DEMAND_READY":
      return EXIT.OK;
    case "LOCAL_DEMAND_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "GOVERNANCE_READY":
      return EXIT.OK;
    case "GOVERNANCE_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "ADDITIONAL_SOURCE_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "LOCALITY_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "RELOCATION_COMMITTED":
    case "ADVANCE_COMMITTED":
    case "NULL_PC_ADVANCE_COMMITTED":
    case "NULL_PC_HELD_ADVANCE_COMMITTED":
    case "PC_TARGET_ADVANCE_COMMITTED":
    case "COLLECTION_COMMITTED":
    case "TIME_ESTABLISHED":
    case "SETTING_DECLARED":
    case "NOTHING_TO_RECONCILE":
      return EXIT.OK;
    case "DECLINED":
      return EXIT.DECLINED;
    case "RELOCATION_OUTCOME_UNKNOWN":
    case "ADVANCE_OUTCOME_UNKNOWN":
    case "NULL_PC_ADVANCE_OUTCOME_UNKNOWN":
    case "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN":
    case "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN":
    case "COLLECTION_OUTCOME_UNKNOWN":
    case "RECONCILIATION_REQUIRED":
      return EXIT.UNKNOWN;
    default:
      return EXIT.UNAVAILABLE;
  }
};

const OPTIONS = {
  campaign: { type: "string" },
  "campaign-id": { type: "string" },
  "operator-dir": { type: "string" },
  "reclaim-stale-lock": { type: "boolean" },
  world: { type: "string" },
  locus: { type: "string" },
  "delivery-unit": { type: "string" },
  "delivery-value": { type: "string" },
  "target-unit": { type: "string" },
  "target-value": { type: "string" },
  setup: { type: "string" },
  "source-file": { type: "string" },
  "locality-file": { type: "string" },
  "corridor-file": { type: "string" },
  "reserve-file": { type: "string" },
  "population-file": { type: "string" },
  "governance-file": { type: "string" },
  "demand-file": { type: "string" },
  "player-character": { type: "string" },
  "host-id": { type: "string" },
  "referee-wait": { type: "string" },
  source: { type: "string" },
  reserve: { type: "string" },
  amount: { type: "string" },
  "quantity-unit": { type: "string" },
  mechanism: { type: "string" },
  basis: { type: "string" },
} as const;

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  relocate: ["world", "locus", "delivery-unit", "delivery-value"],
  advance: [],
  "null-advance": ["target-unit", "target-value"],
  "null-resume": [],
  "pc-target-advance": ["target-unit", "target-value"],
  "pc-target-resume": [],
  reconcile: [],
  status: [],
  "establish-locality": ["setup"],
  "locality-status": [],
  "establish-additional-source": ["source-file"],
  "establish-additional-locality": ["locality-file"],
  "establish-corridor": ["corridor-file"],
  "establish-reserve": ["reserve-file"],
  "establish-population": ["population-file"],
  "establish-timed-governance": ["governance-file"],
  "establish-local-demand": ["demand-file"],
  "author-character": ["world", "locus", "player-character"],
  "establish-character-locus": ["player-character"],
  "observe-surroundings": ["player-character"],
  "clarify-collection-cycle": ["player-character"],
  "character-status": [],
  "referee-bind-host": ["host-id"],
  "referee-bind-collection-host": ["host-id"],
  "attest-cycle": ["mechanism"],
  "initialize-time": ["setup"],
  "declare-closed-setting": ["setup"],
  "prepare-collection": ["setup"],
  collect: ["world", "source", "reserve", "amount", "quantity-unit", "mechanism", "basis"],
  "collect-continue": [],
  "collect-finish": [],
  cease: [],
  "settle-collection-lapse": [],
};

/** Options a command accepts but does not require. */
const OPTIONAL_OPTIONS: Record<string, readonly string[]> = {
  "author-character": ["referee-wait"],
  "establish-character-locus": ["referee-wait"],
  "observe-surroundings": ["referee-wait", "source"],
  "clarify-collection-cycle": ["referee-wait"],
  "attest-cycle": ["referee-wait"],
  "collect-continue": ["referee-wait"],
};

type Parsed =
  | {
      readonly ok: true;
      readonly command: string;
      readonly values: Readonly<Record<string, string | boolean | undefined>>;
    }
  | { readonly ok: false };

function parse(argv: readonly string[]): Parsed {
  try {
    const parsedArgs = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    const values: Readonly<Record<string, string | boolean | undefined>> = parsedArgs.values;
    const { positionals } = parsedArgs;
    const [command, ...rest] = positionals;
    if (command === undefined || rest.length > 0 || !(command in COMMAND_OPTIONS))
      return { ok: false };
    // a flag given twice is ambiguous input, not "the last one wins"
    const flags = argv.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]);
    if (new Set(flags).size !== flags.length) return { ok: false };
    const allowed = new Set([
      "campaign",
      "campaign-id",
      "operator-dir",
      "reclaim-stale-lock",
      ...(COMMAND_OPTIONS[command] ?? []),
      ...(OPTIONAL_OPTIONS[command] ?? []),
    ]);
    for (const [name, value] of Object.entries(values))
      if (value !== undefined && !allowed.has(name)) return { ok: false };
    for (const need of ["campaign", ...(COMMAND_OPTIONS[command] ?? [])])
      if (typeof values[need] !== "string" || values[need] === "") return { ok: false };
    if (
      command !== "status" &&
      command !== "locality-status" &&
      command !== "character-status" &&
      (typeof values["campaign-id"] !== "string" || values["campaign-id"] === "")
    )
      return { ok: false };
    return { ok: true, command, values };
  } catch {
    return { ok: false };
  }
}

const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;

export async function runCli(argv: readonly string[], env: CliEnvironment = {}): Promise<number> {
  const out = env.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const parsed = parse(argv);
  if (!parsed.ok) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const { command, values } = parsed;
  out(OOC_BANNER);
  const str = (name: string): string | undefined =>
    typeof values[name] === "string" ? values[name] : undefined;

  let relocateInput: unknown;
  if (command === "relocate") {
    const value = str("delivery-value") ?? "";
    if (!NON_NEGATIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
      out(USAGE);
      return EXIT.USAGE;
    }
    relocateInput = {
      destination: { world_id: str("world"), locus_id: str("locus") },
      delivery_at: { unit: str("delivery-unit"), value: Number(value) },
    };
  }

  let nullAdvanceInput: unknown;
  if (command === "null-advance" || command === "pc-target-advance") {
    const value = str("target-value") ?? "";
    if (!NON_NEGATIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
      out(USAGE);
      return EXIT.USAGE;
    }
    nullAdvanceInput = { target: { unit: str("target-unit"), value: Number(value) } };
  }

  let waitPolls: number | undefined;
  let collectInput: unknown;
  if (command === "collect") {
    const amount = str("amount") ?? "";
    if (!/^[1-9][0-9]*$/.test(amount) || !Number.isSafeInteger(Number(amount))) {
      out(USAGE);
      return EXIT.USAGE;
    }
    collectInput = {
      source: { world_id: str("world"), source_key: str("source") },
      reserve_id: str("reserve"),
      quantity: { amount: Number(amount), unit: str("quantity-unit") },
      mechanism_id: str("mechanism"),
      basis_id: str("basis"),
    };
  }
  if (str("referee-wait") !== undefined) {
    const w = str("referee-wait")!;
    if (!/^[1-9][0-9]{0,5}$/.test(w)) {
      out(USAGE);
      return EXIT.USAGE;
    }
    waitPolls = Number(w) * 2;
  }
  const terminal =
    env.terminal ??
    (command === "status" ||
    command === "locality-status" ||
    command === "character-status" ||
    command === "referee-bind-host" ||
    command === "referee-bind-collection-host"
      ? undefined
      : stdioTerminal());
  try {
    if (command === "establish-locality") {
      const r = await establishLocality({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        setupFile: str("setup") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-additional-source") {
      const r = await establishAdditionalSource({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        sourceFile: str("source-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-additional-locality") {
      const r = await establishAdditionalLocality({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        localityFile: str("locality-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-corridor") {
      const r = await establishCorridor({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        corridorFile: str("corridor-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-reserve") {
      const r = await establishProductionReserve({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        reserveFile: str("reserve-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-population") {
      const r = await establishInitialPopulation({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        populationFile: str("population-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-timed-governance") {
      const r = await establishInitialTimedGovernance({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        governanceFile: str("governance-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-local-demand") {
      const r = await establishInitialLocalDemand({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        demandFile: str("demand-file") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "establish-character-locus") {
      const r = await establishCharacterLocus({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        pcId: str("player-character") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
        ...(waitPolls !== undefined ? { refereePolls: waitPolls } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "observe-surroundings") {
      const r = await observeSurroundings({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        pcId: str("player-character") ?? "",
        ...(str("source") !== undefined ? { sourceKey: str("source")! } : {}),
        terminal: terminal!,
        ...(env.ordinaryAction ? { ordinaryAction: env.ordinaryAction } : {}),
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
        ...(waitPolls !== undefined ? { refereePolls: waitPolls } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "clarify-collection-cycle") {
      const r = await clarifyCollectionCycle({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        pcId: str("player-character") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
        ...(waitPolls !== undefined ? { refereePolls: waitPolls } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "author-character") {
      const r = await authorCharacter({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        worldId: str("world") ?? "",
        locusId: str("locus") ?? "",
        pcId: str("player-character") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
        ...(waitPolls !== undefined ? { refereePolls: waitPolls } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    const opened = await LocalOperatorSession.open({
      campaignDir: str("campaign") ?? "",
      ...(str("campaign-id") !== undefined ? { expectedCampaignId: str("campaign-id")! } : {}),
      ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
      ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
      ...(env.extension ? { extension: env.extension } : {}),
      ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
      ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
    });
    if (!opened.ok) {
      const code = (opened.error.details as { code?: string } | undefined)?.code;
      out(`STATUS SESSION_UNAVAILABLE ${opened.error.code}${code ? ` ${code}` : ""}`);
      out(opened.error.message);
      return EXIT.UNAVAILABLE;
    }
    const session = opened.value;
    try {
      if (command === "locality-status") {
        const r = localityStatus(session);
        out(`STATUS ${r.status}`);
        out(r.message);
        for (const line of r.details) out(line);
        return exitOf(r.status);
      }
      if (command === "referee-bind-host" || command === "referee-bind-collection-host") {
        const collection = command === "referee-bind-collection-host";
        const bound = await bindHost({
          stateDir: str("operator-dir") ?? defaultOperatorDir(str("campaign") ?? ""),
          campaignId: session.campaignId,
          operatorUid: session.operator.uid,
          hostId: str("host-id") ?? "",
          operations: collection
            ? ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"]
            : [
                "I002_CLASSIFY",
                "IR_NATIVE_COMPATIBILITY",
                "IR_PHYSICAL_PLACEMENT",
                "F014D_DIRECT_PERCEPTION",
              ],
          ...(env.ledgerFs ? { fs: env.ledgerFs } : {}),
        });
        if (!bound.ok) {
          out(`STATUS REFEREE_HOST_NOT_BOUND ${bound.error.code}`);
          out(bound.error.message);
          return EXIT.UNAVAILABLE;
        }
        out("STATUS REFEREE_HOST_BOUND");
        out(
          collection
            ? `host ${str("host-id")} is bound only to the cycle and reach/scene interpretations; it grants no owner evidence or player choice.`
            : `host ${str("host-id")} is bound to this campaign for the four referee operations (I-002 classification; native/compatibility; physical placement; direct perception).`,
        );
        out(
          `secret file (owner-only; give the PATH to the host's tool server, never the contents): ${bound.value.secret_file}`,
        );
        out(
          `tool server: immortalis-referee --operator-dir ${str("operator-dir") ?? defaultOperatorDir(str("campaign") ?? "")} --campaign-id ${session.campaignId} --host-id ${str("host-id")} --secret-file ${bound.value.secret_file}`,
        );
        out(
          `exchange directory: ${refereeDir({ stateDir: str("operator-dir") ?? defaultOperatorDir(str("campaign") ?? ""), campaignId: session.campaignId })}`,
        );
        return EXIT.OK;
      }
      if (command === "character-status") {
        const r = await characterStatus(
          session,
          str("operator-dir") ?? defaultOperatorDir(str("campaign") ?? ""),
          env.ledgerFs,
        );
        out(`STATUS ${r.status}`);
        out(r.message);
        for (const line of r.details) out(line);
        return exitOf(r.status);
      }
      if (command === "status") {
        const report = status(session);
        const retained =
          report.relocation !== "NONE" ||
          report.advances.length > 0 ||
          report.ooc_choices.length > 0 ||
          report.pc_target_choices.length > 0;
        out(`STATUS ${retained ? "CHOICES_RETAINED" : "NO_CHOICE_RETAINED"}`);
        out(`campaign: ${report.campaign_id}`);
        out(`operator: ${report.operator}`);
        out(`relocation choice: ${report.relocation}`);
        out(
          `progression choices: ${report.advances.length === 0 ? "none" : report.advances.join(", ")}`,
        );
        out(
          `ooc choices: ${report.ooc_choices.length === 0 ? "none" : report.ooc_choices.map((c) => `${c.kind} ${c.status}`).join(", ")}`,
        );
        out(
          `character target choices: ${report.pc_target_choices.length === 0 ? "none" : report.pc_target_choices.map((c) => `${c.kind} ${c.status}`).join(", ")}`,
        );
        return EXIT.OK;
      }
      const ctx = {
        session,
        terminal: terminal!,
        ...collectionRefereeHosts({
          stateDir: str("operator-dir") ?? defaultOperatorDir(str("campaign") ?? ""),
          campaignId: session.campaignId,
          operatorUid: session.operator.uid,
          polls: waitPolls ?? 1200,
          pollMs: 500,
          ...(env.ledgerFs ? { fs: env.ledgerFs } : {}),
        }),
      };
      const results: readonly CommandResult[] =
        command === "initialize-time"
          ? [await initializeTime(ctx, str("setup")!)]
          : command === "declare-closed-setting"
            ? [await declareClosedSetting(ctx, str("setup")!)]
            : command === "prepare-collection"
              ? [await prepareCollection(ctx, str("setup")!)]
              : command === "collect"
                ? [await collect(ctx, collectInput)]
                : command === "collect-continue"
                  ? [await collectContinue(ctx)]
                  : command === "collect-finish"
                    ? [await collectFinish(ctx)]
                    : command === "attest-cycle"
                      ? [await attestCycle(ctx, { mechanism_id: str("mechanism") })]
                      : command === "cease"
                        ? [await cease(ctx)]
                        : command === "settle-collection-lapse"
                          ? [await settleCollectionLapse(ctx)]
                          : command === "relocate"
                            ? [await relocate(ctx, relocateInput)]
                            : command === "advance"
                              ? [await advance(ctx)]
                              : command === "null-advance"
                                ? [await nullAdvance(ctx, nullAdvanceInput)]
                                : command === "null-resume"
                                  ? [await nullResume(ctx)]
                                  : command === "pc-target-advance"
                                    ? [await pcTargetAdvance(ctx, nullAdvanceInput)]
                                    : command === "pc-target-resume"
                                      ? [await pcTargetResume(ctx)]
                                      : await reconcile(ctx);
      for (const r of results) {
        out(`STATUS ${r.status}`);
        out(r.message);
      }
      return results.reduce<number>((code, r) => Math.max(code, exitOf(r.status)), EXIT.OK);
    } finally {
      await session.close();
    }
  } finally {
    if (!env.terminal) terminal?.close();
  }
}
