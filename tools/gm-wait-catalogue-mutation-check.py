#!/usr/bin/env python3
"""F-014B B1 S2/S3 mutation sanity check (MECHANISM ONLY; the repo's existing convention: tools/s4-ledger-mutation-check.py).

Each mutant disables or weakens exactly ONE rule in a production file by a one-site text substitution, runs the lane's suites, restores
the file and records whether a test failed (KILLED) or none did (SURVIVED). Mutants run one at a time; every file is restored in a
`finally`, and the run aborts if a clean baseline does not pass first. Usage:

    python3 tools/gm-wait-catalogue-mutation-check.py [--out docs/evidence/f014b-s2s3/mutation-results.json] [--only M1,M2] [--anchors]

`--anchors` only verifies that every mutant's anchor occurs exactly once (no test run).
"""
import json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = "packages/engine/src/gm-wait-catalogue.ts"
S3 = "packages/engine/src/gm-wait-present-reader.ts"
GEN = "tools/gen-gm-wait-catalogue.ts"
T_CORE = "tests/conformance/gm-wait-catalogue-s2.test.ts"
T_CENSUS = "tests/conformance/gm-wait-catalogue-s2-census.test.ts"
T_S3 = "tests/conformance/gm-wait-present-s3.test.ts"
T_S3_INT = "tests/integration/gm-wait-present-s3-committed.test.ts"
T_SCOPE = "tests/conformance/b1-s2s3-scope-conformance.test.ts"

