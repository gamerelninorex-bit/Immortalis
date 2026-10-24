import { existsSync } from "node:fs";
import {
  WorldProfileSchema,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { CanonicalCampaign, canonicalEqual, nodeFs } from "@immortalis/engine";
import {
  OPERATOR_PUBLICATION_BASIS,
  OPERATOR_PUBLICATION_SECRECY,
  defaultOperatorDir,
  localitySetupId,
  verifyLocalOperator,
  type LocalitySetup,
  type LocalityStatus,
} from "@immortalis/operator";
import { readPin } from "../../../packages/operator/src/locality-pin.ts";

/**
 * Owner-side EVIDENCE about the ORIGINAL locality setup, read from the trusted retained identity and the owners (the chat adapter's own
 * module: the operator package is unchanged). It judges what became of ONE exact document and nothing else:
 *
 *   - the publication identities it looks for are the ones `establish-locality` itself derives (the campaign-bound hash of the three
 *     authored sections, via the operator's own exported `localitySetupId`, and the fixed `operator-locality…` group/intent/cause strings);
 *   - the comparison of the committed facts with the document is the same one the shipped command makes before it reports a completion;
 *   - it is READ-ONLY: it replays nothing, writes nothing, asks nobody, reclaims no lock and creates no directory.
 *
 * It is not a second source of truth. A match here never stands for the shipped command's own confirmation; it settles only the adapter's
 * pending-operation record. The tests run it against campaigns made by the shipped command at every structural cut.
 */

/** The first and last line of every confirmation the shipped command shows for a setup (a front end proves it holds the whole text by them). */
export const LOCALITY_CONFIRMATION_FIRST = "CONFIRMATION — ORIGINAL LOCALITY SETUP";
export const LOCALITY_CONFIRMATION_LAST =
  "Committed facts are never replaced; a different setup is refused for this campaign.";

/** Every status the shipped `establish-locality` can report; anything else is not relayed. */
export const LOCALITY_STATUSES = [
  "LOCALITY_READY",
  "LOCALITY_INCOMPLETE",
  "LOCALITY_OUTCOME_UNKNOWN",
  "LOCALITY_REFUSED",
  "LOCALITY_VERIFICATION_FAILED",
  "SETUP_CONFLICT",
  "PACKAGE_UNUSABLE",
  "SESSION_UNAVAILABLE",
  "DECLINED",
  "SETUP_FILE_UNTRUSTED",
  "SETUP_FILE_UNREADABLE",
  "INVALID_SETUP",
] as const satisfies readonly LocalityStatus[];

const BUILD_ID = "immortalis-chat-setup-readback";

/** What an owner-verified read of a campaign holds of an operator-confirmed locality, in the allowlisted terms a front end may relay. */
export interface LocalityReadback {
  readonly world_id: string;
  readonly locus_id: string;
  readonly locus_designation: string;
  readonly source_key: string;
  readonly dimension: string;
  readonly material_class: string;
  readonly established: { readonly amount: number; readonly unit: string };
  readonly recoverable: { readonly amount: number; readonly unit: string };
}

/**
 * What the trusted record and the owners say became of ONE exact confirmed setup.
 *
 *   NO_EFFECT    nothing of this setup was ever confirmed or committed: no retained identity exists (it is created only after the human
 *                confirmed, before anything else), or the campaign's first-writer-wins identity is another setup and none of this setup's
 *                publications exist. Proven; it is not the same as "unknown".
 *   RESUMABLE    this setup's identity is retained and fewer than all three publications are committed (package absent, empty or holding a
 *                prefix of the dependency order): re-running the SAME document through `establish-locality` — with its own fresh
 *                confirmation — finishes it.
 *   COMPLETE     the retained identity, all three exact owner publications and a fresh owner-verified open agree with the document.
 *   BLOCKED      the evidence is present but cannot be reconciled by a rerun (a malformed or foreign identity file, a package that is
 *                neither empty nor complete, a conflicting or unpinned commit, a mismatch): engineering must inspect it; nothing is adopted.
 *   UNAVAILABLE  the evidence could not be read now (a lock, an unreadable file): neither "done" nor "not done".
 */
export type LocalityOutcome =
  | { readonly kind: "NO_EFFECT"; readonly detail: string }
  | {
      readonly kind: "RESUMABLE";
      readonly package: "ABSENT" | "PRESENT";
      readonly committed: readonly string[];
    }
  | { readonly kind: "COMPLETE"; readonly readback: LocalityReadback }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

const blocked = (code: string, detail: string): LocalityOutcome => ({
  kind: "BLOCKED",
  code,
  detail,
});
const unavailable = (code: string, detail: string): LocalityOutcome => ({
  kind: "UNAVAILABLE",
  code,
  detail,
});

type StageName = "world" | "locus" | "source";
const STAGES: readonly StageName[] = ["world", "locus", "source"];
const GROUP = /^operator-locality:([0-9a-f]{32}):(world|locus|source)$/;

interface Stage {
  readonly name: StageName;
  readonly key: string;
  readonly groupId: string;
  readonly intentId: string;
  readonly cause: string;
  readonly owner: string;
  readonly facet: string;
}

function stagesOf(id: string, setup: LocalitySetup): Stage[] {
  const w = setup.world.world_id;
  const base = (name: StageName) => ({
    name,
    groupId: `operator-locality:${id}:${name}`,
    intentId: `operator-locality-intent:${id}:${name}`,
    cause: `operator-locality-cause:${id}`,
    owner: "world_state",
  });
  return [
    { ...base("world"), key: worldProfileKey(w), facet: "world_profile" },
    { ...base("locus"), key: worldLocusKey(w, setup.locus.locus_id), facet: "world_locus" },
    {
      ...base("source"),
      key: worldSourceConditionKey(w, setup.source.source_key),
      facet: "world_source_condition",
    },
  ];
}

type Plan =
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "PENDING" }
  | { readonly kind: "CONFLICT"; readonly reason: string };

