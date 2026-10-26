import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Authority Scope Binding — save → close → load → continue across every durable cut of the establishment, a failure at
// EVERY durable step of the one authored binding publication, and load-time failure on a corrupted or inconsistent save. The
// binding path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry,
// replay or reload the binding exists exactly once, keeps its canonical key, authored fields, parent-office linkage, prerequisite
// pin, provenance and governing rule, and is never re-created, improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  createFileCampaign,
  gipGroupCheck,
  nodeFs,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  EXCEPTION_REF_A,
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  PRIORITY_OR_CONFLICT_RULE_REF_A,
  SCOPE_BINDING_A,
  SCOPE_BINDING_B,
  SCOPE_REF_B,
  decisionBodyOfficeAuthorityLocus,
  fullScopeBinding,
  gipPublication,
  group,
  institutionIdentity,
  instrumentFs,
  officeAuthorityLocus,
  scopeBinding,
  write,
} from "@immortalis/testkit";
import {
  establishDecisionBodyOffice,
  establishInstitution,
  establishOffice,
  establishScopeBinding,
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
const bindingKey = (id = SCOPE_BINDING_A, office = OFFICE_MAGISTRATE, inst = INSTITUTION_COURT) =>
  gipScopeBindingKey(inst, office, id);

/** An institution with one holder-reference office (the magistrate) and one decision-body-reference office (the treasurer). */
async function withOffices(dir = tempDir(), o: { canonical?: boolean } = {}) {
  const s = await seededGipCampaign(dir, o);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
  return s;
}

describe("save → close → load → continue at every durable cut of the binding establishment", () => {
  const cuts = [0, 1, 2] as const;
  for (const cut of cuts) {
    it(`${cut} binding(s) saved: reloads unchanged, verifies, and the continuation converges on the same two bindings`, async () => {
      const dir = tempDir();
      const s = await withOffices(dir);
      const plan = [
        [OFFICE_MAGISTRATE, SCOPE_BINDING_A],
        [OFFICE_TREASURER, SCOPE_BINDING_B],
      ] as const;
      for (let i = 0; i < cut; i++)
        await establishScopeBinding(s, i + 4, INSTITUTION_COURT, plan[i]![0], plan[i]![1]);
      const saved = structuredClone(gipFacts(s));
      await s.campaign.close();

      const r = await reopenGip(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(gipFacts(r)).toEqual(saved);
      for (let i = 0; i < plan.length; i++) {
        const out = await r.gip.establishScopeBinding({
          ...gipPublication(i + 4),
          scope_binding: scopeBinding(INSTITUTION_COURT, plan[i]![0], plan[i]![1]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(gipFacts(r).map((f) => f.key)).toEqual(
        [
          courtKey,
          magistrateKey,
          treasurerKey,
          bindingKey(SCOPE_BINDING_A, OFFICE_MAGISTRATE),
          bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER),
        ].sort(),
      );
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves every authored field (including optional material), the parent-office linkage, key, version, prerequisite pin, provenance, governing rule and receipt exactly; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await withOffices(dir);
    await must(
      s.gip.establishScopeBinding({ ...gipPublication(4), scope_binding: fullScopeBinding() }),
    );
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
    const facts = [bindingKey(), bindingKey(SCOPE_BINDING_A, OFFICE_TREASURER)].map((k) =>
      structuredClone(s.campaign.store.getFact(k)!),
    );
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(4).intent_id));
    const committed = structuredClone(s.campaign.store.committedGroup(gipPublication(4).intent_id));
    const officeBefore = structuredClone(s.campaign.store.getFact(magistrateKey));
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenGip(dir);
    for (const f of facts) expect(r.campaign.store.getFact(f.key)).toEqual(f);
    expect(r.campaign.store.getFact(bindingKey())!.value).toEqual(fullScopeBinding());
    expect(r.campaign.store.getFact(bindingKey())!.provenance.rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(r.campaign.store.getFact(magistrateKey)).toEqual(officeBefore);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(r.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(r.campaign.store.lookupReceipt(gipPublication(4).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(4).intent_id)).toEqual(committed);
    expect(committed!.reads).toEqual([{ key: magistrateKey, version: 1 }]);
    expect(committed!.depends_on).toEqual([officeBefore!.provenance.group_id]);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(verifyGipIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("after a reload every post-establishment change is still refused, and a conflicting establishment still fails closed", async () => {
    const dir = tempDir();
    const s = await withOffices(dir);
    await establishScopeBinding(s, 4);
    await s.campaign.close();
    const r = await reopenGip(dir);
    const fact = structuredClone(r.campaign.store.getFact(bindingKey())!);
    const office = r.campaign.store.getFact(magistrateKey)!;
    const group = (n: number, expected_version: number, value: unknown) => ({
      campaign_id: FIXTURE_CAMPAIGN,
      owner: "gip",
      facet: "gip_institution_identity",
      group_id: `raw-g-${n}`,
      intent_id: `raw-i-${n}`,
      cause: `raw-c-${n}`,
      rule: GIP_SCOPE_BINDING_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: magistrateKey, version: office.version }],
      depends_on: [office.provenance.group_id],
      writes: [
        {
          key: bindingKey(),
          owner: "gip",
          facet: "gip_institution_identity",
          value,
          unit: null,
          basis: "b",
          secrecy: "s",
          expected_version,
        },
      ],
    });
    const state = {
      facts: new Map(r.campaign.store.listFacts().map((f) => [f.key, f])),
    } as never;
    expect(
      gipGroupCheck(
        group(
          1,
          1,
          scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
            scope_ref: SCOPE_REF_B,
          }),
        ) as never,
        state,
      )?.code,
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    const conflict = await r.gip.establishScopeBinding({
      ...gipPublication(9),
      scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
        scope_ref: SCOPE_REF_B,
      }),
    });
    expect(conflict.ok).toBe(false);
    expect(r.campaign.store.getFact(bindingKey())).toEqual(fact);
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

  it("a crash before the commit and a lost reply after it each converge on one binding; a committed one is adopted, never re-created", async () => {
    const s = await withOffices();
    const before = s.campaign.store.head();
    const crash = new GipAdapter(crashBefore(s.campaign.store));
    const failed = await crash.establishScopeBinding({
      ...gipPublication(4),
      scope_binding: scopeBinding(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(gipPublication(4).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.gip.establishScopeBinding({ ...gipPublication(4), scope_binding: scopeBinding() }),
    );
    expect(gipFacts(s).filter((f) => f.key === bindingKey())).toHaveLength(1);

    // lost reply after the commit: the binding is committed; the retry is reconciled to the original receipt
    const lost = new GipAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishScopeBinding({
      ...gipPublication(5),
      scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B),
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(5).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishScopeBinding({
        ...gipPublication(5),
        scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B),
      }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(gipFacts(s).map((f) => f.key)).toEqual(
      [
        courtKey,
        magistrateKey,
        treasurerKey,
        bindingKey(),
        bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER),
      ].sort(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a failure injected before or after every durable step of the file package converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await withOffices(dir, { canonical: false });
      await s.campaign.close();
    };
    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(
      new GipAdapter(pc.store).establishScopeBinding({
        ...gipPublication(4),
        scope_binding: fullScopeBinding(),
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
        const r = await new GipAdapter(c.store).establishScopeBinding({
          ...gipPublication(4),
          scope_binding: fullScopeBinding(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(gipPublication(4).intent_id) !== null;
        // never a partial state: the binding exists exactly when its receipt does
        expect(reopened.store.getFact(bindingKey()) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        // retrying the same intent converges on exactly one binding, never a duplicate
        const retry = await must(
          new GipAdapter(reopened.store).establishScopeBinding({
            ...gipPublication(4),
            scope_binding: fullScopeBinding(),
          }),
        );
        expect(retry.replayed).toBe(committed);
        expect(gipFactsOf(reopened).map((f) => f.key)).toEqual(
          [courtKey, magistrateKey, treasurerKey, bindingKey()].sort(),
        );
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

describe("load fails closed on a corrupted or tampered binding save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await withOffices(dir);
    await establishInstitution(s, 4, INSTITUTION_GUILD);
    await must(
      s.gip.establishScopeBinding({ ...gipPublication(5), scope_binding: fullScopeBinding() }),
    );
    await establishScopeBinding(s, 6, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B, {
      scope_ref: SCOPE_REF_B,
    });
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
    "scope reference replaced": (f) => (f.value.scope_ref = "scope-ref-forged"),
    "scope type rewritten": (f) => (f.value.scope_type = "rewritten"),
    "target condition rewritten": (f) => (f.value.target_condition = "rewritten"),
    "inheritance rule rewritten": (f) => (f.value.inheritance_rule = "rewritten"),
    "inheritance rule removed": (f) => delete f.value.inheritance_rule,
    "exception added": (f) => f.value.exception_refs.push("exception-ref-forged"),
    "exceptions emptied": (f) => (f.value.exception_refs = []),
    "exceptions removed": (f) => delete f.value.exception_refs,
    "exception reference made a single value": (f) =>
      (f.value.exception_refs = "exception-ref-a-1"),
    "pre-repair exceptions field added": (f) => (f.value.exceptions = ["exception-ref-a-1"]),
    "pre-repair conflict_refs field added": (f) => (f.value.conflict_refs = ["x-ref"]),
    "priority-or-conflict rule reference replaced": (f) =>
      (f.value.priority_or_conflict_rule_ref = "priority-ref-forged"),
    "priority-or-conflict rule reference made an array": (f) =>
      (f.value.priority_or_conflict_rule_ref = ["priority-or-conflict-rule-ref-a-1"]),
    "priority-or-conflict rule reference removed": (f) =>
      delete f.value.priority_or_conflict_rule_ref,
    "optional made null": (f) => (f.value.priority_or_conflict_rule_ref = null),
    "binding identity rewritten": (f) => (f.value.scope_binding_id = "scope-binding-forged"),
    "parent office rewritten": (f) => (f.value.office_id = OFFICE_TREASURER),
    "parent institution rewritten": (f) => (f.value.institution_id = INSTITUTION_GUILD),
    "instrument reference added": (f) => (f.value.instrument_ref = "instrument-1"),
    "validity added": (f) => (f.value.validity_status = "valid"),
    "applicability result added": (f) => (f.value.applicability_result = "applies"),
    "holder added": (f) => (f.value.holder_ref = "holder-ref-forged"),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "required field removed": (f) => delete f.value.target_condition,
    "owner changed": (f) => (f.owner = "world_state"),
    "facet changed": (f) => (f.facet = "office"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
    "office citation substituted": (f) => (f.provenance.rule = structuredClone(GIP_OFFICE_RULE)),
    "historical office citation substituted": (f) =>
      (f.provenance.rule = structuredClone(GIP_OFFICE_RULE_THIRTEENTH_SLICE)),
  };
  it("an edit of a saved binding — value, parent linkage, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === bindingKey()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a state-file edit that swaps two bindings' scopes, moves a binding under another office, or removes its parent office or institution is detected", async () => {
    for (const name of [
      "swapped scope refs",
      "moved key",
      "moved to a sibling office",
      "office removed",
      "institution removed",
      "office competence rewritten",
      "office reference switched",
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      const a = j.facts.find((f: any) => f.key === bindingKey());
      const b = j.facts.find((f: any) => f.key === bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER));
      if (name === "swapped scope refs")
        [a.value.scope_ref, b.value.scope_ref] = [b.value.scope_ref, a.value.scope_ref];
      else if (name === "moved key") a.key = bindingKey("scope-binding-elsewhere");
      else if (name === "moved to a sibling office") {
        a.key = bindingKey(SCOPE_BINDING_A, OFFICE_TREASURER);
        a.value.office_id = OFFICE_TREASURER;
      } else if (name === "office removed")
        j.facts = j.facts.filter((f: any) => f.key !== magistrateKey);
      else if (name === "institution removed")
        j.facts = j.facts.filter((f: any) => f.key !== courtKey);
      else if (name === "office competence rewritten")
        j.facts.find((f: any) => f.key === magistrateKey).value.competence_scope = "rewritten";
      else {
        const o = j.facts.find((f: any) => f.key === magistrateKey);
        o.value.decision_body_ref = o.value.holder_ref;
        delete o.value.holder_ref;
      }
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a journal edit of the binding's committed group fails replay: its authored fields, its pin or its dependency", async () => {
    for (const [from, to] of [
      ["scope-ref-a-1", "scope-ref-forged"],
      [EXCEPTION_REF_A, "exception-ref-forged"],
      [PRIORITY_OR_CONFLICT_RULE_REF_A, "priority-ref-forged"],
      [
        "SYNTHETIC FIXTURE: an authored target condition",
        "SYNTHETIC FIXTURE: a forged target condition",
      ],
    ] as const) {
      const dir = await saved();
      const journal = join(dir, "journal.jsonl");
      const text = readFileSync(journal, "utf8");
      expect(text).toContain(from);
      writeFileSync(journal, text.replace(from, to));
      expect(await openOutcome(dir), from).not.toBe("OK");
    }
  });

  /** A binding built by a store with NO admission: a consistent, replayable history that is not canonical. */
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
    key: string,
    value: unknown,
    rule: unknown,
    groupOver: any = {},
    over: any = {},
  ) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(key, value as never, { owner: "gip", facet: "gip_institution_identity", ...over })],
      { owner: "gip", facet: "gip_institution_identity", rule, ...groupOver },
    );
  const identity = () => put(1, courtKey, institutionIdentity(), GIP_RULE);
  const officePin = { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] };
  const office = () => put(2, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, officePin);
  const bodyOffice = () =>
    put(
      3,
      treasurerKey,
      decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
      GIP_OFFICE_RULE,
      officePin,
    );
  const binding = (
    n = 4,
    value: unknown = scopeBinding(),
    groupOver: any = { reads: [{ key: magistrateKey, version: 1 }], depends_on: ["group-2"] },
    rule: unknown = GIP_SCOPE_BINDING_RULE,
    key = bindingKey(),
    over: any = {},
  ) => put(n, key, value, rule, groupOver, over);
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));
  const lawful = async (s: CampaignStore) => {
    await must(s.commit(identity()));
    await must(s.commit(office()));
  };

  it("a lawful binding history built by an admission-free store still verifies, beneath either office branch (control)", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(bodyOffice()));
        await must(s.commit(binding()));
        await must(
          s.commit(
            binding(
              5,
              scopeBinding(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B),
              { reads: [{ key: treasurerKey, version: 1 }], depends_on: ["group-3"] },
              GIP_SCOPE_BINDING_RULE,
              bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER),
            ),
          ),
        );
      }),
    ).toBe("OK");
  });

  it("a binding with no committed parent office, a pin of nothing, the wrong pin, a stale pin version, a foreign dependency, a second write or a non-create write is detected on load", async () => {
    // no office at all (not even an institution)
    expect(
      await base(async (s) => {
        await must(s.commit(binding(1, scopeBinding(), {})));
      }),
    ).toMatch(/GIP_STATE/);
    // an institution exists, but no office
    expect(
      await base(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(binding(2, scopeBinding(), { reads: [], depends_on: [] })));
      }),
    ).toMatch(/GIP_STATE/);
    // the office exists but the binding pins nothing
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(binding(3, scopeBinding(), {})));
      }),
    ).toMatch(/GIP_STATE/);
    // the binding pins the institution identity instead of its office
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(binding(3, scopeBinding(), officePin)));
      }),
    ).toMatch(/GIP_STATE/);
    // the binding pins a sibling office
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(bodyOffice()));
        await must(
          s.commit(
            binding(4, scopeBinding(), {
              reads: [{ key: treasurerKey, version: 1 }],
              depends_on: ["group-3"],
            }),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a dependency on the wrong group, or none (a stale pin version is refused by the store itself, STALE_READ)
    for (const groupOver of [
      { reads: [{ key: magistrateKey, version: 1 }], depends_on: ["group-1"] },
      { reads: [{ key: magistrateKey, version: 1 }], depends_on: [] },
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(binding(3, scopeBinding(), groupOver)));
        }),
        JSON.stringify(groupOver),
      ).toMatch(/GIP_STATE/);
    // a foreign dependency or read beside the office
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(put(3, guildKey, institutionIdentity(INSTITUTION_GUILD), GIP_RULE)));
        await must(
          s.commit(
            binding(4, scopeBinding(), {
              reads: [{ key: magistrateKey, version: 1 }],
              depends_on: ["group-2", "group-3"],
            }),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(
          s.commit(
            binding(3, scopeBinding(), {
              reads: [
                { key: magistrateKey, version: 1 },
                { key: courtKey, version: 1 },
              ],
              depends_on: ["group-2"],
            }),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a second write in the binding group
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              3,
              [
                write(bindingKey(), scopeBinding() as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
                write(
                  bindingKey(SCOPE_BINDING_B),
                  scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B) as never,
                  { owner: "gip", facet: "gip_institution_identity" },
                ),
              ],
              {
                owner: "gip",
                facet: "gip_institution_identity",
                rule: GIP_SCOPE_BINDING_RULE,
                reads: [{ key: magistrateKey, version: 1 }],
                depends_on: ["group-2"],
              },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("a binding whose office has lost its institution chain is detected on load, though the history is replayable", async () => {
    expect(
      await base(async (s) => {
        // an office with no committed identity, and a binding beneath it
        await must(s.commit(put(1, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {})));
        await must(
          s.commit(
            binding(2, scopeBinding(), {
              reads: [{ key: magistrateKey, version: 1 }],
              depends_on: ["group-1"],
            }),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("a binding that was moved forward (a scope replacement) is detected on load, though the history is replayable", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(binding()));
        await must(
          s.commit(
            binding(
              5,
              scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
                scope_ref: SCOPE_REF_B,
              }),
              { reads: [{ key: magistrateKey, version: 1 }], depends_on: ["group-2"] },
              GIP_SCOPE_BINDING_RULE,
              bindingKey(),
              { expected_version: 1 },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("owner drift, rule drift (including the office's current and historical citations), a deferred-surface value and a key/value identity mismatch are each detected on load", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(
          s.commit(
            binding(
              3,
              scopeBinding(),
              {
                owner: "world_state",
                facet: "world_profile",
                reads: [{ key: magistrateKey, version: 1 }],
                depends_on: ["group-2"],
              },
              GIP_SCOPE_BINDING_RULE,
              bindingKey(),
              { owner: "world_state", facet: "world_profile" },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    for (const rule of [
      { ...GIP_SCOPE_BINDING_RULE, clause: "drifted" },
      GIP_OFFICE_RULE,
      GIP_OFFICE_RULE_THIRTEENTH_SLICE, // the historical-compatibility hatch admits no binding
      GIP_RULE,
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(binding(3, scopeBinding(), undefined, rule)));
        }),
        JSON.stringify(rule).slice(0, 60),
      ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...scopeBinding(), instrument_ref: "i-1" },
      { ...scopeBinding(), validity_status: "valid" },
      { ...scopeBinding(), inheritance_rule: null },
      { ...fullScopeBinding(), exception_refs: [{ ref: "x" }] },
      { ...fullScopeBinding(), priority_or_conflict_rule_ref: ["x-ref"] },
      scopeBinding(INSTITUTION_COURT, OFFICE_TREASURER), // names another office than its key
      scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B), // names another binding than its key
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(binding(3, bad)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier is silent on a healthy campaign and reports a tampered binding by key", async () => {
    const s = await withOffices();
    await establishScopeBinding(s, 4);
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
    const inner = s.campaign.store;
    const tampered = {
      getFact: (k: string) => inner.getFact(k),
      committedGroup: (i: string) => inner.committedGroup(i),
      listFacts: () =>
        inner.listFacts().map((f) => (f.key === bindingKey() ? { ...f, version: 2 } : f)),
    } as unknown as CampaignStore;
    expect(verifyGipIntegrity(tampered).map((v) => [v.key, v.code])).toEqual([
      [bindingKey(), "GIP_STATE"],
    ]);
  });
});
