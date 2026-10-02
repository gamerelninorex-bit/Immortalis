import {
  CanonicalCampaign,
  DiplomacyAdapter,
  GipAdapter,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type { ExternalRecognition, ExternalizedClaimDispute } from "@immortalis/contracts";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  diplomacyPublication,
  externalRecognition,
  externalizedClaimDispute,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  gipPublication,
  institutionIdentity,
  officeAuthorityLocus,
  publication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface DiplomacySeeded {
  readonly campaign: CanonicalCampaign;
  readonly diplomacy: DiplomacyAdapter;
  readonly gip: GipAdapter;
}

export interface DiplomacySeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** also establish the world, locus, a released PC and its active binding (default true) */
  readonly canonical?: boolean;
}

const wire = (campaign: CanonicalCampaign): DiplomacySeeded => ({
  campaign,
  diplomacy: new DiplomacyAdapter(campaign.store),
  gip: new GipAdapter(campaign.store),
});

/** The prerequisite canonical campaign (world, locus, released PC, active binding). No recognition exists yet. */
export async function seededDiplomacyCampaign(
  dir: string,
  o: DiplomacySeedOptions = {},
): Promise<DiplomacySeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "diplomacy-seed",
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  if (o.canonical !== false) {
    await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
    await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
    await must(
      campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: FIXTURE_PC_ID,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        insertion: fixtureInsertionFact(),
      }),
    );
  }
  return wire(campaign);
}

export async function reopenDiplomacy(
  dir: string,
  buildId = "diplomacy-reopen",
): Promise<DiplomacySeeded> {
  return wire(await must(CanonicalCampaign.open(dir, { buildId })));
}

/** Commits the one authored initial establishment of an External Recognition. */
export async function establishExternalRecognition(
  s: Pick<DiplomacySeeded, "diplomacy">,
  n: number,
  recognitionId?: string,
  over: Partial<ExternalRecognition> = {},
): Promise<ExternalRecognition> {
  const recognition = externalRecognition(recognitionId, over);
  await must(s.diplomacy.establishExternalRecognition({ ...diplomacyPublication(n), recognition }));
  return recognition;
}

/** Commits the one authored initial establishment of an Externalized Claim / Dispute. */
export async function establishExternalizedClaimDispute(
  s: Pick<DiplomacySeeded, "diplomacy">,
  n: number,
  disputeId?: string,
  over: Partial<ExternalizedClaimDispute> = {},
): Promise<ExternalizedClaimDispute> {
  const dispute = externalizedClaimDispute(disputeId, over);
  await must(
    s.diplomacy.establishExternalizedClaimDispute({ ...diplomacyPublication(n), dispute }),
  );
  return dispute;
}

/**
 * Commits a GIP institution and an office: the one mutable-looking implemented owner state a recognition or dispute can name in
 * `dependency_refs[]` in these tests (the office is a real committed fact of another owner, referenced and never copied).
 */
export async function establishGipAuthority(
  s: Pick<DiplomacySeeded, "gip">,
  firstGroup = 1,
): Promise<{ readonly officeKey: string; readonly institutionKey: string }> {
  const institution = institutionIdentity();
  await must(s.gip.establishInstitution({ ...gipPublication(firstGroup), institution }));
  const office = officeAuthorityLocus(institution.institution_id);
  await must(s.gip.establishOffice({ ...gipPublication(firstGroup + 1), office }));
  return {
    institutionKey: `gip/institution/${institution.institution_id}/identity`,
    officeKey: `gip/institution/${institution.institution_id}/office/${office.office_id}`,
  };
}

/** Every committed fact in the Diplomacy key space. */
export const diplomacyFacts = (s: Pick<DiplomacySeeded, "campaign">) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("diplomacy/"));
