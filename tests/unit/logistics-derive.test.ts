/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Unit evidence for the pure Logistics derivations and the two Logistics owner operations (WS-010 §3.2, §3.4, §9,
// §10.1, §10.4, §11, §23): a commitment is exactly what the request and the accepted entity determine; dispatch
// states only a movement in progress; the delivery-complete result names where and never that the entity IS there;
// retirement exists only from the destination owner's committed transition for THAT delivery; the entity's
// identity, quantity and condition are neither inputs nor outputs; the resolver answers 'where' with one authority;
// an operation that cannot lawfully resolve throws instead of publishing. Register lineage: IA-02, IA-03.
import { describe, expect, it } from "vitest";
import {
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  entityTransitionId,
  logisticsDeliveryKey,
  logisticsRetirementStage,
  type EntityTransitionClose,
  type FallbackPhysicalEntity,
  type MovementServiceRequest,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  deliveryOfTransfer,
  deriveCommitment,
  deriveDelivery,
  deriveRetirement,
  deriveTransfer,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  resolveEntityLocus,
  type CommitmentPrior,
  type LogisticsFact,
  type RetirementPrior,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});
const entityKey = "world/w/entity/durable:op-1";
const requestKey = "mover/request/m-1";
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
const commitPrior = (over: Partial<CommitmentPrior> = {}): CommitmentPrior => ({
  request: { key: requestKey, owner: "mover", version: 1, value: request },
  entity: { key: entityKey, version: 1, value: entity },
  transitioned: false,
  now: t(100),
  delivery_at: t(200),
  ...over,
});
const must = <T, C extends string>(
  r: { ok: true; value: T } | { ok: false; error: { code: C; message: string } },
): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const message = (r: { ok: boolean; error?: { message: string } }) =>
  r.ok ? null : r.error!.message;

const commitment = must(deriveCommitment(commitPrior()));
const commitmentFact = (value = commitment, version = 1): LogisticsFact<typeof commitment> => ({
  key: "logistics/commitment/w/durable:op-1",
  owner: "logistics",
  version,
  value,
});
const transfer = must(
  deriveTransfer({ commitment: commitmentFact(), transitioned: false, now: t(120) }),
);
const transferFact = (value = transfer, version = 1): LogisticsFact<typeof transfer> => ({
  key: "logistics/transfer/w/durable:op-1",
  owner: "logistics",
  version,
  value,
});
const delivery = must(deliveryOfTransfer(commitment, transfer));
const deliveryFact = (value = delivery, version = 1): LogisticsFact<typeof delivery> => ({
  key: logisticsDeliveryKey("w", "durable:op-1"),
  owner: "logistics",
  version,
  value,
});
const transition: EntityTransitionClose = {
  transition_id: entityTransitionId(delivery.cause_id),
  entity: { fact_key: entityKey, entity_id: "durable:op-1", version: 1 },
  continuity: {
    relation: "SAME_ENTITY_CONTINUES",
    predecessor: "durable:op-1",
    successor: "durable:op-1",
    existence: "CONTINUES",
    form: "UNCHANGED",
    conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
    basis: "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
  },
  locus: { from: entity.locality, to: request.destination },
  cause: {
    owner: "logistics",
    fact_key: deliveryFact().key,
    version: 1,
    cause_id: delivery.cause_id,
  },
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  closed_at: t(200),
  close: {
    name: "Entity Transition Close",
    stage: {
      causal_process_id: `entity-transition:${delivery.cause_id}`,
      owner_operation: { owner: "world_state", operation: "world-state-commit-entity-transition" },
      prospective_result_id: `transition:${delivery.cause_id}`,
    },
  },
};
const transitionFact = (value = transition, version = 1): LogisticsFact<typeof transition> => ({
  key: "world/w/entity/durable:op-1/transition",
  owner: "world_state",
  version,
  value,
});
const retirePrior = (over: Partial<RetirementPrior> = {}): RetirementPrior => ({
  commitment: commitmentFact(),
  transfer: transferFact(),
  delivery: deliveryFact(),
  transition: transitionFact(),
  at: t(200),
  ...over,
});

