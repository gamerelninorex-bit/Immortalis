// F-014B P-7 E0 - P7-03..P7-09 and P7-14 against REAL in-memory campaigns built through the original Epistemic Access adapter and the Temporal
// coordinator. MECHANISM ONLY and NON-WRITING: nothing here is a certified all-enrolled wait, a GM/host result or a retained-storage result.
//
// Non-tautology rules: every owner fact a certificate or the evaluator relies on is a fact an ORIGINAL owner committed; the checker re-reads it
// and re-derives the receipt with the Epistemic owner's own derivation. Each positive has a negative twin that varies exactly one real
// input (the recipient, a second candidate, a same-instant competitor, the authority, a forged reference); the helpers never receive the
// expected verdict. The three authorities that stand in for producers the build does not install are LABELLED test doubles and every result
// that rests on one reports `fixture_dependent`.
import { describe, expect, it } from "vitest";
import {
  accessEventKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  temporalObjectKey,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  EVENT_COUNCIL,
  EVENT_SCHEMATIC,
  SOURCE_SCROLL,
  SYNTH_ACCESS_SOURCE_OWNER,
  SYNTH_OP_CONSUME_PACKET,
  SYNTH_PACKET_CONSUMER_OWNER,
  accessPublication,
  at,
  packetConsumerDeclaration,
  packetConsumerObject,
  packetConsumerResultKey,
  pcAccessEvent,
  pcCapabilityContract,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  evaluateEarliestChoice,
  gmFacingProjection,
  type EarliestChoiceInput,
  type EarliestChoiceResult,
  type EvaluatorContext,
} from "../support/p7-section10/evaluator.ts";
import {
  NO_HEALTH_OWNER_AUTHORITY,
  checkSection10,
  refOf,
  type EvidenceRef,
  type ReportInput,
} from "../support/p7-section10/proof.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  establishBroadcast,
  establishPcCapability,
  registerPacketConsumer,
  seededBroadcastCampaign,
  seededEpistemicCampaign,
} from "../support/epistemic.ts";
import {
  PC,
  PROVIDER_KEY,
  ROUTE_NON_OBSERVATION,
  certificateFor,
  currentAuthority,
  currentManifest,
  fixtureAbility,
  fixtureFirstOption,
  fixtureHistory,
  freshScene,
  ledgerOf,
  memberNamed,
  sceneIn,
  sourceClause,
  spyLedger,
  twinRefs,
  type Scene,
} from "../support/p7-section10/fixtures.ts";

// A bare second campaign: the separately committed history in which none of the scene's facts exist (the negative-history twin).
const twinCampaign = await seededEpistemicCampaign(tempDir());
const twins = new Map([["twin-bare", ledgerOf(twinCampaign)]]);

const twinSet = (sc: Scene): EvidenceRef[] => {
  const ev = sc.eventFact.key;
  const ob = sc.objectFact.key;
  return twinRefs({
    NO_OP: { ledger_id: "twin-bare", key: ev },
    OMITTED_GROUP: { ledger_id: "twin-bare", key: ob },
    HISTORICAL_VERSION: { ledger_id: "twin-bare", key: ev },
    ABSENT_NEW_FACT: { ledger_id: "twin-bare", key: ev },
    SAME_INSTANT_COMPETITOR: { ledger_id: "twin-bare", key: ob },
  });
};
const exclusionsOf = (sc: Scene): EarliestChoiceInput["exclusions"] =>
  twinSet(sc).flatMap((e) => (e.kind === "TWIN_ABSENCE" ? [e] : []));

const certsFor = (sc: Scene, over: Partial<Parameters<typeof certificateFor>[1]> = {}) => [
  certificateFor(memberNamed(PROVIDER_KEY), { scene: sc, twins: twinSet(sc), ...over }),
  certificateFor(memberNamed(ROUTE_NON_OBSERVATION), { scene: sc, twins: twinSet(sc), ...over }),
];

const ctxOf = (sc: Scene, over: Partial<ReportInput> = {}): ReportInput => ({
  manifest: currentManifest(),
  authority: currentAuthority(),
  ledger: sc.ledger,
  twins,
  pc: { entity_id: PC },
  cut: at(100),
  abilityAuthority: fixtureAbility("AVAILABLE"),
  firstOptionAuthority: fixtureFirstOption(0),
  history: fixtureHistory,
  certificates: certsFor(sc),
  ...over,
});

/** The same context with NO test-double authority: what production has today (no Health owner, no proven first option, no retired history). */
const withoutAuthorities = <T extends object>(c: T): T => {
  const copy = { ...c } as Record<string, unknown>;
  delete copy["abilityAuthority"];
  delete copy["firstOptionAuthority"];
  delete copy["history"];
  return copy as T;
};

const proofsOf = (sc: Scene, over: Partial<ReportInput> = {}) => {
  const r = checkSection10(ctxOf(sc, over));
  return [r.verdicts.get(PROVIDER_KEY)!, r.verdicts.get(ROUTE_NON_OBSERVATION)!];
};

const standingOf = (sc: Scene): EarliestChoiceInput["standing"] => {
  const store = sc.s.campaign.store;
  return {
    head: refOf(store.getFact(pcStandingLedgerHeadKey(PC))!),
    version: refOf(store.getFact(pcStandingLedgerVersionKey(PC, 1))!),
  };
};

const inputOf = (sc: Scene, over: Partial<EarliestChoiceInput> = {}): EarliestChoiceInput => ({
  window: { from: at(100), to: at(200) },
  pc: { entity_id: PC },
  due: refOf(sc.objectFact),
  candidates: [{ event: refOf(sc.eventFact), packet_object: refOf(sc.objectFact) }],
  route_proofs: proofsOf(sc),
  standing: standingOf(sc),
  exclusions: exclusionsOf(sc),
  ...over,
});

