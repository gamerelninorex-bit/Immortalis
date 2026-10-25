/* eslint-disable @typescript-eslint/no-explicit-any -- tests build raw offers and fake transcripts */
// The pieces that make the human's review of an ORIGINAL character complete: the offered words are bounded exactly as the shipped
// authoring bounds them, the review is judged whole or refused, and the retained identity binds one campaign, one character and one
// exact candidate.
import { describe, expect, it } from "vitest";
import {
  compileContract,
  findingsLines,
  mirrorItems,
  mirrorPanel,
  type CharacterDraft,
} from "@immortalis/operator";
import { refereeCandidateItems } from "@immortalis/engine";
import {
  completeCharacterConfirmation,
  fitsCharacterConfirmation,
  parseEdits,
  parseOffer,
} from "../../apps/phone/src/chat-tools.ts";
import {
  contractSha,
  parseDraft,
  validCharacterIdentity,
  type CharacterIdentity,
} from "../../apps/phone/src/character-evidence.ts";
import { draftSha } from "../../apps/phone/src/character-recovery.ts";
import { createWebTerminal } from "../../apps/phone/src/web-terminal.ts";
import type { Run } from "../../apps/phone/src/runs.ts";
import { WORDS, draft } from "../support/chat-character.ts";

const PC = "pc-unit";
const runOf = (): Run => ({
  id: "r",
  label: "author-character",
  terminal: createWebTerminal(),
  done: false,
  uncertain: false,
});
const offered = (over: Record<string, unknown> = {}): CharacterDraft => {
  const parsed = parseOffer(draft(over));
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.value;
};

/** the lines the shipped review prints for a CLOSED candidate, built from the shipped panel and findings renderers */
function reviewLines(d: CharacterDraft, phrase = "keep-character 0123456789ab"): string[] {
  const contract = compileContract(PC, d)!;
  const candidate = refereeCandidateItems(contract);
  const decision = {
    items: candidate.map((i) => ({
      item_id: i.item_id,
      slot: i.slot,
      class:
        i.slot === "possession"
          ? "ENTRY_ENVELOPE_FINITE"
          : i.slot === "open"
            ? "UNRESOLVED_PC"
            : "INTRINSIC_PC",
    })),
  } as any;
  return [
    "Asking the AI referee host to read what you wrote ...",
    ...mirrorPanel(PC, mirrorItems(contract), "display 1", []),
    ...findingsLines(candidate, decision, "CLOSED", { host_id: "h", claimed_model: null }),
    "This is how IMMORTALIS understands your character.",
    "Keep this character exactly as shown?",
    `To confirm, type exactly "${phrase}". Anything else declines; to change something, tell your assistant what to change.`,
  ];
}
const present = (run: Run, lines: readonly string[]) => {
  for (const l of lines) run.terminal.say(l);
  void run.terminal.ask(">");
};
const expectKeep = (d: CharacterDraft) => ({
  stage: "KEEP" as const,
  contract: compileContract(PC, d)!,
});

describe("the offered words are bounded exactly as the shipped authoring bounds them", () => {
  it("accepts the ordinary offer, trims each statement, defaults the optional lists to empty", () => {
    const ok = parseOffer({ ...draft(), identity: `  ${WORDS.identity}  `, exceptions: undefined });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.identity).toBe(WORDS.identity);
      expect(ok.value.exceptions).toEqual([]);
    }
  });

  const refusals: [string, Record<string, unknown>][] = [
    ["an empty statement", { identity: "   " }],
    ["a statement with a control character", { embodiment: "a\u0007b" }],
    ["a statement beyond 500 characters", { continuity: "x".repeat(501) }],
    [
      "more than 12 entries in a list",
      { possessions: Array.from({ length: 13 }, (_, i) => `p${i}`) },
    ],
    ["no contact at all", { contact: null }],
    ["a contact with no surface", { contact: { kind: "CONTACT_ANCHOR", surfaces: [] } }],
    ["both contact kinds", { contact: { kind: "NO_CONTACT", statement: "x", surfaces: ["y"] } }],
    ["an unknown field", { role: "role.gm" }],
    ["a confirmed flag", { confirmed: true }],
    ["a campaign", { campaign_id: "other" }],
    ["a non-text statement", { identity: 7 }],
  ];
  for (const [name, over] of refusals)
    it(`refuses ${name}`, () => {
      const out = parseOffer({ ...draft(), ...over });
      expect(out.ok).toBe(false);
    });

  it("turns typed changes into the shipped edits, and refuses what is not one", () => {
    const ok = parseEdits({
      edits: [
        { op: "set", field: "identity", text: "A" },
        { op: "set-contact", text: "B" },
        { op: "set-no-contact", text: "C" },
        { op: "add", list: "possession", text: "D" },
        { op: "remove", list: "contact", n: 1 },
      ],
    });
    expect(ok.ok).toBe(true);
    for (const bad of [
      { edits: [] },
      { edits: [{ op: "set", field: "pc_id", text: "x" }] },
      { edits: [{ op: "add", list: "followers", text: "x" }] },
      { edits: [{ op: "remove", list: "open", n: 0 }] },
      { edits: [{ op: "remove", list: "open", n: 1.5 }] },
      { edits: [{ op: "grant", text: "x" }] },
      { edits: [{ op: "set", field: "identity", text: "x", confirmed: true }] },
      { edits: [{ op: "set", field: "identity", text: "" }] },
      { edits: [{ op: "set", field: "identity", text: "x" }], confirmed: true },
      { edits: Array.from({ length: 49 }, () => ({ op: "add", list: "open", text: "x" })) },
    ])
      expect(parseEdits(bad as any).ok).toBe(false);
  });
});

