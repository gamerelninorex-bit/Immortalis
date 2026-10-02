/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// Diplomacy Framework Authoritative Core — save → close → load → continue across every durable cut of the establishment, a
// failure at EVERY durable step of the one authored publication, and load-time failure on a corrupted or inconsistent save. The
// framework path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry,
// replay or reload the Framework exists exactly once, keeps its canonical key, authored fields, provenance and governing rule, and is
// never re-created, improved, rewritten, copied per member or indexed (no derived index is ever persisted, and no randomness exists).
// Register lineage: IA-06, IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diplomacyFrameworkKey } from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DIPLOMACY_FRAMEWORK_RULE,
  DiplomacyAdapter,
  GIP_OFFICE_RULE,
  GIP_RULE,
  createFileCampaign,
  nodeFs,
  verifyDiplomacyIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FRAMEWORK_A,
  FRAMEWORK_B,
  FRAMEWORK_DECISION_RULE_REF_A,
  diplomacyPublication,
  diplomaticFramework,
  fullDiplomaticFramework,
  group,
  instrumentFs,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishExternalRecognition,
  establishExternalizedClaimDispute,
  establishDiplomaticFramework,
  establishRelationEdge,
  reopenDiplomacy,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = FRAMEWORK_A) => diplomacyFrameworkKey(id);

const plan = [FRAMEWORK_A, FRAMEWORK_B] as const;

