// Direct tests of the shared surface oracle and its drift finders (twenty-fourth slice).
//
// The central conformance suite is only worth having if it FAILS when the registered surface drifts. These tests prove
// that in both directions: (1) synthetic production drift against the real oracle is reported, and (2) edits to the
// oracle against the real production surface are reported — so the oracle is demonstrably not a mirror of production.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_FACT_KINDS, CANONICAL_OWNER_REGISTRY } from "@immortalis/engine";
import {
  EXPECTED_ADAPTER_SURFACES,
  EXPECTED_FACT_KINDS,
  EXPECTED_LEGACY_RULE_KIND_IDS,
  EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
  EXPECTED_OWNER_FACETS,
  REGISTRY_SOURCE,
  UNREGISTERED_DIPLOMACY_KEY_PROBES,
  type ExpectedAdapterSurface,
  type ExpectedFactKind,
} from "../support/expected-surface.ts";
import {
  observeAdapterMethods,
  observeAdapterSources,
  observeAdmissions,
  observeKindGroups,
} from "../support/observed-surface.ts";
import {
  findAdapterSurfaceDrift,
  findGroupDrift,
  findInventoryDrift,
  findKeySpaceDrift,
  findLegacyRuleDrift,
  findOwnerFacetDrift,
  type ObservedFactKind,
} from "../support/surface-checks.ts";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** A synthetic "production" that is exactly what the oracle says production should be. */
function synthetic(): ObservedFactKind[] {
  return EXPECTED_FACT_KINDS.map((e) => ({
    id: e.id,
    owner: e.owner,
    facet: e.facet,
    lifecycle: e.lifecycle,
    keyPattern: new RegExp(`^${escapeRe(e.exampleKey)}$`),
    ...(EXPECTED_LEGACY_RULE_KIND_IDS.includes(e.id) ? { legacyRule: {} } : {}),
  }));
}
const kind = (over: Partial<ObservedFactKind> & { id: string }): ObservedFactKind => ({
  owner: "diplomacy",
  facet: "diplomacy_framework",
  lifecycle: "ADVANCING",
  keyPattern: /^diplomacy\/never-matches$/,
  ...over,
});
const ownerFacets = (kinds: readonly ObservedFactKind[]) =>
  new Map(
    [...new Set(kinds.map((k) => k.owner))].map((o) => [
      o,
      new Set(kinds.filter((k) => k.owner === o).map((k) => k.facet)),
    ]),
  );
const hasFinding = (findings: string[], ...needles: string[]) =>
  expect(
    findings.some((f) => needles.every((n) => f.includes(n))),
    findings.join("\n"),
  ).toBe(true);
const groups = () => {
  const g: Record<string, { id: string }[]> = {};
  for (const e of EXPECTED_FACT_KINDS) (g[e.group] ??= []).push({ id: e.id });
  return g;
};
const surfaceArgs = () => {
  const methods = Object.fromEntries(
    Object.entries(EXPECTED_ADAPTER_SURFACES).map(([n, s]) => [n, [...s.methods]]),
  );
  const sources = Object.fromEntries(
    Object.entries(EXPECTED_ADAPTER_SURFACES).flatMap(([n, s]) =>
      s.source
        ? [
            [
              n,
              {
                commitCalls: s.source.commitCalls,
                establishWriters: [...s.source.establishWriters],
              },
            ],
          ]
        : [],
    ),
  );
  const admissions = Object.fromEntries(
    Object.entries(EXPECTED_ADAPTER_SURFACES).flatMap(([n, s]) =>
      s.admission
        ? [
            [
              n,
              {
                createOnlyGuards: s.admission.createOnlyGuards,
                amendmentRefusals: s.admission.amendmentRefusals,
              },
            ],
          ]
        : [],
    ),
  );
  return { methods, sources, admissions };
};
const surfaceDrift = (
  expected: Readonly<Record<string, ExpectedAdapterSurface>>,
  a: ReturnType<typeof surfaceArgs>,
) => findAdapterSurfaceDrift(expected, a.methods, a.sources, a.admissions);

