/* eslint-disable @typescript-eslint/no-explicit-any -- judgments and groups are mutated structurally to forge refusals */
// F-027-CJA1 enforcement — trusted-authority precedence (authority FIRST, replay included, no disclosure), structural
// refusal, sealed-reference citation closure, verdict/finding coherence, immutable conflict, owner exclusivity, and the
// create-only RC-09 path. Structural refusal is distinct from the substantive NOT_SUPPORTED / UNRESOLVED outcomes.
// SYNTHETIC test-owned stand-ins only; no live human or LLM authentication is claimed.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  cjaDecisionGroupId,
  cjaDecisionIntentId,
  cjaDecisionKey,
  type CjaAuthoredJudgment,
  type CjaContextAttestation,
} from "@immortalis/contracts";
import { verifyCultureAdjudicationIntegrity } from "@immortalis/engine";
import {
  CJA_TEST_RULE,
  GM_OPERATION,
  TestContextPort,
  observationKey,
  scriptedJudgment,
  type ScriptedKind,
} from "@immortalis/testkit";
import {
  adjudicationFacts,
  cjaAdapter,
  spyStore,
  seededCjaCampaign,
  type CjaSeeded,
} from "../support/culture-adjudication.ts";
import { tempDir } from "../support/tmp.ts";

const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};
const go = (s: CjaSeeded, j: unknown, ...op: [unknown?]) =>
  codeOf(s.adapter.adjudicate({ operation: op.length ? op[0] : GM_OPERATION, judgment: j }));
const judged = (
  s: CjaSeeded,
  kind: ScriptedKind = "positive",
  over: Partial<CjaAuthoredJudgment> = {},
) => scriptedJudgment(s.attestation, kind, over);
const clone = <T>(x: T): T => structuredClone(x);
const mut = (j: CjaAuthoredJudgment, f: (j: any) => void): CjaAuthoredJudgment => {
  const c: any = clone(j);
  f(c);
  return c;
};

describe("CJA1 trusted authority — checked FIRST", () => {
  const BAD = [
    undefined,
    null,
    {},
    { role: "role.gm" },
    { role: "role.player", permission: "permission.rule.adjudicate" },
    { role: "role.gm", permission: "permission.canon.write" },
    { role: "role.archivist", permission: "permission.canon.write" },
    { role: "role.gm", permission: "permission.rule.adjudicate", extra: "x" },
    "role.gm",
  ];
  it.each(BAD.map((b, i) => [i, b] as const))(
    "rejects operation context #%i without disclosure",
    async (_i, op) => {
      const s = await seededCjaCampaign(tempDir());
      expect(await go(s, judged(s), op)).toBe("AUTHORITY_DENIED");
      expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
    },
  );

  it("an unauthorized caller learns the same refusal for a fresh, a committed, a conflicting and a garbage judgment", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    const messages = new Set<string>();
    for (const j of [
      judged(s),
      judged(s, "derive"),
      { garbage: true },
      judged(s, "positive", { rule_ref: { ...CJA_TEST_RULE, clause: "other" } }),
    ]) {
      const r = await s.adapter.adjudicate({
        operation: { role: "role.player", permission: "x" },
        judgment: j,
      });
      expect(r.ok).toBe(false);
      messages.add(JSON.stringify(r));
    }
    expect(messages.size).toBe(1);
  });

  it("touches nothing — no store read, no port call, no commit — when unauthorized (replay included)", async () => {
    const dir = tempDir();
    const base = await seededCjaCampaign(dir);
    await codeOf(base.adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(base) }));
    const { store, calls } = spyStore(base.campaign.store);
    let portCalls = 0;
    const adapter = cjaAdapter(store, {
      contextPort: {
        attest: (id: string) => {
          portCalls += 1;
          return new TestContextPort(base.campaign.store).attest(id);
        },
      },
    });
    for (const j of [judged(base), judged(base, "derive"), "garbage"]) {
      const r = await adapter.adjudicate({
        operation: { role: "role.archivist", permission: "permission.canon.write" },
        judgment: j,
      });
      expect(r.ok).toBe(false);
    }
    expect(calls).toEqual([]);
    expect(portCalls).toBe(0);
  });

  it("a role string inside the judgment carries zero privilege", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = mut(judged(s), (c) => {
      c.role = "role.gm";
      c.permission = "permission.rule.adjudicate";
    });
    expect(await go(s, j, { role: "role.player", permission: "permission.rule.adjudicate" })).toBe(
      "AUTHORITY_DENIED",
    );
    // and a strict judgment schema refuses the smuggled fields even under the trusted context
    expect(await go(s, j)).toBe("JUDGMENT_INPUT_INVALID");
  });

  it("the record names the trusted precondition basis and never a live authentication", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    const rec = s.adapter.decision(judged(s).culture_update_id)!.value;
    expect(rec.adjudication_context).toEqual({
      role: "role.gm",
      permission: "permission.rule.adjudicate",
      basis: "TRUSTED_IN_PROCESS_PRECONDITION",
    });
    expect(JSON.stringify(rec)).not.toMatch(/authenticat/i);
  });
});

