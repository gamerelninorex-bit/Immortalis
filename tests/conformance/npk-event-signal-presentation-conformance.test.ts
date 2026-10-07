// Conformance evidence for the NPK Event-Signal Presentation Foundation (thirty-sixth bounded slice, IM-14 over IM-13 / RC-14).
// Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0). IA-17
// stays NOT_IMPLEMENTED (see `partial_evidence`): this slice covers only the aspect it names, no status or gate moved, and
// later live NPK edits (after the lock pin) are not consumed. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as engine from "@immortalis/engine";
import * as contracts from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

const MODULE = "packages/engine/src/presentation/event-signal.ts";
const CONTRACT = "packages/contracts/src/presentation.ts";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

describe("IA-01 source/version fidelity (NPK presentation aspect)", () => {
  it("NPK, I-001 and F-014D are the exact spec-locked pins the slice rests on; NPK's primary IM is IM-14", () => {
    const npk = lock.frozen_sources.find((s) => s.id === "NPK")!;
    expect(npk.native_pin).toBe("2026-09-25T00:18:32.532Z");
    expect(npk.primary_im).toBe("IM-14");
    expect(npk.url).toBe("https://app.notion.com/p/3e320af901e081db854eef7c53de47a3");
    const i001 = lock.frozen_sources.find((s) => s.id === "I-001")!;
    expect(i001.native_pin).toBe("2026-09-25T00:17:49.551Z");
    expect(i001.primary_im).toBe("IM-13");
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    expect(f014d.native_pin).toBe("2026-09-24T16:25:17.059Z");
    // the contract documents the sources it rests on, at those pins, and no later live edit
    const text = readFileSync(CONTRACT, "utf8");
    for (const pin of [npk.native_pin, i001.native_pin, f014d.native_pin])
      expect(text, pin).toContain(pin);
  });

  it("the Runtime Contract and open-gates snapshots are byte-identical to the predecessor's: this slice resolves and changes no gate", () => {
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    const rc = readFileSync("spec/f027/runtime-contract.md", "utf8");
    expect(rc).toContain("## RC-14 — Projection");
    expect(rc).toMatch(/IM-14 NPK \/ Presentation Adapter/);
    expect(rc).toMatch(
      /NPK Narrative & Performance Kernel\s+\| IM-14 \(only after IM-13 projection\)/,
    );
  });

  it("no source pin moved: the lock pins the same NPK / I-001 / F-014D / Role Registry / F-014B natives as the predecessor", () => {
    expect(lock.frozen_sources.find((s) => s.id === "F-014B")!.native_pin).toBe(
      "2026-09-25T23:42:29.547Z",
    );
    expect(
      lock.governance_references.find((g) => g.title === "Canonical Role Registry v1")!.native_pin,
    ).toBe("2026-09-25T08:21:22.816Z");
  });
});

