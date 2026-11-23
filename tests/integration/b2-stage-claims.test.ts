/* eslint-disable @typescript-eslint/no-explicit-any -- groups are edited field by field and rejections are read by `details.reason` */
// F-014B B2 repair of BLUE review findings F-1 and F-2 (PR #135, exact head e76e464f) — ADVERSARIAL twins, live and historical.
//
//   F-1  A group of an extension owner that merely CARRIES the cause of X's transaction and a dependency on X's committed opening must not pass the W2
//        fence as "a stage of X": nothing independently shows it is an actually due, owner-declared StageKey of X, and this build has no source witness for
//        one (no due roster, no B3 writer). The stage branch is therefore CLOSED: while a wait is ACTIVE only X's own seal is admitted, and any claim to be a
//        stage is refused, ahead of every owner rule and every extension early return, live and in original-policy historical verification.
//   F-2  At MARKED (the marker committed, no OPEN) the ACTIVE fence has not engaged, so the same claim, hung from the marker, must ALSO be refused, or a later
//        NO_OPEN would certify the absence of OPEN and seal over a lineage that contains a stage claim. The one common predicate refuses it at EVERY moment,
//        so "no stage of X before OPEN" holds by construction at admission (no journal scan, no read of the hidden future).
//
// Each negative is the accepted control with ONE change; every refusal is asserted to change nothing (head, facts, receipts, clock); every historical twin is a
// hash-consistent forged journal (correct chain, receipts and state digests) that only the rules of replay can refuse. SCRIPTED TESTKIT MECHANISM ONLY.
// The POSITIVE twin of an owner stage ("a true source-declared, due stage of X") is UNRUN: no such stage exists in this build, and it is not fabricated.
import { describe, expect, it } from "vitest";
import {
  TemporalStateSchema,
  temporalGmWaitByPcKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { buildNoOpenGroup, deriveGmWaitFence, type CampaignStore } from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  FIXTURE_PC_ID,
  SYNTH_OWNER,
  T0,
  TARGET,
  TEMPORAL_STATE_KEY,
  authorityGroupOf,
  copyPackage,
  foreignGroup,
  forgeAppend,
  journalOf,
  lifecycle,
  must,
  reopen,
  seededRig,
  stageClaim,
  tempDir,
  txOf,
} from "./b2-support.ts";

