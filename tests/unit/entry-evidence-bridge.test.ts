/* eslint-disable @typescript-eslint/no-explicit-any -- tests build host readings with deliberately invalid shapes */
// Initial Locality Bootstrap v0.9 ("Placement and Cycle"): the automatic native-entry bridge in review-sources.ts:entryEvidence admits valid
// external_claims ONLY when every claim's bearing is CONJUNCTIVE. Any CONTINGENT, missing or invalid bearing withholds it; the claims are
// forwarded unchanged (this predicate never edits or drops one). MECHANISM ONLY.
import { describe, expect, it } from "vitest";
import { entryEvidence, externalClaimsAllowBridge } from "../../apps/phone/src/review-sources.ts";
import type { OpeningSources } from "../../apps/phone/src/reviews.ts";

const CAMPAIGN = "campaign-bridge";
const source = {
  campaign: CAMPAIGN,
  generation: {
    presence: "I am at the salt pans, with Hale's leave stated alongside.",
    pc: "pc-1",
    world: "world-1",
    locus: "locus-1",
  },
} as unknown as OpeningSources;

const subject = JSON.stringify({
  campaign_id: CAMPAIGN,
  pc_id: "pc-1",
  world_id: "world-1",
  locus_id: "locus-1",
  statement: "I am at the salt pans, with Hale's leave stated alongside.",
});
const claim = (bearing: unknown, extra: Record<string, unknown> = {}) => ({
  kind: "INDEPENDENT_ACTOR_COOPERATION",
  bearing,
  rule_ids: ["IR-12"],
  grounds:
    "The statement says Hale has allowed it, alongside the presence the words establish themselves.",
  evidence_quote: "with Hale's leave",
  ...extra,
});
const reading = (external_claims: unknown) => ({
  embodiment: { mode: "SINGLE_MATERIAL_BODY" },
  presence: { mode: "NATIVE_AT_THIS_LOCUS" },
  external_claims,
  clarification: null,
});
const request = (external_claims: unknown, over: Record<string, unknown> = {}) =>
  ({
    verb: "establish-character-locus",
    subject,
    shown: [],
    interpretation: reading(external_claims),
    ...over,
  }) as any;

describe("entryEvidence: the all-CONJUNCTIVE external-claims bridge", () => {
  it("still admits the original no-claims reading", () => {
    expect(entryEvidence(source, request([]))).toBe(true);
  });

  it("admits valid claims whose bearing is ALL CONJUNCTIVE, forwarding every claim unchanged", () => {
    const claims = [
      claim("CONJUNCTIVE"),
      claim("CONJUNCTIVE", {
        kind: "EXTERNAL_RIGHT_OR_ACCESS",
        evidence_quote: "the pans are open",
      }),
    ];
    const r = request(claims);
    const before = JSON.stringify(r);
    expect(entryEvidence(source, r)).toBe(true);
    expect(JSON.stringify(r)).toBe(before); // the predicate neither removes nor rewrites a claim
    expect(r.interpretation.external_claims).toHaveLength(2);
  });

  it("withholds the bridge for any CONTINGENT claim - even one among conjunctive ones - and never removes it to make custody pass", () => {
    for (const claims of [
      [claim("CONTINGENT")],
      [claim("CONJUNCTIVE"), claim("CONTINGENT")],
      [claim("CONTINGENT"), claim("CONJUNCTIVE")],
    ]) {
      const r = request(claims);
      expect(entryEvidence(source, r)).toBe(false);
      expect(r.interpretation.external_claims).toHaveLength(claims.length);
    }
  });

  it("withholds the bridge for a missing, unknown or invalid bearing and for malformed claims or lists", () => {
    const bad: unknown[] = [
      [claim(undefined)],
      [claim("CONJUNCTIVE-ish")],
      [claim(null)],
      [claim(1)],
      [{ ...claim("CONJUNCTIVE"), extra: true }], // strict: no foreign field
      [{ kind: "INDEPENDENT_ACTOR_COOPERATION", bearing: "CONJUNCTIVE" }], // incomplete claim
      [claim("CONJUNCTIVE", { kind: "NOT_A_KIND" })],
      [claim("CONJUNCTIVE", { rule_ids: "IR-12" })],
      Array.from({ length: 7 }, () => claim("CONJUNCTIVE")), // more than the schema's six
      undefined,
      null,
      "CONJUNCTIVE",
      { 0: claim("CONJUNCTIVE") },
    ];
    for (const claims of bad)
      expect([claims, entryEvidence(source, request(claims))]).toEqual([claims, false]);
    expect(externalClaimsAllowBridge([claim("CONJUNCTIVE")])).toBe(true);
    expect(externalClaimsAllowBridge([])).toBe(true);
  });

  it("is still the exact reviewed native entry: another campaign, PC, world, locus, statement, embodiment or presence is not bridged", () => {
    const ok = [claim("CONJUNCTIVE")];
    const subjectWith = (over: Record<string, unknown>) =>
      JSON.stringify({ ...JSON.parse(subject), ...over });
    for (const over of [
      { campaign_id: "another" },
      { pc_id: "pc-2" },
      { world_id: "world-2" },
      { locus_id: "locus-2" },
      { statement: "another statement" },
    ])
      expect(entryEvidence(source, request(ok, { subject: subjectWith(over) }))).toBe(false);
    expect(
      entryEvidence(
        source,
        request(ok, {
          interpretation: {
            ...reading(ok),
            presence: { mode: "ELSEWHERE" },
          },
        }),
      ),
    ).toBe(false);
    expect(
      entryEvidence(
        source,
        request(ok, {
          interpretation: { ...reading(ok), embodiment: { mode: "INCORPOREAL" } },
        }),
      ),
    ).toBe(false);
    expect(
      entryEvidence(
        source,
        request(ok, { interpretation: { ...reading(ok), clarification: "which pan?" } }),
      ),
    ).toBe(false);
    expect(entryEvidence(source, request(ok, { verb: "keep-character" }))).toBe(false);
  });
});
