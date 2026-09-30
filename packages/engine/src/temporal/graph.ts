import type { StageKey, UnresolvedReason } from "@immortalis/contracts";

/**
 * The transient, stage-indexed dependency graph/frontier of ONE ResolutionTransaction (F-017 §2 DERIVE
 * — DO NOT PERSIST NEW ENGINE STATE; §4). This module is pure: it holds no state between calls, reads
 * no campaign, and nothing here is ever written to canon. No global turn counter, phase, queue or
 * scheduler follows from it.
 *
 *   NOW    every NOW edge is in the instantaneous-cycle graph, including one that targets a later
 *          stage/result at the same timestamp (F-017 §3).
 *   CLOSE  a dependency edge (the producer must exist first) that is the only temporal lag cut: it is
 *          excluded from the instantaneous NOW graph.
 *
 * Cycle testing uses the stage-indexed graph. A NOW edge that returns to the same (causal
 * event/process identity, owner operation) as one of its ancestors closes an instantaneous cycle
 * whatever its prospective result identity or source version (F-017 §3, §4.6), so the NOW test runs on
 * the graph with nodes of the same (process, operation) identified. No GROUP is authorized in this
 * slice, so there is no lawful cycle: an SCC stops the smallest dependent component as ordering
 * unresolved. No partition cut, implicit phase, provider-version change or invented owner breaks it.
 */
export interface GraphNode {
  readonly id: string;
  readonly stage: StageKey;
}
export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly mode: "NOW" | "CLOSE";
}
export interface GraphAnalysis {
  /** nodes that may resolve, in dependency order (a linear extension of the partial order) */
  readonly order: readonly string[];
  /** nodes that may not resolve, and why; independent nodes are absent and remain eligible */
  readonly blocked: ReadonlyMap<string, UnresolvedReason>;
}

const cycleClass = (s: StageKey): string =>
  JSON.stringify([s.causal_process_id, s.owner_operation.owner, s.owner_operation.operation]);

/**
 * Bookkeeping-equivalent tie order among INCOMPARABLE nodes only (F-014B §15 step 4: stable process
 * or entity id, then stable event id). It never orders comparable nodes and cannot change a result,
 * because incomparable stages read nothing from each other.
 */
const stableKey = (s: StageKey): string =>
  JSON.stringify([
    s.causal_process_id,
    s.owner_operation.owner,
    s.owner_operation.operation,
    s.prospective_result_id,
  ]);

/** Strongly connected components (Tarjan). Deterministic for a given adjacency insertion order. */
function sccs(
  vertices: readonly string[],
  adj: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const visit = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      out.push(comp);
    }
  };
  for (const v of vertices) if (!index.has(v)) visit(v);
  return out;
}

const adjacency = (edges: readonly { from: string; to: string }[]): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const e of edges) m.set(e.from, [...(m.get(e.from) ?? []), e.to]);
  return m;
};

export function analyzeStageGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  preBlocked: ReadonlyMap<string, UnresolvedReason> = new Map(),
): GraphAnalysis {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blocked = new Map<string, UnresolvedReason>(preBlocked);

  // Smallest dependent component: everything downstream of an unresolved node waits; independent
  // nodes do not.
  const propagate = (): void => {
    for (let changed = true; changed;) {
      changed = false;
      for (const e of edges) {
        if (blocked.has(e.from) && !blocked.has(e.to)) {
          blocked.set(e.to, "PREDECESSOR_BLOCKED");
          changed = true;
        }
      }
    }
  };

  // 1. instantaneous (NOW-only) cycle test over stage identity. CLOSE edges are not in this graph.
  const classOf = (id: string): string => cycleClass(byId.get(id)!.stage);
  const nowEdges = edges
    .filter((e) => e.mode === "NOW")
    .map((e) => ({ from: classOf(e.from), to: classOf(e.to) }));
  const classes = [...new Set(nodes.map((n) => cycleClass(n.stage)))];
  const nowAdj = adjacency(nowEdges);
  const cyclic = new Set<string>();
  for (const comp of sccs(classes, nowAdj)) {
    const only = comp[0]!;
    if (comp.length > 1 || (nowAdj.get(only) ?? []).includes(only))
      comp.forEach((c) => cyclic.add(c));
  }
  for (const n of nodes) {
    if (cyclic.has(cycleClass(n.stage)) && !blocked.has(n.id))
      blocked.set(n.id, "INSTANTANEOUS_CYCLE");
  }
  propagate();

  // 2. the full dependency order (NOW and CLOSE) among the rest must be satisfiable: a required
  // predecessor must exist before its consumer. A cycle through a CLOSE edge is not a NOW cycle, but
  // it cannot be ordered either, and no phase or partition cut is invented to order it.
  const live = nodes.filter((n) => !blocked.has(n.id)).map((n) => n.id);
  const liveSet = new Set(live);
  const liveEdges = edges.filter((e) => liveSet.has(e.from) && liveSet.has(e.to));
  const fullAdj = adjacency(liveEdges);
  for (const comp of sccs(live, fullAdj)) {
    const only = comp[0]!;
    if (comp.length > 1 || (fullAdj.get(only) ?? []).includes(only)) {
      comp.forEach((id) => blocked.set(id, "UNSATISFIABLE_ORDER"));
    }
  }
  propagate();

  // 3. linear extension (Kahn) of what remains; ties among incomparable nodes by stable identity.
  const rest = nodes.filter((n) => !blocked.has(n.id));
  const restSet = new Set(rest.map((n) => n.id));
  const indegree = new Map(rest.map((n) => [n.id, 0]));
  const out = adjacency(edges.filter((e) => restSet.has(e.from) && restSet.has(e.to)));
  for (const tos of out.values()) for (const t of tos) indegree.set(t, (indegree.get(t) ?? 0) + 1);
  const ready = rest.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const cmp = (a: string, b: string): number => {
    const ka = stableKey(byId.get(a)!.stage);
    const kb = stableKey(byId.get(b)!.stage);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort(cmp);
    const next = ready.shift()!;
    order.push(next);
    for (const t of out.get(next) ?? []) {
      const d = (indegree.get(t) ?? 0) - 1;
      indegree.set(t, d);
      if (d === 0) ready.push(t);
    }
  }
  return { order, blocked };
}