const evalCtx = (sc: Scene, over: Partial<EvaluatorContext> = {}): EvaluatorContext => ({
  manifest: currentManifest(),
  authority: currentAuthority(),
  ledger: sc.ledger,
  twins,
  abilityAuthority: fixtureAbility("AVAILABLE"),
  firstOptionAuthority: fixtureFirstOption(0),
  ...over,
});

const codes = (r: EarliestChoiceResult): string[] =>
  r.result === "NOT_PROVEN" ? r.reasons.map((x) => x.code) : [];
const details = (r: EarliestChoiceResult): string[] =>
  r.result === "NOT_PROVEN" ? r.reasons.map((x) => `${x.code}:${x.detail}`) : [];

const base = await freshScene(at(140));

describe("P7-03 executable evaluator [mechanism only, internal candidate fixture]", () => {
  it("the checker closes a candidate certificate for each real member from committed owner facts, and the aggregate stays NOT_ACCEPTED", () => {
    const r = checkSection10(ctxOf(base));
    expect(r.verdicts.get(PROVIDER_KEY)?.status).toBe("PROOF_CLOSED_CANDIDATE");
    expect(r.verdicts.get(ROUTE_NON_OBSERVATION)?.status).toBe("PROOF_CLOSED_CANDIDATE");
    expect(r.verdicts.get(PROVIDER_KEY)?.fixture_dependent).toBe(true);
    expect(r.report.aggregate).toMatchObject({ accepted: false, status: "NOT_ACCEPTED" });
    expect(r.report.aggregate.blockers).toEqual(
      expect.arrayContaining([
        "CODE_DRIFT_UNCHECKED",
        "EVALUATOR_NOT_INTEGRATED",
        "FIXTURE_AUTHORITY_USED",
        "FULL_P7_AND_S4_HOLD",
        "MEMBER_PROOFS_OPEN",
      ]),
    );
    // only the two members with evidence closed; every other member of the catalogue is still open
    const closed = r.report.members
      .filter((x) => x.status === "PROOF_CLOSED_CANDIDATE")
      .map((x) => x.member);
    expect(closed.sort()).toEqual([PROVIDER_KEY, ROUTE_NON_OBSERVATION].sort());
    expect(r.report.fixture_dependent_members).toEqual(
      [PROVIDER_KEY, ROUTE_NON_OBSERVATION].sort(),
    );
  });

  it("the evaluator derives an earliest-choice candidate from the evidence: knowledge at the packet boundary, option at once, labelled fixture-dependent", () => {
    const r = evaluateEarliestChoice(inputOf(base), evalCtx(base));
    expect(r).toMatchObject({
      result: "CANDIDATE_EARLIEST_CHOICE",
      instant: at(140),
      basis: {
        owner_event_instant: at(140),
        // the authored event was established at the canonical basis, the packet forms at the earned boundary: different stages
        access_established_at: at(100),
        packet_formed_at: at(140),
        knowledge_time: at(140),
        comprehension: "NOT_EVALUATED_GM_WRITE_ONCE_VERDICT_REQUIRED",
        first_option_at: at(140),
        relation_to_owner_event: "AT",
      },
      certified: false,
      writes: [],
      visibility: "PRIVATE_INTERNAL",
      fixture_dependent: true,
    });
  });

  it("negative twin: the same evidence with a first option that opens later moves the earliest choice later; one past the target is not a positive", () => {
    const later = evaluateEarliestChoice(
      inputOf(base, {
        route_proofs: proofsOf(base, { firstOptionAuthority: fixtureFirstOption(7) }),
      }),
      evalCtx(base, { firstOptionAuthority: fixtureFirstOption(7) }),
    );
    expect(later).toMatchObject({
      result: "CANDIDATE_EARLIEST_CHOICE",
      instant: at(147),
      basis: { relation_to_owner_event: "AFTER" },
    });
    const past = evaluateEarliestChoice(
      inputOf(base, {
        route_proofs: proofsOf(base, { firstOptionAuthority: fixtureFirstOption(500) }),
      }),
      evalCtx(base, { firstOptionAuthority: fixtureFirstOption(500) }),
    );
    expect(past.result).toBe("NOT_PROVEN");
    expect(codes(past)).toContain("FIRST_OPTION_AFTER_TARGET");
  });

  it("negative twin: the evaluator's OWN first-option and ability reads refuse even when the member proofs were closed by determinate readings", () => {
    const noOption = evaluateEarliestChoice(
      inputOf(base),
      evalCtx(base, { firstOptionAuthority: fixtureFirstOption(null) }),
    );
    expect(noOption.result).toBe("NOT_PROVEN");
    expect(codes(noOption)).toContain("FIRST_OPTION_UNPROVEN");
    const noAbility = evaluateEarliestChoice(
      inputOf(base),
      evalCtx(base, { abilityAuthority: fixtureAbility("UNKNOWN") }),
    );
    expect(codes(noAbility)).toContain("ABILITY_UNKNOWN");
  });

  it("negative twin: the real producer defaults refuse - no Health owner, no proven first option, no retired history", () => {
    expect(NO_HEALTH_OWNER_AUTHORITY.id).toBe("NO_HEALTH_OWNER_INSTALLED");
    const bare = checkSection10(withoutAuthorities(ctxOf(base)));
    const v = bare.verdicts.get(PROVIDER_KEY)!;
    expect(v.status).toBe("NOT_PROVEN");
    const open = Object.fromEntries(
      v.obligations.filter((o) => o.status === "OPEN").map((o) => [o.obligation, o.reason]),
    );
    expect(open).toMatchObject({
      RECIPIENT_ABILITY: "AUTHORITY_READING_MISMATCH",
      FIRST_PC_OPTION: "AUTHORITY_READING_MISMATCH",
      HISTORICAL_POLICY: "HISTORY_NOT_RETIRED",
    });
    const ev = evaluateEarliestChoice(
      inputOf(base, {
        route_proofs: [bare.verdicts.get(PROVIDER_KEY)!, bare.verdicts.get(ROUTE_NON_OBSERVATION)!],
      }),
      withoutAuthorities(evalCtx(base)),
    );
    expect(ev.result).toBe("NOT_PROVEN");
    expect(codes(ev)).toEqual(
      expect.arrayContaining(["ABILITY_UNKNOWN", "ROUTE_MEMBER_NOT_PROOF_CLOSED"]),
    );
    expect(ev.fixture_dependent).toBe(false);
  });
});

