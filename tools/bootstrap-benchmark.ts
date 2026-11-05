/* eslint-disable @typescript-eslint/no-explicit-any -- isolated benchmark instrumentation, never production */
// Initial Locality Bootstrap v0.9 — MATCHED, REUSABLE cost evidence (OB-030). MECHANISM / T1 only: no host, model or provider is involved,
// and genuine model/client latency is T2/T3 UNRUN. The causal action is held fixed while unrelated admissible history varies.
//
//   seed   <plain|bootstrap> <extraSources> <dir>            build a fixture campaign with the CURRENT checkout's code
//   sample <plain|bootstrap> <extraSources> <dir> <out.json> measure one fresh-process sample on a private copy of the fixture
//   guard  <facts> <out.json>                                 (head only) the Option A presence-guard scan cost over N unrelated facts
//   P-1 (bootstrap-bearing, head only; the open goes through the TEST-ONLY fixture admission by way of tests/support, never a production seam):
//   seed   <plainfx|bootstrap|bootstrap-reserved> <extra> <dir>   a fixture-admission campaign: with no bootstrap record / with a real
//                                                                 bootstrap Completion / with a SCOPE send window left open (a crash)
//   sample <plainfx|bootstrap> <extra> <dir> <out.json>           cold open, warm reopen and one ordinary commit, as for `plain`
//   recovery <dir> <out.json>                                     restart the bootstrap service over a crashed SCOPE send window and resume
//   residue <plain|plainfx|bootstrap> <dir> <out.json>            open after a torn journal tail (a crash mid-append)
//
// `plain` is a campaign with NO bootstrap record (exists at the exact base too, so base and head are directly comparable); `bootstrap`
// runs the real intake → SCOPE → Grant → SCENE → Completion path with the T1 fixtures (head only: the base has no such route).
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, arch, release, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import * as engine from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY } from "@immortalis/contracts";
import { fixtureLocus, fixtureWorld, publication, sourceInput } from "@immortalis/testkit";

const [, , mode, ...args] = process.argv;
const exactSha = process.env["BOOTSTRAP_EXACT_SHA"] ?? "unknown";

function meter() {
  const c = { read_calls: 0, read_bytes: 0, write_calls: 0, write_bytes: 0, fsync_dirs: 0 };
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

/** Counts the historical-verification work a replay actually performs (one call per replayed journal group). */
function countAdmission(admission: any) {
  const n = { check: 0, verifyHistorical: 0 };
  const check = admission.check.bind(admission);
  admission.check = (g: any, s: any) => (n.check++, check(g, s));
  if (admission.verifyHistorical) {
    const vh = admission.verifyHistorical.bind(admission);
    admission.verifyHistorical = (g: any, s: any) => (n.verifyHistorical++, vh(g, s));
  }
  return n;
}

const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (t, e) =>
      t + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );

