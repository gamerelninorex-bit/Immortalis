// Refusal contrasts of the original player-character authorship and first native ACTIVATION slice. Every case starts from a campaign whose
// world and locus were committed by the shipped `establish-locality` path; where a case needs an independently committed fact (a second
// world, a foreign contract) it is committed directly through the unchanged owner operations. Each refusal must leave canon exactly as
// it was, and no test ever supplies the player's acceptance or the expected binding: the consoles only type what a person would.
import { createHash, createHmac } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  canonicalJson,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import { CanonicalCampaign, PcCapabilityAdapter } from "@immortalis/engine";
import { CAP_SAILING, pcCapabilityBasis, pcCapabilityPublication } from "@immortalis/testkit";
import {
  EMPTY_DRAFT,
  LocalOperatorSession,
  characterStatus,
  compileContract,
  type CharacterDraft,
} from "@immortalis/operator";
import {
  keepFileName,
  newKeepSecret,
  writeKeep,
} from "../../packages/operator/src/original-pc-keep.ts";
import { LOCALITY_CAMPAIGN, headOf, openOrdinary, setupDoc } from "../support/locality.ts";
import {
  PC_ID,
  STANDARD,
  WORDS,
  WORLD_ID,
  author,
  keepRefereeFor,
  localityCampaign,
  me,
  respondingConsole,
  scriptedConsole,
  type Line,
} from "../support/original-pc.ts";
import { tempDir } from "../support/tmp.ts";

/** Types the keep phrase of the latest display. */
const KEEP_LAST: Line = (said) => {
  for (let i = said.length - 1; i >= 0; i--) {
    const m = /type exactly "(keep-character [0-9a-f]{12})"/.exec(said[i]!);
    if (m) return m[1]!;
  }
  throw new Error("no keep phrase was printed");
};

const BASE = {
  basis: "test-independent-commit",
  secrecy: "test",
};
const pub = (name: string) => ({
  group_id: `g:${name}`,
  intent_id: `i:${name}`,
  cause: `c:${name}`,
  ...BASE,
});

/** The elicitation lines of a plain character (identity, one contact, form, continuity, then three empty lists). */
const ELICIT: Line[] = [
  me(WORDS.identityFirst),
  me(WORDS.contact),
  "",
  me(WORDS.embodiment),
  me(WORDS.continuity),
  "",
  "",
  "",
];

const draft: CharacterDraft = {
  ...EMPTY_DRAFT,
  identity: WORDS.identityFinal,
  contact: { kind: "CONTACT_ANCHOR", surfaces: [WORDS.contact] },
  embodiment: WORDS.embodiment,
  continuity: WORDS.continuity,
};

async function withCampaign<T>(
  dir: string,
  work: (c: CanonicalCampaign) => Promise<T>,
): Promise<T> {
  const opened = await CanonicalCampaign.open(dir, { buildId: "test-independent" });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  try {
    return await work(opened.value);
  } finally {
    await opened.value.close();
  }
}

const authorTexts = (said: readonly string[]) => said.join("\n");

describe("no character is released or bound unless the actual player keeps the last displayed whole", () => {
  it("an absent decision (end of input) at the first Mirror writes nothing", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(dirs, respondingConsole({ eofAt: ">" }));
    expect(result.status).toBe("DECLINED");
    expect(terminal.said.join("\n")).not.toContain("PROGRESS");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a declined Mirror writes nothing", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result } = await author(dirs, respondingConsole({ override: { ">": "no" } }));
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a guessed, recorded or pre-typed keep phrase is not a keep", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result } = await author(
      dirs,
      scriptedConsole(...ELICIT, "keep-character 000000000000"),
    );
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("the keep phrase of an EARLIER display cannot keep a later one: acceptance is of the last displayed whole", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const firstPhrase = (said: readonly string[]) =>
      /type exactly "(keep-character [0-9a-f]{12})"/.exec(
        said.find((l) => l.includes("keep-character"))!,
      )![1]!;
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(...ELICIT, "change", `set identity ${me(WORDS.identityFinal)}`, "", (said) =>
        firstPhrase(said),
      ),
    );
    expect(result.status).toBe("DECLINED");
    // two displays, two different phrases; the first was typed at the second display
    const keeps = [...authorTexts(terminal.said).matchAll(/"(keep-character [0-9a-f]{12})"/g)].map(
      (m) => m[1],
    );
    expect(keeps).toHaveLength(2);
    expect(keeps[0]).not.toBe(keeps[1]);
    expect(terminal.typed.at(-1)).toBe(keeps[0]);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a character with an unresolved material fork (no contact surface, no explicit no-contact) is shown but offered no keep phrase", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(...ELICIT, "change", "remove contact 1", "", "keep-character 123456789abc"),
    );
    expect(result.status).toBe("DECLINED");
    const text = authorTexts(terminal.said);
    const second = text.slice(text.indexOf("(display 2)"));
    expect(second).toContain("cannot be kept yet");
    expect(second).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("an explicit NO-CONTACT is a lawful, recorded answer and is shown as such", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      respondingConsole({
        ...STANDARD,
        revision: [
          "set no-contact me: I am a disembodied thought nothing in the world can register",
        ],
        skipPlace: true,
      }),
    );
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(authorTexts(terminal.said)).toContain("NO-CONTACT");
    await withCampaign(dirs.campaignDir, async (c) => {
      expect(c.playerCharacter(PC_ID)!.value.contact.kind).toBe("NO_CONTACT");
    });
  }, 60_000);
});