describe("incomparable clocks: a reading on another clock is never ordered, picked or defaulted [mechanism only] (BLUE review F-1 of f189f1d)", () => {
  const writeFree = () => {
    const store = base.s.campaign.store;
    const before = { head: store.head(), facts: store.listFacts().length };
    return () => expect({ head: store.head(), facts: store.listFacts().length }).toEqual(before);
  };
  const expectPrivateRefusal = (r: EarliestChoiceResult): void => {
    expect(r.result).toBe("NOT_PROVEN");
    expect(codes(r)).toContain("CLOCK_UNIT_MISMATCH");
    expect(r).toMatchObject({ certified: false, writes: [], visibility: "PRIVATE_INTERNAL" });
    // the refusal discloses nothing outward: the only GM/player-facing projection is the constant
    expect(JSON.stringify(gmFacingProjection(r))).toBe(
      '{"kind":"WITHHELD_PENDING_PROTECTED_RESULT"}',
    );
    expect("instant" in r).toBe(false);
  };

  it("a first option read on a different unit is NOT_PROVEN with a coded reason, not a guessed instant, an ordering or AT; the same-unit twin is still a positive", () => {
    const unchanged = writeFree();
    const foreign = evaluateEarliestChoice(
      inputOf(base),
      evalCtx(base, { firstOptionAuthority: fixtureFirstOption(0, "another-clock") }),
    );
    expectPrivateRefusal(foreign);
    expect(details(foreign).some((d) => d.startsWith("CLOCK_UNIT_MISMATCH:"))).toBe(true);
    // the discriminating variable is the unit alone: same value path, same authority, same evidence
    const same = evaluateEarliestChoice(
      inputOf(base),
      evalCtx(base, { firstOptionAuthority: fixtureFirstOption(0) }),
    );
    expect(same.result).toBe("CANDIDATE_EARLIEST_CHOICE");
    unchanged();
  });

  it("the same refusal holds whatever the foreign value is (earlier, equal or later than the knowledge time and the target would each have passed a defaulted comparison)", () => {
    for (const lag of [-30, 0, 7, 500]) {
      const r = evaluateEarliestChoice(
        inputOf(base),
        evalCtx(base, { firstOptionAuthority: fixtureFirstOption(lag, "another-clock") }),
      );
      expectPrivateRefusal(r);
    }
  });

  it("an active-boundary-index entry on another clock than the window is not silently skipped: the omission and same-instant checks cannot be bypassed that way", () => {
    const unchanged = writeFree();
    const indexKey = "temporal/boundary-index";
    const recast: typeof base.ledger = {
      get: (k) => {
        const f = base.ledger.get(k);
        if (k !== indexKey || f === undefined) return f;
        const v = f.value as {
          entries: {
            object_id: string;
            boundary_id: string;
            at: { unit: string; value: number };
          }[];
        };
        return {
          ...f,
          value: {
            entries: v.entries.map((e) => ({
              ...e,
              at: { unit: "another-clock", value: e.at.value },
            })),
          },
        };
      },
    };
    const r = evaluateEarliestChoice(inputOf(base), evalCtx(base, { ledger: recast }));
    expectPrivateRefusal(r);
    // the untouched index is the twin: the same evidence is a candidate
    expect(evaluateEarliestChoice(inputOf(base), evalCtx(base)).result).toBe(
      "CANDIDATE_EARLIEST_CHOICE",
    );
    unchanged();
  });

  it("a forged but self-consistent access event on another clock than its own packet boundary is refused, not ordered (labelled forged fixture)", () => {
    const unchanged = writeFree();
    const real = base.eventFact;
    const forged = {
      ...real,
      value: { ...(real.value as object), established_at: { unit: "another-clock", value: 100 } },
    };
    const ledger: typeof base.ledger = {
      get: (k) => (k === real.key ? forged : base.ledger.get(k)),
    };
    const r = evaluateEarliestChoice(
      inputOf(base, {
        candidates: [{ event: refOf(forged), packet_object: refOf(base.objectFact) }],
      }),
      evalCtx(base, { ledger }),
    );
    expectPrivateRefusal(r);
    unchanged();
  });

  it("a window on another clock than the due boundary is refused (existing behaviour kept)", () => {
    const r = evaluateEarliestChoice(
      inputOf(base, {
        window: {
          from: { unit: "another-clock", value: 100 },
          to: { unit: "another-clock", value: 200 },
        },
      }),
      evalCtx(base),
    );
    expect(r.result).toBe("NOT_PROVEN");
    expect(codes(r)).toContain("EVENT_NOT_IN_WINDOW");
  });
});

