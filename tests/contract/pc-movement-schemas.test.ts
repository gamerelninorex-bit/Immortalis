/* eslint-disable @typescript-eslint/no-explicit-any -- tests present forged values on purpose */
// Active-PC Voluntary Movement — the strict contracts. One commitment-of-record (willingness only), one PC-owned request (exactly the
// existing WS-010 §3.1 envelope), one slot per PC identity. The structural half of the exclusions: no route, path, duration, speed,
// cost, hazard, carrier, leg, second journey, cancellation or arrival can be stated (IA-02).
import { describe, expect, it } from "vitest";
import {
  MovementServiceRequestSchema,
  PC_MOVEMENT_INTENT_KIND,
  PLAYER_CHOICE_AUTHORITY,
  PcMovementCommitInputSchema,
  PcMovementCommitmentSchema,
  PcMovementRequestTargetSchema,
  pcMovementCommitmentId,
  pcMovementCommitmentKey,
  pcMovementRequestId,
  pcMovementRequestKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, resolveKey } from "@immortalis/engine";

const pcId = "pc-1";
const commitment = () => ({
  commitment_id: pcMovementCommitmentId(pcId),
  pc_id: pcId,
  authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  intent: {
    kind: PC_MOVEMENT_INTENT_KIND,
    destination: {
      world: { fact_key: worldProfileKey("w1"), entity_id: "w1" },
      locus: { fact_key: worldLocusKey("w1", "l2"), entity_id: "l2" },
    },
  },
  basis: { pinned_versions: { pc: 1, binding: 1, custody: 1, world: 1, locus: 1 } },
  committer: { owner: "pc_existence", facet: "pc_voluntary_commitment" },
});

describe("the commitment-of-record is willingness only", () => {
  it("accepts exactly the one strict shape", () => {
    expect(PcMovementCommitmentSchema.safeParse(commitment()).success).toBe(true);
  });

  it("rejects every extra field at every level: no route, path, duration, speed, cost, hazard, carrier, leg, arrival, result or second journey", () => {
    const base = commitment();
    const extras: Record<string, (c: any) => void> = {
      route: (c) => (c.route = ["l1", "l2"]),
      path: (c) => (c.intent.path = []),
      duration: (c) => (c.intent.duration = 10),
      speed: (c) => (c.intent.speed = 3),
      cost: (c) => (c.intent.cost = 1),
      hazard: (c) => (c.intent.hazard = "none"),
      carrier: (c) => (c.intent.carrier = "cart"),
      leg: (c) => (c.intent.leg = 2),
      arrival: (c) => (c.arrival = { at: 1 }),
      success: (c) => (c.result = "SUCCESS"),
      destination_extra: (c) => (c.intent.destination.eta = 1),
      pinned_extra: (c) => (c.basis.pinned_versions.coupling = 1),
      second_journey: (c) => (c.intent.then = c.intent.destination),
      current_locus: (c) => (c.current_locus = c.intent.destination.locus),
    };
    for (const [name, edit] of Object.entries(extras)) {
      const c = structuredClone(base) as any;
      edit(c);
      expect(PcMovementCommitmentSchema.safeParse(c).success, name).toBe(false);
    }
  });

  it("is fixed by role.player + permission.player_choice.commit only, never a persona or any other authority", () => {
    for (const authored_under of [
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.player", permission: "permission.canon.write" },
      { role: "role.persona", permission: "permission.player_choice.commit" },
      { role: "role.player" },
      undefined,
    ]) {
      const c = { ...commitment(), authored_under } as any;
      expect(PcMovementCommitmentSchema.safeParse(c).success, JSON.stringify(authored_under)).toBe(
        false,
      );
    }
  });

  it("states only a voluntary relocation, committed by the PC-state owner's own facet", () => {
    expect(
      PcMovementCommitmentSchema.safeParse({
        ...commitment(),
        intent: { ...commitment().intent, kind: "FORCED_RELOCATION" },
      }).success,
    ).toBe(false);
    expect(
      PcMovementCommitmentSchema.safeParse({
        ...commitment(),
        committer: { owner: "logistics", facet: "logistics_state" },
      }).success,
    ).toBe(false);
  });

  it("the structured input names identities and the authored authority only", () => {
    const input = {
      pc_id: pcId,
      destination: { world_id: "w1", locus_id: "l2" },
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
    };
    expect(PcMovementCommitInputSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      "route",
      "duration",
      "arrival",
      "pinned_versions",
      "request",
      "delivery_at",
    ])
      expect(PcMovementCommitInputSchema.safeParse({ ...input, [extra]: 1 }).success, extra).toBe(
        false,
      );
    expect(
      PcMovementCommitInputSchema.safeParse({ ...input, authored_under: undefined }).success,
    ).toBe(false);
    expect(
      PcMovementRequestTargetSchema.safeParse({ pc_id: pcId, destination: "l2" }).success,
    ).toBe(false);
  });
});

describe("the PC-owned request is exactly the existing Movement Service Request envelope", () => {
  it("the registered value schema of the request kind IS the existing contract, with no priority/authority reference", () => {
    const kind = ALL_FACT_KINDS.find((k) => k.id === "pc_movement_request")!;
    expect(kind.valueSchema).toBe(MovementServiceRequestSchema);
    const request = {
      request_id: pcMovementRequestId(pcId),
      source: { owner: "pc_existence", cause_ref: pcMovementCommitmentKey(pcId) },
      subject: { fact_key: "world-state/pc/pc-1/locus-custody", entity_id: pcId },
      destination: commitment().intent.destination,
      priority_authority_ref: null,
    };
    expect(MovementServiceRequestSchema.safeParse(request).success).toBe(true);
    expect(
      MovementServiceRequestSchema.safeParse({ ...request, priority_authority_ref: "x" }).success,
    ).toBe(false);
    expect(MovementServiceRequestSchema.safeParse({ ...request, route: [] }).success).toBe(false);
  });
});

describe("one slot per PC identity, create-only, in key spaces disjoint from every other owner's", () => {
  it("each key resolves to exactly one kind, owned by the PC-state owner's own facet, SEALED", () => {
    for (const [key, id] of [
      [pcMovementCommitmentKey(pcId), "pc_movement_commitment"],
      [pcMovementRequestKey(pcId), "pc_movement_request"],
    ] as const) {
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
      const kind = resolveKey(key)!.kind;
      expect([kind.owner, kind.facet, kind.lifecycle]).toEqual([
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
      ]);
      expect(resolveKey(key)!.ids).toEqual([pcId]);
    }
  });

  it("no existing PC, capability, custody, Logistics, transition or request key can be mistaken for a movement key", () => {
    for (const other of [
      "pc/pc-1/existence-contract",
      "pc/pc-1/capability/c1",
      "pc/pc-1/capability-basis/c1",
      "pc/pc-1/movement",
      "pc/pc-1/movement/other",
      "world-state/pc/pc-1/locus-custody",
      "logistics/commitment/w1/pc-1",
      "world/w1/entity/pc-1/transition",
    ])
      expect(
        ALL_FACT_KINDS.filter(
          (k) =>
            ["pc_movement_commitment", "pc_movement_request"].includes(k.id) &&
            k.keyPattern.test(other),
        ),
        other,
      ).toEqual([]);
  });

  it("identities are derived from the PC identity alone (no clock, counter or random value)", () => {
    expect(pcMovementCommitmentId(pcId)).toBe(pcMovementCommitmentId(pcId));
    expect(pcMovementRequestId(pcId)).not.toBe(pcMovementRequestId("pc-2"));
  });
});
