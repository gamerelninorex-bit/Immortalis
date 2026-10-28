import type { InstallState } from "./route-finish.ts";
import { PLAY_OPERATIONS } from "./route-finish.ts";
import { clarificationNeed, type RouteFacts, type RouteRead } from "./route-evidence.ts";
import type { RouteRecord, RouteRecordRead } from "./route-record.ts";
import type { StageKind } from "./route-stages.ts";

/**
 * The compact, READ-ONLY status of the whole route for the player's host: which stages are done, which one is next, exactly what is still
 * missing from the HUMAN (and only that), and whether the campaign is prepared to request the supported collection. It is built from ONE
 * owner-verified read, writes nothing, starts nothing and recreates no question or confirmation; a configured scenario or an existing
 * binding never proves a stage complete. Everything here is out-of-character setup information in allowlisted terms: no path, secret,
 * challenge, publication identity or sealed referee material, and no claim that the character knows or perceives anything.
 */

export type StageState =
  | "DONE"
  | "NEXT"
  | "WAITING"
  | "NOT_NEEDED"
  | "INCOMPLETE"
  | "STALE"
  | "BLOCKED"
  | "IN_PROGRESS"
  | "AWAITING_CONFIRMATION"
  | "UNAVAILABLE";

export interface StageLine {
  readonly stage: string;
  readonly state: StageState;
  /** a closed reason (what is waited for, what is missing), never a path or identity */
  readonly detail?: string;
}

export interface NextStep {
  readonly tool: string;
  /** exactly what only the player can supply and has not (empty: nothing is asked of them but their confirmation) */
  readonly ask_the_player: readonly string[];
  /** the player's earlier words for this stage are retained: resume_collection_setup offers them again without asking */
  readonly retained?: true;
  /** the accepted statements of the character a preparation may quote, exactly (PREPARE only) */
  readonly accepted_statements?: readonly { readonly section: string; readonly text: string }[];
  /** the unit the campaign counts time in, once it is established (the cycle's number must be stated in it) */
  readonly canonical_unit?: string;
  /** Conditional existing R-5 path, never a numeric-text verdict or a mandatory extra question. */
  readonly if_handling_duration_unresolved?: {
    readonly tool: "state_handling_duration";
    readonly ask_the_player: readonly string[];
    readonly note: string;
  };
  readonly note: string;
}

export type Barrier = "NONE" | "RECONCILE" | "RESUME" | "ENGINEERING";

export interface RouteStatus {
  readonly state: "OPEN" | "NO_SETTING" | "BLOCKED" | "UNAVAILABLE";
  readonly stages: readonly StageLine[];
  readonly next: NextStep | null;
  readonly readiness: {
    /** everything the existing collection tools need is committed, current, attested and configured: a SEPARATE player request for the supported collection may now be made */
    readonly prepared_to_request_collection: boolean;
    /** setup never starts play, collects, observes or advances time */
    readonly campaign_started: false;
  };
  readonly barrier: Barrier;
  /** closed codes for service-side settings this route needs and does not have (an engineering step, never a player choice) */
  readonly blockers?: readonly string[];
  readonly detail?: string;
}

export interface StatusInput {
  readonly read: RouteRead;
  readonly record: RouteRecordRead;
  readonly playerViewHost: boolean;
  /** the referee operations covered by listed, bound hosts (null = the binding cannot be read now) */
  readonly coverage: ReadonlySet<string> | null;
  /** read only once the earlier stages are done */
  readonly install: InstallState | null;
  /** the stage a run holds right now, and whether it is waiting for the human */
  readonly running: { readonly step: StageKind | null; readonly awaiting: boolean } | null;
  readonly barrier: Barrier;
  readonly barrierDetail?: string;
  /** the stage whose retained identity is the unresolved operation (a barrier of RESUME names it) */
  readonly barrierStage?: StageKind | null;
}

