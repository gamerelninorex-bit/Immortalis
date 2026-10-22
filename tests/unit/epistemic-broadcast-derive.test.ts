/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// F-014D BROADCAST_EXPOSURE — the single statements of its rules, and the consumers that must discriminate on the mode
// (F-014D §2.1 mode-consumer invariant: an unlowered BROADCAST_EXPOSURE event is never individual receipt, a packet,
// access-established evidence or an actor-access state). Pure; synthetic fixtures only.
// Register lineage: IA-11 (partial), IA-13 (partial), IA-16 (partial); RC-11, RC-14; IM-10.
import { beforeAll, describe, expect, it } from "vitest";
import {
  OWNER_EPISTEMIC_ACCESS,
  PROJECTION_UNAVAILABLE,
  accessEventKey,
  accessProvenanceKey,
  pcExistenceContractKey,
  populationCohortKey,
  populationLedgerKey,
  worldLocusKey,
  worldProfileKey,
  type BroadcastExposureEvent,
} from "@immortalis/contracts";
import {
  AUDIENCE_FACT_KIND_IDS,
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_FACT_KINDS,
  EPISTEMIC_ACCESS_RULE,
  EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
  basisEvidenceViolation,
  broadcastReferenceViolation,
  deriveEventSignalProjection,
  isBroadcastEvent,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  EVENT_BROADCAST,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  accessEvent,
  broadcastEvent,
  sourceKey,
} from "@immortalis/testkit";
import { EVENT_SIGNAL, formPcArrival, seedSignal, viewWith } from "../support/projection.ts";
import type { EpistemicSeeded } from "../support/epistemic.ts";

const violation = (patch: Partial<BroadcastExposureEvent>) =>
  broadcastReferenceViolation(broadcastEvent("e1", patch));

describe("the audience and source rules are one statement (broadcastReferenceViolation)", () => {
  it("accepts a World-State locus, a Population ledger and a Population Cohort as the coarse audience reference", () => {
    expect(violation({})).toBeNull();
    expect(
      violation({
        audience: { owner: "population", fact_key: populationLedgerKey("ledger-main"), version: 1 },
      }),
    ).toBeNull();
    expect(
      violation({
        audience: {
          owner: "population",
          fact_key: populationCohortKey("ledger-main", "cohort-burden-l"),
          version: 2,
        },
      }),
    ).toBeNull();
    expect([...AUDIENCE_FACT_KIND_IDS].sort()).toEqual([
      "population_cohort",
      "population_ledger",
      "world_locus",
    ]);
  });

  it("refuses every other fact as the audience: a profile, a PC, a binding, a capability, an Epistemic fact, a kernel fact, an unregistered key", () => {
    for (const [owner, fact_key] of [
      ["world_state", worldProfileKey(FIXTURE_WORLD_ID)],
      ["world_state", pcExistenceContractKey(FIXTURE_PC_ID)],
      ["world_state", "role-registry/binding/role.player_character"],
      ["world_state", `actor/${ACTOR_SMITH}/capability/c1`],
      ["world_state", accessEventKey("e1")],
      ["world_state", accessProvenanceKey("e1", ACTOR_SMITH)],
      ["world_state", "temporal/state"],
      ["world_state", "not/a/registered/key"],
      ["population", "population/ledger-main/close"],
      ["population", "world/w/locus/l"],
    ] as const)
      expect(violation({ audience: { owner, fact_key, version: 1 } }), fact_key).toMatch(
        /coarse reference to an authoritative World-State locus or Population ledger or Cohort/,
      );
  });

  it("refuses an audience whose claimed owner is not the registered owner of that key space", () => {
    expect(
      violation({
        audience: {
          owner: "population",
          fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
          version: 1,
        },
      }),
    ).toMatch(/coarse reference/);
    expect(
      violation({
        audience: {
          owner: "world_state",
          fact_key: populationLedgerKey("ledger-main"),
          version: 1,
        },
      }),
    ).toMatch(/coarse reference/);
  });

  it("refuses a source the Epistemic owner, the kernel or the Named-Actor owner holds, and a source that is also the audience authority", () => {
    for (const owner of ["epistemic_access", "temporal_kernel", "named_actor"])
      expect(
        violation({ source: { owner, fact_key: sourceKey(SOURCE_SPEAKER), version: 1 } }),
        owner,
      ).not.toBeNull();
    expect(
      violation({
        source: {
          owner: "world_state",
          fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
          version: 1,
        },
      }),
    ).toMatch(/different facts/);
    // a foreign carrier of any other registered owner is a lawful source
    expect(
      violation({
        source: {
          owner: SYNTH_ACCESS_SOURCE_OWNER,
          fact_key: sourceKey(SOURCE_SPEAKER),
          version: 3,
        },
      }),
    ).toBeNull();
  });

  it("discriminates the mode on the literal alone", () => {
    expect(isBroadcastEvent(broadcastEvent("e1"))).toBe(true);
    expect(isBroadcastEvent(accessEvent("e1", ACTOR_SMITH))).toBe(false);
  });
});

