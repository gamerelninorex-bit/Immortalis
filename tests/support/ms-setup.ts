import { randomBytes } from "node:crypto";
import {
  CanonicalCampaign,
  fixtureMsCanonicalAdmission,
  msContextManifestHash,
  sha256Bytes,
  type CampaignState,
  type StageOwnerExtension,
} from "@immortalis/engine";
import type { CommitGroup } from "@immortalis/contracts";
import { MsActorRunner, MsInitialActorService, type IntakeResult } from "@immortalis/operator";
import {
  ScriptedIsolatedDriver,
  generateFixtureRunnerKeys,
  delegatedSelection,
  delegatingScope,
  FIXTURE_SETUP_MESSAGE,
} from "@immortalis/testkit";
import type { Selection, ChronologyDocument } from "@immortalis/contracts";
import {
  openFixtureCampaign,
  harness,
  scratch,
  intakeRequest,
  FIXTURE_POLICY,
} from "./initial-setup.ts";
import { admitInput, type InputOptions } from "./clock-origin.ts";
import { must } from "./temporal.ts";
import type { fixtureMsEconomyForwardAdmission } from "../../packages/engine/src/owners/admission.ts";

export async function msHarness(
  options: {
    actors?: Selection["actors"];
    raw?: (task: string) => Uint8Array;
    manifest?: (actual: string) => string;
    priorScopeTerminal?: boolean;
    priorScopeSessions?: number;
    extension?: StageOwnerExtension;
    sourceOver?: Record<string, unknown>;
    workshop?: {
      profileBytes: Uint8Array;
      campaignId: string;
      laneX?: (
        keys: ReturnType<typeof generateFixtureRunnerKeys>,
      ) => NonNullable<Parameters<typeof fixtureMsCanonicalAdmission>[3]>;
      laneXAdmission?: typeof fixtureMsEconomyForwardAdmission;
      /** TESTKIT ONLY: stands a successor generation in as the build's CURRENT workshop generation. */
      currentGeneration?: Parameters<typeof fixtureMsCanonicalAdmission>[4];
      open(
        admission: ReturnType<typeof fixtureMsCanonicalAdmission>,
      ): ReturnType<typeof openFixtureCampaign>;
    };
    doc?: ChronologyDocument;
    /**
     * F-014B A0: the MS Input carries a strict v2 captured chronology (CAL-TIME T-1). The intake parsed captures with the strict v1
     * schema when A0 was built (F-014B A1-1 later widened it), so the Input is built exactly as the service builds it and published
     * through the engine's original publisher on the MS route; everything after it is the unchanged service.
     */
    v2?: Omit<InputOptions, "route">;
    /** F-014B A0: writes the journal under another history-verification identity (an older build's), to prove a later open replays it */
    historyId?: (current: string) => string;
  } = {},
) {
  const keys =
      (options as { fixedKeys?: ReturnType<typeof generateFixtureRunnerKeys> }).fixedKeys ??
      generateFixtureRunnerKeys(),
    macKey = randomBytes(32),
    outboxDir = scratch("immortalis-ms-outbox-");
  let scopes = 0;
  const priorCount = options.priorScopeSessions ?? Number(!!options.priorScopeTerminal);
  const driver = new ScriptedIsolatedDriver({
    scope: (input) => {
      const output = delegatingScope()(input);
      return scopes++ < priorCount ? { ...output, message_use: "MIXED_INPUT" } : output;
    },
    scene: (input) => ({
      kind: "SELECTION",
      selection: delegatedSelection(input, {
        actors: options.actors ?? {
          kind: "ACTOR_PRODUCER_REQUIRED",
          constraints: ["SYNTHETIC FIXTURE: one representative boatwright"],
          ground: "one source-licensed actor",
        },
      }),
    }),
  });
  let calls = 0;
  const actorDriver = {
    driver_id: driver.driver_id,
    config_hash: driver.config_hash,
    run: async ({ producerInput }: { producerInput: Uint8Array }) => {
      calls++;
      const p = JSON.parse(Buffer.from(producerInput).toString()) as { task_id: string };
      return {
        raw:
          options.raw?.(p.task_id) ??
          Buffer.from(
            JSON.stringify({ kind: "CONFIRM_INDEX", task_id: p.task_id, constraint_index: 0 }),
          ),
        context_manifest_hash:
          options.manifest?.(msContextManifestHash(sha256Bytes(producerInput))) ??
          msContextManifestHash(sha256Bytes(producerInput)),
      };
    },
  };
  const actorRunner = new MsActorRunner({ ...keys, driver: actorDriver, outboxDir, macKey });
  const laneX = options.workshop?.laneX?.(keys);
  const base =
    laneX && options.workshop?.laneXAdmission
      ? options.workshop.laneXAdmission(actorRunner.binding, options.workshop.profileBytes, laneX)
      : fixtureMsCanonicalAdmission(
          actorRunner.binding,
          options.workshop?.profileBytes,
          undefined,
          laneX,
          options.workshop?.currentGeneration,
        );
  let latest: CampaignState;
  const trace: { before: CampaignState; after: CampaignState; group: CommitGroup }[] = [];
  const admission = {
    ...base,
    ...(options.historyId
      ? {
          historyVerificationId: options.historyId(base.historyVerificationId!),
          ...(base.checkpointVerifierId
            ? { checkpointVerifierId: options.historyId(base.checkpointVerifierId) }
            : {}),
        }
      : {}),
    initializeView: (state: CampaignState, checked: (id: string) => boolean) => {
      base.initializeView?.(state, checked);
      latest = state;
    },
    committedView: (before: CampaignState, after: CampaignState, group: CommitGroup) => {
      base.committedView?.(before, after, group);
      latest = after;
      trace.push({ before, after, group });
    },
  };
  const open = await (options.workshop?.open(admission) ??
    openFixtureCampaign(undefined, options.sourceOver ?? {}, admission, options.extension));
  const h = await harness({
    open,
    keys,
    macKey,
    outboxDir,
    driver,
    route: "MS",
    ...(options.workshop ? { campaignId: options.workshop.campaignId } : {}),
  });
  const actorService = new MsInitialActorService(h.store, actorRunner, FIXTURE_POLICY);
  for (let n = 0; n < priorCount; n++) {
    const prior = await h.service.intake(
      await intakeRequest(h, {
        message: FIXTURE_SETUP_MESSAGE + " Gather now. Prior " + n,
        request: "prior-" + n,
      }),
    );
    if (prior.status !== "ADMITTED") throw new Error(JSON.stringify(prior));
    const terminal = await h.service.advance(prior.setup_id!);
    if (terminal.status !== "TERMINAL") throw new Error(JSON.stringify(terminal));
  }
  const intake: IntakeResult = options.v2
    ? await (async () => {
        const a = await admitInput(h, { ...options.v2, route: "MS" });
        return a.ok
          ? { status: "ADMITTED" as const, setup_id: a.setup_id, message: "accepted" }
          : { status: "REFUSED" as const, message: JSON.stringify(a.published) };
      })()
    : await h.service.intake(await intakeRequest(h, options.doc ? { doc: options.doc } : {}));
  if (intake.status !== "ADMITTED") throw new Error(JSON.stringify(intake));
  const setup = await h.service.advance(intake.setup_id!);
  return {
    ...h,
    laneX,
    actorRunner,
    actorDriver,
    actorService,
    admission,
    intake,
    setup,
    calls: () => calls,
    state: () => latest,
    trace,
    reopen: (optionsForOpen?: { readonly audit: true }) =>
      CanonicalCampaign.open(h.dir, {
        ...optionsForOpen,
        testkitFixtureAdmission: admission,
        ...(options.extension ? { extension: options.extension } : {}),
      }),
  };
}
export const mustMsReopen = async (h: Awaited<ReturnType<typeof msHarness>>) => must(h.reopen());
