import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// Diplomacy Relation Edge Governing-Citation Source-Fidelity Repair (twenty-third slice) — behavior of the compatibility path:
// a new write is stamped with, and admission accepts, ONLY the corrected current citation; a persisted Relation Edge carrying the
// exact nineteenth-slice citation loads unchanged (no migration, rewriting or re-citation) and the campaign continues; any
// altered, hybrid or foreign citation, and any malformed value under the historical citation, is rule drift. The repair changes
// no Relation Edge gameplay contract and uses no randomness.
// Register lineage: IA-01, IA-02 (partial). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diplomacyRelationKey } from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE,
  DiplomacyAdapter,
  createFileCampaign,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  RELATION_A,
  RELATION_B,
  diplomacyPublication,
  fullRelationEdge,
  group,
  relationEdge,
  write,
} from "@immortalis/testkit";
import { establishRelationEdge, seededDiplomacyCampaign } from "../support/diplomacy.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HISTORICAL = DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE;
const key = (id = RELATION_A) => diplomacyRelationKey(id);
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

/** A history built by a store with NO admission: how a nineteenth-slice save carrying the historical citation exists on disk. */
async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
  const dir = tempDir();
  const s = await must(
    createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
  );
  await build(s);
  await s.close();
  return dir;
}
const put = (n: number, k: string, value: unknown, rule: unknown) =>
  group(
    FIXTURE_CAMPAIGN,
    n,
    [write(k, value as never, { owner: "diplomacy", facet: "diplomacy_relation_edge" })],
    { owner: "diplomacy", facet: "diplomacy_relation_edge", rule: rule as never },
  );
const withEdge = (value: unknown, rule: unknown, k = key()) =>
  rogue(async (s) => {
    await must(s.commit(put(1, k, value, rule)));
  });

describe("new-write discipline: only the corrected current citation is stamped and admitted", () => {
  it("a normally established Relation Edge is stamped with, and its group committed under, the corrected current citation", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1);
    const fact = s.campaign.store.getFact(key())!;
    expect(fact.provenance.rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    expect(fact.provenance.rule).not.toEqual(HISTORICAL);
    expect(fact.provenance.rule.clause).toContain("§4 Diplomatic Relevance / Reach Gate");
    expect(fact.provenance.rule.clause).not.toContain("§4 Relation Edge");
    expect(s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!.rule).toEqual(
      DIPLOMACY_RELATION_EDGE_RULE,
    );
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("a raw new write carrying the historical citation fails closed and creates no historical provenance", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const [i, value] of [relationEdge(), fullRelationEdge(RELATION_B)].entries()) {
      const r = await s.campaign.store.commit(
        put(10 + i, key(i === 0 ? RELATION_A : RELATION_B), value, HISTORICAL),
      );
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    }
    expect(s.campaign.store.getFact(key())).toBeUndefined();
    expect(s.campaign.store.getFact(key(RELATION_B))).toBeUndefined();
    expect(s.campaign.store.head().revision).toBe(before.revision);
    // control: the identical raw write under the current citation is admitted
    await must(
      s.campaign.store.commit(put(20, key(), relationEdge(), DIPLOMACY_RELATION_EDGE_RULE)),
    );
    await s.campaign.close();
  });

  it("a raw new write under any altered, hybrid or sibling citation is likewise refused", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 30;
    for (const rule of [
      { ...HISTORICAL, clause: HISTORICAL.clause.replace("§4 Relation Edge", "§4 Reach Gate") },
      // hybrids: the old §4 label spliced into the corrected clause, and the corrected §4 label spliced into the old one
      {
        ...DIPLOMACY_RELATION_EDGE_RULE,
        clause: DIPLOMACY_RELATION_EDGE_RULE.clause.replace(
          "§4 Diplomatic Relevance / Reach Gate (no all-pairs scan;",
          "§4 Relation Edge (no all-pairs scan;",
        ),
      },
      {
        ...HISTORICAL,
        clause: HISTORICAL.clause.replace(
          "§5.1 Relation Edge minimum surface",
          "§5.1 Diplomatic Relation Edge (minimum surface",
        ),
      },
      { ...DIPLOMACY_RELATION_EDGE_RULE, native_pin: "2026-09-25T00:00:00.000Z" },
      DIPLOMACY_RECOGNITION_RULE,
      DIPLOMACY_CLAIM_DISPUTE_RULE,
    ]) {
      const r = await s.campaign.store.commit(put(++n, key(), relationEdge(), rule));
      expect(r.ok, JSON.stringify(rule).slice(0, 80)).toBe(false);
      expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    }
    expect(s.campaign.store.getFact(key())).toBeUndefined();
    await s.campaign.close();
  });
});

