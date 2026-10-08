/* eslint-disable @typescript-eslint/no-explicit-any -- tests present forged and tampered values on purpose */
// Active-PC Post-Handover Physical Locus Custody — enforcement. Every refusal leaves the store untouched (no partial custody, no
// repaired locus, no invented identity, authority or provenance), and a raw `store.commit` cannot bypass what the owner path
// refuses. Register lineage: IA-01/02/03/14 (partial); RC-02, RC-07, RC-13; IM-03, IM-11.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
} from "@immortalis/contracts";
import { factKind, pcPhysicalLocusCustodyViolation } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  group,
  publication,
  write,
} from "@immortalis/testkit";
import {
  establishActorBasis,
  readyForHandover,
  seededExistingActorCampaign,
  coupleActor,
  actorBasisPin,
} from "../support/existing-actor.ts";
import {
  PC,
  custodyKey,
  custodyPublication,
  establishCustody,
  handedOverCampaign,
  rawCustody,
  snapshotFacts,
} from "../support/pc-locus-custody.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;

const refused = async (
  s: Awaited<ReturnType<typeof handedOverCampaign>>,
  attempt: () => Promise<{ ok: boolean; error?: { code: string } }>,
) => {
  const head = s.campaign.store.head();
  const facts = snapshotFacts(s);
  const r = await attempt();
  expect(r.ok).toBe(false);
  expect(s.campaign.store.head()).toEqual(head);
  expect(snapshotFacts(s)).toEqual(facts);
  expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
  return r.error?.code;
};

describe("no lawful completed handover, no custody", () => {
  it("no active binding (NULL state): fails closed, nothing written", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s); // compiled and coupled, but the binding is still NULL
    const head = s.campaign.store.head();
    const r = await establishCustody(s, 1);
    expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("a PC activated by ordinary first ACTIVATION (no consumed coupling) cannot have custody inferred from the binding's referent", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }),
    );
    await must(
      s.campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: FIXTURE_PC_ID,
        world_id: W,
        locus_id: L,
        insertion: fixtureInsertionFact(),
      }),
    );
    const head = s.campaign.store.head();
    const r = await establishCustody(s, 1, FIXTURE_PC_ID);
    expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(head);
    // and a forged record over that binding, with the binding's own referent lifted in as the "locus", is refused by admission
    const store = s.campaign.store;
    const keys = [
      pcExistenceContractKey(FIXTURE_PC_ID),
      PLAYER_CHARACTER_BINDING_KEY,
      worldProfileKey(W),
      worldLocusKey(W, L),
    ];
    const forged = group(
      FIXTURE_CAMPAIGN,
      90,
      [
        write(
          custodyKey(FIXTURE_PC_ID),
          {
            pc_id: FIXTURE_PC_ID,
            stationary_locus: s.campaign.binding()!.value.coupling,
            basis: {
              established_from: "EXISTING_ACTOR_HANDOVER",
              pinned_versions: { pc: 1, binding: 1, coupling: 0, world: 1, locus: 1 },
            },
            custodian: {
              owner: "world_state",
              facet: "world_fallback_physical_entity",
              basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
            },
          } as never,
          { owner: "world_state", facet: "world_fallback_physical_entity" },
        ),
      ],
      {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        rule: factKind("world_pc_locus_custody").rule,
        reads: keys.map((k) => ({ key: k, version: store.getFact(k)!.version })),
        depends_on: keys.map((k) => store.getFact(k)!.provenance.group_id),
      },
    );
    expect((await store.commit(forged)).ok).toBe(false);
    expect(store.head()).toEqual(head);
  });

  it("compiled and coupled but not yet handed over: the prior owner remains writable and no custody can be established", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    expect((await establishCustody(s, 1)).ok).toBe(false);
    expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
  });

  it("a PC identity other than the active PC's fails closed, even when that actor is itself compiled and coupled", async () => {
    const s = await handedOverCampaign();
    await establishActorBasis(s, 5, ACTOR_OTHER);
    await must(coupleActor(s, 5, ACTOR_OTHER));
    const code = await refused(s, () => establishCustody(s, 1, ACTOR_OTHER) as never);
    expect(code).toBe("PREREQUISITE_MISSING");
    // the raw path: a record for the other identity is refused for the same reason
    const forged = rawCustody(s, 2, PC, (v) => (v.pc_id = ACTOR_OTHER));
    expect((await s.campaign.store.commit(forged)).ok).toBe(false);
    expect(actorBasisPin(ACTOR_OTHER).fact_key).toContain(ACTOR_OTHER);
  });

  it("an identity with no coupling, no contract or no binding at all is refused with no invented locus", async () => {
    const s = await handedOverCampaign();
    expect(await refused(s, () => establishCustody(s, 1, "actor-nobody") as never)).toBe(
      "PREREQUISITE_MISSING",
    );
  });

  it("caller-supplied locus, world, destination or movement fields are not accepted: the input is the identity only", async () => {
    const s = await handedOverCampaign();
    for (const extra of [
      { locus_id: "locus-elsewhere" },
      { world_id: W },
      { destination: "locus-elsewhere" },
      { route: ["a", "b"] },
      { duration: 10 },
      { movement: "go" },
    ]) {
      const r = await s.campaign.establishPcPhysicalLocusCustody({
        ...custodyPublication(1),
        pc_id: PC,
        ...extra,
      } as never);
      expect(!r.ok && r.error.code).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
  });
});

