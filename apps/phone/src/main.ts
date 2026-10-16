import { loadConfig } from "./config.ts";
import { createPhoneServer } from "./server.ts";

/** The phone bridge's entry point. It reads its configuration once, refuses to start on any problem and never prints a secret. */
const config = loadConfig(process.env);
if (!config.ok) {
  process.stderr.write(
    `immortalis-phone: refusing to start\n${config.problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(2);
}
const app = createPhoneServer(config.value);
const port = await app.listen();
process.stdout.write(
  `immortalis-phone: listening on ${config.value.bindHost}:${port} (${config.value.transport}); campaign ${config.value.campaignId}\n`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
