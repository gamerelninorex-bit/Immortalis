import { z } from "zod";
import { CanonicalTimeSchema } from "./temporal.ts";
import { EntityId, Text } from "./world-foundation.ts";
import { InstitutionIdentitySchema, OfficeAuthorityLocusSchema } from "./gip.ts";
import {
  INSTRUMENT_OPERATIVE_EFFECTS,
  InstrumentLifecycleStatus,
  InstrumentValidityEntrySchema,
} from "./gip-instrument.ts";
import { ScopeBindingSchema } from "./gip-scope-binding.ts";
import {
  InputLotPremiseSchema,
  LegalPremiseSchema,
  MaterialSpecificationPremiseSchema,
  ServicePremiseSchema,
  SiteConditionPremiseSchema,
} from "./freight-profile.ts";

/**
 * ROADBED GM-native first-profile freight bridge (BLUE v6.2 Continuation Preflight) — the HOST-FACING contract.
 *
 * A compatible AI game master, acting as an authenticated HOST, authors an original NULL-PC quarry/textile world in ordinary
 * language, submits typed readings of the premises it genuinely specified, consults source-qualified owner status and asks the
 * already-governed first-profile freight chain to proceed. Everything below is a TECHNICAL TRANSPORT ENCODING of operations whose
 * source semantics already exist (R2-D18 v1.2.1 / R3-T20 / R3-T21, merged as PR #102/#103). It adds NO source field, enum, facet,
 * stage, owner, clause, status or legal meaning:
 *
 *   - each premise / institution / office / scope binding below is the EXISTING contract schema, reproduced unchanged;
 *   - the three Instrument references the existing contract derives from the office, the binding and the legal slice's Basis
 *     (`source_authority_ref`, `authority_basis_ref`, `scope_binding_ref`) are DERIVED by the trusted side from the identities the
 *     host names, never supplied (the host cannot point an Instrument at an authority other than the one it also established);
 *   - the host states NO role, NO permission, NO authored_under, NO owner, NO outcome, NO status, NO time and NO result. Every
 *     such field is an over-claim (the schemas are strict), because authority is the TRUSTED binding's, never the request's;
 *   - `operation_id` is the host's own retry token. It is an identity for RC-16 reconciliation (the same token and the same terms
 *     replay what committed; the same token with changed terms is a conflict). It is NOT a success flag, a transaction identity or
 *     an authority.
 *
 * Time belongs to the player/operator, never to this lane: the starting chronology (Temporal origin) is stated through the
 * operator's existing `initialize-time` command and every advance of canonical time is the player's own out-of-character choice
 * through the existing NULL-PC advance gateway. The bridge reports WHAT is awaited and never supplies it.
 */

export const GM_FREIGHT_TOOLS = {
  status: "gm_freight_status",
  establishSetting: "gm_freight_establish_setting",
  attestOpening: "gm_freight_attest_opening",
  establishLegal: "gm_freight_establish_legal",
  initiate: "gm_freight_initiate",
  reportSiteChange: "gm_freight_report_site_change",
  withdraw: "gm_freight_withdraw",
  reconcile: "gm_freight_reconcile",
} as const;
export type GmFreightTool = (typeof GM_FREIGHT_TOOLS)[keyof typeof GM_FREIGHT_TOOLS];
export const GM_FREIGHT_TOOL_NAMES: readonly GmFreightTool[] = Object.values(GM_FREIGHT_TOOLS);

/** Every failure of an unauthenticated or otherwise untrusted call: byte-identical, with no cause (unbound host, wrong secret, ...). */
export const GM_FREIGHT_UNAVAILABLE = "GM_FREIGHT_UNAVAILABLE";
export const GM_FREIGHT_UNAVAILABLE_MESSAGE = "no GM freight operation is available";
/** The request is not a valid request of this tool (shape, over-claim). Nothing was read or written beyond authentication. */
export const GM_FREIGHT_INPUT_INVALID = "GM_FREIGHT_INPUT_INVALID";
/** An authenticated GM's request was refused by the OWNER that judges it. Earlier committed steps are reported and preserved. */
export const GM_FREIGHT_REFUSED = "GM_FREIGHT_REFUSED";
/** The same retry token was presented with different terms. Nothing new was committed under it. */
export const GM_FREIGHT_INTENT_CONFLICT = "GM_FREIGHT_INTENT_CONFLICT";
/** A commit may have happened without a reply (RC-16): reconcile by the same `operation_id`; never "safely absent". */
export const GM_FREIGHT_OUTCOME_UNKNOWN = "GM_FREIGHT_OUTCOME_UNKNOWN";
export const GM_FREIGHT_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: call gm_freight_reconcile, then present the same request with the same operation_id again";