describe("a revision is one whole cycle: refused as a whole or applied as a whole", () => {
  it("a change with one bad line changes nothing, and the unchanged whole is shown again", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(
        ...ELICIT,
        "change",
        `set identity ${me(WORDS.identityFinal)}`,
        "set nonsense value",
        "",
        KEEP_LAST,
        "",
      ),
    );
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(authorTexts(terminal.said)).toContain("CHANGE REFUSED, the character is unchanged");
    await withCampaign(dirs.campaignDir, async (c) => {
      expect(c.playerCharacter(PC_ID)!.value.identity_agency.statement).toBe(WORDS.identityFirst);
    });
  }, 60_000);

  it("the owner still refuses every intrinsic provenance that is not the player's own (nothing laundered through a caller-built contract)", async () => {
    const dirs = await localityCampaign();
    const contract = compileContract(PC_ID, draft)!;
    const before = await headOf(dirs.campaignDir);
    await withCampaign(dirs.campaignDir, async (c) => {
      for (const provenance of [
        "SETTING-PREMISE",
        "PC-RELATIONAL STANDING",
        "ACTOR-STANCE CLAIM",
      ]) {
        const laundered = {
          ...contract,
          baseline_exception: {
            ...contract.baseline_exception,
            player_overrides: [{ statement: "I hold the office of baron", provenance }],
          },
        };
        const r = await c.releasePlayerCharacter({
          ...pub(`laundered-${provenance}`),
          contract: laundered,
        });
        expect(r.ok, provenance).toBe(false);
      }
    });
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);
});

