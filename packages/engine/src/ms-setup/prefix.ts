import {
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  InitialSetupInvocationSchema,
  InitialSetupDispositionSchema,
  REFEREE_OP_I002,
  REFEREE_OP_INITIAL_DELEGATION,
  type OwnerFact,
  type InitialLocalityCompletion,
  type InitialSetupInput,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { scanInitialSetup } from "../initial-setup/admission.ts";
import { msGenesis } from "./protocol.ts";
import { INITIAL_SETUP_INPUT_MS_V3_RULE, INITIAL_LOCALITY_COMPLETION_MS_V3_RULE } from "./rules.ts";

export const isMsInputRule = (rule: unknown): boolean =>
  canonicalEqual(rule, INITIAL_SETUP_INPUT_MS_V3_RULE);
export const isMsCompletionRule = (rule: unknown): boolean =>
  canonicalEqual(rule, INITIAL_LOCALITY_COMPLETION_MS_V3_RULE);
export const MS_PRE_CLOCK_KINDS: ReadonlySet<string> = new Set([
  "world_profile",
  "world_locus",
  "world_source_condition",
  "pc_existence_contract",
  "pc_capability_basis",
  "referee_decision",
  "initial_setup_input",
  "initial_setup_invocation",
  "initial_setup_response",
  "initial_setup_grant",
  "initial_locality_completion",
  "initial_setup_disposition",
  "initial_actor_setup_issue",
  "initial_actor_setup_response",
  "named_actor_existence_basis",
  "actor_setup_placement",
  "world_setup_closure",
]);

/** Shared J-2 predicate, including the accepted session's OWN scene reservation. */
export function msEarlierSessionViolation(
  facts: ReadonlyMap<string, OwnerFact>,
  input: InitialSetupInput,
  accepted: boolean,
): string | null {
  const index = scanInitialSetup(facts);
  for (const session of index.sessions.values()) {
    const parsed = InitialSetupInputSchema.safeParse(session.input.value);
    if (!parsed.success || !isMsInputRule(session.input.provenance.rule))
      return "MS_PRIOR_LEGACY_INPUT";
    const i = parsed.data;
    if (i.world_id !== input.world_id || i.locus_id !== input.locus_id) return "MS_PRIOR_LOCALITY";
    if (accepted && i.setup_id === input.setup_id) continue;
    if (i.scope_fingerprint === input.scope_fingerprint) return "MS_DUPLICATE_FINGERPRINT";
    if (!session.disposition || session.sceneResponse) return "MS_PRIOR_SESSION";
    const disposition = InitialSetupDispositionSchema.safeParse(session.disposition.value);
    if (
      !disposition.success ||
      disposition.data.phase === "SCENE" ||
      disposition.data.reason === "PARKED_UNKNOWN"
    )
      return "MS_PRIOR_SESSION";
  }
  if (index.completion) {
    const c = InitialLocalityCompletionSchema.safeParse(index.completion.value);
    if (!accepted || !c.success || c.data.setup_id !== input.setup_id) return "MS_PRIOR_COMPLETION";
  }
  if (index.sceneReservation) {
    const r = InitialSetupInvocationSchema.safeParse(index.sceneReservation.value);
    if (!accepted || !r.success || r.data.setup_id !== input.setup_id) return "MS_PRIOR_SCENE";
  }
  return null;
}

/** Full actual prefix first; only then use the original GENESIS-only projection. */
export function msPrefixViolation(
  facts: ReadonlyMap<string, OwnerFact>,
  input: InitialSetupInput,
  phase: "PRE_CLOCK" | "B2" = "PRE_CLOCK",
): string | null {
  for (const f of facts.values()) {
    const resolved = resolveKey(f.key);
    if (
      !resolved ||
      !(
        MS_PRE_CLOCK_KINDS.has(resolved.kind.id) ||
        (phase === "B2" && ["temporal_state", "actor_physical_presence"].includes(resolved.kind.id))
      )
    )
      return "MS_PREFIX_KIND";
    const k = resolved.kind;
    if (
      f.owner !== k.owner ||
      f.facet !== k.facet ||
      !k.valueSchema.safeParse(f.value).success ||
      (k.lifecycle === "SEALED" && f.version !== 1)
    )
      return "MS_PREFIX_SOURCE";
    if (
      !canonicalEqual(f.provenance.rule, k.rule) &&
      !k.alternateRules?.some((a) => canonicalEqual(f.provenance.rule, a.rule) && a.admits(f.value))
    )
      return "MS_PREFIX_RULE";
    if (k.id === "referee_decision") {
      const op = (f.value as { operation?: unknown }).operation;
      if (op !== REFEREE_OP_I002 && op !== REFEREE_OP_INITIAL_DELEGATION)
        return "MS_PREFIX_REFEREE";
    }
    if (k.id === "initial_locality_completion" && !isMsCompletionRule(f.provenance.rule))
      return "MS_COMPLETION_ROUTE";
    // All setup and actor evidence belongs to the single accepted locality/session (earlier MS SCOPE sessions separately checked).
    const v = f.value as { world_id?: string; locus_id?: string };
    if (v.world_id !== undefined && v.world_id !== input.world_id) return "MS_PREFIX_WORLD";
    if (v.locus_id !== undefined && v.locus_id !== input.locus_id) return "MS_PREFIX_LOCUS";
  }
  const earlier = msEarlierSessionViolation(facts, input, true);
  if (earlier) return earlier;
  const p = msGenesis(facts);
  if (
    !p.ok ||
    !canonicalEqual(p.value.pins, input.genesis) ||
    p.value.projection_hash !== input.projection_hash
  )
    return "MS_GENESIS_CHANGED";
  return null;
}

export function msCompletionInput(
  facts: ReadonlyMap<string, OwnerFact>,
  c: InitialLocalityCompletion,
): InitialSetupInput | null {
  const f = facts.get(c.input.fact_key);
  const p = InitialSetupInputSchema.safeParse(f?.value);
  return f?.version === c.input.version && isMsInputRule(f.provenance.rule) && p.success
    ? p.data
    : null;
}
