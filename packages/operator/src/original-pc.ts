import { createHash, createHmac } from "node:crypto";
import {
  EntityId,
  ExistenceContractSchema,
  I002_ADMITTED_CLASS,
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  REFEREE_OP_I002,
  RefereeDecisionRecordSchema,
  canonicalJson,
  pcExistenceContractKey,
  type CommitGroup,
  type ExistenceContract,
  type I002HostDecision,
  type OwnerFact,
  type Publication,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  canonicalEqual,
  refereeCandidateItems,
  refereeQualificationViolation,
  type FsOps,
} from "@immortalis/engine";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { newKeepSecret, readKeep, writeKeep, type KeepRecord } from "./original-pc-keep.ts";
import { askI002, askIr, refereeConfigured, type RefereeRuntime } from "./referee-session.ts";
import { LocalOperatorSession, defaultOperatorDir } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * Original player-character authorship and first native ACTIVATION: the shipped, local, out-of-character path by which the actual
 * human at the console authors an ordinary continuing character in their own words, reviews the WHOLE Character Mirror, revises it
 * until they explicitly keep the last displayed whole, and then — as a separate, second choice — states and confirms that the
 * character is originally present at the already established world and locus. It composes three existing owner operations on
 * `CanonicalCampaign` and nothing else:
 *
 *   `releasePlayerCharacter`  (I-002 `pc_existence/existence_contract`)               after the whole-Mirror KEEP
 *   `bindPlayerCharacter`     (Role Registry `role_registry/player_character_binding`) after the separately confirmed native statement
 *
 * The world and locus are NOT created, defaulted or inferred here: they must already be committed by World-State. The acceptance
 * recorded in the contract is the set of Mirror items this module derived from the contract's own content and the player was shown;
 * a caller-submitted `items_displayed_and_accepted` is not proof of review, so a contract whose release is not exactly what this
 * module would have recorded for its content is never bound by it. The binding is committed on `NATIVE_ALREADY_THERE` /
 * `EXPLICIT_PLAYER_AUTHORED_FACT` with the player's statement preserved verbatim; coexistence of a character, world and locus is
 * never a basis.
 *
 * Mechanism only. Nothing here gives the character a physical position or custody, perception, knowledge, action, time, narration or
 * any capability, and a released character that is not (yet) bound is reported as exactly that: there is no cross-owner rollback.
 */

// ---------------------------------------------------------------------------------------------------------------------------------
// The player's authored content: a draft, revised only by explicit edits, compiled mechanically into the Existence Contract.
// ---------------------------------------------------------------------------------------------------------------------------------

/** The most one authored statement may hold, and the most entries one list may hold: a bound on what the console is asked to show. */
export const MAX_STATEMENT_CHARS = 500;
export const MAX_LIST_ITEMS = 12;
export type ContactDraft =
  | { readonly kind: "CONTACT_ANCHOR"; readonly surfaces: readonly string[] }
  | { readonly kind: "NO_CONTACT"; readonly statement: string };

export interface CharacterDraft {
  readonly identity: string | null;
  readonly contact: ContactDraft | null;
  readonly embodiment: string | null;
  readonly continuity: string | null;
  readonly exceptions: readonly string[];
  readonly open: readonly string[];
  readonly possessions: readonly string[];
}

export const EMPTY_DRAFT: CharacterDraft = {
  identity: null,
  contact: null,
  embodiment: null,
  continuity: null,
  exceptions: [],
  open: [],
  possessions: [],
};

const hasControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};

/**
 * Bounds one statement the player typed: trimmed, non-empty, at most 500 characters and free of control characters (so it cannot
 * restyle the console). Nothing else is judged here. Whether the words are the player's own character-local claim or a claim about
 * the world, an office, an institution or an independent actor is NOT decided by this code or by a prefix the player types: it is
 * decided by the AI referee host (I-002 classification), whose answer the engine validates and retains.
 */
export function judgeStatement(
  raw: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "a statement cannot be empty" };
  if (hasControl(text))
    return { ok: false, reason: "a statement cannot contain control characters" };
  if (text.length > MAX_STATEMENT_CHARS)
    return { ok: false, reason: `a statement is at most ${MAX_STATEMENT_CHARS} characters` };
  return { ok: true, text };
}

type Field = "identity" | "embodiment" | "continuity";
type ListName = "contact" | "exception" | "open" | "possession";
export type Edit =
  | { readonly op: "set"; readonly field: Field; readonly text: string }
  | { readonly op: "set-contact"; readonly text: string }
  | { readonly op: "set-no-contact"; readonly text: string }
  | { readonly op: "add"; readonly list: ListName; readonly text: string }
  | { readonly op: "remove"; readonly list: ListName; readonly n: number };

const FIELDS: readonly string[] = ["identity", "embodiment", "continuity"];
const LISTS: readonly string[] = ["contact", "exception", "open", "possession"];

/** Parses one revision line: `set identity|embodiment|continuity|contact|no-contact <text>`, `add contact|exception|open|possession <text>`, `remove <list> <n>`. */
export function parseEdit(line: string): { ok: true; edit: Edit } | { ok: false; reason: string } {
  const m = /^(set|add|remove)\s+(\S+)\s*(.*)$/s.exec(line.trim());
  if (!m) return { ok: false, reason: `not a change: ${JSON.stringify(line)}` };
  const [, verb, target, rest] = m as unknown as [string, string, string, string];
  if (verb === "remove") {
    const n = /^[1-9][0-9]{0,2}$/.test(rest.trim()) ? Number(rest.trim()) : 0;
    if (!LISTS.includes(target) || n === 0)
      return { ok: false, reason: `not a removal: ${JSON.stringify(line)}` };
    return { ok: true, edit: { op: "remove", list: target as ListName, n } };
  }
  const judged = judgeStatement(rest);
  if (!judged.ok) return { ok: false, reason: judged.reason };
  if (verb === "set") {
    if (FIELDS.includes(target))
      return { ok: true, edit: { op: "set", field: target as Field, text: judged.text } };
    if (target === "contact") return { ok: true, edit: { op: "set-contact", text: judged.text } };
    if (target === "no-contact")
      return { ok: true, edit: { op: "set-no-contact", text: judged.text } };
    return { ok: false, reason: `nothing called ${JSON.stringify(target)} can be set` };
  }
  if (!LISTS.includes(target))
    return { ok: false, reason: `nothing called ${JSON.stringify(target)} can be added to` };
  return { ok: true, edit: { op: "add", list: target as ListName, text: judged.text } };
}

const LIST_KEY = { exception: "exceptions", open: "open", possession: "possessions" } as const;

/** Applies ONE revision cycle's edits to the whole draft, all or none: a refused edit leaves the draft exactly as it was. */
export function applyEdits(
  draft: CharacterDraft,
  edits: readonly Edit[],
): { ok: true; draft: CharacterDraft } | { ok: false; reason: string } {
  let d = draft;
  for (const e of edits) {
    if (e.op === "set") d = { ...d, [e.field]: e.text };
    else if (e.op === "set-contact")
      d = { ...d, contact: { kind: "CONTACT_ANCHOR", surfaces: [e.text] } };
    else if (e.op === "set-no-contact")
      d = { ...d, contact: { kind: "NO_CONTACT", statement: e.text } };
    else if (e.op === "add" && e.list === "contact") {
      if (d.contact?.kind === "NO_CONTACT")
        return {
          ok: false,
          reason: "the character has NO-CONTACT: use `set contact <text>` to replace it explicitly",
        };
      const surfaces = [...(d.contact?.surfaces ?? []), e.text];
      if (surfaces.length > MAX_LIST_ITEMS)
        return { ok: false, reason: `at most ${MAX_LIST_ITEMS} contact surfaces` };
      d = { ...d, contact: { kind: "CONTACT_ANCHOR", surfaces } };
    } else if (e.op === "add") {
      const key = LIST_KEY[e.list as keyof typeof LIST_KEY];
      if (d[key].length >= MAX_LIST_ITEMS)
        return { ok: false, reason: `at most ${MAX_LIST_ITEMS} entries in ${e.list}` };
      d = { ...d, [key]: [...d[key], e.text] };
    } else if (e.op === "remove" && e.list === "contact") {
      if (d.contact?.kind !== "CONTACT_ANCHOR" || e.n > d.contact.surfaces.length)
        return { ok: false, reason: `there is no contact surface ${e.n}` };
      const surfaces = d.contact.surfaces.filter((_, i) => i !== e.n - 1);
      d = { ...d, contact: surfaces.length === 0 ? null : { kind: "CONTACT_ANCHOR", surfaces } };
    } else if (e.op === "remove") {
      const key = LIST_KEY[e.list as keyof typeof LIST_KEY];
      if (e.n > d[key].length) return { ok: false, reason: `there is no ${e.list} ${e.n}` };
      d = { ...d, [key]: d[key].filter((_, i) => i !== e.n - 1) };
    }
  }
  return { ok: true, draft: d };
}