describe("P7-02 a member is not certified from a document, a source reference or a matched digest [mechanism only]", () => {
  const closedAfter = (mutate: (c: ReturnType<typeof certsFor>) => unknown[]) => {
    const r = checkSection10(ctxOf(base, { certificates: mutate(certsFor(base)) }));
    const v = r.verdicts.get(PROVIDER_KEY)!;
    return {
      status: v.status,
      open: Object.fromEntries(
        v.obligations.filter((o) => o.status === "OPEN").map((o) => [o.obligation, o.reason]),
      ),
    };
  };

  it("a syntactically valid certificate that cites only sources and the matched digest closes nothing", () => {
    const only = certificateFor(memberNamed(PROVIDER_KEY), { scene: base, twins: [] });
    const r = checkSection10(
      ctxOf(base, {
        certificates: [
          {
            ...only,
            claims: { SOURCE_POLICY: only.claims.SOURCE_POLICY! },
          },
        ],
      }),
    );
    const v = r.verdicts.get(PROVIDER_KEY)!;
    expect(v.status).toBe("NOT_PROVEN");
    expect(v.obligations.find((o) => o.obligation === "SOURCE_POLICY")?.status).toBe("CLOSED");
    expect(v.obligations.filter((o) => o.status === "OPEN").map((o) => o.reason)).toEqual(
      Array(7).fill("CLAIM_ABSENT"),
    );
  });

  it("an owner-fact reference is re-read: a stale version, a forged group, a wrong owner, a wrong digest and an absent key each refuse", () => {
    const patch = (f: (r: Record<string, unknown>) => void) => (c: ReturnType<typeof certsFor>) => {
      const copy = structuredClone(c[0]!);
      for (const ev of copy.claims.OWNER_STAGE_ROUTE!.evidence) f(ev as Record<string, unknown>);
      return [copy, c[1]!];
    };
    expect(closedAfter(patch((r) => (r["version"] = 99))).open).toMatchObject({
      OWNER_STAGE_ROUTE: "EVIDENCE_VERSION_MISMATCH",
    });
    expect(closedAfter(patch((r) => (r["group_id"] = "forged-group"))).open).toMatchObject({
      OWNER_STAGE_ROUTE: "EVIDENCE_GROUP_MISMATCH",
    });
    expect(closedAfter(patch((r) => (r["facet"] = "another-facet"))).open).toMatchObject({
      OWNER_STAGE_ROUTE: "EVIDENCE_OWNER_MISMATCH",
    });
    expect(closedAfter(patch((r) => (r["value_sha256"] = "0".repeat(64)))).open).toMatchObject({
      OWNER_STAGE_ROUTE: "EVIDENCE_VALUE_MISMATCH",
    });
    expect(
      closedAfter(patch((r) => (r["key"] = temporalObjectKey("never-committed")))).open,
    ).toMatchObject({ OWNER_STAGE_ROUTE: "EVIDENCE_FACT_ABSENT" });
  });

  it("a real committed fact of the WRONG member does not certify this one: the packet object does not declare another provider's stage", () => {
    const wrong = certificateFor(memberNamed(PROVIDER_KEY), { scene: base, twins: twinSet(base) });
    const asOtherProvider = {
      ...wrong,
      member: { family: "PROVIDER", id: "pc_existence|pc-publish-capability-close" },
    };
    const r = checkSection10(ctxOf(base, { certificates: [asOtherProvider] }));
    const v = r.verdicts.get("PROVIDER:pc_existence|pc-publish-capability-close")!;
    expect(v.status).toBe("NOT_PROVEN");
    const reasons = v.obligations.filter((o) => o.status === "OPEN").map((o) => o.reason);
    expect(reasons).toContain("STAGE_NOT_DECLARED_BY_MEMBER");
  });

  it("source identities are exact: a wrong pin, an unknown page and an unlisted clause refuse; a different catalogue digest refuses the whole certificate", () => {
    const withSource = (clause: unknown) => (c: ReturnType<typeof certsFor>) => {
      const copy = structuredClone(c[0]!);
      copy.claims.SOURCE_POLICY!.evidence.push(clause as never);
      return [copy, c[1]!];
    };
    const good = sourceClause();
    if (good.kind !== "SOURCE_CLAUSE") throw new Error("fixture");
    expect(
      closedAfter(withSource({ ...good, native_pin: "2026-11-11T02:29:27.465Z" })).open,
    ).toMatchObject({
      SOURCE_POLICY: "SOURCE_PIN_MISMATCH",
    });
    expect(
      closedAfter(withSource({ ...good, page_uuid: "11111111-1111-1111-1111-111111111111" })).open,
    ).toMatchObject({
      SOURCE_POLICY: "SOURCE_UNKNOWN",
    });
    expect(closedAfter(withSource({ ...good, clause: "section-99" })).open).toMatchObject({
      SOURCE_POLICY: "SOURCE_CLAUSE_UNKNOWN",
    });
    const stale = checkSection10(
      ctxOf(base, { certificates: certsFor(base, { digest: "f".repeat(64) }) }),
    ).verdicts.get(PROVIDER_KEY)!;
    expect(stale.status).toBe("NOT_PROVEN");
    expect(stale.obligations.filter((o) => o.status === "OPEN").map((o) => o.reason)).toContain(
      "CERT_CATALOGUE_MISMATCH",
    );
  });

  it("a certificate has no field in which a verdict can be stated: safe, guarded, passive, a disposition and the creates_epistemic_interruption literal are each refused by name", () => {
    for (const forged of [
      { safe: true },
      { guarded: true },
      { passive: true },
      { disposition: "INTERRUPTION_GUARDED" },
      { creates_epistemic_interruption: false },
    ]) {
      const c = { ...certsFor(base)[0]!, ...forged };
      const open = closedAfter(() => [c, certsFor(base)[1]!]).open;
      expect(open, JSON.stringify(forged)).toMatchObject({
        SOURCE_POLICY: "SELF_ASSERTED_VERDICT",
      });
    }
    // a nested forged verdict inside a claim is refused the same way
    const nested = structuredClone(certsFor(base)[0]!) as unknown as Record<string, unknown>;
    (nested["claims"] as Record<string, unknown>)["OWNER_STAGE_ROUTE"] = {
      evidence: [],
      proven: true,
    };
    expect(closedAfter(() => [nested]).open).toMatchObject({
      OWNER_STAGE_ROUTE: "SELF_ASSERTED_VERDICT",
    });
    // and a GM or model attestation is not an evidence kind at all
    const gm = structuredClone(certsFor(base)[0]!) as unknown as {
      claims: Record<string, { evidence: unknown[] }>;
    };
    gm.claims["RECIPIENT_ABILITY"]!.evidence.push({
      kind: "GM_ATTESTATION",
      text: "the PC hears fine",
    });
    expect(closedAfter(() => [gm]).open).toMatchObject({
      OWNER_STAGE_ROUTE: "CERT_SCHEMA_INVALID",
    });
  });

  it("an absent member, a duplicate certificate and a certificate for an unknown member never create or close a member", () => {
    const dup = closedAfter((c) => [c[0]!, structuredClone(c[0]!)]);
    expect(dup.status).toBe("NOT_PROVEN");
    expect(Object.values(dup.open)).toContain("CERT_DUPLICATE");
    const ghost = {
      ...certsFor(base)[0]!,
      member: { family: "KIND", id: "kind_nobody_registered" },
    };
    const r = checkSection10(ctxOf(base, { certificates: [...certsFor(base), ghost] }));
    expect(r.report.unmatched_certificates).toEqual(["KIND:kind_nobody_registered"]);
    expect(r.report.totals.members).toBe(checkSection10(ctxOf(base)).report.totals.members);
  });

  it("every negative-history twin class must be witnessed in a separately committed ledger and the key must be absent there", () => {
    const missingClass = (c: ReturnType<typeof certsFor>) => {
      const copy = structuredClone(c[0]!);
      copy.claims.NEGATIVE_TWINS!.evidence = copy.claims.NEGATIVE_TWINS!.evidence.filter(
        (e) => !(e.kind === "TWIN_ABSENCE" && e.twin === "SAME_INSTANT_COMPETITOR"),
      );
      return [copy, c[1]!];
    };
    expect(closedAfter(missingClass).open).toMatchObject({ NEGATIVE_TWINS: "TWIN_CLASS_MISSING" });
    const unknownTwin = (c: ReturnType<typeof certsFor>) => {
      const copy = structuredClone(c[0]!);
      for (const e of copy.claims.NEGATIVE_TWINS!.evidence)
        if (e.kind === "TWIN_ABSENCE") e.ledger_id = "no-such-twin";
      return [copy, c[1]!];
    };
    expect(closedAfter(unknownTwin).open).toMatchObject({ NEGATIVE_TWINS: "TWIN_LEDGER_UNKNOWN" });
    // the "twin" is the SAME history (the fact exists there too): that proves nothing about dependence
    const sameHistory = checkSection10(
      ctxOf(base, { twins: new Map([["twin-bare", base.ledger]]) }),
    ).verdicts.get(PROVIDER_KEY)!;
    expect(sameHistory.obligations.find((o) => o.obligation === "NEGATIVE_TWINS")?.reason).toBe(
      "TWIN_NOT_ABSENT",
    );
  });
});

