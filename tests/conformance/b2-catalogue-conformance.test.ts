/* eslint-disable @typescript-eslint/no-explicit-any -- manifests are read as plain JSON */
// F-014B B2-T08 — the all-enrolled static catalogue after B2: deterministic regeneration, retained archives untouched, the two added kinds enumerated
// with their source metadata, and DEFAULT-DENY never relaxed. CONFORMANCE ONLY: this judges the generated census and the generator's drift detection;
// it grants no §10 disposition, installs no positive GM evaluator and relabels nothing.
//
// The falsifiers call the generator's own exported `checkDrift` against private copies of the manifest tree that are corrupted in one way each.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CURRENT_MODULE,
  MANIFEST_DIR,
  REPO_ROOT,
  checkDrift,
  currentModuleText,
  generate,
  retainedDigests,
  type Generated,
} from "../../tools/gen-gm-wait-catalogue.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { tempDir } from "../support/tmp.ts";

const OLD_V2 = "e9049723f8b217d0557bcd4dcbfd126a58cb9777b82663e5c6f17a6842510500";
const B2_CATALOGUE = "7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed";
const OLD_V1 = "f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062";
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const read = (digest: string) => readFileSync(join(REPO_ROOT, MANIFEST_DIR, `${digest}.json`));
const NEW_KINDS = ["temporal_gm_wait_marker", "temporal_gm_wait_pc_index"];

let g: Generated;
beforeAll(async () => {
  g = await generate();
}, 120_000);

describe("B2-T08 regeneration and the retained archives", () => {
  it("[control] the exact generator --check passes on the committed tree: the manifest, the archives and the current-digest module are the census", () => {
    expect(checkDrift(g)).toEqual([]);
    expect(g.digest).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(sha256(read(g.digest))).toBe(g.digest);
  });
  it("the digest CHANGED (a policy and registration drift happened) and BOTH prior manifests are retained byte-for-byte: their raw SHA-256 is still their own digest", () => {
    expect(g.digest).not.toBe(OLD_V2);
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toEqual(
      expect.arrayContaining([OLD_V1, OLD_V2, g.digest]),
    );
    expect(retainedDigests().sort()).toEqual([...GM_WAIT_CATALOGUE_RETAINED_SHA256].sort());
    for (const digest of GM_WAIT_CATALOGUE_RETAINED_SHA256)
      expect(sha256(read(digest)), digest).toBe(digest);
    expect(sha256(read(OLD_V1))).toBe(OLD_V1);
    expect(sha256(read(OLD_V2))).toBe(OLD_V2);
    expect(read(OLD_V1).length).toBe(330227);
    expect(read(OLD_V2).length).toBe(381298);
  });
});

