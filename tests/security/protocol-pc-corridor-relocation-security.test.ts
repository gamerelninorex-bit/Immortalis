/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted, separately opt-in, corridor-qualified confirmed relocation: no host input can
// supply authority, confirmation, identity, destination, corridor, route, timing or ownership; no refusal reveals a cause (a missing
// corridor is the same refusal as every other); nothing sealed or internal appears in a result; a forged, unprepared or wrong-gateway
// context reads and writes nothing; the source preflight reads by identity and writes nothing. The trusted context is an internal
// prerequisite: authentication, sessions and the confirmation interaction itself are NOT modelled and NOT claimed. Register lineage:
// IA-18 / IA-19 / IA-20 / IA-28 (partial, no status change); RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY } from "@immortalis/contracts";
import { ACTOR_OTHER } from "@immortalis/testkit";
import { corridorInput, establishCorridor } from "../support/logistics-corridor.ts";
import { movementSummary, custodiedCampaign } from "../support/pc-movement.ts";
import {
  CORRIDOR_KEY,
  CORRIDOR_REQUEST,
  DEST_LOCUS_ID,
  ORIGIN,
  PC,
  corridorCampaign,
  relocateViaCorridor,
  trustedCorridorRelocation,
} from "../support/protocol-corridor-relocation.ts";
import { confirmedChoice, trustedRelocation } from "../support/protocol-relocation.ts";
import { RELOCATION_REFUSAL } from "../support/protocol.ts";
import { spyStore } from "../support/temporal.ts";

const OK = '{"ok":true,"value":{"status":"RELOCATION_COMMITTED"}}';
const call = async (ctx: ReturnType<typeof trustedCorridorRelocation>, request: unknown) =>
  JSON.stringify(await relocateViaCorridor(ctx, request));

