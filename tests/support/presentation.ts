import type { EventSignalPresentation, Result } from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  presentEventSignal,
  type ProjectionStateView,
} from "@immortalis/engine";
import { EVENT_SIGNAL, PC } from "./projection.ts";

/**
 * The one lawful path under test: the existing IM-13 projection, then the IM-14 presentation of exactly that projection. A
 * refusal from IM-13 is returned as it is — the presenter is never handed anything but a lawful projection value, so an
 * unavailable projection is never a presentation opportunity.
 */
export const presentPath = (
  view: ProjectionStateView,
  eventId = EVENT_SIGNAL,
  recipient = PC,
): Result<EventSignalPresentation, "PROJECTION_UNAVAILABLE"> => {
  const projection = deriveEventSignalProjection(view, {
    event_id: eventId,
    recipient_id: recipient,
  });
  return projection.ok ? presentEventSignal(projection.value) : projection;
};

/** A well-formed projection value, as IM-13 produces one. */
export const projectionValue = (over: Record<string, unknown> = {}) => ({
  projection: "EVENT_SIGNAL",
  disposable: true,
  viewpoint: { role: "role.player_character", entity_id: "pc-1" },
  contact: { channel: "SPEECH" },
  payload: { referent: "the gate rota", content: "the gate opens at first light" },
  presented_attribution: "bearing the seal of the Warden" as string | null,
  ...over,
});
