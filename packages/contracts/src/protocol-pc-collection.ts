import { z } from "zod";
import { PcCollectionReachTaskSchema } from "./pc-collection.ts";

/**
 * CPAA-C1 v0.2 PROVISIONAL — IM-15 Host Protocol Gateway: the allowlisted, CONFIRMED active-PC direct-collection operations — host-visible
 * contracts. Not ratified; see `pc-collection.ts`.
 *
 * What a host may say is exactly the operation it invokes (plus, for the one judgment, its UNTRUSTED reading). Every request schema is
 * strict and has NO field for a campaign, PC, act, source, amount, destination, mechanism, confirmation, role, permission, boundary,
 * duration, identity, rule, provenance, verdict or result: all of those come from the trusted server-side context or are derived by the
 * owners. The operation names and the three protocol statuses are technical encodings under IM-15 / IM-16 (the sources prescribe no
 * serialization vocabulary); they change no canonical state, owner or authority.
 *
 * What a host may SEE is the minimum protocol status: committed (a transaction status, never extraction, possession, perception or
 * success), unavailable (one refusal for every cause), or unknown outcome (the same request reconciles by identity). The one read
 * returns the bounded, already-committed premises a `role.gm` interpretation needs and nothing else.
 */
export const PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION = "commit_confirmed_pc_collection";
export const PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK = "get_pc_collection_reach_task";
export const PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH = "submit_pc_collection_reach";
export const PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION = "start_confirmed_pc_collection";

export const CommitConfirmedPcCollectionRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION),
});
export const GetPcCollectionReachTaskRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK),
});
/** The host's UNTRUSTED reading, validated in depth by the engine (closed vocabularies, verbatim quotations, a derived verdict). */
export const SubmitPcCollectionReachRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH),
  answer: z.record(z.string(), z.unknown()),
});
export const StartConfirmedPcCollectionRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION),
});

export const PC_COLLECTION_COMMITTED = "COLLECTION_COMMITTED";
export const PcCollectionReceiptSchema = z.strictObject({
  status: z.literal(PC_COLLECTION_COMMITTED),
});
export type PcCollectionReceipt = z.infer<typeof PcCollectionReceiptSchema>;

export const PcCollectionReachTaskReceiptSchema = z.strictObject({
  task: PcCollectionReachTaskSchema,
});
export type PcCollectionReachTaskReceipt = z.infer<typeof PcCollectionReachTaskReceiptSchema>;

export const COLLECTION_UNAVAILABLE = "COLLECTION_UNAVAILABLE";
export const COLLECTION_UNAVAILABLE_MESSAGE = "no collection is available";
export const COLLECTION_OUTCOME_UNKNOWN = "COLLECTION_OUTCOME_UNKNOWN";
export const COLLECTION_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: present the same request again";
