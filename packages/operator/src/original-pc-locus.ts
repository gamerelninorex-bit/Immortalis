import {
  REFEREE_AUTHORITY,
  REFEREE_OP_PHYSICAL,
  RefereeDecisionRecordSchema,
  EntityId,
  type OwnerFact,
  type PhysicalHostDecision,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  canonicalEqual,
  type FsOps,
} from "@immortalis/engine";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { readKeep, type KeepRecord } from "./original-pc-keep.ts";
import {
  BUILD_ID,
  UNKNOWN_OUTCOME,
  bindingProblems,
  closeQuietly,
  factLine,
  keyed,
  openSession,
  publicationOf,
  quoted,
  releaseProblems,
  result,
  runtimeOf,
  type CharacterResult,
} from "./original-pc.ts";
import { askPhysical } from "./referee-session.ts";
import type { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The original active-PC qualified physical-locus custody, as the operator's third and separate choice (BLUE v5.1).
 *
 * A character this operator's `author-character` released and bound has, after that, the Role Registry's binding-time referent and
 * nothing else: the binding states no physical position. This command asks the AI referee host ONE further, narrower question about
 * the words that are already committed (the accepted character's own statements, the player's confirmed native-presence statement, the
 * world and the locus): do they support ONE material, spatial physical subject originally present at exactly that locus? Only a
 * `PHYSICAL_ELIGIBLE` verdict the engine derived from a validated, quote-grounded answer can be confirmed; the player confirms it with its
 * own fresh phrase (the binding was confirmed on the explicit statement that it gives no physical position, so a physical fact is never
 * written under that earlier confirmation); the referee decision is then retained create-only and World-State's custodian commits ONE
 * create-only stationary physical-locus fact that reads and depends on the contract, the binding, the world, the locus and both
 * qualifying decisions. The host submits no verdict, no locus, no world and no identity.
 *
 * Mechanism only. The fact is where the character stationarily IS: no perception, knowledge, NPC decision, resource, action, movement or
 * time follows from it, and the existing post-handover movement and advance consumers still do not take it.
 */

export interface EstablishCharacterLocusParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly pcId: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
}

const REFEREE_PREFIX = "referee/";

/** The identity this command derives for the one custody it makes: a keyed digest of exactly what was confirmed. */
export const locusIdOf = (
  secret: string,
  campaignId: string,
  pcId: string,
  pins: { pc: number; binding: number; world: number; locus: number },
  qualified: { native: string; physical: string },
): string =>
  keyed(secret, {
    stage: "locus",
    campaign_id: campaignId,
    pc_id: pcId,
    pins,
    qualified_by: qualified,
  });

/** The key of the native/compatibility decision the committed binding was qualified by (read from its own committing group). */
function nativeDecisionKey(campaign: CanonicalCampaign): string | null {
  const binding = campaign.binding();
  if (!binding) return null;
  const read = campaign.store
    .committedGroup(binding.fact.provenance.intent_id)
    ?.reads.find((r) => r.key.startsWith(REFEREE_PREFIX));
  return read?.key ?? null;
}

/**
 * Whether the committed custody of `pcId` is exactly one this command makes: an ORIGINAL-activation custody at the binding's
 * coupling, under the identities derived from what was confirmed, qualified by the binding's own native decision and a physical
 * decision that this operator's referee exchange produced. Returns the reasons it is not (empty = it is).
 */
