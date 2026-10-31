import {
  canonicalJson,
  EntityId,
  ExistenceContractSchema,
  FACET_WORLD_SOURCE_CONDITION,
  I002_ADMITTED_CLASS,
  I002_NON_INTRINSIC_CLASSES,
  OBSERVATION_BASE_REFS,
  OBSERVATION_PLACEMENT_REF,
  ORIGINAL_ACTIVATION,
  OWNER_WORLD_STATE,
  PLAYER_CHARACTER_BINDING_KEY,
  PcCurrentViewingSchema,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
  PopulationPcOccupancySchema,
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_PHYSICAL,
  REFEREE_OP_SCENE,
  REFEREE_SOURCES,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  parseObservationRefLayout,
  pcCollectionRequestId,
  parseWorldSourceConditionKey,
  pcExistenceContractKey,
  popPcOccupancyKey,
  worldLocusKey,
  worldPcCurrentViewingKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  worldSourceDeliveryKey,
  worldSourceConditionKey,
  type CanonicalTime,
  type ExistenceContract,
  type I002ClarificationContext,
  type I002ClarificationReading,
  type I002HostDecision,
  type IrHostDecision,
  type ObservationHostDecision,
  type ObservationPremise,
  type OwnerFact,
  type PhysicalHostDecision,
  type RefereeDecisionRecord,
  type RefereeInputRef,
  type RefereeCandidateSlot,
  type RefereeRefusalCode,
  type RefereeVerdict,
  type SceneHostDecision,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import { extractionCredited } from "../pc-collection/state.ts";

/**
 * Deterministic mechanism of the host-callable AI referee (PR #61, BLUE B61-A3). Nothing here understands language: it builds the
 * exact context a host is given, and it VALIDATES a host's answer — closed vocabularies, full coverage of what was delivered,
 * every claim anchored to a verbatim quotation of the delivered text — and DERIVES the verdict from the answer. A verdict is never
 * read from the host. Whether the host UNDERSTOOD the words stays the host's responsibility and a reviewable, retained claim.
 */

export interface CandidateItem {
  readonly item_id: string;
  readonly slot: RefereeCandidateSlot;
  readonly text: string;
}

/** The content a Character Mirror shows and the host classifies: every statement of an Existence Contract, with its slot. */
type ContractBody = Pick<
  ExistenceContract,
  | "identity_agency"
  | "contact"
  | "embodiment_topology"
  | "continuity_rule"
  | "baseline_exception"
  | "entry_envelope"
>;

/** The Mirror item identity: the slot label and the statement, so a changed statement is a different accepted item. */
export const refereeItemId = (slotLabel: string, text: string): string =>
  `mirror/${slotLabel}/${sha256Canonical([slotLabel, text]).slice(0, 12)}`;

/** The statements of a contract, in Mirror display order, each with its exact item identity. */
export function refereeCandidateItems(c: ContractBody): readonly CandidateItem[] {
  const item = (label: string, slot: RefereeCandidateSlot, text: string): CandidateItem => ({
    item_id: refereeItemId(label, text),
    slot,
    text,
  });
  return [
    item("identity", "identity", c.identity_agency.statement),
    item("embodiment", "embodiment", c.embodiment_topology.statement),
    item("continuity", "continuity", c.continuity_rule.statement),
    ...(c.contact.kind === "CONTACT_ANCHOR"
      ? c.contact.surfaces.map((s, i) => item(`contact-${i + 1}`, "contact", s.statement))
      : [item("no-contact", "no_contact", c.contact.statement.statement)]),
    ...c.baseline_exception.player_overrides.map((s, i) =>
      item(`exception-${i + 1}`, "exception", s.statement),
    ),
    ...c.entry_envelope.items.map((s, i) => item(`possession-${i + 1}`, "possession", s.statement)),
    ...c.baseline_exception.unresolved.map((s, i) => item(`open-${i + 1}`, "open", s)),
  ];
}

/**
 * R-5: the candidate of a prospective intrinsic CLARIFICATION: exactly the player's own statements, each under the one slot that
 * admits a character-local claim over the released baseline (`exception`), with the same item identity the Mirror gives a statement.
 * Nothing else is delivered, so the host decides these words and no others.
 */
export function clarificationCandidateItems(
  statements: readonly string[],
): readonly CandidateItem[] {
  return statements.map((text, i) => ({
    item_id: refereeItemId(`clarification-${i + 1}`, text),
    slot: "exception" as const,
    text,
  }));
}

export const candidateDigest = (items: readonly CandidateItem[]): string => sha256Canonical(items);

// ---------------------------------------------------------------------------------------------
// Task contexts
// ---------------------------------------------------------------------------------------------

export interface I002Context {
  readonly operation: typeof REFEREE_OP_I002;
  readonly campaign_id: string;
  readonly attempt: number;
  readonly subject: { readonly pc_id: string };
  readonly candidate: readonly CandidateItem[];
  /** R-5: the scope of a CLARIFICATION (the accepted baseline, the precise branch, prior closures); absent for an ordinary classification */
  readonly clarification?: I002ClarificationContext;
}

export interface DeliveredFact {
  readonly fact_id: string;
  /**
   * A world/locus fact, a scoped Source Condition, the sealed completed-collection delivery, or - only when the World-State physical
   * custodian published one for this basis - the current viewing circumstance (`viewing`).
   */
  readonly from: "world" | "locus" | "source" | "outcome" | "viewing";
  readonly label: string;
  readonly text: string;
}

export interface IrContext {
  readonly operation: typeof REFEREE_OP_IR;
  readonly campaign_id: string;
  readonly attempt: number;
  readonly subject: {
    readonly pc_id: string;
    readonly world_id: string;
    readonly locus_id: string;
  };
  readonly statement: string;
  readonly pc: readonly CandidateItem[];
  readonly facts: readonly DeliveredFact[];
  readonly refs: readonly RefereeInputRef[];
}

/**
 * The physical-placement context (original active-PC qualified physical-locus custody). Built ONLY from committed facts: the
 * released character, the operative first-ACTIVATION binding (whose preserved native statement is the statement, never a caller's
 * string), and the world and locus the binding couples. The caller names the character and the attempt, nothing else.
 */
export interface PhysicalContext {
  readonly operation: typeof REFEREE_OP_PHYSICAL;
  readonly campaign_id: string;
  readonly attempt: number;
  readonly subject: {
    readonly pc_id: string;
    readonly world_id: string;
    readonly locus_id: string;
  };
  /** the player's separately confirmed native-presence statement, verbatim, as the committed binding preserves it */
  readonly statement: string;
  /** the accepted character's own statements (embodiment first among them) */
  readonly pc: readonly CandidateItem[];
  readonly facts: readonly DeliveredFact[];
  /** the released character, the binding, the world and the locus, at the versions delivered */
  readonly refs: readonly RefereeInputRef[];
}

/**
 * The direct-perception context (BLUE v5.2, F-014D §6). Built ONLY from committed facts at ONE canonical basis: the released
 * character's own statements (the only source of an intrinsic sensory faculty), the operative first-ACTIVATION binding whose preserved
 * native statement is the statement (the player's own words about where the character is), the world and the locus (the physical
 * setting, as committed), and the character's committed physical-locus custody (cited so that a character with no physical position
 * is never asked about). The caller names the character, the attempt and the basis, and nothing else: no scene, no target, no
 * expected result and no test label exists in it.
 *
 * A SOURCE-SCOPED question (the trusted side named ONE already committed World-State Source Condition at the character's own locus)
 * additionally pins that Source Condition as a sixth reference and delivers ONLY its owner-authored access facts, as `source.access.N`
 * facts. Nothing else of the Source Condition is delivered: no quantity, recoverable amount, material class, dimension, key,
 * delivery or establishment statement (the establishment statement is the owner's quantity assertion, not a descriptive premise).
 */
export interface ObservationContext {
  readonly operation: typeof REFEREE_OP_OBSERVATION;
  readonly campaign_id: string;
  readonly attempt: number;
  readonly subject: {
    readonly pc_id: string;
    readonly world_id: string;
    readonly locus_id: string;
  };
  /** the canonical basis the question is asked at: a changed basis is a different question */
  readonly observed_at: CanonicalTime;
  /** the player's separately confirmed native-presence statement, verbatim, as the committed binding preserves it */
  readonly statement: string;
  /** the accepted character's own statements */
  readonly pc: readonly CandidateItem[];
  readonly facts: readonly DeliveredFact[];
  /**
   * the released character, the binding, the custody, the world and the locus, at the versions delivered (in that order); a source-scoped
   * question adds the one Source Condition last
   */
  readonly refs: readonly RefereeInputRef[];
}

/** The trusted side's statement of what the player asked for in a look: a bounded attention text (or none for a bare look). Never a fact. */
export interface SceneRequest {
  readonly kind: "LOOK";
  readonly statement: string | null;
}

/**
 * The current-viewing question (GM_SCENE_RESOLUTION / CURRENT_VIEWING): built ONLY from committed facts at ONE canonical basis plus the
 * trusted side's statement of the request. It names the character, the basis and the request, and nothing else: no scene, no target, no
 * expected result. Its five citations are the observation question's five base ones.
 */
export interface ViewingContext {
  readonly operation: typeof REFEREE_OP_SCENE;
  readonly kind: "CURRENT_VIEWING";
  readonly campaign_id: string;
  readonly attempt: number;
  readonly subject: {
    readonly pc_id: string;
    readonly world_id: string;
    readonly locus_id: string;
  };
  readonly observed_at: CanonicalTime;
  readonly request: SceneRequest;
  /** the player's separately confirmed native-presence statement, verbatim, as the committed binding preserves it */
  readonly statement: string;
  readonly pc: readonly CandidateItem[];
  readonly facts: readonly DeliveredFact[];
  readonly refs: readonly RefereeInputRef[];
}

export type SceneContext = ViewingContext;

export type RefereeContext =
  I002Context | IrContext | PhysicalContext | ObservationContext | SceneContext;

export const contextDigest = (ctx: RefereeContext): string => sha256Canonical(ctx);
/** The task identity: derived from the exact context (so a rerun of the same question is the same task). */
export const refereeTaskId = (ctx: RefereeContext): string =>
  sha256Canonical({ referee_task: 1, context_digest: contextDigest(ctx) });

export const statementDigest = (statement: string): string => sha256Canonical({ statement });

export function i002Context(input: {
  campaign_id: string;
  attempt: number;
  pc_id: string;
  items: readonly CandidateItem[];
  clarification?: I002ClarificationContext | undefined;
}): I002Context {
  return {
    operation: REFEREE_OP_I002,
    campaign_id: input.campaign_id,
    attempt: input.attempt,
    subject: { pc_id: input.pc_id },
    candidate: input.items,
    ...(input.clarification ? { clarification: input.clarification } : {}),
  };
}

type Facts = (key: string) => OwnerFact | undefined;

/** World and locus facts delivered to the host, each with a stable identity the host must assess. */
export function deliveredFacts(
  world: ReturnType<typeof WorldProfileSchema.parse>,
  locus: ReturnType<typeof WorldLocusSchema.parse>,
): DeliveredFact[] {
  const w = (fact_id: string, label: string, text: string): DeliveredFact => ({
    fact_id,
    from: "world",
    label,
    text,
  });
  const basis = world.reference_causal_basis;
  const basisText =
    basis.mode === "ORIGINAL"
      ? `ORIGINAL established canon: ${basis.established_canon}`
      : basis.mode === "EXACT_NAMED_SETTING"
        ? `EXACT_NAMED_SETTING: ${basis.setting}${basis.era_version_continuity ? `; era/version/continuity: ${basis.era_version_continuity}` : ""}`
        : basis.mode === "INSPIRED_BY"
          ? `INSPIRED_BY: ${basis.donor}; structural grammar: ${basis.structural_grammar}`
          : `FACTUAL_HISTORICAL: ${basis.scope}`;
  return [
    w("world.premise", "world premise", world.premise),
    w("world.basis", "reference / causal basis", basisText),
    ...world.material_world_law_departures.map((d, i) =>
      w(`world.departure.${i + 1}`, "material world-law departure", d),
    ),
    ...world.insertion_supporting_constraints.map((c, i) =>
      w(
        `world.constraint.${i + 1}`,
        `insertion-supporting constraint (${c.aspect})`,
        `${c.aspect}: ${c.statement}`,
      ),
    ),
    {
      fact_id: "locus.designation",
      from: "locus",
      label: "locus designation",
      text: locus.designation,
    },
    ...locus.constraints.map((c, i): DeliveredFact => ({
      fact_id: `locus.constraint.${i + 1}`,
      from: "locus",
      label: `locus constraint (${c.aspect})`,
      text: `${c.aspect}: ${c.statement}`,
    })),
  ];
}

/**
 * The IR context, built ONLY from committed facts: the world (premise and reference/causal basis included), its law departures and
 * insertion constraints, the locus (designation and constraints) and the released PC's statements, each at the version delivered.
 * The caller supplies the player's statement and identities, never a world fact.
 */
export function irContext(
  facts: Facts,
  input: {
    campaign_id: string;
    attempt: number;
    pc_id: string;
    world_id: string;
    locus_id: string;
    statement: string;
  },
): { ok: true; context: IrContext } | { ok: false; code: RefereeRefusalCode; message: string } {
  const pcFact = facts(pcExistenceContractKey(input.pc_id));
  const worldFact = facts(worldProfileKey(input.world_id));
  const locusFact = facts(worldLocusKey(input.world_id, input.locus_id));
  if (!pcFact || !worldFact || !locusFact)
    return {
      ok: false,
      code: "CONTEXT_UNAVAILABLE",
      message: "the released character, the world and the locus must all be committed",
    };
  const pc = ExistenceContractSchema.safeParse(pcFact.value);
  const world = WorldProfileSchema.safeParse(worldFact.value);
  const locus = WorldLocusSchema.safeParse(locusFact.value);
  if (!pc.success || !world.success || !locus.success)
    return {
      ok: false,
      code: "CONTEXT_UNAVAILABLE",
      message: "a committed fact does not satisfy its contract",
    };
  const ref = (f: OwnerFact): RefereeInputRef => ({
    fact_key: f.key,
    version: f.version,
    group_id: f.provenance.group_id,
  });
  return {
    ok: true,
    context: {
      operation: REFEREE_OP_IR,
      campaign_id: input.campaign_id,
      attempt: input.attempt,
      subject: { pc_id: input.pc_id, world_id: input.world_id, locus_id: input.locus_id },
      statement: input.statement,
      pc: refereeCandidateItems(pc.data),
      facts: deliveredFacts(world.data, locus.data),
      refs: [ref(pcFact), ref(worldFact), ref(locusFact)],
    },
  };
}

/**
 * The physical-placement context, built ONLY from committed facts (see `PhysicalContext`). Refused unless the operative binding is a
 * first ACTIVATION of exactly this character and its coupled world and locus are committed.
 */
export function physicalContext(
  facts: Facts,
  input: { campaign_id: string; attempt: number; pc_id: string },
):
  | { ok: true; context: PhysicalContext }
  | { ok: false; code: RefereeRefusalCode; message: string } {
  const unavailable = (message: string) => ({
    ok: false as const,
    code: "CONTEXT_UNAVAILABLE" as const,
    message,
  });
  const bindingFact = facts(PLAYER_CHARACTER_BINDING_KEY);
  const pcFact = facts(pcExistenceContractKey(input.pc_id));
  const parsedBinding = bindingFact
    ? PlayerCharacterBindingSchema.safeParse(bindingFact.value)
    : undefined;
  if (!bindingFact || !parsedBinding?.success || !pcFact)
    return unavailable("the released character and its operative binding must be committed");
  const binding = parsedBinding.data;
  if (binding.active_pc.entity_id !== input.pc_id || binding.transition.type !== "ACTIVATION")
    return unavailable("the operative binding is the first ACTIVATION of exactly this character");
  const worldId = binding.coupling.world.entity_id;
  const locusId = binding.coupling.locus.entity_id;
  const worldFact = facts(worldProfileKey(worldId));
  const locusFact = facts(worldLocusKey(worldId, locusId));
  if (!worldFact || !locusFact) return unavailable("the coupled world and locus must be committed");
  const pc = ExistenceContractSchema.safeParse(pcFact.value);
  const world = WorldProfileSchema.safeParse(worldFact.value);
  const locus = WorldLocusSchema.safeParse(locusFact.value);
  if (!pc.success || !world.success || !locus.success)
    return unavailable("a committed fact does not satisfy its contract");
  const ref = (f: OwnerFact): RefereeInputRef => ({
    fact_key: f.key,
    version: f.version,
    group_id: f.provenance.group_id,
  });
  return {
    ok: true,
    context: {
      operation: REFEREE_OP_PHYSICAL,
      campaign_id: input.campaign_id,
      attempt: input.attempt,
      subject: { pc_id: input.pc_id, world_id: worldId, locus_id: locusId },
      statement: binding.transition.basis.statement,
      pc: refereeCandidateItems(pc.data),
      facts: deliveredFacts(world.data, locus.data),
      refs: [ref(pcFact), ref(bindingFact), ref(worldFact), ref(locusFact)],
    },
  };
}

/** The canonical time of the committed temporal state, or null when none is established. */
export function committedCanonicalTime(facts: Facts): CanonicalTime | null {
  const fact = facts(TEMPORAL_STATE_KEY);
  const state = fact ? TemporalStateSchema.safeParse(fact.value) : undefined;
  return state?.success ? state.data.canonical_time : null;
}

/** The delivered fact id of the character's own completed collection (the only `outcome` fact there is). */
export const OBSERVATION_OUTCOME_FACT_ID = "outcome.collection";
const DELIVERY_KEY = /^world\/([^/]+)\/source-delivery\/(.+)$/;

/**
 * CPAA-C1 (v0.3 design ratified; implementation acceptance pending): which completed collection of the character an observation
 * question may cite. `LATEST`: the act the PC's one occupancy slot names (a NEW question); `NONE`: a record asked before any outcome
 * was cited; or exactly the delivery a retained record cited. Never a caller's choice of a fact: the identities are derived from the
 * PC's own records.
 */
export type ObservationOutcomeSelector = "LATEST" | "NONE" | { readonly extraction_id: string };

/**
 * The committed, sealed World-State delivery of the PC's own completed collection, rendered as ONE delivered world fact when it lies at
 * the character's locus and Production has credited it. The text is a mechanical rendering of the typed delivery (amount, unit and the
 * source's material), not a scene and not an appearance: whether the character can perceive it is the host's quote-anchored reading, so
 * canonical truth alone is never the character's knowledge.
 */
function collectionOutcome(
  facts: Facts,
  pcId: string,
  worldId: string,
  locusId: string,
  which: ObservationOutcomeSelector,
): { readonly fact: DeliveredFact; readonly ref: RefereeInputRef } | undefined {
  if (which === "NONE") return undefined;
  let extractionId: string;
  if (which === "LATEST") {
    const slot = facts(popPcOccupancyKey(pcId));
    const occupancy = slot ? PopulationPcOccupancySchema.safeParse(slot.value) : undefined;
    if (!occupancy?.success) return undefined;
    extractionId = pcCollectionRequestId(pcId, occupancy.data.act_id);
  } else extractionId = which.extraction_id;
  if (!extractionId.startsWith(`pc-collect:${pcId}:`)) return undefined;
  const deliveryFact = facts(worldSourceDeliveryKey(worldId, extractionId));
  const delivery = deliveryFact
    ? WorldSourceDeliverySchema.safeParse(deliveryFact.value)
    : undefined;
  if (!deliveryFact || !delivery?.success || delivery.data.delivery_id !== extractionId)
    return undefined;
  const sourceFact = facts(delivery.data.source.fact_key);
  const source = sourceFact ? WorldSourceConditionSchema.safeParse(sourceFact.value) : undefined;
  if (
    !source?.success ||
    source.data.locality.world.entity_id !== worldId ||
    source.data.locality.locus.entity_id !== locusId
  )
    return undefined;
  if (!extractionCredited({ get: facts, has: (k) => facts(k) !== undefined }, extractionId))
    return undefined;
  const d = delivery.data.delivered;
  return {
    fact: {
      fact_id: OBSERVATION_OUTCOME_FACT_ID,
      from: "outcome",
      label: "completed gathering",
      text: `The gathering of ${d.amount} ${d.unit} of ${source.data.material_class} from the source at this place has been completed.`,
    },
    ref: {
      fact_key: deliveryFact.key,
      version: deliveryFact.version,
      group_id: deliveryFact.provenance.group_id,
    },
  };
}

/** The identity of the current viewing circumstance of one basis: derived from the BASIS (never from the wording of a request). */
export function currentViewingId(input: {
  pc_id: string;
  observed_at: CanonicalTime;
  pins: {
    pc: number;
    binding: number;
    custody: number;
    world: number;
    locus: number;
  };
}): string {
  return sha256Canonical({ current_viewing: 1, ...input }).slice(0, 32);
}

const refOf = (f: OwnerFact): RefereeInputRef => ({
  fact_key: f.key,
  version: f.version,
  group_id: f.provenance.group_id,
});

/**
 * The five premises every direct-perception and current-viewing question rests on, read from committed facts: the released character,
 * its operative first-ACTIVATION binding, its ORIGINAL physical-locus custody at the locus the binding couples, and the world and locus.
 */
function observationBase(
  facts: Facts,
  pcId: string,
):
  | {
      ok: true;
      worldId: string;
      locusId: string;
      statement: string;
      pcFact: OwnerFact;
      bindingFact: OwnerFact;
      custodyFact: OwnerFact;
      worldFact: OwnerFact;
      locusFact: OwnerFact;
      pc: ExistenceContract;
      world: ReturnType<typeof WorldProfileSchema.parse>;
      locus: ReturnType<typeof WorldLocusSchema.parse>;
      coupling: {
        world: { entity_id: string; fact_key: string };
        locus: { entity_id: string; fact_key: string };
      };
    }
  | { ok: false; message: string } {
  const unavailable = (message: string) => ({ ok: false as const, message });
  const bindingFact = facts(PLAYER_CHARACTER_BINDING_KEY);
  const pcFact = facts(pcExistenceContractKey(pcId));
  const custodyFact = facts(worldPcLocusCustodyKey(pcId));
  const parsedBinding = bindingFact
    ? PlayerCharacterBindingSchema.safeParse(bindingFact.value)
    : undefined;
  const parsedCustody = custodyFact
    ? PcPhysicalLocusCustodySchema.safeParse(custodyFact.value)
    : undefined;
  if (!bindingFact || !parsedBinding?.success || !pcFact)
    return unavailable("the released character and its operative binding must be committed");
  if (!custodyFact || !parsedCustody?.success)
    return unavailable("the character's committed physical-locus custody must be held");
  const binding = parsedBinding.data;
  const custody = parsedCustody.data;
  if (binding.active_pc.entity_id !== pcId || binding.transition.type !== "ACTIVATION")
    return unavailable("the operative binding is the first ACTIVATION of exactly this character");
  const worldId = binding.coupling.world.entity_id;
  const locusId = binding.coupling.locus.entity_id;
  if (
    custody.pc_id !== pcId ||
    custody.basis.established_from !== ORIGINAL_ACTIVATION ||
    custody.stationary_locus.world.entity_id !== worldId ||
    custody.stationary_locus.world.fact_key !== binding.coupling.world.fact_key ||
    custody.stationary_locus.locus.entity_id !== locusId ||
    custody.stationary_locus.locus.fact_key !== binding.coupling.locus.fact_key
  )
    return unavailable(
      "the custody is the character's ORIGINAL one, at the locus the binding couples",
    );
  const worldFact = facts(worldProfileKey(worldId));
  const locusFact = facts(worldLocusKey(worldId, locusId));
  if (!worldFact || !locusFact) return unavailable("the coupled world and locus must be committed");
  const pc = ExistenceContractSchema.safeParse(pcFact.value);
  const world = WorldProfileSchema.safeParse(worldFact.value);
  const locus = WorldLocusSchema.safeParse(locusFact.value);
  if (!pc.success || !world.success || !locus.success)
    return unavailable("a committed fact does not satisfy its contract");
  return {
    ok: true,
    worldId,
    locusId,
    statement: binding.transition.basis.statement,
    pcFact,
    bindingFact,
    custodyFact,
    worldFact,
    locusFact,
    pc: pc.data,
    world: world.data,
    locus: locus.data,
    coupling: binding.coupling,
  };
}

/**
 * The owner-published SUPPORTED current viewing circumstance of THIS basis, if any. Its key is derived from the basis (the character, the
 * pinned versions of the five base premises and the canonical time), so it is found by identity, never by a scan. A fact at that key that
 * is not exactly what the basis requires FAILS CLOSED (`invalid`); an absent one is simply absent.
 */
function viewingFor(
  facts: Facts,
  pcId: string,
  at: CanonicalTime,
  base: Extract<ReturnType<typeof observationBase>, { ok: true }>,
): { fact: OwnerFact; delivered: DeliveredFact } | null | "invalid" {
  const id = currentViewingId({
    pc_id: pcId,
    observed_at: at,
    pins: {
      pc: base.pcFact.version,
      binding: base.bindingFact.version,
      custody: base.custodyFact.version,
      world: base.worldFact.version,
      locus: base.locusFact.version,
    },
  });
  const fact = facts(worldPcCurrentViewingKey(pcId, id));
  if (!fact) return null;
  const v = PcCurrentViewingSchema.safeParse(fact.value);
  if (
    !v.success ||
    v.data.viewing_id !== id ||
    v.data.pc_id !== pcId ||
    v.data.circumstance.state !== "SUPPORTED" ||
    v.data.observed_at.value !== at.value ||
    v.data.observed_at.unit !== at.unit
  )
    return "invalid";
  return {
    fact,
    delivered: {
      fact_id: "viewing.current",
      from: "viewing",
      label: "ordinary-look feasibility only (published by the physical custodian)",
      // Ratified current-look clause 6: retain the journal's explanatory GM words, but never deliver them as a physical premise.
      // The typed verdict, instant, five-version basis and lawful provenance are the entire published meaning.
      text: canonicalJson({
        state: v.data.circumstance.state,
        observed_at: v.data.observed_at,
        basis: v.data.basis,
        ruling: v.data.ruling,
        ruled_by: v.data.ruled_by,
        custodian: v.data.custodian,
      }),
    },
  };
}

/** The one refusal of every source problem, so that no cause (absent, foreign, elsewhere, exhausted, undescribed) can be told from another. */
const SOURCE_UNAVAILABLE = "no source is available to this observation";

/**
 * The ONE Source Condition a source-scoped question may be about: a committed World-State fact at its own derived key, whose own locality
 * is exactly the world and locus the character's binding couples (and so its ORIGINAL custody holds), still physically present (not
 * exhausted) and stating at least one access fact. Anything else — an absent, malformed, foreign-owned, mislocated or depleted source,
 * or a source that states no descriptive circumstance — is `null`: the question fails closed and nothing is guessed or discovered.
 */
function sourceScope(
  facts: Facts,
  scope: {
    world: { entity_id: string; fact_key: string };
    locus: { entity_id: string; fact_key: string };
  },
  sourceKey: string,
): { fact: OwnerFact; delivered: DeliveredFact[] } | null {
  if (!EntityId.safeParse(sourceKey).success) return null;
  const key = worldSourceConditionKey(scope.world.entity_id, sourceKey);
  const fact = facts(key);
  if (
    !fact ||
    fact.key !== key ||
    fact.owner !== OWNER_WORLD_STATE ||
    fact.facet !== FACET_WORLD_SOURCE_CONDITION
  )
    return null;
  const parsed = WorldSourceConditionSchema.safeParse(fact.value);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (
    s.source_key !== sourceKey ||
    s.locality.world.entity_id !== scope.world.entity_id ||
    s.locality.world.fact_key !== scope.world.fact_key ||
    s.locality.locus.entity_id !== scope.locus.entity_id ||
    s.locality.locus.fact_key !== scope.locus.fact_key ||
    s.exhaustion !== null ||
    s.access_facts.length === 0
  )
    return null;
  return {
    fact,
    delivered: s.access_facts.map((a, i): DeliveredFact => ({
      fact_id: `source.access.${i + 1}`,
      from: "source",
      label: `source access fact (${a.aspect})`,
      text: `${a.aspect}: ${a.statement}`,
    })),
  };
}

/**
 * The direct-perception context, built ONLY from committed facts (see `ObservationContext`) at the supplied canonical basis. Refused
 * unless the operative binding is the first ACTIVATION of exactly this character, the character holds a committed ORIGINAL physical-locus
 * custody at the very locus the binding couples, and the world and locus are committed. `source_key` is TRUSTED-SIDE input only (the
 * operator's choice of one existing candidate source to investigate); the source it names must pass `sourceScope`, and is never
 * discovered, enumerated or inferred here.
 *
 * `scene` says whether the owner-published current viewing circumstance of THIS basis is part of the question. `AUTO` (a new question)
 * includes it if it exists; `NONE` (a legacy question) does not; a retained record is rebuilt with `AUTO` only for the citation it
 * actually made, so a fact published AFTER a decision can never change the question it was asked.
 */
export function observationContext(
  facts: Facts,
  input: {
    campaign_id: string;
    attempt: number;
    pc_id: string;
    observed_at: CanonicalTime;
    /** default `LATEST`: a new question cites the PC's own most recent completed collection, if any */
    outcome?: ObservationOutcomeSelector;
    source_key?: string;
    scene?: { viewing: "AUTO" | "NONE" };
  },
):
  | { ok: true; context: ObservationContext }
  | { ok: false; code: RefereeRefusalCode; message: string } {
  const unavailable = (message: string) => ({
    ok: false as const,
    code: "CONTEXT_UNAVAILABLE" as const,
    message,
  });
  const base = observationBase(facts, input.pc_id);
  if (!base.ok) return unavailable(base.message);
  const { worldId, locusId } = base;
  const source =
    input.source_key === undefined
      ? undefined
      : sourceScope(facts, base.coupling, input.source_key);
  if (input.source_key !== undefined && !source) return unavailable(SOURCE_UNAVAILABLE);
  // Source-scoped and outcome-citing contexts are separate six-reference variants.
  if (input.source_key !== undefined && input.outcome !== undefined && input.outcome !== "NONE")
    return unavailable(SOURCE_UNAVAILABLE);
  const outcome = collectionOutcome(
    facts,
    input.pc_id,
    worldId,
    locusId,
    input.source_key === undefined ? (input.outcome ?? "LATEST") : "NONE",
  );
  const mode = input.scene ?? { viewing: "AUTO" };
  const viewing =
    mode.viewing === "AUTO" ? viewingFor(facts, input.pc_id, input.observed_at, base) : null;
  if (viewing === "invalid")
    return unavailable("the published current viewing circumstance is not this basis's");
  return {
    ok: true,
    context: {
      operation: REFEREE_OP_OBSERVATION,
      campaign_id: input.campaign_id,
      attempt: input.attempt,
      subject: { pc_id: input.pc_id, world_id: worldId, locus_id: locusId },
      observed_at: input.observed_at,
      statement: base.statement,
      pc: refereeCandidateItems(base.pc),
      facts: [
        ...deliveredFacts(base.world, base.locus),
        ...(source?.delivered ?? []),
        ...(outcome ? [outcome.fact] : []),
        ...(viewing ? [viewing.delivered] : []),
      ],
      refs: [
        refOf(base.pcFact),
        refOf(base.bindingFact),
        refOf(base.custodyFact),
        refOf(base.worldFact),
        refOf(base.locusFact),
        ...(outcome ? [outcome.ref] : []),
        ...(source ? [refOf(source.fact)] : []),
        ...(viewing ? [refOf(viewing.fact)] : []),
      ],
    },
  };
}

/**
 * The values that no appearance may carry: a source's identifiers and every exact quantity it ever stated or holds. For a source-scoped
 * question they are NOT in the delivered context (the host is never told them), so they are re-read from the committed Source Condition
 * the question pins, here, wherever an answer is definitively validated. For a question citing the character's completed collection the
 * host IS told the gathering's amount and material, so the set is built from the delivery and its source (`deliveryWithheld`) and what the
 * host may SAY is validated instead. `null` when the question names a source or delivery that cannot be read as one (fail closed).
 */
export interface ObservationWithheld {
  readonly names: readonly string[];
  readonly amounts: readonly number[];
}
const NOTHING_WITHHELD: ObservationWithheld = { names: [], amounts: [] };

/**
 * The same set for the question that cites the character's completed collection. That question DELIVERS the sentence announcing the
 * gathering (its amount, unit and material) to the bound host, so the premise stays and the OUTPUT is validated instead: what the host may
 * say about it is not what the host was told. The set is built from the two committed facts the question's own qualification already
 * validated — the delivery its sixth citation names and the Source Condition that delivery names — at the keys they derive, with no
 * request-supplied selector, search, listing or further read. `null` when either cannot be read as what its key says (fail closed).
 */
function deliveryWithheld(
  facts: Facts,
  ctx: ObservationContext,
  key: string,
): ObservationWithheld | null {
  const cited = DELIVERY_KEY.exec(key);
  const worldId = ctx.subject.world_id;
  if (!cited || cited[1] !== worldId || !cited[2]!.startsWith(`pc-collect:${ctx.subject.pc_id}:`))
    return null;
  const deliveryFact = facts(key);
  const delivery =
    deliveryFact && deliveryFact.key === key && deliveryFact.owner === OWNER_WORLD_STATE
      ? WorldSourceDeliverySchema.safeParse(deliveryFact.value)
      : undefined;
  if (!delivery?.success || delivery.data.delivery_id !== cited[2]) return null;
  const d = delivery.data;
  const sourceKey = worldSourceConditionKey(worldId, d.source.source_key);
  if (d.source.fact_key !== sourceKey) return null;
  const sourceFact = facts(sourceKey);
  const source =
    sourceFact &&
    sourceFact.key === sourceKey &&
    sourceFact.owner === OWNER_WORLD_STATE &&
    sourceFact.facet === FACET_WORLD_SOURCE_CONDITION
      ? WorldSourceConditionSchema.safeParse(sourceFact.value)
      : undefined;
  if (
    !source?.success ||
    source.data.source_key !== d.source.source_key ||
    source.data.locality.world.entity_id !== worldId ||
    source.data.locality.locus.entity_id !== ctx.subject.locus_id
  )
    return null;
  const s = source.data;
  return {
    names: [s.source_key, s.material_class],
    amounts: [
      ...new Set([
        d.delivered.amount,
        d.before.amount,
        d.after.amount,
        s.establishment.quantity.amount,
        s.recoverable.amount,
        ...s.delivered.map((x) => x.quantity.amount),
      ]),
    ],
  };
}

export function observationWithheld(
  facts: Facts,
  ctx: ObservationContext,
): ObservationWithheld | null {
  const layout = parseObservationRefLayout(
    ctx.refs.map((r) => r.fact_key),
    (k) => parseWorldSourceConditionKey(k) !== null,
  );
  if (!layout) return null;
  if (layout.variant.kind === "NONE") return NOTHING_WITHHELD;
  // The other six-reference variant cites a completed delivery: qualified by collectionOutcome, its withheld set built from that delivery.
  if (layout.variant.kind === "DELIVERY") return deliveryWithheld(facts, ctx, layout.variant.key);
  const named = parseWorldSourceConditionKey(layout.variant.key);
  const fact = facts(layout.variant.key);
  const parsed = fact ? WorldSourceConditionSchema.safeParse(fact.value) : undefined;
  if (!named || !parsed?.success || named.world_id !== ctx.subject.world_id) return null;
  const s = parsed.data;
  return {
    names: [s.source_key, s.material_class],
    amounts: [
      ...new Set([
        s.establishment.quantity.amount,
        s.recoverable.amount,
        ...s.delivered.map((d) => d.quantity.amount),
      ]),
    ],
  };
}

/** Case-folded text with every identifier separator and run of spaces read as one space, so `raw-salt` and `Raw salt` are one phrase. */
const spelled = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[-_.:/\s]+/g, " ")
    .trim();
