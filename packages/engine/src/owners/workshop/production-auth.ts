import { createPublicKey, verify } from "node:crypto";
import { Sha256, SourceRefSchema, z } from "@immortalis/contracts";
import {
  WorkshopFactRefSchema,
  type WorkshopFactRef,
} from "../../../../contracts/src/workshop-opening.ts";
import { gmWaitX } from "../../gm-wait-identity.ts";
import { canonicalEqual } from "../../hash.ts";
import { sha256Bytes } from "../../initial-setup/identity.ts";
import type { WorkshopNoticeSource } from "./notice-publication.ts";
import { workshopMatches, type WorkshopView } from "./publication.ts";
import { WORKSHOP_PRODUCTION_PROFILES } from "./source.ts";
import { WorkshopChoiceSchema, type WorkshopChoiceSource } from "./wait-decision.ts";

const text = z.string().min(1);
const refs = z.array(WorkshopFactRefSchema).min(1);
const original = {
  domain: z.literal("IMMORTALIS:WORKSHOP:PRODUCTION:1"),
  campaign: text,
  profile_sha256: Sha256,
  source: SourceRefSchema,
};
export const WorkshopProductionMessageSchema = z.discriminatedUnion("purpose", [
  z.strictObject({
    ...original,
    purpose: z.literal("GM_INITIAL"),
    x: Sha256,
    session: text,
    rpc_id_serialized: text,
    authenticated_host: text,
    request_sha256: Sha256,
  }),
  z.strictObject({
    ...original,
    purpose: z.literal("C54_COVERAGE"),
    x: Sha256,
    duty: text,
    phase: z.enum(["PREPARATION", "EARNED_BOUNDARY"]),
    request_sha256: Sha256,
    proposal_sha256: Sha256,
    preparation_sha256: Sha256.nullable(),
    witnesses: refs,
  }),
  z.strictObject({
    ...original,
    purpose: z.literal("OFFICE_REVOCATION"),
    instruction: WorkshopFactRefSchema,
    witnesses: refs,
  }),
  z.strictObject({
    ...original,
    purpose: z.literal("NOTICE_RECIPIENT"),
    occurrence: WorkshopFactRefSchema,
    recipient: text,
    witnesses: refs,
  }),
  z.strictObject({
    ...original,
    purpose: z.literal("PLAYER_CHOICE"),
    decision: WorkshopChoiceSchema,
  }),
]);
type Message = z.infer<typeof WorkshopProductionMessageSchema>;
type Purpose = Message["purpose"];
type MessageFor<P extends Purpose> = Extract<Message, { purpose: P }>;

interface SourcePin {
  readonly purpose: Purpose;
  readonly source: Message["source"];
  readonly publicKeySpkiBase64: string;
}

/** Host-owned archive resolves the original signed bytes and can retrieve the same evidence on cold replay. */
export interface WorkshopRetainedOriginals {
  read(ref: string): { readonly bytes: Uint8Array; readonly signature: Uint8Array } | undefined;
  prepare(campaign: string, x: string, duty: string): string | undefined;
  atBoundary(campaign: string, x: string, preparation: string): string | undefined;
  recipient(campaign: string, occurrence: WorkshopFactRef): string | undefined;
}

// A future Sovereign adoption must name every exact trust root and original purpose independently.
const adoptedSources: readonly {
  readonly profile: string;
  readonly profile_sha256: string;
  readonly history_verification_id: string;
  readonly pins: readonly SourcePin[];
}[] = Object.freeze([]);