describe("one custody record, never a rival", () => {
  it("a second establishment under a new intent is a version conflict: one slot per PC identity", async () => {
    const s = await handedOverCampaign();
    await must(establishCustody(s, 1));
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(custodyKey())!);
    const r = await establishCustody(s, 2);
    expect(!r.ok && r.error.code).toBe("VERSION_CONFLICT");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(custodyKey())).toEqual(fact);
  });

  it("the record is sealed: an amendment, a relocation of the stationary locus or an overwrite is refused", async () => {
    const s = await handedOverCampaign();
    await must(establishCustody(s, 1));
    await must(
      s.campaign.establishLocus({
        ...publication(7),
        locus: fixtureLocus({ locus_id: "locus-fixture-2" }),
      }),
    );
    const head = s.campaign.store.head();
    const amend = rawCustody(s, 3, PC, (v) => {
      v.stationary_locus.locus = {
        fact_key: worldLocusKey(W, "locus-fixture-2"),
        entity_id: "locus-fixture-2",
      };
    });
    amend.writes[0]!.expected_version = 1;
    expect((await s.campaign.store.commit(amend)).ok).toBe(false);
    const overwrite = rawCustody(s, 4);
    expect((await s.campaign.store.commit(overwrite)).ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.pcPhysicalLocusCustody(PC)!.value.stationary_locus.locus.entity_id).toBe(L);
  });

  it("another current-locus authority for the identity — a fallback entity, an ECT-01 transition or a Logistics commitment or transfer — refuses the custody", async () => {
    const s = await handedOverCampaign();
    const custody = (await import("@immortalis/engine")).derivePcPhysicalLocusCustody(
      PC,
      s.campaign.store,
    );
    if (!custody.ok) throw new Error(custody.error.message);
    const real = s.campaign.store.listFacts();
    const facts = (extra: string[]) => {
      const m = new Map(real.map((f) => [f.key, f]));
      for (const k of extra) m.set(k, { ...real[0]!, key: k });
      return m;
    };
    expect(pcPhysicalLocusCustodyViolation(custodyKey(), custody.value, facts([]))).toBeNull();
    for (const rival of [
      worldFallbackEntityKey(W, PC),
      worldEntityTransitionKey(W, PC),
      logisticsCommitmentKey(W, PC),
      logisticsTransferKey(W, PC),
    ])
      expect(
        pcPhysicalLocusCustodyViolation(custodyKey(), custody.value, facts([rival])),
        rival,
      ).toMatch(/another current-locus authority/);
  });
});

