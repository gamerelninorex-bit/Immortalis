import {
  GIP_SUNSET_ENROLLMENT_KEY,
  GovernanceInstrumentSchema,
  OWNER_GIP,
  READ_MODE_NOW,
  SunsetEnrollmentSchema,
  TemporalObjectSchema,
  compareTime,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  gipSunsetBoundaryId,
  gipSunsetInstrumentOfObject,
  gipSunsetObjectId,
  gipSunsetProcessId,
  gipSunsetStage,
  parseInstrumentScopeBindingRef,
  parseInstrumentSourceAuthorityRef,
  temporalObjectKey,
  timeEquals,
  type CanonicalTime,
  type DependencyDeclaration,
  type GovernanceInstrument,
  type OwnerFact,
  type TemporalObject,
  type TransactionAuthority,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders and the registration rule for the GIP side of the temporal declaration (RC-10 dependency declarations; WS-007 §4.1,
 * §4.3 `sunset_condition`, §21.2; F-014B Turnless Temporal; F-017 stage identity). Stable institution identity, an established
 * office, a Scope Binding and an Instrument carry forward after their canonical commit (GIP Draft v2.1 §1 "Stable state carries
 * forward. Passage of time alone does not require a GIP resolution"; Scaling Profile v1.1 §7 "no per-turn politics phase"), so GIP
 * has NO tick, phase, polling loop or standing object. The ONE exception is the material, exactly timed `sunset_condition` of one
 * Instrument: that material term earns ONE Temporal object with ONE earned boundary (the exact sunset instant) and ONE GIP stage,
 * the expiry of that same Instrument.
 *
 * The object is a pure function of the committed Instrument and GIP's enrollment receipt, so registration admission can demand
 * exactly this object and nothing else (a hand-written object cannot smuggle a different stage, read, boundary or recurrence).
 * The Temporal kernel owns the object, its timestamp, boundary identity, stage graph and retirement; GIP owns the Instrument and
 * writes its lifecycle - and no other owner can. Nothing here scans Instruments: an object is found by the index, the receipt by
 * its key.
 */

const now = (fact_key: string) => ({
  mode: READ_MODE_NOW as typeof READ_MODE_NOW,
  source: { owner: OWNER_GIP, fact_key },
  invalidators: [{ fact_key }],
});

/** The exact committed keys an Instrument rests on: its source office, then its Scope Binding (both addressed by its own refs). */
export function instrumentSourceKeys(
  instrument: Pick<GovernanceInstrument, "source_authority_ref" | "scope_binding_ref">,
): { readonly office: string; readonly binding: string } | undefined {
  const office = parseInstrumentSourceAuthorityRef(instrument.source_authority_ref);
  const binding = parseInstrumentScopeBindingRef(instrument.scope_binding_ref);
  if (!office || !binding) return undefined;
  return {
    office: gipOfficeAuthorityLocusKey(office.institution_id, office.office_id),
    binding: gipScopeBindingKey(
      binding.institution_id,
      binding.office_id,
      binding.scope_binding_id,
    ),
  };
}

/**
 * The one GIP stage: it advances the Instrument's own slot `active` → `expired`. Its reads are exactly the two committed GIP
 * facts the Instrument rests on, each AS-OF-NOW (so a stage cannot run over a source authority or Scope Binding that is not
 * committed); the Instrument itself is its own prior state, never a temporal read of another stage. It declares no close.
 */
export function gipSunsetDeclaration(
  instrument: GovernanceInstrument,
): DependencyDeclaration | undefined {
  const keys = instrumentSourceKeys(instrument);
  if (!keys) return undefined;
  return {
    stage: gipSunsetStage(instrument.instrument_id),
    reads: [now(keys.office), now(keys.binding)],
    produces: [gipInstrumentKey(instrument.instrument_id)],
    declares_close: null,
  };
}

/**
 * The Temporal object of one sunset-bearing Instrument: ONE earned boundary at the exact `sunset_condition`, ONE GIP stage,
 * resolved from `basis` (the canonical time GIP committed the Instrument at).
 */
export function gipSunsetTemporalObject(
  instrument: GovernanceInstrument,
  basis: CanonicalTime,
): TemporalObject | undefined {
  const declaration = gipSunsetDeclaration(instrument);
  const sunset = instrument.sunset_condition;
  if (!declaration || !sunset) return undefined;
  const id = instrument.instrument_id;
  return {
    object_id: gipSunsetObjectId(id),
    owning_ref: { owner: OWNER_GIP, process_id: gipSunsetProcessId(id) },
    last_resolved_basis: basis,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: { boundary_id: gipSunsetBoundaryId(id), at: sunset },
    dependencies: [declaration],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: declaration.reads.map((r) => ({ fact_key: r.source.fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}

/** The committed Instrument and enrollment receipt as the registration rule reads them. */
function committedInstrument(
  facts: Pick<CampaignState, "facts">["facts"],
  instrumentId: string,
): GovernanceInstrument | undefined {
  const fact = facts.get(gipInstrumentKey(instrumentId));
  const parsed = fact ? GovernanceInstrumentSchema.safeParse(fact.value) : undefined;
  return fact?.owner === OWNER_GIP && parsed?.success ? parsed.data : undefined;
}

/**
 * RC-10 registration rule for every temporal object that is owned by GIP, declares a GIP stage or claims to produce a GIP key.
 * Applies at registration and at load, so a hand-written object cannot smuggle a different stage, read, boundary or owner:
 *
 *  - only GIP's own sunset object may name GIP as owner, declare a GIP stage or produce a `gip/…` key; no other object may;
 *  - that object is exactly the one derived from a COMMITTED Instrument that carries a `sunset_condition`, with its one stage
 *    and one earned boundary at that exact instant (a missing, differently-typed or incomparable term earns no object);
 *  - at registration the Instrument is still `active` and GIP's enrollment receipt names it: the receipt is what authorizes the
 *    registration, and its `basis_time` is the object's resolved basis, so a registration of a different basis, boundary or
 *    Instrument fails closed. The load-time form compares the object loosely (basis and boundary move when its transaction
 *    resolves it) because the receipt slot may since have been reused by a later Instrument.
 */
export function gipObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  const concerned =
    o.owning_ref.owner === OWNER_GIP ||
    o.dependencies.some(
      (d) =>
        d.stage.owner_operation.owner === OWNER_GIP || d.produces.some((k) => k.startsWith("gip/")),
    );
  if (!concerned) return null;
  if (o.owning_ref.owner !== OWNER_GIP) {
    return "GIP declares no stage, close or operation in any object but its own sunset object, and produces no GIP key outside it: an Institution Identity, Office / Authority Locus, Scope Binding or Instrument carries forward without a GIP tick, phase or standing object";
  }
  const instrumentId = gipSunsetInstrumentOfObject(o.object_id);
  if (instrumentId === null) {
    return "GIP owns no temporal object other than the one sunset object derived from a committed sunset-bearing Instrument: stable identity carries forward without a GIP tick, phase or standing object";
  }
  const instrument = committedInstrument(state.facts, instrumentId);
  if (!instrument?.sunset_condition) {
    return "a GIP sunset object names a committed Instrument that carries a sunset_condition";
  }
  if (registered) {
    if (instrument.lifecycle_status !== "active") {
      return "only an active Instrument earns a sunset boundary";
    }
    const slot = state.facts.get(GIP_SUNSET_ENROLLMENT_KEY);
    const receipt = slot ? SunsetEnrollmentSchema.safeParse(slot.value) : undefined;
    if (
      !receipt?.success ||
      receipt.data.instrument_id !== instrumentId ||
      !timeEquals(receipt.data.sunset_at, instrument.sunset_condition)
    ) {
      return "a sunset boundary is registered only for the Instrument GIP's enrollment receipt names, at that receipt's exact sunset instant";
    }
    const expected = gipSunsetTemporalObject(instrument, receipt.data.basis_time);
    if (!expected || !canonicalEqual(o, expected)) {
      return "a GIP sunset object is exactly the object derived from its committed Instrument and its enrollment receipt";
    }
    return null;
  }
  const expected = gipSunsetTemporalObject(instrument, o.last_resolved_basis);
  const loose = (x: TemporalObject) => ({ ...x, last_resolved_basis: null, next_boundary: null });
  if (!expected || !canonicalEqual(loose(o), loose(expected))) {
    return "a GIP sunset object is exactly the object derived from its committed Instrument";
  }
  if (o.next_boundary !== null && !canonicalEqual(o.next_boundary, expected.next_boundary)) {
    return "a GIP sunset object's boundary is the Instrument's exact sunset instant";
  }
  return null;
}

/**
 * The enrollment receipt of a sunset-bearing Instrument that GIP has committed but whose Temporal object is not yet registered
 * (the interval between GIP's publication and the kernel's registration). Found by its fixed key; never by scanning.
 */
export function pendingSunsetEnrollment(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
): { readonly instrument_id: string; readonly sunset_at: CanonicalTime } | undefined {
  const slot = facts.get(GIP_SUNSET_ENROLLMENT_KEY);
  const receipt = slot ? SunsetEnrollmentSchema.safeParse(slot.value) : undefined;
  if (!receipt?.success) return undefined;
  if (facts.has(temporalObjectKey(gipSunsetObjectId(receipt.data.instrument_id)))) return undefined;
  return receipt.data;
}

/**
 * Canonical time cannot pass an UNREGISTERED material sunset (F-014B §6, §13: no advance may silently cross material work). While
 * GIP's receipt for a committed sunset-bearing Instrument is still unregistered, no resolution may stop at or after that
 * Instrument's sunset instant: the sunset is not in the Temporal index, so nothing else would ever engage it. `stop` is the
 * instant a resolution would stop at or, for a REQUEST, the requested target. A request with NO target (a condition-only
 * `STOP_AFTER_BOUNDARY`) has no stop that can be bounded before any owner stage runs, so it is refused outright while an
 * enrollment is pending (`stop` null): fail-closed, before anything is opened, rather than discovered after other owners'
 * stages committed. The same rule is used by the coordinator (a typed pre-stage refusal) and by kernel admission (a raw commit,
 * always with the transaction's actual stop), so they cannot drift. Returns a message, or null.
 */
export function gipEnrollmentPendingViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
  stop: CanonicalTime | null,
): string | null {
  const pending = pendingSunsetEnrollment(facts);
  if (!pending) return null;
  if (stop === null) {
    return "a condition-only request cannot be bounded before the unregistered sunset: GIP's enrollment of that Instrument's sunset must be completed first";
  }
  const c = compareTime(stop, pending.sunset_at);
  if (c === 0 || c === 1) {
    return "canonical time may not reach an unregistered sunset: GIP's enrollment of that Instrument's sunset must be completed first";
  }
  return null;
}

/**
 * Whether the transaction that opened a stage engaged this boundary, from the durable authority and committed state alone: the
 * sunset instant lies within the requested target; or, for a request with no target, the requested condition names this very
 * object and boundary, or names another committed object whose still-held earned boundary is at or after the sunset (the kernel
 * resolves every due boundary on the way to the stop that condition sets); and the transaction opened at or before the sunset
 * (a continuation of a held boundary opens AT it; canonical time never passes an active boundary, so nothing opens later).
 * Returns a message, or null.
 */
export function sunsetReachViolation(
  authority: Pick<TransactionAuthority, "opening" | "requested">,
  instrumentId: string,
  sunset: CanonicalTime,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const opened = compareTime(authority.opening.basis_time, sunset);
  if (opened !== -1 && opened !== 0) {
    return "a sunset stage runs only for a transaction that opened at or before the sunset instant";
  }
  const { target, condition } = authority.requested;
  if (target !== null) {
    const c = compareTime(sunset, target);
    return c === -1 || c === 0 ? null : "a sunset stage lies within what its transaction requested";
  }
  if (condition !== null) {
    if (
      condition.object_id === gipSunsetObjectId(instrumentId) &&
      condition.boundary_id === gipSunsetBoundaryId(instrumentId)
    ) {
      return null;
    }
    const named = facts.get(temporalObjectKey(condition.object_id));
    const object = named ? TemporalObjectSchema.safeParse(named.value) : undefined;
    const boundary = object?.success ? object.data.next_boundary : null;
    if (boundary && boundary.boundary_id === condition.boundary_id) {
      const c = compareTime(sunset, boundary.at);
      if (c === -1 || c === 0) return null;
    }
  }
  return "a sunset stage runs only for a transaction that engaged its boundary";
}
