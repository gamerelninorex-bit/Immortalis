import {
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  ExtractionBasisSchema,
  ProductionReserveSchema,
  pcExistenceContractKey,
  popWorkforceScopeKey,
  productionExtractionBasisKey,
  productionReserveKey,
  worldSceneClosureKey,
  worldSourceConditionKey,
  type CanonicalTime,
  type ExistenceContract,
} from "@immortalis/contracts";
import { PcCollectionAdapter, canonicalEqual, pcClarificationIdOf } from "@immortalis/engine";
import { custodyProblems } from "../../../packages/operator/src/original-pc-locus.ts";
import { ClosedSettingSchema } from "../../../packages/operator/src/closed-setting.ts";
import type { KeepRecord } from "../../../packages/operator/src/original-pc-keep.ts";
import { readLocality, type LocalityReadback } from "./locality-evidence.ts";
import {
  characterStateOf,
  openCharacterCampaign,
  type CharacterState,
} from "./character-evidence.ts";
import type { PhoneConfig } from "./config.ts";
import {
  acceptedClaims,
  statesNumberAndUnit,
  technicalIds,
  type AcceptedClaim,
  type SettingFacts,
  type StageIdentity,
  type TechnicalIds,
} from "./route-stages.ts";

/**
 * Owner-side EVIDENCE about the stages that follow the character, read from ONE owner-verified open of the campaign (the adapter's own
 * module: the operator's rules and the owners are reused unchanged). Everything is READ-ONLY: it replays nothing, writes nothing, asks
 * nobody, reclaims no lock, and a status string is never evidence. The same single open serves the status the player's host reads, the
 * gates that decide whether a stage may begin at all, and the classification of what became of ONE dispatched stage.
 *
 * What it judges, and nothing else:
 *   - the physical custody by the shipped `custodyProblems` (the keep's keyed identities, the binding's own native decision and a physical
 *     decision that is PHYSICAL_ELIGIBLE);
 *   - the origin of canonical time, and whether THIS chronology's publication identity is the one that landed;
 *   - the player's accepted clarification, by its one slot and its exact words;
 *   - the three preparation publications, by their identities derived from the exact confirmed document;
 *   - the two declaration owners, by the shipped command's own "already declared and current" test;
 *   - the cycle attestation, against the mechanism version it attests.
 */

/** the unit and value the origin of canonical time holds NOW (the clock may have moved on from its origin) */
export interface TimeNow {
  readonly canonical_time: CanonicalTime;
}

export interface PreparationFacts {
  /** the intent identity each publication was committed under (null = not held) */
  readonly mechanism: { readonly version: number; readonly intent: string } | null;
  readonly reserve: { readonly intent: string } | null;
  readonly basis: { readonly intent: string } | null;
}

export interface DeclarationFacts {
  readonly closure: {
    readonly version: number;
    readonly current: boolean;
    readonly domain: unknown;
    readonly closure: unknown;
    readonly rights: unknown;
    readonly intent: string;
  } | null;
  readonly scope: {
    readonly version: number;
    readonly current: boolean;
    readonly scope: unknown;
    readonly intent: string;
  } | null;
}

/** the publication identities a caller wants the commit state of (by the exact intent identity the shipped command derives) */
export interface RouteProbe {
  readonly intents?: readonly string[];
}

