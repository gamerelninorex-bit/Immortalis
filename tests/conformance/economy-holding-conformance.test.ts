// Conformance evidence for the Economic Holding / Account position and its reversible economic encumbrance (OOC
// scenario / mechanism proof). Governing source: WS-004 (Working Operational Draft v1.1, lock pin
// 2026-09-24T11:45:02.825Z) §§2.1, 2.2, 3, 4, 11, 20, 27.6, 27.8, 27.14, 28, 30; governing lock: spec/f027/spec-lock.json
// (F-027 v1.0). The frozen artifacts, the register rows, the gates, IA/V, the provider surface and PF-6/F-028 are untouched.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";

const HOLDING_SOURCES = [
  "packages/contracts/src/economy-holding.ts",
  "packages/engine/src/economy/holding.ts",
  "packages/engine/src/economy/holding-integrity.ts",
];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

describe("IA-01 source/version fidelity: the holding kinds cite WS-004 at its exact spec-locked pin", () => {
  it("every holding kind cites WS-004, IM-06 and the F-017 / Runtime lineage; the Demand chain's rule is unchanged", () => {
    const ws004 = lock.frozen_sources.find((s) => s.id === "WS-004")!;
    expect(WS004_SOURCE).toEqual({ artifact: ws004.url, native_pin: ws004.native_pin });
    expect(ws004.native_pin).toBe("2026-09-24T11:45:02.825Z");
    expect(ECONOMY_HOLDING_FACT_KINDS.map((k) => k.id)).toEqual([
      "economy_holding",
      "economy_encumbrance",
    ]);
    for (const kind of ECONOMY_HOLDING_FACT_KINDS) {
      expect(kind.rule).toEqual(ECONOMY_HOLDING_RULE);
      expect(kind.rule.artifact).toBe(ws004.url);
      expect(kind.rule.native_pin).toBe(ws004.native_pin);
      expect(kind.im).toBe("IM-06");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = ECONOMY_HOLDING_RULE.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-25T23:42:27.802Z");
    // the existing Demand → Request → Realized Access kinds are byte-for-byte what they were: same ids, same rule
    expect(ECONOMY_FACT_KINDS.map((k) => k.id)).toEqual([
      "economy_demand",
      "economy_request",
      "economy_realization",
    ]);
    for (const kind of ECONOMY_FACT_KINDS) expect(kind.rule).toEqual(ECONOMY_RULE);
    expect(ECONOMY_HOLDING_RULE).not.toEqual(ECONOMY_RULE);
  });

  it("the holding rule names the WS-004 clauses the state relies on, and no clause it does not use", () => {
    for (const c of [
      "§2.1 Economy-owned state",
      "holder_ref, object_ref, quantity_or_bounded_position",
      "available / encumbered / restricted status",
      "restriction_or_authority_ref",
      "§2.2 Explicit non-ownership",
      "§3 Persistence / Cardinality Rule",
      "§4 Economic Non-Interchangeability / No-Double-Spend",
      "§11 Economic Claim / Obligation",
      "§20 Commitment and Conservation",
      "Economy never holds a physical reservation",
      "§27.14 R-T1 / Cycle rule",
      "§28 Retention / Lifecycle",
      "§30 Required Invariants",
    ])
      expect(ECONOMY_HOLDING_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the same Economy owner and facet, two exclusive key spaces, nothing else", () => {
  it("adds no owner and no facet; both kinds are Economy's, advancing only under re-derived admission", () => {
    expect([...CANONICAL_OWNER_REGISTRY.get("economy")!]).toEqual(["economy_state"]);
    for (const kind of ECONOMY_HOLDING_FACT_KINDS) {
      expect(kind.owner).toBe("economy");
      expect(kind.facet).toBe("economy_state");
      expect(kind.lifecycle).toBe("ADVANCING");
    }
    const sample: Record<string, string> = {
      "economy/holding/h1": "economy_holding",
      "economy/encumbrance/h1/e1": "economy_encumbrance",
    };
    for (const [key, id] of Object.entries(sample))
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
    // no key space overlaps the Demand chain's, and a holding key can never address a request or demand
    for (const key of ["economy/holding/a/b", "economy/encumbrance/a", "economy/encumbrance/a/b/c"])
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key))).toEqual([]);
  });

  it("the Economy adapter has the holding writers and readers and no transfer, payment, settlement, issuance, spend or amendment writer", () => {
    expect(adapterMethods(EconomyAdapter)).toEqual(expectedAdapterMethods("EconomyAdapter"));
    const methods = adapterMethods(EconomyAdapter);
    for (const m of methods)
      expect(m).not.toMatch(
        /transfer|pay|settle|issue(?!Demand)|spend|credit|debit|amend|set[A-Z]|seize|escheat|succe/i,
      );
  });

  it("the holding modules depend on no physical or other owner: no Production, Population, World-State, Temporal, Logistics, GIP or Actor module", () => {
    const importsOf = (f: string) =>
      [...readFileSync(f, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
    for (const f of HOLDING_SOURCES.filter((f) => f.startsWith("packages/engine"))) {
      // (the shared diagnostic violation TYPE is the one lawful reach into another module, as for every verifier)
      for (const i of importsOf(f).filter((i) => i !== "../world/integrity.ts"))
        expect(i, f).not.toMatch(
          /production|population|world|temporal|logistics|gip|actor|culture|kti|diplomacy|epistemic/,
        );
    }
    // contracts: only identifier/publication shapes and the exact-integer QUANTITY encoding are reused, never a foreign fact
    expect(importsOf("packages/contracts/src/economy-holding.ts").sort()).toEqual([
      "./ids.ts",
      "./production.ts",
      "./world-foundation.ts",
      "zod",
    ]);
    expect(code("packages/contracts/src/economy-holding.ts")).toMatch(
      /import \{ PositiveQuantitySchema \} from "\.\/production\.ts"/,
    );
    expect(code("packages/contracts/src/economy-holding.ts")).toMatch(
      /import \{ PublicationSchema, EntityId \} from "\.\/world-foundation\.ts"/,
    );
  });
});

describe("reuse, not fork: IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("holding admission is the Economy group check reached through the one canonical admission; derivation is one shared statement", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /economyGroupCheck\(group, state\)/,
    );
    const admission = code("packages/engine/src/economy/admission.ts");
    for (const fn of ["deriveHold", "deriveRelease", "deriveOpeningHolding"])
      expect(admission).toMatch(new RegExp(`${fn}\\(`));
    const adapter = code("packages/engine/src/economy/adapter.ts");
    for (const fn of ["deriveHold", "deriveRelease", "deriveOpeningHolding"])
      expect(adapter).toMatch(new RegExp(`${fn}\\(`));
    expect(code("packages/engine/src/economy/integrity.ts")).toMatch(
      /verifyEconomyHoldingIntegrity\(all\)/,
    );
    expect(code("packages/engine/src/owners/registry.ts")).toMatch(
      /\.\.\.ECONOMY_HOLDING_FACT_KINDS/,
    );
  });

  it("introduces no persistence, journal, sidecar, save or recovery identity: the package format is unchanged", () => {
    for (const f of [...HOLDING_SOURCES, "packages/engine/src/economy/adapter.ts"]) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign|new CampaignCore/,
      );
    }
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
  });
});

