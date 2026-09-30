import type { StageKey } from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";

/**
 * Deterministic identities derived ONLY from the RC-04 StageKey and the caller-supplied transaction
 * identity. Nothing else is an input: not the requested horizon, not a source/input version, not a
 * retry or message count, not an execution slice, not the campaign revision, not wall-clock time. So
 * the same stage always publishes under the same RC-16 group/intent identity, and a retry, a replay, a
 * crash-and-reopen or a repartition reaches the existing receipt rather than a sibling.
 *
 * `stageKey` must already have passed `parseStageKey`, so only its three identity fields are hashed.
 */
export const stageId = (key: StageKey): string => sha256Canonical(key);
export const stageGroupId = (key: StageKey): string => `stage-group:${stageId(key)}`;
export const stageIntentId = (key: StageKey): string => `stage-intent:${stageId(key)}`;

export const transactionGroupId = (transactionId: string): string =>
  `transaction-group:${transactionId}`;
export const transactionIntentId = (transactionId: string): string =>
  `transaction-intent:${transactionId}`;
export const transactionCause = (transactionId: string): string => `transaction:${transactionId}`;
