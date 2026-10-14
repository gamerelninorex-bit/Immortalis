// A process on a filesystem that cannot hard-link: link(2) fails with EPERM, as on FAT/exFAT or some network mounts.
// usage: node --experimental-strip-types no-hardlink-process.ts <primitiveDir> <createDir> <openDir>
// Prints what the engine does there as one JSON line. The patch is applied before the engine is imported.
import { readdirSync } from "node:fs";
import fsp from "node:fs/promises";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

fsp.link = async () => {
  throw Object.assign(new Error("EPERM: operation not permitted, link"), { code: "EPERM" });
};
syncBuiltinESMExports();

const { nodeFs, createFileCampaign, openFileCampaign } = await import("@immortalis/engine");
const { TEST_OWNERS } = await import("@immortalis/testkit");
const [primitiveDir, createDir, openDir] = process.argv.slice(2) as [string, string, string];

let primitive: { code: string | undefined; message?: string };
try {
  await nodeFs.createExclusive(join(primitiveDir, "LOCK"), "{}\n");
  primitive = { code: "NO_ERROR" };
} catch (e) {
  primitive = { code: (e as NodeJS.ErrnoException).code, message: (e as Error).message };
}
const created = await createFileCampaign(createDir, { campaignId: "c", owners: TEST_OWNERS });
const opened = await openFileCampaign(openDir, { owners: TEST_OWNERS });
console.log(
  JSON.stringify({
    primitive,
    primitiveFiles: readdirSync(primitiveDir),
    created: created.ok ? "OK" : created.error.code,
    createdFiles: readdirSync(createDir),
    opened: opened.ok ? "OK" : opened.error.code,
    openedCause: opened.ok
      ? null
      : ((opened.error.details as { cause?: string } | undefined)?.cause ?? null),
    openedLockFamily: readdirSync(openDir).filter((f) => f.startsWith("LOCK")),
  }),
);
