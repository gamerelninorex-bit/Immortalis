// F-014B B1 S2 - the census: the GM-wait catalogue measured from the ACTUAL registry, provider and extension declarations by two independent
// methods (runtime reflection and a TypeScript-compiler AST scan), the retained manifest bytes and their custody, and the adversarial additions
// BLUE requires (an added dormant provider, a late extension, a missing branch, policy drift). MECHANISM ONLY, NON-WRITING: every entry is
// UNDECLARED and no capability is classified safe.
//
// Non-tautology rules: the counts and the independent id list come from sources the helper does not use (the Codex census, the `*_FACT_KIND_IDS`
// arrays read by an AST, the repo's own directory listing); every negative is a perturbation the test builds (an in-memory overlay, a throwaway
// directory, a mutated manifest) and the helper never receives the expected violation.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import {
  catalogueCanonicalBytes,
  catalogueCoverageViolations,
  catalogueDigest,
  staticVerdict,
  validateManifest,
  verifySuppliedDigest,
  type GmWaitCatalogueManifest,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  ADOPTED_INPUTS,
  MANIFEST_DIR,
  REPO_ROOT,
  assertAdoptedInputsVerified,
  buildCensus,
  buildManifest,
  checkDrift,
  generate,
  scanAst,
  readSourceFiles,
  AST_ROOTS,
} from "../../tools/gen-gm-wait-catalogue.ts";
import { canonicalAdmission } from "../../packages/engine/src/owners/admission.ts";
import { storeBindings } from "../../packages/engine/src/owners/extension.ts";
import { clone } from "../support/b1-s2s3-fixtures.ts";

vi.setConfig({ testTimeout: 30_000 });

const base = await generate();
const census = await buildCensus();
const manifest = base.manifest;
const text = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");
const violationsOf = (c: typeof census, m: GmWaitCatalogueManifest = manifest): string[] =>
  catalogueCoverageViolations(c, m).map((v) => `${v.code}:${v.key}`);

