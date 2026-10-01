import { z } from "zod";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * GIP Authority Scope Binding Backbone Foundation — executable contract (fifteenth bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-007 Government / Institutions / Politics (frozen F-027 pin 2026-09-24T01:42:24.952Z): the Sovereign-ratified GIP
 *     Working Operational Draft v2.1 §2.1 (GIP owns Scope / Applicability Bindings), §5 (Scope / Applicability Binding: "A
 *     Scope Binding answers only: where, to whom, or under what condition does this authority/rule legally apply?"; the
 *     minimum fields), §21.1/§21.2 (create only when future causality requires it; update only on a material change), with
 *     the GIP Scaling Profile v1.1 §3 (Scope Binding cardinality: Instrument/authority × bounded applicability scope;
 *     explicit exceptions replace per-place/per-person duplication), Red-confirmed at pin 2026-09-25T00:59:55.526Z
 *
 * A Scope Binding records ONE authored, bounded applicability envelope of ONE already-committed Office / Authority Locus: "this
 * office authority is bound to this authored scope and target condition, with any authored inheritance, exception and
 * priority-or-conflict material preserved". It is NOT a Governance Instrument, an order-relative validity result, a live applicability
 * result, proof that its target exists or that anyone belongs to it, a decision or exercise of authority, awareness,
 * Administrative Reach, compliance, an Actor / Autonomous Collective choice, a KTI state or a foreign-owner copy.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). The contract carries authored content and
 * interprets none of it: no scope taxonomy, condition language or rule language exists, and no reference is resolved.
 */

/**
 * One Scope Binding of one office, addressed by the exact parent office authority (`institution_id` × `office_id`, the office's
 * own key) and its own `scope_binding_id` (Scaling Profile §3 cardinality: authority × bounded applicability scope). One key,
 * hence one slot, per binding: a retry, a second construction or a conflicting establishment reaches the same occupied slot,
 * never a sibling binding. The binding is stored once at its office: it is never copied per recipient, resident, Population
 * member, actor or transaction. The path is a technical encoding of that identity; it is exclusive to this kind.
 */
export const gipScopeBindingKey = (
  institutionId: string,
  officeId: string,
  scopeBindingId: string,
): string => `gip/institution/${institutionId}/office/${officeId}/scope-binding/${scopeBindingId}`;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.values(value).every((v) => v !== undefined);

/**
 * The WS-007 §5 minimum, as the fifteenth-slice brief fixes it. Every value is authored and explicit: nothing is defaulted,
 * inferred from a label, the parent office's prose, a holder, a decision body or any foreign-owner state.
 *
 *  - `scope_binding_id` is the binding's canonical identity beneath its office.
 *  - `institution_id` and `office_id` name the parent Office / Authority Locus (the office's own identities, so the join is by
 *    canonical identity alone, never by label or prose). The source's "authority" the binding belongs to is, in this slice,
 *    specifically that office; no generic authority object exists.
 *  - `scope_type` is the source's authored classification field: free authored text. The source's examples are examples, not a
 *    closed vocabulary, and no scope taxonomy is invented or matched against.
 *  - `scope_ref` is an OPAQUE authored reference to the bounded applicability scope. It is never resolved: no World,
 *    Population, Institution, Actor, Autonomous Collective, Culture or other owner is read, and nothing is created from it.
 *  - `target_condition` is authored text, carried and never parsed, executed or compared.
 *  - `inheritance_rule` is optional authored text, carried and never executed (no territorial inheritance is implemented).
 *  - `exception_refs[]` is an optional array of OPAQUE authored references, carried exactly as authored (no minimum count, no
 *    uniqueness, no normalisation) and never resolved or applied. An omitted field is absent; an authored empty array is
 *    carried as an empty array.
 *  - `priority_or_conflict_rule_ref` is ONE optional OPAQUE authored reference (a single reference, not an array) to the
 *    priority / conflict rule, carried exactly as authored and never resolved, compared, ranked, applied or used to settle
 *    anything: no priority calculation, ranking or conflict resolution exists.
 *
 * No Governance Instrument reference, validity, lifecycle status, applicability result, promulgation, holder, decision-body or
 * `competence_scope` field exists, and the parent office's `competence_scope` is neither read nor copied nor parsed.
 */
export const ScopeBindingSchema = z
  .strictObject({
    scope_binding_id: EntityId,
    institution_id: EntityId,
    office_id: EntityId,
    scope_type: Text,
    scope_ref: EntityId,
    target_condition: Text,
    inheritance_rule: Text.optional(),
    exception_refs: z.array(EntityId).optional(),
    priority_or_conflict_rule_ref: EntityId.optional(),
  })
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type ScopeBinding = z.infer<typeof ScopeBindingSchema>;
