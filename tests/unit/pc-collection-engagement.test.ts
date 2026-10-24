/* eslint-disable @typescript-eslint/no-explicit-any -- tests build raw facts */
// BLUE review condition R-3 (conflicting owner/source claims): enrollment is defeated by ANOTHER claim open on the source's account or by
// ANY other Temporal boundary due at or before the work's earned completion — the work's own claim and boundary, and a boundary beyond
// the interval, are not engagements. A pure function of the committed facts; it suppresses nothing.
import { describe, expect, it } from "vitest";
import { foreignEngagementViolation } from "@immortalis/engine";
import {
  TEMPORAL_BOUNDARY_INDEX_KEY,
  productionExtractionObjectId,
  productionSourceAccountKey,
} from "@immortalis/contracts";

const U = "tick";
const at = (value: number) => ({ unit: U, value });
const SOURCE = "src-1";
const WORLD = "world-1";
const OWN = "pc-collect:pc-1:act-a";
const fact = (key: string, value: unknown) => ({ key, value, version: 1 }) as any;
const view = (account: unknown, index: unknown) => {
  const facts = new Map<string, any>();
  if (account !== undefined)
    facts.set(productionSourceAccountKey(WORLD, SOURCE), fact("a", account));
  if (index !== undefined) facts.set(TEMPORAL_BOUNDARY_INDEX_KEY, fact("i", index));
  return { get: (k: string) => facts.get(k), has: (k: string) => facts.has(k) };
};
const account = (...open: string[]) => ({
  source: { fact_key: `world/${WORLD}/source/${SOURCE}`, source_key: SOURCE },
  locality: {
    world: { fact_key: `world/${WORLD}/profile`, entity_id: WORLD },
    locus: { fact_key: `world/${WORLD}/locus/l1`, entity_id: "l1" },
  },
  material_class: "salt",
  unit: "sack",
  watermark: at(0),
  open: [...open]
    .sort()
    .map((id) => ({ extraction_id: id, quantity: { amount: 1, unit: "sack" } })),
});
const entry = (object_id: string, value: number) => ({
  object_id,
  boundary_id: `b-${object_id}`,
  at: at(value),
});
const args = { worldId: WORLD, sourceKey: SOURCE, extractionId: OWN, completesAt: at(21) };

describe("foreignEngagementViolation", () => {
  it("nothing else bears on the source or the interval: no engagement", () => {
    expect(foreignEngagementViolation(view(account(), { entries: [] }), args)).toBeNull();
    expect(foreignEngagementViolation(view(undefined, undefined), args)).toBeNull();
    // the work's own claim and its own boundary are the work, not an engagement
    expect(
      foreignEngagementViolation(
        view(account(OWN), { entries: [entry(productionExtractionObjectId(OWN), 21)] }),
        args,
      ),
    ).toBeNull();
  });

  it("another claim open on the source's account is a conflicting claim and defeats enrollment", () => {
    expect(
      foreignEngagementViolation(view(account("other-extraction"), { entries: [] }), args),
    ).toMatch(/another claim is open on this source/);
    expect(
      foreignEngagementViolation(view(account(OWN, "other-extraction"), { entries: [] }), args),
    ).toMatch(/another claim is open on this source/);
  });

  it("any other boundary due at or before the earned completion defeats enrollment; one beyond it does not", () => {
    for (const due of [1, 20, 21])
      expect(
        foreignEngagementViolation(
          view(account(), { entries: [entry("someone-else", due)] }),
          args,
        ),
        String(due),
      ).toMatch(/another process falls due within the work's interval/);
    expect(
      foreignEngagementViolation(view(account(), { entries: [entry("someone-else", 22)] }), args),
    ).toBeNull();
    // a boundary in another unit cannot be placed outside the interval, so enrollment fails closed rather than guessing
    expect(
      foreignEngagementViolation(
        view(account(), {
          entries: [{ object_id: "x", boundary_id: "b", at: { unit: "other", value: 1 } }],
        }),
        args,
      ),
    ).toMatch(/another process falls due within the work's interval/);
  });
});