export type GmFreightErrorCode =
  | typeof GM_FREIGHT_UNAVAILABLE
  | typeof GM_FREIGHT_INPUT_INVALID
  | typeof GM_FREIGHT_REFUSED
  | typeof GM_FREIGHT_INTENT_CONFLICT
  | typeof GM_FREIGHT_OUTCOME_UNKNOWN;

/** The host's retry token. */
export const GmOperationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

// ---------------------------------------------------------------------------------------------
// Requests (all strict)
// ---------------------------------------------------------------------------------------------

export const GmFreightStatusRequestSchema = z.strictObject({ world_id: EntityId.optional() });

/**
 * The original setting in ordinary language: a world (ORIGINAL by construction), its two sites and the one directed way between
 * them. The reference-causal-basis mode is fixed to ORIGINAL: this profile opens only an original NULL-PC world.
 */
export const GmEstablishSettingRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world: z.strictObject({
    world_id: EntityId,
    premise: Text,
    established_canon: Text,
  }),
  origin: z.strictObject({ locus_id: EntityId, designation: Text }),
  destination: z.strictObject({ locus_id: EntityId, designation: Text }),
  corridor: z.strictObject({ statement: Text }),
});
export type GmEstablishSettingRequest = z.infer<typeof GmEstablishSettingRequestSchema>;

/** One premise slice of the original envelope: ordinary-language `statement` plus its typed reading, of exactly the slice's kind. */
export const GmOpeningSliceSchema = z.discriminatedUnion("slice_kind", [
  z.strictObject({
    slice_id: EntityId,
    slice_kind: z.literal("legal"),
    statement: Text,
    premise: LegalPremiseSchema,
  }),
  z.strictObject({
    slice_id: EntityId,
    slice_kind: z.literal("site_condition"),
    statement: Text,
    premise: SiteConditionPremiseSchema,
  }),
  z.strictObject({
    slice_id: EntityId,
    slice_kind: z.literal("material_specification"),
    statement: Text,
    premise: MaterialSpecificationPremiseSchema,
  }),
  z.strictObject({
    slice_id: EntityId,
    slice_kind: z.literal("input_lot"),
    statement: Text,
    premise: InputLotPremiseSchema,
  }),
  z.strictObject({
    slice_id: EntityId,
    slice_kind: z.literal("service_premise"),
    statement: Text,
    premise: ServicePremiseSchema,
  }),
]);
export type GmOpeningSlice = z.infer<typeof GmOpeningSliceSchema>;

/** The whole original GM envelope, attested ONCE. There is no `authored_under`: the trusted binding states it. */
export const GmAttestOpeningRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  opening: z.strictObject({
    world_id: EntityId,
    envelope_id: EntityId,
    origin_locus_id: EntityId,
    destination_locus_id: EntityId,
    slices: z.array(GmOpeningSliceSchema).min(1),
  }),
});
export type GmAttestOpeningRequest = z.infer<typeof GmAttestOpeningRequestSchema>;

/** The Instrument without the three references the existing contract derives from the identities named elsewhere in the request. */
export const GmInstrumentSchema = z.strictObject({
  instrument_id: EntityId,
  operative_effect: z.enum(INSTRUMENT_OPERATIVE_EFFECTS),
  validity_by_order: z.array(InstrumentValidityEntrySchema),
  lifecycle_status: InstrumentLifecycleStatus,
});

/** The typed legal source: institution, office, Scope Binding, Instrument (the clauses and the seal come from the sealed legal slice). */
export const GmEstablishLegalRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world_id: EntityId,
  institution: InstitutionIdentitySchema,
  office: OfficeAuthorityLocusSchema,
  scope_binding: ScopeBindingSchema,
  instrument: GmInstrumentSchema,
});
export type GmEstablishLegalRequest = z.infer<typeof GmEstablishLegalRequestSchema>;

/** Ask the already-governed chain to proceed as far as the owners lawfully allow. It names no outcome. */
export const GmInitiateRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world_id: EntityId,
});
export type GmInitiateRequest = z.infer<typeof GmInitiateRequestSchema>;

/** A GM-authored PROSPECTIVE physical change of a standing site condition (never a retcon of what happened). */
export const GmReportSiteChangeRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world_id: EntityId,
  condition_id: EntityId,
  change_id: EntityId,
  statement: Text,
  outcome: z.enum(["STANDING", "CEASED"]),
});
export type GmReportSiteChangeRequest = z.infer<typeof GmReportSiteChangeRequestSchema>;

