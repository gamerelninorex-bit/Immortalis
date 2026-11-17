import { z } from "zod";
import { Id, Sha256 } from "./ids.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * S-4 initial Standing Instruction ledger — executable contract (BLUE S-4 Initial Ledger Scoped Hard Preflight PASS & Pinned
 * Construction Brief, Part B1). A BLUE TECHNICAL ENCODING of the ratified S-4 v0.4 §§1, 4, 5, 7 (S-4a, S-4c, S-4d/L-2): the spellings
 * below implement those clauses and add none.
 *
 * What the ledger IS: a durable, tamper-checked, PC-owned (`pc_existence`, a separate NON-INTRINSIC facet, unrelated to the intrinsic
 * `existence_contract`) carrier in which Standing Instructions can LATER be recorded. It is one immutable, content-addressed version
 * plus one advancing head that points at it. In this first package the version is always the EMPTY sequence-1 witness: `instructions`
 * is the empty array and `previous` is the explicit `null`. They are distinct required values, and there is no field in which an
 * instruction, a Class-2 interpretation, an amendment, a revocation, a player-authorship claim, a movement, a collection or a
 * cessation could be stated.
 *
 * What an empty witness SAYS: only that this carrier had no instruction enrolled under this specific source at this cut. It is
 * engine closure evidence, never a statement that the player has no intentions, promises or older fictional directions, and it is
 * never PLAYER-AUTHORED.
 *
 * Foreign facts are referenced by exact key, exact version and the identity of the commit that wrote them; they are never copied
 * (RC-02 guard). There is no timestamp, session, nonce or second chronology: ordering is the journal's.
 */

export const FACET_PC_STANDING_INSTRUCTION_LEDGER = "standing_instruction_ledger";

/** S-4c: the witness a NEWLY created PC receives, after `world_setup_closure` (where used) and before either binding variant. */
export const LEDGER_ORIGIN_ENGINE_CLOSURE = "ENGINE_ORIGIN_LEDGER_CLOSURE";
/** S-4d / L-2: the prospective witness of an EXISTING bound PC; it rewrites no history and asserts nothing about the past. */
export const LEDGER_ORIGIN_START_OF_LEDGER = "START_OF_LEDGER";

/** The only sequence this package admits. */
export const PC_LEDGER_FIRST_SEQUENCE = 1 as const;

/** `pc/{pc_id}/standing-instruction-ledger/head`: the ONE current head of a PC's ledger (ADVANCING). */
export const pcStandingLedgerHeadKey = (pcId: string): string =>
  `pc/${pcId}/standing-instruction-ledger/head`;
/** `pc/{pc_id}/standing-instruction-ledger/version/{sequence}`: one immutable version (SEALED, create-only). */
export const pcStandingLedgerVersionKey = (pcId: string, sequence: number): string =>
  `pc/${pcId}/standing-instruction-ledger/version/${sequence}`;

const PositiveSafeInteger = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, "must be a safe integer");

/**
 * An exact reference to ONE committed fact: its key, its exact (positive) version and the identity (group and intent) of the commit
 * that wrote it. Admission checks all four against the committed fact, so a copied pin, a stale version or another commit's identity
 * is not a reference to it.
 */
export const LedgerCommittedFactRefSchema = z.strictObject({
  fact_key: Id,
  version: PositiveSafeInteger,
  commit: z.strictObject({ group_id: Id, intent_id: Id }),
});
export type LedgerCommittedFactRef = z.infer<typeof LedgerCommittedFactRefSchema>;

/** The head's typed exact reference to the version it currently points at. */
export const LedgerVersionRefSchema = z.strictObject({
  fact_key: Id,
  version: PositiveSafeInteger,
});
export type LedgerVersionRef = z.infer<typeof LedgerVersionRefSchema>;

export const LedgerOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal(LEDGER_ORIGIN_ENGINE_CLOSURE),
    /** the PC's released Existence Contract, the creation source this witness is qualified by */
    pc_creation: LedgerCommittedFactRefSchema,
    /**
     * The world profile this creation route is qualified against: the SAME world the PC's binding will couple (BLUE exact-HEAD review
     * finding H-1 on PR #107). The closure-or-null below is judged for THIS world, at this group's own commit, in raw admission,
     * historical replay and cold-open verification, never merely when a binding later arrives. The one narrow addition to the origin.
     */
    target_world: LedgerCommittedFactRefSchema,
    /**
     * THE TARGET WORLD'S `world_setup_closure`, and no other world's. Explicitly `null` only where the lawful creation route
     * objectively does not use that setup predicate: that world has NO committed closure at this commit (the group then pins the
     * closure key as absent, read at version 0) and no setup placement anywhere is waiting for one.
     */
    setup_closure: LedgerCommittedFactRefSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal(LEDGER_ORIGIN_START_OF_LEDGER),
    /** the exact prior Role Registry binding, and the identity of the original commit that wrote it */
    operative_binding: LedgerCommittedFactRefSchema,
  }),
]);
export type LedgerOrigin = z.infer<typeof LedgerOriginSchema>;

const versionBody = {
  pc_id: EntityId,
  sequence: z.literal(PC_LEDGER_FIRST_SEQUENCE),
  origin: LedgerOriginSchema,
  /** the honest empty carrier: no instruction is enrolled (an empty array, not an absence) */
  instructions: z.tuple([]),
  /** a first version has no predecessor (an explicit null, not an absence) */
  previous: z.null(),
};

/** A version without its digest: the exact object whose canonical serialization the digest is computed over. */
export const PcStandingLedgerVersionBodySchema = z.strictObject(versionBody);
export type PcStandingLedgerVersionBody = z.infer<typeof PcStandingLedgerVersionBodySchema>;

/**
 * One immutable ledger version. `content_sha256` is the full lowercase SHA-256 of the UTF-8 canonical JSON of the same object
 * WITHOUT `content_sha256` (never of an object that includes its own digest). It is re-derived, never trusted, at admission, on
 * reopen and in historical replay.
 */
export const PcStandingLedgerVersionSchema = z.strictObject({
  ...versionBody,
  content_sha256: Sha256,
});
export type PcStandingLedgerVersion = z.infer<typeof PcStandingLedgerVersionSchema>;

/** The PC's ONE ledger head: the same PC, a typed exact reference to the current version, and exactly that version's digest. */
export const PcStandingLedgerHeadSchema = z.strictObject({
  pc_id: EntityId,
  current: LedgerVersionRefSchema,
  content_sha256: Sha256,
});
export type PcStandingLedgerHead = z.infer<typeof PcStandingLedgerHeadSchema>;

/** What a new-PC initialization names: identities only. The world and locus are the ones the binding will couple. */
export const InitializePcLedgerTargetSchema = z.strictObject({
  pc_id: EntityId,
  world_id: EntityId,
  locus_id: EntityId,
});
export type InitializePcLedgerTarget = z.infer<typeof InitializePcLedgerTargetSchema>;

/** What the L-2 qualifier names: the PC only. The operative binding is read, never supplied. */
export const QualifyLegacyPcLedgerTargetSchema = z.strictObject({ pc_id: EntityId });
export type QualifyLegacyPcLedgerTarget = z.infer<typeof QualifyLegacyPcLedgerTargetSchema>;
