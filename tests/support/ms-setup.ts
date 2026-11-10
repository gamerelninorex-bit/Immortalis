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
import { MsActorRunner, MsInitialActorService } from "@immortalis/operator";
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
import { must } from "./temporal.ts";

export async function msHarness(
  options: {
    actors?: Selection["actors"];
    raw?: (task: string) => Uint8Array;
    manifest?: (actual: string) => string;
    priorScopeTerminal?: boolean;
    priorScopeSessions?: number;
    extension?: StageOwnerExtension;
    sourceOver?: Record<string, unknown>;
    doc?: ChronologyDocument;
  } = {},
) {
  const keys = generateFixtureRunnerKeys(),
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
  const base = fixtureMsCanonicalAdmission(actorRunner.binding);
  let latest: CampaignState;
  const trace: { before: CampaignState; after: CampaignState; group: CommitGroup }[] = [];
  const admission = {
    ...base,
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
  const open = await openFixtureCampaign(
    undefined,
    options.sourceOver ?? {},
    admission,
    options.extension,
  );
  const h = await harness({ open, keys, macKey, outboxDir, driver, route: "MS" });
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
  const intake = await h.service.intake(
    await intakeRequest(h, options.doc ? { doc: options.doc } : {}),
  );
  if (intake.status !== "ADMITTED") throw new Error(JSON.stringify(intake));
  const setup = await h.service.advance(intake.setup_id!);
  return {
    ...h,
    actorRunner,
    actorDriver,
    actorService,
    admission,
    intake,
    setup,
    calls: () => calls,
    state: () => latest,
    trace,
    reopen: () =>
      CanonicalCampaign.open(h.dir, {
        testkitFixtureAdmission: admission,
        ...(options.extension ? { extension: options.extension } : {}),
      }),
  };
}
export const mustMsReopen = async (h: Awaited<ReturnType<typeof msHarness>>) => must(h.reopen());
