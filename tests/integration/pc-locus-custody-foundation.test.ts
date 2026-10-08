// Active-PC Post-Handover Physical Locus Custody Foundation (thirty-ninth bounded slice) — "the engine could already hand an
// existing actor over to the player by one Role Registry binding commit; this slice adds the ONE World-State custody record
// that states where that active PC stationarily IS afterwards, taken only from the handover's consumed coupling. It moves,
// requests and dispatches nothing."
// Register lineage: IA-01/02/03/14 (partial); RC-02, RC-13, RC-16; IM-03, IM-11, IM-17.
// Sources: frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (pin 2026-10-08T01:25:36.611Z,
// §§4-7, 9, 13; NOT a spec-lock pin); spec/f027/spec-lock.json — WG, WS-006 / F-014A, IR and I-002 pins; PC-CONTROL HANDOVER
// CONTRACT v1 (observed pin) as the seam rule. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { derivePcPhysicalLocusCustody, factKind } from "@immortalis/engine";
import { ACTOR_SMITH, FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "@immortalis/testkit";
import {
  PC,
  custodyKey,
  establishCustody,
  handedOverCampaign,
  snapshotFacts,
} from "../support/pc-locus-custody.ts";
import { must } from "../support/temporal.ts";

const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;

describe("the completed handover determines exactly one stationary physical-locus custody record", () => {
  it("one World-State record at one slot per PC identity, at the consumed coupling's locus, pinning the exact committed basis", async () => {
    const s = await handedOverCampaign();
    expect(s.campaign.pcPhysicalLocusCustody(PC)).toBeUndefined();
    const outcome = await must(establishCustody(s, 1));
    expect(outcome.replayed).toBe(false);

    const fact = s.campaign.store.getFact(custodyKey())!;
    expect(fact).toMatchObject({ owner: "world_state", facet: "world_fallback_physical_entity" });
    expect(fact.version).toBe(1);
    expect(fact.value).toEqual({
      pc_id: PC,
      stationary_locus: {
        world: { fact_key: worldProfileKey(W), entity_id: W },
        locus: { fact_key: worldLocusKey(W, L), entity_id: L },
      },
      basis: {
        established_from: "EXISTING_ACTOR_HANDOVER",
        pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
      },
      custodian: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
      },
    });
    expect(fact.provenance.rule).toEqual(factKind("world_pc_locus_custody").rule);

    // one commit group, one write; the foreign state was read at its exact version and depended on, never copied
    const group = s.campaign.store.committedGroup(fact.provenance.intent_id)!;
    expect(group.writes).toHaveLength(1);
    expect(group.reads).toEqual([
      { key: pcExistenceContractKey(PC), version: 1 },
      { key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
      { key: worldActorCouplingKey(PC), version: 1 },
      { key: worldProfileKey(W), version: 1 },
      { key: worldLocusKey(W, L), version: 1 },
    ]);
    for (const r of group.reads) {
      const target = s.campaign.store.getFact(r.key)!;
      expect(group.depends_on).toContain(target.provenance.group_id);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the canonical continuing PC identity is reused, never duplicated: the record, its key, the binding and the coupling name one identity", async () => {
    const s = await handedOverCampaign();
    const before = snapshotFacts(s);
    await must(establishCustody(s, 1));
    const custody = s.campaign.pcPhysicalLocusCustody(PC)!.value;
    expect(custody.pc_id).toBe(PC);
    expect(s.campaign.binding()!.value.active_pc.entity_id).toBe(PC);
    expect(s.campaign.existingActorCoupling(PC)!.value.actor_id).toBe(PC);
    expect(s.campaign.playerCharacter(PC)!.value.pc_id).toBe(PC);
    // no second PC identity: no new Existence Contract, binding, PC-owner or Named-Actor fact exists
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([custodyKey()]);
  });

  it("nothing but the custody record is added or changed: the Role Registry binding, the coupling and every consumed fact stay byte-for-byte unchanged", async () => {
    const s = await handedOverCampaign();
    const before = snapshotFacts(s);
    const bindingReceipt = s.campaign.store.lookupReceipt(
      before.get(PLAYER_CHARACTER_BINDING_KEY)!.provenance.intent_id,
    );
    await must(establishCustody(s, 1));
    const after = snapshotFacts(s);
    expect([...after.keys()].filter((k) => !before.has(k))).toEqual([custodyKey()]);
    for (const [key, fact] of before) expect(after.get(key), key).toEqual(fact);
    // the operative binding: same serialization, same version, same receipt; its referent is still the binding-time one
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    expect(JSON.stringify(binding)).toBe(JSON.stringify(before.get(PLAYER_CHARACTER_BINDING_KEY)));
    expect(binding.version).toBe(1);
    expect(s.campaign.store.lookupReceipt(binding.provenance.intent_id)).toEqual(bindingReceipt);
    expect(s.campaign.binding()!.value.coupling.locus.entity_id).toBe(L);
    // the consumed coupling is immutable provenance: still version 1, still a coupling, never rewritten as current state
    const coupling = s.campaign.store.getFact(worldActorCouplingKey(PC))!;
    expect(coupling.version).toBe(1);
    expect(coupling.value).toEqual(before.get(worldActorCouplingKey(PC))!.value);
  });

  it("the stationary locus is taken from the consumed coupling, never from the Role Registry binding's referent and never from the caller", () => {
    const binding = {
      key: PLAYER_CHARACTER_BINDING_KEY,
      owner: "role_registry",
      facet: "player_character_binding",
      version: 1,
      value: {
        binding_slot: "role.player_character",
        active_pc: { fact_key: pcExistenceContractKey(PC), entity_id: PC },
        coupling: {
          world: { fact_key: worldProfileKey(W), entity_id: W },
          locus: {
            fact_key: worldLocusKey(W, "locus-binding-referent"),
            entity_id: "locus-binding-referent",
          },
        },
        transition: {
          type: "EXISTING_ACTOR_HANDOVER",
          basis: { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } },
        },
        prior_binding: null,
        replacement_binding: null,
        intrinsic_authority_migration: [
          { owner: "world_state", fact_key: worldActorCouplingKey(PC), version: 1 },
        ],
        writer: { role: "role.archivist", permission: "permission.canon.write" },
      },
    };
    const coupling = {
      key: worldActorCouplingKey(PC),
      owner: "world_state",
      facet: "world_fallback_physical_entity",
      version: 1,
      value: {
        actor_id: PC,
        actor_state: [{ owner: "named_actor", fact_key: "actor/x/capability-basis/c", version: 1 }],
        coupling: {
          world: { fact_key: worldProfileKey(W), entity_id: W },
          locus: { fact_key: worldLocusKey(W, "locus-coupling"), entity_id: "locus-coupling" },
        },
        pinned_versions: { world: 1, locus: 1 },
        custodian: {
          owner: "world_state",
          facet: "world_fallback_physical_entity",
          basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
        },
      },
    };
    const facts = new Map<string, unknown>([
      [binding.key, binding],
      [coupling.key, coupling],
    ]);
    const derived = derivePcPhysicalLocusCustody(PC, { getFact: (k) => facts.get(k) as never });
    expect(derived.ok && derived.value.stationary_locus.locus.entity_id).toBe("locus-coupling");
    // without a committed coupling or binding there is nothing to take a locus from, and none is invented
    expect(derivePcPhysicalLocusCustody(PC, { getFact: () => undefined }).ok).toBe(false);
    facts.delete(coupling.key);
    expect(derivePcPhysicalLocusCustody(PC, { getFact: (k) => facts.get(k) as never }).ok).toBe(
      false,
    );
  });

  it("the typed read by PC identity is the only current-locus answer: it is absent before establishment and never falls back to the binding or the coupling", async () => {
    const s = await handedOverCampaign();
    expect(s.campaign.pcPhysicalLocusCustody(PC)).toBeUndefined();
    // the binding's referent and the coupling exist, yet neither answers "where is the PC now?"
    expect(s.campaign.binding()).toBeDefined();
    expect(s.campaign.existingActorCoupling(PC)).toBeDefined();
    await must(establishCustody(s, 1));
    const answer = s.campaign.pcPhysicalLocusCustody(PC)!;
    expect(answer.fact.key).toBe(custodyKey());
    expect(answer.value.stationary_locus.locus.entity_id).toBe(L);
    expect(s.campaign.pcPhysicalLocusCustody("actor-other")).toBeUndefined();
  });

  it("establishment creates no movement, request, commitment, Logistics, Temporal or ECT-01 state and writes no Logistics, Temporal or PC-owner fact", async () => {
    const s = await handedOverCampaign();
    const before = snapshotFacts(s);
    const temporalBefore = s.coordinator.state()?.fact;
    const indexBefore = s.coordinator.boundaryIndex();
    await must(establishCustody(s, 1));
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added).toHaveLength(1);
    expect(added[0]!.owner).toBe("world_state");
    for (const f of s.campaign.store.listFacts()) {
      expect(f.owner, f.key).not.toBe("logistics");
      expect(f.key.startsWith("logistics/")).toBe(false);
      expect(f.key.startsWith("temporal/object/")).toBe(false);
      expect(/\/entity\/[^/]+(\/transition)?$/.test(f.key)).toBe(false);
      expect(f.key).not.toMatch(/movement|request|commitment|delivery/);
    }
    expect(s.coordinator.state()?.fact).toEqual(temporalBefore);
    expect(s.coordinator.boundaryIndex()).toEqual(indexBefore);
    // the PC's own capability slots are untouched
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
    ).toEqual([]);
  });

  it("re-presenting the committed intent (a lost reply) returns the original receipt and changes nothing", async () => {
    const s = await handedOverCampaign();
    await must(establishCustody(s, 1));
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(custodyKey())!);
    const again = await must(establishCustody(s, 1));
    expect(again.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(custodyKey())).toEqual(fact);
  });

  it("the actor identity used by the harness is the canonical continuing PC identity", () => {
    expect(PC).toBe(ACTOR_SMITH);
  });
});
