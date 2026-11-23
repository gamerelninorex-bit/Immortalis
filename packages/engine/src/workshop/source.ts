import { z } from "zod";
import type { SourceRef } from "@immortalis/contracts";
import { sha256Bytes } from "../hash.ts";

export const WORKSHOP_PRODUCTION_PROFILES: readonly string[] = Object.freeze([]);

const identity = z.object({
  id: z.enum(["workshop-opening-quiet-v4", "workshop-opening-glassbell-v4"]),
  campaign_class: z.literal("QUALIFICATION"),
  disposable_only: z.literal(true),
});

export function workshopFixtureIdentity(bytes: Uint8Array) {
  const parsed = identity.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  const sha256 = sha256Bytes(bytes);
  return Object.freeze({
    id: parsed.id,
    sha256,
    campaignId: `fixture:${parsed.id}:${sha256}`,
    glassbell: parsed.id === "workshop-opening-glassbell-v4",
    constitutiveSource: `profile:${parsed.id}:${sha256}`,
  });
}

export type WorkshopFixtureIdentity = ReturnType<typeof workshopFixtureIdentity>;

const rule = (clause: string): SourceRef => ({
  artifact: "https://app.notion.com/p/42120af901e08189bc23d07e5c9b21fd",
  native_pin: "2026-11-23T13:55:13.379Z",
  clause,
  authority_lineage: [
    "https://app.notion.com/p/42120af901e0811ca412e09374ae5c18",
    "https://app.notion.com/p/42120af901e08188b816facf08e088ba",
  ],
  effective_basis: "F-014B B3 disposable qualification fixture",
  supersedes: null,
});
export const WORKSHOP_CHARTER_RULE = rule("QO.5′ / RD.5 Grant G charter / M-4");
export const WORKSHOP_INSTRUCTION_RULE = rule("RD.2 and RD.5 Grant G instruction");
export const WORKSHOP_DUTY_RULE = rule("RD.3 and RD.6 Grant N");
export const WORKSHOP_EXPOSURE_RULE = rule("RH.2 Grant W");
export const WORKSHOP_CONDITION_RULE = rule("RH.3 and RH.6 Health condition and recovery");
export const WORKSHOP_ANCHOR_RULE = rule("RH.4 and RH.6 Health coverage");
export const WORKSHOP_CLOSE_RULE = rule("RH.5 and RH.6 event-specific Health Close");
export const WORKSHOP_NOTICE_RULE = rule("D3(b) original World-State notice");
