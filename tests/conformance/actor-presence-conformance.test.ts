/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with arbitrary lock and fact values */
// R1 Stage-One v1.1 — conformance: the three presence-chain kinds are exactly the frozen lowering (owner, facet, lifecycle, key
// space, governing citation), nothing outside it was built (no operator command, no adapter, no movement), the F-027 lock records
// the section-scoped design lineage and the executable lowering SEPARATELY from each other and from the 23 frozen pins (which are
// byte-unchanged), and the checker enforces that distinction. MECHANISM ONLY: no perception, faculty, Health or W2 evidence.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  worldSetupClosureKey,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  WORLD_ACTOR_PRESENCE_FACT_KINDS,
  WORLD_ACTOR_PRESENCE_FACT_KIND_IDS,
  WORLD_ACTOR_PRESENCE_RULE,
  resolveKey,
} from "@immortalis/engine";
import {
  REQUIRED_DESIGN_LINEAGE,
  REQUIRED_EXECUTABLE_LOWERINGS,
  checkSpec,
} from "../../tools/check-spec.ts";
import { tempDir } from "../support/tmp.ts";

const rawLock = readFileSync("spec/f027/spec-lock.json", "utf8");
const lock = JSON.parse(rawLock) as Record<string, any>;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex");

describe("the three kinds are exactly the frozen lowering", () => {
  it("one SEALED B1, one SEALED closure and one ADVANCING B2, all World-State fallback-custodian kinds with no new owner or facet", () => {
    expect(WORLD_ACTOR_PRESENCE_FACT_KIND_IDS).toEqual([
      "actor_setup_placement",
      "world_setup_closure",
      "actor_physical_presence",
    ]);
    expect(WORLD_ACTOR_PRESENCE_FACT_KINDS.map((k) => [k.id, k.lifecycle])).toEqual([
      ["actor_setup_placement", "SEALED"],
      ["world_setup_closure", "SEALED"],
      ["actor_physical_presence", "ADVANCING"],
    ]);
    for (const k of WORLD_ACTOR_PRESENCE_FACT_KINDS) {
      expect(k.owner).toBe("world_state");
      expect(k.facet).toBe("world_fallback_physical_entity");
      expect(k.im).toBe("IM-03");
      expect(k.rc).toEqual(["RC-02"]);
      expect(k.rule).toBe(WORLD_ACTOR_PRESENCE_RULE);
      expect(ALL_FACT_KINDS).toContain(k);
    }
    expect(
      ALL_FACT_KINDS.filter((k) => k.owner === "world_state").map((k) => k.facet),
    ).not.toContain("actor_presence");
  });

  it("each key space is exact, disjoint from every other registered key space, and actor-only where ratified", () => {
    expect(actorSetupPlacementKey("a1")).toBe("world-state/actor/a1/setup-placement");
    expect(worldSetupClosureKey("w1")).toBe("world/w1/setup-closure");
    expect(actorPhysicalPresenceKey("a1")).toBe("world-state/actor/a1/presence");
    for (const [key, id] of [
      [actorSetupPlacementKey("a1"), "actor_setup_placement"],
      [worldSetupClosureKey("w1"), "world_setup_closure"],
      [actorPhysicalPresenceKey("a1"), "actor_physical_presence"],
    ] as const) {
      expect(resolveKey(key)!.kind.id).toBe(id);
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
    }
    // a world-scoped or owner-suffixed presence key is no key of this build
    expect(resolveKey("world-state/world/w1/actor/a1/presence")).toBeNull();
    expect(resolveKey("world-state/actor/a1/presence/owner-slot")).toBeNull();
  });

  it("the governing citation is the existing World Generation section with the R1 lineage cited as NOT a spec-lock pin, and moves no pin", () => {
    const text = WORLD_ACTOR_PRESENCE_RULE.authority_lineage.join("\n");
    expect(text).toContain("NOT as a spec-lock pin");
    expect(text).toContain("2026-10-23T09:27:39.157Z");
    expect(WORLD_ACTOR_PRESENCE_RULE.artifact).toBe(
      lock.frozen_sources.find((s: any) => s.id === "WG").url,
    );
    expect(WORLD_ACTOR_PRESENCE_RULE.native_pin).toBe(
      lock.frozen_sources.find((s: any) => s.id === "WG").native_pin,
    );
  });
});

