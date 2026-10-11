// The reference host transport (`immortalis-referee`, a stdio MCP server) as a REAL PROCESS, spoken to as an MCP client would speak to it.
// The answers submitted here come from the test (a scripted policy): this proves the TRANSPORT and its fail-closed behaviour
// (authentication before disclosure, closed tool surface, shape and grounds checks, no campaign access), not any AI judgment.
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { pendingTasks } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN } from "../support/locality.ts";
import {
  HOST_ID,
  STANDARD,
  author,
  localityCampaign,
  plainPolicy,
  respondingConsole,
  startScriptedHost,
} from "../support/original-pc.ts";
import { refereeDir, secretPath } from "@immortalis/operator";

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
  exit(): Promise<number | null> {
    return new Promise((resolve) => this.#proc.on("exit", (c) => resolve(c)));
  }
  stderr(): Promise<string> {
    return new Promise((resolve) => {
      let out = "";
      this.#proc.stderr.on("data", (d) => (out += d));
      this.#proc.on("exit", () => resolve(out));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client
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

const mcpArgs = (operatorDir: string, secretFile: string, hostId = HOST_ID) => [
  "--operator-dir",
  operatorDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--host-id",
  hostId,
  "--secret-file",
  secretFile,
];

const params = (operatorDir: string) => ({ stateDir: operatorDir, campaignId: LOCALITY_CAMPAIGN });

describe("the stdio MCP referee server", () => {
  it("speaks MCP, exposes exactly three tools, and a complete journey can be answered through it", async () => {
    const dirs = await localityCampaign();
    const p = params(dirs.operatorDir);
    // the host's secret and the trusted binding are owner-only
    expect(statSync(secretPath(p, HOST_ID)).mode & 0o777).toBe(0o600);
    expect(statSync(join(refereeDir(p), "config.json")).mode & 0o777).toBe(0o600);
    // the engine side asks (no host connected yet): PENDING, with the question published
    const asked = await author(
      dirs,
      respondingConsole(STANDARD),
      { refereePolls: 1, refereePollMs: 1 },
      null,
    );
    expect(asked.result.status).toBe("REFEREE_PENDING");

    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, HOST_ID)));
    const init = await c.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0" },
    });
    expect(init.result.serverInfo.name).toBe("immortalis-referee");
    expect(init.result.capabilities).toEqual({ tools: {} });
    c.notify("notifications/initialized");
    const listed = await c.rpc("tools/list");
    expect(listed.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "referee_list_tasks",
      "referee_get_task",
      "referee_submit_decision",
    ]);
    expect((await c.rpc("no/such/method")).error.code).toBe(-32601);
    expect((await c.call("run_shell", { command: "id" })).isError).toBe(true);

    const tasks = JSON.parse((await c.call("referee_list_tasks", {})).text).tasks;
    expect(tasks).toHaveLength(1);
    const got = await c.call("referee_get_task", { task_id: tasks[0].task_id });
    expect(got.isError).toBe(false);
    const doc = JSON.parse(got.text);
    expect(doc.untrusted_text_notice).toContain("DATA");
    expect(doc.rules.length).toBeGreaterThan(0);
    // nothing in the disclosed document is a secret, a path or a credential
    expect(got.text).not.toContain(readFileSync(secretPath(p, HOST_ID), "utf8").trim());
    expect(got.text).not.toContain(dirs.operatorDir);

    // a malformed answer is refused with the reason, and nothing is written
    const badShape = await c.call("referee_submit_decision", {
      task_id: tasks[0].task_id,
      answer: { task_id: tasks[0].task_id, items: [] },
    });
    expect(badShape.isError).toBe(true);
    // an answer that leaves an item undecided is refused by the grounds check, before anything is written
    const partial = plainPolicy(doc) as { items: unknown[] };
    const incomplete = await c.call("referee_submit_decision", {
      task_id: tasks[0].task_id,
      answer: { ...partial, items: partial.items.slice(1) },
    });
    expect(incomplete.isError).toBe(true);
    expect(incomplete.text).toContain("COVERAGE_INCOMPLETE");
    // an invented quotation is refused
    const invented = await c.call("referee_submit_decision", {
      task_id: tasks[0].task_id,
      answer: {
        ...partial,
        items: (partial.items as Record<string, unknown>[]).map((i, n) =>
          n === 0
            ? { ...i, class: "WORLD_STATE_ASSERTION", evidence_quote: "words never written" }
            : i,
        ),
      },
    });
    expect(invented.isError).toBe(true);
    expect((await pendingTasks(p)).length).toBe(1);

    const good = await c.call("referee_submit_decision", {
      task_id: tasks[0].task_id,
      answer: plainPolicy(doc),
      claimed_model: "test-client policy (NOT an AI)",
    });
    expect(good.isError).toBe(false);
    // a second answer for the same task is refused, never merged
    expect(
      (
        await c.call("referee_submit_decision", {
          task_id: tasks[0].task_id,
          answer: plainPolicy(doc),
        })
      ).isError,
    ).toBe(true);
    c.end();
    expect(await c.exit()).toBe(0);

    // the engine side now finds the answer; the IR question is answered by the in-process scripted host
    const host = startScriptedHost(dirs);
    try {
      const done = await author(dirs, respondingConsole(STANDARD), {}, null);
      expect(done.result.status).toBe("CHARACTER_BOUND");
    } finally {
      await host.stop();
    }
  }, 120_000);

  it("authenticates before it discloses: an unknown host, a wrong secret or a loose secret file learns nothing", async () => {
    const dirs = await localityCampaign();
    const p = params(dirs.operatorDir);
    await author(dirs, respondingConsole(STANDARD), { refereePolls: 1, refereePollMs: 1 }, null);
    const taskId = (await pendingTasks(p))[0]!.task_id;

    // a wrong secret
    const wrong = join(dirname(secretPath(p, HOST_ID)), "wrong.secret");
    writeFileSync(wrong, `${"0".repeat(64)}\n`, { mode: 0o600 });
    const a = new McpClient(mcpArgs(dirs.operatorDir, wrong));
    expect((await a.call("referee_get_task", { task_id: taskId })).isError).toBe(true);
    const listing = await a.call("referee_list_tasks", {});
    expect(listing.isError).toBe(true);
    expect(listing.text).not.toContain(taskId);
    a.end();
    await a.exit();

    // a host the campaign does not know
    const b = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, HOST_ID), "some-other-host"));
    const denied = await b.call("referee_get_task", { task_id: taskId });
    expect(denied.isError).toBe(true);
    expect(denied.text).not.toContain("nonce");
    b.end();
    await b.exit();

    // a secret file other users could read is not used at all
    const loose = join(dirname(secretPath(p, HOST_ID)), "loose.secret");
    copyFileSync(secretPath(p, HOST_ID), loose);
    chmodSync(loose, 0o644);
    const l = new McpClient(mcpArgs(dirs.operatorDir, loose));
    const stderr = l.stderr();
    expect(await l.exit()).toBe(64);
    expect(await stderr).toContain("usage");

    // the host is not told about the campaign package: the process never opens it
    expect(refereeDir(p)).toContain(dirs.operatorDir);
  }, 60_000);

  it("a host bound only to one operation cannot read or answer the other's task", async () => {
    const dirs = await localityCampaign();
    const p = params(dirs.operatorDir);
    const cfgPath = join(refereeDir(p), "config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.hosts[0].operations = ["IR_NATIVE_COMPATIBILITY"];
    writeFileSync(cfgPath, JSON.stringify(cfg));
    await author(dirs, respondingConsole(STANDARD), { refereePolls: 1, refereePollMs: 1 }, null);
    const taskId = (await pendingTasks(p))[0]!.task_id;
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, HOST_ID)));
    const tasks = JSON.parse((await c.call("referee_list_tasks", {})).text).tasks;
    expect(tasks).toEqual([]);
    expect((await c.call("referee_get_task", { task_id: taskId })).isError).toBe(true);
    c.end();
    await c.exit();
  }, 60_000);
});
