// NPK Event-Signal Presentation (IM-14): a pure, deterministic rendering of exactly one lawful Event-Signal Projection. The
// received contact, presented attribution, referent and content are carried exactly; nothing is added; anything that is not
// exactly a projection is refused with the one opaque refusal. Register lineage: IA-17 (partial).
import { describe, expect, it } from "vitest";
import {
  EventSignalPresentationSchema,
  EventSignalProjectionSchema,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
} from "@immortalis/contracts";
import { presentEventSignal } from "@immortalis/engine";
import { projectionValue } from "../support/presentation.ts";

const REFUSAL = {
  ok: false,
  error: { code: PROJECTION_UNAVAILABLE, message: PROJECTION_UNAVAILABLE_MESSAGE },
};

describe("a lawful projection is rendered exactly, in one fixed presentation order", () => {
  it("renders contact, the presented attribution, referent and content, byte for byte", () => {
    const p = projectionValue();
    const r = presentEventSignal(p);
    expect(r).toEqual({
      ok: true,
      value: {
        presentation: "NPK_EVENT_SIGNAL",
        disposable: true,
        form: "EVENT_SIGNAL",
        viewpoint: { role: "role.player_character", entity_id: "pc-1" },
        elements: [
          { element: "CONTACT", channel: "SPEECH" },
          { element: "PRESENTED_ATTRIBUTION", text: "bearing the seal of the Warden" },
          { element: "REFERENT", text: "the gate rota" },
          { element: "CONTENT", text: "the gate opens at first light" },
        ],
      },
    });
    expect(EventSignalPresentationSchema.safeParse(r.ok && r.value).success).toBe(true);
  });

  it("a projection with no presented attribution has no attribution element and announces no absence", () => {
    const r = presentEventSignal(projectionValue({ presented_attribution: null }));
    expect(r.ok && r.value.elements.map((e) => e.element)).toEqual([
      "CONTACT",
      "REFERENT",
      "CONTENT",
    ]);
    const json = JSON.stringify(r).toLowerCase();
    for (const word of ["unknown", "locked", "unattributed", "anonymous", "null", "none"])
      expect(json, word).not.toContain(word);
  });

  it.each(["PERCEPTION", "SPEECH"])("carries the %s contact exactly", (channel) => {
    const r = presentEventSignal(projectionValue({ contact: { channel } }));
    expect(r.ok && r.value.elements[0]).toEqual({ element: "CONTACT", channel });
  });

  it("adds no text of its own: every text value is a received value, and the received values are exhaustive", () => {
    const p = projectionValue();
    const r = presentEventSignal(p);
    if (!r.ok) throw new Error("expected a presentation");
    const texts = r.value.elements.flatMap((e) => ("text" in e ? [e.text] : []));
    expect(texts.sort()).toEqual(
      [p.presented_attribution, p.payload.referent, p.payload.content].sort(),
    );
    const strings: string[] = [];
    JSON.stringify(r.value, (_k, v) => (typeof v === "string" ? strings.push(v) : v));
    const received = new Set<string>([
      ...texts,
      "SPEECH",
      "role.player_character",
      "pc-1",
      "NPK_EVENT_SIGNAL",
      "EVENT_SIGNAL",
      "CONTACT",
      "PRESENTED_ATTRIBUTION",
      "REFERENT",
      "CONTENT",
      "disposable",
    ]);
    for (const s of strings) expect(received.has(s), s).toBe(true);
  });

  it("preserves the received text verbatim: a false or stale attribution is never corrected, and hidden-looking words are not interpreted", () => {
    const attribution =
      "sent by the Unknown Locked Archivist (seal: 'forged') — ✓ 日本語 \n second line";
    const content = "Unknown — Locked; the true source is somebody else: key=access/e1/event";
    const r = presentEventSignal(
      projectionValue({
        presented_attribution: attribution,
        payload: { referent: "Locked", content },
      }),
    );
    expect(r.ok && r.value.elements).toEqual([
      { element: "CONTACT", channel: "SPEECH" },
      { element: "PRESENTED_ATTRIBUTION", text: attribution },
      { element: "REFERENT", text: "Locked" },
      { element: "CONTENT", text: content },
    ]);
  });

  it("invents no urgency, interpretation, cognition, memory, emotion, time or prose field", () => {
    const r = presentEventSignal(projectionValue());
    if (!r.ok) throw new Error("expected a presentation");
    const keys = new Set<string>();
    JSON.stringify(r.value, (k, v) => (keys.add(k), v));
    expect([...keys].filter((k) => k !== "" && !/^\d+$/.test(k)).sort()).toEqual(
      [
        "channel",
        "disposable",
        "element",
        "elements",
        "entity_id",
        "form",
        "presentation",
        "role",
        "text",
        "viewpoint",
      ].sort(),
    );
  });
});

