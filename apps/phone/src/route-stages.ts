import { createHash } from "node:crypto";
import {
  PC_CLAIM_SECTIONS,
  canonicalJson,
  type ExistenceContract,
  type PcClaimLocator,
} from "@immortalis/contracts";
import {
  pcClaimAt,
  pcClarificationIdOf,
  pcClarificationWordsDigest,
  pcDelegationIdOf,
  statesExactDuration,
} from "@immortalis/engine";
import { judgeStatement } from "@immortalis/operator";
import { ClosedSettingSchema } from "../../../packages/operator/src/closed-setting.ts";
import { CollectionPreparationSchema } from "../../../packages/operator/src/collection-preparation.ts";
import type { PhoneConfig } from "./config.ts";
import { isScenario, checkScenarioFile, type Scenario } from "./scenario.ts";
import { identify, type SetupIdentity } from "./setup-recovery.ts";

/**
 * The stages of the supported ORIGINAL-world collection-preparation route that follow the merged setting and character tools, as the
 * chat adapter dispatches them: pure inputs, identities and documents. This module reads no campaign and writes nothing. A host's
 * values are UNTRUSTED CANDIDATES: they are bounded here, resolved against committed facts by the caller, shown whole to the human, and
 * judged by the shipped operator command and the owners. Nothing is defaulted, completed or inferred for the player.
 *
 *   LOCUS       the character's stationary physical custody (`establish-character-locus`)
 *   CHRONOLOGY  the origin of canonical time, as its author states it (`initialize-time`)
 *   CLARIFY     the player's own materially unresolved duration of ONE handling cycle (`clarify-collection-cycle`, R-5)
 *   DELEGATE    the same branch, the choice DELEGATED to role.gm inside the player's bounds (`delegate-collection-cycle`, H1)
 *   PREPARE     the PC mechanism, an EMPTY Reserve and the extraction basis (`prepare-collection`)
 *   DECLARE     the author's closed domain and workforce scope (`declare-closed-setting`)
 *   FINISH      the referee's cycle attestation and the service's scenario/view installation (no human choice)
 */
export type StageKind =
  "LOCUS" | "CHRONOLOGY" | "CLARIFY" | "DELEGATE" | "PREPARE" | "DECLARE" | "FINISH";

/** the shipped command each stage runs (FINISH is the service's own composite: the attestation command, then the installation) */
export const STAGE_COMMAND: Readonly<Record<StageKind, string>> = {
  LOCUS: "establish-character-locus",
  CHRONOLOGY: "initialize-time",
  CLARIFY: "clarify-collection-cycle",
  DELEGATE: "delegate-collection-cycle",
  PREPARE: "prepare-collection",
  DECLARE: "declare-closed-setting",
  FINISH: "finish-collection-setup",
};

/** the stages in dependency/consent order */
export const STAGE_ORDER: readonly StageKind[] = [
  "LOCUS",
  "CHRONOLOGY",
  "CLARIFY",
  "DELEGATE",
  "PREPARE",
  "DECLARE",
  "FINISH",
];

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: string[] };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const onlyKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).every((k) => keys.includes(k));
// eslint-disable-next-line no-control-regex -- the point is to refuse control characters
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** the longest single authored text this route carries (the shipped schemas set none; the transcript and the 64 KB document bound it) */
export const MAX_TEXT = 4000;
/** the owner's own minimum for a quotation that grounds a mechanism statement */
export const MIN_QUOTE = 8;

/** One authored text: a string, trimmed, non-empty, free of control characters and bounded. The same text is what the human is shown. */
export function boundedText(
  path: string,
  v: unknown,
  issues: string[],
  o: { readonly max?: number; readonly min?: number } = {},
): string | null {
  if (typeof v !== "string") {
    issues.push(`${path}: must be text`);
    return null;
  }
  const t = v.trim();
  const max = o.max ?? MAX_TEXT;
  if (t.length === 0) issues.push(`${path}: must not be empty`);
  else if (CONTROL.test(t)) issues.push(`${path}: must be one line without control characters`);
  else if (t.length > max) issues.push(`${path}: must be at most ${max} characters`);
  else if (o.min !== undefined && t.length < o.min)
    issues.push(`${path}: must be at least ${o.min} characters`);
  else return t;
  return null;
}
const wholeNumber = (path: string, v: unknown, min: number, issues: string[]): number | null => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) {
    issues.push(`${path}: must be a whole number of at least ${min}`);
    return null;
  }
  return v;
};

