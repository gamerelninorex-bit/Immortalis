/* eslint-disable @typescript-eslint/no-explicit-any -- tests inject typed pre-state facts */
// OPTION_A_V9 (ADOPTED): the 90-row BOOTSTRAP_SUNSET_POLICY_V9, its actual-registry exact-set/effect guard with mutation tests, and the pure
// as-of qualification `qualifies(completion, prefix, occupied)` against typed pre-state fixtures. The fixtures are NOT lawful R1 bootstrap
// journals (R1 remains incompatible with the source-bearing route): they test the pure guard independently of any owner/freeze refusal.
// MECHANISM ONLY: nothing here certifies T2/T3.
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  BOOTSTRAP_SUNSET_POLICY_V9,
  completionOf,
  policyCoverageViolations,
  qualifies,
  sameSelectedRefs,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  NON_PC_INITIAL,
  OWNER_WORLD_STATE,
  worldLocusKey,
  worldProfileKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { EXPECTED_FACT_KINDS } from "../support/expected-surface.ts";
import { harness, intakeRequest } from "../support/initial-setup.ts";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "@immortalis/testkit";

/** INDEPENDENT reviewed table: literal data transcribed from the companion's 90-row policy, never read back from the engine module. */
const REVIEWED: Readonly<Record<string, string>> = {
  actor_physical_presence: "END_NON_PC_PRESENCE",
  actor_raw_sensory_state: "UNREVIEWED_BLOCK",
  actor_setup_placement: "END_NON_PC_PLACEMENT",
  causal_draw_precommit: "UNREVIEWED_BLOCK",
  causal_draw_result: "UNREVIEWED_BLOCK",
  culture_adjudication_decision: "UNREVIEWED_BLOCK",
  culture_shared_meaning: "UNREVIEWED_BLOCK",
  culture_update_context: "UNREVIEWED_BLOCK",
  diplomacy_claim_dispute: "UNREVIEWED_BLOCK",
  diplomacy_external_recognition: "UNREVIEWED_BLOCK",
  diplomacy_framework: "UNREVIEWED_BLOCK",
  diplomacy_relation_edge: "UNREVIEWED_BLOCK",
  economy_demand: "UNREVIEWED_BLOCK",
  economy_encumbrance: "OWNER_CHECKS_ONLY",
  economy_holding: "OWNER_CHECKS_ONLY",
  economy_realization: "UNREVIEWED_BLOCK",
  economy_reallocation: "OWNER_CHECKS_ONLY",
  economy_request: "UNREVIEWED_BLOCK",
  epistemic_access_event: "OWNER_CHECKS_ONLY",
  epistemic_accessible_packet: "OWNER_CHECKS_ONLY",
  epistemic_sealed_provenance: "OWNER_CHECKS_ONLY",
  gip_governance_instrument: "UNREVIEWED_BLOCK",
  gip_institution_identity: "UNREVIEWED_BLOCK",
  gip_office_authority_locus: "UNREVIEWED_BLOCK",
  gip_scope_binding: "UNREVIEWED_BLOCK",
  gip_sunset_enrollment: "UNREVIEWED_BLOCK",
  initial_locality_completion: "OWNER_CHECKS_ONLY",
  initial_setup_disposition: "OWNER_CHECKS_ONLY",
  initial_setup_grant: "OWNER_CHECKS_ONLY",
  initial_setup_input: "OWNER_CHECKS_ONLY",
  initial_setup_invocation: "OWNER_CHECKS_ONLY",
  initial_setup_response: "OWNER_CHECKS_ONLY",
  kti_development_object: "UNREVIEWED_BLOCK",
  kti_transfer_basis: "UNREVIEWED_BLOCK",
  kti_transfer_package: "UNREVIEWED_BLOCK",
  logistics_commitment: "UNREVIEWED_BLOCK",
  logistics_delivery: "UNREVIEWED_BLOCK",
  logistics_transfer: "UNREVIEWED_BLOCK",
  named_actor_capability: "OWNER_CHECKS_ONLY",
  named_actor_capability_basis: "OWNER_CHECKS_ONLY",
  pc_capability: "OWNER_CHECKS_ONLY",
  pc_capability_basis: "OWNER_CHECKS_ONLY",
  pc_collection_cessation: "OWNER_CHECKS_ONLY",
  pc_collection_commitment: "OWNER_CHECKS_ONLY",
  pc_collection_cycle_attestation: "OWNER_CHECKS_ONLY",
  pc_collection_mechanism: "OWNER_CHECKS_ONLY",
  pc_collection_reach_decision: "OWNER_CHECKS_ONLY",
  pc_collection_request: "OWNER_CHECKS_ONLY",
  pc_delegated_clarification: "OWNER_CHECKS_ONLY",
  pc_existence_contract: "OWNER_CHECKS_ONLY",
  pc_intrinsic_clarification: "OWNER_CHECKS_ONLY",
  pc_movement_commitment: "OWNER_CHECKS_ONLY",
  pc_movement_request: "OWNER_CHECKS_ONLY",
  player_character_binding: "OWNER_CHECKS_ONLY",
  population_close: "RECHECK_POPULATION",
  population_cohort: "UNREVIEWED_BLOCK",
  population_ledger: "RECHECK_POPULATION",
  population_pc_occupancy: "RECHECK_PC_STANDING",
  population_pc_representation: "RECHECK_PC_STANDING",
  population_workforce_scope: "RECHECK_POPULATION",
  production_claim: "OWNER_CHECKS_ONLY",
  production_completion: "OWNER_CHECKS_ONLY",
  production_extraction: "OWNER_CHECKS_ONLY",
  production_extraction_basis: "OWNER_CHECKS_ONLY",
  production_operation: "OWNER_CHECKS_ONLY",
  production_pc_collection_lapse: "OWNER_CHECKS_ONLY",
  production_pc_collection_termination: "OWNER_CHECKS_ONLY",
  production_pc_collection_work: "OWNER_CHECKS_ONLY",
  production_reserve: "OWNER_CHECKS_ONLY",
  production_source_account: "OWNER_CHECKS_ONLY",
  production_source_delta: "OWNER_CHECKS_ONLY",
  referee_decision: "OWNER_CHECKS_ONLY",
  resolution_transaction: "OWNER_CHECKS_ONLY",
  temporal_boundary_index: "OWNER_CHECKS_ONLY",
  temporal_object: "OWNER_CHECKS_ONLY",
  temporal_state: "OWNER_CHECKS_ONLY",
  temporal_transaction_authority: "OWNER_CHECKS_ONLY",
  world_acoustic_emission: "UNREVIEWED_BLOCK",
  world_actor_coupling: "END_NON_PC_COUPLING",
  world_corridor: "UNREVIEWED_BLOCK",
  world_entity_transition: "UNREVIEWED_BLOCK",
  world_fallback_entity: "UNREVIEWED_BLOCK",
  world_locus: "SELECTED_KEY_UNCHANGED",
  world_pc_current_viewing: "OWNER_CHECKS_ONLY",
  world_pc_locus_custody: "RECHECK_PC_STANDING",
  world_profile: "SELECTED_KEY_UNCHANGED",
  world_scene_closure: "RECHECK_SCENE",
  world_setup_closure: "OWNER_CHECKS_ONLY",
  world_source_condition: "SELECTED_SOURCE_FIELDS",
  world_source_delivery: "OWNER_CHECKS_ONLY",
};
const ids = ALL_FACT_KINDS.map((k) => k.id);

