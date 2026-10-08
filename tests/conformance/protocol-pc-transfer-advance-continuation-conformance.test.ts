// Conformance evidence for the held-continuation support of the Trusted Player-Authorized Active-PC Stop-at-Delivery Temporal
// Advance Gateway (forty-fourth bounded slice, IM-15 / IM-16 over the existing Temporal kernel). Governing lock:
// spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged. The host-visible contract, the Temporal kernel,
// every owner, the relocation gateway and the frozen F-027 artifacts are byte-identical to the base (main de3cf41); no register
// row, status, source pin or gate moved. The gateway consumes the existing kernel's continuation admission and never reimplements
// it. Authentication and sessions are neither implemented nor claimed. Local success is NOT provider/recovery acceptance
// (IA-07 BLOCKED). PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";

const MODULE = "packages/protocol/src/pc-transfer-advance.ts";
const DOC = "docs/protocol-pc-transfer-advance-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

/** The host-visible contract and the kernel as they stood at the forty-fourth base (main de3cf41): untouched by this slice. */
const UNCHANGED: Record<string, string> = {
  "packages/contracts/src/protocol-advance.ts":
    "3f64a45e7fe169b61593cedc06a062ea3a4c4faed4538786abf2ec757c3f026a",
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
};

describe("only the gateway operation changed: the host contract, the kernel, the owners and the frozen artifacts are the base's", () => {
  it("the host-visible contract and the F-027 lock, contract, register and gates are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("no module, operation, engine file or fact kind was added: the protocol package still has the same four modules and one operation per contract", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "causal-event-signal.ts",
      "event-signal.ts",
      "index.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    expect(
      readFileSync("packages/contracts/src/protocol-advance.ts", "utf8").match(
        /export const PROTOCOL_OP_/g,
      ),
    ).toHaveLength(1);
  });
});

describe("the continuation is the kernel's own, taken from the committed record and never invented", () => {
  const src = identifiers(MODULE);

  it("drives the one existing advance, never the remainder helper, and states no target, clock, role or permission", () => {
    expect(src.match(/\.advance\(/g)).toHaveLength(1);
    expect(src).not.toMatch(/continueRemainder|establishCanonicalTime|registerObject|\.commit\(/);
    expect(src).not.toMatch(
      /PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|\brole\b|\bpermission\b/,
    );
    expect(src.match(/\btarget\b/g)).toHaveLength(1);
    expect(src).toMatch(/const requested = \{ target: null, condition \} as const/);
  });

  it("`continues` is only null, the held transaction's own identity or the committed record's, and `requested` is always the derived condition-only value", () => {
    const text = readFileSync(MODULE, "utf8");
    const assigned = [...text.matchAll(/\bcontinues = ([^;]+);/g)].map((m) => m[1]!.trim());
    expect(assigned).toEqual(["existing.continues", "null", "held.from_transaction"]);
    // the held request is never rebuilt from the held remainder's target
    expect(code(MODULE)).not.toMatch(/held\.toward\s*[,)}]|requested:\s*\{\s*target:\s*held/);
    expect(text).toContain("held.toward !== null");
  });

  it("the eligibility rule is canonical equality with the prior request plus unresolved dependents, and the replay verifies the same", () => {
    const text = readFileSync(MODULE, "utf8");
    expect(text).toMatch(/canonicalEqual\(prior\.requested, requested\)/);
    expect(text).toMatch(/prior\.outcome\.unresolved_dependents\.length > 0/);
    expect(text.match(/isHeldPcContinuation\(/g)).toHaveLength(3);
  });
});

describe("the foundation document records the slice", () => {
  it("names the authority, the held-continuation rule, the recovery rule and what remains unclaimed", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const text of [
      "2026-10-08T08:41:18.563Z",
      "de3cf41c0876146817807698ac999c4becc6b7da",
      "3f320af901e0818a8547db78d37b187f",
      "Held-continuation support (forty-fourth bounded slice)",
      "continueRemainder",
      "continuationRequestViolation",
      "ADVANCE_COMMITTED",
      "RC-16",
      "PF-6/F-028",
    ])
      expect(doc, text).toContain(text);
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no register row was promoted or mentions this slice, and every gate keeps its status", () => {
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(/forty-fourth|held-continuation/i);
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(JSON.stringify(lock)).not.toContain("3f320af901e0818a8547db78d37b187f");
  });
});
