import { z } from "zod";
import type { Authority } from "./commit.ts";
import { GM_ADJUDICATION_AUTHORITY } from "./culture-adjudication.ts";
import { Id, Sha256 } from "./ids.ts";
import { canonicalJson } from "./json.ts";
import { fail, ok, type Result } from "./result.ts";
import { CanonicalTimeSchema, timeEquals, type CanonicalTime } from "./temporal.ts";
import { EntityId, PLAYER_CHOICE_AUTHORITY } from "./world-foundation.ts";

/**
 * F-014B package B0: the strict, pure GM waiting REQUEST CONTRACT (docs/f014b/b0-gm-request-contract.md §2.1–§2.5, the
 * source-lock accepted by BLUE's scoped B0 construction brief). It is a separate module (BLUE OSQ-5, option E1): the shared
 * player-only `TransactionContextSchema`, the legacy `ResolutionRequestSchema` and the legacy binders are neither widened nor
 * touched, and this module is deliberately NOT exported from the package index.
 *
 * MECHANISM ONLY. Every function below is a pure function of the values it is handed: it opens nothing, writes nothing, and
 * reads nothing (no clock, no filesystem, no network, no campaign state, no generated build catalogue). Nothing here
 * authenticates a GM, derives a transaction identity, verifies the observed basis against the live canonical clock, decides
 * that a canonical unit is an SI second, judges a catalogue digest, or resolves a trigger reference: success of
 * `parseGmWaitRequest` means "this value has the strict shape and the arithmetic identity holds", never that a request was
 * accepted, qualified or authorized. The later authenticated dispatcher and canonical admission own all of that (contract §3,
 * §6, §8).
 *
 * The only wire facts here are the ones the ratified sources fix: one literal trigger, the GM context pair, an INITIAL and a
 * CONTINUATION variant under one required `gm_wait` member, the singular second/minute/hour conversion and exact integer
 * arithmetic. There is no evaluator-version member, no third phase, and no duration ceiling (OSQ-4, OSQ-7, OSQ-9).
 */

// ---------------------------------------------------------------------------------------------
// Constants and the pairing declaration (§2.1)
// ---------------------------------------------------------------------------------------------

/** The one provisional wire trigger, source-verbatim (OSQ-1: no renaming, case normalization or additional trigger). */
export const GM_INTERPRETED_PC_WAIT = "GM_INTERPRETED_PC_WAIT";
/** The conversion rule literal. */
export const SI_SUBDAY_V1 = "SI_SUBDAY_V1";
/** Exact singular duration literals, nothing else. */
export const GM_WAIT_DURATION_UNITS = ["second", "minute", "hour"] as const;
export type GmWaitDurationUnit = (typeof GM_WAIT_DURATION_UNITS)[number];
export const GM_WAIT_INTERPRETATION_MODES = ["EXPLICIT_DURATION", "GM_ROUTINE_ESTIMATE"] as const;
/** 1 minute = 60 seconds and 1 hour = 3600 seconds; `second` is the identity of the base label. Waiting-only. */
export const SI_SUBDAY_V1_SECONDS = { second: 1, minute: 60, hour: 3600 } as const;

/**
 * Closed classification of a context + trigger kind. `DENY` is this version's verdict on what is admissible now. It is not a
 * permanent prohibition: a request that is not yet lowered is presently unavailable in this prototype.
 */
export type TemporalOriginClass = "GM_WAIT" | "LEGACY_PLAYER" | "DENY";

/** The GM pair, literal and strict. Separate from the shared player-only context, which is not widened. */
export const GmWaitContextSchema = z.strictObject({
  role: z.literal(GM_ADJUDICATION_AUTHORITY.role),
  permission: z.literal(GM_ADJUDICATION_AUTHORITY.permission),
});

/** The player pair, built from the existing constant rather than from the shared schema, so that a future widening of the shared schema cannot widen this table. */
const PlayerPairSchema = z.strictObject({
  role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
  permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
});

const accepts = (schema: z.ZodType, value: unknown): boolean => {
  try {
    return schema.safeParse(value).success;
  } catch {
    return false;
  }
};

/**
 * The single origin-pairing table. Pure and literal: no case folding, no trimming, no inference. Only the exact GM pair with the
 * exact GM trigger is `GM_WAIT`. The player pair keeps whatever separately authorized source rules it already has and is
 * classified `LEGACY_PLAYER` for any other well-formed trigger kind (this module makes no claim of legality for it); the player
 * pair with the GM trigger, every other GM-pair trigger, every mixed pair and every malformed value are `DENY`.
 */
export function temporalOriginPairing(context: unknown, triggerKind: unknown): TemporalOriginClass {
  if (accepts(GmWaitContextSchema, context)) {
    return triggerKind === GM_INTERPRETED_PC_WAIT ? "GM_WAIT" : "DENY";
  }
  if (accepts(PlayerPairSchema, context)) {
    if (triggerKind === GM_INTERPRETED_PC_WAIT) return "DENY";
    return accepts(Id, triggerKind) ? "LEGACY_PLAYER" : "DENY";
  }
  return "DENY";
}

