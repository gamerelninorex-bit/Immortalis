// Conformance evidence for the F-014D BROADCAST_EXPOSURE Access / Dissemination Event event-only foundation. Governing
// lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. The rows stay NOT_IMPLEMENTED/BLOCKED: this slice is a
// MECHANISM-ONLY precursor (no live dissemination producer, no individual lowering) and promotes no gate.
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_FACT_KINDS,
  EPISTEMIC_ACCESS_RULE,
  F014D_SOURCE,
} from "@immortalis/engine";
import { code, gates, lock, register } from "../support/f027.ts";

const EPISTEMIC_DIR = "packages/engine/src/epistemic";
const MODULES = readdirSync(EPISTEMIC_DIR).map((f) => `${EPISTEMIC_DIR}/${f}`);

describe("IA-01 source/version fidelity (BROADCAST_EXPOSURE registration aspect)", () => {
  it("the broadcast citation names F-014D at its exact spec-locked pin, with the same authority lineage and no supersession", () => {
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    expect(f014d.native_pin).toBe("2026-09-24T16:25:17.059Z");
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.artifact).toBe(f014d.url);
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.native_pin).toBe(f014d.native_pin);
    expect({ artifact: F014D_SOURCE.artifact, native_pin: F014D_SOURCE.native_pin }).toEqual({
      artifact: f014d.url,
      native_pin: f014d.native_pin,
    });
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.effective_basis).toBe("pinned-by-spec-lock");
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.supersedes).toBeNull();
    // the spec-lock basis and ratification lead the lineage of every Epistemic citation, and F-014D's own lineage follows
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.authority_lineage.slice(0, 2)).toEqual(
      EPISTEMIC_ACCESS_RULE.authority_lineage.slice(0, 2),
    );
    expect(EPISTEMIC_ACCESS_BROADCAST_RULE.authority_lineage.join("\n")).toContain(f014d.url);
  });

  it("no pin, lock, snapshot hash, open gate or register status is touched by this slice", () => {
    expect(lock.frozen_sources.find((s) => s.id === "F-014D")!.primary_im).toBe("IM-10");
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(gates.some((g: { id?: string }) => g.id === "PF-6/F-028")).toBe(true);
  });
});

describe("IA-03 owner exclusivity: the new mode adds no owner, facet, kind or key space", () => {
  it("the Epistemic owner still holds exactly its three kinds; the broadcast event shares the one event key space", () => {
    expect(EPISTEMIC_ACCESS_FACT_KINDS.map((k) => k.id)).toEqual([
      "epistemic_access_event",
      "epistemic_accessible_packet",
      "epistemic_sealed_provenance",
    ]);
    expect(new Set(EPISTEMIC_ACCESS_FACT_KINDS.map((k) => `${k.owner}/${k.facet}`))).toEqual(
      new Set(["epistemic_access/epistemic_access"]),
    );
    expect(ALL_FACT_KINDS.filter((k) => /broadcast|audience/i.test(k.id))).toEqual([]);
    for (const kind of EPISTEMIC_ACCESS_FACT_KINDS) expect(kind.lifecycle).toBe("SEALED");
  });
});

describe("IA-04 turnless: the new mode adds no tick, timer, scheduler, sweep, RNG or scan", () => {
  it("the broadcast path has no clock, timer, randomness, polling, roster expansion or world scan", () => {
    for (const f of MODULES)
      expect(code(f), f).not.toMatch(
        /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|Math\.random|randomUUID|sweep|periodic|cadence|poll\w*)\b/,
      );
    for (const f of MODULES.filter((f) => !/integrity\.ts$/.test(f)))
      expect(code(f), f).not.toMatch(/listFacts\(|\.facts\.values\(\)|for \(const \w+ of .*facts/);
  });
});

describe("downstream non-claims: the event is not receipt, learning or adoption", () => {
  it("no Epistemic module names a Population, Culture, KTI, Temporal-knowledge or actor-inference writer", () => {
    for (const f of MODULES)
      expect(code(f), f).not.toMatch(
        /PopulationAdapter|CultureAdapter|KtiAdapter|NamedActorAdapter|knowledge_time|KnowledgeTime|ActionableKnowledge/,
      );
  });

  it("the broadcast publication writes exactly one key and is the only place that builds one", () => {
    const adapter = code(`${EPISTEMIC_DIR}/adapter.ts`);
    const from = adapter.indexOf("async establishBroadcastExposure");
    const publish = adapter.slice(from, adapter.indexOf("event(eventId: string)", from));
    expect(publish).toMatch(/BroadcastExposureEventSchema/);
    expect(publish).not.toMatch(/accessPacketKey|accessProvenanceKey/);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
  });
});
