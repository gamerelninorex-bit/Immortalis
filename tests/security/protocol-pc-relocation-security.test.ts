/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted confirmed relocation: no host input can supply authority, confirmation,
// identity, destination, timing or ownership; no refusal reveals a cause; nothing sealed or internal appears in a result; a
// forged or unprepared context reads and writes nothing. The trusted context is an internal prerequisite: authentication, sessions
// and the confirmation interaction itself are NOT modelled and NOT claimed. Register lineage: IA-18 / IA-19 / IA-20 / IA-28
// (partial, no status change); RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY } from "@immortalis/contracts";
import { ACTOR_OTHER } from "@immortalis/testkit";
import { DEST_LOCUS_ID, PC, custodiedCampaign, movementSummary } from "../support/pc-movement.ts";
import { confirmedChoice, relocate, trustedRelocation } from "../support/protocol-relocation.ts";
import { RELOCATION_REFUSAL, RELOCATION_REQUEST } from "../support/protocol.ts";
import { spyStore } from "../support/temporal.ts";

const OK = '{"ok":true,"value":{"status":"RELOCATION_COMMITTED"}}';
const call = async (ctx: ReturnType<typeof trustedRelocation>, request: unknown) =>
  JSON.stringify(await relocate(ctx, request));

describe("IA-18 / IA-28: host input cannot supply authority, confirmation, identity, destination, timing or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await custodiedCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedRelocation(s);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { player_confirmed: true },
      { approved: "yes" },
      { campaign_id: "other-campaign" },
      { campaign: "other-campaign" },
      { pc_id: ACTOR_OTHER },
      { pc: ACTOR_OTHER },
      { destination: { world_id: "world-1", locus_id: "locus-fixture-other" } },
      { locus_id: "locus-fixture-other" },
      { delivery_at: { unit: "t", value: 1 } },
      { arrival: { at: 1 } },
      { duration: 1 },
      { role: "role.player" },
      { roles: ["role.archivist", "role.gm"] },
      { permission: "permission.player_choice.commit" },
      { permissions: ["permission.canon.write"] },
      { authored_under: { role: "role.player", permission: "permission.player_choice.commit" } },
      { authority: CANON_WRITE_AUTHORITY },
      { owner: "logistics" },
      { subject: "pc" },
      { key: "pc/actor-smith/movement/request" },
      { request_key: "pc/actor-smith/movement/request" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
      { as: "role.archivist" },
      { sudo: true },
      { admin: true },
      { authorization: "Bearer abc" },
      { token: "abc" },
      { session: { id: "1" } },
    ])
      expect(await call(ctx, RELOCATION_REQUEST(claim)), JSON.stringify(claim)).toBe(
        RELOCATION_REFUSAL,
      );
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
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
    expect(
      await call(
        ctx,
        JSON.parse('{"operation":"commit_confirmed_pc_relocation","__proto__":{"a":1}}'),
      ),
    ).toBe(RELOCATION_REFUSAL);
    expect(movementSummary(s).facts.some((f) => f.key.includes("movement"))).toBe(false);
  });

  it("a field smuggled through the prototype chain is refused or never read: only the bound choice can ever be committed", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    const inherited = Object.create({
      pc_id: ACTOR_OTHER,
      destination: { world_id: "world-1", locus_id: "locus-nowhere" },
    });
    inherited.operation = "commit_confirmed_pc_relocation";
    const r = await call(ctx, inherited);
    expect([OK, RELOCATION_REFUSAL]).toContain(r);
    // whatever the outcome, no host-chosen PC or destination reached any owner
    expect(s.campaign.pcMovementCommitment(ACTOR_OTHER)).toBeUndefined();
    const c = s.campaign.pcMovementCommitment(PC)?.value;
    if (c) expect(c.intent.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
  });

  it("the operation allowlist: other operation names, including internal ones, are refused", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    for (const operation of [
      "getFact",
      "listFacts",
      "commitPcVoluntaryMovement",
      "establishPcMovementRequest",
      "commitMovement",
      "dispatch",
      "advance",
      "registerObject",
      "read_current_event_signal_presentation",
      "deliver_causal_event_signal_presentation",
      "COMMIT_CONFIRMED_PC_RELOCATION",
      "commit_confirmed_pc_relocation ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(RELOCATION_REFUSAL);
  });

  it("a forged, copied, parsed or stale-object context is refused before any state is read or written", async () => {
    const s = await custodiedCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedRelocation(s);
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, RELOCATION_REQUEST())).toBe(RELOCATION_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — no authority, wrong PC, wrong destination, existing move — yields byte-identical refusals that name no cause", async () => {
    const s = await custodiedCampaign();
    const refusals = new Set<string>();
    for (const over of [
      {
        choice: confirmedChoice({
          authored_under: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      { choice: confirmedChoice({ pc_id: ACTOR_OTHER }) },
      { choice: confirmedChoice({ locus_id: "locus-nowhere" }) },
      { choice: confirmedChoice({ locus_id: "locus-fixture-1" }) },
      { delivery_at: undefined },
      { publication: undefined },
    ])
      refusals.add(await call(trustedRelocation(s, over), RELOCATION_REQUEST()));
    // and after a lawful relocation, a second journey
    expect(await call(trustedRelocation(s), RELOCATION_REQUEST())).toBe(OK);
    refusals.add(
      await call(
        trustedRelocation(s, { choice: confirmedChoice({ locus_id: "locus-fixture-1" }) }),
        RELOCATION_REQUEST(),
      ),
    );
    expect([...refusals]).toEqual([RELOCATION_REFUSAL]);
  });

  it("the success carries no owner, key, revision, hash, provenance, sealed, route, locus or arrival vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    const first = await call(ctx, RELOCATION_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, RELOCATION_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|revision|sha256|provenance|sealed|route|locus|arriv|replayed|receipt|pc_existence|logistics|world/i,
    );
  });

  it("a refusal never echoes an owner message, key, identity or detail from the store", async () => {
    const s = await custodiedCampaign();
    const out = await call(
      trustedRelocation(s, { choice: confirmedChoice({ locus_id: "locus-nowhere" }) }),
      RELOCATION_REQUEST(),
    );
    expect(out).toBe(RELOCATION_REFUSAL);
    expect(out).not.toContain("locus-nowhere");
    expect(out).not.toContain(PC);
  });
});

describe("IA-20: the only writes are the four existing owner publications, by the archivist path, under identities derived from the PC", () => {
  it("exactly four canonical groups commit, each under canon-write authority, and none is player-authored or host-named", async () => {
    const s = await custodiedCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedRelocation(s), RELOCATION_REQUEST())).toBe(OK);
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "pc_existence",
      "pc_existence",
      "logistics",
      "logistics",
    ]);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.group_id).toMatch(/^pc-relocation-group:(commitment|request|movement|dispatch):/);
      expect(g.intent_id).toMatch(/^pc-relocation-intent:(commitment|request|movement|dispatch):/);
    }
    expect(spy.listCalls()).toBe(0);
  });
});
