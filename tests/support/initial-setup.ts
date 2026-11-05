/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// TEST SUPPORT for the Initial Locality Bootstrap v0.9 (T1: MECHANISM ONLY). Everything signed or "verified" here is a labelled
// fixture double; nothing in this file is, or can be reported as, original-message authenticity, a genuine isolated model driver
// or a named-client result (those are T2/T3 and remain UNRUN).
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CanonicalCampaign,
  fixtureCanonicalAdmission,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ChronologyCaptureStore,
  InitialSetupService,
  PrivateRunner,
  captureStartingChronology,
} from "@immortalis/operator";
import {
  FIXTURE_KEY_ID,
  FIXTURE_MESSAGE_METHOD,
  FIXTURE_SETUP_MESSAGE,
  FixtureEvidenceVerifier,
  ScriptedIsolatedDriver,
  delegatingScene,
  delegatingScope,
  fixtureLocus,
  fixtureWorld,
  generateFixtureRunnerKeys,
  publication,
  sourceInput,
  fixtureProofHash,
  type ScriptedAnswers,
} from "@immortalis/testkit";
import { setupMessageHash } from "@immortalis/engine";
import { must } from "./temporal.ts";

export const BOOTSTRAP_CAMPAIGN = "campaign-bootstrap-1";
export const FIXTURE_POLICY = { syntheticEvidence: "REQUIRE" } as const;
export const CHRONOLOGY_DOC = {
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit: "seconds", value: 0 },
  statement: "SYNTHETIC FIXTURE: the first light of the first morning",
} as const;

export const scratch = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

/** A fresh original world/locus/source with NO PC, no binding and no canonical time, under the T1 fixture admission. */
export async function openFixtureCampaign(
  campaignId = BOOTSTRAP_CAMPAIGN,
  sourceOver: Record<string, unknown> = {},
) {
  const dir = scratch("immortalis-bootstrap-campaign-");
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId,
      buildId: "bootstrap-t1",
      testkitFixtureAdmission: fixtureCanonicalAdmission,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(
    campaign.establishSourceCondition({ ...publication(3), source: sourceInput(sourceOver) }),
  );
  return { campaign, dir };
}

export const reopenFixtureCampaign = (dir: string) =>
  CanonicalCampaign.open(dir, { testkitFixtureAdmission: fixtureCanonicalAdmission });

export interface Harness {
  readonly campaign: CanonicalCampaign;
  readonly store: CampaignStore;
  readonly dir: string;
  readonly runner: PrivateRunner;
  readonly driver: ScriptedIsolatedDriver;
  readonly verifier: FixtureEvidenceVerifier;
  readonly service: InitialSetupService;
  readonly captureStore: ChronologyCaptureStore;
  readonly macKey: Buffer;
  readonly outboxDir: string;
  readonly keys: ReturnType<typeof generateFixtureRunnerKeys>;
}

export async function harness(
  options: {
    answers?: ScriptedAnswers;
    open?: Awaited<ReturnType<typeof openFixtureCampaign>>;
    outboxDir?: string;
    macKey?: Buffer;
    keys?: ReturnType<typeof generateFixtureRunnerKeys>;
    driver?: ScriptedIsolatedDriver;
  } = {},
): Promise<Harness> {
  const open = options.open ?? (await openFixtureCampaign());
  const keys = options.keys ?? generateFixtureRunnerKeys();
  const macKey = options.macKey ?? randomBytes(32);
  const outboxDir = options.outboxDir ?? scratch("immortalis-bootstrap-outbox-");
  const driver =
    options.driver ??
    new ScriptedIsolatedDriver(
      options.answers ?? { scope: delegatingScope(), scene: delegatingScene() },
    );
  const runner = new PrivateRunner({
    keyId: keys.keyId,
    privateKeyPkcs8Base64: keys.privateKeyPkcs8Base64,
    publicKeySpkiBase64: keys.publicKeySpkiBase64,
    driver,
    outboxDir,
    macKey,
  });
  const verifier = new FixtureEvidenceVerifier();
  const service = new InitialSetupService({
    campaignId: BOOTSTRAP_CAMPAIGN,
    store: open.campaign.store,
    runner,
    verifier: verifier as any,
    policy: FIXTURE_POLICY,
  });
  const captureStore = new ChronologyCaptureStore({ dir: outboxDir, macKey });
  return {
    campaign: open.campaign,
    store: open.campaign.store,
    dir: open.dir,
    runner,
    driver,
    verifier,
    service,
    captureStore,
    macKey,
    outboxDir,
    keys,
  };
}

