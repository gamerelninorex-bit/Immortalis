/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// GIP Office / Authority Locus Backbone Foundation — "one explicitly authored office input beneath one already-committed
// Institution Identity → GIP commits one canonical Office / Authority Locus pinned to that identity → save/load/replay
// preserve the same office, authority fields, prerequisite reference and provenance → later lawful subsystems may read it by
// exact key without GIP write authority" — and nothing more: no appointment, removal, succession, delegation, authority
// amendment, holder replacement, exercise or downstream behavior, and no foreign write.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial), IA-30 (partial); RC-02/07/16; IM-03, IM-06, IM-11, IM-12,
// IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery acceptance
// (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
} from "@immortalis/contracts";
import {
  GIP_OFFICE_RULE,
  GIP_RULE,
  GipAdapter,
  WS007_SOURCE,
  readOfficeAuthorityLocus,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  HOLDER_REF_A,
  HOLDER_REF_B,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  gipPublication,
  institutionIdentity,
  officeAuthorityLocus,
} from "@immortalis/testkit";
import {
  establishInstitution,
  establishOffice,
  gipFacts,
  reopenGip,
  seededGipCampaign,
} from "../support/gip.ts";
import { establishBasis, seededActorCampaign } from "../support/actor.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);

/** An established campaign: one committed institution (publication 1), ready for its first office. */
async function withCourt(dir = tempDir()) {
  const s = await seededGipCampaign(dir);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  return s;
}

describe("one explicitly authored office beneath one committed institution commits one canonical Office / Authority Locus", () => {
  it("commits under the sole GIP owner at the key its exact institution_id and office_id derive, as one create-only write", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    const outcome = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }),
    );
    expect(outcome.replayed).toBe(false);
    const fact = s.campaign.store.getFact(magistrateKey)!;
    expect(fact.owner).toBe("gip");
    expect(fact.facet).toBe("gip_institution_identity");
    expect(fact.version).toBe(1);
    expect(fact.value).toEqual(officeAuthorityLocus());
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("pins the committed Institution Identity: one read at its exact version, one dependency on its committing group, one write", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const identity = s.campaign.store.getFact(courtKey)!;
    const group = s.campaign.store.committedGroup(gipPublication(2).intent_id)!;
    expect(group.owner).toBe("gip");
    expect(group.reads).toEqual([{ key: courtKey, version: identity.version }]);
    expect(group.depends_on).toEqual([identity.provenance.group_id]);
    expect(group.writes.map((w) => [w.key, w.expected_version])).toEqual([[magistrateKey, 0]]);
  });

  it("records the provenance: the authored cause and basis, the archivist authority and the exact WS-007 citation at its spec-locked pin", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = s.campaign.store.getFact(magistrateKey)!;
    expect(fact.provenance.group_id).toBe(gipPublication(2).group_id);
    expect(fact.provenance.intent_id).toBe(gipPublication(2).intent_id);
    expect(fact.provenance.cause).toBe(gipPublication(2).cause);
    expect(fact.basis).toBe(gipPublication(2).basis);
    expect(fact.secrecy).toBe(gipPublication(2).secrecy);
    expect(fact.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(fact.provenance.rule.artifact).toBe(WS007_SOURCE.artifact);
    expect(fact.provenance.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
    expect(fact.provenance.rule.clause).toContain("§3.2 Office / Authority Locus");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(2).intent_id)!;
    expect(receipt.basis.authority).toEqual(CANON_WRITE_AUTHORITY);
  });

  it("the caller never supplies an owner, facet, authority or governing rule: a smuggled one is not used", async () => {
    const s = await withCourt();
    await must(
      s.gip.establishOffice({
        ...gipPublication(2),
        office: officeAuthorityLocus(),
        owner: "world_state",
        facet: "world_profile",
        authority: { role: "role.player", permission: "permission.player_choice.commit" },
        rule: { artifact: "forged" },
      } as never),
    );
    const fact = s.campaign.store.getFact(magistrateKey)!;
    expect([fact.owner, fact.facet]).toEqual(["gip", "gip_institution_identity"]);
    expect(fact.provenance.rule).toEqual(GIP_OFFICE_RULE);
  });

  it("establishing the office leaves the Institution Identity byte-for-byte unchanged: it is not enriched into a property bag", async () => {
    const s = await withCourt();
    const identity = structuredClone(s.campaign.store.getFact(courtKey)!);
    await establishOffice(s, 2);
    expect(s.campaign.store.getFact(courtKey)).toEqual(identity);
    expect(identity.provenance.rule).toEqual(GIP_RULE);
    expect(Object.keys(identity.value as object).sort()).toEqual([
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
  });

  it("an institution may have several offices, and the same office_id under two institutions is two independent offices", async () => {
    const s = await withCourt();
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER, { holder_ref: HOLDER_REF_B });
    await establishOffice(s, 5, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    const guildMagistrate = gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      treasurerKey,
      guildKey,
      guildMagistrate,
    ]);
    expect((s.campaign.store.getFact(treasurerKey)!.value as any).holder_ref).toBe(HOLDER_REF_B);
    expect((s.campaign.store.getFact(magistrateKey)!.value as any).holder_ref).toBe(HOLDER_REF_A);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("authored arrays and rule prose are carried verbatim, never normalised or interpreted", () => {
  it("an explicitly authored empty powers[], repeated entries and rule prose stating a mechanism is unknown or absent are committed exactly as authored and survive a reload", async () => {
    const dir = tempDir();
    const s = await withCourt(dir);
    const authored = await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE, {
      powers: [],
      duties: ["SYNTHETIC FIXTURE: a duty.", "SYNTHETIC FIXTURE: a duty."],
      selection_rule: "SYNTHETIC FIXTURE: no selection mechanism exists.",
      succession_rule: "SYNTHETIC FIXTURE: unknown.",
      removal_rule: "SYNTHETIC FIXTURE: unresolved.",
    });
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER, {
      powers: ["SYNTHETIC FIXTURE: p.", "SYNTHETIC FIXTURE: p."],
    });
    expect(s.campaign.store.getFact(magistrateKey)!.value).toEqual(authored);
    expect((s.campaign.store.getFact(treasurerKey)!.value as any).powers).toEqual([
      "SYNTHETIC FIXTURE: p.",
      "SYNTHETIC FIXTURE: p.",
    ]);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)?.value).toEqual(
      authored,
    );
    await r.campaign.close();
  });
});

