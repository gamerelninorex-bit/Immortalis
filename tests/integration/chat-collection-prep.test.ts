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
import { playerViewSecretPath } from "../../packages/operator/src/player-view-exchange.ts";
import { secretsOf, watch } from "../support/chat-character.ts";
import {
  ACTUATOR,
  CYCLE,
  DECLARATION,
  HANDLING,
  MOMENT,
  TAU,
  TRAVERSAL,
  UNIT,
  keys,
  openOrdinary,
  pendingFiles,
  routeRecord,
  run,
  stage,
  started,
  status,
  walk,
  type RouteRun,
} from "../support/chat-route.ts";
import { reader } from "../support/chat-route.ts";

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
    const r = await started({ cycle: true });
    const seen = watch(r.chat);
    try {
      const first = await status(r.chat);
      expect(first.route.next).toMatchObject({ tool: "establish_character_location" });
      expect(first.route.readiness).toEqual({
        prepared_to_request_collection: false,
        campaign_started: false,
      });

      const out = await walk(r, { cycle: true });
      const asked = (k: string) => out[k].finished.elicited as string[];

      // LOCUS: the whole physical review - the facts, the exact presence statement, the findings, the confirmation - then the phrase
      expect(asked("locus")).toHaveLength(1);
      expect(asked("locus")[0]).toContain("PHYSICAL LOCUS - a third, separate choice");
      expect(asked("locus")[0]).toContain("AI REFEREE FINDINGS: PHYSICAL PLACEMENT");
      expect(asked("locus")[0]).toContain("CONFIRMATION - PHYSICAL LOCUS");
      expect(asked("locus")[0]).toMatch(/type exactly "establish-character-locus [0-9a-f]{12}"/);
      expect(out["locus"].finished.data.result.status).toBe("LOCUS_ESTABLISHED");

      // CHRONOLOGY: exactly the author's words, coordinate and unit
      expect(asked("moment")).toHaveLength(1);
      expect(asked("moment")[0]).toContain(JSON.stringify(MOMENT.statement));
      expect(asked("moment")[0]).toContain(`"value": ${MOMENT.value}`);
      expect(asked("moment")[0]).toContain(`"unit": "${UNIT}"`);
      expect(out["moment"].finished.data.result.status).toBe("TIME_ESTABLISHED");
      // The fixture already authors the actual cycle: use it in preparation,
      // with no R-5 human question. Status offers a conditional alternative,
      // not an authoritative semantic verdict based on arbitrary numeric text.
      expect(out["handling"]).toBeUndefined();
      expect(out["moment"].finished.data.route.stages).toContainEqual({
        stage: "handling_duration",
        state: "NEXT",
      });
      expect(out["moment"].finished.data.route.next).toMatchObject({
        tool: "propose_collection_preparation",
        if_handling_duration_unresolved: { tool: "state_handling_duration" },
      });
      expect(out["preparation"].finished.data.route.stages).toContainEqual({
        stage: "handling_duration",
        state: "NOT_NEEDED",
      });

      // PREPARATION: every quotation, the Reserve (EMPTY), the basis - resolved from committed facts, none typed by the host
      expect(asked("preparation")).toHaveLength(1);
      const prep = asked("preparation")[0]!;
      for (const must of [
        `"statement": "${ACTUATOR}"`,
        `"statement": "${TRAVERSAL}"`,
        `"cycle_quote": "${CYCLE}"`,
        `"amount": 0`,
        `"condition": "dry"`,
        '"source_key": "src-loose-stones"',
        '"material_class": "loose-stone"',
      ])
        expect(prep).toContain(must);
      expect(out["preparation"].finished.data.result.status).toBe("COLLECTION_COMMITTED");

      // DECLARATION: the author's own words, whole, with the limits stated
      expect(asked("declaration")).toHaveLength(1);
      for (const w of Object.values(DECLARATION)) expect(asked("declaration")[0]).toContain(w);
      expect(asked("declaration")[0]).toContain("You do NOT state who or what is present");
      expect(out["declaration"].finished.data.result.status).toBe("SETTING_DECLARED");

      // FINISH asks the player NOTHING: the referee's reading and the service's installation are not player choices
      expect(asked("finish")).toEqual([]);
      expect(out["finish"].finished.data.result.status).toBe("FINISH_READY");
      expect(out["finish"].finished.data.route.readiness).toEqual({
        prepared_to_request_collection: true,
        campaign_started: false,
      });
      expect(out["finish"].finished.data.route.next).toBeNull();

      // four human confirmations in all, one per human-authored stage; none for the referee's reading or the service's own work
      const humanAsks = Object.values(out).reduce(
        (n: number, o: any) => n + (o.finished.elicited as string[]).length,
        0,
      );
      expect(humanAsks).toBe(4);

      // what the model could see carries no challenge, human reply, secret or private path
      const model = seen.join("\n");
      expect(model).not.toMatch(ANY_CHALLENGE);
      for (const secret of [...secretsOf(r.s), r.s.root, r.s.operatorDir, r.s.campaignDir])
        expect(model).not.toContain(secret);
    } finally {
      await r.stop();
    }

    // the owners: setup left the source whole, the Reserve EMPTY, no commitment, no access packet, and the clock where its author put it
    const o = await owners(r);
    expect(o.source).toMatchObject({ amount: 12, unit: "stone" });
    expect(o.reserves).toEqual([{ amount: 0, unit: "stone" }]);
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
      quantity_unit: "stone",
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

