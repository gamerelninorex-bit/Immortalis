// IM-02 transient stage graph (F-017 §3-§4, F-014B §7/§15). Pure: no campaign, no persistence.
// Brief §5.3: CLOSE remains a dependency but cuts the instantaneous NOW graph; a NOW edge to a later
// stage/result stays in it; identity is (process, operation, result), never version/retry/horizon/slice;
// nothing escapes an instantaneous cycle; independent work stays independent.
import { describe, expect, it } from "vitest";
import type { StageKey } from "@immortalis/contracts";
import {
  analyzeStageGraph,
  exactElapsed,
  stageGroupId,
  stageId,
  stageIntentId,
  type GraphEdge,
  type GraphNode,
} from "@immortalis/engine";
import { at } from "@immortalis/testkit";

const stage = (process: string, operation: string, result = `${operation}-result`): StageKey => ({
  causal_process_id: process,
  owner_operation: { owner: "o", operation },
  prospective_result_id: result,
});
const node = (s: StageKey): GraphNode => ({ id: stageId(s), stage: s });
const edge = (from: StageKey, to: StageKey, mode: GraphEdge["mode"]): GraphEdge => ({
  from: stageId(from),
  to: stageId(to),
  mode,
});
const P = stage("p1", "produce");
const C = stage("p1", "consume");
const D = stage("p2", "independent");

describe("dependency order", () => {
  it("resolves a producer before its consumer, over a CLOSE edge", () => {
    const a = analyzeStageGraph([node(C), node(P)], [edge(P, C, "CLOSE")]);
    expect(a.blocked.size).toBe(0);
    expect(a.order).toEqual([stageId(P), stageId(C)]);
  });
  it("resolves a producer before its consumer, over a NOW edge", () => {
    const a = analyzeStageGraph([node(C), node(P)], [edge(P, C, "NOW")]);
    expect(a.order).toEqual([stageId(P), stageId(C)]);
  });
  it("lets independent nodes stay independent: every node is resolvable and none waits on another", () => {
    const a = analyzeStageGraph([node(P), node(C), node(D)], [edge(P, C, "CLOSE")]);
    expect(a.blocked.size).toBe(0);
    expect(new Set(a.order)).toEqual(new Set([stageId(P), stageId(C), stageId(D)]));
    expect(a.order.indexOf(stageId(P))).toBeLessThan(a.order.indexOf(stageId(C)));
  });
  it("is deterministic: the same graph in any input order yields the same order", () => {
    const nodes = [node(P), node(C), node(D)];
    const edges = [edge(P, C, "CLOSE")];
    const a = analyzeStageGraph(nodes, edges);
    const b = analyzeStageGraph([...nodes].reverse(), [...edges].reverse());
    expect(b.order).toEqual(a.order);
  });
});

describe("CLOSE cuts the instantaneous NOW graph but remains a dependency (F-017 §3, §4.3)", () => {
  it("a NOW cycle is unlawful and stops exactly its component", () => {
    const a = analyzeStageGraph(
      [node(P), node(C), node(D)],
      [edge(P, C, "NOW"), edge(C, P, "NOW")],
    );
    expect(a.blocked.get(stageId(P))).toBe("INSTANTANEOUS_CYCLE");
    expect(a.blocked.get(stageId(C))).toBe("INSTANTANEOUS_CYCLE");
    expect(a.blocked.has(stageId(D))).toBe(false); // independent work remains eligible
    expect(a.order).toEqual([stageId(D)]);
  });
  it("a cycle whose return edge is CLOSE is not a NOW cycle — but the CLOSE dependency still cannot be ordered", () => {
    const a = analyzeStageGraph([node(P), node(C)], [edge(P, C, "NOW"), edge(C, P, "CLOSE")]);
    // the lag cut keeps it out of the instantaneous graph...
    expect([...a.blocked.values()]).not.toContain("INSTANTANEOUS_CYCLE");
    // ...yet CLOSE is still a dependency edge, so the order is unsatisfiable, not invented away
    expect(a.blocked.get(stageId(P))).toBe("UNSATISFIABLE_ORDER");
    expect(a.blocked.get(stageId(C))).toBe("UNSATISFIABLE_ORDER");
    expect(a.order).toEqual([]);
  });
  it("NOW-after-close is still NOW: a producer that closes does not turn its NOW reads into lag", () => {
    // P is a close-producing stage (committed node); C reads its result NOW, and P reads C NOW.
    const a = analyzeStageGraph([node(P), node(C)], [edge(P, C, "NOW"), edge(C, P, "NOW")]);
    expect(a.blocked.get(stageId(P))).toBe("INSTANTANEOUS_CYCLE");
  });
});

