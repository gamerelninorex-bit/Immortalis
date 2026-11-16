import { runGmFreightBindCli } from "./gm-freight-cli.ts";

process.exitCode = await runGmFreightBindCli(process.argv.slice(2));