describe("P7-02 digest identity is one obligation, never the proof [mechanism only]", () => {
  it("the same complete certificates close nothing against a stale or unknown current digest, and nothing against a certificate that names another digest", () => {
    const stale = checkSection10(
      ctxOf(base, { authority: { current: "e".repeat(64), retained: new Map() } }),
    );
    for (const key of [PROVIDER_KEY, ROUTE_NON_OBSERVATION]) {
      const v = stale.verdicts.get(key)!;
      expect(v.status, key).toBe("NOT_PROVEN");
      expect(v.obligations.find((o) => o.obligation === "IDENTITY")?.reason).toBe(
        "DIGEST_NOT_CURRENT",
      );
    }
    expect(stale.report.catalogue.digest_verdict).toBe("DIGEST_UNKNOWN");
  });
});

describe("the Epistemic routes close on their own evidence, and an event of the wrong route is no stand-in [mechanism only]", () => {
  it("a committed BROADCAST_EXPOSURE event closes the broadcast route only by proving it is never individual receipt; a bounded access event does not", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const sc = await sceneIn(s, { n: 1, consumerId: "c1", boundaryAt: at(140) });
    const broadcast = await establishBroadcast(s, 3, "event-broadcast");
    const bFact = s.campaign.store.getFact(accessEventKey(broadcast.event_id))!;
    const twinsFor = (key: string): EvidenceRef[] =>
      twinRefs({
        NO_OP: { ledger_id: "twin-bare", key },
        OMITTED_GROUP: { ledger_id: "twin-bare", key },
        HISTORICAL_VERSION: { ledger_id: "twin-bare", key },
        ABSENT_NEW_FACT: { ledger_id: "twin-bare", key },
        SAME_INSTANT_COMPETITOR: { ledger_id: "twin-bare", key },
      });
    const route = memberNamed("EPISTEMIC_ROUTE:BROADCAST_EXPOSURE");
    const certWith = (witness: ReturnType<typeof refOf>) =>
      certificateFor(route, { scene: sc, twins: twinsFor(bFact.key), knowledge: [witness] });
    const verdictFor = (witness: ReturnType<typeof refOf>) =>
      checkSection10(ctxOf(sc, { certificates: [certWith(witness)] })).verdicts.get(route.key)!;
    expect(verdictFor(refOf(bFact)).status).toBe("PROOF_CLOSED_CANDIDATE");
    const wrong = verdictFor(refOf(sc.eventFact));
    expect(wrong.status).toBe("NOT_PROVEN");
    expect(
      wrong.obligations.find((o) => o.obligation === "RECIPIENT_KNOWLEDGE_LATENCY")?.reason,
    ).toBe("EVENT_NOT_BROADCAST");
    // the converse twin: a broadcast event offered as a PC's bounded receipt is not receipt
    const asReceipt = checkSection10(
      ctxOf(sc, {
        certificates: [
          certificateFor(memberNamed(PROVIDER_KEY), {
            scene: sc,
            twins: twinSet(sc),
            knowledge: [refOf(sc.objectFact), refOf(bFact)],
          }),
        ],
      }),
    ).verdicts.get(PROVIDER_KEY)!;
    expect(
      asReceipt.obligations.find((o) => o.obligation === "RECIPIENT_KNOWLEDGE_LATENCY")?.reason,
    ).toBe("BROADCAST_NOT_RECEIPT");
    // a direct-observation witness must be observation-earned: an authored bounded event is not
    const direct = memberNamed("EPISTEMIC_ROUTE:DIRECT_OBSERVATION");
    const dv = checkSection10(
      ctxOf(sc, {
        certificates: [
          certificateFor(direct, {
            scene: sc,
            twins: twinSet(sc),
            knowledge: [refOf(sc.eventFact)],
          }),
        ],
      }),
    ).verdicts.get(direct.key)!;
    expect(dv.obligations.find((o) => o.obligation === "RECIPIENT_KNOWLEDGE_LATENCY")?.reason).toBe(
      "EVENT_NOT_OBSERVATION_EARNED",
    );
    // in the evaluator the broadcast contributes no knowledge and needs its own closed route; the bounded PC receipt still decides
    const proofs = [
      ...proofsOf(sc),
      checkSection10(ctxOf(sc, { certificates: [certWith(refOf(bFact))] })).verdicts.get(
        route.key,
      )!,
    ];
    const r = evaluateEarliestChoice(
      inputOf(sc, {
        route_proofs: proofs,
        candidates: [
          { event: refOf(sc.eventFact), packet_object: refOf(sc.objectFact) },
          { event: refOf(bFact), packet_object: null },
        ],
      }),
      evalCtx(sc),
    );
    expect(r.result).toBe("CANDIDATE_EARLIEST_CHOICE");
    // without the broadcast route's own proof the broadcast candidate cannot be set aside
    const missing = evaluateEarliestChoice(
      inputOf(sc, {
        candidates: [
          { event: refOf(sc.eventFact), packet_object: refOf(sc.objectFact) },
          { event: refOf(bFact), packet_object: null },
        ],
      }),
      evalCtx(sc),
    );
    expect(details(missing)).toContain(
      "ROUTE_MEMBER_NOT_PROOF_CLOSED:EPISTEMIC_ROUTE:BROADCAST_EXPOSURE",
    );
  });
});

