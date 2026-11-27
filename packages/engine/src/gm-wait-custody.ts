import {
  CANON_WRITE_AUTHORITY,
  FACET_TEMPORAL_COORDINATION,
  GM_WAIT_CONTEXT,
  GM_WAIT_ORIGIN,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitStoredTransactionSchema,
  GmWaitStagedTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  OWNER_TEMPORAL_KERNEL,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  TEMPORAL_GM_WAIT_BY_PC_PREFIX,
  TEMPORAL_GM_WAIT_KEY_PREFIX,
  TEMPORAL_GM_WAIT_MARKER_PREFIX,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  ResolutionTransactionSchema,
  TransactionAuthoritySchema,
  compareTime,
  fail,
  gmWaitIndexIsTerminal,
  ok,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  timeEquals,
  EntityId,
  type CanonicalTime,
  type CommitGroup,
  type Failure,
  type GmWaitByPcIndex,
  type GmWaitMarker,
  type GmWaitPreparation,
  type GmWaitResolutionTransaction,
  type GmWaitStoredTransaction,
  type CommitReceipt,
  type GmWaitTransactionAuthority,
  type OwnerFact,
  type Result,
  type SourceRef,
} from "@immortalis/contracts";
import {
  IF6B_POLICY,
  IF6B_RESUME_TRIGGER,
  if6bAdmissionOf,
  if6bStageFor,
  recordIf6bStage,
  type If6bCommittedStage,
} from "./temporal/if6b-stage.ts";
import { if6bSettlement } from "./temporal/if6b-settlement.ts";
import type { CampaignState, CommitErrorCode } from "./commit/campaign-core.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "./gm-wait-catalogue-current.ts";
import { canonicalEqual, sha256Canonical } from "./hash.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "./persistence/store.ts";
import { transactionCause, transactionGroupId, transactionIntentId } from "./temporal/identity.ts";
import {
  gmWaitCause,
  gmWaitMarkerGroupId,
  gmWaitMarkerIntentId,
  gmWaitNoOpenGroupId,
  gmWaitNoOpenIntentId,
  gmWaitOpenGroupId,
  gmWaitOpenIntentId,
  gmWaitReconcileGroupId,
  gmWaitReconcileIntentId,
  gmWaitRefSha256,
  gmWaitTransactionId,
  gmWaitX,
  isWellFormedText,
} from "./gm-wait-identity.ts";

/**
 * F-014B B2 — GM-wait CUSTODY (BLUE N7 / Sovereign-ratified D4(e); W2 v0.6.1; RED R-5 / R-7e / R-8). MECHANISM ONLY.
 *
 * What this module is:
 *   1. the fixed registered SourceRef the two new Temporal kinds carry (`GM_WAIT_CUSTODY_RULE`);
 *   2. the common W2 FENCE: a view DERIVED from the committed facts (never from an ACTIVE label, a snapshot or a set of
 *      rule-checked ids) and the one pure predicate that every admission path, the commit core and the extension binding apply;
 *   3. the CUSTODY transition checks: marker, separate OPEN, NO_OPEN, own seal and sealed reconciliation, each judged against
 *      the exact prestate it publishes on (live) or was committed on (historical replay);
 *   4. pure group BUILDERS and a small WRITER (`GmWaitCustody`) that publishes those transitions through the ordinary store.
 *
 * What it is not: a positive production path. A marker needs a qualified original-owner preparation (a pending enrolment, or a
 * separately authorized quiet variant) that does not exist in this build, so the production policy qualifies none and refuses
 * every marker. Only the TESTKIT-ONLY fixture admission can qualify a synthetic one, under a distinct history policy. No World-State
 * notice, Named-Actor duty or Health write, no positive S4 admission and no all-enrolled evaluator exist here.
 */

// ---------------------------------------------------------------------------------------------
// The registered citation and the history-policy segment
// ---------------------------------------------------------------------------------------------

/**
 * The ONE SourceRef both new kinds (and the GM variant of the opening authority) carry: the Sovereign-ratified D4(e) / SC-11
 * source identity with its BLUE N7 and RED R-5 / R-7e / R-8 lineage. It is deliberately NOT the 2026-09-25 frozen-spec-lock
 * citation: neither kind is part of the frozen Temporal §2 original kind set, and the ratification is DESIGN ONLY. Earlier Temporal
 * facts keep their own original citations.
 */
export const GM_WAIT_CUSTODY_RULE: SourceRef = {
  artifact: "https://app.notion.com/p/42020af901e081f69ab3e6c32e4f19e7",
  native_pin: "2026-11-22T13:06:43.623Z",
  clause:
    "D4(e) / SC-11 — BLUE N7 (prospective Temporal marker `temporal_gm_wait_marker`, authoritative by-PC index `temporal_gm_wait_pc_index`, separate OPEN, NO_OPEN and sealed reconciliation) under RED R-7e (Temporal §2 slot, sole authoritative per-PC carrier, X encoding, terminal NO_OPEN / SEALED_RECONCILED), R-5 and R-8, with N8 (activation boundary); the strict prospective GM variant of the durable opening authority and of the sealed ResolutionTransaction; mechanism only, S4 HOLD",
  authority_lineage: [
    "BLUE Final Source-Authority Decision & Engineering Closure N5/N7/N8, native pin 2026-11-22T12:38:56.838Z (https://app.notion.com/p/42020af901e081efaae2c0d6994ca46c)",
    "RED Terminal Source-Authority Adjudication R-5 / R-7e / R-8, native pin 2026-11-22T13:02:53.745Z (https://app.notion.com/p/42020af901e081ba9830d14070ec9789)",
    "BLUE S4/W2 Source Adjudication v0.6.1 (ACTIVE, original history, extension bypass), native pin 2026-11-21T15:15:58.966Z (https://app.notion.com/p/41f20af901e081448986f69d7e3c723d)",
    "Sovereign ratification AM-3.1 / AM-3.2 / AM-3.3 / AM-3.P, native pin 2026-11-16T06:58:35.373Z (https://app.notion.com/p/41a20af901e081ecbd92fefe3a524dc4)",
    "BLUE B2 scoped hard preflight PASS, mechanism-only construction brief, native pin 2026-11-22T17:48:36.869Z (https://app.notion.com/p/42020af901e08142a5f2c5fa36fd1b0e); construction issue #133",
    "Runtime/Translation v0.2 §5.2 canonical publication by role.archivist + permission.canon.write; D3(b), R-DUTY and R-H are NOT adopted and nothing here writes in those domains",
  ],
  effective_basis: "sovereign-ratified-design-only-prospective-mechanism-only",
  supersedes: null,
};

/**
 * The historical-verification segment this slice adds. Any canonical admission whose `historyVerificationId` lacks it is not a
 * protected-store admission: custody writes are refused under it, and a store whose package holds custody facts will not open
 * writable under it. Appending it to the composed identity also forces ONE strict replay of any checkpoint earned before it.
 */
export const GM_WAIT_W2_HISTORY_POLICY_SEGMENT = "+GM-WAIT-W2-CUSTODY-V1@2026-11-22T17:48:36.869Z";

/** Whether an admission is one that carries the W2 custody verifier (it composed the segment into its history identity). */
export const gmWaitAdmissionInstalled = (
  admission: { readonly historyVerificationId?: string } | undefined,
): boolean =>
  admission?.historyVerificationId?.includes(GM_WAIT_W2_HISTORY_POLICY_SEGMENT) === true;

// ---------------------------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------------------------

type Rejection = Failure<CommitErrorCode>;
const refuse = (
  code: CommitErrorCode,
  reason: string,
  message: string,
  details?: Record<string, unknown>,
): Rejection => ({ code, message, details: { reason, ...details } });
const bad = (reason: string, message: string, details?: Record<string, unknown>): Rejection =>
  refuse("REFERENCE_INVALID", reason, message, details);

export const GM_WAIT_REFUSALS = [
  "GM_WAIT_ADMISSION_ABSENT",
  "GM_WAIT_FENCE_UNKNOWN",
  "GM_WAIT_ACTIVE_FOREIGN",
  "GM_WAIT_STAGE_CLAIM_UNSOURCED",
  "GM_WAIT_RESERVED_NAMESPACE",
  "GM_WAIT_GROUP_SHAPE",
  "GM_WAIT_VALUE_INVALID",
  "GM_WAIT_IDENTITY",
  "GM_WAIT_SLOT_OCCUPIED",
  "GM_WAIT_PREPARATION_UNQUALIFIED",
  "GM_WAIT_PROOF_MISSING",
  "GM_WAIT_PROOF_MISMATCH",
  "GM_WAIT_WITNESS",
  "GM_WAIT_STALE",
  "GM_WAIT_TRANSITION",
  "GM_WAIT_SEAL",
  "GM_WAIT_POLICY",
] as const;

// ---------------------------------------------------------------------------------------------
// Custody-key recognition (pure string / shape inspection; no registry, so the commit core can use it)
// ---------------------------------------------------------------------------------------------

const AUTHORITY_PREFIX = "temporal/transaction-authority/";
const SEAL_PREFIX = "temporal/transaction/";
const GM_TRANSACTION_ID_PREFIX = "gm-wait:";

const RESERVED_X_TRANSACTION_ID = /^gm-wait:[0-9a-f]{64}$/;

// What a group's cause and dependencies may NAME. The causes and group ids below are the ones only the kernel's own X groups carry: the marker, OPEN,
// NO_OPEN and reconciliation groups (cause `gm-wait:<x>`) and the OPEN and seal of the transaction (cause `transaction:gm-wait:<x>`). A LIVE
// publication is refused for anything that merely begins with them; a REPLAYED entry only for the exact X-shaped identity this build derives (`gm-wait:`
// + 64 lowercase hex), which no earlier valid history can carry, so older history is never reinterpreted.
const X_CAUSE_PREFIXES = ["gm-wait:", "transaction:gm-wait:"] as const;
const X_CAUSE_SHAPE = /^(?:transaction:)?gm-wait:[0-9a-f]{64}$/;
const X_GROUP_ID_PREFIXES = [
  "gm-wait-marker-group:",
  "gm-wait-open-group:",
  "gm-wait-no-open-group:",
  "gm-wait-reconcile-group:",
  "transaction-group:gm-wait:",
] as const;
const X_GROUP_ID_SHAPE =
  /^(?:gm-wait-(?:marker|open|no-open|reconcile)-group:|transaction-group:gm-wait:)[0-9a-f]{64}$/;

/**
 * What, if anything, a group CLAIMS about a GM wait: a cause that names the wait, or a dependency on one of the wait's own kernel groups. These are the
 * only two things that make a group look like a "stage of X" (the cause chain and the dependency on the opening). Only the kernel's own custody and
 * seal groups may carry them: the caller exempts those, and judges them by the custody rules.
 */
