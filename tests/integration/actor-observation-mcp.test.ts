/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary JSON-RPC replies and raw task documents */
// The stdio MCP referee server answering the NON-PC Named-Actor direct-perception question (BLUE v5.2-A1), as a REAL PROCESS spoken to as an
// MCP client would. The answers submitted here come from the test (a scripted policy): this proves the TRANSPORT for the fifth operation and
// its fail-closed behaviour (the host's bound operations are checked before the question is disclosed, a shape or grounds error is refused
// before anything is written, the source's key is never disclosed, a first answer wins), not any AI judgment.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, RefereeAdjudicationAdapter } from "@immortalis/engine";
import { bindHost, pendingTasks, publishTask, readTask, secretPath } from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import {
  ACTOR,
  ACTOR_HOST_ID,
  ALL_OPERATIONS,
  FIXTURE_CAMPAIGN,
  SECRET,
  SIGHT,
  SOURCE,
  actorAnswer,
  actorScene,
  bindActorHost,
  freshActorDirs,
  type LocalityDirs,
} from "../support/actor-observation.ts";

const BIN = "packages/operator/src/referee-bin.ts";

class McpClient {
  readonly #proc;
  readonly #lines: string[] = [];
  readonly #waiters: ((l: string) => void)[] = [];
  #id = 0;
  constructor(args: string[]) {
    this.#proc = spawn(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", BIN, ...args],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    createInterface({ input: this.#proc.stdout }).on("line", (l) => {
      const w = this.#waiters.shift();
      if (w) w(l);
      else this.#lines.push(l);
    });
  }
  next(): Promise<string> {
    const l = this.#lines.shift();
    if (l !== undefined) return Promise.resolve(l);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the MCP server did not reply")), 20_000);
      this.#waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }
  async rpc(method: string, params: unknown = {}): Promise<any> {
    const id = ++this.#id;
    this.#proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const msg = JSON.parse(await this.next());
    expect(msg.id).toBe(id);
    return msg;
  }
  async call(name: string, args: unknown): Promise<{ text: string; isError: boolean }> {
    const msg = await this.rpc("tools/call", { name, arguments: args });
    return { text: msg.result.content[0].text, isError: msg.result.isError === true };
  }
  notify(method: string): void {
    this.#proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }
  end(): void {
    this.#proc.stdin.end();
  }
}

const mcpArgs = (operatorDir: string, secretFile: string, hostId = ACTOR_HOST_ID) => [
  "--operator-dir",
  operatorDir,
  "--campaign-id",
  FIXTURE_CAMPAIGN,
  "--host-id",
  hostId,
  "--secret-file",
  secretFile,
];
const params = (dirs: LocalityDirs) => ({
  stateDir: dirs.operatorDir,
  campaignId: FIXTURE_CAMPAIGN,
});
const init = async (c: McpClient) => {
  await c.rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0" },
  });
  c.notify("notifications/initialized");
};

/** A campaign with a bound host, and the engine-built actor question published to the exchange exactly as the operator publishes it. */
async function published(operations: readonly (typeof ALL_OPERATIONS)[number][]) {
  const dirs = freshActorDirs();
  const s = await actorScene(dirs.campaignDir);
  const task = s.referee.actorObservationTask({
    actor_id: ACTOR,
    capability_id: SIGHT,
    source_key: SOURCE,
    attempt: 0,
  });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  await s.campaign.close();
  await bindActorHost(dirs, operations);
  const t = await publishTask(params(dirs), {
    task_id: task.value.task_id,
    operation: "F014D_ACTOR_DIRECT_PERCEPTION",
    context: task.value.context,
  });
  if (!t.ok) throw new Error(JSON.stringify(t.error));
  return { dirs, context: task.value.context, taskId: task.value.task_id };
}

