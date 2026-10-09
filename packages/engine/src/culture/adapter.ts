import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CANON_WRITE_AUTHORITY,
  CJA_OPPORTUNITY_ID,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  CultureSealRequestSchema,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  Id,
  cultureContextCause,
  cultureContextGroupId,
  cultureContextIntentId,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  fail,
  ok,
  type CjaSealedInputRef,
  type CommitGroup,
  type CultureSharedMeaning,
  type CultureUpdateContext,
  type OwnerFact,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import {
  cjaCausalProcessId,
  cjaCultureUpdateId,
  cjaDistinctionDigest,
} from "../culture-adjudication/derive.ts";
import {
  constituencyFromVerdict,
  type PopulationCloseScopeVerifier,
} from "../culture-adjudication/ports.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import {
  canonicalBindingViolation,
  contextPinnedKeys,
  cultureContextViolation,
  cultureSlotId,
  inputBasisViolation,
} from "./derive.ts";

export type CultureErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  | "BINDING_INVALID"
  | "INPUT_NOT_ENGAGEABLE"
  | "CONSTITUENCY_INVALID"
  | "CONTEXT_CONFLICT";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

export interface CultureAdapterOptions {
  /**
   * PORT B — the Population scope-close verifier used AT SEAL. Explicit and never defaulted: the host wires
   * `PopulationScopeCloseVerifier` (Population's lawful close / PCB-01 evidence) here, or a test supplies a stand-in whose
   * contexts admission will refuse as non-live.
   */
  readonly populationScope: PopulationCloseScopeVerifier;
}

/** What a caller supplies to seal a context besides the request: the authored basis label. Identities are never the caller's. */
export interface CultureSealInput {
  readonly basis: string;
  readonly request: unknown;
}

/**
 * IM-09 Culture & Society — the authored path of the Culture owner.
 *
 * A caller supplies the question, the engaged source facts and the Cohort scope, nothing more. It never supplies an owner, a
 * facet, an authority, a secrecy class, a governing rule, a version, a committing group, an identity — or a meaning, norm or
 * manifestation: the manifestation is the immutable GM judgment's. There is exactly ONE authored publication: the sealed,
 * OUTCOME-NEUTRAL Social Update Context. The shared meaning/norm is NOT a method here: it is the
 * `cultureConventionCloseProvider` operation the IM-02 coordinator resolves as the owner's declared Communicative Convention
 * Close, inside the engaged object of the dependent consequence that materially requires it, from the sealed context and the
 * ONE committed ESTABLISH_SUPPORTED decision. There is no fact writer, no setter, no update, rebinding, contestation,
 * retirement, relation, position, prevalence or adoption method, and no way to write a foreign fact, so no caller can write
 * Culture state out of order; the store's admission refuses a raw commit as well.
 *
 * Sealing is RC-16 idempotent by the deterministic update identity: a retry of the same sealed update returns the original
 * receipt and never re-seals, even after sources or the Cohort have advanced.
 */
export class CultureAdapter {
  readonly #store: CampaignStore;
  readonly #options: CultureAdapterOptions;

  constructor(store: CampaignStore, options: CultureAdapterOptions) {
    this.#store = store;
    this.#options = options;
  }

