/* eslint-disable @typescript-eslint/no-explicit-any -- judgments and groups are mutated structurally to forge refusals */
// F-027-CJA1 recovery — RC-16 idempotent commit/recovery: a lost reply and a crash before commit reconcile by the
// deterministic identity; the adjudicator is never rerolled; save/close/reopen replays without a model or port; load
// integrity detects a record that no longer tells one story (the replay hash chain proves history, integrity proves meaning).
import { describe, expect, it } from "vitest";
import { cjaDecisionKey, type CjaAuthoredJudgment } from "@immortalis/contracts";
import { verifyCultureAdjudicationIntegrity, type CampaignStore } from "@immortalis/engine";
import { GM_OPERATION, scriptedJudgment } from "@immortalis/testkit";
import {
  cjaAdapter,
  crashBefore,
  isDecisionGroup,
  lostReply,
  must,
  reopenCja,
  seededCjaCampaign,
  adjudicationFacts,
  type CjaSeeded,
} from "../support/culture-adjudication.ts";
import { tempDir } from "../support/tmp.ts";

const J = (s: CjaSeeded, kind: Parameters<typeof scriptedJudgment>[1] = "positive") =>
  scriptedJudgment(s.attestation, kind);
const adjudicate = (a: ReturnType<typeof cjaAdapter>, j: CjaAuthoredJudgment) =>
  a.adjudicate({ operation: GM_OPERATION, judgment: j });

describe("CJA1 recovery — unknown outcomes", () => {
  it("a lost reply is reconciled by the deterministic identity: the retry replays, never re-commits", async () => {
    const s = await seededCjaCampaign(tempDir(), { wrap: (st) => lostReply(st, isDecisionGroup) });
    const j = J(s);
    const first = await adjudicate(s.adapter, j);
    expect(!first.ok && first.error.code).toBe("UNKNOWN_OUTCOME");
    const entries = s.campaign.store.head().journal_entries;
    const second = await adjudicate(s.adapter, j);
    expect(second.ok && second.value.disposition).toBe("REPLAYED");
    expect(s.campaign.store.head().journal_entries).toBe(entries);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(1);
  });

  it("after a lost reply a DIFFERENT judgment is never accepted over the committed one", async () => {
    const s = await seededCjaCampaign(tempDir(), { wrap: (st) => lostReply(st, isDecisionGroup) });
    await adjudicate(s.adapter, J(s));
    const other = await adjudicate(s.adapter, J(s, "not_supported"));
    expect(!other.ok && other.error.code).toBe("DECISION_CONFLICT");
  });

  it("a crash before commit leaves nothing; the same adapter refuses to reroll to a different judgment", async () => {
    let crash = true;
    const s = await seededCjaCampaign(tempDir(), {
      wrap: (st) => crashBefore(st, (g) => crash && isDecisionGroup(g)),
    });
    const first = await adjudicate(s.adapter, J(s));
    expect(!first.ok && first.error.code).toBe("UNKNOWN_OUTCOME");
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
    const reroll = await adjudicate(s.adapter, J(s, "derive"));
    expect(!reroll.ok && reroll.error.code).toBe("UNKNOWN_OUTCOME");
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
    crash = false;
    const same = await adjudicate(s.adapter, J(s));
    expect(same.ok && same.value.disposition).toBe("COMMITTED");
  });

  it("after reopening, a crash that committed nothing leaves the identity free", async () => {
    const dir = tempDir();
    const s = await seededCjaCampaign(dir, { wrap: (st) => crashBefore(st, isDecisionGroup) });
    await adjudicate(s.adapter, J(s));
    s.campaign.store.close();
    const r = await reopenCja(dir);
    const out = await adjudicate(r.adapter, J(s, "unresolved"));
    expect(out.ok && out.value.verdict).toBe("UNRESOLVED");
  });
});

