import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MsActorRunner } from "@immortalis/operator";
import { MsSetupPublisher, planMsActor, nodeFs } from "@immortalis/engine";
import { msActorIssueKey } from "@immortalis/contracts";
import { msHarness } from "../support/ms-setup.ts";
async function issue() {
  const h = await msHarness(),
    p = new MsSetupPublisher(h.store),
    s = p.chain();
  expect(await p.issue()).toMatchObject({ ok: true });
  const plan = planMsActor(h.state(), s.cf.key, s.c);
  if (!plan.ok) throw new Error(plan.error.code);
  const pin = { fact_key: msActorIssueKey(s.c.world_id, s.c.locus_id, s.digest), version: 1 };
  const fresh = () =>
    new MsActorRunner({
      ...h.keys,
      driver: h.actorDriver,
      outboxDir: h.outboxDir,
      macKey: h.macKey,
    });
  return { h, p, s, plan: plan.value, pin, fresh };
}
describe("isolated ACTOR pre-send, one-attempt protected recovery and disclosed loss boundary", () => {
  for (const landed of [false, true])
    it(
      "surfaces a protected result-write failure (landed=" + landed + ") without a second send",
      async () => {
        const { h, plan, pin, fresh } = await issue();
        let failures = 0;
        const runner = new MsActorRunner({
          ...h.keys,
          driver: h.actorDriver,
          outboxDir: h.outboxDir,
          macKey: h.macKey,
          fs: {
            ...nodeFs,
            async createExclusive(path, bytes) {
              const record = JSON.parse(bytes) as { name: string };
              if (record.name.startsWith("result:")) {
                if (landed) await nodeFs.createExclusive(path, bytes);
                failures++;
                throw new Error("TEST: protected result write failed before acknowledgement");
              }
              await nodeFs.createExclusive(path, bytes);
            },
          },
        });
        expect(
          await runner.dispatch(runner.authorize(h.store, pin)!, plan.instructions, plan.bytes),
        ).toEqual({
          status: "UNKNOWN",
          reason: "MS_RESULT_STORE_WRITE_FAILED",
        });
        expect(failures).toBe(1);
        expect(h.calls()).toBe(1);
        const restarted = fresh();
        const recovered = await restarted.dispatch(
          restarted.authorize(h.store, pin)!,
          plan.instructions,
          plan.bytes,
        );
        expect(recovered).toMatchObject(
          landed ? { status: "RESPONDED" } : { status: "UNKNOWN", reason: "MS_PARKED_UNKNOWN" },
        );
        expect(h.calls()).toBe(1);
        await h.campaign.close();
      },
    );
  it("refuses instruction/whitespace/key-order substitutions before send, then consumes the exact committed issue once", async () => {
    const { h, plan, pin } = await issue();
    for (const [instructions, bytes] of [
      [plan.instructions + " ", plan.bytes],
      [plan.instructions, Buffer.concat([plan.bytes, Buffer.from(" ")])],
      [plan.instructions, Buffer.from(JSON.stringify(JSON.parse(plan.bytes.toString()), null, 2))],
    ] as const) {
      const cap = h.actorRunner.authorize(h.store, pin)!;
      expect(await h.actorRunner.dispatch(cap, instructions, bytes)).toMatchObject({
        status: "REFUSED",
      });
      expect(h.calls()).toBe(0);
    }
    const cap = h.actorRunner.authorize(h.store, pin)!;
    expect(await h.actorRunner.dispatch(cap, plan.instructions, plan.bytes)).toMatchObject({
      status: "RESPONDED",
    });
    expect(await h.actorRunner.dispatch(cap, plan.instructions, plan.bytes)).toMatchObject({
      status: "REFUSED",
    });
    expect(h.calls()).toBe(1);
    await h.campaign.close();
  });
  it("recovers a first signed answer after runner replacement and a lost canonical acknowledgement, then resumes every owner cut idempotently", async () => {
    const { h, p, plan, pin, fresh } = await issue();
    const answer = await h.actorRunner.dispatch(
      h.actorRunner.authorize(h.store, pin)!,
      plan.instructions,
      plan.bytes,
    );
    const restarted = fresh();
    const recovered = await restarted.dispatch(
      restarted.authorize(h.store, pin)!,
      plan.instructions,
      plan.bytes,
    );
    expect(recovered).toEqual(answer);
    expect(h.calls()).toBe(1);
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const head = h.store.head();
    for (const commit of [
      () => p.issue(),
      () => p.existence(),
      () => p.placement(),
      () => p.closure(),
      () => p.presence(),
    ])
      expect(await commit()).toMatchObject({ ok: true });
    expect(h.store.head()).toEqual(head);
    expect(h.calls()).toBe(1);
    await h.campaign.close();
  });
  it("parks a present corrupt attempt without another send; total lane loss remains a measured redispatch counter-limit", async () => {
    const { h, plan, pin, fresh } = await issue();
    expect(
      await h.actorRunner.dispatch(
        h.actorRunner.authorize(h.store, pin)!,
        plan.instructions,
        plan.bytes,
      ),
    ).toMatchObject({ status: "RESPONDED" });
    const dir = join(h.outboxDir, "ms-actor-outbox"),
      files = readdirSync(dir);
    for (const f of files) writeFileSync(join(dir, f), "corrupt");
    const runner = fresh();
    expect(
      await runner.dispatch(runner.authorize(h.store, pin)!, plan.instructions, plan.bytes),
    ).toMatchObject({ status: "UNKNOWN" });
    expect(h.calls()).toBe(1);
    rmSync(dir, { recursive: true });
    const lost = fresh();
    expect(
      await lost.dispatch(lost.authorize(h.store, pin)!, plan.instructions, plan.bytes),
    ).toMatchObject({ status: "RESPONDED" });
    expect(h.calls()).toBe(2);
    await h.campaign.close();
  });
  it("retains all 262145 returned bytes in protected storage and parks instead of truncating or calling again", async () => {
    const raw = Buffer.alloc(262145, 120),
      h = await msHarness({ raw: () => raw });
    expect(await h.actorService.advance()).toMatchObject({ status: "PARKED_UNKNOWN" });
    expect(await h.actorService.advance()).toMatchObject({ status: "PARKED_UNKNOWN" });
    expect(h.calls()).toBe(1);
    const dir = join(h.outboxDir, "ms-actor-outbox");
    expect(
      readdirSync(dir).some((f) =>
        readFileSync(join(dir, f), "utf8").includes(raw.toString("base64")),
      ),
    ).toBe(true);
    expect(h.store.getFact("temporal/state")).toBeUndefined();
    await h.campaign.close();
  });
});
