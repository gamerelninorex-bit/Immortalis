/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Unit evidence for the pure rules of the Active-PC voluntary-movement slice: the physical-subject admission (request ownership and
// physical-subject ownership stay separate; the PC is admitted only from its lawful physical custodian, by its OWN PC-owned
// request; Logistics never creates willingness; a PC changes locus only through its own Logistics delivery), the commitment and
// request rules judged by identity against the committed facts, and the one-authority resolver. Register lineage: IA-02, IA-03.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type EntityTransitionCause,
  type FallbackPhysicalEntity,
  type MovementServiceRequest,
  type OwnerFact,
  type PcPhysicalLocusCustody,
} from "@immortalis/contracts";
import {
  deriveCommitment,
  deriveEntityTransition,
  derivePcMovementCommitment,
  derivePcMovementRequest,
  parsePhysicalSubject,
  pcMovementCommitmentViolation,
  pcMovementRequestViolation,
  physicalSubjectOf,
  requestSourceViolation,
  subjectCurrentLocus,
} from "@immortalis/engine";
import { PC, W, commitMove, custodiedCampaign, requestMove } from "../support/pc-movement.ts";
import { must as mustAsync } from "../support/temporal.ts";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});
const custody: PcPhysicalLocusCustody = {
  pc_id: "pc-1",
  stationary_locus: ref("w", "l1"),
  basis: {
    established_from: "EXISTING_ACTOR_HANDOVER",
    pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
  },
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
};
const custodyKey = worldPcLocusCustodyKey("pc-1");
const fallback: FallbackPhysicalEntity = {
  entity_id: "durable:op-1",
  entity_class: "d",
  quantity: { amount: 1, unit: "d" },
  condition: "c",
  locality: ref("w", "l1"),
  custodian: custody.custodian,
  accepted_from: {
    owner: "production",
    fact_key: "production/completion/op-1",
    version: 2,
    operation_id: "op-1",
  },
};
const fallbackKey = worldFallbackEntityKey("w", "durable:op-1");
const pcRequest: MovementServiceRequest = {
  request_id: "pc-move:pc-1",
  source: { owner: "pc_existence", cause_ref: pcMovementCommitmentKey("pc-1") },
  subject: { fact_key: custodyKey, entity_id: "pc-1" },
  destination: ref("w", "l2"),
  priority_authority_ref: null,
};
const prior = (over: Record<string, unknown> = {}) =>
  ({
    request: {
      key: pcMovementRequestKey("pc-1"),
      owner: "pc_existence",
      version: 1,
      value: pcRequest,
    },
    entity: { key: custodyKey, version: 1, value: custody },
    transitioned: false,
    now: t(100),
    delivery_at: t(200),
    ...over,
  }) as any;
const must = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const message = (r: { ok: boolean; error?: { message: string } }) =>
  r.ok ? null : r.error!.message;

describe("the physical subject: exactly two World-State records, each as its owner's own record", () => {
  it("a fallback entity and a PC custody record reduce to the same three things; neither is mistaken for the other", () => {
    expect(physicalSubjectOf(fallback)).toEqual({
      kind: "FALLBACK_ENTITY",
      entity_id: "durable:op-1",
      key: fallbackKey,
      locality: fallback.locality,
    });
    expect(physicalSubjectOf(custody)).toEqual({
      kind: "ACTIVE_PC",
      entity_id: "pc-1",
      key: custodyKey,
      locality: custody.stationary_locus,
    });
    expect(parsePhysicalSubject(custody)).toEqual(custody);
    expect(parsePhysicalSubject(fallback)).toEqual(fallback);
    expect(parsePhysicalSubject({ ...custody, extra: 1 })).toBeUndefined();
    expect(parsePhysicalSubject({ entity_id: "x" })).toBeUndefined();
  });
});

