/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies and a stubbed request result */
// Unit evidence for the time-advance-REQUEST MCP transport (BLUE v5.2-A1 bounded brief 2026-10-15): the JSON-RPC 2.0 envelope, the MCP
// initialization lifecycle, the closed one-tool surface and the framing of the trusted request's result, over a STUB request. The stub is a
// recorder, not a source: it asserts no target, time advance, confirmation, verdict or presentation as an upstream fact — it only shows whether the
// transport hands anything on, what it hands on, and how it frames what comes back.
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { fail, ok } from "@immortalis/contracts";
import {
  ADVANCE_REQUEST_TOOL,
  serveAdvanceRequestMcp,
} from "../../packages/operator/src/advance-request-mcp.ts";
import {
  ADVANCE_REQUESTED_MESSAGE,
  ADVANCE_REQUEST_UNAVAILABLE,
  ADVANCE_REQUEST_UNAVAILABLE_MESSAGE,
} from "../../packages/operator/src/advance-request.ts";

type Request = Parameters<typeof serveAdvanceRequestMcp>[0]["request"];

const REFUSAL = fail(ADVANCE_REQUEST_UNAVAILABLE, ADVANCE_REQUEST_UNAVAILABLE_MESSAGE);
const ACK = ok({ status: "TARGET_ADVANCE_REQUESTED" as const, message: ADVANCE_REQUESTED_MESSAGE });

async function exchange(lines: readonly string[], request: Request): Promise<any[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (d) => chunks.push(String(d)));
  const done = serveAdvanceRequestMcp({ request, input, output });
  for (const l of lines) input.write(`${l}\n`);
  input.end();
  await done;
  return chunks
    .join("")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l));
}

const msg = (o: Record<string, unknown>) => JSON.stringify({ jsonrpc: "2.0", ...o });
const rpc = (id: unknown, method: string, params?: unknown) =>
  msg({ id, method, ...(params === undefined ? {} : { params }) });
const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test-client", version: "0" },
};
const INITIALIZED = msg({ method: "notifications/initialized" });
const HANDSHAKE = [rpc(0, "initialize", INIT_PARAMS), INITIALIZED];
const CALL = (id: unknown = 1, args?: unknown, name = ADVANCE_REQUEST_TOOL) =>
  rpc(id, "tools/call", { name, ...(args === undefined ? {} : { arguments: args }) });

const counter = (result: any = ACK) => {
  const calls: unknown[] = [];
  const request: Request = async (args) => {
    calls.push(args);
    return result;
  };
  return { calls, request };
};

async function session(lines: readonly string[], request: Request): Promise<any[]> {
  const replies = await exchange([...HANDSHAKE, ...lines], request);
  expect(replies[0].id).toBe(0);
  expect(replies[0].result.serverInfo.name).toBe("immortalis-advance-request");
  return replies.slice(1);
}

