# spec/f027 — F-027 implementation snapshot

Version anchor for the F-027 implementation line. Notion remains design authority; these files are derived implementation artifacts.

| File                       | Purpose                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spec-lock.json`           | Package/tranche pins, 23 frozen-source pins, composing implementation-authority addenda (F-027-CD1), snapshot file hashes, supersession pointers |
| `runtime-contract.md`      | RC-01–RC-16 text, IM-01–IM-17 map, frozen-source→IM lowering set                                                                                 |
| `acceptance-register.yaml` | V-01–V-14 and IA-01–IA-30 with status (`NOT_IMPLEMENTED`/`BLOCKED`/`UNRUN`/`PASS`/`FAIL`/`NOT_APPLICABLE`)                                       |
| `open-gates.yaml`          | Every unresolved/deferred F-027 horizon (CAL-01–11, Legacy Requires-Decision rows, OB-015/016, MIG, provider, PF-6)                              |

Rules: a newer Notion timestamp never supersedes the lock; editing any file here is a substantive PR needing exact-version review; `pnpm run check:spec` verifies hashes and register completeness; a CI skip is never PASS.

Not snapshotted here (remain in pinned Notion sources): the OB-016 runtime role/permission mapping text, the L-01–L-69 Legacy disposition text, and the full V-battery definitions. Only the Legacy Requires-Decision rows are carried, as gates.

Implementation-authority addenda: `spec-lock.json` `implementation_authority_addenda` pins an addendum at its exact cleared native pin as an authority that **composes with** F-027 v1.0 (the composed authority is F-027 v1.0 + the addendum). An addendum never rewrites or silently supersedes F-027 v1.0, and the F-027 package, tranche and frozen-source pins above are unchanged by it. The only addendum pinned is F-027-CD1 (Causal Draw), pin `2026-10-02T15:11:03.450Z`; `pnpm run check:spec` verifies its exact pin and its composing (not superseding) relation.