describe("B2-T08 what changed in the census, exactly", () => {
  const manifest = (digest: string): any => JSON.parse(read(digest).toString("utf8"));
  const prior = () => manifest(OLD_V2);
  const now = () => manifest(B2_CATALOGUE);

  it("the registry gained EXACTLY the two Temporal kinds, enumerated with their owner, facet, lifecycle, key grammar, RC/IM lineage and a registered source rule", () => {
    const before: any[] = prior().kinds;
    const after: any[] = now().kinds;
    expect(after.length).toBe(before.length + 2);
    const added = after.filter((k) => !before.some((b) => b.id === k.id));
    expect(added.map((k) => k.id).sort()).toEqual(NEW_KINDS);
    for (const k of added) {
      expect(k.owner).toBe("temporal_kernel");
      expect(k.facet).toBe("temporal_coordination");
      expect(k.im).toBe("IM-02");
      expect(k.rc).toEqual(["RC-02", "RC-05", "RC-07"]);
      expect(k.value_schema_fp).toMatch(/^[0-9a-f]{64}$/);
      expect(k.disposition).toBe("UNDECLARED");
      const rule = now().rules.find((r: any) => r.rule_id === k.rule_ref);
      expect(rule, `${k.id} cites a registered rule`).toBeDefined();
      expect(JSON.stringify(rule.source_ref)).toContain("42020af901e081f69ab3e6c32e4f19e7");
      expect(JSON.stringify(rule.source_ref)).toContain("2026-11-22T13:06:43.623Z");
    }
    const byId = (id: string) => added.find((k) => k.id === id);
    expect(byId("temporal_gm_wait_marker").lifecycle).toBe("SEALED");
    expect(byId("temporal_gm_wait_marker").key_pattern.source).toContain("[0-9a-f]{64}");
    expect(byId("temporal_gm_wait_pc_index").lifecycle).toBe("ADVANCING");
  });

  it("nothing else was reclassified: every other kind entry is unchanged except the two whose VALUE contract widened to admit the strict GM variant", () => {
    const before = new Map<string, any>(prior().kinds.map((k: any) => [k.id, k]));
    const changed: string[] = [];
    for (const k of now().kinds) {
      if (NEW_KINDS.includes(k.id)) continue;
      if (JSON.stringify(k) !== JSON.stringify(before.get(k.id))) changed.push(k.id);
    }
    expect(changed.sort()).toEqual(["resolution_transaction", "temporal_transaction_authority"]);
    const auth = now().kinds.find((k: any) => k.id === "temporal_transaction_authority");
    expect(auth.alternate_refs.length).toBe(
      before.get("temporal_transaction_authority").alternate_refs.length + 1,
    );
    // the legacy citation of both is the same rule as before: no historical reinterpretation
    for (const id of changed)
      expect(now().kinds.find((k: any) => k.id === id).rule_ref).toBe(before.get(id).rule_ref);
  });

  it("DEFAULT DENY is intact: every kind and provider is UNDECLARED, the evaluator is NONE, live admission is not installed, and no §10 class or epistemic default moved", () => {
    const m = now();
    expect(m.kinds.every((k: any) => k.disposition === "UNDECLARED")).toBe(true);
    expect(m.providers.every((p: any) => p.disposition === "UNDECLARED")).toBe(true);
    expect(m.policy.default_disposition).toBe("UNDECLARED");
    expect(m.policy.evaluator).toEqual({ id: "NONE_SECTION_10_NOT_ACCEPTED" });
    expect(m.policy.live_admission).toEqual({ id: "NOT_INSTALLED_NO_GM_WRITER" });
    expect(m.policy.epistemic).toBe("ACTIONABLE_OR_UNSAFE");
    // every policy member except the historical-verification identity and the per-file source-policy digests is exactly the prior one
    const strip = (p: any) => {
      const { historical_verification: _h, source_policy: _s, ...rest } = p;
      void _h;
      void _s;
      return rest;
    };
    expect(strip(m.policy)).toEqual(strip(prior().policy));
    // the source policy covers the same files by the same algorithm; only files B2 itself changed (or added) carry another digest, and no
    // app, operator or protocol source is among them
    const sp = (p: any) =>
      new Map<string, string>(p.source_policy.files.map((f: any) => [f.path, f.sha256]));
    const [was, is] = [sp(prior().policy), sp(m.policy)];
    expect(m.policy.source_policy.algorithm).toBe(prior().policy.source_policy.algorithm);
    expect(m.policy.source_policy.unproven_declarations).toEqual(
      prior().policy.source_policy.unproven_declarations,
    );
    for (const path of was.keys()) expect(is.has(path), `${path} stays covered`).toBe(true);
    const moved = [...is.keys()].filter((path) => was.get(path) !== is.get(path));
    for (const path of moved)
      expect(
        path.startsWith("packages/engine/src/") || path.startsWith("packages/contracts/src/"),
        `${path} changed in the source policy`,
      ).toBe(true);
    // the providers, sites, closes, triggers, routes and culture route are untouched: B2 registered no provider and no Close
    for (const part of [
      "providers",
      "closes",
      "event_triggers",
      "object_routes",
      "sites",
      "culture_route",
      "unresolved_declarations",
    ])
      expect(m[part], part).toEqual(prior()[part]);
  });

  it("the historical-verification identity gained exactly the W2 custody segment, and the extension census still records the extension owner-verification as SKIPPED", () => {
    const m = now();
    expect(m.policy.historical_verification.canonical_id).toContain("GM-WAIT-W2-CUSTODY-V1");
    expect(
      m.policy.historical_verification.canonical_id.startsWith(
        prior().policy.historical_verification.canonical_id,
      ),
    ).toBe(true);
    expect(m.extension_dispatch.historical_verification_of_extension_groups).toBe("SKIPPED");
    expect(m.extension_dispatch.extension_owners).toEqual([]);
    expect(m.extension_dispatch.historical_coverage).toBe("UNRETIRED_DENY");
  });
});

