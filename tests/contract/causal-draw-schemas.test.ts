// F-027-CD1 executable contracts: CausalDrawKey, CausalDrawSpecification, the SEALED precommit and result records, the
// deterministic identities and the refusal vocabulary. Strictness IS the structural half of the neutrality guards: there
// is no field in which a candidate meaning, a causal weighting rationale, a grade, an EX descriptor, a world-state
// effect, a seed projection or a retry/request/provider dimension could be carried.
// Register lineage: IA-02 (partial), IA-30 (partial); F-027-CD1 CDK-01, CDS-01, CDP-01, CDO-01. Spec lock f027 + addendum.
import { describe, expect, it } from "vitest";
import {
  CAUSAL_DRAW_ALGORITHM_ID,
  CAUSAL_DRAW_ENTROPY_BYTES,
  CAUSAL_DRAW_ENTROPY_SOURCE_CLASS,
  CAUSAL_DRAW_REFUSAL_CODES,
  CAUSAL_DRAW_SECRECY,
  CausalDrawKeySchema,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  CausalDrawSpecificationSchema,
  FACET_DRAW_PROVENANCE,
  OWNER_CAUSAL_DRAW_KERNEL,
  RESOLVER_AUTHORITY,
  causalDrawId,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  causalDrawResultKey,
  isWellFormedString,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CAUSAL_DRAW_FACT_KINDS,
  CAUSAL_DRAW_RULE,
  preparePrior,
} from "@immortalis/engine";
import { SEED_1, drawSpecification } from "@immortalis/testkit";

const D = "ab".repeat(32);
const spec = () => drawSpecification();
const prior = () => preparePrior(spec());
const precommit = () => {
  const p = prior();
  return {
    draw_id: p.draw_id,
    draw_key: p.normalized.draw_key,
    spec_digest: p.spec_digest,
    normalized_spec: p.normalized,
    entropy_hex: SEED_1,
    entropy_source_class: CAUSAL_DRAW_ENTROPY_SOURCE_CLASS,
    algorithm_id: CAUSAL_DRAW_ALGORITHM_ID,
  };
};
const result = () => ({
  draw_id: prior().draw_id,
  spec_digest: prior().spec_digest,
  precommit_key: causalDrawPrecommitKey(prior().draw_key_digest),
  precommit_version: 1,
  precommit_committed_by: causalDrawPrecommitGroupId(prior().draw_key_digest),
  algorithm_id: CAUSAL_DRAW_ALGORITHM_ID,
  total_weight: "6",
  accepted_sample: "0",
  rejected_attempts: "0",
  selected_candidate_id: "synthetic-candidate-a",
});

describe("fixed identifiers, keys and the RC-16 identities", () => {
  it("are exactly the strings the addendum fixes", () => {
    expect(OWNER_CAUSAL_DRAW_KERNEL).toBe("causal_draw_kernel");
    expect(FACET_DRAW_PROVENANCE).toBe("draw_provenance");
    expect(CAUSAL_DRAW_ALGORITHM_ID).toBe("IMMORTALIS_WEIGHTED_FINITE_V1");
    expect(CAUSAL_DRAW_ENTROPY_SOURCE_CLASS).toBe("CSPRNG_256");
    expect(CAUSAL_DRAW_ENTROPY_BYTES).toBe(32);
    expect(CAUSAL_DRAW_SECRECY).toBe("engine-internal");
    expect(causalDrawId(D)).toBe(`cdraw:v1:${D}`);
    expect(causalDrawPrecommitKey(D)).toBe(`causal-draw/${D}/precommit`);
    expect(causalDrawResultKey(D)).toBe(`causal-draw/${D}/result`);
    expect(causalDrawPrecommitGroupId(D)).toBe(`cdraw:precommit:group:v1:${D}`);
    expect(causalDrawPrecommitIntentId(D)).toBe(`cdraw:precommit:intent:v1:${D}`);
    expect(causalDrawResultGroupId(D)).toBe(`cdraw:result:group:v1:${D}`);
    expect(causalDrawResultIntentId(D)).toBe(`cdraw:result:intent:v1:${D}`);
  });

  it("entropy and sampling run under role.resolver + permission.resolution.execute; publication stays role.archivist + permission.canon.write", () => {
    expect(RESOLVER_AUTHORITY).toEqual({
      role: "role.resolver",
      permission: "permission.resolution.execute",
    });
  });

  it("the refusal vocabulary is exactly the codes the addendum names, plus the one integrity class", () => {
    expect([...CAUSAL_DRAW_REFUSAL_CODES].sort()).toEqual(
      [
        "DRAW_ALGORITHM_UNSUPPORTED",
        "DRAW_CANDIDATE_DUPLICATE",
        "DRAW_CANDIDATE_SET_EMPTY",
        "DRAW_ENTROPY_UNAVAILABLE",
        "DRAW_IDENTITY_CONFLICT",
        "DRAW_INPUT_INVALID",
        "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
        "DRAW_INPUT_REF_UNRESOLVED",
        "DRAW_INTEGRITY_FAILURE",
        "DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED",
        "DRAW_NOT_REQUIRED_SINGLETON",
        "DRAW_OWNER_RULE_STALE_AT_PRECOMMIT",
        "DRAW_STATE_CONFLICT",
      ].sort(),
    );
  });

  it("isWellFormedString is the CD-CANON-1 string validity rule", () => {
    expect(isWellFormedString("plain é 😀")).toBe(true);
    expect(isWellFormedString("\ud800")).toBe(false);
    expect(isWellFormedString("\udc00x")).toBe(false);
    expect(isWellFormedString("\udc00\ud800")).toBe(false);
  });
});

