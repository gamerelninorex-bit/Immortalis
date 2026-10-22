/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Unit evidence for the pure source-qualified derivation (WS-010 §3.2, §4.1 with the World-State corridor read): a corridor-qualified
// commitment is exactly the foundation commitment plus the pin of the corridor read; the corridor is accepted only as World-State's own
// fact connecting THIS ordered origin to THIS destination in THIS world; it never supplies the delivery boundary; and the route-less
// foundation derivation is byte-identical with or without a corridor in the world.
import { describe, expect, it } from "vitest";
import {
  pcMovementRequestKey,
  worldCorridorKey,
  type FallbackPhysicalEntity,
  type MovementServiceRequest,
  type PcPhysicalLocusCustody,
  type WorldCorridor,
} from "@immortalis/contracts";
import {
  corridorReadViolation,
  deriveCommitment,
  type CommitmentPrior,
  type LogisticsFact,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});
const entityKey = "world/w/entity/durable:op-1";
const entity: FallbackPhysicalEntity = {
  entity_id: "durable:op-1",
  entity_class: "d",
  quantity: { amount: 1, unit: "d" },
  condition: "c",
  locality: ref("w", "l1"),
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  accepted_from: {
    owner: "production",
    fact_key: "production/completion/op-1",
    version: 2,
    operation_id: "op-1",
  },
};
const request: MovementServiceRequest = {
  request_id: "m-1",
  source: { owner: "mover", cause_ref: "need-1" },
  subject: { fact_key: entityKey, entity_id: "durable:op-1" },
  destination: ref("w", "l2"),
  priority_authority_ref: null,
};
const corridorValue = (from = "l1", to = "l2", world = "w"): WorldCorridor => ({
  world: ref(world, from).world,
  from: ref(world, from).locus,
  to: ref(world, to).locus,
  statement: "a path",
});
const corridorFact = (
  over: Partial<LogisticsFact<WorldCorridor>> = {},
): LogisticsFact<WorldCorridor> => ({
  key: worldCorridorKey("w", "l1", "l2"),
  owner: "world_state",
  version: 1,
  value: corridorValue(),
  ...over,
});
const prior = (over: Partial<CommitmentPrior> = {}): CommitmentPrior => ({
  request: { key: "mover/request/m-1", owner: "mover", version: 1, value: request },
  entity: { key: entityKey, version: 1, value: entity },
  transitioned: false,
  now: t(100),
  delivery_at: t(200),
  ...over,
});
const message = (r: { ok: boolean; error?: { message: string } }) =>
  r.ok ? null : r.error!.message;

