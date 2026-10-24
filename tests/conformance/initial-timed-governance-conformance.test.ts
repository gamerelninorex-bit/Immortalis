// Conformance evidence for the Initial Timed GIP Opening & Earned Sunset slice (@immortalis/operator `establish-timed-governance`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T09:16:27.684Z) on main
// 418f5a0673c77020e0ddc6aca99cdcf7df6ab353. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  GovernanceInstrumentSchema,
  InstitutionIdentitySchema,
  OWNER_GIP,
  ScopeBindingSchema,
  SunsetEnrollmentSchema,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
} from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/initial-timed-governance-admission-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const gitBlob = (file: string) => {
  const body = readFileSync(file);
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
};

/** Everything the slice composes or must leave untouched, exactly as it stood at main 418f5a0673c77020e0ddc6aca99cdcf7df6ab353. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/gip.ts":
    "d866c26b763f9c9aa05127c8cf618bd81d4a38086ef87c3ea23163f4ac6ed229",
  "packages/contracts/src/gip-instrument.ts":
    "4506c97e3c80aa720d7576b8224bd3fd8a144661eb4ad5c8c9538178eca97d77",
  "packages/contracts/src/gip-scope-binding.ts":
    "5b0903a9639d45e545b22d0d3555d5380177782c0ebd427f0c66b073292cc18f",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/engine/src/gip/adapter.ts":
    "2b73b74c3f32d245d88999115a74f4804f8bdcb03d16f9a2793fe61c5d2e1f8b",
  "packages/engine/src/gip/admission.ts":
    "c09cecc1de85314748afa8dfa6db566b9a1f0ace048c528a4fab4ea786517cd8",
  "packages/engine/src/gip/declaration.ts":
    "c2f2172480976a3d3966b0f6a0584a6435600574ad9053fdbe7069f5d6be7ba9",
  "packages/engine/src/gip/derive.ts":
    "f905ab255445453044f13ad65815ebe193af9e19b11a13d05c566b1b47ae712e",
  "packages/engine/src/gip/provider.ts":
    "f1d6629d99aeb17f4f36265621fd6906447ef74336dd80b32e75c2561d874af5",
  "packages/engine/src/gip/integrity.ts":
    "221d03fa9508a4c19c301f1421cc1b90f4efdef489b84abf677337f87e9913b1",
  "packages/engine/src/temporal/coordinator.ts":
    "5bdbc6cbf4cb4cc9a01f11f009ecc0767ac75d0e8373974ed09bd465a8febdd1",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/engine/src/owners/registry.ts":
    "7450fe62f3201981918031bb98b5e49004de642f82eb0732348314a861a4d0a2",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/additional-source.ts":
    "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
  "packages/operator/src/additional-locality.ts":
    "5f1fea4718c816d755c086d2cfef6bffdbfdad62e3ac2f2935ba54e94bf4c782",
  "packages/operator/src/production-reserve.ts":
    "1450ef0711436d94c8f0738cdc5ce71e3d9a5e63c911bbc576ceda2c85a73efe",
  "packages/operator/src/initial-population.ts":
    "ad1824ac0d0c70d6d48ea5df315c6136c14a5cd9198613a15e40dfaf5cc04968",
  "packages/operator/src/commands.ts":
    "c2edeaa018e9ebf8e6787d3b6db15d06a24a01392812b1f6bed9ecad0dc55b16",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/ledger.ts":
    "94092549ec67f9631f05fba78890775c45e574a1e9335a36daa3abe82921c3c9",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
};

describe("nothing outside the operator is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, contracts, the GIP and Temporal owners, the registry, the earlier admission modules, commands.ts, the session and the ledger are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("2df29edfd08b1fb986666c94153f9432cf227324");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /initial-timed-governance|establish-timed-governance|InitialTimedGovernance/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the four records and the receipt are the unchanged strict contracts with their unchanged fields, keys and owner assignment", () => {
    const keys = (s: { shape: Record<string, unknown> }) => Object.keys(s.shape).sort();
    expect(keys(InstitutionIdentitySchema as never)).toEqual(
      ["constitutive_source_ref", "continuity_status", "identity_label", "institution_id"].sort(),
    );
    expect(keys(ScopeBindingSchema as never)).toEqual(
      [
        "exception_refs",
        "inheritance_rule",
        "institution_id",
        "office_id",
        "priority_or_conflict_rule_ref",
        "scope_binding_id",
        "scope_ref",
        "scope_type",
        "target_condition",
      ].sort(),
    );
    expect(keys(GovernanceInstrumentSchema as never)).toEqual(
      [
        "authority_basis_ref",
        "instrument_id",
        "lifecycle_status",
        "operative_effect",
        "predecessor_instrument_ref",
        "scope_binding_ref",
        "source_authority_ref",
        "sunset_condition",
        "validity_by_order",
      ].sort(),
    );
    expect(keys(SunsetEnrollmentSchema as never)).toEqual(
      ["basis_time", "instrument_id", "sunset_at"].sort(),
    );
    expect(gipInstitutionIdentityKey("i")).toBe("gip/institution/i/identity");
    expect(gipOfficeAuthorityLocusKey("i", "o")).toBe("gip/institution/i/office/o");
    expect(gipScopeBindingKey("i", "o", "b")).toBe("gip/institution/i/office/o/scope-binding/b");
    expect(gipInstrumentKey("n")).toBe("gip/instrument/n");
    expect(GIP_SUNSET_ENROLLMENT_KEY).toBe("gip/sunset-enrollment");
    expect(OWNER_GIP).toBe("gip");
    expect(InstitutionIdentitySchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe("the command reuses the existing owner operations in dependency order and adds no surface", () => {
  const src = code("packages/operator/src/initial-timed-governance.ts");
  const live = src.replace(
    /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishInitialTimedGovernanceParams)/,
    "",
  );

  it("composes the four GIP owner operations and the existing session, confirmation and locality reads", () => {
    for (const needle of [
      "establishInstitution(",
      "establishOffice(",
      "establishScopeBinding(",
      "establishSunsetInstrument(",
      "LocalOperatorSession.open(",
      "requestOperatorConfirmation(",
      "establishedLocality(",
      "InstitutionIdentitySchema",
      "OfficeAuthorityLocusSchema",
      "ScopeBindingSchema",
      "GovernanceInstrumentSchema",
    ])
      expect(src, needle).toContain(needle);
  });

  it("the live commit chain publishes the institution, then the office, then the Scope Binding, then the sunset Instrument", () => {
    const at = (s: string) => live.indexOf(s);
    expect(at("gip.establishInstitution(")).toBeGreaterThan(-1);
    expect(at("gip.establishInstitution(")).toBeLessThan(at("gip.establishOffice("));
    expect(at("gip.establishOffice(")).toBeLessThan(at("gip.establishScopeBinding("));
    expect(at("gip.establishScopeBinding(")).toBeLessThan(at("gip.establishSunsetInstrument("));
  });

  it("uses the sunset-bearing operation, never the plain Instrument one that would leave a sunset unregistered", () => {
    expect(src).not.toContain("establishGovernanceInstrument(");
    expect(src).not.toContain("completeSunsetEnrollment(");
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created in the operator's directory", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("owns no live time, advance, expiry or stage surface — time is only READ for comparison", () => {
    expect(live.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).not.toMatch(
      /establishCanonicalTime|TemporalCoordinator|registerObject|StageProviderRegistry|gipSunsetExpiryProvider|deriveSunsetExpiry|\.advance\(|continueRemainder|PcMovement|ActorState|handoverExistingActor|travel_duration/,
    );
    expect(src).toContain("TEMPORAL_STATE_KEY");
    expect(src).toContain("timeEquals(");
    expect(src.match(/getFact\(TEMPORAL_STATE_KEY\)/g)).toHaveLength(1);
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishInitialTimedGovernance).toBe("function");
    expect(typeof operator.readInitialTimedGovernanceFile).toBe("function");
    expect(typeof operator.initialTimedGovernanceId).toBe("function");
    expect(typeof operator.expectedEnrollment).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-timed-governance --campaign <dir>");
    expect(operator.USAGE).toContain("--governance-file <file>");
    expect(operator.USAGE).toContain("docs/initial-timed-governance-admission-foundation.md");
    expect(operator.USAGE).toContain("NO time is advanced and nothing is expired");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T09:16:27.684Z");
    expect(doc).toContain("418f5a0673c77020e0ddc6aca99cdcf7df6ab353");
    expect(doc).toContain("2df29edfd08b1fb986666c94153f9432cf227324");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no legal validity, consent, actor, enactment, advance or expiry by the command", () => {
    expect(doc).toContain("stipulated opening premise");
    expect(doc).toContain("not an engine judgment of historical legal validity");
    expect(doc).toContain("advances no time and expires nothing");
    expect(doc).toContain("never pretends its referent exists, consented or deliberated");
    expect(doc).toContain("not a new command or an automatic part of this admission");
  });
  it("scopes the witness to mechanism only and names the missing external prerequisites", () => {
    expect(doc).toContain("mechanism-only independent-world causal witness");
    expect(doc).toContain("does not prove natural human play");
    expect(doc).toContain("EXTERNAL PREREQUISITE MISSING");
  });
  it("leaves PR #72 and PR #73, and the saved campaign, untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched");
    expect(doc).toContain("campaign-r5-phone");
    expect(doc).toContain("pc-namar-1");
  });
});
