/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary fact values and inject faults into the file layer */
// S-4 initial Standing Instruction ledger — REPLAY, COMPETITION and EVERY-DURABLE-CUT recovery (BLUE brief B4: "Replay/competition",
// "Every durable cut"). MECHANISM ONLY (T1), local file package. Local success is NOT provider/retained-storage acceptance (IA-07
// BLOCKED/UNRUN); no claim is made about a hosted store, a second host or a cross-host lock.
//
// Faults are injected into the REAL file layer. The store's publication order is journal append -> manifest rename (a state checkpoint
// only at its interval), and the manifest rename is the SINGLE COMMIT POINT: anything after the manifest's head is residue, reported
// on open and never adopted. So the real durable cuts of one ordinary commit are: nothing written (BEFORE_JOURNAL), a torn
// half-written journal line (TORN_JOURNAL), a complete journal line whose manifest never moved (JOURNAL_ONLY: uncommitted residue) and a
// commit that IS durable whose acknowledgment is lost (COMMITTED_NO_ACK). After every cut the campaign is reopened by a fresh handle and
// the SAME operations are presented again with their derived identities; the result must converge on the byte-identical journal head and
// canonical state of the uninterrupted run, with no duplicate group, no bound-but-headless PC and no lost accepted state.
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, nodeFs, type FsOps } from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
} from "@immortalis/testkit";
import {
  handoverInput,
  readyForHandover,
  seededExistingActorCampaign,
} from "../support/existing-actor.ts";
import {
  HEAD_KEY,
  PC,
  activateWithLedger,
  bindInput,
  code,
  rawLedgerGroup,
  releasedCampaign,
  target,
} from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

type Mode = "BEFORE_JOURNAL" | "TORN_JOURNAL" | "JOURNAL_ONLY" | "COMMITTED_NO_ACK";
const MODES: readonly Mode[] = [
  "BEFORE_JOURNAL",
  "TORN_JOURNAL",
  "JOURNAL_ONLY",
  "COMMITTED_NO_ACK",
];

/** The real file layer, except that the NEXT commit can be made to crash at one of the four real durable boundaries. */
function crashingFs(): { fs: FsOps; arm: (m: Mode) => void } {
  let armed: Mode | null = null;
  const boom = (what: string): never => {
    armed = null;
    throw new Error(`simulated crash: ${what}`);
  };
  const fs: FsOps = {
    ...nodeFs,
    async writeFileDurable(path, data) {
      if (path.endsWith("manifest.json")) {
        if (armed === "JOURNAL_ONLY") boom("journal complete, manifest never moved");
        if (armed === "COMMITTED_NO_ACK") {
          await nodeFs.writeFileDurable(path, data);
          boom("manifest durable, acknowledgment lost");
        }
      }
      return nodeFs.writeFileDurable(path, data);
    },
    async appendDurable(path, data) {
      if (path.endsWith("journal.jsonl")) {
        if (armed === "BEFORE_JOURNAL") boom("before the journal append");
        if (armed === "TORN_JOURNAL") {
          await nodeFs.appendDurable(path, data.slice(0, Math.floor(data.length / 2)));
          boom("in the middle of the journal append");
        }
      }
      return nodeFs.appendDurable(path, data);
    },
  };
  return { fs, arm: (m) => (armed = m) };
}

/** What a reopened package reports as residue (never adopted) for the fault that was injected. */
const residueShows = (c: CanonicalCampaign, mode: Mode): boolean => {
  const r = (c.store as any).residue as { journal_tail_bytes: number; other_files: string[] };
  if (mode === "TORN_JOURNAL" || mode === "JOURNAL_ONLY") return r.journal_tail_bytes > 0;
  return true; // BEFORE_JOURNAL leaves none; COMMITTED_NO_ACK is a durable commit
};

const heads = (c: CanonicalCampaign) => {
  const h = c.store.head();
  return {
    state_sha256: h.state_sha256,
    journal_entries: h.journal_entries,
    journal_head_sha256: h.journal_head_sha256,
  };
};

const open = async (dir: string, ext = false, buildId = "s4-recover") => {
  const opts = { buildId, ...(ext ? { extension: ACTOR_FIXTURE_EXTENSION } : {}) };
  const first = await CanonicalCampaign.open(dir, opts);
  if (first.ok) return first.value;
  // a crashed handle can leave the single-writer lock behind: reclaim it explicitly, as an operator does
  return must(CanonicalCampaign.open(dir, { ...opts, reclaimStaleLock: true }));
};

async function closeQuietly(c: { close(): Promise<void> }) {
  try {
    await c.close();
  } catch {
    // the next handle reclaims an unreleased lock explicitly and reconciles by identity
  }
}

