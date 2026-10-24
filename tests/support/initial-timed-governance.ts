/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw governance documents */
// TEST SUPPORT for the initial timed governance opening. The document is the operator's own authored content, written to a local file
// exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality` path (ordinary canonical registry, no
// fixture owner), the Temporal owner's canonical time T0 is established by the Temporal owner's own operation (a disposable scenario
// premise: the command under test neither creates nor chooses time), and nothing here supplies an owner result, a lifecycle status or a
// confirmation (the scripted console only TYPES in answer to the challenge the service printed). The later advance is a test exercise of
// the EXISTING Temporal route with the genuine GIP sunset provider; it is not part of the command and no fixture asserts its result.
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  gipInstrumentKey,
  type CanonicalTime,
  type GovernanceInstrument,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  gipSunsetExpiryProvider,
} from "@immortalis/engine";
import { at, temporalPublication } from "@immortalis/testkit";
import {
  establishInitialTimedGovernance,
  type EstablishInitialTimedGovernanceParams,
} from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import { runShipped, type LocalityDirs } from "./locality.ts";
import { tempDir } from "./tmp.ts";

export {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  freshDirs,
  headOf,
  openOrdinary,
} from "./locality.ts";
export { bindPlayer, localityCampaign } from "./additional-source.ts";

import { LOCALITY_CAMPAIGN, openOrdinary } from "./locality.ts";
import { localityCampaign } from "./additional-source.ts";

export const INSTITUTION_ID = "institution-salt-moot";
export const OFFICE_ID = "office-pan-warden";
export const BINDING_ID = "scope-pan-rights";
export const INSTRUMENT_ID = "instrument-pan-ordinance";
export const HOLDER_REF = "holder-ref-warden-seat";
export const DECISION_BODY_REF = "decision-body-ref-moot-table";

/** The canonical time the disposable scenario's Temporal owner establishes, the exact future sunset, and two later instants. */
export const T_OPEN: CanonicalTime = at(100);
export const T_BEFORE: CanonicalTime = at(199);
export const T_SUNSET: CanonicalTime = at(200);
export const T_AFTER: CanonicalTime = at(260);

export const PUBLICATION = {
  basis: "operator-stipulated-opening",
  secrecy: "operator-session-only",
};

/** The four authored records at the brief's bounded family, every field explicit and nothing defaulted. */
export const institutionDoc = (over: Record<string, unknown> = {}): any => ({
  institution_id: INSTITUTION_ID,
  identity_label: "The Moot of the Salt Pans, a continuing local assembly",
  continuity_status: "continuing",
  constitutive_source_ref: "source-first-pan-compact",
  ...over,
});

export const officeDoc = (over: Record<string, unknown> = {}): any => ({
  office_id: OFFICE_ID,
  institution_id: INSTITUTION_ID,
  authority_source_ref: "source-first-pan-compact",
  competence_scope: "Allotment of the pans and the keeping of the tide-tally.",
  powers: ["Assign a pan to a household for a season.", "Call the moot."],
  duties: ["Keep the tide-tally."],
  selection_rule: "Chosen by the moot at midsummer.",
  succession_rule: "The moot names a successor when the seat falls empty.",
  removal_rule: "Removable by the moot.",
  holder_ref: HOLDER_REF,
  ...over,
});

export const bindingDoc = (over: Record<string, unknown> = {}): any => ({
  scope_binding_id: BINDING_ID,
  institution_id: INSTITUTION_ID,
  office_id: OFFICE_ID,
  scope_type: "the salt pans of the hamlet",
  scope_ref: "scope-ref-hamlet-pans",
  target_condition: "Applies to any household that works a pan.",
  inheritance_rule: "Applies to pans later added to the hamlet.",
  exception_refs: ["exception-ref-quay-store"],
  priority_or_conflict_rule_ref: "rule-ref-older-pan-first",
  ...over,
});

