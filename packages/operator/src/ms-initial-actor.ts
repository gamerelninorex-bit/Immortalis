import {
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  msActorIssueKey,
  msActorResponseKey,
} from "@immortalis/contracts";
import {
  MsSetupPublisher,
  planMsActor,
  qualifiedMsResponse,
  initializeCapturedChronology,
  sha256Bytes,
  type InitialSetupPolicy,
  type CampaignStore,
} from "@immortalis/engine";
import { MsActorRunner } from "./ms-actor-runner.ts";

export type MsAdvanceResult = {
  status: "COMPLETED" | "NON_PRODUCING" | "PARKED_UNKNOWN" | "REFUSED";
  reason?: string;
};
/** Trusted role.world author operation followed by independent Named-Actor/World-State/Temporal publication. No player filing. */
export class MsInitialActorService {
  readonly #publisher: MsSetupPublisher;
  #queue: Promise<unknown> = Promise.resolve();
  readonly store: CampaignStore;
  readonly runner: MsActorRunner;
  readonly policy: InitialSetupPolicy | undefined;
  constructor(store: CampaignStore, runner: MsActorRunner, policy?: InitialSetupPolicy) {
    this.store = store;
    this.runner = runner;
    this.policy = policy;
    this.#publisher = new MsSetupPublisher(store);
  }
  advance(): Promise<MsAdvanceResult> {
    const next = this.#queue.then(
      () => this.#advance(),
      () => this.#advance(),
    );
    this.#queue = next.catch(() => undefined);
    return next;
  }
  async #advance(): Promise<MsAdvanceResult> {
    let responseSeen = false;
    const commit = async (p: ReturnType<MsSetupPublisher["issue"]>) => {
      const r = await p;
      if (!r.ok) throw new Error(r.error.code + ": " + r.error.message);
    };
    try {
      const s = this.#publisher.chain();
      await commit(this.#publisher.issue());
      const qkey = msActorIssueKey(s.c.world_id, s.c.locus_id, s.digest),
        qf = this.store.getFact(qkey)!,
        q = InitialActorSetupIssueSchema.parse(qf.value),
        rkey = msActorResponseKey(s.c.world_id, s.c.locus_id, s.digest);
      if (!this.store.getFact(rkey)) {
        const current = this.#publisher.state(),
          p = planMsActor(current, s.cf.key, s.c);
        if (!p.ok) return { status: "REFUSED", reason: p.error.code };
        const cap = this.runner.authorize(this.store, { fact_key: qkey, version: 1 });
        if (!cap) return { status: "REFUSED", reason: "MS_ACTOR_PROFILE" };
        const answer = await this.runner.dispatch(cap, p.value.instructions, p.value.bytes);
        if (answer.status !== "RESPONDED")
          return {
            status: answer.status === "UNKNOWN" ? "PARKED_UNKNOWN" : "REFUSED",
            reason: answer.reason,
          };
        responseSeen = true;
        await commit(
          this.#publisher.response({
            world_id: q.world_id,
            locus_id: q.locus_id,
            setup_id: q.setup_id,
            completion: q.completion,
            issue: { fact_key: qkey, version: 1 },
            task_id: q.task_id,
            input_hash: q.input_hash,
            parser: q.parser,
            raw_response_base64: Buffer.from(answer.raw).toString("base64"),
            raw_response_hash: sha256Bytes(answer.raw),
            envelope: answer.envelope,
          }),
        );
      }
      responseSeen = true;
      const r = InitialActorSetupResponseSchema.parse(this.store.getFact(rkey)!.value);
      if (!qualifiedMsResponse(r, qf, this.store.head().campaign_id))
        return { status: "NON_PRODUCING" };
      await commit(this.#publisher.existence());
      await commit(this.#publisher.placement());
      await commit(this.#publisher.closure());
      const time = await initializeCapturedChronology(
        this.store,
        this.policy ? { policy: this.policy } : {},
      );
      if (!time.ok) return { status: "REFUSED", reason: time.error.code };
      await commit(this.#publisher.presence());
      return { status: "COMPLETED" };
    } catch (e) {
      return { status: responseSeen ? "PARKED_UNKNOWN" : "REFUSED", reason: (e as Error).message };
    }
  }
}
