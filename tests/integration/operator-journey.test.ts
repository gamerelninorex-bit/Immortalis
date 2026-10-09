// Local trusted PC command-and-reopen mechanism — the real journey over the real owners: operator relocation choice (confirmation
// 1) → existing owner chain → close → reopen → separately confirmed progression (confirmation 2) → existing kernel and owner
// stages. Everything asserted is read from canonical facts, never from a status the mechanism returned.
import { beforeAll, describe, expect, it } from "vitest";
import {
  LogisticsTransferSchema,
  logisticsDeliveryKey,
  logisticsTransferKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import {
  advance,
  relocate,
  status,
  OPERATOR_PUBLICATION_BASIS,
  OPERATOR_PUBLICATION_SECRECY,
} from "@immortalis/operator";
import { PC, W, authorityCensus, movementSummary } from "../support/pc-movement.ts";
import {
  DEST_LOCUS_ID,
  LOG_T_DELIVERY,
  RELOCATE_INPUT,
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  reference,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";

let template: string;
beforeAll(async () => {
  template = await seedTemplate();
}, 120_000);

const view = (s: Awaited<ReturnType<typeof openSession>>) => ({
  campaign: s.campaign,
  census: authorityCensus(s),
  phase: s.campaign.pcCurrentLocus(PC)?.phase,
  time: s.campaign.store.getFact("temporal/state")?.value as {
    canonical_time: { unit: string; value: number };
  },
});

describe("two distinct confirmations over a close and reopen", () => {
  it("relocation commits the chain and advances nothing; a reopened session's separate confirmation delivers", async () => {
    const dirs = copyCampaign(template);

    // -- session A: confirmation 1 --
    const a = await openSession(dirs);
    const before = view(a);
    expect(before.census).toMatchObject({ stationary: 1, logistics: 0, destination: 0 });
    const t1 = scriptedTerminal("confirm");
    const first = await relocate(ctxOf(a, t1), RELOCATE_INPUT);
    expect(first.status).toBe("RELOCATION_COMMITTED");
    expect(t1.said.join("\n")).toMatch(/CONFIRMATION 1 OF 2/);
    const mid = view(a);
    expect(mid.phase).toBe("IN_TRANSFER");
    expect(mid.census).toMatchObject({ stationary: 0, logistics: 1, destination: 0, total: 1 });
    // before any second confirmation: no time moved, no delivery, no destination commit
    expect(mid.time).toEqual(before.time);
    expect(a.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeUndefined();
    expect(a.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    // the owners' records state the player's authority the service stated, and the destination the operator chose
    const commitment = a.campaign.pcMovementCommitment(PC)!.value;
    expect(commitment.authored_under).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(commitment.intent.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(a.campaign.store.getFact(`pc/${PC}/movement/commitment`)).toMatchObject({
      basis: OPERATOR_PUBLICATION_BASIS,
      secrecy: OPERATOR_PUBLICATION_SECRECY,
    });

    // an advance that is declined changes nothing at all
    const frozen = movementSummary({ campaign: a.campaign });
    const declined = await advance(ctxOf(a, scriptedTerminal("decline")));
    expect(declined.status).toBe("DECLINED");
    expect(movementSummary({ campaign: a.campaign })).toEqual(frozen);

    const sessionAId = a.sessionId;
    await a.close();

    // -- the process ends; session B is a new, re-verified session over the same saved campaign --
    const b = await openSession(dirs);
    expect(b.sessionId).not.toBe(sessionAId);
    expect(status(b)).toMatchObject({ relocation: "COMMITTED", advances: [] });
    const reopened = view(b);
    expect(reopened.phase).toBe("IN_TRANSFER");
    expect(reopened.time).toEqual(before.time);

    const t2 = scriptedTerminal("confirm");
    const second = await advance(ctxOf(b, t2));
    expect(second.status).toBe("ADVANCE_COMMITTED");
    expect(t2.said.join("\n")).toMatch(/CONFIRMATION 2 OF 2/);
    const after = view(b);
    // delivery, destination commit and retirement were committed by their owners, at exactly the declared boundary
    expect(after.time.canonical_time).toEqual(LOG_T_DELIVERY);
    expect(after.census).toMatchObject({ stationary: 0, logistics: 0, destination: 1, total: 1 });
    expect(after.census.destinationLocus).toBe(DEST_LOCUS_ID);
    expect(b.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeDefined();
    expect(
      LogisticsTransferSchema.parse(b.campaign.store.getFact(logisticsTransferKey(W, PC))!.value)
        .state.status,
    ).toBe("RETIRED");
    expect(status(b)).toMatchObject({ relocation: "COMMITTED", advances: ["COMMITTED"] });
    // neither the console nor the reported status narrates an arrival
    for (const line of [...t1.said, ...t2.said, first.message, second.message])
      expect(line).not.toMatch(/\barrived\b|\byou (see|saw|notice|learn)/i);
    await b.close();
  }, 120_000);

  it("the two confirmations are materially distinct: the first phrase does not progress, the second is a new identity", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    const t = scriptedTerminal("confirm", (phrase) => phrase.replace(/^advance/, "relocate"));
    expect((await relocate(ctxOf(s, t), RELOCATE_INPUT)).status).toBe("RELOCATION_COMMITTED");
    const before = movementSummary({ campaign: s.campaign });
    // a relocation-verb phrase typed at the progression prompt declines
    expect((await advance(ctxOf(s, t))).status).toBe("DECLINED");
    expect(movementSummary({ campaign: s.campaign })).toEqual(before);
    expect(t.said.filter((l) => /^To confirm, type exactly "(relocate|advance) /.test(l))).toEqual([
      expect.stringMatching(/"relocate [0-9a-f]{12}"/),
      expect.stringMatching(/"advance [0-9a-f]{12}"/),
    ]);
    await s.close();
  }, 120_000);

  it("is fact-for-fact the same canon as driving the unchanged gateways directly with the same material", async () => {
    const dirs = copyCampaign(template);
    const ids = fixedIds("uid-1", "uid-2");
    const s = await openSession(dirs);
    await relocate(ctxOf(s, scriptedTerminal("confirm"), ids), RELOCATE_INPUT);
    await advance(ctxOf(s, scriptedTerminal("confirm"), ids));
    const mine = movementSummary({ campaign: s.campaign }).head.state_sha256;
    await s.close();
    expect(mine).toBe(await reference(template, "uid-2"));
  }, 120_000);
});
