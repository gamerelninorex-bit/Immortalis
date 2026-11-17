/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and forge arbitrary fact and group values */
// S-4 initial Standing Instruction ledger — L-2: the prospective START_OF_LEDGER witness of an EXISTING bound PC (BLUE brief B4:
// "Positive legacy", "Historical/cold"). MECHANISM ONLY (T1).
//
// The legacy campaigns here are REAL packages written by the pre-S-4 base build c6ea29d (see the fixture README): each holds an
// authentic old operative binding under the ORIGINAL citation and no ledger. The S-4 build cannot produce one (its admission refuses
// a fresh headless binding), so this is not a self-made witness, and the test does not begin with the expected START_OF_LEDGER result:
// it begins with the old bytes and lets the engine derive the witness from the PC and its actual operative binding.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEDGER_ORIGIN_START_OF_LEDGER,
  PLAYER_CHARACTER_BINDING_KEY,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
} from "@immortalis/contracts";
import { CanonicalCampaign, bindingLedgerViolation, factKind } from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  FIXTURE_PC_ID,
  fixtureLocus,
  publication,
} from "@immortalis/testkit";
import {
  activateWithLedger,
  code,
  rawLegacyLedgerGroup,
  releasedCampaign,
  reseal,
  target,
} from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const FIXTURES = join(__dirname, "..", "fixtures", "s4-legacy-pc-c6ea29d");

/** INDEPENDENT oracle: the length and SHA-256 of every checked-in fixture byte (literal data, mirrored in the fixture README). */
const FIXTURE_BYTES: Readonly<Record<string, readonly [number, string]>> = {
  "activation/journal.jsonl": [
    14537,
    "14169b9cd2c9d42930b38f5296e20e94ae3c70098117c35efeb7ee6a1b8a3207",
  ],
  "activation/legacy-journal.v1.backup": [
    0,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  ],
  "activation/legacy-manifest.v1.backup": [
    2153,
    "5bf93e78cb04c9241d951dcb10684cd3010382310859d522107a17752434cba5",
  ],
  "activation/legacy-state.v1.backup": [
    83,
    "6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621",
  ],
  "activation/manifest.json": [
    2534,
    "7a4aa2c527aca509af01dc91942c0b9c226f5c10a557a80aed1fc6a1dbdbceaa",
  ],
  "activation/state.0000000000.json": [
    83,
    "6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621",
  ],
  "handover/journal.jsonl": [
    46004,
    "0814da924eb8f8c652c997bfabc60cef712d9dbd966be4a7a20e0aebbd5a99aa",
  ],
  "handover/legacy-journal.v1.backup": [
    0,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  ],
  "handover/legacy-manifest.v1.backup": [
    2149,
    "0bebaf87357d1acecea5b08a02d44020dc73ca79df3b6c7301b4a7d1447f864e",
  ],
  "handover/legacy-state.v1.backup": [
    83,
    "6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621",
  ],
  "handover/manifest.json": [
    2532,
    "777c8b61619555b5bca423f9ef0bcc689e33a12fd9533dc5293be8a256ef7f14",
  ],
  "handover/state.0000000000.json": [
    83,
    "6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621",
  ],
};

/** Independent canonical JSON (sorted keys, no whitespace): deliberately NOT the engine's `canonicalJson`. */
const sortKeys = (v: any): any =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortKeys(v[k])]),
        )
      : v;
const sha256 = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(sortKeys(v)), "utf8")
    .digest("hex");

const VARIANTS = [
  { name: "activation", pc: FIXTURE_PC_ID, type: "ACTIVATION", ext: false, entries: 4 },
  { name: "handover", pc: ACTOR_SMITH, type: "EXISTING_ACTOR_HANDOVER", ext: true, entries: 13 },
] as const;
type Variant = (typeof VARIANTS)[number];

