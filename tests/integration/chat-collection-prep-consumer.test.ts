/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The CONSUMER witness of the chat-requested collection-preparation route (BLUE Revision 2): preparing is not collecting. After setup, a NEW,
// separately confirmed `collect` through the EXISTING chat action path reaches the actual independent owner checks, and the existing
// continue/finish steps run to a conserved result with no new gameplay mechanic. Grounded negatives withhold or refuse without fabricating
// a permission, an output, a receipt or elapsed time. This is integration regression evidence, not a demand to implement general play.
//
// EVERYTHING HERE IS A MECHANISM TEST (a scripted assistant, a scripted human, scripted PLUMBING referee hosts, the real owners).
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PopulationAdapter } from "@immortalis/engine";
import { popPublication } from "@immortalis/testkit";
import {
  MOMENT,
  TAU,
  UNIT,
  chain,
  cloneSlot,
  openOrdinary,
  pendingFiles,
  resumed,
  routePolicy,
  stage,
  status,
  type Position,
  type Slot,
} from "../support/chat-route.ts";

let steps: Partial<Record<Position, Slot>>;
beforeAll(async () => {
  steps = await chain({ cycle: true });
}, 300_000);
afterAll(() => undefined);

const world = async (s: Slot) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    return {
      revision: c.store.head().revision,
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")?.value as any)
        .recoverable.amount as number,
      reserve: facts
        .filter((f) => f.key.startsWith("production/reserve/"))
        .map((f) => (f.value as any).quantity.amount as number),
      clock: (c.store.getFact("temporal/state")?.value as any).canonical_time.value as number,
      attestations: facts.filter((f) => f.key.includes("/collection-attestation/")).length,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ).length,
    };
  } finally {
    await c.close();
  }
};

