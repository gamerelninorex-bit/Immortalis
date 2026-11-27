// F-014B replay-prerequisite evidence v2: VERIFIER for the two further scenarios. Build-agnostic. Reinstalls the RETAINED original authorizations
// (public signed bodies) and opens a COPY of each genuine journal under the build that runs it. Keys come from the PUBLIC deterministic test seed.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { CanonicalCampaign, GmWaitCustody, StageProviderRegistry, TemporalCoordinator, factKind } from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { resumeWorkshopWait } from "../../packages/engine/src/owners/workshop/wait-decision.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop } from "../support/b3-opening.ts";
import { deterministicFixtureKeys } from "./deterministic-keys.ts";

const OUT = process.env.G1_EVIDENCE_OUT ?? ""; const LABEL = process.env.G1_BUILD ?? "unknown";
const headKey = (h: { revision: number; journal_head_sha256: string; state_sha256: string }) => ({ revision: h.revision, journal: h.journal_head_sha256, state: h.state_sha256 });

it("opens the two further genuine journals under this build", async () => {
  if (!OUT) throw new Error("set G1_EVIDENCE_OUT");
  const out: Record<string, unknown> = { build: LABEL, node: process.version, currentCatalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256 };
  for (const name of ["lane-x-occurred-aftermath-600", "lane-x-interrupted-resumed-900"]) {
    const rec: Record<string, unknown> = {}; out[name] = rec;
    const meta = JSON.parse(readFileSync(join(OUT, "journals-v2", name, "meta.json"), "utf8"));
    let signed!: ReturnType<typeof signedWorkshopLaneX>;
    const h2 = await openWorkshop("glassbell", { fixedKeys: deterministicFixtureKeys(meta.keyDerivation.keyId), laneX(k) { signed = signedWorkshopLaneX(k, true); return signed.fixture; } });
    signed.importAuthorizations(meta.retainedAuthorizations); // retained, not reconstructed
    const id = h2.admission.historyVerificationId!;
    rec.policy = { identityEqualsJournals: id === meta.historyVerificationId, catalogueEqualsJournals: GM_WAIT_CATALOGUE_CURRENT_SHA256 === meta.catalogueSha256 };
    const copy = mkdtempSync(join(tmpdir(), "replay-evidence-v2-")); cpSync(join(OUT, "journals-v2", name, "package"), copy, { recursive: true });
    let opened;
    try { opened = await CanonicalCampaign.open(copy, { testkitFixtureAdmission: h2.admission }); } catch (e) { rec.open = { threw: String(e).slice(0, 300) }; await h2.campaign.close(); continue; }
    if (!opened.ok) { rec.open = { refused: opened.error }; await h2.campaign.close(); continue; }
    const camp = opened.value; const store = camp.store; rec.open = "OK";
    rec.replayedHeadEqualsRecordedHead = JSON.stringify(headKey(store.head())) === JSON.stringify(headKey(meta.head));
    const clock = new GmWaitCustody(store, { catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, historyVerificationId: id, kernelRule: factKind("temporal_state").rule });
    rec.slot = clock.status(meta.pc).state;
    const before = store.head();
    const r = await clock.sealOwn(meta.x);
    rec.sealRetry = r.ok ? { ok: true, replayed: r.value.replayed ?? false } : { ok: false, error: r.error };
    if (meta.choiceRef) {
      const res = await resumeWorkshopWait(store, new TemporalCoordinator(store, new StageProviderRegistry()), meta.x, meta.choiceRef, signed.fixture.choiceSource);
      rec.resumeRetry = res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    rec.headUnchangedByRetries = JSON.stringify(headKey(before)) === JSON.stringify(headKey(store.head()));
    await camp.close(); await h2.campaign.close();
  }
  mkdirSync(join(OUT, "results-v2"), { recursive: true });
  writeFileSync(join(OUT, "results-v2", `verify-${LABEL}.json`), JSON.stringify(out, null, 1));
});
