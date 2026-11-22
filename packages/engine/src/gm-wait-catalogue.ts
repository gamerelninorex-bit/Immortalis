import { z } from "zod";
import { Sha256, canonicalJson } from "@immortalis/contracts";
import { sha256Text } from "./hash.ts";

/**
 * F-014B B1 S2 - the GM-wait source catalogue manifest: a strict, uniquely identified, source-cited, default-deny inventory whose
 * canonical JSON bytes hash (SHA-256, through the one existing `canonicalJson`) to the value an INITIAL GM wait carries in its single
 * existing `gm_wait.catalogue_sha256` member (BLUE S2/S3 v6.2 section 3; Successor v0.3 R-1; v0.4 G).
 *
 * MECHANISM ONLY and NON-WRITING. Every function here is a pure function of its arguments: no clock, no randomness, no filesystem,
 * no store, no network. Nothing here installs a writer, opens an authority, changes an owner rule or classifies any capability safe:
 * every generated entry is `UNDECLARED` and the Epistemic member stays `ACTIONABLE_OR_UNSAFE`. Version 2 represents all five
 * source dispositions as vocabulary. Validation bars positive classifications while the evaluator and member proofs are absent.
 * The census that fills a manifest from the actual registry,
 * provider and extension declarations is `tools/gen-gm-wait-catalogue.ts` (it needs the TypeScript compiler, a root dev dependency).
 *
 * BUILD/TEST-TIME COVERAGE ONLY. The census and the coverage comparison below falsify an added dormant provider, an added
 * alternate registration site, a changed generated-key (`produces`) path and a late extension at build and test time. Runtime
 * enforcement and enrolment admission remain S4 / F-014B section 10 source gates; nothing in this module is, or describes, a
 * runtime all-enrolled veto. An unknown capability is `UNDECLARED`, never a production-safe verdict. The counts a census records
 * (providers, registry sites, Closes, routes) are an inspected observation the manifest is regenerated from, not a closed set.
 *
 * The internal keys and tuple order below are technical engineering, not frozen wire law: no wire schema, persistence policy or raw
 * admission behavior changes. This module is deliberately NOT exported from the package index.
 */

export const GM_WAIT_CATALOGUE_FORMAT = "immortalis-gm-wait-catalogue";
export const GM_WAIT_CATALOGUE_MANIFEST_VERSION = 2;
export const DISPOSITION_UNDECLARED = "UNDECLARED";
export const EPISTEMIC_ACTIONABLE_OR_UNSAFE = "ACTIONABLE_OR_UNSAFE";

const Text = z.string().min(1);
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const IsoPin = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
/** A set-valued list: canonically sorted, duplicate-free (see `validateManifest`). */
const TextSet = z.array(Text);
const Disposition = z.literal(DISPOSITION_UNDECLARED);

const PageRef = z.strictObject({ page_uuid: Uuid, native_pin: IsoPin });

/** An interned governing-rule citation (a `SourceRef` copied verbatim; `authority_lineage` is source-ordered, not a set). */
export const RuleEntrySchema = z.strictObject({
  rule_id: Sha256,
  source_ref: z.strictObject({
    artifact: Text,
    native_pin: Text,
    clause: Text,
    authority_lineage: z.array(Text).min(1),
    effective_basis: Text,
    supersedes: Text.nullable(),
  }),
});

export const SourceEntrySchema = z.discriminatedUnion("origin", [
  /** a page named by a rule the build already registers (derived mechanically; never typed by hand) */
  z.strictObject({
    origin: z.literal("CODE_RULE"),
    page_uuid: Uuid,
    native_pin: Text,
    rule_ids: z.array(Sha256),
  }),
  /** a BLUE/Sovereign page the policy binds that no registered rule names (a closed constant of the generator) */
  z.strictObject({
    origin: z.literal("ADOPTED_INPUT"),
    page_uuid: Uuid,
    native_pin: IsoPin,
    label: Text,
    clauses: TextSet,
    ratification: PageRef.nullable(),
  }),
]);

export const KindEntrySchema = z.strictObject({
  id: Text,
  owner: Text,
  facet: Text,
  im: Text,
  rc: TextSet,
  lifecycle: z.enum(["SEALED", "ADVANCING"]),
  key_pattern: z.strictObject({ source: Text, flags: z.string() }),
  /** structural fingerprint only: refinement bodies and `admits` predicates are NOT captured (`policy.value_schema_fp_scope`) */
  value_schema_fp: Sha256,
  rule_ref: Sha256,
  legacy_refs: z.array(Sha256),
  later_legacy_refs: z.array(Sha256),
  alternate_refs: z.array(Sha256),
  disposition: Disposition,
});

export const ProviderEntrySchema = z.strictObject({
  owner: Text,
  facet: Text,
  operation: Text,
  rule_ref: Sha256,
  event_trigger: Text.nullable(),
  /** sound upper bound: the kinds of this provider's own owner/facet (admission rejects any other key) */
  effect_kind_ids: TextSet,
  status: z.enum(["REGISTERED", "DORMANT"]),
  site_ids: TextSet,
  found_by: z.array(z.enum(["AST_DECL", "REFLECTION"])),
  disposition: Disposition,
});

