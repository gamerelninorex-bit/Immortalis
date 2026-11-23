import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import { SourceRefSchema } from "./source-ref.ts";
import {
  CanonicalTimeSchema,
  ResolutionTransactionSchema,
  TransactionAuthoritySchema,
} from "./temporal.ts";
import { EntityId, PLAYER_CHOICE_AUTHORITY } from "./world-foundation.ts";

// ---------------------------------------------------------------------------------------------
// F-014B B2 — PROSPECTIVE GM-wait custody (BLUE N7 / Sovereign-ratified D4(e), RED R-5 / R-7e / R-8; mechanism only).
//
// Two NEW registered fact kinds and one strict prospective GM VARIANT of the opening authority and the seal. Nothing here widens
// a legacy shape: `TransactionContextSchema`, `TransactionAuthoritySchema`, `ResolutionRequestSchema` and
// `ResolutionTransactionSchema` above are untouched, a GM-origin value is a separate strict member selected by the literal
// `origin` discriminator, and an old player-pair value never parses as one. These are BLUE's minimal technical lowerings of N7;
// they add no game rule, no second clock, no World-State write and no grant, and no field below has a source-undefined meaning.
//
// Nothing here is a production writer. A marker requires a qualified original-owner preparation that does not exist in this build
// (D3(b) is not adopted), so the production admission refuses every marker; see packages/engine/src/gm-wait-custody.ts.
// ---------------------------------------------------------------------------------------------

/**
 * The prospective GM origin discriminator, equal to the B0 trigger literal. That module (`temporal-gm-wait.ts`) is deliberately not
 * exported from this package and `culture-adjudication.ts` (which holds the GM pair) imports this file, so the two literals are stated
 * here once and a conformance test pins each equal to its B0 / culture source.
 */
export const GM_WAIT_ORIGIN = "GM_INTERPRETED_PC_WAIT";
export const GM_WAIT_CONTEXT = {
  role: "role.gm",
  permission: "permission.rule.adjudicate",
} as const;

/** The strict GM role/permission pair. Separate from the player-only `TransactionContextSchema`, which is not widened. */
export const GmWaitTransactionContextSchema = z.strictObject({
  role: z.literal(GM_WAIT_CONTEXT.role),
  permission: z.literal(GM_WAIT_CONTEXT.permission),
});

const GmWaitTriggerRefSchema = z.strictObject({ kind: z.literal(GM_WAIT_ORIGIN), ref: Id });
/** A GM wait has a non-null target and no condition (B0 §2.3). */
const GmWaitRequestedSchema = z.strictObject({
  target: CanonicalTimeSchema,
  condition: z.null(),
});

export const TEMPORAL_GM_WAIT_KEY_PREFIX = "temporal/gm-wait/";
export const TEMPORAL_GM_WAIT_MARKER_PREFIX = `${TEMPORAL_GM_WAIT_KEY_PREFIX}marker/`;
export const TEMPORAL_GM_WAIT_BY_PC_PREFIX = `${TEMPORAL_GM_WAIT_KEY_PREFIX}by-pc/`;
/** One immutable marker per X, at an addressed key. `x` is lowercase hex SHA-256; a raw RPC id never enters a key. */
export const temporalGmWaitMarkerKey = (x: string): string =>
  `${TEMPORAL_GM_WAIT_MARKER_PREFIX}${x}`;
/** The one authoritative per-PC index key. The registry's key grammar admits only an EntityId segment (no slash, no quote). */
export const temporalGmWaitByPcKey = (pcId: string): string =>
  `${TEMPORAL_GM_WAIT_BY_PC_PREFIX}${pcId}`;

const FactRefSchema_ = z.strictObject({ key: Id, version: Version.min(1), group_id: Id });
const SingleVersionRefSchema = z.strictObject({
  key: Id,
  version: z.literal(1),
  group_id: Id,
});

/** A witness's key, its exact version and the group that committed that version (the original provenance). */
export const GmWaitReadWitnessSchema = FactRefSchema_;
export const GmWaitAbsentWitnessSchema = z.strictObject({ key: Id });

/**
 * N7.1 "qualified original-owner pending receipt/reference/version/digest OR separately authorized quiet variant". Neither exists in
 * the production build (D3(b) is HELD), so no production admission qualifies one. One strict shape names an owner-recorded fact and
 * its digest; `kind` says which of the two source classes that fact claims to be. No value here is a proof: the admission policy
 * decides whether it qualifies, and the production policy qualifies none.
 */
export const GmWaitPreparationSchema = z.strictObject({
  kind: z.enum(["OWNER_PENDING_ENROLMENT", "AUTHORIZED_QUIET"]),
  owner: Id,
  fact: FactRefSchema_,
  digest: Sha256,
});
export type GmWaitPreparation = z.infer<typeof GmWaitPreparationSchema>;

