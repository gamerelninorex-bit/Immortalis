import { runGmWaitBindCli } from "./gm-wait-cli.ts";

process.exitCode = await runGmWaitBindCli(process.argv.slice(2));