// -- the player's inputs -----------------------------------------------------------------------------------------------------------

export interface ChronologyInput {
  /** the author's own words for the moment the campaign begins */
  readonly statement: string;
  /** the exact coordinate, a whole number in the author's unit */
  readonly value: number;
  /** the author's own canonical unit */
  readonly unit: string;
}
export function parseChronology(args: Record<string, unknown>): Parsed<ChronologyInput> {
  const issues: string[] = [];
  for (const k of Object.keys(args))
    if (!["statement", "value", "unit"].includes(k)) issues.push(`${k}: is not offered`);
  const statement = boundedText("statement", args["statement"], issues);
  const unit = boundedText("unit", args["unit"], issues, { max: 64 });
  const value = wholeNumber("value", args["value"], 0, issues);
  return issues.length > 0 || statement === null || unit === null || value === null
    ? { ok: false, issues: issues.slice(0, 8) }
    : { ok: true, value: { statement, value, unit } };
}

/** the player's own account of how long ONE handling cycle takes, exactly as bounded for the shipped console */
export function parseHandling(args: Record<string, unknown>): Parsed<string> {
  if (!onlyKeys(args, ["words"])) return { ok: false, issues: ["only words is offered"] };
  const w = args["words"];
  if (typeof w !== "string") return { ok: false, issues: ["words: must be text"] };
  const j = judgeStatement(w);
  return j.ok ? { ok: true, value: j.text } : { ok: false, issues: [`words: ${j.reason}`] };
}

/**
 * H1: the scope a player commits when they DELEGATE the choice of the handling cycle ("surprise me", I-002 section 9): their own words
 * (optional) and a shortest and a longest whole number of the campaign's unit. Bounded here; nothing is defaulted, widened or completed
 * for the player, and a missing bound is not a scope.
 */
export interface DelegateInput {
  readonly words: string | null;
  readonly shortest: number;
  readonly longest: number;
}
export function parseDelegation(args: Record<string, unknown>): Parsed<DelegateInput> {
  const issues: string[] = [];
  for (const k of Object.keys(args))
    if (!["words", "shortest", "longest"].includes(k)) issues.push(`${k}: is not offered`);
  let words: string | null = null;
  if (args["words"] !== undefined && args["words"] !== null) {
    if (typeof args["words"] !== "string") issues.push("words: must be text");
    else {
      const j = judgeStatement(args["words"]);
      if (j.ok) words = j.text;
      else issues.push(`words: ${j.reason}`);
    }
  }
  const shortest = wholeNumber("shortest", args["shortest"], 1, issues);
  const longest = wholeNumber("longest", args["longest"], 1, issues);
  if (shortest !== null && longest !== null && shortest > longest)
    issues.push("shortest: must not exceed longest");
  return issues.length > 0 || shortest === null || longest === null
    ? { ok: false, issues: issues.slice(0, 8) }
    : { ok: true, value: { words, shortest, longest } };
}