describe("duplicate, changed-payload and concurrent invocations converge on ONE canonical result", () => {
  it("a changed payload under an already-committed identity is a CONFLICT, never a silent success", async () => {
    const c = await releasedCampaign(tempDir());
    await must(c.initializePcStandingInstructionLedger(target()));
    const before = heads(c);
    const same = await rawLedgerGroup(c);
    expect((await must(c.store.commit(same))).replayed).toBe(true); // the identical group is the replay
    const changed = { ...same, cause: "a-different-cause" };
    expect(await code(c.store.commit(changed) as never)).toBe("INTENT_CONFLICT");
    const changedGroupId = { ...same, intent_id: "fresh-intent" };
    expect(await code(c.store.commit(changedGroupId) as never)).toBe("GROUP_ID_CONFLICT");
    expect(heads(c)).toEqual(before);
    await c.close();
  });

  it("concurrent identical initializers commit exactly one group; the rest recover its receipt", async () => {
    const c = await releasedCampaign(tempDir());
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => c.initializePcStandingInstructionLedger(target())),
    );
    const outcomes = results.map((r) => (r.ok ? r.value : null));
    expect(outcomes.every((o) => o !== null)).toBe(true);
    expect(outcomes.filter((o) => o!.replayed === false)).toHaveLength(1);
    const receipts = new Set(outcomes.map((o) => o!.receipt.group_sha256));
    expect(receipts.size).toBe(1);
    expect(c.store.head().journal_entries).toBe(4); // world, locus, PC, ONE ledger group
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  it("a binding racing its own prerequisite is refused as an explicit, recoverable conflict, and a retry converges", async () => {
    const refDir = tempDir();
    const ref = await releasedCampaign(refDir);
    await activateWithLedger(ref);
    const reference = heads(ref);
    await ref.close();

    const c = await releasedCampaign(tempDir());
    const [init, bind] = await Promise.all([
      c.initializePcStandingInstructionLedger(target()),
      c.bindPlayerCharacter(bindInput()),
    ]);
    expect(init.ok).toBe(true);
    // the binding was prepared when no head existed; it does not silently succeed and it creates no binding
    expect(bind.ok).toBe(false);
    expect(["STALE_READ", "PREREQUISITE_MISSING"]).toContain(!bind.ok && bind.error.code);
    expect(c.binding()).toBeUndefined();
    expect(c.verify()).toEqual([]);
    await must(c.bindPlayerCharacter(bindInput())); // the retry, now with the head committed
    expect(heads(c)).toEqual(reference);
    await c.close();
  });

  it("a second handle on the same package cannot write while the first is open; after it closes, the operation converges", async () => {
    const dir = tempDir();
    const a = await releasedCampaign(dir);
    await must(a.initializePcStandingInstructionLedger(target()));
    const second = await CanonicalCampaign.open(dir, { buildId: "s4-second-handle" });
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error.code).toBe("LOCKED");
    expect(!second.ok && (second.error.details as any)?.holder_alive).toBe(true);
    await a.close();
    const b = await open(dir);
    const again = await must(b.initializePcStandingInstructionLedger(target()));
    expect(again.replayed).toBe(true);
    await must(b.bindPlayerCharacter(bindInput()));
    expect(b.verify()).toEqual([]);
    await b.close();
  });
});