const escaped = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether an appearance's text carries a withheld identifier (as a whole word or phrase, however its separators are spelled) or an
 * exact withheld quantity (as a whole number). Mechanical only: it cannot see that a text MEANS the hidden thing, which stays the
 * host's instructed responsibility.
 */
function carriesWithheld(text: string, withheld: ObservationWithheld): boolean {
  const plain = spelled(text);
  return (
    withheld.names.some((n) =>
      new RegExp(`(?<![a-z0-9])${escaped(spelled(n))}(?![a-z0-9])`).test(plain),
    ) || withheld.amounts.some((n) => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(text))
  );
}

// ---------------------------------------------------------------------------------------------
// Validation and verdict derivation
// ---------------------------------------------------------------------------------------------

export interface RefereeRefusal {
  readonly code: RefereeRefusalCode;
  readonly message: string;
}
const refuse = (code: RefereeRefusalCode, message: string): RefereeRefusal => ({ code, message });

const isNonIntrinsic = (c: string): boolean =>
  (I002_NON_INTRINSIC_CLASSES as readonly string[]).includes(c);

/**
 * Validates a host's I-002 answer against the context it was given and derives the verdict: every delivered item decided exactly
 * once under its own slot; every class that is not "admitted as the player's own for that slot" anchored to a verbatim quotation;
 * a MIXED item names the verbatim part that IS the player's own; an AMBIGUOUS item asks its one narrow question. CLOSED only if
 * every item is admitted as the player's own under its slot. Returns the refusal that names the first incoherence.
 */
