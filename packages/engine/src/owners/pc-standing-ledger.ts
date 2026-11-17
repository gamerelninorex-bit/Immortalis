import {
  ActorSetupPlacementSchema,
  ExistenceContractSchema,
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  LEDGER_ORIGIN_START_OF_LEDGER,
  PC_LEDGER_FIRST_SEQUENCE,
  PLAYER_CHARACTER_BINDING_KEY,
  PcStandingLedgerHeadSchema,
  PcStandingLedgerVersionSchema,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  fail,
  ok,
  pcExistenceContractKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type Failure,
  type InitializePcLedgerTarget,
  type LedgerCommittedFactRef,
  type OwnerFact,
  type PcStandingLedgerHead,
  type PcStandingLedgerVersion,
  type PcStandingLedgerVersionBody,
  type PlayerCharacterBinding,
  type QualifyLegacyPcLedgerTarget,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { PC_LEDGER_BINDING_RULE, factKind, resolveKey } from "./registry.ts";

/**
 * S-4 initial Standing Instruction ledger — the single statement of what the ledger and its binding prerequisite ARE, as pure
 * functions of committed facts (BLUE brief Part B1). Both the authored operations (which build a group from the facts) and IM-03
 * admission, historical replay and cold-open verification (which re-judge the group against the facts as they stood before it) use
 * THESE functions, so what is committed is exactly what the committed upstream facts determine, for a raw `store.commit` as much as
 * for the owner path, and the three can never drift.
 *
 * Nothing here is a game rule. It invents no instruction, no consent, no timestamp and no second chronology; it fixes only the
 * carrier, its provenance and the dependency direction the ratified S-4 clauses require.
 */

/**
 * The historical-verification policy identity of the S-4 initial ledger. Replay judges every ledger group and every S-4-cited
 * binding against the ACTUAL pre-state it was committed on, so checkpoint evidence earned under a build without these rules is never
 * trusted: the first open under this policy replays strictly (checkpoint reuse requires the same `historyVerificationId`).
 * It names the exact ratified source (S-4 v0.4 and its Sovereign ratification) and the BLUE construction brief it lowers.
 */
export const PC_LEDGER_HISTORY_POLICY_SUFFIX =
  "+S4-INITIAL-LEDGER@2026-11-15T13:54:22.606Z/2026-11-15T14:02:45.229Z+BRIEF@2026-11-17T04:59:46.616Z";

/** The opaque `basis` and `secrecy` every ledger write carries. F-027 defines no vocabulary; these are fixed so a write is canonical. */
export const PC_LEDGER_BASIS = "s4-pc-standing-instruction-ledger-initial";
export const PC_LEDGER_SECRECY = "pc-bookkeeping-internal";

/** The two operation tags the deterministic identities are derived under (BLUE brief B1, "Initial intent identity"). */
export const S4_NEW_PC_TAG = "S4_ENGINE_ORIGIN_LEDGER_CLOSURE_V1";
export const S4_START_OF_LEDGER_TAG = "S4_START_OF_LEDGER_V1";

export type LedgerFacts = Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">;
/** A cut that can also be walked (admission's state, a store's canonical state). */
export interface WalkableLedgerFacts extends LedgerFacts {
  /**
   * Every fact of the cut. `keyFilter`, when given, is a pure optimisation hint that runs on the KEY alone, before anything that
   * costs (a view that must resolve a receipt per fact can skip the lookup for keys nobody wants). A view may ignore it, so a
   * consumer must still test the key itself.
   */
  values(keyFilter?: (key: string) => boolean): Iterable<OwnerFact>;
}

const isSetupPlacementKey = (key: string): boolean =>
  key.startsWith("world-state/actor/") && key.endsWith("/setup-placement");

/** An exact reference to one committed fact: key, version and the identity of the commit that wrote it. */
export const refOfFact = (fact: OwnerFact): LedgerCommittedFactRef => ({
  fact_key: fact.key,
  version: fact.version,
  commit: { group_id: fact.provenance.group_id, intent_id: fact.provenance.intent_id },
});

/** Whether `ref` is exactly the committed fact it names (key, version and commit identity). A message, or null when it is. */
export function refViolation(
  ref: LedgerCommittedFactRef,
  facts: LedgerFacts,
  what: string,
): string | null {
  const fact = facts.get(ref.fact_key);
  if (!fact) return `${what} is not committed`;
  if (
    fact.version !== ref.version ||
    fact.provenance.group_id !== ref.commit.group_id ||
    fact.provenance.intent_id !== ref.commit.intent_id
  ) {
    return `${what} is cited by other than its exact committed version and commit identity`;
  }
  return null;
}

/** `content_sha256 = SHA-256(UTF-8(canonicalJson(version WITHOUT content_sha256)))`: never the digest of an object that holds its own. */
export const ledgerVersionDigest = (body: PcStandingLedgerVersionBody): string =>
  sha256Canonical(body);

export function sealLedgerVersion(body: PcStandingLedgerVersionBody): PcStandingLedgerVersion {
  return { ...body, content_sha256: ledgerVersionDigest(body) };
}

/** The head that points at a freshly created sequence-1 version (whose fact version is 1). */
export const headOfVersion = (version: PcStandingLedgerVersion): PcStandingLedgerHead => ({
  pc_id: version.pc_id,
  current: {
    fact_key: pcStandingLedgerVersionKey(version.pc_id, version.sequence),
    version: 1,
  },
  content_sha256: version.content_sha256,
});

/**
 * The deterministic operation digest (BLUE brief B1): a SHA-256 over the canonical JSON of the operation tag, the canonical PC
 * identity and ONLY the source facts the witness rests on. For L-2 that is the PC and the original operative binding's commit
 * identity and nothing else: never a horizon, a clock, a session or a transport nonce, so a retry in another session or at another
 * canonical time derives the same identity and finds the same single head.
 */
export function ledgerOperationDigest(body: PcStandingLedgerVersionBody): string {
  const o = body.origin;
  return o.kind === LEDGER_ORIGIN_START_OF_LEDGER
    ? sha256Canonical([S4_START_OF_LEDGER_TAG, body.pc_id, o.operative_binding])
    : sha256Canonical([S4_NEW_PC_TAG, body.pc_id, o.pc_creation, o.target_world, o.setup_closure]);
}

/**
 * The world an engine-origin ledger was qualified against, named by the world profile it cites; `null` when the reference is not a
 * world profile at all (a malformed or foreign key), which every caller treats as a refusal.
 */
export function targetWorldIdOf(ref: { readonly fact_key: string }): string | null {
  const resolved = resolveKey(ref.fact_key);
  return resolved?.kind.id === "world_profile" ? (resolved.ids[0] ?? null) : null;
}

/** The canonical publication identity of the group that writes `body`'s head and version. Derived, never caller-supplied. */
export function ledgerPublication(body: PcStandingLedgerVersionBody) {
  const digest = ledgerOperationDigest(body);
  return {
    group_id: `s4-ledger-group:${digest}`,
    intent_id: `s4-ledger-intent:${digest}`,
    cause: `s4-ledger-cause:${digest}`,
    basis: PC_LEDGER_BASIS,
    secrecy: PC_LEDGER_SECRECY,
  } as const;
}

/** A first-ACTIVATION or handover binding written under the S-4 citation (and so one that required this PC's ledger head). */
export const isLedgerBindingFact = (fact: OwnerFact): boolean =>
  canonicalEqual(fact.provenance.rule, PC_LEDGER_BINDING_RULE);

/** A binding committed under the ORIGINAL citation (before S-4): authentic old, headless by history, never edited. */
export const isLegacyBindingFact = (fact: OwnerFact): boolean =>
  canonicalEqual(fact.provenance.rule, factKind("player_character_binding").rule);

/**
 * Whether a campaign cut holds a setup placement whose world has not yet been closed. A head committed now would end setup
 * eligibility (the ledger kinds are not setup kinds) and strand that closure for ever, so it is refused: the ledger comes AFTER the
 * closure wherever the setup predicate is used. The walk prefilters by key text, so it costs a string comparison per fact and
 * resolves a key only for the few placements.
 */
export function unclosedSetupViolation(facts: WalkableLedgerFacts): string | null {
  for (const fact of facts.values(isSetupPlacementKey)) {
    const k = fact.key;
    if (!isSetupPlacementKey(k)) continue;
    if (resolveKey(k)?.kind.id !== "actor_setup_placement") continue;
    const p = ActorSetupPlacementSchema.safeParse(fact.value);
    if (!p.success) return `a committed setup placement is malformed: ${k}`;
    if (!facts.has(worldSetupClosureKey(p.data.world.entity_id))) {
      return `world ${p.data.world.entity_id} has a setup placement (${k}) but no world_setup_closure yet: the ledger follows the closure, because committing it earlier would end setup eligibility and strand that closure`;
    }
  }
  return null;
}

export interface LedgerPlan {
  readonly version: PcStandingLedgerVersion;
  readonly head: PcStandingLedgerHead;
  readonly publication: ReturnType<typeof ledgerPublication>;
  /** committed facts the group reads at their exact version and depends on */
  readonly pinned: readonly string[];
  /** keys read at version 0 to detect a concurrent appearance (an optimistic pin, not a dependency) */
  readonly absent: readonly string[];
}

type PlanFailureCode = "PREREQUISITE_MISSING" | "REFERENCE_INVALID";
const refuse = (
  code: PlanFailureCode,
  message: string,
): { ok: false; error: Failure<PlanFailureCode> } => fail(code, message);

function planOf(body: PcStandingLedgerVersionBody, pinned: string[], absent: string[]): LedgerPlan {
  const version = sealLedgerVersion(body);
  return {
    version,
    head: headOfVersion(version),
    publication: ledgerPublication(body),
    pinned,
    absent,
  };
}

/**
 * S-4c: the ENGINE_ORIGIN_LEDGER_CLOSURE witness of a PC being created, derived ONLY from the facts actually committed: the PC's
 * released Existence Contract (fresh generation or existing-actor compilation) and the applicable world's closure where the world
 * has one. It is refused unless the PC, its world and locus are committed and nothing is bound yet, and unless no setup closure is
 * still owed. The caller supplies identities only: no origin label, reference, digest or intent is accepted from it.
 */
export function deriveNewPcLedger(
  facts: WalkableLedgerFacts,
  target: InitializePcLedgerTarget,
  mode: "CREATE" | "RECONCILE" = "CREATE",
): Result<LedgerPlan, PlanFailureCode> {
  const pcKey = pcExistenceContractKey(target.pc_id);
  const pcFact = facts.get(pcKey);
  if (!pcFact) {
    return refuse(
      "PREREQUISITE_MISSING",
      "the PC's released Existence Contract is not committed: a ledger is never created for a PC that does not exist",
    );
  }
  if (!ExistenceContractSchema.safeParse(pcFact.value).success) {
    return refuse(
      "REFERENCE_INVALID",
      "the PC existence contract is not a released Existence Contract",
    );
  }
  const worldKey = worldProfileKey(target.world_id);
  const locusKey = worldLocusKey(target.world_id, target.locus_id);
  if (!facts.has(worldKey) || !facts.get(locusKey)) {
    return refuse(
      "PREREQUISITE_MISSING",
      "the world and locus the PC will be coupled to are not committed",
    );
  }
  const locus = WorldLocusSchema.safeParse(facts.get(locusKey)!.value);
  if (!locus.success || locus.data.world.entity_id !== target.world_id) {
    return refuse("REFERENCE_INVALID", "the locus does not belong to the world being coupled");
  }
  // RECONCILE re-derives the identity of a ledger that is ALREADY committed (a retry after a lost acknowledgment, possibly after the
  // binding it preceded has committed too): it must not refuse merely because the story has since moved on, and it creates nothing
  if (mode === "CREATE") {
    if (facts.has(PLAYER_CHARACTER_BINDING_KEY)) {
      return refuse(
        "REFERENCE_INVALID",
        "a player character is already bound: an engine-origin ledger precedes its binding, so it can no longer be created; an already-bound PC is qualified by START_OF_LEDGER instead",
      );
    }
    const pending = unclosedSetupViolation(facts);
    if (pending) return refuse("REFERENCE_INVALID", pending);
  }
  const closureKey = worldSetupClosureKey(target.world_id);
  const closure = facts.get(closureKey);
  return ok(
    planOf(
      {
        pc_id: target.pc_id,
        sequence: PC_LEDGER_FIRST_SEQUENCE,
        origin: {
          kind: LEDGER_ORIGIN_ENGINE_CLOSURE,
          pc_creation: refOfFact(pcFact),
          // the target world is part of what the witness rests on: the closure-or-null below is judged for THIS world, here and
          // again in raw admission, historical replay and cold-open verification
          target_world: refOfFact(facts.get(worldKey)!),
          setup_closure: closure ? refOfFact(closure) : null,
        },
        instructions: [],
        previous: null,
      },
      closure ? [pcKey, worldKey, closureKey] : [pcKey, worldKey],
      closure ? [] : [closureKey],
    ),
  );
}

/**
 * S-4d / L-2: the START_OF_LEDGER witness of an EXISTING bound PC, derived ONLY from the PC and its actual operative binding.
 * Only an authentic old binding (one committed under the original citation, before this ledger existed) is qualified: the binding
 * is cited, never rewritten, and the witness asserts only that the new carrier had no instruction enrolled before its first cut.
 */
export function deriveLegacyPcLedger(
  facts: LedgerFacts,
  target: QualifyLegacyPcLedgerTarget,
): Result<LedgerPlan, PlanFailureCode> {
  const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  if (!binding) {
    return refuse(
      "PREREQUISITE_MISSING",
      "no operative player-character binding is committed: START_OF_LEDGER qualifies an existing bound PC",
    );
  }
  const parsed = PlayerCharacterBindingSchema.safeParse(binding.value);
  if (!parsed.success || parsed.data.active_pc.entity_id !== target.pc_id) {
    return refuse("REFERENCE_INVALID", "the operative binding is not this PC's");
  }
  if (!isLegacyBindingFact(binding)) {
    return refuse(
      "REFERENCE_INVALID",
      "this binding was committed under the S-4 citation and so already required a ledger head: only an authentic old binding is qualified by START_OF_LEDGER",
    );
  }
  return ok(
    planOf(
      {
        pc_id: target.pc_id,
        sequence: PC_LEDGER_FIRST_SEQUENCE,
        origin: { kind: LEDGER_ORIGIN_START_OF_LEDGER, operative_binding: refOfFact(binding) },
        instructions: [],
        previous: null,
      },
      [PLAYER_CHARACTER_BINDING_KEY],
      [],
    ),
  );
}

/**
 * The O(1) half of the pair rule, a pure function of the two values and the commit identity: typed contract, exact PC/key
 * identities, a digest equal to the re-derived one, a head that points exactly at the version it travels with, and the canonical
 * publication identity derived from the PC and its source facts. Returns a message, or null.
 */
export function ledgerPairShapeViolation(
  headFact: { readonly key: string; readonly value: unknown },
  versionFact: { readonly key: string; readonly value: unknown },
  identity: { readonly group_id: string; readonly intent_id: string; readonly cause: string },
): string | null {
  const head = PcStandingLedgerHeadSchema.safeParse(headFact.value);
  const version = PcStandingLedgerVersionSchema.safeParse(versionFact.value);
  if (!head.success || !version.success) {
    return "the ledger head or version violates its typed contract";
  }
  const pcId = version.data.pc_id;
  if (head.data.pc_id !== pcId) return "the head and version name different PCs";
  if (
    headFact.key !== pcStandingLedgerHeadKey(pcId) ||
    versionFact.key !== pcStandingLedgerVersionKey(pcId, version.data.sequence)
  ) {
    return "the ledger keys are the exact keys derived from the PC identity and sequence";
  }
  const { content_sha256, ...body } = version.data;
  if (ledgerVersionDigest(body) !== content_sha256) {
    return "the version digest is not the SHA-256 of its canonical content without the digest";
  }
  if (!canonicalEqual(head.data, headOfVersion(version.data))) {
    return "the head points exactly at the same PC's sequence-1 version and carries exactly its digest";
  }
  const expected = ledgerPublication(body);
  if (
    identity.group_id !== expected.group_id ||
    identity.intent_id !== expected.intent_id ||
    identity.cause !== expected.cause
  ) {
    return "the ledger's operation identity is not the one derived from its PC and source facts";
  }
  return null;
}

/**
 * Whether an origin is true of the facts as they stood BEFORE the ledger group (the pair's own commit cut). `walk` is the same cut
 * as a walkable view; the unclosed-setup walk runs only for an engine-origin pair, once, at its own commit and at its own
 * verification, and never on the binding path.
 */
export function ledgerOriginViolation(
  version: PcStandingLedgerVersion,
  facts: LedgerFacts,
  walk?: WalkableLedgerFacts,
): string | null {
  const pcId = version.pc_id;
  const o = version.origin;
  if (o.kind === LEDGER_ORIGIN_START_OF_LEDGER) {
    const ref = o.operative_binding;
    if (ref.fact_key !== PLAYER_CHARACTER_BINDING_KEY) {
      return "START_OF_LEDGER cites the operative player-character binding";
    }
    const cited = refViolation(ref, facts, "the operative binding");
    if (cited) return cited;
    const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY)!;
    const binding = PlayerCharacterBindingSchema.safeParse(bindingFact.value);
    if (!binding.success || binding.data.active_pc.entity_id !== pcId) {
      return "the cited operative binding is not this PC's";
    }
    return isLegacyBindingFact(bindingFact)
      ? null
      : "only an authentic old binding, committed before this ledger existed, is qualified by START_OF_LEDGER";
  }
  const pcKey = pcExistenceContractKey(pcId);
  if (o.pc_creation.fact_key !== pcKey) return "pc_creation cites this PC's Existence Contract";
  const creation = refViolation(o.pc_creation, facts, "the PC's Existence Contract");
  if (creation) return creation;
  if (!ExistenceContractSchema.safeParse(facts.get(pcKey)!.value).success) {
    return "the PC existence contract is not a released Existence Contract";
  }
  // The closure-or-null is a claim about ONE world: the target world this creation route was qualified against. At this commit's own
  // cut that world either has a committed closure (the origin must cite exactly that closure) or it has none (the origin must be an
  // explicit null). A null is never taken on trust, and a closure of any other world is never a substitute.
  const worldId = targetWorldIdOf(o.target_world);
  if (worldId === null) return "target_world cites a world profile";
  const world = refViolation(o.target_world, facts, "the target world's profile");
  if (world) return world;
  const closureKey = worldSetupClosureKey(worldId);
  const committedClosure = facts.get(closureKey);
  if (committedClosure) {
    if (o.setup_closure === null) {
      return `the target world ${worldId} has a committed world_setup_closure: an explicit null closure is false, the ledger must cite that exact world's earlier closure`;
    }
    if (o.setup_closure.fact_key !== closureKey) {
      return `setup_closure cites the TARGET world's closure (${closureKey}), not another world's`;
    }
    const closure = refViolation(o.setup_closure, facts, "the target world's setup closure");
    if (closure) return closure;
  } else if (o.setup_closure !== null) {
    return `the target world ${worldId} has no committed world_setup_closure: a closure is cited only where the target world's own closure is committed`;
  }
  if (facts.has(PLAYER_CHARACTER_BINDING_KEY)) {
    return "an engine-origin ledger precedes its binding: a binding already exists, so this ledger came too late";
  }
  return walk ? unclosedSetupViolation(walk) : null;
}

