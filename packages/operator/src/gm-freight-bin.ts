import { runGmFreightMcpCli } from "./gm-freight-mcp.ts";

process.exitCode = await runGmFreightMcpCli(process.argv.slice(2));
