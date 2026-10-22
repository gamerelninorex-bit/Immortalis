import {
  ExistenceContractSchema,
  OWNER_REFEREE_KERNEL,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  REFEREE_AUTHORITY,
  REFEREE_OP_ACTOR_OBSERVATION,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_PHYSICAL,
  RefereeDecisionRecordSchema,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import {
  REFEREE_ACTOR_OBSERVATION_RULE,
  REFEREE_OBSERVATION_RULE,
  REFEREE_PHYSICAL_RULE,
  resolveKey,
} from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { recordContextViolation } from "./derive.ts";
import { refereeQualificationViolation } from "./admission.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's referee decisions tell one story (like the
 * Culture adjudication integrity, whose pattern it reuses): every record is at the key its task derives, carries the fixed
 * metadata and the trusted authority, was committed as ONE group under the deterministic identities writing only itself, reading
 * exactly the cited facts at the cited versions; its digests, context and verdict re-derive (a LATER version of a cited fact never
 * makes a decision a violation); and every I-002 release or Role Registry binding that cites a decision is qualified by it.
 * Cost: lists committed facts once per open (a diagnostic path), never an advance path.
 */
export function verifyRefereeIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const bad = (key: string, message: string) => out.push({ key, code: "REFEREE_STATE", message });
  for (const f of all) {
    if (resolveKey(f.key)?.kind.id !== "referee_decision") continue;
    const parsed = RefereeDecisionRecordSchema.safeParse(f.value);
    if (!parsed.success) {
      bad(f.key, "a record satisfies its referee record contract");
      continue;
    }
    const r = parsed.data;
    if (f.key !== refereeDecisionKey(r.task_id)) {
      bad(f.key, "a record is at the key its task identity derives");
      continue;
    }
    if (f.owner !== OWNER_REFEREE_KERNEL) bad(f.key, "a record carries the referee owner");
    if (!canonicalEqual(r.authority, REFEREE_AUTHORITY))
      bad(f.key, "a record carries role.gm + permission.rule.adjudicate");
    const group = store.committedGroup(f.provenance.intent_id);
    if (!group || group.writes.length !== 1 || group.writes[0]!.key !== f.key) {
      bad(f.key, "the committing group is in the journal and writes only this record");
      continue;
    }
    if (
      group.group_id !== refereeDecisionGroupId(r.task_id) ||
      group.intent_id !== refereeDecisionIntentId(r.task_id) ||
      group.cause !== refereeDecisionCause(r.task_id)
    )
      bad(f.key, "the record was committed under the deterministic identities of its task");
    if (
      group.reads.length !== r.input.refs.length ||
      r.input.refs.some(
        (x, i) => group.reads[i]!.key !== x.fact_key || group.reads[i]!.version !== x.version,
      )
    )
      bad(f.key, "the record read exactly the cited facts at the cited versions");
    const deps = [...new Set(r.input.refs.map((x) => x.group_id))];
    if (group.depends_on.length !== deps.length || deps.some((g) => !group.depends_on.includes(g)))
      bad(f.key, "the record depended on exactly the groups that committed the cited facts");
    const violation = recordContextViolation(r, (k) => byKey.get(k));
    if (violation) bad(f.key, `${violation.code}: ${violation.message}`);
    if (!canonicalEqual(f.provenance.rule, group.rule))
      bad(f.key, "the record carries the group's governing rule");
    // the physical-placement decision carries its own governing citation, exclusively; every other decision carries the kind's
    const expectedRule =
      r.operation === REFEREE_OP_PHYSICAL
        ? REFEREE_PHYSICAL_RULE
        : r.operation === REFEREE_OP_OBSERVATION
          ? REFEREE_OBSERVATION_RULE
          : r.operation === REFEREE_OP_ACTOR_OBSERVATION
            ? REFEREE_ACTOR_OBSERVATION_RULE
            : resolveKey(f.key)!.kind.rule;
    if (!canonicalEqual(f.provenance.rule, expectedRule))
      bad(f.key, "the record carries the governing citation of its own operation");
  }
  // the consumers: every release or first binding that cites a decision is qualified by it
  for (const f of all) {
    const kind = resolveKey(f.key)?.kind.id;
    if (kind !== "pc_existence_contract" && f.key !== PLAYER_CHARACTER_BINDING_KEY) continue;
    const group = store.committedGroup(f.provenance.intent_id);
    if (!group || !group.reads.some((r) => resolveKey(r.key)?.kind.id === "referee_decision"))
      continue;
    if (kind === "pc_existence_contract") {
      const c = ExistenceContractSchema.safeParse(f.value);
      const v = c.success
        ? refereeQualificationViolation(group, (k) => byKey.get(k), "RELEASE", { contract: c.data })
        : { message: "malformed contract" };
      if (v) bad(f.key, `the release is not qualified by the decision it cites: ${v.message}`);
    } else {
      const b = PlayerCharacterBindingSchema.safeParse(f.value);
      const v = b.success
        ? refereeQualificationViolation(group, (k) => byKey.get(k), "BIND", { binding: b.data })
        : { message: "malformed binding" };
      if (v) bad(f.key, `the binding is not qualified by the decision it cites: ${v.message}`);
    }
  }
  return out;
}
