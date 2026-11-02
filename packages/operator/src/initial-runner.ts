import { createPrivateKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import { join } from "node:path";
import {
  InitialSetupInvocationSchema,
  RUNNER_ID,
  RUNNER_RESULT_FORMAT,
  INITIAL_LOCALITY_PARSER_V1,
  RAW_RESPONSE_MAX_BYTES,
  SignedEnvelopeSchema,
  canonicalJson,
  fail,
  initialSetupInvocationKey,
  ok,
  type Pin,
  type Result,
  type RunnerPin,
  type SetupPhase,
  type SignedEnvelope,
} from "@immortalis/contracts";
import {
  INITIAL_SETUP_INSTRUCTIONS,
  instructionHashOf,
  inputHashOfDelivered,
  sha256Bytes,
  type CampaignStore,
} from "@immortalis/engine";
import type { FsOps } from "@immortalis/engine";
import { ProtectedStore } from "./protected-store.ts";

/**
 * The trusted PRIVATE RUNNER (Initial Locality Bootstrap v0.9, companion "Private Runner and Replay Assurance").
 *
 * - Enrollment is trusted-startup only. The Ed25519 private key lives in this object and nowhere else: it is never exposed to MCP,
 *   the model or campaign content, and never written to the repository or an outbox. Only its public key is pinned into `Input.runner`.
 * - It cannot invoke the driver without (1) a COMMITTED canonical reservation, read back from the campaign store, and (2) its
 *   one-shot dispatch capability minted from that reservation. There is no code path that drives the model otherwise.
 * - A durable outbox records `started` BEFORE the driver is called. Once the capability is consumed, duplicate delivery returns the
 *   original durable result, or UNKNOWN — it NEVER calls the driver again. There is no NOT_GENERATED envelope, no negative void and
 *   no automatic shape-only retry: a reserved send window of unknown outcome is recover-or-park forever.
 * - It signs the exact raw answer hash together with the exact context and task bindings; the answer cannot supply its own key.
 *
 * What a signature proves is origin and integrity under the declared trusted-startup/provider model — NOT semantic correctness and
 * NOT a provider's invisible internal behaviour. The driver's `context_manifest_hash` is attestation, not independent proof.
 */
export interface DriverRun {
  readonly raw: Uint8Array;
  /** hash of the exact fixed instructions and exact producer-input bytes the fresh context was given, with no other channel */
  readonly context_manifest_hash: string;
}
export interface IsolatedDriver {
  readonly driver_id: string;
  readonly config_hash: string;
  /** A FRESH context: the fixed instructions and the exact engine-built bytes only — no transcript, memory, tool or retrieval. */
  run(args: {
    readonly phase: SetupPhase;
    readonly instructions: string;
    readonly producerInput: Uint8Array;
  }): Promise<DriverRun>;
}

export interface DispatchRequest {
  readonly campaign_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  readonly setup_id: string;
  readonly phase: SetupPhase;
  readonly task_id: string;
  readonly reservation: Pin;
  readonly input_hash: string;
  readonly projection_hash: string;
  /** the exact engine-produced bytes, passed to the driver unchanged */
  readonly producerInput: Uint8Array;
}

export type DispatchOutcome =
  | { readonly status: "RESPONDED"; readonly raw: Uint8Array; readonly envelope: SignedEnvelope }
  | { readonly status: "UNKNOWN"; readonly reason: string };

const capabilities = new WeakMap<object, { task_id: string }>();

export type RunnerErrorCode =
  | "RESERVATION_NOT_COMMITTED"
  | "RESERVATION_MISMATCH"
  | "CAPABILITY_INVALID"
  | "OUTBOX_UNAVAILABLE"
  | "RAW_OVERSIZE";

export class PrivateRunner {
  readonly #key: KeyObject;
  readonly #driver: IsolatedDriver;
  readonly #outbox: ProtectedStore;
  readonly #pin: RunnerPin;
  readonly #inflight = new Map<string, Promise<DispatchOutcome>>();

  /** Called by trusted startup only. `privateKeyPkcs8Base64` is generated or read from an operator-owned file; never from content. */
  constructor(params: {
    readonly keyId: string;
    readonly privateKeyPkcs8Base64: string;
    readonly publicKeySpkiBase64: string;
    readonly driver: IsolatedDriver;
    readonly outboxDir: string;
    readonly macKey: Buffer;
    readonly fs?: FsOps;
  }) {
    this.#key = createPrivateKey({
      key: Buffer.from(params.privateKeyPkcs8Base64, "base64"),
      format: "der",
      type: "pkcs8",
    });
    this.#driver = params.driver;
    this.#outbox = new ProtectedStore({
      dir: join(params.outboxDir, "runner-outbox"),
      format: "immortalis-initial-runner-outbox",
      macKey: params.macKey,
      ...(params.fs ? { fs: params.fs } : {}),
    });
    this.#pin = {
      runner_id: RUNNER_ID,
      key_id: params.keyId,
      public_key: params.publicKeySpkiBase64,
      instruction_hash: instructionHashOf(),
      driver_id: params.driver.driver_id,
      driver_config_hash: params.driver.config_hash,
    };
  }

  /** The enrollment pinned into every Input before dispatch. */
  get pin(): RunnerPin {
    return this.#pin;
  }

  /**
   * Mints the one-shot dispatch capability from a COMMITTED canonical reservation: the reservation is read back from the campaign
   * store and must be exactly this task. No reservation, no capability.
   */
  authorize(
    store: CampaignStore,
    req: Pick<DispatchRequest, "reservation" | "task_id" | "phase" | "input_hash" | "setup_id">,
  ): Result<object, RunnerErrorCode> {
    const fact = store.getFact(req.reservation.fact_key);
    if (!fact || fact.version !== req.reservation.version)
      return fail(
        "RESERVATION_NOT_COMMITTED",
        "no committed canonical reservation: the driver cannot be invoked",
      );
    const inv = InitialSetupInvocationSchema.safeParse(fact.value);
    if (
      !inv.success ||
      inv.data.task_id !== req.task_id ||
      inv.data.phase !== req.phase ||
      inv.data.input_hash !== req.input_hash ||
      inv.data.setup_id !== req.setup_id ||
      fact.key !==
        initialSetupInvocationKey(
          inv.data.world_id,
          inv.data.locus_id,
          inv.data.phase,
          inv.data.setup_id,
        )
    )
      return fail("RESERVATION_MISMATCH", "the committed reservation is not this task");
    const cap = Object.freeze({});
    capabilities.set(cap, { task_id: req.task_id });
    return ok(cap);
  }

  /**
   * Invokes the isolated driver at most once per task, ever. Concurrent and repeated deliveries share the first outcome; a later
   * process finds the durable `started` marker and reports UNKNOWN (or the stored result) without touching the driver.
   */
  invokeOnce(capability: object, req: DispatchRequest): Promise<DispatchOutcome> {
    const bound = capabilities.get(capability);
    if (!bound || bound.task_id !== req.task_id)
      return Promise.resolve({
        status: "UNKNOWN",
        reason: "no valid one-shot dispatch capability",
      });
    // the capability is one-use: consuming it is a state change even if the call below fails
    capabilities.delete(capability);
    const existing = this.#inflight.get(req.task_id);
    if (existing) return existing;
    const run = this.#dispatchOnce(req);
    this.#inflight.set(req.task_id, run);
    return run;
  }

  /** The durable result of a task, if the driver already answered it (crash recovery without a model call). */
  async recover(task_id: string): Promise<DispatchOutcome | null> {
    const got = await this.#outbox.get(`result:${task_id}`);
    if (!got.ok) return { status: "UNKNOWN", reason: "the runner outbox is unreadable or corrupt" };
    if (got.value === null) return null;
    const rec = got.value as { raw_base64: string; envelope: unknown };
    const env = SignedEnvelopeSchema.safeParse(rec.envelope);
    if (!env.success) return { status: "UNKNOWN", reason: "the stored runner result is malformed" };
    return { status: "RESPONDED", raw: Buffer.from(rec.raw_base64, "base64"), envelope: env.data };
  }

  async #dispatchOnce(req: DispatchRequest): Promise<DispatchOutcome> {
    const prior = await this.recover(req.task_id);
    if (prior) return prior;
    if (inputHashOfDelivered(req.producerInput) !== req.input_hash)
      return {
        status: "UNKNOWN",
        reason: "the producer input is not the one the reservation names",
      };
    // the send window opens HERE: record it durably before the driver can be reached, so a crash can never be mistaken for
    // "nothing was sent"
    const started = await this.#outbox.create(`started:${req.task_id}`, {
      task_id: req.task_id,
      phase: req.phase,
      input_hash: req.input_hash,
    });
    if (!started.ok)
      return {
        status: "UNKNOWN",
        reason:
          started.error.code === "STORE_EXISTS"
            ? "the invocation was already started and has no stored result; it is never invoked again"
            : "the runner outbox could not record the start",
      };
    let run: DriverRun;
    try {
      run = await this.#driver.run({
        phase: req.phase,
        instructions: INITIAL_SETUP_INSTRUCTIONS[req.phase],
        producerInput: req.producerInput,
      });
    } catch {
      return {
        status: "UNKNOWN",
        reason: "the driver failed after the send window opened; its outcome is unknown",
      };
    }
    if (run.raw.length > RAW_RESPONSE_MAX_BYTES)
      return {
        status: "UNKNOWN",
        reason: "the raw answer exceeds its transport bound and cannot be signed",
      };
    const body = {
      format: RUNNER_RESULT_FORMAT,
      format_version: 1 as const,
      runner_id: RUNNER_ID,
      key_id: this.#pin.key_id,
      campaign_id: req.campaign_id,
      world_id: req.world_id,
      locus_id: req.locus_id,
      setup_id: req.setup_id,
      phase: req.phase,
      task_id: req.task_id,
      reservation: req.reservation,
      input_hash: req.input_hash,
      projection_hash: req.projection_hash,
      instruction_hash: this.#pin.instruction_hash,
      driver_id: this.#pin.driver_id,
      driver_config_hash: this.#pin.driver_config_hash,
      context_manifest_hash: run.context_manifest_hash,
      parser: INITIAL_LOCALITY_PARSER_V1,
      raw_response_hash: sha256Bytes(run.raw),
    };
    const signature = cryptoSign(
      null,
      Buffer.from(canonicalJson(body), "utf8"),
      this.#key,
    ).toString("base64");
    const envelope = SignedEnvelopeSchema.parse({ body, signature });
    const stored = await this.#outbox.create(`result:${req.task_id}`, {
      raw_base64: Buffer.from(run.raw).toString("base64"),
      envelope,
    });
    // The outbox copy is a crash-recovery aid, not the record: the service commits the canonical Response immediately. If the
    // retention fails the answer we HOLD is still returned (discarding a real result would force an unknowable state); a crash
    // before the canonical commit then leaves the honest "reserved, outcome unknown" state: recover-or-park, never regenerate.
    void stored;
    return { status: "RESPONDED", raw: run.raw, envelope };
  }
}
