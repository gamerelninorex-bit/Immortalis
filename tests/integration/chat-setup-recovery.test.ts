/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// The phone bridge's OWNER READBACK of a setup command that ended without a definite outcome (apps/phone/src/setup-recovery.ts), against REAL
// campaigns and the REAL operator commands. EVERYTHING IN THIS FILE IS A MECHANISM TEST: the terminals are scripted confirmations
// (plumbing only), nothing is a player's or a game master's choice, and no AI reads anything.
//
// What it proves: the identity taken from the setting document BEFORE dispatch is exactly the one the operator's own publications carry
// (the real commands are run and the owners' committed groups are then read by it), so none, some and all of a setup's publications are
// told apart; a different document never stands in for the original; and a partial preparation is reported as partial, not complete.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { LocalOperatorSession, initializeTime, prepareCollection } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  FIXTURE_CAMPAIGN,
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { must } from "../support/temporal.ts";
import { ACTUATOR_WORDS, TRAVERSAL_CANNOT, cycleWords } from "../support/pc-collection.ts";
import { SALT, TAU_UNIT } from "../support/pc-collection-original.ts";
import {
  ACCESS,
  LOCUS_ID,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  LOCALITY_CAMPAIGN,
} from "../support/locality.ts";
import { PC_ID, PC_WORDS, observationCampaign } from "../support/observation.ts";
import { tempDir } from "../support/tmp.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import {
  SETUP_COMMANDS,
  captureSetup,
  setupEvidence,
  validSetupIdentity,
} from "../../apps/phone/src/setup-recovery.ts";

const cfg = (dirs: { campaignDir: string; operatorDir: string }): PhoneConfig =>
  ({ ...dirs, campaignId: FIXTURE_CAMPAIGN }) as unknown as PhoneConfig;

const fileOf = (text: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "immortalis-setup-recovery-")), "setup.json");
  writeFileSync(path, text);
  chmodSync(path, 0o600);
  return path;
};

// -- initialize-time ----------------------------------------------------------------------------------------------------------------
const chronologyText = (
  value = 7,
  statement = `SYNTHETIC FIXTURE: the morning the survey began, season ${value}`,
) =>
  JSON.stringify({
    format: "immortalis-starting-chronology",
    format_version: 1,
    time: { unit: "season", value },
    statement,
  });

/** a campaign that holds one ORIGINAL world and no time at all */
async function bare(): Promise<string> {
  const dir = tempDir("immortalis-setup-recovery-bare-");
  const c = await must(
    CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "setup-recovery-seed" }),
  );
  await must(c.establishWorld({ ...publication(1), world: fixtureWorld({}) }));
  await c.close();
  return dir;
}

describe("MECHANISM (24 October repair): the owner readback of initialize-time, by the identity of the original document", () => {
  it("is NONE before the command, COMPLETE after the REAL command (so the identity is the operator's own), and a different chronology is NONE even though an origin exists", async () => {
    const dirs = copyCampaign(await bare());
    const config = cfg(dirs);
    const original = captureSetup(config, "initialize-time", chronologyText(7))!;
    expect(validSetupIdentity(original)).toBe(true);
    expect(original.intents).toHaveLength(1);
    expect(await setupEvidence(config, original)).toEqual({ kind: "NONE" });

    const s = await openSession(dirs);
    expect(
      (await initializeTime(ctxOf(s, scriptedTerminal("confirm")), fileOf(chronologyText(7))))
        .status,
    ).toBe("TIME_ESTABLISHED");
    await s.close();

    expect(await setupEvidence(config, original)).toEqual({ kind: "COMPLETE" });
    // a different document is a different identity: the existing origin is not its evidence
    for (const other of [chronologyText(8), chronologyText(7, "SYNTHETIC FIXTURE: another dawn")]) {
      const id = captureSetup(config, "initialize-time", other)!;
      expect(id.digest).not.toBe(original.digest);
      expect(await setupEvidence(config, id)).toEqual({ kind: "NONE" });
    }
    // the pin of what was dispatched follows the exact text
    expect(captureSetup(config, "initialize-time", chronologyText(7))!.document_sha256).toBe(
      original.document_sha256,
    );
    expect(
      captureSetup(config, "initialize-time", `${chronologyText(7)} `)!.document_sha256,
    ).not.toBe(original.document_sha256);
    // the same words in another campaign are another identity
    expect(
      captureSetup(
        { ...config, campaignId: "another-campaign" } as PhoneConfig,
        "initialize-time",
        chronologyText(7),
      )!.digest,
    ).not.toBe(original.digest);
  }, 180_000);

  it("a campaign it does not belong to is UNAVAILABLE, never empty or complete", async () => {
    const dirs = copyCampaign(await bare());
    const id = captureSetup(cfg(dirs), "initialize-time", chronologyText(7))!;
    const foreign = await setupEvidence(
      { ...cfg(dirs), campaignId: "another-campaign" } as PhoneConfig,
      id,
    );
    expect(foreign.kind).toBe("UNAVAILABLE");
    const missing = await setupEvidence(
      { ...cfg(dirs), campaignDir: join(dirs.campaignDir, "nowhere") } as PhoneConfig,
      id,
    );
    expect(missing.kind).toBe("UNAVAILABLE");
    // an identity taken for another campaign is not read against this one, even when its publications' names happen to be absent here
    const elsewhere = captureSetup(
      { ...cfg(dirs), campaignId: "another-campaign" } as PhoneConfig,
      "initialize-time",
      chronologyText(7),
    )!;
    expect((await setupEvidence(cfg(dirs), elsewhere)).kind).toBe("UNAVAILABLE");
  }, 120_000);
});

