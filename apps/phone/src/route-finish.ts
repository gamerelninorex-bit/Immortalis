import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { CliEnvironment } from "@immortalis/operator";
import { readConfig } from "../../../packages/operator/src/referee-exchange.ts";
import {
  playerViewSecretPath,
  readPlayerViewConfig,
  readPlayerViewSecretFile,
} from "../../../packages/operator/src/player-view-exchange.ts";
import { buildPlayerCommand } from "./commands.ts";
import type { PhoneConfig } from "./config.ts";
import { prepareChat, type PrepareCode } from "./prepare-chat.ts";
import {
  probeOf,
  readRoute,
  stageOutcome,
  type RouteFacts,
  type StageOutcome,
} from "./route-evidence.ts";
import type { FinishStage, StageIdentity } from "./route-stages.ts";
import { checkScenarioFile, isScenario, sameScenario, type Scenario } from "./scenario.ts";

/**
 * The last stage: the referee's cycle attestation and the service's own installation of the private scenario and the earned-Glance view.
 * NO human choice is made here and none is asked: the attestation is an adjudicator's act (a bound host reads committed wording; the owner
 * validates and writes it), and the scenario is DERIVED by the trusted service from the committed facts of this campaign alone - the host
 * names no identity, grants no scope, exposes no credential and configures no provider. The installation is the operator's existing
 * `prepare-chat` (the seven identities checked against canon by the preflight, the least-privilege view bound by the existing binder, the
 * scenario installed exclusively); a different or malformed scenario already on disk is never replaced.
 */

/** the operations a bound, listed referee host must cover for the collection to be requested at all */
export const PLAY_OPERATIONS = [
  "F014D_DIRECT_PERCEPTION",
  "PC_COLLECTION_CYCLE",
  "PC_COLLECTION_REACH",
] as const;

/**
 * The referee operations covered by hosts that are BOTH listed in the service's configuration and bound by the operator (only such a
 * host can be served by the referee lane). `null` when the binding cannot be read now; an empty set when none is bound.
 */
export async function refereeCoverage(config: PhoneConfig): Promise<ReadonlySet<string> | null> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined) return null;
  const read = await readConfig(
    { stateDir: config.operatorDir, campaignId: config.campaignId },
    uid,
  );
  if (!read.ok) return read.error.code === "NOT_CONFIGURED" ? new Set() : null;
  const listed = new Set(config.refereeHostIds);
  return new Set(
    read.value.hosts.filter((h) => listed.has(h.host_id)).flatMap((h) => h.operations.map(String)),
  );
}

/** The seven-key scenario the trusted service derives from the committed facts, or the reason it cannot. */
export function deriveScenario(
  r: Pick<RouteFacts, "character" | "source" | "ids">,
):
  | { readonly ok: true; readonly scenario: Scenario }
  | { readonly ok: false; readonly reason: string } {
  if (r.character.kind !== "BOUND") return { ok: false, reason: "the character is not placed" };
  const scenario = {
    player_character: r.character.pc_id,
    world: r.source.world_id,
    source: r.source.source_key,
    reserve: r.ids.reserve_id,
    quantity_unit: r.source.unit,
    mechanism: r.ids.mechanism_id,
    basis: r.ids.basis_id,
  };
  return isScenario(scenario)
    ? { ok: true, scenario }
    : {
        ok: false,
        reason:
          "an identity or the source's unit cannot be written as the connection's configuration (the unit may use only letters, digits and . _ : - and spaces)",
      };
}

export type InstallState =
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "NO_EFFECT" }
  | { readonly kind: "PARTIAL"; readonly detail: string }
  | { readonly kind: "BLOCKED"; readonly code: string; readonly detail: string }
  | { readonly kind: "UNAVAILABLE"; readonly code: string; readonly detail: string };

