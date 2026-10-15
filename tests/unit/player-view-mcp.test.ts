/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies and a stubbed gateway result */
// Unit evidence for the player-view MCP transport (BLUE v5.2 bounded brief 2026-10-15): the JSON-RPC 2.0 envelope, the MCP initialization
// lifecycle, the closed tool surface and the mapping of the host's arguments to the one strict gateway request, over a STUB read. The stub is a
// recorder, not a source: it asserts no presentation and no verdict as an upstream fact — it only shows whether the transport hands anything on,
// what it hands on, and how it frames what comes back.
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE,
  ReadCurrentObservationGlanceRequestSchema,
  fail,
  ok,
} from "@immortalis/contracts";
import {
  PLAYER_VIEW_TOOL,
  servePlayerViewMcp,
} from "../../packages/operator/src/player-view-mcp.ts";

type Read = Parameters<typeof servePlayerViewMcp>[0]["read"];

const REFUSAL = fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);
const PRESENTATION = {
  viewpoint: { role: "role.player_character", entity_id: "pc-1" },
  elements: [{ element: "CONTACT", channel: "PERCEPTION" }],
};

/** Feeds the lines to a fresh server and returns every reply it wrote, in order. */
async function exchange(lines: readonly string[], read: Read): Promise<any[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (d) => chunks.push(String(d)));
  const done = servePlayerViewMcp({ read, input, output });
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
/** The normal opening of an MCP session: the initialize request (id 0), then the client's initialization notice. */
const HANDSHAKE = [rpc(0, "initialize", INIT_PARAMS), INITIALIZED];

/** An initialized session: the replies after the handshake's own. */
async function session(lines: readonly string[], read: Read): Promise<any[]> {
  const replies = await exchange([...HANDSHAKE, ...lines], read);
  expect(replies[0].id).toBe(0);
  expect(replies[0].result.serverInfo.name).toBe("immortalis-player-view");
  return replies.slice(1);
}

const seen: unknown[] = [];
const recording =
  (result: any): Read =>
  async (request) => {
    seen.push(request);
    return result;
  };
/** A read that must never be reached: any call is a failure of the transport's admission. */
const counter = () => {
  const calls: unknown[] = [];
  const read: Read = async (request) => {
    calls.push(request);
    return ok(PRESENTATION) as any;
  };
  return { calls, read };
};
const CALL = (id: unknown = 1, args?: unknown) =>
  rpc(id, "tools/call", {
    name: PLAYER_VIEW_TOOL,
    ...(args === undefined ? {} : { arguments: args }),
  });