describe("the oracle is literal, self-consistent data that cannot derive from production", () => {
  it("expected-surface.ts imports nothing; the drift finders import only types; only observed-surface.ts reads the engine", () => {
    const imports = (f: string) =>
      readFileSync(`tests/support/${f}`, "utf8")
        .split("\n")
        .filter((l) => /^\s*(import|export\s.*\sfrom)\b/.test(l));
    expect(imports("expected-surface.ts")).toEqual([]);
    for (const l of imports("surface-checks.ts")) expect(l).toMatch(/^import type\b|^\s*\w+,?$/);
    expect(readFileSync("tests/support/surface-checks.ts", "utf8")).not.toMatch(/@immortalis\//);
    expect(readFileSync("tests/support/expected-surface.ts", "utf8")).not.toMatch(/@immortalis\//);
    expect(readFileSync("tests/support/observed-surface.ts", "utf8")).toMatch(
      /from "@immortalis\/engine"/,
    );
  });

  it("kind ids and canonical example keys are unique, and the owner → facet table agrees with the kind table", () => {
    const ids = EXPECTED_FACT_KINDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = EXPECTED_FACT_KINDS.map((k) => k.exampleKey);
    expect(new Set(keys).size).toBe(keys.length);
    const derived: Record<string, string[]> = {};
    for (const k of EXPECTED_FACT_KINDS) {
      const facets = (derived[k.owner] ??= []);
      if (!facets.includes(k.facet)) facets.push(k.facet);
    }
    expect(derived).toEqual(
      Object.fromEntries(Object.entries(EXPECTED_OWNER_FACETS).map(([o, f]) => [o, [...f]])),
    );
  });

  it("the legacy list, adapter writers and probe keys are consistent with the rest of the oracle", () => {
    const ids = EXPECTED_FACT_KINDS.map((k) => k.id);
    for (const id of EXPECTED_LEGACY_RULE_KIND_IDS) expect(ids).toContain(id);
    expect(EXPECTED_LEGACY_RULE_SOURCE_SLOTS).toBe(1 + EXPECTED_LEGACY_RULE_KIND_IDS.length);
    for (const [name, s] of Object.entries(EXPECTED_ADAPTER_SURFACES)) {
      expect([...s.methods].sort(), name).toEqual([...s.methods]);
      for (const w of s.source?.establishWriters ?? []) expect(s.methods, name).toContain(w);
    }
    const example = new Set(EXPECTED_FACT_KINDS.map((k) => k.exampleKey));
    for (const p of UNREGISTERED_DIPLOMACY_KEY_PROBES) expect(example.has(p), p).toBe(false);
    expect(new Set(UNREGISTERED_DIPLOMACY_KEY_PROBES).size).toBe(
      UNREGISTERED_DIPLOMACY_KEY_PROBES.length,
    );
  });
});

describe("the finders report nothing for an exact match and report each kind of unauthorized drift", () => {
  it("a synthetic production identical to the oracle has no drift anywhere", () => {
    const s = synthetic();
    expect(findInventoryDrift(EXPECTED_FACT_KINDS, s)).toEqual([]);
    expect(findGroupDrift(EXPECTED_FACT_KINDS, groups())).toEqual([]);
    expect(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, ownerFacets(s))).toEqual([]);
    expect(
      findLegacyRuleDrift(
        EXPECTED_LEGACY_RULE_KIND_IDS,
        EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
        s,
        "legacyRule?: x\n".repeat(EXPECTED_LEGACY_RULE_SOURCE_SLOTS),
      ),
    ).toEqual([]);
    expect(findKeySpaceDrift(EXPECTED_FACT_KINDS, s, UNREGISTERED_DIPLOMACY_KEY_PROBES)).toEqual(
      [],
    );
    expect(surfaceDrift(EXPECTED_ADAPTER_SURFACES, surfaceArgs())).toEqual([]);
  });

  it("an added fact kind (the next slice's, for instance) is an unauthorized addition and bumps both the global and the owner count", () => {
    const f = findInventoryDrift(EXPECTED_FACT_KINDS, [
      ...synthetic(),
      kind({ id: "diplomacy_channel" }),
    ]);
    hasFinding(f, "diplomacy_channel", "addition");
    hasFinding(f, "fact-kind count");
    hasFinding(f, "owner diplomacy", "expected 4 kinds, found 5");
  });

  it("a removed fact kind, a duplicate registration, and a changed owner or facet are each reported", () => {
    const s = synthetic();
    hasFinding(findInventoryDrift(EXPECTED_FACT_KINDS, s.slice(1)), "world_profile", "removal");
    hasFinding(findInventoryDrift(EXPECTED_FACT_KINDS, [...s, s[0]!]), "more than once");
    hasFinding(
      findInventoryDrift(
        EXPECTED_FACT_KINDS,
        s.map((k) => (k.id === "kti_transfer_basis" ? { ...k, owner: "gip" } : k)),
      ),
      "kti_transfer_basis",
      "owner expected kti",
    );
    hasFinding(
      findInventoryDrift(
        EXPECTED_FACT_KINDS,
        s.map((k) => (k.id === "kti_transfer_basis" ? { ...k, facet: "x" } : k)),
      ),
      "kti_transfer_basis",
      "facet expected kti_development",
    );
  });

  it("a changed lifecycle classification is reported", () => {
    hasFinding(
      findInventoryDrift(
        EXPECTED_FACT_KINDS,
        synthetic().map((k) =>
          k.id === "gip_governance_instrument" ? { ...k, lifecycle: "SEALED" } : k,
        ),
      ),
      "gip_governance_instrument",
      "lifecycle expected ADVANCING, found SEALED",
    );
  });

  it("a re-ordered owner membership is reported; a registry group that gained, lost or re-ordered a kind is reported", () => {
    const s = synthetic();
    const i = s.findIndex((k) => k.id === "gip_scope_binding");
    const swapped = [...s];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1]!, swapped[i]!];
    hasFinding(findInventoryDrift(EXPECTED_FACT_KINDS, swapped), "owner gip", "order/membership");
    const g = groups();
    hasFinding(findGroupDrift(EXPECTED_FACT_KINDS, { ...g, GIP_FACT_KINDS: [] }), "GIP_FACT_KINDS");
    hasFinding(
      findGroupDrift(EXPECTED_FACT_KINDS, {
        ...g,
        GIP_FACT_KINDS: [...g.GIP_FACT_KINDS!].reverse(),
      }),
      "GIP_FACT_KINDS",
    );
    hasFinding(findGroupDrift(EXPECTED_FACT_KINDS, { ...g, NEW_FACT_KINDS: [] }), "NEW_FACT_KINDS");
    const { GIP_FACT_KINDS: _gone, ...rest } = g;
    void _gone;
    hasFinding(findGroupDrift(EXPECTED_FACT_KINDS, rest), "GIP_FACT_KINDS", "not exported");
  });

  it("a gained or lost owner or facet registration is reported", () => {
    const s = synthetic();
    const m = ownerFacets(s);
    m.get("gip")!.add("gip_extra");
    hasFinding(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, m), "gip", "gip_extra");
    m.get("gip")!.clear();
    hasFinding(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, m), "gip", "gip_institution_identity");
    m.set("polity", new Set(["polity_state"]));
    hasFinding(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, m), "polity", "not expected");
    m.delete("kti");
    hasFinding(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, m), "kti", "not registered");
  });

  it("an added, removed or substituted legacyRule, and an extra legacyRule slot in the registry source, are reported", () => {
    const s = synthetic();
    const src = "legacyRule?: x\n".repeat(EXPECTED_LEGACY_RULE_SOURCE_SLOTS);
    const run = (kinds: ObservedFactKind[], text = src) =>
      findLegacyRuleDrift(
        EXPECTED_LEGACY_RULE_KIND_IDS,
        EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
        kinds,
        text,
      );
    hasFinding(
      run(s.map((k) => (k.id === "diplomacy_framework" ? { ...k, legacyRule: {} } : k))),
      "legacy-rule kinds",
    );
    hasFinding(
      run(s.map((k) => (k.id === "diplomacy_relation_edge" ? { ...k, legacyRule: undefined } : k))),
      "legacy-rule kinds",
    );
    hasFinding(
      run(
        s.map((k) =>
          k.id === "gip_governance_instrument"
            ? { ...k, legacyRule: undefined }
            : k.id === "kti_transfer_basis"
              ? { ...k, legacyRule: {} }
              : k,
        ),
      ),
      "legacy-rule kinds",
    );
    hasFinding(run(s, src + "legacyRule: y\n"), "legacyRule slots");
    hasFinding(run(s, "legacyRule?: x\n"), "legacyRule slots");
  });

  it("a new sibling whose key space overlaps a registered kind, a probe key that becomes registered, and a kind that stops resolving its own key are each reported", () => {
    const s = synthetic();
    hasFinding(
      findKeySpaceDrift(
        EXPECTED_FACT_KINDS,
        [...s, kind({ id: "diplomacy_channel", keyPattern: /^diplomacy\/channel\/[^/]+$/ })],
        UNREGISTERED_DIPLOMACY_KEY_PROBES,
      ),
      "diplomacy/channel/c1",
      "unregistered",
    );
    hasFinding(
      findKeySpaceDrift(
        EXPECTED_FACT_KINDS,
        [...s, kind({ id: "diplomacy_wide", keyPattern: /^diplomacy\/framework\/.+$/ })],
        UNREGISTERED_DIPLOMACY_KEY_PROBES,
      ),
      "diplomacy/framework/f1",
      "diplomacy_wide",
    );
    hasFinding(
      findKeySpaceDrift(
        EXPECTED_FACT_KINDS,
        s.map((k) => (k.id === "diplomacy_framework" ? { ...k, keyPattern: /^nothing$/ } : k)),
        UNREGISTERED_DIPLOMACY_KEY_PROBES,
      ),
      "diplomacy/framework/f1",
      "resolved []",
    );
  });

  it("an added or removed adapter method, an unauthorized adapter class, a changed commit count, a new writer and a changed guard count are each reported", () => {
    const base = surfaceArgs();
    const clone = () => structuredClone(base);
    let a = clone();
    a.methods.GipAdapter!.push("amendOffice");
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "GipAdapter", "amendOffice", "addition");
    a = clone();
    a.methods.DiplomacyAdapter = a.methods.DiplomacyAdapter!.filter((m) => m !== "relationEdge");
    hasFinding(
      surfaceDrift(EXPECTED_ADAPTER_SURFACES, a),
      "DiplomacyAdapter",
      "relationEdge",
      "removal",
    );
    a = clone();
    a.methods.TradeAdapter = ["trade"];
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "TradeAdapter", "not expected");
    a = clone();
    delete a.methods.KtiAdapter;
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "KtiAdapter", "not exported");
    a = clone();
    a.sources.GipAdapter!.commitCalls = 2;
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "GipAdapter", ".commit( calls");
    a = clone();
    a.sources.DiplomacyAdapter!.establishWriters.push("establishChannel");
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "establishChannel", "not expected");
    a = clone();
    a.admissions.DiplomacyAdapter!.createOnlyGuards = 5;
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "create-only guards");
    a = clone();
    a.admissions.DiplomacyAdapter!.amendmentRefusals = 3;
    hasFinding(surfaceDrift(EXPECTED_ADAPTER_SURFACES, a), "amendment refusals");
  });
});

