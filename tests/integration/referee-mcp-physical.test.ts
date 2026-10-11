/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary JSON-RPC replies */
// The stdio MCP referee server answering the PHYSICAL-PLACEMENT question (BLUE v5.1), as a REAL PROCESS spoken to as an MCP client would. The
// answers submitted here come from the test (a scripted policy): this proves the TRANSPORT for the third operation and its fail-closed
// behaviour (the host's bound operations are checked before the question is disclosed, a shape or grounds error is refused before anything
// is written, a first answer wins), not any AI judgment.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { bindHost, pendingTasks, refereeDir, secretPath } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN, headOf } from "../support/locality.ts";
import { HOST_ID, plainPolicy } from "../support/original-pc.ts";
import { boundCampaign, establishLocus, locusConsole } from "../support/original-pc-locus.ts";

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
const init = async (c: McpClient) => {
  await c.rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0" },
  });
  c.notify("notifications/initialized");
};

describe("the stdio MCP referee server answers the physical-placement question", () => {
  it("lists, discloses and accepts one valid answer; the engine then derives the verdict and commits only on the player's separate confirmation", async () => {
    const dirs = await boundCampaign();
    const p = params(dirs.operatorDir);
    const asked = await establishLocus(
      dirs,
      locusConsole(),
      { refereePolls: 1, refereePollMs: 1 },
      null,
    );
    expect(asked.result.status).toBe("REFEREE_PENDING");
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, HOST_ID)));
    try {
      await init(c);
      const tools = await c.rpc("tools/list");
      expect(tools.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
        "referee_get_task",
        "referee_list_tasks",
        "referee_submit_decision",
      ]);
      const listed = JSON.parse((await c.call("referee_list_tasks", {})).text);
      expect(listed.tasks).toHaveLength(1);
      expect(listed.tasks[0].operation).toBe("IR_PHYSICAL_PLACEMENT");
      const got = await c.call("referee_get_task", { task_id: listed.tasks[0].task_id });
      expect(got.isError).toBe(false);
      const doc = JSON.parse(got.text);
      expect(doc.operation).toBe("IR_PHYSICAL_PLACEMENT");
      expect(doc.untrusted_text_notice).toContain("DATA");
      expect(Object.keys(doc.embodiment_modes)).toContain("INCORPOREAL");
      expect(doc.rules.map((r: { rule_id: string }) => r.rule_id)).toEqual(
        expect.arrayContaining(["I002-4.3", "IR-2", "IR-12", "IR-14"]),
      );
      // the question is built from committed facts: the statement is the binding's, never anything a caller typed
      expect(doc.context.statement).toContain("originally present at the salt pans");
      // a secret, a path and the nonce-free context only
      expect(got.text).not.toContain(secretPath(p, HOST_ID));

      const good = plainPolicy(doc) as Record<string, any>;
      // a shape error and an ungrounded quotation are refused before anything is written
      const badShape = await c.call("referee_submit_decision", {
        task_id: doc.task_id,
        answer: { ...good, embodiment: { ...good.embodiment, mode: "GHOST" } },
      });
      expect(badShape.isError).toBe(true);
      const badQuote = await c.call("referee_submit_decision", {
        task_id: doc.task_id,
        answer: { ...good, presence: { ...good.presence, evidence_quote: "words nobody wrote" } },
      });
      expect(badQuote.isError).toBe(true);
      expect(badQuote.text).toContain("GROUNDS_UNSUPPORTED");
      expect((await pendingTasks(p)).map((t) => t.task_id)).toEqual([doc.task_id]);

      const ok = await c.call("referee_submit_decision", {
        task_id: doc.task_id,
        answer: good,
        claimed_model: "test-client-model-label",
      });
      expect(ok.isError).toBe(false);
      const second = await c.call("referee_submit_decision", {
        task_id: doc.task_id,
        answer: good,
      });
      expect(second.isError).toBe(true);
    } finally {
      c.end();
      await c.exit();
    }
    // the engine side finds the answer, derives the verdict itself, and commits only after the player's own phrase
    const before = await headOf(dirs.campaignDir);
    const declined = await establishLocus(dirs, locusConsole(false), {}, null);
    expect(declined.result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
    const done = await establishLocus(dirs, locusConsole(), {}, null);
    expect(done.result.status).toBe("LOCUS_ESTABLISHED");
    expect(done.terminal.said.join("\n")).toContain("test-client-model-label");
  }, 180_000);

  it("a host bound only to the two earlier operations is refused the physical question before anything is disclosed", async () => {
    const dirs = await boundCampaign();
    const p = params(dirs.operatorDir);
    const asked = await establishLocus(
      dirs,
      locusConsole(),
      { refereePolls: 1, refereePollMs: 1 },
      null,
    );
    expect(asked.result.status).toBe("REFEREE_PENDING");
    const [task] = await pendingTasks(p);
    rmSync(refereeDir(p), { recursive: true, force: true });
    const rebound = await bindHost({
      ...p,
      operatorUid: process.getuid!(),
      hostId: HOST_ID,
      operations: ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY"],
    });
    expect(rebound.ok).toBe(true);
    // the question file is gone with the directory; re-publish it through the engine side so the host can ask for it
    await establishLocus(dirs, locusConsole(), { refereePolls: 1, refereePollMs: 1 }, null);
    const c = new McpClient(mcpArgs(dirs.operatorDir, secretPath(p, HOST_ID)));
    try {
      await init(c);
      const listed = JSON.parse((await c.call("referee_list_tasks", {})).text);
      expect(listed.tasks).toEqual([]);
      const got = await c.call("referee_get_task", { task_id: task!.task_id });
      expect(got.isError).toBe(true);
      expect(got.text).not.toContain("salt pans");
    } finally {
      c.end();
      await c.exit();
    }
  }, 180_000);
});
