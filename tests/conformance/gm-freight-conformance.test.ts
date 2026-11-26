// ROADBED GM-native first-profile freight bridge — clerical and structural conformance. MECHANISM ONLY; not a behavioural proof.
//
// What it proves: (1) the slice changed exactly the predecessor files it records, each at its recorded base and head, and nothing else under
// packages/ that is not a new module of this slice, at its reviewed head; (2) every older suite's removed byte pin is recorded, equals the base's
// own bytes and is gone from the suite; (3) NO owner, fact kind, facet, rule, source lock or owner registry changed in that slice; (4) the host-facing
// schemas reproduce the existing contract schemas BY REFERENCE (the premises, the institution, the office, the Scope Binding) and add only transport fields; (5) the bridge reaches
// the owners only through the closed list of existing adapter operations below; (6) the freight receipt stage is registered in both NULL-PC gateways
// and nowhere else new.
import { B3_PACKAGE_PATHS } from "../support/b3-scoped-deltas.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AdmitSiteConditionChangeInputSchema,
  AttestOpeningInputSchema,
  GM_FREIGHT_REQUEST_SCHEMAS,
  GM_FREIGHT_TOOLS,
  GmAttestOpeningRequestSchema,
  GmEstablishLegalRequestSchema,
  GmInstrumentSchema,
  GmOpeningSliceSchema,
  GmReportSiteChangeRequestSchema,
  InputLotPremiseSchema,
  InstitutionIdentitySchema,
  LegalPremiseSchema,
  MaterialSpecificationPremiseSchema,
  OfficeAuthorityLocusSchema,
  ScopeBindingSchema,
  ServicePremiseSchema,
  SiteConditionPremiseSchema,
} from "@immortalis/contracts";
import { A26_CHANGED_SOURCE_FILES } from "../support/a26-scoped-deltas.ts";
import { A24_ADAPTER_DELTA } from "../support/a24-scoped-delta.ts";
import { A05_SOURCE_DELTAS } from "../support/a05-scoped-deltas.ts";
import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
import { A1_2A_PACKAGE_PATHS } from "../support/a1-2a-scoped-deltas.ts";
import { B2_PACKAGE_PATHS } from "../support/b2-scoped-deltas.ts";
import { RP1_STAGE2_PACKAGE_PATHS } from "../support/rp1-stage2-deltas.ts";
import { RP2_PACKAGE_PATHS } from "../support/rp2-source-deltas.ts";
import { A0_PACKAGE_PATHS } from "../support/a0-scoped-deltas.ts";
import { REMOVED_GM_FREIGHT_PINS } from "../support/gm-freight-removed-pins.ts";
import {
  GM_FREIGHT_BASE_COMMIT,
  GM_FREIGHT_SCOPED_DELTAS,
} from "../support/gm-freight-scoped-deltas.ts";
import {
  S4_BASE_COMMIT,
  S4_NEW_MODULES,
  S4_PRESENT_DAY_FILES,
  S4_SCOPED_DELTAS,
} from "../support/pc-standing-ledger-scoped-deltas.ts";

