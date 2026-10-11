import {
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  REFEREE_AUTHORITY,
  REFEREE_DECISION_BASIS,
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_PHYSICAL,
  REFEREE_SECRECY,
  RefereeDecisionRecordSchema,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type CommitGroup,
  type ExistenceContract,
  type OwnerFact,
  type PlayerCharacterBinding,
  type RefereeDecisionRecord,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { REFEREE_PHYSICAL_RULE, resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import {
  candidateDigest,
  irIdentities,
  recordContextViolation,
  refereeCandidateItems,
} from "./derive.ts";

/**
 * IM-11 admission for the infrastructure-only `referee_adjudication_kernel / referee_provenance` owner. Pure: a function of
 * (group, state) only, so it holds for a raw `store.commit` as much as for the adapter. It enforces that even this owner changes
 * state in exactly one lawful way, create-only and re-derived:
 *
 *  - ONE record per task at the key its task identity derives, under the deterministic group/intent/cause identities and the fixed
 *    OwnerFact metadata, carrying the trusted `role.gm` + `permission.rule.adjudicate` authority;
 *  - the record's digests, context and VERDICT re-derive from the record (I-002: its delivered candidate) or from the cited
 *    committed facts at their current versions (IR) — a verdict the answer does not derive is refused, and so is a host's optimistic one;
 *  - the group reads exactly the cited facts at their current versions and depends on exactly their committing groups.
 *
 * Which host answered, and that the operation context was the trusted one, is the adapter operation's precondition (as for the
 * Culture adjudication record): the store knows only the archivist publication authority.
 */
export function refereeGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1 || group.writes[0]!.expected_version !== 0)
    return reject(
      "VALUE_INVALID",
      "referee state changes only by one decision record, created once",
    );
  const w = group.writes[0]!;
  if (resolveKey(w.key)?.kind.id !== "referee_decision")
    return reject(
      "VALUE_INVALID",
      "referee state changes only by one decision record, created once",
    );
  const parsed = RefereeDecisionRecordSchema.safeParse(w.value);
  if (!parsed.success)
    return reject("VALUE_INVALID", "the referee record violates its contract", { key: w.key });
  const r = parsed.data;
  if (w.basis !== REFEREE_DECISION_BASIS || w.secrecy !== REFEREE_SECRECY || w.unit !== null)
    return reject("VALUE_INVALID", "the referee record carries its fixed OwnerFact metadata", {
      key: w.key,
    });
  if (!canonicalEqual(r.authority, REFEREE_AUTHORITY))
    return reject(
      "VALUE_INVALID",
      "the referee record carries role.gm + permission.rule.adjudicate",
      { key: w.key },
    );
  if (
    w.key !== refereeDecisionKey(r.task_id) ||
    group.group_id !== refereeDecisionGroupId(r.task_id) ||
    group.intent_id !== refereeDecisionIntentId(r.task_id) ||
    group.cause !== refereeDecisionCause(r.task_id)
  )
    return reject(
      "REFERENCE_INVALID",
      "the record is at the key and under the identities its task derives",
      { key: w.key },
    );
  // the physical-placement decision is written under its own governing citation, exclusively; no other decision carries it
  if (canonicalEqual(group.rule, REFEREE_PHYSICAL_RULE) !== (r.operation === REFEREE_OP_PHYSICAL))
    return reject(
      "VALUE_INVALID",
      "the physical-placement decision, and only it, carries the physical-placement governing citation",
      { key: w.key },
    );
  const violation = recordContextViolation(r, (k) => state.facts.get(k));
  if (violation) {
    if (violation.code === "CONTEXT_UNAVAILABLE")
      return reject("PREREQUISITE_MISSING", violation.message, { key: w.key });
    return reject(violation.stale ? "REFERENCE_INVALID" : "VALUE_INVALID", violation.message, {
      key: w.key,
      referee_code: violation.code,
    });
  }
  // the group reads exactly the cited facts at their CURRENT versions and depends on exactly their committing groups
  const refs = r.input.refs;
  if (
    group.reads.length !== refs.length ||
    refs.some(
      (x, i) =>
        group.reads[i]!.key !== x.fact_key ||
        group.reads[i]!.version !== x.version ||
        state.facts.get(x.fact_key)?.version !== x.version,
    )
  )
    return reject(
      "REFERENCE_INVALID",
      "the group reads exactly the cited facts at their current versions",
      { key: w.key },
    );
  const expectedDeps = [...new Set(refs.map((x) => x.group_id))];
  if (
    group.depends_on.length !== expectedDeps.length ||
    expectedDeps.some((g) => !group.depends_on.includes(g))
  )
    return reject(
      "REFERENCE_INVALID",
      "the group depends on exactly the groups that committed the cited facts",
      { key: w.key },
    );
  return null;
}