export interface RouteFacts {
  /** Existing player-view proof refuses package residue; this adapter never deletes it. */
  readonly package_residue: boolean;
  readonly character: Exclude<CharacterState, { kind: "NO_SETTING" | "BLOCKED" | "UNAVAILABLE" }>;
  readonly setting: LocalityReadback;
  /** the single exact finite source, with the access facts its owner states */
  readonly source: SettingFacts;
  readonly keep: KeepRecord | null;
  /** every committed world is ORIGINAL (the only domain the delegated author rule covers) */
  readonly original_only: boolean;
  readonly time: TimeNow | null;
  /** the physical custody: absent, or held with the reasons (if any) it is not exactly the one the shipped command makes */
  readonly custody: { readonly problems: readonly string[] } | null;
  readonly collection_commitment: boolean;
  readonly clarification: {
    readonly clarification_id: string;
    readonly statements: readonly string[];
  } | null;
  readonly claims: readonly AcceptedClaim[];
  readonly contract: ExistenceContract | null;
  readonly preparation: PreparationFacts;
  readonly declaration: DeclarationFacts;
  readonly attestation: { readonly current: boolean } | null;
  /** the commit state of every probed intent identity */
  readonly landed: ReadonlyMap<string, boolean>;
  readonly ids: TechnicalIds;
}

export type RouteRead =
  | { readonly kind: "OPEN"; readonly route: RouteFacts }
  | { readonly kind: "NO_SETTING"; readonly detail: string }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

const BUILD_ID = "immortalis-chat-route-readback";

const intentOf = (f: { provenance: { intent_id: string } } | undefined): string =>
  f?.provenance.intent_id ?? "";

/** the facts of one open, before the commit state of any probed identity is read */
export type RouteFactsRead = Omit<RouteFacts, "landed">;

/**
 * Reads the whole route from one owner-verified open of the campaign (and closes it). `probe` names the publication identities whose
 * commit state is wanted: either fixed, or derived from the very facts this open just read (so a stage's identity, which depends on the
 * committed facts, is probed without a second open).
 */
