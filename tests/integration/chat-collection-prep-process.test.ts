/* eslint-disable @typescript-eslint/no-explicit-any -- real-process JSON harness */
// Actual SIGKILL and durable-filesystem EIO, distinct from mocked lost acknowledgements.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { shape } from "../support/chat-character.ts";
import {
  CYCLE,
  DECLARATION,
  HANDLING,
  MOMENT,
  chain,
  cloneSlot,
  converge,
  preparation,
  reader,
  resumed,
  startHosts,
  status,
  type Position,
  type Slot,
} from "../support/chat-route.ts";

let accepted: Partial<Record<Position, Slot>>;
let r5: Partial<Record<Position, Slot>>;
beforeAll(async () => {
  accepted = await chain();
  r5 = await chain({ cycle: false });
}, 400_000);

interface Boundary {
  target: string;
  before: Position;
  after: Position;
  tool: string;
  line: string;
  args: any;
  r5?: boolean;
}
const boundaries: Boundary[] = [
  ...[
    "RefereeAdjudicationAdapter.recordPhysical",
    "CanonicalCampaign.establishOriginalPcPhysicalLocusCustody",
  ].map((target) => ({
    target,
    before: "CHARACTER" as const,
    after: "LOCUS" as const,
    tool: "establish_character_location",
    line: "physical_location",
    args: {},
  })),
  {
    target: "TemporalCoordinator.establishCanonicalTime",
    before: "LOCUS",
    after: "MOMENT",
    tool: "state_starting_moment",
    line: "starting_moment",
    args: MOMENT,
  },
  ...["RefereeAdjudicationAdapter.recordI002", "PcCollectionAdapter.clarify"].map((target) => ({
    target,
    before: "MOMENT" as const,
    after: "HANDLING" as const,
    tool: "state_handling_duration",
    line: "handling_duration",
    args: { words: HANDLING },
    r5: true,
  })),
  ...[
    "PcCollectionAdapter.establishMechanism",
    "ProductionAdapter.establishReserve",
    "SourceDrawdownAdapter.establishBasis",
  ].map((target) => ({
    target,
    before: "MOMENT" as const,
    after: "PREPARED" as const,
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: preparation(CYCLE),
  })),
  ...[
    "PcCollectionAdapter.establishSceneClosure",
    "PcCollectionAdapter.establishWorkforceScope",
  ].map((target) => ({
    target,
    before: "PREPARED" as const,
    after: "DECLARED" as const,
    tool: "declare_closed_setting",
    line: "closed_setting",
    args: DECLARATION,
  })),
  ...["PcCollectionAdapter.attestCycle", "scenario", "settlement"].map((target) => ({
    target,
    before: "DECLARED" as const,
    after: "READY" as const,
    tool: "finish_collection_setup",
    line: "connection",
    args: {},
  })),
];

async function crash(s: Slot, b: Boundary, when: string, fault: string) {
  const marker = join(s.root, "fault-reached");
  const cfg = join(s.root, "child.json");
  writeFileSync(cfg, JSON.stringify({ config: s.config, ...b, when, fault, marker }), {
    mode: 0o600,
  });
  const hosts = startHosts(s);
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      join(import.meta.dirname, "fixtures/chat-route-process.ts"),
      cfg,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  try {
    const exit = await new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code, signal) => resolve({ code, signal }));
      },
    );
    expect(existsSync(marker), stderr).toBe(true);
    if (fault === "SIGKILL") expect(exit.signal, stderr).toBe("SIGKILL");
    else expect(exit.code, stderr).toBe(0);
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    for (const h of hosts) await h.stop();
  }
}

for (const b of boundaries)
  for (const when of ["before", "after"]) {
    it(`real SIGKILL ${when} ${b.target}: original owner identity, fresh consent only if unfinished`, async () => {
      const templates = b.r5 ? r5 : accepted;
      const s = await cloneSlot(templates[b.before]!);
      await crash(s, b, when, "SIGKILL");
      // A read never reclaims a dead lock. The existing trusted operator seam does so
      // explicitly after the real process is known dead; no canonical fact is rewritten.
      const reclaimed = await CanonicalCampaign.open(s.campaignDir, { reclaimStaleLock: true });
      expect(reclaimed.ok, JSON.stringify(reclaimed)).toBe(true);
      if (reclaimed.ok) await reclaimed.value.close();
      const r = await resumed(s);
      let asks = 0;
      try {
        const opens = vi.spyOn(CanonicalCampaign, "open");
        let initial;
        try {
          initial = (await status(r.chat)).route;
          expect(opens).toHaveBeenCalledTimes(1);
        } finally {
          opens.mockRestore();
        }
        const done = (route: any) =>
          route.barrier === "NONE" &&
          route.stages.some((l: any) => l.stage === b.line && l.state === "DONE");
        const completeBeforeRecovery = initial.stages.some(
          (l: any) => l.stage === b.line && l.state === "DONE",
        );
        await converge(r, {
          cycle: !b.r5,
          until: done,
          human: (e) => {
            if (/type exactly "/.test(e.message)) asks++;
            return reader(e);
          },
        });
        if (completeBeforeRecovery || b.after === "READY") expect(asks).toBe(0);
        else expect(asks).toBe(1);
        expect(done((await status(r.chat)).route)).toBe(true);
      } finally {
        await r.stop();
      }
      expect(await shape(s)).toEqual(await shape(templates[b.after]!));
    }, 180_000);
  }

// EIO around the actual canonical manifest commit point for every writing stage.
for (const b of boundaries) {
  for (const when of ["before", "after"])
    it(`filesystem EIO ${when} manifest publication during ${b.tool}`, async () => {
      const templates = b.r5 ? r5 : accepted;
      const s = await cloneSlot(templates[b.before]!);
      await crash(s, b, when, "EIO");
      const r = await resumed(s);
      try {
        // An ordinary v2 publication leaves no superseded snapshot residue. Reopen verifies
        // the published head and the existing recovery path reconciles the immutable intent.
        await converge(r, {
          cycle: !b.r5,
          until: (route: any) =>
            route.barrier === "NONE" &&
            route.stages.some((l: any) => l.stage === b.line && l.state === "DONE"),
        });
      } finally {
        await r.stop();
      }
      expect(await shape(s)).toEqual(await shape(templates[b.after]!));
    }, 180_000);
}
