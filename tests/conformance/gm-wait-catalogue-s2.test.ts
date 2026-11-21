// F-014B B1 S2 - the GM-wait catalogue manifest core: strict schema, canonical bytes and digest, duplicate and unknown refusal, supplied-digest
// verdicts, default deny and the coverage comparison. MECHANISM ONLY, NON-WRITING. Every manifest here is a hand-written TEST fixture; nothing
// certifies a capability, and no verdict here is a production permission.
//
// Non-tautology rules: the expected bytes and digest are computed by a second, independent canonicaliser and node:crypto, not by the helper under
// test; every negative is a perturbation the test constructs and the helper never receives as an expectation.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CanonicalTimeSchema, SunsetEnrollmentSchema } from "@immortalis/contracts";
import {
  COVERAGE_VIOLATION_CODES,
  DIGEST_VERDICTS,
  GmWaitCatalogueManifestSchema,
  SECTION_KEYS,
  catalogueCanonicalBytes,
  catalogueCoverageViolations,
  catalogueDigest,
  normalizeManifest,
  staticVerdict,
  validateManifest,
  valueSchemaFingerprint,
  verifySuppliedDigest,
  type GmWaitCatalogueManifest,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  censusOf,
  clone,
  independentCanonical,
  miniManifest,
  reverseKeys,
  sha,
} from "../support/b1-s2s3-fixtures.ts";

const independentDigest = (m: unknown): string =>
  createHash("sha256")
    .update(independentCanonical(normalizeManifest(GmWaitCatalogueManifestSchema.parse(m))), "utf8")
    .digest("hex");