describe("P7-04 knowledge time: occurrence, access, packet and choice are separate [mechanism only]", () => {
  it("an owner event whose access is for ANOTHER recipient is not a player interruption (a candidate with no actionable knowledge)", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const other = await sceneIn(s, {
      n: 1,
      consumerId: "c1",
      recipient: ACTOR_SMITH,
      boundaryAt: at(140),
    });
    // the member proofs are about the catalogue's members, not about this campaign: they were issued from the PC scene's evidence
    const r = evaluateEarliestChoice(
      inputOf(other, { route_proofs: proofsOf(base) }),
      evalCtx(other),
    );
    expect(r.result).toBe("CANDIDATE_NO_ACTIONABLE_KNOWLEDGE");
    expect(r).toMatchObject({ instant: at(140), certified: false, writes: [] });
    // the discriminating variable is the recipient: with the PC as recipient the same shape is an earliest-choice candidate
    expect(evaluateEarliestChoice(inputOf(base), evalCtx(base)).result).toBe(
      "CANDIDATE_EARLIEST_CHOICE",
    );
  });

  it("a payload whose form depends on a capability that has not closed yet is unknown (received but not derivable), never a later positive", async () => {
    const s = await seededEpistemicCampaign(tempDir(), { pcContract: pcCapabilityContract() });
    const basis = await establishPcCapability(s, 1);
    const event = pcAccessEvent(EVENT_COUNCIL, PC, {
      representation: { capability_id: CAP_METALWORKING },
    });
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(2), event }));
    await registerPacketConsumer(s, "c1", event, basis, 3);
    const store = s.campaign.store;
    const objectFact = store.getFact(temporalObjectKey("packet-consumer-obj-c1"))!;
    const sc: Scene = {
      s,
      event,
      eventFact: store.getFact(accessEventKey(EVENT_COUNCIL))!,
      objectFact,
      object: objectFact.value as never,
      ledger: ledgerOf(s),
    };
    const r = evaluateEarliestChoice(inputOf(sc, { route_proofs: proofsOf(base) }), evalCtx(sc));
    expect(r.result).toBe("NOT_PROVEN");
    // the PC Capability Close has not resolved, so the capability fact the form depends on does not exist at this cut
    expect(details(r)).toContain(`CANDIDATE_UNVERIFIED:${sc.eventFact.key}: RECEIPT_NOT_DERIVABLE`);
    // the fixture's synthetic consumer stage is not an enrolled provider: refused in the same breath, by its own reason
    expect(
      details(r).some((d) =>
        d.startsWith("ROUTE_MEMBER_UNKNOWN:PROVIDER:SYNTHETIC-PACKET-CONSUMER"),
      ),
    ).toBe(true);
  });

  it("a failed original read (the committed event cannot be re-read at the cut) refuses; the same evidence read normally proceeds", () => {
    const failing = {
      get: (k: string) => (k === base.eventFact.key ? undefined : base.ledger.get(k)),
    };
    const r = evaluateEarliestChoice(inputOf(base), evalCtx(base, { ledger: failing }));
    expect(r.result).toBe("NOT_PROVEN");
    expect(details(r)).toContain(
      `CANDIDATE_UNVERIFIED:${base.eventFact.key}: EVIDENCE_FACT_ABSENT`,
    );
    expect(evaluateEarliestChoice(inputOf(base), evalCtx(base)).result).toBe(
      "CANDIDATE_EARLIEST_CHOICE",
    );
  });

  it("an event with no committed access route for the PC and no complete negative history is unknown, not a quiet pass", () => {
    const none = evaluateEarliestChoice(
      inputOf(base, { candidates: [], exclusions: [] }),
      evalCtx(base),
    );
    expect(none.result).toBe("NOT_PROVEN");
    expect(codes(none)).toEqual(
      expect.arrayContaining(["CANDIDATE_OMITTED", "EARLIER_CHOICE_NOT_EXCLUDED"]),
    );
  });
});

