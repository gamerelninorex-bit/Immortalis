import { BUILD_SPEC_IDENTITY, runtimeContractSha256 } from "@immortalis/contracts";

/** The Runtime Contract snapshot hash of THIS build (the contract new campaigns are created under). */
export const BUILD_RUNTIME_CONTRACT_SHA256 = runtimeContractSha256(BUILD_SPEC_IDENTITY) as string;

/**
 * Runtime Contract snapshots written BEFORE the Initial Locality Bootstrap v0.9 surfaces existed. A campaign created under one of these
 * keeps living under it: this build opens, replays and extends it, but under `legacyContractAdmission`, which REFUSES every v0.9
 * surface (the six bootstrap record kinds, the WG_INITIAL_DELEGATION Referee branch and the OPTION_A_V9 projection rules). The
 * declaration is not a read-either reader or a migration: no old byte is rewritten, relabelled or reinterpreted, and the old hash is
 * not merely whitelisted (see tests/integration/legacy-package-compat.test.ts, which opens a package produced by the exact base).
 *
 * `ab2f6385...` is the SHA-256 of the untouched `spec/f027/runtime-contract.md` (byte-identical from the repository skeleton through
 * every slice up to the v0.9 base eafbb127c476cafb8498316e496de29e078a2146).
 */
export const LEGACY_RUNTIME_CONTRACT_SHA256S: readonly string[] = [
  "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
];

/** True for a Runtime Contract this build opens only under the legacy admission (never for the build's own contract). */
export const isLegacyRuntimeContract = (sha256: string): boolean =>
  sha256 !== BUILD_RUNTIME_CONTRACT_SHA256 && LEGACY_RUNTIME_CONTRACT_SHA256S.includes(sha256);

/**
 * Runtime Contract snapshot hashes this build can load canon from: its own, plus the declared pre-v0.9 snapshots above. Adding a hash
 * is a compatibility declaration: it needs a lawful statement that the older contract is semantically compatible (or a migration),
 * reviewed as a spec-affecting change.
 */
export const COMPATIBLE_RUNTIME_CONTRACT_SHA256S: readonly string[] = [
  BUILD_RUNTIME_CONTRACT_SHA256,
  ...LEGACY_RUNTIME_CONTRACT_SHA256S.filter((h) => h !== BUILD_RUNTIME_CONTRACT_SHA256),
];
