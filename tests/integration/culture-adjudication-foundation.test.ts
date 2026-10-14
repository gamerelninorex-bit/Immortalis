// F-027-CJA1 consumer-free adjudication-record prerequisite — foundation. A valid, authority-checked judgment over a sealed
// context commits one create-only RC-09 record under the stable CJA1 identity and loads by exact key; every one of the four
// outcomes is structurally admissible over the SAME sealed context (CJA1 §10.B C7); no Culture owner write is fabricated.
// Register lineage: RC-02, RC-09, RC-16; IM-12; F-027-CJA1 (Sovereign-approved v1.1; NOT native-pinned, NOT spec-locked).
// SYNTHETIC test-owned observation source, sealed-context stand-in and Port A/B stand-ins only. Local success is NOT acceptance.
import { describe, expect, it } from "vitest";
import {
  CjaDecisionRecordSchema,
  cjaDecisionGroupId,
  cjaDecisionId,
  cjaDecisionIntentId,
  cjaDecisionKey,
} from "@immortalis/contracts";
import { CultureAdjudicationAdapter, verifyCultureAdjudicationIntegrity } from "@immortalis/engine";
import {
  DEFAULT_OBSERVATIONS,
  GM_OPERATION,
  TEST_MANIFESTATION,
  scriptedJudgment,
  type ScriptedKind,
} from "@immortalis/testkit";
import {
  adjudicationFacts,
  must,
  reopenCja,
  seededCjaCampaign,
  type CjaSeeded,
} from "../support/culture-adjudication.ts";
import { tempDir } from "../support/tmp.ts";

const run = (s: CjaSeeded, kind: ScriptedKind = "positive") =>
  s.adapter.adjudicate({
    operation: GM_OPERATION,
    judgment: scriptedJudgment(s.attestation, kind),
  });

const updateIdOf = (s: CjaSeeded) => scriptedJudgment(s.attestation, "positive").culture_update_id;