/** What the draft still lacks before it can be kept: the I-002 §4 minimum that is the player's to state (nothing is inferred for them). */
export function missingOf(d: CharacterDraft): string[] {
  const out: string[] = [];
  if (d.identity === null) out.push("who or what you are (identity)");
  if (d.contact === null)
    out.push("how the world can register you: one contact surface, or an explicit no-contact");
  if (d.embodiment === null) out.push("what form constitutes you (embodiment)");
  if (d.continuity === null) out.push("what keeps you the same continuing self (continuity)");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The Character Mirror: derived from the CONTENT of a contract, so what was shown, what is accepted and what is stored cannot drift.
// ---------------------------------------------------------------------------------------------------------------------------------

export type MirrorSection =
  | "Identity"
  | "Notable traits and abilities"
  | "Starting possessions"
  | "Still open"
  | "About the world"
  | "How this character came to be";

export interface MirrorItem {
  readonly id: string;
  readonly section: MirrorSection;
  /** what the line is, in plain words (display only; the identity of the item is its slot and statement) */
  readonly label: string;
  readonly text: string;
}

export const DELEGATION_NONE_TEXT =
  "Nothing about this character was randomized, delegated or sealed: every statement above is yours.";
export const WORLD_CLAIMS_NONE_TEXT =
  "Nothing about the wider world (places, offices, followers, institutions, other people) is part of this character. Only what the AI referee host classified as your own was accepted; anything it did not is left out and listed.";

const LABELS: Readonly<Record<string, string>> = {
  identity: "who or what you are",
  embodiment: "your form",
  continuity: "what keeps you the same continuing self",
  contact: "the world can register you through",
  "no-contact": "NO-CONTACT (the world has no way to register you)",
  exception: "differs from what would normally be expected",
  possession: "you begin with",
  open: "left open",
  "world-claims-none": "wider-world claims",
  "delegation-none": "delegation",
};

const sha = (value: unknown, length: number): string =>
  createHash("sha256").update(canonicalJson(value), "utf8").digest("hex").slice(0, length);

type ContractBody = Pick<
  ExistenceContract,
  | "identity_agency"
  | "contact"
  | "embodiment_topology"
  | "continuity_rule"
  | "baseline_exception"
  | "entry_envelope"
>;

/** The complete Mirror of a contract's content, in display order. This single function decides what is "displayed and accepted". */
export function mirrorItems(c: ContractBody): readonly MirrorItem[] {
  const section = (slot: string): MirrorSection =>
    slot === "exception"
      ? "Notable traits and abilities"
      : slot === "possession"
        ? "Starting possessions"
        : slot === "open"
          ? "Still open"
          : "Identity";
  const content = refereeCandidateItems(c).map((i): MirrorItem => {
    const label = i.item_id.split("/")[1]!;
    return {
      id: i.item_id,
      section: section(i.slot),
      label: LABELS[label.replace(/-\d+$/, "")] ?? label,
      text: i.text,
    };
  });
  const fixed = (slot: string, sec: MirrorSection, text: string): MirrorItem => ({
    id: `mirror/${slot}/${sha([slot, text], 12)}`,
    section: sec,
    label: LABELS[slot] ?? slot,
    text,
  });
  return [
    ...content,
    fixed("world-claims-none", "About the world", WORLD_CLAIMS_NONE_TEXT),
    fixed("delegation-none", "How this character came to be", DELEGATION_NONE_TEXT),
  ];
}

const authored = (statement: string) => ({ statement, provenance: "PLAYER-AUTHORED" as const });

/** The Existence Contract a complete draft compiles to, with the acceptance record of exactly its own Mirror; null while the draft is incomplete. */
export function compileContract(pcId: string, d: CharacterDraft): ExistenceContract | null {
  if (missingOf(d).length > 0) return null;
  const body: ContractBody = {
    identity_agency: authored(d.identity!),
    contact:
      d.contact!.kind === "CONTACT_ANCHOR"
        ? { kind: "CONTACT_ANCHOR", surfaces: d.contact!.surfaces.map(authored) }
        : { kind: "NO_CONTACT", statement: authored(d.contact!.statement) },
    embodiment_topology: authored(d.embodiment!),
    continuity_rule: authored(d.continuity!),
    baseline_exception: {
      safely_inherited: [],
      player_overrides: d.exceptions.map(authored),
      hypotheses: [],
      unresolved: [...d.open],
    },
    entry_envelope: { items: d.possessions.map(authored) },
  };
  const parsed = ExistenceContractSchema.safeParse({
    pc_id: pcId,
    ...body,
    release: {
      status: "RELEASED",
      mirror_acceptance: {
        accepted_by: { ...PLAYER_CHOICE_AUTHORITY },
        items_displayed_and_accepted: mirrorItems(body).map((i) => i.id),
      },
    },
  });
  return parsed.success ? parsed.data : null;
}

export const quoted = (s: string): string => JSON.stringify(s);

const IMPORTANT =
  "IMPORTANT - take a moment to review your character. If something important is missing, wrong, or more specific than you intended, change it now. If you want your character to begin with something specific that would not normally be assumed, make sure it appears here. Anything else may remain open.";

/** The bounded console panel of the complete Mirror (a local fallback panel; the Narrative & Performance Kernel owns final rendering). */
export function mirrorPanel(
  pcId: string,
  items: readonly MirrorItem[],
  head: string,
  foot: readonly string[],
): string[] {
  const sections: MirrorSection[] = [];
  for (const i of items) if (!sections.includes(i.section)) sections.push(i.section);
  const body = sections.flatMap((s) => [
    `| ${s}`,
    ...items.filter((i) => i.section === s).map((i) => `|   - ${i.label}: ${quoted(i.text)}`),
  ]);
  return [
    `+--- CHARACTER MIRROR (${head}) ---`,
    `| ${OOC_BANNER}`,
    `| character id: ${pcId}`,
    `| ${IMPORTANT}`,
    ...body,
    `+---`,
    ...foot,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Identities. Keyed digests of the exact confirmed content under the secret retained with the keep (original-pc-keep.ts): the same
// kept character always reaches the same publication identities (so a replay is recognised by the store and a different choice meets
// the committed one), while nothing derivable from public contract content can reproduce them.
// ---------------------------------------------------------------------------------------------------------------------------------

export const keyed = (secret: string, value: unknown): string =>
  createHmac("sha256", secret).update(canonicalJson(value), "utf8").digest("hex").slice(0, 32);

export const releaseIdOf = (
  secret: string,
  campaignId: string,
  contract: ExistenceContract,
): string => keyed(secret, { stage: "release", campaign_id: campaignId, contract });

export interface InsertionPins {
  readonly pc: number;
  readonly world: number;
  readonly locus: number;
}
export const bindingIdOf = (
  secret: string,
  campaignId: string,
  pcId: string,
  worldId: string,
  locusId: string,
  pins: InsertionPins,
  statement: string,
): string =>
  keyed(secret, {
    stage: "bind",
    campaign_id: campaignId,
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    pins,
    statement,
  });

export const publicationOf = (stage: "release" | "bind" | "locus", id: string): Publication => ({
  group_id: `operator-pc:${id}:${stage}`,
  intent_id: `operator-pc-intent:${id}:${stage}`,
  cause: `operator-pc-cause:${id}`,
  basis: OPERATOR_PUBLICATION_BASIS,
  secrecy: OPERATOR_PUBLICATION_SECRECY,
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------------------------------------------------------------

export type CharacterStatus =
  | "CHARACTER_BOUND"
  | "CHARACTER_RELEASED_UNBOUND"
  | "CHARACTER_NONE"
  | "CHARACTER_OUTCOME_UNKNOWN"
  | "CHARACTER_REFUSED"
  | "CHARACTER_VERIFICATION_FAILED"
  | "CHARACTER_CONFLICT"
  | "BINDING_CONFLICT"
  | "REFEREE_PENDING"
  | "REFEREE_UNAVAILABLE"
  | "REFEREE_ANSWER_REFUSED"
  | "LOCUS_ESTABLISHED"
  | "LOCUS_NOT_QUALIFIED"
  | "LOCUS_CONFLICT"
  | "LOCUS_VERIFICATION_FAILED"
  | "OBSERVATION_RECEIVED"
  | "OBSERVATION_NOT_ESTABLISHED"
  | "OBSERVATION_NEEDS_CHOICE"
  | "OBSERVATION_NOT_AVAILABLE"
  | "OBSERVATION_VERIFICATION_FAILED"
  | "CLARIFICATION_ACCEPTED"
  | "CLARIFICATION_NOT_ACCEPTED"
  | "CLARIFICATION_NOT_AVAILABLE"
  | "CLARIFICATION_VERIFICATION_FAILED"
  | "DELEGATION_ACCEPTED"
  | "DELEGATION_NOT_ACCEPTED"
  | "DELEGATION_NOT_AVAILABLE"
  | "DELEGATION_VERIFICATION_FAILED"
  | "WORLD_NOT_ESTABLISHED"
  | "LOCUS_NOT_ESTABLISHED"
  | "INVALID_REQUEST"
  | "SESSION_UNAVAILABLE"
  | "DECLINED";

export interface CharacterResult {
  readonly status: CharacterStatus;
  readonly message: string;
  readonly code?: string;
  readonly details: readonly string[];
}

const NOT_ESTABLISHED =
  "It gives the character no physical position or custody, perception, knowledge, action, capability, narration or elapsed time.";

const MESSAGES: Record<CharacterStatus, string> = {
  CHARACTER_BOUND: `the character you kept is released and is bound as the operative player character at the established locus, on the native-presence statement you separately confirmed; a fresh owner-verified open reads back exactly what you confirmed. ${NOT_ESTABLISHED}`,
  CHARACTER_RELEASED_UNBOUND: `the character you kept is released, but it is NOT bound: no player character is operative and nothing places it in the world. Nothing was rolled back (the owners are separate); run the same command again to state and confirm where it is originally present. ${NOT_ESTABLISHED}`,
  CHARACTER_NONE: "no character authored by this command is held",
  CHARACTER_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; nothing is reported as done. Run the same command again (with --reclaim-stale-lock if the package lock was left behind): it reads what the campaign holds and goes on from there without repeating anything that committed",
  CHARACTER_REFUSED: "an owner refused a write; nothing was replaced",
  CHARACTER_VERIFICATION_FAILED:
    "what the campaign holds does not match what you confirmed; it is NOT reported as bound",
  CHARACTER_CONFLICT:
    "the campaign holds a player character this command did not release, or another one; nothing was changed. Only a character whose whole-Mirror keep this command recorded is ever bound by it, and a campaign has one",
  BINDING_CONFLICT:
    "the campaign already has an operative player-character binding that is not the one this command makes for this character; nothing was changed",
  REFEREE_PENDING:
    "the AI referee host has not answered the question yet; nothing was changed. Connect the host's tool server (see referee-bind-host) and run the same command again: the same question is found again, with any answer it has meanwhile received",
  REFEREE_UNAVAILABLE:
    "no AI referee host can be asked: none is bound to this campaign, or its exchange cannot be used; nothing was changed. There is no human or scripted substitute for the referee",
  REFEREE_ANSWER_REFUSED:
    "the referee host's answers were not valid (not from the bound host, not for this question, or not grounded in the delivered text); none was used and nothing was changed",
  LOCUS_ESTABLISHED: `the character you kept and placed has, in World-State's custody, one stationary physical locus: the established locus its native presence was qualified at, on the physical-placement reading of the AI referee host you saw and the separate confirmation you gave; a fresh owner-verified open reads back exactly that. It is a stationary position only: it gives the character no perception, knowledge, action, capability, narration, movement or elapsed time.`,
  LOCUS_NOT_QUALIFIED:
    "the AI referee host's physical-placement reading does not support one material physical subject originally present at exactly that locus (or cannot tell); nothing was written and no physical position is held. The binding is unchanged and is not a physical position either",
  LOCUS_CONFLICT:
    "what the campaign holds of this character's physical locus is not what this command makes; nothing was changed",
  LOCUS_VERIFICATION_FAILED:
    "what the campaign holds does not match what you confirmed; the physical locus is NOT reported as established",
  OBSERVATION_RECEIVED:
    "your character looked, and the Epistemic owner established that its sight directly received the raw appearance shown below, at the current canonical basis; a fresh owner-verified open reads back exactly that. It is raw appearance only: it gives the character no recognition, comprehension, belief, memory, action or elapsed time, and it reveals nothing of the setting beyond what was received",
  OBSERVATION_NOT_ESTABLISHED:
    "no observation was established for your character at the current basis: nothing was received, no packet was formed and nothing the character receives was changed. This does not say why, and it is not a report that anything is or is not there; sealed evidence of the reading is kept for audit only",
  OBSERVATION_NEEDS_CHOICE:
    "what was asked carries more than looking around, so nothing was looked at and nothing was changed; say what the character actually does",
  OBSERVATION_NOT_AVAILABLE:
    "no observation can be asked now: the character has no committed physical position, or no canonical temporal basis is established, or the character is not the verified player character of this command; nothing was changed. An observation never establishes either, and never advances time",
  OBSERVATION_VERIFICATION_FAILED:
    "what the campaign holds does not match what was established; the observation is NOT reported as received",
  CLARIFICATION_ACCEPTED:
    "your words are an accepted claim of your character from the canonical time shown: the AI referee host classified exactly those words as your own, you separately confirmed them, and a fresh owner-verified open reads them back. Nothing earlier was changed; no time passed; no material was created and no collection was started or made possible by itself - the exact cycle still needs a preparation that quotes these words and a separate semantic attestation",
  CLARIFICATION_NOT_ACCEPTED:
    "the AI referee host did not accept your words as your own character-local claim; nothing was written. Change what you say and run the command again",
  CLARIFICATION_NOT_AVAILABLE:
    "no clarification can be made now: the character is not the verified bound player character of this command, no canonical time is established, or a collection commitment of this character already exists (a clarification is prospective); nothing was changed",
  CLARIFICATION_VERIFICATION_FAILED:
    "what the campaign holds does not match what you confirmed; the clarification is NOT reported as accepted",
  DELEGATION_ACCEPTED:
    "the choice you delegated is made and sealed: the AI referee host, acting as role.gm, chose inside the bounds you committed; the owner validated the choice against your scope, wrote it as a Delegation Commit Record (provenance PLAYER-DELEGATED, never your own words) from the canonical time shown, and a fresh owner-verified open reads it back. It cannot be reselected or changed. Nothing earlier was changed; no time passed; no material was created and no collection was started or made possible by itself - the exact cycle still needs a preparation that quotes these words and a separate semantic attestation",
  DELEGATION_NOT_ACCEPTED:
    "the AI referee host did not select for you (the duration is already stated in your character's accepted content, the branch is already closed, or the request is outside this branch); nothing was written and your character is unchanged",
  DELEGATION_NOT_AVAILABLE:
    "no delegation can be made now: the character is not the verified bound player character of this command, no canonical time is established, the scope is not a lawful bounded scope, the branch is already closed, or a collection commitment of this character already exists (a delegation first offered after a consequence depends on it is declined and the branch stays unresolved); nothing was changed",
  DELEGATION_VERIFICATION_FAILED:
    "what the campaign holds does not match what you confirmed; the delegation is NOT reported as accepted",
  WORLD_NOT_ESTABLISHED:
    "that world is not established in this campaign; nothing was changed. This command never creates, defaults or infers a world",
  LOCUS_NOT_ESTABLISHED:
    "that locus is not established in that world; nothing was changed. This command never creates, defaults or infers a locus",
  INVALID_REQUEST: "the request is not valid; nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not kept or not confirmed; nothing was changed",
};

export const result = (
  status: CharacterStatus,
  details: readonly string[] = [],
  code?: string,
): CharacterResult => ({
  status,
  message: MESSAGES[status],
  details,
  ...(code !== undefined ? { code } : {}),
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading what the campaign holds.
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Whether a committed contract is exactly one this command released: a fresh character whose every claim is the player's own, with no
 * inherited claim, hypothesis or compilation, whose acceptance record is exactly the Mirror of its own content, and whose single
 * version, publication identities and basis are the ones derived from that content. Returns the reasons it is not (empty = it is).
 */
export interface ChainReader {
  getFact(key: string): OwnerFact | undefined;
  committedGroup(intentId: string): CommitGroup | null;
}

export function releaseProblems(
  campaignId: string,
  fact: OwnerFact,
  keep: KeepRecord | null,
  chain: ChainReader,
): string[] {
  const parsed = ExistenceContractSchema.safeParse(fact.value);
  if (!parsed.success) return ["the contract is not a valid released Existence Contract"];
  const c = parsed.data;
  const out: string[] = [];
  if (c.existing_actor_compilation !== undefined)
    out.push("it compiles an existing actor, which is not a player's original authorship");
  if (
    c.baseline_exception.safely_inherited.length > 0 ||
    c.baseline_exception.hypotheses.length > 0
  )
    out.push("it holds inherited or hypothetical claims this command never records");
  const items = mirrorItems(c).map((i) => i.id);
  if (!canonicalEqual(c.release.mirror_acceptance.items_displayed_and_accepted, items))
    out.push("its recorded acceptance is not exactly the Mirror of its content");
  if (keep === null)
    return [
      ...out,
      "no keep at this console is on record for it: a release that carries the right content and names, but whose keep this command did not retain, is not proof the player reviewed and kept it",
    ];
  if (
    keep.campaign_id !== campaignId ||
    keep.pc_id !== c.pc_id ||
    !canonicalEqual(keep.contract, c)
  )
    out.push("it is not the character whose keep was retained at this console");
  const id = releaseIdOf(keep.secret, campaignId, c);
  const p = publicationOf("release", id);
  if (
    fact.version !== 1 ||
    fact.provenance.group_id !== p.group_id ||
    fact.provenance.intent_id !== p.intent_id ||
    fact.provenance.cause !== p.cause ||
    fact.basis !== p.basis ||
    fact.secrecy !== p.secrecy
  )
    out.push("it does not carry the identities this command derives from the confirmed content");
  out.push(...releaseEvidenceProblems(fact, c, keep, chain));
  return out;
}

/**
 * The AI referee's evidence for a release: the release was committed READING and DEPENDING ON an I-002 classification whose derived
 * verdict is CLOSED over exactly the statements of this contract (the engine's own consumer check), and that retained decision is
 * the very answer the host gave to the question the player saw before keeping. A legacy release with no such evidence is not
 * attested, retroactively or otherwise.
 */
export function releaseEvidenceProblems(
  fact: OwnerFact,
  contract: ExistenceContract,
  keep: KeepRecord,
  chain: ChainReader,
): string[] {
  const group = chain.committedGroup(fact.provenance.intent_id);
  if (!group) return ["the release's committing group is not in the journal"];
  const read = group.reads.find((r) => r.key.startsWith("referee/"));
  if (!read)
    return [
      "the release was not qualified by an AI referee classification: a release without one is not attested",
    ];
  const violation = refereeQualificationViolation(group, (k) => chain.getFact(k), "RELEASE", {
    contract,
  });
  if (violation) return [violation.message];
  const decision = chain.getFact(read.key);
  const record = decision ? RefereeDecisionRecordSchema.safeParse(decision.value) : undefined;
  if (!record?.success || record.data.operation !== REFEREE_OP_I002)
    return ["the cited classification is not a valid I-002 referee record"];
  if (
    !canonicalEqual(record.data.decision, keep.referee.answer) ||
    record.data.host.host_id !== keep.referee.host_id ||
    record.data.attempt !== keep.referee.attempt
  )
    return [
      "the cited classification is not the answer the host gave to the question the player saw before keeping",
    ];
  return [];
}

export interface Held {
  readonly campaign: CanonicalCampaign;
  readonly campaignId: string;
  /** the retained keep: the secret every recognised publication identity is keyed by */
  readonly keep: KeepRecord;
}

export function bindingProblems(
  { campaign, campaignId, keep }: Held,
  pcFact: OwnerFact,
  expected?: { worldId: string; locusId: string },
): string[] {
  const binding = campaign.binding();
  if (!binding) return ["no operative binding is held"];
  const b = binding.value;
  const out: string[] = [];
  const t = b.transition;
  if (t.type !== "ACTIVATION") return ["the binding is not a first ACTIVATION"];
  const worldId = b.coupling.world.entity_id;
  const locusId = b.coupling.locus.entity_id;
  if (expected && (expected.worldId !== worldId || expected.locusId !== locusId))
    out.push("the binding couples another world or locus");
  const world = campaign.world(worldId)?.fact;
  const locus = campaign.locus(worldId, locusId)?.fact;
  if (!world || !locus) return [...out, "the coupled world or locus is not held"];
  const pins = t.basis.pinned_versions;
  if (pins.pc !== pcFact.version || pins.world !== world.version || pins.locus !== locus.version)
    out.push(
      "the binding was not established against the committed character, world and locus versions",
    );
  if (b.active_pc.entity_id !== pcFact.key.split("/")[1])
    out.push("the binding names another character");
  const id = bindingIdOf(
    keep.secret,
    campaignId,
    b.active_pc.entity_id,
    worldId,
    locusId,
    pins,
    t.basis.statement,
  );
  const p = publicationOf("bind", id);
  const f = binding.fact;
  if (
    f.provenance.group_id !== p.group_id ||
    f.provenance.intent_id !== p.intent_id ||
    f.provenance.cause !== p.cause ||
    f.basis !== p.basis ||
    f.secrecy !== p.secrecy ||
    f.version !== 1
  )
    out.push(
      "the binding does not carry the identities this command derives from the confirmed statement",
    );
  if (
    t.basis.bridge !== "NATIVE_ALREADY_THERE" ||
    t.basis.established_by !== "EXPLICIT_PLAYER_AUTHORED_FACT"
  )
    out.push("the binding is not a native, explicit player-authored insertion");
  const group = campaign.store.committedGroup(f.provenance.intent_id);
  const violation = group
    ? refereeQualificationViolation(group, (k) => campaign.store.getFact(k), "BIND", { binding: b })
    : { message: "the binding's committing group is not in the journal" };
  if (!group?.reads.some((r) => r.key.startsWith("referee/")))
    out.push(
      "the binding was not qualified by an AI referee native/compatibility decision: a binding without one is not attested",
    );
  else if (violation) out.push(violation.message);
  return out;
}

export const factLine = (name: string, f: OwnerFact): string =>
  `${name}: ${f.key} [${f.owner}/${f.facet} v${f.version}] group ${f.provenance.group_id} cause ${f.provenance.cause}`;

function boundReport(
  campaign: CanonicalCampaign,
  pcId: string,
  campaignId: string,
): CharacterResult {
  const pc = campaign.playerCharacter(pcId)!;
  const binding = campaign.binding()!;
  const t = binding.value.transition;
  return result(
    "CHARACTER_BOUND",
    [
      `campaign: ${campaignId}`,
      factLine("character", pc.fact),
      factLine("binding", binding.fact),
      `world: ${binding.value.coupling.world.entity_id}, locus: ${binding.value.coupling.locus.entity_id}`,
      t.type === "ACTIVATION"
        ? `native presence, as you stated it: ${quoted(t.basis.statement)}`
        : "",
      `physical custody of the character: ${
        campaign.pcPhysicalLocusCustody(pcId)?.value.basis.established_from === "ACTIVATION"
          ? "held, made by establish-character-locus (a separate, later choice; not by this command)"
          : campaign.pcPhysicalLocusCustody(pcId)
            ? "present (NOT made by this command)"
            : "none - this command establishes none (see establish-character-locus)"
      }`,
    ].filter((l) => l !== ""),
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The commands.
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * The narrow seam an ordinary-chat front end uses to carry the player's OWN authored words through the same review, keep, release and
 * placement as the console. It changes who types the questions, nothing else: the same compiled contract, the same Mirror and findings,
 * the same unpredictable challenge typed back by the human, the same owner operations and the same verification.
 *
 *   KEEP    the player's draft is used instead of the console questions; the WHOLE Mirror and the referee's findings on exactly that
 *           candidate are shown once, and only the exact phrase typed back keeps it. There is no console edit grammar: a revision is a
 *           new draft and a new run. A character already kept (or released) is finished from what was retained, never asked again.
 *           The run ends at the release: placement is a separate choice and a separate run.
 *   PLACE   the player's own native-presence statement is used instead of the presence prompt; it needs a released character.
 */
export interface ChatAuthoring {
  readonly stage: "KEEP" | "PLACE";
  /** KEEP only: absent when the run finishes what an earlier keep retained */
  readonly draft?: CharacterDraft;
  /** PLACE only: the player's own words */
  readonly presence?: string;
}

export interface AuthorCharacterParams {
  readonly campaignDir: string;
  /** the campaign identity the package must hold */
  readonly campaignId: string;
  readonly worldId: string;
  readonly locusId: string;
  /** the technical identity of the character (the player's name for it is part of what they author) */
  readonly pcId: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  /** how many times each referee answer is looked for (default 1200) and the pause between looks (default 500 ms) */
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
  /** a chat front end's staged run (see `ChatAuthoring`); absent for the console */
  readonly chat?: ChatAuthoring;
}

export const BUILD_ID = "immortalis-operator";
export const UNKNOWN_OUTCOME = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);
const MAX_ATTEMPTS = 3;
const MAX_REVISIONS = 50;

export const closeQuietly = async (s: { close(): Promise<void> } | undefined): Promise<void> => {
  try {
    await s?.close();
  } catch {
    // the next run reclaims an unreleased lock explicitly and reconciles by identity
  }
};

/** One free-text answer from the console: null at the end of input or after three refused tries; "" is an empty line. */
async function askStatement(
  terminal: OperatorTerminal,
  prompt: string,
  allowEmpty: boolean,
  judge: typeof judgeStatement = judgeStatement,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const line = await terminal.ask(prompt);
    if (line === null) return null;
    if (line.trim() === "" && allowEmpty) return "";
    const judged = judge(line);
    if (judged.ok) return judged.text;
    terminal.say(`NOT ACCEPTED: ${judged.reason}.`);
  }
  return null;
}

/** Elicits the six I-002 minimum answers in the player's own words, in dependency order. Returns null when the player stops. */
async function elicit(terminal: OperatorTerminal): Promise<CharacterDraft | null> {
  terminal.say(
    "Welcome to IMMORTALIS. Tell me what matters about your character, in your own words. Leave the rest open.",
  );
  terminal.say(
    "Say it in your own words. An AI referee host will then read what you wrote and tell you, statement by statement, what it accepts as yours and what it does not (anything about other people, followers, offices, institutions, places or the wider world is not part of a character).",
  );
  terminal.say("Who - or what - are you?");
  const identity = await askStatement(terminal, "identity>", false);
  if (identity === null) return null;
  terminal.say(
    "How can the world register you? One way per line, an empty line to finish. For none at all, type: no-contact <why>",
  );
  let contact: ContactDraft | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS * MAX_LIST_ITEMS; attempt++) {
    const line = await terminal.ask("contact>");
    if (line === null) return null;
    if (line.trim() === "") {
      if (contact !== null) break;
      terminal.say("NOT ACCEPTED: one contact surface, or an explicit no-contact, is needed.");
      continue;
    }
    const noContact = /^no-contact\s+(.*)$/s.exec(line.trim());
    const judged = judgeStatement(noContact ? noContact[1]! : line);
    if (!judged.ok) {
      terminal.say(`NOT ACCEPTED: ${judged.reason}.`);
      continue;
    }
    if (noContact) {
      contact = { kind: "NO_CONTACT", statement: judged.text };
      break;
    }
    const surfaces: string[] = contact?.kind === "CONTACT_ANCHOR" ? [...contact.surfaces] : [];
    surfaces.push(judged.text);
    contact = { kind: "CONTACT_ANCHOR", surfaces };
    if (surfaces.length >= MAX_LIST_ITEMS) break;
  }
  if (contact === null) return null;
  terminal.say("What form constitutes you?");
  const embodiment = await askStatement(terminal, "embodiment>", false);
  if (embodiment === null) return null;
  terminal.say("What keeps you the same continuing self?");
  const continuity = await askStatement(terminal, "continuity>", false);
  if (continuity === null) return null;
  const lists: string[][] = [];
  for (const [question, prompt] of [
    [
      "Anything important about you that differs from what would normally be expected? One per line; an empty line finishes.",
      "exception>",
    ],
    ["Anything you chose to leave open? One per line; an empty line finishes.", "open>"],
    [
      "Anything specific you begin with that would not normally be assumed? One per line; an empty line finishes.",
      "possession>",
    ],
  ] as const) {
    terminal.say(question);
    const entries: string[] = [];
    while (entries.length < MAX_LIST_ITEMS) {
      const text = await askStatement(terminal, prompt, true);
      if (text === null) return null;
      if (text === "") break;
      entries.push(text);
    }
    lists.push(entries);
  }
  return {
    identity,
    contact,
    embodiment,
    continuity,
    exceptions: lists[0]!,
    open: lists[1]!,
    possessions: lists[2]!,
  };
}

/** The draft's complete Mirror as a reviewable whole: items from its compiled contract when complete, otherwise from what is stated so far. */
function previewItems(pcId: string, d: CharacterDraft): readonly MirrorItem[] {
  const contract = compileContract(pcId, d);
  if (contract) return mirrorItems(contract);
  const claim = (s: string) => authored(s);
  return mirrorItems({
    identity_agency: claim(d.identity ?? "(not yet stated)"),
    contact:
      d.contact?.kind === "CONTACT_ANCHOR"
        ? { kind: "CONTACT_ANCHOR", surfaces: d.contact.surfaces.map(claim) }
        : { kind: "NO_CONTACT", statement: claim(d.contact?.statement ?? "(not yet stated)") },
    embodiment_topology: claim(d.embodiment ?? "(not yet stated)"),
    continuity_rule: claim(d.continuity ?? "(not yet stated)"),
    baseline_exception: {
      safely_inherited: [],
      player_overrides: d.exceptions.map(claim),
      hypotheses: [],
      unresolved: [...d.open],
    },
    entry_envelope: { items: d.possessions.map(claim) },
  });
}

const REVISION_HELP = [
  "Type your changes, one per line; an empty line finishes this change. They are applied together and the WHOLE Mirror is shown again.",
  "  set identity|embodiment|continuity <text>      set contact <text>      set no-contact <text>",
  "  add contact|exception|open|possession <text>   remove contact|exception|open|possession <n>",
];

export interface RefereeKeepEvidence {
  readonly task_id: string;
  readonly host_id: string;
  readonly claimed_model: string | null;
  readonly attempt: number;
  readonly answer: I002HostDecision;
}

type Reviewed =
  | {
      readonly kind: "KEPT";
      readonly contract: ExistenceContract;
      readonly draft: CharacterDraft;
      readonly referee: RefereeKeepEvidence;
    }
  | { readonly kind: "LEFT"; readonly why?: string }
  | { readonly kind: "REFEREE"; readonly result: CharacterResult };

const refereeResult = (
  asked: Exclude<Awaited<ReturnType<typeof askI002>>, { kind: "ANSWERED" }>,
  detail: readonly string[] = [],
): CharacterResult =>
  asked.kind === "PENDING"
    ? result("REFEREE_PENDING", [`task: ${asked.task_id}`, ...detail])
    : asked.kind === "UNAVAILABLE"
      ? result("REFEREE_UNAVAILABLE", [asked.message, ...detail], asked.code)
      : result("REFEREE_ANSWER_REFUSED", [asked.message, ...detail]);

/** The referee's findings for a candidate, statement by statement, in plain words (what it accepts as the player's own and what not). */
export function findingsLines(
  items: readonly { item_id: string; slot: string; text: string }[],
  decision: I002HostDecision,
  verdict: string,
  host: { host_id: string; claimed_model: string | null },
): string[] {
  const byId = new Map(items.map((i) => [i.item_id, i]));
  const lines = [
    `+--- AI REFEREE FINDINGS (host ${host.host_id}${host.claimed_model ? `, self-reported model ${quoted(host.claimed_model)}` : ""}; verdict ${verdict}) ---`,
  ];
  for (const d of decision.items) {
    const item = byId.get(d.item_id);
    const text = item ? quoted(item.text) : d.item_id;
    if (d.class === I002_ADMITTED_CLASS[d.slot]) {
      lines.push(`|   [accepted as yours: ${d.class}] ${text}`);
      continue;
    }
    lines.push(`|   [NOT accepted: ${d.class}] ${text}`);
    lines.push(`|       why: ${quoted(d.grounds)}`);
    if (d.evidence_quote) lines.push(`|       the words: ${quoted(d.evidence_quote)}`);
    if (d.class === "MIXED" && d.intrinsic_excerpt)
      lines.push(
        `|       the part that is yours: ${quoted(d.intrinsic_excerpt)} (not applied for you; change the statement to keep only what is yours)`,
      );
    if (d.clarification) lines.push(`|       question for you: ${quoted(d.clarification)}`);
  }
  lines.push("+---");
  return lines;
}

/**
 * The whole-Mirror review loop. Every display shows the entire Mirror, with the AI referee host's findings on EXACTLY that candidate
 * and, only when the engine derives CLOSED from them, a fresh keep phrase whose subject is that candidate and that question. One
 * player response is one revision cycle applied to the whole; any change is a new candidate and is classified again. An incomplete
 * draft, or one the referee did not close, is displayed but offered no keep phrase at all.
 */
async function review(
  env: {
    terminal: OperatorTerminal;
    campaignId: string;
    pcId: string;
    adapter: RefereeAdjudicationAdapter;
    rt: RefereeRuntime;
    /** a chat front end: one display of the whole candidate; any revision is a new draft and a new run, never the console edit grammar */
    chat?: boolean;
  },
  start: CharacterDraft,
): Promise<Reviewed> {
  const { terminal, campaignId, pcId, adapter, rt } = env;
  let draft = start;
  for (let revision = 1; revision <= MAX_REVISIONS; revision++) {
    const missing = missingOf(draft);
    const items = previewItems(pcId, draft);
    const contract = compileContract(pcId, draft);
    let line: string | null;
    if (contract === null) {
      for (const l of mirrorPanel(pcId, items, `display ${revision}`, [
        `This character cannot be kept yet. Still needed: ${missing.join("; ")}.`,
      ]))
        terminal.say(l);
      if (env.chat)
        return { kind: "LEFT", why: `the character still lacks: ${missing.join("; ")}` };
      terminal.say('Type "change" to continue revising. Anything else leaves without a character.');
      line = await terminal.ask(">");
    } else {
      const candidate = refereeCandidateItems(contract);
      terminal.say("Asking the AI referee host to read what you wrote ...");
      const asked = await askI002(adapter, rt, {
        campaign_id: campaignId,
        pc_id: pcId,
        items: candidate,
      });
      if (asked.kind !== "ANSWERED") return { kind: "REFEREE", result: refereeResult(asked) };
      const findings = findingsLines(candidate, asked.decision, asked.verdict, asked.host);
      if (asked.verdict !== "CLOSED") {
        for (const l of [
          ...mirrorPanel(pcId, items, `display ${revision}`, []),
          ...findings,
          "This character cannot be kept yet: the referee did not accept everything above as your own character.",
        ])
          terminal.say(l);
        if (env.chat)
          return {
            kind: "LEFT",
            why: "the AI referee host did not accept everything shown as the player's own character; it can be revised and offered again",
          };
        terminal.say('Type "change" to revise. Anything else leaves without a character.');
        line = await terminal.ask(">");
      } else {
        const subject = subjectOf({
          verb: "keep-character",
          campaign_id: campaignId,
          pc_id: pcId,
          contract,
          referee_task: asked.task_id,
        });
        const decision = await requestOperatorDecision(
          terminal,
          "keep-character",
          subject,
          [
            ...mirrorPanel(pcId, items, `display ${revision}`, []),
            ...findings,
            "This is how IMMORTALIS understands your character.",
            env.chat
              ? "Keep this character exactly as shown?"
              : "Keep this character, or change something before we continue?",
          ],
          env.chat
            ? "Anything else declines; to change something, tell your assistant what to change."
            : 'To revise instead, type "change". Anything else leaves without a character.',
          asked.decision,
        );
        if (decision.kind === "END_OF_INPUT") return { kind: "LEFT" };
        if (decision.kind === "CONFIRMED") {
          if (!consumeConfirmation(decision.confirmation, "keep-character", subject))
            return { kind: "LEFT" };
          return {
            kind: "KEPT",
            contract,
            draft,
            referee: {
              task_id: asked.task_id,
              host_id: asked.host.host_id,
              claimed_model: asked.host.claimed_model,
              attempt: asked.attempt,
              answer: asked.decision,
            },
          };
        }
        if (env.chat)
          return {
            kind: "LEFT",
            why: "the character shown was not kept (declined or not confirmed)",
          };
        line = decision.line;
      }
    }
    if (env.chat || line === null || line.trim() !== "change") return { kind: "LEFT" };
    for (const l of REVISION_HELP) terminal.say(l);
    const edits: Edit[] = [];
    let refused: string | null = null;
    for (let n = 0; n < 4 * MAX_LIST_ITEMS; n++) {
      const entry = await terminal.ask("change>");
      if (entry === null) return { kind: "LEFT" };
      if (entry.trim() === "") break;
      const parsed = parseEdit(entry);
      if (parsed.ok) edits.push(parsed.edit);
      else refused ??= parsed.reason;
    }
    const applied =
      refused === null ? applyEdits(draft, edits) : { ok: false as const, reason: refused };
    if (applied.ok) draft = applied.draft;
    else terminal.say(`CHANGE REFUSED, the character is unchanged: ${applied.reason}.`);
  }
  return { kind: "LEFT" };
}

type Opened =
  | { readonly ok: true; readonly session: LocalOperatorSession }
  | { readonly ok: false; readonly refusal: CharacterResult };

export async function openSession(p: {
  campaignDir: string;
  campaignId: string;
  operatorDir?: string;
  reclaimStaleLock?: boolean;
  buildId?: string;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
}): Promise<Opened> {
  const opened = await LocalOperatorSession.open({
    campaignDir: p.campaignDir,
    expectedCampaignId: p.campaignId,
    buildId: p.buildId ?? BUILD_ID,
    ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (opened.ok) return { ok: true, session: opened.value };
  const sub = (opened.error.details as { code?: string } | undefined)?.code;
  return {
    ok: false,
    refusal: result(
      "SESSION_UNAVAILABLE",
      [opened.error.message],
      `${opened.error.code}${sub ? ` ${sub}` : ""}`,
    ),
  };
}

/**
 * Authors, reviews, keeps and releases an original character, then separately places and binds it.
 *
 *   open the campaign (local operator verified) → the world and locus must already be established → if a character of this command
 *   is already released, resume at placement; if already bound, verify and report → otherwise elicit, review the whole Mirror until
 *   the player keeps the last display → release (I-002) → state and confirm native presence → bind (Role Registry) → close and reopen
 *   afresh and read both owner facts back.
 *
 * Nothing is written before the keep, and nothing is bound before the second, separate confirmation.
 */
export async function authorCharacter(p: AuthorCharacterParams): Promise<CharacterResult> {
  for (const [name, value] of [
    ["character", p.pcId],
    ["world", p.worldId],
    ["locus", p.locusId],
  ] as const)
    if (!EntityId.safeParse(value).success)
      return result("INVALID_REQUEST", [`the ${name} identity is not valid`]);
  const opened = await openSession(p);
  if (!opened.ok) return opened.refusal;
  const session = opened.session;
  try {
    return await run(p, session);
  } catch {
    // an unexpected failure after any write may have left that write landed or not: an unknown outcome, never a success
    session.markAmbiguous();
    return result("CHARACTER_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

export function runtimeOf(p: AuthorCharacterParams, session: LocalOperatorSession): RefereeRuntime {
  return {
    stateDir: p.operatorDir ?? defaultOperatorDir(p.campaignDir),
    operatorUid: session.operator.uid,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
    polls: p.refereePolls ?? 1200,
    pollMs: p.refereePollMs ?? 500,
  };
}

async function run(
  p: AuthorCharacterParams,
  session: LocalOperatorSession,
): Promise<CharacterResult> {
  const { terminal, pcId, worldId, locusId, campaignId } = p;
  const campaign = session.campaign;
  const world = campaign.world(worldId);
  if (!world) return result("WORLD_NOT_ESTABLISHED", [`world: ${worldId}`]);
  const locus = campaign.locus(worldId, locusId);
  if (!locus || locus.value.world.entity_id !== worldId)
    return result("LOCUS_NOT_ESTABLISHED", [`world: ${worldId}, locus: ${locusId}`]);

  const rt = runtimeOf(p, session);
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const keepRead = await readKeep({
    dir: rt.stateDir,
    campaignId,
    operatorUid: session.operator.uid,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
  });
  if (!keepRead.ok)
    return result(
      "SESSION_UNAVAILABLE",
      [keepRead.error.message],
      `STATE_UNAVAILABLE ${keepRead.error.code}`,
    );
  const keep = keepRead.value;

  // only the Existence Contract kind is a character: other facets of the PC owner (a capability basis, a capability close) are
  // legitimate facts about a character that already exists, never another one
  const key = pcExistenceContractKey(pcId);
  const others = campaign.store
    .listFacts()
    .filter((f) => f.owner === "pc_existence" && f.facet === "existence_contract" && f.key !== key);
  if (others.length > 0)
    return result("CHARACTER_CONFLICT", [`another character is held: ${others[0]!.key}`]);
  if (keep !== null && keep.pc_id !== pcId)
    return result("CHARACTER_CONFLICT", [
      `another character was kept for this campaign: ${keep.pc_id}`,
    ]);
  const pcFact = campaign.store.getFact(key);
  const bindingFact = campaign.binding();
  const chat = p.chat;
  if (
    chat !== undefined &&
    (chat.stage === "KEEP"
      ? chat.presence !== undefined
      : chat.draft !== undefined || chat.presence === undefined)
  )
    return result("INVALID_REQUEST", ["the staged request does not match its stage"]);

  if (pcFact) {
    const problems = releaseProblems(campaignId, pcFact, keep, campaign.store);
    if (problems.length > 0 || keep === null) return result("CHARACTER_CONFLICT", problems);
    const pc = campaign.playerCharacter(pcId)!;
    if (bindingFact) {
      const why = bindingProblems({ campaign, campaignId, keep }, pc.fact, { worldId, locusId });
      return why.length === 0
        ? boundReport(campaign, pcId, campaignId)
        : result("BINDING_CONFLICT", why);
    }
    // a draft offered after the keep must be the very character that was kept: a kept character is never replaced
    if (
      chat?.draft !== undefined &&
      !canonicalEqual(compileContract(pcId, chat.draft), keep.contract)
    )
      return result("CHARACTER_CONFLICT", [
        "the character shown is not the one that was kept; a kept character is never replaced",
      ]);
    terminal.say(
      `RESUMING: this command already released the character ${pcId}; it was kept earlier and needs no further keep.`,
    );
    for (const l of mirrorPanel(pcId, mirrorItems(pc.value), "as kept earlier", []))
      terminal.say(l);
    if (chat?.stage === "KEEP") return releasedUnbound(pc.fact, false, KEEP_STAGE_END);
    return place(p, session, adapter, rt, pc.fact, false, keep, chat?.presence);
  }
  if (bindingFact)
    return result("BINDING_CONFLICT", [
      "an operative binding is held without a character of this command",
    ]);
  if (chat?.stage === "PLACE")
    return result("CHARACTER_NONE", [
      `campaign: ${campaignId}`,
      keep === null
        ? "no character has been kept and released yet: keep a character first; placement is a separate, later choice"
        : "a character was kept but is not released yet: finish that first; placement is a separate, later choice",
    ]);

  let retained: KeepRecord;
  if (keep !== null) {
    if (
      chat?.draft !== undefined &&
      !canonicalEqual(compileContract(pcId, chat.draft), keep.contract)
    )
      return result("CHARACTER_CONFLICT", [
        "the character shown is not the one that was kept; a kept character is never replaced",
      ]);
    // kept at this console and retained, but not yet released (an interruption between the two): release exactly what was kept
    terminal.say(
      `RESUMING: the character ${pcId} was kept at this console and is not yet released; releasing exactly what was kept.`,
    );
    for (const l of mirrorPanel(pcId, mirrorItems(keep.contract), "as kept earlier", []))
      terminal.say(l);
    retained = keep;
  } else {
    const configured = await refereeConfigured(campaignId, rt);
    if (!configured.ok) return result("REFEREE_UNAVAILABLE", [configured.message], configured.code);
    const drafted = chat ? (chat.draft ?? null) : await elicit(terminal);
    if (drafted === null)
      return chat
        ? result("INVALID_REQUEST", ["no character was offered and none was kept earlier"])
        : result("DECLINED", ["the character was not completed or kept"]);
    const reviewed = await review(
      { terminal, campaignId, pcId, adapter, rt, ...(chat ? { chat: true } : {}) },
      drafted,
    );
    if (reviewed.kind === "REFEREE") return reviewed.result;
    if (reviewed.kind === "LEFT")
      return result("DECLINED", [reviewed.why ?? "the character was not kept"]);
    // the proof of the keep is retained BEFORE anything is released, so the release can be recognised as having come from it
    const record = {
      pc_id: pcId,
      secret: newKeepSecret(),
      contract: reviewed.contract,
      referee: {
        host_id: reviewed.referee.host_id,
        claimed_model: reviewed.referee.claimed_model,
        attempt: reviewed.referee.attempt,
        answer: reviewed.referee.answer,
      },
    };
    const kept = await writeKeep({
      dir: rt.stateDir,
      campaignId,
      operatorUid: session.operator.uid,
      ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
      record,
    });
    if (!kept.ok)
      return kept.error.code === "KEEP_CONFLICT"
        ? result("CHARACTER_CONFLICT", [kept.error.message])
        : result("CHARACTER_OUTCOME_UNKNOWN", [`retaining the keep: ${kept.error.code}`]);
    terminal.say("PROGRESS keep RETAINED");
    retained = {
      format: "immortalis-operator-character-keep",
      format_version: 1,
      campaign_id: campaignId,
      operator_uid: session.operator.uid,
      ...record,
    };
  }

  // the referee's classification of exactly the kept candidate is retained as create-only evidence, then the release reads it
  const recorded = await adapter.recordI002({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: retained.referee.host_id, claimed_model: retained.referee.claimed_model },
    pc_id: pcId,
    attempt: retained.referee.attempt,
    items: refereeCandidateItems(retained.contract),
    answer: retained.referee.answer,
  });
  if (!recorded.ok) {
    if (UNKNOWN_OUTCOME.has(recorded.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`referee evidence: ${recorded.error.code}`]);
    }
    return result(
      "CHARACTER_REFUSED",
      [`referee evidence: ${recorded.error.code}`],
      recorded.error.code,
    );
  }
  terminal.say(`PROGRESS referee DECIDED ${recorded.value.record.key}`);
  const released = await campaign.releasePlayerCharacter({
    ...publicationOf("release", releaseIdOf(retained.secret, campaignId, retained.contract)),
    contract: retained.contract,
    qualified_by: recorded.value.record.key,
  });
  if (!released.ok) {
    if (UNKNOWN_OUTCOME.has(released.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`release: ${released.error.code}`]);
    }
    return result("CHARACTER_REFUSED", [`release: ${released.error.code}`], released.error.code);
  }
  terminal.say(`PROGRESS character RELEASED ${key}`);
  const fact = campaign.store.getFact(key);
  if (!fact) return result("CHARACTER_OUTCOME_UNKNOWN", ["the released character is not held"]);
  if (chat?.stage === "KEEP") return releasedUnbound(fact, true, KEEP_STAGE_END);
  return place(p, session, adapter, rt, fact, true, retained);
}

const KEEP_STAGE_END =
  "placement is a separate choice the player has not made, and nothing has placed the character";

/** The character is released and NOT bound: reported as exactly that (no cross-owner rollback exists). */
function releasedUnbound(
  pcFact: OwnerFact,
  releasedNow: boolean,
  why: string,
  extra: readonly string[] = [],
  code?: string,
): CharacterResult {
  return result(
    "CHARACTER_RELEASED_UNBOUND",
    [
      `character: ${pcFact.key} (released${releasedNow ? " just now" : " earlier"}, not bound)`,
      why,
      ...extra,
    ],
    code,
  );
}

/**
 * The separate, second choice: the player states, in their own words, where their character is originally present; the AI referee
 * host reads that statement against the committed world and locus (premise and canon included) and the accepted character; only a
 * BIND_ELIGIBLE derived verdict can be confirmed by the player and committed through the Role Registry.
 */
async function place(
  p: AuthorCharacterParams,
  session: LocalOperatorSession,
  adapter: RefereeAdjudicationAdapter,
  rt: RefereeRuntime,
  pcFact: OwnerFact,
  releasedNow: boolean,
  keep: KeepRecord,
  presence?: string,
): Promise<CharacterResult> {
  const { terminal, pcId, worldId, locusId, campaignId } = p;
  const campaign = session.campaign;
  const world = campaign.world(worldId)!;
  const locus = campaign.locus(worldId, locusId)!;
  const state = `character: ${pcFact.key} (released${releasedNow ? " just now" : " earlier"}, not bound)`;
  const unbound = (why: string, extra: readonly string[] = [], code?: string) =>
    releasedUnbound(pcFact, releasedNow, why, extra, code);

  const w = world.value;
  const lines = (title: string, entries: readonly string[]) =>
    entries.length === 0
      ? [`  ${title}: none`]
      : [`  ${title}:`, ...entries.map((e) => `    - ${e}`)];
  const basis = w.reference_causal_basis;
  for (const l of [
    "PLACEMENT - a separate choice from keeping your character. Nothing is bound yet.",
    OOC_BANNER,
    `WORLD ${worldId} (established earlier by World-State, not by you now)`,
    `  premise: ${quoted(w.premise)}`,
    `  reference / causal basis: ${quoted(basis.mode === "ORIGINAL" ? basis.established_canon : basis.mode)}`,
    ...lines("material world-law departures", w.material_world_law_departures.map(quoted)),
    ...lines(
      "insertion-supporting constraints",
      w.insertion_supporting_constraints.map((c) => `${c.aspect}: ${quoted(c.statement)}`),
    ),
    `LOCUS ${locusId}`,
    `  designation: ${quoted(locus.value.designation)}`,
    ...lines(
      "constraints",
      locus.value.constraints.map((c) => `${c.aspect}: ${quoted(c.statement)}`),
    ),
    presence === undefined
      ? "If your character is originally present at this place, say so in your own words. An AI referee host will read your statement and the facts above; an empty line leaves your character released but unplaced."
      : "Your statement of where your character is originally present is below. An AI referee host will read it and the facts above.",
  ])
    terminal.say(l);
  let statement: string | null;
  if (presence === undefined) statement = await askStatement(terminal, "presence>", true);
  else {
    const judged = judgeStatement(presence);
    statement = judged.ok ? judged.text : null;
  }
  if (statement === null || statement === "")
    return unbound("native presence was not stated or confirmed");

  terminal.say("Asking the AI referee host to read your statement against the world ...");
  const asked = await askIr(adapter, rt, {
    campaign_id: campaignId,
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    statement,
  });
  if (asked.kind !== "ANSWERED") {
    const r = refereeResult(asked);
    return { ...r, details: [state, ...r.details] };
  }
  const ir = asked.decision;
  const finding = [
    `+--- AI REFEREE FINDINGS (host ${asked.host.host_id}${asked.host.claimed_model ? `, self-reported model ${quoted(asked.host.claimed_model)}` : ""}; verdict ${asked.verdict}) ---`,
    `|   your statement is read as: ${ir.reading.mode} - ${quoted(ir.reading.grounds)}`,
    ...ir.assessments
      .filter((a) => a.relation !== "NOT_RELEVANT")
      .map((a) => `|   ${a.fact_id}: ${a.relation} - ${quoted(a.grounds)}`),
    ...(ir.clarification ? [`|   question for you: ${quoted(ir.clarification)}`] : []),
    "+---",
  ];
  for (const l of finding) terminal.say(l);
  if (asked.verdict !== "BIND_ELIGIBLE")
    return unbound(
      asked.verdict === "UNSUPPORTED_BRIDGE"
        ? "the referee reads your statement as something other than an explicit native, already-there presence; nothing is invented for you"
        : asked.verdict === "WORLD_CONFLICT"
          ? "the referee finds a committed world or locus fact that your statement or character contradicts; neither side is weakened for convenience"
          : "the referee cannot tell, and asks you the question above; state your presence again if you wish",
      finding,
    );

  const pins: InsertionPins = {
    pc: pcFact.version,
    world: world.fact.version,
    locus: locus.fact.version,
  };
  const subject = subjectOf({
    verb: "place-character",
    campaign_id: campaignId,
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    pins,
    statement,
    referee_task: asked.task_id,
  });
  const decision = await requestOperatorDecision(
    terminal,
    "place-character",
    subject,
    [
      "CONFIRMATION - NATIVE PRESENCE (the second, separate choice)",
      `  character: ${pcId} (released and kept)`,
      `  world: ${worldId} v${pins.world}, locus: ${locusId} v${pins.locus}`,
      `  your statement, kept verbatim: ${quoted(statement)}`,
      "  Confirming binds this character as the operative player character on exactly this explicit fact (native, already there).",
      "  It invents no arrival or bridge and gives the character no physical position, custody, perception, knowledge or action.",
    ],
    "Anything else leaves your character released but unbound.",
    asked.decision,
  );
  if (
    decision.kind !== "CONFIRMED" ||
    !consumeConfirmation(decision.confirmation, "place-character", subject)
  )
    return unbound("native presence was not confirmed");

  const recorded = await adapter.recordIr({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    attempt: asked.attempt,
    statement,
    answer: asked.decision,
  });
  if (!recorded.ok) {
    if (UNKNOWN_OUTCOME.has(recorded.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [
        state,
        `referee evidence: ${recorded.error.code}`,
      ]);
    }
    return unbound(
      `the referee evidence was refused: ${recorded.error.code}`,
      [],
      recorded.error.code,
    );
  }
  terminal.say(`PROGRESS referee DECIDED ${recorded.value.record.key}`);

  const bindId = bindingIdOf(keep.secret, campaignId, pcId, worldId, locusId, pins, statement);
  const bound = await campaign.bindPlayerCharacter({
    ...publicationOf("bind", bindId),
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    insertion: {
      bridge: "NATIVE_ALREADY_THERE",
      established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      statement,
    },
    qualified_by: recorded.value.record.key,
  });
  if (!bound.ok) {
    if (UNKNOWN_OUTCOME.has(bound.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [
        `character ${pcId}: released`,
        `binding: ${bound.error.code}`,
      ]);
    }
    return unbound(`the binding was refused: ${bound.error.code}`, [], bound.error.code);
  }
  terminal.say(`PROGRESS binding COMMITTED ${PLAYER_CHARACTER_BINDING_KEY}`);
  await closeQuietly(session);

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("CHARACTER_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const problems = readBack(c, campaignId, pcId, { worldId, locusId }, keep);
    return problems.length > 0
      ? result("CHARACTER_VERIFICATION_FAILED", problems)
      : boundReport(c, pcId, campaignId);
  } finally {
    await closeQuietly(reopened.value);
  }
}

function readBack(
  campaign: CanonicalCampaign,
  campaignId: string,
  pcId: string,
  expected: { worldId: string; locusId: string },
  keep: KeepRecord,
): string[] {
  const out: string[] = [];
  if (campaign.store.head().campaign_id !== campaignId)
    out.push("the reopened campaign has another identity");
  if (campaign.verify().length > 0) out.push("canonical integrity reports violations");
  const pc = campaign.playerCharacter(pcId);
  if (!pc) return [...out, "the released character is not held"];
  out.push(...releaseProblems(campaignId, pc.fact, keep, campaign.store));
  out.push(...bindingProblems({ campaign, campaignId, keep }, pc.fact, expected));
  return out;
}

/**
 * Reports what a campaign holds of a character this command released and bound, from canon alone: none, released but unbound, or bound
 * (verified, referee evidence included). A character this command did not record is reported as a conflict, never as bound.
 */
export async function characterStatus(
  session: LocalOperatorSession,
  stateDir: string,
  fs?: FsOps,
): Promise<CharacterResult> {
  const campaign = session.campaign;
  const campaignId = session.campaignId;
  const facts = campaign.store
    .listFacts()
    .filter((f) => f.owner === "pc_existence" && f.facet === "existence_contract");
  const binding = campaign.binding();
  if (facts.length === 0)
    return binding
      ? result("BINDING_CONFLICT", [
          `campaign: ${campaignId}`,
          "an operative binding is held without a character of this command",
        ])
      : result("CHARACTER_NONE", [`campaign: ${campaignId}`]);
  if (facts.length > 1)
    return result("CHARACTER_CONFLICT", [
      `campaign: ${campaignId}`,
      "more than one character is held",
    ]);
  const fact = facts[0]!;
  const pcId = fact.key.split("/")[1]!;
  const read = await readKeep({
    dir: stateDir,
    campaignId,
    operatorUid: session.operator.uid,
    ...(fs ? { fs } : {}),
  });
  if (!read.ok)
    return result(
      "SESSION_UNAVAILABLE",
      [`campaign: ${campaignId}`, read.error.message],
      `STATE_UNAVAILABLE ${read.error.code}`,
    );
  const problems = releaseProblems(campaignId, fact, read.value, campaign.store);
  if (problems.length > 0 || read.value === null)
    return result("CHARACTER_CONFLICT", [`campaign: ${campaignId}`, ...problems]);
  const pc = campaign.playerCharacter(pcId)!;
  const evidence = refereeEvidenceLines(campaign, fact, binding?.fact);
  if (!binding)
    return result("CHARACTER_RELEASED_UNBOUND", [
      `campaign: ${campaignId}`,
      factLine("character", pc.fact),
      ...evidence,
      "no player character is operative",
    ]);
  const why = [
    ...(campaign.verify().length > 0 ? ["canonical integrity reports violations"] : []),
    ...bindingProblems({ campaign, campaignId, keep: read.value }, pc.fact),
  ];
  return why.length > 0
    ? result("CHARACTER_VERIFICATION_FAILED", [`campaign: ${campaignId}`, ...why])
    : boundReport(campaign, pcId, campaignId);
}

/** The retained referee decisions a release and a binding cite, in plain words (the host, its self-reported model, the verdict). */
function refereeEvidenceLines(
  campaign: CanonicalCampaign,
  release: OwnerFact,
  binding: OwnerFact | undefined,
): string[] {
  const out: string[] = [];
  for (const [name, f] of [
    ["classification (I-002)", release],
    ["native/compatibility (IR)", binding],
  ] as const) {
    if (!f) continue;
    const read = campaign.store
      .committedGroup(f.provenance.intent_id)
      ?.reads.find((r) => r.key.startsWith("referee/"));
    const rec = read ? campaign.store.getFact(read.key) : undefined;
    const parsed = rec ? RefereeDecisionRecordSchema.safeParse(rec.value) : undefined;
    if (parsed?.success)
      out.push(
        `referee ${name}: ${rec!.key} host ${parsed.data.host.host_id}${parsed.data.host.claimed_model ? ` (self-reported model ${quoted(parsed.data.host.claimed_model)})` : ""} verdict ${parsed.data.verdict}`,
      );
  }
  return out;
}
