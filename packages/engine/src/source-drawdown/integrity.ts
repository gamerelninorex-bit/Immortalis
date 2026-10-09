import {
  ExtractionBasisSchema,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  ResolutionTransactionSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  TemporalObjectSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  compareTime,
  productionExtractionBoundaryId,
  productionExtractionKey,
  productionExtractionObjectId,
  productionReserveInflowStage,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  temporalObjectKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation, stageAuthorityViolation } from "../production/admission.ts";
import { stageIntentId } from "../temporal/identity.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { extractionObjectViolation } from "./declaration.ts";
import { deriveSourceDelta, pinned } from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's exact-drawdown state still tells one
 * story (IM-12 replay/recovery + IM-05 + the World-State Source Condition owner). Replay proves the HISTORY is intact and
 * canonical integrity proves each fact's type; this proves the facts still cohere:
 *
 *  - every Source Condition is conserved (established = recoverable + Σ delivered), each delivery recorded once and backed by
 *    a World-State delivery record, a Production Source Delta and an extraction on that very key, of exactly that quantity;
 *  - a delivery record, a Source Delta and an account are exactly what the pinned extraction (and the delta before it) derive,
 *    and each was committed only as its IM-02 stage;
 *  - a Reserve inflow is credited once, only after the delivery of that very drawdown, of exactly the delivered quantity —
 *    and the quantity is therefore in exactly one place at every committed cut (still source-owned, an undelivered Source
 *    Delta, delivered and awaiting its credit, or Reserve-held);
 *  - an account's open commitments are exactly the not-yet-credited extractions on its key, never exceeding what the
 *    Source Condition still holds;
 *  - an extraction's temporal object is the one derived from the extraction, and a stage is credited by a committed
 *    ResolutionTransaction or is an interrupted one still awaiting its engaged, unretired boundary.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifySourceDrawdownIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "SOURCE_DRAWDOWN_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ofKind = (id: string) => all.filter((f) => kindOf(f) === id);
  const sources = ofKind("world_source_condition");
  const deliveries = ofKind("world_source_delivery");
  const bases = ofKind("production_extraction_basis");
  const extractions = ofKind("production_extraction");
  const deltas = ofKind("production_source_delta");
  const accounts = ofKind("production_source_account");
  if (
    sources.length +
      deliveries.length +
      bases.length +
      extractions.length +
      deltas.length +
      accounts.length ===
    0
  )
    return out;

  const at = <T>(
    key: string,
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  ): { key: string; version: number; value: T } | undefined => {
    const f = byKey.get(key);
    return f ? pinned(f, schema) : undefined;
  };
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = pinned(f, ResolutionTransactionSchema);
      return t ? [t.value] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  const revisionOf = (f: OwnerFact | undefined): number =>
    f ? (store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0) : 0;
  const stageRevision = (stage: ReturnType<typeof productionReserveInflowStage>): number =>
    store.lookupReceipt(stageIntentId(stage))?.revision ?? 0;

  // -- World-State Source Conditions ---------------------------------------------------------------------
  for (const sf of sources) {
    const s = pinned(sf, WorldSourceConditionSchema)?.value;
    if (!s) continue;
    if (sf.key !== worldSourceConditionKey(s.locality.world.entity_id, s.source_key))
      bad(sf.key, "a Source Condition lives at the key derived from its resolution key");
    for (const d of s.delivered) {
      const world = s.locality.world.entity_id;
      const receipt = at(
        worldSourceDeliveryKey(world, d.delivery_id),
        WorldSourceDeliverySchema,
      )?.value;
      const delta = at(productionSourceDeltaKey(d.delivery_id), SourceDeltaSchema)?.value;
      const ex = at(productionExtractionKey(d.delivery_id), ProductionExtractionSchema)?.value;
      if (
        !receipt ||
        !delta ||
        !ex ||
        !canonicalEqual(receipt.delivered, d.quantity) ||
        !canonicalEqual(delta.magnitude, d.quantity) ||
        ex.source.fact_key !== sf.key ||
        receipt.source.fact_key !== sf.key
      )
        bad(
          sf.key,
          `delivery ${d.delivery_id} is not a recorded delivery of an actual Source Delta of this key`,
        );
    }
  }

  // -- World-State delivery records ----------------------------------------------------------------------
  for (const df of deliveries) {
    const v = pinned(df, WorldSourceDeliverySchema)?.value;
    if (!v) continue;
    const srcFact = byKey.get(v.source.fact_key);
    const src = srcFact ? pinned(srcFact, WorldSourceConditionSchema)?.value : undefined;
    const deltaFact = byKey.get(v.delta.fact_key);
    const delta = deltaFact ? pinned(deltaFact, SourceDeltaSchema) : undefined;
    const ex = at(productionExtractionKey(v.delivery_id), ProductionExtractionSchema);
    if (!srcFact || !src || !deltaFact || !delta || !ex) {
      bad(df.key, "a delivery has its Source Condition, its Source Delta and its extraction");
      continue;
    }
    if (!src.delivered.some((d) => d.delivery_id === v.delivery_id))
      bad(df.key, "a delivery is recorded on the Source Condition it delivered to");
    if (delta.version !== v.delta.version)
      bad(df.key, "a delivery consumed the Source Delta at the version pinned");
    if (!canonicalEqual(delta.value, deriveSourceDelta(ex)))
      bad(deltaFact.key, "a Source Delta is exactly its extraction's drawdown");
    // the delivery record is exactly the actual delta consumed: the delta's own quantity, key and instant, once
    if (
      !canonicalEqual(v.delivered, delta.value.magnitude) ||
      v.delta.fact_key !== deltaFact.key ||
      v.source.fact_key !== delta.value.source.fact_key ||
      v.source.source_key !== delta.value.source.source_key ||
      v.source.fact_key !== srcFact.key ||
      v.source.source_key !== src.source_key ||
      !canonicalEqual(v.delivered_at, delta.value.emitted_at) ||
      !canonicalEqual(v.close_stage, worldSourceDeliveryStage(v.delivery_id)) ||
      v.source.version_after > srcFact.version ||
      v.exhausted !== (src.exhaustion?.delivery_id === v.delivery_id)
    )
      bad(df.key, "a delivery is exactly the actual Source Delta consumed, once");
    const identity = journaledStageViolation(
      store,
      byKey,
      df,
      v.close_stage,
      ex.value.timing.boundary.at,
    );
    if (identity) bad(df.key, identity);
    const obj = byKey.get(temporalObjectKey(productionExtractionObjectId(v.delivery_id)));
    const unretired = obj
      ? (pinned(obj, TemporalObjectSchema)?.value.next_boundary ?? null) !== null
      : false;
    if (!cited(df.provenance.group_id) && !unretired)
      bad(
        df.key,
        "a delivery is credited by no resolution transaction and its boundary is retired",
      );
    if (revisionOf(df) <= revisionOf(deltaFact))
      bad(df.key, "the delivery was not committed after the Source Delta it consumed");
  }

  // -- Production bases ------------------------------------------------------------------------------------
  for (const bf of bases) {
    const b = pinned(bf, ExtractionBasisSchema)?.value;
    if (!b) continue;
    const src = at(b.source.fact_key, WorldSourceConditionSchema)?.value;
    if (
      !src ||
      src.source_key !== b.source.source_key ||
      src.material_class !== b.material_class ||
      src.recoverable.unit !== b.unit ||
      !canonicalEqual(src.locality, b.locality) ||
      !src.access_facts.some((a) => canonicalEqual(a, b.access.relies_on))
    )
      bad(
        bf.key,
        "a basis covers a World-State Source Condition and relies on a physical access fact it states",
      );
  }

  // -- extractions, Source Deltas ---------------------------------------------------------------------------
  const credited = new Set<string>();
  for (const ef of extractions) {
    const e = pinned(ef, ProductionExtractionSchema)?.value;
    if (!e) continue;
    const srcFact = byKey.get(e.source.fact_key);
    const src = srcFact ? pinned(srcFact, WorldSourceConditionSchema)?.value : undefined;
    const reserveFact = byKey.get(e.reserve.fact_key);
    const reserve = reserveFact ? pinned(reserveFact, ProductionReserveSchema)?.value : undefined;
    const accountFact = byKey.get(e.account.fact_key);
    const account = accountFact ? pinned(accountFact, SourceAccountSchema)?.value : undefined;
    if (!srcFact || !src || !reserve || !account) {
      bad(ef.key, "an extraction has its Source Condition, its Reserve and its account");
      continue;
    }
    const basisFact = byKey.get(e.basis.fact_key);
    if (!basisFact || basisFact.owner !== ef.owner)
      bad(ef.key, "an extraction has its Capability / Access basis");
    const reqFact = byKey.get(e.request.fact_key);
    if (!reqFact || reqFact.owner !== e.request.owner)
      bad(ef.key, "an extraction's pinned request is its source's committed fact");
    if (
      e.material_class !== src.material_class ||
      e.quantity.unit !== src.recoverable.unit ||
      reserve.material_class !== e.material_class ||
      !canonicalEqual(reserve.locality, src.locality) ||
      accountFact?.key !== productionSourceAccountKey(src.locality.world.entity_id, src.source_key)
    )
      bad(
        ef.key,
        "an extraction is for one material, one unit and one locality across source, Reserve and account",
      );
    const isCredited = (reserve.inflows ?? []).some((i) => i.inflow_id === e.extraction_id);
    const inAccount = account.open.some((o) => o.extraction_id === e.extraction_id);
    if (isCredited === inAccount)
      bad(
        ef.key,
        "an extraction is held open on its account exactly until its Reserve inflow is credited",
      );
    const deltaFact = byKey.get(productionSourceDeltaKey(e.extraction_id));
    const receiptFact = byKey.get(
      worldSourceDeliveryKey(src.locality.world.entity_id, e.extraction_id),
    );
    const delivered = src.delivered.some((d) => d.delivery_id === e.extraction_id);
    if (!!receiptFact !== delivered)
      bad(
        ef.key,
        "a delivery record exists exactly when the Source Condition recorded the delivery",
      );
    if (receiptFact && !deltaFact) bad(ef.key, "a delivery follows a Source Delta");
    if (isCredited) {
      credited.add(e.extraction_id);
      if (!receiptFact || !deltaFact)
        bad(
          ef.key,
          "a Reserve inflow follows World-State's delivery of the extraction's own drawdown",
        );
      else {
        if (stageRevision(productionReserveInflowStage(e.extraction_id)) <= revisionOf(receiptFact))
          bad(ef.key, "the Reserve inflow was not committed after the delivery it credits");
        const group = store.committedGroup(
          stageIntentId(productionReserveInflowStage(e.extraction_id)),
        );
        const identity = group
          ? stageAuthorityViolation(
              group,
              productionReserveInflowStage(e.extraction_id),
              byKey,
              e.timing.boundary.at,
              "VERIFICATION",
            )
          : "an inflow has its journaled stage group";
        if (identity) bad(ef.key, identity);
        const entry = (reserve.inflows ?? []).find((i) => i.inflow_id === e.extraction_id);
        if (!entry || !canonicalEqual(entry.quantity, e.quantity))
          bad(ef.key, "the credited inflow is exactly the extracted quantity");
      }
    }
    const objFact = byKey.get(temporalObjectKey(productionExtractionObjectId(e.extraction_id)));
    if (objFact) {
      const obj = pinned(objFact, TemporalObjectSchema)?.value;
      if (obj) {
        const violation = extractionObjectViolation(obj, { facts: byKey }, false);
        if (violation) bad(objFact.key, violation);
        if (
          obj.next_boundary &&
          (obj.next_boundary.boundary_id !== productionExtractionBoundaryId(e.extraction_id) ||
            compareTime(obj.next_boundary.at, e.timing.boundary.at) !== 0)
        )
          bad(objFact.key, "the object's earned boundary is the extraction's declared boundary");
      }
    }
  }

  for (const df of deltas) {
    const d = pinned(df, SourceDeltaSchema)?.value;
    if (!d) continue;
    const ex = at(productionExtractionKey(d.delta_id), ProductionExtractionSchema);
    if (!ex) {
      bad(df.key, "a Source Delta answers a committed extraction");
      continue;
    }
    if (!canonicalEqual(d, deriveSourceDelta(ex)))
      bad(df.key, "a Source Delta is exactly its extraction's drawdown");
    const identity = journaledStageViolation(
      store,
      byKey,
      df,
      d.close_stage,
      ex.value.timing.boundary.at,
    );
    if (identity) bad(df.key, identity);
    const obj = byKey.get(temporalObjectKey(productionExtractionObjectId(d.delta_id)));
    const unretired = obj
      ? (pinned(obj, TemporalObjectSchema)?.value.next_boundary ?? null) !== null
      : false;
    if (!cited(df.provenance.group_id) && !unretired)
      bad(
        df.key,
        "a Source Delta is credited by no resolution transaction and its boundary is retired",
      );
  }

  // -- accounts and Reserve inflows ------------------------------------------------------------------------
  for (const af of accounts) {
    const a = pinned(af, SourceAccountSchema)?.value;
    if (!a) continue;
    const src = at(a.source.fact_key, WorldSourceConditionSchema)?.value;
    if (
      !src ||
      af.key !== productionSourceAccountKey(a.locality.world.entity_id, a.source.source_key) ||
      src.source_key !== a.source.source_key ||
      a.material_class !== src.material_class ||
      a.unit !== src.recoverable.unit ||
      !canonicalEqual(a.locality, src.locality)
    ) {
      bad(af.key, "an account is a committed Source Condition's own, by its resolution key");
      continue;
    }
    const delivered = new Set(src.delivered.map((d) => d.delivery_id));
    let claimed = 0;
    for (const o of a.open) {
      const ex = at(productionExtractionKey(o.extraction_id), ProductionExtractionSchema)?.value;
      if (!ex || ex.account.fact_key !== af.key || !canonicalEqual(ex.quantity, o.quantity))
        bad(
          af.key,
          `commitment ${o.extraction_id} is not an extraction on this key of that quantity`,
        );
      if (!delivered.has(o.extraction_id)) claimed += o.quantity.amount;
    }
    if (claimed > src.recoverable.amount)
      bad(
        af.key,
        "the open commitments exceed what the Source Condition still holds: one quantity supports two uses",
      );
  }
  for (const rf of ofKind("production_reserve")) {
    const r = pinned(rf, ProductionReserveSchema)?.value;
    for (const i of r?.inflows ?? []) {
      const ex = at(productionExtractionKey(i.inflow_id), ProductionExtractionSchema)?.value;
      if (!ex || ex.reserve.fact_key !== rf.key || !canonicalEqual(ex.quantity, i.quantity))
        bad(
          rf.key,
          `inflow ${i.inflow_id} is not a credited extraction into this Reserve of that quantity`,
        );
    }
  }

  // -- cross-owner conservation per Source Condition -------------------------------------------------------
  for (const sf of sources) {
    const s = pinned(sf, WorldSourceConditionSchema)?.value;
    if (!s) continue;
    const delivered = s.delivered.reduce((n, d) => n + d.quantity.amount, 0);
    const creditedHere = extractions
      .map((f) => pinned(f, ProductionExtractionSchema)?.value)
      .filter((e) => e && e.source.fact_key === sf.key && credited.has(e.extraction_id))
      .reduce((n, e) => n + (e?.quantity.amount ?? 0), 0);
    if (creditedHere > delivered)
      bad(
        sf.key,
        "more has been credited to Reserves than World-State delivered: mass from nowhere",
      );
  }
  return out;
}
