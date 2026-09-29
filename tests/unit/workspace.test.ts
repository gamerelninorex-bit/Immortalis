import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as contracts from "@immortalis/contracts";
import * as engine from "@immortalis/engine";
import * as protocol from "@immortalis/protocol";
import * as testkit from "@immortalis/testkit";

describe("workspace wiring", () => {
  it("resolves all four bootstrap packages and exposes no behavior yet", () => {
    for (const mod of [contracts, engine, protocol, testkit]) {
      expect(Object.keys(mod)).toEqual([]);
    }
  });

  it("pins the runtime declared in .nvmrc to the engines range", () => {
    const nvmrc = readFileSync(".nvmrc", "utf8").trim();
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } };
    expect(pkg.engines.node).toContain(nvmrc);
  });
});
