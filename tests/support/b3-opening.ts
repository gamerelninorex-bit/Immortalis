// Fixture-only driver. Real owner APIs publish every group. The signed runner and
// scripted referee are the existing mechanism fixtures, with their own namespaces.
import { readFileSync } from "node:fs";
import {
  NamedActorExistenceBasisSchema,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_PHYSICAL,
  actorPhysicalPresenceKey,
  economyRequestId,
  economyRequestKey,
  productionOperationKey,
  workshopCharterKey,
  workshopConditionKey,
  workshopExposureKey,
  worldLocusKey,
  worldProfileKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  GipAdapter,
  PopulationAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  WorkshopGipAdapter,
  WorkshopGlassbellAdapter,
  WorkshopHealthAdapter,
  WorkshopNamedActorAdapter,
  productionTemporalObject,
  refereeCandidateItems,
  resolveKey,
  sha256Canonical,
  workshopFixtureIdentity,
  WorkshopOpeningProfileSchema,
  workshopHealthRecoveryProvider,
  workshopHealthTemporalObject,
} from "@immortalis/engine";
import { compileContract, EMPTY_DRAFT } from "@immortalis/operator";
import { economyProviders } from "@immortalis/testkit";
import { msHarness } from "./ms-setup.ts";
import { plainPolicy } from "./original-pc.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

export const workshopRawProfile = (mode: "quiet" | "glassbell") =>
  readFileSync(
    new URL(
      `../../spec/b3/source-c0-v4/2026-11-23/workshop-opening-${mode}-v4.json`,
      import.meta.url,
    ),
  );

export const openingPublication = (label: string) => ({
  group_id: `b3-opening:${label}`,
  intent_id: `b3-opening:${label}`,
  cause: "b3-profile-original-opening",
  basis: "workshop-qualification",
  secrecy: "sealed",
});
const host = { host_id: "fixture:workshop-referee", claimed_model: null };

