import { z } from "zod";
import { Id, Sha256 } from "./ids.ts";
import {
  PinSchema,
  SI_SCALE_DECLARATION,
  type InitialSetupInput,
  type Pin,
} from "./initial-locality.ts";
import { CanonicalTimeSchema, type CanonicalTime } from "./temporal.ts";

/**
 * CAL-TIME T-1 Unified Clock-Origin Source v1.0 §3 (adopted by the Sovereign's ratification, grant 1) — the Temporal-owned SEALED
 * origin witness. It is a NEW contracts file so that `temporal.ts`, byte-pinned by the conformance suites, is not touched; the
 * semantics are identical to a declaration made there.
 *
 * The witness is one create-only, genesis-only, campaign-unique fact. It binds the campaign identity, the original canonical
 * coordinate and unit, the literal "one SI second per unit" declaration, the identity and digest of the v2 captured chronology that
 * declared it, and the governing Completion and its own Input (with versions). Owner/facet, group id, rule, reads and depends_on come
 * from the journal and are NOT duplicated here. T1 MECHANISM ONLY: nothing in this module qualifies a production campaign.
 */
export const TEMPORAL_ORIGIN_KEY = "temporal/origin";
export const TEMPORAL_ORIGIN_FORMAT = "immortalis-temporal-origin";
export const TEMPORAL_ORIGIN_FORMAT_VERSION = 1;

export const TemporalOriginSchema = z.strictObject({
  format: z.literal(TEMPORAL_ORIGIN_FORMAT),
  format_version: z.literal(TEMPORAL_ORIGIN_FORMAT_VERSION),
  campaign_id: Id,
  /** equals the initial temporal/state canonical_time and the governing Input.chronology.document.time */
  origin: CanonicalTimeSchema,
  scale: z.literal(SI_SCALE_DECLARATION),
  chronology: z.strictObject({
    capture_format_version: z.literal(2),
    capture_ref: Id,
    capture_hash: Sha256,
    document_hash: Sha256,
    /** TOOL_CALL_ONLY never qualifies, so it is not representable */
    grade: z.enum(["ORIGINAL_MESSAGE_VERIFIED", "OPERATOR_CONFIRMED_RECORD_ONLY"]),
  }),
  governing: z.strictObject({ completion: PinSchema, input: PinSchema }),
});
export type TemporalOrigin = z.infer<typeof TemporalOriginSchema>;

/**
 * The origin witness a v2 captured chronology implies, derived ONLY from the governing Completion's pin, its own Input's pin and that
 * Input's capture. The trusted captured writer derives its value with this function; live admission, the MS B2 prefix and the historical
 * verifiers compare the committed value with a fresh derivation from the committed records, so no caller-supplied field can enter it.
 * Returns null for a version 1 chronology, which has no witness (a v1 / direct / never-bootstrap origin is state-only and opaque).
 * TOOL_CALL_ONLY never qualifies, so a capture of that grade yields null too.
 */
export function deriveTemporalOrigin(
  campaignId: string,
  input: InitialSetupInput,
  completion: Pin,
  inputPin: Pin,
): TemporalOrigin | null {
  const c = input.chronology;
  if (c.format_version !== 2 || c.grade === "TOOL_CALL_ONLY") return null;
  return {
    format: TEMPORAL_ORIGIN_FORMAT,
    format_version: TEMPORAL_ORIGIN_FORMAT_VERSION,
    campaign_id: campaignId,
    origin: { unit: c.document.time.unit, value: c.document.time.value },
    scale: c.document.scale,
    chronology: {
      capture_format_version: 2,
      capture_ref: c.capture_ref,
      capture_hash: c.capture_hash,
      document_hash: c.document_hash,
      grade: c.grade,
    },
    governing: {
      completion: { fact_key: completion.fact_key, version: completion.version },
      input: { fact_key: inputPin.fact_key, version: inputPin.version },
    },
  };
}

export const SI_ORIGIN_VIOLATIONS = [
  "ORIGIN_MALFORMED",
  "ORIGIN_CAMPAIGN",
  "ORIGIN_SCALE",
  "ORIGIN_UNIT",
] as const;
export type SiOriginViolation = (typeof SI_ORIGIN_VIOLATIONS)[number];

/**
 * CAL-TIME T-1 §5: the one qualified origin predicate a later SI consumer will apply to an origin witness it was handed. PREPARATORY
 * AND UNWIRED (A0): it is a pure function of its three arguments, reads no store, has no caller outside tests, wires no T0 read, and
 * confers no GM canon right. It judges only that the witness is the strict origin of this campaign, declares the literal SI scale
 * and is expressed in the unit of the clock it will be applied to. Returns the first violation, or null.
 */
export function siOriginWitnessViolation(
  witness: unknown,
  clock: CanonicalTime,
  campaignId: string,
): SiOriginViolation | null {
  const parsed = TemporalOriginSchema.safeParse(witness);
  if (!parsed.success) return "ORIGIN_MALFORMED";
  const w = parsed.data;
  if (w.campaign_id !== campaignId) return "ORIGIN_CAMPAIGN";
  if (w.scale !== SI_SCALE_DECLARATION) return "ORIGIN_SCALE";
  if (w.origin.unit !== clock.unit) return "ORIGIN_UNIT";
  return null;
}