describe("initialization: a well-formed initialize is answered; an under-specified one is refused and does not start the session", () => {
  it("negotiates a supported protocol version, declares tools only, and carries no campaign data", async () => {
    const [a, b, c] = await Promise.all(
      ["2025-03-26", "9999-01-01", "2024-11-05"].map(async (protocolVersion) => {
        const [r] = await exchange(
          [rpc(1, "initialize", { ...INIT_PARAMS, protocolVersion })],
          recording(REFUSAL),
        );
        return r;
      }),
    );
    expect(a.result.protocolVersion).toBe("2025-03-26");
    expect(b.result.protocolVersion).toBe("2025-06-18");
    expect(c.result.protocolVersion).toBe("2024-11-05");
    expect(a.jsonrpc).toBe("2.0");
    expect(a.result.capabilities).toEqual({ tools: {} });
    expect(a.result.serverInfo.name).toBe("immortalis-player-view");
    expect(a.result.instructions).toMatch(/no arguments/);
  });

  it("accepts the legitimate metadata a real client sends: extra capabilities, a titled client, _meta", async () => {
    const [r] = await exchange(
      [
        rpc(1, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: { roots: { listChanged: true }, sampling: {}, experimental: { x: 1 } },
          clientInfo: { name: "c", title: "A Client", version: "1.2.3" },
          _meta: { progressToken: 7 },
        }),
      ],
      recording(REFUSAL),
    );
    expect(r.result.serverInfo.name).toBe("immortalis-player-view");
  });

  it("refuses an under-specified or ill-typed initialize with invalid params, and the session does not start", async () => {
    const bad: unknown[] = [
      undefined,
      {},
      [],
      "x",
      { capabilities: {}, clientInfo: { name: "c", version: "0" } },
      { protocolVersion: "2025-06-18", clientInfo: { name: "c", version: "0" } },
      { protocolVersion: "2025-06-18", capabilities: {} },
      { protocolVersion: "", capabilities: {}, clientInfo: { name: "c", version: "0" } },
      { protocolVersion: 20250618, capabilities: {}, clientInfo: { name: "c", version: "0" } },
      { protocolVersion: "2025-06-18", capabilities: [], clientInfo: { name: "c", version: "0" } },
      {
        protocolVersion: "2025-06-18",
        capabilities: null,
        clientInfo: { name: "c", version: "0" },
      },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: "c" },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "c" } },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { version: "0" } },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "", version: "0" } },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: 1, version: "0" } },
    ];
    for (const params of bad) {
      const { calls, read } = counter();
      const replies = await exchange([rpc(1, "initialize", params), INITIALIZED, CALL(2)], read);
      expect(replies[0].error.code, JSON.stringify(params)).toBe(-32602);
      expect(replies[0].error.message).toBe("invalid params");
      // the notice that follows a refused initialize starts nothing: the call is refused and nothing was read
      expect(replies[1].error.code, JSON.stringify(params)).toBe(-32600);
      expect(calls, JSON.stringify(params)).toEqual([]);
    }
  });

  it("answers an initialize only once: a second one is refused whatever stage the session is at", async () => {
    const { calls, read } = counter();
    const replies = await exchange(
      [
        rpc(1, "initialize", INIT_PARAMS),
        rpc(2, "initialize", INIT_PARAMS), // before the client's notice
        INITIALIZED,
        rpc(3, "initialize", INIT_PARAMS), // after it
        CALL(4),
      ],
      read,
    );
    expect(replies.map((r) => r.error?.code ?? "ok")).toEqual(["ok", -32600, -32600, "ok"]);
    expect(calls).toHaveLength(1);
  });
});

