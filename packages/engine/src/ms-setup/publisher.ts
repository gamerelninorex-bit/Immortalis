import {
  CANON_WRITE_AUTHORITY,
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  NON_PC_INITIAL,
  TEMPORAL_STATE_KEY,
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  worldSetupClosureKey,
  msActorIssueKey,
  msActorResponseKey,
  namedActorExistenceBasisKey,
  type CommitGroup,
  type InitialActorSetupResponse,
  type Pin,
} from "@immortalis/contracts";
import type { CampaignStore } from "../persistence/store.ts";
import { factKind, type FactKindId } from "../owners/registry.ts";
import { msChain, msIdentities, reachablePins } from "./admission.ts";
import {
  descriptor,
  msCompletionDigest,
  msActorId,
  planMsActor,
  deriveMsExistence,
  pinOf,
} from "./protocol.ts";
import { msQualifiedSource, msPlacementValue } from "./r1.ts";
import { verifyMsIntegrity } from "./integrity.ts";
import { MS_R1_PLACEMENT_V1_RULE, MS_R1_CLOSURE_V1_RULE, MS_R1_PRESENCE_V1_RULE } from "./rules.ts";

export function buildMsGroup(
  store: CampaignStore,
  kindId: FactKindId,
  key: string,
  value: unknown,
  pins: readonly Pin[],
  rule?: CommitGroup["rule"],
): CommitGroup {
  const kind = factKind(kindId),
    unique = new Map<string, number>();
  for (const p of pins) {
    if (unique.has(p.fact_key) && unique.get(p.fact_key) !== p.version)
      throw new Error("conflicting MS pins");
    unique.set(p.fact_key, p.version);
  }
  return {
    campaign_id: store.head().campaign_id,
    ...msIdentities(key),
    owner: kind.owner,
    facet: kind.facet,
    rule: rule ?? kind.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [...unique]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, version]) => ({ key, version })),
    depends_on: [
      ...new Set([...unique.keys()].flatMap((k) => store.getFact(k)?.provenance.group_id ?? [])),
    ].sort(),
    writes: [
      {
        key,
        owner: kind.owner,
        facet: kind.facet,
        value: value as CommitGroup["writes"][number]["value"],
        expected_version: 0,
        basis: "ms-initial-actor-v1",
        secrecy: "engine-internal",
        unit: null,
      },
    ],
  };
}
/** Owner sequencer: derives every published value, with source requalification at both adapter and raw admission. */
export class MsSetupPublisher {
  readonly store: CampaignStore;
  constructor(store: CampaignStore) {
    this.store = store;
  }
  state() {
    return {
      campaign_id: this.store.head().campaign_id,
      revision: this.store.head().revision,
      facts: new Map(this.store.listFacts().map((f) => [f.key, f])),
    };
  }
  chain() {
    const state = this.state(),
      s = msChain(state);
    if (!s) throw new Error("no source-qualified MS Completion");
    const digest = msCompletionDigest(descriptor(s.cf)),
      actor = msActorId(digest);
    return { ...s, digest, actor, state };
  }
  async #publish(
    kind: FactKindId,
    key: string,
    make: () => { value: unknown; pins: readonly Pin[] },
    rule?: CommitGroup["rule"],
  ) {
    const prior = this.store.committedGroup(msIdentities(key).intent_id);
    if (prior) {
      const violations = verifyMsIntegrity(this.store);
      if (violations.length)
        throw new Error("MS source requalification failed: " + violations[0]!.message);
      return this.store.commit(prior);
    }
    const { value, pins } = make();
    return this.store.commit(buildMsGroup(this.store, kind, key, value, pins, rule));
  }
  issue() {
    const s = this.chain(),
      key = msActorIssueKey(s.c.world_id, s.c.locus_id, s.digest);
    return this.#publish("initial_actor_setup_issue", key, () => {
      const p = planMsActor(s.state, s.cf.key, s.c);
      if (!p.ok) throw new Error(p.error.code);
      return { value: p.value.issue, pins: [...reachablePins(p.value.issue), ...s.input.genesis] };
    });
  }
  response(value: InitialActorSetupResponse) {
    const q = this.store.getFact(value.issue.fact_key),
      p = InitialActorSetupIssueSchema.parse(q?.value);
    const key = msActorResponseKey(p.world_id, p.locus_id, p.completion_digest);
    // Changed bytes under the same response key must reach the same fixed intent and be refused.
    return this.store.commit(
      buildMsGroup(this.store, "initial_actor_setup_response", key, value, reachablePins(value)),
    );
  }
  existence() {
    const s = this.chain(),
      key = namedActorExistenceBasisKey(s.actor);
    return this.#publish("named_actor_existence_basis", key, () => {
      const q = this.store.getFact(msActorIssueKey(s.c.world_id, s.c.locus_id, s.digest))!,
        r = this.store.getFact(msActorResponseKey(s.c.world_id, s.c.locus_id, s.digest))!;
      InitialActorSetupResponseSchema.parse(r?.value);
      const value = deriveMsExistence(s.i, s.g, s.cf, q, r);
      return { value, pins: reachablePins(value) };
    });
  }
  placement() {
    const s = this.chain();
    return this.#publish(
      "actor_setup_placement",
      actorSetupPlacementKey(s.actor),
      () => {
        const source = msQualifiedSource(s.state);
        if (!source) throw new Error("MS placement source unavailable");
        const value = msPlacementValue(source);
        return {
          value,
          pins: [
            pinOf(source.basis),
            { fact_key: value.world.fact_key, version: 1 },
            { fact_key: value.locus.fact_key, version: 1 },
          ],
        };
      },
      MS_R1_PLACEMENT_V1_RULE,
    );
  }
  closure() {
    const s = this.chain();
    return this.#publish(
      "world_setup_closure",
      worldSetupClosureKey(s.c.world_id),
      () => {
        const p = this.store.getFact(actorSetupPlacementKey(s.actor))!,
          source = msQualifiedSource(s.state);
        if (!p || !source) throw new Error("MS closure source unavailable");
        const value = { world: msPlacementValue(source).world, placements: [pinOf(p)] };
        return {
          value,
          pins: [{ fact_key: value.world.fact_key, version: 1 }, ...value.placements],
        };
      },
      MS_R1_CLOSURE_V1_RULE,
    );
  }
  presence() {
    const s = this.chain();
    return this.#publish(
      "actor_physical_presence",
      actorPhysicalPresenceKey(s.actor),
      () => {
        const source = msQualifiedSource(s.state, "B2");
        if (!source) throw new Error("MS presence source unavailable");
        const p = msPlacementValue(source),
          placement = this.store.getFact(actorSetupPlacementKey(s.actor))!,
          closure = this.store.getFact(worldSetupClosureKey(s.c.world_id))!,
          time = this.store.getFact(TEMPORAL_STATE_KEY)!;
        const value = {
          actor_id: s.actor,
          world: p.world,
          locus: p.locus,
          pinned_versions: { world: 1, locus: 1, placement: 1, closure: 1 },
          effective_instant: s.input.chronology.document.time,
          initial_custody: NON_PC_INITIAL,
          custodian: {
            owner: "world_state",
            facet: FACET_WORLD_FALLBACK_ENTITY,
            basis: FALLBACK_BASIS,
          },
        };
        return {
          value,
          pins: [
            { fact_key: p.world.fact_key, version: 1 },
            { fact_key: p.locus.fact_key, version: 1 },
            pinOf(placement),
            pinOf(closure),
            pinOf(time),
          ],
        };
      },
      MS_R1_PRESENCE_V1_RULE,
    );
  }
}