// -- prepare-collection -------------------------------------------------------------------------------------------------------------
const preparationOf = () => ({
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
    material_class: "raw-salt",
    unit: SOURCE_UNIT,
    relies_on: { ...ACCESS },
  },
  reserve: {
    reserve_id: SALT.reserve,
    material_class: "raw-salt",
    quantity: { amount: 0, unit: SOURCE_UNIT },
    condition: "dry",
    world_id: WORLD_ID,
    locus_id: LOCUS_ID,
  },
});

/** a REAL original character, bound and located through the shipped commands, with canonical time and nothing prepared for a collection */
async function unprepared() {
  const embodiment = `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${cycleWords(TAU_UNIT)}; ${TRAVERSAL_CANNOT}`;
  return (await observationCampaign({ words: { embodiment } })).dirs;
}
const operatorSession = async (dirs: { campaignDir: string; operatorDir: string }) => {
  const opened = await LocalOperatorSession.open({
    campaignDir: dirs.campaignDir,
    operatorDir: dirs.operatorDir,
    expectedCampaignId: LOCALITY_CAMPAIGN,
  });
  if (!opened.ok) throw new Error(`session did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
};
const realCfg = (dirs: { campaignDir: string; operatorDir: string }): PhoneConfig =>
  ({ ...dirs, campaignId: LOCALITY_CAMPAIGN }) as unknown as PhoneConfig;

describe("MECHANISM (24 October repair): the owner readback of prepare-collection tells none, some and all of its three publications apart", () => {
  it("NONE, then PARTIAL after a stage whose reply was lost, then COMPLETE after the operator's own identical repeat; another setup is NONE", async () => {
    const dirs = await unprepared();
    const config = realCfg(dirs);
    const text = JSON.stringify(preparationOf());
    const original = captureSetup(config, "prepare-collection", text)!;
    expect(validSetupIdentity(original)).toBe(true);
    expect(original.intents.map((i) => i.step)).toEqual(["mechanism", "reserve", "basis"]);
    const first = await setupEvidence(config, original);
    expect(first, JSON.stringify(first)).toEqual({ kind: "NONE" });

    // the Reserve stage's commit loses its reply and lands nothing: the mechanism is committed, the rest is not
    const s = await operatorSession(dirs);
    const store: any = s.campaign.store;
    const commit = store.commit.bind(store);
    store.commit = async (g: any) =>
      typeof g?.group_id === "string" && g.group_id.includes(":reserve:")
        ? { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } }
        : commit(g);
    const lost = await prepareCollection(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds("p0")),
      fileOf(text),
    );
    expect(lost.status).toBe("COLLECTION_OUTCOME_UNKNOWN");
    await s.close();
    expect(await setupEvidence(config, original)).toEqual({ kind: "PARTIAL" });

    // another setup (a different mechanism) shares nothing with it
    const different = preparationOf();
    different.mechanism.mechanism_id = `${SALT.mechanism}-other`;
    const other = captureSetup(config, "prepare-collection", JSON.stringify(different))!;
    expect(other.digest).not.toBe(original.digest);
    expect(await setupEvidence(config, other)).toEqual({ kind: "NONE" });

    // the operator's own repeat of the IDENTICAL setup finishes what did not land, and the readback then agrees
    const again = await operatorSession(dirs);
    expect(
      (
        await prepareCollection(
          ctxOf(again, scriptedTerminal("confirm"), fixedIds("p1")),
          fileOf(text),
        )
      ).status,
    ).toBe("COLLECTION_COMMITTED");
    await again.close();
    expect(await setupEvidence(config, original)).toEqual({ kind: "COMPLETE" });
  }, 240_000);
});

describe("the setup identity is strict, and only the document-derived commands are read back", () => {
  it("offers a readback for initialize-time and prepare-collection only, and captures nothing for an invalid document or any other command", () => {
    expect([...SETUP_COMMANDS].sort()).toEqual(["initialize-time", "prepare-collection"]);
    const config = { campaignId: FIXTURE_CAMPAIGN } as unknown as PhoneConfig;
    for (const command of [
      "establish-locality",
      "declare-closed-setting",
      "author-character",
      "attest-cycle",
      "collect",
    ])
      expect(captureSetup(config, command, chronologyText(7)), command).toBeNull();
    expect(captureSetup(config, "initialize-time", "not json")).toBeNull();
    expect(captureSetup(config, "initialize-time", JSON.stringify({ nonsense: true }))).toBeNull();
    expect(
      captureSetup(
        config,
        "initialize-time",
        JSON.stringify({ ...JSON.parse(chronologyText(7)), epoch: "default" }),
      ),
    ).toBeNull();
    expect(captureSetup(config, "prepare-collection", chronologyText(7))).toBeNull();
  });

  it("a tampered or malformed identity does not validate", () => {
    const config = { campaignId: FIXTURE_CAMPAIGN } as unknown as PhoneConfig;
    const good = captureSetup(config, "initialize-time", chronologyText(7))!;
    expect(validSetupIdentity(good)).toBe(true);
    for (const bad of [
      null,
      "x",
      [],
      {},
      { ...good, digest: "nothex" },
      { ...good, document_sha256: "ab" },
      { ...good, intents: [] },
      { ...good, intents: [{ step: "origin", intent_id: "starting-chronology:other:intent" }] },
      { ...good, intents: [{ step: "Origin!", intent_id: good.intents[0]!.intent_id }] },
      { ...good, intents: Array.from({ length: 9 }, () => good.intents[0]) },
    ])
      expect(validSetupIdentity(bad)).toBe(false);
  });
});
