/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents */
// Refusals of the confirmed ORIGINAL locality admission: an unauthored, unconfirmed, delegated, over-claiming or inconsistent setup
// is refused BEFORE anything is written — no package, no directory, no fallback estimate or manufactured default — and the console is
// never even asked. The refusals are the strict contracts' own (WorldProfile, WorldLocus, EstablishSourceConditionInput).
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { establish, freshDirs, setupDoc, writeSetup } from "../support/locality.ts";

const without = (path: string[]) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  delete o[path.at(-1)!];
};
const set = (path: string[], value: unknown) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path.at(-1)!] = value;
};

const refused: [string, (d: any) => void][] = [
  // missing / unauthored
  ["no world section", without(["world"])],
  ["no locus section", without(["locus"])],
  ["no source section", without(["source"])],
  ["no premise", without(["world", "premise"])],
  ["an empty premise", set(["world", "premise"], "")],
  ["a premise with surrounding whitespace", set(["world", "premise"], " padded ")],
  ["no established canon", without(["world", "reference_causal_basis", "established_canon"])],
  [
    "no law-departures array (required, never defaulted)",
    without(["world", "material_world_law_departures"]),
  ],
  ["no insertion constraints array", without(["world", "insertion_supporting_constraints"])],
  ["no locus designation", without(["locus", "designation"])],
  ["no locus constraints array", without(["locus", "constraints"])],
  ["no source key", without(["source", "source_key"])],
  ["no quantity", without(["source", "quantity"])],
  ["no unit", without(["source", "quantity", "unit"])],
  ["no access-facts array", without(["source", "access_facts"])],
  ["no source statement", without(["source", "statement"])],
  ["an empty source statement", set(["source", "statement"], "")],
  ["a null source statement", set(["source", "statement"], null)],
  ["no material class", without(["source", "material_class"])],
  ["no dimension", without(["source", "dimension"])],
  // not an exact finite quantity
  ["a zero quantity", set(["source", "quantity", "amount"], 0)],
  ["a negative quantity", set(["source", "quantity", "amount"], -3)],
  ["a non-integer quantity", set(["source", "quantity", "amount"], 2.5)],
  ["a string quantity", set(["source", "quantity", "amount"], "120")],
  ["an unsafe-integer quantity", set(["source", "quantity", "amount"], 2 ** 53)],
  ["an empty unit", set(["source", "quantity", "unit"], "")],
  ["a unit with a control character", set(["source", "quantity", "unit"], "sa\u0007ck")],
  ["a ranged quantity", set(["source", "quantity"], { min: 100, max: 140, unit: "sack" })],
  ["an estimate field", set(["source", "estimate"], { amount: 100, unit: "sack" })],
  ["a rate field", set(["source", "rate"], 3)],
  ["a renewal field", set(["source", "renewal"], "daily")],
  // duplicates / inconsistent references
  [
    "duplicate access aspects",
    set(
      ["source", "access_facts"],
      [
        { aspect: "terrain", statement: "On foot." },
        { aspect: "terrain", statement: "By boat." },
      ],
    ),
  ],
  ["a locus of another world", set(["locus", "world_id"], "world-other")],
  ["a source of another world", set(["source", "world_id"], "world-other")],
  ["a source at another locus", set(["source", "locus_id"], "locus-elsewhere")],
  ["a world identity that is a key path", set(["world", "world_id"], "world/ashfall")],
  // non-ORIGINAL / delegated
  [
    "an exact-named-setting world",
    set(["world", "reference_causal_basis"], {
      mode: "EXACT_NAMED_SETTING",
      setting: "Somewhere real",
      era_version_continuity: null,
    }),
  ],
  [
    "an inspired-by world",
    set(["world", "reference_causal_basis"], {
      mode: "INSPIRED_BY",
      donor: "a book",
      structural_grammar: "its shape",
    }),
  ],
  [
    "a factual-historical world",
    set(["world", "reference_causal_basis"], { mode: "FACTUAL_HISTORICAL", scope: "1850" }),
  ],
  [
    "a delegated 'Surprise Me' world",
    set(["world", "reference_causal_basis"], { mode: "DELEGATED" }),
  ],
  [
    "an unsealed delegation on an ORIGINAL world",
    set(["world", "reference_causal_basis"], {
      mode: "ORIGINAL",
      established_canon: "Invented.",
      delegation: { selector: "Surprise Me" },
    }),
  ],
  ["a delegation selector on the world", set(["world", "surprise_me"], true)],
  // over-claiming: owner, role, permission, rule, version, outcome, acceptance, confirmation
  ["a caller-supplied owner", set(["owner"], "world_state")],
  ["a caller-supplied facet", set(["source", "facet"], "world_source_condition")],
  ["a role", set(["role"], "role.archivist")],
  ["a permission", set(["permission"], "permission.canon.write")],
  ["a writer", set(["writer"], { role: "role.archivist", permission: "permission.canon.write" })],
  ["a rule", set(["rule"], "wg-2026")],
  ["a version", set(["source", "version"], 7)],
  ["an expected version", set(["world", "expected_version"], 0)],
  [
    "a publication label",
    set(["publication"], { group_id: "g", intent_id: "i", cause: "c", basis: "b", secrecy: "s" }),
  ],
  ["a group identity", set(["group_id"], "g")],
  ["an acceptance verdict", set(["accepted"], true)],
  ["a confirmed flag", set(["confirmed"], true)],
  ["a derived depth", set(["source", "depth"], "EXACT_FINITE")],
  ["a derived recoverable", set(["source", "recoverable"], { amount: 120, unit: "sack" })],
  ["a delivered record", set(["source", "delivered"], [])],
  ["an exhaustion", set(["source", "exhaustion"], null)],
  ["an establishment", set(["source", "establishment"], { kind: "INITIAL_SETTING_FACT" })],
  ["a downstream outcome", set(["outcome"], "RECEIVED")],
  ["an extraction permission", set(["source", "can_extract"], true)],
  ["an actor history", set(["actors"], [{ actor_id: "a" }])],
  ["a player character", set(["pc"], { pc_id: "p" })],
  ["a wrong format", set(["format"], "something-else")],
  ["a wrong format version", set(["format_version"], 2)],
];

