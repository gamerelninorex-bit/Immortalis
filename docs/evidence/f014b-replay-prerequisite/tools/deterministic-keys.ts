// TEST-ONLY deterministic fixture key derivation for the F-014B replay-prerequisite evidence.
// The seed below is PUBLIC and NON-SECRET by design: anyone can derive these keys, so they can never authenticate anything real.
// The private key is derived at test time from the seed and is never written to a file, a journal, a log or a comment.
// Domain-separated: the domain string below is used nowhere else, and this module is imported only by evidence tests, never by
// production, operator or service code.
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

export const REPLAY_FIXTURE_SEED_DOMAIN = "immortalis/f014b/replay-evidence-fixtures/v1/ed25519-public-test-seed";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface DeterministicFixtureKeys {
  readonly keyId: string;
  readonly privateKeyPkcs8Base64: string;
  readonly publicKeySpkiBase64: string;
}

export function deterministicFixtureKeys(keyId: string): DeterministicFixtureKeys {
  const seed = createHash("sha256").update(`${REPLAY_FIXTURE_SEED_DOMAIN}\0${keyId}`, "utf8").digest();
  const pkcs8 = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return {
    keyId,
    privateKeyPkcs8Base64: pkcs8.toString("base64"),
    publicKeySpkiBase64: createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64"),
  };
}
