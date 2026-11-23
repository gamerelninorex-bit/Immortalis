import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  WORKSHOP_FACT_KINDS,
  canonicalAdmission,
  sha256Canonical,
} from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";

const baseCatalogue = "7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed";
type KindEntry = { readonly id: string; readonly value_schema_fp: string };
const entries = (sha: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../packages/engine/gm-wait-catalogue/manifests/${sha}.json`, import.meta.url),
      "utf8",
    ),
  ).kinds as KindEntry[];

describe("B3 catalogue and historical source custody", () => {
  it("T107, adds exactly the ten granted kinds and preserves every earlier entry", () => {
    const original = entries(baseCatalogue);
    const head = entries(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    const previous = new Set(original.map(({ id }) => id));
    expect(head.filter(({ id }) => previous.has(id))).toEqual(original);
    expect(
      head
        .filter(({ id }) => !previous.has(id))
        .map(({ id }) => id)
        .sort(),
    ).toEqual(WORKSHOP_FACT_KINDS.map(({ id }) => id).sort());
    expect(ALL_FACT_KINDS).toHaveLength(original.length + 10);
    const instrument = head.find(({ id }) => id === "gip_governance_instrument");
    expect(instrument?.value_schema_fp).toBe(
      "deaa7427138be17680a43ae60721e0e659457c30cf54c67f3c7189be25e1b792",
    );
    expect(sha256Canonical(instrument)).toBe(
      sha256Canonical(original.find(({ id }) => id === "gip_governance_instrument")),
    );
  });

  it("keeps the pre-B3 production history verifier", () => {
    expect(canonicalAdmission.historyVerificationId).toMatch(
      /GM-WAIT-W2-CUSTODY-V1@2026-11-22T17:48:36\.869Z$/,
    );
  });
});
