// Contract layer: RC-01, RC-02, RC-07 (input side), RC-16 as executable schemas.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0). No default is ever supplied for a material field (IA-02).
import { describe, expect, it } from "vitest";
import {
  CommitGroupSchema,
  CommitReceiptSchema,
  OwnerFactSchema,
  OwnerFactWriteSchema,
  SourceRefSchema,
} from "@immortalis/contracts";
import { TEST_RULE, group, write } from "@immortalis/testkit";

const withoutKey = <T extends object>(o: T, k: keyof T) => {
  const rest = { ...o };
  delete rest[k];
  return rest;
};

describe("RC-01 SourceRef", () => {
  it("accepts a complete reference", () => {
    expect(SourceRefSchema.safeParse(TEST_RULE).success).toBe(true);
  });
  it.each([
    "artifact",
    "native_pin",
    "clause",
    "authority_lineage",
    "effective_basis",
    "supersedes",
  ] as const)("rejects a missing %s (no silent default)", (field) => {
    expect(SourceRefSchema.safeParse(withoutKey(TEST_RULE, field)).success).toBe(false);
  });
  it("rejects an empty authority lineage and unknown fields", () => {
    expect(SourceRefSchema.safeParse({ ...TEST_RULE, authority_lineage: [] }).success).toBe(false);
    expect(SourceRefSchema.safeParse({ ...TEST_RULE, extra: 1 }).success).toBe(false);
  });
});

describe("RC-02 OwnerFact", () => {
  it.each([
    "key",
    "owner",
    "facet",
    "value",
    "unit",
    "basis",
    "secrecy",
    "expected_version",
  ] as const)("a write rejects a missing %s", (field) => {
    expect(OwnerFactWriteSchema.safeParse(withoutKey(write("k", 1), field)).success).toBe(false);
  });
  it("preserves an explicit null unit but requires it to be stated", () => {
    expect(OwnerFactWriteSchema.safeParse(write("k", 1, { unit: null })).success).toBe(true);
    expect(OwnerFactWriteSchema.safeParse(write("k", 1, { unit: "kg" })).success).toBe(true);
  });
  it("rejects non-JSON values", () => {
    expect(OwnerFactWriteSchema.safeParse(write("k", Number.NaN)).success).toBe(false);
    expect(OwnerFactWriteSchema.safeParse({ ...write("k", 1), value: undefined }).success).toBe(
      false,
    );
  });
  it("a committed fact must carry provenance and a positive version", () => {
    const fact = {
      ...withoutKey(write("k", 1), "expected_version"),
      version: 1,
      provenance: { group_id: "g", intent_id: "i", cause: "c", rule: TEST_RULE },
    };
    expect(OwnerFactSchema.safeParse(fact).success).toBe(true);
    expect(OwnerFactSchema.safeParse({ ...fact, version: 0 }).success).toBe(false);
    expect(OwnerFactSchema.safeParse(withoutKey(fact, "provenance")).success).toBe(false);
  });
  it("rejects blank or control-character identifiers", () => {
    expect(OwnerFactWriteSchema.safeParse(write("", 1)).success).toBe(false);
    expect(OwnerFactWriteSchema.safeParse(write(" padded ", 1)).success).toBe(false);
    expect(OwnerFactWriteSchema.safeParse(write("a\nb", 1)).success).toBe(false);
  });
});

describe("RC-07 CommitGroup / RC-16 receipt identity", () => {
  const g = group("c1", 1, [write("k", 1)]);
  it("accepts a complete group", () => {
    expect(CommitGroupSchema.safeParse(g).success).toBe(true);
  });
  it.each([
    "group_id",
    "intent_id",
    "owner",
    "facet",
    "cause",
    "rule",
    "authority",
    "reads",
    "depends_on",
    "writes",
  ] as const)("rejects a group missing %s", (field) => {
    expect(CommitGroupSchema.safeParse(withoutKey(g, field)).success).toBe(false);
  });
  it("rejects an empty write set and unknown fields", () => {
    expect(CommitGroupSchema.safeParse({ ...g, writes: [] }).success).toBe(false);
    expect(CommitGroupSchema.safeParse({ ...g, surprise: true }).success).toBe(false);
  });
  it("a receipt only ever states COMMITTED with all-passed invariants", () => {
    expect(CommitReceiptSchema.safeParse({ outcome: "FAILED" }).success).toBe(false);
  });
});