function gmWaitClaimOf(group: CommitGroup, live: boolean): string | null {
  const causeClaims = live
    ? X_CAUSE_PREFIXES.some((p) => group.cause.startsWith(p))
    : X_CAUSE_SHAPE.test(group.cause);
  if (causeClaims) return `cause ${group.cause}`;
  const dependency = group.depends_on.find((d) =>
    live ? X_GROUP_ID_PREFIXES.some((p) => d.startsWith(p)) : X_GROUP_ID_SHAPE.test(d),
  );
  return dependency === undefined ? null : `dependency ${dependency}`;
}
/** The transaction identity a kernel key addresses (an authority or a seal), or null for any other key. */
const transactionIdOfKey = (key: string): string | null =>
  key.startsWith(AUTHORITY_PREFIX)
    ? key.slice(AUTHORITY_PREFIX.length)
    : key.startsWith(SEAL_PREFIX)
      ? key.slice(SEAL_PREFIX.length)
      : null;

const hasOrigin = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { origin?: unknown }).origin === GM_WAIT_ORIGIN;

type Write = CommitGroup["writes"][number];
const isCustodyKey = (key: string): boolean => key.startsWith(TEMPORAL_GM_WAIT_KEY_PREFIX);
const isGmAuthorityWrite = (w: Write): boolean =>
  w.key.startsWith(AUTHORITY_PREFIX) && hasOrigin(w.value);
const isGmSealWrite = (w: Write): boolean => w.key.startsWith(SEAL_PREFIX) && hasOrigin(w.value);

/** Whether a group publishes any custody fact or any GM-variant authority / seal. */
export const gmWaitIsCustodyGroup = (group: CommitGroup): boolean =>
  group.writes.some((w) => isCustodyKey(w.key) || isGmAuthorityWrite(w) || isGmSealWrite(w));

// ---------------------------------------------------------------------------------------------
// The derived W2 fence view
// ---------------------------------------------------------------------------------------------

export interface GmWaitActive {
  readonly x: string;
  readonly pcId: string;
  readonly transactionId: string;
  readonly authorityKey: string;
  readonly authorityGroupId: string;
  readonly sealKey: string;
}

/**
 * Work counters of the W2 fence (cf. `msFenceMetrics`): read-only evidence of what the fence costs, never an input to any decision.
 * `derivations` / `scannedFacts` count full passes over a state (a core being built, or a custody group); `checks` / `keyInspections` count the
 * per-group predicate and the write keys it inspected; `advances` counts durable adoptions and `rederivations` those that needed a pass.
 */
export const gmWaitFenceMetrics = {
  derivations: 0,
  scannedFacts: 0,
  checks: 0,
  keyInspections: 0,
  advances: 0,
  rederivations: 0,
};

export interface GmWaitFence {
  readonly campaign: string;
  readonly revision: number;
  /** the campaign holds at least one custody fact: its store must open under a W2 admission */
  readonly protected: boolean;
  /** ACTIVE: a verified durable OPEN and no seal of the same X */
  readonly active: GmWaitActive | null;
  readonly stages?: readonly If6bCommittedStage[];
  /** non-null when the committed custody facts are not mutually consistent: nothing may be published (HELD) */
  readonly unknown: string | null;
}

/**
 * Derives the fence from the COMMITTED FACTS of one state: the by-PC index, the immutable marker, the opening authority and the
 * seal. ACTIVE is the durable OPEN with no seal, read from those records, never from a label on its own: an index that says OPEN
 * whose authority is absent, or does not name the same X, is `unknown`, and `unknown` publishes nothing.
 */
export function deriveGmWaitFence(state: CampaignState): GmWaitFence {
  gmWaitFenceMetrics.derivations++;
  gmWaitFenceMetrics.scannedFacts += state.facts.size;
  let isProtected = false;
  let unknown: string | null = null;
  const actives: GmWaitActive[] = [];
  const hold = (reason: string) => {
    unknown ??= reason;
  };
  for (const [key, fact] of state.facts) {
    if (!key.startsWith(TEMPORAL_GM_WAIT_KEY_PREFIX)) continue;
    isProtected = true;
    if (!key.startsWith(TEMPORAL_GM_WAIT_BY_PC_PREFIX)) continue;
    const parsed = GmWaitByPcIndexSchema.safeParse(fact.value);
    if (!parsed.success || key !== temporalGmWaitByPcKey(parsed.data.pc_id)) {
      hold("the by-PC index is not a strict index of its own key");
      continue;
    }
    const idx = parsed.data;
    const marker = state.facts.get(idx.marker.key);
    if (
      idx.marker.key !== temporalGmWaitMarkerKey(idx.x) ||
      !marker ||
      marker.version !== 1 ||
      marker.provenance.group_id !== idx.marker.group_id
    ) {
      hold("the by-PC index names a marker that is not the committed immutable marker");
      continue;
    }
    const tx = gmWaitTransactionId(idx.x);
    const authorityKey = temporalTransactionAuthorityKey(tx);
    const sealKey = temporalTransactionKey(tx);
    const authority = state.facts.get(authorityKey);
    const sealed = state.facts.has(sealKey);
    if (idx.state === "MARKED" || idx.state === "NO_OPEN") {
      if (authority || sealed)
        hold("an index that never opened has an opening authority or a seal");
      continue;
    }
    const parsedAuthority = authority
      ? GmWaitTransactionAuthoritySchema.safeParse(authority.value)
      : undefined;
    if (
      !authority ||
      !parsedAuthority?.success ||
      parsedAuthority.data.x !== idx.x ||
      idx.open_authority === null ||
      idx.open_authority.key !== authorityKey ||
      authority.provenance.group_id !== idx.open_authority.group_id
    ) {
      hold("the by-PC index names an opening authority that is not the durable opening of its X");
      continue;
    }
    if (idx.state === "SEALED_RECONCILED" && !sealed) {
      hold("a reconciled index has no seal");
      continue;
    }
    if (idx.state === "OPEN" && !sealed) {
      actives.push({
        x: idx.x,
        pcId: idx.pc_id,
        transactionId: tx,
        authorityKey,
        authorityGroupId: authority.provenance.group_id,
        sealKey,
      });
    }
  }
  if (actives.length > 1) hold("more than one wait is ACTIVE in one campaign");
  return {
    campaign: state.campaign_id,
    revision: state.revision,
    protected: isProtected,
    active: actives.length === 1 ? (actives[0] ?? null) : null,
    unknown,
  };
}

/**
 * The fence after one durable adoption. Only a group that writes a custody key, or the seal of the ACTIVE transaction, can change
 * it, so the common path is a constant-time carry; everything else is re-derived from the new state.
 */
export function advanceGmWaitFence(
  prior: GmWaitFence,
  group: CommitGroup,
  next: CampaignState,
  before?: CampaignState,
  admission?: { readonly historyVerificationId?: string },
  receipt?: CommitReceipt,
): GmWaitFence {
  const sealKey = prior.active?.sealKey;
  gmWaitFenceMetrics.advances++;
  const changes = group.writes.some(
    (w) => isCustodyKey(w.key) || w.key === sealKey || isGmAuthorityWrite(w) || isGmSealWrite(w),
  );
  if (!changes) {
    const witness = before && receipt ? if6bStageFor(group, before, prior, admission) : undefined;
    const stages =
      witness && before && receipt
        ? [...(prior.stages ?? []), recordIf6bStage(group, before, witness, receipt)]
        : prior.stages;
    return { ...prior, revision: next.revision, ...(stages ? { stages } : {}) };
  }
  gmWaitFenceMetrics.rederivations++;
  return deriveGmWaitFence(next);
}

/** The fence of a state, from the commit core's view when it has one, otherwise derived. */
const fences = new WeakMap<CampaignState, GmWaitFence>();
export function registerGmWaitFence(state: CampaignState, fence: GmWaitFence): void {
  fences.set(state, fence);
}
export function gmWaitFenceOf(state: CampaignState): GmWaitFence {
  const known = fences.get(state);
  if (known && known.campaign === state.campaign_id && known.revision === state.revision)
    return known;
  const derived = deriveGmWaitFence(state);
  fences.set(state, derived);
  return derived;
}

/** The checkpoint seam: a checkpoint state with an ACTIVE interval carries no ordered interval proof, so it must be replayed strictly. */
export const gmWaitCheckpointNeedsStrictReplay = (state: CampaignState): boolean => {
  const fence = deriveGmWaitFence(state);
  return fence.active !== null || fence.unknown !== null || interruptedWait(state) !== undefined;
};

/** A held interrupted GM seal is owned by the continuation already recorded on the one clock. */
function interruptedWait(state: CampaignState) {
  const clock = TemporalStateSchema.safeParse(state.facts.get(TEMPORAL_STATE_KEY)?.value);
  const held = clock.success ? clock.data.continuation : null;
  if (!held?.from_transaction.startsWith(GM_TRANSACTION_ID_PREFIX)) return undefined;
  const seal = GmWaitStagedTransactionSchema.safeParse(
    state.facts.get(temporalTransactionKey(held.from_transaction))?.value,
  );
  return seal.success && seal.data.outcome.stop_reason === "INTERRUPTED" ? seal.data : undefined;
}

