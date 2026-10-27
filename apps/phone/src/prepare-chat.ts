import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { runPlayerViewBindCli } from "../../../packages/operator/src/player-view-mcp.ts";
import {
  playerViewSecretPath,
  readPlayerViewConfig,
} from "../../../packages/operator/src/player-view-exchange.ts";
import type { PhoneConfig } from "./config.ts";
import { preflightB } from "./preflight.ts";
import { checkScenarioFile, sameScenario } from "./scenario.ts";

/** Why a preparation did not complete, in a closed vocabulary (the messages are for the operator; a code is what a front end may relay). */
export type PrepareCode =
  | "OK"
  | "PUBLIC_URL_UNSET"
  | "PLAYER_VIEW_HOST_UNSET"
  | "SCENARIO_INPUT"
  | "SCENARIO_DIRECTORY"
  | "SCENARIO_CONFLICT"
  | "SCENARIO_DEFECT"
  | "NOT_READY"
  | "CAMPAIGN_BUSY"
  | "VIEW_BINDING"
  | "INSTALL_FAILED";
export interface PrepareResult {
  readonly ok: boolean;
  readonly messages: string[];
  readonly code: PrepareCode;
  /** the preflight finding identities that refused it (NOT_READY / CAMPAIGN_BUSY) */
  readonly blockers?: readonly string[];
}

/** Explicit local-operator preparation, never a player/referee/model tool. Uses the configured host, campaign and destination only.
 * Validates all seven identities against canon, provisions its least-privilege view through the existing bind command, and installs
 * the private scenario file. It changes no owner facts, supplies no gameplay premise and never overwrites a different scenario. */
export async function prepareChat(config: PhoneConfig, input: string): Promise<PrepareResult> {
  const no = (code: PrepareCode, message: string): PrepareResult => ({
    ok: false,
    messages: [message],
    code,
  });
  if (config.publicUrl === null)
    return no("PUBLIC_URL_UNSET", "configure IMMORTALIS_PUBLIC_URL first");
  if (config.playerViewHostId === null)
    return no(
      "PLAYER_VIEW_HOST_UNSET",
      "explicitly configure IMMORTALIS_PLAYER_VIEW_HOST_ID first",
    );
  const checked = checkScenarioFile(input, { strict: true });
  if (!checked.ok) return no("SCENARIO_INPUT", checked.defect);
  try {
    const parent = lstatSync(dirname(config.scenarioFile));
    if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0)
      return no(
        "SCENARIO_DIRECTORY",
        "the scenario destination needs an operator-owned private directory (0700)",
      );
  } catch {
    return no("SCENARIO_DIRECTORY", "the scenario destination directory cannot be examined");
  }
  const document = `${JSON.stringify(checked.scenario, null, 2)}\n`;
  const existing = checkScenarioFile(config.scenarioFile, { strict: true });
  if (existing.ok) {
    if (!sameScenario(existing.scenario, checked.scenario))
      return no(
        "SCENARIO_CONFLICT",
        "a different scenario already exists; the operator must inspect it before replacement",
      );
  } else if (existing.defect !== "the scenario file does not exist")
    return no("SCENARIO_DEFECT", existing.defect);
  const candidate = { ...config, scenarioFile: input };
  const before = await preflightB(candidate);
  if (!before.ok) {
    const refused = before.findings.filter((f) => f.severity === "FAIL" || f.severity === "BUSY");
    return {
      ok: false,
      messages: refused.map((f) => f.message),
      code: refused.some((f) => f.severity === "BUSY") ? "CAMPAIGN_BUSY" : "NOT_READY",
      blockers: refused.map((f) => f.id),
    };
  }
  const secret = playerViewSecretPath(
    { stateDir: config.operatorDir, campaignId: config.campaignId },
    config.playerViewHostId,
  );
  let secretPresent = true;
  try {
    readFileSync(secret);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      return no("VIEW_BINDING", "the configured view credential cannot be read");
    secretPresent = false;
  }
  const uid = process.getuid?.();
  if (uid === undefined) return no("VIEW_BINDING", "the operator cannot be verified");
  const view = await readPlayerViewConfig(
    { stateDir: config.operatorDir, campaignId: config.campaignId },
    uid,
  );
  if (!view.ok && view.error.code !== "NOT_CONFIGURED")
    return no("VIEW_BINDING", "the configured view binding cannot be verified");
  if (
    !secretPresent ||
    !view.ok ||
    !view.value.hosts.some((h) => h.host_id === config.playerViewHostId)
  ) {
    const code = await runPlayerViewBindCli(
      [
        "--campaign",
        config.campaignDir,
        "--campaign-id",
        config.campaignId,
        "--operator-dir",
        config.operatorDir,
        "--host-id",
        config.playerViewHostId,
      ],
      { out: () => undefined, error: () => undefined },
    );
    if (code !== 0)
      return no(
        "VIEW_BINDING",
        "the configured player-view host could not be bound; inspect the operator binding",
      );
  }
  const after = await preflightB(candidate);
  if (!after.ok)
    return {
      ...no("NOT_READY", "the prepared binding did not pass readiness; no scenario was installed"),
      blockers: after.findings
        .filter((f) => f.severity === "FAIL" || f.severity === "BUSY")
        .map((f) => f.id),
    };
  if (!existing.ok) {
    const temp = `${config.scenarioFile}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      const fd = openSync(temp, "wx", 0o600);
      try {
        writeSync(fd, document);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      // Exclusive install: a concurrent operator configuration is never replaced.
      linkSync(temp, config.scenarioFile);
    } catch {
      return no(
        "INSTALL_FAILED",
        "the scenario could not be installed exclusively; inspect the destination",
      );
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return {
    ok: true,
    code: "OK",
    messages: [
      "scenario and configured player-view binding are prepared; this proves no observation or client confirmation capability",
    ],
  };
}