describe("a contract this command did not record is never bound by it: a caller-submitted acceptance is not proof of review", () => {
  it("a contract with forged accepted items is refused with no prompt and no binding", async () => {
    const dirs = await localityCampaign();
    const contract = compileContract(PC_ID, draft)!;
    const forged = {
      ...contract,
      release: {
        ...contract.release,
        mirror_acceptance: {
          ...contract.release.mirror_acceptance,
          items_displayed_and_accepted: ["forged-item-1"],
        },
      },
    };
    await withCampaign(dirs.campaignDir, async (c) => {
      expect((await c.releasePlayerCharacter({ ...pub("forged"), contract: forged })).ok).toBe(
        true,
      );
    });
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("CHARACTER_CONFLICT");
    expect(result.details.join("\n")).toContain("not exactly the Mirror of its content");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("even a contract with the correct accepted items is refused when it did not come through this command's keep", async () => {
    const dirs = await localityCampaign();
    await withCampaign(dirs.campaignDir, async (c) => {
      const r = await c.releasePlayerCharacter({
        ...pub("alien"),
        contract: compileContract(PC_ID, draft)!,
      });
      expect(r.ok).toBe(true);
    });
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("CHARACTER_CONFLICT");
    expect(result.details.join("\n")).toContain("no keep at this console is on record");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a contract that compiles an existing actor, or carries inherited claims, is not a player's original authorship here", async () => {
    const dirs = await localityCampaign();
    const contract = compileContract(PC_ID, draft)!;
    const inherited = {
      ...contract,
      baseline_exception: {
        ...contract.baseline_exception,
        safely_inherited: [{ statement: "an ordinary human body", provenance: "SAFELY-INHERITED" }],
      },
    };
    await withCampaign(dirs.campaignDir, async (c) => {
      expect(
        (await c.releasePlayerCharacter({ ...pub("inherited"), contract: inherited })).ok,
      ).toBe(true);
    });
    const { result } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("CHARACTER_CONFLICT");
    expect(result.details.join("\n")).toContain("inherited or hypothetical claims");
  }, 60_000);
});

describe("the owners' own boundary is unchanged for every placement this command refuses to invent", () => {
  it("no binding without the released character, with another bridge, another establishing class, delegated authority or no insertion fact", async () => {
    const dirs = await localityCampaign();
    // a character released by this command, left unplaced
    const { result } = await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }));
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const before = await headOf(dirs.campaignDir);
    const ok = {
      bridge: "NATIVE_ALREADY_THERE",
      established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      statement: "I am here.",
    };
    const target = { pc_id: PC_ID, world_id: WORLD_ID, locus_id: "locus-salt-pans" };
    await withCampaign(dirs.campaignDir, async (c) => {
      const attempt = (name: string, over: object, pc = PC_ID) =>
        c.bindPlayerCharacter({
          ...pub(`bind-${name}`),
          ...target,
          pc_id: pc,
          insertion: { ...ok, ...over },
        });
      expect((await attempt("portal", { bridge: "PORTAL" })).ok).toBe(false);
      expect((await attempt("summoning", { bridge: "SUMMONING" })).ok).toBe(false);
      expect(
        (await attempt("inferred", { established_by: "STRONG_SEMANTIC_IMPLICATION" })).ok,
      ).toBe(false);
      expect((await attempt("delegated", { established_by: "EXPLICIT_DELEGATION" })).ok).toBe(
        false,
      );
      expect(
        (
          await attempt("persona", {
            authored_under: { role: "role.gm", permission: "permission.canon.write" },
          })
        ).ok,
      ).toBe(false);
      expect((await attempt("no-statement", { statement: "" })).ok).toBe(false);
      expect((await attempt("wrong-pc", {}, "pc-someone-else")).ok).toBe(false);
      const missing = await c.bindPlayerCharacter({
        ...pub("bind-none"),
        ...target,
        insertion: undefined,
      });
      expect(missing.ok).toBe(false);
    });
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);
});

describe("placement is a separate, explicit, confirmed player statement", () => {
  const unbound = async (dirs: Awaited<ReturnType<typeof localityCampaign>>) =>
    withCampaign(dirs.campaignDir, async (c) => {
      expect(c.binding()).toBeUndefined();
      expect(c.playerCharacter(PC_ID)).toBeDefined();
    });

  it("an empty statement leaves the character released and unbound: nothing is inferred from the world, locus and character coexisting", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      respondingConsole({ ...STANDARD, presence: "" }),
    );
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(result.message).toContain("NOT bound");
    expect(authorTexts(terminal.said)).not.toContain("place-character");
    await unbound(dirs);
  }, 60_000);

  it("a declined, guessed or stale placement phrase binds nothing", async () => {
    for (const reply of ["no", "place-character 000000000000", "keep-character 000000000000"]) {
      const dirs = await localityCampaign();
      const run = await author(dirs, scriptedConsole(...ELICIT, KEEP_LAST, WORDS.presence, reply));
      expect(run.result.status, reply).toBe("CHARACTER_RELEASED_UNBOUND");
      await unbound(dirs);
    }
  }, 120_000);
});

