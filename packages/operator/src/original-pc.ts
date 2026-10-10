import { createHash } from "node:crypto";
import {
  EntityId,
  ExistenceContractSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  canonicalJson,
  type ExistenceContract,
  type OwnerFact,
  type Publication,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, type FsOps } from "@immortalis/engine";
import { OPERATOR_PUBLICATION_BASIS, OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
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

/** Judges one authored statement; returns the statement, or the reason it is refused. Nothing is rewritten except surrounding whitespace. */
export function judgeStatement(
  raw: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "a statement cannot be empty" };
  if (hasControl(text))
    return { ok: false, reason: "a statement cannot contain control characters" };
  if (text.length > MAX_STATEMENT_CHARS)
    return { ok: false, reason: `a statement is at most ${MAX_STATEMENT_CHARS} characters` };
  if (text.toLowerCase().startsWith(WORLD_CLAIM_PREFIX))
    return {
      ok: false,
      reason:
        "a claim about the wider world (places, offices, followers, relationships, other people) is not accepted here: no intake for it exists, so it is neither stored nor turned into character canon",
    };
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
  "No claim about the wider world (places, offices, followers, relationships, other people) is accepted here. This character is defined by what you said about yourself alone; the world is as its own owner established it.";

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
// Identities. Derived from the exact confirmed content, never from a clock or a random value: the same confirmed choice always
// reaches the same publication identities, so a replay is recognised by the store and a different choice meets the committed one.
// ---------------------------------------------------------------------------------------------------------------------------------

export const releaseIdOf = (campaignId: string, contract: ExistenceContract): string =>
  sha({ campaign_id: campaignId, contract }, 32);

export interface InsertionPins {
  readonly pc: number;
  readonly world: number;
  readonly locus: number;
}
export const bindingIdOf = (
  campaignId: string,
  pcId: string,
  worldId: string,
  locusId: string,
  pins: InsertionPins,
  statement: string,
): string =>
  sha(
    { campaign_id: campaignId, pc_id: pcId, world_id: worldId, locus_id: locusId, pins, statement },
    32,
  );

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
export function releaseProblems(campaignId: string, fact: OwnerFact): string[] {
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
  const id = releaseIdOf(campaignId, c);
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
}

function bindingProblems(
  { campaign, campaignId }: Held,
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
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const line = await terminal.ask(prompt);
    if (line === null) return null;
    if (line.trim() === "" && allowEmpty) return "";
    const judged = judgeStatement(line);
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
    "Everything you say here must be about YOUR character alone. Claims about the wider world are not accepted.",
  );
  terminal.say("Who - or what - are you?");
  const identity = await askStatement(terminal, "identity>", false);
  if (identity === null) return null;
  terminal.say(
    "How can the world register you? One way per line, an empty line to finish. For none at all, type: no-contact: <why>",
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
    const noContact = /^no-contact:\s*(.*)$/s.exec(line.trim());
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

  const held: Held = { campaign, campaignId };
  const others = campaign.store
    .listFacts()
    .filter((f) => f.owner === "pc_existence" && f.key !== `pc/${pcId}/existence-contract`);
  if (others.length > 0)
    return result("CHARACTER_CONFLICT", [`another character is held: ${others[0]!.key}`]);
  const pcFact = campaign.store.getFact(`pc/${pcId}/existence-contract`);
  const bindingFact = campaign.binding();

  if (pcFact) {
    const problems = releaseProblems(campaignId, pcFact);
    if (problems.length > 0) return result("CHARACTER_CONFLICT", problems);
    const pc = campaign.playerCharacter(pcId)!;
    if (bindingFact) {
      const why = bindingProblems(held, pc.fact, { worldId, locusId });
      return why.length === 0
        ? boundReport(campaign, pcId, campaignId)
        : result("BINDING_CONFLICT", why);
    }
    terminal.say(
      `RESUMING: this command already released the character ${pcId}; it was kept earlier and needs no further keep.`,
    );
    for (const l of mirrorPanel(pcId, mirrorItems(pc.value), "as kept earlier", []))
      terminal.say(l);
    return place(p, session, pc.fact, false);
  }
  if (bindingFact)
    return result("BINDING_CONFLICT", [
      "an operative binding is held without a character of this command",
    ]);

  const drafted = await elicit(terminal);
  if (drafted === null) return result("DECLINED", ["the character was not completed or kept"]);
  const kept = await review(terminal, campaignId, pcId, drafted);
  if (kept === null) return result("DECLINED", ["the character was not kept"]);

  const releaseId = releaseIdOf(campaignId, kept.contract);
  const released = await campaign.releasePlayerCharacter({
    ...publicationOf("release", releaseId),
    contract: kept.contract,
  });
  if (!released.ok) {
    if (UNKNOWN_OUTCOME.has(released.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`release: ${released.error.code}`]);
    }
    return result("CHARACTER_REFUSED", [`release: ${released.error.code}`], released.error.code);
  }
  terminal.say(`PROGRESS character RELEASED pc/${pcId}/existence-contract`);
  const fact = campaign.store.getFact(`pc/${pcId}/existence-contract`);
  if (!fact) return result("CHARACTER_OUTCOME_UNKNOWN", ["the released character is not held"]);
  return place(p, session, fact, true);
}

/** The separate, second choice: the player states and confirms native presence at the established world and locus; then the binding is committed. */
async function place(
  p: AuthorCharacterParams,
  session: LocalOperatorSession,
  pcFact: OwnerFact,
  releasedNow: boolean,
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
  const statement = await askStatement(terminal, "presence>", true);
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

  const bindId = bindingIdOf(campaignId, pcId, worldId, locusId, pins, statement);
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
    const problems = readBack(c, campaignId, pcId, { worldId, locusId });
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
): string[] {
  const out: string[] = [];
  if (campaign.store.head().campaign_id !== campaignId)
    out.push("the reopened campaign has another identity");
  if (campaign.verify().length > 0) out.push("canonical integrity reports violations");
  const pc = campaign.playerCharacter(pcId);
  if (!pc) return [...out, "the released character is not held"];
  out.push(...releaseProblems(campaignId, pc.fact));
  out.push(...bindingProblems({ campaign, campaignId }, pc.fact, expected));
  return out;
}

/**
 * Reports what a campaign holds of a character this command released and bound, from canon alone: none, released but unbound, or bound
 * (verified). A character this command did not record is reported as a conflict, never as bound.
 */
export function characterStatus(session: LocalOperatorSession): CharacterResult {
  const campaign = session.campaign;
  const campaignId = session.campaignId;
  const facts = campaign.store.listFacts().filter((f) => f.owner === "pc_existence");
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
  const problems = releaseProblems(campaignId, fact);
  if (problems.length > 0)
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
    ...bindingProblems({ campaign, campaignId }, pc.fact),
  ];
  return why.length > 0
    ? result("CHARACTER_VERIFICATION_FAILED", [`campaign: ${campaignId}`, ...why])
    : boundReport(campaign, pcId, campaignId);
}
