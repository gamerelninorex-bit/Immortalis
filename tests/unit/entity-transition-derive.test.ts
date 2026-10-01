// Unit evidence for the pure entity-transition derivation and the World-State owner operation (F-016 v0.4 §2 R-1,
// §5 R-4; WG "Ownership Guards"): a transition is exactly what the committed causing result determines for the
// accepted entity, once; the entity's quantity and condition are neither inputs nor outputs; the one current-locus
// resolver says origin until the transition exists and destination after; an operation that cannot lawfully
// resolve throws instead of publishing. Register lineage: IA-02, IA-03.
import { describe, expect, it } from "vitest";
import {
  EntityTransitionCloseSchema,
  entityTransitionStage,
  type EntityTransitionCause,
  type FallbackPhysicalEntity,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  currentLocusOf,
  deriveEntityTransition,
  worldEntityTransitionProvider,
  type EntityTransitionPrior,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});
const entityKey = "world/w/entity/durable:op-1";
const causeKey = "some-owner/cause/c-1";

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
const cause: EntityTransitionCause = {
  cause_id: "c-1",
  source: { owner: "some-owner", cause_ref: "event-1" },
  subject: { fact_key: entityKey, entity_id: "durable:op-1" },
  outcome: { kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED", destination: ref("w", "l2") },
  timing: { established_at: t(100), occurs_at: t(200) },
};
const prior = (over: Partial<EntityTransitionPrior> = {}): EntityTransitionPrior => ({
  cause: { key: causeKey, owner: "some-owner", version: 1, value: cause },
  entity: { key: entityKey, version: 1, value: entity },
  at: t(200),
  ...over,
});
const must = (p: EntityTransitionPrior) => {
  const r = deriveEntityTransition(p);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const refusal = (p: EntityTransitionPrior) => {
  const r = deriveEntityTransition(p);
  return r.ok ? null : r.error.message;
};

describe("deriveEntityTransition: exactly what the cause determines for the accepted entity", () => {
  it("is the same entity, from its accepted locus to the declared destination, at the declared instant", () => {
    const v = must(prior());
    expect(EntityTransitionCloseSchema.safeParse(v).success).toBe(true);
    expect(v.entity).toEqual({ fact_key: entityKey, entity_id: "durable:op-1", version: 1 });
    expect(v.continuity).toMatchObject({
      relation: "SAME_ENTITY_CONTINUES",
      predecessor: "durable:op-1",
      successor: "durable:op-1",
    });
    expect(v.locus).toEqual({ from: entity.locality, to: cause.outcome.destination });
    expect(v.cause).toEqual({
      owner: "some-owner",
      fact_key: causeKey,
      version: 1,
      cause_id: "c-1",
    });
    expect(v.closed_at).toEqual(t(200));
    expect(v.close).toEqual({
      name: "Entity Transition Close",
      stage: entityTransitionStage("c-1"),
    });
  });
  it("is deterministic and a pure function of its inputs", () => {
    expect(must(prior())).toEqual(must(prior()));
  });
  it("neither reads nor writes the entity's quantity, condition or class: changing them changes nothing", () => {
    const other = {
      ...entity,
      quantity: { amount: 9, unit: "x" },
      condition: "damaged",
      entity_class: "z",
    };
    expect(must(prior({ entity: { key: entityKey, version: 1, value: other } }))).toEqual(
      must(prior()),
    );
  });
  it("pins the versions it read (provenance), so a different version is a different record", () => {
    expect(
      must(prior({ entity: { key: entityKey, version: 3, value: entity } })).entity.version,
    ).toBe(3);
  });
});

describe("deriveEntityTransition refuses what the cause does not determine", () => {
  it("a cause that names another entity, or the entity at another key", () => {
    expect(
      refusal(
        prior({
          cause: {
            ...prior().cause,
            value: { ...cause, subject: { fact_key: entityKey, entity_id: "durable:other" } },
          },
        }),
      ),
    ).toMatch(/names this accepted entity/);
    expect(
      refusal(
        prior({
          cause: {
            ...prior().cause,
            value: {
              ...cause,
              subject: { fact_key: "world/w/entity/durable:x", entity_id: "durable:op-1" },
            },
          },
        }),
      ),
    ).toMatch(/names this accepted entity/);
    expect(
      refusal(prior({ entity: { key: "world/w/entity/durable:x", version: 1, value: entity } })),
    ).toMatch(/names this accepted entity/);
  });
  it("a destination that is the entity's own locus, or in another world", () => {
    const to = (destination: unknown) =>
      prior({
        cause: {
          ...prior().cause,
          value: { ...cause, outcome: { ...cause.outcome, destination } as never },
        },
      });
    expect(refusal(to(ref("w", "l1")))).toMatch(/changes the entity's locus/);
    expect(refusal(to(ref("v", "l2")))).toMatch(/within the entity's world/);
    expect(
      refusal(
        to({
          world: ref("w", "l2").world,
          locus: { fact_key: "world/w/locus/other", entity_id: "l2" },
        }),
      ),
    ).toMatch(/key identities/);
  });
  it("an instant other than the cause's declared instant", () => {
    expect(refusal(prior({ at: t(199) }))).toMatch(/declared instant/);
    expect(refusal(prior({ at: t(201) }))).toMatch(/declared instant/);
    expect(refusal(prior({ at: { unit: "other", value: 200 } }))).toMatch(/declared instant/);
  });
  it("a cause that is not its source's own fact: a registered key space, World-State's, or another owner's", () => {
    expect(refusal(prior({ cause: { ...prior().cause, key: "world/w/profile" } }))).toMatch(
      /source's own fact/,
    );
    expect(refusal(prior({ cause: { ...prior().cause, owner: "world_state" } }))).toMatch(
      /source's own fact/,
    );
    expect(refusal(prior({ cause: { ...prior().cause, owner: "another-owner" } }))).toMatch(
      /written by the source it names/,
    );
  });
  it("a cause read after its establishment (its owner's later lifecycle is its own)", () => {
    expect(refusal(prior({ cause: { ...prior().cause, version: 2 } }))).toMatch(/version 1/);
  });
  it("a unit mismatch in time is not the declared instant", () => {
    expect(refusal(prior({ at: { unit: "v", value: 200 } }))).not.toBeNull();
  });
});

describe("currentLocusOf: one authoritative current locus", () => {
  it("is the accepted locality until a transition exists, and the destination after — never both", () => {
    expect(currentLocusOf(entity, undefined)).toEqual(entity.locality);
    const tr = must(prior());
    expect(currentLocusOf(entity, tr)).toEqual(tr.locus.to);
    expect(currentLocusOf(entity, tr)).not.toEqual(entity.locality);
    // the origin the transition leaves is the accepted locality, which stays true as history
    expect(tr.locus.from).toEqual(entity.locality);
  });
});

describe("worldEntityTransitionProvider: the IM-02 owner operation fails closed", () => {
  const fact = (key: string, owner: string, value: unknown, version = 1): OwnerFact =>
    ({
      key,
      owner,
      facet: owner === "world_state" ? "world_fallback_physical_entity" : "f",
      value,
      version,
      unit: null,
      basis: "b",
      secrecy: "s",
      provenance: { group_id: `g-${key}`, intent_id: `i-${key}`, cause: "c", rule: {} },
    }) as never;
  const read = (f: OwnerFact) => ({ read: {} as never, fact: f });
  const key = "world/w/entity/durable:op-1/transition";
  const input = (over: Record<string, unknown> = {}) =>
    ({
      stage: entityTransitionStage("c-1"),
      produces: [key],
      span: { from: t(100), to: t(200), elapsed: 100 },
      reads: [
        read(fact(causeKey, "some-owner", cause)),
        read(fact(entityKey, "world_state", entity)),
      ],
      prior: new Map(),
      ...over,
    }) as never;
  const failure = (i: never) => {
    try {
      worldEntityTransitionProvider.compute(i);
    } catch (e) {
      if (e instanceof StageUnresolvedError) return e;
      throw e;
    }
    return null;
  };

  it("commits the one transition, inheriting basis and secrecy from the entity it advances the custody of", () => {
    const [w] = worldEntityTransitionProvider.compute(input());
    expect(w!.key).toBe(key);
    expect(w!.basis).toBe("b");
    expect(w!.secrecy).toBe("s");
    expect(EntityTransitionCloseSchema.parse(w!.value).locus.to).toEqual(cause.outcome.destination);
    expect(worldEntityTransitionProvider.owner).toBe("world_state");
    expect(worldEntityTransitionProvider.operation).toBe("world-state-commit-entity-transition");
  });
  it("throws (nothing published) when the cause or the entity is absent or invalid", () => {
    expect(failure(input({ reads: [read(fact(entityKey, "world_state", entity))] }))?.reason).toBe(
      "SOURCE_ABSENT",
    );
    expect(failure(input({ reads: [read(fact(causeKey, "some-owner", cause))] }))?.reason).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      failure(
        input({
          reads: [
            read(fact(causeKey, "some-owner", { nope: 1 })),
            read(fact(entityKey, "world_state", entity)),
          ],
        }),
      )?.reason,
    ).toBe("SOURCE_INVALID");
  });
  it("throws when the entity has already transitioned (one slot, once)", () => {
    expect(failure(input({ prior: new Map([[key, fact(key, "world_state", {})]]) }))?.reason).toBe(
      "SOURCE_INVALID",
    );
  });
  it("throws when it would write other than its entity's own slot", () => {
    expect(failure(input({ produces: ["world/w/entity/other/transition"] }))?.reason).toBe(
      "SOURCE_INVALID",
    );
    expect(failure(input({ produces: [key, "x"] }))?.reason).toBe("SOURCE_INVALID");
  });
  it("resolves only at the cause's own declared instant, never a requested horizon", () => {
    expect(failure(input({ span: { from: t(100), to: t(300), elapsed: 200 } }))?.reason).toBe(
      "BASIS_MISMATCH",
    );
    expect(failure(input({ span: { from: t(100), to: t(150), elapsed: 50 } }))?.reason).toBe(
      "BASIS_MISMATCH",
    );
  });
  it("throws when the cause was read after its establishment", () => {
    expect(
      failure(
        input({
          reads: [
            read(fact(causeKey, "some-owner", cause, 2)),
            read(fact(entityKey, "world_state", entity)),
          ],
        }),
      )?.reason,
    ).toBe("SOURCE_INVALID");
  });
});
