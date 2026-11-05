/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — the integrated, BOOTSTRAP-BEARING witness (T1 MECHANISM ONLY). One campaign whose genesis comes from
// the real bootstrap (intake → SCOPE → Grant → SCENE → Completion) and then runs through the SHIPPED operator commands and the real owners:
// native/physical PC placement, the captured Temporal origin, the OPTION_A_V9 projection, the preparation and cycle attestation, an ordinary
// look with an owner-earned Epistemic event, a separately confirmed collection, the owners' conserved consequence, and close/reopen with
// strict replay of every prefix. The isolated answers, message proofs and referee hosts are LABELLED FIXTURES / scripted plumbing: nothing
// here is genuine original-message evidence (T2) or named-client play (T3), both UNRUN (OB-030).
//
// Why a spy: a production campaign can never contain `fixture:` evidence, so the shipped commands' own `CanonicalCampaign.open` (production
// admission) would refuse this journal by design. The TEST routes exactly that one call through the testkit fixture admission. No
// production code gained a seam, and no production route accepts fixture evidence.
import { chmodSync, cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  InitialCompletionProjection,
  fixtureCanonicalAdmission,
  initializeCapturedChronology,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  authorCharacter,
  bindHost,
  establishCharacterLocus,
  pendingTasks,
  readTask,
  secretPath,
  submitDecision,
} from "@immortalis/operator";
import { readFileSync } from "node:fs";
import { worldSceneClosureKey } from "@immortalis/contracts";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "@immortalis/testkit";
import {
  BOOTSTRAP_CAMPAIGN,
  FIXTURE_POLICY,
  factsOf,
  harness,
  intakeRequest,
  reopenFixtureCampaign,
} from "../support/initial-setup.ts";
import {
  HOST_ID,
  PC_ID,
  STANDARD,
  plainPolicy,
  respondingConsole,
} from "../support/original-pc.ts";
import { locusConsole } from "../support/original-pc-locus.ts";
import { must } from "../support/temporal.ts";

const realOpen = CanonicalCampaign.open.bind(CanonicalCampaign);
beforeEach(() => {
  vi.spyOn(CanonicalCampaign, "open").mockImplementation((dir, options = {}) =>
    realOpen(dir, { ...options, testkitFixtureAdmission: fixtureCanonicalAdmission }),
  );
});
afterEach(() => vi.restoreAllMocks());

