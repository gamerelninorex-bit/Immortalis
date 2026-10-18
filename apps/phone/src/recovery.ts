import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  CanonicalTimeSchema,
  REFEREE_OP_OBSERVATION,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  observationTransactionId,
  temporalTransactionKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  canonicalEqual,
  formObservedPacket,
  observationEventId,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import type { PhoneConfig } from "./config.ts";
import {
  captureCollection,
  runCollectionOperation,
  validCollectionIdentity,
  type CollectionIdentity,
} from "./collection-recovery.ts";

/**
 * The chat adapter's trusted pending-operation record (BLUE R3). A player action that may change canon is written here, atomically and
 * BEFORE it is dispatched, with the identity needed to find out later what became of it; it is removed only when the action ended with a
 * definite outcome or when OWNER-SIDE evidence about THAT action shows it settled. It survives a restart, so a lost confirmed outcome
 * keeps every other mutation blocked until the same operation is resolved. If the record cannot be maintained, nothing is dispatched.
 *
 * It is the adapter's own bookkeeping file in the operator directory (never an owner fact, never model-readable, never a model-written
 * value): it holds only identities and the closed command options the builder already validated.
 */
export const PENDING_FORMAT = "immortalis-chat-pending-operation";

/**
 * How many answers the shipped observation asks a host for at one basis before it gives up (its own bound, mirrored here: a host's answer
 * that is set aside is asked again as the next attempt, and the answer that finally lands is retained under THAT attempt's task identity).
 * A test pins this to the shipped command's own constant.
 */
export const OBSERVATION_ATTEMPTS = 5;

export interface ObservationIdentity {
  readonly pc_id: string;
  readonly basis: CanonicalTime;
  /** the attempt-0 task identity (kept for the record's readers) */
  readonly task_id: string;
  /** the task identity of EVERY attempt the shipped command may ask at this basis, captured together before dispatch */
  readonly task_ids: readonly string[];
  readonly event_id: string;
}

export interface PendingOperation {
  readonly format: typeof PENDING_FORMAT;
  readonly format_version: 1;
  readonly campaign_id: string;
  readonly run_id: string;
  readonly command: string;
  readonly options: Readonly<Record<string, string>>;
  readonly dispatched_at: number;
  /** DISPATCHED: no definite outcome has been recorded (a restart finds it so); UNCERTAIN: the run itself ended unknown */
  readonly state: "DISPATCHED" | "UNCERTAIN";
  /** why it is still blocked, in plain words (null until a recovery attempt fails) */
  readonly blocker: string | null;
  /** the original observation's basis and record identities, captured before dispatch (observation only) */
  readonly identity: ObservationIdentity | null;
  /** The original collection/ledger identities. Absent in older records, which remain blocked rather than being guessed. */
  readonly collection?: CollectionIdentity | null;
}

/** one record per campaign: the operator directory may serve several, and one campaign's block is never another's */
export const pendingPath = (config: PhoneConfig): string =>
  join(config.operatorDir, `chat-pending-operation.${config.campaignId}.json`);

export type PendingRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "UNREADABLE" }
  | { readonly kind: "PENDING"; readonly pending: PendingOperation };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const HEX64 = /^[0-9a-f]{64}$/;
const validIdentity = (v: unknown): boolean =>
  record(v) &&
  typeof v["pc_id"] === "string" &&
  typeof v["event_id"] === "string" &&
  typeof v["task_id"] === "string" &&
  CanonicalTimeSchema.safeParse(v["basis"]).success &&
  Array.isArray(v["task_ids"]) &&
  v["task_ids"].length === OBSERVATION_ATTEMPTS &&
  v["task_ids"].every((t) => typeof t === "string" && HEX64.test(t)) &&
  v["task_ids"][0] === v["task_id"];

