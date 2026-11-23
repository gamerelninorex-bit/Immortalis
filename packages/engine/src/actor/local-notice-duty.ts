// Named Actor owns the original seeded standing duty.
import {
  FACET_ACTOR_PROFILE,
  NamedActorExistenceBasisSchema,
  OWNER_NAMED_ACTOR,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  timeEquals,
} from "@immortalis/contracts";
import {
  WorkshopInstructionSchema,
  workshopDutyKey,
  type WorkshopDuty,
} from "@immortalis/contracts";
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
import { WORKSHOP_DUTY_RULE, type WorkshopFixtureIdentity } from "../workshop/source.ts";
import { workshopInstructionValidity } from "../gip/completion-direction.ts";

export function deriveWorkshopDuty(
  view: WorkshopView,
  instructionKey: string,
  profile: WorkshopFixtureIdentity,
  historyId: string,
) {
  const instruction = view.get(instructionKey);
  const issued = WorkshopInstructionSchema.safeParse(instruction?.value);
  const clock = workshopClock(view);
  if (
    !instruction ||
    !issued.success ||
    !clock ||
    !timeEquals(clock.at, issued.data.issued.at) ||
    workshopInstructionValidity(view, instruction) !== "VALID"
  )
    return undefined;
  const i = issued.data;
  const actor = view.get(i.attendant_existence.key);
  const locus = view.get(i.locus.key);
  const binding = view.get(i.designated_pc_binding.key);
  const office = view.get(i.office.key);
  const scope = view.get(i.scope.key);
  const a = NamedActorExistenceBasisSchema.safeParse(actor?.value);
  const l = WorldLocusSchema.safeParse(locus?.value);
  const b = PlayerCharacterBindingSchema.safeParse(binding?.value);
  if (
    !actor ||
    !locus ||
    !binding ||
    !office ||
    !scope ||
    !a.success ||
    !l.success ||
    !b.success ||
    !workshopMatches(actor, i.attendant_existence) ||
    !workshopMatches(locus, i.locus)
  )
    return undefined;
  const value: WorkshopDuty = {
    schema_version: 1,
    duty_id: i.instruction_id,
    campaign_id: view.campaign_id,
    attendant_id: a.data.actor_id,
    attendant_existence: i.attendant_existence,
    issued_instruction: workshopRef(instruction),
    issuer: { issuer_id: i.office_id, authority: i.office, supporting_scope: [i.scope] },
    world_id: l.data.world.entity_id,
    locus_id: l.data.locus_id,
    locus: i.locus,
    production_operation: i.production_operation,
    intended_pc_id: b.data.active_pc.entity_id,
    pc_binding: i.designated_pc_binding,
    issued: i.issued,
    admitted: { at: clock.at, journal_revision: view.revision },
    access_scope: i.access_scope,
    disclosure_scope: i.disclosure_scope,
    lifetime: { consumption: "ONE_MATCHING_OCCURRENCE", source_terms: workshopRef(instruction) },
    acceptance_basis: "SEEDED_STANDING_POST_DUTY",
    profile_pin_sha256: profile.sha256,
    policy: workshopPolicy(WORKSHOP_DUTY_RULE, historyId),
  };
  return workshopGroup(
    view,
    WORKSHOP_DUTY_RULE,
    OWNER_NAMED_ACTOR,
    FACET_ACTOR_PROFILE,
    [{ key: workshopDutyKey(value.attendant_id, value.duty_id), value, expected_version: 0 }],
    [instruction, actor, locus, binding, office, scope, clock.fact],
  );
}

export class WorkshopNamedActorAdapter {
  readonly #store: CampaignStore;
  readonly #profile: WorkshopFixtureIdentity;
  readonly #historyId: string;
  constructor(store: CampaignStore, profile: WorkshopFixtureIdentity, historyId: string) {
    this.#store = store;
    this.#profile = profile;
    this.#historyId = historyId;
  }
  seedDuty(instructionKey: string) {
    const plan = deriveWorkshopDuty(
      workshopView(this.#store),
      instructionKey,
      this.#profile,
      this.#historyId,
    );
    return plan ? this.#store.commit(plan) : undefined;
  }
}