describe("nothing outside the frozen lowering was built", () => {
  it("no operator command, no adapter and no movement, Health, sensory or Temporal-setup producer exists for the chain", () => {
    const tree = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? tree(join(dir, e.name)) : [join(dir, e.name)],
      );
    const operator = tree("packages/operator/src").join("\n");
    expect(operator).not.toMatch(/presence|setup-placement|setup-closure/);
    const world = readdirSync("packages/engine/src/world");
    expect(world.filter((f) => /presence|setup/.test(f)).sort()).toEqual([
      "actor-presence-integrity.ts",
      "actor-presence.ts",
      "setup-eligibility.ts",
    ]);
    const source = ["actor-presence.ts", "actor-presence-integrity.ts", "setup-eligibility.ts"]
      .map((f) => readFileSync(join("packages/engine/src/world", f), "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source).not.toMatch(/\b(health|hearing|acoustic|sensory|faculty)\b/i);
    expect(source).not.toMatch(/\bNAMED_ACTOR\b/);
  });

  it("the actor-observation derivation still reads the coupling statement: B2 is a prerequisite, not yet its premise (H1 stays STOP)", () => {
    const derive = readFileSync("packages/engine/src/referee/derive.ts", "utf8");
    expect(derive).not.toContain("actor_physical_presence");
    expect(derive).not.toContain("actorPhysicalPresenceKey");
  });
});

describe("the F-027 lock: design lineage and executable lowering, apart from the frozen pins", () => {
  it("every pre-existing section of the lock is byte-unchanged: the 23 frozen pins, the addendum, the tranches, the governance references", () => {
    expect(lock.frozen_sources).toHaveLength(23);
    expect(sha(lock.frozen_sources)).toBe(
      "d12a4d73380f75d2594ed8aacf77ad6eb85d7679a235f37faa4412810d075de7",
    );
    expect(sha(lock.implementation_authority_addenda)).toBe(
      "ce239277c9b628cc1cc6f9394d7f580f0f09a253a238c7c2bda1b16081b6df90",
    );
    expect(sha(lock.governance_references)).toBe(
      "84a2f5e5e58656f5aaf4ecce562fbc25f37a435d27908d75d94ca34c86ef869d",
    );
    expect(sha(lock.incorporated_tranches)).toBe(
      "81733ab63be5c3c445f9de40483886c648a789fa665c53a427ee2cbb449fbe24",
    );
    expect(sha(lock.package)).toBe(
      "8e2c1555138454b2e43959746cf958c9e37b82e9c0b3796ab13c7a70a03daed4",
    );
    expect(sha(lock.snapshot_files)).toBe(
      "5923b3c7062a5e5247a8d2193d4d155ddd43f324c3d0591f1c304a297c8f7cc0",
    );
    expect(sha(lock.source_validation)).toBe(
      "cc6c7979eb4d40c94e050e1c39bae09d33d43066525b2bc76fef8d239a99f806",
    );
    expect(lock.implementation_authority_addenda.map((a: any) => a.id)).toEqual(["F-027-CD1"]);
  });

  it("the design lineage is ratified-not-executable, supersedes and narrows nothing, and restates no frozen pin", () => {
    const entries: any[] = lock.design_lineage_successors;
    expect(entries.map((e) => e.id).sort()).toEqual(Object.keys(REQUIRED_DESIGN_LINEAGE).sort());
    for (const e of entries) {
      expect(e.status).toBe("DESIGN_RATIFIED");
      expect(e.executable).toBe(false);
      expect(e.narrows_frozen_pin).toBe(false);
      expect(e.supersedes).toBeNull();
      expect(e.superseded_by).toBeNull();
      expect(e.sections.length).toBeGreaterThan(0);
      const frozen = lock.frozen_sources.find((s: any) => s.id === e.of_frozen_source);
      if (frozen) {
        expect(frozen.url).toBe(e.url);
        expect(frozen.native_pin).not.toBe(e.native_pin);
      }
    }
  });

  it("the 8 October frozen contract is cited as lineage only: its page id is a non-executable design row, its own native pins appear nowhere, and it is in no frozen source or addendum", () => {
    const id = "3f320af901e08166ad96ca0fc5e5069d";
    expect(JSON.stringify(lock.frozen_sources)).not.toContain(id);
    expect(JSON.stringify(lock.implementation_authority_addenda)).not.toContain(id);
    expect(JSON.stringify(lock.executable_lowerings)).not.toContain(id);
    const rows = lock.design_lineage_successors.filter((e: any) => e.url.includes(id));
    expect(rows.map((e: any) => e.id)).toEqual(["R1-PC-CUSTODY-LINEAGE"]);
    expect(rows[0].of_frozen_source).toBeNull();
    expect(rows[0].sections).toEqual([
      "R1 Stage-One v1.1 Ratified Handover Exclusion Overlay \u2014 23 October 2026",
    ]);
    for (const pin of ["2026-10-08T01:25:36.611Z", "2026-10-08T01:30:19.780Z"])
      expect(rawLock).not.toContain(pin);
  });

  it("the executable lowering composes with F-027, cites exactly the lineage it lowers and names exactly the three kinds", () => {
    const [low] = lock.executable_lowerings as any[];
    expect(lock.executable_lowerings).toHaveLength(1);
    expect(low.id).toBe("R1-STAGE-ONE-V1.1-LOWERING");
    expect(low.executable).toBe(true);
    expect(low.relation).toBe("COMPOSES_WITH");
    expect(low.supersedes).toBeNull();
    expect(low.superseded_by).toBeNull();
    expect(low.native_pin).toBe("2026-10-23T09:27:39.157Z");
    expect(low.fact_kinds).toEqual([...WORLD_ACTOR_PRESENCE_FACT_KIND_IDS]);
    expect(low.cites_design_lineage).toEqual(Object.keys(REQUIRED_DESIGN_LINEAGE));
    expect(low.cites_design_lineage.every((id: string) => id in REQUIRED_DESIGN_LINEAGE)).toBe(
      true,
    );
    expect(Object.keys(REQUIRED_EXECUTABLE_LOWERINGS)).toEqual([low.id]);
    // the implementation-authority-addendum slot is not reused to imply partial-source executable authority
    expect(JSON.stringify(lock.implementation_authority_addenda)).not.toContain("R1-");
  });

  it("the checker accepts the lock and rejects each way of blurring the distinction", () => {
    expect(checkSpec(".")).toEqual([]);
    const mutate = (edit: (l: any) => void): string[] => {
      const root = tempDir("immortalis-lock-");
      for (const rel of [
        "spec/f027/spec-lock.json",
        "spec/f027/runtime-contract.md",
        "spec/f027/acceptance-register.yaml",
        "spec/f027/open-gates.yaml",
        "packages/contracts/src/spec-identity.ts",
      ]) {
        mkdirSync(join(root, rel, ".."), { recursive: true });
        cpSync(rel, join(root, rel));
      }
      const l = JSON.parse(readFileSync(join(root, "spec/f027/spec-lock.json"), "utf8"));
      edit(l);
      writeFileSync(join(root, "spec/f027/spec-lock.json"), JSON.stringify(l, null, 2) + "\n");
      return checkSpec(root);
    };
    const has = (errors: string[], text: RegExp) => expect(errors.join("\n")).toMatch(text);
    has(
      mutate((l) => (l.design_lineage_successors[0].executable = true)),
      /never executable/,
    );
    has(
      mutate((l) => (l.design_lineage_successors[0].narrows_frozen_pin = true)),
      /may not supersede or narrow/,
    );
    has(
      mutate((l) => (l.design_lineage_successors[0].supersedes = "WG")),
      /may not supersede or narrow/,
    );
    has(
      mutate((l) => (l.design_lineage_successors[0].native_pin = "2026-01-01T00:00:00.000Z")),
      /pinned at exactly/,
    );
    has(
      mutate((l) => l.design_lineage_successors.pop()),
      /appears 0 times/,
    );
    has(
      mutate((l) =>
        l.design_lineage_successors.push({ ...l.design_lineage_successors[0], id: "R1-OTHER" }),
      ),
      /unexpected design lineage/,
    );
    has(
      mutate(
        (l) =>
          (l.design_lineage_successors[0].native_pin = l.frozen_sources.find(
            (s: any) => s.id === "WG",
          ).native_pin),
      ),
      /pinned at exactly|restate the frozen pin/,
    );
    has(
      mutate((l) => (l.executable_lowerings[0].fact_kinds = ["actor_physical_presence"])),
      /exactly its fact kinds/,
    );
    has(
      mutate((l) => l.executable_lowerings[0].cites_design_lineage.pop()),
      /exactly the design lineage/,
    );
    has(
      mutate((l) => (l.executable_lowerings[0].supersedes = "F-027")),
      /COMPOSE with F-027/,
    );
    has(
      mutate((l) => (l.executable_lowerings[0].composed_with.package_native_pin = "x")),
      /package version and native pin/,
    );
    has(
      mutate((l) => delete l.executable_lowerings),
      /appears 0 times/,
    );
    // the fourth lineage row (the PC-custody handover-exclusion overlay): missing, mispinned, executable, superseding/narrowing, promoted
    const pc = (l: any) =>
      l.design_lineage_successors.find((e: any) => e.id === "R1-PC-CUSTODY-LINEAGE");
    has(
      mutate(
        (l) =>
          (l.design_lineage_successors = l.design_lineage_successors.filter(
            (e: any) => e.id !== "R1-PC-CUSTODY-LINEAGE",
          )),
      ),
      /R1-PC-CUSTODY-LINEAGE appears 0 times/,
    );
    has(
      mutate((l) => (pc(l).native_pin = "2026-10-08T01:25:36.611Z")),
      /R1-PC-CUSTODY-LINEAGE must be pinned at exactly/,
    );
    has(
      mutate((l) => (pc(l).executable = true)),
      /R1-PC-CUSTODY-LINEAGE is DESIGN_RATIFIED and never executable/,
    );
    has(
      mutate((l) => (pc(l).status = "FROZEN_EXECUTABLE_LOWERING")),
      /R1-PC-CUSTODY-LINEAGE is DESIGN_RATIFIED and never executable/,
    );
    has(
      mutate((l) => (pc(l).narrows_frozen_pin = true)),
      /R1-PC-CUSTODY-LINEAGE may not supersede or narrow/,
    );
    has(
      mutate((l) => (pc(l).superseded_by = "x")),
      /R1-PC-CUSTODY-LINEAGE may not supersede or narrow/,
    );
    has(
      mutate((l) => (pc(l).of_frozen_source = "WG")),
      /R1-PC-CUSTODY-LINEAGE extends null/,
    );
    has(
      mutate((l) => (pc(l).sections = [])),
      /R1-PC-CUSTODY-LINEAGE must list its 1 exact section/,
    );
    has(
      mutate((l) =>
        l.frozen_sources.push({ id: "PC-CUSTODY", url: pc(l).url, native_pin: pc(l).native_pin }),
      ),
      /may not be promoted into the frozen sources/,
    );
    has(
      mutate((l) =>
        l.implementation_authority_addenda.push({
          ...l.implementation_authority_addenda[0],
          id: "X",
          url: pc(l).url,
        }),
      ),
      /may not be promoted into the implementation authority addenda/,
    );
    has(
      mutate((l) => l.executable_lowerings[0].cites_design_lineage.pop()),
      /exactly the design lineage/,
    );
    // reusing the closed addendum slot for the new authority is refused
    has(
      mutate((l) => l.implementation_authority_addenda.push({ id: "R1-STAGE-ONE-V1.1-LOWERING" })),
      /unexpected implementation authority addendum/,
    );
  });

  it("nothing else in the repository's spec evidence moved: register and gates are byte-unchanged", () => {
    expect(existsSync("spec/f027/acceptance-register.yaml")).toBe(true);
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });
});