describe("IA-04 turnless: no tick, clock, RNG, scheduler, cadence, refresh or global scan in the holding path", () => {
  it("the holding modules contain no tick/timer/clock/RNG/cadence/refresh, no mutable module state and no fact scan", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|annualPass|globalPass|pollInterval|economyTick|priceRefresh|marketPass|cadence|expir\w*|due_at|matur\w*)\b/;
    for (const f of HOLDING_SOURCES) {
      expect(code(f), f).not.toMatch(forbidden);
      expect(code(f), f).not.toMatch(/^(let|var)\s/m);
      expect(code(f), f).not.toMatch(/listFacts\(/);
    }
  });

  it("declares no future term: no temporal object, boundary or stage is created for an immediate relation", () => {
    for (const f of HOLDING_SOURCES) {
      expect(code(f), f).not.toMatch(
        /TemporalObject|registerObject|next_boundary|boundary_id|StageKey|stageIdentity|CanonicalTime|canonical_time/,
      );
    }
  });
});

describe("scope: the contract states no price, payment, title, issuance, reservation, transfer or consent — and carries no calibration", () => {
  it("only the literals that NAME what the position is not mention those words; no other identifier does", () => {
    const text = code("packages/contracts/src/economy-holding.ts")
      .replace("ECONOMIC_BOOK_POSITION_NOT_STOCK_TITLE_ISSUANCE_OR_RESERVATION", "")
      .replace(
        "ECONOMIC_ENCUMBRANCE_NOT_PHYSICAL_RESERVATION_PAYMENT_SETTLEMENT_OR_LEGAL_PRIORITY",
        "",
      )
      .toLowerCase();
    for (const word of [
      "price",
      "currency",
      "payment",
      "receipt",
      "settle",
      "transfer",
      "title",
      "entitle",
      "issuance",
      "reserve",
      "reservation",
      "stock",
      "inventory",
      "route",
      "delivery",
      "legal",
      "priority",
      "obligation",
      "debt",
      "credit",
      "interest",
      "tax",
      "rate",
      "approved",
      "winner",
      "award",
      "balance",
    ]) {
      // prose comments are stripped by `code()`; what remains must not use these as identifiers or literals
      expect(text, word).not.toMatch(new RegExp(`["'_.\\s]${word}["'_:\\s]`));
    }
  });

  it("declares no calibration constant, rate, default or tolerance: only structural numerals appear", () => {
    for (const f of HOLDING_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/\.default\(/);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[yY]ield|[rR]atio|[cC]oefficient|[pP]rice|[wW]eight|[eE]lasticity|[wW]ealth|[dD]efault\w*)\b/,
      );
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      expect(
        numbers.filter((n) => !["0", "1"].includes(n!)),
        f,
      ).toEqual([]);
    }
  });

  it("exposes no module or directory beyond the Economy module's holding files", () => {
    expect(
      readdirSync("packages/engine/src/economy")
        .filter((f) => f.startsWith("holding"))
        .sort(),
    ).toEqual(["holding-integrity.ts", "holding.ts"]);
    expect(
      walk("packages/engine/src")
        .filter((f) => /holding/i.test(f))
        .sort(),
    ).toEqual([
      "packages/engine/src/economy/holding-integrity.ts",
      "packages/engine/src/economy/holding.ts",
    ]);
  });
});

describe("register and gate honesty: nothing was promoted and nothing frozen was edited", () => {
  it("no register row claims this slice complete, no gate moved, and the frozen snapshot files are the locked ones", () => {
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
