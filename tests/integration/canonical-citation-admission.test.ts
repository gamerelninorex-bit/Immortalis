// A02: real canonical admission, durable publication and verified open. Disposable mechanism fixtures only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  worldProfileKey,
  gipInstrumentKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  productionReserveKey,
  type CommitGroup,
  type SourceRef,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  createFileCampaign,
  factKind,
  nodeFs,
  type FsOps,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  fixtureWorld,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  publication,
  SRC_REQ_1,
  SRC_RESERVE,
  drawdownAdvanceRequest,
  scopeBinding,
  write,
} from "@immortalis/testkit";
import { snapshotDir, tempDir } from "../support/tmp.ts";
import { must } from "../support/temporal.ts";
import {
  seededDrawdownCampaign,
  startAndRegisterExtraction,
  reopenDrawdown,
} from "../support/source-drawdown.ts";

const worldKind = factKind("world_profile");
const worldGroup = (n = 1, id = "citation-world"): CommitGroup =>
  group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(
        worldProfileKey(id),
        { ...fixtureWorld(), world_id: id },
        { owner: worldKind.owner, facet: worldKind.facet },
      ),
    ],
    { owner: worldKind.owner, facet: worldKind.facet, rule: worldKind.rule },
  );
const create = (dir: string, fs?: FsOps) =>
  must(CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, ...(fs ? { fs } : {}) }));
const bytes = (dir: string) => readFileSync(join(dir, "journal.jsonl"));

const invalidCitations: [string, Partial<SourceRef>][] = [
  ["wrong governing clause", { clause: `${worldKind.rule.clause} WRONG` }],
  ["wrong artifact", { artifact: "test://wrong-source" }],
  ["wrong source version", { native_pin: "wrong-version" }],
  ["invalid authority lineage", { authority_lineage: ["wrong-authority"] }],
  ["altered effective basis", { effective_basis: "wrong-basis" }],
  ["altered supersession", { supersedes: "wrong-predecessor" }],
];

