import { createHash } from "node:crypto";
import { Id, Sha256, Text, canonicalJson, fail, ok, z, type Result } from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import { ProtectedStore } from "@immortalis/operator";
import type { ConfirmationVerb } from "../../../packages/operator/src/confirmation.ts";
import {
  issueRequestEvidence,
  type RequestEvidence,
} from "../../../packages/operator/src/request-evidence.ts";

/**
 * The QueuedSetupEditStore and its distinct capability (Initial Locality Bootstrap v0.9, "Queue command surface").
 *
 * While an initial-locality setup is running, the engine's FREEZE refuses ordinary writes to the world and the character. A legitimate
 * edit the player asks for in that window is not lost and is not applied behind their back: it is RETAINED here, exactly as authored,
 * and applied only after the freeze releases, by a NEW live authenticated `continue_queued_setup_edit` request - never by status reads,
 * background work or stored identity alone. The valid terminal setup result releases the freeze; it does not approve a queued change.
 *
 * REVISE_PC and REVISE_SETUP are internal QueuedSetupCommand tags, NOT shipped operator verbs: they are not added to OrdinaryVerb or
 * ConfirmationVerb by implication. REVISE_PC maps to the existing revise-original-character path (only its retained UNKEPT draft may be
 * revised); REVISE_SETUP maps to the existing propose-original-setting path (only an UNSEALED retained setup draft). They are delayed
 * dispatch mappings, not new canonical amendment mechanisms: a sealed, missing, changed or ineligible target returns a retained REJECTED
 * result with the owner's reason, and no target is substituted.
 *
 * The retained deadline is the ORIGINAL queued request's verified access-token expiry; a refresh never extends it. A long freeze or park
 * can exhaust it, in which case the entry becomes a REJECTED tombstone ("EXPIRED") and a new authored edit is required.
 */
export const QUEUED_SETUP_EDIT_FORMAT = "immortalis-queued-setup-edit";
export const QUEUED_COMMANDS = ["REVISE_PC", "REVISE_SETUP"] as const;
export type QueuedSetupCommand = (typeof QUEUED_COMMANDS)[number];

/** The existing confirmation boundary each queued command preserves for its complete revised subject. */
export const QUEUED_COMMAND_VERB: Readonly<Record<QueuedSetupCommand, ConfirmationVerb>> = {
  REVISE_PC: "keep-character",
  REVISE_SETUP: "establish-locality",
};

const NonNegSafe = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const QueuedSetupEditRecordSchema = z.strictObject({
  format: z.literal(QUEUED_SETUP_EDIT_FORMAT),
  format_version: z.literal(1),
  queue_id: Id,
  campaign_id: Id,
  client: Id,
  oauth_grant: Id,
  original_request_ref: Id,
  payload_hash: Sha256,
  retained_workflow_ref: Id,
  retained_revision: NonNegSafe,
  command: z.enum(QUEUED_COMMANDS),
  payload: z.record(z.string(), z.unknown()),
  expires_at_ms: NonNegSafe,
  phase: z.enum(["QUEUED", "APPLIED", "REJECTED", "CANCELLED"]),
  reason: Text.nullable(),
  revision: NonNegSafe,
});
export type QueuedSetupEditRecord = z.infer<typeof QueuedSetupEditRecordSchema>;

/** The hash of the canonical command, payload and TARGET binding: an altered payload, target or revision is another hash. */
export const queuedPayloadHash = (
  command: QueuedSetupCommand,
  payload: unknown,
  retainedWorkflowRef: string,
  retainedRevision: number,
): string =>
  createHash("sha256")
    .update(
      canonicalJson({
        command,
        payload,
        retained_workflow_ref: retainedWorkflowRef,
        retained_revision: retainedRevision,
      }),
      "utf8",
    )
    .digest("hex");

export type QueuedErrorCode =
  | "QUEUE_INVALID"
  | "QUEUE_EXISTS"
  | "QUEUE_NOT_FOUND"
  | "QUEUE_STATE"
  | "QUEUE_EXPIRED"
  | "QUEUE_STORE";

