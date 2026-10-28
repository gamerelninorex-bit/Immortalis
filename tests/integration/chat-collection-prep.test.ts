/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The chat-requested ORIGINAL-world collection-preparation route (BLUE Revision 2, A2 acceptance amendment): from a fresh, empty, already
// configured campaign slot, through the authenticated chat service, the staged operator commands and the real owners, to a campaign that
// is prepared for the player to REQUEST the supported collection - and not one step further.
//
// EVERYTHING HERE IS A MECHANISM TEST. The "assistant" is a script that calls typed tools; the "human" is a script that answers an
// elicitation only where a test says so; the "referee hosts" are scripted PLUMBING hosts that demonstrate what the engine enforces and
// prove nothing about whether an AI understood a sentence. It is not a chat host, a model, a person, a client UI or live acceptance.
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mirrorItems } from "../../packages/operator/src/original-pc.ts";
import { playerViewSecretPath } from "../../packages/operator/src/player-view-exchange.ts";
import { secretsOf } from "../support/chat-character.ts";
import {
  ACTUATOR,
  MOMENT,
  TRAVERSAL,
  UNIT,
  openOrdinary,
  pendingFiles,
  routeRecord,
  run,
  status,
  type RouteRun,
} from "../support/chat-route.ts";
import {
  completeOpening,
  openingCharacter,
  openingSetting,
  supportedOpening,
} from "../support/two-review-opening.ts";

afterEach(() => vi.restoreAllMocks());

const ANY_CHALLENGE =
  /(keep-character|place-character|establish-character-locus|initialize-time|accept-clarification|prepare-collection|declare-closed-setting) [0-9a-f]{12}/;

