// Conformance evidence for the F-027-CD1 Causal Draw foundation (twenty-sixth slice). Each block names its register ID;
// governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with the F-027-CD1 v1.0 addendum, exact pin
// 2026-10-02T15:11:03.450Z). The register rows stay NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers
// only the aspects it names, and every other F-027 open gate is unchanged.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  CAUSAL_DRAW_FACT_KINDS,
  CAUSAL_DRAW_RULE,
  CausalDrawAdapter,
  COMPATIBLE_RUNTIME_CONTRACT_SHA256S,
  F027_CD1_SOURCE,
  NamedActorAdapter,
} from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY, CAUSAL_DRAW_REFUSAL_CODES } from "@immortalis/contracts";
import { actorPublication, capabilityBasis, createInMemoryCampaign } from "@immortalis/testkit";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedAdapterMethods, expectedKindIds } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { checkSpec, REQUIRED_ADDENDA } from "../../tools/check-spec.ts";

const DRAW_DIR = "packages/engine/src/causal-draw";
const DRAW_SOURCES = [
  ...readdirSync(DRAW_DIR).map((f) => join(DRAW_DIR, f)),
  "packages/contracts/src/causal-draw.ts",
];
const addendum = (
  lock as unknown as { implementation_authority_addenda: Record<string, unknown>[] }
).implementation_authority_addenda.find((a) => a["id"] === "F-027-CD1")!;
const CLEARED_PIN = "2026-10-02T15:11:03.450Z";
const CD1_URL = "https://app.notion.com/p/3ed20af901e08176abe1c203943294b1";

