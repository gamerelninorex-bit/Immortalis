import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { runRefereeMcpCli } from "./referee-mcp.ts";
import { stdioTerminal, type OperatorTerminal } from "./terminal.ts";

/**
 * A human referee's console over the SAME authenticated MCP server. It never reads a secret, campaign package or owner fact itself,
 * and it has no default answer, fixture policy or player-confirmation path. The trusted server authenticates before disclosing a task
 * and validates every answer. The owner-only task/decision exchange retains the exact question, nonce, reading and host proof.
 */
export async function runRefereeConsole(
  argv: readonly string[],
  terminal?: OperatorTerminal,
): Promise<number> {
  const t = terminal ?? stdioTerminal();
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = createInterface({ input: output, crlfDelay: Infinity });
  const lines = replies[Symbol.asyncIterator]();
  let id = 0;
  let serverFailure: number | undefined;
  const server = runRefereeMcpCli(argv, { input, output, error: (line) => t.say(line) });
  void server.then((code) => {
    serverFailure = code;
    output.end();
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const requestId = ++id;
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } })}\n`,
    );
    const next = await lines.next();
    if (next.done) return null;
    const msg = JSON.parse(next.value) as {
      id?: unknown;
      result?: { isError?: boolean; content?: { type: string; text?: string }[] };
    };
    if (msg.id !== requestId || !msg.result) return null;
    const text = msg.result.content?.find((c) => c.type === "text")?.text;
    if (typeof text !== "string") return null;
    return { text, isError: msg.result.isError === true };
  };
  try {
    t.say(
      "REFEREE CONSOLE — private GM context. This is not the player's view. No answer is supplied for you.",
    );
    for (;;) {
      const listed = await rpc("referee_list_tasks", {});
      if (!listed || listed.isError) {
        t.say("The bound referee is unavailable.");
        return serverFailure ?? 3;
      }
      t.say(listed.text);
      const selected = await t.ask("Type a task_id to read, list to refresh, or quit:");
      if (selected === null || selected.trim() === "quit") return 0;
      if (selected.trim() === "list") continue;
      if (!/^[0-9a-f]{64}$/.test(selected.trim())) {
        t.say("No task selected.");
        continue;
      }
      const taskId = selected.trim();
      const got = await rpc("referee_get_task", { task_id: taskId });
      if (!got || got.isError) {
        t.say("That question is unavailable to this referee.");
        continue;
      }
      t.say(got.text);
      const typed = await t.ask("Enter your own answer as one JSON object, or skip:");
      if (typed === null) return 0;
      if (typed.trim() === "skip") continue;
      let answer: unknown;
      try {
        answer = JSON.parse(typed);
      } catch {
        t.say("The answer is not valid JSON.");
        continue;
      }
      if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
        t.say("The answer must be an object.");
        continue;
      }
      const submitted = await rpc("referee_submit_decision", {
        task_id: taskId,
        answer,
        claimed_model: "human-referee (operator declaration)",
      });
      t.say(
        submitted?.text ??
          "The answer's outcome is unavailable; inspect the retained exchange before retrying.",
      );
    }
  } finally {
    input.end();
    await server;
    replies.close();
    if (!terminal) t.close();
  }
}