describe("it is a pure, deterministic function of the projection alone", () => {
  it("presenting the same projection again yields an equal, byte-identical, independent value", () => {
    const p = projectionValue();
    const a = presentEventSignal(p);
    const b = presentEventSignal(structuredClone(p));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (!a.ok || !b.ok) throw new Error("expected presentations");
    expect(a.value).not.toBe(b.value);
    expect(a.value.elements).not.toBe(b.value.elements);
    (a.value.elements[2] as { text: string }).text = "tampered";
    expect(presentEventSignal(p)).toEqual(b);
  });

  it("does not mutate its input and accepts a frozen one", () => {
    const p = projectionValue();
    const before = JSON.stringify(p);
    presentEventSignal(p);
    expect(JSON.stringify(p)).toBe(before);
    const frozen = Object.freeze({
      ...p,
      viewpoint: Object.freeze({ ...p.viewpoint }),
      contact: Object.freeze({ ...p.contact }),
      payload: Object.freeze({ ...p.payload }),
    });
    expect(presentEventSignal(frozen).ok).toBe(true);
  });

  it("presents only what the projection says: two projections differing in one field differ in exactly that element", () => {
    const base = presentEventSignal(projectionValue());
    const other = presentEventSignal(
      projectionValue({ payload: { referent: "the gate rota", content: "a different line" } }),
    );
    if (!base.ok || !other.ok) throw new Error("expected presentations");
    expect(
      base.value.elements.filter(
        (e, i) => JSON.stringify(e) !== JSON.stringify(other.value.elements[i]),
      ),
    ).toEqual([{ element: "CONTENT", text: "the gate opens at first light" }]);
  });
});

describe("only a lawful projection is rendered; everything else is the one opaque refusal", () => {
  const sealed = {
    source: { owner: "o", fact_key: "k", version: 1 },
    event_id: "event-1",
    packet: { recipient: "pc-1" },
    provenance: { group_id: "g" },
    capability: "cap",
    established_at: { unit: "u", value: 1 },
    urgency: "high",
    interpretation: "a threat",
  };
  const causes: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "EVENT_SIGNAL"],
    ["an array", [projectionValue()]],
    ["an IM-13 refusal result", REFUSAL],
    ["a success wrapper", { ok: true, value: projectionValue() }],
    ["a presentation", presentEventSignal(projectionValue())],
    ["a non-disposable projection", projectionValue({ disposable: false })],
    ["another projection form", projectionValue({ projection: "GLANCE" })],
    [
      "a non-PC viewpoint",
      projectionValue({ viewpoint: { role: "role.observer", entity_id: "x" } }),
    ],
    [
      "a missing attribution field",
      Object.fromEntries(
        Object.entries(projectionValue()).filter(([k]) => k !== "presented_attribution"),
      ),
    ],
    ["an unknown channel", projectionValue({ contact: { channel: "BROADCAST" } })],
    ["empty content", projectionValue({ payload: { referent: "r", content: "" } })],
    ...Object.entries(sealed).map(
      ([k, v]) => [`a projection smuggling ${k}`, projectionValue({ [k]: v })] as [string, unknown],
    ),
    [
      "a projection smuggling a nested hidden field",
      projectionValue({ payload: { referent: "r", content: "c", source: sealed.source } }),
    ],
    [
      "a throwing accessor",
      {
        get projection(): never {
          throw new Error("internal detail: access/e1");
        },
      },
    ],
    [
      "a hostile proxy",
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("internal detail: access/e1");
          },
          ownKeys: () => {
            throw new Error("x");
          },
        },
      ),
    ],
  ];

  it.each(causes)("%s is refused with the one opaque refusal and renders nothing", (_n, input) => {
    const r = presentEventSignal(input);
    expect(r).toEqual(REFUSAL);
    expect(JSON.stringify(r)).toBe(JSON.stringify(REFUSAL));
  });

  it("the refusal is exactly the IM-13 refusal vocabulary: one code, one message, no details", () => {
    const r = presentEventSignal(undefined);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PROJECTION_UNAVAILABLE");
    expect(r.error.message).toBe("no projection is available");
    expect(Object.keys(r.error).sort()).toEqual(["code", "message"]);
  });

  it("a rendered projection is itself a lawful projection: the presenter accepts exactly what IM-13 can produce", () => {
    const p = projectionValue();
    expect(EventSignalProjectionSchema.safeParse(p).success).toBe(true);
    expect(presentEventSignal(p).ok).toBe(true);
  });
});
