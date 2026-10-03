import {
  CANON_WRITE_AUTHORITY,
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  NamedActorRandomizedEstablishmentSchema,
  OWNER_NAMED_ACTOR,
  PublicationSchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  causalDrawId,
  fail,
  parseCapabilityCandidateId,
  type Authority,
  type CausalDrawInputRef,
  type CommitGroup,
  type NamedActorCapability,
  type NamedActorCapabilityBasis,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { CausalDrawAdapter, type CausalDrawErrorCode } from "../causal-draw/adapter.ts";
import type { EntropySource } from "../causal-draw/ports.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { actorBoundaryViolation, capabilityDrawDigest, causeOwnerViolation } from "./derive.ts";
import {
  capabilityDrawSpecification,
  namedActorRuleAuthority,
  namedActorSlotInspector,
} from "./randomized.ts";

export type NamedActorErrorCode = StoreCommitErrorCode | CausalDrawErrorCode | "INPUT_INVALID";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/** The uncertainty branch of WS-016 §16 (steps 3–4): established only through its Causal Draw, never as a plain basis. */
const RANDOMIZED_METHOD = "BOUNDED_PRIOR_RANDOMIZED";

export interface NamedActorAdapterOptions {
  /**
   * CDE-01 entropy source for the owner's Causal Draws (F-027-CD1): defaults to the operating-system CSPRNG. The
   * Named-Actor owner never generates, holds or interprets entropy itself; this only selects the trusted runtime's source.
   */
  readonly entropy?: EntropySource;
}

/**
 * IM-07 Named-Actor capability — the authored path of the Named-Actor owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a governing
 * rule: those come from the specification-backed registry, and the publication is made by the archivist path through
 * the existing IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE authored publication: the
 * establishment basis of one capability of one Named Actor, causally determined from committed foreign facts it pins.
 * The persisted capability is NOT a method here: it is the `namedActorCapabilityCloseProvider` operation the IM-02
 * coordinator resolves as the owner's declared capability close, inside the engaged object of the dependent
 * consequence that materially requires it. There is no capability writer, no setter, no development/loss/amendment,
 * no lifecycle transfer and no way to write a PC's capability, so no caller can write Named-Actor state out of order;
 * the store's admission refuses them for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed
 * input is refused as a conflict rather than silently reusing it. Nothing is re-rolled.
 *
 * Where genuine uncertainty remains (WS-016 §16 steps 3–4) the owner's second authored publication,
 * `establishRandomizedCapabilityBasis`, defines the branch-invariant bounded prior and has the neutral Causal Draw
 * (F-027-CD1) fix the unresolved slot: the draw is committed first, then the owner writes ITS OWN basis by reference to
 * that result. Character Capability owns no RNG, roll table or randomization phase; the draw identity is the slot's
 * stable causal identity, so a retry, a restart or a reframing reaches the same draw and the same establishment.
 */
export class NamedActorAdapter {
  readonly #store: CampaignStore;
  readonly #causalDraw: CausalDrawAdapter;

  constructor(store: CampaignStore, options: NamedActorAdapterOptions = {}) {
    this.#store = store;
    this.#causalDraw = new CausalDrawAdapter(store, {
      slotInspectors: new Map([[OWNER_NAMED_ACTOR, namedActorSlotInspector(store)]]),
      ruleAuthority: namedActorRuleAuthority,
      ...(options.entropy ? { entropy: options.entropy } : {}),
    });
  }

  /**
   * Commits the sealed establishment basis of one Named-Actor capability. Every cause is a committed foreign fact,
   * pinned at its current version (never copied). The basis is create-only: one slot per actor/capability. It is NOT
   * the capability and is not visible to any cross-owner consumer: the capability exists only at its close.
   */
  async establishCapabilityBasis(
    input: Publication & { readonly capability: unknown },
  ): Promise<Result<CommitOutcome, NamedActorErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const method = (input.capability as { establishment?: { method?: unknown } } | null)
      ?.establishment?.method;
    if (method === RANDOMIZED_METHOD) {
      return fail(
        "INPUT_INVALID",
        "a randomized establishment is fixed by its Causal Draw and made only by establishRandomizedCapabilityBasis; nothing was established",
      );
    }
    const basis = NamedActorCapabilityBasisSchema.safeParse(input.capability);
    if (!basis.success)
      return fail("INPUT_INVALID", "capability basis failed validation", {
        issues: issues(basis.error),
      });
    const b = basis.data;
    const key = actorCapabilityBasisKey(b.actor_id, b.capability_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const pinned = [...new Set(b.establishment.causes.map((c) => c.fact_key))];
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
    }
    return this.#publish(p.data, "named_actor_capability_basis", key, b, reads, depends_on);
  }

  /**
   * WS-016 §16 steps 3–4. The caller states that genuine uncertainty remains after the smallest relevant established
   * causes (pinned here, and the exact inputs of the prior) and authors the branch-invariant bounded prior: the lawful
   * possibilities and their relative causal weights. This operation then
   *
   *   1. refuses what the establishment could never be admitted for, BEFORE any draw state exists (a draw is
   *      irreversible, so an inadmissible request must not consume the slot's one opportunity);
   *   2. has the Causal Draw fix the slot's one stable draw (`resolution` is the resolver context CDE-01 requires);
   *   3. reads the owner's meaning off the selected opaque candidate;
   *   4. commits its OWN basis, reading the exact committed result fact/version and depending on its result group.
   *
   * Every step is idempotent by identity: a retry after any committed Causal Draw state, or after the establishment,
   * converges on the same draw and the same basis (the marker is whatever that draw selected, never a re-roll), and a
   * changed prior or cause set is refused as a conflict. There is no default prior, grade or weight.
   */
  async establishRandomizedCapabilityBasis(
    input: Publication & { readonly capability: unknown; readonly resolution: unknown },
  ): Promise<Result<CommitOutcome, NamedActorErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const parsed = NamedActorRandomizedEstablishmentSchema.safeParse(input.capability);
    if (!parsed.success)
      return fail("INPUT_INVALID", "randomized establishment failed validation", {
        issues: issues(parsed.error),
      });
    const e = parsed.data;
    const key = actorCapabilityBasisKey(e.actor_id, e.capability_id);
    const digest = capabilityDrawDigest(e.actor_id, e.capability_id);
    const drawId = causalDrawId(digest);
    const committed = this.#causalDraw.precommit(drawId);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const reconciling = prior !== null && prior.writes.some((w) => w.key === key);

    // 1. nothing is drawn for a request the establishment could never be admitted for
    if (!committed && !this.#causalDraw.result(drawId) && !this.#store.getFact(key)) {
      const refused = this.#preDrawViolation(e);
      if (refused) return refused;
    }
    const refs: CausalDrawInputRef[] = [];
    for (const cause of e.causes) {
      // a version already pinned by the committed prior keeps the committer that prior recorded (a superseded version's
      // committing group cannot be re-read by identity); otherwise it is the current fact's
      const known = committed?.normalized_spec.input_refs.find(
        (r) =>
          r.owner === cause.owner && r.fact_key === cause.fact_key && r.version === cause.version,
      );
      const committedBy =
        known?.committed_by ?? this.#store.getFact(cause.fact_key)?.provenance.group_id;
      if (!committedBy) {
        return fail("PREREQUISITE_MISSING", "a causal input is not committed", {
          key: cause.fact_key,
        });
      }
      refs.push({
        owner: cause.owner,
        fact_key: cause.fact_key,
        version: cause.version,
        committed_by: committedBy,
      });
    }

    // 2. the neutral Causal Draw fixes the slot
    const drawn = await this.#causalDraw.draw({
      specification: capabilityDrawSpecification(e, refs),
      resolution: input.resolution as Authority,
    });
    if (!drawn.ok) return drawn;
    const draw = drawn.value;

    // 3. the owner's reading of the selected opaque candidate
    const selected = parseCapabilityCandidateId(draw.selected_candidate_id);
    if (!selected) {
      return fail(
        "INPUT_INVALID",
        "the selected candidate is not a possibility of the Character Capability owner",
      );
    }

    // 4. the owner's own establishment, by reference to the committed draw result
    const basis = NamedActorCapabilityBasisSchema.safeParse({
      actor_id: e.actor_id,
      capability_id: e.capability_id,
      marker: selected.marker,
      materiality: e.materiality,
      establishment: {
        method: RANDOMIZED_METHOD,
        causes: e.causes,
        draw: {
          draw_id: draw.draw_id,
          result: { fact_key: draw.result.key, version: draw.result.version },
        },
      },
    });
    if (!basis.success)
      return fail("INPUT_INVALID", "capability basis failed validation", {
        issues: issues(basis.error),
      });
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (reconciling) {
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const pinned = [...new Set(e.causes.map((c) => c.fact_key))];
      reads = [
        ...pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
        { key: draw.result.key, version: draw.result.version },
      ];
      depends_on = [
        ...new Set([
          ...pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? []),
          draw.result.group_id,
        ]),
      ];
    }
    return this.#publish(
      p.data,
      "named_actor_capability_basis",
      key,
      basis.data,
      reads,
      depends_on,
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The sealed establishment basis, or undefined. Owner-side provenance: not a cross-owner read. */
  basis(
    actorId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: NamedActorCapabilityBasis } | undefined {
    const fact = this.#store.getFact(actorCapabilityBasisKey(actorId, capabilityId));
    return fact ? { fact, value: NamedActorCapabilityBasisSchema.parse(fact.value) } : undefined;
  }

  /**
   * The persisted capability as it stands at the actor owner's declared capability close, with the group that
   * committed the close; undefined until the close has committed. A capability that is not committed is never visible.
   */
  capability(
    actorId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: NamedActorCapability; close_group: string } | undefined {
    const fact = this.#store.getFact(actorCapabilityKey(actorId, capabilityId));
    return fact
      ? {
          fact,
          value: NamedActorCapabilitySchema.parse(fact.value),
          close_group: fact.provenance.group_id,
        }
      : undefined;
  }

  /**
   * What admission would refuse for this request regardless of the draw, judged from the same shared rules, so that no
   * Causal Draw is created for an establishment that could never be committed. Mirrors the cause and boundary checks of
   * IM-11 admission; admission remains the authority and re-judges everything.
   */
  #preDrawViolation(e: {
    readonly actor_id: string;
    readonly causes: readonly { owner: string; fact_key: string; version: number }[];
  }): Result<never, NamedActorErrorCode> | null {
    const facts = {
      get: (k: string) => this.#store.getFact(k),
      has: (k: string) => this.#store.getFact(k) !== undefined,
    };
    const boundary = actorBoundaryViolation(facts, e.actor_id);
    if (boundary) return fail("KEY_NOT_ADMITTED", boundary);
    for (const cause of e.causes) {
      const foreign = causeOwnerViolation(cause.owner);
      if (foreign) return fail("REFERENCE_INVALID", foreign, { key: cause.fact_key });
      const fact = this.#store.getFact(cause.fact_key);
      if (!fact) {
        return fail("PREREQUISITE_MISSING", "a causal input is not committed", {
          key: cause.fact_key,
        });
      }
      if (fact.owner !== cause.owner || fact.version !== cause.version) {
        return fail(
          "REFERENCE_INVALID",
          "a cause is its source owner's own committed fact, pinned at its current version and never copied",
          { key: cause.fact_key },
        );
      }
    }
    return null;
  }

  async #publish(
    p: Publication,
    kindId: "named_actor_capability_basis",
    key: string,
    value: unknown,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, NamedActorErrorCode>> {
    const kind = factKind(kindId);
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }
}

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
