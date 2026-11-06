/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw journal lines */
// H-07 S3-I1 regression (BLUE hold on PR #97): the strict replay's derived evaluator (cached canonical fact bytes, key order and SHA-256
// prefix states) is replay-only. Every loader that replays must drop it when its replay ends, so that NO opened handle, read-only or
// otherwise, and no closed one, retains it. The retention is observed deterministically (what each evaluator holds), never by GC timing.
// Synthetic disposable packages only; no live campaign, host, model or provider.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OwnerFact } from "@immortalis/contracts";
import {
  createFileCampaign,
  emptyState,
  openFileCampaign,
  stateSha256,
  type FileCampaignStore,
} from "@immortalis/engine";
import { group, write } from "@immortalis/testkit";
import { IncrementalStateDigest } from "../../packages/engine/src/commit/state-digest.ts";
import {
  NEW_POLICY_ID,
  OLD_POLICY_ID,
  POLICY_CAMPAIGN,
  optionsFor,
  oracleStateDigests,
  policyAdmission,
  seedFs,
  seedGrowth,
} from "../support/policy-transition.ts";
import { must } from "../support/temporal.ts";
import { copyDir, tempDir } from "../support/tmp.ts";

const chained = (n: number) => (n > 1 ? { depends_on: [`group-${n - 1}`] } : {});
const next = (n: number) =>
  group(
    POLICY_CAMPAIGN,
    n,
    [write(`future/${String(n).padStart(6, "0")}`, { after: "open" })],
    chained(n),
  );
const journalText = (dir: string) => readFileSync(join(dir, "journal.jsonl"), "utf8");
const manifestBytes = (dir: string) => readFileSync(join(dir, "manifest.json"));
const entriesOf = (dir: string) =>
  journalText(dir)
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as { group: any; receipt: any; entry_sha256: string });

/** Every evaluator that served the action, with how often it was asked and what it still holds when the action returns. */
async function observed<T>(action: () => Promise<T>) {
  const digest = IncrementalStateDigest.prototype.digest;
  const instances = new Set<IncrementalStateDigest>();
  IncrementalStateDigest.prototype.digest = function (this: IncrementalStateDigest, ...args) {
    instances.add(this);
    return digest.apply(this, args);
  };
  try {
    const result = await action();
    return { result, evaluators: [...instances] };
  } finally {
    IncrementalStateDigest.prototype.digest = digest;
  }
}
const retainedNothing = (evaluators: readonly IncrementalStateDigest[]) =>
  evaluators.map((e) => e.retained);

/** A v1 package: `count` growing-state entries written by the retained legacy writer (original v1 bytes), closed cleanly. */
async function seedV1(count: number): Promise<string> {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: POLICY_CAMPAIGN,
      legacyFormat: true,
      ...optionsFor(policyAdmission(OLD_POLICY_ID).admission, { fs: seedFs }),
    }),
  );
  for (let n = 1; n <= count; n++)
    await must(
      store.commit(
        group(
          POLICY_CAMPAIGN,
          n,
          [
            write(`legacy/${String((n * 7919) % 100003).padStart(6, "0")}`, {
              n,
              pad: "é".repeat(n % 50),
            }),
          ],
          chained(n),
        ),
      ),
    );
  await store.close();
  return dir;
}

