/* eslint-disable @typescript-eslint/no-explicit-any -- tests tamper with arbitrary group and fact values */
// S-4 initial Standing Instruction ledger — HISTORICAL / COLD-OPEN integrity (BLUE brief B4: "Historical/cold"). MECHANISM ONLY (T1).
//
// Tampered histories are built OUTSIDE admission: a store that has the owner registry but no admission commits any structurally valid
// group, so a history that admission would never have written can exist on disk (as a bug, a hand edit or a hostile host would leave
// it). Each case starts from the five GENUINE groups of a lawful new-PC campaign and alters exactly one thing (an order, an omission, a
// field). Two independent lines of defence must each catch it: `verifyCanonicalIntegrity` (the cold-open meaning check), and a real
// cold `CanonicalCampaign.open` (which may fail at strict replay or at integrity). Nothing is repaired or silently trusted.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  createFileCampaign,
  factKind,
  verifyCanonicalIntegrity,
} from "@immortalis/engine";
import { FIXTURE_CAMPAIGN } from "@immortalis/testkit";
import {
  HEAD_KEY,
  L,
  PC,
  VERSION_KEY,
  W,
  activateWithLedger,
  releasedCampaign,
  reseal,
} from "../support/ledger.ts";
import { closureValue, r1Group } from "../support/actor-presence.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

type Groups = Record<"world" | "locus" | "pc" | "ledger" | "binding", CommitGroup>;

/** The five genuine groups of a lawful new-PC campaign, exactly as admission committed them. */
async function genuine(): Promise<Groups> {
  const c = await releasedCampaign(tempDir());
  await activateWithLedger(c);
  const at = (key: string) => c.store.committedGroup(c.store.getFact(key)!.provenance.intent_id)!;
  const groups = {
    world: at(worldProfileKey(W)),
    locus: at(worldLocusKey(W, L)),
    pc: at(pcExistenceContractKey(PC)),
    ledger: at(HEAD_KEY),
    binding: at(PLAYER_CHARACTER_BINDING_KEY),
  };
  await c.close();
  return structuredClone(groups);
}

const ver = (g: any) => g.writes.find((w: any) => w.key.includes("/version/"))!;
const hd = (g: any) => g.writes.find((w: any) => w.key.endsWith("/head"))!;
const LEDGER_PINS = [HEAD_KEY, VERSION_KEY];
/** A binding that no longer reads / depends on the ledger (as a group built without it would be). */
function unlinkedBinding(g: any, ledgerGroupId: string): any {
  g.reads = g.reads.filter((r: any) => !LEDGER_PINS.includes(r.key));
  g.depends_on = g.depends_on.filter((d: string) => d !== ledgerGroupId);
  return g;
}

/** Commits the given groups to a store that has the owner registry but NO admission, and returns it open. */
async function outsideAdmission(groups: readonly CommitGroup[]) {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
  );
  for (const g of groups) await must(store.commit(g));
  return { dir, store };
}

interface Case {
  readonly name: string;
  readonly build: (g: Groups) => CommitGroup[];
  /** the integrity violation (code, message pattern) that must be reported */
  readonly expect: { readonly code: string; readonly message: RegExp };
}