export function verifyWorkshopOriginal<P extends Purpose>(
  ref: string,
  retained: ReturnType<WorkshopRetainedOriginals["read"]>,
  purpose: P,
  scope: { readonly campaign: string; readonly profile_sha256: string },
  pins: readonly SourcePin[],
): MessageFor<P> | undefined {
  if (!retained || !Sha256.safeParse(ref).success || retained.signature.length !== 64)
    return undefined;
  const bytes = Buffer.from(retained.bytes);
  if (bytes.length > 65536 || sha256Bytes(bytes) !== ref) return undefined;
  try {
    const wire: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const parsed = WorkshopProductionMessageSchema.safeParse(wire);
    if (
      !parsed.success ||
      parsed.data.purpose !== purpose ||
      parsed.data.campaign !== scope.campaign ||
      parsed.data.profile_sha256 !== scope.profile_sha256
    )
      return undefined;
    const message = parsed.data;
    const candidates = pins.filter(
      (pin) => pin.purpose === purpose && canonicalEqual(pin.source, message.source),
    );
    if (candidates.length !== 1) return undefined;
    const key = createPublicKey({
      key: Buffer.from(candidates[0]!.publicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return key.asymmetricKeyType === "ed25519" && verify(null, bytes, key, retained.signature)
      ? (message as MessageFor<P>)
      : undefined;
  } catch {
    return undefined;
  }
}

function current(view: WorkshopView, wanted: readonly WorkshopFactRef[]) {
  if (new Set(wanted.map((pin) => pin.key)).size !== wanted.length) return undefined;
  const facts = wanted.map((pin) => view.get(pin.key));
  return facts.every((fact, i) => workshopMatches(fact, wanted[i]!))
    ? facts.filter((fact) => fact !== undefined)
    : undefined;
}

/** This factory is the live gate. Its adoption tables are versioned engine source, never request input. */
export function productionWorkshopAuthentication(
  profile: { readonly id: string; readonly raw: Uint8Array },
  campaign: string,
  retained: WorkshopRetainedOriginals,
) {
  if (
    !campaign ||
    campaign.startsWith("fixture:") ||
    !WORKSHOP_PRODUCTION_PROFILES.includes(profile.id)
  )
    return undefined;
  const digest = sha256Bytes(profile.raw);
  const adoption = adoptedSources.find(
    (row) => row.profile === profile.id && row.profile_sha256 === digest,
  );
  if (!adoption) return undefined;

  const scope = { campaign, profile_sha256: digest };
  const read = <P extends Purpose>(purpose: P, ref: string | undefined) =>
    ref
      ? verifyWorkshopOriginal(ref, retained.read(ref), purpose, scope, adoption.pins)
      : undefined;
  const noticeSource: WorkshopNoticeSource = {
    verificationId: adoption.history_verification_id,
    prepare(view, x, duty) {
      if (view.campaign_id !== campaign) return undefined;
      const ref = retained.prepare(campaign, x, duty);
      const proof = read("C54_COVERAGE", ref);
      if (
        !ref ||
        !proof ||
        proof.phase !== "PREPARATION" ||
        proof.x !== x ||
        proof.duty !== duty ||
        proof.preparation_sha256 !== null
      )
        return undefined;
      const facts = current(view, proof.witnesses);
      return (
        facts && {
          rootRequestSha256: proof.request_sha256,
          proposalSha256: proof.proposal_sha256,
          t0WitnessSha256: ref,
          refs: facts,
        }
      );
    },
    atBoundary(view, binding) {
      if (view.campaign_id !== campaign || binding.campaign_id !== campaign) return undefined;
      const proof = read(
        "C54_COVERAGE",
        retained.atBoundary(campaign, binding.x, binding.t0_witness_sha256),
      );
      if (
        !proof ||
        proof.phase !== "EARNED_BOUNDARY" ||
        proof.x !== binding.x ||
        proof.duty !== binding.duty.key ||
        proof.request_sha256 !== binding.root_request_sha256 ||
        proof.proposal_sha256 !== binding.proposal_sha256 ||
        proof.preparation_sha256 !== binding.t0_witness_sha256
      )
        return undefined;
      return current(view, proof.witnesses);
    },
    revocationSource: {
      authorize(view, instruction, ref) {
        const proof = read("OFFICE_REVOCATION", ref);
        return view.campaign_id === campaign &&
          proof &&
          workshopMatches(instruction, proof.instruction)
          ? current(view, proof.witnesses)
          : undefined;
      },
    },
    recipientSource: {
      recipient(view, occurrence) {
        if (view.campaign_id !== campaign) return undefined;
        const ref = {
          key: occurrence.key,
          owner: occurrence.owner,
          facet: occurrence.facet,
          version: occurrence.version,
          group_id: occurrence.provenance.group_id,
        };
        const proof = read("NOTICE_RECIPIENT", retained.recipient(campaign, ref));
        const facts =
          proof && workshopMatches(occurrence, proof.occurrence) && current(view, proof.witnesses);
        const pc = (occurrence.value as { pc_id?: unknown }).pc_id;
        return facts && proof && proof.recipient === pc
          ? { witnesses: facts, capability: null }
          : undefined;
      },
    },
  };
  const choiceSource: WorkshopChoiceSource = {
    verificationId: adoption.history_verification_id,
    read(ref) {
      const body = read("PLAYER_CHOICE", ref);
      return body && body.decision.opportunity.campaign === campaign ? body.decision : undefined;
    },
  };
  return {
    noticeSource,
    choiceSource,
    originalGm(ref: string) {
      const body = read("GM_INITIAL", ref);
      if (!body) return undefined;
      const x = gmWaitX(body.session, body.rpc_id_serialized);
      return x.ok && x.x === body.x ? body : undefined;
    },
  };
}
