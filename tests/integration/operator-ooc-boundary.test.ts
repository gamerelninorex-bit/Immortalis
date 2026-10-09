/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw fact values */
// F54-R2 acceptance: the declared delivery boundary is an OUT-OF-CHARACTER scenario premise, never a player's travel-time choice.
// Governing amendment: BLUE source-reconciliation amendment to the implementation brief (native pin 2026-10-09T17:37:14.077Z),
// §§B-C. Focused on presentation honesty, a required and undefaulted external boundary, and its untouched passage through the
// existing owners; the mechanism itself is proven by operator-journey / -process / -refusals / -recovery. Evidence here is
// CONDITIONAL on the authored premise: it shows the owners record and resolve the declared boundary, not that any geography could
// deliver by then.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { LogisticsCommitmentSchema, logisticsCommitmentKey } from "@immortalis/contracts";
import { OOC_BANNER, advance, relocate, runCli, status } from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION, at } from "@immortalis/testkit";
import { PC, W, authorityCensus, movementSummary } from "../support/pc-movement.ts";
import {
  FIXTURE_CAMPAIGN,
  RELOCATE_INPUT,
  cliArgs,
  copyCampaign,
  ctxOf,
  openSession,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";

let template: string;
beforeAll(async () => {
  template = await seedTemplate();
}, 120_000);

/** words that would turn a declared scenario value into a claim about the world */
const WORLD_CLAIM =
  /will (take|arrive|reach)|takes \d|arrives? (at|by|in)\b|expected arrival|estimated|\bETA of\b|journey (time|length) of|you will|travel speed of|route (is|will)/i;

const section = (lines: string[], from: RegExp, to: RegExp): string => {
  const a = lines.findIndex((l) => from.test(l));
  const b = lines.findIndex((l, i) => i > a && to.test(l));
  return lines.slice(a, b === -1 ? undefined : b).join("\n");
};

describe("honest presentation: the player's destination choice is not the scenario boundary", () => {
  it("confirmation 1 states the OOC origin, separates the character's choice from the declared boundary, and claims nothing about the world", async () => {
    const s = await openSession(copyCampaign(template));
    const t = scriptedTerminal("decline");
    await relocate(ctxOf(s, t), RELOCATE_INPUT);
    const lines = t.said;
    expect(lines).toContain(OOC_BANNER);
    const choice = section(lines, /THE CHARACTER'S CHOICE/, /SCENARIO DELIVERY BOUNDARY/);
    const scenario = section(lines, /SCENARIO DELIVERY BOUNDARY/, /^Confirming commits/);
    // the destination is the character's choice; the boundary value is not inside it
    expect(choice).toContain(`relocate to: ${W} / ${RELOCATE_INPUT.destination.locus_id}`);
    expect(choice).not.toContain(String(RELOCATE_INPUT.delivery_at.value));
    // the boundary value and its nature are in the scenario section, labelled out of character and uncalculated
    expect(scenario).toContain(
      `${RELOCATE_INPUT.delivery_at.value} ${RELOCATE_INPUT.delivery_at.unit}`,
    );
    expect(scenario).toMatch(/out of character/i);
    expect(scenario).toMatch(/not calculated/i);
    expect(scenario).toMatch(/not a travel time or ETA/i);
    expect(scenario).toMatch(/no forecast or guarantee\s+of arrival/i);
    expect(scenario).toMatch(/does not determine it/i);
    // raw identities and custody are labelled operator/debug, not perception
    expect(lines.join("\n")).toMatch(/operator\/debug/);
    expect(lines.join("\n")).toMatch(/not what the character perceives or knows/);
    expect(lines.join("\n")).not.toMatch(WORLD_CLAIM);
    await s.close();
  }, 120_000);

  it("confirmation 2 names the boundary as the earlier out-of-character declaration, not a calculated travel time", async () => {
    const s = await openSession(copyCampaign(template));
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    const t = scriptedTerminal("decline");
    await advance(ctxOf(s, t));
    const text = t.said.join("\n");
    expect(t.said).toContain(OOC_BANNER);
    expect(text).toMatch(
      /out-of-character value declared at the relocation, not a\s+calculated travel time/,
    );
    expect(text).not.toMatch(WORLD_CLAIM);
    await s.close();
  }, 120_000);

  it("the help text and every run identify the command line as OOC development/scenario instrumentation and require the boundary explicitly", async () => {
    const dirs = copyCampaign(template);
    const out: string[] = [];
    const code = await runCli(["relocate"], {
      out: (l) => void out.push(l),
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    expect(code).toBe(64);
    const help = out.join("\n");
    expect(help).toContain(OOC_BANNER);
    expect(help).toMatch(/NOT part of that choice/);
    expect(help).toMatch(/there\s+is no default/);
    expect(help).toMatch(/no travel time, ETA, forecast or guarantee of arrival/);
    expect(help).not.toMatch(WORLD_CLAIM);

    // a successful run (status) opens with the same banner
    const run: string[] = [];
    expect(
      await runCli(cliArgs.command("status", dirs), {
        out: (l) => void run.push(l),
        extension: ACTOR_FIXTURE_EXTENSION,
      }),
    ).toBe(0);
    expect(run[0]).toBe(OOC_BANNER);
  }, 120_000);
});

describe("the boundary is required, external and undefaulted", () => {
  it("the command line refuses a relocation that does not declare both parts of the boundary, before touching the campaign", async () => {
    const dirs = copyCampaign(template);
    const snapshot = async () => {
      const s = await openSession(dirs);
      const summary = movementSummary({ campaign: s.campaign });
      await s.close();
      return summary;
    };
    const before = await snapshot();
    const full = cliArgs.relocate(dirs);
    const drop = (...flags: string[]) =>
      full.filter((a, i) => !flags.includes(a) && !flags.includes(full[i - 1]!));
    const run = (args: string[]) =>
      runCli(args, { out: () => undefined, extension: ACTOR_FIXTURE_EXTENSION });
    for (const args of [
      drop("--delivery-unit"),
      drop("--delivery-value"),
      drop("--delivery-unit", "--delivery-value"),
    ])
      expect(await run(args)).toBe(64);
    for (const bad of ["", "soon", "1e3", "0x10", "-1", "1.5", " 5"])
      expect(await run(full.map((a, i) => (full[i - 1] === "--delivery-value" ? bad : a)))).toBe(
        64,
      );
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it("the library refuses an absent, null or malformed boundary and invents none", async () => {
    const s = await openSession(copyCampaign(template));
    const before = movementSummary({ campaign: s.campaign });
    for (const delivery_at of [undefined, null, {}, { unit: "t" }, { value: 5 }, "200", 200]) {
      const t = scriptedTerminal();
      const r = await relocate(ctxOf(s, t), {
        destination: RELOCATE_INPUT.destination,
        delivery_at,
      });
      expect(r.status).toBe("INVALID_INPUT");
      expect(t.asked()).toBe(0);
    }
    expect(movementSummary({ campaign: s.campaign })).toEqual(before);
    await s.close();
  }, 120_000);

  it("an out-of-order boundary (at or before the dispatch basis) or another time unit is refused by the owner; no time moves", async () => {
    for (const delivery_at of [at(100), at(1), { unit: "another-unit", value: 500 }]) {
      const s = await openSession(copyCampaign(template));
      const clock = (s.campaign.store.getFact("temporal/state")!.value as any).canonical_time;
      const r = await relocate(ctxOf(s, scriptedTerminal("confirm")), {
        ...RELOCATE_INPUT,
        delivery_at,
      });
      expect(r.status).toBe("UNAVAILABLE");
      expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ stationary: 1, total: 1 });
      expect(s.campaign.store.getFact(logisticsCommitmentKey(W, PC))).toBeUndefined();
      expect((s.campaign.store.getFact("temporal/state")!.value as any).canonical_time).toEqual(
        clock,
      );
      await s.close();
    }
  }, 180_000);
});

describe("the declared boundary passes untouched through the existing owners (conditional foundation evidence)", () => {
  it("whatever exact boundary the operator declares is the one Logistics records, Temporal registers and the kernel resolves to, and no other", async () => {
    for (const boundary of [at(200), at(260), at(777)]) {
      const s = await openSession(copyCampaign(template));
      const r = await relocate(ctxOf(s, scriptedTerminal("confirm")), {
        ...RELOCATE_INPUT,
        delivery_at: boundary,
      });
      expect(r.status).toBe("RELOCATION_COMMITTED");
      const commitment = LogisticsCommitmentSchema.parse(
        s.campaign.store.getFact(logisticsCommitmentKey(W, PC))!.value,
      );
      expect(commitment.delivery.at).toEqual(boundary);
      const object = s.campaign.store.getFact(`temporal/object/obj-logistics-pc-move:${PC}`)!
        .value as any;
      expect(object.next_boundary.at).toEqual(boundary);
      // no time moved by the choice of destination, whatever the boundary
      expect((s.campaign.store.getFact("temporal/state")!.value as any).canonical_time.value).toBe(
        100,
      );
      expect((await advance(ctxOf(s, scriptedTerminal("confirm")))).status).toBe(
        "ADVANCE_COMMITTED",
      );
      // the kernel resolved to exactly the declared value (conditional on that premise), nowhere earlier or later
      expect((s.campaign.store.getFact("temporal/state")!.value as any).canonical_time).toEqual(
        boundary,
      );
      expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ destination: 1, total: 1 });
      expect(status(s)).toMatchObject({ relocation: "COMMITTED", advances: ["COMMITTED"] });
      await s.close();
    }
  }, 240_000);

  it("the typed boundary belongs to the scenario, not the PC: the PC's commitment-of-record carries no timing", async () => {
    const s = await openSession(copyCampaign(template));
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    const commitment = JSON.stringify(s.campaign.pcMovementCommitment(PC)!.value);
    expect(commitment).not.toContain(RELOCATE_INPUT.delivery_at.unit);
    expect(commitment).not.toMatch(/delivery|boundary|duration|eta/i);
    await s.close();
    void FIXTURE_CAMPAIGN;
  }, 120_000);
});
