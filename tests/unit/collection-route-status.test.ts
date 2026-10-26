import { expect, it } from "vitest";
import { routeStatus, type StatusInput } from "../../apps/phone/src/route-status.ts";
import { clarificationNeed, type RouteFactsRead } from "../../apps/phone/src/route-evidence.ts";

it("an unrelated duration is no owner evidence that the handling-cycle branch is closed (BLUE PR88 H1)", () => {
  // Isolated adapter evidence: no campaign or positive canonical premise is seeded.
  const read = {
    clarification: null,
    preparation: { mechanism: null },
    collection_commitment: false,
    time: { canonical_time: { value: 7, unit: "second" } },
    claims: [
      { statement: "These hands gather loose material; this body holds its breath for 30 second" },
    ],
  } as unknown as RouteFactsRead;
  expect(clarificationNeed(read)).toBe("OPEN");
});

it("an interrupted earlier setting is recovered through its existing tools; status never asks to author it again", () => {
  const input: StatusInput = {
    read: { kind: "NO_SETTING", detail: "the setting is not complete" },
    record: { kind: "NONE" },
    playerViewHost: true,
    coverage: new Set(),
    install: null,
    running: null,
    barrier: "RECONCILE",
  };
  expect(routeStatus(input).next).toMatchObject({
    tool: "original_setting_status",
    ask_the_player: [],
  });
  expect(routeStatus({ ...input, barrier: "ENGINEERING" }).next).toBeNull();
  expect(routeStatus({ ...input, barrier: "NONE" }).next?.tool).toBe("propose_original_setting");
});
