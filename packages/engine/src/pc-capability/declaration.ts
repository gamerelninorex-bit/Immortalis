import {
  BoundaryIndexSchema,
  FACET_PC_CAPABILITY_PROFILE,
  OWNER_PC_EXISTENCE,
  PC_CAPABILITY_CLOSE,
  PC_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  PcCapabilityBasisSchema,
  READ_MODE_CLOSE,
  READ_MODE_NOW,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  compareTime,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  temporalObjectKey,
  type DependencyDeclaration,
  type PcCapabilityBasis,
  type TemporalObject,
  type TemporalReadDeclaration,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders and the registration rule for the PC capability side of the temporal declaration (RC-10 dependency
 * declarations; WS-016 §27, §27.1; F-016 PCC-02/PCC-03; F-017 §3 CLOSE). A PC capability becomes authoritative for
 * later causal resolution only at the PC Capability Close, so its one stage is declared INSIDE the engaged object of
 * the dependent consequence, ahead of it: the PC owner's close stage commits the capability, and the consequence reads
 * it AS-OF-DECLARED-CLOSE and cannot resolve before it. There is no standalone PC capability object, boundary, tick or
 * sweep: with no consequence engaged, no capability is ever resolved.
 */

const ID = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const BASIS_KEY = new RegExp(`^pc/${ID}/capability-basis/${ID}$`);
const CAPABILITY_KEY = new RegExp(`^pc/(${ID})/capability/(${ID})$`);

/** The PC and capability a PC capability close stage names (from its prospective result identity), or null. */
export const pcCapabilityOfKey = (key: string): { pcId: string; capabilityId: string } | null => {
  const m = CAPABILITY_KEY.exec(key);
  return m ? { pcId: m[1]!, capabilityId: m[2]! } : null;
};

/** True for a key in either PC capability key space (never the Existence Contract's own key). */
export const isPcCapabilityKey = (key: string): boolean =>
  BASIS_KEY.test(key) || CAPABILITY_KEY.test(key);

/** The one stage whose commit is the PC Capability Close of one PC/capability: reads its basis, writes the capability. */
export function pcCapabilityDeclaration(basis: PcCapabilityBasis): DependencyDeclaration {
  const basisKey = pcCapabilityBasisKey(basis.pc_id, basis.capability_id);
  return {
    stage: pcCapabilityStage(basis.pc_id, basis.capability_id),
    reads: [
      {
        mode: READ_MODE_NOW,
        source: { owner: OWNER_PC_EXISTENCE, fact_key: basisKey },
        invalidators: [{ fact_key: basisKey }],
      },
    ],
    produces: [pcCapabilityKey(basis.pc_id, basis.capability_id)],
    declares_close: { name: PC_CAPABILITY_CLOSE },
  };
}

/**
 * The only read a cross-owner consumer may declare of a PC capability: AS-OF-DECLARED-CLOSE, naming the PC owner's
 * declared PC Capability Close (WS-016 §27.1; F-016 PCC-03).
 */
export function pcCapabilityCloseRead(pcId: string, capabilityId: string): TemporalReadDeclaration {
  const key = pcCapabilityKey(pcId, capabilityId);
  return {
    mode: READ_MODE_CLOSE,
    source: { owner: OWNER_PC_EXISTENCE, fact_key: key },
    close_basis: {
      name: PC_CAPABILITY_CLOSE,
      producer: { owner: OWNER_PC_EXISTENCE, operation: PC_OPERATION_PUBLISH_CAPABILITY_CLOSE },
    },
    invalidators: [{ fact_key: key }],
  };
}

/**
 * RC-10 / WS-016 §27.1 registration rule for every object that touches the PC capability key spaces or stage. Applies at
 * registration and at load, so a hand-written object cannot smuggle a different stage, a NOW read of a capability, a
 * read of the uncommitted basis or a PC-owned engagement:
 *
 *  - no object touching the PC capability is owned by the PC owner (a capability is resolved only inside the object of the
 *    dependent consequence that materially requires it);
 *  - every PC capability stage is exactly the declaration derived from a COMMITTED, valid basis (so a consequence can
 *    never conjure a capability: without a committed basis there is nothing to declare);
 *  - the basis is read only by that stage; every other read of a PC capability is AS-OF-DECLARED-CLOSE naming the PC
 *    owner's declared close — never AS-OF-NOW, and never the basis, so an uncommitted fact is not visible;
 *  - no stage outside the PC owner's capability close declares that it produces a PC capability key;
 *  - at registration, a PC Capability Close is declared by exactly one engaged object per instant (an IM-02 rule: a
 *    stage is declared by exactly one engaged object): another consequence due at the same instant reads the close
 *    AS-OF-DECLARED-CLOSE and declares no second stage. Checked against the active boundary index by identity.
 *
 * The Existence Contract's own key and every other pc/ read are untouched by this rule.
 */
export function pcCapabilityObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  const touches = o.dependencies.some(
    (d) =>
      isPcCapabilityStage(d) ||
      d.produces.some(isPcCapabilityKey) ||
      d.reads.some((r) => isPcCapabilityKey(r.source.fact_key)),
  );
  if (touches && o.owning_ref.owner === OWNER_PC_EXISTENCE) {
    return "a PC capability is resolved only inside the engaged object of a dependent consequence: there is no standalone PC capability object";
  }
  for (const d of o.dependencies) {
    const isPcStage = isPcCapabilityStage(d);
    if (!isPcStage) {
      if (d.produces.some(isPcCapabilityKey)) {
        return "only the PC owner's capability close stage produces a PC capability fact";
      }
    } else {
      if (d.stage.owner_operation.operation !== PC_OPERATION_PUBLISH_CAPABILITY_CLOSE) {
        return "the PC capability facet declares exactly one stage: the PC Capability Close";
      }
      const target = pcCapabilityOfKey(d.stage.prospective_result_id);
      const basisFact = target
        ? state.facts.get(pcCapabilityBasisKey(target.pcId, target.capabilityId))
        : undefined;
      const basis = basisFact ? PcCapabilityBasisSchema.safeParse(basisFact.value) : undefined;
      if (
        !target ||
        !basisFact ||
        !basis?.success ||
        basisFact.owner !== OWNER_PC_EXISTENCE ||
        basisFact.facet !== FACET_PC_CAPABILITY_PROFILE
      ) {
        return "a PC Capability Close is declared only for a committed received basis: a consequence cannot create the capability it needs";
      }
      if (!canonicalEqual(d, pcCapabilityDeclaration(basis.data))) {
        return "a PC capability stage is exactly the declaration derived from its received basis";
      }
    }
    for (const r of d.reads) {
      if (BASIS_KEY.test(r.source.fact_key)) {
        if (!isPcStage) {
          return "the received basis is not a cross-owner read: a PC capability is visible only at the PC Capability Close";
        }
      } else if (CAPABILITY_KEY.test(r.source.fact_key)) {
        const target = pcCapabilityOfKey(r.source.fact_key)!;
        const required = pcCapabilityCloseRead(target.pcId, target.capabilityId);
        if (!canonicalEqual(r, required)) {
          return "a PC capability is read only AS-OF-DECLARED-CLOSE, naming the PC Capability Close";
        }
      }
    }
  }
  return registered ? duplicateCloseViolation(o, state) : null;
}

const isPcCapabilityStage = (d: DependencyDeclaration): boolean =>
  d.stage.owner_operation.owner === OWNER_PC_EXISTENCE;

/** Another engaged object due at the same instant that already declares one of this object's PC Capability Closes. */
function duplicateCloseViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
): string | null {
  if (!o.next_boundary) return null;
  const mine = o.dependencies.filter(isPcCapabilityStage);
  if (mine.length === 0) return null;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = indexFact ? BoundaryIndexSchema.safeParse(indexFact.value) : undefined;
  if (!index?.success) return null;
  for (const entry of index.data.entries) {
    if (entry.object_id === o.object_id || compareTime(entry.at, o.next_boundary.at) !== 0)
      continue;
    const other = state.facts.get(temporalObjectKey(entry.object_id));
    const parsed = other ? TemporalObjectSchema.safeParse(other.value) : undefined;
    if (
      parsed?.success &&
      parsed.data.dependencies.some((d) => mine.some((m) => canonicalEqual(m.stage, d.stage)))
    ) {
      return "a PC Capability Close is declared by exactly one engaged object per instant: another consequence due at that instant already declares it, so this one reads it AS-OF-DECLARED-CLOSE without declaring a second stage";
    }
  }
  return null;
}
