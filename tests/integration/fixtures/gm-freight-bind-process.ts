// A child process that enrolls ONE host through the exchange (no campaign is opened), for the cross-process enrollment tests of the GM freight
// binding. Arguments: <stateDir> <campaignId> <hostId>. Prints the exchange's result as one JSON line.
import { bindGmFreightHost } from "../../../packages/operator/src/gm-freight-exchange.ts";

const [stateDir, campaignId, hostId] = process.argv.slice(2);
const result = await bindGmFreightHost({
  stateDir: stateDir!,
  campaignId: campaignId!,
  hostId: hostId!,
  operatorUid: process.getuid?.() ?? 0,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