export function deriveI002(
  ctx: I002Context,
  decision: I002HostDecision,
):
  | { ok: true; verdict: RefereeVerdict & ("CLOSED" | "BLOCKED" | "CLARIFY") }
  | { ok: false; refusal: RefereeRefusal } {
  if (decision.task_id !== refereeTaskId(ctx))
    return { ok: false, refusal: refuse("TASK_MISMATCH", "the answer is for another task") };
  const byId = new Map(ctx.candidate.map((i) => [i.item_id, i]));
  const seen = new Set<string>();
  for (const d of decision.items) {
    const item = byId.get(d.item_id);
    if (!item)
      return {
        ok: false,
        refusal: refuse(
          "COVERAGE_INCOMPLETE",
          `an answer names an item that was not delivered: ${d.item_id}`,
        ),
      };
    if (seen.has(d.item_id))
      return {
        ok: false,
        refusal: refuse("COVERAGE_INCOMPLETE", `an item is decided twice: ${d.item_id}`),
      };
    seen.add(d.item_id);
    if (d.slot !== item.slot)
      return {
        ok: false,
        refusal: refuse("DECISION_INCOHERENT", `the slot of ${d.item_id} is not the one delivered`),
      };
    const admitted = I002_ADMITTED_CLASS[item.slot];
    const quoted = (q: string | null) => q !== null && item.text.includes(q);
    if (d.class === admitted) {
      if (d.intrinsic_excerpt !== null || d.other_classes.length > 0 || d.clarification !== null)
        return {
          ok: false,
          refusal: refuse(
            "DECISION_INCOHERENT",
            `${d.item_id}: an admitted item carries no excerpt, other class or question`,
          ),
        };
      if (d.evidence_quote !== null && !quoted(d.evidence_quote))
        return {
          ok: false,
          refusal: refuse("GROUNDS_UNSUPPORTED", `${d.item_id}: the quotation is not in the item`),
        };
    } else if (d.class === "MIXED") {
      if (
        !quoted(d.evidence_quote) ||
        !quoted(d.intrinsic_excerpt) ||
        d.other_classes.length === 0 ||
        d.clarification !== null
      )
        return {
          ok: false,
          refusal: refuse(
            "GROUNDS_UNSUPPORTED",
            `${d.item_id}: a mixed item quotes the part that is not the player's own, quotes the part that is, and names what the rest is`,
          ),
        };
    } else if (d.class === "AMBIGUOUS") {
      if (d.clarification === null || d.intrinsic_excerpt !== null || d.other_classes.length > 0)
        return {
          ok: false,
          refusal: refuse(
            "DECISION_INCOHERENT",
            `${d.item_id}: an ambiguous item asks its one narrow question`,
          ),
        };
      if (d.evidence_quote !== null && !quoted(d.evidence_quote))
        return {
          ok: false,
          refusal: refuse("GROUNDS_UNSUPPORTED", `${d.item_id}: the quotation is not in the item`),
        };
    } else if (isNonIntrinsic(d.class)) {
      if (
        !quoted(d.evidence_quote) ||
        d.intrinsic_excerpt !== null ||
        d.other_classes.length > 0 ||
        d.clarification !== null
      )
        return {
          ok: false,
          refusal: refuse(
            "GROUNDS_UNSUPPORTED",
            `${d.item_id}: a claim that is not the player's own is anchored to a verbatim quotation of it`,
          ),
        };
    } else {
      // an intrinsic-kind class that is not the one this slot admits (e.g. an own-character claim placed in the Entry Envelope)
      if (d.intrinsic_excerpt !== null || d.other_classes.length > 0 || d.clarification !== null)
        return {
          ok: false,
          refusal: refuse(
            "DECISION_INCOHERENT",
            `${d.item_id}: carries fields its class does not use`,
          ),
        };
      if (d.evidence_quote !== null && !quoted(d.evidence_quote))
        return {
          ok: false,
          refusal: refuse("GROUNDS_UNSUPPORTED", `${d.item_id}: the quotation is not in the item`),
        };
    }
  }
  if (seen.size !== byId.size)
    return {
      ok: false,
      refusal: refuse("COVERAGE_INCOMPLETE", "every delivered item must be decided exactly once"),
    };
  const scoped = clarificationRefusal(ctx, decision);
  if (scoped) return { ok: false, refusal: scoped };
  return {
    ok: true,
    verdict: i002VerdictOf(decision, (id) => byId.get(id)?.slot, ctx.clarification !== undefined),
  };
}