const cases: readonly Case[] = [
  {
    name: "a version digest that is not the SHA-256 of its content",
    build: (g) => {
      ver(g.ledger).value.content_sha256 = "ab".repeat(32);
      hd(g.ledger).value.content_sha256 = "ab".repeat(32);
      return [g.world, g.locus, g.pc, g.ledger, g.binding];
    },
    expect: { code: "PC_LEDGER_STATE", message: /digest/ },
  },
  {
    name: "a head that points at a version that is not the one it travels with",
    build: (g) => {
      hd(g.ledger).value.current.version = 2;
      return [g.world, g.locus, g.pc, g.ledger, g.binding];
    },
    expect: { code: "PC_LEDGER_STATE", message: /head points exactly/ },
  },
  {
    name: "an origin that cites the PC's creation under another commit identity",
    build: (g) => {
      const original = g.ledger.group_id;
      ver(g.ledger).value.origin.pc_creation.commit.group_id = "wf-group-99";
      reseal(g.ledger); // the group's identity is DERIVED from its content, so it moves with the edit
      g.binding.depends_on = g.binding.depends_on.map((d) =>
        d === original ? g.ledger.group_id : d,
      );
      return [g.world, g.locus, g.pc, g.ledger, g.binding];
    },
    expect: { code: "PC_LEDGER_STATE", message: /exact committed version and commit identity/ },
  },
  {
    name: "a binding under the S-4 citation with the ledger ERASED (a bound-but-headless PC)",
    build: (g) => [g.world, g.locus, g.pc, unlinkedBinding(g.binding, g.ledger.group_id)],
    expect: { code: "PREREQUISITE_MISSING", message: /standing-instruction-ledger\/head/ },
  },
  {
    name: "a ledger committed AFTER the binding that was meant to consume it (reordered)",
    build: (g) => [g.world, g.locus, g.pc, unlinkedBinding(g.binding, g.ledger.group_id), g.ledger],
    expect: { code: "PC_LEDGER_STATE", message: /after its PC's binding/ },
  },
  {
    name: "a binding that did not read the head and version it consumed",
    build: (g) => [g.world, g.locus, g.pc, g.ledger, unlinkedBinding(g.binding, g.ledger.group_id)],
    expect: { code: "PC_LEDGER_STATE", message: /read the exact ledger fact/ },
  },
  {
    name: "a head with no sealed version",
    build: (g) => {
      g.ledger.writes = [hd(g.ledger)];
      return [g.world, g.locus, g.pc, g.ledger];
    },
    expect: { code: "PC_LEDGER_STATE", message: /no sealed sequence-1 version/ },
  },
  {
    name: "a sealed version with no head",
    build: (g) => {
      g.ledger.writes = [ver(g.ledger)];
      return [g.world, g.locus, g.pc, g.ledger];
    },
    expect: { code: "PC_LEDGER_STATE", message: /no head/ },
  },
  {
    name: "an engine-origin ledger committed after an ORIGINAL-cited binding already existed (too late to precede it)",
    build: (g) => {
      const old = unlinkedBinding(g.binding, g.ledger.group_id);
      old.rule = factKind("player_character_binding").rule;
      return [g.world, g.locus, g.pc, old, g.ledger];
    },
    expect: { code: "PC_LEDGER_STATE", message: /after its PC's binding/ },
  },
  {
    name: "a head advanced beyond its first version",
    build: (g) => {
      const advance = structuredClone(g.ledger) as any;
      advance.group_id = "advance-group";
      advance.intent_id = "advance-intent";
      advance.writes = [hd(advance)];
      hd(advance).expected_version = 1;
      return [g.world, g.locus, g.pc, g.ledger, advance];
    },
    expect: { code: "UNSUPPORTED_AMENDMENT", message: /advanced/ },
  },
  {
    name: "a world setup closure that exists for the coupled world, after a ledger that cites none (the binding's closure applicability)",
    build: (g) => {
      // a structurally valid, empty-inventory closure of the coupled world, written AFTER the ledger and BEFORE the binding. Admission
      // would never have written it (a ledger kind ends setup eligibility), but a damaged or hostile history could carry it.
      const stub = {
        getFact: (k: string) =>
          k === worldProfileKey(W)
            ? { version: 1, provenance: { group_id: g.world.group_id } }
            : undefined,
      } as never;
      const closure = r1Group(stub, worldSetupClosureKey(W), closureValue([], W), [
        worldProfileKey(W),
      ]);
      return [g.world, g.locus, g.pc, g.ledger, closure, g.binding];
    },
    expect: { code: "PC_LEDGER_STATE", message: /without the closure of the world being coupled/ },
  },
];

describe("a history whose ledger or binding order/content was tampered fails closed, by BOTH lines of defence", () => {
  for (const c of cases) {
    it(`${c.name}`, async () => {
      const { dir, store } = await outsideAdmission(c.build(await genuine()));
      // 1. the cold-open MEANING check reports the precise violation (the diagnostic path, not the replay)
      const violations = verifyCanonicalIntegrity(store);
      const hit = violations.find(
        (v) => v.code === c.expect.code && c.expect.message.test(v.message + " " + v.key),
      );
      expect(hit, JSON.stringify(violations.slice(0, 6))).toBeDefined();
      await store.close();
      // 2. a real cold open refuses the campaign, and nothing is repaired or silently trusted. It is the STRICT REPLAY (the same
      // admission rule that judged each group when it was written) that refuses first, so the code is pinned exactly: were that
      // second line weakened, the open would fall through to the meaning check and report CANON_INTEGRITY instead.
      const opened = await CanonicalCampaign.open(dir, { buildId: "s4-tampered" });
      expect(opened.ok).toBe(false);
      expect(!opened.ok && opened.error.code).toBe("REPLAY_MISMATCH");
    });
  }

  it("control: the SAME five genuine groups, untampered and in order, verify clean and open", async () => {
    const gs = await genuine();
    const lawful = await outsideAdmission([gs.world, gs.locus, gs.pc, gs.ledger, gs.binding]);
    expect(verifyCanonicalIntegrity(lawful.store)).toEqual([]);
    await lawful.store.close();
    const opened = await must(CanonicalCampaign.open(lawful.dir, { buildId: "s4-lawful-open" }));
    expect(opened.verify()).toEqual([]);
    await opened.close();
  });

  it("control: an authentic OLD headless binding (original citation, no ledger) is lawful history, not a violation", async () => {
    const g = await genuine();
    const old = unlinkedBinding(g.binding, g.ledger.group_id);
    old.rule = factKind("player_character_binding").rule;
    const { dir, store } = await outsideAdmission([g.world, g.locus, g.pc, old]);
    expect(verifyCanonicalIntegrity(store)).toEqual([]);
    await store.close();
    const opened = await must(CanonicalCampaign.open(dir, { buildId: "s4-old-open" }));
    expect(opened.verify()).toEqual([]);
    expect(opened.standingInstructionLedger(PC)).toBeUndefined();
    await opened.close();
  });
});
