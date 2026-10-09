// F-027-CJA1 review repair F49-R1 — a cited historical source version is bound to the group that actually WROTE it. The
// sealed context's `depends_on` only proves the cited group exists; the immutable journal must show that exact group
// committing `(owner, key, version)`. A later foreign version advance never invalidates a truthful citation.
/* eslint-disable @typescript-eslint/no-explicit-any -- groups are inspected and rebuilt structurally */
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  verifyCultureAdjudicationIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CJA_FIXTURE_EXTENSION,
  DEFAULT_OBSERVATIONS,
  GM_OPERATION,
  TestContextPort,
  observationGroup,
  scriptedJudgment,
  testAttestation,
  testContextGroup,
} from "@immortalis/testkit";
import { CJA_CAMPAIGN, cjaAdapter, must } from "../support/culture-adjudication.ts";
import { tempDir } from "../support/tmp.ts";

/**
 * Observations v1 each by their own group; ONE extra, unrelated, existing group B (a different observation fact). The
 * context cites `obs-repeat` v1 under `citeGroup`; it reads every input at v1 and depends on that group. Afterwards the
 * cited source advances to v2.
 */
async function scenario(citeGroup: "TRUE_AUTHOR" | "UNRELATED", advance: boolean) {
  const campaign = await must(
    CanonicalCampaign.create(tempDir(), {
      campaignId: CJA_CAMPAIGN,
      buildId: "cja-hist",
      extension: CJA_FIXTURE_EXTENSION,
    }),
  );
  const refs = new Map<string, { version: number; group_id: string }>();
  let n = 0;
  for (const o of DEFAULT_OBSERVATIONS) {
    n += 1;
    const g = observationGroup(CJA_CAMPAIGN, n, o.id, o.value);
    await must(campaign.store.commit(g));
    refs.set(o.id, { version: 1, group_id: g.group_id });
  }
  n += 1;
  const unrelated = observationGroup(CJA_CAMPAIGN, n, "obs-unrelated", {
    kind: "OBSERVED_ACT",
    other: true,
  });
  await must(campaign.store.commit(unrelated));
  if (citeGroup === "UNRELATED") {
    refs.set("obs-repeat", { version: 1, group_id: unrelated.group_id });
  }
  n += 1;
  const attestation = testAttestation(refs, `cja-ctx-group-${n}`);
  await must(campaign.store.commit(testContextGroup(CJA_CAMPAIGN, n, attestation)));
  if (advance) {
    n += 1;
    await must(
      campaign.store.commit(
        observationGroup(CJA_CAMPAIGN, n, "obs-repeat", { kind: "OBSERVED_ACT", later: true }, 1),
      ),
    );
    expect(campaign.store.getFact(attestation.inputs[1]!.fact_key)!.version).toBe(2);
  }
  const adapter = cjaAdapter(campaign.store, { contextPort: new TestContextPort(campaign.store) });
  return { campaign, attestation, adapter, unrelated };
}

const run = (s: Awaited<ReturnType<typeof scenario>>) =>
  s.adapter.adjudicate({
    operation: GM_OPERATION,
    judgment: scriptedJudgment(s.attestation, "positive"),
  });