describe("CausalDrawKey v1 and CausalDrawSpecification v1 are strict", () => {
  it("the key has exactly four identity dimensions", () => {
    expect(Object.keys(CausalDrawKeySchema.shape).sort()).toEqual([
      "causal_process_id",
      "opportunity_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(CausalDrawKeySchema.safeParse(spec().draw_key).success).toBe(true);
    expect(CausalDrawKeySchema.safeParse({ ...spec().draw_key, retry_count: 1 }).success).toBe(
      false,
    );
  });

  it("the specification has exactly the CDS-01 fields: no candidate meaning, rationale, percentage, grade, EX or effect field exists", () => {
    expect(Object.keys(CausalDrawSpecificationSchema.shape).sort()).toEqual([
      "algorithm_id",
      "candidates",
      "draw_key",
      "input_refs",
      "owner_rule_ref",
    ]);
    const candidateKeys = Object.keys(
      CausalDrawSpecificationSchema.shape.candidates.element.shape,
    ).sort();
    expect(candidateKeys).toEqual(["candidate_id", "weight"]);
    for (const extra of [
      "label",
      "meaning",
      "grade",
      "ex",
      "probability",
      "percent",
      "effect",
      "score",
    ]) {
      const withExtra = {
        ...spec(),
        candidates: [
          { candidate_id: "a", weight: "1", [extra]: 1 },
          { candidate_id: "b", weight: "1" },
        ],
      };
      expect(CausalDrawSpecificationSchema.safeParse(withExtra).success, extra).toBe(false);
    }
    expect(
      Object.keys(CausalDrawSpecificationSchema.shape.input_refs.element.shape).sort(),
    ).toEqual(["committed_by", "fact_key", "owner", "version"]);
  });

  it("the algorithm is the one literal, and a weight is a decimal string, never a number", () => {
    expect(CausalDrawSpecificationSchema.safeParse({ ...spec(), algorithm_id: "V2" }).success).toBe(
      false,
    );
    const numeric = { ...spec(), candidates: [{ candidate_id: "a", weight: 1 }] };
    expect(CausalDrawSpecificationSchema.safeParse(numeric).success).toBe(false);
  });

  it("the cardinality refusals (empty, singleton, duplicate) are the gate's, so the schema does not pre-empt their codes", () => {
    expect(CausalDrawSpecificationSchema.safeParse({ ...spec(), candidates: [] }).success).toBe(
      true,
    );
  });
});

describe("the SEALED precommit record (CDP-01)", () => {
  it("has exactly the required value fields", () => {
    expect(Object.keys(CausalDrawPrecommitSchema.shape).sort()).toEqual([
      "algorithm_id",
      "draw_id",
      "draw_key",
      "entropy_hex",
      "entropy_source_class",
      "normalized_spec",
      "spec_digest",
    ]);
    expect(CausalDrawPrecommitSchema.safeParse(precommit()).success).toBe(true);
  });

  it("entropy_hex is exactly 64 lowercase hexadecimal characters; the source class and algorithm are literals", () => {
    for (const bad of [
      "",
      "00",
      "0".repeat(63),
      "0".repeat(65),
      "A".repeat(64),
      "g".repeat(64),
      `0x${"0".repeat(62)}`,
    ]) {
      expect(
        CausalDrawPrecommitSchema.safeParse({ ...precommit(), entropy_hex: bad }).success,
        bad,
      ).toBe(false);
    }
    expect(
      CausalDrawPrecommitSchema.safeParse({ ...precommit(), entropy_source_class: "PRNG" }).success,
    ).toBe(false);
    expect(
      CausalDrawPrecommitSchema.safeParse({ ...precommit(), algorithm_id: "other" }).success,
    ).toBe(false);
    expect(CausalDrawPrecommitSchema.safeParse({ ...precommit(), seed: "x" }).success).toBe(false);
  });

  it("draw_id has the cdraw:v1:<64 hex> shape and spec_digest is a sha256", () => {
    for (const bad of ["cdraw:v1:abc", `cdraw:v2:${D}`, D, `cdraw:v1:${D.toUpperCase()}`]) {
      expect(
        CausalDrawPrecommitSchema.safeParse({ ...precommit(), draw_id: bad }).success,
        bad,
      ).toBe(false);
    }
    expect(
      CausalDrawPrecommitSchema.safeParse({ ...precommit(), spec_digest: "nope" }).success,
    ).toBe(false);
  });
});

describe("the SEALED result record (CDO-01)", () => {
  it("has exactly the required value fields and no candidate meaning or world effect", () => {
    expect(Object.keys(CausalDrawResultSchema.shape).sort()).toEqual([
      "accepted_sample",
      "algorithm_id",
      "draw_id",
      "precommit_committed_by",
      "precommit_key",
      "precommit_version",
      "rejected_attempts",
      "selected_candidate_id",
      "spec_digest",
      "total_weight",
    ]);
    expect(CausalDrawResultSchema.safeParse(result()).success).toBe(true);
    expect(CausalDrawResultSchema.safeParse({ ...result(), world_effect: 1 }).success).toBe(false);
  });

  it("the numbers are canonical decimal strings: total_weight positive; accepted_sample and rejected_attempts nonnegative", () => {
    for (const bad of ["0", "01", "-1", "1.0", "1e3", " 1", 1 as never]) {
      expect(CausalDrawResultSchema.safeParse({ ...result(), total_weight: bad }).success).toBe(
        false,
      );
    }
    for (const bad of ["", "00", "-0", "1.5", "+1", 0 as never]) {
      expect(CausalDrawResultSchema.safeParse({ ...result(), accepted_sample: bad }).success).toBe(
        false,
      );
      expect(
        CausalDrawResultSchema.safeParse({ ...result(), rejected_attempts: bad }).success,
      ).toBe(false);
    }
    for (const ok of ["0", "7", "123456789012345678901234567890"]) {
      expect(CausalDrawResultSchema.safeParse({ ...result(), accepted_sample: ok }).success).toBe(
        true,
      );
      expect(CausalDrawResultSchema.safeParse({ ...result(), rejected_attempts: ok }).success).toBe(
        true,
      );
    }
    expect(CausalDrawResultSchema.safeParse({ ...result(), precommit_version: 0 }).success).toBe(
      false,
    );
  });
});

describe("registration: an infrastructure-only owner/facet with two SEALED key spaces", () => {
  it("registers exactly causal_draw_kernel / draw_provenance, SEALED, under the pinned F-027-CD1 rule with no supersession", () => {
    expect(CAUSAL_DRAW_FACT_KINDS.map((k) => k.id)).toEqual([
      "causal_draw_precommit",
      "causal_draw_result",
    ]);
    for (const k of CAUSAL_DRAW_FACT_KINDS) {
      expect([k.owner, k.facet, k.lifecycle, k.im]).toEqual([
        "causal_draw_kernel",
        "draw_provenance",
        "SEALED",
        "IM-12",
      ]);
      expect(k.rc).toEqual(["RC-02", "RC-09", "RC-16"]);
      expect(k.rule).toBe(CAUSAL_DRAW_RULE);
      expect(k.legacyRule).toBeUndefined();
      expect(ALL_FACT_KINDS).toContain(k);
    }
    expect(CAUSAL_DRAW_RULE.supersedes).toBeNull();
    expect(CAUSAL_DRAW_RULE.native_pin).toBe("2026-10-02T15:11:03.450Z");
    expect(CAUSAL_DRAW_RULE.artifact).toBe(
      "https://app.notion.com/p/3ed20af901e08176abe1c203943294b1",
    );
  });

  it("the key spaces are `causal-draw/<64 lowercase hex>/precommit|result` and nothing beside them", () => {
    const [pre, res] = CAUSAL_DRAW_FACT_KINDS;
    expect(pre!.keyPattern.test(causalDrawPrecommitKey(D))).toBe(true);
    expect(res!.keyPattern.test(causalDrawResultKey(D))).toBe(true);
    expect(pre!.keyPattern.test(causalDrawResultKey(D))).toBe(false);
    for (const key of [
      "causal-draw",
      "causal-draw/x/precommit",
      `causal-draw/${D.toUpperCase()}/precommit`,
      `causal-draw/${D}a/precommit`,
      `causal-draw/${D}/precommit/x`,
      `causal-draw/${D}/seed`,
      `causal-draw/${D}`,
      `causal-draw/${D}/result/1`,
      `/causal-draw/${D}/result`,
    ]) {
      expect(
        ALL_FACT_KINDS.some((k) => k.keyPattern.test(key)),
        key,
      ).toBe(false);
    }
  });
});