describe("IA-18 / IA-28: host input cannot supply authority, confirmation, identity, destination, corridor, route, timing or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await corridorCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedCorridorRelocation(s);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { player_confirmed: true },
      { campaign_id: "other-campaign" },
      { pc_id: ACTOR_OTHER },
      { destination: { world_id: "world-1", locus_id: "locus-fixture-other" } },
      { corridor: CORRIDOR_KEY },
      { corridor_key: CORRIDOR_KEY },
      { corridor_key: "world/world-fixture-1/corridor/locus-fixture-dest/locus-fixture-1" },
      { corridors: [CORRIDOR_KEY] },
      { route: [ORIGIN, DEST_LOCUS_ID] },
      { via: "locus-fixture-other" },
      { from: ORIGIN, to: DEST_LOCUS_ID },
      { world_id: "world-fixture-1" },
      { delivery_at: { unit: "t", value: 1 } },
      { duration: 1 },
      { speed: 1 },
      { access: true },
      { arrival: { at: 1 } },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { authored_under: { role: "role.player", permission: "permission.player_choice.commit" } },
      { authority: CANON_WRITE_AUTHORITY },
      { owner: "logistics" },
      { request_key: "pc/actor-smith/movement/request" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
      { sudo: true },
      { token: "abc" },
    ])
      expect(await call(ctx, CORRIDOR_REQUEST(claim)), JSON.stringify(claim)).toBe(
        RELOCATION_REFUSAL,
      );
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated, and a prototype-smuggled field is never read", async () => {
    const s = await corridorCampaign();
    const ctx = trustedCorridorRelocation(s);
    const throwing = new Proxy(
      {},
      {
        get: () => {
          throw new Error("hostile");
        },
        ownKeys: () => {
          throw new Error("hostile");
        },
      },
    );
    expect(await call(ctx, throwing)).toBe(RELOCATION_REFUSAL);
    const inherited = Object.create({ corridor_key: "world/x/corridor/y/z", pc_id: ACTOR_OTHER });
    inherited.operation = "commit_confirmed_pc_corridor_relocation";
    const r = await call(ctx, inherited);
    expect([OK, RELOCATION_REFUSAL]).toContain(r);
    // whatever the outcome, no host-chosen PC, destination or corridor reached any owner
    expect(s.campaign.pcMovementCommitment(ACTOR_OTHER)).toBeUndefined();
    const c = s.campaign.pcMovementCommitment(PC)?.value;
    if (c) expect(c.intent.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
  });

  it("the operation allowlist: the sibling operation, other names and internal ones are refused", async () => {
    const s = await corridorCampaign();
    const ctx = trustedCorridorRelocation(s);
    for (const operation of [
      "commit_confirmed_pc_relocation",
      "getFact",
      "listFacts",
      "commitPcVoluntaryMovement",
      "establishPcMovementRequest",
      "commitMovement",
      "commitCorridorMovement",
      "establishCorridor",
      "dispatch",
      "advance",
      "registerObject",
      "COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION",
      "commit_confirmed_pc_corridor_relocation ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(RELOCATION_REFUSAL);
  });

  it("a forged, copied, parsed, wrong-gateway or stale-object context is refused before any state is read or written", async () => {
    const s = await corridorCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedCorridorRelocation(s);
    const sibling = trustedRelocation(s);
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      sibling,
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, CORRIDOR_REQUEST())).toBe(RELOCATION_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — missing corridor, reverse corridor, unbound corridor, wrong PC, wrong destination, bad boundary, existing move — yields byte-identical refusals that name no cause", async () => {
    const refusals = new Set<string>();
    // a world with no corridor at all
    const none = await custodiedCampaign();
    refusals.add(await call(trustedCorridorRelocation(none), CORRIDOR_REQUEST()));
    // a world with only the reverse corridor
    const reverse = await custodiedCampaign();
    await establishCorridor(reverse, 1, corridorInput(DEST_LOCUS_ID, ORIGIN));
    refusals.add(await call(trustedCorridorRelocation(reverse), CORRIDOR_REQUEST()));
    const s = await corridorCampaign();
    for (const over of [
      { corridor_key: CORRIDOR_KEY.replace(DEST_LOCUS_ID, "locus-nowhere") },
      { choice: confirmedChoice({ pc_id: ACTOR_OTHER }) },
      { choice: confirmedChoice({ locus_id: "locus-nowhere" }) },
      { choice: confirmedChoice({ locus_id: ORIGIN }) },
      { delivery_at: { unit: "t", value: 1 } },
      { delivery_at: undefined },
      { publication: undefined },
      { corridor_key: undefined },
    ])
      refusals.add(await call(trustedCorridorRelocation(s, over), CORRIDOR_REQUEST()));
    // and after a lawful relocation, a second journey
    expect(await call(trustedCorridorRelocation(s), CORRIDOR_REQUEST())).toBe(OK);
    refusals.add(
      await call(
        trustedCorridorRelocation(s, { choice: confirmedChoice({ locus_id: ORIGIN }) }),
        CORRIDOR_REQUEST(),
      ),
    );
    expect([...refusals]).toEqual([RELOCATION_REFUSAL]);
  });

  it("the success carries no owner, key, corridor, route, revision, hash, provenance, locus or arrival vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await corridorCampaign();
    const ctx = trustedCorridorRelocation(s);
    const first = await call(ctx, CORRIDOR_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, CORRIDOR_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|corridor|revision|sha256|provenance|sealed|route|locus|arriv|replayed|receipt|pc_existence|logistics|world/i,
    );
  });

  it("a refusal never echoes an owner message, key, identity, corridor or detail from the store", async () => {
    const s = await custodiedCampaign();
    const out = await call(trustedCorridorRelocation(s), CORRIDOR_REQUEST());
    expect(out).toBe(RELOCATION_REFUSAL);
    expect(out).not.toContain(CORRIDOR_KEY);
    expect(out).not.toContain(PC);
    expect(out).not.toMatch(/corridor/i);
  });
});

describe("IA-20: the preflight reads by identity and writes nothing; the only writes are the four existing owner publications and the one Temporal registration", () => {
  it("a refused source scans nothing and commits nothing: by-identity reads only", async () => {
    const s = await custodiedCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedCorridorRelocation(s), CORRIDOR_REQUEST())).toBe(RELOCATION_REFUSAL);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts).toContain(CORRIDOR_KEY);
  });

  it("exactly five canonical groups commit, each under canon-write authority, in this gateway's own identity namespace, and none is player-authored or host-named", async () => {
    const s = await corridorCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedCorridorRelocation(s), CORRIDOR_REQUEST())).toBe(OK);
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "pc_existence",
      "pc_existence",
      "logistics",
      "logistics",
      "temporal_kernel",
    ]);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.group_id).toMatch(
        /^pc-corridor-relocation-group:(commitment|request|movement|dispatch|temporal):/,
      );
      expect(g.intent_id).toMatch(
        /^pc-corridor-relocation-intent:(commitment|request|movement|dispatch|temporal):/,
      );
    }
    // no group wrote a corridor, a locus or any World-State fact
    expect(spy.commits.flatMap((g) => g.writes.map((w) => w.owner))).not.toContain("world_state");
    expect(spy.listCalls()).toBe(0);
    expect(movementSummary(s).facts.some((f) => f.key === CORRIDOR_KEY && f.version !== 1)).toBe(
      false,
    );
  });
});
