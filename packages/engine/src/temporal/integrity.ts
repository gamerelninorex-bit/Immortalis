import {
  BoundaryIndexSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  temporalObjectKey,
  temporalTransactionKey,
  compareTime,
  timeAtOrBefore,
  timeEquals,
  type OwnerFact,
  type PendingConsequenceBarrier,
  type ResolutionTransaction,
  type ValueSchema,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { pcb01EvidenceViolation } from "../population/barrier.ts";
import { continuationRequestViolation, populationReadViolation } from "./admission.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import {
  stageGroupId,
  stageIntentId,
  transactionGroupId,
  transactionIntentId,
} from "./identity.ts";

/**
 * Re-verifies, from committed state and the journal alone, that the kernel-owned temporal state of a
 * loaded campaign is internally consistent and still tells one story. Replay proves the HISTORY is
 * intact and canonical integrity proves each fact's meaning; this proves that the temporal facts still
 * cohere: no drift of canonical time, transaction, dependency/stage or provenance across save/load.
 *
 *  - canonical time, version and continuation are exactly what the last transaction left, and every
 *    advance of the state is explained by a transaction (no hidden tick);
 *  - transactions chain: each opens where the previous one stopped, and a continuing transaction
 *    consumes a remainder that existed;
 *  - every transaction's committed-group evidence is the receipt/journal's own: the stage and kernel
 *    group identities are the ones derived from the StageKey and transaction identity, the receipts
 *    agree, stage commits precede the transaction, and the realized reads match the journaled group;
 *  - the boundary index and the objects agree in both directions, in the state's unit.
 *
 * Cost: lists the committed facts once per open (a diagnostic path, CAL-06), like
 * verifyCanonicalIntegrity. The advance path never does.
 */
/**
 * A fact whose value violates its typed contract is reported by verifyCanonicalIntegrity
 * (VALUE_INVALID); here it is skipped rather than thrown on, so a corrupted value fails the open
 * with a violation instead of crashing it.
 */
const parsed = <T>(schema: ValueSchema<T>, fact: OwnerFact): T | undefined => {
  const r = schema.safeParse(fact.value);
  return r.success ? r.data : undefined;
};

