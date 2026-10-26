import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Institution Identity Constitutive Source Reference Foundation (twentieth bounded slice) — an authored initial Institution
// Identity may optionally carry the exact WS-007 §3.1 `constitutive_source_ref`: one optional, singular, opaque reference,
// carried exactly as authored and never dereferenced. It adds no read, dependency, second commit, identity dimension, lifecycle
// transition or source record. Existing identities without the field load unchanged.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gipInstitutionIdentityKey, gipInstrumentKey } from "@immortalis/contracts";
import { CanonicalCampaign, GIP_RULE, GipAdapter, type CampaignStore } from "@immortalis/engine";
import {
  CONSTITUTIVE_SOURCE_A,
  CONSTITUTIVE_SOURCE_B,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  INSTRUMENT_A,
  gipPublication,
  institutionIdentity,
  institutionIdentityWithConstitutiveSource,
} from "@immortalis/testkit";
import {
  establishGovernanceInstrument,
  establishInstitution,
  establishOffice,
  establishScopeBinding,
  gipFacts,
  reopenGip,
  seedInstitutionLikeNeighbors,
  seededGipCampaign,
} from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);

describe("a legacy identity without constitutive_source_ref commits, retries, saves and reloads unchanged (acceptance 1, 13)", () => {
  it("commits the three-field value exactly: omission is absence and nothing is synthesized", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const fact = s.campaign.store.getFact(courtKey)!;
    expect(fact.value).toEqual(institutionIdentity());
    expect("constitutive_source_ref" in (fact.value as object)).toBe(false);
    expect(JSON.stringify(fact.value)).toBe(JSON.stringify(institutionIdentity()));
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)?.value).toEqual(institutionIdentity());
    expect("constitutive_source_ref" in s.gip.institutionIdentity(INSTITUTION_COURT)!.value).toBe(
      false,
    );
  });

  it("retries by identity and survives save → close → load → continue byte-for-byte, with no migration or rewrite", async () => {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    const first = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    const fact = structuredClone(s.campaign.store.getFact(courtKey)!);
    const head = s.campaign.store.head();
    const again = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    await r.campaign.close();
  });
});

describe("a new identity carrying the optional reference commits and round-trips exactly (acceptance 2)", () => {
  it("commits the four-field value under the sole GIP owner/facet and the unchanged canonical key, as one create-only write", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    const authored = institutionIdentityWithConstitutiveSource();
    const outcome = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: authored }),
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
      constitutive_source_ref: CONSTITUTIVE_SOURCE_A,
    });
    expect(JSON.stringify(fact.value)).toBe(JSON.stringify(authored));
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)?.value).toEqual(authored);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("round-trips through save → close → load exactly, still verifies, and keeps converging", async () => {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(),
      }),
    );
    // a legacy identity beside it: each keeps exactly its own authored shape
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    const saved = structuredClone(s.campaign.store.getFact(courtKey)!);
    const savedLegacy = structuredClone(s.campaign.store.getFact(guildKey)!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(1).intent_id));
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(courtKey)).toEqual(saved);
    expect(r.campaign.store.getFact(guildKey)).toEqual(savedLegacy);
    expect(r.campaign.store.lookupReceipt(gipPublication(1).intent_id)).toEqual(receipt);
    expect(r.gip.institutionIdentity(INSTITUTION_COURT)?.fact).toEqual(saved);
    const again = await must(
      r.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(),
      }),
    );
    expect(again.replayed).toBe(true);
    await r.campaign.close();

    const r2 = await reopenGip(dir, "gip-reopen-2");
    expect(r2.campaign.verify()).toEqual([]);
    expect(r2.campaign.store.getFact(courtKey)).toEqual(saved);
    await r2.campaign.close();
  });

  it("records the unchanged provenance: the authored cause and basis, the archivist authority and the existing GIP_RULE", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(),
      }),
    );
    const fact = s.campaign.store.getFact(courtKey)!;
    expect(fact.provenance.rule).toEqual(GIP_RULE);
    expect(fact.provenance.group_id).toBe(gipPublication(1).group_id);
    expect(fact.provenance.cause).toBe(gipPublication(1).cause);
    expect(fact.basis).toBe(gipPublication(1).basis);
    expect(fact.secrecy).toBe(gipPublication(1).secrecy);
  });
});

