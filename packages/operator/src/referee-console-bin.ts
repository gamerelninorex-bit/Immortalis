import { runRefereeConsole } from "./referee-console.ts";

process.exitCode = await runRefereeConsole(process.argv.slice(2));
