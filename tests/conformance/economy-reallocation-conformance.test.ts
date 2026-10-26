// Conformance evidence for the conserved OOC reallocation between two Economic Holding / Account positions (OOC scenario /
// mechanism proof). Governing source: WS-004 (Working Operational Draft v1.1, lock pin 2026-09-24T11:45:02.825Z) §§2.1,
// 2.2, 3 (holdings are conserved across transfers), 4, 20, 21, 27.14, 28, 30; governing lock: spec/f027/spec-lock.json
// (F-027 v1.0). The frozen artifacts, the register rows, the gates, IA/V, the provider surface and PF-6/F-028 are
// untouched. Nothing here proves a title transfer, payment, settlement, delivery, issuance or in-world consent.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EconomyReallocationSchema,
  ReallocationInstructionInputSchema,
  EconomyHoldingSchema,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  ECONOMY_FACT_KINDS,
  ECONOMY_HOLDING_FACT_KINDS,
  ECONOMY_HOLDING_RULE,
  ECONOMY_RULE,
  EconomyAdapter,
  WS004_SOURCE,
} from "@immortalis/engine";
import { code, gates, lock, register } from "../support/f027.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const kind = ECONOMY_HOLDING_FACT_KINDS.find((k) => k.id === "economy_reallocation")!;

