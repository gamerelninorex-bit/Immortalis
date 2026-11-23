/* eslint-disable @typescript-eslint/no-explicit-any -- the rigs poke at raw groups, manifests, journal bytes and stores */
// TEST SUPPORT for F-014B B2 (GM-wait custody: marker, by-PC index, separate OPEN, W2 fence, recovery). Nothing here is production code and
// nothing here judges. Every positive built here is a SCRIPTED TESTKIT mechanism exercise: the preparation is a synthetic fixture fact under a
// synthetic extension owner, the origin proof is a labelled double, and the production admission refuses all of it (see the production-denial
// test). It is mechanism evidence, never a live GM wait, a genuine AI GM, a named client or a matched H-07 result.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANON_WRITE_AUTHORITY,
  JournalEntrySchema,
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  canonicalJson,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
  type GmWaitPreparation,
  type JournalEntry,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CampaignCore,
  CanonicalCampaign,
  GmWaitCustody,
  StageProviderRegistry,
  TemporalCoordinator,
  entryHash,
  factKind,
  fixtureCanonicalAdmission,
  gmWaitOriginProof,
  gmWaitTransactionId,
  groupSha256,
  openFileCampaign,
  sha256Canonical,
  stateSha256,
  stateToFile,
  storeBindings,
  transactionAuthorityGroupId,
  type CampaignState,
  type CampaignStore,
  type GmWaitMarkerInput,
  type GmWaitOriginProof,
  type WriteAdmission,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  SYNTH_EXTENSION,
  SYNTH_FACET,
  SYNTH_OWNER,
  SYNTH_RULE,
  T0,
  at,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  syntheticSourceGroup,
  temporalPublication,
} from "@immortalis/testkit";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { tempDir } from "../support/tmp.ts";
import { must } from "../support/temporal.ts";

export { FIXTURE_CAMPAIGN, FIXTURE_PC_ID, SYNTH_EXTENSION, SYNTH_OWNER, T0, at, must, tempDir };

export const TARGET = at(160);
export const PUB = { basis: "fixture-basis", secrecy: "fixture-visibility" } as const;
export const SESSION = "session-original-1";
export const RPC_NUMERIC_1 = "1"; // the already-serialized text of the numeric JSON-RPC id 1 (JSON.stringify(1))
export const RPC_STRING_1 = '"1"'; // the already-serialized text of the string JSON-RPC id "1"
export const HOST = "authenticated-host-1";
export const FIXTURE_ADMISSION = fixtureCanonicalAdmission;
export const NOW_SHA = GM_WAIT_CATALOGUE_CURRENT_SHA256;
export const SOURCE_KEY = "synthetic/source/1";

export const proofOf = (
  session = SESSION,
  rpc: string = RPC_NUMERIC_1,
  host = HOST,
): GmWaitOriginProof => {
  const p = gmWaitOriginProof({
    sessionId: session,
    rpcIdSerialized: rpc,
    authenticatedHostRef: host,
  });
  if (!p.ok) throw new Error(JSON.stringify(p.error));
  return p.value;
};

export interface Rig {
  readonly dir: string;
  readonly campaign: CanonicalCampaign;
  readonly store: CampaignStore;
  readonly custody: GmWaitCustody;
  readonly proof: GmWaitOriginProof;
  readonly prep: GmWaitPreparation;
}

export const custodyPolicy = (admission: WriteAdmission = FIXTURE_ADMISSION) => ({
  catalogueSha256: NOW_SHA,
  historyVerificationId: admission.historyVerificationId!,
  kernelRule: factKind("temporal_state").rule,
});

export const prepOf = (store: CampaignStore, key = SOURCE_KEY): GmWaitPreparation => {
  const f = store.getFact(key)!;
  return {
    kind: "OWNER_PENDING_ENROLMENT",
    owner: SYNTH_OWNER,
    fact: { key, version: f.version, group_id: f.provenance.group_id },
    digest: sha256Canonical(f.value),
  };
};