export function readPending(config: PhoneConfig): PendingRead {
  let text: string;
  try {
    text = readFileSync(pendingPath(config), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "NONE" }
      : { kind: "UNREADABLE" };
  }
  try {
    const v: unknown = JSON.parse(text);
    if (
      !record(v) ||
      v["format"] !== PENDING_FORMAT ||
      v["format_version"] !== 1 ||
      v["campaign_id"] !== config.campaignId ||
      typeof v["run_id"] !== "string" ||
      typeof v["command"] !== "string" ||
      !record(v["options"]) ||
      Object.values(v["options"]).some((x) => typeof x !== "string") ||
      typeof v["dispatched_at"] !== "number" ||
      (v["state"] !== "DISPATCHED" && v["state"] !== "UNCERTAIN") ||
      (v["blocker"] !== null && typeof v["blocker"] !== "string") ||
      !(v["identity"] === null || validIdentity(v["identity"])) ||
      !(
        v["collection"] === undefined ||
        v["collection"] === null ||
        validCollectionIdentity(v["collection"])
      )
    )
      return { kind: "UNREADABLE" };
    return { kind: "PENDING", pending: v as unknown as PendingOperation };
  } catch {
    return { kind: "UNREADABLE" };
  }
}

/** Atomic replace (write a sibling, fsync, rename): a reader sees the old record or the new one, never a torn one. false = not recorded. */
export function writePending(config: PhoneConfig, p: PendingOperation): boolean {
  const target = pendingPath(config);
  const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    mkdirSync(config.operatorDir, { recursive: true, mode: 0o700 });
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(p)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, target);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      // nothing more to do: the record was not maintained
    }
    return false;
  }
}

export function clearPending(config: PhoneConfig): boolean {
  try {
    rmSync(pendingPath(config), { force: true });
    return true;
  } catch {
    return false;
  }
}

// -- owner-side readback of an observation --------------------------------------------------------------------------------------

export type ObservationEvidence =
  | { readonly kind: "NONE" }
  | { readonly kind: "NEGATIVE" }
  | { readonly kind: "PARTIAL"; readonly detail: string }
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "UNAVAILABLE"; readonly detail: string };

/** the seams a test may replace; the defaults read the real campaign through the engine's own owner-verified open */
export interface RecoveryDeps {
  readonly captureObservation?: (
    config: PhoneConfig,
    pcId: string,
  ) => Promise<ObservationIdentity | null>;
  readonly observationEvidence?: (
    config: PhoneConfig,
    identity: ObservationIdentity,
  ) => Promise<ObservationEvidence>;
  readonly completeObservation?: typeof completeObservation;
  readonly captureCollection?: typeof captureCollection;
  readonly runCollection?: typeof runCollectionOperation;
}

const BUILD = "immortalis-chat-recovery";

/**
 * Captures the identity of the observation a dispatch is about to attempt: the character, the canonical basis it would be made at and
 * the task and event identities derived from them. Taken BEFORE the command runs, so a later readback examines the ORIGINAL basis even if
 * the clock has since moved. null (no identity) means nothing may be dispatched.
 */
export async function captureObservation(
  config: PhoneConfig,
  pcId: string,
): Promise<ObservationIdentity | null> {
  const opened = await CanonicalCampaign.open(config.campaignDir, { buildId: BUILD });
  if (!opened.ok) return null;
  const c = opened.value;
  try {
    if (c.store.head().campaign_id !== config.campaignId) return null;
    const adapter = new RefereeAdjudicationAdapter(c.store);
    const taskIds: string[] = [];
    let basis: CanonicalTime | null = null;
    for (let attempt = 0; attempt < OBSERVATION_ATTEMPTS; attempt++) {
      const built = adapter.observationTask({ pc_id: pcId, attempt });
      if (!built.ok) return null;
      basis ??= built.value.context.observed_at;
      taskIds.push(built.value.task_id);
    }
    if (basis === null) return null;
    return {
      pc_id: pcId,
      basis,
      task_id: taskIds[0]!,
      task_ids: taskIds,
      event_id: observationEventId(pcId, basis),
    };
  } catch {
    return null;
  } finally {
    await c.close().catch(() => undefined);
  }
}

/**
 * What the owners hold for THAT observation (the recorded basis, never the current one, read under every attempt's task identity): nothing
 * at all; a retained negative reading (the final word at that basis); a retained affirmative reading, an earned event or a packet without
 * the rest of the formation (a partial write that the same command completes by identity, or fails to and stays blocked); or the event,
 * the packet AND the sealed Temporal transaction all formed with the Epistemic owner's own verification clean.
 */
