import {
  AdmitGoverningPremiseInputSchema,
  AdmitSiteConditionChangeInputSchema,
  AdmitSiteConditionInputSchema,
  AttestOpeningInputSchema,
  FACET_WORLD_GOVERNING_PREMISE,
  FACET_WORLD_OPENING_PROVENANCE,
  FACET_WORLD_SITE_CONDITION,
  FREIGHT_PROFILE,
  OWNER_WORLD_STATE,
  OpeningAttestationSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PROTECTED_CLASSES,
  PublicationSchema,
  SiteConditionPremiseSchema,
  TEMPORAL_STATE_KEY,
  WorldGoverningPremiseHeadSchema,
  WorldGoverningPremiseSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  WorldSiteConditionSchema,
  fail,
  initialLocalityCompletionKey,
  ok,
  worldGoverningPremiseHeadKey,
  worldGoverningPremiseKey,
  worldLocusKey,
  worldOpeningAttestationKey,
  worldProfileKey,
  worldSiteConditionKey,
  type AttestOpeningInput,
  type CommitGroup,
  type OpeningAttestation,
  type OwnerFact,
  type ProtectedClass,
  type ProtectedHeadPin,
  type Publication,
  type Result,
  type SchemaIssues,
  type WorldGoverningPremise,
  type WorldGoverningPremiseHead,
  type WorldSiteCondition,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import {
  canonicalNow,
  checkPlan,
  committedAct,
  envelopeDigest,
  planned,
  publishPlan,
  refuse,
  sealedSlice,
  sliceDigest,
  stateSource,
  storeSource,
  type FreightErrorCode,
  type FreightSource,
  type Planned,
} from "./common.ts";
import { FREIGHT_WORLD_RULE, resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";

/**
 * IM-03 World-State — the opening and physical premises of the ROADBED first freight profile (R2-D18 v1.2.1 §§1, 1.1, 3.2-3.4).
 *
 * World-State attests the ENTIRE original accepted GM envelope and its individually addressable premise slices, once, as an
 * immutable seal; it admits its own objective destination condition from its own sealed slice; and it admits typed
 * governing-premise facts with per-class isolated heads (P-1..P-4). It interprets no legal premise (GIP owns competence and
 * coverage), authorizes no work and carries no legal priority. Each derivation below is the single statement of its rule: the
 * authored operation builds its group with it and IM-11 admission re-derives the same group from committed state.
 */

// ---------------------------------------------------------------------------------------------
// Opening Source Attestation (P-2)
// ---------------------------------------------------------------------------------------------

/**
 * The attestation an authored original GM envelope determines. Refused unless the world is an ORIGINAL world, both endpoints
 * are established loci of it, no player character is bound (NULL-PC original-world profile only), neither endpoint was opened
 * by the player-bearing Initial Locality Bootstrap route (which stays controlling there), and canonical time is NOT yet
 * established (T0 is initialized after attestation). Each of those absences is pinned at version 0, so a concurrent binding,
 * bootstrap or time initialization defeats the attestation at commit.
 */
export function deriveOpeningAttestation(src: FreightSource, input: AttestOpeningInput): Planned {
  const worldKey = worldProfileKey(input.world_id);
  const originKey = worldLocusKey(input.world_id, input.origin_locus_id);
  const destinationKey = worldLocusKey(input.world_id, input.destination_locus_id);
  const key = worldOpeningAttestationKey(input.world_id);
  const absences = [
    PLAYER_CHARACTER_BINDING_KEY,
    TEMPORAL_STATE_KEY,
    initialLocalityCompletionKey(input.world_id, input.origin_locus_id),
    initialLocalityCompletionKey(input.world_id, input.destination_locus_id),
  ];
  const world = src.getFact(worldKey);
  const origin = src.getFact(originKey);
  const destination = src.getFact(destinationKey);
  if (!world || !origin || !destination)
    return refuse(
      "PREREQUISITE_MISSING",
      "the world and both endpoint loci are established before the opening is attested",
      { world: worldKey, origin: originKey, destination: destinationKey },
    );
  const profile = WorldProfileSchema.safeParse(world.value);
  if (!profile.success || profile.data.reference_causal_basis.mode !== "ORIGINAL")
    return refuse("SOURCE_REFUSED", "the first freight profile opens only an ORIGINAL world", {
      key: worldKey,
    });
  for (const [fact, what] of [
    [origin, "origin"],
    [destination, "destination"],
  ] as const) {
    const locus = WorldLocusSchema.safeParse(fact.value);
    if (!locus.success || locus.data.world.entity_id !== input.world_id)
      return refuse("SOURCE_REFUSED", `the ${what} is an established locus of this world`, {
        key: fact.key,
      });
  }
  if (src.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return refuse(
      "NOT_ADMISSIBLE",
      "the first freight profile opens only the NULL-PC original-world profile: a player character is bound",
      { key: PLAYER_CHARACTER_BINDING_KEY },
    );
  if (src.getFact(TEMPORAL_STATE_KEY))
    return refuse(
      "NOT_ADMISSIBLE",
      "the opening is attested before canonical time is initialized: no late seal is rescued",
      { key: TEMPORAL_STATE_KEY },
    );
  for (const k of absences.slice(2))
    if (src.getFact(k))
      return refuse(
        "NOT_ADMISSIBLE",
        "an endpoint opened by the player-bearing initial-locality route is not opened again by this profile",
        { key: k },
      );
  const slices = input.slices.map((s) => ({ ...s, digest: sliceDigest(s) }));
  const value = OpeningAttestationSchema.safeParse({
    world: { fact_key: worldKey, entity_id: input.world_id },
    profile: FREIGHT_PROFILE,
    setup_operation: {
      operation_id: input.operation_id,
      authored_under: input.authored_under,
      authorship: "GM_AUTHORED_ORIGINAL_SETTING_PREMISES_NOT_PLAYER_CHOICE",
    },
    mode: "ORIGINAL_WORLD_NULL_PC",
    pins: {
      world_profile: { fact_key: worldKey, version: world.version },
      origin: { fact_key: originKey, entity_id: input.origin_locus_id, version: origin.version },
      destination: {
        fact_key: destinationKey,
        entity_id: input.destination_locus_id,
        version: destination.version,
      },
    },
    envelope: {
      envelope_id: input.envelope_id,
      digest: envelopeDigest(
        input.envelope_id,
        input.operation_id,
        input.world_id,
        slices.map((s) => s.digest),
      ),
      closed: true,
      slices,
    },
  });
  if (!value.success)
    return refuse("SOURCE_REFUSED", "the envelope is not a representable attestation", {
      issues: value.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  return planned(
    [{ key, value: value.data, expected_version: 0 }],
    [worldKey, originKey, destinationKey, ...absences],
  );
}

/** The authored input an attestation value was derived from (admission re-derives the value from it). */
const inputOfAttestation = (a: OpeningAttestation): AttestOpeningInput => ({
  world_id: a.world.entity_id,
  operation_id: a.setup_operation.operation_id,
  envelope_id: a.envelope.envelope_id,
  origin_locus_id: a.pins.origin.entity_id,
  destination_locus_id: a.pins.destination.entity_id,
  authored_under: a.setup_operation.authored_under,
  slices: a.envelope.slices.map((slice) => ({
    slice_id: slice.slice_id,
    slice_kind: slice.slice_kind,
    statement: slice.statement,
    premise: slice.premise,
  })),
});

export function readOpeningAttestation(
  src: Pick<FreightSource, "getFact">,
  worldId: string,
): { fact: OwnerFact; value: OpeningAttestation } | undefined {
  const fact = src.getFact(worldOpeningAttestationKey(worldId));
  const parsed = fact ? OpeningAttestationSchema.safeParse(fact.value) : undefined;
  return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
}

// ---------------------------------------------------------------------------------------------
// Objective destination site condition (NOT a protected kind)
// ---------------------------------------------------------------------------------------------

/**
 * The site condition its own sealed slice determines: the destination site's physical component and damaged identities,
 * exactly as authored. It needs canonical time to be established (it is a post-opening admission of an already-sealed
 * premise) and it is admitted once. It carries no priority, no work authorization and no quantity of material.
 */
export function deriveSiteCondition(src: FreightSource, worldId: string, sliceId: string): Planned {
  const sealed = sealedSlice(src, worldId, sliceId, "site_condition");
  if (!sealed.ok) return sealed;
  const { attestation, slice, provenance } = sealed.value;
  const premise = SiteConditionPremiseSchema.safeParse(slice.premise);
  if (!premise.success)
    return refuse("SOURCE_REFUSED", "the site-condition slice is not a typed objective condition", {
      slice_id: sliceId,
    });
  const p = premise.data;
  if (p.site_locus_id !== attestation.value.pins.destination.entity_id)
    return refuse("SOURCE_REFUSED", "the objective condition is of the attested destination site", {
      slice_id: sliceId,
    });
  if (!canonicalNow(src))
    return refuse(
      "PREREQUISITE_MISSING",
      "canonical time is established before a premise is admitted",
      {
        key: TEMPORAL_STATE_KEY,
      },
    );
  const key = worldSiteConditionKey(worldId, p.condition_id);
  if (src.getFact(key))
    return refuse(
      "NOT_ADMISSIBLE",
      "the objective condition is admitted from its sealed slice once",
      {
        key,
      },
    );
  const siteKey = worldLocusKey(worldId, p.site_locus_id);
  const value = WorldSiteConditionSchema.parse({
    condition_id: p.condition_id,
    world: attestation.value.world,
    site: { fact_key: siteKey, entity_id: p.site_locus_id },
    component: p.component,
    damaged_components: p.damaged_components,
    original: provenance,
    standing: { status: "STANDING" },
    prospective_change: null,
  } satisfies WorldSiteCondition);
  return planned(
    [{ key, value, expected_version: 0 }],
    [attestation.fact.key, siteKey, TEMPORAL_STATE_KEY],
  );
}

export interface SiteConditionChange {
  readonly world_id: string;
  readonly condition_id: string;
  readonly change_id: string;
  readonly statement: string;
  readonly outcome: "STANDING" | "CEASED";
  readonly authored_under: {
    readonly role: "role.gm";
    readonly permission: "permission.rule.adjudicate";
  };
}

/**
 * One owner-admitted PROSPECTIVE physical change of a standing condition (R2-D18 §3.3): at the canonical basis, under the GM's
 * adjudication authority, it either leaves the same damaged components standing or records that the condition has ceased. It
 * never rewrites the original slice provenance or the component identities, and a ceased condition changes no further.
 */
export function deriveSiteConditionChange(src: FreightSource, c: SiteConditionChange): Planned {
  const key = worldSiteConditionKey(c.world_id, c.condition_id);
  const fact = src.getFact(key);
  const prior = fact ? WorldSiteConditionSchema.safeParse(fact.value) : undefined;
  if (!fact || !prior?.success)
    return refuse("PREREQUISITE_MISSING", "no objective condition is admitted at this identity", {
      key,
    });
  if (prior.data.standing.status !== "STANDING")
    return refuse("NOT_ADMISSIBLE", "a ceased condition changes no further in this profile", {
      key,
    });
  const now = canonicalNow(src);
  if (!now)
    return refuse(
      "PREREQUISITE_MISSING",
      "canonical time is established before a change is admitted",
      {
        key: TEMPORAL_STATE_KEY,
      },
    );
  const value = WorldSiteConditionSchema.parse({
    ...prior.data,
    standing: { status: c.outcome },
    prospective_change: {
      change_id: c.change_id,
      statement: c.statement,
      authored_under: c.authored_under,
      at: now,
    },
  } satisfies WorldSiteCondition);
  return planned([{ key, value, expected_version: fact.version }], [TEMPORAL_STATE_KEY]);
}

export function readSiteCondition(
  src: Pick<FreightSource, "getFact">,
  worldId: string,
  conditionId: string,
): { fact: OwnerFact; value: WorldSiteCondition } | undefined {
  const fact = src.getFact(worldSiteConditionKey(worldId, conditionId));
  const parsed = fact ? WorldSiteConditionSchema.safeParse(fact.value) : undefined;
  return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
}

// ---------------------------------------------------------------------------------------------
// Typed governing-premise admission with per-class isolated heads (P-1..P-4)
// ---------------------------------------------------------------------------------------------

export type GoverningPremiseInput = Omit<WorldGoverningPremise, "world" | "admitted_at"> & {
  readonly world_id: string;
};

/**
 * One typed governing-premise admission: the premise, created once at its own key, and its class head advanced in the SAME
 * group (count and chain digest). Because every premise write advances exactly its own class head and nothing else can write a
 * head, a new protected entry is always detected and a write of any other kind can never advance a protected head.
 */
export function deriveGoverningPremise(src: FreightSource, input: GoverningPremiseInput): Planned {
  const worldKey = worldProfileKey(input.world_id);
  if (!src.getFact(worldKey))
    return refuse("PREREQUISITE_MISSING", "the world is established before a governing premise", {
      key: worldKey,
    });
  const now = canonicalNow(src);
  if (!now)
    return refuse(
      "PREREQUISITE_MISSING",
      "canonical time is established before a premise is admitted",
      {
        key: TEMPORAL_STATE_KEY,
      },
    );
  const key = worldGoverningPremiseKey(input.world_id, input.protected_class, input.premise_id);
  if (src.getFact(key))
    return refuse("NOT_ADMISSIBLE", "a governing premise is admitted once at its own identity", {
      key,
    });
  const value = WorldGoverningPremiseSchema.parse({
    premise_id: input.premise_id,
    world: { fact_key: worldKey, entity_id: input.world_id },
    protected_class: input.protected_class,
    action: input.action,
    subject: input.subject,
    statement: input.statement,
    authored_under: input.authored_under,
    admitted_at: now,
  } satisfies WorldGoverningPremise);
  const headKey = worldGoverningPremiseHeadKey(input.world_id, input.protected_class);
  const headFact = src.getFact(headKey);
  const prior = headFact ? WorldGoverningPremiseHeadSchema.safeParse(headFact.value) : undefined;
  if (headFact && !prior?.success)
    return refuse("SOURCE_REFUSED", "the class head is malformed", { key: headKey });
  const head = WorldGoverningPremiseHeadSchema.parse({
    world: value.world,
    protected_class: input.protected_class,
    count: (prior?.success ? prior.data.count : 0) + 1,
    chain_digest: sha256Canonical({
      prev: prior?.success ? prior.data.chain_digest : null,
      fact_key: key,
      value_sha256: sha256Canonical(value),
    }),
    last: { fact_key: key, premise_id: input.premise_id },
  } satisfies WorldGoverningPremiseHead);
  return planned(
    [
      { key, value, expected_version: 0 },
      { key: headKey, value: head, expected_version: headFact?.version ?? 0 },
    ],
    [worldKey, TEMPORAL_STATE_KEY],
  );
}

/**
 * The closed, isolated per-class World-State protected heads of one attested opening (R2-D18 §3.2), as they stand at this cut.
 * Each class is its fixed sealed facts plus its premise-class head; a head at version 0 is owner-proven absence of any
 * admitted premise of that class.
 *
 *   P-1 original world-law/profile basis  → the World Profile            + premises of class P-1
 *   P-2 original opening provenance       → the Opening Source Attestation + premises of class P-2
 *   P-3 endpoint definitions/legal reach  → the origin and destination loci + premises of class P-3
 *   P-4 other typed governing premises    →                                  premises of class P-4
 *
 * Physical kinds (the site condition, the fallback entity, ECT-01, source drawdown) share none of these keys or facets.
 */
export function protectedHeadPins(
  src: Pick<FreightSource, "getFact">,
  attestation: { readonly fact: OwnerFact; readonly value: OpeningAttestation },
): Result<readonly ProtectedHeadPin[], "SOURCE_REFUSED"> {
  const worldId = attestation.value.world.entity_id;
  const pins = attestation.value.pins;
  const fixedKeys: Record<ProtectedClass, readonly string[]> = {
    "P-1": [pins.world_profile.fact_key],
    "P-2": [attestation.fact.key],
    "P-3": [pins.origin.fact_key, pins.destination.fact_key],
    "P-4": [],
  };
  const out: ProtectedHeadPin[] = [];
  for (const protected_class of PROTECTED_CLASSES) {
    const fixed = [];
    for (const key of fixedKeys[protected_class]) {
      const fact = src.getFact(key);
      if (!fact) return fail("SOURCE_REFUSED", "a sealed protected fact is unreadable", { key });
      fixed.push({ fact_key: key, version: fact.version });
    }
    const headKey = worldGoverningPremiseHeadKey(worldId, protected_class);
    out.push({
      protected_class,
      fixed,
      head: { fact_key: headKey, version: src.getFact(headKey)?.version ?? 0 },
    });
  }
  return ok(out);
}

/** Every key a protected-head comparison reads (fixed facts and class heads), for the act's guards. */
export const protectedHeadKeys = (pins: readonly ProtectedHeadPin[]): readonly string[] =>
  pins.flatMap((p) => [...p.fixed.map((f) => f.fact_key), p.head.fact_key]);

/**
 * The first protected head that differs from what the seal pinned (a changed sealed fact, or a class head that advanced or
 * appeared), or null when every head is exactly as sealed. Read-only: it writes no invalidation or eligibility fact.
 */
export function protectedHeadChange(
  src: Pick<FreightSource, "getFact">,
  sealed: readonly ProtectedHeadPin[],
): { readonly protected_class: ProtectedClass; readonly fact_key: string } | null {
  for (const p of sealed) {
    for (const f of p.fixed)
      if ((src.getFact(f.fact_key)?.version ?? 0) !== f.version)
        return { protected_class: p.protected_class, fact_key: f.fact_key };
    if ((src.getFact(p.head.fact_key)?.version ?? 0) !== p.head.version)
      return { protected_class: p.protected_class, fact_key: p.head.fact_key };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

type Write = CommitGroup["writes"][number];
const kindOf = (w: Write): string | undefined => resolveKey(w.key)?.kind.id;

/** World-State's first-profile facets change only by the four re-derived acts above (raw `store.commit` included). */
export function worldFreightGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const src = stateSource(state);
  const ws = group.writes;
  const kinds = ws.map(kindOf);
  if (group.facet === FACET_WORLD_OPENING_PROVENANCE) {
    if (ws.length !== 1 || kinds[0] !== "world_opening_attestation")
      return reject("VALUE_INVALID", "the opening provenance changes only by one attestation");
    const a = OpeningAttestationSchema.parse(ws[0]!.value);
    return checkPlan(group, state, deriveOpeningAttestation(src, inputOfAttestation(a)));
  }
  if (group.facet === FACET_WORLD_SITE_CONDITION) {
    if (ws.length !== 1 || kinds[0] !== "world_site_condition")
      return reject("VALUE_INVALID", "a site condition changes one record at a time");
    const c = WorldSiteConditionSchema.parse(ws[0]!.value);
    const worldId = c.world.entity_id;
    if (ws[0]!.expected_version === 0)
      return checkPlan(group, state, deriveSiteCondition(src, worldId, c.original.slice_id));
    if (!c.prospective_change)
      return reject("VALUE_INVALID", "a later version of a condition is a prospective change");
    return checkPlan(
      group,
      state,
      deriveSiteConditionChange(src, {
        world_id: worldId,
        condition_id: c.condition_id,
        change_id: c.prospective_change.change_id,
        statement: c.prospective_change.statement,
        outcome: c.standing.status,
        authored_under: c.prospective_change.authored_under,
      }),
    );
  }
  if (group.facet === FACET_WORLD_GOVERNING_PREMISE) {
    const premise = ws.find((w) => kindOf(w) === "world_governing_premise");
    if (ws.length !== 2 || !premise || !kinds.includes("world_governing_premise_head"))
      return reject(
        "VALUE_INVALID",
        "a governing premise is admitted with exactly its own class head: an unclassified or head-less premise is refused",
      );
    const p = WorldGoverningPremiseSchema.parse(premise.value);
    return checkPlan(
      group,
      state,
      deriveGoverningPremise(src, {
        world_id: p.world.entity_id,
        premise_id: p.premise_id,
        protected_class: p.protected_class,
        action: p.action,
        subject: p.subject,
        statement: p.statement,
        authored_under: p.authored_under,
      }),
    );
  }
  return reject("KEY_NOT_ADMITTED", "not a first-profile World-State facet");
}

export const isWorldFreightFacet = (facet: string): boolean =>
  facet === FACET_WORLD_OPENING_PROVENANCE ||
  facet === FACET_WORLD_SITE_CONDITION ||
  facet === FACET_WORLD_GOVERNING_PREMISE;

// ---------------------------------------------------------------------------------------------
// Authored operations (archivist path; a caller supplies authored premises and identities, never an owner, facet or rule)
// ---------------------------------------------------------------------------------------------

const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, {
    issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
const refused = (r: {
  error: { code: string; message: string; details?: Record<string, unknown> };
}) => fail(r.error.code as FreightErrorCode, r.error.message, r.error.details);

export class WorldFreightAdapter {
  readonly #store: CampaignStore;
  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /** Attests the entire original accepted GM envelope, once (the trusted original setup operation of the opening). */
  async attestOpening(
    input: Publication & { readonly opening: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AttestOpeningInputSchema.safeParse(input.opening);
    if (!i.success) return invalid("opening", i.error);
    const key = worldOpeningAttestationKey(i.data.world_id);
    const prior = committedAct(this.#store, p.data, (g) => {
      const w = g.writes.find((x) => x.key === key);
      const was = w ? OpeningAttestationSchema.safeParse(w.value) : undefined;
      return !!was?.success && canonicalEqual(inputOfAttestation(was.data), i.data);
    });
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = deriveOpeningAttestation(storeSource(this.#store), i.data);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_WORLD_STATE,
      FACET_WORLD_OPENING_PROVENANCE,
      FREIGHT_WORLD_RULE,
      plan.value,
    );
  }

  /** Admits the objective destination condition from its own sealed slice. */
  async admitSiteCondition(
    input: Publication & { readonly condition: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AdmitSiteConditionInputSchema.safeParse(input.condition);
    if (!i.success) return invalid("condition", i.error);
    const prior = committedAct(this.#store, p.data, (g) =>
      g.writes.some((w) => {
        const c = WorldSiteConditionSchema.safeParse(w.value);
        return (
          c.success &&
          w.expected_version === 0 &&
          c.data.world.entity_id === i.data.world_id &&
          c.data.original.slice_id === i.data.slice_id
        );
      }),
    );
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = deriveSiteCondition(storeSource(this.#store), i.data.world_id, i.data.slice_id);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_WORLD_STATE,
      FACET_WORLD_SITE_CONDITION,
      FREIGHT_WORLD_RULE,
      plan.value,
    );
  }

  /** Admits one prospective physical change of a standing condition, under the GM's adjudication authority. */
  async admitSiteConditionChange(
    input: Publication & { readonly change: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AdmitSiteConditionChangeInputSchema.safeParse(input.change);
    if (!i.success) return invalid("change", i.error);
    const key = worldSiteConditionKey(i.data.world_id, i.data.condition_id);
    const prior = committedAct(this.#store, p.data, (g) =>
      g.writes.some((w) => {
        const c = WorldSiteConditionSchema.safeParse(w.value);
        return (
          w.key === key &&
          c.success &&
          c.data.prospective_change?.change_id === i.data.change_id &&
          c.data.prospective_change.statement === i.data.statement &&
          c.data.standing.status === i.data.outcome
        );
      }),
    );
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = deriveSiteConditionChange(storeSource(this.#store), i.data);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_WORLD_STATE,
      FACET_WORLD_SITE_CONDITION,
      FREIGHT_WORLD_RULE,
      plan.value,
    );
  }

  /** Admits one typed governing premise (P-1..P-4) and advances its class head in the same group. */
  async admitGoverningPremise(
    input: Publication & { readonly premise: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AdmitGoverningPremiseInputSchema.safeParse(input.premise);
    if (!i.success) return invalid("premise", i.error);
    const key = worldGoverningPremiseKey(
      i.data.world_id,
      i.data.protected_class,
      i.data.premise_id,
    );
    const prior = committedAct(this.#store, p.data, (g) =>
      g.writes.some((w) => {
        const v = WorldGoverningPremiseSchema.safeParse(w.value);
        return (
          w.key === key &&
          v.success &&
          v.data.action === i.data.action &&
          v.data.subject === i.data.subject &&
          v.data.statement === i.data.statement
        );
      }),
    );
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = deriveGoverningPremise(storeSource(this.#store), i.data);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_WORLD_STATE,
      FACET_WORLD_GOVERNING_PREMISE,
      FREIGHT_WORLD_RULE,
      plan.value,
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  attestation(worldId: string): { fact: OwnerFact; value: OpeningAttestation } | undefined {
    return readOpeningAttestation(this.#store, worldId);
  }
  siteCondition(
    worldId: string,
    conditionId: string,
  ): { fact: OwnerFact; value: WorldSiteCondition } | undefined {
    return readSiteCondition(this.#store, worldId, conditionId);
  }
  governingPremiseHead(
    worldId: string,
    protectedClass: ProtectedClass,
  ): { fact: OwnerFact; value: WorldGoverningPremiseHead } | undefined {
    const fact = this.#store.getFact(worldGoverningPremiseHeadKey(worldId, protectedClass));
    const parsed = fact ? WorldGoverningPremiseHeadSchema.safeParse(fact.value) : undefined;
    return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
  }
}

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