/** A private copy of one fixture package (the checked-in bytes are never opened in place), with the package's empty history/. */
function legacyCopy(variant: string): string {
  const dir = tempDir();
  cpSync(join(FIXTURES, variant, "package"), dir, { recursive: true });
  mkdirSync(join(dir, "history"), { recursive: true });
  return dir;
}
const openLegacy = (dir: string, v: Variant, buildId = "s4-legacy-open") =>
  must(
    CanonicalCampaign.open(dir, {
      buildId,
      ...(v.ext ? { extension: ACTOR_FIXTURE_EXTENSION } : {}),
    }),
  );
const journalOf = (dir: string) => readFileSync(join(dir, "journal.jsonl"));
const versionWrite = (g: any) => g.writes.find((w: any) => w.key.includes("/version/"))!;

afterEach(() => {
  vi.useRealTimers();
});

describe("A8 custody: the legacy witness bytes are exactly the ones the README records", () => {
  for (const [file, [length, digest]] of Object.entries(FIXTURE_BYTES)) {
    it(`${file} is ${length} bytes with SHA-256 ${digest.slice(0, 16)}…`, () => {
      const [variant, name] = file.split("/") as [string, string];
      const bytes = readFileSync(join(FIXTURES, variant, "package", name));
      expect(bytes.length).toBe(length);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    });
  }
  it("no unrecorded file is checked in beside them", () => {
    for (const variant of ["activation", "handover"]) {
      const present = readdirSync(join(FIXTURES, variant, "package"))
        .map((f) => `${variant}/${f}`)
        .sort();
      const recorded = Object.keys(FIXTURE_BYTES)
        .filter((k) => k.startsWith(`${variant}/`))
        .sort();
      expect(present).toEqual(recorded);
    }
  });
});

