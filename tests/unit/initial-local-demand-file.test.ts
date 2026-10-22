/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw demand documents */
// The identity of a confirmed process proposal is a pure function of the authored content and the campaign: the same proposal always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is never
// mistaken for the committed one). The file is read once, strictly: exactly the unchanged `IssueDemandInput` and `StartOperationInput`,
// with nothing added, defaulted, relaxed or inferred, and every expected value is written out independently of the owner adapters.
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EconomyDemandEnvelopeSchema,
  IssueDemandInputSchema,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  StartOperationInputSchema,
  economyRequestKey,
} from "@immortalis/contracts";
import {
  expectedDemand,
  expectedRequest,
  expectedStart,
  initialLocalDemandId,
  readInitialLocalDemandFile,
} from "@immortalis/operator";
import {
  DEMAND_ID,
  INPUT_AMOUNT,
  LEDGER_ID,
  OPERATION_ID,
  RESERVE_ID,
  T_DUE,
  T_OPEN,
  WORLD_ID,
  LOCUS_ID,
  demandDoc,
  writeDemand,
} from "../support/initial-local-demand.ts";

const read = (d: unknown) => {
  const r = readInitialLocalDemandFile(writeDemand(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code} ${JSON.stringify(r.error.details)}`);
  return r.value;
};
const refused = (d: unknown, mode?: number) => readInitialLocalDemandFile(writeDemand(d, mode));

describe("initialLocalDemandId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = initialLocalDemandId("c1", read(demandDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(initialLocalDemandId("c1", read(demandDoc()))).toBe(a);
    const d = demandDoc();
    const reordered = {
      production: {
        completion_at: d.production.completion_at,
        transformation: {
          output_condition: d.production.transformation.output_condition,
          output_class: d.production.transformation.output_class,
          output_quantity: d.production.transformation.output_quantity,
          input_quantity: d.production.transformation.input_quantity,
        },
        reserve_id: d.production.reserve_id,
        request_key: d.production.request_key,
      },
      demand: d.demand,
      format_version: 1,
      format: "immortalis-initial-local-demand",
    };
    expect(initialLocalDemandId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the carrier Unit", (d) => (d.demand.carrier.unit_id = "unit-02")],
    ["the demanded quantity", (d) => (d.demand.demand_entry.quantity.amount = 2)],
    ["the Reserve", (d) => (d.production.reserve_id = "reserve-other")],
    ["the input quantity", (d) => (d.production.transformation.input_quantity.amount += 1)],
    ["the output condition", (d) => (d.production.transformation.output_condition = "wet")],
    ["the declared boundary", (d) => (d.production.completion_at.value += 1)],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = initialLocalDemandId("c1", read(demandDoc()));
      const doc = demandDoc();
      change(doc);
      expect(initialLocalDemandId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the demand identifier (and the request key it fixes) and with the campaign", () => {
    const base = initialLocalDemandId("c1", read(demandDoc()));
    const doc = demandDoc();
    doc.demand.demand_envelope_id = "demand-x";
    doc.production.request_key = economyRequestKey("request:demand-x");
    expect(initialLocalDemandId("c1", read(doc))).not.toBe(base);
    expect(initialLocalDemandId("c2", read(demandDoc()))).not.toBe(base);
  });
});

describe("readInitialLocalDemandFile accepts exactly the unchanged strict demand input and start input", () => {
  it("returns exactly what was authored, and the owner schemas have exactly their unchanged fields", () => {
    const doc = demandDoc();
    const got = read(doc);
    expect(got.demand).toEqual(doc.demand);
    expect(got.production).toEqual(doc.production);
    expect(Object.keys(IssueDemandInputSchema.shape).sort()).toEqual(
      ["carrier", "demand_entry", "demand_envelope_id"].sort(),
    );
    expect(Object.keys(StartOperationInputSchema.shape).sort()).toEqual(
      ["completion_at", "request_key", "reserve_id", "transformation"].sort(),
    );
  });

  it("the production act names the request THIS demand allocates to: any other request is refused", () => {
    const d = demandDoc();
    d.production.request_key = economyRequestKey("request:demand-other");
    expect(refused(d)).toMatchObject({ ok: false, error: { code: "INVALID_PROCESS" } });
  });

  it("does not default a missing production act, boundary, output condition or format", () => {
    const noProduction = demandDoc();
    delete noProduction.production;
    const noBoundary = demandDoc();
    delete noBoundary.production.completion_at;
    const noCondition = demandDoc();
    delete noCondition.production.transformation.output_condition;
    const noFormat = demandDoc();
    delete noFormat.format;
    for (const d of [noProduction, noBoundary, noCondition, noFormat])
      expect(refused(d)).toMatchObject({ ok: false, error: { code: "INVALID_PROCESS" } });
  });

  it("derives the owners' exact values independently: sealed AS-OF-NOW availability, one request, one in-progress operation and claim, the Reserve holding the claim", () => {
    const doc = read(demandDoc());
    const world = { fact_key: `world/${WORLD_ID}/profile`, entity_id: WORLD_ID };
    const locus = { fact_key: `world/${WORLD_ID}/locus/${LOCUS_ID}`, entity_id: LOCUS_ID };
    const demand = expectedDemand(doc, {
      ledgerVersion: 1,
      cohortVersion: null,
      world,
      locus,
      at: T_OPEN,
      clockVersion: 1,
    });
    expect(EconomyDemandEnvelopeSchema.safeParse(demand).success).toBe(true);
    expect(demand.carrier_basis_ref).toEqual({
      ledger: { fact_key: `population/${LEDGER_ID}/ledger`, version: 1 },
      cohort: null,
    });
    expect(demand.pre_commit_availability).toMatchObject({
      read: "AS-OF-NOW",
      at: T_OPEN,
      supply_for_request: "ABSENT",
    });
    expect(demand.allocation.relation).toBe("ONE_DEMAND_ONE_PRODUCTION_REQUEST");
    expect(demand.allocation.request.request_id).toBe(OPERATION_ID);

    const request = expectedRequest(demand);
    expect(ProductionRequestSchema.safeParse(request).success).toBe(true);
    expect(request).toMatchObject({
      request_id: OPERATION_ID,
      source: { owner: "economy", cause_ref: `economy/demand/${DEMAND_ID}` },
      priority_authority_ref: null,
    });

    const start = expectedStart(doc, {
      at: T_OPEN,
      reserve: {
        reserve_id: RESERVE_ID,
        material_class: "raw-salt",
        established: { amount: 15, unit: "sack" },
        quantity: { amount: 15, unit: "sack" },
        consumed: [],
        condition: "dry-stacked",
        locality: { world, locus },
        holding: "HELD_LOCAL_BY_PRODUCTION",
        claims: [],
      },
    });
    expect(ProductionOperationSchema.safeParse(start.operation).success).toBe(true);
    expect(ProductionClaimSchema.safeParse(start.claim).success).toBe(true);
    expect(start.operation.status).toEqual({ state: "IN_PROGRESS" });
    expect(start.operation.timing.completion.at).toEqual(T_DUE);
    expect(start.operation.support_basis).toEqual({
      tier: "TIER_A_EMBEDDED_BASELINE",
      labor: "NON_MATERIAL_EMBEDDED",
      specialist_competence: "NON_MATERIAL",
    });
    expect(start.claim.quantity.amount).toBe(INPUT_AMOUNT);
    expect(start.claim.priority_basis).toBeNull();
    expect(start.reserve.claims).toEqual([`claim:${OPERATION_ID}`]);
    // a claim is not consumption
    expect(start.reserve.quantity).toEqual({ amount: 15, unit: "sack" });
    expect(start.reserve.consumed).toEqual([]);
  });
});

describe("a file that is not trustworthy is never read as a proposal", () => {
  it("a file others can write, a link, a directory and a missing file", () => {
    const writable = writeDemand(demandDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect(readInitialLocalDemandFile(writable)).toMatchObject({
      ok: false,
      error: { code: "PROCESS_FILE_UNTRUSTED" },
    });
    const real = writeDemand(demandDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect(readInitialLocalDemandFile(link)).toMatchObject({
      ok: false,
      error: { code: "PROCESS_FILE_UNREADABLE" },
    });
    expect(readInitialLocalDemandFile(dirname(real))).toMatchObject({
      ok: false,
      error: { code: "PROCESS_FILE_UNTRUSTED" },
    });
    expect(readInitialLocalDemandFile(join(dirname(real), "absent.json"))).toMatchObject({
      ok: false,
      error: { code: "PROCESS_FILE_UNREADABLE" },
    });
  });

  it("a group-writable file and a file larger than a demand can be", () => {
    const f = writeDemand(demandDoc());
    chmodSync(f, 0o620);
    expect(readInitialLocalDemandFile(f)).toMatchObject({
      ok: false,
      error: { code: "PROCESS_FILE_UNTRUSTED" },
    });
    const big = join(dirname(writeDemand(demandDoc())), "big.json");
    writeFileSync(big, " ".repeat(70_000) + JSON.stringify(demandDoc()));
    chmodSync(big, 0o600);
    expect(readInitialLocalDemandFile(big)).toMatchObject({
      ok: false,
      error: { code: "INVALID_PROCESS" },
    });
  });

  it("not JSON, a list, empty", () => {
    for (const text of ["{not json", "[]", "", "null"])
      expect(refused(text)).toMatchObject({ ok: false, error: { code: "INVALID_PROCESS" } });
  });
});
