/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// Diplomacy External Recognition Core — save → close → load → continue across every durable cut of the establishment, a failure at
// EVERY durable step of the one authored publication, and load-time failure on a corrupted or inconsistent save. The recognition
// path reuses the existing persistence, receipts, journal and load-time integrity machinery: after any crash, retry, replay or
// reload the recognition exists exactly once, keeps its canonical key, authored fields, references, dependency pins, provenance and
// governing rule, and is never re-created, improved or rewritten (no randomness exists).
// Register lineage: IA-06, IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diplomacyRecognitionKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
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
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  RECOGNITION_A,
  RECOGNITION_B,
  SUCCESSOR_RULE_REF_A,
  diplomacyPublication,
  externalRecognition,
  fullExternalRecognition,
  group,
  instrumentFs,
  institutionIdentity,
  officeAuthorityLocus,
  write,
} from "@immortalis/testkit";
import {
  establishExternalRecognition,
  establishGipAuthority,
  reopenDiplomacy,
  seededDiplomacyCampaign,
  diplomacyFacts,
} from "../support/diplomacy.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = RECOGNITION_A) => diplomacyRecognitionKey(id);
const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);

const plan = [RECOGNITION_A, RECOGNITION_B] as const;

describe("save → close → load → continue at every durable cut of the establishment", () => {
  for (const cut of [0, 1, 2] as const) {
    it(`${cut} recognition(s) saved: reloads unchanged, verifies, and the continuation converges on the same two records`, async () => {
      const dir = tempDir();
      const s = await seededDiplomacyCampaign(dir);
      for (let i = 0; i < cut; i++) await establishExternalRecognition(s, i + 1, plan[i]);
      const saved = structuredClone(diplomacyFacts(s));
      await s.campaign.close();

      const r = await reopenDiplomacy(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(diplomacyFacts(r)).toEqual(saved);
      for (let i = 0; i < plan.length; i++) {
        const out = await r.diplomacy.establishExternalRecognition({
          ...diplomacyPublication(i + 1),
          recognition: externalRecognition(plan[i]),
        });
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(diplomacyFacts(r).map((f) => f.key)).toEqual([key(RECOGNITION_A), key(RECOGNITION_B)]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves every authored field exactly — including the optional condition, successor_rule_ref, listed statuses and an unlisted continuity_basis — key, version, provenance, governing rule and receipt; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    const authored = fullExternalRecognition(RECOGNITION_A, {
      recognition_status: "contested_or_unresolved",
      continuity_basis: "dynastic_line",
      effective_from: 1204,
    });
    await must(
      s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: authored,
      }),
    );
    await establishExternalRecognition(s, 2, RECOGNITION_B, {
      recognition_status: "limited_scope",
    });
    const facts = [key(RECOGNITION_A), key(RECOGNITION_B)].map((k) =>
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
    expect((r.campaign.store.getFact(key())!.value as any).successor_rule_ref).toBe(
      SUCCESSOR_RULE_REF_A,
    );
    expect(r.campaign.store.getFact(key())!.provenance.rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(r.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(diplomacyPublication(1).intent_id)).toEqual(committed);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(verifyDiplomacyIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });

  it("a dependency-derived recognition reloads with its pinned dependencies, reads, dependencies and provenance intact", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishGipAuthority(s, 10);
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
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
    expect(r.diplomacy.externalRecognition(RECOGNITION_A)!.dependencies).toEqual({
      current: true,
      invalidated: [],
    });
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });

  it("after a reload every post-establishment change is still refused, and a conflicting establishment still fails closed", async () => {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishExternalRecognition(s, 1);
    await s.campaign.close();
    const r = await reopenDiplomacy(dir);
    const fact = structuredClone(r.campaign.store.getFact(key())!);
    const conflict = await r.diplomacy.establishExternalRecognition({
      ...diplomacyPublication(2),
      recognition: externalRecognition(RECOGNITION_A, { recognition_status: "withdrawn" }),
    });
    expect(!conflict.ok && conflict.error.code).toBe("VERSION_CONFLICT");
    const changed = await r.diplomacy.establishExternalRecognition({
      ...diplomacyPublication(1),
      recognition: externalRecognition(RECOGNITION_A, { recognition_status: "withdrawn" }),
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
    const failed = await crash.establishExternalRecognition({
      ...diplomacyPublication(1),
      recognition: externalRecognition(),
    });
    expect(!failed.ok && failed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toBeNull();
    expect(s.campaign.store.head()).toEqual(before);
    await must(
      s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: externalRecognition(),
      }),
    );
    expect(diplomacyFacts(s).filter((f) => f.key === key())).toHaveLength(1);

    const second = externalRecognition(RECOGNITION_B);
    const lost = new DiplomacyAdapter(lostReply(s.campaign.store));
    const reply = await lost.establishExternalRecognition({
      ...diplomacyPublication(2),
      recognition: second,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(diplomacyPublication(2).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(2),
        recognition: second,
      }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key(), key(RECOGNITION_B)]);
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
      new DiplomacyAdapter(pc.store).establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: externalRecognition(),
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
        const r = await new DiplomacyAdapter(c.store).establishExternalRecognition({
          ...diplomacyPublication(1),
          recognition: externalRecognition(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem and reconcile by identity
        const reopened = await must(CanonicalCampaign.open(dir));
        const committed = reopened.store.lookupReceipt(diplomacyPublication(1).intent_id) !== null;
        // never a partial state: the recognition exists exactly when its receipt does
        expect(reopened.store.getFact(key()) !== undefined).toBe(committed);
        if (committed) seen.committed++;
        else seen.rolledBack++;
        const retry = await must(
          new DiplomacyAdapter(reopened.store).establishExternalRecognition({
            ...diplomacyPublication(1),
            recognition: externalRecognition(),
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

describe("load fails closed on a corrupted or tampered recognition save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededDiplomacyCampaign(dir);
    await establishGipAuthority(s, 10);
    await must(
      s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: fullExternalRecognition(RECOGNITION_A, { dependency_refs: [magistrateKey] }),
      }),
    );
    await establishExternalRecognition(s, 2, RECOGNITION_B);
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
    "recognition identity rewritten": (f) => (f.value.recognition_id = "recognition-forged"),
    "recognizer made an array": (f) => (f.value.recognizer_ref = [f.value.recognizer_ref]),
    "referent made an array": (f) =>
      (f.value.recognized_referent_ref = [f.value.recognized_referent_ref]),
    "scope made an array": (f) => (f.value.recognition_scope = [f.value.recognition_scope]),
    "status made an array": (f) => (f.value.recognition_status = ["recognized"]),
    "status removed": (f) => delete f.value.recognition_status,
    "continuity basis removed": (f) => delete f.value.continuity_basis,
    "continuity basis made an array": (f) => (f.value.continuity_basis = ["office"]),
    "authority basis removed": (f) => delete f.value.authority_basis_ref,
    "effective_from removed": (f) => delete f.value.effective_from,
    "effective_from made structured": (f) => (f.value.effective_from = { at: "x" }),
    "act reference removed": (f) => delete f.value.instrument_or_act_ref,
    "provenance reference removed": (f) => delete f.value.provenance_ref,
    "successor rule made an array": (f) => (f.value.successor_rule_ref = ["r"]),
    "dependency_refs made a string": (f) => (f.value.dependency_refs = magistrateKey),
    "alias for a source identifier": (f) => {
      f.value.scope = f.value.recognition_scope;
      delete f.value.recognition_scope;
    },
    "reciprocal field added": (f) => (f.value.reciprocal_recognition_ref = "x"),
    "score field added": (f) => (f.value.recognition_score = 1),
    "generic property added": (f) => (f.value.properties = { a: 1 }),
    "owner changed": (f) => (f.owner = "gip"),
    "facet changed": (f) => (f.facet = "gip_institution_identity"),
    "version advanced": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance pin drifted": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
    "provenance lineage altered": (f) => f.provenance.rule.authority_lineage.pop(),
    "provenance rule substituted by GIP's": (f) => (f.provenance.rule = structuredClone(GIP_RULE)),
  };
  it("an edit of a saved recognition — value, references, owner, facet, version, provenance or governing rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === key()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a state-file edit that adds or removes registered dependency state, moves the recognition, or removes its dependency is detected", async () => {
    for (const name of [
      "dependency_refs removed",
      "dependency_refs emptied",
      "dependency_refs repointed at a fact the group never read",
      "dependency removed",
      "moved key",
      "reciprocal copy appended",
      "baseline gains dependency_refs",
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      const a = j.facts.find((f: any) => f.key === key());
      const b = j.facts.find((f: any) => f.key === key(RECOGNITION_B));
      if (name === "dependency_refs removed") delete a.value.dependency_refs;
      else if (name === "dependency_refs emptied") a.value.dependency_refs = [];
      else if (name === "dependency_refs repointed at a fact the group never read")
        a.value.dependency_refs = [courtKey];
      else if (name === "dependency removed")
        j.facts = j.facts.filter((f: any) => f.key !== magistrateKey);
      else if (name === "moved key") a.key = key("recognition-elsewhere");
      else if (name === "reciprocal copy appended") {
        const copy = structuredClone(b);
        copy.key = key("recognition-reciprocal");
        copy.value.recognition_id = "recognition-reciprocal";
        copy.value.recognizer_ref = b.value.recognized_referent_ref;
        copy.value.recognized_referent_ref = b.value.recognizer_ref;
        j.facts.push(copy);
      } else b.value.dependency_refs = [magistrateKey];
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 180_000);

  it("a journal edit of the recognition's committed group fails replay: its authored fields, its references or its dependencies", async () => {
    for (const [from, to] of [
      ['"recognition_status":"recognized"', '"recognition_status":"withdrawn"'],
      ['"continuity_basis":"office"', '"continuity_basis":"personal"'],
      [SUCCESSOR_RULE_REF_A, "successor-rule-ref-forged"],
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

  /** A recognition built by a store with NO admission: a consistent, replayable history that is not canonical. */
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
    facet = "diplomacy_external_recognition",
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
  const recognition = (
    n = 3,
    value: unknown = externalRecognition(),
    groupOver: any = {},
    rule: unknown = DIPLOMACY_RECOGNITION_RULE,
    k = key(),
    over: any = {},
  ) => put(n, k, value, rule, groupOver, over);
  const base = async (build: (s: CampaignStore) => Promise<void>) =>
    openOutcome(await rogue(build));
  const lawful = async (s: CampaignStore) => {
    await must(s.commit(gipIdentity()));
    await must(s.commit(gipOffice()));
  };
  const derived = externalRecognition(RECOGNITION_A, { dependency_refs: [magistrateKey] });
  const derivedPin = { reads: [{ key: magistrateKey, version: 1 }], depends_on: ["group-2"] };

  it("lawful baseline and dependency-derived histories built by an admission-free store still verify (control)", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(recognition(3)));
        await must(
          s.commit(
            recognition(
              4,
              externalRecognition(RECOGNITION_B, { dependency_refs: [magistrateKey] }),
              derivedPin,
              undefined,
              key(RECOGNITION_B),
            ),
          ),
        );
      }),
    ).toBe("OK");
  });

  it("an advanced upstream dependency is the invalidation signal, not corruption: the recognition still verifies on load", async () => {
    expect(
      await base(async (s) => {
        await lawful(s);
        await must(s.commit(recognition(3, derived, derivedPin)));
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

  it("a recognition whose registered dependency state is wrong is detected on load, though the history is replayable", async () => {
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
        externalRecognition(),
      ],
      ["baseline that depended on a group", { depends_on: ["group-2"] }, externalRecognition()],
    ] as const)
      expect(
        await base(async (s) => {
          await lawful(s);
          await must(s.commit(recognition(3, value, groupOver as any)));
        }),
        name,
      ).toMatch(/DIPLOMACY_STATE/);
  });

  it("a second write in the recognition group, a non-create write and a recognition moved forward are detected on load", async () => {
    expect(
      await base(async (s) => {
        await must(
          s.commit(
            group(
              FIXTURE_CAMPAIGN,
              3,
              [
                write(key(), externalRecognition() as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_external_recognition",
                }),
                write(key(RECOGNITION_B), externalRecognition(RECOGNITION_B) as never, {
                  owner: "diplomacy",
                  facet: "diplomacy_external_recognition",
                }),
              ],
              {
                owner: "diplomacy",
                facet: "diplomacy_external_recognition",
                rule: DIPLOMACY_RECOGNITION_RULE,
              },
            ),
          ),
        );
      }),
    ).toMatch(/DIPLOMACY_STATE/);
    expect(
      await base(async (s) => {
        await must(s.commit(recognition(3)));
        await must(
          s.commit(
            recognition(
              4,
              externalRecognition(RECOGNITION_A, { recognition_status: "withdrawn" }),
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
              externalRecognition(),
              DIPLOMACY_RECOGNITION_RULE,
              { owner: "world_state", facet: "world_profile" },
              { owner: "world_state", facet: "world_profile" },
            ),
          ),
        );
      }),
    ).toMatch(/WRONG_OWNER_FACET/);
    for (const rule of [
      { ...DIPLOMACY_RECOGNITION_RULE, clause: "drifted" },
      { ...DIPLOMACY_RECOGNITION_RULE, native_pin: "2026-09-25T00:00:00.000Z" },
      GIP_RULE,
      GIP_OFFICE_RULE,
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(recognition(3, externalRecognition(), undefined, rule)));
        }),
        JSON.stringify(rule).slice(0, 60),
      ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...externalRecognition(), reciprocal_recognition_ref: "x" },
      { ...externalRecognition(), recognition_scope: ["a", "b"] },
      { ...externalRecognition(), scope: "x" },
      externalRecognition(RECOGNITION_B), // names another recognition than its key
    ])
      expect(
        await base(async (s) => {
          await must(s.commit(recognition(3, bad)));
        }),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier is silent on a healthy campaign and reports a tampered recognition by key", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
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