describe("CJA1 structural refusals are distinct from substantive outcomes", () => {
  it("substantive NOT_SUPPORTED and UNRESOLVED are COMMITTED records, not refusals", async () => {
    for (const kind of ["not_supported", "unresolved"] as const) {
      const s = await seededCjaCampaign(tempDir());
      expect(await go(s, judged(s, kind))).toBe("OK");
    }
  });

  it("refuses non-object, extra-field, and missing-field judgments as JUDGMENT_INPUT_INVALID", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, null)).toBe("JUDGMENT_INPUT_INVALID");
    expect(await go(s, [])).toBe("JUDGMENT_INPUT_INVALID");
    expect(
      await go(
        s,
        mut(judged(s), (c) => (c.extra = 1)),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
    expect(
      await go(
        s,
        mut(judged(s), (c) => delete c.verdict),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
    expect(
      await go(
        s,
        mut(judged(s), (c) => (c.verdict = "MAYBE")),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  });

  it("refuses malformed Unicode (lone surrogates) before any hash or write", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = mut(judged(s), (c) => (c.findings.A.reason = "ill-formed \ud800 text"));
    expect(await go(s, j)).toBe("JUDGMENT_INPUT_INVALID");
    const k = mut(judged(s), (c) => (c.assessment[0].reason = "tail \udc00"));
    expect(await go(s, k)).toBe("JUDGMENT_INPUT_INVALID");
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  });

  it("refuses non-plain JSON (undefined, NaN, class instances)", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(
      await go(
        s,
        mut(judged(s), (c) => (c.material_uncertainty = undefined)),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
    expect(
      await go(
        s,
        mut(judged(s), (c) => (c.assessment[0].reason = Number.NaN)),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
    expect(
      await go(
        s,
        mut(judged(s), (c) => (c.findings = new Map())),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
  });

  it("refuses a judgment citing another rule than the registered one", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = judged(s, "positive", { rule_ref: { ...CJA_TEST_RULE, native_pin: "other" } });
    expect(await go(s, j)).toBe("RULE_MISMATCH");
  });

  it("refuses a culture_update_id that is not the deterministic identity of the sealed situation", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = judged(s, "positive", { culture_update_id: "f".repeat(64) });
    const code = await go(s, j);
    expect(["CONTEXT_ABSENT", "IDENTITY_INVALID"]).toContain(code);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  });
});

describe("CJA1 sealed-reference citation closure", () => {
  const refuse = async (
    f: (j: any) => void,
    code = "CITATION_CLOSURE_VIOLATION",
    kind: ScriptedKind = "positive",
  ) => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, mut(judged(s, kind), f))).toBe(code);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  };
  it("refuses an omitted assessment", () => refuse((c) => c.assessment.pop()));
  it("refuses a duplicate assessment", () =>
    refuse((c) => c.assessment.push(clone(c.assessment[0]))));
  it("refuses a reordered assessment", () => refuse((c) => c.assessment.reverse()));
  it("refuses an assessment of an unsealed reference", () =>
    refuse((c) =>
      c.assessment.push({
        ref: {
          owner: "SYNTHETIC-CJA-OBSERVATION-SOURCE",
          fact_key: observationKey("elsewhere"),
          version: 1,
        },
        classification: "SUPPORTS",
        reason: "x",
      }),
    ));
  it("refuses a citation at a version other than the sealed one", () =>
    refuse((c) => (c.findings.A.citations[0].version = 2), "CITATION_VERSION_MISMATCH"));
  it("refuses a citation naming a different owner than the sealed one", () =>
    refuse(
      (c) => (c.findings.A.citations[0].owner = "SYNTHETIC-CJA-CONTEXT-SEALER"),
      "CITATION_VERSION_MISMATCH",
    ));
  it("refuses a citation of an unsealed (downstream / cross-context) fact", () =>
    refuse((c) =>
      c.findings.B.citations.push({
        owner: "SYNTHETIC-CJA-OBSERVATION-SOURCE",
        fact_key: observationKey("other-context"),
        version: 1,
      }),
    ));
  it("refuses a CONTRADICTS observation no finding accounts for (contrary evidence cannot be silently dropped)", () =>
    refuse((c) => {
      for (const f of ["A", "B", "C"]) {
        c.findings[f].citations = c.findings[f].citations.filter(
          (x: any) => !x.fact_key.endsWith("obs-deviation"),
        );
      }
    }));
  it("accepts a finding with no citations when it states a no_citation_reason", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = mut(judged(s, "unresolved"), (c) => {
      c.findings.B.citations = [];
      c.findings.B.no_citation_reason = "SYNTHETIC FIXTURE: nothing sealed bears on this element.";
    });
    expect(await go(s, j)).toBe("OK");
  });
  it("refuses a finding with neither citations nor a reason", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(
      await go(
        s,
        mut(judged(s, "unresolved"), (c) => (c.findings.B.citations = [])),
      ),
    ).toBe("JUDGMENT_INPUT_INVALID");
  });
});

