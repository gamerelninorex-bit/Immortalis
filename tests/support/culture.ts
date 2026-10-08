import {
  CanonicalCampaign,
  CultureAdapter,
  GipAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  worldLocusKey,
  type CanonicalTime,
  type CultureInput,
  type CultureUpdateContext,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  CULTURE_FIXTURE_EXTENSION,
  CULTURE_CONTEXT_MARKET,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  MANIFESTATION_A,
  T0,
  at,
  cultureConsumerBoundaryId,
  cultureConsumerObject,
  cultureContext,
  culturePublication,
  cultureProviders,
  evidenceInput,
  evidenceReading,
  fixtureLocus,
  fixtureWorld,
  gipPublication,
  institutionIdentity,
  publication,
  socialEvidenceGroup,
  temporalPublication,
  INSTITUTION_COURT,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export const SECOND_LOCUS_ID = "locus-fixture-2";
/** The bound referent (a committed World-State locus) and scope (a second one) of the primary scenario. */
export const REFERENT_KEY = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
export const SCOPE_KEY = worldLocusKey(FIXTURE_WORLD_ID, SECOND_LOCUS_ID);
export const INSTITUTION_KEY = `gip/institution/${INSTITUTION_COURT}/identity`;

export interface CultureSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly culture: CultureAdapter;
}

export interface CultureSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

export const cultureCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, cultureProviders());

const wire = (campaign: CanonicalCampaign): CultureSeeded => ({
  campaign,
  coordinator: cultureCoordinator(campaign.store),
  culture: new CultureAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (a world and two loci: the referent and the scope) and the canonical temporal basis
 * T0. No evidence, context or shared meaning exists yet, and nothing is resolved.
 */
export async function seededCultureCampaign(
  dir: string,
  o: CultureSeedOptions = {},
): Promise<CultureSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "culture-seed",
      extension: CULTURE_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(
    campaign.establishLocus({
      ...publication(3),
      locus: fixtureLocus({ locus_id: SECOND_LOCUS_ID }),
    }),
  );
  const s = wire(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenCulture(
  dir: string,
  buildId = "culture-reopen",
): Promise<CultureSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: CULTURE_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

/** Commits one fact of the synthetic social-evidence source (the committed evidence an input may then pin). */
export async function commitEvidence(
  s: CultureSeeded,
  n: number,
  id: string,
  value: unknown = evidenceReading(REFERENT_KEY, SCOPE_KEY),
): Promise<void> {
  await must(s.campaign.store.commit(socialEvidenceGroup(FIXTURE_CAMPAIGN, n, id, value)));
}

/** Commits a GIP Institution Identity (a second bindable canonical authority). */
export async function commitInstitution(s: CultureSeeded, n: number): Promise<void> {
  const gip = new GipAdapter(s.campaign.store);
  await must(
    gip.establishInstitution({
      ...gipPublication(n),
      institution: institutionIdentity(INSTITUTION_COURT),
    }),
  );
}

/** Seals the primary scenario's context over the given evidence ids (default: one well-formed evidence). */
export function primaryContext(
  inputs: readonly CultureInput[] = [evidenceInput("ev1")],
  over: Partial<CultureUpdateContext> & { readonly contextName?: string } = {},
): CultureUpdateContext {
  return cultureContext(REFERENT_KEY, SCOPE_KEY, inputs, over);
}

export async function sealContext(
  s: CultureSeeded,
  n: number,
  context: CultureUpdateContext = primaryContext(),
): Promise<CultureUpdateContext> {
  await must(s.culture.sealUpdateContext({ ...culturePublication(n), context }));
  return context;
}

/** One evidence fact and the context that seals it: the prerequisite of the primary scenario. */
export async function preparedCulture(s: CultureSeeded): Promise<CultureUpdateContext> {
  await commitEvidence(s, 1, "ev1");
  return sealContext(s, 1);
}

/** A test coordinate strictly after the current canonical time: an engaged object's earned boundary must lie in the future. */
export const boundaryAfterNow = (s: CultureSeeded): CanonicalTime => {
  const now = s.coordinator.state()!.value.canonical_time;
  return at(now.value + 10);
};

export const requestTo = (
  txId: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: txId,
  cause: `cause-${txId}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${txId}` },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

export const requestToBoundary = (
  s: CultureSeeded,
  txId: string,
  objectId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => {
  const object = s.coordinator.object(objectId);
  if (!object?.value.next_boundary) throw new Error(`no engaged boundary for ${objectId}`);
  return requestTo(txId, object.value.next_boundary.at, over);
};

export const cultureConsumerObjectAt = (
  s: CultureSeeded,
  consumerId: string,
  context: CultureUpdateContext,
  over: Partial<TemporalObject> = {},
): TemporalObject =>
  cultureConsumerObject(consumerId, context, {
    next_boundary: { boundary_id: cultureConsumerBoundaryId(consumerId), at: boundaryAfterNow(s) },
    ...over,
  });

/** Registers the engaged object of one dependent consequence that materially requires the shared meaning/norm. */
export async function registerCultureConsumer(
  s: CultureSeeded,
  consumerId: string,
  context: CultureUpdateContext,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: cultureConsumerObjectAt(s, consumerId, context),
    }),
  );
}

/** Advances toward one Culture consumer's earned boundary and no further. */
export const advanceCulture = (s: CultureSeeded, txId: string, consumerId: string) =>
  s.coordinator.advance(requestToBoundary(s, txId, `culture-consumer-obj-${consumerId}`));

export function cultureSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
  const head = campaign.store.head();
  const facts = campaign.store.listFacts();
  const under = (re: RegExp) => facts.filter((f) => re.test(f.key));
  return {
    head: {
      revision: head.revision,
      state_sha256: head.state_sha256,
      journal_entries: head.journal_entries,
      journal_head_sha256: head.journal_head_sha256,
    },
    state: coordinator.state()?.fact ?? null,
    index: coordinator.boundaryIndex(),
    objects: under(/^temporal\/object\//),
    transactions: under(/^temporal\/transaction\//),
    culture: under(/^culture\//),
    consumer: under(/^synthetic-culture-result-consumer\//),
    evidence: under(/^synthetic-social-evidence\//),
    world: under(/^world\//),
    gip: under(/^gip\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { CULTURE_CONTEXT_MARKET, MANIFESTATION_A, FIXTURE_CAMPAIGN };