const MIN_GROUND = 8;
/**
 * R-5 (BLUE H-1): a clarification task is answered with its scope reading and an ordinary one is not. The reading is anchored to
 * verbatim quotations of the DELIVERED text: the new words state the duration, and (for the compatible scope) the character's own
 * accepted baseline states the actuator whose cycle they time, so words that time something the baseline does not accept cannot be read
 * as compatible. The verdict is derived from it (i002VerdictOf), never read.
 */
function clarificationRefusal(ctx: I002Context, decision: I002HostDecision): RefereeRefusal | null {
  const reading: I002ClarificationReading | undefined = decision.clarification;
  if (!ctx.clarification) {
    return reading === undefined
      ? null
      : refuse(
          "DECISION_INCOHERENT",
          "an ordinary classification carries no clarification reading",
        );
  }
  if (!reading)
    return refuse(
      "COVERAGE_INCOMPLETE",
      "a clarification task is answered with its scope reading: whether the branch is still unresolved and what the words state",
    );
  const candidateText = ctx.candidate.map((c) => c.text);
  const baselineText = ctx.clarification.baseline.map((b) => b.text);
  const inAny = (q: string, texts: readonly string[]) =>
    q.length >= MIN_GROUND && texts.some((t) => t.includes(q));
  if (!inAny(reading.candidate_ground, candidateText))
    return refuse(
      "GROUNDS_UNSUPPORTED",
      "the clarification's candidate ground is a verbatim quotation of the new words",
    );
  if (reading.baseline_ground !== null && !inAny(reading.baseline_ground, baselineText))
    return refuse(
      "GROUNDS_UNSUPPORTED",
      "the clarification's baseline ground is a verbatim quotation of the character's accepted statements",
    );
  if (reading.scope === "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE") {
    if (reading.baseline_ground === null)
      return refuse(
        "GROUNDS_UNSUPPORTED",
        "words read as only a duration of the existing cycle quote the accepted baseline statement of the actuator they time",
      );
    if (reading.clarification !== null)
      return refuse("DECISION_INCOHERENT", "only an unclear scope asks a question");
  } else if (reading.scope === "UNCLEAR") {
    if (reading.clarification === null)
      return refuse("DECISION_INCOHERENT", "an unclear scope asks its one narrow question");
  } else if (reading.clarification !== null) {
    return refuse("DECISION_INCOHERENT", "only an unclear scope asks a question");
  }
  return null;
}

/** The I-002 verdict as a function of the answer and each item's slot alone (re-derivable from the retained record). */
export function i002VerdictOf(
  decision: I002HostDecision,
  slotOf: (itemId: string) => RefereeCandidateSlot | undefined,
  clarificationTask = false,
): "CLOSED" | "BLOCKED" | "CLARIFY" {
  let blocked = false;
  let clarify = false;
  if (clarificationTask) {
    // R-5: closed only when the branch is still unresolved AND the words state only the duration of the accepted actuator's cycle
    const r = decision.clarification;
    if (
      !r ||
      r.branch !== "UNRESOLVED_BEFORE" ||
      r.scope !== "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE"
    ) {
      blocked = true;
      if (r?.scope === "UNCLEAR") clarify = true;
    }
  }
  for (const d of decision.items) {
    const slot = slotOf(d.item_id) ?? d.slot;
    if (d.class === I002_ADMITTED_CLASS[slot]) continue;
    blocked = true;
    if (d.class === "AMBIGUOUS") clarify = true;
  }
  return !blocked ? "CLOSED" : clarify ? "CLARIFY" : "BLOCKED";
}

