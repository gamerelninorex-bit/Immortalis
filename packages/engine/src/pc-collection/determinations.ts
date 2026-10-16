import type { PcIndependentEvidence } from "./evidence.ts";
import {
  ExistenceContractSchema,
  OWNER_PC_EXISTENCE,
  PC_CYCLE_MEANING,
  PC_REPRESENTATION_INCLUDED,
  PC_REPRESENTATION_OUTSIDE,
  PC_REPRESENTATION_UNKNOWN,
  PC_SCENE_VERDICT_ESTABLISHED,
  PcCollectionCycleAnswerSchema,
  PcCollectionCycleTaskSchema,
  PcCollectionMechanismSchema,
  PcCollectionSceneEvidenceSchema,
  PopulationBasisSchema,
  PopulationPcRepresentationSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  fail,
  ok,
  pcCollectionAttestationId,
  pcCollectionAttestationKey,
  pcCollectionMechanismKey,
  pcExistenceContractKey,
  popPcRepresentationKey,
  type CanonicalTime,
  type LocusRef,
  type OwnerFact,
  type PcCollectionCycleAnswer,
  type PcCollectionCycleAttestation,
  type PcCollectionCycleTask,
  type PcCollectionMechanism,
  type PcCollectionSceneEvidence,
  type PopulationBasis,
  type PopulationPcRepresentation,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { pcClaimAt } from "../pc-capability/derive.ts";
import { deliveredFacts } from "../referee/derive.ts";
import type { FactView } from "../world/pc-locus-custody.ts";

/**
 * CPAA-C1 v0.3 (design RATIFIED by the Sovereign; implementation acceptance pending) — the determinations the closed class rests on,
 * each DERIVED by the owner of the evidence and never asserted by a caller, a player or a model:
 *
 *  F-1  the solitary-class scene evidence and its verdict (Temporal §11 for the closed class);
 *  F-2  the semantic attestation of the PC's serial handling cycle (I-002 §5 Capability/Effect Module + Temporal Hook);
 *  F-3  Population's determination of the PC's relation to its effective aggregate workforce.
 *
 * Everything missing WITHHOLDS (a refusal that writes nothing), never a default negative or positive. The functions are pure over a
 * committed fact view; `values()` (a Map's, or the engine's own listing) is used ONLY to find the Population ledgers, by key shape.
 */

/** A fact view that can also enumerate the committed facts (the ledgers are found by their key shape, the one place a scan is needed). */
export type ScanFacts = FactView & {
  readonly values?: () => Iterable<OwnerFact>;
  /** the build's independent-owner premises; absent in production, so completeness and outside-the-aggregate are never established */
  readonly independent?: PcIndependentEvidence | undefined;
};

/** Does the quotation state this duration: its exact numeral (as a whole number, not part of another) and its canonical unit? */
export function statesExactDuration(quote: string, duration: CanonicalTime): boolean {
  const numeral = new RegExp(`(?<![0-9.])${duration.value}(?![0-9]|\\.[0-9])`);
  return numeral.test(quote) && quote.includes(duration.unit);
}

const PREREQ = "PREREQUISITE_MISSING" as const;
const refuse = (message: string) => fail(PREREQ, message);
const MIN_QUOTE_LENGTH = 8;

const parse = <T>(
  facts: FactView,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { fact: OwnerFact; value: T } | undefined => {
  const fact = facts.get(key);
  const v = fact ? schema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data as T } : undefined;
};

const LEDGER_KEY = /^population\/[^/]+\/ledger$/;

/** Every committed Population ledger, parsed (a malformed one is skipped: canonical integrity reports it). Empty when the view cannot enumerate. */
export function populationLedgers(
  facts: ScanFacts,
): readonly { fact: OwnerFact; value: PopulationBasis }[] {
  if (!facts.values) return [];
  const out: { fact: OwnerFact; value: PopulationBasis }[] = [];
  for (const fact of facts.values()) {
    if (!LEDGER_KEY.test(fact.key)) continue;
    const v = PopulationBasisSchema.safeParse(fact.value);
    if (v.success) out.push({ fact, value: v.data });
  }
  return out.sort((a, b) => (a.fact.key < b.fact.key ? -1 : 1));
}

const pin = (f: OwnerFact) => ({ fact_key: f.key, version: f.version });
const atLocus = (l: PopulationBasis, locality: LocusRef): boolean =>
  l.locality.world.entity_id === locality.world.entity_id &&
  l.locality.locus.entity_id === locality.locus.entity_id;

const clockOf = (facts: FactView): CanonicalTime | undefined => {
  const c = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  return c?.value.canonical_time;
};

// ---------------------------------------------------------------------------------------------
// F-3 — Population's representation determination.
// ---------------------------------------------------------------------------------------------

/**
 * Population's determination, from its own committed ledgers and the PC's identity: INCLUDED when any ledger counts a unit with this
 * identity; OUTSIDE_AGGREGATE only when the independent owners separately prove the PC outside the effective aggregate workforce
 * (a ledger proves its own counted members, so an omitted identity proves nothing); UNKNOWN otherwise. The PC's binding, a ledger's
 * silence or a caller's statement is never evidence.
 */
export function derivePcRepresentation(
  pcId: string,
  locality: LocusRef,
  facts: ScanFacts,
): Result<PopulationPcRepresentation, typeof PREREQ> {
  const now = clockOf(facts);
  if (!now) return refuse("no canonical temporal basis is established");
  const ledgers = populationLedgers(facts);
  const including = ledgers.filter((l) => l.value.units.some((u) => u.unit_id === pcId));
  const here = ledgers.filter((l) => atLocus(l.value, locality));
  const status =
    including.length > 0
      ? PC_REPRESENTATION_INCLUDED
      : facts.independent?.outsideAggregate(pcId, locality, facts) === true
        ? PC_REPRESENTATION_OUTSIDE
        : PC_REPRESENTATION_UNKNOWN;
  const examined = [...new Map([...including, ...here].map((l) => [l.fact.key, l])).values()].sort(
    (a, b) => (a.fact.key < b.fact.key ? -1 : 1),
  );
  const value = PopulationPcRepresentationSchema.safeParse({
    pc_id: pcId,
    status,
    locality: {
      world_id: locality.world.entity_id,
      locus_id: locality.locus.entity_id,
    },
    ledgers: examined.map((l) => pin(l.fact)),
    determined_at: now,
    committer: { owner: "population", facet: "population_pc_occupancy" },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable determination");
}

/**
 * What a representation determination must be: at its slot; at admission exactly what Population's ledgers and the canonical time
 * derive now; on re-verification only its structure (the ledgers ADVANCE, so the as-then derivation is not re-run here).
 */
export function pcRepresentationViolation(
  key: string,
  r: PopulationPcRepresentation,
  facts: ScanFacts,
  locality: LocusRef | undefined,
  verify = false,
): string | null {
  if (key !== popPcRepresentationKey(r.pc_id))
    return "a representation determination is at the slot derived from its PC identity";
  if (verify) return null;
  if (!locality)
    return "the PC's locus is not established: Population determines nothing about an unplaced PC";
  if (
    r.locality.world_id !== locality.world.entity_id ||
    r.locality.locus_id !== locality.locus.entity_id
  )
    return "the determination concerns the PC's own locus";
  const derived = derivePcRepresentation(r.pc_id, locality, facts);
  if (!derived.ok) return derived.error.message;
  return canonicalEqual(derived.value, r)
    ? null
    : "a representation determination is exactly what Population's ledgers and the canonical time derive: never a caller's statement";
}

// ---------------------------------------------------------------------------------------------
// F-1 — the solitary-class scene evidence and verdict.
// ---------------------------------------------------------------------------------------------

/**
 * The scene evidence the owners hold at the PC's locus: the committed world and locus wording and the Population ledgers that attach
 * to this locus (with every OTHER unit whose Population presence is this locus). A ledger lists the counted members of its own
 * disjoint resident population and proves nothing about every actor or material engagement bearing on the PC, so evidence is built
 * ONLY when an independent owner also establishes the complete scene (`PcIndependentEvidence`; production supplies none, so the
 * solitary class is then withheld). With no ledger at the locus the owners hold no presence evidence either. Mechanical: it asserts nothing.
 */
export function buildSceneEvidence(
  facts: ScanFacts,
  pcId: string,
  locality: LocusRef,
): PcCollectionSceneEvidence | { reason: string } {
  const world = parse(facts, locality.world.fact_key, WorldProfileSchema);
  const locus = parse(facts, locality.locus.fact_key, WorldLocusSchema);
  if (!world || !locus) return { reason: "the committed world and locus wording is not held" };
  if (facts.independent?.sceneComplete(pcId, locality, facts) !== true)
    return {
      reason:
        "no independent owner establishes the complete scene (every actor and material engagement bearing on the PC here): a ledger and a host reading do not, so the solitary handling kind is withheld",
    };
  const here = populationLedgers(facts).filter((l) => atLocus(l.value, locality));
  if (here.length === 0)
    return {
      reason:
        "no Population ledger attaches to this locus: the owners hold no presence evidence, so the solitary handling kind is withheld",
    };
  const presence = here
    .flatMap((l) =>
      l.value.units
        .filter((u) => u.presence === locality.locus.entity_id && u.unit_id !== pcId)
        .map((u) => ({
          unit_id: u.unit_id,
          statement: `Population records unit ${u.unit_id} of ledger ${l.value.ledger_id} as present at ${u.presence}`,
        })),
    )
    .sort((a, b) => (a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0));
  const body = {
    world: pin(world.fact),
    locus: pin(locus.fact),
    statements: deliveredFacts(world.value, locus.value).map((f) => f.text),
    ledgers: here.map((l) => pin(l.fact)),
    presence_here: presence,
  };
  return PcCollectionSceneEvidenceSchema.parse({ ...body, digest: sha256Canonical(body) });
}

/**
 * The scene verdict, DERIVED from the validated scene reading and the evidence. Every ground is a verbatim quotation of the delivered
 * wording. `SOLITARY_CLASS_ESTABLISHED` needs a "no co-present consequential interaction" reading with grounds AND the host's
 * acknowledgement (a verbatim quotation) of every other unit Population records as present at the locus; a co-present consequential
 * interaction takes the act out of the class; anything undecided WITHHOLDS.
 */
export function deriveSceneVerdict(
  scene: { reading: string; grounds: readonly string[] },
  evidence: PcCollectionSceneEvidence,
): Result<"SOLITARY_CLASS_ESTABLISHED" | "ENGAGED_NOT_SOLITARY" | "WITHHELD", "ANSWER_INVALID"> {
  const delivered = [...evidence.statements, ...evidence.presence_here.map((p) => p.statement)];
  for (const ground of scene.grounds)
    if (ground.length < MIN_QUOTE_LENGTH || !delivered.some((d) => d.includes(ground)))
      return fail(
        "ANSWER_INVALID",
        "a scene ground is a verbatim quotation of the delivered evidence",
      );
  if (scene.reading === "NOT_ESTABLISHED") return ok("WITHHELD");
  if (scene.grounds.length === 0)
    return fail("ANSWER_INVALID", "a decided scene reading cites the delivered evidence");
  if (scene.reading === "CO_PRESENT_CONSEQUENTIAL_INTERACTION") return ok("ENGAGED_NOT_SOLITARY");
  const acknowledged = evidence.presence_here.every((p) =>
    scene.grounds.some((g) => p.statement.includes(g) && g.includes(p.unit_id)),
  );
  return ok(acknowledged ? PC_SCENE_VERDICT_ESTABLISHED : "WITHHELD");
}

// ---------------------------------------------------------------------------------------------
// F-2 — semantic attestation of the PC's serial handling cycle.
// ---------------------------------------------------------------------------------------------

/** The bounded task the I-002 compiler/adjudicator interprets: the cited claims' committed wording and the mechanism's stated cycle. */
export function buildCycleTask(
  facts: FactView,
  mechanism: { fact: OwnerFact; value: PcCollectionMechanism },
): Result<PcCollectionCycleTask, typeof PREREQ> {
  const m = mechanism.value;
  const contract = parse(facts, pcExistenceContractKey(m.pc_id), ExistenceContractSchema);
  if (!contract) return refuse("the PC's released contract is not committed");
  const claims = [];
  for (const locator of m.authored_from.claims) {
    const found = pcClaimAt(contract.value, locator);
    if (!found) return refuse("a cited claim is not an accepted claim of the PC's contract");
    claims.push({ locator, statement: found.statement });
  }
  const body = {
    pc_id: m.pc_id,
    mechanism: pin(mechanism.fact),
    claims,
    actuator: m.actuator.statement,
    cycle: m.cycle.duration,
  };
  return ok(PcCollectionCycleTaskSchema.parse({ ...body, digest: sha256Canonical(body) }));
}

/**
 * Validates the host's UNTRUSTED reading against the task. An attestation exists only for the reading that the cited content denotes
 * ONE same-form unit handled by the named actuator in ONE serial cycle; every ground is a verbatim quotation of the delivered claim
 * wording; the actuator ground is the mechanism's own actuator statement; the cycle ground states the exact numeral and canonical
 * unit. Necessary, never sufficient: the host's reading is the semantic act, and without it no exact cycle exists.
 */
export function interpretCycleAnswer(
  task: PcCollectionCycleTask,
  answer: unknown,
): Result<PcCollectionCycleAnswer, "ANSWER_INVALID"> {
  const a = PcCollectionCycleAnswerSchema.safeParse(answer);
  if (!a.success) return fail("ANSWER_INVALID", "the reading is not a well-formed cycle reading");
  if (a.data.task_digest !== task.digest)
    return fail("ANSWER_INVALID", "the reading answers a different task");
  const text = task.claims.map((c) => c.statement);
  const quoted = (q: string) => q.length >= MIN_QUOTE_LENGTH && text.some((t) => t.includes(q));
  if (a.data.reading !== "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE")
    return fail(
      "ANSWER_INVALID",
      "no attestation exists unless the content is read as one same-form unit in one serial cycle",
    );
  if (a.data.actuator_ground !== task.actuator || !quoted(a.data.actuator_ground))
    return fail("ANSWER_INVALID", "the actuator ground is the mechanism's own quoted actuator");
  if (!quoted(a.data.cycle_ground) || !statesExactDuration(a.data.cycle_ground, task.cycle))
    return fail(
      "ANSWER_INVALID",
      "the cycle ground is a verbatim quotation that states the exact numeral and canonical unit",
    );
  if (!a.data.grounds.every(quoted))
    return fail("ANSWER_INVALID", "every ground is a verbatim quotation of the delivered claims");
  return ok(a.data);
}

export const pcCycleHookId = (pcId: string, mechanismId: string): string =>
  `pc-collect-hook:${pcId}:${mechanismId}`;

/**
 * What a cycle attestation must be, judged against committed facts: at its slot with its derived identity; pinned to the mechanism
 * (SEALED, so the exact committed version), the contract and the cited claims the mechanism follows; its Temporal Hook is the
 * mechanism's one cycle in the canonical unit; its grounds are re-derived against the delivered task; effective from the canonical time
 * (at admission exactly now, on re-verification no later than now). It is the OWNER's record: an unattested claim cannot ground τ.
 */
export function pcCycleAttestationViolation(
  key: string,
  a: PcCollectionCycleAttestation,
  facts: FactView,
  verify = false,
): string | null {
  const mechKey = a.mechanism.fact_key;
  const mechId = (/^pc\/[^/]+\/collection-mechanism\/([^/]+)$/.exec(mechKey) ?? [])[1];
  if (
    !mechId ||
    mechKey !== pcCollectionMechanismKey(a.pc_id, mechId) ||
    key !== pcCollectionAttestationKey(a.pc_id, mechId) ||
    a.attestation_id !== pcCollectionAttestationId(a.pc_id, mechId) ||
    a.temporal_hook.hook_id !== pcCycleHookId(a.pc_id, mechId)
  )
    return "an attestation is at the slot, and has the identities, derived from its PC and mechanism";
  const mechanism = parse(facts, mechKey, PcCollectionMechanismSchema);
  if (!mechanism || mechanism.fact.version !== a.mechanism.version)
    return "the attestation is pinned to the PC's committed mechanism at its exact version";
  const m = mechanism.value;
  if (
    m.pc_id !== a.pc_id ||
    !canonicalEqual(m.authored_from.contract, a.contract) ||
    !canonicalEqual(m.authored_from.claims, a.claims) ||
    !canonicalEqual(m.cycle.duration, a.temporal_hook.per_cycle) ||
    m.actuator.statement !== a.actuator_ground
  )
    return "the attestation attests exactly the mechanism's contract, claims, actuator and cycle: its Temporal Hook is that one cycle";
  const task = buildCycleTask(facts, mechanism);
  if (!task.ok) return task.error.message;
  if (task.value.digest !== a.task_digest)
    return "the attestation answers the task its mechanism and claims determine";
  const checked = interpretCycleAnswer(task.value, {
    task_digest: a.task_digest,
    reading: "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
    actuator_ground: a.actuator_ground,
    cycle_ground: a.cycle_ground,
    grounds: a.grounds,
  });
  if (!checked.ok) return checked.error.message;
  if (a.meaning !== PC_CYCLE_MEANING) return "the accepted meaning is the one serial cycle";
  const now = clockOf(facts);
  if (!now) return "no canonical temporal basis is established";
  if (a.effective_from.unit !== now.unit || a.temporal_hook.per_cycle.unit !== now.unit)
    return "Temporal keeps unit authority: the cycle is in the campaign's canonical unit, or no exact completion follows";
  if (verify ? a.effective_from.value > now.value : a.effective_from.value !== now.value)
    return "an attestation is effective from the canonical time it was committed at, never retroactively";
  return null;
}

export { OWNER_PC_EXISTENCE };
