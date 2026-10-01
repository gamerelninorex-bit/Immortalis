import {
  BoundaryIndexSchema,
  OWNER_POPULATION,
  POPULATION_CLOSE_BASIS,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  compareTime,
  temporalTransactionAuthorityKey,
  temporalObjectKey,
  temporalTransactionKey,
  timeAtOrBefore,
  timeBefore,
  timeEquals,
  type BoundaryIndex,
  type CanonicalTime,
  type CommitGroup,
  type Failure,
  type ResolutionTransaction,
  type PendingConsequenceBarrier,
  type TemporalObject,
  type TemporalState,
} from "@immortalis/contracts";
import type { CampaignState, CommitErrorCode } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { pcb01EvidenceViolation } from "../population/barrier.ts";
import { productionObjectViolation } from "../production/admission.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite } from "../owners/rejection.ts";
import { entityTransitionObjectViolation } from "../world/entity-transition.ts";
import {
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
} from "./identity.ts";

type Rejection = Failure<CommitErrorCode>;

/**
 * IM-02 kernel admission: the cross-fact rules of F-014B §2 that IM-11 enforces at publication, so a
 * raw `store.commit` cannot bypass them. Pure: a function of (group, state) only.
 *
 *  1. Canonical time never moves by itself. The initial basis is an explicit establishment; every
 *     later change of `temporal/state` happens only in the same group as exactly one sealed
 *     ResolutionTransaction whose actual stop IS the new canonical time, whose opening basis is the
 *     state it read, and which never moves time backward. There is no tick, no turn and no other path.
 *  2. A transaction touches only the objects it engaged, and exactly those: the updated objects are
 *     the engaged ones, each had an earned boundary that the transaction crossed, and nothing else in
 *     the boundary index changes. An unrelated (dormant) object cannot be rewritten by a transaction.
 *  3. The boundary index agrees with the objects it indexes, in both directions, and holds no entry
 *     for a boundary that is not an object's one earned next boundary (no recurrence history).
 *  4. A transaction is committed only after the stage groups it cites (group dependencies), so its
 *     committed-group references are authoritative, never forward references.
 *  5. The stop/remainder continuation recorded in the state is exactly the transaction's outcome, and
 *     a continuing transaction consumes exactly the remainder the state holds.
 */
export function temporalGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const classify = (key: string) => resolveKey(key)?.kind.id;
  const writes = group.writes;
  const stateW = writes.find((w) => classify(w.key) === "temporal_state");
  const idxW = writes.find((w) => classify(w.key) === "temporal_boundary_index");
  const objWs = writes.filter((w) => classify(w.key) === "temporal_object");
  const txWs = writes.filter((w) => classify(w.key) === "resolution_transaction");

  const authW = writes.find((w) => classify(w.key) === "temporal_transaction_authority");
  if (authW) return checkAuthority(group, state, authW);

  if (txWs.length > 1) return reject("VALUE_INVALID", "one group records at most one transaction");
  const priorStateFact = state.facts.get(TEMPORAL_STATE_KEY);
  const prior = priorStateFact ? TemporalStateSchema.parse(priorStateFact.value) : undefined;
  const txW = txWs[0];

  if (stateW && stateW.expected_version === 0) {
    // Establishment of the initial basis.
    if (writes.length !== 1 || txW) {
      return reject("VALUE_INVALID", "the initial temporal basis is established alone");
    }
    const s = TemporalStateSchema.parse(stateW.value);
    if (s.last_transaction !== null || s.continuation !== null) {
      return reject("VALUE_INVALID", "the initial basis has no transaction and no continuation");
    }
    return null;
  }

  if (!stateW && txW) {
    return reject("REFERENCE_INVALID", "a transaction must advance the temporal state atomically");
  }
  if (stateW && !txW) {
    return reject(
      "REFERENCE_INVALID",
      "canonical time moves only through a ResolutionTransaction: there is no tick and no other path",
    );
  }

  const newState = stateW ? TemporalStateSchema.parse(stateW.value) : undefined;
  const clock: CanonicalTime | undefined = newState?.canonical_time ?? prior?.canonical_time;
  if (!clock) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }

  if (stateW && txW && prior && newState) {
    const r = checkTransaction(group, state, prior, newState, txW.key, txW.value, objWs, idxW);
    if (r) return r;
  } else {
    // Registration: new objects (and their index entries) against the current basis.
    const pinned = requirePrerequisite(group, state, TEMPORAL_STATE_KEY, "the temporal state");
    if (isRejection(pinned)) return pinned;
    if (!prior) return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established");
    if (writes.some((w) => classify(w.key) !== "temporal_object" && w !== idxW)) {
      return reject("VALUE_INVALID", "registration writes only temporal objects and the index");
    }
    for (const w of objWs) {
      if (w.expected_version !== 0) {
        return reject("AMENDMENT_NOT_SUPPORTED", "an object advances only inside a transaction", {
          key: w.key,
        });
      }
      const o = TemporalObjectSchema.parse(w.value);
      const edge = populationReadViolation(o);
      if (edge) return reject("REFERENCE_INVALID", edge, { key: w.key });
      const production = productionObjectViolation(o, state, true);
      if (production) return reject("REFERENCE_INVALID", production, { key: w.key });
      const transition = entityTransitionObjectViolation(o, state, true);
      if (transition) return reject("REFERENCE_INVALID", transition, { key: w.key });
      if (
        !timeAtOrBefore(o.last_resolved_basis, prior.canonical_time) ||
        (o.next_boundary !== null && !timeBefore(prior.canonical_time, o.next_boundary.at))
      ) {
        return reject(
          "REFERENCE_INVALID",
          "an object's resolved basis may not lie after the canonical time, nor its earned boundary at or before it",
          { key: w.key },
        );
      }
    }
  }
  return indexConsistency(state, clock, objWs, idxW);
}

