// Government, Institutions & Politics owns the charter and instruction.
import {
  InstitutionIdentitySchema,
  NamedActorExistenceBasisSchema,
  OfficeAuthorityLocusHolderSchema,
  OWNER_GIP,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  ProductionOperationSchema,
  ProductionReserveSchema,
  ScopeBindingSchema,
  TemporalObjectSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  gipOfficeAuthorityLocusKey,
  economyRequestId,
  gipScopeBindingKey,
  gipInstitutionIdentityKey,
  productionObjectId,
  temporalObjectKey,
  timeEquals,
  Sha256,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  FACET_GIP_COMPLETION_DIRECTION,
  WORKSHOP_DISCLOSURE,
  WORKSHOP_MONITOR,
  WorkshopCharterSchema,
  WorkshopInstructionSchema,
  workshopCharterKey,
  workshopInstructionKey,
  type WorkshopCharter,
  type WorkshopInstruction,
} from "@immortalis/contracts";
import { workshopProductionStages } from "../workshop/production-stages.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import type { CampaignStore } from "../persistence/store.ts";
import {
  workshopClock,
  workshopGroup,
  workshopMatches,
  workshopPolicy,
  workshopRef,
  workshopView,
  type WorkshopView,
} from "../workshop/publication.ts";
import {
  WORKSHOP_CHARTER_RULE,
  WORKSHOP_INSTRUCTION_RULE,
  type WorkshopFixtureIdentity,
} from "../workshop/source.ts";

export type WorkshopCharterInputs = {
  readonly institution: string;
  readonly office: string;
  readonly scope: string;
  readonly world: string;
  readonly locus: string;
  readonly attendant_existence: string;
  readonly attendant_post: string;
  readonly production_operation: string;
};

export function deriveWorkshopCharter(
  view: WorkshopView,
  inputs: WorkshopCharterInputs,
  profile: WorkshopFixtureIdentity,
  historyId: string,
): CommitGroup | undefined {
  const institution = view.get(inputs.institution);
  const office = view.get(inputs.office);
  const scope = view.get(inputs.scope);
  const world = view.get(inputs.world);
  const locus = view.get(inputs.locus);
  const actor = view.get(inputs.attendant_existence);
  const post = view.get(inputs.attendant_post);
  const production = view.get(inputs.production_operation);
  const binding = view.get(PLAYER_CHARACTER_BINDING_KEY);
  const clock = workshopClock(view);
  if (
    !institution ||
    !office ||
    !scope ||
    !world ||
    !locus ||
    !actor ||
    !post ||
    !production ||
    !binding ||
    !clock
  )
    return undefined;
  const i = InstitutionIdentitySchema.safeParse(institution.value);
  const o = OfficeAuthorityLocusHolderSchema.safeParse(office.value);
  const s = ScopeBindingSchema.safeParse(scope.value);
  const w = WorldProfileSchema.safeParse(world.value);
  const l = WorldLocusSchema.safeParse(locus.value);
  const a = NamedActorExistenceBasisSchema.safeParse(actor.value);
  const p = OfficeAuthorityLocusHolderSchema.safeParse(post.value);
  const op = ProductionOperationSchema.safeParse(production.value);
  const b = PlayerCharacterBindingSchema.safeParse(binding.value);
  if (
    !i.success ||
    !o.success ||
    !s.success ||
    !w.success ||
    !l.success ||
    !a.success ||
    !p.success ||
    !op.success ||
    !b.success
  )
    return undefined;

  const reserve = view.get(op.data.reserve.fact_key);
  const r = ProductionReserveSchema.safeParse(reserve?.value);
  const temporal = view.get(temporalObjectKey(productionObjectId(op.data.operation_id)));
  const registered = TemporalObjectSchema.safeParse(temporal?.value);
  if (
    !reserve ||
    !r.success ||
    !temporal ||
    !registered.success ||
    !workshopProductionStages(registered.data) ||
    institution.key !== gipInstitutionIdentityKey(i.data.institution_id) ||
    office.key !== gipOfficeAuthorityLocusKey(i.data.institution_id, o.data.office_id) ||
    post.key !== gipOfficeAuthorityLocusKey(i.data.institution_id, p.data.office_id) ||
    office.key === post.key ||
    scope.key !==
      gipScopeBindingKey(i.data.institution_id, o.data.office_id, s.data.scope_binding_id) ||
    !canonicalEqual(w.data, profile.definition.world) ||
    !canonicalEqual(l.data, profile.definition.locus) ||
    !canonicalEqual(i.data, {
      ...profile.definition.institution,
      constitutive_source_ref: profile.constitutiveSource,
    }) ||
    !canonicalEqual(o.data, {
      ...profile.definition.supervisor_office,
      authority_source_ref: profile.constitutiveSource,
    }) ||
    !canonicalEqual(p.data, {
      ...profile.definition.attendant_post,
      authority_source_ref: profile.constitutiveSource,
      holder_ref: a.data.actor_id,
    }) ||
    !canonicalEqual(s.data, profile.definition.local_scope) ||
    op.data.operation_id !== economyRequestId(profile.definition.demand.demand_envelope_id) ||
    !timeEquals(op.data.timing.completion.at, profile.definition.production_start.completion_at) ||
    p.data.holder_ref !== a.data.actor_id ||
    o.data.holder_ref === a.data.actor_id ||
    b.data.coupling.world.fact_key !== world.key ||
    b.data.coupling.locus.fact_key !== locus.key ||
    l.data.world.fact_key !== world.key ||
    r.data.locality.world.fact_key !== world.key ||
    r.data.locality.locus.fact_key !== locus.key ||
    production.version !== 1 ||
    op.data.status.state !== "IN_PROGRESS" ||
    !timeEquals(op.data.timing.started_at, clock.at)
  )
    return undefined;

  const order = workshopRef(institution);
  const start = workshopRef(production);
  const value: WorkshopCharter = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    profile_pin_sha256: profile.sha256,
    opening_basis: start,
    order,
    institution: order,
    office: workshopRef(office),
    scope: workshopRef(scope),
    world: workshopRef(world),
    locus: workshopRef(locus),
    attendant_existence: workshopRef(actor),
    attendant_post: workshopRef(post),
    designated_pc_binding: workshopRef(binding),
    production_operation: start,
    power: "ISSUE_ONE_STANDING_COMPLETION_DIRECTION",
    operative_effect: "authority_grant",
    validity_by_order: [{ governing_order_ref: order, validity_status: "valid" }],
    lifecycle_status: "active",
    adopted_at: { at: op.data.timing.started_at, journal_revision: view.revision },
    policy: workshopPolicy(WORKSHOP_CHARTER_RULE, historyId),
  };
  return workshopGroup(
    view,
    WORKSHOP_CHARTER_RULE,
    OWNER_GIP,
    FACET_GIP_COMPLETION_DIRECTION,
    [{ key: workshopCharterKey(view.campaign_id), value, expected_version: 0 }],
    [
      institution,
      office,
      scope,
      world,
      locus,
      actor,
      post,
      production,
      binding,
      clock.fact,
      reserve,
      temporal,
    ],
  );
}

