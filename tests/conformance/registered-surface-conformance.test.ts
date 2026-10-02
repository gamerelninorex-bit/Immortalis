// Central conformance for the registered engine surface (twenty-fourth slice: test-harness registry & surface
// expectation refactor). Verification machinery only — it carries no acceptance row and changes no register, gate or
// lock state.
//
// This suite is the ONE place that owns the cross-cutting inventory facts which predecessor suites used to repeat and
// re-bump on every slice: the global fact-kind inventory and cardinality, per-owner membership, the owner → facet
// registration, the kinds that carry a historical `legacyRule`, each owner adapter's whole public surface and
// writer/commit cardinality, and the registered-versus-unregistered key-space split. The expectation lives in the
// independent oracle (tests/support/expected-surface.ts); production is compared to it in both directions.
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
} from "../support/surface-checks.ts";

describe("registered fact-kind inventory equals the independent oracle", () => {
  it("the global inventory, per-kind owner/facet and per-owner membership have no unauthorized addition or removal", () => {
    expect(findInventoryDrift(EXPECTED_FACT_KINDS, ALL_FACT_KINDS)).toEqual([]);
  });

  it("each engine registry group (`*_FACT_KINDS`) holds exactly its expected kinds, in order", () => {
    expect(findGroupDrift(EXPECTED_FACT_KINDS, observeKindGroups())).toEqual([]);
  });

  it("the owner → facet registration is exactly the expected one: no owner or facet gained or lost", () => {
    expect(findOwnerFacetDrift(EXPECTED_OWNER_FACETS, CANONICAL_OWNER_REGISTRY)).toEqual([]);
  });
});

describe("historical legacyRule compatibility is exactly the expected inventory", () => {
  it("only the expected fact kinds carry a legacyRule, and the registry source declares no other slot", () => {
    expect(
      findLegacyRuleDrift(
        EXPECTED_LEGACY_RULE_KIND_IDS,
        EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
        ALL_FACT_KINDS,
        readFileSync(REGISTRY_SOURCE, "utf8"),
      ),
    ).toEqual([]);
  });
});

describe("key spaces: registered siblings resolve exclusively; unregistered and malformed keys resolve to nothing", () => {
  it("every registered kind's canonical key resolves to exactly that kind, and no unregistered probe key resolves to any kind", () => {
    expect(
      findKeySpaceDrift(EXPECTED_FACT_KINDS, ALL_FACT_KINDS, UNREGISTERED_DIPLOMACY_KEY_PROBES),
    ).toEqual([]);
  });
});

describe("owner adapter public surface and writer cardinality equal the independent oracle", () => {
  it("the exported adapter/coordinator classes, each one's whole method surface, its commit and writer cardinality, and the create-only admission guards have no drift", () => {
    expect(
      findAdapterSurfaceDrift(
        EXPECTED_ADAPTER_SURFACES,
        observeAdapterMethods(),
        observeAdapterSources(),
        observeAdmissions(),
      ),
    ).toEqual([]);
  });
});
