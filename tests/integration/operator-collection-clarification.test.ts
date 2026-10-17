/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// R-5 (NEWLY AUTHORIZED; BLUE repair handoff v1; independent review pending) — the SHIPPED `clarify-collection-cycle` command over a campaign
// built ONLY by the shipped commands (establish-locality, author-character, establish-character-locus, the Temporal owner's own basis).
// Every row is a MECHANISM test: a script types the player's words and the confirmation, and a scripted policy stands in for the referee host
// (PLUMBING ONLY: it proves nothing about whether an AI understood any sentence). None of it is a real player's choice or a real GM reading.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  attestCycle,
  clarifyCollectionCycle,
  prepareCollection,
  runCli,
  type ClarifyCollectionCycleParams,
} from "@immortalis/operator";
import { PcCollectionAdapter } from "@immortalis/engine";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  pcExistenceContractKey,
  pcIntrinsicClarificationKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { ACTUATOR_WORDS, TRAVERSAL_CANNOT } from "../support/pc-collection.ts";
import {
  LOCALITY_CAMPAIGN,
  type LocalityDirs,
  ACCESS,
  LOCUS_ID,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  headOf,
  openOrdinary,
} from "../support/locality.ts";
import {
  PC_ID,
  startScriptedHost,
  plainPolicy,
  scriptedPolicy,
  type Policy,
} from "../support/original-pc.ts";
import { BASIS, PC_WORDS, observationCampaign } from "../support/observation.ts";
import { ctxOf, openSession } from "../support/operator.ts";
import { clarifiedCycleAnswer } from "../support/pc-clarification.ts";

const EMBODIMENT = `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${TRAVERSAL_CANNOT}`;
const TAU = 12;
const WORDS = `It takes me ${TAU} ${BASIS.unit} to lift and carry one lump`;
const MECH = "mech-hands-salt";

/** the live starting shape, built by the shipped commands: bound, located, clock established, accepted hands, NO stated cycle */
const startingShape = async (): Promise<LocalityDirs> =>
  (await observationCampaign({ words: { embodiment: EMBODIMENT } })).dirs;

interface Script {
  readonly said: string[];
  readonly typed: (string | null)[];
  say(t: string): void;
  ask(prompt: string): Promise<string | null>;
  close(): void;
}
/** types the player's words when asked for them, and the printed confirmation phrase (or declines) when asked to confirm */
function playerConsole(words: (string | null)[], confirm = true): Script {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  const queue = [...words];
  const PHRASE = /To confirm, type exactly "([^"]+)"/;
  return {
    said,
    typed,
    say: (t) => {
      said.push(t);
    },
    ask: async (prompt) => {
      let line: string | null;
      if (prompt.startsWith("your character's own account"))
        line = queue.length ? queue.shift()! : "";
      else if (prompt.trim() === ">") {
        line = "no";
        if (confirm)
          for (let i = said.length - 1; i >= 0; i--) {
            const m = PHRASE.exec(said[i]!);
            if (m && m[1]!.startsWith("accept-clarification ")) {
              line = m[1]!;
              break;
            }
          }
      } else throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
      typed.push(line);
      return line;
    },
    close: () => undefined,
  };
}

async function clarify(
  dirs: LocalityDirs,
  terminal: Script,
  host: Policy | null = plainPolicy,
  over: Partial<ClarifyCollectionCycleParams> = {},
) {
  const h = host ? startScriptedHost(dirs, host) : null;
  try {
    const result = await clarifyCollectionCycle({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      pcId: PC_ID,
      operatorDir: dirs.operatorDir,
      terminal,
      refereePolls: 400,
      refereePollMs: 10,
      ...over,
    });
    return { result, terminal, host: h };
  } finally {
    await h?.stop();
  }
}

/**
 * BLUE H-3: every preserved record is read at its CANONICAL key and must exist (an absent record would compare equal to itself and
 * prove nothing); and every fact that existed before is compared whole (key, version, value) afterwards.
 */