describe("BOOTSTRAP_SUNSET_POLICY_V9 is explicit, complete and exactly reviewed", () => {
  it("the actual imported ALL_FACT_KINDS equals the 90-row policy: 84 baseline + 6 bootstrap kinds, no synthesized row", () => {
    expect(ids).toHaveLength(90);
    expect(new Set(ids).size).toBe(90);
    expect(BOOTSTRAP_SUNSET_POLICY_V9).toHaveLength(90);
    expect(policyCoverageViolations(BOOTSTRAP_SUNSET_POLICY_V9, ids, REVIEWED)).toEqual([]);
    expect(Object.keys(REVIEWED)).toHaveLength(90);
    const count = (p: string) => BOOTSTRAP_SUNSET_POLICY_V9.filter((r) => r.policy === p).length;
    expect(count("UNREVIEWED_BLOCK")).toBe(29);
    expect(
      BOOTSTRAP_SUNSET_POLICY_V9.filter((r) => r.policy.startsWith("END_NON_PC_")).map(
        (r) => r.kind,
      ),
    ).toEqual(["actor_physical_presence", "actor_setup_placement", "world_actor_coupling"]);
  });

  it("states the exact field paths of the three END_NON_PC predicates", () => {
    const effect = (k: string) => BOOTSTRAP_SUNSET_POLICY_V9.find((r) => r.kind === k)!.effect;
    for (const k of ["actor_physical_presence", "actor_setup_placement"]) {
      expect(effect(k)).toContain("value.world.entity_id/fact_key");
      expect(effect(k)).toContain("value.locus.entity_id/fact_key");
    }
    expect(effect("world_actor_coupling")).toContain("value.coupling.world.entity_id/fact_key");
    expect(effect("world_actor_coupling")).toContain("value.coupling.locus.entity_id/fact_key");
  });

  it("mutations are caught: a removed row, an added unrowed registry id, a nonexistent row, a loosened blocking row, duplicates", () => {
    const rows = BOOTSTRAP_SUNSET_POLICY_V9;
    const without = (kind: string) => rows.filter((r) => r.kind !== kind);
    for (const k of [
      "world_scene_closure",
      "epistemic_access_event",
      "world_pc_current_viewing",
      "pc_movement_request",
    ])
      expect(policyCoverageViolations(without(k), ids, REVIEWED).join("|")).toContain(
        `registered kind ${k} has no policy row`,
      );
    expect(
      policyCoverageViolations(rows, [...ids, "brand_new_kind"], REVIEWED).join("|"),
    ).toContain("registered kind brand_new_kind has no policy row");
    expect(
      policyCoverageViolations(
        [...rows, { kind: "ghost_kind", policy: "OWNER_CHECKS_ONLY", effect: "x" }],
        ids,
        REVIEWED,
      ).join("|"),
    ).toContain("policy row ghost_kind names no registered kind");
    const loosened = rows.map((r) =>
      r.kind === "economy_demand" ? { ...r, policy: "OWNER_CHECKS_ONLY" as const } : r,
    );
    expect(policyCoverageViolations(loosened, ids, REVIEWED).join("|")).toContain(
      "policy row economy_demand is OWNER_CHECKS_ONLY, the reviewed policy is UNREVIEWED_BLOCK",
    );
    expect(policyCoverageViolations([...rows, rows[0]!], ids, REVIEWED).join("|")).toContain(
      "duplicate policy row",
    );
    expect(policyCoverageViolations(rows, [...ids, ids[0]!], REVIEWED).join("|")).toContain(
      "duplicate registry id",
    );
  });
});