// ---------------------------------------------------------------------------------------------
// Trigger and gm_wait variants (§2.2)
// ---------------------------------------------------------------------------------------------

/** The exclusive literal trigger. `ref` is a strict opaque Id only (OSQ-2): nothing is attributed to it. */
export const GmWaitTriggerSchema = z.strictObject({
  kind: z.literal(GM_INTERPRETED_PC_WAIT),
  ref: Id,
});

/**
 * INITIAL: exactly these seven members, all required, and no other (OSQ-4: no evaluator-version member). The digest is checked
 * for syntax only (64 lowercase hex characters); this module gives it no meaning and treats no value as a proof (OSQ-12).
 */
export const GmWaitInitialSchema = z.strictObject({
  phase: z.literal("INITIAL"),
  duration_value: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  duration_unit: z.enum(GM_WAIT_DURATION_UNITS),
  observed_basis: CanonicalTimeSchema,
  interpretation_mode: z.enum(GM_WAIT_INTERPRETATION_MODES),
  conversion_rule_version: z.literal(SI_SUBDAY_V1),
  catalogue_sha256: Sha256,
});
export type GmWaitInitial = z.infer<typeof GmWaitInitialSchema>;

/** CONTINUATION: exactly two members. No basis, duration, mode, rule or digest member. */
export const GmWaitContinuationSchema = z.strictObject({
  phase: z.literal("CONTINUATION"),
  from_transaction: EntityId,
});
export type GmWaitContinuation = z.infer<typeof GmWaitContinuationSchema>;

/** Two discriminated variants under the one `gm_wait` member. PAUSED, INTERRUPTED and RESUME are presently unavailable (not yet lowered). */
export const GmWaitSchema = z.discriminatedUnion("phase", [
  GmWaitInitialSchema,
  GmWaitContinuationSchema,
]);
export type GmWait = z.infer<typeof GmWaitSchema>;

// ---------------------------------------------------------------------------------------------
// The GM request envelope (§2.3)
// ---------------------------------------------------------------------------------------------

/** A GM wait has a non-null target and a null condition in both phases. Stricter than the legacy requested shape. */
export const GmWaitRequestedSchema = z.strictObject({
  target: CanonicalTimeSchema,
  condition: z.null(),
});

/**
 * Shape only. There is NO object-level refinement, so a later consumer may still `.pick` this schema; the cross-field rules are
 * in `parseGmWaitRequest`. `cause` and `publication` are strict typed fields with no default (OSQ-3), and `transaction_id` is
 * checked for shape only because its derivation is the adapter's (OSQ-10). The type name says nothing about admission,
 * eligibility, authentication or SI qualification on purpose.
 */
export const GmWaitResolutionRequestShapeSchema = z.strictObject({
  transaction_id: EntityId,
  cause: Id,
  trigger: GmWaitTriggerSchema,
  continues: EntityId.nullable(),
  requested: GmWaitRequestedSchema,
  context: GmWaitContextSchema,
  publication: z.strictObject({ basis: Id, secrecy: Id }),
  gm_wait: GmWaitSchema,
});
export type GmWaitRequestShape = z.infer<typeof GmWaitResolutionRequestShapeSchema>;

// ---------------------------------------------------------------------------------------------
// SI_SUBDAY_V1 conversion and safe arithmetic (§2.4)
// ---------------------------------------------------------------------------------------------

/**
 * target = basis + value * factor[unit], in canonical coordinate units, with the basis unit carried verbatim: never mapped,
 * never inferred from its spelling, and never read as seconds here. Exactness is `Number.isSafeInteger` on both the product and
 * the sum: IEEE rounding is monotonic, so any exact result above 2^53-1 rounds to at least 2^53 and fails the guard, and any
 * result at or below 2^53-1 is exact. The only bounds are those of the existing `CanonicalTimeSchema` and a duration of at least
 * one; there is no other cap.
 */
export function siSubdayV1Target(
  basis: CanonicalTime,
  value: number,
  unit: GmWaitDurationUnit,
): Result<CanonicalTime, "INPUT_INVALID"> {
  const parsedBasis = CanonicalTimeSchema.safeParse(basis);
  if (!parsedBasis.success)
    return fail("INPUT_INVALID", "the observed basis is not a canonical time");
  if (!Object.hasOwn(SI_SUBDAY_V1_SECONDS, unit)) {
    return fail("INPUT_INVALID", "the duration unit is not a singular second, minute or hour");
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    return fail("INPUT_INVALID", "the duration is not a positive exact integer");
  }
  const converted = value * SI_SUBDAY_V1_SECONDS[unit];
  const target = parsedBasis.data.value + converted;
  if (!Number.isSafeInteger(converted) || !Number.isSafeInteger(target) || converted < 1) {
    return fail("INPUT_INVALID", "the derived target is not representable");
  }
  return ok({ unit: parsedBasis.data.unit, value: target });
}

// ---------------------------------------------------------------------------------------------
// Cross-field rules and the composed parser (§2.5)
// ---------------------------------------------------------------------------------------------