export async function readRoute(
  config: PhoneConfig,
  probe: RouteProbe | ((facts: RouteFactsRead) => RouteProbe) = {},
): Promise<RouteRead> {
  const open = await openCharacterCampaign(config, BUILD_ID);
  if (!open.ok) {
    const s = open.state;
    if (s.kind === "NO_SETTING") return { kind: "NO_SETTING", detail: s.detail };
    if (s.kind === "BLOCKED") return { kind: "BLOCKED", code: s.code, detail: s.detail };
    if (s.kind === "UNAVAILABLE") return { kind: "UNAVAILABLE", code: s.code, detail: s.detail };
    return { kind: "BLOCKED", code: "OPEN_REFUSED", detail: "the campaign could not be opened" };
  }
  const { campaign, keep } = open;
  try {
    const character = characterStateOf(campaign, config, open.pin, keep);
    if (character.kind === "NO_SETTING") return { kind: "NO_SETTING", detail: character.detail };
    if (character.kind === "BLOCKED" || character.kind === "UNAVAILABLE")
      return { kind: character.kind, code: character.code, detail: character.detail };
    const setting = readLocality(campaign, config.campaignId, open.pin);
    if (setting.kind !== "READY")
      return {
        kind: "BLOCKED",
        code: "SETTING_BLOCKED",
        detail: "the original setting is not established",
      };
    const worldId = setting.readback.world_id;
    const source = campaign.sourceCondition(worldId, setting.readback.source_key);
    const world = campaign.world(worldId);
    if (!source || !world)
      return {
        kind: "BLOCKED",
        code: "SETTING_BLOCKED",
        detail: "the setting's facts are not held",
      };
    const adapter = new PcCollectionAdapter(campaign.store);
    const ids = technicalIds(config);
    const facts = campaign.store.listFacts();
    const localSources = facts.filter(
      (f) =>
        f.facet === "world_source_condition" &&
        (
          f.value as {
            locality?: { world?: { entity_id?: string }; locus?: { entity_id?: string } };
          }
        ).locality?.world?.entity_id === worldId &&
        (f.value as { locality?: { locus?: { entity_id?: string } } }).locality?.locus
          ?.entity_id === setting.readback.locus_id,
    );
    if (localSources.length !== 1)
      return {
        kind: "BLOCKED",
        code: "SOURCE_SCOPE_UNSUPPORTED",
        detail:
          "the locality's source set changed; this bounded one-source route cannot replay the earlier declaration",
      };
    const original_only = (() => {
      const worlds = facts.filter((f) => /^world\/[^/]+\/profile$/.test(f.key));
      return (
        worlds.length > 0 &&
        worlds.every(
          (f) =>
            (f.value as { reference_causal_basis?: { mode?: unknown } }).reference_causal_basis
              ?.mode === "ORIGINAL",
        )
      );
    })();
    const clock = campaign.store.getFact(TEMPORAL_STATE_KEY);
    const state = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
    const pcId = character.kind === "BOUND" ? character.pc_id : null;
    const contract =
      character.kind === "RELEASED_UNBOUND" || character.kind === "BOUND"
        ? character.contract
        : null;

    let custody: RouteFacts["custody"] = null;
    let clarification: RouteFacts["clarification"] = null;
    let collection_commitment = false;
    let preparation: PreparationFacts = { mechanism: null, reserve: null, basis: null };
    let attestation: RouteFacts["attestation"] = null;
    if (pcId !== null) {
      if (campaign.pcPhysicalLocusCustody(pcId))
        custody = {
          problems:
            keep === null
              ? ["no keep is on record"]
              : custodyProblems(campaign, config.campaignId, pcId, keep),
        };
      const held = adapter.clarification(pcId, pcClarificationIdOf(pcId));
      if (held)
        clarification = {
          clarification_id: held.value.clarification_id,
          statements: held.value.claims.map((c) => c.statement),
        };
      // the shipped clarification refuses once ANY collection commitment of the character exists (a clarification retrofits no act)
      collection_commitment = facts.some(
        (f) => f.key.startsWith(`pc/${pcId}/collection/`) && f.key.endsWith("/commitment"),
      );
      const mech = adapter.mechanism(pcId, ids.mechanism_id);
      const reserve = campaign.store.getFact(productionReserveKey(ids.reserve_id));
      const basis = campaign.store.getFact(productionExtractionBasisKey(ids.basis_id));
      // Presence under a service-derived key is insufficient: an operator may already have
      // installed a different, otherwise valid preparation. Check the same subject/source/unit
      // relationships the shipped preparation and preflight require, without another open.
      const rv = reserve ? ProductionReserveSchema.safeParse(reserve.value) : null;
      const bv = basis ? ExtractionBasisSchema.safeParse(basis.value) : null;
      const atSource = (locality: { world: { entity_id: string }; locus: { entity_id: string } }) =>
        locality.world.entity_id === worldId &&
        locality.locus.entity_id === setting.readback.locus_id;
      const unit = source.value.establishment.quantity.unit;
      const pc = campaign.store.getFact(pcExistenceContractKey(pcId));
      if (
        (mech &&
          (mech.value.pc_id !== pcId ||
            mech.value.authored_from.contract.fact_key !== pc?.key ||
            mech.value.authored_from.contract.version !== pc?.version ||
            (state?.success &&
              mech.value.cycle.duration.unit !== state.data.canonical_time.unit))) ||
        (reserve &&
          (!rv?.success ||
            !atSource(rv.data.locality) ||
            rv.data.quantity.unit !== unit ||
            rv.data.established.amount !== 0 ||
            rv.data.material_class !== source.value.material_class)) ||
        (basis &&
          (!bv?.success ||
            !atSource(bv.data.locality) ||
            bv.data.source.fact_key !== source.fact.key ||
            bv.data.source.source_key !== source.value.source_key ||
            bv.data.unit !== unit ||
            bv.data.material_class !== source.value.material_class))
      )
        return {
          kind: "BLOCKED",
          code: "PREPARATION_ALIGNMENT",
          detail: "the held preparation does not match this character, source, locality and unit",
        };
      preparation = {
        mechanism: mech ? { version: mech.fact.version, intent: intentOf(mech.fact) } : null,
        reserve: reserve ? { intent: intentOf(reserve) } : null,
        basis: basis ? { intent: intentOf(basis) } : null,
      };
      const att = mech ? adapter.attestation(pcId, ids.mechanism_id) : undefined;
      attestation = att ? { current: att.value.mechanism.version === mech!.fact.version } : null;
    }
    const closure = adapter.sceneClosure(worldId, setting.readback.locus_id);
    const scope = adapter.workforceScope(worldId, setting.readback.locus_id);
    const read: RouteFactsRead = {
      package_residue:
        campaign.store.residue.journal_tail_bytes > 0 ||
        campaign.store.residue.other_files.length > 0,
      character,
      setting: setting.readback,
      source: {
        world_id: worldId,
        locus_id: setting.readback.locus_id,
        source_key: source.value.source_key,
        material_class: source.value.material_class,
        unit: source.value.establishment.quantity.unit,
        access_facts: source.value.access_facts.map((a) => ({
          aspect: a.aspect,
          statement: a.statement,
        })),
      },
      keep,
      original_only,
      time: state?.success ? { canonical_time: state.data.canonical_time } : null,
      custody,
      collection_commitment,
      clarification,
      claims: contract ? acceptedClaims(contract) : [],
      contract,
      preparation,
      declaration: {
        closure:
          closure &&
          campaign.store.getFact(worldSceneClosureKey(worldId, setting.readback.locus_id))
            ? {
                version: closure.fact.version,
                current: adapter.sceneClosureIsCurrent(worldId, setting.readback.locus_id),
                domain: closure.value.domain,
                closure: closure.value.closure,
                rights: closure.value.source_rights,
                intent: intentOf(closure.fact),
              }
            : null,
        scope:
          scope && campaign.store.getFact(popWorkforceScopeKey(worldId, setting.readback.locus_id))
            ? {
                version: scope.fact.version,
                current: adapter.workforceScopeIsCurrent(worldId, setting.readback.locus_id),
                scope: scope.value.scope,
                intent: intentOf(scope.fact),
              }
            : null,
      },
      attestation,
      ids,
    };
    const wanted = typeof probe === "function" ? probe(read) : probe;
    const landed = new Map<string, boolean>();
    for (const intent of wanted.intents ?? [])
      landed.set(intent, campaign.store.committedGroup(intent) !== null);
    const route: RouteFacts = { ...read, landed };
    return { kind: "OPEN", route };
  } catch {
    return {
      kind: "UNAVAILABLE",
      code: "READ_FAILED",
      detail: "the campaign could not be read now",
    };
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

// -- what each stage's identity probes ----------------------------------------------------------------------------------------------

const PREP_STEPS = ["mechanism", "reserve", "basis"] as const;
export const chronologyIntent = (digest: string): string => `starting-chronology:${digest}:intent`;
export const preparationIntent = (digest: string, step: (typeof PREP_STEPS)[number]): string =>
  `collection-preparation:${digest}:${step}:intent`;

/** the publication identities whose commit state decides what became of ONE stage */
export function probeOf(id: StageIdentity): RouteProbe {
  switch (id.kind) {
    case "CHRONOLOGY":
      return { intents: [chronologyIntent(id.setup.publication_digest)] };
    case "PREPARE":
      return {
        intents: PREP_STEPS.map((s) => preparationIntent(id.setup.publication_digest, s)),
      };
    default:
      return {};
  }
}

// -- what became of one dispatched stage ------------------------------------------------------------------------------------------------

/**
 *   NO_EFFECT    nothing of this stage landed (proven; it is not "unknown"): a decline, a refusal, a referee that had not answered, or an
 *                interruption before the first write. The stage may simply be offered again; its confirmation is always asked afresh.
 *   PARTIAL      some, but not all, of the stage's separate owner publications landed: the SAME retained input, run again with its own
 *                fresh confirmation, finishes exactly what is missing.
 *   COMPLETE     everything the stage makes is committed, current and agrees with the input.
 *   STALE        the stage was committed and an owner's later change supersedes it (a declaration whose coverage moved): the author must
 *                declare again, with a new confirmation.
 *   BLOCKED      present but not reconcilable by any rerun (a foreign or conflicting identity): engineering must inspect it.
 *   UNAVAILABLE  could not be read now (a lock, an unreadable record): neither done nor not done.
 */
export type StageOutcome =
  | { readonly kind: "NO_EFFECT"; readonly detail: string }
  | { readonly kind: "PARTIAL"; readonly landed: readonly string[] }
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "STALE"; readonly detail: string }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

const blocked = (code: string, detail: string): StageOutcome => ({ kind: "BLOCKED", code, detail });

/** the shipped `declare-closed-setting`'s authored rights, as it derives them (so "already declared" is judged by its own test) */
function declaredShape(doc: string, campaignId: string) {
  void campaignId;
  const parsed = ClosedSettingSchema.safeParse(JSON.parse(doc));
  if (!parsed.success) return null;
  const d = parsed.data;
  const rights = d.source_rights
    .map((r) => ({
      source_fact_key: worldSourceConditionKey(d.world_id, r.source_key),
      ground: r.ground,
    }))
    .sort((a, b) => (a.source_fact_key < b.source_fact_key ? -1 : 1));
  return { d, rights };
}

/** the declaration's two owners against one exact document: done = equal to it AND current, exactly the shipped command's own test */
export function declarationDone(
  facts: DeclarationFacts,
  document: string,
  campaignId: string,
): { closure: boolean; scope: boolean; written: boolean } | null {
  const shape = declaredShape(document, campaignId);
  if (!shape) return null;
  const { d, rights } = shape;
  const closureEqual =
    facts.closure !== null &&
    canonicalEqual(
      { domain: facts.closure.domain, closure: facts.closure.closure },
      { domain: d.domain, closure: d.closure },
    ) &&
    canonicalEqual(
      (facts.closure.rights as { source_fact_key: string; ground: string }[]).map((r) => ({
        source_fact_key: r.source_fact_key,
        ground: r.ground,
      })),
      rights,
    );
  const scopeEqual = facts.scope !== null && canonicalEqual(facts.scope.scope, d.workforce_scope);
  return {
    closure: closureEqual && facts.closure!.current,
    scope: scopeEqual && facts.scope!.current,
    written: closureEqual || scopeEqual,
  };
}

/** Classifies what became of ONE dispatched stage from a read taken with that stage's probe. FINISH is judged by its own module. */
export function stageOutcome(read: RouteRead, id: StageIdentity, campaignId: string): StageOutcome {
  if (read.kind === "NO_SETTING")
    return { kind: "UNAVAILABLE", code: "SETTING_ABSENT", detail: read.detail };
  if (read.kind === "BLOCKED") return { kind: "BLOCKED", code: read.code, detail: read.detail };
  if (read.kind === "UNAVAILABLE") return read;
  const r = read.route;
  switch (id.kind) {
    case "LOCUS": {
      if (r.setting.world_id !== id.world_id || r.setting.locus_id !== id.locus_id)
        return blocked(
          "SETTING_CHANGED",
          "the verified setting is not the one this operation was dispatched against",
        );
      if (r.character.kind !== "BOUND" || r.character.pc_id !== id.pc_id)
        return blocked(
          "CHARACTER_IDENTITY",
          "the character held is not the one this operation was dispatched for",
        );
      if (r.custody === null)
        return { kind: "NO_EFFECT", detail: "no physical custody was committed for the character" };
      return r.custody.problems.length === 0
        ? { kind: "COMPLETE" }
        : blocked("CUSTODY_CONFLICT", r.custody.problems.join("; "));
    }
    case "CHRONOLOGY": {
      const landed = r.landed.get(chronologyIntent(id.setup.publication_digest)) === true;
      if (landed && r.time !== null) return { kind: "COMPLETE" };
      if (r.time !== null)
        return {
          kind: "NO_EFFECT",
          detail: "canonical time already has another origin; this chronology changed nothing",
        };
      return landed
        ? blocked("TIME_UNREADABLE", "the chronology is committed but no canonical time is held")
        : { kind: "NO_EFFECT", detail: "no starting chronology was committed" };
    }
    case "CLARIFY": {
      if (r.character.kind !== "BOUND" || r.character.pc_id !== id.pc_id)
        return blocked(
          "CHARACTER_IDENTITY",
          "the character held is not the one this operation was dispatched for",
        );
      if (r.clarification === null)
        return { kind: "NO_EFFECT", detail: "no clarification was committed" };
      return r.clarification.statements.length === 1 && r.clarification.statements[0] === id.words
        ? { kind: "COMPLETE" }
        : {
            kind: "NO_EFFECT",
            detail: "the character's cycle is already closed by other accepted words",
          };
    }
    case "PREPARE": {
      const digest = id.setup.publication_digest;
      const held = PREP_STEPS.filter((s) => r.landed.get(preparationIntent(digest, s)) === true);
      if (held.length === PREP_STEPS.length) {
        // each publication also stands where its owner holds it
        const stand =
          r.preparation.mechanism?.intent === preparationIntent(digest, "mechanism") &&
          r.preparation.reserve?.intent === preparationIntent(digest, "reserve") &&
          r.preparation.basis?.intent === preparationIntent(digest, "basis");
        return stand
          ? { kind: "COMPLETE" }
          : blocked(
              "PREPARATION_CONFLICT",
              "the committed preparation publications are not held where this preparation put them",
            );
      }
      return held.length === 0
        ? { kind: "NO_EFFECT", detail: "no preparation publication was committed" }
        : { kind: "PARTIAL", landed: held };
    }
    case "DECLARE": {
      if (r.setting.world_id !== id.world_id || r.setting.locus_id !== id.locus_id)
        return blocked(
          "SETTING_CHANGED",
          "the verified setting is not the one this operation was dispatched against",
        );
      const done = declarationDone(r.declaration, id.document, campaignId);
      if (done === null)
        return blocked("DECLARATION_INVALID", "the retained declaration is invalid");
      if (done.closure && done.scope) return { kind: "COMPLETE" };
      if (done.closure !== done.scope) {
        const landed = done.closure ? ["closure"] : ["workforce scope"];
        return { kind: "PARTIAL", landed };
      }
      // neither half stands: either nothing landed, or what landed has since been superseded by an owner's change
      const wrote =
        r.declaration.closure?.intent.startsWith(`closed-setting:${id.digest}:`) === true ||
        r.declaration.scope?.intent.startsWith(`closed-setting:${id.digest}:`) === true;
      return wrote
        ? {
            kind: "STALE",
            detail:
              "the declaration was committed and an owner's later change has made it stale; it must be declared again",
          }
        : { kind: "NO_EFFECT", detail: "no declaration publication was committed" };
    }
    case "FINISH":
      return blocked("NOT_JUDGED_HERE", "the finishing stage is judged by its own evidence");
  }
}

/** the owner-verified account of whether the character's cycle can still be clarified, and whether it needs to be */
export function clarificationNeed(
  r: RouteFactsRead,
): "DONE" | "NOT_NEEDED" | "NEEDED" | "CLOSED" | "WAITING" {
  if (r.clarification !== null) return "DONE";
  if (r.preparation.mechanism !== null) return "NOT_NEEDED";
  if (r.collection_commitment) return "CLOSED";
  if (r.time === null) return "WAITING";
  const unit = r.time.canonical_time.unit;
  return r.claims.some((c) => statesNumberAndUnit(c.statement, unit)) ? "NOT_NEEDED" : "NEEDED";
}
