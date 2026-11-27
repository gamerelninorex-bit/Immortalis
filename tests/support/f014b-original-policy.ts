// Shared fixtures for the F-014B original-policy tests: the vendored genuine journals and the helpers that reopen them.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CanonicalCampaign, GmWaitCustody, factKind, sha256Canonical } from "@immortalis/engine";
import { fixtureMsEconomyForwardAdmission } from "../../packages/engine/src/owners/admission.ts";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WORKSHOP_SECOND,
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import {
  WORKSHOP_G0_CATALOGUE_SHA256,
  WORKSHOP_GENERATION_G0,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { workshopFixtureIdentity } from "../../packages/engine/src/owners/workshop/source.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { must } from "./temporal.ts";
import {
  composeWorkshopIdentity,
  type WorkshopGeneration,
  type WorkshopIdentityInputs,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { IF6B_POLICY } from "../../packages/engine/src/temporal/if6b-stage.ts";
import { signedWorkshopLaneX, type RetainedLaneXAuthorizations } from "./b3-lane-x.ts";
import { openWorkshop, openingPublication, workshopRawProfile } from "./b3-opening.ts";
import { deterministicFixtureKeys } from "./deterministic-keys.ts";
import { copyPackage, proofOf } from "../integration/b2-support.ts";

export const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/f014b-original-policy",
);
export const JOURNALS = {
  active: "lane-x-active-quiet-target",
  staged: "lane-x-staged-seal-900",
  occurred: "lane-x-occurred-aftermath-600",
  resumed: "lane-x-interrupted-resumed-900",
  b2: "b2-zero-stage-reconciled",
  b2Prior: "b2-zero-stage-reconciled-at-7281045",
  b3eDraft: "b3e-draft-staged-seal-900",
  b3eForward: "b3e-forward-staged-seal-900",
  b3eDraftAwaiting: "b3e-draft-interrupted-awaiting-choice-900",
  b3eForwardAwaiting: "b3e-forward-interrupted-awaiting-choice-900",
} as const;
export const LANE_X = [
  JOURNALS.active,
  JOURNALS.staged,
  JOURNALS.occurred,
  JOURNALS.resumed,
] as const;

export const metaOf = (name: string) =>
  JSON.parse(readFileSync(join(FIX, "journals", name, "meta.json"), "utf8"));
const retainedOf = (name: string): RetainedLaneXAuthorizations => {
  const meta = metaOf(name);
  if (meta.retainedAuthorizations) return meta.retainedAuthorizations;
  return JSON.parse(readFileSync(join(FIX, "journals", name, "authorizations.json"), "utf8"))
    .retainedAuthorizations;
};
export const headKey = (h: {
  revision: number;
  journal_head_sha256: string;
  state_sha256: string;
}) => ({
  revision: h.revision,
  journal: h.journal_head_sha256,
  state: h.state_sha256,
});

/** A SYNTHETIC successor generation: another identity segment and another catalogue digest. */
export const SUCCESSOR: WorkshopGeneration = Object.freeze({
  id: "SYNTHETIC-SUCCESSOR",
  catalogueSha256: "ab".repeat(32),
  identity: (i: WorkshopIdentityInputs) =>
    composeWorkshopIdentity(i, { if6bPolicy: "SYNTHETIC-SUCCESSOR-SEGMENT+" + IF6B_POLICY }),
});

/**
 * A scratch copy of a vendored package. Git cannot store the empty `history/` directory a closed package carries, and a strict replay writes its
 * history index there, so it is recreated (an empty directory carries no evidence).
 */
export function fixtureCopy(name: string): string {
  return withoutCheckpoints(copyPackage(join(FIX, "journals", name, "package")));
}
/** a package with no checkpoint in its history: whatever opens it can only REPLAY it, group by group, under its own historical verifier */
export function withoutCheckpoints(dir: string): string {
  rmSync(join(dir, "history"), { recursive: true, force: true });
  mkdirSync(join(dir, "history"), { recursive: true });
  return dir;
}

/** reopen a copy of a genuine Lane X journal under a build whose CURRENT generation is `generation` (default: this build's own) */
export async function openGenuineLaneX(
  name: string,
  generation?: WorkshopGeneration,
  forward?: true,
) {
  const meta = metaOf(name);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h2 = await openWorkshop("glassbell", {
    ...(forward ? { laneXAdmission: fixtureMsEconomyForwardAdmission } : {}),
    fixedKeys: deterministicFixtureKeys(meta.keyDerivation.keyId),
    ...(generation
      ? {
          currentGeneration: generation,
          // the harness's own (new) opening is published under the successor's pair, as a successor build would
          historyRef: (id: string) => ({
            historyId: id,
            catalogueSha256: generation.catalogueSha256,
          }),
        }
      : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, !forward);
      return signed.fixture;
    },
  });
  signed.importAuthorizations(retainedOf(name));
  const dir = fixtureCopy(name);
  const opened = await CanonicalCampaign.open(dir, {
    testkitFixtureAdmission: h2.admission,
  });
  return { meta, h2, signed, opened, dir };
}

/**
 * Writes a Lane X lineage THIS build's own way (the evidence generator's flow, target 900): the marker and OPEN, then `advance` owner stages
 * (a number) or all of them plus the GM seal ("seal"). With `generation` the build stands that generation in as CURRENT and publishes under its pair.
 */
