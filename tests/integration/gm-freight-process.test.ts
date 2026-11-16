/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import { quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import { must } from "../support/temporal.ts";
import {
  attestRequest,
  legalRequest,
  operatorStartsChronology,
  playerAdvancesTo,
  settingRequest,
  type GmRig,
} from "../support/gm-freight.ts";

/**
 * A REAL TRANSPORT PATH (T1, MECHANISM ONLY): the shipped stdio MCP server binary, started as a separate operating-system process exactly as a
 * compatible host would register it (`immortalis-gm-freight --campaign … --secret-file …`), driven over its real stdin/stdout by a scripted
 * JSON-RPC client. The operator binds the host with the shipped bind binary. The "GM" is a script that submits the fixture's premises: no
 * model, host application, named client or retained store is involved. This proves the process boundary, the binding, the MCP lifecycle and
 * the whole first-profile chain over the wire; it does NOT prove that any model can author these premises (T2, UNRUN).
 */

const NODE = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"];
const BIN = (name: string) => join(process.cwd(), "packages/operator/src", name);

class McpClient {
  readonly #child: ChildProcessWithoutNullStreams;
  #buffer = "";
  #nextId = 1;
  readonly #waiting = new Map<number, (m: any) => void>();
  readonly stderr: string[] = [];
  constructor(args: string[]) {
    this.#child = spawn(process.execPath, [...NODE, BIN("gm-freight-bin.ts"), ...args], {
      stdio: "pipe",
    });
    this.#child.stdout.on("data", (d) => {
      this.#buffer += String(d);
      let i: number;
      while ((i = this.#buffer.indexOf("\n")) >= 0) {
        const line = this.#buffer.slice(0, i);
        this.#buffer = this.#buffer.slice(i + 1);
        if (line.trim() === "") continue;
        const m = JSON.parse(line);
        this.#waiting.get(m.id)?.(m);
        this.#waiting.delete(m.id);
      }
    });
    this.#child.stderr.on("data", (d) => this.stderr.push(String(d)));
  }
  request(method: string, params?: unknown): Promise<any> {
    const id = this.#nextId++;
    const p = new Promise<any>((resolve) => this.#waiting.set(id, resolve));
    this.#child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`,
    );
    return p;
  }
  notify(method: string): void {
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }
  async call(name: string, args: unknown): Promise<any> {
    const r = await this.request("tools/call", { name, arguments: args });
    return { isError: r.result?.isError === true, ...JSON.parse(r.result.content[0].text) };
  }
  async close(): Promise<number | null> {
    this.#child.stdin.end();
    return new Promise((resolve) => this.#child.on("exit", (code) => resolve(code)));
  }
}