describe("initialization and lifecycle", () => {
  it("negotiates a supported version, declares tools only, and tells the host a request is not the player's choice", async () => {
    const [r] = await exchange([rpc(1, "initialize", INIT_PARAMS)], counter().request);
    expect(r.result.capabilities).toEqual({ tools: {} });
    expect(r.result.protocolVersion).toBe("2025-06-18");
    expect(r.result.instructions).toMatch(/not the player's choice/);
    expect(r.result.instructions).toMatch(/cannot confirm for the player/);
  });

  it("nothing is listed or requested before initialize and the client's notice; an under-specified or repeated initialize starts nothing", async () => {
    const { calls, request } = counter();
    const replies = await exchange(
      [
        CALL(1),
        rpc(2, "tools/list"),
        rpc(3, "initialize", {
          protocolVersion: "2025-06-18",
          clientInfo: { name: "c", version: "0" },
        }),
        INITIALIZED,
        CALL(4),
        rpc(5, "initialize", INIT_PARAMS),
        CALL(6), // initialize answered, notice not yet received
        INITIALIZED,
        rpc(7, "initialize", INIT_PARAMS),
        CALL(8), // now ready
      ],
      request,
    );
    expect(replies.map((r) => [r.id, r.error?.code ?? "ok"])).toEqual([
      [1, -32600],
      [2, -32600],
      [3, -32602],
      [4, -32600],
      [5, "ok"],
      [6, -32600],
      [7, -32600],
      [8, "ok"],
    ]);
    expect(calls).toHaveLength(1);
  });

  it("refuses malformed envelopes before anything is requested", async () => {
    const { calls, request } = counter();
    const replies = await exchange(
      [
        ...HANDSHAKE,
        "null",
        "[]",
        "{",
        msg({ jsonrpc: "1.0", id: 1, method: "tools/call" }),
        JSON.stringify({ id: 2, method: "tools/call" }),
        msg({ id: 1.5, method: "ping" }),
        msg({ id: 3, method: "tools/call", params: "x" }),
        " ".repeat(70_000),
      ],
      request,
    );
    expect(calls).toEqual([]);
    expect(replies.slice(1).every((r) => r.error !== undefined)).toBe(true);
  });
});

describe("the closed one-tool surface", () => {
  it("lists exactly one argument-free tool that is a request (not read-only) and is idempotent", async () => {
    const [list] = await session([rpc(1, "tools/list")], counter().request);
    expect(list.result.tools).toHaveLength(1);
    const tool = list.result.tools[0];
    expect(tool.name).toBe("request_active_pc_target_advance");
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(tool.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool.description).toMatch(/not the player's choice/);
    expect(tool.description).toMatch(/names no target/);
  });

  it("any other tool name — including the read tool — is a protocol error that requests nothing", async () => {
    const { calls, request } = counter();
    const replies = await session(
      [
        CALL(1, {}, "read_current_observation_glance"),
        CALL(2, {}, "observe_surroundings"),
        CALL(3, {}, "confirm_observation"),
        CALL(7, {}, "request_active_pc_observation"),
        CALL(8, {}, "advance_active_pc_to_target"),
        rpc(4, "tools/call", { arguments: {} }),
        rpc(5, "resources/list"),
        rpc(6, "prompts/list"),
      ],
      request,
    );
    expect(calls).toEqual([]);
    expect(replies.map((r) => r.error.code)).toEqual([
      -32602, -32602, -32602, -32602, -32602, -32602, -32601, -32601,
    ]);
    // the read tool, the observation-request tool and the gateway's own operation name are no tools of this server
    expect(replies.map((r) => r.error.message).slice(0, 5)).toEqual([
      "unknown tool",
      "unknown tool",
      "unknown tool",
      "unknown tool",
      "unknown tool",
    ]);
  });
});

describe("framing: what the host receives", () => {
  it("hands the host's arguments, untouched, to the trusted request, which alone judges them", async () => {
    const { calls, request } = counter();
    await session(
      [CALL(1), CALL(2, {}), CALL(3, { confirmed: true }), CALL(4, ["x"]), CALL(5, "yes")],
      request,
    );
    expect(calls).toEqual([undefined, {}, { confirmed: true }, ["x"], "yes"]);
  });

  it("frames the acknowledgement as an ordinary result that says no time advanced", async () => {
    const [r] = await session([CALL(1)], counter().request);
    expect(r.result.isError).toBeUndefined();
    const parsed = JSON.parse(r.result.content[0].text);
    expect(parsed).toEqual({
      ok: true,
      value: { status: "TARGET_ADVANCE_REQUESTED", message: ADVANCE_REQUESTED_MESSAGE },
    });
    expect(parsed.value.message).toMatch(/No time has advanced/);
    expect(parsed.value.message).toMatch(/names no target/);
  });

  it("frames a refusal — and a request that throws — as the one opaque refusal with the error flag", async () => {
    const refuse = counter(REFUSAL).request;
    const boom: Request = async () => {
      throw new Error("/secret/path /private/state leaked cause");
    };
    for (const request of [refuse, boom]) {
      const [r] = await session([CALL(1)], request);
      expect(r.result.isError).toBe(true);
      expect(r.result.content[0].text).toBe(JSON.stringify(REFUSAL));
      expect(r.result.content[0].text).not.toMatch(/secret|private|leaked/);
    }
  });
});