describe("[S2] [mechanism only] the census agrees with the registry, with the Codex census and with the retained manifest", () => {
  it("[S2] [mechanism only] the manifest covers its own census exactly and is well formed", () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(violationsOf(census)).toEqual([]);
  });

  it("[S2] [mechanism only] the kind, owner, owner-facet and lifecycle counts equal the Codex census, recounted from the manifest alone", () => {
    // 124 = the Codex census's 122 plus the two Temporal kinds F-014B B2 registered (temporal_gm_wait_marker, SEALED, and
    // temporal_gm_wait_pc_index, ADVANCING): the B1 archive keeps the Codex figures byte-for-byte (tests/conformance/b2-catalogue-conformance.test.ts)
    expect(manifest.kinds.length).toBe(124);
    expect(new Set(manifest.kinds.map((k) => k.id)).size).toBe(124);
    expect(new Set(manifest.kinds.map((k) => k.owner)).size).toBe(17);
    expect(new Set(manifest.kinds.map((k) => `${k.owner}|${k.facet}`)).size).toBe(37);
    expect(manifest.kinds.filter((k) => k.lifecycle === "SEALED").length).toBe(84);
    expect(manifest.kinds.filter((k) => k.lifecycle === "ADVANCING").length).toBe(40);
    // the owner policy is a second structure (the owner registry) and must agree with the kinds
    const pairs = manifest.policy.owner_policy.owners
      .flatMap((o) => o.facets.map((f) => `${o.owner}|${f}`))
      .sort();
    expect(pairs).toEqual([...new Set(manifest.kinds.map((k) => `${k.owner}|${k.facet}`))].sort());
  });

  it("[S2] [mechanism only] the 124 kind ids equal the union of the string ids declared in the *_FACT_KIND_IDS arrays, read by an AST and not through ALL_FACT_KINDS", () => {
    const ids = new Set<string>();
    for (const f of [
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/ms-setup/rules.ts",
      "packages/contracts/src/initial-locality.ts",
      "packages/contracts/src/ms-setup.ts",
    ]) {
      let src: string;
      try {
        src = text(f);
      } catch {
        continue;
      }
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2023, true);
      const visit = (n: ts.Node): void => {
        if (
          ts.isVariableDeclaration(n) &&
          /FACT_KIND_IDS$/.test(n.name.getText(sf)) &&
          n.initializer
        ) {
          let init: ts.Node = n.initializer;
          if (ts.isAsExpression(init)) init = init.expression;
          if (ts.isArrayLiteralExpression(init))
            for (const e of init.elements) if (ts.isStringLiteral(e)) ids.add(e.text);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect([...ids].sort()).toEqual(manifest.kinds.map((k) => k.id).sort());
  });

  it("[S2] [mechanism only] the registered alternate and legacy rule carriers BLUE names are all present with the expected counts", () => {
    const withAlt = manifest.kinds.filter((k) => k.alternate_refs.length > 0);
    // F-014B B2: the durable opening authority gains ONE alternate (the strict prospective GM variant): 22 carriers, 34 alternates
    expect(withAlt.length).toBe(22);
    expect(manifest.kinds.reduce((n, k) => n + k.alternate_refs.length, 0)).toBe(34);
    expect(manifest.kinds.filter((k) => k.legacy_refs.length > 0).length).toBe(8);
    expect(manifest.kinds.filter((k) => k.later_legacy_refs.length > 0).map((k) => k.id)).toEqual([
      "gip_governance_instrument",
    ]);
    const idsWithAlt = new Set(withAlt.map((k) => k.id));
    for (const k of [
      "player_character_binding",
      "initial_setup_input",
      "initial_locality_completion",
      "actor_setup_placement",
      "production_reserve",
      "economy_request",
      "logistics_commitment",
      "logistics_transfer",
      "temporal_state",
      "referee_decision",
    ])
      expect(idsWithAlt.has(k), k).toBe(true);
  });

  it("[S2] [mechanism only] reflection, the AST declarations and the registration sites agree with each other; the counts are an inspected observation, not a closed set", () => {
    const c = manifest.scope.ast_counts;
    expect(manifest.providers.length).toBe(c.provider_declarations);
    expect(manifest.providers.every((p) => p.found_by.length === 2)).toBe(true);
    expect(manifest.unresolved_declarations).toEqual([]);
    expect(manifest.sites.filter((s) => !s.site_id.includes(":register")).length).toBe(
      c.registry_sites,
    );
    expect(c.register_calls).toBe(
      manifest.sites.filter((s) => s.site_id.includes(":register")).length,
    );
    expect(manifest.sites.some((s) => s.opaque)).toBe(false);
    expect(manifest.closes.length).toBe(c.close_declarations);
    expect(manifest.closes.every((cl) => cl.name_value !== null)).toBe(true);
    expect(manifest.providers.filter((p) => p.event_trigger !== null).length).toBe(
      c.event_trigger_declarations,
    );
    expect(manifest.event_triggers.length).toBe(c.event_trigger_declarations);
    expect(manifest.object_routes.filter((r) => r.kind === "OBJECT_LITERAL").length).toBe(
      c.object_literals,
    );
    expect(manifest.object_routes.filter((r) => r.kind === "REGISTER_OBJECT_CALL").length).toBe(
      c.register_object_calls,
    );
    const produces = manifest.object_routes.filter((r) => r.kind === "PRODUCES_EXPRESSION");
    expect(produces.length).toBe(c.produces_expressions);
    expect(produces.every((r) => r.fp !== null)).toBe(true);
    // every member of every site is a reflected provider (none unresolved)
    const keys = new Set(manifest.providers.map((p) => `${p.owner}|${p.operation}`));
    for (const s of manifest.sites) for (const m of s.members) expect(keys.has(m), m).toBe(true);
  });

  it("[S2] [mechanism only] the registries differ by site, a registered provider names its sites, and a provider in no site is DORMANT", () => {
    const populated = manifest.sites.filter((s) => s.members.length > 0);
    expect(new Set(populated.map((s) => s.members.join(","))).size).toBeGreaterThan(1);
    for (const p of manifest.providers) {
      const inSites = manifest.sites
        .filter((s) => s.members.includes(`${p.owner}|${p.operation}`))
        .map((s) => s.site_id)
        .sort();
      expect(p.site_ids, `${p.owner}|${p.operation}`).toEqual(inSites);
      expect(p.status).toBe(inSites.length > 0 ? "REGISTERED" : "DORMANT");
    }
  });

  it("[S2] [mechanism only] the Culture conditional route is recorded consistently and its declared-close basis is conditional", () => {
    const culture = manifest.providers.find((p) => p.owner === "culture");
    expect(culture).toBeDefined();
    expect(manifest.culture_route.provider).toBe(`${culture?.owner}|${culture?.operation}`);
    expect(manifest.culture_route.provider_registered_in_production).toBe(
      culture?.status === "REGISTERED",
    );
    expect(manifest.culture_route.as_of_now_basis_accepted).toBe(true);
    // the conditional message is the registry-side statement that no producer close is registered for an AS-OF-DECLARED-CLOSE input
    expect(manifest.culture_route.declared_close_basis_message_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[S2] [mechanism only] the provider effect set is a sound upper bound: the kinds of the provider's own owner and facet", () => {
    for (const p of manifest.providers) {
      const own = manifest.kinds
        .filter((k) => k.owner === p.owner && k.facet === p.facet)
        .map((k) => k.id)
        .sort();
      expect(p.effect_kind_ids, `${p.owner}|${p.operation}`).toEqual(own);
    }
  });

  it("[S2] [mechanism only] every entry is UNDECLARED, the Epistemic member stays ACTIONABLE_OR_UNSAFE and the evaluator and live admission are not installed", () => {
    expect(manifest.kinds.every((k) => k.disposition === "UNDECLARED")).toBe(true);
    expect(manifest.providers.every((p) => p.disposition === "UNDECLARED")).toBe(true);
    expect(manifest.policy.epistemic).toBe("ACTIONABLE_OR_UNSAFE");
    expect(manifest.policy.evaluator.id).toBe("NONE_SECTION_10_NOT_ACCEPTED");
    expect(manifest.policy.live_admission.id).toBe("NOT_INSTALLED_NO_GM_WRITER");
    for (const probe of [
      { kind: "temporal_origin" },
      { provider: "gip|gip-expire-instrument-at-sunset" },
      { owner: "epistemic_access" },
    ])
      expect(staticVerdict(manifest, probe)).toMatchObject({
        disposition: "UNDECLARED",
        epistemic: "ACTIONABLE_OR_UNSAFE",
        permits: false,
        coverage: "IN_MANIFEST",
      });
  });
});

describe("[S2] [mechanism only] policy and source pins are bound", () => {
  it("[S2] [mechanism only] the historical-verification identity is the live canonical one and carries the CAL-TIME T-1 and MS v3 segments", () => {
    const hv = manifest.policy.historical_verification;
    expect(hv.canonical_id).toBe(canonicalAdmission.historyVerificationId);
    expect(hv.canonical_id).toContain("CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z");
    expect(hv.canonical_id).toContain("MS-V3-CLOCK-STEP-B2-ORIGIN");
    expect(hv.legacy_contract_suffix).toBe("+LEGACY-PRE-V9-RUNTIME-CONTRACT");
    expect(hv.ms_same_id).toBe(true);
  });

  it("[S2] [mechanism only] the two sources BLUE R-1 names are bound with their exact pins, the T-1 grants and the CAL-TIME ratifications are bound", () => {
    const adopted = manifest.sources.filter((s) => s.origin === "ADOPTED_INPUT");
    expect(adopted.length).toBe(11);
    const t = adopted.find((s) => s.page_uuid === "41a20af9-01e0-811f-9c75-d404f82674cc");
    expect(t).toMatchObject({
      native_pin: "2026-11-16T15:18:44.683Z",
      clauses: ["E0", "E1", "E2", "E3", "E4", "E5", "T0", "T1", "T2", "T3", "T4", "T5"],
      ratification: {
        page_uuid: "41a20af9-01e0-8129-b485-df13b56a38e5",
        native_pin: "2026-11-16T15:29:12.183Z",
      },
    });
    for (const [uuid, pin] of [
      ["41c20af9-01e0-817c-a9e8-dcb392e3b0d7", "2026-11-18T22:23:26.085Z"],
      ["41c20af9-01e0-81ba-9fd4-db4da81c8526", "2026-11-18T22:38:52.341Z"],
      ["41b20af9-01e0-81f3-9e42-d6c9cf596dbb", "2026-11-17T07:32:49.446Z"],
      ["41c20af9-01e0-8183-91bc-cf32042552cb", "2026-11-18T15:23:20.223Z"],
      ["41a20af9-01e0-81ec-bd92-fefe3a524dc4", "2026-11-16T06:58:35.373Z"],
    ])
      expect(
        adopted.some((s) => s.page_uuid === uuid && s.native_pin === pin),
        uuid,
      ).toBe(true);
    // the code-derived sources are the distinct page-at-pin pairs the registered rules name (an observation, regenerated)
    const pages = new Set(
      manifest.rules.map((r) => `${r.source_ref.artifact}|${r.source_ref.native_pin}`),
    );
    expect(manifest.sources.filter((s) => s.origin === "CODE_RULE").length).toBe(pages.size);
  });

  it("[S2] [mechanism only] an adopted input without a native verification at exactly its pin, or with an unlisted ratification, fails the build", () => {
    expect(() => assertAdoptedInputsVerified()).not.toThrow();
    const first = ADOPTED_INPUTS[0] as (typeof ADOPTED_INPUTS)[number];
    const drifted = [
      { ...first, native_pin: "2026-11-16T15:18:44.684Z" },
      ...ADOPTED_INPUTS.slice(1),
    ];
    expect(() => assertAdoptedInputsVerified(drifted)).toThrow(/native verification/);
    const unlisted = [
      {
        ...first,
        ratification: {
          page_uuid: "00000000-0000-4000-8000-0000000000aa",
          native_pin: "2026-11-16T15:29:12.183Z",
        },
      },
      ...ADOPTED_INPUTS.slice(1),
    ];
    expect(() => assertAdoptedInputsVerified(unlisted)).toThrow(/ratification/);
    expect(() => buildManifest(census, drifted)).toThrow();
  });

  it("[S2] [mechanism only] the extension dispatch structure is pinned: nine early returns, the canonical-key guard, and no historical verification of extension groups", () => {
    const returns = scanAst(readSourceFiles(REPO_ROOT, AST_ROOTS).files).extensionReturns;
    expect(returns).toEqual([
      "check: return fence;",
      // F-014B B2 W2: the common GM-wait fence precedes the extension branch, live and in original-policy historical verification
      "check: return w2;",
      "check: return base.check(group, state, history);",
      'check: return reject("KEY_NOT_ADMITTED", "an extension owner may not write a canonical or kernel key space", { key: w.key });',
      "check: return extension.admission?.check(group, state) ?? null;",
      "verifyHistorical: return fence;",
      "verifyHistorical: return w2;",
      "verifyHistorical: return null;",
      "verifyHistorical: return base.verifyHistorical?.(group, state) ?? null;",
    ]);
    expect(manifest.extension_dispatch.early_return_count).toBe(9);
    expect(manifest.extension_dispatch.historical_verification_of_extension_groups).toBe("SKIPPED");
    expect(manifest.extension_dispatch.extension_owners).toEqual([]);
  });
});

describe("[S2] [mechanism only] adversarial additions change the coverage and the digest", () => {
  const providerSource = (
    owner: string,
    operation: string,
    annotate: boolean,
    exportIt: boolean,
  ): string =>
    `${exportIt ? "export " : ""}const zzProvider${annotate ? ": StageProvider" : ""} = {\n` +
    `  owner: "${owner}",\n  facet: "zz_facet",\n  operation: "${operation}",\n` +
    `  rule: { artifact: "https://app.notion.com/p/00000000000040008000000000000009", native_pin: "2026-11-01T00:00:00.000Z", clause: "zz", authority_lineage: ["zz"], effective_basis: "zz", supersedes: null },\n` +
    `  compute() {\n    return [];\n  },\n};\n`;
  const tmpTree = (files: Record<string, string>): { dir: string; done: () => void } => {
    const dir = mkdtempSync(join(tmpdir(), "gm-wait-s2-"));
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
  };

  it("[S2] [mechanism only] an added dormant provider in a new exported module is found by BOTH methods, is not in the manifest, and a regenerated digest differs", async () => {
    const t = tmpTree({ "zz-dormant.ts": providerSource("zz_owner", "zz-dormant-op", true, true) });
    try {
      const c = await buildCensus({ extraRoots: [t.dir] });
      expect(violationsOf(c)).toContain("PROVIDER_NOT_IN_MANIFEST:zz_owner|zz-dormant-op");
      expect(c.providers.find((p) => p.owner === "zz_owner")?.status).toBe("DORMANT");
      const regenerated = await generate({ extraRoots: [t.dir] });
      expect(regenerated.digest).not.toBe(base.digest);
      // the old digest no longer admits a fresh INITIAL once the regenerated manifest is current; without the old bytes it is unknown
      const authority = {
        current: regenerated.digest,
        retained: new Map([
          [regenerated.digest, regenerated.bytes],
          [base.digest, base.bytes],
        ]),
      };
      expect(verifySuppliedDigest(base.digest, authority)).toBe("DIGEST_STALE_RETAINED");
      expect(
        verifySuppliedDigest(base.digest, {
          current: regenerated.digest,
          retained: new Map([[regenerated.digest, regenerated.bytes]]),
        }),
      ).toBe("DIGEST_UNKNOWN");
    } finally {
      t.done();
    }
  });

  it("[S2] [mechanism only] a module-private, un-annotated provider is invisible to reflection but caught by the AST, and denies the coverage", async () => {
    const t = tmpTree({
      "zz-private.ts": providerSource("zz_owner", "zz-private-op", false, false),
    });
    try {
      const c = await buildCensus({ extraRoots: [t.dir] });
      // reflection alone would not have found it: no provider with that operation was reflected
      expect(c.providers.some((p) => p.operation === "zz-private-op")).toBe(false);
      expect(
        violationsOf(c).some((v) =>
          v.startsWith("UNRESOLVED_PROVIDER_DECLARATION:extra:zz-private.ts#zzProvider"),
        ),
      ).toBe(true);
      expect((await generate({ extraRoots: [t.dir] }).catch(() => null))?.digest).not.toBe(
        base.digest,
      );
    } finally {
      t.done();
    }
  });

  it("[S2] [mechanism only] an in-memory un-annotated provider literal is caught by the AST shape rule", async () => {
    const c = await buildCensus({
      overlay: new Map([
        [
          "packages/engine/src/zz-overlay.ts",
          providerSource("zz_owner", "zz-overlay-op", false, false),
        ],
      ]),
    });
    expect(
      violationsOf(c).some((v) =>
        v.startsWith(
          "UNRESOLVED_PROVIDER_DECLARATION:packages/engine/src/zz-overlay.ts#zzProvider",
        ),
      ),
    ).toBe(true);
  });

  it("[S2] [mechanism only] a provider added to an existing registry list changes the site, the provider status and the Culture route", async () => {
    const rel = "packages/protocol/src/pc-transfer-advance.ts";
    const edited = text(rel).replace(
      "new StageProviderRegistry([",
      "new StageProviderRegistry([\n    cultureConventionCloseProvider,",
    );
    expect(edited).not.toBe(text(rel));
    const c = await buildCensus({ overlay: new Map([[rel, edited]]) });
    const v = violationsOf(c);
    expect(v).toContain(`SITE_MEMBERS_CHANGED:${rel}#ownerProviders`);
    expect(v).toContain("PROVIDER_CHANGED:culture|culture-commit-communicative-convention-close");
    expect(v).toContain(
      "CULTURE_ROUTE_CHANGED:culture|culture-commit-communicative-convention-close",
    );
  });

  it("[S2] [mechanism only] a .register call and a non-literal registry argument are opaque registry sites", async () => {
    const withRegister =
      "export function addLate(registry: { register(p: unknown): void }) {\n  registry.register(zzLateProvider);\n}\n";
    const withVariable =
      "export function build(list: never[]) {\n  return new StageProviderRegistry(list);\n}\n";
    const a = await buildCensus({
      overlay: new Map([["packages/engine/src/zz-late.ts", withRegister]]),
    });
    expect(
      violationsOf(a).some((x) =>
        x.startsWith("OPAQUE_REGISTRY_SITE:packages/engine/src/zz-late.ts#addLate:register"),
      ),
    ).toBe(true);
    expect(a.scope.ast_counts.register_calls).toBe(1);
    const b = await buildCensus({
      overlay: new Map([["packages/engine/src/zz-var.ts", withVariable]]),
    });
    expect(
      violationsOf(b).some((x) =>
        x.startsWith("OPAQUE_REGISTRY_SITE:packages/engine/src/zz-var.ts#build"),
      ),
    ).toBe(true);
  });

  it("[S2] [mechanism only] a late extension owner is named by the coverage, while the historical-verification identity does NOT change", async () => {
    const ext = { owners: new Map([["zz_late_ext_owner", new Set(["zz_facet"])]]) };
    const c = await buildCensus({ extension: ext });
    expect(violationsOf(c)).toEqual(["EXTENSION_OWNER_NOT_IN_MANIFEST:zz_late_ext_owner"]);
    // the identity alone is blind to an extension: that is why the coverage compares the owners the bindings expose
    const b = storeBindings(ext);
    expect(b.ok && b.value.admission.historyVerificationId).toBe(
      canonicalAdmission.historyVerificationId,
    );
    expect(b.ok && b.value.owners.size).toBe(18);
    expect((await generate({ extension: ext })).digest).not.toBe(base.digest);
  });

  it("[S2] [mechanism only] an extension that reuses a canonical owner is refused by the bindings, so no census exists for it", async () => {
    await expect(
      buildCensus({ extension: { owners: new Map([["temporal_kernel", new Set(["anything"])]]) } }),
    ).rejects.toThrow(/refused/);
  });

  it("[S2] [mechanism only] a changed early return in the extension routing changes the dispatch structure", async () => {
    const rel = "packages/engine/src/owners/extension.ts";
    const edited = text(rel).replace(
      "if (extension.owners.has(group.owner)) return null;",
      "if (extension.owners.has(group.owner)) return null;\n      if (group.writes.length === 0) return null;",
    );
    expect(edited).not.toBe(text(rel));
    const c = await buildCensus({ overlay: new Map([[rel, edited]]) });
    expect(violationsOf(c)).toContain("EXTENSION_DISPATCH_CHANGED:storeBindings");
  });

  it("[S2] [mechanism only] a renamed declared Close and an added event-trigger declaration are named", async () => {
    const closeRel = "packages/engine/src/kti/declaration.ts";
    const renamed = await buildCensus({
      overlay: new Map([
        [
          closeRel,
          text(closeRel).replace(
            "declares_close: { name: KTI_RESULT_CLOSE }",
            'declares_close: { name: "renamed-close" }',
          ),
        ],
      ]),
    });
    const v = violationsOf(renamed);
    expect(v).toContain('CLOSE_NOT_IN_MANIFEST:"renamed-close"');
    expect(v).toContain("CLOSE_MISSING_FROM_CENSUS:KTI_RESULT_CLOSE");
    const triggerRel = "packages/engine/src/gip/provider.ts";
    const trig = await buildCensus({
      overlay: new Map([
        [triggerRel, `${text(triggerRel)}\nconst zz = { eventTrigger: { kind: "zz" } };\n`],
      ]),
    });
    expect(violationsOf(trig)).toContain("SCOPE_CHANGED:scope");
  });

  it("[S2] [mechanism only] an edit that moves lines or adds comments in a provider file does not change the digest", async () => {
    const rel = "packages/engine/src/gip/provider.ts";
    const moved = `// an unrelated leading comment\n\n\n${text(rel).replace("export const gipSunsetExpiryProvider", "/* a note */\nexport const gipSunsetExpiryProvider")}`;
    expect(moved).not.toBe(text(rel));
    const g = await generate({ overlay: new Map([[rel, moved]]) });
    expect(g.digest).toBe(base.digest);
  });

  it("[S2] [mechanism only] a changed generated-key (produces) path is named, with no change to the counts", async () => {
    const rel = "packages/engine/src/gip/declaration.ts";
    const edited = text(rel).replace(
      "produces: [gipInstrumentKey(instrument.instrument_id)],",
      'produces: [gipInstrumentKey(instrument.instrument_id), "gip/zz-new-generated-key"],',
    );
    expect(edited).not.toBe(text(rel));
    const c = await buildCensus({ overlay: new Map([[rel, edited]]) });
    const v = violationsOf(c);
    expect(v).toContain(`OBJECT_ROUTE_CHANGED:produces@${rel}#gipSunsetDeclaration`);
    expect(v).toEqual([
      `OBJECT_ROUTE_CHANGED:produces@${rel}#gipSunsetDeclaration`,
      `SOURCE_POLICY_CHANGED:${rel}`,
    ]);
    expect(c.scope.ast_counts).toEqual(census.scope.ast_counts);
    expect((await generate({ overlay: new Map([[rel, edited]]) })).digest).not.toBe(base.digest);
  });

  it("[S2] [mechanism only] an alternate registration site that registers an existing provider is a new site and changes that provider's route", async () => {
    const alt =
      "export function alternateBuild() {\n  return new StageProviderRegistry([gipSunsetExpiryProvider, cultureConventionCloseProvider]);\n}\n";
    const c = await buildCensus({
      overlay: new Map([["packages/engine/src/zz-alt-registry.ts", alt]]),
    });
    const v = violationsOf(c);
    expect(v).toContain(
      "SITE_NOT_IN_MANIFEST:packages/engine/src/zz-alt-registry.ts#alternateBuild",
    );
    expect(v).toContain("PROVIDER_CHANGED:gip|gip-expire-instrument-at-sunset");
    expect(v).toContain("PROVIDER_CHANGED:culture|culture-commit-communicative-convention-close");
    expect(v).toContain("SCOPE_CHANGED:scope");
  });

  it("[S2] [mechanism only] a manifest missing any one branch of the census is named, section by section", () => {
    const drop: Record<string, (m: GmWaitCatalogueManifest) => void> = {
      "a kind": (m) => void m.kinds.shift(),
      "a provider": (m) => void m.providers.shift(),
      "a registration site": (m) => void m.sites.shift(),
      "a declared Close": (m) => void m.closes.shift(),
      "an event trigger": (m) => void m.event_triggers.shift(),
      "an object route": (m) => void m.object_routes.shift(),
      "an owner facet": (m) =>
        void (m.policy.owner_policy.owners[0] as { facets: string[] }).facets.shift(),
      "a code-derived source": (m) =>
        void m.sources.splice(
          m.sources.findIndex((s) => s.origin === "CODE_RULE"),
          1,
        ),
      "a rule": (m) => void m.rules.shift(),
    };
    for (const [name, mutate] of Object.entries(drop)) {
      const m = clone(manifest);
      mutate(m);
      expect(violationsOf(census, m).length, name).toBeGreaterThan(0);
    }
    const driftedPolicy = clone(manifest);
    driftedPolicy.policy.historical_verification.canonical_id += "+SOMETHING";
    expect(violationsOf(census, driftedPolicy)).toContain(
      "POLICY_PIN_DRIFT:historical_verification",
    );
    const changedAlt = clone(manifest);
    const k = changedAlt.kinds.find(
      (x) => x.alternate_refs.length > 0,
    ) as GmWaitCatalogueManifest["kinds"][number];
    k.alternate_refs = k.alternate_refs.slice(1);
    expect(violationsOf(census, changedAlt)).toContain(`KIND_CHANGED:${k.id}`);
  });
});

describe("[S2] [mechanism only] byte custody of the retained manifest", () => {
  const dir = join(REPO_ROOT, MANIFEST_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("[S2] [mechanism only] the retained manifests are digest-named, canonical, exact, and the current one is the measured census", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const bytes = readFileSync(join(dir, f), "utf8");
      expect(createHash("sha256").update(bytes, "utf8").digest("hex") + ".json", f).toBe(f);
      expect(canonicalJson(JSON.parse(bytes)), f).toBe(bytes);
      expect(bytes.endsWith("\n") || bytes.startsWith("﻿"), f).toBe(false);
      expect(validateManifest(JSON.parse(bytes)), f).toEqual([]);
      expect(catalogueCanonicalBytes(JSON.parse(bytes)), f).toBe(bytes);
    }
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256.map((d) => `${d}.json`).sort()).toEqual(
      [...files].sort(),
    );
    expect(GM_WAIT_CATALOGUE_CURRENT_SHA256).toBe(base.digest);
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toContain(base.digest);
    expect(readFileSync(join(dir, `${base.digest}.json`), "utf8")).toBe(base.bytes);
    expect(Buffer.byteLength(base.bytes, "utf8")).toBe(base.byteLength);
    expect(catalogueDigest(JSON.parse(base.bytes))).toBe(base.digest);
  });

  it("[S2] [mechanism only] a supplied digest is judged against the retained directory: current accepted, forged bytes and unknown names denied", () => {
    const retained = new Map(
      files.map((f) => [f.slice(0, -5), readFileSync(join(dir, f), "utf8")] as const),
    );
    const authority = { current: GM_WAIT_CATALOGUE_CURRENT_SHA256, retained };
    expect(verifySuppliedDigest(base.digest, authority)).toBe("OK_CURRENT");
    expect(verifySuppliedDigest("0".repeat(64), authority)).toBe("DIGEST_UNKNOWN");
    const forged = new Map(retained);
    forged.set(base.digest, `${base.bytes.slice(0, -1)} }`);
    expect(verifySuppliedDigest(base.digest, { current: base.digest, retained: forged })).toBe(
      "MANIFEST_BYTES_MISMATCH",
    );
  });

  it("[S2] [mechanism only] the drift check names an altered manifest, a missing manifest and a stale current-digest module", () => {
    const root = mkdtempSync(join(tmpdir(), "gm-wait-drift-"));
    try {
      const loc = { root, manifestDir: "m", currentModule: "c.ts" };
      mkdirSync(join(root, "m"), { recursive: true });
      expect(checkDrift(base, loc).length).toBe(3);
      for (const f of files.filter((f) => f !== `${base.digest}.json`))
        writeFileSync(join(root, "m", f), readFileSync(join(dir, f)));
      writeFileSync(join(root, "m", `${base.digest}.json`), base.bytes);
      writeFileSync(
        join(root, "c.ts"),
        readFileSync(join(REPO_ROOT, "packages/engine/src/gm-wait-catalogue-current.ts"), "utf8"),
      );
      expect(checkDrift(base, loc)).toEqual([]);
      const archive = files.find((f) => f !== `${base.digest}.json`) as string;
      writeFileSync(join(root, "m", archive), `${readFileSync(join(dir, archive), "utf8")} `);
      expect(checkDrift(base, loc)).toEqual([`invalid retained manifest ${archive}`]);
      writeFileSync(join(root, "m", archive), readFileSync(join(dir, archive)));
      writeFileSync(join(root, "m", `${base.digest}.json`), `${base.bytes} `);
      expect(checkDrift(base, loc)).toEqual(["the retained manifest bytes differ from the census"]);
      writeFileSync(join(root, "m", `${base.digest}.json`), base.bytes);
      writeFileSync(join(root, "c.ts"), "export const GM_WAIT_CATALOGUE_CURRENT_SHA256 = 'x';\n");
      expect(checkDrift(base, loc).length).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("[S2] [mechanism only] the regeneration command in --check mode reports the current digest and succeeds", () => {
    const out = execFileSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "--experimental-strip-types",
        "tools/gen-gm-wait-catalogue.ts",
        "--check",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(out.trim()).toBe(`OK ${base.digest} ${base.byteLength} bytes`);
  });
});