describe("B2-T08 the generator's drift detection is falsifiable (private copies, one corruption each)", () => {
  /** a private repo-shaped root holding the committed manifests and current-digest module */
  const root = (): string => {
    const dir = tempDir("b2-catalogue-");
    mkdirSync(join(dir, MANIFEST_DIR), { recursive: true });
    cpSync(join(REPO_ROOT, MANIFEST_DIR), join(dir, MANIFEST_DIR), { recursive: true });
    mkdirSync(join(dir, CURRENT_MODULE, ".."), { recursive: true });
    writeFileSync(join(dir, CURRENT_MODULE), readFileSync(join(REPO_ROOT, CURRENT_MODULE)));
    return dir;
  };
  const locs = (dir: string) => ({
    root: dir,
    manifestDir: MANIFEST_DIR,
    currentModule: CURRENT_MODULE,
  });

  it("[control] an untouched copy has no drift", () => {
    expect(checkDrift(g, locs(root()))).toEqual([]);
  });
  it("a manual edit of the current digest (the module names the PRIOR manifest again) is drift", () => {
    const dir = root();
    writeFileSync(join(dir, CURRENT_MODULE), currentModuleText(OLD_V2, retainedDigests(dir)));
    expect(checkDrift(g, locs(dir)).join("\n")).toMatch(/not the current-digest module/);
  });
  it("a manifest that was not regenerated after a policy change (the new digest has no retained manifest) is drift", () => {
    const dir = root();
    rmSync(join(dir, MANIFEST_DIR, `${g.digest}.json`));
    expect(checkDrift(g, locs(dir)).join("\n")).toMatch(/no retained manifest/);
  });
  it("a tampered current manifest is drift", () => {
    const dir = root();
    const p = join(dir, MANIFEST_DIR, `${g.digest}.json`);
    writeFileSync(p, readFileSync(p, "utf8").replace('"UNDECLARED"', '"SAFE"'));
    expect(checkDrift(g, locs(dir)).join("\n")).toMatch(/bytes differ/);
  });
  it("a tampered ARCHIVE, a forged extra manifest and a missing v1 archive are each drift", () => {
    const tampered = root();
    const p = join(tampered, MANIFEST_DIR, `${OLD_V2}.json`);
    writeFileSync(p, readFileSync(p, "utf8").replace('"UNDECLARED"', '"SAFE"'));
    expect(checkDrift(g, locs(tampered)).join("\n")).toMatch(
      new RegExp(`invalid retained manifest ${OLD_V2}`),
    );

    const forged = root();
    writeFileSync(join(forged, MANIFEST_DIR, `${"0".repeat(64)}.json`), "{}");
    expect(checkDrift(g, locs(forged)).join("\n")).toMatch(/invalid retained manifest 0{64}/);

    const missing = root();
    rmSync(join(missing, MANIFEST_DIR, `${OLD_V1}.json`));
    expect(checkDrift(g, locs(missing)).join("\n")).toMatch(/missing required v1 archive/);
    expect(readdirSync(join(missing, MANIFEST_DIR)).sort()).toEqual(
      GM_WAIT_CATALOGUE_RETAINED_SHA256.filter((digest) => digest !== OLD_V1)
        .map((digest) => digest + ".json")
        .sort(),
    );
  });
});
