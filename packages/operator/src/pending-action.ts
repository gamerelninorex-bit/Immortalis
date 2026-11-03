import { createHash } from "node:crypto";
import { z } from "zod";
import {
  EntityId,
  Id,
  PinSchema,
  Sha256,
  Text,
  canonicalJson,
  fail,
  isReservedEvidenceIdentity,
  ok,
  type Result,
} from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import { ProtectedStore } from "./protected-store.ts";

/**
 * The campaign-private PendingActionGrantStore (Initial Locality Bootstrap v0.9, "Delayed Action Contract").
 *
 * It holds the player's ORIGINAL later request - "gather N logs", said while setup was still running - so a carried-out continuation can
 * act on exactly that request once its preconditions hold, and on nothing else. It is WORKFLOW AUTHORITY, never canon: it is strict,
 * versioned, HMAC-authenticated and atomically durable (the common `ProtectedStore`); an active record is never evicted as if it were
 * completed; its loss or corruption can block workflow authority but never invalidates a canonical world-journal load.
 *
 * One pending intent and its delayed grant live in ONE record, so the two can never disagree after a crash. The intent says WHAT was
 * asked and what was bound; the grant says whether, and for how long, that request may still be acted on:
 *
 *   ISSUED -> DISPATCHING -> CONSUMED          the one live path (dispatch_ref is allocated once and never reused)
 *   ISSUED | DISPATCHING -> REVOKED | EXPIRED | REPLACED       a tombstone, retained forever, never relaunched
 *
 * The retained deadline is the ORIGINAL request's verified access-token expiry (`expires_at_ms`): it is transport-authority expiry, not
 * canonical game time, it is captured by trusted intake from the OAuth verifier (never a caller argument), a refresh never extends it,
 * and no bearer token is persisted.
 */
export const PENDING_SETUP_FORMAT = "immortalis-pending-setup";
export const PENDING_ACTION_STORE_FORMAT = "immortalis-pending-action";

export const PAUSE_REASONS = [
  "AMBIGUOUS_INTENT",
  "UNSUPPORTED_ACTION",
  "AUTHORITY_UNRESOLVED",
  "PC_OR_TARGET_CHANGED",
  "NONROUTINE_CONSEQUENCE",
  "FOREIGN_BASIS_CHANGED",
  "ANOTHER_ACT_OPEN",
  "OUTCOME_UNKNOWN",
  "AUTHORIZATION_EXPIRED",
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];
/** pauses a later qualifying live continuation may lift once its cause is gone; every other pause is terminal for this request */
const LIFTABLE: ReadonlySet<PauseReason> = new Set([
  "AUTHORITY_UNRESOLVED",
  "PC_OR_TARGET_CHANGED",
  "FOREIGN_BASIS_CHANGED",
  "ANOTHER_ACT_OPEN",
]);

const PositiveSafe = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const NonNegSafe = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const UNTIL = z.enum(["start", "complete"]);

/** Filled ONCE from the trusted installed Scenario and the owners' facts at authorized handover; persisted whole before dispatch. */
export const ActionBindingSchema = z.strictObject({
  scenario_hash: Sha256,
  pc_id: EntityId,
  world_id: EntityId,
  locus_id: EntityId,
  source: PinSchema,
  reserve: PinSchema,
  mechanism: PinSchema,
  basis: PinSchema,
  quantity_unit: Id,
  amount: PositiveSafe,
  until: UNTIL,
  as_of_head: Id,
});
export type ActionBinding = z.infer<typeof ActionBindingSchema>;

export const PendingIntentSchema = z.strictObject({
  format: z.literal(PENDING_SETUP_FORMAT),
  format_version: z.literal(1),
  campaign_id: Id,
  request_id: Id,
  client: Id,
  oauth_grant: Id,
  original_message: z.strictObject({
    source_ref: Id,
    utterance: Text,
    proof_hash: Sha256,
    grade: z.enum(["ORIGINAL_MESSAGE_VERIFIED", "TOOL_CALL_ONLY"]),
  }),
  interpretation: z.strictObject({
    kind: z.enum(["SUPPORTED_SITE_COLLECTION", "PHYSICAL_PICKUP_UNSUPPORTED", "AMBIGUOUS"]),
    evidence_quotes: z.array(Text).max(8),
    method: z.literal("GM_INTENT_V1"),
  }),
  scope: z.strictObject({
    pc_id: EntityId,
    world_id: EntityId,
    locus_id: EntityId,
    source: PinSchema,
    amount: PositiveSafe,
    until: UNTIL,
    risk_class: z.literal("ROUTINE_UNOPPOSED_SITE_COLLECTION"),
  }),
  baseline: z.array(PinSchema).max(64),
  binding: ActionBindingSchema.nullable(),
  grant_id: Id,
  phase: z.enum(["PENDING_SETUP", "PAUSED", "HANDOVER", "TERMINAL", "CANCELLED", "REPLACED"]),
  pause: z.enum(PAUSE_REASONS).nullable(),
  disclosure_delivered: z.boolean(),
  dispatch_ref: Id.nullable(),
  run_ref: Id.nullable(),
  operator_intent_ref: Id.nullable(),
  act_id: Id.nullable(),
  expires_at_ms: NonNegSafe,
  revision: NonNegSafe,
});
export type PendingIntent = z.infer<typeof PendingIntentSchema>;

