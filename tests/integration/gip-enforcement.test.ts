/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// GIP Stable Institution Identity Backbone Foundation — enforcement that does not depend on the adapter behaving. IM-11
// admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone, including every
// predecessor owner; the identity is sealed and create-only; it cannot carry unmodelled state; a lifecycle transition is not
// representable; GIP has no stage, close or temporal object; and load-time verification fails closed on drift.
// Register lineage: IA-02, IA-03, IA-06 (partial); RC-02, RC-07, RC-16; IM-03, IM-06, IM-11, IM-12,
// IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  GIP_RULE,
  GipAdapter,
  gipGroupCheck,
  gipObjectViolation,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  SYNTH_OWNER,
  dormantObject,
  gipPublication,
  institutionIdentity,
  temporalPublication,
} from "@immortalis/testkit";
import { establishInstitution, gipFacts, seededGipCampaign } from "../support/gip.ts";
import { codeOf, must, seededTemporalCampaign } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);

const wr = (
  key: string,
  value: unknown,
  over: { owner?: string; facet?: string; expected_version?: number } = {},
) => ({
  key,
  owner: over.owner ?? "gip",
  facet: over.facet ?? "gip_institution_identity",
  value: value as never,
  unit: null,
  basis: "gip-fixture-basis",
  secrecy: "gip-fixture-visibility",
  expected_version: over.expected_version ?? 0,
});

