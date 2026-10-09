/**
 * What this command line IS, said wherever the operator looks (help, every run, both confirmations).
 *
 * It is OUT-OF-CHARACTER development / scenario instrumentation that exercises the existing relocation and stop-at-boundary
 * foundations from a local console. It is not a gameplay command, a travel planner or a player-facing ETA. Two things the
 * operator supplies must never be mistaken for one another, even though the same local OS user may supply both:
 *
 *   - the PLAYER'S CHOICE: one destination, voluntarily chosen and confirmed (the in-character act); and
 *   - the SCENARIO DELIVERY BOUNDARY: an exact canonical-time value declared from outside the world, because no travel-time,
 *     route, speed or feasibility producer exists (the Logistics foundation takes one caller-declared boundary for exactly this
 *     reason). The mechanism neither calculates nor defaults nor validates it against any geography; the Logistics owner only
 *     records it and the Temporal kernel only resolves work at it. The player's choice does not determine it, and nothing
 *     here forecasts or guarantees arrival.
 *
 * Even when the kernel lawfully resolves the declared boundary, the resulting owner chain is CONDITIONAL foundation evidence
 * given that authored premise; it does not show that any imagined geography or travel method could deliver by that time.
 * Raw identities, custody and boundary values the console prints are operator/debug visibility, not PC perception or knowledge.
 *
 * Source: BLUE source-reconciliation amendment to the implementation brief, native pin 2026-10-09T17:37:14.077Z, §§B–C.
 */

export const OOC_BANNER =
  "OOC DEVELOPMENT / SCENARIO INSTRUMENTATION - not a gameplay command, travel planner or player-facing ETA.";

export const OOC_DEBUG_NOTE =
  "Identities, custody and boundary values shown here are operator/debug information, not what the character perceives or knows.";

/** The scenario boundary, described for the console and the help text. */
export const OOC_BOUNDARY_NOTE = [
  "SCENARIO DELIVERY BOUNDARY (out of character, declared by the operator, NOT part of the character's choice):",
  "  an exact canonical-time value assumed from outside the world to exercise the movement foundation. It is not calculated,",
  "  defaulted or checked against any route, speed or geography, is not a travel time or ETA, and is no forecast or guarantee",
  "  of arrival. The character's choice does not determine it.",
] as const;
