// F-014B P-7 E0 conformance - P7-01, P7-10, P7-11, P7-12, P7-13, P7-14 (static), P7-15 and P7-16 against the REAL retained manifest, the REAL census taken from the actual
// registry/provider/extension declarations, and the real source files. MECHANISM ONLY and NON-WRITING: this suite certifies nothing and promotes nothing.
//
// Non-tautology rules: every expected count is recounted from the raw retained manifest bytes (never through the module under test); every
// negative is a perturbation the test builds (a rogue kind, an overlay, a throwaway module tree, a mutated census or manifest) and the helper never
// receives the expected reason.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import {
  GmWaitCatalogueManifestV2Schema,
  catalogueCanonicalBytes,
  staticVerdict,
  validateManifest,
  type CatalogueCensusV2,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { ALL_FACT_KINDS, type FactKind } from "../../packages/engine/src/owners/registry.ts";
import {
  EPISTEMIC_SOURCE_ROUTES,
  P7_GOVERNING_SOURCES,
  buildSection10Report,
  type ReportInput,
  type Section10Report,
} from "../support/p7-section10/proof.ts";
import {
  AST_ROOTS,
  MANIFEST_DIR,
  REPO_ROOT,
  buildCensus,
  generate,
} from "../../tools/gen-gm-wait-catalogue.ts";

vi.setConfig({ testTimeout: 60_000 });

const v1Digest = "f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062";
const text = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");
const manifestBytes = (digest: string): string => text(`${MANIFEST_DIR}/${digest}.json`);
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

const currentBytes = manifestBytes(GM_WAIT_CATALOGUE_CURRENT_SHA256);
const raw = JSON.parse(currentBytes) as Record<string, unknown> & {
  kinds: { id: string }[];
  providers: { owner: string; operation: string; status: string }[];
  sites: unknown[];
  object_routes: unknown[];
  closes: unknown[];
  event_triggers: unknown[];
  policy: {
    owner_policy: { owners: { facets: string[] }[] };
    audience_projection: { access_classes: string[]; audience_fact_kind_ids: string[] };
  };
};
const authority = {
  current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
  retained: new Map([[GM_WAIT_CATALOGUE_CURRENT_SHA256, currentBytes]]),
};
const census = await buildCensus();
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  manifest: structuredClone(raw),
  authority,
  census,
  ledger: { get: () => undefined },
  certificates: [],
  ...over,
});
const production = buildSection10Report(input());
/** one entry per MEMBER: the open IDENTITY reason, or "CLOSED". A vacuous pass is impossible: the list always has one entry per member. */
const identityOf = (r: Section10Report): string[] =>
  r.members.map((m) => r.signatures[m.signature]!.open["IDENTITY"] ?? "CLOSED");
const allIdentity = (r: Section10Report, reason: string): void => {
  expect(r.members.length).toBeGreaterThan(0);
  expect(identityOf(r)).toEqual(Array(r.members.length).fill(reason));
};