export function deriveWorkshopInstruction(
  view: WorkshopView,
  historyId: string,
): CommitGroup | undefined {
  const charter = view.get(workshopCharterKey(view.campaign_id));
  const parsed = WorkshopCharterSchema.safeParse(charter?.value);
  const clock = workshopClock(view);
  if (!charter || !parsed.success || !clock) return undefined;
  const {
    order,
    institution,
    office,
    scope,
    world,
    locus,
    attendant_existence,
    attendant_post,
    designated_pc_binding,
    production_operation,
    validity_by_order,
    adopted_at,
  } = parsed.data;
  const refs = [
    order,
    institution,
    office,
    scope,
    world,
    locus,
    attendant_existence,
    attendant_post,
    designated_pc_binding,
    production_operation,
  ];
  const facts = refs.flatMap((ref) => {
    const fact = view.get(ref.key);
    return workshopMatches(fact, ref) ? [fact] : [];
  });
  const o = OfficeAuthorityLocusHolderSchema.safeParse(view.get(office.key)?.value);
  const b = PlayerCharacterBindingSchema.safeParse(view.get(designated_pc_binding.key)?.value);
  if (
    facts.length !== refs.length ||
    !o.success ||
    !b.success ||
    !timeEquals(clock.at, adopted_at.at)
  )
    return undefined;
  const instruction_id = sha256Canonical([
    view.campaign_id,
    production_operation.key,
    b.data.active_pc.entity_id,
  ]);
  const value: WorkshopInstruction = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    institution_id: o.data.institution_id,
    office_id: o.data.office_id,
    instruction_id,
    holder: o.data.holder_ref,
    order,
    institution,
    office,
    scope,
    world,
    locus,
    attendant_existence,
    attendant_post,
    designated_pc_binding,
    production_operation,
    validity_by_order,
    charter: workshopRef(charter),
    operative_effect: "administrative_direction",
    lifecycle_status: "active",
    issued: { at: clock.at, journal_revision: view.revision },
    access_scope: WORKSHOP_MONITOR,
    disclosure_scope: WORKSHOP_DISCLOSURE,
    policy: workshopPolicy(WORKSHOP_INSTRUCTION_RULE, historyId),
  };
  return workshopGroup(
    view,
    WORKSHOP_INSTRUCTION_RULE,
    OWNER_GIP,
    FACET_GIP_COMPLETION_DIRECTION,
    [{ key: workshopInstructionKey(view.campaign_id, instruction_id), value, expected_version: 0 }],
    [charter, ...facts, clock.fact],
  );
}

