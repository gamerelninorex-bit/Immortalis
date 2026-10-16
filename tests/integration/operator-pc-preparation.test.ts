/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// The out-of-character PREPARATION of a collection: an owner-verified setup file, the operator's own explicit confirmation, and only the
// existing owner operations (the PC's mechanism projected from an accepted claim, an EMPTY Reserve, the physical extraction basis). It
// originates no canonical time, grants no scene, rights or workforce premise, attests no cycle and collects nothing.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attestCycle, collect, prepareCollection } from "@immortalis/operator";
import { PcCollectionAdapter } from "@immortalis/engine";
import {
  SRC_ACCESS,
  SRC_BASIS_ID,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  basisInput,
  reserveRawInput,
} from "@immortalis/testkit";
import {
  ACTUATOR_WORDS,
  MECH,
  PC,
  T0,
  TAU,
  TRAVERSAL_CANNOT,
  W,
  collectionCampaign,
  cycleAnswer,
  cycleWords,
  reserveAmount,
  sourceRemaining,
} from "../support/pc-collection.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";

async function template(): Promise<string> {
  const dir = tempDir("immortalis-operator-prepare-");
  const s = await collectionCampaign({ dir, noMechanism: true, noPhysicalSetup: true });
  await s.campaign.close();
  return dir;
}
const setupOf = (over: Record<string, unknown> = {}) => ({
  format: "immortalis-collection-preparation",
  format_version: 1,
  mechanism: {
    pc_id: PC,
    mechanism_id: MECH,
    claims: [{ section: "embodiment_topology", index: 0 }],
    actuator: { statement: ACTUATOR_WORDS },
    traversal: { statement: TRAVERSAL_CANNOT },
    cycle_duration: { unit: T0.unit, value: TAU },
    cycle_quote: cycleWords({ unit: T0.unit, value: TAU }),
  },
  extraction_basis: basisInput({ relies_on: SRC_ACCESS }),
  reserve: reserveRawInput(),
  ...over,
});
const fileOf = (setup: unknown, mode = 0o600): string => {
  const path = join(mkdtempSync(join(tmpdir(), "immortalis-setup-")), "setup.json");
  writeFileSync(path, JSON.stringify(setup));
  chmodSync(path, mode);
  return path;
};
const INPUT = {
  source: { world_id: W, source_key: SRC_SOURCE_KEY },
  reserve_id: SRC_RESERVE,
  quantity: { amount: 3, unit: SRC_UNIT },
  mechanism_id: MECH,
  basis_id: SRC_BASIS_ID,
};

describe("prepare-collection", () => {
  it("writes nothing unless the setup is owner-verified, valid for the bound PC, grounded in an accepted claim and confirmed", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const head = s.campaign.store.head().state_sha256;
    const unchanged = () => expect(s.campaign.store.head().state_sha256).toBe(head);
    const run = async (path: string, terminal = scriptedTerminal("confirm")) =>
      prepareCollection(ctxOf(s, terminal, fixedIds("p0")), path);

    // a file others could write, malformed content, and a setup for another PC are all refused before any question
    expect((await run(fileOf(setupOf(), 0o666))).status).toBe("INVALID_INPUT");
    expect((await run(fileOf({ nonsense: true }))).status).toBe("INVALID_INPUT");
    const other = setupOf();
    (other.mechanism as any).pc_id = "actor-other";
    expect((await run(fileOf(other))).status).toBe("UNAVAILABLE");
    // a reserve with stock is not a preparation (it would mint material)
    const stocked = setupOf({
      reserve: { ...reserveRawInput(), quantity: { amount: 4, unit: SRC_UNIT } },
    });
    expect((await run(fileOf(stocked))).status).toBe("INVALID_INPUT");
    // a cycle the accepted claim does not state is refused FIRST, so no stock and no basis is left behind
    const invented = setupOf();
    (invented.mechanism as any).cycle_quote = "one handful every few moments";
    expect((await run(fileOf(invented))).status).toBe("UNAVAILABLE");
    // no confirmation, no write
    expect((await run(fileOf(setupOf()), scriptedTerminal("decline"))).status).toBe("DECLINED");
    expect((await run(fileOf(setupOf()), scriptedTerminal("eof"))).status).toBe("DECLINED");
    unchanged();
    await s.close();
  }, 180_000);

  it("a confirmed setup commits the three existing owner facts once, collects nothing and originates no time; an identical repeat changes nothing; the exact act then still needs the referee and the player", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const clockBefore = JSON.stringify(s.campaign.store.getFact("temporal/state")?.value);
    const path = fileOf(setupOf());
    expect((await prepareCollection(ctxOf(s, scriptedTerminal("confirm")), path)).status).toBe(
      "COLLECTION_COMMITTED",
    );
    const prepared = s.campaign.store.head().state_sha256;
    expect(JSON.stringify(s.campaign.store.getFact("temporal/state")?.value)).toBe(clockBefore);
    expect(reserveAmount(s as any)).toBe(0);
    expect(sourceRemaining(s as any)).toBe(5);
    expect(new PcCollectionAdapter(s.campaign.store).mechanism(PC, MECH)).toBeDefined();

    // an identical repeat is the same publications: nothing changes
    expect((await prepareCollection(ctxOf(s, scriptedTerminal("confirm")), path)).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect(s.campaign.store.head().state_sha256).toBe(prepared);

    // preparation is not an attestation and not a player act: the act is still unavailable until a referee reads the cycle
    expect(
      (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c0")), INPUT)).status,
    ).toBe("UNAVAILABLE");
    expect(s.campaign.store.head().state_sha256).toBe(prepared);
    expect(
      (
        await attestCycle(
          {
            ...ctxOf(s, scriptedTerminal()),
            attestHost: async (task: any) => cycleAnswer(task),
          },
          { mechanism_id: MECH },
        )
      ).status,
    ).toBe("COLLECTION_COMMITTED");
    await s.close();
  }, 180_000);
});
