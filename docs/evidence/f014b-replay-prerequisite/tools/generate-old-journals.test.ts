// F-014B replay-prerequisite evidence: GENERATOR. Run ONLY in a pristine worktree of the build whose journals are wanted (here main d0bcb615).
// Writes real campaign packages under that build's own history identity. Keys are derived from a PUBLIC deterministic test seed
// (tools/deterministic-keys.ts); no private key is written anywhere. Output root is taken from G1_EVIDENCE_OUT.
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { it } from "vitest";
import { GmWaitCustody, factKind, sha256Canonical } from "@immortalis/engine";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WORKSHOP_SECOND,
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop, openingPublication } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";
import { FIXTURE_PC_ID, lifecycle, proofOf, seededRig, tempDir } from "./b2-support.ts";
import { REPLAY_FIXTURE_SEED_DOMAIN, deterministicFixtureKeys } from "./deterministic-keys.ts";

const OUT = process.env.G1_EVIDENCE_OUT ?? "";
const BUILD_COMMIT = process.env.G1_BUILD_COMMIT ?? "unrecorded";
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const digests = (root: string) => Object.fromEntries(walk(root).sort().map((f) => [f.slice(root.length + 1), { bytes: statSync(f).size, sha256: createHash("sha256").update(readFileSync(f)).digest("hex") }]));

async function laneScenario(name: string, target: number, advance: boolean) {
  const keys = deterministicFixtureKeys(generateFixtureRunnerKeys().keyId);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h = await openWorkshop("glassbell", { fixedKeys: keys, laneX(k) { signed = signedWorkshopLaneX(k, true); return signed.fixture; } });
  const store = h.campaign.store;
  const policy = { catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, historyVerificationId: h.admission.historyVerificationId!, kernelRule: factKind("temporal_state").rule };
  const clock = new GmWaitCustody(store, policy);
  const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
  const publisher = new WorkshopNoticeAdapter(store, policy.historyVerificationId, signed.fixture.noticeSource);
  const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
  const proof = proofOf();
  const root = signed.authorize(workshopView(store), x, duty.key);
  const enrolled = await must(publisher.enrol(x, duty.key)!);
  const enrolment = store.listFacts().find((f) => f.provenance.group_id === enrolled.receipt.group_id && WorkshopNoticeEnrolmentSchema.safeParse(f.value).success)!;
  const operation = store.getFact(h.charterInput.production_operation)!;
  await must(h.register.registerObject({ ...openingPublication("notice-object"), object: workshopNoticeTemporalObject(enrolment, operation)! }));
  await must(clock.publishMarker({ proof, initialRequestSha256: root, request: { cause: "fixture:addressed-notice", triggerRef: "fixture:request", target: { unit: WORKSHOP_SECOND, value: target }, publication: { basis: "fixture-basis", secrecy: "fixture-sealed" } }, preparation: { kind: "OWNER_PENDING_ENROLMENT" as const, owner: enrolment.owner, fact: { key: enrolment.key, version: enrolment.version, group_id: enrolment.provenance.group_id }, digest: sha256Canonical(enrolment.value) } }));
  await must(clock.open(proof));
  let sealed: unknown = null;
  if (advance) {
    for (let n = 0; n < 14; n++) { const s = await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource); if (s.status !== "STAGE" || !s.result.ok) break; }
    const r = await clock.sealOwn(x); sealed = r.ok ? "SEALED" : r.error;
  }
  const slot = clock.status(h.source.pc.id).state;
  const head = store.head();
  const dir = h.dir as string;
  await h.campaign.close();
  const out = join(OUT, "journals", name); mkdirSync(out, { recursive: true });
  cpSync(dir, join(out, "package"), { recursive: true });
  writeFileSync(join(out, "meta.json"), JSON.stringify({ scenario: name, kind: "lane-x", target, x, pc: h.source.pc.id, slotAtClose: slot, sealed, head, historyVerificationId: h.admission.historyVerificationId, catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, build: { commit: BUILD_COMMIT, node: process.version }, keyDerivation: { domain: REPLAY_FIXTURE_SEED_DOMAIN, keyId: keys.keyId, publicKeySpkiBase64: keys.publicKeySpkiBase64, note: "private key is derived at test time from the PUBLIC seed and is never stored" } }, null, 1));
  writeFileSync(join(out, "digests.json"), JSON.stringify(digests(join(out, "package")), null, 1));
  return { name, slot, historyId: h.admission.historyVerificationId, catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256 };
}

it("generates genuine journals under the build's own policy", async () => {
  if (!OUT) throw new Error("set G1_EVIDENCE_OUT");
  const report: unknown[] = [];
  report.push(await laneScenario("lane-x-active-quiet-target", 200, false));
  report.push(await laneScenario("lane-x-staged-seal-900", 900, true));
  const rig = await seededRig(tempDir());
  const { x } = await lifecycle(rig, "reconcile");
  const slot = rig.custody.status(FIXTURE_PC_ID).state;
  const head = rig.store.head();
  await rig.campaign.close();
  const out = join(OUT, "journals", "b2-zero-stage-reconciled"); mkdirSync(out, { recursive: true });
  cpSync(rig.dir, join(out, "package"), { recursive: true });
  writeFileSync(join(out, "meta.json"), JSON.stringify({ scenario: "b2-zero-stage-reconciled", kind: "b2", x, pc: FIXTURE_PC_ID, slotAtClose: slot, head, build: { commit: BUILD_COMMIT, node: process.version } }, null, 1));
  writeFileSync(join(out, "digests.json"), JSON.stringify(digests(join(out, "package")), null, 1));
  report.push({ name: "b2-zero-stage-reconciled", slot });
  mkdirSync(join(OUT, "results"), { recursive: true });
  writeFileSync(join(OUT, "results", "generation-report.json"), JSON.stringify(report, null, 1));
});
