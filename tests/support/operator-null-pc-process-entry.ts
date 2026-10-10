// The real command line, as a process, for a SAVED NULL-PC test campaign whose Logistics chain was written with the testkit's
// Logistics owner registration. It grants no role, permission or authority; everything else is the shipped runCli over the real
// standard streams.
import { runCli } from "@immortalis/operator";
import { LOGISTICS_FIXTURE_EXTENSION } from "@immortalis/testkit";

process.exitCode = await runCli(process.argv.slice(2), { extension: LOGISTICS_FIXTURE_EXTENSION });
