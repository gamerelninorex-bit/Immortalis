import type { ExistenceContract } from "@immortalis/contracts";
import type { CharacterDraft, Edit } from "@immortalis/operator";
import type { ReviewRequest } from "../../../packages/operator/src/review-evidence.ts";
import type { CharacterReadback } from "./character-evidence.ts";
import type { LocalityReadback } from "./locality-evidence.ts";
import type { GoalCoordinator } from "./goal.ts";
import type { ToolContext } from "./mcp-http.ts";
import type { PlayRead } from "./play-evidence.ts";
import type { OpeningSources, ReviewAuthority } from "./reviews.ts";
import type { StageExpectation } from "./route-confirm.ts";
import type { StageRequest } from "./route-plan.ts";
import type { StageKind } from "./route-stages.ts";
import type { RouteStatus } from "./route-status.ts";
import type { WebTerminal } from "./web-terminal.ts";
export interface ReviewLaunch {
  readonly recover?: boolean;
  readonly originalRun?: string;
  readonly internal?: boolean;
  readonly authority: ReviewAuthority;
  readonly sources?: OpeningSources;
  readonly derived?: (request: ReviewRequest, source?: OpeningSources) => boolean;
}

/** One command the player lane is running (or ran last). The sequence numbers of its transcript restart with every run. */
export interface Run {
  readonly id: string;
  readonly label: string;
  readonly terminal: WebTerminal;
  done: boolean;
  /** the command ended in an exception (or reported an unknown outcome): whether it changed anything is NOT established */
  uncertain: boolean;
  /** set on a run of the player's ORIGINAL character: which of its two separate choices the run is (keep and release, or placement) */
  stage?: "KEEP" | "PLACE";
  /** set on a run of a stage of the collection-preparation route: which stage the run is */
  step?: StageKind;
}

export type Launch =
  | { readonly ok: true; readonly run: Run }
  | { readonly ok: false; readonly status: number; readonly reason: string };

/**
 * What the trusted record and the owners say about the ORIGINAL locality setup, in the allowlisted terms a chat host may relay. `barrier`
 * is what an unresolved setup operation still holds: RECONCILE (the owner-backed reconcile settles it), RESUME (only the same retained
 * document, with a fresh confirmation, can finish it) or ENGINEERING (the operator must inspect it). It carries no path, secret or challenge.
 */
export interface SettingStatus {
  readonly state:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "AWAITING_CONFIRMATION"
    | "ESTABLISHED"
    | "NOT_CONFIRMED"
    | "RESUMABLE"
    | "BLOCKED"
    | "UNAVAILABLE";
  readonly barrier: "NONE" | "RECONCILE" | "RESUME" | "ENGINEERING";
  /** the stages already committed under the confirmed identity, in order (RESUMABLE and INCOMPLETE reads) */
  readonly committed?: readonly string[];
  /** the owner-verified read of the established setting (ESTABLISHED only) */
  readonly readback?: LocalityReadback;
  /** the player's own retained proposal, exactly as it was proposed (only while an operation still holds it) */
  readonly proposal?: unknown;
  /** a neutral reason, never a path, secret or the content of a half-formed record */
  readonly detail?: string;
}

/**
 * Where the player's ORIGINAL character stands, in the allowlisted terms a chat host may relay (BLUE v5.2-A1). `barrier` is what an
 * unresolved character operation still holds: RECONCILE (the owner-backed reconcile settles it), RESUME (only the retained keep, finished
 * without a new question, can complete it) or ENGINEERING (the operator must inspect it). It carries no path, secret, challenge or
 * publication identity. Keeping a character and placing it are separate states: RELEASED_UNBOUND is exactly that.
 */
export interface CharacterStatusReport {
  readonly state:
    | "SETTING_NOT_ESTABLISHED"
    | "NOT_STARTED"
    | "DRAFT_RETAINED"
    | "IN_PROGRESS"
    | "AWAITING_CONFIRMATION"
    | "KEPT_AWAITING_RELEASE"
    | "RELEASED_UNBOUND"
    | "BOUND"
    | "BLOCKED"
    | "UNAVAILABLE";
  readonly barrier: "NONE" | "RECONCILE" | "RESUME" | "ENGINEERING";
  /** which of the two separate choices a run in progress (or awaiting) is */
  readonly stage?: "KEEP" | "PLACE";
  /** the player's own latest words, exactly as offered (an unkept draft, or the candidate under review) */
  readonly draft?: CharacterDraft;
  /** what the draft still lacks before it can be offered (the shipped minimum) */
  readonly missing?: readonly string[];
  readonly revision?: number;
  /** the presence statement the player offered and has not yet confirmed */
  readonly placement?: string;
  /** the owner-verified read of the kept (and placed) character */
  readonly readback?: CharacterReadback;
  /** a neutral reason, never a path, secret or the content of a half-formed record */
  readonly detail?: string;
}