/** the scripted referee host of the shipped tests, over THIS campaign's identity (plumbing only: it proves nothing about an AI's reading) */
function startHost(operatorDir: string) {
  const p = {
    stateDir: operatorDir,
    campaignId: BOOTSTRAP_CAMPAIGN,
    operatorUid: process.getuid!(),
  };
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        for (const t of await pendingTasks(p)) {
          const task = await readTask(p, t.task_id);
          if (!task.ok) continue;
          const answer = plainPolicy(task.value.document);
          if (answer === null) continue;
          const secret = readFileSync(secretPath(p, HOST_ID), "utf8").trim();
          await submitDecision(p, {
            host_id: HOST_ID,
            secret,
            task_id: t.task_id,
            claimed_model: "scripted-test-policy (NOT an AI)",
            answer,
          });
        }
      } catch {
        // the directory may not exist yet
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

/** A campaign completed through the real bootstrap, closed, with an owner-only operator directory and a bound scripted host. */
async function bootstrapped() {
  const h = await harness();
  const intake = await h.service.intake(await intakeRequest(h));
  const advanced = await h.service.advance(intake.setup_id!);
  expect(advanced.status).toBe("COMPLETED");
  await h.campaign.close();
  const root = mkdtempSync(join(tmpdir(), "immortalis-witness-"));
  chmodSync(root, 0o700);
  const operatorDir = join(root, "operator-state");
  // the retained-intent directory is owner-only; the shipped establish command makes it so before any host is bound
  mkdirSync(operatorDir, { recursive: true, mode: 0o700 });
  chmodSync(operatorDir, 0o700);
  // the shipped commands verify the local operator owns the campaign directory under an owner-only parent: move the package there
  const campaignDir = join(root, "campaign");
  cpSync(h.dir, campaignDir, { recursive: true });
  chmodSync(campaignDir, 0o700);
  return { h, campaignDir, operatorDir };
}

describe("bootstrap-bearing witness, stage A: Completion → native/physical PC placement → captured time → OPTION_A_V9 projection", () => {
  it("the shipped author-character and establish-character-locus run over a journal that the bootstrap produced", async () => {
    const { campaignDir, operatorDir } = await bootstrapped();
    const bound = await bindHost({
      stateDir: operatorDir,
      campaignId: BOOTSTRAP_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: HOST_ID,
      operations: [
        "I002_CLASSIFY",
        "IR_NATIVE_COMPATIBILITY",
        "IR_PHYSICAL_PLACEMENT",
        "F014D_DIRECT_PERCEPTION",
      ],
    });
    if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
    const host = startHost(operatorDir);
    try {
      const terminal = respondingConsole(STANDARD);
      const authored = await authorCharacter({
        campaignDir,
        campaignId: BOOTSTRAP_CAMPAIGN,
        worldId: FIXTURE_WORLD_ID,
        locusId: FIXTURE_LOCUS_ID,
        pcId: PC_ID,
        operatorDir,
        terminal,
        refereePolls: 400,
        refereePollMs: 10,
      });
      expect(authored.status, JSON.stringify(authored.details) + terminal.said.join("\n")).toBe(
        "CHARACTER_BOUND",
      );
      const placing = locusConsole();
      const placed = await establishCharacterLocus({
        campaignDir,
        campaignId: BOOTSTRAP_CAMPAIGN,
        pcId: PC_ID,
        operatorDir,
        terminal: placing,
        refereePolls: 400,
        refereePollMs: 10,
      });
      expect(placed.status, JSON.stringify(placed.details) + placing.said.join("\n")).toBe(
        "LOCUS_ESTABLISHED",
      );
    } finally {
      await host.stop();
    }

    // the captured Temporal origin (the only way time starts in a bootstrap-bearing prefix) and the owner-derived projection
    const campaign = await must(reopenFixtureCampaign(campaignDir));
    await must(initializeCapturedChronology(campaign.store, { policy: FIXTURE_POLICY }));
    const projection = new InitialCompletionProjection(campaign.store);
    await must(projection.projectSceneClosure());
    await must(projection.projectWorkforceScope());
    expect(campaign.verify()).toEqual([]);
    expect(scanInitialSetup(factsOf(campaign.store)).completion).toBeDefined();

    // what the owners actually hold: the PC's qualified physical custody at the locality the bootstrap built, the captured time, and the
    // owner-derived closure/workforce records - none supplied by this test
    const facts = factsOf(campaign.store);
    const custody = facts.get(`world-state/pc/${PC_ID}/locus-custody`);
    expect(custody).toBeDefined();
    expect(JSON.stringify(custody!.value)).toContain(FIXTURE_LOCUS_ID);
    const time = facts.get("temporal/state")!;
    const doc = (scanInitialSetup(facts).completion!.value as any).selection.coverage.start;
    expect((time.value as any).canonical_time).toEqual(doc);
    expect(facts.has(worldSceneClosureKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))).toBe(true);
    const head = campaign.store.head();
    await campaign.close();

    // close, reopen and strictly replay the whole history (each group judged against its own incremental pre-state)
    const strict = await must(CanonicalCampaign.open(campaignDir, { audit: true }));
    expect(strict.store.head().state_sha256).toBe(head.state_sha256);
    expect(strict.verify()).toEqual([]);
    await strict.close();

    // and NO production route accepts this journal: the same package under the production admission is refused (reserved fixture: evidence)
    vi.restoreAllMocks();
    const production = await realOpen(campaignDir);
    expect(production.ok).toBe(false);
  }, 120_000);
});