export function custodyProblems(
  campaign: CanonicalCampaign,
  campaignId: string,
  pcId: string,
  keep: KeepRecord,
): string[] {
  const out: string[] = [];
  const custody = campaign.pcPhysicalLocusCustody(pcId);
  const binding = campaign.binding();
  const pc = campaign.playerCharacter(pcId);
  if (!custody) return ["no physical-locus custody is held for the character"];
  if (!binding || !pc) return ["the character and its binding are held"];
  const c = custody.value;
  if (c.basis.established_from !== "ACTIVATION")
    return ["the custody is not an original-activation one"];
  if (!canonicalEqual(c.stationary_locus, binding.value.coupling))
    out.push("the custody is not at the locus the binding couples");
  const native = nativeDecisionKey(campaign);
  if (native === null || native !== c.basis.qualified_by.native.fact_key)
    out.push("the custody does not rest on the decision that qualified the binding");
  const physicalFact = campaign.store.getFact(c.basis.qualified_by.physical.fact_key);
  const physical = physicalFact ? RefereeDecisionRecordSchema.safeParse(physicalFact.value) : null;
  if (!physical?.success || physical.data.operation !== REFEREE_OP_PHYSICAL)
    return [...out, "the cited physical-placement decision is not a valid referee record"];
  const pins = c.basis.pinned_versions;
  const id = locusIdOf(keep.secret, campaignId, pcId, pins, {
    native: c.basis.qualified_by.native.fact_key,
    physical: c.basis.qualified_by.physical.fact_key,
  });
  const p = publicationOf("locus", id);
  const f = custody.fact;
  if (
    f.version !== 1 ||
    f.provenance.group_id !== p.group_id ||
    f.provenance.intent_id !== p.intent_id ||
    f.provenance.cause !== p.cause ||
    f.basis !== p.basis ||
    f.secrecy !== p.secrecy
  )
    out.push(
      "the custody does not carry the identities this command derives from the confirmed physical reading",
    );
  if (physical.data.verdict !== "PHYSICAL_ELIGIBLE")
    out.push("the cited physical-placement decision is not PHYSICAL_ELIGIBLE");
  return out;
}

const decisionLines = (
  d: PhysicalHostDecision,
  verdict: string,
  host: { host_id: string; claimed_model: string | null },
): string[] => [
  `+--- AI REFEREE FINDINGS: PHYSICAL PLACEMENT (host ${host.host_id}${host.claimed_model ? `, self-reported model ${quoted(host.claimed_model)}` : ""}; verdict ${verdict}) ---`,
  `|   your character's form is read as: ${d.embodiment.mode} - ${quoted(d.embodiment.grounds)}`,
  `|       the words: ${quoted(d.embodiment.evidence_quote)}`,
  `|   your presence is read as: ${d.presence.mode} - ${quoted(d.presence.grounds)}`,
  `|       the words: ${quoted(d.presence.evidence_quote)}`,
  ...d.external_claims.map((x) =>
    x.bearing === "CONTINGENT"
      ? `|   your presence is stated to hold only through something outside you: ${x.kind} - ${quoted(x.grounds)} (${quoted(x.evidence_quote)})`
      : `|   NOT ACCEPTED, NOT COMMITTED (stated beside your presence, which stands on its own words): ${x.kind} - ${quoted(x.grounds)} (${quoted(x.evidence_quote)})`,
  ),
  ...d.assessments
    .filter((a) => a.relation !== "NOT_RELEVANT")
    .map((a) => `|   ${a.fact_id}: ${a.relation} - ${quoted(a.grounds)}`),
  ...(d.clarification ? [`|   question for you: ${quoted(d.clarification)}`] : []),
  "+---",
];

