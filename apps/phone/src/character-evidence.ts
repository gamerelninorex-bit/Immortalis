import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  pcExistenceContractKey,
  type ExistenceContract,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual } from "@immortalis/engine";
import {
  MAX_LIST_ITEMS,
  compileContract,
  defaultOperatorDir,
  judgeStatement,
  mirrorItems,
  releaseProblems,
  verifyLocalOperator,
  type CharacterDraft,
  type MirrorItem,
} from "@immortalis/operator";
import { bindingProblems } from "../../../packages/operator/src/original-pc.ts";
import { readKeep, type KeepRecord } from "../../../packages/operator/src/original-pc-keep.ts";
import { readPin } from "../../../packages/operator/src/locality-pin.ts";
import { readLocality } from "./locality-evidence.ts";
import type { PhoneConfig } from "./config.ts";

/**
 * Owner-side EVIDENCE about the player's ORIGINAL character, read from the trusted retained KEEP and the owners (the chat adapter's own
 * module; the operator's rules are reused unchanged). It judges what the campaign holds of the character the shipped `author-character`
 * path released and bound, and what became of ONE exact dispatched operation, and nothing else:
 *
 *   - the release is recognised only by the shipped `releaseProblems` (the retained KEEP's keyed publication identities, the acceptance
 *     record that is exactly the Mirror of the content, and the I-002 referee decision that is the answer the player saw before keeping);
 *   - the binding is recognised only by the shipped `bindingProblems` (the keyed identities of the confirmed statement, a native
 *     explicit insertion, and the IR referee decision), with the coupled world and locus being the verified setting's;
 *   - it is READ-ONLY: it replays nothing, writes nothing, asks nobody, reclaims no lock, and a status string is never evidence.
 *
 * It is not a second source of truth and grants nothing. It settles only the adapter's own pending-operation record, and it reports a
 * released character that is not bound as exactly that: there is no cross-owner rollback.
 */

export const CHARACTER_COMMAND = "author-character";
const BUILD_ID = "immortalis-chat-character-readback";

/** The player's own kept words, as the Character Mirror lists them: allowlisted terms a chat host may relay, with no identity, secret or challenge. */
export interface CharacterReadback {
  readonly character_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  readonly mirror: readonly {
    readonly section: string;
    readonly label: string;
    readonly text: string;
  }[];
  /** the native-presence statement exactly as the player confirmed it (BOUND only) */
  readonly presence?: string;
}

/** What the campaign holds of the character, independent of any run. */
export type CharacterState =
  | { readonly kind: "NO_SETTING"; readonly detail: string }
  | {
      readonly kind: "NONE";
      readonly world_id: string;
      readonly locus_id: string;
      readonly pc_id: null;
    }
  | {
      readonly kind: "KEPT_UNRELEASED";
      readonly pc_id: string;
      readonly world_id: string;
      readonly locus_id: string;
      readonly contract: ExistenceContract;
    }
  | {
      readonly kind: "RELEASED_UNBOUND";
      readonly pc_id: string;
      readonly world_id: string;
      readonly locus_id: string;
      readonly contract: ExistenceContract;
    }
  | {
      readonly kind: "BOUND";
      readonly pc_id: string;
      readonly world_id: string;
      readonly locus_id: string;
      readonly contract: ExistenceContract;
      readonly statement: string;
    }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

const blocked = (code: string, detail: string): CharacterState => ({
  kind: "BLOCKED",
  code,
  detail,
});
const unavailable = (code: string, detail: string): CharacterState => ({
  kind: "UNAVAILABLE",
  code,
  detail,
});

export const contractSha = (c: ExistenceContract): string =>
  createHash("sha256").update(canonicalJson(c), "utf8").digest("hex");

export function readbackOf(
  state: Extract<CharacterState, { contract: ExistenceContract }>,
): CharacterReadback {
  return {
    character_id: state.pc_id,
    world_id: state.world_id,
    locus_id: state.locus_id,
    mirror: mirrorItems(state.contract).map((i: MirrorItem) => ({
      section: i.section,
      label: i.label,
      text: i.text,
    })),
    ...(state.kind === "BOUND" ? { presence: state.statement } : {}),
  };
}

/**
 * What an ALREADY OPEN, owner-verified campaign holds of the character, against the VERIFIED original setting. It is the whole of the
 * judgement `readCharacter` makes once it has the campaign; a caller that has read more of the campaign (the route reader) uses it
 * to avoid opening the package a second time. Read-only: it writes nothing and never closes the campaign.
 */
