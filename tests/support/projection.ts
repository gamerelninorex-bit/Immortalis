import type { AccessEvent, OwnerFact } from "@immortalis/contracts";
import type { ProjectionStateView } from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_PC_ID,
  accessEvent,
  accessPublication,
  at,
  packetAdvanceRequest,
  packetConsumerBoundaryId,
  packetConsumerObject,
  pcAccessEvent,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishPcCapability,
  registerPacketConsumer,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "./epistemic.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

export const PC = FIXTURE_PC_ID;
export const EVENT_SIGNAL = "event-signal-1";
export const EVENT_OTHER = "event-signal-2";

/** The projection's only input capability: read-only access to committed facts by identity. */
export const viewOf = (s: EpistemicSeeded): ProjectionStateView => ({
  getFact: (key) => s.campaign.store.getFact(key),
  committedGroup: (id) => s.campaign.store.committedGroup(id),
});

/** A view that overrides individual facts (a tampered or absent committed fact) and passes everything else through. */
export const viewWith = (
  s: EpistemicSeeded,
  override: Readonly<Record<string, (f: OwnerFact | undefined) => OwnerFact | undefined>>,
): ProjectionStateView => ({
  getFact: (key) => {
    const real = s.campaign.store.getFact(key);
    const f = override[key];
    return f ? f(real) : real;
  },
  committedGroup: (id) => s.campaign.store.committedGroup(id),
});

export const seedSignal = (o: Parameters<typeof seededEpistemicCampaign>[1] = {}) =>
  seededEpistemicCampaign(tempDir(), o);

/** Everything an observer could compare to prove nothing was written and no time moved. */
export const stateDigest = (s: EpistemicSeeded) => {
  const head = s.campaign.store.head();
  return {
    revision: head.revision,
    state_sha256: head.state_sha256,
    journal_entries: head.journal_entries,
    journal_head_sha256: head.journal_head_sha256,
    clock: s.coordinator.state()?.fact.value ?? null,
  };
};

/**
 * One active-PC event, the consequence that materially requires its packet, and one sealed resolution transaction that
 * forms it: the packet is then the CURRENT arrival. `n` offsets the publication sequence so several can coexist.
 */
export async function formPcArrival(
  s: EpistemicSeeded,
  o: {
    eventId?: string;
    consumer?: string;
    tx?: string;
    /** the earlier transaction whose persisted remainder this one consumes */
    continues?: string;
    n?: number;
    capability?: boolean;
    over?: Partial<AccessEvent>;
    boundaryAt?: number;
  } = {},
): Promise<AccessEvent> {
  const eventId = o.eventId ?? EVENT_SIGNAL;
  const consumer = o.consumer ?? "c1";
  const n = o.n ?? 2;
  const basis = o.capability ? await establishPcCapability(s, n) : null;
  const event = pcAccessEvent(
    eventId,
    PC,
    o.capability
      ? { representation: { capability_id: CAP_METALWORKING }, ...o.over }
      : { ...o.over },
  );
  await must(s.access.establishBoundedSharedAccess({ ...accessPublication(n + 1), event }));
  if (o.boundaryAt === undefined) {
    await registerPacketConsumer(s, consumer, event, basis, n + 2);
  } else {
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(n + 2),
        object: packetConsumerObject(consumer, event, basis, {
          next_boundary: {
            boundary_id: packetConsumerBoundaryId(consumer),
            at: at(o.boundaryAt),
          },
        }),
      }),
    );
  }
  if (o.tx !== "none") {
    await must(
      s.coordinator.advance(
        packetAdvanceRequest(o.tx ?? "tx-1", consumer, { continues: o.continues ?? null }),
      ),
    );
  }
  return event;
}

/** A Named-Actor recipient's event: never the PC's, whatever its packet looks like. */
export const namedActorEvent = (eventId: string): AccessEvent => accessEvent(eventId, ACTOR_SMITH);
