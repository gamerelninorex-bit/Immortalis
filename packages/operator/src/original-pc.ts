import { createHash, createHmac } from "node:crypto";
import {
  EntityId,
  ExistenceContractSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  canonicalJson,
  pcExistenceContractKey,
  type ExistenceContract,
  type OwnerFact,
  type Publication,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, type FsOps } from "@immortalis/engine";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { newKeepSecret, readKeep, writeKeep, type KeepRecord } from "./original-pc-keep.ts";
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
/** Wider-world claims are not accepted here (no World Generation intake exists); this exact prefix names one so it can be refused, not stored. */
export const WORLD_CLAIM_PREFIX = "about-the-world:";

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

/** The attestation every statement about the character must open with: the player says it is about the character alone. */
export const SELF_CLASS = "me:";
/** A statement the player classifies as about anything other than the character is not accepted here (no intake for it exists). */
export const WORLD_CLASS_PREFIXES = ["world:", WORLD_CLAIM_PREFIX] as const;

const WORLD_CLAIM_REASON =
  "a claim about the wider world (places, offices, followers, relationships, other people) is not accepted here: no intake for it exists, so it is neither stored nor turned into character canon";

function checkText(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "a statement cannot be empty" };
  if (hasControl(text))
    return { ok: false, reason: "a statement cannot contain control characters" };
  if (text.length > MAX_STATEMENT_CHARS)
    return { ok: false, reason: `a statement is at most ${MAX_STATEMENT_CHARS} characters` };
  return { ok: true, text };
}

/**
 * Judges one statement about the CHARACTER. The player must classify it themselves, explicitly and never by default: it opens with
 * `me:` (about the character alone). A statement that opens with `world:` (or `about-the-world:`) is the player saying it is about
 * something else and is refused; one with no classification is refused too, because nothing here can tell from the words whether it
 * asserts an office, a follower, an institution or a place (that judgement belongs to the I-002 compiler / receiving owners, which
 * this command does not have). The classification is the player's declaration, not an adjudication, and is shown as such.
 */
export function judgeStatement(
  raw: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const checked = checkText(raw);
  if (!checked.ok) return checked;
  const lower = checked.text.toLowerCase();
  if (WORLD_CLASS_PREFIXES.some((x) => lower.startsWith(x)))
    return { ok: false, reason: WORLD_CLAIM_REASON };
  if (!lower.startsWith(SELF_CLASS))
    return {
      ok: false,
      reason: `say whether it is about you alone: begin with "${SELF_CLASS}" (anything about other people, followers, offices, institutions, places or the wider world is not accepted here, and is never assumed to be about you)`,
    };
  const body = checked.text.slice(SELF_CLASS.length).trim();
  return body === ""
    ? { ok: false, reason: "a statement cannot be empty" }
    : { ok: true, text: body };
}

