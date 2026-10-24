import { createHash } from "node:crypto";
import { canonicalJson } from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import { CollectionPreparationSchema, StartingChronologySchema } from "@immortalis/operator";
import type { PhoneConfig } from "./config.ts";

/**
 * Owner readback of a SETUP command that ended without a definite outcome (24 October repair, BLUE triage 2).
 *
 * Only the setup commands whose every owner publication derives from nothing but the campaign and the EXACT setting document the operator
 * wrote are read back here: `initialize-time` (one publication: the starting chronology) and `prepare-collection` (three: mechanism,
 * Reserve, basis). The operator names those publications by digest (`starting-chronology:<digest>:intent`,
 * `collection-preparation:<digest>:<step>:intent`), so the identity can be taken BEFORE dispatch from the document alone, and the owners'
 * own committed groups answer later whether each landed. The identity is the pin of the original setting: a different document is a
 * different identity, and no command name, repeated JSON, generic status or new prompt can stand in for it.
 *
 * Every other setup or authoring command keeps NO readback: their publication identities include the player's typed words, a keep
 * secret or a version taken at dispatch, so nothing recoverable from the phone side names what they did. They stay blocked, with an
 * accurate instruction for the engineer. Nothing here asks the player or a referee anything, rewrites a document or repeats a write.
 *
 * The digests are the operator's own formulas, restated here without changing the operator; a test runs the real commands and requires
 * the identities computed here to be the ones the owners committed, so a drift fails there rather than clearing a barrier wrongly.
 */
export const SETUP_COMMANDS: ReadonlySet<string> = new Set([
  "initialize-time",
  "prepare-collection",
]);

export interface SetupIdentity {
  readonly campaign_id: string;
  /** sha256 of the exact pasted document text: the pin of what was dispatched */
  readonly document_sha256: string;
  /** the operator's digest of (campaign, exact setup), from which every publication identity of the command derives */
  readonly digest: string;
  /** the intent identity of every owner publication the command makes, in the order it makes them */
  readonly intents: readonly { readonly step: string; readonly intent_id: string }[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const INTENT = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;
const STEP = /^[a-z][a-z-]{0,31}$/;

export function validSetupIdentity(v: unknown): v is SetupIdentity {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["campaign_id"] === "string" &&
    typeof r["document_sha256"] === "string" &&
    HEX64.test(r["document_sha256"]) &&
    typeof r["digest"] === "string" &&
    HEX64.test(r["digest"]) &&
    Array.isArray(r["intents"]) &&
    r["intents"].length >= 1 &&
    r["intents"].length <= 8 &&
    r["intents"].every((i) => {
      if (i === null || typeof i !== "object") return false;
      const x = i as Record<string, unknown>;
      return (
        typeof x["step"] === "string" &&
        STEP.test(x["step"]) &&
        typeof x["intent_id"] === "string" &&
        INTENT.test(x["intent_id"]) &&
        x["intent_id"].includes(r["digest"] as string)
      );
    })
  );
}

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * The identity a setup command is about to make, from the document alone (taken before dispatch). null when the command is not read back
 * or the document does not parse under the operator's own strict schema (the operator then refuses it itself, and a record with no identity
 * stays blocked rather than being guessed).
 */
export function captureSetup(
  config: PhoneConfig,
  command: string,
  documentText: string,
): SetupIdentity | null {
  let doc: unknown;
  try {
    doc = JSON.parse(documentText);
  } catch {
    return null;
  }
  const document_sha256 = sha(documentText);
  if (command === "initialize-time") {
    const parsed = StartingChronologySchema.safeParse(doc);
    if (!parsed.success) return null;
    const digest = sha(
      canonicalJson({
        campaign_id: config.campaignId,
        time: parsed.data.time,
        statement: parsed.data.statement,
      }),
    );
    return {
      campaign_id: config.campaignId,
      document_sha256,
      digest,
      intents: [{ step: "origin", intent_id: `starting-chronology:${digest}:intent` }],
    };
  }
  if (command === "prepare-collection") {
    const parsed = CollectionPreparationSchema.safeParse(doc);
    if (!parsed.success) return null;
    const digest = sha(canonicalJson({ campaign_id: config.campaignId, setup: parsed.data }));
    return {
      campaign_id: config.campaignId,
      document_sha256,
      digest,
      intents: ["mechanism", "reserve", "basis"].map((step) => ({
        step,
        intent_id: `collection-preparation:${digest}:${step}:intent`,
      })),
    };
  }
  return null;
}

export type SetupEvidence =
  | { readonly kind: "NONE" }
  | { readonly kind: "PARTIAL" }
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "UNAVAILABLE"; readonly detail: string };

/**
 * What the owners hold for THAT setup operation: none of its publications (nothing was committed), all of them (the operation is
 * complete), or some (a partial write that only the operator's own repeat of the identical setup finishes). Read from the committed groups
 * by the original identity; the current state of the campaign, a different origin or another document never stands in for it.
 */
export async function setupEvidence(
  config: PhoneConfig,
  identity: SetupIdentity,
): Promise<SetupEvidence> {
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "immortalis-chat-setup-recovery",
  });
  if (!opened.ok)
    return { kind: "UNAVAILABLE", detail: `the campaign did not open: ${opened.error.code}` };
  const c = opened.value;
  try {
    if (
      identity.campaign_id !== config.campaignId ||
      c.store.head().campaign_id !== config.campaignId
    )
      return { kind: "UNAVAILABLE", detail: "the campaign identity does not match" };
    const landed = identity.intents.map((i) => c.store.committedGroup(i.intent_id) !== null);
    if (landed.every(Boolean)) return { kind: "COMPLETE" };
    if (landed.some(Boolean)) return { kind: "PARTIAL" };
    return { kind: "NONE" };
  } catch {
    return { kind: "UNAVAILABLE", detail: "the owner readback failed" };
  } finally {
    await c.close().catch(() => undefined);
  }
}
