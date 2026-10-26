import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Governance Instrument Core — save → close → load → continue across every durable cut of the establishment, a failure at
// EVERY durable step of the one authored Instrument publication, and load-time failure on a corrupted or inconsistent save. The
// Instrument path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry,
// replay or reload the Instrument exists exactly once, keeps its canonical key, authored fields, source-office and Scope Binding
// references, prerequisite pins, provenance and governing rule, and is never re-created, improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_INSTRUMENT_RULE,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  createFileCampaign,
  nodeFs,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  AUTHORITY_BASIS_REF_A,
  FIXTURE_CAMPAIGN,
  GOVERNING_ORDER_REF_A,
  GOVERNING_ORDER_REF_B,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  INSTRUMENT_B,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  SCOPE_BINDING_A,
  decisionBodyOfficeAuthorityLocus,
  gipPublication,
  governanceInstrument,
  group,
  institutionIdentity,
  instrumentFs,
  officeAuthorityLocus,
  officeRef,
  scopeBinding,
  scopeBindingRef,
  write,
} from "@immortalis/testkit";
import {
  establishDecisionBodyOffice,
  establishGovernanceInstrument,
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
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);
const bindingKey = (office = OFFICE_MAGISTRATE) =>
  gipScopeBindingKey(INSTITUTION_COURT, office, SCOPE_BINDING_A);
const instrumentKey = (id = INSTRUMENT_A) => gipInstrumentKey(id);

/** An institution with a holder-reference office and a decision-body-reference office, each with one Scope Binding. */
async function withBindings(dir = tempDir(), o: { canonical?: boolean } = {}) {
  const s = await seededGipCampaign(dir, o);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
  await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
  return s;
}

const plan = [
  [INSTRUMENT_A, OFFICE_MAGISTRATE],
  [INSTRUMENT_B, OFFICE_TREASURER],
] as const;