/**
 * Opening a transaction (F-014B §6 step 1; RC-05): the kernel commits one sealed authority BEFORE any owner stage of
 * the transaction commits. It is lawful only at the temporal state it read (the opening basis), for a transaction
 * identity not yet committed, consuming exactly the continuation the state holds, and under the identity derived from
 * the transaction alone — so retry reaches the same receipt. It writes nothing but itself and moves nothing: canonical
 * time, the boundary index and every object are untouched.
 */
function checkAuthority(
  group: CommitGroup,
  state: CampaignState,
  w: CommitGroup["writes"][number],
): Rejection | null {
  const a = TransactionAuthoritySchema.parse(w.value);
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, { key: w.key, ...details });
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "a transaction is opened by its authority alone");
  }
  const id = a.transaction_id;
  if (
    group.group_id !== transactionAuthorityGroupId(id) ||
    group.intent_id !== transactionAuthorityIntentId(id) ||
    group.cause !== transactionCause(id)
  ) {
    return bad("a transaction is opened under the identity derived from the transaction alone");
  }
  const pinned = requirePrerequisite(group, state, TEMPORAL_STATE_KEY, "the temporal state");
  if (isRejection(pinned)) return pinned;
  const stateFact = state.facts.get(TEMPORAL_STATE_KEY)!;
  const prior = TemporalStateSchema.parse(stateFact.value);
  if (
    a.opening.state_version !== stateFact.version ||
    !timeEquals(a.opening.basis_time, prior.canonical_time)
  ) {
    return bad("a transaction opens at the temporal state it read");
  }
  if (state.facts.has(temporalTransactionKey(id))) {
    return bad("a committed transaction cannot be opened again");
  }
  const target = a.requested.target;
  if (target) {
    const c = compareTime(prior.canonical_time, target);
    if (c === null || c === 1) return bad("a target may not precede the canonical time");
  }
  const held = prior.continuation;
  if ((held?.from_transaction ?? null) !== a.continues) {
    return bad(
      held
        ? "a held continuation must be consumed by the next transaction, not abandoned"
        : "a continuing transaction must consume a continuation the state holds",
    );
  }
  if (held) {
    const priorFact = state.facts.get(temporalTransactionKey(held.from_transaction));
    const priorTx = priorFact ? ResolutionTransactionSchema.safeParse(priorFact.value) : undefined;
    if (!priorTx?.success)
      return bad("the held continuation's sealed transaction is not committed");
    const violation = continuationRequestViolation(priorTx.data, a.requested);
    if (violation) return bad(violation);
  }
  return null;
}

