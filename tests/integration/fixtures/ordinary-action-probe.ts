// Mechanism-only whole-operation counters. No real player or AI/client claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Chat, PLAYER, humanConfirms } from "../../support/chat-client.ts";
import { routeMeter } from "../../support/route-meter.ts";
const config = JSON.parse(readFileSync(process.argv[3]!, "utf8"));
const { createPhoneServer } = await import(
  pathToFileURL(`${process.argv[2]}/apps/phone/src/server.ts`).href
);
const app = createPhoneServer(config, { pollMs: 10, chat: { settleMs: 20 } });
await app.listen();
const chat = new Chat(`http://127.0.0.1:${config.port}`);
try {
  if (!(await chat.link("player", { player: PLAYER })).ok) throw new Error("link failed");
  await chat.init({ elicitation: {} });
  const meter = routeMeter();
  let calls = 0,
    challenges = 0;
  try {
    for (const [name, args] of [
      ["collect", { amount: 2 }],
      ["continue_collection", {}],
      ["finish_collection", {}],
    ] as const) {
      let out = await chat.call(name, args);
      calls++;
      if (out.isError) throw new Error(out.text);
      for (let i = 0; i < 30 && out.data?.state !== "FINISHED"; i++) {
        out = await chat.call("await_action", { wait_seconds: 5 }, (e) => {
          challenges++;
          return humanConfirms(e);
        });
        calls++;
      }
      if (out.data?.exit_code !== 0) throw new Error(JSON.stringify(out.data));
    }
  } finally {
    meter.stop();
  }
  process.stdout.write(JSON.stringify({ calls, challenges, work: meter.snapshot() }));
} finally {
  await app.close();
}