describe("identity is (process, operation, result) — nothing escapes a cycle (F-017 §3, §4.6)", () => {
  it("a NOW edge returning to the same (process, operation) as an ancestor closes the cycle even with a different prospective result", () => {
    const r1 = stage("p1", "op", "result-1");
    const r2 = stage("p1", "op", "result-2");
    const x = stage("p9", "other");
    // r1 -> x -> r2 : x reads r1 NOW; r2 reads x NOW. Distinct prospective results, same (process, op).
    const a = analyzeStageGraph(
      [node(r1), node(x), node(r2)],
      [edge(r1, x, "NOW"), edge(x, r2, "NOW")],
    );
    expect(a.blocked.get(stageId(r1))).toBe("INSTANTANEOUS_CYCLE");
    expect(a.blocked.get(stageId(r2))).toBe("INSTANTANEOUS_CYCLE");
    expect(a.blocked.get(stageId(x))).toBe("INSTANTANEOUS_CYCLE");
  });
  it("a NOW edge between stages of one (process, operation) is a self-cycle whatever its result identity", () => {
    const r1 = stage("p1", "op", "result-1");
    const r2 = stage("p1", "op", "result-2");
    const a = analyzeStageGraph([node(r1), node(r2)], [edge(r1, r2, "NOW")]);
    expect(a.blocked.get(stageId(r2))).toBe("INSTANTANEOUS_CYCLE");
  });
  it("a NOW edge to a later stage at the same timestamp stays in the instantaneous graph", () => {
    // there is no timestamp input at all: a NOW edge is in the graph wherever its target sits
    const later = stage("p1", "consume", "later-result");
    const a = analyzeStageGraph(
      [node(P), node(later)],
      [edge(P, later, "NOW"), edge(later, P, "NOW")],
    );
    expect(a.blocked.get(stageId(P))).toBe("INSTANTANEOUS_CYCLE");
  });
  it("the analysis takes no horizon, version, retry or slice input, so none can change the outcome", () => {
    expect(analyzeStageGraph.length).toBeLessThanOrEqual(3);
    const args = [
      [node(P), node(C)],
      [edge(P, C, "NOW"), edge(C, P, "NOW")],
    ] as const;
    const first = analyzeStageGraph(...args);
    for (let i = 0; i < 5; i++) {
      const again = analyzeStageGraph(...args);
      expect([...again.blocked]).toEqual([...first.blocked]);
      expect(again.order).toEqual(first.order);
    }
  });
  it("stage group/intent identity is derived from the StageKey alone", () => {
    expect(stageGroupId(P)).toBe(stageGroupId({ ...P }));
    expect(stageIntentId(P)).toBe(stageIntentId({ ...P }));
    expect(stageGroupId(P)).not.toBe(stageGroupId(C));
    expect(stageGroupId(P)).not.toBe(stageIntentId(P));
  });
});

describe("blocked components propagate only downstream", () => {
  it("dependents of an unresolved node wait; its predecessors and unrelated nodes do not", () => {
    const pre = stage("p0", "pre");
    const a = analyzeStageGraph(
      [node(pre), node(P), node(C), node(D)],
      [edge(pre, P, "NOW"), edge(P, C, "CLOSE")],
      new Map([[stageId(P), "PREDECESSOR_ABSENT"]]),
    );
    expect(a.blocked.get(stageId(P))).toBe("PREDECESSOR_ABSENT");
    expect(a.blocked.get(stageId(C))).toBe("PREDECESSOR_BLOCKED");
    expect(a.blocked.has(stageId(pre))).toBe(false);
    expect(a.blocked.has(stageId(D))).toBe(false);
    expect(new Set(a.order)).toEqual(new Set([stageId(pre), stageId(D)]));
  });
});

describe("EXACT-PARTITION integration (F-014B §7)", () => {
  const span = [at(100), at(140)] as const;
  it("any equivalent partition of the same span yields the identical result", () => {
    const whole = exactElapsed(...span, []);
    expect(whole).toBe(40);
    for (const cuts of [
      [at(120)],
      [at(101), at(102), at(139)],
      [at(110), at(120), at(130)],
      [at(130), at(110), at(120)], // unordered
      [at(120), at(120)], // repeated
      [at(100), at(140)], // at the ends: subdivides nothing
      [at(5), at(999)], // outside the span: ignored
      [{ unit: "another-unit", value: 120 }], // not this coordinate's unit: ignored
    ]) {
      expect(exactElapsed(...span, cuts)).toBe(whole);
    }
  });
  it("is exact over a sweep of partitions", () => {
    for (let n = 0; n < 40; n++) {
      const cuts = Array.from({ length: n }, (_, i) => at(100 + ((i * 7 + n) % 41)));
      expect(exactElapsed(...span, cuts)).toBe(40);
    }
  });
  it("accepts no tolerance: there is no parameter that could carry one", () => {
    expect(exactElapsed.length).toBe(3);
  });
  it("refuses a backward or cross-unit span", () => {
    expect(() => exactElapsed(at(140), at(100), [])).toThrow(RangeError);
    expect(() => exactElapsed(at(100), { unit: "x", value: 140 }, [])).toThrow(RangeError);
  });
});
