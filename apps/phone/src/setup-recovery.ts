import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson } from "@immortalis/contracts";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { LocalitySetupSchema, localitySetupId, type LocalitySetup } from "@immortalis/operator";
import {
  localityOutcome,
  readLocality,
  type LocalityOutcome,
  type LocalityReadback,
} from "./locality-evidence.ts";
import { readPin } from "../../../packages/operator/src/locality-pin.ts";
import { StartingChronologySchema } from "../../../packages/operator/src/time-initialization.ts";
import { CollectionPreparationSchema } from "../../../packages/operator/src/collection-preparation.ts";
import type { PhoneConfig } from "./config.ts";

/** Only these commands derive every publication from the campaign and the document alone.
 * No typed answer, keep secret, dispatch-time version or new confirmation is reconstructed here. */
export const SETUP_READBACK_COMMANDS = new Set(["initialize-time", "prepare-collection"]);
/** The ORIGINAL locality setup is also retained by its document, but its evidence is richer (a retained confirmation identity and a resumable partial). */
export const LOCALITY_COMMAND = "establish-locality";
/** Every command whose original document is retained before dispatch. */
export const SETUP_DOCUMENT_COMMANDS = new Set([...SETUP_READBACK_COMMANDS, LOCALITY_COMMAND]);
export interface SetupIdentity {
  readonly command: "initialize-time" | "prepare-collection" | "establish-locality";
  readonly document: string;
  readonly document_sha256: string;
  readonly publication_digest: string;
}
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** The retained identity of one exact setup document (its SHA-256 and the publication digest the shipped command derives from it). */
export function identify(
  campaignId: string,
  command: string,
  document: string,
): SetupIdentity | null {
  if (Buffer.byteLength(document, "utf8") > 65_536) return null;
  try {
    const value: unknown = JSON.parse(document);
    if (command === LOCALITY_COMMAND) {
      const parsed = LocalitySetupSchema.safeParse(value);
      if (!parsed.success) return null;
      return {
        command: LOCALITY_COMMAND,
        document,
        document_sha256: sha(document),
        publication_digest: localitySetupId(campaignId, parsed.data),
      };
    }
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
  // the locality setup has richer evidence (localityEvidence); the two-state readback below is only for the document-derived classes
  if (identity.command === LOCALITY_COMMAND) return { kind: "UNAVAILABLE" };
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

// -- the ORIGINAL locality setup: owner-side evidence of THAT document -----------------------------------------------------------

/** The strict setup the retained identity holds, or null when the identity is not a valid one of this campaign. */
export function localitySetupOf(
  config: Pick<PhoneConfig, "campaignId">,
  identity: SetupIdentity,
): LocalitySetup | null {
  if (!validSetupIdentity(config, LOCALITY_COMMAND, identity)) return null;
  try {
    const parsed = LocalitySetupSchema.safeParse(JSON.parse(identity.document));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * What the trusted record and the owners say became of the ORIGINAL retained document: read-only, never a replay, a reclaim or a new
 * question. The result distinguishes a proven absence of effect, a confirmed setup that is not yet whole (resumable by the same document),
 * a verified completion, an unreconcilable state and an unreadable one.
 */
export async function localityEvidence(
  config: PhoneConfig,
  identity: SetupIdentity,
): Promise<LocalityOutcome> {
  const setup = localitySetupOf(config, identity);
  if (!setup)
    return {
      kind: "BLOCKED",
      code: "IDENTITY_INVALID",
      detail: "the retained setup document is not a valid one of this campaign",
    };
  return localityOutcome({
    campaignDir: config.campaignDir,
    campaignId: config.campaignId,
    operatorDir: config.operatorDir,
    setup,
    buildId: "immortalis-chat-setup-readback",
  });
}

/** What the campaign slot holds of an operator-confirmed locality, read without any setup document. */
export type CampaignSetting =
  | { readonly kind: "NOT_STARTED" }
  | { readonly kind: "ESTABLISHED"; readonly readback: LocalityReadback }
  | { readonly kind: "INCOMPLETE"; readonly committed: readonly string[] }
  | { readonly kind: "BLOCKED"; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly detail: string };

export async function campaignSetting(config: PhoneConfig): Promise<CampaignSetting> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return { kind: "BLOCKED", detail: "no local operator can be verified here" };
  const pin = await readPin({
    dir: config.operatorDir,
    campaignId: config.campaignId,
    operatorUid: uid,
  });
  if (!pin.ok)
    return pin.error.code === "PIN_UNREADABLE"
      ? { kind: "UNAVAILABLE", detail: "the retained setup identity cannot be read now" }
      : {
          kind: "BLOCKED",
          detail: "the retained setup identity is not a valid one of this campaign",
        };
  let entries: string[];
  try {
    entries = await nodeFs.list(config.campaignDir);
  } catch {
    return { kind: "UNAVAILABLE", detail: "the campaign directory cannot be listed now" };
  }
  if (entries.length === 0)
    return pin.value === null ? { kind: "NOT_STARTED" } : { kind: "INCOMPLETE", committed: [] };
  if (!entries.includes("manifest.json"))
    return {
      kind: "BLOCKED",
      detail: "the campaign directory is neither empty nor a campaign package",
    };
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "immortalis-chat-setup-readback",
  });
  if (!opened.ok)
    return { kind: "UNAVAILABLE", detail: "the campaign package cannot be opened now" };
  const c = opened.value;
  try {
    if (c.store.head().campaign_id !== config.campaignId)
      return { kind: "BLOCKED", detail: "the package holds another campaign" };
    const read = readLocality(c, config.campaignId, pin.value);
    if (read.kind === "READY") return { kind: "ESTABLISHED", readback: read.readback };
    if (read.kind === "INCOMPLETE") return { kind: "INCOMPLETE", committed: read.committed };
    if (read.kind === "FAILED") return { kind: "BLOCKED", detail: read.detail };
    return pin.value === null ? { kind: "NOT_STARTED" } : { kind: "INCOMPLETE", committed: [] };
  } catch {
    return { kind: "UNAVAILABLE", detail: "the campaign could not be read now" };
  } finally {
    await c.close().catch(() => undefined);
  }
}

/** Why a pasted document is not a strict original locality setup, in the bounded words the shipped command itself reports (never the values). */
export function explainLocalitySetup(path: string): string[] {
  try {
    const parsed = LocalitySetupSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success
      ? []
      : parsed.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join(".") || "(setting)"}: ${i.message}`);
  } catch {
    return ["the setting could not be read"];
  }
}
