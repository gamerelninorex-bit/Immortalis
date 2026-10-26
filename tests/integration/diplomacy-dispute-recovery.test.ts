import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// Diplomacy Externalized Claim / Dispute Core — save → close → load → continue across every durable cut of the establishment, a
// failure at EVERY durable step of the one authored publication, and load-time failure on a corrupted or inconsistent save. The
// dispute path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry,
// replay or reload the dispute exists exactly once, keeps its canonical key, authored fields, references, dependency pins,
// provenance and governing rule, and is never re-created, improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EFFECT_ON_VALUES,
  diplomacyDisputeKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DiplomacyAdapter,
  GIP_OFFICE_RULE,
  GIP_RULE,
  createFileCampaign,
  nodeFs,
  verifyDiplomacyIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  DISPUTE_A,
  DISPUTE_B,
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  diplomacyPublication,
  externalizedClaimDispute,
  fullExternalizedClaimDispute,
  group,
  instrumentFs,
  institutionIdentity,
  officeAuthorityLocus,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishExternalRecognition,
  establishExternalizedClaimDispute,
  establishGipAuthority,
  reopenDiplomacy,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = DISPUTE_A) => diplomacyDisputeKey(id);
const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);

const plan = [DISPUTE_A, DISPUTE_B] as const;