describe("the reference is carried, never dereferenced, defaulted, derived or enforced (acceptance 3, 6, 9)", () => {
  it("a well-formed reference to nothing that exists is carried exactly as authored: no source is required, created, read or copied", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    const neighbors = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeUndefined();
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    // the reference names an instrument-shaped identifier that does not exist, and one of an arbitrary other kind
    for (const [n, id, ref] of [
      [1, INSTITUTION_COURT, INSTRUMENT_A],
      [2, INSTITUTION_GUILD, "charter-that-does-not-exist-1"],
      [3, INSTITUTION_COUNCIL, INSTITUTION_COUNCIL], // even a self-naming reference is just carried text
    ] as const)
      await must(
        gip.establishInstitution({
          ...gipPublication(n),
          institution: institutionIdentityWithConstitutiveSource(id, ref),
        }),
      );
    expect(gip.institutionIdentity(INSTITUTION_COURT)?.value.constitutive_source_ref).toBe(
      INSTRUMENT_A,
    );
    expect(gip.institutionIdentity(INSTITUTION_GUILD)?.value.constitutive_source_ref).toBe(
      "charter-that-does-not-exist-1",
    );
    // nothing was read to validate a referent: only the three identity slots were probed for establishment (reconciliation)
    const allowed = new Set([courtKey, guildKey, gipInstitutionIdentityKey(INSTITUTION_COUNCIL)]);
    for (const k of spy.getFacts) expect(allowed.has(k), k).toBe(true);
    expect(spy.listCalls()).toBe(0);
    // no source record of any kind exists or was created
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeUndefined();
    expect(
      s.campaign.store.getFact(gipInstrumentKey("charter-that-does-not-exist-1")),
    ).toBeUndefined();
    expect(
      gipFacts(s)
        .map((f) => f.key)
        .sort(),
    ).toEqual([courtKey, guildKey, gipInstitutionIdentityKey(INSTITUTION_COUNCIL)].sort());
    // every pre-existing fact of every other owner is byte-identical
    for (const [key, fact] of neighbors) expect(s.campaign.store.getFact(key)).toEqual(fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("presence or value of the reference does not alter the canonical key or the identity slot", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(
          INSTITUTION_COURT,
          CONSTITUTIVE_SOURCE_A,
        ),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    const head = s.campaign.store.head();
    // the same institution_id addresses the same occupied slot whatever the optional reference: absent, equal or different
    for (const [n, institution] of [
      [2, institutionIdentity()],
      [3, institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, CONSTITUTIVE_SOURCE_A)],
      [4, institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, CONSTITUTIVE_SOURCE_B)],
    ] as const)
      expect(
        await codeOf(s.gip.establishInstitution({ ...gipPublication(n), institution })),
        `n=${n}`,
      ).not.toBe("OK");
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(s.campaign.store.head()).toEqual(head);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("two institutions may name the same constitutive source: it is not an identity dimension and links nothing", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(
          INSTITUTION_COURT,
          CONSTITUTIVE_SOURCE_A,
        ),
      }),
    );
    await must(
      s.gip.establishInstitution({
        ...gipPublication(2),
        institution: institutionIdentityWithConstitutiveSource(
          INSTITUTION_GUILD,
          CONSTITUTIVE_SOURCE_A,
        ),
      }),
    );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, guildKey]);
    expect(s.gip.institutionIdentity(INSTITUTION_COURT)?.value.constitutive_source_ref).toBe(
      CONSTITUTIVE_SOURCE_A,
    );
    expect(s.gip.institutionIdentity(INSTITUTION_GUILD)?.value.constitutive_source_ref).toBe(
      CONSTITUTIVE_SOURCE_A,
    );
  });
});

describe("establishment with the reference reads and depends on nothing and writes exactly one identity key (acceptance 8, 9)", () => {
  it("the committed group is one create-only write with no read and no dependency", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(),
      }),
    );
    expect(spy.commits).toHaveLength(1); // one commit, never a second
    const g = spy.commits[0]!;
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
    expect(g.writes).toHaveLength(1);
    expect(g.writes[0]!.key).toBe(courtKey);
    expect(g.writes[0]!.expected_version).toBe(0);
    expect(spy.listCalls()).toBe(0);
    // only the identity's own slot was probed
    for (const k of spy.getFacts) expect(k).toBe(courtKey);
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([courtKey]);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    const group = s.campaign.store.committedGroup(gipPublication(1).intent_id)!;
    expect(group.reads).toEqual([]);
    expect(group.depends_on).toEqual([]);
  });

  it("no Governance Instrument, Office, Scope Binding or other GIP source record is created by carrying a reference", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, INSTRUMENT_A),
      }),
    );
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeUndefined();
  });
});

