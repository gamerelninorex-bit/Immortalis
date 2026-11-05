// H-07 S3 MECHANISM evidence: the incremental canonical-state digest used by the strict historical replay must produce, at EVERY
// revision, the byte-for-byte SHA-256 the unchanged reference (`stateSha256`) produces, and must never turn a tampered history into
// an accepted one. Synthetic, deterministic data only; no host, model, provider or live campaign.
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  type CommitGroup,
  type JournalEntry,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CampaignCore,
  emptyState,
  entryHash,
  sha256Canonical,
  stateSha256,
  stateToFile,
  type CampaignState,
} from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";
import {
  IncrementalStateDigest,
  STATE_DIGEST_STRIDE,
} from "../../packages/engine/src/commit/state-digest.ts";

const SPEC = "a".repeat(64);
const GENESIS = "b".repeat(64);
const CAMPAIGN = "digest-campaign";
const freshCore = () =>
  new CampaignCore({
    campaignId: CAMPAIGN,
    specLockSha256: SPEC,
    owners: TEST_OWNERS,
    state: emptyState(CAMPAIGN),
    headSha256: GENESIS,
  });

/** mulberry32: a small deterministic PRNG so every run builds the identical histories. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Keys whose UTF-16 code-unit order differs from their code-point order, plus separators and case: the order is the reference's `<`.
const AWKWARD_KEYS = [
  "a",
  "a/b",
  "a\u0080",
  "A",
  "Z",
  "z",
  "0",
  "~",
  "é",
  "퟿",
  "",
  "｡",
  "\u{1F600}",
  "\u{10FFFF}",
  "key with spaces",
  '"quoted"',
];

const valueOf = (rand: () => number, n: number): CommitGroup["writes"][number]["value"] => {
  const pick = Math.floor(rand() * 5);
  if (pick === 0) return n;
  if (pick === 1) return `value-${n}-${"é\u{1F600}".repeat(Math.floor(rand() * 40))}`;
  if (pick === 2) return { z: n, a: [n, { y: 1, b: null }], m: { q: true, c: false } };
  if (pick === 3) return [n, "x".repeat(Math.floor(rand() * 400)), null];
  return { text: "pad".repeat(Math.floor(rand() * 200)), n };
};

type Plan = (n: number, state: CampaignState, rand: () => number) => string[];
const pad = (i: number) => String(i).padStart(6, "0");

/** How each step chooses the key(s) it writes: appending late, appending early, random, overwriting early/middle/late, mixed. */
const PLANS: Record<string, Plan> = {
  "append at the end of the order": (n) => [`k/${pad(n)}`],
  "insert at the front of the order": (n) => [`k/${pad(1_000_000 - n)}`],
  "insert anywhere": (_n, _s, rand) => [`k/${pad(Math.floor(rand() * 1e6))}`],
  "overwrite the first existing key": (n, s) =>
    n <= 6 ? [`k/${pad(n)}`] : [[...s.facts.keys()].sort()[0]!],
  "overwrite a middle key": (n, s) => {
    const keys = [...s.facts.keys()].sort();
    return n <= 6 ? [`k/${pad(n)}`] : [keys[Math.floor(keys.length / 2)]!];
  },
  "overwrite the last key": (n, s) => {
    const keys = [...s.facts.keys()].sort();
    return n <= 6 ? [`k/${pad(n)}`] : [keys[keys.length - 1]!];
  },
  "several writes at once": (_n, s, rand) => {
    const keys = [...s.facts.keys()].sort();
    const count = 1 + Math.floor(rand() * 5);
    const out = new Set<string>();
    for (let i = 0; i < count; i++)
      out.add(
        keys.length && rand() < 0.5
          ? keys[Math.floor(rand() * keys.length)]!
          : AWKWARD_KEYS[Math.floor(rand() * AWKWARD_KEYS.length)]! + pad(Math.floor(rand() * 50)),
      );
    return [...out];
  },
  "awkward key order": (_n, s, rand) => {
    void s;
    return [AWKWARD_KEYS[Math.floor(rand() * AWKWARD_KEYS.length)]!];
  },
};