function checkTransaction(
  group: CommitGroup,
  state: CampaignState,
  prior: TemporalState,
  newState: TemporalState,
  txKey: string,
  txValue: unknown,
  objWs: CommitGroup["writes"],
  idxW: CommitGroup["writes"][number] | undefined,
): Rejection | null {
  const tx: ResolutionTransaction = ResolutionTransactionSchema.parse(txValue);
  const stateFact = state.facts.get(TEMPORAL_STATE_KEY)!;
  const pinned = requirePrerequisite(group, state, TEMPORAL_STATE_KEY, "the temporal state");
  if (isRejection(pinned)) return pinned;
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, { key: txKey, ...details });

  // 1. opening basis is the state read; time never moves backward; stop IS the new canonical time.
  if (
    tx.opening.state_version !== stateFact.version ||
    !timeEquals(tx.opening.basis_time, prior.canonical_time)
  ) {
    return bad("the transaction's opening basis is not the temporal state it read");
  }
  if (compareTime(prior.canonical_time, newState.canonical_time) === null) {
    return bad("canonical time changed unit");
  }
  if (
    !timeEquals(newState.canonical_time, tx.outcome.actual_stop) ||
    newState.last_transaction !== tx.transaction_id
  ) {
    return bad("the new canonical time must be exactly this transaction's actual stop");
  }
  // 5. continuation is the outcome; a continuing transaction consumes the remainder the state holds.
  const { remainder, unresolved_dependents } = tx.outcome;
  const expectedContinuation =
    remainder || unresolved_dependents.length > 0
      ? {
          from_transaction: tx.transaction_id,
          toward: remainder ? remainder.to : null,
          unresolved_dependents,
        }
      : null;
  if (!canonicalEqual(newState.continuation, expectedContinuation)) {
    return bad("the recorded continuation is not this transaction's stop/remainder");
  }
  // A held continuation is consumed or it stays: this slice authorizes continuation and no
  // cancellation/supersession, so unrelated progress cannot silently abandon it, and a continuing
  // transaction must consume exactly the continuation the state holds.
  const held = prior.continuation;
  if ((held?.from_transaction ?? null) !== tx.continues) {
    return bad(
      held
        ? "a held continuation must be consumed by the next transaction, not abandoned"
        : "a continuing transaction must consume a continuation the state holds",
      { held: held?.from_transaction ?? null, continues: tx.continues },
    );
  }
  if (held) {
    // what is continued is the sealed prior transaction's unfinished request, verified against it
    const priorFact = state.facts.get(temporalTransactionKey(held.from_transaction));
    const priorTx = priorFact ? ResolutionTransactionSchema.safeParse(priorFact.value) : undefined;
    if (!priorTx?.success) {
      return bad("the held continuation's sealed transaction is not committed", {
        held: held.from_transaction,
      });
    }
    const violation = continuationRequestViolation(priorTx.data, tx.requested);
    if (violation) return bad(violation, { held: held.from_transaction });
  }
  // 4. the stage groups it cites are committed before it.
  for (const s of tx.stages) {
    if (!group.depends_on.includes(s.group_id)) {
      return bad("a cited stage group is not a group dependency", { group_id: s.group_id });
    }
  }
  // The transaction was genuinely opened before its owner stages: its durable authority exists, is pinned and
  // depended upon, and the sealed record repeats exactly what was opened (F-014B §6 step 1; RC-05).
  if (tx.stages.length > 0) {
    const authKey = temporalTransactionAuthorityKey(tx.transaction_id);
    const auth = requirePrerequisite(group, state, authKey, "the transaction authority");
    if (isRejection(auth)) return auth;
    const a = TransactionAuthoritySchema.safeParse(auth.fact.value);
    const txWrite = group.writes.find((x) => x.key === txKey);
    if (
      !a.success ||
      a.data.transaction_id !== tx.transaction_id ||
      a.data.cause !== tx.cause ||
      a.data.continues !== tx.continues ||
      !canonicalEqual(a.data.trigger, tx.trigger) ||
      !canonicalEqual(a.data.opening, tx.opening) ||
      !canonicalEqual(a.data.requested, tx.requested) ||
      !canonicalEqual(a.data.context, tx.context) ||
      a.data.publication.basis !== txWrite?.basis ||
      a.data.publication.secrecy !== txWrite?.secrecy
    ) {
      return bad("a transaction repeats exactly what its durable authority opened", {
        authority: authKey,
      });
    }
  }
  // 2. Engaged objects are all recorded (RC-05); exactly the RETIRED ones are touched, each across
  // the boundary it had earned. A STILL_ACTIVE object is untouched and keeps its boundary. A PCB-01
  // due reconciliation object (no earned boundary) is touched only when it was reconciled.
  const retiredEngaged = tx.engaged.filter((e) => e.boundary === "RETIRED");
  const dueReconciled = tx.engaged.filter((e) => e.boundary === "DUE_RECONCILED");
  const activeEngaged = tx.engaged.filter(
    (e) => e.boundary === "STILL_ACTIVE" || e.boundary === "DUE_UNRESOLVED",
  );
  if (objWs.length !== retiredEngaged.length + dueReconciled.length) {
    return bad(
      "the objects written must be exactly the engaged objects whose boundary was retired or whose due reconciliation completed",
    );
  }
  const priorIndex = readIndex(state);
  for (const e of tx.engaged) {
    if (e.boundary === "DUE_RECONCILED" || e.boundary === "DUE_UNRESOLVED") {
      const due = checkDueEngaged(e, tx, state, objWs, priorIndex, bad);
      if (due) return due;
      continue;
    }
    const before = state.facts.get(e.fact_key);
    if (!before || e.fact_key !== temporalObjectKey(e.object_id)) {
      return bad("an engaged reference does not name a committed temporal object", {
        object_id: e.object_id,
      });
    }
    const was: TemporalObject = TemporalObjectSchema.parse(before.value);
    if (e.version_before !== before.version) {
      return bad("an engaged object's version_before is not the committed object", {
        object_id: e.object_id,
      });
    }
    // every engaged object had a due earned boundary, in the index
    const entry = priorIndex.entries.find((en) => en.object_id === e.object_id);
    if (
      !entry ||
      !was.next_boundary ||
      entry.boundary_id !== was.next_boundary.boundary_id ||
      !timeEquals(entry.at, was.next_boundary.at)
    ) {
      return bad("an engaged object must have held an earned, indexed boundary", {
        object_id: e.object_id,
      });
    }
    if (e.boundary === "STILL_ACTIVE") {
      // unresolved work is not retired or mutated merely to record that it was engaged
      if (objWs.some((x) => x.key === e.fact_key)) {
        return bad("an unresolved engaged object may not be written", { object_id: e.object_id });
      }
      if (!timeEquals(was.next_boundary.at, tx.outcome.actual_stop)) {
        return bad("an unresolved boundary stays active at the stop basis", {
          object_id: e.object_id,
        });
      }
      const declared = new Set(was.dependencies.map((d) => JSON.stringify(d.stage)));
      if (!tx.outcome.unresolved_dependents.some((u) => declared.has(JSON.stringify(u.stage)))) {
        return bad("an unresolved engaged object must have an unresolved dependent stage", {
          object_id: e.object_id,
        });
      }
      continue;
    }
    const w = objWs.find((x) => x.key === e.fact_key);
    if (!w || w.expected_version !== before.version || e.version_after !== before.version + 1) {
      return bad("a retired engaged object must be the written object, one version on", {
        object_id: e.object_id,
      });
    }
    const now: TemporalObject = TemporalObjectSchema.parse(w.value);
    const crossed = tx.boundaries_crossed.find((b) => b.object_id === e.object_id);
    if (
      !crossed ||
      was.next_boundary.boundary_id !== crossed.boundary_id ||
      !timeEquals(was.next_boundary.at, crossed.at) ||
      !timeAtOrBefore(crossed.at, tx.outcome.actual_stop)
    ) {
      return bad(
        "an engaged object must cross the earned boundary it had, no later than the stop",
        {
          object_id: e.object_id,
        },
      );
    }
    if (now.next_boundary !== null || !timeEquals(now.last_resolved_basis, crossed.at)) {
      return bad("a resolved boundary is retired and the object resolves to that boundary", {
        object_id: e.object_id,
      });
    }
    // A resolution moves only the resolved basis and retires the boundary: declarations are history.
    if (
      !canonicalEqual(
        { ...was, next_boundary: null, last_resolved_basis: null },
        { ...now, next_boundary: null, last_resolved_basis: null },
      )
    ) {
      return bad("a transaction may not change an object's declarations", {
        object_id: e.object_id,
      });
    }
  }
  // every unresolved dependent is a declared stage of an engaged, still-active object
  for (const u of tx.outcome.unresolved_dependents) {
    const owner = activeEngaged.find((e) =>
      TemporalObjectSchema.parse(state.facts.get(e.fact_key)!.value).dependencies.some(
        (d) => JSON.stringify(d.stage) === JSON.stringify(u.stage),
      ),
    );
    if (!owner)
      return bad("an unresolved dependent is not a stage of an unresolved engaged object");
  }
  // the index loses exactly the RETIRED objects' entries and nothing else
  const retiredIds = new Set(retiredEngaged.map((e) => e.object_id));
  let postEntries = priorIndex.entries;
  if (retiredIds.size === 0) {
    if (idxW)
      return bad("a transaction that retires no boundary does not touch the boundary index");
  } else {
    if (!idxW) return bad("resolved boundaries must leave the active boundary index");
    const next = BoundaryIndexSchema.parse(idxW.value);
    const expected = priorIndex.entries.filter((en) => !retiredIds.has(en.object_id));
    if (!canonicalEqual(next.entries, expected)) {
      return bad("the index may lose only the resolved boundaries of retired objects");
    }
    postEntries = next.entries;
  }
  // Canonical time cannot bypass an active earned boundary (F-014B §6, §13): no active entry may
  // lie strictly before the stop; at the stop instant only a DEPENDENCY_UNRESOLVED stop may leave
  // entries, and only those of the engaged objects that are still active.
  const stillActiveIds = new Set(activeEngaged.map((e) => e.object_id));
  for (const en of postEntries) {
    const c = compareTime(en.at, tx.outcome.actual_stop);
    if (c === null) return bad("an active boundary is in another unit than the stop");
    if (c === -1) {
      return bad("canonical time may not pass an active earned boundary", {
        object_id: en.object_id,
        boundary_id: en.boundary_id,
      });
    }
    if (c === 0 && !stillActiveIds.has(en.object_id)) {
      return bad(
        "a due earned boundary at the stop must be resolved, unless its engaged work is unresolved",
        { object_id: en.object_id, boundary_id: en.boundary_id },
      );
    }
  }
  return null;
}

