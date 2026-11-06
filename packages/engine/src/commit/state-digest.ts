import { createHash, type Hash } from "node:crypto";
import { canonicalJson, type OwnerFact } from "@immortalis/contracts";
import type { CampaignState } from "./campaign-core.ts";

/** Facts between retained SHA-256 prefix states. */
const STRIDE = 32;

export interface StateDigestStats {
  /** digests produced */
  readonly digests: number;
  /** digests that had to be rebuilt from scratch because the pre-state was not the aligned one */
  readonly rebuilds: number;
  /** digests that fell back to the reference computation */
  readonly fallbacks: number;
}

const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * H-07 S3: an ephemeral, byte-identical evaluator of the canonical full-state SHA-256 for the strict historical replay.
 *
 * The receipt digest is, and remains, `sha256(utf8(canonicalJson(stateToFile(state))))`, that is the SHA-256 of exactly
 *
 *     {"campaign_id":<JSON string>,"facts":[<fact>,<fact>,...],"revision":<JSON number>}
 *
 * with the facts in ascending UTF-16 key order and each `<fact>` the `canonicalJson` of that fact. This module hashes that very
 * message. It never changes what is hashed, only how much work re-producing it costs when a strict replay advances one committed
 * group at a time and each group rewrites only a few of the facts:
 *
 *  - a fact's canonical text is produced once (by the same `canonicalJson`) and kept as UTF-8 bytes while the fact is unchanged;
 *  - the sorted order is maintained by merging the written facts into the previous order, not by re-sorting every fact;
 *  - SHA-256 is a streaming construction, so the internal state after a prefix of the message is a pure function of that
 *    prefix. `Hash#copy` snapshots of that state are kept every STRIDE facts and reused for exactly the prefix that precedes the
 *    first fact the group changed. Everything from there on is hashed afresh, so a group that rewrites an early key hashes
 *    (nearly) the whole message and a group that rewrites a late key hashes only its tail. Nothing is assumed about where keys fall.
 *
 * Scope and safety:
 *  - It is derived, process-local evidence. Nothing here is persisted, published or exposed as a state root, and it can produce
 *    no digest for any state it has not been shown: the result is always a hash of the message built from the facts it holds.
 *  - It is aligned to ONE state by object identity. If the pre-state handed in is not the state it last produced, it rebuilds from
 *    that state's own facts; a state whose Map keys do not equal its facts' `key` (which the reference sorts by) falls back to the
 *    reference computation. The from-scratch reference (what `stateSha256` is everywhere except one strict-replay step) remains the
 *    live-commit path and the differential oracle in tests.
 *  - It relies on the immutability the state types already declare (`CampaignState.facts` is a ReadonlyMap of facts that are
 *    replaced, never edited in place). It is not a defence against a caller that mutates a committed fact object.
 */
export class IncrementalStateDigest {
  #aligned: CampaignState | null = null;
  #campaignId = "";
  /** ascending fact keys of the aligned state */
  #keys: string[] = [];
  /** `canonicalJson(fact)` + "," as UTF-8, parallel to #keys; the last fact is hashed without its comma */
  #texts: Buffer[] = [];
  /** #marks[j] is the hash state after the header and the first j * STRIDE facts (each followed by its comma) */
  #marks: Hash[] = [];
  #digests = 0;
  #rebuilds = 0;
  #fallbacks = 0;

