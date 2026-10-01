// Contract evidence for the KTI Managed Transfer Package / Result-Close Backbone Foundation (eleventh slice): the
// executable contracts are strict and sparse, KTI holds workflow state and no comprehension / competence / adoption, and
// BROADCAST_EXPOSURE, cohort, faction and audience scopes have no representation. Register lineage: IA-02 (partial), IA-03
// (partial), IA-04 (partial); RC-02, RC-03, RC-04; IM-09. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-002.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  FACET_KTI_DEVELOPMENT,
  KTI_OBJECT_CLASSES,
  KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE,
  KTI_RESULT_CLOSE,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  OWNER_KTI,
  accessPacketKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  parseStageKey,
  type AccessiblePacket,
} from "@immortalis/contracts";
import { deriveTransferPackage } from "@immortalis/engine";
import {
  ACTOR_SMITH,
  EVENT_COUNCIL,
  OBJECT_GATE_ROTA,
  ktiBasis,
  ktiObject,
} from "@immortalis/testkit";

const A = ACTOR_SMITH;
const basis = (over: Record<string, unknown> = {}) => ({ ...ktiBasis(A, EVENT_COUNCIL), ...over });
const object = (over: Record<string, unknown> = {}) => ({ ...ktiObject(), ...over });
const packageValue = () => {
  const b = ktiBasis(A, EVENT_COUNCIL);
  const packet: AccessiblePacket = {
    recipient: A,
    payload: { referent: "the gate rota", content: "SYNTHETIC FIXTURE: content." },
    presented_attribution: null,
    access: { result: "RECEIVED", channel: "SPEECH", established_at: { unit: "u", value: 1 } },
    intelligibility: { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" },
  };
  const d = deriveTransferPackage({
    basis: { key: ktiTransferBasisKey(b.package_id), owner: OWNER_KTI, version: 1, value: b },
    packet: {
      key: accessPacketKey(EVENT_COUNCIL, A),
      owner: "epistemic_access",
      version: 1,
      value: packet,
    },
    object: {
      key: ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
      owner: OWNER_KTI,
      version: 1,
      value: ktiObject(),
    },
  });
  if (!d.ok) throw new Error("fixture");
  return d.value;
};
const FORBIDDEN_FIELDS = [
  "comprehension",
  "understanding",
  "competence",
  "partial_depth",
  "reproduction",
  "adoption",
  "adherence",
  "belief",
  "stance",
  "diffusion",
  "continuity",
  "retention",
  "uptake",
  "encounter",
  "exposure",
  "intelligibility",
  "headcount",
  "skill",
  "mastery",
  "maturity",
  "qualifier",
  "level",
  "score",
  "grade",
  "number",
  "faction",
  "institution",
  "office",
  "permission",
  "jurisdiction",
  "commitment",
  "audience",
  "cohort",
  "scope",
  "group",
  "membership",
  "recipients",
  "participants",
  "mode",
  "channel",
  "event",
  "event_id",
  "provenance",
  "carrier",
  "payload",
  "attribution",
  "capability",
  "population",
  "actor",
];

describe("keys and the result-close stage identity (RC-04)", () => {
  it("derives three disjoint key spaces from the object identity and the package identity", () => {
    expect(ktiDevelopmentObjectKey("o")).toBe("kti/object/o");
    expect(ktiTransferBasisKey("p")).toBe("kti/transfer/p/basis");
    expect(ktiTransferPackageKey("p")).toBe("kti/transfer/p/package");
  });

  it("the stage is a valid StageKey derived from the package identity alone, owned by the KTI owner", () => {
    const s = ktiTransferStage("p");
    expect(parseStageKey(s).ok).toBe(true);
    expect(s).toEqual({
      causal_process_id: "kti-transfer/p",
      owner_operation: { owner: "kti", operation: "kti-publish-transfer-result-close" },
      prospective_result_id: "kti/transfer/p/package",
    });
    expect(OWNER_KTI).toBe("kti");
    expect(FACET_KTI_DEVELOPMENT).toBe("kti_development");
    expect(KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE).toBe("kti-publish-transfer-result-close");
    expect(KTI_RESULT_CLOSE).toBe("kti-result-close");
    expect(ACCESS_CLASS_KTI_ENGINE_SIDE).toBe("kti.engine-sealed");
    // identity is a pure function of the package: another package is another stage
    expect(ktiTransferStage("p")).toEqual(ktiTransferStage("p"));
    expect(ktiTransferStage("p2")).not.toEqual(ktiTransferStage("p"));
  });

  it("no horizon, version, retry, consumer, packet or slice is an identity dimension of the stage", () => {
    const s = JSON.stringify(ktiTransferStage("p"));
    expect(s).not.toMatch(
      /horizon|version|retry|attempt|slice|consumer|transaction|target|packet/i,
    );
  });
});

describe("the development object: KTI's own identity, nothing foreign (acceptance 1)", () => {
  it("accepts a well-formed object of each of the six object classes", () => {
    expect(KTI_OBJECT_CLASSES).toEqual([
      "TECHNIQUE_TECHNOLOGY",
      "KNOWLEDGE_DISCIPLINE",
      "METHOD_PRACTICE",
      "DOCTRINE_PHILOSOPHY_IDEOLOGY",
      "INSTITUTIONAL_GOVERNMENT_MODEL",
      "REPRESENTATIONAL_INFORMATION_SYSTEM",
    ]);
    for (const object_class of KTI_OBJECT_CLASSES)
      expect(KtiDevelopmentObjectSchema.safeParse(object({ object_class })).success).toBe(true);
  });

  it("is strict: every omission and every unmodelled field is refused", () => {
    for (const k of ["object_id", "object_class", "referent", "materiality"]) {
      const o: Record<string, unknown> = { ...object() };
      delete o[k];
      expect(KtiDevelopmentObjectSchema.safeParse(o).success, k).toBe(false);
    }
    for (const bad of [
      object({ object_class: "TECH_TREE_NODE" }),
      object({ object_class: "Navigation" }),
      object({ materiality: "SOMETIMES" }),
      object({ referent: "" }),
      object({ referent: " padded " }),
      object({ object_id: "has/slash" }),
      object({ object_id: "" }),
      "object",
      null,
      [],
    ])
      expect(KtiDevelopmentObjectSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    for (const f of FORBIDDEN_FIELDS)
      expect(KtiDevelopmentObjectSchema.safeParse(object({ [f]: "x" })).success, f).toBe(false);
  });

  it("has no field in which an institution, actor, Population or world fact, a faction relationship or a competence could be placed", () => {
    expect(Object.keys(KtiDevelopmentObjectSchema.shape).sort()).toEqual([
      "materiality",
      "object_class",
      "object_id",
      "referent",
    ]);
  });
});

describe("the Transfer Package basis: one named recipient, one sealed packet, no wider scope (acceptance 3, 5, 9)", () => {
  it("accepts a well-formed basis", () => {
    expect(KtiTransferBasisSchema.safeParse(basis()).success).toBe(true);
  });

  it("BROADCAST_EXPOSURE, any mode, audience, cohort, faction or multi-recipient field is unrepresentable", () => {
    for (const f of [
      "mode",
      "audience",
      "cohort",
      "faction",
      "scope",
      "recipients",
      "participants",
      "membership",
      "group",
      "institution",
    ])
      expect(
        KtiTransferBasisSchema.safeParse(basis({ [f]: "BROADCAST_EXPOSURE" })).success,
        f,
      ).toBe(false);
    // the recipient is exactly one named identity
    expect(KtiTransferBasisSchema.safeParse(basis({ recipient: ["a", "b"] })).success).toBe(false);
    expect(KtiTransferBasisSchema.safeParse(basis({ recipient: "" })).success).toBe(false);
  });

  it("is strict: every omission, malformed pin and unmodelled field is refused", () => {
    for (const k of [
      "package_id",
      "management",
      "source",
      "recipient",
      "development_object",
      "packet",
    ]) {
      const b: Record<string, unknown> = { ...basis() };
      delete b[k];
      expect(KtiTransferBasisSchema.safeParse(b).success, k).toBe(false);
    }
    const b = ktiBasis(A, EVENT_COUNCIL);
    for (const bad of [
      basis({ management: "TRIVIAL" }),
      basis({ management: undefined }),
      basis({ source: { ...b.source, version: 1 } }),
      basis({ source: { owner: "x" } }),
      basis({ source: { fact_key: "x" } }),
      basis({ packet: { ...b.packet, version: 0 } }),
      basis({ packet: { fact_key: b.packet.fact_key } }),
      basis({ packet: { ...b.packet, event: "e" } }),
      basis({ development_object: { ...b.development_object, version: 0 } }),
      basis({ development_object: { ...b.development_object, extra: 1 } }),
      "basis",
      null,
      [],
    ])
      expect(KtiTransferBasisSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    for (const f of FORBIDDEN_FIELDS.filter((f) => !["source", "packet"].includes(f)))
      expect(KtiTransferBasisSchema.safeParse(basis({ [f]: "x" })).success, f).toBe(false);
  });
});

describe("the active Transfer Package: workflow state only (acceptance 4, 5)", () => {
  it("accepts the derived package, whose status is the single literal ACTIVE", () => {
    expect(KtiTransferPackageSchema.safeParse(packageValue()).success).toBe(true);
    expect(packageValue().status).toBe("ACTIVE");
  });

  it("no completion, retirement, failure or other lifecycle status is representable (no completion rule is invented)", () => {
    for (const status of [
      "COMPLETED",
      "CLOSED",
      "FAILED",
      "ABANDONED",
      "RETIRED",
      "PENDING",
      "",
      null,
    ])
      expect(
        KtiTransferPackageSchema.safeParse({ ...packageValue(), status }).success,
        String(status),
      ).toBe(false);
  });

  it("has no field for comprehension, competence, reproduction, adoption, adherence, belief, diffusion, continuity, headcount, F-014D event or provenance content, or any number", () => {
    for (const f of FORBIDDEN_FIELDS.filter((f) => !["source", "packet"].includes(f)))
      expect(KtiTransferPackageSchema.safeParse({ ...packageValue(), [f]: "x" }).success, f).toBe(
        false,
      );
    expect(Object.keys(KtiTransferPackageSchema.shape).sort()).toEqual([
      "basis",
      "close",
      "development_object",
      "package_id",
      "packet",
      "recipient",
      "source",
      "status",
    ]);
    // the references carry only identity and version, never a copied value
    expect(Object.keys(KtiTransferPackageSchema.shape.source.shape).sort()).toEqual([
      "fact_key",
      "owner",
    ]);
    expect(Object.keys(KtiTransferPackageSchema.shape.packet.shape).sort()).toEqual([
      "fact_key",
      "version",
    ]);
  });

  it("names the KTI result close: any other close name is refused", () => {
    const p = packageValue();
    expect(
      KtiTransferPackageSchema.safeParse({ ...p, close: { ...p.close, name: "x" } }).success,
    ).toBe(false);
    expect(
      KtiTransferPackageSchema.safeParse({ ...p, close: { name: KTI_RESULT_CLOSE } }).success,
    ).toBe(false);
  });
});