describe("[S2] [mechanism only] manifest schema and canonical bytes", () => {
  it("[S2] [mechanism only] the hand-written fixture is a well-formed manifest with no violation", () => {
    expect(validateManifest(miniManifest())).toEqual([]);
  });

  it("[S2] [mechanism only] the canonical bytes and the SHA-256 equal an independent canonicaliser and hash of the normalised manifest", () => {
    const m = miniManifest();
    const bytes = catalogueCanonicalBytes(m);
    expect(bytes).toBe(independentCanonical(normalizeManifest(m)));
    expect(catalogueDigest(m)).toBe(createHash("sha256").update(bytes, "utf8").digest("hex"));
    expect(catalogueDigest(m)).toBe(independentDigest(m));
    expect(catalogueDigest(m)).toMatch(/^[0-9a-f]{64}$/);
    // no wrapper: no BOM, no newline, no insignificant whitespace
    expect(bytes.startsWith("{")).toBe(true);
    expect(bytes.endsWith("}")).toBe(true);
    expect(bytes).not.toMatch(/\n|: |, /);
    expect(bytes.includes(String.fromCharCode(0xfeff))).toBe(false);
  });

  it("[S2] [mechanism only] the same input hashes the same every time", () => {
    const m = miniManifest();
    const first = catalogueDigest(m);
    for (let i = 0; i < 5; i++) expect(catalogueDigest(clone(m))).toBe(first);
  });

  it("[S2] [mechanism only] a permutation of object-field order leaves the bytes and digest unchanged", () => {
    const m = miniManifest();
    expect(catalogueCanonicalBytes(reverseKeys(m))).toBe(catalogueCanonicalBytes(m));
    expect(catalogueDigest(reverseKeys(m))).toBe(catalogueDigest(m));
  });

  it("[S2] [mechanism only] a permutation of every set-valued list leaves the digest unchanged, and the presented order is reported", () => {
    const m = miniManifest();
    const p = clone(m);
    p.sources.reverse();
    p.rules.reverse();
    p.kinds.reverse();
    p.providers.reverse();
    p.policy.owner_policy.owners.reverse();
    for (const o of p.policy.owner_policy.owners) o.facets.reverse();
    p.policy.audience_projection.audience_fact_kind_ids.reverse();
    p.policy.audience_projection.access_classes.reverse();
    for (const k of p.kinds) k.rc.reverse();
    expect(catalogueDigest(p)).toBe(catalogueDigest(m));
    expect(validateManifest(p).some((v) => v.code === "UNSORTED_SET")).toBe(true);
    expect(validateManifest(m).some((v) => v.code === "UNSORTED_SET")).toBe(false);
  });

  it("[S2] [mechanism only] a source-semantic array (the authority lineage) is order-sensitive: reordering it changes the digest", () => {
    const m = miniManifest();
    const p = clone(m);
    const lineage = (
      p.rules.find(
        (r) => r.source_ref.authority_lineage.length === 2,
      ) as GmWaitCatalogueManifest["rules"][number]
    ).source_ref;
    lineage.authority_lineage.reverse();
    expect(catalogueDigest(p)).not.toBe(catalogueDigest(m));
  });

  it("[S2] [mechanism only] every change to a bound source pin, policy identity or entry field changes the digest", () => {
    const base = catalogueDigest(miniManifest());
    const mutations: Record<string, (m: GmWaitCatalogueManifest) => void> = {
      "adopted source native pin": (m) => {
        const s = m.sources.find((x) => x.origin === "ADOPTED_INPUT");
        if (s?.origin === "ADOPTED_INPUT") s.native_pin = "2026-11-16T15:18:44.684Z";
      },
      "ratification pin": (m) => {
        const s = m.sources.find((x) => x.origin === "ADOPTED_INPUT");
        if (s?.origin === "ADOPTED_INPUT" && s.ratification)
          s.ratification.native_pin = "2026-11-16T15:29:12.184Z";
      },
      "adopted clause set": (m) => {
        const s = m.sources.find((x) => x.origin === "ADOPTED_INPUT");
        if (s?.origin === "ADOPTED_INPUT") s.clauses = ["T0"];
      },
      "code rule native pin": (m) => {
        const s = m.sources.find((x) => x.origin === "CODE_RULE");
        if (s) s.native_pin = "2026-09-25T13:44:22.669Z";
      },
      "historical verification identity": (m) => {
        m.policy.historical_verification.canonical_id += "+SEGMENT";
      },
      "legacy contract suffix": (m) => {
        m.policy.historical_verification.legacy_contract_suffix = "+OTHER";
      },
      "owner policy facet": (m) => {
        (m.policy.owner_policy.owners[0] as { facets: string[] }).facets.push("f3");
      },
      "audience fact kind": (m) => {
        m.policy.audience_projection.audience_fact_kind_ids.push("kind_c");
      },
      "access class": (m) => {
        m.policy.audience_projection.access_classes.push("x.three");
      },
      "rule clause": (m) => {
        (m.rules[0] as { source_ref: { clause: string } }).source_ref.clause += "!";
      },
      "kind owner": (m) => {
        (m.kinds[0] as { owner: string }).owner = "gamma";
      },
      "kind lifecycle": (m) => {
        (m.kinds[0] as { lifecycle: "SEALED" | "ADVANCING" }).lifecycle = "ADVANCING";
      },
      "kind schema fingerprint": (m) => {
        (m.kinds[0] as { value_schema_fp: string }).value_schema_fp = sha("other");
      },
      "provider status": (m) => {
        (m.providers[1] as { status: "REGISTERED" | "DORMANT" }).status = "REGISTERED";
      },
      "site member": (m) => {
        (m.sites[0] as { members: string[] }).members.push("beta|beta-op");
      },
      "close value": (m) => {
        (m.closes[0] as { name_value: string | null }).name_value = "changed";
      },
      "object route": (m) => {
        m.object_routes.push({ route_id: "object_literal@gamma", kind: "OBJECT_LITERAL" });
      },
      "extension dispatch structure": (m) => {
        m.extension_dispatch.structure_sha256 = sha("another-structure");
      },
      "culture route message": (m) => {
        m.culture_route.declared_close_basis_message_sha256 = sha("another-message");
      },
      "scope root": (m) => {
        m.scope.ast_roots.push("c/src");
      },
    };
    const seen = new Set<string>([base]);
    for (const [name, mutate] of Object.entries(mutations)) {
      const m = miniManifest();
      mutate(m);
      const d = catalogueDigest(m);
      expect(d, name).not.toBe(base);
      expect(seen.has(d), `${name} collides with another mutation`).toBe(false);
      seen.add(d);
    }
  });
});