describe("CJA1 verdict / finding coherence (C6)", () => {
  const refuse = async (kind: ScriptedKind, f: (j: any) => void) => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, mut(judged(s, kind), f))).toBe("JUDGMENT_INCOHERENT");
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  };
  it("ESTABLISH_SUPPORTED requires element A satisfied", () =>
    refuse("positive", (c) => (c.findings.A.status = "UNRESOLVED")));
  it("ESTABLISH_SUPPORTED requires element B satisfied", () =>
    refuse("positive", (c) => (c.findings.B.status = "NOT_SATISFIED")));
  it("ESTABLISH_SUPPORTED requires element C satisfied", () =>
    refuse("positive", (c) => (c.findings.C.status = "UNRESOLVED")));
  it("ESTABLISH_SUPPORTED requires a candidate manifestation", () =>
    refuse("positive", (c) => (c.candidate_manifestation = null)));
  it("ESTABLISH_SUPPORTED forbids material uncertainty", () =>
    refuse("positive", (c) => (c.material_uncertainty = "doubt")));
  it("ESTABLISH_SUPPORTED requires at least one SUPPORTS assessment", () =>
    refuse("positive", (c) =>
      c.assessment.forEach((a: any) => (a.classification = "NOT_PROBATIVE")),
    ));
  it("DERIVE_WITHOUT_PERSISTENCE requires element B not satisfied", () =>
    refuse("derive", (c) => (c.findings.B.status = "SATISFIED")));
  it("NOT_SUPPORTED and UNRESOLVED accept any individually justified A/B/C and invent no further rule", async () => {
    const s = await seededCjaCampaign(tempDir());
    const j = mut(judged(s, "not_supported"), (c) => {
      c.findings.A.status = "SATISFIED";
      c.findings.B.status = "SATISFIED";
      c.findings.C.status = "SATISFIED";
    });
    expect(await go(s, j)).toBe("OK");
  });
  it("positive prerequisites: every coherent verdict commits", async () => {
    for (const kind of ["positive", "not_supported", "unresolved", "derive"] as const) {
      const s = await seededCjaCampaign(tempDir());
      expect(await go(s, judged(s, kind))).toBe("OK");
    }
  });
});