describe("old-save compatibility: a historical-citation Relation Edge loads unchanged and the campaign continues", () => {
  it("loads, verifies and is not migrated, rewritten or re-cited by loading", async () => {
    const dir = await withEdge(fullRelationEdge(), HISTORICAL);
    const before = readFileSync(join(dir, stateFile(dir)), "utf8");
    const journalBefore = readFileSync(join(dir, "journal.jsonl"), "utf8");
    expect(await openOutcome(dir)).toBe("OK");
    expect(readFileSync(join(dir, stateFile(dir)), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "journal.jsonl"), "utf8")).toBe(journalBefore);

    const c = await must(CanonicalCampaign.open(dir));
    expect(c.verify()).toEqual([]);
    const fact = c.store.getFact(key())!;
    expect(fact.provenance.rule).toEqual(HISTORICAL);
    expect(fact.provenance.rule).not.toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    expect(fact.value).toEqual(fullRelationEdge());
    expect(new DiplomacyAdapter(c.store).relationEdge(RELATION_A)?.value).toEqual(
      fullRelationEdge(),
    );
    await c.close();
  });

  it("save → close → load → continue: a distinct Relation Edge is established under the corrected current citation beside the untouched historical one", async () => {
    const dir = await withEdge(relationEdge(), HISTORICAL);
    const c = await must(CanonicalCampaign.open(dir));
    const legacy = structuredClone(c.store.getFact(key())!);
    const diplomacy = new DiplomacyAdapter(c.store);

    await must(
      diplomacy.establishRelationEdge({
        ...diplomacyPublication(10),
        relation: relationEdge(RELATION_B),
      }),
    );
    expect(c.store.getFact(key(RELATION_B))!.provenance.rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    // the historical fact is byte-identical; establishing over its key still fails closed (establishment only, no lifecycle)
    expect(c.store.getFact(key())).toEqual(legacy);
    const over = await diplomacy.establishRelationEdge({
      ...diplomacyPublication(11),
      relation: relationEdge(RELATION_A, { lifecycle_status: "retired" }),
    });
    expect(over.ok).toBe(false);
    expect(c.store.getFact(key())).toEqual(legacy);
    expect(c.verify()).toEqual([]);
    await c.close();

    // the mixed-provenance campaign reloads and verifies, each fact still under its own citation
    const again = await must(CanonicalCampaign.open(dir));
    expect(again.verify()).toEqual([]);
    expect(again.store.getFact(key())!.provenance.rule).toEqual(HISTORICAL);
    expect(again.store.getFact(key(RELATION_B))!.provenance.rule).toEqual(
      DIPLOMACY_RELATION_EDGE_RULE,
    );
    await again.close();
  });
});