describe("P7-01 all-enrolled identity: a reproducible census and the exact current-versus-retained digest [mechanism only]", () => {
  it("[P7] [mechanism only] the member list is the manifest recounted by hand: every kind, provider (registered and dormant), owner/facet, site, route, Close, trigger, access class and audience kind", () => {
    const expected = {
      KIND: raw.kinds.length,
      PROVIDER: raw.providers.length,
      OWNER_FACET: raw.policy.owner_policy.owners.reduce((n, o) => n + o.facets.length, 0),
      SITE: raw.sites.length,
      OBJECT_ROUTE: raw.object_routes.length,
      CLOSE: raw.closes.length,
      EVENT_TRIGGER: raw.event_triggers.length,
      ACCESS_CLASS: raw.policy.audience_projection.access_classes.length,
      AUDIENCE_FACT_KIND: raw.policy.audience_projection.audience_fact_kind_ids.length,
      CULTURE_ROUTE: 1,
      EXTENSION_DISPATCH: 1,
      HISTORICAL_POLICY: 1,
      EPISTEMIC_ROUTE: EPISTEMIC_SOURCE_ROUTES.length,
    };
    const got = Object.fromEntries(
      Object.entries(production.by_family).map(([k, v]) => [k, v.members]),
    );
    expect(got).toEqual(expected);
    expect(production.totals.members).toBe(Object.values(expected).reduce((a, b) => a + b, 0));
    // a dormant provider is as much a member as a registered one, and is open for want of a certificate
    const dormant = raw.providers.filter((p) => p.status === "DORMANT");
    expect(dormant.length).toBeGreaterThan(0);
    for (const p of dormant) {
      const row = production.members.find((m) => m.member === `PROVIDER:${p.owner}|${p.operation}`);
      expect(row?.status, p.operation).toBe("NOT_PROVEN");
    }
    // no hard-coded historic count: the four named Epistemic paths come from the sources, the rest from the manifest
    expect([...EPISTEMIC_SOURCE_ROUTES]).toEqual([
      "DIRECT_OBSERVATION",
      "NON_OBSERVATION_ACCESS",
      "BROADCAST_EXPOSURE",
      "AUDIENCE_PROJECTION",
    ]);
  });

  it("[P7] [mechanism only] the retained current bytes hash to the digest, the report names it, and the census of the real declarations covers it without drift", () => {
    expect(sha(currentBytes)).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toContain(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(catalogueCanonicalBytes(GmWaitCatalogueManifestV2Schema.parse(raw))).toBe(currentBytes);
    expect(production.catalogue).toMatchObject({
      sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
      digest_verdict: "OK_CURRENT",
      manifest_version: 2,
      code_drift: "CHECKED_CLEAN",
    });
    expect(production.aggregate.blockers).not.toContain("CODE_DRIFT_DETECTED");
    expect(production.aggregate.blockers).not.toContain("CATALOGUE_NOT_CURRENT");
    // on the clean baseline every member's identity IS closed; it is the one obligation that needs no certificate and it proves nothing else
    expect(identityOf(production)).toEqual(Array(production.members.length).fill("CLOSED"));
  });

  it("[P7] [mechanism only] a stale retained digest, an unknown digest and forged retained bytes each deny every member's identity", () => {
    const staleDigest = GM_WAIT_CATALOGUE_RETAINED_SHA256.find(
      (d) => d !== GM_WAIT_CATALOGUE_CURRENT_SHA256 && d !== v1Digest,
    )!;
    const stale = buildSection10Report(
      input({
        authority: {
          current: staleDigest,
          retained: new Map([
            [staleDigest, manifestBytes(staleDigest)],
            [GM_WAIT_CATALOGUE_CURRENT_SHA256, currentBytes],
          ]),
        },
      }),
    );
    expect(stale.catalogue.digest_verdict).toBe("DIGEST_STALE_RETAINED");
    const unknown = buildSection10Report(
      input({ authority: { current: staleDigest, retained: new Map() } }),
    );
    expect(unknown.catalogue.digest_verdict).toBe("DIGEST_UNKNOWN");
    const forged = buildSection10Report(
      input({
        authority: {
          current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
          retained: new Map([[GM_WAIT_CATALOGUE_CURRENT_SHA256, `${currentBytes} `]]),
        },
      }),
    );
    expect(forged.catalogue.digest_verdict).toBe("MANIFEST_BYTES_MISMATCH");
    for (const r of [stale, unknown, forged]) {
      expect(r.aggregate.blockers).toContain("CATALOGUE_NOT_CURRENT");
      allIdentity(r, "DIGEST_NOT_CURRENT");
      expect(r.totals.proof_closed_candidate).toBe(0);
    }
  });
});

describe("P7-11 source drift: a new kind, provider, route, Close, trigger, extension or changed source semantics makes the aggregate proof incomplete [mechanism only]", () => {
  const driftOf = (c: CatalogueCensusV2): Section10Report =>
    buildSection10Report(input({ census: c }));
  const expectDrift = (r: Section10Report): void => {
    expect(r.catalogue.code_drift).toBe("DETECTED");
    expect(r.aggregate.blockers).toContain("CODE_DRIFT_DETECTED");
    allIdentity(r, "CODE_DRIFT_DETECTED");
    expect(r.totals.proof_closed_candidate).toBe(0);
  };

  it("[P7] [mechanism only] an added reflected fact kind", async () => {
    const installed = ALL_FACT_KINDS as FactKind[];
    const first = installed[0]!;
    installed.push({
      ...first,
      id: "test_p7_rogue_kind" as FactKind["id"],
      rule: { ...first.rule, native_pin: "2026-11-24T00:00:00.000Z" },
    });
    try {
      expectDrift(driftOf(await buildCensus()));
    } finally {
      installed.pop();
    }
    // and the same code without the rogue kind is clean again: the detection depends on the perturbation, not on the run
    expect(buildSection10Report(input({ census: await buildCensus() })).catalogue.code_drift).toBe(
      "CHECKED_CLEAN",
    );
  });

  it("[P7] [mechanism only] a changed predicate body under unchanged reflected metadata (source-only semantics)", async () => {
    const path = "packages/engine/src/owners/registry.ts";
    const original = text(path);
    const changed = original.replace(
      "rule: PC_LEDGER_BINDING_RULE, admits: () => true",
      "rule: PC_LEDGER_BINDING_RULE, admits: () => false",
    );
    expect(changed).not.toBe(original);
    expectDrift(driftOf(await buildCensus({ overlay: new Map([[path, changed]]) })));
  });

  it("[P7] [mechanism only] an added dormant provider in a new module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p7-dormant-"));
    try {
      mkdirSync(dirname(join(dir, "zz.ts")), { recursive: true });
      writeFileSync(
        join(dir, "zz.ts"),
        `export const zzProvider: StageProvider = {\n  owner: "zz_owner",\n  facet: "zz_facet",\n  operation: "zz-dormant-op",\n` +
          `  rule: { artifact: "https://app.notion.com/p/00000000000040008000000000000009", native_pin: "2026-11-01T00:00:00.000Z", clause: "zz", authority_lineage: ["zz"], effective_basis: "zz", supersedes: null },\n` +
          `  compute() {\n    return [];\n  },\n};\n`,
      );
      expectDrift(driftOf(await buildCensus({ extraRoots: [dir] })));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[P7] [mechanism only] a new Close, event trigger, object route, extension owner or changed extension structure", () => {
    const mutations: ((c: CatalogueCensusV2) => CatalogueCensusV2)[] = [
      (c) => ({ ...c, closes: [...c.closes, { name_expr: "ZZ_CLOSE", name_value: "zz-close" }] }),
      (c) => ({
        ...c,
        event_triggers: [...c.event_triggers, { kind: "zz-trigger", provider: "zz|zz-op" }],
      }),
      (c) => ({
        ...c,
        object_routes: [
          ...c.object_routes,
          { route_id: "object_literal@zz.ts", kind: "OBJECT_LITERAL", fp: null },
        ],
      }),
      (c) => ({
        ...c,
        extension_dispatch: { ...c.extension_dispatch, extension_owners: ["zz_extension_owner"] },
      }),
      (c) => ({
        ...c,
        extension_dispatch: { ...c.extension_dispatch, structure_sha256: "0".repeat(64) },
      }),
    ];
    for (const mutate of mutations) expectDrift(driftOf(mutate(census)));
  });
});

