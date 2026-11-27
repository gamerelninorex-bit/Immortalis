import type { SourceRef } from "@immortalis/contracts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../gm-wait-catalogue-current.ts";
import { canonicalEqual } from "../../hash.ts";

/**
 * F-014B replay prerequisite: the BOUNDED original-policy resolver for workshop owner history.
 *
 * A workshop owner fact embeds the policy it was published under (`history_verification_id` + `catalogue_sha256`). The original
 * historical verifier must judge a recorded fact by THAT policy, never by whatever policy the replaying build calls current,
 * and never by a pair it merely finds written in the journal. So the policy a recorded lineage was written under is selected
 * by EXACT RECOMPUTATION against a finite, versioned registry, once, at the lineage's first policy-bearing charter; every later
 * group of the lineage is then judged under that bound generation.
 *
 *   - FINITE: a registry entry is a frozen literal plus a frozen recipe in this file. Nothing is parsed out of a recorded string
 *     and nothing is stripped from one; a recorded pair that no entry recomputes to is refused, not interpreted.
 *   - EXACT: an entry's identity is recomputed from the constructed inputs (profile digest, notice-source identity, economy-draft
 *     flag, choice-source identity, terminal IF-6b policy) and its catalogue digest is a literal.
 *   - BOUND: the selection is a function of the committed charter alone. A later group cannot switch generation.
 *   - ORIGINAL ONLY: this resolves how a RECORDED lineage is judged. A live commit is judged under the CURRENT generation only, so
 *     historical selection never grants a capability a later generation introduced and never migrates a lineage.
 *
 * The cache identity of a checkpoint (`WriteAdmission.historyVerificationId`) stays the CURRENT generation's identity: it answers
 * "was this state verified by this build's verifier", which is a different question from "which policy did this lineage start
 * under". Any change to this registry is a change to the historical verifier and MUST change the CURRENT generation's identity
 * (a new generation entry does so by construction); the registry digest is pinned by a conformance test for that reason.
 */

/** A policy as a workshop owner fact records it, selected and exact. */
export interface WorkshopPolicyBinding {
  readonly historyId: string;
  readonly catalogueSha256: string;
}
/**
 * What a derivation needs to spell its policy. A bare string is the identity published under the CURRENT catalogue (every
 * pre-existing caller); an object is an exact selected pair.
 */
export type WorkshopHistoryRef = string | WorkshopPolicyBinding;
export const workshopHistoryIdOf = (h: WorkshopHistoryRef): string =>
  typeof h === "string" ? h : h.historyId;
export const workshopCatalogueOf = (h: WorkshopHistoryRef): string =>
  typeof h === "string" ? GM_WAIT_CATALOGUE_CURRENT_SHA256 : h.catalogueSha256;

/** The constructed inputs a workshop identity is spelled from. Every field is a value the admission was built with. */
export interface WorkshopIdentityInputs {
  /** the composed shared history identity (S-4 .. W2 segments) before any workshop segment */
  readonly base: string;
  readonly profileSha256: string;
  /** the verification identity of the notice source, when one is installed */
  readonly noticeVerificationId?: string;
  readonly laneX?: {
    readonly economyDraft: boolean;
    /** sha256Canonical of the choice source's verification identity, when one is installed */
    readonly choiceSha256?: string;
  };
}

export interface WorkshopGeneration {
  readonly id: string;
  readonly catalogueSha256: string;
  readonly identity: (inputs: WorkshopIdentityInputs) => string;
}

/** The terminal IF-6b historical-verifier segment as G0 spelled it. A frozen literal, deliberately NOT the live constant. */
export const WORKSHOP_G0_IF6B_POLICY = "F-014B-IF-6b-D2-AD5@2026-11-23T11:42:34.869Z";
/** The workshop catalogue digest G0 published under (the catalogue pointer at main d0bcb615). A frozen literal. */
export const WORKSHOP_G0_CATALOGUE_SHA256 =
  "81f6ccda0499b45c113c91f2c547892299d587da54e8777425f5fd8e61b6212d";