/** A stage is done when the group of this setup's identity is committed; a fact this identity did not commit, a stage without its predecessor, and (while anything is pending) any other fact are conflicts. */
function inspect(campaign: CanonicalCampaign, stages: readonly Stage[]): Plan {
  const store = campaign.store;
  const done = stages.map((s) => {
    const group = store.committedGroup(s.intentId);
    return group !== null && group.group_id === s.groupId;
  });
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    const fact = store.getFact(s.key);
    if (done[i]) {
      const wrote = store.committedGroup(s.intentId)?.writes.some((w) => w.key === s.key);
      if (!fact || !wrote)
        return { kind: "CONFLICT", reason: `the ${s.name} committed by this setup is not held` };
      if (i > 0 && !done[i - 1])
        return { kind: "CONFLICT", reason: `the ${s.name} is held without its predecessor` };
    } else if (fact) {
      return { kind: "CONFLICT", reason: `a different ${s.name} is already committed` };
    }
  }
  if (done.every(Boolean)) return { kind: "COMPLETE" };
  const mine = new Set(stages.map((s) => s.key));
  if (store.listFacts().some((f) => !mine.has(f.key)))
    return { kind: "CONFLICT", reason: "the campaign holds content other than this setup" };
  return { kind: "PENDING" };
}

/** The same comparison the shipped command makes before it reports a completion: typed values, owners/facets and committed provenance. */
function problemsOf(
  campaign: CanonicalCampaign,
  setup: LocalitySetup,
  stages: readonly Stage[],
): string[] {
  const problems: string[] = [];
  if (campaign.verify().length > 0) problems.push("canonical integrity reports a violation");
  const attempt = <T>(read: () => T | undefined): T | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  const w = setup.world.world_id;
  const world = attempt(() => campaign.world(w));
  const locus = attempt(() => campaign.locus(w, setup.locus.locus_id));
  const source = attempt(() => campaign.sourceCondition(w, setup.source.source_key));
  const facts: (OwnerFact | undefined)[] = [world?.fact, locus?.fact, source?.fact];
  stages.forEach((s, i) => {
    const f = facts[i];
    if (!f) {
      problems.push(`the ${s.name} is not held or is not valid`);
      return;
    }
    const group = campaign.store.committedGroup(s.intentId);
    const write = group?.writes[0];
    if (
      !group ||
      group.writes.length !== 1 ||
      group.group_id !== s.groupId ||
      group.cause !== s.cause ||
      group.owner !== s.owner ||
      group.facet !== s.facet ||
      write?.key !== s.key ||
      write.basis !== OPERATOR_PUBLICATION_BASIS ||
      write.secrecy !== OPERATOR_PUBLICATION_SECRECY ||
      f.key !== s.key ||
      f.owner !== s.owner ||
      f.facet !== s.facet ||
      (f.version === 1 &&
        (f.provenance.group_id !== s.groupId ||
          f.provenance.intent_id !== s.intentId ||
          f.provenance.cause !== s.cause ||
          f.basis !== OPERATOR_PUBLICATION_BASIS ||
          f.secrecy !== OPERATOR_PUBLICATION_SECRECY))
    )
      problems.push(`the ${s.name} does not carry this setup's owner, key or provenance`);
  });
  if (world && !canonicalEqual(world.value, setup.world))
    problems.push("the world differs from the confirmed setup");
  if (
    locus &&
    !canonicalEqual(locus.value, {
      locus_id: setup.locus.locus_id,
      world: { fact_key: worldProfileKey(w), entity_id: w },
      designation: setup.locus.designation,
      constraints: setup.locus.constraints,
    })
  )
    problems.push("the locus differs from the confirmed setup");
  if (source) {
    const v = source.value;
    const s = setup.source;
    if (
      v.source_key !== s.source_key ||
      v.dimension !== s.dimension ||
      v.material_class !== s.material_class ||
      v.depth !== "EXACT_FINITE" ||
      v.recoverable.unit !== s.quantity.unit ||
      !canonicalEqual(v.access_facts, s.access_facts) ||
      !canonicalEqual(v.establishment, {
        kind: "INITIAL_SETTING_FACT",
        statement: s.statement,
        quantity: s.quantity,
      }) ||
      !canonicalEqual(v.locality, {
        world: { fact_key: worldProfileKey(s.world_id), entity_id: s.world_id },
        locus: { fact_key: worldLocusKey(s.world_id, s.locus_id), entity_id: s.locus_id },
      })
    )
      problems.push("the source condition differs from the confirmed setup");
  }
  return problems;
}

