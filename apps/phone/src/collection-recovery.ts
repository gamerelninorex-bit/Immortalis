import { createHash } from "node:crypto";
import {
  CanonicalTimeSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  canonicalJson,
  pcCollectionMechanismKey,
  pcCollectionRequestId,
  productionExtractionBasisKey,
  productionExtractionObjectId,
  productionReserveKey,
  temporalObjectKey,
  temporalTransactionKey,
  worldSourceConditionKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import { PcCollectionAdapter, canonicalEqual, heldPcCollections } from "@immortalis/engine";
import {
  LocalOperatorSession,
  cease,
  collect,
  collectContinue,
  collectFinish,
  collectionRefereeHosts,
  collectionTaskId,
  reconcile,
  settleCollectionLapse,
  type CliEnvironment,
  type CommandResult,
  type Intent,
  type SessionParams,
} from "@immortalis/operator";
import type { PhoneConfig } from "./config.ts";
import type { PendingOperation } from "./recovery.ts";
import { bindingHashOf, type ActionBinding } from "./pending-action.ts";
import { sha256Of } from "./scenario-hash.ts";
import type { Scenario } from "./scenario.ts";

export const COLLECTION_COMMANDS = new Set([
  "collect",
  "collect-continue",
  "collect-finish",
  "cease",
  "settle-collection-lapse",
  "reconcile",
]);

/** Trusted adapter bookkeeping, never host input. The UID is reserved before dispatch; the unchanged operator still creates its
 * intent only AFTER console confirmation or the exact ordinary-request capability is consumed. Existing choices, derived work and referee tasks are pinned before they can be selected. */
export interface CollectionIdentity {
  readonly uid: string;
  readonly pc_id: string | null;
  readonly basis: CanonicalTime | null;
  readonly temporal: string;
  readonly revision: number;
  readonly ledger: readonly {
    readonly id: string;
    readonly digest: string;
    readonly status: string;
  }[];
  readonly collection_id: string | null;
  readonly act_id: string | null;
  readonly target: CanonicalTime | null;
  readonly task_ids: readonly string[];
  readonly reach_digest: string | null;
  readonly held: readonly { readonly pcId: string; readonly actId: string }[];
}

type Session = LocalOperatorSession;
type Options = Pick<SessionParams, "extension" | "campaignFs" | "ledgerFs">;
const digest = (v: unknown): string => createHash("sha256").update(canonicalJson(v)).digest("hex");
const immutable = (i: Intent): string => digest({ ...i, status: "CONFIRMED" });
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
const time = (v: unknown) => v === null || CanonicalTimeSchema.safeParse(v).success;
export const validCollectionIdentity = (v: unknown): boolean =>
  record(v) &&
  typeof v["uid"] === "string" &&
  nullableString(v["pc_id"]) &&
  time(v["basis"]) &&
  typeof v["temporal"] === "string" &&
  Number.isSafeInteger(v["revision"]) &&
  nullableString(v["collection_id"]) &&
  nullableString(v["act_id"]) &&
  time(v["target"]) &&
  nullableString(v["reach_digest"]) &&
  Array.isArray(v["ledger"]) &&
  v["ledger"].every(
    (i: unknown) =>
      record(i) &&
      typeof i["id"] === "string" &&
      typeof i["digest"] === "string" &&
      (i["status"] === "CONFIRMED" || i["status"] === "COMMITTED"),
  ) &&
  Array.isArray(v["task_ids"]) &&
  v["task_ids"].every((id: unknown) => typeof id === "string" && /^[0-9a-f]{64}$/.test(id)) &&
  Array.isArray(v["held"]) &&
  v["held"].every(
    (i: unknown) => record(i) && typeof i["pcId"] === "string" && typeof i["actId"] === "string",
  );

const open = (config: PhoneConfig, options: Options) =>
  LocalOperatorSession.open({
    campaignDir: config.campaignDir,
    expectedCampaignId: config.campaignId,
    operatorDir: config.operatorDir,
    buildId: "immortalis-chat-recovery",
    // a FRESH v0.9 workflow initialised its ledger as version 2 before its setup commands ran; every other campaign stays on version 1
    ...(config.operatorLedgerVersion === 2 ? { ledgerVersion: 2 as const } : {}),
    ...options,
  });

function snapshot(session: Session, uid: string): CollectionIdentity {
  const c = session.campaign;
  const a = new PcCollectionAdapter(c.store);
  const pc = c.binding()?.value.active_pc.entity_id ?? null;
  const latest = session.ledger.collections().at(-1);
  const state = c.store.getFact(TEMPORAL_STATE_KEY)?.value as
    { canonical_time: CanonicalTime } | undefined;
  const hold = pc ? a.hold(pc) : null;
  const act = hold && "act_id" in hold ? hold.act_id : (latest?.choice.act_id ?? null);
  const task = latest
    ? a.reachTask(latest.pc_id, latest.choice.act_id, latest.mechanism_id)
    : undefined;
  return {
    uid,
    pc_id: pc,
    basis: state?.canonical_time ?? null,
    temporal: digest(state ?? null),
    revision: c.store.head().revision,
    ledger: session.ledger
      .intents()
      .map((i) => ({ id: i.intent_id, digest: immutable(i), status: i.status })),
    collection_id: latest?.intent_id ?? null,
    act_id: act,
    target: pc && act ? (a.extraction(pc, act)?.value.timing.boundary.at ?? null) : null,
    task_ids: task
      ? Array.from({ length: 5 }, (_, i) => collectionTaskId("PC_COLLECTION_REACH", task, i))
      : [],
    reach_digest: latest
      ? (a.reach(latest.pc_id, latest.choice.act_id)?.value.task.digest ?? task?.digest ?? null)
      : null,
    held: heldPcCollections({
      get: (k) => c.store.getFact(k),
      has: (k) => c.store.getFact(k) !== undefined,
    }),
  };
}

export async function captureCollection(
  config: PhoneConfig,
  uid: string,
  options: Options = {},
): Promise<CollectionIdentity | null> {
  const opened = await open(config, options);
  if (!opened.ok) return null;
  try {
    return snapshot(opened.value, uid);
  } finally {
    await opened.value.close();
  }
}

const inputOf = (p: PendingOperation) => ({
  source: { world_id: p.options["world"], source_key: p.options["source"] },
  reserve_id: p.options["reserve"],
  quantity: { amount: Number(p.options["amount"]), unit: p.options["quantity-unit"] },
  mechanism_id: p.options["mechanism"],
  basis_id: p.options["basis"],
});

/** A generated intent is recognized by its PRE-DISPATCH UID and exact confirmed arguments, never by 'the latest' choice. */
function originalIntents(session: Session, p: PendingOperation): readonly Intent[] | null {
  const id = p.collection!;
  const all = session.ledger.intents();
  const generated = `operator-intent:${id.uid}`;
  for (const old of id.ledger) {
    const current = all.find((i) => i.intent_id === old.id);
    if (!current || immutable(current) !== old.digest) return null;
  }
  if (
    all.some(
      (i) =>
        !id.ledger.some((old) => old.id === i.intent_id) &&
        (!(p.command === "collect" || p.command === "collect-finish" || p.command === "cease") ||
          i.intent_id !== generated),
    )
  )
    return null;
  if (p.command === "reconcile")
    return all.filter((i) =>
      id.ledger.some((old) => old.id === i.intent_id && old.status === "CONFIRMED"),
    );
  if (p.command === "collect-continue") return all.filter((i) => i.intent_id === id.collection_id);
  if (p.command === "settle-collection-lapse") return [];
  const prior =
    p.command === "collect"
      ? id.ledger.find(
          (i) =>
            i.status === "CONFIRMED" &&
            all.find((v) => v.intent_id === i.id)?.kind === "COLLECTION",
        )
      : p.command === "cease"
        ? id.ledger.find((i) =>
            all.some(
              (v) =>
                v.intent_id === i.id &&
                v.kind === "COLLECTION_CESSATION" &&
                v.choice.act_id === id.act_id,
            ),
          )
        : undefined;
  const intended = all.find((i) => i.intent_id === (prior?.id ?? generated));
  if (!intended) return [];
  if (!("pc_id" in intended) || intended.pc_id !== id.pc_id) return null;
  if (p.command === "collect") {
    if (intended.kind !== "COLLECTION") return null;
    const input = inputOf(p);
    if (
      !canonicalEqual(
        {
          source: intended.choice.source,
          reserve_id: intended.choice.reserve_id,
          quantity: intended.choice.quantity,
          mechanism_id: intended.mechanism_id,
          basis_id: intended.basis_id,
        },
        input,
      )
    )
      return null;
  } else if (p.command === "collect-finish") {
    if (intended.kind !== "PC_TARGET_ADVANCE" || !canonicalEqual(intended.target, id.target))
      return null;
  } else if (p.command === "cease") {
    if (intended.kind !== "COLLECTION_CESSATION" || intended.choice.act_id !== id.act_id)
      return null;
  }
  return [intended];
}

type Evidence = "NONE" | "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
/** The persisted Temporal fact, never the adapter's prospective object derived from an extraction. */
function temporalObject(session: Session, pc: string, act: string) {
  const fact = session.campaign.store.getFact(
    temporalObjectKey(productionExtractionObjectId(pcCollectionRequestId(pc, act))),
  );
  const parsed = TemporalObjectSchema.safeParse(fact?.value);
  return parsed.success ? parsed.data : undefined;
}
function evidence(session: Session, p: PendingOperation, intents: readonly Intent[]): Evidence {
  const a = new PcCollectionAdapter(session.campaign.store);
  const id = p.collection!;
  if (p.command === "settle-collection-lapse") {
    if (id.held.length === 0) return "NONE";
    if (
      session.campaign.store.head().revision === id.revision &&
      id.held.every(({ pcId, actId }) => !a.lapseRecord(pcId, actId))
    )
      return "NONE";
    return id.held.every(({ pcId, actId }) => {
      const occupancy = a.occupancyState(pcId);
      return (
        a.lapseRecord(pcId, actId) &&
        temporalObject(session, pcId, actId)?.next_boundary === null &&
        occupancy.state === "RELEASED" &&
        occupancy.why === "LAPSED" &&
        occupancy.act_id === actId
      );
    })
      ? "COMPLETE"
      : "PARTIAL";
  }
  if (intents.length === 0) return "NONE"; // no retained choice: the operator invokes no owner before retaining it
  if (p.command === "collect-continue") {
    const i = intents[0]!;
    if (i.kind !== "COLLECTION") return "UNAVAILABLE";
    const pc = i.pc_id,
      act = i.choice.act_id;
    const reach = a.reach(pc, act);
    if (reach && (!id.reach_digest || reach.value.task.digest !== id.reach_digest))
      return "UNAVAILABLE";
    const occupancy = a.occupancyState(pc);
    if (reach?.value.verdict === "NOT_REACHABLE" && !a.extraction(pc, act)) return "COMPLETE";
    if (
      a.extraction(pc, act) &&
      a.work(pc, act) &&
      temporalObject(session, pc, act) &&
      occupancy.state !== "NONE" &&
      occupancy.act_id === act
    )
      return "COMPLETE";
    if (occupancy.state === "RELEASED" && occupancy.why === "DENIED" && occupancy.act_id === act)
      return "COMPLETE";
    if (
      !reach &&
      !a.extraction(pc, act) &&
      occupancy.state !== "OPEN" &&
      id.ledger.some((old) => old.id === i.intent_id && old.status === "COMMITTED")
    )
      return "NONE";
    return "PARTIAL";
  }
  let partial = false;
  for (const i of intents) {
    if (i.kind === "COLLECTION") {
      const commitment = a.commitment(i.pc_id, i.choice.act_id);
      const request = a.request(i.pc_id, i.choice.act_id);
      if (!commitment || !request || i.status !== "COMMITTED") partial = true;
      else if (
        commitment.value.pc_id !== i.pc_id ||
        commitment.value.act_id !== i.choice.act_id ||
        !canonicalEqual(commitment.value.intent.quantity, i.choice.quantity) ||
        commitment.value.intent.source.world_id !== i.choice.source.world_id ||
        commitment.value.intent.source.source_key !== i.choice.source.source_key ||
        commitment.value.intent.destination.reserve_id !== i.choice.reserve_id
      )
        return "UNAVAILABLE";
    } else if (i.kind === "COLLECTION_CESSATION") {
      const occupancy = a.occupancyState(i.pc_id);
      if (
        !a.cessation(i.pc_id, i.choice.act_id) ||
        !a.termination(i.pc_id, i.choice.act_id) ||
        temporalObject(session, i.pc_id, i.choice.act_id)?.next_boundary !== null ||
        occupancy.state !== "RELEASED" ||
        occupancy.why !== "TERMINATED" ||
        occupancy.act_id !== i.choice.act_id ||
        i.status !== "COMMITTED"
      )
        partial = true;
    } else if ("transaction" in i) {
      const transaction = session.campaign.store.getFact(
        temporalTransactionKey(i.transaction.transaction_id),
      );
      if (!transaction || i.status !== "COMMITTED") partial = true;
    } else return "UNAVAILABLE";
  }
  return partial ? "PARTIAL" : "COMPLETE";
}

function report(results: readonly CommandResult[], env: CliEnvironment): number {
  let code = 0;
  for (const r of results) {
    env.out?.(`STATUS ${r.status}`);
    env.out?.(r.message);
    code = Math.max(
      code,
      /OUTCOME_UNKNOWN$|^RECONCILIATION_REQUIRED$/.test(r.status)
        ? 4
        : r.status === "DECLINED"
          ? 2
          : /COMMITTED$|^NOTHING_TO_RECONCILE$/.test(r.status)
            ? 0
            : 3,
    );
  }
  return code;
}

/** Same shipped operator commands, under one session lock. No choice is manufactured; only their existing trusted newId seam is used. */
export async function runCollectionOperation(
  config: PhoneConfig,
  p: PendingOperation,
  env: CliEnvironment,
  recovering = false,
  options: Options = {},
): Promise<number> {
  const blocked = (why: string) => {
    env.out?.(`RECOVERY BLOCKED: ${why}`);
    return 4;
  };
  if (!p.collection) return blocked("the original collection identity was not recorded");
  if (
    env.ordinaryAction &&
    (recovering || env.ordinaryAction.operationId !== p.run_id || p.collection.uid !== p.run_id)
  )
    return blocked("the ordinary-action capability does not belong to this dispatch");
  const opened = await open(config, options);
  if (!opened.ok)
    return blocked(`the original campaign/ledger is unavailable (${opened.error.code})`);
  const session = opened.value;
  let completed: boolean;
  try {
    const current = snapshot(session, p.collection.uid);
    if (!recovering && !canonicalEqual(current, p.collection))
      return blocked("the operation's captured context changed before dispatch");
    // the trusted dispatch_ref of a DELAYED collection rides only with the capability minted for it; recovery never starts a collection
    if (p.dispatch && (recovering || !env.ordinaryAction || p.command !== "collect"))
      return blocked("a delayed dispatch can only be started by its own capability");
    const ctx = {
      session,
      ...(!recovering && env.ordinaryAction ? { ordinaryAction: env.ordinaryAction } : {}),
      ...(!recovering && p.dispatch ? { dispatchRef: p.dispatch.dispatch_ref } : {}),
      terminal: env.terminal!,
      newId: () => p.collection!.uid,
      ...(recovering
        ? {}
        : collectionRefereeHosts({
            stateDir: config.operatorDir,
            campaignId: config.campaignId,
            operatorUid: session.operator.uid,
            polls: Number(p.options["referee-wait"] ?? "600") * 2,
            pollMs: 500,
          })),
    };
    if (!recovering) {
      const results =
        p.command === "collect"
          ? [await collect(ctx, inputOf(p))]
          : p.command === "collect-continue"
            ? [await collectContinue(ctx)]
            : p.command === "collect-finish"
              ? [await collectFinish(ctx)]
              : p.command === "cease"
                ? [await cease(ctx)]
                : p.command === "settle-collection-lapse"
                  ? [await settleCollectionLapse(ctx)]
                  : await reconcile(ctx);
      const code = report(results, env);
      if (session.isAmbiguous) return 4;
      // A deterministic refusal can still follow earlier owner writes (e.g. reach/representation before occupancy registration).
      // The command's status is not proof that the whole operation is settled, even on the first dispatch.
      const originals = originalIntents(session, p);
      const settled = originals && evidence(session, p, originals);
      if (settled !== "NONE" && settled !== "COMPLETE")
        return blocked("the dispatched operation's owner records remain incomplete");
      return code;
    }
    const originals = originalIntents(session, p);
    if (!originals) return blocked("the retained choices no longer match the original operation");
    const ev = evidence(session, p, originals);
    if (ev === "UNAVAILABLE")
      return blocked("the original operation has no supported canonical proof");
    if (ev === "NONE" || ev === "COMPLETE") {
      env.out?.(
        `owner readback: the original operation is ${ev === "NONE" ? "without a committed effect" : "settled and verified"}`,
      );
      return 0;
    }
    if (p.command !== "settle-collection-lapse" && current.pc_id !== p.collection.pc_id)
      return blocked("the original character binding changed");
    // Continuing/settling never gets to select a different act, basis or held lineage. A retained reach is required: recovery never asks a referee.
    if (p.command === "collect-continue") {
      if (
        current.collection_id !== p.collection.collection_id ||
        current.temporal !== p.collection.temporal
      )
        return blocked("the original collection or canonical basis changed");
      const i = originals[0];
      if (
        i?.kind !== "COLLECTION" ||
        !new PcCollectionAdapter(session.campaign.store).reach(i.pc_id, i.choice.act_id)
      )
        return blocked(
          "the original continuation has no retained reach decision; recovery cannot ask the referee",
        );
      report([await collectContinue(ctx)], env);
    } else if (p.command === "settle-collection-lapse") {
      if (
        current.temporal !== p.collection.temporal ||
        !canonicalEqual(current.held, p.collection.held)
      )
        return blocked("the original held lineage changed");
      report([await settleCollectionLapse(ctx)], env);
    } else {
      // The existing reconciler may see ONLY this operation's still-confirmed identities. It must not settle an unrelated choice.
      if (
        session.ledger
          .intents()
          .some(
            (i) => i.status === "CONFIRMED" && !originals.some((o) => o.intent_id === i.intent_id),
          )
      )
        return blocked("an unrelated confirmed choice prevents this operation's reconciliation");
      report(await reconcile(ctx), env);
    }
    completed = !session.isAmbiguous;
  } finally {
    await session.close();
  }
  if (!completed) return blocked("the owners reported an uncertain outcome");
  // A fresh owner-verified reopen, not a status string, proves this original operation settled.
  const reopened = await open(config, options);
  if (!reopened.ok) return blocked("the original operation could not be read back");
  try {
    const originals = originalIntents(reopened.value, p);
    if (!originals || evidence(reopened.value, p, originals) !== "COMPLETE")
      return blocked("the original operation's owner records remain incomplete");
    env.out?.("owner readback: the original operation is settled and verified");
    return 0;
  } finally {
    await reopened.value.close();
  }
}

// -- the delayed-action join, read from the version-2 ledger and the owners (read-only) -------------------------------------------

/** What the version-2 ledger and the owners hold about ONE trusted dispatch_ref. Never a match by quantity, shape or recency. */
export type DispatchLink =
  | { readonly kind: "UNAVAILABLE" }
  | {
      readonly kind: "READ";
      /** COLLECTION intents carrying exactly this dispatch_ref (the ledger's uniqueness makes it 0 or 1) */
      readonly withDispatchRef: number;
      readonly intentId: string | null;
      /** the act identity the operator minted into that retained intent */
      readonly actId: string | null;
      /** the act, once the OWNERS hold its commitment (the canonical act this dispatch produced) */
      readonly canonicalActId: string | null;
      /** an open (CONFIRMED) collection that carries NO dispatch_ref: a legacy orphan or an unrelated direct attempt */
      readonly openWithoutDispatchRef: boolean;
    };

export async function readDispatchLink(
  config: PhoneConfig,
  dispatchRef: string,
  options: Options = {},
): Promise<DispatchLink> {
  const opened = await open(config, options);
  if (!opened.ok) return { kind: "UNAVAILABLE" };
  const session = opened.value;
  try {
    if (session.ledger.version !== 2) return { kind: "UNAVAILABLE" };
    const found = session.ledger.collectionsByDispatchRef(dispatchRef);
    const only = found.length === 1 ? found[0]! : null;
    const adapter = new PcCollectionAdapter(session.campaign.store);
    return {
      kind: "READ",
      withDispatchRef: found.length,
      intentId: only?.intent_id ?? null,
      actId: only?.choice.act_id ?? null,
      canonicalActId:
        only && adapter.commitment(only.pc_id, only.choice.act_id) ? only.choice.act_id : null,
      openWithoutDispatchRef: session.ledger
        .collections()
        .some((c) => c.status === "CONFIRMED" && (c.dispatch_ref ?? null) === null),
    };
  } finally {
    await session.close();
  }
}

/**
 * The complete ActionBinding, filled ONCE from the trusted installed Scenario and the owners' own facts at authorized handover. The
 * scenario's reserve, mechanism, basis and quantity unit must AGREE with the actual Production Reserve, the PC's accepted mechanism (with
 * its attested cycle), the extraction basis, the source and the PC's physical locus; the owners' canonical schemas decide compatibility.
 * Anything missing or disagreeing yields null (the request pauses): a binding is never invented or rebound.
 */
export async function readActionBinding(
  config: PhoneConfig,
  scenario: Scenario,
  scope: {
    readonly pc_id: string;
    readonly world_id: string;
    readonly locus_id: string;
    readonly source: { readonly fact_key: string; readonly version: number };
    readonly amount: number;
    readonly until: "start" | "complete";
  },
  options: Options = {},
): Promise<ActionBinding | null> {
  const opened = await open(config, options);
  if (!opened.ok) return null;
  const session = opened.value;
  try {
    const c = session.campaign;
    const adapter = new PcCollectionAdapter(c.store);
    const pc = c.binding()?.value.active_pc.entity_id;
    if (
      !pc ||
      pc !== scenario.player_character ||
      pc !== scope.pc_id ||
      scenario.world !== scope.world_id
    )
      return null;
    const source = c.store.getFact(worldSourceConditionKey(scenario.world, scenario.source));
    const reserve = c.store.getFact(productionReserveKey(scenario.reserve));
    const basis = c.store.getFact(productionExtractionBasisKey(scenario.basis));
    const mechanism = c.store.getFact(pcCollectionMechanismKey(pc, scenario.mechanism));
    const attested = adapter.attestation(pc, scenario.mechanism);
    const custody = c.pcPhysicalLocusCustody(pc);
    if (!source || !reserve || !basis || !mechanism || !attested || !custody) return null;
    const s = source.value as { locality?: { locus?: { entity_id?: string } } };
    const r = reserve.value as { quantity?: { unit?: string } };
    const b = basis.value as { source?: { fact_key?: string; source_key?: string }; unit?: string };
    const k = custody.value.stationary_locus;
    if (
      source.key !== scope.source.fact_key ||
      r.quantity?.unit !== scenario.quantity_unit ||
      b.unit !== scenario.quantity_unit ||
      b.source?.fact_key !== source.key ||
      b.source?.source_key !== scenario.source ||
      s.locality?.locus?.entity_id !== scope.locus_id ||
      k.world.entity_id !== scenario.world ||
      k.locus.entity_id !== scope.locus_id
    )
      return null;
    const pin = (f: { key: string; version: number }) => ({ fact_key: f.key, version: f.version });
    return {
      scenario_hash: sha256Of(scenario),
      pc_id: pc,
      world_id: scope.world_id,
      locus_id: scope.locus_id,
      source: pin(source),
      reserve: pin(reserve),
      mechanism: pin(mechanism),
      basis: pin(basis),
      quantity_unit: scenario.quantity_unit,
      amount: scope.amount,
      until: scope.until,
      as_of_head: String(c.store.head().revision),
    };
  } finally {
    await session.close();
  }
}

/** The digest of a complete binding, as persisted in the launch frame and compared on every recovery. */
export const bindingDigest = (b: ActionBinding): string => bindingHashOf(b);