describe("Logistics admits the PC as a moved subject only by the PC's OWN request (frozen contract §10)", () => {
  it("the lawful pair: the PC's custody record and its PC-owned request determine the commitment, pinning the custody record", () => {
    const r = deriveCommitment(prior());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.moved).toMatchObject({ fact_key: custodyKey, entity_id: "pc-1", version: 1 });
    expect(r.value.origin).toEqual(custody.stationary_locus);
    expect(r.value.destination).toEqual(pcRequest.destination);
  });

  it("a FOREIGN owner's request cannot move the PC, nor a request at another key, nor any request naming another subject", () => {
    for (const over of [
      {
        request: {
          key: "synthetic/request/x",
          owner: "synthetic",
          version: 1,
          value: { ...pcRequest, source: { owner: "synthetic", cause_ref: "c" } },
        },
      },
      {
        request: {
          key: "logistics/commitment/w/pc-1",
          owner: "logistics",
          version: 1,
          value: pcRequest,
        },
      },
      {
        request: {
          key: pcMovementRequestKey("pc-2"),
          owner: "pc_existence",
          version: 1,
          value: pcRequest,
        },
      },
      {
        request: {
          key: pcMovementRequestKey("pc-1"),
          owner: "pc_existence",
          version: 1,
          value: { ...pcRequest, subject: { ...pcRequest.subject, entity_id: "pc-2" } },
        },
      },
    ])
      expect(deriveCommitment(prior(over)).ok, JSON.stringify(over).slice(0, 80)).toBe(false);
  });

  it("a PC-owned request moves only the PC that owns it, never a fallback entity", () => {
    const r = deriveCommitment({
      request: {
        key: pcMovementRequestKey("pc-1"),
        owner: "pc_existence",
        version: 1,
        value: { ...pcRequest, subject: { fact_key: fallbackKey, entity_id: "durable:op-1" } },
      },
      entity: { key: fallbackKey, version: 1, value: fallback },
      transitioned: false,
      now: t(100),
      delivery_at: t(200),
    });
    expect(message(r)).toMatch(/PC-owned|request/);
  });

  it("a request source in a registered key space is lawful for exactly one kind: the PC owner's own request at its own slot", () => {
    expect(
      requestSourceViolation(pcMovementRequestKey("pc-1"), "pc_existence", pcRequest),
    ).toBeNull();
    expect(
      requestSourceViolation(pcMovementRequestKey("pc-1"), "logistics", pcRequest),
    ).not.toBeNull();
    expect(
      requestSourceViolation(pcMovementRequestKey("pc-1"), "world_state", pcRequest),
    ).not.toBeNull();
    expect(
      requestSourceViolation(pcMovementRequestKey("pc-2"), "pc_existence", pcRequest),
    ).not.toBeNull();
    expect(
      requestSourceViolation(pcMovementRequestKey("pc-1"), "pc_existence", {
        ...pcRequest,
        source: { owner: "logistics", cause_ref: "c" },
      }),
    ).not.toBeNull();
    expect(requestSourceViolation(custodyKey, "pc_existence", pcRequest)).not.toBeNull();
    expect(requestSourceViolation(fallbackKey, "world_state", pcRequest)).not.toBeNull();
  });

  it("the PC is nowhere stationary-copied: the destination must change the locus, stay in the world, and the PC must not have already transitioned", () => {
    expect(deriveCommitment(prior({ transitioned: true })).ok).toBe(false);
    for (const destination of [ref("w", "l1"), ref("w2", "l2")])
      expect(
        deriveCommitment(
          prior({ request: { ...prior().request, value: { ...pcRequest, destination } } }),
        ).ok,
      ).toBe(false);
  });
});

