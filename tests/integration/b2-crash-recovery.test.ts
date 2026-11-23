/* eslint-disable @typescript-eslint/no-explicit-any -- raw groups, store wrappers and journal bytes */
// F-014B B2-T04 — crash boundaries, same-root retry and the terminal NO_OPEN. SCRIPTED TESTKIT MECHANISM ONLY.
//
// Two kinds of boundary are exercised:
//   A. the LOGICAL joins of the lifecycle: before the marker, after the marker and before OPEN, after OPEN and before any stage, after a stage, after the
//      seal and before the reconciliation. At each, the campaign is closed and reopened cold, the PREVIOUS step is re-presented as a lost reply would
//      (same root: the exact original ids) and the NEXT step proceeds. Time is never credited twice and there is never a second transaction.
//   B. EVERY durable filesystem step of each custody commit: the testkit fault filesystem fails the n-th mutating operation, before or after it takes
//      effect; the campaign is reopened and the same step re-presented. It must converge on the IDENTICAL journal a clean run produces.
import { cpSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  temporalGmWaitByPcKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  GmWaitCustody,
  buildNoOpenGroup,
  deriveGmWaitFence,
  fixtureCanonicalAdmission,
  gmWaitX,
  nodeFs,
  stageGroupId,
  stageIntentId,
  verifyTemporalIntegrity,
  type CampaignStore,
  type FsOps,
} from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import {
  FIXTURE_PC_ID,
  SYNTH_EXTENSION,
  SYNTH_FACET,
  SYNTH_OWNER,
  SYNTH_RULE,
  TARGET,
  authorityGroupOf,
  custodyPolicy,
  foreignGroup,
  lifecycle,
  markerInput,
  must,
  prepOf,
  proofOf,
  reopenRig,
  seededRig,
  tempDir,
  txOf,
} from "./b2-support.ts";

const clock = (store: CampaignStore) => store.getFact(TEMPORAL_STATE_KEY)!;
const summary = (store: CampaignStore) => ({
  head: store.head().journal_head_sha256,
  revision: store.head().revision,
  state: store.head().state_sha256,
});

