/* eslint-disable @typescript-eslint/no-explicit-any -- the rigs poke at raw groups, manifests, journal bytes and stores */
// TEST SUPPORT for F-014B B1 S1 (the canonical live-versus-historical origin safety guard). Nothing here is production code and nothing
// here judges; it builds the campaigns, copies, reopen matrices and probes the S1 integration tests share.
//
// The "old" journals (a player-pair transaction that states the trigger kind named by the B0 module) are FROZEN packages written once by the
// build that preceded S1 (tests/fixtures/b1-s1-frozen, custody in ./b1-s1-frozen-fixtures.ts). A test never opens a frozen package itself:
// every use takes a private copy (`copyOf`), because opening rewrites the manifest.
import { appendFileSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_CHOICE_AUTHORITY,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  economyRealizationProvider,
  epistemicPacketProvider,
  gipSunsetExpiryProvider,
  ktiTransferResultCloseProvider,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  namedActorCapabilityCloseProvider,
  pcCapabilityCloseProvider,
  populationStageProvider,
  productionCompletionProvider,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  transactionAuthorityIntentId,
  transactionIntentId,
  verifyTemporalIntegrity,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  worldSourceDeliveryProvider,
  canonicalAdmission,
  type CampaignStore,
  type WriteAdmission,
} from "@immortalis/engine";
import { at } from "@immortalis/testkit";
import { GM_INTERPRETED_PC_WAIT } from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import {
  advanceOriginal,
  originalSunsetCampaign,
  trustedOriginalTarget,
} from "./original-pc-target.ts";
import { PC_TARGET_REFUSAL, PC_TARGET_TX, pcTargetTransaction } from "./pc-target-advance.ts";
import { SUNSET_MID } from "./gip-sunset.ts";
import { tempDir } from "./tmp.ts";
import { B1_S1_FROZEN_PACKAGES, B1_S1_FROZEN_ROOT } from "./b1-s1-frozen-fixtures.ts";

export const GM_TRIGGER = GM_INTERPRETED_PC_WAIT;
export const ORDINARY_TRIGGER = "operator-progression-choice"; // a kind the shipped operator states (operator/src/commands.ts)
export const NEAR_MISS_TRIGGERS = ["gm_interpreted_pc_wait", "GM_INTERPRETED_PC_WAIT_2"] as const; // valid opaque Ids, NOT the literal
export const PLAYER = { ...PLAYER_CHOICE_AUTHORITY };
export const REFUSED = JSON.parse(PC_TARGET_REFUSAL);
/** The one stable message of the S1 refusal (the same text at both placements, and at a raw kernel commit). */
export const GUARD_MESSAGE =
  "a new transaction stated under the player pair may not use the trigger reserved for GM-interpreted waiting";

export const log = (label: string, v: unknown) => {
  if (process.env["B1S1_LOG"])
    appendFileSync(process.env["B1S1_LOG"], `[S1] ${label} ${JSON.stringify(v)}\n`);
};

/** The shipped stage providers, exactly the set the gateways register. */
export const shippedProviders = () =>
  new StageProviderRegistry([
    productionCompletionProvider,
    productionSourceDeltaProvider,
    worldSourceDeliveryProvider,
    productionReserveInflowProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    populationStageProvider,
    epistemicPacketProvider,
    ktiTransferResultCloseProvider,
    namedActorCapabilityCloseProvider,
    pcCapabilityCloseProvider,
    gipSunsetExpiryProvider,
  ]);

export const request = (
  id: string,
  kind: string,
  target: unknown = at(200),
  context: object = PLAYER,
) => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind, ref: `ref-${id}` },
  continues: null,
  requested: { target, condition: null },
  context,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});

export const coordinatorOn = (store: CampaignStore) =>
  new TemporalCoordinator(store, shippedProviders());

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
/** absent facts, receipts and groups are `null` (never `undefined`), so a captured record survives a JSON round trip unchanged */
const orNull = <T>(v: T | undefined | null): T | null =>
  v === undefined || v === null ? null : structuredClone(v);

/** Whole-campaign custody: head, every fact, every receipt of every fact's provenance. Equality of two of these is equality of history. */
export function summary(store: CampaignStore) {
  const facts = store.listFacts();
  return {
    head: clone(store.head()),
    facts: facts.map((f) => clone(f)),
    receipts: facts.map((f) => clone(store.lookupReceipt(f.provenance.intent_id))),
  };
}

/** The exact transaction, its context, its (optional) authority and the receipts and groups of both. */
export function capture(store: CampaignStore, id: string) {
  const sealIntent = transactionIntentId(id);
  const authIntent = transactionAuthorityIntentId(id);
  return {
    seal: orNull(store.getFact(temporalTransactionKey(id))),
    authority: orNull(store.getFact(temporalTransactionAuthorityKey(id))),
    sealReceipt: orNull(store.lookupReceipt(sealIntent)),
    authorityReceipt: orNull(store.lookupReceipt(authIntent)),
    sealGroup: orNull(store.committedGroup(sealIntent)),
    authorityGroup: orNull(store.committedGroup(authIntent)),
  };
}