/** what the owners hold after the route, read afresh with the ordinary registry (the service must be closed) */
async function owners(r: RouteRun) {
  const c = await openOrdinary(r.s.campaignDir);
  try {
    const facts = c.store.listFacts();
    const get = (prefix: string) => facts.filter((f) => f.key.startsWith(prefix));
    return {
      head: c.store.head(),
      keys: facts.map((f) => f.key),
      time: c.store.getFact("temporal/state")?.value as any,
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")?.value as any)
        ?.recoverable,
      reserves: get("production/reserve/").map((f) => (f.value as any).quantity),
      mechanisms: get("pc/").filter((f) => f.key.includes("/collection-mechanism/")),
      attestations: get("pc/").filter((f) => f.key.includes("/collection-attestation/")),
      clarifications: get("pc/").filter((f) => f.key.includes("/intrinsic-clarification/")),
      commitments: facts.filter((f) => f.key.includes("/collection/")),
      closure: facts.filter((f) => f.key.includes("scene-closure")),
      scope: get("population-scope/"),
      custody: get("world-state/pc/"),
      access: facts.filter((f) => /^access\//.test(f.key)),
    };
  } finally {
    await c.close();
  }
}

describe("MECHANISM: the accepted-cycle branch, from an empty configured slot to prepared-to-request, in ordinary tool calls", () => {
  it("each human choice is shown whole and confirmed by the human alone; the referee reads, the owners write; nothing is collected, observed or advanced", async () => {
    const r = await supportedOpening();
    try {
      expect(existsSync(r.s.campaignDir)).toBe(false);
      await completeOpening(r);
      expect(
        r.j.reviews.filter((x) => x.decision === "accept").map((x) => [x.category, x.channel]),
      ).toEqual([
        ["setting", "ui"],
        ["generation", "ui"],
      ]);
      expect(r.j.reviews.every((x) => x.decision === "accept")).toBe(true);
      const setting = r.j.reviews[0]!.material;
      const generation = r.j.reviews[1]!.material;
      for (const value of Object.values(openingSetting().opening.declaration))
        expect(setting).toContain(value);
      expect(setting).toContain(MOMENT.statement);
      expect(setting).toContain("daylight");
      expect(generation).toContain(openingCharacter().opening.presence);
      expect(generation).toContain("stationary physical location");
      expect(generation).toContain(ACTUATOR);
      expect(generation).toContain(TRAVERSAL);
      expect(generation).toContain(openingCharacter().opening.preparation.cycle_quote);
      expect(setting + generation).not.toMatch(
        /"(?:format|world_id|fact_key|chronology|cycle_value)"\s*:|type exactly|\/confirm/,
      );
      const c = await openOrdinary(r.s.campaignDir);
      try {
        const pc = c.binding()!.value.active_pc.entity_id;
        for (const item of mirrorItems(c.playerCharacter(pc)!.value))
          expect(generation).toContain(item.text);
        const custody = c.pcPhysicalLocusCustody(pc)!;
        expect(custody.value.basis.established_from).toBe("ACTIVATION");
        const revision = (f: any) => c.store.lookupReceipt(f.provenance.intent_id)!.revision;
        expect(revision(c.playerCharacter(pc)!.fact)).toBeLessThan(revision(c.binding()!.fact));
        expect(revision(c.binding()!.fact)).toBeLessThan(revision(custody.fact));
        expect(revision(custody.fact)).toBeLessThan(revision(c.store.getFact("temporal/state")));
      } finally {
        await c.close();
      }
      const complete = (await status(r.chat)).route;
      expect(complete.readiness).toEqual({
        prepared_to_request_collection: true,
        campaign_started: false,
      });
      expect(complete.next).toBeNull();

      // what the model could see carries no challenge, human reply, secret or private path
      const model = r.j.model.join("\n");
      expect(model).not.toMatch(ANY_CHALLENGE);
      for (const secret of [...secretsOf(r.s), r.s.root, r.s.operatorDir, r.s.campaignDir])
        expect(model).not.toContain(secret);
    } finally {
      await r.stop();
    }

    // the owners: setup left the source whole, the Reserve EMPTY, no commitment, no access packet, and the clock where its author put it
    const o = await owners(r);
    expect(o.source).toMatchObject({ amount: 5, unit: "Pcs" });
    expect(o.reserves).toEqual([{ amount: 0, unit: "Pcs" }]);
    expect(o.time.canonical_time).toEqual({ unit: UNIT, value: MOMENT.value });
    expect(o.time.last_transaction).toBeNull();
    expect(o.custody).toHaveLength(1);
    expect(o.mechanisms).toHaveLength(1);
    expect(o.attestations).toHaveLength(1);
    expect(o.clarifications).toHaveLength(0);
    expect(o.commitments).toEqual([]);
    expect(o.access).toEqual([]);
    expect(o.closure).toHaveLength(1);
    expect(o.scope).toHaveLength(1);

    // the connection: exactly the seven identities the trusted service derived, installed privately; the earned-Glance view bound
    const scenario = JSON.parse(readFileSync(r.s.config.scenarioFile, "utf8"));
    expect(Object.keys(scenario).sort()).toEqual(
      [
        "basis",
        "mechanism",
        "player_character",
        "quantity_unit",
        "reserve",
        "source",
        "world",
      ].sort(),
    );
    expect(scenario).toMatchObject({
      world: "world-courtyard",
      source: "src-loose-stones",
      quantity_unit: "Pcs",
    });
    expect(statSync(r.s.config.scenarioFile).mode & 0o077).toBe(0);
    expect(
      existsSync(
        playerViewSecretPath(
          { stateDir: r.s.operatorDir, campaignId: r.s.config.campaignId },
          "view-host",
        ),
      ),
    ).toBe(true);
    // nothing is left pending, and nothing from the stages is retained once they stand in canon
    expect(pendingFiles(r.s)).toEqual([]);
    expect(routeRecord(r.s)).toBeNull();

    // a fresh process reports the very same: nothing is restarted, nothing is asked
    const fresh = await run(r.s, {});
    try {
      const again = await status(fresh.chat);
      expect(again.route.readiness).toEqual({
        prepared_to_request_collection: true,
        campaign_started: false,
      });
      expect(
        again.route.stages.every((s: any) => s.state === "DONE" || s.state === "NOT_NEEDED"),
      ).toBe(true);
    } finally {
      await fresh.app.close();
    }
  }, 240_000);
});
