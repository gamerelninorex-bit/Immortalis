// Cross-generation check: a genuine B2 journal written by an EARLIER main build, opened under this build. Build label from G1_BUILD.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { GmWaitCustody } from "@immortalis/engine";
import { FIXTURE_ADMISSION, FIXTURE_PC_ID, custodyPolicy, reopen } from "./b2-support.ts";
const OUT = process.env.G1_EVIDENCE_OUT ?? ""; const LABEL = process.env.G1_BUILD ?? "unknown";
it("opens the earlier-main B2 journal", async () => {
  const dirName = "b2-zero-stage-reconciled-at-7281045";
  const meta = JSON.parse(readFileSync(join(OUT, "journals-prior-main", dirName, "meta.json"), "utf8"));
  const copy = mkdtempSync(join(tmpdir(), "replay-evidence-")); cpSync(join(OUT, "journals-prior-main", dirName, "package"), copy, { recursive: true });
  const res: Record<string, unknown> = { build: LABEL, journalIdentityTail: meta.historyVerificationId.slice(-60), thisBuildIdentityTail: String(FIXTURE_ADMISSION.historyVerificationId).slice(-60), identityEqual: meta.historyVerificationId === FIXTURE_ADMISSION.historyVerificationId };
  const o = await reopen(copy, FIXTURE_ADMISSION);
  if (!o.ok) res.open = { refused: o.error };
  else { const s = o.value.store; res.open = "OK"; res.headEqual = JSON.stringify({ r: s.head().revision, j: s.head().journal_head_sha256, s: s.head().state_sha256 }) === JSON.stringify({ r: meta.head.revision, j: meta.head.journal_head_sha256, s: meta.head.state_sha256 }); res.slot = new GmWaitCustody(s, custodyPolicy(FIXTURE_ADMISSION)).status(FIXTURE_PC_ID).state; await o.value.close(); }
  mkdirSync(join(OUT, "results"), { recursive: true }); writeFileSync(join(OUT, "results", `verify-prior-main-b2-${LABEL}.json`), JSON.stringify(res, null, 1));
});