  get stats(): StateDigestStats {
    return { digests: this.#digests, rebuilds: this.#rebuilds, fallbacks: this.#fallbacks };
  }

  /** What is held right now: cached canonical fact bytes and SHA-256 prefix states (both 0 once released). Diagnostic only. */
  get retained(): { readonly facts: number; readonly prefixStates: number } {
    return { facts: this.#texts.length, prefixStates: this.#marks.length };
  }

  /** Drops every cached byte and hash state. The next digest rebuilds from the state it is given. */
  release(): void {
    this.#aligned = null;
    this.#keys = [];
    this.#texts = [];
    this.#marks = [];
  }

  /**
   * The canonical full-state digest of `next`, where `next` is `pre` with exactly the facts `written` replaced or added
   * (and the revision advanced). `reference` computes the same digest the ordinary way and is used only when this state cannot be
   * handled incrementally.
   */
  digest(
    pre: CampaignState,
    next: CampaignState,
    written: readonly OwnerFact[],
    reference: (state: CampaignState) => string,
  ): string {
    this.#digests++;
    try {
      if (this.#aligned !== pre && !this.#rebuild(pre)) {
        this.#fallbacks++;
        return reference(next);
      }
      const first = this.#merge(written);
      if (this.#keys.length !== next.facts.size || next.campaign_id !== this.#campaignId) {
        // the caller's `written` does not describe the step from `pre` to `next`; never guess
        this.#aligned = null;
        this.#fallbacks++;
        return reference(next);
      }
      const hex = this.#hash(first, next);
      this.#aligned = next;
      return hex;
    } catch (error) {
      this.#aligned = null;
      throw error;
    }
  }

  #header(state: CampaignState): string {
    return `{"campaign_id":${JSON.stringify(state.campaign_id)},"facts":[`;
  }

  #rebuild(state: CampaignState): boolean {
    this.#rebuilds++;
    this.release();
    const facts: OwnerFact[] = [];
    for (const [key, fact] of state.facts) {
      // The reference orders by each fact's own `key`; an incremental order keyed by the Map key is equivalent only when they agree.
      if (fact.key !== key) return false;
      facts.push(fact);
    }
    facts.sort((a, b) => compareKeys(a.key, b.key));
    const keys = facts.map((f) => f.key);
    const texts = facts.map((f) => Buffer.from(`${canonicalJson(f)},`, "utf8"));
    this.#campaignId = state.campaign_id;
    this.#keys = keys;
    this.#texts = texts;
    this.#marks = [createHash("sha256").update(this.#header(state), "utf8")];
    this.#aligned = state;
    return true;
  }

  /**
   * Replaces or inserts the written facts in the aligned order. Returns the index of the first fact whose position or bytes
   * differ from the previous order (the length of the unchanged prefix).
   */
  #merge(written: readonly OwnerFact[]): number {
    if (written.length === 0) return this.#keys.length;
    // Serialise first: if canonicalJson rejects a fact nothing has been modified.
    const incoming = written
      .map((fact) => ({ key: fact.key, text: Buffer.from(`${canonicalJson(fact)},`, "utf8") }))
      .sort((a, b) => compareKeys(a.key, b.key));
    for (let i = 1; i < incoming.length; i++)
      if (incoming[i - 1]!.key === incoming[i]!.key)
        throw new Error("state digest: a fact was written twice in one step");
    const oldKeys = this.#keys;
    const oldTexts = this.#texts;
    const keys: string[] = [];
    const texts: Buffer[] = [];
    let from = 0;
    let first = -1;
    for (const { key, text } of incoming) {
      const at = lowerBound(oldKeys, key, from);
      for (let i = from; i < at; i++) {
        keys.push(oldKeys[i]!);
        texts.push(oldTexts[i]!);
      }
      if (first < 0) first = keys.length;
      keys.push(key);
      texts.push(text);
      from = at < oldKeys.length && oldKeys[at] === key ? at + 1 : at;
    }
    for (let i = from; i < oldKeys.length; i++) {
      keys.push(oldKeys[i]!);
      texts.push(oldTexts[i]!);
    }
    this.#keys = keys;
    this.#texts = texts;
    return first;
  }

  #hash(first: number, state: CampaignState): string {
    const texts = this.#texts;
    const n = texts.length;
    // Only snapshots whose prefix lies wholly before the first changed fact, and before the final fact (which is hashed without its
    // trailing comma), describe a prefix of this message.
    const reusable = n === 0 ? 0 : Math.floor(Math.min(first, n - 1) / STRIDE);
    if (this.#marks.length > reusable + 1) this.#marks.length = reusable + 1;
    const start = (this.#marks.length - 1) * STRIDE;
    const hash = this.#marks[this.#marks.length - 1]!.copy();
    for (let i = start; i < n; i++) {
      if (i > start && i % STRIDE === 0) this.#marks.push(hash.copy());
      const text = texts[i]!;
      hash.update(i === n - 1 ? text.subarray(0, text.length - 1) : text);
    }
    hash.update(`],"revision":${JSON.stringify(state.revision)}}`, "utf8");
    return hash.digest("hex");
  }
}

/** First index in `keys[from..]` whose key is not less than `key`. */
function lowerBound(keys: readonly string[], key: string, from: number): number {
  let lo = from;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid]! < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Facts between retained SHA-256 prefix states (exposed so tests can straddle the boundaries). */
export const STATE_DIGEST_STRIDE = STRIDE;