describe("B2-T04 A: the logical crash boundaries and same-root retry", () => {
  it("before the marker: a crash leaves nothing; the same root then publishes it once", async () => {
    const rig = await seededRig(tempDir());
    const before = summary(rig.store);
    await rig.campaign.close(); // the process dies having written nothing
    const re = await reopenRig(rig.dir);
    expect(summary(re.store)).toEqual(before);
    expect(re.custody.status(FIXTURE_PC_ID)).toEqual({ state: "NONE" });
    const m = await must(re.custody.publishMarker(markerInput(re)));
    expect(m.replayed).toBe(false);
    await re.campaign.close();
  });

  it("after the marker and before OPEN: the lost marker reply is answered with the ORIGINAL receipt, then OPEN proceeds exactly once", async () => {
    const rig = await seededRig(tempDir());
    const m = await must(rig.custody.publishMarker(markerInput(rig)));
    const sealedBefore = summary(rig.store);
    await rig.campaign.close();
    const re = await reopenRig(rig.dir);
    expect(re.custody.status(FIXTURE_PC_ID)).toEqual({ state: "MARKED" });
    const retry = await must(re.custody.publishMarker(markerInput(re)));
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(m.receipt);
    expect(summary(re.store)).toEqual(sealedBefore);
    const o = await must(re.custody.open(re.proof));
    expect(o.replayed).toBe(false);
    expect(clock(re.store).version, "no time was credited by the marker or the opening").toBe(1);
    await re.campaign.close();
  });

  it("after OPEN and before any stage: ACTIVE is rebuilt from the durable opening on a COLD reopen, foreign traffic stays refused, the lost OPEN reply is answered by identity", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const o = rig.store.lookupReceipt(`gm-wait-open-intent:${x}`)!;
    await rig.campaign.close();
    // the strict cold reopen: a checkpoint with an ACTIVE interval carries no ordered interval proof
    const re = await reopenRig(rig.dir);
    expect(deriveGmWaitFence(re.store.canonicalState!()).active?.x).toBe(x);
    const retry = await must(re.custody.open(re.proof));
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(o);
    expect((await re.store.commit(foreignGroup(1))).ok).toBe(false);
    await must(re.custody.sealOwn(x));
    await re.campaign.close();
  });

  it("after a stage: the committed stage is adopted by the seal that cites it; it is never recreated and the time is credited once", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const key = {
      causal_process_id: "b2-process-1",
      owner_operation: { owner: SYNTH_OWNER, operation: "b2-stage-op" },
      prospective_result_id: "b2-result-1",
    };
    const stage: CommitGroup = {
      campaign_id: rig.store.head().campaign_id,
      group_id: stageGroupId(key),
      intent_id: stageIntentId(key),
      owner: SYNTH_OWNER,
      facet: SYNTH_FACET,
      cause: `transaction:${txOf(x)}`,
      rule: SYNTH_RULE,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [],
      depends_on: [authorityGroupOf(rig.store, x)],
      writes: [
        {
          key: "synthetic/stage/crash",
          owner: SYNTH_OWNER,
          facet: SYNTH_FACET,
          unit: null,
          basis: "synthetic-basis",
          secrecy: "synthetic-secrecy",
          expected_version: 0,
          value: "result" as never,
        },
      ],
    };
    const staged = await must(rig.store.commit(stage));
    await rig.campaign.close();
    const re = await reopenRig(rig.dir);
    // the lost stage reply: the same group is the same receipt
    const again = await must(re.store.commit(stage));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(staged.receipt);
    const record = {
      stage: key,
      reads: [],
      group_id: stage.group_id,
      intent_id: stage.intent_id,
      revision: staged.receipt.revision,
      group_sha256: staged.receipt.group_sha256,
      writes: [{ key: "synthetic/stage/crash", version: 1 }],
      validation: { invariants: staged.receipt.invariants.map((i) => i.name) },
    };
    await must(re.custody.sealOwn(x, [{ record, groupId: stage.group_id }]));
    expect(clock(re.store).version).toBe(2);
    expect([...re.campaign.verify(), ...verifyTemporalIntegrity(re.store)]).toEqual([]);
    await re.campaign.close();
  });

  it("after the seal and before the reconciliation: a retry of the seal is the same transaction, the clock moved once, and the reconciliation then completes", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "seal");
    const sealReceipt = rig.store.lookupReceipt(`transaction-intent:${txOf(x)}`)!;
    await rig.campaign.close();
    const re = await reopenRig(rig.dir);
    expect(re.custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_UNRECONCILED" });
    const retry = await must(re.custody.sealOwn(x));
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(sealReceipt);
    expect(clock(re.store).version, "one credit of time, ever").toBe(2);
    // a new INITIAL is refused until the original barrier is reconciled
    const blocked = await re.custody.publishMarker(
      markerInput({ ...re, proof: proofOf("session-next", "9") }),
    );
    expect(blocked.ok).toBe(false);
    await must(re.custody.reconcile(re.proof));
    expect(re.custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_RECONCILED" });
    const lost = await must(re.custody.reconcile(re.proof));
    expect(lost.replayed).toBe(true);
    await re.campaign.close();
  });
});