export const SiteEntrySchema = z.strictObject({
  site_id: Text,
  members: TextSet,
  opaque: z.boolean(),
});

export const CloseEntrySchema = z.strictObject({ name_expr: Text, name_value: Text.nullable() });
export const EventTriggerEntrySchema = z.strictObject({ kind: Text, provider: Text });
export const ObjectRouteEntrySchema = z.strictObject({
  route_id: Text,
  kind: z.enum(["OBJECT_LITERAL", "REGISTER_OBJECT_CALL", "PRODUCES_EXPRESSION"]),
  /** sha256 of the normalised source expression of a generated-key (`produces`) path; null for the other kinds */
  fp: Sha256.nullable(),
});

export const ExtensionDispatchSchema = z.strictObject({
  function: z.literal("storeBindings"),
  /** sha256 of the normalised return statements of `check` and `verifyHistorical` (comments and formatting excluded) */
  structure_sha256: Sha256,
  early_return_count: z.number().int().nonnegative(),
  /** owners an extension adds beside the canonical registry in THIS census (production supplies none) */
  extension_owners: TextSet,
  /** the extension-owned group is never historically verified (read from the early return) */
  historical_verification_of_extension_groups: z.literal("SKIPPED"),
});

export const CultureRouteSchema = z.strictObject({
  provider: Text,
  provider_registered_in_production: z.boolean(),
  declared_close_basis_message_sha256: Sha256,
  as_of_now_basis_accepted: z.boolean(),
});

export const OwnerPolicyEntrySchema = z.strictObject({ owner: Text, facets: TextSet });

export const ScopeSchema = z.strictObject({
  ast_roots: TextSet,
  reflection_roots: TextSet,
  excluded_roots: TextSet,
  census_methods: z.array(z.enum(["REFLECTION", "TS_AST"])),
  ast_counts: z.strictObject({
    provider_declarations: z.number().int().nonnegative(),
    registry_sites: z.number().int().nonnegative(),
    register_calls: z.number().int().nonnegative(),
    close_declarations: z.number().int().nonnegative(),
    event_trigger_declarations: z.number().int().nonnegative(),
    object_literals: z.number().int().nonnegative(),
    register_object_calls: z.number().int().nonnegative(),
    produces_expressions: z.number().int().nonnegative(),
  }),
});

export const PolicySchema = z.strictObject({
  epistemic: z.literal(EPISTEMIC_ACTIONABLE_OR_UNSAFE),
  default_disposition: Disposition,
  value_schema_fp_scope: z.literal("STRUCTURAL_ONLY"),
  /** what this manifest is: build/test-time coverage. Runtime enforcement and enrolment admission are NOT here (S4 / section 10 gates) */
  enforcement_boundary: z.literal(
    "BUILD_TEST_TIME_COVERAGE_ONLY_RUNTIME_ENFORCEMENT_AND_ENROLMENT_ADMISSION_REMAIN_S4_SECTION_10_SOURCE_GATES",
  ),
  evaluator: z.strictObject({ id: z.literal("NONE_SECTION_10_NOT_ACCEPTED") }),
  live_admission: z.strictObject({ id: z.literal("NOT_INSTALLED_NO_GM_WRITER") }),
  historical_verification: z.strictObject({
    canonical_id: Text,
    legacy_contract_suffix: Text,
    ms_same_id: z.boolean(),
  }),
  owner_policy: z.strictObject({ owners: z.array(OwnerPolicyEntrySchema) }),
  audience_projection: z.strictObject({
    audience_fact_kind_ids: TextSet,
    access_classes: TextSet,
  }),
  conversion: z.strictObject({
    rule: z.literal("SI_SUBDAY_V1"),
    factors: z.strictObject({ second: z.literal(1), minute: z.literal(60), hour: z.literal(3600) }),
    qualification: z.literal("TEMPORAL_ORIGIN_V2_WITNESS_ONLY"),
  }),
});

export const GmWaitCatalogueManifestV1Schema = z.strictObject({
  manifest_version: z.literal(1),
  format: z.literal(GM_WAIT_CATALOGUE_FORMAT),
  policy: PolicySchema,
  sources: z.array(SourceEntrySchema),
  rules: z.array(RuleEntrySchema),
  kinds: z.array(KindEntrySchema),
  providers: z.array(ProviderEntrySchema),
  unresolved_declarations: TextSet,
  sites: z.array(SiteEntrySchema),
  closes: z.array(CloseEntrySchema),
  event_triggers: z.array(EventTriggerEntrySchema),
  object_routes: z.array(ObjectRouteEntrySchema),
  extension_dispatch: ExtensionDispatchSchema,
  culture_route: CultureRouteSchema,
  scope: ScopeSchema,
});

const V2Disposition = z.enum([
  "INERT",
  "PASSIVE_PROVEN",
  EPISTEMIC_ACTIONABLE_OR_UNSAFE,
  DISPOSITION_UNDECLARED,
  "INTERRUPTION_GUARDED",
]);

