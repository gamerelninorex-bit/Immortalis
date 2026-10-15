// BLUE v5.2 conformance — active-PC direct physical observation. The slice adds code, tests and documents; it moves no spec-lock pin, acceptance
// register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays unactivated). Every EXISTING source file it modified is pinned at the
// slice head, so a later change to any of them is an explicit, reviewed re-pin and never silent - the three Temporal files among them are the
// narrow, Epistemic-only current-basis amendment documented in the foundation document. The pins below were generated from the committed files.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OBSERVATION_BRIEF_SOURCE,
  OBSERVATION_RESOLUTION_SOURCE,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_FACT_KINDS,
  REFEREE_FACT_KINDS,
  REFEREE_OBSERVATION_RULE,
} from "@immortalis/engine";
import { REFEREE_SOURCES } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");

const MODIFIED: Record<string, string> = {
  "packages/contracts/src/epistemic-access.ts":
    "2d4285c4f471c6e97988742c3d063d04552c04335c8b6d0b267d0fd02adac0c4",
  "packages/contracts/src/referee.ts":
    "17278e17bbfe01ede76e41b334cf5cfeed1ad091b5cdea37268e9a5f06803d45",
  "packages/contracts/src/temporal.ts":
    "c47467c75137f69b7e951be68aaaa9fc4f6b68f1ddaba311f373a2014ebf9adb",
  "packages/engine/src/epistemic/adapter.ts":
    "91dadeae31967c1363bd010a1459943b2036685305bed7b343c302ce787634ab",
  "packages/engine/src/epistemic/admission.ts":
    "f9cfb56d21484387181981ef32224b2f317bd2153a63d35a958e00854616828b",
  "packages/engine/src/epistemic/declaration.ts":
    "ed26e5ef013c80b0eedf10b15a81374b5163d6b80c53146a19aebb41b19b2aea",
  "packages/engine/src/epistemic/integrity.ts":
    "57ae9f04b3cefa39bb77883bd9f1d8f241f1c20fb8ee07374866d3251835e1d9",
  "packages/engine/src/index.ts":
    "979e435c37d3398f0d9d36de3d0998a62bafe15539f1c3bf8b757ff930e451b8",
  "packages/engine/src/owners/registry.ts":
    "c3c085fa2a124e9eb3ce86b03742f6be189851d017a461e7245dc2b33c9ad3a8",
  "packages/engine/src/referee/adapter.ts":
    "bbe9e5136b8241c1cf9c59b4e7dfb36f3621adc74121dc25383cb5676989dc13",
  "packages/engine/src/referee/admission.ts":
    "91fd5daf300e3676b7b3849415d2f1924d1d32642ce245181ceaf1139d5275c1",
  "packages/engine/src/referee/derive.ts":
    "3197f50fba0dabd5150b1995d2cf6879060f6f40b5d5dccc8b905bc8a7fbf9e1",
  "packages/engine/src/referee/integrity.ts":
    "77598855c7adfd864090d43725ee52bf2bcfc4d859b0792e0ff769a0a98a0284",
  "packages/engine/src/temporal/admission.ts":
    "9be0e500bb1f4aaeae00edb97d902cb6c7644566315cd542df599df02499ee0f",
  "packages/engine/src/temporal/integrity.ts":
    "5686167dd74f7cabd24b008978474424a4eca020e5e5fc6f651f8d26105c6840",
  "packages/operator/src/cli.ts":
    "5e04149c346496a178d6f3e2e0fc6570a11a881fea5579236150cefaec5df4e4",
  "packages/operator/src/confirmation.ts":
    "3d88a1e8c0fcea7bd8b9a374dcaa5d8dae2b1f5f05d3660e180fc2895030db5e",
  "packages/operator/src/index.ts":
    "bd97f7c3b300ad48c80d25943aca1c7d9b0e14e930a650650044e2a3b97e16ba",
  "packages/operator/src/original-pc.ts":
    "ea023957d3ddd4e8dbab14111213d2d46d057a27564f59a413bb65e18a0d3f55",
  "packages/operator/src/referee-exchange.ts":
    "9c9a628c2417a1d5277afc934a1989fd7a44bfae4a40d195f091f7c13e68d6a7",
  "packages/operator/src/referee-mcp.ts":
    "288de65f95267c91608e577c5d4a3338225a10a34b93db2f5d187786c56b22a9",
  "packages/operator/src/referee-session.ts":
    "d6e1b40103abe3aaa8e894bed3d06bbc5d0fc912dd06129a53d8c4ae69ea1b9a",
};
const SPEC: Record<string, string> = {
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
};
const DOC = "docs/active-pc-direct-observation-foundation.md";
const EVIDENCE_DOC = "docs/evidence/b52-direct-observation-live-host.md";
const EVIDENCE_DIR = "docs/evidence/b52-direct-observation-live-host";
const SCENARIOS = [
  "p1-red-patch",
  "n1-opaque-screen",
  "n2-no-viewing-circumstances",
  "n3-no-stated-sight",
  "n4-eyes-closed",
  "n5-no-light",
];

