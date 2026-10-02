import {
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  causalDrawId,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  causalDrawResultKey,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { CAUSAL_DRAW_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { cdDigest } from "./canon.ts";
import {
  causalDrawMetadataViolation,
  deriveResultRecord,
  precommitRecordViolation,
} from "./derive.ts";

/**
 * IM-11 admission for the infrastructure-only `causal_draw_kernel / draw_provenance` owner (F-027-CD1 §§3, 10, 12, 13).
 * Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the adapter. Key-space
 * exclusivity (nobody else can write a `causal-draw/…` key, and this owner can write nothing else) is enforced by the
 * owner registry before this runs; this enforces that even the Causal Draw owner changes state in exactly two lawful
 * ways, each create-only and re-derived from committed evidence:
 *
 *  1. PRECOMMIT (CDP-01): one record whose key, draw_id, normalized specification and digests are mutually consistent
 *     and whose seed is a well-formed 32-byte value; its CommitGroup pins every `input_refs[]` fact at the exact
 *     declared version (reads) and carries the pinned F-027-CD1 rule and the deterministic RC-16 identities.
 *  2. RESULT (CDO-01): exactly what CDA-01 derives from the committed precommit — the group reads and depends on that
 *     precommit, and the selected candidate must re-derive. Without a committed precommit nothing can be derived, so
 *     no caller or raw commit can conjure a result.
 *
 * Both records carry the fixed CDP-01 / CDO-01 OwnerFact metadata (`unit = null`, the kind's exact `basis`, `secrecy =
 * "engine-internal"`); a write with any other value is refused here, so a raw commit cannot bypass it.
 *
 * Authority (role.archivist + permission.canon.write) is enforced by the commit core. Per CDO-01, result publication
 * deliberately does NOT revalidate the currency of `owner_rule_ref` or `input_refs[]`: those were frozen at precommit.
 */
export function causalDrawGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    const kind = resolveKey(w.key)?.kind.id;
    if (kind === "causal_draw_precommit") return checkPrecommit(group, state, w);
    if (kind === "causal_draw_result") return checkResult(group, state, w);
  }
  return reject(
    "VALUE_INVALID",
    "Causal Draw state changes only by one precommit or one result, each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

const digestOfKey = (key: string): string => resolveKey(key)!.ids[0]!;

function groupIdentityViolation(
  group: CommitGroup,
  expected: { group_id: string; intent_id: string; draw_id: string },
): Rejection | null {
  if (group.group_id !== expected.group_id || group.intent_id !== expected.intent_id) {
    return ref(
      "the group and intent identities are the deterministic RC-16 identities of the draw",
      {
        group_id: group.group_id,
      },
    );
  }
  if (group.cause !== expected.draw_id) {
    return ref("the cause of a Causal Draw group is the canonical draw_id", { cause: group.cause });
  }
  if (!canonicalEqual(group.rule, CAUSAL_DRAW_RULE)) {
    return ref("a Causal Draw group is governed by the pinned F-027-CD1 v1.0 SourceRef", {
      key: group.writes[0]!.key,
    });
  }
  return null;
}

function checkPrecommit(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const p = CausalDrawPrecommitSchema.parse(w.value);
  const digest = digestOfKey(w.key);
  const metadata = causalDrawMetadataViolation("causal_draw_precommit", w);
  if (metadata) return bad(metadata, { key: w.key });
  if (w.key !== causalDrawPrecommitKey(cdDigest(p.draw_key))) {
    return ref("the precommit is at the key its draw identity derives", { key: w.key });
  }
  const inconsistent = precommitRecordViolation(p, digest);
  if (inconsistent) return bad(inconsistent, { key: w.key });
  const wrongIdentity = groupIdentityViolation(group, {
    group_id: causalDrawPrecommitGroupId(digest),
    intent_id: causalDrawPrecommitIntentId(digest),
    draw_id: causalDrawId(digest),
  });
  if (wrongIdentity) return wrongIdentity;

  // CAL-08: the group reads pin EVERY declared input fact at the exact declared version, still current, and the
  // declared committing group is the one that committed it. Nothing else may be read.
  const pins = new Set(p.normalized_spec.input_refs.map((r) => `${r.fact_key}\u0000${r.version}`));
  const reads = new Set(group.reads.map((r) => `${r.key}\u0000${r.version}`));
  if (reads.size !== pins.size || [...pins].some((x) => !reads.has(x))) {
    return ref("the group reads exactly the declared input facts at the declared versions", {
      key: w.key,
    });
  }
  for (const r of p.normalized_spec.input_refs) {
    const fact = state.facts.get(r.fact_key);
    if (
      !fact ||
      fact.version !== r.version ||
      fact.owner !== r.owner ||
      fact.provenance.group_id !== r.committed_by
    ) {
      return ref(
        "a declared input fact is committed at the declared version by the declared group",
        {
          key: r.fact_key,
        },
      );
    }
  }
  return null;
}

function checkResult(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const r = CausalDrawResultSchema.parse(w.value);
  const digest = digestOfKey(w.key);
  const metadata = causalDrawMetadataViolation("causal_draw_result", w);
  if (metadata) return bad(metadata, { key: w.key });
  if (w.key !== causalDrawResultKey(digest) || r.draw_id !== causalDrawId(digest)) {
    return ref("the result is at the key its draw identity derives", { key: w.key });
  }
  const wrongIdentity = groupIdentityViolation(group, {
    group_id: causalDrawResultGroupId(digest),
    intent_id: causalDrawResultIntentId(digest),
    draw_id: causalDrawId(digest),
  });
  if (wrongIdentity) return wrongIdentity;

  const precommitKey = causalDrawPrecommitKey(digest);
  const precommit = requirePrerequisite(group, state, precommitKey, "the committed precommit");
  if (isRejection(precommit)) return precommit;
  if (group.reads.length !== 1) {
    return ref("a result reads exactly its precommit", { key: w.key });
  }
  const expected = deriveResultRecord(precommit.fact, digest);
  if (!expected.ok) return bad(expected.error.message, { key: w.key, code: expected.error.code });
  if (!canonicalEqual(expected.value, r)) {
    return bad(
      "a result is exactly what CDA-01 derives from its committed precommit: the pin, the digests, the accepted sample, the rejection count and the selected candidate",
      { key: w.key },
    );
  }
  return null;
}
