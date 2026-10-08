// The one allowlisted host operation, exercised over a recording view (no campaign): which authority it uses, which reads it
// can reach, and that a host request or a fabricated context can never widen either. Register lineage: IA-18 / IA-19 / IA-20
// (partial); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import * as protocol from "@immortalis/protocol";
import {
  bindTrustedEventSignalContext,
  readCurrentEventSignalPresentation,
} from "@immortalis/protocol";
import type { OwnerFact } from "@immortalis/contracts";
import type { ProjectionStateView } from "@immortalis/engine";
import { PROTOCOL_REFUSAL, READ_REQUEST } from "../support/protocol.ts";

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

describe("the protocol package exposes exactly the event-addressed read and the causal delivery", () => {
  it("has the two trusted-side binders and the two operations, and nothing else", () => {
    expect(Object.keys(protocol).sort()).toEqual([
      "bindTrustedCausalEventSignalContext",
      "bindTrustedEventSignalContext",
      "deliverCausalEventSignalPresentation",
      "readCurrentEventSignalPresentation",
    ]);
    expect(readCurrentEventSignalPresentation.length).toBe(2);
  });

  it("the context is an opaque, frozen handle that reveals nothing about the campaign or recipient", () => {
    const { view } = recordingView();
    const ctx = bindTrustedEventSignalContext({ view, recipient_id: "pc-secret-1" });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(JSON.stringify(ctx)).toBe("{}");
    expect(String(Object.getOwnPropertySymbols(ctx).length)).toBe("0");
    expect(JSON.stringify(ctx)).not.toContain("pc-secret-1");
  });
});

describe("a request the host cannot lawfully make reaches no state", () => {
  const bad: unknown[] = [
    undefined,
    null,
    "event-signal-1",
    42,
    [],
    {},
    { event_id: "e1" },
    READ_REQUEST("e1", { campaign_id: "other" }),
    READ_REQUEST("e1", { recipient_id: "someone-else" }),
    READ_REQUEST("e1", { role: "role.archivist" }),
    READ_REQUEST("e1", { permission: "permission.canon.write" }),
    READ_REQUEST("e1", { viewpoint: { role: "role.gm", entity_id: "x" } }),
    READ_REQUEST("e1", { source_key: "epistemic/provenance" }),
    READ_REQUEST("e1", { path: "/etc/passwd" }),
    JSON.parse(
      '{"operation":"read_current_event_signal_presentation","event_id":"e1","__proto__":{"a":1}}',
    ),
    READ_REQUEST("../../spec/f027/runtime-contract.md"),
    READ_REQUEST("-"),
    { operation: "getFact", event_id: "e1" },
    { operation: "listFacts" },
    { operation: "committedGroup", event_id: "e1" },
    { operation: "read_current_event_signal_presentation", event_id: { toString: () => "e1" } },
  ];

  it("is refused with the one opaque refusal and performs no read at all", () => {
    for (const request of bad) {
      const { view, reads } = recordingView();
      const ctx = bindTrustedEventSignalContext({ view, recipient_id: "pc-1" });
      expect(JSON.stringify(readCurrentEventSignalPresentation(ctx, request))).toBe(
        PROTOCOL_REFUSAL,
      );
      expect(reads, JSON.stringify(request)).toEqual([]);
    }
  });

  it("a throwing or hostile request object is refused, never propagated", () => {
    const { view } = recordingView();
    const ctx = bindTrustedEventSignalContext({ view, recipient_id: "pc-1" });
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
    expect(JSON.stringify(readCurrentEventSignalPresentation(ctx, hostile))).toBe(PROTOCOL_REFUSAL);
  });
});

describe("a context the trusted service did not establish is not a context", () => {
  it("fabricated, parsed, copied or absent contexts are refused and read nothing", () => {
    const { view, reads } = recordingView();
    const real = bindTrustedEventSignalContext({ view, recipient_id: "pc-1" });
    const forged: unknown[] = [
      undefined,
      null,
      {},
      { view, recipient_id: "pc-1" },
      { campaign_id: "c1", recipient_id: "pc-1" },
      JSON.parse(JSON.stringify(real)),
      Object.freeze({}),
      { ...real },
      "context",
      7,
    ];
    for (const ctx of forged)
      expect(
        JSON.stringify(
          readCurrentEventSignalPresentation(
            ctx as ReturnType<typeof bindTrustedEventSignalContext>,
            READ_REQUEST("e1"),
          ),
        ),
      ).toBe(PROTOCOL_REFUSAL);
    expect(reads).toEqual([]);
  });

  it("a lawful request through a bound context reads only by identity through the projection's own view, using the context's recipient", () => {
    const { view, reads } = recordingView();
    const ctx = bindTrustedEventSignalContext({ view, recipient_id: "pc-1" });
    expect(JSON.stringify(readCurrentEventSignalPresentation(ctx, READ_REQUEST("e1")))).toBe(
      PROTOCOL_REFUSAL,
    );
    expect(reads.length).toBe(8); // IM-13's fixed eight identity reads, nothing more
    expect(reads.some((r) => r.includes("pc-1"))).toBe(true);
    // the same request through a differently bound context addresses that context's own recipient
    const other = recordingView();
    const ctx2 = bindTrustedEventSignalContext({ view: other.view, recipient_id: "pc-2" });
    readCurrentEventSignalPresentation(ctx2, READ_REQUEST("e1"));
    expect(other.reads.some((r) => r.includes("pc-2"))).toBe(true);
    expect(other.reads.some((r) => r.includes("pc-1"))).toBe(false);
  });

  it("a view that throws degrades to the same refusal", () => {
    const ctx = bindTrustedEventSignalContext({
      view: {
        getFact: () => {
          throw new Error("db password leaked");
        },
        committedGroup: () => {
          throw new Error("db password leaked");
        },
      },
      recipient_id: "pc-1",
    });
    expect(JSON.stringify(readCurrentEventSignalPresentation(ctx, READ_REQUEST("e1")))).toBe(
      PROTOCOL_REFUSAL,
    );
  });
});
