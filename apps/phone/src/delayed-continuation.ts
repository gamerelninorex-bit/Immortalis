import { fail, ok, type Result } from "@immortalis/contracts";
import {
  PendingActionGrantStore,
  planDelayedRecovery,
  type ActionBinding,
  type DelayedRecoveryFacts,
  type OriginalMessageVerifier,
  type PendingActionRecord,
  type PendingIntake,
  type PendingErrorCode,
} from "./pending-action.ts";
import {
  QueuedSetupEditStore,
  mintQueuedSetupEditCapability,
  revokeQueuedSetupEditCapability,
  type QueuedSetupEditRecord,
} from "./queued-setup.ts";
import type { readActionBinding, readDispatchLink } from "./collection-recovery.ts";
import type { PhoneConfig } from "./config.ts";
import type { GoalCoordinator } from "./goal.ts";
import type { ToolContext, ToolResult } from "./mcp-http.ts";
import type { GrantStatus } from "./oauth-ledger.ts";
import type { PendingOperation } from "./recovery.ts";
import type { PlayerRuns } from "./runs.ts";
import type { Scenario } from "./scenario.ts";
import { sha256Of } from "./scenario-hash.ts";

/**
 * The two CLOSED mutating continuation tools of the delayed-action path (Initial Locality Bootstrap v0.9, "Delayed Action Contract"):
 * `continue_pending_goal({request_id})` and `continue_queued_setup_edit({queue_id})`. Each takes ONE identity and nothing else - no
 * target, amount, source or payload override - and each acts ONLY on a NEW live, player-scoped, authenticated request from the SAME
 * client and OAuth grant that authored the retained request. READY/status reads, background tasks and stored identity alone never
 * dispatch. The tools hold no authority of their own: they re-verify the current token, the revocation ledger, the original deadline,
 * the exact retained source/interpretation/disclosure/binding and every current owner prerequisite, and then mint the EXISTING one-shot
 * capability from that live request. If issuance fails they return, with no console fallback, challenge or synthetic answer.
 */

/** The exact site-Reserve disclosure: delivered before a supported dispatch, and again at the result. Recorded, never paraphrased. */
export const SITE_RESERVE_DISCLOSURE =
  "Collection credits the site's Reserve; it does not put the log in your hands or let you carry it.";

export interface DelayedDeps {
  readonly config: PhoneConfig;
  readonly now: () => number;
  readonly grants: PendingActionGrantStore;
  readonly queue: QueuedSetupEditStore;
  /** the authoritative OAuth grant ledger's verdict (UNAVAILABLE for a missing or corrupt initialised ledger) */
  readonly oauthStatus: (client: string, grant: string) => GrantStatus;
  readonly scenario: () => Scenario | null;
  readonly readBinding: typeof readActionBinding;
  readonly readLink: typeof readDispatchLink;
  /** the persisted launch/recovery frame (null when none) */
  readonly pendingFrame: () => PendingOperation | null;
  /** is the player lane's run slot carrying THIS run right now? */
  readonly runActive: (runId: string) => boolean;
  readonly goal: GoalCoordinator;
  readonly runs: PlayerRuns;
  /** has the locality's initial setup released its freeze (a Completion or a valid terminal Disposition)? `null` = cannot be established */
  readonly freezeReleased: () => Promise<boolean | null>;
  /** is the retained target of a queued edit still the unsealed draft the edit was authored against? */
  readonly queuedTarget: (
    r: QueuedSetupEditRecord,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** the strict argument branches the queued edit retained, in the shape the existing runs take */
  readonly runQueued: (
    r: QueuedSetupEditRecord,
    ctx: ToolContext,
    queued: QueuedAuthorization,
  ) => Promise<ToolResult>;
}

/** The queue-source/target binding the trusted request-commitment path consumes: the capability, the retained record, the live request. */
export interface QueuedAuthorization {
  readonly capability: ReturnType<typeof mintQueuedSetupEditCapability>;
  readonly record: QueuedSetupEditRecord;
  readonly live: { readonly session: string; readonly id: string };
  readonly now: () => number;
}

const text = (t: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});
const asJson = (v: unknown, isError = false): ToolResult =>
  text(JSON.stringify(v, null, 2), isError);
