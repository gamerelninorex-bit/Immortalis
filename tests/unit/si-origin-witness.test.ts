/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit raw witness values */
// F-014B A0-T17 — the pure category-8 origin predicate, PREPARATORY AND UNWIRED. NEGATIVE tests only, plus one shape control:
// no T0 category-8 read exists, no calendar profile, no GM canon right; a passing control proves only that a strict witness of the right
// campaign and unit is not malformed — it is NOT a T0 PASS and no acceptance is claimed. The positive read and its placement are B1.
import { describe, expect, it } from "vitest";
import {
  SI_ORIGIN_VIOLATIONS,
  SI_SCALE_DECLARATION,
  TemporalOriginSchema,
  siOriginWitnessViolation,
} from "@immortalis/contracts";
import { syntheticOrigin } from "../support/clock-origin.ts";

const CAMPAIGN = "campaign-a0-predicate";
const CLOCK = { unit: "seconds", value: 120 };
const witness = () => syntheticOrigin(CAMPAIGN);

describe("A0-T17: siOriginWitnessViolation (preparatory, negatives only)", () => {
  it("refuses a witness that is not a strict origin", () => {
    const w = witness() as unknown as Record<string, any>;
    const noScale = Object.fromEntries(Object.entries(w).filter(([k]) => k !== "scale"));
    const malformed: unknown[] = [
      undefined,
      null,
      0,
      "",
      "temporal/origin",
      [],
      {},
      noScale,
      { ...w, extra: true },
      { ...w, format: "immortalis-temporal-origin-v2" },
      { ...w, format_version: 2 },
      { ...w, campaign_id: "" },
      { ...w, origin: { unit: "seconds" } },
      { ...w, origin: { unit: "seconds", value: -1 } },
      { ...w, origin: { unit: "seconds", value: 1.5 } },
      { ...w, chronology: { ...w.chronology, capture_format_version: 1 } },
      { ...w, chronology: { ...w.chronology, grade: "TOOL_CALL_ONLY" } },
      { ...w, chronology: { ...w.chronology, capture_hash: "not-a-hash" } },
      { ...w, governing: { completion: w.governing.completion } },
      { ...w, governing: { ...w.governing, input: { fact_key: "k", version: 0 } } },
    ];
    for (const m of malformed)
      expect(siOriginWitnessViolation(m, CLOCK, CAMPAIGN), JSON.stringify(m)).toBe(
        "ORIGIN_MALFORMED",
      );
  });

  it("refuses another campaign, any other scale, and a unit that is not the clock's", () => {
    expect(siOriginWitnessViolation(witness(), CLOCK, "campaign-other")).toBe("ORIGIN_CAMPAIGN");
    for (const scale of [
      "ONE_SI_MINUTE_PER_CANONICAL_UNIT",
      "one_si_second_per_canonical_unit",
      "",
      1,
      null,
    ])
      expect(
        siOriginWitnessViolation({ ...witness(), scale }, CLOCK, CAMPAIGN),
        String(scale),
      ).toBe("ORIGIN_MALFORMED");
    expect(siOriginWitnessViolation(witness(), { unit: "days", value: 120 }, CAMPAIGN)).toBe(
      "ORIGIN_UNIT",
    );
    expect(
      siOriginWitnessViolation(
        { ...witness(), origin: { unit: "days", value: 0 } },
        CLOCK,
        CAMPAIGN,
      ),
    ).toBe("ORIGIN_UNIT");
    // the closed vocabulary of reasons
    expect([...SI_ORIGIN_VIOLATIONS]).toEqual([
      "ORIGIN_MALFORMED",
      "ORIGIN_CAMPAIGN",
      "ORIGIN_SCALE",
      "ORIGIN_UNIT",
    ]);
  });

  it("shape control only: a strict witness of this campaign in the clock's unit is not malformed (no T0 PASS, no acceptance)", () => {
    expect(TemporalOriginSchema.safeParse(witness()).success).toBe(true);
    expect(witness().scale).toBe(SI_SCALE_DECLARATION);
    expect(siOriginWitnessViolation(witness(), CLOCK, CAMPAIGN)).toBeNull();
  });

  it("is a pure function of its three arguments: it mutates nothing it is handed and needs no store", () => {
    const w = witness();
    const clock = { ...CLOCK };
    const before = JSON.stringify([w, clock]);
    siOriginWitnessViolation(w, clock, CAMPAIGN);
    siOriginWitnessViolation({ ...w, campaign_id: "x" }, clock, CAMPAIGN);
    expect(JSON.stringify([w, clock])).toBe(before);
    expect(siOriginWitnessViolation.length).toBe(3);
  });
});
