// F-2 repair: explicit implementation identities, not governing source citations.
// The five composed files changed under the ratified M-S brief. Six siblings retain (ROADBED R3-T25 freight later changed two of the
// original eight: temporal/admission.ts and temporal/coordinator.ts, pinned in tests/support/freight-scoped-deltas.ts) their exact bytes from original main 8fa45367c3850e9528ba871ae6608dc178217e62.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { FREIGHT_SCOPED_DELTAS } from "../support/freight-scoped-deltas.ts";
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const composed: Record<string, string> = {
  "packages/engine/src/temporal/bootstrap.ts":
    "ebe3f575666e768a873ab8d3d8fa47376c53cd5513f88a581d728a9156548a63",
  "packages/engine/src/temporal/captured-chronology.ts":
    "6845765e6e8c1b4830d181f55992253362daadab6a9bcc8cbf5b51410cc9e0e9",
  "packages/engine/src/commit/campaign-core.ts":
    "e07ca9275e1ad06bdae6d64ce85e7999bb3de5b5a06cfaca1b051ab5d36f7dfb",
  "packages/engine/src/world/actor-presence.ts":
    "9f53460f72c03e5953ec2c80e49455bd59b910b0bb041ba38e54705878743ad5",
  "packages/engine/src/world/actor-presence-integrity.ts":
    "550b675db14367b0b02a9a9743e09bda0de4506e1b7be876715970d5b552b85e",
};
const unchanged: Record<string, string> = {
  "packages/engine/src/commit/state-digest.ts":
    "293be3b88962fad208926b620feeea710fb910ffd4aea9d71b99a4627881b714",
  // ROADBED R3-T25 freight: packages/engine/src/temporal/admission.ts is a recorded scoped delta of the freight slice (pinned in freight-profile-conformance)
  // ROADBED R3-T25 freight: packages/engine/src/temporal/coordinator.ts is a recorded scoped delta of the freight slice (pinned in freight-profile-conformance)
  "packages/engine/src/temporal/graph.ts":
    "0c1eea854f40f176de165d8f62979fe3f4c8c87055b6def6996aa1b01dd8b124",
  "packages/engine/src/temporal/identity.ts":
    "8319d33aa9a5e0f15055600ec9aad3d9422adfe31e84a5c6d9c71cbfbc777c34",
  "packages/engine/src/temporal/integrity.ts":
    "8e0be8a4635d3827ee65a8388844b512c8fd2413f89cb254cb560e5e90d52918",
  "packages/engine/src/temporal/partition.ts":
    "000880a1d0daab2a3d994b80cbd76f75ecfc9edd7108273b321129ce7ea7d84a",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
};
describe("restored M-S composition and unchanged sibling regression pins", () => {
  it("covers every temporal/commit file and both R1 integration files without a coverage hole", () => {
    const actual = ["packages/engine/src/temporal", "packages/engine/src/commit"]
      .flatMap((d) => readdirSync(d).map((f) => d + "/" + f))
      .concat([
        "packages/engine/src/world/actor-presence.ts",
        "packages/engine/src/world/actor-presence-integrity.ts",
      ])
      .sort();
    // ROADBED R3-T25 freight changed two further temporal files (admission.ts, coordinator.ts): they are scoped deltas pinned in
    // tests/support/freight-scoped-deltas.ts (and no longer "unchanged siblings"), so the coverage has no hole.
    const freightDeltas = Object.keys(FREIGHT_SCOPED_DELTAS).filter(
      (p) =>
        p.startsWith("packages/engine/src/temporal/") ||
        p.startsWith("packages/engine/src/commit/"),
    );
    expect(freightDeltas.sort()).toEqual([
      "packages/engine/src/temporal/admission.ts",
      "packages/engine/src/temporal/coordinator.ts",
    ]);
    expect(Object.keys(composed)).toHaveLength(5);
    expect(Object.keys(unchanged)).toHaveLength(6);
    expect([...Object.keys({ ...composed, ...unchanged }), ...freightDeltas].sort()).toEqual(
      actual,
    );
  });
  it("pins all five authorized integration files at the composed head bytes", () => {
    for (const [path, expected] of Object.entries(composed)) expect(sha(path), path).toBe(expected);
  });
  it("retains all six remaining unmodified siblings at the original main bytes", () => {
    for (const [path, expected] of Object.entries(unchanged))
      expect(sha(path), path).toBe(expected);
  });
});