describe("deriveCommitment: exactly what the request and the accepted entity determine (WS-010 §3.2)", () => {
  it("is one single-leg, non-agentive, uncontended movement of that entity from its accepted locus to the requested locus", () => {
    expect(LogisticsCommitmentSchema.safeParse(commitment).success).toBe(true);
    expect(commitment.origin).toEqual(entity.locality);
    expect(commitment.destination).toEqual(request.destination);
    expect(commitment.moved).toMatchObject({
      fact_key: entityKey,
      entity_id: "durable:op-1",
      version: 1,
    });
    expect(commitment.state).toEqual({ status: "COMMITTED" });
    expect(commitment.committed_at).toEqual(t(100));
    expect(commitment.delivery.at).toEqual(t(200));
    expect(deriveCommitment(commitPrior())).toEqual(deriveCommitment(commitPrior()));
  });
  it("neither reads nor writes the entity's quantity, condition or class: changing them changes nothing", () => {
    const other = {
      ...entity,
      quantity: { amount: 9, unit: "x" },
      condition: "damaged",
      entity_class: "z",
    };
    expect(
      must(deriveCommitment(commitPrior({ entity: { key: entityKey, version: 1, value: other } }))),
    ).toEqual(commitment);
  });
  it("pins the versions it read, so a different version is a different record", () => {
    expect(
      must(
        deriveCommitment(
          commitPrior({ request: { key: requestKey, owner: "mover", version: 4, value: request } }),
        ),
      ).request.version,
    ).toBe(4);
  });
  it.each<[string, Partial<CommitmentPrior>, RegExp]>([
    [
      "a request for another entity",
      {
        request: {
          key: requestKey,
          owner: "mover",
          version: 1,
          value: { ...request, subject: { fact_key: "world/w/entity/other", entity_id: "other" } },
        },
      },
      /names this accepted entity/,
    ],
    [
      "a request in Logistics' own key space",
      {
        request: {
          key: "logistics/commitment/w/x",
          owner: "logistics",
          version: 1,
          value: request,
        },
      },
      /never Logistics/,
    ],
    [
      "a request in a registered owner's key space",
      { request: { key: "production/reserve/r1", owner: "mover", version: 1, value: request } },
      /never Logistics|registered owner/,
    ],
    [
      "a request written by someone other than its named source",
      { request: { key: requestKey, owner: "someone-else", version: 1, value: request } },
      /written by the source it names/,
    ],
    [
      "a destination in another world",
      {
        request: {
          key: requestKey,
          owner: "mover",
          version: 1,
          value: { ...request, destination: ref("w2", "l2") },
        },
      },
      /within the entity's world/,
    ],
    [
      "a destination that is the entity's own locus",
      {
        request: {
          key: requestKey,
          owner: "mover",
          version: 1,
          value: { ...request, destination: ref("w", "l1") },
        },
      },
      /changes the entity's locus/,
    ],
    ["an entity that already transitioned", { transitioned: true }, /already changed locus/],
    [
      "a delivery boundary not after the commitment",
      { delivery_at: t(100) },
      /not a representable commitment/,
    ],
    [
      "a delivery boundary before the commitment",
      { delivery_at: t(90) },
      /not a representable commitment/,
    ],
    [
      "a destination whose references do not match their identities",
      {
        request: {
          key: requestKey,
          owner: "mover",
          version: 1,
          value: {
            ...request,
            destination: {
              world: ref("w", "l2").world,
              locus: { fact_key: "elsewhere", entity_id: "l2" },
            },
          },
        },
      },
      /match their key identities/,
    ],
  ])("refuses %s", (_n, over, re) => {
    expect(message(deriveCommitment(commitPrior(over)))).toMatch(re);
  });
});

