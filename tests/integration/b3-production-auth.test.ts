import { createPrivateKey, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import { sha256Bytes } from "../../packages/engine/src/initial-setup/identity.ts";
import {
  productionWorkshopAuthentication,
  verifyWorkshopOriginal,
} from "../../packages/engine/src/owners/workshop/production-auth.ts";
import { WORKSHOP_NOTICE_RULE } from "../../packages/engine/src/owners/workshop/source.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { workshopRawProfile } from "../support/b3-opening.ts";

describe("B3 production original-message authentication", () => {
  it("verifies exact Ed25519 originals only under the stated source, domain, purpose and scope", () => {
    const keys = generateFixtureRunnerKeys();
    const fixturePrivateKey = createPrivateKey({
      key: Buffer.from(keys.privateKeyPkcs8Base64, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const digest = sha256Bytes(workshopRawProfile("glassbell"));
    const scope = { campaign: "workshop-auth-test", profile_sha256: digest };
    const session = "original-gm-session";
    const rpc_id_serialized = '"original-message-id"';
    const derived = gmWaitX(session, rpc_id_serialized);
    if (!derived.ok) throw new Error("invalid test request identity");
    const body = {
      ...scope,
      domain: "IMMORTALIS:WORKSHOP:PRODUCTION:1",
      purpose: "GM_INITIAL",
      source: WORKSHOP_NOTICE_RULE,
      x: derived.x,
      session,
      rpc_id_serialized,
      authenticated_host: "authenticated-test-host",
      request_sha256: "1".repeat(64),
    };
    const make = (message: unknown) => {
      const bytes = Buffer.from(JSON.stringify(message));
      return { bytes, signature: sign(null, bytes, fixturePrivateKey) };
    };
    const original = make(body);
    const pin = {
      purpose: "GM_INITIAL" as const,
      source: WORKSHOP_NOTICE_RULE,
      publicKeySpkiBase64: keys.publicKeySpkiBase64,
    };
    const ref = sha256Bytes(original.bytes);
    expect(verifyWorkshopOriginal(ref, original, "GM_INITIAL", scope, [pin])).toEqual(body);
    expect(verifyWorkshopOriginal(ref, original, "GM_INITIAL", scope, [])).toBeUndefined();
    expect(verifyWorkshopOriginal(ref, original, "GM_INITIAL", scope, [pin, pin])).toBeUndefined();
    expect(verifyWorkshopOriginal(ref, original, "C54_COVERAGE", scope, [pin])).toBeUndefined();
    expect(
      verifyWorkshopOriginal(ref, original, "GM_INITIAL", { ...scope, campaign: "other" }, [pin]),
    ).toBeUndefined();
    expect(
      verifyWorkshopOriginal(
        ref,
        original,
        "GM_INITIAL",
        { ...scope, profile_sha256: "2".repeat(64) },
        [pin],
      ),
    ).toBeUndefined();
    expect(
      verifyWorkshopOriginal(ref, original, "GM_INITIAL", scope, [
        { ...pin, publicKeySpkiBase64: generateFixtureRunnerKeys().publicKeySpkiBase64 },
      ]),
    ).toBeUndefined();
    expect(
      verifyWorkshopOriginal(ref, original, "GM_INITIAL", scope, [
        { ...pin, source: { ...pin.source, native_pin: "unadopted-pin" } },
      ]),
    ).toBeUndefined();
    const changed = make({ ...body, domain: "fixture:GM" });
    expect(verifyWorkshopOriginal(ref, changed, "GM_INITIAL", scope, [pin])).toBeUndefined();
    expect(
      verifyWorkshopOriginal(sha256Bytes(changed.bytes), changed, "GM_INITIAL", scope, [pin]),
    ).toBeUndefined();
    const forged = make({ ...body, request_sha256: "3".repeat(64) });
    expect(
      verifyWorkshopOriginal(
        sha256Bytes(forged.bytes),
        {
          bytes: forged.bytes,
          signature: original.signature,
        },
        "GM_INITIAL",
        scope,
        [pin],
      ),
    ).toBeUndefined();

    const retained = {
      read: vi.fn(() => original),
      prepare: vi.fn(() => ref),
      atBoundary: vi.fn(() => ref),
      recipient: vi.fn(() => ref),
    };
    for (const mode of ["quiet", "glassbell"] as const) {
      const profile = { id: "workshop-opening-" + mode + "-v4", raw: workshopRawProfile(mode) };
      expect(productionWorkshopAuthentication(profile, scope.campaign, retained)).toBeUndefined();
      expect(
        productionWorkshopAuthentication(profile, "fixture:claimed-live", retained),
      ).toBeUndefined();
    }
    for (const lookup of Object.values(retained)) expect(lookup).not.toHaveBeenCalled();
  });
});
