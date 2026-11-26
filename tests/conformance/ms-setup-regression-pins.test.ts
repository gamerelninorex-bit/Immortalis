// F-2 repair: explicit implementation identities, not governing source citations.
// The five composed files changed under the ratified M-S brief. Six siblings retain (ROADBED R3-T25 freight later changed two of the
// original eight: temporal/admission.ts and temporal/coordinator.ts, pinned in tests/support/freight-scoped-deltas.ts) their exact bytes from original main 8fa45367c3850e9528ba871ae6608dc178217e62.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { A26_ADMISSION_DELTAS } from "../support/a26-scoped-deltas.ts";
import { FREIGHT_SCOPED_DELTAS } from "../support/freight-scoped-deltas.ts";
import { A0_SCOPED_DELTAS } from "../support/a0-scoped-deltas.ts";
import { B2_SCOPED_DELTAS, bytesNowGiven } from "../support/b2-scoped-deltas.ts";
import {
  IF6B_ENGINE_PATH,
  IF6B_ENGINE_SHA256,
  IF6B_SETTLEMENT_PATH,
  IF6B_SETTLEMENT_SHA256,
  atB3EconomyBase,
  B3_E_IF6B_ENGINE_SHA256,
  if6bSuccessorIdentity,
} from "../support/if6b-scoped-delta.ts";
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
// F-014B A0 (CAL-TIME T-1) changed temporal/bootstrap.ts and temporal/captured-chronology.ts after the M-S slice: their pins were replaced by this
// comment, as the freight slice did for admission.ts and coordinator.ts, and the two paths are pinned instead as scoped deltas in
// tests/support/a0-scoped-deltas.ts (base = the composed head bytes that stood here, head = the A0 head), by tests/conformance/a0-scope-conformance.test.ts.
const composed: Record<string, string> = {
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
  // F-014B B2: packages/engine/src/temporal/integrity.ts is a recorded scoped delta of the GM-wait custody slice (tests/support/b2-scoped-deltas.ts)
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
    // (F-014B B2 added no file to either directory: its custody modules live at the engine source root)
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
    const a26Delta = "packages/engine/src/commit/campaign-core.ts";
    // (F-014B B2, a later slice, changed the commit core again: its head is then exactly B2's base, tests/conformance/b2-scope-conformance.test.ts)
    expect(sha(a26Delta)).toBe(
      if6bSuccessorIdentity(a26Delta, bytesNowGiven(a26Delta, A26_ADMISSION_DELTAS[a26Delta].head)),
    );
    // F-014B A0 changed two more temporal files (bootstrap.ts, captured-chronology.ts): pinned in tests/support/a0-scoped-deltas.ts
    const a0Only = Object.keys(A0_SCOPED_DELTAS).filter(
      (p) =>
        (p.startsWith("packages/engine/src/temporal/") ||
          p.startsWith("packages/engine/src/commit/")) &&
        !freightDeltas.includes(p),
    );
    expect(a0Only.sort()).toEqual([
      "packages/engine/src/temporal/bootstrap.ts",
      "packages/engine/src/temporal/captured-chronology.ts",
    ]);
    // F-014B B2 changed one more temporal file (integrity.ts): pinned in tests/support/b2-scoped-deltas.ts (the others it changed are the
    // freight, A0 and commit-core deltas above, whose heads chain to its bases)
    const b2Only = Object.keys(B2_SCOPED_DELTAS).filter(
      (p) =>
        (p.startsWith("packages/engine/src/temporal/") ||
          p.startsWith("packages/engine/src/commit/")) &&
        !freightDeltas.includes(p) &&
        !a0Only.includes(p) &&
        p !== a26Delta,
    );
    expect(b2Only).toEqual(["packages/engine/src/temporal/integrity.ts"]);
    expect(createHash("sha256").update(atB3EconomyBase(IF6B_ENGINE_PATH)).digest("hex")).toBe(
      IF6B_ENGINE_SHA256,
    );
    expect(sha(IF6B_ENGINE_PATH)).toBe(B3_E_IF6B_ENGINE_SHA256);
    expect(sha(IF6B_SETTLEMENT_PATH)).toBe(IF6B_SETTLEMENT_SHA256);
    expect(Object.keys(composed)).toHaveLength(2);
    expect(Object.keys(unchanged)).toHaveLength(5);
    expect(
      [
        ...Object.keys({ ...composed, ...unchanged }),
        ...freightDeltas,
        ...a0Only,
        ...b2Only,
        a26Delta,
        IF6B_ENGINE_PATH,
        IF6B_SETTLEMENT_PATH,
      ].sort(),
    ).toEqual(actual);
  });
  it("pins the two remaining unaffected integration files at the composed head bytes", () => {
    for (const [path, expected] of Object.entries(composed)) expect(sha(path), path).toBe(expected);
  });
  it("retains the five remaining unmodified siblings at the original main bytes", () => {
    for (const [path, expected] of Object.entries(unchanged))
      expect(sha(path), path).toBe(expected);
  });
});