describe("CJA1 sealed context verification (Port A is a claim)", () => {
  const forged = async (f: (a: any) => void, code: string | string[]) => {
    const s = await seededCjaCampaign(tempDir());
    const a: any = clone(s.attestation);
    f(a);
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: { attest: () => ({ status: "ATTESTED", attestation: a }) },
    });
    const r = await adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Array.isArray(code) ? code : [code]).toContain(r.error.code);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  };
  it("refuses an attestation of a context version that is not the committed one", () =>
    forged((a) => (a.context.version = 5), ["CONTEXT_MISMATCH", "CONTEXT_ABSENT"]));
  it("refuses an attestation naming the wrong committing group for the context", () =>
    forged(
      (a) => (a.context.committed_by_group_id = "other"),
      ["CONTEXT_MISMATCH", "CONTEXT_ABSENT"],
    ));
  it("refuses a context owned by an owner other than the registered consumer", () =>
    forged(
      (a) => (a.context.owner = "SYNTHETIC-CJA-OBSERVATION-SOURCE"),
      ["CONTEXT_MISMATCH", "CONTEXT_ABSENT"],
    ));
  it("refuses a source cited at a version ahead of the live one", () =>
    forged(
      (a) => (a.inputs[1].version = 9),
      ["CITATION_VERSION_MISMATCH", "HISTORICAL_SOURCE_PROOF_MISSING"],
    ));
  it("refuses a source with the wrong committing group", () =>
    forged(
      (a) => (a.inputs[1].committed_by_group_id = "other"),
      ["CITATION_VERSION_MISMATCH", "HISTORICAL_SOURCE_PROOF_MISSING"],
    ));
  it("refuses a source whose owner does not own the key", () =>
    forged(
      (a) => (a.inputs[1].owner = "SYNTHETIC-CJA-CONTEXT-SEALER"),
      [
        "CITATION_VERSION_MISMATCH",
        "HISTORICAL_SOURCE_PROOF_MISSING",
        "CONTEXT_MISMATCH",
        "CITATION_CLOSURE_VIOLATION",
      ],
    ));
  it("refuses a trigger_ref that is not one of the sealed inputs", () =>
    forged((a) => (a.trigger_ref.version = 7), ["IDENTITY_INVALID", "CONTEXT_MISMATCH"]));
  it("refuses an opportunity other than the fixed v1 literal", () =>
    forged((a) => (a.opportunity_id = "OTHER"), ["IDENTITY_INVALID", "CONTEXT_MISMATCH"]));
  it("refuses a different consumer operation", () =>
    forged((a) => (a.owner_operation_id = "other-op"), ["IDENTITY_INVALID", "CONTEXT_MISMATCH"]));
  it("refuses an input that is the context itself or a decision record", () =>
    forged(
      (a) => (a.inputs[1].fact_key = a.context.fact_key),
      [
        "CONTEXT_MISMATCH",
        "IDENTITY_INVALID",
        "CITATION_VERSION_MISMATCH",
        "HISTORICAL_SOURCE_PROOF_MISSING",
        "CITATION_CLOSURE_VIOLATION",
      ],
    ));
  it("refuses a duplicate source reference", () =>
    forged(
      (a) => (a.inputs[1] = clone(a.inputs[0])),
      [
        "CONTEXT_MISMATCH",
        "IDENTITY_INVALID",
        "CITATION_VERSION_MISMATCH",
        "HISTORICAL_SOURCE_PROOF_MISSING",
        "CITATION_CLOSURE_VIOLATION",
      ],
    ));
  it("refuses a malformed attestation", () => forged((a) => delete a.inputs, "CONTEXT_MISMATCH"));
  it("refuses an attestation carrying a lone surrogate", () =>
    forged((a) => (a.consumer_question = "x\ud800"), "CONTEXT_MISMATCH"));

  it("an absent context stops dependent work with a dependency code, not an adjudication", async () => {
    const s = await seededCjaCampaign(tempDir());
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: { attest: () => ({ status: "ABSENT" }) },
    });
    const r = await adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    expect(!r.ok && r.error.code).toBe("CONTEXT_ABSENT");
  });
  it("an unavailable port stops dependent work with CONTEXT_PORT_UNAVAILABLE", async () => {
    const s = await seededCjaCampaign(tempDir());
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: {
        attest: () => {
          throw new Error("down");
        },
      },
    });
    const r = await adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    expect(!r.ok && r.error.code).toBe("CONTEXT_PORT_UNAVAILABLE");
  });
});

