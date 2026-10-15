import { runPlayerViewBindCli } from "./player-view-mcp.ts";

process.exitCode = await runPlayerViewBindCli(process.argv.slice(2));