describe("save → close → load → continue at every durable cut of the establishment", () => {
  for (const cut of [0, 1, 2] as const) {
    it(`${cut} dispute(s) saved: reloads unchanged, verifies, and the continuation converges on the same two records`, async () => {
      const dir = tempDir();
      const s = await seededDiplomacyCampaign(dir);
      for (let i = 0; i < cut; i++) await establishExternalizedClaimDispute(s, i + 1, plan[i]);
      const saved = structuredClone(diplomacyFacts(s));
      await s.campaign.close();

      const r = await reopenDiplomacy(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(diplomacyFacts(r)).toEqual(saved);
      for (let i = 0; i < plan.length; i++) {
        const out = await r.diplomacy.establishExternalizedClaimDispute({
          ...diplomacyPublication(i + 1),
          dispute: externalizedClaimDispute(plan[i]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(diplomacyFacts(r).map((f) => f.key)).toEqual([key(DISPUTE_A), key(DISPUTE_B)]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves every authored field exactly — optional fields present and absent, open statuses, array shapes, every effect_on literal — key, version, provenance, governing rule and receipt; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    const authored = fullExternalizedClaimDispute(DISPUTE_A, {
      party_refs: ["p2", "p1", "p2"],
      communicated_position_entries: ["x", { y: [1, null] }, null, "x", []],
      status: { phase: "open", n: 1 },
      requested_remedy_or_demand: { demand: "a", n: [1] },
      effect_on: "addressee_receipt",
    });
    await must(
      s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: authored,
      }),
    );
    let n = 1;
    for (const lit of EFFECT_ON_VALUES) {
      n++;
      await establishExternalizedClaimDispute(s, n, `effect-${lit}`, { effect_on: lit });
    }
    await establishExternalizedClaimDispute(s, 20, "no-effect-on", { party_refs: [] });
    const keys = [
      key(DISPUTE_A),
      ...EFFECT_ON_VALUES.map((l) => key(`effect-${l}`)),
      key("no-effect-on"),
    ];
    const facts = keys.map((k) => structuredClone(s.campaign.store.getFact(k)!));
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
    for (const lit of EFFECT_ON_VALUES)
      expect(r.diplomacy.externalizedClaimDispute(`effect-${lit}`)!.value.effect_on).toBe(lit);
    expect("effect_on" in (r.campaign.store.getFact(key("no-effect-on"))!.value as any)).toBe(
      false,
    );
    expect(r.diplomacy.externalizedClaimDispute("no-effect-on")!.value.party_refs).toEqual([]);
    expect(r.campaign.store.getFact(key())!.provenance.rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(r.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(diplomacyPublication(1).intent_id)).toEqual(committed);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(verifyDiplomacyIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("a dependency-derived dispute reloads with its pinned dependencies, reads, dependencies and provenance intact", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishGipAuthority(s, 10);
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      dependency_refs: [magistrateKey, courtKey],
    });
    const fact = structuredClone(s.campaign.store.getFact(key())!);
    const committed = structuredClone(
      s.campaign.store.committedGroup(diplomacyPublication(1).intent_id),
    );
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    expect(r.campaign.store.getFact(key())).toEqual(fact);
    expect(r.campaign.store.committedGroup(diplomacyPublication(1).intent_id)).toEqual(committed);
    expect(committed!.reads.map((x) => x.key)).toEqual([magistrateKey, courtKey]);
    expect(r.diplomacy.externalizedClaimDispute(DISPUTE_A)!.dependencies).toEqual({
      current: true,
      invalidated: [],
    });
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });

  it("a purely authored baseline reloads with no dependency_refs[] and no pins: none is synthesized on load", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishGipAuthority(s, 10);
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      underlying_subject_ref: magistrateKey,
    });
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    const g = r.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect([g.reads, g.depends_on]).toEqual([[], []]);
    expect("dependency_refs" in (r.campaign.store.getFact(key())!.value as any)).toBe(false);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });

  it("after a reload every post-establishment change is still refused, and a conflicting establishment still fails closed", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishExternalizedClaimDispute(s, 1);
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    const fact = structuredClone(r.campaign.store.getFact(key())!);
    const conflict = await r.diplomacy.establishExternalizedClaimDispute({
      ...diplomacyPublication(2),
      dispute: externalizedClaimDispute(DISPUTE_A, { status: "withdrawn" }),
    });
    expect(!conflict.ok && conflict.error.code).toBe("VERSION_CONFLICT");
    const changed = await r.diplomacy.establishExternalizedClaimDispute({
      ...diplomacyPublication(1),
      dispute: externalizedClaimDispute(DISPUTE_A, { status: "withdrawn" }),
    });
    expect(changed.ok).toBe(false);
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
    const failed = await crash.establishExternalizedClaimDispute({
      ...diplomacyPublication(1),
      dispute: externalizedClaimDispute(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: externalizedClaimDispute(),
      }),
    );
    expect(diplomacyFacts(s).filter((f) => f.key === key())).toHaveLength(1);

    const second = externalizedClaimDispute(DISPUTE_B);
    const lost = new DiplomacyAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishExternalizedClaimDispute({
      ...diplomacyPublication(2),
      dispute: second,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(diplomacyPublication(2).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(2),
        dispute: second,
      }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key(), key(DISPUTE_B)]);
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
      new DiplomacyAdapter(pc.store).establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: externalizedClaimDispute(),
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
        const r = await new DiplomacyAdapter(c.store).establishExternalizedClaimDispute({
          ...diplomacyPublication(1),
          dispute: externalizedClaimDispute(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(diplomacyPublication(1).intent_id) !== null;
        // never a partial state: the dispute exists exactly when its receipt does
        expect(reopened.store.getFact(key()) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        const retry = await must(
          new DiplomacyAdapter(reopened.store).establishExternalizedClaimDispute({
            ...diplomacyPublication(1),
            dispute: externalizedClaimDispute(),
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

describe("load fails closed on a corrupted or tampered dispute save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishGipAuthority(s, 10);
    await must(
      s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: fullExternalizedClaimDispute(DISPUTE_A, {
          dependency_refs: [magistrateKey],
          effect_on: "issuance",
        }),
      }),
    );
    await establishExternalizedClaimDispute(s, 2, DISPUTE_B);
    await establishExternalRecognition(s, 3);
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
    "dispute identity rewritten": (f) => (f.value.dispute_id = "dispute-forged"),
    "party_refs made a string": (f) => (f.value.party_refs = f.value.party_refs[0]),
    "party_refs removed": (f) => delete f.value.party_refs,
    "party_refs element made structured": (f) => (f.value.party_refs = [{ p: "a" }]),
    "subject made an array": (f) =>
      (f.value.underlying_subject_ref = [f.value.underlying_subject_ref]),
    "subject removed": (f) => delete f.value.underlying_subject_ref,
    "position entries made a string": (f) => (f.value.communicated_position_entries = "x"),
    "position entries removed": (f) => delete f.value.communicated_position_entries,
    "status removed": (f) => delete f.value.status,
    "status made an array": (f) => (f.value.status = ["open"]),
    "remedy made an array": (f) => (f.value.requested_remedy_or_demand = ["r"]),
    "interpretation ref made an array": (f) => (f.value.interpretation_issue_ref = ["i"]),
    "instrument or clause ref made an array": (f) => (f.value.instrument_or_clause_ref = ["i"]),
    "adjudication ref made an array": (f) => (f.value.adjudication_basis_ref = ["a"]),
    "provenance reference removed": (f) => delete f.value.provenance_ref,
    "dependency_refs made a string": (f) => (f.value.dependency_refs = magistrateKey),
    "effect_on given a fourth value": (f) => (f.value.effect_on = "receipt"),
    "effect_on case-varied": (f) => (f.value.effect_on = "Issuance"),
    "effect_on made an array": (f) => (f.value.effect_on = ["issuance"]),
    "alias for a source identifier": (f) => {
      f.value.parties = f.value.party_refs;
      delete f.value.party_refs;
    },
    "relation field added": (f) => (f.value.relation_id = "x"),
    "receipt field added": (f) => (f.value.receipt_event_ref = "x"),
    "score field added": (f) => (f.value.dispute_score = 1),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "owner changed": (f) => (f.owner = "gip"),
    "facet changed": (f) => (f.facet = "diplomacy_external_recognition"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
    "provenance lineage altered": (f) => f.provenance.rule.authority_lineage.pop(),
    "provenance rule substituted by GIP's": (f) => (f.provenance.rule = structuredClone(GIP_RULE)),
    "provenance rule substituted by the recognition's": (f) =>
      (f.provenance.rule = structuredClone(DIPLOMACY_RECOGNITION_RULE)),
  };
  it("an edit of a saved dispute — value, references, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === key()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a state-file edit that adds or removes registered dependency state, moves the dispute, or removes its dependency is detected", async () => {
    for (const name of [
      "dependency_refs removed",
      "dependency_refs emptied",
      "dependency_refs repointed at a fact the group never read",
      "dependency removed",
      "moved key",
      "per-party copy appended",
      "baseline gains dependency_refs",
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      const a = j.facts.find((f: any) => f.key === key());
      const b = j.facts.find((f: any) => f.key === key(DISPUTE_B));
      if (name === "dependency_refs removed") delete a.value.dependency_refs;
      else if (name === "dependency_refs emptied") a.value.dependency_refs = [];
      else if (name === "dependency_refs repointed at a fact the group never read")
        a.value.dependency_refs = [courtKey];
      else if (name === "dependency removed")
        j.facts = j.facts.filter((f: any) => f.key !== magistrateKey);
      else if (name === "moved key") a.key = key("dispute-elsewhere");
      else if (name === "per-party copy appended") {
        const copy = structuredClone(b);
        copy.key = key("dispute-per-party");
        copy.value.dispute_id = "dispute-per-party";
        j.facts.push(copy);
        // a copy under a mismatched identity is a key/identity mismatch
        copy.value.dispute_id = "dispute-other";
      } else b.value.dependency_refs = [magistrateKey];
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a journal edit of the dispute's committed group fails replay: its authored fields, its references, its effect_on or its dependencies", async () => {
    for (const [from, to] of [
      ['"effect_on":"issuance"', '"effect_on":"addressee_receipt"'],
      ['"status":"SYNTHETIC FIXTURE: an authored status."', '"status":"forged"'],
      ['"party_refs":["dispute-party-ref-a-1"', '"party_refs":["dispute-party-ref-forged"'],
      [`"dependency_refs":["${magistrateKey}"]`, `"dependency_refs":["${courtKey}"]`],
    ] as const) {
      const dir = await saved();
      const journal = join(dir, "journal.jsonl");
      const text = readFileSync(journal, "utf8");
      expect(text, from).toContain(from);
      writeFileSync(journal, text.replace(from, to));
      expect(await openOutcome(dir), from).not.toBe("OK");
    }
  });

  /** A dispute built by a store with NO admission: a consistent, replayable history that is not canonical. */
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
    facet = "diplomacy_externalized_claim_dispute",
  ) =>
    group(FIXTURE_CAMPAIGN, n, [write(k, value as never, { owner, facet, ...over })], {
      owner,
      facet,
      rule: rule as never,
      ...groupOver,
    });
  const gipIdentity = () =>
    put(1, courtKey, institutionIdentity(), GIP_RULE, {}, {}, "gip", "gip_institution_identity");
  const gipOffice = () =>
    put(
      2,
      magistrateKey,
      officeAuthorityLocus(),
      GIP_OFFICE_RULE,
      { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] },
      {},
      "gip",
      "gip_institution_identity",
    );
  const dispute = (
    n = 3,
    value: unknown = externalizedClaimDispute(),
    groupOver: any = {},
    rule: unknown = DIPLOMACY_CLAIM_DISPUTE_RULE,
    k = key(),
    over: any = {},
  ) => put(n, k, value, rule, groupOver, over);
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));
  const lawful = async (s: CampaignStore) => {
    await must(s.commit(gipIdentity()));
    await must(s.commit(gipOffice()));
  };
  const derived = externalizedClaimDispute(DISPUTE_A, { dependency_refs: [magistrateKey] });
  const derivedPin = { reads: [{ key: magistrateKey, version: 1 }], depends_on: ["group-2"] };

  it("lawful baseline and dependency-derived histories built by an admission-free store still verify (control)", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(dispute(3)));
        await must(
          s.commit(
            dispute(
              4,
              externalizedClaimDispute(DISPUTE_B, { dependency_refs: [magistrateKey] }),
              derivedPin,
              undefined,
              key(DISPUTE_B),
            ),
          ),
        );
      }),
    ).toBe("OK");
  });

  it("an advanced upstream dependency is the invalidation signal, not corruption: the dispute still verifies on load", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(dispute(3, derived, derivedPin)));
        await must(
          s.commit(
            put(
              4,
              magistrateKey,
              officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
                holder_ref: "holder-new",
              }),
              GIP_OFFICE_RULE,
              { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] },
              { expected_version: 1 },
              "gip",
              "gip_institution_identity",
            ),
          ),
        );
      }),
      // the only violation is the GIP office's own "no transition is implemented"; none is Diplomacy's
    ).toMatch(/^GIP_STATE$/);
  });

  it("a dispute whose registered dependency state is wrong is detected on load, though the history is replayable", async () => {
    for (const [name, groupOver, value] of [
      ["refs but pins nothing", {}, derived],
      ["refs, read but no dependency", { reads: derivedPin.reads }, derived],
      ["refs, dependency but no read", { depends_on: derivedPin.depends_on }, derived],
      [
        "refs, pins the identity instead",
        { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] },
        derived,
      ],
      [
        "refs, extra read",
        { reads: [...derivedPin.reads, { key: courtKey, version: 1 }], depends_on: ["group-2"] },
        derived,
      ],
      [
        "refs, no dependency on the committing group",
        { ...derivedPin, depends_on: ["group-1"] },
        derived,
      ],
      [
        "baseline that read a fact",
        { reads: derivedPin.reads, depends_on: derivedPin.depends_on },
        externalizedClaimDispute(),
      ],
      [
        "baseline that depended on a group",
        { depends_on: ["group-2"] },
        externalizedClaimDispute(),
      ],
    ] as const)
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(dispute(3, value, groupOver as any)));
        }),
        name,
      ).toMatch(/DIPLOMACY_STATE/);
  });

  it("a second write in the dispute group, a non-create write and a dispute moved forward are detected on load", async () => {
    expect(
      await base(async (s) => {
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              3,
              [
                write(key(), externalizedClaimDispute() as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_externalized_claim_dispute",
                }),
                write(key(DISPUTE_B), externalizedClaimDispute(DISPUTE_B) as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_externalized_claim_dispute",
                }),
              ],
              {
                owner: "diplomacy",
                facet: "diplomacy_externalized_claim_dispute",
                rule: DIPLOMACY_CLAIM_DISPUTE_RULE,
              },
            ),
          ),
        );
      }),
    ).toMatch(/DIPLOMACY_STATE/);
    expect(
      await base(async (s) => {
        await must(s.commit(dispute(3)));
        await must(
          s.commit(
            dispute(
              4,
              externalizedClaimDispute(DISPUTE_A, { status: "withdrawn" }),
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
              3,
              key(),
              externalizedClaimDispute(),
              DIPLOMACY_CLAIM_DISPUTE_RULE,
              { owner: "world_state", facet: "world_profile" },
              { owner: "world_state", facet: "world_profile" },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    for (const rule of [
      { ...DIPLOMACY_CLAIM_DISPUTE_RULE, clause: "drifted" },
      { ...DIPLOMACY_CLAIM_DISPUTE_RULE, native_pin: "2026-09-25T00:00:00.000Z" },
      DIPLOMACY_RECOGNITION_RULE,
      GIP_RULE,
      GIP_OFFICE_RULE,
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(dispute(3, externalizedClaimDispute(), undefined, rule)));
        }),
        JSON.stringify(rule).slice(0, 60),
      ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...externalizedClaimDispute(), relation_id: "x" },
      { ...externalizedClaimDispute(), party_refs: "a" },
      { ...externalizedClaimDispute(), effect_on: "receipt" },
      { ...externalizedClaimDispute(), status: ["a"] },
      (() => {
        const noStatus: any = externalizedClaimDispute();
        delete noStatus.status;
        return noStatus;
      })(),
      { ...externalizedClaimDispute(), parties: ["x"] },
      externalizedClaimDispute(DISPUTE_B), // names another dispute than its key
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(dispute(3, bad)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier is silent on a healthy campaign and reports a tampered dispute by key", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1);
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