describe("CJA1 constituency (Port B stand-in)", () => {
  const withConstituency = async (f: (c: any) => void) => {
    const s = await seededCjaCampaign(tempDir());
    const a: any = clone(s.attestation);
    f(a.constituency);
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: { attest: () => ({ status: "ATTESTED", attestation: a }) },
    });
    const r = await adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    return r.ok ? "OK" : r.error.code;
  };
  it("refuses a key that is not a Population Cohort", async () => {
    expect(
      await withConstituency((c) => (c.cohort_fact_key = "population/ledger-main/other")),
    ).toMatch(/CONSTITUENCY_INVALID|CONTEXT_MISMATCH/);
  });
  it("refuses a close basis other than the Population ordinary reconciliation close", async () => {
    expect(await withConstituency((c) => (c.close_basis.name = "other-close"))).toMatch(
      /CONSTITUENCY_INVALID|CONTEXT_MISMATCH/,
    );
  });
  it("refuses a vouch claiming live Population admission", async () => {
    expect(await withConstituency((c) => (c.close_vouch.live_population_admission = true))).toBe(
      "CONTEXT_MISMATCH",
    );
  });
  it("accepts a context with no constituency (null) when the scope is not a population", async () => {
    const s = await seededCjaCampaign(tempDir(), { spec: { constituency: null } });
    expect(await go(s, judged(s, "not_supported"))).toBe("OK");
  });
  it("a positive verdict requires a constituency", async () => {
    const s = await seededCjaCampaign(tempDir(), { spec: { constituency: null } });
    expect(await go(s, judged(s, "positive"))).toBe("JUDGMENT_INCOHERENT");
  });
});

describe("CJA1 immutable conflict and idempotence", () => {
  it("an identical retry replays the committed record with the same receipt", async () => {
    const s = await seededCjaCampaign(tempDir());
    const a = await s.adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    const b = await s.adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s) });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.disposition).toBe("REPLAYED");
      expect(b.value.record).toEqual(a.value.record);
      expect(b.value.receipt).toEqual(a.value.receipt);
    }
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(1);
  });

  it("a changed same-ID judgment is DECISION_CONFLICT and replaces nothing", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    const before = JSON.stringify(
      s.campaign.store.getFact(cjaDecisionKey(judged(s).culture_update_id)),
    );
    for (const other of [
      judged(s, "not_supported"),
      judged(s, "derive"),
      judged(s, "unresolved"),
      mut(judged(s), (c) => (c.findings.A.reason = "changed")),
    ]) {
      expect(await go(s, other)).toBe("DECISION_CONFLICT");
    }
    expect(
      JSON.stringify(s.campaign.store.getFact(cjaDecisionKey(judged(s).culture_update_id))),
    ).toBe(before);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(1);
  });

  it("the conflict is reached without consulting Port A", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    let calls = 0;
    const adapter = cjaAdapter(s.campaign.store, {
      contextPort: { attest: () => (calls++, { status: "ABSENT" as const }) },
    });
    const r = await adapter.adjudicate({ operation: GM_OPERATION, judgment: judged(s, "derive") });
    expect(!r.ok && r.error.code).toBe("DECISION_CONFLICT");
    expect(calls).toBe(0);
  });
});