const sealedState = async (dirs: LocalityDirs) => {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const f = (k: string) => {
      const fact = c.store.getFact(k);
      expect(fact, `the preserved record ${k} exists`).toBeDefined();
      return JSON.stringify(fact);
    };
    return {
      contract: f(pcExistenceContractKey(PC_ID)),
      binding: f(PLAYER_CHARACTER_BINDING_KEY),
      custody: f(worldPcLocusCustodyKey(PC_ID)),
      clock: f(TEMPORAL_STATE_KEY),
      facts: new Map(c.store.listFacts().map((x) => [x.key, JSON.stringify(x)])),
      keys: c.store
        .listFacts()
        .map((x) => x.key)
        .sort(),
    };
  } finally {
    await c.close();
  }
};
/** the keys alone (for a campaign that legitimately lacks some record, e.g. no clock yet) */
const keysOf = async (dirs: LocalityDirs) => {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return c.store
      .listFacts()
      .map((x) => x.key)
      .sort();
  } finally {
    await c.close();
  }
};
/** the sealed records are as they were, and no fact that existed before was changed (new facts may only be added) */
const unchanged = (
  before: Awaited<ReturnType<typeof sealedState>>,
  after: Awaited<ReturnType<typeof sealedState>>,
) => {
  expect({ ...after, keys: undefined, facts: undefined }).toEqual({
    ...before,
    keys: undefined,
    facts: undefined,
  });
  for (const [k, v] of before.facts) expect(after.facts.get(k), k).toBe(v);
};
const clarificationKeys = (keys: readonly string[]) =>
  keys.filter((k) => k.startsWith(`pc/${PC_ID}/intrinsic-clarification/`));

