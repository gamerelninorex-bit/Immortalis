import { gitB3BaseFile } from "../support/b3-scoped-deltas.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
describe("briefing verification reuse preserves its source and complete verifier", () => {
  it("retains all 26 owner checks, byte-identical to the selected main verifier body", () => {
    const path = "packages/engine/src/world/canonical-campaign.ts";
    const s = gitB3BaseFile(path).toString("utf8");
    const head = readFileSync(path, "utf8");
    const body = s.slice(s.indexOf("function verifyAll("), s.indexOf("function inputInvalid("));
    // ROADBED R3-T25 freight added exactly ONE further check, `...verifyFreightIntegrity(store),`, to the composed verifier; without that one
    // line the body is byte-identical to the main verifier body, so all 26 original checks are retained, in order.
    const freightLine = "    ...verifyFreightIntegrity(store),\n";
    expect(body.split(freightLine)).toHaveLength(2);
    expect(sha(body.replace(freightLine, ""))).toBe(
      "a67f5accc7c556c8f46a3c1ac6359d0ce2416d32d9bb2df5c5a93016a9977ecc",
    );
    expect(body.match(/\.\.\.verify/g)).toHaveLength(27);
    const headBody = head.slice(
      head.indexOf("function verifyAll("),
      head.indexOf("function inputInvalid("),
    );
    const successor = body
      .replace(
        "  extension: StageOwnerExtension | undefined,\n",
        "  extension: StageOwnerExtension | undefined,\n  workshopCampaign?: string,\n",
      )
      .replace(
        "    ...verifyCanonicalIntegrity(store, {\n",
        "    ...verifyCanonicalIntegrity(store, {\n      ...(workshopCampaign !== undefined ? { workshopCampaign } : {}),\n",
      );
    expect(headBody).toBe(successor);
  });
});
