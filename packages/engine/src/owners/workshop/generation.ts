import { GM_WAIT_IF6B_QUIET_SEAL_SEGMENT, type SourceRef } from "@immortalis/contracts";
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
 * Checkpoint reuse uses the resolver's separate verifier identity. The recorded lineage is never changed to invalidate a cache.
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
  readonly economyClass?: "ECONOMY_REALIZED_ACCESS_FORWARD";
}

/** The terminal IF-6b historical-verifier segment as G0 spelled it. A frozen literal, deliberately NOT the live constant. */
export const WORKSHOP_G0_IF6B_POLICY = "F-014B-IF-6b-D2-AD5@2026-11-23T11:42:34.869Z";
/** The workshop catalogue digest G0 published under (the catalogue pointer at main d0bcb615). A frozen literal. */
export const WORKSHOP_G0_CATALOGUE_SHA256 =
  "81f6ccda0499b45c113c91f2c547892299d587da54e8777425f5fd8e61b6212d";

/** The shared spelling of a workshop identity; a generation differs only in the terminal policy segments it passes. */
export function composeWorkshopIdentity(
  inputs: WorkshopIdentityInputs,
  terminal: {
    readonly if6bPolicy: string;
    readonly economyForwardSegment?: string;
    /** G1: the ordinary quiet seal exists only under this segment, which sits immediately before the terminal IF-6b segment */
    readonly quietSealSegment?: string;
  },
): string {
  const workshopId = `${inputs.base}+B3-WORKSHOP-OWNER-V1:${inputs.profileSha256}${
    inputs.noticeVerificationId !== undefined ? `:${inputs.noticeVerificationId}` : ""
  }`;
  if (!inputs.laneX) return workshopId;
  return (
    workshopId +
    (!terminal.economyForwardSegment && inputs.laneX.economyDraft
      ? "+FIXTURE-ECONOMY-REALIZATION-DRAFT-V1"
      : "") +
    (inputs.laneX.choiceSha256 !== undefined ? "+B3-CHOICE:" + inputs.laneX.choiceSha256 : "") +
    (terminal.economyForwardSegment ?? "") +
    (terminal.quietSealSegment ?? "") +
    "+" +
    terminal.if6bPolicy
  );
}

/**
 * G0's shared base: the composed history identity main `d0bcb615` spelled for the fixture admission, BEFORE any workshop segment. Frozen as a literal so a later
 * change to a shared segment constant or to `composeWorkshopIdentity` cannot move what G0 recomputes; a new base is a new generation, never an edit here.
 */
export const WORKSHOP_G0_FIXTURE_BASE =
  "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+fixture-evidence-t1+MS-SETUP-V08@2026-11-09T00:43:08.394Z+MS_ACTOR_PARSER_V1+ROADBED-FREIGHT-FI@2026-11-13T06:14:52.876Z+S4-INITIAL-LEDGER@2026-11-15T13:54:22.606Z/2026-11-15T14:02:45.229Z+BRIEF@2026-11-17T04:59:46.616Z+POPULATION-STAGE-AUTHORITY-V2+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z+MS-V3-CLOCK-STEP-B2-ORIGIN+GM-WAIT-W2-CUSTODY-V1@2026-11-22T17:48:36.869Z";

/**
 * G0: the recipe and catalogue main published workshop history under at d0bcb615. Frozen and SELF-CONTAINED: its own base literal and its own inline
 * composition (not `composeWorkshopIdentity`, not the caller's `inputs.base`). Only these variants exist, and only the inputs below choose among them:
 * the notice-source tail, then (Lane X only) the draft-economy flag, the choice-source tail and the terminal IF-6b segment. It has no economy-forward, no
 * quiet-seal and no stage-policy variant, so a historical selection can grant none of them.
 */
export const WORKSHOP_GENERATION_G0: WorkshopGeneration = Object.freeze({
  id: "G0",
  catalogueSha256: WORKSHOP_G0_CATALOGUE_SHA256,
  identity: (inputs: WorkshopIdentityInputs) => {
    const workshopId = `${WORKSHOP_G0_FIXTURE_BASE}+B3-WORKSHOP-OWNER-V1:${inputs.profileSha256}${
      inputs.noticeVerificationId !== undefined ? `:${inputs.noticeVerificationId}` : ""
    }`;
    if (!inputs.laneX) return workshopId;
    return (
      workshopId +
      (inputs.laneX.economyDraft ? "+FIXTURE-ECONOMY-REALIZATION-DRAFT-V1" : "") +
      (inputs.laneX.choiceSha256 !== undefined ? "+B3-CHOICE:" + inputs.laneX.choiceSha256 : "") +
      "+" +
      WORKSHOP_G0_IF6B_POLICY
    );
  },
});

/** The exact pair accepted on main d311bcff (#149) used G0's frozen recipe with a different catalogue. */
export const WORKSHOP_GENERATION_149: WorkshopGeneration = Object.freeze({
  id: "G0_RESOLVER_149",
  catalogueSha256: "f7a4b7ee4094fdf8efa3d17a2f9ee4d3bea36114ce227c6e839489dd10ab9948",
  identity: WORKSHOP_GENERATION_G0.identity,
});