/** true when everything before the finishing stage stands: physical location, starting moment, preparation and a current declaration */
export function earlierStagesDone(r: RouteFacts): boolean {
  return (
    r.custody !== null &&
    r.custody.problems.length === 0 &&
    r.time !== null &&
    r.preparation.mechanism !== null &&
    r.preparation.reserve !== null &&
    r.preparation.basis !== null &&
    r.declaration.closure?.current === true &&
    r.declaration.scope?.current === true
  );
}

const TOOL: Record<string, string> = {
  setting: "propose_original_setting",
  character: "propose_original_character",
  physical_location: "establish_character_location",
  starting_moment: "state_starting_moment",
  handling_duration: "state_handling_duration",
  collection_preparation: "propose_collection_preparation",
  closed_setting: "declare_closed_setting",
  connection: "finish_collection_setup",
};

const REFEREE_FOR: Partial<Record<string, string>> = {
  physical_location: "IR_PHYSICAL_PLACEMENT",
  handling_duration: "I002_CLASSIFY",
  cycle_attestation: "PC_COLLECTION_CYCLE",
};

const empty = (
  state: RouteStatus["state"],
  input: StatusInput,
  detail: string,
  stages: StageLine[],
): RouteStatus => ({
  state,
  stages,
  next: null,
  readiness: { prepared_to_request_collection: false, campaign_started: false },
  barrier: input.barrier,
  detail,
});

