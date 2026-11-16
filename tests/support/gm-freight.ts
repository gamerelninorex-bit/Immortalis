import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CanonicalTime,
  type GmAttestOpeningRequest,
  type GmEstablishLegalRequest,
  type GmEstablishSettingRequest,
  type GmFreightStatus,
  type GmFreightReceipt,
} from "@immortalis/contracts";
import { CanonicalCampaign, type GmFreightResult } from "@immortalis/engine";
import {
  LocalOperatorSession,
  ensureOperatorStateDirectory,
  initializeTime,
  nullAdvance,
  type CommandContext,
  type OperatorTerminal,
} from "@immortalis/operator";
import type { FreightWorldFixture } from "@immortalis/testkit";
import { callGmFreight, type GmFreightParams } from "../../packages/operator/src/gm-freight.ts";
import {
  bindGmFreightHost,
  readGmFreightSecretFile,
} from "../../packages/operator/src/gm-freight-exchange.ts";
import { must } from "./temporal.ts";

/**
 * Test rig of the GM-native freight bridge. MECHANISM ONLY: the "GM" is a script that submits the fixture's premises through the REAL
 * authenticated tool path (`callGmFreight`, the same function the stdio MCP server calls); the operator's starting chronology and the
 * player's out-of-character time advance are the REAL operator commands (`initializeTime`, `nullAdvance`) driven by a scripted
 * console that only types the printed confirmation phrase. No model, host, client or retained store is involved.
 */

export interface GmRig {
  readonly fx: FreightWorldFixture;
  readonly campaignDir: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly params: GmFreightParams;
  call(tool: string, args?: unknown, over?: Partial<GmFreightParams>): Promise<GmFreightResult>;
}

const uid = (): number => (typeof process.getuid === "function" ? process.getuid() : 0);

/** A fresh NULL-PC campaign (no world yet), a state directory and one bound GM host. */
export async function newGmRig(
  fx: FreightWorldFixture,
  o: { readonly hostId?: string; readonly buildId?: string } = {},
): Promise<GmRig> {
  const root = mkdtempSync(join(tmpdir(), "imm-gm-freight-"));
  const campaignDir = join(root, "campaign");
  const stateDir = join(root, "state");
  const campaign = await must(
    CanonicalCampaign.create(campaignDir, {
      campaignId: fx.campaignId,
      buildId: o.buildId ?? "gm-freight-seed",
    }),
  );
  await campaign.close();
  chmodSync(campaignDir, 0o700);
  ensureOperatorStateDirectory(stateDir);
  const hostId = o.hostId ?? "gm-host-1";
  const bound = await must(
    bindGmFreightHost({ stateDir, campaignId: fx.campaignId, operatorUid: uid(), hostId }),
  );
  const secret = readGmFreightSecretFile(bound.secret_file);
  if (secret === null) throw new Error("the bound secret file could not be read");
  const params: GmFreightParams = {
    campaignDir,
    campaignId: fx.campaignId,
    stateDir,
    hostId,
    secret,
  };
  return {
    fx,
    campaignDir,
    stateDir,
    hostId,
    params,
    call: (tool, args, over) => callGmFreight({ ...params, ...over }, tool, args),
  };
}

// ---------------------------------------------------------------------------------------------
// The GM's requests, lowered from the fixture's ordinary-language premises (nothing is asserted that an owner must earn)
// ---------------------------------------------------------------------------------------------

export const settingRequest = (
  fx: FreightWorldFixture,
  op = "gm-setting",
): GmEstablishSettingRequest => ({
  operation_id: op,
  world: {
    world_id: fx.worldId,
    premise: fx.world.premise,
    established_canon:
      fx.world.reference_causal_basis.mode === "ORIGINAL"
        ? fx.world.reference_causal_basis.established_canon
        : "",
  },
  origin: { locus_id: fx.originLocusId, designation: fx.origin.designation },
  destination: { locus_id: fx.destinationLocusId, designation: fx.destination.designation },
  corridor: { statement: fx.corridor.statement },
});

export const attestRequest = (
  fx: FreightWorldFixture,
  op = "gm-attest",
): GmAttestOpeningRequest => ({
  operation_id: op,
  opening: {
    world_id: fx.opening.world_id,
    envelope_id: fx.opening.envelope_id,
    origin_locus_id: fx.opening.origin_locus_id,
    destination_locus_id: fx.opening.destination_locus_id,
    slices: fx.opening.slices.map((s) => ({
      slice_id: s.slice_id,
      slice_kind: s.slice_kind,
      statement: s.statement,
      premise: s.premise,
    })) as GmAttestOpeningRequest["opening"]["slices"],
  },
});

export const legalRequest = (
  fx: FreightWorldFixture,
  op = "gm-legal",
): GmEstablishLegalRequest => ({
  operation_id: op,
  world_id: fx.worldId,
  institution: fx.institution,
  office: fx.office,
  scope_binding: fx.scopeBinding,
  instrument: {
    instrument_id: fx.instrument.instrument_id,
    operative_effect: fx.instrument.operative_effect,
    validity_by_order: fx.instrument.validity_by_order,
    lifecycle_status: fx.instrument.lifecycle_status,
  },
});

