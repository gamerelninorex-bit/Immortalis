import { createHash } from "node:crypto";
import { z } from "zod";
import {
  EntityId,
  Id,
  Text,
  canonicalJson,
  popWorkforceScopeKey,
  worldSceneClosureKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import { PcCollectionAdapter, canonicalEqual } from "@immortalis/engine";
import { onlyOriginalWorlds, readOwnedSetupFile } from "./collection-preparation.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import type { CommandContext, CommandResult } from "./commands.ts";

/**
 * NEWLY AUTHORIZED (CPAA-C1 v0.3 bounded semantic delegation: the Sovereign's words relayed by BLUE on PR #72 comment 6215171891;
 * mission addendum pin 2026-10-16T12:07:41.219Z; independent BLUE review pending; not a frozen-source rule): the setting's AUTHOR
 * declares an ORIGINAL physical setting a closed domain. The author states only what is the author's to state: the domain and its
 * topology, the closure statement, per-source "no encumbrance is established" grounds, and Population's scope statement. Who and what
 * the owners hold at the locus is DERIVED by the owners and re-derived by admission; the declaration can never supply it, and every
 * later change in the owners' facts makes the declaration STALE until the author declares again.
 */
export const CLOSED_SETTING_FORMAT = "immortalis-closed-setting-declaration";
export const ClosedSettingSchema = z.strictObject({
  format: z.literal(CLOSED_SETTING_FORMAT),
  format_version: z.literal(1),
  world_id: EntityId,
  locus_id: EntityId,
  domain: z.strictObject({ designation: Text, topology: Text }),
  closure: z.strictObject({ statement: Text }),
  source_rights: z
    .array(z.strictObject({ source_key: Id, ground: Text }))
    .superRefine((rights, ctx) => {
      if (new Set(rights.map((r) => r.source_key)).size !== rights.length)
        ctx.addIssue({ code: "custom", message: "a source is declared once" });
    }),
  workforce_scope: z.strictObject({ statement: Text }),
});

const unavailable = (message: string): CommandResult => ({ status: "UNAVAILABLE", message });

export async function declareClosedSetting(
  ctx: CommandContext,
  path: string,
): Promise<CommandResult> {
  const { session, terminal } = ctx;
  if (!session.isOpen || session.isAmbiguous) return unavailable("no such action is available");
  const parsed = ClosedSettingSchema.safeParse(readOwnedSetupFile(path));
  if (!parsed.success)
    return {
      status: "INVALID_INPUT",
      message: "the declaration file is not a valid owned closed-setting declaration",
    };
  const d = parsed.data;
  const campaign = session.campaign;
  if (!onlyOriginalWorlds(campaign)) return unavailable("no original domain is established");
  const adapter = new PcCollectionAdapter(campaign.store);
  const authoredRights = d.source_rights
    .map((r) => ({
      source_fact_key: worldSourceConditionKey(d.world_id, r.source_key),
      status: "UNENCUMBERED" as const,
      ground: r.ground,
    }))
    .sort((a, b) => (a.source_fact_key < b.source_fact_key ? -1 : 1));

  // what is already declared and still CURRENT is not declared again (a re-declaration is a new version that re-opens every act)
  const closure = adapter.sceneClosure(d.world_id, d.locus_id);
  const scope = adapter.workforceScope(d.world_id, d.locus_id);
  const closureDone =
    closure !== undefined &&
    campaign.store.getFact(worldSceneClosureKey(d.world_id, d.locus_id)) !== undefined &&
    canonicalEqual(
      {
        domain: closure.value.domain,
        closure: closure.value.closure,
        rights: closure.value.source_rights,
      },
      { domain: d.domain, closure: d.closure, rights: authoredRights },
    ) &&
    adapter.sceneClosureIsCurrent(d.world_id, d.locus_id);
  const scopeDone =
    scope !== undefined &&
    campaign.store.getFact(popWorkforceScopeKey(d.world_id, d.locus_id)) !== undefined &&
    canonicalEqual(scope.value.scope, d.workforce_scope) &&
    adapter.workforceScopeIsCurrent(d.world_id, d.locus_id);
  if (closureDone && scopeDone)
    return {
      status: "SETTING_DECLARED",
      message: "this closed setting is already declared and current",
    };

  const subject = subjectOf({
    campaign_id: session.campaignId,
    declaration: d,
    closure_version: closure?.fact.version ?? 0,
    scope_version: scope?.fact.version ?? 0,
  });
  const confirmation = await requestOperatorConfirmation(
    terminal,
    "declare-closed-setting",
    subject,
    [
      "CLOSED-SETTING DECLARATION — OUT OF CHARACTER; the setting author's own canon, derived coverage added by the owners.",
      JSON.stringify(d, null, 2),
      "You state the domain, its closure, and that no claim on each named source is established. You do NOT state who or what is present: World-State",
      "and Population derive that from the owners' own facts and will treat this declaration as STALE the moment any of them changes.",
      "It is not the player's choice, grants no right beyond the grounds you state, suppresses no independent cause and advances no time.",
      "NEWLY AUTHORIZED under the bounded semantic delegation (independent BLUE review pending).",
    ],
  );
  if (!confirmation) return { status: "DECLINED", message: "not confirmed; nothing was changed" };
  if (!consumeConfirmation(confirmation, "declare-closed-setting", subject))
    return unavailable("no such action is available");

  const digest = createHash("sha256")
    .update(canonicalJson({ campaign_id: session.campaignId, declaration: d }))
    .digest("hex");
  const publication = (step: string, version: number) => ({
    group_id: `closed-setting:${digest}:${step}:v${version}:group`,
    intent_id: `closed-setting:${digest}:${step}:v${version}:intent`,
    cause: `closed-setting:${digest}:${step}:v${version}:cause`,
    basis: "operator-confirmed-closed-setting-declaration",
    secrecy: "local-operator-session",
  });
  const unknown = (code: string) => {
    if (code !== "UNKNOWN_OUTCOME") return false;
    session.markAmbiguous();
    return true;
  };
  if (!closureDone) {
    const written = await adapter.establishSceneClosure({
      ...publication("closure", (closure?.fact.version ?? 0) + 1),
      world_id: d.world_id,
      locus_id: d.locus_id,
      domain: d.domain,
      closure: d.closure,
      source_rights: authoredRights.map((r) => ({
        source_fact_key: r.source_fact_key,
        ground: r.ground,
      })),
    });
    if (!written.ok)
      return unknown(written.error.code)
        ? {
            status: "COLLECTION_OUTCOME_UNKNOWN",
            message: "reopen and present the identical declaration to reconcile it",
          }
        : unavailable("the closed setting could not be declared");
  }
  if (!scopeDone) {
    const written = await adapter.establishWorkforceScope({
      ...publication("scope", (scope?.fact.version ?? 0) + 1),
      world_id: d.world_id,
      locus_id: d.locus_id,
      scope: d.workforce_scope,
    });
    if (!written.ok)
      return unknown(written.error.code)
        ? {
            status: "COLLECTION_OUTCOME_UNKNOWN",
            message: "reopen and present the identical declaration to reconcile it",
          }
        : unavailable("the workforce scope could not be declared");
  }
  return {
    status: "SETTING_DECLARED",
    message:
      "the closed setting is declared; the owners derived its coverage, and any later change to what they hold makes it stale",
  };
}