const onlyKeys = (args: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(args).every((k) => allowed.includes(k));
const OPAQUE_ID = /^[\x21-\x7e]{1,200}$/;

// -- trusted intake of the later original request -----------------------------------------------------------------------------------

/**
 * Retains the player's later original request through the trusted intake. The proof comes ONLY from the OriginalMessageVerifier: in
 * production no proof method is selected, so this returns the actual unresolved-authority result and nothing is retained; a T1 test
 * supplies a labelled fixture verifier. A model-authored tool argument is never original human wording.
 */
export async function acceptPendingRequest(
  d: Pick<DelayedDeps, "grants">,
  verifier: OriginalMessageVerifier,
  request: {
    readonly request_id: string;
    readonly client: string;
    readonly oauth_grant: string;
    readonly interpretation: PendingIntake["interpretation"];
    readonly scope: PendingIntake["scope"];
    readonly baseline: PendingIntake["baseline"];
    readonly access_expires_at_ms: number | undefined;
  },
): Promise<
  Result<
    { record: PendingActionRecord; disclosure: string },
    PendingErrorCode | "ORIGINAL_MESSAGE_UNRESOLVED"
  >
> {
  if (request.access_expires_at_ms === undefined)
    return fail("PENDING_EXPIRED", "the request's own authority expiry is not available");
  const proof = await verifier.verify({
    client: request.client,
    oauth_grant: request.oauth_grant,
    request_ref: request.request_id,
  });
  if (!proof.ok) return proof;
  const retained = await d.grants.intake({
    request_id: request.request_id,
    client: request.client,
    oauth_grant: request.oauth_grant,
    original_message: proof.value,
    interpretation: request.interpretation,
    scope: request.scope,
    baseline: request.baseline,
    access_expires_at_ms: request.access_expires_at_ms,
  });
  if (!retained.ok) return retained;
  // the exact disclosure is delivered by the caller's reply; it is recorded as delivered only once this function returns it
  const disclosed = await d.grants.deliverDisclosure(request.request_id);
  return disclosed.ok
    ? ok({ record: disclosed.value, disclosure: SITE_RESERVE_DISCLOSURE })
    : disclosed;
}

// -- continue_pending_goal ----------------------------------------------------------------------------------------------------------

/** pauses a later qualifying live continuation may lift once the cause is gone (every other pause is final for the request) */
const LIFTABLE_PAUSES: ReadonlySet<string> = new Set([
  "AUTHORITY_UNRESOLVED",
  "PC_OR_TARGET_CHANGED",
  "FOREIGN_BASIS_CHANGED",
  "ANOTHER_ACT_OPEN",
]);
const SAME_BINDING: readonly (keyof ActionBinding)[] = [
  "scenario_hash",
  "pc_id",
  "world_id",
  "locus_id",
  "source",
  "reserve",
  "mechanism",
  "basis",
  "quantity_unit",
  "amount",
  "until",
];
/** a binding is the same if everything but the moving head is the same; a changed scenario, pin or scope never silently rebinds */
const sameBinding = (a: ActionBinding, b: ActionBinding): boolean =>
  SAME_BINDING.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

export async function continuePendingGoal(
  d: DelayedDeps,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const id = args["request_id"];
  if (!onlyKeys(args, ["request_id"]) || typeof id !== "string" || !OPAQUE_ID.test(id))
    return text("this tool takes exactly one request_id", true);
  // a NEW live, player-scoped, authenticated request is the only trigger
  if (
    !ctx.scopes.includes("player") ||
    !ctx.client ||
    !ctx.grant ||
    ctx.request === undefined ||
    ctx.accessExpiresAtMs === undefined
  )
    return text("an authenticated player request is required; nothing was dispatched", true);

  const loaded = await d.grants.get(id);
  if (!loaded.ok)
    return text("the pending-action records cannot be verified now; nothing was dispatched", true);
  const rec = loaded.value;
  // the same client AND the same OAuth grant that authored it, and nothing about the wording of the refusal tells which part differed
  if (rec === null || rec.intent.client !== ctx.client || rec.intent.oauth_grant !== ctx.grant)
    return text(
      "there is no such pending request for this authorization; nothing was dispatched",
      true,
    );

  const oauth = d.oauthStatus(ctx.client, ctx.grant);
  const frame = d.pendingFrame();
  const ref = rec.grant.dispatch_ref;
  // a chain in THIS process is carrying this very dispatch out right now: a second continuation changes nothing and starts nothing
  const carrying = d.goal.current();
  if (ref !== null && carrying?.live === true && carrying.goal.dispatch_ref === ref)
    return asJson({
      status: "CONTINUING",
      request_id: id,
      disclosure: SITE_RESERVE_DISCLOSURE,
      next: "The engine is already carrying this request out; follow play_status.",
    });
  const mine = frame?.dispatch?.dispatch_ref !== undefined && frame.dispatch.dispatch_ref === ref;
  const link = ref === null ? null : await d.readLink(d.config, ref);
  const read = link?.kind === "READ" ? link : null;
  const facts: DelayedRecoveryFacts = {
    now: d.now(),
    grant: rec.grant,
    authority: { oauth, liveContinuation: true },
    ledger: {
      intact: ref === null ? d.config.operatorLedgerVersion === 2 : read !== null,
      withDispatchRef: read?.withDispatchRef ?? 0,
      intentIdWithDispatchRef: read?.intentId ?? null,
      openWithoutDispatchRef: read?.openWithoutDispatchRef ?? false,
    },
    run: {
      recorded: mine,
      run_ref: mine ? frame!.run_id : null,
      process: mine
        ? d.runActive(frame!.run_id)
          ? "ACTIVE"
          : "UNKNOWN"
        : rec.grant.run_ref !== null
          ? "EXITED"
          : "NONE",
      slotSettled: !d.runs.unresolved(),
    },
    canonicalActId: read?.canonicalActId ?? null,
  };
  const plan = planDelayedRecovery(facts);

  const reply = (status: string, extra: Record<string, unknown> = {}): ToolResult =>
    asJson({
      status,
      request_id: id,
      // the exact site-Reserve disclosure accompanies every supported result
      disclosure: SITE_RESERVE_DISCLOSURE,
      ...extra,
    });

  switch (plan.action) {
    case "NO_LAUNCH": {
      if (plan.reason === "REVOKED" || plan.reason === "EXPIRED") {
        // a tombstone, never relaunched; a committed act would have been planned as BIND_ACT, not here
        await d.grants.endAuthority(id, plan.reason === "EXPIRED" ? "EXPIRED" : "REVOKED");
      }
      return reply("NOT_DISPATCHED", {
        reason: plan.reason,
        next: "Nothing was started. A fresh request from the player is needed.",
      });
    }
    case "PAUSE": {
      await d.grants.pause(id, plan.reason);
      return reply("PAUSED", {
        reason: plan.reason,
        next:
          plan.reason === "OUTCOME_UNKNOWN"
            ? "Whether the earlier step changed anything is not established; the operator must reconcile it. Nothing was started and nothing is matched by quantity."
            : "The request is paused; nothing was started.",
      });
    }
    case "REBUILD_LINK": {
      // the crash fell between the ledger record and the optional link: rebuild ONLY from the exact dispatch_ref
      const linked = await d.grants.linkIntent(id, {
        operator_intent_ref: plan.operator_intent_ref,
      });
      return linked.ok
        ? reply("LINKED", {
            next: "The retained intent was found by its dispatch identity; continue to reconcile it.",
          })
        : text("the retained intent could not be linked; nothing was dispatched", true);
    }
    case "RECONCILE_RUN":
    case "RECONCILE_INTENT": {
      // the owner-backed reconcile settles THIS dispatch's own identity; it never starts another collection
      const launched = await d.runs.launch("reconcile", {}, ctx);
      return launched.ok
        ? reply("RECONCILING", {
            next: "Follow await_action; the owners settle exactly the original dispatch.",
          })
        : text(launched.reason, true);
    }
    case "BIND_ACT": {
      const intentRef = read?.intentId;
      if (!intentRef)
        return text("the retained intent is not available; nothing was dispatched", true);
      const linked = await d.grants.linkIntent(id, {
        operator_intent_ref: intentRef,
        act_id: plan.act_id,
      });
      const consumed = linked.ok ? await d.grants.consume(id, plan.act_id) : linked;
      if (!consumed.ok)
        return text("the canonical act could not be recorded; nothing more was dispatched", true);
      if (!plan.continue_authorized)
        return reply("ACT_STANDS", {
          act_id: plan.act_id,
          next: "The committed act stands as it is; the earlier authority cannot continue it.",
        });
      // carry ONLY that act: an INTERRUPTED goal of this exact dispatch resumes by its dispatch_ref join, never by a quantity; a finished
      // one is finished (a second collection under the same dispatch_ref cannot exist, and none is attempted)
      const gnow = d.goal.current();
      const interrupted =
        gnow !== null &&
        gnow.goal.dispatch_ref === ref &&
        gnow.goal.outcome === "IN_PROGRESS" &&
        !gnow.live;
      if (!interrupted)
        return reply(
          gnow?.goal.dispatch_ref === ref && gnow.goal.outcome === "DONE" ? "DONE" : "ACT_STANDS",
          { act_id: plan.act_id },
        );
      const sc = d.scenario();
      const b = consumed.value.intent.binding;
      if (!sc || !b)
        return text("the scenario is not configured; nothing more was dispatched", true);
      const resumed = await d.goal.begin(
        { amount: consumed.value.intent.scope.amount, until: consumed.value.intent.scope.until },
        ctx,
        ctx.request.id,
        { dispatchRef: ref!, grantId: rec.grant.grant_id, bindingDigest: sha256Of(b) },
      );
      return resumed.ok ? reply("CONTINUING", { act_id: plan.act_id }) : text(resumed.reason, true);
    }
    case "BEGIN_DISPATCH":
    case "RESUME_SAME_DISPATCH":
      break;
  }

  // a request that can never be dispatched says so plainly instead of being driven into a refusal
  if (rec.intent.original_message.grade !== "ORIGINAL_MESSAGE_VERIFIED")
    return reply("PAUSED", {
      reason: "AUTHORITY_UNRESOLVED",
      next: "This request is not backed by the player's original wording, so nothing was started. The player must say it again.",
    });
  if (
    rec.intent.phase === "PAUSED" &&
    rec.intent.pause !== null &&
    !LIFTABLE_PAUSES.has(rec.intent.pause)
  )
    return reply("PAUSED", {
      reason: rec.intent.pause,
      next: "This request is paused and nothing was started.",
    });

  // -- the dispatch itself: current scenario, binding, revocation, then the dispatch lock ----------------------------------------
  const sc = d.scenario();
  if (sc === null)
    return text(
      "This campaign's scenario is not configured for chat play; nothing was started.",
      true,
    );
  const current = await d.readBinding(d.config, sc, rec.intent.scope);
  if (current === null) {
    await d.grants.pause(id, "FOREIGN_BASIS_CHANGED");
    return reply("PAUSED", {
      reason: "FOREIGN_BASIS_CHANGED",
      next: "The installed scenario and the world's facts no longer agree with the request; nothing was started and nothing was rebound.",
    });
  }
  const retained = rec.intent.binding;
  if (retained !== null && !sameBinding(retained, current)) {
    await d.grants.bind(id, current); // a different binding never rebinds: the request pauses FOREIGN_BASIS_CHANGED
    return reply("PAUSED", {
      reason: "FOREIGN_BASIS_CHANGED",
      next: "The scenario, a pin or the scope changed since the request was bound; nothing was started and nothing was rebound.",
    });
  }
  const bound = await d.grants.bind(id, retained ?? current);
  if (!bound.ok) return text("the request could not be bound; nothing was dispatched", true);
  // the revocation boundary and the dispatch lock are one synchronous section: a revocation cannot interleave with the issuance below
  if (d.oauthStatus(ctx.client, ctx.grant) !== "ISSUED")
    return text("this authorization is no longer valid; nothing was dispatched", true);
  const begun = await d.grants.beginDispatch(id);
  if (!begun.ok) {
    if (begun.error.code === "PENDING_EXPIRED") await d.grants.endAuthority(id, "EXPIRED");
    return reply("NOT_DISPATCHED", {
      reason: begun.error.code,
      next: "Nothing was started. A fresh request from the player is needed.",
    });
  }
  const g = begun.value.grant;
  const b = begun.value.intent.binding!;
  const started = await d.goal.begin({ amount: b.amount, until: b.until }, ctx, ctx.request.id, {
    dispatchRef: g.dispatch_ref!,
    grantId: g.grant_id,
    bindingDigest: sha256Of(b),
  });
  if (!started.ok) {
    // capability issuance / launch failed: the grant stays DISPATCHING under the SAME dispatch_ref for the next live continuation
    return text(started.reason, true);
  }
  const launched = d.pendingFrame();
  if (launched?.dispatch?.dispatch_ref === g.dispatch_ref)
    await d.grants.recordLaunch(id, launched.run_id);
  return reply(plan.action === "RESUME_SAME_DISPATCH" ? "RESUMED" : "DISPATCHED", {
    dispatch_ref: g.dispatch_ref,
    next: "Follow play_status; the engine carries the request out itself.",
  });
}

// -- continue_queued_setup_edit -----------------------------------------------------------------------------------------------------

export async function continueQueuedSetupEdit(
  d: DelayedDeps,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const id = args["queue_id"];
  if (!onlyKeys(args, ["queue_id"]) || typeof id !== "string" || !OPAQUE_ID.test(id))
    return text("this tool takes exactly one queue_id", true);
  if (
    !ctx.scopes.includes("player") ||
    !ctx.client ||
    !ctx.grant ||
    ctx.request === undefined ||
    ctx.accessExpiresAtMs === undefined
  )
    return text("an authenticated player request is required; nothing was applied", true);

  // an edit whose ORIGINAL deadline passed during a long freeze or park becomes a retained EXPIRED tombstone; nothing is refreshed
  const swept = await d.queue.sweepExpired();
  if (!swept.ok) return text("the queued edits cannot be verified now; nothing was applied", true);
  const loaded = await d.queue.get(id);
  if (!loaded.ok) return text("the queued edits cannot be verified now; nothing was applied", true);
  const rec = loaded.value;
  if (rec === null || rec.client !== ctx.client || rec.oauth_grant !== ctx.grant)
    return text("there is no such queued edit for this authorization; nothing was applied", true);
  if (rec.phase !== "QUEUED")
    return asJson({
      status: rec.phase,
      queue_id: id,
      reason: rec.reason,
      next: "That edit is finished; a new authored edit is needed.",
    });

  // revocation: a revoked authorization never applies a queued edit - it becomes a rejected tombstone
  const oauth = d.oauthStatus(ctx.client, ctx.grant);
  if (oauth === "UNAVAILABLE")
    return text("the authorization ledger is unavailable; nothing was applied", true);
  if (oauth !== "ISSUED") {
    await d.queue.markRejected(id, "REVOKED");
    return asJson({
      status: "REJECTED",
      queue_id: id,
      reason: "REVOKED",
      next: "A new authored edit is needed.",
    });
  }
  // only AFTER the freeze releases; a valid terminal setup result releases it, it does not approve the change
  const released = await d.freezeReleased();
  if (released === null)
    return text("the setup state cannot be verified now; nothing was applied", true);
  if (!released)
    return asJson({
      status: "QUEUED",
      queue_id: id,
      next: "The setup is still running; this edit waits.",
    });

  // the retained target must still be exactly the unsealed draft it was authored against; no target is ever substituted
  const target = await d.queuedTarget(rec);
  if (!target.ok) {
    await d.queue.markRejected(id, target.reason);
    return asJson({
      status: "REJECTED",
      queue_id: id,
      reason: target.reason,
      next: "A new authored edit is needed.",
    });
  }
  const capability = mintQueuedSetupEditCapability({
    campaignId: rec.campaign_id,
    client: rec.client,
    grant: rec.oauth_grant,
    queueId: rec.queue_id,
    command: rec.command,
    payloadHash: rec.payload_hash,
    retainedWorkflowRef: rec.retained_workflow_ref,
    retainedRevision: rec.retained_revision,
    originalRequestRef: rec.original_request_ref,
    expiresAtMs: rec.expires_at_ms,
    live: { session: ctx.request.session, id: ctx.request.id },
  });
  try {
    const result = await d.runQueued(rec, ctx, {
      capability,
      record: rec,
      live: { session: ctx.request.session, id: ctx.request.id },
      now: d.now,
    });
    // the capability is one-use and burned whether or not the run used it
    return result;
  } finally {
    revokeQueuedSetupEditCapability(capability);
  }
}
