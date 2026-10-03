/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// PC capability profile — enforcement that does not depend on the coordinator or on the owner operation behaving. IM-11
// admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone (including the PC
// owner's own other facet and the Named-Actor owner); a capability is never conjured by a consequence, never overwritten,
// never held by two owners; hand-written temporal objects are refused; excluded mutation paths fail closed; and load-time
// verification fails closed on drift.
// Register lineage: IA-02, IA-03, IA-14, IA-06 (partial); RC-02, RC-03, RC-04, RC-07, RC-16; IM-02, IM-03, IM-07,
// IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  PopulationAdapter,
  TemporalCoordinator,
  stageGroupId,
  stageIntentId,
  verifyPcCapabilityIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CAP_LOCKSMITHING,
  CAP_NAVIGATION,
  CAP_SAILING,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  PC_CAP_OTHER_PC,
  SYNTH_ACTOR_HISTORY_OWNER,
  SYNTH_CAPABILITY_CONSUMER_OWNER,
  actorPublication,
  at,
  capabilityBasis,
  consumerAdvanceRequest,
  consumerResultKey,
  historyGroup,
  ledgerInput,
  pcCapabilityBasis,
  pcCapabilityConsumerObject,
  pcCapabilityContract,
  pcCapabilityProviders,
  pcCapabilityPublication,
  pcCloseConsumerDeclaration,
  pcNowConsumerDeclaration,
  popPublication,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import { NamedActorAdapter } from "@immortalis/engine";