export interface PrepareInput {
  /** a verbatim quotation of an accepted claim of the character that states what the hands (the actuator) do */
  readonly actuator_quote: string;
  /** a verbatim quotation of an accepted claim that states what the mechanism can and cannot pass */
  readonly traversal_quote: string;
  /** a verbatim quotation of an accepted (or the player's clarified) claim that states the cycle's number and unit */
  readonly cycle_quote: string;
  /** the number the quotation states, in the campaign's canonical unit */
  readonly cycle_value: number;
  /** the author's own word for the condition the Reserve holds material in */
  readonly reserve_condition: string;
  /** which stated physical access fact the extraction relies on (needed only where the source states several) */
  readonly relies_on_aspect: string | null;
}
const PREPARE_KEYS = [
  "actuator_quote",
  "traversal_quote",
  "cycle_quote",
  "cycle_value",
  "reserve_condition",
  "relies_on_aspect",
] as const;
export function parsePrepare(args: Record<string, unknown>): Parsed<PrepareInput> {
  const issues: string[] = [];
  for (const k of Object.keys(args))
    if (!(PREPARE_KEYS as readonly string[]).includes(k)) issues.push(`${k}: is not offered`);
  const q = (k: string) => boundedText(k, args[k], issues, { min: MIN_QUOTE });
  const actuator_quote = q("actuator_quote");
  const traversal_quote = q("traversal_quote");
  const cycle_quote = q("cycle_quote");
  const cycle_value = wholeNumber("cycle_value", args["cycle_value"], 1, issues);
  const reserve_condition = boundedText("reserve_condition", args["reserve_condition"], issues, {
    max: 64,
  });
  const relies =
    args["relies_on_aspect"] === undefined || args["relies_on_aspect"] === null
      ? null
      : boundedText("relies_on_aspect", args["relies_on_aspect"], issues, { max: 200 });
  return issues.length > 0 ||
    actuator_quote === null ||
    traversal_quote === null ||
    cycle_quote === null ||
    cycle_value === null ||
    reserve_condition === null
    ? { ok: false, issues: issues.slice(0, 8) }
    : {
        ok: true,
        value: {
          actuator_quote,
          traversal_quote,
          cycle_quote,
          cycle_value,
          reserve_condition,
          relies_on_aspect: relies,
        },
      };
}

export interface DeclareInput {
  readonly domain_designation: string;
  readonly domain_topology: string;
  readonly closure_statement: string;
  /** the ground on which no claim on the source is established */
  readonly source_ground: string;
  readonly workforce_statement: string;
}
const DECLARE_KEYS = [
  "domain_designation",
  "domain_topology",
  "closure_statement",
  "source_ground",
  "workforce_statement",
] as const;
export function parseDeclare(args: Record<string, unknown>): Parsed<DeclareInput> {
  const issues: string[] = [];
  for (const k of Object.keys(args))
    if (!(DECLARE_KEYS as readonly string[]).includes(k)) issues.push(`${k}: is not offered`);
  const t = (k: string) => boundedText(k, args[k], issues);
  const v = {
    domain_designation: t("domain_designation"),
    domain_topology: t("domain_topology"),
    closure_statement: t("closure_statement"),
    source_ground: t("source_ground"),
    workforce_statement: t("workforce_statement"),
  };
  return issues.length > 0 || Object.values(v).some((x) => x === null)
    ? { ok: false, issues: issues.slice(0, 8) }
    : { ok: true, value: v as DeclareInput };
}

// -- the committed facts the documents are resolved against (read by the caller from ONE owner-verified open) -------------------------

/** the verified original setting's one world, locus and exact finite source */
export interface SettingFacts {
  readonly world_id: string;
  readonly locus_id: string;
  readonly source_key: string;
  readonly material_class: string;
  /** the unit of the source's established quantity */
  readonly unit: string;
  readonly access_facts: readonly { readonly aspect: string; readonly statement: string }[];
}

/** the service-allocated technical identities of the preparation: the operator's scenario names them when one is configured, otherwise they derive from the campaign */
export interface TechnicalIds {
  readonly mechanism_id: string;
  readonly reserve_id: string;
  readonly basis_id: string;
}
export function technicalIds(
  config: Pick<PhoneConfig, "campaignId" | "scenarioFile">,
): TechnicalIds {
  const scenario = checkScenarioFile(config.scenarioFile);
  if (scenario.ok)
    return {
      mechanism_id: scenario.scenario.mechanism,
      reserve_id: scenario.scenario.reserve,
      basis_id: scenario.scenario.basis,
    };
  const id = (kind: string) =>
    `${kind}-${createHash("sha256")
      .update(`immortalis-chat-collection:${config.campaignId}:${kind}`, "utf8")
      .digest("hex")
      .slice(0, 16)}`;
  return { mechanism_id: id("mechanism"), reserve_id: id("reserve"), basis_id: id("basis") };
}

// -- documents ------------------------------------------------------------------------------------------------------------------------

