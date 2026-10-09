import {
  AuthoritySchema,
  CANON_WRITE_AUTHORITY,
  CJA_DECISION_BASIS,
  CJA_SECRECY,
  CjaAuthoredJudgmentSchema,
  CjaContextAttestationSchema,
  CjaDecisionRecordSchema,
  GM_ADJUDICATION_AUTHORITY,
  cjaDecisionGroupId,
  cjaDecisionId,
  cjaDecisionIntentId,
  cjaDecisionKey,
  fail,
  ok,
  type CjaDecisionRecord,
  type CjaDependencyUnresolvedCode,
  type CjaRefusalCode,
  type CommitGroup,
  type OwnerFact,
  type Result,
  type SourceRef,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { assertCjaCanonical, CjaCanonError } from "./canon.ts";
import {
  buildCjaRecord,
  cjaAttestationIdentityViolation,
  cjaAuthoredOf,
  cjaConstituencyViolation,
  cjaCultureUpdateId,
  cjaDependsOn,
  cjaDistinctionDigest,
  cjaRecordViolation,
  cjaSealedProofViolation,
  cjaSourceViolation,
  type CjaViolation,
} from "./derive.ts";
import type { CultureAdjudicationContextPort } from "./ports.ts";

export type CjaErrorCode = CjaRefusalCode | CjaDependencyUnresolvedCode | StoreCommitErrorCode;

/**
 * The adapter's configuration. NOTHING here is defaulted: the registered consumer, the rule/method and the context port are
 * explicit, because the real Culture owner is not part of this prerequisite.
 */
export interface CultureAdjudicationAdapterOptions {
  /** PORT A */
  readonly contextPort: CultureAdjudicationContextPort;
  /**
   * CJA1 §2.3: the ONE registered substantive consumer of this v1 contract — the owner and the Communicative Convention Close
   * operation of Culture's shared-meaning/norm result. The sealed context must be that owner's; the operation is an identity
   * input of the update. No general GM adjudication service is implicitly authorized.
   */
  readonly consumer: { readonly owner: string; readonly operation: string };
  /** CJA1 §6.1 rule_ref: the exact rule/method and version/source applicability a judgment must cite. */
  readonly rule: SourceRef;
}

export interface AdjudicationInput {
  /**
   * The ACTIVE OPERATION CONTEXT under which this adjudication is performed, supplied by the trusted in-process caller's
   * operation configuration (CJA1 §§1.2, 7.1). It is never read from the judgment, a narration, a model or a host assertion.
   */
  readonly operation: unknown;
  /** the authored judgment over the sealed evidence: untrusted, validated here */
  readonly judgment: unknown;
}

export type AdjudicationDisposition = "COMMITTED" | "REPLAYED";

export interface AdjudicationOutcome {
  readonly culture_update_id: string;
  readonly decision_id: string;
  readonly verdict: CjaDecisionRecord["verdict"];
  readonly disposition: AdjudicationDisposition;
  /** the typed record reference a registered consumer reads and depends on (the group is its `depends_on`) */
  readonly record: { readonly key: string; readonly version: number; readonly group_id: string };
  readonly receipt: CommitOutcome["receipt"];
}

/** Stores whose last commit for an identity had an unknown outcome: the authored judgment that attempt carried. */
const unreconciled = new WeakMap<CampaignStore, Map<string, string>>();

const UPDATE_ID = /^[0-9a-f]{64}$/;

const stop = (v: CjaViolation) => fail(v.code, v.message);

/**
 * F-027-CJA1 — the consumer-free adjudication-record owner path (`culture_adjudication_kernel / adjudication_provenance`).
 *
 * ONE operation, `adjudicate`, applies CJA1 §7.2 in its exact order:
 *
 *   (i) the trusted in-process role.gm + permission.rule.adjudicate precondition — FIRST, before ANY lookup or disclosure,
 *       replay included;
 *   (ii) structural validation of the untrusted judgment (ill-formed Unicode and non-plain JSON are refused before any hash);
 *   (iii) the existing committed decision and RC-16 identity: an identical authored judgment recovers, a changed one is a
 *       DECISION_CONFLICT that replaces nothing — and the context port is not consulted;
 *   (iv) PORT A and the committed store: identities re-derived from the trigger, the sealed context verified (version, group,
 *       and its journaled group's reads/depends_on as the historical proof of every cited source), without re-reading any
 *       foreign value;
 *   (v) the authored judgment's citation closure, coherence (C6) and rule;
 *   (vi)–(vii) ONE create-only archivist publication at expected_version 0 under the stable decision group/intent identity.
 *
 * The caller supplies a judgment and an operation context; it never supplies an owner, facet, key, group or intent identity,
 * an authority or a rule. There is no method that writes a record directly, none that amends or replaces one, none that
 * calls a model or reads a live foreign value, and none that writes a Culture manifestation.
 */
export class CultureAdjudicationAdapter {
  readonly #store: CampaignStore;
  readonly #options: CultureAdjudicationAdapterOptions;

  constructor(store: CampaignStore, options: CultureAdjudicationAdapterOptions) {
    this.#store = store;
    this.#options = options;
  }

  async adjudicate(input: AdjudicationInput): Promise<Result<AdjudicationOutcome, CjaErrorCode>> {
    // (i) FIRST: nothing below — no identity lookup, no receipt lookup, no port call — runs on a wrong or missing context.
    const claimed = AuthoritySchema.safeParse(input.operation);
    if (
      !claimed.success ||
      claimed.data.role !== GM_ADJUDICATION_AUTHORITY.role ||
      claimed.data.permission !== GM_ADJUDICATION_AUTHORITY.permission
    ) {
      return fail(
        "AUTHORITY_DENIED",
        "adjudication executes only under the trusted operation context role.gm + permission.rule.adjudicate",
      );
    }
    // (ii) structural validation
    try {
      assertCjaCanonical(input.judgment);
    } catch (e) {
      return fail(
        "JUDGMENT_INPUT_INVALID",
        e instanceof CjaCanonError ? e.message : "the judgment is not well-formed plain JSON",
      );
    }
    const parsed = CjaAuthoredJudgmentSchema.safeParse(input.judgment);
    if (!parsed.success) {
      return fail("JUDGMENT_INPUT_INVALID", "the judgment violates its contract", {
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const authored = parsed.data;
    const updateId = authored.culture_update_id;
    const key = cjaDecisionKey(updateId);

    // (iii) the existing committed decision, by the same immutable identity
    const committed = this.#store.getFact(key);
    if (committed) return this.#replay(authored, committed);

    // an earlier attempt whose outcome was unknown must be reconciled before any DIFFERENT judgment can be accepted:
    // the adjudicator is never rerolled (CJA1 §7.2 (vii))
    const digest = sha256Canonical(authored);
    const pending = unreconciled.get(this.#store)?.get(updateId);
    if (pending !== undefined && pending !== digest) {
      return fail(
        "UNKNOWN_OUTCOME",
        "an earlier commit for this update had an unknown outcome; reopen the campaign and reconcile by the deterministic identity before any other judgment",
        { culture_update_id: updateId },
      );
    }

    // (iv) PORT A, then the committed store
    const verified = this.#verifyContext(updateId);
    if (!verified.ok) return verified;
    const att = verified.value;

    // (v) the authored judgment against the verified context
    if (!canonicalEqual(authored.rule_ref, this.#options.rule)) {
      return fail(
        "RULE_MISMATCH",
        "the judgment cites a rule/method other than the registered one",
      );
    }
    const record = buildCjaRecord(att, authored);
    const recordViolation = cjaRecordViolation(record);
    if (recordViolation) return stop(recordViolation);
    const parsedRecord = CjaDecisionRecordSchema.safeParse(record);
    if (!parsedRecord.success) {
      return fail("JUDGMENT_INPUT_INVALID", "the adjudication record violates its contract");
    }

    // (vi) one create-only write; the group pins the CURRENT sealed context only
    const context = this.#store.getFact(record.context_ref.fact_key)!;
    const kind = factKind("culture_adjudication_decision");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: cjaDecisionGroupId(updateId),
      intent_id: cjaDecisionIntentId(updateId),
      owner: kind.owner,
      facet: kind.facet,
      cause: cjaDecisionId(updateId),
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: context.key, version: context.version }],
      depends_on: cjaDependsOn(record),
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: parsedRecord.data as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: CJA_DECISION_BASIS,
          secrecy: CJA_SECRECY,
          expected_version: 0,
        },
      ],
    };
    // (vii) publication
    const published = await this.#publish(updateId, digest, group);
    if (!published.ok) {
      const winner = this.#store.getFact(key);
      if (winner && published.error.code !== "UNKNOWN_OUTCOME")
        return this.#replay(authored, winner);
      return published;
    }
    const fact = this.#store.getFact(key);
    if (!fact) {
      return fail(
        "DECISION_INTEGRITY_FAILURE",
        "the committed adjudication record is not readable",
      );
    }
    return ok({
      culture_update_id: updateId,
      decision_id: cjaDecisionId(updateId),
      verdict: record.verdict,
      disposition: "COMMITTED",
      record: { key: fact.key, version: fact.version, group_id: fact.provenance.group_id },
      receipt: published.value.receipt,
    });
  }

  /** The committed record of an update, by identity (an exact key: never a scan). */
  decision(
    cultureUpdateId: string,
  ): { fact: OwnerFact; value: CjaDecisionRecord; group_id: string } | undefined {
    if (!UPDATE_ID.test(cultureUpdateId)) return undefined;
    const fact = this.#store.getFact(cjaDecisionKey(cultureUpdateId));
    const value = fact ? CjaDecisionRecordSchema.safeParse(fact.value) : undefined;
    return fact && value?.success
      ? { fact, value: value.data, group_id: fact.provenance.group_id }
      : undefined;
  }

  // -- steps ------------------------------------------------------------------------------------

  /** Step (iii): the same authored judgment recovers; a changed one is a conflict that replaces nothing. */
  #replay(
    authored: ReturnType<typeof CjaAuthoredJudgmentSchema.parse>,
    fact: OwnerFact,
  ): Result<AdjudicationOutcome, CjaErrorCode> {
    const record = CjaDecisionRecordSchema.safeParse(fact.value);
    if (!record.success || cjaRecordViolation(record.data) !== null) {
      return fail("DECISION_INTEGRITY_FAILURE", "the committed adjudication record is malformed");
    }
    if (!canonicalEqual(cjaAuthoredOf(record.data), authored)) {
      return fail(
        "DECISION_CONFLICT",
        "this immutable decision identity has a committed judgment with different content; it is not a new reading of the same situation",
        { culture_update_id: authored.culture_update_id },
      );
    }
    const receipt = this.#store.lookupReceipt(fact.provenance.intent_id);
    if (!receipt) {
      return fail("DECISION_INTEGRITY_FAILURE", "a committed adjudication record has no receipt");
    }
    return ok({
      culture_update_id: record.data.culture_update_id,
      decision_id: record.data.decision_id,
      verdict: record.data.verdict,
      disposition: "REPLAYED",
      record: { key: fact.key, version: fact.version, group_id: fact.provenance.group_id },
      receipt,
    });
  }

  /**
   * Step (iv): PORT A's attestation is a claim. It is validated, its identities re-derived from the committed trigger, and the
   * sealed context verified against the committed store and the journaled group that sealed it. Cited versions need NOT
   * remain current; no foreign value is read.
   */
  #verifyContext(
    updateId: string,
  ): Result<ReturnType<typeof CjaContextAttestationSchema.parse>, CjaErrorCode> {
    let lookup;
    try {
      lookup = this.#options.contextPort.attest(updateId);
    } catch {
      return fail(
        "CONTEXT_PORT_UNAVAILABLE",
        "the sealed-context port is unavailable; dependent work stops",
      );
    }
    if (!lookup || lookup.status !== "ATTESTED") {
      return fail(
        "CONTEXT_ABSENT",
        "no sealed context is attested for this update; dependent work stops",
      );
    }
    try {
      assertCjaCanonical(lookup.attestation);
    } catch {
      return fail("CONTEXT_MISMATCH", "the context attestation is not well-formed plain JSON");
    }
    const parsed = CjaContextAttestationSchema.safeParse(lookup.attestation);
    if (!parsed.success) {
      return fail("CONTEXT_MISMATCH", "the context attestation violates its contract");
    }
    const att = parsed.data;
    const identity = cjaAttestationIdentityViolation(att, this.#options.consumer.operation);
    if (identity) return stop(identity);
    const derived = cjaCultureUpdateId({
      causal_process_id: att.causal_process_id,
      opportunity_id: att.opportunity_id,
      distinction_digest: cjaDistinctionDigest(att.distinction),
      owner_operation_id: att.owner_operation_id,
    });
    if (derived !== updateId) {
      return fail(
        "IDENTITY_INVALID",
        "the update identity is derived from the committed trigger, the fixed opportunity, the distinction and the registered operation",
      );
    }
    if (att.context.owner !== this.#options.consumer.owner) {
      return fail(
        "CONTEXT_MISMATCH",
        "the sealed context belongs to the one registered consumer owner",
      );
    }
    const shape = { ...att, context_ref: att.context, source_refs: att.inputs };
    const structural =
      cjaConstituencyViolation(att.constituency) ??
      cjaSourceViolation({
        source_refs: shape.source_refs,
        trigger_ref: att.trigger_ref,
        context_ref: shape.context_ref,
      });
    if (structural) return stop(structural);
    const proof = cjaSealedProofViolation(
      { get: (k: string) => this.#store.getFact(k) },
      this.#store,
      {
        context_ref: att.context,
        source_refs: att.inputs,
        constituency_ref: att.constituency,
      },
    );
    if (proof) {
      return proof.absent
        ? fail(
            "CONTEXT_ABSENT",
            "the attested sealed context is not committed; dependent work stops",
          )
        : stop(proof);
    }
    return ok(att);
  }

  /** The one `.commit(` of this adapter: every adjudication record is published here, nowhere else. */
  async #publish(
    updateId: string,
    digest: string,
    group: CommitGroup,
  ): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    const outcome = await this.#store.commit(group);
    if (
      !outcome.ok &&
      (outcome.error.code === "UNKNOWN_OUTCOME" || outcome.error.code === "STORE_POISONED")
    ) {
      const pending = unreconciled.get(this.#store) ?? new Map<string, string>();
      pending.set(updateId, digest);
      unreconciled.set(this.#store, pending);
    }
    return outcome;
  }
}
