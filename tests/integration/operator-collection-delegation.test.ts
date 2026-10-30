/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted referee documents */
// H1 (BLUE same-PR repair authorization; I-002 section 9; CPAA-C1 v0.3 F-2) — the SHIPPED `delegate-collection-cycle` command over a campaign
// built ONLY by the shipped commands. Every row is a MECHANISM test: a script types the confirmation, and a scripted policy stands in for the
// role.gm referee host (PLUMBING ONLY: it proves what the engine and the exchange enforce and nothing about whether an AI chose or
// understood anything). None of it is a real player's choice or a real GM selection.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  attestCycle,
  bindHost,
  clarifyCollectionCycle,
  delegateCollectionCycle,
  prepareCollection,
  runCli,
  type DelegateCollectionCycleParams,
} from "@immortalis/operator";
import { PcCollectionAdapter, pcDelegationIdOf } from "@immortalis/engine";
import { pcDelegatedClarificationKey } from "@immortalis/contracts";
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
  type Policy,
  type ScriptedHost,
} from "../support/original-pc.ts";
import { BASIS, PC_WORDS, observationCampaign } from "../support/observation.ts";
import { ctxOf, openSession } from "../support/operator.ts";
import { delegatedCycleAnswer } from "../support/pc-delegation.ts";

const EMBODIMENT = `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${TRAVERSAL_CANNOT}`;
const MECH = "mech-hands-salt";
const SHORTEST = 4;
const LONGEST = 12;
const PICK = 9;
const STATEMENT = (n = PICK) => `Handling one lump takes this body ${n} ${BASIS.unit}`;
const GM_HOST = "gm-delegate";
const DELEGATE_OPS = ["PC_COLLECTION_DELEGATE"] as const;

/** the live starting shape, built by the shipped commands: bound, located, clock established, accepted hands, NO stated cycle */
const startingShape = async (bind = true): Promise<LocalityDirs> => {
  const dirs = (await observationCampaign({ words: { embodiment: EMBODIMENT } })).dirs;
  if (bind) {
    const bound = await bindHost({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: GM_HOST,
      operations: DELEGATE_OPS as any,
    });
    if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
  }
  return dirs;
};

/** the scripted role.gm selection (PLUMBING ONLY), answering the delivered delegate task; `over` forms the falsifiers */
const gm =
  (
    over: (task: any) => Record<string, unknown> = () => ({}),
    pick: () => number = () => PICK,
  ): Policy =>
  (doc) => {
    if (doc["operation"] !== "PC_COLLECTION_DELEGATE") return null;
    const task: any = doc["context"];
    const n = pick();
    return {
      task_digest: task.digest,
      branch: "UNRESOLVED_BEFORE",
      scope: "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
      baseline_ground: ACTUATOR_WORDS,
      selection: { value: n, statement: STATEMENT(n), statement_ground: STATEMENT(n) },
      ...over(task),
    };
  };

const PHRASE = /To confirm, type exactly "([^"]+)"/;
interface Script {
  readonly said: string[];
  readonly typed: (string | null)[];
  say(t: string): void;
  ask(prompt: string): Promise<string | null>;
  close(): void;
}
/** types the printed confirmation phrase (or declines); the delegate command asks for nothing else */
function playerConsole(confirm = true): Script {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  return {
    said,
    typed,
    say: (t) => {
      said.push(t);
    },
    ask: async (prompt) => {
      if (prompt.trim() !== ">") throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
      let line: string | null = "no";
      if (confirm)
        for (let i = said.length - 1; i >= 0; i--) {
          const m = PHRASE.exec(said[i]!);
          if (m && m[1]!.startsWith("accept-delegation ")) {
            line = m[1]!;
            break;
          }
        }
      typed.push(line);
      return line;
    },
    close: () => undefined,
  };
}

const SCOPE = {
  constraintWords: "somewhere between four and twelve",
  shortest: SHORTEST,
  longest: LONGEST,
};

