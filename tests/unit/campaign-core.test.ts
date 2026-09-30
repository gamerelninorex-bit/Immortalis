import { describe, expect, it } from "vitest";
import { CampaignCore, emptyState, stateSha256, stateToFile } from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";

const SPEC = "a".repeat(64);
const GENESIS = "b".repeat(64);
const core = () =>
  new CampaignCore({
    campaignId: "c1",
    specLockSha256: SPEC,
    owners: TEST_OWNERS,
    state: emptyState("c1"),
    headSha256: GENESIS,
  });

describe("CampaignCore (pure)", () => {
  it("is deterministic: identical inputs give identical entries and hashes", () => {
    const run = () => {
      const c = core();
      const p1 = c.prepare(group("c1", 1, [write("a", 1), write("b", [1, 2])]));
      if (!p1.ok || p1.value.kind !== "apply") throw new Error("expected apply");
      c.accept(p1.value);
      const p2 = c.prepare(group("c1", 2, [write("a", 2, { expected_version: 1 })]));
      if (!p2.ok || p2.value.kind !== "apply") throw new Error("expected apply");
      c.accept(p2.value);
      return {
        entries: [p1.value.entry, p2.value.entry],
        state: stateSha256(c.state),
        head: c.headSha256,
      };
    };
    expect(run()).toEqual(run());
  });

  it("stamps versions, provenance and a chained hash", () => {
    const c = core();
    const p = c.prepare(group("c1", 1, [write("a", 1)]));
    if (!p.ok || p.value.kind !== "apply") throw new Error("expected apply");
    expect(p.value.entry.prev_sha256).toBe(GENESIS);
    expect(p.value.nextState.facts.get("a")).toMatchObject({
      version: 1,
      provenance: { group_id: "group-1", intent_id: "intent-1" },
    });
    expect(p.value.entry.receipt.basis.spec_lock_sha256).toBe(SPEC);
  });

  it("prepare does not mutate state until accepted (staging is never current truth)", () => {
    const c = core();
    c.prepare(group("c1", 1, [write("a", 1)]));
    expect(c.state.revision).toBe(0);
    expect(c.state.facts.size).toBe(0);
  });

  it("does not alias caller-owned objects", () => {
    const c = core();
    const g = group("c1", 1, [write("a", { nested: [1] })]);
    const p = c.prepare(g);
    if (!p.ok || p.value.kind !== "apply") throw new Error("expected apply");
    c.accept(p.value);
    (g.writes[0]!.value as { nested: number[] }).nested.push(99);
    expect(stateToFile(c.state).facts[0]!.value).toEqual({ nested: [1] });
  });

  it("replay re-derives an entry and rejects a tampered one", () => {
    const src = core();
    const p = src.prepare(group("c1", 1, [write("a", 1)]));
    if (!p.ok || p.value.kind !== "apply") throw new Error("expected apply");
    const fresh = core();
    expect(fresh.replay(p.value.entry).ok).toBe(true);
    expect(stateSha256(fresh.state)).toBe(p.value.entry.receipt.state_sha256);
    const tampered = structuredClone(p.value.entry);
    tampered.group.writes[0]!.value = 2;
    const other = core();
    const r = other.replay(tampered);
    expect(r.ok).toBe(false);
  });
});