export const chronologyDocument = (i: ChronologyInput): string =>
  JSON.stringify({
    format: "immortalis-starting-chronology",
    format_version: 1,
    time: { unit: i.unit, value: i.value },
    statement: i.statement,
  });

export const declarationDocument = (s: SettingFacts, i: DeclareInput): string =>
  JSON.stringify({
    format: "immortalis-closed-setting-declaration",
    format_version: 1,
    world_id: s.world_id,
    locus_id: s.locus_id,
    domain: { designation: i.domain_designation, topology: i.domain_topology },
    closure: { statement: i.closure_statement },
    source_rights: [{ source_key: s.source_key, ground: i.source_ground }],
    workforce_scope: { statement: i.workforce_statement },
  });

/** the identity the shipped `declare-closed-setting` derives for every publication of one exact declaration (ahead of the owners' versions) */
export function declarationDigest(campaignId: string, document: string): string | null {
  try {
    const parsed = ClosedSettingSchema.safeParse(JSON.parse(document));
    return parsed.success
      ? createHash("sha256")
          .update(canonicalJson({ campaign_id: campaignId, declaration: parsed.data }), "utf8")
          .digest("hex")
      : null;
  } catch {
    return null;
  }
}

export interface AcceptedClaim {
  readonly locator: PcClaimLocator;
  readonly statement: string;
}
const LISTED: ReadonlySet<string> = new Set([
  "contact",
  "baseline_exception.safely_inherited",
  "baseline_exception.player_overrides",
  "entry_envelope",
]);
/** every accepted, locatable claim of the released contract, in section order (a hypothesis or unresolved item has no locator and is not listed) */
export function acceptedClaims(contract: ExistenceContract): AcceptedClaim[] {
  const out: AcceptedClaim[] = [];
  for (const section of PC_CLAIM_SECTIONS) {
    for (let index = 0; index < (LISTED.has(section) ? 64 : 1); index++) {
      const claim = pcClaimAt(contract, { section, index });
      if (claim === undefined) break;
      out.push({ locator: { section, index }, statement: claim.statement });
    }
  }
  return out;
}

/** does an accepted statement already give a number and the campaign's canonical unit (the textual gate for the R-5 branch, as the shipped console applies it to the words) */
export const statesNumberAndUnit = (statement: string, unit: string): boolean =>
  /[0-9]/.test(statement) && statement.includes(unit);

export interface PrepareFacts {
  readonly pc_id: string;
  readonly contract: ExistenceContract;
  /** the character's accepted R-5 clarification, if any (its words may ground the cycle quotation only) */
  readonly clarification: {
    readonly clarification_id: string;
    readonly statements: readonly string[];
    /** present only when the branch was closed by a DELEGATED selection (the referee's words, never the player's own) */
    readonly delegated?: { readonly shortest: number; readonly longest: number };
  } | null;
  readonly canonical_unit: string;
  readonly setting: SettingFacts;
  readonly ids: TechnicalIds;
}

