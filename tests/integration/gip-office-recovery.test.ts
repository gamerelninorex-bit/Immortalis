import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Office / Authority Locus — save → close → load → continue across every durable cut of the establishment, a failure at
// EVERY durable step of the one authored office publication, and load-time failure on a corrupted or inconsistent save. The
// office path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry,
// replay or reload the office exists exactly once, keeps its canonical key, authority fields, prerequisite pin, provenance and
// governing rule, and is never re-created, improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-30 (partial), IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gipInstitutionIdentityKey, gipOfficeAuthorityLocusKey } from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_OFFICE_RULE,
  GIP_RULE,
  GipAdapter,
  createFileCampaign,
  nodeFs,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  HOLDER_REF_B,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  group,
  gipPublication,
  institutionIdentity,
  instrumentFs,
  officeAuthorityLocus,
  write,
} from "@immortalis/testkit";
import {
  establishInstitution,
  establishOffice,
  gipFacts,
  reopenGip,
  seededGipCampaign,
} from "../support/gip.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);

async function withCourt(dir = tempDir(), o: { canonical?: boolean } = {}) {
  const s = await seededGipCampaign(dir, o);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  return s;
}

describe("save → close → load → continue at every durable cut of the office establishment", () => {
  const cuts: { name: string; before: number }[] = [
    { name: "an institution and no office yet", before: 0 },
    { name: "one office", before: 1 },
    { name: "two offices", before: 2 },
  ];
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges`, async () => {
      const dir = tempDir();
      const s = await withCourt(dir);
      const ids = [OFFICE_MAGISTRATE, OFFICE_TREASURER];
      for (let i = 0; i < cut.before; i++)
        await establishOffice(s, i + 2, INSTITUTION_COURT, ids[i]);
      const saved = structuredClone(gipFacts(s));
      await s.campaign.close();

      const r = await reopenGip(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(gipFacts(r)).toEqual(saved);
      // continue: establish whatever is still missing; the end state is the same two offices
      for (let i = 0; i < ids.length; i++) {
        const out = await r.gip.establishOffice({
          ...gipPublication(i + 2),
          office: officeAuthorityLocus(INSTITUTION_COURT, ids[i]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut.before);
      }
      expect(gipFacts(r).map((f) => f.key)).toEqual([courtKey, magistrateKey, treasurerKey]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves identity, authority fields, holder reference, key, version, prerequisite pin, provenance, governing rule and receipt exactly; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(2).intent_id));
    const committed = structuredClone(s.campaign.store.committedGroup(gipPublication(2).intent_id));
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(r.campaign.store.getFact(magistrateKey)).toEqual(fact);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(r.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(r.campaign.store.lookupReceipt(gipPublication(2).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(2).intent_id)).toEqual(committed);
    expect(committed!.reads).toEqual([{ key: courtKey, version: 1 }]);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity", () => {
  /** A store that "crashes" (nothing committed, unknown outcome) before the group. */
  const crashBefore = (inner: CampaignStore): CampaignStore => ({
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async () =>
      ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } }) as never,
  });
  /** A store that COMMITS the group and then loses the reply (unknown outcome). */
  const lostReply = (inner: CampaignStore): CampaignStore => ({
    ...crashBefore(inner),
    commit: async (g: any) => {
      await inner.commit(g);
      return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never;
    },
  });

  it("a crash before the commit and a lost reply after it each converge on one office; a committed one is adopted, never re-created", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    const crash = new GipAdapter(crashBefore(s.campaign.store));
    const failed = await crash.establishOffice({
      ...gipPublication(2),
      office: officeAuthorityLocus(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(gipPublication(2).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(s.gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }));
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);

    // lost reply after the commit: the office is committed; the retry is reconciled to the original receipt
    const lost = new GipAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishOffice({
      ...gipPublication(3),
      office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(3).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishOffice({
        ...gipPublication(3),
        office: officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
      }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, treasurerKey]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a failure injected before or after every durable step of the file package converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await withCourt(dir, { canonical: false });
      await s.campaign.close();
    };
    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(
      new GipAdapter(pc.store).establishOffice({
        ...gipPublication(2),
        office: officeAuthorityLocus(),
      }),
    );
    const afterCommit = probe.count();
    await pc.close();
    expect(afterCommit - afterOpen).toBeGreaterThanOrEqual(2);

    const finals = new Set<string>();
    const seen = { rolledBack: 0, committed: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterCommit; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await new GipAdapter(c.store).establishOffice({
          ...gipPublication(2),
          office: officeAuthorityLocus(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(gipPublication(2).intent_id) !== null;
        // never a partial state: the office exists exactly when its receipt does
        expect(reopened.store.getFact(magistrateKey) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        // retrying the same intent converges on exactly one office, never a duplicate
        const retry = await must(
          new GipAdapter(reopened.store).establishOffice({
            ...gipPublication(2),
            office: officeAuthorityLocus(),
          }),
        );
        expect(retry.replayed).toBe(committed);
        expect(gipFactsOf(reopened).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
        expect(reopened.verify()).toEqual([]);
        finals.add(reopened.store.head().state_sha256);
        await reopened.close();
        const again = await CanonicalCampaign.open(dir);
        expect(again.ok).toBe(true);
        if (again.ok) await again.value.close();
      }
    }
    expect(finals.size).toBe(1); // every crash point converges on the identical world
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 60_000);
});

const gipFactsOf = (c: CanonicalCampaign) =>
  c.store.listFacts().filter((f) => f.key.startsWith("gip/"));

describe("load fails closed on a corrupted or tampered office save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER, { holder_ref: HOLDER_REF_B });
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

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const savedEdits: Record<string, (fact: any) => void> = {
    "holder replaced": (f) => (f.value.holder_ref = "holder-ref-forged"),
    "authority source replaced": (f) => (f.value.authority_source_ref = "authority-source-forged"),
    "competence rewritten": (f) => (f.value.competence_scope = "rewritten"),
    "power added": (f) => f.value.powers.push("an added power"),
    "powers emptied": (f) => (f.value.powers = []),
    "duty added": (f) => f.value.duties.push("an added duty"),
    "selection rule rewritten": (f) => (f.value.selection_rule = "rewritten"),
    "succession rule rewritten": (f) => (f.value.succession_rule = "rewritten"),
    "removal rule rewritten": (f) => (f.value.removal_rule = "rewritten"),
    "office identity rewritten": (f) => (f.value.office_id = "office-forged"),
    "institution rewritten": (f) => (f.value.institution_id = INSTITUTION_GUILD),
    "decision body added": (f) => (f.value.decision_body_ref = "body-1"),
    "delegation added": (f) => (f.value.delegations = []),
    "holder authority copied": (f) => (f.value.holder_authority = ["tax"]),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "rule removed": (f) => delete f.value.removal_rule,
    "owner changed": (f) => (f.owner = "world_state"),
    "facet changed": (f) => (f.facet = "office"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
  };
  it("an edit of a saved office — value, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(savedEdits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === magistrateKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a state-file edit that swaps two offices' holders, moves an office to another key or removes its institution is detected", async () => {
    for (const name of ["swapped holders", "moved key", "institution removed"]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      const a = j.facts.find((f: any) => f.key === magistrateKey);
      const b = j.facts.find((f: any) => f.key === treasurerKey);
      if (name === "swapped holders")
        [a.value.holder_ref, b.value.holder_ref] = [b.value.holder_ref, a.value.holder_ref];
      else if (name === "moved key")
        a.key = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, "office-elsewhere");
      else j.facts = j.facts.filter((f: any) => f.key !== courtKey);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the office's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("SYNTHETIC FIXTURE: a first test power.");
    writeFileSync(
      journal,
      text.replace(
        "SYNTHETIC FIXTURE: a first test power.",
        "SYNTHETIC FIXTURE: a first test power!",
      ),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** An office built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (n: number, key: string, value: unknown, over: any = {}, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(key, value as never, { owner: "gip", facet: "gip_institution_identity", ...over })],
      { owner: "gip", facet: "gip_institution_identity", rule: GIP_OFFICE_RULE, ...groupOver },
    );
  const identity = (n = 1) => put(n, courtKey, institutionIdentity(), {}, { rule: GIP_RULE });
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));
  const pin = { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] };

  it("a lawful office history built by an admission-free store still verifies (control)", async () => {
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, officeAuthorityLocus(), {}, pin)));
      }),
    ).toBe("OK");
  });

  it("an office with no committed identity, a pin of nothing, a foreign dependency, a second write or a non-create write is detected on load", async () => {
    // no identity at all
    expect(
      await base(async (s) => {
        await must(s.commit(put(1, magistrateKey, officeAuthorityLocus())));
      }),
    ).toMatch(/GIP_STATE/);
    // an identity exists but the office pins nothing
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, officeAuthorityLocus())));
      }),
    ).toMatch(/GIP_STATE/);
    // a foreign dependency beside the identity (the other institution's identity group)
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(
          s.commit(
            put(2, guildKey, institutionIdentity(INSTITUTION_GUILD), {}, { rule: GIP_RULE }),
          ),
        );
        await must(
          s.commit(
            put(
              3,
              magistrateKey,
              officeAuthorityLocus(),
              {},
              {
                reads: pin.reads,
                depends_on: ["group-1", "group-2"],
              },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a second write in the office group
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              2,
              [
                write(magistrateKey, officeAuthorityLocus() as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
                write(
                  treasurerKey,
                  officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER) as never,
                  {
                    owner: "gip",
                    facet: "gip_institution_identity",
                  },
                ),
              ],
              { owner: "gip", facet: "gip_institution_identity", rule: GIP_OFFICE_RULE, ...pin },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("an office that was moved forward (a holder replacement) is detected on load, though the history is replayable", async () => {
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, officeAuthorityLocus(), {}, pin)));
        await must(
          s.commit(
            put(
              3,
              magistrateKey,
              officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
                holder_ref: HOLDER_REF_B,
              }),
              { expected_version: 1 },
              pin,
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("owner drift, rule drift, a deferred-surface value and a key/value identity mismatch are each detected on load", async () => {
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(
          s.commit(
            put(
              2,
              magistrateKey,
              officeAuthorityLocus(),
              { owner: "world_state", facet: "world_profile" },
              { owner: "world_state", facet: "world_profile", ...pin },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(
          s.commit(
            put(
              2,
              magistrateKey,
              officeAuthorityLocus(),
              {},
              {
                rule: { ...GIP_OFFICE_RULE, clause: "drifted" },
                ...pin,
              },
            ),
          ),
        );
      }),
    ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...officeAuthorityLocus(), decision_body_ref: "body-1" },
      { ...officeAuthorityLocus(), delegations: [] },
      officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(identity()));
          await must(s.commit(put(2, magistrateKey, bad, {}, pin)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });
});