describe("a conflicting establishment fails closed under the existing reconciliation rules (acceptance 7)", () => {
  it("the same intent with a changed, added or removed reference is a changed-intent conflict; the committed identity stands", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(
          INSTITUTION_COURT,
          CONSTITUTIVE_SOURCE_A,
        ),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    const head = s.campaign.store.head();
    for (const institution of [
      institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, CONSTITUTIVE_SOURCE_B),
      institutionIdentity(),
    ])
      expect(
        await codeOf(s.gip.establishInstitution({ ...gipPublication(1), institution })),
        JSON.stringify(institution),
      ).not.toBe("OK");
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(s.campaign.store.head()).toEqual(head);

    // and the reverse: a legacy identity is not silently given a reference by a changed retry
    const s2 = await seededGipCampaign(tempDir());
    await establishInstitution(s2, 1);
    const legacy = structuredClone(s2.campaign.store.getFact(courtKey));
    expect(
      await codeOf(
        s2.gip.establishInstitution({
          ...gipPublication(1),
          institution: institutionIdentityWithConstitutiveSource(),
        }),
      ),
    ).not.toBe("OK");
    expect(s2.campaign.store.getFact(courtKey)).toEqual(legacy);
  });

  it("a different establishment at an occupied institution_id fails closed and mints no sibling identity", async () => {
    const s = await seededGipCampaign(tempDir());
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(courtKey));
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(2),
          institution: institutionIdentityWithConstitutiveSource(
            INSTITUTION_COURT,
            CONSTITUTIVE_SOURCE_B,
            {
              identity_label: "A rival label",
            },
          ),
        }),
      ),
    ).not.toBe("OK");
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.campaign.store.getFact(courtKey)).toEqual(fact);
  });

  it("a malformed, plural, aliased or null reference is refused with nothing committed", async () => {
    const s = await seededGipCampaign(tempDir());
    const head = s.campaign.store.head();
    for (const bad of [
      { ...institutionIdentity(), constitutive_source_ref: null },
      { ...institutionIdentity(), constitutive_source_ref: "" },
      { ...institutionIdentity(), constitutive_source_ref: "two words" },
      { ...institutionIdentity(), constitutive_source_ref: [CONSTITUTIVE_SOURCE_A] },
      { ...institutionIdentity(), constitutive_source_ref: { id: CONSTITUTIVE_SOURCE_A } },
      { ...institutionIdentity(), constitutive_source_refs: [CONSTITUTIVE_SOURCE_A] },
      { ...institutionIdentity(), constitutive_source: CONSTITUTIVE_SOURCE_A },
      { ...institutionIdentityWithConstitutiveSource(), predecessor_ids: [] },
      { ...institutionIdentityWithConstitutiveSource(), successor_ids: [] },
      { ...institutionIdentityWithConstitutiveSource(), continuity_status: "renamed" },
    ])
      expect(
        await codeOf(
          s.gip.establishInstitution({ ...gipPublication(1), institution: bad as never }),
        ),
        JSON.stringify(bad),
      ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
    expect(gipFacts(s)).toEqual([]);
  });
});

