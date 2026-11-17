// S-4 initial Standing Instruction ledger — AUTHENTIC PRE-S-4 CAMPAIGN PACKAGES (exact-byte custody, BLUE brief B6/A8).
//
// NOT part of the repository's test projects (vitest.config.ts includes only `tests/**`). This is a one-off GENERATOR that must run
// ONLY inside a checkout of the pre-S-4 base, main `c6ea29d3ccd7cadb83a622dc47704f449f63513b`, so that the packages it writes are
// real campaigns that the BASE build wrote, under the BASE binding policy, with no Standing Instruction ledger:
//
//   git archive c6ea29d3ccd7cadb83a622dc47704f449f63513b | tar -x -C <base>   &&   cd <base>   &&   pnpm install --frozen-lockfile
//   cp tools/s4-legacy-fixture.test.ts <base>/tools/
//   echo 'export default { test: { include: ["tools/s4-legacy-fixture.test.ts"] } };' > <base>/s4-legacy.vitest.config.ts
//   S4_LEGACY_OUT=<outDir> pnpm exec vitest run --config s4-legacy.vitest.config.ts
//
// It writes `<outDir>/activation/` (a freshly generated PC, bound by the first ACTIVATION) and `<outDir>/handover/` (an existing
// actor handed over by EXISTING_ACTOR_HANDOVER; open it with `ACTOR_FIXTURE_EXTENSION`). It REFUSES to run on any tree that has the
// S-4 initializer: a legacy witness written by the S-4 build would be a self-made fixture, not an authentic one. Every input is the
// unedited fixture the base build's own test support uses; nothing is clocked or random, so a rerun reproduces the same journal.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";
import {
  handoverActor,
  readyForHandover,
  seededExistingActorCampaign,
} from "../tests/support/existing-actor.ts";
import { must } from "../tests/support/temporal.ts";

const BASE_SHA = "c6ea29d3ccd7cadb83a622dc47704f449f63513b";

describe(`pre-S-4 base ${BASE_SHA}: authentic legacy packages`, () => {
  it("writes a real ACTIVATION-bound and a real EXISTING_ACTOR_HANDOVER-bound package, both without a ledger", async () => {
    expect(
      "initializePcStandingInstructionLedger" in CanonicalCampaign.prototype,
      `refused: this tree already has the S-4 ledger initializer. Run this generator only on the pre-S-4 base ${BASE_SHA}.`,
    ).toBe(false);
    const outDir = process.env["S4_LEGACY_OUT"];
    if (!outDir) throw new Error("set S4_LEGACY_OUT to the output directory");
    mkdirSync(outDir, { recursive: true });

    // 1. ACTIVATION: world, locus, a released fresh PC, the first ACTIVATION binding.
    {
      const campaign = await must(
        CanonicalCampaign.create(join(outDir, "activation"), {
          campaignId: FIXTURE_CAMPAIGN,
          buildId: "s4-legacy-fixture-activation",
        }),
      );
      await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
      await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
      await must(
        campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }),
      );
      await must(
        campaign.bindPlayerCharacter({
          ...publication(4),
          pc_id: FIXTURE_PC_ID,
          world_id: FIXTURE_WORLD_ID,
          locus_id: FIXTURE_LOCUS_ID,
          insertion: fixtureInsertionFact(),
        }),
      );
      await campaign.close();
    }

    // 2. EXISTING_ACTOR_HANDOVER: a seeded actor campaign; the actor's state, coupling and compilation; then the handover.
    {
      const s = await seededExistingActorCampaign(join(outDir, "handover"), {
        buildId: "s4-legacy-fixture-handover",
      });
      await readyForHandover(s);
      await must(handoverActor(s, 1));
      await s.campaign.close();
    }
  });
});
