import { PassThrough } from "node:stream";
import { runRefereeMcpCli, secretPath } from "@immortalis/operator";
import type { PhoneConfig } from "./config.ts";

export const REFEREE_TOOLS = [
  "referee_list_tasks",
  "referee_get_task",
  "referee_submit_decision",
] as const;

type McpRunner = typeof runRefereeMcpCli;
interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly isError?: boolean;
}

const failure = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Transport only: the existing MCP CLI reads the owner-only secret, authenticates, validates and writes.
 * Neither HTTP nor the browser can supply a path, campaign, nonce, permission, verdict or host proof.
 * The answer remains the actual AI host's interpretation, never a generated fallback.
 */
export async function callRefereeTool(
  config: PhoneConfig,
  body: Record<string, unknown>,
  run: McpRunner = runRefereeMcpCli,
): Promise<{ readonly status: number; readonly result: ToolResult }> {
  const host = body["host_id"];
  const tool = body["tool"];
  const args = body["arguments"];
  const bad = () => ({ status: 400, result: failure("invalid referee tool request") });
  if (
    Object.keys(body).some((k) => !["host_id", "tool", "arguments"].includes(k)) ||
    typeof host !== "string" ||
    !config.refereeHostIds.includes(host) ||
    typeof tool !== "string" ||
    !REFEREE_TOOLS.some((t) => t === tool) ||
    !record(args)
  )
    return bad();
  const allowed =
    tool === "referee_list_tasks"
      ? []
      : tool === "referee_get_task"
        ? ["task_id"]
        : ["task_id", "answer", "claimed_model"];
  if (Object.keys(args).some((k) => !allowed.includes(k))) return bad();
  if (
    tool !== "referee_list_tasks" &&
    (typeof args["task_id"] !== "string" || !/^[0-9a-f]{64}$/.test(args["task_id"]))
  )
    return bad();
  if (
    tool === "referee_submit_decision" &&
    (!record(args["answer"]) ||
      (args["claimed_model"] !== undefined &&
        (typeof args["claimed_model"] !== "string" ||
          args["claimed_model"].length < 1 ||
          args["claimed_model"].length > 160)))
  )
    return bad();

  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  let size = 0;
  output.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 2 * 1024 * 1024) chunks.push(chunk);
  });
  input.end(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } })}\n`,
  );
  try {
    const code = await run(
      [
        "--operator-dir",
        config.operatorDir,
        "--campaign-id",
        config.campaignId,
        "--host-id",
        host,
        "--secret-file",
        secretPath({ stateDir: config.operatorDir, campaignId: config.campaignId }, host),
      ],
      { input, output, error: () => undefined },
    );
    if (code !== 0 || size > 2 * 1024 * 1024)
      return { status: 503, result: failure("the bound referee is unavailable") };
    const reply: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!record(reply) || reply["id"] !== 1 || !record(reply["result"]))
      return {
        status: 503,
        result: failure("referee outcome unavailable; inspect before retrying"),
      };
    const result = reply["result"];
    if (
      !Array.isArray(result["content"]) ||
      !result["content"].every(
        (c: unknown) => record(c) && c["type"] === "text" && typeof c["text"] === "string",
      )
    )
      return {
        status: 503,
        result: failure("referee outcome unavailable; inspect before retrying"),
      };
    return { status: 200, result: result as unknown as ToolResult };
  } catch {
    return { status: 503, result: failure("referee outcome unavailable; inspect before retrying") };
  } finally {
    input.destroy();
    output.destroy();
  }
}