for (const v of VARIANTS) {
  describe(`L-2 over an authentic pre-S-4 ${v.type}-bound campaign`, () => {
    it("opens and strictly replays under the ORIGINAL policy: a headless old binding is lawful history, with no migration", async () => {
      const dir = legacyCopy(v.name);
      const before = journalOf(dir);
      const c = await openLegacy(dir, v);
      expect(c.verify()).toEqual([]);
      const binding = c.binding()!;
      expect(binding.value.transition.type).toBe(v.type);
      expect(binding.value.active_pc.entity_id).toBe(v.pc);
      // it was committed under the ORIGINAL citation, exactly the frozen binding rule: nothing re-cited or rewritten
      expect(binding.fact.provenance.rule).toEqual(factKind("player_character_binding").rule);
      expect(c.standingInstructionLedger(v.pc)).toBeUndefined();
      // the open really was a STRICT replay of the old history (the base build's checkpoint policy is not this build's), so the old
      // binding group was judged by the historical verifier under its original citation, not skipped on stale checkpoint evidence
      expect(c.store.ruleCheckedGroupIds?.().has(binding.fact.provenance.group_id)).toBe(true);
      await c.close();
      // opening wrote no byte of the journal: reopening a save never qualifies, migrates or repairs it
      expect(Buffer.compare(journalOf(dir), before)).toBe(0);
    });

    it("exactly one prospective START_OF_LEDGER is derived from the PC and its actual binding; old facts and journal bytes are untouched", async () => {
      const dir = legacyCopy(v.name);
      const oldJournal = journalOf(dir);
      const c = await openLegacy(dir, v);
      const oldFacts = Object.fromEntries(c.store.listFacts().map((f) => [f.key, f]));
      const original = c.binding()!.fact;

      const out = await must(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      expect(out.replayed).toBe(false);

      // the old journal is a byte-identical PREFIX; exactly one new line (one group) follows it
      const newJournal = journalOf(dir);
      expect(Buffer.compare(newJournal.subarray(0, oldJournal.length), oldJournal)).toBe(0);
      expect(newJournal.toString("utf8").slice(oldJournal.length).trim().split("\n")).toHaveLength(
        1,
      );
      expect(c.store.head().journal_entries).toBe(v.entries + 1);

      // every old fact (the binding included, provenance and all) is deep-equal; only the two ledger keys were added
      const nowFacts = Object.fromEntries(c.store.listFacts().map((f) => [f.key, f]));
      expect(
        Object.keys(nowFacts)
          .filter((k) => !(k in oldFacts))
          .sort(),
      ).toEqual([pcStandingLedgerHeadKey(v.pc), pcStandingLedgerVersionKey(v.pc, 1)].sort());
      for (const [k, f] of Object.entries(oldFacts)) expect(nowFacts[k]).toEqual(f);
      expect(c.binding()!.fact).toEqual(original);

      // the witness cites the EXACT original binding commit, claims no earlier instruction and carries no time
      const ledger = c.standingInstructionLedger(v.pc)!;
      const origin = ledger.version.value.origin;
      expect(origin.kind).toBe(LEDGER_ORIGIN_START_OF_LEDGER);
      if (origin.kind !== LEDGER_ORIGIN_START_OF_LEDGER) throw new Error("unreachable");
      const bindingRef = {
        fact_key: PLAYER_CHARACTER_BINDING_KEY,
        version: original.version,
        commit: {
          group_id: original.provenance.group_id,
          intent_id: original.provenance.intent_id,
        },
      };
      expect(origin.operative_binding).toEqual(bindingRef);
      expect(ledger.version.value.instructions).toEqual([]);
      expect(ledger.version.value.previous).toBeNull();
      expect(JSON.stringify(ledger.version.value)).not.toMatch(/timestamp|session|nonce|PLAYER/);

      // the operation identity is the brief's formula, computed here WITHOUT the engine: SHA-256 over canonical JSON of
      // ["S4_START_OF_LEDGER_V1", pc, original binding commit identity]
      const digest = sha256(["S4_START_OF_LEDGER_V1", v.pc, bindingRef]);
      expect(ledger.head.fact.provenance.intent_id).toBe(`s4-ledger-intent:${digest}`);
      expect(ledger.head.fact.provenance.group_id).toBe(`s4-ledger-group:${digest}`);
      expect(c.verify()).toEqual([]);
      await c.close();

      // cold reopen: the new head verifies, and still nothing mutates on open
      const reopened = await openLegacy(dir, v, "s4-legacy-reopen");
      expect(reopened.verify()).toEqual([]);
      expect(reopened.standingInstructionLedger(v.pc)).toBeDefined();
      expect(Buffer.compare(journalOf(dir), newJournal)).toBe(0);
      await reopened.close();
    });

    it("the identity does not depend on the session, the transport, the clock or the retry: one head survives them all", async () => {
      const dir = legacyCopy(v.name);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-03-04T05:06:07Z"));
      const a = await openLegacy(dir, v, "session-one");
      const first = await must(a.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      // the same request again in the same session
      const again = await must(a.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      expect(again.replayed).toBe(true);
      expect(again.receipt).toEqual(first.receipt);
      const head = a.store.head();
      await a.close();

      // a different session, a different build id and a different wall time: the same single head
      vi.setSystemTime(new Date("2044-12-31T23:59:59Z"));
      const b = await openLegacy(dir, v, "session-two-other-build");
      const third = await must(b.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      expect(third.replayed).toBe(true);
      expect(third.receipt).toEqual(first.receipt);
      expect(b.store.head().journal_head_sha256).toBe(head.journal_head_sha256);
      expect(b.store.head().journal_entries).toBe(v.entries + 1);
      await b.close();
    });

    it("the legacy campaign continues lawfully after qualification (an ordinary commit still works)", async () => {
      const dir = legacyCopy(v.name);
      const c = await openLegacy(dir, v);
      await must(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      await must(
        c.establishLocus({
          ...publication(900),
          locus: fixtureLocus({
            locus_id: "locus-after-l2",
            designation: "A hall added after L-2",
          }),
        }),
      );
      expect(c.verify()).toEqual([]);
      await c.close();
    });

    it("a witness qualifies only the PC it is for, and a START_OF_LEDGER pair can never satisfy a NEW binding", async () => {
      const dir = legacyCopy(v.name);
      const c = await openLegacy(dir, v);
      const before = c.store.head();
      // another PC has no operative binding here
      expect(
        await code(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: "someone-else" })),
      ).toBe("REFERENCE_INVALID");
      expect(c.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
      await must(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: v.pc }));
      // the START pair does not satisfy the binding prerequisite of a new binding: it is a legacy qualifier, not a closure witness
      const facts = new Map(c.store.listFacts().map((f) => [f.key, f]));
      const violation = bindingLedgerViolation(c.binding()!.value, facts);
      expect(violation).toContain("requires the engine-origin ledger closure");
      await c.close();
    });

    it("a raw START_OF_LEDGER is judged by the same rule: forged binding identity, version, digest, identity or pins are refused", async () => {
      const forgeries: readonly [string, (g: any) => void, boolean][] = [
        [
          "a fabricated original-binding group identity",
          (g) =>
            (versionWrite(g).value.origin.operative_binding.commit.group_id = "invented-group"),
          true,
        ],
        [
          "a fabricated original-binding intent identity",
          (g) =>
            (versionWrite(g).value.origin.operative_binding.commit.intent_id = "invented-intent"),
          true,
        ],
        [
          "an original binding cited at another version",
          (g) => (versionWrite(g).value.origin.operative_binding.version = 2),
          true,
        ],
        [
          "an original binding cited at another key",
          (g) =>
            (versionWrite(g).value.origin.operative_binding.fact_key =
              "role-registry/binding/other"),
          true,
        ],
        [
          "a digest that is not the content's",
          (g) => (versionWrite(g).value.content_sha256 = "cd".repeat(32)),
          false,
        ],
        [
          "an operation identity that is not derived from PC + binding",
          (g) => (g.intent_id = "my-own-intent"),
          false,
        ],
        ["a group that does not read the binding it qualifies", (g) => (g.reads = []), false],
        ["a group that does not depend on the binding's group", (g) => (g.depends_on = []), false],
        [
          "an ENGINE_ORIGIN witness claimed for an already-bound PC",
          (g) =>
            (versionWrite(g).value.origin = {
              kind: "ENGINE_ORIGIN_LEDGER_CLOSURE",
              pc_creation: {
                fact_key: `pc/${v.pc}/existence-contract`,
                version: 1,
                commit: { group_id: "x", intent_id: "y" },
              },
              target_world: {
                fact_key: "world/world-1/profile",
                version: 1,
                commit: { group_id: "x", intent_id: "y" },
              },
              setup_closure: null,
            }),
          true,
        ],
      ];
      const dir = legacyCopy(v.name);
      const c = await openLegacy(dir, v);
      for (const [what, edit, resealAfter] of forgeries) {
        const g = rawLegacyLedgerGroup(c, v.pc, (x) => {
          edit(x);
          if (resealAfter) reseal(x);
        });
        const before = c.store.head();
        expect(await code(c.store.commit(g) as never), what).toBe("REFERENCE_INVALID");
        expect(c.store.head().journal_head_sha256, what).toBe(before.journal_head_sha256);
      }
      // control on the same campaign: the unedited raw group is admitted, and the campaign verifies
      await must(c.store.commit(rawLegacyLedgerGroup(c, v.pc)));
      expect(c.verify()).toEqual([]);
      await c.close();
    });
  });
}

describe("L-2 refusals that need no fixture", () => {
  it("a campaign with no operative binding has nothing to qualify", async () => {
    const c = await releasedCampaign(tempDir());
    expect(await code(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: target().pc_id }))).toBe(
      "PREREQUISITE_MISSING",
    );
    await c.close();
  });

  it("a binding committed under the S-4 citation already required a head: it is not an authentic old binding", async () => {
    const c = await releasedCampaign(tempDir());
    await activateWithLedger(c);
    expect(await code(c.qualifyLegacyPcStandingInstructionLedger({ pc_id: target().pc_id }))).toBe(
      "REFERENCE_INVALID",
    );
    await c.close();
  });
});