function bindWithShippedBinary(campaignDir: string, campaignId: string, stateDir: string) {
  const r = spawnSync(
    process.execPath,
    [
      ...NODE,
      BIN("gm-freight-bind-bin.ts"),
      "--campaign",
      campaignDir,
      "--campaign-id",
      campaignId,
      "--operator-dir",
      stateDir,
      "--host-id",
      "gm-process-host",
    ],
    { encoding: "utf8" },
  );
  const secretFile = /secret file[^:]*: (\S+)/.exec(r.stdout)?.[1];
  return { status: r.status, out: r.stdout, secretFile };
}

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)(
  "the shipped stdio MCP server, over its real process boundary — %s (MECHANISM ONLY)",
  (_label, fixture) => {
    it("is bound by the shipped bind binary, serves the MCP lifecycle and carries the whole chain to the earned end", async () => {
      const fx = fixture();
      const root = mkdtempSync(join(tmpdir(), "imm-gm-proc-"));
      const campaignDir = join(root, "campaign");
      const stateDir = join(root, "state");
      await (
        await must(
          CanonicalCampaign.create(campaignDir, {
            campaignId: fx.campaignId,
            buildId: "gm-proc-seed",
          }),
        )
      ).close();
      chmodSync(campaignDir, 0o700);

      // the operator's own action binds the host; the output names the tool server and the PATH of the secret, never the secret
      const bound = bindWithShippedBinary(campaignDir, fx.campaignId, stateDir);
      expect(bound.status).toBe(0);
      expect(bound.out).toMatch(/STATUS GM_FREIGHT_HOST_BOUND/);
      expect(bound.out).toMatch(/immortalis-gm-freight --campaign/);
      expect(bound.secretFile).toBeDefined();
      const secret = readFileSync(bound.secretFile!, "utf8").trim();
      expect(bound.out).not.toContain(secret);

      const server = new McpClient([
        "--campaign",
        campaignDir,
        "--campaign-id",
        fx.campaignId,
        "--operator-dir",
        stateDir,
        "--host-id",
        "gm-process-host",
        "--secret-file",
        bound.secretFile!,
      ]);
      // a rig-shaped handle for the scripted operator and player commands (they use the same campaign and state directories)
      const rig = {
        fx,
        campaignDir,
        stateDir,
        hostId: "gm-process-host",
        params: {} as never,
        call: async () => ({}) as never,
      } as GmRig;
      try {
        // MCP lifecycle
        const early = await server.request("tools/list");
        expect(early.error.code).toBe(-32600);
        const init = await server.request("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "scripted-host", version: "0" },
        });
        expect(init.result.serverInfo.name).toBe("immortalis-gm-freight");
        server.notify("notifications/initialized");
        const list = await server.request("tools/list");
        expect(list.result.tools.map((t: any) => t.name).sort()).toEqual(
          Object.values(GM_FREIGHT_TOOLS).sort(),
        );

        // intake, then authoring, in ordinary language with typed readings
        const status0 = await server.call(GM_FREIGHT_TOOLS.status, {});
        expect(status0.ok).toBe(true);
        expect(status0.value.null_pc).toBe(true);
        expect((await server.call(GM_FREIGHT_TOOLS.establishSetting, settingRequest(fx))).ok).toBe(
          true,
        );
        const attested = await server.call(GM_FREIGHT_TOOLS.attestOpening, attestRequest(fx));
        expect(attested.ok).toBe(true);
        expect(attested.value.status.awaiting.kind).toBe("OPERATOR_STARTING_CHRONOLOGY");
        // the operator states the chronology on their own console (the server's package lock is held only during a call)
        expect(await operatorStartsChronology(rig)).toBe("TIME_ESTABLISHED");
        expect((await server.call(GM_FREIGHT_TOOLS.establishLegal, legalRequest(fx))).ok).toBe(
          true,
        );

        // the chain, over the wire, with the player's own time advances between asks
        let go = await server.call(GM_FREIGHT_TOOLS.initiate, {
          operation_id: "p-go-1",
          world_id: fx.worldId,
        });
        expect(go.ok).toBe(true);
        for (let i = 2; go.value.awaiting?.kind === "PLAYER_OOC_TIME_ADVANCE"; i++) {
          expect(await playerAdvancesTo(rig, go.value.awaiting.to)).toBe(
            "NULL_PC_ADVANCE_COMMITTED",
          );
          go = await server.call(GM_FREIGHT_TOOLS.initiate, {
            operation_id: `p-go-${i}`,
            world_id: fx.worldId,
          });
          expect(go.ok).toBe(true);
        }
        expect(go.value.status.stage).toBe("COMPLETE");

        // a refusal is an MCP error result carrying the owner's own reason; a hostile over-claim is an invalid input
        const refused = await server.call(GM_FREIGHT_TOOLS.withdraw, {
          operation_id: "p-w",
          world_id: fx.worldId,
        });
        expect(refused.isError).toBe(true);
        expect(refused.error.code).toBe("GM_FREIGHT_REFUSED");
        const overclaim = await server.call(GM_FREIGHT_TOOLS.initiate, {
          operation_id: "p-x",
          world_id: fx.worldId,
          role: "role.gm",
        });
        expect(overclaim.error.code).toBe("GM_FREIGHT_INPUT_INVALID");
      } finally {
        expect(await server.close()).toBe(0);
      }
      expect(server.stderr.join("")).toBe("");

      // the owners hold the earned result on a cold reopen
      const c = await must(CanonicalCampaign.open(campaignDir, { buildId: "gm-proc-read" }));
      try {
        expect(c.verify()).toEqual([]);
        expect(
          c.store.listFacts().some((f) => f.key.startsWith("economy/destination-adequacy/")),
        ).toBe(true);
      } finally {
        await c.close();
      }
    }, 300_000);

    it("a server started with a wrong secret or a missing secret file serves the one refusal or does not start", async () => {
      const fx = fixture();
      const root = mkdtempSync(join(tmpdir(), "imm-gm-proc2-"));
      const campaignDir = join(root, "campaign");
      const stateDir = join(root, "state");
      await (
        await must(
          CanonicalCampaign.create(campaignDir, {
            campaignId: fx.campaignId,
            buildId: "gm-proc-seed",
          }),
        )
      ).close();
      chmodSync(campaignDir, 0o700);
      const bound = bindWithShippedBinary(campaignDir, fx.campaignId, stateDir);
      // a secret file the owner did not write for this host (a copy with the wrong content) is a well-formed but unbound secret
      const stranger = join(root, "stranger.secret");
      spawnSync("sh", [
        "-c",
        `printf '%s\\n' ${"ab".repeat(32)} > ${stranger} && chmod 600 ${stranger}`,
      ]);
      const server = new McpClient([
        "--campaign",
        campaignDir,
        "--campaign-id",
        fx.campaignId,
        "--operator-dir",
        stateDir,
        "--host-id",
        "gm-process-host",
        "--secret-file",
        stranger,
      ]);
      try {
        await server.request("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "c", version: "0" },
        });
        server.notify("notifications/initialized");
        const r = await server.call(GM_FREIGHT_TOOLS.status, {});
        expect(r.isError).toBe(true);
        expect(r.error).toEqual({
          code: "GM_FREIGHT_UNAVAILABLE",
          message: "no GM freight operation is available",
        });
      } finally {
        await server.close();
      }
      const missing = spawnSync(
        process.execPath,
        [
          ...NODE,
          BIN("gm-freight-bin.ts"),
          "--campaign",
          campaignDir,
          "--campaign-id",
          fx.campaignId,
          "--operator-dir",
          stateDir,
          "--host-id",
          "gm-process-host",
          "--secret-file",
          join(root, "nope.secret"),
        ],
        { encoding: "utf8" },
      );
      expect(missing.status).toBe(64);
      expect(missing.stderr).toMatch(/usage: immortalis-gm-freight/);
      expect(bound.status).toBe(0);
    }, 120_000);
  },
);