describe("save → close → load → continue at every durable cut of the Instrument establishment", () => {
  for (const cut of [0, 1, 2] as const) {
    it(`${cut} Instrument(s) saved: reloads unchanged, verifies, and the continuation converges on the same two Instruments`, async () => {
      const dir = tempDir();
      const s = await withBindings(dir);
      for (let i = 0; i < cut; i++)
        await establishGovernanceInstrument(s, i + 6, plan[i]![0], INSTITUTION_COURT, plan[i]![1]);
      const saved = structuredClone(gipFacts(s));
      await s.campaign.close();

      const r = await reopenGip(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(gipFacts(r)).toEqual(saved);
      for (let i = 0; i < plan.length; i++) {
        const out = await r.gip.establishGovernanceInstrument({
          ...gipPublication(i + 6),
          instrument: governanceInstrument(plan[i]![0], INSTITUTION_COURT, plan[i]![1]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(gipFacts(r).map((f) => f.key)).toEqual(
        [
          courtKey,
          magistrateKey,
          treasurerKey,
          bindingKey(),
          bindingKey(OFFICE_TREASURER),
          instrumentKey(INSTRUMENT_A),
          instrumentKey(INSTRUMENT_B),
        ].sort(),
      );
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves every authored field, both references, the validity entries and lifecycle, key, version, both prerequisite pins, provenance, governing rule and receipt exactly; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await withBindings(dir);
    const authored = governanceInstrument(
      INSTRUMENT_A,
      INSTITUTION_COURT,
      OFFICE_MAGISTRATE,
      SCOPE_BINDING_A,
      {
        operative_effect: "constitutive_creation",
        lifecycle_status: "suspended",
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "contested" },
        ],
      },
    );
    await must(s.gip.establishGovernanceInstrument({ ...gipPublication(6), instrument: authored }));
    await establishGovernanceInstrument(s, 7, INSTRUMENT_B, INSTITUTION_COURT, OFFICE_TREASURER);
    const facts = [instrumentKey(INSTRUMENT_A), instrumentKey(INSTRUMENT_B)].map((k) =>
      structuredClone(s.campaign.store.getFact(k)!),
    );
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(6).intent_id));
    const committed = structuredClone(s.campaign.store.committedGroup(gipPublication(6).intent_id));
    const officeBefore = structuredClone(s.campaign.store.getFact(magistrateKey));
    const bindingBefore = structuredClone(s.campaign.store.getFact(bindingKey()));
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenGip(dir);
    for (const f of facts) expect(r.campaign.store.getFact(f.key)).toEqual(f);
    expect(r.campaign.store.getFact(instrumentKey())!.value).toEqual(authored);
    expect(r.campaign.store.getFact(instrumentKey())!.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(r.campaign.store.getFact(magistrateKey)).toEqual(officeBefore);
    expect(r.campaign.store.getFact(bindingKey())).toEqual(bindingBefore);
    expect(r.campaign.store.getFact(bindingKey())!.provenance.rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(r.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(r.campaign.store.lookupReceipt(gipPublication(6).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(6).intent_id)).toEqual(committed);
    expect(committed!.reads).toEqual([
      { key: magistrateKey, version: 1 },
      { key: bindingKey(), version: 1 },
    ]);
    expect(committed!.depends_on).toEqual([
      officeBefore!.provenance.group_id,
      bindingBefore!.provenance.group_id,
    ]);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(verifyGipIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("save → close → load preserves an empty validity_by_order[] and repeated governing_order_ref entries exactly as authored, and verification does not treat either as corruption", async () => {
    const dir = tempDir();
    const s = await withBindings(dir);
    const repeated = [
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "valid" },
      { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "void" },
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "invalid" },
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "invalid" },
    ] as const;
    await establishGovernanceInstrument(s, 6, INSTRUMENT_A, undefined, undefined, undefined, {
      validity_by_order: [],
    });
    await establishGovernanceInstrument(
      s,
      7,
      INSTRUMENT_B,
      INSTITUTION_COURT,
      OFFICE_TREASURER,
      undefined,
      {
        validity_by_order: [...repeated],
      },
    );
    const saved = structuredClone(gipFacts(s));
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(verifyGipIntegrity(r.campaign.store)).toEqual([]);
    expect(gipFacts(r)).toEqual(saved);
    expect(r.gip.governanceInstrument(INSTRUMENT_A)!.value.validity_by_order).toEqual([]);
    expect(r.gip.governanceInstrument(INSTRUMENT_B)!.value.validity_by_order).toEqual(repeated);
    // replay of the same intents converges on the same receipts, never a duplicate
    const again = await must(
      r.gip.establishGovernanceInstrument({
        ...gipPublication(7),
        instrument: governanceInstrument(
          INSTRUMENT_B,
          INSTITUTION_COURT,
          OFFICE_TREASURER,
          undefined,
          {
            validity_by_order: [...repeated],
          },
        ),
      }),
    );
    expect(again.replayed).toBe(true);
    await r.campaign.close();
  });

  it("after a reload every post-establishment change is still refused, and a conflicting establishment still fails closed", async () => {
    const dir = tempDir();
    const s = await withBindings(dir);
    await establishGovernanceInstrument(s, 6);
    await s.campaign.close();
    const r = await reopenGip(dir);
    const fact = structuredClone(r.campaign.store.getFact(instrumentKey())!);
    const conflict = await r.gip.establishGovernanceInstrument({
      ...gipPublication(9),
      instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
        lifecycle_status: "repealed",
      }),
    });
    expect(conflict.ok).toBe(false);
    const equal = await r.gip.establishGovernanceInstrument({
      ...gipPublication(10),
      instrument: governanceInstrument(),
    });
    expect(equal.ok).toBe(false);
    expect(r.campaign.store.getFact(instrumentKey())).toEqual(fact);
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

  it("a crash before the commit and a lost reply after it each converge on one Instrument; a committed one is adopted, never re-created", async () => {
    const s = await withBindings();
    const before = s.campaign.store.head();
    const crash = new GipAdapter(crashBefore(s.campaign.store));
    const failed = await crash.establishGovernanceInstrument({
      ...gipPublication(6),
      instrument: governanceInstrument(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(gipPublication(6).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(6),
        instrument: governanceInstrument(),
      }),
    );
    expect(gipFacts(s).filter((f) => f.key === instrumentKey())).toHaveLength(1);

    const second = governanceInstrument(INSTRUMENT_B, INSTITUTION_COURT, OFFICE_TREASURER);
    const lost = new GipAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishGovernanceInstrument({
      ...gipPublication(7),
      instrument: second,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(7).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishGovernanceInstrument({ ...gipPublication(7), instrument: second }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(
      gipFacts(s)
        .filter((f) => f.key.startsWith("gip/instrument/"))
        .map((f) => f.key),
    ).toEqual([instrumentKey(), instrumentKey(INSTRUMENT_B)]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a failure injected before or after every durable step of the file package converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await withBindings(dir, { canonical: false });
      await s.campaign.close();
    };
    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(
      new GipAdapter(pc.store).establishGovernanceInstrument({
        ...gipPublication(6),
        instrument: governanceInstrument(),
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
        const r = await new GipAdapter(c.store).establishGovernanceInstrument({
          ...gipPublication(6),
          instrument: governanceInstrument(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(gipPublication(6).intent_id) !== null;
        // never a partial state: the Instrument exists exactly when its receipt does
        expect(reopened.store.getFact(instrumentKey()) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        const retry = await must(
          new GipAdapter(reopened.store).establishGovernanceInstrument({
            ...gipPublication(6),
            instrument: governanceInstrument(),
          }),
        );
        expect(retry.replayed).toBe(committed);
        expect(gipFactsOf(reopened).map((f) => f.key)).toEqual(
          [
            courtKey,
            magistrateKey,
            treasurerKey,
            bindingKey(),
            bindingKey(OFFICE_TREASURER),
            instrumentKey(),
          ].sort(),
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

describe("load fails closed on a corrupted or tampered Instrument save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await withBindings(dir);
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(6),
        instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
            { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
          ],
        }),
      }),
    );
    await establishGovernanceInstrument(s, 7, INSTRUMENT_B, INSTITUTION_COURT, OFFICE_TREASURER);
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
    "instrument identity rewritten": (f) => (f.value.instrument_id = "instrument-forged"),
    "source authority replaced": (f) =>
      (f.value.source_authority_ref = officeRef(INSTITUTION_COURT, OFFICE_TREASURER)),
    "source authority malformed": (f) => (f.value.source_authority_ref = OFFICE_MAGISTRATE),
    "scope binding replaced by another authority's": (f) =>
      (f.value.scope_binding_ref = scopeBindingRef(INSTITUTION_COURT, OFFICE_TREASURER)),
    "scope binding never established": (f) =>
      (f.value.scope_binding_ref = scopeBindingRef(
        INSTITUTION_COURT,
        OFFICE_MAGISTRATE,
        "scope-binding-never",
      )),
    "authority basis made an array": (f) => (f.value.authority_basis_ref = [AUTHORITY_BASIS_REF_A]),
    "authority basis removed": (f) => delete f.value.authority_basis_ref,
    "operative effect rewritten to an unknown literal": (f) =>
      (f.value.operative_effect = "enacted"),
    "operative effect made an array": (f) => (f.value.operative_effect = ["obligation"]),
    "operative_effects added": (f) => (f.value.operative_effects = ["obligation"]),
    "operative effect removed": (f) => delete f.value.operative_effect,
    "validity status rewritten to an unknown literal": (f) =>
      (f.value.validity_by_order[0].validity_status = "null_and_void"),
    "validity entry gained a field": (f) =>
      (f.value.validity_by_order[0].lifecycle_status = "active"),
    "validity entries made a map": (f) => (f.value.validity_by_order = { a: "valid" }),
    "lifecycle rewritten to an unknown literal": (f) => (f.value.lifecycle_status = "enacted"),
    "lifecycle removed": (f) => delete f.value.lifecycle_status,
    "conditional field added": (f) => (f.value.activation_condition = "x-ref"),
    "provenance_note added": (f) => (f.value.provenance_note = "x"),
    "clauses added": (f) => (f.value.clauses = []),
    "legal_status added": (f) => (f.value.legal_status = "valid"),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "owner changed": (f) => (f.owner = "world_state"),
    "facet changed": (f) => (f.facet = "office"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
    "binding citation substituted": (f) =>
      (f.provenance.rule = structuredClone(GIP_SCOPE_BINDING_RULE)),
    "office citation substituted": (f) => (f.provenance.rule = structuredClone(GIP_OFFICE_RULE)),
    "historical office citation substituted": (f) =>
      (f.provenance.rule = structuredClone(GIP_OFFICE_RULE_THIRTEENTH_SLICE)),
  };
  it("an edit of a saved Instrument — value, references, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === instrumentKey()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a state-file edit that swaps two Instruments' references, moves an Instrument, or removes its office, binding or institution is detected", async () => {
    for (const name of [
      "swapped source authorities",
      "moved key",
      "office removed",
      "binding removed",
      "institution removed",
      "binding rewritten",
      "binding moved to another office",
      "office reference switched",
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      const a = j.facts.find((f: any) => f.key === instrumentKey());
      const b = j.facts.find((f: any) => f.key === instrumentKey(INSTRUMENT_B));
      if (name === "swapped source authorities")
        [a.value.source_authority_ref, b.value.source_authority_ref] = [
          b.value.source_authority_ref,
          a.value.source_authority_ref,
        ];
      else if (name === "moved key") a.key = instrumentKey("instrument-elsewhere");
      else if (name === "office removed")
        j.facts = j.facts.filter((f: any) => f.key !== magistrateKey);
      else if (name === "binding removed")
        j.facts = j.facts.filter((f: any) => f.key !== bindingKey());
      else if (name === "institution removed")
        j.facts = j.facts.filter((f: any) => f.key !== courtKey);
      else if (name === "binding rewritten")
        j.facts.find((f: any) => f.key === bindingKey()).value.scope_ref = "scope-ref-forged";
      else if (name === "binding moved to another office") {
        const bf = j.facts.find((f: any) => f.key === bindingKey());
        bf.key = gipScopeBindingKey(INSTITUTION_COURT, OFFICE_TREASURER, "scope-binding-moved");
        bf.value.office_id = OFFICE_TREASURER;
        bf.value.scope_binding_id = "scope-binding-moved";
      } else {
        const o = j.facts.find((f: any) => f.key === magistrateKey);
        o.value.decision_body_ref = o.value.holder_ref;
        delete o.value.holder_ref;
      }
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a journal edit of the Instrument's committed group fails replay: its authored fields, its references or its dependencies", async () => {
    for (const [from, to] of [
      [GOVERNING_ORDER_REF_B, "governing-order-ref-forged"],
      [AUTHORITY_BASIS_REF_A, "authority-basis-ref-forged"],
      ['"lifecycle_status":"active"', '"lifecycle_status":"repealed"'],
      ['"operative_effect":"obligation"', '"operative_effect":"prohibition"'],
      ['"validity_status":"void"', '"validity_status":"valid"'],
    ] as const) {
      const dir = await saved();
      const journal = join(dir, "journal.jsonl");
      const text = readFileSync(journal, "utf8");
      expect(text, from).toContain(from);
      writeFileSync(journal, text.replace(from, to));
      expect(await openOutcome(dir), from).not.toBe("OK");
    }
  });

  /** An Instrument built by a store with NO admission: a consistent, replayable history that is not canonical. */
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
      {
        owner: "gip",
        facet: "gip_institution_identity",
        rule,
        ...groupOver,
      },
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
  const bindingPin = (office: string, officeGroup: string) => ({
    reads: [{ key: office, version: 1 }],
    depends_on: [officeGroup],
  });
  const binding = (n: number, office: string, officeId: string, officeGroup: string) =>
    put(
      n,
      bindingKey(officeId),
      scopeBinding(INSTITUTION_COURT, officeId, SCOPE_BINDING_A),
      GIP_SCOPE_BINDING_RULE,
      bindingPin(office, officeGroup),
    );
  const instrumentPin = {
    reads: [
      { key: magistrateKey, version: 1 },
      { key: bindingKey(), version: 1 },
    ],
    depends_on: ["group-2", "group-4"],
  };
  const instrument = (
    n = 6,
    value: unknown = governanceInstrument(),
    groupOver: any = instrumentPin,
    rule: unknown = GIP_INSTRUMENT_RULE,
    key = instrumentKey(),
    over: any = {},
  ) => put(n, key, value, rule, groupOver, over);
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));
  /** identity (group-1), holder office (group-2), body office (group-3), the magistrate's binding (group-4) */
  const lawful = async (s: CampaignStore) => {
    await must(s.commit(identity()));
    await must(s.commit(office()));
    await must(s.commit(bodyOffice()));
    await must(s.commit(binding(4, magistrateKey, OFFICE_MAGISTRATE, "group-2")));
  };

  it("a lawful Instrument history built by an admission-free store still verifies, beneath either office branch (control)", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(binding(5, treasurerKey, OFFICE_TREASURER, "group-3")));
        await must(s.commit(instrument(6)));
        await must(
          s.commit(
            instrument(
              7,
              governanceInstrument(INSTRUMENT_B, INSTITUTION_COURT, OFFICE_TREASURER),
              {
                reads: [
                  { key: treasurerKey, version: 1 },
                  { key: bindingKey(OFFICE_TREASURER), version: 1 },
                ],
                depends_on: ["group-3", "group-5"],
              },
              GIP_INSTRUMENT_RULE,
              instrumentKey(INSTRUMENT_B),
            ),
          ),
        );
      }),
    ).toBe("OK");
  });

  it("a history carrying an empty validity_by_order[] or repeated governing_order_ref entries, built by an admission-free store, loads without corruption (control)", async () => {
    for (const validity_by_order of [
      [],
      [
        { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
        { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "invalid" },
      ],
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(
            s.commit(
              instrument(
                5,
                governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
                  validity_by_order: validity_by_order as never,
                }),
              ),
            ),
          );
        }),
      ).toBe("OK");
  });

  it("an Instrument with no committed office or binding, a pin of nothing, one parent only, the wrong pin, a foreign dependency, a second write or a non-create write is detected on load", async () => {
    // no parents at all (not even an institution)
    expect(
      await base(
        async (s) => void (await must(s.commit(instrument(1, governanceInstrument(), {})))),
      ),
    ).toMatch(/GIP_STATE/);
    // lawful parents but the Instrument pins nothing, only the office, only the binding, or the wrong pair
    for (const [name, groupOver] of Object.entries({
      "pins nothing": {},
      "pins only the office": {
        reads: [{ key: magistrateKey, version: 1 }],
        depends_on: ["group-2"],
      },
      "pins only the binding": {
        reads: [{ key: bindingKey(), version: 1 }],
        depends_on: ["group-4"],
      },
      "pins the identity instead of the office": {
        reads: [
          { key: courtKey, version: 1 },
          { key: bindingKey(), version: 1 },
        ],
        depends_on: ["group-1", "group-4"],
      },
      "pins the sibling office": {
        reads: [
          { key: treasurerKey, version: 1 },
          { key: bindingKey(), version: 1 },
        ],
        depends_on: ["group-3", "group-4"],
      },
      "no dependency on the office's group": { ...instrumentPin, depends_on: ["group-4"] },
      "no dependency on the binding's group": { ...instrumentPin, depends_on: ["group-2"] },
      "a dependency on the wrong group": { ...instrumentPin, depends_on: ["group-2", "group-1"] },
      "an extra dependency": { ...instrumentPin, depends_on: ["group-2", "group-4", "group-3"] },
      "an extra read": {
        reads: [...instrumentPin.reads, { key: courtKey, version: 1 }],
        depends_on: instrumentPin.depends_on,
      },
    }))
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(instrument(5, governanceInstrument(), groupOver)));
        }),
        name,
      ).toMatch(/GIP_STATE/);
    // a second write in the Instrument group
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              5,
              [
                write(instrumentKey(), governanceInstrument() as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
                write(instrumentKey(INSTRUMENT_B), governanceInstrument(INSTRUMENT_B) as never, {
                  owner: "gip",
                  facet: "gip_institution_identity",
                }),
              ],
              {
                owner: "gip",
                facet: "gip_institution_identity",
                rule: GIP_INSTRUMENT_RULE,
                ...instrumentPin,
              },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("an Instrument whose binding belongs to a different authority, or whose office has lost its institution chain, is detected on load, though the history is replayable", async () => {
    // the Instrument value joins the magistrate to the treasurer's binding: the contract itself refuses it
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(binding(5, treasurerKey, OFFICE_TREASURER, "group-3")));
        const cross = {
          ...governanceInstrument(),
          scope_binding_ref: scopeBindingRef(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A),
        };
        await must(s.commit(instrument(6, cross)));
      }),
    ).toMatch(/VALUE_INVALID/);
    // an office with no committed identity, a binding and an Instrument beneath it
    expect(
      await base(async (s) => {
        await must(s.commit(put(1, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {})));
        await must(s.commit(binding(2, magistrateKey, OFFICE_MAGISTRATE, "group-1")));
        await must(
          s.commit(
            instrument(3, governanceInstrument(), {
              reads: [
                { key: magistrateKey, version: 1 },
                { key: bindingKey(), version: 1 },
              ],
              depends_on: ["group-1", "group-2"],
            }),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("an Instrument that was moved forward (a validity or lifecycle change) is detected on load, though the history is replayable", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(instrument(5)));
        await must(
          s.commit(
            instrument(
              6,
              governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
                lifecycle_status: "repealed",
              }),
              { reads: instrumentPin.reads, depends_on: instrumentPin.depends_on },
              GIP_INSTRUMENT_RULE,
              instrumentKey(),
              { expected_version: 1 },
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
  });

  it("owner drift, rule drift (including every sibling citation), a deferred-surface value and a key/value identity mismatch are each detected on load", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(
          s.commit(
            instrument(
              5,
              governanceInstrument(),
              { ...instrumentPin, owner: "world_state", facet: "world_profile" },
              GIP_INSTRUMENT_RULE,
              instrumentKey(),
              { owner: "world_state", facet: "world_profile" },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    for (const rule of [
      { ...GIP_INSTRUMENT_RULE, clause: "drifted" },
      GIP_SCOPE_BINDING_RULE,
      GIP_OFFICE_RULE,
      GIP_OFFICE_RULE_THIRTEENTH_SLICE, // the historical-compatibility hatch admits no Instrument
      GIP_RULE,
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(instrument(5, governanceInstrument(), undefined, rule)));
        }),
        JSON.stringify(rule).slice(0, 60),
      ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...governanceInstrument(), operative_effects: ["obligation"] },
      { ...governanceInstrument(), operative_effect: ["obligation"] },
      { ...governanceInstrument(), activation_condition: "x-ref" },
      { ...governanceInstrument(), validity_status: "valid" },
      { ...governanceInstrument(), lifecycle_status: "enacted" },
      {
        ...governanceInstrument(),
        validity_by_order: [
          {
            governing_order_ref: GOVERNING_ORDER_REF_A,
            validity_status: "valid",
            lifecycle_status: "active",
          },
        ],
      },
      governanceInstrument(INSTRUMENT_B), // names another Instrument than its key
    ])
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(instrument(5, bad)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier is silent on a healthy campaign and reports a tampered Instrument by key", async () => {
    const s = await withBindings();
    await establishGovernanceInstrument(s, 6);
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
    const inner = s.campaign.store;
    const tampered = {
      getFact: (k: string) => inner.getFact(k),
      committedGroup: (i: string) => inner.committedGroup(i),
      listFacts: () =>
        inner.listFacts().map((f) => (f.key === instrumentKey() ? { ...f, version: 2 } : f)),
    } as unknown as CampaignStore;
    expect(verifyGipIntegrity(tampered).map((v) => [v.key, v.code])).toEqual([
      [instrumentKey(), "GIP_STATE"],
    ]);
  });
});