describe("[S2] [mechanism only] default deny is structural: nothing but UNDECLARED and ACTIONABLE_OR_UNSAFE is representable", () => {
  it("[S2] [mechanism only] a literal that would classify a member safe is refused by the strict schema, so no digest exists for it", () => {
    const changes: Record<string, (m: Record<string, unknown>) => void> = {
      "epistemic INTERRUPTION_GUARDED": (m) =>
        ((m["policy"] as Record<string, unknown>)["epistemic"] = "INTERRUPTION_GUARDED"),
      "default disposition INERT": (m) =>
        ((m["policy"] as Record<string, unknown>)["default_disposition"] = "INERT"),
      "evaluator id": (m) =>
        (((m["policy"] as Record<string, unknown>)["evaluator"] as Record<string, unknown>)["id"] =
          "SECTION_10_ACCEPTED"),
      "live admission id": (m) =>
        (((m["policy"] as Record<string, unknown>)["live_admission"] as Record<string, unknown>)[
          "id"
        ] = "INSTALLED"),
      "conversion hour factor": (m) =>
        ((
          ((m["policy"] as Record<string, unknown>)["conversion"] as Record<string, unknown>)[
            "factors"
          ] as Record<string, unknown>
        )["hour"] = 60),
      "kind disposition PASSIVE_PROVEN": (m) =>
        (((m["kinds"] as Record<string, unknown>[])[0] as Record<string, unknown>)["disposition"] =
          "PASSIVE_PROVEN"),
      "provider disposition INERT": (m) =>
        (((m["providers"] as Record<string, unknown>[])[0] as Record<string, unknown>)[
          "disposition"
        ] = "INERT"),
      "extension group history verified": (m) =>
        ((m["extension_dispatch"] as Record<string, unknown>)[
          "historical_verification_of_extension_groups"
        ] = "VERIFIED"),
    };
    for (const [name, change] of Object.entries(changes)) {
      const m = clone(miniManifest()) as unknown as Record<string, unknown>;
      change(m);
      expect(validateManifest(m)[0]?.code, name).toBe("SCHEMA_INVALID");
      expect(() => catalogueDigest(m), name).toThrow();
    }
  });

  it("[S2] [mechanism only] the static verdict is UNDECLARED, ACTIONABLE_OR_UNSAFE and never a permission, for a covered and an unknown capability alike", () => {
    const m = miniManifest();
    const probes = [
      { kind: "alpha_one" },
      { provider: "alpha|alpha-op" },
      { owner: "beta" },
      { kind: "no_such_kind" },
      { provider: "zz|zz-op" },
      { owner: "zz" },
      {},
    ];
    for (const p of probes) {
      const v = staticVerdict(m, p);
      expect(v.disposition).toBe("UNDECLARED");
      expect(v.epistemic).toBe("ACTIONABLE_OR_UNSAFE");
      expect(v.permits).toBe(false);
    }
    expect(staticVerdict(m, { kind: "alpha_one" }).coverage).toBe("IN_MANIFEST");
    expect(staticVerdict(m, { kind: "no_such_kind" }).coverage).toBe("NOT_IN_MANIFEST");
    expect(staticVerdict(m, {}).coverage).toBe("NOT_IN_MANIFEST");
  });
});

