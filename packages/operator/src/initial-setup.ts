import {
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  InitialSetupInvocationSchema,
  InitialSetupResponseSchema,
  INITIAL_LOCALITY_PARSER_V1,
  ScopeDecisionRecordSchema,
  refereeDecisionKey,
  type AuthoredEvidence,
  type ChronologyCapture,
  type InitialSetupDisposition,
  type InitialSetupInput,
  type InitialSetupResponse,
  type OwnerFact,
  type Pin,
  type SetupPhase,
} from "@immortalis/contracts";
import {
  InitialSetupPublisher,
  PRODUCTION_INITIAL_SETUP_POLICY,
  buildProducerInput,
  completionViolation,
  derivedScopeVerdict,
  genesisProjection,
  interpretResponse,
  scanInitialSetup,
  scopeDecisionRecord,
  scopeFingerprintOf,
  setupIdOf,
  setupMessageHash,
  sha256Bytes,
  sha256Canonical,
  type CampaignStore,
  type InitialSetupPolicy,
  type SetupIndex,
  type SetupSession,
} from "@immortalis/engine";
import type { EvidenceVerifier } from "./chronology-capture.ts";
import { verifyCaptureForIntake } from "./chronology-capture.ts";
import type { PrivateRunner } from "./initial-runner.ts";

/**
 * The trusted workflow service that carries ONE setup session from an authentic message to a canonical Completion or a canonical
 * terminal Disposition (Initial Locality Bootstrap v0.9). It owns no semantic verdict: every record it writes is re-derived by the
 * deterministic admission (`@immortalis/engine`), so a bug here is refused, never committed. It is idempotent by construction:
 * every step derives its position from the journal, so a restart, a crash at any cut, or a competing resumer re-derives the same
 * identities and continues; it can never invoke the driver twice for a reservation (the runner enforces that independently).
 *
 * T1: with the synthetic T1 verifier and a scripted driver this proves MECHANISM ONLY. No genuine message-proof method and no
 * isolation-capable model driver is selected by this handoff, so with the production verifier the route returns its actual
 * unresolved-authority result at intake.
 */
export type IntakeStatus =
  "ADMITTED" | "REPEATED" | "SETUP_BUSY" | "UNRESOLVED_AUTHORITY" | "REFUSED";

export interface IntakeResult {
  readonly status: IntakeStatus;
  readonly setup_id?: string;
  readonly reason?: string;
  readonly message: string;
}

export type SessionPhaseStatus =
  | "COMPLETED"
  | "TERMINAL"
  | "SCOPE_RESERVED_UNRESOLVED"
  | "SCENE_RESERVED_UNRESOLVED"
  | "IN_PROGRESS"
  | "NOT_FOUND"
  | "HOLD";

export interface AdvanceResult {
  readonly status: SessionPhaseStatus;
  readonly setup_id: string;
  /** disposition reason when TERMINAL */
  readonly reason?: string;
  readonly message: string;
}

export interface IntakeRequest {
  readonly client: string;
  readonly oauth_grant: string;
  readonly authenticated_setup_request_id: string;
  readonly message: string;
  readonly author: AuthoredEvidence;
  readonly chronology: ChronologyCapture;
}

/** An authorization only the trusted operator code mints; ordinary host tools never construct one. */
const operatorGrants = new WeakSet<object>();
export interface OperatorAuthorization {
  readonly __operator: true;
}
export function authorizeOperatorDisposition(): OperatorAuthorization {
  const grant = Object.freeze({ __operator: true as const });
  operatorGrants.add(grant);
  return grant;
}

export interface InitialSetupDeps {
  readonly campaignId: string;
  readonly store: CampaignStore;
  readonly runner: PrivateRunner;
  readonly verifier: EvidenceVerifier;
  readonly policy?: InitialSetupPolicy;
}

const factsOf = (store: CampaignStore): ReadonlyMap<string, OwnerFact> =>
  new Map(store.listFacts().map((f) => [f.key, f]));