export function characterStateOf(
  campaign: CanonicalCampaign,
  config: Pick<PhoneConfig, "campaignId">,
  pin: string,
  keep: KeepRecord | null,
): CharacterState {
  if (campaign.store.head().campaign_id !== config.campaignId)
    return blocked("CAMPAIGN_MISMATCH", "the package holds another campaign");
  const setting = readLocality(campaign, config.campaignId, pin);
  if (setting.kind === "NONE" || setting.kind === "INCOMPLETE")
    return { kind: "NO_SETTING", detail: "the original setting is not established" };
  if (setting.kind === "FAILED") return blocked("SETTING_BLOCKED", setting.detail);
  const worldId = setting.readback.world_id;
  const locusId = setting.readback.locus_id;
  const characters = campaign.store
    .listFacts()
    .filter((f) => f.owner === "pc_existence" && f.facet === "existence_contract");
  const binding = campaign.binding();
  if (characters.length > 1)
    return blocked("CHARACTER_CONFLICT", "more than one character is held");
  if (characters.length === 0) {
    if (binding)
      return blocked(
        "BINDING_CONFLICT",
        "an operative binding is held without a character of this command",
      );
    if (keep === null) return { kind: "NONE", world_id: worldId, locus_id: locusId, pc_id: null };
    // kept at this console and retained, not yet released: finished from exactly what was kept, never asked again
    if (campaign.store.getFact(pcExistenceContractKey(keep.pc_id)))
      return blocked("CHARACTER_CONFLICT", "the kept character is not the one held");
    return {
      kind: "KEPT_UNRELEASED",
      pc_id: keep.pc_id,
      world_id: worldId,
      locus_id: locusId,
      contract: keep.contract,
    };
  }
  const fact = characters[0]!;
  const pcId = fact.key.split("/")[1]!;
  const problems = releaseProblems(config.campaignId, fact, keep, campaign.store);
  if (problems.length > 0 || keep === null)
    return blocked("CHARACTER_CONFLICT", problems.join("; ") || "no keep is on record");
  const pc = campaign.playerCharacter(pcId);
  if (!pc) return blocked("CHARACTER_CONFLICT", "the released character is not held");
  if (!binding)
    return {
      kind: "RELEASED_UNBOUND",
      pc_id: pcId,
      world_id: worldId,
      locus_id: locusId,
      contract: pc.value,
    };
  const why = [
    ...(campaign.verify().length > 0 ? ["canonical integrity reports violations"] : []),
    ...bindingProblems({ campaign, campaignId: config.campaignId, keep }, pc.fact, {
      worldId,
      locusId,
    }),
  ];
  if (why.length > 0) return blocked("BINDING_CONFLICT", why.join("; "));
  const t = binding.value.transition;
  if (t.type !== "ACTIVATION")
    return blocked("BINDING_CONFLICT", "the binding is not a first ACTIVATION");
  return {
    kind: "BOUND",
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    contract: pc.value,
    statement: t.basis.statement,
  };
}

/** A trusted, owner-verified open of the configured campaign and the retained records that judge it, or the state that says why not. */
export type CharacterOpen =
  | {
      readonly ok: true;
      readonly campaign: CanonicalCampaign;
      readonly pin: string;
      readonly keep: KeepRecord | null;
      readonly uid: number;
      readonly stateDir: string;
    }
  | { readonly ok: false; readonly state: CharacterState };

/**
 * Opens the campaign afresh (an owner-verified open) after the checks every read of it needs: a trusted operator and retained-state
 * directory, the retained confirmation identity of the original setting (first-writer-wins) and the retained keep. A lock held by another
 * process, an unreadable record or a package that cannot be verified is UNAVAILABLE ("neither done nor not done"); anything present but
 * not trusted is BLOCKED and is never adopted, repaired or deleted. The caller closes the campaign.
 */
