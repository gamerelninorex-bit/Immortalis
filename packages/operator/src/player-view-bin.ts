import { runPlayerViewMcpCli } from "./player-view-mcp.ts";

process.exitCode = await runPlayerViewMcpCli(process.argv.slice(2));