describe("P7-05 earliest choice: an earlier feasible choice wins against a later event; a missing earlier negative is unknown [mechanism only]", () => {
  it("with an earlier candidate and a later due event, the earlier knowledge is the choice and it precedes the owner event", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const early = await sceneIn(s, {
      n: 1,
      consumerId: "c1",
      eventId: EVENT_COUNCIL,
      boundaryAt: at(140),
    });
    const late = await sceneIn(s, {
      n: 3,
      consumerId: "c2",
      eventId: EVENT_SCHEMATIC,
      boundaryAt: at(170),
    });
    const ctx = evalCtx(late);
    const both = [
      { event: refOf(early.eventFact), packet_object: refOf(early.objectFact) },
      { event: refOf(late.eventFact), packet_object: refOf(late.objectFact) },
    ];
    const r = evaluateEarliestChoice(
      inputOf(late, {
        due: refOf(late.objectFact),
        candidates: both,
        route_proofs: proofsOf(early),
      }),
      ctx,
    );
    expect(r).toMatchObject({
      result: "CANDIDATE_EARLIEST_CHOICE",
      instant: at(140),
      basis: { owner_event_instant: at(170), relation_to_owner_event: "BEFORE" },
    });
    // omitting the earlier candidate cannot hide it: the boundary index schedules its packet formation inside the window
    const hidden = evaluateEarliestChoice(
      inputOf(late, {
        due: refOf(late.objectFact),
        candidates: [both[1]!],
        route_proofs: proofsOf(early),
      }),
      ctx,
    );
    expect(hidden.result).toBe("NOT_PROVEN");
    expect(details(hidden)).toContain(`CANDIDATE_OMITTED:${early.eventFact.key}`);
    // and without the negative history of earlier possibilities the answer is unknown even with the right candidates
    const noTwins = evaluateEarliestChoice(
      inputOf(late, {
        due: refOf(late.objectFact),
        candidates: both,
        route_proofs: proofsOf(early),
        exclusions: [],
      }),
      ctx,
    );
    expect(noTwins.result).toBe("NOT_PROVEN");
    expect(codes(noTwins)).toContain("EARLIER_CHOICE_NOT_EXCLUDED");
  });
});

describe("P7-06 same instant: a competing due stage at the same I needs causal order, else no credit [mechanism only]", () => {
  const competitor = (sc: Scene, id: string, ordered: boolean): TemporalObject => {
    const common = {
      ...packetConsumerObject(id, sc.event, null),
      object_id: `competitor-${id}`,
      last_resolved_basis: at(100),
      next_boundary: { boundary_id: `boundary-${id}`, at: at(140) },
    };
    if (ordered)
      return { ...common, dependencies: [packetConsumerDeclaration(id, sc.event.event_id, PC)] };
    return {
      ...common,
      dependencies: [
        {
          stage: {
            causal_process_id: `independent/${id}`,
            owner_operation: {
              owner: SYNTH_PACKET_CONSUMER_OWNER,
              operation: SYNTH_OP_CONSUME_PACKET,
            },
            prospective_result_id: packetConsumerResultKey(id),
          },
          reads: [
            {
              mode: "AS-OF-NOW" as const,
              source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL) },
              invalidators: [{ fact_key: sourceKey(SOURCE_SCROLL) }],
            },
          ],
          produces: [packetConsumerResultKey(id)],
          declares_close: null,
        },
      ],
    };
  };
  const withCompetitor = async (ordered: boolean) => {
    const sc = await freshScene(at(140));
    await must(
      sc.s.coordinator.registerObject({
        ...temporalPublication(10),
        object: competitor(sc, "x1", ordered),
      }),
    );
    return sc;
  };

  it("an independent stage due at the same instant refuses credit; a stage that reads this packet is causally ordered and does not", async () => {
    const unordered = await withCompetitor(false);
    const refused = evaluateEarliestChoice(inputOf(unordered), evalCtx(unordered));
    expect(refused.result).toBe("NOT_PROVEN");
    expect(details(refused)).toContain("SAME_INSTANT_UNORDERED_COMPETITOR:competitor-x1");
    const ordered = await withCompetitor(true);
    const ok = evaluateEarliestChoice(inputOf(ordered), evalCtx(ordered));
    expect(ok.result).toBe("CANDIDATE_EARLIEST_CHOICE");
  });
});

describe("P7-07 an unknown or impaired ability can never become a safe positive [mechanism only]", () => {
  it("unknown Health/PC ability refuses; an impairment recorded by an authority means no receipt; available proceeds", () => {
    const run = (state: "AVAILABLE" | "IMPAIRED" | "UNKNOWN") =>
      evaluateEarliestChoice(
        inputOf(base, {
          route_proofs: proofsOf(base, { abilityAuthority: fixtureAbility(state) }),
        }),
        evalCtx(base, { abilityAuthority: fixtureAbility(state) }),
      );
    expect(run("UNKNOWN").result).toBe("NOT_PROVEN");
    expect(codes(run("UNKNOWN"))).toContain("ABILITY_UNKNOWN");
    expect(run("IMPAIRED").result).toBe("CANDIDATE_NO_ACTIONABLE_KNOWLEDGE");
    expect(run("AVAILABLE").result).toBe("CANDIDATE_EARLIEST_CHOICE");
  });

  it("a standing-instruction ledger that was not read is unknown; the PC's own committed empty ledger lets the discretion stay open", () => {
    const none = evaluateEarliestChoice(inputOf(base, { standing: null }), evalCtx(base));
    expect(none.result).toBe("NOT_PROVEN");
    expect(codes(none)).toContain("STANDING_POLICY_UNKNOWN");
    const mismatched = evaluateEarliestChoice(
      inputOf(base, {
        standing: { head: standingOf(base)!.head, version: refOf(base.objectFact) },
      }),
      evalCtx(base),
    );
    expect(mismatched.result).toBe("NOT_PROVEN");
  });
});

