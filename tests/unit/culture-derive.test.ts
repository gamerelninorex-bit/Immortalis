/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate values structurally */
// Culture derivations (pure): the context's own consistency, the agreement between a decision and the context it adjudicated,
// and the shared meaning that ONLY an ESTABLISH_SUPPORTED decision determines. No store, no clock, no model.
import { beforeAll, describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  OWNER_CULTURE,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  cjaDecisionKey,
  cultureConventionStage,
  type CjaContextAttestation,
  type CultureUpdateContext,
} from "@immortalis/contracts";
import {
  buildCjaRecord,
  canonicalBindingViolation,
  cultureAccessClassViolation,
  cultureContextViolation,
  cultureSlotId,
  decisionContextViolation,
  deriveSharedMeaning,
  inputBasisViolation,
  type CultureFact,
} from "@immortalis/engine";
import { TEST_MANIFESTATION, scriptedJudgment, type ScriptedKind } from "@immortalis/testkit";
import {
  SCOPE_KEY,
  REFERENT_KEY,
  attestationOf,
  preparedCulture,
  seededCultureCampaign,
} from "../support/culture.ts";
import { tempDir } from "../support/tmp.ts";

let ctxFact: CultureFact<CultureUpdateContext>;
let att: CjaContextAttestation;
let campaignFacts: Map<string, any>;
const clone = <T>(x: T): T => structuredClone(x);

beforeAll(async () => {
  const s = await seededCultureCampaign(tempDir());
  const ctx = await preparedCulture(s);
  att = attestationOf(s, ctx.updateId);
  ctxFact = {
    key: ctx.fact.key,
    owner: ctx.fact.owner,
    version: ctx.fact.version,
    group_id: ctx.fact.provenance.group_id,
    value: ctx.value,
  };
  campaignFacts = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
});

const decisionFor = (
  kind: ScriptedKind,
  over: (r: any) => void = () => undefined,
): CultureFact<unknown> => {
  const record: any = clone(buildCjaRecord(att, scriptedJudgment(att, kind)));
  over(record);
  return {
    key: cjaDecisionKey(ctxFact.value.update_id),
    owner: OWNER_CULTURE_ADJUDICATION_KERNEL,
    version: 1,
    group_id: "cjadj:group:v1:x",
    value: record,
  };
};
const mutCtx = (f: (c: any) => void): CultureUpdateContext => {
  const c: any = clone(ctxFact.value);
  f(c);
  return c;
};

describe("the sealed context's own consistency", () => {
  it("accepts the sealed context", () => {
    expect(cultureContextViolation(ctxFact.value)).toBeNull();
  });
  it.each([
    ["a tampered update identity", (c: any) => (c.update_id = "f".repeat(64))],
    [
      "a tampered causal process",
      (c: any) => (c.causal_process_id = "cjadj:trigger:v1:" + "0".repeat(64)),
    ],
    ["a tampered state slot", (c: any) => (c.slot_id = "culture-slot-" + "0".repeat(64))],
    ["a trigger that is not an engaged input", (c: any) => (c.trigger_ref.version = 9)],
    ["a Culture-owned input", (c: any) => (c.inputs[1].owner = OWNER_CULTURE)],
    [
      "an adjudication-record input",
      (c: any) => (c.inputs[1].fact_key = "adjudication-culture/" + "a".repeat(64) + "/decision"),
    ],
    [
      "an unregistered AS-OF-DECLARED-CLOSE input",
      (c: any) =>
        (c.inputs[1].read = {
          basis: "AS-OF-DECLARED-CLOSE",
          close_basis: { name: "n", producer: { owner: c.inputs[1].owner, operation: "n" } },
        }),
    ],
    ["a duplicated input", (c: any) => (c.inputs[1] = clone(c.inputs[0]))],
    [
      "a non-Cohort constituency",
      (c: any) => (c.constituency.cohort_fact_key = "world/not-a-cohort"),
    ],
    ["another close basis", (c: any) => (c.constituency.close_basis.name = "other-close")],
    [
      "a stand-in (non-live) close vouch",
      (c: any) =>
        (c.constituency.close_vouch = {
          port: "PopulationCloseScopeVerifier",
          live_population_admission: false,
          reconciliation: "NOT_DUE",
        }),
    ],
    [
      "a live vouch naming another ledger",
      (c: any) => (c.constituency.close_vouch.evidence.ledger_id = "ledger-other"),
    ],
  ])("refuses %s", (_n, f) => {
    expect(cultureContextViolation(mutCtx(f))).not.toBeNull();
  });
});

