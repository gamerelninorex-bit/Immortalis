import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { OWNER_WORLD_STATE, type OwnerFact } from "@immortalis/contracts";
import { sha256Canonical } from "@immortalis/engine";
import type { FixtureRunnerKeys } from "@immortalis/testkit";
import { workshopNoticePresentBasis } from "../../packages/engine/src/owners/workshop/notice-qualification.ts";
import {
  workshopMatches,
  workshopRef,
  type WorkshopView,
} from "../../packages/engine/src/owners/workshop/publication.ts";
import type { WorkshopLaneXFixture } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import type { WorkshopNoticeOccurrence } from "../../packages/contracts/src/workshop-opening.ts";
import { WorkshopNoticeOccurrenceSchema } from "../../packages/contracts/src/workshop-opening.ts";

export function signedWorkshopLaneX(keys: FixtureRunnerKeys, economyDraft = true) {
  const privateKey = createPrivateKey({
    key: Buffer.from(keys.privateKeyPkcs8Base64, "base64"),
    type: "pkcs8",
    format: "der",
  });
  const publicKey = createPublicKey({
    key: Buffer.from(keys.publicKeySpkiBase64, "base64"),
    type: "spki",
    format: "der",
  });
  const signBody = (value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return { bytes, signature: sign(null, bytes, privateKey) };
  };
  const verified = (proof: { bytes: Buffer; signature: Buffer }) =>
    verify(null, proof.bytes, publicKey, proof.signature);
  function preparation(view: WorkshopView, x: string, duty: string) {
    const present = workshopNoticePresentBasis(view, duty);
    if (!present) return undefined;
    const refs = [
      present.pc.binding,
      present.pc.placement,
      present.pc.world,
      present.pc.locus,
      present.presence,
    ];
    const exact = refs.map(workshopRef);
    const signed = signBody({
      purpose: "fixture:C54",
      campaign: view.campaign_id,
      x,
      duty,
      refs: exact,
    });
    return {
      signed,
      refs,
      exact,
      rootRequestSha256: sha256Canonical(["fixture:root", view.campaign_id, x]),
      proposalSha256: sha256Canonical(["fixture:completion", duty, x]),
      t0WitnessSha256: sha256Canonical(signed.signature.toString("base64")),
    };
  }
  const proofs = new Map<string, NonNullable<ReturnType<typeof preparation>>>();
  let delivered:
    | {
        body: ReturnType<typeof signBody>;
        refs: ReturnType<typeof workshopRef>[];
        occurrence: ReturnType<typeof workshopRef>;
        host: string;
      }
    | undefined;
  const fixture: WorkshopLaneXFixture = {
    ...(economyDraft ? { economyDraft: true } : {}),
    noticeSource: {
      verificationId: "fixture:C54:" + sha256Canonical(keys.publicKeySpkiBase64),
      prepare(view, x, duty) {
        const inputs = preparation(view, x, duty);
        const original = proofs.get(x);
        if (
          !inputs ||
          !original ||
          !verified(original.signed) ||
          !inputs.signed.bytes.equals(original.signed.bytes)
        )
          return undefined;
        return inputs;
      },
      atBoundary(view, b) {
        const original = proofs.get(b.x);
        if (
          !original ||
          !verified(original.signed) ||
          b.t0_witness_sha256 !== original.t0WitnessSha256 ||
          !original.exact.every((pin) => workshopMatches(view.get(pin.key), pin))
        )
          return undefined;
        return original.exact.map((pin) => view.get(pin.key)!);
      },
      recipientSource: {
        recipient(view, occurrence) {
          const proof = delivered;
          const event = WorkshopNoticeOccurrenceSchema.safeParse(occurrence.value);
          if (
            !proof ||
            !event.success ||
            !verified(proof.body) ||
            occurrence.owner !== OWNER_WORLD_STATE ||
            !workshopMatches(occurrence, proof.occurrence) ||
            proof.host !== event.data.pc_id ||
            !proof.refs.every((pin) => workshopMatches(view.get(pin.key), pin))
          )
            return undefined;
          return { witnesses: proof.refs.map((pin) => view.get(pin.key)!), capability: null };
        },
      },
    },
  };
  return {
    fixture,
    authorize(view: WorkshopView, x: string, duty: string) {
      const original = preparation(view, x, duty);
      if (!original) throw new Error("missing original C54 source facts");
      proofs.set(x, original);
      return original.rootRequestSha256;
    },
    authorizeRecipient(occurrence: OwnerFact, event: WorkshopNoticeOccurrence, witness: OwnerFact) {
      const refs = [workshopRef(witness)];
      const exact = workshopRef(occurrence);
      delivered = {
        body: signBody({ purpose: "fixture:recipient", exact, pc: event.pc_id, refs }),
        refs,
        occurrence: exact,
        host: event.pc_id,
      };
    },
  };
}
