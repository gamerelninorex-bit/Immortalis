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
import { playerViewSecretPath } from "../../../packages/operator/src/player-view-exchange.ts";
import type { PhoneConfig } from "./config.ts";
import { preflightB } from "./preflight.ts";
import { checkScenarioFile } from "./scenario.ts";

/** Explicit local-operator preparation, never a player/referee/model tool. Uses the configured host, campaign and destination only.
 * Validates all seven identities against canon, provisions its least-privilege view through the existing bind command, and installs
 * the private scenario file. It changes no owner facts, supplies no gameplay premise and never overwrites a different scenario. */
export async function prepareChat(
  config: PhoneConfig,
  input: string,
): Promise<{ ok: boolean; messages: string[] }> {
  const no = (message: string) => ({ ok: false, messages: [message] });
  if (config.publicUrl === null) return no("configure IMMORTALIS_PUBLIC_URL first");
  if (config.playerViewHostId === null)
    return no("explicitly configure IMMORTALIS_PLAYER_VIEW_HOST_ID first");
  const checked = checkScenarioFile(input, { strict: true });
  if (!checked.ok) return no(checked.defect);
  try {
    const parent = lstatSync(dirname(config.scenarioFile));
    if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0)
      return no("the scenario destination needs an operator-owned private directory (0700)");
  } catch {
    return no("the scenario destination directory cannot be examined");
  }
  const document = `${JSON.stringify(checked.scenario, null, 2)}\n`;
  const existing = checkScenarioFile(config.scenarioFile, { strict: true });
  if (existing.ok) {
    if (JSON.stringify(existing.scenario) !== JSON.stringify(checked.scenario))
      return no(
        "a different scenario already exists; the operator must inspect it before replacement",
      );
  } else if (existing.defect !== "the scenario file does not exist") return no(existing.defect);
  const candidate = { ...config, scenarioFile: input };
  const before = await preflightB(candidate);
  if (!before.ok)
    return {
      ok: false,
      messages: before.findings
        .filter((f) => f.severity === "FAIL" || f.severity === "BUSY")
        .map((f) => f.message),
    };
  const secret = playerViewSecretPath(
    { stateDir: config.operatorDir, campaignId: config.campaignId },
    config.playerViewHostId,
  );
  try {
    readFileSync(secret);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      return no("the configured view credential cannot be read");
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
      return no("the configured player-view host could not be bound; inspect the operator binding");
  }
  const after = await preflightB(candidate);
  if (!after.ok)
    return no("the prepared binding did not pass readiness; no scenario was installed");
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
      return no("the scenario could not be installed exclusively; inspect the destination");
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return {
    ok: true,
    messages: [
      "scenario and configured player-view binding are prepared; this proves no observation or client confirmation capability",
    ],
  };
}