describe("completeCharacterConfirmation judges the review whole or refuses it", () => {
  it("returns every line of a complete review, in order, with the phrase last", () => {
    const d = offered();
    const run = runOf();
    const lines = reviewLines(d);
    present(run, lines);
    const parts = completeCharacterConfirmation(run, expectKeep(d))!;
    expect(parts).not.toBeNull();
    const all = parts.join("\n");
    for (const l of lines) expect(all).toContain(l);
    expect(all.trimEnd().endsWith(lines[lines.length - 1]!)).toBe(true);
  });

  it("refuses a transcript whose earliest lines were dropped", () => {
    const d = offered();
    const run = runOf();
    for (let i = 0; i < 2_100; i++) run.terminal.say(`filler ${i}`);
    present(run, reviewLines(d));
    expect(completeCharacterConfirmation(run, expectKeep(d))).toBeNull();
  });

  const defects: [string, (lines: string[]) => string[]][] = [
    ["a dropped Mirror item", (l) => l.filter((x) => !x.includes("you begin with"))],
    [
      "a dropped finding",
      (l) => l.filter((x) => !x.includes("[accepted as yours: ENTRY_ENVELOPE_FINITE]")),
    ],
    [
      "a dropped findings header",
      (l) => l.filter((x) => !x.startsWith("+--- AI REFEREE FINDINGS")),
    ],
    ["a dropped closing question", (l) => l.filter((x) => !x.startsWith("Keep this character"))],
    ["a review cut short before its phrase", (l) => l.slice(0, -1)],
    [
      "a phrase of the other verb",
      (l) => [...l.slice(0, -1), 'To confirm, type exactly "place-character 0123456789ab". x'],
    ],
    [
      "a finding the referee did not accept",
      (l) =>
        l.map((x) =>
          x.replace("[accepted as yours: INTRINSIC_PC]", "[NOT accepted: ACTOR_STANCE_CLAIM]"),
        ),
    ],
    [
      "a Mirror whose statement was altered",
      (l) => l.map((x) => x.replace(WORDS.embodiment, "One ordinary human bod")),
    ],
  ];
  for (const [name, defect] of defects)
    it(`refuses ${name}`, () => {
      const d = offered();
      const run = runOf();
      present(run, defect(reviewLines(d)));
      expect(completeCharacterConfirmation(run, expectKeep(d))).toBeNull();
    });

  it("refuses a review that is of another candidate than the one the operation was dispatched for", () => {
    const run = runOf();
    present(run, reviewLines(offered()));
    expect(
      completeCharacterConfirmation(run, expectKeep(offered({ embodiment: "Another form" }))),
    ).toBeNull();
  });

  it("judges a placement by its facts, exact statement, findings and separate confirmation", () => {
    const lines = [
      "PLACEMENT - a separate choice from keeping your character. Nothing is bound yet.",
      "WORLD world-x (established earlier by World-State, not by you now)",
      "+--- AI REFEREE FINDINGS (host h; verdict BIND_ELIGIBLE) ---",
      '|   your statement is read as: NATIVE_ALREADY_THERE - "ok"',
      "+---",
      "CONFIRMATION - NATIVE PRESENCE (the second, separate choice)",
      `  your statement, kept verbatim: ${JSON.stringify(WORDS.presence)}`,
      'To confirm, type exactly "place-character 0123456789ab". Anything else leaves your character released but unbound.',
    ];
    const ok = runOf();
    present(ok, lines);
    expect(
      completeCharacterConfirmation(ok, { stage: "PLACE", statement: WORDS.presence }),
    ).not.toBeNull();
    for (const bad of [
      lines.filter((l) => !l.startsWith("PLACEMENT")),
      lines.filter((l) => !l.includes("your statement, kept verbatim")),
      lines.filter((l) => !l.startsWith("+--- AI REFEREE")),
      lines.slice(0, -1),
    ]) {
      const run = runOf();
      present(run, bad);
      expect(
        completeCharacterConfirmation(run, { stage: "PLACE", statement: WORDS.presence }),
      ).toBeNull();
    }
    const other = runOf();
    present(other, lines);
    expect(
      completeCharacterConfirmation(other, { stage: "PLACE", statement: "something else" }),
    ).toBeNull();
  });

  it("the largest lawful offer is shown whole and fits the transcript; one that is not an offer never does", () => {
    const max = offered({
      exceptions: Array.from({ length: 12 }, (_, i) => `${i}${"y".repeat(499)}`.slice(0, 500)),
      open: Array.from({ length: 12 }, (_, i) => `${i}${"y".repeat(499)}`.slice(0, 500)),
      possessions: Array.from({ length: 12 }, (_, i) => `${i}${"y".repeat(499)}`.slice(0, 500)),
      contact: {
        kind: "CONTACT_ANCHOR",
        surfaces: Array.from({ length: 12 }, (_, i) => `${i}${"c".repeat(499)}`.slice(0, 500)),
      },
    });
    expect(fitsCharacterConfirmation(PC, max)).toBe(true);
    const run = runOf();
    present(run, reviewLines(max));
    const parts = completeCharacterConfirmation(run, expectKeep(max))!;
    expect(parts.length).toBeGreaterThan(1);
    expect(fitsCharacterConfirmation(PC, { ...max, identity: null })).toBe(false);
  });
});