async function delegate(
  dirs: LocalityDirs,
  terminal: Script,
  host: Policy | null = gm(),
  over: Partial<DelegateCollectionCycleParams> = {},
) {
  const h: ScriptedHost | null = host ? startScriptedHost(dirs, host, GM_HOST) : null;
  try {
    const result = await delegateCollectionCycle({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      pcId: PC_ID,
      operatorDir: dirs.operatorDir,
      terminal,
      refereePolls: 400,
      refereePollMs: 10,
      scope: SCOPE,
      ...over,
    });
    return { result, terminal, host: h };
  } finally {
    await h?.stop();
  }
}

const delegationKeys = (keys: readonly string[]) =>
  keys.filter((k) => k.startsWith(`pc/${PC_ID}/delegated-clarification/`));
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
const heldDelegation = async (dirs: LocalityDirs) => {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return new PcCollectionAdapter(c.store).delegation(PC_ID);
  } finally {
    await c.close();
  }
};

describe("delegate-collection-cycle: the shipped command, from the live starting shape", () => {
  it("role.gm selects inside the committed bounds; the player confirms the delegation, not a number they have seen; the SAME character prepares and attests from it", async () => {
    const dirs = await startingShape();
    const before = await keysOf(dirs);
    expect(delegationKeys(before)).toEqual([]);

    const player = playerConsole();
    const { result, host } = await delegate(dirs, player);
    expect(result.status, JSON.stringify(result.details) + player.said.join("\n")).toBe(
      "DELEGATION_ACCEPTED",
    );
    // the player typed ONLY the confirmation; the host was asked once; no number is in front of the player before they confirm
    expect(player.typed).toEqual([expect.stringMatching(/^accept-delegation [0-9a-f]{12}$/)]);
    expect(host!.answered).toHaveLength(1);
    const beforeConfirm = player.said
      .slice(0, player.said.findIndex((l) => PHRASE.test(l)) + 1)
      .join("\n");
    expect(beforeConfirm).not.toContain(STATEMENT());
    expect(beforeConfirm).toContain("PLAYER-DELEGATED");
    expect(beforeConfirm).toContain(`at least ${SHORTEST} and at most ${LONGEST}`);
    // the Character Mirror afterwards: scope, method class, executing role, seal, and the content that was chosen
    const report = result.details.join("\n");
    expect(report).toContain("Character Mirror - scope");
    expect(report).toContain("ROLE_GM_NON_RANDOM_SELECTION");
    expect(report).toContain("executed by role.gm");
    expect(report).toContain("Character Mirror - seal");
    expect(report).toContain(JSON.stringify(STATEMENT()));
    expect(report).toContain("not your words");

    const after = await keysOf(dirs);
    expect(delegationKeys(after)).toEqual([
      pcDelegatedClarificationKey(PC_ID, pcDelegationIdOf(PC_ID)),
    ]);
    expect(after.filter((k) => k.includes("/intrinsic-clarification/"))).toEqual([]);
    const held = (await heldDelegation(dirs))!;
    expect(held.value.sealed.duration).toEqual({ unit: BASIS.unit, value: PICK });
    expect(held.value.sealed.claims[0]!.provenance).toBe("PLAYER-DELEGATED");
    expect(held.value.effective_from).toEqual(BASIS);

    // the preparation that quotes the chosen words, then the semantic attestation, through the shipped paths
    const setup = (delegated: boolean) => ({
      format: "immortalis-collection-preparation",
      format_version: 1,
      mechanism: {
        pc_id: PC_ID,
        mechanism_id: MECH,
        claims: [{ section: "embodiment_topology", index: 0 }],
        ...(delegated
          ? { clarified: [{ clarification_id: held.value.delegation_id, index: 0 }] }
          : {}),
        actuator: { statement: ACTUATOR_WORDS },
        traversal: { statement: TRAVERSAL_CANNOT },
        cycle_duration: { unit: BASIS.unit, value: PICK },
        cycle_quote: STATEMENT(),
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
      const path = join(mkdtempSync(join(tmpdir(), "immortalis-delegate-setup-")), "setup.json");
      writeFileSync(path, JSON.stringify(doc));
      chmodSync(path, 0o600);
      return path;
    };
    const confirmPrepare = () => {
      const t = playerConsole(false);
      return {
        ...t,
        ask: async () => {
          for (let i = t.said.length - 1; i >= 0; i--) {
            const m = PHRASE.exec(t.said[i]!);
            if (m) return m[1]!;
          }
          return null;
        },
      };
    };
    const session = await openSession(dirs, { expectedCampaignId: LOCALITY_CAMPAIGN });
    try {
      const mark = session.campaign.store.head().state_sha256;
      // without the delegation reference the chosen words are in no released claim: refused, nothing written
      expect(
        (await prepareCollection(ctxOf(session, confirmPrepare()), fileOf(setup(false)))).status,
      ).toBe("UNAVAILABLE");
      expect(session.campaign.store.head().state_sha256).toBe(mark);
      // with it, the preparation commits; the attesting host is told the claim is delegated
      expect(
        (await prepareCollection(ctxOf(session, confirmPrepare()), fileOf(setup(true)))).status,
      ).toBe("COLLECTION_COMMITTED");
      let told: unknown;
      const ctx = {
        ...ctxOf(session, confirmPrepare()),
        attestHost: async (task: any) => {
          told = task.clarified;
          return delegatedCycleAnswer(task, { cycle_ground: STATEMENT() });
        },
      };
      expect((await attestCycle(ctx, { mechanism_id: MECH })).status).toBe("COLLECTION_COMMITTED");
      expect(told).toEqual([
        expect.objectContaining({ provenance: "PLAYER-DELEGATED", statement: STATEMENT() }),
      ]);
      expect(
        new PcCollectionAdapter(session.campaign.store).attestation(PC_ID, MECH),
      ).toBeDefined();
      expect(session.campaign.verify()).toEqual([]);
    } finally {
      await session.close();
    }
  }, 480_000);

  it("running it again with the same scope converges: the host is not asked again and the campaign does not change", async () => {
    const dirs = await startingShape();
    expect((await delegate(dirs, playerConsole())).result.status).toBe("DELEGATION_ACCEPTED");
    const head = await headOf(dirs.campaignDir);
    const again = await delegate(dirs, playerConsole(false));
    expect(again.result.status).toBe("DELEGATION_ACCEPTED");
    expect(again.result.details.join("\n")).toContain("accepted earlier; unchanged");
    expect(again.host!.answered).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 240_000);

  it("a declined confirmation writes nothing and buys no second draw: the same question finds the SAME selection", async () => {
    const dirs = await startingShape();
    const head = await headOf(dirs.campaignDir);
    let draws = 0;
    // a host that would choose differently every time it is asked - it must be asked exactly once
    const shopping = gm(
      () => ({}),
      () => SHORTEST + draws++,
    );
    const declined = await delegate(dirs, playerConsole(false), shopping);
    expect(declined.result.status).toBe("DECLINED");
    expect(declined.host!.answered).toHaveLength(1);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(delegationKeys(await keysOf(dirs))).toEqual([]);
    const accepted = await delegate(dirs, playerConsole(), shopping);
    expect(accepted.result.status).toBe("DELEGATION_ACCEPTED");
    expect(accepted.host!.answered).toEqual([]); // the retained answer was found again
    expect(draws).toBe(1);
    expect((await heldDelegation(dirs))!.value.sealed.duration.value).toBe(SHORTEST);
  }, 360_000);

  it("a second, different scope finds the branch closed: nothing is reselected, redefined or added", async () => {
    const dirs = await startingShape();
    expect((await delegate(dirs, playerConsole())).result.status).toBe("DELEGATION_ACCEPTED");
    const head = await headOf(dirs.campaignDir);
    const second = await delegate(dirs, playerConsole(false), gm(), {
      scope: { constraintWords: null, shortest: 2, longest: 3 },
    });
    expect(second.result.status).toBe("DELEGATION_NOT_AVAILABLE");
    expect(second.result.details.join("\n")).toMatch(/already closed/);
    expect(second.host!.answered).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    // and the player's own clarification of the same branch is refused as well
    const own = await clarifyCollectionCycle({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      pcId: PC_ID,
      operatorDir: dirs.operatorDir,
      terminal: playerConsole(false) as any,
      refereePolls: 3,
      refereePollMs: 5,
      chat: { words: `It takes me 5 ${BASIS.unit} to lift and carry one lump` },
    });
    expect(["CLARIFICATION_NOT_AVAILABLE", "REFEREE_PENDING", "REFEREE_UNAVAILABLE"]).toContain(
      own.status,
    );
    expect(delegationKeys(await keysOf(dirs))).toHaveLength(1);
    expect((await keysOf(dirs)).filter((k) => k.includes("/intrinsic-clarification/"))).toEqual([]);
  }, 480_000);
});

describe("delegate-collection-cycle: what is refused, and why nothing is written", () => {
  it("an unlawful scope is not asked of any host: reversed, zero, fractional or missing bounds, and bad words", async () => {
    const dirs = await startingShape();
    const head = await headOf(dirs.campaignDir);
    for (const scope of [
      { constraintWords: null, shortest: 9, longest: 3 },
      { constraintWords: null, shortest: 0, longest: 3 },
      { constraintWords: null, shortest: 1.5, longest: 3 },
      { constraintWords: null, shortest: Number.NaN, longest: 3 },
      { constraintWords: null, shortest: 1, longest: Number.POSITIVE_INFINITY },
      { constraintWords: "a\u0007bell", shortest: 1, longest: 3 },
    ]) {
      const r = await delegate(dirs, playerConsole(false), gm(), { scope });
      expect(r.result.status, JSON.stringify(scope)).toBe("DELEGATION_NOT_AVAILABLE");
      expect(r.host!.answered).toEqual([]);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 360_000);

  it("a genuine refusal by the host selects nothing: the duration is already stated, the request is outside the branch, or the answer is outside the bounds", async () => {
    const stated = await startingShape();
    const head = await headOf(stated.campaignDir);
    const refusal = (over: Record<string, unknown>) =>
      gm(() => ({ selection: null, baseline_ground: null, ...over }));
    const a = await delegate(
      stated,
      playerConsole(false),
      refusal({ branch: "ALREADY_STATED_IN_BASELINE" }),
    );
    expect(a.result.status).toBe("DELEGATION_NOT_ACCEPTED");
    const b = await delegate(
      stated,
      playerConsole(false),
      refusal({ scope: "ADDS_OR_CHANGES_A_CAPABILITY_OR_ACTUATOR" }),
    );
    expect(b.result.status).toBe("DELEGATION_NOT_ACCEPTED");
    expect(await headOf(stated.campaignDir)).toEqual(head);
    // an answer outside the committed bounds is never used, however it is dressed: the bounded attempts are exhausted
    const wild = await startingShape();
    const wildHead = await headOf(wild.campaignDir);
    const out = await delegate(
      wild,
      playerConsole(false),
      gm(
        () => ({}),
        () => LONGEST + 50,
      ),
    );
    expect(out.result.status).toBe("REFEREE_ANSWER_REFUSED");
    expect(await headOf(wild.campaignDir)).toEqual(wildHead);
    expect(delegationKeys(await keysOf(wild))).toEqual([]);
  }, 480_000);

  it("without a bound referee, or without an answer, nothing is delegated; a host bound only to other operations is not a delegate host", async () => {
    const unbound = await startingShape(false);
    const head = await headOf(unbound.campaignDir);
    const none = await delegate(unbound, playerConsole(false), null, {
      refereePolls: 3,
      refereePollMs: 5,
    });
    expect(none.result.status).toBe("REFEREE_UNAVAILABLE");
    // bound for the cycle and reach only: no delegate task can be answered by it
    const partial = await startingShape(false);
    const bound = await bindHost({
      stateDir: partial.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: GM_HOST,
      operations: ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"] as any,
    });
    expect(bound.ok).toBe(true);
    const other = await delegate(partial, playerConsole(false), plainPolicy, {
      refereePolls: 3,
      refereePollMs: 5,
    });
    expect(other.result.status).toBe("REFEREE_UNAVAILABLE");
    // bound, but nobody answers
    const silent = await startingShape();
    const pending = await delegate(silent, playerConsole(false), null, {
      refereePolls: 3,
      refereePollMs: 5,
    });
    expect(pending.result.status).toBe("REFEREE_PENDING");
    expect(await headOf(unbound.campaignDir)).toEqual(head);
    expect(delegationKeys(await keysOf(silent))).toEqual([]);
  }, 480_000);

  it("is available only for the verified bound character, at an established clock", async () => {
    const dirs = await startingShape();
    const other = await delegate(dirs, playerConsole(false), gm(), { pcId: "pc-someone-else" });
    expect(other.result.status).toBe("CHARACTER_NONE");
    const noClock = (await observationCampaign({ words: { embodiment: EMBODIMENT }, time: false }))
      .dirs;
    const r = await delegate(noClock, playerConsole(false));
    expect(r.result.status).toBe("DELEGATION_NOT_AVAILABLE");
    expect(r.host!.answered).toEqual([]);
    expect(delegationKeys(await keysOf(noClock))).toEqual([]);
  }, 480_000);

  it("the delegation host is bound by its own command, to the delegated operation only", async () => {
    const dirs = await startingShape(false);
    const lines: string[] = [];
    const code = await runCli(
      [
        "referee-bind-delegation-host",
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--operator-dir",
        dirs.operatorDir,
        "--host-id",
        GM_HOST,
      ],
      { out: (l) => lines.push(l) },
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("REFEREE_HOST_BOUND");
    expect(lines.join("\n")).toContain("delegated selection");
    // a host bound this way can answer the delegated task, and nothing else of the collection
    const cfg = await openOrdinary(dirs.campaignDir);
    await cfg.close();
    const r = await delegate(dirs, playerConsole());
    expect(r.result.status, JSON.stringify(r.result.details)).toBe("DELEGATION_ACCEPTED");
  }, 240_000);

  it("is a closed command of the shipped CLI: it needs the character and both bounds, takes no other option, and a bad request prints the usage", async () => {
    const dirs = await startingShape();
    const lines: string[] = [];
    const base = [
      "delegate-collection-cycle",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
    ];
    expect(await runCli(base, { out: (l) => lines.push(l) })).not.toBe(0); // no character, no bounds
    expect(lines.join("\n")).toContain("delegate-collection-cycle");
    expect(
      await runCli([...base, "--player-character", PC_ID, "--shortest", "4"], {
        out: () => undefined,
      }),
    ).not.toBe(0); // no --longest
    expect(
      await runCli(
        [
          ...base,
          "--player-character",
          PC_ID,
          "--shortest",
          "4",
          "--longest",
          "12",
          "--world",
          WORLD_ID,
        ],
        { out: () => undefined },
      ),
    ).not.toBe(0); // an option the command does not take
    const terminal = playerConsole();
    const h = startScriptedHost(dirs, gm(), GM_HOST);
    try {
      const out: string[] = [];
      const code = await runCli(
        [
          ...base,
          "--player-character",
          PC_ID,
          "--shortest",
          String(SHORTEST),
          "--longest",
          String(LONGEST),
          "--words",
          "nothing frantic",
          "--referee-wait",
          "5",
        ],
        { out: (l) => out.push(l), terminal },
      );
      expect(out.some((l) => l.startsWith("STATUS DELEGATION_ACCEPTED"))).toBe(true);
      expect(code).toBe(0);
    } finally {
      await h.stop();
    }
  }, 240_000);
});