export function routeStatus(input: StatusInput): RouteStatus {
  const { read } = input;
  if (read.kind === "NO_SETTING")
    return {
      ...empty("NO_SETTING", input, read.detail, [{ stage: "setting", state: "NEXT" }]),
      next:
        input.barrier === "ENGINEERING"
          ? null
          : input.barrier !== "NONE"
            ? {
                tool: "original_setting_status",
                ask_the_player: [],
                note: "The existing setting operation must be recovered through its own status and retained input before another setting can be proposed.",
              }
            : {
                tool: TOOL["setting"]!,
                ask_the_player: [
                  "the place they want to author (one world, one locality and one exact finite source), in their own words",
                ],
                note: "The authored place comes first. Its exact request proceeds through the owners with complete readback.",
              },
    };
  if (read.kind === "BLOCKED")
    return empty("BLOCKED", { ...input, barrier: "ENGINEERING" }, read.detail, [
      { stage: "setting", state: "BLOCKED" },
    ]);
  if (read.kind === "UNAVAILABLE")
    return empty("UNAVAILABLE", input, read.detail, [{ stage: "setting", state: "UNAVAILABLE" }]);

  const r = read.route;
  if (!r.original_only)
    return empty("BLOCKED", input, "the route requires an entirely ORIGINAL setting", []);
  if (input.coverage === null)
    return {
      ...empty("UNAVAILABLE", input, "the configured referee grants cannot be verified now", []),
      blockers: ["REFEREE_GRANTS_UNAVAILABLE"],
    };
  const rec = input.record.kind === "RECORD" ? input.record.record : null;
  const covered = (op: string | undefined): boolean => op === undefined || input.coverage!.has(op);
  const missing: string[] = [];
  const stages: StageLine[] = [];
  const running = input.running?.step ?? null;
  const live = (step: StageKind, line: StageLine): StageLine =>
    running === step
      ? {
          stage: line.stage,
          state: input.running!.awaiting ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
        }
      : line;
  const needsReferee = (stage: string, line: StageLine): StageLine => {
    if (line.state !== "NEXT" || covered(REFEREE_FOR[stage])) return line;
    missing.push(`REFEREE_GRANT_MISSING:${REFEREE_FOR[stage]}`);
    return { stage, state: "BLOCKED", detail: "no listed referee host is bound for this reading" };
  };

  stages.push({ stage: "setting", state: "DONE" });
  const bound = r.character.kind === "BOUND";
  stages.push({
    stage: "character",
    state: bound ? "DONE" : "NEXT",
    ...(bound
      ? {}
      : {
          detail:
            r.character.kind === "KEPT_UNRELEASED"
              ? "kept, not released"
              : r.character.kind === "RELEASED_UNBOUND"
                ? "kept and released, not placed"
                : "not authored",
        }),
  });

  // physical location
  const locusDone = r.custody !== null && r.custody.problems.length === 0;
  stages.push(
    live(
      "LOCUS",
      !bound
        ? { stage: "physical_location", state: "WAITING", detail: "character" }
        : r.custody !== null && r.custody.problems.length > 0
          ? { stage: "physical_location", state: "BLOCKED", detail: "custody not reconcilable" }
          : locusDone
            ? { stage: "physical_location", state: "DONE" }
            : needsReferee("physical_location", { stage: "physical_location", state: "NEXT" }),
    ),
  );

  // starting moment
  const timeDone = r.time !== null;
  stages.push(
    live(
      "CHRONOLOGY",
      !r.original_only
        ? { stage: "starting_moment", state: "BLOCKED", detail: "not an original setting" }
        : timeDone
          ? { stage: "starting_moment", state: "DONE" }
          : { stage: "starting_moment", state: "NEXT" },
    ),
  );

  // the handling duration (R-5), only where it is genuinely needed
  const need = clarificationNeed(r);
  stages.push(
    live(
      "CLARIFY",
      !bound
        ? { stage: "handling_duration", state: "WAITING", detail: "character" }
        : need === "DONE"
          ? { stage: "handling_duration", state: "DONE" }
          : need === "NOT_NEEDED"
            ? { stage: "handling_duration", state: "NOT_NEEDED" }
            : need === "CLOSED"
              ? {
                  stage: "handling_duration",
                  state: "BLOCKED",
                  detail: "a collection is already committed",
                }
              : need === "WAITING"
                ? { stage: "handling_duration", state: "WAITING", detail: "starting_moment" }
                : needsReferee("handling_duration", {
                    stage: "handling_duration",
                    state: "NEXT",
                  }),
    ),
  );

  // preparation
  const p = r.preparation;
  const heldAll = p.mechanism !== null && p.reserve !== null && p.basis !== null;
  const heldAny = p.mechanism !== null || p.reserve !== null || p.basis !== null;
  stages.push(
    live(
      "PREPARE",
      heldAll
        ? { stage: "collection_preparation", state: "DONE" }
        : heldAny
          ? { stage: "collection_preparation", state: "INCOMPLETE", detail: "partly committed" }
          : !bound
            ? { stage: "collection_preparation", state: "WAITING", detail: "character" }
            : !timeDone
              ? { stage: "collection_preparation", state: "WAITING", detail: "starting_moment" }
              : { stage: "collection_preparation", state: "NEXT" },
    ),
  );

  // the declaration
  const d = r.declaration;
  const declared = d.closure !== null && d.scope !== null && d.closure.current && d.scope.current;
  stages.push(
    live(
      "DECLARE",
      declared
        ? { stage: "closed_setting", state: "DONE" }
        : d.closure !== null || d.scope !== null
          ? d.closure !== null && d.scope !== null
            ? { stage: "closed_setting", state: "STALE", detail: "the owners' facts moved on" }
            : { stage: "closed_setting", state: "INCOMPLETE", detail: "partly committed" }
          : !locusDone
            ? { stage: "closed_setting", state: "WAITING", detail: "physical_location" }
            : !heldAll
              ? { stage: "closed_setting", state: "WAITING", detail: "collection_preparation" }
              : { stage: "closed_setting", state: "NEXT" },
    ),
  );

  // the cycle attestation and the connection are one finishing stage
  const earlier = locusDone && timeDone && heldAll && declared;
  const attested = r.attestation !== null && r.attestation.current;
  const installOk = input.install?.kind === "COMPLETE";
  if (earlier && !covered(REFEREE_FOR["cycle_attestation"]) && !attested)
    missing.push("REFEREE_GRANT_MISSING:PC_COLLECTION_CYCLE");
  const finishLine = (stage: string, done: boolean, blockedBy: string | null): StageLine =>
    live(
      "FINISH",
      done
        ? { stage, state: "DONE" }
        : !earlier
          ? { stage, state: "WAITING", detail: "earlier stages" }
          : blockedBy !== null
            ? { stage, state: "BLOCKED", detail: blockedBy }
            : { stage, state: "NEXT" },
    );
  stages.push(
    finishLine(
      "cycle_attestation",
      attested,
      !attested && !covered(REFEREE_FOR["cycle_attestation"])
        ? "no listed referee host is bound for the cycle reading"
        : null,
    ),
  );
  let installBlock: string | null = null;
  if (earlier) {
    if (!input.playerViewHost) {
      installBlock = "the service has no player-view host configured";
      missing.push("PLAYER_VIEW_HOST_UNSET");
    } else if (input.install?.kind === "BLOCKED") {
      installBlock = "the configured connection is not the one this campaign needs";
      missing.push(input.install.code);
    }
  }
  stages.push(finishLine("connection", installOk, installBlock));

  const playCovered = PLAY_OPERATIONS.every((op) => input.coverage!.has(op));
  if (earlier && installOk && !playCovered)
    missing.push(
      ...PLAY_OPERATIONS.filter((op) => input.coverage !== null && !input.coverage.has(op)).map(
        (op) => `REFEREE_GRANT_MISSING:${op}`,
      ),
    );
  const prepared =
    attested && installOk && earlier && playCovered && input.barrier === "NONE" && running === null;

  // the single next step: the first stage that is not done, with exactly what only the player can still supply
  const next = nextStep(r, stages, rec, input);
  const held: NextStep | null =
    input.barrier === "RESUME"
      ? {
          tool: "resume_collection_setup",
          ask_the_player: [],
          note: "The original requested stage is only partly committed. Resume exactly its retained input with original authorization and owner evidence.",
        }
      : input.barrier === "RECONCILE"
        ? {
            tool: "reconcile_last_action",
            ask_the_player: [],
            note: "An earlier action's outcome is not established: the owners' own records settle it. It asks the player nothing.",
          }
        : null;
  return {
    state: "OPEN",
    stages,
    next: prepared ? null : (held ?? next),
    readiness: { prepared_to_request_collection: prepared, campaign_started: false },
    barrier: input.barrier,
    ...(missing.length > 0 ? { blockers: [...new Set(missing)] } : {}),
    ...(input.barrierDetail ? { detail: input.barrierDetail } : {}),
  };
}

