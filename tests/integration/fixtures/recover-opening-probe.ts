// Fresh-process mechanism recovery only. No human decisions, callback capabilities or lane credentials are printed or synthesized.
import { readFileSync } from "node:fs";
import { createPhoneServer } from "../../../apps/phone/src/server.ts";
import { Chat } from "../../support/chat-client.ts";
const input = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const app = createPhoneServer(input.config, { pollMs: 20 });
await app.listen();
const chat = new Chat(`http://127.0.0.1:${input.config.port}`);
chat.access = input.client.access;
chat.refresh = input.client.refresh;
chat.clientId = input.client.clientId;
const caps = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
};
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await chat.call(name, args, () => {
    throw new Error("recovery cannot require another approval");
  });
  if (r.result?._meta?.review) throw new Error("unchanged acceptance was not recovered");
  return r;
};
async function finish(name: string, args: Record<string, unknown> = {}) {
  let r = await call(name, args);
  for (let n = 0; n < 80 && !r.isError && r.data?.state !== "FINISHED"; n++)
    r = await call("await_action", { after: 0, wait_seconds: 1 });
  return r;
}
try {
  await chat.init(caps);
  await finish("reconcile_last_action");
  if (input.mode === "SETTING") {
    const status = await call("original_setting_status");
    if (status.data?.setting?.state !== "ESTABLISHED" && status.data?.state !== "ESTABLISHED")
      await finish("resume_original_setting");
    const final = await call("original_setting_status");
    if (final.data?.setting?.state !== "ESTABLISHED" && final.data?.state !== "ESTABLISHED")
      throw new Error("original setting did not recover");
  } else if (input.mode === "OPENING") {
    let prepared = false;
    for (let n = 0; n < 80; n++) {
      const r = await call("await_action", { after: 0, wait_seconds: 1 });
      const opening = r.result?.structuredContent?.opening;
      if (opening?.state === "PREPARED") {
        prepared = true;
        break;
      }
      if (opening && opening.state !== "REALIZING") {
        await finish("reconcile_last_action");
        await finish("resume_original_character");
      }
    }
    if (!prepared) throw new Error("original opening did not recover");
  }
  process.stdout.write(
    JSON.stringify({ mode: input.mode, freshProcess: true, reviews: 0, state: "RECOVERED" }),
  );
} finally {
  await app.close();
}
