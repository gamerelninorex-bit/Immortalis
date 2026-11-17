/* eslint-disable @typescript-eslint/no-explicit-any -- tests tamper with arbitrary fact values */
// S-4 initial Standing Instruction ledger — the binding prerequisite as a PURE function of the cut strictly before the binding
// (`bindingLedgerViolation`). Every branch is exercised directly with hand-tampered fact maps, independent of the commit path that
// normally reaches it, so that no branch rests on a path that happens to be unreachable through honest admission. MECHANISM ONLY (T1).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldSetupClosureKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { bindingLedgerViolation } from "@immortalis/engine";
import {
  HEAD_KEY,
  PC,
  VERSION_KEY,
  W,
  activateWithLedger,
  releasedCampaign,
} from "../support/ledger.ts";
import { tempDir } from "../support/tmp.ts";

/** The cut as a mutable map of deep copies, so a case can alter exactly one fact without touching the campaign. */
async function cut() {
  const c = await releasedCampaign(tempDir());
  await activateWithLedger(c);
  const binding = structuredClone(c.binding()!.value);
  const facts = new Map<string, OwnerFact>(
    c.store.listFacts().map((f) => [f.key, structuredClone(f) as OwnerFact]),
  );
  facts.delete(PLAYER_CHARACTER_BINDING_KEY);
  await c.close();
  return { binding, facts };
}

const edit = (facts: Map<string, OwnerFact>, key: string, f: (fact: any) => void) =>
  f(facts.get(key)!);

describe("bindingLedgerViolation: every branch of the binding prerequisite", () => {
  it("control: the genuine pair, at the cut strictly before the binding, qualifies it", async () => {
    const { binding, facts } = await cut();
    expect(bindingLedgerViolation(binding, facts)).toBeNull();
  });

  const cases: readonly [string, (facts: Map<string, OwnerFact>) => void, RegExp][] = [
    ["no head", (f) => f.delete(HEAD_KEY), /no committed Standing Instruction ledger head/],
    ["no version", (f) => f.delete(VERSION_KEY), /no committed Standing Instruction ledger head/],
    [
      "the head and the version committed by two different groups",
      (f) => edit(f, VERSION_KEY, (v) => (v.provenance.group_id = "another-group")),
      /one atomic PC-owner group/,
    ],
    [
      "the head and the version committed by two different intents",
      (f) => edit(f, VERSION_KEY, (v) => (v.provenance.intent_id = "another-intent")),
      /one atomic PC-owner group/,
    ],
    [
      "a version whose digest is not the SHA-256 of its content",
      (f) => edit(f, VERSION_KEY, (v) => (v.value.content_sha256 = "ab".repeat(32))),
      /digest/,
    ],
    [
      "a head that points at another version",
      (f) => edit(f, HEAD_KEY, (h) => (h.value.current.version = 7)),
      /head points exactly/,
    ],
    [
      "a version that violates its typed contract (a non-empty instruction list)",
      (f) => edit(f, VERSION_KEY, (v) => (v.value.instructions = [{ text: "a promise" }])),
      /typed contract/,
    ],
    [
      "an origin that is START_OF_LEDGER (a legacy qualifier is never a closure witness for a NEW binding)",
      (f) =>
        edit(f, VERSION_KEY, (v) => {
          v.value.origin = {
            kind: "START_OF_LEDGER",
            operative_binding: {
              fact_key: PLAYER_CHARACTER_BINDING_KEY,
              version: 1,
              commit: { group_id: "g", intent_id: "i" },
            },
          };
        }),
      // the digest no longer matches either; whichever the rule reports first, the pair is refused
      /engine-origin ledger closure|digest/,
    ],
    [
      "an origin that cites the PC's creation at another key",
      (f) =>
        edit(
          f,
          VERSION_KEY,
          (v) => (v.value.origin.pc_creation.fact_key = pcExistenceContractKey("other-pc")),
        ),
      /digest|pc_creation cites this PC's Existence Contract/,
    ],
    [
      "the PC's Existence Contract absent from the cut",
      (f) => f.delete(pcExistenceContractKey(PC)),
      /exact committed version and commit identity|Existence Contract/,
    ],
    [
      "the PC's Existence Contract at another version than the one the ledger cites",
      (f) => edit(f, pcExistenceContractKey(PC), (c) => (c.version = c.version + 1)),
      /exact committed version and commit identity/,
    ],
    [
      "the PC's Existence Contract under another commit identity",
      (f) => edit(f, pcExistenceContractKey(PC), (c) => (c.provenance.group_id = "someone-else")),
      /exact committed version and commit identity/,
    ],
    [
      "a world setup closure that exists for the coupled world but is not cited (the ledger preceded it)",
      (f) => {
        const base = f.get(HEAD_KEY)!;
        f.set(worldSetupClosureKey(W), {
          ...structuredClone(base),
          key: worldSetupClosureKey(W),
          owner: "world_state",
          facet: "world_setup_closure",
          version: 1,
          value: { any: "closure" },
        } as OwnerFact);
      },
      /without the closure of the world being coupled/,
    ],
  ];
  for (const [what, tamper, message] of cases) {
    it(`${what} → refused`, async () => {
      const { binding, facts } = await cut();
      tamper(facts);
      const violation = bindingLedgerViolation(binding, facts);
      expect(violation, what).not.toBeNull();
      expect(violation).toMatch(message);
    });
  }

  it("it is a pure function: the same cut judged twice gives the same answer and mutates nothing", async () => {
    const { binding, facts } = await cut();
    const snapshot = JSON.stringify([...facts.entries()]);
    expect(bindingLedgerViolation(binding, facts)).toBe(bindingLedgerViolation(binding, facts));
    expect(JSON.stringify([...facts.entries()])).toBe(snapshot);
  });
});
