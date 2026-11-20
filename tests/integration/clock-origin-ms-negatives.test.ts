/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and edit raw facts */
// F-014B A0 (CAL-TIME T-1 grant 5) — MS negatives (A0-T13) and MS historical verification (A0-T14). T1 MECHANISM ONLY.
//
// Each negative is judged by the real fence, owner admission, historical verifier, R1 B2 check or MS integrity verifier against the exact
// incremental pre-state the core bound for the step (`h.trace`), or, where the verifier takes facts, against the real facts with the one
// named mutation applied. Nothing here constructs a passing verdict.
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  factKind,
  fixtureMsCanonicalAdmission,
  msPrefixViolation,
  msR1GroupCheck,
  resolveKey,
  verifyMsIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FACET_TEMPORAL_COORDINATION,
  OWNER_TEMPORAL_KERNEL,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  type OwnerFact,
} from "@immortalis/contracts";
import { governing, syntheticOrigin } from "../support/clock-origin.ts";
import { msHarness } from "../support/ms-setup.ts";
import { must } from "../support/temporal.ts";

type Ms = Awaited<ReturnType<typeof msHarness>>;
const reason = (v: { details?: unknown } | null): string | undefined =>
  (v?.details as { reason?: string } | undefined)?.reason;
const kindOf = (key: string) => resolveKey(key)?.kind.id;

async function lawfulV2() {
  const h = await msHarness({ v2: {} });
  expect(h.setup).toMatchObject({ status: "COMPLETED" });
  expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
  return h;
}
const stepOf = (h: Ms, key: string) =>
  h.trace.find((t) => t.group.writes.some((w) => w.key === key))!;
const withFacts = (
  state: { campaign_id: string; revision: number; facts: ReadonlyMap<string, OwnerFact> },
  edit: (facts: Map<string, OwnerFact>) => void,
) => {
  const facts = new Map(state.facts);
  edit(facts);
  return { campaign_id: state.campaign_id, revision: state.revision, facts };
};
const edited = (f: OwnerFact, over: Partial<OwnerFact>): OwnerFact => ({ ...f, ...over });
const flip = (x: string) => (x[0] === "0" ? "1" : "0") + x.slice(1);

