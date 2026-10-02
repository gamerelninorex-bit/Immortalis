import {
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  causalDrawId,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { CAUSAL_DRAW_RULE, resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import {
  causalDrawMetadataViolation,
  deriveResultRecord,
  precommitRecordViolation,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Causal Draw evidence is neither
 * malformed nor non-rederivable (IM-12 replay/recovery; F-027-CD1 §12 "a result that cannot be re-derived is an
 * integrity failure, not a reason to sample again"). Replay proves the HISTORY is intact and canonical integrity proves
 * each fact's owner, schema, key identity, sealing and governing rule; this proves the evidence still tells one story:
 *
 *  - every record carries the fixed OwnerFact metadata (`unit = null`, its kind's exact basis, `secrecy = "engine-internal"`);
 *  - a precommit's record is internally consistent (draw key ↔ key ↔ draw_id, a lawful normalized specification, its
 *    digest, a well-formed 32-byte seed), was committed under the deterministic RC-16 identities, and pinned every
 *    declared input fact at the declared version;
 *  - a result has its committed precommit, was committed after it under the deterministic identities, read and depended
 *    on it, and is EXACTLY what CDA-01 derives from that precommit's committed seed (a historical algorithm this build
 *    can no longer verify is reported, never silently trusted or resampled).
 *
 * A precommit with no result is NOT a violation: it is an interrupted draw that resumes from its committed seed.
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyCausalDrawIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "CAUSAL_DRAW_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const precommits = all.filter((f) => kindOf(f) === "causal_draw_precommit");
  const results = all.filter((f) => kindOf(f) === "causal_draw_result");
  if (precommits.length + results.length === 0) return out;
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  /** Judges the committing group's identities; returns the group when it is in the journal and writes only `f`. */
  const committingGroup = (
    f: OwnerFact,
    group: CommitGroup | null,
    expected: { group_id: string; intent_id: string; draw_id: string },
  ): CommitGroup | null => {
    if (!group || group.writes.length !== 1 || group.writes[0]!.key !== f.key) {
      bad(f.key, "the committing group is in the journal and writes only this record");
      return null;
    }
    if (group.group_id !== expected.group_id || group.intent_id !== expected.intent_id) {
      bad(
        f.key,
        "the record was not committed under the deterministic RC-16 identities of its draw",
      );
    }
    if (group.cause !== expected.draw_id)
      bad(f.key, "the cause of a Causal Draw group is its draw_id");
    if (!canonicalEqual(group.rule, CAUSAL_DRAW_RULE)) {
      bad(f.key, "the record was not committed under the pinned F-027-CD1 v1.0 SourceRef");
    }
    return group;
  };

  // CDP-01 / CDO-01: the fixed OwnerFact metadata is verified independently of the value, the journal and the hashes
  for (const f of [...precommits, ...results]) {
    const metadata = causalDrawMetadataViolation(
      kindOf(f) === "causal_draw_precommit" ? "causal_draw_precommit" : "causal_draw_result",
      f,
    );
    if (metadata) bad(f.key, metadata);
  }

  for (const pf of precommits) {
    const digest = resolveKey(pf.key)!.ids[0]!;
    const parsed = CausalDrawPrecommitSchema.safeParse(pf.value);
    if (!parsed.success) continue;
    const p = parsed.data;
    const inconsistent = precommitRecordViolation(p, digest);
    if (inconsistent) bad(pf.key, inconsistent);
    const group = committingGroup(pf, store.committedGroup(pf.provenance.intent_id), {
      group_id: causalDrawPrecommitGroupId(digest),
      intent_id: causalDrawPrecommitIntentId(digest),
      draw_id: causalDrawId(digest),
    });
    if (!group) continue;
    const pins = new Set(
      p.normalized_spec.input_refs.map((r) => `${r.fact_key}\u0000${r.version}`),
    );
    const reads = new Set(group.reads.map((r) => `${r.key}\u0000${r.version}`));
    if (reads.size !== pins.size || [...pins].some((x) => !reads.has(x))) {
      bad(
        pf.key,
        "the precommit group did not pin exactly the declared input facts at the declared versions",
      );
    }
    for (const r of p.normalized_spec.input_refs) {
      const input = byKey.get(r.fact_key);
      if (!input || input.owner !== r.owner || input.version < r.version) {
        bad(pf.key, `a declared input fact is committed and not behind its pin: ${r.fact_key}`);
        continue;
      }
      // the committer can be checked only for the version still current; a superseded version was pinned by the reads
      if (input.version === r.version) {
        if (input.provenance.group_id !== r.committed_by) {
          bad(pf.key, `a declared input fact was committed by a different group: ${r.fact_key}`);
        }
        if (revisionOf(input) >= revisionOf(pf)) {
          bad(
            pf.key,
            `a declared input fact was not committed before the precommit: ${r.fact_key}`,
          );
        }
      }
    }
  }

  for (const rf of results) {
    const digest = resolveKey(rf.key)!.ids[0]!;
    const parsed = CausalDrawResultSchema.safeParse(rf.value);
    if (!parsed.success) continue;
    const precommitKey = causalDrawPrecommitKey(digest);
    const pre = byKey.get(precommitKey);
    if (!pre) {
      bad(rf.key, "a result has no committed precommit");
      continue;
    }
    const expected = deriveResultRecord(pre, digest);
    if (!expected.ok) {
      bad(rf.key, `${expected.error.code}: ${expected.error.message}`);
    } else if (!canonicalEqual(expected.value, parsed.data)) {
      bad(rf.key, "the result is not what CDA-01 derives from its committed precommit");
    }
    if (revisionOf(rf) <= revisionOf(pre)) {
      bad(rf.key, "the result was not committed after the precommit it derives from");
    }
    const group = committingGroup(rf, store.committedGroup(rf.provenance.intent_id), {
      group_id: causalDrawResultGroupId(digest),
      intent_id: causalDrawResultIntentId(digest),
      draw_id: causalDrawId(digest),
    });
    if (group) {
      const onlyPrecommit =
        group.reads.length === 1 &&
        group.reads[0]!.key === precommitKey &&
        group.reads[0]!.version === pre.version;
      if (!onlyPrecommit)
        bad(rf.key, "the result group reads exactly its precommit at its version");
      if (!group.depends_on.includes(pre.provenance.group_id)) {
        bad(rf.key, "the result group depends on the precommit group");
      }
    }
  }
  return out;
}