describe("P7-10 history: a wrong archive version, a stale policy or an extension-only shortcut never retires the original historical policy [mechanism only]", () => {
  it("[P7] [mechanism only] the archived v1 manifest is not a v2 catalogue: no member, a MANIFEST_INVALID blocker, and its bytes stay exactly as retained", () => {
    const v1Bytes = manifestBytes(v1Digest);
    const before = GM_WAIT_CATALOGUE_RETAINED_SHA256.map((d) => sha(manifestBytes(d)));
    const r = buildSection10Report({
      manifest: JSON.parse(v1Bytes),
      authority: { current: v1Digest, retained: new Map([[v1Digest, v1Bytes]]) },
      ledger: { get: () => undefined },
      certificates: [],
    });
    expect(r.catalogue.manifest_version).toBe(1);
    expect(r.totals.members).toBe(0);
    expect(r.aggregate.blockers).toContain("MANIFEST_INVALID");
    // not reclassified, not rewritten: the retained originals hash to their own names before and after
    const after = GM_WAIT_CATALOGUE_RETAINED_SHA256.map((d) => sha(manifestBytes(d)));
    expect(after).toEqual(before);
    expect(after).toEqual([...GM_WAIT_CATALOGUE_RETAINED_SHA256]);
  });

  it("[P7] [mechanism only] original historical policy has no retired segment: the history member refuses with its own reason and the extension group stays skipped at the source", () => {
    const row = (key: string) => {
      const m = production.members.find((x) => x.member === key)!;
      return production.signatures[m.signature]!.open;
    };
    expect(row("HISTORICAL_POLICY:canonical")["HISTORICAL_POLICY"]).toBe("NO_CERTIFICATE");
    expect(row("EXTENSION_DISPATCH:storeBindings")["HISTORICAL_POLICY"]).toBe(
      "EXTENSION_HISTORY_SKIPPED_IN_SOURCE",
    );
    expect(production.catalogue.sentinels?.extension_historical_coverage).toBe("UNRETIRED_DENY");
    expect(production.aggregate.blockers).toContain("EXTENSION_HISTORY_UNRETIRED");
  });
});

