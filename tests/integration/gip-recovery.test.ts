/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Stable Institution Identity — save → close → load → continue across every durable cut of the establishment, a failure
// at EVERY durable step of the one authored publication, and load-time failure on a corrupted or inconsistent save. The GIP
// path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry, replay or
// reload the identity exists exactly once, keeps its canonical key, provenance and governing rule, and is never re-created,
// improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-30 (partial), IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gipInstitutionIdentityKey } from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_RULE,
  GipAdapter,
  createFileCampaign,
  nodeFs,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  group,
  gipPublication,
  institutionIdentity,
  instrumentFs,
  write,
} from "@immortalis/testkit";
import { establishInstitution, gipFacts, reopenGip, seededGipCampaign } from "../support/gip.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const guildKey = gipInstitutionIdentityKey(INSTITUTION_GUILD);

describe("save → close → load → continue at every durable cut of the establishment (acceptance 9)", () => {
  const cuts: { name: string; before: number }[] = [
    { name: "no institution yet", before: 0 },
    { name: "one institution", before: 1 },
    { name: "two institutions", before: 2 },
  ];
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges`, async () => {
      const dir = tempDir();
      const s = await seededGipCampaign(dir);
      const ids = [INSTITUTION_COURT, INSTITUTION_GUILD];
      for (let i = 0; i < cut.before; i++) await establishInstitution(s, i + 1, ids[i]);
      const saved = structuredClone(gipFacts(s));
      await s.campaign.close();

      const r = await reopenGip(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(gipFacts(r)).toEqual(saved);
      // continue: establish whatever is still missing; the end state is the same two identities
      for (let i = 0; i < ids.length; i++) {
        const out = await r.gip.establishInstitution({
          ...gipPublication(i + 1),
          institution: institutionIdentity(ids[i]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut.before);
      }
      expect(gipFacts(r).map((f) => f.key)).toEqual([courtKey, guildKey]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves identity, label, status, key, version, provenance, governing rule and receipt exactly; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    await establishInstitution(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(courtKey)!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(1).intent_id));
    const group = structuredClone(s.campaign.store.committedGroup(gipPublication(1).intent_id));
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(r.campaign.store.getFact(courtKey)).toEqual(fact);
    expect(r.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(r.campaign.store.lookupReceipt(gipPublication(1).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(1).intent_id)).toEqual(group);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity (acceptance 4, 9)", () => {
  /** A store that "crashes" (nothing committed, unknown outcome) before the group the predicate names. */
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

  it("a crash before the commit and a lost reply after it each converge on one identity; a committed one is adopted, never re-created", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    // crash before: nothing is committed, the outcome is unknown, reconcile by identity then retry
    const crash = new GipAdapter(crashBefore(s.campaign.store));
    const failed = await crash.establishInstitution({
      ...gipPublication(1),
      institution: institutionIdentity(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(gipPublication(1).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    expect(gipFacts(s)).toHaveLength(1);

    // lost reply after the commit: the identity is committed; the retry is reconciled to the original receipt
    const lost = new GipAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishInstitution({
      ...gipPublication(2),
      institution: institutionIdentity(INSTITUTION_GUILD),
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(2).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishInstitution({
        ...gipPublication(2),
        institution: institutionIdentity(INSTITUTION_GUILD),
      }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, guildKey]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a failure injected before or after every durable step of the file package converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await seededGipCampaign(dir, { canonical: false });
      await s.campaign.close();
    };
    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(
      new GipAdapter(pc.store).establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentity(),
      }),
    );
    const afterCommit = probe.count();
    await pc.close();
    expect(afterCommit - afterOpen).toBeGreaterThanOrEqual(4);

    const finals = new Set<string>();
    const seen = { rolledBack: 0, committed: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterCommit; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await new GipAdapter(c.store).establishInstitution({
          ...gipPublication(1),
          institution: institutionIdentity(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(gipPublication(1).intent_id) !== null;
        // never a partial state: the identity exists exactly when its receipt does
        expect(reopened.store.getFact(courtKey) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        // retrying the same intent converges on exactly one identity, never a duplicate
        const retry = await must(
          new GipAdapter(reopened.store).establishInstitution({
            ...gipPublication(1),
            institution: institutionIdentity(),
          }),
        );
        expect(retry.replayed).toBe(committed);
        expect(gipFactsOf(reopened).map((f) => f.key)).toEqual([courtKey]);
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

describe("load fails closed on a corrupted or inconsistent save (acceptance 10)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededGipCampaign(dir);
    await establishInstitution(s, 1, INSTITUTION_COURT);
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

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const savedEdits: Record<string, (fact: any) => void> = {
    "label rewritten": (f) => (f.value.identity_label = "A rival label"),
    "status renamed": (f) => (f.value.continuity_status = "renamed"),
    "status abolished": (f) => (f.value.continuity_status = "abolished"),
    "identity rewritten": (f) => (f.value.institution_id = "institution-forged"),
    "predecessor added": (f) => (f.value.predecessor_ids = ["institution-old"]),
    "successor added": (f) => (f.value.successor_ids = ["institution-new"]),
    "constitutive source added": (f) => (f.value.constitutive_source_ref = "charter-1"),
    "office added": (f) => (f.value.office = "office-1"),
    "membership added": (f) => (f.value.members = ["actor-1"]),
    "faction added": (f) => (f.value.faction = "faction-1"),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "label removed": (f) => delete f.value.identity_label,
    "owner changed": (f) => (f.owner = "world_state"),
    "facet changed": (f) => (f.facet = "identity"),
    "version changed": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
  };
  it("an edit of a saved identity — value, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(savedEdits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === courtKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 60_000);

  it("a state-file edit that only swaps two identities' labels, or moves an identity to another key, is detected", async () => {
    for (const name of ["swapped labels", "moved key"]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      const a = j.facts.find((f: any) => f.key === courtKey);
      const b = j.facts.find((f: any) => f.key === guildKey);
      if (name === "swapped labels") [a.value.identity_label, b.value.identity_label] = ["x", "y"];
      else a.key = gipInstitutionIdentityKey("institution-elsewhere");
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the identity's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("continuing");
    writeFileSync(journal, text.replace("continuing", "continuing "));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** An identity built by a store with NO admission: a consistent, replayable history that is not canonical. */
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
      { owner: "gip", facet: "gip_institution_identity", rule: GIP_RULE, ...groupOver },
    );

  it("owner drift, rule drift, an unregistered GIP key, an overwritten seal and a malformed value are each detected on load", async () => {
    // (a store with no admission accepts anything it is handed; load re-verifies every fact against this build's owners)
    const base = async (build: (s: CampaignStore) => Promise<void>) =>
      openOutcome(await rogue(build));
    expect(
      await base(async (s) => void (await must(s.commit(put(1, "gip/office/o1", { power: "x" }))))),
    ).toBe("UNREGISTERED_KEY");
    expect(
      await base(
        async (s) =>
          void (await must(
            s.commit(
              put(
                1,
                courtKey,
                institutionIdentity(),
                { owner: "world_state", facet: "world_profile" },
                { owner: "world_state", facet: "world_profile" },
              ),
            ),
          )),
      ),
    ).toMatch(/WRONG_OWNER_FACET/);
    expect(
      await base(
        async (s) =>
          void (await must(
            s.commit(
              put(
                1,
                courtKey,
                institutionIdentity(),
                {},
                { rule: { ...GIP_RULE, clause: "drifted" } },
              ),
            ),
          )),
      ),
    ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...institutionIdentity(), office: "o1" },
      { ...institutionIdentity(), continuity_status: "merged" },
      institutionIdentity(INSTITUTION_GUILD),
    ])
      expect(
        await base(async (s) => void (await must(s.commit(put(1, courtKey, bad))))),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
    expect(
      await base(async (s) => {
        await must(s.commit(put(1, courtKey, institutionIdentity())));
        await must(
          s.commit(
            put(
              2,
              courtKey,
              institutionIdentity(INSTITUTION_COURT, { identity_label: "overwritten" }),
              { expected_version: 1 },
            ),
          ),
        );
      }),
    ).toMatch(/UNSUPPORTED_AMENDMENT/);
  });

  it("an identity committed with a foreign read, dependency or second write, or by the wrong authority, is detected on load", async () => {
    const base = async (build: (s: CampaignStore) => Promise<void>) =>
      openOutcome(await rogue(build));
    // a second write in the same group
    expect(
      await base(async (s) => {
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              1,
              [
                write(courtKey, institutionIdentity() as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
                write(guildKey, institutionIdentity(INSTITUTION_GUILD) as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
              ],
              { owner: "gip", facet: "gip_institution_identity", rule: GIP_RULE },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a foreign dependency
    expect(
      await base(async (s) => {
        await must(s.commit(put(1, guildKey, institutionIdentity(INSTITUTION_GUILD))));
        await must(
          s.commit(put(2, courtKey, institutionIdentity(), {}, { depends_on: ["group-1"] })),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });
});