const ACCEPTED_SECTIONS = new Set<string>([
  "identity_agency",
  "embodiment_topology",
  "continuity_rule",
  "contact",
  "baseline_exception.safely_inherited",
  "baseline_exception.player_overrides",
  "entry_envelope",
]);

/** One conditional choice, not a semantic verdict inferred from accepted prose. */
function preparationStep(r: RouteFacts, rec: RouteRecord | null): NextStep {
  return {
    tool: TOOL["collection_preparation"]!,
    ask_the_player: rec?.preparation
      ? []
      : [
          "the condition the (empty) local Reserve will keep material in, in their own word",
          ...(r.source.access_facts.length > 1
            ? ["which of the source's stated access facts the gathering relies on"]
            : []),
        ],
    ...(rec?.preparation ? { retained: true } : {}),
    accepted_statements: r.claims
      .filter((c) => ACCEPTED_SECTIONS.has(c.locator.section))
      .map((c) => ({ section: c.locator.section, text: c.statement })),
    canonical_unit: r.time!.canonical_time.unit,
    ...(clarificationNeed(r) === "OPEN"
      ? {
          if_handling_duration_unresolved: {
            tool: "state_handling_duration" as const,
            ask_the_player: [
              "only the materially unresolved duration of ONE handling cycle of the existing hands, in the player's own words, with the number in digits and the campaign's unit",
            ],
            note: "Use this existing clarification path only if that particular handling-cycle detail is unresolved. An unrelated duration settles nothing. The existing referee judges the branch and scope under that exact authored request; never suggest or choose a rate.",
          },
        }
      : {}),
    note: "If accepted words already state the actual handling cycle, quote them in the preparation without asking for a new duration or R-5 confirmation. Otherwise use if_handling_duration_unresolved first, asking only for that missing detail. A number and time unit in unrelated words prove no cycle. The existing preparation and referee/owner paths determine admissibility and actual cycle meaning; return the complete preparation readback without another approval.",
  };
}

