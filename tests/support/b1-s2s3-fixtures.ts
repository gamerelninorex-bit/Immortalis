// Fixtures for the B1 S2/S3 suites: a small, hand-written, valid GM-wait catalogue manifest (S2 core tests) and its census. These are TEST
// fixtures: they certify nothing and are never used as a production manifest.
import { createHash } from "node:crypto";
import type {
  CatalogueCensus,
  GmWaitCatalogueManifestV1,
} from "../../packages/engine/src/gm-wait-catalogue.ts";

export const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** Independent canonicalisation (sorted keys, no whitespace): a check on the helper's own `canonicalJson`, not a reuse of it. */
export function independentCanonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(independentCanonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${independentCanonical(o[k])}`)
    .join(",")}}`;
}

const R1 = sha("rule-1");
const R2 = sha("rule-2");
const [RA, RB] = R1 < R2 ? [R1, R2] : [R2, R1];

export function miniManifest(): GmWaitCatalogueManifestV1 {
  const kind = (id: string, owner: string, facet: string, rule_ref: string) => ({
    id,
    owner,
    facet,
    im: "IM-03",
    rc: ["RC-01", "RC-02"],
    lifecycle: "SEALED" as const,
    key_pattern: { source: `^${id}/(x)$`, flags: "" },
    value_schema_fp: sha(`schema-${id}`),
    rule_ref,
    legacy_refs: [],
    later_legacy_refs: [],
    alternate_refs: [RB],
    disposition: "UNDECLARED" as const,
  });
  return {
    manifest_version: 1,
    format: "immortalis-gm-wait-catalogue",
    policy: {
      epistemic: "ACTIONABLE_OR_UNSAFE",
      default_disposition: "UNDECLARED",
      value_schema_fp_scope: "STRUCTURAL_ONLY",
      enforcement_boundary:
        "BUILD_TEST_TIME_COVERAGE_ONLY_RUNTIME_ENFORCEMENT_AND_ENROLMENT_ADMISSION_REMAIN_S4_SECTION_10_SOURCE_GATES",
      evaluator: { id: "NONE_SECTION_10_NOT_ACCEPTED" },
      live_admission: { id: "NOT_INSTALLED_NO_GM_WRITER" },
      historical_verification: {
        canonical_id: "R1-test+POLICY-A",
        legacy_contract_suffix: "+LEGACY",
        ms_same_id: true,
      },
      owner_policy: {
        owners: [
          { owner: "alpha", facets: ["f1", "f2"] },
          { owner: "beta", facets: ["g1"] },
        ],
      },
      audience_projection: {
        audience_fact_kind_ids: ["kind_a", "kind_b"],
        access_classes: ["x.one", "x.two"],
      },
      conversion: {
        rule: "SI_SUBDAY_V1",
        factors: { second: 1, minute: 60, hour: 3600 },
        qualification: "TEMPORAL_ORIGIN_V2_WITNESS_ONLY",
      },
    },
    sources: [
      {
        origin: "ADOPTED_INPUT",
        page_uuid: "00000000-0000-4000-8000-000000000002",
        native_pin: "2026-11-16T15:18:44.683Z",
        label: "test adopted input",
        clauses: ["T0", "T1"],
        ratification: {
          page_uuid: "00000000-0000-4000-8000-000000000003",
          native_pin: "2026-11-16T15:29:12.183Z",
        },
      },
      {
        origin: "CODE_RULE",
        page_uuid: "00000000-0000-4000-8000-000000000001",
        native_pin: "2026-09-25T13:44:22.668Z",
        rule_ids: [RA, RB],
      },
    ],
    rules: [
      {
        rule_id: RA,
        source_ref: {
          artifact: "https://app.notion.com/p/00000000000040008000000000000001",
          native_pin: "2026-09-25T13:44:22.668Z",
          clause: "clause A",
          authority_lineage: ["first", "second"],
          effective_basis: "pinned-by-spec-lock",
          supersedes: null,
        },
      },
      {
        rule_id: RB,
        source_ref: {
          artifact: "https://app.notion.com/p/00000000000040008000000000000001",
          native_pin: "2026-09-25T13:44:22.668Z",
          clause: "clause B",
          authority_lineage: ["only"],
          effective_basis: "pinned-by-spec-lock",
          supersedes: null,
        },
      },
    ],
    kinds: [kind("alpha_one", "alpha", "f1", RA), kind("beta_one", "beta", "g1", RB)],
    providers: [
      {
        owner: "alpha",
        facet: "f1",
        operation: "alpha-op",
        rule_ref: RA,
        event_trigger: "trig-1",
        effect_kind_ids: ["alpha_one"],
        status: "REGISTERED",
        site_ids: ["site-a"],
        found_by: ["AST_DECL", "REFLECTION"],
        disposition: "UNDECLARED",
      },
      {
        owner: "beta",
        facet: "g1",
        operation: "beta-op",
        rule_ref: RB,
        event_trigger: null,
        effect_kind_ids: ["beta_one"],
        status: "DORMANT",
        site_ids: [],
        found_by: ["AST_DECL", "REFLECTION"],
        disposition: "UNDECLARED",
      },
    ],
    unresolved_declarations: [],
    sites: [{ site_id: "site-a", members: ["alpha|alpha-op"], opaque: false }],
    closes: [{ name_expr: "ALPHA_CLOSE", name_value: "alpha-close" }],
    event_triggers: [{ kind: "trig-1", provider: "alpha|alpha-op" }],
    object_routes: [
      { route_id: "object_literal@alpha", kind: "OBJECT_LITERAL", fp: null },
      { route_id: "produces@alpha#build", kind: "PRODUCES_EXPRESSION", fp: sha("produces-expr") },
    ],
    extension_dispatch: {
      function: "storeBindings",
      structure_sha256: sha("ext-structure"),
      early_return_count: 3,
      extension_owners: [],
      historical_verification_of_extension_groups: "SKIPPED",
    },
    culture_route: {
      provider: "beta|beta-op",
      provider_registered_in_production: false,
      declared_close_basis_message_sha256: sha("culture-message"),
      as_of_now_basis_accepted: true,
    },
    scope: {
      ast_roots: ["a/src", "b/src"],
      reflection_roots: ["a/src"],
      excluded_roots: ["tests"],
      census_methods: ["REFLECTION", "TS_AST"],
      ast_counts: {
        provider_declarations: 2,
        registry_sites: 1,
        register_calls: 0,
        close_declarations: 1,
        event_trigger_declarations: 1,
        object_literals: 1,
        register_object_calls: 0,
        produces_expressions: 1,
      },
    },
  };
}

/** The census that corresponds exactly to a manifest (the code-derived part of it). */
export function censusOf(m: GmWaitCatalogueManifestV1): CatalogueCensus {
  return {
    historical_verification: m.policy.historical_verification,
    owner_policy: m.policy.owner_policy,
    audience_projection: m.policy.audience_projection,
    sources: m.sources.filter(
      (s): s is Extract<typeof s, { origin: "CODE_RULE" }> => s.origin === "CODE_RULE",
    ),
    rules: m.rules,
    kinds: m.kinds,
    providers: m.providers,
    unresolved_declarations: m.unresolved_declarations,
    sites: m.sites,
    closes: m.closes,
    event_triggers: m.event_triggers,
    object_routes: m.object_routes,
    extension_dispatch: m.extension_dispatch,
    culture_route: m.culture_route,
    scope: m.scope,
  };
}

/** A deep copy with every object's key order reversed (set and semantic arrays untouched). */
export function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as unknown as T;
  if (v !== null && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .reverse()
        .map(([k, x]) => [k, reverseKeys(x)]),
    ) as T;
  return v;
}
export const clone = <T>(v: T): T => structuredClone(v);
