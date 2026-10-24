// Scripted confirmations and fixture worlds: owner readback mechanism evidence, not a live human/AI witness.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, ProductionAdapter } from "@immortalis/engine";
import { runCli } from "@immortalis/operator";
import { FIXTURE_CAMPAIGN, fixtureWorld, publication } from "@immortalis/testkit";
import {
  captureSetup,
  setupEvidence,
  validSetupIdentity,
} from "../../apps/phone/src/setup-recovery.ts";
import { readPending, writePending, PENDING_FORMAT } from "../../apps/phone/src/recovery.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import { ACTUATOR_WORDS, TRAVERSAL_CANNOT, cycleWords } from "../support/pc-collection.ts";
import { SALT, TAU_UNIT } from "../support/pc-collection-original.ts";
import { PC_ID, PC_WORDS, observationCampaign } from "../support/observation.ts";
import {
  ACCESS,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
} from "../support/locality.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";
import { must } from "../support/temporal.ts";

afterEach(() => vi.restoreAllMocks());
const chronology = {
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit: "season", value: 7 },
  statement: "SYNTHETIC FIXTURE: survey morning",
};
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
    relies_on: ACCESS,
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
async function fixture(command: string) {
  const root = tempDir("immortalis-chat-setup-");
  let campaignDir = join(root, "campaign");
  const campaignId = command === "initialize-time" ? FIXTURE_CAMPAIGN : LOCALITY_CAMPAIGN;
  if (command === "initialize-time") {
    const c = await must(
      CanonicalCampaign.create(campaignDir, {
        campaignId: FIXTURE_CAMPAIGN,
        buildId: "setup-readback-test",
      }),
    );
    await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await c.close();
  } else {
    const { dirs } = await observationCampaign({
      words: {
        embodiment: `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${cycleWords(TAU_UNIT)}; ${TRAVERSAL_CANNOT}`,
      },
    });
    campaignDir = dirs.campaignDir;
  }
  const operatorDir = join(root, "operator");
  mkdirSync(operatorDir, { mode: 0o700 });
  const path = join(root, "setup.json");
  writeFileSync(path, JSON.stringify(command === "initialize-time" ? chronology : preparation), {
    mode: 0o600,
  });
  const config = { campaignDir, operatorDir, campaignId } as PhoneConfig;
  const run = () => {
    const t = scriptedTerminal("confirm");
    return runCli(
      [
        command,
        "--campaign",
        campaignDir,
        "--campaign-id",
        campaignId,
        "--operator-dir",
        operatorDir,
        "--setup",
        path,
      ],
      { terminal: t, out: (line) => t.say(line) },
    );
  };
  return { config, path, run };
}

describe("document-derived setup owner readback", () => {
  it.each(["initialize-time", "prepare-collection"])(
    "%s: capture before dispatch matches the actual command's publications; none, complete and changed inputs are distinct",
    async (command) => {
      const f = await fixture(command);
      const identity = captureSetup(f.config, command, f.path)!;
      expect(identity).not.toBeNull();
      expect(await setupEvidence(f.config, identity)).toEqual({ kind: "NONE" });
      writePending(f.config, {
        format: PENDING_FORMAT,
        format_version: 1,
        campaign_id: f.config.campaignId,
        run_id: "original",
        command,
        options: {},
        dispatched_at: 1,
        state: "DISPATCHED",
        blocker: null,
        identity: null,
        setup: identity,
      });
      expect(readPending(f.config).kind).toBe("PENDING");
      expect(await f.run()).toBe(0);
      expect(await setupEvidence(f.config, identity)).toEqual({ kind: "COMPLETE" });
      // The readback changes neither owner state nor time. A repeat is an operator action, never done by recovery.
      const c = await must(
        CanonicalCampaign.open(f.config.campaignDir, { buildId: "setup-readback-test" }),
      );
      const head = c.store.head().state_sha256;
      await c.close();
      expect(await setupEvidence(f.config, identity)).toEqual({ kind: "COMPLETE" });
      const reopened = await must(
        CanonicalCampaign.open(f.config.campaignDir, { buildId: "setup-readback-test" }),
      );
      expect(reopened.store.head().state_sha256).toBe(head);
      await reopened.close();
      expect(validSetupIdentity({ campaignId: "another-campaign" }, command, identity)).toBe(false);
      expect(
        await setupEvidence({ ...f.config, campaignId: "another-campaign" }, identity),
      ).toEqual({ kind: "UNAVAILABLE" });
      expect(
        await setupEvidence(f.config, { ...identity, publication_digest: "0".repeat(64) }),
      ).toEqual({ kind: "UNAVAILABLE" });
      expect(
        validSetupIdentity(f.config, command, { ...identity, document: identity.document + " " }),
      ).toBe(false);
      const changed =
        command === "initialize-time"
          ? { ...chronology, statement: "SYNTHETIC FIXTURE: different morning" }
          : { ...preparation, reserve: { ...preparation.reserve, condition: "different" } };
      writeFileSync(f.path, JSON.stringify(changed));
      const other = captureSetup(f.config, command, f.path)!;
      expect(await setupEvidence(f.config, other)).toEqual({ kind: "NONE" });
    },
  );

  it("a lost Reserve stage leaves preparation PARTIAL; only the operator's inspected identical repeat completes it", async () => {
    const f = await fixture("prepare-collection");
    const identity = captureSetup(f.config, "prepare-collection", f.path)!;
    const lost = vi.spyOn(ProductionAdapter.prototype, "establishReserve").mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME", message: "synthetic lost stage" },
    });
    expect(await f.run()).toBe(4);
    expect(await setupEvidence(f.config, identity)).toEqual({ kind: "PARTIAL" });
    lost.mockRestore();
    expect(await setupEvidence(f.config, identity)).toEqual({ kind: "PARTIAL" });
    expect(await f.run()).toBe(0);
    expect(await setupEvidence(f.config, identity)).toEqual({ kind: "COMPLETE" });
  });
});
