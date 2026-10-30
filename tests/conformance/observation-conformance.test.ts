// Referee restart repair composition: trusted wait cancellation only; exchange wire formats, authentication and all owner/spec pins remain unchanged.
// Zero-confirmation request-evidence composition: interface digests only; owner/spec pins remain unchanged.
// PR91 BLUE HOLD composition: readable review adaptation and exact private binding recovery; frozen owners/source locks unchanged.
// Composed implementation pin update: BLUE two-review brief 40620af901e0812d8b30fbaaa33f4bf3. Frozen sources/owners unchanged.
// BLUE v5.2 conformance — active-PC direct physical observation. The slice adds code, tests and documents; it moves no spec-lock pin, acceptance
// register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays unactivated). Every EXISTING source file it modified is pinned at the
// slice head. PR #67 H-1 recovery removes the current-basis boundary exception and adds the owner-qualified event-trigger seam.
// These implementation pins change openly; frozen design, source-lock, acceptance status and gates do not.
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
  "packages/engine/src/epistemic/provider.ts":
    "bfe7857aad391ec1374210ebf81bbb76dfb062ae7a5e27958b3adfcd4891dc5e",
  "packages/engine/src/temporal/coordinator.ts":
    "5bdbc6cbf4cb4cc9a01f11f009ecc0767ac75d0e8373974ed09bd465a8febdd1",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/contracts/src/epistemic-access.ts":
    "a7f2d4bf7ae5abedfd34a3f73f45b67ebab3521c7ff60d6a93feeb823cad865c",
  "packages/contracts/src/referee.ts":
    "a9b3068dea09db59dd636d897f4dab751a49654f7db84f9f8a9a4189050258b7",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/engine/src/epistemic/adapter.ts":
    "91dadeae31967c1363bd010a1459943b2036685305bed7b343c302ce787634ab",
  "packages/engine/src/epistemic/admission.ts":
    "0172458a289e4014b15a1ae3179bd0b5d1cc8985af6acb984cf4818d130ec0d1",
  "packages/engine/src/epistemic/declaration.ts":
    "754866e721064059052d4f37a170a7339d1a81eb29b9dd0ee9b9fa8f812b7257",
  "packages/engine/src/epistemic/integrity.ts":
    "577777d9fcee52b3b89fb26398ed8c32426b7e769a3ed5a6a13adb507287d7a7",
  "packages/engine/src/index.ts":
    "d1521b5afb0afd6b23ceda468b81895eb36f6d41ebf2d175d93d2a9388dbf345",
  "packages/engine/src/owners/registry.ts":
    "88d9edc79bf7b8b1e9b3b8d97659f56e2cd7099ea9af7ac632f0920014a6ab0a",
  "packages/engine/src/referee/adapter.ts":
    "b033bd1df6920ae22303fa1dc70254f0e48810bb29f8fd4a7af9bec249593492",
  "packages/engine/src/referee/admission.ts":
    "67d5000626765cc01f1c8d402513979562727223b1e27490f49701c9b8593791",
  // adjusted openly for N-1 (RED, #72): derive.ts gains `deliveryWithheld` (the completed-collection variant's withheld set) and
  // comment-only authority-label corrections; see tests/integration/collection-observation-withheld.test.ts
  "packages/engine/src/referee/derive.ts":
    "dd5c76eeda87503fa5f28e03a6676edd899f9a46c4a632d41a4d7ad6ea4762f6",
  "packages/engine/src/referee/integrity.ts":
    "0de08afe1f82134d7b0648a5e4c6979a94915a807648d9b240f4d65c9de5a844",
  "packages/engine/src/temporal/admission.ts":
    "7e079c4df4b756b741d04241f752d9c68ce12a6aa9938204d7afeee6f9b03b67",
  "packages/engine/src/temporal/integrity.ts":
    "8e0be8a4635d3827ee65a8388844b512c8fd2413f89cb254cb560e5e90d52918",
  "packages/operator/src/cli.ts":
    "7734645c59c0cb375345c1023333d3c6870a55c591e60b0a4252c633b85ff833",
  "packages/operator/src/confirmation.ts":
    "f8b131a482f86719538bb754900f8a597522e1e355035b5af7c7612caf870cd3",
  "packages/operator/src/index.ts":
    "0963a796522254e3f2a6fd2fa9dd53af2419dab6589f9649f5ae30c578994a57",
  "packages/operator/src/original-pc.ts":
    "a3b9563b0c119a344ee81edd71815bb1d821383f3948ccb4b0fced58c9af97d4",
  "packages/operator/src/referee-exchange.ts":
    "411cbb63d49e26e105c71a8cf33a55d2222c996bc0d17a45046f1b6eb92a7085",
  "packages/operator/src/referee-mcp.ts":
    "05ecde2220d3eafc74d4afe2c6e4ae22ebfadcd558ee13386ba2c4cbbc5f493d",
  "packages/operator/src/referee-session.ts":
    "c8a46a7a516d02359d0069b9051e6044a4b757b39b3d8205abb3f63f612b687b",
};
const SPEC: Record<string, string> = {
  "spec/f027/spec-lock.json": "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
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

  it("the held current-basis boundary exception is removed; formation uses the committed event trigger", () => {
    expect(code("packages/contracts/src/temporal.ts")).not.toContain("EPISTEMIC_ENGAGEMENT_OWNER");
    expect(code("packages/engine/src/temporal/admission.ts")).not.toContain("atCurrentBasis");
    expect(code("packages/engine/src/temporal/integrity.ts")).not.toContain(
      "currentBasisEngagements",
    );
    const formation = code("packages/engine/src/epistemic/direct-observation.ts");
    expect(formation).not.toContain("registerObject(");
    expect(formation).not.toContain("observationEngagement(");
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
    expect(doc).toMatch(/Independent BLUE delta review remains/);
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
