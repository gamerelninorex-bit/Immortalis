/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary fact values */
// S-4 initial Standing Instruction ledger — MATERIAL NEGATIVE witnesses through the OWNER PATH (BLUE brief B4: "Refusal/source").
// Every case asserts the same two things: the canonical refusal, and that NOTHING was committed (the journal head is unchanged), so a
// refusal never leaves a half-made ledger, a binding or an unsupported state. A positive control runs beside each family so a
// refusal is caused by the missing/altered prerequisite and not by a broken fixture.
import { describe, expect, it } from "vitest";
import {
  ACTOR_SMITH,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  bindingInput,
  handoverActor,
  handoverInput,
  readyForHandover,
  seededExistingActorCampaign,
} from "../support/existing-actor.ts";
import {
  HEAD_KEY,
  PC,
  activateWithLedger,
  bindInput,
  code,
  releasedCampaign,
  target,
} from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/** Runs `op` and asserts it was refused with `expected` and left the journal exactly as it was. */
async function refused(c: CanonicalCampaign, expected: string, op: () => Promise<any>) {
  const before = c.store.head();
  expect(await code(op())).toBe(expected);
  const after = c.store.head();
  expect(after.journal_head_sha256).toBe(before.journal_head_sha256);
  expect(after.revision).toBe(before.revision);
  expect(c.verify()).toEqual([]);
}

describe("the initializer refuses without a real PC, world and locus, and writes nothing", () => {
  it("no PC contract is committed", async () => {
    const c = await must(
      CanonicalCampaign.create(tempDir(), { campaignId: "c", buildId: "s4-refuse" }),
    );
    await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.initializePcStandingInstructionLedger(target()),
    );
    await c.close();
  });

  it("an absent or foreign PC, an absent world and an absent locus", async () => {
    const c = await releasedCampaign(tempDir());
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.initializePcStandingInstructionLedger(target({ pc_id: "nobody" })),
    );
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.initializePcStandingInstructionLedger(target({ world_id: "no-world" })),
    );
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.initializePcStandingInstructionLedger(target({ locus_id: "no-locus" })),
    );
    // control: the genuine target works on the very same campaign
    await must(c.initializePcStandingInstructionLedger(target()));
    await c.close();
  });

  it("a released contract of ANOTHER PC is not this PC's creation source", async () => {
    const c = await releasedCampaign(tempDir());
    await must(
      c.releasePlayerCharacter({
        ...publication(60),
        contract: fixtureContract({ pc_id: "pc-b" }),
      }),
    );
    await must(c.initializePcStandingInstructionLedger(target())); // PC A
    // PC B has no head: a binding for B consumes nothing, and A's head is no substitute for it
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.bindPlayerCharacter({ ...bindInput(61), pc_id: "pc-b" }),
    );
    expect(c.standingInstructionLedger("pc-b")).toBeUndefined();
    expect(c.standingInstructionLedger(PC)).toBeDefined();
    await c.close();
  });

  it("once a player character is bound, an engine-origin ledger can no longer be created for another PC", async () => {
    const c = await releasedCampaign(tempDir());
    await must(
      c.releasePlayerCharacter({
        ...publication(60),
        contract: fixtureContract({ pc_id: "pc-b" }),
      }),
    );
    await activateWithLedger(c);
    await refused(c, "REFERENCE_INVALID", () =>
      c.initializePcStandingInstructionLedger(target({ pc_id: "pc-b" })),
    );
    await c.close();
  });
});

