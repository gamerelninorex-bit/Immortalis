import {
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  CANON_WRITE_AUTHORITY,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  MODE_BROADCAST_EXPOSURE,
  PublicationSchema,
  fail,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  type CommitGroup,
  type KtiDevelopmentObject,
  type KtiTransferBasis,
  type KtiTransferPackage,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind, type FactKindId } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { provenanceKeyOfPacket } from "./derive.ts";

export type KtiErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  /** an unlowered BROADCAST_EXPOSURE is never receipt: it fails closed and is never approximated by recipient copying */
  | "BROADCAST_EXPOSURE_UNSUPPORTED";

/**
 * What a caller supplies for an authored publication: identities and a basis label. The access class is never the
 * caller's: KTI development workflow state is engine-side, so the owner stamps it itself.
 */
export type KtiPublication = Omit<Publication, "secrecy">;

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/**
 * IM-09 KTI — the authored path of the KTI owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority, a secrecy class
 * or a governing rule: those come from the specification-backed registry, and the publication is made by the archivist
 * path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly TWO authored
 * publications: one development-object identity, and one Transfer Package basis resting on that object and one sealed
 * F-014D packet. The active Transfer Package is NOT a method here: it is the `ktiTransferResultCloseProvider` operation the
 * IM-02 coordinator resolves as the owner's declared result close, inside the engaged object of the dependent consequence
 * that materially requires it. There is no package writer, no setter, no completion, retirement, competence, adoption or
 * reproduction method, no broadcast or cohort lowering, and no way to write an Epistemic, Named-Actor or other foreign
 * fact, so no caller can write KTI state out of order; the store's admission refuses it for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input
 * is refused as a conflict rather than silently reusing it. Nothing is re-rolled or improved: no randomness exists here.
 */
export class KtiAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits one development-object identity (Class A). It is KTI's own definition: it reads and depends on nothing foreign,
   * and creates no institution, actor, Population or world fact. It is create-only.
   */
  async establishDevelopmentObject(
    input: KtiPublication & { readonly object: unknown },
  ): Promise<Result<CommitOutcome, KtiErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const object = KtiDevelopmentObjectSchema.safeParse(input.object);
    if (!object.success)
      return fail("INPUT_INVALID", "development object failed validation", {
        issues: issues(object.error),
      });
    return this.#publish(
      p.data,
      "kti_development_object",
      ktiDevelopmentObjectKey(object.data.object_id),
      object.data,
      [],
      [],
    );
  }

  /**
   * Commits the sealed programme declaration of one managed Transfer Package. It rests on exactly three committed facts it
   * pins at their current versions (never copied): the development object, the sealed Accessible Content Packet and the
   * packet's sealed provenance. A request for a BROADCAST_EXPOSURE (or any audience/cohort scope) is refused: only a
   * BOUNDED_SHARED_ACCESS packet for one named recipient can support a transfer. The basis is create-only: one slot per
   * source × recipient × development-object programme. It is NOT the package: the package exists only at its result close.
   */
  async establishTransferBasis(
    input: KtiPublication & { readonly transfer: unknown },
  ): Promise<Result<CommitOutcome, KtiErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const mode = (input.transfer as { mode?: unknown } | null)?.mode;
    if (mode === MODE_BROADCAST_EXPOSURE) {
      return fail(
        "BROADCAST_EXPOSURE_UNSUPPORTED",
        "an unlowered BROADCAST_EXPOSURE is never receipt and creates no KTI state; it is never approximated by recipient copying or another path; nothing was established",
      );
    }
    const basis = KtiTransferBasisSchema.safeParse(input.transfer);
    if (!basis.success)
      return fail("INPUT_INVALID", "transfer basis failed validation", {
        issues: issues(basis.error),
      });
    const b = basis.data;
    const key = ktiTransferBasisKey(b.package_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const provenanceKey = provenanceKeyOfPacket(b.packet.fact_key);
      const pinned = [
        b.development_object.fact_key,
        b.packet.fact_key,
        ...(provenanceKey ? [provenanceKey] : []),
      ];
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
    }
    return this.#publish(p.data, "kti_transfer_basis", key, b, reads, depends_on);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The committed development object, or undefined. Owner-side: not a cross-owner read. */
  developmentObject(
    objectId: string,
  ): { fact: OwnerFact; value: KtiDevelopmentObject } | undefined {
    const fact = this.#store.getFact(ktiDevelopmentObjectKey(objectId));
    return fact ? { fact, value: KtiDevelopmentObjectSchema.parse(fact.value) } : undefined;
  }

  /** The sealed programme declaration, or undefined. Owner-side provenance: not a cross-owner read. */
  transferBasis(packageId: string): { fact: OwnerFact; value: KtiTransferBasis } | undefined {
    const fact = this.#store.getFact(ktiTransferBasisKey(packageId));
    return fact ? { fact, value: KtiTransferBasisSchema.parse(fact.value) } : undefined;
  }

  /**
   * The active Transfer Package as it stands at the KTI result close, with the group that committed the close; undefined
   * until the close has committed. A package that is not committed is never visible.
   */
  transferPackage(
    packageId: string,
  ): { fact: OwnerFact; value: KtiTransferPackage; close_group: string } | undefined {
    const fact = this.#store.getFact(ktiTransferPackageKey(packageId));
    return fact
      ? {
          fact,
          value: KtiTransferPackageSchema.parse(fact.value),
          close_group: fact.provenance.group_id,
        }
      : undefined;
  }

  async #publish(
    p: Publication,
    kindId: FactKindId,
    key: string,
    value: unknown,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, KtiErrorCode>> {
    const kind = factKind(kindId);
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: ACCESS_CLASS_KTI_ENGINE_SIDE,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }
}

const pick = (i: KtiPublication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: ACCESS_CLASS_KTI_ENGINE_SIDE,
});
