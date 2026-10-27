// MECHANISM ONLY: private capability validation, not human-message attestation or client acceptance.
import { describe, expect, it } from "vitest";
import {
  bindOrdinaryAction,
  revokeOrdinaryAction,
  type OrdinaryAction,
} from "../../packages/operator/src/ordinary-action.ts";
import {
  requestOrdinaryConfirmation,
  consumeConfirmation,
} from "../../packages/operator/src/confirmation.ts";
import type { LocalOperatorSession } from "@immortalis/operator";
import { scriptedTerminal } from "../support/operator.ts";

const session = (campaignId = "campaign", pc = "pc", revision = 7) =>
  ({
    campaignId,
    isOpen: true,
    isAmbiguous: false,
    campaign: {
      binding: () => ({ value: { active_pc: { entity_id: pc } } }),
      store: { head: () => ({ revision }) },
    },
  }) as LocalOperatorSession;
const action = { amount: 2 };
const mint = () =>
  bindOrdinaryAction({
    campaignId: "campaign",
    pcId: "pc",
    operationId: "op",
    client: "client",
    grant: "grant",
    verb: "collect",
    action,
    revision: 7,
  });
const use = (token: OrdinaryAction, s = session(), a: unknown = action) =>
  requestOrdinaryConfirmation(scriptedTerminal(), "collect", "exact-subject", [], {
    token,
    session: s,
    action: a,
  });

describe("one private ordinary-action capability", () => {
  it("enters the existing subject-bound confirmation path once without generating or typing a challenge", async () => {
    const cap = mint();
    const t = scriptedTerminal();
    const c = await requestOrdinaryConfirmation(t, "collect", "exact-subject", [], {
      token: cap,
      session: session(),
      action,
    });
    expect(t.asked()).toBe(0);
    expect(t.said).toEqual([]);
    expect(c).not.toBeNull();
    expect(consumeConfirmation(c!, "collect", "other-subject")).toBe(false);
    expect(consumeConfirmation(c!, "collect", "exact-subject")).toBe(true);
    expect(consumeConfirmation(c!, "collect", "exact-subject")).toBe(false);
    expect(await use(cap)).toBeNull();
  });
  it("refuses copied/model-authored objects, changed actions, actor/campaign/basis, closed or ambiguous sessions, and revoked/declined requests", async () => {
    expect(await use({ operationId: "op" })).toBeNull();
    const original = mint();
    expect(await use({ ...original })).toBeNull();
    for (const s of [
      session("other"),
      session("campaign", "other"),
      session("campaign", "pc", 8),
      { ...session(), isOpen: false },
      { ...session(), isAmbiguous: true },
    ]) {
      const cap = mint();
      expect(await use(cap, s as LocalOperatorSession)).toBeNull();
      expect(await use(cap)).toBeNull(); // failed use burns it too
    }
    expect(await use(mint(), session(), { amount: 3 })).toBeNull();
    const declined = mint();
    revokeOrdinaryAction(declined);
    expect(await use(declined)).toBeNull();
  });
  it("does not turn the attempt into finish/cease, and preserves console decline without a capability", async () => {
    const c = await requestOrdinaryConfirmation(
      scriptedTerminal(),
      "collect-finish",
      "finish",
      [],
      { token: mint(), session: session(), action },
    );
    expect(c).toBeNull();
    const t = scriptedTerminal("decline");
    expect(
      await requestOrdinaryConfirmation(t, "collect", "subject", ["attempt"], undefined),
    ).toBeNull();
    expect(t.asked()).toBe(1);
  });
});
