import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  CanonicalTimeSchema,
  EntityId,
  Id,
  PcMovementCommitInputSchema,
  PublicationSchema,
  ResolutionRequestSchema,
  fail,
  ok,
  type Result,
} from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted side's retained confirmed intents.
 *
 * Each player choice the operator confirms is written here, durably, BEFORE the owner path is invoked, so that an ambiguous
 * reply, a lost reply or a crash can be reconciled across processes by the original identity — the exact choice, delivery
 * boundary, transaction identity and provenance that were confirmed — and never by a new one. It is the trusted side's memory of
 * what was confirmed, nothing else: it is not canon, holds no world fact, outcome or knowledge, and is never consulted as
 * authority (the owners and the Temporal kernel re-judge every fact on every invocation, and a retained status is checked
 * against canonical state before it is believed). One file per campaign, in an owner-only directory outside the package, which
 * the package's own residue reporting therefore never sees.
 *
 *   CONFIRMED  the operator confirmed it and it was presented; its outcome is not (yet) known to be committed
 *   COMMITTED  the gateway reported it committed (a transaction status, not an arrival)
 */

export const LEDGER_FORMAT = "immortalis-operator-intents";
export const LEDGER_FORMAT_VERSION = 1;

const Status = z.enum(["CONFIRMED", "COMMITTED"]);
export type IntentStatus = z.infer<typeof Status>;

const Material = PublicationSchema.pick({ cause: true, basis: true, secrecy: true });

const RelocationIntentSchema = z.strictObject({
  kind: z.literal("RELOCATION"),
  seq: z.number().int().positive(),
  intent_id: Id,
  status: Status,
  pc_id: EntityId,
  choice: PcMovementCommitInputSchema,
  delivery_at: CanonicalTimeSchema,
  publication: Material,
});
export type RelocationIntent = z.infer<typeof RelocationIntentSchema>;

const AdvanceTransaction = ResolutionRequestSchema.pick({
  transaction_id: true,
  cause: true,
  trigger: true,
  context: true,
  publication: true,
});

const AdvanceIntentSchema = z.strictObject({
  kind: z.literal("ADVANCE"),
  seq: z.number().int().positive(),
  intent_id: Id,
  status: Status,
  pc_id: EntityId,
  transaction: AdvanceTransaction,
});
export type AdvanceIntent = z.infer<typeof AdvanceIntentSchema>;

const IntentSchema = z.discriminatedUnion("kind", [RelocationIntentSchema, AdvanceIntentSchema]);
export type Intent = z.infer<typeof IntentSchema>;

const LedgerFileSchema = z.strictObject({
  format: z.literal(LEDGER_FORMAT),
  format_version: z.literal(LEDGER_FORMAT_VERSION),
  campaign_id: Id,
  operator_uid: z.number().int().nonnegative(),
  next_seq: z.number().int().positive(),
  intents: z.array(IntentSchema),
});
type LedgerFile = z.infer<typeof LedgerFileSchema>;

export type NewRelocationIntent = Omit<RelocationIntent, "seq" | "status">;
export type NewAdvanceIntent = Omit<AdvanceIntent, "seq" | "status">;

export type LedgerErrorCode =
  | "LEDGER_UNREADABLE"
  | "LEDGER_MALFORMED"
  | "LEDGER_CAMPAIGN_MISMATCH"
  | "LEDGER_OPERATOR_MISMATCH"
  | "LEDGER_CONFLICT"
  | "LEDGER_WRITE_FAILED";

export const ledgerFileName = (campaignId: string): string =>
  `intents-${createHash("sha256").update(campaignId, "utf8").digest("hex").slice(0, 32)}.json`;

