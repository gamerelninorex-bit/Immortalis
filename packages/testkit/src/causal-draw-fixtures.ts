import {
  CANON_WRITE_AUTHORITY,
  CAUSAL_DRAW_ALGORITHM_ID,
  RESOLVER_AUTHORITY,
  type CausalDrawSpecification,
  type CommitGroup,
  type OwnerFact,
  type SourceRef,
} from "@immortalis/contracts";
import type {
  CampaignStore,
  EntropySource,
  OwnerRuleAuthority,
  StageOwnerExtension,
  SubstantiveSlotInspector,
  WriteAdmission,
} from "@immortalis/engine";
import { SYNTH_RULE } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the F-027-CD1 Causal Draw foundation. Every owner, key, identifier, candidate, weight and
 * value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no calibration. The Causal Draw
 * kernel is NOT synthetic and lives in @immortalis/engine; what is synthetic is the ONE other party of the proof — a
 * SUBSTANTIVE OWNER that defines a bounded prior over opaque candidates and commits its own later result slot by
 * reference to the draw. It is registered through the existing extension seam (which cannot write a canonical or
 * kernel key space, and so cannot write a `causal-draw/…` key). Production code must never import this package.
 */
export const SYNTH_DRAW_OWNER = "SYNTHETIC-DRAW-OWNER";
export const SYNTH_DRAW_FACET = "synthetic-draw-owner";
export const SYNTH_DRAW_OPERATION = "synthetic-resolve-uncertain-slot";
const PREFIX = "synthetic-draw-owner/";

const prefixCheck: WriteAdmission["check"] = (group) => {
  if (group.owner !== SYNTH_DRAW_OWNER) return null;
  for (const w of group.writes) {
    if (!w.key.startsWith(PREFIX)) {
      return {
        code: "KEY_NOT_ADMITTED",
        message: "not this synthetic owner's key",
        details: { key: w.key },
      };
    }
  }
  return null;
};

export const DRAW_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([[SYNTH_DRAW_OWNER, new Set([SYNTH_DRAW_FACET])]]),
  admission: { check: prefixCheck },
};

export const DRAW_CAMPAIGN = "campaign-causal-draw-1";

export const drawInputKey = (id: string): string => `${PREFIX}input/${id}`;
export const drawSlotKey = (id: string): string => `${PREFIX}slot/${id}`;

/** The synthetic owner's rule citation inside a specification (RC-01 shape; never an engine rule). */
export const DRAW_OWNER_RULE_REF: SourceRef = {
  artifact: "test://synthetic-draw-owner-rule",
  native_pin: "test-pin-1",
  clause: "test-clause-prior",
  authority_lineage: ["test-lineage"],
  effective_basis: "test-basis",
  supersedes: null,
};

let counter = 0;
/** A group of the synthetic owner (an input fact, or a substantive slot establishment). */
export function drawOwnerGroup(
  key: string,
  value: unknown,
  over: Partial<CommitGroup> & { expected_version?: number } = {},
): CommitGroup {
  const n = ++counter;
  const { expected_version, ...group } = over;
  return {
    campaign_id: DRAW_CAMPAIGN,
    group_id: `draw-owner-group-${n}-${key}`,
    intent_id: `draw-owner-intent-${n}-${key}`,
    owner: SYNTH_DRAW_OWNER,
    facet: SYNTH_DRAW_FACET,
    cause: `draw-owner-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner: SYNTH_DRAW_OWNER,
        facet: SYNTH_DRAW_FACET,
        value: value as never,
        unit: null,
        basis: "draw-fixture-basis",
        secrecy: "draw-fixture-secrecy",
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

/** The committed fact an input ref must name: owner, key, version and the group that committed it. */
export const inputRefOf = (fact: OwnerFact) => ({
  owner: fact.owner,
  fact_key: fact.key,
  version: fact.version,
  committed_by: fact.provenance.group_id,
});

export const CAND_A = "synthetic-candidate-a";
export const CAND_B = "synthetic-candidate-b";
export const CAND_C = "synthetic-candidate-c";

/**
 * A lawful specification over three opaque candidates with deliberately common-scaled weights (2:4:6 → 1:2:3), in
 * non-canonical order, so normalization is exercised by default. `inputs` are committed facts it must pin.
 */
export function drawSpecification(
  inputs: readonly OwnerFact[] = [],
  over: Partial<CausalDrawSpecification> = {},
): CausalDrawSpecification {
  return {
    draw_key: {
      causal_process_id: "synthetic-process-1",
      opportunity_id: "synthetic-opportunity-1",
      owner_operation: { owner: SYNTH_DRAW_OWNER, operation: SYNTH_DRAW_OPERATION },
      prospective_result_id: drawSlotKey("slot-1"),
    },
    owner_rule_ref: DRAW_OWNER_RULE_REF,
    input_refs: inputs.map(inputRefOf),
    candidates: [
      { candidate_id: CAND_C, weight: "6" },
      { candidate_id: CAND_A, weight: "2" },
      { candidate_id: CAND_B, weight: "4" },
    ],
    algorithm_id: CAUSAL_DRAW_ALGORITHM_ID,
    ...over,
  };
}

/** IM-03 typed-owner interface of the synthetic owner: a slot is established when its fact is committed. */
export const syntheticSlotInspector = (store: CampaignStore): SubstantiveSlotInspector => ({
  inspectResultSlot({ prospective_result_id }) {
    const fact = store.getFact(prospective_result_id);
    return fact
      ? { established: true, establishing_intent_id: fact.provenance.intent_id }
      : { established: false };
  },
});

export const slotInspectors = (store: CampaignStore) =>
  new Map<string, SubstantiveSlotInspector>([[SYNTH_DRAW_OWNER, syntheticSlotInspector(store)]]);

/** IM-01 seam fixture: every owner rule is effective, or exactly the predicate says. */
export const effectiveRules = (
  effective: boolean | ((rule: SourceRef) => boolean) = true,
): OwnerRuleAuthority => ({
  isEffectiveForPriorCreation: (rule) =>
    typeof effective === "boolean" ? effective : effective(rule),
});

/** A trusted-runtime entropy fixture: yields the given 32-byte seeds in order (then the last one), and counts calls. */
export function seededEntropy(...seedHexes: string[]): EntropySource & { calls: () => number } {
  let n = 0;
  const source = ((bytes: number): Uint8Array => {
    const hex = seedHexes[Math.min(n, seedHexes.length - 1)]!;
    n++;
    return Uint8Array.from(Buffer.from(hex, "hex").subarray(0, bytes));
  }) as EntropySource & { calls: () => number };
  source.calls = () => n;
  return source;
}

export const SEED_1 = "00".repeat(31) + "01";
export const SEED_2 = "a5".repeat(32);
export const SEED_3 = "ff".repeat(32);
export const RESOLVER = { ...RESOLVER_AUTHORITY };
