// Unit evidence for the pure parts of the original player-character authorship slice: what a statement may be, how one revision cycle
// applies, which Existence Contract a draft compiles to, and how the Mirror (and so the recorded acceptance) is derived from content.
import { describe, expect, it } from "vitest";
import { ExistenceContractSchema, type OwnerFact } from "@immortalis/contracts";
import {
  EMPTY_DRAFT,
  MAX_LIST_ITEMS,
  MAX_STATEMENT_CHARS,
  applyEdits,
  bindingIdOf,
  compileContract,
  insertionBlockers,
  judgePresence,
  judgeStatement,
  mirrorItems,
  mirrorPanel,
  missingOf,
  parseEdit,
  releaseIdOf,
  releaseProblems,
  type CharacterDraft,
  type Edit,
} from "@immortalis/operator";
import type { KeepRecord } from "../../packages/operator/src/original-pc-keep.ts";

const complete: CharacterDraft = {
  identity: "A salt-raker",
  contact: { kind: "CONTACT_ANCHOR", surfaces: ["a weathered coat", "a local accent"] },
  embodiment: "one human body",
  continuity: "I live once",
  exceptions: ["left-handed"],
  open: ["my past"],
  possessions: ["a knife"],
};

const edit = (line: string): Edit => {
  const p = parseEdit(line);
  if (!p.ok) throw new Error(p.reason);
  return p.edit;
};

describe("an authored statement", () => {
  it('is classified by the player ("me:"), trimmed, non-empty, bounded and free of control characters, and is otherwise kept exactly', () => {
    expect(judgeStatement("  me:  I am a miller.  ")).toEqual({ ok: true, text: "I am a miller." });
    expect(judgeStatement("ME: I am a miller.")).toEqual({ ok: true, text: "I am a miller." });
    for (const bad of ["   ", "me:", "me:   ", "me: a\u001b[2Jb", "me: a\nb"])
      expect(judgeStatement(bad).ok, bad).toBe(false);
    expect(judgeStatement(`me: ${"x".repeat(MAX_STATEMENT_CHARS - 4)}`).ok).toBe(true);
    expect(judgeStatement(`me: ${"x".repeat(MAX_STATEMENT_CHARS)}`).ok).toBe(false);
  });

  it("is never defaulted to the player's own: an unclassified statement, whatever it says, is refused", () => {
    for (const s of [
      "I am a miller.",
      "I hold the legal office of governor of this city",
      "A hundred independent sworn soldiers answer my orders",
    ]) {
      const j = judgeStatement(s);
      expect(j.ok, s).toBe(false);
      if (!j.ok) expect(j.reason).toContain('begin with "me:"');
    }
  });

  it("is refused when the player classifies it as about anything else, whatever the case", () => {
    for (const s of [
      "world: I am a baron",
      "World:I am a baron",
      "about-the-world: I am a baron",
      "About-The-World:I am a baron",
    ]) {
      const j = judgeStatement(s);
      expect(j.ok, s).toBe(false);
      if (!j.ok) expect(j.reason).toContain("wider world");
    }
  });

  it("a presence statement is the player's explicit world-facing fact: unclassified is lawful, a wider-world claim form and control characters are not", () => {
    expect(judgePresence("  I have always lived here.  ")).toEqual({
      ok: true,
      text: "I have always lived here.",
    });
    expect(judgePresence("about-the-world: I arrived by portal").ok).toBe(false);
    expect(judgePresence("here\u001b[0m").ok).toBe(false);
    expect(judgePresence("").ok).toBe(false);
  });
});