export const instrumentDoc = (over: Record<string, unknown> = {}): any => ({
  instrument_id: INSTRUMENT_ID,
  source_authority_ref: `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}`,
  authority_basis_ref: "basis-ref-moot-assent",
  operative_effect: "authority_grant",
  scope_binding_ref: `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}/scope-binding/${BINDING_ID}`,
  validity_by_order: [
    { governing_order_ref: "order-ref-marsh-custom", validity_status: "valid" },
    { governing_order_ref: "order-ref-county-writ", validity_status: "contested" },
  ],
  lifecycle_status: "active",
  sunset_condition: { ...T_SUNSET },
  ...over,
});

/** A complete, valid, operator-authored governance document (a fresh copy each call). */
export const governanceDoc = (): any => ({
  format: "immortalis-initial-timed-governance",
  format_version: 1,
  publication: { ...PUBLICATION },
  canonical_time: { ...T_OPEN },
  institution: institutionDoc(),
  office: officeDoc(),
  scope_binding: bindingDoc(),
  instrument: instrumentDoc(),
});

/** Writes a governance document as an operator would: a private regular file in a private directory. */
export function writeGovernance(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-initial-timed-governance-");
  const file = join(dir, "governance.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/** The Temporal owner establishes the campaign's canonical basis (a disposable scenario premise, never the command under test). */
export async function establishTime(
  dirs: LocalityDirs,
  time: CanonicalTime = T_OPEN,
): Promise<void> {
  const campaign = await openOrdinary(dirs.campaignDir);
  try {
    const r = await new TemporalCoordinator(
      campaign.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({ ...temporalPublication(1), time });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  } finally {
    await campaign.close();
  }
}

/** A campaign whose ORIGINAL locality the shipped `establish-locality` committed and whose Temporal owner holds canonical time T_OPEN. */
export async function timedCampaign(): Promise<LocalityDirs> {
  const dirs = await localityCampaign();
  await establishTime(dirs);
  return dirs;
}

export const governanceArgs = (
  dirs: LocalityDirs,
  governanceFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-timed-governance",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--governance-file",
  governanceFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runGovernance = (
  dirs: LocalityDirs,
  governanceFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(governanceArgs(dirs, governanceFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addGovernance(
  dirs: LocalityDirs,
  governanceFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishInitialTimedGovernanceParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishInitialTimedGovernance({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    governanceFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}

/** What the store holds of the opening, read through the GIP owner's own typed reads. */
export async function held(dir: string) {
  const c = await openOrdinary(dir);
  try {
    const gip = new GipAdapter(c.store);
    return {
      institution: gip.institutionIdentity(INSTITUTION_ID) !== undefined,
      office: gip.officeAuthorityLocus(INSTITUTION_ID, OFFICE_ID) !== undefined,
      scope_binding: gip.scopeBinding(INSTITUTION_ID, OFFICE_ID, BINDING_ID) !== undefined,
      instrument: gip.governanceInstrument(INSTRUMENT_ID) !== undefined,
      registered: gip.sunsetEnrollment()?.registered ?? false,
      violations: c.verify(),
    };
  } finally {
    await c.close();
  }
}

// -- the disposable integration witness: the EXISTING Temporal route with GIP's genuine sunset provider -----------------------------

export interface Witness {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly gip: GipAdapter;
}

/** Opens the finished campaign with the ordinary registry and the genuine GIP sunset stage provider (the existing owner operation). */
export async function openWitness(dir: string): Promise<Witness> {
  const campaign = await openOrdinary(dir);
  return {
    campaign,
    coordinator: new TemporalCoordinator(
      campaign.store,
      new StageProviderRegistry([gipSunsetExpiryProvider]),
    ),
    gip: new GipAdapter(campaign.store),
  };
}

/** The separately authorized, exact-target player progression choice (a scripted test exercise of the existing route). */
export const advanceTo = (
  id: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "player-ooc-advance-choice", ref: `choice-${id}` },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

export const lifecycleOf = (w: Pick<Witness, "campaign">): string =>
  (w.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_ID))!.value as GovernanceInstrument)
    .lifecycle_status;
