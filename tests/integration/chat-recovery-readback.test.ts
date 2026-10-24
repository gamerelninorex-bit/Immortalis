/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted host reads untyped JSON */
// The ordinary-chat adapter's OWNER READBACK of an observation (apps/phone/src/recovery.ts), BLUE R3-b, against a REAL campaign.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The "referee" is a script (plumbing only, NOT an AI and NOT a game master's judgment), the
// "player" is a script that types a confirmation, and nothing here is a real choice or First Playable evidence. What it proves: the
// readback reads what the OWNERS hold for the ORIGINAL observation, under every attempt's identity, and calls an observation complete only
// when the event, the sealed packet and the sealed Temporal transaction all exist and the Epistemic owner's own verification is clean.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, EpistemicAccessAdapter } from "@immortalis/engine";
import {
  OBSERVATION_ATTEMPTS,
  captureObservation,
  completeObservation,
  observationEvidence,
  type ObservationEvidence,
  type ObservationIdentity,
} from "../../apps/phone/src/recovery.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import {
  PC_ID,
  observationAnswer,
  observationCampaign,
  observe,
  screenScene,
  verbConsole,
} from "../support/observation.ts";
import { LOCALITY_CAMPAIGN } from "../support/locality.ts";
import { plainPolicy } from "../support/original-pc.ts";

// a test may make the Epistemic owner's verification report a violation (everything else passes through to the real engine)
const hooks = vi.hoisted(() => ({ violate: false }));
vi.mock("@immortalis/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@immortalis/engine")>();
  return {
    ...real,
    verifyEpistemicIntegrity: (...a: Parameters<typeof real.verifyEpistemicIntegrity>) =>
      hooks.violate
        ? [{ code: "TEST_VIOLATION", message: "a violation the test planted" } as any]
        : real.verifyEpistemicIntegrity(...a),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  hooks.violate = false;
});

const cfg = (dirs: { campaignDir: string; operatorDir: string }): PhoneConfig =>
  ({ ...dirs, campaignId: LOCALITY_CAMPAIGN }) as unknown as PhoneConfig;

/** what the owners hold, by name, for the observation decisions / access / temporal transaction facts */
async function held(campaignDir: string) {
  const opened = await CanonicalCampaign.open(campaignDir, { buildId: "readback-test" });
  if (!opened.ok) throw new Error("did not open");
  const c = opened.value;
  try {
    const facts = c.store.listFacts();
    return {
      decisions: facts
        .filter(
          (f) =>
            /^referee\/.+\/decision$/.test(f.key) &&
            (f.value as any).operation === "F014D_DIRECT_PERCEPTION",
        )
        .map((f) => ({ attempt: (f.value as any).attempt, verdict: (f.value as any).verdict })),
      event: facts.some((f) => /^access\/.+\/event$/.test(f.key)),
      packet: facts.some((f) => /^access\/.+\/packet\//.test(f.key)),
      sealed: facts.some((f) => f.key.startsWith("temporal/transaction/observation-tx-")),
    };
  } finally {
    await c.close();
  }
}

const lostReply = (original: boolean) => {
  const proto = EpistemicAccessAdapter.prototype as any;
  const real = proto.establishObservedAccess as (...a: unknown[]) => Promise<unknown>;
  return vi.spyOn(proto, "establishObservedAccess").mockImplementation(async function (
    this: object,
    ...args: unknown[]
  ) {
    if (original) await real.apply(this, args); // the event commits, then the reply is lost
    return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } };
  });
};

/** attempt 0 is answered with nonsense (the shipped command sets it aside and asks again as attempt 1) */
const setAsideFirst = (doc: any) =>
  doc.operation === "F014D_DIRECT_PERCEPTION"
    ? doc.context.attempt === 0
      ? { task_id: doc.task_id, nonsense: true }
      : observationAnswer(doc)
    : plainPolicy(doc);

const identityOf = async (dirs: { campaignDir: string; operatorDir: string }) => {
  const identity = await captureObservation(cfg(dirs), PC_ID);
  expect(identity).not.toBeNull();
  return identity as ObservationIdentity;
};