describe("H-07 S3-I1: the replay-only evaluator is released by every loader that replays", () => {
  const N = 150;

  it("a read-only legacy v1 handle does not retain it: open, reopen and close leave every canonical result unchanged", async () => {
    const dir = await seedV1(N);
    const originalJournal = journalText(dir);
    const originalManifest = manifestBytes(dir);
    const recorded = entriesOf(dir);
    expect(JSON.parse(originalManifest.toString("utf8")).format_version).toBe(1);

    const open = () =>
      openFileCampaign(dir, {
        ...optionsFor(policyAdmission(OLD_POLICY_ID).admission),
        legacyFormat: true,
      });
    const first = await observed(() => must(open()));
    // the strict historical replay really ran through the evaluator (one build, every entry, no fallback)...
    expect(first.evaluators).toHaveLength(1);
    expect(first.evaluators[0]!.stats).toEqual({ digests: N, rebuilds: 1, fallbacks: 0 });
    // ...and nothing it cached survives the replay, while the handle is still open and read-only
    expect(retainedNothing(first.evaluators)).toEqual([{ facts: 0, prefixStates: 0 }]);
    const store = first.result;
    const identity = {
      head: store.head(),
      facts: store.listFacts(),
      receipts: recorded.map((e) => store.lookupReceipt(e.group.intent_id)),
      groups: recorded.map((e) => store.committedGroupById!(e.group.group_id)),
    };
    expect(identity.receipts).toEqual(recorded.map((e) => e.receipt));
    expect(identity.groups).toEqual(recorded.map((e) => e.group));
    expect(identity.head.journal_head_sha256).toBe(recorded[N - 1]!.entry_sha256);
    expect(identity.head.state_sha256).toBe(recorded[N - 1]!.receipt.state_sha256);
    // a read-only open writes nothing
    expect(journalText(dir)).toBe(originalJournal);
    expect(manifestBytes(dir).equals(originalManifest)).toBe(true);
    await store.close();
    expect(retainedNothing(first.evaluators)).toEqual([{ facts: 0, prefixStates: 0 }]); // and none after close

    // reopen: a fresh handle replays again, releases again, and is identical
    const again = await observed(() => must(open()));
    expect(again.evaluators).toHaveLength(1);
    expect(again.evaluators[0]).not.toBe(first.evaluators[0]);
    expect(retainedNothing(again.evaluators)).toEqual([{ facts: 0, prefixStates: 0 }]);
    expect(again.result.head()).toEqual(identity.head);
    expect(again.result.listFacts()).toEqual(identity.facts);
    await again.result.close();
    expect(journalText(dir)).toBe(originalJournal);
    expect(manifestBytes(dir).equals(originalManifest)).toBe(true);
  });

  it("a later lawful commit on the same legacy handle is exact: independent digest, idempotent, refused when altered", async () => {
    const dir = await seedV1(N);
    const originalJournal = journalText(dir);
    const observedOpen = await observed(() =>
      must(
        openFileCampaign(dir, {
          ...optionsFor(policyAdmission(OLD_POLICY_ID).admission),
          legacyFormat: true,
        }),
      ),
    );
    const store = observedOpen.result;
    expect(retainedNothing(observedOpen.evaluators)).toEqual([{ facts: 0, prefixStates: 0 }]);
    const committed = await must(store.commit(next(N + 1)));
    expect(committed.replayed).toBe(false);
    expect(committed.receipt.revision).toBe(N + 1);
    expect(await must(store.commit(next(N + 1)))).toEqual({
      receipt: committed.receipt,
      replayed: true,
    });
    expect(await store.commit({ ...next(N + 1), cause: "changed" })).toMatchObject({
      ok: false,
      error: { code: "INTENT_CONFLICT" },
    });
    await store.close();
    // the journal only grew; the new receipt's full-state digest is the specification's, by a definition sharing no code with the core
    expect(journalText(dir).startsWith(originalJournal)).toBe(true);
    const after = journalText(dir);
    expect(oracleStateDigests(after, new Set([N + 1])).get(N + 1)).toBe(
      committed.receipt.state_sha256,
    );
    // a further read-only open (which strictly replays N + 1 entries) accepts it and still retains nothing
    const reopened = await observed(() =>
      must(
        openFileCampaign(dir, {
          ...optionsFor(policyAdmission(OLD_POLICY_ID).admission),
          legacyFormat: true,
        }),
      ),
    );
    expect(reopened.evaluators[0]!.stats.digests).toBe(N + 1);
    expect(retainedNothing(reopened.evaluators)).toEqual([{ facts: 0, prefixStates: 0 }]);
    expect(reopened.result.lookupReceipt(`intent-${N + 1}`)).toEqual(committed.receipt);
    await reopened.result.close();
  });

  it("the migrating v1 open, and a v1 package opened for a v2 transition, also leave nothing retained", async () => {
    const dir = await seedV1(N);
    const originalJournal = journalText(dir);
    const migrated = await observed(() =>
      must(openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission))),
    );
    // the v1 strict replay and the audit of the successor each used an evaluator; none is held by anything that remains
    expect(migrated.evaluators.length).toBeGreaterThanOrEqual(1);
    expect(
      retainedNothing(migrated.evaluators).every((r) => r.facts === 0 && r.prefixStates === 0),
    ).toBe(true);
    expect(migrated.result.head().journal_entries).toBe(N);
    expect(journalText(dir)).toBe(originalJournal);
    await migrated.result.close();
  });
});