describe("existing Office / Scope Binding / Governance Instrument semantics are unchanged beneath an identity carrying a reference (acceptance 10)", () => {
  it("the full chain establishes exactly as it does beneath a legacy identity; the identity is read by exact key only and is never rewritten", async () => {
    const chain = async (identity: ReturnType<typeof institutionIdentity>) => {
      const s = await seededGipCampaign(tempDir());
      await must(s.gip.establishInstitution({ ...gipPublication(1), institution: identity }));
      await establishOffice(s, 2);
      await establishScopeBinding(s, 3);
      await establishGovernanceInstrument(s, 4);
      expect(s.campaign.verify()).toEqual([]);
      return s;
    };
    const legacy = await chain(institutionIdentity());
    const withRef = await chain(institutionIdentityWithConstitutiveSource());
    const keys = (s: Awaited<ReturnType<typeof chain>>) => gipFacts(s).map((f) => f.key);
    expect(keys(withRef)).toEqual(keys(legacy));
    // every non-identity GIP fact is value-for-value identical: the reference leaks into none of them
    for (const key of keys(legacy).filter((k) => k !== courtKey)) {
      const a = legacy.campaign.store.getFact(key)!;
      const b = withRef.campaign.store.getFact(key)!;
      expect(b.value, key).toEqual(a.value);
      expect(b.provenance.rule, key).toEqual(a.provenance.rule);
      expect(JSON.stringify(b.value)).not.toContain(CONSTITUTIVE_SOURCE_A);
    }
    // the office's pinned prerequisite is the identity at its version: an identity with a reference is just an identity
    const office = withRef.campaign.store.committedGroup(gipPublication(2).intent_id)!;
    expect(office.reads.map((r: any) => r.key)).toEqual([courtKey]);
    expect(office.depends_on).toEqual([gipPublication(1).group_id]);
    // the instrument chain created exactly one instrument, not a constitutive one
    expect(withRef.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeDefined();
    expect(withRef.campaign.store.getFact(courtKey)!.version).toBe(1);
  });
});

describe("load-time integrity accepts the optional field when valid and fails closed on malformed or tampered shapes (acceptance 4, 5, 13)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    await must(
      s.gip.establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentityWithConstitutiveSource(INSTITUTION_COURT),
      }),
    );
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir);
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign carrying the field opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const edits: Record<string, (fact: any) => void> = {
    "reference rewritten": (f) => (f.value.constitutive_source_ref = CONSTITUTIVE_SOURCE_B),
    "reference removed": (f) => delete f.value.constitutive_source_ref,
    "reference nulled": (f) => (f.value.constitutive_source_ref = null),
    "reference emptied": (f) => (f.value.constitutive_source_ref = ""),
    "reference made plural": (f) => (f.value.constitutive_source_ref = [CONSTITUTIVE_SOURCE_A]),
    "reference made structured": (f) => (f.value.constitutive_source_ref = { id: "x" }),
    "reference malformed": (f) => (f.value.constitutive_source_ref = "two words"),
    "reference aliased": (f) => {
      f.value.constitutive_source_refs = [f.value.constitutive_source_ref];
      delete f.value.constitutive_source_ref;
    },
    "predecessor added": (f) => (f.value.predecessor_ids = ["institution-old"]),
    "successor added": (f) => (f.value.successor_ids = ["institution-new"]),
    "status renamed": (f) => (f.value.continuity_status = "renamed"),
    "identity rewritten": (f) => (f.value.institution_id = "institution-forged"),
    "label rewritten": (f) => (f.value.identity_label = "A rival label"),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "version changed": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
  };
  it("any edit of a saved identity carrying the reference — value, key, version or provenance — is not silently accepted", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === courtKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 60_000);

  it("adding a reference to a saved LEGACY identity is not silently accepted either: no migration or rewrite is a lawful path", async () => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    j.facts.find((f: any) => f.key === guildKey).value.constitutive_source_ref =
      CONSTITUTIVE_SOURCE_A;
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a journal edit of the committed group of an identity carrying the reference fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain(CONSTITUTIVE_SOURCE_A);
    writeFileSync(journal, text.replace(CONSTITUTIVE_SOURCE_A, CONSTITUTIVE_SOURCE_B));
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});

describe("a crash or lost reply converges on the one identity carrying the reference (acceptance 2, 7)", () => {
  it("a lost reply after the commit is reconciled to the original receipt; the changed retry fails", async () => {
    const s = await seededGipCampaign(tempDir());
    const lostReply = (inner: CampaignStore): CampaignStore => ({
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: async (g: any) => {
        await inner.commit(g);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never;
      },
    });
    const authored = institutionIdentityWithConstitutiveSource();
    const reply = await new GipAdapter(lostReply(s.campaign.store)).establishInstitution({
      ...gipPublication(1),
      institution: authored,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(1).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: authored }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(
      await codeOf(
        s.gip.establishInstitution({
          ...gipPublication(1),
          institution: institutionIdentityWithConstitutiveSource(
            INSTITUTION_COURT,
            CONSTITUTIVE_SOURCE_B,
          ),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(courtKey)!.value).toEqual(authored);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