const strictlyAscendingByKey = (
  items: readonly { readonly key: string }[],
  ctx: z.RefinementCtx,
  path: string,
) => {
  items.forEach((w, i) => {
    const prev = items[i - 1];
    if (prev && !(prev.key < w.key)) {
      ctx.addIssue({
        code: "custom",
        message: `${path} are ordered ascending by key with no duplicates`,
        path: [path, i],
      });
    }
  });
};

/**
 * The immutable GM-wait marker (N7.1; `temporal_gm_wait_marker`, key `temporal/gm-wait/marker/<x>`, SEALED, create-only). It binds
 * the original X and request digest, the operative PC and its exact binding, the lawful target, the applicable policy, the current
 * read-version and verified-absence witnesses, the original cause/publication and the qualified preparation. It carries no raw
 * credential (only hashes of the verified session, the serialized request id and the authenticated host), credits no time and opens
 * nothing.
 */
export const GmWaitMarkerSchema = z.strictObject({
  schema_version: z.literal(1),
  origin: z.literal(GM_WAIT_ORIGIN),
  x: Sha256,
  campaign_id: Id,
  pc_id: EntityId,
  pc_binding: z.strictObject({ key: Id, version: Version.min(1), provenance_group_id: Id }),
  original: z.strictObject({
    session_ref_sha256: Sha256,
    rpc_id_serialized_sha256: Sha256,
    authenticated_host_ref_sha256: Sha256,
  }),
  initial_request_sha256: Sha256,
  request: z.strictObject({
    cause: Id,
    trigger: GmWaitTriggerRefSchema,
    requested: GmWaitRequestedSchema,
    gm_context: GmWaitTransactionContextSchema,
    publication: z.strictObject({ basis: Id, secrecy: Id }),
  }),
  policy: z.strictObject({
    catalogue_sha256: Sha256,
    source_rule_ref: SourceRefSchema,
    history_verification_id: Id,
  }),
  preparation: GmWaitPreparationSchema,
  basis: z
    .strictObject({
      canonical_time: CanonicalTimeSchema,
      state_version: Version.min(1),
      read_witnesses: z.array(GmWaitReadWitnessSchema).min(1),
      absent_witnesses: z.array(GmWaitAbsentWitnessSchema),
    })
    .superRefine((b, ctx) => {
      strictlyAscendingByKey(b.read_witnesses, ctx, "read_witnesses");
      strictlyAscendingByKey(b.absent_witnesses, ctx, "absent_witnesses");
    }),
  original_publication: z.strictObject({ group_id: Id, intent_id: Id, cause: Id }),
});
export type GmWaitMarker = z.infer<typeof GmWaitMarkerSchema>;

/**
 * The explicit original-history negative certificate a NO_OPEN carries (N7.3), never an unproven Boolean: the exact Temporal keys
 * (this X's opening authority and its seal) that were absent at the canonical publication cut, and the revision of the state the
 * proof was taken at. The same group also READS each at version 0, so a competing OPEN or seal that publishes first invalidates the
 * NO_OPEN's own witness and neither can win on an earlier preflight.
 */
export const GmWaitNoOpenCertificateSchema = z.strictObject({
  absent: z.tuple([z.strictObject({ key: Id }), z.strictObject({ key: Id })]),
  at_revision: z.number().int().positive(),
});
export type GmWaitNoOpenCertificate = z.infer<typeof GmWaitNoOpenCertificateSchema>;

export const GM_WAIT_INDEX_STATES = ["MARKED", "OPEN", "NO_OPEN", "SEALED_RECONCILED"] as const;
const byPcCommon = {
  schema_version: z.literal(1),
  campaign_id: Id,
  pc_id: EntityId,
  x: Sha256,
  /** the immutable marker of the current X */
  marker: SingleVersionRefSchema,
  /** the version of this very index record that the transition replaced (0 for the first marker of a PC); equals `expected_version` */
  predecessor_index_version: Version,
};
/**
 * The authoritative by-PC index (N7.2, R-7e: the sole carrier of the per-PC GM-wait slot; `temporal_gm_wait_pc_index`, key
 * `temporal/gm-wait/by-pc/<pc>`, ADVANCING). One current X slot, a monotonic expected-version chain, no delete and no reset.
 * Field presence is strictly determined by `state`:
 *   MARKED             open and seal absent
 *   OPEN               opening authority present, seal absent (ACTIVE while no seal exists)
 *   NO_OPEN            terminal for this X; the negative certificate is present, open and seal absent
 *   SEALED_RECONCILED  terminal for this X; opening authority and seal both present
 * A NO_OPEN is never reopened, and a later X may take the key only at the NEXT expected version after a terminal state.
 */