describe("the stdio MCP referee server answers the actor direct-perception question", () => {
  it("lists, discloses without the source's key and accepts one valid answer; a shape or grounds error is refused before anything is written", async () => {
    const { dirs, context, taskId } = await published(["F014D_ACTOR_DIRECT_PERCEPTION"]);
    const p = params(dirs);
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, ACTOR_HOST_ID)));
    try {
      await init(c);
      const listed = JSON.parse((await c.call("referee_list_tasks", {})).text);
      expect(listed.tasks).toEqual([
        { task_id: taskId, operation: "F014D_ACTOR_DIRECT_PERCEPTION" },
      ]);
      const got = await c.call("referee_get_task", { task_id: taskId });
      expect(got.isError).toBe(false);
      const doc = JSON.parse(got.text);
      expect(doc.operation).toBe("F014D_ACTOR_DIRECT_PERCEPTION");
      expect(doc.untrusted_text_notice).toContain("DATA");
      expect(Object.keys(doc.premise_kinds)).toEqual([
        "ACTOR_CAPABILITY",
        "COUPLING_STATEMENT",
        "WORLD_FACT",
      ]);
      expect(doc.rules.map((r: { rule_id: string }) => r.rule_id)).toEqual(
        expect.arrayContaining(["F014D-2", "F014D-5", "F014D-6", "F014D-18", "F014D-24", "IR-12"]),
      );
      // the source's identity, material, quantity and statement are never disclosed; its key is redacted from the cited facts
      for (const hidden of [SOURCE, SECRET.material, SECRET.dimension, SECRET.statement, "120"])
        expect(got.text).not.toContain(hidden);
      expect(got.text).toContain("(the scoped source: withheld)");
      expect(got.text).not.toContain(secretPath(p, ACTOR_HOST_ID));
      expect(doc.context.subject.actor_id).toBe(ACTOR);

      const good: any = actorAnswer(doc);
      // a shape error and a grounds error are refused by the server before anything is written
      const badShape = await c.call("referee_submit_decision", {
        task_id: taskId,
        answer: { ...good, verdict: "OBSERVATION_ESTABLISHED" },
      });
      expect(badShape.isError).toBe(true);
      expect(badShape.text).toMatch(/does not satisfy the shape/);
      const misquote = structuredClone(good);
      misquote.faculty.premises[0].evidence_quote = "perfect eyesight";
      const badGrounds = await c.call("referee_submit_decision", {
        task_id: taskId,
        answer: misquote,
      });
      expect(badGrounds.isError).toBe(true);
      expect(badGrounds.text).toMatch(/GROUNDS_UNSUPPORTED/);
      expect(await pendingTasks(p)).toHaveLength(1);

      const accepted = await c.call("referee_submit_decision", {
        task_id: taskId,
        answer: good,
        claimed_model: "scripted-test-policy (NOT an AI)",
      });
      expect(accepted.isError, accepted.text).toBe(false);
      expect(accepted.text).toMatch(/the engine will validate it and derive the verdict itself/);
      expect(await pendingTasks(p)).toHaveLength(0);
      // the first answer wins
      const second = await c.call("referee_submit_decision", { task_id: taskId, answer: good });
      expect(second.isError).toBe(true);
    } finally {
      c.end();
    }
    // the engine, which holds the real context, validates what the host submitted and derives the verdict itself
    const opened = await CanonicalCampaign.open(dirs.campaignDir, {
      buildId: "actor-mcp-reader",
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    if (!opened.ok) throw new Error("did not open");
    try {
      const adapter = new RefereeAdjudicationAdapter(opened.value.store);
      const task = await readTask(p, taskId);
      expect(task.ok).toBe(true);
      const evaluated = adapter.evaluateActorObservation(
        context,
        actorAnswer({ task_id: taskId, context }),
      );
      expect(evaluated.ok && evaluated.value.verdict).toBe("OBSERVATION_ESTABLISHED");
    } finally {
      await opened.value.close();
    }
  });

  it("does not disclose the actor question to a host bound only to the other operations: it is authorized for THIS operation first", async () => {
    const { dirs, taskId } = await published(
      ALL_OPERATIONS.filter((o) => o !== "F014D_ACTOR_DIRECT_PERCEPTION"),
    );
    const p = params(dirs);
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, ACTOR_HOST_ID)));
    try {
      await init(c);
      // the host is bound to the four others: the actor question is not even listed
      const listed = JSON.parse((await c.call("referee_list_tasks", {})).text);
      expect(listed.tasks).toEqual([]);
      const got = await c.call("referee_get_task", { task_id: taskId });
      expect(got.isError).toBe(true);
      expect(got.text).toMatch(/not bound to this operation/);
      expect(got.text).not.toContain(SECRET.material);
      const submit = await c.call("referee_submit_decision", { task_id: taskId, answer: {} });
      expect(submit.isError).toBe(true);
      expect(submit.text).toMatch(/not bound to this operation/);
    } finally {
      c.end();
    }
    expect(await pendingTasks(p)).toHaveLength(1);
  });

  it("a host bound to nothing the campaign names is refused with the same message and discloses nothing", async () => {
    const { dirs, taskId } = await published(["F014D_ACTOR_DIRECT_PERCEPTION"]);
    const p = params(dirs);
    const stranger = await bindHost({
      ...p,
      operatorUid: process.getuid!(),
      hostId: "stranger",
      operations: ["I002_CLASSIFY"],
    });
    expect(stranger.ok).toBe(true);
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, "stranger"), "stranger"));
    try {
      await init(c);
      const got = await c.call("referee_get_task", { task_id: taskId });
      expect(got.isError).toBe(true);
      expect(got.text).not.toContain(SECRET.material);
    } finally {
      c.end();
    }
  });
});