const readIndex = (state: CampaignState): BoundaryIndex => {
  const f = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  return f ? BoundaryIndexSchema.parse(f.value) : { entries: [] };
};

/** 3. post-group index agrees with the post-group objects, both directions, in the state's unit. */
function indexConsistency(
  state: CampaignState,
  clock: CanonicalTime,
  objWs: CommitGroup["writes"],
  idxW: CommitGroup["writes"][number] | undefined,
): Rejection | null {
  if (objWs.length === 0 && !idxW) return null;
  const priorIndex = readIndex(state);
  const postIndex: BoundaryIndex = idxW ? BoundaryIndexSchema.parse(idxW.value) : priorIndex;
  const written = new Map(objWs.map((w) => [w.key, TemporalObjectSchema.parse(w.value)]));
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, details);

  for (const e of postIndex.entries) {
    if (compareTime(e.at, clock) === null) return bad("an index entry is in another unit");
    const key = temporalObjectKey(e.object_id);
    const obj =
      written.get(key) ??
      (state.facts.has(key) ? TemporalObjectSchema.parse(state.facts.get(key)!.value) : undefined);
    if (!obj)
      return bad("an index entry names an object that is not committed", {
        object_id: e.object_id,
      });
    if (
      !obj.next_boundary ||
      obj.next_boundary.boundary_id !== e.boundary_id ||
      !timeEquals(obj.next_boundary.at, e.at)
    ) {
      return bad("an index entry is not the object's earned next boundary", {
        object_id: e.object_id,
      });
    }
  }
  for (const [key, obj] of written) {
    const entry = postIndex.entries.find((e) => temporalObjectKey(e.object_id) === key);
    if (obj.next_boundary && !entry)
      return bad("an object's earned boundary is missing from the index", { key });
    if (!obj.next_boundary && entry)
      return bad("the index holds a boundary the object no longer has", { key });
  }
  // entries of objects this group does not write are unchanged
  for (const e of priorIndex.entries) {
    if (written.has(temporalObjectKey(e.object_id))) continue;
    if (!postIndex.entries.some((p) => canonicalEqual(p, e))) {
      return bad("the group altered an index entry of an object it does not write", {
        object_id: e.object_id,
      });
    }
  }
  for (const e of postIndex.entries) {
    if (written.has(temporalObjectKey(e.object_id))) continue;
    if (!priorIndex.entries.some((p) => canonicalEqual(p, e))) {
      return bad("the group added an index entry for an object it does not write", {
        object_id: e.object_id,
      });
    }
  }
  return null;
}

