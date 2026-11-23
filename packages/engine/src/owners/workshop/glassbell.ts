// World-State owns objective workshop exposure.
import {
  FACET_WORLD_LOCUS,
  OWNER_WORLD_STATE,
  PcPhysicalLocusCustodySchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  TEMPORAL_ORIGIN_KEY,
  TemporalOriginSchema,
  pcExistenceContractKey,
  timeEquals,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import {
  WORKSHOP_SECOND,
  workshopExposureKey,
  type WorkshopGlassbellExposure,
} from "../../../../contracts/src/workshop-opening.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import {
  workshopClock,
  workshopGroup,
  workshopPolicy,
  workshopRef,
  workshopView,
  type WorkshopView,
} from "./publication.ts";
import { WORKSHOP_EXPOSURE_RULE, type WorkshopFixtureIdentity } from "./source.ts";

export function workshopHost(view: WorkshopView) {
  const binding = view.get(PLAYER_CHARACTER_BINDING_KEY);
  const b = PlayerCharacterBindingSchema.safeParse(binding?.value);
  if (!binding || !b.success) return undefined;
  const pc = b.data.active_pc.entity_id;
  const host = view.get(pcExistenceContractKey(pc));
  const placement = view.get(worldPcLocusCustodyKey(pc));
  const custody = PcPhysicalLocusCustodySchema.safeParse(placement?.value);
  if (
    !host ||
    !placement ||
    !custody.success ||
    custody.data.pc_id !== pc ||
    custody.data.basis.pinned_versions.pc !== host.version ||
    custody.data.basis.pinned_versions.binding !== binding.version
  )
    return undefined;
  const { world, locus } = custody.data.stationary_locus;
  const worldFact = view.get(world.fact_key);
  const locusFact = view.get(locus.fact_key);
  if (!worldFact || !locusFact) return undefined;
  return {
    pc,
    binding,
    host,
    placement,
    world: worldFact,
    locus: locusFact,
    worldId: world.entity_id,
    locusId: locus.entity_id,
  };
}

export function deriveWorkshopExposure(
  view: WorkshopView,
  profile: WorkshopFixtureIdentity,
  historyId: string,
) {
  const subject = workshopHost(view);
  const clock = workshopClock(view);
  const origin = view.get(TEMPORAL_ORIGIN_KEY);
  const o = TemporalOriginSchema.safeParse(origin?.value);
  if (
    !profile.glassbell ||
    !subject ||
    !clock ||
    !origin ||
    !o.success ||
    clock.at.unit !== WORKSHOP_SECOND ||
    !timeEquals(clock.at, o.data.origin) ||
    o.data.chronology.grade !== "ORIGINAL_MESSAGE_VERIFIED"
  )
    return undefined;
  const value: WorkshopGlassbellExposure = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    pc_id: subject.pc,
    host_ref: workshopRef(subject.host),
    world: workshopRef(subject.world),
    locus: workshopRef(subject.locus),
    pc_binding: workshopRef(subject.binding),
    placement: workshopRef(subject.placement),
    at: { at: clock.at, journal_revision: view.revision },
    world_condition: "GLASSBELL_FIELD_V1",
    policy: workshopPolicy(WORKSHOP_EXPOSURE_RULE, historyId),
  };
  return workshopGroup(
    view,
    WORKSHOP_EXPOSURE_RULE,
    OWNER_WORLD_STATE,
    FACET_WORLD_LOCUS,
    [{ key: workshopExposureKey(subject.worldId, subject.pc), value, expected_version: 0 }],
    [
      subject.host,
      subject.world,
      subject.locus,
      subject.binding,
      subject.placement,
      clock.fact,
      origin,
    ],
  );
}

export class WorkshopGlassbellAdapter {
  readonly #store: CampaignStore;
  readonly #profile: WorkshopFixtureIdentity;
  readonly #historyId: string;
  constructor(store: CampaignStore, profile: WorkshopFixtureIdentity, historyId: string) {
    this.#store = store;
    this.#profile = profile;
    this.#historyId = historyId;
  }
  establishExposure() {
    const plan = deriveWorkshopExposure(workshopView(this.#store), this.#profile, this.#historyId);
    return plan ? this.#store.commit(plan) : undefined;
  }
}
