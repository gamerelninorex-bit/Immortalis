// Conformance evidence for the I-001 Active-PC Event-Signal Projection Foundation (thirty-fifth bounded slice, IM-13 / RC-14).
// Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). IA-13 and IA-17 stay
// NOT_IMPLEMENTED (see `partial_evidence`): this slice covers only the aspects they name, and every other F-027 open gate is
// unchanged. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as engine from "@immortalis/engine";
import * as contracts from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";

const MODULE = "packages/engine/src/projection/event-signal.ts";
const CONTRACT = "packages/contracts/src/projection.ts";
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

describe("IA-01 source/version fidelity (I-001 projection aspect)", () => {
  it("I-001, F-014D and the Canonical Role Registry are the exact spec-locked pins the slice rests on, and I-001's primary IM is IM-13", () => {
    const i001 = lock.frozen_sources.find((s) => s.id === "I-001")!;
    expect(i001.native_pin).toBe("2026-09-25T00:17:49.551Z");
    expect(i001.primary_im).toBe("IM-13");
    expect(i001.url).toBe("https://app.notion.com/p/3e220af901e081c6b0f2edcfefe9e4d2");
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    expect(f014d.native_pin).toBe("2026-09-24T16:25:17.059Z");
    const registry = lock.governance_references.find(
      (g) => g.title === "Canonical Role Registry v1",
    )!;
    expect(registry.native_pin).toBe("2026-09-25T08:21:22.816Z");
    const f014b = lock.frozen_sources.find((s) => s.id === "F-014B")!;
    expect(f014b.native_pin).toBe("2026-09-25T23:42:29.547Z");
    // the contract documents the sources it rests on, at those pins
    const text = readFileSync(CONTRACT, "utf8");
    for (const pin of [i001.native_pin, f014d.native_pin, registry.native_pin])
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
    expect(rc).toMatch(/IM-13 Projection \/ Player Interface/);
  });
});