describe("identity, campaign and world prerequisites are checked before the player is asked anything", () => {
  it("another campaign identity is refused", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(dirs, respondingConsole(STANDARD), {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(result.code).toContain("CAMPAIGN_MISMATCH");
    expect(terminal.asked()).toBe(0);
  }, 60_000);

  it("a campaign directory that others may write is not the operator's", async () => {
    const dirs = await localityCampaign();
    chmodSync(dirs.campaignDir, 0o777);
    const { result, terminal } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(result.code).toContain("WRITABLE_BY_OTHERS");
    expect(terminal.asked()).toBe(0);
  }, 60_000);

  it("an invalid identity is refused as a request", async () => {
    const dirs = await localityCampaign();
    const { result } = await author(dirs, respondingConsole(STANDARD), { pcId: "pc/../x" });
    expect(result.status).toBe("INVALID_REQUEST");
  }, 60_000);

  it("a campaign with no world, a missing world, or a locus of another world never reaches authorship", async () => {
    const empty = tempDir("immortalis-pc-empty-");
    const created = await CanonicalCampaign.create(join(empty, "campaign"), {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "test-independent",
    });
    if (!created.ok) throw new Error("create failed");
    await created.value.close();
    chmodSync(join(empty, "campaign"), 0o700);
    const emptyDirs = { campaignDir: join(empty, "campaign"), operatorDir: join(empty, "state") };
    const none = await author(emptyDirs, respondingConsole(STANDARD));
    expect(none.result.status).toBe("WORLD_NOT_ESTABLISHED");
    expect(none.terminal.asked()).toBe(0);

    const dirs = await localityCampaign();
    const missing = await author(dirs, respondingConsole(STANDARD), { worldId: "world-nowhere" });
    expect(missing.result.status).toBe("WORLD_NOT_ESTABLISHED");
    expect(missing.terminal.asked()).toBe(0);

    // a second world with its own locus, committed independently; the first world's name with the second world's locus is no locus
    await withCampaign(dirs.campaignDir, async (c) => {
      const w = setupDoc().world;
      expect(
        (await c.establishWorld({ ...pub("w2"), world: { ...w, world_id: "world-other" } })).ok,
      ).toBe(true);
      expect(
        (
          await c.establishLocus({
            ...pub("l2"),
            locus: {
              locus_id: "locus-other",
              world: { fact_key: "world/world-other/profile", entity_id: "world-other" },
              designation: "Elsewhere",
              constraints: [],
            },
          })
        ).ok,
      ).toBe(true);
    });
    const before = await headOf(dirs.campaignDir);
    const crossed = await author(dirs, respondingConsole(STANDARD), { locusId: "locus-other" });
    expect(crossed.result.status).toBe("LOCUS_NOT_ESTABLISHED");
    expect(crossed.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);
});

describe("retry and reopen preserve the honest state and never duplicate a release or a binding", () => {
  it("a second run after a complete journey reads the persisted facts, asks nothing and writes nothing", async () => {
    const dirs = await localityCampaign();
    expect((await author(dirs, respondingConsole(STANDARD))).result.status).toBe("CHARACTER_BOUND");
    const head = await headOf(dirs.campaignDir);
    const again = await author(
      dirs,
      respondingConsole({ ...STANDARD, identity: "somebody else entirely" }),
    );
    expect(again.result.status).toBe("CHARACTER_BOUND");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a different character identity is refused while this command's character is held: no second release", async () => {
    const dirs = await localityCampaign();
    expect(
      (await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }))).result.status,
    ).toBe("CHARACTER_RELEASED_UNBOUND");
    const head = await headOf(dirs.campaignDir);
    const wrong = await author(dirs, respondingConsole(STANDARD), { pcId: "pc-someone-else" });
    expect(wrong.result.status).toBe("CHARACTER_CONFLICT");
    expect(wrong.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a resumed placement cannot change the character: the kept contract is read back, and the authoring is never asked again", async () => {
    const dirs = await localityCampaign();
    await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }));
    const kept = await withCampaign(dirs.campaignDir, async (c) => c.playerCharacter(PC_ID)!.value);
    const resumed = await author(
      dirs,
      respondingConsole({
        identity: "A completely different person",
        revision: ["set identity me: nobody"],
      }),
    );
    expect(resumed.result.status).toBe("CHARACTER_BOUND");
    expect(authorTexts(resumed.terminal.said)).not.toContain("identity>");
    await withCampaign(dirs.campaignDir, async (c) => {
      expect(c.playerCharacter(PC_ID)!.value).toEqual(kept);
      expect(c.playerCharacter(PC_ID)!.fact.version).toBe(1);
    });
  }, 120_000);

  it("an operative binding this command did not make for this character, or at another locus, is a conflict and is never replaced", async () => {
    const dirs = await localityCampaign();
    await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }));
    await withCampaign(dirs.campaignDir, async (c) => {
      const r = await c.bindPlayerCharacter({
        ...pub("foreign-bind"),
        pc_id: PC_ID,
        world_id: WORLD_ID,
        locus_id: "locus-salt-pans",
        insertion: {
          bridge: "NATIVE_ALREADY_THERE",
          established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
          authored_under: { ...PLAYER_CHOICE_AUTHORITY },
          statement: "A statement some other path committed.",
        },
      });
      expect(r.ok).toBe(true);
    });
    const head = await headOf(dirs.campaignDir);
    const run = await author(dirs, respondingConsole(STANDARD));
    expect(run.result.status).toBe("BINDING_CONFLICT");
    expect(run.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.binding()!.fact.version).toBe(1);
    await campaign.close();
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// BLUE F61-R1 repairs: (1) classification of what is authored and the placement against committed constraints, (2) a release that
// looks identical but whose keep was never made at the console, (3) other lawful facts of the PC owner are not other characters.
// ---------------------------------------------------------------------------------------------------------------------------------