describe("clarify-collection-cycle: the shipped command, from the live starting shape", () => {
  it("the starting shape cannot prepare an exact cycle; after the separately confirmed clarification the SAME character prepares and attests from it; nothing sealed or material moves", async () => {
    const dirs = await startingShape();
    const before = await sealedState(dirs);
    expect(clarificationKeys(before.keys)).toEqual([]);

    const player = playerConsole([WORDS]);
    const { result, host } = await clarify(dirs, player);
    expect(result.status, JSON.stringify(result.details) + player.said.join("\n")).toBe(
      "CLARIFICATION_ACCEPTED",
    );
    // the player typed the words and the confirmation; the host was asked once and about exactly those words
    expect(player.typed).toEqual([
      WORDS,
      expect.stringMatching(/^accept-clarification [0-9a-f]{12}$/),
    ]);
    expect(host!.answered).toHaveLength(1);
    expect(player.said.join("\n")).toContain("nothing is chosen for you");

    const after = await sealedState(dirs);
    unchanged(before, after);
    const added = after.keys.filter((k) => !before.keys.includes(k));
    expect(added.filter((k) => !k.startsWith("referee/"))).toHaveLength(1);
    expect(clarificationKeys(added)).toHaveLength(1);
    const clarificationId = clarificationKeys(added)[0]!.split("/").pop()!;

    // the preparation that quotes the accepted words, then the semantic attestation, through the shipped paths
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      const held = new PcCollectionAdapter(campaign.store).clarification(PC_ID, clarificationId)!;
      expect(held.value.claims[0]!.statement).toBe(WORDS);
      expect(held.value.effective_from).toEqual(BASIS);
    } finally {
      await campaign.close();
    }
    const setup = (clarified: boolean, quote = WORDS) => ({
      format: "immortalis-collection-preparation",
      format_version: 1,
      mechanism: {
        pc_id: PC_ID,
        mechanism_id: MECH,
        claims: [{ section: "embodiment_topology", index: 0 }],
        ...(clarified ? { clarified: [{ clarification_id: clarificationId, index: 0 }] } : {}),
        actuator: { statement: ACTUATOR_WORDS },
        traversal: { statement: TRAVERSAL_CANNOT },
        cycle_duration: { unit: BASIS.unit, value: TAU },
        cycle_quote: quote,
      },
      extraction_basis: {
        basis_id: "basis-salt",
        world_id: WORLD_ID,
        source_key: SOURCE_KEY,
        material_class: "raw-salt",
        unit: SOURCE_UNIT,
        relies_on: { ...ACCESS },
      },
      reserve: {
        reserve_id: "reserve-salt",
        material_class: "raw-salt",
        quantity: { amount: 0, unit: SOURCE_UNIT },
        condition: "dry",
        world_id: WORLD_ID,
        locus_id: LOCUS_ID,
      },
    });
    const fileOf = (doc: unknown): string => {
      const path = join(mkdtempSync(join(tmpdir(), "immortalis-clarify-setup-")), "setup.json");
      writeFileSync(path, JSON.stringify(doc));
      chmodSync(path, 0o600);
      return path;
    };
    const session = await openSession(dirs, { expectedCampaignId: LOCALITY_CAMPAIGN });
    const confirmPrepare = () => {
      const t = playerConsole([], false);
      const said = t.said;
      // the preparation's own confirmation phrase is verb "prepare-collection"
      return {
        ...t,
        ask: async () => {
          for (let i = said.length - 1; i >= 0; i--) {
            const m = /To confirm, type exactly "([^"]+)"/.exec(said[i]!);
            if (m) return m[1]!;
          }
          return null;
        },
      };
    };
    try {
      const mark = session.campaign.store.head().state_sha256;
      // without the clarification reference the same words are in no released claim: refused, nothing written
      expect(
        (await prepareCollection(ctxOf(session, confirmPrepare()), fileOf(setup(false)))).status,
      ).toBe("UNAVAILABLE");
      expect(session.campaign.store.head().state_sha256).toBe(mark);
      // with it, the preparation commits
      expect(
        (await prepareCollection(ctxOf(session, confirmPrepare()), fileOf(setup(true)))).status,
      ).toBe("COLLECTION_COMMITTED");
      const ctx = {
        ...ctxOf(session, confirmPrepare()),
        attestHost: async (task: any) => clarifiedCycleAnswer(task, { cycle_ground: WORDS }),
      };
      expect((await attestCycle(ctx, { mechanism_id: MECH })).status).toBe("COLLECTION_COMMITTED");
      expect(
        new PcCollectionAdapter(session.campaign.store).attestation(PC_ID, MECH),
      ).toBeDefined();
      expect(session.campaign.verify()).toEqual([]);
    } finally {
      await session.close();
    }
    // the sealed release, the binding, the custody and the clock are still exactly as they were; the material was never touched
    const end = await sealedState(dirs);
    unchanged(before, end);
    expect(
      end.keys.filter((k) => k.startsWith("production/")).filter((k) => k.includes("account")),
    ).toEqual([]);
  }, 480_000);

  it("running it again with the same words converges: the host is not asked again and the campaign does not change", async () => {
    const dirs = await startingShape();
    expect((await clarify(dirs, playerConsole([WORDS]))).result.status).toBe(
      "CLARIFICATION_ACCEPTED",
    );
    const head = await headOf(dirs.campaignDir);
    const again = await clarify(dirs, playerConsole([WORDS], false));
    expect(again.result.status).toBe("CLARIFICATION_ACCEPTED");
    expect(again.host!.answered).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 240_000);

  it("BLUE H-1: a conflicting second rate finds the branch closed; the host is not asked and nothing changes, while the first rate stands", async () => {
    const dirs = await startingShape();
    expect((await clarify(dirs, playerConsole([WORDS]))).result.status).toBe(
      "CLARIFICATION_ACCEPTED",
    );
    const head = await headOf(dirs.campaignDir);
    const second = await clarify(
      dirs,
      playerConsole([`It takes me ${TAU + 5} ${BASIS.unit} to lift and carry one lump`], false),
    );
    expect(second.result.status).toBe("CLARIFICATION_NOT_AVAILABLE");
    expect(second.result.details.join("\n")).toMatch(/already closed/);
    expect(second.host!.answered).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const keys = clarificationKeys(c.store.listFacts().map((x) => x.key));
      expect(keys).toHaveLength(1);
      expect(
        new PcCollectionAdapter(c.store).clarification(PC_ID, keys[0]!.split("/").pop()!)!.value
          .claims[0]!.statement,
      ).toBe(WORDS);
    } finally {
      await c.close();
    }
  }, 240_000);

  it("BLUE H-1: a compound statement that also adds an actuator or a power is read by the host as out of scope and writes nothing; the host was delivered the accepted baseline", async () => {
    const dirs = await startingShape();
    const head = await headOf(dirs.campaignDir);
    const compound = `It takes me ${TAU} ${BASIS.unit} to lift and carry one lump, and my third arm can carry a whole cart`;
    const player = playerConsole([compound]);
    const adds = scriptedPolicy({ clarify: { adds: /third arm/ } });
    const seen: unknown[] = [];
    const spy: Policy = (doc) => {
      seen.push((doc["context"] as { clarification?: unknown }).clarification);
      return adds(doc);
    };
    const out = await clarify(dirs, player, spy);
    expect(out.result.status).toBe("CLARIFICATION_NOT_ACCEPTED");
    expect(player.said.join("\n")).toContain("ADDS_OR_CHANGES_A_CAPABILITY_OR_ACTUATOR");
    expect(seen).toHaveLength(1);
    const delivered = seen[0] as {
      branch: string;
      baseline: { text: string }[];
      prior_closures: unknown[];
    };
    expect(delivered.baseline.map((b) => b.text).join("\n")).toContain(ACTUATOR_WORDS);
    expect(delivered.prior_closures).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(clarificationKeys(await keysOf(dirs))).toEqual([]);
  }, 240_000);

  it("writes nothing unless the player confirms, the host accepts the words as the player's own, and the host answers", async () => {
    const dirs = await startingShape();
    const head = await headOf(dirs.campaignDir);
    // not confirmed
    const declined = await clarify(dirs, playerConsole([WORDS], false));
    expect(declined.result.status).toBe("DECLINED");
    // the host reads the words as a claim about the world
    const world = scriptedPolicy({ classify: [{ match: /lump/, class: "WORLD_STATE_ASSERTION" }] });
    // (other words: a question already answered by the bound host is found again, never asked again for a more convenient answer)
    const rejected = await clarify(
      dirs,
      playerConsole([`It takes me ${TAU} ${BASIS.unit} to lift and carry one lump of salt`]),
      world,
    );
    expect(rejected.result.status).toBe("CLARIFICATION_NOT_ACCEPTED");
    expect(rejected.terminal.said.join("\n")).toContain("NOT accepted");
    // no host answers
    const pending = await clarify(
      dirs,
      playerConsole([`It takes me ${TAU + 1} ${BASIS.unit} to lift and carry one lump`]),
      null,
      {
        refereePolls: 3,
        refereePollMs: 5,
      },
    );
    expect(["REFEREE_PENDING", "REFEREE_UNAVAILABLE"]).toContain(pending.result.status);
    // words that state no number, or no unit, are not offered to the host at all (a fresh campaign: no earlier question is pending)
    const fresh = await startingShape();
    const vague = await clarify(fresh, playerConsole(["I am quick", "9 of them", "nine second"]));
    expect(vague.result.status).toBe("DECLINED");
    expect(vague.host!.answered).toEqual([]);
    // empty input stops
    expect((await clarify(dirs, playerConsole([]))).result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const after = await sealedState(dirs);
    expect(clarificationKeys(after.keys)).toEqual([]);
    expect(after.keys.filter((k) => k.startsWith("referee/"))).toEqual(
      (await sealedState(dirs)).keys.filter((k) => k.startsWith("referee/")),
    );
  }, 480_000);

  it("is available only for the verified bound character of the campaign, at an established clock", async () => {
    const dirs = await startingShape();
    // another character identity
    const other = await clarify(dirs, playerConsole([WORDS]), plainPolicy, {
      pcId: "pc-someone-else",
    });
    expect(other.result.status).toBe("CHARACTER_NONE");
    // no canonical time
    const noClock = await (
      await import("../support/observation.ts")
    ).observationCampaign({
      words: { embodiment: EMBODIMENT },
      time: false,
    });
    const r = await clarify(noClock.dirs, playerConsole([WORDS]));
    expect(r.result.status).toBe("CLARIFICATION_NOT_AVAILABLE");
    expect(r.host!.answered).toEqual([]);
    expect(clarificationKeys(await keysOf(noClock.dirs))).toEqual([]);
    expect(pcIntrinsicClarificationKey(PC_ID, "x")).toContain(PC_ID);
  }, 480_000);

  it("is a closed command of the shipped CLI: it needs the character, takes no other option, and a bad request prints the usage", async () => {
    const dirs = await startingShape();
    const lines: string[] = [];
    const base = [
      "clarify-collection-cycle",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
    ];
    expect(await runCli(base, { out: (l) => lines.push(l) })).not.toBe(0); // no --player-character
    expect(lines.join("\n")).toContain("clarify-collection-cycle");
    const extra = await runCli([...base, "--player-character", PC_ID, "--world", WORLD_ID], {
      out: () => undefined,
    });
    expect(extra).not.toBe(0); // an option the command does not take
    const terminal = playerConsole([WORDS]);
    const h = startScriptedHost(dirs, plainPolicy);
    try {
      const out: string[] = [];
      const code = await runCli([...base, "--player-character", PC_ID, "--referee-wait", "5"], {
        out: (l) => out.push(l),
        terminal,
      });
      expect(out.some((l) => l.startsWith("STATUS CLARIFICATION_ACCEPTED"))).toBe(true);
      expect(code).toBe(0);
    } finally {
      await h.stop();
    }
  }, 240_000);
});