const readbackOf = (
  campaign: CanonicalCampaign,
  worldId: string,
  locusId: string,
  sourceKey: string,
) => {
  const world = campaign.world(worldId);
  const locus = campaign.locus(worldId, locusId);
  const source = campaign.sourceCondition(worldId, sourceKey);
  if (!world || !locus || !source) return undefined;
  const q = source.value.establishment.quantity;
  const readback: LocalityReadback = {
    world_id: world.value.world_id,
    locus_id: locus.value.locus_id,
    locus_designation: locus.value.designation,
    source_key: source.value.source_key,
    dimension: source.value.dimension,
    material_class: source.value.material_class,
    established: { amount: q.amount, unit: q.unit },
    recoverable: { amount: source.value.recoverable.amount, unit: source.value.recoverable.unit },
  };
  return readback;
};

export interface LocalityOutcomeParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly setup: LocalitySetup;
  readonly operatorDir?: string;
  readonly buildId?: string;
}

export async function localityOutcome(p: LocalityOutcomeParams): Promise<LocalityOutcome> {
  const id = localitySetupId(p.campaignId, p.setup);
  const stages = stagesOf(id, p.setup);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return blocked("OPERATOR_UNVERIFIED", "no local operator can be verified here");
  const stateDir = p.operatorDir ?? defaultOperatorDir(p.campaignDir);
  if (existsSync(stateDir)) {
    const trusted = verifyLocalOperator(stateDir, "operator-state");
    if (!trusted.ok || trusted.value.uid !== uid)
      return blocked("OPERATOR_UNVERIFIED", "the retained-state directory is not trusted");
  }
  const held = await readPin({ dir: stateDir, campaignId: p.campaignId, operatorUid: uid });
  if (!held.ok)
    return held.error.code === "PIN_UNREADABLE"
      ? unavailable(held.error.code, "the retained setup identity cannot be read now")
      : blocked(held.error.code, "the retained setup identity is not a valid one of this campaign");
  const pin = held.value;
  const mine = pin === id;

  let entries: string[];
  try {
    entries = await nodeFs.list(p.campaignDir);
  } catch {
    return unavailable("PACKAGE_UNREADABLE", "the campaign directory cannot be listed now");
  }
  if (entries.length === 0) {
    if (pin === null)
      return { kind: "NO_EFFECT", detail: "no identity was retained and no package exists" };
    return mine
      ? { kind: "RESUMABLE", package: "ABSENT", committed: [] }
      : { kind: "NO_EFFECT", detail: "another setup holds the campaign's retained identity" };
  }
  if (!entries.includes("manifest.json")) {
    // this setup's creation of the package would be preceded by its retained identity: without it, the content is not this setup's
    if (!mine)
      return {
        kind: "NO_EFFECT",
        detail:
          pin === null
            ? "no identity was retained for this setup; the directory holds content that is not a campaign package"
            : "another setup holds the campaign's retained identity; the directory holds content that is not a campaign package",
      };
    return blocked(
      "PACKAGE_UNUSABLE",
      "the campaign directory is not empty and holds no campaign manifest (an interrupted creation or foreign content)",
    );
  }
  const operator = verifyLocalOperator(p.campaignDir, "campaign");
  if (!operator.ok || operator.value.uid !== uid)
    return blocked("OPERATOR_UNVERIFIED", "the campaign package is not trusted for this operator");
  const opened = await CanonicalCampaign.open(p.campaignDir, { buildId: p.buildId ?? BUILD_ID });
  if (!opened.ok)
    return unavailable(
      "PACKAGE_UNAVAILABLE",
      "the campaign package cannot be opened now (a lock is held or the package cannot be verified)",
    );
  const campaign = opened.value;
  try {
    if (campaign.store.head().campaign_id !== p.campaignId)
      return blocked("CAMPAIGN_MISMATCH", "the package holds another campaign");
    const done = stages.filter((s) => {
      const group = campaign.store.committedGroup(s.intentId);
      return group !== null && group.group_id === s.groupId;
    });
    if (!mine) {
      if (done.length > 0)
        return blocked(
          "UNPINNED_COMMITS",
          "publications of this setup exist without its retained identity",
        );
      return {
        kind: "NO_EFFECT",
        detail:
          pin === null
            ? "no identity was retained for this setup and none of its publications exist"
            : "another setup holds the campaign's retained identity and none of this setup's publications exist",
      };
    }
    const plan = inspect(campaign, stages);
    if (plan.kind === "CONFLICT") return blocked("SETUP_CONFLICT", plan.reason);
    if (plan.kind === "PENDING")
      return { kind: "RESUMABLE", package: "PRESENT", committed: done.map((s) => s.name) };
    const problems = problemsOf(campaign, p.setup, stages);
    if (problems.length > 0) return blocked("VERIFICATION_FAILED", problems.join("; "));
    const readback = readbackOf(
      campaign,
      p.setup.world.world_id,
      p.setup.locus.locus_id,
      p.setup.source.source_key,
    );
    return readback
      ? { kind: "COMPLETE", readback }
      : blocked("VERIFICATION_FAILED", "the committed facts are not valid");
  } catch {
    return unavailable("READ_FAILED", "the campaign could not be read now");
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

/** What an open campaign holds of an operator-confirmed locality, read from canon alone (no setup document). */
export type LocalityCampaignRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "INCOMPLETE"; readonly committed: readonly string[] }
  | { readonly kind: "READY"; readonly readback: LocalityReadback }
  | { readonly kind: "FAILED"; readonly detail: string };

export function readLocality(campaign: CanonicalCampaign): LocalityCampaignRead {
  const store = campaign.store;
  // a full listing is an exceptional diagnostic path; this is an operator inspection, not a runtime read
  const facts = store.listFacts().filter((f) => f.owner === "world_state");
  const world = facts.find((f) => f.facet === "world_profile" && GROUP.test(f.provenance.group_id));
  const match = world ? GROUP.exec(world.provenance.group_id) : null;
  if (!world || !match) return { kind: "NONE" };
  const id = match[1]!;
  const held = STAGES.filter((name) => {
    const group = store.committedGroup(`operator-locality-intent:${id}:${name}`);
    return group !== null && group.group_id === `operator-locality:${id}:${name}`;
  });
  if (held.length < STAGES.length) return { kind: "INCOMPLETE", committed: held };
  const keyOf = (name: StageName): string | undefined =>
    store.committedGroup(`operator-locality-intent:${id}:${name}`)?.writes[0]?.key;
  const locusKey = keyOf("locus");
  const sourceKey = keyOf("source");
  const locusFact = locusKey === undefined ? undefined : store.getFact(locusKey);
  const sourceFact = sourceKey === undefined ? undefined : store.getFact(sourceKey);
  const parsedWorld = WorldProfileSchema.safeParse(world.value);
  if (!locusFact || !sourceFact || !parsedWorld.success)
    return { kind: "FAILED", detail: "a committed stage is not held or is not valid" };
  if (campaign.verify().length > 0)
    return { kind: "FAILED", detail: "canonical integrity reports a violation" };
  const w = parsedWorld.data.world_id;
  const locusId = (locusFact.value as { locus_id?: unknown }).locus_id;
  const key = (sourceFact.value as { source_key?: unknown }).source_key;
  const readback =
    typeof locusId === "string" && typeof key === "string"
      ? readbackOf(campaign, w, locusId, key)
      : undefined;
  return readback
    ? { kind: "READY", readback }
    : { kind: "FAILED", detail: "the facts are not valid" };
}