const sha256 = (v: string | Buffer): string => createHash("sha256").update(v).digest("hex");
const file = (p: string): string => sha256(readFileSync(p));
const git = (...args: string[]): Buffer | null => {
  try {
    return execFileSync("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};
const historyAvailable = git("cat-file", "-e", `${GM_FREIGHT_BASE_COMMIT}^{commit}`) !== null;
// PR #106's independently reviewed head. Slice-scope claims are historical: later A01 admission
// changes must not be misattributed to freight. Current scoped deltas and schema checks remain live.
const GM_FREIGHT_REVIEWED_HEAD = "551ef21afb15edace0066e45a0b385a8f78f2238";
const reviewedHistoryAvailable =
  historyAvailable && git("cat-file", "-e", `${GM_FREIGHT_REVIEWED_HEAD}^{commit}`) !== null;
const atBase = (path: string): string | null => {
  const b = git("show", `${GM_FREIGHT_BASE_COMMIT}:${path}`);
  return b === null ? null : sha256(b);
};
const atReviewedHead = (path: string): string | null => {
  const b = git("show", `${GM_FREIGHT_REVIEWED_HEAD}:${path}`);
  return b === null ? null : sha256(b);
};
const keysOf = (schema: unknown): string[] =>
  Object.keys((schema as { shape: object }).shape).sort();

const NEW_MODULES = [
  "packages/contracts/src/gm-freight.ts",
  "packages/engine/src/freight/bridge.ts",
  "packages/operator/src/gm-freight-bin.ts",
  "packages/operator/src/gm-freight-bind-bin.ts",
  "packages/operator/src/gm-freight-cli.ts",
  "packages/operator/src/gm-freight-exchange.ts",
  "packages/operator/src/gm-freight-mcp.ts",
  "packages/operator/src/gm-freight.ts",
];
const PRESENT_DAY_TABLE_FILES = ["packages/contracts/src/index.ts", "packages/engine/src/index.ts"];

describe("the slice is one scoped delta over the freight F+I base", () => {
  it("each changed predecessor file is exactly its recorded head", () => {
    for (const [path, d] of Object.entries(GM_FREIGHT_SCOPED_DELTAS))
      expect(file(path), path).toBe(d.head);
  });

  it("each recorded base is what the base commit's own bytes hash to (where Git history is available)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const [path, d] of Object.entries(GM_FREIGHT_SCOPED_DELTAS))
      expect(atBase(path), path).toBe(d.base);
  });

  it("every removed historical pin is recorded once, is a recorded delta's base, and is gone from its suite", () => {
    const keys = REMOVED_GM_FREIGHT_PINS.map((p) => `${p.suite}\0${p.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of REMOVED_GM_FREIGHT_PINS) {
      expect(GM_FREIGHT_SCOPED_DELTAS[p.path]?.base, `${p.suite} ${p.path}`).toBe(p.value);
      const text = readFileSync(p.suite, "utf8");
      // the suite no longer asserts it unchanged, and does not hold the stale value against the working tree
      expect(
        text.includes(`"${p.path}"`) &&
          new RegExp(`"${p.path.replace(/[.]/g, "\\.")}":\\s*"${p.value}"`).test(text),
        `${p.suite}`,
      ).toBe(false);
    }
  });

  it("at the reviewed head, nothing under packages/ changed except the recorded deltas, the two export lines and the slice's own new modules", () => {
    if (!reviewedHistoryAvailable)
      return console.warn("SKIPPED: shallow checkout, the reviewed base/head is not reachable");
    // The exact original slice delta, independent of subsequent reviewed changes in the working tree.
    const changed = (
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        GM_FREIGHT_BASE_COMMIT,
        GM_FREIGHT_REVIEWED_HEAD,
        "--",
        "packages",
      )?.toString("utf8") ?? ""
    )
      .split("\n")
      .filter(Boolean);
    const allowed = new Set([
      ...Object.keys(GM_FREIGHT_SCOPED_DELTAS),
      ...PRESENT_DAY_TABLE_FILES,
      ...NEW_MODULES,
    ]);
    for (const p of changed) expect(allowed.has(p), p).toBe(true);
    // the two export lines are the whole change to the two index files
    for (const p of PRESENT_DAY_TABLE_FILES) {
      const diff =
        git(
          "-c",
          "core.fileMode=false",
          "diff",
          "--numstat",
          GM_FREIGHT_BASE_COMMIT,
          GM_FREIGHT_REVIEWED_HEAD,
          "--",
          p,
        )?.toString("utf8") ?? "";
      expect(diff.trim().split(/\s+/).slice(0, 2), p).toEqual(["1", "0"]);
    }
  });

  it("current packages/ contain only the recorded scope and subsequent deltas, including untracked files", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    // content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice
    const changed = (
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        GM_FREIGHT_BASE_COMMIT,
        "--",
        "packages",
      )?.toString("utf8") ?? ""
    )
      .split("\n")
      .filter(Boolean);
    const untracked = (
      git("ls-files", "--others", "--exclude-standard", "--", "packages")?.toString("utf8") ?? ""
    )
      .split("\n")
      .filter(Boolean);
    const allowed = new Set([
      ...Object.keys(GM_FREIGHT_SCOPED_DELTAS),
      ...PRESENT_DAY_TABLE_FILES,
      ...NEW_MODULES,
      // the LATER S-4 slice's recorded changes (its own table and conformance suite police them; this suite polices the GM slice)
      ...Object.keys(S4_SCOPED_DELTAS),
      ...S4_PRESENT_DAY_FILES,
      ...S4_NEW_MODULES,
      // The three additional reviewed A01 Population paths (admission is already in S4_PRESENT_DAY_FILES).
      "packages/engine/src/population/admission.ts",
      "packages/engine/src/population/integrity.ts",
      "packages/engine/src/population/stage-authority.ts",
      ...A26_CHANGED_SOURCE_FILES,
      A24_ADAPTER_DELTA.path,
      ...Object.keys(A05_SOURCE_DELTAS),
      ...RP1_STAGE2_PACKAGE_PATHS,
      ...RP2_PACKAGE_PATHS,
      // the LATER F-014B A0 slice's recorded paths (its own table and conformance suite police them)
      ...A0_PACKAGE_PATHS,
      // Declared inclusion (F-014B B0, PR #117): the one new pure GM waiting request module. It is not exported from the package index and changes no existing file.
      "packages/contracts/src/temporal-gm-wait.ts",
      // Declared inclusion (F-014B A1-1): the two existing operator files (its own table and conformance suite police them); no new file.
      ...A1_1_PACKAGE_PATHS,
      ...B1_S2S3_PACKAGE_PATHS,
      ...A1_2A_PACKAGE_PATHS,
      // and the F-014B B2 slice's recorded paths (its own table and conformance suite police them)
      ...B2_PACKAGE_PATHS,
      ...B3_PACKAGE_PATHS,
    ]);
    for (const p of [...changed, ...untracked]) expect(allowed.has(p), p).toBe(true);
    // the two export lines are the whole change to the two index files (measured to the S-4 base, main after this slice merged: S-4
    // later added its own export lines, recorded and policed by its own suite)
    for (const p of PRESENT_DAY_TABLE_FILES) {
      const diff =
        git(
          "-c",
          "core.fileMode=false",
          "diff",
          "--numstat",
          GM_FREIGHT_BASE_COMMIT,
          S4_BASE_COMMIT,
          "--",
          p,
        )?.toString("utf8") ?? "";
      expect(diff.trim().split(/\s+/).slice(0, 2), p).toEqual(["1", "0"]);
    }
  });

  it("the reviewed slice changed no owner, fact kind, facet, governing rule, source lock, register or gate; current frozen identities remain unchanged", () => {
    if (!reviewedHistoryAvailable)
      return console.warn("SKIPPED: shallow checkout, the reviewed base/head is not reachable");
    for (const p of [
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/owners/admission.ts",
      "spec/f027/spec-lock.json",
      "spec/f027/acceptance-register.yaml",
      "spec/f027/open-gates.yaml",
      "spec/f027/runtime-contract.md",
    ]) {
      expect(atReviewedHead(p), p).toBe(atBase(p));
      // S-4 changed registry and admission later; retain its historical base comparison as well.
      const atS4Base = git("show", `${S4_BASE_COMMIT}:${p}`);
      expect(atS4Base === null ? null : sha256(atS4Base), p).toBe(atBase(p));
      // Both owners are checked by their present-day guards, never by substituting new hashes here. F-014B A0 later extended the lock
      // additively (policed by tools/check-spec.ts and clock-origin-custody-conformance); the reviewed head above is this slice's claim.
      if (!p.startsWith("packages/engine/src/owners/") && p !== "spec/f027/spec-lock.json")
        expect(file(p), p).toBe(atBase(p));
    }
    // and the engine's freight directory gained exactly the router (no adapter, no kind): see freight-profile-conformance
    expect(existsSync("packages/engine/src/freight/bridge.ts")).toBe(true);
  });
});

describe("source-to-schema map: the host-facing contract reproduces the existing schemas and adds only transport fields", () => {
  it("each premise slice's typed reading IS the existing contract schema (by reference), one per slice kind", () => {
    const byKind = new Map(
      GmOpeningSliceSchema.options.map((o) => [
        (o.shape.slice_kind as unknown as { value: string }).value,
        o.shape.premise,
      ]),
    );
    expect([...byKind.keys()].sort()).toEqual([
      "input_lot",
      "legal",
      "material_specification",
      "service_premise",
      "site_condition",
    ]);
    expect(byKind.get("legal")).toBe(LegalPremiseSchema);
    expect(byKind.get("site_condition")).toBe(SiteConditionPremiseSchema);
    expect(byKind.get("material_specification")).toBe(MaterialSpecificationPremiseSchema);
    expect(byKind.get("input_lot")).toBe(InputLotPremiseSchema);
    expect(byKind.get("service_premise")).toBe(ServicePremiseSchema);
    // each slice carries the existing slice fields and nothing more
    for (const o of GmOpeningSliceSchema.options)
      expect(keysOf(o)).toEqual(["premise", "slice_id", "slice_kind", "statement"]);
  });

  it("the legal source is the existing institution, office and Scope Binding by reference; the Instrument omits exactly the three derived references", () => {
    const shape = GmEstablishLegalRequestSchema.shape;
    expect(shape.institution).toBe(InstitutionIdentitySchema);
    expect(shape.office).toBe(OfficeAuthorityLocusSchema);
    expect(shape.scope_binding).toBe(ScopeBindingSchema);
    // WS-007 §4.1 Instrument mandatory fields: instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref,
    // validity_by_order[], lifecycle_status. Seven fields; three are derived by the trusted side from identities named elsewhere in the same request.
    expect(keysOf(GmInstrumentSchema)).toEqual([
      "instrument_id",
      "lifecycle_status",
      "operative_effect",
      "validity_by_order",
    ]);
    expect(Object.keys(GmInstrumentSchema.shape)).not.toContain("source_authority_ref");
    expect(Object.keys(GmInstrumentSchema.shape)).not.toContain("authority_basis_ref");
    expect(Object.keys(GmInstrumentSchema.shape)).not.toContain("scope_binding_ref");
  });

  it("the attested envelope is the existing AttestOpeningInput without the setup operation (the retry token) and without authored_under (the trusted side's)", () => {
    const opening = GmAttestOpeningRequestSchema.shape.opening as unknown as { shape: object };
    expect(keysOf(opening)).toEqual(
      keysOf(AttestOpeningInputSchema).filter(
        (k) => !["authored_under", "operation_id"].includes(k),
      ),
    );
  });

  it("the GM-authored prospective change is the existing site-condition change without authored_under", () => {
    expect(keysOf(GmReportSiteChangeRequestSchema)).toEqual(
      [
        ...keysOf(AdmitSiteConditionChangeInputSchema).filter((k) => k !== "authored_under"),
        "operation_id",
      ].sort(),
    );
    expect(GmReportSiteChangeRequestSchema.shape.outcome.options).toEqual(
      AdmitSiteConditionChangeInputSchema.shape.outcome.options,
    );
  });

  it("every other host field is a transport selector or the retry token; none is a role, permission, owner, status, outcome or time", () => {
    const expected: Record<string, string[]> = {
      [GM_FREIGHT_TOOLS.status]: ["world_id"],
      [GM_FREIGHT_TOOLS.establishSetting]: [
        "corridor",
        "destination",
        "operation_id",
        "origin",
        "world",
      ],
      [GM_FREIGHT_TOOLS.attestOpening]: ["opening", "operation_id"],
      [GM_FREIGHT_TOOLS.establishLegal]: [
        "institution",
        "instrument",
        "office",
        "operation_id",
        "scope_binding",
        "world_id",
      ],
      [GM_FREIGHT_TOOLS.initiate]: ["operation_id", "world_id"],
      [GM_FREIGHT_TOOLS.reportSiteChange]: [
        "change_id",
        "condition_id",
        "operation_id",
        "outcome",
        "statement",
        "world_id",
      ],
      [GM_FREIGHT_TOOLS.withdraw]: ["operation_id", "world_id"],
      [GM_FREIGHT_TOOLS.reconcile]: ["operation_id", "world_id"],
    };
    expect(Object.keys(GM_FREIGHT_REQUEST_SCHEMAS).sort()).toEqual(Object.keys(expected).sort());
    for (const [tool, schema] of Object.entries(GM_FREIGHT_REQUEST_SCHEMAS))
      expect(keysOf(schema), tool).toEqual(expected[tool]);
  });
});

describe("the bridge reaches the owners only through the existing adapter operations", () => {
  const src = readFileSync("packages/engine/src/freight/bridge.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("the closed list of owner operations the bridge invokes", () => {
    const calls = new Set(
      [
        ...src.matchAll(
          /\bc\.(campaign|world|gip|gipFreight|production|productionFreight|economy|logistics|coordinator)\.([A-Za-z]+)\(/g,
        ),
      ].map((m) => `${m[1]}.${m[2]}`),
    );
    expect([...calls].sort()).toEqual(
      [
        // World-State
        "campaign.establishWorld",
        "campaign.establishLocus",
        "campaign.establishCorridor",
        "world.attestOpening",
        "world.admitSiteCondition",
        "world.admitSiteConditionChange",
        "world.attestation",
        "world.siteCondition",
        // GIP
        "gip.establishInstitution",
        "gip.establishOffice",
        "gip.establishScopeBinding",
        "gip.establishGovernanceInstrument",
        "gip.institutionIdentity",
        "gip.governanceInstrument",
        "gipFreight.establishOpeningBasis",
        "gipFreight.establishInstrumentClauses",
        "gipFreight.sealReadiness",
        "gipFreight.openingBasis",
        "gipFreight.readinessSeal",
        "gipFreight.clause",
        // Production
        "production.startOperation",
        "production.operation",
        "productionFreight.admitMaterialSpecification",
        "productionFreight.admitInputLot",
        "productionFreight.materialSpecification",
        "productionFreight.inputLot",
        "productionFreight.dedicatedStartInput",
        // Economy
        "economy.resolveOriginSelfProvision",
        "economy.resolveFreightFixation",
        "economy.admitWithdrawal",
        "economy.closeWithdrawnRequest",
        "economy.consumeFirstDispatch",
        "economy.recordDestinationAdequacy",
        "economy.originAllocation",
        "economy.freightRequest",
        "economy.allocation",
        "economy.close",
        "economy.useConsumption",
        "economy.receipt",
        "economy.destinationAdequacy",
        "economy.currentStatus",
        // Logistics
        "logistics.admitServiceBasis",
        "logistics.admitService",
        "logistics.dispatchFirst",
        "logistics.releaseUnusedService",
        "logistics.serviceBasis",
        "logistics.unusedRelease",
        // Temporal registration only (resolves nothing and advances nothing)
        "coordinator.registerObject",
        "coordinator.object",
      ].sort(),
    );
  });

  it("there is no refusal writer, status setter, delivery writer, slot or receipt setter, F1, W1 or W4 in the bridge", () => {
    expect(src).not.toMatch(
      /\bF1\b|\bW1\b|\bW4\b|writeRefusal|setStatus|setSlot|setReceipt|deliver\w*\(/,
    );
  });
});

describe("the freight receipt stage is registered in exactly the two NULL-PC gateways", () => {
  const registers = (p: string): boolean =>
    /economyFreightReceiptProvider,/.test(readFileSync(p, "utf8"));
  it("both NULL-PC gateways register it; no other protocol module does", () => {
    expect(registers("packages/protocol/src/null-pc-ooc-advance.ts")).toBe(true);
    expect(registers("packages/protocol/src/null-pc-ooc-held-continuation.ts")).toBe(true);
    for (const p of ["active-pc-target-advance.ts", "pc-transfer-advance.ts"])
      expect(registers(`packages/protocol/src/${p}`), p).toBe(false);
  });
});
