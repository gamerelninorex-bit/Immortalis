import { BUILD_SPEC_IDENTITY, runtimeContractSha256 } from "@immortalis/contracts";

/**
 * Runtime Contract snapshot hashes this build can load canon from. Exactly the build's own by
 * default. Adding an older hash is a compatibility declaration: it needs a lawful statement that the
 * older contract is semantically compatible (or a migration), reviewed as a spec-affecting change.
 */
export const COMPATIBLE_RUNTIME_CONTRACT_SHA256S: readonly string[] = [
  runtimeContractSha256(BUILD_SPEC_IDENTITY) as string,
];