describe("a caller can state no instruction, origin, digest, sequence or authorship: the input is strict", () => {
  const forged: readonly [string, Record<string, unknown>][] = [
    [
      "an affirmative standing instruction",
      { instructions: [{ text: "if distress arrives, divert" }] },
    ],
    ["an empty-looking instructions field", { instructions: [] }],
    ["a caller-supplied origin label", { origin: { kind: "ENGINE_ORIGIN_LEDGER_CLOSURE" } }],
    ["a player-authored witness", { origin: { kind: "PLAYER_AUTHORED" } }],
    ["a caller-supplied digest", { content_sha256: "0".repeat(64) }],
    ["a sequence", { sequence: 2 }],
    ["a previous version", { previous: { fact_key: "x", version: 1 } }],
    ["a caller-supplied setup closure", { setup_closure: null }],
    ["a publication identity", { group_id: "mine", intent_id: "mine" }],
    ["a consent flag", { consent: true }],
  ];
  for (const [what, extra] of forged) {
    it(`${what} is rejected as invalid input and nothing is written`, async () => {
      const c = await releasedCampaign(tempDir());
      await refused(c, "INPUT_INVALID", () =>
        c.initializePcStandingInstructionLedger({ ...target(), ...extra } as never),
      );
      await c.close();
    });
  }
  it("missing identities are rejected, and so is an L-2 request that names more than the PC", async () => {
    const c = await releasedCampaign(tempDir());
    await refused(c, "INPUT_INVALID", () =>
      c.initializePcStandingInstructionLedger({ pc_id: PC } as never),
    );
    await refused(c, "INPUT_INVALID", () =>
      c.qualifyLegacyPcStandingInstructionLedger({} as never),
    );
    await refused(c, "INPUT_INVALID", () =>
      c.qualifyLegacyPcStandingInstructionLedger({ pc_id: PC, binding: "x" } as never),
    );
    await c.close();
  });
});

describe("the binding consumes an OLDER, qualified head and never creates one", () => {
  it("a binding with no committed head is refused by the owner path and writes nothing", async () => {
    const c = await releasedCampaign(tempDir());
    await refused(c, "PREREQUISITE_MISSING", () => c.bindPlayerCharacter(bindInput()));
    expect(c.binding()).toBeUndefined();
    // control: with the head the very same binding input succeeds
    await must(c.initializePcStandingInstructionLedger(target()));
    await must(c.bindPlayerCharacter(bindInput()));
    await c.close();
  });

  it("existing refusals keep their reason and precedence: the ledger is judged last", async () => {
    const c = await releasedCampaign(tempDir());
    // no ledger AND no insertion fact: the input refusal is the first one, exactly as before the ledger existed
    await refused(c, "INPUT_INVALID", () =>
      c.bindPlayerCharacter(bindInput(4, { insertion: null })),
    );
    // no ledger AND an unestablished locus: the missing locus is reported, not the missing ledger
    await refused(c, "PREREQUISITE_MISSING", () =>
      c.bindPlayerCharacter(bindInput(5, { locus_id: "no-locus" })),
    );
    await c.close();
  });

  it("an ACTIVATION of an existing-actor compilation is still refused even with a ledger present (unsupported variant)", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await readyForHandover(s);
    await must(
      s.campaign.initializePcStandingInstructionLedger({
        pc_id: ACTOR_SMITH,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
      }),
    );
    await refused(s.campaign, "REFERENCE_INVALID", () =>
      s.campaign.bindPlayerCharacter(bindingInput(ACTOR_SMITH, 70)),
    );
    // a handover that claims a RIVAL placement (a real, committed second locus that is not the actor's coupling) is refused; the head
    // stays inert and the lawful handover then succeeds on it
    await must(
      s.campaign.establishLocus({
        ...publication(90),
        locus: fixtureLocus({ locus_id: "locus-fixture-2", designation: "A second stone hall" }),
      }),
    );
    await refused(s.campaign, "REFERENCE_INVALID", () =>
      handoverActor(s, 71, ACTOR_SMITH, { locus_id: "locus-fixture-2" }),
    );
    expect(s.campaign.standingInstructionLedger(ACTOR_SMITH)).toBeDefined();
    await must(handoverActor(s, 72));
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("a handover with no head is refused (the second binding variant also consumes it)", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await readyForHandover(s);
    await refused(s.campaign, "PREREQUISITE_MISSING", () =>
      s.campaign.handoverExistingActor(handoverInput(80)),
    );
    expect(s.campaign.binding()).toBeUndefined();
    await s.campaign.close();
  });
});

describe("idempotence of the initializer", () => {
  it("the same request again recovers the same receipt and writes nothing", async () => {
    const c = await releasedCampaign(tempDir());
    const first = await must(c.initializePcStandingInstructionLedger(target()));
    const head = c.store.head();
    const again = await must(c.initializePcStandingInstructionLedger(target()));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(c.store.head()).toEqual(head);
    expect(c.store.getFact(HEAD_KEY)!.version).toBe(1);
    await c.close();
  });
});