/**
 * Validates a host's IR answer against the context it was given and derives the verdict: the player's statement is quoted; every
 * delivered world and locus fact is assessed exactly once; SUPPORTS and CONTRADICTS are anchored to a verbatim quotation of that
 * fact; an unclear fact or an ambiguous reading asks its one narrow question and nothing else does. BIND_ELIGIBLE only if the reading
 * is the supported native/already-there mode and no fact is contradicted or unclear.
 */
export function deriveIr(
  ctx: IrContext,
  decision: IrHostDecision,
):
  | { ok: true; verdict: "BIND_ELIGIBLE" | "UNSUPPORTED_BRIDGE" | "WORLD_CONFLICT" | "UNRESOLVED" }
  | { ok: false; refusal: RefereeRefusal } {
  if (decision.task_id !== refereeTaskId(ctx))
    return { ok: false, refusal: refuse("TASK_MISMATCH", "the answer is for another task") };
  if (!ctx.statement.includes(decision.reading.evidence_quote))
    return {
      ok: false,
      refusal: refuse(
        "GROUNDS_UNSUPPORTED",
        "the reading's quotation is not in the player's statement",
      ),
    };
  const byId = new Map(ctx.facts.map((f) => [f.fact_id, f]));
  const seen = new Set<string>();
  let anyUnclear = false;
  for (const a of decision.assessments) {
    const fact = byId.get(a.fact_id);
    if (!fact)
      return {
        ok: false,
        refusal: refuse(
          "COVERAGE_INCOMPLETE",
          `an assessment names a fact that was not delivered: ${a.fact_id}`,
        ),
      };
    if (seen.has(a.fact_id))
      return {
        ok: false,
        refusal: refuse("COVERAGE_INCOMPLETE", `a fact is assessed twice: ${a.fact_id}`),
      };
    seen.add(a.fact_id);
    const needsQuote = a.relation === "SUPPORTS" || a.relation === "CONTRADICTS";
    if (needsQuote && (a.evidence_quote === null || !fact.text.includes(a.evidence_quote)))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          `${a.fact_id}: ${a.relation} is anchored to a verbatim quotation of that fact`,
        ),
      };
    if (!needsQuote && a.evidence_quote !== null && !fact.text.includes(a.evidence_quote))
      return {
        ok: false,
        refusal: refuse("GROUNDS_UNSUPPORTED", `${a.fact_id}: the quotation is not in the fact`),
      };
    if (a.relation === "UNCLEAR") anyUnclear = true;
  }
  if (seen.size !== byId.size)
    return {
      ok: false,
      refusal: refuse(
        "COVERAGE_INCOMPLETE",
        "every delivered world and locus fact must be assessed exactly once",
      ),
    };
  const needsQuestion = decision.reading.mode === "AMBIGUOUS" || anyUnclear;
  if (needsQuestion !== (decision.clarification !== null))
    return {
      ok: false,
      refusal: refuse(
        "DECISION_INCOHERENT",
        "a clarification is asked exactly when the reading is ambiguous or a fact is unclear",
      ),
    };
  return { ok: true, verdict: irVerdictOf(decision) };
}

/** The IR verdict as a function of the answer alone (re-derivable from the retained record). */
export function irVerdictOf(
  decision: IrHostDecision,
): "BIND_ELIGIBLE" | "UNSUPPORTED_BRIDGE" | "WORLD_CONFLICT" | "UNRESOLVED" {
  const m = decision.reading.mode;
  if (m !== "NATIVE_ALREADY_THERE" && m !== "AMBIGUOUS") return "UNSUPPORTED_BRIDGE";
  if (decision.assessments.some((a) => a.relation === "CONTRADICTS")) return "WORLD_CONFLICT";
  if (m === "AMBIGUOUS" || decision.assessments.some((a) => a.relation === "UNCLEAR"))
    return "UNRESOLVED";
  return "BIND_ELIGIBLE";
}

type AssessmentCheck =
  | { ok: true; anyUnclear: boolean; anyContradicts: boolean }
  | { ok: false; refusal: RefereeRefusal };

/** Every delivered world and locus fact assessed exactly once; SUPPORTS and CONTRADICTS anchored to a verbatim quotation of that fact. */
function checkAssessments(
  facts: readonly DeliveredFact[],
  assessments: IrHostDecision["assessments"],
): AssessmentCheck {
  const byId = new Map(facts.map((f) => [f.fact_id, f]));
  const seen = new Set<string>();
  let anyUnclear = false;
  let anyContradicts = false;
  for (const a of assessments) {
    const fact = byId.get(a.fact_id);
    if (!fact)
      return {
        ok: false,
        refusal: refuse(
          "COVERAGE_INCOMPLETE",
          `an assessment names a fact that was not delivered: ${a.fact_id}`,
        ),
      };
    if (seen.has(a.fact_id))
      return {
        ok: false,
        refusal: refuse("COVERAGE_INCOMPLETE", `a fact is assessed twice: ${a.fact_id}`),
      };
    seen.add(a.fact_id);
    const needsQuote = a.relation === "SUPPORTS" || a.relation === "CONTRADICTS";
    if (needsQuote && (a.evidence_quote === null || !fact.text.includes(a.evidence_quote)))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          `${a.fact_id}: ${a.relation} is anchored to a verbatim quotation of that fact`,
        ),
      };
    if (!needsQuote && a.evidence_quote !== null && !fact.text.includes(a.evidence_quote))
      return {
        ok: false,
        refusal: refuse("GROUNDS_UNSUPPORTED", `${a.fact_id}: the quotation is not in the fact`),
      };
    if (a.relation === "UNCLEAR") anyUnclear = true;
    if (a.relation === "CONTRADICTS") anyContradicts = true;
  }
  if (seen.size !== byId.size)
    return {
      ok: false,
      refusal: refuse(
        "COVERAGE_INCOMPLETE",
        "every delivered world and locus fact must be assessed exactly once",
      ),
    };
  return { ok: true, anyUnclear, anyContradicts };
}

/**
 * Validates a host's physical-placement answer against the context it was given and derives the verdict: the embodiment reading is
 * anchored to a verbatim quotation of one delivered character statement; the presence reading and every dependency to a verbatim
 * quotation of the player's native-presence statement; every delivered world and locus fact is assessed exactly once; a question is
 * asked exactly when something is ambiguous or unclear. PHYSICAL_ELIGIBLE only if the accepted embodiment is ONE material body, the
 * statement places it natively at THIS locus, nothing rests on an independent actor or an external claim, and no fact is
 * contradicted or unclear. A verdict is never read from the host.
 */
export function derivePhysical(
  ctx: PhysicalContext,
  decision: PhysicalHostDecision,
): { ok: true; verdict: PhysicalVerdict } | { ok: false; refusal: RefereeRefusal } {
  if (decision.task_id !== refereeTaskId(ctx))
    return { ok: false, refusal: refuse("TASK_MISMATCH", "the answer is for another task") };
  const item = ctx.pc.find((i) => i.item_id === decision.embodiment.item_id);
  if (!item)
    return {
      ok: false,
      refusal: refuse(
        "COVERAGE_INCOMPLETE",
        `the embodiment reading names a character statement that was not delivered: ${decision.embodiment.item_id}`,
      ),
    };
  if (!item.text.includes(decision.embodiment.evidence_quote))
    return {
      ok: false,
      refusal: refuse(
        "GROUNDS_UNSUPPORTED",
        "the embodiment reading's quotation is not in the character statement it names",
      ),
    };
  if (!ctx.statement.includes(decision.presence.evidence_quote))
    return {
      ok: false,
      refusal: refuse(
        "GROUNDS_UNSUPPORTED",
        "the presence reading's quotation is not in the player's statement",
      ),
    };
  for (const c of decision.external_claims) {
    if (!ctx.statement.includes(c.evidence_quote))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          "an external claim's quotation is not in the player's statement",
        ),
      };
    // a claim stated ALONGSIDE the presence must stand apart from the words that establish the presence: those words may not include it
    if (
      c.bearing === "CONJUNCTIVE" &&
      !quotesDisjoint(ctx.statement, decision.presence.evidence_quote, c.evidence_quote)
    )
      return {
        ok: false,
        refusal: refuse(
          "DECISION_INCOHERENT",
          "a conjunctive claim stands apart from the words that establish the presence: the presence quotation may not contain it (a claim the presence rests on is CONTINGENT)",
        ),
      };
  }
  const checked = checkAssessments(ctx.facts, decision.assessments);
  if (!checked.ok) return checked;
  const needsQuestion =
    decision.embodiment.mode === "AMBIGUOUS" ||
    decision.presence.mode === "AMBIGUOUS" ||
    checked.anyUnclear;
  if (needsQuestion !== (decision.clarification !== null))
    return {
      ok: false,
      refusal: refuse(
        "DECISION_INCOHERENT",
        "a clarification is asked exactly when the embodiment or presence is ambiguous or a fact is unclear",
      ),
    };
  return { ok: true, verdict: physicalVerdictOf(decision) };
}

/** Whether two verbatim excerpts of `text` can be located so that their spans do not overlap. */
function quotesDisjoint(text: string, a: string, b: string): boolean {
  const spans = (q: string): number[] => {
    const out: number[] = [];
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) out.push(i);
    return out;
  };
  return spans(a).some((i) => spans(b).some((j) => i + a.length <= j || j + b.length <= i));
}

export type PhysicalVerdict =
  | "PHYSICAL_ELIGIBLE"
  | "NOT_PHYSICAL_SINGLE_LOCUS"
  | "PHYSICAL_WORLD_CONFLICT"
  | "PHYSICAL_UNRESOLVED";

/**
 * The physical-placement verdict as a function of the answer alone (re-derivable from the retained record). A definite reading that
 * is not one material body originally present at this locus, or whose presence is CONTINGENT on an external claim, is
 * NOT_PHYSICAL_SINGLE_LOCUS (a CONJUNCTIVE external claim stated alongside a presence the player's own words establish does not change the
 * verdict, and is accepted into nothing); then
 * a contradicted world fact; then anything ambiguous or unclear is unresolved; only the remainder is eligible.
 */
export function physicalVerdictOf(decision: PhysicalHostDecision): PhysicalVerdict {
  const e = decision.embodiment.mode;
  const p = decision.presence.mode;
  if (
    (e !== "SINGLE_MATERIAL_BODY" && e !== "AMBIGUOUS") ||
    (p !== "NATIVE_AT_THIS_LOCUS" && p !== "AMBIGUOUS") ||
    decision.external_claims.some((c) => c.bearing === "CONTINGENT")
  )
    return "NOT_PHYSICAL_SINGLE_LOCUS";
  if (decision.assessments.some((a) => a.relation === "CONTRADICTS"))
    return "PHYSICAL_WORLD_CONFLICT";
  if (
    e === "AMBIGUOUS" ||
    p === "AMBIGUOUS" ||
    decision.assessments.some((a) => a.relation === "UNCLEAR")
  )
    return "PHYSICAL_UNRESOLVED";
  return "PHYSICAL_ELIGIBLE";
}

export type ObservationVerdict =
  | "OBSERVATION_ESTABLISHED"
  | "OBSERVATION_OBSTRUCTED"
  | "OBSERVATION_UNRESOLVED"
  | "OBSERVATION_WORLD_CONFLICT";

