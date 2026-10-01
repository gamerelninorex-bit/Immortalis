/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// GIP Stable Institution Identity Backbone Foundation — "one explicitly established institution identity input → GIP commits
// one stable canonical Institution Identity reference → save/load/replay preserve the same identity and provenance → later
// lawful subsystems may reference that identity without gaining GIP write authority" — and nothing more: no office,
// authority, procedure, instrument, membership, faction agency, KTI competence, awareness or downstream behavior, and no
// lifecycle transition.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial), IA-30 (partial); RC-02/16; IM-03, IM-06, IM-11, IM-12, IM-17.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery acceptance (IA-07
// BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  ktiDevelopmentObjectKey,
  populationLedgerKey,
} from "@immortalis/contracts";
import { GIP_RULE, GipAdapter, WS007_SOURCE, readInstitutionIdentity } from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  LEDGER_MAIN,
  gipPublication,
  institutionIdentity,
} from "@immortalis/testkit";
import {
  establishInstitution,
  gipFacts,
  reopenGip,
  seedInstitutionLikeNeighbors,
  seededGipCampaign,
} from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);

describe("one explicitly established continuing institution commits one canonical Institution Identity (acceptance 1, 2)", () => {
  it("commits under the sole GIP owner/facet, at the key its canonical institution_id derives, as one create-only write", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    const outcome = await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentity(),
      }),
    );
    expect(outcome.replayed).toBe(false);
    const fact = s.campaign.store.getFact(courtKey)!;
    expect(fact.owner).toBe("gip");
    expect(fact.facet).toBe("gip_institution_identity");
    expect(fact.version).toBe(1);
    expect(fact.value).toEqual({
      institution_id: INSTITUTION_COURT,
      identity_label: "SYNTHETIC FIXTURE: a continuing test institution.",
      continuity_status: "continuing",
    });
    // exactly one fact was added, in one revision
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("records the provenance: the authored cause and basis, the archivist authority and the exact WS-007 citation at its spec-locked pin", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = s.campaign.store.getFact(courtKey)!;
    expect(fact.provenance.group_id).toBe(gipPublication(1).group_id);
    expect(fact.provenance.intent_id).toBe(gipPublication(1).intent_id);
    expect(fact.provenance.cause).toBe(gipPublication(1).cause);
    expect(fact.basis).toBe(gipPublication(1).basis);
    expect(fact.secrecy).toBe(gipPublication(1).secrecy);
    expect(fact.provenance.rule).toEqual(GIP_RULE);
    expect(fact.provenance.rule.artifact).toBe(WS007_SOURCE.artifact);
    expect(fact.provenance.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(1).intent_id)!;
    expect(receipt.basis.authority).toEqual(CANON_WRITE_AUTHORITY);
    const group = s.campaign.store.committedGroup(gipPublication(1).intent_id)!;
    expect(group.owner).toBe("gip");
    expect(group.reads).toEqual([]);
    expect(group.depends_on).toEqual([]);
    expect(group.writes.map((w) => w.key)).toEqual([courtKey]);
  });

  it("the caller never supplies an owner, facet, authority or governing rule: a smuggled one is not used", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentity(),
        owner: "world_state",
        facet: "world_profile",
        authority: { role: "role.player", permission: "permission.player_choice.commit" },
        rule: { artifact: "forged" },
      } as never),
    );
    const fact = s.campaign.store.getFact(courtKey)!;
    expect([fact.owner, fact.facet]).toEqual(["gip", "gip_institution_identity"]);
    expect(fact.provenance.rule).toEqual(GIP_RULE);
  });

  it("two institutions are two identities with nothing shared, and the label is not an identity dimension", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    const first = structuredClone(s.campaign.store.getFact(courtKey));
    await establishInstitution(s, 2, INSTITUTION_GUILD, {
      identity_label: institutionIdentity().identity_label,
    });
    expect(s.campaign.store.getFact(courtKey)).toEqual(first);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, guildKey]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the identity is readable by exact identity and a read grants no GIP write authority (acceptance 8)", () => {
  it("reads one committed identity through the adapter and through the read-only store view, identically", async () => {
    const s = await seededGipCampaign(tempDir());
    const institution = await establishInstitution(s, 1);
    const viaAdapter = s.gip.institutionIdentity(INSTITUTION_COURT)!;
    expect(viaAdapter.value).toEqual(institution);
    expect(viaAdapter.fact).toEqual(s.campaign.store.getFact(courtKey));
    // a consumer is handed ONLY the read side of the store: it cannot commit, and the read still works
    const readOnly = { getFact: (k: string) => s.campaign.store.getFact(k) };
    expect(readInstitutionIdentity(readOnly, INSTITUTION_COURT)).toEqual(viaAdapter);
  });

  it("an institution that is not established reads as undefined: a read never creates, infers or defaults one", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)).toBeUndefined();
    expect(readInstitutionIdentity(s.campaign.store, "institution-never")).toBeUndefined();
    expect(s.campaign.store.head()).toEqual(before);
    expect(gipFacts(s)).toEqual([]);
  });

  it("a foreign owner's adapter over the same store can reference the identity but has no path to write it", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const before = structuredClone(s.campaign.store.getFact(courtKey));
    // the other owners' authored paths each write only their own key spaces
    await seedInstitutionLikeNeighbors(s);
    expect(s.campaign.store.getFact(courtKey)).toEqual(before);
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)?.fact).toEqual(before);
  });
});

