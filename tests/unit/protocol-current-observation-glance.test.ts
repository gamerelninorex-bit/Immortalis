// Unit evidence for the Current Observation Glance read: the strict one-field request contract, the opaque trusted handle and the fixed,
// identity-only read shape, over synthetic views (no campaign). The read over a real observation is in tests/integration/.
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE,
  ReadCurrentObservationGlanceRequestSchema,
  TEMPORAL_STATE_KEY,
} from "@immortalis/contracts";
import type { ProjectionStateView } from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";

const recordingView = () => {
  const keys: string[] = [];
  const groups: string[] = [];
  const view: ProjectionStateView = {
    getFact: (k) => (keys.push(k), undefined),
    committedGroup: (id) => (groups.push(id), null),
  };
  return { view, keys, groups };
};

describe("the request contract is strict and has exactly one field", () => {
  it("accepts only the operation name", () => {
    expect(PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE).toBe("read_current_observation_glance");
    expect(ReadCurrentObservationGlanceRequestSchema.safeParse(GLANCE_REQUEST()).success).toBe(
      true,
    );
    for (const bad of [
      undefined,
      null,
      [],
      "read_current_observation_glance",
      {},
      GLANCE_REQUEST({ event_id: "obs-x" }),
      GLANCE_REQUEST({ at: 1 }),
      { operation: "deliver_causal_event_signal_presentation" },
    ])
      expect(ReadCurrentObservationGlanceRequestSchema.safeParse(bad).success).toBe(false);
    expect(Object.keys(ReadCurrentObservationGlanceRequestSchema.shape)).toEqual(["operation"]);
  });
});

describe("the trusted handle is opaque and the read is identity-only", () => {
  it("the handle is frozen and reveals nothing; two binds are two distinct handles", () => {
    const { view } = recordingView();
    const a = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-secret-1" });
    const b = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-secret-1" });
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.keys(a)).toEqual([]);
    expect(JSON.stringify(a)).toBe("{}");
    expect(JSON.stringify(a)).not.toContain("pc-secret-1");
  });

  it("a read over a view with no committed canon reads only the Temporal state, by identity, and refuses", () => {
    const { view, keys, groups } = recordingView();
    const ctx = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-1" });
    expect(JSON.stringify(readCurrentObservationGlance(ctx, GLANCE_REQUEST()))).toBe(
      PROTOCOL_REFUSAL,
    );
    expect(keys).toEqual([TEMPORAL_STATE_KEY]);
    expect(groups).toEqual([]);
  });

  it("an invalid request reads nothing at all", () => {
    const { view, keys, groups } = recordingView();
    const ctx = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-1" });
    for (const bad of [undefined, {}, GLANCE_REQUEST({ event_id: "x" }), "x"])
      expect(JSON.stringify(readCurrentObservationGlance(ctx, bad))).toBe(PROTOCOL_REFUSAL);
    expect(keys).toEqual([]);
    expect(groups).toEqual([]);
  });

  it("a forged context reads nothing and is refused", () => {
    expect(
      JSON.stringify(
        readCurrentObservationGlance(
          {} as ReturnType<typeof bindTrustedCurrentPlayerContext>,
          GLANCE_REQUEST(),
        ),
      ),
    ).toBe(PROTOCOL_REFUSAL);
  });
});