describe("CJA1 owner exclusivity and the create-only RC-09 path", () => {
  it("only the adjudication owner may write the adjudication-culture/ key space", async () => {
    const s = await seededCjaCampaign(tempDir());
    const id = judged(s).culture_update_id;
    const base = {
      campaign_id: "cja-campaign",
      group_id: "probe-g",
      intent_id: "probe-i",
      cause: "probe",
      rule: CJA_TEST_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
    };
    for (const owner of [
      "SYNTHETIC-CJA-OBSERVATION-SOURCE",
      "SYNTHETIC-CJA-CONTEXT-SEALER",
      "population",
      "causal_draw_kernel",
      "culture_adjudication_kernel",
    ]) {
      const r = await s.campaign.store.commit({
        ...base,
        owner,
        facet: "adjudication_provenance",
        writes: [
          {
            key: cjaDecisionKey(id),
            owner,
            facet: "adjudication_provenance",
            value: { forged: true } as never,
            unit: null,
            basis: "b",
            secrecy: "s",
            expected_version: 0,
          },
        ],
      });
      expect(r.ok).toBe(false);
    }
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(0);
  });

  it("the adjudication owner cannot write any other key space", async () => {
    const s = await seededCjaCampaign(tempDir());
    const r = await s.campaign.store.commit({
      campaign_id: "cja-campaign",
      group_id: "probe-g2",
      intent_id: "probe-i2",
      owner: "culture_adjudication_kernel",
      facet: "adjudication_provenance",
      cause: "probe",
      rule: CJA_TEST_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: "culture/anything",
          owner: "culture_adjudication_kernel",
          facet: "adjudication_provenance",
          value: {} as never,
          unit: null,
          basis: "b",
          secrecy: "s",
          expected_version: 0,
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("a raw archivist commit of a forged or tampered record is refused by admission", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    const id = judged(s).culture_update_id;
    const real = s.campaign.store.getFact(cjaDecisionKey(id))!;
    // a second record under another id (hand-edited value) fails admission: the id must re-derive from the record's own fields
    const other = "a".repeat(64);
    const forgedValue = { ...(real.value as object) };
    const r = await s.campaign.store.commit({
      campaign_id: "cja-campaign",
      group_id: cjaDecisionGroupId(other),
      intent_id: cjaDecisionIntentId(other),
      owner: "culture_adjudication_kernel",
      facet: "adjudication_provenance",
      cause: "forged",
      rule: real.provenance.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: cjaDecisionKey(other),
          owner: "culture_adjudication_kernel",
          facet: "adjudication_provenance",
          value: forgedValue as never,
          unit: null,
          basis: "culture-adjudication-decision",
          secrecy: "engine-internal",
          expected_version: 0,
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(adjudicationFacts(s.campaign.store)).toHaveLength(1);
  });

  it("a committed record is never amended: an update at expected_version 1 is refused", async () => {
    const s = await seededCjaCampaign(tempDir());
    expect(await go(s, judged(s))).toBe("OK");
    const id = judged(s).culture_update_id;
    const real = s.campaign.store.getFact(cjaDecisionKey(id))!;
    const r = await s.campaign.store.commit({
      campaign_id: "cja-campaign",
      group_id: "amend-g",
      intent_id: "amend-i",
      owner: "culture_adjudication_kernel",
      facet: "adjudication_provenance",
      cause: "amend",
      rule: real.provenance.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: real.key,
          owner: real.owner,
          facet: real.facet,
          value: real.value as never,
          unit: null,
          basis: "culture-adjudication-decision",
          secrecy: "engine-internal",
          expected_version: 1,
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(s.campaign.store.getFact(real.key)!.version).toBe(1);
  });

  it("integrity is clean after enforcement refusals", async () => {
    const s = await seededCjaCampaign(tempDir());
    await go(s, judged(s, "positive", { rule_ref: { ...CJA_TEST_RULE, clause: "x" } }));
    expect(await go(s, judged(s, "derive"))).toBe("OK");
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });
});

export type { CjaContextAttestation };