/** Captures the author's chronology (record-only) with the T1 fixture source, then returns the intake request. */
export async function intakeRequest(
  h: Harness,
  over: { message?: string; doc?: any; request?: string } = {},
) {
  const message = over.message ?? FIXTURE_SETUP_MESSAGE;
  const author = h.verifier.authoredEvidence({
    message,
    request_ref: `fixture:request:${over.request ?? "1"}`,
  });
  const captured = await captureStartingChronology(
    {
      campaignId: BOOTSTRAP_CAMPAIGN,
      store: h.captureStore,
      verifier: h.verifier as any,
      policy: FIXTURE_POLICY,
    },
    {
      capture_ref: `fixture:capture:${over.request ?? "1"}`,
      document: over.doc ?? CHRONOLOGY_DOC,
      grade: "ORIGINAL_MESSAGE_VERIFIED",
      source: {
        client: author.client,
        oauth_grant: author.oauth_grant,
        request_ref: author.request_ref,
        original_message_hash: setupMessageHash(message),
        method_id: FIXTURE_MESSAGE_METHOD,
        attestation_hash: fixtureProofHash(setupMessageHash(message)),
      },
    },
  );
  if (!captured.ok) throw new Error(`capture failed: ${captured.error.message}`);
  return {
    client: author.client,
    oauth_grant: author.oauth_grant,
    authenticated_setup_request_id: `fixture:setup-request:${over.request ?? "1"}`,
    message,
    author,
    chronology: captured.value,
  };
}

/** The emitted bootstrap kind sequence, in commit order, derived from the journal's own groups. */
export function emittedKinds(store: CampaignStore): string[] {
  return store
    .listFacts()
    .slice()
    .sort((a, b) => a.provenance.group_id.localeCompare(b.provenance.group_id))
    .map((f) => f.key)
    .filter((k) => k.includes("/initial-setup/") || k.startsWith("referee/"));
}

export { FIXTURE_KEY_ID };

// ---------------------------------------------------------------------------------------------------------------------
// Raw-boundary helpers for the falsifiers: build exactly what the trusted service builds, so a test can substitute one premise.
// ---------------------------------------------------------------------------------------------------------------------
import {
  InitialSetupInputSchema,
  InitialSetupInvocationSchema,
  INITIAL_LOCALITY_PARSER_V2,
  type InitialSetupResponse,
  type Pin,
  type SetupPhase,
} from "@immortalis/contracts";
import {
  InitialSetupPublisher,
  buildProducerInput,
  genesisProjection,
  scanInitialSetup,
  sha256Bytes,
} from "@immortalis/engine";
import type { DispatchOutcome, DispatchRequest } from "@immortalis/operator";

export const factsOf = (store: CampaignStore) => new Map(store.listFacts().map((f) => [f.key, f]));
const pinOf = (f: { key: string; version: number }): Pin => ({
  fact_key: f.key,
  version: f.version,
});

/** The dispatch request for a session's SCOPE reservation (the reservation must already be committed). */
export function scopeDispatchRequest(h: Harness, setupId: string): DispatchRequest {
  const facts = factsOf(h.store);
  const session = scanInitialSetup(facts).sessions.get(setupId)!;
  const input = InitialSetupInputSchema.parse(session.input.value);
  const inv = InitialSetupInvocationSchema.parse(session.scopeReservation!.value);
  const projection = genesisProjection(facts);
  if (!projection.ok) throw new Error("genesis projection unavailable");
  const built = buildProducerInput({
    campaign_id: BOOTSTRAP_CAMPAIGN,
    phase: "SCOPE",
    input_pin: pinOf(session.input),
    input,
    genesis: projection.value.facts,
  });
  if (!built.ok) throw new Error(built.error.message);
  return {
    campaign_id: BOOTSTRAP_CAMPAIGN,
    world_id: input.world_id,
    locus_id: input.locus_id,
    setup_id: setupId,
    phase: "SCOPE",
    task_id: inv.task_id,
    reservation: pinOf(session.scopeReservation!),
    input_hash: inv.input_hash,
    projection_hash: input.projection_hash,
    producerInput: built.value.bytes,
  };
}

/** A second, healthy runner that holds the given key material (for the right key, or for a wrong one). */
export function runnerWith(
  h: Harness,
  keys: ReturnType<typeof generateFixtureRunnerKeys>,
  answers: ScriptedAnswers = { scope: delegatingScope(), scene: delegatingScene() },
): PrivateRunner {
  return new PrivateRunner({
    keyId: keys.keyId,
    privateKeyPkcs8Base64: keys.privateKeyPkcs8Base64,
    publicKeySpkiBase64: keys.publicKeySpkiBase64,
    driver: new ScriptedIsolatedDriver(answers),
    outboxDir: scratch("immortalis-bootstrap-outbox-"),
    macKey: h.macKey,
  });
}

/** The canonical Response record for a runner outcome, as the trusted service would form it. */
export function responseFrom(
  req: DispatchRequest,
  outcome: Extract<DispatchOutcome, { status: "RESPONDED" }>,
): InitialSetupResponse {
  return {
    world_id: req.world_id,
    locus_id: req.locus_id,
    setup_id: req.setup_id,
    reservation: req.reservation,
    phase: req.phase as SetupPhase,
    task_id: req.task_id,
    input_hash: req.input_hash,
    raw_response_base64: Buffer.from(outcome.raw).toString("base64"),
    raw_response_hash: sha256Bytes(outcome.raw),
    envelope: outcome.envelope,
    parser: INITIAL_LOCALITY_PARSER_V2,
  };
}

export const commitResponse = (h: Harness, r: InitialSetupResponse) =>
  new InitialSetupPublisher(h.store).response(r);

export const reasonOf = (r: { ok: boolean; error?: { details?: unknown } }): string | undefined =>
  (r.error?.details as { reason?: string } | undefined)?.reason;
