// F-014B P-7 E0 - the optional BUILD-TIME audit runner for the section 10 evidence/checker groundwork. Read-only: it takes the actual census from the
// registry, provider and extension declarations (the generator's own `buildCensus`), loads the retained current catalogue manifest, and prints the
// all-enrolled coverage / gap report for the PRODUCTION default - no certificate exists, so every member that needs one is NOT_PROVEN with its
// reason. It writes nothing but the optional `--out` file, regenerates no digest, edits no manifest and installs nothing. Not a CI gate.
//
//   node --disable-warning=ExperimentalWarning --experimental-strip-types tests/support/p7-section10/audit.ts [--out <file>]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "@immortalis/contracts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../../packages/engine/src/gm-wait-catalogue-current.ts";
import { buildSection10Report, type Section10Report } from "./proof.ts";
import { MANIFEST_DIR, REPO_ROOT, buildCensus } from "../../../tools/gen-gm-wait-catalogue.ts";

export async function auditProduction(): Promise<Section10Report> {
  const bytes = readFileSync(
    join(REPO_ROOT, MANIFEST_DIR, `${GM_WAIT_CATALOGUE_CURRENT_SHA256}.json`),
    "utf8",
  );
  return buildSection10Report({
    manifest: JSON.parse(bytes) as unknown,
    authority: {
      current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
      retained: new Map([[GM_WAIT_CATALOGUE_CURRENT_SHA256, bytes]]),
    },
    census: await buildCensus(),
    // no certificate exists at this baseline, no ledger of original-owner evidence is consulted, and every producer authority is its refusing default
    ledger: { get: () => undefined },
    certificates: [],
  });
}

async function main(): Promise<number> {
  const out = process.argv[2] === "--out" ? process.argv[3] : undefined;
  if (process.argv[2] === "--out" && out === undefined) {
    console.error("--out needs a file");
    return 2;
  }
  const report = await auditProduction();
  const text = `${canonicalJson(report)}\n`;
  if (out !== undefined) {
    writeFileSync(resolve(out), text);
    console.log(
      `wrote ${out}: ${report.totals.members} members, ${report.totals.proof_closed_candidate} proof-closed, aggregate ${report.aggregate.status}`,
    );
  } else {
    process.stdout.write(text);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e);
      process.exit(2);
    },
  );
}
