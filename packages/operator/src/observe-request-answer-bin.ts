import { runObserveRequestAnswerCli } from "./observe-request-cli.ts";

process.exitCode = await runObserveRequestAnswerCli(process.argv.slice(2));
