// R-4 (NEWLY AUTHORIZED; BLUE Lapse Settlement v1.2; independent review pending) — the operator's presentation of the settlement. It is a
// MECHANICAL derivation: the command takes no input and asks nothing (there is no choice to confirm), a host or operator cannot decide whether,
// when or how it applies, it never resumes time, and a nothing-applicable invocation writes nothing. A scripted console is plumbing only.
import { describe, expect, it } from "vitest";
import { EXIT, pcTargetResume, runCli, settleCollectionLapse } from "@immortalis/operator";
import {
  PcCollectionAdapter,
  TemporalCoordinator,
  StageProviderRegistry,
} from "@immortalis/engine";
import { FIXTURE_LOCUS_ID } from "@immortalis/testkit";
import { PC, T0, TAU, collectionCampaign } from "../support/pc-collection.ts";
import { addLedger, advanceTo, resident } from "../support/pc-lapse.ts";
import { copyCampaign, ctxOf, openSession, scriptedTerminal } from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";
import { collect, collectContinue } from "@immortalis/operator";
import { SRC_BASIS_ID, SRC_RESERVE, SRC_SOURCE_KEY, SRC_UNIT } from "@immortalis/testkit";
import { MECH, W, hostAnswer } from "../support/pc-collection.ts";
import { fixedIds } from "../support/operator.ts";

type Session = Awaited<ReturnType<typeof openSession>>;

async function template(): Promise<string> {
  const dir = tempDir("immortalis-operator-lapse-");
  const s = await collectionCampaign({ dir });
  await s.campaign.close();
  return dir;
}
const INPUT = {
  source: { world_id: W, source_key: SRC_SOURCE_KEY },
  reserve_id: SRC_RESERVE,
  quantity: { amount: 3, unit: SRC_UNIT },
  mechanism_id: MECH,
  basis_id: SRC_BASIS_ID,
};
const gm = async (task: Parameters<typeof hostAnswer>[0]) =>
  hostAnswer(task, "OPEN", "NOT_AT_ISSUE");
const holdOf = (s: Session) => new PcCollectionAdapter(s.campaign.store).hold(PC);
const sha = (s: Session) => s.campaign.store.head().state_sha256;
const clock = (s: Session) =>
  new TemporalCoordinator(s.campaign.store, new StageProviderRegistry()).state()!.value;

/** a confirmed attempt Production started; the premise then lost mid-work; the world's time held at the boundary by another lawful route */
async function heldAtBoundary(s: Session) {
  expect((await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), INPUT)).status).toBe(
    "COLLECTION_COMMITTED",
  );
  expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm })).status).toBe(
    "COLLECTION_COMMITTED",
  );
  await addLedger(s as never, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
  expect(holdOf(s).state).toBe("INVALIDATED");
  await advanceTo(s as never, T0.value + 4 * TAU, "tx-cross");
  expect(clock(s).continuation).not.toBeNull();
}

describe("settle-collection-lapse: a mechanical presentation, never a choice", () => {
  it("nothing applicable derives → the one refusal and nothing is written, asked or retained", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const head = sha(s);
    const t = scriptedTerminal("confirm");
    expect((await settleCollectionLapse(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    expect(sha(s)).toBe(head);
    // mid-work (not at the boundary), premise lost: still nothing to settle before B
    await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), INPUT);
    await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm });
    await addLedger(
      s as never,
      "ledger-arrivals",
      [resident("unit-arrival", FIXTURE_LOCUS_ID)],
      953,
    );
    const mid = sha(s);
    expect((await settleCollectionLapse(ctxOf(s, scriptedTerminal("confirm")))).status).toBe(
      "UNAVAILABLE",
    );
    expect(sha(s)).toBe(mid);
    await s.close();
  }, 240_000);

  it("held at the boundary with the eligibility lost: the command settles it with no question and no time passing; presenting it again changes nothing; the PC is then free and the world is untouched", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await heldAtBoundary(s);
    const before = clock(s);
    const t = scriptedTerminal("confirm");
    const out = await settleCollectionLapse(ctxOf(s, t));
    expect(out.status).toBe("COLLECTION_COMMITTED");
    expect(t.asked()).toBe(0);
    expect(holdOf(s)).toEqual({ state: "NONE" });
    expect(clock(s)).toEqual(before);
    const head = sha(s);
    expect((await settleCollectionLapse(ctxOf(s, scriptedTerminal()))).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect(sha(s)).toBe(head);
    // reopen: the settlement is durable and every verifier agrees
    await s.close();
    const r = await openSession(dirs);
    expect(holdOf(r)).toEqual({ state: "NONE" });
    expect(clock(r)).toEqual(before);
    await r.close();
  }, 240_000);

  it("a resume choice presents the same settlement first, quietly; it still resumes nothing by itself", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await heldAtBoundary(s);
    const before = clock(s);
    const t = scriptedTerminal();
    // no operator-confirmed earlier choice owns this held lineage (it was held by another lawful route), so the resume is unavailable;
    // the settlement it presented first is nevertheless the mechanical one, with the same effects as presenting it alone
    expect((await pcTargetResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    expect(holdOf(s)).toEqual({ state: "NONE" });
    expect(clock(s)).toEqual(before);
    await s.close();
  }, 240_000);
});

describe("the shipped CLI: settle-collection-lapse takes no input", () => {
  it("any option beyond the campaign is a usage error before a campaign is opened", async () => {
    const lines: string[] = [];
    const base = ["--campaign", "/nonexistent", "--campaign-id", "cli-campaign"];
    for (const argv of [
      ["settle-collection-lapse", ...base, "--reason", "INCOMPATIBLE"],
      ["settle-collection-lapse", ...base, "--target", "5"],
    ]) {
      const code = await runCli(argv, { out: (l) => lines.push(l) });
      expect(code).toBe(EXIT.USAGE);
    }
  });
});