export const manifestOf = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
export const copyOf = (dir: string): string => {
  const out = tempDir();
  cpSync(dir, out, { recursive: true });
  mkdirSync(join(out, "history"), { recursive: true });
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------------
// the frozen pre-S1 journals
export interface OldJournal {
  readonly dir: string;
  readonly summary: ReturnType<typeof summary>;
  readonly captures: Record<string, ReturnType<typeof capture>>;
  readonly revisions: Record<string, number>;
  readonly headRevision: number;
}

/** A frozen package and the custody its generator wrote with it (`name` is a key of the packages table). */
export const thaw = (name: keyof typeof B1_S1_FROZEN_PACKAGES): OldJournal => {
  const root = join(import.meta.dirname, "..", "..", B1_S1_FROZEN_ROOT, name);
  const expected = JSON.parse(readFileSync(join(root, "expected.json"), "utf8"));
  return { ...expected, dir: join(root, "package") };
};

// ---------------------------------------------------------------------------------------------------------------------------
// opening a package under a given admission, counting how many journal entries were judged by `verifyHistorical`
export interface Spy {
  readonly admission: WriteAdmission;
  readonly calls: () => number;
  /** the historical verifier's verdict per journal group (by intent id): null = admitted, else the rejection code */
  readonly verdicts: Map<string, string | null>;
}
export function spy(base: WriteAdmission, idSuffix = ""): Spy {
  let n = 0;
  const verdicts = new Map<string, string | null>();
  const admission: WriteAdmission = {
    ...base,
    ...(idSuffix
      ? { historyVerificationId: `${base.historyVerificationId ?? "structural"}${idSuffix}` }
      : {}),
    verifyHistorical: (g, s) => {
      n++;
      const r = base.verifyHistorical?.(g, s) ?? null;
      verdicts.set(g.intent_id, r ? (r as any).code : null);
      return r;
    },
  };
  return { admission, calls: () => n, verdicts };
}

export type Opened =
  | { ok: true; campaign: CanonicalCampaign; calls: number; verdicts: Map<string, string | null> }
  | { ok: false; error: { code: string; message: string; details?: unknown }; calls: number };

/**
 * `admission` omitted opens through the plain production path (no test seam at all). The build id below is part of the frozen custody
 * (the saved head records the build that last saved it, and the frozen summaries were written with this one): do not rename it.
 */
export async function openUnder(
  dir: string,
  admission: WriteAdmission | undefined,
  o: { audit?: boolean; idSuffix?: string; extension?: any } = {},
): Promise<Opened> {
  const s = admission ? spy(admission, o.idSuffix) : undefined;
  const r = await CanonicalCampaign.open(dir, {
    buildId: "b1s1-e2-reopen",
    ...(o.audit ? { audit: true } : {}),
    ...(o.extension ? { extension: o.extension } : {}),
    ...(s ? { testkitFixtureAdmission: s.admission } : {}),
  });
  return r.ok
    ? {
        ok: true,
        campaign: r.value,
        calls: s?.calls() ?? 0,
        verdicts: s?.verdicts ?? new Map(),
      }
    : { ok: false, error: r.error as any, calls: s?.calls() ?? 0 };
}

export const MODES = {
  warm: {},
  coldAudit: { audit: true },
  // a verifier-identity change is how a checkpoint is invalidated: the open is forced into one strict whole-journal replay
  coldInvalidated: { idSuffix: "+B1S1-CHECKPOINT-INVALIDATED" },
} as const;
export type ModeName = keyof typeof MODES;

export interface ReopenObservation {
  readonly ok: boolean;
  readonly calls: number;
  readonly error?: { code: string; message: string };
  readonly summary?: ReturnType<typeof summary>;
  readonly captures?: Record<string, ReturnType<typeof capture>>;
  readonly violations?: unknown;
  readonly checkpointRevisionAfter?: number;
  readonly verdicts?: Map<string, string | null>;
}

/** Opens a PRIVATE COPY of `dir` in every mode (a transition open rewrites the manifest), observes, closes. */
export async function reopenMatrix(
  dir: string,
  admission: WriteAdmission,
  txIds: readonly string[],
  modes: readonly ModeName[] = ["warm", "coldAudit", "coldInvalidated"],
  extension?: any,
): Promise<Record<ModeName, ReopenObservation>> {
  const out: Partial<Record<ModeName, ReopenObservation>> = {};
  for (const mode of modes) {
    const copy = copyOf(dir);
    const r = await openUnder(copy, admission, {
      ...MODES[mode],
      ...(extension ? { extension } : {}),
    });
    if (!r.ok) {
      out[mode] = {
        ok: false,
        calls: r.calls,
        error: { code: r.error.code, message: r.error.message },
      };
      continue;
    }
    const store = r.campaign.store;
    out[mode] = {
      ok: true,
      calls: r.calls,
      summary: summary(store),
      captures: Object.fromEntries(txIds.map((id) => [id, capture(store, id)])),
      violations: [...r.campaign.verify(), ...verifyTemporalIntegrity(store)],
      checkpointRevisionAfter: manifestOf(copy).head.checkpoint.revision,
      verdicts: r.verdicts,
    };
    await r.campaign.close();
  }
  return out as Record<ModeName, ReopenObservation>;
}

// ---------------------------------------------------------------------------------------------------------------------------
// the shipped gateway over a campaign built only by shipped owner paths
/** a closed, pristine gateway campaign; every use takes a private copy */
export async function gatewayTemplate(): Promise<string> {
  const s = await originalSunsetCampaign(SUNSET_MID);
  await s.campaign.close();
  return s.dirs.campaignDir;
}

export const literalTransaction = (id = PC_TARGET_TX) =>
  pcTargetTransaction(id, { trigger: { kind: GM_TRIGGER, ref: "choice-gm-literal" } });

/** the gateway over a private copy of `template`, opened under `admission` (production when omitted) */
export async function gatewayRig(
  template: string,
  admission: WriteAdmission | undefined = canonicalAdmission,
  dir = copyOf(template),
) {
  const r = await openUnder(dir, admission);
  if (!r.ok) throw new Error(`gateway rig did not open: ${JSON.stringify(r.error)}`);
  return { dir, campaign: r.campaign, coordinator: coordinatorOn(r.campaign.store) };
}
export type Rig = Awaited<ReturnType<typeof gatewayRig>>;

export const viaGateway = (
  rig: Pick<Rig, "campaign">,
  transaction: Record<string, unknown>,
  target: unknown = undefined,
) =>
  advanceOriginal(
    trustedOriginalTarget(rig, {
      transaction,
      ...(target === undefined ? {} : { target }),
    }),
  );

// ---------------------------------------------------------------------------------------------------------------------------
// probing the store the gateway and the coordinator commit through
export interface CommitProbe {
  /** every group that reached the kernel, in order, with the kernel's own verdict on it */
  readonly seen: { readonly group: CommitGroup; readonly result: any }[];
  readonly restore: () => void;
}

/**
 * Swaps the campaign's store for one that records every commit with its result. `rewrite`, when given, replaces the group in flight
 * (one field changed from what the coordinator built): the kernel then judges the rewritten group exactly as a raw `store.commit`
 * of a group the coordinator did not build. Anything not a commit is passed through.
 */
export function probeCommits(
  campaign: CanonicalCampaign,
  rewrite?: (g: CommitGroup) => CommitGroup,
): CommitProbe {
  const real = campaign.store;
  const seen: { group: CommitGroup; result: any }[] = [];
  (campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const sent = rewrite ? rewrite(g) : g;
          const result = await target.commit(sent);
          seen.push({ group: sent, result });
          return result;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { seen, restore: () => ((campaign as any).store = real) };
}

/** The same group with its transaction trigger kind replaced (authority-open group or seal group); every other field is untouched. */
export const withTriggerKind = (g: CommitGroup, kind: string): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    const v: any = w.value;
    return v && typeof v === "object" && v.trigger && typeof v.trigger.kind === "string"
      ? { ...w, value: { ...v, trigger: { ...v.trigger, kind } } }
      : w;
  }),
});

export const isAuthorityGroup = (g: CommitGroup) =>
  g.writes.some((w) => /^temporal\/transaction-authority\//.test(w.key));
export const isSealGroup = (g: CommitGroup) =>
  g.writes.some((w) => /^temporal\/transaction\//.test(w.key));

/** The same group with the context of every transaction value (authority or seal) replaced; every other field is untouched. */
export const withContext = (g: CommitGroup, context: unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    const v: any = w.value;
    return v && typeof v === "object" && "context" in v && "trigger" in v
      ? { ...w, value: { ...v, context } }
      : w;
  }),
});

/** A store whose commits are rewritten in flight and recorded with the kernel's own verdict (for a store that is not a campaign). */
export function proxyStore(
  store: CampaignStore,
  rewrite: (g: CommitGroup) => CommitGroup,
): { readonly store: CampaignStore; readonly seen: { group: CommitGroup; result: any }[] } {
  const seen: { group: CommitGroup; result: any }[] = [];
  const proxied = new Proxy(store, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const sent = rewrite(g);
          const result = await target.commit(sent);
          seen.push({ group: sent, result });
          return result;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { store: proxied, seen };
}
