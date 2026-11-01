import { statesNumberAndUnit } from "./route-stages.ts";
import {
  chronologyIntent,
  clarificationNeed,
  declarationDone,
  preparationIntent,
  type RouteFacts,
  type RouteFactsRead,
  type RouteProbe,
} from "./route-evidence.ts";
import type { InstallState } from "./route-finish.ts";
import { deriveScenario, PLAY_OPERATIONS } from "./route-finish.ts";
import type { RouteRecord } from "./route-record.ts";
import {
  STAGE_COMMAND,
  buildPreparation,
  chronologyDocument,
  chronologyIdentity,
  clarifyIdentity,
  declarationDocument,
  declareIdentity,
  locusIdentity,
  prepareIdentity,
  type ChronologyInput,
  type DeclareInput,
  type PrepareInput,
  type StageIdentity,
  type StageKind,
  type DelegateInput,
  delegateIdentity,
} from "./route-stages.ts";
import type { PhoneConfig } from "./config.ts";

/**
 * Whether a stage may begin, decided from ONE owner-verified read BEFORE the player is asked anything: a stage the owners already hold is
 * reported done (and nobody is asked again), a prerequisite that is missing is named exactly, and nothing a host proposed that the owner
 * would refuse is put to the human. Pure: it reads nothing and writes nothing. A refusal here costs the player no interruption.
 */
export type StageRequest =
  | { readonly kind: "LOCUS" }
  | { readonly kind: "CHRONOLOGY"; readonly input: ChronologyInput }
  | { readonly kind: "CLARIFY"; readonly words: string }
  | { readonly kind: "DELEGATE"; readonly input: DelegateInput }
  | { readonly kind: "PREPARE"; readonly input: PrepareInput }
  | { readonly kind: "DECLARE"; readonly input: DeclareInput }
  | { readonly kind: "FINISH" }
  | { readonly kind: "RESUME" };

/** the facts a plan reads (the commit state of the probed identities is filled in after the candidate names them) */
export type PlanFacts = RouteFactsRead & { readonly landed?: RouteFacts["landed"] };

export interface PlannedRun {
  readonly identity: StageIdentity;
  /** the shipped command this stage runs (the service's own composite for FINISH) */
  readonly command: string;
  /** the document the shipped command reads (CHRONOLOGY, PREPARE, DECLARE) */
  readonly setup: string | null;
  /** the closed options of the shipped command */
  readonly options: Record<string, string>;
  /** the player's own input to retain until the stage is complete */
  readonly retain: Partial<
    Pick<RouteRecord, "chronology" | "handling" | "preparation" | "declaration">
  >;
}

export type Plan =
  | { readonly kind: "REFUSE"; readonly status: number; readonly reason: string }
  | { readonly kind: "DONE"; readonly step: StageKind; readonly message: string }
  | { readonly kind: "RUN"; readonly run: PlannedRun };

const refuse = (reason: string, status = 409): Plan => ({ kind: "REFUSE", status, reason });
const FIRST = "the character tools come first (original_character_status)";

type Candidate =
  { readonly ok: true; readonly run: PlannedRun } | { readonly ok: false; readonly plan: Plan };
const bad = (reason: string, status = 409): Candidate => ({
  ok: false,
  plan: refuse(reason, status),
});