describe("deriveTransfer: dispatch states a movement in progress, never a delivery (WS-010 §9, §10.1, §11)", () => {
  it("is the one Transfer Record the commitment determines, IN_TRANSFER, with a single-leg movement locus", () => {
    expect(LogisticsTransferSchema.safeParse(transfer).success).toBe(true);
    expect(transfer.state).toEqual({
      status: "IN_TRANSFER",
      movement_locus: {
        authority: "LOGISTICS_TRANSFER_RECORD",
        leg: "SINGLE_LEG",
        from: commitment.origin,
        to: commitment.destination,
      },
    });
    expect(transfer.dispatched_at).toEqual(t(120));
    expect(transfer.moved).toEqual({ fact_key: entityKey, entity_id: "durable:op-1" });
    // nothing in a dispatch says the entity is anywhere else
    expect(JSON.stringify(transfer)).not.toMatch(/delivered|arrived|destination_commit/);
  });
  it.each<[string, Parameters<typeof deriveTransfer>[0], RegExp]>([
    [
      "a released commitment",
      {
        commitment: commitmentFact({
          ...commitment,
          state: {
            status: "RELEASED",
            released_at: t(200),
            destination_commit: { fact_key: "k", version: 1 },
            by_stage: logisticsRetirementStage("m-1"),
          },
        }),
        transitioned: false,
        now: t(120),
      },
      /committed, unreleased/,
    ],
    [
      "an entity that already transitioned",
      { commitment: commitmentFact(), transitioned: true, now: t(120) },
      /already changed locus/,
    ],
    [
      "a dispatch before the commitment",
      { commitment: commitmentFact(), transitioned: false, now: t(90) },
      /at or after the commitment/,
    ],
    [
      "a dispatch at the delivery boundary",
      { commitment: commitmentFact(), transitioned: false, now: t(200) },
      /strictly before/,
    ],
    [
      "a dispatch after the delivery boundary",
      { commitment: commitmentFact(), transitioned: false, now: t(210) },
      /strictly before/,
    ],
    [
      "a commitment at another key",
      {
        commitment: { ...commitmentFact(), key: "logistics/commitment/w/other" },
        transitioned: false,
        now: t(120),
      },
      /own key/,
    ],
  ])("refuses %s", (_n, p, re) => {
    expect(message(deriveTransfer(p))).toMatch(re);
  });
});