describe("forged, stale, mismatched or incomplete predecessor evidence fails closed (raw store commits cannot bypass)", () => {
  const forgeries: Record<string, (v: any) => void> = {
    "PC identity of another actor": (v) => (v.pc_id = ACTOR_OTHER),
    "locus moved to another established locus": (v) =>
      (v.stationary_locus.locus = {
        fact_key: worldLocusKey(W, "locus-fixture-2"),
        entity_id: "locus-fixture-2",
      }),
    "locus reference not matching its key": (v) =>
      (v.stationary_locus.locus.fact_key = worldLocusKey(W, "locus-other")),
    "world of another campaign": (v) =>
      (v.stationary_locus.world = {
        fact_key: worldProfileKey("world-other"),
        entity_id: "world-other",
      }),
    "stale contract pin": (v) => (v.basis.pinned_versions.pc = 2),
    "zero contract pin": (v) => (v.basis.pinned_versions.pc = 0),
    "stale binding pin": (v) => (v.basis.pinned_versions.binding = 2),
    "stale coupling pin": (v) => (v.basis.pinned_versions.coupling = 2),
    "stale world pin": (v) => (v.basis.pinned_versions.world = 2),
    "stale locus pin": (v) => (v.basis.pinned_versions.locus = 0),
    "not established from the handover": (v) => (v.basis.established_from = "ACTIVATION"),
    "custodian is not World-State": (v) => (v.custodian.owner = "logistics"),
    "custodian basis changed": (v) => (v.custodian.basis = "OTHER"),
    "a movement smuggled in": (v) => (v.movement = { to: "locus-fixture-2" }),
    "a destination smuggled in": (v) => (v.destination = v.stationary_locus.locus),
    "a route smuggled in": (v) => (v.route = []),
    "a duration smuggled in": (v) => (v.duration = 5),
    "an in-transfer state smuggled in": (v) => (v.in_transfer = true),
    "a second locus smuggled in": (v) => (v.binding_locus = v.stationary_locus.locus),
  };
  for (const [name, edit] of Object.entries(forgeries)) {
    it(`${name}`, async () => {
      const s = await handedOverCampaign();
      await must(
        s.campaign.establishLocus({
          ...publication(7),
          locus: fixtureLocus({ locus_id: "locus-fixture-2" }),
        }),
      );
      const head = s.campaign.store.head();
      const r = await s.campaign.store.commit(rawCustody(s, 2, PC, edit));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.code).toMatch(
        /^(VALUE_INVALID|REFERENCE_INVALID|PREREQUISITE_MISSING)$/,
      );
      expect(s.campaign.store.head()).toEqual(head);
      expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
      // a lawful establishment still works afterwards: refusal left no trace
      await must(establishCustody(s, 3));
    });
  }

  it("a record that did not read and depend on what it consumed is refused", async () => {
    const s = await handedOverCampaign();
    const lawful = rawCustody(s, 2);
    for (const key of lawful.reads.map((r) => r.key)) {
      const without = rawCustody(s, 2, PC, undefined, {
        reads: lawful.reads.filter((r) => r.key !== key),
      });
      expect((await s.campaign.store.commit(without)).ok, `reads ${key}`).toBe(false);
      const stale = rawCustody(s, 2, PC, undefined, {
        reads: lawful.reads.map((r) => (r.key === key ? { ...r, version: r.version + 1 } : r)),
      });
      expect((await s.campaign.store.commit(stale)).ok, `stale ${key}`).toBe(false);
    }
    for (const gid of lawful.depends_on) {
      const without = rawCustody(s, 2, PC, undefined, {
        depends_on: lawful.depends_on.filter((g) => g !== gid),
      });
      expect((await s.campaign.store.commit(without)).ok, `depends ${gid}`).toBe(false);
    }
    expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
    expect((await s.campaign.store.commit(lawful)).ok).toBe(true);
  });

  it("a group that writes the custody record together with any other fact is refused", async () => {
    const s = await handedOverCampaign();
    const lawful = rawCustody(s, 2);
    const other = rawCustody(s, 3, PC, undefined, {});
    const twice = {
      ...lawful,
      writes: [...lawful.writes, { ...other.writes[0]!, key: `${custodyKey()}x` }],
    };
    expect((await s.campaign.store.commit(twice as never)).ok).toBe(false);
    expect(s.campaign.store.getFact(custodyKey())).toBeUndefined();
  });
});

describe("no other owner can write, and the custody path writes nothing else", () => {
  it("only World-State's fallback custodian may write the custody key space: Logistics, the PC owner, the Role Registry and the Named-Actor owner are refused", async () => {
    const s = await handedOverCampaign();
    const head = s.campaign.store.head();
    for (const [owner, facet] of [
      ["logistics", "logistics_state"],
      ["pc_existence", "existence_contract"],
      ["pc_existence", "pc_capability_profile"],
      ["role_registry", "player_character_binding"],
      ["named_actor", "actor_profile"],
      ["world_state", "world_locus"],
    ] as const) {
      const g = rawCustody(s, 2, PC, undefined, { owner, facet });
      g.writes[0]!.owner = owner;
      g.writes[0]!.facet = facet;
      expect((await s.campaign.store.commit(g)).ok, `${owner}/${facet}`).toBe(false);
    }
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the custody record cannot be used to rewrite the binding or the coupling: neither can be written again by anyone", async () => {
    const s = await handedOverCampaign();
    await must(establishCustody(s, 1));
    const binding = structuredClone(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
    const coupling = structuredClone(s.campaign.store.getFact(worldActorCouplingKey(PC))!);
    const head = s.campaign.store.head();
    expect(
      (
        await s.campaign.coupleExistingActor({
          ...custodyPublication(9),
          actor_id: PC,
          world_id: W,
          locus_id: L,
          actor_state: [],
        } as never)
      ).ok,
    ).toBe(false);
    expect(
      (
        await s.campaign.handoverExistingActor({
          ...custodyPublication(10),
          pc_id: PC,
          world_id: W,
          locus_id: L,
        })
      ).ok,
    ).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(binding);
    expect(s.campaign.store.getFact(worldActorCouplingKey(PC))).toEqual(coupling);
    expect(pcExistenceContractKey(PC)).toBeDefined();
  });
});
