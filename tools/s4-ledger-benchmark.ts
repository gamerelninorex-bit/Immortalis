/* eslint-disable @typescript-eslint/no-explicit-any -- isolated benchmark instrumentation, never production */
// S-4 initial Standing Instruction ledger — MATCHED, REUSABLE whole-operation cost evidence (BLUE brief B4 "Whole operation", Tenet 1).
// MECHANISM / T1 only: no host, model or provider is involved. The causal action is HELD FIXED (one PC, one world, one locus, one
// first-ACTIVATION binding) while the amount of UNRELATED dormant history varies; the same script runs on the pre-S-4 base and on the
// S-4 head, and the only difference between the two runs is that the S-4 head also commits the PC's ledger before the binding
// (`initializePcStandingInstructionLedger` exists only there).
//
//   seed   <dormant> <dir>                 build a campaign with <dormant> unrelated worlds, a world+locus and a RELEASED PC (nothing bound)
//   sample <dormant> <seedDir> <out.json>  one FRESH-PROCESS sample on a private copy of the seed
//   matrix <outDir>                        the whole matrix: S4_BENCH_SIZES (default 0,100,500,2000) x S4_BENCH_REPS (default 3)
//
// One sample measures, each as elapsed ms, CPU ms, filesystem read/write calls and bytes and the admission work counters:
//   (1) the cold OPEN of the pre-action campaign (strict replay of all the dormant history: the inherited, history-dependent cost);
//   (2) the ACTION: [ledger initialization,] binding (create-time derivation, validation, hashing, serialization, group writes);
//   (3) the cold REOPEN after the action (strict replay + canonical integrity of the whole history, ledger and binding included);
//   (4) the explicit full `verify()`.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, arch, release, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { CanonicalCampaign, nodeFs, canonicalAdmission } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";

const [, , mode, ...args] = process.argv;
const exactSha = process.env["S4_BENCH_SHA"] ?? "unknown";

function meter() {
  const c = { read_calls: 0, read_bytes: 0, write_calls: 0, write_bytes: 0 };
  for (const m of ["readFile", "readRange", "readRangeSync"] as const) {
    const orig = (nodeFs as any)[m];
    (nodeFs as any)[m] = (...a: any[]) => {
      const r = orig(...a);
      const note = (b: Buffer) => {
        c.read_calls++;
        c.read_bytes += b.length;
        return b;
      };
      return r && typeof r.then === "function" ? r.then(note) : note(r);
    };
  }
  for (const m of ["writeFileDurable", "appendDurable", "createExclusive"] as const) {
    const orig = (nodeFs as any)[m];
    (nodeFs as any)[m] = async (path: string, data: string | Buffer) => {
      c.write_calls++;
      c.write_bytes += Buffer.byteLength(data as any);
      return orig(path, data);
    };
  }
  return c;
}

function countAdmission() {
  const n = { check: 0, verifyHistorical: 0 };
  const a: any = canonicalAdmission;
  const check = a.check.bind(a);
  a.check = (g: any, s: any) => (n.check++, check(g, s));
  const vh = a.verifyHistorical.bind(a);
  a.verifyHistorical = (g: any, s: any) => (n.verifyHistorical++, vh(g, s));
  return n;
}

const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (t, e) =>
      t + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );

