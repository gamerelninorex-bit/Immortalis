// The ORIGIN of canonical time: a starting chronology the setting's author states in an owner-verified file and confirms once. There is
// no default epoch; the same chronology replays; a different one never overwrites; a reopen never resets or re-derives it. (NEWLY
// AUTHORIZED by the bounded semantic delegation; independent BLUE review pending.)
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, StageProviderRegistry, TemporalCoordinator } from "@immortalis/engine";
import { declareClosedSetting, initializeTime, prepareCollection } from "@immortalis/operator";
import { FIXTURE_CAMPAIGN } from "../support/operator.ts";
import { fixtureWorld, publication } from "@immortalis/testkit";
import { copyCampaign, ctxOf, openSession, scriptedTerminal } from "../support/operator.ts";
import { must } from "../support/temporal.ts";
import { ACCESS, LOCUS_ID, SOURCE_KEY, SOURCE_UNIT, WORLD_ID } from "../support/locality.ts";
import { PC_ID } from "../support/observation.ts";
import { ACTUATOR_WORDS, TRAVERSAL_CANNOT, cycleWords } from "../support/pc-collection.ts";
import { SALT, TAU_UNIT } from "../support/pc-collection-original.ts";
import { tempDir } from "../support/tmp.ts";

const chronology = (value = 7, unit = "season", over: Record<string, unknown> = {}) => ({
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit, value },
  statement: `SYNTHETIC FIXTURE: the morning the survey began, season ${value}`,
  ...over,
});
const fileOf = (c: unknown, mode = 0o600): string => {
  const path = join(mkdtempSync(join(tmpdir(), "immortalis-chronology-")), "chronology.json");
  writeFileSync(path, JSON.stringify(c));
  chmodSync(path, mode);
  return path;
};
/** a campaign that holds one ORIGINAL world and no time at all (`world: false` leaves it with no world; a reference mode makes it non-original) */
async function bare(world: "original" | "none" | "reference" = "original") {
  const dir = tempDir("immortalis-time-init-");
  const c = await must(
    CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "time-init-seed" }),
  );
  if (world !== "none")
    await must(
      c.establishWorld({
        ...publication(1),
        world: fixtureWorld(
          world === "reference"
            ? {
                reference_causal_basis: {
                  mode: "EXACT_NAMED_SETTING",
                  setting: "SYNTHETIC FIXTURE: a named reference setting",
                  era_version_continuity: null,
                },
              }
            : {},
        ),
      }),
    );
  await c.close();
  return dir;
}
const timeOf = (s: { campaign: CanonicalCampaign }) =>
  new TemporalCoordinator(s.campaign.store, new StageProviderRegistry()).state()?.value
    .canonical_time;