# (id, file, description, old, new, test files to run in order until one fails)
M = [
  ("S2-M01", CORE, "set-valued lists are not sorted (kinds)", "kinds: sortedBy(m.kinds, SECTION_KEYS.kinds).map(normKind),", "kinds: m.kinds.map(normKind),", [T_CORE, T_CENSUS]),
  ("S2-M02", CORE, "duplicate tuples are not detected", "const duplicatesOf = (keys: readonly string[]): string[] => {", "const duplicatesOf = (keys: readonly string[]): string[] => {\n  if (keys) return [];", [T_CORE]),
  ("S2-M03", CORE, "the digest omits the policy section", "return canonicalJson(normalizeManifest(parsed));", "return canonicalJson({ ...normalizeManifest(parsed), policy: null });", [T_CORE, T_CENSUS]),
  ("S2-M05", CORE, "an uppercase hex digest is accepted", "/^[0-9a-f]{64}$/.test(supplied)", "/^[0-9a-fA-F]{64}$/.test(supplied)", [T_CORE]),
  ("S2-M06", CORE, "a stale retained digest is accepted as current", 'return supplied === authority.current ? "OK_CURRENT" : "DIGEST_STALE_RETAINED";', 'return "OK_CURRENT";', [T_CORE]),
  ("S2-M07", CORE, "an unknown digest is accepted", 'if (bytes === undefined) return "DIGEST_UNKNOWN";', 'if (bytes === undefined) return "OK_CURRENT";', [T_CORE]),
  ("S2-M08", CORE, "forged retained bytes are trusted by name", 'if (sha256Text(bytes) !== supplied) return "MANIFEST_BYTES_MISMATCH";', "void bytes;", [T_CORE]),
  ("S2-M15", CORE, "the disposition schema admits INERT", "const Disposition = z.literal(DISPOSITION_UNDECLARED);", 'const Disposition = z.enum(["UNDECLARED", "INERT"]);', [T_CORE]),
  ("S2-M16", CORE, "the Epistemic literal admits INTERRUPTION_GUARDED", "epistemic: z.literal(EPISTEMIC_ACTIONABLE_OR_UNSAFE),", 'epistemic: z.enum(["ACTIONABLE_OR_UNSAFE", "INTERRUPTION_GUARDED"]),', [T_CORE]),
  ("S2-M17", CORE, "the static verdict grants a permission", "    permits: false,\n    coverage:", "    permits: true as never,\n    coverage:", [T_CORE]),
  ("S2-M18", CORE, "the manifest schema stops being strict", "export const GmWaitCatalogueManifestSchema = z.strictObject({", "export const GmWaitCatalogueManifestSchema = z.looseObject({", [T_CORE]),
  ("S2-M19", CORE, "a late extension owner is ignored by the coverage", "if (!have.has(o))", "if (false && !have.has(o))", [T_CORE, T_CENSUS]),
  ("S2-M20", CORE, "a census-method disagreement is ignored", "if (p.found_by.length !== 2)", "if (false)", [T_CORE, T_CENSUS]),
  ("S2-M21", CORE, "an added provider is reported as a mere change", 'added: "PROVIDER_NOT_IN_MANIFEST",', 'added: "PROVIDER_CHANGED",', [T_CORE, T_CENSUS]),
  ("S2-M22", CORE, "the value-schema scope literal is relaxed", 'value_schema_fp_scope: z.literal("STRUCTURAL_ONLY"),', "value_schema_fp_scope: z.string(),", [T_CORE]),
  ("S2-M23", CORE, "a changed generated-key route is not reported", 'changed: "OBJECT_ROUTE_CHANGED",', "", [T_CORE, T_CENSUS]),
  ("S2-G01", GEN, "the scanner ignores un-annotated provider literals", 'propNames(n.initializer).has("operation") &&', "false &&", [T_CENSUS]),
  ("S2-G02", GEN, "the event-trigger census is dropped", 'event_trigger: typeof m.trigger?.kind === "string" ? m.trigger.kind : null,', "event_trigger: null,", [T_CENSUS]),
  ("S2-G03", GEN, "the alternate-rule references are dropped from the kinds", "alternate_refs: (k.alternateRules ?? []).map((a) => intern(a.rule)),", "alternate_refs: [],", [T_CENSUS]),
  ("S2-G04", GEN, "extension owners are not read from the bindings", ".filter((o) => !CANONICAL_OWNER_REGISTRY.has(o))", ".filter(() => false)", [T_CENSUS]),
  ("S2-G05", GEN, "a provider in no site is reported REGISTERED", 'status: site_ids.length > 0 ? ("REGISTERED" as const) : ("DORMANT" as const),', 'status: "REGISTERED" as const,', [T_CENSUS]),
  ("S2-G06", GEN, "the generated-key (produces) census is dropped", 'if (pn === "produces" &&', 'if (false && pn === "produces" &&', [T_CENSUS]),
  ("S2-G07", GEN, ".register calls are not censused", 'if (name === "register") {', "if (false) {", [T_CENSUS]),
  ("S2-G08", GEN, "an adopted pin is not checked against its native verification", "if (i.verification.observed_page_last_edited_at !== i.native_pin)", "if (false)", [T_CENSUS]),
  ("S2-G09", GEN, "a source line number enters the digest", "route_id: uniq(`object_literal@${file}`),", "route_id: uniq(`object_literal@${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line}`),", [T_CENSUS]),
  ("S2-G10", GEN, "the reflection skips provider modules", '&& !e.name.endsWith(".d.ts")', '&& !e.name.endsWith(".d.ts") && !e.name.endsWith("provider.ts")', [T_CENSUS]),
  ("S3-M01", S3, "a malformed GIP receipt is VALID_ABSENT", 'if (receipt.tag === "INVALID") return { cls: "INVALID", evidence: null };\n  const id = receipt.value.instrument_id;', 'if (receipt.tag === "INVALID") return { cls: "VALID_ABSENT", evidence: null };\n  const id = receipt.value.instrument_id;', [T_S3, T_S3_INT]),
  ("S3-M02", S3, "a malformed freight receipt is VALID_ABSENT", 'if (receipt.tag === "INVALID") return { cls: "INVALID", evidence: null };\n  const r = receipt.value;', 'if (receipt.tag === "INVALID") return { cls: "VALID_ABSENT", evidence: null };\n  const r = receipt.value;', [T_S3, T_S3_INT]),
  ("S3-M03", S3, "a malformed PC occupancy is read as none", "      moveObjectP,\n      occupancy,\n    ].some(", "      moveObjectP,\n    ].some(", [T_S3_INT]),
  ("S3-M04", S3, "the boundary index is read", '{ id: "clock.state", category: 2, keys: () => [TEMPORAL_STATE_KEY] },', '{ id: "clock.state", category: 2, keys: () => [TEMPORAL_STATE_KEY, "temporal/boundary-index"] },', [T_S3, T_S3_INT]),
  ("S3-M05", S3, "the GIP receipt's future instant enters the evidence", 'return { cls: ok ? "COMPLETE" : "INVALID", evidence: { instrument_id: id } };', 'return { cls: ok ? "COMPLETE" : "INVALID", evidence: { instrument_id: id, sunset: receipt.value.sunset_at.value } as never };', [T_S3, T_S3_INT]),
  ("S3-M06", S3, "the origin witness is read on a CONTINUATION", 'req.phase === "CONTINUATION"\n      ? "NOT_READ_BY_RULE"', 'false\n      ? "NOT_READ_BY_RULE"', [T_S3, T_S3_INT]),
  ("S3-M07", S3, "the identity short-circuit on an existing sealed result is skipped", 'if (identity.state === "EXISTING_SEALED")', "if (false)", [T_S3_INT]),
  ("S3-M08", S3, "an open unsealed authority does not end the call", 'if (identity.state === "OPEN_UNSEALED")', "if (false)", [T_S3_INT]),
  ("S3-M09", S3, "a registered movement object is not an engagement", "[transferP, commitmentP, moveCommitmentP, moveRequestP, moveObjectP].some", "[transferP, commitmentP, moveCommitmentP, moveRequestP].some", [T_S3_INT]),
  ("S3-M10", S3, "a movement request alone is not an engagement", "[transferP, commitmentP, moveCommitmentP, moveRequestP, moveObjectP].some", "[transferP, commitmentP, moveCommitmentP, moveObjectP].some", [T_S3_INT]),
  ("S3-M11", S3, "a committed destination reads as settled", ': "DESTINATION_COMMITTED",\n    };', ': "STATIONARY_SETTLED",\n    };', [T_S3_INT]),
  ("S3-M12", S3, "the freight pending stages become distinct classes", 'return { cls: missing.length === 0 ? "COMPLETE" : "PENDING", evidence: ev(missing) };', 'return { cls: missing.length === 0 ? "COMPLETE" : missing.length === 2 ? "PENDING" : "INVALID", evidence: ev(missing) };', [T_S3_INT]),
  ("S3-M13", S3, "an absence witness is recorded as version 1", "owner: null,\n          version: 0,", "owner: null,\n          version: 1,", [T_S3, T_S3_INT]),
  ("S3-M14", S3, "the read cap is not enforced", "this.#reads.length + keys.length > this.#cap", "this.#reads.length + keys.length > this.#cap + 1000", [T_S3]),
  ("S3-M15", S3, "the observed basis is not compared", "timeEquals(req.observed_basis, s.value.canonical_time)", "true", [T_S3, T_S3_INT]),
  ("S3-M16", S3, "siOriginWitnessViolation is not applied", "const violation = siOriginWitnessViolation(r.fact.value, clock, campaignId);", "const violation = null as SiOriginViolation | null;", [T_S3, T_S3_INT]),
  ("S3-M17", S3, "the production catalogue yields a positive", 'return refuse("CATALOGUE_UNDECLARED");', 'return { kind: "SYNTHETIC_TEST_POLICY_POSITIVE", closed_policy_id: "x" };', [T_S3, T_S3_INT]),
  ("S3-M18", S3, "a synthetic policy may carry a production digest", "    production &&\n    (closed_policy_id", "    false &&\n    (closed_policy_id", [T_S3]),
  ("S3-M19", S3, "an absent origin is acceptable", 'if (basis.origin.cls === "VALID_ABSENT") return refuse("ORIGIN_NOT_QUALIFIED");', "", [T_S3, T_S3_INT]),
  ("S3-M20", S3, "an absent ledger is a partial witness", 'if (head.tag === "ABSENT" && version.tag === "ABSENT") return finish("UNKNOWN", unproven);', 'if (head.tag === "ABSENT" && version.tag === "ABSENT") return finish("PARTIAL_WITNESS", unproven);', [T_S3, T_S3_INT]),
  ("S3-M21", S3, "an unproven PC identity counts as proven (category 5)", 'const identity = operative ? "PROVEN" : "UNPROVEN";', 'const identity = "PROVEN";', [T_S3, T_S3_INT]),
  ("S3-M22", S3, "category-5 visibility is not required", "classes.has(headFact.fact.secrecy) && classes.has(versionFact.fact.secrecy)", "true", [T_S3_INT]),
  ("S3-M23", S3, "a partial witness satisfies the commitments premise", "if (!premises.no_pc_known_time_commitments)", 'if (basis.commitments.cls !== "PARTIAL_WITNESS" && !premises.no_pc_known_time_commitments)', [T_S3_INT]),
  ("S3-M24", S3, "a binding for another PC is not a mismatch", 'if (binding.value.active_pc.entity_id !== pcId) return { cls: "COMPLETE", state: "PC_MISMATCH" };', "", [T_S3_INT]),
  ("S3-M25", S3, "a corrupt original E1 reads as pending", 'if (e1.tag === "INVALID" || te.tag === "INVALID") return { cls: "INVALID", evidence: ev([]) };', "", [T_S3_INT]),
  ("S3-M26", S3, "a source that throws is an absence", "unreadable = true;", "fact = undefined;", [T_S3]),
]