describe("IA-03 owner exclusivity: the presentation adds no owner, facet, key space, fact kind, adapter or writer", () => {
  it("the presentation module is one pure function file: no class, no adapter, no owner operation, no registry entry", () => {
    expect(readdirSync("packages/engine/src/presentation")).toEqual(["event-signal.ts"]);
    expect(
      Object.keys(engine)
        .filter((k) => /Presentation|present[A-Z]|PRESENTATION/.test(k))
        .sort(),
    ).toEqual(["presentEventSignal"]);
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/\bclass\b/);
    expect(src).not.toMatch(/\bregisterOwner|FACT_KINDS|factKind|StageProvider|OwnerFact\s*=\s*\{/);
    expect(readFileSync("packages/engine/src/owners/registry.ts", "utf8")).not.toMatch(
      /presentEventSignal|EventSignalPresentation|NPK/,
    );
  });

  it("the presenter's only input is the projection value and its only import is the contracts: no store, view, packet, event, provenance, capability, Temporal or owner state", () => {
    const imports = [...readFileSync(MODULE, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["@immortalis/contracts"]);
    const text = readFileSync(MODULE, "utf8");
    expect(text).toMatch(/export function presentEventSignal\(\s*projection: unknown,\s*\)/);
    const src = identifiers(MODULE);
    for (const forbidden of [
      /\bCampaignStore\b|\bProjectionStateView\b|\bgetFact\b|\bcommittedGroup\b|\blistFacts\b/,
      /\bAccessEvent\b|\bAccessiblePacket\w*\b|\baccess\w*Key\b|\bpcCapabilityKey\b|\bTemporalState\b|\bOwnerFact\b/,
      /\bcommit\b|\bregisterObject\b|\badvance\b|\bcontinueRemainder\b|\bestablish[A-Z]\w*\b/,
      /\bderiveEventSignalProjection\b|\btraceEventSignalDerivation\b/,
      /\bDate\b|\bMath\.random\b|\brandom\w*\b/i,
      /\bcrypto\b|\bsetTimeout\b|\bsetInterval\b|\bprocess\b|\bfs\b|\bfetch\b/,
      /\basync\b|\bawait\b|\bPromise\b|\bMap\b|\bSet\b|\bWeakMap\b|\bglobalThis\b|\bglobal\b|\blet\b|\bvar\b/,
    ])
      expect(src, String(forbidden)).not.toMatch(forbidden);
  });

  it("no predecessor module names the presentation: the IM-13 projection module and contract are byte-identical to the predecessor's, and Epistemic, Temporal, PC and world modules never name it", () => {
    expect(sha("packages/engine/src/projection/event-signal.ts")).toBe(
      "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
    );
    expect(sha("packages/contracts/src/projection.ts")).toBe(
      "17e0c6288e6834f7f064014d1e90b6563f95268c89acabad621dbed318fce6c1",
    );
    for (const dir of [
      "epistemic",
      "temporal",
      "pc-capability",
      "actor",
      "world",
      "projection",
      "commit",
      "persistence",
      "owners",
    ])
      for (const f of readdirSync(`packages/engine/src/${dir}`).filter((n) => n.endsWith(".ts")))
        expect(code(`packages/engine/src/${dir}/${f}`), `${dir}/${f}`).not.toMatch(
          /presentEventSignal|EventSignalPresentation|PRESENTATION_NPK/,
        );
  });
});

describe("IA-17 the presentation contract has no field for sealed, hidden, cognitive or authored content", () => {
  it("the contract names no engine reference, hidden-state label, cognition, memory, urgency, time coordinate, mode or prose field", () => {
    const src = identifiers(CONTRACT);
    const fields = [...src.matchAll(/\b([a-z_]+):/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(
      [
        "channel",
        "disposable",
        "element",
        "elements",
        "entity_id",
        "form",
        "presentation",
        "role",
        "text",
        "viewpoint",
      ].sort(),
    );
    // plus the received-text carrier and the channel, each a strict-object member
    expect(src).toMatch(/\btext: Text\b/);
    expect(src).toMatch(/\bchannel: AccessChannelSchema\b/);
  });

  it("only the one presentation form over the one projection form exists: no scene, mode, register, Glance/Focus/Depth, setup, observer or broadcast form is representable", () => {
    expect(contracts.PRESENTATION_NPK_EVENT_SIGNAL).toBe("NPK_EVENT_SIGNAL");
    expect(contracts.PROJECTION_EVENT_SIGNAL).toBe("EVENT_SIGNAL");
    for (const form of [
      "GLANCE",
      "FOCUS",
      "DEPTH",
      "SETUP",
      "OBSERVER",
      "BROADCAST",
      "REPORT",
      "SCENE",
    ])
      expect(
        contracts.EventSignalPresentationSchema.safeParse({
          presentation: contracts.PRESENTATION_NPK_EVENT_SIGNAL,
          disposable: true,
          form,
          viewpoint: { role: "role.player_character", entity_id: "pc" },
          elements: [
            { element: "CONTACT", channel: "SPEECH" },
            { element: "REFERENT", text: "r" },
            { element: "CONTENT", text: "c" },
          ],
        }).success,
        form,
      ).toBe(false);
  });

  it("the presenter introduces no authored string: the module's code contains no string literal beyond the contract's own constants and structural tags", () => {
    const literals = [...code(MODULE).matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);
    expect([...new Set(literals)].sort()).toEqual(
      ["CONTACT", "CONTENT", "PRESENTED_ATTRIBUTION", "REFERENT", "@immortalis/contracts"].sort(),
    );
  });

  it("the presentation never names comprehension, belief, memory, recall, decision, emotion, urgency, interpretation, mode or register as content or behavior", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    for (const word of [
      "comprehen",
      "belief",
      "believ",
      "recall",
      "memor",
      "inference",
      "interpret",
      "emotion",
      "decision",
      "urgen",
      "motive",
      "register",
      "mode",
      "cadence",
      "narrat",
      "dialogue",
      "scene",
    ])
      expect(src.toLowerCase(), word).not.toContain(word);
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no protocol/MCP/host exposure beyond the one thirty-seventh-slice read, NPK scene generation, memory, natural-language input, goal routing, setup/observer projection, PRA, provider, deployment, migration, PF-6/F-028 or Causal Draw change", () => {
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    for (const absent of [
      "migrations/manifests/presentation.json",
      "migrations/manifests/projection.json",
      "packages/engine/src/npk",
      "packages/engine/src/memory",
      "packages/engine/src/host",
    ])
      expect(existsSync(absent), absent).toBe(false);
    const specifiers = [...readFileSync(MODULE, "utf8").matchAll(/from "([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const spec of specifiers)
      expect(spec).not.toMatch(
        /causal-draw|pc-capability|actor\/|population|economy|logistics|production|kti|gip|diplomacy|epistemic|temporal|persistence|projection/,
      );
    for (const f of readdirSync("packages/engine/src/causal-draw"))
      expect(readFileSync(`packages/engine/src/causal-draw/${f}`, "utf8")).not.toMatch(
        /presentEventSignal|EventSignalPresentation/,
      );
  });

  it("the presentation is neither a protocol nor a host surface itself (the thirty-seventh slice's separate protocol module consumes it): the module names no tool, endpoint, session or authentication", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /\bmcp\b|\bendpoint\b|\bsession\b|\bauth\w*\b|\btoken\b|\btool\b|\bcampaignId\b/i,
    );
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it("IA-17 gained narrowly scoped partial evidence naming the presentation tests and what is not implemented, and stayed NOT_IMPLEMENTED with no full evidence", () => {
    const row = register.find((r) => r.id === "IA-17")!;
    expect(row.status).toBe("NOT_IMPLEMENTED");
    expect(row.evidence).toBeNull();
    const scope = row.partial_evidence!.scope;
    expect(scope).toMatch(/Event-Signal Projection/);
    expect(scope).toMatch(/NPK \/ IM-14 presentation/);
    expect(scope).toMatch(/Not implemented/);
    expect(scope).toMatch(/general NPK scene generation/);
    expect(row.partial_evidence!.tests).toEqual(
      expect.arrayContaining([
        "tests/contract/npk-event-signal-presentation-schemas.test.ts",
        "tests/unit/npk-event-signal-presentation.test.ts",
        "tests/integration/npk-event-signal-presentation.test.ts",
        "tests/security/npk-event-signal-presentation-security.test.ts",
        "tests/conformance/npk-event-signal-presentation-conformance.test.ts",
        "tests/integration/i001-event-signal-projection.test.ts",
      ]),
    );
    for (const t of row.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
  });

  it("every other open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive; IA-07/IA-24/IA-27 stay BLOCKED", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });
});