/** The prerequisite campaign of the Temporal slice (world, locus, released PC, active binding, synthetic source, canonical time T0). */
export async function seededRig(
  dir: string,
  o: { admission?: WriteAdmission; extraSources?: number } = {},
): Promise<Rig> {
  const admission = o.admission ?? FIXTURE_ADMISSION;
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "b2",
      extension: SYNTH_EXTENSION,
      testkitFixtureAdmission: admission,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  await must(
    campaign.initializePcStandingInstructionLedger({
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
    }),
  );
  await must(
    campaign.bindPlayerCharacter({
      ...publication(4),
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      insertion: fixtureInsertionFact(),
    }),
  );
  await must(campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 1, "source-v1", 0)));
  for (let i = 0; i < (o.extraSources ?? 0); i++) {
    await must(
      campaign.store.commit(
        syntheticSourceGroup(
          FIXTURE_CAMPAIGN,
          100 + i,
          `dormant-${i}`,
          0,
          `synthetic/dormant/${i}`,
        ),
      ),
    );
  }
  const coordinator = new TemporalCoordinator(campaign.store, new StageProviderRegistry());
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return {
    dir,
    campaign,
    store: campaign.store,
    custody: new GmWaitCustody(campaign.store, custodyPolicy(admission)),
    proof: proofOf(),
    prep: prepOf(campaign.store),
  };
}

export const markerInput = (
  rig: Pick<Rig, "proof" | "prep">,
  over: Partial<Omit<GmWaitMarkerInput, "campaignId" | "policy">> = {},
): Omit<GmWaitMarkerInput, "campaignId" | "policy"> => ({
  proof: rig.proof,
  initialRequestSha256: "a".repeat(64),
  request: {
    cause: "gm-wait-cause-1",
    triggerRef: "trigger-ref-1",
    target: TARGET,
    publication: { ...PUB },
  },
  preparation: rig.prep,
  ...over,
});

/**
 * Opens the package through the SAME composition the canonical campaign uses (the extension binding around the given admission), counting every
 * journal entry the historical verifier judges, extension-owner groups included (the extension binding answers those itself, so a counter placed on
 * the inner admission would miss them). It returns the opened store and the count.
 */
export async function openCounting(
  dir: string,
  admission: WriteAdmission = FIXTURE_ADMISSION,
  o: { audit?: boolean } = {},
) {
  const bindings = storeBindings(SYNTH_EXTENSION, admission);
  if (!bindings.ok) throw new Error("bindings");
  let calls = 0;
  const counted: WriteAdmission = {
    ...bindings.value.admission,
    verifyHistorical: (g, s) => {
      calls++;
      return bindings.value.admission.verifyHistorical!(g, s);
    },
  };
  const opened = await openFileCampaign(dir, {
    buildId: "b2-counting",
    owners: bindings.value.owners,
    admission: counted,
    ...(o.audit ? { audit: true } : {}),
  });
  return { opened, calls: () => calls };
}

/** Re-opens a campaign under the fixture admission (or another), extension registered. */
export async function reopen(
  dir: string,
  admission: WriteAdmission = FIXTURE_ADMISSION,
  o: { audit?: boolean } = {},
) {
  return CanonicalCampaign.open(dir, {
    buildId: "b2-reopen",
    extension: SYNTH_EXTENSION,
    testkitFixtureAdmission: admission,
    ...(o.audit ? { audit: true } : {}),
  });
}

export async function reopenRig(
  dir: string,
  admission: WriteAdmission = FIXTURE_ADMISSION,
): Promise<Rig> {
  const campaign = await must(reopen(dir, admission));
  return {
    dir,
    campaign,
    store: campaign.store,
    custody: new GmWaitCustody(campaign.store, custodyPolicy(admission)),
    proof: proofOf(),
    prep: prepOf(campaign.store),
  };
}

/** The whole lawful lifecycle up to and including a chosen step. */
export async function lifecycle(
  rig: Rig,
  upTo: "marker" | "open" | "seal" | "reconcile",
): Promise<{ x: string }> {
  const m = await must(rig.custody.publishMarker(markerInput(rig)));
  if (upTo === "marker") return { x: m.x };
  await must(rig.custody.open(rig.proof));
  if (upTo === "open") return { x: m.x };
  await must(rig.custody.sealOwn(m.x));
  if (upTo === "seal") return { x: m.x };
  await must(rig.custody.reconcile(rig.proof));
  return { x: m.x };
}

export const txOf = (x: string) => gmWaitTransactionId(x);
export const authorityGroupOf = (store: CampaignStore, x: string) =>
  store.getFact(temporalTransactionAuthorityKey(txOf(x)))!.provenance.group_id;