describe("sources and pins: nothing in the lock, register or gates moved", () => {
  it("the frozen spec files are byte-identical to main", () => {
    for (const [file, hash] of Object.entries(SPEC)) expect(sha(file), file).toBe(hash);
  });

  it("the direct-perception clauses cite F-014D at exactly its spec-lock pin, and the construction sources at the brief's pins", () => {
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    for (const id of ["F014D-2", "F014D-5", "F014D-6", "F014D-18", "F014D-24"] as const) {
      expect(REFEREE_SOURCES[id].artifact).toBe(f014d.url);
      expect(REFEREE_SOURCES[id].native_pin).toBe(f014d.native_pin);
    }
    expect(EPISTEMIC_ACCESS_OBSERVATION_RULE.artifact).toBe(f014d.url);
    expect(EPISTEMIC_ACCESS_OBSERVATION_RULE.native_pin).toBe(f014d.native_pin);
    expect(OBSERVATION_BRIEF_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/3fa20af901e081578dc7ff7b62c60873",
      native_pin: "2026-10-15T02:24:15.992Z",
    });
    expect(OBSERVATION_RESOLUTION_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/3fa20af901e08157ac91eb3295d02968",
      native_pin: "2026-10-15T02:16:11.867Z",
    });
    // the construction brief is cited as a construction source, never promoted to a lock pin
    expect(REFEREE_OBSERVATION_RULE.effective_basis).toBe("blue-bounded-brief-not-spec-locked");
    expect(lock.frozen_sources.some((s) => s.url === OBSERVATION_BRIEF_SOURCE.artifact)).toBe(
      false,
    );
    expect(
      lock.governance_references.some((s) => s.url === OBSERVATION_BRIEF_SOURCE.artifact),
    ).toBe(false);
  });

  it("OB-030/F-028 stay Blocked, PF-6 stays unactivated and no register row is promoted by this slice", () => {
    const row = (id: string) => register.find((r) => r.id === id);
    expect(gates.find((g) => g.id === "PF-6")?.status).not.toBe("ACTIVATED");
    expect(row("IA-07")?.status).toBe("BLOCKED");
  });
});

describe("one scoped delta: no new owner, no new fact kind, no new facet", () => {
  it("the Epistemic and referee kinds are the same kinds; the new citations are alternates, not new rules", () => {
    expect(EPISTEMIC_ACCESS_FACT_KINDS.map((k) => k.id)).toEqual([
      "epistemic_access_event",
      "epistemic_accessible_packet",
      "epistemic_sealed_provenance",
    ]);
    expect(REFEREE_FACT_KINDS.map((k) => k.id)).toEqual(["referee_decision"]);
    const event = EPISTEMIC_ACCESS_FACT_KINDS[0]!;
    expect(event.alternateRules!.map((a) => a.rule)).toContain(EPISTEMIC_ACCESS_OBSERVATION_RULE);
    expect(REFEREE_FACT_KINDS[0]!.alternateRules!.map((a) => a.rule)).toContain(
      REFEREE_OBSERVATION_RULE,
    );
  });

  it("every existing source file this slice modified is pinned at the slice head", () => {
    for (const [file, hash] of Object.entries(MODIFIED)) expect(sha(file), file).toBe(hash);
  });

  it("the Temporal amendment is exactly three scoped places, each naming only the Epistemic engagement", () => {
    const schema = code("packages/contracts/src/temporal.ts");
    expect(schema.match(/EPISTEMIC_ENGAGEMENT_OWNER/g)).toHaveLength(2);
    const admission = code("packages/engine/src/temporal/admission.ts");
    expect(admission.match(/atCurrentBasis/g)).toHaveLength(2);
    expect(admission).toMatch(/atCurrentBasis =\s*o\.owning_ref\.owner === OWNER_EPISTEMIC_ACCESS/);
    const integrity = code("packages/engine/src/temporal/integrity.ts");
    expect(integrity).toMatch(/currentBasisEngagements/);
    expect(integrity).toMatch(/owning_ref\.owner === OWNER_EPISTEMIC_ACCESS/);
    // nothing else of the kernel moved: the coordinator and its providers are untouched
    expect(readdirSync("packages/engine/src/temporal").sort()).toEqual([
      "admission.ts",
      "coordinator.ts",
      "graph.ts",
      "identity.ts",
      "integrity.ts",
      "partition.ts",
      "providers.ts",
    ]);
  });
});