export type PreparationBuilt =
  | { readonly ok: true; readonly document: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The strict preparation document a host's candidate quotations resolve to. Every claim locator and technical identity is resolved here
 * from committed facts; the host supplies only quotations (verbatim parts of accepted claims), the number a quotation states, and the
 * author's own word for the Reserve's condition. Nothing the owner would refuse is passed on: the same textual grounding the owner
 * applies at its first publication is applied BEFORE the human is asked, so a refusal costs the player nothing.
 */
export function buildPreparation(f: PrepareFacts, i: PrepareInput): PreparationBuilt {
  const no = (reason: string): PreparationBuilt => ({ ok: false, reason });
  const claims = acceptedClaims(f.contract);
  const holding = (quote: string) => claims.filter((c) => c.statement.includes(quote));
  const actuator = holding(i.actuator_quote);
  if (actuator.length === 0)
    return no(
      "actuator_quote is not a verbatim part of any accepted statement of the character: quote the character's own accepted words, exactly",
    );
  const traversal = holding(i.traversal_quote);
  if (traversal.length === 0)
    return no(
      "traversal_quote is not a verbatim part of any accepted statement of the character: quote the character's own accepted words, exactly",
    );
  if (!statesExactDuration(i.cycle_quote, { unit: f.canonical_unit, value: i.cycle_value }))
    return no(
      `cycle_quote does not state exactly ${i.cycle_value} and the campaign's unit "${f.canonical_unit}": the quotation must say the number and the unit itself`,
    );
  const released = holding(i.cycle_quote);
  const clarified: { clarification_id: string; index: number }[] = [];
  if (released.length === 0 && f.clarification) {
    f.clarification.statements.forEach((s, index) => {
      if (s.includes(i.cycle_quote))
        clarified.push({ clarification_id: f.clarification!.clarification_id, index });
    });
  }
  if (released.length === 0 && clarified.length === 0)
    return no(
      "cycle_quote is not a verbatim part of any accepted statement of the character, of the player's accepted clarification or of a sealed delegated selection. If that handling duration is materially unresolved, use state_handling_duration (the player's own words) or delegate_handling_duration (the player delegates the choice, inside their bounds); otherwise quote the accepted handling-cycle words",
    );
  const cited = new Map<string, PcClaimLocator>();
  for (const c of [...actuator, ...traversal, ...released])
    cited.set(`${c.locator.section}#${c.locator.index}`, c.locator);
  const s = f.setting;
  let relies = s.access_facts[0];
  if (i.relies_on_aspect !== null) {
    relies = s.access_facts.find((a) => a.aspect === i.relies_on_aspect);
    if (relies === undefined)
      return no("relies_on_aspect is not an access fact the setting states for its source");
  } else if (s.access_facts.length !== 1) {
    return no(
      s.access_facts.length === 0
        ? "the setting states no physical access fact for its source, so no extraction basis can rely on one"
        : "the source states several access facts: relies_on_aspect must name the one the extraction relies on",
    );
  }
  const parsed = CollectionPreparationSchema.safeParse({
    format: "immortalis-collection-preparation",
    format_version: 1,
    mechanism: {
      pc_id: f.pc_id,
      mechanism_id: f.ids.mechanism_id,
      claims: [...cited.values()],
      ...(clarified.length > 0 ? { clarified } : {}),
      actuator: { statement: i.actuator_quote },
      traversal: { statement: i.traversal_quote },
      cycle_duration: { unit: f.canonical_unit, value: i.cycle_value },
      cycle_quote: i.cycle_quote,
    },
    extraction_basis: {
      basis_id: f.ids.basis_id,
      world_id: s.world_id,
      source_key: s.source_key,
      material_class: s.material_class,
      unit: s.unit,
      relies_on: { aspect: relies!.aspect, statement: relies!.statement },
    },
    reserve: {
      reserve_id: f.ids.reserve_id,
      material_class: s.material_class,
      quantity: { amount: 0, unit: s.unit },
      condition: i.reserve_condition,
      world_id: s.world_id,
      locus_id: s.locus_id,
    },
  });
  return parsed.success
    ? { ok: true, document: JSON.stringify(parsed.data) }
    : no(
        `the preparation is not valid: ${parsed.error.issues
          .slice(0, 4)
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("; ")}`,
      );
}

// -- the stage identities (what a recovery looks for), captured before dispatch ----------------------------------------------------

export interface LocusStage {
  readonly kind: "LOCUS";
  readonly pc_id: string;
  readonly world_id: string;
  readonly locus_id: string;
}
export interface ChronologyStage {
  readonly kind: "CHRONOLOGY";
  readonly setup: SetupIdentity;
}
export interface ClarifyStage {
  readonly kind: "CLARIFY";
  readonly pc_id: string;
  readonly clarification_id: string;
  /** the player's own words, exactly as offered */
  readonly words: string;
  readonly words_digest: string;
}
export interface DelegateStage {
  readonly kind: "DELEGATE";
  readonly pc_id: string;
  readonly delegation_id: string;
  /** the player's own words about what they want, exactly as offered (null when they offered none) */
  readonly words: string | null;
  readonly shortest: number;
  readonly longest: number;
  readonly scope_digest: string;
}
export interface PrepareStage {
  readonly kind: "PREPARE";
  readonly setup: SetupIdentity;
  readonly pc_id: string;
  readonly mechanism_id: string;
  readonly reserve_id: string;
  readonly basis_id: string;
}
export interface DeclareStage {
  readonly kind: "DECLARE";
  readonly document: string;
  readonly document_sha256: string;
  readonly digest: string;
  readonly world_id: string;
  readonly locus_id: string;
  /** the owners' versions when the human was asked: the shipped command's confirmation is bound to them */
  readonly closure_version: number;
  readonly scope_version: number;
}
export interface FinishStage {
  readonly kind: "FINISH";
  readonly scenario: Scenario;
  /** whether the cycle was not yet attested when this was dispatched (the attestation command is then part of it) */
  readonly attest: boolean;
}
export type StageIdentity =
  | LocusStage
  | ChronologyStage
  | ClarifyStage
  | DelegateStage
  | PrepareStage
  | DeclareStage
  | FinishStage;

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const ENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const entity = (v: unknown): v is string => typeof v === "string" && ENTITY.test(v);
const version = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function locusIdentity(pc_id: string, world_id: string, locus_id: string): LocusStage {
  return { kind: "LOCUS", pc_id, world_id, locus_id };
}
export function chronologyIdentity(
  config: Pick<PhoneConfig, "campaignId">,
  i: ChronologyInput,
): ChronologyStage | null {
  const setup = identify(config.campaignId, "initialize-time", chronologyDocument(i));
  return setup ? { kind: "CHRONOLOGY", setup } : null;
}
export function clarifyIdentity(pc_id: string, words: string): ClarifyStage {
  return {
    kind: "CLARIFY",
    pc_id,
    clarification_id: pcClarificationIdOf(pc_id),
    words,
    words_digest: pcClarificationWordsDigest([words]),
  };
}
const delegationScopeDigest = (i: DelegateInput): string =>
  sha(canonicalJson({ words: i.words, shortest: i.shortest, longest: i.longest })).slice(0, 16);
export function delegateIdentity(pc_id: string, i: DelegateInput): DelegateStage {
  return {
    kind: "DELEGATE",
    pc_id,
    delegation_id: pcDelegationIdOf(pc_id),
    words: i.words,
    shortest: i.shortest,
    longest: i.longest,
    scope_digest: delegationScopeDigest(i),
  };
}
export function prepareIdentity(
  config: Pick<PhoneConfig, "campaignId">,
  pc_id: string,
  ids: TechnicalIds,
  document: string,
): PrepareStage | null {
  const setup = identify(config.campaignId, "prepare-collection", document);
  return setup
    ? {
        kind: "PREPARE",
        setup,
        pc_id,
        mechanism_id: ids.mechanism_id,
        reserve_id: ids.reserve_id,
        basis_id: ids.basis_id,
      }
    : null;
}
export function declareIdentity(
  config: Pick<PhoneConfig, "campaignId">,
  document: string,
  world_id: string,
  locus_id: string,
  versions: { readonly closure: number; readonly scope: number },
): DeclareStage | null {
  const digest = declarationDigest(config.campaignId, document);
  return digest === null
    ? null
    : {
        kind: "DECLARE",
        document,
        document_sha256: sha(document),
        digest,
        world_id,
        locus_id,
        closure_version: versions.closure,
        scope_version: versions.scope,
      };
}

/** a retained stage identity is accepted only when every document in it re-derives to the identities it carries, for this campaign and this command */
export function validStageIdentity(
  config: Pick<PhoneConfig, "campaignId">,
  command: string,
  v: unknown,
): v is StageIdentity {
  if (!record(v) || typeof v["kind"] !== "string") return false;
  const kind = v["kind"] as StageKind;
  if (STAGE_COMMAND[kind] !== command) return false;
  switch (kind) {
    case "LOCUS":
      return (
        exactKeys(v, ["kind", "pc_id", "world_id", "locus_id"]) &&
        entity(v["pc_id"]) &&
        entity(v["world_id"]) &&
        entity(v["locus_id"])
      );
    case "CHRONOLOGY": {
      if (!exactKeys(v, ["kind", "setup"]) || !record(v["setup"])) return false;
      const s = v["setup"];
      const expected =
        typeof s["document"] === "string"
          ? identify(config.campaignId, "initialize-time", s["document"])
          : null;
      return (
        expected !== null &&
        s["command"] === "initialize-time" &&
        s["document_sha256"] === expected.document_sha256 &&
        s["publication_digest"] === expected.publication_digest &&
        exactKeys(s, ["command", "document", "document_sha256", "publication_digest"])
      );
    }
    case "CLARIFY": {
      if (
        !exactKeys(v, ["kind", "pc_id", "clarification_id", "words", "words_digest"]) ||
        !entity(v["pc_id"]) ||
        typeof v["words"] !== "string"
      )
        return false;
      const j = judgeStatement(v["words"]);
      return (
        j.ok &&
        j.text === v["words"] &&
        v["clarification_id"] === pcClarificationIdOf(v["pc_id"]) &&
        v["words_digest"] === pcClarificationWordsDigest([v["words"]])
      );
    }
    case "DELEGATE": {
      if (
        !exactKeys(v, [
          "kind",
          "pc_id",
          "delegation_id",
          "words",
          "shortest",
          "longest",
          "scope_digest",
        ]) ||
        !entity(v["pc_id"]) ||
        !(v["words"] === null || typeof v["words"] === "string") ||
        typeof v["shortest"] !== "number" ||
        typeof v["longest"] !== "number"
      )
        return false;
      const parsed = parseDelegation({
        shortest: v["shortest"],
        longest: v["longest"],
        ...(v["words"] === null ? {} : { words: v["words"] }),
      });
      return (
        parsed.ok &&
        parsed.value.words === v["words"] &&
        v["delegation_id"] === pcDelegationIdOf(v["pc_id"]) &&
        v["scope_digest"] === delegationScopeDigest(parsed.value)
      );
    }
    case "PREPARE": {
      if (
        !exactKeys(v, ["kind", "setup", "pc_id", "mechanism_id", "reserve_id", "basis_id"]) ||
        !record(v["setup"]) ||
        !entity(v["pc_id"]) ||
        !entity(v["mechanism_id"]) ||
        !entity(v["reserve_id"]) ||
        !entity(v["basis_id"])
      )
        return false;
      const s = v["setup"];
      const expected =
        typeof s["document"] === "string"
          ? identify(config.campaignId, "prepare-collection", s["document"])
          : null;
      if (
        expected === null ||
        s["command"] !== "prepare-collection" ||
        s["document_sha256"] !== expected.document_sha256 ||
        s["publication_digest"] !== expected.publication_digest ||
        !exactKeys(s, ["command", "document", "document_sha256", "publication_digest"])
      )
        return false;
      const parsed = CollectionPreparationSchema.safeParse(JSON.parse(String(s["document"])));
      return (
        parsed.success &&
        parsed.data.mechanism.pc_id === v["pc_id"] &&
        parsed.data.mechanism.mechanism_id === v["mechanism_id"] &&
        parsed.data.reserve.reserve_id === v["reserve_id"] &&
        parsed.data.extraction_basis.basis_id === v["basis_id"]
      );
    }
    case "DECLARE": {
      if (
        !exactKeys(v, [
          "kind",
          "document",
          "document_sha256",
          "digest",
          "world_id",
          "locus_id",
          "closure_version",
          "scope_version",
        ]) ||
        typeof v["document"] !== "string" ||
        v["document_sha256"] !== sha(v["document"]) ||
        v["digest"] !== declarationDigest(config.campaignId, v["document"]) ||
        !entity(v["world_id"]) ||
        !entity(v["locus_id"]) ||
        !version(v["closure_version"]) ||
        !version(v["scope_version"])
      )
        return false;
      const parsed = ClosedSettingSchema.safeParse(JSON.parse(v["document"]));
      return (
        parsed.success &&
        parsed.data.world_id === v["world_id"] &&
        parsed.data.locus_id === v["locus_id"]
      );
    }
    case "FINISH":
      return (
        exactKeys(v, ["kind", "scenario", "attest"]) &&
        typeof v["attest"] === "boolean" &&
        isScenario(v["scenario"])
      );
  }
}