describe("B2-T04 B: a failure at EVERY durable step of each custody commit converges on the identical journal", () => {
  type Step = "marker" | "open" | "seal" | "reconcile";
  const ORDER: Step[] = ["marker", "open", "seal", "reconcile"];
  const X = (() => {
    const r = gmWaitX("session-original-1", "1");
    if (!r.ok) throw new Error("x");
    return r.x;
  })();
  /** the pristine campaign directory, advanced to just before `step`, closed */
  const pristine = async (step: Step): Promise<string> => {
    const dir = tempDir();
    const rig = await seededRig(dir);
    for (const s of ORDER.slice(0, ORDER.indexOf(step))) {
      if (s === "marker") await must(rig.custody.publishMarker(markerInput(rig)));
      if (s === "open") await must(rig.custody.open(rig.proof));
      if (s === "seal") await must(rig.custody.sealOwn(X));
    }
    await rig.campaign.close();
    return dir;
  };
  /** opens the package (optionally through a fault filesystem), performs ONE step, closes; returns that step's result */
  const attempt = async (
    dir: string,
    step: Step,
    fs?: FsOps,
    onOpened?: () => void,
    onStepped?: () => void,
  ) => {
    const opened = await CanonicalCampaign.open(dir, {
      buildId: "b2-crash",
      extension: SYNTH_EXTENSION,
      testkitFixtureAdmission: fixtureCanonicalAdmission,
      ...(fs ? { fs } : {}),
    });
    if (!opened.ok) return { opened: false as const, error: opened.error };
    onOpened?.();
    const store = opened.value.store;
    const custody = new GmWaitCustody(store, custodyPolicy());
    const proof = proofOf();
    let result: { ok: boolean };
    try {
      result =
        step === "marker"
          ? await custody.publishMarker(markerInput({ proof, prep: prepOf(store) }))
          : step === "open"
            ? await custody.open(proof)
            : step === "seal"
              ? await custody.sealOwn(X)
              : await custody.reconcile(proof);
    } catch (e) {
      result = { ok: false, thrown: String(e) } as { ok: boolean };
    }
    onStepped?.();
    await opened.value.close().catch(() => undefined);
    return { opened: true as const, result };
  };

  for (const step of ["marker", "open", "seal", "reconcile"] as Step[]) {
    it(`the ${step} commit: fail the n-th mutating operation, before and after it takes effect, then re-present it`, async () => {
      const baseDir = await pristine(step);
      // the clean run: the journal every crashed run must reproduce, and the number of mutating operations to fail
      const cleanDir = tempDir();
      cpSync(baseDir, cleanDir, { recursive: true });
      const counter = instrumentFs(nodeFs);
      let afterOpen = 0;
      let afterStep = 0;
      const clean = await attempt(
        cleanDir,
        step,
        counter.fs,
        () => {
          afterOpen = counter.count();
        },
        () => {
          afterStep = counter.count();
        },
      );
      expect(clean.opened && clean.result.ok, JSON.stringify(clean)).toBe(true);
      // the operations that BELONG to the custody step: everything the step wrote after the package was open (the open's own lock is not a step)
      const total = afterStep;
      const expected = await (async () => {
        const r = await CanonicalCampaign.open(cleanDir, {
          buildId: "b2-read",
          extension: SYNTH_EXTENSION,
          testkitFixtureAdmission: fixtureCanonicalAdmission,
        });
        if (!r.ok) throw new Error("read");
        const s = summary(r.value.store);
        await r.value.close();
        return s;
      })();
      let exercised = 0;
      for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
        for (const when of ["before", "after"] as const) {
          const dir = tempDir();
          cpSync(baseDir, dir, { recursive: true });
          const faulty = instrumentFs(nodeFs, { failAt, when });
          const first = await attempt(dir, step, faulty.fs);
          if (first.opened) exercised++;
          // reopen and re-present THE SAME step, as a lost reply would
          const second = await attempt(dir, step);
          expect(
            second.opened,
            `reopen after failing op ${failAt} ${when}: ${JSON.stringify((second as any).error)}`,
          ).toBe(true);
          expect(
            (second as any).result.ok,
            `re-present after op ${failAt} ${when}: ${JSON.stringify((second as any).result)}`,
          ).toBe(true);
          const r = await CanonicalCampaign.open(dir, {
            buildId: "b2-read",
            extension: SYNTH_EXTENSION,
            testkitFixtureAdmission: fixtureCanonicalAdmission,
          });
          if (!r.ok) throw new Error(JSON.stringify(r.error));
          expect(
            summary(r.value.store),
            `op ${failAt} ${when} converges on the identical journal`,
          ).toEqual(expected);
          expect([...r.value.verify(), ...verifyTemporalIntegrity(r.value.store)]).toEqual([]);
          await r.value.close();
        }
      }
      expect(
        exercised,
        "at least the durable commit steps themselves were failed",
      ).toBeGreaterThanOrEqual(2);
    }, 600_000);
  }
});

