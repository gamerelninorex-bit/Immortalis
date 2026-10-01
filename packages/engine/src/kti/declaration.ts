import {
  BoundaryIndexSchema,
  KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE,
  KTI_RESULT_CLOSE,
  KtiTransferBasisSchema,
  OWNER_KTI,
  READ_MODE_CLOSE,
  READ_MODE_NOW,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  compareTime,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  temporalObjectKey,
  type DependencyDeclaration,
  type KtiTransferBasis,
  type TemporalObject,
  type TemporalReadDeclaration,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { epistemicPacketRead, packetOfKey } from "../epistemic/declaration.ts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders and the registration rule for the KTI side of the temporal declaration (RC-10 dependency declarations; KTI v2.2
 * Candidate v0.2 §4.2; F-014D §2.1 R-T1; F-017 §3 CLOSE). A Transfer Package result is published only when a dependent
 * consequence materially requires it, so its one stage is declared INSIDE the engaged object of that consequence, ahead of
 * it: the KTI owner's stage reads its committed basis and development object and the already-sealed packet — AS-OF-NOW,
 * after packet formation (the packet is committed before the basis can be) — and commits the package at the KTI result
 * close; the consequence reads the package only AS-OF-DECLARED-CLOSE, naming that close, so it cannot resolve before it and
 * observes the committed close itself. There is no standalone KTI object, boundary, tick, scheduler or sweep.
 */

const ID = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const KEY_SPACES = {
  object: new RegExp(`^kti/object/(${ID})$`),
  basis: new RegExp(`^kti/transfer/(${ID})/basis$`),
  package: new RegExp(`^kti/transfer/(${ID})/package$`),
} as const;

/** The package identity a KTI package key names, or null. */
export const packageOfKey = (key: string): string | null => {
  const m = KEY_SPACES.package.exec(key);
  return m ? m[1]! : null;
};

const ktiNowRead = (key: string): TemporalReadDeclaration => ({
  mode: READ_MODE_NOW,
  source: { owner: OWNER_KTI, fact_key: key },
  invalidators: [{ fact_key: key }],
});

/**
 * The one stage whose commit is the KTI result close of one Transfer Package: it reads its sealed basis (NOW), the sealed
 * F-014D packet the basis rests on (NOW, after packet formation — the F-014D → KTI cut) and the development object (NOW),
 * and writes the package. It declares the KTI result close (F-017 §3 CLOSE). Null when the basis does not name a packet.
 */
export function ktiTransferDeclaration(basis: KtiTransferBasis): DependencyDeclaration | null {
  const target = packetOfKey(basis.packet.fact_key);
  if (!target) return null;
  return {
    stage: ktiTransferStage(basis.package_id),
    reads: [
      ktiNowRead(ktiTransferBasisKey(basis.package_id)),
      epistemicPacketRead(target.eventId, target.recipientId),
      ktiNowRead(basis.development_object.fact_key),
    ],
    produces: [ktiTransferPackageKey(basis.package_id)],
    declares_close: { name: KTI_RESULT_CLOSE },
  };
}

/**
 * The only read a cross-owner consumer may declare of a Transfer Package: AS-OF-DECLARED-CLOSE, naming the KTI owner's
 * declared result close (KTI v0.2 §4.2: "every KTI-owned fact that F-014D may read is declared by KTI AS-OF-DECLARED-CLOSE;
 * Close Basis = KTI result close, including … active Transfer Package state"; KTI-DIP-STAGE-02 fallback).
 */
export function ktiResultCloseRead(packageId: string): TemporalReadDeclaration {
  const key = ktiTransferPackageKey(packageId);
  return {
    mode: READ_MODE_CLOSE,
    source: { owner: OWNER_KTI, fact_key: key },
    close_basis: {
      name: KTI_RESULT_CLOSE,
      producer: { owner: OWNER_KTI, operation: KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE },
    },
    invalidators: [{ fact_key: key }],
  };
}

