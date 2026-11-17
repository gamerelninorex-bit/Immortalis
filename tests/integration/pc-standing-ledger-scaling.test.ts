// S-4 initial Standing Instruction ledger — WHOLE-OPERATION COST, as deterministic WORK COUNTERS (BLUE brief B4 "Whole operation"
// and Tenet 1 "carry what is unchanged; calculate what changed"). MECHANISM ONLY (T1). The legal causal action is held fixed (one PC,
// one world, one locus, one binding) while the amount of UNRELATED dormant state grows 0 / 100 / 500 / 2000 facts; the counters below
// are exact, not timings, so they cannot flake and they do not depend on the host. Wall-clock and byte measurements of the complete
// operation (create, group writes, hashing, strict cold open) are recorded separately in docs/evidence/s4-initial-ledger/.
//
// What is proven: the ledger's validation of a BINDING, which runs on admission, on every replay of a binding and on every cold open,
// reads a fixed handful of facts by exact key and never walks the campaign. The one walk the ledger adds is the single, rare,
// creation-time check that no world still owes a setup closure; it is linear in the number of facts, performs one string comparison per
// fact and resolves a key only for an actual setup placement.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  type OwnerFact,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import {
  bindingLedgerViolation,
  deriveLegacyPcLedger,
  deriveNewPcLedger,
  verifyCanonicalIntegrity,
  type WalkableLedgerFacts,
} from "@immortalis/engine";
import { fixtureWorld, publication } from "@immortalis/testkit";
import { activateWithLedger, releasedCampaign, target } from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/** A facts view that counts every access, so work is measured as a number of operations and never as time. */
function counting(facts: ReadonlyMap<string, OwnerFact>) {
  const counts = { get: 0, has: 0, walked: 0, walks: 0 };
  const view: WalkableLedgerFacts = {
    get: (k) => (counts.get++, facts.get(k)),
    has: (k) => (counts.has++, facts.has(k)),
    values: function* () {
      counts.walks++;
      for (const f of facts.values()) {
        counts.walked++;
        yield f;
      }
    },
  };
  return { view, counts };
}

/**
 * The committed facts of a lawful new-PC campaign, padded with `dormant` UNRELATED facts: copies of the campaign's real world fact under
 * other world identities (nothing refers to them, none is a setup placement or a ledger). Padding the in-memory view keeps the
 * counters about what the validation does, not about how long 2000 durable commits take.
 */
function padded(real: ReadonlyMap<string, OwnerFact>, dormant: number): Map<string, OwnerFact> {
  const out = new Map(real);
  const world = [...real.values()].find((f) => f.key.endsWith("/profile"))!;
  for (let i = 0; i < dormant; i++) {
    const id = `dormant-${i}`;
    const key = `world/${id}/profile`;
    out.set(key, { ...world, key, value: { ...(world.value as object), world_id: id } as never });
  }
  return out;
}

const SIZES = [0, 100, 500, 2000] as const;

describe("binding-side ledger validation is O(1) in unrelated state", () => {
  it("reads the same fixed set of facts by exact key and walks nothing, however much unrelated state exists", async () => {
    const observed: { n: number; get: number; has: number; walks: number }[] = [];
    const c = await releasedCampaign(tempDir());
    await activateWithLedger(c);
    const real = new Map(c.store.listFacts().map((f) => [f.key, f]));
    const binding = real.get(PLAYER_CHARACTER_BINDING_KEY)!.value as PlayerCharacterBinding;
    for (const n of SIZES) {
      // judge the binding against the cut strictly BEFORE it, exactly as admission and replay do
      const before = padded(real, n);
      before.delete(PLAYER_CHARACTER_BINDING_KEY);
      const { view, counts } = counting(before);
      expect(bindingLedgerViolation(binding, view)).toBeNull();
      observed.push({ n, get: counts.get, has: counts.has, walks: counts.walks });
      expect(before.size).toBe(real.size - 1 + n);
    }
    await c.close();
    // the count of exact-key reads is identical for 0 and for 2000 unrelated facts, small, and nothing was ever walked
    expect(new Set(observed.map((o) => o.get)).size).toBe(1);
    expect(observed[0]!.get).toBeLessThanOrEqual(8);
    expect(observed.every((o) => o.walks === 0 && o.has === 0)).toBe(true);
  });

  it("the legacy (L-2) derivation is one exact-key read of the binding, whatever the history", async () => {
    const c = await releasedCampaign(tempDir());
    await activateWithLedger(c);
    const real = new Map(c.store.listFacts().map((f) => [f.key, f]));
    await c.close();
    for (const n of [0, 2000]) {
      const { view, counts } = counting(padded(real, n));
      void deriveLegacyPcLedger(view, { pc_id: target().pc_id }); // refused (S-4 binding), but the work is what is measured
      expect(counts.get).toBeLessThanOrEqual(2);
      expect(counts.walks).toBe(0);
    }
  });
});