describe("the office is readable by exact key and a read grants no GIP write authority", () => {
  it("reads one committed office through the adapter and through the read-only store view, identically", async () => {
    const s = await withCourt();
    const office = await establishOffice(s, 2);
    const viaAdapter = s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)!;
    expect(viaAdapter.value).toEqual(office);
    expect(viaAdapter.fact).toEqual(s.campaign.store.getFact(magistrateKey));
    const readOnly = { getFact: (k: string) => s.campaign.store.getFact(k) };
    expect(readOfficeAuthorityLocus(readOnly, INSTITUTION_COURT, OFFICE_MAGISTRATE)).toEqual(
      viaAdapter,
    );
  });

  it("an office that is not established reads as undefined: a read never creates, infers or defaults one, and the key needs both identities", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    expect(s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)).toBeUndefined();
    expect(readOfficeAuthorityLocus(s.campaign.store, "institution-never", "o")).toBeUndefined();
    await establishOffice(s, 2);
    expect(s.gip.officeAuthorityLocus(INSTITUTION_GUILD, OFFICE_MAGISTRATE)).toBeUndefined();
    expect(s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER)).toBeUndefined();
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
  });

  it("the read reports the office record only: the holder is a bare reference, and no exercise, reach or knowledge is inferred", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const read = s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)!;
    expect(read.value.holder_ref).toBe(HOLDER_REF_A);
    expect(Object.keys(read.value).sort()).toEqual(Object.keys(officeAuthorityLocus()).sort());
    expect(typeof read.value.holder_ref).toBe("string");
  });
});