/**
 * What is installed for THIS scenario, read-only: the configured scenario file (the same, absent, different or defective) and the
 * configured player-view host binding (absent, bound to this character with a private matching secret, or otherwise). Nothing is written,
 * repaired or rebound. A scenario that merely exists is never evidence that a stage completed: it is judged against the derived one.
 */
export async function installState(config: PhoneConfig, scenario: Scenario): Promise<InstallState> {
  const existing = checkScenarioFile(config.scenarioFile, { strict: true });
  let file: "SAME" | "ABSENT";
  if (existing.ok) {
    if (!sameScenario(existing.scenario, scenario))
      return {
        kind: "BLOCKED",
        code: "SCENARIO_CONFLICT",
        detail: "a different scenario is already configured; the operator must inspect it",
      };
    file = "SAME";
  } else if (existing.defect === "the scenario file does not exist") file = "ABSENT";
  else
    return {
      kind: "BLOCKED",
      code: "SCENARIO_DEFECT",
      detail: "the configured scenario file is not usable; the operator must inspect it",
    };
  const host = config.playerViewHostId;
  if (host === null)
    return {
      kind: "BLOCKED",
      code: "PLAYER_VIEW_HOST_UNSET",
      detail: "no player-view host is configured for this service",
    };
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined)
    return {
      kind: "UNAVAILABLE",
      code: "OPERATOR_UNVERIFIED",
      detail: "no operator can be verified here",
    };
  const p = { stateDir: config.operatorDir, campaignId: config.campaignId };
  const view = await readPlayerViewConfig(p, uid);
  let bound: "NO" | "YES";
  if (!view.ok) {
    if (view.error.code !== "NOT_CONFIGURED")
      return {
        kind: "UNAVAILABLE",
        code: String(view.error.code),
        detail: "the player-view binding cannot be read now",
      };
    bound = "NO";
  } else {
    const entry = view.value.hosts.find((h) => h.host_id === host);
    if (!entry) bound = "NO";
    else {
      const secret = readPlayerViewSecretFile(playerViewSecretPath(p, host));
      const secretOk =
        secret !== null &&
        createHash("sha256").update(secret, "utf8").digest("hex") === entry.secret_sha256;
      if (entry.pc_id !== scenario.player_character || !secretOk)
        return {
          kind: "BLOCKED",
          code: "VIEW_BINDING",
          detail:
            "the configured player-view host is bound to another character or its credential does not match; the operator must repair it",
        };
      bound = "YES";
    }
  }
  if (file === "SAME" && bound === "YES") return { kind: "COMPLETE" };
  if (file === "ABSENT" && bound === "NO") return { kind: "NO_EFFECT" };
  return {
    kind: "PARTIAL",
    detail:
      file === "SAME"
        ? "the view is not bound"
        : "the view is bound and the scenario is not installed",
  };
}

/** What became of ONE finishing operation: the attestation (owner fact) and the installation (files), each against the derived scenario. */
export function finishOutcome(
  attested: boolean,
  install: InstallState,
  id: FinishStage,
): StageOutcome {
  if (install.kind === "BLOCKED") return install;
  if (install.kind === "UNAVAILABLE") return install;
  if (attested && install.kind === "COMPLETE") return { kind: "COMPLETE" };
  if (!attested && install.kind === "NO_EFFECT" && id.attest)
    return { kind: "NO_EFFECT", detail: "nothing of the finishing stage was committed" };
  // convergent partial states need no human and no new consent: running the stage again completes exactly what is missing
  return { kind: "PARTIAL", landed: [attested ? "attestation" : "installation"] };
}

/** the closed statuses this stage reports, in the same `STATUS <name>` + sentence form as the shipped commands */
export const FINISH_STATUSES = [
  "FINISH_READY",
  "FINISH_NOT_ATTESTED",
  "FINISH_BLOCKED",
  "FINISH_CONFIGURATION",
] as const;
export type FinishStatus = (typeof FINISH_STATUSES)[number];