/** Builds a committed history through the ordinary live path (the unchanged reference digest) and returns the journal. */
function buildJournal(plan: Plan, steps: number, seed: number): JournalEntry[] {
  const rand = prng(seed);
  const core = freshCore();
  const journal: JournalEntry[] = [];
  for (let n = 1; n <= steps; n++) {
    const keys = plan(n, core.state, rand);
    const prepared = core.prepare(
      group(
        CAMPAIGN,
        n,
        keys.map((key) =>
          write(key, valueOf(rand, n), {
            expected_version: core.state.facts.get(key)?.version ?? 0,
          }),
        ),
      ),
    );
    if (!prepared.ok || prepared.value.kind !== "apply")
      throw new Error(`fixture step ${n} refused: ${JSON.stringify(prepared)}`);
    core.accept(prepared.value);
    journal.push(prepared.value.entry);
  }
  return journal;
}

describe("incremental canonical-state digest (H-07 S3)", () => {
  describe("positive: the exact reference SHA-256 at every revision", () => {
    for (const [name, plan] of Object.entries(PLANS)) {
      it(`replay re-derives every receipt: ${name}`, () => {
        const steps = STATE_DIGEST_STRIDE * 3 + 7;
        const journal = buildJournal(plan, steps, 7);
        const replayer = freshCore();
        for (const entry of journal) {
          const replayed = replayer.replay(entry);
          expect(replayed.ok, `revision ${entry.revision}`).toBe(true);
          // replay accepted the entry only because the recomputed receipt equals the recorded one; assert the digest directly too
          expect(stateSha256(replayer.state)).toBe(entry.receipt.state_sha256);
        }
        expect(replayer.state.revision).toBe(steps);
        expect(replayer.headSha256).toBe(journal[journal.length - 1]!.entry_sha256);
      });
    }

    it.each([1, 2, 3, 5, 8, 13, 31, 32, 33, 63, 64, 65, 96, 97, 128, 130])(
      "%i growing steps, one key after another, straddle every prefix boundary",
      (steps) => {
        const journal = buildJournal(PLANS["insert anywhere"]!, steps, steps);
        const replayer = freshCore();
        for (const entry of journal) expect(replayer.replay(entry).ok).toBe(true);
        expect(stateSha256(replayer.state)).toBe(journal[journal.length - 1]!.receipt.state_sha256);
      },
    );

    it("agrees with the reference for many seeds and the mixed plan", () => {
      for (let seed = 1; seed <= 25; seed++) {
        const journal = buildJournal(PLANS["several writes at once"]!, 90, seed);
        const replayer = freshCore();
        for (const entry of journal) expect(replayer.replay(entry).ok, `seed ${seed}`).toBe(true);
      }
    });

    it("produces the identical receipts, chain and final bytes as the live path (journal re-derived whole)", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 150, 99);
      const replayer = freshCore();
      for (const entry of journal) expect(replayer.replay(entry).ok).toBe(true);
      const rebuilt = replayer.state;
      const live = freshCore();
      for (const entry of journal) {
        const prepared = live.prepare(entry.group);
        if (!prepared.ok || prepared.value.kind !== "apply") throw new Error("live refused");
        expect(canonicalJson(prepared.value.entry)).toBe(canonicalJson(entry));
        live.accept(prepared.value);
      }
      expect(canonicalJson(stateToFile(rebuilt))).toBe(canonicalJson(stateToFile(live.state)));
    });
  });

  describe("the digest object itself", () => {
    const factOf = (key: string, version = 1, value: unknown = key): OwnerFact =>
      ({
        key,
        owner: "TEST-OWNER-A",
        facet: "test-facet",
        value,
        unit: null,
        basis: "test-basis",
        secrecy: "test-secrecy",
        version,
        provenance: {
          group_id: `g-${key}`,
          intent_id: `i-${key}`,
          cause: "c",
          rule: {
            artifact: "test://synthetic-rule",
            native_pin: "p",
            clause: "c",
            authority_lineage: ["l"],
            effective_basis: "b",
            supersedes: null,
          },
        },
      }) as OwnerFact;
    const step = (state: CampaignState, written: OwnerFact[]): CampaignState => {
      const facts = new Map(state.facts);
      for (const f of written) facts.set(f.key, f);
      return { campaign_id: state.campaign_id, revision: state.revision + 1, facts };
    };

    it("matches the reference over a long mixed sequence and rebuilds only once", () => {
      const digest = new IncrementalStateDigest();
      let state = emptyState(CAMPAIGN);
      const rand = prng(5);
      for (let i = 0; i < 400; i++) {
        const keys = new Set<string>();
        for (let j = 0, c = 1 + Math.floor(rand() * 4); j < c; j++)
          keys.add(`k${pad(Math.floor(rand() * 300))}`);
        const written = [...keys].map((k) =>
          factOf(k, (state.facts.get(k)?.version ?? 0) + 1, { i, k }),
        );
        const next = step(state, written);
        expect(digest.digest(state, next, written, stateSha256)).toBe(stateSha256(next));
        state = next;
      }
      expect(digest.stats).toEqual({ digests: 400, rebuilds: 1, fallbacks: 0 });
    });

    it("an empty state, an empty step and a step that writes nothing", () => {
      const digest = new IncrementalStateDigest();
      const empty = emptyState(CAMPAIGN);
      const next = { ...empty, revision: 1 };
      expect(digest.digest(empty, next, [], stateSha256)).toBe(stateSha256(next));
      const after = step(next, [factOf("only")]);
      expect(digest.digest(next, after, [factOf("only")], stateSha256)).toBe(stateSha256(after));
      const quiet = { ...after, revision: 3 };
      expect(digest.digest(after, quiet, [], stateSha256)).toBe(stateSha256(quiet));
    });

    it("rebuilds from the state it is handed when it is not the one it last produced", () => {
      const digest = new IncrementalStateDigest();
      let state = emptyState(CAMPAIGN);
      const history: CampaignState[] = [state];
      for (let i = 0; i < 70; i++) {
        const written = [factOf(`k${pad((i * 7919) % 101)}`, i + 1, i)];
        const next = step(state, written);
        expect(digest.digest(state, next, written, stateSha256)).toBe(stateSha256(next));
        history.push(next);
        state = next;
      }
      // go back to an earlier state: the cached order belongs to a later one, so it must not be reused
      const earlier = history[20]!;
      const written = [factOf("k-new", 1, "x")];
      const branched = step(earlier, written);
      expect(digest.digest(earlier, branched, written, stateSha256)).toBe(stateSha256(branched));
      expect(digest.stats.rebuilds).toBe(2);
      // a different campaign identity cannot reuse another's header
      const other = { ...emptyState("another-campaign"), revision: 0 };
      const otherNext = step(other, [factOf("k1")]);
      expect(digest.digest(other, otherNext, [factOf("k1")], stateSha256)).toBe(
        stateSha256(otherNext),
      );
    });

    it("falls back to the reference when the Map key is not the fact key, or `written` does not describe the step", () => {
      const digest = new IncrementalStateDigest();
      const odd: CampaignState = {
        campaign_id: CAMPAIGN,
        revision: 4,
        facts: new Map([["map-key", factOf("fact-key")]]),
      };
      const next = step(odd, [factOf("b")]);
      expect(digest.digest(odd, next, [factOf("b")], stateSha256)).toBe(stateSha256(next));
      expect(digest.stats.fallbacks).toBe(1);

      const good = step(emptyState(CAMPAIGN), [factOf("a"), factOf("c")]);
      const claimed = step(good, [factOf("b")]);
      // `written` omits a fact the next state really holds: the digest must follow the state, not the claim
      const actual = step(claimed, [factOf("d")]);
      expect(digest.digest(claimed, actual, [], stateSha256)).toBe(stateSha256(actual));
    });

    it("a next state of another campaign never inherits the aligned header", () => {
      const digest = new IncrementalStateDigest();
      const empty = emptyState(CAMPAIGN);
      const aligned = step(empty, [factOf("a")]);
      expect(digest.digest(empty, aligned, [factOf("a")], stateSha256)).toBe(stateSha256(aligned));
      const renamed = { ...step(aligned, [factOf("b")]), campaign_id: "renamed-campaign" };
      expect(digest.digest(aligned, renamed, [factOf("b")], stateSha256)).toBe(
        stateSha256(renamed),
      );
      expect(digest.stats.fallbacks).toBe(1);
    });

    it("surfaces a serialisation failure exactly as the reference does, and recovers", () => {
      const digest = new IncrementalStateDigest();
      const base = step(emptyState(CAMPAIGN), [factOf("a")]);
      const poisoned = factOf("b", 1, Number.POSITIVE_INFINITY);
      const next = step(base, [poisoned]);
      expect(() => stateSha256(next)).toThrow(/non-finite/);
      expect(() => digest.digest(base, next, [poisoned], stateSha256)).toThrow(/non-finite/);
      const fine = step(base, [factOf("c")]);
      expect(digest.digest(base, fine, [factOf("c")], stateSha256)).toBe(stateSha256(fine));
    });

    it("release returns the memory and the next digest still agrees", () => {
      const digest = new IncrementalStateDigest();
      const a = step(emptyState(CAMPAIGN), [factOf("a")]);
      expect(digest.digest(emptyState(CAMPAIGN), a, [factOf("a")], stateSha256)).toBe(
        stateSha256(a),
      );
      digest.release();
      const b = step(a, [factOf("b")]);
      expect(digest.digest(a, b, [factOf("b")], stateSha256)).toBe(stateSha256(b));
      expect(digest.stats.rebuilds).toBe(2);
    });
  });

  describe("negative: a changed history is never accepted", () => {
    /** Re-seals an entry's chain hash so that ONLY the state digest can disagree. */
    const resealed = (entry: JournalEntry, mutate: (e: JournalEntry) => void): JournalEntry => {
      const copy = structuredClone(entry);
      mutate(copy);
      const { entry_sha256: old, ...rest } = copy;
      void old;
      return { ...rest, entry_sha256: entryHash(rest) };
    };
    const replayUntil = (journal: JournalEntry[], upTo: number) => {
      const core = freshCore();
      for (const entry of journal.slice(0, upTo)) expect(core.replay(entry).ok).toBe(true);
      return core;
    };

    it("refuses an altered receipt state_sha256 at an early, middle and late revision", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 140, 3);
      for (const at of [2, 33, 70, 140]) {
        const core = replayUntil(journal, at - 1);
        const entry = journal[at - 1]!;
        const flipped = `${entry.receipt.state_sha256[0] === "0" ? "1" : "0"}${entry.receipt.state_sha256.slice(1)}`;
        const bad = resealed(entry, (e) => {
          e.receipt.state_sha256 = flipped;
        });
        const result = core.replay(bad);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error.code).toBe("REPLAY_MISMATCH");
        expect(result.ok === false && result.error.message).toBe("recomputed entry differs");
        // the refusal left the replay where it was: the true entry still applies
        expect(core.replay(entry).ok).toBe(true);
      }
    });

    it("refuses a receipt computed over a different canonical byte order", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 80, 4);
      const core = replayUntil(journal, 79);
      const entry = journal[79]!;
      const file = stateToFile(core.state);
      void file;
      // what the digest would be if the facts were serialised in the opposite order
      const next = (() => {
        const probe = freshCore();
        for (const e of journal) probe.replay(e);
        return stateToFile(probe.state);
      })();
      const reversed = sha256Canonical({ ...next, facts: [...next.facts].reverse() });
      expect(reversed).not.toBe(entry.receipt.state_sha256);
      const bad = resealed(entry, (e) => {
        e.receipt.state_sha256 = reversed;
      });
      const result = core.replay(bad);
      expect(result.ok).toBe(false);
    });

    it.each(["first", "middle", "last"] as const)(
      "refuses a changed %s existing fact after the prefix hash states were built",
      (where) => {
        // enough distinct facts that several retained prefix states exist, then one overwrite of an existing key
        const prefix = buildJournal(
          PLANS["append at the end of the order"]!,
          STATE_DIGEST_STRIDE * 3,
          11,
        );
        const keys = prefix.map((e) => e.group.writes[0]!.key).sort();
        const key =
          where === "first"
            ? keys[0]!
            : where === "middle"
              ? keys[Math.floor(keys.length / 2)]!
              : keys[keys.length - 1]!;
        const source = freshCore();
        for (const e of prefix) expect(source.replay(e).ok).toBe(true);
        const next = source.prepare(
          group(CAMPAIGN, prefix.length + 1, [
            write(
              key,
              { rewritten: true },
              { expected_version: source.state.facts.get(key)!.version },
            ),
          ]),
        );
        if (!next.ok || next.value.kind !== "apply") throw new Error("overwrite refused");
        const genuine = next.value.entry;

        const replayer = freshCore();
        for (const e of prefix) expect(replayer.replay(e).ok).toBe(true);
        // the same entry with the overwritten value changed but the recorded receipt (and a re-sealed chain) left as it was
        const forged = resealed(genuine, (e) => {
          e.group.writes[0]!.value = { rewritten: "differently" };
        });
        const refused = replayer.replay(forged);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.error.message).toBe("recomputed entry differs");
        // and the genuine entry is accepted by the very same replayer
        expect(replayer.replay(genuine).ok).toBe(true);
        expect(stateSha256(replayer.state)).toBe(genuine.receipt.state_sha256);
      },
    );

    it("refuses a duplicated, skipped or reordered entry", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 40, 8);
      const core = replayUntil(journal, 20);
      expect(core.replay(journal[19]!).ok).toBe(false); // duplicate
      expect(core.replay(journal[21]!).ok).toBe(false); // skipped one
      expect(core.replay(journal[20]!).ok).toBe(true);
    });
  });

  describe("scope: only the strict replay uses it, and every other path is exactly as before", () => {
    it("a live commit (prepare/accept) never touches the incremental evaluator", () => {
      const real = IncrementalStateDigest.prototype.digest;
      let calls = 0;
      IncrementalStateDigest.prototype.digest = function (this: IncrementalStateDigest, ...a) {
        calls++;
        return real.apply(this, a);
      };
      try {
        const core = freshCore();
        for (let n = 1; n <= 40; n++) {
          const p = core.prepare(
            group(CAMPAIGN, n, [
              write(`live/${n % 7}`, n, {
                expected_version: core.state.facts.get(`live/${n % 7}`)?.version ?? 0,
              }),
            ]),
          );
          if (!p.ok || p.value.kind !== "apply") throw new Error("expected apply");
          expect(p.value.entry.receipt.state_sha256).toBe(stateSha256(p.value.nextState));
          core.accept(p.value);
        }
      } finally {
        IncrementalStateDigest.prototype.digest = real;
      }
      expect(calls).toBe(0);
    });

    it("stateSha256 asked for by an admission during replay is the reference, and is the reference again after replay", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 50, 17);
      const seen: string[] = [];
      const core = new CampaignCore({
        campaignId: CAMPAIGN,
        specLockSha256: SPEC,
        owners: TEST_OWNERS,
        state: emptyState(CAMPAIGN),
        headSha256: GENESIS,
        admission: {
          check: () => null,
          verifyHistorical: (_g, state) => {
            seen.push(stateSha256(state));
            return null;
          },
        },
      });
      const expected: string[] = [sha256Canonical(stateToFile(emptyState(CAMPAIGN)))];
      for (const entry of journal) {
        expect(core.replay(entry).ok).toBe(true);
        expected.push(entry.receipt.state_sha256);
      }
      // each pre-state seen by the verifier is hashed from scratch, equal to the previous receipt's digest
      expect(seen).toEqual(expected.slice(0, journal.length));
      expect(stateSha256(core.state)).toBe(sha256Canonical(stateToFile(core.state)));
    });

    it("ending a replay, interleaving a live commit and replaying again never changes a result", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 120, 23);
      const core = freshCore();
      for (const entry of journal.slice(0, 40)) expect(core.replay(entry).ok).toBe(true);
      core.endReplay(); // returns the memory only
      core.endReplay(); // idempotent
      for (const entry of journal.slice(40, 80)) expect(core.replay(entry).ok).toBe(true);
      // a live commit from this very state, by an independent core that replayed the same prefix
      const peer = freshCore();
      for (const entry of journal.slice(0, 80)) expect(peer.replay(entry).ok).toBe(true);
      const live = core.prepare(journal[80]!.group);
      expect(live.ok && live.value.kind === "apply" && canonicalJson(live.value.entry)).toBe(
        canonicalJson(journal[80]!),
      );
      if (!live.ok || live.value.kind !== "apply") throw new Error("expected apply");
      core.accept(live.value);
      for (const entry of journal.slice(81)) expect(core.replay(entry).ok).toBe(true);
      expect(stateSha256(core.state)).toBe(journal[journal.length - 1]!.receipt.state_sha256);
      expect(core.headSha256).toBe(journal[journal.length - 1]!.entry_sha256);
    });

    it("refuses a group that writes one key twice, even re-sealed", () => {
      const journal = buildJournal(PLANS["insert anywhere"]!, 30, 29);
      const core = freshCore();
      for (const entry of journal.slice(0, 29)) expect(core.replay(entry).ok).toBe(true);
      const forged = structuredClone(journal[29]!);
      forged.group.writes.push({ ...forged.group.writes[0]! });
      const { entry_sha256: old, ...rest } = forged;
      void old;
      const sealed: JournalEntry = { ...rest, entry_sha256: entryHash(rest) };
      const refused = core.replay(sealed);
      expect(refused.ok).toBe(false);
      expect(refused.ok === false && refused.error.message).toContain("DUPLICATE_KEY_IN_GROUP");
      expect(core.replay(journal[29]!).ok).toBe(true);
    });
  });
});