describe("[S2] [mechanism only] strict structure, duplicates and unknown references are refused", () => {
  it("[S2] [mechanism only] an unknown member at any depth, or a missing member, is a schema violation and gets no digest", () => {
    const top = clone(miniManifest()) as unknown as Record<string, unknown>;
    top["extra"] = 1;
    const nested = clone(miniManifest()) as unknown as { policy: Record<string, unknown> };
    nested.policy["extra"] = 1;
    const deep = clone(miniManifest()) as unknown as { kinds: Record<string, unknown>[] };
    (deep.kinds[0] as Record<string, unknown>)["extra"] = 1;
    const missing = clone(miniManifest()) as unknown as Record<string, unknown>;
    delete missing["scope"];
    for (const bad of [top, nested, deep, missing]) {
      expect(validateManifest(bad)[0]?.code).toBe("SCHEMA_INVALID");
      expect(() => catalogueDigest(bad)).toThrow();
    }
  });

  it("[S2] [mechanism only] a duplicated tuple identity in any keyed section is refused and gets no digest", () => {
    const dup: Record<string, (m: GmWaitCatalogueManifest) => void> = {
      sources: (m) =>
        void m.sources.push(clone(m.sources[0] as GmWaitCatalogueManifest["sources"][number])),
      rules: (m) =>
        void m.rules.push(clone(m.rules[0] as GmWaitCatalogueManifest["rules"][number])),
      kinds: (m) =>
        void m.kinds.push(clone(m.kinds[0] as GmWaitCatalogueManifest["kinds"][number])),
      providers: (m) =>
        void m.providers.push(
          clone(m.providers[0] as GmWaitCatalogueManifest["providers"][number]),
        ),
      sites: (m) =>
        void m.sites.push(clone(m.sites[0] as GmWaitCatalogueManifest["sites"][number])),
      closes: (m) =>
        void m.closes.push(clone(m.closes[0] as GmWaitCatalogueManifest["closes"][number])),
      event_triggers: (m) =>
        void m.event_triggers.push(
          clone(m.event_triggers[0] as GmWaitCatalogueManifest["event_triggers"][number]),
        ),
      object_routes: (m) =>
        void m.object_routes.push(
          clone(m.object_routes[0] as GmWaitCatalogueManifest["object_routes"][number]),
        ),
      owners: (m) =>
        void m.policy.owner_policy.owners.push(
          clone(m.policy.owner_policy.owners[0] as { owner: string; facets: string[] }),
        ),
      unresolved_declarations: (m) => void m.unresolved_declarations.push("x#y", "x#y"),
    };
    for (const [section, mutate] of Object.entries(dup)) {
      const m = miniManifest();
      mutate(m);
      const v = validateManifest(m).filter((x) => x.code === "DUPLICATE_TUPLE");
      expect(
        v.map((x) => x.section),
        section,
      ).toContain(section);
      expect(() => catalogueDigest(m), section).toThrow(/DUPLICATE_TUPLE/);
    }
  });

  it("[S2] [mechanism only] two providers declaring the same event trigger are refused, as the provider registry itself refuses them", () => {
    const m = miniManifest();
    (m.providers[1] as { event_trigger: string | null }).event_trigger = "trig-1";
    expect(
      validateManifest(m).some(
        (v) => v.code === "DUPLICATE_TUPLE" && v.section === "providers.event_trigger",
      ),
    ).toBe(true);
    expect(() => catalogueDigest(m)).toThrow();
  });

  it("[S2] [mechanism only] a reference to a rule the manifest does not carry is refused and gets no digest", () => {
    const m = miniManifest();
    (m.kinds[0] as { rule_ref: string }).rule_ref = sha("no-such-rule");
    (m.providers[0] as { rule_ref: string }).rule_ref = sha("no-such-rule-2");
    const v = validateManifest(m).filter((x) => x.code === "UNKNOWN_REF");
    expect(v.map((x) => x.section).sort()).toEqual(["kinds.rule_ref", "providers.rule_ref"]);
    expect(() => catalogueDigest(m)).toThrow(/UNKNOWN_REF/);
  });

  it("[S2] [mechanism only] the keyed sections are exactly the ones the table names, and a key function is injective on the fixture", () => {
    expect(Object.keys(SECTION_KEYS).sort()).toEqual([
      "closes",
      "event_triggers",
      "kinds",
      "object_routes",
      "owners",
      "providers",
      "rules",
      "sites",
      "sources",
    ]);
    const m = miniManifest();
    expect(new Set(m.providers.map(SECTION_KEYS.providers)).size).toBe(m.providers.length);
  });
});

describe("[S2] [mechanism only] a supplied digest is accepted only if it is the current retained manifest", () => {
  const current = miniManifest();
  const currentBytes = catalogueCanonicalBytes(current);
  const currentDigest = catalogueDigest(current);
  const older = miniManifest();
  (older.kinds[0] as { owner: string }).owner = "gamma";
  const olderBytes = catalogueCanonicalBytes(older);
  const olderDigest = catalogueDigest(older);
  const authority = {
    current: currentDigest,
    retained: new Map([
      [currentDigest, currentBytes],
      [olderDigest, olderBytes],
    ]),
  };

  it("[S2] [mechanism only] the verdict is exactly the expected one for a table of supplied values", () => {
    const forged = sha("forged-name");
    const forgedAuthority = {
      ...authority,
      retained: new Map([...authority.retained, [forged, "not the bytes that hash to this name"]]),
    };
    const cases: readonly [string, unknown, typeof authority, (typeof DIGEST_VERDICTS)[number]][] =
      [
        ["the current manifest", currentDigest, authority, "OK_CURRENT"],
        ["a retained older manifest", olderDigest, authority, "DIGEST_STALE_RETAINED"],
        ["an unknown valid-looking digest", sha("unknown"), authority, "DIGEST_UNKNOWN"],
        ["uppercase hex", currentDigest.toUpperCase(), authority, "DIGEST_MALFORMED"],
        ["63 characters", currentDigest.slice(1), authority, "DIGEST_MALFORMED"],
        ["65 characters", `${currentDigest}0`, authority, "DIGEST_MALFORMED"],
        ["not hex", "z".repeat(64), authority, "DIGEST_MALFORMED"],
        ["null", null, authority, "DIGEST_MALFORMED"],
        ["a number", 7, authority, "DIGEST_MALFORMED"],
        [
          "a retained file whose bytes do not hash to its name",
          forged,
          forgedAuthority,
          "MANIFEST_BYTES_MISMATCH",
        ],
      ];
    for (const [name, supplied, auth, expected] of cases)
      expect(verifySuppliedDigest(supplied, auth), name).toBe(expected);
  });

  it("[S2] [mechanism only] only the current retained manifest is admissible for a fresh INITIAL; a stale one resolves history only", () => {
    const admissible = [...authority.retained.keys()].filter(
      (d) => verifySuppliedDigest(d, authority) === "OK_CURRENT",
    );
    expect(admissible).toEqual([currentDigest]);
  });

  it("[S2] [mechanism only] the retained set is empty: even the current digest is unknown, never trusted by name", () => {
    expect(
      verifySuppliedDigest(currentDigest, { current: currentDigest, retained: new Map() }),
    ).toBe("DIGEST_UNKNOWN");
  });
});

