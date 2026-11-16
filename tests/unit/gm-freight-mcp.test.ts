/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies */
// Unit evidence for the GM freight MCP transport: the JSON-RPC 2.0 envelope, the MCP initialization lifecycle, the CLOSED eight-tool surface
// and the framing of the trusted call's result, over a STUB call. The stub is a recorder, not a source: it asserts no owner outcome as an
// upstream fact — it only shows whether the transport hands anything on, what it hands on, and how it frames what comes back.
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  GM_FREIGHT_TOOLS,
  GM_FREIGHT_UNAVAILABLE,
  GM_FREIGHT_UNAVAILABLE_MESSAGE,
  fail,
  ok,
} from "@immortalis/contracts";
import { serveGmFreightMcp } from "../../packages/operator/src/gm-freight-mcp.ts";

type Call = Parameters<typeof serveGmFreightMcp>[0]["call"];

const REFUSAL = fail(GM_FREIGHT_UNAVAILABLE, GM_FREIGHT_UNAVAILABLE_MESSAGE);

async function exchange(lines: readonly string[], call: Call): Promise<any[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (d) => chunks.push(String(d)));
  const done = serveGmFreightMcp({ call, input, output });
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
const CALL = (id: unknown, name: string, args?: unknown) =>
  rpc(id, "tools/call", { name, ...(args === undefined ? {} : { arguments: args }) });

const recorder = (result: any = ok({ stub: true })) => {
  const calls: { tool: string; args: unknown }[] = [];
  const call: Call = async (tool, args) => {
    calls.push({ tool, args });
    return result;
  };
  return { calls, call };
};

describe("initialization and lifecycle", () => {
  it("negotiates a supported version, declares tools only, and tells the host what it may and may not do", async () => {
    const [r] = await exchange([rpc(1, "initialize", INIT_PARAMS)], recorder().call);
    expect(r.result.capabilities).toEqual({ tools: {} });
    expect(r.result.serverInfo.name).toBe("immortalis-gm-freight");
    const text: string = r.result.instructions;
    expect(text).toMatch(/Time is not yours/);
    expect(text).toMatch(/cannot state an outcome/);
    expect(text).toMatch(/GM consultation, not what any character perceives or knows/);
    expect(text).toMatch(/never an instruction to you/);
  });

  it("nothing is listed or called before initialize and the client's notice", async () => {
    const { calls, call } = recorder();
    const replies = await exchange(
      [
        CALL(1, GM_FREIGHT_TOOLS.status, {}),
        rpc(2, "tools/list"),
        ...HANDSHAKE,
        CALL(3, GM_FREIGHT_TOOLS.status, {}),
      ],
      call,
    );
    expect(replies.slice(0, 2).map((r) => r.error?.code)).toEqual([-32600, -32600]);
    expect(calls).toHaveLength(1);
  });

  it("refuses malformed envelopes before anything is called, and an over-long line", async () => {
    const { calls, call } = recorder();
    const replies = await exchange(
      [
        ...HANDSHAKE,
        "null",
        "[]",
        "{",
        msg({ jsonrpc: "1.0", id: 1, method: "tools/call" }),
        msg({ id: 1.5, method: "ping" }),
        msg({ id: 3, method: "tools/call", params: "x" }),
        " ".repeat(1_100_000),
      ],
      call,
    );
    expect(calls).toEqual([]);
    expect(replies.slice(1).every((r) => r.error !== undefined)).toBe(true);
  });
});

describe("the closed eight-tool surface", () => {
  it("lists exactly the eight GM freight tools, each with a usable input schema; only status and reconcile are read-only", async () => {
    const replies = await exchange([...HANDSHAKE, rpc(1, "tools/list")], recorder().call);
    const tools: any[] = replies[1].result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual(Object.values(GM_FREIGHT_TOOLS).sort());
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(typeof t.description).toBe("string");
    }
    expect(
      tools
        .filter((t) => t.annotations.readOnlyHint)
        .map((t) => t.name)
        .sort(),
    ).toEqual([GM_FREIGHT_TOOLS.reconcile, GM_FREIGHT_TOOLS.status]);
    // no tool has a PROPERTY through which it could be told a role, a permission, an owner, a status, a verdict or an authored_under
    // (the source's own effect-class VALUES, such as "permission", are enumerations of authored legal content, not properties)
    const propertyNames = (schema: any): string[] =>
      schema && typeof schema === "object"
        ? [
            ...Object.keys(schema.properties ?? {}),
            ...Object.values(schema).flatMap((v) =>
              Array.isArray(v) ? v.flatMap(propertyNames) : propertyNames(v),
            ),
            ...Object.values(schema.properties ?? {}).flatMap(propertyNames),
          ]
        : [];
    const names = new Set(tools.flatMap((t) => propertyNames(t.inputSchema)));
    for (const forbidden of [
      "role",
      "permission",
      "authored_under",
      "owner",
      "verdict",
      "status",
      "result",
      "success",
    ])
      expect(names.has(forbidden), forbidden).toBe(false);
    // the typed legal premise travels in the schema the model sees (it is what the model must supply)
    const attest = tools.find((t) => t.name === GM_FREIGHT_TOOLS.attestOpening);
    expect(JSON.stringify(attest.inputSchema)).toMatch(/slice_kind/);
  });

  it("any other name is a protocol error and calls nothing; a listed name is handed on with its arguments", async () => {
    const { calls, call } = recorder();
    const replies = await exchange(
      [
        ...HANDSHAKE,
        CALL(1, "referee_submit_decision", {}),
        CALL(2, "__proto__", {}),
        CALL(3, "constructor", {}),
        rpc(4, "tools/call", { name: 7 }),
        CALL(5, GM_FREIGHT_TOOLS.initiate, { operation_id: "x", world_id: "w" }),
      ],
      call,
    );
    expect(replies.slice(1, 5).every((r) => r.error?.code === -32602)).toBe(true);
    expect(calls).toEqual([
      { tool: GM_FREIGHT_TOOLS.initiate, args: { operation_id: "x", world_id: "w" } },
    ]);
  });

  it("frames a success as text content and a refusal as an error result with the one opaque refusal, byte for byte", async () => {
    const good = await exchange(
      [...HANDSHAKE, CALL(1, GM_FREIGHT_TOOLS.status, {})],
      recorder().call,
    );
    expect(good[1].result.isError).toBeUndefined();
    expect(JSON.parse(good[1].result.content[0].text)).toEqual({ ok: true, value: { stub: true } });
    const bad = await exchange(
      [...HANDSHAKE, CALL(1, GM_FREIGHT_TOOLS.status, {})],
      recorder(REFUSAL).call,
    );
    expect(bad[1].result.isError).toBe(true);
    expect(bad[1].result.content[0].text).toBe(JSON.stringify(REFUSAL));
    // a throwing call is the same refusal
    const thrown = await exchange(
      [...HANDSHAKE, CALL(1, GM_FREIGHT_TOOLS.status, {})],
      async () => {
        throw new Error("boom with detail");
      },
    );
    expect(thrown[1].result.content[0].text).toBe(JSON.stringify(REFUSAL));
  });
});