function nextStep(
  r: RouteFacts,
  stages: readonly StageLine[],
  rec: RouteRecord | null,
  input: StatusInput,
): NextStep | null {
  if (input.running !== null && input.running.step !== null) return null;
  if (input.barrier !== "NONE") return null;
  const open = stages.find(
    (s) => s.state === "NEXT" || s.state === "STALE" || s.state === "INCOMPLETE",
  );
  if (!open) return null;
  const retained = (has: boolean): { retained?: true } => (has ? { retained: true } : {});
  switch (open.stage) {
    case "character":
      return {
        tool:
          r.character.kind === "KEPT_UNRELEASED"
            ? "resume_original_character"
            : r.character.kind === "RELEASED_UNBOUND"
              ? "place_original_character"
              : TOOL["character"]!,
        ask_the_player: [],
        note: "Authoring, keeping and placing the character are the existing character tools; see original_character_status.",
      };
    case "physical_location":
      return {
        tool: TOOL["physical_location"]!,
        ask_the_player: [],
        note: "The referee and owner validate stationary physical custody of the exact authored native presence. The request needs no additional approval and supplies no missing facts.",
      };
    case "starting_moment":
      return {
        tool: TOOL["starting_moment"]!,
        ask_the_player: rec?.chronology
          ? []
          : [
              "the moment the campaign begins, in their own words",
              "its exact coordinate, a whole number",
              "the unit of time the campaign counts in",
            ],
        ...retained(rec?.chronology != null),
        note: "The setting author states this once; nothing is defaulted, converted or guessed, and no time passes by stating it.",
      };
    case "handling_duration":
      if (!rec?.handling) return preparationStep(r, rec);
      return {
        tool: TOOL["handling_duration"]!,
        ask_the_player: rec?.handling
          ? []
          : [
              "how long ONE handling cycle of the character's own hands takes, in their own words, with the number in digits and the campaign's unit",
            ],
        ...retained(rec?.handling != null),
        canonical_unit: r.time!.canonical_time.unit,
        note: "Reuse the player's retained words for this open handling-cycle question. The existing referee judges whether the detail is unresolved and whether the words only clarify that detail; the player separately accepts them. No rate is suggested or chosen.",
      };
    case "collection_preparation":
      return preparationStep(r, rec);
    case "closed_setting":
      return {
        tool: TOOL["closed_setting"]!,
        ask_the_player: rec?.declaration
          ? []
          : [
              "the place as a closed domain: its designation and its topology",
              "the closure statement: what else, if anything, acts there",
              "the ground on which no claim on the source is established",
              "the statement of the workforce the place has",
            ],
        ...retained(rec?.declaration != null),
        note:
          open.state === "STALE"
            ? "The owners' facts moved on since this was declared. The declaration is stale; supply current authored grounds. The earlier words are retained and authorize no changed facts."
            : "These are the setting author's own words, not the character's; the owners derive who and what is present themselves.",
      };
    default:
      return {
        tool: TOOL["connection"]!,
        ask_the_player: [],
        note: "No question for the player: the bound referee reads the character's cycle wording and the service installs the connection for exactly this campaign.",
      };
  }
}

export { ACCEPTED_SECTIONS };
