// The causal delivery operation, exercised over a recording view (no campaign): the host names no event, the trusted context
// supplies the one identity and the recipient, and neither a host request nor a fabricated context can widen what is read.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-21 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedEventSignalContext,
  deliverCausalEventSignalPresentation,
  readCurrentEventSignalPresentation,
} from "@immortalis/protocol";
import {
  DeliverCausalEventSignalPresentationRequestSchema,
  type OwnerFact,
} from "@immortalis/contracts";
import type { ProjectionStateView } from "@immortalis/engine";
import { CAUSAL_REQUEST, PROTOCOL_REFUSAL, READ_REQUEST } from "../support/protocol.ts";

const recordingView = () => {
  const reads: string[] = [];
  const view: ProjectionStateView = {
    getFact: (key): OwnerFact | undefined => {
      reads.push(`fact:${key}`);
      return undefined;
    },
    committedGroup: (id) => {
      reads.push(`group:${id}`);
      return null;
    },
  };
  return { view, reads };
};
const bind = (view: ProjectionStateView, event_id = "event-causal-1", recipient_id = "pc-1") =>
  bindTrustedCausalEventSignalContext({ view, recipient_id, event_id });
const deliver = (ctx: unknown, request: unknown) =>
  JSON.stringify(
    deliverCausalEventSignalPresentation(
      ctx as ReturnType<typeof bindTrustedCausalEventSignalContext>,
      request,
    ),
  );

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const ok = DeliverCausalEventSignalPresentationRequestSchema.safeParse(CAUSAL_REQUEST());
    expect(ok.success).toBe(true);
    expect(Object.keys(ok.success ? ok.data : {})).toEqual(["operation"]);
  });

  const bad: unknown[] = [
    undefined,
    null,
    "deliver_causal_event_signal_presentation",
    42,
    [],
    {},
    CAUSAL_REQUEST({ event_id: "event-causal-1" }),
    CAUSAL_REQUEST({ event_id: "event-other" }),
    CAUSAL_REQUEST({ eventId: "event-other" }),
    CAUSAL_REQUEST({ recipient_id: "someone-else" }),
    CAUSAL_REQUEST({ campaign_id: "other" }),
    CAUSAL_REQUEST({ viewpoint: { role: "role.gm", entity_id: "x" } }),
    CAUSAL_REQUEST({ source: "epistemic/provenance", provenance: "sealed" }),
    CAUSAL_REQUEST({ role: "role.archivist", permission: "permission.canon.write" }),
    CAUSAL_REQUEST({ state: { anything: true } }),
    JSON.parse('{"operation":"deliver_causal_event_signal_presentation","__proto__":{"a":1}}'),
    READ_REQUEST("event-causal-1"),
    { operation: "getFact" },
    { operation: "listFacts" },
    { operation: "deliver_causal_event_signal_presentation ", event_id: "e1" },
  ];

  it("anything else — extra fields, an event id, other operation names — is refused with the one refusal and reads nothing", () => {
    for (const request of bad) {
      const { view, reads } = recordingView();
      expect(deliver(bind(view), request), JSON.stringify(request)).toBe(PROTOCOL_REFUSAL);
      expect(reads, JSON.stringify(request)).toEqual([]);
    }
  });

  it("a throwing or hostile request object is refused, never propagated", () => {
    const { view } = recordingView();
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("secret validator detail");
        },
        ownKeys() {
          throw new Error("secret validator detail");
        },
      },
    );
    expect(deliver(bind(view), hostile)).toBe(PROTOCOL_REFUSAL);
  });
});

describe("a context the trusted service did not establish is not a context", () => {
  it("the context is an opaque, frozen handle revealing neither event, recipient nor campaign", () => {
    const { view } = recordingView();
    const ctx = bind(view, "event-secret-9", "pc-secret-1");
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(Object.getOwnPropertySymbols(ctx)).toHaveLength(0);
    expect(JSON.stringify(ctx)).toBe("{}");
  });

  it("fabricated, parsed, copied, absent — and the other operation's context — are refused and read nothing", () => {
    const { view, reads } = recordingView();
    const real = bind(view);
    const eventAddressed = bindTrustedEventSignalContext({ view, recipient_id: "pc-1" });
    const forged: unknown[] = [
      undefined,
      null,
      {},
      { view, recipient_id: "pc-1", event_id: "event-causal-1" },
      JSON.parse(JSON.stringify(real)),
      Object.freeze({}),
      { ...real },
      Object.create(real) as object,
      "context",
      7,
      eventAddressed,
    ];
    for (const ctx of forged) expect(deliver(ctx, CAUSAL_REQUEST())).toBe(PROTOCOL_REFUSAL);
    expect(reads).toEqual([]);
    // and a causal context is no authority for the event-addressed operation
    expect(
      JSON.stringify(readCurrentEventSignalPresentation(real as never, READ_REQUEST("e1"))),
    ).toBe(PROTOCOL_REFUSAL);
    expect(reads).toEqual([]);
  });
});

describe("the bound identity — never the host — is what is read", () => {
  it("reads by identity through the projection's own view using the context's event and recipient only", () => {
    const { view, reads } = recordingView();
    expect(deliver(bind(view, "event-causal-1", "pc-1"), CAUSAL_REQUEST())).toBe(PROTOCOL_REFUSAL);
    expect(reads.length).toBe(8); // IM-13's fixed eight identity reads, nothing more
    expect(reads.some((r) => r.includes("pc-1"))).toBe(true);
    const other = recordingView();
    deliver(bind(other.view, "event-causal-2", "pc-2"), CAUSAL_REQUEST());
    expect(other.reads.some((r) => r.includes("event-causal-2"))).toBe(true);
    expect(other.reads.some((r) => r.includes("pc-2"))).toBe(true);
    expect(other.reads.some((r) => r.includes("event-causal-1") || r.includes("pc-1"))).toBe(false);
  });

  it("a view that throws, and a malformed trusted event identity, degrade to the same refusal", () => {
    const throwing = bindTrustedCausalEventSignalContext({
      view: {
        getFact: () => {
          throw new Error("db password leaked");
        },
        committedGroup: () => {
          throw new Error("db password leaked");
        },
      },
      recipient_id: "pc-1",
      event_id: "event-causal-1",
    });
    expect(deliver(throwing, CAUSAL_REQUEST())).toBe(PROTOCOL_REFUSAL);
    const { view } = recordingView();
    expect(deliver(bind(view, "../../etc/passwd"), CAUSAL_REQUEST())).toBe(PROTOCOL_REFUSAL);
  });
});