describe("lifecycle: nothing is listed or read before the session is initialized", () => {
  it("a tool call or listing before initialize, or between initialize and the client's notice, is refused and reads nothing", async () => {
    const { calls, read } = counter();
    const replies = await exchange(
      [
        CALL(1), // before anything
        rpc(2, "tools/list"),
        rpc(3, "initialize", INIT_PARAMS),
        CALL(4), // initialize answered, notice not yet received
        rpc(5, "tools/list"),
        msg({ method: "notifications/cancelled", params: { requestId: 4 } }), // another notification starts nothing
        CALL(6),
        INITIALIZED,
        CALL(7), // now the session is ready
        rpc(8, "tools/list"),
      ],
      read,
    );
    expect(replies.map((r) => [r.id, r.error?.code ?? "ok"])).toEqual([
      [1, -32600],
      [2, -32600],
      [3, "ok"],
      [4, -32600],
      [5, -32600],
      [6, -32600],
      [7, "ok"],
      [8, "ok"],
    ]);
    expect(replies[0].error.message).toBe("server not initialized");
    expect(calls).toHaveLength(1);
    // nothing of the tool surface leaked into a refusal
    for (const r of [replies[0], replies[1], replies[3], replies[4], replies[5]])
      expect(JSON.stringify(r)).not.toContain(PLAYER_VIEW_TOOL);
  });

  it("the client's notice before an initialize, or sent twice, starts nothing", async () => {
    const { calls, read } = counter();
    const replies = await exchange(
      [INITIALIZED, CALL(1), rpc(2, "initialize", INIT_PARAMS), INITIALIZED, INITIALIZED, CALL(3)],
      read,
    );
    expect(replies.map((r) => [r.id, r.error?.code ?? "ok"])).toEqual([
      [1, -32600],
      [2, "ok"],
      [3, "ok"],
    ]);
    expect(calls).toHaveLength(1);
  });

  it("ping is answered at any stage; it reads and discloses nothing", async () => {
    const { calls, read } = counter();
    const replies = await exchange(
      [
        rpc(1, "ping"),
        rpc(2, "initialize", INIT_PARAMS),
        rpc(3, "ping"),
        INITIALIZED,
        rpc(4, "ping"),
      ],
      read,
    );
    expect(replies.filter((r) => r.id !== 2).map((r) => r.result)).toEqual([{}, {}, {}]);
    expect(calls).toEqual([]);
  });

  it("an initialized session lists exactly one tool, with a closed argument-free schema and a read-only hint", async () => {
    const [r] = await session([rpc(1, "tools/list")], recording(REFUSAL));
    expect(r.result.tools).toHaveLength(1);
    expect(r.result.tools[0].name).toBe(PLAYER_VIEW_TOOL);
    expect(r.result.tools[0].inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(r.result.tools[0].annotations.readOnlyHint).toBe(true);
  });
});

describe("the JSON-RPC 2.0 envelope: anything else is not a request and reads nothing", () => {
  it("a message without jsonrpc 2.0 is invalid whatever else it carries, before and after initialization", async () => {
    const call = { name: PLAYER_VIEW_TOOL, arguments: {} };
    const variants: Record<string, unknown>[] = [
      { id: 1, method: "tools/call", params: call },
      { jsonrpc: "1.0", id: 1, method: "tools/call", params: call },
      { jsonrpc: "2", id: 1, method: "tools/call", params: call },
      { jsonrpc: 2, id: 1, method: "tools/call", params: call },
      { jsonrpc: "2.0 ", id: 1, method: "tools/call", params: call },
      { jsonrpc: null, id: 1, method: "tools/call", params: call },
      { jsonrpc: ["2.0"], id: 1, method: "tools/call", params: call },
    ];
    for (const phase of ["unstarted", "ready"] as const) {
      const { calls, read } = counter();
      const lines = variants.map((v) => JSON.stringify(v));
      const replies = await exchange(phase === "ready" ? [...HANDSHAKE, ...lines] : lines, read);
      const answers = phase === "ready" ? replies.slice(1) : replies;
      expect(answers).toHaveLength(variants.length);
      for (const r of answers) {
        expect(r.error.code, phase).toBe(-32600);
        expect(r.error.message).toBe("invalid request");
        expect(r.result).toBeUndefined();
      }
      expect(calls, phase).toEqual([]);
    }
  });

  it("a request identity must be a string or an integer: a fraction, boolean, object, array, null or unsafe number is refused and read-free", async () => {
    const { calls, read } = counter();
    const ids: unknown[] = [
      1.5,
      0.1,
      true,
      false,
      {},
      [],
      null,
      2 ** 53,
      -(2 ** 53),
      "",
      undefined,
    ];
    const lines = ids
      .filter((id) => id !== "" && id !== undefined)
      .map((id) =>
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: PLAYER_VIEW_TOOL },
        }),
      );
    const replies = await session(lines, read);
    expect(replies).toHaveLength(lines.length);
    for (const r of replies) {
      expect(r.id).toBeNull();
      expect(r.error.code).toBe(-32600);
    }
    expect(calls).toEqual([]);
    // string and integer identities (zero and negative included) are served
    const good = await session(
      ["a", "", 0, -3, 12].map((id) => CALL(id)),
      read,
    );
    expect(good.map((r) => r.id)).toEqual(["a", "", 0, -3, 12]);
    expect(good.every((r) => r.result)).toBe(true);
    expect(calls).toHaveLength(5);
  });

  it("a request without a string method, or with ill-typed params, is refused and read-free", async () => {
    const { calls, read } = counter();
    const replies = await session(
      [
        msg({ id: 1 }),
        msg({ id: 2, method: 5 }),
        msg({ id: 3, method: null }),
        msg({ id: 4, method: "tools/call", params: "x" }),
        msg({ id: 5, method: "tools/call", params: [] }),
        msg({ id: 6, method: "tools/call", params: null }),
        msg({ id: 7, method: "tools/call" }),
        msg({ id: 8, method: "tools/call", params: { name: 7 } }),
        msg({ id: 9, method: "tools/call", params: { arguments: {} } }),
      ],
      read,
    );
    expect(replies.map((r) => [r.id, r.error.code])).toEqual([
      [1, -32600],
      [2, -32600],
      [3, -32600],
      [4, -32602],
      [5, -32602],
      [6, -32602],
      [7, -32602],
      [8, -32602],
      [9, -32602],
    ]);
    expect(calls).toEqual([]);
  });

  it("answers ping, ignores well-formed notifications and names no method it does not serve", async () => {
    const replies = await session(
      [
        rpc(1, "ping"),
        msg({ method: "notifications/whatever", params: { x: 1 } }),
        rpc(2, "resources/list"),
        rpc("s", "prompts/list"),
        rpc(3, "tools/call", { name: "x" }),
      ],
      recording(REFUSAL),
    );
    expect(replies.map((r) => r.id)).toEqual([1, 2, "s", 3]);
    expect(replies[0].result).toEqual({});
    expect(replies[1].error.code).toBe(-32601);
    expect(replies[1].error.message).toBe("method not found");
    expect(replies[3].error).toEqual({ code: -32602, message: "unknown tool" });
  });

  it("refuses unparsable, non-object, oversized and batch lines without dereferencing them; blank lines are ignored", async () => {
    const replies = await exchange(
      [
        "{ nope",
        "null",
        "7",
        "[]",
        '"s"',
        JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
        JSON.stringify({ jsonrpc: "2.0", id: 5 }),
        JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }),
        JSON.stringify({ jsonrpc: "2.0", id: NaN, method: "ping" }),
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: 5 }),
        "x".repeat(70_000),
        "",
        "   ",
      ],
      recording(REFUSAL),
    );
    expect(replies.map((r) => r.error.code)).toEqual([
      -32700, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600,
    ]);
    // a request that is not valid is answered under its id only when it has a usable one
    expect(replies[6].id).toBe(5);
    expect(replies[7].id).toBeNull();
    expect(replies[9].id).toBe(1);
  });
});

