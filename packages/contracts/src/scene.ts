import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import { RefereeInputRefSchema } from "./referee.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE } from "./world-foundation.ts";

/**
 * GM-led first play (30 October 2026): the TWO sparse World-State facts a direct look can need, each published by the physical custodian
 * from ONE retained `GM_SCENE_RESOLUTION` decision of the GM host, never authored by the host, the narrator or the adapter.
 *
 *   world_pc_current_viewing   the SUPPORTED current viewing circumstance of the active PC at one canonical basis: that an ordinary look
 *                              (routine attention, turning, opening the eyes) is physically supported NOW. It is RUNTIME physical context
 *                              under the existing World-State physical custodian (BLUE decision 1): it is not an intrinsic I-002 branch,
 *                              rewrites no original placement, and a request alone is never a physical result. Only a SUPPORTED ruling is
 *                              published (sparse): a negative or unresolved ruling stays sealed referee evidence and nothing else.
 *   world_output_appearance    the minimum raw physical appearance of a loose output Production already credited (BLUE decision 2; WG
 *                              Resolution Rules; F-016 fallback only where no more-specific custodian exists). It REFERENCES the producing
 *                              owner's committed delivery and carries NO quantity, material name, count or ownership: it is not a second
 *                              source/Reserve ledger and not a Production result. Resolved once, before any observation of it, from
 *                              branch-invariant world constraints, and never from a perception outcome.
 *
 * Both are SEALED and create-only: the first established result is preserved, a different second one at the same identity is a conflict.
 * Every schema is strict; foreign state is referenced by exact pin, never copied (RC-02).
 */

const Trimmed = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((t) => t === t.trim(), "text must not have surrounding whitespace");

const Custodian = z.strictObject({
  owner: z.literal(OWNER_WORLD_STATE),
  facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
  basis: z.literal(FALLBACK_BASIS),
});

const GmRuling = z.strictObject({
  role: z.literal("role.gm"),
  permission: z.literal("permission.rule.adjudicate"),
});

/** `world-state/pc/<pc>/current-viewing/<viewing id>`: the viewing id is derived from the BASIS, never from the request's wording. */
export const worldPcCurrentViewingKey = (pcId: string, viewingId: string): string =>
  `world-state/pc/${pcId}/current-viewing/${viewingId}`;
/** `world/<world>/output-appearance/<delivery id>`: one appearance per completed delivery. */
export const worldOutputAppearanceKey = (worldId: string, deliveryId: string): string =>
  `world/${worldId}/output-appearance/${deliveryId}`;

export const VIEWING_ID = /^[0-9a-f]{32}$/;

export const PcCurrentViewingSchema = z.strictObject({
  viewing_id: z.string().regex(VIEWING_ID),
  pc_id: EntityId,
  /** the canonical basis the look is made at: a changed basis is a different circumstance */
  observed_at: CanonicalTimeSchema,
  /** the exact committed versions the ruling was made against; a stale or forged record fails admission and verification */
  basis: z.strictObject({
    pinned_versions: z.strictObject({
      pc: Version.min(1),
      binding: Version.min(1),
      custody: Version.min(1),
      world: Version.min(1),
      locus: Version.min(1),
    }),
  }),
  /** only that an ordinary look was requested, and the digest of the words it was requested in (null for a bare look) */
  request: z.strictObject({ kind: z.literal("LOOK"), statement_digest: Sha256.nullable() }),
  circumstance: z.strictObject({
    state: z.literal("SUPPORTED"),
    /** the GM's ruling, verbatim from the retained decision: attention, orientation and open eyes. No appearance, no recognition. */
    statement: Trimmed(300),
  }),
  /** the retained GM_SCENE_RESOLUTION decision this is published from, at its exact version */
  ruling: RefereeInputRefSchema,
  ruled_by: GmRuling,
  custodian: Custodian,
});
export type PcCurrentViewing = z.infer<typeof PcCurrentViewingSchema>;

export const OutputAppearanceAspectSchema = z.strictObject({
  aspect: Trimmed(60),
  statement: Trimmed(240),
});

