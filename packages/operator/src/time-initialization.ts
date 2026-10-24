import { createHash } from "node:crypto";
import { z } from "zod";
import { CanonicalTimeSchema, Text, canonicalJson } from "@immortalis/contracts";
import { StageProviderRegistry, TemporalCoordinator } from "@immortalis/engine";
import { onlyOriginalWorlds, readOwnedSetupFile } from "./collection-preparation.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import type { CommandContext, CommandResult } from "./commands.ts";

/**
 * NEWLY AUTHORIZED (CPAA-C1 v0.3 bounded semantic delegation: the Sovereign's words relayed by BLUE on PR #72 comment 6215171891;
 * mission addendum pin 2026-10-16T12:07:41.219Z; independent BLUE review pending; not a frozen-source rule): the ORIGIN of a
 * campaign's canonical time is the starting chronology its AUTHOR states — a coordinate in a unit of the author's own choosing and
 * the author's words for what moment it is. The Temporal Foundation leaves the origin undecided and prescribes no unit, so there is no
 * default epoch, no clock and no value a collection or any other result could supply: the author states it, and states it once.
 */
export const STARTING_CHRONOLOGY_FORMAT = "immortalis-starting-chronology";
export const StartingChronologySchema = z.strictObject({
  format: z.literal(STARTING_CHRONOLOGY_FORMAT),
  format_version: z.literal(1),
  time: CanonicalTimeSchema,
  statement: Text,
});

const unavailable = (message: string): CommandResult => ({ status: "UNAVAILABLE", message });

/**
 * Establishes the campaign's canonical-time origin: from an owner-verified setup file the operator wrote, shown back in full for ONE
 * explicit typed confirmation, written once through the Temporal coordinator's own owner operation. The publication identities
 * derive from the campaign and the exact chronology, so the same confirmed chronology replays what committed and finishes what did
 * not; a different chronology meeting an existing origin is refused, and a reopen never resets, rewrites or re-derives it. Establishing
 * the origin advances nothing: it is not the passing of time.
 */
export async function initializeTime(ctx: CommandContext, path: string): Promise<CommandResult> {
  const { session, terminal } = ctx;
  if (!session.isOpen || session.isAmbiguous) return unavailable("no such action is available");
  const parsed = StartingChronologySchema.safeParse(readOwnedSetupFile(path));
  if (!parsed.success)
    return {
      status: "INVALID_INPUT",
      message: "the chronology file is not a valid owned starting chronology",
    };
  const chronology = parsed.data;
  const campaign = session.campaign;
  // the delegated author rule covers an ORIGINAL domain only: a campaign with no world, or with any reference-setting world, has no such author
  if (!onlyOriginalWorlds(campaign)) return unavailable("no original domain is established");
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        campaign_id: session.campaignId,
        time: chronology.time,
        statement: chronology.statement,
      }),
    )
    .digest("hex");
  const publication = {
    group_id: `starting-chronology:${digest}:group`,
    intent_id: `starting-chronology:${digest}:intent`,
    cause: `starting-chronology:${digest}:cause`,
    basis: "operator-confirmed-starting-chronology",
    secrecy: "local-operator-session",
  };
  const coordinator = new TemporalCoordinator(campaign.store, new StageProviderRegistry());
  if (coordinator.state()) {
    // an origin exists: this very chronology's own is replayed; any other origin is never overwritten
    return campaign.store.committedGroup(publication.intent_id)
      ? { status: "TIME_ESTABLISHED", message: "this starting chronology is already established" }
      : unavailable("canonical time already has another origin");
  }
  const subject = subjectOf({ campaign_id: session.campaignId, chronology });
  const confirmation = await requestOperatorConfirmation(terminal, "initialize-time", subject, [
    "STARTING CHRONOLOGY — OUT OF CHARACTER; the origin of this campaign's canonical time, established ONCE.",
    JSON.stringify(chronology, null, 2),
    "These are the setting author's own words and coordinate. Nothing is defaulted or estimated; no time passes by establishing it.",
  ]);
  if (!confirmation) return { status: "DECLINED", message: "not confirmed; nothing was changed" };
  if (!consumeConfirmation(confirmation, "initialize-time", subject))
    return unavailable("no such action is available");
  const written = await coordinator.establishCanonicalTime({
    ...publication,
    time: chronology.time,
  });
  if (written.ok)
    return { status: "TIME_ESTABLISHED", message: "the starting chronology is established" };
  if (written.error.code === "UNKNOWN_OUTCOME") {
    session.markAmbiguous();
    return {
      status: "COLLECTION_OUTCOME_UNKNOWN",
      message: "reopen and present the identical chronology to reconcile it",
    };
  }
  return unavailable("the starting chronology could not be established");
}