export function workshopInstructionValidity(
  view: WorkshopView,
  issued: { readonly version: number; readonly key: string },
): "VALID" | "ENDED" | "UNRESOLVED" {
  const head = view.get(issued.key);
  const i = WorkshopInstructionSchema.safeParse(head?.value);
  if (!head || !i.success) return "UNRESOLVED";
  if (i.data.lifecycle_status === "terminated") return "ENDED";
  if (head.version !== issued.version) return "UNRESOLVED";
  for (const ref of [
    i.data.charter,
    i.data.office,
    i.data.scope,
    i.data.attendant_post,
    i.data.attendant_existence,
    i.data.designated_pc_binding,
  ]) {
    const fact = view.get(ref.key);
    if (!fact) return "UNRESOLVED";
    if (!workshopMatches(fact, ref)) return "ENDED";
  }
  const fact = view.get(i.data.production_operation.key);
  const value = fact?.value;
  if (typeof value !== "object" || value === null || !("status" in value)) return "UNRESOLVED";
  const status = ProductionOperationSchema.shape.status.safeParse(value["status"]);
  if (!status.success || status.data.state !== "IN_PROGRESS") return "UNRESOLVED";
  if (!canonicalEqual(i.data.validity_by_order[0].governing_order_ref, i.data.order))
    return "UNRESOLVED";
  return "VALID";
}

export interface WorkshopOfficeRevocationSource {
  /** Resolves and authenticates the original holder act under the GIP source policy. */
  authorize(
    view: WorkshopView,
    instruction: import("@immortalis/contracts").OwnerFact,
    requestId: string,
  ): readonly import("@immortalis/contracts").OwnerFact[] | undefined;
}

export function deriveWorkshopRevocation(
  view: WorkshopView,
  instructionKey: string,
  requestId: string,
  source?: WorkshopOfficeRevocationSource,
) {
  if (!Sha256.safeParse(requestId).success) return undefined;
  const instruction = view.get(instructionKey);
  const parsed = WorkshopInstructionSchema.safeParse(instruction?.value);
  if (!instruction || !parsed.success || parsed.data.lifecycle_status !== "active")
    return undefined;
  const office = view.get(parsed.data.office.key);
  const holder = OfficeAuthorityLocusHolderSchema.safeParse(office?.value);
  if (
    !office ||
    !holder.success ||
    !workshopMatches(office, parsed.data.office) ||
    holder.data.holder_ref !== parsed.data.holder
  )
    return undefined;
  const evidence = source?.authorize(view, instruction, requestId);
  if (!evidence?.length || !evidence.every((f) => workshopMatches(view.get(f.key), workshopRef(f))))
    return undefined;
  const value: WorkshopInstruction = {
    ...parsed.data,
    lifecycle_status: "terminated",
    revoking_act_sha256: sha256Canonical([
      parsed.data.holder,
      instruction.key,
      instruction.version,
      requestId,
    ]),
  };
  const group = workshopGroup(
    view,
    WORKSHOP_INSTRUCTION_RULE,
    OWNER_GIP,
    FACET_GIP_COMPLETION_DIRECTION,
    [{ key: instruction.key, expected_version: instruction.version, value }],
    [instruction, office, ...evidence],
  );
  return { ...group, cause: `workshop-revocation:${requestId}` };
}

export class WorkshopGipAdapter {
  readonly #store: CampaignStore;
  readonly #profile: WorkshopFixtureIdentity;
  readonly #historyId: string;
  constructor(store: CampaignStore, profile: WorkshopFixtureIdentity, historyId: string) {
    this.#store = store;
    this.#profile = profile;
    this.#historyId = historyId;
  }

  adoptCharter(input: WorkshopCharterInputs) {
    const plan = deriveWorkshopCharter(
      workshopView(this.#store),
      input,
      this.#profile,
      this.#historyId,
    );
    return plan ? this.#store.commit(plan) : undefined;
  }

  revokeInstruction(
    instructionKey: string,
    requestId: string,
    source?: WorkshopOfficeRevocationSource,
  ) {
    const plan = deriveWorkshopRevocation(
      workshopView(this.#store),
      instructionKey,
      requestId,
      source,
    );
    return plan ? this.#store.commit(plan) : undefined;
  }

  issueInstruction() {
    const plan = deriveWorkshopInstruction(workshopView(this.#store), this.#historyId);
    return plan ? this.#store.commit(plan) : undefined;
  }
}
