import { canonicalJson } from "@immortalis/contracts";
import type { LocalOperatorSession } from "./session.ts";

/** Only these existing ordinary choices may use the chat request itself. Setup/mirrors never may. */
export type OrdinaryVerb = "collect" | "collect-finish" | "cease" | "observe-surroundings";

export interface OrdinaryAction {
  readonly operationId: string;
}

interface Binding {
  readonly campaignId: string;
  readonly pcId: string;
  readonly operationId: string;
  readonly client: string;
  readonly grant: string;
  readonly verb: OrdinaryVerb;
  readonly action: unknown;
  readonly revision?: number;
}

const live = new WeakMap<OrdinaryAction, Binding>();

/**
 * TRUSTED ADAPTER ONLY, after player-scope authentication, stored-scenario validation and durable pre-dispatch capture.
 * This is bounded transport authority to attempt ONE matching action, not evidence of a human utterance or standing consent.
 * It is never serialized, exposed as a tool/argument, restored from a save, or used by recovery. The owner checks still apply.
 */
export function bindOrdinaryAction(binding: Binding): OrdinaryAction {
  const token = Object.freeze({ operationId: binding.operationId });
  // Copy values, including the action: later caller mutation cannot widen the capability.
  live.set(token, { ...binding, action: JSON.parse(canonicalJson(binding.action)) as unknown });
  return token;
}

export function revokeOrdinaryAction(token: OrdinaryAction): void {
  live.delete(token);
}

/** A failed use burns the capability too. A copied/forged object, other actor, session basis or distinct choice cannot use it. */
export function consumeOrdinaryAction(
  token: OrdinaryAction,
  session: LocalOperatorSession,
  verb: OrdinaryVerb,
  action: unknown,
): boolean {
  const b = live.get(token);
  live.delete(token);
  return !!(
    b &&
    b.client &&
    b.grant &&
    b.operationId &&
    session.isOpen &&
    !session.isAmbiguous &&
    session.campaignId === b.campaignId &&
    session.campaign.binding()?.value.active_pc.entity_id === b.pcId &&
    (b.revision === undefined || session.campaign.store.head().revision === b.revision) &&
    b.verb === verb &&
    canonicalJson(b.action) === canonicalJson(action)
  );
}