const pinOf = (f: OwnerFact): Pin => ({ fact_key: f.key, version: f.version });

export class InitialSetupService {
  readonly #d: InitialSetupDeps;
  readonly #policy: InitialSetupPolicy;
  readonly #publisher: InitialSetupPublisher;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(deps: InitialSetupDeps) {
    this.#d = deps;
    this.#policy = deps.policy ?? PRODUCTION_INITIAL_SETUP_POLICY;
    this.#publisher = new InitialSetupPublisher(deps.store);
  }

  /** Serializes every mutation of this campaign's bootstrap path inside this process; across processes the canonical create-only
   *  reservation keys and the runner's exclusive outbox marker serialize instead. */
  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(fn, fn);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  // -- intake --------------------------------------------------------------------------------------------------------

  intake(req: IntakeRequest): Promise<IntakeResult> {
    return this.#serial(async () => {
      const { store, campaignId, verifier } = this.#d;
      if (req.author.grade !== "ORIGINAL_MESSAGE_VERIFIED")
        return {
          status: "UNRESOLVED_AUTHORITY",
          message:
            "only a verified original message can author a setup: a model-formed tool call or an operator confirmation does not qualify",
        };
      const messageHash = setupMessageHash(req.message);
      if (req.author.original_message_hash !== messageHash)
        return {
          status: "REFUSED",
          reason: "AUTHOR_MESSAGE_HASH",
          message: "the proof does not map to this exact message",
        };
      const verified = await verifier.verifyOriginalMessage({
        method_id: req.author.method_id,
        client: req.author.client,
        oauth_grant: req.author.oauth_grant,
        request_ref: req.author.request_ref,
        original_message_hash: req.author.original_message_hash,
        attestation_hash: req.author.proof_hash,
        message_hash: messageHash,
      });
      if (!verified)
        return {
          status: "UNRESOLVED_AUTHORITY",
          message:
            "no trusted original-message intake verifies this message: the actual unresolved-authority result (no genuine production method is selected)",
        };
      const capture = await verifyCaptureForIntake(
        { campaignId, verifier, policy: this.#policy },
        req.chronology,
      );
      if (!capture.ok)
        return {
          status:
            capture.error.code === "UNRESOLVED_AUTHORITY" ? "UNRESOLVED_AUTHORITY" : "REFUSED",
          reason: capture.error.code,
          message: capture.error.message,
        };

      const facts = factsOf(store);
      const projection = genesisProjection(facts);
      if (!projection.ok)
        return {
          status: "REFUSED",
          reason: projection.error.code,
          message: projection.error.message,
        };
      const p = projection.value;
      const fingerprint = scopeFingerprintOf({
        world_id: p.world_id,
        locus_id: p.locus_id,
        setup_message_hash: messageHash,
        projection_hash: p.projection_hash,
        chronology_document_hash: req.chronology.document_hash,
      });
      const index = scanInitialSetup(facts);
      // repetition returns the existing result or terminal barrier and NEVER invokes classification again
      for (const s of index.sessions.values()) {
        if (InitialSetupInputSchema.parse(s.input.value).scope_fingerprint === fingerprint)
          return {
            status: "REPEATED",
            setup_id: s.setup_id,
            message:
              "the same message, genesis and chronology were already accepted: the original result or barrier stands",
          };
      }
      const head = store.head();
      const input: InitialSetupInput = {
        format: "immortalis-initial-setup-input",
        format_version: 1,
        world_id: p.world_id,
        locus_id: p.locus_id,
        source: p.source,
        pc: p.pc,
        setup_id: setupIdOf({
          campaign_id: campaignId,
          client: req.client,
          oauth_grant: req.oauth_grant,
          authenticated_setup_request_id: req.authenticated_setup_request_id,
        }),
        scope_fingerprint: fingerprint,
        setup_message: req.message,
        author: req.author,
        chronology: req.chronology,
        genesis: [...p.pins],
        projection_hash: p.projection_hash,
        pre_state: {
          head: `revision:${head.revision}`,
          basis_hash: sha256Canonical({ projection: p.projection_hash, revision: head.revision }),
        },
        runner: this.#d.runner.pin,
        parser: INITIAL_LOCALITY_PARSER_V1,
      };
      const committed = await this.#publisher.input(input);
      if (committed.ok)
        return {
          status: "ADMITTED",
          setup_id: input.setup_id,
          message: "accepted; the setup basis is frozen",
        };
      const reason = (committed.error.details as { reason?: string } | undefined)?.reason;
      if (reason === "SETUP_BUSY")
        return {
          status: "SETUP_BUSY",
          ...(reason ? { reason } : {}),
          message: committed.error.message,
        };
      return { status: "REFUSED", ...(reason ? { reason } : {}), message: committed.error.message };
    });
  }

  // -- drive ---------------------------------------------------------------------------------------------------------

  /** Advances one session as far as it lawfully can. Safe to call after any crash, any number of times, concurrently. */
  advance(setupId: string): Promise<AdvanceResult> {
    return this.#serial(() => this.#advance(setupId));
  }

  async #advance(setupId: string): Promise<AdvanceResult> {
    const { store, campaignId } = this.#d;
    const done = (status: SessionPhaseStatus, message: string, reason?: string): AdvanceResult => ({
      status,
      setup_id: setupId,
      message,
      ...(reason ? { reason } : {}),
    });
    for (let guard = 0; guard < 16; guard++) {
      const facts = factsOf(store);
      const index = scanInitialSetup(facts);
      const s = index.sessions.get(setupId);
      if (!s) return done("NOT_FOUND", "no such setup session");
      if (index.completion) return done("COMPLETED", "the locality has its Completion");
      if (s.disposition)
        return done(
          "TERMINAL",
          "the session ended in a canonical disposition and released the freeze",
          (s.disposition.value as { reason: string }).reason,
        );
      const input = InitialSetupInputSchema.parse(s.input.value);
      const inputPin = pinOf(s.input);

      // ---- SCOPE ----
      if (!s.scopeReservation) {
        const projection = genesisProjection(facts);
        if (!projection.ok) return done("HOLD", projection.error.message);
        const built = buildProducerInput({
          campaign_id: campaignId,
          phase: "SCOPE",
          input_pin: inputPin,
          input,
          genesis: projection.value.facts,
        });
        if (!built.ok) return done("HOLD", built.error.message);
        const r = await this.#publisher.invocation({
          world_id: input.world_id,
          locus_id: input.locus_id,
          setup_id: input.setup_id,
          input: inputPin,
          phase: "SCOPE",
          task_id: built.value.task_id,
          input_hash: built.value.input_hash,
          parser: INITIAL_LOCALITY_PARSER_V1,
          grant: null,
        });
        if (!r.ok && !this.#benign(r.error.message)) return done("HOLD", r.error.message);
        continue;
      }
      if (!s.scopeResponse) {
        const r = await this.#drive(index, s, input, "SCOPE");
        if (r) return r;
        continue;
      }
      const scopeResp = InitialSetupResponseSchema.parse(s.scopeResponse.value);
      const scope = interpretResponse(scopeResp);
      if (!scope.ok || scope.value.phase !== "SCOPE") {
        await this.#dispose(
          facts,
          s,
          "INVALID_OUTPUT",
          "SCOPE",
          pinOf(s.scopeResponse),
          null,
          "the signed SCOPE answer is not a valid output",
        );
        continue;
      }
      const decisionKey = refereeDecisionKey(scopeResp.task_id);
      const decisionFact = facts.get(decisionKey);
      if (!decisionFact) {
        const verdict = derivedScopeVerdict(scope.value.output, input, facts);
        const record = scopeDecisionRecord({
          campaign_id: campaignId,
          task_id: scopeResp.task_id,
          world_id: input.world_id,
          locus_id: input.locus_id,
          input_hash: scopeResp.input_hash,
          setup_input: inputPin,
          reservation: scopeResp.reservation,
          response: pinOf(s.scopeResponse),
          decision: scope.value.output,
          verdict,
          claimed_model: null,
        });
        const r = await this.#publisher.scopeDecision(record);
        if (!r.ok && !this.#benign(r.error.message)) return done("HOLD", r.error.message);
        continue;
      }
      const decision = ScopeDecisionRecordSchema.parse(decisionFact.value);
      if (decision.verdict !== "SCOPE_AUTHORIZED") {
        await this.#dispose(
          facts,
          s,
          decision.verdict === "MIXED_INPUT" ? "MIXED_INPUT" : "SCOPE_REFUSED",
          "SCOPE",
          pinOf(s.scopeResponse),
          null,
          decision.verdict === "MIXED_INPUT"
            ? "the message also commands an act now: separate authored messages are required"
            : "the scope is refused: clarification or a changed authentic message is required",
        );
        continue;
      }
      if (!s.grant) {
        const r = await this.#publisher.grant({
          world_id: input.world_id,
          locus_id: input.locus_id,
          setup_id: input.setup_id,
          input: inputPin,
          classification: pinOf(decisionFact),
          scope_response: pinOf(s.scopeResponse),
          facets: decision.decision.facets,
          restrictions: decision.decision.restrictions,
          chronology_hash: input.chronology.document_hash,
          scope_hash: sha256Canonical(decision.decision),
        });
        if (!r.ok && !this.#benign(r.error.message)) return done("HOLD", r.error.message);
        continue;
      }

      // ---- SCENE ----
      const sceneMine =
        index.sceneReservation &&
        InitialSetupInvocationSchema.parse(index.sceneReservation.value).setup_id === setupId;
      if (index.sceneReservation && !sceneMine)
        return done("HOLD", "another session holds the locality's one SCENE reservation");
      if (!index.sceneReservation) {
        const projection = genesisProjection(facts);
        if (!projection.ok) return done("HOLD", projection.error.message);
        const grantPin = pinOf(s.grant);
        const built = buildProducerInput({
          campaign_id: campaignId,
          phase: "SCENE",
          input_pin: inputPin,
          input,
          genesis: projection.value.facts,
          grant: grantPin,
          scope: decision.decision,
        });
        if (!built.ok) return done("HOLD", built.error.message);
        const r = await this.#publisher.invocation({
          world_id: input.world_id,
          locus_id: input.locus_id,
          setup_id: input.setup_id,
          input: inputPin,
          phase: "SCENE",
          task_id: built.value.task_id,
          input_hash: built.value.input_hash,
          parser: INITIAL_LOCALITY_PARSER_V1,
          grant: grantPin,
        });
        if (!r.ok && !this.#benign(r.error.message)) return done("HOLD", r.error.message);
        continue;
      }
      if (!s.sceneResponse) {
        const r = await this.#drive(index, s, input, "SCENE");
        if (r) return r;
        continue;
      }
      const sceneResp = InitialSetupResponseSchema.parse(s.sceneResponse.value);
      const scene = interpretResponse(sceneResp);
      if (!scene.ok || scene.value.phase !== "SCENE") {
        await this.#dispose(
          facts,
          s,
          "INVALID_OUTPUT",
          "SCENE",
          pinOf(s.sceneResponse),
          null,
          "the signed SCENE answer is not a valid output",
        );
        continue;
      }
      if (scene.value.output.kind === "UNRESOLVED") {
        await this.#dispose(
          facts,
          s,
          "GENERATOR_UNRESOLVED",
          "SCENE",
          pinOf(s.sceneResponse),
          null,
          `the isolated selection is UNRESOLVED (${scene.value.output.reason}); it is retained terminally and never rerun`,
        );
        continue;
      }
      const candidate = InitialLocalityCompletionSchema.parse({
        world_id: input.world_id,
        locus_id: input.locus_id,
        setup_id: input.setup_id,
        input: inputPin,
        grant: pinOf(s.grant),
        scene_response: pinOf(s.sceneResponse),
        selection: scene.value.output.selection,
        parser: INITIAL_LOCALITY_PARSER_V1,
      });
      // completion validation is a named pure function of the frozen pre-state and the signed response; a refusal is canonical
      const state = { campaign_id: campaignId, revision: store.head().revision, facts };
      const violation = completionViolation(state, candidate);
      if (violation) {
        await this.#dispose(
          facts,
          s,
          "COMPLETION_REFUSED",
          "SCENE",
          pinOf(s.sceneResponse),
          violation.code,
          violation.message,
        );
        continue;
      }
      const r = await this.#publisher.completion(candidate);
      if (!r.ok && !this.#benign(r.error.message)) return done("HOLD", r.error.message);
    }
    return done("IN_PROGRESS", "the session is still advancing");
  }

  /** A commit that lost a benign race to an identical committed record is not a failure: the next pass re-derives. */
  #benign(message: string): boolean {
    return /already|exists|one SCOPE reservation|at most one|conflict|replay/i.test(message);
  }

  async #drive(
    index: SetupIndex,
    s: SetupSession,
    input: InitialSetupInput,
    phase: SetupPhase,
  ): Promise<AdvanceResult | null> {
    const { store, campaignId, runner } = this.#d;
    const facts = factsOf(store);
    const reservationFact = phase === "SCOPE" ? s.scopeReservation! : index.sceneReservation!;
    const inv = InitialSetupInvocationSchema.parse(reservationFact.value);
    const projection = genesisProjection(facts);
    if (!projection.ok)
      return { status: "HOLD", setup_id: s.setup_id, message: projection.error.message };
    let producer;
    if (phase === "SCOPE") {
      producer = buildProducerInput({
        campaign_id: campaignId,
        phase,
        input_pin: pinOf(s.input),
        input,
        genesis: projection.value.facts,
      });
    } else {
      const scopeResp = InitialSetupResponseSchema.parse(s.scopeResponse!.value);
      const scope = interpretResponse(scopeResp);
      if (!scope.ok || scope.value.phase !== "SCOPE")
        return {
          status: "HOLD",
          setup_id: s.setup_id,
          message: "the accepted scope is unavailable",
        };
      producer = buildProducerInput({
        campaign_id: campaignId,
        phase,
        input_pin: pinOf(s.input),
        input,
        genesis: projection.value.facts,
        grant: pinOf(s.grant!),
        scope: scope.value.output,
      });
    }
    if (!producer.ok)
      return { status: "HOLD", setup_id: s.setup_id, message: producer.error.message };
    const req = {
      campaign_id: campaignId,
      world_id: input.world_id,
      locus_id: input.locus_id,
      setup_id: input.setup_id,
      phase,
      task_id: inv.task_id,
      reservation: pinOf(reservationFact),
      input_hash: inv.input_hash,
      projection_hash: input.projection_hash,
      producerInput: producer.value.bytes,
    } as const;
    const cap = runner.authorize(store, req);
    if (!cap.ok) return { status: "HOLD", setup_id: s.setup_id, message: cap.error.message };
    const out = await runner.invokeOnce(cap.value, req);
    if (out.status === "UNKNOWN")
      return {
        status: phase === "SCOPE" ? "SCOPE_RESERVED_UNRESOLVED" : "SCENE_RESERVED_UNRESOLVED",
        setup_id: s.setup_id,
        message: `the ${phase} reservation exists and its outcome is unknown (${out.reason}): recover or park, never regenerate`,
      };
    const response: InitialSetupResponse = {
      world_id: input.world_id,
      locus_id: input.locus_id,
      setup_id: input.setup_id,
      reservation: pinOf(reservationFact),
      phase,
      task_id: inv.task_id,
      input_hash: inv.input_hash,
      raw_response_base64: Buffer.from(out.raw).toString("base64"),
      raw_response_hash: sha256Bytes(out.raw),
      envelope: out.envelope,
      parser: INITIAL_LOCALITY_PARSER_V1,
    };
    const r = await this.#publisher.response(response);
    if (!r.ok && !this.#benign(r.error.message))
      return { status: "HOLD", setup_id: s.setup_id, message: r.error.message };
    return null;
  }

  async #dispose(
    facts: ReadonlyMap<string, OwnerFact>,
    s: SetupSession,
    reason: InitialSetupDisposition["reason"],
    phase: SetupPhase | null,
    response: Pin | null,
    rejection_code: string | null,
    explanation: string,
  ): Promise<void> {
    const input = InitialSetupInputSchema.parse(s.input.value);
    await this.#publisher.disposition({
      world_id: input.world_id,
      locus_id: input.locus_id,
      setup_id: input.setup_id,
      input: pinOf(s.input),
      reason,
      phase,
      response,
      rejection_code,
      explanation,
    });
  }

  // -- explicit terminal dispositions --------------------------------------------------------------------------------

  /**
   * Explicit cancellation: allowed only while the relevant reservation is canonically ABSENT (checked here and again by the
   * admission under the same commit serialization). It permanently consumes the same-input fingerprint; a restart cannot revive it.
   */
  cancelBeforeReservation(
    setupId: string,
    authorization: OperatorAuthorization,
  ): Promise<AdvanceResult> {
    return this.#serial(async () => {
      if (!operatorGrants.has(authorization))
        return {
          status: "HOLD",
          setup_id: setupId,
          message: "an authorized operator disposition is required",
        };
      const facts = factsOf(this.#d.store);
      const index = scanInitialSetup(facts);
      const s = index.sessions.get(setupId);
      if (!s) return { status: "NOT_FOUND", setup_id: setupId, message: "no such setup session" };
      const phase: SetupPhase = !s.scopeReservation ? "SCOPE" : "SCENE";
      await this.#dispose(
        facts,
        s,
        "CANCELLED_BEFORE_RESERVATION",
        phase,
        null,
        null,
        "cancelled by the operator before any reservation",
      );
      return this.#advance(setupId);
    });
  }

  /**
   * PARKED_UNKNOWN: an authorized operator releases the freeze and parks the route over an existing UNRESOLVED reservation. It does
   * not erase the reservation, free the SCENE slot, create world truth or allow generation again.
   */
  parkUnknown(setupId: string, authorization: OperatorAuthorization): Promise<AdvanceResult> {
    return this.#serial(async () => {
      if (!operatorGrants.has(authorization))
        return {
          status: "HOLD",
          setup_id: setupId,
          message: "an authorized operator disposition is required",
        };
      const facts = factsOf(this.#d.store);
      const index = scanInitialSetup(facts);
      const s = index.sessions.get(setupId);
      if (!s) return { status: "NOT_FOUND", setup_id: setupId, message: "no such setup session" };
      const phase: SetupPhase | null =
        s.scopeReservation && !s.scopeResponse
          ? "SCOPE"
          : index.sceneReservation && !s.sceneResponse
            ? "SCENE"
            : null;
      if (!phase)
        return {
          status: "HOLD",
          setup_id: setupId,
          message: "no unresolved reservation exists to park",
        };
      await this.#dispose(
        facts,
        s,
        "PARKED_UNKNOWN",
        phase,
        null,
        null,
        `the ${phase} reservation's outcome is unknown; parked by the operator`,
      );
      return this.#advance(setupId);
    });
  }

  /** The locality's canonical position, derived from the journal alone. */
  position(): SetupIndex {
    return scanInitialSetup(factsOf(this.#d.store));
  }
}