/** The catalogue digest accepted with B3-E (#146, merged at main 7b446df8) for BOTH its draft class and its forward class. A frozen literal. */
export const WORKSHOP_B3E_CATALOGUE_SHA256 =
  "737ad89cf3acb76ee65b16d0c4023f89c1100ecfe4b8e4ddd2d280097b269f0f";
/** The Economy-forward class segment exactly as #146 accepted it. A frozen literal, deliberately NOT the live constant. */
export const WORKSHOP_B3E_FORWARD_SEGMENT =
  "+B3-E-ECONOMY-REALIZED-ACCESS@2026-11-26T23:22:06.437Z";

/** #146's accepted DRAFT-class generation: G0's frozen recipe under the B3-E catalogue. It carries no forward class and no quiet-seal segment. */
export const WORKSHOP_GENERATION_B3E_DRAFT: WorkshopGeneration = Object.freeze({
  id: "B3E_DRAFT_146",
  catalogueSha256: WORKSHOP_B3E_CATALOGUE_SHA256,
  identity: WORKSHOP_GENERATION_G0.identity,
});

/**
 * #146's accepted FORWARD-class generation, frozen and self-contained: G0's literal base, the draft flag dropped, the choice tail, the forward segment
 * as #146 spelled it and the G0 terminal IF-6b segment. Its class authority is its own `economyClass`: only a forward-class admission lists it, so a
 * draft-class build cannot select it and a forward-class build cannot select any draft entry.
 */
export const WORKSHOP_GENERATION_B3E_FORWARD: WorkshopGeneration = Object.freeze({
  id: "B3E_FORWARD_146",
  catalogueSha256: WORKSHOP_B3E_CATALOGUE_SHA256,
  economyClass: "ECONOMY_REALIZED_ACCESS_FORWARD",
  identity: (inputs: WorkshopIdentityInputs) => {
    const workshopId = `${WORKSHOP_G0_FIXTURE_BASE}+B3-WORKSHOP-OWNER-V1:${inputs.profileSha256}${
      inputs.noticeVerificationId !== undefined ? `:${inputs.noticeVerificationId}` : ""
    }`;
    if (!inputs.laneX) return workshopId;
    return (
      workshopId +
      (inputs.laneX.choiceSha256 !== undefined ? "+B3-CHOICE:" + inputs.laneX.choiceSha256 : "") +
      WORKSHOP_B3E_FORWARD_SEGMENT +
      "+" +
      WORKSHOP_G0_IF6B_POLICY
    );
  },
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
      composeWorkshopIdentity(inputs, {
        if6bPolicy: liveIf6bPolicy,
        quietSealSegment: GM_WAIT_IF6B_QUIET_SEAL_SEGMENT,
      }),
  });

export const workshopEconomyForwardGeneration = (
  if6bPolicy: string,
  economyForwardSegment: string,
): WorkshopGeneration =>
  Object.freeze({
    id: "CURRENT",
    catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    economyClass: "ECONOMY_REALIZED_ACCESS_FORWARD",
    identity: (inputs: WorkshopIdentityInputs) =>
      composeWorkshopIdentity(inputs, {
        if6bPolicy,
        economyForwardSegment,
        quietSealSegment: GM_WAIT_IF6B_QUIET_SEAL_SEGMENT,
      }),
  });

/**
 * The version of the historical verifier that selects an original policy. A workshop admission's checkpoint-cache identity is its recorded identity plus
 * this segment, so a checkpoint earned before the resolver existed is replayed strictly once instead of being trusted. Any change to the registry or to
 * how a lineage is bound is a change to this verifier and MUST move this version.
 */
export const WORKSHOP_RESOLVER_VERIFIER_SEGMENT = "+WORKSHOP-ORIGINAL-POLICY-RESOLVER-V3";

/** One candidate: a registry entry with its identity recomputed for THIS admission's constructed inputs. */
export interface WorkshopGenerationCandidate {
  readonly id: string;
  readonly binding: WorkshopPolicyBinding;
  readonly economyClass?: WorkshopGeneration["economyClass"];
}

/**
 * The finite candidate set, current first. Two entries that recompute to the same pair are one candidate (today CURRENT is G0).
 * `current` is injectable ONLY so a testkit admission can stand in for a successor build; production uses the default.
 */
export function workshopCandidates(
  inputs: WorkshopIdentityInputs,
  current: WorkshopGeneration,
  historical: readonly WorkshopGeneration[] = [
    WORKSHOP_GENERATION_B3E_FORWARD,
    WORKSHOP_GENERATION_B3E_DRAFT,
    WORKSHOP_GENERATION_149,
    WORKSHOP_GENERATION_G0,
  ],
): readonly WorkshopGenerationCandidate[] {
  const out: WorkshopGenerationCandidate[] = [];
  // class authority comes from the CONSTRUCTOR (the current generation's class), never from a recorded lineage: a historical entry of the other class is not a candidate
  for (const g of [current, ...historical.filter((h) => h.economyClass === current.economyClass)]) {
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
      out.push(
        Object.freeze({
          id: g.id,
          binding,
          ...(g.economyClass ? { economyClass: g.economyClass } : {}),
        }),
      );
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