describe("the one tool: the host's arguments become the one strict request, and the result is the gateway's own", () => {
  it("no argument, an empty object and an absent arguments field each hand the gateway exactly the one strict request", async () => {
    seen.length = 0;
    await session(
      [
        rpc(1, "tools/call", { name: PLAYER_VIEW_TOOL }),
        rpc(2, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: {} }),
        rpc(3, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: null }),
        rpc(4, "tools/call", {
          name: PLAYER_VIEW_TOOL,
          arguments: {},
          _meta: { progressToken: 1 },
        }),
      ],
      recording(REFUSAL),
    );
    expect(seen).toHaveLength(4);
    expect(seen[0]).toEqual({ operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE });
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[3]).toEqual(seen[0]);
    for (const request of [seen[0], seen[1], seen[3]])
      expect(ReadCurrentObservationGlanceRequestSchema.safeParse(request).success).toBe(true);
    // `null` is an argument that is not "none": it is an over-claim like any other
    expect(ReadCurrentObservationGlanceRequestSchema.safeParse(seen[2]).success).toBe(false);
  });

  it("every argument is an over-claim: the request handed on is NOT the strict request, so the unchanged gateway refuses it", async () => {
    seen.length = 0;
    const claims = [
      { event_id: "e" },
      { operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE },
      { operation: "other" },
      [],
      "s",
      7,
      true,
      [{ operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE }],
    ];
    await session(
      claims.map((arguments_, i) =>
        rpc(i + 1, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: arguments_ }),
      ),
      recording(REFUSAL),
    );
    expect(seen).toHaveLength(claims.length);
    for (const request of seen)
      expect(ReadCurrentObservationGlanceRequestSchema.safeParse(request).success).toBe(false);
  });

  it("a presentation is returned as the gateway serialized it, with no error flag; a refusal carries the error flag and the same bytes", async () => {
    const [good] = await session([CALL(1)], recording(ok(PRESENTATION)));
    expect(good.result.isError).toBeUndefined();
    expect(good.result.content).toEqual([{ type: "text", text: JSON.stringify(ok(PRESENTATION)) }]);
    const [bad] = await session([CALL(1)], recording(REFUSAL));
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content).toEqual([{ type: "text", text: JSON.stringify(REFUSAL) }]);
  });

  it("a throwing or rejecting read is the same refusal; nothing of the failure is framed", async () => {
    const throwing: Read = () => {
      throw new Error("secret detail /home/x");
    };
    const rejecting: Read = () => Promise.reject(new Error("secret detail /home/x"));
    for (const read of [throwing, rejecting]) {
      const [r] = await session([CALL(1)], read);
      expect(r.result.isError).toBe(true);
      expect(r.result.content[0].text).toBe(JSON.stringify(REFUSAL));
    }
  });

  it("calls are served one at a time, in order, so the transport never contends with itself for the package", async () => {
    let active = 0;
    let overlap = false;
    const slow: Read = async () => {
      active += 1;
      overlap ||= active > 1;
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return REFUSAL;
    };
    const replies = await session(
      [1, 2, 3].map((i) => CALL(i)),
      slow,
    );
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(overlap).toBe(false);
  });
});
