/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap store operations to simulate lost acknowledgements and corrupted groups */
// Crash / retry for the initial timed governance opening (RC-16). The crash matrix covers EVERY durable cut of the five commits —
// institution, office, Scope Binding, the Instrument with GIP's enrollment receipt, and the Temporal registration of the sunset — each
// as a dropped write and as a lost acknowledgement; a known refusal at each stage; a reopen that fails; a real SIGKILL of the shipped
// binary at each progress line; and a failure before AND after EVERY mutating filesystem operation of the whole command. Each case
// reopens and re-presents the SAME confirmed proposal, which must land on exactly the campaign an uninterrupted run produces — never a
// second, rerolled or substituted record, a duplicated Instrument, object or stage, never a registration without its Instrument, and
// never a success claimed before the owner-verified readback of everything. While the Instrument is committed but its sunset is not yet
// registered, canonical time may not be advanced to or past the sunset, and nothing is lost: the registration is finished from the
// original identities. Independent corruption mutations of the committed groups are refused, never adopted.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  gipSunsetExpiryProvider,
  nodeFs,
} from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { instrumentFs } from "@immortalis/testkit";
import {
  BINDING_ID,
  INSTITUTION_ID,
  INSTRUMENT_ID,
  LOCALITY_CAMPAIGN,
  OFFICE_ID,
  T_BEFORE,
  T_SUNSET,
  addGovernance,
  advanceTo,
  bindPlayer,
  governanceArgs,
  governanceDoc,
  headOf,
  held,
  lifecycleOf,
  openOrdinary,
  openWitness,
  timedCampaign,
  writeGovernance,
} from "../support/initial-timed-governance.ts";
import { runShipped } from "../support/locality.ts";

afterEach(() => vi.restoreAllMocks());

/** A process id that provably belongs to no running process: what the lock of a crashed process names. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
}

type Stage = "institution" | "office" | "scope_binding" | "instrument" | "registration";
const KEYS: Record<Exclude<Stage, "registration">, string> = {
  institution: `gip/institution/${INSTITUTION_ID}/identity`,
  office: `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}`,
  scope_binding: `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}/scope-binding/${BINDING_ID}`,
  instrument: `gip/instrument/${INSTRUMENT_ID}`,
};

/** Which of the five commits a group is, from the first key it writes. */
const stageOf = (group: any): Stage | undefined => {
  const key = group.writes[0]?.key as string;
  if (key.startsWith("temporal/object/")) return "registration";
  return (Object.keys(KEYS) as (keyof typeof KEYS)[]).find((s) => KEYS[s] === key);
};

/**
 * Makes ONE commit of the OPERATOR'S live campaign misbehave. `lose`: it commits and the acknowledgement is lost; `drop`: it never
 * reaches the store; `refuse`: a known, definitive refusal. The scratch package the command admission-checks the proposal on beforehand
 * is a different store and is left alone. Returns the commits the live campaign attempted, in order.
 */
function misbehave(stage: Stage, how: "lose" | "drop" | "refuse") {
  const calls: Stage[] = [];
  const open = LocalOperatorSession.open;
  vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
    const opened = await open.call(LocalOperatorSession, p);
    if (opened.ok) {
      const store = opened.value.campaign.store;
      const commit = store.commit.bind(store);
      vi.spyOn(store, "commit").mockImplementation(async (group: any) => {
        const which = stageOf(group);
        if (which) calls.push(which);
        if (which !== stage) return commit(group);
        if (how === "refuse")
          return { ok: false, error: { code: "VALUE_INVALID", message: "refused" } } as any;
        if (how === "lose") await commit(group);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as any;
      });
    }
    return opened;
  });
  return calls;
}

async function reference() {
  const dirs = await timedCampaign();
  expect((await addGovernance(dirs, writeGovernance(governanceDoc()))).result.status).toBe(
    "GOVERNANCE_READY",
  );
  return headOf(dirs.campaignDir);
}

