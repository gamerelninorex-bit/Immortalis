/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The chat-requested ORIGINAL character (BLUE v5.2-A1): an authenticated chat host offers the player's OWN authored words; the AI referee
// host (here a SCRIPTED PLUMBING host: it proves what the engine enforces, nothing about whether an AI understood a sentence) classifies
// them; the human independently keeps the whole Mirror through the client's own surface; the shipped `author-character` operator path
// releases it (I-002); and - as a SEPARATE choice with its own referee reading and its own human confirmation - the same path binds it as
// originally present at the established place (Role Registry). A fresh owner-verified reopen reads it back.
//
// EVERYTHING HERE IS A MECHANISM TEST. The "assistant" is a script that calls typed tools; the "human" is a script that answers an
// elicitation only where a test says so. It proves transport, authority and recovery over the real service and the real owners; it is not a
// chat host, a model, a person or a client UI, and it proves nothing about the quality of any authored character.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, RefereeAdjudicationAdapter, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import { PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import { compileContract, refereeDir, runCli } from "@immortalis/operator";
import { Chat, PLAYER, REFEREE, phraseOf, type Human } from "../support/chat-client.ts";
import { Browser } from "../support/phone-browser.ts";
import {
  courtyard,
  establishViaChat,
  pendingPath,
  readsAndDeclines,
  readsAndTypes,
} from "../support/chat-setting.ts";
import { parseOffer } from "../../apps/phone/src/chat-tools.ts";
import {
  LOCALITY_CAMPAIGN,
  WORDS,
  bind,
  draft,
  follow,
  held,
  keepFiles,
  offer,
  place,
  readWords,
  ready,
  referee,
  run,
  scriptedPolicy,
  secretsOf,
  shape,
  slot,
  watch,
  wordsFile,
  SHORT,
} from "../support/chat-character.ts";

afterEach(() => vi.restoreAllMocks());

const CHALLENGE = /(keep|place)-character [0-9a-f]{12}/;