/** Byte-identical to the merged base (#55): this slice consumes them, never edits or duplicates them. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/spec-lock.json": "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "packages/contracts/src/economy.ts":
    "53703c6eab2f1129c27b44f1c03904fdba60e33777523d0d95a570efb8b75e33",
  "packages/engine/src/economy/derive.ts":
    "0248ff1d7999482d69ec7ff289f68334306e95e442cf092595dfb98c9e4e414b",
  "packages/engine/src/economy/integrity.ts":
    "93548d9357bc317fe9dd253956353ee840424ac69eaa41e2287a0f7825e2145b",
  "packages/engine/src/economy/provider.ts":
    "f3140211dc6b86f111799faa0ac42aeb6aebfd472d4132612165c087481bd283",
  "packages/engine/src/economy/declaration.ts":
    "155c19637229779675a2a489ddbcd3a77e33123913ff581fbbc158391bfd16bd",
  "packages/engine/src/persistence/store.ts":
    "2405d8f8d8afa44bcb63e6a5ef73a476b1a3632f63c307c5d615ef7b063f4ff1",
  "packages/engine/src/world/canonical-campaign.ts":
    "db811a1818b2bc7dab57faa55d17d6611a824ab43a20b6decbbcca8e401df30a", // B61-A3 scoped delta (world/canonical-campaign.ts): pinned at the PR #61 head; main da14f15afdd6
};

describe("IA-01 source/version fidelity: the reallocation cites the SAME WS-004 rule at its exact spec-locked pin", () => {
  it("the record kind carries the holding rule unchanged (so no persisted holding or encumbrance changes provenance)", () => {
    const ws004 = lock.frozen_sources.find((s) => s.id === "WS-004")!;
    expect(WS004_SOURCE).toEqual({ artifact: ws004.url, native_pin: ws004.native_pin });
    expect(kind.rule).toEqual(ECONOMY_HOLDING_RULE);
    expect(kind.rule.native_pin).toBe("2026-09-24T11:45:02.825Z");
    expect(kind.im).toBe("IM-06");
    expect(kind.rule.supersedes).toBeNull();
    // the cited conserved-holding, no-double-spend and commitment/conservation clauses are those that govern it
    for (const c of [
      "§3 Persistence / Cardinality Rule",
      "§4 Economic Non-Interchangeability",
      "§20",
    ])
      expect(ECONOMY_HOLDING_RULE.clause).toContain(c);
    // the Demand → Request → Realized Access kinds are as they were
    expect(ECONOMY_FACT_KINDS.map((k) => k.id)).toEqual([
      "economy_demand",
      "economy_request",
      "economy_realization",
    ]);
    for (const k of ECONOMY_FACT_KINDS) expect(k.rule).toEqual(ECONOMY_RULE);
  });
});

describe("IA-03 owner exclusivity: the same Economy owner and facet, one further exclusive key space, create-only", () => {
  it("the record is Economy's, SEALED, at its own key space that no other kind matches", () => {
    expect([...CANONICAL_OWNER_REGISTRY.get("economy")!]).toEqual(["economy_state"]);
    expect(kind.owner).toBe("economy");
    expect(kind.facet).toBe("economy_state");
    expect(kind.lifecycle).toBe("SEALED");
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("economy/reallocation/r1")).map((k) => k.id),
    ).toEqual(["economy_reallocation"]);
    for (const key of ["economy/reallocation", "economy/reallocation/a/b"])
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key))).toEqual([]);
  });

  it("the Economy adapter gained exactly one writer and one reader; no payment, settlement, issuance, spend or amendment writer", () => {
    const methods = adapterMethods(EconomyAdapter);
    expect(methods).toContain("reallocateHoldings");
    expect(methods).toContain("reallocation");
    for (const m of methods)
      expect(m).not.toMatch(
        /transfer|pay|settle|issue(?!Demand)|spend|credit|debit|amend|set[A-Z]|seize|escheat|succe/i,
      );
  });
});

describe("the instruction and the record have no field for an Economy conclusion, an authority or a consent", () => {
  it("the instruction names exactly the campaign, identities, two positions at their versions, and an amount", () => {
    expect(Object.keys(ReallocationInstructionInputSchema.shape).sort()).toEqual([
      "campaign_id",
      "from",
      "instruction_id",
      "quantity",
      "reallocation_id",
      "to",
    ]);
    expect(Object.keys(ReallocationInstructionInputSchema.shape.from.shape).sort()).toEqual([
      "holding_id",
      "holding_version",
    ]);
  });

  it("the record keeps the cause and read basis only — never a resulting position, a verdict or an owner result", () => {
    expect(Object.keys(EconomyReallocationSchema.shape).sort()).toEqual([
      "authorization",
      "from",
      "nature",
      "object_ref",
      "quantity",
      "reallocation_id",
      "to",
    ]);
    expect(Object.keys(EconomyReallocationSchema.shape.from.shape).sort()).toEqual([
      "admitted_at_holding_version",
      "fact_key",
      "holder_ref",
      "holding_id",
    ]);
  });

  it("the position gained only the two optional movement counters; established, restriction and authority are as they were", () => {
    const p = EconomyHoldingSchema.shape.quantity_or_bounded_position.shape;
    expect(Object.keys(p).sort()).toEqual([
      "available",
      "encumbered",
      "established",
      "reallocated_in",
      "reallocated_out",
      "restricted",
      "unit",
    ]);
    expect(p.reallocated_in.isOptional()).toBe(true);
    expect(p.reallocated_out.isOptional()).toBe(true);
    expect(p.restricted.safeParse(1).success).toBe(false);
    expect(EconomyHoldingSchema.shape.restriction_or_authority_ref.safeParse("a").success).toBe(
      false,
    );
  });
});

describe("reuse, not fork: IM-03, IM-11, IM-12 and IM-17 are the existing machinery, and the rule is one shared statement", () => {
  it("the adapter, admission and the load-time verifier all reach the same owner path; derivation is one function", () => {
    for (const f of ["adapter", "admission"])
      expect(code(`packages/engine/src/economy/${f}.ts`)).toMatch(/deriveReallocation\(/);
    expect(code("packages/engine/src/economy/holding-integrity.ts")).toMatch(
      /economy_reallocation/,
    );
    // no second persistence, journal, sidecar or recovery identity
    for (const f of [
      "packages/engine/src/economy/holding.ts",
      "packages/engine/src/economy/adapter.ts",
    ])
      expect(code(f), f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign|new CampaignCore/,
      );
  });

  it("introduces no tick, clock, RNG or scheduler: an immediate relation creates no Temporal stage", () => {
    const forbidden =
      /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|globalTick|cadence|expir\w*|due_at|matur\w*|TemporalObject|registerObject|next_boundary|StageKey|CanonicalTime)\b/;
    for (const f of [
      "packages/contracts/src/economy-holding.ts",
      "packages/engine/src/economy/holding.ts",
      "packages/engine/src/economy/holding-integrity.ts",
    ])
      expect(code(f), f).not.toMatch(forbidden);
  });
});

describe("frozen artifacts, register and gates are untouched; nothing was promoted", () => {
  it("the F-027 snapshot, the Economy modules this slice does not change and the persistence core are byte-identical to the base, except the B61-A3 scoped deltas (PR #61) pinned at its head", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("no register row or gate moved, and IA/V / PF-6 / F-028 remain unactivated", () => {
    for (const row of register) {
      if (row.status === "IMPLEMENTED" || row.status === "VERIFIED")
        expect(row.evidence, row.id).not.toBeNull();
    }
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("CAL-02")).toBe("OPEN_CALIBRATION");
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(Object.keys(lock.snapshot_files).length).toBeGreaterThan(0);
  });
});