export const GRANT_STATES = [
  "ISSUED",
  "DISPATCHING",
  "CONSUMED",
  "REVOKED",
  "REPLACED",
  "EXPIRED",
] as const;
export type GrantState = (typeof GRANT_STATES)[number];

export const DelayedGrantSchema = z.strictObject({
  grant_id: Id,
  campaign_id: Id,
  client: Id,
  oauth_grant: Id,
  request_id: Id,
  intent_hash: Sha256,
  scope_hash: Sha256,
  binding_hash: Sha256.nullable(),
  authorization_version: NonNegSafe,
  state: z.enum(GRANT_STATES),
  dispatch_ref: Id.nullable(),
  run_ref: Id.nullable(),
  operator_intent_ref: Id.nullable(),
  act_id: Id.nullable(),
  expires_at_ms: NonNegSafe,
  revision: NonNegSafe,
});
export type DelayedGrant = z.infer<typeof DelayedGrantSchema>;

const sha = (v: unknown): string =>
  createHash("sha256").update(canonicalJson(v), "utf8").digest("hex");
export const intentHashOf = (i: PendingIntent): string =>
  sha({
    campaign_id: i.campaign_id,
    request_id: i.request_id,
    client: i.client,
    oauth_grant: i.oauth_grant,
    original_message: i.original_message,
    interpretation: i.interpretation,
  });
export const scopeHashOf = (i: PendingIntent): string => sha(i.scope);
export const bindingHashOf = (b: ActionBinding): string => sha(b);
export const grantIdOf = (campaign: string, client: string, oauthGrant: string, request: string) =>
  `grant-${sha({ campaign_id: campaign, client, oauth_grant: oauthGrant, request_id: request }).slice(0, 32)}`;
/** allocated ONCE per grant and reused on every resume: a new grant, never a new dispatch_ref, is the only way to a second one */
export const dispatchRefOf = (grantId: string): string =>
  `dispatch-${sha({ grant_id: grantId }).slice(0, 32)}`;

/** One atomic record: the intent and its grant can never disagree after a crash. */
export const PendingActionRecordSchema = z
  .strictObject({ intent: PendingIntentSchema, grant: DelayedGrantSchema })
  .superRefine(({ intent: i, grant: g }, ctx) => {
    const bad = (m: string) => ctx.addIssue({ code: "custom", message: m });
    if (
      g.campaign_id !== i.campaign_id ||
      g.client !== i.client ||
      g.oauth_grant !== i.oauth_grant ||
      g.request_id !== i.request_id ||
      g.grant_id !== i.grant_id
    )
      bad("the grant is not this intent's grant");
    if (g.intent_hash !== intentHashOf(i) || g.scope_hash !== scopeHashOf(i))
      bad("the grant's hashes are not this intent's");
    if ((g.binding_hash === null) !== (i.binding === null)) bad("the binding and its hash agree");
    if (i.binding && g.binding_hash !== bindingHashOf(i.binding)) bad("the binding hash is exact");
    if (
      g.dispatch_ref !== i.dispatch_ref ||
      g.run_ref !== i.run_ref ||
      g.operator_intent_ref !== i.operator_intent_ref ||
      g.act_id !== i.act_id ||
      g.expires_at_ms !== i.expires_at_ms ||
      g.revision !== i.revision
    )
      bad("the intent and its grant carry the same link and revision");
    if ((i.phase === "PAUSED") !== (i.pause !== null)) bad("a pause is exactly a PAUSED phase");
    if (i.binding) {
      if (
        i.binding.pc_id !== i.scope.pc_id ||
        i.binding.world_id !== i.scope.world_id ||
        i.binding.locus_id !== i.scope.locus_id ||
        i.binding.amount !== i.scope.amount ||
        i.binding.until !== i.scope.until ||
        i.binding.source.fact_key !== i.scope.source.fact_key
      )
        bad("the binding is the retained scope, nothing wider");
    }
    if (g.state === "CONSUMED" && (i.act_id === null || i.operator_intent_ref === null))
      bad("a consumed grant names the retained intent and the canonical act");
    if (g.state === "DISPATCHING" && g.dispatch_ref === null)
      bad("a dispatching grant carries its dispatch_ref");
    if (g.state === "ISSUED" && (g.dispatch_ref !== null || g.run_ref !== null))
      bad("an unissued dispatch carries no dispatch_ref or run");
  });