export async function establishCharacterLocus(
  p: EstablishCharacterLocusParams,
): Promise<CharacterResult> {
  if (!EntityId.safeParse(p.pcId).success)
    return result("INVALID_REQUEST", ["the character identity is not valid"]);
  const opened = await openSession({
    campaignDir: p.campaignDir,
    campaignId: p.campaignId,
    ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
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
  p: EstablishCharacterLocusParams,
  session: LocalOperatorSession,
): Promise<CharacterResult> {
  const { terminal, pcId, campaignId } = p;
  const campaign = session.campaign;
  const rt = runtimeOf(
    {
      campaignDir: p.campaignDir,
      campaignId,
      worldId: "",
      locusId: "",
      pcId,
      terminal,
      ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
      ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
      ...(p.refereePolls !== undefined ? { refereePolls: p.refereePolls } : {}),
      ...(p.refereePollMs !== undefined ? { refereePollMs: p.refereePollMs } : {}),
    },
    session,
  );

  // Only a character this command's `author-character` released AND bound, verified, can be placed physically.
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
  const pc = campaign.playerCharacter(pcId);
  if (!pc || keep === null || keep.pc_id !== pcId)
    return result("CHARACTER_NONE", [
      `no character ${pcId} of \`author-character\` is held for this campaign`,
    ]);
  const released = releaseProblems(campaignId, pc.fact, keep, campaign.store);
  if (released.length > 0) return result("CHARACTER_CONFLICT", released);
  const binding = campaign.binding();
  if (!binding)
    return result("CHARACTER_RELEASED_UNBOUND", [
      `character: ${pc.fact.key}`,
      "the character is not bound: run author-character first; a physical position is never established for an unbound character",
    ]);
  const bound = bindingProblems({ campaign, campaignId, keep }, pc.fact);
  if (bound.length > 0 || campaign.verify().length > 0)
    return result("BINDING_CONFLICT", [
      ...bound,
      ...(campaign.verify().length > 0 ? ["canonical integrity reports violations"] : []),
    ]);

  // already established: verify and report (a lost reply, or a second run, converges here and writes nothing)
  if (campaign.pcPhysicalLocusCustody(pcId)) {
    const why = custodyProblems(campaign, campaignId, pcId, keep);
    return why.length === 0
      ? establishedReport(campaign, pcId, campaignId)
      : result("LOCUS_CONFLICT", why);
  }
  const nativeKey = nativeDecisionKey(campaign);
  if (nativeKey === null)
    return result("BINDING_CONFLICT", ["the binding cites no native/compatibility decision"]);

  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const worldId = binding.value.coupling.world.entity_id;
  const locusId = binding.value.coupling.locus.entity_id;
  for (const l of [
    "PHYSICAL LOCUS - a third, separate choice. Nothing physical is held yet.",
    OOC_BANNER,
    `character: ${pcId}`,
    `world ${worldId}, locus ${locusId}`,
    `your confirmed native-presence statement, kept verbatim: ${quoted(binding.value.transition.type === "ACTIVATION" ? binding.value.transition.basis.statement : "")}`,
    "The binding records that your character is originally present there, and gives it no physical position. Asking the AI referee host whether your character's own words and that statement describe ONE material physical body at exactly that locus ...",
  ])
    p.terminal.say(l);
  const asked = await askPhysical(adapter, rt, { campaign_id: campaignId, pc_id: pcId });
  if (asked.kind !== "ANSWERED") {
    const detail = [`character: ${pc.fact.key} (bound, no physical locus)`];
    return asked.kind === "PENDING"
      ? result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`])
      : asked.kind === "UNAVAILABLE"
        ? result("REFEREE_UNAVAILABLE", [...detail, asked.message], asked.code)
        : result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);
  }
  const findings = decisionLines(asked.decision, asked.verdict, asked.host);
  for (const l of findings) p.terminal.say(l);
  if (asked.verdict !== "PHYSICAL_ELIGIBLE")
    return result("LOCUS_NOT_QUALIFIED", [
      `character: ${pc.fact.key} (bound, no physical locus)`,
      `verdict: ${asked.verdict}`,
    ]);

  const ctx = asked.context;
  const pins = {
    pc: pc.fact.version,
    binding: binding.fact.version,
    world: campaign.world(worldId)!.fact.version,
    locus: campaign.locus(worldId, locusId)!.fact.version,
  };
  const subject = subjectOf({
    verb: "establish-character-locus",
    campaign_id: campaignId,
    pc_id: pcId,
    world_id: worldId,
    locus_id: locusId,
    pins,
    statement: ctx.statement,
    native_decision: nativeKey,
    referee_task: asked.task_id,
  });
  const decision = await requestOperatorDecision(
    p.terminal,
    "establish-character-locus",
    subject,
    [
      "CONFIRMATION - PHYSICAL LOCUS (the third, separate choice)",
      `  character: ${pcId}`,
      `  world: ${worldId} v${pins.world}, locus: ${locusId} v${pins.locus}`,
      `  your native-presence statement, kept verbatim: ${quoted(ctx.statement)}`,
      "  Confirming records, in World-State's custody, that this ONE material character is physically at exactly this locus, stationary, on the reading above.",
      "  It gives the character no perception, knowledge, action, capability, movement, elapsed time, access, rights or any non-player character's cooperation.",
      ...asked.decision.external_claims.map(
        (x) =>
          `  NOT recorded or accepted by this confirmation (an unverified claim of yours, not a fact of the world): ${quoted(x.evidence_quote)}`,
      ),
    ],
    "Anything else leaves your character bound but without a physical position.",
    asked.decision,
  );
  if (
    decision.kind !== "CONFIRMED" ||
    !consumeConfirmation(decision.confirmation, "establish-character-locus", subject)
  )
    return result("DECLINED", ["the physical locus was not confirmed; nothing was changed"]);

  // the referee's physical-placement reading of exactly this confirmed question is retained as create-only evidence, then World-State reads it
  const recorded = await adapter.recordPhysical({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
    pc_id: pcId,
    attempt: asked.attempt,
    answer: asked.decision,
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
  p.terminal.say(`PROGRESS referee DECIDED ${recorded.value.record.key}`);

  const id = locusIdOf(keep.secret, campaignId, pcId, pins, {
    native: nativeKey,
    physical: recorded.value.record.key,
  });
  const established = await campaign.establishOriginalPcPhysicalLocusCustody({
    ...publicationOf("locus", id),
    pc_id: pcId,
    native_qualified_by: nativeKey,
    physical_qualified_by: recorded.value.record.key,
  });
  if (!established.ok) {
    if (UNKNOWN_OUTCOME.has(established.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [
        `character ${pcId}: bound`,
        `physical locus: ${established.error.code}`,
      ]);
    }
    return result(
      "CHARACTER_REFUSED",
      [`physical locus: ${established.error.code}`, established.error.message],
      established.error.code,
    );
  }
  p.terminal.say(
    `PROGRESS physical locus COMMITTED ${campaign.pcPhysicalLocusCustody(pcId)?.fact.key}`,
  );
  await closeQuietly(session);

  // a fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok) return result("LOCUS_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const problems = [
      ...(c.store.head().campaign_id !== campaignId
        ? ["the reopened campaign has another identity"]
        : []),
      ...(c.verify().length > 0 ? ["canonical integrity reports violations"] : []),
      ...custodyProblems(c, campaignId, pcId, keep),
    ];
    return problems.length > 0
      ? result("LOCUS_VERIFICATION_FAILED", problems)
      : establishedReport(c, pcId, campaignId);
  } finally {
    await closeQuietly(reopened.value);
  }
}

function establishedReport(
  campaign: CanonicalCampaign,
  pcId: string,
  campaignId: string,
): CharacterResult {
  const custody = campaign.pcPhysicalLocusCustody(pcId)!;
  const c = custody.value;
  const physicalFact: OwnerFact | undefined =
    c.basis.established_from === "ACTIVATION"
      ? campaign.store.getFact(c.basis.qualified_by.physical.fact_key)
      : undefined;
  const parsed = physicalFact
    ? RefereeDecisionRecordSchema.safeParse(physicalFact.value)
    : undefined;
  return result("LOCUS_ESTABLISHED", [
    `campaign: ${campaignId}`,
    factLine("physical-locus custody", custody.fact),
    `stationary at: ${c.stationary_locus.world.entity_id} / ${c.stationary_locus.locus.entity_id}`,
    ...(parsed?.success
      ? [
          `referee physical-placement reading: ${physicalFact!.key} host ${parsed.data.host.host_id}${parsed.data.host.claimed_model ? ` (self-reported model ${quoted(parsed.data.host.claimed_model)})` : ""} verdict ${parsed.data.verdict}`,
        ]
      : []),
    `current locus (from custody only): ${campaign.pcCurrentLocus(pcId)?.stationary ? "stationary" : "not stationary"}`,
  ]);
}