describe("no office without the committed prerequisite Institution Identity; a label never substitutes for institution_id", () => {
  it("an office for an institution that was never established is refused as a missing prerequisite and nothing is committed", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(s.gip.establishOffice({ ...gipPublication(1), office: officeAuthorityLocus() })),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(before);
    expect(gipFacts(s)).toEqual([]);
  });

  it("another institution's identity does not stand in: an office for the guild is refused while only the court is established", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...gipPublication(2),
          office: officeAuthorityLocus(INSTITUTION_GUILD),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(before);
  });

  it("an institution LABEL cannot substitute for the canonical institution_id: an office naming a label as its institution is refused", async () => {
    const s = await seededGipCampaign(tempDir());
    // the institution's authored label is itself a well-formed identifier, and no identity carries it as its institution_id
    await establishInstitution(s, 1, INSTITUTION_COURT, { identity_label: "label-of-the-court" });
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...gipPublication(2),
          office: officeAuthorityLocus("label-of-the-court"),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(before);
    expect(s.gip.officeAuthorityLocus("label-of-the-court", OFFICE_MAGISTRATE)).toBeUndefined();
  });

  it("two institutions sharing a label are still two institutions: an office joins only the one whose institution_id it names", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT, { identity_label: "the shared label" });
    await establishInstitution(s, 2, INSTITUTION_GUILD, { identity_label: "the shared label" });
    await establishOffice(s, 3, INSTITUTION_GUILD);
    expect(s.gip.officeAuthorityLocus(INSTITUTION_GUILD, OFFICE_MAGISTRATE)).toBeDefined();
    expect(s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)).toBeUndefined();
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      guildKey,
      gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE),
    ]);
  });

  it("a foreign fact that merely looks like an institution (an identifier shared with another owner's key) is no prerequisite", async () => {
    const s = await seededGipCampaign(tempDir());
    // the seeded world has a locus whose identifier could be named as an institution; it is not a GIP Institution Identity
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...gipPublication(1),
          office: officeAuthorityLocus("locus-fixture-1"),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(gipFacts(s)).toEqual([]);
  });
});

describe("establishment creates nothing beyond the office, and the holder reference receives no copied state", () => {
  it("adds exactly the one office fact: no actor, population, KTI, epistemic, economy, production, logistics, military, diplomacy, world or temporal write", async () => {
    const s = await withCourt();
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));
    await establishOffice(s, 2);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => !before.has(f.key)).map((f) => f.key)).toEqual([magistrateKey]);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    const prefixes = new Set(after.map((f) => f.key.split("/")[0]));
    expect([...prefixes].sort()).toEqual(["gip", "pc", "role-registry", "world"]);
    expect(after.filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });

  it("an existing Named Actor named as holder gains no authority, personality, capability, knowledge or permission state; the office copies none of the actor's", async () => {
    const dir = tempDir();
    const a = await seededActorCampaign(dir);
    await establishBasis(a, 1, ACTOR_SMITH);
    const gip = new GipAdapter(a.campaign.store);
    await must(
      gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    const actorFacts = a.campaign.store
      .listFacts()
      .filter((f) => !f.key.startsWith("gip/"))
      .map((f) => structuredClone(f));
    expect(actorFacts.some((f) => f.key.startsWith("actor/"))).toBe(true);

    await must(
      gip.establishOffice({
        ...gipPublication(2),
        office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          holder_ref: ACTOR_SMITH,
        }),
      }),
    );
    // every non-GIP fact — the holder's actor facts included — is byte-identical
    const nonGip = a.campaign.store.listFacts().filter((f) => !f.key.startsWith("gip/"));
    expect(nonGip).toEqual(actorFacts);
    // the office holds the holder as a bare reference and none of the actor's state
    const office = JSON.stringify(a.campaign.store.getFact(magistrateKey)!.value);
    const actorValues = actorFacts.filter((f) => f.key.startsWith("actor/"));
    for (const f of actorValues)
      for (const k of Object.keys(f.value as object))
        if (!["actor_id"].includes(k)) expect(office, k).not.toContain(`"${k}"`);
    // the actor's own keys are the only keys that name the actor outside the office
    expect(
      a.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("gip/"))
        .map((f) => f.key),
    ).toEqual([courtKey, magistrateKey]);
    expect(a.campaign.verify()).toEqual([]);
    await a.campaign.close();
  });

  it("the authority is persisted once at the office: the holder_ref is a string reference and the office value carries no holder-side field", async () => {
    const s = await withCourt();
    const office = await establishOffice(s, 2);
    const stored = s.campaign.store.getFact(magistrateKey)!.value as Record<string, unknown>;
    expect(stored["holder_ref"]).toBe(office.holder_ref);
    expect(typeof stored["holder_ref"]).toBe("string");
    for (const k of Object.keys(stored)) expect(k).not.toMatch(/^holder_(?!ref$)/);
  });

  it("no clock, tick or temporal object is needed or created: no canonical time moves, nothing is scheduled", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });
});

