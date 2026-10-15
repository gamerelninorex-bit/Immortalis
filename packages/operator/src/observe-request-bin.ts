import { runObserveRequestMcpCli } from "./observe-request-mcp.ts";

process.exitCode = await runObserveRequestMcpCli(process.argv.slice(2));