export const GmWaitByPcIndexSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...byPcCommon,
    state: z.literal("MARKED"),
    open_authority: z.null(),
    sealed_result: z.null(),
    terminal_proof: z.null(),
  }),
  z.strictObject({
    ...byPcCommon,
    state: z.literal("OPEN"),
    open_authority: SingleVersionRefSchema,
    sealed_result: z.null(),
    terminal_proof: z.null(),
  }),
  z.strictObject({
    ...byPcCommon,
    state: z.literal("NO_OPEN"),
    open_authority: z.null(),
    sealed_result: z.null(),
    terminal_proof: GmWaitNoOpenCertificateSchema,
  }),
  z.strictObject({
    ...byPcCommon,
    state: z.literal("SEALED_RECONCILED"),
    open_authority: SingleVersionRefSchema,
    sealed_result: SingleVersionRefSchema,
    terminal_proof: z.null(),
  }),
]);
export type GmWaitByPcIndex = z.infer<typeof GmWaitByPcIndexSchema>;
export const gmWaitIndexIsTerminal = (s: GmWaitByPcIndex["state"]): boolean =>
  s === "NO_OPEN" || s === "SEALED_RECONCILED";

/**
 * The strict GM variant of the durable opening authority (`temporal_transaction_authority`, discriminated by `origin`). It repeats
 * the RC-05 opening fields the kernel already owns, under the GM pair and the GM trigger, binds the same X, and is an INITIAL only
 * (`continues` is null: a CONTINUATION, PAUSED RESUME and INTERRUPTED lineage are S4 and are not lowered here).
 */
export const GmWaitTransactionAuthoritySchema = z.strictObject({
  origin: z.literal(GM_WAIT_ORIGIN),
  x: Sha256,
  transaction_id: EntityId,
  cause: Id,
  trigger: GmWaitTriggerRefSchema,
  continues: z.null(),
  opening: z.strictObject({ basis_time: CanonicalTimeSchema, state_version: Version.min(1) }),
  requested: GmWaitRequestedSchema,
  context: GmWaitTransactionContextSchema,
  publication: z.strictObject({ basis: Id, secrecy: Id }),
});
export type GmWaitTransactionAuthority = z.infer<typeof GmWaitTransactionAuthoritySchema>;

/**
 * The strict GM variant of the sealed ResolutionTransaction (`resolution_transaction`, discriminated by `origin`). It applies the
 * very rules of the legacy schema (by running that schema over a projection of this value) and is narrower in two respects. Its outcome is
 * TARGET_REACHED with no remainder and no unresolved dependent: HELD, PAUSED, INTERRUPTED and FRONTIER_CLOSED are S4 stop dispositions that
 * this build does not lower, so a GM seal that would leave a remainder REFUSES rather than being stored as a transaction nothing could continue.
 * And it is the ZERO-STAGE seal: no engaged owner, no crossed boundary, no credited stage and no rule version. An owner stage of a GM wait needs a
 * source witness (a due StageKey of this X declared by its owner) that no ratified source supplies to this build (BLUE F-1), so none is lowered and
 * none can be cited; a seal that names one REFUSES.
 */
export const GmWaitResolutionTransactionSchema = z
  .strictObject({
    origin: z.literal(GM_WAIT_ORIGIN),
    x: Sha256,
    transaction_id: EntityId,
    cause: Id,
    trigger: GmWaitTriggerRefSchema,
    continues: z.null(),
    opening: ResolutionTransactionSchema.shape.opening,
    requested: GmWaitRequestedSchema,
    context: GmWaitTransactionContextSchema,
    engaged: z.tuple([]),
    boundaries_crossed: z.tuple([]),
    stages: z.tuple([]),
    rule_versions: z.tuple([]),
    outcome: z.strictObject({
      actual_stop: CanonicalTimeSchema,
      stop_reason: z.literal("TARGET_REACHED"),
      remainder: z.null(),
      unresolved_dependents: z.tuple([]),
    }),
  })
  .superRefine((t, ctx) => {
    // The cross-field rules are NOT restated here: the legacy schema itself judges the same transaction under the player pair it requires,
    // so a GM-origin seal can never be judged more loosely than a player-origin one, and the two cannot drift apart.
    const legacy = ResolutionTransactionSchema.safeParse({
      transaction_id: t.transaction_id,
      cause: t.cause,
      trigger: t.trigger,
      continues: t.continues,
      opening: t.opening,
      requested: t.requested,
      context: {
        role: PLAYER_CHOICE_AUTHORITY.role,
        permission: PLAYER_CHOICE_AUTHORITY.permission,
      },
      engaged: t.engaged,
      boundaries_crossed: t.boundaries_crossed,
      stages: t.stages,
      rule_versions: t.rule_versions,
      outcome: t.outcome,
    });
    if (!legacy.success)
      for (const issue of legacy.error.issues)
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path as (string | number)[],
        });
  });
export type GmWaitResolutionTransaction = z.infer<typeof GmWaitResolutionTransactionSchema>;

/** A stored authority / seal of either origin. The legacy member is first, so every existing value parses exactly as before. */
export const TransactionAuthorityStoredSchema = z.union([
  TransactionAuthoritySchema,
  GmWaitTransactionAuthoritySchema,
]);
export const ResolutionTransactionStoredSchema = z.union([
  ResolutionTransactionSchema,
  GmWaitResolutionTransactionSchema,
]);
