import {
  PLAYER_CHARACTER_BINDING_KEY,
  PcCurrentViewingSchema,
  REFEREE_OP_SCENE,
  RefereeDecisionRecordSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  OWNER_WORLD_STATE,
  compareTime,
  fail,
  ok,
  pcExistenceContractKey,
  refereeDecisionKey,
  worldPcCurrentViewingKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
  type OwnerFact,
  type PcCurrentViewing,
  type RefereeDecisionRecord,
  type Result,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { WORLD_PC_CURRENT_VIEWING_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore } from "../persistence/store.ts";
import {
  committedCanonicalTime,
  currentViewingId,
  recordContextViolation,
} from "../referee/derive.ts";
import type { IntegrityViolation } from "./integrity.ts";
import type { FactView } from "./pc-locus-custody.ts";

/**
 * The World-State physical custodian's publication of the one sparse scene fact a direct look needs (see `scene.ts` in the contracts).
 * The fact is DERIVED from exactly one retained `GM_SCENE_RESOLUTION` decision: the caller names the character and the decision, never a
 * circumstance, a verdict or a time. The decision is re-validated against the committed facts it cited (so a stale, forged or foreign
 * ruling publishes nothing), and the published value must equal what the decision determines.
 *
 *  - a viewing circumstance is published only from a VIEWING_SUPPORTED ruling, at the canonical basis the ruling was made at; a negative,
 *    unresolved, player-choice or conflicting ruling is sealed referee evidence and publishes nothing (sparse).
 *
 * The kind is SEALED: the first established result is preserved, a different second one at the same identity is a version conflict.
 * There is no appearance fact (31 October 2026 Stage A): how a credited output looks is incidental narration, never an owner fact.
 */

type SceneRecord = Extract<RefereeDecisionRecord, { operation: typeof REFEREE_OP_SCENE }>;

const missing = (message: string) => fail("PREREQUISITE_MISSING" as const, message);
const RULING_KEY = /^referee\/([0-9a-f]{64})\/decision$/;

function ruling(facts: FactView, taskId: string): { fact: OwnerFact; record: SceneRecord } | null {
  const fact = facts.get(refereeDecisionKey(taskId));
  const parsed = fact ? RefereeDecisionRecordSchema.safeParse(fact.value) : null;
  if (
    !fact ||
    !parsed?.success ||
    parsed.data.operation !== REFEREE_OP_SCENE ||
    parsed.data.decision.kind !== "CURRENT_VIEWING" ||
    parsed.data.task_id !== taskId
  )
    return null;
  return { fact, record: parsed.data };
}

const pinOf = (f: OwnerFact) => ({
  fact_key: f.key,
  version: f.version,
  group_id: f.provenance.group_id,
});

/** The viewing circumstance the retained ruling determines for `pc_id`, or why it determines none. */
export function derivePcCurrentViewing(
  source: { getFact(key: string): OwnerFact | undefined },
  target: { pc_id: string; ruling_task_id: string },
): Result<PcCurrentViewing, "PREREQUISITE_MISSING"> {
  const facts = {
    get: (k: string) => source.getFact(k),
    has: (k: string) => source.getFact(k) !== undefined,
  };
  const found = ruling(facts, target.ruling_task_id);
  if (!found) return missing("no retained current-viewing ruling is committed for this identity");
  const r = found.record;
  const v = r.decision.viewing;
  if (r.subject.pc_id !== target.pc_id) return missing("the ruling is another character's");
  if (r.verdict !== "VIEWING_SUPPORTED" || v === null || v.statement === null)
    return missing("only a supported ruling publishes a viewing circumstance");
  if (r.input.refs.length !== 5) return missing("the ruling does not cite its basis");
  if (r.input.statement !== null)
    return missing(
      "a viewing circumstance is published from the physical ruling of the basis, never from a classification of words",
    );
  const bad = recordContextViolation(r, (k) => facts.get(k));
  if (bad) return missing(`the ruling no longer re-derives: ${bad.message}`);
  const [pc, binding, custody, world, locus] = r.input.refs;
  const pins = {
    pc: pc!.version,
    binding: binding!.version,
    custody: custody!.version,
    world: world!.version,
    locus: locus!.version,
  };
  const value = PcCurrentViewingSchema.safeParse({
    viewing_id: currentViewingId({ pc_id: target.pc_id, observed_at: r.input.observed_at, pins }),
    pc_id: target.pc_id,
    observed_at: r.input.observed_at,
    basis: { pinned_versions: pins },
    request: { kind: "LOOK", statement_digest: r.input.statement_digest },
    circumstance: { state: "SUPPORTED", statement: v.statement },
    ruling: pinOf(found.fact),
    ruled_by: { role: "role.gm", permission: "permission.rule.adjudicate" },
    custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      basis: FALLBACK_BASIS,
    },
  });
  return value.success
    ? ok(value.data)
    : missing("the result is not a representable current viewing circumstance");
}