export async function openCharacterCampaign(
  config: PhoneConfig,
  buildId: string = BUILD_ID,
): Promise<CharacterOpen> {
  const no = (state: CharacterState): CharacterOpen => ({ ok: false, state });
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return no(blocked("OPERATOR_UNVERIFIED", "no local operator can be verified here"));
  const stateDir = config.operatorDir || defaultOperatorDir(config.campaignDir);
  if (existsSync(stateDir)) {
    const trusted = verifyLocalOperator(stateDir, "operator-state");
    if (!trusted.ok || trusted.value.uid !== uid)
      return no(blocked("OPERATOR_UNVERIFIED", "the retained-state directory is not trusted"));
  }
  const pin = await readPin({ dir: stateDir, campaignId: config.campaignId, operatorUid: uid });
  if (!pin.ok)
    return no(
      pin.error.code === "PIN_UNREADABLE"
        ? unavailable(pin.error.code, "the retained setup identity cannot be read now")
        : blocked(
            pin.error.code,
            "the retained setup identity is not a valid one of this campaign",
          ),
    );
  if (pin.value === null)
    return no({
      kind: "NO_SETTING",
      detail: "no original setting has been confirmed for this campaign",
    });
  const operator = verifyLocalOperator(config.campaignDir, "campaign");
  if (!operator.ok || operator.value.uid !== uid) {
    if (!existsSync(config.campaignDir))
      return no({ kind: "NO_SETTING", detail: "no original setting has been established" });
    return no(
      blocked("OPERATOR_UNVERIFIED", "the campaign package is not trusted for this operator"),
    );
  }
  const kept = await readKeep({ dir: stateDir, campaignId: config.campaignId, operatorUid: uid });
  if (!kept.ok)
    return no(
      kept.error.code === "KEEP_UNREADABLE"
        ? unavailable(kept.error.code, "the retained keep record cannot be read now")
        : blocked(kept.error.code, "the retained keep record is not a valid one of this campaign"),
    );
  const opened = await CanonicalCampaign.open(config.campaignDir, { buildId });
  if (!opened.ok)
    return no(
      unavailable(
        "PACKAGE_UNAVAILABLE",
        "the campaign package cannot be opened now (a lock is held or the package cannot be verified)",
      ),
    );
  return { ok: true, campaign: opened.value, pin: pin.value, keep: kept.value, uid, stateDir };
}

/**
 * Reads the campaign afresh (an owner-verified open) and reports what it holds of the character, against the VERIFIED original setting
 * (the world and locus are the retained confirmation identity's, never guessed). A lock held by another process, an unreadable record
 * or a package that cannot be verified is UNAVAILABLE ("neither done nor not done"); anything present but not reconcilable is BLOCKED and
 * is never adopted, repaired or deleted.
 */
export async function readCharacter(config: PhoneConfig): Promise<CharacterState> {
  const open = await openCharacterCampaign(config);
  if (!open.ok) return open.state;
  const { campaign } = open;
  try {
    return characterStateOf(campaign, config, open.pin, open.keep);
  } catch {
    return unavailable("READ_FAILED", "the campaign could not be read now");
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

/** The retained identity of ONE dispatched character operation (what a recovery looks for), captured before dispatch. */
export interface CharacterIdentity {
  readonly stage: "KEEP" | "PLACE";
  readonly pc_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  /** the exact candidate (KEEP) offered for the review; null when the run finishes what an earlier keep retained */
  readonly draft: CharacterDraft | null;
  /** the digest of the contract that candidate compiles to (null with the candidate) */
  readonly contract_sha256: string | null;
  /** the player's own native-presence statement (PLACE only) */
  readonly statement: string | null;
}

const ENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));

const statementOk = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const j = judgeStatement(v);
  return j.ok && j.text === v;
};
const listOk = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= MAX_LIST_ITEMS && v.every(statementOk);

/**
 * A retained draft exactly as the shipped authoring bounds admit it (each statement trimmed, non-empty, control-free and bounded; each
 * list bounded; contact one exclusive kind). A draft may be INCOMPLETE (a revision in progress) - it is never offered for a keep until
 * the shipped `missingOf` is empty. Anything else is not a draft of this adapter.
 */
export function parseDraft(v: unknown): CharacterDraft | null {
  if (
    !record(v) ||
    !exactKeys(v, [
      "identity",
      "contact",
      "embodiment",
      "continuity",
      "exceptions",
      "open",
      "possessions",
    ])
  )
    return null;
  const single = (x: unknown): x is string | null => x === null || statementOk(x);
  if (!single(v["identity"]) || !single(v["embodiment"]) || !single(v["continuity"])) return null;
  if (!listOk(v["exceptions"]) || !listOk(v["open"]) || !listOk(v["possessions"])) return null;
  let contact: CharacterDraft["contact"] = null;
  const c = v["contact"];
  if (c !== null) {
    if (!record(c)) return null;
    if (c["kind"] === "CONTACT_ANCHOR" && exactKeys(c, ["kind", "surfaces"])) {
      if (!listOk(c["surfaces"]) || c["surfaces"].length === 0) return null;
      contact = { kind: "CONTACT_ANCHOR", surfaces: c["surfaces"] };
    } else if (c["kind"] === "NO_CONTACT" && exactKeys(c, ["kind", "statement"])) {
      if (!statementOk(c["statement"])) return null;
      contact = { kind: "NO_CONTACT", statement: c["statement"] };
    } else return null;
  }
  return {
    identity: v["identity"],
    contact,
    embodiment: v["embodiment"],
    continuity: v["continuity"],
    exceptions: v["exceptions"],
    open: v["open"],
    possessions: v["possessions"],
  };
}