describe("retry and recovery converge on the one office; a conflicting establishment fails closed", () => {
  it("re-presenting the same intent returns the original receipt and changes nothing", async () => {
    const s = await withCourt();
    const first = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }),
    );
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    const again = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("a conflicting establishment for an established office fails closed and mints no sibling authority: another holder, another power, another source", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    for (const [n, over] of [
      [3, { holder_ref: HOLDER_REF_B }],
      [4, { powers: ["SYNTHETIC FIXTURE: a different power."] }],
      [5, { authority_source_ref: "authority-source-other" }],
      [6, {}], // equal content under a new intent is a second writer of the same slot
    ] as const)
      expect(
        await codeOf(
          s.gip.establishOffice({
            ...gipPublication(n),
            office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, over as never),
          }),
        ),
        String(n),
      ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
  });

  it("the same intent with a changed office is a conflict, never a silent reuse or rewrite", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...gipPublication(2),
          office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
            holder_ref: HOLDER_REF_B,
          }),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });
});

describe("an attempted office update or holder change fails closed: no transition is implemented", () => {
  it("the adapter exposes no method that moves an office: the only office writer is the initial establishment", () => {
    const methods = Object.getOwnPropertyNames(GipAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toEqual([
      "establishInstitution",
      "establishOffice",
      "institutionIdentity",
      "officeAuthorityLocus",
    ]);
  });

  it("a raw expected-version write to an established office is refused as an unsupported amendment by GIP admission: holder, power, rule, source", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = s.campaign.store.getFact(courtKey)!;
    let n = 100;
    for (const over of [
      { holder_ref: HOLDER_REF_B },
      { powers: ["SYNTHETIC FIXTURE: an added power."] },
      { removal_rule: "SYNTHETIC FIXTURE: a changed rule." },
      { authority_source_ref: "authority-source-other" },
    ]) {
      n++;
      const rejected = await s.campaign.store.commit({
        campaign_id: s.campaign.store.head().campaign_id,
        group_id: `raw-group-${n}`,
        intent_id: `raw-intent-${n}`,
        owner: "gip",
        facet: "gip_institution_identity",
        cause: `raw-cause-${n}`,
        rule: GIP_OFFICE_RULE,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [{ key: courtKey, version: identity.version }],
        depends_on: [identity.provenance.group_id],
        writes: [
          {
            key: magistrateKey,
            owner: "gip",
            facet: "gip_institution_identity",
            value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, over) as never,
            unit: null,
            basis: "gip-fixture-basis",
            secrecy: "gip-fixture-visibility",
            expected_version: 1,
          },
        ],
      });
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
        // refused by GIP's own admission (the kind is ADVANCING, not SEALED): the message names the missing transitions
        expect(rejected.error.message).toMatch(/no appointment, removal, succession, delegation/);
      }
    }
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
    expect(s.campaign.store.getFact(magistrateKey)!.version).toBe(1);
  });

  it("an attempted create of the occupied office slot fails on the version chain, and nothing changes", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = s.campaign.store.getFact(courtKey)!;
    const rejected = await s.campaign.store.commit({
      campaign_id: s.campaign.store.head().campaign_id,
      group_id: "raw-group-replace",
      intent_id: "raw-intent-replace",
      owner: "gip",
      facet: "gip_institution_identity",
      cause: "raw-cause-replace",
      rule: GIP_OFFICE_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: courtKey, version: identity.version }],
      depends_on: [identity.provenance.group_id],
      writes: [
        {
          key: magistrateKey,
          owner: "gip",
          facet: "gip_institution_identity",
          value: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
            holder_ref: HOLDER_REF_B,
          }) as never,
          unit: null,
          basis: "gip-fixture-basis",
          secrecy: "gip-fixture-visibility",
          expected_version: 0,
        },
      ],
    });
    expect(!rejected.ok && rejected.error.code).toBe("VERSION_CONFLICT");
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });
});