describe("A02 canonical governing-citation admission", () => {
  it("a lawful alternate survives actual owner publication and verified reopen; one wrong value class refuses a mixed group", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("a02-alternate")));
    const reserve = s.drawdown.reserve(SRC_RESERVE)!;
    const kind = factKind("production_reserve");
    const alternate = kind.alternateRules!.find((r) => r.admits(reserve.value))!;
    expect(reserve.fact.provenance.rule).toEqual(alternate.rule);
    expect(reserve.fact.provenance.rule).not.toEqual(kind.rule);
    const first = { ...reserve.value, reserve_id: "alternate-valid-class" };
    const second = {
      ...reserve.value,
      reserve_id: "alternate-invalid-class",
      quantity: reserve.value.established,
      inflows: [],
    };
    expect(kind.valueSchema.safeParse(first).success).toBe(true);
    expect(kind.valueSchema.safeParse(second).success).toBe(true);
    expect(alternate.admits(first)).toBe(true);
    expect(alternate.admits(second)).toBe(false);
    const g = group(
      FIXTURE_CAMPAIGN,
      999,
      [first, second].map((value) =>
        write(productionReserveKey(value.reserve_id), value as never, {
          owner: kind.owner,
          facet: kind.facet,
        }),
      ),
      { owner: kind.owner, facet: kind.facet, rule: alternate.rule },
    );
    const before = s.campaign.store.head();
    const disk = snapshotDir(dir);
    // The first write passes citation qualification; the second must independently qualify.
    expect(await s.campaign.store.commit(g)).toMatchObject({
      ok: false,
      error: {
        code: "REFERENCE_INVALID",
        details: {
          key: productionReserveKey(second.reserve_id),
        },
      },
    });
    expect(s.campaign.store.head()).toEqual(before);
    expect(s.campaign.store.getFact(productionReserveKey(first.reserve_id))).toBeUndefined();
    expect(snapshotDir(dir)).toEqual(disk);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const reopened = await reopenDrawdown(dir);
    expect(reopened.drawdown.reserve(SRC_RESERVE)!.fact).toEqual(reserve.fact);
    expect(reopened.campaign.verify()).toEqual([]);
    await reopened.campaign.close();
  });
  it.each(invalidCitations)(
    "%s refuses before any canonical or durable mutation",
    async (_, delta) => {
      const dir = tempDir();
      const c = await create(dir);
      const head = c.store.head();
      const disk = snapshotDir(dir);
      const g = worldGroup();
      expect(await c.store.commit({ ...g, rule: { ...g.rule, ...delta } })).toMatchObject({
        ok: false,
        error: { code: "REFERENCE_INVALID" },
      });
      expect(c.store.head()).toEqual(head);
      expect(c.store.listFacts()).toEqual([]);
      expect(c.store.lookupReceipt(g.intent_id)).toBeNull();
      expect(snapshotDir(dir)).toEqual(disk);
      expect(c.verify()).toEqual([]);
      await c.close();
      const reopened = await must(CanonicalCampaign.open(dir, { audit: true }));
      expect(reopened.store.head()).toEqual(head);
      await reopened.close();
    },
  );

  it("an incomplete citation is refused by the real commit schema without mutation", async () => {
    const dir = tempDir();
    const c = await create(dir);
    const disk = snapshotDir(dir);
    const { native_pin, ...incomplete } = worldKind.rule;
    void native_pin;
    expect(await c.store.commit({ ...worldGroup(), rule: incomplete })).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_INVALID" },
    });
    expect(c.store.head().revision).toBe(0);
    expect(c.store.listFacts()).toEqual([]);
    expect(snapshotDir(dir)).toEqual(disk);
    await c.close();
  });

  it("an invalid governing citation refuses the entire multiwrite group atomically", async () => {
    const dir = tempDir();
    const c = await create(dir);
    const a = worldGroup();
    const b = worldGroup(2, "second-world");
    const combined = { ...a, writes: [...a.writes, ...b.writes] };
    const disk = snapshotDir(dir);
    expect(
      await c.store.commit({ ...combined, rule: { ...a.rule, clause: "WRONG" } }),
    ).toMatchObject({
      ok: false,
      error: { code: "REFERENCE_INVALID" },
    });
    expect(c.store.head().revision).toBe(0);
    expect(c.store.listFacts()).toEqual([]);
    expect(snapshotDir(dir)).toEqual(disk);
    const accepted = await must(c.store.commit(combined));
    expect(accepted.receipt.revision).toBe(1);
    expect(c.store.listFacts()).toHaveLength(2);
    expect(c.verify()).toEqual([]);
    await c.close();
    const reopened = await must(CanonicalCampaign.open(dir, { audit: true }));
    expect(reopened.store.lookupReceipt(a.intent_id)).toEqual(accepted.receipt);
    expect(reopened.verify()).toEqual([]);
    await reopened.close();
  });

  it("ordinary publisher and raw current citation survive strict replay and checkpoint reopen byte-exactly", async () => {
    const dir = tempDir();
    const c = await create(dir);
    await must(c.establishWorld({ ...publication(900), world: fixtureWorld() }));
    // Cross a real checkpoint boundary with registered World-State writes, rather than a mock checkpoint.
    let original;
    for (let n = 1; n <= 128; n++) {
      const r = await must(c.store.commit(worldGroup(n, `citation-world-${n}`)));
      if (n === 1) original = r.receipt;
    }
    const head = c.store.head();
    const facts = c.store.listFacts();
    const journal = bytes(dir);
    const identity = factKind("world_profile").rule;
    expect(c.store.getFact(worldProfileKey("citation-world-1"))?.provenance.rule).toEqual(identity);
    expect(
      JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head.checkpoint.revision,
    ).toBeGreaterThan(0);
    expect(c.verify()).toEqual([]);
    await c.close();
    for (const audit of [true, false]) {
      const d = await must(CanonicalCampaign.open(dir, { audit }));
      expect(d.store.head()).toEqual(head);
      expect(d.store.listFacts()).toEqual(facts);
      expect(d.store.lookupReceipt("intent-1")).toEqual(original);
      expect(await must(d.store.commit(worldGroup(1, "citation-world-1")))).toEqual({
        replayed: true,
        receipt: original,
      });
      expect(
        await d.store.commit({ ...worldGroup(1, "citation-world-1"), cause: "changed" }),
      ).toMatchObject({ ok: false, error: { code: "INTENT_CONFLICT" } });
      expect(d.store.head()).toEqual(head);
      expect(bytes(dir)).toEqual(journal);
      expect(d.verify()).toEqual([]);
      await d.close();
    }
  }, 60_000);

  it("an uncertain durable result blocks a second write and reconciles only the original receipt on verified reopen", async () => {
    const dir = tempDir();
    let armed = false;
    const fs: FsOps = {
      ...nodeFs,
      async appendDurable(path, data) {
        await nodeFs.appendDurable(path, data);
        if (armed) throw new Error("A02 injected failure after durable journal append");
      },
    };
    const c = await create(dir, fs);
    armed = true;
    expect(await c.store.commit(worldGroup())).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME" },
    });
    expect(await c.store.commit(worldGroup(2, "second-world"))).toMatchObject({
      ok: false,
      error: { code: "STORE_POISONED" },
    });
    await c.close();
    const d = await must(CanonicalCampaign.open(dir, { audit: true }));
    const retry = await must(d.store.commit(worldGroup()));
    expect(retry.receipt.revision).toBe(1);
    expect(d.store.getFact(worldProfileKey("second-world"))).toBeUndefined();
    expect(await must(d.store.commit(worldGroup()))).toEqual({ ...retry, replayed: true });
    expect(d.store.head().revision).toBe(1);
    expect(d.verify()).toEqual([]);
    await d.close();
  });
});

