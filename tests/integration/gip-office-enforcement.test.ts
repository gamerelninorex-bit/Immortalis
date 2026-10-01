/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// GIP Office / Authority Locus Backbone Foundation — enforcement that does not depend on the adapter behaving. IM-11
// admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone, including every
// predecessor owner; the office is created once and never moved (no transition exists); it can carry no unmodelled or
// deferred state; it rests on exactly its one committed Institution Identity; and load-time verification fails closed on
// drift. Register lineage: IA-02, IA-03, IA-06 (partial); RC-02, RC-07, RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local
// success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  GIP_OFFICE_RULE,
  gipGroupCheck,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  HOLDER_REF_B,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  officeAuthorityLocus,
} from "@immortalis/testkit";
import {
  establishInstitution,
  establishOffice,
  gipFacts,
  seededGipCampaign,
} from "../support/gip.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);

async function withCourt() {
  const s = await seededGipCampaign(tempDir());
  await establishInstitution(s, 1, INSTITUTION_COURT);
  return s;
}

/**
 * A raw office group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. By default it
 * is the lawful group (pinning the court identity at its committed version and group); each test breaks one thing.
 */
function raw(
  s: Awaited<ReturnType<typeof withCourt>>,
  over: Partial<CommitGroup> & { key?: string; value?: unknown; expected_version?: number } = {},
  n = 900,
): CommitGroup {
  const { key, value, expected_version, ...group } = over;
  const identity = s.campaign.store.getFact(courtKey)!;
  const owner = group.owner ?? "gip";
  const facet = group.facet ?? "gip_institution_identity";
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: GIP_OFFICE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: courtKey, version: identity.version }],
    depends_on: [identity.provenance.group_id],
    writes: [
      {
        key: key ?? magistrateKey,
        owner,
        facet,
        value: ("value" in over ? value : officeAuthorityLocus()) as never,
        unit: null,
        basis: "gip-fixture-basis",
        secrecy: "gip-fixture-visibility",
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

describe("owner exclusivity: only the GIP owner writes the office key space", () => {
  it("every other registered owner is refused the office key, by a raw store commit as much as by any adapter", async () => {
    const s = await withCourt();
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
        await codeOf(s.campaign.store.commit(raw(s, { owner, facet }, n++))),
        `${owner} → ${magistrateKey}`,
      ).toBe("KEY_NOT_ADMITTED");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("an office the GIP owner already holds cannot be taken over by another owner's group", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { owner: "world_state", facet: "world_profile", key: magistrateKey }, 3),
        ),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("the GIP owner cannot write a foreign or unmodelled key, even carrying a valid office value and prerequisite pin", async () => {
    const s = await withCourt();
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "population/l1/ledger",
      "actor/a1/capability/c1",
      "access/e1/event",
      "kti/object/o1",
      "temporal/state",
      "economy/demand/d1",
      "gip/institution/institution-court-1/office",
      "gip/institution/institution-court-1/office/office-magistrate-1/holder",
      "gip/institution/institution-court-1/office/office-magistrate-1/delegation/d1",
      "gip/institution/institution-court-1/offices/office-magistrate-1",
      "gip/office/office-magistrate-1",
      "gip/holder/holder-ref-a-1",
      "gip/institution/institution-court-1/instrument/x",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona, player, GM or host role writes nothing", async () => {
    const s = await withCourt();
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "host.tool", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { authority }, 3)))).toBe(
        "AUTHORITY_DENIED",
      );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("raw and tampered office values are refused by IM-11 (strict contract, no deferred or catch-all field)", () => {
  it("a malformed, deferred-surface or catch-all value is refused", async () => {
    const s = await withCourt();
    const base = officeAuthorityLocus();
    let n = 10;
    for (const bad of [
      {},
      null,
      "office",
      [],
      { ...base, decision_body_ref: "body-1" },
      { ...base, delegations: [] },
      { ...base, concurrence_requirements: [] },
      { ...base, review_veto_override: [] },
      { ...base, conditional_authority: [] },
      { ...base, holder_history: [] },
      { ...base, status: "appointed" },
      { ...base, properties: {} },
      { ...base, holder_capability: "A" },
      { ...base, holder_authority: ["tax"] },
      { ...base, powers: [] },
      { ...base, powers: ["a", "a"] },
      { ...base, selection_rule: "" },
      { ...base, succession_rule: { status: "unknown" } },
      { ...base, removal_rule: undefined },
      { ...base, holder_ref: "" },
      { ...base, authority_source_ref: "no spaces allowed" },
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { value: bad }, n++))),
        JSON.stringify(bad),
      ).toMatch(/^(VALUE_INVALID|SCHEMA_INVALID)$/); // an undefined member is not even a JSON value
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("a mismatch between the key's identities and the value's is refused: an office is at the one key its own identities derive", async () => {
    const s = await withCourt();
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            {
              key: magistrateKey,
              value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
            },
            6,
          ),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            { key: treasurerKey, value: officeAuthorityLocus(INSTITUTION_GUILD, OFFICE_TREASURER) },
            7,
          ),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("a well-formed raw office commits only through GIP's own admission: it is exactly the adapter's group (control)", async () => {
    const s = await withCourt();
    const outcome = await must(s.campaign.store.commit(raw(s, {}, 8)));
    expect(outcome.replayed).toBe(false);
    expect(s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)?.value).toEqual(
      officeAuthorityLocus(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a group that writes anything but one create-only office is refused: an office with its identity, with another office, with a foreign key, or empty", async () => {
    const s = await withCourt();
    const w = raw(s, {}, 9).writes[0]!;
    const other = {
      ...w,
      key: treasurerKey,
      value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER) as never,
    };
    expect(await codeOf(s.campaign.store.commit(raw(s, { writes: [w, other] }, 9)))).toBe(
      "VALUE_INVALID",
    );
    expect(
      await codeOf(
        s.campaign.store.commit(raw(s, { writes: [w, { ...w, key: "world/w9/profile" }] }, 10)),
      ),
    ).not.toBe("OK");
    expect(await codeOf(s.campaign.store.commit(raw(s, { writes: [] }, 11)))).not.toBe("OK");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("an office rests on exactly its one committed Institution Identity, pinned by canonical identity", () => {
  it("an office with no pin, a stale pin or no dependency is refused", async () => {
    const s = await withCourt();
    const identity = s.campaign.store.getFact(courtKey)!;
    expect(await codeOf(s.campaign.store.commit(raw(s, { reads: [], depends_on: [] }, 20)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit(raw(s, { reads: [] }, 21)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit(raw(s, { depends_on: [] }, 22)))).toBe(
      "REFERENCE_INVALID",
    );
    // a read at a version the identity is not at: a stale read is refused by the store itself
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { reads: [{ key: courtKey, version: identity.version + 1 }] }, 23),
        ),
      ),
    ).toBe("STALE_READ");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("an office for an institution with no committed identity is a missing prerequisite, whatever it pins: another institution's identity does not stand in", async () => {
    const s = await withCourt();
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    const guild = s.campaign.store.getFact(guildKey)!;
    const lacking = gipOfficeAuthorityLocusKey("institution-absent", OFFICE_MAGISTRATE);
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { key: lacking, value: officeAuthorityLocus("institution-absent") }, 24),
        ),
      ),
    ).toBe("PREREQUISITE_MISSING");
    // the court office pinning the guild's identity instead of the court's is not a join by exact institution_id
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            {
              reads: [{ key: guildKey, version: guild.version }],
              depends_on: [guild.provenance.group_id],
            },
            25,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, guildKey]);
  });

  it("a foreign read or dependency alongside the identity is refused: nothing but the identity is a prerequisite", async () => {
    const s = await withCourt();
    const identity = s.campaign.store.getFact(courtKey)!;
    const world = s.campaign.store.getFact("world/world-fixture-1/profile")!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            {
              reads: [
                { key: courtKey, version: identity.version },
                { key: world.key, version: world.version },
              ],
              depends_on: [identity.provenance.group_id, world.provenance.group_id],
            },
            26,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, { depends_on: [identity.provenance.group_id, world.provenance.group_id] }, 27),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("the pinned fact must be a GIP Institution Identity: an office cannot rest on another office or a foreign fact at the identity key", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const office = s.campaign.store.getFact(magistrateKey)!;
    // pinning an office instead of the identity does not satisfy the prerequisite
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(
            s,
            {
              key: treasurerKey,
              value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
              reads: [{ key: magistrateKey, version: office.version }],
              depends_on: [office.provenance.group_id],
            },
            28,
          ),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
  });

  it("invalid input is refused with nothing committed: a malformed publication or office", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    const pub = { group_id: "g", intent_id: "i", cause: "c", basis: "b", secrecy: "s" };
    expect(
      await codeOf(
        s.gip.establishOffice({ ...pub, intent_id: "", office: officeAuthorityLocus() }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(s.gip.establishOffice({ ...pub, basis: "", office: officeAuthorityLocus() })),
    ).toBe("INPUT_INVALID");
    expect(await codeOf(s.gip.establishOffice({ ...pub, office: { nope: true } }))).toBe(
      "INPUT_INVALID",
    );
    expect(await codeOf(s.gip.establishOffice({ ...pub, office: null }))).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...pub,
          office: { ...officeAuthorityLocus(), decision_body_ref: "body-1" },
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });

  it("admission is pure and total: the group check refuses a non-GIP-shaped group directly and judges an office from (group, state) alone", async () => {
    const s = await withCourt();
    const state = { facts: new Map(s.campaign.store.listFacts().map((f) => [f.key, f])) } as never;
    expect(gipGroupCheck(raw(s, { writes: [] }, 40), state)?.code).toBe("VALUE_INVALID");
    expect(gipGroupCheck(raw(s, {}, 41), state)).toBeNull();
    expect(gipGroupCheck(raw(s, { expected_version: 1 }, 42), state)?.code).toBe(
      "AMENDMENT_NOT_SUPPORTED",
    );
  });
});

describe("no transition exists: any change to an established office fails closed (kind is ADVANCING, only creation is admitted)", () => {
  it("every expected-version write, whatever it changes, is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    let n = 50;
    for (const [expected_version, over, code] of [
      [1, { holder_ref: HOLDER_REF_B }, "AMENDMENT_NOT_SUPPORTED"],
      [1, { powers: ["SYNTHETIC FIXTURE: another power."] }, "AMENDMENT_NOT_SUPPORTED"],
      [1, {}, "AMENDMENT_NOT_SUPPORTED"],
      [2, { holder_ref: HOLDER_REF_B }, "VERSION_CONFLICT"],
      [0, { holder_ref: HOLDER_REF_B }, "VERSION_CONFLICT"],
      [0, {}, "VERSION_CONFLICT"],
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(
              s,
              {
                value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, over as never),
                expected_version,
              },
              n,
            ),
          ),
        ),
        `${expected_version} ${JSON.stringify(over)}`,
      ).toBe(code);
    }
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("a first creation at a non-zero expected version is refused: there is no chain to continue", async () => {
    const s = await withCourt();
    expect(await codeOf(s.campaign.store.commit(raw(s, { expected_version: 1 }, 60)))).not.toBe(
      "OK",
    );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("load-time verification fails closed on office drift", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    group?: (g: CommitGroup | null) => CommitGroup | null,
  ) {
    const s = await withCourt();
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => facts.find((f) => f.key === k),
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
  const officeGroup = (f: (g: any) => any) => (g: CommitGroup | null) =>
    g && g.writes[0]!.key.includes("/office/") ? f(g) : g;

  it("a healthy campaign verifies", async () => {
    expect(await drifted((f) => f)).toBe("");
  });

  it("detects an office no longer at the key its identities derive", async () => {
    expect(
      await drifted(edit(magistrateKey, (fact) => (fact.value.office_id = OFFICE_TREASURER))),
    ).toMatch(/key derived from its exact institution_id and office_id/);
    expect(
      await drifted(edit(magistrateKey, (fact) => (fact.value.institution_id = INSTITUTION_GUILD))),
    ).toMatch(/key derived from its exact institution_id and office_id/);
  });

  it("detects an office that has moved forward: no transition is implemented, so a later version was not made by a lawful path", async () => {
    expect(await drifted(edit(magistrateKey, (fact) => (fact.version = 2)))).toMatch(
      /no office transition is implemented/,
    );
  });

  it("detects an office whose institution has no committed Institution Identity with that exact institution_id", async () => {
    expect(await drifted((facts) => facts.filter((f) => f.key !== courtKey))).toMatch(
      /rests on a committed Institution Identity with its exact institution_id/,
    );
    expect(
      await drifted(edit(courtKey, (fact) => (fact.value.institution_id = INSTITUTION_GUILD))),
    ).toMatch(/rests on a committed Institution Identity with its exact institution_id/);
    expect(await drifted(edit(courtKey, (fact) => (fact.owner = "world_state")))).toMatch(
      /rests on a committed Institution Identity/,
    );
  });

  it("detects an office committed with no pin, a stale or foreign pin, a foreign dependency, another write, a non-create write or no journaled group", async () => {
    const want =
      /one create-only write that pinned exactly its committed Institution Identity and nothing else/;
    for (const f of [
      (g: any) => ({ ...g, reads: [] }),
      (g: any) => ({ ...g, reads: [{ key: "world/w/profile", version: 1 }] }),
      (g: any) => ({ ...g, reads: [{ key: courtKey, version: 9 }] }),
      (g: any) => ({ ...g, reads: [...g.reads, { key: "world/w/profile", version: 1 }] }),
      (g: any) => ({ ...g, depends_on: [] }),
      (g: any) => ({ ...g, depends_on: ["some-group"] }),
      (g: any) => ({ ...g, depends_on: [...g.depends_on, "some-group"] }),
      (g: any) => ({ ...g, writes: [...g.writes, ...g.writes] }),
      (g: any) => ({ ...g, writes: [{ ...g.writes[0], expected_version: 1 }] }),
    ])
      expect(await drifted((x) => x, officeGroup(f))).toMatch(want);
    expect(
      await drifted(
        (x) => x,
        officeGroup(() => null),
      ),
    ).toMatch(want);
  });
});
