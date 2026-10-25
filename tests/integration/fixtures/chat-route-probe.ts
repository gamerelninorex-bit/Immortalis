// Common baseline/current owner read, in a fresh process with the same causal fixture.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { canonicalJson } from "@immortalis/contracts";
import { routeMeter } from "../../support/route-meter.ts";

const config = JSON.parse(readFileSync(process.argv[3]!, "utf8"));
const route = process.argv[4] === "route";
const source = await import(
  pathToFileURL(
    `${process.argv[2]}/apps/phone/src/${route ? "route-evidence" : "character-evidence"}.ts`,
  ).href
);
const out = [];
for (let i = 0; i < 3; i++) {
  const meter = routeMeter();
  const start = performance.now();
  try {
    const result = await (route ? source.readRoute(config) : source.readCharacter(config));
    const ms = performance.now() - start;
    meter.stop();
    // Route readback keeps probed intents in a Map. Normalize that technical
    // container explicitly for JSON size/hash evidence; canonicalJson refuses
    // non-plain objects, and ordinary JSON.stringify would silently omit it.
    const snapshot =
      route && result.kind === "OPEN"
        ? { ...result, route: { ...result.route, landed: [...result.route.landed] } }
        : result;
    out.push({
      ms,
      work: meter.snapshot(),
      outcome: result.kind,
      internal_bytes: Buffer.byteLength(JSON.stringify(snapshot)),
      continuity_sha: createHash("sha256").update(canonicalJson(snapshot)).digest("hex"),
    });
  } finally {
    meter.stop();
  }
}
process.stdout.write(JSON.stringify(out));