describe("A0-T13: the clock-step pair exists only at the MS clock phase, under the qualified v2 route", () => {
  it("a pair at PRE_CLOCK or at any other MS phase, a state-only clock step, a pair under the kernel citation and an under-read pair are refused, live and historically", async () => {
    const h = await lawfulV2();
    const g = governing(h);
    const clock = stepOf(h, TEMPORAL_STATE_KEY);
    const pair = clock.group;
    expect(pair.writes).toHaveLength(2);
    // controls: the real pair passes at its own step through both judges
    expect(h.admission.check(pair, clock.before)).toBeNull();
    expect(h.admission.verifyHistorical!(pair, clock.before)).toBeNull();

    // every MS phase other than the clock step, from the Completion's own step to B2
    const first = h.trace.indexOf(stepOf(h, g.completionKey));
    const phases = h.trace.slice(first).filter((t) => t !== clock && t.group.writes.length === 1);
    expect(phases.map((t) => kindOf(t.group.writes[0]!.key))).toEqual([
      "initial_locality_completion",
      "initial_actor_setup_issue",
      "initial_actor_setup_response",
      "named_actor_existence_basis",
      "actor_setup_placement",
      "world_setup_closure",
      "actor_physical_presence",
    ]);
    // the pair (and the origin alone) is outside every phase after the Completion: PRE_CLOCK stays closed, B2 takes only its own write
    for (const t of phases.slice(1)) {
      const at = String(kindOf(t.group.writes[0]!.key));
      const crossed = { ...pair, reads: t.group.reads, depends_on: t.group.depends_on };
      for (const verdict of [
        h.admission.check(crossed, t.before),
        h.admission.verifyHistorical!(crossed, t.before),
      ])
        expect(reason(verdict), at).toBe("MS_PHASE_FENCE");
      const originOnly = {
        ...crossed,
        writes: crossed.writes.filter((w) => w.key === TEMPORAL_ORIGIN_KEY),
      };
      expect(reason(h.admission.check(originOnly, t.before)), at).toBe("MS_PHASE_FENCE");
    }
    // before the Completion exists there is no Completion for an origin to pair with
    const early = phases[0]!;
    expect(h.admission.check({ ...pair, reads: [], depends_on: [] }, early.before)).not.toBeNull();
    expect(
      h.admission.verifyHistorical!({ ...pair, reads: [], depends_on: [] }, early.before),
    ).not.toBeNull();

    // a v2 MS Input with a state-only clock step, under either citation
    const lone = { ...pair, writes: pair.writes.filter((w) => w.key === TEMPORAL_STATE_KEY) };
    for (const rule of [pair.rule, factKind("temporal_state").rule])
      for (const verdict of [
        h.admission.check({ ...lone, rule }, clock.before),
        h.admission.verifyHistorical!({ ...lone, rule }, clock.before),
      ])
        expect(reason(verdict)).toBe("MS_PHASE_FENCE");
    // the pair under the old (kernel) citation: the registry refuses the origin's citation, and the historical hook refuses the pair
    expect(
      h.admission.check({ ...pair, rule: factKind("temporal_state").rule }, clock.before),
    ).toMatchObject({
      code: "REFERENCE_INVALID",
    });
    expect(
      reason(
        h.admission.verifyHistorical!(
          { ...pair, rule: factKind("temporal_state").rule },
          clock.before,
        ),
      ),
    ).toBe("ORIGIN_PAIR_SHAPE");
    // a pair that reads fewer than the exact MS time pins
    for (const verdict of [
      h.admission.check({ ...pair, reads: pair.reads.slice(1) }, clock.before),
      h.admission.verifyHistorical!({ ...pair, reads: pair.reads.slice(1) }, clock.before),
    ])
      expect(verdict).not.toBeNull();
    // and, once the setup is released, a second genesis is no clock step at all
    const late = await h.store.commit({
      ...pair,
      group_id: "late:g",
      intent_id: "late:i",
      cause: "late:c",
    });
    expect(late.ok).toBe(false);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)!.provenance.group_id).toBe(pair.group_id);
    await h.campaign.close();
  });

  it("the live B2 prefix recognises the origin only at B2, only from the supplied facts, and the presence is refused after each tampering", async () => {
    const h = await lawfulV2();
    const g = governing(h);
    const presence = h.trace.find(
      (t) => kindOf(t.group.writes[0]!.key) === "actor_physical_presence",
    )!;
    const facts = presence.before.facts;
    const origin = facts.get(TEMPORAL_ORIGIN_KEY)!;
    const state = facts.get(TEMPORAL_STATE_KEY)!;
    // controls: the lawful pre-state of B2 passes the prefix and the live R1 presence check; PRE_CLOCK never accepts the origin
    expect(msPrefixViolation(facts, g.input, "B2")).toBeNull();
    expect(msR1GroupCheck(presence.group, presence.before)).toBeNull();
    // PRE_CLOCK never accepts the origin kind (MS_PRE_CLOCK_KINDS is not extended), alone or beside the state
    expect(msPrefixViolation(facts, g.input, "PRE_CLOCK")).toBe("MS_PREFIX_KIND");
    const clockBefore = stepOf(h, TEMPORAL_STATE_KEY).before;
    const originAtPreClock = withFacts(clockBefore, (m) => m.set(TEMPORAL_ORIGIN_KEY, origin));
    expect(msPrefixViolation(originAtPreClock.facts, g.input, "PRE_CLOCK")).toBe("MS_PREFIX_KIND");
    expect(msPrefixViolation(clockBefore.facts, g.input, "PRE_CLOCK")).toBeNull();
    const v = (f: OwnerFact) => f.value as any;
    const tamperings: [string, (m: Map<string, OwnerFact>) => void][] = [
      [
        "an origin with a different group_id",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, { provenance: { ...origin.provenance, group_id: "another:group" } }),
          ),
      ],
      [
        "an origin under the kernel (old) citation",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, {
              provenance: { ...origin.provenance, rule: factKind("temporal_state").rule },
            }),
          ),
      ],
      [
        "a state under the kernel (old) citation beside the origin",
        (m) =>
          m.set(
            TEMPORAL_STATE_KEY,
            edited(state, {
              provenance: { ...state.provenance, rule: factKind("temporal_state").rule },
            }),
          ),
      ],
      ["an origin at version 2", (m) => m.set(TEMPORAL_ORIGIN_KEY, edited(origin, { version: 2 }))],
      ["an origin without the paired state", (m) => m.delete(TEMPORAL_STATE_KEY)],
      [
        "a state at version 2 beside the origin",
        (m) => m.set(TEMPORAL_STATE_KEY, edited(state, { version: 2 })),
      ],
      [
        "an origin of another campaign",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, { value: { ...v(origin), campaign_id: "campaign-other" } }),
          ),
      ],
      [
        "an origin with another coordinate",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, { value: { ...v(origin), origin: { unit: "seconds", value: 9 } } }),
          ),
      ],
      [
        "an origin with another unit",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, { value: { ...v(origin), origin: { unit: "days", value: 0 } } }),
          ),
      ],
      [
        "an origin with another capture hash",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, {
              value: {
                ...v(origin),
                chronology: {
                  ...v(origin).chronology,
                  capture_hash: flip(v(origin).chronology.capture_hash),
                },
              },
            }),
          ),
      ],
      [
        "an origin naming another Completion version",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, {
              value: {
                ...v(origin),
                governing: {
                  ...v(origin).governing,
                  completion: { ...v(origin).governing.completion, version: 2 },
                },
              },
            }),
          ),
      ],
      [
        "a malformed origin",
        (m) =>
          m.set(
            TEMPORAL_ORIGIN_KEY,
            edited(origin, { value: { format: "immortalis-temporal-origin" } }),
          ),
      ],
      ["a v2 Input whose prefix lacks the origin", (m) => m.delete(TEMPORAL_ORIGIN_KEY)],
    ];
    for (const [name, edit] of tamperings) {
      const mutated = withFacts(presence.before, edit);
      expect(msPrefixViolation(mutated.facts, g.input, "B2"), name).not.toBeNull();
      // the live B2 check refuses the presence after each
      expect(msR1GroupCheck(presence.group, mutated), name).not.toBeNull();
    }
    // a v1 chronology Input whose prefix carries an origin refuses
    const v1Input = {
      ...g.input,
      chronology: { ...g.input.chronology, format_version: 1 },
    } as never;
    expect(msPrefixViolation(facts, v1Input, "B2")).toBe("MS_PREFIX_ORIGIN");
    await h.campaign.close();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// A0-T14 — MS historical. `verifyMsIntegrity` is a function of the store's committed facts, receipts and groups. A view over the real
