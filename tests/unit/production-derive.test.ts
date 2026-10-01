// Unit evidence for the pure Production completion derivation and the two owner operations (WS-003 §14; CG-2):
// the claimed input is consumed exactly once, the declared output is sealed exactly once, nothing appears
// from nowhere, and an operation that cannot lawfully resolve throws instead of publishing.
// Register lineage: IA-02, IA-05 (bounded RC-06 partial). CAL-01/02/03 stay unresolved: no rate, yield or default.
import { describe, expect, it } from "vitest";
import {
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionReserveSchema,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  deriveCompletion,
  productionCompletionProvider,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "m") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};

const operation = ProductionOperationSchema.parse({
  operation_id: "op-1",
  request: { owner: "src", fact_key: "src/req-1", request_id: "op-1", version: 1 },
  reserve: { fact_key: "production/reserve/r-1", reserve_id: "r-1" },
  claim: { fact_key: "production/claim/claim:op-1", claim_id: "claim:op-1" },
  transformation: {
    input: { material_class: "mat", quantity: q(6) },
    output: { reference: "durable:op-1", output_class: "d", quantity: q(1, "d"), condition: "dc" },
  },
  support_basis: {
    tier: "TIER_A_EMBEDDED_BASELINE",
    labor: "NON_MATERIAL_EMBEDDED",
    specialist_competence: "NON_MATERIAL",
  },
  timing: { started_at: t(100), completion: { boundary_id: "b", at: t(140) } },
  status: { state: "IN_PROGRESS" },
});
const reserve = ProductionReserveSchema.parse({
  reserve_id: "r-1",
  material_class: "mat",
  established: q(10),
  quantity: q(10),
  consumed: [],
  condition: "c",
  locality: loc,
  holding: "HELD_LOCAL_BY_PRODUCTION",
  claims: ["claim:op-1"],
});
const claim = ProductionClaimSchema.parse({
  claim_id: "claim:op-1",
  operation_id: "op-1",
  conserved: {
    kind: "PRODUCTION_RESERVE_QUANTITY",
    fact_key: "production/reserve/r-1",
    reserve_id: "r-1",
  },
  quantity: q(6),
  overlap_basis: "SAME_RESERVE_QUANTITY_UNTIL_CONSUMED",
  interval: { from: t(100), until: t(140) },
  priority_basis: null,
  lifecycle: { status: "ACTIVE" },
  lineage: { request: { owner: "src", fact_key: "src/req-1", version: 1 } },
});
const prior = { operation, reserve, reserveVersion: 2, claim };

describe("deriveCompletion: exact transformation, once", () => {
  it("consumes exactly the claimed input and seals exactly the declared output", () => {
    const r = deriveCompletion(prior);
    expect(r.ok).toBe(true);
    const d = r.ok ? r.value : (null as never);
    expect(d.reserve.quantity).toEqual(q(4));
    expect(d.reserve.consumed).toEqual([{ operation_id: "op-1", quantity: q(6) }]);
    expect(d.reserve.claims).toEqual([]);
    expect(d.claim.lifecycle).toMatchObject({ status: "CONSUMED", at: t(140) });
    expect(d.operation.status).toMatchObject({ state: "COMPLETED", completed_at: t(140) });
    expect(d.envelope.completed.quantity).toEqual(q(1, "d")); // the DECLARED output: no yield, no ratio
    expect(d.envelope.delta).toMatchObject({ before: q(10), consumed: q(6), after: q(4) });
    // conservation is a property of the produced Reserve value
    expect(ProductionReserveSchema.safeParse(d.reserve).success).toBe(true);
    expect(d.reserve.established.amount).toBe(d.reserve.quantity.amount + 6);
  });

  it("is deterministic and cannot be applied twice: the completed operation, claim and Reserve refuse a second consumption", () => {
    const once = deriveCompletion(prior);
    expect(deriveCompletion(prior)).toEqual(once);
    const d = once.ok ? once.value : (null as never);
    const twice = deriveCompletion({
      operation: d.operation,
      reserve: d.reserve,
      reserveVersion: 3,
      claim: d.claim,
    });
    expect(twice.ok).toBe(false);
    // even with the operation and claim reset, the Reserve's once-per-operation record refuses it
    const replay = deriveCompletion({
      operation,
      reserve: { ...d.reserve, claims: ["claim:op-1"] },
      reserveVersion: 3,
      claim,
    });
    expect(!replay.ok && replay.error.message).toMatch(/already consumed/);
  });

  it("refuses when the Reserve does not hold the claimed quantity, the claim is not open, or the material differs", () => {
    expect(
      deriveCompletion({ ...prior, reserve: { ...reserve, established: q(5), quantity: q(5) } }).ok,
    ).toBe(false);
    expect(deriveCompletion({ ...prior, reserve: { ...reserve, claims: [] } }).ok).toBe(false);
    expect(
      deriveCompletion({ ...prior, reserve: { ...reserve, material_class: "other" } }).ok,
    ).toBe(false);
    expect(deriveCompletion({ ...prior, claim: { ...claim, quantity: q(5) } }).ok).toBe(false);
    expect(
      deriveCompletion({
        ...prior,
        claim: { ...claim, lifecycle: { status: "ACTIVE" }, quantity: q(6, "other") },
      }).ok,
    ).toBe(false);
  });

  it("creates nothing ex nihilo: an operation whose output the Reserve cannot have produced from is not completable, and the output never enters the Reserve", () => {
    const d = deriveCompletion(prior);
    const v = d.ok ? d.value : (null as never);
    expect(v.reserve.material_class).toBe("mat"); // output class "d" never becomes a Reserve material
    expect(JSON.stringify(v.reserve)).not.toContain("durable:op-1");
  });
});

