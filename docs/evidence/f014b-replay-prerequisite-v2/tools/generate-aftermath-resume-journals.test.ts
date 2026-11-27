// F-014B replay-prerequisite evidence v2: GENERATOR for two further genuine scenarios, run ONLY in a pristine worktree of the build whose journals are wanted.
//   A "lane-x-occurred-aftermath-600": target 600; five stages; seal with the notice occurrence; Health close; recipient authorization; receipt; reconcile.
//   B "lane-x-interrupted-resumed-900": target 900; INTERRUPTED seal; the same aftermath; then a decision opportunity, a test-authorized choice and the resume.
// Both follow tests/integration/b3-lane-x.test.ts step for step. Keys come from the PUBLIC deterministic test seed; the original signed authorizations
// (public bodies and signatures, never a key) are retained in meta.json so replay does not reconstruct them from the candidate output.
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { it } from "vitest";
import { PLAYER_CHARACTER_BINDING_KEY } from "@immortalis/contracts";
import { GmWaitCustody, StageProviderRegistry, TemporalCoordinator, factKind, sha256Canonical } from "@immortalis/engine";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import { WORKSHOP_SECOND, WorkshopDutySchema, WorkshopNoticeEnrolmentSchema, WorkshopNoticeOccurrenceSchema } from "../../packages/contracts/src/workshop-opening.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { publishWorkshopReceipt } from "../../packages/engine/src/owners/workshop/epistemic-notice.ts";
import { WorkshopHealthAdapter } from "../../packages/engine/src/owners/workshop/health-sensory.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { resumeWorkshopWait, workshopDecisionOpportunity } from "../../packages/engine/src/owners/workshop/wait-decision.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop, openingPublication } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";
import { proofOf } from "./b2-support.ts";
import { REPLAY_FIXTURE_SEED_DOMAIN, deterministicFixtureKeys } from "./deterministic-keys.ts";

const OUT = process.env.G1_EVIDENCE_OUT ?? "";
const BUILD_COMMIT = process.env.G1_BUILD_COMMIT ?? "unrecorded";
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const digests = (root: string) => Object.fromEntries(walk(root).sort().map((f) => [f.slice(root.length + 1), { bytes: statSync(f).size, sha256: createHash("sha256").update(readFileSync(f)).digest("hex") }]));

async function scenario(name: string, target: number, resume: boolean) {
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
  for (let n = 0; n < 14; n++) { const s = await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource); if (s.status !== "STAGE" || !s.result.ok) break; }
  await must(clock.sealOwn(x));
  // aftermath, exactly as the existing test does it
  const occurrence = store.listFacts().find((f) => WorkshopNoticeOccurrenceSchema.safeParse(f.value).success)!;
  const event = WorkshopNoticeOccurrenceSchema.parse(occurrence.value);
  const anchor = store.committedGroup(h.anchor.receipt.intent_id)!.writes[0]!.key;
  await must(new WorkshopHealthAdapter(store, h.profile, policy.historyVerificationId).closeAuditoryFunction(occurrence.key, anchor)!);
  signed.authorizeRecipient(occurrence, event, store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
  await must(publishWorkshopReceipt(store, occurrence.key, signed.fixture.noticeSource.recipientSource)!);
  await must(clock.reconcile(proof));
  let resumed: unknown = null; let basis: unknown = null; let choiceRef: string | null = null;
  if (resume) {
    const coordinator = new TemporalCoordinator(store, new StageProviderRegistry());
    const opportunity = workshopDecisionOpportunity(workshopView(store), x)!;
    basis = opportunity.basis;
    choiceRef = signed.choose(opportunity.basis, "separate-confirmation");
    const r = await resumeWorkshopWait(store, coordinator, x, choiceRef, signed.fixture.choiceSource);
    resumed = r.ok ? "RESUMED" : r.error;
  }
  const slot = clock.status(h.source.pc.id).state; const head = store.head(); const dir = h.dir as string;
  await h.campaign.close();
  const out = join(OUT, "journals-v2", name); mkdirSync(out, { recursive: true });
  cpSync(dir, join(out, "package"), { recursive: true });
  writeFileSync(join(out, "meta.json"), JSON.stringify({ scenario: name, kind: "lane-x", target, x, pc: h.source.pc.id, slotAtClose: slot, resumed, opportunityBasis: basis, choiceRef, head, historyVerificationId: h.admission.historyVerificationId, catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256, build: { commit: BUILD_COMMIT, node: process.version }, keyDerivation: { domain: REPLAY_FIXTURE_SEED_DOMAIN, keyId: keys.keyId, publicKeySpkiBase64: keys.publicKeySpkiBase64, note: "private key is derived at test time from the PUBLIC seed and is never stored" }, retainedAuthorizations: signed.exportAuthorizations() }, null, 1));
  writeFileSync(join(out, "digests.json"), JSON.stringify(digests(join(out, "package")), null, 1));
  return { name, slot, resumed };
}

it("generates the two further genuine scenarios under the build's own policy", async () => {
  if (!OUT) throw new Error("set G1_EVIDENCE_OUT");
  const report = [await scenario("lane-x-occurred-aftermath-600", 600, false), await scenario("lane-x-interrupted-resumed-900", 900, true)];
  mkdirSync(join(OUT, "results-v2"), { recursive: true });
  writeFileSync(join(OUT, "results-v2", "generation-report.json"), JSON.stringify(report, null, 1));
});