describe("the retained identity binds one campaign, one character and one exact candidate", () => {
  const d = offered();
  const keep = (over: Record<string, unknown> = {}) => ({
    stage: "KEEP",
    pc_id: PC,
    world_id: "world-courtyard",
    locus_id: "locus-courtyard",
    draft: d,
    contract_sha256: contractSha(compileContract(PC, d)!),
    statement: null,
    ...over,
  });
  it("accepts the identities this adapter makes", () => {
    expect(validCharacterIdentity(keep())).toBe(true);
    expect(validCharacterIdentity(keep({ draft: null, contract_sha256: null }))).toBe(true);
    expect(
      validCharacterIdentity({
        stage: "PLACE",
        pc_id: PC,
        world_id: "w",
        locus_id: "l",
        draft: null,
        contract_sha256: null,
        statement: WORDS.presence,
      } satisfies CharacterIdentity),
    ).toBe(true);
  });
  it("refuses a tampered, foreign, mis-staged or padded identity", () => {
    for (const bad of [
      keep({ contract_sha256: "0".repeat(64) }),
      keep({ pc_id: "pc-other" }),
      keep({ draft: null }),
      keep({ statement: "x" }),
      keep({ stage: "BIND" }),
      keep({ extra: 1 }),
      keep({ world_id: "../escape" }),
      keep({ draft: { ...d, identity: "  untrimmed  " } }),
      { ...keep(), stage: "PLACE", draft: null, contract_sha256: null, statement: null },
      null,
      [],
    ])
      expect(validCharacterIdentity(bad)).toBe(false);
  });
  it("parses only a draft the shipped bounds admit, and its digest is of its exact content", () => {
    expect(parseDraft(d)).toEqual(d);
    expect(parseDraft({ ...d, identity: 1 })).toBeNull();
    expect(parseDraft({ ...d, open: Array.from({ length: 13 }, () => "x") })).toBeNull();
    expect(draftSha(d)).toBe(draftSha(JSON.parse(JSON.stringify(d))));
    expect(draftSha(d)).not.toBe(draftSha({ ...d, identity: "other" }));
  });
});