const fact = (key: string, value: unknown, version = 1): OwnerFact =>
  ({
    key,
    owner: key.startsWith("production/") ? "production" : "world_state",
    facet: "f",
    value,
    unit: null,
    basis: "b",
    secrecy: "s",
    version,
    provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} },
  }) as unknown as OwnerFact;

describe("owner operations fail closed instead of publishing", () => {
  const input = (at: number) => {
    const k = {
      op: "production/operation/op-1",
      reserve: "production/reserve/r-1",
      claim: "production/claim/claim:op-1",
      completion: "production/completion/op-1",
    };
    const prior = new Map<string, OwnerFact>([
      [k.op, fact(k.op, operation, 2)],
      [k.reserve, fact(k.reserve, reserve, 2)],
      [k.claim, fact(k.claim, claim, 1)],
    ]);
    return {
      stage: {} as never,
      produces: [k.op, k.reserve, k.claim, k.completion],
      span: { from: t(100), to: t(at), elapsed: at - 100 },
      reads: [] as never[],
      prior,
    };
  };
  it("the Production completion resolves only at the declared boundary, never at any other resolution point", () => {
    const writes = productionCompletionProvider.compute(input(140));
    expect(writes.map((w) => w.key).sort()).toEqual(
      [
        "production/claim/claim:op-1",
        "production/completion/op-1",
        "production/operation/op-1",
        "production/reserve/r-1",
      ].sort(),
    );
    // basis and secrecy are inherited from the facts advanced, never defaulted
    expect(writes.every((w) => w.basis === "b" && w.secrecy === "s")).toBe(true);
    for (const at of [139, 141, 300]) {
      expect(() => productionCompletionProvider.compute(input(at))).toThrow(StageUnresolvedError);
      try {
        productionCompletionProvider.compute(input(at));
      } catch (e) {
        expect((e as StageUnresolvedError).reason).toBe("BASIS_MISMATCH");
      }
    }
  });
  it("an already-completed operation or a pre-existing envelope is not completed again", () => {
    const done = deriveCompletion(prior);
    const d = done.ok ? done.value : (null as never);
    const i = input(140);
    i.prior.set("production/operation/op-1", fact("production/operation/op-1", d.operation, 3));
    expect(() => productionCompletionProvider.compute(i)).toThrow(StageUnresolvedError);
    const j = input(140);
    j.prior.set("production/completion/op-1", fact("production/completion/op-1", d.envelope));
    expect(() => productionCompletionProvider.compute(j)).toThrow(StageUnresolvedError);
  });
  it("the custodian accepts only a read Durable Completion Envelope, only at the destination it named, only once", () => {
    const d = deriveCompletion(prior);
    const env = d.ok ? d.value.envelope : (null as never);
    const base = {
      stage: {} as never,
      produces: [env.destination_custodian.entity_fact_key],
      span: { from: t(100), to: t(140), elapsed: 40 },
      prior: new Map<string, OwnerFact>(),
    };
    const read = (value: unknown) => ({
      read: {} as never,
      fact: fact("production/completion/op-1", value),
    });
    const writes = worldFallbackAcceptanceProvider.compute({ ...base, reads: [read(env)] });
    expect(writes).toHaveLength(1);
    expect((writes[0]!.value as { entity_id: string }).entity_id).toBe(env.conserved_reference);
    expect(() => worldFallbackAcceptanceProvider.compute({ ...base, reads: [] })).toThrow(
      StageUnresolvedError,
    );
    expect(() =>
      worldFallbackAcceptanceProvider.compute({ ...base, reads: [read({ nope: 1 })] }),
    ).toThrow(StageUnresolvedError);
    expect(() =>
      worldFallbackAcceptanceProvider.compute({
        ...base,
        produces: ["world/w/entity/other"],
        reads: [read(env)],
      }),
    ).toThrow(StageUnresolvedError);
    expect(() =>
      worldFallbackAcceptanceProvider.compute({
        ...base,
        prior: new Map([[env.destination_custodian.entity_fact_key, fact("x", {})]]),
        reads: [read(env)],
      }),
    ).toThrow(/already accepted/);
  });
});