describe("MECHANISM: the player's own words are offered, reviewed whole, kept, released - and only then, separately, placed", () => {
  it("offer → complete Mirror and findings → the human's own keep → release (unbound) → separate presence statement → the human's own confirmation → binding → fresh reopen and OOC readback; nothing secret crosses the model", async () => {
    const r = await ready();
    const host = referee(r.s);
    const seen = watch(r.chat);
    try {
      const kept = await offer(r.chat, draft());
      // the human was asked once, and was shown every authored word, the referee's findings on exactly that candidate and the closing question
      expect(kept.finished.elicited).toHaveLength(1);
      const shown = kept.finished.elicited[0] as string;
      for (const w of [
        WORDS.identity,
        WORDS.contact,
        WORDS.embodiment,
        WORDS.continuity,
        WORDS.possession,
      ])
        expect(shown).toContain(JSON.stringify(w));
      expect(shown).toContain("CHARACTER MIRROR");
      expect(shown).toContain("AI REFEREE FINDINGS");
      expect(shown).toContain("Keep this character exactly as shown?");
      expect(shown).toMatch(/type exactly "keep-character [0-9a-f]{12}"/);
      expect(kept.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(kept.finished.data.character).toMatchObject({
        state: "RELEASED_UNBOUND",
        barrier: "NONE",
      });
      // released and NOT bound: keeping placed nothing anywhere
      const afterKeep = await held(r.s);
      expect(afterKeep.characters).toHaveLength(1);
      expect(afterKeep.binding).toBeUndefined();
      expect(keepFiles(r.s)).toHaveLength(1);
      expect((await r.chat.call("original_character_status")).data).toMatchObject({
        character: { state: "RELEASED_UNBOUND" },
        readiness: {
          character_kept: true,
          character_released: true,
          character_placed: false,
          campaign_ready_for_play: false,
        },
      });

      // the placement is the player's separate statement, read by the referee, confirmed on its own
      const placed = await place(r.chat);
      expect(placed.finished.elicited).toHaveLength(1);
      const asked = placed.finished.elicited[0] as string;
      expect(asked).toContain(JSON.stringify(WORDS.presence));
      expect(asked).toContain("NATIVE PRESENCE");
      expect(asked).toMatch(/type exactly "place-character [0-9a-f]{12}"/);
      expect(placed.finished.data.result.status).toBe("CHARACTER_BOUND");
      expect(placed.finished.data.character).toMatchObject({
        state: "BOUND",
        readback: { presence: WORDS.presence },
      });
      const after = await held(r.s);
      expect(after.characters).toHaveLength(1);
      expect(after.binding?.value.transition).toMatchObject({
        type: "ACTIVATION",
        basis: { bridge: "NATIVE_ALREADY_THERE", statement: WORDS.presence },
      });
      // the chat's two decisions are two referee decisions, one of each operation
      expect(after.referee.map((f) => (f.value as any).operation).sort()).toEqual([
        "I002_CLASSIFY",
        "IR_NATIVE_COMPATIBILITY",
      ]);

      // nothing the model could see carries a challenge, a human reply, a secret or a private path
      const model = seen.join("\n");
      expect(model).not.toMatch(CHALLENGE);
      for (const secret of [...secretsOf(r.s), r.s.root, r.s.operatorDir, r.s.campaignDir])
        expect(model).not.toContain(secret);
    } finally {
      await host.stop();
      await r.app.close();
    }

    // a fresh process: the ordinary open, the shipped status command and the chat status all read back the same character
    const fresh = await run(r.s, SHORT);
    try {
      const status = (await fresh.chat.call("original_character_status")).data;
      expect(status.character).toMatchObject({
        state: "BOUND",
        barrier: "NONE",
        readback: { presence: WORDS.presence, world_id: "world-courtyard" },
      });
      expect(JSON.stringify(status)).toContain(WORDS.identity);
    } finally {
      await fresh.app.close();
    }
    const said: string[] = [];
    const code = await runCli(
      [
        "character-status",
        "--campaign",
        r.s.campaignDir,
        "--campaign-id",
        r.s.config.campaignId,
        "--operator-dir",
        r.s.operatorDir,
      ],
      { out: (l) => said.push(l) },
    );
    expect(said.join("\n")).toContain("STATUS CHARACTER_BOUND");
    expect(code).toBe(0);
  }, 120_000);
});

/** The state of a slot after refusals: no keep retained, no character, no binding, the campaign head exactly as the setting left it. */
async function untouched(s: Parameters<typeof held>[0], head: number) {
  const h = await held(s);
  expect(h.characters).toHaveLength(0);
  expect(h.binding).toBeUndefined();
  expect(h.referee).toHaveLength(0);
  expect(h.revision).toBe(head);
  expect(keepFiles(s)).toEqual([]);
}

describe("MECHANISM: nothing is kept, released or placed unless the human keeps the last displayed whole", () => {
  const cases: [string, Human][] = [
    ["a declined keep", readsAndDeclines],
    ["a wrong phrase", readsAndTypes("keep-character 000000000000")],
    ["a guessed phrase for the other verb", readsAndTypes("place-character 000000000000")],
    ["silence (an empty reply)", readsAndTypes("")],
  ];
  for (const [name, human] of cases)
    it(`${name} keeps nothing: no keep record, no referee evidence, no character; the words stay retained and nothing is pending`, async () => {
      const r = await ready();
      const host = referee(r.s);
      try {
        const head = (await held(r.s)).revision;
        const out = await offer(r.chat, draft(), human);
        expect(out.finished.data.result.status).toBe("DECLINED");
        await r.app.close();
        await untouched(r.s, head);
        const again = await run(r.s, SHORT);
        try {
          const status = (await again.chat.call("original_character_status")).data;
          expect(status.character).toMatchObject({ state: "DRAFT_RETAINED", barrier: "NONE" });
          expect(status.character.draft.identity).toBe(WORDS.identity);
          // nothing is blocked: a changed offer may follow
          const next = await again.chat.call("propose_original_character", draft());
          expect(next.isError).toBe(false);
        } finally {
          await again.app.close();
        }
      } finally {
        await host.stop();
        await r.app.close().catch(() => undefined);
      }
    }, 90_000);

  it("a phrase from an EARLIER question cannot keep a later one", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const stale: string[] = [];
      const first = await offer(r.chat, draft(), async (e) => {
        if (/type exactly "/.test(e.message)) stale.push(phraseOf(e.message));
        return { action: "decline" };
      });
      expect(first.finished.data.result.status).toBe("DECLINED");
      const second = await offer(r.chat, draft(), readsAndTypes(stale[0]!));
      expect(second.finished.data.result.status).toBe("DECLINED");
      expect(keepFiles(r.s)).toEqual([]);
      expect((await held(r.s)).characters).toHaveLength(0);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);
});

describe("MECHANISM: the referee's findings decide what can be kept, never the host or the player's words about it", () => {
  const cases: [string, any, RegExp][] = [
    [
      "an office claimed as the character's own (not the character's)",
      { identity: "Maren Voss, the lawful governor of every harbour" },
      /governor/,
    ],
    [
      "a follower claimed at possession",
      { possessions: ["A loyal band of forty sworn followers"] },
      /followers/,
    ],
  ];
  for (const [name, over, match] of cases)
    it(`${name}: shown with the finding, no keep is offered, nothing is written`, async () => {
      const r = await ready();
      const policy = scriptedPolicy({
        classify: [{ match, class: "WORLD_STATE_ASSERTION" }],
      });
      const host = referee(r.s, policy);
      try {
        const head = (await held(r.s)).revision;
        const out = await offer(r.chat, draft(over));
        // the human is never asked to keep what the referee did not close
        expect(out.finished.elicited).toEqual([]);
        expect(out.finished.data.result.status).toBe("DECLINED");
        expect(out.finished.data.referee_findings.join("\n")).toContain("NOT accepted");
        expect(out.finished.data.next).toContain("revise_original_character");
        await r.app.close();
        await untouched(r.s, head);
      } finally {
        await host.stop();
        await r.app.close().catch(() => undefined);
      }
    }, 90_000);

  it("an ambiguous statement is put back to the player as the referee's question: no keep", async () => {
    const r = await ready();
    const host = referee(
      r.s,
      scriptedPolicy({ classify: [{ match: /courier/, class: "AMBIGUOUS" }] }),
    );
    try {
      const out = await offer(r.chat, draft({ exceptions: ["a courier for someone"] }));
      expect(out.finished.elicited).toEqual([]);
      expect(out.finished.data.result.status).toBe("DECLINED");
      expect(JSON.stringify(out.finished.data.referee_findings)).toContain("question for you");
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);
});

describe("MECHANISM: a revision is a new review; the earlier question and confirmation no longer stand", () => {
  it("a revision while the player is being asked withdraws that question; the old phrase and an old elicitation answer confirm nothing; the new whole is kept afresh", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const wrong = draft({
        identity: "Maren Voss, an ordinary human salt-raker of about thirty winters",
      });
      expect((await r.chat.call("propose_original_character", wrong)).isError).toBe(false);
      let oldPhrase = "";
      let newPhrase = "";
      let revised: any;
      let calls = 0;
      const answered = await r.chat.call("await_action", { wait_seconds: 10 }, async (e) => {
        if (!/type exactly "/.test(e.message)) return { action: "accept", content: {} };
        calls++;
        if (calls === 1) {
          oldPhrase = phraseOf(e.message);
          expect(e.message).toContain("thirty winters");
          // while the human is reading the first whole, the assistant is told of a correction: a NEW offer
          revised = await r.chat.call("revise_original_character", {
            edits: [{ op: "set", field: "identity", text: WORDS.identity }],
          });
          // the human's answer to the OLD question arrives late, with the phrase that was right for it
          return { action: "accept", content: { reply: oldPhrase } };
        }
        // the client now asks about the NEW whole: it shows the correction, and the old phrase is not this question's
        newPhrase = phraseOf(e.message);
        expect(e.message).toContain("forty winters");
        expect(e.message).not.toContain("thirty winters");
        expect(newPhrase).not.toBe(oldPhrase);
        return { action: "accept", content: { reply: oldPhrase } };
      });
      expect(revised.isError).toBe(false);
      expect(calls).toBe(2);
      expect(answered.data.result.status).toBe("DECLINED");
      // the old answer confirmed nothing
      expect(keepFiles(r.s)).toEqual([]);
      expect((await held(r.s)).characters).toHaveLength(0);
      expect(keepFiles(r.s)).toEqual([]);
      // the same revised whole, offered again, is kept by its own fresh phrase
      const third = await offer(r.chat, draft({ identity: WORDS.identity }));
      expect(third.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const c = (await held(r.s)).characters[0]!.value as any;
      expect(c.identity_agency.statement).toBe(WORDS.identity);
      expect(JSON.stringify(c)).not.toContain("thirty winters");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("typed changes apply to the whole or not at all; an incomplete result is retained and nothing is asked", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect(
        (
          await r.chat.call("revise_original_character", {
            edits: [{ op: "add", list: "open", text: "x" }],
          })
        ).isError,
      ).toBe(true);
      // retain a first whole (declined), then revise it
      const first = await offer(r.chat, draft(), readsAndDeclines);
      expect(first.finished.data.result.status).toBe("DECLINED");
      const bad = await r.chat.call("revise_original_character", {
        edits: [
          { op: "add", list: "possession", text: "A lantern" },
          { op: "remove", list: "possession", n: 9 },
        ],
      });
      expect(bad.isError).toBe(true);
      expect(bad.text).toContain("the character is unchanged");
      expect(readWords(r.s).draft.possessions).toEqual([WORDS.possession]);
      // removing the only contact surface leaves the character incomplete: retained, not asked
      const gap = await r.chat.call("revise_original_character", {
        edits: [{ op: "remove", list: "contact", n: 1 }],
      });
      expect(gap.isError).toBe(false);
      expect(gap.data.retained).toMatchObject({ state: "DRAFT_RETAINED" });
      expect(gap.data.retained.missing.join(" ")).toContain("contact");
      expect(r.app.server.listening).toBe(true);
      const refereeAsked = (await held(r.s)).referee;
      expect(refereeAsked).toHaveLength(0);
      // an explicit no-contact is a lawful answer and is shown as such
      const fixed = await r.chat.call("revise_original_character", {
        edits: [{ op: "set-no-contact", text: "The world has no way to register me" }],
      });
      expect(fixed.isError).toBe(false);
      const done = await follow(r.chat);
      expect(done.elicited[0]).toContain("NO-CONTACT");
      expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM: placement is a separate choice; coexistence, a keep or a role binding never place the character", () => {
  it("before a kept and released character exists, a placement is refused and nothing is asked; after the keep nothing is placed until the player states it", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const early = await r.chat.call("place_original_character", { statement: WORDS.presence });
      expect(early.isError).toBe(true);
      expect(early.text).toContain("needs a released character");
      const kept = await offer(r.chat);
      expect(kept.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      // no statement, no binding: shared names, a released character and an established place are not a presence
      expect((await held(r.s)).binding).toBeUndefined();
      expect((await r.chat.call("original_character_status")).data.character.state).toBe(
        "RELEASED_UNBOUND",
      );
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  const unsupported: [string, string, any][] = [
    [
      "a portal arrival (not a native presence)",
      "I stepped through a portal and arrived in the walled courtyard.",
      { bridge: { match: /portal/, mode: "PORTAL" } },
    ],
    [
      "a statement the established facts cannot bear on (the referee cannot tell)",
      "I may or may not be somewhere near the courtyard.",
      { unclear: /./ },
    ],
  ];
  for (const [name, statement, ir] of unsupported)
    it(`${name}: the referee's reading is shown, no confirmation is asked, exactly RELEASED_UNBOUND remains`, async () => {
      const r = await ready();
      const host = referee(r.s, scriptedPolicy({ ir }));
      try {
        expect((await offer(r.chat)).finished.data.result.status).toBe(
          "CHARACTER_RELEASED_UNBOUND",
        );
        const before = await held(r.s);
        const out = await place(r.chat, statement);
        expect(out.finished.elicited).toEqual([]);
        expect(out.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
        expect(out.finished.data.character.state).toBe("RELEASED_UNBOUND");
        const after = await held(r.s);
        expect(after.binding).toBeUndefined();
        expect(after.characters).toHaveLength(1);
        expect(after.revision).toBe(before.revision);
        expect(out.finished.data.referee_findings.join("\n")).toContain("AI REFEREE FINDINGS");
      } finally {
        await host.stop();
        await r.app.close();
      }
    }, 90_000);

  it("a declined, wrong or stale placement phrase binds nothing; the character is exactly released-unbound and a later statement is a fresh choice", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      for (const human of [
        readsAndDeclines,
        readsAndTypes("place-character 000000000000"),
        readsAndTypes(""),
      ]) {
        const out = await place(r.chat, WORDS.presence, human);
        expect(out.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
        expect((await held(r.s)).binding).toBeUndefined();
      }
      // the keep's own phrase cannot place
      const keepPhrase = readWords(r.s).draft ? "keep-character 000000000000" : "";
      const wrongVerb = await place(r.chat, WORDS.presence, readsAndTypes(keepPhrase));
      expect(wrongVerb.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const bound = await place(r.chat, WORDS.presence);
      expect(bound.finished.data.result.status).toBe("CHARACTER_BOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("a statement of the player's that the keep never contained is the placement's own: a changed statement is a fresh question", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const first = await place(r.chat, "I was born in this courtyard.", readsAndDeclines);
      expect(first.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const second = await place(r.chat, WORDS.presence);
      expect(second.finished.data.result.status).toBe("CHARACTER_BOUND");
      expect((await held(r.s)).binding?.value.transition).toMatchObject({
        basis: { statement: WORDS.presence },
      });
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);
});

const long = (tag: string, i: number, n = 470) =>
  `${tag}-${String(i).padStart(2, "0")}-start ${"é😀 ".repeat(40)}${"x".repeat(n - 150)} ${tag}-${String(i).padStart(2, "0")}-end`.slice(
    0,
    n,
  );

describe("MECHANISM: the confirmation shows the WHOLE mandatory review, never the last 6,000 characters of it", () => {
  const big = () =>
    draft({
      identity: `Early-field marker. ${WORDS.identity}`,
      exceptions: Array.from({ length: 12 }, (_, i) => long("exception", i)),
      open: Array.from({ length: 12 }, (_, i) => long("open", i)),
      possessions: [
        ...Array.from({ length: 11 }, (_, i) => long("possession", i)),
        "The very last possession, with a final marker 𝔘𝔫𝔦𝔠𝔬𝔡𝔢",
      ],
    });

  it("a Mirror of more than 6,000 characters (Unicode included) carries its first and its last field, in order, in several parts; reading a part confirms nothing and only the last carries the phrase", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const input = big();
      const kept = await offer(r.chat, input);
      const parts = kept.finished.elicited as string[];
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.length).toBeLessThan(12);
      parts.forEach((p, i) => {
        expect(p).toContain(`[Part ${i + 1} of ${parts.length}]`);
        expect(/type exactly "/.test(p)).toBe(i === parts.length - 1);
        if (i < parts.length - 1) expect(p).toContain("This part confirms nothing");
      });
      const all = parts.join("\n");
      expect(all.length).toBeGreaterThan(6000);
      // every authored statement is there whole (the Mirror), and again in the referee's findings
      const statements: string[] = [
        input.identity,
        input.embodiment,
        input.continuity,
        ...input.contact.surfaces,
        ...input.exceptions,
        ...input.possessions,
        ...input.open,
      ];
      for (const t of statements) {
        const q = JSON.stringify(t);
        expect(all.split(q).length - 1, t.slice(0, 20)).toBeGreaterThanOrEqual(2);
      }
      expect(all).toContain("Early-field marker");
      expect(all).toContain("final marker 𝔘𝔫𝔦𝔠𝔬𝔡𝔢");
      expect(kept.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      // what is held is exactly what was shown
      const c = (await held(r.s)).characters[0]!.value as any;
      expect(c.baseline_exception.player_overrides.map((x: any) => x.statement)).toEqual(
        input.exceptions,
      );
      expect(c.entry_envelope.items.map((x: any) => x.statement)).toEqual(input.possessions);
      expect(c.baseline_exception.unresolved).toEqual(input.open);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("withdrawing at an earlier part, or accepting every part and then giving a wrong phrase, confirms nothing", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      let n = 0;
      const withdraws: Human = () =>
        ++n === 2 ? { action: "decline" } : { action: "accept", content: {} };
      const first = await offer(r.chat, big(), withdraws);
      expect(first.finished.data.result.status).toBe("DECLINED");
      expect(n).toBe(2);
      const second = await offer(r.chat, big(), readsAndTypes("keep-character 000000000000"));
      expect(second.finished.data.result.status).toBe("DECLINED");
      expect(keepFiles(r.s)).toEqual([]);
      expect((await held(r.s)).characters).toHaveLength(0);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("a transcript that no longer holds the review from its start is declined before any confirmation can be given: nothing is asked, nothing is kept", async () => {
    const { authorCharacter } = await import("@immortalis/operator");
    const r = await ready({
      ...SHORT,
      character: {
        ...SHORT.character,
        // the channel loses the earliest lines of the run (the transcript keeps a bounded number)
        author: async (p) => {
          for (let i = 0; i < 2_100; i++) p.terminal.say(`filler ${i}`);
          return authorCharacter(p);
        },
      },
    });
    const host = referee(r.s);
    try {
      const out = await offer(r.chat, draft());
      expect(out.finished.elicited).toEqual([]);
      expect(out.finished.data.result.status).toBe("DECLINED");
      expect(out.finished.data.confirmation_delivery).toContain("could not be shown to them");
      expect(keepFiles(r.s)).toEqual([]);
      expect((await held(r.s)).characters).toHaveLength(0);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("a review the engine's own lines do not carry whole (a dropped Mirror item) is declined by the same judgement", async () => {
    const { authorCharacter } = await import("@immortalis/operator");
    const r = await ready({
      ...SHORT,
      character: {
        ...SHORT.character,
        author: async (p) =>
          authorCharacter({
            ...p,
            terminal: {
              ...p.terminal,
              // a lossy channel: a Mirror line of the possession never reaches the transcript
              say: (t: string) => {
                if (!/you begin with/.test(t)) p.terminal.say(t);
              },
            },
          }),
      },
    });
    const host = referee(r.s);
    try {
      const out = await offer(r.chat, draft());
      expect(out.finished.elicited).toEqual([]);
      expect(out.finished.data.result.status).toBe("DECLINED");
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM: only the authorization that asked can answer a confirmation, and each grant has its own tools", () => {
  const NEW_TOOLS = [
    "propose_original_character",
    "revise_original_character",
    "place_original_character",
    "resume_original_character",
    "original_character_status",
  ];

  it("a referee-only grant is offered none of the character tools and cannot call them; a player-only grant cannot call the referee tools", async () => {
    const r = await ready();
    try {
      const ref = new Chat(r.s.base);
      ref.clientId = r.chat.clientId;
      expect((await ref.link("referee", { referee: REFEREE })).ok).toBe(true);
      await ref.init({ elicitation: {} });
      const listed = (await ref.rpc("tools/list")).json.result.tools.map((t: any) => t.name);
      for (const n of NEW_TOOLS) expect(listed).not.toContain(n);
      for (const n of NEW_TOOLS) expect((await ref.call(n, {})).json.error.code, n).toBe(-32602);
      const playerListed = (await r.chat.rpc("tools/list")).json.result.tools.map(
        (t: any) => t.name,
      );
      for (const n of NEW_TOOLS) expect(playerListed).toContain(n);
      for (const n of ["referee_list_tasks", "referee_get_task", "referee_submit_decision"]) {
        expect(playerListed).not.toContain(n);
        expect((await r.chat.call(n, { host_id: "gm-setup" })).json.error.code, n).toBe(-32602);
      }
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a referee-only grant of the same registered client, answering with the correct keep phrase, is refused and nothing is kept; the player still can", async () => {
    const r = await ready({ ...SHORT, chat: { elicitMs: 1500 } });
    const host = referee(r.s);
    try {
      const ref = new Chat(r.s.base);
      ref.clientId = r.chat.clientId;
      expect((await ref.link("referee", { referee: REFEREE })).ok).toBe(true);
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(false);
      const forged: number[] = [];
      let silent: any;
      for (let i = 0; i < 4; i++) {
        silent = await r.chat.call("await_action", { wait_seconds: 5 }, async (e) => {
          if (!/type exactly "/.test(e.message)) return { action: "accept", content: {} };
          const res = await fetch(`${r.s.base}/mcp`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...ref.headers({ "mcp-session-id": r.chat.session }),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "elicit-0",
              result: { action: "accept", content: { reply: phraseOf(e.message) } },
            }),
          });
          forged.push(res.status);
          return null;
        });
        if (forged.length > 0) break;
      }
      expect(forged).toEqual([404]);
      expect(silent.data.state).toBe("AWAITING_CONFIRMATION");
      expect(keepFiles(r.s)).toEqual([]);
      const done = await follow(r.chat);
      expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect((await held(r.s)).characters).toHaveLength(1);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  it("a second session of the same grant cannot answer the first session's question", async () => {
    const r = await ready({ ...SHORT, chat: { elicitMs: 1500 } });
    const host = referee(r.s);
    try {
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(false);
      const other = new Chat(r.s.base);
      other.clientId = r.chat.clientId;
      other.access = r.chat.access;
      await other.init({ elicitation: {} });
      const forged: number[] = [];
      for (let i = 0; i < 4 && forged.length === 0; i++)
        await r.chat.call("await_action", { wait_seconds: 5 }, async (e) => {
          if (!/type exactly "/.test(e.message)) return { action: "accept", content: {} };
          const res = await fetch(`${r.s.base}/mcp`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...other.headers(),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "elicit-0",
              result: { action: "accept", content: { reply: phraseOf(e.message) } },
            }),
          });
          forged.push(res.status);
          return null;
        });
      expect(forged).toHaveLength(1);
      expect(forged[0]).not.toBe(200);
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  it("the disclosed fallback page shows the whole review and is the player's own channel: the assistant's token cannot reach it, and the keep made there is the keep", async () => {
    const s = await slot();
    await bind(s);
    const r = await run(s, SHORT, { scope: "player", player: PLAYER }, {});
    const host = referee(s);
    try {
      expect((await r.chat.call("propose_original_setting", courtyard())).isError).toBe(false);
      const page = new Browser(s.base);
      expect((await page.login("player", PLAYER)).status).toBe(200);
      const settle = await page.untilPrompt("play");
      const setupPhrase = /type exactly "([^"]+)"/.exec(
        settle.seen.map((l: any) => l.text).join("\n"),
      )![1]!;
      expect(
        (
          await page.req("POST", "/api/play/reply", {
            prompt_id: settle.snap.pending.id,
            text: setupPhrase,
          })
        ).status,
      ).toBe(200);
      expect((await follow(r.chat, null)).data.result.status).toBe("LOCALITY_READY");

      const big = draft({ exceptions: Array.from({ length: 12 }, (_, i) => long("exception", i)) });
      expect((await r.chat.call("propose_original_character", big)).isError).toBe(false);
      const waiting = await r.chat.call("await_action", { wait_seconds: 5 });
      expect(waiting.data.state).toBe("AWAITING_CONFIRMATION");
      expect(waiting.data.confirm_page).toBe(`${s.config.publicUrl}/confirm`);
      expect(keepFiles(s)).toEqual([]);
      // the assistant's token cannot reach the page's reply path
      expect(
        (
          await fetch(`${s.base}/api/play/reply`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${r.chat.access}`,
            },
            body: JSON.stringify({ prompt_id: "x", text: "y" }),
          })
        ).status,
      ).toBe(401);
      const step = await page.untilPrompt("play");
      const shown = step.seen.map((l: any) => l.text).join("\n");
      for (const t of [WORDS.identity, ...big.exceptions])
        expect(shown).toContain(JSON.stringify(t));
      const phrase = /type exactly "([^"]+)"/.exec(shown)![1]!;
      expect(JSON.stringify(waiting.data)).not.toContain(phrase);
      expect(
        (
          await page.req("POST", "/api/play/reply", {
            prompt_id: step.snap.pending.id,
            text: phrase,
          })
        ).status,
      ).toBe(200);
      const done = await follow(r.chat, null);
      expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("a client without elicitation is never asked on the assistant's side: it is pointed at the disclosed page and nothing is kept", async () => {
    const s = await slot();
    await bind(s);
    const r = await run(s, SHORT, { scope: "player", player: PLAYER }, {});
    const host = referee(s);
    try {
      const est = await r.chat.call("propose_original_setting", courtyard());
      expect(est.isError).toBe(false);
      // an ordinary client that cannot ask the human gets no way to answer for them
      const asked = await r.chat.call("await_action", { wait_seconds: 5 });
      expect(asked.data.state).toBe("AWAITING_CONFIRMATION");
      expect(asked.data.confirm_page).toBe(`${s.base}/confirm`);
      expect(JSON.stringify(asked.data)).not.toMatch(CHALLENGE);
      expect(existsSync(s.campaignDir)).toBe(false);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 60_000);
});

describe("static: the evidence module only reads, and the tools carry no confirmation, identity or authority channel", () => {
  const code = (f: string) =>
    readFileSync(join("apps/phone/src", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  it("character-evidence.ts writes, removes, creates and reclaims nothing", () => {
    expect(code("character-evidence.ts")).not.toMatch(
      /writeFile|appendFile|rmSync|unlink|mkdir|\.remove\(|createExclusive|truncate|rename|reclaimStaleLock|\.releasePlayerCharacter|\.bindPlayerCharacter|\.recordI002|\.recordIr|writeKeep|writePin/,
    );
  });
  it("the five tools name no reply, answer, challenge, campaign, path, role, permission, secret, identity-of-record or confirmed field", async () => {
    const r = await ready();
    try {
      const listed = (await r.chat.rpc("tools/list")).json.result.tools as any[];
      const mine = listed.filter((t) => /original_character/.test(t.name));
      expect(mine.map((t) => t.name).sort()).toEqual([
        "original_character_status",
        "place_original_character",
        "propose_original_character",
        "resume_original_character",
        "revise_original_character",
      ]);
      for (const t of mine) {
        const text = JSON.stringify(t.inputSchema);
        expect(text, t.name).not.toMatch(
          /reply|answer|challenge|phrase|campaign|path|role|permission|secret|token|confirm|pc_id|world_id|locus_id|release|accepted|binding|provenance|host/i,
        );
      }
      expect(
        JSON.stringify(mine.find((t) => t.name === "original_character_status").inputSchema),
      ).toBe(JSON.stringify({ type: "object", properties: {}, additionalProperties: false }));
    } finally {
      await r.app.close();
    }
  }, 60_000);
});

describe("MECHANISM: preconditions are checked before the player is asked anything", () => {
  it("no original setting yet: refused, nothing is retained, pending or created", async () => {
    const s = await slot();
    await bind(s);
    const r = await run(s, SHORT);
    try {
      const out = await r.chat.call("propose_original_character", draft());
      expect(out.isError).toBe(true);
      expect(out.text).toContain("original setting is not established");
      expect(wordsFile(s)).toBeNull();
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect(existsSync(s.campaignDir)).toBe(false);
      expect((await r.chat.call("original_character_status")).data.character.state).toBe(
        "SETTING_NOT_ESTABLISHED",
      );
    } finally {
      await r.app.close();
    }
  }, 60_000);

  const grants: [string, readonly string[], RegExp][] = [
    ["no referee host bound at all", [], /no AI referee host is bound/],
    [
      "a host that cannot read the character's own words",
      ["IR_NATIVE_COMPATIBILITY"],
      /read the character's own words/,
    ],
    [
      "a host that cannot read where the character is present",
      ["I002_CLASSIFY"],
      /originally present/,
    ],
    [
      "a host bound only to the collection operations",
      ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"],
      /read the character's own words/,
    ],
  ];
  for (const [name, ops, why] of grants)
    it(`${name}: refused before any question; nothing is retained, pending or written`, async () => {
      const s = await slot();
      if (ops.length > 0) await bind(s, ops);
      const r = await run(s, SHORT);
      try {
        const est = await establishViaChat(r.chat);
        expect(est.finished.data.result.status).toBe("LOCALITY_READY");
        const head = (await held(s)).revision;
        const out = await r.chat.call("propose_original_character", draft());
        expect(out.isError).toBe(true);
        expect(out.text).toMatch(why);
        expect(out.text).toContain("nothing was dispatched");
        expect(wordsFile(s)).toBeNull();
        expect(existsSync(pendingPath(s.config))).toBe(false);
        expect((await held(s)).revision).toBe(head);
        // and the refusal discloses neither a host identity, a grant list nor a path
        expect(out.text).not.toMatch(/gm-setup|gm-collection|scripted-test-host|\.secret|operator/);
      } finally {
        await r.app.close();
      }
    }, 90_000);

  it("a host that can read the character but not the placement: the keep proceeds and the placement is refused before its question", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      // the trusted operator re-binds the host to the review alone (a deployment step; never a tool)
      const file = join(
        refereeDir({ stateDir: r.s.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
        "config.json",
      );
      const config = JSON.parse(readFileSync(file, "utf8"));
      config.hosts[0].operations = ["I002_CLASSIFY"];
      writeFileSync(file, JSON.stringify(config));
      const out = await r.chat.call("place_original_character", { statement: WORDS.presence });
      expect(out.isError).toBe(true);
      expect(out.text).toContain("originally present");
      expect(out.text).toContain("nothing was dispatched");
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  it("an offer that is not a complete valid character is refused with the shipped bounds; nothing starts", async () => {
    const r = await ready();
    try {
      for (const bad of [
        { ...draft(), identity: "" },
        { ...draft(), possessions: Array.from({ length: 13 }, (_, i) => `p${i}`) },
        { ...draft(), pc_id: "pc-other" },
        { ...draft(), confirmed: true },
        { ...draft(), campaign_id: "x" },
        { identity: "x" },
      ]) {
        const out = await r.chat.call("propose_original_character", bad);
        expect(out.isError).toBe(true);
        expect(out.data.refused).toContain("nothing was started");
      }
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
      expect(wordsFile(r.s)).toBeNull();
      expect((await r.chat.call("place_original_character", { statement: "" })).isError).toBe(true);
      expect(
        (await r.chat.call("place_original_character", { statement: "x", host: "h" })).isError,
      ).toBe(true);
      expect((await r.chat.call("resume_original_character", { run: 1 })).isError).toBe(true);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a host that has not answered is pending, never a verdict: the words stay, nothing is kept, the same question is found again", async () => {
    const r = await ready();
    try {
      const out = await offer(r.chat);
      expect(out.finished.data.result.status).toBe("REFEREE_PENDING");
      expect(out.finished.elicited).toEqual([]);
      expect(keepFiles(r.s)).toEqual([]);
      expect((await r.chat.call("original_character_status")).data.character.state).toBe(
        "DRAFT_RETAINED",
      );
      // the host now answers; the retained words are reviewed again and the human keeps them afresh
      const host = referee(r.s);
      try {
        expect((await r.chat.call("resume_original_character")).isError).toBe(false);
        const done = await follow(r.chat);
        expect(done.elicited).toHaveLength(1);
        expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      } finally {
        await host.stop();
      }
    } finally {
      await r.app.close();
    }
  }, 90_000);

  it("a simultaneous second offer is refused while the first runs; the retained words stay the first's", async () => {
    const r = await ready({ ...SHORT, chat: { elicitMs: 300 } });
    const host = referee(r.s);
    try {
      const second = draft({ identity: "Somebody else entirely, a human of about thirty winters" });
      const [a, b] = await Promise.all([
        r.chat.call("propose_original_character", draft()),
        r.chat.call("propose_original_character", second),
      ]);
      expect([a.isError, b.isError].filter(Boolean)).toHaveLength(1);
      const won = a.isError ? second : draft();
      expect(readWords(r.s).draft.identity).toBe(won.identity);
      expect(
        JSON.parse(readFileSync(pendingPath(r.s.config), "utf8")).character.draft.identity,
      ).toBe(won.identity);
      const loser = a.isError ? a : b;
      expect(loser.text).toMatch(/already running|setting is being read/);
      await r.chat.call("await_action", { wait_seconds: 5 }, () => null);
      expect((await r.chat.call("cancel_action")).isError).toBe(false);
      await follow(r.chat, null);
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  it("a live package lock leaves the character unavailable and untouched; nothing reclaims it; the offer works once the package is free", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const lock = join(r.s.campaignDir, "LOCK");
      const holder = await CanonicalCampaign.open(r.s.campaignDir, { buildId: "lock-holder" });
      if (!holder.ok) throw new Error("did not open");
      const live = readFileSync(lock, "utf8");
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "UNAVAILABLE",
      });
      const out = await r.chat.call("propose_original_character", draft());
      expect(out.isError).toBe(true);
      expect(out.text).toContain("could not be verified now");
      expect(readFileSync(lock, "utf8")).toBe(live);
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
      await holder.value.close();
      // a crashed holder's lock is not reclaimed by the adapter either
      writeFileSync(
        lock,
        `${JSON.stringify({ pid: 2 ** 22 + 7, campaign_id: LOCALITY_CAMPAIGN })}\n`,
      );
      const stale = readFileSync(lock, "utf8");
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(true);
      expect(readFileSync(lock, "utf8")).toBe(stale);
      rmSync(lock);
      const ok = await offer(r.chat);
      expect(ok.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// What the owners hold that this adapter did not make is never adopted, repaired or deleted.
// ---------------------------------------------------------------------------------------------------------------------------------
const pub = (id: string) => ({
  group_id: `foreign:${id}`,
  intent_id: `foreign-intent:${id}`,
  cause: `foreign-cause:${id}`,
  basis: "local-operator-confirmed-choice",
  secrecy: "local-operator-session",
});
async function withCampaign<T>(
  dir: string,
  work: (c: CanonicalCampaign) => Promise<T>,
): Promise<T> {
  const opened = await CanonicalCampaign.open(dir, { buildId: "test-independent" });
  if (!opened.ok) throw new Error("did not open");
  try {
    return await work(opened.value);
  } finally {
    await opened.value.close();
  }
}
const offeredDraft = (over: Record<string, unknown> = {}) => {
  const parsed = parseOffer(draft(over));
  if (!parsed.ok) throw new Error("bad fixture");
  return parsed.value;
};

/** every character tool refuses, nothing is deleted and the canonical head stays as it was */
async function refusesEverything(r: Awaited<ReturnType<typeof ready>>, head: number) {
  const status = (await r.chat.call("original_character_status")).data.character;
  expect(status).toMatchObject({ state: "BLOCKED", barrier: "ENGINEERING" });
  for (const [tool, args] of [
    ["propose_original_character", draft()],
    ["place_original_character", { statement: WORDS.presence }],
    ["resume_original_character", {}],
    ["revise_original_character", { edits: [{ op: "add", list: "open", text: "x" }] }],
  ] as const) {
    const out = await r.chat.call(tool, args);
    expect(out.isError, tool).toBe(true);
    expect(out.text, tool).toMatch(
      /cannot be continued|engineering|unreadable|not this campaign|already|retained/i,
    );
  }
  expect((await held(r.s)).revision).toBe(head);
  expect(existsSync(pendingPath(r.s.config))).toBe(false);
}

describe("MECHANISM: a foreign, second or replaced character is blocked for engineering and never adopted", () => {
  it("a release published without a retained keep (even with the right content and names) is not a kept character", async () => {
    const r = await ready();
    try {
      await withCampaign(r.s.campaignDir, async (c) => {
        const out = await c.releasePlayerCharacter({
          ...pub("foreign"),
          contract: compileContract("pc-foreign", offeredDraft())!,
        });
        expect(out.ok).toBe(true);
      });
      const head = (await held(r.s)).revision;
      await refusesEverything(r, head);
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a release whose accepted-item list is not the Mirror of its content (a caller-submitted acceptance) is not a kept character, whether or not the owner admitted it", async () => {
    const r = await ready();
    try {
      const forged = compileContract("pc-forged", offeredDraft())!;
      forged.release.mirror_acceptance.items_displayed_and_accepted = [
        "mirror/forged/0123456789ab",
      ];
      const admitted = await withCampaign(
        r.s.campaignDir,
        async (c) => (await c.releasePlayerCharacter({ ...pub("forged"), contract: forged })).ok,
      );
      const head = (await held(r.s)).revision;
      if (admitted) await refusesEverything(r, head);
      else {
        // the owner refused it: the lane is simply open and nothing was written
        expect((await r.chat.call("original_character_status")).data.character.state).toBe(
          "NOT_STARTED",
        );
        expect((await held(r.s)).characters).toHaveLength(0);
      }
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a genuine second character is blocked; the first is neither replaced nor chosen between", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      await withCampaign(r.s.campaignDir, async (c) => {
        const out = await c.releasePlayerCharacter({
          ...pub("second"),
          contract: compileContract("pc-second", offeredDraft({ identity: "Someone else" }))!,
        });
        expect(out.ok).toBe(true);
      });
      const head = (await held(r.s)).revision;
      await refusesEverything(r, head);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  it("a binding this adapter did not make (a foreign statement, at another place) is a conflict and is never replaced; no placement is offered over it", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const pc = (await held(r.s)).characters[0]!.key.split("/")[1]!;
      await withCampaign(r.s.campaignDir, async (c) => {
        const out = await c.bindPlayerCharacter({
          ...pub("bind"),
          pc_id: pc,
          world_id: "world-courtyard",
          locus_id: "locus-courtyard",
          insertion: {
            bridge: "NATIVE_ALREADY_THERE",
            established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
            authored_under: { ...PLAYER_CHOICE_AUTHORITY },
            statement: "A statement some other path committed.",
          },
        });
        expect(out.ok).toBe(true);
      });
      const head = (await held(r.s)).revision;
      await refusesEverything(r, head);
      expect((await held(r.s)).binding!.fact.version).toBe(1);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);

  const keepDefects: [string, (file: string) => void][] = [
    ["an absent keep record", (f) => rmSync(f)],
    ["a malformed keep record", (f) => writeFileSync(f, "{ not json")],
    [
      "a keep record of another campaign",
      (f) =>
        writeFileSync(
          f,
          JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), campaign_id: "other" }),
        ),
    ],
    [
      "a keep record whose kept character is another",
      (f) => {
        const k = JSON.parse(readFileSync(f, "utf8"));
        k.contract.identity_agency.statement = "A different character kept";
        writeFileSync(f, JSON.stringify(k));
      },
    ],
  ];
  for (const [name, defect] of keepDefects)
    it(`${name}: the released character is blocked for engineering (not trusted, not rebuilt, not deleted)`, async () => {
      const r = await ready();
      const host = referee(r.s);
      try {
        expect((await offer(r.chat)).finished.data.result.status).toBe(
          "CHARACTER_RELEASED_UNBOUND",
        );
        await host.stop();
        const file = join(r.s.operatorDir, keepFiles(r.s)[0]!);
        defect(file);
        const after = existsSync(file) ? readFileSync(file, "utf8") : null;
        const head = (await held(r.s)).revision;
        await refusesEverything(r, head);
        expect(existsSync(file) ? readFileSync(file, "utf8") : null).toBe(after);
        // the shipped status command refuses it the same way
        const said: string[] = [];
        await runCli(
          [
            "character-status",
            "--campaign",
            r.s.campaignDir,
            "--campaign-id",
            r.s.config.campaignId,
            "--operator-dir",
            r.s.operatorDir,
          ],
          { out: (l) => said.push(l) },
        );
        expect(said.join("\n")).toMatch(/STATUS (CHARACTER_CONFLICT|SESSION_UNAVAILABLE)/);
      } finally {
        await r.app.close();
      }
    }, 90_000);

  it("a kept and released character is never replaced: a new or changed offer is refused and says why; the same words are not asked again", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const head = (await held(r.s)).revision;
      for (const attempt of [draft(), draft({ identity: "Another person entirely" })]) {
        const out = await r.chat.call("propose_original_character", attempt);
        expect(out.isError).toBe(true);
        expect(out.text).toContain("never replaced");
      }
      const edit = await r.chat.call("revise_original_character", {
        edits: [{ op: "set", field: "identity", text: "Changed after the keep" }],
      });
      expect(edit.isError).toBe(true);
      expect(edit.text).toContain("never replaced");
      expect((await held(r.s)).revision).toBe(head);
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 90_000);
});

describe("MECHANISM: a replaced, malformed, foreign or legacy retained record is never trusted, adopted or cleared by the adapter", () => {
  /** a restarted service over a slot whose pending record holds the unconfirmed offer (the most ordinary record to tamper with) */
  async function withPendingOffer() {
    const r = await ready({ ...SHORT, chat: { elicitMs: 300 } });
    const host = referee(r.s);
    expect((await r.chat.call("propose_original_character", draft())).isError).toBe(false);
    const silent = await r.chat.call("await_action", { wait_seconds: 5 }, () => null);
    expect(silent.data.state).toBe("AWAITING_CONFIRMATION");
    await host.stop();
    await r.app.close();
    return { s: r.s, file: pendingPath(r.s.config) };
  }
  const tampered: [string, (file: string, record: any) => void][] = [
    [
      "a changed candidate under the old digest",
      (f, rec) => {
        rec.character.draft.identity = "Somebody else";
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "a digest that no longer names the candidate",
      (f, rec) => {
        rec.character.contract_sha256 = "0".repeat(64);
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "a missing candidate",
      (f, rec) => {
        rec.character.draft = null;
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "a staged identity with the wrong stage",
      (f, rec) => {
        rec.character.stage = "PLACE";
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "a padded identity",
      (f, rec) => {
        rec.character.extra = true;
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "another campaign's record under this campaign's name",
      (f, rec) => writeFileSync(f, JSON.stringify({ ...rec, campaign_id: "other-campaign" })),
    ],
    [
      "a character identity on a record of another command",
      (f, rec) => writeFileSync(f, JSON.stringify({ ...rec, command: "collect" })),
    ],
    ["malformed JSON", (f) => writeFileSync(f, "{ not json")],
    [
      "a directory in its place",
      (f) => {
        rmSync(f, { force: true });
        mkdirSync(f);
      },
    ],
  ];
  for (const [name, tamper] of tampered)
    it(`${name}: blocked for engineering, nothing removed, nothing started`, async () => {
      const { s, file } = await withPendingOffer();
      tamper(file, JSON.parse(readFileSync(file, "utf8")));
      const before =
        existsSync(file) && !statSync(file).isDirectory() ? readFileSync(file, "utf8") : null;
      const r = await run(s, SHORT);
      try {
        const status = (await r.chat.call("original_character_status")).data.character;
        expect(status).toMatchObject({ state: "BLOCKED", barrier: "ENGINEERING" });
        for (const [tool, args] of [
          ["propose_original_character", draft()],
          ["resume_original_character", {}],
        ] as const)
          expect((await r.chat.call(tool, args)).isError, tool).toBe(true);
        await r.chat.call("reconcile_last_action");
        const blocked = await follow(r.chat, null);
        expect(blocked.data.outcome).toBe("UNCERTAIN");
        expect(existsSync(file)).toBe(true);
        if (before !== null) expect(readFileSync(file, "utf8")).toBe(before);
        expect(keepFiles(s)).toEqual([]);
      } finally {
        await r.app.close();
      }
    }, 90_000);

  it("a character record with no retained identity (a console-run or legacy record) is blocked for engineering; no guess", async () => {
    const { s, file } = await withPendingOffer();
    const record = JSON.parse(readFileSync(file, "utf8"));
    delete record.character;
    writeFileSync(file, JSON.stringify(record));
    const before = readFileSync(file, "utf8");
    const r = await run(s, SHORT);
    try {
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "BLOCKED",
        barrier: "ENGINEERING",
      });
      await r.chat.call("reconcile_last_action");
      expect((await follow(r.chat, null)).data.outcome).toBe("UNCERTAIN");
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(true);
      // the record is kept (its blocker is noted on it); it is never removed, adopted or given an identity
      const kept = JSON.parse(readFileSync(file, "utf8"));
      expect(kept).toMatchObject({
        command: "author-character",
        run_id: JSON.parse(before).run_id,
      });
      expect(kept.character).toBeUndefined();
    } finally {
      await r.app.close();
    }
  }, 90_000);

  const wordsDefects: [string, (file: string, rec: any) => void][] = [
    [
      "a draft whose digest no longer matches",
      (f, rec) => {
        rec.draft.identity = "Altered";
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
    [
      "another campaign's words",
      (f, rec) => writeFileSync(f, JSON.stringify({ ...rec, campaign_id: "other" })),
    ],
    ["malformed words", (f) => writeFileSync(f, "{ no")],
    [
      "a statement beyond the shipped bound",
      (f, rec) => {
        rec.draft.identity = "x".repeat(501);
        rec.draft_sha256 = "0".repeat(64);
        writeFileSync(f, JSON.stringify(rec));
      },
    ],
  ];
  for (const [name, defect] of wordsDefects)
    it(`${name}: the retained words are never trusted; the character lane stays closed and the file is kept`, async () => {
      const r = await ready();
      const host = referee(r.s);
      try {
        expect((await offer(r.chat, draft(), readsAndDeclines)).finished.data.result.status).toBe(
          "DECLINED",
        );
        const file = wordsFile(r.s)!;
        defect(file, JSON.parse(readFileSync(file, "utf8")));
        const before = readFileSync(file, "utf8");
        const out = await r.chat.call("propose_original_character", draft());
        expect(out.isError).toBe(true);
        expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
          state: "BLOCKED",
          barrier: "ENGINEERING",
        });
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(existsSync(pendingPath(r.s.config))).toBe(false);
      } finally {
        await host.stop();
        await r.app.close();
      }
    }, 90_000);

  it("a record that cannot be written dispatches nothing", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      mkdirSync(pendingPath(r.s.config));
      const out = await r.chat.call("propose_original_character", draft());
      expect(out.isError).toBe(true);
      expect(out.text).toMatch(/unreadable|recovery record could not be maintained/);
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Recovery: an interrupted operation converges by its ORIGINAL retained identities, or stays explicitly blocked.
// ---------------------------------------------------------------------------------------------------------------------------------
const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

/** Makes one owner operation lose its acknowledgement: it commits (or, when `commit` is false, never reaches the store). */
function loseReply(
  target: "campaign" | "referee",
  op: "releasePlayerCharacter" | "bindPlayerCharacter" | "recordI002" | "recordIr",
  commit: boolean,
) {
  const proto = (target === "campaign" ? CanonicalCampaign : RefereeAdjudicationAdapter)
    .prototype as any;
  const original = proto[op] as (...a: unknown[]) => Promise<unknown>;
  vi.spyOn(proto, op).mockImplementation(async function (this: object, ...args: unknown[]) {
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

let referenceShape: Promise<unknown> | undefined;
/** the campaign an UNINTERRUPTED chat journey produces (compared without the keyed publication identities) */
function reference() {
  referenceShape ??= (async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect((await place(r.chat)).finished.data.result.status).toBe("CHARACTER_BOUND");
      await r.app.close();
      return await shape(r.s);
    } finally {
      await host.stop();
      await r.app.close().catch(() => undefined);
    }
  })();
  return referenceShape;
}

describe("MECHANISM: a lost acknowledgement at each owner commit of the KEEP stage converges on the uninterrupted campaign", () => {
  const cases = [
    [
      "referee",
      "recordI002",
      true,
      "the classification evidence landed but its reply was lost",
      "RESUME",
    ],
    [
      "referee",
      "recordI002",
      false,
      "the classification evidence never reached the store",
      "RESUME",
    ],
    [
      "campaign",
      "releasePlayerCharacter",
      true,
      "the release landed but its reply was lost",
      "SETTLED",
    ],
    [
      "campaign",
      "releasePlayerCharacter",
      false,
      "the release never reached the store: the retained keep is released as kept",
      "RESUME",
    ],
  ] as const;
  for (const [target, op, commit, name, expected] of cases)
    it(`${name}: the player is never asked to keep again; placement stays the player's separate choice`, async () => {
      const wanted = await reference();
      const r = await ready();
      const host = referee(r.s);
      try {
        loseReply(target, op, commit);
        const first = await offer(r.chat);
        expect(first.finished.elicited).toHaveLength(1);
        expect(first.finished.data.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();
        expect(keepFiles(r.s)).toHaveLength(1);
        const status = (await r.chat.call("original_character_status")).data;
        if (expected === "RESUME") {
          // the keep is durable; the release is not: every other mutation waits for exactly that
          expect(first.finished.data.outcome).toBe("UNCERTAIN");
          expect(status.character).toMatchObject({
            state: "KEPT_AWAITING_RELEASE",
            barrier: "RESUME",
          });
          const blocked = await r.chat.call("propose_original_character", draft());
          expect(blocked.isError).toBe(true);
          expect(blocked.text).toContain("resume_original_character");
          expect(
            (await r.chat.call("place_original_character", { statement: WORDS.presence })).isError,
          ).toBe(true);
          const resumed = await r.chat.call("resume_original_character");
          expect(resumed.isError).toBe(false);
          const done = await follow(r.chat);
          expect(done.elicited).toEqual([]);
          expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
          expect(done.data.outcome).toBeUndefined();
        } else {
          // the owners' evidence proves the release landed: settled, nothing uncertain, nothing to resume
          expect(first.finished.data.outcome).toBeUndefined();
          expect(status.character).toMatchObject({ state: "RELEASED_UNBOUND", barrier: "NONE" });
          expect((await r.chat.call("resume_original_character")).isError).toBe(true);
        }
        expect(existsSync(pendingPath(r.s.config))).toBe(false);
        expect((await held(r.s)).binding).toBeUndefined();
        const placed = await place(r.chat);
        expect(placed.finished.data.result.status).toBe("CHARACTER_BOUND");
        await r.app.close();
        expect(await shape(r.s)).toEqual(wanted);
        const c = await held(r.s);
        expect(c.characters).toHaveLength(1);
        expect(c.characters[0]!.version).toBe(1);
        expect(c.binding!.fact.version).toBe(1);
      } finally {
        await host.stop();
        await r.app.close().catch(() => undefined);
      }
    }, 180_000);
});

describe("MECHANISM: a lost acknowledgement at each owner commit of the PLACEMENT stage converges on the uninterrupted campaign", () => {
  const cases = [
    [
      "referee",
      "recordIr",
      true,
      "the native/compatibility evidence landed but its reply was lost",
      "AGAIN",
    ],
    [
      "referee",
      "recordIr",
      false,
      "the native/compatibility evidence never reached the store",
      "AGAIN",
    ],
    [
      "campaign",
      "bindPlayerCharacter",
      true,
      "the binding landed but its reply was lost",
      "SETTLED",
    ],
    ["campaign", "bindPlayerCharacter", false, "the binding never reached the store", "AGAIN"],
  ] as const;
  for (const [target, op, commit, name, expected] of cases)
    it(`${name}`, async () => {
      const wanted = await reference();
      const r = await ready();
      const host = referee(r.s);
      try {
        expect((await offer(r.chat)).finished.data.result.status).toBe(
          "CHARACTER_RELEASED_UNBOUND",
        );
        loseReply(target, op, commit);
        const first = await place(r.chat);
        expect(first.finished.elicited).toHaveLength(1);
        expect(first.finished.data.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();
        const status = (await r.chat.call("original_character_status")).data.character;
        if (expected === "SETTLED") {
          // the owners' readback proves the binding: no new question, no second write
          expect(status).toMatchObject({
            state: "BOUND",
            barrier: "NONE",
            readback: { presence: WORDS.presence },
          });
          expect(first.finished.data.outcome).toBeUndefined();
          expect((await r.chat.call("resume_original_character")).isError).toBe(true);
          expect(
            (await r.chat.call("place_original_character", { statement: WORDS.presence })).isError,
          ).toBe(true);
        } else {
          // proven unbound: the placement is still the player's own, and a restart or a resume asks for a FRESH confirmation
          expect(status).toMatchObject({
            state: "RELEASED_UNBOUND",
            barrier: "NONE",
            placement: WORDS.presence,
          });
          expect((await held(r.s)).binding).toBeUndefined();
          const resumed = await r.chat.call("resume_original_character");
          expect(resumed.isError).toBe(false);
          const second = await follow(r.chat);
          expect(second.elicited).toHaveLength(1);
          expect(second.elicited[0]).toMatch(/type exactly "place-character [0-9a-f]{12}"/);
          expect(second.data.result.status).toBe("CHARACTER_BOUND");
        }
        await r.app.close();
        expect(await shape(r.s)).toEqual(wanted);
        const c = await held(r.s);
        expect(c.characters).toHaveLength(1);
        expect(c.characters[0]!.version).toBe(1);
        expect(c.binding!.fact.version).toBe(1);
        expect(
          c.referee.filter((f) => (f.value as any).operation === "IR_NATIVE_COMPATIBILITY"),
        ).toHaveLength(1);
      } finally {
        await host.stop();
        await r.app.close().catch(() => undefined);
      }
    }, 180_000);

  it("an unexpected failure after the release is an unknown outcome settled by the owners, never a clean success or refusal", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      vi.spyOn(CanonicalCampaign.prototype as any, "bindPlayerCharacter").mockRejectedValue(
        new Error("boom"),
      );
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      const first = await place(r.chat);
      expect(first.finished.data.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
      vi.restoreAllMocks();
      expect((await r.chat.call("original_character_status")).data.character.state).toBe(
        "RELEASED_UNBOUND",
      );
      expect((await r.chat.call("resume_original_character")).isError).toBe(false);
      expect((await follow(r.chat)).data.result.status).toBe("CHARACTER_BOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM: a restart finds the retained operation and resumes only that original lawful work", () => {
  it("restarted while the player was being asked: the words are retained, the barrier is cleared by owner evidence, the review is asked afresh", async () => {
    let r = await ready({ ...SHORT, chat: { elicitMs: 300 } });
    const host = referee(r.s);
    try {
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(false);
      expect((await r.chat.call("await_action", { wait_seconds: 5 }, () => null)).data.state).toBe(
        "AWAITING_CONFIRMATION",
      );
      const record = JSON.parse(readFileSync(pendingPath(r.s.config), "utf8"));
      expect(record).toMatchObject({ command: "author-character", state: "DISPATCHED" });
      expect(record.character).toMatchObject({
        stage: "KEEP",
        draft: { identity: WORDS.identity },
      });
      // the retained candidate is NOT consent: nothing of a phrase, a reply or a keep is in it
      expect(JSON.stringify(record)).not.toMatch(
        /keep-character|confirm(ed)?"?:\s*true|secret|reply/i,
      );
      expect(keepFiles(r.s)).toEqual([]);
      await r.app.close();

      r = { ...(await run(r.s, SHORT)), s: r.s };
      const status = (await r.chat.call("original_character_status")).data.character;
      expect(status).toMatchObject({ state: "DRAFT_RETAINED", barrier: "RECONCILE" });
      expect(status.draft.identity).toBe(WORDS.identity);
      expect((await r.chat.call("propose_original_character", draft())).isError).toBe(true);
      const early = await r.chat.call("resume_original_character");
      expect(early.isError).toBe(true);
      expect(early.text).toMatch(/reconcile_last_action/);
      await r.chat.call("reconcile_last_action");
      const settled = await follow(r.chat, null);
      expect(settled.data.outcome).toBeUndefined();
      expect(settled.data.exit_code).toBe(0);
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "DRAFT_RETAINED",
        barrier: "NONE",
      });
      // the retained words are reviewed again: a fresh question and a fresh keep, never the old confirmation
      expect((await r.chat.call("resume_original_character")).isError).toBe(false);
      const done = await follow(r.chat);
      expect(done.elicited).toHaveLength(1);
      expect(done.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 150_000);

  it("restarted after the release: the character is released and unplaced; a retained placement statement needs its own FRESH confirmation and is never silently confirmed", async () => {
    let r = await ready({ ...SHORT, chat: { elicitMs: 300 } });
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(
        (await r.chat.call("place_original_character", { statement: WORDS.presence })).isError,
      ).toBe(false);
      expect((await r.chat.call("await_action", { wait_seconds: 5 }, () => null)).data.state).toBe(
        "AWAITING_CONFIRMATION",
      );
      await r.app.close();

      r = { ...(await run(r.s, { ...SHORT, chat: { elicitMs: 300 } })), s: r.s };
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "RELEASED_UNBOUND",
        barrier: "RECONCILE",
        placement: WORDS.presence,
      });
      await r.chat.call("reconcile_last_action");
      expect((await follow(r.chat, null)).data.exit_code).toBe(0);
      expect((await held(r.s)).binding).toBeUndefined();
      const resumed = await r.chat.call("resume_original_character");
      expect(resumed.isError).toBe(false);
      // nothing confirms it until the human does: silence leaves it unplaced
      const silent = await r.chat.call("await_action", { wait_seconds: 5 }, () => null);
      expect(silent.data.state).toBe("AWAITING_CONFIRMATION");
      expect((await r.chat.call("cancel_action")).isError).toBe(false);
      await follow(r.chat, null);
      expect((await held(r.s)).binding).toBeUndefined();
      const again = await r.chat.call("resume_original_character");
      expect(again.isError).toBe(false);
      const done = await follow(r.chat);
      expect(done.elicited).toHaveLength(1);
      expect(done.data.result.status).toBe("CHARACTER_BOUND");
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 150_000);

  it("the binding landed and the adapter could not read the evidence to settle it: the block survives a restart, and the owners' readback then settles it with no further question or write", async () => {
    let r = await ready({
      ...SHORT,
      recovery: {
        characterOutcome: async () => ({
          kind: "UNAVAILABLE",
          code: "READ_FAILED",
          detail: "the campaign could not be read now",
        }),
      },
    });
    const host = referee(r.s);
    try {
      expect((await offer(r.chat)).finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(existsSync(pendingPath(r.s.config))).toBe(true);
      // the keep stage's settlement could not read the evidence either: it is still blocking
      await r.chat.call("reconcile_last_action");
      expect((await follow(r.chat, null)).data.outcome).toBe("UNCERTAIN");
      await r.app.close();
      // it is the real evidence on a fresh process that settles it
      r = { ...(await run(r.s, SHORT)), s: r.s };
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "RELEASED_UNBOUND",
        barrier: "RECONCILE",
      });
      await r.chat.call("reconcile_last_action");
      expect((await follow(r.chat, null)).data.exit_code).toBe(0);
      expect(existsSync(pendingPath(r.s.config))).toBe(false);

      // now the placement: the binding lands and the settlement of that run cannot read the evidence
      await r.app.close();
      r = {
        ...(await run(r.s, {
          ...SHORT,
          recovery: {
            characterOutcome: async () => ({
              kind: "UNAVAILABLE",
              code: "READ_FAILED",
              detail: "the campaign could not be read now",
            }),
          },
        })),
        s: r.s,
      };
      const placed = await place(r.chat);
      expect(placed.finished.data.result.status).toBe("CHARACTER_BOUND");
      expect(existsSync(pendingPath(r.s.config))).toBe(true);
      expect(
        (await r.chat.call("place_original_character", { statement: WORDS.presence })).isError,
      ).toBe(true);
      await r.app.close();
      const head = (await held(r.s)).revision;
      r = { ...(await run(r.s, SHORT)), s: r.s };
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "BOUND",
        barrier: "RECONCILE",
      });
      await r.chat.call("reconcile_last_action");
      const settled = await follow(r.chat, null);
      expect(settled.data.exit_code).toBe(0);
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
      expect((await held(r.s)).revision).toBe(head);
      expect((await r.chat.call("original_character_status")).data.character).toMatchObject({
        state: "BOUND",
        barrier: "NONE",
      });
    } finally {
      await host.stop();
      await r.app.close().catch(() => undefined);
    }
  }, 150_000);
});

describe("MECHANISM: an unresolved character operation holds every other mutation on both lanes, and a status read clears nothing", () => {
  it("while the release is uncertain, neither a chat action nor the phone page can start anything; status leaves the barrier; reconcile alone (with owner evidence) lifts it", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      loseReply("campaign", "releasePlayerCharacter", false);
      expect((await offer(r.chat)).finished.data.outcome).toBe("UNCERTAIN");
      vi.restoreAllMocks();
      for (let i = 0; i < 2; i++)
        expect((await r.chat.call("original_character_status")).data.character.barrier).toBe(
          "RESUME",
        );
      const page = new Browser(r.s.base);
      expect((await page.login("player", PLAYER)).status).toBe(200);
      const author = await page.req("POST", "/api/play/command", {
        command: "author-character",
        options: {
          world: "world-courtyard",
          locus: "locus-courtyard",
          "player-character": "pc-page",
        },
      });
      expect(author.status).toBe(409);
      expect(author.json.error).toMatch(/UNCERTAIN|resume|reconcile/i);
      expect((await r.chat.call("reconcile_last_action")).isError).toBe(false);
      const blocked = await follow(r.chat, null);
      expect(blocked.data.exit_code).toBe(4);
      expect(blocked.data.outcome).toBe("UNCERTAIN");
      expect(blocked.data.recovery).toContain("resume_original_character");
      expect(existsSync(pendingPath(r.s.config))).toBe(true);
      expect((await r.chat.call("resume_original_character")).isError).toBe(false);
      expect((await follow(r.chat)).data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(existsSync(pendingPath(r.s.config))).toBe(false);
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// A failure before or after EVERY mutating filesystem operation of each stage converges on the uninterrupted campaign.
// ---------------------------------------------------------------------------------------------------------------------------------
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is then the operator's explicit decision to reclaim. */
async function operatorReclaims(s: Awaited<ReturnType<typeof ready>>["s"]): Promise<void> {
  const lock = join(s.campaignDir, "LOCK");
  if (!existsSync(lock)) return;
  writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
  await runCli(
    [
      "character-status",
      "--campaign",
      s.campaignDir,
      "--campaign-id",
      s.config.campaignId,
      "--operator-dir",
      s.operatorDir,
      "--reclaim-stale-lock",
    ],
    { out: () => undefined },
  );
}

/** The player's ordinary conversation after any interruption: do what the status says, until the character is bound. */
async function converge(r: Awaited<ReturnType<typeof ready>>, limit = 10): Promise<string[]> {
  const trail: string[] = [];
  for (let i = 0; i < limit; i++) {
    const c = (await r.chat.call("original_character_status")).data.character;
    trail.push(`${c.state}/${c.barrier}`);
    if (c.state === "BOUND" && c.barrier === "NONE") return trail;
    if (c.barrier === "RECONCILE") {
      await r.chat.call("reconcile_last_action");
      await follow(r.chat, null);
    } else if (c.barrier === "RESUME" || c.state === "KEPT_AWAITING_RELEASE") {
      await r.chat.call("resume_original_character");
      await follow(r.chat);
    } else if (c.state === "DRAFT_RETAINED") {
      await r.chat.call("resume_original_character");
      await follow(r.chat);
    } else if (c.state === "RELEASED_UNBOUND") {
      if (c.placement !== undefined) await r.chat.call("resume_original_character");
      else await r.chat.call("place_original_character", { statement: WORDS.presence });
      await follow(r.chat);
    } else throw new Error(`cannot converge from ${trail.join(" -> ")}: ${JSON.stringify(c)}`);
  }
  throw new Error(`did not converge: ${trail.join(" -> ")}`);
}

describe("MECHANISM: a failure before or after every mutating filesystem operation converges, by the original identities, on the uninterrupted campaign", () => {
  for (const stage of ["KEEP", "PLACE"] as const) {
    it(`${stage} stage: each operation, before and after, then the player's ordinary conversation`, async () => {
      const wanted = await reference();
      const plan: {
        failAt?: number;
        when?: "before" | "after";
        fs?: ReturnType<typeof instrumentFs>;
      } = {};
      const counted: number[] = [];
      const make = async () => {
        const { authorCharacter } = await import("@immortalis/operator");
        return ready({
          ...SHORT,
          character: {
            ...SHORT.character,
            author: async (p) => {
              // the fault is injected only into the stage under test
              if (p.chat?.stage !== stage) return authorCharacter(p);
              const inst = instrumentFs(
                nodeFs,
                plan.failAt ? { failAt: plan.failAt, when: plan.when ?? "before" } : undefined,
              );
              plan.fs = inst;
              try {
                return await authorCharacter({ ...p, campaignFs: inst.fs });
              } finally {
                counted.push(inst.count());
              }
            },
          },
        });
      };
      // the probe: how many mutating operations does the stage make?
      const probe = await make();
      const probeHost = referee(probe.s);
      try {
        expect((await offer(probe.chat)).finished.data.result.status).toBe(
          "CHARACTER_RELEASED_UNBOUND",
        );
        if (stage === "PLACE")
          expect((await place(probe.chat)).finished.data.result.status).toBe("CHARACTER_BOUND");
      } finally {
        await probeHost.stop();
        await probe.app.close();
      }
      const total = counted[counted.length - 1]!;
      expect(total).toBeGreaterThan(2);

      let interrupted = 0;
      for (let n = 1; n <= total; n++)
        for (const when of ["before", "after"] as const) {
          counted.length = 0;
          plan.failAt = n;
          plan.when = when;
          const r = await make();
          const host = referee(r.s);
          try {
            const first = await offer(r.chat);
            let clean = first.finished.data?.result?.status === "CHARACTER_RELEASED_UNBOUND";
            if (stage === "PLACE" && clean) {
              // the KEEP stage is not under test here: only the placement is interrupted
              const placed = await place(r.chat);
              clean = placed.finished.data?.result?.status === "CHARACTER_BOUND";
            }
            if (!clean) interrupted++;
            await r.app.close();
            await operatorReclaims(r.s);
            const again = await run(r.s, SHORT);
            try {
              const trail = await converge({ ...again, s: r.s });
              expect(trail[trail.length - 1], `${stage} ${when} op ${n}`).toBe("BOUND/NONE");
            } finally {
              await again.app.close();
            }
            expect(await shape(r.s), `${stage} ${when} op ${n}`).toEqual(wanted);
            const c = await held(r.s);
            expect(c.characters).toHaveLength(1);
            expect(c.characters[0]!.version).toBe(1);
            expect(c.binding!.fact.version).toBe(1);
          } finally {
            await host.stop();
            await r.app.close().catch(() => undefined);
          }
        }
      // the faults really interrupted the stage (a campaign that never failed would prove nothing)
      expect(interrupted).toBeGreaterThan(total);
    }, 1_800_000);
  }
});
