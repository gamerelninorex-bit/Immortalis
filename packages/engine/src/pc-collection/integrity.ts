import {
  PcCollectionCycleAttestationSchema,
  PopulationBasisSchema,
  PopulationPcRepresentationSchema,
  popPcRepresentationKey,
  PcCollectionCessationSchema,
  ProductionPcCollectionTerminationSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  WorldSourceConditionSchema,
  popPcOccupancyKey,
  productionSourceDeltaKey,
  productionExtractionObjectId,
  productionPcCollectionTerminationKey,
  temporalObjectKey,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachDecisionSchema,
  PopulationPcOccupancySchema,
  ProductionExtractionSchema,
  ProductionPcCollectionWorkSchema,
  ProductionRequestSchema,
  TEMPORAL_STATE_KEY,
  pcCollectionRequestId,
  productionExtractionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { PRODUCTION_PC_COLLECTION_WORK_RULE, resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { factsBefore, type IntegrityViolation } from "../world/integrity.ts";
import { parseAccount } from "../source-drawdown/derive.ts";
import { pcCollectionCessationViolation, pcCollectionTerminationViolation } from "./cessation.ts";
import { pcCycleAttestationViolation, pcRepresentationViolation } from "./determinations.ts";
import { extractionCredited } from "./state.ts";
import {
  deriveOccupancyInterval,
  pcCollectionCommitmentViolation,
  pcCollectionMechanismViolation,
  pcCollectionReachViolation,
  pcCollectionRequestViolation,
  pcCollectionWorkViolation,
} from "./derive.ts";

/**
 * CPAA-C1 v0.2 PROVISIONAL — re-verifies, from committed state and the journal alone, that every loaded collection fact still tells
 * one story. Replay proves the HISTORY is intact and canonical integrity proves each fact's owner/facet, typed value, governing rule
 * and authority; this proves the facts still mean what admission required, by applying the SAME single rule admission applied to the
 * facts as they stood before each write (the source, the Reserve and the occupancy slot ADVANCE with their owners' own deliveries,
 * credits and releases, so those are read as current and their pins may not exceed the current version):
 *
 *  - every commitment-of-record, PC-owned request, mechanism, reach judgment and Production work record holds;
 *  - every work record has its extraction, its OPEN-then-closed occupancy history is coherent, and no extraction in the PC-owned
 *    request key space exists without Production's derived work record (a caller-crafted boundary has no lawful value);
 *  - a denied occupancy has no extraction.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), and returns immediately when no collection fact exists.
 */
export function verifyPcCollectionIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "PC_COLLECTION_STATE", message });
  const all = store.listFacts();
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ofKind = (id: string) => all.filter((f) => kindOf(f) === id);
  const commitments = ofKind("pc_collection_commitment");
  const requests = ofKind("pc_collection_request");
  const mechanisms = ofKind("pc_collection_mechanism");
  const reaches = ofKind("pc_collection_reach_decision");
  const occupancies = ofKind("population_pc_occupancy");
  const works = ofKind("production_pc_collection_work");
  const cessations = ofKind("pc_collection_cessation");
  const terminations = ofKind("production_pc_collection_termination");
  const attestations = ofKind("pc_collection_cycle_attestation");
  const representations = ofKind("population_pc_representation");
  if (
    commitments.length +
      requests.length +
      mechanisms.length +
      reaches.length +
      occupancies.length +
      works.length +
      cessations.length +
      terminations.length +
      attestations.length +
      representations.length ===
    0
  ) {
    return out;
  }
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  // sealed facts as they stood before the write; ADVANCING ones (source, Reserve, temporal state, occupancy) as they are now
  const ADVANCING = (k: string) =>
    k === TEMPORAL_STATE_KEY ||
    k === TEMPORAL_BOUNDARY_INDEX_KEY ||
    k.startsWith("temporal/object/") ||
    k.startsWith("production/source-account/") ||
    /^world\/[^/]+\/source\//.test(k) ||
    k.startsWith("production/reserve/") ||
    k.startsWith("population-pc/");
  const view = (revision: number) => {
    const before = factsBefore(revision, byKey, revisionOf);
    return {
      get: (k: string) => (ADVANCING(k) ? byKey.get(k) : before.get(k)),
      has: (k: string) => (ADVANCING(k) ? byKey.has(k) : before.has(k)),
    };
  };

  const checkPins = (fact: OwnerFact, keys: readonly string[]) => {
    const group = store.committedGroup(fact.provenance.intent_id);
    const revision = revisionOf(fact);
    for (const key of keys) {
      const target = byKey.get(key);
      if (!target) {
        bad(fact.key, `a pinned fact is committed: ${key}`);
        continue;
      }
      if (!ADVANCING(key) && revisionOf(target) >= revision)
        bad(fact.key, `a pinned fact was not committed before this fact: ${key}`);
      if (!group || !group.reads.some((r) => r.key === key))
        bad(fact.key, `the fact read the pinned fact: ${key}`);
    }
  };

  for (const f of commitments) {
    const c = PcCollectionCommitmentSchema.safeParse(f.value);
    if (!c.success) continue; // canonical integrity reports the malformed value
    const v = pcCollectionCommitmentViolation(f.key, c.data, view(revisionOf(f)), true);
    if (v) bad(f.key, v);
    checkPins(f, [
      c.data.intent.source.fact_key,
      c.data.intent.destination.fact_key,
      c.data.basis.cycle.mechanism.fact_key,
      c.data.basis.cycle.attestation.fact_key,
    ]);
  }
  // v0.3 F-2 / F-3: the owner-qualified attestations and Population's representation determinations
  for (const f of attestations) {
    const a = PcCollectionCycleAttestationSchema.safeParse(f.value);
    if (!a.success) continue;
    const v = pcCycleAttestationViolation(f.key, a.data, view(revisionOf(f)), true);
    if (v) bad(f.key, v);
    checkPins(f, [a.data.mechanism.fact_key]);
  }
  for (const f of representations) {
    const r = PopulationPcRepresentationSchema.safeParse(f.value);
    if (!r.success) continue;
    const v = pcRepresentationViolation(f.key, r.data, view(revisionOf(f)), undefined, true);
    if (v) bad(f.key, v);
    // the recorded status must agree with the ledgers it pins, for every pinned ledger still at the pinned version (a ledger that has
    // advanced since is Population's own later business: the status as then cannot be re-derived from the current ledger)
    const pinned = r.data.ledgers.flatMap((p) => {
      const lf = byKey.get(p.fact_key);
      const lv = lf ? PopulationBasisSchema.safeParse(lf.value) : undefined;
      return lf && lv?.success && lf.version === p.version ? [lv.data] : [];
    });
    const unchanged = pinned.length === r.data.ledgers.length;
    const counted = pinned.some((l) => l.units.some((u) => u.unit_id === r.data.pc_id));
    const here = pinned.some(
      (l) =>
        l.locality.world.entity_id === r.data.locality.world_id &&
        l.locality.locus.entity_id === r.data.locality.locus_id,
    );
    if (
      r.data.status === "OUTSIDE_AGGREGATE" &&
      (r.data.ledgers.length === 0 || (unchanged && (counted || !here)))
    )
      bad(
        f.key,
        "a proven-outside determination rests on a ledger at the PC's locus that does not count the PC",
      );
    if (r.data.status === "INCLUDED" && unchanged && !counted)
      bad(f.key, "an included determination rests on a ledger that counts the PC");
  }
  for (const f of requests) {
    const r = ProductionRequestSchema.safeParse(f.value);
    if (!r.success) continue;
    const v = pcCollectionRequestViolation(f.key, r.data, view(revisionOf(f)), true);
    if (v) bad(f.key, v);
  }
  for (const f of mechanisms) {
    const m = PcCollectionMechanismSchema.safeParse(f.value);
    if (!m.success) continue;
    const v = pcCollectionMechanismViolation(f.key, m.data, view(revisionOf(f)));
    if (v) bad(f.key, v);
  }
  for (const f of reaches) {
    const d = PcCollectionReachDecisionSchema.safeParse(f.value);
    if (!d.success) continue;
    const v = pcCollectionReachViolation(f.key, d.data, view(revisionOf(f)), false);
    if (v) bad(f.key, v);
    checkPins(f, [d.data.task.source.fact_key, d.data.task.mechanism.fact_key]);
  }
  for (const f of occupancies) {
    const o = PopulationPcOccupancySchema.safeParse(f.value);
    if (!o.success) continue;
    const commitment = byKey.get(o.data.commitment.fact_key);
    const mechanism = byKey.get(o.data.mechanism.fact_key);
    const c = commitment ? PcCollectionCommitmentSchema.safeParse(commitment.value) : undefined;
    const m = mechanism ? PcCollectionMechanismSchema.safeParse(mechanism.value) : undefined;
    if (!c?.success || !m?.success || c.data.pc_id !== o.data.pc_id) {
      bad(f.key, "an occupancy registers the PC's own committed commitment and mechanism");
      continue;
    }
    const interval = deriveOccupancyInterval(c.data, m.data, o.data.interval.from);
    if (!interval.ok || !canonicalEqual(interval.value.to, o.data.interval.to))
      bad(
        f.key,
        "an occupied interval is exactly the interval the commitment and the mechanism derive",
      );
    if (
      o.data.representation.fact_key !== popPcRepresentationKey(o.data.pc_id) ||
      !byKey.has(o.data.representation.fact_key)
    )
      bad(f.key, "an occupancy registers on Population's determination of the PC's representation");
    if (
      o.data.status === "RELEASED_DENIED" &&
      byKey.has(productionExtractionKey(pcCollectionRequestId(o.data.pc_id, o.data.act_id)))
    )
      bad(f.key, "a denied occupancy has no admitted extraction");
    if (o.data.status === "RELEASED_TERMINATED") {
      // D-1 (PROVISIONAL): released only after Production's termination of this act, with its pending boundary retired
      const id = pcCollectionRequestId(o.data.pc_id, o.data.act_id);
      const object = byKey.get(temporalObjectKey(productionExtractionObjectId(id)));
      const parsedObject = object ? TemporalObjectSchema.safeParse(object.value) : undefined;
      if (!byKey.has(productionPcCollectionTerminationKey(id)))
        bad(f.key, "a terminated occupancy follows Production's termination of its act");
      if (!parsedObject?.success || parsedObject.data.next_boundary !== null)
        bad(f.key, "a terminated occupancy follows the retirement of its work's pending boundary");
    }
  }
  // D-1 (PROVISIONAL): the cessation requests and Production's terminal dispositions
  for (const f of cessations) {
    const c = PcCollectionCessationSchema.safeParse(f.value);
    if (!c.success) continue;
    const v = pcCollectionCessationViolation(f.key, c.data, view(revisionOf(f)), true);
    if (v) bad(f.key, v);
    checkPins(f, [c.data.intent.target.commitment.fact_key, c.data.intent.target.work.fact_key]);
  }
  for (const f of terminations) {
    const t = ProductionPcCollectionTerminationSchema.safeParse(f.value);
    if (!t.success) continue;
    const v = pcCollectionTerminationViolation(f.key, t.data, view(revisionOf(f)), true);
    if (v) bad(f.key, v);
    checkPins(f, [
      t.data.pins.cessation.fact_key,
      t.data.pins.work.fact_key,
      t.data.pins.extraction.fact_key,
    ]);
    const id = t.data.termination_id;
    const facts = { get: (k: string) => byKey.get(k), has: (k: string) => byKey.has(k) };
    const ex = byKey.get(productionExtractionKey(id));
    const e = ex ? ProductionExtractionSchema.safeParse(ex.value) : undefined;
    const account = e?.success ? parseAccount(byKey.get(e.data.account.fact_key)) : undefined;
    const sourceFact = e?.success ? byKey.get(e.data.source.fact_key) : undefined;
    const source = sourceFact ? WorldSourceConditionSchema.safeParse(sourceFact.value) : undefined;
    if (extractionCredited(facts, id))
      bad(f.key, "a terminated collection is never credited: no partial or completed output");
    if (account?.open.some((o) => o.extraction_id === id))
      bad(f.key, "a terminated collection no longer holds its claim on the source");
    if (
      byKey.has(productionSourceDeltaKey(id)) ||
      (source?.success && source.data.delivered.some((d) => d.delivery_id === id))
    )
      bad(
        f.key,
        "a terminated collection has no Source Delta and no delivery: nothing was drawn down",
      );
    const occ = byKey.get(popPcOccupancyKey(t.data.pc_id));
    const o = occ ? PopulationPcOccupancySchema.safeParse(occ.value) : undefined;
    if (o?.success && o.data.act_id === t.data.act_id && o.data.status === "RELEASED_DENIED")
      bad(f.key, "a terminated collection is not a denied one");
  }
  const workIds = new Set<string>();
  for (const f of works) {
    const w = ProductionPcCollectionWorkSchema.safeParse(f.value);
    if (!w.success) continue;
    workIds.add(w.data.work_id);
    const v = pcCollectionWorkViolation(f.key, w.data, view(revisionOf(f)), false);
    if (v) bad(f.key, v);
    const ex = byKey.get(productionExtractionKey(w.data.work_id));
    const e = ex ? ProductionExtractionSchema.safeParse(ex.value) : undefined;
    if (
      !e?.success ||
      !canonicalEqual(e.data.timing.started_at, w.data.derivation.started_at) ||
      !canonicalEqual(e.data.timing.boundary.at, w.data.derivation.completes_at) ||
      e.data.request.fact_key !== w.data.pins.request.fact_key
    )
      bad(
        f.key,
        "a work record answers its extraction: the declared start and boundary are exactly the derived ones",
      );
    checkPins(f, [
      w.data.pins.commitment.fact_key,
      w.data.pins.mechanism.fact_key,
      w.data.pins.reach.fact_key,
    ]);
  }
  for (const f of all) {
    if (kindOf(f) !== "production_extraction") continue;
    const e = ProductionExtractionSchema.safeParse(f.value);
    if (!e.success || e.data.request.owner !== "pc_existence") continue;
    if (!workIds.has(e.data.extraction_id))
      bad(
        f.key,
        "an extraction on a PC-owned request has Production's derived work record: no caller-declared boundary",
      );
    if (!canonicalEqual(f.provenance.rule, PRODUCTION_PC_COLLECTION_WORK_RULE))
      bad(f.key, "a PC-owned extraction is governed by the provisional PC-collection work rule");
  }
  return out;
}
