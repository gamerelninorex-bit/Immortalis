/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// CPAA-C1 v0.3 F-2 — the operator side of the cycle attestation. The attestation is a REFEREE act (the I-002 compiler/adjudicator's
// reading, validated by the engine and written by the archivist path), obtained BEFORE any player choice; it is never the player's
// confirmation and asks the operator nothing. Without it the player is never offered the exact act (the console is not even asked).
// A scripted host proves transport and enforcement only; it is not evidence that an AI understood a sentence.
import { describe, expect, it } from "vitest";
import { attestCycle, collect } from "@immortalis/operator";
import { PcCollectionAdapter } from "@immortalis/engine";
import { SRC_BASIS_ID, SRC_RESERVE, SRC_SOURCE_KEY, SRC_UNIT } from "@immortalis/testkit";
import { MECH, PC, W, collectionCampaign, cycleAnswer } from "../support/pc-collection.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";

async function template(): Promise<string> {
  const dir = tempDir("immortalis-operator-attest-");
  const s = await collectionCampaign({ dir, noAttestation: true });
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
const faithful = async (task: any) => cycleAnswer(task);

describe("the exact act is offered only for a cycle the I-002 owner has attested BEFORE the act", () => {
  it("without an attestation the player is not offered the act (the console is never asked); a hostile or absent reading writes nothing; a faithful one is attested once, then the act is offered", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const sha = () => s.campaign.store.head().state_sha256;
    const head = sha();

    // 1. no attestation: nothing to confirm
    const t0 = scriptedTerminal("confirm");
    expect((await collect(ctxOf(s, t0, fixedIds("c0")), INPUT)).status).toBe("UNAVAILABLE");
    expect(t0.asked()).toBe(0);
    expect(sha()).toBe(head);

    // 2. no host, an input that states more than the mechanism, and hostile readings: all set aside, nothing written
    expect((await attestCycle(ctxOf(s, scriptedTerminal()), { mechanism_id: MECH })).status).toBe(
      "UNAVAILABLE",
    );
    for (const bad of [
      { mechanism_id: MECH, reading: "ATTESTED" },
      { mechanism_id: 3 },
      undefined,
      null,
    ])
      expect(
        (await attestCycle({ ...ctxOf(s, scriptedTerminal()), attestHost: faithful }, bad)).status,
      ).toBe("INVALID_INPUT");
    for (const attestHost of [
      async (task: any) => cycleAnswer(task, { reading: "NOT_ONE_UNIT_ONE_SERIAL_CYCLE" }),
      async (task: any) => cycleAnswer(task, { verdict: "ATTESTED" }),
      async (task: any) => cycleAnswer(task, { cycle_ground: "one handful every few moments" }),
      async () => "ATTESTED",
      async () => null,
      async () => {
        throw new Error("host unavailable");
      },
    ])
      expect(
        (await attestCycle({ ...ctxOf(s, scriptedTerminal()), attestHost }, { mechanism_id: MECH }))
          .status,
      ).toBe("UNAVAILABLE");
    expect(sha()).toBe(head);
    expect(new PcCollectionAdapter(s.campaign.store).attestation(PC, MECH)).toBeUndefined();

    // 3. a faithful reading is validated and attested once; presenting it again changes nothing
    expect(
      (
        await attestCycle(
          { ...ctxOf(s, scriptedTerminal()), attestHost: faithful },
          { mechanism_id: MECH },
        )
      ).status,
    ).toBe("COLLECTION_COMMITTED");
    const attested = sha();
    expect(
      (
        await attestCycle(
          { ...ctxOf(s, scriptedTerminal()), attestHost: faithful },
          { mechanism_id: MECH },
        )
      ).status,
    ).toBe("COLLECTION_COMMITTED");
    expect(sha()).toBe(attested);
    const att = new PcCollectionAdapter(s.campaign.store).attestation(PC, MECH)!;
    expect(att.value.attestor.role).toBe("role.gm");

    // 4. only now is the act offered, and it is the player's own separate confirmation that commits it
    const t1 = scriptedTerminal("confirm");
    expect((await collect(ctxOf(s, t1, fixedIds("c1")), INPUT)).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect(t1.asked()).toBe(1);
    const commitment = new PcCollectionAdapter(s.campaign.store).commitment(PC, "operator-act-c1")!;
    expect(commitment.value.basis.cycle.attestation.version).toBe(att.fact.version);
    await s.close();

    // reopen: the attestation is durable and the verifiers agree
    const r = await openSession(dirs);
    expect(new PcCollectionAdapter(r.campaign.store).attestation(PC, MECH)?.fact.version).toBe(
      att.fact.version,
    );
    await r.close();
  }, 180_000);
});
