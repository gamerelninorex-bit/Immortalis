// Scratch generator: a genuine B2 journal written by an EARLIER main build (the #135 merge), to test cross-generation replay.
import { cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { it } from "vitest";
import { FIXTURE_ADMISSION, FIXTURE_PC_ID, lifecycle, seededRig, tempDir } from "./b2-support.ts";
const OUT = process.env.G1_EVIDENCE_OUT ?? "";
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
it("writes a genuine B2 journal under the #135 build", async () => {
  const rig = await seededRig(tempDir());
  const { x } = await lifecycle(rig, "reconcile");
  const slot = rig.custody.status(FIXTURE_PC_ID).state; const head = rig.store.head();
  await rig.campaign.close();
  const out = join(OUT, "journals-prior-main", "b2-zero-stage-reconciled-at-7281045"); mkdirSync(out, { recursive: true });
  cpSync(rig.dir, join(out, "package"), { recursive: true });
  writeFileSync(join(out, "meta.json"), JSON.stringify({ scenario: "b2-zero-stage-reconciled-at-7281045", x, pc: FIXTURE_PC_ID, slotAtClose: slot, head, historyVerificationId: FIXTURE_ADMISSION.historyVerificationId, build: { commit: "7281045565662fece3e76be5b94c28f3c4201dbb7".slice(0,0) + process.env.G1_BUILD_COMMIT, node: process.version } }, null, 1));
  writeFileSync(join(out, "digests.json"), JSON.stringify(Object.fromEntries(walk(join(out, "package")).sort().map((f) => [f.slice(join(out, "package").length + 1), { bytes: statSync(f).size, sha256: createHash("sha256").update(readFileSync(f)).digest("hex") }])), null, 1));
});