export const sealFactOf = (store: CampaignStore, x: string) =>
  store.getFact(temporalTransactionKey(txOf(x)));

/** An owner-stage-shaped group of a synthetic extension owner: the cause every stage of `tx` carries and a dependency on its opening. */
export function stageGroup(
  x: string,
  authorityGroupId: string,
  n: number,
  key = `synthetic/stage/${n}`,
): CommitGroup {
  const g = syntheticSourceGroup(FIXTURE_CAMPAIGN, 500 + n, `stage-${n}`, 0, key);
  return {
    ...g,
    group_id: `b2-stage-group-${n}`,
    intent_id: `b2-stage-intent-${n}`,
    cause: `transaction:${txOf(x)}`,
    depends_on: [authorityGroupId],
    rule: SYNTH_RULE,
  };
}

/** A foreign novel group of the synthetic extension owner (no stage cause, no dependency on any opening). */
export const foreignGroup = (n: number, key = `synthetic/foreign/${n}`): CommitGroup =>
  syntheticSourceGroup(FIXTURE_CAMPAIGN, 700 + n, `foreign-${n}`, 0, key);

export { SYNTH_FACET, SYNTH_RULE };

// ---------------------------------------------------------------------------------------------------------------------------
// package introspection and the forger of a STRUCTURALLY VALID journal entry

export const manifestOf = (dir: string): any =>
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
export const journalOf = (dir: string): JournalEntry[] => {
  const m = manifestOf(dir);
  return readFileSync(join(dir, "journal.jsonl"))
    .subarray(0, m.head.journal_bytes)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JournalEntrySchema.parse(JSON.parse(l)));
};

export function copyPackage(from: string): string {
  const to = tempDir("b2-copy-");
  const walk = (a: string, b: string) => {
    mkdirSync(b, { recursive: true });
    for (const e of readdirSync(a, { withFileTypes: true })) {
      if (e.name === "LOCK" || e.name.startsWith("LOCK.")) continue;
      if (e.isDirectory()) walk(join(a, e.name), join(b, e.name));
      else copyFileSync(join(a, e.name), join(b, e.name));
    }
  };
  walk(from, to);
  return to;
}

/**
 * Lowers a closed v2 package to the equivalent v1 snapshot (the independent loader), as `legacyStateFixture` does, but replaying the journal UNDER the
 * fixture admission: a journal that holds GM-wait custody cannot be replayed by a core with no admission (the fence refuses it, by design).
 */
export function lowerToV1(dir: string): void {
  const manifest = manifestOf(dir);
  const entries = journalOf(dir);
  const core = new CampaignCore({
    campaignId: manifest.campaign_id,
    specLockSha256: entries.at(-1)?.receipt.basis.spec_lock_sha256 ?? "0".repeat(64),
    owners: new Map(),
    admission: FIXTURE_ADMISSION,
    state: { campaign_id: manifest.campaign_id, revision: 0, facts: new Map() },
    headSha256: manifest.genesis_sha256,
  });
  for (const e of entries) {
    const r = core.replay(e);
    if (!r.ok) throw new Error(`the package does not replay: ${JSON.stringify(r.error)}`);
  }
  if (stateSha256(core.state) !== manifest.head.state_sha256)
    throw new Error("invalid test snapshot");
  const stateFile = manifest.head.state_file as string;
  writeFileSync(join(dir, stateFile), JSON.stringify(stateToFile(core.state), null, 2));
  const next = { ...manifest, format_version: 1 };
  delete next.genesis_format_version;
  delete next.head.checkpoint;
  delete next.self_sha256;
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ ...next, self_sha256: sha256Canonical(next) }),
  );
}

const INVARIANTS = [
  "authority-present",
  "owner-registered",
  "owner-exclusive",
  "unique-keys-in-group",
  "expected-versions-current",
  "reads-current",
  "dependencies-committed",
] as const;

/**
 * Appends `groups` to a CLOSED package as journal entries whose hash chain, receipts and state digests are all CORRECT, bypassing every
 * admission rule (it reproduces the commit core's own receipt construction from the exported primitives). The result is exactly what an
 * attacker with write access to the files, who recomputes the hashes, would produce: structurally perfect, rule-wise unlawful. A strict
 * replay must refuse it on its OWN rules, not on a broken hash. The package is lowered to the independent v1 loader first.
 */