describe("CJA1 recovery — save, close, reopen", () => {
  it("a reopened campaign replays the committed judgment with an identical receipt and no new journal entry", async () => {
    const dir = tempDir();
    const s = await seededCjaCampaign(dir);
    const first = await must(adjudicate(s.adapter, J(s)));
    const head = s.campaign.store.head();
    s.campaign.store.close();
    const r = await reopenCja(dir);
    expect(r.campaign.store.head().journal_head_sha256).toBe(head.journal_head_sha256);
    const again = await must(adjudicate(r.adapter, J(s)));
    expect(again.disposition).toBe("REPLAYED");
    expect(again.receipt).toEqual(first.receipt);
    expect(r.campaign.store.head().journal_entries).toBe(head.journal_entries);
    expect(verifyCultureAdjudicationIntegrity(r.campaign.store)).toEqual([]);
  });

  it("replay needs no context port: a reload replays even if Port A is gone", async () => {
    const dir = tempDir();
    const s = await seededCjaCampaign(dir);
    await must(adjudicate(s.adapter, J(s)));
    s.campaign.store.close();
    const r = await reopenCja(dir, {
      adapter: { contextPort: { attest: () => ({ status: "ABSENT" }) } },
    });
    const again = await adjudicate(r.adapter, J(s));
    expect(again.ok && again.value.disposition).toBe("REPLAYED");
  });

  it("a foreign version advance before reload does not invalidate the loaded record", async () => {
    const dir = tempDir();
    const s = await seededCjaCampaign(dir);
    await must(adjudicate(s.adapter, J(s)));
    const { observationGroup } = await import("@immortalis/testkit");
    await must(
      s.campaign.store.commit(observationGroup("cja-campaign", 91, "obs-repeat", { later: 1 }, 1)),
    );
    s.campaign.store.close();
    const r = await reopenCja(dir);
    expect(verifyCultureAdjudicationIntegrity(r.campaign.store)).toEqual([]);
  });
});

describe("CJA1 recovery — load integrity detects a record that no longer tells one story", () => {
  /** a rogue store view: the same campaign, with one fact's value rewritten */
  const rogue = (inner: CampaignStore, key: string, f: (v: any) => void): CampaignStore => {
    const rewrite = (fact: any) => {
      if (!fact || fact.key !== key) return fact;
      const c = structuredClone(fact);
      f(c.value);
      return c;
    };
    return {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => rewrite(inner.getFact(k)),
      listFacts: () => inner.listFacts().map(rewrite),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      committedGroupById: (i) => inner.committedGroupById?.(i) ?? null,
      close: () => inner.close(),
      commit: (g) => inner.commit(g),
    };
  };
  const settled = async () => {
    const s = await seededCjaCampaign(tempDir());
    await must(adjudicate(s.adapter, J(s)));
    return { s, key: cjaDecisionKey(J(s).culture_update_id) };
  };

  it.each([
    ["an incoherent verdict swap", (v: any) => (v.verdict = "DERIVE_WITHOUT_PERSISTENCE")],
    ["a tampered finding status", (v: any) => (v.findings.B.status = "NOT_SATISFIED")],
    ["a re-pointed trigger", (v: any) => (v.trigger_ref.version = 3)],
    ["a rewritten decision id", (v: any) => (v.decision_id = "cjadj:v1:" + "0".repeat(64))],
    ["a dropped assessment", (v: any) => v.assessment.pop()],
    [
      "a claimed live authentication basis",
      (v: any) => (v.adjudication_context.basis = "AUTHENTICATED_HUMAN"),
    ],
  ])("reports %s", async (_n, tamper) => {
    const { s, key } = await settled();
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
    const bad = verifyCultureAdjudicationIntegrity(rogue(s.campaign.store, key, tamper));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((b) => b.code === "CULTURE_ADJUDICATION_STATE")).toBe(true);
  });

  it("reports a record whose sealed context disappeared from committed state", async () => {
    const { s } = await settled();
    const ctxKey = s.attestation.context.fact_key;
    const inner = s.campaign.store;
    const view: CampaignStore = {
      ...rogue(inner, "", () => undefined),
      getFact: (k) => (k === ctxKey ? undefined : inner.getFact(k)),
      listFacts: () => inner.listFacts().filter((f) => f.key !== ctxKey),
    };
    expect(verifyCultureAdjudicationIntegrity(view).length).toBeGreaterThan(0);
  });

  it("reports a record whose committing group does not tell the deterministic story", async () => {
    const { s } = await settled();
    const inner = s.campaign.store;
    const view: CampaignStore = {
      ...rogue(inner, "", () => undefined),
      committedGroup: (i) => {
        const g: any = inner.committedGroup(i);
        return g && g.group_id.startsWith("cjadj:group:v1:") ? { ...g, depends_on: [] } : g;
      },
    };
    expect(verifyCultureAdjudicationIntegrity(view).length).toBeGreaterThan(0);
  });
});