describe("F61-R1 finding 2: a release with the same content and names but no keep at this console is not a kept character", () => {
  const sha = (v: unknown) =>
    createHash("sha256").update(canonicalJson(v), "utf8").digest("hex").slice(0, 32);

  const schemes: [string, (c: ReturnType<typeof compileContract>) => string][] = [
    [
      "the content-derived identity of the first release of this slice",
      (c) => sha({ campaign_id: LOCALITY_CAMPAIGN, contract: c }),
    ],
    ["a digest of the contract alone", (c) => sha(c)],
    [
      "a keyed digest under a guessed secret",
      (c) =>
        createHmac("sha256", "0".repeat(64))
          .update(
            canonicalJson({ stage: "release", campaign_id: LOCALITY_CAMPAIGN, contract: c }),
            "utf8",
          )
          .digest("hex")
          .slice(0, 32),
    ],
  ];
  for (const [name, idOf] of schemes) {
    it(`published through the owner operation under ${name}, with the correct accepted items: refused with no prompt and no binding`, async () => {
      const dirs = await localityCampaign();
      const contract = compileContract(PC_ID, draft)!;
      const id = idOf(contract);
      await withCampaign(dirs.campaignDir, async (c) => {
        const r = await c.releasePlayerCharacter({
          group_id: `operator-pc:${id}:release`,
          intent_id: `operator-pc-intent:${id}:release`,
          cause: `operator-pc-cause:${id}`,
          basis: "local-operator-confirmed-choice",
          secrecy: "local-operator-session",
          contract,
        });
        expect(r.ok).toBe(true);
      });
      const before = await headOf(dirs.campaignDir);
      const { result, terminal } = await author(dirs, respondingConsole(STANDARD));
      expect(result.status).toBe("CHARACTER_CONFLICT");
      expect(result.details.join("\n")).toContain("no keep at this console is on record");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(before);
      const status = await LocalOperatorSession.open({
        campaignDir: dirs.campaignDir,
        operatorDir: dirs.operatorDir,
        expectedCampaignId: LOCALITY_CAMPAIGN,
      });
      if (!status.ok) throw new Error("did not open");
      try {
        expect((await characterStatus(status.value, dirs.operatorDir)).status).toBe(
          "CHARACTER_CONFLICT",
        );
      } finally {
        await status.value.close();
      }
    }, 60_000);
  }

  it("a keep retained for one character does not vouch for a different release of the same identity", async () => {
    const dirs = await localityCampaign();
    // the trusted side's record of a character kept earlier, written by the trusted side (here: its own writer)
    const kept = compileContract(PC_ID, {
      ...draft,
      identity: "somebody the player actually kept",
    })!;
    const wrote = await writeKeep({
      dir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      record: {
        pc_id: PC_ID,
        secret: newKeepSecret(),
        contract: kept,
        referee: keepRefereeFor(kept),
      },
    });
    if (!wrote.ok) throw new Error(JSON.stringify(wrote.error));
    // a different release of the same identity is published directly under any names whatsoever
    await withCampaign(dirs.campaignDir, async (c) => {
      const r = await c.releasePlayerCharacter({
        ...pub("other-release"),
        contract: compileContract(PC_ID, draft)!,
      });
      expect(r.ok).toBe(true);
    });
    const { result, terminal } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("CHARACTER_CONFLICT");
    expect(terminal.asked()).toBe(0);
    await withCampaign(dirs.campaignDir, async (c) => expect(c.binding()).toBeUndefined());
  }, 60_000);

  it("a keep for another character blocks authoring a different one, and an unreadable or foreign record is never adopted", async () => {
    const dirs = await localityCampaign();
    const wrote = await writeKeep({
      dir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      record: {
        pc_id: "pc-kept-earlier",
        secret: newKeepSecret(),
        contract: compileContract("pc-kept-earlier", draft)!,
        referee: keepRefereeFor(compileContract("pc-kept-earlier", draft)!),
      },
    });
    if (!wrote.ok) throw new Error(JSON.stringify(wrote.error));
    const other = await author(dirs, respondingConsole(STANDARD));
    expect(other.result.status).toBe("CHARACTER_CONFLICT");
    expect(other.terminal.asked()).toBe(0);
    writeFileSync(join(dirs.operatorDir, keepFileName(LOCALITY_CAMPAIGN)), "{ not json", {
      mode: 0o600,
    });
    const broken = await author(dirs, respondingConsole(STANDARD));
    expect(broken.result.status).toBe("SESSION_UNAVAILABLE");
    expect(broken.result.code).toContain("KEEP_MALFORMED");
    expect(broken.terminal.asked()).toBe(0);
  }, 60_000);
});