/** the identity a request would dispatch, built from the verified facts alone (also names the commit state to read in the same open) */
export function candidateOf(
  config: PhoneConfig,
  r: PlanFacts,
  req: Exclude<StageRequest, { kind: "RESUME" }>,
): Candidate {
  const pc = r.character.kind === "BOUND" ? r.character.pc_id : null;
  switch (req.kind) {
    case "LOCUS": {
      if (pc === null) return bad(`the character is not kept and placed yet: ${FIRST}`);
      return {
        ok: true,
        run: {
          identity: locusIdentity(pc, r.source.world_id, r.source.locus_id),
          command: STAGE_COMMAND.LOCUS,
          setup: null,
          options: { "player-character": pc },
          retain: {},
        },
      };
    }
    case "CHRONOLOGY": {
      if (!r.original_only)
        return bad(
          "no ORIGINAL setting is established: only its author can state a starting moment",
        );
      const identity = chronologyIdentity(config, req.input);
      if (!identity) return bad("that starting moment cannot be stated as a chronology", 400);
      return {
        ok: true,
        run: {
          identity,
          command: STAGE_COMMAND.CHRONOLOGY,
          setup: chronologyDocument(req.input),
          options: {},
          retain: { chronology: req.input },
        },
      };
    }
    case "CLARIFY": {
      if (pc === null) return bad(`the character is not kept and placed yet: ${FIRST}`);
      return {
        ok: true,
        run: {
          identity: clarifyIdentity(pc, req.words),
          command: STAGE_COMMAND.CLARIFY,
          setup: null,
          options: { "player-character": pc },
          retain: { handling: req.words },
        },
      };
    }
    case "DELEGATE": {
      if (pc === null) return bad(`the character is not kept and placed yet: ${FIRST}`);
      return {
        ok: true,
        run: {
          identity: delegateIdentity(pc, req.input),
          command: STAGE_COMMAND.DELEGATE,
          setup: null,
          options: { "player-character": pc },
          retain: {},
        },
      };
    }
    case "PREPARE": {
      if (pc === null || r.contract === null)
        return bad(`the character is not kept and placed yet: ${FIRST}`);
      if (r.time === null)
        return bad(
          "the starting moment is not established yet: state it first (state_starting_moment)",
        );
      const built = buildPreparation(
        {
          pc_id: pc,
          contract: r.contract,
          clarification: r.clarification,
          canonical_unit: r.time.canonical_time.unit,
          setting: r.source,
          ids: r.ids,
        },
        req.input,
      );
      if (!built.ok) return bad(built.reason, 400);
      const identity = prepareIdentity(config, pc, r.ids, built.document);
      if (!identity) return bad("that preparation is too large to be shown whole", 400);
      return {
        ok: true,
        run: {
          identity,
          command: STAGE_COMMAND.PREPARE,
          setup: built.document,
          options: {},
          retain: { preparation: req.input },
        },
      };
    }
    case "DECLARE": {
      const document = declarationDocument(r.source, req.input);
      const identity = declareIdentity(config, document, r.source.world_id, r.source.locus_id, {
        closure: r.declaration.closure?.version ?? 0,
        scope: r.declaration.scope?.version ?? 0,
      });
      if (!identity) return bad("that declaration cannot be written as one document", 400);
      return {
        ok: true,
        run: {
          identity,
          command: STAGE_COMMAND.DECLARE,
          setup: document,
          options: {},
          retain: { declaration: req.input },
        },
      };
    }
    case "FINISH": {
      if (pc === null) return bad(`the character is not kept and placed yet: ${FIRST}`);
      const derived = deriveScenario(r);
      if (!derived.ok) return bad(derived.reason);
      return {
        ok: true,
        run: {
          identity: {
            kind: "FINISH",
            scenario: derived.scenario,
            attest: !(r.attestation !== null && r.attestation.current),
          },
          command: STAGE_COMMAND.FINISH,
          setup: null,
          options: {},
          retain: {},
        },
      };
    }
  }
}

/** the commit state to read, in the same open, for the stage a request would dispatch */
export function probeFor(
  config: PhoneConfig,
  r: PlanFacts,
  req: Exclude<StageRequest, { kind: "RESUME" }>,
): RouteProbe {
  const c = candidateOf(config, r, req);
  if (!c.ok) return {};
  const id = c.run.identity;
  if (id.kind === "CHRONOLOGY") return { intents: [chronologyIntent(id.setup.publication_digest)] };
  if (id.kind === "PREPARE")
    return {
      intents: (["mechanism", "reserve", "basis"] as const).map((s) =>
        preparationIntent(id.setup.publication_digest, s),
      ),
    };
  return {};
}

const locusDone = (r: PlanFacts) => r.custody !== null && r.custody.problems.length === 0;
const prepared = (r: PlanFacts) =>
  r.preparation.mechanism !== null &&
  r.preparation.reserve !== null &&
  r.preparation.basis !== null;

