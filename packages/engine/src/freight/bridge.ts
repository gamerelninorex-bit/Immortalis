import {
  GM_ADJUDICATION_AUTHORITY,
  GM_FREIGHT_AUDIENCE,
  GM_FREIGHT_INPUT_INVALID,
  GM_FREIGHT_INTENT_CONFLICT,
  GM_FREIGHT_OUTCOME_UNKNOWN,
  GM_FREIGHT_OUTCOME_UNKNOWN_MESSAGE,
  GM_FREIGHT_REFUSED,
  GM_FREIGHT_REQUEST_SCHEMAS,
  GM_FREIGHT_TOOLS,
  GM_FREIGHT_UNAVAILABLE,
  GM_FREIGHT_UNAVAILABLE_MESSAGE,
  GovernanceInstrumentSchema,
  InputLotPremiseSchema,
  LegalPremiseSchema,
  MaterialSpecificationPremiseSchema,
  OpeningAttestationSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  ServicePremiseSchema,
  SiteConditionPremiseSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  corridorOfInput,
  EconomyOriginAllocationSchema,
  economyFreightCargoSlotKey,
  economyFreightCloseKey,
  economyFreightRequestRef,
  economyOriginRequestId,
  economyRequestKey,
  fail,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  logisticsCommitmentKey,
  logisticsObjectId,
  logisticsTransferKey,
  ok,
  productionInputLotKey,
  productionMaterialSpecificationKey,
  productionObjectId,
  productionOutputReference,
  worldCorridorKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type GmAttestOpeningRequest,
  type GmEstablishLegalRequest,
  type GmEstablishSettingRequest,
  type GmFreightAwaiting,
  type GmFreightErrorCode,
  type GmFreightReceipt,
  type GmFreightReconciliation,
  type GmFreightStatus,
  type GmFreightStep,
  type GmFreightTool,
  type GmInitiateRequest,
  type GmReportSiteChangeRequest,
  type GmWithdrawRequest,
  type InputLotPremise,
  type LegalPremise,
  type LogisticsCommitment,
  type LogisticsTransfer,
  type MaterialSpecificationPremise,
  type OpeningAttestation,
  type OpeningSlice,
  type Publication,
  type Result,
  type ServicePremise,
  type SiteConditionPremise,
  type WorldLocus,
  type WorldProfile,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { GipAdapter } from "../gip/adapter.ts";
import { logisticsDeliveryProvider, logisticsRetirementProvider } from "../logistics/provider.ts";
import { logisticsTemporalObject } from "../logistics/declaration.ts";
import { productionTemporalObject } from "../production/declaration.ts";
import { ProductionAdapter } from "../production/adapter.ts";
import { productionCompletionProvider } from "../production/provider.ts";
import { StageProviderRegistry } from "../temporal/providers.ts";
import { TemporalCoordinator } from "../temporal/coordinator.ts";
import { worldEntityTransitionProvider } from "../world/entity-transition-provider.ts";
import { worldFallbackAcceptanceProvider } from "../world/fallback-custody.ts";
import type { CanonicalCampaign } from "../world/canonical-campaign.ts";
import { freightWorkCounters, storeSource } from "./common.ts";
import { EconomyFreightAdapter, economyFreightReceiptProvider } from "./economy.ts";
import { deriveOriginSelfProvision, profileScope } from "./economy-derive.ts";
import { GipFreightAdapter } from "./gip.ts";
import { LogisticsFreightAdapter } from "./logistics.ts";
import { ProductionFreightAdapter } from "./production.ts";
import { WorldFreightAdapter } from "./world.ts";

/**
 * ROADBED GM-native first-profile freight bridge — the TRUSTED side (BLUE v6.2 Continuation Preflight, GM-Native First Freight Bridge).
 *
 * This module is the engine half of a host-neutral transport for a compatible AI GM. It is a ROUTER AND SEQUENCER over the
 * EXISTING first-profile owner adapters and nothing else: it holds no fact, decides no rule, writes no key itself and adds no
 * owner, facet, kind, stage, clause, status or legal meaning. Every owner commit is an ordinary, discrete, separately admitted
 * owner act through `WorldFreightAdapter` / `GipAdapter` / `GipFreightAdapter` / `ProductionFreightAdapter` / `ProductionAdapter` /
 * `EconomyFreightAdapter` / `LogisticsFreightAdapter` / `TemporalCoordinator.registerObject` / `CanonicalCampaign.establish*`, each
 * re-derived by IM-11 admission from committed state. The model is never a canonical owner: it states premises and asks; the owners
 * derive, commit or refuse. There is no argument by which a caller can state an outcome, a status, a verdict, a role or a
 * permission.
 *
 * AUTHORITY. A request never carries authority. The GM's `role.gm` + `permission.rule.adjudicate` (the only GM provenance the
 * existing contract knows) is stated HERE, by trusted code, into the authored fields that need it (`authored_under`), after the
 * transport has authenticated the host and bound a session. A session is an opaque frozen handle held in a module-private
 * registry: an object a host fabricated is not a session and every operation refuses it with the one unavailable refusal.
 * Canonical publication stays under the engine's own archivist authority (the adapters), distinct from the GM's authorship.
 *
 * TIME is never this lane's to give. The bridge cannot originate canonical time and cannot advance it: the starting chronology is
 * the operator's (`initialize-time`) and every advance is the player's own out-of-character choice through the existing NULL-PC
 * gateway. The bridge reports what it is waiting for and whose it is.
 *
 * IDENTITY. Every owner act is published under a deterministic identity derived from the host's retry token and the act's name
 * (`gmf:<operation_id>:<step>`). The same token and terms replay what committed (the owner returns the ORIGINAL receipt, RC-16);
 * the same token with changed terms is the owner's `INTENT_CONFLICT`; nothing here retries blindly, and an unknown outcome is
 * reported as such, never as failure.
 */

// ---------------------------------------------------------------------------------------------
// Trusted session
// ---------------------------------------------------------------------------------------------

/** An opaque, frozen handle. It carries and reveals nothing; its meaning lives only in the module-private registry below. */
export interface TrustedGmFreightSession {
  readonly __trusted_gm_freight_session: never;
}

interface SessionBinding {
  readonly campaign: CanonicalCampaign;
  readonly hostId: string;
}
const sessions = new WeakMap<object, SessionBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. The caller (the authenticated transport) has ALREADY proved the host,
 * the operating-system owner and the campaign, and holds the campaign open under its single-writer lock. Calling this is that
 * code's attestation, nothing more: it is not an identity proof, and the owners still re-judge every act.
 */
export function bindTrustedGmFreightSession(trusted: {
  readonly campaign: CanonicalCampaign;
  readonly hostId: string;
}): TrustedGmFreightSession {
  const handle = Object.freeze({}) as TrustedGmFreightSession;
  sessions.set(handle, Object.freeze({ campaign: trusted.campaign, hostId: trusted.hostId }));
  return handle;
}

/** The registry of owner stage providers the first freight profile's own chain needs (the same set the proofs register). */
export const freightStageProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    economyFreightReceiptProvider,
  ]);

// ---------------------------------------------------------------------------------------------
// Result plumbing
// ---------------------------------------------------------------------------------------------

export type GmFreightValue = GmFreightReceipt | GmFreightStatus | GmFreightReconciliation;
export type GmFreightResult = Result<GmFreightValue, GmFreightErrorCode>;

type StepResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly replayed: boolean;
        readonly receipt: { readonly revision: number };
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };

const BASIS = "gm-freight-bridge";
const SECRECY = "gm-owner-consultation";

/** Whether the owner already holds exactly this authored content (an absent fact is never equal to anything). */
const same = (held: unknown, wanted: unknown): boolean =>
  held !== undefined && canonicalEqual(held, wanted);

/**
 * One part of an act identity, encoded INJECTIVELY and reversibly (BLUE R-1): every character outside `[A-Za-z0-9.-]`, including the
 * escape character `_` itself, becomes `_<hex code point>_`. Distinct identities therefore can never share an encoding (`cond:a` is
 * `cond_3a_a`, `cond_a` is `cond_5f_a`), and the encoding contains neither `:` nor `@`, the two separators below.
 */
export const encodeIdPart = (s: string): string =>
  [...s]
    .map((ch) => (/[A-Za-z0-9.-]/.test(ch) ? ch : `_${ch.codePointAt(0)!.toString(16)}_`))
    .join("");

/** The name of one owner act: a fixed stem, plus (for an act on a particular source identity) `@` and that identity encoded. */
export const stepName = (stem: string, dynamic?: string): string =>
  dynamic === undefined ? stem : `${stem}@${encodeIdPart(dynamic)}`;

/**
 * The durable identity of one owner act: DOMAIN-SEPARATED by the host's token, the world and the act, joined with `:`. The token cannot
 * contain `:` (its schema), and neither the encoded world nor a step name can, so the join is unambiguous: two different acts, in two
 * different worlds or on two different source identities, never share a group or intent identity.
 */
export const gmFreightActIdentity = (
  operationId: string,
  worldId: string,
  step: string,
): Publication => ({
  group_id: `gmf:${operationId}:${encodeIdPart(worldId)}:${step}:group`,
  intent_id: `gmf:${operationId}:${encodeIdPart(worldId)}:${step}:intent`,
  cause: `gm-freight:${step}`,
  basis: BASIS,
  secrecy: SECRECY,
});

/** An owner refusal's detail, bounded: the GM needs the reason, not an unbounded dump. */
function bounded(details: unknown): unknown {
  if (details === undefined) return undefined;
  try {
    const text = JSON.stringify(details);
    return text.length <= 1500 ? details : { truncated: true, excerpt: text.slice(0, 1500) };
  } catch {
    return { truncated: true };
  }
}

interface Halt {
  readonly kind: "REFUSED" | "CONFLICT" | "UNKNOWN";
  readonly step: string;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

class Run {
  readonly steps: GmFreightStep[] = [];
  halt: Halt | undefined;
  awaiting: GmFreightAwaiting | null = null;
}

const classify = (code: string): Halt["kind"] =>
  code === "INTENT_CONFLICT"
    ? "CONFLICT"
    : code === "UNKNOWN_OUTCOME" || code === "STORE_POISONED" || code === "STORE_CLOSED"
      ? "UNKNOWN"
      : "REFUSED";

// ---------------------------------------------------------------------------------------------
// The campaign context: the existing adapters over the one store
// ---------------------------------------------------------------------------------------------

class Ctx {
  readonly campaign: CanonicalCampaign;
  readonly store: CanonicalCampaign["store"];
  readonly world: WorldFreightAdapter;
  readonly gip: GipAdapter;
  readonly gipFreight: GipFreightAdapter;
  readonly production: ProductionAdapter;
  readonly productionFreight: ProductionFreightAdapter;
  readonly economy: EconomyFreightAdapter;
  readonly logistics: LogisticsFreightAdapter;
  readonly coordinator: TemporalCoordinator;
  constructor(campaign: CanonicalCampaign) {
    this.campaign = campaign;
    this.store = campaign.store;
    this.world = new WorldFreightAdapter(campaign.store);
    this.gip = new GipAdapter(campaign.store);
    this.gipFreight = new GipFreightAdapter(campaign.store);
    this.production = new ProductionAdapter(campaign.store);
    this.productionFreight = new ProductionFreightAdapter(campaign.store);
    this.economy = new EconomyFreightAdapter(campaign.store);
    this.logistics = new LogisticsFreightAdapter(campaign.store);
    this.coordinator = new TemporalCoordinator(campaign.store, freightStageProviders());
  }

  get nullPc(): boolean {
    return this.store.getFact(PLAYER_CHARACTER_BINDING_KEY) === undefined;
  }

  canonicalTime(): CanonicalTime | null {
    const fact = this.store.getFact(TEMPORAL_STATE_KEY);
    const parsed = fact ? TemporalStateSchema.safeParse(fact.value) : undefined;
    return parsed?.success ? parsed.data.canonical_time : null;
  }

