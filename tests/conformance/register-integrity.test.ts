import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Row = { id: string; status: string; evidence: unknown };
const rows = (parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as { rows: Row[] })
  .rows;

// Conformance tests must reference a register ID and the source lock (spec/f027/spec-lock.json).
// Until an ID has an executable test, it must remain NOT_IMPLEMENTED / BLOCKED / UNRUN — never PASS.
describe("acceptance register honesty (IA-01, IA-02, IA-07; spec lock f027)", () => {
  it("has no PASS/FAIL row at bootstrap because no conformance test exists yet", () => {
    expect(rows.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });

  it("keeps the deferred managed-provider recovery gate IA-07 BLOCKED, never PASS", () => {
    expect(rows.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });
});