/**
 * A held continuation is unfinished requested work, not merely a link to the previous transaction id.
 * Given the SEALED prior transaction a continuing request names, returns why the request does not
 * lawfully consume it, or null. One rule, used identically by the coordinator, raw kernel admission
 * and load-time verification so that they cannot drift:
 *
 *  - the prior stopped with unresolved dependents: its unresolved requested predicate — target AND
 *    condition — is carried forward unchanged (canonical equality). A continuation cannot drop,
 *    change or replace the unfinished request while acknowledging the prior transaction id.
 *  - the prior left only a target remainder (its condition already resolved): the continuation
 *    consumes exactly that remainder target, as before; nothing further is required.
 *
 * No cancellation or supersession exists: this only verifies what is being continued.
 */
export function continuationRequestViolation(
  prior: ResolutionTransaction,
  requested: ResolutionTransaction["requested"],
): string | null {
  if (prior.outcome.unresolved_dependents.length > 0) {
    return canonicalEqual(requested, prior.requested)
      ? null
      : "a continuation of unresolved work must preserve the original requested target and condition";
  }
  const remainder = prior.outcome.remainder;
  if (!remainder || requested.target === null || !timeEquals(remainder.to, requested.target)) {
    return "a continuing transaction must consume exactly the remainder the state holds";
  }
  return null;
}