describe("the creation-time derivation does ONE bounded pass, only when a ledger is being created", () => {
  it("walks the campaign exactly once, one comparison per fact, and resolves no key when no placement exists", async () => {
    const c = await releasedCampaign(tempDir());
    const real = new Map(c.store.listFacts().map((f) => [f.key, f]));
    await c.close();
    for (const n of SIZES) {
      const facts = padded(real, n);
      const { view, counts } = counting(facts);
      const plan = deriveNewPcLedger(view, target());
      expect(plan.ok).toBe(true);
      expect(counts.walks).toBe(1); // exactly one pass
      expect(counts.walked).toBe(facts.size); // one visit per fact, no more: linear, not quadratic
      expect(counts.get).toBeLessThanOrEqual(8); // plus a fixed number of exact-key reads
    }
  });

  it("the full operation's journal growth is constant: exactly ONE additional owner group, whatever the history", async () => {
    const sizes: number[] = [];
    for (const n of [0, 100]) {
      const c = await releasedCampaign(tempDir());
      for (let i = 0; i < n; i++) {
        await must(
          c.establishWorld({
            ...publication(1000 + i),
            world: fixtureWorld({ world_id: `dormant-${i}` }),
          }),
        );
      }
      const before = c.store.head();
      await activateWithLedger(c);
      sizes.push(c.store.head().journal_entries - before.journal_entries);
      await c.close();
    }
    expect(sizes).toEqual([2, 2]); // the ledger group + the binding group; the binding was already one group before S-4
  }, 120_000);
});

describe("cold-open verification adds no per-fact work of its own", () => {
  /**
   * Receipt lookups (the durable, disk-backed dating of a fact) made by one whole `verifyCanonicalIntegrity`. It is the unit of
   * cost of the cold-open meaning check: a ledger scan that dated every fact would add one lookup per unrelated fact.
   */
  async function lookups(dormant: number, withLedger: boolean): Promise<number> {
    const c = await releasedCampaign(tempDir());
    for (let i = 0; i < dormant; i++) {
      await must(
        c.establishWorld({
          ...publication(1000 + i),
          world: fixtureWorld({ world_id: `dormant-${i}` }),
        }),
      );
    }
    if (withLedger) await activateWithLedger(c);
    const store = c.store as unknown as { lookupReceipt: (id: string) => unknown };
    const original = store.lookupReceipt.bind(store);
    let calls = 0;
    store.lookupReceipt = (id) => (calls++, original(id));
    expect(verifyCanonicalIntegrity(c.store)).toEqual([]);
    store.lookupReceipt = original;
    await c.close();
    return calls;
  }

  it("the per-unrelated-fact cost of verification is identical with and without a ledger (the setup scan dates only placements)", async () => {
    const slope = async (withLedger: boolean) => {
      const small = await lookups(0, withLedger);
      const large = await lookups(60, withLedger);
      return (large - small) / 60;
    };
    const without = await slope(false);
    const withLedger = await slope(true);
    expect(without).toBeGreaterThan(0); // the measurement can see per-fact work at all
    expect(withLedger).toBe(without);
  }, 120_000);
});