export class IntentLedger {
  readonly #fs: FsOps;
  readonly #path: string;
  #file: LedgerFile;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(fs: FsOps, path: string, file: LedgerFile) {
    this.#fs = fs;
    this.#path = path;
    this.#file = file;
  }

  /**
   * Reads the campaign's ledger or starts an empty one in memory (nothing is written until the first intent). A file that is not
   * exactly this format, or that belongs to another campaign or operator, is refused and never repaired or adopted.
   */
  static async open(params: {
    readonly dir: string;
    readonly campaignId: string;
    readonly operatorUid: number;
    readonly fs?: FsOps;
  }): Promise<Result<IntentLedger, LedgerErrorCode>> {
    const fs = params.fs ?? nodeFs;
    const path = join(params.dir, ledgerFileName(params.campaignId));
    let raw: string | undefined;
    try {
      if ((await fs.fileSize(path)) !== null) raw = (await fs.readFile(path)).toString("utf8");
    } catch {
      return fail("LEDGER_UNREADABLE", "the retained intents cannot be read");
    }
    if (raw === undefined) {
      return ok(
        new IntentLedger(fs, path, {
          format: LEDGER_FORMAT,
          format_version: LEDGER_FORMAT_VERSION,
          campaign_id: params.campaignId,
          operator_uid: params.operatorUid,
          next_seq: 1,
          intents: [],
        }),
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail("LEDGER_MALFORMED", "the retained intents are not valid");
    }
    const parsed = LedgerFileSchema.safeParse(json);
    if (!parsed.success) return fail("LEDGER_MALFORMED", "the retained intents are not valid");
    const file = parsed.data;
    if (file.campaign_id !== params.campaignId)
      return fail("LEDGER_CAMPAIGN_MISMATCH", "the retained intents belong to another campaign");
    if (file.operator_uid !== params.operatorUid)
      return fail("LEDGER_OPERATOR_MISMATCH", "the retained intents belong to another operator");
    const seqs = file.intents.map((i) => i.seq);
    const ids = new Set(file.intents.map((i) => i.intent_id));
    const relocations = file.intents.filter((i) => i.kind === "RELOCATION");
    if (
      new Set(seqs).size !== seqs.length ||
      ids.size !== file.intents.length ||
      relocations.length > 1 ||
      seqs.some((s) => s >= file.next_seq)
    )
      return fail("LEDGER_MALFORMED", "the retained intents are not valid");
    return ok(new IntentLedger(fs, path, file));
  }

  intents(): readonly Intent[] {
    return structuredClone(this.#file.intents);
  }

  relocation(): RelocationIntent | undefined {
    return this.intents().find((i): i is RelocationIntent => i.kind === "RELOCATION");
  }

  advances(): readonly AdvanceIntent[] {
    return this.intents().filter((i): i is AdvanceIntent => i.kind === "ADVANCE");
  }

  /** Durably retains a newly confirmed intent as CONFIRMED. Identities are unique; a campaign holds at most one relocation. */
  record(intent: NewRelocationIntent | NewAdvanceIntent): Promise<Result<Intent, LedgerErrorCode>> {
    return this.#serial(async () => {
      const taken = this.#file.intents;
      if (taken.some((i) => i.intent_id === intent.intent_id))
        return fail("LEDGER_CONFLICT", "that intent identity is already retained");
      if (intent.kind === "RELOCATION" && taken.some((i) => i.kind === "RELOCATION"))
        return fail("LEDGER_CONFLICT", "a relocation is already retained for this campaign");
      const next = IntentSchema.safeParse({
        ...intent,
        seq: this.#file.next_seq,
        status: "CONFIRMED",
      });
      if (!next.success) return fail("LEDGER_MALFORMED", "the intent is not valid");
      return this.#commit(
        { ...this.#file, next_seq: this.#file.next_seq + 1, intents: [...taken, next.data] },
        next.data,
      );
    });
  }

  /**
   * Replaces the one retained relocation with a newly confirmed one in a single durable write, so that no crash can leave the
   * campaign with neither (or both). Only the relocation may be replaced, and only by another relocation.
   */
  replaceRelocation(
    oldIntentId: string,
    intent: NewRelocationIntent,
  ): Promise<Result<Intent, LedgerErrorCode>> {
    return this.#serial(async () => {
      const taken = this.#file.intents;
      const old = taken.find((i) => i.intent_id === oldIntentId);
      if (!old || old.kind !== "RELOCATION")
        return fail("LEDGER_CONFLICT", "no such retained relocation");
      if (taken.some((i) => i.intent_id === intent.intent_id))
        return fail("LEDGER_CONFLICT", "that intent identity is already retained");
      const next = IntentSchema.safeParse({
        ...intent,
        seq: this.#file.next_seq,
        status: "CONFIRMED",
      });
      if (!next.success) return fail("LEDGER_MALFORMED", "the intent is not valid");
      return this.#commit(
        {
          ...this.#file,
          next_seq: this.#file.next_seq + 1,
          intents: [...taken.filter((i) => i.intent_id !== oldIntentId), next.data],
        },
        next.data,
      );
    });
  }

  markCommitted(intentId: string): Promise<Result<Intent, LedgerErrorCode>> {
    return this.#serial(async () => {
      const found = this.#file.intents.find((i) => i.intent_id === intentId);
      if (!found) return fail("LEDGER_CONFLICT", "no such retained intent");
      const next: Intent = { ...found, status: "COMMITTED" };
      return this.#commit(
        {
          ...this.#file,
          intents: this.#file.intents.map((i) => (i.intent_id === intentId ? next : i)),
        },
        next,
      );
    });
  }

  /** Forgets an intent that provably had no effect. Never called for an intent with any canonical footprint. */
  discard(intentId: string): Promise<Result<null, LedgerErrorCode>> {
    return this.#serial(async () => {
      if (!this.#file.intents.some((i) => i.intent_id === intentId)) return ok(null);
      const committed = await this.#commit(
        { ...this.#file, intents: this.#file.intents.filter((i) => i.intent_id !== intentId) },
        null,
      );
      return committed.ok ? ok(null) : committed;
    });
  }

  async #commit<T>(next: LedgerFile, value: T): Promise<Result<T, LedgerErrorCode>> {
    try {
      await this.#fs.writeFileDurable(this.#path, `${JSON.stringify(next, null, 2)}\n`);
    } catch {
      // the write may or may not have landed; this process stops trusting its in-memory copy
      return fail("LEDGER_WRITE_FAILED", "the retained intents could not be written");
    }
    this.#file = next;
    return ok(value);
  }

  #serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(run);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}
