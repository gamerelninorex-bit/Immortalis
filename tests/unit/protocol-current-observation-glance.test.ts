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

  it("a read over a view with no committed canon makes the one fixed shape of reads and refuses", () => {
    const { view, keys, groups } = recordingView();
    const ctx = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-1" });
    expect(JSON.stringify(readCurrentObservationGlance(ctx, GLANCE_REQUEST()))).toBe(
      PROTOCOL_REFUSAL,
    );
    // the gateway's own nine identity reads (the sixth premise slot included: a sentinel for an observation that cites no source) and one
    // group read, then IM-13's fixed seven and one
    expect(keys).toHaveLength(9 + 7);
    expect(groups).toHaveLength(1 + 1);
    expect(keys[0]).toBe(TEMPORAL_STATE_KEY);
  });

  it("an invalid request takes the same path as a valid one: the fixed shape, never a different one", () => {
    const valid = recordingView();
    readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view: valid.view, recipient_id: "pc-1" }),
      GLANCE_REQUEST(),
    );
    for (const bad of [undefined, {}, GLANCE_REQUEST({ event_id: "x" }), "x"]) {
      const { view, keys, groups } = recordingView();
      const ctx = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-1" });
      expect(JSON.stringify(readCurrentObservationGlance(ctx, bad))).toBe(PROTOCOL_REFUSAL);
      expect(keys).toEqual(valid.keys);
      expect(groups).toEqual(valid.groups);
    }
  });

  it("a throwing view degrades every step and still takes the whole shape; nothing throws", () => {
    const attempts: string[] = [];
    const view: ProjectionStateView = {
      getFact: (k) => {
        attempts.push(k);
        throw new Error("view failure");
      },
      committedGroup: (id) => {
        attempts.push(id);
        throw new Error("view failure");
      },
    };
    const ctx = bindTrustedCurrentPlayerContext({ view, recipient_id: "pc-1" });
    expect(JSON.stringify(readCurrentObservationGlance(ctx, GLANCE_REQUEST()))).toBe(
      PROTOCOL_REFUSAL,
    );
    expect(attempts).toHaveLength(9 + 1 + 7 + 1);
  });

  it("a forged context has no view: nothing is read and it is refused", () => {
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