export function validCharacterIdentity(v: unknown): v is CharacterIdentity {
  if (
    !record(v) ||
    !exactKeys(v, [
      "stage",
      "pc_id",
      "world_id",
      "locus_id",
      "draft",
      "contract_sha256",
      "statement",
    ])
  )
    return false;
  if (v["stage"] !== "KEEP" && v["stage"] !== "PLACE") return false;
  for (const k of ["pc_id", "world_id", "locus_id"])
    if (typeof v[k] !== "string" || !ENTITY.test(v[k])) return false;
  if (v["stage"] === "PLACE")
    return v["draft"] === null && v["contract_sha256"] === null && statementOk(v["statement"]);
  if (v["statement"] !== null) return false;
  if (v["draft"] === null) return v["contract_sha256"] === null;
  const draft = parseDraft(v["draft"]);
  const contract = draft ? compileContract(String(v["pc_id"]), draft) : null;
  return contract !== null && v["contract_sha256"] === contractSha(contract);
}

/**
 * What the owners and the trusted keep say became of ONE dispatched operation:
 *
 *   NO_EFFECT        nothing was kept and nothing released: the review was declined, unanswered or not reached (proven; it is not "unknown")
 *   KEPT_UNRELEASED  the player's keep is durably retained and the release is not committed: the SAME keep finishes it, without a new question
 *   RELEASED_UNBOUND the release is committed and verified and no binding is held: the placement is a separate, still-required choice
 *   BOUND            the release, the binding and the referee evidence are committed and a fresh owner-verified open agrees
 *   BLOCKED          present but not reconcilable by any rerun (a foreign, replaced or conflicting identity): engineering must inspect it
 *   UNAVAILABLE      could not be read now
 */
export type CharacterOutcome =
  | { readonly kind: "NO_EFFECT"; readonly detail: string }
  | { readonly kind: "KEPT_UNRELEASED" }
  | { readonly kind: "RELEASED_UNBOUND"; readonly readback: CharacterReadback }
  | { readonly kind: "BOUND"; readonly readback: CharacterReadback }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

export function outcomeOf(state: CharacterState, id: CharacterIdentity): CharacterOutcome {
  if (state.kind === "BLOCKED") return state;
  if (state.kind === "UNAVAILABLE") return state;
  if (state.kind === "NO_SETTING")
    return { kind: "UNAVAILABLE", code: "SETTING_ABSENT", detail: state.detail };
  if (state.world_id !== id.world_id || state.locus_id !== id.locus_id)
    return {
      kind: "BLOCKED",
      code: "SETTING_CHANGED",
      detail: "the verified setting is not the one this operation was dispatched against",
    };
  if (state.kind === "NONE") {
    return id.stage === "KEEP"
      ? { kind: "NO_EFFECT", detail: "no keep was retained and no character was released" }
      : {
          kind: "BLOCKED",
          code: "NOTHING_TO_PLACE",
          detail: "a placement was dispatched but no released character exists",
        };
  }
  if (state.pc_id !== id.pc_id)
    return {
      kind: "BLOCKED",
      code: "CHARACTER_IDENTITY",
      detail: "the character held is not the one this operation was dispatched for",
    };
  // an operation that offered an exact candidate must find exactly that character; a bare resumption finishes whatever was kept
  if (
    id.stage === "KEEP" &&
    id.contract_sha256 !== null &&
    contractSha(state.contract) !== id.contract_sha256
  )
    return {
      kind: "BLOCKED",
      code: "CANDIDATE_MISMATCH",
      detail: "the character kept or released is not the candidate this operation offered",
    };
  if (state.kind === "KEPT_UNRELEASED")
    return id.stage === "KEEP"
      ? { kind: "KEPT_UNRELEASED" }
      : {
          kind: "BLOCKED",
          code: "NOTHING_TO_PLACE",
          detail: "a placement was dispatched but the kept character is not released",
        };
  const readback = readbackOf(state);
  if (state.kind === "RELEASED_UNBOUND") return { kind: "RELEASED_UNBOUND", readback };
  if (id.stage === "PLACE" && id.statement !== null && state.statement !== id.statement)
    return {
      kind: "BLOCKED",
      code: "PLACEMENT_MISMATCH",
      detail: "the binding held is not the placement this operation was dispatched for",
    };
  return { kind: "BOUND", readback };
}

export async function characterOutcome(
  config: PhoneConfig,
  id: CharacterIdentity,
): Promise<CharacterOutcome> {
  return outcomeOf(await readCharacter(config), id);
}

/** two contracts are the same character */
export const sameContract = (a: ExistenceContract, b: ExistenceContract): boolean =>
  canonicalEqual(a, b);
