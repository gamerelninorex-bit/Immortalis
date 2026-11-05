import type {
  InitialLocalityCompletion,
  InitialSetupDisposition,
  InitialSetupGrant,
  InitialSetupInput,
  InitialSetupInvocation,
  InitialSetupResponse,
  Result,
  ScopeDecisionRecord,
} from "@immortalis/contracts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import {
  buildCompletionGroup,
  buildDispositionGroup,
  buildGrantGroup,
  buildInputGroup,
  buildInvocationGroup,
  buildResponseGroup,
  buildScopeDecisionGroup,
} from "./publish.ts";

type Published = Promise<Result<CommitOutcome, StoreCommitErrorCode>>;

/**
 * The World-State / Referee owner adapter for the v0.9 bootstrap records: the ONLY place that commits them. Callers (the trusted
 * workflow service) hand it a record; it builds the exact bound group and publishes it through the store, where the deterministic
 * admission re-derives every claim in it. It decides nothing, invents no value and holds no state of its own: every method reads the
 * committed facts it must pin at the moment of publication, so a retry after a crash re-derives the same group and the same
 * identities, and an identical committed record is a replay, never a second write.
 */
export class InitialSetupPublisher {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  get #facts() {
    return { get: (key: string) => this.#store.getFact(key) };
  }
  get #campaign(): string {
    return this.#store.head().campaign_id;
  }

  input(i: InitialSetupInput): Published {
    return this.#store.commit(buildInputGroup(this.#campaign, this.#facts, i));
  }
  invocation(v: InitialSetupInvocation): Published {
    return this.#store.commit(buildInvocationGroup(this.#campaign, this.#facts, v));
  }
  response(r: InitialSetupResponse): Published {
    return this.#store.commit(buildResponseGroup(this.#campaign, this.#facts, r));
  }
  scopeDecision(record: ScopeDecisionRecord): Published {
    return this.#store.commit(buildScopeDecisionGroup(this.#campaign, this.#facts, record));
  }
  grant(g: InitialSetupGrant): Published {
    return this.#store.commit(buildGrantGroup(this.#campaign, this.#facts, g));
  }
  completion(c: InitialLocalityCompletion): Published {
    return this.#store.commit(buildCompletionGroup(this.#campaign, this.#facts, c));
  }
  disposition(d: InitialSetupDisposition): Published {
    return this.#store.commit(buildDispositionGroup(this.#campaign, this.#facts, d));
  }
}
