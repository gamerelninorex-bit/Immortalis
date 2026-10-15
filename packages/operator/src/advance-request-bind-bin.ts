import { runAdvanceRequestBindCli } from "./advance-request-cli.ts";

process.exitCode = await runAdvanceRequestBindCli(process.argv.slice(2));