describe("IA-01 source/version fidelity: F-027-CD1 is reconciled into the spec lock as a COMPOSING authority", () => {
  it("the lock pins the addendum at exactly the cleared native pin, composed with F-027 v1.0 and superseding nothing", () => {
    expect(addendum).toBeDefined();
    expect(addendum["url"]).toBe(CD1_URL);
    expect(addendum["native_pin"]).toBe(CLEARED_PIN);
    expect(addendum["version"]).toBe("v1.0");
    expect(addendum["relation"]).toBe("COMPOSES_WITH");
    expect(addendum["supersedes"]).toBeNull();
    expect(addendum["superseded_by"]).toBeNull();
    expect(addendum["composed_with"]).toEqual({
      id: "F-027",
      version: "v1.0",
      package_native_pin: "2026-09-29T00:40:44.707Z",
    });
    expect(addendum["review"]).toEqual({
      kind: "independent Red delta review",
      verdict: "PASS",
      scope: "this exact native pin",
      unchanged_since_clearance: true,
    });
    expect(REQUIRED_ADDENDA).toEqual({ "F-027-CD1": CLEARED_PIN });
    expect(lock).toHaveProperty("implementation_authority_addenda");
    expect(
      (lock as unknown as { implementation_authority_addenda: unknown[] })
        .implementation_authority_addenda,
    ).toHaveLength(1);
  });

  it("historical F-027 v1.0 is untouched: the package pin, all 23 frozen-source pins, the tranches and the references are exactly as before", () => {
    const raw = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8"));
    expect(raw.package.native_pin).toBe("2026-09-29T00:40:44.707Z");
    expect(raw.package.version).toBe("v1.0");
    expect(raw.supersedes).toBeNull();
    expect(raw.superseded_by).toBeNull();
    expect(lock.frozen_sources).toHaveLength(23);
    expect(lock.incorporated_tranches.map((t) => t.native_pin)).toEqual([
      "2026-09-29T00:09:56.571Z",
      "2026-09-29T00:33:04.009Z",
    ]);
    expect(lock.governance_references.map((t) => t.native_pin)).toEqual([
      "2026-09-29T00:50:15.564Z",
      "2026-09-29T03:32:40.491Z",
      "2026-09-27T07:27:48.079Z",
      "2026-09-25T08:21:22.816Z",
      "2026-09-17T02:57:25.703Z",
    ]);
    expect(lock.frozen_sources.find((s) => s.id === "WS-016")!.native_pin).toBe(
      "2026-09-24T17:38:59.210Z",
    );
  });

  it("the Runtime Contract snapshot is unchanged, so its compatibility key is unchanged and existing saves still load; the open-gates snapshot is unchanged", () => {
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(COMPATIBLE_RUNTIME_CONTRACT_SHA256S).toContain(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(BUILD_SPEC_IDENTITY.snapshot_files).toEqual(lock.snapshot_files);
  });

  it("the generated build spec identity mirrors the reconciled lock, and the repository spec check passes", () => {
    const raw = readFileSync("spec/f027/spec-lock.json", "utf8").replace(/\r\n/g, "\n");
    expect(BUILD_SPEC_IDENTITY.spec_lock_sha256).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
    expect(checkSpec(".")).toEqual([]);
  });

  it("the Causal Draw kinds are governed by exactly the pinned F-027-CD1 SourceRef, which supersedes nothing", () => {
    expect(F027_CD1_SOURCE).toEqual({
      artifact: addendum["url"],
      native_pin: addendum["native_pin"],
    });
    for (const kind of CAUSAL_DRAW_FACT_KINDS) {
      expect(kind.rule).toBe(CAUSAL_DRAW_RULE);
      expect(kind.rule.artifact).toBe(CD1_URL);
      expect(kind.rule.native_pin).toBe(CLEARED_PIN);
      expect(kind.rule.supersedes).toBeNull();
      expect(kind.rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(kind.im).toBe("IM-12");
    }
    const lineage = CAUSAL_DRAW_RULE.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-29T00:40:44.707Z"); // F-027 package, composed with, not replaced
    expect(lineage).toContain("3ea20af901e081bc9c55d2c5a49cf639");
    expect(lineage).toContain(CLEARED_PIN);
    for (const c of [
      "§3",
      "§4 CDK-01",
      "§5 CDK-02",
      "§7 CDS-02",
      "§8 CDR-01",
      "§9 CDE-01",
      "§10 CDP-01",
      "§11 CDA-01",
      "§12 CDO-01",
      "§13 CDC-01",
      "§14 CDR-02",
      "§15 CDV-01",
    ]) {
      expect(CAUSAL_DRAW_RULE.clause, c).toContain(c);
    }
  });
});

describe("IA-03 owner exclusivity: an infrastructure-only owner, not a substantive world owner", () => {
  it("registers exactly two kinds, one owner and one facet, and nothing else changes owner", () => {
    expect(CAUSAL_DRAW_FACT_KINDS.map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "causal_draw_kernel" }),
    );
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "causal_draw_kernel")).toHaveLength(2);
    expect([...CANONICAL_OWNER_REGISTRY.get("causal_draw_kernel")!]).toEqual(["draw_provenance"]);
    expect(
      ALL_FACT_KINDS.filter((k) => k.facet === "draw_provenance").every(
        (k) => k.owner === "causal_draw_kernel" && k.lifecycle === "SEALED",
      ),
    ).toBe(true);
  });

  it("the adapter's whole public surface is one operation and two typed reads: no writer for a precommit, a result, a seed, or a re-draw", () => {
    expect(adapterMethods(CausalDrawAdapter)).toEqual(expectedAdapterMethods("CausalDrawAdapter"));
    expect(expectedAdapterMethods("CausalDrawAdapter")).toEqual(["draw", "precommit", "result"]);
  });

  it("no other owner module knows the Causal Draw layer: the temporal coordinator and every owner path except the Named-Actor consumer (WS-016 CD-CC-01) are unchanged in this respect", () => {
    const owners = [
      "diplomacy",
      "economy",
      "epistemic",
      "gip",
      "kti",
      "logistics",
      "population",
      "production",
      "temporal",
    ];
    for (const dir of owners) {
      for (const f of readdirSync(`packages/engine/src/${dir}`)) {
        expect(code(`packages/engine/src/${dir}/${f}`), `${dir}/${f}`).not.toMatch(
          /causal-draw|CausalDraw|causal_draw|cdraw/,
        );
      }
    }
    // the shared layer is wired in exactly two seams: admission dispatch and the integrity composition
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(/causalDrawGroupCheck/);
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyCausalDrawIntegrity/,
    );
  });
});