describe("H-07 S3-I1: every other replay owner releases it too", () => {
  const N = 260;
  const cases: [string, (dir: string) => Promise<FileCampaignStore>][] = [
    [
      "ordinary v2 reopen (bounded tail)",
      (d) => must(openFileCampaign(d, optionsFor(policyAdmission(OLD_POLICY_ID).admission))),
    ],
    [
      "v2 strict audit",
      (d) =>
        must(
          openFileCampaign(
            d,
            optionsFor(policyAdmission(OLD_POLICY_ID).admission, { audit: true }),
          ),
        ),
    ],
    [
      "v2 policy transition (changed history-verification policy)",
      (d) => must(openFileCampaign(d, optionsFor(policyAdmission(NEW_POLICY_ID).admission))),
    ],
    [
      "v2 transition requested with an audit as well",
      (d) =>
        must(
          openFileCampaign(
            d,
            optionsFor(policyAdmission(NEW_POLICY_ID).admission, { audit: true }),
          ),
        ),
    ],
    [
      "v2 open that does not trust the verifier (no policy identity)",
      (d) => must(openFileCampaign(d, optionsFor(policyAdmission(undefined).admission))),
    ],
  ];
  it.each(cases)("%s", async (_name, open) => {
    const dir = copyDir(await seedGrowth(N, 3));
    const opened = await observed(() => open(dir));
    expect(opened.evaluators.length).toBeGreaterThanOrEqual(1);
    expect(
      retainedNothing(opened.evaluators).every((r) => r.facts === 0 && r.prefixStates === 0),
    ).toBe(true);
    expect(opened.result.head().journal_entries).toBe(N);
    await opened.result.close();
    expect(
      retainedNothing(opened.evaluators).every((r) => r.facts === 0 && r.prefixStates === 0),
    ).toBe(true);
  });

  it("the diagnostic is honest: an evaluator that has digested holds its cache, and release returns all of it", () => {
    const fact = {
      key: "k",
      owner: "TEST-OWNER-A",
      facet: "test-facet",
      value: 1,
      unit: null,
      basis: "b",
      secrecy: "s",
      version: 1,
      provenance: {
        group_id: "g",
        intent_id: "i",
        cause: "c",
        rule: {
          artifact: "a",
          native_pin: "p",
          clause: "c",
          authority_lineage: ["l"],
          effective_basis: "e",
          supersedes: null,
        },
      },
    } as OwnerFact;
    const evaluator = new IncrementalStateDigest();
    expect(evaluator.retained).toEqual({ facts: 0, prefixStates: 0 });
    const pre = emptyState("c");
    const after = { campaign_id: "c", revision: 1, facts: new Map([["k", fact]]) };
    evaluator.digest(pre, after, [fact], stateSha256);
    expect(evaluator.retained).toEqual({ facts: 1, prefixStates: 1 });
    evaluator.release();
    expect(evaluator.retained).toEqual({ facts: 0, prefixStates: 0 });
  });
});