/** A snapshot that a refusal must leave exactly as it found it. */
const witness = (store: CampaignStore) => ({
  head: store.head(),
  facts: JSON.stringify(store.listFacts()),
});
const clockOf = (store: CampaignStore) =>
  TemporalStateSchema.parse(store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time;

/** A refused commit: the reason it gave, with the proof that nothing at all changed. */
const refusedWith = async (
  store: CampaignStore,
  group: CommitGroup,
): Promise<string | undefined> => {
  const before = witness(store);
  const r = await store.commit(group);
  expect(r.ok, `${group.group_id} must be refused`).toBe(false);
  if (r.ok) throw new Error("unreachable");
  expect(witness(store), "a refusal changes no state, clock, receipt or custody").toEqual(before);
  expect(store.lookupReceipt(group.intent_id)).toBeNull();
  return (r.error.details as { reason?: string } | undefined)?.reason;
};

const UNSOURCED = "GM_WAIT_STAGE_CLAIM_UNSOURCED";

/**
 * The BLUE falsifier, verbatim: the existing `foreignGroup(n)` with ONLY its `cause` changed to X's transaction cause and its `depends_on` changed to
 * include the committed group id it claims to hang from. Its identity (group and intent ids) and its unrelated key are preserved.
 */
const disguised = (n: number, x: string, hangsFrom: string): CommitGroup => ({
  ...foreignGroup(n),
  cause: `transaction:${txOf(x)}`,
  depends_on: [...foreignGroup(n).depends_on, hangsFrom],
});

/** the reconstruction a reviewer would do: every group in the journal that names a GM wait and is not a kernel custody or seal group */
const namingGroups = (dir: string): string[] =>
  journalOf(dir)
    .map((e) => e.group)
    .filter(
      (g) =>
        (/^(?:transaction:)?gm-wait:/.test(g.cause) ||
          g.depends_on.some((d) =>
            /^(?:gm-wait-(?:marker|open|no-open|reconcile)-group:|transaction-group:gm-wait:)/.test(
              d,
            ),
          )) &&
        !g.writes.some((w) => w.key.startsWith("temporal/")),
    )
    .map((g) => g.group_id);

describe("B2 F-1 (live): a disguised stage of an ACTIVE wait is refused, an extension-owner commit changes nothing", () => {
  it("the BLUE falsifier: foreignGroup(n) with ONLY the X cause and a dependency on the committed OPEN is refused; its twins are refused on the same rule; the own seal is the positive twin", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open"); // a genuine TESTKIT marker and a separate OPEN
    const open = authorityGroupOf(rig.store, x);
    expect(open).toBe(`gm-wait-open-group:${x}`);
    expect(deriveGmWaitFence(rig.store.canonicalState!()).active?.x).toBe(x);
    const clock = clockOf(rig.store);

    expect(await refusedWith(rig.store, disguised(1, x, open))).toBe(UNSOURCED);
    // one change at a time from that group: the cause alone, and the dependency alone
    expect(
      await refusedWith(rig.store, { ...foreignGroup(2), cause: `transaction:${txOf(x)}` }),
    ).toBe(UNSOURCED);
    expect(await refusedWith(rig.store, { ...foreignGroup(3), depends_on: [open] })).toBe(
      UNSOURCED,
    );
    // the same claim from a dependency on the marker's group, and under the cause namespace of the custody groups
    expect(await refusedWith(rig.store, disguised(4, x, `gm-wait-marker-group:${x}`))).toBe(
      UNSOURCED,
    );
    expect(await refusedWith(rig.store, { ...foreignGroup(5), cause: `gm-wait:${x}` })).toBe(
      UNSOURCED,
    );
    // the stage-shaped group of the helper, with its identity derived like a StageKey's
    expect(await refusedWith(rig.store, stageClaim(x, open, 6))).toBe(UNSOURCED);
    // the control: with neither claim it is merely foreign, and the ACTIVE fence refuses it for THAT reason
    expect(await refusedWith(rig.store, foreignGroup(7))).toBe("GM_WAIT_ACTIVE_FOREIGN");

    expect(clockOf(rig.store)).toEqual(clock);
    expect(clockOf(rig.store)).toEqual(T0);
    // the positive twin: X's own zero-stage seal is admitted, and it credits the time once
    await must(rig.custody.sealOwn(x));
    expect(clockOf(rig.store)).toEqual(TARGET);
    expect([...rig.campaign.verify()]).toEqual([]);
    // and the claim is no more sourced once the wait is finished
    expect(await refusedWith(rig.store, disguised(1, x, open))).toBe(UNSOURCED);
    expect(namingGroups(rig.dir), "no group of the journal but the kernel's own names X").toEqual(
      [],
    );
  });

  it("a CANONICAL owner's group carrying the claim is refused too, by the owner admission itself: the fence precedes every owner rule, so it is not an extension-only gap", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const state = rig.store.canonicalState!();
    // a real canonical owner and facet of this campaign (the world owner's own committed fact), under the claim; the owner admission is called directly,
    // so no structural check of the commit core can answer first
    const fact = rig.store
      .listFacts()
      .find((f) => f.owner !== "temporal_kernel" && f.owner !== SYNTH_OWNER)!;
    const base = disguised(1, x, authorityGroupOf(rig.store, x));
    const canonical: CommitGroup = { ...base, owner: fact.owner, facet: fact.facet };
    expect(canonical.owner).not.toBe(base.owner);
    const reason = (r: unknown) => (r as any)?.details?.reason;
    expect(reason(FIXTURE_ADMISSION.check(canonical, state, undefined))).toBe(UNSOURCED);
    expect(reason(FIXTURE_ADMISSION.verifyHistorical?.(canonical, state))).toBe(UNSOURCED);
    // the control: the same group with neither claim is merely foreign to the ACTIVE wait, and is refused for THAT reason
    const owned = FIXTURE_ADMISSION.check(
      { ...canonical, cause: "plain-cause", depends_on: [] },
      state,
      undefined,
    );
    expect(reason(owned)).toBe("GM_WAIT_ACTIVE_FOREIGN");
  });

  it("a claim does not become lawful because a replayed identical group answers from its receipt: an identical committed custody group is still a read, and a claim never had a receipt", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const claim = disguised(1, x, authorityGroupOf(rig.store, x));
    expect(await refusedWith(rig.store, claim)).toBe(UNSOURCED);
    // the retry is refused again: a refusal leaves no receipt to be answered from
    expect(await refusedWith(rig.store, claim)).toBe(UNSOURCED);
    const again = await must(
      rig.store.commit(rig.store.committedGroup(`gm-wait-open-intent:${x}`)!),
    );
    expect(again.replayed).toBe(true);
  });
});

