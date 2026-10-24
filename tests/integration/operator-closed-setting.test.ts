// declare-closed-setting: the setting author's declaration (NEWLY AUTHORIZED under the bounded semantic delegation; independent BLUE review
// pending). The author states the domain, the closure and per-source grounds; the owners DERIVE who and what is held, and treat the
// declaration as STALE the moment any of it changes, until the author declares again (a new version that re-opens every act).
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PcCollectionAdapter, PopulationAdapter } from "@immortalis/engine";
import { declareClosedSetting } from "@immortalis/operator";
import { popPublication } from "@immortalis/testkit";
import { LOCALITY_CAMPAIGN, LOCUS_ID, SOURCE_KEY, WORLD_ID } from "../support/locality.ts";
import { observationCampaign } from "../support/observation.ts";
import { ctxOf, fixedIds, openSession, scriptedTerminal } from "../support/operator.ts";

const declaration = (over: Record<string, unknown> = {}) => ({
  format: "immortalis-closed-setting-declaration",
  format_version: 1,
  world_id: WORLD_ID,
  locus_id: LOCUS_ID,
  domain: {
    designation: "SYNTHETIC FIXTURE: the pans",
    topology: "SYNTHETIC FIXTURE: ringed by cliffs",
  },
  closure: { statement: "SYNTHETIC FIXTURE: nothing else acts here beyond what the owners cover" },
  source_rights: [
    { source_key: SOURCE_KEY, ground: "SYNTHETIC FIXTURE: no claim on the salt is established" },
  ],
  workforce_scope: { statement: "SYNTHETIC FIXTURE: the representations held are all there are" },
  ...over,
});
const fileOf = (c: unknown, mode = 0o600): string => {
  const path = join(mkdtempSync(join(tmpdir(), "immortalis-closed-")), "declaration.json");
  writeFileSync(path, JSON.stringify(c));
  chmodSync(path, mode);
  return path;
};

describe("declare-closed-setting", () => {
  it("writes nothing unless the declaration is owner-verified, valid, about sources of this very locus, and confirmed", async () => {
    const { dirs } = await observationCampaign();
    const s = await openSession(dirs, { expectedCampaignId: LOCALITY_CAMPAIGN });
    const head = s.campaign.store.head().state_sha256;
    const run = (path: string, ...replies: Parameters<typeof scriptedTerminal>) =>
      declareClosedSetting(ctxOf(s, scriptedTerminal(...replies), fixedIds("d")), path);
    expect((await run(fileOf(declaration(), 0o666), "confirm")).status).toBe("INVALID_INPUT");
    expect((await run(fileOf({ nonsense: true }), "confirm")).status).toBe("INVALID_INPUT");
    // a covered-set the author tries to state is not representable: the strict schema has no field for it
    expect((await run(fileOf(declaration({ covered: { pcs: [] } })), "confirm")).status).toBe(
      "INVALID_INPUT",
    );
    expect((await run(fileOf(declaration()), "decline")).status).toBe("DECLINED");
    expect((await run(fileOf(declaration()), "eof")).status).toBe("DECLINED");
    // a right over a source that is not established at this locus is refused by the owner's admission
    expect(
      (
        await run(
          fileOf(
            declaration({
              source_rights: [
                { source_key: "src-nowhere", ground: "SYNTHETIC FIXTURE: a right over nothing" },
              ],
            }),
          ),
          "confirm",
        )
      ).status,
    ).toBe("UNAVAILABLE");
    expect(s.campaign.store.head().state_sha256).toBe(head);
    expect(
      new PcCollectionAdapter(s.campaign.store).sceneClosure(WORLD_ID, LOCUS_ID),
    ).toBeUndefined();
    await s.close();
  }, 180_000);

  it("what the owners hold changes → the declaration is STALE and the author must declare again; the new version is derived afresh", async () => {
    const { dirs } = await observationCampaign();
    const s = await openSession(dirs, { expectedCampaignId: LOCALITY_CAMPAIGN });
    const adapter = new PcCollectionAdapter(s.campaign.store);
    expect(
      (
        await declareClosedSetting(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("d")),
          fileOf(declaration()),
        )
      ).status,
    ).toBe("SETTING_DECLARED");
    const v1 = adapter.sceneClosure(WORLD_ID, LOCUS_ID)!;
    expect(v1.fact.version).toBe(1);
    expect(adapter.sceneClosureIsCurrent(WORLD_ID, LOCUS_ID)).toBe(true);
    expect(adapter.workforceScopeIsCurrent(WORLD_ID, LOCUS_ID)).toBe(true);

    // a resident ledger now attaches to the pans (Population's own fact): the closure and the scope covered the owners as they were
    const ledger = await new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(77),
      ledger: {
        ledger_id: "ledger-late",
        unit_class: "synthetic-unit-class",
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
        units: [
          {
            unit_id: "unit-late",
            residence: "place-x",
            presence: LOCUS_ID,
            burden_allocation: null,
          },
        ],
        point: { unit: "tick", value: 100 },
      },
    });
    expect(ledger.ok, JSON.stringify(ledger)).toBe(true);
    expect(adapter.sceneClosureIsCurrent(WORLD_ID, LOCUS_ID)).toBe(false);
    expect(adapter.workforceScopeIsCurrent(WORLD_ID, LOCUS_ID)).toBe(false);

    // the author declares again: a NEW version, with the derived coverage now including what is held
    expect(
      (
        await declareClosedSetting(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("d")),
          fileOf(declaration()),
        )
      ).status,
    ).toBe("SETTING_DECLARED");
    const v2 = adapter.sceneClosure(WORLD_ID, LOCUS_ID)!;
    expect(v2.fact.version).toBe(2);
    expect(v2.value.covered.population_ledgers.map((l) => l.fact_key)).toEqual([
      "population/ledger-late/ledger",
    ]);
    expect(adapter.sceneClosureIsCurrent(WORLD_ID, LOCUS_ID)).toBe(true);
    expect(adapter.workforceScope(WORLD_ID, LOCUS_ID)!.value.accounted).toEqual([
      expect.objectContaining({ ledger_id: "ledger-late", count: 1, unit_ids: ["unit-late"] }),
    ]);
    await s.close();
  }, 180_000);
});