function interruptedResumeDecision(
  group: CommitGroup,
  state: CampaignState,
  admission: { readonly historyVerificationId?: string } | undefined,
  live: boolean,
): boolean | undefined {
  if (group.owner !== OWNER_TEMPORAL_KERNEL) return undefined;
  for (const w of group.writes) {
    const id = transactionIdOfKey(w.key);
    if (id === null) continue;
    const parsed =
      w.key === temporalTransactionAuthorityKey(id)
        ? TransactionAuthoritySchema.safeParse(w.value)
        : ResolutionTransactionSchema.safeParse(w.value);
    if (!parsed.success) continue;
    const held = interruptedWait(state);
    if (!held) return live && parsed.data.trigger.kind === IF6B_RESUME_TRIGGER ? false : undefined;
    return (
      parsed.data.continues === held.transaction_id &&
      parsed.data.trigger.kind === IF6B_RESUME_TRIGGER &&
      !X_CAUSE_PREFIXES.some((prefix) => group.cause.startsWith(prefix)) &&
      group.depends_on.every(
        (dep) =>
          !X_GROUP_ID_PREFIXES.some((prefix) => dep.startsWith(prefix)) ||
          dep === transactionGroupId(held.transaction_id),
      ) &&
      if6bAdmissionOf(admission)?.verifyResume?.(group, state, held) === true
    );
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The common W2 fence predicate (live and historical; core, base admission and extension binding all call this one function)
// ---------------------------------------------------------------------------------------------

/**
 * One group's admissibility under the fence, judged against the exact state it would publish on (live) or was committed on
 * (historical replay):
 *
 *  - a group that writes a custody fact, or a GM-variant authority / seal, must be a Temporal-kernel group published under an
 *    admission that carries the W2 verifier (a missing or foreign admission fails CLOSED);
 *  - a state whose custody facts are inconsistent publishes nothing (HELD);
 *  - no group other than the kernel's own custody and seal groups may NAME a GM wait (a cause that names it, a dependency on its kernel groups): an owner
 *    "stage of X" has no source witness in this build, so a claim to be one is refused at every moment (BLUE F-1 / F-2);
 *  - while a wait is ACTIVE, every novel group of the campaign is refused except X's own seal. A replay of an identical committed group never
 *    reaches here: the core answers it from the receipt before validating.
 *
 * It judges NOTHING else: every owner rule is still the owner's own admission, which still runs.
 */
export function gmWaitFenceViolation(
  group: CommitGroup,
  fence: GmWaitFence,
  admission: { readonly historyVerificationId?: string } | undefined,
  live: boolean,
  state?: CampaignState,
): Rejection | null {
  gmWaitFenceMetrics.checks++;
  gmWaitFenceMetrics.keyInspections += group.writes.length;
  const custody = gmWaitIsCustodyGroup(group);
  if (custody) {
    if (!gmWaitAdmissionInstalled(admission))
      return refuse(
        "KEY_NOT_ADMITTED",
        "GM_WAIT_ADMISSION_ABSENT",
        "GM-wait custody is published only under an admission that carries the W2 custody verifier",
      );
    if (group.owner !== OWNER_TEMPORAL_KERNEL || group.facet !== FACET_TEMPORAL_COORDINATION)
      return refuse(
        "KEY_NOT_ADMITTED",
        "GM_WAIT_GROUP_SHAPE",
        "a GM-wait custody fact is written only by the Temporal kernel owner and facet",
      );
  }
  // The GM transaction identity namespace is reserved for the strict GM variant: a legacy-shaped value cannot squat on it. A NEW write is
  // refused for the whole `gm-wait:` prefix; a REPLAYED entry only for the exact X-shaped identity this build derives (`gm-wait:` + 64
  // lowercase hex), which no earlier history can carry, so older valid history is never reinterpreted.
  for (const w of group.writes) {
    const id = transactionIdOfKey(w.key);
    if (
      id !== null &&
      !hasOrigin(w.value) &&
      (live ? id.startsWith(GM_TRANSACTION_ID_PREFIX) : RESERVED_X_TRANSACTION_ID.test(id))
    )
      return refuse(
        "KEY_NOT_ADMITTED",
        "GM_WAIT_RESERVED_NAMESPACE",
        "the gm-wait transaction identity namespace is reserved for the strict GM variant",
        { key: w.key },
      );
  }
  // BLUE F-1 / F-2 (the one common predicate): the opening of a wait is the kernel's, and so is everything that names it. NO other group may claim to be
  // a stage of X, or to hang from X's marker or opening, at ANY time: before OPEN (so a NO_OPEN can certify that no stage of X exists, by construction and
  // with no scan), while ACTIVE, and after the seal. B2 has no source witness for an owner stage of a GM wait (no due roster, no B3 writer), so a stage
  // that merely carries the right cause and dependency is stage-shaped metadata, never evidence: it is refused here, ahead of every owner rule and every
  // extension early return, live and in original-policy historical verification.
  const resume =
    !custody && !fence.active && !fence.unknown && state
      ? interruptedResumeDecision(group, state, admission, live)
      : undefined;
  if (resume === false)
    return refuse(
      "REFERENCE_INVALID",
      "GM_WAIT_INTERRUPTED_RESUME_UNAUTHORIZED",
      "the interrupted remainder requires a separately authenticated choice at its decision opportunity",
    );
  if (!custody && resume !== true) {
    const claim = gmWaitClaimOf(group, live);
    if (claim !== null) {
      if (state && if6bStageFor(group, state, fence, admission)) return null;
      if (
        state &&
        !fence.active &&
        fence.unknown === null &&
        if6bAdmissionOf(admission)?.verifyAftermath?.(group, state)
      )
        return null;
      return refuse(
        "KEY_NOT_ADMITTED",
        "GM_WAIT_STAGE_CLAIM_UNSOURCED",
        "only the Temporal kernel's own custody and seal groups may name a GM wait: an owner stage of a GM wait has no source witness in this build",
        { claim },
      );
    }
  }
  if (fence.unknown !== null)
    return refuse(
      "REFERENCE_INVALID",
      "GM_WAIT_FENCE_UNKNOWN",
      "the committed GM-wait custody facts are not consistent: the campaign is HELD and publishes nothing",
      { detail: fence.unknown },
    );
  const active = fence.active;
  if (!active) return null;
  // While ACTIVE the ONLY novel group published is that transaction's own seal (judged by the custody rules). There is no stage branch: see above.
  const isSeal =
    group.owner === OWNER_TEMPORAL_KERNEL && group.writes.some((w) => w.key === active.sealKey);
  if (isSeal) return null;
  return refuse(
    "REFERENCE_INVALID",
    "GM_WAIT_ACTIVE_FOREIGN",
    "a GM wait is ACTIVE: only that transaction's own seal is published",
  );
}

// ---------------------------------------------------------------------------------------------
// The ephemeral configured-GM origin proof (live only; never persisted)
// ---------------------------------------------------------------------------------------------

/**
 * The verified ORIGINAL configured GM session, the already-serialized original JSON-RPC id text and the authenticated host
 * reference, held in memory for the one publication that needs them. A marker, OPEN, NO_OPEN or reconciliation commits only when the
 * proof registered for that exact group digest recomputes the X, and the hashes, the marker recorded. A group built by anyone who
 * did not hold the proof, however well-shaped and however correctly hashed, is refused ("hold when the ephemeral proof is
 * missing"). Replay never has the proof (the session is long gone): historical verification judges what the journal recorded.
 */
export class GmWaitOriginProof {
  readonly #session: string;
  readonly #rpc: string;
  readonly #host: string;
  constructor(session: string, rpc: string, host: string) {
    this.#session = session;
    this.#rpc = rpc;
    this.#host = host;
  }
  /** Module-private derivations used by admission and the writer. */
  static derive(proof: GmWaitOriginProof): {
    x: string;
    session_ref_sha256: string;
    rpc_id_serialized_sha256: string;
    host_ref_sha256: string;
  } | null {
    const x = gmWaitX(proof.#session, proof.#rpc);
    if (!x.ok || proof.#host.length === 0 || !isWellFormedText(proof.#host)) return null;
    return {
      x: x.x,
      session_ref_sha256: gmWaitRefSha256("session", proof.#session),
      rpc_id_serialized_sha256: gmWaitRefSha256("rpc-id-serialized", proof.#rpc),
      host_ref_sha256: gmWaitRefSha256("authenticated-host", proof.#host),
    };
  }
}

/**
 * Mints the proof from what the trusted configured-GM adapter already verified. The engine cannot authenticate a session: it only
 * refuses an input that is not a non-empty well-formed string. `rpcIdSerialized` is the text `ToolContext.request.id` already is
 * (`JSON.stringify` of the original id) and is hashed as text, never serialized again. Production code outside the Temporal owner
 * must not import this: a static test enforces it.
 */
export function gmWaitOriginProof(input: {
  readonly sessionId: string;
  readonly rpcIdSerialized: string;
  readonly authenticatedHostRef: string;
}): Result<GmWaitOriginProof, "GM_WAIT_IDENTITY_INVALID"> {
  const proof = new GmWaitOriginProof(
    input.sessionId,
    input.rpcIdSerialized,
    input.authenticatedHostRef,
  );
  return GmWaitOriginProof.derive(proof)
    ? ok(proof)
    : fail(
        "GM_WAIT_IDENTITY_INVALID",
        "the verified session, request id and host must be non-empty well-formed text",
      );
}

const liveProofs = new Map<string, GmWaitOriginProof>();
const proofFor = (group: CommitGroup): GmWaitOriginProof | undefined =>
  liveProofs.get(sha256Canonical(group));

// ---------------------------------------------------------------------------------------------
// Custody policy (what qualifies a preparation)
// ---------------------------------------------------------------------------------------------

export interface GmWaitCustodyPolicy {
  /**
   * NONE: production. No original-owner preparation exists in this build (D3(b) is HELD), so none qualifies and every marker is
   * refused. FIXTURE: the TESTKIT-ONLY admission qualifies one synthetic extension-owner fact; its history identity is distinct.
   */
  readonly preparation: "NONE" | "FIXTURE";
  readonly if6b?: import("./temporal/if6b-stage.ts").If6bAdmission;
  readonly historyVerificationId: string;
  /**
   * The catalogue digest PAIRED with `historyVerificationId`. Set only by an admission whose workshop generation was selected
   * (owners/workshop/generation.ts): a marker that states this identity must then state exactly this digest, so a retained digest
   * of another generation cannot be paired with it. Unset, the marker's digest is checked against the retained list as before.
   */
  readonly catalogueSha256?: string;
  /** whether `owner` is a canonical or kernel owner (the fixture preparation must come from a non-canonical, synthetic owner) */
  readonly isCanonicalOwner: (owner: string) => boolean;
}

// ---------------------------------------------------------------------------------------------
// Typed readers
// ---------------------------------------------------------------------------------------------

const parseMarker = (fact: OwnerFact | undefined): GmWaitMarker | null => {
  const r = fact ? GmWaitMarkerSchema.safeParse(fact.value) : undefined;
  return r?.success ? r.data : null;
};
const parseIndex = (fact: OwnerFact | undefined): GmWaitByPcIndex | null => {
  const r = fact ? GmWaitByPcIndexSchema.safeParse(fact.value) : undefined;
  return r?.success ? r.data : null;
};

const sortedReads = (reads: readonly { key: string; version: number }[]) =>
  [...reads].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
const sameReads = (
  actual: readonly { key: string; version: number }[],
  expected: readonly { key: string; version: number }[],
): boolean => canonicalEqual(sortedReads(actual), sortedReads(expected));
const sameDeps = (actual: readonly string[], expected: readonly string[]): boolean =>
  canonicalEqual([...new Set(actual)].sort(), [...new Set(expected)].sort());

/** The canonical-time and version of the current Temporal state, when it is well-formed. */
function currentClock(state: CampaignState): {
  fact: OwnerFact;
  time: CanonicalTime;
  held: boolean;
} | null {
  const fact = state.facts.get(TEMPORAL_STATE_KEY);
  const s = fact ? TemporalStateSchema.safeParse(fact.value) : undefined;
  return fact && s?.success
    ? { fact, time: s.data.canonical_time, held: s.data.continuation !== null }
    : null;
}

// ---------------------------------------------------------------------------------------------
// The custody transition checks
// ---------------------------------------------------------------------------------------------

export interface GmWaitCheckContext {
  readonly policy: GmWaitCustodyPolicy;
  /** live publication (the ephemeral origin proof and the current catalogue are required) or historical replay */
  readonly live: boolean;
}

/**
 * Judges one custody group against `state`: the marker + index group, the separate OPEN, a NO_OPEN, an own seal and a sealed
 * reconciliation. Returns null for a group that is not a custody group. Pure apart from reading the live ephemeral proof, which only
 * a live publication consults.
 */
export function gmWaitCustodyCheck(
  group: CommitGroup,
  state: CampaignState,
  ctx: GmWaitCheckContext,
): Rejection | null {
  if (!gmWaitIsCustodyGroup(group)) return null;
  const writes = group.writes;
  const markerW = writes.filter((w) => w.key.startsWith(TEMPORAL_GM_WAIT_MARKER_PREFIX));
  const indexW = writes.filter((w) => w.key.startsWith(TEMPORAL_GM_WAIT_BY_PC_PREFIX));
  const authW = writes.filter(isGmAuthorityWrite);
  const sealW = writes.filter(isGmSealWrite);
  const shape = (message: string) => bad("GM_WAIT_GROUP_SHAPE", message);

  if (sealW.length > 0) {
    if (sealW.length !== 1 || markerW.length > 0 || indexW.length > 0 || authW.length > 0)
      return shape("a GM seal group writes no marker, index or authority, and exactly one GM seal");
    return sealCheck(group, state, sealW[0]!);
  }
  if (indexW.length !== 1) return shape("a custody group writes exactly one by-PC index");
  const indexWrite = indexW[0]!;
  const index = GmWaitByPcIndexSchema.safeParse(indexWrite.value);
  if (!index.success)
    return bad("GM_WAIT_VALUE_INVALID", "the by-PC index is not a strict index", {
      key: indexWrite.key,
    });
  const next = index.data;
  if (indexWrite.key !== temporalGmWaitByPcKey(next.pc_id))
    return bad("GM_WAIT_IDENTITY", "the index key is not the key of its PC", {
      key: indexWrite.key,
    });
  if (next.campaign_id !== state.campaign_id)
    return bad("GM_WAIT_IDENTITY", "the index names another campaign");
  if (next.predecessor_index_version !== indexWrite.expected_version)
    return bad(
      "GM_WAIT_TRANSITION",
      "the index records its predecessor version, and it is exactly the expected version",
    );

  if (next.state === "MARKED") {
    if (markerW.length !== 1 || authW.length !== 0 || writes.length !== 2)
      return shape("a marker group writes exactly the immutable marker and the index");
    return markerCheck(group, state, ctx, markerW[0]!, indexWrite, next);
  }
  if (markerW.length !== 0) return shape("only the marker group writes a marker");
  if (next.state === "OPEN") {
    if (authW.length !== 1 || writes.length !== 2)
      return shape("an OPEN group writes exactly the index and the opening authority");
    return openCheck(group, state, ctx, authW[0]!, indexWrite, next);
  }
  if (authW.length !== 0 || writes.length !== 1)
    return shape("a terminal transition writes the index alone");
  return next.state === "NO_OPEN"
    ? noOpenCheck(group, state, ctx, indexWrite, next)
    : reconcileCheck(group, state, ctx, indexWrite, next);
}

function groupIdentity(
  group: CommitGroup,
  ids: { group: string; intent: string; cause: string },
): Rejection | null {
  return group.group_id === ids.group && group.intent_id === ids.intent && group.cause === ids.cause
    ? null
    : bad(
        "GM_WAIT_IDENTITY",
        "a GM-wait group is published under the identity derived from X alone",
      );
}

function ruleViolation(group: CommitGroup): Rejection | null {
  return canonicalEqual(group.rule, GM_WAIT_CUSTODY_RULE)
    ? null
    : bad("GM_WAIT_POLICY", "a custody group cites the registered GM-wait custody rule");
}

/**
 * The live ephemeral proof, when the transition requires one: it must recompute X and the recorded session and request-id digests. The
 * authenticated HOST reference is deliberately not compared: a renewed OAuth grant, or a reconnect that independently re-verified the same
 * original session and request, is not an extra identity dimension (RED R-7e(3)); it is recorded once, at the marker, as provenance.
 */
function proofViolation(group: CommitGroup, marker: GmWaitMarker, live: boolean): Rejection | null {
  if (!live) return null;
  const proof = proofFor(group);
  if (!proof)
    return bad(
      "GM_WAIT_PROOF_MISSING",
      "no verified original configured-GM proof is present for this publication: the custody write is held",
    );
  const d = GmWaitOriginProof.derive(proof);
  if (
    !d ||
    d.x !== marker.x ||
    d.session_ref_sha256 !== marker.original.session_ref_sha256 ||
    d.rpc_id_serialized_sha256 !== marker.original.rpc_id_serialized_sha256
  )
    return bad(
      "GM_WAIT_PROOF_MISMATCH",
      "the verified original session and request do not derive the X this custody write names",
    );
  return null;
}

function preparationViolation(
  marker: GmWaitMarker,
  state: CampaignState,
  ctx: GmWaitCheckContext,
): Rejection | null {
  const unqualified = (message: string) => bad("GM_WAIT_PREPARATION_UNQUALIFIED", message);
  if (ctx.policy.preparation === "NONE")
    return unqualified(
      "no qualified original-owner pending enrolment or authorized quiet variant exists in this build: a production marker is refused",
    );
  if (ctx.policy.if6b && marker.policy.history_verification_id === ctx.policy.historyVerificationId)
    return ctx.policy.if6b.preparation(marker, state)
      ? null
      : unqualified("IF-6b requires the original qualified preparation at its committing cut");
  // a bound workshop lineage qualifies only through its own IF-6b preparation: no fall-through to the noncanonical fixture preparation
  if (ctx.policy.if6b && ctx.policy.catalogueSha256 !== undefined)
    return unqualified(
      "a marker of a bound workshop lineage must record the lineage's own identity; the fixture preparation does not qualify it",
    );
  const p: GmWaitPreparation = marker.preparation;
  const fact = state.facts.get(p.fact.key);
  if (
    !fact ||
    fact.version !== p.fact.version ||
    fact.provenance.group_id !== p.fact.group_id ||
    fact.owner !== p.owner ||
    ctx.policy.isCanonicalOwner(fact.owner) ||
    sha256Canonical(fact.value) !== p.digest
  )
    return unqualified(
      "the preparation is not a committed non-canonical fixture fact at the exact version, group and digest it names",
    );
  return null;
}

function markerCheck(
  group: CommitGroup,
  state: CampaignState,
  ctx: GmWaitCheckContext,
  markerWrite: Write,
  indexWrite: Write,
  next: Extract<GmWaitByPcIndex, { state: "MARKED" }>,
): Rejection | null {
  const parsed = GmWaitMarkerSchema.safeParse(markerWrite.value);
  if (!parsed.success)
    return bad("GM_WAIT_VALUE_INVALID", "the marker is not a strict marker", {
      key: markerWrite.key,
    });
  const m = parsed.data;
  if (
    markerWrite.expected_version !== 0 ||
    markerWrite.key !== temporalGmWaitMarkerKey(m.x) ||
    m.campaign_id !== state.campaign_id ||
    m.x !== next.x ||
    m.pc_id !== next.pc_id
  )
    return bad(
      "GM_WAIT_IDENTITY",
      "the marker is create-only at the key of its X, in this campaign, for the index's PC and X",
    );
  const identity =
    groupIdentity(group, {
      group: gmWaitMarkerGroupId(m.x),
      intent: gmWaitMarkerIntentId(m.x),
      cause: gmWaitCause(m.x),
    }) ?? ruleViolation(group);
  if (identity) return identity;
  if (
    !canonicalEqual(m.original_publication, {
      group_id: group.group_id,
      intent_id: group.intent_id,
      cause: group.cause,
    }) ||
    !canonicalEqual(next.marker, { key: markerWrite.key, version: 1, group_id: group.group_id })
  )
    return bad("GM_WAIT_IDENTITY", "the marker and the index record the group that published them");

  // one current X slot: a new X may take the key only after a terminal state, at the next expected version
  const prior = state.facts.get(indexWrite.key);
  if (!prior) {
    if (indexWrite.expected_version !== 0)
      return bad("GM_WAIT_TRANSITION", "a fresh by-PC index is created at expected version 0");
  } else {
    const priorIndex = parseIndex(prior);
    if (!priorIndex)
      return bad(
        "GM_WAIT_SLOT_OCCUPIED",
        "the current by-PC index is not readable: no second X may take the slot",
      );
    if (!gmWaitIndexIsTerminal(priorIndex.state) || priorIndex.x === m.x)
      return bad(
        "GM_WAIT_SLOT_OCCUPIED",
        "the PC's GM-wait slot is held by a wait that is not terminal",
      );
    if (indexWrite.expected_version !== prior.version)
      return bad("GM_WAIT_TRANSITION", "the next X takes the slot at the NEXT expected version");
  }

  // binding and basis
  const bindingFact = state.facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact
    ? PlayerCharacterBindingSchema.safeParse(bindingFact.value)
    : undefined;
  if (!bindingFact || !binding?.success || binding.data.active_pc.entity_id !== m.pc_id)
    return bad("GM_WAIT_WITNESS", "the marker's PC is not the committed active Player Character");
  if (
    !canonicalEqual(m.pc_binding, {
      key: PLAYER_CHARACTER_BINDING_KEY,
      version: bindingFact.version,
      provenance_group_id: bindingFact.provenance.group_id,
    })
  )
    return bad("GM_WAIT_WITNESS", "the marker pins the exact committed binding");
  const clock = currentClock(state);
  if (!clock) return bad("GM_WAIT_WITNESS", "no canonical temporal basis is established");
  if (
    !timeEquals(m.basis.canonical_time, clock.time) ||
    m.basis.state_version !== clock.fact.version
  )
    return bad("GM_WAIT_STALE", "the marker's basis is not the current temporal state");
  if (clock.held)
    return bad(
      "GM_WAIT_TRANSITION",
      "a held continuation must be consumed first: a new INITIAL is refused",
    );
  if (compareTime(clock.time, m.request.requested.target) !== -1)
    return bad(
      "GM_WAIT_TRANSITION",
      "the lawful target lies after the canonical time, in the same unit",
    );

  // exact witnesses: the binding, the temporal state and the preparation, each at its committed version and original group
  const witnessFacts: OwnerFact[] = [bindingFact, clock.fact];
  const prepFact = state.facts.get(m.preparation.fact.key);
  if (prepFact && !witnessFacts.some((f) => f.key === prepFact.key)) witnessFacts.push(prepFact);
  const expectedWitnesses = witnessFacts
    .map((f) => ({ key: f.key, version: f.version, group_id: f.provenance.group_id }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  if (!canonicalEqual(m.basis.read_witnesses, expectedWitnesses))
    return bad(
      "GM_WAIT_WITNESS",
      "the read witnesses are exactly the current binding, temporal state and preparation",
    );
  const tx = gmWaitTransactionId(m.x);
  const absent = [temporalTransactionAuthorityKey(tx), temporalTransactionKey(tx)]
    .sort()
    .map((key) => ({ key }));
  if (
    !canonicalEqual(m.basis.absent_witnesses, absent) ||
    absent.some((a) => state.facts.has(a.key))
  )
    return bad(
      "GM_WAIT_WITNESS",
      "the absence witnesses are exactly this X's opening and seal, and both are absent",
    );
  const reads = [
    ...expectedWitnesses.map((w) => ({ key: w.key, version: w.version })),
    ...absent.map((a) => ({ key: a.key, version: 0 })),
  ];
  if (
    !sameReads(group.reads, reads) ||
    !sameDeps(
      group.depends_on,
      expectedWitnesses.map((w) => w.group_id),
    )
  )
    return bad(
      "GM_WAIT_WITNESS",
      "the marker group pins its witnesses by reads at their versions and by group dependency",
    );

  // policy
  if (!canonicalEqual(m.policy.source_rule_ref, GM_WAIT_CUSTODY_RULE))
    return bad("GM_WAIT_POLICY", "the marker cites the registered GM-wait custody rule");
  if (!m.policy.history_verification_id.includes(GM_WAIT_W2_HISTORY_POLICY_SEGMENT))
    return bad(
      "GM_WAIT_POLICY",
      "the marker records a history policy that carries the W2 custody verifier",
    );
  if (ctx.live) {
    if (
      m.policy.catalogue_sha256 !==
        (ctx.policy.catalogueSha256 ?? GM_WAIT_CATALOGUE_CURRENT_SHA256) ||
      m.policy.history_verification_id !== ctx.policy.historyVerificationId
    )
      return bad(
        "GM_WAIT_POLICY",
        "a new marker states the current catalogue and the verifier it is published under",
      );
  } else if (ctx.policy.catalogueSha256 !== undefined) {
    // a bound workshop lineage: BOTH halves of the pair must be exactly the selected ones. There is no retained-digest-only fallback.
    if (
      m.policy.history_verification_id !== ctx.policy.historyVerificationId ||
      m.policy.catalogue_sha256 !== ctx.policy.catalogueSha256
    )
      return bad(
        "GM_WAIT_POLICY",
        "the marker of a bound workshop lineage records exactly the identity and catalogue the lineage was selected under",
      );
  } else if (!GM_WAIT_CATALOGUE_RETAINED_SHA256.includes(m.policy.catalogue_sha256)) {
    return bad("GM_WAIT_POLICY", "the marker states a catalogue this build retains");
  }
  const original = proofViolation(group, m, ctx.live);
  if (original) return original;
  // the ORIGINAL publication records the host that authenticated it: only here is the host reference bound to the proof presented
  if (ctx.live) {
    const d = GmWaitOriginProof.derive(proofFor(group)!);
    if (!d || d.host_ref_sha256 !== m.original.authenticated_host_ref_sha256)
      return bad(
        "GM_WAIT_PROOF_MISMATCH",
        "the marker records the host that authenticated the original request",
      );
  }
  return preparationViolation(m, state, ctx);
}

/** The marker an index names, verified to be the committed immutable marker of its X and PC. */
function markerOf(state: CampaignState, index: GmWaitByPcIndex): GmWaitMarker | Rejection {
  const fact = state.facts.get(index.marker.key);
  const marker = parseMarker(fact);
  if (
    !fact ||
    !marker ||
    fact.version !== 1 ||
    fact.provenance.group_id !== index.marker.group_id ||
    index.marker.key !== temporalGmWaitMarkerKey(index.x) ||
    marker.x !== index.x ||
    marker.pc_id !== index.pc_id
  )
    return bad("GM_WAIT_IDENTITY", "the index names the committed immutable marker of its X");
  return marker;
}
const isRejection = (v: GmWaitMarker | Rejection): v is Rejection => "code" in v;

/** The prior index of a transition: the committed fact at the key, at the written expected version, in the required state, for the same X. */
function priorIndexOf(
  state: CampaignState,
  indexWrite: Write,
  next: GmWaitByPcIndex,
  required: GmWaitByPcIndex["state"],
): GmWaitByPcIndex | Rejection {
  const fact = state.facts.get(indexWrite.key);
  const prior = parseIndex(fact);
  if (!fact || !prior || fact.version !== indexWrite.expected_version)
    return bad(
      "GM_WAIT_TRANSITION",
      "a transition advances the committed index at its exact expected version",
    );
  if (prior.state !== required)
    return bad("GM_WAIT_TRANSITION", `this transition leaves ${required} only`, {
      from: prior.state,
    });
  if (
    prior.x !== next.x ||
    prior.pc_id !== next.pc_id ||
    prior.campaign_id !== next.campaign_id ||
    !canonicalEqual(prior.marker, next.marker)
  )
    return bad(
      "GM_WAIT_TRANSITION",
      "a transition keeps the immutable marker, X and PC of the index",
    );
  return prior;
}
const isIndexRejection = (v: GmWaitByPcIndex | Rejection): v is Rejection => "code" in v;

function openCheck(
  group: CommitGroup,
  state: CampaignState,
  ctx: GmWaitCheckContext,
  authWrite: Write,
  indexWrite: Write,
  next: Extract<GmWaitByPcIndex, { state: "OPEN" }>,
): Rejection | null {
  const prior = priorIndexOf(state, indexWrite, next, "MARKED");
  if (isIndexRejection(prior)) return prior;
  const marker = markerOf(state, next);
  if (isRejection(marker)) return marker;
  const x = next.x;
  const tx = gmWaitTransactionId(x);
  const authorityKey = temporalTransactionAuthorityKey(tx);
  const authority = GmWaitTransactionAuthoritySchema.safeParse(authWrite.value);
  if (!authority.success)
    return bad("GM_WAIT_VALUE_INVALID", "the opening authority is not a strict GM authority", {
      key: authWrite.key,
    });
  const a: GmWaitTransactionAuthority = authority.data;
  const identity =
    groupIdentity(group, {
      group: gmWaitOpenGroupId(x),
      intent: gmWaitOpenIntentId(x),
      cause: transactionCause(tx),
    }) ?? ruleViolation(group);
  if (identity) return identity;
  if (
    authWrite.key !== authorityKey ||
    authWrite.expected_version !== 0 ||
    a.x !== x ||
    a.transaction_id !== tx ||
    !canonicalEqual(next.open_authority, {
      key: authorityKey,
      version: 1,
      group_id: group.group_id,
    })
  )
    return bad(
      "GM_WAIT_IDENTITY",
      "the one OPEN of X is create-only at the authority key derived from X",
    );
  // the authority repeats exactly the marker's original request, at exactly the marker's basis
  if (
    a.cause !== marker.request.cause ||
    !canonicalEqual(a.trigger, marker.request.trigger) ||
    !canonicalEqual(a.requested, marker.request.requested) ||
    !canonicalEqual(a.context, marker.request.gm_context) ||
    !canonicalEqual(a.publication, marker.request.publication) ||
    !canonicalEqual(a.opening, {
      basis_time: marker.basis.canonical_time,
      state_version: marker.basis.state_version,
    })
  )
    return bad(
      "GM_WAIT_TRANSITION",
      "the opening authority repeats exactly the marker's request and basis",
    );
  // refuse a stale OPEN: every witness the marker recorded is still the committed version, and nothing moved the clock
  const clock = currentClock(state);
  if (
    !clock ||
    clock.fact.version !== marker.basis.state_version ||
    !timeEquals(clock.time, marker.basis.canonical_time) ||
    clock.held
  )
    return bad(
      "GM_WAIT_STALE",
      "an interposed lawful group changed a material witness: the stale OPEN is refused",
    );
  const reads = [
    ...marker.basis.read_witnesses.map((w) => ({ key: w.key, version: w.version })),
    ...marker.basis.absent_witnesses
      .filter((w) => w.key !== authorityKey)
      .map((w) => ({ key: w.key, version: 0 })),
    { key: next.marker.key, version: 1 },
    { key: indexWrite.key, version: indexWrite.expected_version },
  ];
  const deps = [...marker.basis.read_witnesses.map((w) => w.group_id), next.marker.group_id];
  for (const w of marker.basis.read_witnesses) {
    const f = state.facts.get(w.key);
    if (!f || f.version !== w.version || f.provenance.group_id !== w.group_id)
      return bad("GM_WAIT_STALE", "a witness the marker recorded is no longer the committed fact");
  }
  const priorFact = state.facts.get(indexWrite.key)!;
  if (
    !sameReads(group.reads, reads) ||
    !sameDeps(group.depends_on, [...deps, priorFact.provenance.group_id])
  )
    return bad("GM_WAIT_WITNESS", "the OPEN pins the marker, the index and every recorded witness");
  return proofViolation(group, marker, ctx.live);
}

function noOpenCheck(
  group: CommitGroup,
  state: CampaignState,
  ctx: GmWaitCheckContext,
  indexWrite: Write,
  next: Extract<GmWaitByPcIndex, { state: "NO_OPEN" }>,
): Rejection | null {
  const prior = priorIndexOf(state, indexWrite, next, "MARKED");
  if (isIndexRejection(prior)) return prior;
  const marker = markerOf(state, next);
  if (isRejection(marker)) return marker;
  const x = next.x;
  const tx = gmWaitTransactionId(x);
  const authorityKey = temporalTransactionAuthorityKey(tx);
  const sealKey = temporalTransactionKey(tx);
  const identity =
    groupIdentity(group, {
      group: gmWaitNoOpenGroupId(x),
      intent: gmWaitNoOpenIntentId(x),
      cause: gmWaitCause(x),
    }) ?? ruleViolation(group);
  if (identity) return identity;
  // the explicit original-history negative certificate: exactly this X's opening and seal, absent at THIS prestate
  const certificate = next.terminal_proof;
  if (
    certificate.at_revision !== state.revision ||
    !canonicalEqual(certificate.absent, [{ key: authorityKey }, { key: sealKey }]) ||
    state.facts.has(authorityKey) ||
    state.facts.has(sealKey)
  )
    return bad(
      "GM_WAIT_TRANSITION",
      "NO_OPEN requires the negative certificate: this X's opening and seal are absent at the exact prestate",
    );
  const priorFact = state.facts.get(indexWrite.key)!;
  const reads = [
    { key: authorityKey, version: 0 },
    { key: sealKey, version: 0 },
    { key: next.marker.key, version: 1 },
    { key: indexWrite.key, version: indexWrite.expected_version },
  ];
  if (
    !sameReads(group.reads, reads) ||
    !sameDeps(group.depends_on, [next.marker.group_id, priorFact.provenance.group_id])
  )
    return bad(
      "GM_WAIT_WITNESS",
      "NO_OPEN pins the marker and the index and READS the opening and the seal at version 0",
    );
  return proofViolation(group, marker, ctx.live);
}

function reconcileCheck(
  group: CommitGroup,
  state: CampaignState,
  ctx: GmWaitCheckContext,
  indexWrite: Write,
  next: Extract<GmWaitByPcIndex, { state: "SEALED_RECONCILED" }>,
): Rejection | null {
  const prior = priorIndexOf(state, indexWrite, next, "OPEN");
  if (isIndexRejection(prior)) return prior;
  if (prior.state !== "OPEN") return bad("GM_WAIT_TRANSITION", "only OPEN reconciles");
  const marker = markerOf(state, next);
  if (isRejection(marker)) return marker;
  const x = next.x;
  const tx = gmWaitTransactionId(x);
  const identity =
    groupIdentity(group, {
      group: gmWaitReconcileGroupId(x),
      intent: gmWaitReconcileIntentId(x),
      cause: gmWaitCause(x),
    }) ?? ruleViolation(group);
  if (identity) return identity;
  const authority = state.facts.get(temporalTransactionAuthorityKey(tx));
  const seal = state.facts.get(temporalTransactionKey(tx));
  const parsedSeal = seal ? GmWaitStoredTransactionSchema.safeParse(seal.value) : undefined;
  if (
    parsedSeal?.success &&
    "stage_policy" in parsedSeal.data &&
    !ctx.policy.if6b?.permitsReconcile?.(marker, state)
  )
    return bad("GM_WAIT_SEAL", "the original owner aftermath of this staged seal has not settled");
  if (
    !authority ||
    !seal ||
    !parsedSeal?.success ||
    !canonicalEqual(next.open_authority, prior.open_authority) ||
    !canonicalEqual(next.sealed_result, {
      key: temporalTransactionKey(tx),
      version: 1,
      group_id: seal.provenance.group_id,
    }) ||
    seal.provenance.group_id !== transactionGroupId(tx) ||
    seal.provenance.intent_id !== transactionIntentId(tx) ||
    parsedSeal.data.x !== x
  )
    return bad(
      "GM_WAIT_SEAL",
      "a reconciliation names the exact own seal of the same X's durable opening",
    );
  const priorFact = state.facts.get(indexWrite.key)!;
  const reads = [
    { key: indexWrite.key, version: indexWrite.expected_version },
    { key: temporalTransactionKey(tx), version: 1 },
    { key: temporalTransactionAuthorityKey(tx), version: 1 },
  ];
  if (
    !sameReads(group.reads, reads) ||
    !sameDeps(group.depends_on, [
      seal.provenance.group_id,
      authority.provenance.group_id,
      priorFact.provenance.group_id,
    ])
  )
    return bad(
      "GM_WAIT_WITNESS",
      "a reconciliation pins the index, the seal and the opening it reconciles",
    );
  return proofViolation(group, marker, ctx.live);
}

/**
 * The custody half of an own seal (the generic transaction law is the kernel's own, in `temporal/admission.ts`): the seal is X's
 * exact lawful seal only when X's OWN durable opening committed before it, as the canonical GM-wait OPEN group, and the seal repeats
 * it exactly; it never writes the index; and it is published under the identity derived from the transaction alone.
 */
function sealCheck(group: CommitGroup, state: CampaignState, sealWrite: Write): Rejection | null {
  const parsed = GmWaitStoredTransactionSchema.safeParse(sealWrite.value);
  if (!parsed.success)
    return bad("GM_WAIT_VALUE_INVALID", "the seal is not a strict GM transaction", {
      key: sealWrite.key,
    });
  const tx = parsed.data;
  const x = tx.x;
  const id = gmWaitTransactionId(x);
  if (
    tx.transaction_id !== id ||
    sealWrite.key !== temporalTransactionKey(id) ||
    sealWrite.expected_version !== 0
  )
    return bad(
      "GM_WAIT_IDENTITY",
      "a GM seal is create-only at the key of its transaction, derived from X",
    );
  const identity = groupIdentity(group, {
    group: transactionGroupId(id),
    intent: transactionIntentId(id),
    cause: transactionCause(id),
  });
  if (identity) return identity;
  const authorityFact = state.facts.get(temporalTransactionAuthorityKey(id));
  const authority = authorityFact
    ? GmWaitTransactionAuthoritySchema.safeParse(authorityFact.value)
    : undefined;
  if (
    !authorityFact ||
    !authority?.success ||
    authorityFact.version !== 1 ||
    authorityFact.provenance.group_id !== gmWaitOpenGroupId(x) ||
    authorityFact.provenance.intent_id !== gmWaitOpenIntentId(x) ||
    authorityFact.provenance.cause !== transactionCause(id) ||
    gmWaitSealDepartsFromAuthority(tx, authority.data, sealWrite)
  )
    return bad(
      "GM_WAIT_SEAL",
      "a GM seal requires the same X's own previously durable GM opening, repeated exactly: no OPEN in the same group, no borrowed or absent authority",
    );
  const markerFact = state.facts.get(temporalGmWaitMarkerKey(x));
  const marker = parseMarker(markerFact);
  const indexFact = marker ? state.facts.get(temporalGmWaitByPcKey(marker.pc_id)) : undefined;
  const index = parseIndex(indexFact);
  if (!marker || !index || index.x !== x || index.state !== "OPEN")
    return bad("GM_WAIT_SEAL", "a GM seal seals an OPEN wait of the PC's current index");
  const staged = gmWaitFenceOf(state).stages ?? [];
  if (
    staged.length ||
    "stage_policy" in tx ||
    marker.policy.history_verification_id.endsWith("+" + IF6B_POLICY)
  ) {
    const expected = if6bSettlement(state, authority.data, marker, staged, group.rule);
    if (
      !expected ||
      !GmWaitStagedTransactionSchema.safeParse(tx).success ||
      !canonicalEqual(tx, expected.transaction) ||
      !canonicalEqual(
        group.writes.filter((w) => w !== sealWrite),
        [
          stampWrite(
            authority.data.publication,
            TEMPORAL_STATE_KEY,
            expected.nextClock,
            state.facts.get(TEMPORAL_STATE_KEY)!.version,
          ),
          ...expected.writes.map((w) =>
            stampWrite(authority.data.publication, w.key, w.value, w.version),
          ),
        ],
      ) ||
      !sameDeps(group.depends_on, [
        authorityFact.provenance.group_id,
        state.facts.get(TEMPORAL_STATE_KEY)!.provenance.group_id,
        ...staged.map(({ record }) => record.group_id),
      ])
    )
      return bad(
        "GM_WAIT_SEAL",
        "the staged seal must record all and only the original verified stages and due boundaries",
      );
  }
  if (group.writes.some((w) => w.key.startsWith(TEMPORAL_GM_WAIT_KEY_PREFIX)))
    return bad(
      "GM_WAIT_GROUP_SHAPE",
      "a seal never writes the index: the reconciliation is its own group",
    );
  return null;
}

/** The comparison of a GM seal with its GM opening: true when it departs in any compared field. */
export function gmWaitSealDepartsFromAuthority(
  tx: GmWaitStoredTransaction,
  authority: GmWaitTransactionAuthority,
  txWrite: Write | undefined,
): boolean {
  return (
    authority.x !== tx.x ||
    authority.transaction_id !== tx.transaction_id ||
    authority.cause !== tx.cause ||
    !canonicalEqual(authority.trigger, tx.trigger) ||
    !canonicalEqual(authority.opening, tx.opening) ||
    !canonicalEqual(authority.requested, tx.requested) ||
    !canonicalEqual(authority.context, tx.context) ||
    authority.publication.basis !== txWrite?.basis ||
    authority.publication.secrecy !== txWrite?.secrecy
  );
}

// ---------------------------------------------------------------------------------------------
// Group builders (pure; the writer and the tests share them)
// ---------------------------------------------------------------------------------------------

export type GmWaitErrorCode =
  | "GM_WAIT_INPUT_INVALID"
  | "GM_WAIT_STATE_ABSENT"
  | "GM_WAIT_X_CONFLICT"
  | "GM_WAIT_NOT_IN_STATE"
  | "GM_WAIT_IDENTITY_INVALID";

export interface GmWaitFactView {
  get(key: string): OwnerFact | undefined;
}

const stampWrite = (
  publication: { basis: string; secrecy: string },
  key: string,
  value: unknown,
  expected_version: number,
): Write => ({
  key,
  owner: OWNER_TEMPORAL_KERNEL,
  facet: FACET_TEMPORAL_COORDINATION,
  value: value as Write["value"],
  unit: null,
  basis: publication.basis,
  secrecy: publication.secrecy,
  expected_version,
});

const customGroup = (
  campaignId: string,
  ids: { group: string; intent: string; cause: string },
  rule: SourceRef,
  reads: { key: string; version: number }[],
  dependsOn: readonly string[],
  writes: Write[],
): CommitGroup => ({
  campaign_id: campaignId,
  group_id: ids.group,
  intent_id: ids.intent,
  owner: OWNER_TEMPORAL_KERNEL,
  facet: FACET_TEMPORAL_COORDINATION,
  cause: ids.cause,
  rule,
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: sortedReads(reads),
  depends_on: [...new Set(dependsOn)].sort(),
  writes,
});

export interface GmWaitMarkerInput {
  readonly campaignId: string;
  readonly proof: GmWaitOriginProof;
  readonly initialRequestSha256: string;
  readonly request: {
    readonly cause: string;
    readonly triggerRef: string;
    readonly target: CanonicalTime;
    readonly publication: { readonly basis: string; readonly secrecy: string };
  };
  readonly policy: { readonly catalogueSha256: string; readonly historyVerificationId: string };
  readonly preparation: GmWaitPreparation;
}

/** The marker + index group of the original authenticated GM-wait INITIAL, from the committed facts it publishes on. */
export function buildMarkerGroup(
  facts: GmWaitFactView,
  input: GmWaitMarkerInput,
): Result<{ group: CommitGroup; marker: GmWaitMarker }, GmWaitErrorCode> {
  const d = GmWaitOriginProof.derive(input.proof);
  if (!d) return fail("GM_WAIT_IDENTITY_INVALID", "the original proof does not derive an X");
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact
    ? PlayerCharacterBindingSchema.safeParse(bindingFact.value)
    : undefined;
  const clockFact = facts.get(TEMPORAL_STATE_KEY);
  const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
  if (!bindingFact || !binding?.success || !clockFact || !clock?.success)
    return fail(
      "GM_WAIT_STATE_ABSENT",
      "an active Player Character binding and a canonical temporal basis are required",
    );
  const pcId = binding.data.active_pc.entity_id;
  if (!EntityId.safeParse(pcId).success)
    return fail("GM_WAIT_INPUT_INVALID", "the PC identity is not a key-safe EntityId");
  const x = d.x;
  const tx = gmWaitTransactionId(x);
  const prepFact = facts.get(input.preparation.fact.key);
  const witnessFacts = [bindingFact, clockFact];
  if (prepFact && !witnessFacts.some((f) => f.key === prepFact.key)) witnessFacts.push(prepFact);
  const witnesses = witnessFacts
    .map((f) => ({ key: f.key, version: f.version, group_id: f.provenance.group_id }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const absent = [temporalTransactionAuthorityKey(tx), temporalTransactionKey(tx)]
    .sort()
    .map((key) => ({ key }));
  const group_id = gmWaitMarkerGroupId(x);
  const intent_id = gmWaitMarkerIntentId(x);
  const cause = gmWaitCause(x);
  const marker: GmWaitMarker = {
    schema_version: 1,
    origin: GM_WAIT_ORIGIN,
    x,
    campaign_id: input.campaignId,
    pc_id: pcId,
    pc_binding: {
      key: PLAYER_CHARACTER_BINDING_KEY,
      version: bindingFact.version,
      provenance_group_id: bindingFact.provenance.group_id,
    },
    original: {
      session_ref_sha256: d.session_ref_sha256,
      rpc_id_serialized_sha256: d.rpc_id_serialized_sha256,
      authenticated_host_ref_sha256: d.host_ref_sha256,
    },
    initial_request_sha256: input.initialRequestSha256,
    request: {
      cause: input.request.cause,
      trigger: { kind: GM_WAIT_ORIGIN, ref: input.request.triggerRef },
      requested: { target: input.request.target, condition: null },
      gm_context: { ...GM_WAIT_CONTEXT },
      publication: { ...input.request.publication },
    },
    policy: {
      catalogue_sha256: input.policy.catalogueSha256,
      source_rule_ref: GM_WAIT_CUSTODY_RULE,
      history_verification_id: input.policy.historyVerificationId,
    },
    preparation: input.preparation,
    basis: {
      canonical_time: clock.data.canonical_time,
      state_version: clockFact.version,
      read_witnesses: witnesses,
      absent_witnesses: absent,
    },
    original_publication: { group_id, intent_id, cause },
  };
  const indexKey = temporalGmWaitByPcKey(pcId);
  const priorIndex = facts.get(indexKey);
  const index: GmWaitByPcIndex = {
    schema_version: 1,
    campaign_id: input.campaignId,
    pc_id: pcId,
    x,
    marker: { key: temporalGmWaitMarkerKey(x), version: 1, group_id },
    predecessor_index_version: priorIndex?.version ?? 0,
    state: "MARKED",
    open_authority: null,
    sealed_result: null,
    terminal_proof: null,
  };
  const pub = input.request.publication;
  return ok({
    marker,
    group: customGroup(
      input.campaignId,
      { group: group_id, intent: intent_id, cause },
      GM_WAIT_CUSTODY_RULE,
      [
        ...witnesses.map((w) => ({ key: w.key, version: w.version })),
        ...absent.map((a) => ({ key: a.key, version: 0 })),
      ],
      witnesses.map((w) => w.group_id),
      [
        stampWrite(pub, temporalGmWaitMarkerKey(x), marker, 0),
        stampWrite(pub, indexKey, index, priorIndex?.version ?? 0),
      ],
    ),
  });
}

interface Opened {
  readonly marker: GmWaitMarker;
  readonly markerFact: OwnerFact;
  readonly indexFact: OwnerFact;
  readonly index: GmWaitByPcIndex;
}
function openedOf(facts: GmWaitFactView, x: string): Result<Opened, GmWaitErrorCode> {
  const markerFact = facts.get(temporalGmWaitMarkerKey(x));
  const marker = parseMarker(markerFact);
  if (!markerFact || !marker)
    return fail("GM_WAIT_NOT_IN_STATE", "no marker is committed for this X");
  const indexFact = facts.get(temporalGmWaitByPcKey(marker.pc_id));
  const index = parseIndex(indexFact);
  if (!indexFact || !index || index.x !== x)
    return fail("GM_WAIT_NOT_IN_STATE", "this X does not hold its PC's by-PC slot");
  return ok({ marker, markerFact, indexFact, index });
}

/** The separate OPEN: the index MARKED -> OPEN and the one durable opening authority of the same X, in one Temporal group. */
export function buildOpenGroup(
  facts: GmWaitFactView,
  x: string,
): Result<CommitGroup, GmWaitErrorCode> {
  const o = openedOf(facts, x);
  if (!o.ok) return o;
  const { marker, markerFact, indexFact } = o.value;
  const tx = gmWaitTransactionId(x);
  const authorityKey = temporalTransactionAuthorityKey(tx);
  const group_id = gmWaitOpenGroupId(x);
  const authority: GmWaitTransactionAuthority = {
    origin: GM_WAIT_ORIGIN,
    x,
    transaction_id: tx,
    cause: marker.request.cause,
    trigger: marker.request.trigger,
    continues: null,
    opening: {
      basis_time: marker.basis.canonical_time,
      state_version: marker.basis.state_version,
    },
    requested: marker.request.requested,
    context: marker.request.gm_context,
    publication: marker.request.publication,
  };
  const next: GmWaitByPcIndex = {
    schema_version: 1,
    campaign_id: marker.campaign_id,
    pc_id: marker.pc_id,
    x,
    marker: { key: markerFact.key, version: 1, group_id: markerFact.provenance.group_id },
    predecessor_index_version: indexFact.version,
    state: "OPEN",
    open_authority: { key: authorityKey, version: 1, group_id },
    sealed_result: null,
    terminal_proof: null,
  };
  const pub = marker.request.publication;
  const reads = [
    ...marker.basis.read_witnesses.map((w) => ({ key: w.key, version: w.version })),
    ...marker.basis.absent_witnesses
      .filter((w) => w.key !== authorityKey)
      .map((w) => ({ key: w.key, version: 0 })),
    { key: markerFact.key, version: 1 },
    { key: indexFact.key, version: indexFact.version },
  ];
  return ok(
    customGroup(
      marker.campaign_id,
      { group: group_id, intent: gmWaitOpenIntentId(x), cause: transactionCause(tx) },
      GM_WAIT_CUSTODY_RULE,
      reads,
      [
        ...marker.basis.read_witnesses.map((w) => w.group_id),
        markerFact.provenance.group_id,
        indexFact.provenance.group_id,
      ],
      [
        stampWrite(pub, indexFact.key, next, indexFact.version),
        stampWrite(pub, authorityKey, authority, 0),
      ],
    ),
  );
}

/** The terminal NO_OPEN with its explicit negative certificate, taken at `atRevision` (the revision of the prestate). */
export function buildNoOpenGroup(
  facts: GmWaitFactView,
  x: string,
  atRevision: number,
): Result<CommitGroup, GmWaitErrorCode> {
  const o = openedOf(facts, x);
  if (!o.ok) return o;
  const { marker, markerFact, indexFact } = o.value;
  const tx = gmWaitTransactionId(x);
  const authorityKey = temporalTransactionAuthorityKey(tx);
  const sealKey = temporalTransactionKey(tx);
  const next: GmWaitByPcIndex = {
    schema_version: 1,
    campaign_id: marker.campaign_id,
    pc_id: marker.pc_id,
    x,
    marker: { key: markerFact.key, version: 1, group_id: markerFact.provenance.group_id },
    predecessor_index_version: indexFact.version,
    state: "NO_OPEN",
    open_authority: null,
    sealed_result: null,
    terminal_proof: {
      absent: [{ key: authorityKey }, { key: sealKey }],
      at_revision: atRevision,
    },
  };
  return ok(
    customGroup(
      marker.campaign_id,
      { group: gmWaitNoOpenGroupId(x), intent: gmWaitNoOpenIntentId(x), cause: gmWaitCause(x) },
      GM_WAIT_CUSTODY_RULE,
      [
        { key: authorityKey, version: 0 },
        { key: sealKey, version: 0 },
        { key: markerFact.key, version: 1 },
        { key: indexFact.key, version: indexFact.version },
      ],
      [markerFact.provenance.group_id, indexFact.provenance.group_id],
      [stampWrite(marker.request.publication, indexFact.key, next, indexFact.version)],
    ),
  );
}

/** The sealed reconciliation: the index OPEN -> SEALED_RECONCILED against the exact own seal. Changes only the reconciliation barrier. */
export function buildReconcileGroup(
  facts: GmWaitFactView,
  x: string,
): Result<CommitGroup, GmWaitErrorCode> {
  const o = openedOf(facts, x);
  if (!o.ok) return o;
  const { marker, markerFact, indexFact, index } = o.value;
  const tx = gmWaitTransactionId(x);
  const authority = facts.get(temporalTransactionAuthorityKey(tx));
  const seal = facts.get(temporalTransactionKey(tx));
  if (!authority || !seal || index.state !== "OPEN" || index.open_authority === null)
    return fail(
      "GM_WAIT_NOT_IN_STATE",
      "an own seal and the durable opening are required to reconcile",
    );
  const next: GmWaitByPcIndex = {
    schema_version: 1,
    campaign_id: marker.campaign_id,
    pc_id: marker.pc_id,
    x,
    marker: { key: markerFact.key, version: 1, group_id: markerFact.provenance.group_id },
    predecessor_index_version: indexFact.version,
    state: "SEALED_RECONCILED",
    open_authority: index.open_authority,
    sealed_result: { key: seal.key, version: 1, group_id: seal.provenance.group_id },
    terminal_proof: null,
  };
  return ok(
    customGroup(
      marker.campaign_id,
      {
        group: gmWaitReconcileGroupId(x),
        intent: gmWaitReconcileIntentId(x),
        cause: gmWaitCause(x),
      },
      GM_WAIT_CUSTODY_RULE,
      [
        { key: indexFact.key, version: indexFact.version },
        { key: seal.key, version: 1 },
        { key: authority.key, version: 1 },
      ],
      [seal.provenance.group_id, authority.provenance.group_id, indexFact.provenance.group_id],
      [stampWrite(marker.request.publication, indexFact.key, next, indexFact.version)],
    ),
  );
}

/**
 * X's own seal: the kernel group that advances canonical time to the target and records the GM transaction. It is the ZERO-STAGE seal: this build
 * has no source witness for an owner stage of a GM wait (BLUE F-1), so the strict contract admits no engaged owner, no crossed boundary and no stage.
 */
export function buildSealGroup(
  facts: GmWaitFactView,
  x: string,
  kernelRule: SourceRef,
  actualState?: CampaignState,
): Result<CommitGroup, GmWaitErrorCode> {
  const o = openedOf(facts, x);
  if (!o.ok) return o;
  const { marker } = o.value;
  const tx = gmWaitTransactionId(x);
  const authorityFact = facts.get(temporalTransactionAuthorityKey(tx));
  const authority = authorityFact
    ? GmWaitTransactionAuthoritySchema.safeParse(authorityFact.value)
    : undefined;
  const clockFact = facts.get(TEMPORAL_STATE_KEY);
  if (!authorityFact || !authority?.success || !clockFact)
    return fail(
      "GM_WAIT_NOT_IN_STATE",
      "X's durable opening and the temporal state are required to seal",
    );
  const a = authority.data;
  const target = a.requested.target;
  const pub = a.publication;
  const recorded = actualState ? (gmWaitFenceOf(actualState).stages ?? []) : [];
  if (
    actualState &&
    (recorded.length || marker.policy.history_verification_id.endsWith("+" + IF6B_POLICY))
  ) {
    const settlement = if6bSettlement(actualState, a, marker, recorded, kernelRule);
    if (!settlement) return fail("GM_WAIT_NOT_IN_STATE", "the due owner stages are incomplete");
    return ok(
      customGroup(
        marker.campaign_id,
        {
          group: transactionGroupId(tx),
          intent: transactionIntentId(tx),
          cause: transactionCause(tx),
        },
        kernelRule,
        [
          { key: TEMPORAL_STATE_KEY, version: clockFact.version },
          { key: authorityFact.key, version: 1 },
        ],
        [
          clockFact.provenance.group_id,
          authorityFact.provenance.group_id,
          ...recorded.map(({ record }) => record.group_id),
        ],
        [
          stampWrite(pub, TEMPORAL_STATE_KEY, settlement.nextClock, clockFact.version),
          stampWrite(pub, temporalTransactionKey(tx), settlement.transaction, 0),
          ...settlement.writes.map((w) => stampWrite(pub, w.key, w.value, w.version)),
        ],
      ),
    );
  }
  const transaction: GmWaitResolutionTransaction = {
    origin: GM_WAIT_ORIGIN,
    x,
    transaction_id: tx,
    cause: a.cause,
    trigger: a.trigger,
    continues: null,
    opening: a.opening,
    requested: a.requested,
    context: a.context,
    engaged: [],
    boundaries_crossed: [],
    stages: [],
    rule_versions: [],
    outcome: {
      actual_stop: target,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    },
  };
  const state = {
    canonical_time: target,
    last_transaction: tx,
    continuation: null,
  };
  return ok(
    customGroup(
      marker.campaign_id,
      {
        group: transactionGroupId(tx),
        intent: transactionIntentId(tx),
        cause: transactionCause(tx),
      },
      // the kernel rule of every sealed transaction (`factKind("temporal_state").rule`), supplied by the owner that holds the registry
      kernelRule,
      [
        { key: TEMPORAL_STATE_KEY, version: clockFact.version },
        { key: authorityFact.key, version: 1 },
      ],
      [clockFact.provenance.group_id, authorityFact.provenance.group_id],
      [
        stampWrite(pub, TEMPORAL_STATE_KEY, state, clockFact.version),
        stampWrite(pub, temporalTransactionKey(tx), transaction, 0),
      ],
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------------------------

export type GmWaitWriteError = GmWaitErrorCode | StoreCommitErrorCode;
export type GmWaitCommitted = CommitOutcome & {
  readonly x: string;
  /** the slot state of X's PC when the call returned: a replay of a step that has since been overtaken says so (e.g. NO_OPEN) */
  readonly slot: GmWaitStatus["state"];
};

/** What a trusted adapter may learn about a wait: nothing but its slot state. No cause, time, target, hidden fact or witness. */
export type GmWaitStatus = {
  readonly state:
    "NONE" | "MARKED" | "ACTIVE" | "SEALED_UNRECONCILED" | "NO_OPEN" | "SEALED_RECONCILED";
};

const MARKER_RETRY_FIELDS = (m: GmWaitMarker) => ({
  x: m.x,
  campaign_id: m.campaign_id,
  pc_id: m.pc_id,
  pc_binding: m.pc_binding,
  // the session and request digests identify the logical operation; the host reference is a renewable grant, never part of a retry's identity
  original: {
    session_ref_sha256: m.original.session_ref_sha256,
    rpc_id_serialized_sha256: m.original.rpc_id_serialized_sha256,
  },
  initial_request_sha256: m.initial_request_sha256,
  request: m.request,
  policy: m.policy,
  preparation: m.preparation,
});

/**
 * The Temporal owner's publisher of the custody transitions, through the ordinary store. It is the ONLY writer of these facts and it
 * consults only the committed facts and the verified origin proof it is handed: retry reaches the original receipt by identity, a
 * colliding X with changed semantic contents is a conflict (never a second wait), and nothing here advances time except the own seal.
 */
export class GmWaitCustody {
  readonly #store: CampaignStore;
  readonly #policy: GmWaitMarkerInput["policy"];
  readonly #kernelRule: SourceRef;

  constructor(
    store: CampaignStore,
    policy: GmWaitMarkerInput["policy"] & { readonly kernelRule: SourceRef },
  ) {
    this.#store = store;
    this.#policy = {
      catalogueSha256: policy.catalogueSha256,
      historyVerificationId: policy.historyVerificationId,
    };
    this.#kernelRule = policy.kernelRule;
  }

  async #publish(
    group: CommitGroup,
    proof: GmWaitOriginProof | undefined,
  ): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    const digest = sha256Canonical(group);
    if (proof) liveProofs.set(digest, proof);
    try {
      return await this.#store.commit(group);
    } finally {
      if (proof) liveProofs.delete(digest);
    }
  }

  /** A step's outcome with the slot state of its PC as it stands now (the marker names the PC; no marker, no slot). */
  #result(outcome: CommitOutcome, x: string): GmWaitCommitted {
    const marker = parseMarker(this.#store.getFact(temporalGmWaitMarkerKey(x)));
    return { ...outcome, x, slot: marker ? this.status(marker.pc_id).state : "NONE" };
  }

  /** The answer of an identity that already committed: the original receipt, nothing written. */
  #original(intentId: string, x: string): Result<GmWaitCommitted, never> | null {
    const receipt = this.#store.lookupReceipt(intentId);
    return receipt ? ok(this.#result({ receipt, replayed: true }, x)) : null;
  }

  async publishMarker(
    input: Omit<GmWaitMarkerInput, "campaignId" | "policy">,
  ): Promise<Result<GmWaitCommitted, GmWaitWriteError>> {
    const d = GmWaitOriginProof.derive(input.proof);
    if (!d) return fail("GM_WAIT_IDENTITY_INVALID", "the original proof does not derive an X");
    const built = buildMarkerGroup(
      { get: (k) => this.#store.getFact(k) },
      { ...input, campaignId: this.#store.head().campaign_id, policy: this.#policy },
    );
    const existing = parseMarker(this.#store.getFact(temporalGmWaitMarkerKey(d.x)));
    if (existing) {
      // the same logical operation: the original truth, or a conflict if its semantic contents changed
      if (!built.ok)
        return fail(
          "GM_WAIT_X_CONFLICT",
          "this X already holds a marker and the retry cannot be rebuilt",
        );
      return canonicalEqual(MARKER_RETRY_FIELDS(existing), MARKER_RETRY_FIELDS(built.value.marker))
        ? (this.#original(gmWaitMarkerIntentId(d.x), d.x) ??
            fail("GM_WAIT_X_CONFLICT", "the marker exists but its original receipt is unavailable"))
        : fail(
            "GM_WAIT_X_CONFLICT",
            "this X was already published with different semantic contents",
          );
    }
    if (!built.ok) return built;
    const committed = await this.#publish(built.value.group, input.proof);
    return committed.ok ? ok(this.#result(committed.value, d.x)) : committed;
  }

  async open(proof: GmWaitOriginProof): Promise<Result<GmWaitCommitted, GmWaitWriteError>> {
    const d = GmWaitOriginProof.derive(proof);
    if (!d) return fail("GM_WAIT_IDENTITY_INVALID", "the original proof does not derive an X");
    const done = this.#original(gmWaitOpenIntentId(d.x), d.x);
    if (done) return done;
    const group = buildOpenGroup({ get: (k) => this.#store.getFact(k) }, d.x);
    if (!group.ok) return group;
    const committed = await this.#publish(group.value, proof);
    return committed.ok ? ok(this.#result(committed.value, d.x)) : committed;
  }

  /** X's own zero-stage seal (no owner stage of a GM wait has a source witness in this build). */
  async sealOwn(x: string): Promise<Result<GmWaitCommitted, GmWaitWriteError>> {
    const done = this.#original(transactionIntentId(gmWaitTransactionId(x)), x);
    if (done) return done;
    const group = buildSealGroup(
      { get: (k) => this.#store.getFact(k) },
      x,
      this.#kernelRule,
      this.#store.canonicalState?.(),
    );
    if (!group.ok) return group;
    const committed = await this.#publish(group.value, undefined);
    return committed.ok ? ok(this.#result(committed.value, x)) : committed;
  }

  async markNoOpen(proof: GmWaitOriginProof): Promise<Result<GmWaitCommitted, GmWaitWriteError>> {
    const d = GmWaitOriginProof.derive(proof);
    if (!d) return fail("GM_WAIT_IDENTITY_INVALID", "the original proof does not derive an X");
    const done = this.#original(gmWaitNoOpenIntentId(d.x), d.x);
    if (done) return done;
    const group = buildNoOpenGroup(
      { get: (k) => this.#store.getFact(k) },
      d.x,
      this.#store.head().revision,
    );
    if (!group.ok) return group;
    const committed = await this.#publish(group.value, proof);
    return committed.ok ? ok(this.#result(committed.value, d.x)) : committed;
  }

  async reconcile(proof: GmWaitOriginProof): Promise<Result<GmWaitCommitted, GmWaitWriteError>> {
    const d = GmWaitOriginProof.derive(proof);
    if (!d) return fail("GM_WAIT_IDENTITY_INVALID", "the original proof does not derive an X");
    const done = this.#original(gmWaitReconcileIntentId(d.x), d.x);
    if (done) return done;
    const group = buildReconcileGroup({ get: (k) => this.#store.getFact(k) }, d.x);
    if (!group.ok) return group;
    const committed = await this.#publish(group.value, proof);
    return committed.ok ? ok(this.#result(committed.value, d.x)) : committed;
  }

  /** The slot state of a PC. It is general status: no cause, time, target, hidden fact or administrative inner field. */
  status(pcId: string): GmWaitStatus {
    const index = parseIndex(this.#store.getFact(temporalGmWaitByPcKey(pcId)));
    if (!index) return { state: "NONE" };
    if (index.state === "OPEN") {
      const sealed = this.#store.getFact(temporalTransactionKey(gmWaitTransactionId(index.x)));
      return { state: sealed ? "SEALED_UNRECONCILED" : "ACTIVE" };
    }
    return { state: index.state };
  }
}
