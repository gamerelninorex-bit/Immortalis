// F-014B replay-prerequisite evidence: VERIFIER. Build-agnostic. Opens a COPY of each genuine journal under the build that runs it and
// records, per journal: whether it opens, whether the replayed head equals the head recorded at generation, the slot, and whether a
// same-identity seal retry returns the original receipt. Keys are derived from the PUBLIC deterministic test seed; nothing secret is read.
// Paths come from G1_EVIDENCE_OUT; the build label from G1_BUILD.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import * as contracts from "@immortalis/contracts";
import { CanonicalCampaign, GmWaitCustody, factKind } from "@immortalis/engine";
import { WorkshopDutySchema } from "../../packages/contracts/src/workshop-opening.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop } from "../support/b3-opening.ts";
import { FIXTURE_ADMISSION, FIXTURE_PC_ID, custodyPolicy, reopen } from "./b2-support.ts";
import { deterministicFixtureKeys } from "./deterministic-keys.ts";

const OUT = process.env.G1_EVIDENCE_OUT ?? "";
const LABEL = process.env.G1_BUILD ?? "unknown";
const SEG = (contracts as unknown as { GM_WAIT_IF6B_QUIET_SEAL_SEGMENT?: string }).GM_WAIT_IF6B_QUIET_SEAL_SEGMENT;
const headKey = (h: { revision: number; journal_head_sha256: string; state_sha256: string }) => ({ revision: h.revision, journal: h.journal_head_sha256, state: h.state_sha256 });
const copyOf = (name: string) => { const d = mkdtempSync(join(tmpdir(), "replay-evidence-")); cpSync(join(OUT, "journals", name, "package"), d, { recursive: true }); return d; };

it("opens genuine journals under this build", async () => {
  if (!OUT) throw new Error("set G1_EVIDENCE_OUT");
  const out: Record<string, unknown> = { build: LABEL, node: process.version, currentCatalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, quietSegmentPresent: SEG !== undefined };
  for (const name of ["lane-x-active-quiet-target", "lane-x-staged-seal-900"]) {
    const rec: Record<string, unknown> = {}; out[name] = rec;
    const meta = JSON.parse(readFileSync(join(OUT, "journals", name, "meta.json"), "utf8"));
    let signed!: ReturnType<typeof signedWorkshopLaneX>;
    const h2 = await openWorkshop("glassbell", { fixedKeys: deterministicFixtureKeys(meta.keyDerivation.keyId), laneX(k) { signed = signedWorkshopLaneX(k, true); return signed.fixture; } });
    const id = h2.admission.historyVerificationId!;
    rec.policy = { identityEqualsJournals: id === meta.historyVerificationId, catalogueEqualsJournals: GM_WAIT_CATALOGUE_CURRENT_SHA256 === meta.catalogueSha256 };
    // the signed owner source keeps its per-wait authorization in memory; record the same one the original run recorded from the identical opening state
    const duty = h2.campaign.store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
    signed.authorize(workshopView(h2.campaign.store), meta.x, duty.key);
    let opened;
    try { opened = await CanonicalCampaign.open(copyOf(name), { testkitFixtureAdmission: h2.admission }); } catch (e) { rec.open = { threw: String(e).slice(0, 300) }; await h2.campaign.close(); continue; }
    if (!opened.ok) { rec.open = { refused: opened.error }; await h2.campaign.close(); continue; }
    const camp = opened.value; const store = camp.store; rec.open = "OK";
    rec.replayedHeadEqualsRecordedHead = JSON.stringify(headKey(store.head())) === JSON.stringify(headKey(meta.head));
    const clock = new GmWaitCustody(store, { catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, historyVerificationId: id, kernelRule: factKind("temporal_state").rule });
    rec.slot = clock.status(meta.pc).state;
    const before = store.head();
    const r = await clock.sealOwn(meta.x);
    rec.sealOwnAgain = r.ok ? { ok: true, replayed: r.value.replayed ?? false, slot: r.value.slot } : { ok: false, error: r.error };
    rec.headUnchangedBySealOwnAttempt = JSON.stringify(headKey(before)) === JSON.stringify(headKey(store.head()));
    await camp.close(); await h2.campaign.close();
  }
  { const rec: Record<string, unknown> = {}; out["b2-zero-stage-reconciled"] = rec;
    const meta = JSON.parse(readFileSync(join(OUT, "journals", "b2-zero-stage-reconciled", "meta.json"), "utf8"));
    const opened = await reopen(copyOf("b2-zero-stage-reconciled"), FIXTURE_ADMISSION);
    if (!opened.ok) rec.open = { refused: opened.error };
    else { const store = opened.value.store; rec.open = "OK";
      rec.replayedHeadEqualsRecordedHead = JSON.stringify(headKey(store.head())) === JSON.stringify(headKey(meta.head));
      const c = new GmWaitCustody(store, custodyPolicy(FIXTURE_ADMISSION)); rec.slot = c.status(FIXTURE_PC_ID).state;
      const r = await c.sealOwn(meta.x); rec.sealOwnAgain = r.ok ? { ok: true, replayed: r.value.replayed ?? false } : { ok: false, error: r.error };
      await opened.value.close(); } }
  mkdirSync(join(OUT, "results"), { recursive: true });
  writeFileSync(join(OUT, "results", `verify-${LABEL}.json`), JSON.stringify(out, null, 1));
});