export type PendingActionRecord = z.infer<typeof PendingActionRecordSchema>;

export type PendingErrorCode =
  | "PENDING_INVALID"
  | "PENDING_AUTHORITY"
  | "PENDING_EXISTS"
  | "PENDING_NOT_FOUND"
  | "PENDING_STATE"
  | "PENDING_EXPIRED"
  | "PENDING_STORE";

/** What trusted intake obtained about the later original request. In production no proof method is selected: it is UNRESOLVED. */
export interface OriginalMessageEvidence {
  readonly source_ref: string;
  readonly utterance: string;
  readonly proof_hash: string;
  readonly grade: "ORIGINAL_MESSAGE_VERIFIED" | "TOOL_CALL_ONLY";
}
export interface OriginalMessageVerifier {
  readonly verify: (request: {
    readonly client: string;
    readonly oauth_grant: string;
    readonly request_ref: string;
  }) => Promise<Result<OriginalMessageEvidence, "ORIGINAL_MESSAGE_UNRESOLVED">>;
}
/** The production verifier: there is no selected original-message method, so the actual unresolved-authority result is returned. */
export const UnavailableOriginalMessageVerifier: OriginalMessageVerifier = {
  verify: async () =>
    fail(
      "ORIGINAL_MESSAGE_UNRESOLVED",
      "no original-message proof method is selected: a model-authored tool call is never original human wording",
    ),
};

export interface PendingIntake {
  readonly request_id: string;
  readonly client: string;
  readonly oauth_grant: string;
  readonly original_message: OriginalMessageEvidence;
  readonly interpretation: PendingIntent["interpretation"];
  readonly scope: PendingIntent["scope"];
  readonly baseline: PendingIntent["baseline"];
  /** the original request's verified access-token expiry, from the OAuth verifier (a trusted context field) */
  readonly access_expires_at_ms: number;
}

export interface PendingPolicy {
  /** production REJECTs the reserved fixture namespace; the T1 testkit REQUIREs it */
  readonly syntheticEvidence: "REJECT" | "REQUIRE";
}

const terminalPhase = (p: PendingIntent["phase"]): boolean =>
  p === "TERMINAL" || p === "CANCELLED" || p === "REPLACED";