describe("P7-08 / P7-09 / P7-14 privacy, GM authority, custody and read-only discipline [mechanism only]", () => {
  it("no candidate - positive, negative or unknown - discloses anything: the GM/player-facing projection is one constant", () => {
    const results = [
      evaluateEarliestChoice(inputOf(base), evalCtx(base)),
      evaluateEarliestChoice(inputOf(base, { standing: null }), evalCtx(base)),
    ];
    for (const r of results) {
      const shown = JSON.stringify(gmFacingProjection(r));
      expect(shown).toBe('{"kind":"WITHHELD_PENDING_PROTECTED_RESULT"}');
      for (const secret of [
        base.eventFact.key,
        base.objectFact.key,
        "140",
        "unit",
        "fixture-time-unit",
      ])
        expect(shown).not.toContain(secret);
    }
  });

  it("an actor, model or GM assertion is not an evidence kind: each is refused as an invalid certificate, never read as a fact", () => {
    for (const forged of [
      { kind: "ACTOR_ASSERTION", actor_id: "actor-1", text: "I saw it" },
      { kind: "MODEL_ASSERTION", text: "the PC will be told" },
      { kind: "GM_ATTESTATION", text: "the PC hears fine" },
    ]) {
      const c = structuredClone(certsFor(base)[0]!) as unknown as {
        claims: Record<string, { evidence: unknown[] }>;
      };
      c.claims["RECIPIENT_ABILITY"]!.evidence.push(forged);
      const v = checkSection10(ctxOf(base, { certificates: [c] })).verdicts.get(PROVIDER_KEY)!;
      expect(v.status, forged.kind).toBe("NOT_PROVEN");
      expect(
        v.obligations.filter((o) => o.status === "OPEN").map((o) => o.reason),
        forged.kind,
      ).toEqual(Array(8).fill("CERT_SCHEMA_INVALID"));
    }
  });

  it("a GM opinion is not an owner event or a PC choice: no evidence kind carries one, and an authority that names a different id never closes its obligation", () => {
    const wrongId = checkSection10(
      ctxOf(base, {
        abilityAuthority: { ...fixtureAbility("AVAILABLE"), id: "SOMEONE_ELSE" },
      }),
    ).verdicts.get(PROVIDER_KEY)!;
    expect(wrongId.obligations.find((o) => o.obligation === "RECIPIENT_ABILITY")?.reason).toBe(
      "AUTHORITY_READING_MISMATCH",
    );
  });

  it("evaluation and checking write nothing: the committed state digest, the journal head and the fact count are unchanged", () => {
    const store = base.s.campaign.store;
    const before = { head: store.head(), facts: store.listFacts().length };
    evaluateEarliestChoice(inputOf(base), evalCtx(base));
    checkSection10(ctxOf(base));
    const after = { head: store.head(), facts: store.listFacts().length };
    expect(after).toEqual(before);
  });

  it("the in-window read set is exactly the evidence, the index and the entries inside the window; unrelated dormant objects beyond the window add no reads", async () => {
    const sc = await freshScene(at(140));
    const spy1 = spyLedger(sc.ledger);
    evaluateEarliestChoice(inputOf(sc), evalCtx(sc, { ledger: spy1 }));
    const baseline = new Set(spy1.reads);
    expect([...baseline].sort()).toEqual(
      [
        sc.eventFact.key,
        sc.objectFact.key,
        "temporal/boundary-index",
        pcStandingLedgerHeadKey(PC),
        pcStandingLedgerVersionKey(PC, 1),
        // the capability fact the event's representation would name is only read when the payload depends on one
      ]
        .filter((k, i, a) => a.indexOf(k) === i)
        .sort(),
    );
    // many unrelated engaged objects far beyond the target
    for (let i = 0; i < 12; i++)
      await must(
        sc.s.coordinator.registerObject({
          ...temporalPublication(20 + i),
          object: {
            ...packetConsumerObject(`far${i}`, sc.event, null),
            object_id: `far-${i}`,
            dependencies: [
              {
                stage: {
                  causal_process_id: `far/${i}`,
                  owner_operation: {
                    owner: SYNTH_PACKET_CONSUMER_OWNER,
                    operation: SYNTH_OP_CONSUME_PACKET,
                  },
                  prospective_result_id: packetConsumerResultKey(`far${i}`),
                },
                reads: [
                  {
                    mode: "AS-OF-NOW" as const,
                    source: {
                      owner: SYNTH_ACCESS_SOURCE_OWNER,
                      fact_key: sourceKey(SOURCE_SCROLL),
                    },
                    invalidators: [{ fact_key: sourceKey(SOURCE_SCROLL) }],
                  },
                ],
                produces: [packetConsumerResultKey(`far${i}`)],
                declares_close: null,
              },
            ],
            last_resolved_basis: at(100),
            next_boundary: { boundary_id: `far-b-${i}`, at: at(900 + i) },
          },
        }),
      );
    const spy2 = spyLedger(ledgerOf(sc.s));
    const r = evaluateEarliestChoice(inputOf(sc), evalCtx(sc, { ledger: spy2 }));
    expect(r.result).toBe("CANDIDATE_EARLIEST_CHOICE");
    expect(new Set(spy2.reads)).toEqual(baseline);
    // the deterministic work counter: the same number of ledger reads, not merely the same set
    expect(spy2.reads.length).toBe(spy1.reads.length);
  });
});