describe("the active PC changes physical locus only through its own Logistics delivery (frozen contract §8, §9, §16)", () => {
  const cause = (owner: string): EntityTransitionCause => ({
    cause_id: "delivery:pc-move:pc-1",
    source: { owner, cause_ref: "x" },
    subject: { fact_key: custodyKey, entity_id: "pc-1" },
    outcome: { kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED", destination: ref("w", "l2") },
    timing: { established_at: t(200), occurs_at: t(200) },
  });
  const causeKey = "logistics/delivery/w/pc-1";

  it("the Logistics delivery-complete result transitions the PC at its declared instant", () => {
    const r = deriveEntityTransition({
      cause: { key: causeKey, owner: "logistics", version: 1, value: cause("logistics") },
      entity: { key: custodyKey, version: 1, value: custody },
      at: t(200),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entity).toEqual({ fact_key: custodyKey, entity_id: "pc-1", version: 1 });
    expect(r.value.locus.from).toEqual(custody.stationary_locus);
    expect(r.value.locus.to).toEqual(ref("w", "l2"));
  });

  it("no other causing result — an external owner's result, however well formed — can move the PC", () => {
    const r = deriveEntityTransition({
      cause: {
        key: "synthetic/cause/c1",
        owner: "synthetic",
        version: 1,
        value: { ...cause("synthetic"), timing: { established_at: t(100), occurs_at: t(200) } },
      },
      entity: { key: custodyKey, version: 1, value: custody },
      at: t(200),
    });
    expect(message(r)).toMatch(/Logistics|source|registered/);
    // even a Logistics-named result that is not Logistics' own is refused
    const forged = deriveEntityTransition({
      cause: {
        key: "synthetic/cause/c1",
        owner: "synthetic",
        version: 1,
        value: cause("logistics"),
      },
      entity: { key: custodyKey, version: 1, value: custody },
      at: t(200),
    });
    expect(forged.ok).toBe(false);
  });

  it("the subject is named by its own key: a custody record cannot be transitioned under a fallback key or another PC's key", () => {
    for (const key of [fallbackKey, worldPcLocusCustodyKey("pc-2")])
      expect(
        deriveEntityTransition({
          cause: { key: causeKey, owner: "logistics", version: 1, value: cause("logistics") },
          entity: { key, version: 1, value: custody },
          at: t(200),
        }).ok,
      ).toBe(false);
  });
});

describe("the one-authority resolver", () => {
  const fact = (key: string, value: unknown): OwnerFact => ({ key, value }) as never;
  it("a subject that is BOTH a fallback entity and a PC custody record has no unique authority and answers nothing", () => {
    const facts = new Map<string, OwnerFact>([
      [fallbackKey.replace("durable:op-1", "pc-1"), fact("x", { ...fallback, entity_id: "pc-1" })],
      [custodyKey, fact(custodyKey, custody)],
    ]);
    expect(subjectCurrentLocus({ getFact: (k) => facts.get(k) }, "w", "pc-1")).toBeUndefined();
  });

  it("a PC with only its custody record answers its stationary locus; with a transition, the destination; the origin stays history", () => {
    const facts = new Map<string, OwnerFact>([[custodyKey, fact(custodyKey, custody)]]);
    const source = { getFact: (k: string) => facts.get(k) };
    const stationary = subjectCurrentLocus(source, "w", "pc-1")!;
    expect(stationary.current).toEqual(custody.stationary_locus);
    expect(stationary.transition).toBeUndefined();
    expect(subjectCurrentLocus(source, "other-world", "pc-1")).toBeUndefined();
    expect(subjectCurrentLocus(source, "w", "pc-2")).toBeUndefined();
    const transition = {
      transition_id: "transition:delivery:pc-move:pc-1",
      entity: { fact_key: custodyKey, entity_id: "pc-1", version: 1 },
      continuity: {
        relation: "SAME_ENTITY_CONTINUES",
        predecessor: "pc-1",
        successor: "pc-1",
        existence: "CONTINUES",
        form: "UNCHANGED",
        conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
        basis: "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
      },
      locus: { from: custody.stationary_locus, to: ref("w", "l2") },
      cause: {
        owner: "logistics",
        fact_key: "logistics/delivery/w/pc-1",
        version: 1,
        cause_id: "delivery:pc-move:pc-1",
      },
      custodian: custody.custodian,
      closed_at: t(200),
      close: {
        name: "Entity Transition Close",
        stage: {
          causal_process_id: "p",
          owner_operation: { owner: "world_state", operation: "o" },
          prospective_result_id: "r",
        },
      },
    };
    facts.set(worldEntityTransitionKey("w", "pc-1"), fact("t", transition));
    const moved = subjectCurrentLocus(source, "w", "pc-1")!;
    expect(moved.current).toEqual(ref("w", "l2"));
    expect(moved.origin).toEqual(custody.stationary_locus);
  });
});

describe("the commitment and request rules, judged by identity against the committed facts", () => {
  it("the derivations are mechanical: pins are the committed versions (0 when absent), nothing else is read", async () => {
    const s = await custodiedCampaign();
    const input = {
      pc_id: PC,
      destination: { world_id: W, locus_id: "locus-fixture-dest" },
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
    };
    const c = must(derivePcMovementCommitment(input, s.campaign.store));
    expect(c.basis.pinned_versions).toEqual({ pc: 1, binding: 1, custody: 1, world: 1, locus: 1 });
    const missing = must(
      derivePcMovementCommitment({ ...input, pc_id: "actor-nobody" }, s.campaign.store),
    );
    expect(missing.basis.pinned_versions).toMatchObject({ pc: 0, custody: 0 });
    expect(derivePcMovementRequest(c)).toEqual({
      request_id: `pc-move:${PC}`,
      source: { owner: "pc_existence", cause_ref: pcMovementCommitmentKey(PC) },
      subject: { fact_key: worldPcLocusCustodyKey(PC), entity_id: PC },
      destination: c.intent.destination,
      priority_authority_ref: null,
    });
  });

  it("a lawful commitment and request hold; hiding or altering any fact they rest on breaks them", async () => {
    const s = await custodiedCampaign();
    await mustAsync(commitMove(s, 1));
    await mustAsync(requestMove(s, 2));
    const facts = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    const view = (hide: string[] = [], swap: Record<string, OwnerFact> = {}) => ({
      get: (k: string) => (hide.includes(k) ? undefined : (swap[k] ?? facts.get(k))),
      has: (k: string) => !hide.includes(k) && (swap[k] !== undefined || facts.has(k)),
    });
    const commitment = s.campaign.pcMovementCommitment(PC)!.value;
    const request = s.campaign.pcMovementRequest(PC)!.value;
    const ckey = pcMovementCommitmentKey(PC);
    const rkey = pcMovementRequestKey(PC);
    expect(pcMovementCommitmentViolation(ckey, commitment, view())).toBeNull();
    expect(pcMovementRequestViolation(rkey, request, view())).toBeNull();
    // the facts it rests on
    for (const hidden of [
      "role-registry/binding/role.player_character",
      worldPcLocusCustodyKey(PC),
      `pc/${PC}/existence-contract`,
      commitment.intent.destination.locus.fact_key,
      commitment.intent.destination.world.fact_key,
    ])
      expect(
        pcMovementCommitmentViolation(ckey, commitment, view([hidden])),
        hidden,
      ).not.toBeNull();
    // a request exists only for a committed commitment that still holds
    expect(pcMovementRequestViolation(rkey, request, view([ckey]))).not.toBeNull();
    expect(
      pcMovementRequestViolation(rkey, request, view([worldPcLocusCustodyKey(PC)])),
    ).not.toBeNull();
    // identity
    expect(
      pcMovementCommitmentViolation("pc/other/movement/commitment", commitment, view()),
    ).not.toBeNull();
    expect(
      pcMovementCommitmentViolation(ckey, { ...commitment, pc_id: "actor-other" }, view()),
    ).not.toBeNull();
    // another current-locus authority exists for the identity: the custody no longer holds as the one authority
    const rival = new Map(facts);
    rival.set(worldFallbackEntityKey(W, PC), {} as never);
    expect(
      pcMovementCommitmentViolation(ckey, commitment, {
        get: (k) => rival.get(k),
        has: (k) => rival.has(k),
      }),
    ).toMatch(/authority/);
  });
});
