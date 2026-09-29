import { describe, expect, it } from "vitest";
import { checkSpec } from "../../tools/check-spec.ts";

describe("F-027 spec snapshot (RC-01–RC-16 placement)", () => {
  it("has a self-consistent spec-lock, runtime contract, acceptance register and open gates", () => {
    expect(checkSpec(process.cwd())).toEqual([]);
  });
});