const state = (
  institution: boolean,
  office: boolean,
  scope_binding: boolean,
  instrument: boolean,
  registered: boolean,
) => ({ institution, office, scope_binding, instrument, registered, violations: [] });

describe("a lost acknowledgement or a dropped write at EVERY durable cut converges on the uninterrupted campaign", () => {
  // stage, how, name, state held after the cut, asks on the rerun, commits the live campaign attempted
  const cases: [Stage, "lose" | "drop", string, ReturnType<typeof state>, number, Stage[]][] = [
    [
      "institution",
      "drop",
      "before the institution",
      state(false, false, false, false, false),
      1,
      ["institution"],
    ],
    [
      "institution",
      "lose",
      "the institution landed but its reply was lost",
      state(true, false, false, false, false),
      1,
      ["institution"],
    ],
    [
      "office",
      "drop",
      "after the institution, before the office",
      state(true, false, false, false, false),
      1,
      ["institution", "office"],
    ],
    [
      "office",
      "lose",
      "the office landed but its reply was lost",
      state(true, true, false, false, false),
      1,
      ["institution", "office"],
    ],
    [
      "scope_binding",
      "drop",
      "after the office, before the Scope Binding",
      state(true, true, false, false, false),
      1,
      ["institution", "office", "scope_binding"],
    ],
    [
      "scope_binding",
      "lose",
      "the Scope Binding landed but its reply was lost",
      state(true, true, true, false, false),
      1,
      ["institution", "office", "scope_binding"],
    ],
    [
      "instrument",
      "drop",
      "after the binding, before the Instrument and its receipt",
      state(true, true, true, false, false),
      1,
      ["institution", "office", "scope_binding", "instrument"],
    ],
    [
      "instrument",
      "lose",
      "GIP's Instrument and enrollment receipt landed but their reply was lost: the registration was never attempted",
      state(true, true, true, true, false),
      1,
      ["institution", "office", "scope_binding", "instrument"],
    ],
    [
      "registration",
      "drop",
      "after the Instrument and receipt, before the Temporal registration reached the store",
      state(true, true, true, true, false),
      1,
      ["institution", "office", "scope_binding", "instrument", "registration"],
    ],
    [
      "registration",
      "lose",
      "after the Temporal registration, before the reply: the rerun verifies everything without asking again",
      state(true, true, true, true, true),
      0,
      ["institution", "office", "scope_binding", "instrument", "registration"],
    ],
  ];
  for (const [stage, how, name, expectedHeld, asks, attempted] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await timedCampaign();
        const file = writeGovernance(governanceDoc());
        const calls = misbehave(stage, how);
        const first = await addGovernance(dirs, file);
        expect(first.result.status, JSON.stringify(first.result)).toBe(
          "GOVERNANCE_OUTCOME_UNKNOWN",
        );
        // each commit is attempted only after the one before it acknowledged
        expect(calls).toEqual(attempted);
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds exactly what landed, in dependency order
        const now = await held(dirs.campaignDir).catch(() => undefined);
        if (now) expect(now).toEqual(expectedHeld);

        crashedHolder(dirs.campaignDir);
        const again = await addGovernance(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, JSON.stringify(again.result)).toBe("GOVERNANCE_READY");
        expect(again.terminal.asked()).toBe(asks);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("the console text for a resume names only the remaining commits", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("scope_binding", "lose");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await addGovernance(dirs, file, ["decline"], { reclaimStaleLock: true });
    expect(again.result.status).toBe("DECLINED");
    const said = again.terminal.said.join("\n");
    expect(said).toContain("to commit, in this order: instrument → sunset registration");
    expect(said).not.toContain("institution →");
    expect(await held(dirs.campaignDir)).toEqual(state(true, true, true, false, false));
  }, 120_000);

  it("a registration alone pending resumes as the sunset registration only", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("registration", "drop");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await addGovernance(dirs, file, ["decline"], { reclaimStaleLock: true });
    expect(again.result.status).toBe("DECLINED");
    expect(again.terminal.said.join("\n")).toContain(
      "to commit, in this order: sunset registration",
    );
  }, 120_000);
});