// ---------------------------------------------------------------------------------------------
// The operator's and the player's own commands (the REAL ones, over a scripted console)
// ---------------------------------------------------------------------------------------------

const CHALLENGE = /To confirm, type exactly "([^"]+)"/;

/**
 * A console that types back only what the service asked for: it finds the fresh challenge phrase the service just printed and types it
 * exactly. (The same behaviour as tests/support/operator.ts, kept free of the test framework so that the benchmark tool can use this rig.)
 */
const confirmingTerminal = (): OperatorTerminal => {
  const said: string[] = [];
  return {
    say: (text) => {
      said.push(text);
    },
    ask: async () => {
      for (let i = said.length - 1; i >= 0; i--) {
        const m = CHALLENGE.exec(said[i]!);
        if (m) return m[1]!;
      }
      throw new Error("the service printed no challenge before asking");
    },
    close: () => undefined,
  };
};
const ctxOf = (
  session: LocalOperatorSession,
  terminal: OperatorTerminal,
  newId?: () => string,
): CommandContext => ({
  session,
  terminal,
  ...(newId ? { newId } : {}),
});

async function withSession<T>(
  rig: GmRig,
  run: (s: LocalOperatorSession) => Promise<T>,
): Promise<T> {
  const opened = await LocalOperatorSession.open({
    campaignDir: rig.campaignDir,
    operatorDir: rig.stateDir,
    expectedCampaignId: rig.fx.campaignId,
  });
  if (!opened.ok) throw new Error(`session did not open: ${JSON.stringify(opened.error)}`);
  try {
    return await run(opened.value);
  } finally {
    await opened.value.close();
  }
}

/** The operator states and confirms the starting chronology (the Temporal origin) with the existing `initialize-time` command. */
export async function operatorStartsChronology(
  rig: GmRig,
  time: CanonicalTime = rig.fx.t0,
): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), "imm-gm-chronology-")), "chronology.json");
  writeFileSync(
    path,
    JSON.stringify({
      format: "immortalis-starting-chronology",
      format_version: 1,
      time,
      statement: "SYNTHETIC FIXTURE: the morning the survey began",
    }),
  );
  chmodSync(path, 0o600);
  return withSession(rig, async (s) => {
    const out = await initializeTime(ctxOf(s, confirmingTerminal()), path);
    return out.status;
  });
}

let advanceOrdinal = 0;
/** The player's own out-of-character choice to advance to an exact target, with the existing NULL-PC `null-advance` command. */
export async function playerAdvancesTo(rig: GmRig, target: CanonicalTime): Promise<string> {
  return withSession(rig, async (s) => {
    const out = await nullAdvance(
      ctxOf(s, confirmingTerminal(), () => `gm-rig-${++advanceOrdinal}`),
      { target },
    );
    return out.status;
  });
}

// ---------------------------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------------------------

export function receiptOf(r: GmFreightResult): GmFreightReceipt {
  if (!r.ok) throw new Error(`expected a receipt, got ${JSON.stringify(r.error)}`);
  return r.value as GmFreightReceipt;
}
export function statusOf(r: GmFreightResult): GmFreightStatus {
  if (!r.ok) throw new Error(`expected a status, got ${JSON.stringify(r.error)}`);
  return r.value as GmFreightStatus;
}
export const stepNames = (r: GmFreightReceipt): string[] => r.steps.map((s) => s.step);

/** The whole authoring of an original world through the bridge, up to the legal seal (the operator states the chronology between). */
export async function authorThroughSeal(rig: GmRig): Promise<void> {
  const { fx } = rig;
  receiptOf(await rig.call("gm_freight_establish_setting", settingRequest(fx)));
  receiptOf(await rig.call("gm_freight_attest_opening", attestRequest(fx)));
  if ((await operatorStartsChronology(rig)) !== "TIME_ESTABLISHED")
    throw new Error("the starting chronology was not established");
  receiptOf(await rig.call("gm_freight_establish_legal", legalRequest(fx)));
}

/**
 * The whole chain through the bridge: authoring, then `initiate` to the production boundary, the player's advance, `initiate` to the
 * delivery boundary, the player's advance, `initiate` to adequacy. Returns the three `initiate` receipts.
 */
export async function runWholeChain(rig: GmRig): Promise<GmFreightReceipt[]> {
  await authorThroughSeal(rig);
  const out: GmFreightReceipt[] = [];
  let r = receiptOf(
    await rig.call("gm_freight_initiate", { operation_id: "gm-go-1", world_id: rig.fx.worldId }),
  );
  out.push(r);
  for (let i = 2; i <= 4 && r.awaiting?.kind === "PLAYER_OOC_TIME_ADVANCE"; i++) {
    if ((await playerAdvancesTo(rig, r.awaiting.to)) !== "NULL_PC_ADVANCE_COMMITTED")
      throw new Error("the player's advance did not commit");
    r = receiptOf(
      await rig.call("gm_freight_initiate", {
        operation_id: `gm-go-${i}`,
        world_id: rig.fx.worldId,
      }),
    );
    out.push(r);
  }
  return out;
}