const SourcePolicySchema = z.strictObject({
  algorithm: z.literal("TS_SYNTAX_TREE_SHA256_V1"),
  files: z.array(z.strictObject({ path: Text, sha256: Sha256 })).min(1),
  unproven_declarations: z.literal("DENY"),
});

export const GmWaitCatalogueManifestV2Schema = GmWaitCatalogueManifestV1Schema.extend({
  manifest_version: z.literal(GM_WAIT_CATALOGUE_MANIFEST_VERSION),
  kinds: z.array(KindEntrySchema.extend({ disposition: V2Disposition })),
  providers: z.array(ProviderEntrySchema.extend({ disposition: V2Disposition })),
  policy: PolicySchema.extend({ source_policy: SourcePolicySchema }),
  extension_dispatch: ExtensionDispatchSchema.extend({
    historical_coverage: z.literal("UNRETIRED_DENY"),
  }),
});

export const GmWaitCatalogueManifestSchema = z.discriminatedUnion("manifest_version", [
  GmWaitCatalogueManifestV1Schema,
  GmWaitCatalogueManifestV2Schema,
]);
export type GmWaitCatalogueManifest = z.infer<typeof GmWaitCatalogueManifestSchema>;
export type GmWaitCatalogueManifestV1 = z.infer<typeof GmWaitCatalogueManifestV1Schema>;
export type GmWaitCatalogueManifestV2 = z.infer<typeof GmWaitCatalogueManifestV2Schema>;

// ---------------------------------------------------------------------------------------------
// Canonical form: set-valued lists sorted by their declared string tuples; source-semantic order preserved
// ---------------------------------------------------------------------------------------------

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedStrings = (xs: readonly string[]): string[] => [...xs].sort(cmp);
const sortedBy = <T>(xs: readonly T[], key: (x: T) => string): T[] =>
  [...xs].sort((a, b) => cmp(key(a), key(b)));

/** The declared tuple identity of each keyed section. Everything the manifest keys is listed here and nowhere else. */
export const SECTION_KEYS = {
  sources: (s: GmWaitCatalogueManifest["sources"][number]) =>
    `${s.origin}|${s.page_uuid}|${s.native_pin}`,
  rules: (r: GmWaitCatalogueManifest["rules"][number]) => r.rule_id,
  kinds: (k: GmWaitCatalogueManifest["kinds"][number]) => k.id,
  providers: (p: GmWaitCatalogueManifest["providers"][number]) => `${p.owner}|${p.operation}`,
  sites: (s: GmWaitCatalogueManifest["sites"][number]) => s.site_id,
  closes: (c: GmWaitCatalogueManifest["closes"][number]) => c.name_expr,
  event_triggers: (e: GmWaitCatalogueManifest["event_triggers"][number]) => e.kind,
  object_routes: (r: GmWaitCatalogueManifest["object_routes"][number]) => r.route_id,
  owners: (o: GmWaitCatalogueManifest["policy"]["owner_policy"]["owners"][number]) => o.owner,
} as const;

type Kind = GmWaitCatalogueManifest["kinds"][number];
type Provider = GmWaitCatalogueManifest["providers"][number];
type Source = GmWaitCatalogueManifest["sources"][number];
type Site = GmWaitCatalogueManifest["sites"][number];

const normKind = (k: Kind): Kind => ({
  ...k,
  rc: sortedStrings(k.rc),
  legacy_refs: sortedStrings(k.legacy_refs),
  later_legacy_refs: sortedStrings(k.later_legacy_refs),
  alternate_refs: sortedStrings(k.alternate_refs),
});
const normProvider = (p: Provider): Provider => ({
  ...p,
  effect_kind_ids: sortedStrings(p.effect_kind_ids),
  site_ids: sortedStrings(p.site_ids),
  found_by: sortedStrings(p.found_by) as Provider["found_by"],
});
const normSource = (s: Source): Source =>
  s.origin === "CODE_RULE"
    ? { ...s, rule_ids: sortedStrings(s.rule_ids) }
    : { ...s, clauses: sortedStrings(s.clauses) };
const normSite = (s: Site): Site => ({ ...s, members: sortedStrings(s.members) });
const normAudience = (
  a: GmWaitCatalogueManifest["policy"]["audience_projection"],
): GmWaitCatalogueManifest["policy"]["audience_projection"] => ({
  audience_fact_kind_ids: sortedStrings(a.audience_fact_kind_ids),
  access_classes: sortedStrings(a.access_classes),
});
const normScope = (s: GmWaitCatalogueManifest["scope"]): GmWaitCatalogueManifest["scope"] => ({
  ...s,
  ast_roots: sortedStrings(s.ast_roots),
  reflection_roots: sortedStrings(s.reflection_roots),
  excluded_roots: sortedStrings(s.excluded_roots),
  census_methods: sortedStrings(
    s.census_methods,
  ) as GmWaitCatalogueManifest["scope"]["census_methods"],
});

const normSourcePolicy = (p: GmWaitCatalogueManifestV2["policy"]["source_policy"]) => ({
  ...p,
  files: sortedBy(p.files, (f) => f.path),
});