describe("every durable cut of a NEW-PC ACTIVATION converges on the uninterrupted run", () => {
  const cuts = (["ledger", "binding"] as const).flatMap((step) =>
    MODES.map((mode) => [step, mode] as const),
  );
  for (const [step, mode] of cuts) {
    it(`a crash at ${mode} of the ${step} commit, then a fresh handle and the same operations`, async () => {
      const refDir = tempDir();
      const ref = await releasedCampaign(refDir);
      await activateWithLedger(ref);
      const reference = heads(ref);
      await ref.close();

      const { fs, arm } = crashingFs();
      const dir = tempDir();
      const c = await releasedCampaign(dir, { fs });
      if (step === "ledger") arm(mode);
      const first = await c.initializePcStandingInstructionLedger(target());
      let crashed = first;
      if (step === "binding") {
        expect(first.ok).toBe(true);
        arm(mode);
        crashed = (await c.bindPlayerCharacter(bindInput())) as never;
      }
      expect(crashed.ok).toBe(false); // the caller is told the outcome is not known, never that it succeeded
      expect(!crashed.ok && crashed.error.code).toBe("UNKNOWN_OUTCOME");
      // the poisoned handle refuses to write again rather than guess (reconcile by identity on a fresh handle)
      expect(await code(c.initializePcStandingInstructionLedger(target()))).toBe("STORE_POISONED");
      await closeQuietly(c);

      // a FRESH handle sees exactly what is durable: only a commit whose manifest moved is canon
      const r = await open(dir);
      const ledgerDurable = step === "binding" || mode === "COMMITTED_NO_ACK";
      const bindingDurable = step === "binding" && mode === "COMMITTED_NO_ACK";
      expect(residueShows(r, mode)).toBe(true); // the injected fault was really reached, and is reported, never adopted
      expect(r.standingInstructionLedger(PC) !== undefined).toBe(ledgerDurable);
      expect(r.binding() !== undefined).toBe(bindingDurable);
      expect(r.store.head().journal_entries).toBe(
        3 + (ledgerDurable ? 1 : 0) + (bindingDurable ? 1 : 0),
      );
      // never a bound-but-headless PC, and a head with no binding is simply inert
      expect(r.verify()).toEqual([]);

      // the SAME operations again, with their derived identities: each replays what is durable and commits what is not
      const init = await must(r.initializePcStandingInstructionLedger(target()));
      expect(init.replayed).toBe(ledgerDurable);
      const bind = await must(r.bindPlayerCharacter(bindInput()));
      expect(bind.replayed).toBe(bindingDurable);
      expect(heads(r)).toEqual(reference); // no duplicate group, no lost accepted state: the uninterrupted run's exact journal
      expect(r.verify()).toEqual([]);
      await r.close();

      const cold = await open(dir);
      expect(heads(cold)).toEqual(reference);
      expect(cold.verify()).toEqual([]);
      await cold.close();
    });
  }
});

describe("every durable cut of an EXISTING_ACTOR_HANDOVER converges on the uninterrupted run", () => {
  const ledgerOf = { pc_id: ACTOR_SMITH, world_id: FIXTURE_WORLD_ID, locus_id: FIXTURE_LOCUS_ID };
  async function lifecycle(
    s: Awaited<ReturnType<typeof seededExistingActorCampaign>>,
    arm?: (step: "ledger" | "binding") => void,
  ) {
    await readyForHandover(s);
    arm?.("ledger");
    const ledger = await s.campaign.initializePcStandingInstructionLedger(ledgerOf);
    if (!ledger.ok) return ledger;
    arm?.("binding");
    return s.campaign.handoverExistingActor(handoverInput(1));
  }

  const cuts = (["ledger", "binding"] as const).flatMap((step) =>
    MODES.map((mode) => [step, mode] as const),
  );
  for (const [step, mode] of cuts) {
    it(`a crash at ${mode} of the ${step} commit`, async () => {
      const ref = await seededExistingActorCampaign(tempDir());
      await must(lifecycle(ref));
      const reference = heads(ref.campaign);
      await ref.campaign.close();

      const { fs, arm } = crashingFs();
      const dir = tempDir();
      const s = await seededExistingActorCampaign(dir, { fs });
      const result = await lifecycle(s, (at) => {
        if (at === step) arm(mode);
      });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("UNKNOWN_OUTCOME");
      await closeQuietly(s.campaign);

      const r = await open(dir, true);
      const ledgerDurable = step === "binding" || mode === "COMMITTED_NO_ACK";
      const bindingDurable = step === "binding" && mode === "COMMITTED_NO_ACK";
      expect(residueShows(r, mode)).toBe(true);
      expect(r.standingInstructionLedger(ACTOR_SMITH) !== undefined).toBe(ledgerDurable);
      expect(r.binding() !== undefined).toBe(bindingDurable);
      expect(r.verify()).toEqual([]);
      // the prior non-PC owner is still the single writer until the handover commits, and never after it
      const init = await must(r.initializePcStandingInstructionLedger(ledgerOf));
      expect(init.replayed).toBe(ledgerDurable);
      const handed = await must(r.handoverExistingActor(handoverInput(1)));
      expect(handed.replayed).toBe(bindingDurable);
      expect(heads(r)).toEqual(reference);
      expect(r.verify()).toEqual([]);
      await r.close();
    });
  }
});

describe("a crash between the ledger and the binding never produces a bound or headless PC", () => {
  it("the head is inert across any number of reopenings until the binding commits", async () => {
    const dir = tempDir();
    const c = await releasedCampaign(dir);
    await must(c.initializePcStandingInstructionLedger(target()));
    await c.close();
    for (let i = 0; i < 3; i++) {
      const r = await open(dir, false, `s4-inert-${i}`);
      expect(r.binding()).toBeUndefined();
      expect(r.store.getFact(HEAD_KEY)!.version).toBe(1);
      expect(r.verify()).toEqual([]);
      await r.close();
    }
  });
});