describe("tamper and drift rejection: only the exact whole historical citation on a lawful value is accepted", () => {
  it("any altered, mixed, re-pinned, re-lineaged or foreign citation is rule drift on load", async () => {
    const h = HISTORICAL;
    const cur = DIPLOMACY_RELATION_EDGE_RULE;
    for (const [name, rule] of Object.entries({
      "clause altered": { ...h, clause: h.clause.replace("not implemented", "implemented") },
      "clause with the corrected §4 label only": {
        ...h,
        clause: h.clause.replace(
          "§4 Relation Edge (a sparse continuity object, not a duplicate ledger and not a universal relationship, trust or reputation score)",
          "§4 Diplomatic Relevance / Reach Gate (no all-pairs scan)",
        ),
      },
      "hybrid: old §4 label spliced into the current clause": {
        ...cur,
        clause: cur.clause.replace(
          "§4 Diplomatic Relevance / Reach Gate (no all-pairs scan;",
          "§4 Relation Edge (no all-pairs scan;",
        ),
      },
      "hybrid: corrected §5.1 label spliced into the historical clause": {
        ...h,
        clause: h.clause.replace(
          "§5.1 Relation Edge minimum surface",
          "§5.1 Diplomatic Relation Edge (minimum surface",
        ),
      },
      "native pin altered": { ...h, native_pin: "2026-09-25T00:00:00.000Z" },
      "artifact altered": { ...h, artifact: "https://example.invalid/other" },
      "lineage truncated": { ...h, authority_lineage: h.authority_lineage.slice(1) },
      "lineage extended": { ...h, authority_lineage: [...h.authority_lineage, "extra"] },
      "effective basis altered": { ...h, effective_basis: "drifted" },
      "supersedes altered": { ...h, supersedes: "something" },
      "recognition citation": DIPLOMACY_RECOGNITION_RULE,
      "dispute citation": DIPLOMACY_CLAIM_DISPUTE_RULE,
    }))
      expect(await openOutcome(await withEdge(relationEdge(), rule)), name).toMatch(/RULE_DRIFT/);
    // controls: the exact historical and the exact current citation are canonical
    expect(await openOutcome(await withEdge(relationEdge(), h))).toBe("OK");
    expect(await openOutcome(await withEdge(relationEdge(), cur))).toBe("OK");
  });

  it("a state-file edit of a saved edge's citation to any non-exact variant is detected", async () => {
    const saved = async (rule: unknown) => withEdge(relationEdge(), rule);
    const edits: Record<string, (f: any) => void> = {
      "historical clause tampered": (f) => (f.provenance.rule.clause += " "),
      "historical pin tampered": (f) => (f.provenance.rule.native_pin = "2026-09-25T00:00:00.000Z"),
      "historical lineage tampered": (f) => f.provenance.rule.authority_lineage.pop(),
      "hybrid: current clause on the historical record": (f) =>
        (f.provenance.rule.clause = DIPLOMACY_RELATION_EDGE_RULE.clause),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved(HISTORICAL);
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === key()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a malformed Relation Edge value does not become admissible by carrying the historical citation", async () => {
    for (const bad of [
      { ...relationEdge(), channel_refs: [] },
      { ...relationEdge(), recognition_refs: ["r"] },
      { ...relationEdge(), active_claim_dispute_refs: [] },
      { ...relationEdge(), instrument_refs: [] },
      { ...relationEdge(), framework_refs: [] },
      { ...relationEdge(), extra_field: 1 },
      { ...relationEdge(), party_refs: "a" },
      { ...relationEdge(), lifecycle_status: ["a"] },
      { ...relationEdge(), provenance_ref: ["p"] },
      { ...relationEdge(), relation_id: "relation-other" },
    ]) {
      expect(await openOutcome(await withEdge(bad, HISTORICAL)), JSON.stringify(bad)).not.toBe(
        "OK",
      );
    }
    // control: the same values are no more admissible under the current citation
    expect(
      await openOutcome(
        await withEdge({ ...relationEdge(), channel_refs: [] }, DIPLOMACY_RELATION_EDGE_RULE),
      ),
    ).not.toBe("OK");
  });

  it("the historical citation on another kind's fact is not accepted", async () => {
    const dir = await rogue(async (s) => {
      await must(
        s.commit(
          group(
            FIXTURE_CAMPAIGN,
            1,
            [
              write(
                "diplomacy/recognition/recognition-a-1",
                { recognition_id: "recognition-a-1" } as never,
                { owner: "diplomacy", facet: "diplomacy_external_recognition" },
              ),
            ],
            {
              owner: "diplomacy",
              facet: "diplomacy_external_recognition",
              rule: HISTORICAL as never,
            },
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});
