import { lstatSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  productionExtractionBasisKey,
  productionReserveKey,
  pcExistenceContractKey,
  worldProfileKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  RefereeAdjudicationAdapter,
} from "@immortalis/engine";
import { readConfig } from "../../../packages/operator/src/referee-exchange.ts";
import {
  playerViewSecretPath,
  readPlayerViewConfig,
  readPlayerViewSecretFile,
} from "../../../packages/operator/src/player-view-exchange.ts";
import type { PhoneConfig } from "./config.ts";
import { checkScenarioFile, type Scenario } from "./scenario.ts";

/**
 * The operator's PREFLIGHT for the ordinary-chat route. It is a read-only look run by the operator, with the operator's own configuration,
 * BEFORE a long interactive setup (and at boot for phase A): it names, in plain words, every configuration defect that would otherwise
 * surface only as a cause-free refusal in the middle of play. It is NOT a tool, an endpoint or a command of the player or the assistant,
 * takes no argument from either, writes nothing to the campaign, and prints no secret.
 *
 *   phase A  - the configuration and the operator files (no campaign is opened);
 *   phase B  - the campaign (opened read-only under its writer lock: a running command makes it BUSY, never a pass), the seven scenario
 *              identities against canon, the referee and player-view bindings, and a dry-run of what the observation question would
 *              deliver (its structure; the words only with `verbatim`, on the operator's own console).
 */
export type Severity = "PASS" | "WARN" | "FAIL" | "BUSY" | "SKIP";
export interface Finding {
  readonly phase: "A" | "B";
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
}
export interface PreflightReport {
  readonly findings: readonly Finding[];
  /** no FAIL and no BUSY: BUSY means a check could not be made, and is never a pass */
  readonly ok: boolean;
}

/** what the evaluator requires, in words that name no result */
export const EVALUATOR_LEGEND = [
  "faculty rests only on the character's own accepted statements",
  "position rests only on the confirmed placement statement (where, which way it faces, eyes open)",
  "path and appearance rest only on committed world and locus statements",
  "I-002 permits safely conventional intrinsic baseline properties; current exposure, path and appearance still need their own grounded reading",
] as const;

const REQUIRED_PLAY_OPERATIONS = [
  "F014D_DIRECT_PERCEPTION",
  "PC_COLLECTION_CYCLE",
  "PC_COLLECTION_REACH",
] as const;
const SETUP_OPERATIONS = [
  "I002_CLASSIFY",
  "IR_NATIVE_COMPATIBILITY",
  "IR_PHYSICAL_PLACEMENT",
] as const;

export interface PreflightOptions {
  /** also probe `<public origin>/mcp` over the network (an unauthenticated call must answer 401) */
  readonly probe?: boolean;
  /** print the delivered statements themselves (the operator's own console only) */
  readonly verbatim?: boolean;
  readonly uid?: number | null;
  readonly fetch?: typeof fetch;
}

class Collector {
  readonly findings: Finding[] = [];
  readonly phase: "A" | "B";
  constructor(phase: "A" | "B") {
    this.phase = phase;
  }
  add(id: string, severity: Severity, message: string): void {
    this.findings.push({ phase: this.phase, id, severity, message });
  }
}
const finish = (findings: Finding[]): PreflightReport => ({
  findings,
  ok: !findings.some((f) => f.severity === "FAIL" || f.severity === "BUSY"),
});

// -- phase A ----------------------------------------------------------------------------------------------------------------