describe("MECHANISM: after setup, the existing collection path is reached by a new, separately confirmed request - and only by it", () => {
  it("collect 2 → its own confirmation → the reach reading → finish (its own confirmation): the source falls by 2, the Reserve rises by 2, time runs 2 cycles - and setup itself did none of it", async () => {
    const s = await cloneSlot(steps["READY"]!);
    const before = await world(s);
    // setup left everything untouched: whole source, EMPTY Reserve, the clock at its author's origin, no commitment
    expect(before).toMatchObject({
      source: 12,
      reserve: [0],
      clock: MOMENT.value,
      attestations: 1,
      commitments: 0,
    });
    const r = await resumed(s);
    try {
      expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);
      // no setup call acts: the collection is a SEPARATE request of the player's
      const requested = await stage(r.chat, "collect", { amount: 2 });
      expect(requested.finished.elicited).toHaveLength(1);
      expect(requested.finished.elicited[0]).toContain("THE CHARACTER'S COLLECTION ATTEMPT");
      expect(requested.finished.elicited[0]).toMatch(/type exactly "collect [0-9a-f]{12}"/);
      expect(requested.finished.data.exit_code).toBe(0);
      // the owners decide reach, duration and result: the existing continue step asks the bound referee and the owners
      const continued = await stage(r.chat, "continue_collection");
      expect(continued.finished.data.exit_code).toBe(0);
      expect(continued.finished.elicited).toEqual([]);
      const mid = await world(s);
      expect(mid.commitments).toBe(1);
      // nothing yet collected: the work is admitted, not done
      expect(mid.source).toBe(12);
      expect(mid.reserve).toEqual([0]);
      const finished = await stage(r.chat, "finish_collection");
      expect(finished.finished.elicited).toHaveLength(1);
      expect(finished.finished.data.exit_code).toBe(0);
      expect(finished.finished.elicited[0]).toContain(
        `canonical time to exactly ${MOMENT.value + 2 * TAU} ${UNIT}`,
      );
    } finally {
      await r.stop();
    }
    const after = await world(s);
    expect(after).toMatchObject({
      source: 10,
      reserve: [2],
      clock: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
    // a fresh process: the same prepared route, the remainder is real
    const again = await resumed(s);
    try {
      expect((await status(again.chat)).route.readiness.prepared_to_request_collection).toBe(true);
    } finally {
      await again.stop();
    }
  }, 240_000);

  it("a declined collection leaves the prepared campaign exactly as it was", async () => {
    const s = await cloneSlot(steps["READY"]!);
    const before = await world(s);
    const r = await resumed(s);
    try {
      const out = await stage(r.chat, "collect", { amount: 2 }, () => ({ action: "decline" }));
      expect(out.finished.data.engine_report.join("\n")).toContain("DECLINED");
    } finally {
      await r.stop();
    }
    expect(await world(s)).toEqual(before);
  }, 120_000);
});

describe("MECHANISM: grounded negatives - a missing or negative adjudication withholds, and never supplies what was not given", () => {
  it("a referee that does not establish the cycle: nothing is attested, no connection is installed, the collection is not offered, and the genuine negative is not asked again", async () => {
    const s = await cloneSlot(steps["DECLARED"]!);
    const r = await resumed(s, { policy: routePolicy({}, { negative: true }) });
    try {
      const out = await stage(r.chat, "finish_collection_setup");
      expect(out.finished.elicited).toEqual([]);
      expect(out.finished.data.result.status).toBe("FINISH_NOT_ATTESTED");
      expect(out.finished.data.exit_code).toBe(3);
      expect(out.finished.data.outcome).toBeUndefined();
      expect(out.finished.data.next).toContain("A genuine negative stays negative");
      expect(out.finished.data.route.readiness.prepared_to_request_collection).toBe(false);
      expect(existsSync(s.config.scenarioFile)).toBe(false);
      expect((await world(s)).attestations).toBe(0);
      // the existing collection tools refuse: the scenario is not configured, and nothing was started
      const collect = await r.chat.call("collect", { amount: 1 });
      expect(collect.isError).toBe(true);
      expect(collect.text).toContain("not configured");
      // asked again, the same retained negative is read: no other question is put to anyone, nothing changes
      const answered = r.hosts.reduce((n, h) => n + h.answered.length, 0);
      const again = await stage(r.chat, "finish_collection_setup");
      expect(again.finished.data.result.status).toBe("FINISH_NOT_ATTESTED");
      expect(r.hosts.reduce((n, h) => n + h.answered.length, 0)).toBe(answered);
      expect(pendingFiles(s)).toEqual([]);
    } finally {
      await r.stop();
    }
    expect((await world(s)).attestations).toBe(0);
  }, 180_000);

  it("a declaration made stale by an owner's later change is not ready: the player is told, the retained words are kept, and a new declaration needs a new confirmation", async () => {
    const s = await cloneSlot(steps["READY"]!);
    // an arriving resident that the author's declaration did not cover (Population's own ledger at the locus)
    const c = await openOrdinary(s.campaignDir);
    try {
      const written = await new PopulationAdapter(c.store).establishLedger({
        ...popPublication(901),
        ledger: {
          ledger_id: "ledger-arrival",
          unit_class: "arrival",
          world_id: "world-courtyard",
          locus_id: "locus-courtyard",
          units: [
            {
              unit_id: "unit-arrival",
              residence: "locus-courtyard",
              presence: "locus-courtyard",
              burden_allocation: null,
            },
          ],
          point: { unit: UNIT, value: MOMENT.value },
        },
      } as never);
      expect(written.ok, JSON.stringify(written)).toBe(true);
    } finally {
      await c.close();
    }
    const r = await resumed(s);
    try {
      const route = (await status(r.chat)).route;
      expect(route.readiness.prepared_to_request_collection).toBe(false);
      expect(route.stages).toContainEqual({
        stage: "closed_setting",
        state: "STALE",
        detail: "the owners' facts moved on",
      });
      expect(route.next).toMatchObject({ tool: "declare_closed_setting" });
      expect(route.next.note).toContain("stale");
    } finally {
      await r.stop();
    }
  }, 180_000);
});
