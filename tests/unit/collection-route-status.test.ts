import { expect, it } from "vitest";
import { routeStatus, type StatusInput } from "../../apps/phone/src/route-status.ts";

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