  /**
   * Performs ONE owner act under its deterministic identity. If this very act already committed under this token it is
   * re-presented to its owner (RC-16: the original receipt comes back); otherwise, when the owner already holds exactly the
   * authored content (committed under another token) nothing is written; otherwise the owner judges it. Returns false to stop.
   */
  async perform(
    run: Run,
    step: string,
    owner: string,
    operationId: string,
    worldId: string,
    op: (pub: Publication) => Promise<StepResult>,
    present?: () => boolean,
  ): Promise<boolean> {
    const pub = gmFreightActIdentity(operationId, worldId, step);
    gmFreightWorkCounters.owner_acts_attempted++;
    if (this.store.committedGroup(pub.intent_id) === null && present?.()) {
      run.steps.push({ step, owner, disposition: "ALREADY_PRESENT", revision: null });
      return true;
    }
    let result: StepResult;
    try {
      result = await op(pub);
    } catch {
      // an exception after anything may have committed is never "safely absent"
      run.halt = {
        kind: "UNKNOWN",
        step,
        code: "UNKNOWN_OUTCOME",
        message: GM_FREIGHT_OUTCOME_UNKNOWN_MESSAGE,
      };
      return false;
    }
    if (result.ok) {
      run.steps.push({
        step,
        owner,
        disposition: result.value.replayed ? "REPLAYED" : "COMMITTED",
        revision: result.value.receipt.revision,
      });
      return true;
    }
    const details = bounded(result.error.details);
    run.halt = {
      kind: classify(result.error.code),
      step,
      code: result.error.code,
      message: result.error.message,
      ...(details !== undefined ? { details } : {}),
    };
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Reading the sealed envelope and the position of the chain (exact-key reads only; no scan)
// ---------------------------------------------------------------------------------------------

interface Typed<P> {
  readonly slice: OpeningSlice;
  readonly premise: P;
}

interface EnvelopeProblem {
  readonly slice_kind: string;
  readonly expected: string;
  readonly found: number;
}

interface Envelope {
  readonly attestation: OpeningAttestation;
  readonly legal: Typed<LegalPremise>[];
  readonly site: Typed<SiteConditionPremise>[];
  readonly spec: Typed<MaterialSpecificationPremise>[];
  readonly lot: Typed<InputLotPremise>[];
  readonly service: Typed<ServicePremise>[];
  /** how many slices of each kind the sealed envelope carries (typed or not) */
  readonly kinds: Readonly<Record<string, number>>;
  /** the slices whose premise is not the typed reading of their kind: they can never be admitted by any owner */
  readonly untyped: Readonly<Record<string, number>>;
}

function readEnvelope(c: Ctx, worldId: string): Envelope | undefined {
  const attested = c.world.attestation(worldId);
  if (!attested) return undefined;
  const parsed = OpeningAttestationSchema.safeParse(attested.fact.value);
  if (!parsed.success) return undefined;
  const untyped: Record<string, number> = {};
  const pick = <P>(
    kind: OpeningSlice["slice_kind"],
    schema: { safeParse(v: unknown): { success: true; data: P } | { success: false } },
  ): Typed<P>[] =>
    parsed.data.envelope.slices.flatMap((slice) => {
      if (slice.slice_kind !== kind) return [];
      const p = schema.safeParse(slice.premise);
      if (!p.success) untyped[kind] = (untyped[kind] ?? 0) + 1;
      return p.success ? [{ slice, premise: p.data }] : [];
    });
  const kinds: Record<string, number> = {};
  for (const slice of parsed.data.envelope.slices)
    kinds[slice.slice_kind] = (kinds[slice.slice_kind] ?? 0) + 1;
  return {
    attestation: parsed.data,
    legal: pick("legal", LegalPremiseSchema),
    site: pick("site_condition", SiteConditionPremiseSchema),
    spec: pick("material_specification", MaterialSpecificationPremiseSchema),
    lot: pick("input_lot", InputLotPremiseSchema),
    service: pick("service_premise", ServicePremiseSchema),
    kinds,
    untyped,
  };
}

/**
 * What the irreversible seal must already carry for this profile to be able to proceed at all (BLUE R-2, R-6). Each line states the rule it
 * mirrors; none is new source law:
 *   - exactly one `legal` slice: GIP's `legalSource` refuses none and refuses more than one governing order;
 *   - exactly one `site_condition` and one `material_specification`: Economy's `profileScope` withholds anything else;
 *   - at least one `input_lot`: Economy's C-05 selects the lot by content and needs one that qualifies (exactly which is the OWNER's call
 *     after the seal; a tie or none is the owner's refusal, never a Builder choice);
 *   - exactly one `service_premise`: the sources name no rule by which one of several service premises serves a request, so the bridge does
 *     NOT choose (an open source question for BLUE, RED and the Sovereign, not a Builder decision).
 */
export function envelopeProblems(
  kinds: Readonly<Record<string, number>>,
  untyped: Readonly<Record<string, number>> = {},
): EnvelopeProblem[] {
  const found = (k: string) => kinds[k] ?? 0;
  const problems: EnvelopeProblem[] = [];
  for (const k of ["legal", "site_condition", "material_specification", "service_premise"])
    if (found(k) !== 1) problems.push({ slice_kind: k, expected: "exactly 1", found: found(k) });
  if (found("input_lot") < 1)
    problems.push({ slice_kind: "input_lot", expected: "at least 1", found: found("input_lot") });
  for (const [k, n] of Object.entries(untyped))
    if (n > 0) problems.push({ slice_kind: k, expected: "a typed premise of its kind", found: n });
  return problems;
}

const MILESTONES = [
  "setting_established",
  "opening_attested",
  "canonical_time_established",
  "legal_sealed",
  "premises_admitted",
  "origin_self_provision_fixed",
  "production_started",
  "production_registered",
  "output_accepted",
  "freight_request_fixed",
  "service_basis_admitted",
  "service_committed_l0",
  "first_dispatch_l1_f3",
  "directive_use_consumed_e1",
  "transfer_enrolled_te",
  "received_er",
  "destination_adequacy_ad",
] as const;

interface Position {
  readonly worldId: string;
  readonly envelope: Envelope | undefined;
  readonly milestones: Record<(typeof MILESTONES)[number], boolean>;
  readonly sealId: string | undefined;
  readonly requestRef: string | undefined;
  readonly allocationStatus: string | undefined;
  readonly closed: boolean;
  readonly next: Next;
}

type NotActionable = Extract<GmFreightAwaiting, { kind: "NOT_ACTIONABLE" }>;

type Next =
  | {
      readonly kind: "act";
      readonly step: string;
      readonly owner: string;
      readonly run: (pub: Publication) => Promise<StepResult>;
    }
  | { readonly kind: "await"; readonly awaiting: GmFreightAwaiting }
  /** nothing can lawfully proceed, and nothing the GM authors changes it: reported honestly, never as an actionable step */
  | {
      readonly kind: "blocked";
      readonly step: string;
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
      readonly awaiting: NotActionable;
    }
  /** an OWNER's own refusal found by a pure derivation BEFORE any write; the owner decides, and its words are reported */
  | {
      readonly kind: "refused";
      readonly step: string;
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
    }
  | { readonly kind: "done" };

const gmAuthoring = (tool: GmFreightTool, note: string): Next => ({
  kind: "await",
  awaiting: { kind: "GM_AUTHORING", tool, note },
});

const blocked = (
  step: string,
  code: string,
  message: string,
  problems: readonly EnvelopeProblem[],
  details?: unknown,
): Next => ({
  kind: "blocked",
  step,
  code,
  message,
  ...(details !== undefined ? { details } : {}),
  awaiting: { kind: "NOT_ACTIONABLE", reason: code, problems, note: message },
});

/**
 * Every request of a profile, oldest first, found by following the OWNER's own cargo-slot identity (BLUE R-7): a request is claimed at
 * the slot's version (`freight:<seal>:<version>`), so each one is among versions 1..the slot's current version. The history is as long
 * as the owners made it: no fixed count truncates it.
 */
function requestChain(c: Ctx, sealId: string, worldId: string, entityId: string): string[] {
  const slot = c.store.getFact(economyFreightCargoSlotKey(worldId, entityId));
  const refs: string[] = [];
  for (let v = 1; v <= (slot?.version ?? 0); v++) {
    const ref = economyFreightRequestRef(sealId, v);
    if (c.economy.freightRequest(ref)) refs.push(ref);
  }
  return refs;
}

function position(c: Ctx, worldId: string): Position {
  gmFreightWorkCounters.position_reads++;
  const envelope = readEnvelope(c, worldId);
  const worldKey = worldProfileKey(worldId);
  const m = Object.fromEntries(MILESTONES.map((k) => [k, false])) as Position["milestones"];
  m.setting_established = c.store.getFact(worldKey) !== undefined;
  m.opening_attested = envelope !== undefined;
  m.canonical_time_established = c.canonicalTime() !== null;
  // exactly one governing order is the owner's rule (GIP `legalSource`), so this is a lookup, not a selection
  const legal = envelope?.legal.length === 1 ? envelope.legal[0]!.premise : undefined;
  const sealId = legal?.basis_id;
  m.legal_sealed = sealId !== undefined && c.gipFreight.readinessSeal(sealId) !== undefined;
  const base = {
    worldId,
    envelope,
    sealId,
    requestRef: undefined,
    allocationStatus: undefined,
    closed: false,
    milestones: m,
  };
  const early = (next: Next): Position => ({ ...base, next });
  if (!m.setting_established)
    return early(gmAuthoring(GM_FREIGHT_TOOLS.establishSetting, "state the original setting"));
  if (!envelope)
    return early(
      gmAuthoring(
        GM_FREIGHT_TOOLS.attestOpening,
        "attest the whole original envelope, once; it cannot be amended afterwards",
      ),
    );
  // an envelope that cannot carry the profile is final: it was sealed once and is never re-attested (BLUE R-2)
  const problems = envelopeProblems(envelope.kinds, envelope.untyped);
  if (problems.length > 0 || legal === undefined || sealId === undefined)
    return early(
      blocked(
        "envelope",
        "SEALED_ENVELOPE_CANNOT_CARRY_THE_PROFILE",
        "the original envelope is sealed and cannot be amended or attested again, and it does not carry what this profile needs; nothing the GM can author changes that",
        problems,
      ),
    );
  if (!m.canonical_time_established) {
    const unit =
      envelope.lot[0]?.premise.dedicated_operation.completion_at.unit ??
      envelope.service[0]?.premise.delivery_boundary_at.unit ??
      null;
    return early({
      kind: "await",
      awaiting: {
        kind: "OPERATOR_STARTING_CHRONOLOGY",
        time_unit: unit,
        note: "the operator states the starting chronology with `initialize-time`, in the time unit the premises use; this lane cannot originate time",
      },
    });
  }
  if (!m.legal_sealed)
    return early(
      gmAuthoring(
        GM_FREIGHT_TOOLS.establishLegal,
        "establish the institution, office, Scope Binding and Instrument; the clauses and the seal follow from the sealed legal slice",
      ),
    );

  // -- the profile's own condition, prerequisite and lot, as the OWNERS select them (BLUE R-6): nothing is indexed, nothing is guessed -----
  const scope = profileScope(storeSource(c.store), sealId);
  if (!scope.ok)
    return early({
      kind: "refused",
      step: "profile-scope",
      code: scope.error.code,
      message: scope.error.message,
      ...(scope.error.details !== undefined ? { details: bounded(scope.error.details) } : {}),
    });
  const { conditionId, specificationId } = scope.value;
  const conditionSlice = envelope.site.find((s) => s.premise.condition_id === conditionId)!.slice;
  const specSlice = envelope.spec.find(
    (s) => s.premise.specification_id === specificationId,
  )!.slice;
  const specKey = productionMaterialSpecificationKey(specificationId);
  if (!c.world.siteCondition(worldId, conditionId))
    return early({
      kind: "act",
      step: stepName("site-condition", conditionSlice.slice_id),
      owner: "world_state",
      run: (pub) =>
        c.world.admitSiteCondition({
          ...pub,
          condition: { world_id: worldId, slice_id: conditionSlice.slice_id },
        }),
    });
  if (!c.productionFreight.materialSpecification(specificationId))
    return early({
      kind: "act",
      step: stepName("material-specification", specSlice.slice_id),
      owner: "production",
      run: (pub) =>
        c.productionFreight.admitMaterialSpecification({
          ...pub,
          premise: { world_id: worldId, slice_id: specSlice.slice_id },
        }),
    });

  // -- C-05 origin self-provision, then Production's own operation ------------------------------------------------------------
  const originRequestId = economyOriginRequestId(specificationId);
  const originRequestKey = economyRequestKey(originRequestId);
  const entityId = productionOutputReference(originRequestId);
  m.origin_self_provision_fixed = c.economy.originAllocation(specificationId) !== undefined;
  if (!m.origin_self_provision_fixed) {
    // Economy's own pure derivation says which input lot qualifies (exactly one, by content). Run before anything is written for a lot, it
    // answers either with the plan (the lot is admitted), with a refusal that names the qualifying lot not yet admitted, or with the owner's
    // refusal (a tie, none, a requirement that no longer stands): the last is reported with no write at all.
    const dry = deriveOriginSelfProvision(storeSource(c.store), sealId, specKey);
    if (!dry.ok) {
      const lotKey = (dry.error.details as { key?: unknown } | undefined)?.key;
      const lotSlice = envelope.lot.find((l) => productionInputLotKey(l.premise.lot_id) === lotKey);
      if (lotSlice && !c.productionFreight.inputLot(lotSlice.premise.lot_id))
        return early({
          kind: "act",
          step: stepName("input-lot", lotSlice.slice.slice_id),
          owner: "production",
          run: (pub) =>
            c.productionFreight.admitInputLot({
              ...pub,
              premise: { world_id: worldId, slice_id: lotSlice.slice.slice_id },
            }),
        });
      return early({
        kind: "refused",
        step: "c05-origin-self-provision",
        code: dry.error.code,
        message: dry.error.message,
        ...(dry.error.details !== undefined ? { details: bounded(dry.error.details) } : {}),
      });
    }
    const allocation = EconomyOriginAllocationSchema.parse(dry.value.writes[0]!.value);
    return early({
      kind: "act",
      step: "c05-origin-self-provision",
      owner: "economy",
      run: (pub) =>
        c.economy.resolveOriginSelfProvision({
          ...pub,
          resolution: { seal_id: sealId, owner_event: allocation.input_lot.fact_key },
        }),
    });
  }
  m.premises_admitted = true;
  const operation = c.production.operation(originRequestId);
  m.production_started = operation !== undefined;
  if (!operation)
    return early({
      kind: "act",
      step: "production-start",
      owner: "production",
      run: (pub) =>
        c.production.startOperation({
          ...pub,
          start: c.productionFreight.dedicatedStartInput(originRequestKey),
        }),
    });
  m.production_registered = c.coordinator.object(productionObjectId(originRequestId)) !== undefined;
  if (!m.production_registered)
    return early({
      kind: "act",
      step: "production-register",
      owner: "temporal",
      run: (pub) =>
        c.coordinator.registerObject({
          ...pub,
          object: productionTemporalObject(operation.value, {
            worldId,
            locusId: envelope.attestation.pins.origin.entity_id,
          }),
        }),
    });
  const entityKey = worldFallbackEntityKey(worldId, entityId);
  m.output_accepted = c.store.getFact(entityKey) !== undefined;
  if (!m.output_accepted)
    return early({
      kind: "await",
      awaiting: {
        kind: "PLAYER_OOC_TIME_ADVANCE",
        to: operation.value.timing.completion.at,
        reason: "PRODUCTION_COMPLETION_BOUNDARY",
        note: "Production's own operation completes at this boundary; time moves only by the player's out-of-character choice",
      },
    });

  // -- the fixed request (E0, or E2 after a proven unused close) -------------------------------------------------------------
  const refs = requestChain(c, sealId, worldId, entityId);
  const ref = refs[refs.length - 1];
  const close = ref ? c.economy.close(ref) : undefined;
  const allocation = ref ? c.economy.allocation(ref)?.value.state.status : undefined;
  const withRequest = { ...base, requestRef: ref, allocationStatus: allocation, closed: !!close };
  const lateEarly = (next: Next): Position => ({ ...withRequest, next });
  m.freight_request_fixed = ref !== undefined;
  if (ref === undefined)
    return lateEarly({
      kind: "act",
      step: "e0-fixation",
      owner: "economy",
      run: (pub) =>
        c.economy.resolveFreightFixation({
          ...pub,
          resolution: { seal_id: sealId, owner_event: entityKey },
        }),
    });
  if (close || allocation === "terminal")
    return lateEarly({
      kind: "act",
      step: stepName("e2-fixation-after", ref),
      owner: "economy",
      run: (pub) =>
        c.economy.resolveFreightFixation({
          ...pub,
          resolution: { seal_id: sealId, owner_event: economyFreightCloseKey(ref) },
        }),
    });
  if (allocation === "withdrawal-pending")
    return lateEarly(
      gmAuthoring(
        GM_FREIGHT_TOOLS.withdraw,
        "the request is withdrawal-pending: ask for the withdrawal to be closed",
      ),
    );

  // -- Integration I: the independently evidenced service, with fresh Economy status at each act ----------------------------
  // exactly one service premise is a precondition of the seal (envelopeProblems): this is a lookup, not a selection
  const serviceSlice = envelope.service[0]!;
  const service = serviceSlice.premise;
  m.service_basis_admitted = c.logistics.serviceBasis(service.basis_id) !== undefined;
  if (!m.service_basis_admitted)
    return lateEarly({
      kind: "act",
      step: "service-basis",
      owner: "logistics",
      run: (pub) =>
        c.logistics.admitServiceBasis({
          ...pub,
          service: { world_id: worldId, slice_id: serviceSlice.slice.slice_id },
        }),
    });
  const commitmentFact = c.store.getFact(logisticsCommitmentKey(worldId, entityId));
  const commitment = commitmentFact?.value as LogisticsCommitment | undefined;
  m.service_committed_l0 =
    commitment !== undefined && commitment.request.request_id === ref && !!commitment.freight;
  if (!m.service_committed_l0)
    return lateEarly({
      kind: "act",
      step: stepName("l0-service-admission", ref),
      owner: "logistics",
      run: (pub) =>
        c.logistics.admitService({
          ...pub,
          admission: { request_ref: ref, basis_id: service.basis_id },
        }),
    });
  const transferFact = c.store.getFact(logisticsTransferKey(worldId, entityId));
  const transfer = transferFact?.value as LogisticsTransfer | undefined;
  m.first_dispatch_l1_f3 = transfer !== undefined && transfer.request.request_id === ref;
  if (!m.first_dispatch_l1_f3)
    return lateEarly({
      kind: "act",
      step: stepName("l1-first-dispatch", ref),
      owner: "logistics",
      run: (pub) => c.logistics.dispatchFirst({ ...pub, request: { request_ref: ref } }),
    });
  const directiveUse = c.economy.freightRequest(ref)!.value.directive_use_id;
  m.directive_use_consumed_e1 = c.economy.useConsumption(directiveUse) !== undefined;
  if (!m.directive_use_consumed_e1)
    return lateEarly({
      kind: "act",
      step: stepName("e1-consume-first-dispatch", ref),
      owner: "economy",
      run: (pub) => c.economy.consumeFirstDispatch({ ...pub, request: { request_ref: ref } }),
    });
  m.transfer_enrolled_te = c.coordinator.object(logisticsObjectId(ref)) !== undefined;
  if (!m.transfer_enrolled_te)
    return lateEarly({
      kind: "act",
      step: stepName("te-enroll-transfer", ref),
      owner: "temporal",
      run: (pub) =>
        c.coordinator.registerObject({
          ...pub,
          object: logisticsTemporalObject(commitment!, transfer!),
        }),
    });
  m.received_er = c.economy.receipt(ref) !== undefined;
  if (!m.received_er)
    return lateEarly({
      kind: "await",
      awaiting: {
        kind: "PLAYER_OOC_TIME_ADVANCE",
        to: service.delivery_boundary_at,
        reason: "SERVICE_DELIVERY_BOUNDARY",
        note: "the service's own delivery boundary; Logistics, World-State and Economy resolve it in their own order when the player advances time",
      },
    });
  m.destination_adequacy_ad = c.economy.destinationAdequacy(ref) !== undefined;
  if (!m.destination_adequacy_ad)
    return lateEarly({
      kind: "act",
      step: stepName("ad-destination-adequacy", ref),
      owner: "economy",
      run: (pub) => c.economy.recordDestinationAdequacy({ ...pub, request: { request_ref: ref } }),
    });
  return lateEarly({ kind: "done" });
}

function statusOf(c: Ctx, campaignId: string, worldId: string | null): GmFreightStatus {
  const base = {
    audience: GM_FREIGHT_AUDIENCE,
    campaign_id: campaignId,
    null_pc: c.nullPc,
    canonical_time: c.canonicalTime(),
  } as const;
  if (worldId === null)
    return {
      ...base,
      world_id: null,
      stage: "NO_WORLD_SPECIFIED",
      milestones: {},
      request: null,
      awaiting: null,
    };
  const pos = position(c, worldId);
  const stage = MILESTONES.find((k) => !pos.milestones[k]) ?? "COMPLETE";
  let request: GmFreightStatus["request"] = null;
  if (pos.requestRef !== undefined && pos.allocationStatus !== undefined) {
    const act = pos.milestones.service_committed_l0 ? "L1/first-dispatch" : "L0/service-admission";
    const derived =
      pos.allocationStatus === "pending" ? c.economy.currentStatus(pos.requestRef, act) : undefined;
    request = {
      request_ref: pos.requestRef,
      allocation_status: pos.allocationStatus,
      derived_status:
        derived === undefined
          ? { act: null, note: "no prospective Logistics act is open on this request" }
          : derived.ok
            ? { act, outcome: "ELIGIBLE_AT_THIS_CUT" }
            : {
                act,
                outcome: "ACT_LEVEL_NON_COMMIT",
                code: derived.error.code,
                message: derived.error.message,
              },
    };
  }
  return {
    ...base,
    world_id: worldId,
    stage,
    milestones: pos.milestones,
    request,
    awaiting: pos.next.kind === "await" || pos.next.kind === "blocked" ? pos.next.awaiting : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

/** The fixed-name acts of the setting, the opening, the legal source and the profile's first owner acts. */
const STATIC_STEPS = [
  "setting-world",
  "setting-origin",
  "setting-destination",
  "setting-corridor",
  "attest-opening",
  "legal-opening-basis",
  "legal-institution",
  "legal-office",
  "legal-scope-binding",
  "legal-instrument",
  "legal-clauses",
  "legal-seal",
  "site-change",
  "c05-origin-self-provision",
  "production-start",
  "production-register",
  "e0-fixation",
  "service-basis",
] as const;

/** The acts that repeat per request: one per request ever fixed on the profile, named by that request's identity. */
const PER_REQUEST_STEPS = [
  "l0-service-admission",
  "l1-first-dispatch",
  "e1-consume-first-dispatch",
  "te-enroll-transfer",
  "ad-destination-adequacy",
  "withdraw-admit",
  "withdraw-f2-release",
  "withdraw-close",
  "e2-fixation-after",
] as const;

/**
 * Every act committed under this retry token IN THIS WORLD, found by identity (exact-key lookups of derived identities; no scan). The world is
 * part of every act identity (BLUE R-1), so the question is asked of one world: another world under the same token is a different set of acts.
 */
function committedUnderToken(
  c: Ctx,
  operationId: string,
  worldId: string,
): { step: string; revision: number }[] {
  const names = new Set<string>(STATIC_STEPS);
  const env = readEnvelope(c, worldId);
  if (env) {
    for (const x of env.site) names.add(stepName("site-condition", x.slice.slice_id));
    for (const x of env.spec) names.add(stepName("material-specification", x.slice.slice_id));
    for (const x of env.lot) names.add(stepName("input-lot", x.slice.slice_id));
    // the requests of the profile, from the OWNER's cargo-slot history (BLUE R-7): as many as the owners made, none dropped
    const sealId = env.legal.length === 1 ? env.legal[0]!.premise.basis_id : undefined;
    if (sealId !== undefined)
      for (const x of env.spec) {
        const entityId = productionOutputReference(
          economyOriginRequestId(x.premise.specification_id),
        );
        for (const ref of requestChain(c, sealId, worldId, entityId))
          for (const stem of PER_REQUEST_STEPS) names.add(stepName(stem, ref));
      }
  }
  const found: { step: string; revision: number }[] = [];
  for (const step of [...names].sort()) {
    const intent = gmFreightActIdentity(operationId, worldId, step).intent_id;
    if (c.store.committedGroup(intent) === null) continue;
    found.push({ step, revision: c.store.lookupReceipt(intent)?.revision ?? 0 });
  }
  return found;
}

function finish(
  c: Ctx,
  session: SessionBinding,
  run: Run,
  tool: GmFreightTool,
  operationId: string | null,
  worldId: string | null,
): GmFreightResult {
  const steps = run.steps.map((s) => ({ ...s }));
  if (run.halt) {
    const halted = {
      step: run.halt.step,
      code: run.halt.code,
      message: run.halt.message,
      ...(run.halt.details !== undefined ? { details: run.halt.details } : {}),
    };
    if (run.halt.kind === "CONFLICT")
      return fail(
        GM_FREIGHT_INTENT_CONFLICT,
        "this operation_id was already used with different terms: nothing new was committed under it",
        { steps, halted },
      );
    if (run.halt.kind === "UNKNOWN")
      return fail(GM_FREIGHT_OUTCOME_UNKNOWN, GM_FREIGHT_OUTCOME_UNKNOWN_MESSAGE, {
        steps,
        halted: { step: run.halt.step },
      });
    return fail(
      GM_FREIGHT_REFUSED,
      "an owner refused this act; the earlier committed acts stand and nothing was invented",
      { steps, halted },
    );
  }
  return ok({
    audience: GM_FREIGHT_AUDIENCE,
    tool,
    operation_id: operationId,
    steps,
    awaiting: run.awaiting,
    committed_under_token:
      operationId === null || worldId === null ? [] : committedUnderToken(c, operationId, worldId),
    status: statusOf(c, c.store.head().campaign_id, worldId),
  } satisfies GmFreightReceipt);
}

const invalid = (issues: readonly { path: PropertyKey[]; message: string }[]): GmFreightResult =>
  fail(GM_FREIGHT_INPUT_INVALID, "the request is not a valid request of this tool", {
    issues: issues
      .slice(0, 8)
      .map((i) => `${i.path.map(String).join(".") || "(request)"}: ${i.message}`),
  });

const notNullPc = (): GmFreightResult =>
  fail(
    GM_FREIGHT_REFUSED,
    "the first freight profile is the NULL-PC original-world profile: a player character is bound",
    { steps: [], halted: { step: "profile", code: "NOT_ADMISSIBLE" } },
  );

async function establishSetting(
  c: Ctx,
  s: SessionBinding,
  a: GmEstablishSettingRequest,
): Promise<GmFreightResult> {
  const run = new Run();
  const worldId = a.world.world_id;
  const world: WorldProfile = {
    world_id: worldId,
    premise: a.world.premise,
    reference_causal_basis: { mode: "ORIGINAL", established_canon: a.world.established_canon },
    material_world_law_departures: [],
    insertion_supporting_constraints: [],
  };
  const locus = (l: { locus_id: string; designation: string }): WorldLocus => ({
    locus_id: l.locus_id,
    world: { fact_key: worldProfileKey(worldId), entity_id: worldId },
    designation: l.designation,
    constraints: [],
  });
  const origin = locus(a.origin);
  const destination = locus(a.destination);
  const corridor = {
    world_id: worldId,
    from_locus_id: a.origin.locus_id,
    to_locus_id: a.destination.locus_id,
    statement: a.corridor.statement,
  };
  const equal = (key: string, value: unknown) => () => same(c.store.getFact(key)?.value, value);
  const op = a.operation_id;
  await (async () => {
    if (
      !(await c.perform(
        run,
        "setting-world",
        "world_state",
        op,
        worldId,
        (pub) => c.campaign.establishWorld({ ...pub, world }),
        equal(worldProfileKey(worldId), world),
      ))
    )
      return;
    if (
      !(await c.perform(
        run,
        "setting-origin",
        "world_state",
        op,
        worldId,
        (pub) => c.campaign.establishLocus({ ...pub, locus: origin }),
        equal(worldLocusKey(worldId, origin.locus_id), origin),
      ))
    )
      return;
    if (
      !(await c.perform(
        run,
        "setting-destination",
        "world_state",
        op,
        worldId,
        (pub) => c.campaign.establishLocus({ ...pub, locus: destination }),
        equal(worldLocusKey(worldId, destination.locus_id), destination),
      ))
    )
      return;
    await c.perform(
      run,
      "setting-corridor",
      "world_state",
      op,
      worldId,
      (pub) => c.campaign.establishCorridor({ ...pub, corridor }),
      equal(
        worldCorridorKey(worldId, corridor.from_locus_id, corridor.to_locus_id),
        corridorOfInput(corridor),
      ),
    );
  })();
  return finish(c, s, run, GM_FREIGHT_TOOLS.establishSetting, op, worldId);
}

async function attestOpening(
  c: Ctx,
  s: SessionBinding,
  a: GmAttestOpeningRequest,
): Promise<GmFreightResult> {
  const run = new Run();
  const o = a.opening;
  // the GM's authorship is stated HERE, by the trusted side: the request had no field for it
  const opening = {
    world_id: o.world_id,
    operation_id: a.operation_id,
    envelope_id: o.envelope_id,
    origin_locus_id: o.origin_locus_id,
    destination_locus_id: o.destination_locus_id,
    authored_under: { ...GM_ADJUDICATION_AUTHORITY },
    slices: o.slices.map((x) => ({
      slice_id: x.slice_id,
      slice_kind: x.slice_kind,
      statement: x.statement,
      premise: x.premise,
    })),
  };
  // the seal is irreversible (the envelope can never be amended or attested again), so an envelope that cannot carry the first profile is
  // refused BEFORE it is written (BLUE R-2). This mirrors owner rules, adds none: see `envelopeProblems`. An envelope already attested is
  // judged by the owner as before (an identical re-presentation replays; a different one conflicts), so the gate applies only to a new one.
  const kinds: Record<string, number> = {};
  for (const x of o.slices) kinds[x.slice_kind] = (kinds[x.slice_kind] ?? 0) + 1;
  const problems = envelopeProblems(kinds);
  if (problems.length > 0 && c.world.attestation(o.world_id) === undefined) {
    run.halt = {
      kind: "REFUSED",
      step: "attest-opening",
      code: "ENVELOPE_CANNOT_CARRY_THE_PROFILE",
      message:
        "the original envelope cannot be amended once attested, and this one does not carry what the first freight profile needs; nothing was written",
      details: { problems },
    };
    return finish(c, s, run, GM_FREIGHT_TOOLS.attestOpening, a.operation_id, o.world_id);
  }
  await c.perform(run, "attest-opening", "world_state", a.operation_id, o.world_id, (pub) =>
    c.world.attestOpening({ ...pub, opening }),
  );
  return finish(c, s, run, GM_FREIGHT_TOOLS.attestOpening, a.operation_id, o.world_id);
}

async function establishLegal(
  c: Ctx,
  s: SessionBinding,
  a: GmEstablishLegalRequest,
): Promise<GmFreightResult> {
  const run = new Run();
  const op = a.operation_id;
  const worldId = a.world_id;
  const envelope = readEnvelope(c, worldId);
  if (!envelope) {
    run.halt = {
      kind: "REFUSED",
      step: "legal-opening-basis",
      code: "PREREQUISITE_MISSING",
      message: "the original envelope is attested before the legal source is assembled",
    };
    return finish(c, s, run, GM_FREIGHT_TOOLS.establishLegal, op, worldId);
  }
  const envelopeIssues = envelopeProblems(envelope.kinds, envelope.untyped);
  const legal = envelope.legal.length === 1 ? envelope.legal[0]!.premise : undefined;
  if (envelopeIssues.length > 0 || !legal) {
    run.halt = {
      kind: "REFUSED",
      step: "legal-opening-basis",
      code: "SEALED_ENVELOPE_CANNOT_CARRY_THE_PROFILE",
      message:
        "the original envelope is sealed and cannot be amended or attested again, and it does not carry what this profile needs; nothing the GM can author changes that",
      details: { problems: envelopeIssues },
    };
    return finish(c, s, run, GM_FREIGHT_TOOLS.establishLegal, op, worldId);
  }
  // the three references the existing Instrument contract derives from identities named elsewhere in this request
  const instrument = GovernanceInstrumentSchema.safeParse({
    instrument_id: a.instrument.instrument_id,
    source_authority_ref: gipOfficeAuthorityLocusKey(a.office.institution_id, a.office.office_id),
    authority_basis_ref: legal.basis_id,
    operative_effect: a.instrument.operative_effect,
    scope_binding_ref: gipScopeBindingKey(
      a.scope_binding.institution_id,
      a.scope_binding.office_id,
      a.scope_binding.scope_binding_id,
    ),
    validity_by_order: a.instrument.validity_by_order,
    lifecycle_status: a.instrument.lifecycle_status,
  });
  if (!instrument.success) return invalid(instrument.error.issues);
  const assembly = { world_id: worldId };
  const equal = (key: string, value: unknown) => () => same(c.store.getFact(key)?.value, value);
  const steps: [string, string, (pub: Publication) => Promise<StepResult>, (() => boolean)?][] = [
    [
      "legal-opening-basis",
      "gip",
      (pub) => c.gipFreight.establishOpeningBasis({ ...pub, assembly }),
      () => c.gipFreight.openingBasis(legal.basis_id) !== undefined,
    ],
    [
      "legal-institution",
      "gip",
      (pub) => c.gip.establishInstitution({ ...pub, institution: a.institution }),
      () => same(c.gip.institutionIdentity(a.institution.institution_id)?.value, a.institution),
    ],
    [
      "legal-office",
      "gip",
      (pub) => c.gip.establishOffice({ ...pub, office: a.office }),
      equal(gipOfficeAuthorityLocusKey(a.office.institution_id, a.office.office_id), a.office),
    ],
    [
      "legal-scope-binding",
      "gip",
      (pub) => c.gip.establishScopeBinding({ ...pub, scope_binding: a.scope_binding }),
      equal(
        gipScopeBindingKey(
          a.scope_binding.institution_id,
          a.scope_binding.office_id,
          a.scope_binding.scope_binding_id,
        ),
        a.scope_binding,
      ),
    ],
    [
      "legal-instrument",
      "gip",
      (pub) => c.gip.establishGovernanceInstrument({ ...pub, instrument: instrument.data }),
      () => same(c.gip.governanceInstrument(a.instrument.instrument_id)?.value, instrument.data),
    ],
    [
      "legal-clauses",
      "gip",
      (pub) => c.gipFreight.establishInstrumentClauses({ ...pub, assembly }),
      () =>
        legal.clauses.length > 0 &&
        legal.clauses.every(
          (cl) => c.gipFreight.clause(a.instrument.instrument_id, cl.provision_id) !== undefined,
        ),
    ],
    [
      "legal-seal",
      "gip",
      (pub) => c.gipFreight.sealReadiness({ ...pub, assembly }),
      () => c.gipFreight.readinessSeal(legal.basis_id) !== undefined,
    ],
  ];
  for (const [step, owner, run1, present] of steps)
    if (!(await c.perform(run, step, owner, op, worldId, run1, present))) break;
  return finish(c, s, run, GM_FREIGHT_TOOLS.establishLegal, op, worldId);
}

/** Per-call ceiling on owner acts. Trusted-side configuration, never a request field: a host cannot raise, lower or see it. */
export const DEFAULT_MAX_ACTS_PER_CALL = 32;

async function initiate(
  c: Ctx,
  s: SessionBinding,
  a: GmInitiateRequest,
  maxActs: number,
): Promise<GmFreightResult> {
  const run = new Run();
  const performed = new Set<string>();
  for (;;) {
    const next = position(c, a.world_id).next;
    if (next.kind === "done") break;
    if (next.kind === "await" || next.kind === "blocked") {
      run.awaiting = next.awaiting;
      break;
    }
    if (next.kind === "refused") {
      // an OWNER's own refusal, found by its pure derivation before any write: reported in the owner's words, nothing invented
      run.halt = {
        kind: "REFUSED",
        step: next.step,
        code: next.code,
        message: next.message,
        ...(next.details !== undefined ? { details: next.details } : {}),
      };
      break;
    }
    if (performed.size >= maxActs) {
      // not a failure and nobody else is awaited: the call stopped at its ceiling with owner work still due (BLUE R-8)
      run.awaiting = {
        kind: "MORE_OWNER_WORK_DUE",
        note: "owner work is still due and this call stopped at its per-call limit; present gm_freight_initiate again (a new operation_id) to continue from the committed owner position",
      };
      break;
    }
    if (performed.has(next.step)) {
      // a defensive invariant: an act that reports success yet leaves the position unchanged would repeat forever
      run.halt = {
        kind: "REFUSED",
        step: next.step,
        code: "NO_PROGRESS",
        message:
          "an owner act reported success but the committed position did not advance; the bridge stopped rather than repeat it",
      };
      break;
    }
    performed.add(next.step);
    if (!(await c.perform(run, next.step, next.owner, a.operation_id, a.world_id, next.run))) break;
  }
  return finish(c, s, run, GM_FREIGHT_TOOLS.initiate, a.operation_id, a.world_id);
}

async function reportSiteChange(
  c: Ctx,
  s: SessionBinding,
  a: GmReportSiteChangeRequest,
): Promise<GmFreightResult> {
  const run = new Run();
  await c.perform(run, "site-change", "world_state", a.operation_id, a.world_id, (pub) =>
    c.world.admitSiteConditionChange({
      ...pub,
      change: {
        world_id: a.world_id,
        condition_id: a.condition_id,
        change_id: a.change_id,
        statement: a.statement,
        outcome: a.outcome,
        authored_under: { ...GM_ADJUDICATION_AUTHORITY },
      },
    }),
  );
  return finish(c, s, run, GM_FREIGHT_TOOLS.reportSiteChange, a.operation_id, a.world_id);
}

async function withdraw(c: Ctx, s: SessionBinding, a: GmWithdrawRequest): Promise<GmFreightResult> {
  const run = new Run();
  const op = a.operation_id;
  const pos = position(c, a.world_id);
  const ref = pos.requestRef;
  if (ref === undefined) {
    run.halt = {
      kind: "REFUSED",
      step: "withdraw-admit",
      code: "NOT_ADMISSIBLE",
      message: "no freight request is fixed: there is nothing to withdraw",
    };
    return finish(c, s, run, GM_FREIGHT_TOOLS.withdraw, op, a.world_id);
  }
  const target = { request_ref: ref };
  const status = () => c.economy.allocation(ref)?.value.state.status;
  // C-07: Economy alone derives whether a W2 / W3 cause exists; with none it admits nothing and the owner's refusal is reported
  if (status() !== "withdrawal-pending" && status() !== "terminal")
    if (
      !(await c.perform(run, stepName("withdraw-admit", ref), "economy", op, a.world_id, (pub) =>
        c.economy.admitWithdrawal({ ...pub, request: target }),
      ))
    )
      return finish(c, s, run, GM_FREIGHT_TOOLS.withdraw, op, a.world_id);
  // F2: only where Logistics holds a committed, undispatched service for exactly this request
  // the profile's one specification is the OWNER's selection (Economy `profileScope`), never the first slice found (BLUE R-6)
  const scope =
    pos.sealId === undefined ? undefined : profileScope(storeSource(c.store), pos.sealId);
  const committed =
    scope === undefined || !scope.ok
      ? undefined
      : (c.store.getFact(
          logisticsCommitmentKey(
            a.world_id,
            productionOutputReference(economyOriginRequestId(scope.value.specificationId)),
          ),
        )?.value as LogisticsCommitment | undefined);
  if (
    status() === "withdrawal-pending" &&
    committed?.request.request_id === ref &&
    committed.state.status === "COMMITTED" &&
    c.logistics.unusedRelease(ref) === undefined
  )
    if (
      !(await c.perform(
        run,
        stepName("withdraw-f2-release", ref),
        "logistics",
        op,
        a.world_id,
        (pub) => c.logistics.releaseUnusedService({ ...pub, request: target }),
      ))
    )
      return finish(c, s, run, GM_FREIGHT_TOOLS.withdraw, op, a.world_id);
  if (status() === "withdrawal-pending")
    await c.perform(run, stepName("withdraw-close", ref), "economy", op, a.world_id, (pub) =>
      c.economy.closeWithdrawnRequest({ ...pub, request: target }),
    );
  return finish(c, s, run, GM_FREIGHT_TOOLS.withdraw, op, a.world_id);
}

// ---------------------------------------------------------------------------------------------
// Deterministic work counters (Engineering Acceptance §1A): instrumentation only; nothing reads them to decide anything
// ---------------------------------------------------------------------------------------------

/**
 * What the bridge itself did, and the freight owner work (`freightWorkCounters`) that happened INSIDE its operations, so that a measurement can
 * separate the causal work of an act from the per-call cost of re-opening the campaign (replay re-derivation and the incremental GIP-head build
 * happen at open, before the operation, and are not in these counts).
 */
export const gmFreightWorkCounters = {
  operations: 0,
  owner_acts_attempted: 0,
  position_reads: 0,
  in_operation: {
    ownerReads: 0,
    derivations: 0,
    gipHeadScans: 0,
    gipHeadScannedFacts: 0,
    gipHeadAdvances: 0,
  },
};
export const resetGmFreightWorkCounters = (): void => {
  gmFreightWorkCounters.operations = 0;
  gmFreightWorkCounters.owner_acts_attempted = 0;
  gmFreightWorkCounters.position_reads = 0;
  for (const k of Object.keys(
    gmFreightWorkCounters.in_operation,
  ) as (keyof typeof gmFreightWorkCounters.in_operation)[])
    gmFreightWorkCounters.in_operation[k] = 0;
};

// ---------------------------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------------------------

const unavailable = (): GmFreightResult =>
  fail(GM_FREIGHT_UNAVAILABLE, GM_FREIGHT_UNAVAILABLE_MESSAGE);

const MUTATORS: ReadonlySet<string> = new Set([
  GM_FREIGHT_TOOLS.establishSetting,
  GM_FREIGHT_TOOLS.attestOpening,
  GM_FREIGHT_TOOLS.establishLegal,
  GM_FREIGHT_TOOLS.initiate,
  GM_FREIGHT_TOOLS.reportSiteChange,
  GM_FREIGHT_TOOLS.withdraw,
]);

/** Trusted-side configuration of one operation. It is never read from a request. */
export interface GmFreightLimits {
  readonly maxActsPerCall?: number;
}

/**
 * The host's one operation. `session` is the trusted binding; `tool` and `args` are the host's untrusted input. A forged session,
 * an unknown tool or a campaign with a player character bound is refused before the host's arguments are read for meaning.
 */
export async function runGmFreightOperation(
  session: TrustedGmFreightSession,
  tool: string,
  args: unknown,
  limits: GmFreightLimits | undefined = undefined,
): Promise<GmFreightResult> {
  const before = { ...freightWorkCounters };
  gmFreightWorkCounters.operations++;
  try {
    return await dispatchOperation(
      session,
      tool,
      args,
      limits?.maxActsPerCall ?? DEFAULT_MAX_ACTS_PER_CALL,
    );
  } finally {
    for (const k of Object.keys(
      gmFreightWorkCounters.in_operation,
    ) as (keyof typeof gmFreightWorkCounters.in_operation)[])
      gmFreightWorkCounters.in_operation[k] += freightWorkCounters[k] - before[k];
  }
}

async function dispatchOperation(
  session: TrustedGmFreightSession,
  tool: string,
  args: unknown,
  maxActs: number,
): Promise<GmFreightResult> {
  const bound = sessions.get(session);
  if (bound === undefined || !Object.hasOwn(GM_FREIGHT_REQUEST_SCHEMAS, tool)) return unavailable();
  try {
    const schema = GM_FREIGHT_REQUEST_SCHEMAS[tool as GmFreightTool];
    const parsed = schema.safeParse(args === undefined ? {} : args);
    if (!parsed.success) return invalid(parsed.error.issues);
    const c = new Ctx(bound.campaign);
    const a = parsed.data as never;
    if (MUTATORS.has(tool) && !c.nullPc) return notNullPc();
    switch (tool) {
      case GM_FREIGHT_TOOLS.status: {
        const w = (a as { world_id?: string }).world_id ?? null;
        return ok(statusOf(c, c.store.head().campaign_id, w));
      }
      case GM_FREIGHT_TOOLS.establishSetting:
        return await establishSetting(c, bound, a);
      case GM_FREIGHT_TOOLS.attestOpening:
        return await attestOpening(c, bound, a);
      case GM_FREIGHT_TOOLS.establishLegal:
        return await establishLegal(c, bound, a);
      case GM_FREIGHT_TOOLS.initiate:
        return await initiate(c, bound, a, maxActs);
      case GM_FREIGHT_TOOLS.reportSiteChange:
        return await reportSiteChange(c, bound, a);
      case GM_FREIGHT_TOOLS.withdraw:
        return await withdraw(c, bound, a);
      case GM_FREIGHT_TOOLS.reconcile: {
        const r = a as { operation_id: string; world_id: string };
        return ok({
          audience: GM_FREIGHT_AUDIENCE,
          tool: GM_FREIGHT_TOOLS.reconcile,
          operation_id: r.operation_id,
          committed: committedUnderToken(c, r.operation_id, r.world_id),
        } satisfies GmFreightReconciliation);
      }
      default:
        return unavailable();
    }
  } catch {
    // an exception on a mutating path may follow a commit: it is unknown, never "safely absent"
    return MUTATORS.has(tool)
      ? fail(GM_FREIGHT_OUTCOME_UNKNOWN, GM_FREIGHT_OUTCOME_UNKNOWN_MESSAGE)
      : unavailable();
  }
}
