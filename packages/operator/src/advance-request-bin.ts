import { runAdvanceRequestMcpCli } from "./advance-request-mcp.ts";

process.exitCode = await runAdvanceRequestMcpCli(process.argv.slice(2));