describe("A02 historical citation compatibility remains distinct from new admission", () => {
  it.each(["legacyRule", "laterLegacyRules"] as const)(
    "%s: historical receipt and journal stay exact; a new write refuses",
    async (which) => {
      const dir = tempDir();
      // Build an actual old-policy journal without today's admission. Production open below applies all real verifiers.
      const s = await must(
        createFileCampaign(dir, {
          campaignId: FIXTURE_CAMPAIGN,
          owners: CANONICAL_OWNER_REGISTRY,
          legacyFormat: true,
        }),
      );
      const institution = institutionIdentity();
      const office = officeAuthorityLocus();
      const binding = scopeBinding();
      const ik = gipInstitutionIdentityKey(institution.institution_id);
      const ok = gipOfficeAuthorityLocusKey(office.institution_id, office.office_id);
      const bk = gipScopeBindingKey(
        binding.institution_id,
        binding.office_id,
        binding.scope_binding_id,
      );
      const put = (
        n: number,
        kindId: Parameters<typeof factKind>[0],
        key: string,
        value: unknown,
        over: Partial<CommitGroup> = {},
      ) => {
        const kind = factKind(kindId);
        return group(
          FIXTURE_CAMPAIGN,
          n,
          [write(key, value as never, { owner: kind.owner, facet: kind.facet })],
          { owner: kind.owner, facet: kind.facet, rule: kind.rule, ...over },
        );
      };
      await must(s.commit(put(1, "gip_institution_identity", ik, institution)));
      await must(
        s.commit(
          put(2, "gip_office_authority_locus", ok, office, {
            reads: [{ key: ik, version: 1 }],
            depends_on: ["group-1"],
          }),
        ),
      );
      await must(
        s.commit(
          put(3, "gip_scope_binding", bk, binding, {
            reads: [{ key: ok, version: 1 }],
            depends_on: ["group-2"],
          }),
        ),
      );
      const kind = factKind("gip_governance_instrument");
      const citation = which === "legacyRule" ? kind.legacyRule! : kind.laterLegacyRules![0]!;
      const value =
        which === "legacyRule" ? governanceInstrument() : governanceInstrumentWithPredecessor();
      expect(citation.admits(value)).toBe(true);
      const g = put(4, kind.id, gipInstrumentKey(value.instrument_id), value, {
        rule: citation.rule,
        reads: [
          { key: ok, version: 1 },
          { key: bk, version: 1 },
        ],
        depends_on: ["group-2", "group-3"],
      });
      const original = await must(s.commit(g));
      const head = s.head();
      const facts = s.listFacts();
      const journal = bytes(dir);
      await s.close();
      for (const audit of [true, false]) {
        const c = await must(CanonicalCampaign.open(dir, { audit }));
        expect(c.verify()).toEqual([]);
        expect(c.store.head()).toEqual(head);
        expect(c.store.listFacts()).toEqual(facts);
        expect(await must(c.store.commit(g))).toEqual({ ...original, replayed: true });
        const next = { ...value, instrument_id: "new-historical-instrument" };
        const disk = snapshotDir(dir);
        expect(
          await c.store.commit({
            ...g,
            group_id: "new-group",
            intent_id: "new-intent",
            writes: [
              write(gipInstrumentKey(next.instrument_id), next as never, {
                owner: kind.owner,
                facet: kind.facet,
              }),
            ],
          }),
        ).toMatchObject({ ok: false, error: { code: "REFERENCE_INVALID" } });
        expect(c.store.head()).toEqual(head);
        expect(c.store.listFacts()).toEqual(facts);
        expect(c.store.lookupReceipt(g.intent_id)).toEqual(original.receipt);
        expect(bytes(dir)).toEqual(journal);
        expect(snapshotDir(dir)).toEqual(disk);
        await c.close();
      }
    },
  );

  it("a structurally valid old-policy save with an invalid rule is still refused by verified open", async () => {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: CANONICAL_OWNER_REGISTRY,
        legacyFormat: true,
      }),
    );
    const g = worldGroup();
    await must(s.commit({ ...g, rule: { ...g.rule, clause: "WRONG" } }));
    await s.close();
    expect(await CanonicalCampaign.open(dir, { audit: true })).toMatchObject({
      ok: false,
      error: {
        code: "CANON_INTEGRITY",
        details: {
          violations: expect.arrayContaining([expect.objectContaining({ code: "RULE_DRIFT" })]),
        },
      },
    });
  });
});