describe("the mechanism asks a model for nothing, invents no number and persists nothing of its own", () => {
  const files = [
    "packages/engine/src/epistemic/observation.ts",
    "packages/engine/src/epistemic/direct-observation.ts",
    "packages/operator/src/observation.ts",
  ];
  it("no model API, network, credential or clock is touched by the new modules", () => {
    for (const f of files) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:https?|node:net|fetch\(|anthropic|openai|api[_-]?key|Date\.now|new Date\(|Math\.random|randomBytes/i,
      );
    }
  });

  it("the operator command writes canon only through the owners' own operations, and delivers only the one event it just earned", () => {
    const text = code("packages/operator/src/observation.ts");
    expect(text).not.toMatch(
      /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|factKind|CANON_WRITE_AUTHORITY/,
    );
    expect(text.match(/formObservedPacket\(/g)).toHaveLength(1);
    expect(text.match(/deliverCausalEventSignalPresentation\(/g)).toHaveLength(1);
    expect(text.match(/bindTrustedCausalEventSignalContext\(/g)).toHaveLength(1);
    // the player is never shown the setting, the host's reasoning or a verdict name
    expect(text).not.toMatch(
      /\.decision\.(faculty|position|path|assessments|payload)|OBSERVATION_(ESTABLISHED|OBSTRUCTED|UNRESOLVED|WORLD_CONFLICT)\b.*terminal\.say/,
    );
  });
});

describe("evidence: the real-host exercise is retained, and the documents claim no more than it shows", () => {
  it("the foundation document states what is and is not claimed, and the amendment for review", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toMatch(/No PASS acceptance is claimed here/);
    expect(doc).toMatch(/for BLUE review/);
    expect(doc).toMatch(/never proof of obstruction|never proof of obstruction/i);
    expect(doc).toMatch(/OB-030/);
  });

  it("every cited scenario has its console transcript, its host trace(s) and its retained decision, and the evidence document cites each", () => {
    expect(existsSync(EVIDENCE_DOC)).toBe(true);
    const doc = readFileSync(EVIDENCE_DOC, "utf8");
    expect(doc).toMatch(/not an acceptance proof/i);
    expect(doc).toMatch(/No semantic acceptance is claimed/i);
    const files = readdirSync(EVIDENCE_DIR);
    expect(files).toContain("host-prompt.txt");
    expect(files).toContain("run-exercise.mts.txt");
    for (const s of SCENARIOS) {
      expect(files, s).toContain(`console-${s}.txt`);
      expect(files, s).toContain(`retained-decision-${s}.json`);
      expect(
        files.some((f) => f.startsWith(`host-trace-${s}-`)),
        s,
      ).toBe(true);
      expect(doc, s).toContain(s);
    }
    // the host was shown no scenario label: its prompt is the generic instruction only
    const prompt = readFileSync(`${EVIDENCE_DIR}/host-prompt.txt`, "utf8");
    for (const s of SCENARIOS) expect(prompt).not.toContain(s);
    expect(prompt).not.toMatch(/\b(expected|negative|positive|screen|red|patch)\b/i);
  });
});