const taskOf = (key: string): string | null => RULING_KEY.exec(key)?.[1] ?? null;

/**
 * Why a viewing record is not exactly what its retained ruling determines, or null. One rule for admission and for load verification.
 * ADMISSION also requires the ruling's basis to be the CURRENT canonical basis (a circumstance is published only for the look being made).
 */
export function pcCurrentViewingViolation(
  key: string,
  v: PcCurrentViewing,
  facts: FactView,
  phase: "ADMISSION" | "VERIFICATION",
): string | null {
  if (key !== worldPcCurrentViewingKey(v.pc_id, v.viewing_id))
    return "a viewing record is at the slot derived from its character and basis";
  const task = taskOf(v.ruling.fact_key);
  if (task === null) return "a viewing record cites a retained referee ruling";
  const derived = derivePcCurrentViewing(
    { getFact: (k) => facts.get(k) },
    { pc_id: v.pc_id, ruling_task_id: task },
  );
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, v))
    return "a viewing record is exactly what its retained ruling determines: the circumstance, basis and ruling are not the caller's";
  if (phase === "ADMISSION") {
    const now = committedCanonicalTime((k) => facts.get(k));
    if (!now || compareTime(now, v.observed_at) !== 0)
      return "a viewing circumstance is published at the canonical basis of its look only: a changed basis requires a new ruling";
  }
  return null;
}

/** IM-11 admission of the scene fact: one write, every foreign fact read and depended on at its current version, the value re-derived. */
export function worldSceneGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1)
    return reject("VALUE_INVALID", "one scene fact publishes exactly one circumstance");
  const w = group.writes[0]!;
  const v = PcCurrentViewingSchema.parse(w.value);
  for (const [key, what] of [
    [pcExistenceContractKey(v.pc_id), "the PC's released contract"],
    [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
    [worldPcLocusCustodyKey(v.pc_id), "the PC's physical-locus custody"],
    [v.ruling.fact_key, "the retained current-viewing ruling"],
  ] as const) {
    const p = requirePrerequisite(group, state, key, what);
    if (isRejection(p)) return p;
  }
  if (!canonicalEqual(group.rule, WORLD_PC_CURRENT_VIEWING_RULE))
    return reject("VALUE_INVALID", "a viewing record carries its own governing citation", {
      key: w.key,
    });
  const violation = pcCurrentViewingViolation(w.key, v, state.facts, "ADMISSION");
  return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
}

/**
 * Re-verifies, from committed state and the journal alone, that every loaded scene fact still tells one story: each pinned fact was
 * committed BEFORE it, was read at exactly the pinned version and depended on; the value is what its retained ruling determines; and the
 * governing citation is the kind's own. Lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifySceneIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "SCENE_STATE", message });
  const all = store.listFacts();
  const records = all.filter((f) => resolveKey(f.key)?.kind.id === "world_pc_current_viewing");
  if (records.length === 0) return out;
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  for (const rf of records) {
    const revision = revisionOf(rf);
    const group = store.committedGroup(rf.provenance.intent_id);
    const parsed = PcCurrentViewingSchema.safeParse(rf.value);
    if (!parsed.success) continue; // canonical integrity reports the malformed value
    const v = parsed.data;
    const violation = pcCurrentViewingViolation(rf.key, v, byKey, "VERIFICATION");
    if (violation) bad(rf.key, violation);
    if (!canonicalEqual(rf.provenance.rule, WORLD_PC_CURRENT_VIEWING_RULE))
      bad(rf.key, "a scene fact carries its own governing citation");
    const pins = [
      { key: pcExistenceContractKey(v.pc_id), version: v.basis.pinned_versions.pc },
      { key: PLAYER_CHARACTER_BINDING_KEY, version: v.basis.pinned_versions.binding },
      { key: worldPcLocusCustodyKey(v.pc_id), version: v.basis.pinned_versions.custody },
      { key: v.ruling.fact_key, version: v.ruling.version },
    ];
    for (const pin of pins) {
      const target = byKey.get(pin.key);
      if (!target) {
        bad(rf.key, `a pinned fact is committed: ${pin.key}`);
        continue;
      }
      // An ADVANCING pinned fact (the binding after a later handover) has moved on since: only its version at the time can be named, and
      // the group that read it is the evidence. A pinned fact still at its pinned version must also have been committed before.
      const current = target.version === pin.version;
      if (current && revisionOf(target) >= revision)
        bad(rf.key, `a pinned fact was not committed before the scene fact: ${pin.key}`);
      if (
        !group ||
        !group.reads.some((r) => r.key === pin.key && r.version === pin.version) ||
        (current && !group.depends_on.includes(target.provenance.group_id))
      )
        bad(
          rf.key,
          `a scene fact read the exact pinned fact and depended on the group that committed it: ${pin.key}`,
        );
    }
  }
  return out;
}