export function verifyTemporalIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, code: IntegrityViolation["code"], message: string) =>
    out.push({ key, code, message });
  const facts = store.listFacts().filter((f) => {
    const id = resolveKey(f.key)?.kind.id;
    return (
      id === "temporal_state" ||
      id === "temporal_boundary_index" ||
      id === "temporal_object" ||
      id === "resolution_transaction"
    );
  });
  if (facts.length === 0) return out;

  const stateFact = facts.find((f) => f.key === TEMPORAL_STATE_KEY);
  if (!stateFact) {
    bad(
      TEMPORAL_STATE_KEY,
      "TEMPORAL_STATE",
      "temporal facts exist without a canonical temporal basis",
    );
    return out;
  }
  const state = parsed(TemporalStateSchema, stateFact);
  if (!state) return out;
  const revisionOf = (f: OwnerFact): number =>
    store.lookupReceipt(f.provenance.intent_id)?.revision ?? -1;

  // transactions, in committed order
  const txFacts = facts
    .filter((f) => resolveKey(f.key)?.kind.id === "resolution_transaction")
    .sort((a, b) => revisionOf(a) - revisionOf(b));
  const txs: { fact: OwnerFact; tx: ResolutionTransaction }[] = txFacts.flatMap((fact) => {
    const tx = parsed(ResolutionTransactionSchema, fact);
    return tx ? [{ fact, tx }] : [];
  });

  if (stateFact.version !== 1 + txs.length) {
    bad(
      TEMPORAL_STATE_KEY,
      "TEMPORAL_STATE",
      "the temporal state moved without a recorded transaction",
    );
  }
  const last = txs[txs.length - 1]?.tx;
  if ((state.last_transaction ?? null) !== (last?.transaction_id ?? null)) {
    bad(
      TEMPORAL_STATE_KEY,
      "TEMPORAL_STATE",
      "the state's last transaction is not the last committed transaction",
    );
  } else if (last) {
    if (!timeEquals(state.canonical_time, last.outcome.actual_stop)) {
      bad(
        TEMPORAL_STATE_KEY,
        "TEMPORAL_STATE",
        "canonical time is not the last transaction's actual stop",
      );
    }
    const { remainder, unresolved_dependents } = last.outcome;
    const expected =
      remainder || unresolved_dependents.length > 0
        ? {
            from_transaction: last.transaction_id,
            toward: remainder ? remainder.to : null,
            unresolved_dependents,
          }
        : null;
    if (!canonicalEqual(state.continuation, expected)) {
      bad(
        TEMPORAL_STATE_KEY,
        "TEMPORAL_STATE",
        "the continuation is not the last transaction's stop/remainder",
      );
    }
  }

  txs.forEach(({ fact, tx }, i) => {
    const key = temporalTransactionKey(tx.transaction_id);
    const prev = txs[i - 1]?.tx;
    if (prev && !timeEquals(tx.opening.basis_time, prev.outcome.actual_stop)) {
      bad(
        key,
        "TEMPORAL_TRANSACTION",
        "the transaction does not open where the previous one stopped",
      );
    }
    if (tx.opening.state_version !== 1 + i) {
      bad(
        key,
        "TEMPORAL_TRANSACTION",
        "the transaction's opening state version is not its place in the chain",
      );
    }
    // A held continuation is consumed by the very next transaction and only by it: this slice has
    // no cancellation/supersession, so a chain that abandons or invents one is not a lawful history.
    const held = prev && (prev.outcome.remainder || prev.outcome.unresolved_dependents.length > 0);
    const expectedFrom = held && prev ? prev.transaction_id : null;
    if (tx.continues !== expectedFrom) {
      bad(
        key,
        "TEMPORAL_TRANSACTION",
        expectedFrom
          ? "a held continuation was abandoned rather than consumed"
          : "a continuing transaction consumes a continuation that was not held",
      );
    } else if (prev && held) {
      // the same rule admission applies, re-verified against the sealed prior record
      const violation = continuationRequestViolation(prev, tx.requested);
      if (violation) bad(key, "TEMPORAL_TRANSACTION", violation);
    }
    if (
      fact.provenance.intent_id !== transactionIntentId(tx.transaction_id) ||
      fact.provenance.group_id !== transactionGroupId(tx.transaction_id)
    ) {
      bad(
        key,
        "TEMPORAL_TRANSACTION",
        "the transaction was not committed under its derived identity",
      );
    }
    const txRevision = revisionOf(fact);
    for (const s of tx.stages) {
      const receipt = store.lookupReceipt(s.intent_id);
      const group = store.committedGroup(s.intent_id);
      const stageBad = (message: string) =>
        bad(key, "TEMPORAL_EVIDENCE", `${message}: ${s.group_id}`);
      if (s.group_id !== stageGroupId(s.stage) || s.intent_id !== stageIntentId(s.stage)) {
        stageBad("a stage was not committed under the identity derived from its StageKey");
      }
      if (!receipt || !group) {
        stageBad("a cited stage group has no receipt in the journal");
        continue;
      }
      if (
        receipt.group_id !== s.group_id ||
        receipt.revision !== s.revision ||
        receipt.group_sha256 !== s.group_sha256
      ) {
        stageBad("the recorded receipt reference differs from the journal's receipt");
      }
      if (receipt.revision >= txRevision)
        stageBad("a stage was committed after the transaction that cites it");
      if (
        group.reads.length !== s.reads.length ||
        group.depends_on.length !== s.reads.length ||
        s.reads.some(
          (r, j) =>
            r.source.fact_key !== group.reads[j]!.key ||
            r.source_basis.version !== group.reads[j]!.version ||
            r.source_basis.committed_by !== group.depends_on[j],
        )
      ) {
        stageBad("the realized reads differ from the journaled group");
      }
      if (
        s.writes.length !== group.writes.length ||
        s.writes.some(
          (w, j) =>
            w.key !== group.writes[j]!.key || w.version !== group.writes[j]!.expected_version + 1,
        )
      ) {
        stageBad("the recorded deltas differ from the journaled group");
      }
    }
    for (const e of tx.engaged) {
      const o = facts.find((f) => f.key === e.fact_key);
      if (
        !o ||
        ((e.boundary === "RETIRED" || e.boundary === "DUE_RECONCILED") &&
          o.version < e.version_after)
      )
        bad(
          key,
          "TEMPORAL_EVIDENCE",
          `engaged object ${e.object_id} is missing or older than the transaction`,
        );
      if (e.boundary !== "DUE_RECONCILED" || !o) continue;
      // PCB-01: re-derive the due claim from the COMMITTED stage group in the journal (IM-12). The claim
      // must be what the group's own facts support, at the consumer's resolution point — never checked
      // against anything that changed afterwards.
      const dueObject = parsed(TemporalObjectSchema, o);
      let barrier: PendingConsequenceBarrier | undefined;
      for (const c of tx.engaged) {
        if (c.boundary !== "RETIRED" && c.boundary !== "STILL_ACTIVE") continue;
        const cf = facts.find((f) => f.key === c.fact_key);
        const co = cf && parsed(TemporalObjectSchema, cf);
        const decl = co?.dependencies.find(
          (d) =>
            canonicalEqual(d.stage, e.due_for) &&
            d.pending_consequence_barrier?.reconciliation_object_id === e.object_id,
        );
        if (decl) barrier = decl.pending_consequence_barrier;
      }
      const closeDecl =
        barrier &&
        dueObject?.dependencies.find(
          (d) =>
            d.declares_close?.name === barrier!.close_basis.name &&
            d.stage.owner_operation.owner === barrier!.close_basis.producer.owner &&
            d.stage.owner_operation.operation === barrier!.close_basis.producer.operation,
        );
      const rec = closeDecl && tx.stages.find((s) => canonicalEqual(s.stage, closeDecl.stage));
      const group = rec ? store.committedGroup(rec.intent_id) : null;
      if (!barrier || !dueObject || !rec || !group) {
        bad(
          key,
          "TEMPORAL_EVIDENCE",
          `the PCB-01 due reconciliation of ${e.object_id} cannot be traced to a declared barrier and a committed stage`,
        );
        continue;
      }
      const writes = new Map(group.writes.map((w) => [w.key, w.value]));
      const untrue = pcb01EvidenceViolation({
        recorded: e.evidence,
        barrier,
        instant: dueObject.last_resolved_basis,
        valueOf: (k) => writes.get(k),
      });
      if (untrue) bad(key, "TEMPORAL_EVIDENCE", `${untrue}: ${e.object_id}`);
    }
  });

  // objects and the active boundary index agree, both directions, in the state's unit
  const objects = facts
    .filter((f) => resolveKey(f.key)?.kind.id === "temporal_object")
    .flatMap((fact) => {
      const value = parsed(TemporalObjectSchema, fact);
      return value ? [{ fact, value }] : [];
    });
  const indexFact = facts.find((f) => f.key === TEMPORAL_BOUNDARY_INDEX_KEY);
  const entries = (indexFact && parsed(BoundaryIndexSchema, indexFact)?.entries) || [];
  for (const { fact, value } of objects) {
    if (fact.key !== temporalObjectKey(value.object_id))
      bad(fact.key, "TEMPORAL_INDEX", "object identity differs from its key");
    const edge = populationReadViolation(value);
    if (edge) bad(fact.key, "TEMPORAL_EVIDENCE", edge);
    if (!timeAtOrBefore(value.last_resolved_basis, state.canonical_time)) {
      bad(fact.key, "TEMPORAL_STATE", "an object's resolved basis lies after the canonical time");
    }
    const entry = entries.find((e) => e.object_id === value.object_id);
    const b = value.next_boundary;
    if (b && (!entry || entry.boundary_id !== b.boundary_id || !timeEquals(entry.at, b.at))) {
      bad(fact.key, "TEMPORAL_INDEX", "an earned boundary is missing from the active index");
    }
    if (!b && entry)
      bad(fact.key, "TEMPORAL_INDEX", "the index holds a boundary the object no longer has");
  }
  // Canonical time never passes an active earned boundary: an entry lies after the canonical time, or
  // at it only when the last transaction stopped DEPENDENCY_UNRESOLVED and the object is one of its
  // still-active engaged objects. (Registration requires a boundary after the canonical time.)
  const stillActive = new Set(
    last?.outcome.stop_reason === "DEPENDENCY_UNRESOLVED"
      ? last.engaged.filter((e) => e.boundary === "STILL_ACTIVE").map((e) => e.object_id)
      : [],
  );
  for (const e of entries) {
    const c = compareTime(e.at, state.canonical_time);
    if (c === null || c === -1 || (c === 0 && !stillActive.has(e.object_id))) {
      bad(
        TEMPORAL_BOUNDARY_INDEX_KEY,
        "TEMPORAL_INDEX",
        `canonical time has passed the active earned boundary of ${e.object_id}`,
      );
    }
  }
  for (const e of entries) {
    if (!objects.some((o) => o.value.object_id === e.object_id)) {
      bad(
        TEMPORAL_BOUNDARY_INDEX_KEY,
        "TEMPORAL_INDEX",
        `the index names unknown object ${e.object_id}`,
      );
    }
  }
  return out;
}