describe("MECHANISM (BLUE R3-b): the owner readback of an observation, against a REAL campaign", () => {
  it("captures the ORIGINAL identity before dispatch: every attempt's task identity at one basis, and the attempt bound is the shipped command's own", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    expect(identity.pc_id).toBe(PC_ID);
    expect(identity.task_ids).toHaveLength(OBSERVATION_ATTEMPTS);
    expect(new Set(identity.task_ids).size).toBe(OBSERVATION_ATTEMPTS); // distinct per attempt
    expect(identity.task_id).toBe(identity.task_ids[0]);
    expect(identity.task_ids.every((t) => /^[0-9a-f]{64}$/.test(t))).toBe(true);
    // a drift guard: the number of attempts the shipped command asks at one basis is mirrored, not guessed
    const shipped = readFileSync(
      join(import.meta.dirname, "../../packages/operator/src/referee-session.ts"),
      "utf8",
    );
    expect(Number(/const MAX_ATTEMPTS = (\d+);/.exec(shipped)![1])).toBe(OBSERVATION_ATTEMPTS);
  });

  it("NONE: nothing at all is held for an observation that never reached the owners", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    expect(await observationEvidence(cfg(dirs), identity)).toEqual({ kind: "NONE" });
  });

  it("NEGATIVE: a retained non-receipt is the final word at that basis", async () => {
    const { dirs } = await observationCampaign({ scene: screenScene() });
    const identity = await identityOf(dirs);
    const ran = await observe(dirs);
    expect(ran.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect((await held(dirs.campaignDir)).decisions).toEqual([
      { attempt: 0, verdict: expect.not.stringMatching(/^OBSERVATION_ESTABLISHED$/) },
    ]);
    expect(await observationEvidence(cfg(dirs), identity)).toEqual({ kind: "NEGATIVE" });
  });

  it("COMPLETE only when the event, the sealed packet, the sealed Temporal transaction and a clean Epistemic verification all hold", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    expect((await observe(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    expect(await held(dirs.campaignDir)).toMatchObject({ event: true, packet: true, sealed: true });
    expect(await observationEvidence(cfg(dirs), identity)).toEqual({ kind: "COMPLETE" });

    // the Epistemic owner reporting a violation is never "complete": the readback is unavailable, and says so without a verdict
    hooks.violate = true;
    const bad = await observationEvidence(cfg(dirs), identity);
    expect(bad.kind).toBe("UNAVAILABLE");
    expect((bad as { detail: string }).detail).toMatch(/integrity check reports violations/);
  });

  it("PARTIAL: a retained affirmative reading without an event (attempt 0)", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    lostReply(false); // the reading is retained; the Epistemic owner's step never lands
    const ran = await observe(dirs);
    expect(ran.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    expect(await held(dirs.campaignDir)).toMatchObject({
      decisions: [{ attempt: 0, verdict: "OBSERVATION_ESTABLISHED" }],
      event: false,
      packet: false,
    });
    const ev = await observationEvidence(cfg(dirs), identity);
    expect(ev.kind).toBe("PARTIAL");
  });

  it("PARTIAL: a reading retained under attempt >= 1 (the first answer was set aside) is NOT 'nothing was committed'", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    lostReply(false);
    const ran = await observe(dirs, verbConsole("observe-surroundings"), {}, setAsideFirst as any);
    expect(ran.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    const owners = await held(dirs.campaignDir);
    // the owners hold exactly one reading, retained under attempt 1 — the attempt-0 identity finds nothing
    expect(owners.decisions).toEqual([{ attempt: 1, verdict: "OBSERVATION_ESTABLISHED" }]);
    expect(owners.event).toBe(false);
    const opened = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "readback-test" });
    if (!opened.ok) throw new Error("did not open");
    try {
      const { RefereeAdjudicationAdapter } = await import("@immortalis/engine");
      const adapter = new RefereeAdjudicationAdapter(opened.value.store);
      expect(adapter.decision(identity.task_ids[0]!)).toBeUndefined(); // what an attempt-0-only lookup would see
      expect(adapter.decision(identity.task_ids[1]!)?.value.verdict).toBe(
        "OBSERVATION_ESTABLISHED",
      );
    } finally {
      await opened.value.close();
    }
    const ev: ObservationEvidence = await observationEvidence(cfg(dirs), identity);
    expect(ev.kind).toBe("PARTIAL");
  });

  it("NEGATIVE also holds for a non-receipt retained under attempt >= 1", async () => {
    const { dirs } = await observationCampaign({ scene: screenScene() });
    const identity = await identityOf(dirs);
    const ran = await observe(dirs, verbConsole("observe-surroundings"), {}, ((doc: any) =>
      doc.operation === "F014D_DIRECT_PERCEPTION"
        ? doc.context.attempt === 0
          ? { task_id: doc.task_id, nonsense: true }
          : observationAnswer(doc)
        : plainPolicy(doc)) as any);
    expect(ran.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    const owners = await held(dirs.campaignDir);
    expect(owners.decisions).toHaveLength(1);
    expect(owners.decisions[0]!.attempt).toBe(1);
    expect(await observationEvidence(cfg(dirs), identity)).toEqual({ kind: "NEGATIVE" });
  });

  it("PARTIAL: an earned event without its sealed packet", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    lostReply(true);
    const ran = await observe(dirs);
    expect(ran.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    expect(await held(dirs.campaignDir)).toMatchObject({ event: true, packet: false });
    expect((await observationEvidence(cfg(dirs), identity)).kind).toBe("PARTIAL");
  });

  it("PARTIAL: the packet is formed but the sealed Temporal transaction (the last write) was lost", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    // only the sealed-transaction commit loses its reply; everything before it lands
    const realOpen = CanonicalCampaign.open.bind(CanonicalCampaign);
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (...a: any[]) => {
      const r: any = await (realOpen as any)(...a);
      if (r.ok) {
        const store: any = r.value.store;
        const commit = store.commit.bind(store);
        store.commit = async (g: any) =>
          typeof g?.group_id === "string" &&
          g.group_id.startsWith("transaction-group:observation-tx-")
            ? { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } }
            : commit(g);
      }
      return r;
    });
    const ran = await observe(dirs);
    expect(ran.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    expect(await held(dirs.campaignDir)).toMatchObject({
      event: true,
      packet: true,
      sealed: false,
    });
    const ev = await observationEvidence(cfg(dirs), identity);
    expect(ev.kind).toBe("PARTIAL"); // not COMPLETE: the same command finishes the formation
    // the detail is neutral: it reaches the assistant and says nothing of what the reading was
    expect((ev as { detail: string }).detail).not.toMatch(
      /affirmative|established|reading|retained|appearance|verdict/i,
    );
  });

  it("UNAVAILABLE: a campaign that cannot be opened is neither complete nor empty", async () => {
    const { dirs } = await observationCampaign();
    const identity = await identityOf(dirs);
    const ev = await observationEvidence(
      cfg({ ...dirs, campaignDir: join(dirs.campaignDir, "nowhere") }),
      identity,
    );
    expect(ev.kind).toBe("UNAVAILABLE");
    expect((ev as { detail: string }).detail).toMatch(/the campaign did not open/);
  });

  it("completion refuses foreign campaign, PC or basis identity without changing the retained partial observation", async () => {
    const { dirs } = await observationCampaign();
    const config = cfg(dirs);
    const identity = await identityOf(dirs);
    const fault = lostReply(true);
    expect((await observe(dirs)).result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    fault.mockRestore();
    const facts = async () => {
      const c = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "identity-negative" });
      if (!c.ok) throw new Error("cannot open");
      try {
        return c.value.store.listFacts();
      } finally {
        await c.value.close();
      }
    };
    const partial = await facts();
    for (const [config_, identity_] of [
      [{ ...config, campaignId: "foreign-campaign" }, identity],
      [config, { ...identity, pc_id: "another-pc" }],
      [config, { ...identity, basis: { ...identity.basis, value: identity.basis.value + 1 } }],
    ] as const) {
      expect((await completeObservation(config_, identity_)).kind).toBe("UNAVAILABLE");
      expect(await facts()).toEqual(partial);
    }
    expect((await completeObservation(config, identity)).kind).toBe("COMPLETE");
    const complete = await facts();
    expect((await completeObservation(config, identity)).kind).toBe("COMPLETE");
    expect(await facts()).toEqual(complete);
  });
});
