import {
  CanonicalCampaign,
  GipAdapter,
  KtiAdapter,
  PopulationAdapter,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type {
  GovernanceInstrument,
  InstitutionIdentity,
  OfficeAuthorityLocusDecisionBody,
  OfficeAuthorityLocusHolder,
  ScopeBinding,
} from "@immortalis/contracts";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  gipPublication,
  institutionIdentity,
  ktiObject,
  ktiPublication,
  decisionBodyOfficeAuthorityLocus,
  governanceInstrument,
  ledgerInput,
  officeAuthorityLocus,
  popPublication,
  scopeBinding,
  publication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface GipSeeded {
  readonly campaign: CanonicalCampaign;
  readonly gip: GipAdapter;
}

export interface GipSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** also establish the world, locus, a released PC and its active binding (default true) */
  readonly canonical?: boolean;
}

const wire = (campaign: CanonicalCampaign): GipSeeded => ({
  campaign,
  gip: new GipAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding) from the merged predecessor foundation.
 * No institution exists yet. GIP needs none of these: they only make the campaign a realistic neighbor of an institution.
 */
export async function seededGipCampaign(dir: string, o: GipSeedOptions = {}): Promise<GipSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "gip-seed",
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

export async function reopenGip(dir: string, buildId = "gip-reopen"): Promise<GipSeeded> {
  return wire(await must(CanonicalCampaign.open(dir, { buildId })));
}

/** Commits the one authored establishment of a continuing institution. */
export async function establishInstitution(
  s: Pick<GipSeeded, "gip">,
  n: number,
  institutionId?: string,
  over: Partial<InstitutionIdentity> = {},
): Promise<InstitutionIdentity> {
  const institution = institutionIdentity(institutionId, over);
  await must(s.gip.establishInstitution({ ...gipPublication(n), institution }));
  return institution;
}

/** Commits the one authored initial establishment of an office (holder branch) beneath an already-committed institution. */
export async function establishOffice(
  s: Pick<GipSeeded, "gip">,
  n: number,
  institutionId?: string,
  officeId?: string,
  over: Partial<OfficeAuthorityLocusHolder> = {},
): Promise<OfficeAuthorityLocusHolder> {
  const office = officeAuthorityLocus(institutionId, officeId, over);
  await must(s.gip.establishOffice({ ...gipPublication(n), office }));
  return office;
}

/** Commits the one authored initial establishment of an office (decision_body_ref branch) beneath an already-committed institution. */
export async function establishDecisionBodyOffice(
  s: Pick<GipSeeded, "gip">,
  n: number,
  institutionId?: string,
  officeId?: string,
  over: Partial<OfficeAuthorityLocusDecisionBody> = {},
): Promise<OfficeAuthorityLocusDecisionBody> {
  const office = decisionBodyOfficeAuthorityLocus(institutionId, officeId, over);
  await must(s.gip.establishOffice({ ...gipPublication(n), office }));
  return office;
}

/** Commits the one authored initial establishment of a scope binding beneath an already-committed office. */
export async function establishScopeBinding(
  s: Pick<GipSeeded, "gip">,
  n: number,
  institutionId?: string,
  officeId?: string,
  scopeBindingId?: string,
  over: Partial<ScopeBinding> = {},
): Promise<ScopeBinding> {
  const binding = scopeBinding(institutionId, officeId, scopeBindingId, over);
  await must(s.gip.establishScopeBinding({ ...gipPublication(n), scope_binding: binding }));
  return binding;
}

/** Commits the one authored initial establishment of a Governance Instrument beneath an office and one of its scope bindings. */
export async function establishGovernanceInstrument(
  s: Pick<GipSeeded, "gip">,
  n: number,
  instrumentId?: string,
  institutionId?: string,
  officeId?: string,
  scopeBindingId?: string,
  over: Partial<GovernanceInstrument> = {},
): Promise<GovernanceInstrument> {
  const instrument = governanceInstrument(
    instrumentId,
    institutionId,
    officeId,
    scopeBindingId,
    over,
  );
  await must(s.gip.establishGovernanceInstrument({ ...gipPublication(n), instrument }));
  return instrument;
}

/**
 * Neighboring facts of other owners that LOOK institution-like and must create no GIP identity: a Population ledger (a
 * population), a KTI development object of the INSTITUTIONAL_GOVERNMENT_MODEL class (an institutional model), and the
 * world locus' authored designation text that is already part of the seeded canonical campaign.
 */
export async function seedInstitutionLikeNeighbors(s: GipSeeded): Promise<void> {
  await must(
    new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(1),
      ledger: ledgerInput(),
    }),
  );
  await must(
    new KtiAdapter(s.campaign.store).establishDevelopmentObject({
      ...ktiPublication(1),
      object: ktiObject("kti-object-court-model", {
        object_class: "INSTITUTIONAL_GOVERNMENT_MODEL",
      }),
    }),
  );
}

/** Every committed fact in the GIP key space. */
export const gipFacts = (s: Pick<GipSeeded, "campaign">) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("gip/"));