const CONFIGURATION: ReadonlySet<PrepareCode> = new Set([
  "PUBLIC_URL_UNSET",
  "PLAYER_VIEW_HOST_UNSET",
  "SCENARIO_DIRECTORY",
]);

/** Writes the candidate scenario to a private file of the operator's directory, installs it through `prepareChat` and removes the file. */
async function install(
  config: PhoneConfig,
  scenario: Scenario,
): Promise<Awaited<ReturnType<typeof prepareChat>>> {
  const candidate = join(
    config.operatorDir,
    `chat-scenario-candidate.${randomBytes(8).toString("hex")}.json`,
  );
  try {
    const fd = openSync(candidate, "wx", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(scenario, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // an owner-only regular file inside the operator's own directory; anything else is not a candidate
    if (!lstatSync(candidate).isFile()) throw new Error("not a regular file");
    return await prepareChat(config, candidate);
  } catch {
    return { ok: false, code: "INSTALL_FAILED", messages: ["the candidate could not be written"] };
  } finally {
    rmSync(candidate, { force: true });
  }
}

/**
 * One finishing operation, over the player lane's terminal: the shipped `attest-cycle` (only when the attestation is not yet committed),
 * then the installation. It reports the way the command line does (`STATUS`, a fixed sentence, bounded details) and returns the shipped
 * exit classes: 0 done, 3 refused, 4 unknown outcome.
 */
export async function runFinish(
  config: PhoneConfig,
  cli: (argv: readonly string[], env: CliEnvironment) => Promise<number>,
  id: FinishStage,
  env: CliEnvironment,
  refereeWait: string | null,
): Promise<number> {
  const out = env.out ?? (() => undefined);
  if (id.attest) {
    const built = buildPlayerCommand(config, {
      command: "attest-cycle",
      options: {
        mechanism: id.scenario.mechanism,
        ...(refereeWait !== null ? { "referee-wait": refereeWait } : {}),
      },
    });
    if (!built.ok) {
      out(`STATUS FINISH_BLOCKED ATTEST_REFUSED`);
      out("the cycle attestation could not be requested.");
      return 3;
    }
    try {
      const code = await cli(built.value.argv, env);
      if (code !== 0) {
        out("STATUS FINISH_NOT_ATTESTED");
        out(
          code === 4
            ? "Whether the cycle attestation was written is not known; nothing is reported as done."
            : "The bound referee did not establish, in a reading the owner could validate, that the character's wording is ONE same-form unit in ONE serial cycle. Nothing was attested, and nothing was installed.",
        );
        return code === 4 ? 4 : 3;
      }
    } finally {
      built.value.cleanup();
    }
  }
  const installed = await install(config, id.scenario);
  if (installed.ok) {
    out("STATUS FINISH_READY");
    out(
      "The cycle is attested and the connection is installed for exactly this campaign's character, source, Reserve and mechanism. Nothing was collected and no time passed.",
    );
    return 0;
  }
  const status = CONFIGURATION.has(installed.code) ? "FINISH_CONFIGURATION" : "FINISH_BLOCKED";
  out(`STATUS ${status} ${installed.code}`);
  out(
    status === "FINISH_CONFIGURATION"
      ? "A service-side setting this step needs is missing; it is an engineering step, nothing was installed."
      : "The connection could not be installed; nothing was replaced.",
  );
  for (const b of (installed.blockers ?? []).slice(0, 12)) out(`blocker ${b}`);
  return 3;
}

/**
 * What the owners and the installed files say became of ONE dispatched stage, from ONE owner-verified open (plus, for the finishing stage,
 * a read of the installed files). Never a replay, never a status string.
 */
export async function stageEvidence(config: PhoneConfig, id: StageIdentity): Promise<StageOutcome> {
  const read = await readRoute(config, probeOf(id));
  if (id.kind !== "FINISH" || read.kind !== "OPEN")
    return stageOutcome(read, id, config.campaignId);
  return finishOutcome(
    read.route.attestation?.current === true,
    await installState(config, id.scenario),
    id,
  );
}