/** The full pair rule at the pair's own commit cut: shape, then origin. Used by admission, replay and cold-open verification. */
export function ledgerPairViolation(
  headFact: { readonly key: string; readonly value: unknown },
  versionFact: { readonly key: string; readonly value: unknown },
  identity: { readonly group_id: string; readonly intent_id: string; readonly cause: string },
  facts: WalkableLedgerFacts,
): string | null {
  const shape = ledgerPairShapeViolation(headFact, versionFact, identity);
  if (shape) return shape;
  return ledgerOriginViolation(
    PcStandingLedgerVersionSchema.parse(versionFact.value),
    facts,
    facts,
  );
}

/**
 * The binding prerequisite (S-4c), a pure O(1) function of the cut strictly BEFORE the binding: the PC's ledger head and version are
 * committed there as one atomic PC-owner group, the sealed pair is well formed (typed value, exact keys, re-derived digest, exact
 * head pointer, canonical identity), its origin is the engine closure witness whose PC reference still holds, and its closure is
 * exactly the closure of the world the binding couples (non-null iff that world has one). The binding consumes the older head; it
 * never creates it. Returns a message, or null.
 */
export function bindingLedgerViolation(
  binding: PlayerCharacterBinding,
  facts: LedgerFacts,
): string | null {
  const pcId = binding.active_pc.entity_id;
  const headFact = facts.get(pcStandingLedgerHeadKey(pcId));
  const versionFact = facts.get(pcStandingLedgerVersionKey(pcId, PC_LEDGER_FIRST_SEQUENCE));
  if (!headFact || !versionFact) {
    return "this PC has no committed Standing Instruction ledger head: a binding consumes an older, qualified head and never creates it";
  }
  if (
    headFact.provenance.group_id !== versionFact.provenance.group_id ||
    headFact.provenance.intent_id !== versionFact.provenance.intent_id
  ) {
    return "the ledger head and version were not committed by one atomic PC-owner group";
  }
  const shape = ledgerPairShapeViolation(headFact, versionFact, headFact.provenance);
  if (shape) return shape;
  const version = PcStandingLedgerVersionSchema.parse(versionFact.value);
  if (version.origin.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) {
    return "a new binding requires the engine-origin ledger closure: START_OF_LEDGER only qualifies an already-bound legacy PC";
  }
  const pcKey = pcExistenceContractKey(pcId);
  if (version.origin.pc_creation.fact_key !== pcKey) {
    return "pc_creation cites this PC's Existence Contract";
  }
  const creation = refViolation(version.origin.pc_creation, facts, "the PC's Existence Contract");
  if (creation) return creation;
  // the ledger was qualified, at its own commit, against ONE target world: it can only be consumed by a binding that couples that world
  const coupledWorld = binding.coupling.world.entity_id;
  if (targetWorldIdOf(version.origin.target_world) !== coupledWorld) {
    return `the ledger was qualified against another world than the one this binding couples (${coupledWorld}): its closure-or-null was judged for that world, so a PC ledger cannot be carried into a different world`;
  }
  const closureKey = worldSetupClosureKey(coupledWorld);
  const closure = facts.get(closureKey);
  const cited = version.origin.setup_closure;
  if (closure) {
    if (cited === null || cited.fact_key !== closureKey) {
      return "the ledger was committed without the closure of the world being coupled: it must follow that world's world_setup_closure";
    }
    return refViolation(cited, facts, "the coupled world's setup closure");
  }
  return cited === null
    ? null
    : "the ledger cites a setup closure that is not the closure of the world being coupled";
}