/** The delivered text one premise cites, or undefined when it names nothing that was delivered. */
function premiseText(ctx: ObservationContext, p: ObservationPremise): string | undefined {
  if (p.from === "PC_STATEMENT") return ctx.pc.find((i) => i.item_id === p.ref)?.text;
  if (p.from === "PLACEMENT_STATEMENT")
    return p.ref === OBSERVATION_PLACEMENT_REF ? ctx.statement : undefined;
  if (p.from === "CURRENT_VIEWING")
    return ctx.facts.find((f) => f.fact_id === p.ref && f.from === "viewing")?.text;
  // a world fact is never the viewing circumstance: that is cited only as CURRENT_VIEWING
  return ctx.facts.find((f) => f.fact_id === p.ref && f.from !== "viewing")?.text;
}

/**
 * Validates a host's direct-perception answer against the context it was given and derives the verdict (F-014D §§5 steps 2-4, 6).
 * Nothing here understands the premises: it checks that every claim is anchored to a verbatim quotation of DELIVERED text of the kind
 * of premise that may establish it (the faculty only on the character's own statements; the viewing circumstances only on the
 * confirmed placement statement and world facts; the path and the appearance only on world facts), that every delivered fact is
 * assessed exactly once, that a payload exists only when the whole question is affirmatively answered, and that the payload carries
 * no engine reference. The verdict is DERIVED: a missing faculty, unestablished circumstances or an open fork is UNRESOLVED and is
 * never read as an obstruction; OBSTRUCTED needs an established blocked path from an established viewing position.
 */
export function deriveObservation(
  ctx: ObservationContext,
  decision: ObservationHostDecision,
  withheld: ObservationWithheld = NOTHING_WITHHELD,
): { ok: true; verdict: ObservationVerdict } | { ok: false; refusal: RefereeRefusal } {
  if (decision.task_id !== refereeTaskId(ctx))
    return { ok: false, refusal: refuse("TASK_MISMATCH", "the answer is for another task") };
  const elements = [
    ["faculty", decision.faculty],
    ["position", decision.position],
    ["path", decision.path],
  ] as const;
  const cited: ObservationPremise[] = [
    ...elements.flatMap(([, e]) => e.premises),
    ...(decision.payload?.basis ?? []),
  ];
  for (const p of cited) {
    const text = premiseText(ctx, p);
    if (text === undefined)
      return {
        ok: false,
        refusal: refuse(
          "COVERAGE_INCOMPLETE",
          `a premise names text that was not delivered: ${p.ref}`,
        ),
      };
    if (!text.includes(p.evidence_quote))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          `${p.ref}: the quotation is not in the premise it cites`,
        ),
      };
  }
  const only = (list: readonly ObservationPremise[], kinds: readonly string[]) =>
    list.every((p) => kinds.includes(p.from));
  if (!only(decision.faculty.premises, ["PC_STATEMENT"]))
    return {
      ok: false,
      refusal: refuse(
        "DECISION_INCOHERENT",
        "the faculty rests only on the character's own statements: no sensory ability is invented from the world, the placement or a label",
      ),
    };
  if (!only(decision.position.premises, ["PLACEMENT_STATEMENT", "WORLD_FACT"]))
    return {
      ok: false,
      refusal: refuse(
        "DECISION_INCOHERENT",
        "the viewing circumstances require independent affirmative placement or specific physical-owner evidence; ordinary-look feasibility and GM narration cannot establish position, orientation or eye state",
      ),
    };
  if (!only(decision.path.premises, ["WORLD_FACT"]))
    return {
      ok: false,
      refusal: refuse("DECISION_INCOHERENT", "the path rests only on committed world facts"),
    };
  if (decision.payload && !only(decision.payload.basis, ["WORLD_FACT"]))
    return {
      ok: false,
      refusal: refuse("DECISION_INCOHERENT", "the appearance rests only on committed world facts"),
    };
  const needs = (state: string, ok: string, list: readonly ObservationPremise[], what: string) =>
    state === ok && list.length === 0
      ? refuse("GROUNDS_UNSUPPORTED", `${what} is established only by quoted premises`)
      : null;
  const missing =
    needs(decision.faculty.state, "ESTABLISHED", decision.faculty.premises, "the faculty") ??
    needs(decision.position.state, "ESTABLISHED", decision.position.premises, "the position") ??
    needs(decision.path.state, "OPEN", decision.path.premises, "an open path") ??
    needs(decision.path.state, "BLOCKED", decision.path.premises, "a blocked path");
  if (missing) return { ok: false, refusal: missing };
  const checked = checkAssessments(ctx.facts, decision.assessments);
  if (!checked.ok) return checked;
  const verdict = observationVerdictOf(decision);
  const payload = decision.payload;
  if (payload !== null) {
    if (verdict !== "OBSERVATION_ESTABLISHED")
      return {
        ok: false,
        refusal: refuse(
          "DECISION_INCOHERENT",
          "an appearance is stated only when the whole direct-perception question is affirmatively answered",
        ),
      };
    const source = ctx.facts.find(
      (f) => f.fact_id === payload.source_fact_id && f.from !== "viewing",
    );
    if (!source)
      return {
        ok: false,
        refusal: refuse(
          "COVERAGE_INCOMPLETE",
          `the appearance names a source fact that was not delivered: ${payload.source_fact_id}`,
        ),
      };
    // a question scoped to one Source Condition is answered by an appearance OF that source: the receipt pins it, never a neighbouring fact
    if (
      parseWorldSourceConditionKey(ctx.refs[OBSERVATION_BASE_REFS]?.fact_key ?? "") &&
      source.from !== "source"
    )
      return {
        ok: false,
        refusal: refuse(
          "DECISION_INCOHERENT",
          "a source-scoped observation states the appearance of that source, not of another fact",
        ),
      };
    if (!payload.basis.some((p) => p.ref === payload.source_fact_id))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          "the appearance is anchored to a quotation of the source fact it is of",
        ),
      };
    const forbidden = [
      ...ctx.facts.map((f) => f.fact_id),
      ...ctx.refs.map((r) => r.fact_key),
      ctx.subject.pc_id,
      ctx.subject.world_id,
      ctx.subject.locus_id,
    ];
    for (const text of [payload.referent, payload.content]) {
      if (forbidden.some((t) => text.includes(t)))
        return {
          ok: false,
          refusal: refuse(
            "GROUNDS_UNSUPPORTED",
            "an appearance carries no engine reference: no fact, key or identity",
          ),
        };
      if (carriesWithheld(text, withheld))
        return {
          ok: false,
          refusal: refuse(
            "GROUNDS_UNSUPPORTED",
            "an appearance carries nothing the source's owner withholds: no source identifier, material class or exact quantity",
          ),
        };
    }
  }
  return { ok: true, verdict };
}

/**
 * The direct-perception verdict as a function of the answer alone (re-derivable from the retained record). A contradicted world fact
 * is a conflict; an ESTABLISHED blocked path from an ESTABLISHED viewing position is the physical negative; anything else not fully and
 * affirmatively answered — a missing faculty, unestablished circumstances, an unestablished path, an unclear fact, no appearance — is
 * UNRESOLVED, never an obstruction; only the remainder is a receipt.
 */
export function observationVerdictOf(decision: ObservationHostDecision): ObservationVerdict {
  if (decision.assessments.some((a) => a.relation === "CONTRADICTS"))
    return "OBSERVATION_WORLD_CONFLICT";
  if (decision.path.state === "BLOCKED" && decision.position.state === "ESTABLISHED")
    return "OBSERVATION_OBSTRUCTED";
  if (
    decision.faculty.state !== "ESTABLISHED" ||
    decision.position.state !== "ESTABLISHED" ||
    decision.path.state !== "OPEN" ||
    decision.assessments.some((a) => a.relation === "UNCLEAR") ||
    decision.payload === null
  )
    return "OBSERVATION_UNRESOLVED";
  return "OBSERVATION_ESTABLISHED";
}

// ---------------------------------------------------------------------------------------------
// GM_SCENE_RESOLUTION: the current viewing circumstance
// ---------------------------------------------------------------------------------------------

const REQUEST_STATEMENT_MAX = 240;
const hasControlChar = (t: string): boolean => {
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};

/**
 * The current-viewing context, built ONLY from committed facts at the supplied canonical basis plus the trusted side's request. The request
 * is bounded plain text (or none for a bare look); it is DELIVERED to the host so that it can tell an ordinary look from a materially new
 * commitment, and it is part of the question's identity, but it is never a fact and never a premise a ruling may rest on alone.
 */
export function viewingContext(
  facts: Facts,
  input: {
    campaign_id: string;
    attempt: number;
    pc_id: string;
    observed_at: CanonicalTime;
    request: SceneRequest;
  },
):
  { ok: true; context: ViewingContext } | { ok: false; code: RefereeRefusalCode; message: string } {
  const unavailable = (message: string) => ({
    ok: false as const,
    code: "CONTEXT_UNAVAILABLE" as const,
    message,
  });
  const st = input.request.statement;
  if (
    input.request.kind !== "LOOK" ||
    (st !== null &&
      (st.length === 0 ||
        st.length > REQUEST_STATEMENT_MAX ||
        st !== st.trim() ||
        hasControlChar(st)))
  )
    return unavailable("the request is a bounded plain-text look");
  const base = observationBase(facts, input.pc_id);
  if (!base.ok) return unavailable(base.message);
  return {
    ok: true,
    context: {
      operation: REFEREE_OP_SCENE,
      kind: "CURRENT_VIEWING",
      campaign_id: input.campaign_id,
      attempt: input.attempt,
      subject: { pc_id: input.pc_id, world_id: base.worldId, locus_id: base.locusId },
      observed_at: input.observed_at,
      request: { kind: "LOOK", statement: st },
      statement: base.statement,
      pc: refereeCandidateItems(base.pc),
      facts: deliveredFacts(base.world, base.locus),
      refs: [
        refOf(base.pcFact),
        refOf(base.bindingFact),
        refOf(base.custodyFact),
        refOf(base.worldFact),
        refOf(base.locusFact),
      ],
    },
  };
}

export type SceneVerdict =
  | "VIEWING_SUPPORTED"
  | "VIEWING_NOT_SUPPORTED"
  | "VIEWING_UNRESOLVED"
  | "PLAYER_CHOICE_REQUIRED"
  | "LOOK_ORDINARY"
  | "LOOK_UNCLEAR"
  | "SCENE_WORLD_CONFLICT";

/**
 * The scene verdict as a function of the answer alone (re-derivable from the retained record). A contradicted world fact is a conflict; a
 * request that carries a materially new commitment is returned to the player; only an ordinary look that the host affirmatively rules
 * physically supported, with no unclear delivered fact, is VIEWING_SUPPORTED; anything else not fully answered is UNRESOLVED, never an
 * obstruction.
 */