describe("IA-02 neutrality: the layer selects an opaque candidate id and defines nothing else", () => {
  it("no candidate meaning, causal weighting, grade, rarity, EX, capability, world effect or owner-specific stochastic rule exists in the modules", () => {
    for (const f of DRAW_SOURCES) {
      const text = code(f).toLowerCase();
      for (const word of [
        "grade",
        "rarity",
        "capability",
        "potential",
        "named_actor",
        "namedactor",
        "world_state",
        "temporal",
        "hazard",
        "episode",
        "epistemic",
        "kti",
        "population",
        "d20",
        "2d10",
        "1-10",
        "10000",
        "binomial",
        "calibrat",
        "modifier",
      ]) {
        expect(text, `${f}: ${word}`).not.toContain(word);
      }
    }
  });

  it("no module writes a substantive value: the adapter writes only its own two record kinds", () => {
    const adapter = code(`${DRAW_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter.match(/causalDraw(Precommit|Result)Key\(/g)!.length).toBeGreaterThan(0);
    expect(adapter).not.toMatch(
      /prospective_result_id\s*[,}]\s*value|getFact\(prior\.normalized\.draw_key\.prospective_result_id\)/,
    );
    // the substantive slot is reached only through the injected typed interface
    expect(adapter).toMatch(/inspectResultSlot\(/);
  });
});

describe("IA-06/IA-30 reuse, not fork: one journal, one canon", () => {
  it("the modules touch no filesystem, journal, package, store implementation, queue or sidecar", () => {
    for (const f of DRAW_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|writeFile|appendFile|readFile|createWriteStream|journal\.jsonl|FilePackage|openFileCampaign|createFileCampaign|manifest/,
      );
      expect(text, f).not.toMatch(/from "\.\.\/persistence\/(file-package|fs-ops)\.ts"/);
    }
    expect(code(`${DRAW_DIR}/adapter.ts`)).toMatch(/from "\.\.\/persistence\/store\.ts"/);
  });

  it("holds no mutable module state beyond the two weak per-store reconciliation registers", () => {
    for (const f of DRAW_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    const adapter = code(`${DRAW_DIR}/adapter.ts`);
    expect(adapter.match(/^const \w+ = new Weak(Set|Map)/gm)).toHaveLength(2);
  });
});

describe("CDE-01: no clock, no process or request identity, no Math.random, no fallback entropy", () => {
  const forbidden =
    /\b(Math\.random|Date\.now|new Date|performance\.now|process\.hrtime|process\.pid|randomUUID|randomInt|setInterval|setTimeout|setImmediate|getRandomValues|crypto\.subtle|uuid)\b/;

  it("the modules contain none of them, and the only entropy primitive is node:crypto randomBytes in ports.ts", () => {
    for (const f of DRAW_SOURCES) {
      expect(code(f), f).not.toMatch(forbidden);
      const hasRandomBytes = /\brandomBytes\b/.test(code(f));
      expect(hasRandomBytes, f).toBe(f.endsWith("/ports.ts"));
    }
  });

  it("entropy is obtained in exactly one place, inside the new-draw step, after the input proof and the algorithm and unknown-outcome gates", () => {
    const adapter = code(`${DRAW_DIR}/adapter.ts`);
    expect(adapter.match(/this\.#entropy\(/g)).toHaveLength(1);
    const precommit = adapter.slice(adapter.indexOf("async #precommit("));
    const at = (needle: string) => precommit.indexOf(needle);
    expect(at("this.#algorithms.get")).toBeGreaterThan(-1);
    expect(at("this.#algorithms.get")).toBeLessThan(at("unreconciledDraws.get"));
    expect(at("unreconciledDraws.get")).toBeLessThan(at("this.#entropy("));
    expect(at("this.#entropy(")).toBeLessThan(at("isEffectiveForPriorCreation"));
    expect(at("isEffectiveForPriorCreation")).toBeLessThan(at("this.#proveInputs("));
    expect(at("this.#proveInputs(")).toBeLessThan(at("this.#publish("));
    // an entropy source that fails or short-delivers is a refusal, never a substitution
    expect(adapter).toMatch(/DRAW_ENTROPY_UNAVAILABLE/);
    expect(code(`${DRAW_DIR}/ports.ts`)).toMatch(
      /operatingSystemEntropy: EntropySource = \(bytes\) => randomBytes\(bytes\)/,
    );
  });
});

describe("CDR-01: the gate order is the order of the operation", () => {
  it("draw() applies authority precondition, structural validation, normalization, result replay, slot check, resume, input proof, and only then the precommit", () => {
    const adapter = code(`${DRAW_DIR}/adapter.ts`);
    const draw = adapter.slice(adapter.indexOf("async draw("), adapter.indexOf("  result(\n"));
    const order = [
      "AuthoritySchema.safeParse",
      "validateSpecification(",
      "preparePrior(",
      "causalDrawResultKey(digest)",
      "this.#replay(",
      "this.#checkSlot(",
      "this.#resume(prior, committedPrecommit",
      "this.#proveInputs(",
      "this.#precommit(prior)",
    ].map((n) => draw.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the result publication path never calls the rule-currency seam or the input proof (CDO-01)", () => {
    const adapter = code(`${DRAW_DIR}/adapter.ts`);
    const resume = adapter.slice(
      adapter.indexOf("async #resume("),
      adapter.indexOf("#proveInputs(refs"),
    );
    expect(resume).not.toMatch(/isEffectiveForPriorCreation|#proveInputs|#entropy/);
  });

  it("every refusal code the addendum names is a member of the contract vocabulary, and the draw never invents a fallback candidate", () => {
    for (const c of [
      "DRAW_INPUT_INVALID",
      "DRAW_CANDIDATE_DUPLICATE",
      "DRAW_CANDIDATE_SET_EMPTY",
      "DRAW_NOT_REQUIRED_SINGLETON",
      "DRAW_IDENTITY_CONFLICT",
      "DRAW_STATE_CONFLICT",
      "DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED",
      "DRAW_INPUT_REF_UNRESOLVED",
      "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
      "DRAW_ENTROPY_UNAVAILABLE",
      "DRAW_OWNER_RULE_STALE_AT_PRECOMMIT",
      "DRAW_ALGORITHM_UNSUPPORTED",
    ]) {
      expect(CAUSAL_DRAW_REFUSAL_CODES as readonly string[]).toContain(c);
    }
    expect(code(`${DRAW_DIR}/adapter.ts`)).not.toMatch(
      /default[A-Z]\w*Candidate|fallbackCandidate|candidates\[0\]/,
    );
  });
});

describe("CDA-01: the algorithm's literal specification", () => {
  it("uses HMAC-SHA-256 keyed by the raw seed over the exact message form, with no float and no other randomness", () => {
    const sampler = code(`${DRAW_DIR}/sampler.ts`);
    expect(sampler).toContain('createHmac("sha256", seed)');
    expect(sampler).toContain("IMMORTALIS-CDRAW-WEIGHTED-FINITE-V1");
    expect(sampler).toContain(
      "${MESSAGE_PREFIX}|${input.draw_key_digest}|${input.spec_digest}|${attempt.toString()}|${j}",
    );
    // the only Math use is the byte count of an integer bit length; weights are BigInt end to end
    expect(sampler).not.toMatch(/Math\.random|parseFloat|parseInt|toFixed|\bNumber\(/);
    expect(sampler).toContain("BigInt(c.weight)");
    expect(sampler.match(/createHmac\(/g)).toHaveLength(1);
  });
});

describe("explicit exclusions: nothing outside the bounded slice was implemented or enabled", () => {
  it("WS-016 BOUNDED_PRIOR_RANDOMIZED is made only through the Named-Actor owner's own draw-backed operation: the plain establishment path refuses it and writes nothing", async () => {
    const store = createInMemoryCampaign({
      campaignId: "c-ws016",
      owners: CANONICAL_OWNER_REGISTRY,
    });
    const before = store.head().journal_entries;
    const basis = capabilityBasis("actor-smith", "capability-metalworking");
    const r = await new NamedActorAdapter(store).establishCapabilityBasis({
      ...actorPublication(1),
      capability: {
        ...basis,
        establishment: { method: "BOUNDED_PRIOR_RANDOMIZED", causes: basis.establishment.causes },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error.code).toBe("INPUT_INVALID");
    expect(store.head().journal_entries).toBe(before);
    expect(code("packages/engine/src/actor/adapter.ts")).toContain(
      "establishRandomizedCapabilityBasis",
    );
    // the neutral layer names no consumer: the dependency runs from the Named-Actor owner to Causal Draw, never back
    for (const f of DRAW_SOURCES) expect(code(f), f).not.toMatch(/named_actor|NamedActor|actor\//);
  });

  it("Legacy L-29, L-30 and L-31 remain Requires Decision; no gate is resolved, closed or passed", () => {
    for (const id of ["L-29", "L-30", "L-31"]) {
      expect(gates.find((g) => g.id === id)!.status, id).toBe("REQUIRES_DECISION");
    }
    expect(gates.filter((g) => /^(PASS|RESOLVED|CLOSED)/.test(g.status))).toEqual([]);
    expect(gates.find((g) => g.id === "PF-6/F-028")).toBeDefined();
    expect(gates.find((g) => g.id === "PROVIDER")).toBeDefined();
  });

  it("no register row is PASS or FAIL; IA-07 stays BLOCKED; the Causal Draw evidence is recorded as partial evidence only", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(register.find((r) => r.id === "IA-07")!.status).toBe("BLOCKED");
    const tests = [
      "tests/unit/causal-draw-canon.test.ts",
      "tests/unit/causal-draw-prior.test.ts",
      "tests/unit/causal-draw-sampler.test.ts",
      "tests/contract/causal-draw-schemas.test.ts",
      "tests/integration/causal-draw-foundation.test.ts",
      "tests/integration/causal-draw-enforcement.test.ts",
      "tests/integration/causal-draw-recovery.test.ts",
      "tests/conformance/causal-draw-conformance.test.ts",
    ];
    const ia30 = register.find((r) => r.id === "IA-30")!;
    expect(ia30.status).toBe("NOT_IMPLEMENTED");
    for (const t of tests) expect(ia30.partial_evidence!.tests, t).toContain(t);
    expect(ia30.partial_evidence!.scope).toContain("Causal Draw");
    for (const id of ["IA-01", "IA-02", "IA-03", "IA-06", "IA-30"]) {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.partial_evidence!.scope).toContain("F-027-CD1");
    }
  });

  it("no Temporal-specific stochastic mechanic, provider adoption or generic RNG service exists: the temporal modules never name a draw, and the layer exports no `random`/`rng` facility", () => {
    for (const f of readdirSync("packages/engine/src/temporal")) {
      expect(code(`packages/engine/src/temporal/${f}`), f).not.toMatch(
        /draw|entropy|seed|stochastic/i,
      );
    }
    for (const f of DRAW_SOURCES) {
      expect(code(f), f).not.toMatch(
        /\bexport (async )?(function|const|class) (random\w*|rng\w*|roll\w*|rollDie|nextRandom)\b/i,
      );
    }
    expect(DRAW_SOURCES.filter((f) => /provider|adopt/i.test(code(f)))).toEqual([]);
  });
});
