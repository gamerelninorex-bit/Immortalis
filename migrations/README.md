# migrations

Inert contract and manifest location. No live migration script is executed and no provider-specific migration exists until separately authorized (MIG-01–MIG-10 are declarative only).

Every future migration record under `manifests/` must include: migration ID and immutable source/target code and spec versions; affected owners/facts/interfaces; unit/basis/secrecy preservation requirements; preconditions and validation; OB-015/OB-016 applicability; conservation/reconciliation requirements; dry-run evidence; effective authority boundary; abort-before-first-target-commit behavior; post-target-commit reverse-migration requirement where rollback is needed; restore/replay evidence where applicable.

There is no generic "down migration": after a target canonical commit, rollback requires a separately reconciled reverse migration (MIG-09).
