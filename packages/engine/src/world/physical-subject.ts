import {
  FallbackPhysicalEntitySchema,
  PcPhysicalLocusCustodySchema,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type FallbackPhysicalEntity,
  type LocusRef,
  type PcPhysicalLocusCustody,
} from "@immortalis/contracts";

/**
 * The physical subject a single-leg movement moves (frozen Post-Handover Physical Locus Ownership contract §10, §11): the
 * narrow, owner-specific physical-subject admission from World-State's custody into the EXISTING Transfer Record lifecycle and
 * the EXISTING ECT-01 same-entity transition. Exactly two World-State records can serve, each as its owner's own record:
 *
 *  - `FALLBACK_ENTITY`: a Production-accepted fallback physical entity (unchanged, the predecessor behavior);
 *  - `ACTIVE_PC`: the active PC's one stationary physical-locus custody record, the continuing PC reference.
 *
 * Both reduce to the same three things Logistics and ECT-01 need and nothing more: the continuing identity, the one slot key of
 * the record, and the locus it stationarily holds. Nothing here creates, copies or owns an identity: Logistics still holds the
 * subject by REFERENCE, and no fallback entity is ever manufactured for a PC.
 */
export type PhysicalSubjectKind = "FALLBACK_ENTITY" | "ACTIVE_PC";

export interface PhysicalSubject {
  readonly kind: PhysicalSubjectKind;
  readonly entity_id: string;
  /** the one slot key of the record that holds the subject in World-State */
  readonly key: string;
  /** the stationary locus the record holds: history that stays true once the subject has moved */
  readonly locality: LocusRef;
}

export type PhysicalSubjectValue = FallbackPhysicalEntity | PcPhysicalLocusCustody;

/** Reduces a typed subject record to what Logistics and ECT-01 read. */
export function physicalSubjectOf(value: PhysicalSubjectValue): PhysicalSubject {
  if ("pc_id" in value) {
    return {
      kind: "ACTIVE_PC",
      entity_id: value.pc_id,
      key: worldPcLocusCustodyKey(value.pc_id),
      locality: value.stationary_locus,
    };
  }
  return {
    kind: "FALLBACK_ENTITY",
    entity_id: value.entity_id,
    key: worldFallbackEntityKey(value.locality.world.entity_id, value.entity_id),
    locality: value.locality,
  };
}

/** Parses a fact value as one of the two subject records, or undefined (a fallback entity is tried first). */
export function parsePhysicalSubject(value: unknown): PhysicalSubjectValue | undefined {
  const fallback = FallbackPhysicalEntitySchema.safeParse(value);
  if (fallback.success) return fallback.data;
  const custody = PcPhysicalLocusCustodySchema.safeParse(value);
  return custody.success ? custody.data : undefined;
}

/** Whether `key` is the slot of a subject record for this identity in this world (either kind). */
export const isPhysicalSubjectKey = (key: string, worldId: string, entityId: string): boolean =>
  key === worldFallbackEntityKey(worldId, entityId) || key === worldPcLocusCustodyKey(entityId);

/** Whether a subject slot key is the active PC's custody slot. */
export const isPcSubjectKey = (key: string, entityId: string): boolean =>
  key === worldPcLocusCustodyKey(entityId);
