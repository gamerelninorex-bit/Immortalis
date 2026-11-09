import { describe, it, expect } from "vitest";
import { MsSetupPublisher, verifyMsIntegrity, resolveKey } from "@immortalis/engine";
import { msHarness, mustMsReopen } from "../support/ms-setup.ts";

describe("M-S v0.8 T1 signed source chain (MECHANISM ONLY)", () => {
  it("publishes existence, B1, complete closure, captured t0 and B2, then strictly reopens and reconciles", async () => {
    const h = await msHarness();
    expect(h.setup).toMatchObject({ status: "COMPLETED" });
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    expect(h.calls()).toBe(1);
    expect(verifyMsIntegrity(h.store)).toEqual([]);
    expect(
      h.store
        .listFacts()
        .filter((f) => resolveKey(f.key)?.kind.id === "named_actor_existence_basis"),
    ).toHaveLength(1);
    const leaf = "SYNTHETIC FIXTURE: one representative boatwright";
    for (const kind of ["named_actor_existence_basis", "actor_setup_placement"])
      expect(
        JSON.stringify(h.store.listFacts().find((f) => resolveKey(f.key)?.kind.id === kind)!.value),
      ).not.toContain(leaf);
    const head = h.store.head();
    expect(await new MsSetupPublisher(h.store).issue()).toMatchObject({ ok: true });
    expect(h.store.head()).toEqual(head);
    await h.campaign.close();
    const reopened = await mustMsReopen(h);
    expect(reopened.store.head()).toEqual(head);
    await reopened.close();
  });
});