describe("MECHANISM: the R-5 branch - an unresolved duration is the player's own words, read by the referee and accepted by the player", () => {
  it("the character states an actuator and NO duration: the branch is offered, the player's words become an accepted claim, and the preparation quotes it", async () => {
    const r = await started({ cycle: false });
    try {
      const out = await walk(r, { cycle: false });
      expect(out["moment"].finished.data.route.stages).toContainEqual({
        stage: "handling_duration",
        state: "NEXT",
      });
      expect(out["moment"].finished.data.route.next).toMatchObject({
        canonical_unit: UNIT,
        if_handling_duration_unresolved: { tool: "state_handling_duration" },
      });
      // the player's account: shown whole with the referee's branch and scope readings, accepted in a SEPARATE confirmation
      const handled = out["handling"].finished.elicited as string[];
      expect(handled).toHaveLength(1);
      expect(handled[0]).toContain("ACCEPT A CLARIFICATION OF YOUR CHARACTER");
      expect(handled[0]).toContain(JSON.stringify(HANDLING));
      expect(handled[0]).toContain("branch reading:");
      expect(handled[0]).toContain("scope reading:");
      expect(handled[0]).toMatch(/type exactly "accept-clarification [0-9a-f]{12}"/);
      expect(out["handling"].finished.data.result.status).toBe("CLARIFICATION_ACCEPTED");
      expect(out["preparation"].finished.data.result.status).toBe("COLLECTION_COMMITTED");
      expect(out["preparation"].finished.elicited[0]).toContain(JSON.stringify(HANDLING));
      expect(out["preparation"].finished.elicited[0]).toContain('"clarified"');
      expect(out["finish"].finished.data.result.status).toBe("FINISH_READY");
      // five human confirmations: the four of the other branch and the player's own clarification
      const humanAsks = Object.values(out).reduce(
        (n: number, o: any) => n + (o.finished.elicited as string[]).length,
        0,
      );
      expect(humanAsks).toBe(5);
    } finally {
      await r.stop();
    }
    const o = await owners(r);
    expect(o.clarifications).toHaveLength(1);
    expect(o.mechanisms).toHaveLength(1);
    expect(o.attestations).toHaveLength(1);
    expect(o.reserves).toEqual([{ amount: 0, unit: "stone" }]);
    expect(o.commitments).toEqual([]);
    expect((o.clarifications[0]!.value as any).claims[0].statement).toBe(HANDLING);
  }, 240_000);
});

void keys;
void stage;
void reader;
void TAU;