/** What the human's confirmation of a character run must show whole (derived from the retained identity, never from the transcript). */
export type CharacterExpectation =
  | { readonly stage: "KEEP"; readonly contract: ExistenceContract }
  | { readonly stage: "PLACE"; readonly statement: string };

/** A refusal with a reason the assistant may relay, or a run; a draft kept but not offered (still incomplete) is a retained revision. */
export type CharacterLaunch =
  Launch | { readonly ok: true; readonly run: null; readonly retained: CharacterStatusReport };

/**
 * The result of asking for a stage: a run, a refusal with a reason the assistant may relay, or "nothing to do" - the owners already hold the
 * stage, so nobody was asked and no run exists (`done` says what, in words that confirm nothing new).
 */
export type StageLaunch =
  | Launch
  | {
      readonly ok: true;
      readonly run: null;
      readonly done: { readonly step: StageKind; readonly message: string };
    };

/** The player lane's single run slot, shared by the phone page and the ordinary-chat adapter: at most one command at a time. */
export interface PlayerRuns {
  readonly current: () => Run | null;
  /** starts one of the closed player commands with options the CLOSED builder validates; refused while another is running */
  readonly launch: (
    command: string,
    options: Readonly<Record<string, string>>,
    authority?: Pick<ToolContext, "scopes" | "client" | "grant">,
  ) => Promise<Launch>;
  /** true while an earlier action's outcome is uncertain and no reconcile has completed since: only a reconcile may be started */
  readonly unresolved: () => boolean;
  /** why the pending operation is still blocked (null when nothing is blocked or no recovery attempt failed yet) */
  readonly blocker: () => string | null;
  /** true while the unresolved operation is the ORIGINAL locality setup, confirmed and partly committed: only its own resumption finishes it */
  readonly resumable: () => boolean;
  /** true when running a reconcile cannot help (the record is unreadable, the operation unsupported or the record unclearable) */
  readonly structural: () => boolean;
  /** starts the ORIGINAL locality setup for one strictly validated document the caller serialized; the shipped `establish-locality` path and its human confirmation decide everything */
  readonly proposeSetup: (document: string, review?: ReviewLaunch) => Promise<Launch>;
  /** finishes the ONE retained, confirmed, interrupted setup with its own document and a fresh human confirmation (never a replacement) */
  readonly resumeSetup: (review?: ReviewLaunch) => Promise<Launch>;
  /** the owner-backed status of the setting (read-only: it settles nothing and starts nothing) */
  readonly settingStatus: () => Promise<SettingStatus>;
  /** which retained operation a resumable barrier belongs to (null when nothing is resumable) */
  readonly resumeKind: () => "SETTING" | "CHARACTER" | "STAGE" | null;
  /** offers the player's own authored draft for the review, keep and release (the shipped `author-character`, staged); the human's keep is typed at the trusted terminal */
  readonly proposeCharacter: (
    draft: CharacterDraft,
    review?: ReviewLaunch,
  ) => Promise<CharacterLaunch>;
  /** applies the player's typed revision to the retained unkept draft, all or none, and offers the result; a revision invalidates the earlier question and confirmation */
  readonly reviseCharacter: (
    edits: readonly Edit[],
    review?: ReviewLaunch,
  ) => Promise<CharacterLaunch>;
  /** the separate second choice: the player's own native-presence statement, read by the referee and confirmed by the human on its own */
  readonly placeCharacter: (statement: string, review?: ReviewLaunch) => Promise<CharacterLaunch>;
  /** finishes ONLY what the owners and the retained keep show was begun (a release, a review of the retained draft, a retained placement), asking again only what must be confirmed afresh */
  readonly resumeCharacter: (review?: ReviewLaunch) => Promise<CharacterLaunch>;
  /** the owner-backed status of the character (read-only) */
  readonly characterStatus: () => Promise<CharacterStatusReport>;
  /** what the confirmation now pending on the player's run must show whole (null when the run is not a character run) */
  readonly characterExpectation: (run: Run) => CharacterExpectation | null;
  /** one stage of the collection-preparation route (or the resumption of the one retained, partly committed stage); the human's confirmation is typed at the trusted terminal */
  readonly stage: (request: StageRequest, review?: ReviewLaunch) => Promise<StageLaunch>;
  /** the compact, owner-backed, READ-ONLY status of the whole route from one open of the campaign: it settles nothing and starts nothing */
  readonly routeStatus: () => Promise<RouteStatus>;
  /** what the confirmation now pending on the player's run must show whole (null when the run is not a stage run) */
  readonly stageExpectation: (run: Run) => StageExpectation | null;
  /** the goal-level coordinator for the one supported ordinary goal (gather); absent in a host that offers no ordinary play */
  readonly goal?: GoalCoordinator;
  /** the owner-grounded, READ-ONLY account of the player's gathering (recomputed from canon on every call; never cached) */
  readonly play?: () => Promise<PlayRead>;
  /** ends the pending prompt as a decline and stops the run's replies */
  readonly abort: () => void;
  /** answers the pending confirmation (if any) with a non-confirmation, leaving the run to end by its own account */
  readonly decline: () => void;
}