describe("establishment creates nothing beyond the identity (acceptance 7)", () => {
  it("adds exactly the one identity fact: no office, procedure, instrument, authority, membership, faction, KTI, awareness or temporal state", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    await establishInstitution(s, 1);
    const after = s.campaign.store.listFacts();
    const added = after.filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([courtKey]);
    // every pre-existing fact is byte-identical: nothing of another owner was touched
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    // and the owner prefixes of everything that exists are exactly the predecessors' plus the one GIP key
    const prefixes = new Set(after.map((f) => f.key.split("/")[0]));
    expect([...prefixes].sort()).toEqual([
      "gip",
      "kti",
      "pc",
      "population",
      "role-registry",
      "world",
    ]);
  });

  it("the identity value carries no state: only the three frozen minimum fields", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    expect(Object.keys(s.campaign.store.getFact(courtKey)!.value as object).sort()).toEqual([
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
  });
});

describe("nothing creates an institution automatically (acceptance 6)", () => {
  it("a label, a population ledger, an institutional development object, a locus designation and a PC create no GIP identity", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    // the neighbors exist and are institution-like, and no GIP key exists
    expect(s.campaign.store.getFact(populationLedgerKey(LEDGER_MAIN))).toBeDefined();
    expect(
      s.campaign.store.getFact(ktiDevelopmentObjectKey("kti-object-court-model")),
    ).toBeDefined();
    expect(
      (
        s.campaign.store.getFact(`world/${FIXTURE_WORLD_ID}/locus/${FIXTURE_LOCUS_ID}`)!
          .value as any
      ).designation,
    ).toBeDefined();
    expect(gipFacts(s)).toEqual([]);
    expect(s.gip.institutionIdentity("kti-object-court-model")).toBeUndefined();
    expect(s.gip.institutionIdentity(LEDGER_MAIN)).toBeUndefined();
    expect(s.gip.institutionIdentity(FIXTURE_LOCUS_ID)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("establishing one institution does not conjure another from its label, or from a neighbor sharing its identifier", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    await establishInstitution(s, 1, INSTITUTION_COURT, { identity_label: "the Guild of Smiths" });
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.gip.institutionIdentity(INSTITUTION_GUILD)).toBeUndefined();
    expect(s.gip.institutionIdentity(INSTITUTION_COUNCIL)).toBeUndefined();
  });

  it("the adapter's only write is the explicit establishment: it has no derivation from another owner's fact", async () => {
    expect(
      Object.getOwnPropertyNames(GipAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual(["establishInstitution", "institutionIdentity"]);
  });
});

describe("retry and recovery converge on the one identity; a conflicting establishment fails closed (acceptance 3, 4)", () => {
  it("re-presenting the same intent returns the original receipt and changes nothing", async () => {
    const s = await seededGipCampaign(tempDir());
    const first = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    const again = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
  });

  it("a conflicting establishment for an established institution fails closed and rewrites nothing: another label, another intent", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(2),
          institution: institutionIdentity(INSTITUTION_COURT, { identity_label: "A rival label" }),
        }),
      ),
    ).not.toBe("OK");
    // a duplicate construction, exactly equal in content, under a new intent is a second writer of the same slot: refused
    expect(
      await codeOf(
        s.gip.establishInstitution({ ...gipPublication(3), institution: institutionIdentity() }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(gipFacts(s)).toHaveLength(1);
  });

  it("the same intent with a changed institution is a conflict, never a silent reuse or rewrite", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(1),
          institution: institutionIdentity(INSTITUTION_COURT, { identity_label: "changed" }),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
  });

  it("the same group identity under a new intent for a different institution is refused, and the first institution stands", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(1),
          intent_id: "gip-intent-other",
          institution: institutionIdentity(INSTITUTION_GUILD),
        }),
      ),
    ).not.toBe("OK");
    expect(s.gip.institutionIdentity(INSTITUTION_GUILD)).toBeUndefined();
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("save → close → load → continue preserves the exact identity, provenance and keying (acceptance 9)", () => {
  it("reloads the identical fact and keeps establishing under the same keying", async () => {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    await establishInstitution(s, 1, INSTITUTION_COURT);
    const saved = structuredClone(s.campaign.store.getFact(courtKey)!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(1).intent_id));
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(courtKey)).toEqual(saved);
    expect(r.campaign.store.lookupReceipt(gipPublication(1).intent_id)).toEqual(receipt);
    expect(r.gip.institutionIdentity(INSTITUTION_COURT)?.fact).toEqual(saved);
    // continue: a retry of the committed intent converges; a conflicting attempt fails closed; a new institution commits
    const again = await must(
      r.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    expect(again.replayed).toBe(true);
    expect(
      await codeOf(
        r.gip.establishInstitution({
          ...gipPublication(5),
          institution: institutionIdentity(INSTITUTION_COURT, { identity_label: "rival" }),
        }),
      ),
    ).not.toBe("OK");
    await establishInstitution(r, 2, INSTITUTION_GUILD);
    expect(r.campaign.store.getFact(courtKey)).toEqual(saved);
    await r.campaign.close();

    const r2 = await reopenGip(dir, "gip-reopen-2");
    expect(r2.campaign.verify()).toEqual([]);
    expect(gipFacts(r2).map((f) => f.key)).toEqual([courtKey, guildKey]);
    expect(r2.campaign.store.getFact(courtKey)).toEqual(saved);
    await r2.campaign.close();
  });
});

describe("bounded runtime cost: only the addressed identity is read or written (acceptance 11)", () => {
  it("establishing and reading one institution never reads, lists, scans or touches an unrelated dormant institution", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_COUNCIL);
    const dormant = structuredClone(s.campaign.store.getFact(courtKey)!);
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishInstitution({
        ...gipPublication(3),
        institution: institutionIdentity(INSTITUTION_GUILD),
      }),
    );
    expect(gip.institutionIdentity(INSTITUTION_GUILD)).toBeDefined();
    expect(gip.institutionIdentity("institution-absent")).toBeUndefined();
    expect(spy.listCalls()).toBe(0);
    const touched = new Set(spy.getFacts);
    expect(touched.has(courtKey)).toBe(false);
    expect(touched.has(gipInstitutionIdentityKey(INSTITUTION_COUNCIL))).toBe(false);
    for (const g of spy.commits) expect(g.writes.map((w) => w.key)).toEqual([guildKey]);
    expect(s.campaign.store.getFact(courtKey)).toEqual(dormant);
  });
});

describe("no GIP tick, phase, polling loop or special owner close exists (acceptance 7)", () => {
  it("establishing an institution commits no temporal state, and no canonical time is needed or moved", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });
});
