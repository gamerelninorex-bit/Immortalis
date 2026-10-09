// The real command line, as a process, for the acceptance tests. The only addition to the shipped `bin` is the owner
// registration the SAVED test campaign was written with (the testkit's stand-in for the not-yet-implemented history source behind
// the actor); it grants no role, permission or authority. Everything else is the shipped runCli over the real standard streams.
import { runCli } from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";

process.exitCode = await runCli(process.argv.slice(2), { extension: ACTOR_FIXTURE_EXTENSION });
