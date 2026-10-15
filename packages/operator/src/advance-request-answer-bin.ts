import { runAdvanceRequestAnswerCli } from "./advance-request-cli.ts";

process.exitCode = await runAdvanceRequestAnswerCli(process.argv.slice(2));