const issues = (error: z.ZodError): string[] =>
  error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/** Reads one property of a possibly hostile value without ever throwing. */
const peek = (value: unknown, key: string): unknown => {
  try {
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
};

function parseUnguarded(raw: unknown): Result<GmWaitRequestShape, "INPUT_INVALID"> {
  // 1. the pairing, before any shape work: nothing but the GM pair with the GM trigger goes further
  if (
    temporalOriginPairing(peek(raw, "context"), peek(peek(raw, "trigger"), "kind")) !== "GM_WAIT"
  ) {
    return fail(
      "INPUT_INVALID",
      "the context and trigger are not the one admissible GM waiting pairing",
      { reason: "ORIGIN_PAIRING_DENIED" },
    );
  }
  // 2. the strict shape, on a copy: the returned value is zod's own output, never the caller's object
  const parsed = GmWaitResolutionRequestShapeSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("INPUT_INVALID", "GM wait request failed validation", {
      issues: issues(parsed.error),
    });
  }
  const req = parsed.data;
  const gm = req.gm_wait;
  if (gm.phase === "INITIAL") {
    // 3. an INITIAL continues nothing
    if (req.continues !== null) {
      return fail("INPUT_INVALID", "an INITIAL GM wait must not continue another transaction");
    }
    // 5. the request-validation leg of the arithmetic identity: the target is the derivation, in unit and in value
    const derived = siSubdayV1Target(gm.observed_basis, gm.duration_value, gm.duration_unit);
    if (!derived.ok) return derived;
    if (!timeEquals(req.requested.target, derived.value)) {
      return fail(
        "INPUT_INVALID",
        "the requested target is not the SI_SUBDAY_V1 derivation of the observed basis and duration",
      );
    }
    return ok(req);
  }
  // 4. a CONTINUATION names the transaction it continues, twice, and is never that transaction
  if (req.continues === null) {
    return fail("INPUT_INVALID", "a CONTINUATION must name the transaction it continues");
  }
  if (req.continues !== gm.from_transaction) {
    return fail("INPUT_INVALID", "a CONTINUATION must continue exactly its from_transaction");
  }
  if (req.transaction_id === gm.from_transaction) {
    return fail("INPUT_INVALID", "a continuing transaction is never the held one");
  }
  return ok(req);
}

/**
 * The composed pure parser. The steps run in order and stop at the first refusal: pairing, strict shape, then the cross-field
 * rules. It never throws, and it reads nothing: the verdict depends on the presented value alone. Success is a shape and
 * arithmetic verdict only; see the module comment.
 */
export function parseGmWaitRequest(raw: unknown): Result<GmWaitRequestShape, "INPUT_INVALID"> {
  try {
    return parseUnguarded(raw);
  } catch {
    return fail("INPUT_INVALID", "the request could not be read as plain data");
  }
}

/**
 * Pure comparison of a CONTINUATION's link against a held-state value the caller supplies: the request must be a CONTINUATION
 * whose `continues` equals its `from_transaction`, and the supplied held state must name that same transaction. Returns why not,
 * or null.
 */
export function gmContinuationLinkViolation(
  req: Pick<GmWaitRequestShape, "continues" | "gm_wait">,
  held: { readonly from_transaction: string } | null,
): string | null {
  if (req.gm_wait.phase !== "CONTINUATION")
    return "only a CONTINUATION carries a link to a held transaction";
  if (req.continues === null || req.continues !== req.gm_wait.from_transaction) {
    return "a CONTINUATION must continue exactly its from_transaction";
  }
  if (!held) return "no continuation is held";
  if (held.from_transaction !== req.continues) {
    return "a continuing transaction must consume exactly the persisted continuation";
  }
  return null;
}

/**
 * The continuation-context rule: given the sealed prior transaction's context and the current request's context, require strict
 * equality of role and of permission, and nothing else (no trigger, cause, transport or publication equality). It is an
 * additional, independent requirement and never replaces the existing target/condition predicate, which both branches of a
 * held continuation still need. A context that is not a string pair on both sides is refused rather than compared.
 */
export function continuationContextViolation(
  prior: { readonly context: Authority },
  current: { readonly context: Authority },
): string | null {
  const a = prior.context;
  const b = current.context;
  const isPair = (c: Authority): boolean =>
    typeof c === "object" &&
    c !== null &&
    typeof c.role === "string" &&
    typeof c.permission === "string";
  if (!isPair(a) || !isPair(b))
    return "a continuation's role and permission context must be a pair";
  if (a.role !== b.role || a.permission !== b.permission) {
    return "a continuation must be stated under exactly the role and permission of the transaction it continues";
  }
  return null;
}

/**
 * Same-identity conflict: true unless the two requests are identical over every field, including `gm_wait` and `publication`
 * (canonical JSON, so key order is irrelevant). A value that cannot be canonicalized conflicts.
 */
export function gmWaitSameIdConflict(
  persisted: GmWaitRequestShape,
  presented: GmWaitRequestShape,
): boolean {
  try {
    return canonicalJson(persisted) !== canonicalJson(presented);
  } catch {
    return true;
  }
}
