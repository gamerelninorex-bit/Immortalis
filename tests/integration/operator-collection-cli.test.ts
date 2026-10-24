// The shipped CLI's collection commands and the human referee console. The CLI adds no authority of its own: a malformed invocation
// is a usage error before a campaign is touched, and the console has NO default answer — it supplies nothing the human did not type,
// and it never confirms anything for the player.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXIT,
  bindHost,
  collectionTaskDocument,
  collectionTaskId,
  pendingTasks,
  publishRefereeDocument,
  readTask,
  runCli,
  runRefereeConsole,
  secretPath,
  vouchedDecision,
} from "@immortalis/operator";
import { MECH, PC, collectionCampaign, cycleAnswer } from "../support/pc-collection.ts";
import { tempDir } from "../support/tmp.ts";

/** a plain console: it types back only the lines given, then ends the input */
const typing = (...lines: string[]) => {
  const said: string[] = [];
  const queue = [...lines];
  return {
    said,
    say: (t: string) => void said.push(t),
    ask: async (prompt: string) => {
      said.push(prompt);
      return queue.shift() ?? null;
    },
    close: () => undefined,
  };
};

const run = async (argv: string[]) => {
  const lines: string[] = [];
  const code = await runCli(argv, { out: (l) => lines.push(l) });
  return { code, lines };
};
const BASE = ["--campaign", "/nonexistent", "--campaign-id", "cli-campaign"];

describe("the collection commands of the shipped CLI", () => {
  it("a malformed invocation is a usage error before any campaign is opened", async () => {
    for (const argv of [
      ["collect", ...BASE],
      [
        "collect",
        ...BASE,
        "--world",
        "w",
        "--source",
        "s",
        "--reserve",
        "r",
        "--amount",
        "0",
        "--quantity-unit",
        "u",
        "--mechanism",
        "m",
        "--basis",
        "b",
      ],
      [
        "collect",
        ...BASE,
        "--world",
        "w",
        "--source",
        "s",
        "--reserve",
        "r",
        "--amount",
        "1.5",
        "--quantity-unit",
        "u",
        "--mechanism",
        "m",
        "--basis",
        "b",
      ],
      ["attest-cycle", ...BASE],
      ["prepare-collection", ...BASE],
      ["collect-continue", ...BASE, "--referee-wait", "0"],
      ["cease", ...BASE, "--unexpected", "x"],
      ["referee-bind-collection-host", ...BASE],
    ]) {
      const r = await run(argv);
      expect(r.code, argv.join(" ")).toBe(EXIT.USAGE);
    }
  }, 60_000);
});

describe("the human referee console", () => {
  const setup = async () => {
    const stateDir = tempDir("immortalis-referee-console-");
    const p = { stateDir, campaignId: "console-campaign" };
    const bound = await bindHost({
      ...p,
      operatorUid: process.getuid!(),
      hostId: "gm-human",
      operations: ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"],
    });
    expect(bound.ok).toBe(true);
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const id = collectionTaskId("PC_COLLECTION_CYCLE", task);
    const published = await publishRefereeDocument(p, {
      task_id: id,
      operation: "PC_COLLECTION_CYCLE",
      document: (nonce) => collectionTaskDocument("PC_COLLECTION_CYCLE", id, task, nonce),
    });
    expect(published.ok).toBe(true);
    const argv = [
      "--operator-dir",
      stateDir,
      "--campaign-id",
      p.campaignId,
      "--host-id",
      "gm-human",
      "--secret-file",
      secretPath(p, "gm-human"),
    ];
    return { p, id, task, argv };
  };

  it("supplies no answer of its own: quitting, skipping, a non-object or an unparsable line writes nothing", async () => {
    const { p, id, argv } = await setup();
    for (const replies of [
      ["quit"],
      [id, "skip", "quit"],
      [id, "not json", "quit"],
      [id, "[1,2]", "quit"],
      [],
    ]) {
      const t = typing(...replies);
      expect(await runRefereeConsole(argv, t)).toBe(0);
      expect((await pendingTasks(p)).map((x) => x.task_id)).toEqual([id]);
    }
    const stored = await readTask(p, id);
    expect(stored.ok).toBe(true);
    expect(
      stored.ok &&
        (await vouchedDecision({ ...p, operatorUid: process.getuid!() }, stored.value)).ok,
    ).toBe(true);
    expect(
      stored.ok && (await vouchedDecision({ ...p, operatorUid: process.getuid!() }, stored.value)),
    ).toMatchObject({ ok: true, value: null });
  }, 120_000);

  it("the human's own typed reading is the only answer written, and it is vouched for by the bound host", async () => {
    const { p, id, task, argv } = await setup();
    const typed = JSON.stringify(cycleAnswer(task));
    const t = typing(id, typed, "quit");
    expect(await runRefereeConsole(argv, t)).toBe(0);
    const stored = await readTask(p, id);
    const got = stored.ok
      ? await vouchedDecision({ ...p, operatorUid: process.getuid!() }, stored.value)
      : null;
    expect(got).toMatchObject({
      ok: true,
      value: { host_id: "gm-human", answer: cycleAnswer(task) },
    });
    // the console printed the private banner and never read the secret into its output
    const secret = readFileSync(secretPath(p, "gm-human"), "utf8").trim();
    expect(t.said.join("\n")).toContain("REFEREE CONSOLE");
    expect(t.said.join("\n")).not.toContain(secret);
  }, 120_000);
});