describe("P7-12 no promotion: the five source sentinels are read and reported, never changed, and nothing is classified positive [mechanism only]", () => {
  it("[P7] [mechanism only] the report restates the sentinels exactly and the aggregate is the literal NOT_ACCEPTED", () => {
    expect(production.catalogue.sentinels).toEqual({
      epistemic: "ACTIONABLE_OR_UNSAFE",
      default_disposition: "UNDECLARED",
      evaluator_id: "NONE_SECTION_10_NOT_ACCEPTED",
      live_admission_id: "NOT_INSTALLED_NO_GM_WRITER",
      extension_historical_coverage: "UNRETIRED_DENY",
    });
    expect(production.aggregate).toMatchObject({ accepted: false, status: "NOT_ACCEPTED" });
    expect(production.status).toBe("INTERNAL_CANDIDATE_NONWRITING_MECHANISM_ONLY");
    const shown = canonicalJson(production);
    for (const positive of ["INERT", "PASSIVE_PROVEN", "INTERRUPTION_GUARDED"])
      expect(shown, positive).not.toContain(`"${positive}"`);
    // the manifest itself still carries only UNDECLARED entries and the old static verdict still denies a known kind
    const m = GmWaitCatalogueManifestV2Schema.parse(raw);
    expect(new Set(m.kinds.map((k) => k.disposition))).toEqual(new Set(["UNDECLARED"]));
    expect(new Set(m.providers.map((p) => p.disposition))).toEqual(new Set(["UNDECLARED"]));
    expect(staticVerdict(m, { kind: m.kinds[0]!.id }).permits).toBe(false);
  });

  it("[P7] [mechanism only] a manifest that asserts a positive class is invalid for this checker and closes nothing", () => {
    for (const disposition of ["INERT", "PASSIVE_PROVEN", "INTERRUPTION_GUARDED"]) {
      const m = structuredClone(raw) as unknown as { kinds: { disposition: string }[] };
      m.kinds[0]!.disposition = disposition;
      expect(validateManifest(m).map((v) => v.code)).toContain("UNPROVEN_DISPOSITION");
      const r = buildSection10Report(input({ manifest: m }));
      expect(r.aggregate.blockers).toContain("MANIFEST_INVALID");
      expect(r.totals.proof_closed_candidate).toBe(0);
    }
  });

  it("[P7] [mechanism only] the catalogue digest, the retained manifests and the generated pointer are untouched by this build: the generator reproduces the current digest exactly", async () => {
    const g = await generate();
    expect(g.digest).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(g.bytes).toBe(currentBytes);
  });
});