describe("deriveDelivery: Logistics' completion names where the entity must go, never that it is there (WS-010 §10.4, §23.3-§23.4)", () => {
  it("is the one required locus change, established from the dispatch basis and effective at the declared boundary", () => {
    expect(delivery).toEqual({
      cause_id: "delivery:m-1",
      source: { owner: "logistics", cause_ref: "logistics/transfer/w/durable:op-1" },
      subject: { fact_key: entityKey, entity_id: "durable:op-1" },
      outcome: { kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED", destination: request.destination },
      timing: { established_at: t(120), occurs_at: t(200) },
    });
    // the request and the commitment determine the same result: the owner operation and admission cannot drift
    expect(must(deriveDelivery(request, t(120), t(200)))).toEqual(delivery);
  });
  it("refuses a result that does not take effect after the dispatch basis, or an entity at another world's key", () => {
    expect(message(deriveDelivery(request, t(200), t(200)))).toMatch(/not a representable/);
    expect(
      message(
        deriveDelivery(
          {
            ...request,
            subject: { fact_key: "world/w2/entity/durable:op-1", entity_id: "durable:op-1" },
          },
          t(120),
          t(200),
        ),
      ),
    ).toMatch(/own key, in the destination's world/);
  });
});

describe("deriveRetirement: only the destination owner's commit of THIS delivery retires the transfer (WS-010 §10.4(3), §23.5)", () => {
  it("closes the transfer and releases the commitment, atomically, pinning the delivery and the destination commit", () => {
    const r = must(deriveRetirement(retirePrior()));
    expect(r.transfer.state).toEqual({
      status: "RETIRED",
      movement_locus: "CLOSED",
      delivery: { fact_key: deliveryFact().key, version: 1 },
      destination_commit: { fact_key: transitionFact().key, version: 1 },
      retired_at: t(200),
      by_stage: logisticsRetirementStage("m-1"),
    });
    expect(r.commitment.state).toMatchObject({
      status: "RELEASED",
      released_at: t(200),
      destination_commit: { version: 1 },
    });
    // the terms and the entity reference are untouched: only the lifecycle moved
    expect({ ...r.commitment, state: null }).toEqual({ ...commitment, state: null });
    expect(r.transfer.moved).toEqual(transfer.moved);
    expect(JSON.stringify(r)).not.toMatch(/quantity|entity_class/);
  });
  const edit = <T extends object>(v: T, f: (x: any) => void): T => {
    const c = structuredClone(v) as any;
    f(c);
    return c;
  };
  it.each<[string, () => RetirementPrior, RegExp]>([
    [
      "a transition for another delivery",
      () =>
        retirePrior({
          transition: transitionFact(
            edit(transition, (x) => (x.cause.cause_id = "delivery:other")),
          ),
        }),
      /not committed this delivery/,
    ],
    [
      "a transition caused by a foreign owner",
      () =>
        retirePrior({
          transition: transitionFact(edit(transition, (x) => (x.cause.owner = "SYNTHETIC-CAUSE"))),
        }),
      /not committed this delivery/,
    ],
    [
      "a transition to another destination",
      () =>
        retirePrior({
          transition: transitionFact(edit(transition, (x) => (x.locus.to = ref("w", "l9")))),
        }),
      /not committed this delivery/,
    ],
    [
      "a transition from another origin",
      () =>
        retirePrior({
          transition: transitionFact(edit(transition, (x) => (x.locus.from = ref("w", "l9")))),
        }),
      /not committed this delivery/,
    ],
    [
      "a transition of another entity",
      () =>
        retirePrior({
          transition: transitionFact(edit(transition, (x) => (x.entity.entity_id = "other"))),
        }),
      /not committed this delivery/,
    ],
    [
      "a transition pinning another delivery version",
      () =>
        retirePrior({ transition: transitionFact(edit(transition, (x) => (x.cause.version = 2))) }),
      /not committed this delivery/,
    ],
    [
      "a transition at another entity's slot",
      () =>
        retirePrior({
          transition: { ...transitionFact(), key: "world/w/entity/other/transition" },
        }),
      /not committed this delivery/,
    ],
    [
      "a transition not written by World-State",
      () => retirePrior({ transition: { ...transitionFact(), owner: "logistics" } }),
      /not committed this delivery/,
    ],
    [
      "a transition that is not at its establishment",
      () => retirePrior({ transition: transitionFact(transition, 2) }),
      /not committed this delivery/,
    ],
    [
      "a delivery that is not what the commitment and transfer determine",
      () =>
        retirePrior({
          delivery: deliveryFact(edit(delivery, (x) => (x.timing.established_at = t(110)))),
        }),
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a delivery that advanced past its establishment",
      () => retirePrior({ delivery: deliveryFact(delivery, 2) }),
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a delivery not written by Logistics",
      () => retirePrior({ delivery: { ...deliveryFact(), owner: "SYNTHETIC" } }),
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a retirement at another instant",
      () => retirePrior({ at: t(199) }),
      /declared boundary instant/,
    ],
    [
      "a commitment already released",
      () =>
        retirePrior({
          commitment: commitmentFact({
            ...commitment,
            state: {
              status: "RELEASED",
              released_at: t(200),
              destination_commit: { fact_key: "k", version: 1 },
              by_stage: logisticsRetirementStage("m-1"),
            },
          }),
        }),
      /still in transfer/,
    ],
    [
      "a transfer already retired",
      () =>
        retirePrior({
          transfer: transferFact(edit(transfer, (x) => (x.state = { status: "RETIRED" }))),
        }),
      /still in transfer/,
    ],
    [
      "a transfer backed by another commitment version",
      () => retirePrior({ commitment: commitmentFact(commitment, 2) }),
      /the one this commitment backs/,
    ],
    [
      "a commitment and a transfer at another entity's keys",
      () => retirePrior({ transfer: { ...transferFact(), key: "logistics/transfer/w/other" } }),
      /at their own keys/,
    ],
  ])("refuses %s", (_n, p, re) => {
    expect(message(deriveRetirement(p()))).toMatch(re);
  });
});

describe("the Logistics owner operations: pure, deterministic, fail closed", () => {
  const fact = (key: string, owner: string, value: unknown, version = 1): OwnerFact => ({
    key,
    owner,
    facet: "f",
    value: value as never,
    unit: null,
    basis: "b",
    secrecy: "s",
    version,
    provenance: { group_id: `g-${key}`, intent_id: `i-${key}`, cause: "c", rule: {} as never },
  });
  const readOf = (f: OwnerFact) =>
    ({
      fact: f,
      read: {
        mode: "AS-OF-NOW",
        source: { owner: f.owner, fact_key: f.key },
        invalidators: [],
        source_basis: { version: f.version, committed_by: "g" },
      },
    }) as never;
  const span = { from: t(120), to: t(200), elapsed: 80 };

  it("the delivery operation writes exactly the delivery the request determines, inherits the request's basis and secrecy, at the declared boundary only", () => {
    const req = fact(requestKey, "mover", request);
    const key = logisticsDeliveryKey("w", "durable:op-1");
    const writes = logisticsDeliveryProvider.compute({
      stage: {} as never,
      produces: [key],
      span,
      reads: [readOf(req)],
      prior: new Map(),
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ key, value: delivery, basis: "b", secrecy: "s" });
    expect(
      logisticsDeliveryProvider.compute({
        stage: {} as never,
        produces: [key],
        span,
        reads: [readOf(req)],
        prior: new Map(),
      }),
    ).toEqual(writes);
  });
  it.each<[string, () => Parameters<typeof logisticsDeliveryProvider.compute>[0]]>([
    [
      "no request read",
      () => ({
        stage: {} as never,
        produces: [logisticsDeliveryKey("w", "durable:op-1")],
        span,
        reads: [],
        prior: new Map(),
      }),
    ],
    [
      "a malformed request",
      () => ({
        stage: {} as never,
        produces: [logisticsDeliveryKey("w", "durable:op-1")],
        span,
        reads: [readOf(fact(requestKey, "mover", { nope: 1 }))],
        prior: new Map(),
      }),
    ],
    [
      "another entity's slot",
      () => ({
        stage: {} as never,
        produces: [logisticsDeliveryKey("w", "someone")],
        span,
        reads: [readOf(fact(requestKey, "mover", request))],
        prior: new Map(),
      }),
    ],
    [
      "a delivery already established",
      () => ({
        stage: {} as never,
        produces: [logisticsDeliveryKey("w", "durable:op-1")],
        span,
        reads: [readOf(fact(requestKey, "mover", request))],
        prior: new Map([[logisticsDeliveryKey("w", "durable:op-1"), fact("x", "logistics", {})]]),
      }),
    ],
    [
      "a result that does not take effect after its basis",
      () => ({
        stage: {} as never,
        produces: [logisticsDeliveryKey("w", "durable:op-1")],
        span: { from: t(200), to: t(200), elapsed: 0 },
        reads: [readOf(fact(requestKey, "mover", request))],
        prior: new Map(),
      }),
    ],
  ])("the delivery operation throws instead of publishing for %s", (_n, input) => {
    expect(() => logisticsDeliveryProvider.compute(input())).toThrow(StageUnresolvedError);
  });

  const commitKey = commitmentFact().key;
  const transferKey = transferFact().key;
  const prior = () =>
    new Map([
      [commitKey, fact(commitKey, "logistics", commitment)],
      [transferKey, fact(transferKey, "logistics", transfer)],
    ]);
  const reads = () => [
    readOf(fact(deliveryFact().key, "logistics", delivery)),
    readOf(fact(transitionFact().key, "world_state", transition)),
  ];
  it("the retirement operation writes exactly the commitment's release and the transfer's retirement the committed chain determines", () => {
    const writes = logisticsRetirementProvider.compute({
      stage: {} as never,
      produces: [commitKey, transferKey],
      span,
      reads: reads(),
      prior: prior(),
    });
    expect(writes.map((w) => w.key).sort()).toEqual([commitKey, transferKey].sort());
    const r = must(deriveRetirement(retirePrior()));
    expect(writes.find((w) => w.key === commitKey)!.value).toEqual(r.commitment);
    expect(writes.find((w) => w.key === transferKey)!.value).toEqual(r.transfer);
  });
  it.each<[string, () => Parameters<typeof logisticsRetirementProvider.compute>[0]]>([
    [
      "no destination commit",
      () => ({
        stage: {} as never,
        produces: [commitKey, transferKey],
        span,
        reads: [reads()[0]!],
        prior: prior(),
      }),
    ],
    [
      "no delivery result",
      () => ({
        stage: {} as never,
        produces: [commitKey, transferKey],
        span,
        reads: [reads()[1]!],
        prior: prior(),
      }),
    ],
    [
      "no prior commitment or transfer",
      () => ({
        stage: {} as never,
        produces: [commitKey, transferKey],
        span,
        reads: reads(),
        prior: new Map(),
      }),
    ],
    [
      "another slot",
      () => ({
        stage: {} as never,
        produces: [commitKey, "logistics/transfer/w/other"],
        span,
        reads: reads(),
        prior: prior(),
      }),
    ],
    [
      "a requested horizon instead of the declared boundary",
      () => ({
        stage: {} as never,
        produces: [commitKey, transferKey],
        span: { from: t(120), to: t(300), elapsed: 180 },
        reads: reads(),
        prior: prior(),
      }),
    ],
  ])("the retirement operation throws instead of publishing for %s", (_n, input) => {
    expect(() => logisticsRetirementProvider.compute(input())).toThrow(StageUnresolvedError);
  });
});

describe("resolveEntityLocus: one authority at every stage, by identity (WS-010 §10.1, §27)", () => {
  const fact = (key: string, owner: string, value: unknown): OwnerFact =>
    ({
      key,
      owner,
      facet: "f",
      value,
      unit: null,
      basis: "b",
      secrecy: "s",
      version: 1,
      provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} },
    }) as never;
  const store = (facts: OwnerFact[]) => ({
    getFact: (k: string) => facts.find((f) => f.key === k),
  });
  const E = fact(entityKey, "world_state", entity);
  const T = fact("logistics/transfer/w/durable:op-1", "logistics", transfer);
  const R = fact(
    "logistics/transfer/w/durable:op-1",
    "logistics",
    must(deriveRetirement(retirePrior())).transfer,
  );
  const X = fact("world/w/entity/durable:op-1/transition", "world_state", transition);

  it("is undefined for no entity, World-State's stationary locus without a transfer, and Logistics' movement locus in transfer", () => {
    expect(resolveEntityLocus(store([]), "w", "durable:op-1")).toBeUndefined();
    expect(resolveEntityLocus(store([E]), "w", "durable:op-1")).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
      movement: null,
      stationary: entity.locality,
    });
    expect(resolveEntityLocus(store([E, T]), "w", "durable:op-1")).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
      movement: { from: entity.locality, to: request.destination },
    });
  });
  it("the destination commit supersedes an unretired transfer, which is then only awaiting its retirement", () => {
    expect(resolveEntityLocus(store([E, T, X]), "w", "durable:op-1")).toMatchObject({
      phase: "DESTINATION_COMMITTED_RETIREMENT_PENDING",
      authority: "WORLD_STATE",
      movement: null,
      stationary: request.destination,
    });
    expect(resolveEntityLocus(store([E, R, X]), "w", "durable:op-1")).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    // a transition with no Logistics at all (any other cause) is the same single authority
    expect(resolveEntityLocus(store([E, X]), "w", "durable:op-1")).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    // history is intact in every phase
    for (const f of [[E], [E, T], [E, T, X], [E, R, X]])
      expect(resolveEntityLocus(store(f), "w", "durable:op-1")!.origin).toEqual(entity.locality);
  });
});