export function forgeAppend(dir: string, groups: readonly CommitGroup[]): void {
  let manifest = manifestOf(dir);
  if (manifest.format_version === 2) {
    lowerToV1(dir);
    manifest = manifestOf(dir);
  }
  const entries = journalOf(dir);
  const core = new CampaignCore({
    campaignId: manifest.campaign_id,
    specLockSha256: entries[entries.length - 1]!.receipt.basis.spec_lock_sha256,
    owners: new Map(),
    admission: FIXTURE_ADMISSION,
    state: { campaign_id: manifest.campaign_id, revision: 0, facts: new Map() },
    headSha256: manifest.genesis_sha256,
  });
  for (const e of entries) {
    const r = core.replay(e);
    if (!r.ok)
      throw new Error(`the package to forge into does not replay: ${JSON.stringify(r.error)}`);
  }
  let state: CampaignState = core.state;
  let head = core.headSha256;
  let bytes: number = manifest.head.journal_bytes;
  const lock = entries[entries.length - 1]!.receipt.basis.spec_lock_sha256;
  const lines: string[] = [];
  for (const group of groups) {
    const facts = new Map(state.facts);
    for (const w of group.writes) {
      facts.set(w.key, {
        key: w.key,
        owner: w.owner,
        facet: w.facet,
        value: w.value,
        unit: w.unit,
        basis: w.basis,
        secrecy: w.secrecy,
        version: (state.facts.get(w.key)?.version ?? 0) + 1,
        provenance: {
          group_id: group.group_id,
          intent_id: group.intent_id,
          cause: group.cause,
          rule: group.rule,
        },
      } as OwnerFact);
    }
    const next: CampaignState = {
      campaign_id: state.campaign_id,
      revision: state.revision + 1,
      facts,
    };
    const receipt = {
      outcome: "COMMITTED" as const,
      campaign_id: group.campaign_id,
      group_id: group.group_id,
      intent_id: group.intent_id,
      revision: next.revision,
      group_sha256: groupSha256(group),
      state_sha256: stateSha256(next),
      basis: { spec_lock_sha256: lock, rule: group.rule, authority: group.authority },
      invariants: INVARIANTS.map((name) => ({ name, passed: true as const })),
    };
    const partial = { revision: next.revision, prev_sha256: head, group, receipt };
    const entry = { ...partial, entry_sha256: entryHash(partial) };
    lines.push(`${canonicalJson(entry)}\n`);
    head = entry.entry_sha256;
    state = next;
  }
  const appended = lines.join("");
  // the committed prefix, then the forged entries: any uncommitted tail residue is dropped, exactly as an attacker's rewrite would
  writeFileSync(
    join(dir, "journal.jsonl"),
    Buffer.concat([
      readFileSync(join(dir, "journal.jsonl")).subarray(0, bytes),
      Buffer.from(appended),
    ]),
  );
  bytes += Buffer.byteLength(appended);
  const stateFile = `state.${String(state.revision).padStart(10, "0")}.json`;
  writeFileSync(join(dir, stateFile), JSON.stringify(stateToFile(state), null, 2));
  if (manifest.head.state_file !== stateFile)
    rmSync(join(dir, manifest.head.state_file), { force: true });
  const { self_sha256: _drop, ...rest } = manifest;
  void _drop;
  const next = {
    ...rest,
    head: {
      ...rest.head,
      revision: state.revision,
      state_file: stateFile,
      state_sha256: stateSha256(state),
      journal_entries: manifest.head.journal_entries + groups.length,
      journal_bytes: bytes,
      journal_head_sha256: head,
    },
  };
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ ...next, self_sha256: sha256Canonical(next) }),
  );
}

export const kernelGroupBase = (
  g: Partial<CommitGroup>,
): Pick<CommitGroup, "campaign_id" | "authority"> => ({
  campaign_id: FIXTURE_CAMPAIGN,
  authority: { ...CANON_WRITE_AUTHORITY },
  ...g,
});

export { PLAYER_CHARACTER_BINDING_KEY, TEMPORAL_STATE_KEY, transactionAuthorityGroupId };
