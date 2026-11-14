import {
  EconomyFreightAllocationSchema,
  EconomyFreightCloseSchema,
  EconomyFreightReceiptSchema,
  EconomyFreightRequestSchema,
  EconomyFreightSlotSchema,
  EconomyFreightUseConsumptionSchema,
  EconomyFreightWithdrawalSchema,
  LegalReadinessSealSchema,
  LogisticsCommitmentSchema,
  LogisticsFreightDispatchEnrollmentSchema,
  LogisticsServiceSlotSchema,
  LogisticsTransferSchema,
  LogisticsUnusedReleaseSchema,
  WorldGoverningPremiseHeadSchema,
  WorldGoverningPremiseSchema,
  economyFreightCargoSlotKey,
  economyFreightCloseKey,
  economyFreightDirectiveUseSlotKey,
  economyFreightRequestKey,
  economyFreightRequirementSlotKey,
  economyFreightResultKey,
  economyFreightUseConsumptionKey,
  economyFreightWithdrawalKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
  logisticsUnusedReleaseKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";

/**
 * Load-time cross-fact verifier for the ROADBED first-profile freight state (R3-T25 / R2-D18 v1.2.1 / R3-T2). Replay proves the
 * HISTORY (every historical commit is re-derived against its actual pre-state, `verifyHistorical`) and canonical integrity
 * proves each fact's type; this proves that the CURRENT freight facts still tell one story, using committed facts alone:
 *
 *  - a request has exactly the allocation named by its request ref, whose live state agrees with the withdrawal / close /
 *    consumption / result facts that exist for it (and no such fact exists for a request whose allocation says otherwise);
 *  - the three exclusive slots of a request are held, released or consumed exactly as its allocation state says, and each is
 *    named by exactly one request (two requests never share a slot);
 *  - an unused-release (F2) event is the one immutable event its commitment and its service slot name, there is no Transfer
 *    Record for it, and the commitment is RELEASED_UNUSED; a HELD slot has a live COMMITTED-or-later commitment;
 *  - a first-dispatch consumption is the one Transfer Record owner key it names, and a receipt-bound result needs its consumption;
 *  - a governing-premise head counts exactly the admitted premises of its class in its world.
 *
 * It re-derives nothing a historical commit already proved and reads no clock: one `listFacts` per open, like the other
 * verifiers (diagnostic path, CAL-06).
 */
export function verifyFreightIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "FREIGHT_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const ofKind = (id: string): readonly OwnerFact[] =>
    all.filter((f) => resolveKey(f.key)?.kind.id === id);

  const read = <T>(
    key: string,
    parse: (v: unknown) => { success: true; data: T } | { success: false },
  ): T | undefined => {
    const fact = byKey.get(key);
    if (!fact) return undefined;
    const parsed = parse(fact.value);
    return parsed.success ? parsed.data : undefined;
  };

  // -- requests, allocations, slots ----------------------------------------------------------------
  // A terminally closed request has released its slots, so a later request (E2) may lawfully re-claim them; every other state holds
  // them. Two HOLDING requests on one exclusive slot would be two claimants.
  const slotHolder = new Map<string, string>();
  const holdSlot = (slotKey: string, requestRef: string, atKey: string) => {
    const prior = slotHolder.get(slotKey);
    if (prior !== undefined && prior !== requestRef)
      bad(atKey, `slot ${slotKey} is held by two requests (${prior}, ${requestRef})`);
    slotHolder.set(slotKey, requestRef);
  };

  const requestRefs = new Set<string>();
  for (const f of ofKind("economy_freight_request")) {
    const parsed = EconomyFreightRequestSchema.safeParse(f.value);
    if (!parsed.success) continue; // canonical integrity reports the type failure
    const r = parsed.data;
    requestRefs.add(r.request_ref);
    if (f.key !== economyFreightRequestKey(r.request_ref))
      bad(f.key, "the request is not keyed by its own request_ref");
    if (f.version !== 1) bad(f.key, "a sealed request is create-only (version 1)");

    const alloc = read(r.allocation.fact_key, (v) => EconomyFreightAllocationSchema.safeParse(v));
    if (!alloc) {
      bad(f.key, `the request has no allocation at ${r.allocation.fact_key}`);
      continue;
    }
    if (alloc.request.request_ref !== r.request_ref || alloc.request.fact_key !== f.key)
      bad(r.allocation.fact_key, "the allocation does not name the request it is keyed to");

    const useKey = economyFreightDirectiveUseSlotKey(r.directive_use_id);
    const cargoKey = economyFreightCargoSlotKey(
      r.origin_ref.world.entity_id,
      r.moved_object_or_quantity_ref.entity_id,
    );
    const requirementKey = economyFreightRequirementSlotKey(
      r.requirement.specification.fact_key.split("/").pop() ?? "",
    );
    if (alloc.state.status !== "terminal") {
      holdSlot(useKey, r.request_ref, f.key);
      holdSlot(cargoKey, r.request_ref, f.key);
      holdSlot(requirementKey, r.request_ref, f.key);
    }

    const withdrawalKey = economyFreightWithdrawalKey(r.request_ref);
    const closeKey = economyFreightCloseKey(r.request_ref);
    const consumptionKey = economyFreightUseConsumptionKey(r.directive_use_id);
    const resultKey = economyFreightResultKey(r.request_ref);
    const has = (k: string) => byKey.has(k);
    // the use consumption is keyed by the directive-use identity, which successive requests of one directive share (E2): it is this
    // request's only if it names this request
    const consumed = (): boolean => {
      const c = read(consumptionKey, (v) => EconomyFreightUseConsumptionSchema.safeParse(v));
      return c !== undefined && c.request.request_ref === r.request_ref;
    };
    const status = alloc.state.status;

    // which sibling facts MUST / MUST NOT exist for this status
    const expect = (cond: boolean, message: string) => {
      if (!cond) bad(r.allocation.fact_key, `${status}: ${message}`);
    };
    switch (alloc.state.status) {
      case "pending":
        expect(!has(withdrawalKey), "a withdrawal exists for a pending request");
        expect(!has(closeKey), "a close exists for a pending request");
        expect(!consumed(), "a use consumption exists for a pending request");
        expect(!has(resultKey), "a result exists for a pending request");
        break;
      case "withdrawal-pending":
        expect(
          alloc.state.withdrawal.fact_key === withdrawalKey,
          "its withdrawal pin is not the request's",
        );
        expect(has(withdrawalKey), "its withdrawal is not committed");
        expect(!has(closeKey), "a close exists before the request is terminal");
        expect(!consumed(), "a use consumption exists for a withdrawn request");
        expect(!has(resultKey), "a result exists for a withdrawn request");
        break;
      case "terminal":
        expect(alloc.state.close.fact_key === closeKey, "its close pin is not the request's");
        expect(has(closeKey), "its close is not committed");
        expect(has(withdrawalKey), "a close never exists without its protective withdrawal");
        expect(!consumed(), "a use consumption exists for a terminally closed request");
        expect(!has(resultKey), "a result exists for a terminally closed request");
        break;
      case "dispatch-consumed":
        expect(
          alloc.state.consumption.fact_key === consumptionKey,
          "its consumption pin is not the request's",
        );
        expect(consumed(), "its use consumption is not committed");
        expect(!has(withdrawalKey), "a withdrawal exists for a dispatched request");
        expect(!has(closeKey), "a close exists for a dispatched request");
        expect(!has(resultKey), "a result exists before the receipt");
        break;
      case "received":
        expect(
          alloc.state.consumption.fact_key === consumptionKey,
          "its consumption pin is not the request's",
        );
        expect(alloc.state.receipt.fact_key === resultKey, "its receipt pin is not the request's");
        expect(consumed() && has(resultKey), "its consumption and result are not both committed");
        expect(!has(withdrawalKey), "a withdrawal exists for a received request");
        expect(!has(closeKey), "a close exists for a received request");
        break;
    }

    // the slots follow the allocation state
    const slots = [useKey, cargoKey, requirementKey].map(
      (k) => [k, read(k, (v) => EconomyFreightSlotSchema.safeParse(v))] as const,
    );
    for (const [k, slot] of slots) {
      if (!slot) {
        bad(f.key, `slot ${k} of the request is not committed`);
        continue;
      }
      const s = slot.state;
      if (s.request_ref !== r.request_ref) {
        // a later request may lawfully re-claim a slot this one released (E2). A request that is still live, or whose one use was
        // consumed, must still hold its slots: another request holding one is two claimants of an exclusive slot.
        if (status !== "terminal")
          bad(k, `slot is held by ${s.request_ref} while ${r.request_ref} is ${status}`);
        continue;
      }
      const want =
        status === "pending" || status === "withdrawal-pending"
          ? "claimed"
          : status === "terminal"
            ? "released"
            : "consumed";
      if (s.status !== want)
        bad(k, `slot is ${s.status} but the request is ${status} (expected ${want})`);
    }
  }

  // -- withdrawals / closes / consumptions / results must belong to a request they match --------------
  for (const f of ofKind("economy_freight_withdrawal")) {
    const w = EconomyFreightWithdrawalSchema.safeParse(f.value);
    if (!w.success) continue;
    const ref = w.data.request.request_ref;
    if (f.key !== economyFreightWithdrawalKey(ref))
      bad(f.key, "withdrawal is not keyed by its request");
    if (!requestRefs.has(ref)) bad(f.key, `withdrawal names no committed request ${ref}`);
    else {
      const req = read(economyFreightRequestKey(ref), (v) =>
        EconomyFreightRequestSchema.safeParse(v),
      );
      if (req && req.moved_object_or_quantity_ref.entity_id !== w.data.entity.entity_id)
        bad(f.key, "withdrawal names a different entity than its request");
    }
  }
  for (const f of ofKind("economy_freight_close")) {
    const c = EconomyFreightCloseSchema.safeParse(f.value);
    if (!c.success) continue;
    const ref = c.data.request.request_ref;
    if (f.key !== economyFreightCloseKey(ref)) bad(f.key, "close is not keyed by its request");
    if (!requestRefs.has(ref)) bad(f.key, `close names no committed request ${ref}`);
    if (c.data.withdrawal.fact_key !== economyFreightWithdrawalKey(ref))
      bad(f.key, "close pins a withdrawal that is not its request's");
    if (c.data.no_dispatch_basis.kind === "UNUSED_RELEASE_REGISTERED") {
      const ev = c.data.no_dispatch_basis.registration;
      const release = read(ev.event.fact_key, (v) => LogisticsUnusedReleaseSchema.safeParse(v));
      if (!release)
        bad(
          f.key,
          `close consumes an unused-release event that is not committed (${ev.event.fact_key})`,
        );
      else if (release.event_id !== ev.event.event_id || release.request.request_id !== ref)
        bad(f.key, "close consumes an unused-release event of a different identity or request");
    }
  }
  for (const f of ofKind("economy_freight_use_consumption")) {
    const c = EconomyFreightUseConsumptionSchema.safeParse(f.value);
    if (!c.success) continue;
    if (f.key !== economyFreightUseConsumptionKey(c.data.directive_use_id))
      bad(f.key, "use consumption is not keyed by its directive-use identity");
    const ref = c.data.request.request_ref;
    const req = read(economyFreightRequestKey(ref), (v) =>
      EconomyFreightRequestSchema.safeParse(v),
    );
    if (!req) {
      bad(f.key, `use consumption names no committed request ${ref}`);
      continue;
    }
    if (req.directive_use_id !== c.data.directive_use_id)
      bad(f.key, "use consumption names a different directive use than its request");
    const transfer = byKey.get(c.data.dispatch_event.transfer.fact_key);
    if (!transfer)
      bad(f.key, "use consumption names a first-dispatch Transfer Record that is not committed");
    else {
      const t = LogisticsTransferSchema.safeParse(transfer.value);
      if (!t.success || t.data.transfer_id !== c.data.dispatch_event.transfer.transfer_id)
        bad(f.key, "use consumption names a Transfer Record of a different identity");
      else if (t.data.request.request_id !== ref)
        bad(f.key, "use consumption names a Transfer Record of a different request");
      if (
        transfer.key !==
        logisticsTransferKey(
          req.origin_ref.world.entity_id,
          req.moved_object_or_quantity_ref.entity_id,
        )
      )
        bad(f.key, "use consumption names a Transfer Record outside its request's entity");
    }
    if (
      c.data.dispatched.unit !== req.quantity.unit ||
      c.data.dispatched.amount !== req.quantity.amount
    )
      bad(f.key, "the dispatched quantity is not the request's whole cargo");
  }
  for (const f of ofKind("economy_freight_result")) {
    const rcpt = EconomyFreightReceiptSchema.safeParse(f.value);
    if (!rcpt.success) continue;
    const ref = rcpt.data.request.request_ref;
    if (f.key !== economyFreightResultKey(ref)) bad(f.key, "result is not keyed by its request");
    const req = read(economyFreightRequestKey(ref), (v) =>
      EconomyFreightRequestSchema.safeParse(v),
    );
    if (!req) {
      bad(f.key, `result names no committed request ${ref}`);
      continue;
    }
    if (!byKey.has(economyFreightUseConsumptionKey(req.directive_use_id)))
      bad(f.key, "a result never exists without its first-dispatch use consumption");
  }

  // -- Logistics: service slots, unused releases, commitments ---------------------------------------------
  for (const f of ofKind("logistics_unused_release")) {
    const rel = LogisticsUnusedReleaseSchema.safeParse(f.value);
    if (!rel.success) continue;
    const rid = rel.data.request.request_id;
    if (f.key !== logisticsUnusedReleaseKey(rid)) bad(f.key, "release is not keyed by its request");
    if (rel.data.request.fact_key !== economyFreightRequestKey(rid))
      bad(f.key, "release names a request key that is not its request's");
    if (!requestRefs.has(rid)) bad(f.key, `release names no committed request ${rid}`);
    const commitment = byKey.get(rel.data.commitment.fact_key);
    const c = commitment ? LogisticsCommitmentSchema.safeParse(commitment.value) : undefined;
    if (!c || !c.success) {
      bad(f.key, "release names a commitment that is not committed");
      continue;
    }
    if (c.data.moved.entity_id !== rel.data.moved.entity_id)
      bad(f.key, "release names a commitment of a different entity");
    // the commitment key is entity-keyed (one movement slot per entity), so after an E2 re-fixation it lawfully holds a LATER
    // request's commitment at a version beyond the release; while it is still this request's, it is exactly the released one
    const stillThisRequest = c.data.request.request_id === rid;
    if (stillThisRequest) {
      if (c.data.state.status !== "RELEASED_UNUSED")
        bad(f.key, `release exists but its commitment is ${c.data.state.status}`);
      else if (
        c.data.state.unused_release.fact_key !== f.key ||
        c.data.state.unused_release.event_id !== rel.data.event_id
      )
        bad(f.key, "release is not the event the commitment names");
      if (commitment && commitment.version !== rel.data.commitment.version_before + 1)
        bad(f.key, "the released commitment is not the version the release advanced");
    } else if (commitment && commitment.version <= rel.data.commitment.version_before + 1)
      bad(f.key, "release names a commitment of a different request that did not follow it");
    const transferKey = logisticsTransferKey(c.data.origin.world.entity_id, c.data.moved.entity_id);
    const transfer = byKey.get(transferKey);
    if (transfer) {
      const t = LogisticsTransferSchema.safeParse(transfer.value);
      if (t.success && t.data.request.request_id === rid)
        bad(f.key, "an unused release exists for a request that has a Transfer Record");
    }
    const slot = read(rel.data.service_slot.fact_key, (v) =>
      LogisticsServiceSlotSchema.safeParse(v),
    );
    if (!slot) bad(f.key, "release names a service slot that is not committed");
    else if (slot.state.status === "HELD") {
      if (slot.state.commitment.request_id === rid)
        bad(rel.data.service_slot.fact_key, "service slot is still held by the released request");
    } else if (stillThisRequest && slot.state.released_by.fact_key !== f.key)
      bad(rel.data.service_slot.fact_key, "service slot is not FREE by this release");
  }
  for (const f of ofKind("logistics_service_slot")) {
    const slot = LogisticsServiceSlotSchema.safeParse(f.value);
    if (!slot.success) continue;
    if (slot.data.state.status === "HELD") {
      const held = byKey.get(slot.data.state.commitment.fact_key);
      const c = held ? LogisticsCommitmentSchema.safeParse(held.value) : undefined;
      if (!c || !c.success) {
        bad(f.key, "a HELD service slot names a commitment that is not committed");
        continue;
      }
      if (c.data.request.request_id !== slot.data.state.commitment.request_id)
        bad(f.key, "a HELD service slot names a commitment of a different request");
      if (c.data.state.status === "RELEASED_UNUSED")
        bad(f.key, "a HELD service slot names a commitment released unused");
    } else {
      const ev = byKey.get(slot.data.state.released_by.fact_key);
      if (!ev) bad(f.key, "a FREE service slot names a release event that is not committed");
      else if (!LogisticsUnusedReleaseSchema.safeParse(ev.value).success)
        bad(f.key, "a FREE service slot names a fact that is not an unused-release event");
    }
  }
  for (const f of ofKind("logistics_freight_dispatch_enrollment")) {
    // a dispatch enrollment names a Transfer Record that must be committed
    const e = LogisticsFreightDispatchEnrollmentSchema.safeParse(f.value);
    if (e.success && !byKey.has(e.data.transfer.fact_key))
      bad(f.key, "dispatch enrollment names a Transfer Record that is not committed");
  }
  // a first-profile freight commitment released unused must have its release event
  for (const f of all) {
    if (!f.key.startsWith("logistics/commitment/")) continue;
    const c = LogisticsCommitmentSchema.safeParse(f.value);
    if (!c.success || !c.data.freight) continue;
    if (
      c.data.state.status === "RELEASED_UNUSED" &&
      !byKey.has(c.data.state.unused_release.fact_key)
    )
      bad(f.key, "a commitment released unused names an event that is not committed");
    if (f.key !== logisticsCommitmentKey(c.data.origin.world.entity_id, c.data.moved.entity_id))
      bad(f.key, "commitment is not keyed by its moved entity");
  }

  // -- a Legal Readiness Seal pins only facts that exist at (or below) the version it read ----------------
  for (const f of ofKind("gip_legal_readiness_seal")) {
    const seal = LegalReadinessSealSchema.safeParse(f.value);
    if (!seal.success) continue;
    const s = seal.data;
    const pins: readonly (readonly [string, string, number])[] = [
      ["basis", s.basis.fact_key, s.basis.version],
      ["institution", s.institution.fact_key, s.institution.version],
      ["office", s.office.fact_key, s.office.version],
      ["scope binding", s.scope_binding.fact_key, s.scope_binding.version],
      ["instrument", s.instrument.fact_key, s.instrument.version],
      ["attestation", s.attestation.fact_key, s.attestation.version],
      ...s.clauses.map((c) => [`clause ${c.clause}`, c.fact_key, c.version] as const),
    ];
    for (const [what, key, version] of pins) {
      const pinned = byKey.get(key);
      if (!pinned) bad(f.key, `the seal pins ${what} ${key}, which is not committed`);
      else if (pinned.version < version)
        bad(
          f.key,
          `the seal pins ${what} ${key} at version ${version} beyond its committed version ${pinned.version}`,
        );
    }
    if (
      s.clauses.some(
        (c, i) => c.clause !== ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07"][i],
      )
    )
      bad(f.key, "the seal's clauses are not in slot order C-01..C-07");
  }

  // -- governing-premise heads count exactly the admitted premises of their class ------------------
  const premiseCount = new Map<string, number>();
  for (const f of ofKind("world_governing_premise")) {
    const p = WorldGoverningPremiseSchema.safeParse(f.value);
    if (!p.success) continue;
    const id = `${p.data.world.entity_id}|${p.data.protected_class}`;
    premiseCount.set(id, (premiseCount.get(id) ?? 0) + 1);
  }
  const headed = new Set<string>();
  for (const f of ofKind("world_governing_premise_head")) {
    const h = WorldGoverningPremiseHeadSchema.safeParse(f.value);
    if (!h.success) continue;
    const id = `${h.data.world.entity_id}|${h.data.protected_class}`;
    headed.add(id);
    const n = premiseCount.get(id) ?? 0;
    if (h.data.count !== n)
      bad(f.key, `head counts ${h.data.count} premises but ${n} are committed for ${id}`);
    if (!byKey.has(h.data.last.fact_key))
      bad(f.key, "head names a last premise that is not committed");
  }
  for (const [id, n] of premiseCount)
    if (!headed.has(id)) bad(id, `${n} admitted premise(s) of ${id} have no class head`);

  return out;
}
