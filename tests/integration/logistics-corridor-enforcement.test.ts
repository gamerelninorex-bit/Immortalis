/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Source-Qualified Local Corridor and Logistics Read — independent fail-closed enforcement. None of it depends on the owner operations
// behaving: IM-11 admission and load verification hold for a raw `store.commit` and for TAMPERED groups and facts. A topology edge never
// supplies a duration, a service, an access right, an actor's agreement or a delivery, and a request that is missing, reversed, for
// another world or another endpoint, or already consumed, fails closed before Logistics commits anything.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0, unchanged). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  LogisticsCommitmentSchema,
  MovementServiceRequestSchema,
  TEMPORAL_STATE_KEY,
  WorldCorridorSchema,
  logisticsCommitmentKey,
  worldCorridorKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  LOGISTICS_RULE,
  WORLD_CORRIDOR_RULE,
  deriveCommitment,
  verifyCanonicalIntegrity,
  verifyLogisticsIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  DEST_LOCUS_ID,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  MOVE_1,
  MOVE_2,
  OTHER_LOCUS_ID,
  REQ_1,
  commitInput,
  dispatchInput,
  fixtureDestinationLocus,
  fixtureWorld,
  logPublication,
  logStopAtBoundaryRequest,
  movementRequestKey,
  publication,
} from "@immortalis/testkit";
import {
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  seededLogisticsCampaign,
  type LogSeeded,
} from "../support/logistics.ts";
import {
  acceptAndCommitViaCorridor,
  corridorCommit,
  corridorCommitDispatchRegister,
  corridorInput,
  corridorKeyOf,
  establishCorridor,
} from "../support/logistics-corridor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const E = entityIdOf(REQ_1);
const commitmentKey = logisticsCommitmentKey(W, E);
const requestKey = movementRequestKey(MOVE_1);
const entityKey = `world/${W}/entity/${E}`;
const worldKey = worldProfileKey(W);
const fromKey = worldLocusKey(W, FIXTURE_LOCUS_ID);
const toKey = worldLocusKey(W, DEST_LOCUS_ID);
const otherKey = worldLocusKey(W, OTHER_LOCUS_ID);
const corridorKey = corridorKeyOf();

const rawGroup = (
  n: number,
  owner: string,
  facet: string,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: FIXTURE_CAMPAIGN,
  group_id: `raw-group-${n}`,
  intent_id: `raw-intent-${n}`,
  owner,
  facet,
  cause: `raw-cause-${n}`,
  rule: owner === "logistics" ? LOGISTICS_RULE : WORLD_CORRIDOR_RULE,
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes: writes.map((w) => ({
    ...w,
    owner,
    facet,
    value: w.value as never,
    unit: null,
    basis: "raw-basis",
    secrecy: "raw-secrecy",
  })),
  ...over,
});
const pins = (store: CampaignStore, keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
  depends_on: [...new Set(keys.flatMap((k) => store.getFact(k)?.provenance.group_id ?? []))],
});
const fact = (s: LogSeeded, key: string): OwnerFact => s.campaign.store.getFact(key)!;
const withWrite = (g: CommitGroup, key: string, edit: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== key) return w;
    const value = structuredClone(w.value) as any;
    edit(value);
    return { ...w, value: value as never };
  }),
});
const codeOf = <T extends { ok: boolean }>(r: T): string =>
  r.ok ? "OK" : ((r as any).error.code as string);

const corridorValue = (from = FIXTURE_LOCUS_ID, to = DEST_LOCUS_ID) => ({
  world: { fact_key: worldKey, entity_id: W },
  from: { fact_key: worldLocusKey(W, from), entity_id: from },
  to: { fact_key: worldLocusKey(W, to), entity_id: to },
  statement: "a raw corridor",
});
const rawCorridor = (
  s: LogSeeded,
  n: number,
  value: unknown = corridorValue(),
  key = corridorKey,
  over: Partial<CommitGroup> = {},
) =>
  rawGroup(n, "world_state", "world_locus", [{ key, value, expected_version: 0 }], {
    ...pins(s.campaign.store, [worldKey, fromKey, toKey]),
    ...over,
  });

