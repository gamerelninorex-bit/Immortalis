// H-02: the stdio MCP referee server as a REAL PROCESS must survive every line a peer can send. A line that is valid JSON but not a
// request (`null`, a scalar, an array, an object without a method) used to be dereferenced outside the parse guard and could end the
// process, so a later valid request on the same stream was never answered. These tests send the hostile lines first and a valid request
// after them, on the SAME process. They test the transport only: no AI judgment, no canonical write, no change to host authentication.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import {
  bindHost,
  refereeDir,
  secretPath,
  pendingTasks,
  REFEREE_TASK_FORMAT,
} from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const BIN = "packages/operator/src/referee-bin.ts";
const CAMPAIGN = "campaign-h02";
const TASK_ID = "a".repeat(64);
const params = (stateDir: string) => ({ stateDir, campaignId: CAMPAIGN });

class RawClient {
  readonly #proc;
  readonly #lines: string[] = [];
  readonly #waiters: ((l: string) => void)[] = [];
  #exited: number | null | undefined;
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
    this.#proc.on("exit", (c) => (this.#exited = c));
  }
  /** raw bytes, exactly as given (the caller supplies the newline) */
  raw(data: string): void {
    this.#proc.stdin.write(data);
  }
  line(value: unknown): void {
    this.raw(`${JSON.stringify(value)}\n`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client
  async next(): Promise<any> {
    const l = this.#lines.shift();
    if (l !== undefined) return JSON.parse(l);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the MCP server did not reply")), 20_000);
      this.#waiters.push((line) => {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      });
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client
  async rpc(id: number | string, method: string, params: unknown = {}): Promise<any> {
    this.line({ jsonrpc: "2.0", id, method, params });
    return this.next();
  }
  /** true while the process has not exited */
  alive(): boolean {
    return this.#exited === undefined;
  }
  end(): Promise<number | null> {
    this.#proc.stdin.end();
    return new Promise((resolve) => {
      if (this.#exited !== undefined) resolve(this.#exited);
      else this.#proc.on("exit", (c) => resolve(c));
    });
  }
}

async function boundCampaign(operations = ["I002_CLASSIFY"] as const) {
  const operatorDir = tempDir("immortalis-h02-");
  const p = params(operatorDir);
  const bound = await bindHost({
    ...p,
    operatorUid: process.getuid!(),
    hostId: "host-a",
    operations: [...operations],
  });
  if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
  // one published question, written as the engine side would; its context is never needed because every host below is refused first
  mkdirSync(join(refereeDir(p), "tasks"), { recursive: true });
  mkdirSync(join(refereeDir(p), "decisions"), { recursive: true });
  writeFileSync(
    join(refereeDir(p), "tasks", `${TASK_ID}.json`),
    JSON.stringify({
      format: REFEREE_TASK_FORMAT,
      format_version: 1,
      task_id: TASK_ID,
      operation: "IR_NATIVE_COMPATIBILITY",
      campaign_id: CAMPAIGN,
      nonce: "b".repeat(32),
      document: { secret_marker: "TASK-CONTEXT-MUST-NOT-LEAK" },
    }),
  );
  return { operatorDir, p, secretFile: secretPath(p, "host-a") };
}

const args = (operatorDir: string, secretFile: string, hostId = "host-a") => [
  "--operator-dir",
  operatorDir,
  "--campaign-id",
  CAMPAIGN,
  "--host-id",
  hostId,
  "--secret-file",
  secretFile,
];

const INITIALIZE = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test-client", version: "0" },
};

describe("H-02: the stdio MCP referee server survives hostile request lines", () => {
  it("answers the literal line `null` with a protocol refusal and then still answers a valid ping on the same process", async () => {
    const { operatorDir, secretFile } = await boundCampaign();
    const c = new RawClient(args(operatorDir, secretFile));
    c.raw("null\n");
    const refusal = await c.next();
    expect(refusal).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "invalid request" },
    });
    expect(c.alive()).toBe(true);
    const pong = await c.rpc(7, "ping");
    expect(pong).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
    expect(await c.end()).toBe(0);
  }, 60_000);

  it("keeps the existing parse-error reply for syntactically invalid JSON, then answers ping and initialize", async () => {
    const { operatorDir, secretFile } = await boundCampaign();
    const c = new RawClient(args(operatorDir, secretFile));
    c.raw("{not json\n");
    expect(await c.next()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "parse error" },
    });
    expect((await c.rpc(1, "ping")).result).toEqual({});
    const init = await c.rpc(2, "initialize", INITIALIZE);
    expect(init.result.serverInfo.name).toBe("immortalis-referee");
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(await c.end()).toBe(0);
  }, 60_000);

  it("refuses parsed non-object and ill-formed envelopes one by one, and every one is followed by a normal reply", async () => {
    const { operatorDir, secretFile } = await boundCampaign();
    const c = new RawClient(args(operatorDir, secretFile));
    const hostile = [
      "null",
      "7",
      '"ping"',
      "true",
      "[]",
      '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
      '{"jsonrpc":"2.0","id":3}', // a request without a method
      '{"jsonrpc":"2.0","id":4,"method":5}', // a method that is not a name
      '{"jsonrpc":"2.0","method":5}', // no id and no method name: not a notification
      '{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}', // an id that is not a string or number
      '{"jsonrpc":"2.0","id":true,"method":"ping"}',
      '{"jsonrpc":"2.0","id":null,"method":"ping"}',
    ];
    const replies: unknown[] = [];
    for (const h of hostile) {
      c.raw(`${h}\n`);
      replies.push(await c.next());
      expect(c.alive(), `alive after ${h}`).toBe(true);
    }
    // a method-less request with a usable id is answered under that id; every other refusal carries a null id
    expect(replies.map((r) => (r as { id: unknown }).id)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      3,
      4,
      null,
      null,
      null,
      null,
    ]);
    for (const r of replies) {
      expect(r).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32600, message: "invalid request" },
      });
      expect(r).not.toHaveProperty("result");
    }
    expect(await c.rpc("after", "ping")).toEqual({ jsonrpc: "2.0", id: "after", result: {} });
    expect((await c.rpc(9, "tools/list")).result.tools).toHaveLength(3);
    expect(await c.end()).toBe(0);
  }, 60_000);

  it("does not conflate a real notification with a malformed request: a notification gets no reply at all", async () => {
    const { operatorDir, secretFile } = await boundCampaign();
    const c = new RawClient(args(operatorDir, secretFile));
    c.line({ jsonrpc: "2.0", method: "notifications/initialized" });
    c.line({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } });
    // had either notification been answered, its reply would arrive before the ping's
    expect(await c.rpc(1, "ping")).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    // and a malformed line IS answered
    c.raw("null\n");
    expect((await c.next()).error.code).toBe(-32600);
    expect(await c.end()).toBe(0);
  }, 60_000);

  it("keeps accepted behavior: the three-tool surface, method-not-found, and an unknown tool stays a refusal", async () => {
    const { operatorDir, secretFile } = await boundCampaign();
    const c = new RawClient(args(operatorDir, secretFile));
    c.raw("[]\n");
    await c.next();
    const listed = await c.rpc(1, "tools/list");
    expect(listed.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "referee_list_tasks",
      "referee_get_task",
      "referee_submit_decision",
    ]);
    expect((await c.rpc(2, "no/such/method")).error.code).toBe(-32601);
    const shell = await c.rpc(3, "tools/call", { name: "run_shell", arguments: { command: "id" } });
    expect(shell.result.isError).toBe(true);
    // malformed tools/call data is a refusal, never an acceptance
    for (const bad of [
      null,
      5,
      "x",
      [],
      { name: 5 },
      { name: "referee_get_task", arguments: "x" },
    ]) {
      const r = await c.rpc(4, "tools/call", bad);
      expect(r.result.isError, JSON.stringify(bad)).toBe(true);
    }
    expect(await c.end()).toBe(0);
  }, 60_000);

  it("grants nothing and leaks nothing after hostile lines: authentication, disclosure and decisions behave exactly as before", async () => {
    const { operatorDir, p, secretFile } = await boundCampaign(["I002_CLASSIFY"]);
    const before = readdirSync(join(refereeDir(p), "decisions"));

    // the bound host is not allowed the operation of this task: refused after the hostile lines too
    const excluded = new RawClient(args(operatorDir, secretFile));
    for (const h of ["null", "1", "[]", "{}"]) {
      excluded.raw(`${h}\n`);
      expect((await excluded.next()).error.code).toBe(-32600);
    }
    const listed = await excluded.rpc(1, "tools/call", {
      name: "referee_list_tasks",
      arguments: {},
    });
    expect(JSON.parse(listed.result.content[0].text)).toEqual({ tasks: [] });
    for (const name of ["referee_get_task", "referee_submit_decision"]) {
      const r = await excluded.rpc(2, "tools/call", {
        name,
        arguments: { task_id: TASK_ID, answer: {} },
      });
      expect(r.result.isError, name).toBe(true);
      expect(r.result.content[0].text).not.toContain("TASK-CONTEXT-MUST-NOT-LEAK");
    }
    expect(await excluded.end()).toBe(0);

    // a host the campaign does not know learns nothing, before and after hostile lines
    const stranger = new RawClient(args(operatorDir, secretFile, "stranger"));
    stranger.raw("null\n");
    expect((await stranger.next()).error.code).toBe(-32600);
    for (const name of ["referee_list_tasks", "referee_get_task", "referee_submit_decision"]) {
      const r = await stranger.rpc(3, "tools/call", {
        name,
        arguments: { task_id: TASK_ID, answer: {} },
      });
      expect(r.result.isError, name).toBe(true);
      expect(r.result.content[0].text).not.toContain("TASK-CONTEXT-MUST-NOT-LEAK");
      expect(r.result.content[0].text).not.toContain(TASK_ID);
    }
    expect(await stranger.end()).toBe(0);

    // a wrong secret is refused the same way
    const wrongFile = join(operatorDir, "wrong.secret");
    writeFileSync(wrongFile, `${"0".repeat(64)}\n`, { mode: 0o600 });
    const wrong = new RawClient(args(operatorDir, wrongFile));
    wrong.raw("[1]\n");
    expect((await wrong.next()).error.code).toBe(-32600);
    const denied = await wrong.rpc(4, "tools/call", {
      name: "referee_get_task",
      arguments: { task_id: TASK_ID },
    });
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).not.toContain("TASK-CONTEXT-MUST-NOT-LEAK");
    expect(await wrong.end()).toBe(0);

    // no phantom task, no decision, no new file, and the question is still pending
    expect(readdirSync(join(refereeDir(p), "decisions"))).toEqual(before);
    expect(existsSync(join(refereeDir(p), "decisions", `${TASK_ID}.json`))).toBe(false);
    expect((await pendingTasks(p)).map((t) => t.task_id)).toEqual([TASK_ID]);
  }, 60_000);
});