describe("CJA1 foundation — the primary path", () => {
  it("commits a valid positive judgment and loads it by exact identity", async () => {
    const s = await seededCjaCampaign(tempDir());
    const out = await must(run(s));
    const id = updateIdOf(s);
    expect(out.disposition).toBe("COMMITTED");
    expect(out.verdict).toBe("ESTABLISH_SUPPORTED");
    expect(out.decision_id).toBe(cjaDecisionId(id));
    expect(out.record.key).toBe(cjaDecisionKey(id));
    expect(out.record.version).toBe(1);
    expect(out.record.group_id).toBe(cjaDecisionGroupId(id));

    const loaded = s.adapter.decision(id)!;
    expect(loaded.fact.provenance.intent_id).toBe(cjaDecisionIntentId(id));
    expect(loaded.fact.owner).toBe("culture_adjudication_kernel");
    expect(loaded.fact.facet).toBe("adjudication_provenance");
    expect(CjaDecisionRecordSchema.safeParse(loaded.fact.value).success).toBe(true);
    expect(loaded.value.verdict).toBe("ESTABLISH_SUPPORTED");
    expect(loaded.value.candidate_manifestation).toBe(TEST_MANIFESTATION);
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("reads a record only by exact identity, and nothing for a malformed or unknown id", async () => {
    const s = await seededCjaCampaign(tempDir());
    await must(run(s));
    expect(s.adapter.decision("nope")).toBeUndefined();
    expect(s.adapter.decision("0".repeat(64))).toBeUndefined();
  });

  it("is create-only: one fact, version 1, one decision group", async () => {
    const s = await seededCjaCampaign(tempDir());
    await must(run(s));
    const facts = adjudicationFacts(s.campaign.store);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.version).toBe(1);
  });
});

describe("CJA1 foundation — every outcome is structurally admissible over the same sealed context (C7)", () => {
  const KINDS: ScriptedKind[] = ["positive", "not_supported", "unresolved", "derive"];
  const VERDICT = {
    positive: "ESTABLISH_SUPPORTED",
    not_supported: "NOT_SUPPORTED",
    unresolved: "UNRESOLVED",
    derive: "DERIVE_WITHOUT_PERSISTENCE",
  } as const;

  it.each(KINDS)("admits %s and writes no Culture-owned fact", async (kind) => {
    const s = await seededCjaCampaign(tempDir());
    const before = s.campaign.store.listFacts().map((f) => f.key);
    const out = await must(run(s, kind));
    expect(out.verdict).toBe(VERDICT[kind]);
    const after = s.campaign.store.listFacts().map((f) => f.key);
    expect(after.filter((k) => !before.includes(k))).toEqual([cjaDecisionKey(updateIdOf(s))]);
    expect(after.some((k) => k.startsWith("culture/"))).toBe(false);
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("the four outcomes come from independent campaigns over identical sealed context (outcome swap)", async () => {
    const results = new Map<ScriptedKind, string>();
    const contextFingerprints = new Set<string>();
    for (const kind of KINDS) {
      const s = await seededCjaCampaign(tempDir());
      contextFingerprints.add(JSON.stringify(s.attestation));
      const out = await must(run(s, kind));
      results.set(kind, out.verdict);
    }
    expect(contextFingerprints.size).toBe(1);
    expect(new Set(results.values()).size).toBe(4);
  });

  it("non-tautology: no sealed observation carries a verdict, a manifestation id or an admission marker", async () => {
    const text = JSON.stringify(DEFAULT_OBSERVATIONS);
    for (const banned of [
      TEST_MANIFESTATION,
      "CONTINUING_SHARED_RECOGNITION",
      "ESTABLISH_SUPPORTED",
      "NOT_SUPPORTED",
      "UNRESOLVED",
      "DERIVE_WITHOUT_PERSISTENCE",
      "SATISFIED",
      "admit",
    ]) {
      expect(text).not.toContain(banned);
    }
    const s = await seededCjaCampaign(tempDir());
    const sealed = JSON.stringify(s.campaign.store.getFact(s.attestation.context.fact_key)!.value);
    expect(sealed).not.toContain(TEST_MANIFESTATION);
    expect(sealed).not.toContain("ESTABLISH_SUPPORTED");
  });

  it("a negative or derive-only outcome records no candidate manifestation", async () => {
    for (const kind of ["not_supported", "unresolved", "derive"] as const) {
      const s = await seededCjaCampaign(tempDir());
      await must(run(s, kind));
      const rec = s.adapter.decision(updateIdOf(s))!.value;
      expect(rec.candidate_manifestation).toBeNull();
    }
  });
});

describe("CJA1 foundation — no live foreign re-read and no version-churn deadlock", () => {
  it("a foreign source advancing after the seal does not invalidate the sealed judgment", async () => {
    const s = await seededCjaCampaign(tempDir());
    const { observationGroup } = await import("@immortalis/testkit");
    const g = observationGroup(
      "cja-campaign",
      90,
      "obs-trigger",
      { kind: "OBSERVED_ACT", later: true },
      1,
    );
    await must(s.campaign.store.commit(g));
    expect(s.campaign.store.getFact(s.attestation.inputs[0]!.fact_key)!.version).toBe(2);
    const out = await must(run(s));
    expect(out.disposition).toBe("COMMITTED");
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("persists across save, close and reopen", async () => {
    const dir = tempDir();
    const s = await seededCjaCampaign(dir);
    await must(run(s));
    await s.campaign.store.close();
    const r = await reopenCja(dir);
    const loaded = r.adapter.decision(updateIdOf(s));
    expect(loaded?.value.verdict).toBe("ESTABLISH_SUPPORTED");
  });

  it("is exported as a constructible adapter class", () => {
    expect(typeof CultureAdjudicationAdapter).toBe("function");
  });
});