export interface QueuedEditIntake {
  readonly client: string;
  readonly oauth_grant: string;
  readonly original_request_ref: string;
  readonly command: QueuedSetupCommand;
  /** the exact argument branch the existing parser accepted for that command, retained whole */
  readonly payload: Record<string, unknown>;
  /** the retained unkept draft / unsealed setup this edit targets, and its revision when it was authored */
  readonly retained_workflow_ref: string;
  readonly retained_revision: number;
  /** the original queued request's verified access-token expiry, from the OAuth verifier */
  readonly access_expires_at_ms: number;
}

export class QueuedSetupEditStore {
  readonly #store: ProtectedStore;
  readonly #campaign: string;
  readonly #now: () => number;
  /** the existing strict parser of each command's argument branch (supplied by the adapter that owns those parsers) */
  readonly #valid: Readonly<
    Record<QueuedSetupCommand, (payload: Record<string, unknown>) => boolean>
  >;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(params: {
    readonly campaignId: string;
    readonly dir: string;
    readonly macKey: Buffer;
    readonly now: () => number;
    readonly validPayload: Readonly<
      Record<QueuedSetupCommand, (payload: Record<string, unknown>) => boolean>
    >;
    readonly fs?: FsOps;
  }) {
    this.#campaign = params.campaignId;
    this.#now = params.now;
    this.#valid = params.validPayload;
    this.#store = new ProtectedStore({
      dir: params.dir,
      format: QUEUED_SETUP_EDIT_FORMAT,
      macKey: params.macKey,
      ...(params.fs ? { fs: params.fs } : {}),
    });
  }

  #serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(run);
    this.#queue = result.catch(() => undefined);
    return result;
  }
  #name = (queueId: string): string => `queue/${queueId}`;

  async #load(queueId: string): Promise<Result<QueuedSetupEditRecord | null, QueuedErrorCode>> {
    const got = await this.#store.get(this.#name(queueId));
    if (!got.ok)
      return fail("QUEUE_STORE", "the queued edit cannot be read or fails its integrity check");
    if (got.value === null) return ok(null);
    const parsed = QueuedSetupEditRecordSchema.safeParse(got.value);
    return parsed.success &&
      parsed.data.campaign_id === this.#campaign &&
      parsed.data.queue_id === queueId &&
      parsed.data.payload_hash ===
        queuedPayloadHash(
          parsed.data.command,
          parsed.data.payload,
          parsed.data.retained_workflow_ref,
          parsed.data.retained_revision,
        )
      ? ok(parsed.data)
      : fail("QUEUE_STORE", "the queued edit is not exactly this store's record");
  }

  /** Retains a legitimate edit made during the freeze. An identical repeat is recognised; the identity is derived, never supplied. */
  async enqueue(input: QueuedEditIntake): Promise<Result<QueuedSetupEditRecord, QueuedErrorCode>> {
    if (!this.#valid[input.command]?.(input.payload))
      return fail("QUEUE_INVALID", "the payload is not the command's exact argument branch");
    if (
      !Number.isSafeInteger(input.access_expires_at_ms) ||
      input.access_expires_at_ms <= this.#now()
    )
      return fail("QUEUE_EXPIRED", "the request's own authority has already expired");
    const payload_hash = queuedPayloadHash(
      input.command,
      input.payload,
      input.retained_workflow_ref,
      input.retained_revision,
    );
    const queue_id = `queue-${createHash("sha256")
      .update(
        canonicalJson({
          campaign_id: this.#campaign,
          client: input.client,
          oauth_grant: input.oauth_grant,
          original_request_ref: input.original_request_ref,
          payload_hash,
        }),
        "utf8",
      )
      .digest("hex")
      .slice(0, 32)}`;
    const record = QueuedSetupEditRecordSchema.safeParse({
      format: QUEUED_SETUP_EDIT_FORMAT,
      format_version: 1,
      queue_id,
      campaign_id: this.#campaign,
      client: input.client,
      oauth_grant: input.oauth_grant,
      original_request_ref: input.original_request_ref,
      payload_hash,
      retained_workflow_ref: input.retained_workflow_ref,
      retained_revision: input.retained_revision,
      command: input.command,
      payload: input.payload,
      expires_at_ms: input.access_expires_at_ms,
      phase: "QUEUED",
      reason: null,
      revision: 0,
    });
    if (!record.success) return fail("QUEUE_INVALID", "the queued edit is not a valid record");
    return this.#serial(async () => {
      const existing = await this.#load(queue_id);
      if (!existing.ok) return existing;
      if (existing.value) return ok(existing.value); // the identical edit again: the original deadline stands
      const created = await this.#store.create(this.#name(queue_id), record.data);
      return created.ok
        ? ok(record.data)
        : fail("QUEUE_STORE", "the queued edit could not be retained durably");
    });
  }

  get(queueId: string): Promise<Result<QueuedSetupEditRecord | null, QueuedErrorCode>> {
    return this.#serial(() => this.#load(queueId));
  }

  /** Every record, or a closed failure: a skipped entry could be a tombstone. */
  list(): Promise<Result<readonly QueuedSetupEditRecord[], QueuedErrorCode>> {
    return this.#serial(async () => {
      const all = await this.#store.all();
      if (!all.ok) return fail("QUEUE_STORE", "the queued edits cannot be listed");
      const out: QueuedSetupEditRecord[] = [];
      for (const { name, record } of all.value) {
        const parsed = QueuedSetupEditRecordSchema.safeParse(record);
        if (
          !parsed.success ||
          parsed.data.campaign_id !== this.#campaign ||
          name !== this.#name(parsed.data.queue_id)
        )
          return fail("QUEUE_STORE", "a queued edit is not exactly this store's record");
        out.push(parsed.data);
      }
      return ok(out);
    });
  }

  async #terminate(
    queueId: string,
    phase: "APPLIED" | "REJECTED" | "CANCELLED",
    reason: string | null,
  ): Promise<Result<QueuedSetupEditRecord, QueuedErrorCode>> {
    return this.#serial(async () => {
      const loaded = await this.#load(queueId);
      if (!loaded.ok) return loaded;
      const before = loaded.value;
      if (before === null) return fail("QUEUE_NOT_FOUND", "no such queued edit");
      if (before.phase !== "QUEUED")
        return before.phase === phase && before.reason === reason
          ? ok(before)
          : fail("QUEUE_STATE", `that queued edit is already ${before.phase}`);
      const next = { ...before, phase, reason, revision: before.revision + 1 };
      const written = await this.#store.replace(this.#name(queueId), next);
      return written.ok
        ? ok(next)
        : fail("QUEUE_STORE", "the queued edit could not be retained durably");
    });
  }
  markApplied(queueId: string) {
    return this.#terminate(queueId, "APPLIED", null);
  }
  /** A retained REJECTED result carrying the owner's own reason (sealed / missing / changed / ineligible target, revoked, expired). */
  markRejected(queueId: string, reason: string) {
    return this.#terminate(queueId, "REJECTED", reason);
  }
  cancel(queueId: string) {
    return this.#terminate(queueId, "CANCELLED", null);
  }

  /** Every entry whose ORIGINAL deadline has passed becomes a REJECTED "EXPIRED" tombstone; nothing is refreshed or extended. */
  async sweepExpired(): Promise<Result<readonly string[], QueuedErrorCode>> {
    const all = await this.list();
    if (!all.ok) return all;
    const done: string[] = [];
    for (const r of all.value)
      if (r.phase === "QUEUED" && r.expires_at_ms <= this.#now()) {
        const t = await this.markRejected(r.queue_id, "EXPIRED");
        if (!t.ok) return t;
        done.push(r.queue_id);
      }
    return ok(done);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// QueuedSetupEditCapability: a SEPARATE, module-private, one-use authority. Not an OrdinaryAction (it has no active-PC-binding
// prerequisite and bindOrdinaryAction would be wrong before binding); never a serialized token, a model argument or a general flag.
// ---------------------------------------------------------------------------------------------------------------------

export interface QueuedSetupEditCapability {
  readonly queueId: string;
}

export interface QueuedCapabilityBinding {
  readonly campaignId: string;
  readonly client: string;
  readonly grant: string;
  readonly queueId: string;
  readonly command: QueuedSetupCommand;
  readonly payloadHash: string;
  readonly retainedWorkflowRef: string;
  readonly retainedRevision: number;
  readonly originalRequestRef: string;
  /** the original queued request's deadline (never extended by a refresh) */
  readonly expiresAtMs: number;
  /** the CURRENT live continuation request that mints and uses it */
  readonly live: { readonly session: string; readonly id: string };
}

const live = new WeakMap<QueuedSetupEditCapability, QueuedCapabilityBinding>();

/** TRUSTED ADAPTER ONLY, after the exact source/target/deadline/revocation checks under the queue dispatch lock. */
export function mintQueuedSetupEditCapability(
  b: QueuedCapabilityBinding,
): QueuedSetupEditCapability {
  const token = Object.freeze({ queueId: b.queueId });
  live.set(token, { ...b, live: { ...b.live } });
  return token;
}
export function revokeQueuedSetupEditCapability(token: QueuedSetupEditCapability): void {
  live.delete(token);
}

/** True at most once for the capability, and only for exactly the binding it was minted for. A FAILED use burns it too. */
function consumeQueued(
  token: QueuedSetupEditCapability,
  expect: QueuedCapabilityBinding,
  now: number,
): boolean {
  const b = live.get(token);
  live.delete(token);
  return !!(
    b &&
    b.campaignId === expect.campaignId &&
    b.client === expect.client &&
    b.grant === expect.grant &&
    b.queueId === expect.queueId &&
    b.command === expect.command &&
    b.payloadHash === expect.payloadHash &&
    b.retainedWorkflowRef === expect.retainedWorkflowRef &&
    b.retainedRevision === expect.retainedRevision &&
    b.originalRequestRef === expect.originalRequestRef &&
    b.expiresAtMs === expect.expiresAtMs &&
    b.live.session === expect.live.session &&
    b.live.id === expect.live.id &&
    now < b.expiresAtMs
  );
}

/**
 * The trusted requestQueuedSetupAuthorization adapter. It consumes the capability, revalidates the retained authored command against
 * the stored record, and only then issues exact ONE-USE request evidence for the existing confirmation subject the command preserves
 * (the complete revised character mirror for REVISE_PC; the complete proposed document for REVISE_SETUP). The evidence asserts a
 * transport-authenticated request and never a human-review acceptance: the existing owner, fidelity and meaning checks still decide, and a
 * changed interpretation that needs NEW authorship refuses here rather than silently consuming old authority. It is NOT
 * requestOrdinaryConfirmation, whose four ordinary verbs and capability semantics are unchanged.
 */
export function requestQueuedSetupAuthorization(params: {
  readonly capability: QueuedSetupEditCapability;
  /** the record exactly as the store holds it now */
  readonly record: QueuedSetupEditRecord;
  readonly live: { readonly session: string; readonly id: string };
  readonly now: number;
  /** what the existing run is asking to have authorized */
  readonly asked: { readonly verb: ConfirmationVerb; readonly subject: string };
}): RequestEvidence | null {
  const { record: r } = params;
  const consumed = consumeQueued(
    params.capability,
    {
      campaignId: r.campaign_id,
      client: r.client,
      grant: r.oauth_grant,
      queueId: r.queue_id,
      command: r.command,
      payloadHash: r.payload_hash,
      retainedWorkflowRef: r.retained_workflow_ref,
      retainedRevision: r.retained_revision,
      originalRequestRef: r.original_request_ref,
      expiresAtMs: r.expires_at_ms,
      live: params.live,
    },
    params.now,
  );
  if (
    !consumed ||
    r.phase !== "QUEUED" ||
    r.payload_hash !==
      queuedPayloadHash(r.command, r.payload, r.retained_workflow_ref, r.retained_revision) ||
    params.asked.verb !== QUEUED_COMMAND_VERB[r.command]
  )
    return null;
  return issueRequestEvidence(params.asked.verb, params.asked.subject);
}