const must = async (p: Promise<any>) => {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

async function seed(dormant: number, dir: string): Promise<void> {
  const c = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "s4-bench-seed",
    } as any),
  );
  await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(c.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(c.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  // unrelated dormant history: worlds nothing refers to (each is one committed fact and one journal entry)
  for (let i = 0; i < dormant; i++)
    await must(
      c.establishWorld({
        ...publication(1000 + i),
        world: fixtureWorld({ world_id: `dormant-${i}` }),
      }),
    );
  await c.close();
}

async function sample(dormant: number, fixture: string, out: string): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "immortalis-s4-bench-"));
  const dir = join(work, "campaign");
  cpSync(fixture, dir, { recursive: true });
  const io = meter();
  const adm = countAdmission();
  const phase = async <T>(label: string, f: () => Promise<T>): Promise<{ row: any; value: T }> => {
    const b = { io: { ...io }, adm: { ...adm }, cpu: process.cpuUsage(), t: performance.now() };
    const value = await f();
    const cpu = process.cpuUsage(b.cpu);
    return {
      value,
      row: {
        label,
        elapsed_ms: performance.now() - b.t,
        cpu_user_ms: cpu.user / 1000,
        cpu_system_ms: cpu.system / 1000,
        read_calls: io.read_calls - b.io.read_calls,
        read_bytes: io.read_bytes - b.io.read_bytes,
        write_calls: io.write_calls - b.io.write_calls,
        write_bytes: io.write_bytes - b.io.write_bytes,
        admission_check_calls: adm.check - b.adm.check,
        admission_verify_historical_calls: adm.verifyHistorical - b.adm.verifyHistorical,
      },
    };
  };
  const openOnce = async (buildId: string) => {
    const r = await CanonicalCampaign.open(dir, { buildId } as any);
    if (!r.ok) throw new Error(`open failed: ${JSON.stringify(r.error).slice(0, 300)}`);
    return r.value;
  };
  const rows: any[] = [];
  const first = await phase("cold open (before the action)", () => openOnce("s4-bench-open"));
  rows.push(first.row);
  const c: any = first.value;
  const hasLedger = typeof c.initializePcStandingInstructionLedger === "function";
  const journalBefore = c.store.head().journal_entries;
  const action = await phase(
    hasLedger ? "action: ledger initialization + binding" : "action: binding",
    async () => {
      if (hasLedger)
        await must(
          c.initializePcStandingInstructionLedger({
            pc_id: FIXTURE_PC_ID,
            world_id: FIXTURE_WORLD_ID,
            locus_id: FIXTURE_LOCUS_ID,
          }),
        );
      await must(
        c.bindPlayerCharacter({
          ...publication(4),
          pc_id: FIXTURE_PC_ID,
          world_id: FIXTURE_WORLD_ID,
          locus_id: FIXTURE_LOCUS_ID,
          insertion: fixtureInsertionFact(),
        }),
      );
    },
  );
  rows.push(action.row);
  const groupsCommitted = c.store.head().journal_entries - journalBefore;
  const verified = await phase("full verify()", async () => c.verify());
  rows.push(verified.row);
  if ((verified.value as any[]).length) throw new Error("integrity violations after the action");
  await c.close();
  const reopened = await phase("cold reopen (after the action)", () => openOnce("s4-bench-reopen"));
  rows.push(reopened.row);
  const head = (reopened.value as any).store.head();
  await (reopened.value as any).close();
  const result = {
    dormant,
    exact_sha: exactSha,
    has_ledger_initializer: hasLedger,
    groups_committed_by_the_action: groupsCommitted,
    journal_entries_after: head.journal_entries,
    package_bytes_after: dirBytes(dir),
    rows,
    node: process.version,
    platform: `${platform()}-${arch()} ${release()}`,
    cpus: cpus().length,
  };
  writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  rmSync(work, { recursive: true, force: true });
}

function matrix(outDir: string): void {
  const sizes = (process.env["S4_BENCH_SIZES"] ?? "0,100,500,2000").split(",").map(Number);
  const reps = Number(process.env["S4_BENCH_REPS"] ?? "3");
  mkdirSync(outDir, { recursive: true });
  const script = new URL(import.meta.url).pathname;
  const base = ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", script];
  const run = (...a: string[]) => {
    const r = spawnSync(process.execPath, [...base, ...a], { encoding: "utf8", env: process.env });
    if (r.status !== 0) throw new Error(`${a.join(" ")} failed: ${r.stderr.slice(0, 400)}`);
  };
  for (const n of sizes) {
    const seedDir = join(outDir, `seed-${n}`);
    rmSync(seedDir, { recursive: true, force: true });
    run("seed", String(n), seedDir);
    for (let rep = 1; rep <= reps; rep++)
      run("sample", String(n), seedDir, join(outDir, `sample-${n}-${rep}.json`));
    rmSync(seedDir, { recursive: true, force: true });
  }
}

if (mode === "seed") await seed(Number(args[0]), args[1]!);
else if (mode === "sample") await sample(Number(args[0]), args[1]!, args[2]!);
else if (mode === "matrix") matrix(args[0]!);
else throw new Error(`unknown mode ${String(mode)}`);