export type QualifiedRole = "RELEASE" | "BIND";
const REFEREE_KEY = /^referee\/[0-9a-f]{64}\/decision$/;

/**
 * The consumer side (I-002 release, Role Registry first ACTIVATION): when a group READS a referee decision, the decision must be
 * the one that qualifies THIS write. Nothing here requires a decision (raw writers and predecessor saves stay lawful and are simply
 * not attested); it refuses a write that cites a decision that does not qualify it:
 *
 *  - RELEASE: an I-002 decision whose derived verdict is CLOSED, for this character, over exactly the statements of the contract
 *    being released (a changed word is a different candidate digest);
 *  - BIND: an IR decision whose derived verdict is BIND_ELIGIBLE, for this character, world and locus, at exactly the versions the
 *    binding pins, over exactly the native statement the binding preserves verbatim.
 */
export function refereeQualificationViolation(
  group: CommitGroup,
  getFact: (key: string) => OwnerFact | undefined,
  role: QualifiedRole,
  subject: { contract?: ExistenceContract; binding?: PlayerCharacterBinding },
): { code: "VALUE_INVALID" | "REFERENCE_INVALID"; message: string } | null {
  const cited = group.reads.filter((r) => REFEREE_KEY.test(r.key));
  if (cited.length === 0) return null;
  const bad = (
    message: string,
    code: "VALUE_INVALID" | "REFERENCE_INVALID" = "REFERENCE_INVALID",
  ) => ({ code, message });
  if (cited.length > 1) return bad("a write cites exactly one referee decision");
  const fact = getFact(cited[0]!.key);
  if (!fact) return bad("the cited referee decision is not committed");
  if (!group.depends_on.includes(fact.provenance.group_id))
    return bad("the group must depend on the group that committed the cited referee decision");
  const parsed = RefereeDecisionRecordSchema.safeParse(fact.value);
  if (!parsed.success) return bad("the cited referee decision is malformed");
  const r = parsed.data;
  if (role === "RELEASE") {
    const c = subject.contract!;
    if (r.operation !== REFEREE_OP_I002) return bad("a release cites an I-002 classification");
    if (r.verdict !== "CLOSED")
      return bad(
        "a release cites a classification whose derived verdict is CLOSED",
        "VALUE_INVALID",
      );
    if (r.subject.pc_id !== c.pc_id)
      return bad("the cited classification is for another character");
    if (r.input.candidate_digest !== candidateDigest(refereeCandidateItems(c)))
      return bad(
        "the cited classification was made over other statements than the contract being released",
        "VALUE_INVALID",
      );
    return null;
  }
  const b = subject.binding!;
  const message = nativeQualificationViolation(r, b);
  return message === null ? null : bad(message.message, message.code);
}

/**
 * Whether a retained referee decision is the one that qualifies THIS first-ACTIVATION binding as a native/no-bridge presence: an IR
 * decision whose derived verdict is BIND_ELIGIBLE, for this character, world and locus, at exactly the versions the binding pins,
 * over exactly the native statement the binding preserves verbatim. Shared by the binding's own consumer check and by the
 * physical-locus custody that rests on that qualified native presence.
 */