describe("F61-R1 finding 3: other lawful facts of the PC owner are not other characters", () => {
  const capability = async (dirs: Awaited<ReturnType<typeof localityCampaign>>) =>
    withCampaign(dirs.campaignDir, async (c) => {
      const r = await new PcCapabilityAdapter(c.store).receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: pcCapabilityBasis(PC_ID, CAP_SAILING),
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      // the PC owner now holds a second, lawful fact of another kind beside the one Existence Contract
      const facts = c.store.listFacts().filter((f) => f.owner === "pc_existence");
      expect(facts.map((f) => f.key).sort()).toEqual(
        [pcExistenceContractKey(PC_ID), `pc/${PC_ID}/capability-basis/${CAP_SAILING}`].sort(),
      );
      expect(facts.filter((f) => f.facet === "existence_contract")).toHaveLength(1);
    });
  const status = async (dirs: Awaited<ReturnType<typeof localityCampaign>>) => {
    const opened = await LocalOperatorSession.open({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      expectedCampaignId: LOCALITY_CAMPAIGN,
    });
    if (!opened.ok) throw new Error("did not open");
    try {
      return await characterStatus(opened.value, dirs.operatorDir);
    } finally {
      await opened.value.close();
    }
  };

  it("after a real admitted capability basis, character-status still reports the one bound character and the same-identity rerun reads it back", async () => {
    const dirs = await localityCampaign();
    expect(
      (
        await author(
          dirs,
          respondingConsole({
            ...STANDARD,
            exceptions: ["I have sailed these waters since childhood"],
          }),
        )
      ).result.status,
    ).toBe("CHARACTER_BOUND");
    await capability(dirs);
    expect((await status(dirs)).status).toBe("CHARACTER_BOUND");
    const head = await headOf(dirs.campaignDir);
    const again = await author(dirs, respondingConsole(STANDARD));
    expect(again.result.status).toBe("CHARACTER_BOUND");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a released but unbound character with a capability basis is still released-but-unbound, and the rerun resumes at placement", async () => {
    const dirs = await localityCampaign();
    const first = await author(
      dirs,
      respondingConsole({
        ...STANDARD,
        exceptions: ["I have sailed these waters since childhood"],
        skipPlace: true,
      }),
    );
    expect(first.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    await capability(dirs);
    expect((await status(dirs)).status).toBe("CHARACTER_RELEASED_UNBOUND");
    const again = await author(dirs, respondingConsole(STANDARD));
    expect(again.result.status).toBe("CHARACTER_BOUND");
    expect(again.terminal.asked()).toBe(2);
  }, 120_000);

  it("a genuine second Existence Contract is still refused, by the run and by the status", async () => {
    const dirs = await localityCampaign();
    await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }));
    await withCampaign(dirs.campaignDir, async (c) => {
      const r = await c.releasePlayerCharacter({
        ...pub("second-pc"),
        contract: compileContract("pc-second", draft)!,
      });
      expect(r.ok).toBe(true);
      expect(c.store.getFact(pcExistenceContractKey("pc-second"))).toBeDefined();
    });
    const run = await author(dirs, respondingConsole(STANDARD));
    expect(run.result.status).toBe("CHARACTER_CONFLICT");
    expect(run.terminal.asked()).toBe(0);
    const s = await status(dirs);
    expect(s.status).toBe("CHARACTER_CONFLICT");
    expect(s.details.join("\n")).toContain("more than one character");
  }, 120_000);
});