export async function preflightA(
  config: PhoneConfig,
  opts: PreflightOptions = {},
): Promise<PreflightReport> {
  const c = new Collector("A");
  const uid = opts.uid === undefined ? (process.getuid?.() ?? null) : opts.uid;
  const dir = (id: string, label: string, path: string) => {
    try {
      const st = statSync(path);
      if (!st.isDirectory()) return c.add(id, "FAIL", `${label} is not a directory`);
      if (uid !== null && st.uid !== uid)
        return c.add(id, "FAIL", `${label} is not owned by the user that runs the service`);
      c.add(id, "PASS", `${label} exists and belongs to the service user`);
    } catch {
      c.add(id, "FAIL", `${label} does not exist`);
    }
  };
  dir("A1", "the operator directory", config.operatorDir);
  // the campaign directory may legitimately not exist yet (the first setup creates it)
  try {
    const st = statSync(config.campaignDir);
    if (!st.isDirectory()) c.add("A2", "FAIL", "the campaign directory is not a directory");
    else c.add("A2", "PASS", "the campaign directory exists");
  } catch {
    c.add("A2", "SKIP", "the campaign directory does not exist yet (the first setup creates it)");
  }
  const chatOn = config.publicUrl !== null;
  if (!chatOn) {
    c.add(
      "A3",
      "SKIP",
      "the ordinary-chat route is off (no IMMORTALIS_PUBLIC_URL): its checks are skipped",
    );
    return finish(c.findings);
  }
  c.add("A3", "PASS", `the ordinary-chat route is on at ${config.publicUrl}`);
  const scenario = checkScenarioFile(config.scenarioFile, { strict: true, uid });
  c.add(
    "A4",
    scenario.ok ? "PASS" : "FAIL",
    scenario.ok
      ? "the scenario file is a valid seven-key file owned by the service user"
      : `${scenario.defect} (${config.scenarioFile})`,
  );
  if (config.playerViewHostId === null)
    c.add(
      "A5",
      "FAIL",
      "IMMORTALIS_PLAYER_VIEW_HOST_ID is not set: the earned Glance is disabled and read_current_observation_glance refuses every read, which looks exactly like a non-receipt",
    );
  else c.add("A5", "PASS", `the player-view host identity is ${config.playerViewHostId}`);
  if (opts.probe === true) {
    const doFetch = opts.fetch ?? fetch;
    try {
      const res = await doFetch(`${config.publicUrl}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(8000),
      });
      c.add(
        "A6",
        res.status === 401 ? "PASS" : "FAIL",
        res.status === 401
          ? "an unauthenticated call to /mcp is answered 401 with the protected-resource pointer"
          : res.status === 421
            ? "/mcp answered 421: the public origin does not match the host that reaches the service"
            : `/mcp answered ${res.status}; an unauthenticated call must be answered 401`,
      );
    } catch {
      c.add("A6", "FAIL", "the public origin could not be reached");
    }
  }
  return finish(c.findings);
}

// -- phase B ----------------------------------------------------------------------------------------------------------------

const short = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);

export async function preflightB(
  config: PhoneConfig,
  opts: PreflightOptions = {},
): Promise<PreflightReport> {
  const c = new Collector("B");
  const uid = opts.uid === undefined ? (process.getuid?.() ?? null) : opts.uid;
  const checked = checkScenarioFile(config.scenarioFile, { strict: true, uid });
  if (!checked.ok) {
    c.add(
      "B0",
      "FAIL",
      `the scenario cannot be read, so no identity can be checked: ${checked.defect}`,
    );
    return finish(c.findings);
  }
  const scenario = checked.scenario;
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "immortalis-phone-preflight",
  });
  if (!opened.ok) {
    const code = opened.error.code as string;
    if (code === "LOCKED")
      c.add(
        "B0",
        "BUSY",
        "the campaign is locked by a running command: nothing was checked; run the preflight again",
      );
    else c.add("B0", "FAIL", `the campaign did not open: ${code}`);
    return finish(c.findings);
  }
  const campaign = opened.value;
  try {
    if (campaign.store.head().campaign_id !== config.campaignId) {
      c.add("B0", "FAIL", "the opened campaign does not match the configured campaign identity");
      return finish(c.findings);
    }
    c.add("B0", "PASS", "the campaign opened read-only and verified");
    scenarioIdentities(c, campaign, scenario);
    await referee(c, config, opts, uid);
    await playerView(c, config, scenario, uid);
    dryRun(c, campaign, scenario, opts);
  } finally {
    await campaign.close().catch(() => undefined);
  }
  return finish(c.findings);
}

function scenarioIdentities(c: Collector, campaign: CanonicalCampaign, s: Scenario): void {
  const get = (k: string) => campaign.store.getFact(k);
  const row = (id: string, ok: boolean, pass: string, fail: string) =>
    c.add(id, ok ? "PASS" : "FAIL", ok ? pass : fail);
  row(
    "B1",
    get(pcExistenceContractKey(s.player_character)) !== undefined,
    "the character's existence contract is committed",
    `player_character ${s.player_character}: no existence contract is committed for it`,
  );
  row(
    "B2",
    campaign.binding()?.value.active_pc.entity_id === s.player_character,
    "the character is the campaign's active bound character",
    `player_character ${s.player_character} is not the campaign's active bound character`,
  );
  row(
    "B3",
    campaign.pcPhysicalLocusCustody(s.player_character) !== undefined,
    "the character holds an original physical-locus custody",
    `player_character ${s.player_character}: no physical-locus custody is committed (the character is not placed)`,
  );
  row(
    "B4",
    get(worldProfileKey(s.world)) !== undefined,
    "the world profile is committed",
    `world ${s.world}: no world profile is committed`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a committed owner fact read by its own exact key
  const src: any = get(worldSourceConditionKey(s.world, s.source))?.value;
  row(
    "B5",
    src !== undefined,
    "the Source Condition is committed in that world",
    `source ${s.source}: no Source Condition is committed in world ${s.world}`,
  );
  row(
    "B6",
    src?.establishment?.quantity?.unit === s.quantity_unit,
    "quantity_unit equals the source's own unit",
    `quantity_unit ${s.quantity_unit} is not the unit of source ${s.source}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = get(productionReserveKey(s.reserve))?.value;
  row(
    "B7",
    res !== undefined,
    "the Production Reserve is committed",
    `reserve ${s.reserve}: no Production Reserve is committed`,
  );
  row(
    "B8",
    res !== undefined &&
      res.locality?.world?.entity_id === s.world &&
      res.quantity?.unit === s.quantity_unit &&
      res.locality?.locus?.entity_id === src?.locality?.locus?.entity_id,
    "the Reserve is in the same world and locus as the source and in the same unit",
    `reserve ${s.reserve} is not in world ${s.world}, at the source's locus, in the source's unit`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const basis: any = get(productionExtractionBasisKey(s.basis))?.value;
  row(
    "B9",
    basis !== undefined,
    "the extraction basis is committed",
    `basis ${s.basis}: no extraction basis is committed`,
  );
  row(
    "B10",
    basis !== undefined &&
      basis.locality?.world?.entity_id === s.world &&
      basis.source?.source_key === s.source &&
      basis.unit === s.quantity_unit,
    "the extraction basis names this world, this source and this unit",
    `basis ${s.basis} does not name world ${s.world}, source ${s.source} and unit ${s.quantity_unit}`,
  );
  const adapter = new PcCollectionAdapter(campaign.store);
  const custody = campaign.pcPhysicalLocusCustody(s.player_character)?.value.stationary_locus;
  row(
    "B12a",
    custody?.world.entity_id === s.world &&
      custody?.locus.entity_id === src?.locality?.locus?.entity_id,
    "the character is placed in the scenario source's world and locus",
    "the character's current physical locus does not match the scenario source",
  );
  row(
    "B11",
    adapter.mechanism(s.player_character, s.mechanism) !== undefined,
    "the mechanism is committed for the character",
    `mechanism ${s.mechanism}: not committed for ${s.player_character} (run prepare-collection)`,
  );
  row(
    "B12",
    adapter.attestation(s.player_character, s.mechanism) !== undefined,
    "the mechanism's cycle is attested (collect is offered only afterwards)",
    `mechanism ${s.mechanism}: the cycle is not attested yet (run attest-cycle)`,
  );
}

async function referee(
  c: Collector,
  config: PhoneConfig,
  _opts: PreflightOptions,
  uid: number | null,
): Promise<void> {
  const p = { stateDir: config.operatorDir, campaignId: config.campaignId };
  const read = await readConfig(p, uid ?? 0);
  if (!read.ok) {
    c.add(
      "B13",
      "FAIL",
      read.error.code === "NOT_CONFIGURED"
        ? "no referee host is bound to this campaign (run referee-bind-host and referee-bind-collection-host)"
        : `the referee binding cannot be used: ${read.error.code}`,
    );
    return;
  }
  const bound = new Map(
    read.value.hosts.map((h) => [h.host_id, h.operations as readonly string[]]),
  );
  const unbound = config.refereeHostIds.filter((h) => !bound.has(h));
  c.add(
    "B13",
    unbound.length === 0 ? "PASS" : "FAIL",
    unbound.length === 0
      ? "every referee host listed in the environment is bound"
      : `listed in the environment but not bound: ${unbound.join(", ")}`,
  );
  const covered = new Set(
    config.refereeHostIds.flatMap((h) => bound.get(h) ?? []).map((o) => String(o)),
  );
  const missing = REQUIRED_PLAY_OPERATIONS.filter((o) => !covered.has(o));
  c.add(
    "B14",
    missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0
      ? "the listed referee hosts cover the observation and both collection readings"
      : `no listed referee host is bound for: ${missing.join(", ")} (a question for it would stay pending)`,
  );
  const missingSetup = SETUP_OPERATIONS.filter((o) => !covered.has(o));
  c.add(
    "B15",
    missingSetup.length === 0 ? "PASS" : "WARN",
    missingSetup.length === 0
      ? "the listed referee hosts also cover the setup readings"
      : `setup readings not covered by a listed host (needed only when characters are authored or placed): ${missingSetup.join(", ")}`,
  );
}

async function playerView(
  c: Collector,
  config: PhoneConfig,
  s: Scenario,
  uid: number | null,
): Promise<void> {
  const host = config.playerViewHostId;
  if (host === null) {
    c.add("B16", "FAIL", "no player-view host is configured (IMMORTALIS_PLAYER_VIEW_HOST_ID)");
    return;
  }
  const p = { stateDir: config.operatorDir, campaignId: config.campaignId };
  const read = await readPlayerViewConfig(p, uid ?? 0);
  const secretFile = playerViewSecretPath(p, host);
  if (!read.ok) {
    c.add(
      "B16",
      read.error.code === "NOT_CONFIGURED" ? "PASS" : "FAIL",
      read.error.code === "NOT_CONFIGURED"
        ? `player-view host ${host} is not bound yet; the first read binds it, which needs the character kept and placed (see B2, B3)`
        : `the player-view binding cannot be used: ${read.error.code}`,
    );
    return;
  }
  const entry = read.value.hosts.find((h) => h.host_id === host);
  if (!entry) {
    c.add("B16", "PASS", `player-view host ${host} is not bound yet; the first read binds it`);
    return;
  }
  c.add(
    "B16",
    entry.pc_id === s.player_character ? "PASS" : "FAIL",
    entry.pc_id === s.player_character
      ? `player-view host ${host} is bound to the scenario character`
      : `player-view host ${host} is bound to ${entry.pc_id}, not to ${s.player_character}`,
  );
  let fileOk: boolean;
  try {
    const st = lstatSync(secretFile);
    const secret = readPlayerViewSecretFile(secretFile);
    fileOk =
      st.isFile() &&
      (st.mode & 0o077) === 0 &&
      secret !== null &&
      createHash("sha256").update(secret, "utf8").digest("hex") === entry.secret_sha256;
  } catch {
    fileOk = false;
  }
  c.add(
    "B17",
    fileOk ? "PASS" : "FAIL",
    fileOk
      ? "the player-view host's secret file is private and matches the binding"
      : `the player-view host is bound but its secret file is missing, readable by others or does not match: a rebind is refused, so every read would be refused (engineering must repair ${secretFile})`,
  );
}

function dryRun(
  c: Collector,
  campaign: CanonicalCampaign,
  s: Scenario,
  opts: PreflightOptions,
): void {
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const task = adapter.observationTask({ pc_id: s.player_character, attempt: 0 });
  if (!task.ok) {
    c.add(
      "B18",
      "WARN",
      `the observation question cannot be built now (${task.error.code}); it needs canonical time and a bound, placed character`,
    );
    return;
  }
  const ctx = task.value.context;
  // a retained decision is reported only as the fact that one exists: what it says is sealed
  const retained = adapter.decision(task.value.task_id) !== undefined;
  c.add(
    "B18",
    "PASS",
    `observation question ${short(task.value.task_id)} at basis ${ctx.observed_at.value} ${ctx.observed_at.unit}: ${
      retained
        ? "a reading is ALREADY RETAINED for this exact question, so a look will find it and ask no one"
        : "no reading is retained for it yet"
    }`,
  );
  const pcBySlot = new Map<string, number>();
  for (const i of ctx.pc) pcBySlot.set(i.slot, (pcBySlot.get(i.slot) ?? 0) + 1);
  c.add(
    "B19",
    "PASS",
    `the referee would be shown: ${ctx.pc.length} statement(s) of the character [${[...pcBySlot].map(([k, n]) => `${k} x${n}`).join(", ")}]; a placement statement of ${ctx.statement.length} characters; ${ctx.facts.length} world fact(s) [${ctx.facts.map((f) => f.fact_id).join(", ")}]`,
  );
  for (const line of EVALUATOR_LEGEND) c.add("B20", "PASS", `evaluator: ${line}`);
  if (opts.verbatim === true) {
    for (const i of ctx.pc) c.add("B21", "PASS", `statement ${i.slot}: ${i.text}`);
    c.add("B21", "PASS", `placement: ${ctx.statement}`);
    for (const f of ctx.facts) c.add("B21", "PASS", `fact ${f.fact_id}: ${f.text}`);
  }
}
