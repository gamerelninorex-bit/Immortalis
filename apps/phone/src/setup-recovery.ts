import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson } from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import { StartingChronologySchema } from "../../../packages/operator/src/time-initialization.ts";
import { CollectionPreparationSchema } from "../../../packages/operator/src/collection-preparation.ts";
import type { PhoneConfig } from "./config.ts";

/** Only these commands derive every publication from the campaign and the document alone.
 * No typed answer, keep secret, dispatch-time version or new confirmation is reconstructed here. */
export const SETUP_READBACK_COMMANDS = new Set(["initialize-time", "prepare-collection"]);
export interface SetupIdentity {
  readonly command: "initialize-time" | "prepare-collection";
  readonly document: string;
  readonly document_sha256: string;
  readonly publication_digest: string;
}
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function identify(campaignId: string, command: string, document: string): SetupIdentity | null {
  if (Buffer.byteLength(document, "utf8") > 65_536) return null;
  try {
    const value: unknown = JSON.parse(document);
    let subject: unknown;
    if (command === "initialize-time") {
      const parsed = StartingChronologySchema.safeParse(value);
      if (!parsed.success) return null;
      subject = {
        campaign_id: campaignId,
        time: parsed.data.time,
        statement: parsed.data.statement,
      };
    } else if (command === "prepare-collection") {
      const parsed = CollectionPreparationSchema.safeParse(value);
      if (!parsed.success) return null;
      subject = { campaign_id: campaignId, setup: parsed.data };
    } else return null;
    return {
      command,
      document,
      document_sha256: sha(document),
      publication_digest: sha(canonicalJson(subject)),
    };
  } catch {
    return null;
  }
}

export function captureSetup(
  config: PhoneConfig,
  command: string,
  path: string,
): SetupIdentity | null {
  try {
    return identify(config.campaignId, command, readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function validSetupIdentity(
  config: Pick<PhoneConfig, "campaignId">,
  command: string,
  v: unknown,
): v is SetupIdentity {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (r["command"] !== command || typeof r["document"] !== "string") return false;
  const expected = identify(config.campaignId, command, r["document"]);
  return (
    expected !== null &&
    r["document_sha256"] === expected.document_sha256 &&
    r["publication_digest"] === expected.publication_digest
  );
}

export type SetupEvidence =
  { readonly kind: "NONE" | "COMPLETE" | "PARTIAL" } | { readonly kind: "UNAVAILABLE" };

/** Read the owners' original committed groups under their exact identities. Never replay a setup or ask anyone again.
 * A partially committed preparation needs the operator's inspected repeat of the identical document; chat remains blocked. */
export async function setupEvidence(
  config: PhoneConfig,
  identity: SetupIdentity,
): Promise<SetupEvidence> {
  if (!validSetupIdentity(config, identity.command, identity)) return { kind: "UNAVAILABLE" };
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "immortalis-chat-setup-readback",
  });
  if (!opened.ok) return { kind: "UNAVAILABLE" };
  const c = opened.value;
  try {
    if (c.store.head().campaign_id !== config.campaignId) return { kind: "UNAVAILABLE" };
    const stem =
      identity.command === "initialize-time" ? "starting-chronology" : "collection-preparation";
    const steps =
      identity.command === "initialize-time" ? [""] : [":mechanism", ":reserve", ":basis"];
    let landed = 0;
    for (const step of steps) {
      const prefix = `${stem}:${identity.publication_digest}${step}`;
      const group = c.store.committedGroup(`${prefix}:intent`);
      if (group) {
        if (group.group_id !== `${prefix}:group` || group.intent_id !== `${prefix}:intent`)
          return { kind: "UNAVAILABLE" };
        landed++;
      }
    }
    return { kind: landed === 0 ? "NONE" : landed === steps.length ? "COMPLETE" : "PARTIAL" };
  } catch {
    return { kind: "UNAVAILABLE" };
  } finally {
    await c.close().catch(() => undefined);
  }
}
