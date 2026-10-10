import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { Id, fail, ok, type Result } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted side's retained identity of the ONE locality setup an operator confirmed for a campaign (BLUE F60-R1).
 *
 * The standard package is created empty, so between its creation and the first World-State commit the package itself holds nothing
 * that says WHICH setup was confirmed. Without a retained marker a different, individually valid setup offered after an interruption in
 * that window would be indistinguishable from a first choice. This file is that marker: it is created exclusively and durably AFTER the confirmation
 * and BEFORE the package is created, lives in the same owner-only retained-state directory as the retained intents (outside the
 * package, so the package's own residue reporting never sees it), and holds nothing but the setup identity (a content hash).
 *
 * It is the trusted side's memory of what was confirmed — not canon, not authority, never consulted instead of the owners (committed
 * facts are always re-judged against canon) — and it is never rewritten: a campaign has one confirmed setup identity, and a different
 * one is refused. It is kept apart from the retained intents on purpose: those are the movement/time choices `reconcile` replays and
 * `RECONCILIATION_REQUIRED` gates on, and a confirmed locality setup is neither.
 */

export const LOCALITY_PIN_FORMAT = "immortalis-operator-locality-setup-pin";
export const LOCALITY_PIN_FORMAT_VERSION = 1;

const PinFileSchema = z.strictObject({
  format: z.literal(LOCALITY_PIN_FORMAT),
  format_version: z.literal(LOCALITY_PIN_FORMAT_VERSION),
  campaign_id: Id,
  operator_uid: z.number().int().nonnegative(),
  setup_id: z.string().regex(/^[0-9a-f]{32}$/),
});

export type PinErrorCode =
  | "PIN_UNREADABLE"
  | "PIN_MALFORMED"
  | "PIN_CAMPAIGN_MISMATCH"
  | "PIN_OPERATOR_MISMATCH"
  | "PIN_CONFLICT"
  | "PIN_WRITE_FAILED";

export interface PinParams {
  readonly dir: string;
  readonly campaignId: string;
  readonly operatorUid: number;
  readonly fs?: FsOps;
}

export const pinFileName = (campaignId: string): string =>
  `locality-setup-${createHash("sha256").update(campaignId, "utf8").digest("hex").slice(0, 32)}.json`;

/** The retained setup identity of this campaign, or null when none was retained. A file that is not exactly this format, or is another campaign's or operator's, is refused and never adopted. */
export async function readPin(p: PinParams): Promise<Result<string | null, PinErrorCode>> {
  const fs = p.fs ?? nodeFs;
  const path = join(p.dir, pinFileName(p.campaignId));
  let raw: string;
  try {
    if ((await fs.fileSize(path)) === null) return ok(null);
    raw = (await fs.readFile(path)).toString("utf8");
  } catch {
    return fail("PIN_UNREADABLE", "the retained setup identity cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("PIN_MALFORMED", "the retained setup identity is not valid");
  }
  const parsed = PinFileSchema.safeParse(json);
  if (!parsed.success) return fail("PIN_MALFORMED", "the retained setup identity is not valid");
  if (parsed.data.campaign_id !== p.campaignId)
    return fail("PIN_CAMPAIGN_MISMATCH", "the retained setup identity belongs to another campaign");
  if (parsed.data.operator_uid !== p.operatorUid)
    return fail("PIN_OPERATOR_MISMATCH", "the retained setup identity belongs to another operator");
  return ok(parsed.data.setup_id);
}

/**
 * Retains `setupId` as the campaign's FIRST-WRITER-WINS identity (BLUE F60-R2). The pin is published by one exclusive create
 * (`O_EXCL`: the file system lets exactly one creator succeed) of the final path, with its complete body, fsynced; there is no
 * read-then-write window, and no writer other than the exclusive winner ever writes the pin, so two simultaneous first writers can
 * never replace one another:
 *
 *   created            this identity is now the retained one (then made directory-durable by the winner alone);
 *   already exists     another writer — or an earlier run — won: read it; the same identity is a no-op, a different one is
 *                      `PIN_CONFLICT`, and a file that is not (yet) a complete valid pin is `PIN_MALFORMED` (the winner may be
 *                      mid-write: fail closed, retry; never overwrite);
 *   any other failure  the create may or may not have landed: `PIN_WRITE_FAILED`, an unknown outcome the caller reports as such
 *                      and the next read resolves.
 *
 * Residual (documented): a process killed in the instant between the create and the write of its body leaves an empty pin, which
 * reads as `PIN_MALFORMED` and is refused, never adopted or replaced. Nothing is created before a pin write returns, so the
 * operator may deliberately remove such a file when no package exists for the campaign.
 */
export async function writePin(
  p: PinParams & { readonly setupId: string },
): Promise<Result<null, PinErrorCode>> {
  const fs = p.fs ?? nodeFs;
  const body = PinFileSchema.parse({
    format: LOCALITY_PIN_FORMAT,
    format_version: LOCALITY_PIN_FORMAT_VERSION,
    campaign_id: p.campaignId,
    operator_uid: p.operatorUid,
    setup_id: p.setupId,
  });
  const path = join(p.dir, pinFileName(p.campaignId));
  const text = `${JSON.stringify(body, null, 2)}\n`;
  try {
    await fs.createExclusive(path, text);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST")
      return fail("PIN_WRITE_FAILED", "the setup identity could not be retained");
    return resolveExisting(p);
  }
  // This writer is the one winner. The exclusive create fsyncs the file but the seam has no directory fsync, so the winner alone
  // re-publishes its own identical bytes durably (temp file, fsync, rename, directory fsync): the content cannot change, no other
  // writer ever reaches this line, and a loser never writes at all.
  try {
    await fs.writeFileDurable(path, text);
  } catch {
    return fail("PIN_WRITE_FAILED", "the setup identity could not be retained");
  }
  return ok(null);
}

/** Another writer (or an earlier run) created the pin first: it is theirs and is never replaced. */
async function resolveExisting(
  p: PinParams & { readonly setupId: string },
): Promise<Result<null, PinErrorCode>> {
  const held = await readPin(p);
  if (!held.ok) return held;
  if (held.value === null)
    return fail("PIN_WRITE_FAILED", "the retained setup identity could not be resolved");
  return held.value === p.setupId
    ? ok(null)
    : fail("PIN_CONFLICT", "a different setup identity is already retained for this campaign");
}