export class PendingActionGrantStore {
  readonly #store: ProtectedStore;
  readonly #campaign: string;
  readonly #now: () => number;
  readonly #policy: PendingPolicy;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(params: {
    readonly campaignId: string;
    readonly dir: string;
    /** the campaign-lane secret supplied by trusted startup (at least 32 bytes) */
    readonly macKey: Buffer;
    readonly now: () => number;
    readonly policy: PendingPolicy;
    readonly fs?: FsOps;
  }) {
    this.#campaign = params.campaignId;
    this.#now = params.now;
    this.#policy = params.policy;
    this.#store = new ProtectedStore({
      dir: params.dir,
      format: PENDING_ACTION_STORE_FORMAT,
      macKey: params.macKey,
      ...(params.fs ? { fs: params.fs } : {}),
    });
  }

  /** the per-campaign dispatch lock: every read-modify-write of a record is serialized through it */
  #serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(run);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  #name = (requestId: string): string => `pending/${requestId}`;

  async #load(requestId: string): Promise<Result<PendingActionRecord | null, PendingErrorCode>> {
    const got = await this.#store.get(this.#name(requestId));
    if (!got.ok)
      return fail(
        "PENDING_STORE",
        "the pending-action record cannot be read or fails its integrity check",
      );
    if (got.value === null) return ok(null);
    const parsed = PendingActionRecordSchema.safeParse(got.value);
    if (!parsed.success || parsed.data.intent.campaign_id !== this.#campaign)
      return fail("PENDING_STORE", "the pending-action record is not exactly this store's record");
    return ok(parsed.data);
  }

  async get(requestId: string): Promise<Result<PendingActionRecord | null, PendingErrorCode>> {
    return this.#serial(() => this.#load(requestId));
  }

  /** Every record, or a closed failure: a skipped record could be a revocation or a tombstone, so one bad record fails the listing. */
  async list(): Promise<Result<readonly PendingActionRecord[], PendingErrorCode>> {
    return this.#serial(async () => {
      const all = await this.#store.all();
      if (!all.ok) return fail("PENDING_STORE", "the pending-action records cannot be listed");
      const out: PendingActionRecord[] = [];
      for (const { record } of all.value) {
        const parsed = PendingActionRecordSchema.safeParse(record);
        if (!parsed.success || parsed.data.intent.campaign_id !== this.#campaign)
          return fail(
            "PENDING_STORE",
            "a pending-action record is not exactly this store's record",
          );
        out.push(parsed.data);
      }
      return ok(out);
    });
  }

  /** The one live (non-terminal) pending request of an authorization, if any. */
  async liveFor(
    client: string,
    oauthGrant: string,
  ): Promise<Result<PendingActionRecord | null, PendingErrorCode>> {
    const all = await this.list();
    if (!all.ok) return all;
    return ok(
      all.value.find(
        (r) =>
          r.intent.client === client &&
          r.intent.oauth_grant === oauthGrant &&
          !terminalPhase(r.intent.phase),
      ) ?? null,
    );
  }

  /**
   * Retains the player's later request. An identical repeat (same request identity and content) is recognised and changes nothing;
   * the same identity with different content is refused. A TOOL_CALL_ONLY grade cannot support a live exact-word intent claim, so it
   * is retained PAUSED(AUTHORITY_UNRESOLVED) and can never be dispatched; an ambiguous or pickup reading is retained PAUSED too.
   */
  async intake(input: PendingIntake): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    const fixture = isReservedEvidenceIdentity(input.original_message.source_ref);
    if (this.#policy.syntheticEvidence === "REJECT" ? fixture : !fixture)
      return fail(
        "PENDING_AUTHORITY",
        this.#policy.syntheticEvidence === "REJECT"
          ? "synthetic fixture evidence is never accepted as an original-message proof"
          : "this fixture store accepts only labelled fixture evidence",
      );
    if (
      !Number.isSafeInteger(input.access_expires_at_ms) ||
      input.access_expires_at_ms <= this.#now()
    )
      return fail("PENDING_EXPIRED", "the request's own authority has already expired");
    const grantId = grantIdOf(this.#campaign, input.client, input.oauth_grant, input.request_id);
    const pause: PauseReason | null =
      input.original_message.grade !== "ORIGINAL_MESSAGE_VERIFIED"
        ? "AUTHORITY_UNRESOLVED"
        : input.interpretation.kind === "AMBIGUOUS"
          ? "AMBIGUOUS_INTENT"
          : input.interpretation.kind === "PHYSICAL_PICKUP_UNSUPPORTED"
            ? "UNSUPPORTED_ACTION"
            : null;
    const intent: PendingIntent = {
      format: PENDING_SETUP_FORMAT,
      format_version: 1,
      campaign_id: this.#campaign,
      request_id: input.request_id,
      client: input.client,
      oauth_grant: input.oauth_grant,
      original_message: { ...input.original_message },
      interpretation: input.interpretation,
      scope: input.scope,
      baseline: [...input.baseline],
      binding: null,
      grant_id: grantId,
      phase: pause === null ? "PENDING_SETUP" : "PAUSED",
      pause,
      disclosure_delivered: false,
      dispatch_ref: null,
      run_ref: null,
      operator_intent_ref: null,
      act_id: null,
      expires_at_ms: input.access_expires_at_ms,
      revision: 0,
    };
    const grant: DelayedGrant = {
      grant_id: grantId,
      campaign_id: this.#campaign,
      client: input.client,
      oauth_grant: input.oauth_grant,
      request_id: input.request_id,
      intent_hash: intentHashOf(intent),
      scope_hash: scopeHashOf(intent),
      binding_hash: null,
      authorization_version: 0,
      state: "ISSUED",
      dispatch_ref: null,
      run_ref: null,
      operator_intent_ref: null,
      act_id: null,
      expires_at_ms: input.access_expires_at_ms,
      revision: 0,
    };
    const record = PendingActionRecordSchema.safeParse({ intent, grant });
    if (!record.success)
      return fail("PENDING_INVALID", "the pending request is not a valid record");
    return this.#serial(async () => {
      const existing = await this.#load(input.request_id);
      if (!existing.ok) return existing;
      if (existing.value) {
        // idempotent repeat of the SAME request; a changed one under the same identity is never merged
        return existing.value.grant.intent_hash === grant.intent_hash &&
          existing.value.grant.scope_hash === grant.scope_hash
          ? ok(existing.value)
          : fail(
              "PENDING_EXISTS",
              "that request identity already holds a different pending request",
            );
      }
      const created = await this.#store.create(this.#name(input.request_id), record.data);
      return created.ok
        ? ok(record.data)
        : fail("PENDING_STORE", "the pending request could not be retained durably");
    });
  }

  /** Applies one change under the dispatch lock: the immutable parts are re-proven and the revision advances by exactly one. */
  async #mutate(
    requestId: string,
    change: (r: PendingActionRecord) => Result<PendingActionRecord, PendingErrorCode>,
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#serial(async () => {
      const loaded = await this.#load(requestId);
      if (!loaded.ok) return loaded;
      if (loaded.value === null) return fail("PENDING_NOT_FOUND", "no such pending request");
      const before = loaded.value;
      const changed = change(before);
      if (!changed.ok) return changed;
      const next = changed.value;
      if (next === before) return ok(before); // nothing to write (an idempotent repeat)
      const revision = before.intent.revision + 1;
      const record = PendingActionRecordSchema.safeParse({
        intent: { ...next.intent, revision },
        grant: { ...next.grant, revision },
      });
      if (
        !record.success ||
        record.data.grant.intent_hash !== before.grant.intent_hash ||
        record.data.grant.scope_hash !== before.grant.scope_hash ||
        record.data.intent.expires_at_ms !== before.intent.expires_at_ms
      )
        return fail("PENDING_INVALID", "the change is not a lawful change of this record");
      const written = await this.#store.replace(this.#name(requestId), record.data);
      return written.ok
        ? ok(record.data)
        : fail("PENDING_STORE", "the pending request could not be retained durably");
    });
  }

  /** The exact site-Reserve disclosure was delivered to the player (required before a supported dispatch and at result). */
  deliverDisclosure(requestId: string): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) =>
      r.intent.disclosure_delivered
        ? ok(r)
        : terminalPhase(r.intent.phase)
          ? fail("PENDING_STATE", "that pending request is finished")
          : ok({ ...r, intent: { ...r.intent, disclosure_delivered: true } }),
    );
  }

  /**
   * Fills the complete ActionBinding ONCE. An identical repeat is recognised; a different binding NEVER silently rebinds - the request
   * pauses FOREIGN_BASIS_CHANGED and a later qualifying continuation must decide against the retained original scope.
   */
  bind(
    requestId: string,
    binding: ActionBinding,
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (terminalPhase(r.intent.phase))
        return fail("PENDING_STATE", "that pending request is finished");
      if (r.grant.state !== "ISSUED" && r.grant.state !== "DISPATCHING")
        return fail("PENDING_STATE", "that grant is no longer live");
      if (r.intent.binding !== null)
        return bindingHashOf(r.intent.binding) === bindingHashOf(binding)
          ? ok(r)
          : ok({
              ...r,
              intent: { ...r.intent, phase: "PAUSED", pause: "FOREIGN_BASIS_CHANGED" },
            });
      return ok({
        intent: { ...r.intent, binding },
        grant: {
          ...r.grant,
          binding_hash: bindingHashOf(binding),
          authorization_version: r.grant.authorization_version + 1,
        },
      });
    });
  }

  pause(
    requestId: string,
    reason: PauseReason,
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (terminalPhase(r.intent.phase))
        return fail("PENDING_STATE", "that pending request is finished");
      if (r.intent.phase === "PAUSED" && r.intent.pause === reason) return ok(r);
      return ok({ ...r, intent: { ...r.intent, phase: "PAUSED", pause: reason } });
    });
  }

  /**
   * ISSUED -> DISPATCHING under the dispatch lock: persists the grant state, the unique dispatch_ref and the complete binding BEFORE
   * any command may start. A request already DISPATCHING resumes the SAME dispatch_ref. Refused (nothing is allocated) unless the
   * request is a verified, disclosed, supported, bound, unexpired one. The caller has already checked the revocation ledger and holds
   * the live continuation; this store re-checks only what it owns.
   */
  beginDispatch(requestId: string): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      const { intent: i, grant: g } = r;
      if (terminalPhase(i.phase)) return fail("PENDING_STATE", "that pending request is finished");
      if (g.state !== "ISSUED" && g.state !== "DISPATCHING")
        return fail("PENDING_STATE", `that grant is ${g.state} and cannot dispatch`);
      if (g.expires_at_ms <= this.#now())
        return fail("PENDING_EXPIRED", "the original request's authority has expired");
      if (i.original_message.grade !== "ORIGINAL_MESSAGE_VERIFIED")
        return fail(
          "PENDING_AUTHORITY",
          "a tool-call-only request cannot support a live intent claim",
        );
      if (i.interpretation.kind !== "SUPPORTED_SITE_COLLECTION")
        return fail("PENDING_STATE", "only a supported site collection can be dispatched");
      if (i.phase === "PAUSED" && (i.pause === null || !LIFTABLE.has(i.pause)))
        return fail(
          "PENDING_STATE",
          `this request is paused (${i.pause}) and cannot be dispatched`,
        );
      if (!i.disclosure_delivered)
        return fail("PENDING_STATE", "the site-Reserve disclosure has not been delivered");
      if (i.binding === null || g.binding_hash === null)
        return fail("PENDING_STATE", "the action is not bound");
      const dispatchRef = g.dispatch_ref ?? dispatchRefOf(g.grant_id);
      if (g.state === "DISPATCHING" && i.phase === "HANDOVER") return ok(r);
      return ok({
        intent: { ...i, phase: "HANDOVER", pause: null, dispatch_ref: dispatchRef },
        grant: { ...g, state: "DISPATCHING", dispatch_ref: dispatchRef },
      });
    });
  }

  /** The existing launch/recovery frame was persisted with this dispatch_ref; records which run it is (once). */
  recordLaunch(
    requestId: string,
    runRef: string,
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (r.grant.state !== "DISPATCHING")
        return fail("PENDING_STATE", "a launch is recorded only for a dispatching grant");
      if (r.intent.run_ref === runRef) return ok(r);
      if (r.intent.run_ref !== null)
        return fail("PENDING_STATE", "another run is already recorded for this dispatch");
      return ok({
        intent: { ...r.intent, run_ref: runRef },
        grant: { ...r.grant, run_ref: runRef },
      });
    });
  }

  /** Links the actual operator-minted retained intent (found by its dispatch_ref) and, once known, the canonical act. */
  linkIntent(
    requestId: string,
    link: { readonly operator_intent_ref: string; readonly act_id?: string },
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (r.grant.state !== "DISPATCHING" && r.grant.state !== "CONSUMED")
        return fail("PENDING_STATE", "an intent is linked only to a dispatching or consumed grant");
      const sameRef =
        r.intent.operator_intent_ref === null ||
        r.intent.operator_intent_ref === link.operator_intent_ref;
      const sameAct =
        link.act_id === undefined || r.intent.act_id === null || r.intent.act_id === link.act_id;
      if (!sameRef || !sameAct)
        return fail(
          "PENDING_STATE",
          "a different intent or act is already linked to this dispatch",
        );
      const act_id = link.act_id ?? r.intent.act_id;
      if (r.intent.operator_intent_ref === link.operator_intent_ref && r.intent.act_id === act_id)
        return ok(r);
      return ok({
        intent: { ...r.intent, operator_intent_ref: link.operator_intent_ref, act_id },
        grant: { ...r.grant, operator_intent_ref: link.operator_intent_ref, act_id },
      });
    });
  }

  /** Reads back the canonical act and marks the grant CONSUMED, idempotently. The adapter never allocates the act. */
  consume(
    requestId: string,
    actId: string,
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (r.grant.state === "CONSUMED")
        return r.intent.act_id === actId
          ? ok(r)
          : fail("PENDING_STATE", "that grant was consumed by a different act");
      if (r.grant.state !== "DISPATCHING" || r.intent.operator_intent_ref === null)
        return fail("PENDING_STATE", "only a dispatching, linked grant can be consumed");
      return ok({
        intent: { ...r.intent, phase: "TERMINAL", pause: null, act_id: actId },
        grant: { ...r.grant, state: "CONSUMED", act_id: actId },
      });
    });
  }

  /**
   * Cancellation or replacement BEFORE commitment revokes the grant and keeps the tombstone. Once a dispatch is under way (or an act
   * exists) this is refused: enrolled work stops only through the existing cessation, never through this store.
   */
  retire(
    requestId: string,
    how: "CANCELLED" | "REPLACED",
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (terminalPhase(r.intent.phase)) return ok(r);
      if (r.grant.state !== "ISSUED")
        return fail(
          "PENDING_STATE",
          "work already enrolled is stopped only by the existing cessation",
        );
      return ok({
        intent: { ...r.intent, phase: how, pause: null },
        grant: { ...r.grant, state: how === "CANCELLED" ? "REVOKED" : "REPLACED" },
      });
    });
  }

  /** The grant's authority ended (revoked or expired) with NO act committed: a tombstone, never relaunched. */
  endAuthority(
    requestId: string,
    how: "REVOKED" | "EXPIRED",
  ): Promise<Result<PendingActionRecord, PendingErrorCode>> {
    return this.#mutate(requestId, (r) => {
      if (r.grant.state === "CONSUMED" || r.intent.act_id !== null)
        return fail(
          "PENDING_STATE",
          "a committed act stands; the old authority only stops new continuation",
        );
      if (
        r.grant.state === "REVOKED" ||
        r.grant.state === "EXPIRED" ||
        r.grant.state === "REPLACED"
      )
        return ok(r);
      return ok({
        intent: {
          ...r.intent,
          phase: how === "EXPIRED" ? "PAUSED" : "CANCELLED",
          pause: how === "EXPIRED" ? "AUTHORIZATION_EXPIRED" : null,
        },
        grant: { ...r.grant, state: how },
      });
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The recovery decision (companion "Recovery table"), as a PURE function of durable facts.
// ---------------------------------------------------------------------------------------------------------------------

export interface DelayedRecoveryFacts {
  readonly now: number;
  readonly grant: Pick<
    DelayedGrant,
    "state" | "dispatch_ref" | "run_ref" | "operator_intent_ref" | "act_id" | "expires_at_ms"
  >;
  readonly authority: {
    /** the OAuth grant ledger's verdict for this client/grant */
    readonly oauth: "ISSUED" | "REVOKED" | "UNKNOWN" | "UNAVAILABLE";
    /** a NEW live player-scoped authenticated continuation request from the same client/grant is being served now */
    readonly liveContinuation: boolean;
  };
  readonly ledger: {
    /** the version-2 operator ledger was read intact and verified */
    readonly intact: boolean;
    /** how many COLLECTION intents the ledger holds under THIS dispatch_ref (the uniqueness invariant makes it 0 or 1) */
    readonly withDispatchRef: number;
    readonly intentIdWithDispatchRef: string | null;
    /** an open (CONFIRMED) collection exists that carries NO dispatch_ref (a legacy orphan or an unrelated direct attempt) */
    readonly openWithoutDispatchRef: boolean;
  };
  readonly run: {
    /** the launch/recovery frame carrying this dispatch_ref was persisted */
    readonly recorded: boolean;
    /** the run that frame names (the frame, not the grant's copy, is the first durable witness of a launch) */
    readonly run_ref?: string | null;
    readonly process: "ACTIVE" | "EXITED" | "UNKNOWN" | "NONE";
    /** the recovery slot of that run is settled (not unresolved) */
    readonly slotSettled: boolean;
  };
  /** the canonical act of the linked retained intent, once the owners hold it */
  readonly canonicalActId: string | null;
}

export type DelayedPlan =
  | {
      readonly action: "RESUME_SAME_DISPATCH";
      readonly dispatch_ref: string;
      readonly why: "LAUNCH_NOT_RECORDED" | "PROVEN_NO_EFFECT";
    }
  | { readonly action: "BEGIN_DISPATCH" }
  | { readonly action: "RECONCILE_RUN"; readonly run_ref: string }
  | { readonly action: "REBUILD_LINK"; readonly operator_intent_ref: string }
  /** the retained intent exists and is linked: present it to the unchanged gateway / reconcile it by its own identity, nothing new */
  | { readonly action: "RECONCILE_INTENT"; readonly operator_intent_ref: string }
  | {
      readonly action: "BIND_ACT";
      readonly act_id: string;
      /** whether CURRENT authority also allows continuing that act's goal (otherwise the historical act simply stands) */
      readonly continue_authorized: boolean;
    }
  | {
      readonly action: "NO_LAUNCH";
      readonly reason:
        "REVOKED" | "EXPIRED" | "AUTHORITY_UNAVAILABLE" | "NO_LIVE_CONTINUATION" | "FINISHED";
    }
  | { readonly action: "PAUSE"; readonly reason: PauseReason };

/**
 * The companion's recovery table, row by row. Nothing here is ever resolved by matching a quantity, a shape or "the latest" intent: a
 * dispatch is recognised only by its own dispatch_ref, and anything the facts cannot prove is OUTCOME_UNKNOWN for operator reconciliation.
 *
 * The formal NO-EFFECT predicate: the original launched process has exited, its recovery slot is settled, and an INTACT verified version-2
 * ledger holds zero COLLECTION records for that dispatch_ref. A missing or corrupt ledger, a lost response, a still-active process or an
 * unlinked legacy intent proves no such fact, and a timeout alone never does.
 */
export function planDelayedRecovery(f: DelayedRecoveryFacts): DelayedPlan {
  const authority =
    f.authority.oauth === "ISSUED" && f.now < f.grant.expires_at_ms
      ? ("VALID" as const)
      : f.authority.oauth === "UNAVAILABLE"
        ? ("UNAVAILABLE" as const)
        : f.authority.oauth !== "ISSUED"
          ? ("REVOKED" as const)
          : ("EXPIRED" as const);
  const blocked = (): DelayedPlan => ({
    action: "NO_LAUNCH",
    reason:
      authority === "VALID"
        ? "NO_LIVE_CONTINUATION"
        : authority === "UNAVAILABLE"
          ? "AUTHORITY_UNAVAILABLE"
          : authority === "REVOKED"
            ? "REVOKED"
            : "EXPIRED",
  });
  const mayAct = authority === "VALID" && f.authority.liveContinuation;

  // a canonical act for the linked retained intent: bind its REAL act_id; a historical act stays true whatever happened to the authority
  if (f.canonicalActId !== null)
    return { action: "BIND_ACT", act_id: f.canonicalActId, continue_authorized: mayAct };

  if (f.grant.state === "CONSUMED") return { action: "NO_LAUNCH", reason: "FINISHED" };
  if (f.grant.state === "REVOKED" || f.grant.state === "REPLACED")
    return { action: "NO_LAUNCH", reason: "REVOKED" };
  if (f.grant.state === "EXPIRED") return { action: "NO_LAUNCH", reason: "EXPIRED" };

  const runRef = f.run.run_ref ?? f.grant.run_ref;
  const dispatched = f.grant.dispatch_ref !== null && (f.run.recorded || f.grant.run_ref !== null);

  // a dispatch that could have had an effect, judged against a ledger that cannot be read, proves nothing
  if (!f.ledger.intact) {
    return dispatched || f.grant.operator_intent_ref !== null
      ? { action: "PAUSE", reason: "OUTCOME_UNKNOWN" }
      : blocked();
  }
  if (f.ledger.withDispatchRef > 1) return { action: "PAUSE", reason: "OUTCOME_UNKNOWN" };
  if (f.ledger.withDispatchRef === 1) {
    const intentId = f.ledger.intentIdWithDispatchRef;
    if (intentId === null) return { action: "PAUSE", reason: "OUTCOME_UNKNOWN" };
    // crash after the ledger record but before the optional link/index: rebuild ONLY from the exact dispatch_ref
    if (intentId !== f.grant.operator_intent_ref)
      return { action: "REBUILD_LINK", operator_intent_ref: intentId };
    if ((f.run.process === "ACTIVE" || f.run.process === "UNKNOWN") && runRef !== null)
      return { action: "RECONCILE_RUN", run_ref: runRef };
    return { action: "RECONCILE_INTENT", operator_intent_ref: intentId };
  }

  // no retained intent under this dispatch_ref
  if (f.grant.state === "ISSUED") return mayAct ? { action: "BEGIN_DISPATCH" } : blocked();
  // DISPATCHING from here
  if (!dispatched) {
    // launch not recorded: no command was authorized to start. A new qualifying live continuation resumes the SAME dispatch_ref.
    if (f.ledger.openWithoutDispatchRef) return { action: "PAUSE", reason: "ANOTHER_ACT_OPEN" };
    return mayAct
      ? {
          action: "RESUME_SAME_DISPATCH",
          dispatch_ref: f.grant.dispatch_ref!,
          why: "LAUNCH_NOT_RECORDED",
        }
      : blocked();
  }
  if (f.run.process === "ACTIVE" || f.run.process === "UNKNOWN") {
    // settle/reconcile that exact run; never start another and never match by quantity
    return runRef !== null
      ? { action: "RECONCILE_RUN", run_ref: runRef }
      : { action: "PAUSE", reason: "OUTCOME_UNKNOWN" };
  }
  if (f.run.process === "EXITED" && f.run.slotSettled) {
    // an intent that exists WITHOUT this dispatch_ref (a legacy orphan) is never adopted by shape
    if (f.ledger.openWithoutDispatchRef) return { action: "PAUSE", reason: "OUTCOME_UNKNOWN" };
    // proven no-effect: the same dispatch_ref resumes (V2 uniqueness prevents a second retained act)
    return mayAct
      ? {
          action: "RESUME_SAME_DISPATCH",
          dispatch_ref: f.grant.dispatch_ref!,
          why: "PROVEN_NO_EFFECT",
        }
      : blocked();
  }
  return { action: "PAUSE", reason: "OUTCOME_UNKNOWN" };
}