describe("deriveCommitment with a corridor", () => {
  it("adds exactly the pin of the corridor read and changes nothing else about the foundation commitment", () => {
    const plain = deriveCommitment(prior());
    const withCorridor = deriveCommitment(prior({ corridor: corridorFact() }));
    expect(plain.ok && withCorridor.ok).toBe(true);
    if (!plain.ok || !withCorridor.ok) return;
    expect("corridor" in plain.value).toBe(false);
    expect(withCorridor.value.corridor).toEqual({
      owner: "world_state",
      fact_key: worldCorridorKey("w", "l1", "l2"),
      version: 1,
    });
    const { corridor, ...rest } = withCorridor.value;
    expect(corridor).toBeDefined();
    expect(rest).toEqual(plain.value);
  });

  it("pins the version read, not a default", () => {
    const r = deriveCommitment(prior({ corridor: corridorFact({ version: 3 }) }));
    expect(r.ok && r.value.corridor?.version).toBe(3);
  });

  it("never takes the delivery boundary from the corridor: it is the declared value, and it must still follow the commitment", () => {
    const r = deriveCommitment(prior({ corridor: corridorFact(), delivery_at: t(250) }));
    expect(r.ok && r.value.delivery.at).toEqual(t(250));
    const early = deriveCommitment(prior({ corridor: corridorFact(), delivery_at: t(100) }));
    expect(early.ok).toBe(false);
  });

  const refusals: [string, Partial<LogisticsFact<WorldCorridor>>, RegExp][] = [
    ["a corridor that is not World-State's own fact", { owner: "logistics" }, /World-State's own/],
    [
      "the reverse corridor (the key the ordered endpoints do not derive)",
      { key: worldCorridorKey("w", "l2", "l1"), value: corridorValue("l2", "l1") },
      /in that order/,
    ],
    [
      "a corridor from another origin",
      { key: worldCorridorKey("w", "l9", "l2"), value: corridorValue("l9", "l2") },
      /in that order/,
    ],
    [
      "a corridor to another destination",
      { key: worldCorridorKey("w", "l1", "l9"), value: corridorValue("l1", "l9") },
      /in that order/,
    ],
    [
      "a corridor of another world",
      { key: worldCorridorKey("w2", "l1", "l2"), value: corridorValue("l1", "l2", "w2") },
      /in that order/,
    ],
    [
      "a corridor at the right key whose body names other endpoints",
      { value: corridorValue("l1", "l9") },
      /endpoints are the entity's origin/,
    ],
    [
      "a corridor at the right key whose body is of another world",
      { value: corridorValue("l1", "l2", "w2") },
      /endpoints are the entity's origin/,
    ],
  ];
  it.each(refusals)("refuses %s", (_name, over, pattern) => {
    expect(message(deriveCommitment(prior({ corridor: corridorFact(over) })))).toMatch(pattern);
  });

  it("does not waive any foundation refusal: a transitioned entity, the same locus or another world is refused with a corridor too", () => {
    expect(
      message(deriveCommitment(prior({ corridor: corridorFact(), transitioned: true }))),
    ).toMatch(/already changed locus/);
    const sameLocus = { ...request, destination: ref("w", "l1") };
    expect(
      deriveCommitment(
        prior({
          corridor: corridorFact({
            key: worldCorridorKey("w", "l1", "l1"),
            value: corridorValue("l1", "l1"),
          }),
          request: { key: "mover/request/m-1", owner: "mover", version: 1, value: sameLocus },
        }),
      ).ok,
    ).toBe(false);
    const otherRequest = {
      ...request,
      source: { owner: "mover", cause_ref: "x" },
      request_id: "m-2",
    };
    expect(
      deriveCommitment(
        prior({
          corridor: corridorFact(),
          request: {
            key: "mover/request/m-2",
            owner: "someone-else",
            version: 1,
            value: otherRequest,
          },
        }),
      ).ok,
    ).toBe(false);
  });

  describe("the active PC, moved only by its OWN PC-owned request", () => {
    const custody = (locus = "l1"): PcPhysicalLocusCustody =>
      ({
        pc_id: "pc-1",
        stationary_locus: ref("w", locus),
        basis: { established_from: "EXISTING_ACTOR_HANDOVER" },
      }) as any;
    const pcKey = "world-state/pc/pc-1/locus-custody";
    const pcRequest = (to = "l2"): MovementServiceRequest => ({
      request_id: "pc-m",
      source: { owner: "pc_existence", cause_ref: "intent" },
      subject: { fact_key: pcKey, entity_id: "pc-1" },
      destination: ref("w", to),
      priority_authority_ref: null,
    });
    const pcPrior = (over: Partial<CommitmentPrior> = {}, locus = "l1", to = "l2") =>
      prior({
        request: {
          key: pcMovementRequestKey("pc-1"),
          owner: "pc_existence",
          version: 1,
          value: pcRequest(to),
        },
        entity: { key: pcKey, version: 1, value: custody(locus) },
        ...over,
      });

    it("is source-qualified exactly as a fallback entity is: the pin of the corridor read, and nothing else about the PC's commitment changes", () => {
      const plain = deriveCommitment(pcPrior());
      const withCorridor = deriveCommitment(pcPrior({ corridor: corridorFact() }));
      expect(plain.ok && withCorridor.ok).toBe(true);
      if (!plain.ok || !withCorridor.ok) return;
      expect("corridor" in plain.value).toBe(false);
      expect(withCorridor.value.corridor).toEqual({
        owner: "world_state",
        fact_key: worldCorridorKey("w", "l1", "l2"),
        version: 1,
      });
      const { corridor, ...rest } = withCorridor.value;
      expect(corridor).toBeDefined();
      expect(rest).toEqual(plain.value);
      // the corridor still supplies no boundary
      expect(withCorridor.value.delivery.at).toEqual(t(200));
    });

    it("still requires the corridor to be the ordered connection of THE PC's custody origin to its requested destination", () => {
      // reverse, another origin, another destination, another world, a foreign owner
      for (const [name, corridor] of [
        [
          "reverse",
          corridorFact({
            key: worldCorridorKey("w", "l2", "l1"),
            value: corridorValue("l2", "l1"),
          }),
        ],
        [
          "another origin",
          corridorFact({
            key: worldCorridorKey("w", "l3", "l2"),
            value: corridorValue("l3", "l2"),
          }),
        ],
        [
          "another destination",
          corridorFact({
            key: worldCorridorKey("w", "l1", "l3"),
            value: corridorValue("l1", "l3"),
          }),
        ],
        [
          "another world",
          corridorFact({
            key: worldCorridorKey("x", "l1", "l2"),
            value: corridorValue("l1", "l2", "x"),
          }),
        ],
        ["a foreign owner", corridorFact({ owner: "logistics" })],
      ] as const)
        expect(message(deriveCommitment(pcPrior({ corridor }))), name).not.toBeNull();
      // the origin is the custody's stationary locus, not whatever the corridor says
      expect(message(deriveCommitment(pcPrior({ corridor: corridorFact() }, "l5")))).not.toBeNull();
    });

    it("never moves the PC by another's request, never a fallback entity by the PC's request, and never twice", () => {
      const foreign = pcPrior({
        corridor: corridorFact(),
        request: {
          key: "mover/request/pc-m",
          owner: "mover",
          version: 1,
          value: { ...pcRequest(), source: { owner: "mover", cause_ref: "x" } },
        },
      });
      expect(message(deriveCommitment(foreign))).toMatch(/own PC-owned Movement Service Request/);
      expect(
        message(
          deriveCommitment(
            prior({
              corridor: corridorFact(),
              request: {
                key: pcMovementRequestKey("pc-1"),
                owner: "pc_existence",
                version: 1,
                value: { ...request, source: { owner: "pc_existence", cause_ref: "x" } },
              },
            }),
          ),
        ),
      ).not.toBeNull();
      expect(
        message(deriveCommitment(pcPrior({ corridor: corridorFact(), transitioned: true }))),
      ).toMatch(/already changed locus/);
    });
  });
});

describe("corridorReadViolation", () => {
  it("accepts exactly the corridor of the ordered origin and destination", () => {
    expect(corridorReadViolation(corridorFact(), ref("w", "l1"), ref("w", "l2"))).toBeNull();
    expect(corridorReadViolation(corridorFact(), ref("w", "l2"), ref("w", "l1"))).not.toBeNull();
  });
});