/**
 * Sorts every set-valued list by its declared tuple (BLUE R-1: "Canonically sort set-valued lists by their declared string tuples").
 * `authority_lineage` (source-semantic order) is NOT a set and keeps its order. Takes an already schema-valid manifest; duplicates
 * are not removed here (see `validateManifest`).
 */
export function normalizeManifest<T extends GmWaitCatalogueManifest>(m: T): T {
  return {
    ...m,
    policy: {
      ...m.policy,
      owner_policy: {
        owners: sortedBy(m.policy.owner_policy.owners, SECTION_KEYS.owners).map((o) => ({
          owner: o.owner,
          facets: sortedStrings(o.facets),
        })),
      },
      audience_projection: normAudience(m.policy.audience_projection),
      ...(m.manifest_version === 2
        ? { source_policy: normSourcePolicy(m.policy.source_policy) }
        : {}),
    },
    sources: sortedBy(m.sources, SECTION_KEYS.sources).map(normSource),
    rules: sortedBy(m.rules, SECTION_KEYS.rules),
    kinds: sortedBy(m.kinds, SECTION_KEYS.kinds).map(normKind),
    providers: sortedBy(m.providers, SECTION_KEYS.providers).map(normProvider),
    unresolved_declarations: sortedStrings(m.unresolved_declarations),
    sites: sortedBy(m.sites, SECTION_KEYS.sites).map(normSite),
    closes: sortedBy(m.closes, SECTION_KEYS.closes),
    event_triggers: sortedBy(m.event_triggers, SECTION_KEYS.event_triggers),
    object_routes: sortedBy(m.object_routes, SECTION_KEYS.object_routes),
    extension_dispatch: {
      ...m.extension_dispatch,
      extension_owners: sortedStrings(m.extension_dispatch.extension_owners),
    },
    scope: normScope(m.scope),
  };
}

export const MANIFEST_VIOLATION_CODES = [
  "SCHEMA_INVALID",
  "DUPLICATE_TUPLE",
  "UNSORTED_SET",
  "UNKNOWN_REF",
  "UNPROVEN_DISPOSITION",
] as const;
export type ManifestViolationCode = (typeof MANIFEST_VIOLATION_CODES)[number];
export interface ManifestViolation {
  readonly code: ManifestViolationCode;
  readonly section: string;
  readonly detail: string;
}

const duplicatesOf = (keys: readonly string[]): string[] => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup].sort(cmp);
};
const isSortedStrictly = (keys: readonly string[]): boolean =>
  keys.every((k, i) => i === 0 || cmp(keys[i - 1] as string, k) <= 0);

/**
 * Strict structural and referential validation of a manifest AS PRESENTED (not as normalised). Returns every violation found:
 * a strict-schema failure, a duplicated tuple identity in any keyed section (or a duplicated trigger across providers, which the
 * provider registry itself refuses), a set-valued section presented out of canonical order, and a rule reference naming no rule.
 * An empty list means the value is a well-formed manifest; it says nothing about coverage (see `catalogueCoverageViolations`).
 */