/** Ask Economy (and, where it holds a committed service, Logistics) to withdraw the fixed request. The owners decide whether a cause exists. */
export const GmWithdrawRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world_id: EntityId,
});
export type GmWithdrawRequest = z.infer<typeof GmWithdrawRequestSchema>;

/** Which earlier acts committed under this retry token (for a lost acknowledgement). Reads only. */
export const GmReconcileRequestSchema = z.strictObject({
  operation_id: GmOperationId,
  world_id: EntityId.optional(),
});
export type GmReconcileRequest = z.infer<typeof GmReconcileRequestSchema>;

export const GM_FREIGHT_REQUEST_SCHEMAS = {
  [GM_FREIGHT_TOOLS.status]: GmFreightStatusRequestSchema,
  [GM_FREIGHT_TOOLS.establishSetting]: GmEstablishSettingRequestSchema,
  [GM_FREIGHT_TOOLS.attestOpening]: GmAttestOpeningRequestSchema,
  [GM_FREIGHT_TOOLS.establishLegal]: GmEstablishLegalRequestSchema,
  [GM_FREIGHT_TOOLS.initiate]: GmInitiateRequestSchema,
  [GM_FREIGHT_TOOLS.reportSiteChange]: GmReportSiteChangeRequestSchema,
  [GM_FREIGHT_TOOLS.withdraw]: GmWithdrawRequestSchema,
  [GM_FREIGHT_TOOLS.reconcile]: GmReconcileRequestSchema,
} as const;

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

/** Always attached to what an authenticated GM reads: it is owner-backed GM consultation, never what any character perceives or knows. */
export const GM_FREIGHT_AUDIENCE = "GM_CONSULTATION_ONLY_NOT_PLAYER_FACING";

export interface GmFreightStep {
  /** the bridge's name of the owner act */
  readonly step: string;
  readonly owner: string;
  /**
   * `COMMITTED` now; `REPLAYED`: this very act had already committed under this retry token and the ORIGINAL receipt was returned
   * (RC-16); `ALREADY_PRESENT`: the owner already holds exactly this authored content (committed under another token), so
   * nothing was written and no revision is claimed.
   */
  readonly disposition: "COMMITTED" | "REPLAYED" | "ALREADY_PRESENT";
  readonly revision: number | null;
}

/** What the trusted side is waiting for, and whose it is. The GM can never supply it. */
export type GmFreightAwaiting =
  | { readonly kind: "GM_AUTHORING"; readonly tool: GmFreightTool; readonly note: string }
  | {
      readonly kind: "OPERATOR_STARTING_CHRONOLOGY";
      readonly time_unit: string | null;
      readonly note: string;
    }
  | {
      readonly kind: "PLAYER_OOC_TIME_ADVANCE";
      readonly to: z.infer<typeof CanonicalTimeSchema>;
      readonly reason: "PRODUCTION_COMPLETION_BOUNDARY" | "SERVICE_DELIVERY_BOUNDARY";
      readonly note: string;
    };

export interface GmFreightStatus {
  readonly audience: typeof GM_FREIGHT_AUDIENCE;
  readonly campaign_id: string;
  readonly null_pc: boolean;
  readonly canonical_time: z.infer<typeof CanonicalTimeSchema> | null;
  readonly world_id: string | null;
  /** the first milestone not yet reached, from the committed owner facts (never a stored flag) */
  readonly stage: string;
  readonly milestones: Readonly<Record<string, boolean>>;
  readonly request: {
    readonly request_ref: string;
    readonly allocation_status: string;
    readonly derived_status: unknown;
  } | null;
  readonly awaiting: GmFreightAwaiting | null;
}

export interface GmFreightHalt {
  readonly step: string;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface GmFreightReceipt {
  readonly audience: typeof GM_FREIGHT_AUDIENCE;
  readonly tool: GmFreightTool;
  readonly operation_id: string | null;
  /** each discrete owner act that committed (or replayed) in this call, in order */
  readonly steps: readonly GmFreightStep[];
  /** present when the call stopped short for a reason that is not an owner refusal */
  readonly awaiting: GmFreightAwaiting | null;
  /** every act found committed under this retry token (this call's and any earlier call's): the original receipts, by identity */
  readonly committed_under_token: readonly { readonly step: string; readonly revision: number }[];
  readonly status: GmFreightStatus | null;
}

export interface GmFreightReconciliation {
  readonly audience: typeof GM_FREIGHT_AUDIENCE;
  readonly tool: typeof GM_FREIGHT_TOOLS.reconcile;
  readonly operation_id: string;
  readonly committed: readonly { readonly step: string; readonly revision: number }[];
}
