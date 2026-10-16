import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as contracts from "@immortalis/contracts";
import * as engine from "@immortalis/engine";
import * as protocol from "@immortalis/protocol";
import * as testkit from "@immortalis/testkit";

describe("workspace wiring", () => {
  it("resolves all four packages; protocol exposes exactly the eleven trusted-context binders and the fourteen host operations", () => {
    expect(Object.keys(contracts).length).toBeGreaterThan(0);
    expect(Object.keys(engine).length).toBeGreaterThan(0);
    expect(Object.keys(testkit).length).toBeGreaterThan(0);
    expect(Object.keys(protocol).sort()).toEqual([
      "advanceActivePcToTarget",
      "advanceConfirmedPcTransferToDelivery",
      "advanceNullPcOocToTarget",
      "bindTrustedActivePcHeldTargetAdvanceContext",
      "bindTrustedActivePcTargetAdvanceContext",
      "bindTrustedCausalEventSignalContext",
      "bindTrustedConfirmedPcCessationContext",
      "bindTrustedConfirmedPcCollectionContext",
      "bindTrustedConfirmedPcRelocationContext",
      "bindTrustedConfirmedPcTransferAdvanceContext",
      "bindTrustedCurrentPlayerContext",
      "bindTrustedEventSignalContext",
      "bindTrustedNullPcOocHeldContinuationContext",
      "bindTrustedNullPcOocTargetAdvanceContext",
      "ceaseConfirmedPcCollection",
      "commitConfirmedPcCollection",
      "commitConfirmedPcRelocation",
      "deliverCausalEventSignalPresentation",
      "getPcCollectionReachTask",
      "readCurrentEventSignalPresentation",
      "readCurrentObservationGlance",
      "resumeNullPcOocHeldAdvance",
      "settlePcCollectionLapse",
      "startConfirmedPcCollection",
      "submitPcCollectionReach",
    ]);
  });

  it("pins the runtime declared in .nvmrc to the engines range", () => {
    const nvmrc = readFileSync(".nvmrc", "utf8").trim();
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } };
    expect(pkg.engines.node).toContain(nvmrc);
  });

  it("keeps the engine version constant equal to its package.json", () => {
    const pkg = JSON.parse(readFileSync("packages/engine/package.json", "utf8")) as {
      name: string;
      version: string;
    };
    expect(engine.ENGINE_VERSION).toBe(pkg.version);
    expect(engine.ENGINE_PACKAGE).toBe(pkg.name);
  });
});