/**
 * RC-10 / KTI v0.2 §4.2 registration rule for every object that touches the KTI key spaces or owner. Applies at
 * registration and at load, so a hand-written object cannot smuggle a different stage, a NOW read of a package, a read of
 * the uncommitted basis or development object, or a KTI-owned engagement:
 *
 *  - no object is owned by the KTI owner (a result is published only inside the object of the dependent consequence that
 *    materially requires it);
 *  - every KTI stage is exactly the declaration derived from a COMMITTED, valid transfer basis (so a consequence can never
 *    conjure a transfer: without a committed basis there is nothing to declare);
 *  - the basis and the development object are read only by that stage; every other read of a KTI fact is the package,
 *    AS-OF-DECLARED-CLOSE naming the KTI result close — never AS-OF-NOW, so a same-resolution KTI consequence is never
 *    visible to a reader in its own resolution (the cycle cut: F-014D packet formation → KTI consequence write → KTI result
 *    close → any later lawful read);
 *  - no stage outside the KTI owner declares that it produces a KTI key;
 *  - at registration, a result close is declared by exactly one engaged object per instant (an IM-02 rule: a stage is
 *    declared by exactly one engaged object): another consequence due at the same instant reads the close
 *    AS-OF-DECLARED-CLOSE and declares no second stage. Checked against the active boundary index by identity.
 */
export function ktiObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  if (o.owning_ref.owner === OWNER_KTI) {
    return "a KTI result is published only inside the engaged object of a dependent consequence: there is no standalone KTI object";
  }
  for (const d of o.dependencies) {
    const isKti = d.stage.owner_operation.owner === OWNER_KTI;
    if (!isKti) {
      if (d.produces.some((k) => k.startsWith("kti/"))) {
        return "only the KTI owner's stage produces a KTI fact";
      }
    } else {
      if (d.stage.owner_operation.operation !== KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE) {
        return "the KTI owner declares exactly one stage: the transfer result close";
      }
      const packageId = packageOfKey(d.stage.prospective_result_id);
      const basisFact = packageId ? state.facts.get(ktiTransferBasisKey(packageId)) : undefined;
      const basis = basisFact ? KtiTransferBasisSchema.safeParse(basisFact.value) : undefined;
      if (!packageId || !basisFact || !basis?.success || basisFact.owner !== OWNER_KTI) {
        return "a KTI result close is declared only for a committed transfer basis: a consequence cannot create the transfer it needs";
      }
      const expected = ktiTransferDeclaration(basis.data);
      if (!expected || !canonicalEqual(d, expected)) {
        return "a KTI stage is exactly the declaration derived from its transfer basis";
      }
    }
    for (const r of d.reads) {
      if (r.source.owner !== OWNER_KTI && !r.source.fact_key.startsWith("kti/")) continue;
      if (r.source.owner !== OWNER_KTI) return "a KTI key space is read as its owner's fact";
      if (KEY_SPACES.basis.test(r.source.fact_key) || KEY_SPACES.object.test(r.source.fact_key)) {
        if (!isKti) {
          return "the transfer basis and the development object are not cross-owner reads: Transfer Package state is visible only at the KTI result close";
        }
      } else {
        const id = packageOfKey(r.source.fact_key);
        if (!id || isKti) {
          return "a read of a KTI key space names the package, its basis or its development object";
        }
        if (!canonicalEqual(r, ktiResultCloseRead(id))) {
          return "a KTI Transfer Package is read only AS-OF-DECLARED-CLOSE, naming the KTI result close";
        }
      }
    }
  }
  return registered ? duplicateCloseViolation(o, state) : null;
}

/** Another engaged object due at the same instant that already declares one of this object's KTI result closes. */
function duplicateCloseViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
): string | null {
  if (!o.next_boundary) return null;
  const mine = o.dependencies.filter((d) => d.stage.owner_operation.owner === OWNER_KTI);
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
      return "a KTI result close is declared by exactly one engaged object per instant: another consequence due at that instant already declares it, so this one reads it AS-OF-DECLARED-CLOSE without declaring a second stage";
    }
  }
  return null;
}