describe("an unauthored, delegated, over-claiming or inconsistent setup is refused before anything is written", () => {
  for (const [name, change] of refused) {
    it(name, async () => {
      const dirs = freshDirs();
      const doc = setupDoc();
      change(doc);
      const run = await establish(dirs, writeSetup(doc));
      expect(run.result.status).toBe("INVALID_SETUP");
      expect(run.terminal.asked()).toBe(0);
      expect(run.terminal.said).toEqual([]);
      expect(existsSync(dirs.campaignDir)).toBe(false);
      expect(existsSync(dirs.operatorDir)).toBe(false);
    });
  }

  it("the unmodified document is accepted by the same path (the matrix refuses its changes, not the document)", async () => {
    const dirs = freshDirs();
    const run = await establish(dirs, writeSetup(setupDoc()));
    expect(run.result.status).toBe("LOCALITY_READY");
  }, 60_000);

  it("a document that is not JSON, or not an object, is refused", async () => {
    for (const text of ["", "not json", "[]", "null", "42", '{"format":'])
      expect((await establish(freshDirs(), writeSetup(text))).result.status, text).toBe(
        "INVALID_SETUP",
      );
  });
});

describe("the setup file and the directory are trusted before they are used", () => {
  it("a missing file, a directory, a symlink, an over-large file and a file others can write are never read", async () => {
    const dirs = freshDirs();
    const good = writeSetup(setupDoc());
    const dir = dirname(good);

    expect((await establish(dirs, join(dir, "absent.json"))).result.status).toBe(
      "SETUP_FILE_UNREADABLE",
    );
    expect((await establish(dirs, dir)).result.status).toBe("SETUP_FILE_UNTRUSTED");

    const link = join(dir, "link.json");
    symlinkSync(good, link);
    expect((await establish(dirs, link)).result.status).toBe("SETUP_FILE_UNREADABLE");

    const big = writeSetup(" ".repeat(70 * 1024) + JSON.stringify(setupDoc()));
    expect((await establish(dirs, big)).result.status).toBe("INVALID_SETUP");

    for (const mode of [0o666, 0o662, 0o626]) {
      const loose = writeSetup(setupDoc(), mode);
      expect((await establish(dirs, loose)).result.status, mode.toString(8)).toBe(
        "SETUP_FILE_UNTRUSTED",
      );
    }
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("an existing directory that others can write, or that holds foreign content, is never adopted", async () => {
    const open = freshDirs();
    mkdirSync(open.campaignDir, { mode: 0o700 });
    chmodSync(open.campaignDir, 0o777);
    const file = writeSetup(setupDoc());
    const writable = await establish(open, file);
    expect(writable.result.status).toBe("PACKAGE_UNUSABLE");
    expect(writable.terminal.asked()).toBe(0);

    const foreign = freshDirs();
    mkdirSync(foreign.campaignDir, { mode: 0o700 });
    writeFileSync(join(foreign.campaignDir, "notes.txt"), "mine");
    const occupied = await establish(foreign, file);
    expect(occupied.result.status).toBe("PACKAGE_UNUSABLE");
    expect(occupied.terminal.asked()).toBe(0);
    expect(existsSync(join(foreign.campaignDir, "manifest.json"))).toBe(false);
  });

  it("an empty directory the operator owns is used and the package inside it is created", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { mode: 0o700 });
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
  }, 60_000);
});

describe("the confirmation is the operator's alone", () => {
  it("a declined, mistyped, stale or absent confirmation writes nothing", async () => {
    for (const reply of [
      "decline",
      "eof",
      "stale",
      (p: string) => `${p} `.replace(/.$/, "x"),
    ] as const) {
      const dirs = freshDirs();
      const run = await establish(dirs, writeSetup(setupDoc()), [reply as any]);
      expect(run.result.status).toBe("DECLINED");
      expect(existsSync(dirs.campaignDir)).toBe(false);
    }
  });

  it("another verb's confirmation does not confirm it", async () => {
    const dirs = freshDirs();
    const run = await establish(dirs, writeSetup(setupDoc()), [
      (p: string) => p.replace("establish-locality", "relocate"),
    ]);
    expect(run.result.status).toBe("DECLINED");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("shows the exact quantity, unit and access facts before asking, and states what it does not do", async () => {
    const dirs = freshDirs();
    const run = await establish(dirs, writeSetup(setupDoc()), ["decline"]);
    const text = run.terminal.said.join("\n");
    expect(text).toContain("EXACT quantity: 120 sack");
    expect(text).toContain('terrain: "Reachable on foot across the dry crust at low tide."');
    expect(text).toContain("creates no character, actor, cohort or relationship, advances no time");
    expect(text).toContain("not an estimate, availability verdict or yield");
    expect(text.indexOf("EXACT quantity")).toBeLessThan(text.indexOf("To confirm, type exactly"));
  });

  it("quotes authored text so a control sequence in it cannot rewrite the console", async () => {
    const dirs = freshDirs();
    const doc = setupDoc();
    doc.world.premise = "line one\n\u001b[2Jline two";
    const run = await establish(dirs, writeSetup(doc), ["decline"]);
    const text = run.terminal.said.join("\n");
    expect(text).not.toContain("\u001b");
    expect(text).toContain('"line one\\n\\u001b[2Jline two"');
  });
});