export async function observationEvidence(
  config: PhoneConfig,
  identity: ObservationIdentity,
): Promise<ObservationEvidence> {
  const opened = await CanonicalCampaign.open(config.campaignDir, { buildId: BUILD });
  if (!opened.ok)
    return { kind: "UNAVAILABLE", detail: `the campaign did not open: ${opened.error.code}` };
  const c = opened.value;
  try {
    if (c.store.head().campaign_id !== config.campaignId)
      return { kind: "UNAVAILABLE", detail: "the campaign identity does not match" };
    const adapter = new RefereeAdjudicationAdapter(c.store);
    // the answer that landed is retained under the task identity of the attempt that produced it: every attempt asked at this basis is read
    const decisions = identity.task_ids.flatMap((id) => {
      const d = adapter.decision(id);
      return d &&
        d.value.operation === REFEREE_OP_OBSERVATION &&
        d.value.campaign_id === config.campaignId &&
        d.value.subject.pc_id === identity.pc_id &&
        canonicalEqual(d.value.input.observed_at, identity.basis)
        ? [d]
        : [];
    });
    const event = c.store.getFact(accessEventKey(identity.event_id));
    const packet = c.store.getFact(accessPacketKey(identity.event_id, identity.pc_id));
    // the sealed Temporal transaction is the last write of packet formation: a packet without it is a formation the same command finishes
    const sealed = c.store.getFact(
      temporalTransactionKey(observationTransactionId(identity.event_id)),
    );
    if (
      event &&
      packet &&
      sealed &&
      decisions.some((d) => d.value.verdict === "OBSERVATION_ESTABLISHED")
    ) {
      const problems = verifyEpistemicIntegrity(c.store);
      return problems.length === 0
        ? { kind: "COMPLETE" }
        : {
            kind: "UNAVAILABLE",
            detail: "the Epistemic owner's integrity check reports violations (store-wide)",
          };
    }
    // the detail is deliberately neutral: it reaches the assistant, and what a half-formed observation holds is sealed referee material
    if (event || packet || sealed)
      return { kind: "PARTIAL", detail: "the observation's owner records are incomplete" };
    if (decisions.some((d) => d.value.verdict === "OBSERVATION_ESTABLISHED"))
      return { kind: "PARTIAL", detail: "the observation's owner records are incomplete" };
    if (decisions.length > 0) return { kind: "NEGATIVE" };
    return { kind: "NONE" };
  } catch {
    return { kind: "UNAVAILABLE", detail: "the owner readback failed" };
  } finally {
    await c.close().catch(() => undefined);
  }
}

/** Complete only the original retained affirmative decision through the existing owner's idempotent formation path. No CLI
 * re-selection of the current basis, confirmation, exchange publication or referee invocation occurs here. */
export async function completeObservation(
  config: PhoneConfig,
  identity: ObservationIdentity,
): Promise<ObservationEvidence> {
  const opened = await CanonicalCampaign.open(config.campaignDir, { buildId: BUILD });
  if (!opened.ok)
    return { kind: "UNAVAILABLE", detail: "the original observation cannot be opened" };
  try {
    const c = opened.value;
    if (c.store.head().campaign_id !== config.campaignId)
      return { kind: "UNAVAILABLE", detail: "the campaign identity does not match" };
    const adapter = new RefereeAdjudicationAdapter(c.store);
    const state = TemporalStateSchema.safeParse(c.store.getFact(TEMPORAL_STATE_KEY)?.value);
    if (
      c.binding()?.value.active_pc.entity_id !== identity.pc_id ||
      !state.success ||
      !canonicalEqual(state.data.canonical_time, identity.basis)
    )
      return { kind: "UNAVAILABLE", detail: "the original character or canonical basis changed" };
    const decisions = identity.task_ids.flatMap((id) => {
      const d = adapter.decision(id);
      return d &&
        d.value.operation === REFEREE_OP_OBSERVATION &&
        d.value.campaign_id === config.campaignId &&
        d.value.subject.pc_id === identity.pc_id &&
        canonicalEqual(d.value.input.observed_at, identity.basis) &&
        d.value.verdict === "OBSERVATION_ESTABLISHED"
        ? [d]
        : [];
    });
    if (decisions.length !== 1)
      return {
        kind: "UNAVAILABLE",
        detail: "the original retained decision cannot be identified uniquely",
      };
    await formObservedPacket(c.store, decisions[0]!.fact.key);
  } catch {
    return { kind: "UNAVAILABLE", detail: "the original observation's owner completion failed" };
  } finally {
    await opened.value.close();
  }
  return observationEvidence(config, identity);
}