async function seedPlain(extraSources: number, dir: string): Promise<void> {
  const created = await CanonicalCampaign.create(dir, {
    campaignId: "campaign-bench",
    buildId: "bench-seed",
  } as any);
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  const c = created.value;
  const must = async (p: Promise<any>) => {
    const r = await p;
    if (!r.ok) throw new Error(JSON.stringify(r.error));
  };
  await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(c.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(c.establishSourceCondition({ ...publication(3), source: sourceInput() }));
  for (let i = 0; i < extraSources; i++)
    await must(
      c.establishSourceCondition({
        ...publication(10 + i),
        source: sourceInput({ source_key: `bench-source-${i}` }),
      }),
    );
  await c.close();
}

async function sample(kind: string, extra: number, fixture: string, out: string) {
  const work = mkdtempSync(join(tmpdir(), "immortalis-bootstrap-bench-"));
  const dir = join(work, "campaign");
  const fx = kind !== "plain"; // fixture-admission kinds keep their package under <fixture>/package
  cpSync(fx ? join(fixture, "package") : fixture, dir, { recursive: true });
  const admissionObject = fx
    ? (engine as any).fixtureCanonicalAdmission
    : (engine as any).canonicalAdmission;
  const openOptions = fx ? { testkitFixtureAdmission: admissionObject } : {};
  const io = meter();
  // BOOTSTRAP_FORCE_REPLAY=1 changes ONLY the history verification identity, so any build performs its full strict replay on first open: it
  // lets the BASE build be measured doing the same work the head does after its identity change (attribution, not a different workload)
  if (process.env["BOOTSTRAP_FORCE_REPLAY"] === "1")
    (engine as any).canonicalAdmission.historyVerificationId += "+forced-replay";
  const counts = countAdmission(admissionObject);
  const pass = async (label: string) => {
    const before = {
      io: { ...io },
      v: { ...counts },
      cpu: process.cpuUsage(),
      t: performance.now(),
    };
    const opened = await CanonicalCampaign.open(dir, openOptions as any);
    if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
    const campaign = opened.value;
    const elapsed = performance.now() - before.t;
    const cpu = process.cpuUsage(before.cpu);
    const row = {
      label,
      elapsed_ms: elapsed,
      cpu_user_ms: cpu.user / 1000,
      cpu_system_ms: cpu.system / 1000,
      read_calls: io.read_calls - before.io.read_calls,
      read_bytes: io.read_bytes - before.io.read_bytes,
      write_calls: io.write_calls - before.io.write_calls,
      write_bytes: io.write_bytes - before.io.write_bytes,
      groups_historically_verified: counts.verifyHistorical - before.v.verifyHistorical,
      journal_entries: campaign.store.head().journal_entries,
    };
    return { campaign, row };
  };
  const first = await pass("cold-first-open");
  await first.campaign.close();
  const second = await pass("warm-reopen");
  // one ordinary commit on the reopened campaign: the hot path a routine write takes (admission incl. the v0.9 freeze prefilter)
  const t0 = performance.now();
  const c0 = { ...io };
  const k0 = counts.check;
  const committed = await second.campaign.establishSourceCondition({
    ...publication(900000),
    source: sourceInput({ source_key: "bench-hot-path-source" }),
  });
  if (!committed.ok) throw new Error(JSON.stringify(committed.error));
  const hot = {
    commit_ms: performance.now() - t0,
    write_calls: io.write_calls - c0.write_calls,
    write_bytes: io.write_bytes - c0.write_bytes,
    read_calls: io.read_calls - c0.read_calls,
    admission_checks: counts.check - k0,
  };
  await second.campaign.close();
  const res = process.resourceUsage();
  writeFileSync(
    out,
    JSON.stringify(
      {
        kind,
        extra_sources: extra,
        exact_sha: exactSha,
        history_verification_id: admissionObject.historyVerificationId,
        spec_lock_sha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
        node: process.version,
        platform: `${platform()} ${arch()} ${release()}`,
        cpu_model: cpus()[0]?.model,
        fixture_bytes: dirBytes(fixture),
        passes: [first.row, second.row],
        hot_path_commit: hot,
        peak_rss_kb: res.maxRSS,
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

/** (head only) The Option A guard scans the whole actual prefix at each dependent admission: cost over N unrelated registered facts. */
async function guard(facts: number, out: string) {
  const { qualifies, completionOf, scanInitialSetup } = engine as any;
  const { harness, intakeRequest } = await import("../tests/support/initial-setup.ts");
  const h = await harness();
  const intake = await h.service.intake(await intakeRequest(h));
  await h.service.advance(intake.setup_id!);
  const map = new Map(h.store.listFacts().map((f: any) => [f.key, f]));
  const completion = completionOf(scanInitialSetup(map).completion);
  for (let i = 0; i < facts; i++) {
    const key = `world/world-fixture-1/source/bench-pad-${i}`;
    map.set(key, {
      ...(map.get(Array.from(map.keys()).find((k: string) => k.includes("/source/"))!) as any),
      key,
    });
  }
  const t0 = performance.now();
  qualifies(completion, map, null);
  const first = performance.now() - t0;
  const reps = 20;
  const t1 = performance.now();
  for (let i = 0; i < reps; i++) qualifies(completion, map, null);
  const warm = (performance.now() - t1) / reps;
  writeFileSync(
    out,
    JSON.stringify(
      {
        facts: map.size,
        qualifies_first_call_ms: first,
        qualifies_warm_ms_per_call: warm,
        exact_sha: exactSha,
        node: process.version,
      },
      null,
      2,
    ),
  );
}

// -- P-1: bootstrap-bearing fixtures and recovery ---------------------------------------------------------------------------------------
async function fixtureSeed(kind: string, extra: number, dir: string): Promise<void> {
  const support: any = await import("../tests/support/initial-setup.ts");
  const { ScriptedIsolatedDriver, delegatingScene, delegatingScope } =
    await import("@immortalis/testkit");
  const { rmSync: rm, mkdirSync: mk, writeFileSync: wf } = await import("node:fs");
  mk(dir, { recursive: true });
  const must = async (p: Promise<any>) => {
    const r = await p;
    if (!r.ok) throw new Error(JSON.stringify(r.error));
  };
  const answers = { scope: delegatingScope(), scene: delegatingScene() };
  if (kind === "plainfx") {
    const open = await support.openFixtureCampaign();
    for (let i = 0; i < extra; i++)
      await must(
        open.campaign.establishSourceCondition({
          ...publication(10 + i),
          source: sourceInput({ source_key: `bench-source-${i}` }),
        }),
      );
    await open.campaign.close();
    cpSync(open.dir, join(dir, "package"), { recursive: true });
    return;
  }
  const reserved = kind === "bootstrap-reserved";
  const driver = reserved
    ? new ScriptedIsolatedDriver(answers, { throwAfterSend: true })
    : new ScriptedIsolatedDriver(answers);
  const h = await support.harness({ driver, answers });
  const intake = await h.service.intake(await support.intakeRequest(h));
  const advanced = await h.service.advance(intake.setup_id);
  if (reserved ? advanced.status !== "SCOPE_RESERVED_UNRESOLVED" : advanced.status !== "COMPLETED")
    throw new Error(`unexpected bootstrap status ${advanced.status}`);
  if (!reserved)
    for (let i = 0; i < extra; i++)
      await must(
        h.campaign.establishSourceCondition({
          ...publication(10 + i),
          source: sourceInput({ source_key: `bench-source-${i}` }),
        }),
      );
  await h.campaign.close();
  cpSync(h.dir, join(dir, "package"), { recursive: true });
  cpSync(h.outboxDir, join(dir, "outbox"), { recursive: true });
  wf(
    join(dir, "runner.json"),
    JSON.stringify({
      keys: h.keys,
      mac_key_hex: h.macKey.toString("hex"),
      setup_id: intake.setup_id,
      campaign_id: h.campaignId,
    }),
  );
  void rm;
}

/** Restart the bootstrap service over a SCOPE send window left open by a crash and resume it: recover-or-park, never a second driver call. */
async function recoverySample(fixture: string, out: string) {
  const support: any = await import("../tests/support/initial-setup.ts");
  const { ScriptedIsolatedDriver, delegatingScene, delegatingScope } =
    await import("@immortalis/testkit");
  const work = mkdtempSync(join(tmpdir(), "immortalis-bootstrap-recovery-"));
  cpSync(join(fixture, "package"), join(work, "package"), { recursive: true });
  cpSync(join(fixture, "outbox"), join(work, "outbox"), { recursive: true });
  const saved = JSON.parse(readFileSync(join(fixture, "runner.json"), "utf8"));
  const io = meter();
  const opened = await CanonicalCampaign.open(join(work, "package"), {
    testkitFixtureAdmission: (engine as any).fixtureCanonicalAdmission,
  } as any);
  if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
  const driver = new ScriptedIsolatedDriver({ scope: delegatingScope(), scene: delegatingScene() });
  const h = await support.harness({
    campaignId: saved.campaign_id,
    open: { campaign: opened.value, dir: join(work, "package") },
    driver,
    keys: saved.keys,
    macKey: Buffer.from(saved.mac_key_hex, "hex"),
    outboxDir: join(work, "outbox"),
  });
  const before = { io: { ...io }, cpu: process.cpuUsage(), t: performance.now() };
  const result = await h.service.advance(saved.setup_id);
  const elapsed = performance.now() - before.t;
  const cpu = process.cpuUsage(before.cpu);
  const row = {
    kind: "recovery",
    status: result.status,
    driver_calls: driver.calls.length,
    elapsed_ms: elapsed,
    cpu_user_ms: cpu.user / 1000,
    cpu_system_ms: cpu.system / 1000,
    read_calls: io.read_calls - before.io.read_calls,
    read_bytes: io.read_bytes - before.io.read_bytes,
    write_calls: io.write_calls - before.io.write_calls,
    write_bytes: io.write_bytes - before.io.write_bytes,
    journal_entries: opened.value.store.head().journal_entries,
    exact_sha: exactSha,
    node: process.version,
    platform: `${platform()} ${arch()} ${release()}`,
    cpu_model: cpus()[0]?.model,
    peak_rss_kb: process.resourceUsage().maxRSS,
  };
  await opened.value.close();
  writeFileSync(out, JSON.stringify(row, null, 2));
  rmSync(work, { recursive: true, force: true });
}

/** Open after a crash mid-append: a torn tail past the committed length is reported as residue and never adopted. */
async function residueSample(kind: string, fixture: string, out: string) {
  const { appendFileSync } = await import("node:fs");
  const work = mkdtempSync(join(tmpdir(), "immortalis-bootstrap-residue-"));
  const dir = join(work, "campaign");
  const fx = kind !== "plain";
  cpSync(fx ? join(fixture, "package") : fixture, dir, { recursive: true });
  appendFileSync(join(dir, "journal.jsonl"), '{"entry_sha256":"torn-by-a-crash-mid-append');
  const io = meter();
  const before = { io: { ...io }, cpu: process.cpuUsage(), t: performance.now() };
  const opened = await CanonicalCampaign.open(
    dir,
    (fx ? { testkitFixtureAdmission: (engine as any).fixtureCanonicalAdmission } : {}) as any,
  );
  if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
  const elapsed = performance.now() - before.t;
  const cpu = process.cpuUsage(before.cpu);
  const residue = opened.value.store.residue;
  await opened.value.close();
  writeFileSync(
    out,
    JSON.stringify(
      {
        kind: `residue-${kind}`,
        torn_tail_bytes_reported: residue.journal_tail_bytes,
        elapsed_ms: elapsed,
        cpu_user_ms: cpu.user / 1000,
        cpu_system_ms: cpu.system / 1000,
        read_calls: io.read_calls - before.io.read_calls,
        read_bytes: io.read_bytes - before.io.read_bytes,
        exact_sha: exactSha,
        node: process.version,
        peak_rss_kb: process.resourceUsage().maxRSS,
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

if (mode === "seed") {
  const [kind, extra, dir] = args as [string, string, string];
  if (kind === "plain") await seedPlain(Number(extra), dir);
  else if (kind === "plainfx" || kind === "bootstrap" || kind === "bootstrap-reserved")
    await fixtureSeed(kind, Number(extra), dir);
  else throw new Error("seed supports plain, plainfx, bootstrap and bootstrap-reserved");
} else if (mode === "sample") {
  const [kind, extra, fixture, out] = args as [string, string, string, string];
  await sample(kind, Number(extra), fixture, out);
} else if (mode === "recovery") {
  const [fixture, out] = args as [string, string];
  await recoverySample(fixture, out);
} else if (mode === "residue") {
  const [kind, fixture, out] = args as [string, string, string];
  await residueSample(kind, fixture, out);
} else if (mode === "guard") {
  const [facts, out] = args as [string, string];
  await guard(Number(facts), out);
} else {
  throw new Error("usage: seed|sample|guard|recovery|residue (see the header comment)");
}
