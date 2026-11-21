# Proposals for BLUE exact-head review

Each item below was built as the Builder's own proposal where the accepted sources are silent. None is a ratified decision. Each is marked "proposal for BLUE exact-head review"
and lists what a different BLUE answer would change.

## Q2 - category 5 key set: PROVISIONAL, one row (proposal for BLUE exact-head review)

The sources name no fact kind for "(5) lawfully PC-known present commitments/background". Built: a single provisional template, the PC's standing-instruction ledger head
(`pc/{pc}/standing-instruction-ledger/head`) and sequence-1 version (`.../version/1`), result class PARTIAL_WITNESS or UNKNOWN only, three proof requirements carried in the trace
(exact operative PC identity, current source permission/visibility, governing policy). No replacement fact or key was invented. A different BLUE answer replaces one template row and
the three proof checks in `commitmentsOf`; no wire field, schema or other category depends on it.

## Q4 - policy identities (proposal for BLUE exact-head review)

R-1 asks for semantic identities for the evaluator, live admission, historical verification and each applicable owner/audience projection policy. The code has no GM-wait
live-admission identity (only `historyVerificationId`, which a late extension does not change) and no Epistemic evaluator. Built: manifest-local literals
`NONE_SECTION_10_NOT_ACCEPTED` (evaluator) and `NOT_INSTALLED_NO_GM_WRITER` (live admission), held by the strict schema as the only representable values; S4 or B2 introduces a real
identity by a new manifest version. Historical verification is bound to the code's own canonical id and legacy suffix. The audience projection binds `AUDIENCE_FACT_KIND_IDS` and the
four access-class constants the code declares. A different BLUE answer changes the `policy` section and the schema literals; the digest changes with it.

## Q5 - source register (proposal for BLUE exact-head review)

Nine adopted inputs are in the register (custody.md lists UUIDs and pins), each re-fetched natively on 2026-11-21 with `page_last_edited_at` equal to the pin. The closed list is the
Builder's proposal. The other 31 sources are CODE_RULE pins derived from the rule objects; they were not individually re-fetched (UNKNOWN). BLUE may want a native re-verification of those 31
in a separate pass, or to confirm that citing what the code cites is the intended meaning of "source register".

## Q6 - value-schema fingerprint scope (proposal for BLUE exact-head review)

Each kind's value schema is fingerprinted by its structural JSON-Schema rendering (EXECUTED: 122 of 122 convert). Refinement bodies and `admits` predicates are not captured, and the manifest says so
in `policy.value_schema_fp_scope: STRUCTURAL_ONLY` (a literal; a looser claim does not validate). The kind's rule pins and admission id are bound as well. Residual risk: a zod upgrade can change the
rendering, and therefore the digest, with no semantic change (zod is exact-pinned at 4.6.5), and a pure refinement change does not move the digest.

## Q7 - CONTINUATION reads and the boundary index (proposal for BLUE exact-head review)

The sources do not list which of categories 2-7 a CONTINUATION re-reads. Built: a CONTINUATION reads categories 1-7 (never 8: no origin witness, no Input, Completion or chronology record),
and the catalogue digest is judged against the retained manifests. The legacy boundary-index cross-check for the PC movement object is dropped: the object is read by its exact key alone. A
different BLUE answer changes which templates a CONTINUATION includes and, for the cross-check, adds a boundary-index read the current design deliberately avoids.

## Enforcement boundary (recorded, not proposed)

BLUE's binding answer to Q1: the scan is build/test-time coverage; runtime enforcement and enrolment admission remain S4 / section 10 source gates. The manifest carries the same sentence as the literal
`policy.enforcement_boundary`, and no comment or document in this slice describes the scan as a runtime veto.

## Things this slice could not establish (UNKNOWN)

- The producer/consumer authority for category 5 (s3-present-reader.md).
- Whether the 31 code-derived source pins still match their native pages.
- The W2 v0.4 page was not read in this build.
- Hosted CI cost of the integration project with the new files (a local run is recorded in records.md).