/**
 * PCB-01 (F-017; WS-001 §32): a Population reconciliation object that has no earned boundary is engaged
 * only because a consumer's declared barrier made its reconciliation due. Structural rules, from
 * committed state alone:
 *
 *  - it exists, holds no earned boundary and has no active-index entry (it was never due on its own);
 *  - the engaged consumer named by `due_for` declares a barrier naming exactly this object, and this
 *    object declares the stage that is the barrier's named Close;
 *  - when reconciled, the object is written one version on, ONLY its resolved basis moving — to the
 *    consumer's boundary instant, which is the single resolution point — with declarations untouched,
 *    and every stage it declares is a stage the transaction committed;
 *  - when unresolved, it is untouched and one of its stages is an unresolved dependent.
 *
 * Whether the barrier's frozen conditions held is Population's evidence (the committed close consumes
 * each eligible envelope exactly once, re-derived by Population admission); IM-02 does not parse
 * Population facts.
 */
function checkDueEngaged(
  e: Extract<
    ResolutionTransaction["engaged"][number],
    { boundary: "DUE_RECONCILED" | "DUE_UNRESOLVED" }
  >,
  tx: ResolutionTransaction,
  state: CampaignState,
  objWs: CommitGroup["writes"],
  priorIndex: BoundaryIndex,
  bad: (message: string, details?: Record<string, unknown>) => Rejection,
): Rejection | null {
  const ctx = { object_id: e.object_id };
  const before = state.facts.get(e.fact_key);
  if (!before || e.fact_key !== temporalObjectKey(e.object_id)) {
    return bad("an engaged reference does not name a committed temporal object", ctx);
  }
  const was: TemporalObject = TemporalObjectSchema.parse(before.value);
  if (e.version_before !== before.version) {
    return bad("an engaged object's version_before is not the committed object", ctx);
  }
  if (was.next_boundary !== null || priorIndex.entries.some((en) => en.object_id === e.object_id)) {
    return bad("a PCB-01 due-reconciliation object holds no earned boundary of its own", ctx);
  }
  const sameStage = (a: unknown, b: unknown) => canonicalEqual(a, b);
  let consumerAt: CanonicalTime | undefined;
  let barrier: PendingConsequenceBarrier | undefined;
  for (const c of tx.engaged) {
    if (c.boundary !== "RETIRED" && c.boundary !== "STILL_ACTIVE") continue;
    const cf = state.facts.get(c.fact_key);
    if (!cf) continue;
    const co: TemporalObject = TemporalObjectSchema.parse(cf.value);
    const decl = co.dependencies.find(
      (d) =>
        sameStage(d.stage, e.due_for) &&
        d.pending_consequence_barrier?.reconciliation_object_id === e.object_id,
    );
    if (decl && co.next_boundary) {
      consumerAt = co.next_boundary.at;
      barrier = decl.pending_consequence_barrier!;
    }
  }
  if (!consumerAt || !barrier) {
    return bad(
      "a due reconciliation names an engaged consumer stage whose barrier declares it",
      ctx,
    );
  }
  const barrierClose = barrier.close_basis;
  const closeStage = was.dependencies.find(
    (d) =>
      d.declares_close?.name === barrierClose.name &&
      d.stage.owner_operation.owner === barrierClose.producer.owner &&
      d.stage.owner_operation.operation === barrierClose.producer.operation,
  );
  if (!closeStage) {
    return bad("the due reconciliation object declares the barrier's named Close", ctx);
  }
  if (e.boundary === "DUE_UNRESOLVED") {
    if (objWs.some((x) => x.key === e.fact_key)) {
      return bad("an unresolved due reconciliation may not be written", ctx);
    }
    const declared = new Set(was.dependencies.map((d) => JSON.stringify(d.stage)));
    if (!tx.outcome.unresolved_dependents.some((u) => declared.has(JSON.stringify(u.stage)))) {
      return bad("an unresolved due reconciliation must have an unresolved dependent stage", ctx);
    }
    return null;
  }
  const w = objWs.find((x) => x.key === e.fact_key);
  if (!w || w.expected_version !== before.version || e.version_after !== before.version + 1) {
    return bad("a reconciled due object must be the written object, one version on", ctx);
  }
  const now: TemporalObject = TemporalObjectSchema.parse(w.value);
  if (
    now.next_boundary !== null ||
    !timeEquals(now.last_resolved_basis, consumerAt) ||
    !timeBefore(was.last_resolved_basis, consumerAt)
  ) {
    return bad(
      "a due reconciliation resolves, once, at the consumer's boundary instant (its single resolution point)",
      ctx,
    );
  }
  if (
    !canonicalEqual({ ...was, last_resolved_basis: null }, { ...now, last_resolved_basis: null })
  ) {
    return bad("a transaction may not change an object's declarations", ctx);
  }
  if (!was.dependencies.every((d) => tx.stages.some((s) => sameStage(s.stage, d.stage)))) {
    return bad("every stage the reconciled due object declares was committed", ctx);
  }
  // The due claim must be TRUE: re-derived from the committed Population stage group's own facts (the
  // single canon), at the consumer's single resolution point. A false, empty or tampered claim fails.
  const stage = tx.stages.find((s) => sameStage(s.stage, closeStage.stage))!;
  const valueOf = (key: string) => {
    const f = state.facts.get(key);
    return f && f.provenance.group_id === stage.group_id ? f.value : undefined;
  };
  const untrue = pcb01EvidenceViolation({
    recorded: e.evidence,
    barrier,
    instant: consumerAt,
    valueOf,
  });
  if (untrue) return bad(untrue, ctx);
  return null;
}

/**
 * The frozen Temporal-Read cut for Population (WS-015 §VIII; WS-001 §32; F-017): Population → dependent
 * consumer is AS-OF-DECLARED-CLOSE, with Close Basis = the Population ordinary demographic/labor
 * reconciliation close. A declared read of a Population-owned fact is therefore never AS-OF-NOW and never
 * names another basis (a requested horizon, a slice, a retry or a source version stands in for none).
 * Used by registration admission and by load-time verification, so the two cannot drift. Returns a
 * message, or null.
 */
export function populationReadViolation(object: TemporalObject): string | null {
  for (const d of object.dependencies) {
    for (const r of d.reads) {
      if (resolveKey(r.source.fact_key)?.kind.owner !== OWNER_POPULATION) continue;
      if (r.mode !== "AS-OF-DECLARED-CLOSE") {
        return "Population → consumer is AS-OF-DECLARED-CLOSE: a Population fact is never read AS-OF-NOW";
      }
      if (!canonicalEqual(r.close_basis, POPULATION_CLOSE_BASIS)) {
        return "a Population fact is read at the Population ordinary reconciliation close, not at another named basis";
      }
    }
  }
  return null;
}