/** A raw group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  over: Partial<CommitGroup> & { key?: string; value?: unknown; expected_version?: number } = {},
  n = 900,
): CommitGroup {
  const { key, value, expected_version, ...group } = over;
  const owner = group.owner ?? "gip";
  const facet = group.facet ?? "gip_institution_identity";
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: GIP_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      wr(key ?? courtKey, "value" in over ? value : institutionIdentity(), {
        owner,
        facet,
        ...(expected_version === undefined ? {} : { expected_version }),
      }),
    ],
    ...group,
  };
}

describe("owner exclusivity: only the GIP owner writes the Institution Identity key space (acceptance 3, 10)", () => {
  it("every other registered owner is refused the key, by a raw store commit as much as by any adapter", async () => {
    const s = await seededGipCampaign(tempDir());
    const owners: [string, string][] = [
      ["world_state", "world_profile"],
      ["world_state", "world_locus"],
      ["world_state", "world_fallback_physical_entity"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["temporal_kernel", "temporal_coordination"],
      ["population", "population_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["logistics", "logistics_state"],
      ["named_actor", "actor_profile"],
      ["epistemic_access", "epistemic_access"],
      ["kti", "kti_development"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      expect(
        await codeOf(s.campaign.store.commit(raw({ owner, facet }, n++))),
        `${owner} → ${courtKey}`,
      ).toBe("KEY_NOT_ADMITTED");
    expect(gipFacts(s)).toEqual([]);
  });

  it("a synthetic foreign owner cannot write the key either", async () => {
    const s = await seededTemporalCampaign(tempDir());
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw({ owner: SYNTH_OWNER, facet: "synthetic-stage" } as Partial<CommitGroup>, 1),
        ),
      ),
    ).toMatch(/^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("gip/"))).toEqual([]);
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no generic fallback", async () => {
    const s = await seededGipCampaign(tempDir());
    for (const [owner, facet] of [
      ["gip_owner", "gip_institution_identity"],
      ["gips", "gip_institution_identity"],
      ["gip", "institution_identity"],
      ["gip", "gip"],
      ["gip", "office"],
      ["government", "gip_institution_identity"],
      ["institution", "gip_institution_identity"],
      ["politics", "gip_institution_identity"],
      ["generic", "fallback"],
      ["host", "gip_institution_identity"],
      ["role.gm", "gip_institution_identity"],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw({ owner, facet }, 1))), owner + facet).toBe(
        "OWNER_NOT_REGISTERED",
      );
  });

  it("the GIP owner cannot write a foreign key space, nor an unmodelled GIP key (instrument, membership, faction, an office's sub-state…)", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "role-registry/binding/role.player_character",
      "population/l1/ledger",
      "production/reserve/r1",
      "economy/demand/d1",
      "logistics/commitment/w/e",
      "actor/a1/capability/c1",
      "access/e1/event",
      "kti/object/o1",
      "temporal/state",
      "institution/i1",
      "gip/institution",
      "gip/institution/i1",
      "gip/institution/i1/identity/extra",
      "gip/institution/i1/office",
      "gip/institution/i1/office/o1/holder",
      "gip/institution/i1/office/o1/delegation",
      "gip/institution/i1/office/o1/identity",
      "gip/institution/i1/office/o1/extra",
      "gip/institution/i1/membership",
      "gip/institution/i1/faction",
      "gip/institution/i1/instrument/x",
      "gip/office/o1",
      "gip/instrument/x/clause/c1",
      "gip/instrument",
      "gip/relation/a/b",
      "gips/institution/i1/identity",
    ])
      expect(await codeOf(s.campaign.store.commit(raw({ key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("an identity the GIP owner already holds cannot be taken over by another owner's group", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw({ owner: "world_state", facet: "world_profile", key: courtKey }, 3),
        ),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona, player, GM or host role writes nothing", async () => {
    const s = await seededGipCampaign(tempDir());
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "role.world", permission: "permission.canon.write" },
      { role: "host.tool", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(raw({ authority }, 3)))).toBe("AUTHORITY_DENIED");
    expect(gipFacts(s)).toEqual([]);
  });

  it("the adapter exposes the four authored establishments and their typed reads: no setter, rename, merge, split, abolish, replace, appointment, removal, succession, delegation, membership or scan method", () => {
    const methods = Object.getOwnPropertyNames(GipAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toEqual([
      "establishGovernanceInstrument",
      "establishInstitution",
      "establishOffice",
      "establishScopeBinding",
      "governanceInstrument",
      "institutionIdentity",
      "officeAuthorityLocus",
      "scopeBinding",
    ]);
    expect(
      // (the sixteenth slice's Governance Instrument establishment and keyed read are the only instrument methods)
      methods
        .filter((m) => !/^(establishGovernanceInstrument|governanceInstrument)$/.test(m))
        .filter((m) =>
          /set|update|write|rename|split|merge|abol|replace|succe|appoint|remov|deleg|member|faction|instrument|asset|resource|compet|tick|sweep|scan|list|all/i.test(
            m,
          ),
        ),
    ).toEqual([]);
  });
});

describe("raw and tampered values are refused by IM-11 (acceptance 3, 5, 6)", () => {
  it("an identity with a malformed or forbidden value is refused: no office, membership, faction, instrument, asset, KTI, actor, military, territory or generic property", async () => {
    const s = await seededGipCampaign(tempDir());
    for (const bad of [
      {},
      null,
      "institution",
      [],
      { ...institutionIdentity(), office: "o1" },
      { ...institutionIdentity(), powers: ["tax"] },
      { ...institutionIdentity(), members: ["a1"] },
      { ...institutionIdentity(), headcount: 5 },
      { ...institutionIdentity(), faction: "f1" },
      { ...institutionIdentity(), instrument: "i1" },
      { ...institutionIdentity(), assets: [] },
      { ...institutionIdentity(), kti: {} },
      { ...institutionIdentity(), belief: {} },
      { ...institutionIdentity(), relationship: {} },
      { ...institutionIdentity(), military: "x" },
      { ...institutionIdentity(), territory: "x" },
      { ...institutionIdentity(), properties: {} },
      { ...institutionIdentity(), predecessor_ids: [] },
      { ...institutionIdentity(), successor_ids: [] },
      { ...institutionIdentity(), constitutive_source_ref: null },
      { ...institutionIdentity(), constitutive_source_ref: ["x"] },
      { ...institutionIdentity(), constitutive_source_refs: ["x"] },
      { ...institutionIdentity(), continuity_status: "renamed" },
      { ...institutionIdentity(), continuity_status: "split" },
      { ...institutionIdentity(), continuity_status: "merged" },
      { ...institutionIdentity(), continuity_status: "abolished" },
      { ...institutionIdentity(), continuity_status: "replaced" },
      { ...institutionIdentity(), identity_label: "" },
      { ...institutionIdentity(), institution_id: "" },
      { institution_id: INSTITUTION_COURT, continuity_status: "continuing" },
      { institution_id: INSTITUTION_COURT, identity_label: "x" },
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw({ value: bad }, 5))),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    expect(gipFacts(s)).toEqual([]);
  });

  it("a mismatch between the key's institution_id and the value's is refused: an identity is at the one key its own identity derives", async () => {
    const s = await seededGipCampaign(tempDir());
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw({ key: courtKey, value: institutionIdentity(INSTITUTION_GUILD) }, 6),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw({ key: guildKey, value: institutionIdentity(INSTITUTION_COURT) }, 7),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(gipFacts(s)).toEqual([]);
  });

  it("a well-formed raw identity commits only through GIP's own admission: it is exactly the adapter's group (control)", async () => {
    const s = await seededGipCampaign(tempDir());
    const outcome = await must(s.campaign.store.commit(raw({}, 8)));
    expect(outcome.replayed).toBe(false);
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)?.value).toEqual(institutionIdentity());
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a group that writes anything but one create-only identity is refused: two identities, an identity with another write, an empty group", async () => {
    const s = await seededGipCampaign(tempDir());
    const w1 = raw({}, 9).writes[0]!;
    const w2 = wr(guildKey, institutionIdentity(INSTITUTION_GUILD));
    expect(await codeOf(s.campaign.store.commit(raw({ writes: [w1, w2] }, 9)))).toBe(
      "VALUE_INVALID",
    );
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            {
              writes: [
                w1,
                wr("world/w9/profile", {}, { owner: "gip", facet: "gip_institution_identity" }),
              ],
            },
            10,
          ),
        ),
      ),
    ).not.toBe("OK");
    expect(await codeOf(s.campaign.store.commit(raw({ writes: [] }, 11)))).not.toBe("OK");
    expect(gipFacts(s)).toEqual([]);
  });

  it("an identity reads and depends on no foreign fact: a pinned read or a dependency is refused (nothing is a prerequisite or a trigger)", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    const world = s.campaign.store.getFact("world/world-fixture-1/profile")!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            {
              key: guildKey,
              value: institutionIdentity(INSTITUTION_GUILD),
              reads: [{ key: world.key, version: world.version }],
              depends_on: [world.provenance.group_id],
            },
            12,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            {
              key: guildKey,
              value: institutionIdentity(INSTITUTION_GUILD),
              depends_on: [world.provenance.group_id],
            },
            13,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            {
              key: guildKey,
              value: institutionIdentity(INSTITUTION_GUILD),
              reads: [{ key: courtKey, version: 1 }],
            },
            14,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.gip.institutionIdentity(INSTITUTION_GUILD)).toBeUndefined();
  });

  it("invalid input is refused with nothing committed: a malformed publication or institution", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(1),
          intent_id: "",
          institution: institutionIdentity(),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(2),
          basis: "",
          institution: institutionIdentity(),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.gip.establishInstitution({ ...gipPublication(3), institution: { nope: true } }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(s.gip.establishInstitution({ ...gipPublication(4), institution: null })),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(5),
          institution: institutionIdentity(INSTITUTION_COURT, {
            continuity_status: "renamed",
          } as never),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });
});

describe("the identity is sealed and create-only: no rival writable identity, no rewrite (acceptance 3, 4)", () => {
  it("a second identity fact for the same institution is refused by every route: another intent, another owner, the same content", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    // a raw second creation, equal or different
    expect(await codeOf(s.campaign.store.commit(raw({}, 20)))).not.toBe("OK");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw({ value: institutionIdentity(INSTITUTION_COURT, { identity_label: "rival" }) }, 21),
        ),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(gipFacts(s)).toHaveLength(1);
  });

  it("a committed identity cannot be amended, renamed or replaced, even through the GIP owner: an expected version is an amendment", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    for (const [n, value] of [
      [30, institutionIdentity(INSTITUTION_COURT, { identity_label: "renamed" })],
      [31, institutionIdentity()],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw({ value, expected_version: 1 }, n)))).toBe(
        "AMENDMENT_NOT_SUPPORTED",
      );
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(s.campaign.store.getFact(courtKey)!.version).toBe(1);
  });

  it("admission is pure and total: the group check refuses a non-identity group directly", () => {
    const g = raw({ key: "gip/institution/x/office/o1", value: {} }, 40);
    expect(gipGroupCheck(g, { facts: new Map() } as never)?.code).toBe("VALUE_INVALID");
  });
});

describe("GIP has no tick, phase, polling loop, stage or special owner close (acceptance 7)", () => {
  async function engaged() {
    const s = await seededTemporalCampaign(tempDir(), { objects: [] });
    await must(
      new GipAdapter(s.campaign.store).establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentity(),
      }),
    );
    return s;
  }
  const stage = (owner: string) => ({
    causal_process_id: "gip-process",
    owner_operation: { owner, operation: "gip-operation" },
    prospective_result_id: "gip/result",
  });

  it("an object that is not GIP's registers (control): the refusals below are about GIP alone", async () => {
    const s = await engaged();
    expect(
      await codeOf(
        s.coordinator.registerObject({ ...temporalPublication(50), object: dormantObject() }),
      ),
    ).toBe("OK");
  });

  it("a temporal object cannot declare a GIP stage, produce a GIP key or be owned by GIP: no GIP stage, close, standing object or sweep", async () => {
    const s = await engaged();
    const base = dormantObject();
    const dep = base.dependencies[0]!;
    for (const [n, object] of [
      [51, { ...base, dependencies: [{ ...dep, stage: stage("gip") }] }],
      [52, { ...base, dependencies: [{ ...dep, produces: [guildKey] }] }],
      [
        53,
        {
          ...base,
          dependencies: [
            {
              ...dep,
              stage: stage("gip"),
              produces: [guildKey],
              declares_close: { name: "gip-close" },
            },
          ],
        },
      ],
      [54, { ...base, owning_ref: { owner: "gip", process_id: "gip-process" } }],
    ] as const)
      expect(
        await codeOf(
          s.coordinator.registerObject({ ...temporalPublication(n), object: object as never }),
        ),
        String(n),
      ).toBe("REFERENCE_INVALID");
  });

  it("the guard is the one registration rule: a GIP stage, GIP-produced key or GIP-owned object is a violation, anything else is not", () => {
    const base = dormantObject();
    const dep = base.dependencies[0]!;
    expect(gipObjectViolation(base)).toBeNull();
    expect(
      gipObjectViolation({ ...base, dependencies: [{ ...dep, stage: stage("gip") }] }),
    ).toMatch(/no stage, close or operation/);
    expect(
      gipObjectViolation({ ...base, dependencies: [{ ...dep, produces: [courtKey] }] }),
    ).toMatch(/no stage, close or operation/);
    expect(gipObjectViolation({ ...base, owning_ref: { owner: "gip", process_id: "p" } })).toMatch(
      /no temporal object/,
    );
  });
});

describe("load-time verification fails closed on GIP drift (acceptance 10)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    group?: (g: CommitGroup | null) => CommitGroup | null,
  ) {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => (group ? group(inner.committedGroup(i)) : inner.committedGroup(i)),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyGipIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (fact: any) => void) => (facts: OwnerFact[]) => {
    f(facts.find((x) => x.key === key));
    return facts;
  };

  it("a healthy campaign verifies", async () => {
    expect(await drifted((f) => f)).toBe("");
  });

  it("detects an identity whose value is no longer at the key its institution_id derives", async () => {
    expect(
      await drifted(edit(courtKey, (fact) => (fact.value.institution_id = INSTITUTION_GUILD))),
    ).toMatch(/key derived from its canonical institution_id/);
  });

  it("detects an identity committed with a foreign read or dependency, with another write, or with no journaled group", async () => {
    expect(
      await drifted(
        (f) => f,
        (g) => (g ? { ...g, reads: [{ key: "world/w/profile", version: 1 }] } : g),
      ),
    ).toMatch(/one write, no foreign read or dependency/);
    expect(
      await drifted(
        (f) => f,
        (g) => (g ? { ...g, depends_on: ["some-group"] } : g),
      ),
    ).toMatch(/one write, no foreign read or dependency/);
    expect(
      await drifted(
        (f) => f,
        (g) => (g ? { ...g, writes: [...g.writes, ...g.writes] } : g),
      ),
    ).toMatch(/one write, no foreign read or dependency/);
    expect(
      await drifted(
        (f) => f,
        () => null,
      ),
    ).toMatch(/one write, no foreign read or dependency/);
  });

  it("detects a hand-written temporal object that declares a GIP stage or is GIP's own", async () => {
    const withObject = (o: any) => (facts: OwnerFact[]) => {
      const template = structuredClone(facts.find((x) => x.key.startsWith("world/"))!);
      return [
        ...facts,
        { ...template, key: "temporal/object/obj-gip", value: o as never } as OwnerFact,
      ];
    };
    const base: any = dormantObject();
    expect(
      await drifted(withObject({ ...base, owning_ref: { owner: "gip", process_id: "p" } })),
    ).toMatch(/GIP owns no temporal object/);
    expect(
      await drifted(
        withObject({
          ...base,
          dependencies: [
            {
              ...base.dependencies[0],
              stage: {
                causal_process_id: "p",
                owner_operation: { owner: "gip", operation: "o" },
                prospective_result_id: "gip/x",
              },
            },
          ],
        }),
      ),
    ).toMatch(/GIP declares no stage/);
  });
});
