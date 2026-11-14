import {
  CANON_WRITE_AUTHORITY,
  OpeningAttestationSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  fail,
  ok,
  worldOpeningAttestationKey,
  type CanonicalTime,
  type CommitGroup,
  type GipOwnerHead,
  type OpeningAttestation,
  type OpeningSlice,
  type OpeningSliceKind,
  type OwnerFact,
  type Publication,
  type Result,
  type SliceProvenance,
  type SourceRef,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { gipOwnerHeadOfFacts, gipOwnerHeadOfState } from "../gip/owner-head.ts";
import { reject, type Rejection } from "./rejection.ts";

/**
 * Shared plumbing of the ROADBED first-profile freight lowering (R3-T25 §8: one integration owner controls the shared
 * contracts, admission and commit surfaces). It owns no fact and decides no rule: each owner module states its own derivation
 * once, and both that owner's authored operation and IM-11 admission evaluate the SAME derivation — the operation to build a
 * group, admission to re-derive it from committed state — so a committed freight fact is exactly what the committed upstream
 * facts determine, for a raw `store.commit` as much as for an adapter call.
 */

/** A committed-fact source: the current canonical cut a derivation reads. */
export interface FreightSource {
  getFact(key: string): OwnerFact | undefined;
  /** the campaign-wide GIP owner head at this cut (a derived monotone signature; see gip/owner-head.ts) */
  gipOwnerHead(): GipOwnerHead;
  /** the campaign revision of this cut */
  readonly revision: number;
}

export const stateSource = (state: CampaignState): FreightSource => ({
  getFact: (key) => state.facts.get(key),
  gipOwnerHead: () => gipOwnerHeadOfState(state),
  revision: state.revision,
});

/**
 * The same cut, read through a store. A store that exposes its canonical state object reuses the admission's own incremental
 * head; any other store is scanned once per revision (correct, and counted by `freightWorkCounters`).
 */
export const storeSource = (store: CampaignStore): FreightSource => {
  const state = store.canonicalState?.();
  return {
    getFact: (key) => {
      freightWorkCounters.ownerReads++;
      return store.getFact(key);
    },
    gipOwnerHead: () =>
      state ? gipOwnerHeadOfState(state) : gipOwnerHeadOfFacts(store.listFacts()),
    revision: store.head().revision,
  };
};

/** Deterministic work counters of the freight owner code (Engineering Acceptance §1A): reads and scans actually performed. */
export const freightWorkCounters = {
  /** exact-key owner reads made by freight operations through a store */
  ownerReads: 0,
  /** derivations evaluated (operation side and admission side) */
  derivations: 0,
  /** full GIP-owner scans (only when no incremental head exists for the state object) */
  gipHeadScans: 0,
  /** facts visited by those scans */
  gipHeadScannedFacts: 0,
  /** incremental GIP-owner head advances */
  gipHeadAdvances: 0,
};
export const resetFreightWorkCounters = (): void => {
  for (const k of Object.keys(freightWorkCounters) as (keyof typeof freightWorkCounters)[])
    freightWorkCounters[k] = 0;
};

export type FreightRefusalCode =
  /** a required committed fact is absent */
  | "PREREQUISITE_MISSING"
  /** a sealed source, digest, identity or reference does not match */
  | "SOURCE_REFUSED"
  /** the determinate rule does not select: a tie, a missing prerequisite, an unknown or unresolved owner state — nothing is fixed */
  | "WITHHELD"
  /** the act is refused because its guard, status or branch does not permit it at this cut */
  | "NOT_ADMISSIBLE"
  /** a branch whose source predicate is unresolved and is deliberately not implemented (positive F1; W4) */
  | "SOURCE_UNRESOLVED_WITHHELD";

export interface FreightRefusal {
  readonly code: FreightRefusalCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
export const refuse = (
  code: FreightRefusalCode,
  message: string,
  details?: Record<string, unknown>,
): { ok: false; error: FreightRefusal } => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

export interface PlannedWrite {
  readonly key: string;
  readonly value: unknown;
  readonly expected_version: number;
}

/** What one owner act writes and what it must pin at the cut it was derived against (absent keys are pinned at version 0). */
export interface FreightPlan {
  readonly writes: readonly PlannedWrite[];
  /** every key the derivation read: each is guarded at the version read (0 = owner-proven absence) */
  readonly reads: readonly string[];
}
export type Planned = Result<FreightPlan, FreightRefusalCode>;
export const planned = (writes: readonly PlannedWrite[], reads: readonly string[]): Planned =>
  ok({ writes, reads: [...new Set(reads)] });

const REJECTION_OF: Record<FreightRefusalCode, Rejection["code"]> = {
  PREREQUISITE_MISSING: "PREREQUISITE_MISSING",
  SOURCE_REFUSED: "REFERENCE_INVALID",
  WITHHELD: "REFERENCE_INVALID",
  NOT_ADMISSIBLE: "REFERENCE_INVALID",
  SOURCE_UNRESOLVED_WITHHELD: "VALUE_INVALID",
};

/**
 * IM-11: a group is admitted only when it is EXACTLY the owner's own derivation at this state — the same writes at the same
 * expected versions and values — and it pins every fact that derivation read at its current version (reads) and depends on
 * the group that committed it (depends_on). An absent key the derivation relied on must be pinned at version 0, so a
 * concurrent creator of that key defeats the group at commit (no phantom absence).
 */
export function checkPlan(
  group: CommitGroup,
  state: CampaignState,
  plan: Planned,
): Rejection | null {
  freightWorkCounters.derivations++;
  if (!plan.ok)
    return reject(REJECTION_OF[plan.error.code as FreightRefusalCode], plan.error.message, {
      freight_refusal: plan.error.code,
      ...(plan.error.details ?? {}),
    });
  const { writes, reads } = plan.value;
  if (group.writes.length !== writes.length)
    return reject(
      "VALUE_INVALID",
      "the group is not exactly the writes this owner act determines",
      {
        expected: writes.map((w) => w.key),
      },
    );
  for (const w of writes) {
    const actual = group.writes.find((g) => g.key === w.key);
    if (!actual)
      return reject("VALUE_INVALID", "the group omits a write this owner act determines", {
        key: w.key,
      });
    if (actual.expected_version !== w.expected_version)
      return reject(
        "VERSION_CONFLICT",
        "the write is not at the version this owner act determines",
        {
          key: w.key,
          expected: w.expected_version,
        },
      );
    if (!canonicalEqual(actual.value, w.value))
      return reject(
        "VALUE_INVALID",
        "the value is not what the committed owner facts determine: a caller cannot select the outcome",
        { key: w.key },
      );
  }
  for (const key of reads) {
    const fact = state.facts.get(key);
    const version = fact?.version ?? 0;
    if (!group.reads.some((r) => r.key === key && r.version === version))
      return reject(
        "REFERENCE_INVALID",
        "the group must read every fact its derivation relied on at its current version (0 for owner-proven absence)",
        { key, version },
      );
    if (fact && !group.depends_on.includes(fact.provenance.group_id))
      return reject(
        "REFERENCE_INVALID",
        "the group must depend on the group that committed a fact it read",
        {
          key,
          group_id: fact.provenance.group_id,
        },
      );
  }
  return null;
}

export type FreightErrorCode = StoreCommitErrorCode | FreightRefusalCode | "INPUT_INVALID";

/** Builds the one group of an owner act from its plan and publishes it by the archivist path. */
export async function publishPlan(
  store: CampaignStore,
  p: Publication,
  owner: string,
  facet: string,
  rule: SourceRef,
  plan: FreightPlan,
): Promise<Result<CommitOutcome, FreightErrorCode>> {
  const reads = plan.reads.map((key) => ({ key, version: store.getFact(key)?.version ?? 0 }));
  const depends_on = [
    ...new Set(plan.reads.flatMap((key) => store.getFact(key)?.provenance.group_id ?? [])),
  ];
  const group: CommitGroup = {
    campaign_id: store.head().campaign_id,
    group_id: p.group_id,
    intent_id: p.intent_id,
    owner,
    facet,
    cause: p.cause,
    rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads,
    depends_on,
    writes: plan.writes.map((w) => ({
      key: w.key,
      owner,
      facet,
      value: w.value as CommitGroup["writes"][number]["value"],
      unit: null,
      basis: p.basis,
      secrecy: p.secrecy,
      expected_version: w.expected_version,
    })),
  };
  return store.commit(group);
}

/**
 * RC-16 reconciliation by identity. A re-presented intent that already committed returns its ORIGINAL committed group, to be
 * re-presented verbatim (the store answers with the original receipt and re-admits nothing against later state), but only
 * when it is the same act: the same group identity and the same act target. Anything else under that intent is a conflict;
 * a different prospective act needs a genuinely new identity.
 */
export function committedAct(
  store: CampaignStore,
  p: Publication,
  sameAct: (prior: CommitGroup) => boolean,
): Result<CommitGroup | null, "INTENT_CONFLICT"> {
  const prior = store.committedGroup(p.intent_id);
  if (!prior) return ok(null);
  if (prior.group_id !== p.group_id || !sameAct(prior))
    return fail("INTENT_CONFLICT", "intent_id was already committed with different content", {
      intent_id: p.intent_id,
    });
  return ok(prior);
}

/** The canonical temporal basis of a cut, or undefined when no canonical time is established. */
export function canonicalNow(src: FreightSource): CanonicalTime | undefined {
  const clock = src.getFact(TEMPORAL_STATE_KEY);
  const parsed = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  return parsed?.success ? parsed.data.canonical_time : undefined;
}

export const sliceDigest = (
  slice: Pick<OpeningSlice, "slice_id" | "slice_kind" | "statement" | "premise">,
): string =>
  sha256Canonical({
    slice_id: slice.slice_id,
    slice_kind: slice.slice_kind,
    statement: slice.statement,
    premise: slice.premise,
  });
export const envelopeDigest = (
  envelopeId: string,
  operationId: string,
  worldId: string,
  sliceDigests: readonly string[],
): string =>
  sha256Canonical({
    envelope_id: envelopeId,
    operation_id: operationId,
    world_id: worldId,
    slices: sliceDigests,
  });

export interface SealedSlice {
  readonly attestation: { readonly fact: OwnerFact; readonly value: OpeningAttestation };
  readonly slice: OpeningSlice;
  readonly provenance: SliceProvenance;
}

/**
 * Reads one sealed premise slice of a world's Opening Source Attestation by identity: the committed attestation, the slice of
 * exactly the kind the admitting owner owns, and its recomputed digest. A missing attestation, an absent slice, a slice of
 * another kind or a digest that no longer matches the sealed envelope refuses; nothing is rescued retroactively.
 */
export function sealedSlice(
  src: FreightSource,
  worldId: string,
  sliceId: string,
  kind: OpeningSliceKind,
): Result<SealedSlice, FreightRefusalCode> {
  const key = worldOpeningAttestationKey(worldId);
  const fact = src.getFact(key);
  if (!fact)
    return refuse(
      "PREREQUISITE_MISSING",
      "no Opening Source Attestation is committed for this world",
      {
        key,
      },
    );
  const parsed = OpeningAttestationSchema.safeParse(fact.value);
  if (!parsed.success)
    return refuse("SOURCE_REFUSED", "the Opening Source Attestation is malformed", { key });
  const slice = parsed.data.envelope.slices.find((s) => s.slice_id === sliceId);
  if (!slice)
    return refuse(
      "SOURCE_REFUSED",
      "the sealed envelope has no such premise slice: a missing or late slice refuses",
      {
        slice_id: sliceId,
      },
    );
  if (slice.slice_kind !== kind)
    return refuse("SOURCE_REFUSED", "the premise slice is not of the kind this owner admits", {
      slice_id: sliceId,
      slice_kind: slice.slice_kind,
    });
  if (sliceDigest(slice) !== slice.digest)
    return refuse("SOURCE_REFUSED", "the premise slice no longer matches its sealed digest", {
      slice_id: sliceId,
    });
  return ok({
    attestation: { fact, value: parsed.data },
    slice,
    provenance: {
      attestation: { fact_key: key, version: fact.version },
      envelope_digest: parsed.data.envelope.digest,
      slice_id: slice.slice_id,
      slice_digest: slice.digest,
    },
  });
}

/** Every sealed slice of one kind (the closed candidate set of the envelope), in slice order. */
export function sealedSlicesOfKind(
  attestation: OpeningAttestation,
  kind: OpeningSliceKind,
): readonly OpeningSlice[] {
  return attestation.envelope.slices.filter((s) => s.slice_kind === kind);
}

/** The identity embedded in a freight key must be the identity inside its value (stable canonical identity). */
export function freightIdentityMismatch(
  kindId: string,
  ids: readonly string[],
  value: unknown,
): string | null | undefined {
  const v = value as Record<string, unknown>;
  const entity = (x: unknown): string | undefined =>
    (x as { entity_id?: string } | undefined)?.entity_id;
  const no = (what: string) => `${what} identity does not match the key`;
  switch (kindId) {
    case "world_opening_attestation":
      return entity(v["world"]) === ids[0] ? null : no("attestation world");
    case "world_site_condition":
      return entity(v["world"]) === ids[0] && v["condition_id"] === ids[1]
        ? null
        : no("site condition");
    case "world_governing_premise":
      return entity(v["world"]) === ids[0] &&
        v["protected_class"] === ids[1] &&
        v["premise_id"] === ids[2]
        ? null
        : no("governing premise");
    case "world_governing_premise_head":
      return entity(v["world"]) === ids[0] && v["protected_class"] === ids[1]
        ? null
        : no("governing-premise head");
    case "gip_constitutive_basis":
      return v["basis_id"] === ids[0] ? null : no("basis");
    case "gip_instrument_clause":
      return (v["instrument"] as { instrument_id?: string }).instrument_id === ids[0] &&
        v["provision_id"] === ids[1]
        ? null
        : no("clause");
    case "gip_legal_readiness_seal":
      return v["seal_id"] === ids[0] ? null : no("seal");
    case "production_material_specification":
      return v["specification_id"] === ids[0] ? null : no("material specification");
    case "production_input_lot":
      return v["lot_id"] === ids[0] ? null : no("input lot");
    case "economy_origin_allocation":
      return v["allocation_id"] === `origin:${ids[0]}` ? null : no("origin allocation");
    case "economy_origin_lot_slot":
      return v["lot_id"] === ids[0] ? null : no("origin lot slot");
    case "economy_accepted_output_holding":
      return entity(v["object_ref"]) === ids[1] ? null : no("holding");
    case "economy_freight_request":
      return v["request_ref"] === ids[0] ? null : no("freight request");
    case "economy_freight_allocation":
    case "economy_freight_withdrawal":
    case "economy_freight_close":
    case "economy_freight_receipt":
    case "economy_destination_adequacy":
      return (v["request"] as { request_ref?: string }).request_ref === ids[0]
        ? null
        : no("request-bound record");
    case "economy_freight_directive_use_slot":
      return v["slot_kind"] === "directive-use" ? null : no("slot kind");
    case "economy_freight_cargo_slot":
      return v["slot_kind"] === "cargo" ? null : no("slot kind");
    case "economy_freight_requirement_slot":
      return v["slot_kind"] === "requirement" ? null : no("slot kind");
    case "economy_freight_use_consumption":
      return v["directive_use_id"] === ids[0] ? null : no("directive use");
    case "logistics_service_basis":
      return v["basis_id"] === ids[0] ? null : no("service basis");
    case "logistics_service_slot":
      return (v["basis"] as { basis_id?: string }).basis_id === ids[0] ? null : no("service slot");
    case "logistics_unused_release":
      return (v["request"] as { request_id?: string }).request_id === ids[0]
        ? null
        : no("unused release");
    case "logistics_freight_dispatch_enrollment":
      return null;
    default:
      return undefined;
  }
}