/** Decides one concrete request against the facts read for it. Unverifiable referee coverage never authorizes dispatch. */
export function planStage(
  config: PhoneConfig,
  r: PlanFacts,
  req: Exclude<StageRequest, { kind: "RESUME" }>,
  coverage: ReadonlySet<string> | null,
  install: InstallState | null,
): Plan {
  const covers = (op: string): boolean => coverage !== null && coverage.has(op);
  if (!r.original_only) return refuse("the route requires an entirely ORIGINAL setting");
  if (coverage === null && req.kind === "FINISH")
    return refuse("the configured referee grants cannot be verified now", 503);
  const landed = (intent: string): boolean => r.landed?.get(intent) === true;
  if (req.kind === "PREPARE") {
    if (r.character.kind !== "BOUND")
      return refuse(`the character is not kept and placed yet: ${FIRST}`);
    // Semantic resolution is not inferred from arbitrary prose. A candidate
    // preparation must quote accepted content; the existing referee later judges
    // actual cycle meaning. Missing/invalid quotations refuse before any consent.
    const need = clarificationNeed(r);
    if (need === "WAITING" || need === "CLOSED")
      return refuse(
        need === "WAITING"
          ? "the starting moment is not established yet: state it first (state_starting_moment)"
          : "a collection commitment of this character already exists, so no cycle can still be clarified",
      );
  }
  const c = candidateOf(config, r, req);
  if (!c.ok) return c.plan;
  const run = c.run;
  const id = run.identity;
  switch (id.kind) {
    case "LOCUS": {
      if (r.custody !== null)
        return r.custody.problems.length === 0
          ? {
              kind: "DONE",
              step: "LOCUS",
              message:
                "the character's physical location is already established and verified; nobody was asked",
            }
          : refuse(
              "a physical custody of the character is held that is not the one this route makes; engineering must inspect it",
            );
      if (!covers("IR_PHYSICAL_PLACEMENT"))
        return refuse(
          coverage === null
            ? "the configured referee grants cannot be verified now"
            : "no AI referee host that this service lists is bound to read where the character physically is; nothing was started. Binding one is an engineering step",
          coverage === null ? 503 : 409,
        );
      return { kind: "RUN", run };
    }
    case "CHRONOLOGY": {
      if (r.time !== null)
        return landed(chronologyIntent(id.setup.publication_digest))
          ? {
              kind: "DONE",
              step: "CHRONOLOGY",
              message: "this starting chronology is already established; nobody was asked",
            }
          : refuse(
              "canonical time already has an origin: it is established once and is never reset or replaced",
            );
      return { kind: "RUN", run };
    }
    case "CLARIFY": {
      const need = clarificationNeed(r);
      if (need === "DONE")
        return r.clarification!.delegated === undefined &&
          r.clarification!.statements.length === 1 &&
          r.clarification!.statements[0] === id.words
          ? {
              kind: "DONE",
              step: "CLARIFY",
              message:
                "those words are already the player's accepted clarification; nobody was asked",
            }
          : refuse(
              "this character's handling-cycle branch is already closed by an accepted clarification; another definition cannot be added",
            );
      if (need === "NOT_NEEDED")
        return refuse(
          "the collection mechanism is already prepared from the character's accepted words: no clarification applies",
        );
      if (need === "CLOSED")
        return refuse(
          "a collection commitment of this character already exists: a clarification is prospective and retrofits no act",
        );
      if (need === "WAITING")
        return refuse(
          "the starting moment is not established yet: state it first (state_starting_moment)",
        );
      if (!statesNumberAndUnit(id.words, r.time!.canonical_time.unit))
        return refuse(
          `the words must state the number in digits and the campaign's unit "${r.time!.canonical_time.unit}", or the collection could never quote them; nothing was started`,
          400,
        );
      if (!covers("I002_CLASSIFY"))
        return refuse(
          coverage === null
            ? "the configured referee grants cannot be verified now"
            : "no AI referee host that this service lists is bound to read the character's own words; nothing was started",
          coverage === null ? 503 : 409,
        );
      return { kind: "RUN", run };
    }
    case "DELEGATE": {
      const need = clarificationNeed(r);
      if (need === "DONE") {
        const d = r.clarification!.delegated;
        return d !== undefined && d.shortest === (id.shortest ?? 1) && d.longest === id.longest
          ? {
              kind: "DONE",
              step: "DELEGATE",
              message:
                "this delegation is already the character's accepted, sealed choice; nobody was asked",
            }
          : refuse(
              "this character's handling-cycle branch is already closed by an accepted record; it is not reselected, redefined or amended",
            );
      }
      if (need === "NOT_NEEDED")
        return refuse(
          "the collection mechanism is already prepared from the character's accepted words: no delegation applies",
        );
      if (need === "CLOSED")
        return refuse(
          "a collection commitment of this character already exists: a delegation first offered after a consequence depends on it is declined and the branch stays unresolved",
        );
      if (need === "WAITING")
        return refuse(
          "the starting moment is not established yet: state it first (state_starting_moment)",
        );
      if (!covers("PC_COLLECTION_DELEGATE"))
        return refuse(
          coverage === null
            ? "the configured referee grants cannot be verified now"
            : "no AI referee host that this service lists is bound to make the delegated selection (role.gm; the operator lists and binds gm-delegate); nothing was started",
          coverage === null ? 503 : 409,
        );
      return { kind: "RUN", run };
    }
    case "PREPARE": {
      const digest = id.setup.publication_digest;
      const held = (["mechanism", "reserve", "basis"] as const).filter((s) =>
        landed(preparationIntent(digest, s)),
      );
      if (held.length === 3)
        return {
          kind: "DONE",
          step: "PREPARE",
          message: "this preparation is already committed; nobody was asked",
        };
      if (
        held.length === 0 &&
        (r.preparation.mechanism || r.preparation.reserve || r.preparation.basis)
      )
        return refuse(
          "a different preparation is already committed for this campaign: it is never replaced here; engineering must inspect it",
        );
      return { kind: "RUN", run };
    }
    case "DECLARE": {
      if (!locusDone(r))
        return refuse(
          "the character's physical location is not established yet: a declaration made before it would be stale at once (establish_character_location)",
        );
      if (!prepared(r))
        return refuse(
          "the collection preparation is not committed yet (propose_collection_preparation)",
        );
      const done = declarationDone(r.declaration, id.document, config.campaignId);
      if (done?.closure && done.scope)
        return {
          kind: "DONE",
          step: "DECLARE",
          message: "this closed setting is already declared and current; nobody was asked",
        };
      return { kind: "RUN", run };
    }
    case "FINISH": {
      const unmet = !locusDone(r)
        ? "establish_character_location"
        : r.time === null
          ? "state_starting_moment"
          : !prepared(r)
            ? "propose_collection_preparation"
            : !(r.declaration.closure?.current === true && r.declaration.scope?.current === true)
              ? "declare_closed_setting"
              : null;
      if (unmet !== null) return refuse(`an earlier stage is not complete: ${unmet} comes first`);
      const pendingAttestation =
        id.attest && install?.kind === "BLOCKED" && install.code === "CAMPAIGN_NOT_RECONCILED";
      if ((install?.kind === "BLOCKED" && !pendingAttestation) || install?.kind === "UNAVAILABLE")
        return refuse(install.detail, install.kind === "UNAVAILABLE" ? 503 : 409);
      if (id.attest && !covers("PC_COLLECTION_CYCLE"))
        return refuse(
          "no AI referee host that this service lists is bound to read the character's cycle wording; nothing was started. Binding one is an engineering step",
        );
      if (config.playerViewHostId === null)
        return refuse(
          "the service has no player-view host configured, so the connection cannot be installed; this is an engineering step",
        );
      if (!PLAY_OPERATIONS.every((op) => covers(op)))
        return refuse(
          "the configured referee operation grants are incomplete for collection and earned observation; the operator must inspect them",
        );
      if (!id.attest && install?.kind === "COMPLETE")
        return {
          kind: "DONE",
          step: "FINISH",
          message:
            "the cycle is attested and the connection is installed; the campaign is prepared to request the supported collection; nobody was asked",
        };
      return { kind: "RUN", run };
    }
  }
}