export async function openWorkshop(
  mode: "quiet" | "glassbell",
  opts: {
    readonly admissionOverride?: (
      admission: import("@immortalis/engine").WriteAdmission,
    ) => import("@immortalis/engine").WriteAdmission;
    readonly beforeProduction?: (
      gip: WorkshopGipAdapter,
      input: Parameters<WorkshopGipAdapter["adoptCharter"]>[0],
    ) => void;
    readonly beforeLedger?: (attempt: () => Promise<unknown>) => Promise<void>;
  } = {},
) {
  const bytes = workshopRawProfile(mode);
  const source = WorkshopOpeningProfileSchema.parse(JSON.parse(bytes.toString("utf8")));
  const profile = workshopFixtureIdentity(bytes);
  const pc_id = source.pc.id;
  const world_id = source.world.world_id;
  const locus_id = source.locus.locus_id;
  const ids = { pc_id, world_id, locus_id };
  const h = await msHarness({
    actors: {
      kind: "ACTOR_PRODUCER_REQUIRED",
      constraints: [source.attendant_leaf],
      ground: "one source-licensed actor",
    },
    v2: { message: source.setup_message, captureOver: { document: source.chronology } },
    workshop: {
      profileBytes: bytes,
      campaignId: profile.campaignId,
      async open(admission) {
        const dir = tempDir();
        const campaign = await must(
          CanonicalCampaign.create(dir, {
            campaignId: profile.campaignId,
            buildId: "workshop-b3-qualification",
            testkitFixtureAdmission: opts.admissionOverride?.(admission) ?? admission,
          }),
        );
        await must(
          campaign.establishWorld({ ...openingPublication("world"), world: source.world }),
        );
        await must(
          campaign.establishLocus({ ...openingPublication("locus"), locus: source.locus }),
        );
        await must(
          campaign.establishSourceCondition({
            ...openingPublication("finite-source"),
            source: source.finite_source,
          }),
        );
        const contract = compileContract(pc_id, {
          ...EMPTY_DRAFT,
          identity: source.pc.identity,
          embodiment: source.pc.embodiment,
          continuity: source.pc.continuity,
          contact: { kind: "CONTACT_ANCHOR", surfaces: [source.pc.contact] },
        })!;
        const referee = new RefereeAdjudicationAdapter(campaign.store);
        const items = refereeCandidateItems(contract);
        const input = { pc_id, attempt: 0, items };
        const task = referee.i002Task(input);
        const verdict = await must(
          referee.recordI002({
            ...input,
            operation: REFEREE_AUTHORITY,
            host,
            answer: plainPolicy({ ...task, operation: REFEREE_OP_I002 }),
          }),
        );
        await must(
          campaign.releasePlayerCharacter({
            ...openingPublication("player-release"),
            contract,
            qualified_by: verdict.record.key,
          }),
        );
        return { campaign, dir };
      },
    },
  });
  if (h.setup.status !== "COMPLETED") throw new Error(JSON.stringify(h.setup));
  const actor = await h.actorService.advance();
  if (actor.status !== "COMPLETED") throw new Error(JSON.stringify(actor));

  const campaign = h.campaign;
  const store = h.store;
  const historyId = h.admission.historyVerificationId!;
  const ref = new RefereeAdjudicationAdapter(store);
  const nativeInput = { ...ids, attempt: 0, statement: source.pc.presence };
  const nativeTask = await must(Promise.resolve(ref.irTask(nativeInput)));
  const nativeDecision = await must(
    ref.recordIr({
      ...nativeInput,
      operation: REFEREE_AUTHORITY,
      host,
      answer: plainPolicy({ ...nativeTask, operation: REFEREE_OP_IR }),
    }),
  );
  const bind = () =>
    campaign.bindPlayerCharacter({
      ...openingPublication("bind"),
      ...ids,
      insertion: {
        bridge: "NATIVE_ALREADY_THERE",
        established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
        authored_under: PLAYER_CHOICE_AUTHORITY,
        statement: source.pc.presence,
      },
      qualified_by: nativeDecision.record.key,
    });
  await opts.beforeLedger?.(bind);
  await must(campaign.initializePcStandingInstructionLedger(ids));
  await must(bind());
  const physical = await must(Promise.resolve(ref.physicalTask({ pc_id, attempt: 0 })));
  const placement = await must(
    ref.recordPhysical({
      pc_id,
      attempt: 0,
      operation: REFEREE_AUTHORITY,
      host,
      answer: plainPolicy({ ...physical, operation: REFEREE_OP_PHYSICAL }),
    }),
  );
  await must(
    campaign.establishOriginalPcPhysicalLocusCustody({
      ...openingPublication("physical-locus"),
      pc_id,
      native_qualified_by: nativeDecision.record.key,
      physical_qualified_by: placement.record.key,
    }),
  );
  const actorFacts = store
    .listFacts()
    .filter((fact) => resolveKey(fact.key)?.kind.id === "named_actor_existence_basis");
  if (actorFacts.length !== 1) throw new Error("Workshop authorizes exactly one signed M-S actor");
  const originalActor = actorFacts[0]!;
  const attendee = NamedActorExistenceBasisSchema.parse(originalActor.value).actor_id;
  if (!store.getFact(actorPhysicalPresenceKey(attendee)))
    throw new Error("Missing original attendant presence");

  const gip = new GipAdapter(store);
  await must(
    gip.establishInstitution({
      ...openingPublication("institution"),
      institution: { ...source.institution, constitutive_source_ref: profile.constitutiveSource },
    }),
  );
  await must(
    gip.establishOffice({
      ...openingPublication("supervisor"),
      office: { ...source.supervisor_office, authority_source_ref: profile.constitutiveSource },
    }),
  );
  await must(
    gip.establishOffice({
      ...openingPublication("post"),
      office: {
        ...source.attendant_post,
        authority_source_ref: profile.constitutiveSource,
        holder_ref: attendee,
      },
    }),
  );
  await must(
    gip.establishScopeBinding({
      ...openingPublication("scope"),
      scope_binding: source.local_scope,
    }),
  );

  const owners = new WorkshopGipAdapter(store, profile, historyId);
  const requestId = economyRequestId(source.demand.demand_envelope_id);
  const charterInput = {
    institution: gipInstitutionIdentityKey(source.institution.institution_id),
    office: gipOfficeAuthorityLocusKey(
      source.institution.institution_id,
      source.supervisor_office.office_id,
    ),
    scope: gipScopeBindingKey(
      source.institution.institution_id,
      source.supervisor_office.office_id,
      source.local_scope.scope_binding_id,
    ),
    world: worldProfileKey(world_id),
    locus: worldLocusKey(world_id, locus_id),
    attendant_existence: originalActor.key,
    attendant_post: gipOfficeAuthorityLocusKey(
      source.institution.institution_id,
      source.attendant_post.office_id,
    ),
    production_operation: productionOperationKey(requestId),
  };
  opts.beforeProduction?.(owners, charterInput);
  await must(
    new PopulationAdapter(store).establishLedger({
      ...openingPublication("population"),
      ledger: source.population_ledger,
    }),
  );
  await must(
    new EconomyAdapter(store).issueDemand({
      ...openingPublication("economy"),
      demand: source.demand,
    }),
  );
  const production = new ProductionAdapter(store);
  await must(
    production.establishReserve({ ...openingPublication("reserve"), reserve: source.reserve }),
  );
  const startInput = {
    ...openingPublication("production"),
    start: { ...source.production_start, request_key: economyRequestKey(requestId) },
  };
  await must(production.startOperation(startInput));
  const op = production.operation(requestId)!.value;
  const productionObject = productionTemporalObject(op, { worldId: world_id, locusId: locus_id });
  const register = new TemporalCoordinator(store, new StageProviderRegistry());
  await must(
    register.registerObject({
      ...openingPublication("production-object"),
      object: productionObject,
    }),
  );

  await must(owners.adoptCharter(charterInput)!);
  const instruction = await must(owners.issueInstruction()!);
  await must(
    new WorkshopNamedActorAdapter(store, profile, historyId).seedDuty(
      store.committedGroup(instruction.receipt.intent_id)!.writes[0]!.key,
    )!,
  );
  const health = new WorkshopHealthAdapter(store, profile, historyId);
  let healthObject;
  if (profile.glassbell) {
    await must(new WorkshopGlassbellAdapter(store, profile, historyId).establishExposure()!);
    await must(health.establishCondition()!);
    const exposureKey = workshopExposureKey(world_id, pc_id);
    const exposure = store.getFact(exposureKey)!;
    const condition = store.getFact(
      workshopConditionKey(
        pc_id,
        sha256Canonical([
          h.campaignId,
          pc_id,
          campaign.playerCharacter(pc_id)!.fact.key,
          exposureKey,
          "GLASSBELL_FIELD_V1",
        ]),
      ),
    )!;
    healthObject = workshopHealthTemporalObject(condition, exposure)!;
    await must(
      register.registerObject({ ...openingPublication("health-object"), object: healthObject }),
    );
  }
  const anchor = await must(health.establishCoverageAnchor()!);
  const providers = economyProviders();
  providers.register(workshopHealthRecoveryProvider);
  const coordinator = new TemporalCoordinator(store, providers);
  const charter = store.getFact(workshopCharterKey(h.campaignId)) as OwnerFact;
  return {
    ...h,
    source,
    profile,
    anchor,
    requestId,
    charter,
    charterInput,
    startInput,
    production,
    productionObject,
    healthObject,
    register,
    health,
    coordinator,
  };
}