describe("IA-03 owner exclusivity: the projection adds no owner, facet, key space, fact kind, adapter or writer", () => {
  it("the projection module is one pure function file: no class, no adapter, no owner operation, no registry entry", () => {
    expect(readdirSync("packages/engine/src/projection")).toEqual(["event-signal.ts"]);
    expect(
      Object.keys(engine)
        .filter((k) => /Projection|EventSignal|EVENT_SIGNAL/i.test(k))
        .sort(),
    ).toEqual([
      "EVENT_SIGNAL_DERIVATION_STEPS",
      "deriveEventSignalProjection",
      "traceEventSignalDerivation",
    ]);
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/\bclass\b/);
    expect(src).not.toMatch(/\bregisterOwner|FACT_KINDS|factKind|StageProvider|OwnerFact\s*=\s*\{/);
    // the owner registry, key spaces and kinds are unchanged: the central surface oracle compares them; this asserts the
    // projection contributes none
    expect(readFileSync("packages/engine/src/owners/registry.ts", "utf8")).not.toMatch(
      /EventSignal|deriveEventSignalProjection/,
    );
  });

  it("the projection's only capability is a read: no store write, adapter, coordinator, scan, clock, randomness or I/O is imported or named", () => {
    const src = identifiers(MODULE);
    for (const forbidden of [
      /\bcommit\b/,
      /\bregisterObject\b/,
      /\badvance\b/,
      /\bcontinueRemainder\b/,
      /\bestablish[A-Z]\w*\b/,
      /\blistFacts\b/,
      /\bDate\b/,
      /\bMath\.random\b/,
      /\brandom\w*\b/i,
      /\bcrypto\b/,
      /\bsetTimeout\b|\bsetInterval\b/,
      /\bprocess\b|\bfs\b|\bfetch\b/,
      /\bCanonicalCampaign\b|\bTemporalCoordinator\b|\bEpistemicAccessAdapter\b/,
    ])
      expect(src, String(forbidden)).not.toMatch(forbidden);
    const imports = [...readFileSync(MODULE, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(
      [
        "../epistemic/derive.ts",
        "../hash.ts",
        "../persistence/store.ts",
        "../temporal/identity.ts",
        "@immortalis/contracts",
      ].sort(),
    );
    expect(readFileSync(MODULE, "utf8")).toMatch(
      /Pick<CampaignStore, "getFact" \| "committedGroup">/,
    );
  });

  it("the derivation has one fixed control-flow shape: no branch, early return or throw between its steps, and every declared step is executed through the one step helper", () => {
    const text = identifiers(MODULE);
    const body = text.slice(text.indexOf("function run("));
    expect(body).not.toMatch(/\bif\s*\(|\bswitch\b|\bfor\s*\(|\bwhile\s*\(|\bthrow\b/);
    expect(body).not.toMatch(/return unavailable\(\)/);
    expect(body.match(/\breturn step\(/g)).toHaveLength(1);
    const src = readFileSync(MODULE, "utf8");
    for (const name of engine.EVENT_SIGNAL_DERIVATION_STEPS)
      expect(src.match(new RegExp(`step(?:<[^"]*>)?\\(\\s*"${name}"`, "g")), name).toHaveLength(1);
  });

  it("no predecessor owner logic names the projection: Epistemic, Temporal and PC modules are unchanged in behavior", () => {
    for (const dir of ["epistemic", "temporal", "pc-capability", "actor", "world"])
      for (const f of readdirSync(`packages/engine/src/${dir}`).filter((n) => n.endsWith(".ts")))
        expect(code(`packages/engine/src/${dir}/${f}`), `${dir}/${f}`).not.toMatch(
          /EventSignal|deriveEventSignalProjection|PROJECTION_/,
        );
  });
});

describe("IA-13 / IA-17 the projection contract has no field for sealed, hidden, cognitive or presentational content", () => {
  it("the contract module names no engine reference, hidden-state label, cognition, memory, urgency, time coordinate or prose field", () => {
    const src = identifiers(CONTRACT);
    const fields = [...src.matchAll(/\b([a-z_]+):/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(
      [
        "channel",
        "contact",
        "content",
        "disposable",
        "entity_id",
        "event_id",
        "payload",
        "presented_attribution",
        "projection",
        "recipient_id",
        "referent",
        "role",
        "viewpoint",
      ].sort(),
    );
  });

  it("only the one projection form exists: no Glance/Focus/Depth/setup/observer/broadcast form is representable", () => {
    expect(contracts.PROJECTION_EVENT_SIGNAL).toBe("EVENT_SIGNAL");
    for (const form of ["GLANCE", "FOCUS", "DEPTH", "SETUP", "OBSERVER", "BROADCAST", "REPORT"])
      expect(
        contracts.EventSignalProjectionSchema.safeParse({
          projection: form,
          disposable: true,
          viewpoint: { role: "role.player_character", entity_id: "pc" },
          contact: { channel: "SPEECH" },
          payload: { referent: "r", content: "c" },
          presented_attribution: null,
        }).success,
        form,
      ).toBe(false);
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no NPK/presentation, protocol/MCP, natural-language input, goal routing, setup projection, PRA, cognition, memory, broadcast, provider, deployment, migration, PF-6 or Causal Draw change", () => {
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
    for (const absent of [
      "migrations/manifests/projection.json",
      "packages/engine/src/presentation",
      "packages/engine/src/npk",
      "packages/engine/src/memory",
    ])
      expect(existsSync(absent), absent).toBe(false);
    const specifiers = [...readFileSync(MODULE, "utf8").matchAll(/from "([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const spec of specifiers)
      expect(spec).not.toMatch(
        /causal-draw|pc-capability|actor\/|population|economy|logistics|production|kti|gip|diplomacy/,
      );
    expect(
      readdirSync("packages/engine/src/causal-draw").every(
        (f) =>
          !/EventSignal|projection/i.test(
            readFileSync(`packages/engine/src/causal-draw/${f}`, "utf8"),
          ),
      ),
    ).toBe(true);
  });

  it("the projection never names comprehension, belief, memory, recall, decision, emotion or action as content or behavior", () => {
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
    ])
      expect(src.toLowerCase(), word).not.toContain(word);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-13", "IA-17"])(
    "%s gained narrowly scoped partial evidence naming the projection tests, names what is not implemented, and stayed NOT_IMPLEMENTED",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      const scope = row.partial_evidence!.scope;
      expect(scope).toMatch(/Event-Signal Projection/);
      expect(scope).toMatch(/Not implemented/);
      expect(scope).toMatch(/Glance\/Focus\/Depth|NPK/);
      expect(row.partial_evidence!.tests).toEqual(
        expect.arrayContaining([
          "tests/contract/i001-event-signal-schemas.test.ts",
          "tests/unit/i001-event-signal-projection.test.ts",
          "tests/unit/i001-event-signal-shape.test.ts",
          "tests/integration/i001-event-signal-projection.test.ts",
          "tests/security/i001-event-signal-security.test.ts",
          "tests/conformance/i001-event-signal-conformance.test.ts",
        ]),
      );
    },
  );

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
