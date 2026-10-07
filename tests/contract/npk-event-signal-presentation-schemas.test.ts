// NPK Event-Signal Presentation contract (IM-14): strict, disposable, non-canonical. Every schema rejects an unmodelled
// field (IA-02), so no field exists in which sealed provenance, hidden state, cognition, memory, urgency, a time
// coordinate or authored prose could be carried. Register lineage: IA-17 (partial).
import { describe, expect, it } from "vitest";
import {
  EVENT_SIGNAL_ELEMENT_KINDS,
  EventSignalPresentationSchema,
  PRESENTATION_NPK_EVENT_SIGNAL,
} from "@immortalis/contracts";

const contact = { element: "CONTACT", channel: "SPEECH" };
const attribution = { element: "PRESENTED_ATTRIBUTION", text: "bearing the seal of the Warden" };
const referent = { element: "REFERENT", text: "the gate rota" };
const content = { element: "CONTENT", text: "the gate opens at first light" };
const valid = {
  presentation: "NPK_EVENT_SIGNAL",
  disposable: true,
  form: "EVENT_SIGNAL",
  viewpoint: { role: "role.player_character", entity_id: "pc-1" },
  elements: [contact, attribution, referent, content],
};
const ok = (v: unknown) => EventSignalPresentationSchema.safeParse(v).success;

describe("the Event-Signal Presentation is strict and carries only the rendered projection", () => {
  it("accepts the presentation with and without a Presented Source Attribution element", () => {
    expect(ok(valid)).toBe(true);
    expect(ok({ ...valid, elements: [contact, referent, content] })).toBe(true);
    expect(PRESENTATION_NPK_EVENT_SIGNAL).toBe("NPK_EVENT_SIGNAL");
    expect([...EVENT_SIGNAL_ELEMENT_KINDS]).toEqual([
      "CONTACT",
      "PRESENTED_ATTRIBUTION",
      "REFERENT",
      "CONTENT",
    ]);
  });

  it("is disposable by literal and is the one NPK form over the one projection form", () => {
    expect(ok({ ...valid, disposable: false })).toBe(false);
    const without: Record<string, unknown> = { ...valid };
    delete without.disposable;
    expect(ok(without)).toBe(false);
    expect(ok({ ...valid, presentation: "NPK_SCENE" })).toBe(false);
    for (const form of ["GLANCE", "FOCUS", "DEPTH", "SETUP", "OBSERVER", "BROADCAST", "REPORT"])
      expect(ok({ ...valid, form }), form).toBe(false);
  });

  it("names exactly the active role.player_character viewpoint", () => {
    expect(ok({ ...valid, viewpoint: { ...valid.viewpoint, role: "role.observer" } })).toBe(false);
    expect(ok({ ...valid, viewpoint: { role: "role.player_character" } })).toBe(false);
    expect(ok({ ...valid, viewpoint: { ...valid.viewpoint, entity_id: "-bad" } })).toBe(false);
  });

  it("fixes the presentation order: contact, attribution when presented, referent, content", () => {
    expect(ok({ ...valid, elements: [attribution, contact, referent, content] })).toBe(false);
    expect(ok({ ...valid, elements: [contact, referent, attribution, content] })).toBe(false);
    expect(ok({ ...valid, elements: [contact, attribution, content, referent] })).toBe(false);
    expect(ok({ ...valid, elements: [contact, content, referent] })).toBe(false);
    expect(ok({ ...valid, elements: [contact, referent, content, content] })).toBe(false);
    expect(ok({ ...valid, elements: [referent, content] })).toBe(false);
    expect(ok({ ...valid, elements: [contact, referent] })).toBe(false);
    expect(ok({ ...valid, elements: [] })).toBe(false);
  });

  it("announces no absence: a null attribution has no element and no placeholder text", () => {
    expect(
      ok({
        ...valid,
        elements: [contact, { element: "PRESENTED_ATTRIBUTION" }, referent, content],
      }),
    ).toBe(false);
    expect(
      ok({
        ...valid,
        elements: [contact, { element: "PRESENTED_ATTRIBUTION", text: null }, referent, content],
      }),
    ).toBe(false);
    expect(
      ok({
        ...valid,
        elements: [contact, { element: "PRESENTED_ATTRIBUTION", text: "" }, referent, content],
      }),
    ).toBe(false);
  });

  it("text is bounded prose exactly as received: non-empty and untrimmed text is refused, a direct channel only", () => {
    expect(ok({ ...valid, elements: [contact, { ...referent, text: " padded" }, content] })).toBe(
      false,
    );
    expect(ok({ ...valid, elements: [contact, referent, { ...content, text: "" }] })).toBe(false);
    expect(
      ok({ ...valid, elements: [{ element: "CONTACT", channel: "BROADCAST" }, referent, content] }),
    ).toBe(false);
    expect(ok({ ...valid, elements: [{ element: "CONTACT" }, referent, content] })).toBe(false);
  });

  const extras = [
    "source",
    "true_source",
    "event_id",
    "packet",
    "provenance",
    "capability",
    "marker",
    "diagnostic",
    "hidden",
    "urgency",
    "interpretation",
    "comprehension",
    "belief",
    "memory",
    "motive",
    "emotion",
    "time",
    "established_at",
    "prose",
    "narration",
    "label",
    "mode",
    "register",
  ];
  it.each(extras)("rejects an unmodelled %s field at every level", (field) => {
    const withExtra = (o: object) => ({ ...o, [field]: "x" });
    expect(ok(withExtra(valid))).toBe(false);
    expect(ok({ ...valid, viewpoint: withExtra(valid.viewpoint) })).toBe(false);
    expect(ok({ ...valid, elements: [withExtra(contact), attribution, referent, content] })).toBe(
      false,
    );
    expect(ok({ ...valid, elements: [contact, withExtra(attribution), referent, content] })).toBe(
      false,
    );
    expect(ok({ ...valid, elements: [contact, attribution, withExtra(referent), content] })).toBe(
      false,
    );
    expect(ok({ ...valid, elements: [contact, attribution, referent, withExtra(content)] })).toBe(
      false,
    );
  });

  it("requires every field and rejects non-objects", () => {
    for (const k of Object.keys(valid)) {
      const o: Record<string, unknown> = { ...valid };
      delete o[k];
      expect(ok(o), k).toBe(false);
    }
    for (const v of [null, undefined, 1, "x", [], { ok: true, value: valid }])
      expect(ok(v)).toBe(false);
  });
});