export function nativeQualificationViolation(
  r: RefereeDecisionRecord,
  b: PlayerCharacterBinding,
): { code: "VALUE_INVALID" | "REFERENCE_INVALID"; message: string } | null {
  const bad = (
    message: string,
    code: "VALUE_INVALID" | "REFERENCE_INVALID" = "REFERENCE_INVALID",
  ) => ({ code, message });
  if (r.operation !== REFEREE_OP_IR)
    return bad("a binding cites an IR native/compatibility decision");
  if (r.verdict !== "BIND_ELIGIBLE")
    return bad(
      "a binding cites a decision whose derived verdict is BIND_ELIGIBLE",
      "VALUE_INVALID",
    );
  if (b.transition.type !== "ACTIVATION")
    return bad("only a first ACTIVATION is qualified by this decision");
  const t = b.transition.basis;
  if (r.subject.pc_id !== b.active_pc.entity_id)
    return bad("the cited decision is for another character");
  if (r.input.statement !== t.statement)
    return bad(
      "the cited decision was made over another statement than the one the binding preserves",
      "VALUE_INVALID",
    );
  const ids = irIdentities(r);
  if (
    !ids ||
    ids.world_id !== b.coupling.world.entity_id ||
    ids.locus_id !== b.coupling.locus.entity_id
  )
    return bad("the cited decision is for another world or locus");
  const pin = (key: string) => r.input.refs.find((x) => x.fact_key === key)?.version;
  if (
    pin(b.active_pc.fact_key) !== t.pinned_versions.pc ||
    pin(b.coupling.world.fact_key) !== t.pinned_versions.world ||
    pin(b.coupling.locus.fact_key) !== t.pinned_versions.locus
  )
    return bad("the cited decision was made at other versions than the binding pins");
  return null;
}

/**
 * Whether a retained referee decision is the physical-placement qualification of THIS first-ACTIVATION binding's character at its
 * coupled world and locus: an IR_PHYSICAL_PLACEMENT decision whose derived verdict is PHYSICAL_ELIGIBLE, for this character, over
 * exactly the native statement the binding preserves, citing exactly the released character, this binding, this world and this
 * locus at the given versions. Returns a message, or null when it qualifies.
 */
export function physicalQualificationViolation(
  r: RefereeDecisionRecord,
  b: PlayerCharacterBinding,
  pins: { pc: number; binding: number; world: number; locus: number },
): string | null {
  if (r.operation !== REFEREE_OP_PHYSICAL)
    return "a physical-locus custody cites an IR physical-placement decision";
  if (r.verdict !== "PHYSICAL_ELIGIBLE")
    return "a physical-locus custody cites a decision whose derived verdict is PHYSICAL_ELIGIBLE";
  if (b.transition.type !== "ACTIVATION")
    return "only a first ACTIVATION is qualified by this decision";
  if (r.subject.pc_id !== b.active_pc.entity_id)
    return "the cited physical-placement decision is for another character";
  if (r.input.statement !== b.transition.basis.statement)
    return "the cited physical-placement decision was made over another statement than the one the binding preserves";
  const ids = irIdentities(r);
  if (
    !ids ||
    ids.world_id !== b.coupling.world.entity_id ||
    ids.locus_id !== b.coupling.locus.entity_id
  )
    return "the cited physical-placement decision is for another world or locus";
  const expected = [
    [b.active_pc.fact_key, pins.pc],
    [PLAYER_CHARACTER_BINDING_KEY, pins.binding],
    [b.coupling.world.fact_key, pins.world],
    [b.coupling.locus.fact_key, pins.locus],
  ] as const;
  if (
    r.input.refs.length !== expected.length ||
    expected.some(
      ([key, version], i) =>
        r.input.refs[i]!.fact_key !== key || r.input.refs[i]!.version !== version,
    )
  )
    return "the cited physical-placement decision was made at other versions than the custody pins";
  return null;
}

export { PlayerCharacterBindingSchema };