describe("B2 F-1 (historical): a forged journal that holds a disguised stage is refused by replay on its own rules", () => {
  /** reopens a forged package: it must NOT open, and the refusal is the strict replay's own, at the entry that claims */
  const mustNotOpen = async (dir: string, what: string) => {
    const r = await reopen(dir, FIXTURE_ADMISSION, { audit: true });
    expect(r.ok, what).toBe(false);
    return (r as any).error as { code: string; message: string };
  };

  it("inside the ACTIVE interval: a hash-consistent journal with the disguised stage appended is refused, while the same package without it opens (control)", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const open = authorityGroupOf(rig.store, x);
    await rig.campaign.close();

    // control: the package as committed opens cold and strict
    const control = await reopen(copyPackage(rig.dir), FIXTURE_ADMISSION, { audit: true });
    expect(control.ok, JSON.stringify((control as any).error)).toBe(true);
    if (control.ok) await control.value.close();

    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [disguised(1, x, open)]);
    // the forged package is internally consistent: the chain, the receipts and the head agree, and the forged entry is the last
    const forged = journalOf(dir);
    expect(forged.at(-1)!.group.group_id).toBe(foreignGroup(1).group_id);
    expect(forged.at(-1)!.group.cause).toBe(`transaction:${txOf(x)}`);
    const error = await mustNotOpen(dir, "a disguised stage inside the ACTIVE interval");
    expect(error.code).toBe("REPLAY_MISMATCH");
    expect(error.message).toMatch(/not a valid transition: KEY_NOT_ADMITTED/);
  });

  it("after the seal: the claim is as unsourced in history as it is live (a finished wait is no source for a stage)", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "seal");
    const open = authorityGroupOf(rig.store, x);
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [disguised(1, x, open)]);
    expect((await mustNotOpen(dir, "a disguised stage after the seal")).code).toBe(
      "REPLAY_MISMATCH",
    );
  });

  it("strict preservation: only the exact X-shaped identity is judged in replay, so an older history that names something merely similar still opens", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "seal");
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    // a cause that begins like the namespace but is not an X (not 64 lowercase hex): live it is refused, historically it is ordinary valid history
    const similar: CommitGroup = { ...foreignGroup(9), cause: "transaction:gm-wait:short" };
    forgeAppend(dir, [similar]);
    const r = await reopen(dir, FIXTURE_ADMISSION, { audit: true });
    expect(r.ok, JSON.stringify((r as any).error)).toBe(true);
    if (r.ok) {
      expect(
        await refusedWith(r.value.store, {
          ...foreignGroup(10),
          cause: "transaction:gm-wait:short",
        }),
      ).toBe(UNSOURCED);
      await r.value.close();
    }
  });
});

