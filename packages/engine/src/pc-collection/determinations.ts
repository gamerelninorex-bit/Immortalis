import {
  BoundaryIndexSchema,
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
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
  PcPhysicalLocusCustodySchema,
  PopulationWorkforceScopeSchema,
  SourceAccountSchema,
  WorldSceneClosureSchema,
  WorldSourceConditionSchema,
  PopulationBasisSchema,
  PopulationPcRepresentationSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
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
  popWorkforceScopeKey,
  productionExtractionObjectId,
  productionSourceAccountKey,
  worldProfileKey,
  worldLocusKey,
  worldSceneClosureKey,
  compareTime,
  burdenLocus,
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
  type PopulationWorkforceScope,
  type WorldSceneClosure,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { pcClaimAt } from "../pc-capability/derive.ts";
import { deliveredFacts } from "../referee/derive.ts";
import type { FactView } from "../world/pc-locus-custody.ts";
import { resolveEntityLocus } from "../logistics/locus.ts";
import { pcHasMovementRecords } from "./state.ts";
import { resolveClarifiedClaims } from "./clarification.ts";

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
 * Population's determination, from its own committed facts and the PC's identity: INCLUDED when any ledger counts a unit with this
 * identity; OUTSIDE_AGGREGATE only when Population's workforce scope for the PC's locality is CURRENT (every representation bearing
 * on the locality accounted, none changed since) and none of them counts the PC; UNKNOWN otherwise. A ledger's silence about the PC,
 * the PC's binding and a caller's statement are never evidence: an omitted identity is UNKNOWN until a complete, current scope exists.
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
  const scope = parse(
    facts,
    popWorkforceScopeKey(locality.world.entity_id, locality.locus.entity_id),
    PopulationWorkforceScopeSchema,
  );
  const scopeCurrent = scope !== undefined && workforceScopeStatus(scope.value, facts) === null;
  const status =
    including.length > 0
      ? PC_REPRESENTATION_INCLUDED
      : scopeCurrent
        ? PC_REPRESENTATION_OUTSIDE
        : PC_REPRESENTATION_UNKNOWN;
  const examined =
    status === PC_REPRESENTATION_INCLUDED
      ? including
      : scopeCurrent
        ? scope!.value.representations.map((r) => ledgers.find((l) => l.fact.key === r.fact_key)!)
        : [];
  const value = PopulationPcRepresentationSchema.safeParse({
    pc_id: pcId,
    status,
    locality: {
      world_id: locality.world.entity_id,
      locus_id: locality.locus.entity_id,
    },
    ledgers: [...new Map(examined.map((l) => [l.fact.key, pin(l.fact)])).values()].sort((a, b) =>
      a.fact_key < b.fact_key ? -1 : 1,
    ),
    scope: scopeCurrent ? pin(scope!.fact) : null,
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

/**
 * Where the PC stationarily IS, for a collection: the one lawful answer, never an invented locus. With no movement of any kind
 * (no movement commitment-of-record and no PC-owned request) it is the stationary custody record's locus. A voluntary movement that
 * is committed, requested, dispatched, in transfer or awaiting its retirement is IN FLIGHT or pending: the PC is not stationary and
 * cannot begin a collection. Once the single leg has SETTLED (World-State's destination commit exists and the Logistics transfer is
 * retired) the PC is stationary at that destination, and World-State's destination is the one authority for it (the custody record
 * is immutable predecessor provenance of the origin). No new journey rule and no travel are involved.
 */
export function pcStationaryLocus(
  pcId: string,
  custody: { stationary_locus: { world: { entity_id: string } } },
  facts: FactView,
): { reason: string } | { locus: LocusRef; settled: boolean } {
  if (!pcHasMovementRecords(facts, pcId))
    return { locus: custody.stationary_locus as LocusRef, settled: false };
  const resolved = resolveEntityLocus(
    { getFact: (k) => facts.get(k) },
    custody.stationary_locus.world.entity_id,
    pcId,
  );
  if (resolved?.phase !== "DESTINATION_COMMITTED" || !resolved.stationary)
    return {
      reason:
        "the PC has a voluntary movement that is pending or in flight: a PC that is not stationary cannot begin a collection",
    };
  return { locus: resolved.stationary, settled: true };
}

// ---------------------------------------------------------------------------------------------
// Bounded semantic delegation — the World-State scene closure and Population's workforce scope (see CPAA_C1_DELEGATED).
// ---------------------------------------------------------------------------------------------

const COUPLING_KEY = /^world-state\/actor\/[^/]+\/coupling$/;
const CUSTODY_KEY = /^world-state\/pc\/[^/]+\/locus-custody$/;
const sortedPins = (pins: readonly { fact_key: string; version: number }[]) =>
  [...pins].sort((a, b) => (a.fact_key < b.fact_key ? -1 : a.fact_key > b.fact_key ? 1 : 0));

const locusRefOf = (worldId: string, locusId: string): LocusRef => ({
  world: { fact_key: worldProfileKey(worldId), entity_id: worldId },
  locus: { fact_key: worldLocusKey(worldId, locusId), entity_id: locusId },
});

/**
 * What the owners hold NOW that bears on one locus: every Population ledger attached to it, every actor coupled to it and every
 * Player Character whose stationary physical locus it is. Derived, never supplied. Empty when the view cannot enumerate.
 */
export function liveSceneCoverage(facts: ScanFacts, locality: LocusRef) {
  const actors: string[] = [];
  const pcs: string[] = [];
  if (facts.values) {
    for (const fact of facts.values()) {
      if (COUPLING_KEY.test(fact.key)) {
        const c = ExistingActorCouplingSchema.safeParse(fact.value);
        if (
          c.success &&
          c.data.coupling.world.entity_id === locality.world.entity_id &&
          c.data.coupling.locus.entity_id === locality.locus.entity_id
        )
          actors.push(c.data.actor_id);
      } else if (CUSTODY_KEY.test(fact.key)) {
        const c = PcPhysicalLocusCustodySchema.safeParse(fact.value);
        if (!c.success) continue;
        // where the PC stationarily IS (after a settled leg, World-State's destination is the one authority); a PC in flight is nowhere
        const at = pcStationaryLocus(c.data.pc_id, c.data, facts);
        if (
          !("reason" in at) &&
          at.locus.world.entity_id === locality.world.entity_id &&
          at.locus.locus.entity_id === locality.locus.entity_id
        )
          pcs.push(c.data.pc_id);
      }
    }
  }
  return {
    population_ledgers: sortedPins(
      populationLedgers(facts)
        .filter((l) => atLocus(l.value, locality))
        .map((l) => pin(l.fact)),
    ),
    // a Player Character that was an existing actor keeps its immutable coupling as provenance: it is the PC (listed below), not another actor
    actors: [...new Set(actors)].filter((a) => !pcs.includes(a)).sort(),
    pcs: [...new Set(pcs)].sort(),
  };
}

/** Is a committed closure still CURRENT? null when so; otherwise why not. A stale closure establishes nothing. */
export function sceneClosureStatus(c: WorldSceneClosure, facts: ScanFacts): string | null {
  const locality = locusRefOf(c.locality.world_id, c.locality.locus_id);
  const world = facts.get(c.world.fact_key);
  const locus = facts.get(c.locus.fact_key);
  if (
    c.world.fact_key !== locality.world.fact_key ||
    c.locus.fact_key !== locality.locus.fact_key ||
    world?.version !== c.world.version ||
    locus?.version !== c.locus.version
  )
    return "the world or locus the closure was established against has changed";
  if (!facts.values) return "the owners' scene cannot be enumerated here";
  const live = liveSceneCoverage(facts, locality);
  if (!canonicalEqual(live, c.covered))
    return "what the owners hold at this locus is not what the closure covered (a further resident, ledger version, actor or Player Character)";
  return null;
}

/**
 * What a scene-closure fact must be. At its slot always. At admission: the canonical time exists and is the effective time; the
 * world and locus are the committed ones at their pinned versions; the covered evidence is EXACTLY what the owners hold now
 * (derived, never a declaration's); and every source right names a source established at this locus. On re-verification only
 * structure (the owners' facts advance, so the as-then derivation is not re-run).
 */
export function sceneClosureViolation(
  key: string,
  c: WorldSceneClosure,
  facts: ScanFacts,
  verify = false,
): string | null {
  if (key !== worldSceneClosureKey(c.locality.world_id, c.locality.locus_id))
    return "a scene closure is at the slot derived from its world and locus";
  if (verify) return null;
  const now = clockOf(facts);
  if (!now) return "no canonical temporal basis is established: a closure has an effective time";
  if (compareTime(now, c.effective_at) !== 0)
    return "a closure is effective at the canonical time it is established";
  // the delegated rule covers a strictly ORIGINAL, author-closed domain only: no reference-setting world can be declared closed here
  const world = parse(facts, c.world.fact_key, WorldProfileSchema);
  if (!world || world.value.reference_causal_basis.mode !== "ORIGINAL")
    return "a closed-domain declaration is lawful only for a strictly ORIGINAL world its author established";
  const status = sceneClosureStatus(c, facts);
  if (status !== null) return status;
  for (const r of c.source_rights) {
    const src = parse(facts, r.source_fact_key, WorldSourceConditionSchema);
    if (
      !src ||
      src.value.locality.world.entity_id !== c.locality.world_id ||
      src.value.locality.locus.entity_id !== c.locality.locus_id
    )
      return "a source right names a source established at this very locus";
  }
  return null;
}

/** Every Population ledger that bears on one locality: attached to it, or one of whose units is present or burdened there. */
export function liveWorkforceRepresentations(facts: ScanFacts, locality: LocusRef) {
  return populationLedgers(facts).filter(
    (l) =>
      atLocus(l.value, locality) ||
      l.value.units.some(
        (u) =>
          u.presence === locality.locus.entity_id || burdenLocus(u) === locality.locus.entity_id,
      ),
  );
}

/** What Population derives for a scope NOW: the representations and their identity/count provenance. */
export function deriveWorkforceAccounting(facts: ScanFacts, locality: LocusRef) {
  const live = liveWorkforceRepresentations(facts, locality);
  return {
    representations: sortedPins(live.map((l) => pin(l.fact))),
    accounted: live
      .map((l) => ({
        ledger_id: l.value.ledger_id,
        count: l.value.units.length,
        unit_ids: l.value.units.map((u) => u.unit_id).sort(),
      }))
      .sort((a, b) => (a.ledger_id < b.ledger_id ? -1 : a.ledger_id > b.ledger_id ? 1 : 0)),
  };
}

/** Is a committed workforce scope still CURRENT? null when so. A stale scope establishes nothing. */
export function workforceScopeStatus(s: PopulationWorkforceScope, facts: ScanFacts): string | null {
  if (!facts.values) return "Population's representations cannot be enumerated here";
  const derived = deriveWorkforceAccounting(
    facts,
    locusRefOf(s.locality.world_id, s.locality.locus_id),
  );
  return canonicalEqual(derived.representations, s.representations) &&
    canonicalEqual(derived.accounted, s.accounted)
    ? null
    : "the representations bearing on this locality are not those the scope accounted (a further ledger, or a changed one)";
}

/**
 * What a workforce-scope fact must be: at its slot; at admission, the canonical time and exactly what Population's live ledgers
 * derive (the declaration supplies only the statement); on re-verification only structure.
 */
export function workforceScopeViolation(
  key: string,
  s: PopulationWorkforceScope,
  facts: ScanFacts,
  verify = false,
): string | null {
  if (key !== popWorkforceScopeKey(s.locality.world_id, s.locality.locus_id))
    return "a workforce scope is at the slot derived from its world and locus";
  if (verify) return null;
  const now = clockOf(facts);
  if (!now) return "no canonical temporal basis is established";
  if (compareTime(now, s.determined_at) !== 0)
    return "a scope is determined at the canonical time it is established";
  return workforceScopeStatus(s, facts);
}

/**
 * ENGAGEMENT evidence at enrollment (the closed-scenario preclusion route). The work is enrolled only if nothing else bears on the
 * source or the interval: no foreign claim is open on the source's account, and no other Temporal boundary falls due at or before
 * the work's earned completion. The closure declares the domain closed; this is the live check that no independent cause is in play,
 * and it never suppresses one.
 */
export function foreignEngagementViolation(
  facts: FactView,
  a: {
    worldId: string;
    sourceKey: string;
    extractionId: string;
    completesAt: CanonicalTime;
  },
): string | null {
  const account = parse(
    facts,
    productionSourceAccountKey(a.worldId, a.sourceKey),
    SourceAccountSchema,
  );
  if (account?.value.open.some((o) => o.extraction_id !== a.extractionId))
    return "another claim is open on this source: the work is not the only engagement with it";
  const index = parse(facts, TEMPORAL_BOUNDARY_INDEX_KEY, BoundaryIndexSchema);
  const own = productionExtractionObjectId(a.extractionId);
  const other = index?.value.entries.find(
    // an incomparable boundary (another unit) cannot be placed outside the interval, so it fails closed
    (e) => e.object_id !== own && (compareTime(e.at, a.completesAt) ?? 0) <= 0,
  );
  return other
    ? "another process falls due within the work's interval: the interval is not covered by the closure alone"
    : null;
}

// ---------------------------------------------------------------------------------------------
// F-1 — the solitary-class scene evidence and verdict.
// ---------------------------------------------------------------------------------------------

/**
 * The scene evidence the owners hold at the PC's locus: the committed world and locus wording, the World-State SCENE CLOSURE (a pinned
 * owner fact) and the Population ledgers that attach to this locus (with every OTHER unit whose Population presence is this locus).
 * Built ONLY from a CURRENT closure: one whose derived coverage still equals what the owners hold now (a further resident, actor, PC
 * or ledger version makes it stale), that covers this very PC, and that establishes this very source as unencumbered. A ledger or a
 * host reading never completes the scene; with no current closure nothing is built and the solitary class is withheld (a message,
 * never a default). Mechanical: it asserts nothing.
 */
export function buildSceneEvidence(
  facts: ScanFacts,
  pcId: string,
  locality: LocusRef,
  sourceFactKey: string,
): PcCollectionSceneEvidence | { reason: string } {
  const world = parse(facts, locality.world.fact_key, WorldProfileSchema);
  const locus = parse(facts, locality.locus.fact_key, WorldLocusSchema);
  if (!world || !locus) return { reason: "the committed world and locus wording is not held" };
  const closure = parse(
    facts,
    worldSceneClosureKey(locality.world.entity_id, locality.locus.entity_id),
    WorldSceneClosureSchema,
  );
  if (!closure)
    return {
      reason:
        "no World-State scene closure establishes this locus as a closed domain: a ledger and a host reading do not, so the solitary handling kind is withheld",
    };
  const stale = sceneClosureStatus(closure.value, facts);
  if (stale !== null) return { reason: `the scene closure is not current: ${stale}` };
  if (!closure.value.covered.pcs.includes(pcId))
    return { reason: "the scene closure does not cover this Player Character" };
  const rights = closure.value.source_rights.find((r) => r.source_fact_key === sourceFactKey);
  if (!rights)
    return {
      reason:
        "the scene closure establishes no unencumbered access to this source: reach alone grants no right",
    };
  const here = populationLedgers(facts).filter((l) => atLocus(l.value, locality));
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
    closure: pin(closure.fact),
    statements: [
      ...deliveredFacts(world.value, locus.value).map((f) => f.text),
      `World-State scene closure — domain ${closure.value.domain.designation}: ${closure.value.domain.topology}`,
      `World-State scene closure — ${closure.value.closure.statement}`,
      `World-State source rights — ${rights.ground}`,
    ],
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
  // R-5: the clarified claims the mechanism also follows, at their exact committed versions (absent for a contract-only mechanism)
  const clarified = resolveClarifiedClaims(m.pc_id, m.authored_from.clarified, facts);
  if (!clarified.ok) return refuse(clarified.message);
  const body = {
    pc_id: m.pc_id,
    mechanism: pin(mechanism.fact),
    claims,
    ...(clarified.claims.length > 0
      ? { clarified: clarified.claims.map((c) => ({ ref: c.ref, statement: c.statement })) }
      : {}),
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
  // the actuator is the released contract's own accepted statement; the clarified timing may ground the cycle and the grounds (BLUE H-1)
  const contractText = task.claims.map((c) => c.statement);
  const text = [...contractText, ...(task.clarified ?? []).map((c) => c.statement)];
  const quoted = (q: string) => q.length >= MIN_QUOTE_LENGTH && text.some((t) => t.includes(q));
  const quotedContract = (q: string) =>
    q.length >= MIN_QUOTE_LENGTH && contractText.some((t) => t.includes(q));
  if (a.data.reading !== "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE")
    return fail(
      "ANSWER_INVALID",
      "no attestation exists unless the content is read as one same-form unit in one serial cycle",
    );
  if (a.data.actuator_ground !== task.actuator || !quotedContract(a.data.actuator_ground))
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
    !canonicalEqual(m.authored_from.clarified ?? [], a.clarified ?? []) ||
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