export function validateManifest(raw: unknown): readonly ManifestViolation[] {
  const parsed = GmWaitCatalogueManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.slice(0, 8).map((i) => ({
      code: "SCHEMA_INVALID" as const,
      section: String(i.path[0] ?? ""),
      detail: `${i.path.join(".")}: ${i.message}`,
    }));
  }
  const m = parsed.data;
  const out: ManifestViolation[] = [];
  const sections: readonly (readonly [string, readonly string[]])[] = [
    ["sources", m.sources.map(SECTION_KEYS.sources)],
    ["rules", m.rules.map(SECTION_KEYS.rules)],
    ["kinds", m.kinds.map(SECTION_KEYS.kinds)],
    ["providers", m.providers.map(SECTION_KEYS.providers)],
    ["sites", m.sites.map(SECTION_KEYS.sites)],
    ["closes", m.closes.map(SECTION_KEYS.closes)],
    ["event_triggers", m.event_triggers.map(SECTION_KEYS.event_triggers)],
    ["object_routes", m.object_routes.map(SECTION_KEYS.object_routes)],
    ["owners", m.policy.owner_policy.owners.map(SECTION_KEYS.owners)],
    ["unresolved_declarations", m.unresolved_declarations],
    ...(m.manifest_version === 2
      ? ([
          ["policy.source_policy.files", m.policy.source_policy.files.map((f) => f.path)],
          ["scope.ast_roots", m.scope.ast_roots],
          ["scope.reflection_roots", m.scope.reflection_roots],
          ["scope.excluded_roots", m.scope.excluded_roots],
          ["scope.census_methods", m.scope.census_methods],
          ["extension_dispatch.extension_owners", m.extension_dispatch.extension_owners],
          [
            "policy.audience_projection.audience_fact_kind_ids",
            m.policy.audience_projection.audience_fact_kind_ids,
          ],
          [
            "policy.audience_projection.access_classes",
            m.policy.audience_projection.access_classes,
          ],
          ...m.policy.owner_policy.owners.map(
            (o) => [`owners.${o.owner}.facets`, o.facets] as const,
          ),
          ...m.kinds.flatMap(
            (k) =>
              [
                [`kinds.${k.id}.rc`, k.rc],
                [`kinds.${k.id}.legacy_refs`, k.legacy_refs],
                [`kinds.${k.id}.later_legacy_refs`, k.later_legacy_refs],
                [`kinds.${k.id}.alternate_refs`, k.alternate_refs],
              ] as const,
          ),
          ...m.providers.flatMap(
            (p) =>
              [
                [`providers.${SECTION_KEYS.providers(p)}.found_by`, p.found_by],
                [`providers.${SECTION_KEYS.providers(p)}.site_ids`, p.site_ids],
                [`providers.${SECTION_KEYS.providers(p)}.effect_kind_ids`, p.effect_kind_ids],
              ] as const,
          ),
          ...m.sites.map((s) => [`sites.${s.site_id}.members`, s.members] as const),
          ...m.sources.map(
            (s) =>
              [
                `sources.${SECTION_KEYS.sources(s)}`,
                s.origin === "CODE_RULE" ? s.rule_ids : s.clauses,
              ] as const,
          ),
        ] as const)
      : []),
  ];
  for (const [section, keys] of sections) {
    for (const d of duplicatesOf(keys)) out.push({ code: "DUPLICATE_TUPLE", section, detail: d });
    if (!isSortedStrictly(keys))
      out.push({ code: "UNSORTED_SET", section, detail: "not in canonical order" });
  }
  const triggers = m.providers.flatMap((p) => (p.event_trigger === null ? [] : [p.event_trigger]));
  for (const d of duplicatesOf(triggers))
    out.push({ code: "DUPLICATE_TUPLE", section: "providers.event_trigger", detail: d });
  const ruleIds = new Set(m.rules.map((r) => r.rule_id));
  const refs: readonly (readonly [string, readonly string[]])[] = [
    ["kinds.rule_ref", m.kinds.flatMap((k) => [k.rule_ref])],
    [
      "kinds.legacy_refs",
      m.kinds.flatMap((k) => [...k.legacy_refs, ...k.later_legacy_refs, ...k.alternate_refs]),
    ],
    ["providers.rule_ref", m.providers.map((p) => p.rule_ref)],
    ["sources.rule_ids", m.sources.flatMap((s) => (s.origin === "CODE_RULE" ? s.rule_ids : []))],
  ];
  for (const [section, ids] of refs)
    for (const id of ids)
      if (!ruleIds.has(id)) out.push({ code: "UNKNOWN_REF", section, detail: id });
  if (m.manifest_version === 2) {
    // Positive classifications require both independently accepted all-enrolled evaluation and
    // per-member source certificates. This version has no way to assert either proof.
    for (const [section, entries] of [
      ["kinds", m.kinds],
      ["providers", m.providers],
    ] as const)
      for (const e of entries)
        if (
          e.disposition !== DISPOSITION_UNDECLARED &&
          e.disposition !== EPISTEMIC_ACTIONABLE_OR_UNSAFE
        )
          out.push({
            code: "UNPROVEN_DISPOSITION",
            section,
            detail: `${"id" in e ? e.id : SECTION_KEYS.providers(e)}: ${e.disposition}`,
          });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Canonical bytes and the digest (the one existing canonical JSON, the one existing hash)
// ---------------------------------------------------------------------------------------------

/**
 * The exact UTF-8 canonical JSON of the validated, normalised manifest. Throws on any `validateManifest` violation other than
 * `UNSORTED_SET` (an input in any set order has one canonical form), so a malformed or duplicated manifest never gets a digest.
 */
export function catalogueCanonicalBytes(m: unknown): string {
  const violations = validateManifest(m).filter((v) => v.code !== "UNSORTED_SET");
  if (violations.length > 0) {
    const v = violations[0] as ManifestViolation;
    throw new TypeError(`gm-wait catalogue: ${v.code} in ${v.section}: ${v.detail}`);
  }
  const parsed = GmWaitCatalogueManifestSchema.parse(m);
  return canonicalJson(normalizeManifest(parsed));
}

/** Lowercase SHA-256 of `catalogueCanonicalBytes`: the value of `gm_wait.catalogue_sha256`. */
export const catalogueDigest = (m: unknown): string => sha256Text(catalogueCanonicalBytes(m));

/**
 * The STRUCTURAL fingerprint of a registered value schema: sha256 of the canonical JSON Schema its zod definition renders. It does
 * not capture refinement bodies or the `admits` predicates of legacy/alternate rules (those stay bound by the rule pins and the
 * historical-verification identity); the manifest says so in `policy.value_schema_fp_scope`.
 */
export function valueSchemaFingerprint(schema: unknown): string {
  return sha256Text(
    canonicalJson(z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any", io: "input" })),
  );
}

// ---------------------------------------------------------------------------------------------
// Supplied-digest verdicts (unknown, stale, forged and malformed are denied)
// ---------------------------------------------------------------------------------------------

export const DIGEST_VERDICTS = [
  "OK_CURRENT",
  "DIGEST_MALFORMED",
  "DIGEST_UNKNOWN",
  "DIGEST_STALE_RETAINED",
  "MANIFEST_BYTES_MISMATCH",
] as const;
export type DigestVerdict = (typeof DIGEST_VERDICTS)[number];

export interface DigestAuthority {
  /** the digest of the build's current manifest */
  readonly current: string;
  /** every retained manifest, by its digest (the canonical bytes themselves, in the same order as the digests are listed) */
  readonly retained: ReadonlyMap<string, string>;
}

/**
 * What an INITIAL's `catalogue_sha256` is worth today. The value must be 64 lowercase hex; it must name a RETAINED manifest whose
 * bytes really hash to it (a retained file that does not is `MANIFEST_BYTES_MISMATCH`: forged or corrupt, never trusted by name);
 * and a fresh INITIAL is accepted only if it is the CURRENT manifest (`OK_CURRENT`). A retained manifest that is not current is
 * `DIGEST_STALE_RETAINED`: it can resolve a historical identity but never admits a fresh wait. Pure; hashes only retained bytes.
 */
export function verifySuppliedDigest(supplied: unknown, authority: DigestAuthority): DigestVerdict {
  if (typeof supplied !== "string" || !/^[0-9a-f]{64}$/.test(supplied)) return "DIGEST_MALFORMED";
  const bytes = authority.retained.get(supplied);
  if (bytes === undefined) return "DIGEST_UNKNOWN";
  if (sha256Text(bytes) !== supplied) return "MANIFEST_BYTES_MISMATCH";
  return supplied === authority.current ? "OK_CURRENT" : "DIGEST_STALE_RETAINED";
}

// ---------------------------------------------------------------------------------------------
// Default-deny verdict: nothing is permitted by this catalogue
// ---------------------------------------------------------------------------------------------

export interface StaticVerdict {
  readonly disposition: typeof DISPOSITION_UNDECLARED;
  readonly epistemic: typeof EPISTEMIC_ACTIONABLE_OR_UNSAFE;
  /** the type is the literal `false`: no member of this catalogue is a production permission */
  readonly permits: false;
  readonly coverage: "IN_MANIFEST" | "NOT_IN_MANIFEST";
}

export interface CapabilityProbe {
  readonly kind?: string;
  readonly provider?: string;
  readonly owner?: string;
}

/**
 * The static verdict for any capability. Always `UNDECLARED` / `ACTIONABLE_OR_UNSAFE` / `permits: false`; `coverage` only says
 * whether the manifest names the probed capability at all. An unknown capability is therefore `NOT_IN_MANIFEST` and still denied.
 */
export function staticVerdict(m: GmWaitCatalogueManifest, probe: CapabilityProbe): StaticVerdict {
  const inKinds = probe.kind !== undefined && m.kinds.some((k) => k.id === probe.kind);
  const inProviders =
    probe.provider !== undefined &&
    m.providers.some((p) => `${p.owner}|${p.operation}` === probe.provider);
  const inOwners =
    probe.owner !== undefined && m.policy.owner_policy.owners.some((o) => o.owner === probe.owner);
  return {
    disposition: DISPOSITION_UNDECLARED,
    epistemic: EPISTEMIC_ACTIONABLE_OR_UNSAFE,
    permits: false,
    coverage: inKinds || inProviders || inOwners ? "IN_MANIFEST" : "NOT_IN_MANIFEST",
  };
}

// ---------------------------------------------------------------------------------------------
// Coverage: a census taken from the actual declarations against the manifest
// ---------------------------------------------------------------------------------------------

/** The part of a manifest that is taken from the code, never authored: what `tools/gen-gm-wait-catalogue.ts` measures. */
export interface CatalogueCensus {
  readonly historical_verification: GmWaitCatalogueManifest["policy"]["historical_verification"];
  readonly owner_policy: GmWaitCatalogueManifest["policy"]["owner_policy"];
  readonly audience_projection: GmWaitCatalogueManifest["policy"]["audience_projection"];
  readonly sources: readonly Extract<
    GmWaitCatalogueManifest["sources"][number],
    { origin: "CODE_RULE" }
  >[];
  readonly rules: GmWaitCatalogueManifest["rules"];
  readonly kinds: GmWaitCatalogueManifest["kinds"];
  readonly providers: GmWaitCatalogueManifest["providers"];
  readonly unresolved_declarations: GmWaitCatalogueManifest["unresolved_declarations"];
  readonly sites: GmWaitCatalogueManifest["sites"];
  readonly closes: GmWaitCatalogueManifest["closes"];
  readonly event_triggers: GmWaitCatalogueManifest["event_triggers"];
  readonly object_routes: GmWaitCatalogueManifest["object_routes"];
  readonly extension_dispatch: GmWaitCatalogueManifest["extension_dispatch"];
  readonly culture_route: GmWaitCatalogueManifest["culture_route"];
  readonly scope: GmWaitCatalogueManifest["scope"];
}

export interface CatalogueCensusV2 extends CatalogueCensus {
  readonly source_policy: GmWaitCatalogueManifestV2["policy"]["source_policy"];
}

export const COVERAGE_VIOLATION_CODES = [
  "KIND_NOT_IN_MANIFEST",
  "KIND_MISSING_FROM_CENSUS",
  "KIND_CHANGED",
  "RULE_NOT_IN_MANIFEST",
  "RULE_MISSING_FROM_CENSUS",
  "SOURCE_NOT_IN_MANIFEST",
  "SOURCE_MISSING_FROM_CENSUS",
  "SOURCE_CHANGED",
  "OWNER_FACET_NOT_IN_MANIFEST",
  "OWNER_FACET_MISSING_FROM_CENSUS",
  "PROVIDER_NOT_IN_MANIFEST",
  "PROVIDER_MISSING_FROM_CENSUS",
  "PROVIDER_CHANGED",
  "UNRESOLVED_PROVIDER_DECLARATION",
  "CENSUS_METHODS_DISAGREE",
  "SITE_NOT_IN_MANIFEST",
  "SITE_MISSING_FROM_CENSUS",
  "SITE_MEMBERS_CHANGED",
  "OPAQUE_REGISTRY_SITE",
  "UNRESOLVED_REGISTRY_MEMBER",
  "UNRESOLVED_CLOSE_DECLARATION",
  "CLOSE_NOT_IN_MANIFEST",
  "CLOSE_MISSING_FROM_CENSUS",
  "CLOSE_CHANGED",
  "EVENT_TRIGGER_NOT_IN_MANIFEST",
  "EVENT_TRIGGER_MISSING_FROM_CENSUS",
  "EVENT_TRIGGER_CHANGED",
  "OBJECT_ROUTE_NOT_IN_MANIFEST",
  "OBJECT_ROUTE_MISSING_FROM_CENSUS",
  "OBJECT_ROUTE_CHANGED",
  "EXTENSION_OWNER_NOT_IN_MANIFEST",
  "EXTENSION_DISPATCH_CHANGED",
  "CULTURE_ROUTE_CHANGED",
  "POLICY_PIN_DRIFT",
  "SOURCE_POLICY_CHANGED",
  "SCOPE_CHANGED",
] as const;
export type CoverageViolationCode = (typeof COVERAGE_VIOLATION_CODES)[number];
export interface CoverageViolation {
  readonly code: CoverageViolationCode;
  readonly key: string;
}

const bytesOf = (v: unknown): string => canonicalJson(v);

/** Compares two keyed lists: entries only in the census, only in the manifest, and entries present in both but different. */
function diffKeyed<T>(
  census: readonly T[],
  manifest: readonly T[],
  key: (x: T) => string,
  normalize: (x: T) => T,
  codes: {
    readonly added: CoverageViolationCode;
    readonly missing: CoverageViolationCode;
    readonly changed?: CoverageViolationCode;
  },
): CoverageViolation[] {
  const out: CoverageViolation[] = [];
  const have = new Map(manifest.map((x) => [key(x), x] as const));
  const seen = new Set<string>();
  for (const c of census) {
    const k = key(c);
    seen.add(k);
    const m = have.get(k);
    if (m === undefined) out.push({ code: codes.added, key: k });
    else if (codes.changed !== undefined && bytesOf(normalize(m)) !== bytesOf(normalize(c)))
      out.push({ code: codes.changed, key: k });
  }
  for (const k of have.keys()) if (!seen.has(k)) out.push({ code: codes.missing, key: k });
  return out;
}

/**
 * Every way a census taken from the actual declarations differs from the manifest (empty list: the manifest covers the census
 * exactly). Pure; a census in any set order gives the same answer. A missing branch, a duplicate-free but extra provider,
 * a late extension owner, a changed policy pin, an opaque registry site or two census methods that disagree are all violations,
 * so each denies the digest or fails the build.
 */
export function catalogueCoverageViolations(
  census: CatalogueCensus,
  manifest: GmWaitCatalogueManifest,
): readonly CoverageViolation[] {
  const out: CoverageViolation[] = [];
  out.push(
    ...diffKeyed(census.kinds, manifest.kinds, SECTION_KEYS.kinds, normKind, {
      added: "KIND_NOT_IN_MANIFEST",
      missing: "KIND_MISSING_FROM_CENSUS",
      changed: "KIND_CHANGED",
    }),
    ...diffKeyed(census.rules, manifest.rules, SECTION_KEYS.rules, (x) => x, {
      added: "RULE_NOT_IN_MANIFEST",
      missing: "RULE_MISSING_FROM_CENSUS",
    }),
    ...diffKeyed(
      census.sources,
      manifest.sources.filter((s) => s.origin === "CODE_RULE"),
      SECTION_KEYS.sources,
      normSource as (x: (typeof census.sources)[number]) => (typeof census.sources)[number],
      {
        added: "SOURCE_NOT_IN_MANIFEST",
        missing: "SOURCE_MISSING_FROM_CENSUS",
        changed: "SOURCE_CHANGED",
      },
    ),
    ...diffKeyed(
      census.owner_policy.owners.flatMap((o) =>
        o.facets.map((f) => ({ owner: o.owner, facet: f })),
      ),
      manifest.policy.owner_policy.owners.flatMap((o) =>
        o.facets.map((f) => ({ owner: o.owner, facet: f })),
      ),
      (x) => `${x.owner}|${x.facet}`,
      (x) => x,
      { added: "OWNER_FACET_NOT_IN_MANIFEST", missing: "OWNER_FACET_MISSING_FROM_CENSUS" },
    ),
    ...diffKeyed(census.providers, manifest.providers, SECTION_KEYS.providers, normProvider, {
      added: "PROVIDER_NOT_IN_MANIFEST",
      missing: "PROVIDER_MISSING_FROM_CENSUS",
      changed: "PROVIDER_CHANGED",
    }),
    ...diffKeyed(census.sites, manifest.sites, SECTION_KEYS.sites, normSite, {
      added: "SITE_NOT_IN_MANIFEST",
      missing: "SITE_MISSING_FROM_CENSUS",
      changed: "SITE_MEMBERS_CHANGED",
    }),
    ...diffKeyed(census.closes, manifest.closes, SECTION_KEYS.closes, (x) => x, {
      added: "CLOSE_NOT_IN_MANIFEST",
      missing: "CLOSE_MISSING_FROM_CENSUS",
      changed: "CLOSE_CHANGED",
    }),
    ...diffKeyed(
      census.event_triggers,
      manifest.event_triggers,
      SECTION_KEYS.event_triggers,
      (x) => x,
      {
        added: "EVENT_TRIGGER_NOT_IN_MANIFEST",
        missing: "EVENT_TRIGGER_MISSING_FROM_CENSUS",
        changed: "EVENT_TRIGGER_CHANGED",
      },
    ),
    ...diffKeyed(
      census.object_routes,
      manifest.object_routes,
      SECTION_KEYS.object_routes,
      (x) => x,
      {
        added: "OBJECT_ROUTE_NOT_IN_MANIFEST",
        missing: "OBJECT_ROUTE_MISSING_FROM_CENSUS",
        changed: "OBJECT_ROUTE_CHANGED",
      },
    ),
  );
  // a declaration the reflection could not resolve, a provider one census method alone found, an opaque registry site
  for (const d of census.unresolved_declarations)
    out.push({ code: "UNRESOLVED_PROVIDER_DECLARATION", key: d });
  for (const p of census.providers)
    if (p.found_by.length !== 2)
      out.push({ code: "CENSUS_METHODS_DISAGREE", key: SECTION_KEYS.providers(p) });
  for (const s of census.sites)
    if (s.opaque) out.push({ code: "OPAQUE_REGISTRY_SITE", key: s.site_id });
  // extension dispatch: a late owner is named by itself; any other change of the dispatch structure is its own code
  const have = new Set(manifest.extension_dispatch.extension_owners);
  for (const o of census.extension_dispatch.extension_owners)
    if (!have.has(o)) out.push({ code: "EXTENSION_OWNER_NOT_IN_MANIFEST", key: o });
  const seenOwners = new Set(census.extension_dispatch.extension_owners);
  if (
    census.extension_dispatch.structure_sha256 !== manifest.extension_dispatch.structure_sha256 ||
    census.extension_dispatch.early_return_count !==
      manifest.extension_dispatch.early_return_count ||
    manifest.extension_dispatch.extension_owners.some((o) => !seenOwners.has(o))
  )
    out.push({ code: "EXTENSION_DISPATCH_CHANGED", key: "storeBindings" });
  if (bytesOf(census.culture_route) !== bytesOf(manifest.culture_route))
    out.push({ code: "CULTURE_ROUTE_CHANGED", key: census.culture_route.provider });
  if (bytesOf(census.historical_verification) !== bytesOf(manifest.policy.historical_verification))
    out.push({ code: "POLICY_PIN_DRIFT", key: "historical_verification" });
  if (
    bytesOf(normAudience(census.audience_projection)) !==
    bytesOf(normAudience(manifest.policy.audience_projection))
  )
    out.push({ code: "POLICY_PIN_DRIFT", key: "audience_projection" });
  if (bytesOf(normScope(census.scope)) !== bytesOf(normScope(manifest.scope)))
    out.push({ code: "SCOPE_CHANGED", key: "scope" });
  if (manifest.manifest_version === 2) {
    if ("source_policy" in census) {
      const policy = (census as CatalogueCensusV2).source_policy;
      out.push(
        ...diffKeyed(
          policy.files,
          manifest.policy.source_policy.files,
          (f) => f.path,
          (f) => f,
          {
            added: "SOURCE_POLICY_CHANGED",
            missing: "SOURCE_POLICY_CHANGED",
            changed: "SOURCE_POLICY_CHANGED",
          },
        ),
      );
    } else {
      out.push({ code: "SOURCE_POLICY_CHANGED", key: "source_policy" });
    }
    for (const s of census.sites)
      for (const m of s.members)
        if (m.startsWith("UNRESOLVED:"))
          out.push({ code: "UNRESOLVED_REGISTRY_MEMBER", key: `${s.site_id}:${m}` });
    for (const c of census.closes)
      if (c.name_value === null)
        out.push({ code: "UNRESOLVED_CLOSE_DECLARATION", key: c.name_expr });
  }
  return out;
}