describe("B2 F-2: a claim at MARKED, and the NO_OPEN that must not certify over it", () => {
  const marked = async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "marker"); // marker-only original state: no OPEN exists
    expect(deriveGmWaitFence(rig.store.canonicalState!()).active).toBeNull();
    return { rig, x, marker: `gm-wait-marker-group:${x}` };
  };

  it("[live] an extension-owner group with the X cause and a dependency on the MARKER is refused before any OPEN; the clean same-X NO_OPEN is then admitted and its certificate is true", async () => {
    const { rig, x, marker } = await marked();
    expect(await refusedWith(rig.store, disguised(1, x, marker))).toBe(UNSOURCED);
    expect(await refusedWith(rig.store, { ...foreignGroup(2), depends_on: [marker] })).toBe(
      UNSOURCED,
    );
    expect(
      await refusedWith(rig.store, { ...foreignGroup(3), cause: `transaction:${txOf(x)}` }),
    ).toBe(UNSOURCED);
    // ordinary traffic is still not fenced before OPEN (the marker alone activates nothing)
    await must(rig.store.commit(foreignGroup(4)));

    // the positive: the original same-X NO_OPEN, with the verified origin proof
    const noOpen = await must(rig.custody.markNoOpen(rig.proof));
    expect(noOpen.replayed).toBe(false);
    expect((rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.value as any).state).toBe(
      "NO_OPEN",
    );
    expect(rig.store.getFact(`temporal/transaction-authority/${txOf(x)}`)).toBeUndefined();
    expect(rig.store.getFact(`temporal/transaction/${txOf(x)}`)).toBeUndefined();
    // and the certificate is TRUE at the journal level: no group in the whole journal but the kernel's own names X
    expect(namingGroups(rig.dir)).toEqual([]);
    expect([...rig.campaign.verify()]).toEqual([]);
  });

  it("[historical twin] a hash-consistent journal that holds marker, a stage claim and a NO_OPEN built over the claim is refused at the CLAIM; marker then NO_OPEN opens (control)", async () => {
    // control: marker, then the NO_OPEN, committed lawfully, reopens cold and strict
    const clean = await marked();
    await must(clean.rig.custody.markNoOpen(clean.rig.proof));
    await clean.rig.campaign.close();
    const controlOpen = await reopen(copyPackage(clean.rig.dir), FIXTURE_ADMISSION, {
      audit: true,
    });
    expect(controlOpen.ok, JSON.stringify((controlOpen as any).error)).toBe(true);
    if (controlOpen.ok) await controlOpen.value.close();

    // the forged lineage: the claim first, then the lawful NO_OPEN group (its own reads and certificate are valid at ITS prestate)
    const { rig, x, marker } = await marked();
    const noOpen = buildNoOpenGroup(
      { get: (k) => rig.store.getFact(k) },
      x,
      rig.store.head().revision + 1,
    );
    if (!noOpen.ok) throw new Error(JSON.stringify(noOpen.error));
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [disguised(1, x, marker), noOpen.value]);
    const entries = journalOf(dir);
    expect(entries.slice(-2).map((e) => e.group.group_id)).toEqual([
      foreignGroup(1).group_id,
      noOpen.value.group_id,
    ]);
    const r = await reopen(dir, FIXTURE_ADMISSION, { audit: true });
    expect(r.ok, "a NO_OPEN over a stage claim must not replay").toBe(false);
    expect((r as any).error.code).toBe("REPLAY_MISMATCH");
    expect((r as any).error.message).toMatch(/not a valid transition: KEY_NOT_ADMITTED/);
  });

  it("[historical twin] the claim alone, forged at MARKED with no NO_OPEN after it, is refused too: replay does not wait for a certificate to notice", async () => {
    const { rig, x, marker } = await marked();
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [disguised(1, x, marker)]);
    const r = await reopen(dir, FIXTURE_ADMISSION, { audit: true });
    expect(r.ok).toBe(false);
    expect((r as any).error.code).toBe("REPLAY_MISMATCH");
  });
});