describe("edits to the oracle are caught against the real production surface: the oracle does not mirror production", () => {
  const realDrift = (
    kinds: readonly ExpectedFactKind[],
    legacy: readonly string[],
    surfaces: Readonly<Record<string, ExpectedAdapterSurface>>,
  ) => ({
    inventory: findInventoryDrift(kinds, ALL_FACT_KINDS),
    groups: findGroupDrift(kinds, observeKindGroups()),
    legacy: findLegacyRuleDrift(
      legacy,
      1 + legacy.length,
      ALL_FACT_KINDS,
      readFileSync(REGISTRY_SOURCE, "utf8"),
    ),
    keys: findKeySpaceDrift(kinds, ALL_FACT_KINDS, UNREGISTERED_DIPLOMACY_KEY_PROBES),
    surface: findAdapterSurfaceDrift(
      surfaces,
      observeAdapterMethods(),
      observeAdapterSources(),
      observeAdmissions(),
    ),
    owners: findOwnerFacetDrift(EXPECTED_OWNER_FACETS, CANONICAL_OWNER_REGISTRY),
  });

  it("the unedited oracle matches production exactly", () => {
    const d = realDrift(
      EXPECTED_FACT_KINDS,
      EXPECTED_LEGACY_RULE_KIND_IDS,
      EXPECTED_ADAPTER_SURFACES,
    );
    expect(Object.values(d).flat()).toEqual([]);
  });

  it("an oracle that forgets a registered kind, or invents one, no longer matches production", () => {
    const forgot = EXPECTED_FACT_KINDS.filter((k) => k.id !== "diplomacy_framework");
    const d = realDrift(forgot, EXPECTED_LEGACY_RULE_KIND_IDS, EXPECTED_ADAPTER_SURFACES);
    hasFinding(d.inventory, "diplomacy_framework", "addition");
    const invented: ExpectedFactKind = {
      id: "diplomacy_channel",
      owner: "diplomacy",
      facet: "diplomacy_channel",
      lifecycle: "ADVANCING",
      group: "DIPLOMACY_FACT_KINDS",
      exampleKey: "diplomacy/channel/c1",
    };
    const e = realDrift(
      [...EXPECTED_FACT_KINDS, invented],
      EXPECTED_LEGACY_RULE_KIND_IDS,
      EXPECTED_ADAPTER_SURFACES,
    );
    hasFinding(e.inventory, "diplomacy_channel", "removal");
    hasFinding(e.groups, "DIPLOMACY_FACT_KINDS");
    hasFinding(e.keys, "diplomacy/channel/c1", "expected only [diplomacy_channel]");
  });

  it("an oracle that forgets a legacyRule entry, or invents one, no longer matches production", () => {
    hasFinding(
      realDrift(
        EXPECTED_FACT_KINDS,
        EXPECTED_LEGACY_RULE_KIND_IDS.slice(1),
        EXPECTED_ADAPTER_SURFACES,
      ).legacy,
      "legacy-rule kinds",
    );
    hasFinding(
      realDrift(
        EXPECTED_FACT_KINDS,
        [...EXPECTED_LEGACY_RULE_KIND_IDS, "kti_transfer_basis"],
        EXPECTED_ADAPTER_SURFACES,
      ).legacy,
      "legacy-rule kinds",
    );
  });

  it("an oracle that forgets an adapter method, a writer or a whole class no longer matches production", () => {
    const gip = EXPECTED_ADAPTER_SURFACES.GipAdapter!;
    const without = (m: string): Record<string, ExpectedAdapterSurface> => ({
      ...EXPECTED_ADAPTER_SURFACES,
      GipAdapter: { ...gip, methods: gip.methods.filter((x) => x !== m) },
    });
    hasFinding(
      realDrift(EXPECTED_FACT_KINDS, EXPECTED_LEGACY_RULE_KIND_IDS, without("scopeBinding"))
        .surface,
      "GipAdapter",
      "scopeBinding",
      "not expected",
    );
    const { TemporalCoordinator: _t, ...noKernel } = EXPECTED_ADAPTER_SURFACES;
    void _t;
    hasFinding(
      realDrift(EXPECTED_FACT_KINDS, EXPECTED_LEGACY_RULE_KIND_IDS, noKernel).surface,
      "TemporalCoordinator",
      "not expected",
    );
    hasFinding(
      realDrift(EXPECTED_FACT_KINDS, EXPECTED_LEGACY_RULE_KIND_IDS, {
        ...EXPECTED_ADAPTER_SURFACES,
        DiplomacyAdapter: {
          ...EXPECTED_ADAPTER_SURFACES.DiplomacyAdapter!,
          source: {
            ...EXPECTED_ADAPTER_SURFACES.DiplomacyAdapter!.source!,
            commitCalls: 3,
          },
        },
      }).surface,
      "DiplomacyAdapter",
      ".commit( calls",
    );
  });
});