// -- the pure as-of guard ----------------------------------------------------------------------------------------------------------

const stub = (key: string, value: unknown, version = 1): OwnerFact =>
  ({
    key,
    owner: "x",
    facet: "x",
    value,
    unit: null,
    basis: "x",
    secrecy: "x",
    version,
    provenance: { group_id: `g:${key}`, intent_id: `i:${key}`, cause: "c", rule: {} as any },
  }) as OwnerFact;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const ref = (
  world: string,
  locus: string,
  wk = worldProfileKey(world),
  lk = worldLocusKey(world, locus),
) => ({
  world: { fact_key: wk, entity_id: world },
  locus: { fact_key: lk, entity_id: locus },
});

async function completedPrefix() {
  const h = await harness();
  const intake = await h.service.intake(await intakeRequest(h));
  await h.service.advance(intake.setup_id!);
  const facts = new Map(h.store.listFacts().map((f) => [f.key, f]));
  const completion = completionOf(scanInitialSetup(facts).completion)!;
  return { facts, completion, h };
}
const plus = (facts: Map<string, OwnerFact>, ...more: OwnerFact[]) => {
  const m = new Map(facts);
  for (const f of more) m.set(f.key, f);
  return m;
};
const t = (value: number) => ({ unit: "seconds", value });
const custodian = {
  owner: OWNER_WORLD_STATE,
  facet: FACET_WORLD_FALLBACK_ENTITY,
  basis: FALLBACK_BASIS,
};