describe("while the Instrument is committed but its sunset is not registered, time cannot pass the sunset and nothing is lost", () => {
  it("an advance that would reach or pass the known-unregistered sunset is refused by the existing kernel rule; the rerun then registers it exactly once and the earned expiry follows", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("registration", "drop");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    // the receipt is the durable, known-unregistered material term; the lock the crashed process left is reclaimed on reopening

    // an advance to the sunset, or past it, is refused before any resolution: nothing is written and the Instrument stays active
    const campaign = await CanonicalCampaign.open(dirs.campaignDir, {
      buildId: "recovery-test",
      reclaimStaleLock: true,
    });
    if (!campaign.ok) throw new Error(JSON.stringify(campaign.error));
    try {
      const coordinator = new TemporalCoordinator(
        campaign.value.store,
        new StageProviderRegistry([gipSunsetExpiryProvider]),
      );
      const head = campaign.value.store.head();
      for (const [id, target] of [
        ["tx-at", T_SUNSET],
        ["tx-past", { ...T_SUNSET, value: T_SUNSET.value + 60 }],
      ] as const) {
        const r = await coordinator.advance(advanceTo(id, target));
        expect(r.ok, id).toBe(false);
        expect(r.ok ? "" : r.error.code, id).toBe("ENROLLMENT_PENDING");
      }
      expect(campaign.value.store.head()).toEqual(head);
      expect(new GipAdapter(campaign.value.store).sunsetEnrollment()?.registered).toBe(false);
    } finally {
      await campaign.value.close();
    }

    const again = await addGovernance(dirs, file, ["confirm"], { reclaimStaleLock: true });
    expect(again.result.status, JSON.stringify(again.result)).toBe("GOVERNANCE_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    // once registered by the same identities, the boundary is earned and the existing route expires the Instrument exactly once
    const w = await openWitness(dirs.campaignDir);
    try {
      expect((await w.coordinator.advance(advanceTo("tx-short", T_BEFORE))).ok).toBe(true);
      expect(lifecycleOf(w)).toBe("active");
      expect((await w.coordinator.advance(advanceTo("tx-at", T_SUNSET))).ok).toBe(true);
      expect(lifecycleOf(w)).toBe("expired");
      expect(w.campaign.store.getFact(`gip/instrument/${INSTRUMENT_ID}`)!.version).toBe(2);
    } finally {
      await w.campaign.close();
    }
  }, 180_000);
});