  /**
   * Seals one Social Update Context (CS-UPD). It pins, at their current versions and committing groups and never copied, the
   * bound canonical referent and scope, every engaged source and the Cohort, and obtains the LIVE Population close-vouch AT
   * SEAL. It is create-only. It is NOT the shared meaning: that exists only at its Communicative Convention Close.
   */
  async sealUpdateContext(
    input: CultureSealInput,
  ): Promise<Result<CommitOutcome, CultureErrorCode>> {
    const basis = Id.safeParse(input.basis);
    if (!basis.success) return fail("INPUT_INVALID", "the basis label failed validation");
    const parsed = CultureSealRequestSchema.safeParse(input.request);
    if (!parsed.success) {
      return fail("INPUT_INVALID", "seal request failed validation", {
        issues: issues(parsed.error),
      });
    }
    const req = parsed.data;
    const get = (k: string) => this.#store.getFact(k);
    for (const [what, k] of [
      ["referent", req.referent_key],
      ["scope", req.scope_key],
    ] as const) {
      const binding = canonicalBindingViolation({ get }, k);
      if (binding) return fail("BINDING_INVALID", `the ${what}: ${binding}`, { key: k });
    }
    const sources: CjaSealedInputRef[] = [];
    for (const i of req.inputs) {
      const f = get(i.fact_key);
      if (!f) {
        return fail(
          "INPUT_NOT_ENGAGEABLE",
          "an engaged input is not committed; a context may not precede the evidence it seals",
          { key: i.fact_key },
        );
      }
      const read =
        i.read.basis === "AS-OF-NOW"
          ? ({ basis: "AS-OF-NOW" } as const)
          : ({
              basis: "AS-OF-DECLARED-CLOSE",
              close_basis: {
                name: i.read.close_name,
                producer: { owner: f.owner, operation: i.read.close_name },
              },
            } as const);
      const ref: CjaSealedInputRef = {
        owner: f.owner,
        fact_key: f.key,
        version: f.version,
        read,
        committed_by_group_id: f.provenance.group_id,
      };
      const basisViolation = inputBasisViolation(ref);
      if (basisViolation) return fail("INPUT_NOT_ENGAGEABLE", basisViolation, { key: i.fact_key });
      sources.push(ref);
    }
    const trigger = sources.find((s) => s.fact_key === req.trigger_fact_key);
    if (!trigger) {
      return fail("INPUT_INVALID", "the triggering fact is one of the engaged inputs");
    }
    const trigger_ref = {
      owner: trigger.owner,
      fact_key: trigger.fact_key,
      version: trigger.version,
      committed_by_group_id: trigger.committed_by_group_id,
    };
    const distinction = {
      referent_key: req.referent_key,
      scope_key: req.scope_key,
      context_id: req.context_id,
    };
    const causal_process_id = cjaCausalProcessId(trigger_ref);
    const update_id = cjaCultureUpdateId({
      causal_process_id,
      opportunity_id: CJA_OPPORTUNITY_ID,
      distinction_digest: cjaDistinctionDigest(distinction),
      owner_operation_id: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
    });
    const key = cultureUpdateContextKey(update_id);

    // RC-16: the update identity is deterministic, so a retry — or a reopen — reaches the committed context by identity,
    // before any Population question is asked of a world that may since have moved
    const committed = get(key);
    if (committed) return this.#replay(committed, req);

    const verdict = this.#options.populationScope.verifyScopeClose(req.cohort_fact_key);
    const constituency = constituencyFromVerdict(verdict);
    if (!constituency.ok) {
      return fail("CONSTITUENCY_INVALID", constituency.error.message);
    }
    const context: CultureUpdateContext = {
      update_id,
      slot_id: cultureSlotId(distinction),
      distinction,
      trigger_ref,
      causal_process_id,
      opportunity_id: CJA_OPPORTUNITY_ID,
      owner_operation_id: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
      inputs: sources,
      constituency: constituency.value,
      consumer_question: req.consumer_question,
    };
    const checked = CultureUpdateContextSchema.safeParse(context);
    if (!checked.success) {
      return fail("INPUT_INVALID", "the sealed context violates its contract", {
        issues: issues(checked.error),
      });
    }
    const violation = cultureContextViolation(checked.data);
    if (violation) return fail("INPUT_INVALID", violation);

    const pinned = contextPinnedKeys(checked.data);
    const kind = factKind("culture_update_context");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: cultureContextGroupId(update_id),
      intent_id: cultureContextIntentId(update_id),
      owner: kind.owner,
      facet: kind.facet,
      cause: cultureContextCause(update_id),
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: pinned.map((k) => ({ key: k, version: get(k)!.version })),
      depends_on: [...new Set(pinned.map((k) => get(k)!.provenance.group_id))],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: checked.data as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: basis.data,
          secrecy: ACCESS_CLASS_CULTURE_ENGINE_SIDE,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }

  #replay(
    committed: OwnerFact,
    req: ReturnType<typeof CultureSealRequestSchema.parse>,
  ): Result<CommitOutcome, CultureErrorCode> {
    const c = CultureUpdateContextSchema.safeParse(committed.value);
    const same =
      c.success &&
      canonicalEqual(c.data.distinction, {
        referent_key: req.referent_key,
        scope_key: req.scope_key,
        context_id: req.context_id,
      }) &&
      canonicalEqual(
        c.data.inputs.map((i) => i.fact_key),
        req.inputs.map((i) => i.fact_key),
      ) &&
      c.data.trigger_ref.fact_key === req.trigger_fact_key &&
      c.data.constituency.cohort_fact_key === req.cohort_fact_key &&
      c.data.consumer_question === req.consumer_question;
    if (!same) {
      return fail(
        "CONTEXT_CONFLICT",
        "this update identity has a committed sealed context with a different question or sources; it is immutable",
      );
    }
    const receipt = this.#store.lookupReceipt(committed.provenance.intent_id);
    if (!receipt) return fail("CONTEXT_CONFLICT", "a committed sealed context has no receipt");
    return ok({ receipt, replayed: true });
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The sealed Social Update Context, or undefined. Owner-side provenance: not a cross-owner read. */
  updateContext(updateId: string): { fact: OwnerFact; value: CultureUpdateContext } | undefined {
    const fact = this.#store.getFact(cultureUpdateContextKey(updateId));
    const value = fact ? CultureUpdateContextSchema.safeParse(fact.value) : undefined;
    return fact && value?.success ? { fact, value: value.data } : undefined;
  }

  /**
   * The established shared meaning/norm of a Culture state slot as it stands at the Communicative Convention Close, with the
   * group that committed the close; undefined until the close has committed. A fact that is not committed is never visible.
   */
  sharedMeaning(
    slotId: string,
  ): { fact: OwnerFact; value: CultureSharedMeaning; close_group: string } | undefined {
    const fact = this.#store.getFact(cultureSharedMeaningKey(slotId));
    const value = fact ? CultureSharedMeaningSchema.safeParse(fact.value) : undefined;
    return fact && value?.success
      ? { fact, value: value.data, close_group: fact.provenance.group_id }
      : undefined;
  }
}
