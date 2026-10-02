import {
  AuthoritySchema,
  CANON_WRITE_AUTHORITY,
  CAUSAL_DRAW_ENTROPY_BYTES,
  CAUSAL_DRAW_ENTROPY_SOURCE_CLASS,
  CAUSAL_DRAW_PRECOMMIT_BASIS,
  CAUSAL_DRAW_RESULT_BASIS,
  CAUSAL_DRAW_SECRECY,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  RESOLVER_AUTHORITY,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  causalDrawResultKey,
  fail,
  ok,
  type Authority,
  type CausalDrawInputRef,
  type CausalDrawPrecommit,
  type CausalDrawRefusalCode,
  type CausalDrawResult,
  type CommitGroup,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { deriveResultRecord } from "./derive.ts";
import {
  operatingSystemEntropy,
  type EntropySource,
  type OwnerRuleAuthority,
  type SubstantiveSlotInspector,
} from "./ports.ts";
import { preparePrior, validateSpecification, type PreparedPrior } from "./prior.ts";
import { CAUSAL_DRAW_ALGORITHMS, type CausalDrawAlgorithm } from "./sampler.ts";

export type CausalDrawErrorCode =
  | CausalDrawRefusalCode
  | StoreCommitErrorCode
  /** the resolver context is not role.resolver + permission.resolution.execute */
  | "AUTHORITY_DENIED"
  /** no IM-03 typed-owner interface is registered for the substantive owner: there is no fallback owner */
  | "OWNER_NOT_REGISTERED";

export interface CausalDrawAdapterOptions {
  /** IM-03 typed-owner slot interfaces, by substantive owner identity. Required: there is no default. */
  readonly slotInspectors: ReadonlyMap<string, SubstantiveSlotInspector>;
  /** IM-01 rule-currency seam used at precommit publication. Required: there is no default. */
  readonly ruleAuthority: OwnerRuleAuthority;
  /** CDE-01 source. Defaults to the operating-system CSPRNG; never replaced by a fallback. */
  readonly entropy?: EntropySource;
  /** CDV-01 registry of samplers this build can execute or verify. Defaults to the built-in registry. */
  readonly algorithms?: ReadonlyMap<string, CausalDrawAlgorithm>;
}

export interface DrawInput {
  /** the owner-supplied CausalDrawSpecification v1, validated here (CDR-01 step 1) */
  readonly specification: unknown;
  /** the resolver context under which entropy is acquired and CDA-01 executes */
  readonly resolution: Authority;
}

export type DrawDisposition = "NEW_DRAW" | "RESUMED_PRECOMMIT" | "REPLAYED_RESULT";

export interface DrawReference {
  readonly key: string;
  readonly version: number;
  /** the group the substantive owner must `depends_on` (result) or that the result depended on (precommit) */
  readonly group_id: string;
}

export interface DrawOutcome {
  readonly draw_id: string;
  readonly draw_key_digest: string;
  readonly spec_digest: string;
  /** an opaque candidate id: the layer never learns what it means */
  readonly selected_candidate_id: string;
  readonly disposition: DrawDisposition;
  readonly precommit: DrawReference;
  /**
   * What the substantive owner's later world-state write must reference (CDC-01): read this exact result fact/version
   * and list `result.group_id` in `depends_on`. The layer never writes that substantive value itself.
   */
  readonly result: DrawReference;
}

/** The committed precommit WITHOUT its seed: the seed is engine-internal provenance and is never handed out (RC-14). */
export interface PrecommitSummary {
  readonly fact: Pick<OwnerFact, "key" | "version" | "provenance" | "secrecy">;
  readonly draw_id: string;
  readonly spec_digest: string;
  readonly normalized_spec: CausalDrawPrecommit["normalized_spec"];
}

/** Stores whose last commit had an unknown outcome: no new entropy until the campaign is reopened and reconciled. */
const poisonedStores = new WeakSet<CampaignStore>();
const unreconciledDraws = new WeakMap<CampaignStore, Set<string>>();

const DRAW_ID = /^cdraw:v1:([0-9a-f]{64})$/;
const CONFLICTS: readonly StoreCommitErrorCode[] = [
  "INTENT_CONFLICT",
  "GROUP_ID_CONFLICT",
  "VERSION_CONFLICT",
];

/**
 * F-027-CD1 — the Causal Draw owner path (`causal_draw_kernel / draw_provenance`).
 *
 * ONE operation, `draw`, applies CDR-01 in its exact order and drives CDR-02:
 *
 *   1. structural validation   2. CDS-02 normalization and the three identities   3. committed-result replay
 *   4. substantive-slot check (IM-03 typed-owner interface)   5. committed-precommit resume
 *   6. new-precommit input proof   7. only then CDE-01 entropy, CAL-08 revalidation and the create-only precommit.
 *
 * The caller supplies a specification and a resolver context; it never supplies an owner, facet, key, group or intent
 * identity, an authority or a rule — those are derived (RC-16 identities from `draw_key_digest`; the pinned F-027-CD1
 * SourceRef from the registry). Publication is by the archivist path through the existing IM-11/IM-12/IM-17 store, so
 * there is one journal and one canon, and every recovery rule of RC-16 applies unchanged. There is NO method that
 * writes a precommit or result directly, none that accepts a seed, none that re-draws, and the layer returns only an
 * opaque candidate id: it never writes, infers or interprets the substantive result.
 */
export class CausalDrawAdapter {
  readonly #store: CampaignStore;
  readonly #inspectors: ReadonlyMap<string, SubstantiveSlotInspector>;
  readonly #ruleAuthority: OwnerRuleAuthority;
  readonly #entropy: EntropySource;
  readonly #algorithms: ReadonlyMap<string, CausalDrawAlgorithm>;

  constructor(store: CampaignStore, options: CausalDrawAdapterOptions) {
    this.#store = store;
    this.#inspectors = options.slotInspectors;
    this.#ruleAuthority = options.ruleAuthority;
    this.#entropy = options.entropy ?? operatingSystemEntropy;
    this.#algorithms = options.algorithms ?? CAUSAL_DRAW_ALGORITHMS;
  }

  async draw(input: DrawInput): Promise<Result<DrawOutcome, CausalDrawErrorCode>> {
    // The resolver context is a precondition of the operation (entropy and CDA-01 execute only under it). It adds no
    // gate among CDR-01 steps 1–7 and reorders none.
    const claimed = AuthoritySchema.safeParse(input.resolution);
    if (
      !claimed.success ||
      claimed.data.role !== RESOLVER_AUTHORITY.role ||
      claimed.data.permission !== RESOLVER_AUTHORITY.permission
    ) {
      return fail(
        "AUTHORITY_DENIED",
        "entropy and CDA-01 sampling execute only under role.resolver + permission.resolution.execute",
      );
    }
    // CDR-01 step 1
    const valid = validateSpecification(input.specification);
    if (!valid.ok) return valid;
    // CDR-01 step 2
    const prior = preparePrior(valid.value);
    const { draw_key_digest: digest } = prior;

    // CDR-01 step 3: committed result check
    const committedResult = this.#store.getFact(causalDrawResultKey(digest));
    if (committedResult) return this.#replay(prior, committedResult);

    // CDR-01 step 4: substantive-slot check before resume
    const committedPrecommit = this.#store.getFact(causalDrawPrecommitKey(digest));
    const slot = this.#checkSlot(prior, committedPrecommit !== undefined);
    if (slot) return slot;

    // CDR-01 step 5: precommit resume check
    if (committedPrecommit) return this.#resume(prior, committedPrecommit, "RESUMED_PRECOMMIT");

    // CDR-01 step 6: new-precommit input proof only
    const proof = this.#proveInputs(prior.normalized.input_refs);
    if (proof) return proof;

    // CDR-01 step 7: only now may entropy be obtained
    return this.#precommit(prior);
  }

  /** The committed result of a draw, by identity, with the group the substantive owner must depend on. */
  result(
    drawId: string,
  ): { fact: OwnerFact; value: CausalDrawResult; group_id: string } | undefined {
    const digest = DRAW_ID.exec(drawId)?.[1];
    const fact = digest ? this.#store.getFact(causalDrawResultKey(digest)) : undefined;
    const value = fact ? CausalDrawResultSchema.safeParse(fact.value) : undefined;
    return fact && value?.success
      ? { fact, value: value.data, group_id: fact.provenance.group_id }
      : undefined;
  }

  /** The committed precommit of a draw WITHOUT its seed, by identity. */
  precommit(drawId: string): PrecommitSummary | undefined {
    const digest = DRAW_ID.exec(drawId)?.[1];
    const fact = digest ? this.#store.getFact(causalDrawPrecommitKey(digest)) : undefined;
    const value = fact ? CausalDrawPrecommitSchema.safeParse(fact.value) : undefined;
    if (!fact || !value?.success) return undefined;
    return {
      fact: {
        key: fact.key,
        version: fact.version,
        provenance: fact.provenance,
        secrecy: fact.secrecy,
      },
      draw_id: value.data.draw_id,
      spec_digest: value.data.spec_digest,
      normalized_spec: value.data.normalized_spec,
    };
  }

  // -- CDR-01 / CDR-02 steps --------------------------------------------------------------------

  /** Step 3. Same spec_digest replays; a different one is an identity conflict. Verified, never resampled. */
  #replay(prior: PreparedPrior, resultFact: OwnerFact): Result<DrawOutcome, CausalDrawErrorCode> {
    const committed = CausalDrawResultSchema.safeParse(resultFact.value);
    if (!committed.success) {
      return fail("DRAW_INTEGRITY_FAILURE", "the committed result record is malformed");
    }
    if (committed.data.spec_digest !== prior.spec_digest) {
      return fail(
        "DRAW_IDENTITY_CONFLICT",
        "this draw_id has a committed result under a different spec_digest; it is not a new draw",
        { draw_id: prior.draw_id },
      );
    }
    const precommitFact = this.#store.getFact(causalDrawPrecommitKey(prior.draw_key_digest));
    if (!precommitFact) {
      return fail("DRAW_INTEGRITY_FAILURE", "a committed result has no committed precommit");
    }
    const expected = deriveResultRecord(precommitFact, prior.draw_key_digest, this.#algorithms);
    if (!expected.ok) return expected;
    if (!canonicalEqual(expected.value, committed.data)) {
      return fail(
        "DRAW_INTEGRITY_FAILURE",
        "the committed result is not what CDA-01 derives from its committed precommit",
      );
    }
    return ok(this.#outcome(prior, "REPLAYED_RESULT", precommitFact, resultFact, committed.data));
  }

  /**
   * Step 4. The substantive owner is asked through its IM-03 typed interface whether the slot is already
   * authoritatively established; lawful linkage is CD1's own rule: the establishing CommitGroup reads the exact
   * committed result fact AND lists this draw's result group in `depends_on`. No result record exists at this point
   * (step 3 returned otherwise), so a claimed linkage is a state conflict.
   */
  #checkSlot(
    prior: PreparedPrior,
    precommitExists: boolean,
  ): Result<never, CausalDrawErrorCode> | null {
    const { owner_operation, prospective_result_id } = prior.normalized.draw_key;
    const inspector = this.#inspectors.get(owner_operation.owner);
    if (!inspector) {
      return fail(
        "OWNER_NOT_REGISTERED",
        "no IM-03 typed-owner interface is registered for the substantive owner; there is no fallback owner",
        { owner: owner_operation.owner },
      );
    }
    const slot = inspector.inspectResultSlot({ owner_operation, prospective_result_id });
    if (!slot.established) return null;
    const group = this.#store.committedGroup(slot.establishing_intent_id);
    if (!group) {
      return fail(
        "DRAW_STATE_CONFLICT",
        "the substantive slot reports an establishing commit that is not in the journal",
        { draw_id: prior.draw_id },
      );
    }
    const claimsLinkage =
      group.reads.some((r) => r.key === causalDrawResultKey(prior.draw_key_digest)) ||
      group.depends_on.includes(causalDrawResultGroupId(prior.draw_key_digest));
    if (claimsLinkage) {
      return fail(
        "DRAW_STATE_CONFLICT",
        "the substantive establishment claims linkage to a Causal Draw result that is absent",
        { draw_id: prior.draw_id },
      );
    }
    if (precommitExists) {
      return fail(
        "DRAW_STATE_CONFLICT",
        "the substantive result was established independently while a precommit exists",
        { draw_id: prior.draw_id },
      );
    }
    return fail(
      "DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED",
      "the prospective result is already authoritatively established; no draw is needed",
      { draw_id: prior.draw_id },
    );
  }

  /** Step 5 (and race recovery): continue from the COMMITTED seed, never a new one. */
  async #resume(
    prior: PreparedPrior,
    precommitFact: OwnerFact,
    disposition: DrawDisposition,
  ): Promise<Result<DrawOutcome, CausalDrawErrorCode>> {
    const committed = CausalDrawPrecommitSchema.safeParse(precommitFact.value);
    if (!committed.success) {
      return fail("DRAW_INTEGRITY_FAILURE", "the committed precommit record is malformed");
    }
    if (committed.data.spec_digest !== prior.spec_digest) {
      return fail(
        "DRAW_IDENTITY_CONFLICT",
        "this draw_id has a committed precommit under a different spec_digest; it is not a new draw",
        { draw_id: prior.draw_id },
      );
    }
    const derived = deriveResultRecord(precommitFact, prior.draw_key_digest, this.#algorithms);
    if (!derived.ok) return derived;
    const digest = prior.draw_key_digest;
    const kind = factKind("causal_draw_result");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: causalDrawResultGroupId(digest),
      intent_id: causalDrawResultIntentId(digest),
      owner: kind.owner,
      facet: kind.facet,
      cause: prior.draw_id,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      // CDO-01: the result group reads/pins the exact precommit version and depends on the precommit group. It does NOT
      // revalidate owner_rule_ref or input_refs[] currency: those were frozen at lawful precommit.
      reads: [{ key: precommitFact.key, version: precommitFact.version }],
      depends_on: [precommitFact.provenance.group_id],
      writes: [
        {
          key: causalDrawResultKey(digest),
          owner: kind.owner,
          facet: kind.facet,
          value: derived.value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: CAUSAL_DRAW_RESULT_BASIS,
          secrecy: CAUSAL_DRAW_SECRECY,
          expected_version: 0,
        },
      ],
    };
    const published = await this.#publish(digest, group);
    if (!published.ok) return published;
    const resultFact = this.#store.getFact(causalDrawResultKey(digest));
    if (!resultFact) return fail("DRAW_INTEGRITY_FAILURE", "the committed result is not readable");
    return ok(this.#outcome(prior, disposition, precommitFact, resultFact, derived.value));
  }

  /**
   * Step 6 (and the pins re-proved at publication, CAL-08): every declared fact is committed at the declared version.
   * A fact or version that cannot be resolved is `DRAW_INPUT_REF_UNRESOLVED`; a declared version that exists
   * historically but is no longer current is `DRAW_INPUT_REF_STALE_AT_PRECOMMIT`.
   */
  #proveInputs(refs: readonly CausalDrawInputRef[]): Result<never, CausalDrawErrorCode> | null {
    let stale: CausalDrawInputRef | undefined;
    for (const ref of refs) {
      const fact = this.#store.getFact(ref.fact_key);
      if (
        !fact ||
        fact.owner !== ref.owner ||
        ref.version > fact.version ||
        (ref.version === fact.version && fact.provenance.group_id !== ref.committed_by)
      ) {
        return fail(
          "DRAW_INPUT_REF_UNRESOLVED",
          "a declared input fact is not committed at the declared version",
          { fact_key: ref.fact_key, version: ref.version },
        );
      }
      if (ref.version < fact.version) stale ??= ref;
    }
    return stale
      ? fail(
          "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
          "a declared input version exists historically but is no longer current",
          { fact_key: stale.fact_key, version: stale.version },
        )
      : null;
  }

  /** Step 7: entropy, publication-time revalidation, and the create-only precommit. */
  async #precommit(prior: PreparedPrior): Promise<Result<DrawOutcome, CausalDrawErrorCode>> {
    const digest = prior.draw_key_digest;
    const algorithm = this.#algorithms.get(prior.normalized.algorithm_id);
    if (!algorithm) {
      return fail(
        "DRAW_ALGORITHM_UNSUPPORTED",
        `${prior.normalized.algorithm_id} is not supported by this build; no draw is created`,
      );
    }
    // RC-16: an unknown outcome is reconciled by reopening before ANY new entropy exists.
    if (unreconciledDraws.get(this.#store)?.has(digest) || poisonedStores.has(this.#store)) {
      return fail(
        "UNKNOWN_OUTCOME",
        "an earlier commit had an unknown outcome; reopen the campaign and reconcile by the deterministic intent identity before any new entropy",
        { draw_id: prior.draw_id },
      );
    }
    let seed: Uint8Array;
    try {
      seed = this.#entropy(CAUSAL_DRAW_ENTROPY_BYTES);
    } catch {
      return fail(
        "DRAW_ENTROPY_UNAVAILABLE",
        "secure entropy could not be obtained; nothing was written",
      );
    }
    if (!(seed instanceof Uint8Array) || seed.length !== CAUSAL_DRAW_ENTROPY_BYTES) {
      return fail(
        "DRAW_ENTROPY_UNAVAILABLE",
        "the entropy source did not deliver exactly 32 bytes; nothing was written",
      );
    }
    const record: CausalDrawPrecommit = {
      draw_id: prior.draw_id,
      draw_key: prior.normalized.draw_key,
      spec_digest: prior.spec_digest,
      normalized_spec: prior.normalized,
      entropy_hex: Buffer.from(seed).toString("hex"),
      entropy_source_class: CAUSAL_DRAW_ENTROPY_SOURCE_CLASS,
      algorithm_id: prior.normalized.algorithm_id,
    };

    // CAL-08 revalidation at publication: owner rule still effective; every input still at its declared version.
    if (
      !this.#ruleAuthority.isEffectiveForPriorCreation(
        prior.normalized.owner_rule_ref,
        record.draw_key,
      )
    ) {
      return fail(
        "DRAW_OWNER_RULE_STALE_AT_PRECOMMIT",
        "owner_rule_ref is not authoritative and effective for the creation of this prior; the owner must re-evaluate",
        { draw_id: prior.draw_id },
      );
    }
    const stillCurrent = this.#proveInputs(prior.normalized.input_refs);
    if (stillCurrent) return stillCurrent;

    const kind = factKind("causal_draw_precommit");
    const reads = [
      ...new Map(
        prior.normalized.input_refs.map((r) => [`${r.fact_key}\u0000${r.version}`, r]),
      ).values(),
    ].map((r) => ({ key: r.fact_key, version: r.version }));
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: causalDrawPrecommitGroupId(digest),
      intent_id: causalDrawPrecommitIntentId(digest),
      owner: kind.owner,
      facet: kind.facet,
      cause: prior.draw_id,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [],
      writes: [
        {
          key: causalDrawPrecommitKey(digest),
          owner: kind.owner,
          facet: kind.facet,
          value: record as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: CAUSAL_DRAW_PRECOMMIT_BASIS,
          secrecy: CAUSAL_DRAW_SECRECY,
          expected_version: 0,
        },
      ],
    };
    const published = await this.#publish(digest, group);
    if (!published.ok) {
      const e = published.error;
      if (CONFLICTS.includes(e.code as StoreCommitErrorCode)) {
        // A concurrent caller committed the one lawful precommit for this identity first: discard the uncommitted seed
        // above, recover the committed precommit, and continue from ITS seed.
        const winner = this.#store.getFact(causalDrawPrecommitKey(digest));
        if (winner) return this.#resume(prior, winner, "RESUMED_PRECOMMIT");
      }
      if (e.code === "STALE_READ") {
        const key = (e.details as { key?: unknown } | undefined)?.key;
        if (prior.normalized.input_refs.some((r) => r.fact_key === key)) {
          return fail(
            "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
            "a declared input fact changed before the precommit was published; no draw was created",
            { fact_key: key as string },
          );
        }
      }
      return published;
    }
    const precommitFact = this.#store.getFact(causalDrawPrecommitKey(digest));
    if (!precommitFact)
      return fail("DRAW_INTEGRITY_FAILURE", "the committed precommit is not readable");
    return this.#resume(prior, precommitFact, "NEW_DRAW");
  }

  /** The one `.commit(` of this adapter: every Causal Draw record is published here, nowhere else. */
  async #publish(
    digest: string,
    group: CommitGroup,
  ): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    const outcome = await this.#store.commit(group);
    if (
      !outcome.ok &&
      (outcome.error.code === "UNKNOWN_OUTCOME" || outcome.error.code === "STORE_POISONED")
    ) {
      poisonedStores.add(this.#store);
      const set = unreconciledDraws.get(this.#store) ?? new Set<string>();
      set.add(digest);
      unreconciledDraws.set(this.#store, set);
    }
    return outcome;
  }

  #outcome(
    prior: PreparedPrior,
    disposition: DrawDisposition,
    precommit: OwnerFact,
    resultFact: OwnerFact,
    result: CausalDrawResult,
  ): DrawOutcome {
    return {
      draw_id: prior.draw_id,
      draw_key_digest: prior.draw_key_digest,
      spec_digest: prior.spec_digest,
      selected_candidate_id: result.selected_candidate_id,
      disposition,
      precommit: {
        key: precommit.key,
        version: precommit.version,
        group_id: precommit.provenance.group_id,
      },
      result: {
        key: resultFact.key,
        version: resultFact.version,
        group_id: resultFact.provenance.group_id,
      },
    };
  }
}
