import {
  ExistenceContractSchema,
  OWNER_PC_EXISTENCE,
  PC_COLLECTION_INTENT_KIND,
  PC_COLLECTION_INTERACTION_FLOOR,
  PLAYER_CHARACTER_BINDING_KEY,
  PcCollectionCommitInputSchema,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachAnswerSchema,
  PcCollectionReachDecisionSchema,
  PcCollectionReachTaskSchema,
  PC_REPRESENTATION_OUTSIDE,
  PC_SCENE_VERDICT_ESTABLISHED,
  PcCollectionCycleAttestationSchema,
  PopulationPcRepresentationSchema,
  pcCollectionAttestationKey,
  popPcRepresentationKey,
  worldLocusKey,
  worldProfileKey,
  ProductionPcCollectionWorkSchema,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldSourceConditionSchema,
  compareTime,
  fail,
  ok,
  pcCollectionCommitmentId,
  pcCollectionCessationKey,
  pcCollectionCommitmentKey,
  pcCollectionMechanismKey,
  pcCollectionReachKey,
  pcCollectionRequestId,
  pcCollectionRequestKey,
  pcExistenceContractKey,
  popPcOccupancyKey,
  productionExtractionObjectId,
  productionPcCollectionTerminationKey,
  productionPcCollectionWorkKey,
  productionReserveKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  worldSourceConditionKey,
  type CanonicalTime,
  type OwnerFact,
  type PcCollectionCommitInput,
  type PcCollectionCommitment,
  type PcCollectionMechanism,
  type PcCollectionReachDecision,
  type PcCollectionReachTask,
  type PcCollectionSceneEvidence,
  type ProductionPcCollectionWork,
  type ProductionQuantity,
  type ProductionRequest,
  type Result,
  type WorldSourceCondition,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import {
  buildSceneEvidence,
  deriveSceneVerdict,
  derivePcRepresentation,
  pcCycleAttestationViolation,
  pcStationaryLocus,
  statesExactDuration,
  type ScanFacts,
} from "./determinations.ts";
import { pcClaimAt } from "../pc-capability/derive.ts";
import { pcPhysicalLocusCustodyViolation, type FactView } from "../world/pc-locus-custody.ts";
import { pcOccupancyRecord, pcOccupancyState } from "./state.ts";

/**
 * CPAA-C1 v0.2 PROVISIONAL CANDIDATE LOWERING (see `@immortalis/contracts` `pc-collection.ts`): not ratified, not adopted design
 * authority. The rules below are the single statement of each fact (used by admission when a fact is written and again by load
 * verification against the facts as they stood before it, so the two cannot drift). They judge identity, authority, provenance and
 * derivation only; they invent no rate, duration, floor, access verdict or availability: each is read from the owner that holds it.
 */

const PREREQ = "PREREQUISITE_MISSING" as const;
const refuse = (message: string) => fail(PREREQ, message);

const parseFact = <T>(
  facts: FactView,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { fact: OwnerFact; value: T } | undefined => {
  const fact = facts.get(key);
  const v = fact ? schema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data as T } : undefined;
};

const sourceOf = (facts: FactView, key: string) =>
  parseFact<WorldSourceCondition>(facts, key, WorldSourceConditionSchema);

// ---------------------------------------------------------------------------------------------
// C2/C3 — the player's commitment-of-record and the PC-owned request.
// ---------------------------------------------------------------------------------------------

/**
 * The commitment-of-record a confirmed lawful player choice determines. Pure and mechanical: the caller names identities, one exact
 * amount and its authored authority only; every pin is a version read from committed state, the material and unit come from the
 * source, and a missing referent is never invented.
 */
export function derivePcCollectionCommitment(
  input: PcCollectionCommitInput,
  source: { getFact(key: string): OwnerFact | undefined },
  mechanismId: string,
): Result<PcCollectionCommitment, typeof PREREQ> {
  const get = (k: string) => source.getFact(k);
  const sourceKey = worldSourceConditionKey(input.source.world_id, input.source.source_key);
  const reserveKey = productionReserveKey(input.reserve_id);
  const src = sourceOf({ get, has: (k) => get(k) !== undefined }, sourceKey);
  const reserve = get(reserveKey);
  if (!src) return refuse("the World-State Source Condition is not established");
  if (!reserve) return refuse("the destination Production Reserve is not established");
  const version = (k: string): number => get(k)?.version ?? 0;
  const pcId = input.pc_id;
  // v0.3 F-2: the act rests on the PC's mechanism AND its owner-qualified semantic attestation, both committed BEFORE the act
  const mechKey = pcCollectionMechanismKey(pcId, mechanismId);
  const attKey = pcCollectionAttestationKey(pcId, mechanismId);
  if (!get(mechKey)) return refuse("no established mechanism of this PC is committed");
  if (!get(attKey))
    return refuse(
      "no semantic attestation of the PC's serial cycle is committed: the exact positive is withheld",
    );
  const value = PcCollectionCommitmentSchema.safeParse({
    commitment_id: pcCollectionCommitmentId(pcId, input.act_id),
    pc_id: pcId,
    act_id: input.act_id,
    authored_under: input.authored_under,
    intent: {
      kind: PC_COLLECTION_INTENT_KIND,
      source: {
        fact_key: sourceKey,
        source_key: input.source.source_key,
        world_id: input.source.world_id,
      },
      material_class: src.value.material_class,
      quantity: input.quantity,
      destination: { fact_key: reserveKey, reserve_id: input.reserve_id },
    },
    basis: {
      pinned_versions: {
        pc: version(pcExistenceContractKey(pcId)),
        binding: version(PLAYER_CHARACTER_BINDING_KEY),
        custody: version(worldPcLocusCustodyKey(pcId)),
        source: version(sourceKey),
        reserve: version(reserveKey),
      },
      cycle: {
        mechanism: { fact_key: mechKey, version: version(mechKey) },
        attestation: { fact_key: attKey, version: version(attKey) },
      },
    },
    committer: { owner: OWNER_PC_EXISTENCE, facet: "pc_voluntary_commitment" },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable commitment");
}

export const parsePcCollectionCommitInput = (v: unknown) =>
  PcCollectionCommitInputSchema.safeParse(v);

/**
 * The PC-owned Production Request a commitment-of-record determines: exactly the existing WS-003 §13A envelope, scoped to the
 * source's own locality, sourced to the PC-side commitment, with no priority/authority reference (none is representable).
 */
export function derivePcCollectionRequest(
  commitment: PcCollectionCommitment,
  source: WorldSourceCondition,
): ProductionRequest {
  return {
    request_id: pcCollectionRequestId(commitment.pc_id, commitment.act_id),
    source: {
      owner: OWNER_PC_EXISTENCE,
      cause_ref: pcCollectionCommitmentKey(commitment.pc_id, commitment.act_id),
    },
    requested_output: {
      output_class: commitment.intent.material_class,
      quantity: commitment.intent.quantity,
    },
    scope: source.locality,
    priority_authority_ref: null,
  };
}

/** The operative binding names this PC, at version, and the PC's released contract and stationary custody hold as the one authority. */
export function pcStandingViolation(
  pcId: string,
  facts: FactView,
):
  | { reason: string }
  | { binding: OwnerFact; pc: OwnerFact; custody: OwnerFact; sourceLocus: unknown } {
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success) return { reason: "no active PC binding is committed" };
  if (binding.data.active_pc.entity_id !== pcId)
    return {
      reason: "the active PC binding names this very PC: a wrong or inactive PC cannot act",
    };
  const pcFact = facts.get(pcExistenceContractKey(pcId));
  if (!pcFact || !ExistenceContractSchema.safeParse(pcFact.value).success)
    return { reason: "the PC's released contract is committed" };
  const custodyKey = worldPcLocusCustodyKey(pcId);
  const custodyFact = facts.get(custodyKey);
  const custody = custodyFact ? PcPhysicalLocusCustodySchema.safeParse(custodyFact.value) : null;
  if (!custodyFact || !custody?.success)
    return {
      reason:
        "the PC's physical-locus custody record is committed: nothing is done from an invented locus",
    };
  const locus = pcStationaryLocus(pcId, custody.data, facts);
  if ("reason" in locus) return locus;
  // after a SETTLED leg the custody record is immutable predecessor provenance of the ORIGIN and World-State's destination is the one
  // authority: the record is then judged as it stood, without the destination facts the settled leg legitimately added
  const violation = pcPhysicalLocusCustodyViolation(
    custodyKey,
    custody.data,
    locus.settled
      ? apartFromSettledLeg(facts, custody.data.stationary_locus.world.entity_id, pcId)
      : facts,
  );
  if (violation)
    return { reason: `the PC's custody does not hold as the one authority: ${violation}` };
  return { binding: bindingFact, pc: pcFact, custody: custodyFact, sourceLocus: locus.locus };
}

/** The same facts without the four that a settled single leg adds (the destination commit and the Logistics records). */
const apartFromSettledLeg = (facts: FactView, worldId: string, pcId: string): FactView => {
  const hidden = new Set([
    worldFallbackEntityKey(worldId, pcId),
    worldEntityTransitionKey(worldId, pcId),
    logisticsCommitmentKey(worldId, pcId),
    logisticsTransferKey(worldId, pcId),
  ]);
  return {
    get: (k) => (hidden.has(k) ? undefined : facts.get(k)),
    has: (k) => !hidden.has(k) && facts.has(k),
  };
};

/**
 * What a collection commitment-of-record must be, judged against committed facts: it is at the slot and has the identity derived from
 * its PC and act; the very PC is the active PC at the pinned binding; its stationary custody is the one authority and is AT the
 * source's own locus; the source is a committed World-State Source Condition of the named world and key; the destination Reserve
 * holds the same material in the same unit at the source's locality; every pin is the exact current version.
 */
export function pcCollectionCommitmentViolation(
  key: string,
  c: PcCollectionCommitment,
  facts: FactView,
  verify = false,
): string | null {
  const pcId = c.pc_id;
  if (
    key !== pcCollectionCommitmentKey(pcId, c.act_id) ||
    c.commitment_id !== pcCollectionCommitmentId(pcId, c.act_id)
  )
    return "a collection commitment is at the slot, and has the identity, derived from its PC and act identities";
  const standing = pcStandingViolation(pcId, facts);
  if ("reason" in standing) return standing.reason;
  const i = c.intent;
  const srcKey = worldSourceConditionKey(i.source.world_id, i.source.source_key);
  if (i.source.fact_key !== srcKey) return "the source reference does not match its key identity";
  const src = sourceOf(facts, srcKey);
  if (!src)
    return "the source is a committed World-State Source Condition: a commitment creates none";
  if (
    src.value.source_key !== i.source.source_key ||
    src.value.material_class !== i.material_class ||
    src.value.recoverable.unit !== i.quantity.unit
  )
    return "the commitment names the source's own key, material and unit";
  if (!canonicalEqual(src.value.locality, standing.sourceLocus))
    return "the PC is stationary at the source's own locus: collection is direct, from where the PC is";
  const reserveKey = productionReserveKey(i.destination.reserve_id);
  const reserveFact = facts.get(reserveKey);
  const reserve = reserveFact ? ProductionReserveSchema.safeParse(reserveFact.value) : null;
  if (
    i.destination.fact_key !== reserveKey ||
    !reserveFact ||
    !reserve?.success ||
    reserve.data.material_class !== i.material_class ||
    reserve.data.quantity.unit !== i.quantity.unit ||
    !canonicalEqual(reserve.data.locality, src.value.locality)
  )
    return "the destination is an already-established local Production Reserve of the same material and unit at the source's locality";
  const pins = c.basis.pinned_versions;
  // the source and the Reserve ADVANCE with their own deliveries and credits: when a loaded campaign is re-verified, the pin is the
  // version the commitment was authored against and so may not exceed the current one; at admission it is exactly the current one
  const advancing = (pinned: number, current: number) =>
    verify ? pinned <= current : pinned === current;
  if (
    pins.pc !== standing.pc.version ||
    pins.binding !== standing.binding.version ||
    pins.custody !== standing.custody.version ||
    !advancing(pins.source, src.fact.version) ||
    !advancing(pins.reserve, reserveFact.version)
  )
    return "the commitment was not authored against the committed contract, binding, custody, source and Reserve versions: a stale or forged commitment fails";
  // v0.3 F-2 (effective before the act): the mechanism and its attestation are committed, pinned at their exact (sealed) versions,
  // and the attestation holds against the mechanism it attests
  const cycle = c.basis.cycle;
  const mechId = (/^pc\/[^/]+\/collection-mechanism\/([^/]+)$/.exec(cycle.mechanism.fact_key) ??
    [])[1];
  if (!mechId || cycle.mechanism.fact_key !== pcCollectionMechanismKey(pcId, mechId))
    return "the commitment rests on one of the PC's own mechanisms";
  if (cycle.attestation.fact_key !== pcCollectionAttestationKey(pcId, mechId))
    return "the commitment rests on the attestation of that very mechanism";
  const mechFact = facts.get(cycle.mechanism.fact_key);
  const attFact = facts.get(cycle.attestation.fact_key);
  if (
    !mechFact ||
    !attFact ||
    mechFact.version !== cycle.mechanism.version ||
    attFact.version !== cycle.attestation.version
  )
    return "the commitment pins the committed mechanism and its semantic attestation at their exact versions: an unattested cycle grounds no exact completion";
  const att = PcCollectionCycleAttestationSchema.safeParse(attFact.value);
  if (!att.success) return "the attestation is a well-formed owner record";
  const av = pcCycleAttestationViolation(attFact.key, att.data, facts, true);
  if (av) return `the attestation does not hold: ${av}`;
  return null;
}

/** The request is exactly what the committed commitment determines, and the commitment still holds. */
export function pcCollectionRequestViolation(
  key: string,
  r: ProductionRequest,
  facts: FactView,
  verify = false,
): string | null {
  const m = PC_COLLECTION_REQUEST_KEY_RE.exec(key);
  if (!m) return "a PC-owned collection request is in the PC-side collection key space";
  const [, pcId, actId] = m as unknown as [string, string, string];
  if (key !== pcCollectionRequestKey(pcId, actId))
    return "a PC-owned request is at the slot derived from its PC and act identities";
  const commitmentKey = pcCollectionCommitmentKey(pcId, actId);
  const commitment = parseFact<PcCollectionCommitment>(
    facts,
    commitmentKey,
    PcCollectionCommitmentSchema,
  );
  if (!commitment)
    return "a PC-owned request exists only for a committed player commitment: Production and World-State create no willingness";
  const violation = pcCollectionCommitmentViolation(commitmentKey, commitment.value, facts, verify);
  if (violation) return `the commitment-of-record does not hold: ${violation}`;
  const src = sourceOf(facts, commitment.value.intent.source.fact_key);
  if (!src) return "the source is committed";
  if (!canonicalEqual(r, derivePcCollectionRequest(commitment.value, src.value)))
    return "a PC-owned request is exactly what the player's commitment-of-record determines";
  return null;
}
const PC_COLLECTION_REQUEST_KEY_RE = /^pc\/([^/]+)\/collection\/([^/]+)\/request$/;

// ---------------------------------------------------------------------------------------------
// C6 / P-1 — the mechanism carrier.
// ---------------------------------------------------------------------------------------------

const MIN_QUOTE_LENGTH = 8;

/**
 * A mechanism fact holds when it is at the slot derived from its PC and mechanism identity; the PC's own released contract is
 * committed at the pinned version; every cited claim is an accepted claim of that contract (a hypothesis or unresolved item has no
 * locator); and every statement the mechanism carries is GROUNDED in that authored content: the actuator and traversal statements
 * and the cycle's `authored_quote` are each a verbatim quotation of a cited claim, and the cycle quotation states the exact numeral
 * and the canonical unit of τ. The check is textual (the authored words say exactly this number in this unit): it cannot judge that
 * the words mean "one handling cycle", and it never supplies a number the content does not state.
 */
export function pcCollectionMechanismViolation(
  key: string,
  m: PcCollectionMechanism,
  facts: FactView,
): string | null {
  if (key !== pcCollectionMechanismKey(m.pc_id, m.mechanism_id))
    return "a mechanism is at the slot derived from its PC and mechanism identities";
  const contractKey = pcExistenceContractKey(m.pc_id);
  const contract = parseFact(facts, contractKey, ExistenceContractSchema);
  if (!contract) return "the PC's own released contract is committed";
  if (
    m.authored_from.contract.fact_key !== contractKey ||
    m.authored_from.contract.version !== contract.fact.version
  )
    return "the mechanism follows the PC's own released contract at its committed version";
  const cited: string[] = [];
  for (const claim of m.authored_from.claims) {
    const found = pcClaimAt(contract.value, claim);
    if (found === undefined)
      return "every cited claim is an accepted claim of the PC's contract: a hypothesis or unresolved item grounds nothing";
    cited.push(found.statement);
  }
  const grounded = (quote: string) =>
    quote.length >= MIN_QUOTE_LENGTH && cited.some((statement) => statement.includes(quote));
  if (!grounded(m.actuator.statement))
    return "the actuator statement is a verbatim quotation of a cited accepted claim: wording the PC's content does not state is not a mechanism";
  if (!grounded(m.traversal.statement))
    return "the traversal statement is a verbatim quotation of a cited accepted claim: wording the PC's content does not state is not a mechanism";
  if (!grounded(m.cycle.authored_quote))
    return "the cycle is stated by a verbatim quotation of a cited accepted claim: a cycle the PC's authored content does not state cannot be established";
  if (!statesExactDuration(m.cycle.authored_quote, m.cycle.duration))
    return "the quoted authored words state exactly this cycle's numeral and canonical time unit: a number the content does not state is not an exact cycle";
  return null;
}

export { statesExactDuration };

export interface CollectionTiming {
  readonly cycles: number;
  readonly per_cycle: CanonicalTime;
  readonly causal_duration: CanonicalTime;
  readonly floor: typeof PC_COLLECTION_INTERACTION_FLOOR;
  readonly completes_at: CanonicalTime;
}

/**
 * The earned completion of one collection, DERIVED from the mechanism's exact serial cycle and the amount (Timed Work §§3–4, 14):
 * cycles = amount, causal duration = cycles × cycle duration. It is never a requested horizon, a caller-declared boundary or a
 * default. The F-014B §11 determination is derived, not authored: the closed class has no counterpart actor, so no
 * consequential-interaction floor applies (a PROVISIONAL reading of §11). A unit that is not the canonical unit or a
 * non-representable total WITHHOLDS the exact completion.
 */
export function deriveCollectionTiming(
  now: CanonicalTime,
  quantity: ProductionQuantity,
  mechanism: PcCollectionMechanism,
): Result<CollectionTiming, "COLLECTION_WITHHELD"> {
  const withheld = (m: string) => fail("COLLECTION_WITHHELD", m);
  const tau = mechanism.cycle.duration;
  if (tau.unit !== now.unit)
    return withheld("the mechanism's cycle is not in the campaign's canonical time unit");
  const cycles = quantity.amount;
  const causal = cycles * tau.value;
  const at = now.value + causal;
  if (!Number.isSafeInteger(causal) || !Number.isSafeInteger(at) || causal <= 0)
    return withheld("the derived completion is not representable");
  return ok({
    cycles,
    per_cycle: tau,
    causal_duration: { unit: now.unit, value: causal },
    floor: PC_COLLECTION_INTERACTION_FLOOR,
    completes_at: { unit: now.unit, value: at },
  });
}

// ---------------------------------------------------------------------------------------------
// C5 — the reach judgment.
// ---------------------------------------------------------------------------------------------

const MIN_GROUND_LENGTH = 8;

/** The bounded task of ONE attempt: the already established wording the host interprets. Mechanical; it adds nothing. */
export function buildPcCollectionReachTask(
  pcId: string,
  actId: string,
  source: { key: string; value: WorldSourceCondition },
  mechanism: { key: string; version: number; value: PcCollectionMechanism },
  scene: PcCollectionSceneEvidence,
): PcCollectionReachTask {
  const body = {
    pc_id: pcId,
    act_id: actId,
    source: { fact_key: source.key, access_facts: source.value.access_facts },
    mechanism: {
      fact_key: mechanism.key,
      version: mechanism.version,
      traversal: mechanism.value.traversal.statement,
      actuator: mechanism.value.actuator.statement,
    },
    scene,
  };
  return PcCollectionReachTaskSchema.parse({ ...body, digest: sha256Canonical(body) });
}

export const accessFactsDigest = (source: WorldSourceCondition): string =>
  sha256Canonical(source.access_facts);

/**
 * Validates a host's UNTRUSTED answer against the delivered task and DERIVES the verdict. The answer carries no verdict, role or
 * permission. Every ground must be a verbatim quotation of the wording the task delivered (path grounds from the source's stated
 * access facts; mechanism grounds from the PC's stated mechanism); a closed path requires a decided mechanism reading. REACHABLE
 * iff the path is open, or closed and the mechanism is able to pass; NOT_REACHABLE iff closed and unable.
 */
export function interpretPcCollectionReachAnswer(
  task: PcCollectionReachTask,
  answer: unknown,
): Result<
  {
    answer: ReturnType<typeof PcCollectionReachAnswerSchema.parse>;
    verdict: "REACHABLE" | "NOT_REACHABLE";
    scene_verdict: "SOLITARY_CLASS_ESTABLISHED" | "ENGAGED_NOT_SOLITARY" | "WITHHELD";
  },
  "ANSWER_INVALID"
> {
  const bad = (m: string) => fail("ANSWER_INVALID", m);
  const parsed = PcCollectionReachAnswerSchema.safeParse(answer);
  if (!parsed.success) return bad("the answer is not a well-formed reach reading");
  const a = parsed.data;
  if (a.task_digest !== task.digest) return bad("the answer is for another task");
  const pathText = task.source.access_facts.map((f) => f.statement);
  const mechText = [task.mechanism.traversal, task.mechanism.actuator];
  const quoted = (grounds: readonly string[], texts: readonly string[]) =>
    grounds.every((g) => g.length >= MIN_GROUND_LENGTH && texts.some((t) => t.includes(g)));
  if (!quoted(a.path.grounds, pathText))
    return bad("every path ground is a verbatim quotation of a stated source access fact");
  if (!quoted(a.mechanism.grounds, mechText))
    return bad("every mechanism ground is a verbatim quotation of the PC's stated mechanism");
  if (a.path.reading === "CLOSED") {
    if (a.mechanism.reading === "NOT_AT_ISSUE")
      return bad("a closed path requires the mechanism's ability to pass to be decided");
    if (a.mechanism.grounds.length === 0)
      return bad("a decided mechanism reading is anchored to the mechanism's own wording");
  }
  const verdict =
    a.path.reading === "OPEN" || a.mechanism.reading === "ABLE_TO_PASS"
      ? "REACHABLE"
      : "NOT_REACHABLE";
  const scene = deriveSceneVerdict(a.scene, task.scene);
  if (!scene.ok) return bad(scene.error.message);
  return ok({ answer: a, verdict, scene_verdict: scene.value });
}

/**
 * A reach decision holds when it is at the slot derived from its PC and act; its commitment holds and is the pinned version; its
 * mechanism is the PC's own, holds and is the pinned version; the task REBUILT from the committed premises has the recorded digest;
 * the access facts interpreted are the source's stated access facts; and the verdict is exactly what the validated answer derives.
 */
export function pcCollectionReachViolation(
  key: string,
  d: PcCollectionReachDecision,
  facts: ScanFacts,
  strictVersions: boolean,
): string | null {
  if (key !== pcCollectionReachKey(d.pc_id, d.act_id))
    return "a reach decision is at the slot derived from its PC and act identities";
  const commitmentKey = pcCollectionCommitmentKey(d.pc_id, d.act_id);
  const commitment = parseFact<PcCollectionCommitment>(
    facts,
    commitmentKey,
    PcCollectionCommitmentSchema,
  );
  if (
    !commitment ||
    commitment.fact.version !== d.task.commitment.version ||
    d.task.commitment.fact_key !== commitmentKey
  )
    return "the decision concerns the committed player commitment at its pinned version";
  const mechKey = d.task.mechanism.fact_key;
  const mech = parseFact<PcCollectionMechanism>(facts, mechKey, PcCollectionMechanismSchema);
  if (
    !mech ||
    mech.value.pc_id !== d.pc_id ||
    mechKey !== pcCollectionMechanismKey(d.pc_id, mech.value.mechanism_id) ||
    mech.fact.version !== d.task.mechanism.version
  )
    return "the decision concerns the PC's own mechanism at its pinned version";
  const mViolation = pcCollectionMechanismViolation(mechKey, mech.value, facts);
  if (mViolation) return `the mechanism does not hold: ${mViolation}`;
  const srcKey = commitment.value.intent.source.fact_key;
  const src = sourceOf(facts, srcKey);
  if (!src || d.task.source.fact_key !== srcKey)
    return "the decision concerns the committed source";
  if (
    strictVersions
      ? src.fact.version !== d.task.source.version
      : src.fact.version < d.task.source.version
  )
    return "the decision interpreted the source at its pinned version";
  if (d.task.access_facts_digest !== accessFactsDigest(src.value))
    return "the source's stated path facts are those the decision interpreted: a changed path fact makes it stale";
  // v0.3 F-1: the scene evidence the host interpreted is the owners' evidence. At admission it is exactly the evidence the owners
  // hold NOW; on re-verification (the ledgers advance) it is re-judged as recorded, and a later change is the premise check's business.
  if (strictVersions) {
    const live = buildSceneEvidence(facts, d.pc_id, src.value.locality, srcKey);
    if ("reason" in live) return live.reason;
    if (!canonicalEqual(live, d.scene_evidence))
      return "the scene evidence the decision interpreted is the owners' evidence now: a changed scene is a different question";
  }
  const task = buildPcCollectionReachTask(
    d.pc_id,
    d.act_id,
    { key: srcKey, value: src.value },
    { key: mechKey, version: mech.fact.version, value: mech.value },
    d.scene_evidence,
  );
  if (task.digest !== d.task.digest || task.digest !== d.answer.task_digest)
    return "the decision answers the task the committed premises determine";
  const derived = interpretPcCollectionReachAnswer(task, d.answer);
  if (!derived.ok) return `the answer does not validate: ${derived.error.message}`;
  if (derived.value.verdict !== d.verdict)
    return "the verdict is exactly what the validated answer derives, never what a host states";
  if (derived.value.scene_verdict !== d.scene_verdict)
    return "the scene verdict is exactly what the validated scene reading and the owners' evidence derive";
  return null;
}

// ---------------------------------------------------------------------------------------------
// C5 / P-2 — occupancy.
// ---------------------------------------------------------------------------------------------

const clockOf = (facts: FactView): CanonicalTime | undefined => {
  const c = facts.get(TEMPORAL_STATE_KEY);
  const t = c ? TemporalStateSchema.safeParse(c.value) : undefined;
  return t?.success ? t.data.canonical_time : undefined;
};
export { clockOf as pcCollectionClock };

/**
 * The preconditions of occupying the PC for one collection, independent of the registrar's ledger: the commitment holds; the PC's
 * mechanism is its own and holds; the PC is the active PC, stationary at the source's locus with the one-authority custody, and
 * movement-free. Returns the facts the registration is derived from, or a message.
 */
export function pcCollectionPreconditions(
  pcId: string,
  actId: string,
  mechanismId: string,
  facts: FactView,
  verifyAt?: CanonicalTime,
):
  | { reason: string }
  | {
      commitment: { fact: OwnerFact; value: PcCollectionCommitment };
      mechanism: { fact: OwnerFact; value: PcCollectionMechanism };
      source: { fact: OwnerFact; value: WorldSourceCondition };
      standing: Exclude<ReturnType<typeof pcStandingViolation>, { reason: string }>;
      now: CanonicalTime;
    } {
  const commitmentKey = pcCollectionCommitmentKey(pcId, actId);
  const commitment = parseFact<PcCollectionCommitment>(
    facts,
    commitmentKey,
    PcCollectionCommitmentSchema,
  );
  if (!commitment)
    return { reason: "no collection commitment-of-record is committed for this act" };
  const cv = pcCollectionCommitmentViolation(
    commitmentKey,
    commitment.value,
    facts,
    verifyAt !== undefined,
  );
  if (cv) return { reason: `the commitment-of-record does not hold: ${cv}` };
  const mechKey = pcCollectionMechanismKey(pcId, mechanismId);
  if (commitment.value.basis.cycle.mechanism.fact_key !== mechKey)
    return { reason: "the act rests on the mechanism and attestation its commitment pinned" };
  const mechanism = parseFact<PcCollectionMechanism>(facts, mechKey, PcCollectionMechanismSchema);
  if (!mechanism) return { reason: "no established mechanism of this PC is committed" };
  const mv = pcCollectionMechanismViolation(mechKey, mechanism.value, facts);
  if (mv) return { reason: `the mechanism does not hold: ${mv}` };
  const source = sourceOf(facts, commitment.value.intent.source.fact_key);
  if (!source) return { reason: "the source is committed" };
  const standing = pcStandingViolation(pcId, facts);
  if ("reason" in standing) return standing;
  if (!canonicalEqual(source.value.locality, standing.sourceLocus))
    return { reason: "the PC is stationary at the source's own locus" };
  const now = verifyAt ?? clockOf(facts);
  if (!now) return { reason: "no canonical temporal basis is established" };
  return { commitment, mechanism, source, standing, now };
}

/**
 * The interval the PC's occupation must be, DERIVED from the commitment and the PC's mechanism at the canonical time (PC-01: owner
 * proposal → Population registration/feasibility → consuming-owner read). Production re-derives the same interval and requires the
 * registration to equal it.
 */
export function deriveOccupancyInterval(
  commitment: PcCollectionCommitment,
  mechanism: PcCollectionMechanism,
  now: CanonicalTime,
): Result<
  { from: CanonicalTime; to: CanonicalTime; timing: CollectionTiming },
  "COLLECTION_WITHHELD"
> {
  const t = deriveCollectionTiming(now, commitment.intent.quantity, mechanism);
  if (!t.ok) return t;
  return ok({ from: now, to: t.value.completes_at, timing: t.value });
}

export { pcOccupancyRecord, pcOccupancyState };

// ---------------------------------------------------------------------------------------------
// C4 — Production's work record: the pins, the derivation and the premises that must still hold at each stage.
// ---------------------------------------------------------------------------------------------

/**
 * Whether a Production work record is exactly what the committed owner premises derive, judged against the facts it was written
 * against. `atStart` is true when judging the record's own start (the occupancy must be the OPEN registration pinned, equal to the
 * derived interval, and the clock must equal the start); false when re-verifying from history.
 */
export function pcCollectionWorkViolation(
  key: string,
  w: ProductionPcCollectionWork,
  facts: FactView,
  atStart: boolean,
): string | null {
  if (
    key !== productionPcCollectionWorkKey(w.work_id) ||
    w.work_id !== pcCollectionRequestId(w.pc_id, w.act_id)
  )
    return "a collection work record is at the key, and has the identity, derived from its PC and act (the extraction identity)";
  const reqKey = pcCollectionRequestKey(w.pc_id, w.act_id);
  const mechKey = w.pins.mechanism.fact_key;
  const mechanismId = (/^pc\/[^/]+\/collection-mechanism\/([^/]+)$/.exec(mechKey) ?? [])[1];
  if (!mechanismId || mechKey !== pcCollectionMechanismKey(w.pc_id, mechanismId))
    return "the work names the PC's own mechanism";
  const pre = pcCollectionPreconditions(
    w.pc_id,
    w.act_id,
    mechanismId,
    facts,
    atStart ? undefined : w.derivation.started_at,
  );
  if ("reason" in pre) return pre.reason;
  const request = parseFact<ProductionRequest>(facts, reqKey, ProductionRequestSchema);
  if (!request) return "the PC-owned request is committed";
  const rv = pcCollectionRequestViolation(reqKey, request.value, facts, !atStart);
  if (rv) return rv;
  const reachKey = pcCollectionReachKey(w.pc_id, w.act_id);
  const reach = parseFact<PcCollectionReachDecision>(
    facts,
    reachKey,
    PcCollectionReachDecisionSchema,
  );
  if (!reach) return "the physical-reach judgment is committed";
  const dv = pcCollectionReachViolation(reachKey, reach.value, facts, false);
  if (dv) return dv;
  if (reach.value.verdict !== "REACHABLE")
    return "the judged physical reach is not reachable: Production admits no extraction";
  // v0.3 F-1: exact completion rests on the solitary class being ESTABLISHED by the owners' evidence; an engaged counterpart or
  // absent evidence WITHHOLDS (no band is invented and no absence-of-counterpart default exists)
  if (reach.value.scene_verdict !== PC_SCENE_VERDICT_ESTABLISHED)
    return "solitary handling is not established by the owners' scene evidence: F-014B §11 applies or the evidence is absent, so exact completion is withheld";
  const occ = pcOccupancyRecord(facts, w.pc_id);
  // the occupancy slot ADVANCES (a later act replaces it once this work closes): only at the start is it required to be this act's
  if (atStart && (!occ || occ.value.act_id !== w.act_id))
    return "the PC's occupancy is registered for this act";
  const pins = w.pins;
  if (
    pins.commitment.fact_key !== pcCollectionCommitmentKey(w.pc_id, w.act_id) ||
    pins.commitment.version !== pre.commitment.fact.version ||
    pins.request.fact_key !== reqKey ||
    pins.request.version !== request.fact.version ||
    pins.mechanism.version !== pre.mechanism.fact.version ||
    pins.reach.fact_key !== reachKey ||
    pins.reach.version !== reach.fact.version ||
    pins.occupancy.fact_key !== popPcOccupancyKey(w.pc_id) ||
    pins.binding !== pre.standing.binding.version ||
    pins.custody !== pre.standing.custody.version
  )
    return "the work pins the exact committed commitment, request, mechanism, judgment, occupancy, binding and custody versions";
  if (atStart) {
    if (occ!.fact.version !== pins.occupancy.version || occ!.value.status !== "OPEN")
      return "the work pins the PC's OPEN occupancy registration";
    const rv = pcRepresentationHolds(facts, w.pc_id, occ!.value.representation);
    if (rv) return rv;
    if (!canonicalEqual(w.derivation.started_at, pre.now))
      return "the work starts at the canonical time";
  }
  const interval = deriveOccupancyInterval(
    pre.commitment.value,
    pre.mechanism.value,
    w.derivation.started_at,
  );
  if (!interval.ok) return interval.error.message;
  const t = interval.value.timing;
  if (
    !canonicalEqual(w.derivation, {
      cycles: t.cycles,
      per_cycle: t.per_cycle,
      causal_duration: t.causal_duration,
      interaction_floor: t.floor,
      started_at: w.derivation.started_at,
      completes_at: t.completes_at,
    })
  )
    return "the cycles, causal duration and earned completion are exactly what the mechanism, the amount and the minimum derive: never a caller-declared boundary";
  if (
    atStart &&
    (!canonicalEqual(occ!.value.interval, { from: w.derivation.started_at, to: t.completes_at }) ||
      occ!.value.commitment.version !== pins.commitment.version ||
      occ!.value.mechanism.version !== pins.mechanism.version)
  )
    return "the PC's occupied interval is exactly the derived interval";
  return null;
}

/**
 * The premises that must STILL hold when a drawdown stage is committed (C6 invalidation bound): the PC is still the active PC with
 * the pinned binding and custody, still at the source's locus and movement-free; the mechanism, judgment and path facts are
 * unchanged; the occupancy is still OPEN for this act. A changed premise before the boundary leaves the act uncredited and
 * unresolved (the stage is refused and the kernel holds it): it is never silently completed, partially credited or cancelled.
 */
export function pcCollectionPremiseViolation(
  w: ProductionPcCollectionWork,
  facts: ScanFacts,
): string | null {
  const standing = pcStandingViolation(w.pc_id, facts);
  if ("reason" in standing) return `the PC no longer stands as at the start: ${standing.reason}`;
  if (standing.binding.version !== w.pins.binding || standing.custody.version !== w.pins.custody)
    return "the PC's binding or custody changed since the start";
  const commitment = parseFact<PcCollectionCommitment>(
    facts,
    pcCollectionCommitmentKey(w.pc_id, w.act_id),
    PcCollectionCommitmentSchema,
  );
  const src = commitment ? sourceOf(facts, commitment.value.intent.source.fact_key) : undefined;
  if (!commitment || !src) return "the commitment and its source are committed";
  if (!canonicalEqual(src.value.locality, standing.sourceLocus))
    return "the PC is no longer at the source's locus";
  const mech = facts.get(w.pins.mechanism.fact_key);
  if (!mech || mech.version !== w.pins.mechanism.version)
    return "the mechanism changed since the start";
  const reachKey = pcCollectionReachKey(w.pc_id, w.act_id);
  const reach = parseFact<PcCollectionReachDecision>(
    facts,
    reachKey,
    PcCollectionReachDecisionSchema,
  );
  if (!reach || reach.fact.version !== w.pins.reach.version)
    return "the physical-reach judgment changed";
  if (reach.value.task.access_facts_digest !== accessFactsDigest(src.value))
    return "the source's stated path facts changed since the judgment: the work is invalidated, not completed";
  // v0.3 F-1: the solitary class is re-evaluated throughout the occupied interval. A changed scene (world or locus wording, a ledger
  // attached to this locus, who Population records as present) re-opens the question: the work is neither completed nor credited
  const scene = reach.value.scene_evidence;
  const pinned = [scene.world, scene.locus, scene.closure, ...scene.ledgers];
  if (pinned.some((p) => facts.get(p.fact_key)?.version !== p.version))
    return "the scene evidence changed since the judgment: solitary handling is no longer established";
  if (facts.values) {
    const live = buildSceneEvidence(
      facts,
      w.pc_id,
      src.value.locality,
      commitment.value.intent.source.fact_key,
    );
    if ("reason" in live || !canonicalEqual(live, scene))
      return "the scene evidence changed since the judgment: solitary handling is no longer established";
  }
  const state = pcOccupancyState(facts, w.pc_id);
  if (state.state !== "OPEN" || state.act_id !== w.act_id)
    return "the PC's occupancy is no longer open for this act";
  const occ = pcOccupancyRecord(facts, w.pc_id);
  if (!occ) return "the PC's occupancy is registered";
  const rv = pcRepresentationHolds(facts, w.pc_id, occ.value.representation, false);
  if (rv) return rv;
  return null;
}

/**
 * v0.3 F-3: the Population determination the registration rests on is the committed one and says OUTSIDE_AGGREGATE. `strict` (the
 * start) requires the very version the registration pinned; later (the occupied interval) a re-determination may have advanced it.
 * Where the view can enumerate the ledgers it is also re-derived NOW: a PC a ledger came to count is no longer provably free of the
 * aggregate workforce, and the class WITHHOLDS.
 */
export function pcRepresentationHolds(
  facts: ScanFacts,
  pcId: string,
  pinned: { fact_key: string; version: number },
  strict = true,
): string | null {
  const rep = parseFact(facts, popPcRepresentationKey(pcId), PopulationPcRepresentationSchema);
  if (!rep || pinned.fact_key !== popPcRepresentationKey(pcId))
    return "Population has determined the PC's relation to its aggregate workforce: the registration pins that determination";
  if (strict ? rep.fact.version !== pinned.version : rep.fact.version < pinned.version)
    return "the registration pins the committed Population determination";
  if (rep.value.status !== PC_REPRESENTATION_OUTSIDE)
    return "Population has not proven the PC outside its aggregate workforce: the act is withheld pending a lawful reconciliation";
  if (facts.values) {
    const loc = rep.value.locality;
    const live = derivePcRepresentation(
      pcId,
      {
        world: { fact_key: worldProfileKey(loc.world_id), entity_id: loc.world_id },
        locus: { fact_key: worldLocusKey(loc.world_id, loc.locus_id), entity_id: loc.locus_id },
      },
      facts,
    );
    if (!live.ok || live.value.status !== PC_REPRESENTATION_OUTSIDE)
      return "Population's ledgers no longer prove the PC outside its aggregate workforce";
  }
  return null;
}

export type PcCollectionHold =
  | { readonly state: "NONE" }
  /**
   * D-1 (PROVISIONAL): the PC's separately confirmed cessation request of this act is committed and Production has not yet resolved it
   * (the window between the two commits): re-presenting the cessation finishes it; time may not pass over it.
   */
  | { readonly state: "CESSATION_REQUESTED"; readonly act_id: string }
  /**
   * D-1 (PROVISIONAL): Production committed the termination; the PC's occupancy is not yet released (the pending boundary's
   * retirement and Population's release follow): re-presenting the cessation finishes it.
   */
  | { readonly state: "TERMINATED_AWAITING_RELEASE"; readonly act_id: string }
  /** occupied by a registration Production has not started (the window between the two commits: re-presenting the start finishes it) */
  | { readonly state: "REGISTERED"; readonly act_id: string }
  | { readonly state: "IN_FLIGHT"; readonly act_id: string }
  /** a started act whose premises no longer hold: its stage will be refused, so it is neither credited, completed nor released */
  | { readonly state: "INVALIDATED"; readonly act_id: string; readonly reason: string };

/**
 * What holds the PC's time, derived from committed facts alone (a read: it writes nothing and decides nothing). It names the
 * unresolved cause without resolving it: the existing contracts authorise a release only by the work's close or by a lawful denial
 * of work never admitted, so an in-flight or invalidated act keeps the PC occupied. Only the PROVISIONAL D-1 voluntary cessation
 * (a separately confirmed request, Production's terminal disposition, then Population's release) lets that occupation end otherwise.
 * No cancellation, abandonment, partial credit or re-choice is derived here or anywhere else.
 */
export function pcCollectionHold(facts: ScanFacts, pcId: string): PcCollectionHold {
  const occupancy = pcOccupancyState(facts, pcId);
  if (occupancy.state !== "OPEN") return { state: "NONE" };
  const work = parseFact<ProductionPcCollectionWork>(
    facts,
    productionPcCollectionWorkKey(pcCollectionRequestId(pcId, occupancy.act_id)),
    ProductionPcCollectionWorkSchema,
  );
  if (!work) return { state: "REGISTERED", act_id: occupancy.act_id };
  const extractionId = pcCollectionRequestId(pcId, occupancy.act_id);
  if (facts.has(productionPcCollectionTerminationKey(extractionId)))
    return { state: "TERMINATED_AWAITING_RELEASE", act_id: occupancy.act_id };
  if (facts.has(pcCollectionCessationKey(pcId, occupancy.act_id)))
    return { state: "CESSATION_REQUESTED", act_id: occupancy.act_id };
  const reason = pcCollectionPremiseViolation(work.value, facts);
  return reason === null
    ? { state: "IN_FLIGHT", act_id: occupancy.act_id }
    : { state: "INVALIDATED", act_id: occupancy.act_id, reason };
}

/** Is a request key one in the PC-owned collection key space? */
export const isPcCollectionRequestKey = (key: string): boolean =>
  PC_COLLECTION_REQUEST_KEY_RE.test(key);

/**
 * CPAA-C1 v0.3 F-5 — the C8 declaration (design RATIFIED). The single uniform fail-closed refusal on a crossing of another unresolved due
 * boundary is PROVISIONAL and NOT a complete or knowledge-neutral in-flight advance route: whether it is refused depends on the horizon
 * the player chose, so repeated chosen horizons can probe a hidden boundary even though every return is the same status. That timing is
 * an observable disclosure channel, not lawful Epistemic receipt, and it must not be used by I-001/NPK or an accepted player-facing loop.
 * D-2 (real Actionable-Knowledge-Time and standing-contingency carriers), or an independently demonstrated equivalent non-leaking rule,
 * is a PRECONDITION for any claim that in-flight time advance is complete, epistemically safe or First Playable PASS. Until then
 * unsafe crossings are refused uniformly with no explanation, no next-boundary timestamp and no side-channel distinction; a uniform string
 * alone does not remove horizon probing, and D-1 voluntary cessation is not D-2.
 */
export const PC_COLLECTION_C8_DECLARATION =
  "PROVISIONAL, NOT A COMPLETE OR KNOWLEDGE-NEUTRAL IN-FLIGHT ADVANCE ROUTE: the horizon-dependent refusal is an observable timing-disclosure channel for hidden events; D-2 or an independently demonstrated equivalent is a precondition for any epistemic-safety or First Playable claim";

/**
 * CPAA-C1 v0.2 PROVISIONAL (C8): may the PC's own time be advanced to `target` over its collection? The PC's in-flight collection is
 * POSITIVELY recognised, never read as "nothing in flight". While the PC is occupied by an OPEN collection, a separately confirmed
 * advance may cross the interval only when the crossed interval is positively established to contain no event that could interrupt
 * the player: every boundary that falls due by the target must be the PC's own collection object's, and the target must be comparable
 * with it. The F-014B §10 actionable-knowledge evaluator is not implemented, so any other due work (or any boundary the check cannot
 * compare) leaves the absence of an interruption unestablished and the crossing is REFUSED; a declared
 * `creates_epistemic_interruption: false` is not proof. The OOC target never authors the work's duration: the boundary is the derived
 * one, and a target short of it resolves nothing. True when no collection is in flight (nothing of the PC's own to interrupt).
 */
export function pcCollectionCrossingClear(
  store: { getFact(key: string): OwnerFact | undefined },
  coordinator: {
    boundaryIndex(): {
      readonly entries: readonly { readonly object_id: string; readonly at: CanonicalTime }[];
    };
  },
  pcId: string,
  target: CanonicalTime,
): boolean {
  const occupancy = pcOccupancyState(
    { get: (k) => store.getFact(k), has: (k) => store.getFact(k) !== undefined },
    pcId,
  );
  if (occupancy.state !== "OPEN") return true;
  // D-1 (PROVISIONAL): a PC that has requested to cease is not advanced over its own collection until Production has resolved it
  if (
    store.getFact(pcCollectionCessationKey(pcId, occupancy.act_id)) !== undefined ||
    store.getFact(
      productionPcCollectionTerminationKey(pcCollectionRequestId(pcId, occupancy.act_id)),
    ) !== undefined
  )
    return false;
  const own = productionExtractionObjectId(pcCollectionRequestId(pcId, occupancy.act_id));
  const entries = coordinator.boundaryIndex().entries;
  if (!entries.some((e) => e.object_id === own)) return false; // an in-flight collection that is not engaged is not recognised
  return entries.every((e) => {
    const c = compareTime(e.at, target);
    return c === null ? false : c === 1 || e.object_id === own;
  });
}