describe("B2-T04 the terminal NO_OPEN needs complete no-OPEN evidence", () => {
  it("[control + positive] a marker with no OPEN, stage or seal becomes terminal NO_OPEN with zero time credit, and nothing reopens that X", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "marker");
    const clockBefore = clock(rig.store);
    const noOpen = await must(rig.custody.markNoOpen(rig.proof));
    expect(noOpen.replayed).toBe(false);
    expect(clock(rig.store), "zero elapsed credit: the temporal state is untouched").toEqual(
      clockBefore,
    );
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "NO_OPEN" });
    const index = rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.value as any;
    expect(index.terminal_proof.absent).toEqual([
      { key: temporalTransactionAuthorityKey(txOf(x)) },
      { key: temporalTransactionKey(txOf(x)) },
    ]);
    expect(index.terminal_proof.at_revision).toBe(noOpen.receipt.revision - 1);
    expect(index.open_authority).toBeNull();
    // nothing reopens that X
    const reopened = await rig.custody.open(rig.proof);
    expect(reopened.ok).toBe(false);
    expect((reopened as any).error.details.reason).toBe("GM_WAIT_TRANSITION");
    // the same logical retry reads the original truth (the marker's original receipt) and reports the terminal slot state
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "NO_OPEN" });
    expect(rig.store.getFact(temporalTransactionAuthorityKey(txOf(x)))).toBeUndefined();
    // a LATER X may take the slot at the next version
    const next = await must(
      rig.custody.publishMarker(
        markerInput(
          { ...rig, proof: proofOf("session-next", "5") },
          {
            request: {
              cause: "c2",
              triggerRef: "t2",
              target: TARGET,
              publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
            },
          },
        ),
      ),
    );
    expect(next.x).not.toBe(x);
    const stored = rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!;
    expect(stored.version).toBe(3);
    expect((stored.value as any).predecessor_index_version).toBe(2);
  });

  it("[negative] a NO_OPEN is refused once the wait OPENed, and once a competing OPEN won the cut after the NO_OPEN was prepared (stale absence), and the campaign is unchanged", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "marker");
    // prepared while the absence still held
    const prepared = buildNoOpenGroup(
      { get: (k) => rig.store.getFact(k) },
      x,
      rig.store.head().revision,
    );
    if (!prepared.ok) throw new Error("prepared");
    // a competing OPEN publishes first: while that wait is ACTIVE the W2 fence refuses the NO_OPEN outright
    await must(rig.custody.open(rig.proof));
    const head = rig.store.head();
    const during = await rig.store.commit(prepared.value);
    expect(during.ok).toBe(false);
    expect(((during as any).error.details ?? {}).reason).toBe("GM_WAIT_ACTIVE_FOREIGN");
    expect(rig.store.head()).toEqual(head);
    // once that wait is sealed there is no fence left, and the prepared NO_OPEN meets its own witnesses: the opening it read at version 0 now exists
    await must(rig.custody.sealOwn(x));
    const afterSeal = rig.store.head();
    const r = await rig.store.commit(prepared.value);
    expect(r.ok, "the NO_OPEN's own version-0 witnesses and index version are stale").toBe(false);
    expect(["STALE_READ", "VERSION_CONFLICT"]).toContain((r as any).error.code);
    expect(rig.store.head()).toEqual(afterSeal);
    // the writer path refuses it too, on the custody rules
    const viaWriter = await rig.custody.markNoOpen(rig.proof);
    expect(viaWriter.ok).toBe(false);
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_UNRECONCILED" });
  });

  it("[negative] an incomplete certificate is refused: a wrong revision, a wrong absent key, a reordered pair, and a missing proof", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "marker");
    const good = buildNoOpenGroup(
      { get: (k) => rig.store.getFact(k) },
      x,
      rig.store.head().revision,
    );
    if (!good.ok) throw new Error("good");
    const mutate = (f: (cert: any) => any): CommitGroup => ({
      ...good.value,
      writes: good.value.writes.map((w) => ({
        ...w,
        value: { ...(w.value as any), terminal_proof: f((w.value as any).terminal_proof) },
      })),
    });
    const bad: [string, CommitGroup][] = [
      [
        "a revision that is not the prestate's",
        mutate((c) => ({ ...c, at_revision: c.at_revision + 1 })),
      ],
      [
        "a wrong absent key",
        mutate((c) => ({ ...c, absent: [c.absent[0], { key: "temporal/transaction/other" }] })),
      ],
      ["the absent keys reordered", mutate((c) => ({ ...c, absent: [c.absent[1], c.absent[0]] }))],
    ];
    for (const [what, group] of bad) {
      const head = rig.store.head();
      const r = await rig.store.commit(group);
      expect(r.ok, what).toBe(false);
      expect(rig.store.head(), what).toEqual(head);
    }
    // the lawful group WITHOUT the verified origin proof is held (the NO_OPEN may be invoked only by the authenticated original request)
    const head = rig.store.head();
    const noProof = await rig.store.commit(good.value);
    expect(noProof.ok).toBe(false);
    expect(((noProof as any).error.details ?? {}).reason).toBe("GM_WAIT_PROOF_MISSING");
    expect(rig.store.head()).toEqual(head);
    // the control: through the writer, with its proof, the very same group is lawful
    await must(rig.custody.markNoOpen(rig.proof));
  });
});
