# releases

Code and spec identity are separate: code identity is the Git commit SHA and release tag; spec identity is the F-027 package + native pin + `spec/f027/spec-lock.json`. A code tag never implies design approval, provider readiness, migration readiness or PF-6 promotion.

Tags use `engine-vMAJOR.MINOR.PATCH` (prerelease suffixes allowed). The first number is chosen at first release.

Each release record (here or in the GitHub release) contains: tag and commit SHA; governing spec lock; included migration IDs, if any; CI/conformance evidence; provider/runtime environment if one has lawfully been adopted; unresolved/deferred gates; and an explicit statement when the release is development-only and not PF-6-promoted.
