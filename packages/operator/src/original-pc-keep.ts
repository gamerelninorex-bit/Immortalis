import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  EntityId,
  ExistenceContractSchema,
  Id,
  fail,
  ok,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted side's durable record that a character was KEPT at the console (BLUE F61-R1, finding 2).
 *
 * Everything a published release carries — its content, its Mirror items, its publication identities — is derivable from public
 * contract content, so the canonical fact alone cannot show WHO accepted it: another privileged caller could publish the same
 * contract under the same names without any Mirror or keep ever having been shown. The proof of the keep is therefore kept where only
 * the trusted side writes: the owner-only retained-state directory (outside the package, the same place and `FsOps` seam as the
 * retained intents and the locality pin), written exclusively and durably AFTER the player's `keep-character` and BEFORE the release,
 * holding the exact kept contract and a random secret that exists nowhere else. Every publication identity this command authors is a
 * keyed digest under that secret, so a release (or binding) published without it cannot carry the identities the command recognises,
 * and a recognised one is only ever what a keep at this console produced.
 *
 * It is the trusted side's memory, not canon and not authority: committed facts are always re-judged against canon, and the record is
 * never rewritten (first writer wins, as the locality pin). It authorises nothing by itself: without the matching canonical release
 * and the player's separate placement confirmation, nothing is bound. Anyone who can write this owner-only directory is the operator
 * (the local OS user who owns the package); no stronger identity is claimed.
 */

export const KEEP_FORMAT = "immortalis-operator-character-keep";
export const KEEP_FORMAT_VERSION = 1;

const KeepFileSchema = z.strictObject({
  format: z.literal(KEEP_FORMAT),
  format_version: z.literal(KEEP_FORMAT_VERSION),
  campaign_id: Id,
  operator_uid: z.number().int().nonnegative(),
  pc_id: EntityId,
  secret: z.string().regex(/^[0-9a-f]{64}$/),
  contract: ExistenceContractSchema,
});
export type KeepRecord = z.infer<typeof KeepFileSchema>;

export type KeepErrorCode =
  | "KEEP_UNREADABLE"
  | "KEEP_MALFORMED"
  | "KEEP_CAMPAIGN_MISMATCH"
  | "KEEP_OPERATOR_MISMATCH"
  | "KEEP_CONFLICT"
  | "KEEP_WRITE_FAILED";

export interface KeepParams {
  readonly dir: string;
  readonly campaignId: string;
  readonly operatorUid: number;
  readonly fs?: FsOps;
}

export const keepFileName = (campaignId: string): string =>
  `character-keep-${createHash("sha256").update(campaignId, "utf8").digest("hex").slice(0, 32)}.json`;

/** A fresh secret for ONE keep. It is drawn here and only here, and never appears in canon. */
export const newKeepSecret = (): string => randomBytes(32).toString("hex");

/** The kept character of this campaign, or null when none was kept. A file that is not exactly this format, or is another campaign's or operator's, is refused and never adopted. */
export async function readKeep(p: KeepParams): Promise<Result<KeepRecord | null, KeepErrorCode>> {
  const fs = p.fs ?? nodeFs;
  const path = join(p.dir, keepFileName(p.campaignId));
  let raw: string;
  try {
    if ((await fs.fileSize(path)) === null) return ok(null);
    raw = (await fs.readFile(path)).toString("utf8");
  } catch {
    return fail("KEEP_UNREADABLE", "the retained keep record cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("KEEP_MALFORMED", "the retained keep record is not valid");
  }
  const parsed = KeepFileSchema.safeParse(json);
  if (!parsed.success) return fail("KEEP_MALFORMED", "the retained keep record is not valid");
  if (parsed.data.campaign_id !== p.campaignId)
    return fail("KEEP_CAMPAIGN_MISMATCH", "the retained keep record belongs to another campaign");
  if (parsed.data.operator_uid !== p.operatorUid)
    return fail("KEEP_OPERATOR_MISMATCH", "the retained keep record belongs to another operator");
  return ok(parsed.data);
}

/**
 * Retains the kept character as the campaign's FIRST-WRITER-WINS keep: one exclusive create of the final path with its complete body,
 * fsynced. An existing record is never replaced: the same record is a no-op, anything else is `KEEP_CONFLICT`. A write whose outcome
 * is unknown (it may or may not have landed) is `KEEP_WRITE_FAILED`; nothing has been released yet, and the next read resolves it.
 */
export async function writeKeep(
  p: KeepParams & {
    readonly record: Omit<KeepRecord, "format" | "format_version" | "campaign_id" | "operator_uid">;
  },
): Promise<Result<null, KeepErrorCode>> {
  const fs = p.fs ?? nodeFs;
  const body = KeepFileSchema.parse({
    format: KEEP_FORMAT,
    format_version: KEEP_FORMAT_VERSION,
    campaign_id: p.campaignId,
    operator_uid: p.operatorUid,
    ...p.record,
  });
  const path = join(p.dir, keepFileName(p.campaignId));
  const text = `${JSON.stringify(body, null, 2)}\n`;
  try {
    await fs.createExclusive(path, text);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST")
      return fail("KEEP_WRITE_FAILED", "the keep could not be retained");
    const held = await readKeep(p);
    if (!held.ok) return held;
    return held.value !== null && canonicalEqual(held.value, body)
      ? ok(null)
      : fail("KEEP_CONFLICT", "a different character was already kept for this campaign");
  }
  // this writer is the one winner: re-publish its own identical bytes durably, solely to make the directory entry durable
  try {
    await fs.writeFileDurable(path, text);
  } catch {
    return fail("KEEP_WRITE_FAILED", "the keep could not be retained");
  }
  return ok(null);
}