describe("a revision line", () => {
  it("parses only the closed grammar", () => {
    expect(edit("set identity me: A baker")).toEqual({
      op: "set",
      field: "identity",
      text: "A baker",
    });
    expect(edit("set contact me: A bell")).toEqual({ op: "set-contact", text: "A bell" });
    expect(edit("set no-contact me: nothing registers me")).toEqual({
      op: "set-no-contact",
      text: "nothing registers me",
    });
    expect(edit("add exception me: can hold breath")).toEqual({
      op: "add",
      list: "exception",
      text: "can hold breath",
    });
    expect(edit("remove open 2")).toEqual({ op: "remove", list: "open", n: 2 });
    for (const bad of [
      "",
      "change identity A baker",
      "set nonsense x",
      "add nothing x",
      "remove open 0",
      "remove open two",
      "set identity",
      "set identity A baker",
      "add possession bread",
      "set identity world: A baker",
      "add exception about-the-world: I rule",
    ])
      expect(parseEdit(bad).ok, bad).toBe(false);
  });
});

describe("one revision cycle is applied to the whole, all or none", () => {
  it("applies every edit together and leaves the input draft untouched", () => {
    const r = applyEdits(complete, [
      edit("set identity me: A baker"),
      edit("add possession me: bread"),
      edit("remove contact 1"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.identity).toBe("A baker");
      expect(r.draft.possessions).toEqual(["a knife", "bread"]);
      expect(r.draft.contact).toEqual({ kind: "CONTACT_ANCHOR", surfaces: ["a local accent"] });
    }
    expect(complete.identity).toBe("A salt-raker");
  });

  it("refuses the whole cycle when any edit cannot apply", () => {
    for (const edits of [
      [edit("set identity me: A baker"), edit("remove exception 5")],
      [edit("set identity me: A baker"), edit("remove contact 3")],
    ])
      expect(applyEdits(complete, edits).ok).toBe(false);
    const noContact = applyEdits(EMPTY_DRAFT, [edit("set no-contact me: nothing registers me")]);
    expect(noContact.ok).toBe(true);
    if (noContact.ok)
      expect(applyEdits(noContact.draft, [edit("add contact me: a bell")]).ok).toBe(false);
  });

  it("bounds every list", () => {
    let d: CharacterDraft = EMPTY_DRAFT;
    for (let i = 0; i < MAX_LIST_ITEMS; i++) {
      const r = applyEdits(d, [edit(`add possession me: item ${i}`)]);
      expect(r.ok).toBe(true);
      if (r.ok) d = r.draft;
    }
    expect(applyEdits(d, [edit("add possession me: one more")]).ok).toBe(false);
  });

  it("removing the last contact surface leaves the contact unstated, never a silent no-contact", () => {
    const one = applyEdits(complete, [edit("remove contact 1"), edit("remove contact 1")]);
    expect(one.ok).toBe(true);
    if (one.ok) {
      expect(one.draft.contact).toBeNull();
      expect(missingOf(one.draft)[0]).toContain("contact");
      expect(compileContract("pc-x", one.draft)).toBeNull();
    }
  });
});

describe("the Existence Contract a draft compiles to", () => {
  it("states only what the player stated: every claim PLAYER-AUTHORED, nothing inherited, hypothesised, delegated or compiled", () => {
    const c = compileContract("pc-x", complete)!;
    expect(ExistenceContractSchema.safeParse(c).success).toBe(true);
    expect(c.baseline_exception).toEqual({
      safely_inherited: [],
      player_overrides: [{ statement: "left-handed", provenance: "PLAYER-AUTHORED" }],
      hypotheses: [],
      unresolved: ["my past"],
    });
    expect(c.existing_actor_compilation).toBeUndefined();
    expect(c.release.mirror_acceptance.accepted_by).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
  });

  it("is null while any required answer is missing", () => {
    expect(missingOf(EMPTY_DRAFT)).toHaveLength(4);
    expect(compileContract("pc-x", EMPTY_DRAFT)).toBeNull();
    expect(compileContract("pc-x", { ...complete, continuity: null })).toBeNull();
  });
});

describe("the Mirror is derived from content, so what was shown, accepted and stored cannot drift", () => {
  it("the recorded acceptance is exactly the Mirror of the contract's own content, in display order", () => {
    const c = compileContract("pc-x", complete)!;
    expect(c.release.mirror_acceptance.items_displayed_and_accepted).toEqual(
      mirrorItems(c).map((i) => i.id),
    );
    const slots = mirrorItems(c).map((i) => i.id.split("/")[1]);
    expect(slots).toEqual([
      "identity",
      "embodiment",
      "continuity",
      "contact-1",
      "contact-2",
      "exception-1",
      "possession-1",
      "open-1",
      "world-claims-none",
      "delegation-none",
    ]);
  });

  it("every mandatory confirmation item is present: identity, continuity, embodiment, contact or NO-CONTACT, entry facts, wider-world and delegation status", () => {
    const noContact = compileContract("pc-x", {
      ...complete,
      contact: { kind: "NO_CONTACT", statement: "nothing registers me" },
    })!;
    const slots = mirrorItems(noContact).map((i) => i.id.split("/")[1]);
    expect(slots).toContain("no-contact");
    expect(slots).toContain("world-claims-none");
    expect(slots).toContain("delegation-none");
  });

  it("an item's identity is its slot and its statement: changing the statement changes the accepted id", () => {
    const a = compileContract("pc-x", complete)!;
    const b = compileContract("pc-x", { ...complete, identity: "A salt-raker, forty" })!;
    expect(a.release.mirror_acceptance.items_displayed_and_accepted[0]).not.toBe(
      b.release.mirror_acceptance.items_displayed_and_accepted[0],
    );
    expect(a.release.mirror_acceptance.items_displayed_and_accepted.slice(1)).toEqual(
      b.release.mirror_acceptance.items_displayed_and_accepted.slice(1),
    );
  });

  it("the panel shows the whole Mirror, quotes authored text so it cannot restyle the console, and says what it is", () => {
    const c = compileContract("pc-x", { ...complete, identity: 'A "quoted" raker' })!;
    const panel = mirrorPanel("pc-x", mirrorItems(c), "display 1", []).join("\n");
    for (const i of mirrorItems(c)) expect(panel).toContain(JSON.stringify(i.text));
    expect(panel).toContain("OOC DEVELOPMENT");
    expect(panel).toContain("If you want your character to begin with something specific");
  });
});

const SECRET = "a".repeat(64);
const keepOf = (
  campaignId: string,
  c: ReturnType<typeof compileContract>,
  secret = SECRET,
): KeepRecord => ({
  format: "immortalis-operator-character-keep",
  format_version: 1,
  campaign_id: campaignId,
  operator_uid: 0,
  pc_id: c!.pc_id,
  secret,
  contract: c!,
});

describe("publication identities are keyed digests of the exact confirmed content under the retained secret", () => {
  it("are deterministic, and differ for any different content or secret", () => {
    const c = compileContract("pc-x", complete)!;
    expect(releaseIdOf(SECRET, "camp", c)).toBe(
      releaseIdOf(SECRET, "camp", compileContract("pc-x", complete)!),
    );
    expect(releaseIdOf(SECRET, "camp", c)).not.toBe(releaseIdOf(SECRET, "camp-2", c));
    expect(releaseIdOf(SECRET, "camp", c)).not.toBe(releaseIdOf("b".repeat(64), "camp", c));
    expect(releaseIdOf(SECRET, "camp", c)).not.toBe(
      releaseIdOf(SECRET, "camp", compileContract("pc-y", complete)!),
    );
    const pins = { pc: 1, world: 1, locus: 1 };
    const b = bindingIdOf(SECRET, "camp", "pc-x", "w", "l", pins, "I am here");
    expect(b).toBe(bindingIdOf(SECRET, "camp", "pc-x", "w", "l", pins, "I am here"));
    for (const other of [
      bindingIdOf(SECRET, "camp", "pc-x", "w", "l", pins, "I am there"),
      bindingIdOf(SECRET, "camp", "pc-x", "w", "l2", pins, "I am here"),
      bindingIdOf(SECRET, "camp", "pc-x", "w", "l", { ...pins, world: 2 }, "I am here"),
      bindingIdOf("b".repeat(64), "camp", "pc-x", "w", "l", pins, "I am here"),
    ])
      expect(other).not.toBe(b);
  });
});

describe("a committed contract is recognised as this command's only with the retained keep and the identities keyed by it", () => {
  const factOf = (
    c: ReturnType<typeof compileContract>,
    over: Partial<OwnerFact["provenance"]> = {},
    version = 1,
    secret = SECRET,
  ) => {
    const id = releaseIdOf(secret, "camp", c!);
    return {
      key: "pc/pc-x/existence-contract",
      owner: "pc_existence",
      facet: "existence_contract",
      value: c,
      unit: null,
      basis: "local-operator-confirmed-choice",
      secrecy: "local-operator-session",
      version,
      provenance: {
        group_id: `operator-pc:${id}:release`,
        intent_id: `operator-pc-intent:${id}:release`,
        cause: `operator-pc-cause:${id}`,
        rule: {},
        ...over,
      },
    } as unknown as OwnerFact;
  };

  it("accepts the keyed identities with the matching keep, and refuses any other group, intent, cause, basis, version, acceptance or keep", () => {
    const c = compileContract("pc-x", complete)!;
    const keep = keepOf("camp", c);
    expect(releaseProblems("camp", factOf(c), keep)).toEqual([]);
    expect(releaseProblems("camp", factOf(c, { group_id: "elsewhere" }), keep)).not.toEqual([]);
    expect(releaseProblems("camp", factOf(c, { cause: "elsewhere" }), keep)).not.toEqual([]);
    expect(releaseProblems("camp", factOf(c, {}, 2), keep)).not.toEqual([]);
    expect(releaseProblems("other-campaign", factOf(c), keep)).not.toEqual([]);
    // the same content under identities keyed by a different secret is not the keep's
    expect(releaseProblems("camp", factOf(c, {}, 1, "b".repeat(64)), keep)).not.toEqual([]);
    // a keep for different content does not vouch for this one
    const other = compileContract("pc-x", { ...complete, identity: "A different person" })!;
    expect(releaseProblems("camp", factOf(c), keepOf("camp", other))).not.toEqual([]);
    const forged = {
      ...c,
      release: {
        ...c.release,
        mirror_acceptance: { ...c.release.mirror_acceptance, items_displayed_and_accepted: ["x"] },
      },
    };
    expect(
      releaseProblems("camp", factOf(forged as never), keepOf("camp", forged as never)),
    ).not.toEqual([]);
    expect(
      releaseProblems("camp", { ...factOf(c), value: { junk: 1 } } as unknown as OwnerFact, keep),
    ).not.toEqual([]);
  });

  it("without a retained keep nothing is recognised, however exact the content and names are", () => {
    const c = compileContract("pc-x", complete)!;
    const problems = releaseProblems("camp", factOf(c), null);
    expect(problems.join("\n")).toContain("no keep at this console is on record");
  });
});

describe("the committed constraints a presence statement could contradict", () => {
  it("are exactly the world-law departures and the world and locus constraint lists; the premise and designation are not", () => {
    expect(
      insertionBlockers(
        { material_world_law_departures: [], insertion_supporting_constraints: [] },
        { constraints: [] },
      ),
    ).toEqual([]);
    const blockers = insertionBlockers(
      {
        material_world_law_departures: ["no flesh crosses the tideline"],
        insertion_supporting_constraints: [{ aspect: "inhabitants", statement: "no humans" }],
      },
      { constraints: [{ aspect: "access", statement: "closed" }] },
    );
    expect(blockers).toHaveLength(3);
    expect(blockers.join("\n")).toContain("world constraint inhabitants");
    expect(blockers.join("\n")).toContain("locus constraint access");
  });
});