describe("initialize-time", () => {
  it("writes nothing unless the chronology is owner-verified, valid and confirmed; a campaign starts with no time at all", async () => {
    const s = await openSession(copyCampaign(await bare()));
    expect(timeOf(s)).toBeUndefined();
    const head = s.campaign.store.head().state_sha256;
    const run = (path: string, ...replies: Parameters<typeof scriptedTerminal>) =>
      initializeTime(ctxOf(s, scriptedTerminal(...replies)), path);
    expect((await run(fileOf(chronology(), 0o666), "confirm")).status).toBe("INVALID_INPUT");
    expect((await run(fileOf({ nonsense: true }), "confirm")).status).toBe("INVALID_INPUT");
    expect(
      (await run(fileOf(chronology(7, "season", { epoch: "default" })), "confirm")).status,
    ).toBe("INVALID_INPUT");
    expect((await run(fileOf(chronology()), "decline")).status).toBe("DECLINED");
    expect((await run(fileOf(chronology()), "eof")).status).toBe("DECLINED");
    expect(s.campaign.store.head().state_sha256).toBe(head);
    expect(timeOf(s)).toBeUndefined();
    await s.close();
  }, 120_000);

  it("the delegated author rule covers an ORIGINAL domain only: no world, or a reference-setting world, has no such author and nothing is written", async () => {
    for (const kind of ["none", "reference"] as const) {
      const s = await openSession(copyCampaign(await bare(kind)));
      const head = s.campaign.store.head().state_sha256;
      const t = scriptedTerminal("confirm");
      expect((await initializeTime(ctxOf(s, t), fileOf(chronology()))).status, kind).toBe(
        "UNAVAILABLE",
      );
      expect(t.asked(), kind).toBe(0);
      expect(s.campaign.store.head().state_sha256, kind).toBe(head);
      expect(timeOf(s), kind).toBeUndefined();
      await s.close();
    }
  }, 120_000);

  it("the same ORIGINAL-only rule stops prepare-collection and declare-closed-setting on a reference-setting world: unavailable, nothing asked, nothing written", async () => {
    const preparation = {
      format: "immortalis-collection-preparation",
      format_version: 1,
      mechanism: {
        pc_id: PC_ID,
        mechanism_id: SALT.mechanism,
        claims: [{ section: "embodiment_topology", index: 0 }],
        actuator: { statement: ACTUATOR_WORDS },
        traversal: { statement: TRAVERSAL_CANNOT },
        cycle_duration: TAU_UNIT,
        cycle_quote: cycleWords(TAU_UNIT),
      },
      extraction_basis: {
        basis_id: SALT.basis,
        world_id: WORLD_ID,
        source_key: SOURCE_KEY,
        material_class: SALT.material,
        unit: SOURCE_UNIT,
        relies_on: { ...ACCESS },
      },
      reserve: {
        reserve_id: SALT.reserve,
        material_class: SALT.material,
        quantity: { amount: 0, unit: SOURCE_UNIT },
        condition: "dry",
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
      },
    };
    const declaration = {
      format: "immortalis-closed-setting-declaration",
      format_version: 1,
      world_id: WORLD_ID,
      locus_id: LOCUS_ID,
      domain: { designation: "SYNTHETIC FIXTURE: a place", topology: "SYNTHETIC FIXTURE: closed" },
      closure: { statement: "SYNTHETIC FIXTURE: nothing else acts" },
      source_rights: [{ source_key: SOURCE_KEY, ground: "SYNTHETIC FIXTURE: unclaimed" }],
      workforce_scope: { statement: "SYNTHETIC FIXTURE: the representations held" },
    };
    const s = await openSession(copyCampaign(await bare("reference")));
    const head = s.campaign.store.head().state_sha256;
    const t = scriptedTerminal("confirm", "confirm");
    const prep = await prepareCollection(ctxOf(s, t), fileOf(preparation));
    expect(prep.status).toBe("UNAVAILABLE");
    expect((await declareClosedSetting(ctxOf(s, t), fileOf(declaration))).status).toBe(
      "UNAVAILABLE",
    );
    expect(t.asked()).toBe(0);
    expect(s.campaign.store.head().state_sha256).toBe(head);
    await s.close();
  }, 120_000);

  it("a confirmed chronology is the origin, once: an identical repeat changes nothing, a different one never overwrites, and a reopen never resets it", async () => {
    const dirs = copyCampaign(await bare());
    const s = await openSession(dirs);
    const confirm = () => scriptedTerminal("confirm");
    expect((await initializeTime(ctxOf(s, confirm()), fileOf(chronology(7)))).status).toBe(
      "TIME_ESTABLISHED",
    );
    expect(timeOf(s)).toEqual({ unit: "season", value: 7 });
    const established = s.campaign.store.head().state_sha256;
    // the identical chronology: replayed, no new question needed, nothing written
    const again = scriptedTerminal();
    expect((await initializeTime(ctxOf(s, again), fileOf(chronology(7)))).status).toBe(
      "TIME_ESTABLISHED",
    );
    expect(again.asked()).toBe(0);
    // any other chronology, however confirmed, meets an existing origin and is refused
    for (const other of [
      chronology(8),
      chronology(7, "year"),
      chronology(7, "season", { statement: "SYNTHETIC FIXTURE: another dawn" }),
    ])
      expect((await initializeTime(ctxOf(s, confirm()), fileOf(other))).status).toBe("UNAVAILABLE");
    expect(s.campaign.store.head().state_sha256).toBe(established);
    await s.close();

    // reopen: the origin is durable and is not reset by presenting it (or anything) again
    const r = await openSession(dirs);
    expect(timeOf(r)).toEqual({ unit: "season", value: 7 });
    expect((await initializeTime(ctxOf(r, scriptedTerminal()), fileOf(chronology(7)))).status).toBe(
      "TIME_ESTABLISHED",
    );
    expect((await initializeTime(ctxOf(r, confirm()), fileOf(chronology(9)))).status).toBe(
      "UNAVAILABLE",
    );
    expect(r.campaign.store.head().state_sha256).toBe(established);
    await r.close();
  }, 120_000);
});