/** Judges the player's native-presence statement: a world-facing fact the player authors explicitly (not a claim about the character alone). */
export function judgePresence(
  raw: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const checked = checkText(raw);
  if (!checked.ok) return checked;
  if (checked.text.toLowerCase().startsWith(WORLD_CLAIM_PREFIX))
    return { ok: false, reason: WORLD_CLAIM_REASON };
  return checked;
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
  'Each statement above is one you attested, with "me:", is about you alone. No claim about the wider world (places, offices, followers, relationships, other people) is accepted here, and none was adjudicated for you; the world is as its own owner established it.';

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
const itemId = (slot: string, text: string): string => `mirror/${slot}/${sha([slot, text], 12)}`;

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
  const item = (slot: string, section: MirrorSection, text: string): MirrorItem => ({
    id: itemId(slot, text),
    section,
    label: LABELS[slot.replace(/-\d+$/, "")] ?? slot,
    text,
  });
  return [
    item("identity", "Identity", c.identity_agency.statement),
    item("embodiment", "Identity", c.embodiment_topology.statement),
    item("continuity", "Identity", c.continuity_rule.statement),
    ...(c.contact.kind === "CONTACT_ANCHOR"
      ? c.contact.surfaces.map((s, i) => item(`contact-${i + 1}`, "Identity", s.statement))
      : [item("no-contact", "Identity", c.contact.statement.statement)]),
    ...c.baseline_exception.player_overrides.map((s, i) =>
      item(`exception-${i + 1}`, "Notable traits and abilities", s.statement),
    ),
    ...c.entry_envelope.items.map((s, i) =>
      item(`possession-${i + 1}`, "Starting possessions", s.statement),
    ),
    ...c.baseline_exception.unresolved.map((s, i) => item(`open-${i + 1}`, "Still open", s)),
    item("world-claims-none", "About the world", WORLD_CLAIMS_NONE_TEXT),
    item("delegation-none", "How this character came to be", DELEGATION_NONE_TEXT),
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

const quoted = (s: string): string => JSON.stringify(s);

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

const keyed = (secret: string, value: unknown): string =>
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

const publicationOf = (stage: "release" | "bind", id: string): Publication => ({
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
  | "PLACEMENT_UNRESOLVED"
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
  PLACEMENT_UNRESOLVED:
    "the established world or locus carries constraints that a native-presence statement could contradict, and nothing here can judge that (a player's confirmation cannot override an earlier independent owner fact); the placement is left unresolved and nothing is bound",
  WORLD_NOT_ESTABLISHED:
    "that world is not established in this campaign; nothing was changed. This command never creates, defaults or infers a world",
  LOCUS_NOT_ESTABLISHED:
    "that locus is not established in that world; nothing was changed. This command never creates, defaults or infers a locus",
  INVALID_REQUEST: "the request is not valid; nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for the local operator",
  DECLINED: "not kept or not confirmed; nothing was changed",
};

const result = (
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
export function releaseProblems(
  campaignId: string,
  fact: OwnerFact,
  keep: KeepRecord | null,
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
  return out;
}

interface Held {
  readonly campaign: CanonicalCampaign;
  readonly campaignId: string;
  /** the retained keep: the secret every recognised publication identity is keyed by */
  readonly keep: KeepRecord;
}

function bindingProblems(
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
  return out;
}

const factLine = (name: string, f: OwnerFact): string =>
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
      `physical custody of the character: ${campaign.pcPhysicalLocusCustody(pcId) ? "present (NOT made by this command)" : "none - this command establishes none"}`,
    ].filter((l) => l !== ""),
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The commands.
// ---------------------------------------------------------------------------------------------------------------------------------

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
}

const BUILD_ID = "immortalis-operator";
const UNKNOWN_OUTCOME = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);
const MAX_ATTEMPTS = 3;
const MAX_REVISIONS = 50;

const closeQuietly = async (s: { close(): Promise<void> } | undefined): Promise<void> => {
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
    `Everything you say here must be about YOUR character alone, and you say so yourself: begin every statement with "${SELF_CLASS}" (about me alone).`,
  );
  terminal.say(
    "Anything about other people, followers, offices, institutions, places or the wider world is not accepted here, and nothing here decides for you which is which.",
  );
  terminal.say("Who - or what - are you?");
  const identity = await askStatement(terminal, "identity>", false);
  if (identity === null) return null;
  terminal.say(
    "How can the world register you? One way per line, an empty line to finish. For none at all, type: no-contact me: <why>",
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

/**
 * The whole-Mirror review loop. Every display shows the entire Mirror with a fresh challenge; one player response is one revision
 * cycle applied to the whole; and the only way out with a character is the player typing the keep phrase for the LAST display, whose
 * subject is exactly the content that will be committed. An incomplete draft is displayed but offered no keep phrase at all.
 */
async function review(
  terminal: OperatorTerminal,
  campaignId: string,
  pcId: string,
  start: CharacterDraft,
): Promise<{ contract: ExistenceContract; draft: CharacterDraft; shownRevision: number } | null> {
  let draft = start;
  for (let revision = 1; revision <= MAX_REVISIONS; revision++) {
    const missing = missingOf(draft);
    const items = previewItems(pcId, draft);
    const contract = compileContract(pcId, draft);
    const shown = mirrorPanel(
      pcId,
      items,
      `display ${revision}`,
      missing.length === 0
        ? [
            "This is how IMMORTALIS understands your character.",
            "Keep this character, or change something before we continue?",
          ]
        : [`This character cannot be kept yet. Still needed: ${missing.join("; ")}.`],
    );
    let line: string | null;
    if (contract === null) {
      for (const l of shown) terminal.say(l);
      terminal.say('Type "change" to continue revising. Anything else leaves without a character.');
      line = await terminal.ask(">");
    } else {
      const subject = subjectOf({
        verb: "keep-character",
        campaign_id: campaignId,
        pc_id: pcId,
        contract,
      });
      const decision = await requestOperatorDecision(
        terminal,
        "keep-character",
        subject,
        shown,
        'To revise instead, type "change". Anything else leaves without a character.',
      );
      if (decision.kind === "END_OF_INPUT") return null;
      if (decision.kind === "CONFIRMED") {
        if (!consumeConfirmation(decision.confirmation, "keep-character", subject)) return null;
        return { contract, draft, shownRevision: revision };
      }
      line = decision.line;
    }
    if (line === null || line.trim() !== "change") return null;
    for (const l of REVISION_HELP) terminal.say(l);
    const edits: Edit[] = [];
    let refused: string | null = null;
    for (let n = 0; n < 4 * MAX_LIST_ITEMS; n++) {
      const entry = await terminal.ask("change>");
      if (entry === null) return null;
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
  return null;
}

type Opened =
  | { readonly ok: true; readonly session: LocalOperatorSession }
  | { readonly ok: false; readonly refusal: CharacterResult };

async function openSession(p: {
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

/**
 * The committed world and locus facts that constrain what may be present or happen there (the free-text constraint and law-departure
 * lists of the World Profile and the Locus). Whether a player's native-presence statement contradicts one of them is a semantic
 * judgement that belongs to the I-002 compiler / Insertion reconciliation (IR §7); no producer of it exists here, and a player's
 * confirmation cannot override an earlier independent owner fact. So while any such fact is committed, the compatibility cannot be
 * judged and the placement is left UNRESOLVED (IR §7: "clarify, consume explicit delegation, or leave unresolved"): nothing is bound.
 * The broad premise, canon and designation are shown to the player and are not constraints in this sense.
 */
export function insertionBlockers(
  world: {
    material_world_law_departures: readonly string[];
    insertion_supporting_constraints: readonly { aspect: string; statement: string }[];
  },
  locus: { constraints: readonly { aspect: string; statement: string }[] },
): string[] {
  return [
    ...world.material_world_law_departures.map((d) => `world-law departure: ${quoted(d)}`),
    ...world.insertion_supporting_constraints.map(
      (c) => `world constraint ${c.aspect}: ${quoted(c.statement)}`,
    ),
    ...locus.constraints.map((c) => `locus constraint ${c.aspect}: ${quoted(c.statement)}`),
  ];
}

const unresolved = (blockers: readonly string[], released: boolean) =>
  result("PLACEMENT_UNRESOLVED", [
    released
      ? "the character is released and stays released but unbound"
      : "nothing was asked and nothing was written",
    "committed facts that a native-presence statement could contradict:",
    ...blockers.map((b) => `  - ${b}`),
    "missing producer: judging a presence statement against these (the I-002 compiler / Insertion reconciliation, IR §7) - none exists in this build",
  ]);

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

  const stateDir = p.operatorDir ?? defaultOperatorDir(p.campaignDir);
  const keepRead = await readKeep({
    dir: stateDir,
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
  const blockers = insertionBlockers(world.value, locus.value);

  if (pcFact) {
    const problems = releaseProblems(campaignId, pcFact, keep);
    if (problems.length > 0 || keep === null) return result("CHARACTER_CONFLICT", problems);
    const pc = campaign.playerCharacter(pcId)!;
    if (bindingFact) {
      const why = bindingProblems({ campaign, campaignId, keep }, pc.fact, { worldId, locusId });
      return why.length === 0
        ? boundReport(campaign, pcId, campaignId)
        : result("BINDING_CONFLICT", why);
    }
    terminal.say(
      `RESUMING: this command already released the character ${pcId}; it was kept earlier and needs no further keep.`,
    );
    for (const l of mirrorPanel(pcId, mirrorItems(pc.value), "as kept earlier", []))
      terminal.say(l);
    return place(p, session, pc.fact, false, keep, blockers);
  }
  if (bindingFact)
    return result("BINDING_CONFLICT", [
      "an operative binding is held without a character of this command",
    ]);

  let retained: KeepRecord;
  if (keep !== null) {
    // kept at this console and retained, but not yet released (an interruption between the two): release exactly what was kept
    terminal.say(
      `RESUMING: the character ${pcId} was kept at this console and is not yet released; releasing exactly what was kept.`,
    );
    for (const l of mirrorPanel(pcId, mirrorItems(keep.contract), "as kept earlier", []))
      terminal.say(l);
    retained = keep;
  } else {
    if (blockers.length > 0) return unresolved(blockers, false);
    const drafted = await elicit(terminal);
    if (drafted === null) return result("DECLINED", ["the character was not completed or kept"]);
    const reviewed = await review(terminal, campaignId, pcId, drafted);
    if (reviewed === null) return result("DECLINED", ["the character was not kept"]);
    // the proof of the keep is retained BEFORE anything is released, so the release can be recognised as having come from it
    const record = { pc_id: pcId, secret: newKeepSecret(), contract: reviewed.contract };
    const kept = await writeKeep({
      dir: stateDir,
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

  const released = await campaign.releasePlayerCharacter({
    ...publicationOf("release", releaseIdOf(retained.secret, campaignId, retained.contract)),
    contract: retained.contract,
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
  return place(p, session, fact, true, retained, blockers);
}

/** The separate, second choice: the player states and confirms native presence at the established world and locus; then the binding is committed. */
async function place(
  p: AuthorCharacterParams,
  session: LocalOperatorSession,
  pcFact: OwnerFact,
  releasedNow: boolean,
  keep: KeepRecord,
  blockers: readonly string[],
): Promise<CharacterResult> {
  const { terminal, pcId, worldId, locusId, campaignId } = p;
  const campaign = session.campaign;
  const world = campaign.world(worldId)!;
  const locus = campaign.locus(worldId, locusId)!;
  const unbound = (why: string, code?: string) =>
    result(
      "CHARACTER_RELEASED_UNBOUND",
      [`character: ${pcFact.key} (released${releasedNow ? " just now" : " earlier"})`, why],
      code,
    );

  if (blockers.length > 0) return unresolved(blockers, true);
  const w = world.value;
  const lines = (title: string, entries: readonly string[]) =>
    entries.length === 0
      ? [`  ${title}: none`]
      : [`  ${title}:`, ...entries.map((e) => `    - ${e}`)];
  for (const l of [
    "PLACEMENT - a separate choice from keeping your character. Nothing is bound yet.",
    OOC_BANNER,
    `WORLD ${worldId} (established earlier by World-State, not by you now)`,
    `  premise: ${quoted(w.premise)}`,
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
    "If your character is originally present at this place - native, already there, with no arrival, portal, transfer or summoning -",
    "state that in your own words. An empty line leaves your character released but unplaced.",
  ])
    terminal.say(l);
  const statement = await askStatement(terminal, "presence>", true, judgePresence);
  if (statement === null || statement === "")
    return unbound("native presence was not stated or confirmed");

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
  );
  if (
    decision.kind !== "CONFIRMED" ||
    !consumeConfirmation(decision.confirmation, "place-character", subject)
  )
    return unbound("native presence was not confirmed");

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
  });
  if (!bound.ok) {
    if (UNKNOWN_OUTCOME.has(bound.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [
        `character ${pcId}: released`,
        `binding: ${bound.error.code}`,
      ]);
    }
    return unbound(`the binding was refused: ${bound.error.code}`, bound.error.code);
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
  out.push(...releaseProblems(campaignId, pc.fact, keep));
  out.push(...bindingProblems({ campaign, campaignId, keep }, pc.fact, expected));
  return out;
}

/**
 * Reports what a campaign holds of a character this command released and bound, from canon alone: none, released but unbound, or bound
 * (verified). A character this command did not record is reported as a conflict, never as bound.
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
  const problems = releaseProblems(campaignId, fact, read.value);
  if (problems.length > 0 || read.value === null)
    return result("CHARACTER_CONFLICT", [`campaign: ${campaignId}`, ...problems]);
  const pc = campaign.playerCharacter(pcId)!;
  if (!binding)
    return result("CHARACTER_RELEASED_UNBOUND", [
      `campaign: ${campaignId}`,
      factLine("character", pc.fact),
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