describe("save → close → load → continue at every durable cut of the establishment", () => {
  for (const cut of [0, 1, 2] as const) {
    it(`${cut} Framework(s) saved: reloads unchanged, verifies, and the continuation converges on the same two records`, async () => {
      const dir = tempDir();
      const s = await seededDiplomacyCampaign(dir);
      for (let i = 0; i < cut; i++) await establishDiplomaticFramework(s, i + 1, plan[i]);
      const saved = structuredClone(diplomacyFacts(s));
      await s.campaign.close();

      const r = await reopenDiplomacy(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(diplomacyFacts(r)).toEqual(saved);
      for (let i = 0; i < plan.length; i++) {
        const out = await r.diplomacy.establishDiplomaticFramework({
          ...diplomacyPublication(i + 1),
          framework: diplomaticFramework(plan[i]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(diplomacyFacts(r).map((f) => f.key)).toEqual([key(FRAMEWORK_A), key(FRAMEWORK_B)]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves every authored field exactly — optional fields present and absent, open values, array shape — key, version, provenance, governing rule and receipt; nothing is re-published and no derived index appears", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    const authored = fullDiplomaticFramework(FRAMEWORK_A, {
      framework_basis: { basis: "open", n: [1, null] },
      member_refs: ["m2", "m1", "m2"],
      charter_or_instrument_refs: [],
      membership_rules: { rule: "x", n: 1 },
      entry_exit_rules: false,
      shared_commitment_refs: ["c1", "c1"],
      lifecycle_status: 7,
    });
    await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(1), framework: authored }),
    );
    await establishDiplomaticFramework(s, 2, "bare", {
      member_refs: [],
      charter_or_instrument_refs: [],
      shared_commitment_refs: [],
    });
    const facts = [key(FRAMEWORK_A), key("bare")].map((k) =>
      structuredClone(s.campaign.store.getFact(k)!),
    );
    const receipt = structuredClone(
      s.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id),
    );
    const committed = structuredClone(
      s.campaign.store.committedGroup(diplomacyPublication(1).intent_id),
    );
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    for (const f of facts) expect(r.campaign.store.getFact(f.key)).toEqual(f);
    expect(r.campaign.store.getFact(key())!.value).toEqual(authored);
    expect(r.diplomacy.diplomaticFramework("bare")!.value.member_refs).toEqual([]);
    // the conditional reference stays absent where it was never authored, and present where it was
    expect(
      "collective_decision_rule_ref" in (r.campaign.store.getFact(key("bare"))!.value as any),
    ).toBe(false);
    expect((r.campaign.store.getFact(key())!.value as any).collective_decision_rule_ref).toBe(
      FRAMEWORK_DECISION_RULE_REF_A,
    );
    expect(r.campaign.store.getFact(key())!.provenance.rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    expect(r.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(diplomacyPublication(1).intent_id)).toEqual(committed);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    for (const f of r.campaign.store.listFacts())
      for (const idx of [
        "channel_refs",
        "recognition_refs",
        "active_claim_dispute_refs",
        "instrument_refs",
        "framework_refs",
      ])
        expect(idx in (f.value as any), `${f.key} ${idx}`).toBe(false);
    // the Framework is stored once: no per-member copy exists
    expect(
      diplomacyFacts(r)
        .map((f) => f.key)
        .sort(),
    ).toEqual([key(), key("bare")].sort());
    expect(verifyDiplomacyIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("a reload alongside an existing recognition, dispute and relation edge creates no association and no derived index: they stay byte-identical", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishExternalRecognition(s, 1, "rec-1");
    await establishExternalizedClaimDispute(s, 2, "disp-1");
    await establishRelationEdge(s, 4, "rel-1");
    await establishDiplomaticFramework(s, 3);
    const saved = structuredClone(diplomacyFacts(s));
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    expect(diplomacyFacts(r)).toEqual(saved);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });

  it("after a reload every post-establishment change is still refused, and a conflicting establishment still fails closed", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishDiplomaticFramework(s, 1);
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    const fact = structuredClone(r.campaign.store.getFact(key()));
    const conflict = await r.diplomacy.establishDiplomaticFramework({
      ...diplomacyPublication(9),
      framework: diplomaticFramework(FRAMEWORK_A, { lifecycle_status: "retired" }),
    });
    expect(!conflict.ok && conflict.error.code).toBe("VERSION_CONFLICT");
    const amend = await r.campaign.store.commit(
      group(
        FIXTURE_CAMPAIGN,
        10,
        [
          write(key(), diplomaticFramework(FRAMEWORK_A, { lifecycle_status: "retired" }) as never, {
            owner: "diplomacy",
            facet: "diplomacy_framework",
            expected_version: 1,
          }),
        ],
        {
          owner: "diplomacy",
          facet: "diplomacy_framework",
          rule: DIPLOMACY_FRAMEWORK_RULE,
        },
      ),
    );
    expect(!amend.ok && amend.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(r.campaign.store.getFact(key())).toEqual(fact);
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

  it("a crash before the commit and a lost reply after it each converge on one record; a committed one is adopted, never re-created", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const crash = new DiplomacyAdapter(crashBefore(s.campaign.store));
    const failed = await crash.establishDiplomaticFramework({
      ...diplomacyPublication(1),
      framework: diplomaticFramework(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(1),
        framework: diplomaticFramework(),
      }),
    );
    expect(diplomacyFacts(s).filter((f) => f.key === key())).toHaveLength(1);

    const second = diplomaticFramework(FRAMEWORK_B);
    const lost = new DiplomacyAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishDiplomaticFramework({
      ...diplomacyPublication(2),
      framework: second,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(diplomacyPublication(2).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(2), framework: second }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key(), key(FRAMEWORK_B)]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a failure injected before or after every durable step of the file package converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await seededDiplomacyCampaign(dir, { canonical: false });
      await s.campaign.close();
    };
    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(
      new DiplomacyAdapter(pc.store).establishDiplomaticFramework({
        ...diplomacyPublication(1),
        framework: diplomaticFramework(),
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
        const r = await new DiplomacyAdapter(c.store).establishDiplomaticFramework({
          ...diplomacyPublication(1),
          framework: diplomaticFramework(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(diplomacyPublication(1).intent_id) !== null;
        // never a partial state: the Framework exists exactly when its receipt does
        expect(reopened.store.getFact(key()) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        const retry = await must(
          new DiplomacyAdapter(reopened.store).establishDiplomaticFramework({
            ...diplomacyPublication(1),
            framework: diplomaticFramework(),
          }),
        );
        expect(retry.replayed).toBe(committed);
        expect(
          reopened.store
            .listFacts()
            .filter((f) => f.key.startsWith("diplomacy/"))
            .map((f) => f.key),
        ).toEqual([key()]);
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

describe("load fails closed on a corrupted or tampered framework save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await must(
      s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(1),
        framework: fullDiplomaticFramework(FRAMEWORK_A),
      }),
    );
    await establishDiplomaticFramework(s, 2, FRAMEWORK_B);
    await establishExternalizedClaimDispute(s, 3, "d1");
    await establishExternalRecognition(s, 4);
    await establishRelationEdge(s, 5, "r1");
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

  it("a valid saved campaign opens (control)", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const edits: Record<string, (fact: any) => void> = {
    "framework identity rewritten": (f) => (f.value.framework_id = "framework-forged"),
    "member_refs made a string": (f) => (f.value.member_refs = f.value.member_refs[0]),
    "member_refs removed": (f) => delete f.value.member_refs,
    "member_refs element made structured": (f) => (f.value.member_refs = [{ p: "a" }]),
    "charter_or_instrument_refs made a string": (f) => (f.value.charter_or_instrument_refs = "c"),
    "charter_or_instrument_refs removed": (f) => delete f.value.charter_or_instrument_refs,
    "shared_commitment_refs made a string": (f) => (f.value.shared_commitment_refs = "c"),
    "shared_commitment_refs removed": (f) => delete f.value.shared_commitment_refs,
    "framework_basis made an array": (f) => (f.value.framework_basis = [f.value.framework_basis]),
    "framework_basis removed": (f) => delete f.value.framework_basis,
    "membership_rules made an array": (f) => (f.value.membership_rules = ["m"]),
    "membership_rules removed": (f) => delete f.value.membership_rules,
    "entry_exit_rules made an array": (f) => (f.value.entry_exit_rules = ["e"]),
    "entry_exit_rules removed": (f) => delete f.value.entry_exit_rules,
    "lifecycle_status removed": (f) => delete f.value.lifecycle_status,
    "lifecycle_status made an array": (f) => (f.value.lifecycle_status = ["open"]),
    "collective_decision_rule_ref made an array": (f) =>
      (f.value.collective_decision_rule_ref = ["r"]),
    "collective_decision_rule_ref emptied": (f) => (f.value.collective_decision_rule_ref = ""),
    "provenance_ref removed": (f) => delete f.value.provenance_ref,
    "provenance_ref made an array": (f) => (f.value.provenance_ref = ["p"]),
    "provenance reference emptied": (f) => (f.value.provenance_ref = ""),
    "framework_refs smuggled in": (f) => (f.value.framework_refs = []),
    "channel_refs smuggled in": (f) => (f.value.channel_refs = []),
    "recognition_refs smuggled in": (f) => (f.value.recognition_refs = ["x"]),
    "instrument_refs smuggled in": (f) => (f.value.instrument_refs = []),
    "dependency_refs smuggled in": (f) => (f.value.dependency_refs = []),
    "alias for a source identifier": (f) => {
      f.value.members = f.value.member_refs;
      delete f.value.member_refs;
    },
    "score field added": (f) => (f.value.framework_score = 1),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "owner changed": (f) => (f.owner = "gip"),
    "facet changed": (f) => (f.facet = "diplomacy_relation_edge"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
    "provenance lineage altered": (f) => f.provenance.rule.authority_lineage.pop(),
    "provenance rule substituted by GIP's": (f) => (f.provenance.rule = structuredClone(GIP_RULE)),
    "provenance rule substituted by the recognition's": (f) =>
      (f.provenance.rule = structuredClone(DIPLOMACY_RECOGNITION_RULE)),
    "provenance rule substituted by the dispute's": (f) =>
      (f.provenance.rule = structuredClone(DIPLOMACY_CLAIM_DISPUTE_RULE)),
    "provenance rule substituted by the relation edge's": (f) =>
      (f.provenance.rule = structuredClone(DIPLOMACY_RELATION_EDGE_RULE)),
  };
  it("an edit of a saved Framework — value, indexes, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === key()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a state-file edit that moves the Framework or appends a per-member copy is detected", async () => {
    for (const name of ["moved key", "per-member copy appended"]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      const a = j.facts.find((f: any) => f.key === key());
      if (name === "moved key") a.key = key("framework-elsewhere");
      else {
        const copy = structuredClone(j.facts.find((f: any) => f.key === key(FRAMEWORK_B)));
        copy.key = key("framework-per-member");
        // a copy under a mismatched identity is a key/identity mismatch
        copy.value.framework_id = "framework-other";
        j.facts.push(copy);
      }
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a journal edit of the Framework's committed group fails replay: its authored fields, its references or an injected derived index (framework_refs[])", async () => {
    for (const [from, to] of [
      [
        '"lifecycle_status":"SYNTHETIC FIXTURE: an authored lifecycle status."',
        '"lifecycle_status":"forged"',
      ],
      ['"member_refs":["framework-member-ref-a-1"', '"member_refs":["framework-member-ref-forged"'],
      [
        '"collective_decision_rule_ref":"framework-decision-rule-ref-a-1"',
        '"collective_decision_rule_ref":"forged"',
      ],
      ['"provenance_ref":"framework-provenance-ref-a-1"', '"provenance_ref":"forged"'],
      ['"framework_id":"framework-a-1"', '"framework_id":"framework-a-1","framework_refs":[]'],
    ] as const) {
      const dir = await saved();
      const journal = join(dir, "journal.jsonl");
      const text = readFileSync(journal, "utf8");
      expect(text, from).toContain(from);
      writeFileSync(journal, text.replace(from, to));
      expect(await openOutcome(dir), from).not.toBe("OK");
    }
  });

  /** A Framework built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (
    n: number,
    k: string,
    value: unknown,
    rule: unknown,
    groupOver: any = {},
    over: any = {},
    owner = "diplomacy",
    facet = "diplomacy_framework",
  ) =>
    group(FIXTURE_CAMPAIGN, n, [write(k, value as never, { owner, facet, ...over })], {
      owner,
      facet,
      rule: rule as never,
      ...groupOver,
    });
  const fw = (
    n = 1,
    value: unknown = diplomaticFramework(),
    groupOver: any = {},
    rule: unknown = DIPLOMACY_FRAMEWORK_RULE,
    k = key(),
    over: any = {},
  ) => put(n, k, value, rule, groupOver, over);
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));

  it("a lawful Framework history built by an admission-free store still verifies (control)", async () => {
    expect(
      await base(async (s) => {
        await must(s.commit(fw(1)));
        await must(
          s.commit(fw(2, fullDiplomaticFramework(FRAMEWORK_B), {}, undefined, key(FRAMEWORK_B))),
        );
      }),
    ).toBe("OK");
  });

  it("a Framework established reading or depending on anything is detected on load: no dependency is invented", async () => {
    expect(
      await base(async (s) => {
        await must(
          s.commit(put(1, key("other"), diplomaticFramework("other"), DIPLOMACY_FRAMEWORK_RULE)),
        );
        await must(
          s.commit(
            fw(2, diplomaticFramework(), {
              reads: [{ key: key("other"), version: 1 }],
              depends_on: ["group-1"],
            }),
          ),
        );
      }),
    ).toMatch(/DIPLOMACY_STATE/);
  });

  it("a second write in the Framework group, a non-create write and a Framework moved forward are detected on load", async () => {
    expect(
      await base(async (s) => {
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              1,
              [
                write(key(), diplomaticFramework() as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_framework",
                }),
                write(key(FRAMEWORK_B), diplomaticFramework(FRAMEWORK_B) as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_framework",
                }),
              ],
              {
                owner: "diplomacy",
                facet: "diplomacy_framework",
                rule: DIPLOMACY_FRAMEWORK_RULE,
              },
            ),
          ),
        );
      }),
    ).toMatch(/DIPLOMACY_STATE/);
    expect(
      await base(async (s) => {
        await must(s.commit(fw(1)));
        await must(
          s.commit(
            fw(
              2,
              diplomaticFramework(FRAMEWORK_A, { lifecycle_status: "retired" }),
              {},
              undefined,
              key(),
              { expected_version: 1 },
            ),
          ),
        );
      }),
    ).toMatch(/DIPLOMACY_STATE/);
  });

  it("owner drift, rule drift, a deferred-surface value and a key/value identity mismatch are each detected on load", async () => {
    expect(
      await base(async (s) => {
        await must(
          s.commit(
            put(
              1,
              key(),
              diplomaticFramework(),
              DIPLOMACY_FRAMEWORK_RULE,
              { owner: "world_state", facet: "world_profile" },
              { owner: "world_state", facet: "world_profile" },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    for (const rule of [
      { ...DIPLOMACY_FRAMEWORK_RULE, clause: "drifted" },
      { ...DIPLOMACY_FRAMEWORK_RULE, native_pin: "2026-09-25T00:00:00.000Z" },
      DIPLOMACY_RECOGNITION_RULE,
      DIPLOMACY_CLAIM_DISPUTE_RULE,
      DIPLOMACY_RELATION_EDGE_RULE,
      GIP_RULE,
      GIP_OFFICE_RULE,
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(fw(1, diplomaticFramework(), undefined, rule)));
        }),
        JSON.stringify(rule).slice(0, 60),
      ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...diplomaticFramework(), framework_refs: [] },
      { ...diplomaticFramework(), channel_refs: [] },
      { ...diplomaticFramework(), recognition_refs: ["r"] },
      { ...diplomaticFramework(), instrument_refs: [] },
      { ...diplomaticFramework(), dependency_refs: [] },
      { ...diplomaticFramework(), member_refs: "a" },
      { ...diplomaticFramework(), lifecycle_status: ["a"] },
      { ...diplomaticFramework(), collective_decision_rule_ref: ["a"] },
      (() => {
        const noBasis: any = diplomaticFramework();
        delete noBasis.framework_basis;
        return noBasis;
      })(),
      (() => {
        const noProvenance: any = diplomaticFramework();
        delete noProvenance.provenance_ref;
        return noProvenance;
      })(),
      { ...diplomaticFramework(), members: ["x"] },
      diplomaticFramework(FRAMEWORK_B), // names another framework than its key
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(fw(1, bad)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier is silent on a healthy campaign and reports a tampered Framework by key", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    expect(verifyDiplomacyIntegrity(s.campaign.store)).toEqual([]);
    const inner = s.campaign.store;
    const tampered = {
      getFact: (k: string) => inner.getFact(k),
      committedGroup: (i: string) => inner.committedGroup(i),
      listFacts: () => inner.listFacts().map((f) => (f.key === key() ? { ...f, version: 2 } : f)),
    } as unknown as CampaignStore;
    expect(verifyDiplomacyIntegrity(tampered).map((v) => [v.key, v.code])).toEqual([
      [key(), "DIPLOMACY_STATE"],
    ]);
  });
});