describe("qualifies(completion, prefix, occupied): the as-of Initial Scene Exception guard", () => {
  it("qualifies a compatible Completion at its own prefix, and fits only the full occupied interval [begin, finish) in the coverage", async () => {
    const { facts, completion } = await completedPrefix();
    expect(qualifies(completion, facts, null).qualified).toBe(true);
    const fit = (b: number, f: number) =>
      qualifies(completion, facts, { begin: t(b), finish: t(f) });
    expect(fit(0, 6).qualified).toBe(true);
    expect(fit(0, 7200).qualified).toBe(true); // work finishing exactly at the end fits
    expect(fit(7199, 7200).qualified).toBe(true);
    expect(fit(7200, 7201).code).toBe("INTERVAL_OUTSIDE_COVERAGE"); // no new work starts at the end
    expect(fit(0, 7201).code).toBe("INTERVAL_OUTSIDE_COVERAGE");
    expect(fit(5, 5).code).toBe("INTERVAL_OUTSIDE_COVERAGE");
    expect(
      qualifies(completion, facts, {
        begin: { unit: "days", value: 0 },
        finish: { unit: "days", value: 1 },
      }).code,
    ).toBe("INTERVAL_UNIT_MISMATCH");
  });

  it("each of the 29 UNREVIEWED_BLOCK kinds present in the prefix withholds, and so does a synthetic unknown key", async () => {
    const { facts, completion } = await completedPrefix();
    const blocked = BOOTSTRAP_SUNSET_POLICY_V9.filter((r) => r.policy === "UNREVIEWED_BLOCK").map(
      (r) => r.kind,
    );
    expect(blocked).toHaveLength(29);
    for (const kind of blocked) {
      const example = EXPECTED_FACT_KINDS.find((k) => k.id === kind)!.exampleKey;
      const r = qualifies(completion, plus(facts, stub(example, {})), null);
      expect([kind, r.qualified, r.code]).toEqual([kind, false, "UNREVIEWED_KIND_PRESENT"]);
    }
    expect(qualifies(completion, plus(facts, stub("totally/unknown/key", {})), null).code).toBe(
      "UNKNOWN_KIND_PRESENT",
    );
  });

  it("a non-PC placement, coupling or physical presence at the selected world and locus ends the exception (three independent tests)", async () => {
    const { facts, completion } = await completedPrefix();
    const placement = stub("world-state/actor/a1/setup-placement", {
      actor_id: "a1",
      ...ref(W, L),
      actor_state: [{ owner: "named_actor", fact_key: "actor/a1/cap/c1", version: 1 }],
      pinned_versions: { world: 1, locus: 1 },
      statement: "an actor is placed here",
    });
    const coupling = stub("world-state/actor/a1/coupling", {
      actor_id: "a1",
      actor_state: [{ owner: "named_actor", fact_key: "actor/a1/cap/c1", version: 1 }],
      coupling: ref(W, L),
      pinned_versions: { world: 1, locus: 1 },
      custodian,
    });
    const presence = stub("actor/a1/physical-presence", {
      actor_id: "a1",
      ...ref(W, L),
      pinned_versions: { world: 1, locus: 1, placement: 1, closure: 1 },
      effective_instant: t(0),
      initial_custody: NON_PC_INITIAL,
      custodian,
    });
    for (const [kind, fact, code] of [
      ["actor_setup_placement", placement, "NON_PC_PLACEMENT"],
      ["world_actor_coupling", coupling, "NON_PC_COUPLING"],
      ["actor_physical_presence", presence, "NON_PC_PRESENCE"],
    ] as const) {
      const key = EXPECTED_FACT_KINDS.find((k) => k.id === kind)!.exampleKey;
      const r = qualifies(completion, plus(facts, { ...fact, key } as OwnerFact), null);
      expect([kind, r.code]).toEqual([kind, code]);
    }
  });

  it("a fully valid, internally consistent reference to another world or another locus has no direct END effect; a malformed or unverifiable one fails closed", async () => {
    const { facts, completion } = await completedPrefix();
    const W2 = "world-other";
    const L2 = "locus-other";
    const verifiable = plus(
      facts,
      stub(worldProfileKey(W2), {}),
      stub(worldLocusKey(W2, L2), {}),
      stub(worldLocusKey(W, L2), {}),
    );
    const mk = (r: ReturnType<typeof ref>, key = "world-state/actor/a1/setup-placement") =>
      stub(key, {
        actor_id: "a1",
        ...r,
        actor_state: [{ owner: "named_actor", fact_key: "actor/a1/cap/c1", version: 1 }],
        pinned_versions: { world: 1, locus: 1 },
        statement: "placed",
      });
    expect(qualifies(completion, plus(verifiable, mk(ref(W2, L2))), null).qualified).toBe(true); // another world
    expect(qualifies(completion, plus(verifiable, mk(ref(W, L2))), null).qualified).toBe(true); // another locus of the same world
    // malformed: the locus fact_key disagrees with its own identity
    const wrongKey = qualifies(
      completion,
      plus(verifiable, mk(ref(W, L, worldProfileKey(W), worldLocusKey(W, "different")))),
      null,
    );
    expect(wrongKey.code).toBe("MALFORMED_REFERENCE");
    // unverifiable: the referenced locus is not committed in the prefix
    expect(qualifies(completion, plus(facts, mk(ref(W, "locus-nowhere"))), null).code).toBe(
      "MALFORMED_REFERENCE",
    );
    expect(sameSelectedRefs(ref(W, L).world, ref(W, L).locus, completion)).toBe(true);
    expect(sameSelectedRefs(ref(W, L).world, ref(W, L2).locus, completion)).toBe(false);
  });

  it("is judged on the ACTUAL prefix: a contrary fact introduced after Input but before use withholds, and the earlier prefix keeps its own result", async () => {
    const { facts, completion } = await completedPrefix();
    const earlier = new Map(facts);
    const later = plus(facts, stub("economy/demand/d1", {}));
    expect(qualifies(completion, earlier, null).qualified).toBe(true);
    expect(qualifies(completion, later, null).qualified).toBe(false);
    // a later contradiction never rewrites the earlier verdict
    expect(qualifies(completion, earlier, null).qualified).toBe(true);
  });

  it("a changed selected world/locus key withholds", async () => {
    const { facts, completion } = await completedPrefix();
    const locus = facts.get(worldLocusKey(W, L))!;
    expect(
      qualifies(completion, plus(facts, { ...locus, version: locus.version + 1 }), null).code,
    ).toBe("SELECTED_KEY_CHANGED");
  });

  // -- the selected source: DIRECT comparison of the stable fields with the canonical Input baseline ---------------------------------
  // The baseline is the Input's committed projection_hash; the pinned source value is reconstructed from the current value and the
  // recorded, contiguous World-State delivery chain (no journal query, no widened interface, no new fact field).
  const unitOfSource = (v: any) => v.establishment.quantity.unit as string;
  /** A World-State delivery record (WorldSourceDeliverySchema) that advances `src` from version `before` by `amount` of `beforeAmount`. */
  const delivery = (
    src: OwnerFact,
    id: string,
    before: number,
    amount: number,
    beforeAmount: number,
  ) =>
    stub(`world/${W}/source-delivery/${id}`, {
      delivery_id: id,
      source: {
        fact_key: src.key,
        source_key: (src.value as any).source_key,
        version_before: before,
        version_after: before + 1,
      },
      delta: { fact_key: `production/source-delta/${id}`, version: 1 },
      delivered: { amount, unit: unitOfSource(src.value) },
      before: { amount: beforeAmount, unit: unitOfSource(src.value) },
      after: { amount: beforeAmount - amount, unit: unitOfSource(src.value) },
      exhausted: beforeAmount - amount === 0,
      delivered_at: t(10),
      contribution: { extraction_id: id, accounting: "DISCRETE_EPISODIC_RESIDUE" },
      close_stage: {
        causal_process_id: `production-extraction:${id}`,
        owner_operation: {
          owner: "world_state",
          operation: "world-state-deliver-source-drawdown",
        },
        prospective_result_id: `source-delivery:${id}`,
      },
    });
  /** The source after the given successive drawdowns, with the delivery records that advanced it version by version. */
  const drawn = (src: OwnerFact, amounts: readonly number[], edit: (v: any) => any = (v) => v) => {
    let value: any = src.value;
    const records: OwnerFact[] = [];
    amounts.forEach((amount, i) => {
      const id = `d${i + 1}`;
      records.push(delivery(src, id, src.version + i, amount, value.recoverable.amount));
      const recoverable = value.recoverable.amount - amount;
      value = {
        ...value,
        recoverable: { ...value.recoverable, amount: recoverable },
        delivered: [
          ...value.delivered,
          { delivery_id: id, quantity: { amount, unit: unitOfSource(value) } },
        ],
        exhaustion: recoverable === 0 ? { kind: "PHYSICAL", delivery_id: id } : null,
      };
    });
    return {
      records,
      fact: { ...src, version: src.version + amounts.length, value: edit(value) } as OwnerFact,
    };
  };

  it("lawful recoverable/delivered/exhaustion variation does not sunset the exception: one drawdown, several, and physical exhaustion", async () => {
    const { facts, completion } = await completedPrefix();
    const src = facts.get(completion.selection.source_claims[0]!.source.fact_key)!;
    const total = (src.value as any).recoverable.amount as number;
    expect(total).toBeGreaterThan(2);
    for (const amounts of [[1], [1, 1], [total]]) {
      const { records, fact } = drawn(src, amounts);
      const r = qualifies(completion, plus(facts, fact, ...records), null);
      expect([amounts, r.code]).toEqual([amounts, "QUALIFIED"]);
    }
  });

  it("a changed stable field of the selected source withholds - at an otherwise greater version with a complete lawful delivery chain, and at the pinned version itself", async () => {
    const { facts, completion } = await completedPrefix();
    const src = facts.get(completion.selection.source_claims[0]!.source.fact_key)!;
    const v: any = src.value;
    const mutations: Record<string, (x: any) => any> = {
      source_key: (x) => ({ ...x, source_key: `${x.source_key}-other` }),
      locality: (x) => ({
        ...x,
        locality: {
          ...x.locality,
          locus: { fact_key: worldLocusKey(W, "elsewhere"), entity_id: "elsewhere" },
        },
      }),
      dimension: (x) => ({ ...x, dimension: `${x.dimension}-other` }),
      material_class: (x) => ({ ...x, material_class: `${x.material_class}-other` }),
      establishment_statement: (x) => ({
        ...x,
        establishment: { ...x.establishment, statement: `${x.establishment.statement} (revised)` },
      }),
      establishment_quantity: (x) => ({
        ...x,
        establishment: {
          ...x.establishment,
          quantity: { ...x.establishment.quantity, amount: x.establishment.quantity.amount + 1 },
        },
        recoverable: { ...x.recoverable, amount: x.recoverable.amount + 1 },
      }),
      access_facts: (x) => ({
        ...x,
        access_facts: [...x.access_facts, { aspect: "added-aspect", statement: "a new fact" }],
      }),
    };
    expect(v.access_facts).toBeDefined();
    for (const [field, mutate] of Object.entries(mutations)) {
      // (a) an otherwise greater version: one lawful recorded delivery, then the stable field changed
      const { records, fact } = drawn(src, [1], mutate);
      const greater = qualifies(completion, plus(facts, fact, ...records), null);
      expect([field, "greater", greater.code]).toEqual([
        field,
        "greater",
        "SELECTED_SOURCE_CHANGED",
      ]);
      expect(greater.message).toContain("differs from the canonical Input baseline");
      // (b) the pinned version itself carrying another value (a typed counterfactual: a committed journal cannot hold it)
      const same = qualifies(
        completion,
        plus(facts, { ...src, value: mutate(src.value) } as OwnerFact),
        null,
      );
      expect([field, "pinned", same.code]).toEqual([field, "pinned", "SELECTED_SOURCE_CHANGED"]);
    }
  });

  it("a later source version with no, a gapped, an inconsistent or a foreign recorded delivery chain is unverifiable and withholds", async () => {
    const { facts, completion } = await completedPrefix();
    const src = facts.get(completion.selection.source_claims[0]!.source.fact_key)!;
    const { records, fact } = drawn(src, [1, 1]);
    const code = (prefix: Map<string, OwnerFact>) => qualifies(completion, prefix, null).code;
    expect(code(plus(facts, fact, ...records))).toBe("QUALIFIED");
    expect(code(plus(facts, fact))).toBe("SELECTED_SOURCE_CHANGED"); // no recorded chain at all
    expect(code(plus(facts, fact, records[1]!))).toBe("SELECTED_SOURCE_CHANGED"); // a gap at the pinned version
    expect(code(plus(facts, fact, records[0]!))).toBe("SELECTED_SOURCE_CHANGED"); // a gap at the end
    // a delivery record that disagrees with the entry the source carries
    const wrongAmount = stub(records[0]!.key, {
      ...(records[0]!.value as any),
      delivered: { amount: 2, unit: unitOfSource(src.value) },
      after: {
        amount: (records[0]!.value as any).before.amount - 2,
        unit: unitOfSource(src.value),
      },
    });
    expect(code(plus(facts, fact, wrongAmount, records[1]!))).toBe("SELECTED_SOURCE_CHANGED");
    // a record of another source's delivery cannot stand for this one's chain
    const foreign = stub(records[0]!.key, {
      ...(records[0]!.value as any),
      source: { ...(records[0]!.value as any).source, fact_key: `world/${W}/source/another` },
    });
    expect(code(plus(facts, fact, foreign, records[1]!))).toBe("SELECTED_SOURCE_CHANGED");
    // an older version than the Input pinned
    if (src.version > 1)
      expect(code(plus(facts, { ...src, version: src.version - 1 } as OwnerFact))).toBe(
        "SELECTED_SOURCE_CHANGED",
      );
  });

  it("any other pinned genesis fact absent or at another version is unverifiable and withholds", async () => {
    const { facts, completion } = await completedPrefix();
    const pins: { fact_key: string }[] = (facts.get(completion.input.fact_key)!.value as any)
      .genesis;
    const others = pins.filter(
      (p) => p.fact_key !== completion.selection.source_claims[0]!.source.fact_key,
    );
    expect(others.length).toBeGreaterThan(0);
    for (const p of others) {
      const fact = facts.get(p.fact_key)!;
      const bumped = qualifies(
        completion,
        plus(facts, { ...fact, version: fact.version + 1 }),
        null,
      );
      expect(bumped.qualified).toBe(false);
    }
  });

  it("PC custody and Population standing alone do not end the exception (OWNER_CHECKS_ONLY / RECHECK are not presence)", async () => {
    const { facts, completion } = await completedPrefix();
    const custody = stub("world-state/pc/pc1/locus-custody", {});
    const key = EXPECTED_FACT_KINDS.find((k) => k.id === "world_pc_locus_custody")!.exampleKey;
    const occ = EXPECTED_FACT_KINDS.find((k) => k.id === "population_pc_occupancy")!.exampleKey;
    expect(
      qualifies(completion, plus(facts, { ...custody, key }, stub(occ, {})), null).qualified,
    ).toBe(true);
  });
});