// store that adds or edits one fact (with the receipt, group and rule-checked evidence it needs) lets the verifier judge a hash-valid
// history it could not otherwise be shown; every other fact, receipt and group is the real one.
// ---------------------------------------------------------------------------------------------------------------------------------
function viewOf(
  store: any,
  edit: {
    facts?: (all: OwnerFact[]) => OwnerFact[];
    groups?: Record<string, any>;
    receipts?: Record<string, { revision: number }>;
    checked?: readonly string[];
  },
): CampaignStore {
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "listFacts")
        return () => (edit.facts ? edit.facts(target.listFacts()) : target.listFacts());
      if (prop === "committedGroup")
        return (intent: string) => edit.groups?.[intent] ?? target.committedGroup(intent);
      if (prop === "committedGroupById")
        return (id: string) =>
          Object.values(edit.groups ?? {}).find((g: any) => g.group_id === id) ??
          target.committedGroupById(id);
      if (prop === "lookupReceipt")
        return (intent: string) => edit.receipts?.[intent] ?? target.lookupReceipt(intent);
      if (prop === "ruleCheckedGroupIds")
        return () => new Set([...target.ruleCheckedGroupIds(), ...(edit.checked ?? [])]);
      const x = target[prop];
      return typeof x === "function" ? x.bind(target) : x;
    },
  }) as CampaignStore;
}
const messages = (violations: readonly { message: string }[]) => violations.map((x) => x.message);
const sealedPrefix =
  /unexpected create-only fact in the historical MS setup prefix: temporal\/origin/;