describe("a known refusal after earlier commits is INCOMPLETE, never established; a refusal of the first is a clean REFUSED", () => {
  const cases: [Stage, string, ReturnType<typeof state>, string][] = [
    [
      "office",
      "state(true,false,false,false,false)",
      state(true, false, false, false, false),
      "not committed: office, scope_binding, instrument",
    ],
    [
      "scope_binding",
      "binding",
      state(true, true, false, false, false),
      "not committed: scope_binding, instrument",
    ],
    [
      "instrument",
      "instrument",
      state(true, true, true, false, false),
      "not committed: instrument",
    ],
    [
      "registration",
      "registration",
      state(true, true, true, true, false),
      "not committed: sunset registration",
    ],
  ];
  for (const [stage, , expectedHeld, detail] of cases)
    it(`${stage}: reports the partial state, then the same proposal finishes it with nothing duplicated`, async () => {
      const expected = await reference();
      const dirs = await timedCampaign();
      const file = writeGovernance(governanceDoc());
      misbehave(stage, "refuse");
      const first = await addGovernance(dirs, file);
      expect(first.result.status, JSON.stringify(first.result)).toBe("GOVERNANCE_INCOMPLETE");
      expect(first.result.details.join("\n")).toContain(detail);
      vi.restoreAllMocks();
      expect(await held(dirs.campaignDir)).toEqual(expectedHeld);

      const again = await addGovernance(dirs, file);
      expect(again.result.status).toBe("GOVERNANCE_READY");
      expect(again.terminal.asked()).toBe(1);
      expect(await headOf(dirs.campaignDir)).toEqual(expected);
      const c = await openOrdinary(dirs.campaignDir);
      try {
        expect(c.store.listFacts().filter((f) => f.key.startsWith("gip/instrument/"))).toHaveLength(
          1,
        );
        expect(c.store.getFact(`gip/instrument/${INSTRUMENT_ID}`)!.version).toBe(1);
        expect(
          c.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
        ).toHaveLength(1);
      } finally {
        await c.close();
      }
    }, 120_000);

  it("a definitive refusal of the first publication leaves the campaign untouched and the rest unattempted", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const calls = misbehave("institution", "refuse");
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()));
    expect(result.status).toBe("GOVERNANCE_REFUSED");
    expect(calls).toEqual(["institution"]);
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("an incompatible proposal offered while the chain waits is refused, never substituted", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("scope_binding", "refuse");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_INCOMPLETE");
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);

    const changes: ((d: any) => void)[] = [
      (d) => (d.institution.identity_label = "Another label"),
      (d) => (d.office.succession_rule = "By lot."),
      (d) => (d.scope_binding.target_condition = "Applies to nobody."),
      (d) => (d.instrument.validity_by_order = []),
      (d) => (d.instrument.sunset_condition = { ...T_SUNSET, value: 300 }),
      (d) => (d.publication.basis = "other-basis"),
    ];
    for (const change of changes) {
      const doc = governanceDoc();
      change(doc);
      const { result, terminal } = await addGovernance(dirs, writeGovernance(doc), []);
      expect(result.status).toBe("GOVERNANCE_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
    expect(await held(dirs.campaignDir)).toEqual(state(true, true, false, false, false));
  }, 120_000);

  it("a binding another writer committed under the same key while the chain waits is a conflict: neither adopted nor replaced", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("scope_binding", "refuse");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_INCOMPLETE");
    vi.restoreAllMocks();
    const c = await openOrdinary(dirs.campaignDir);
    const other = await new GipAdapter(c.store).establishScopeBinding({
      group_id: "somebody-else",
      intent_id: "somebody-else-intent",
      cause: "somebody-else-cause",
      basis: "elsewhere",
      secrecy: "elsewhere",
      scope_binding: {
        ...governanceDoc().scope_binding,
        target_condition: "Somebody else's condition.",
      },
    });
    expect(other.ok, JSON.stringify(other)).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, file, []);
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a character bound between the commits closes the path: nothing further is written", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("scope_binding", "refuse");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_INCOMPLETE");
    vi.restoreAllMocks();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect((await held(dirs.campaignDir)).scope_binding).toBe(false);
  }, 120_000);

  it("a record the owner has already advanced closes the path: the resumed chain is not written over it", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    misbehave("scope_binding", "refuse");
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_INCOMPLETE");
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const getFact = store.getFact.bind(store);
        vi.spyOn(store, "getFact").mockImplementation((key: string) => {
          const f = getFact(key);
          return f && key.endsWith("/office/" + OFFICE_ID) ? { ...f, version: 2 } : f;
        });
      }
      return opened;
    });
    const { result, terminal } = await addGovernance(dirs, file, ["confirm"]);
    vi.restoreAllMocks();
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commits is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while everything is durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addGovernance(dirs, file);
    expect(first.result.status).toBe("GOVERNANCE_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addGovernance(dirs, file, []);
    expect(again.result.status).toBe("GOVERNANCE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("independent corruption of the committed groups is refused, never adopted", () => {
  /** Makes the committed GROUP of one intent read back mutated: a corrupted journal, as far as the command can tell. */
  function corruptGroup(match: (intent: string) => boolean, mutate: (g: any) => void) {
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const committedGroup = store.committedGroup.bind(store);
        vi.spyOn(store, "committedGroup").mockImplementation((intent: string) => {
          const g = committedGroup(intent);
          if (!g || !match(intent)) return g;
          const copy = structuredClone(g);
          mutate(copy);
          return copy;
        });
      }
      return opened;
    });
  }
  const isStage = (name: string) => (i: string) => i.endsWith(`:${name}`);
  const isRegistration = (i: string) => i.startsWith("gip-sunset-registration-intent:");

  const mutations: [string, (i: string) => boolean, (g: any) => void][] = [
    [
      "an institution value altered",
      isStage("institution"),
      (g) => (g.writes[0].value.identity_label = "Altered"),
    ],
    [
      "an office value altered",
      isStage("office"),
      (g) => (g.writes[0].value.removal_rule = "Altered"),
    ],
    [
      "a binding value altered",
      isStage("scope_binding"),
      (g) => (g.writes[0].value.scope_type = "Altered"),
    ],
    [
      "an Instrument value altered",
      isStage("instrument"),
      (g) => (g.writes[0].value.operative_effect = "obligation"),
    ],
    [
      "the receipt's sunset altered",
      isStage("instrument"),
      (g) => (g.writes[1].value.sunset_at.value = 999),
    ],
    [
      "the receipt's basis time altered",
      isStage("instrument"),
      (g) => (g.writes[1].value.basis_time.value = 99),
    ],
    [
      "a write that expected another version",
      isStage("office"),
      (g) => (g.writes[0].expected_version = 1),
    ],
    ["a write under another basis", isStage("institution"), (g) => (g.writes[0].basis = "other")],
    [
      "a write under another secrecy",
      isStage("scope_binding"),
      (g) => (g.writes[0].secrecy = "other"),
    ],
    ["a group under another owner", isStage("office"), (g) => (g.owner = "temporal_kernel")],
    ["a group under another cause", isStage("instrument"), (g) => (g.cause = "other-cause")],
    ["a dropped prerequisite read", isStage("instrument"), (g) => g.reads.pop()],
    [
      "a prerequisite pinned at another version",
      isStage("scope_binding"),
      (g) => (g.reads[0].version = 2),
    ],
    ["a dependency removed", isStage("office"), (g) => (g.depends_on = [])],
    ["an extra dependency", isStage("institution"), (g) => g.depends_on.push("some-other-group")],
    [
      "an extra write",
      isStage("office"),
      (g) => g.writes.push({ ...g.writes[0], key: "gip/other" }),
    ],
    [
      "a registration with another boundary",
      isRegistration,
      (g) => (g.writes[0].value.next_boundary.at.value = 999),
    ],
    [
      "a registration with another stage",
      isRegistration,
      (g) => (g.writes[0].value.dependencies = []),
    ],
    [
      "a registration without its index entry",
      isRegistration,
      (g) => (g.writes[1].value.entries = []),
    ],
    ["a registration under another owner", isRegistration, (g) => (g.owner = "gip")],
    [
      "a registration with an extra write",
      isRegistration,
      (g) => g.writes.push({ ...g.writes[0], key: "temporal/object/other" }),
    ],
  ];
  for (const [name, match, mutate] of mutations)
    it(`${name}: an identical rerun is a conflict, with no prompt and no write`, async () => {
      const dirs = await timedCampaign();
      const file = writeGovernance(governanceDoc());
      expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
      const head = await headOf(dirs.campaignDir);
      corruptGroup(match, mutate);
      const { result, terminal } = await addGovernance(dirs, file, []);
      vi.restoreAllMocks();
      expect(result.status, JSON.stringify(result.details)).toBe("GOVERNANCE_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }, 120_000);

  it("a group committed out of order (the Instrument without its binding) is a conflict", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const committedGroup = store.committedGroup.bind(store);
        vi.spyOn(store, "committedGroup").mockImplementation((intent: string) =>
          intent.endsWith(":scope_binding") ? null : committedGroup(intent),
        );
      }
      return opened;
    });
    const { result, terminal } = await addGovernance(dirs, file, []);
    vi.restoreAllMocks();
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a committed fact that is no longer held is a conflict; a registered object that does not read back is a failed verification", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
    const open = LocalOperatorSession.open;
    const hide = (hidden: (key: string) => boolean) =>
      vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
        const opened = await open.call(LocalOperatorSession, p);
        if (opened.ok) {
          const store = opened.value.campaign.store;
          const getFact = store.getFact.bind(store);
          vi.spyOn(store, "getFact").mockImplementation((key: string) =>
            hidden(key) ? undefined : getFact(key),
          );
        }
        return opened;
      });
    hide((k) => k === `gip/institution/${INSTITUTION_ID}/identity`);
    const gone = await addGovernance(dirs, file, []);
    vi.restoreAllMocks();
    expect(gone.result.status).toBe("GOVERNANCE_CONFLICT");

    hide((k) => k.startsWith("temporal/object/"));
    const unread = await addGovernance(dirs, file, []);
    vi.restoreAllMocks();
    expect(unread.result.status).toBe("GOVERNANCE_VERIFICATION_FAILED");
    expect(unread.terminal.asked()).toBe(0);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same proposal confirmed again", async () => {
    const expected = await reference();
    const file = writeGovernance(governanceDoc());

    const probeDirs = await timedCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addGovernance(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("GOVERNANCE_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(20);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await timedCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addGovernance(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("GOVERNANCE_CONFLICT");

        // whatever was durable at the cut, the chain is a prefix: nothing is present without its prerequisite
        const cut = await held(dirs.campaignDir).catch(() => undefined);
        if (cut) {
          const order = [
            cut.institution,
            cut.office,
            cut.scope_binding,
            cut.instrument,
            cut.registered,
          ];
          expect(
            order.every((present, i) => !present || i === 0 || order[i - 1]),
            `op ${failAt} ${when}`,
          ).toBe(true);
        }

        crashedHolder(dirs.campaignDir);
        const again = await addGovernance(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("GOVERNANCE_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        expect(c.store.getFact(`gip/instrument/${INSTRUMENT_ID}`)!.version).toBe(1);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous, incomplete or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("GOVERNANCE_READY") && seen.size === 1).toBe(false);
  }, 3_600_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits everything once", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writeGovernance(governanceDoc());
    const killed = await runShipped(governanceArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(governanceArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(governanceArgs(dirs, file, ["--reclaim-stale-lock"]), [
      "confirm",
    ]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS GOVERNANCE_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  for (const [progress, pending] of [
    [/PROGRESS institution COMMITTED/, "office → scope_binding → instrument → sunset registration"],
    [/PROGRESS office COMMITTED/, "scope_binding → instrument → sunset registration"],
    [/PROGRESS scope_binding COMMITTED/, "instrument → sunset registration"],
  ] as const)
    it(`killed at ${progress.source}: the rerun asks once about ${pending} only and lands on the same campaign`, async () => {
      const expected = await reference();
      const dirs = await timedCampaign();
      const file = writeGovernance(governanceDoc());
      const killed = await runShipped(governanceArgs(dirs, file), ["confirm"], {
        killAfter: progress,
      });
      expect(killed.signal).toBe("SIGKILL");

      const rerun = await runShipped(governanceArgs(dirs, file, ["--reclaim-stale-lock"]), [
        "confirm",
      ]);
      expect(rerun.code).toBe(0);
      expect(rerun.stdout).toContain(`to commit, in this order: ${pending}`);
      expect(rerun.stdout).toContain("STATUS GOVERNANCE_READY");
      expect(await headOf(dirs.campaignDir)).toEqual(expected);
    }, 120_000);

  it("killed after the Temporal registration and before the acknowledgement: the rerun verifies everything by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    const killed = await runShipped(governanceArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS sunset registration COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(governanceArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS GOVERNANCE_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
