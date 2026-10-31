// PR91 BLUE HOLD composition: readable review adaptation and exact private binding recovery; frozen owners/source locks unchanged.
// Conformance evidence for the Source-Qualified Local Corridor and Logistics Read slice (World-State `world_corridor`,
// `LogisticsAdapter.commitCorridorMovement`, @immortalis/operator `establish-corridor`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T13:47:37.910Z) on main
// 9f7a8f425a296784a2460c6f68eb4f4e6f502e7a. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds one
// World-State topology kind under the existing owner and facet, one optional Logistics commitment pin, one operator command, tests and a
// document: no owner, facet, source pin, gate, status, temporal coordinator, delivery/retirement stage, entity-transition module or
// Logistics stage provider moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommitCorridorMovementInputSchema,
  CommitMovementInputSchema,
  EstablishCorridorInputSchema,
  FACET_LOGISTICS_STATE,
  FACET_WORLD_LOCUS,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  corridorOfInput,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  LogisticsAdapter,
  WORLD_CORRIDOR_FACT_KIND_IDS,
  WORLD_CORRIDOR_RULE,
  factKind,
} from "@immortalis/engine";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/world-corridor-logistics-read-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const gitBlob = (file: string) => {
  const body = readFileSync(file);
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
};

/** Everything the slice composes or must leave untouched, exactly as it stood at main 9f7a8f425a296784a2460c6f68eb4f4e6f502e7a. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/entity-transition.ts":
    "81228ad6d9b7000e9508b08e78c4ac96112cf64501c6487bd82328f6b08bbd6d",
  "packages/engine/src/logistics/provider.ts":
    "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  "packages/engine/src/logistics/declaration.ts":
    "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  "packages/engine/src/logistics/locus.ts":
    "c265b8c99bd4f1345a9d8346d258de6149d071d73de0cd05aad26f80a3848038",
  "packages/engine/src/temporal/coordinator.ts":
    "5bdbc6cbf4cb4cc9a01f11f009ecc0767ac75d0e8373974ed09bd465a8febdd1",
  "packages/engine/src/world/entity-transition.ts":
    "6eba3057099b2d331e4f846498bb9d3f6275fdabf1c76c23ed267795aa809e2b",
  "packages/operator/src/locality.ts":
    "808a3e0329822ef6085e48f7db02a7354d25995d7e1b24a7d8f1a90f7a8c6c2a",
  "packages/operator/src/commands.ts":
    "f14467cae3334d2f13f65ab9b941a7f66b889d157779a7afad53e09eb6baa8af",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/additional-locality.ts":
    "5f1fea4718c816d755c086d2cfef6bffdbfdad62e3ac2f2935ba54e94bf4c782",
  "packages/operator/src/additional-source.ts":
    "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
};

describe("nothing outside the corridor and its one consumer is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, World-State contracts, the temporal coordinator, the delivery/retirement providers, the temporal declaration, the locus resolver, the ECT-01 seam and the session are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("d63ccd859f6f2da1728ee13c6d25b062804f3293");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(/corridor|establish-corridor/);
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the temporal coordinator never names a corridor or Logistics, and the Logistics stage providers never read one", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(/orridor|ogistics/);
    expect(code("packages/engine/src/logistics/provider.ts")).not.toMatch(/orridor/);
    expect(code("packages/engine/src/logistics/declaration.ts")).not.toMatch(/orridor/);
    expect(code("packages/engine/src/logistics/locus.ts")).not.toMatch(/orridor/);
  });
});

describe("the corridor reuses the existing World-State owner and facet and adds no owner", () => {
  it("is one sealed kind of the existing owner and the existing locus facet, and World-State registers exactly its previous facets", () => {
    expect(WORLD_CORRIDOR_FACT_KIND_IDS).toEqual(["world_corridor"]);
    const kind = factKind("world_corridor");
    expect(kind.owner).toBe(OWNER_WORLD_STATE);
    expect(kind.facet).toBe(FACET_WORLD_LOCUS);
    expect(kind.lifecycle).toBe("SEALED");
    expect(kind.rule).toBe(WORLD_CORRIDOR_RULE);
    expect([...CANONICAL_OWNER_REGISTRY.get(OWNER_WORLD_STATE)!].sort()).toEqual(
      [
        "world_fallback_physical_entity",
        "world_locus",
        "world_profile",
        "world_scene_closure",
        "world_source_condition",
      ].sort(),
    );
    // exactly one kind was added to the registry (no owner, facet, route family, hub or carrier kind)
    expect(ALL_FACT_KINDS.filter((k) => /corridor/.test(k.id)).map((k) => k.id)).toEqual([
      "world_corridor",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => /route|carrier|(^|_)hub(_|$)/.test(k.id))).toEqual([]);
  });

  it("cites the frozen WG clauses and WS-010 / F-014B, at the lock's pins, and the construction brief only as a construction source", () => {
    const rule = WORLD_CORRIDOR_RULE;
    expect(rule.artifact).toBe("https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d");
    expect(rule.native_pin).toBe("2026-09-25T13:44:22.668Z");
    expect(rule.clause).toContain("Edge / Corridor State");
    expect(rule.clause).toContain("Geography / Traversal");
    expect(rule.clause).toContain("Ownership Guards");
    const lineage = rule.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-25T02:18:10.619Z"); // WS-010
    expect(lineage).toContain("2026-09-25T23:42:29.547Z"); // F-014B
    expect(lineage).toContain("2026-10-22T13:47:37.910Z"); // the brief
    expect(lineage).toContain("NOT a spec-lock pin");
  });

  it("the value has exactly the world, the two endpoints and the statement: nothing the source did not state", () => {
    const keys = (c: object) => Object.keys(c).sort();
    expect(
      keys(
        corridorOfInput({
          world_id: "w",
          from_locus_id: "a",
          to_locus_id: "b",
          statement: "s",
        }),
      ),
    ).toEqual(["from", "statement", "to", "world"]);
    expect(Object.keys(EstablishCorridorInputSchema.shape).sort()).toEqual(
      ["from_locus_id", "statement", "to_locus_id", "world_id"].sort(),
    );
  });
});

describe("the Logistics consumer is separate, additive and bounded", () => {
  it("adds exactly one authored method beside the unchanged ones, and no setter, cancel, reroute, delivery or retirement writer", () => {
    const methods = Object.getOwnPropertyNames(LogisticsAdapter.prototype).sort();
    expect(methods).toEqual(
      [
        "commitCorridorMovement",
        "commitMovement",
        "commitment",
        "constructor",
        "currentLocus",
        "delivery",
        "dispatch",
        "transfer",
      ].sort(),
    );
  });

  it("the foundation input and every fixed literal of the commitment are unchanged; the corridor pin is optional", () => {
    expect(Object.keys(CommitMovementInputSchema.shape).sort()).toEqual(
      ["delivery_at", "request_key"].sort(),
    );
    expect(Object.keys(CommitCorridorMovementInputSchema.shape).sort()).toEqual(
      ["corridor_key", "delivery_at", "request_key"].sort(),
    );
    const text = readFileSync("packages/contracts/src/logistics.ts", "utf8");
    expect(text).toContain('service_basis: z.literal("NON_AGENTIVE_SINGLE_LEG_UNCONTENDED")');
    expect(text).toContain('release_condition: z.literal("AFTER_DESTINATION_OWNER_COMMIT")');
    expect(text).toContain("corridor: CorridorPin.optional()");
    expect(OWNER_LOGISTICS).toBe("logistics");
    expect(FACET_LOGISTICS_STATE).toBe("logistics_state");
  });

  it("invents no route, path, duration, speed, capacity, access, clock, tick, RNG, scan or calibration", () => {
    for (const file of [
      "packages/contracts/src/world-corridor.ts",
      "packages/engine/src/world/corridor.ts",
      "packages/operator/src/corridor.ts",
    ]) {
      const src = code(file);
      expect(src, file).not.toMatch(
        /Date\.now|new Date|Math\.random|randomBytes|setTimeout|setInterval|performance\.now|listFacts\(\)\.filter|pathfind|shortest|dijkstra|travel_duration|speed:|capacity:/,
      );
    }
    const derive = code("packages/engine/src/logistics/derive.ts");
    expect(derive).not.toMatch(/Date\.now|new Date|Math\.random|pathfind|shortest/);
    // the corridor read is by key: Logistics never lists or scans for a corridor
    const adapter = code("packages/engine/src/logistics/adapter.ts");
    expect(adapter).not.toMatch(/listFacts\(/);
  });
});

describe("the command reuses the existing owner operation and adds no surface", () => {
  const src = code("packages/operator/src/corridor.ts");

  it("composes the existing session, confirmation and locality reads and the one corridor owner operation", () => {
    expect(src).toContain("establishCorridor(");
    expect(src).toContain("LocalOperatorSession.open(");
    expect(src).toContain("requestOperatorConfirmation(");
    expect(src).toContain("establishedLocality(");
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("owns no movement, request, Logistics, time or actor surface", () => {
    expect(src).not.toMatch(
      /PcMovement|Temporal|ActorState|handoverExistingActor|LogisticsAdapter|commitMovement|MovementServiceRequest/,
    );
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishCorridor).toBe("function");
    expect(typeof operator.readCorridorFile).toBe("function");
    expect(typeof operator.corridorId).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-corridor --campaign <dir>");
    expect(operator.USAGE).toContain("--corridor-file <file>");
    expect(operator.USAGE).toContain("docs/world-corridor-logistics-read-foundation.md");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T13:47:37.910Z");
    expect(doc).toContain("9f7a8f425a296784a2460c6f68eb4f4e6f502e7a");
    expect(doc).toContain("d63ccd859f6f2da1728ee13c6d25b062804f3293");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no route calibration, travel time, access, delivery, original-PC travel or actor agreement", () => {
    expect(doc).toContain(
      "It is not original-PC travel, general pathfinding, route or time calibration",
    );
    expect(doc).toContain("The corridor **supplies no duration or boundary**");
    expect(doc).toContain("The active PC is moved by this path only by its own PC-owned request");
    expect(doc).toContain(
      "Original-PC travel, which needs its own movement admission, identity and authority, is still not provided",
    );
    expect(doc).toContain("the source corridor is not an answer to any of those later results");
  });
  it("leaves PR #72 and PR #73 untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched");
  });
});
