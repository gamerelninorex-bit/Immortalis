import { runRefereeMcpCli } from "./referee-mcp.ts";

process.exitCode = await runRefereeMcpCli(process.argv.slice(2));
