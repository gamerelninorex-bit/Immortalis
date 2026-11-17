/* eslint-disable @typescript-eslint/no-explicit-any -- tests tamper with arbitrary fact values */
// S-4 initial Standing Instruction ledger — the ORIGIN rule as a PURE function of the cut strictly before the ledger group
// (`ledgerOriginViolation`), judged directly with hand-built fact maps. BLUE exact-HEAD review finding H-1 on PR #107: the
// closure-or-null of an engine-origin ledger is a claim about the TARGET world, and is checked against that world's actual committed
// closure (or its verifiable absence) wherever the origin is judged: normal admission, a raw `store.commit`, historical replay (the
// incremental pre-state) and cold-open verification (the cut before the pair). Independent of the commit path that reaches it, so no
// branch rests on a path that happens to be unreachable. MECHANISM ONLY (T1).
import { describe, expect, it } from "vitest";
import {
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  pcExistenceContractKey,
  worldProfileKey,
  worldSetupClosureKey,
  type OwnerFact,
  type PcStandingLedgerVersion,
} from "@immortalis/contracts";
import {
  deriveNewPcLedger,
  ledgerOperationDigest,
  ledgerOriginViolation,
  targetWorldIdOf,
} from "@immortalis/engine";
import { PC, W, releasedCampaign, target } from "../support/ledger.ts";
import { tempDir } from "../support/tmp.ts";

const W_OTHER = "world-other";

/** The committed facts before any ledger exists, and the genuine version the engine derives from them (target world W, no closure). */
async function cut() {
  const c = await releasedCampaign(tempDir());
  const facts = new Map<string, OwnerFact>(
    c.store.listFacts().map((f) => [f.key, structuredClone(f) as OwnerFact]),
  );
  await c.close();
  const plan = deriveNewPcLedger(facts, target());
  if (!plan.ok) throw new Error(plan.error.message);
  return { facts, version: structuredClone(plan.value.version) as PcStandingLedgerVersion };
}

/** A synthetic committed fact under `key`, shaped like the real world profile (a second world, or a closure). */
function addFact(facts: Map<string, OwnerFact>, key: string, over: Partial<OwnerFact> = {}) {
  const base = facts.get(worldProfileKey(W))!;
  const fact = { ...structuredClone(base), key, ...over } as OwnerFact;
  facts.set(key, fact);
  return fact;
}
const refOf = (f: OwnerFact) => ({
  fact_key: f.key,
  version: f.version,
  commit: { group_id: f.provenance.group_id, intent_id: f.provenance.intent_id },
});
const origin = (v: PcStandingLedgerVersion): any => v.origin;

describe("ledgerOriginViolation: the closure-or-null is judged for the TARGET world", () => {
  it("control: the genuine derivation (target W, no closure, explicit null) is qualified", async () => {
    const { facts, version } = await cut();
    expect(origin(version).kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
    expect(origin(version).target_world.fact_key).toBe(worldProfileKey(W));
    expect(origin(version).setup_closure).toBeNull();
    expect(ledgerOriginViolation(version, facts, facts)).toBeNull();
  });

  it("control: with the target world's closure committed, the genuine derivation cites exactly it", async () => {
    const { facts } = await cut();
    const closure = addFact(facts, worldSetupClosureKey(W));
    const plan = deriveNewPcLedger(facts, target());
    if (!plan.ok) throw new Error(plan.error.message);
    expect(origin(plan.value.version).setup_closure).toEqual(refOf(closure));
    expect(ledgerOriginViolation(plan.value.version, facts, facts)).toBeNull();
  });

  const cases: readonly [
    string,
    (facts: Map<string, OwnerFact>, version: PcStandingLedgerVersion) => void,
    RegExp,
  ][] = [
    [
      "an explicit null although the target world has a committed closure",
      (facts) => addFact(facts, worldSetupClosureKey(W)),
      /explicit null closure is false/,
    ],
    [
      "a closure cited although the target world has none (the closure key is absent)",
      (facts, v) => {
        origin(v).setup_closure = refOf(addFact(facts, worldSetupClosureKey(W_OTHER)));
      },
      /has no committed world_setup_closure/,
    ],
    [
      "another world's closure cited while the target world has its own",
      (facts, v) => {
        addFact(facts, worldSetupClosureKey(W));
        origin(v).setup_closure = refOf(addFact(facts, worldSetupClosureKey(W_OTHER)));
      },
      /TARGET world's closure/,
    ],
    [
      "the target world's closure cited at another version",
      (facts, v) => {
        const closure = addFact(facts, worldSetupClosureKey(W));
        origin(v).setup_closure = { ...refOf(closure), version: closure.version + 1 };
      },
      /exact committed version and commit identity/,
    ],
    [
      "the target world's closure cited under another commit identity",
      (facts, v) => {
        const closure = addFact(facts, worldSetupClosureKey(W));
        origin(v).setup_closure = {
          ...refOf(closure),
          commit: { group_id: "elsewhere", intent_id: "elsewhere" },
        };
      },
      /exact committed version and commit identity/,
    ],
    [
      "a target_world that is not a world profile",
      (_facts, v) => {
        origin(v).target_world = {
          ...origin(v).target_world,
          fact_key: pcExistenceContractKey(PC),
        };
      },
      /cites a world profile/,
    ],
    [
      "a target_world cited at another version",
      (_facts, v) => {
        origin(v).target_world = { ...origin(v).target_world, version: 7 };
      },
      /exact committed version and commit identity/,
    ],
    [
      "a target_world that is not committed at the cut",
      (facts) => {
        facts.delete(worldProfileKey(W));
      },
      /target world's profile|exact committed version and commit identity/,
    ],
  ];
  for (const [what, tamper, message] of cases) {
    it(`${what} → refused`, async () => {
      const { facts, version } = await cut();
      tamper(facts, version);
      const violation = ledgerOriginViolation(version, facts, facts);
      expect(violation, what).not.toBeNull();
      expect(violation).toMatch(message);
    });
  }

  it("the operation identity depends on the target world: two worlds in the same closure state never share a ledger identity", async () => {
    const { facts, version } = await cut();
    const w2 = addFact(facts, worldProfileKey(W_OTHER));
    const other: PcStandingLedgerVersion = structuredClone(version);
    origin(other).target_world = refOf(w2);
    expect(ledgerOperationDigest(version)).not.toBe(ledgerOperationDigest(other));
  });

  it("targetWorldIdOf names the world of a world-profile reference and nothing else", async () => {
    const { facts } = await cut();
    expect(targetWorldIdOf(refOf(facts.get(worldProfileKey(W))!))).toBe(W);
    expect(targetWorldIdOf({ fact_key: pcExistenceContractKey(PC) })).toBeNull();
    expect(targetWorldIdOf({ fact_key: "not/a/key" })).toBeNull();
  });
});