/** The shared spelling of a workshop identity; a generation differs only in the terminal policy segments it passes. */
export function composeWorkshopIdentity(
  inputs: WorkshopIdentityInputs,
  terminal: { readonly if6bPolicy: string },
): string {
  const workshopId = `${inputs.base}+B3-WORKSHOP-OWNER-V1:${inputs.profileSha256}${
    inputs.noticeVerificationId !== undefined ? `:${inputs.noticeVerificationId}` : ""
  }`;
  if (!inputs.laneX) return workshopId;
  return (
    workshopId +
    (inputs.laneX.economyDraft ? "+FIXTURE-ECONOMY-REALIZATION-DRAFT-V1" : "") +
    (inputs.laneX.choiceSha256 !== undefined ? "+B3-CHOICE:" + inputs.laneX.choiceSha256 : "") +
    "+" +
    terminal.if6bPolicy
  );
}

/** G0: the recipe and catalogue main published workshop history under at d0bcb615. Frozen; never edited, only joined by successors. */
export const WORKSHOP_GENERATION_G0: WorkshopGeneration = Object.freeze({
  id: "G0",
  catalogueSha256: WORKSHOP_G0_CATALOGUE_SHA256,
  identity: (inputs: WorkshopIdentityInputs) =>
    composeWorkshopIdentity(inputs, { if6bPolicy: WORKSHOP_G0_IF6B_POLICY }),
});

/**
 * The generation a build writes NEW history under. Today it spells exactly G0's recipe from the live constants; a successor
 * generation changes THIS entry (its recipe and its catalogue pointer) in the same change that appends G0's frozen entry above
 * to the historical set, which is why G0 above is a literal and not derived from here.
 */
export const workshopCurrentGeneration = (liveIf6bPolicy: string): WorkshopGeneration =>
  Object.freeze({
    id: "CURRENT",
    catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    identity: (inputs: WorkshopIdentityInputs) =>
      composeWorkshopIdentity(inputs, { if6bPolicy: liveIf6bPolicy }),
  });

/** One candidate: a registry entry with its identity recomputed for THIS admission's constructed inputs. */
export interface WorkshopGenerationCandidate {
  readonly id: string;
  readonly binding: WorkshopPolicyBinding;
}

/**
 * The finite candidate set, current first. Two entries that recompute to the same pair are one candidate (today CURRENT is G0).
 * `current` is injectable ONLY so a testkit admission can stand in for a successor build; production uses the default.
 */
export function workshopCandidates(
  inputs: WorkshopIdentityInputs,
  current: WorkshopGeneration,
  historical: readonly WorkshopGeneration[] = [WORKSHOP_GENERATION_G0],
): readonly WorkshopGenerationCandidate[] {
  const out: WorkshopGenerationCandidate[] = [];
  for (const g of [current, ...historical]) {
    const binding = Object.freeze({
      historyId: g.identity(inputs),
      catalogueSha256: g.catalogueSha256,
    });
    if (
      !out.some(
        (c) =>
          c.binding.historyId === binding.historyId &&
          c.binding.catalogueSha256 === binding.catalogueSha256,
      )
    )
      out.push(Object.freeze({ id: g.id, binding }));
  }
  return Object.freeze(out);
}

export interface RecordedWorkshopPolicy {
  readonly source_rule_ref: SourceRef;
  readonly history_verification_id: string;
  readonly catalogue_sha256: string;
}

/**
 * Select the candidate a recorded policy recomputes to, EXACTLY: the whole policy object (rule citation, identity and catalogue
 * together) must equal what the candidate publishes for `rule`. A recorded identity with another generation's catalogue (a pair
 * that is valid in each half and wrong together), an unknown digest, or any other string selects nothing.
 */
export function selectWorkshopGeneration(
  candidates: readonly WorkshopGenerationCandidate[],
  recorded: RecordedWorkshopPolicy,
  rule: SourceRef,
): WorkshopGenerationCandidate | undefined {
  return candidates.find((c) =>
    canonicalEqual(recorded, {
      source_rule_ref: rule,
      history_verification_id: c.binding.historyId,
      catalogue_sha256: c.binding.catalogueSha256,
    }),
  );
}
