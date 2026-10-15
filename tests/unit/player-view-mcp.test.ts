/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies and a stubbed gateway result */
// Unit evidence for the player-view MCP transport (BLUE v5.2 bounded brief 2026-10-15): the JSON-RPC envelope, the closed tool surface and the
// mapping of the host's arguments to the one strict gateway request, over a STUB read. The stub is a recorder, not a source: it asserts no
// presentation and no verdict as an upstream fact — it only shows what the transport hands on and how it frames what comes back.
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

const rpc = (id: unknown, method: string, params?: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
const seen: unknown[] = [];
const recording =
  (result: any): Read =>
  async (request) => {
    seen.push(request);
    return result;
  };

describe("the envelope", () => {
  it("negotiates a supported protocol version, declares tools only, and carries no campaign data", async () => {
    const [a, b, c] = await exchange(
      [
        rpc(1, "initialize", { protocolVersion: "2025-03-26" }),
        rpc(2, "initialize", { protocolVersion: "9999-01-01" }),
        rpc(3, "initialize"),
      ],
      recording(REFUSAL),
    );
    expect(a.result.protocolVersion).toBe("2025-03-26");
    expect(b.result.protocolVersion).toBe("2025-06-18");
    expect(c.result.protocolVersion).toBe("2025-06-18");
    expect(a.result.capabilities).toEqual({ tools: {} });
    expect(a.result.serverInfo.name).toBe("immortalis-player-view");
    expect(a.result.instructions).toMatch(/no arguments/);
  });

  it("lists exactly one tool, with a closed argument-free schema and a read-only hint", async () => {
    const [r] = await exchange([rpc(1, "tools/list")], recording(REFUSAL));
    expect(r.result.tools).toHaveLength(1);
    expect(r.result.tools[0].name).toBe(PLAYER_VIEW_TOOL);
    expect(r.result.tools[0].inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(r.result.tools[0].annotations.readOnlyHint).toBe(true);
  });

  it("answers ping, ignores notifications and names no method it does not serve", async () => {
    const replies = await exchange(
      [
        rpc(1, "ping"),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
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

  it("refuses unparsable, non-object, method-less, bad-id and oversized lines without dereferencing them", async () => {
    const replies = await exchange(
      [
        "{ nope",
        "null",
        "7",
        "[]",
        '"s"',
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
      -32700, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600,
    ]);
    // a request that is not valid is answered under its id only when it has a usable one
    expect(replies[5].id).toBe(5);
    expect(replies[6].id).toBeNull();
  });
});

describe("the one tool: the host's arguments become the one strict request, and the result is the gateway's own", () => {
  it("no argument, an empty object and an absent arguments field each hand the gateway exactly the one strict request", async () => {
    seen.length = 0;
    await exchange(
      [
        rpc(1, "tools/call", { name: PLAYER_VIEW_TOOL }),
        rpc(2, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: {} }),
        rpc(3, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: null }),
      ],
      recording(REFUSAL),
    );
    expect(seen).toHaveLength(3);
    expect(seen[0]).toEqual({ operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE });
    expect(seen[1]).toEqual(seen[0]);
    for (const request of seen.slice(0, 2))
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
    await exchange(
      claims.map((arguments_, i) =>
        rpc(i, "tools/call", { name: PLAYER_VIEW_TOOL, arguments: arguments_ }),
      ),
      recording(REFUSAL),
    );
    expect(seen).toHaveLength(claims.length);
    for (const request of seen)
      expect(ReadCurrentObservationGlanceRequestSchema.safeParse(request).success).toBe(false);
  });

  it("a presentation is returned as the gateway serialized it, with no error flag; a refusal carries the error flag and the same bytes", async () => {
    const [good] = await exchange(
      [rpc(1, "tools/call", { name: PLAYER_VIEW_TOOL })],
      recording(ok(PRESENTATION)),
    );
    expect(good.result.isError).toBeUndefined();
    expect(good.result.content).toEqual([{ type: "text", text: JSON.stringify(ok(PRESENTATION)) }]);
    const [bad] = await exchange(
      [rpc(1, "tools/call", { name: PLAYER_VIEW_TOOL })],
      recording(REFUSAL),
    );
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content).toEqual([{ type: "text", text: JSON.stringify(REFUSAL) }]);
  });

  it("a throwing or rejecting read is the same refusal; nothing of the failure is framed", async () => {
    const throwing: Read = () => {
      throw new Error("secret detail /home/x");
    };
    const rejecting: Read = () => Promise.reject(new Error("secret detail /home/x"));
    for (const read of [throwing, rejecting]) {
      const [r] = await exchange([rpc(1, "tools/call", { name: PLAYER_VIEW_TOOL })], read);
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
    const replies = await exchange(
      [1, 2, 3].map((i) => rpc(i, "tools/call", { name: PLAYER_VIEW_TOOL })),
      slow,
    );
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(overlap).toBe(false);
  });
});