describe("save → close → load → continue preserves the exact office, authority fields, prerequisite reference and provenance", () => {
  it("reloads the identical facts and group, and keeps establishing under the same keying", async () => {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishOffice(s, 2);
    const saved = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = structuredClone(s.campaign.store.getFact(courtKey)!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(2).intent_id));
    const group = structuredClone(s.campaign.store.committedGroup(gipPublication(2).intent_id));
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(magistrateKey)).toEqual(saved);
    expect(r.campaign.store.getFact(courtKey)).toEqual(identity);
    expect(r.campaign.store.lookupReceipt(gipPublication(2).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(2).intent_id)).toEqual(group);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(r.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)?.fact).toEqual(saved);
    // continue: a retry converges; a conflicting attempt fails closed; a second office commits beside the first
    const again = await must(
      r.gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }),
    );
    expect(again.replayed).toBe(true);
    expect(
      await codeOf(
        r.gip.establishOffice({
          ...gipPublication(5),
          office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
            holder_ref: HOLDER_REF_B,
          }),
        }),
      ),
    ).not.toBe("OK");
    await establishOffice(r, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    expect(r.campaign.store.getFact(magistrateKey)).toEqual(saved);
    await r.campaign.close();

    const r2 = await reopenGip(dir, "gip-reopen-2");
    expect(r2.campaign.verify()).toEqual([]);
    expect(gipFacts(r2).map((f) => f.key)).toEqual([courtKey, magistrateKey, treasurerKey]);
    expect(r2.campaign.store.getFact(magistrateKey)).toEqual(saved);
    await r2.campaign.close();
  });
});

describe("bounded runtime cost: only the addressed institution and office are read or written", () => {
  it("establishing and reading one office never reads, lists, scans or touches an unrelated institution or office", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_COUNCIL);
    await establishInstitution(s, 3, INSTITUTION_GUILD);
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishOffice(s, 5, INSTITUTION_COUNCIL, OFFICE_MAGISTRATE);
    const dormant = [courtKey, treasurerKey].map((k) =>
      structuredClone(s.campaign.store.getFact(k)),
    );
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishOffice({
        ...gipPublication(6),
        office: officeAuthorityLocus(INSTITUTION_GUILD, OFFICE_MAGISTRATE),
      }),
    );
    expect(gip.officeAuthorityLocus(INSTITUTION_GUILD, OFFICE_MAGISTRATE)).toBeDefined();
    expect(gip.officeAuthorityLocus(INSTITUTION_GUILD, "office-absent")).toBeUndefined();
    expect(spy.listCalls()).toBe(0);
    expect(new Set(spy.getFacts)).toEqual(
      new Set([
        guildKey,
        gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE),
        gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, "office-absent"),
      ]),
    );
    for (const g of spy.commits)
      expect(g.writes.map((w) => w.key)).toEqual([
        gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE),
      ]);
    expect([courtKey, treasurerKey].map((k) => s.campaign.store.getFact(k))).toEqual(dormant);
  });
});