export function sceneVerdictOf(d: SceneHostDecision): SceneVerdict {
  if (d.assessments.some((a) => a.relation === "CONTRADICTS")) return "SCENE_WORLD_CONFLICT";
  const unclear = d.assessments.some((a) => a.relation === "UNCLEAR");
  const v = d.viewing;
  if (v === null) return "VIEWING_UNRESOLVED";
  if (v.request.classification === "MATERIAL_NEW_COMMITMENT") return "PLAYER_CHOICE_REQUIRED";
  // the player's WORDS (a non-null quotation exists exactly when words were delivered) are only classified: the physical circumstance is
  // the unchanged basis's one ruling, asked of the basis alone
  const worded = v.request.evidence_quote !== null;
  if (v.request.classification === "UNCLEAR") return worded ? "LOOK_UNCLEAR" : "VIEWING_UNRESOLVED";
  if (worded) return "LOOK_ORDINARY";
  if (v.state === "NOT_SUPPORTED") return "VIEWING_NOT_SUPPORTED";
  return v.state === "SUPPORTED" && !unclear ? "VIEWING_SUPPORTED" : "VIEWING_UNRESOLVED";
}

/** The delivered text one scene premise cites, or undefined when it names nothing that was delivered. */
function scenePremiseText(
  ctx: SceneContext,
  p: ObservationPremise,
): { text: string } | { refusal: RefereeRefusal } | undefined {
  if (p.from === "CURRENT_VIEWING")
    return {
      refusal: refuse(
        "DECISION_INCOHERENT",
        "a scene ruling does not rest on a viewing circumstance: it is what the ruling PRODUCES",
      ),
    };
  const t =
    p.from === "PC_STATEMENT"
      ? ctx.pc.find((i) => i.item_id === p.ref)?.text
      : p.from === "PLACEMENT_STATEMENT"
        ? p.ref === OBSERVATION_PLACEMENT_REF
          ? ctx.statement
          : undefined
        : ctx.facts.find((f) => f.fact_id === p.ref)?.text;
  return t === undefined ? undefined : { text: t };
}

/** Whether a text carries an engine reference (a fact id, a key, or one of the question's identities). */
const carriesEngineReference = (text: string, ctx: SceneContext): boolean =>
  [
    ...ctx.facts.map((f) => f.fact_id),
    ...ctx.refs.map((r) => r.fact_key),
    ctx.subject.pc_id,
    ctx.subject.world_id,
    ctx.subject.locus_id,
  ].some((t) => text.includes(t));

/**
 * Validates a host's scene answer against the context it was given and derives the verdict. Nothing here understands the premises: it
 * checks that every claim is anchored to a verbatim quotation of DELIVERED text of a kind that may establish it, that every delivered
 * fact is assessed exactly once, and that the answer is coherent with its own state (a supported ruling states its circumstance and rests on
 * the character's accepted words or the confirmed placement - never on the request alone; a materially new commitment is returned, not
 * ruled on). The verdict is DERIVED.
 */
export function deriveScene(
  ctx: SceneContext,
  decision: SceneHostDecision,
): { ok: true; verdict: SceneVerdict } | { ok: false; refusal: RefereeRefusal } {
  const incoherent = (message: string) => ({
    ok: false as const,
    refusal: refuse("DECISION_INCOHERENT", message),
  });
  if (decision.task_id !== refereeTaskId(ctx))
    return { ok: false, refusal: refuse("TASK_MISMATCH", "the answer is for another task") };
  if (decision.kind !== ctx.kind)
    return incoherent("the answer is for the other kind of scene question");
  const checked = checkAssessments(ctx.facts, decision.assessments);
  if (!checked.ok) return checked;
  const cite = (
    premises: readonly ObservationPremise[],
  ): { ok: true } | { ok: false; refusal: RefereeRefusal } => {
    for (const p of premises) {
      const found = scenePremiseText(ctx, p);
      if (found === undefined)
        return {
          ok: false,
          refusal: refuse(
            "COVERAGE_INCOMPLETE",
            `a premise names text that was not delivered: ${p.ref}`,
          ),
        };
      if ("refusal" in found) return { ok: false, refusal: found.refusal };
      if (!found.text.includes(p.evidence_quote))
        return {
          ok: false,
          refusal: refuse(
            "GROUNDS_UNSUPPORTED",
            `${p.ref}: the quotation is not in the premise it cites`,
          ),
        };
    }
    return { ok: true };
  };
  const v = decision.viewing;
  if (v === null) return incoherent("a viewing question is answered by a viewing ruling");
  const asked = ctx.request.statement;
  if (asked === null) {
    if (v.request.evidence_quote !== null)
      return {
        ok: false,
        refusal: refuse("GROUNDS_UNSUPPORTED", "a bare look has no request statement to quote"),
      };
  } else if (v.request.evidence_quote === null || !asked.includes(v.request.evidence_quote))
    return {
      ok: false,
      refusal: refuse(
        "GROUNDS_UNSUPPORTED",
        "the request reading is anchored to a quotation of the request",
      ),
    };
  const cited = cite(v.premises);
  if (!cited.ok) return cited;
  if (asked !== null) {
    // The player's words are CLASSIFIED here and nothing else: no physical ruling rests on, or is reopened by, how a look was worded.
    if (v.state !== "NOT_ESTABLISHED" || v.premises.length > 0 || v.statement !== null)
      return incoherent(
        "the words of a request are classified here, not ruled on physically: the physical circumstance is the one ruling of the unchanged basis",
      );
    return { ok: true, verdict: sceneVerdictOf(decision) };
  }
  if (v.request.classification !== "ORDINARY_LOOK")
    return incoherent("a bare look has no words to carry a commitment: it is an ordinary look");
  if (v.state === "SUPPORTED") {
    if (v.statement === null)
      return incoherent("a supported ruling states the circumstance it supports");
    if (!v.premises.some((p) => p.from === "PC_STATEMENT" || p.from === "PLACEMENT_STATEMENT"))
      return {
        ok: false,
        refusal: refuse(
          "GROUNDS_UNSUPPORTED",
          "a request alone is not a physical result: the ruling rests on the character's accepted words or the confirmed placement",
        ),
      };
    if (carriesEngineReference(v.statement, ctx))
      return {
        ok: false,
        refusal: refuse("GROUNDS_UNSUPPORTED", "a ruling's statement carries no engine reference"),
      };
  } else if (v.statement !== null) {
    return incoherent("only a supported ruling states a circumstance");
  }
  if (v.state === "NOT_SUPPORTED" && v.premises.length === 0)
    return {
      ok: false,
      refusal: refuse(
        "GROUNDS_UNSUPPORTED",
        "a refusal is anchored to the quoted premise that vetoes the look",
      ),
    };
  return { ok: true, verdict: sceneVerdictOf(decision) };
}

/** The scene record's context, re-derived from the committed facts it cites (the same discipline as every other record). */
function sceneRecordViolation(
  r: Extract<RefereeDecisionRecord, { operation: typeof REFEREE_OP_SCENE }>,
  facts: Facts,
): RecordViolation {
  const incoherent = (message: string): RecordViolation => ({
    code: "DECISION_INCOHERENT",
    message,
    stale: false,
  });
  if (r.input.candidate !== null) return incoherent("a scene record carries no candidate");
  let superseded = false;
  for (const ref of r.input.refs) {
    const f = facts(ref.fact_key);
    if (!f)
      return {
        code: "CONTEXT_UNAVAILABLE",
        message: `a cited fact is not committed: ${ref.fact_key}`,
        stale: false,
      };
    if (f.version > ref.version) {
      superseded = true;
      continue;
    }
    if (f.version < ref.version || f.provenance.group_id !== ref.group_id)
      return {
        code: "CONTEXT_STALE",
        message: `a cited fact is not at the cited version: ${ref.fact_key}`,
        stale: true,
      };
  }
  const keys = r.input.refs.map((x) => x.fact_key);
  const verdictOnly = (): RecordViolation =>
    sceneVerdictOf(r.decision) === r.verdict
      ? null
      : incoherent("the record's verdict is not the one its answer derives");
  const ids = irIdentities(r);
  if (
    !ids ||
    keys.length !== OBSERVATION_BASE_REFS ||
    keys[0] !== pcExistenceContractKey(r.subject.pc_id) ||
    keys[1] !== PLAYER_CHARACTER_BINDING_KEY ||
    keys[2] !== worldPcLocusCustodyKey(r.subject.pc_id) ||
    keys[3] !== worldProfileKey(ids.world_id) ||
    keys[4] !== worldLocusKey(ids.world_id, ids.locus_id) ||
    r.input.statement_digest !==
      (r.input.statement === null ? null : statementDigest(r.input.statement))
  )
    return incoherent("a viewing record cites the five base premises and its request digest");
  if (superseded)
    return r.decision.task_id === r.task_id
      ? verdictOnly()
      : incoherent("the record's task binding is not its own");
  const built = viewingContext(facts, {
    campaign_id: r.campaign_id,
    attempt: r.attempt,
    pc_id: r.subject.pc_id,
    observed_at: r.input.observed_at,
    request: { kind: "LOOK", statement: r.input.statement },
  });
  if (!built.ok) return { code: built.code, message: built.message, stale: false };
  if (
    r.input.digest !== contextDigest(built.context) ||
    r.task_id !== refereeTaskId(built.context) ||
    !sameRefs(built.context.refs, r.input.refs)
  )
    return incoherent(
      "the record's digests are not those of the context built from the cited facts",
    );
  const d = deriveScene(built.context, r.decision);
  if (!d.ok) return { code: d.refusal.code, message: d.refusal.message, stale: false };
  return d.verdict === r.verdict
    ? null
    : incoherent("the record's verdict is not the one its answer derives");
}

