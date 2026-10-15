import { runObserveRequestBindCli } from "./observe-request-cli.ts";

process.exitCode = await runObserveRequestBindCli(process.argv.slice(2));