describe("A0-T14: MS historical verification of the SEALED prefix", () => {
  it("a lawful pair is not flagged; an arbitrary SEALED origin earlier in a v1 MS prefix is", async () => {
    const lawful = await lawfulV2();
    expect(verifyMsIntegrity(lawful.store)).toEqual([]);
    await lawful.campaign.close();

    const v1 = await msHarness();
    expect(await v1.actorService.advance()).toEqual({ status: "COMPLETED" });
    expect(verifyMsIntegrity(v1.store)).toEqual([]);
    const campaign = v1.store.head().campaign_id;
    const stray: OwnerFact = {
      key: TEMPORAL_ORIGIN_KEY,
      version: 1,
      owner: OWNER_TEMPORAL_KERNEL,
      facet: FACET_TEMPORAL_COORDINATION,
      value: syntheticOrigin(campaign) as never,
      unit: null,
      basis: "original-message-captured-starting-chronology",
      secrecy: "engine-internal",
      provenance: {
        group_id: "stray:g",
        intent_id: "stray:i",
        cause: "stray:c",
        rule: factKind("temporal_origin").rule,
      },
    };
    const strayGroup = {
      campaign_id: campaign,
      group_id: "stray:g",
      intent_id: "stray:i",
      owner: OWNER_TEMPORAL_KERNEL,
      facet: FACET_TEMPORAL_COORDINATION,
      cause: "stray:c",
      rule: factKind("temporal_origin").rule,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [],
      depends_on: [],
      writes: [],
    };
    // the stray origin is committed EARLIER than the presence (revision 1), with rule-checked evidence: hash-valid history
    const view = viewOf(v1.store, {
      facts: (all) => [...all, stray],
      groups: { "stray:i": strayGroup },
      receipts: { "stray:i": { revision: 1 } },
      checked: ["stray:g"],
    });
    expect(messages(verifyMsIntegrity(view)).some((m) => sealedPrefix.test(m))).toBe(true);
    await v1.campaign.close();
  });

  it("an origin that is not the authentic clock-step origin of the v2 chain is flagged; the authentic one is not", async () => {
    const h = await lawfulV2();
    const g = governing(h);
    const origin = h.store.getFact(TEMPORAL_ORIGIN_KEY)!;
    const presence = h.store.listFacts().find((f) => kindOf(f.key) === "actor_physical_presence")!;
    const realGroup = h.store.committedGroup(origin.provenance.intent_id)!;
    expect(verifyMsIntegrity(viewOf(h.store, {}))).toEqual([]);
    const replaceOrigin = (over: Partial<OwnerFact>) => (all: OwnerFact[]) =>
      all.map((f) => (f.key === TEMPORAL_ORIGIN_KEY ? edited(f, over) : f));
    const v = origin.value as any;
    const cases: [string, Parameters<typeof viewOf>[1]][] = [
      [
        "an origin value that is not the one the original Input and Completion imply",
        {
          facts: replaceOrigin({
            value: {
              ...v,
              chronology: { ...v.chronology, capture_hash: flip(v.chronology.capture_hash) },
            },
          }),
        },
      ],
      [
        "an origin whose committed group is not one the presence depends on",
        {
          groups: { [origin.provenance.intent_id]: { ...realGroup, group_id: "elsewhere:g" } },
          checked: ["elsewhere:g"],
        },
      ],
      [
        "an origin whose committed group is a third write",
        {
          groups: {
            [origin.provenance.intent_id]: {
              ...realGroup,
              writes: [
                ...realGroup.writes,
                { ...realGroup.writes[0]!, key: "temporal/boundary-index" },
              ],
            },
          },
        },
      ],
      [
        "an origin whose committed group cites the kernel rule",
        {
          groups: {
            [origin.provenance.intent_id]: { ...realGroup, rule: factKind("temporal_state").rule },
          },
        },
      ],
      ["an origin that is not at version one", { facts: replaceOrigin({ version: 2 }) }],
    ];
    for (const [name, edit] of cases) {
      const found = messages(verifyMsIntegrity(viewOf(h.store, edit)));
      expect(
        found.some((m) => sealedPrefix.test(m)),
        `${name}: ${JSON.stringify(found)}`,
      ).toBe(true);
    }
    expect(presence.provenance.group_id).toBeDefined();
    expect(g.input.chronology.format_version).toBe(2);
    await h.campaign.close();
  });

  it("a pre-change v1 MS journal (written under the previous history identity) is not trusted by checkpoint and replays strictly under the new identity", async () => {
    const strip = (id: string) =>
      id
        .replace("+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z", "")
        .replace("+MS-V3-CLOCK-STEP-B2-ORIGIN", "");
    const h = await msHarness({ historyId: strip });
    const previous = h.admission.historyVerificationId!;
    expect(previous).not.toContain("CAL-TIME-T1");
    expect(previous).not.toContain("MS-V3-CLOCK-STEP-B2-ORIGIN");
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const head = h.store.head();
    await h.campaign.close();
    // the previous identity still opens its own journal (a checkpoint under it is trusted by that identity alone) ...
    const same = await must(h.reopen());
    expect(same.store.head()).toEqual(head);
    await same.close();
    // ... and this build's identity differs, so it cannot trust that checkpoint: it replays every group strictly and reaches the same state
    const current = fixtureMsCanonicalAdmission(h.actorRunner.binding);
    expect(current.historyVerificationId).not.toBe(previous);
    expect(current.historyVerificationId!.startsWith(previous)).toBe(true);
    const replayed = await must(
      CanonicalCampaign.open(h.dir, { testkitFixtureAdmission: current }),
    );
    expect(replayed.store.head()).toEqual(head);
    expect(replayed.verify()).toEqual([]);
    expect(verifyMsIntegrity(replayed.store)).toEqual([]);
    expect(
      replayed.store.listFacts().filter((f) => kindOf(f.key) === "temporal_origin"),
    ).toHaveLength(0);
    await replayed.close();
  });
});