/** The context a retained record was decided on, re-derived from the record alone (I-002) or from committed facts (IR). */
export function recordContextViolation(r: RefereeDecisionRecord, facts: Facts): RecordViolation {
  if (r.operation === REFEREE_OP_I002) {
    if (r.input.candidate === null || r.input.statement !== null)
      return {
        code: "DECISION_INCOHERENT",
        message: "an I-002 record carries its candidate and no statement",
        stale: false,
      };
    const ctx = i002Context({
      campaign_id: r.campaign_id,
      attempt: r.attempt,
      pc_id: r.subject.pc_id,
      items: r.input.candidate,
      clarification: r.input.clarification,
    });
    if (
      r.input.digest !== contextDigest(ctx) ||
      r.input.candidate_digest !== candidateDigest(r.input.candidate) ||
      r.task_id !== refereeTaskId(ctx)
    )
      return {
        code: "DECISION_INCOHERENT",
        message: "the record's digests are not those of its candidate",
        stale: false,
      };
    if (r.input.refs.length !== 0)
      return {
        code: "DECISION_INCOHERENT",
        message: "an I-002 record cites no committed fact",
        stale: false,
      };
    const d = deriveI002(ctx, r.decision);
    if (!d.ok) return { code: d.refusal.code, message: d.refusal.message, stale: false };
    return d.verdict === r.verdict
      ? null
      : {
          code: "DECISION_INCOHERENT",
          message: "the record's verdict is not the one its answer derives",
          stale: false,
        };
  }
  if (r.operation === REFEREE_OP_PHYSICAL) return physicalRecordViolation(r, facts);
  if (r.operation === REFEREE_OP_OBSERVATION) return observationRecordViolation(r, facts);
  if (r.operation === REFEREE_OP_SCENE) return sceneRecordViolation(r, facts);
  if (r.input.statement === null || r.input.candidate !== null)
    return {
      code: "DECISION_INCOHERENT",
      message: "an IR record carries its statement and no candidate",
      stale: false,
    };
  // The pinned facts must be at the pinned versions to REBUILD the context. A later version never invalidates a decision, and it is
  // never a reason to stop verifying the record: the record is then checked on what it retains (below), without recomputing its
  // answer against facts it was not given. (The cited kinds are SEALED, so a later version cannot be admitted; this is defence in depth.)
  let superseded = false;
  for (const ref of r.input.refs) {
    const f = facts(ref.fact_key);
    if (!f)
      return {
        code: "CONTEXT_UNAVAILABLE",
        message: `a cited fact is not committed: ${ref.fact_key}`,
        stale: false,
      };
    if (f.version > ref.version) {
      superseded = true;
      continue;
    }
    if (f.version < ref.version || f.provenance.group_id !== ref.group_id)
      return {
        code: "CONTEXT_STALE",
        message: `a cited fact is not at the cited version: ${ref.fact_key}`,
        stale: true,
      };
  }
  const ids = irIdentities(r);
  if (!ids)
    return {
      code: "DECISION_INCOHERENT",
      message: "an IR record cites the released character, the world and the locus",
      stale: false,
    };
  if (superseded) {
    // the historical basis is verified from the record alone: identities, statement, task binding and the verdict its answer derives
    if (
      r.input.statement_digest !== statementDigest(r.input.statement) ||
      r.decision.task_id !== r.task_id
    )
      return {
        code: "DECISION_INCOHERENT",
        message: "the record's statement digest or task binding is not its own",
        stale: false,
      };
    return irVerdictOf(r.decision) === r.verdict
      ? null
      : {
          code: "DECISION_INCOHERENT",
          message: "the record's verdict is not the one its answer derives",
          stale: false,
        };
  }
  const built = irContext(facts, {
    campaign_id: r.campaign_id,
    attempt: r.attempt,
    pc_id: r.subject.pc_id,
    ...ids,
    statement: r.input.statement,
  });
  if (!built.ok) return { code: built.code, message: built.message, stale: false };
  if (
    r.input.digest !== contextDigest(built.context) ||
    r.task_id !== refereeTaskId(built.context) ||
    r.input.statement_digest !== statementDigest(r.input.statement)
  )
    return {
      code: "DECISION_INCOHERENT",
      message: "the record's digests are not those of the context built from the cited facts",
      stale: false,
    };
  if (!sameRefs(built.context.refs, r.input.refs))
    return {
      code: "DECISION_INCOHERENT",
      message: "the record cites exactly the facts its context was built from",
      stale: false,
    };
  const d = deriveIr(built.context, r.decision);
  if (!d.ok) return { code: d.refusal.code, message: d.refusal.message, stale: false };
  return d.verdict === r.verdict
    ? null
    : {
        code: "DECISION_INCOHERENT",
        message: "the record's verdict is not the one its answer derives",
        stale: false,
      };
}

type RecordViolation = { code: RefereeRefusalCode; message: string; stale: boolean } | null;

/** The physical-placement record's context, re-derived from the committed facts it cites (the same discipline as the IR record). */
function physicalRecordViolation(
  r: Extract<RefereeDecisionRecord, { operation: typeof REFEREE_OP_PHYSICAL }>,
  facts: Facts,
): RecordViolation {
  const incoherent = (message: string): RecordViolation => ({
    code: "DECISION_INCOHERENT",
    message,
    stale: false,
  });
  if (r.input.statement === null || r.input.candidate !== null)
    return incoherent("a physical-placement record carries its statement and no candidate");
  let superseded = false;
  for (const ref of r.input.refs) {
    const f = facts(ref.fact_key);
    if (!f)
      return {
        code: "CONTEXT_UNAVAILABLE",
        message: `a cited fact is not committed: ${ref.fact_key}`,
        stale: false,
      };
    if (f.version > ref.version) {
      superseded = true;
      continue;
    }
    if (f.version < ref.version || f.provenance.group_id !== ref.group_id)
      return {
        code: "CONTEXT_STALE",
        message: `a cited fact is not at the cited version: ${ref.fact_key}`,
        stale: true,
      };
  }
  const ids = irIdentities(r);
  const pcKey = pcExistenceContractKey(r.subject.pc_id);
  const keys = r.input.refs.map((x) => x.fact_key);
  if (
    !ids ||
    keys.length !== 4 ||
    keys[0] !== pcKey ||
    keys[1] !== PLAYER_CHARACTER_BINDING_KEY ||
    keys[2] !== worldProfileKey(ids.world_id) ||
    keys[3] !== worldLocusKey(ids.world_id, ids.locus_id)
  )
    return incoherent(
      "a physical-placement record cites the released character, the binding, the world and the locus",
    );
  if (superseded) {
    if (
      r.input.statement_digest !== statementDigest(r.input.statement) ||
      r.decision.task_id !== r.task_id
    )
      return incoherent("the record's statement digest or task binding is not its own");
    return physicalVerdictOf(r.decision) === r.verdict
      ? null
      : incoherent("the record's verdict is not the one its answer derives");
  }
  const built = physicalContext(facts, {
    campaign_id: r.campaign_id,
    attempt: r.attempt,
    pc_id: r.subject.pc_id,
  });
  if (!built.ok) return { code: built.code, message: built.message, stale: false };
  if (
    built.context.statement !== r.input.statement ||
    built.context.subject.world_id !== ids.world_id ||
    built.context.subject.locus_id !== ids.locus_id ||
    r.input.digest !== contextDigest(built.context) ||
    r.task_id !== refereeTaskId(built.context) ||
    r.input.statement_digest !== statementDigest(r.input.statement)
  )
    return incoherent(
      "the record's digests are not those of the context built from the cited facts",
    );
  if (!sameRefs(built.context.refs, r.input.refs))
    return incoherent("the record cites exactly the facts its context was built from");
  const d = derivePhysical(built.context, r.decision);
  if (!d.ok) return { code: d.refusal.code, message: d.refusal.message, stale: false };
  return d.verdict === r.verdict
    ? null
    : incoherent("the record's verdict is not the one its answer derives");
}

/** The direct-perception record's context, re-derived from the committed facts it cites (the same discipline as the physical record). */
function observationRecordViolation(
  r: Extract<RefereeDecisionRecord, { operation: typeof REFEREE_OP_OBSERVATION }>,
  facts: Facts,
): RecordViolation {
  const incoherent = (message: string): RecordViolation => ({
    code: "DECISION_INCOHERENT",
    message,
    stale: false,
  });
  if (r.input.statement === null || r.input.candidate !== null)
    return incoherent("a direct-perception record carries its statement and no candidate");
  let superseded = false;
  for (const ref of r.input.refs) {
    const f = facts(ref.fact_key);
    if (!f)
      return {
        code: "CONTEXT_UNAVAILABLE",
        message: `a cited fact is not committed: ${ref.fact_key}`,
        stale: false,
      };
    if (f.version > ref.version) {
      superseded = true;
      continue;
    }
    if (f.version < ref.version || f.provenance.group_id !== ref.group_id)
      return {
        code: "CONTEXT_STALE",
        message: `a cited fact is not at the cited version: ${ref.fact_key}`,
        stale: true,
      };
  }
  const ids = irIdentities(r);
  const pcKey = pcExistenceContractKey(r.subject.pc_id);
  const keys = r.input.refs.map((x) => x.fact_key);
  const layout = parseObservationRefLayout(keys, (k) => parseWorldSourceConditionKey(k) !== null);
  const cited = layout?.variant.kind === "DELIVERY" ? DELIVERY_KEY.exec(layout.variant.key) : null;
  const named =
    layout?.variant.kind === "SCOPED" ? parseWorldSourceConditionKey(layout.variant.key) : null;
  if (
    !ids ||
    !layout ||
    (layout.variant.kind === "SCOPED" && !(named && named.world_id === ids.world_id)) ||
    (layout.variant.kind === "DELIVERY" && !(cited && cited[1] === ids.world_id)) ||
    (layout.viewing !== null && layout.viewing.pc_id !== r.subject.pc_id) ||
    keys[0] !== pcKey ||
    keys[1] !== PLAYER_CHARACTER_BINDING_KEY ||
    keys[2] !== worldPcLocusCustodyKey(r.subject.pc_id) ||
    keys[3] !== worldProfileKey(ids.world_id) ||
    keys[4] !== worldLocusKey(ids.world_id, ids.locus_id)
  )
    return incoherent(
      "a direct-perception record cites five base premises, at most one scoped Source Condition or completed-collection delivery, and (after a scene resolution) the owner-published viewing circumstance",
    );
  if (superseded) {
    if (
      r.input.statement_digest !== statementDigest(r.input.statement) ||
      r.decision.task_id !== r.task_id
    )
      return incoherent("the record's statement digest or task binding is not its own");
    // the scope of the appearance is a property of the record alone: a source-scoped reading is of its source, an ordinary one never is
    if (
      (r.decision.payload?.source_fact_id.startsWith("source.") ?? false) !== (named !== null) &&
      r.decision.payload !== null
    )
      return incoherent("a source-scoped reading states the appearance of its source, and only it");
    return observationVerdictOf(r.decision) === r.verdict
      ? null
      : incoherent("the record's verdict is not the one its answer derives");
  }
  const built = observationContext(facts, {
    campaign_id: r.campaign_id,
    attempt: r.attempt,
    pc_id: r.subject.pc_id,
    observed_at: r.input.observed_at,
    outcome: cited ? { extraction_id: cited[2]! } : "NONE",
    ...(named ? { source_key: named.source_key } : {}),
    // a fact published AFTER this decision can never change the question it was asked: only what the record cited is rebuilt
    scene: { viewing: layout.viewing !== null ? "AUTO" : "NONE" },
  });
  if (!built.ok) return { code: built.code, message: built.message, stale: false };
  if (
    built.context.statement !== r.input.statement ||
    built.context.subject.world_id !== ids.world_id ||
    built.context.subject.locus_id !== ids.locus_id ||
    r.input.digest !== contextDigest(built.context) ||
    r.task_id !== refereeTaskId(built.context) ||
    r.input.statement_digest !== statementDigest(r.input.statement)
  )
    return incoherent(
      "the record's digests are not those of the context built from the cited facts",
    );
  if (!sameRefs(built.context.refs, r.input.refs))
    return incoherent("the record cites exactly the facts its context was built from");
  const withheld = observationWithheld(facts, built.context);
  if (!withheld) return { code: "CONTEXT_UNAVAILABLE", message: SOURCE_UNAVAILABLE, stale: false };
  const d = deriveObservation(built.context, r.decision, withheld);
  if (!d.ok) return { code: d.refusal.code, message: d.refusal.message, stale: false };
  return d.verdict === r.verdict
    ? null
    : incoherent("the record's verdict is not the one its answer derives");
}

const sameRefs = (a: readonly RefereeInputRef[], b: readonly RefereeInputRef[]): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.fact_key === b[i]!.fact_key && x.version === b[i]!.version && x.group_id === b[i]!.group_id,
  );

/** world and locus identities of an IR record, from its cited fact keys. */
export function irIdentities(
  r: RefereeDecisionRecord,
): { world_id: string; locus_id: string } | null {
  const world = r.input.refs.find((x) => /^world\/[^/]+\/profile$/.test(x.fact_key));
  const locus = r.input.refs.find((x) => /^world\/[^/]+\/locus\/[^/]+$/.test(x.fact_key));
  if (!world || !locus) return null;
  const w = /^world\/([^/]+)\/profile$/.exec(world.fact_key)![1]!;
  const m = /^world\/([^/]+)\/locus\/([^/]+)$/.exec(locus.fact_key)!;
  return m[1] === w ? { world_id: w, locus_id: m[2]! } : null;
}

export { REFEREE_SOURCES };