export async function writeLaneXLineage(opts: {
  readonly advance: number | "seal";
  readonly generation?: WorkshopGeneration;
  /**
   * Publish under the frozen G0 pair although this build's CURRENT catalogue moved. The live admission refuses that by design, so the writer is
   * permissive (the journal is hash-consistent and carries exactly the recorded G0 pair); only the historical verifier judges it.
   */
  readonly asG0?: true;
  /** the Economy realized-access FORWARD constructor (#146) instead of the draft one */
  readonly forward?: true;
  /** forge the pair the MARKER records, while the owner facts keep their own (marker forgery negatives) */
  readonly markerPair?: {
    readonly historyVerificationId?: string;
    readonly catalogueSha256?: string;
  };
}) {
  const keys = deterministicFixtureKeys(generateFixtureRunnerKeys().keyId);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  // the frozen G0 identity, recomputed from this harness's own constructed inputs (so it is right under ANY successor build too)
  const g0Id = () =>
    WORKSHOP_GENERATION_G0.identity({
      base: "",
      profileSha256: workshopFixtureIdentity(workshopRawProfile("glassbell")).sha256,
      noticeVerificationId: signed.fixture.noticeSource.verificationId,
      laneX: {
        economyDraft: true,
        choiceSha256: sha256Canonical(signed.fixture.choiceSource!.verificationId),
      },
    });
  const pair = (id: string) => ({
    historyId: opts.asG0 ? g0Id() : id,
    catalogueSha256:
      opts.generation?.catalogueSha256 ??
      (opts.asG0 ? WORKSHOP_G0_CATALOGUE_SHA256 : GM_WAIT_CATALOGUE_CURRENT_SHA256),
  });
  const h = await openWorkshop("glassbell", {
    ...(opts.forward ? { laneXAdmission: fixtureMsEconomyForwardAdmission } : {}),
    fixedKeys: keys,
    ...(opts.generation ? { currentGeneration: opts.generation } : {}),
    ...(opts.asG0
      ? {
          admissionOverride: <T extends { check: unknown }>(a: T): T => ({
            ...a,
            check: () => null,
          }),
        }
      : {}),
    historyRef: pair,
    laneX(k) {
      signed = signedWorkshopLaneX(k, !opts.forward);
      return signed.fixture;
    },
  });
  const store = h.campaign.store;
  const id = h.admission.historyVerificationId!;
  const clock = new GmWaitCustody(store, {
    catalogueSha256: opts.markerPair?.catalogueSha256 ?? pair(id).catalogueSha256,
    historyVerificationId: opts.markerPair?.historyVerificationId ?? pair(id).historyId,
    kernelRule: factKind("temporal_state").rule,
  });
  const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
  const publisher = new WorkshopNoticeAdapter(store, pair(id), signed.fixture.noticeSource);
  const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
  const proof = proofOf();
  const root = signed.authorize(workshopView(store), x, duty.key);
  const enrolled = await must(publisher.enrol(x, duty.key)!);
  const enrolment = store
    .listFacts()
    .find(
      (f) =>
        f.provenance.group_id === enrolled.receipt.group_id &&
        WorkshopNoticeEnrolmentSchema.safeParse(f.value).success,
    )!;
  await must(
    h.register.registerObject({
      ...openingPublication("notice-object"),
      object: workshopNoticeTemporalObject(
        enrolment,
        store.getFact(h.charterInput.production_operation)!,
      )!,
    }),
  );
  await must(
    clock.publishMarker({
      proof,
      initialRequestSha256: root,
      request: {
        cause: "fixture:addressed-notice",
        triggerRef: "fixture:request",
        target: { unit: WORKSHOP_SECOND, value: 900 },
        publication: { basis: "fixture-basis", secrecy: "fixture-sealed" },
      },
      preparation: {
        kind: "OWNER_PENDING_ENROLMENT" as const,
        owner: enrolment.owner,
        fact: {
          key: enrolment.key,
          version: enrolment.version,
          group_id: enrolment.provenance.group_id,
        },
        digest: sha256Canonical(enrolment.value),
      },
    }),
  );
  await must(clock.open(proof));
  const limit = opts.advance === "seal" ? 14 : opts.advance;
  for (let n = 0; n < limit; n++) {
    const stage = await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource);
    if (stage.status !== "STAGE" || !stage.result.ok) break;
  }
  if (opts.advance === "seal") await must(clock.sealOwn(x));
  const head = store.head();
  const dir = h.dir as string;
  const slot = clock.status(h.source.pc.id).state;
  await h.campaign.close();
  return { keys, signed, head, dir, x, slot, pc: h.source.pc.id };
}

/** reopen a lineage written by `writeLaneXLineage` under a build whose CURRENT generation is `generation` (default: this build's own) */
export async function reopenLaneXLineage(
  f: Awaited<ReturnType<typeof writeLaneXLineage>>,
  generation?: WorkshopGeneration,
  forward?: true,
) {
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h2 = await openWorkshop("glassbell", {
    ...(forward ? { laneXAdmission: fixtureMsEconomyForwardAdmission } : {}),
    fixedKeys: f.keys,
    ...(generation
      ? {
          currentGeneration: generation,
          historyRef: (id: string) => ({
            historyId: id,
            catalogueSha256: generation.catalogueSha256,
          }),
        }
      : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, !forward);
      return signed.fixture;
    },
  });
  signed.importAuthorizations(f.signed.exportAuthorizations());
  const opened = await CanonicalCampaign.open(withoutCheckpoints(copyPackage(f.dir)), {
    testkitFixtureAdmission: h2.admission,
  });
  return { h2, signed, opened };
}