describe("only World-State's own world_locus facet can write a corridor key, and only the lawful corridor", () => {
  it("no other owner or facet, not Logistics and not the movement requester, can write a corridor — a fabricated or foreign-owner edge is refused", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    const owners: [string, string][] = [
      ["SYNTHETIC-MOVEMENT-REQUESTER", "synthetic-movement-requester"],
      ["logistics", "logistics_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["temporal_kernel", "temporal_coordination"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["world_state", "world_profile"],
      ["world_state", "world_source_condition"],
      ["world_state", "world_fallback_physical_entity"],
    ];
    let n = 0;
    for (const [owner, facet] of owners) {
      const r = await s.campaign.store.commit(
        rawGroup(
          600 + n++,
          owner,
          facet,
          [{ key: corridorKey, value: corridorValue(), expected_version: 0 }],
          pins(s.campaign.store, [worldKey, fromKey, toKey]),
        ),
      );
      expect(r.ok, `${owner}/${facet}`).toBe(false);
      expect(codeOf(r), `${owner}/${facet}`).toMatch(
        /KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT|OWNER_NOT_REGISTERED|WRITE_OWNER_MISMATCH/,
      );
    }
    expect(s.campaign.store.getFact(corridorKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a lawful raw corridor commits exactly like the owner operation; every deviation is refused with nothing written", async () => {
    const lawful = await seededLogisticsCampaign(tempDir());
    expect(codeOf(await lawful.campaign.store.commit(rawCorridor(lawful, 610)))).toBe("OK");
    expect(lawful.campaign.verify()).toEqual([]);

    const cases: [string, (s: LogSeeded) => CommitGroup, RegExp][] = [
      [
        "an endpoint that is not an established locus",
        (s) =>
          rawCorridor(
            s,
            620,
            corridorValue(FIXTURE_LOCUS_ID, "locus-never-established"),
            worldCorridorKey(W, FIXTURE_LOCUS_ID, "locus-never-established"),
          ),
        /must read the corridor's destination locus|not committed/,
      ],
      [
        "an origin that is not an established locus",
        (s) =>
          rawCorridor(
            s,
            621,
            corridorValue("locus-never-established", DEST_LOCUS_ID),
            worldCorridorKey(W, "locus-never-established", DEST_LOCUS_ID),
          ),
        /must read the corridor's origin locus|not committed/,
      ],
      [
        "a corridor of a world that is not committed",
        (s) =>
          rawCorridor(
            s,
            622,
            {
              ...corridorValue(),
              world: { fact_key: worldProfileKey("world-ghost"), entity_id: "world-ghost" },
              from: {
                fact_key: worldLocusKey("world-ghost", FIXTURE_LOCUS_ID),
                entity_id: FIXTURE_LOCUS_ID,
              },
              to: {
                fact_key: worldLocusKey("world-ghost", DEST_LOCUS_ID),
                entity_id: DEST_LOCUS_ID,
              },
            },
            worldCorridorKey("world-ghost", FIXTURE_LOCUS_ID, DEST_LOCUS_ID),
          ),
        /not committed/,
      ],
      [
        "a corridor filed under another ordered pair's key",
        (s) =>
          rawCorridor(
            s,
            623,
            corridorValue(),
            worldCorridorKey(W, DEST_LOCUS_ID, FIXTURE_LOCUS_ID),
          ),
        /identity does not match the key/,
      ],
      [
        "the same locus at both ends",
        (s) =>
          rawCorridor(
            s,
            624,
            corridorValue(FIXTURE_LOCUS_ID, FIXTURE_LOCUS_ID),
            worldCorridorKey(W, FIXTURE_LOCUS_ID, FIXTURE_LOCUS_ID),
          ),
        /contract/,
      ],
      [
        "a duration, a rate, an access right or a delivery smuggled in",
        (s) => rawCorridor(s, 625, { ...corridorValue(), travel_time: { value: 3, unit: "hour" } }),
        /contract/,
      ],
      [
        "an endpoint reference that is not the locus's own key",
        (s) =>
          rawCorridor(s, 626, {
            ...corridorValue(),
            to: { fact_key: otherKey, entity_id: DEST_LOCUS_ID },
          }),
        /contract/,
      ],
      [
        "no pin of an endpoint locus it depends on",
        (s) =>
          rawCorridor(s, 627, corridorValue(), corridorKey, {
            reads: pins(s.campaign.store, [worldKey, fromKey]).reads,
          }),
        /must read the corridor's destination locus/,
      ],
      [
        "no dependency on the group that committed the world",
        (s) => rawCorridor(s, 628, corridorValue(), corridorKey, { depends_on: [] }),
        /must depend on the group that committed/,
      ],
    ];
    for (const [name, build, message] of cases) {
      const s = await seededLogisticsCampaign(tempDir());
      const r = await s.campaign.store.commit(build(s));
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.error.message, name).toMatch(message);
      expect(
        s.campaign.store.listFacts().some((f) => f.key.includes("/corridor/")),
        name,
      ).toBe(false);
      expect(s.campaign.verify(), name).toEqual([]);
    }
  });

  it("an endpoint that is a locus of ANOTHER world is refused: a corridor stays within its world", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await must(
      s.campaign.establishWorld({
        ...publication(61),
        world: fixtureWorld({ world_id: "world-2" }),
      }),
    );
    await must(
      s.campaign.establishLocus({
        ...publication(62),
        locus: {
          ...fixtureDestinationLocus("locus-w2"),
          world: { fact_key: worldProfileKey("world-2"), entity_id: "world-2" },
        },
      }),
    );
    // world-2's locus offered as the destination of a world-1 corridor, by the real operation and by a raw group
    const viaOperation = await s.campaign.establishCorridor({
      ...publication(63),
      corridor: {
        world_id: W,
        from_locus_id: FIXTURE_LOCUS_ID,
        to_locus_id: "locus-w2",
        statement: "x",
      },
    });
    expect(codeOf(viaOperation)).toBe("PREREQUISITE_MISSING");
    const raw = await s.campaign.store.commit(
      rawGroup(
        630,
        "world_state",
        "world_locus",
        [
          {
            key: worldCorridorKey(W, FIXTURE_LOCUS_ID, "locus-w2"),
            value: {
              world: { fact_key: worldKey, entity_id: W },
              from: { fact_key: fromKey, entity_id: FIXTURE_LOCUS_ID },
              to: { fact_key: worldLocusKey(W, "locus-w2"), entity_id: "locus-w2" },
              statement: "cross-world",
            },
            expected_version: 0,
          },
        ],
        pins(s.campaign.store, [worldKey, fromKey, worldLocusKey("world-2", "locus-w2")]),
      ),
    );
    expect(raw.ok).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a corridor is create-only and one per ordered pair: a duplicate, a changed or an amended corridor never replaces it", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s, 1);
    const held = fact(s, corridorKey);
    // the same ordered pair again, same content, under a different identity: a conflict, never a sibling truth
    const again = await s.campaign.establishCorridor({
      ...publication(641),
      corridor: corridorInput(),
    });
    expect(codeOf(again)).toBe("VERSION_CONFLICT");
    // changed content under a different identity: also refused
    const changed = await s.campaign.establishCorridor({
      ...publication(642),
      corridor: corridorInput(FIXTURE_LOCUS_ID, DEST_LOCUS_ID, { statement: "a different road" }),
    });
    expect(codeOf(changed)).toBe("VERSION_CONFLICT");
    // an amendment (expected version 1) is refused: sealed canon
    const amended = await s.campaign.store.commit(
      rawGroup(
        643,
        "world_state",
        "world_locus",
        [{ key: corridorKey, value: corridorValue(), expected_version: 1 }],
        pins(s.campaign.store, [worldKey, fromKey, toKey]),
      ),
    );
    expect(codeOf(amended)).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(fact(s, corridorKey)).toEqual(held);
    // the same intent re-presented is the same receipt; the same intent with different content is refused
    const replay = await s.campaign.establishCorridor({
      group_id: held.provenance.group_id,
      intent_id: held.provenance.intent_id,
      cause: held.provenance.cause,
      basis: held.basis,
      secrecy: held.secrecy,
      corridor: corridorInput(),
    });
    expect(replay.ok && replay.value.replayed).toBe(true);
    const altered = await s.campaign.establishCorridor({
      group_id: held.provenance.group_id,
      intent_id: held.provenance.intent_id,
      cause: held.provenance.cause,
      basis: held.basis,
      secrecy: held.secrecy,
      corridor: corridorInput(FIXTURE_LOCUS_ID, DEST_LOCUS_ID, { statement: "altered" }),
    });
    expect(altered.ok).toBe(false);
    expect(fact(s, corridorKey)).toEqual(held);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the owner operation accepts identities and a statement only: a malformed or smuggled input is refused as INPUT_INVALID", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    for (const [i, bad] of [
      { ...corridorInput(), duration: 3 },
      { ...corridorInput(), reverse: true },
      { ...corridorInput(), version: 1 },
      { ...corridorInput(), statement: "" },
      { ...corridorInput(), statement: " padded " },
      { ...corridorInput(), from_locus_id: "has/slash" },
      { ...corridorInput(FIXTURE_LOCUS_ID, FIXTURE_LOCUS_ID) },
      { world_id: W },
    ].entries()) {
      const r = await s.campaign.establishCorridor({
        ...publication(650 + i),
        corridor: bad,
      });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(codeOf(r)).toMatch(/INPUT_INVALID|PREREQUISITE_MISSING/);
    }
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("Logistics refuses before its own commitment: missing, reversed, wrong-endpoint, wrong-world and foreign corridors", () => {
  const prepared = async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    return s;
  };
  const attempt = (s: LogSeeded, over: Parameters<typeof corridorCommit>[1] = {}) =>
    s.logistics.commitCorridorMovement({
      ...logPublication(1),
      commit: corridorCommit(MOVE_1, over),
    });

  it("a corridor that is not committed — never authored, or the reverse of the only authored one — is a missing prerequisite and commits nothing", async () => {
    const s = await prepared();
    expect(codeOf(await attempt(s))).toBe("PREREQUISITE_MISSING");
    // only A→B exists; the request moves A→B but names B→A, which was never authored
    await establishCorridor(s);
    const reversed = await attempt(s, {
      corridor_key: corridorKeyOf(DEST_LOCUS_ID, FIXTURE_LOCUS_ID),
    });
    expect(codeOf(reversed)).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request for the reverse direction is not served by the forward corridor, even when both exist", async () => {
    const s = await prepared();
    await establishCorridor(s, 1, corridorInput(FIXTURE_LOCUS_ID, DEST_LOCUS_ID));
    await establishCorridor(s, 2, corridorInput(DEST_LOCUS_ID, FIXTURE_LOCUS_ID));
    // the entity leaves A for B (the request), but the reverse corridor B→A is named: wrong direction
    const r = await attempt(s, { corridor_key: corridorKeyOf(DEST_LOCUS_ID, FIXTURE_LOCUS_ID) });
    expect(codeOf(r)).toBe("INPUT_INVALID");
    expect(!r.ok && r.error.message).toMatch(/in that order/);
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("a corridor of another endpoint — one that leaves the origin for a different locus — does not serve this request", async () => {
    const s = await prepared();
    await establishCorridor(s, 1, corridorInput(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID));
    const r = await attempt(s, { corridor_key: corridorKeyOf(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID) });
    expect(codeOf(r)).toBe("INPUT_INVALID");
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("a corridor of another world does not serve this request", async () => {
    const s = await prepared();
    await must(
      s.campaign.establishWorld({
        ...publication(61),
        world: fixtureWorld({ world_id: "world-2" }),
      }),
    );
    for (const [i, id] of [FIXTURE_LOCUS_ID, DEST_LOCUS_ID].entries()) {
      await must(
        s.campaign.establishLocus({
          ...publication(62 + i),
          locus: {
            ...fixtureDestinationLocus(id),
            world: { fact_key: worldProfileKey("world-2"), entity_id: "world-2" },
          },
        }),
      );
    }
    await must(
      s.campaign.establishCorridor({
        ...publication(64),
        corridor: { ...corridorInput(), world_id: "world-2" },
      }),
    );
    const foreign = worldCorridorKey("world-2", FIXTURE_LOCUS_ID, DEST_LOCUS_ID);
    expect(s.campaign.store.getFact(foreign)).toBeDefined();
    const r = await attempt(s, { corridor_key: foreign });
    expect(codeOf(r)).toBe("INPUT_INVALID");
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("a key that is not a corridor at all — a locus, the entity, the request, Logistics' own fact — is not one", async () => {
    const s = await prepared();
    await establishCorridor(s);
    for (const key of [
      fromKey,
      toKey,
      worldKey,
      entityKey,
      requestKey,
      TEMPORAL_STATE_KEY,
      "no/such/key",
    ]) {
      const r = await attempt(s, { corridor_key: key });
      expect(r.ok, key).toBe(false);
      expect(codeOf(r), key).toBe("PREREQUISITE_MISSING");
    }
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("no corridor can supply a missing request, an unaccepted entity, a delivery boundary or an already consumed movement", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    // no request committed
    expect(codeOf(await attempt(s))).toBe("PREREQUISITE_MISSING");
    // a request for an entity that was never accepted
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    expect(codeOf(await attempt(s))).toBe("PREREQUISITE_MISSING");
    await acceptLogEntity(s, REQ_1, 1);
    // the corridor supplies no boundary: it must be declared, strictly after the commitment
    const noBoundary = await s.logistics.commitCorridorMovement({
      ...logPublication(1),
      commit: { request_key: requestKey, corridor_key: corridorKey },
    });
    expect(codeOf(noBoundary)).toBe("INPUT_INVALID");
    for (const bad of [{ delivery_at: undefined }, { duration: 5 }, { feasible: true }]) {
      const r = await s.logistics.commitCorridorMovement({
        ...logPublication(1),
        commit: { ...corridorCommit(MOVE_1), ...bad },
      });
      expect(r.ok).toBe(false);
    }
    // the honest commitment, once
    await must(attempt(s));
    // already consumed: a second request for the same entity is a conflict, with or without a corridor
    await commitMovementRequest(s, MOVE_2, REQ_1, 2);
    const second = await s.logistics.commitCorridorMovement({
      ...logPublication(2),
      commit: corridorCommit(MOVE_2),
    });
    expect(codeOf(second)).toBe("VERSION_CONFLICT");
    const plain = await s.logistics.commitMovement({
      ...logPublication(3),
      commit: commitInput(MOVE_2),
    });
    expect(codeOf(plain)).toBe("VERSION_CONFLICT");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a declared boundary in another time unit, or not after the commitment, is refused: the corridor supplies and waives no time", async () => {
    const s = await prepared();
    await establishCorridor(s);
    for (const delivery_at of [
      { unit: "another-time-unit", value: 900 },
      { unit: "fixture-time-unit", value: 140 },
      { unit: "fixture-time-unit", value: 100 },
    ]) {
      const r = await attempt(s, { delivery_at });
      expect(codeOf(r), JSON.stringify(delivery_at)).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an entity that has already changed locus supports no further movement, corridor or not", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await corridorCommitDispatchRegister(s);
    await must(s.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1)));
    // complete; a new request for the same, already-moved entity is refused whatever corridor is named
    await establishCorridor(s, 2, corridorInput(DEST_LOCUS_ID, FIXTURE_LOCUS_ID));
    await commitMovementRequest(s, MOVE_2, REQ_1, 2, { destination: FIXTURE_LOCUS_ID });
    const r = await s.logistics.commitCorridorMovement({
      ...logPublication(2),
      commit: corridorCommit(MOVE_2, {
        corridor_key: corridorKeyOf(DEST_LOCUS_ID, FIXTURE_LOCUS_ID),
      }),
    });
    expect(r.ok).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an honest retry is the same receipt; a changed corridor, boundary or request is refused and never makes a second commitment", async () => {
    const s = await prepared();
    await establishCorridor(s);
    await establishCorridor(s, 2, corridorInput(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID));
    const first = await must(attempt(s));
    const replay = await must(attempt(s));
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    // the same intent but the route-less path (no corridor), another corridor, or another boundary: conflicts
    const routeless = await s.logistics.commitMovement({
      ...logPublication(1),
      commit: commitInput(MOVE_1),
    });
    expect(routeless.ok).toBe(false);
    const otherCorridor = await attempt(s, {
      corridor_key: corridorKeyOf(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID),
    });
    expect(otherCorridor.ok).toBe(false);
    const otherBoundary = await attempt(s, {
      delivery_at: { unit: "fixture-time-unit", value: 999 },
    });
    expect(otherBoundary.ok).toBe(false);
    expect(LogisticsCommitmentSchema.parse(fact(s, commitmentKey).value).corridor!.fact_key).toBe(
      corridorKey,
    );
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/")).length).toBe(
      1,
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-11 refuses an unlawful corridor-qualified commitment — raw (the pin is exact, current and read)", () => {
  async function corridorReady() {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    return s;
  }
  function derived(s: LogSeeded) {
    const rf = fact(s, requestKey);
    const ef = fact(s, entityKey);
    const cf = fact(s, corridorKey);
    const d = deriveCommitment({
      request: {
        key: rf.key,
        owner: rf.owner,
        version: rf.version,
        value: MovementServiceRequestSchema.parse(rf.value),
      },
      entity: { key: ef.key, version: ef.version, value: ef.value as never },
      transitioned: false,
      now: s.coordinator.state()!.value.canonical_time,
      delivery_at: LOG_T_DELIVERY,
      corridor: {
        key: cf.key,
        owner: cf.owner,
        version: cf.version,
        value: WorldCorridorSchema.parse(cf.value),
      },
    });
    if (!d.ok) throw new Error(d.error.message);
    return d.value;
  }
  const raw = (s: LogSeeded, n: number, over: Partial<CommitGroup> = {}) =>
    rawGroup(
      n,
      "logistics",
      "logistics_state",
      [{ key: commitmentKey, value: derived(s), expected_version: 0 }],
      {
        ...pins(s.campaign.store, [
          requestKey,
          entityKey,
          worldKey,
          toKey,
          fromKey,
          corridorKey,
          TEMPORAL_STATE_KEY,
        ]),
        ...over,
      },
    );

  it("the exact derived corridor-qualified commitment, fully pinned, is lawful as an authored publication", async () => {
    const s = await corridorReady();
    expect(codeOf(await s.campaign.store.commit(raw(s, 700)))).toBe("OK");
    expect(s.campaign.verify()).toEqual([]);
  });

  const mutations: [string, (g: CommitGroup) => CommitGroup, string, RegExp][] = [
    [
      "no read of the corridor it pins",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== corridorKey) }),
      "REFERENCE_INVALID",
      /must read the World-State corridor/,
    ],
    [
      "no dependency on the group that committed the corridor",
      (g) => ({ ...g, depends_on: g.depends_on.filter((d) => d !== "corridor-group-1") }),
      "REFERENCE_INVALID",
      /must depend on the group that committed the World-State corridor|must depend on the group/,
    ],
    [
      "no read of the entity's current origin locus",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== fromKey) }),
      "REFERENCE_INVALID",
      /must read the origin locus/,
    ],
    [
      "a stale corridor version pinned",
      (g) => withWrite(g, commitmentKey, (v) => (v.corridor.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a corridor read at a stale version",
      (g) => ({
        ...g,
        reads: g.reads.map((r) => (r.key === corridorKey ? { ...r, version: 2 } : r)),
      }),
      "STALE_READ",
      /./,
    ],
    [
      "a pin of another key than the corridor of this ordered movement",
      (g) =>
        withWrite(
          g,
          commitmentKey,
          (v) => (v.corridor.fact_key = corridorKeyOf(DEST_LOCUS_ID, FIXTURE_LOCUS_ID)),
        ),
      "PREREQUISITE_MISSING",
      /World-State corridor is not committed/,
    ],
    [
      "a corridor pinned as another owner's fact",
      (g) => withWrite(g, commitmentKey, (v) => (v.corridor.owner = "logistics")),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "a copied corridor body, a duration or an access claim inside the pin",
      (g) =>
        withWrite(g, commitmentKey, (v) => {
          v.corridor.from = "x";
          v.corridor.travel_time = 4;
        }),
      "VALUE_INVALID",
      /contract/,
    ],
  ];
  it.each(mutations)("refuses %s", async (_name, mutate, code, message) => {
    const s = await corridorReady();
    const r = await s.campaign.store.commit(mutate(raw(s, 701)));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe(code);
    expect(!r.ok && r.error.message).toMatch(message);
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a commitment whose pin the derivation does not reproduce is refused: the corridor of another endpoint cannot be pinned for this movement", async () => {
    const s = await corridorReady();
    await establishCorridor(s, 2, corridorInput(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID));
    const other = fact(s, corridorKeyOf(FIXTURE_LOCUS_ID, OTHER_LOCUS_ID));
    const g = raw(s, 702, {
      ...pins(s.campaign.store, [
        requestKey,
        entityKey,
        worldKey,
        toKey,
        fromKey,
        other.key,
        TEMPORAL_STATE_KEY,
      ]),
    });
    const r = await s.campaign.store.commit(
      withWrite(g, commitmentKey, (v) => (v.corridor.fact_key = other.key)),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(
      /exactly what the request and the accepted entity determine|in that order/,
    );
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("a corridor-less commitment is still lawful: the route-less foundation is not retroactively invalidated by corridors", async () => {
    const s = await corridorReady();
    const plain = await s.logistics.commitMovement({
      ...logPublication(1),
      commit: commitInput(MOVE_1),
    });
    expect(codeOf(plain)).toBe("OK");
    expect("corridor" in (fact(s, commitmentKey).value as object)).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load-time verification fails closed on corridor drift", () => {
  async function drifted(mutate: (facts: OwnerFact[]) => OwnerFact[]) {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    await acceptAndCommitViaCorridor(s);
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyLogisticsIntegrity(bound);
    const canon = verifyCanonicalIntegrity(bound, {
      isExtensionFact: (f) => f.key.startsWith("synthetic-"),
    });
    await s.campaign.close();
    return { logistics: out.map((v) => v.message).join(" | "), canonical: canon };
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("a healthy corridor-qualified commitment verifies before registration and in transfer", async () => {
    const r = await drifted((f) => f);
    expect(r.logistics).toBe("");
    expect(r.canonical).toEqual([]);
  });
  it("detects a commitment whose pinned corridor is gone, rewritten, re-versioned, re-owned or no longer the movement's connection", async () => {
    const pinMessage = /pins a committed World-State corridor that still holds/;
    expect((await drifted((f) => f.filter((x) => x.key !== corridorKey))).logistics).toMatch(
      pinMessage,
    );
    expect(
      (
        await drifted(
          edit(
            corridorKey,
            (v) => (v.to = { ...v.to, entity_id: OTHER_LOCUS_ID, fact_key: otherKey }),
          ),
        )
      ).logistics,
    ).toMatch(pinMessage);
    expect((await drifted(edit(corridorKey, (_v, fact) => (fact.version = 2)))).logistics).toMatch(
      pinMessage,
    );
    expect(
      (await drifted(edit(corridorKey, (_v, fact) => (fact.owner = "logistics")))).logistics,
    ).toMatch(pinMessage);
    expect((await drifted(edit(commitmentKey, (v) => (v.corridor.version = 3)))).logistics).toMatch(
      pinMessage,
    );
    expect(
      (
        await drifted(
          edit(
            commitmentKey,
            (v) => (v.corridor.fact_key = corridorKeyOf(DEST_LOCUS_ID, FIXTURE_LOCUS_ID)),
          ),
        )
      ).logistics,
    ).toMatch(pinMessage);
  });
  it("detects a corridor-qualified commitment that is not what the request, entity and corridor determine", async () => {
    const r = await drifted(
      edit(
        commitmentKey,
        (v) =>
          (v.origin = { ...v.origin, locus: { fact_key: otherKey, entity_id: OTHER_LOCUS_ID } }),
      ),
    );
    expect(r.logistics).toMatch(/exactly what the request and the entity determine/);
  });
  it("detects a corridor that is no longer a corridor of loci of its own world, and a locus of another world", async () => {
    const r = await drifted(
      edit(
        fromKey,
        (v) =>
          (v.world = {
            fact_key: worldProfileKey("world-elsewhere"),
            entity_id: "world-elsewhere",
          }),
      ),
    );
    expect(r.logistics).toMatch(/pins a committed World-State corridor that still holds/);
  });
  it("canonical verification also fails a corridor stripped of its world or an endpoint, re-keyed, or with a rewritten reference", async () => {
    const noWorld = await drifted((f) => f.filter((x) => x.key !== worldKey));
    expect(noWorld.canonical.some((v) => v.key === corridorKey)).toBe(true);
    const noEnd = await drifted((f) => f.filter((x) => x.key !== toKey));
    expect(noEnd.canonical.some((v) => v.key === corridorKey)).toBe(true);
    expect(noEnd.logistics).toMatch(/pins a committed World-State corridor that still holds/);
    const rewritten = await drifted(edit(corridorKey, (v) => (v.statement = "")));
    expect(rewritten.canonical.some((v) => v.key === corridorKey)).toBe(true);
    const otherWorld = await drifted(
      edit(
        fromKey,
        (v) =>
          (v.world = {
            fact_key: worldProfileKey("world-elsewhere"),
            entity_id: "world-elsewhere",
          }),
      ),
    );
    expect(otherWorld.canonical.some((v) => v.key === corridorKey)).toBe(true);
  });
});
