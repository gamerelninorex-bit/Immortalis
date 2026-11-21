# F-014B B1 S2 - what the coverage is, and the three hook sites this slice does NOT touch

## Scope statement (binding wording)

The census, the manifest and the drift check give **build/test-time coverage**. Runtime enforcement and enrolment admission remain **S4 / section 10 source gates**.
Nothing in this slice refuses an enrolment at run time, vetoes a registration, or proves that every enrolled member is covered. An element the census cannot
account for is UNDECLARED, never production-safe, and no element is classified safe at all.

## Method (EXECUTED)

Two independent methods run over the actual declarations and must agree; a member found by only one method is a census error, not a manifest entry:

1. Runtime reflection: every module under `packages/contracts/src`, `packages/engine/src` and `packages/protocol/src` is imported and its exports are inspected
   (provider objects, registry contents, Close declarations, event triggers, the `ALL_FACT_KINDS` and `CANONICAL_OWNER_REGISTRY` tables).
2. A TypeScript-compiler AST scan over `apps`, `packages/contracts/src`, `packages/engine/src`, `packages/operator/src`, `packages/protocol/src`
   (provider literals, `new StageProviderRegistry([...])` sites, `.register(` calls, `produces` expressions, `registerObject` calls, object literals with generated keys,
   Close and event-trigger declarations, the extension-dispatch function). The testkit and `tests` are fixtures and are excluded roots.

`StageProviderRegistry` keeps its maps in ES-private fields and there is no global registry of providers: each of the registry construction sites is its own
registry. The census therefore records providers and sites separately and marks a provider that appears in no site as DORMANT (it is still in the manifest, so
adding one changes the digest).

## Observations, not laws

The current tree has 17 provider declarations, 18 registry sites (the culture provider is declared and in no site, i.e. dormant), 6 Closes, 1 event trigger and no
`.register(` call outside the registry constructor. These numbers are recorded as an observation in the manifest's scope counts. No test or rule hard-codes them as
a requirement; a different number is a drift that regenerates the manifest, not a failure of a law.

Generated-key effect of a provider (REASONED from `owners/admission.ts`): a provider's `produces` can only emit keys whose owner and facet admission accepts for
that provider's own owner, so the effect upper bound recorded is the set of kinds of the provider's own owner/facet. An extension owner is not in the canonical
registry; it is recorded from the bindings in `storeBindings`.

Extension dispatch (EXECUTED structure pin from the AST): `storeBindings` has 7 early returns. Groups owned by an extension are never historically verified, and
`historyVerificationId` is blind to extensions (a late extension changes no history id). The manifest pins the structural hash of the function, so a change to
its early-return structure moves the digest.

## Falsification (EXECUTED; `tests/conformance/gm-wait-catalogue-s2-census.test.ts`, `gm-wait-catalogue-s2.test.ts`)

Each of these is built by the test (an overlay of source text or a mutated manifest), never read from the helper, and each must be reported as a coverage violation
or a digest change: an added dormant provider exported from a module; an added module-private dormant provider; a provider added to a registry list; a second
registration site; a `.register(` call; a non-literal registration; a generated-key path; a late extension owner; an extension early return; a Close rename; a new
event trigger; an unrelated source edit must NOT change the digest; a missing current manifest file; a retained file whose bytes do not hash to its name; a census-method
disagreement.

## The three runtime hook sites (NOT touched by this slice)

A runtime refusal at the registration or admission choke would need an edit to one of these files, all of which are on the forbidden list of the work order (issue #122) and
are byte-identical to main in this branch (proof: records.md, forbidden-file identity):

| Site (as at base 0cff287)                                                                | What a runtime hook there would be                                               | Why it is not here                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/temporal/providers.ts`, `StageProviderRegistry.register` (line 106) | refuse a provider that the current catalogue does not cover at registration time | forbidden file; a runtime veto is S4 / section 10 scope (v6.2 section 5: any runtime interception, owner policy or active gate is new scope for S4) |
| `packages/engine/src/owners/extension.ts`, `storeBindings` (line 38)                     | refuse or classify an extension owner's bindings at store construction           | forbidden file; the extension seam is also where historical verification is blind                                                                   |
| `packages/engine/src/owners/admission.ts`, `check` (line 562)                            | refuse a group whose provider or kind is not covered at admission                | forbidden file                                                                                                                                      |

Until S4 builds such a hook from an accepted section 10 source, the catalogue is a reviewed, hashed statement of what exists and is undeclared. It is not a gate.