def run(tests):
    t0 = time.time()
    p = subprocess.run(["npx", "vitest", "run", *tests], cwd=ROOT, capture_output=True, text=True)
    out = p.stdout + p.stderr
    failed = sorted(set(re.findall(r"FAIL\s+\|[a-z]+\|\s+(\S+) > (.+)", out)))
    return p.returncode, failed, round(time.time() - t0, 1)

def main():
    argv = sys.argv[1:]
    out = "docs/evidence/f014b-s2s3/mutation-results.json"
    only = None
    if "--out" in argv: out = argv[argv.index("--out") + 1]
    if "--only" in argv: only = set(argv[argv.index("--only") + 1].split(","))
    bad = []
    for mid, f, desc, old, new, tests in M:
        text = open(os.path.join(ROOT, f), encoding="utf8").read()
        if text.count(old) != 1: bad.append((mid, text.count(old)))
    if bad:
        print("ANCHOR PROBLEMS:", bad); sys.exit(2)
    if "--anchors" in argv:
        print(f"all {len(M)} anchors occur exactly once"); return
    suites = sorted({t for *_, tests in M for t in tests})
    rc, failed, secs = run(suites)
    print(f"baseline: rc={rc} ({secs}s)")
    if rc != 0:
        print("the clean baseline does not pass; refusing to mutate", failed); sys.exit(3)
    results = []
    for mid, f, desc, old, new, tests in M:
        if only and mid not in only: continue
        path = os.path.join(ROOT, f)
        original = open(path, encoding="utf8").read()
        killed_by = None
        try:
            open(path, "w", encoding="utf8").write(original.replace(old, new, 1))
            for t in tests:
                rc, failed, secs = run([t])
                if rc != 0:
                    killed_by = {"suite": t, "first_failing_test": failed[0][1] if failed else "(suite failed to load)"}
                    break
        finally:
            open(path, "w", encoding="utf8").write(original)
        results.append({"id": mid, "file": f, "description": desc, "result": "KILLED" if killed_by else "SURVIVED", "killed_by": killed_by, "suites_run": tests})
        print(f"{mid} {'KILLED' if killed_by else 'SURVIVED'}  {desc}")
    os.makedirs(os.path.dirname(os.path.join(ROOT, out)), exist_ok=True)
    json.dump({"mutants": results, "killed": sum(r["result"] == "KILLED" for r in results), "survived": sum(r["result"] == "SURVIVED" for r in results)}, open(os.path.join(ROOT, out), "w"), indent=2)
    print(f"killed {sum(r['result'] == 'KILLED' for r in results)} survived {sum(r['result'] == 'SURVIVED' for r in results)} of {len(results)}")

main()