export const WorldOutputAppearanceSchema = z.strictObject({
  appearance_id: Id,
  world: FactRefSchema,
  locus: FactRefSchema,
  /** the producing owner's committed, credited delivery this is the appearance of: referenced, never copied */
  delivery: RefereeInputRefSchema,
  aspects: z.array(OutputAppearanceAspectSchema).min(1).max(4),
  /** the retained GM_SCENE_RESOLUTION decision this is published from, at its exact version */
  resolution: RefereeInputRefSchema,
  resolved_by: GmRuling,
  /** the Temporal owner's canonical time at publication */
  effective_at: CanonicalTimeSchema,
  custodian: Custodian,
});
export type WorldOutputAppearance = z.infer<typeof WorldOutputAppearanceSchema>;

// ---------------------------------------------------------------------------------------------
// The citation layout of a direct-perception record
// ---------------------------------------------------------------------------------------------

/** The facts every direct-perception question cites first, in order: the released character, the binding, the custody, the world and the locus. */
export const OBSERVATION_BASE_REF_COUNT = 5;

const DELIVERY_REF = /^world\/([^/]+)\/source-delivery\/(.+)$/;
const VIEWING_REF = /^world-state\/pc\/([^/]+)\/current-viewing\/([0-9a-f]{32})$/;
const APPEARANCE_REF = /^world\/([^/]+)\/output-appearance\/(.+)$/;

/**
 * Which optional citations follow the five base ones. Legacy records cite none or exactly one (a scoped Source Condition, or a completed
 * delivery); a record made after a look's scene resolution may ALSO cite, in this order and each at most once, the owner-published
 * current viewing circumstance and the owner-resolved appearance of the delivered output. The appearance is of a DELIVERY, so it can only
 * follow a delivery citation and must name that delivery. Anything else - another order, a repeat, an unknown key - is not a layout.
 * Pure key arithmetic: it reads no fact and decides nothing; each consumer still checks the facts the keys name.
 */
export interface ObservationRefLayout {
  readonly variant:
    | { readonly kind: "NONE" }
    | { readonly kind: "SCOPED"; readonly index: number; readonly key: string }
    | {
        readonly kind: "DELIVERY";
        readonly index: number;
        readonly key: string;
        readonly world_id: string;
        readonly extraction_id: string;
      };
  readonly viewing: { readonly index: number; readonly key: string; readonly pc_id: string } | null;
  readonly appearance: { readonly index: number; readonly key: string } | null;
}

export function parseObservationRefLayout(
  keys: readonly string[],
  isScopedSourceKey: (key: string) => boolean,
): ObservationRefLayout | null {
  let i = OBSERVATION_BASE_REF_COUNT;
  if (keys.length < i) return null;
  let variant: ObservationRefLayout["variant"] = { kind: "NONE" };
  const next = keys[i];
  if (next !== undefined) {
    const delivery = DELIVERY_REF.exec(next);
    if (delivery) {
      variant = {
        kind: "DELIVERY",
        index: i,
        key: next,
        world_id: delivery[1]!,
        extraction_id: delivery[2]!,
      };
      i++;
    } else if (isScopedSourceKey(next)) {
      variant = { kind: "SCOPED", index: i, key: next };
      i++;
    }
  }
  let viewing: ObservationRefLayout["viewing"] = null;
  const v = keys[i] === undefined ? null : VIEWING_REF.exec(keys[i]!);
  if (v) {
    viewing = { index: i, key: keys[i]!, pc_id: v[1]! };
    i++;
  }
  let appearance: ObservationRefLayout["appearance"] = null;
  const a = keys[i] === undefined ? null : APPEARANCE_REF.exec(keys[i]!);
  if (a) {
    if (variant.kind !== "DELIVERY" || a[1] !== variant.world_id || a[2] !== variant.extraction_id)
      return null;
    appearance = { index: i, key: keys[i]! };
    i++;
  }
  return i === keys.length ? { variant, viewing, appearance } : null;
}

/** The same layout read from a record's own citations (so a caller that must stay free of iteration need not build the key list). */
export const parseObservationRefsLayout = (
  refs: readonly { readonly fact_key: string }[],
  isScopedSourceKey: (key: string) => boolean,
): ObservationRefLayout | null =>
  parseObservationRefLayout(
    refs.map((r) => r.fact_key),
    isScopedSourceKey,
  );
