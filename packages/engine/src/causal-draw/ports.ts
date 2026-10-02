import { randomBytes } from "node:crypto";
import type { CausalDrawKey, SourceRef } from "@immortalis/contracts";

/**
 * The narrow typed boundaries through which the Causal Draw layer asks about state it does NOT own. The kernel never
 * infers foreign owner state (F-027-CD1 §3), and it never decides on its own that a rule is effective: it asks.
 */

/** What a substantive owner reports about the result slot a draw would help fix. */
export type SlotInspection =
  | { readonly established: false }
  | {
      readonly established: true;
      /**
       * The immutable intent identity of the committed group that established the slot. The kernel reads that exact
       * group from the journal (IM-12 cold-history lookup) to judge linkage by CD1's own rule.
       */
      readonly establishing_intent_id: string;
    };

/**
 * IM-03 typed-owner interface (CDR-01 step 4): whether `prospective_result_id` is already authoritatively established
 * by the substantive owner. Read by identity only, never a scan; carries no candidate, weight or world meaning.
 */
export interface SubstantiveSlotInspector {
  inspectResultSlot(slot: {
    readonly owner_operation: CausalDrawKey["owner_operation"];
    readonly prospective_result_id: string;
  }): SlotInspection;
}

/**
 * IM-01 authority seam (CAL-08 precommit revalidation): whether `owner_rule_ref` is still authoritative and effective
 * for the creation of this prior. A Causal Draw cannot infer rule currency from page recency or from its own state.
 */
export interface OwnerRuleAuthority {
  isEffectiveForPriorCreation(rule: SourceRef, drawKey: CausalDrawKey): boolean;
}

/**
 * CDE-01: a cryptographically secure source of `bytes` uniformly random bytes supplied by the trusted runtime. There is
 * no fallback of any kind: a source that cannot deliver exactly the requested bytes means no draw.
 */
export type EntropySource = (bytes: number) => Uint8Array;

/** The operating-system CSPRNG (node:crypto). Its provider is not part of draw identity. */
export const operatingSystemEntropy: EntropySource = (bytes) => randomBytes(bytes);
