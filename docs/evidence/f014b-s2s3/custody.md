# F-014B B1 S2 - catalogue manifest, byte custody and regeneration

MECHANISM ONLY. Nothing here classifies any capability safe, grants any permission or installs any GM-wait writer. Labels used in this directory:
EXECUTED (a command was run and its output observed), REASONED (derived from source text or code without running it), UNKNOWN (not established).

## The retained manifest (EXECUTED)

| Item                              | Value                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Path                              | `packages/engine/gm-wait-catalogue/manifests/f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062.json`                                                                                                            |
| Byte length                       | 330,227                                                                                                                                                                                                                        |
| SHA-256 of the file bytes         | `f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062`                                                                                                                                                             |
| Equals the manifest digest        | yes: the digest is the SHA-256 of the exact canonical UTF-8 bytes (`canonicalJson`), and the file IS those bytes, so the file name is the digest and `gm_wait.catalogue_sha256` is the one existing wire field that carries it |
| Current-digest module (generated) | `packages/engine/src/gm-wait-catalogue-current.ts` (`GM_WAIT_CATALOGUE_CURRENT_SHA256`, `GM_WAIT_CATALOGUE_RETAINED_SHA256`)                                                                                                   |
| Formatter                         | `.prettierignore` carries one line for `packages/engine/gm-wait-catalogue/manifests/*.json`: the file is hashed bytes and is never reformatted                                                                                 |

Contents (EXECUTED, counted from the file): 122 fact kinds, 17 provider declarations, 18 provider-registry sites, 6 Close declarations, 1 event
trigger, 30 generated-key routes (6 object literals, 6 `registerObject` calls, 18 `produces` expressions), 94 interned rule references, 40 sources, 0 unresolved
declarations. These counts are an OBSERVATION of the current tree, not a law: nothing asserts 17 or 18, and a changed count changes the digest and
fails `--check` until the manifest is regenerated and reviewed.

Every disposition in the manifest is the literal `UNDECLARED`; the epistemic class is the literal `ACTIONABLE_OR_UNSAFE`; the evaluator is
`NONE_SECTION_10_NOT_ACCEPTED`; live admission is `NOT_INSTALLED_NO_GM_WRITER`. The strict schema has no other value to hold, so a manifest that
classified a member safe has no digest at all.

## Regeneration and drift (EXECUTED)

```
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --check   # default; exits non-zero on any drift
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --write   # writes the digest-named manifest and the current-digest module
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --print   # prints digest, byte length and counts
```

`--check` fails when: the census differs from the retained manifest (an added or removed kind, provider, registry site, Close, event trigger or generated-key
route), the current manifest file is missing or its bytes do not hash to its name, the current-digest module is stale, or a retained manifest file does not
hash to its name. `tests/conformance/gm-wait-catalogue-s2-census.test.ts` runs the same check in-process and through the CLI, and falsifies it with a
dormant provider (exported, module-private and overlaid), an extra registry-list entry, an alternate registration site, a `.register(` call, a non-literal
registration, a generated-key path, a late extension owner and an extension early return.

Toolchain recorded at build (EXECUTED): Node 22.23.5, pnpm 10.33.0, TypeScript 6.0.3 (the compiler API drives the AST scan), vitest 5.0.2, zod 4.6.5.
Changing the TypeScript or zod version can change the AST scan or the structural value-schema fingerprint and therefore the digest without any semantic change;
both are exact-pinned in the lockfile, and a changed digest is a reviewed regeneration, never a silent one.

## What the digest covers and what it does not

Covered (REASONED from `normalizeManifest`): sources, interned rule references, kinds (with owner, facet, value-schema structural fingerprint and rule
references), providers (with where they are registered and what generated-key effect they can have), unresolved declarations, registry sites, Closes,
event triggers, generated-key routes, extension-dispatch structure, the culture route, the scope (roots, methods, AST counts) and the policy.
Set-valued lists are sorted canonically; order-significant lists (rule authority lineage) keep their order; duplicates and dangling references are refused.

Not covered, deliberately: file paths, line numbers and commit SHAs (an unrelated edit does not move the digest; EXECUTED by the unrelated-edit invariance test),
refinement bodies and `admits` predicates of the value schemas (`policy.value_schema_fp_scope` is the literal `STRUCTURAL_ONLY`; see proposals-for-blue.md Q6), and
any runtime behaviour.

Digest verdicts for a supplied digest (EXECUTED): `OK_CURRENT`, `DIGEST_MALFORMED` (not 64 lowercase hex), `DIGEST_UNKNOWN`, `DIGEST_STALE_RETAINED` (a
retained digest that is not the current one), `MANIFEST_BYTES_MISMATCH` (retained bytes that do not hash to their name). `staticVerdict` is default-deny:
`permits` is the literal `false` for a covered capability and for an unknown one alike.

## Source register (EXECUTED for the nine adopted inputs, UNKNOWN for the rest)

The manifest records 40 sources. Nine are ADOPTED_INPUT pages. Each was re-fetched from the native Notion page on 2026-11-21 and its `page_last_edited_at`
equals the pin recorded in the manifest (the generator carries the observed value beside the pin and refuses to run if they differ):

| Page                                                                      | UUID                                   | Pin                        |
| ------------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| F-014B Two-Blocker Resolution v0.3                                        | `41520af9-01e0-817e-bc38-fd479338b87c` | `2026-11-11T02:29:27.464Z` |
| F-014B GM-Mediated Passive Waiting Consolidated v0.6                      | `41520af9-01e0-81f6-b8d5-ec29df56296e` | `2026-11-11T00:34:47.360Z` |
| BLUE F-014B Prospective Source Replacement v0.4 (T0-T5, E0-E5)            | `41a20af9-01e0-811f-9c75-d404f82674cc` | `2026-11-16T15:18:44.683Z` |
| Ratification: Two Prospective Source Imports (v0.4 exact pin)             | `41a20af9-01e0-8129-b485-df13b56a38e5` | `2026-11-16T15:29:12.183Z` |
| Ratification: AM-3.1, AM-3.2, AM-3.3, AM-3.P                              | `41a20af9-01e0-81ec-bd92-fefe3a524dc4` | `2026-11-16T06:58:35.373Z` |
| BLUE CAL-TIME v0.4 calendar semantics                                     | `41b20af9-01e0-81f3-9e42-d6c9cf596dbb` | `2026-11-17T07:32:49.446Z` |
| BLUE CAL-TIME T-1 Unified Clock-Origin Source v1.0                        | `41c20af9-01e0-817c-a9e8-dcb392e3b0d7` | `2026-11-18T22:23:26.085Z` |
| Ratification: CAL-TIME v0.4 calendar semantics A-F, G.1, G.2, G.5         | `41c20af9-01e0-8183-91bc-cf32042552cb` | `2026-11-18T15:23:20.223Z` |
| Ratification: CAL-TIME T-1 Unified Clock-Origin Source v1.0 (five grants) | `41c20af9-01e0-81ba-9fd4-db4da81c8526` | `2026-11-18T22:38:52.341Z` |

The other 31 sources are CODE_RULE pins derived from the rule objects the code itself carries (artifact page UUID and native pin as written in each rule's
provenance). They were NOT individually re-fetched from Notion in this build (UNKNOWN): the manifest proves what the code cites, not that the cited page still
carries that edit time. This is listed for BLUE in proposals-for-blue.md Q5.
