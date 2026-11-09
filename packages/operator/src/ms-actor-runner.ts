import { createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";
import { join } from "node:path";
import {
  ActorSignedEnvelopeSchema,
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  RAW_RESPONSE_MAX_BYTES,
  canonicalJson,
  msActorResponseKey,
  type ActorSignedEnvelope,
  type InitialActorSetupResponse,
  type Pin,
} from "@immortalis/contracts";
import {
  MS_ACTOR_INSTRUCTION,
  MS_ACTOR_INSTRUCTION_HASH,
  MS_ACTOR_SETUP_ISSUE_V1_RULE,
  canonicalEqual,
  planMsActor,
  msChain,
  msPrefixViolation,
  msResponseViolation,
  sha256Bytes,
  strictEd25519Key,
  type CampaignStore,
  type FsOps,
} from "@immortalis/engine";
import { ProtectedStore } from "./protected-store.ts";

export interface IsolatedActorDriver {
  readonly driver_id: string;
  readonly config_hash: string;
  run(request: {
    readonly phase: "ACTOR";
    readonly instructions: string;
    readonly producerInput: Uint8Array;
  }): Promise<{ readonly raw: Uint8Array; readonly context_manifest_hash: string }>;
}
export type ActorDispatchOutcome =
  | {
      readonly status: "RESPONDED";
      readonly raw: Uint8Array;
      readonly envelope: ActorSignedEnvelope;
    }
  | { readonly status: "REFUSED" | "UNKNOWN"; readonly reason: string };
const capabilities = new WeakMap<
  object,
  { runner: MsActorRunner; store: CampaignStore; issue: Pin }
>();

/** One trusted role.world / permission.world_process.resolve operation. No model-visible canon-write capability. */
export class MsActorRunner {
  readonly #key: KeyObject;
  readonly #driver: IsolatedActorDriver;
  readonly #outbox: ProtectedStore;
  readonly binding: {
    readonly key_id: string;
    readonly public_key: string;
    readonly driver_id: string;
    readonly driver_config_hash: string;
  };
  readonly #inflight = new Map<string, Promise<ActorDispatchOutcome>>();
  constructor(p: {
    keyId: string;
    privateKeyPkcs8Base64: string;
    publicKeySpkiBase64: string;
    driver: IsolatedActorDriver;
    outboxDir: string;
    macKey: Buffer;
    fs?: FsOps;
  }) {
    if (!strictEd25519Key(p.publicKeySpkiBase64))
      throw new Error("MS requires a canonical Ed25519 SPKI");
    this.#key = createPrivateKey({
      key: Buffer.from(p.privateKeyPkcs8Base64, "base64"),
      format: "der",
      type: "pkcs8",
    });
    if (
      createPublicKey(this.#key).export({ format: "der", type: "spki" }).toString("base64") !==
      p.publicKeySpkiBase64
    )
      throw new Error("MS private/public enrollment mismatch");
    this.#driver = p.driver;
    this.binding = Object.freeze({
      key_id: p.keyId,
      public_key: p.publicKeySpkiBase64,
      driver_id: p.driver.driver_id,
      driver_config_hash: p.driver.config_hash,
    });
    this.#outbox = new ProtectedStore({
      dir: join(p.outboxDir, "ms-actor-outbox"),
      format: "immortalis-ms-actor-outbox-v1",
      macKey: p.macKey,
      ...(p.fs ? { fs: p.fs } : {}),
    });
  }
  authorize(store: CampaignStore, issue: Pin): object | null {
    const f = store.getFact(issue.fact_key),
      q = InitialActorSetupIssueSchema.safeParse(f?.value);
    if (
      !f ||
      f.version !== issue.version ||
      !q.success ||
      !canonicalEqual(f.provenance.rule, MS_ACTOR_SETUP_ISSUE_V1_RULE)
    )
      return null;
    const r = q.data.runner;
    if (
      !canonicalEqual(this.binding, {
        key_id: r.key_id,
        public_key: r.public_key,
        driver_id: r.driver_id,
        driver_config_hash: r.driver_config_hash,
      }) ||
      r.instruction_hash !== MS_ACTOR_INSTRUCTION_HASH
    )
      return null;
    const cap = Object.freeze({});
    capabilities.set(cap, { runner: this, store, issue });
    return cap;
  }
  dispatch(
    cap: object,
    instructions: string,
    producerInput: Uint8Array,
  ): Promise<ActorDispatchOutcome> {
    const permission = capabilities.get(cap);
    capabilities.delete(cap);
    if (!permission || permission.runner !== this)
      return Promise.resolve({ status: "REFUSED", reason: "MS_CAPABILITY_INVALID" });
    const f = permission.store.getFact(permission.issue.fact_key);
    const parsed = InitialActorSetupIssueSchema.safeParse(f?.value);
    if (!f || !parsed.success || f.version !== permission.issue.version)
      return Promise.resolve({ status: "REFUSED", reason: "MS_ISSUE_NOT_COMMITTED" });
    const q = parsed.data,
      attempt = permission.store.head().campaign_id + "/" + q.completion_digest;
    const prior = this.#inflight.get(attempt);
    if (prior) return prior;
    const run = this.#once(permission.store, permission.issue, instructions, producerInput).catch(
      (): ActorDispatchOutcome => ({ status: "UNKNOWN", reason: "MS_DISPATCH_UNKNOWN" }),
    );
    this.#inflight.set(attempt, run);
    void run.finally(() => this.#inflight.delete(attempt));
    return run;
  }
  async #once(
    store: CampaignStore,
    issue: Pin,
    instructions: string,
    bytes: Uint8Array,
  ): Promise<ActorDispatchOutcome> {
    const f = store.getFact(issue.fact_key)!,
      q = InitialActorSetupIssueSchema.parse(f.value),
      campaign = store.head().campaign_id;
    const response = (raw: string, envelope: ActorSignedEnvelope): InitialActorSetupResponse => ({
      world_id: q.world_id,
      locus_id: q.locus_id,
      setup_id: q.setup_id,
      completion: q.completion,
      issue,
      task_id: q.task_id,
      input_hash: q.input_hash,
      parser: q.parser,
      raw_response_base64: raw,
      raw_response_hash: envelope.body.raw_response_hash,
      envelope,
    });
    const canonical = store.getFact(
      msActorResponseKey(q.world_id, q.locus_id, q.completion_digest),
    );
    if (canonical) {
      const r = InitialActorSetupResponseSchema.safeParse(canonical.value);
      if (!r.success || msResponseViolation(r.data, f, campaign))
        return { status: "UNKNOWN", reason: "MS_CANONICAL_RESPONSE_CORRUPT" };
      return {
        status: "RESPONDED",
        raw: Buffer.from(r.data.raw_response_base64, "base64"),
        envelope: r.data.envelope,
      };
    }
    const attempt = campaign + "/" + q.completion_digest;
    const prior = await this.#outbox.get("result:" + attempt);
    if (!prior.ok) return { status: "UNKNOWN", reason: prior.error.code };
    if (prior.value !== null) {
      const value = prior.value as { raw_base64?: unknown; envelope?: unknown };
      const env = ActorSignedEnvelopeSchema.safeParse(value.envelope);
      if (
        !env.success ||
        typeof value.raw_base64 !== "string" ||
        msResponseViolation(response(value.raw_base64, env.data), f, campaign)
      )
        return { status: "UNKNOWN", reason: "MS_OUTBOX_CORRUPT" };
      return {
        status: "RESPONDED",
        raw: Buffer.from(value.raw_base64, "base64"),
        envelope: env.data,
      };
    }
    const started = await this.#outbox.get("started:" + attempt);
    if (!started.ok || started.value !== null)
      return { status: "UNKNOWN", reason: "MS_PARKED_UNKNOWN" };
    // Rebuild from COMMITTED source context immediately before the started/send window; exact bytes, not parsed equality.
    const facts = new Map(store.listFacts().map((x) => [x.key, x])),
      state = { campaign_id: campaign, revision: store.head().revision, facts };
    const chain = msChain(state);
    if (!chain || msPrefixViolation(facts, chain.input))
      return { status: "REFUSED", reason: "MS_SOURCE_CONTEXT" };
    const plan = planMsActor(state, chain.cf.key, chain.c);
    if (
      !plan.ok ||
      !canonicalEqual(q, plan.value.issue) ||
      instructions !== MS_ACTOR_INSTRUCTION ||
      Buffer.compare(Buffer.from(bytes), plan.value.bytes) !== 0
    )
      return { status: "REFUSED", reason: "MS_DELIVERY_BYTES" };
    const opened = await this.#outbox.create("started:" + attempt, {
      issue,
      task_id: q.task_id,
      input_hash: q.input_hash,
    });
    if (!opened.ok) return { status: "UNKNOWN", reason: "MS_STARTED_UNAVAILABLE" };
    let run: { raw: Uint8Array; context_manifest_hash: string };
    try {
      run = await this.#driver.run({ phase: "ACTOR", instructions, producerInput: bytes });
    } catch {
      return { status: "UNKNOWN", reason: "MS_DRIVER_UNKNOWN" };
    }
    if (
      run.raw.length > RAW_RESPONSE_MAX_BYTES ||
      !/^[0-9a-f]{64}$/.test(run.context_manifest_hash)
    ) {
      await this.#outbox.create("malformed:" + attempt, {
        raw_base64: Buffer.from(run.raw).toString("base64"),
        raw_response_hash: sha256Bytes(run.raw),
        reported_manifest:
          typeof run.context_manifest_hash === "string" ? run.context_manifest_hash : null,
      });
      return { status: "UNKNOWN", reason: "MS_RETURN_UNSIGNABLE" };
    }
    const body = {
      format: "immortalis-ms-actor-runner-result" as const,
      format_version: 1 as const,
      runner_id: q.runner.runner_id,
      key_id: q.runner.key_id,
      campaign_id: campaign,
      world_id: q.world_id,
      locus_id: q.locus_id,
      setup_id: q.setup_id,
      phase: "ACTOR" as const,
      task_id: q.task_id,
      reservation: issue,
      completion: q.completion,
      input_hash: q.input_hash,
      instruction_hash: q.runner.instruction_hash,
      driver_id: q.runner.driver_id,
      driver_config_hash: q.runner.driver_config_hash,
      context_manifest_hash: run.context_manifest_hash,
      parser: q.parser,
      raw_response_hash: sha256Bytes(run.raw),
    };
    const envelope = ActorSignedEnvelopeSchema.parse({
      body,
      signature: sign(null, Buffer.from(canonicalJson(body)), this.#key).toString("base64"),
    });
    await this.#outbox.create("result:" + attempt, {
      raw_base64: Buffer.from(run.raw).toString("base64"),
      envelope,
    });
    return { status: "RESPONDED", raw: run.raw, envelope };
  }
}
