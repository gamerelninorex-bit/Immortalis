import { describe, it, expect } from "vitest";
import { MsActorRunner, MsInitialActorService } from "@immortalis/operator";
import { resolveKey, MsSetupPublisher } from "@immortalis/engine";
import { msHarness } from "../support/ms-setup.ts";
import { FIXTURE_POLICY } from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

describe("MS issue/send/response/existence/B1/closure/time/B2 package recovery cuts (T1 only)", () => {
  for (const kind of [
    "initial_actor_setup_issue",
    "initial_actor_setup_response",
    "named_actor_existence_basis",
    "actor_setup_placement",
    "world_setup_closure",
    "temporal_state",
    "actor_physical_presence",
  ])
    it(
      "recovers the lost acknowledgement after " + kind + " from the same sealed attempt",
      async () => {
        const h = await msHarness(),
          commit = h.store.commit.bind(h.store),
          identity = new MsSetupPublisher(h.store).chain().actor;
        let cut = false;
        h.store.commit = async (group) => {
          const r = await commit(group);
          if (
            !cut &&
            r.ok &&
            resolveKey((group as { writes: { key: string }[] }).writes[0]!.key)?.kind.id === kind
          ) {
            cut = true;
            throw new Error("TEST: publication landed; acknowledgement lost");
          }
          return r;
        };
        expect((await h.actorService.advance()).status).not.toBe("COMPLETED");
        expect(cut).toBe(true);
        await h.campaign.close();
        const reopened = await must(h.reopen());
        const runner = new MsActorRunner({
          ...h.keys,
          driver: h.actorDriver,
          outboxDir: h.outboxDir,
          macKey: h.macKey,
        });
        expect(
          await new MsInitialActorService(reopened.store, runner, FIXTURE_POLICY).advance(),
        ).toEqual({ status: "COMPLETED" });
        expect(new MsSetupPublisher(reopened.store).chain().actor).toBe(identity);
        expect(h.calls()).toBe(1);
        expect(reopened.verify()).toEqual([]);
        await reopened.close();
      },
    );
  it("parks a returned answer whose canonical Response write did not land, then recovers those same protected bytes", async () => {
    const h = await msHarness(),
      commit = h.store.commit.bind(h.store);
    h.store.commit = async (group) => {
      if (
        resolveKey((group as { writes: { key: string }[] }).writes[0]!.key)?.kind.id ===
        "initial_actor_setup_response"
      )
        throw new Error("TEST: Response never reached the store");
      return commit(group);
    };
    expect(await h.actorService.advance()).toMatchObject({ status: "PARKED_UNKNOWN" });
    expect(h.calls()).toBe(1);
    await h.campaign.close();
    const reopened = await must(h.reopen());
    const runner = new MsActorRunner({
      ...h.keys,
      driver: h.actorDriver,
      outboxDir: h.outboxDir,
      macKey: h.macKey,
    });
    expect(
      await new MsInitialActorService(reopened.store, runner, FIXTURE_POLICY).advance(),
    ).toEqual({ status: "COMPLETED" });
    expect(h.calls()).toBe(1);
    await reopened.close();
  });
});