describe("input and binding rules", () => {
  it("an engaged input is a foreign owner's fact on the AS-OF-NOW basis", () => {
    expect(inputBasisViolation(ctxFact.value.inputs[0]!)).toBeNull();
    expect(
      inputBasisViolation({ ...ctxFact.value.inputs[0]!, owner: OWNER_CULTURE }),
    ).not.toBeNull();
    expect(
      inputBasisViolation({ ...ctxFact.value.inputs[0]!, fact_key: "culture/x" }),
    ).not.toBeNull();
  });
  it("a referent and scope bind only to a committed locus or institution; a Cohort or an absent fact cannot be bound", () => {
    expect(canonicalBindingViolation(campaignFacts, REFERENT_KEY)).toBeNull();
    expect(canonicalBindingViolation(campaignFacts, SCOPE_KEY)).toBeNull();
    expect(
      canonicalBindingViolation(campaignFacts, ctxFact.value.constituency.cohort_fact_key),
    ).not.toBeNull();
    expect(canonicalBindingViolation(campaignFacts, "world/absent")).not.toBeNull();
  });
  it("a Culture fact is engine-side", () => {
    expect(cultureAccessClassViolation("culture.engine-sealed")).toBeNull();
    expect(cultureAccessClassViolation("public")).not.toBeNull();
  });
  it("the state slot is the distinction alone — never the trigger or the evidence", () => {
    expect(cultureSlotId(ctxFact.value.distinction)).toBe(ctxFact.value.slot_id);
  });
});

describe("a decision must be the adjudication of exactly this context", () => {
  const record = (over: (r: any) => void) => decisionFor("positive", over);
  it("agrees for the scripted decision", () => {
    expect(decisionContextViolation(ctxFact, decisionFor("positive"))).toBeNull();
  });
  it.each([
    ["another update", (r: any) => (r.culture_update_id = "f".repeat(64))],
    ["another trigger", (r: any) => (r.trigger_ref.version = 3)],
    ["other sources", (r: any) => (r.source_refs[0].version = 3)],
    ["another constituency", (r: any) => (r.constituency_ref.cohort_version = 99)],
    ["another distinction", (r: any) => (r.culture_question.context_id = "other")],
    ["another context group", (r: any) => (r.context_ref.committed_by_group_id = "other")],
    ["another context version", (r: any) => (r.context_ref.version = 2)],
  ])("refuses a decision citing %s", (_n, f) => {
    expect(decisionContextViolation(ctxFact, record(f))).not.toBeNull();
  });
  it("refuses a malformed record and a foreign owner or key", () => {
    expect(
      decisionContextViolation(ctxFact, { ...decisionFor("positive"), value: { junk: 1 } }),
    ).not.toBeNull();
    expect(
      decisionContextViolation(ctxFact, { ...decisionFor("positive"), owner: OWNER_CULTURE }),
    ).not.toBeNull();
    expect(
      decisionContextViolation(ctxFact, {
        ...decisionFor("positive"),
        key: "adjudication-culture/" + "b".repeat(64) + "/decision",
      }),
    ).not.toBeNull();
  });
});

describe("only an ESTABLISH_SUPPORTED decision determines a shared meaning", () => {
  it("derives exactly the meaning the context and decision determine, with the GM's manifestation verbatim", () => {
    const r = deriveSharedMeaning({ context: ctxFact, decision: decisionFor("positive") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      slot_id: ctxFact.value.slot_id,
      status: "ESTABLISHED",
      referent_key: REFERENT_KEY,
      scope_key: SCOPE_KEY,
      context_id: ctxFact.value.distinction.context_id,
      manifestation: TEST_MANIFESTATION,
      establishment: {
        update_id: ctxFact.value.update_id,
        context: { fact_key: ctxFact.key, version: 1 },
        decision: {
          fact_key: cjaDecisionKey(ctxFact.value.update_id),
          version: 1,
          decision_id: `cjadj:v1:${ctxFact.value.update_id}`,
        },
      },
      close: {
        name: COMMUNICATIVE_CONVENTION_CLOSE,
        stage: cultureConventionStage(ctxFact.value.update_id, ctxFact.value.slot_id),
      },
    });
  });
  it.each(["not_supported", "unresolved", "derive"] as const)(
    "a %s decision creates no Culture fact (a typed non-establishing result, not a refusal of the context)",
    (kind) => {
      const r = deriveSharedMeaning({ context: ctxFact, decision: decisionFor(kind) });
      expect(!r.ok && r.error.code).toBe("DECISION_NOT_ESTABLISHING");
    },
  );
  it("fails closed on a context that is not the Culture owner's own, mis-keyed or inconsistent", () => {
    expect(
      deriveSharedMeaning({
        context: { ...ctxFact, owner: "other" },
        decision: decisionFor("positive"),
      }).ok,
    ).toBe(false);
    expect(
      deriveSharedMeaning({
        context: { ...ctxFact, key: "culture/update/" + "c".repeat(64) + "/context" },
        decision: decisionFor("positive"),
      }).ok,
    ).toBe(false);
    expect(
      deriveSharedMeaning({
        context: { ...ctxFact, value: mutCtx((c) => (c.slot_id = "culture-slot-x")) },
        decision: decisionFor("positive"),
      }).ok,
    ).toBe(false);
  });
  it("the same sealed context and judgment always yield the same meaning (deterministic)", () => {
    const a = deriveSharedMeaning({ context: ctxFact, decision: decisionFor("positive") });
    const b = deriveSharedMeaning({ context: clone(ctxFact), decision: decisionFor("positive") });
    expect(a).toEqual(b);
  });
});