describe("the governing-rule citation of the new mode is additive: no existing citation changes", () => {
  const [event, packet, provenance] = EPISTEMIC_ACCESS_FACT_KINDS;

  it("every Epistemic kind keeps its current and its tenth-slice citation byte-for-byte", () => {
    for (const kind of EPISTEMIC_ACCESS_FACT_KINDS) {
      expect(kind.rule).toBe(EPISTEMIC_ACCESS_RULE);
      expect(kind.legacyRule!.rule).toBe(EPISTEMIC_ACCESS_RULE_TENTH_SLICE);
    }
  });

  it("only the event kind carries the broadcast citation, and it admits only a BROADCAST_EXPOSURE value (the observation-earned citations, the active Player Character's and a Named Actor's, are the kind's other, separate alternates)", () => {
    expect(packet!.alternateRules).toBeUndefined();
    expect(provenance!.alternateRules).toBeUndefined();
    expect(event!.alternateRules).toHaveLength(3);
    const alt = event!.alternateRules![0]!;
    expect(alt.rule).toBe(EPISTEMIC_ACCESS_BROADCAST_RULE);
    expect(alt.admits(broadcastEvent("e1"))).toBe(true);
    expect(alt.admits(accessEvent("e1", ACTOR_SMITH))).toBe(false);
    expect(alt.admits({ ...broadcastEvent("e1"), participants: [ACTOR_SMITH] })).toBe(false);
    expect(alt.admits(null)).toBe(false);
  });

  it("the broadcast citation is the same artifact, exact native pin and basis as the current one, and cites only what this mode relies on", () => {
    const base = EPISTEMIC_ACCESS_RULE;
    const next = EPISTEMIC_ACCESS_BROADCAST_RULE;
    expect(next).not.toEqual(base);
    expect(next.artifact).toBe(base.artifact);
    expect(next.native_pin).toBe(base.native_pin);
    expect(next.effective_basis).toBe(base.effective_basis);
    expect(next.supersedes).toBe(base.supersedes);
    expect(next.clause).toMatch(/§4\.4/);
    expect(next.clause).toMatch(/never itself individual receipt/);
    expect(next.clause).toMatch(/NOT implemented/);
    // nothing of the recipient-event capability close or Player Character route is claimed for a mode that reads no capability
    expect(next.clause).not.toMatch(
      /PC Capability Close|role\.player_character|actor-profile capability close/,
    );
    expect(next.authority_lineage.join("\n")).not.toMatch(/WS-016|I-002|Role Registry/);
  });

  it("the event kind validates both modes under the one key pattern", () => {
    expect(event!.keyPattern.test("access/e1/event")).toBe(true);
    expect(event!.valueSchema.safeParse(broadcastEvent("e1")).success).toBe(true);
    expect(event!.valueSchema.safeParse(accessEvent("e1", ACTOR_SMITH)).success).toBe(true);
    expect(
      event!.valueSchema.safeParse({ ...broadcastEvent("e1"), participants: [ACTOR_SMITH] })
        .success,
    ).toBe(false);
  });
});

describe("consumers discriminate on the mode: a broadcast event is never receipt", () => {
  it("KTI evidence refuses a genuine BROADCAST_EXPOSURE event, even one a sealed provenance claims to have been formed from", () => {
    const broadcast = broadcastEvent(EVENT_BROADCAST);
    const key = accessEventKey(EVENT_BROADCAST);
    const packetKey = `access/${EVENT_BROADCAST}/packet/${ACTOR_SMITH}`;
    const basis: any = { recipient: ACTOR_SMITH, packet: { fact_key: packetKey } };
    const provenance: any = {
      event: { fact_key: key, version: 1 },
      recipient: ACTOR_SMITH,
      packet: { fact_key: packetKey },
      source: broadcast.source,
      channel: "SPEECH",
      capability_close: null,
    };
    expect(
      basisEvidenceViolation({
        basis,
        provenance,
        event: { key, owner: OWNER_EPISTEMIC_ACCESS, version: 1, value: broadcast as any },
      }),
    ).toMatch(/BOUNDED_SHARED_ACCESS evidence: an unlowered broadcast is never receipt/);
  });

  describe("the I-001 Event-Signal Projection (IM-13)", () => {
    let s: EpistemicSeeded;
    beforeAll(async () => {
      s = await seedSignal();
      await formPcArrival(s);
    });
    const REFUSED = {
      ok: false,
      error: { code: PROJECTION_UNAVAILABLE, message: "no projection is available" },
    };

    it("refuses an event that is a genuine BROADCAST_EXPOSURE value, however the recipient and a packet are named", () => {
      const asBroadcast = (f: any) =>
        f ? { ...f, value: broadcastEvent(EVENT_SIGNAL) as any } : f;
      expect(
        deriveEventSignalProjection(viewWith(s, { [accessEventKey(EVENT_SIGNAL)]: asBroadcast }), {
          event_id: EVENT_SIGNAL,
          recipient_id: FIXTURE_PC_ID,
        }),
      ).toEqual(REFUSED);
    });
  });
});
