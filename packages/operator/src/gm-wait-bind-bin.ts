import { runGmWaitBindCli, runGmWaitClientCli } from "./gm-wait-cli.ts";

const [first, ...rest] = process.argv.slice(2);
process.exitCode =
  first === "client"
    ? await runGmWaitClientCli(rest)
    : await runGmWaitBindCli(process.argv.slice(2));