describe("P7-13 / P7-14 boundary: additive, non-writing and outside every shared surface [mechanism only]", () => {
  const dir = "tests/support/p7-section10";
  const modules = [`${dir}/proof.ts`, `${dir}/evaluator.ts`];
  const importsOf = (path: string): string[] => {
    const sf = ts.createSourceFile(path, text(path), ts.ScriptTarget.ES2023, true);
    const out: string[] = [];
    sf.forEachChild((n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier))
        out.push(n.moduleSpecifier.text);
    });
    return out;
  };

  it("[P7] [mechanism only] the modules import only read-only contracts, the catalogue verifier, the hash helper and two pure Epistemic derivations - no writer, store, custody, registry, host or filesystem", () => {
    const allowed = new Set([
      "@immortalis/contracts",
      "../../../packages/engine/src/hash.ts",
      "../../../packages/engine/src/gm-wait-catalogue.ts",
      "../../../packages/engine/src/epistemic/derive.ts",
      "../../../packages/engine/src/epistemic/declaration.ts",
      "./proof.ts",
    ]);
    for (const m of modules) {
      const found = importsOf(m);
      expect(found.length, m).toBeGreaterThan(0);
      for (const i of found) expect(allowed.has(i), `${m} imports ${i}`).toBe(true);
    }
    const forbidden = [
      /gm-wait-catalogue-current/,
      /gen-gm-wait-catalogue/,
      /gm-wait-custody/,
      /owners\/(registry|admission)/,
      /\/commit\//,
      /persistence/,
      /protocol/,
      /apps\//,
      /testkit/,
      /node:/,
    ];
    for (const m of modules)
      for (const i of importsOf(m))
        for (const f of forbidden) expect(f.test(i), `${m} ${i}`).toBe(false);
  });

  it("[P7] [mechanism only] no clock, randomness, process, network, filesystem or write call appears in either module", () => {
    for (const m of modules) {
      const body = ts
        .createSourceFile(m, text(m), ts.ScriptTarget.ES2023, true)
        .getFullText()
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      for (const token of [
        "Date.now",
        "new Date",
        "Math.random",
        "process.",
        "fetch(",
        "readFileSync",
        "writeFileSync",
        ".commit(",
        ".append(",
        "buildMarkerGroup",
        "buildOpenGroup",
        "buildSealGroup",
      ])
        expect(body.includes(token), `${m} contains ${token}`).toBe(false);
    }
  });

  it("[P7] [mechanism only] the modules are outside every catalogue AST root and are not exported from the package index, so no shared digest or public surface moves", () => {
    for (const m of [...modules, `${dir}/audit.ts`, `${dir}/fixtures.ts`]) {
      expect(
        AST_ROOTS.some((r) => m.startsWith(`${r}/`)),
        m,
      ).toBe(false);
      // and under tests/, the one tree the earlier slices' path-lock suites exempt: none of those locked suites is edited or tripped
      expect(m.startsWith("tests/"), m).toBe(true);
    }
    expect(text("packages/engine/src/index.ts")).not.toMatch(/section10|gm-wait-section10/);
  });

  it("[P7] [mechanism only] a PROOF_CLOSED_CANDIDATE verdict cannot be forged: an object literal is not an issued verdict", async () => {
    const { isIssuedProofClosed } = await import("../support/p7-section10/proof.ts");
    expect(
      isIssuedProofClosed({
        member: "PROVIDER:x|y",
        catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
        status: "PROOF_CLOSED_CANDIDATE",
        obligations: [],
        fixture_dependent: false,
      }),
    ).toBe(false);
  });
});

describe("P7-15 baseline: the existing catalogue, custody and host suites stay enabled [mechanism only]", () => {
  it("[P7] [mechanism only] no baseline conformance file is skipped, focused or marked todo by this build", () => {
    for (const f of [
      "tests/conformance/gm-wait-catalogue-v2.test.ts",
      "tests/conformance/gm-wait-catalogue-s2-census.test.ts",
      "tests/conformance/gm-wait-catalogue-s2.test.ts",
      "tests/conformance/b2-catalogue-conformance.test.ts",
      "tests/conformance/b2-scope-conformance.test.ts",
      "tests/conformance/gm-wait-b0-conformance.test.ts",
      "tests/conformance/gm-wait-present-s3.test.ts",
    ])
      expect(text(f), f).not.toMatch(
        /\b(?:it|describe|test)\.(?:skip|only|todo)\b|\bxit\(|\bxdescribe\(/,
      );
  });
});

describe("P7-16 boundary report: exactly what is unproven, why, and what later work supplies [mechanism only]", () => {
  it("[P7] [mechanism only] every member carries an explicit unresolved reason; none is accepted; the holds and later dependencies are listed", () => {
    expect(production.totals).toEqual({
      members: production.members.length,
      proof_closed_candidate: 0,
      not_proven: production.members.length,
    });
    for (const s of production.signatures) expect(Object.keys(s.open).length).toBeGreaterThan(0);
    expect(production.signatures.reduce((n, s) => n + s.members, 0)).toBe(
      production.members.length,
    );
    expect(production.aggregate.blockers).toEqual([
      "EVALUATOR_NOT_INTEGRATED",
      "EXTENSION_HISTORY_UNRETIRED",
      "FULL_P7_AND_S4_HOLD",
      "MEMBER_PROOFS_OPEN",
    ]);
    const later = production.supplied_by_later_work.join("\n");
    for (const needle of ["B3", "IF-6b", "P-5/P6", "R-H", "P-6/T85", "S4/full P-7"])
      expect(later, needle).toContain(needle);
    // the governing-source table is the one the brief names, at exact pins, and the manifest's own adopted inputs agree where they overlap
    const adopted = GmWaitCatalogueManifestV2Schema.parse(raw).sources.filter(
      (s) => s.origin === "ADOPTED_INPUT",
    );
    for (const s of adopted) {
      const mine = P7_GOVERNING_SOURCES.find((x) => x.page_uuid === s.page_uuid);
      if (mine) expect(mine.native_pin, s.page_uuid).toBe(s.native_pin);
    }
  });
});