describe("F49-R1 — historical source version bound to its actual committing group", () => {
  it("REJECTS a claim that attributes source v1 to an unrelated existing group, after the source advanced to v2", async () => {
    const s = await scenario("UNRELATED", true);
    const r = await run(s);
    expect(!r.ok && r.error.code).toBe("HISTORICAL_SOURCE_PROOF_MISSING");
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("adjudication-culture/")),
    ).toHaveLength(0);
  });

  it("rejects the same misattribution while the source is still at v1", async () => {
    const s = await scenario("UNRELATED", false);
    const r = await run(s);
    expect(!r.ok && r.error.code).toBe("CITATION_VERSION_MISMATCH");
  });

  it("ACCEPTS the identical history citing v1 by its true author after the source advanced to v2", async () => {
    const s = await scenario("TRUE_AUTHOR", true);
    const r = await run(s);
    expect(r.ok && r.value.disposition).toBe("COMMITTED");
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("rejects a cited group that wrote the key at a different version (v2 author cited for v1)", async () => {
    const s = await scenario("TRUE_AUTHOR", true);
    const v2Group = s.campaign.store.getFact(s.attestation.inputs[1]!.fact_key)!.provenance
      .group_id;
    const forged: any = structuredClone(s.attestation);
    forged.inputs[1].committed_by_group_id = v2Group;
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: { attest: () => ({ status: "ATTESTED", attestation: forged }) },
    });
    const r = await adapter.adjudicate({
      operation: GM_OPERATION,
      judgment: scriptedJudgment(s.attestation, "positive"),
    });
    expect(r.ok).toBe(false);
  });

  it("fails CLOSED when the store cannot supply the cited group from the journal", async () => {
    const s = await scenario("TRUE_AUTHOR", true);
    const inner = s.campaign.store;
    const blind: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: (g) => inner.commit(g),
    };
    const adapter = cjaAdapter(blind, { contextPort: new TestContextPort(inner) });
    const r = await adapter.adjudicate({
      operation: GM_OPERATION,
      judgment: scriptedJudgment(s.attestation, "positive"),
    });
    expect(!r.ok && r.error.code).toBe("HISTORICAL_SOURCE_PROOF_MISSING");
  });

  it("load integrity: a committed record whose journal misattributes the cited source group is reported; the truthful history is clean", async () => {
    const s = await scenario("TRUE_AUTHOR", true);
    expect((await run(s)).ok).toBe(true);
    const inner = s.campaign.store;
    expect(verifyCultureAdjudicationIntegrity(inner)).toEqual([]);
    const citedGroup = s.attestation.inputs[1]!.committed_by_group_id;
    // a rogue journal answering the cited group's id with the UNRELATED group instead
    const rogue: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      committedGroupById: (g) =>
        inner.committedGroupById!(g === citedGroup ? s.unrelated.group_id : g),
      close: () => inner.close(),
      commit: (g) => inner.commit(g),
    };
    const bad = verifyCultureAdjudicationIntegrity(rogue);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.some((b) => b.message.includes("HISTORICAL_SOURCE_PROOF_MISSING"))).toBe(true);
  });

  it("load integrity survives save, close and reopen with the source at v2", async () => {
    const dir = tempDir();
    const campaign = await must(
      CanonicalCampaign.create(dir, {
        campaignId: CJA_CAMPAIGN,
        buildId: "cja-hist-1",
        extension: CJA_FIXTURE_EXTENSION,
      }),
    );
    const refs = new Map<string, { version: number; group_id: string }>();
    let n = 0;
    for (const o of DEFAULT_OBSERVATIONS) {
      n += 1;
      const g = observationGroup(CJA_CAMPAIGN, n, o.id, o.value);
      await must(campaign.store.commit(g));
      refs.set(o.id, { version: 1, group_id: g.group_id });
    }
    n += 1;
    const att = testAttestation(refs, `cja-ctx-group-${n}`);
    await must(campaign.store.commit(testContextGroup(CJA_CAMPAIGN, n, att)));
    const adapter = cjaAdapter(campaign.store, {
      contextPort: new TestContextPort(campaign.store),
    });
    await must(
      adapter.adjudicate({ operation: GM_OPERATION, judgment: scriptedJudgment(att, "positive") }),
    );
    n += 1;
    await must(
      campaign.store.commit(observationGroup(CJA_CAMPAIGN, n, "obs-repeat", { later: 1 }, 1)),
    );
    await campaign.store.close();
    const reopened = await must(
      CanonicalCampaign.open(dir, { buildId: "cja-hist-2", extension: CJA_FIXTURE_EXTENSION }),
    );
    expect(verifyCultureAdjudicationIntegrity(reopened.store)).toEqual([]);
    expect(reopened.store.committedGroupById!(refs.get("obs-repeat")!.group_id)).not.toBeNull();
  });
});
