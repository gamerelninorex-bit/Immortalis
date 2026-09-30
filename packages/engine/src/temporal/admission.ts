import {
  BoundaryIndexSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  compareTime,
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
  type TemporalObject,
  type TemporalState,
} from "@immortalis/contracts";
import type { CampaignState, CommitErrorCode } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite } from "../owners/rejection.ts";

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
  // 2. Engaged objects are all recorded (RC-05); exactly the RETIRED ones are touched, each across
  // the boundary it had earned. A STILL_ACTIVE object is untouched and keeps its boundary.
  const retiredEngaged = tx.engaged.filter((e) => e.boundary === "RETIRED");
  const activeEngaged = tx.engaged.filter((e) => e.boundary === "STILL_ACTIVE");
  if (objWs.length !== retiredEngaged.length) {
    return bad(
      "the objects written must be exactly the engaged objects whose boundary was retired",
    );
  }
  const priorIndex = readIndex(state);
  for (const e of tx.engaged) {
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