describe("[S2] [mechanism only] the value-schema fingerprint is structural", () => {
  it("[S2] [mechanism only] equal shapes fingerprint equally and a changed shape changes the fingerprint", () => {
    const a = SunsetEnrollmentSchema;
    const fewer = SunsetEnrollmentSchema.pick({ instrument_id: true, sunset_at: true });
    expect(valueSchemaFingerprint(a)).toBe(valueSchemaFingerprint(SunsetEnrollmentSchema));
    expect(valueSchemaFingerprint(fewer)).not.toBe(valueSchemaFingerprint(a));
    expect(valueSchemaFingerprint(CanonicalTimeSchema)).not.toBe(valueSchemaFingerprint(a));
    expect(valueSchemaFingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("[S2] [mechanism only] coverage: a census taken from the declarations against the manifest", () => {
  const m = miniManifest();
  const codesOf = (c: ReturnType<typeof censusOf>) =>
    catalogueCoverageViolations(c, m)
      .map((v) => `${v.code}:${v.key}`)
      .sort();

  it("[S2] [mechanism only] the census that is exactly the manifest has no violation, in any set order", () => {
    expect(codesOf(censusOf(m))).toEqual([]);
    const c = censusOf(clone(m));
    const shuffled = {
      ...c,
      kinds: [...c.kinds].reverse(),
      providers: [...c.providers].reverse(),
      rules: [...c.rules].reverse(),
      sources: [...c.sources].reverse(),
    };
    expect(codesOf(shuffled)).toEqual([]);
  });

  it("[S2] [mechanism only] each way the census departs from the manifest is its own named violation", () => {
    const c = censusOf(clone(m));
    const extraKind = { ...(c.kinds[0] as (typeof c.kinds)[number]), id: "zz_new_kind" };
    const extraProvider = {
      ...(c.providers[1] as (typeof c.providers)[number]),
      operation: "zz-dormant-op",
    };
    const cases: readonly [string, ReturnType<typeof censusOf>, string][] = [
      [
        "an added kind",
        { ...c, kinds: [...c.kinds, extraKind] },
        "KIND_NOT_IN_MANIFEST:zz_new_kind",
      ],
      ["a missing kind", { ...c, kinds: c.kinds.slice(1) }, "KIND_MISSING_FROM_CENSUS:alpha_one"],
      [
        "a changed kind",
        {
          ...c,
          kinds: c.kinds.map((k, i) => (i === 0 ? { ...k, lifecycle: "ADVANCING" as const } : k)),
        },
        "KIND_CHANGED:alpha_one",
      ],
      [
        "an added dormant provider",
        { ...c, providers: [...c.providers, extraProvider] },
        "PROVIDER_NOT_IN_MANIFEST:beta|zz-dormant-op",
      ],
      [
        "a removed provider",
        { ...c, providers: c.providers.slice(1) },
        "PROVIDER_MISSING_FROM_CENSUS:alpha|alpha-op",
      ],
      [
        "a provider that became registered",
        {
          ...c,
          providers: c.providers.map((p, i) =>
            i === 1 ? { ...p, status: "REGISTERED" as const } : p,
          ),
        },
        "PROVIDER_CHANGED:beta|beta-op",
      ],
      [
        "a site gaining a member",
        { ...c, sites: c.sites.map((s) => ({ ...s, members: [...s.members, "beta|beta-op"] })) },
        "SITE_MEMBERS_CHANGED:site-a",
      ],
      [
        "an added registry site",
        { ...c, sites: [...c.sites, { site_id: "site-z", members: [], opaque: false }] },
        "SITE_NOT_IN_MANIFEST:site-z",
      ],
      [
        "an opaque registry site",
        { ...c, sites: c.sites.map((s) => ({ ...s, opaque: true })) },
        "OPAQUE_REGISTRY_SITE:site-a",
      ],
      [
        "an added Close",
        { ...c, closes: [...c.closes, { name_expr: "ZZ_CLOSE", name_value: null }] },
        "CLOSE_NOT_IN_MANIFEST:ZZ_CLOSE",
      ],
      [
        "an added event trigger",
        {
          ...c,
          event_triggers: [...c.event_triggers, { kind: "trig-2", provider: "beta|beta-op" }],
        },
        "EVENT_TRIGGER_NOT_IN_MANIFEST:trig-2",
      ],
      [
        "an added object route",
        {
          ...c,
          object_routes: [
            ...c.object_routes,
            { route_id: "object_literal@zz", kind: "OBJECT_LITERAL" as const },
          ],
        },
        "OBJECT_ROUTE_NOT_IN_MANIFEST:object_literal@zz",
      ],
      [
        "a late extension owner",
        { ...c, extension_dispatch: { ...c.extension_dispatch, extension_owners: ["zz_late"] } },
        "EXTENSION_OWNER_NOT_IN_MANIFEST:zz_late",
      ],
      [
        "a changed dispatch structure",
        { ...c, extension_dispatch: { ...c.extension_dispatch, early_return_count: 4 } },
        "EXTENSION_DISPATCH_CHANGED:storeBindings",
      ],
      [
        "a changed Culture route",
        { ...c, culture_route: { ...c.culture_route, provider_registered_in_production: true } },
        "CULTURE_ROUTE_CHANGED:beta|beta-op",
      ],
      [
        "a drifted historical identity",
        {
          ...c,
          historical_verification: {
            ...c.historical_verification,
            canonical_id: "R1-test+POLICY-B",
          },
        },
        "POLICY_PIN_DRIFT:historical_verification",
      ],
      [
        "a drifted audience policy",
        { ...c, audience_projection: { ...c.audience_projection, access_classes: ["x.one"] } },
        "POLICY_PIN_DRIFT:audience_projection",
      ],
      [
        "an added owner facet",
        {
          ...c,
          owner_policy: { owners: [...c.owner_policy.owners, { owner: "gamma", facets: ["h1"] }] },
        },
        "OWNER_FACET_NOT_IN_MANIFEST:gamma|h1",
      ],
      [
        "a changed scope",
        { ...c, scope: { ...c.scope, excluded_roots: [] } },
        "SCOPE_CHANGED:scope",
      ],
      [
        "an unresolved provider declaration",
        { ...c, unresolved_declarations: ["x/y.ts#zzProvider"] },
        "UNRESOLVED_PROVIDER_DECLARATION:x/y.ts#zzProvider",
      ],
      [
        "a provider only one census method found",
        {
          ...c,
          providers: c.providers.map((p, i) =>
            i === 0 ? { ...p, found_by: ["REFLECTION" as const] } : p,
          ),
        },
        "CENSUS_METHODS_DISAGREE:alpha|alpha-op",
      ],
    ];
    for (const [name, census, expected] of cases) expect(codesOf(census), name).toContain(expected);
    // the closed code list covers everything the table above can produce
    for (const [, census] of cases)
      for (const v of catalogueCoverageViolations(census, m))
        expect(COVERAGE_VIOLATION_CODES).toContain(v.code);
  });

  it("[S2] [mechanism only] a coverage check that found nothing wrong cannot be satisfied by an empty census", () => {
    const empty = {
      ...censusOf(m),
      kinds: [],
      providers: [],
      sites: [],
      rules: [],
      sources: [],
      closes: [],
      event_triggers: [],
      object_routes: [],
    };
    expect(catalogueCoverageViolations(empty, m).length).toBeGreaterThan(0);
  });
});
