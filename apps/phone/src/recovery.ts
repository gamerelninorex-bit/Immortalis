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
import { accessEventKey, accessPacketKey, type CanonicalTime } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  observationEventId,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import type { PhoneConfig } from "./config.ts";

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

export interface ObservationIdentity {
  readonly pc_id: string;
  readonly basis: CanonicalTime;
  readonly task_id: string;
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
}

export const pendingPath = (config: PhoneConfig): string =>
  join(config.operatorDir, "chat-pending-operation.json");

export type PendingRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "UNREADABLE" }
  | { readonly kind: "PENDING"; readonly pending: PendingOperation };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

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
      (v["blocker"] !== null && typeof v["blocker"] !== "string")
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
    const first = new RefereeAdjudicationAdapter(c.store).observationTask({
      pc_id: pcId,
      attempt: 0,
    });
    if (!first.ok) return null;
    const basis = first.value.context.observed_at;
    return {
      pc_id: pcId,
      basis,
      task_id: first.value.task_id,
      event_id: observationEventId(pcId, basis),
    };
  } catch {
    return null;
  } finally {
    await c.close().catch(() => undefined);
  }
}

/**
 * What the owners hold for THAT observation (the recorded basis, never the current one): nothing at all; a retained negative reading (the
 * sealed final word at that basis); a retained affirmative reading or an earned event without its sealed packet (a partial write that the
 * same command completes by identity); or the event and packet both formed and the Epistemic owner's own verification clean.
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
    const decision = new RefereeAdjudicationAdapter(c.store).decision(identity.task_id);
    const event = c.store.getFact(accessEventKey(identity.event_id));
    const packet = c.store.getFact(accessPacketKey(identity.event_id, identity.pc_id));
    if (event && packet) {
      const problems = verifyEpistemicIntegrity(c.store);
      return problems.length === 0
        ? { kind: "COMPLETE" }
        : {
            kind: "UNAVAILABLE",
            detail: "the Epistemic owner reports violations over the observation",
          };
    }
    if (event || packet)
      return {
        kind: "PARTIAL",
        detail: event
          ? "the observation event is committed without its sealed packet"
          : "a packet without its event",
      };
    if (decision) {
      return decision.value.verdict === "OBSERVATION_ESTABLISHED"
        ? {
            kind: "PARTIAL",
            detail: "the affirmative reading is retained but no event is committed",
          }
        : { kind: "NEGATIVE" };
    }
    return { kind: "NONE" };
  } catch {
    return { kind: "UNAVAILABLE", detail: "the owner readback failed" };
  } finally {
    await c.close().catch(() => undefined);
  }
}