import {
  receiveBasis,
  registerPcConsumer,
  seededPcCapabilityCampaign,
  type PcCapabilitySeeded,
} from "../support/pc-capability.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const P = FIXTURE_PC_ID;
const C = CAP_SAILING;
const capKey = pcCapabilityKey(P, C);
const basisKey = pcCapabilityBasisKey(P, C);
const contractKey = pcExistenceContractKey(P);
const stage = pcCapabilityStage(P, C);
const advance = (s: PcCapabilitySeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(consumerAdvanceRequest(id, consumer));

/** A raw group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  s: PcCapabilitySeeded,
  over: Partial<CommitGroup> & { key?: string; value?: unknown; expected_version?: number } = {},
  n = 900,
): CommitGroup {
  const { key, value, expected_version, ...group } = over;
  const owner = group.owner ?? "pc_existence";
  const facet = group.facet ?? "pc_capability_profile";
  const contract = s.campaign.store.getFact(contractKey);
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: PC_CAPABILITY_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    // a lawful basis group pins and depends on the PC's contract; tests override to break exactly one of these
    reads: contract ? [{ key: contractKey, version: contract.version }] : [],
    depends_on: contract ? [contract.provenance.group_id] : [],
    writes: [
      {
        key: key ?? basisKey,
        owner,
        facet,
        value: ("value" in over ? value : pcCapabilityBasis(P, C)) as never,
        unit: null,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

describe("owner exclusivity: only the one PC owner's capability facet writes PC capability state, and only its own", () => {
  it("every other registered owner/facet — including the PC owner's own Existence Contract facet — is refused both key spaces", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const owners: [string, string][] = [
      ["world_state", "world_profile"],
      ["world_state", "world_fallback_physical_entity"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["temporal_kernel", "temporal_coordination"],
      ["named_actor", "actor_profile"],
      ["population", "population_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["logistics", "logistics_state"],
      ["epistemic_access", "epistemic_access"],
      ["kti", "kti_development"],
      ["gip", "gip_institution_identity"],
      ["diplomacy", "diplomacy_framework"],
      ["causal_draw_kernel", "draw_provenance"],
      [SYNTH_ACTOR_HISTORY_OWNER, "synthetic-actor-history"],
      [SYNTH_CAPABILITY_CONSUMER_OWNER, "synthetic-capability-consumer"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      for (const key of [basisKey, capKey])
        expect(
          await codeOf(s.campaign.store.commit(raw(s, { owner, facet, key }, n++))),
          `${owner}/${facet} → ${key}`,
        ).toBe("KEY_NOT_ADMITTED");
    expect(s.pcs.basis(P, C)).toBeUndefined();
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no second PC capability owner and no generic fallback", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    for (const [owner, facet] of [
      ["pc", "pc_capability_profile"],
      ["pc_capability", "pc_capability_profile"],
      ["pc_capability_owner", "capability"],
      ["pc_existence", "capability"],
      ["pc_existence", "pc_capability"],
      ["pc_existence", "capability_profile"],
      ["generic", "fallback"],
      ["character_capability", "pc_capability_profile"],
      ["kti", "pc_capability_profile"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { owner, facet }, 1))),
        owner + facet,
      ).toBe("OWNER_NOT_REGISTERED");
  });

  it("the PC capability facet cannot write the Existence Contract, a foreign key space, nor an unmodelled pc key (development, handover, transcript…)", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    for (const key of [
      contractKey,
      pcExistenceContractKey("p2"),
      "world/w1/profile",
      "role-registry/binding/role.player_character",
      "population/l1/ledger",
      "production/reserve/r1",
      "actor/a1/capability/c1",
      "actor/a1/capability-basis/c1",
      "temporal/state",
      "synthetic-capability-consumer/result/x",
      "pc/p1/capability",
      "pc/p1/capability/c1/extra",
      "pc/p1/capability-basis",
      "pc/p1/development/c1",
      "pc/p1/amendment/c1",
      "pc/p1/generation-transcript",
      "pc/p1/capability-profile/c1",
      "pc/p1",
      "pcs/p1/capability/c1",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("the Existence Contract's own facet cannot write a capability key, and a PC key the capability facet holds cannot be taken over", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    const g = raw(s, {
      owner: "world_state",
      facet: "world_profile",
      key: basisKey,
      expected_version: 1,
    });
    expect(await codeOf(s.campaign.store.commit(g))).toBe("FACT_OWNER_CONFLICT");
    const contractHeld = raw(s, {
      owner: "pc_existence",
      facet: "pc_capability_profile",
      key: contractKey,
      expected_version: 1,
      value: pcCapabilityContract(),
    });
    expect(await codeOf(s.campaign.store.commit(contractHeld))).toMatch(
      /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
    );
    expect(s.campaign.store.getFact(contractKey)!.version).toBe(1);
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona or player role writes nothing", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { authority }, 3)))).toBe(
        "AUTHORITY_DENIED",
      );
  });

  it("the PC capability adapter exposes one receiving publication and no capability writer, setter, development, loss, derivation, handover or lifecycle method", async () => {
    const { PcCapabilityAdapter } = await import("@immortalis/engine");
    const methods = adapterMethods(PcCapabilityAdapter);
    expect(methods).toEqual(expectedAdapterMethods("PcCapabilityAdapter"));
    expect(
      methods.filter((m) =>
        /set|update|write|develop|promote|lose|loss|decay|train|advance|grade|rank|tick|sweep|copy|transfer|derive|handover|amend|revel|draw|random/i.test(
          m,
        ),
      ),
    ).toEqual([]);
  });
});

describe("raw and tampered values are refused by IM-11", () => {
  const valueFor = (over: any) => ({ ...pcCapabilityBasis(P, C), ...over });
  const establishmentFor = (over: any) =>
    valueFor({ establishment: { ...pcCapabilityBasis(P, C).establishment, ...over } });

  it("a basis with a malformed or foreign value is refused: no number, no non-ladder marker, no unmodelled field", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    for (const bad of [
      valueFor({ marker: "S+" }),
      valueFor({ marker: 3 }),
      valueFor({ marker: "EX" }),
      valueFor({ marker: { ex: "" } }),
      { pc_id: P, capability_id: C, establishment: pcCapabilityBasis(P, C).establishment },
      valueFor({ level: 3 }),
      valueFor({ xp: 10 }),
      valueFor({ cohort_id: "cohort-1" }),
      valueFor({ equipment: "a sword" }),
      valueFor({ scope: "coastal" }),
      valueFor({ constraints: [] }),
      valueFor({ generation_transcript: "the exact dialogue" }),
      valueFor({ materiality: "ROLE_DEFINING" }),
      establishmentFor({ claims: [] }),
      establishmentFor({ claims: [{ section: "baseline_exception.hypotheses", index: 0 }] }),
      establishmentFor({ claims: [{ section: "baseline_exception.unresolved", index: 0 }] }),
      establishmentFor({ claims: [{ section: "identity_agency", index: -1 }] }),
      establishmentFor({ claims: [{ section: "identity_agency", index: 0.5 }] }),
      establishmentFor({ claims: [{ section: "identity_agency", index: 0, statement: "copy" }] }),
      establishmentFor({
        claims: [
          { section: "identity_agency", index: 0 },
          { section: "identity_agency", index: 0 },
        ],
      }),
      establishmentFor({ contract: { fact_key: contractKey, version: 0 } }),
      establishmentFor({ contract: { fact_key: contractKey } }),
      "C",
      null,
      [],
      {},
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { value: bad }))),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    expect(s.pcs.basis(P, C)).toBeUndefined();
  });

  it("every excluded establishment method is unrepresentable: deferred derivation, delegation, development, handover, randomization, derived-from-fame", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const method of [
      "DEFERRED_DERIVATION",
      "DELEGATED_BRANCH",
      "DEVELOPMENT",
      "INTRINSIC_AMENDMENT_EVENT",
      "EXISTING_ACTOR_HANDOVER",
      "BOUNDED_PRIOR_RANDOMIZED",
      "CAUSALLY_DETERMINED",
      "REPUTATION",
    ]) {
      const bad = establishmentFor({ method });
      expect(await codeOf(s.campaign.store.commit(raw(s, { value: bad }))), method).toBe(
        "VALUE_INVALID",
      );
      const r = await s.pcs.receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: bad,
      });
      expect(!r.ok && r.error.code, method).toBe("INPUT_INVALID");
    }
    // a randomized establishment carries a draw: unrepresentable here
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            value: establishmentFor({
              method: "BOUNDED_PRIOR_RANDOMIZED",
              draw: { draw_id: "cdraw:v1:" + "0".repeat(64) },
            }),
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });

  it("a mismatch between the key's identities and the value's identities is refused for both kinds", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: pcCapabilityBasisKey("p-other", C) }))),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: pcCapabilityBasisKey(P, "c-other") }))),
    ).toBe("VALUE_INVALID");
    await receiveBasis(s, 1);
    const cap = {
      pc_id: P,
      capability_id: C,
      marker: "C",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "PC Capability Close", stage },
    };
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { key: pcCapabilityKey("p-other", C), value: cap })),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { key: pcCapabilityKey(P, "c-other"), value: cap })),
      ),
    ).toBe("VALUE_INVALID");
  });

  it("the close name is exactly the F-016 PCC-02 literal: a capability naming the F-014A actor-profile close, or any other, is refused", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    for (const name of [
      "actor-profile-capability-close",
      "pc-capability-close",
      "PC capability close",
      "pc capability close",
      "",
    ])
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(s, {
              key: capKey,
              value: {
                pc_id: P,
                capability_id: C,
                marker: "C",
                basis: { fact_key: basisKey, version: 1 },
                close: { name, stage },
              },
            }),
          ),
        ),
        name,
      ).toBe("VALUE_INVALID");
  });

  it("a basis cannot be committed in the capability key space, nor a capability in the basis key space", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    expect(await codeOf(s.campaign.store.commit(raw(s, { key: capKey })))).toBe("VALUE_INVALID");
    expect(
      await codeOf(s.campaign.store.commit(raw(s, { key: basisKey, value: { pc_id: P } }))),
    ).toBe("VALUE_INVALID");
  });

  it("a group that writes anything but one create-only basis or one capability close is refused", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const w = raw(s).writes[0]!;
    const two = raw(s, {
      writes: [
        w,
        {
          ...w,
          key: pcCapabilityBasisKey(P, "c-second"),
          value: pcCapabilityBasis(P, "c-second") as never,
        },
      ],
    });
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
    // a basis together with the Existence Contract it cites, or with the capability it would publish, is no lawful group
    const withContract = raw(s, {
      writes: [
        w,
        {
          ...w,
          owner: "pc_existence",
          facet: "existence_contract",
          key: contractKey,
          value: pcCapabilityContract() as never,
          expected_version: 1,
        },
      ],
    });
    expect(await codeOf(s.campaign.store.commit(withContract))).not.toBe("OK");
    expect(s.campaign.store.getFact(contractKey)!.version).toBe(1);
  });
});

describe("lawful receiving: an already-established capability of this PC, pinned to its own released Existence Contract", () => {
  it("a PC with no committed Existence Contract has no capability: nothing is established from nothing", async () => {
    const s = await seededPcCapabilityCampaign(tempDir(), { releasePc: false });
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pcCapabilityBasis(P, C),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(2),
          capability: pcCapabilityBasis("pc-ghost", C),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.pcs.basis(P, C)).toBeUndefined();
  });

  it("a released-but-unbound PC and a bound PC are both lawful subjects: the capability is the PC's intrinsic state, not the binding's", async () => {
    const bound = await seededPcCapabilityCampaign(tempDir());
    const unbound = await seededPcCapabilityCampaign(tempDir(), { bind: false });
    await receiveBasis(bound, 1);
    await receiveBasis(unbound, 1);
    expect(bound.pcs.basis(P, C)).toBeDefined();
    expect(unbound.pcs.basis(P, C)).toBeDefined();
    expect(unbound.campaign.verify()).toEqual([]);
  });

  it("the establishment must pin THIS PC's own contract at its exact committed version, read and depended on by the group", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(7),
        contract: pcCapabilityContract(PC_CAP_OTHER_PC),
      }),
    );
    const base = pcCapabilityBasis(P, C);
    const pinning = (over: any) => ({
      ...base,
      establishment: { ...base.establishment, ...over },
    });
    // another PC's contract is no establishment of this PC
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pinning({
            contract: { fact_key: pcExistenceContractKey(PC_CAP_OTHER_PC), version: 1 },
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // a version that is not the committed one
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(2),
          capability: pinning({ contract: { fact_key: contractKey, version: 2 } }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // a raw group that does not read, or does not depend on, the contract
    expect(await codeOf(s.campaign.store.commit(raw(s, { reads: [], depends_on: [] })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit(raw(s, { depends_on: [] }, 901)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { reads: [{ key: contractKey, version: 7 }] }, 902)),
      ),
    ).toBe("STALE_READ");
    // the contract of another PC pinned for this PC, even when read and depended on
    const other = s.campaign.store.getFact(pcExistenceContractKey(PC_CAP_OTHER_PC))!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            {
              value: pinning({
                contract: { fact_key: other.key, version: other.version },
              }),
              reads: [{ key: other.key, version: other.version }],
              depends_on: [other.provenance.group_id],
            },
            903,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.pcs.basis(P, C)).toBeUndefined();
  });

  it("only an ACCEPTED claim of the contract can establish: a claim that does not exist is refused — no hypothesis, no unresolved item, no convenient past", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const claims = (cs: any[]) => ({
      ...pcCapabilityBasis(P, C),
      establishment: { ...pcCapabilityBasis(P, C).establishment, claims: cs },
    });
    let n = 1;
    for (const bad of [
      [{ section: "baseline_exception.player_overrides", index: 2 }],
      [{ section: "baseline_exception.safely_inherited", index: 1 }],
      [{ section: "entry_envelope", index: 1 }],
      [{ section: "identity_agency", index: 1 }],
      [{ section: "contact", index: 1 }],
      [
        { section: "baseline_exception.player_overrides", index: 0 },
        { section: "baseline_exception.player_overrides", index: 9 },
      ],
    ])
      expect(
        await codeOf(
          s.pcs.receiveCapabilityBasis({
            ...pcCapabilityPublication(n++),
            capability: claims(bad),
          }),
        ),
        JSON.stringify(bad),
      ).toBe("REFERENCE_INVALID");
    // a contract with no player overrides cannot establish anything from them
    const bare = await seededPcCapabilityCampaign(tempDir(), {
      contract: pcCapabilityContract(P, {
        baseline_exception: {
          safely_inherited: [],
          player_overrides: [],
          hypotheses: ["SYNTHETIC FIXTURE: never accepted."],
          unresolved: [],
        },
      }),
    });
    expect(
      await codeOf(
        bare.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pcCapabilityBasis(P, C),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // every locator of the accepted places resolves
    let m = 20;
    for (const ok of [
      { section: "identity_agency", index: 0 },
      { section: "contact", index: 0 },
      { section: "embodiment_topology", index: 0 },
      { section: "continuity_rule", index: 0 },
      { section: "baseline_exception.safely_inherited", index: 0 },
      { section: "baseline_exception.player_overrides", index: 1 },
      { section: "entry_envelope", index: 0 },
    ])
      expect(
        await codeOf(
          s.pcs.receiveCapabilityBasis({
            ...pcCapabilityPublication(m),
            capability: {
              ...pcCapabilityBasis(P, `cap-${m++}`),
              establishment: { ...pcCapabilityBasis(P, C).establishment, claims: [ok] },
            },
          }),
        ),
        JSON.stringify(ok),
      ).toBe("OK");
  });

  it("the Named-Actor owner already holding this identity's capability blocks the PC owner: one capability, one owner; the handover is not implemented", async () => {
    const s = await seededPcCapabilityCampaign(tempDir(), { releasePc: false });
    // the identity is a Named Actor first (lawful: no Existence Contract yet)
    for (const [i, id] of [`${P}-biography`, `${P}-occupation`].entries())
      await must(s.campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, 50 + i, id)));
    const actors = new NamedActorAdapter(s.campaign.store);
    await must(
      actors.establishCapabilityBasis({
        ...actorPublication(1),
        capability: capabilityBasis(P, C, {}, [`${P}-biography`, `${P}-occupation`]),
      }),
    );
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: pcCapabilityContract() }),
    );
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pcCapabilityBasis(P, C),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(s.pcs.basis(P, C)).toBeUndefined();
    // the actor's fact is untouched, and the actor owner still holds its own capability
    expect(s.campaign.store.getFact(actorCapabilityBasisKey(P, C))).toBeDefined();
    // another capability of the identity is the PC owner's to receive (the actor owner holds nothing of it)
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(2),
          capability: pcCapabilityBasis(P, CAP_NAVIGATION),
        }),
      ),
    ).toBe("OK");
  });

  it("a capability the Named-Actor owner holds as a persisted capability blocks the PC owner just the same", async () => {
    const s = await seededPcCapabilityCampaign(tempDir(), { releasePc: false });
    for (const [i, id] of [`${P}-biography`, `${P}-occupation`].entries())
      await must(s.campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, 50 + i, id)));
    // a raw capability fact of the actor owner cannot be written without its basis; the basis alone already blocks
    expect(actorCapabilityKey(P, C)).toBe(`actor/${P}/capability/${C}`);
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            owner: "named_actor",
            facet: "actor_profile",
            key: actorCapabilityKey(P, C),
            value: {},
          }),
        ),
      ),
    ).not.toBe("OK");
  });

  it("a PC capability, once held, keeps the Named-Actor owner out: the PC identity is no Named-Actor subject", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    for (const [i, id] of [`${P}-biography`, `${P}-occupation`].entries())
      await must(s.campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, 50 + i, id)));
    const actors = new NamedActorAdapter(s.campaign.store);
    expect(
      await codeOf(
        actors.establishCapabilityBasis({
          ...actorPublication(1),
          capability: capabilityBasis(P, C, {}, [`${P}-biography`, `${P}-occupation`]),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("a Population ledger's identity is an aggregate: no individual mastery record is received for it", async () => {
    const s = await seededPcCapabilityCampaign(tempDir(), { releasePc: false });
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: pcCapabilityContract("ledger-main"),
      }),
    );
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pcCapabilityBasis("ledger-main", C),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("the basis is sealed and one per PC/capability: a second is a conflict, an overwrite is an unsupported amendment", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    expect(
      await codeOf(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(2),
          capability: pcCapabilityBasis(P, C, { marker: "S" }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { expected_version: 1, value: pcCapabilityBasis(P, C, { marker: "S" }) }),
        ),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.pcs.basis(P, C)!.value.marker).toBe("C");
  });

  it("no capability exists without its received basis: a raw capability, even exactly shaped, has nothing to derive from", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const cap = {
      pc_id: P,
      capability_id: C,
      marker: "S",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "PC Capability Close", stage },
    };
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            key: capKey,
            value: cap,
            reads: [],
            depends_on: [],
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-fake",
          }),
        ),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.pcs.capability(P, C)).toBeUndefined();
  });

  it("a dependent consequence cannot conjure the capability it needs: its object is refused without a received basis", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const wanted = pcCapabilityBasis(P, C, { marker: "S" });
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(2),
          object: pcCapabilityConsumerObject("c1", wanted),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
  });
});

describe("the PC Capability Close is exactly its basis, only as its stage, under an open transaction", () => {
  it("a stage group whose value is not what the basis determines publishes nothing: a tampered marker, pin, identity or close is refused", async () => {
    const mutations: Record<string, (v: any) => any> = {
      "marker upgraded": (v) => ({ ...v, marker: "S" }),
      "marker removed": (v) => ({ ...v, marker: null }),
      "pin to another version": (v) => ({ ...v, basis: { ...v.basis, version: 2 } }),
      "close stage altered": (v) => ({
        ...v,
        close: { ...v.close, stage: { ...v.close.stage, causal_process_id: "x" } },
      }),
      "another PC": (v) => ({ ...v, pc_id: PC_CAP_OTHER_PC }),
      "an extra field": (v) => ({ ...v, level: 4 }),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededPcCapabilityCampaign(tempDir());
      const basis = await receiveBasis(s, 1);
      await registerPcConsumer(s, "c1", basis, 2);
      const t = tamperStore(s.campaign.store, "pc_existence", (g) => ({
        ...g,
        writes: g.writes.map((w) => ({ ...w, value: mutate(w.value) })),
      }));
      const r = await must(
        new TemporalCoordinator(t.store, pcCapabilityProviders()).advance(
          consumerAdvanceRequest("tx-1", "c1"),
        ),
      );
      expect(t.tampered(), name).toBe(1);
      expect(
        r.rejections.map((x) => x.code),
        name,
      ).toEqual([expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/)]);
      expect(s.pcs.capability(P, C), name).toBeUndefined();
      expect(s.campaign.store.getFact(consumerResultKey("c1")), name).toBeUndefined();
      expect(r.transaction.outcome.stop_reason, name).toBe("DEPENDENCY_UNRESOLVED");
      await s.campaign.close();
    }
  });

  it("a stage commits only under the stage identity and a durable open transaction authority: a forged or absent cause publishes nothing", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    const basis = s.pcs.basis(P, C)!;
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const value = {
      pc_id: P,
      capability_id: C,
      marker: "C",
      basis: { fact_key: basisKey, version: 1 },
      close: { name: "PC Capability Close", stage },
    };
    const base = {
      key: capKey,
      value,
      reads: [{ key: basisKey, version: 1 }],
      depends_on: [basis.fact.provenance.group_id],
    };
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: "g-ordinary",
            intent_id: "i-ordinary",
            cause: "transaction:tx-x",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-never-opened",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "someone-said-so",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            ...base,
            reads: [
              { key: basisKey, version: 1 },
              { key: clock.key, version: clock.version },
            ],
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:tx-never-opened",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.pcs.capability(P, C)).toBeUndefined();
  });

  it("a committed capability is sealed: development, mastery loss or any rewrite is an unsupported amendment, even through the owner", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const committed = s.pcs.capability(P, C)!;
    for (const marker of ["B", "A", "S", "C", null, { ex: "SYNTHETIC FIXTURE: descriptor" }])
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(s, { key: capKey, expected_version: 1, value: { ...committed.value, marker } }),
          ),
        ),
        JSON.stringify(marker),
      ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.pcs.capability(P, C)).toEqual(committed);
  });
});

describe("temporal registration: a PC capability is visible cross-owner only AS-OF-DECLARED-CLOSE", () => {
  it("refuses a consequence that reads the capability AS-OF-NOW, one that reads the uncommitted basis, a borrowed close name and a PC-owned object", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    const reg = (over: any, n: number) =>
      codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(n),
          object: pcCapabilityConsumerObject("c1", basis, over),
        }),
      );
    const stageDecl = pcCapabilityConsumerObject("c1", basis).dependencies[0]!;
    const consumerDecl = pcCapabilityConsumerObject("c1", basis).dependencies[1]!;
    expect(await reg({ dependencies: [stageDecl, pcNowConsumerDeclaration("c1", P, C)] }, 2)).toBe(
      "REFERENCE_INVALID",
    );
    // the uncommitted basis is no cross-owner read
    const basisRead = {
      ...consumerDecl,
      reads: [
        {
          mode: "AS-OF-NOW",
          source: { owner: "pc_existence", fact_key: basisKey },
          invalidators: [],
        },
      ],
    };
    expect(await reg({ dependencies: [stageDecl, basisRead] }, 3)).toBe("REFERENCE_INVALID");
    expect(await reg({ owning_ref: { owner: "pc_existence", process_id: "p" } }, 4)).toBe(
      "REFERENCE_INVALID",
    );
    // a close read naming another close (the F-014A actor-profile close) is no PC Capability Close read
    const borrowed = {
      ...consumerDecl,
      reads: [
        {
          ...pcCloseConsumerDeclaration("c1", P, C).reads[0]!,
          close_basis: {
            name: "actor-profile-capability-close",
            producer: { owner: "pc_existence", operation: "pc-publish-capability-close" },
          },
        },
      ],
    };
    expect(await reg({ dependencies: [stageDecl, borrowed] }, 5)).toBe("REFERENCE_INVALID");
    // the close stage without its declared read
    expect(
      await reg(
        { dependencies: [{ ...stageDecl, reads: [] }, pcCloseConsumerDeclaration("c1", P, C)] },
        6,
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
    ).toEqual([]);
    // the lawful shape is accepted
    expect(await reg({}, 7)).toBe("OK");
  });

  it("the Existence Contract's own reads are untouched by the PC capability rule", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    const decl = pcCapabilityConsumerObject("c1", basis).dependencies[1]!;
    const contractRead = {
      ...decl,
      reads: [
        ...decl.reads,
        {
          mode: "AS-OF-NOW",
          source: { owner: "pc_existence", fact_key: contractKey },
          invalidators: [],
        },
      ],
    };
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(2),
          object: pcCapabilityConsumerObject("c1", basis, {
            dependencies: [
              pcCapabilityConsumerObject("c1", basis).dependencies[0]!,
              contractRead as never,
            ],
          }),
        }),
      ),
    ).toBe("OK");
  });

  it("a consequence whose PC Capability Close is not declared is unresolved — fail closed — and publishes nothing", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    const consumerOnly = pcCapabilityConsumerObject("c1", basis).dependencies[1]!;
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: pcCapabilityConsumerObject("c1", basis, { dependencies: [consumerOnly] }),
      }),
    );
    const before = s.campaign.store.head().revision;
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents[0]!.reason).toBe("PREDECESSOR_ABSENT");
    expect(s.pcs.capability(P, C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c1"))).toBeUndefined();
    // only the transaction's own kernel records were written
    const added = s.campaign.store
      .listFacts()
      .filter((f) => s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision > before);
    expect(added.every((f) => f.owner === "temporal_kernel")).toBe(true);
  });

  it("no same-resolution feedback: nothing in a resolution can change a capability, and a consumer reads only the close that preceded it", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    // a consumer stage that tries to produce the PC capability key itself (a same-resolution write-back) is refused at
    // registration, by the temporal object contract or the PC registration rule — never accepted
    const decl = pcCapabilityConsumerObject("c2", basis).dependencies[1]!;
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(3),
          object: pcCapabilityConsumerObject("c2", basis, {
            next_boundary: { boundary_id: "b-c2", at: at(170) },
            dependencies: [{ ...decl, produces: [capKey] }],
          }),
        }),
      ),
    ).not.toBe("OK");
    const r = await must(advance(s));
    // the consumer's realized read names exactly the close committed earlier in the same transaction, at version 1
    expect(r.transaction.stages[1]!.reads[0]).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source_basis: { version: 1, committed_by: stageGroupId(stage) },
    });
    expect(s.pcs.capability(P, C)!.fact.version).toBe(1);
  });
});

describe("one PC identity: an Existence Contract's capability never becomes a second owner's state", () => {
  it("the PC capability facet writes only its own key spaces and leaves the Existence Contract, the binding and every actor key byte-identical", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const before = s.campaign.store
      .listFacts()
      .filter((f) => !f.key.startsWith("temporal/"))
      .map((f) => structuredClone(f));
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(advance(s));
    for (const f of before) expect(s.campaign.store.getFact(f.key)).toEqual(f);
    const added = s.campaign.store
      .listFacts()
      .filter((f) => !before.some((b) => b.key === f.key) && !f.key.startsWith("temporal/"));
    expect(added.map((f) => f.key).sort()).toEqual(
      [basisKey, capKey, consumerResultKey("c1")].sort(),
    );
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("actor/"))).toEqual([]);
  });
});

describe("identity, stage and source churn are not capability identity", () => {
  it("the requested horizon never changes the capability close's identity or value", async () => {
    const ids: string[] = [];
    const values: unknown[] = [];
    for (const target of [200, 260, 400]) {
      const s = await seededPcCapabilityCampaign(tempDir());
      const basis = await receiveBasis(s, 1);
      await registerPcConsumer(s, "c1", basis, 2);
      const r = await must(
        s.coordinator.advance(
          consumerAdvanceRequest("tx-1", "c1", {
            requested: {
              target: at(target),
              condition: {
                kind: "STOP_AFTER_BOUNDARY",
                object_id: "capability-consumer-obj-c1",
                boundary_id: "capability-consumer-boundary-c1",
              },
            },
          }),
        ),
      );
      ids.push(r.transaction.stages[0]!.group_id);
      values.push(s.pcs.capability(P, C)!.value);
      await s.campaign.close();
    }
    expect(new Set(ids)).toEqual(new Set([stageGroupId(stage)]));
    expect(new Set(values.map((v) => JSON.stringify(v))).size).toBe(1);
  });

  it("the stage identity is derived from the PC and capability alone", () => {
    expect(stage).toEqual({
      causal_process_id: `pc-capability/${P}/${C}`,
      owner_operation: { owner: "pc_existence", operation: "pc-publish-capability-close" },
      prospective_result_id: capKey,
    });
    expect(pcCapabilityStage(P, CAP_LOCKSMITHING)).not.toEqual(stage);
  });
});

describe("load-time verification fails closed on PC capability drift", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    if (opts.complete !== false) await must(advance(s));
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
    const out = verifyPcCapabilityIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify before the close and after it", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });

  it("detects a capability that is not what its basis determines, or whose pin or close reference drifted", async () => {
    for (const f of [
      (v: any) => (v.marker = "S"),
      (v: any) => (v.marker = null),
      (v: any) => (v.basis.version = 2),
      (v: any) => (v.basis.fact_key = pcCapabilityBasisKey(P, "other")),
      (v: any) => (v.close.stage.causal_process_id = "elsewhere"),
      (v: any) => (v.close.stage.prospective_result_id = pcCapabilityKey(P, "other")),
    ])
      expect(await drifted(edit(capKey, f))).not.toBe("");
  });

  it("detects a capability with no basis, a basis whose contract is missing, drifted or not cited as accepted, and a contract not committed first", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== basisKey))).toMatch(
      /no committed received basis/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== contractKey))).toMatch(
      /Existence Contract is not committed/,
    );
    expect(await drifted(edit(contractKey, (_v, fact) => (fact.owner = "world_state")))).toMatch(
      /not committed by the PC owner/,
    );
    expect(await drifted(edit(contractKey, (_v, fact) => (fact.version = 2)))).toMatch(
      /exact version/,
    );
    expect(
      await drifted(edit(contractKey, (v) => (v.baseline_exception.player_overrides = []))),
    ).toMatch(/not an accepted claim/);
    expect(
      await drifted(
        edit(basisKey, (v) => (v.establishment.contract.fact_key = pcExistenceContractKey("x"))),
      ),
    ).toMatch(/own Existence Contract/);
    // a contract that is really a later commit than the basis that cites it: ordering is judged by receipts
    expect(
      await drifted(
        edit(contractKey, (_v, fact) => (fact.provenance.intent_id = "pccap-intent-1")),
      ),
    ).not.toBe("");
  });

  it("detects a capability that is no stage (provenance drift) and one that no transaction credits and no object awaits", async () => {
    expect(
      await drifted(edit(capKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).not.toBe("");
    expect(
      await drifted(edit(capKey, (_v, fact) => (fact.provenance.intent_id = "raw-intent"))),
    ).not.toBe("");
    expect(
      await drifted((f) =>
        f.filter(
          (x) =>
            !x.key.startsWith("temporal/transaction/") ||
            x.key.startsWith("temporal/transaction-authority/"),
        ),
      ),
    ).toMatch(/credited by no resolution transaction/);
  });

  it("detects a second owner of the same capability: a Named-Actor fact, or a Population ledger, that stood when the record was committed", async () => {
    const early = (facts: OwnerFact[]) =>
      facts.find((x) => x.key.startsWith("world/"))!.provenance.intent_id;
    const addAt = (key: string) => (facts: OwnerFact[]) => {
      const template = structuredClone(facts.find((x) => x.key.startsWith("world/"))!);
      return [
        ...facts,
        { ...template, key, provenance: { ...template.provenance, intent_id: early(facts) } },
      ];
    };
    expect(await drifted(addAt(actorCapabilityBasisKey(P, C)))).toMatch(
      /already held by the Named-Actor owner/,
    );
    expect(await drifted(addAt(actorCapabilityKey(P, C)))).toMatch(
      /already held by the Named-Actor owner/,
    );
    expect(await drifted(addAt(`population/${P}/ledger`))).toMatch(/Population ledger/);
  });

  it("detects a hand-written object that reads the capability AS-OF-NOW or the basis, or a standalone PC-owned object", async () => {
    const tamper = (f: (o: any) => void) => (facts: OwnerFact[]) => {
      const obj = facts.find((x) => x.key.startsWith("temporal/object/"))!;
      f(obj.value);
      return facts;
    };
    expect(
      await drifted(tamper((o) => (o.dependencies[1] = pcNowConsumerDeclaration("c1", P, C)))),
    ).toMatch(/AS-OF-DECLARED-CLOSE/);
    expect(
      await drifted(
        tamper(
          (o) =>
            (o.dependencies[1] = {
              ...o.dependencies[1],
              reads: [
                {
                  mode: "AS-OF-NOW",
                  source: { owner: "pc_existence", fact_key: basisKey },
                  invalidators: [],
                },
              ],
            }),
        ),
      ),
    ).toMatch(/not a cross-owner read/);
    expect(
      await drifted(tamper((o) => (o.owning_ref = { owner: "pc_existence", process_id: "p" }))),
    ).toMatch(/no standalone/);
  });
});
