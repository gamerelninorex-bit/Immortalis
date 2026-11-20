/* eslint-disable @typescript-eslint/no-explicit-any -- isolated benchmark instrumentation, never production */
// F-014B A0 OB-030 MATCHED cost evidence for the A0-specific journals (source lock section 7, preflight I-7 "Series A"). MECHANISM / T1 only:
// no host, model or provider; genuine model and client latency is UNRUN. This file is MEASUREMENT ONLY: it adds no production authority, reads
// the engine's public surface through a namespace import (so the same file loads in the BASE tree and in the HEAD tree) and uses the repository's
// own test fixtures to seed journals. Raw per-sample JSON is retained; nothing here changes a real campaign. The h07-s2 harness (unchanged)
// measures series P (pre-v0.9 legacy), C (current-contract) and S (history length); this file adds the journals that harness cannot seed.
//
//   seed   <kind> <outDir>               builds `<outDir>/package` (+ `<outDir>/meta.json`) with the fixture campaign flows of THIS checkout.
//                                        kinds: captured-v1 | captured-v2 | ms-v1 | ms-v2. A0OB_SEAL_SUFFIX (optional) writes the package
//                                        under a stand-in history-verification identity (an earlier build's) so a later open must replay it.
//   sample <kind> <variant> <fixtureDir> <out.json>
//                                        one fresh-process sample on a private copy: first open, immediate reopen, warm open (third open), an
//                                        exact read-back digest. variant `genuine` opens under the build's own admission; `forced-cold`
//                                        appends a label to the admission's history-verification identity so the checkpoint cannot be
//                                        trusted and the first open is a full strict replay by that build's own verifier on identical bytes.
//                                        kinds also include legacy-pre-v09 and s4-ledger (committed fixtures; production admission).
//   compare <evidenceDir> <baseSha> <headSha>
//                                        reduces the raw samples (rep 0 of every cell is the excluded warmup) to a BASE versus HEAD table and
//                                        checks that both builds reach the identical canonical outcome.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { cpus, platform, arch, release, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import * as engine from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY, canonicalJson } from "@immortalis/contracts";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  openFixtureCampaign,
} from "../tests/support/initial-setup.ts";
import { msHarness } from "../tests/support/ms-setup.ts";

const E: any = engine;
const nodeFs: any = E.nodeFs;
const [, , mode, ...args] = process.argv;
const FORCE_COLD_LABEL = "+A0OB-FORCE-COLD";

const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (t, e) =>
      t + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );
const must = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error).slice(0, 400));
  return r.value as T;
};

// -- counters (the same meters as tools/h07-s2-benchmark.ts) ----------------------------------------------------------------------------
const counts = {
  read_calls: 0,
  read_bytes: 0,
  write_calls: 0,
  write_bytes: 0,
  fsyncs: 0,
  removes: 0,
  replay_entries: 0,
  groups_verified: 0,
  sha256_calls: 0,
  sha256_bytes: 0,
};
const cores = new Map<unknown, number>();
function installMeters() {
  for (const m of ["readFile", "readRange", "readRangeSync"] as const) {
    const orig = nodeFs[m];
    const note = (b: Buffer) => {
      counts.read_calls++;
      counts.read_bytes += b.length;
      return b;
    };
    nodeFs[m] =
      m === "readRangeSync"
        ? (path: string, ...a: any[]) => note(orig(path, ...a))
        : async (path: string, ...a: any[]) => note(await orig(path, ...a));
  }
  for (const m of ["writeFileDurable", "appendDurable", "createExclusive"] as const) {
    const orig = nodeFs[m];
    nodeFs[m] = async (path: string, data: string | Buffer) => {
      counts.write_calls++;
      counts.write_bytes += Buffer.byteLength(data as any);
      counts.fsyncs += m === "writeFileDurable" ? 2 : 1;
      return orig(path, data);
    };
  }
  const mkdirp = nodeFs.mkdirp;
  nodeFs.mkdirp = async (dir: string) => {
    counts.fsyncs += 2;
    return mkdirp(dir);
  };
  const remove = nodeFs.remove;
  nodeFs.remove = async (path: string) => {
    counts.removes++;
    return remove(path);
  };
  const replay = E.CampaignCore.prototype.replay;
  E.CampaignCore.prototype.replay = function (this: unknown, ...a: any[]) {
    counts.replay_entries++;
    cores.set(this, (cores.get(this) ?? 0) + 1);
    return replay.apply(this, a);
  };
  const originalHash = crypto.createHash;
  (crypto as any).createHash = (...a: any[]) => {
    const h = Reflect.apply(originalHash, crypto, a);
    const update = h.update;
    counts.sha256_calls++;
    h.update = function (data: any, ...rest: any[]) {
      counts.sha256_bytes +=
        typeof data === "string" ? Buffer.byteLength(data) : (data?.length ?? 0);
      return Reflect.apply(update, this, [data, ...rest]);
    };
    return h;
  };
  syncBuiltinESMExports();
}
const snapshot = () => ({
  ...counts,
  strict_passes: [...cores.values()].filter((n) => n > 0).length,
});
async function timed<T>(label: string, run: () => Promise<T>) {
  const before = { c: snapshot(), cpu: process.cpuUsage(), t: performance.now() };
  const value = await run();
  const elapsed = performance.now() - before.t;
  const cpu = process.cpuUsage(before.cpu);
  const after = snapshot();
  const delta: Record<string, number> = {};
  for (const k of Object.keys(after) as (keyof typeof after)[]) delta[k] = after[k] - before.c[k];
  return {
    value,
    row: {
      label,
      elapsed_ms: elapsed,
      cpu_user_ms: cpu.user / 1000,
      cpu_system_ms: cpu.system / 1000,
      peak_rss_kb: process.resourceUsage().maxRSS,
      ...delta,
    },
  };
}
const environment = () => ({
  build: process.env["A0OB_BUILD"] ?? "unknown",
  exact_sha: process.env["A0OB_EXACT_SHA"] ?? "unknown",
  spec_lock_sha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
  node: process.version,
  platform: `${platform()} ${arch()} ${release()}`,
  cpu_model: cpus()[0]?.model,
  logical_cpus: cpus().length,
  fs_type: `0x${statfsSync(tmpdir()).type.toString(16)}`,
});

// -- seeding ----------------------------------------------------------------------------------------------------------------------------
async function seed(kind: string, out: string) {
  const suffix = process.env["A0OB_SEAL_SUFFIX"] ?? "";
  mkdirSync(out, { recursive: true });
  const meta: Record<string, unknown> = { kind, seal_suffix: suffix };
  let dir: string;
  if (kind === "captured-v1" || kind === "captured-v2") {
    const base = E.fixtureCanonicalAdmission;
    const admission = suffix
      ? { ...base, historyVerificationId: `${base.historyVerificationId}${suffix}` }
      : base;
    const h = await harness({ open: await openFixtureCampaign(undefined, {}, admission) });
    let setupId: string;
    if (kind === "captured-v2") {
      const { admitInput } = await import("../tests/support/clock-origin.ts");
      const a = await admitInput(h);
      if (!a.ok) throw new Error(`v2 Input refused: ${JSON.stringify(a.published).slice(0, 300)}`);
      setupId = a.setup_id;
    } else {
      const intake = await h.service.intake(await intakeRequest(h));
      if (intake.status !== "ADMITTED") throw new Error(JSON.stringify(intake).slice(0, 300));
      setupId = intake.setup_id!;
    }
    const done = await h.service.advance(setupId);
    if (done.status !== "COMPLETED") throw new Error(JSON.stringify(done).slice(0, 300));
    must(await E.initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    await h.campaign.close();
    dir = h.dir;
  } else if (kind === "ms-v1" || kind === "ms-v2") {
    const h: any = await msHarness({
      ...(kind === "ms-v2" ? { v2: {} } : {}),
      ...(suffix ? { historyId: (current: string) => `${current}${suffix}` } : {}),
    } as any);
    if (h.setup.status !== "COMPLETED") throw new Error(JSON.stringify(h.setup).slice(0, 300));
    const actor = await h.actorService.advance();
    if (actor.status !== "COMPLETED") throw new Error(JSON.stringify(actor).slice(0, 300));
    meta["ms_binding"] = h.actorRunner.binding;
    await h.campaign.close();
    dir = h.dir;
  } else throw new Error(`unknown kind ${kind}`);
  cpSync(dir, join(out, "package"), { recursive: true });
  mkdirSync(join(out, "package", "history"), { recursive: true });
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2));
  rmSync(dir, { recursive: true, force: true });
}

// -- the operation under test -----------------------------------------------------------------------------------------------------------
function admissionFor(kind: string, variant: string, meta: any): any {
  if (kind === "legacy-pre-v09" || kind === "s4-ledger") {
    if (variant !== "genuine")
      throw new Error("committed fixtures open under the production admission only");
    const admission = E.canonicalAdmission;
    const verify = admission.verifyHistorical.bind(admission);
    admission.verifyHistorical = (g: any, s: any) => (counts.groups_verified++, verify(g, s));
    // the legacy package is opened exactly as tests/integration/legacy-package-compat.test.ts opens it (the production admission, with the
    // pre-v0.9 admission selected by the package's own runtime contract); the S-4 package as pc-standing-ledger-policy.test.ts opens it
    return kind === "s4-ledger" ? admission : undefined;
  }
  const base = kind.startsWith("ms-")
    ? E.fixtureMsCanonicalAdmission(meta.ms_binding)
    : E.fixtureCanonicalAdmission;
  const verify = base.verifyHistorical?.bind(base);
  return {
    ...base,
    ...(variant === "forced-cold"
      ? { historyVerificationId: `${base.historyVerificationId}${FORCE_COLD_LABEL}` }
      : {}),
    ...(verify
      ? { verifyHistorical: (g: any, s: any) => (counts.groups_verified++, verify(g, s)) }
      : {}),
  };
}
const policyOf = (dir: string): unknown => {
  try {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head.checkpoint
      .verification_policy;
  } catch {
    return null;
  }
};

async function sample(kind: string, variant: string, fixture: string, out: string) {
  const work = mkdtempSync(join(tmpdir(), "immortalis-a0ob-"));
  const dir = join(work, "campaign");
  cpSync(join(fixture, "package"), dir, { recursive: true });
  mkdirSync(join(dir, "history"), { recursive: true });
  const meta = existsSync(join(fixture, "meta.json"))
    ? JSON.parse(readFileSync(join(fixture, "meta.json"), "utf8"))
    : {};
  installMeters();
  const admission = admissionFor(kind, variant, meta);
  const open = async () => {
    const opened = await E.CanonicalCampaign.open(
      dir,
      admission ? { testkitFixtureAdmission: admission } : {},
    );
    if (!opened.ok) throw new Error(`open refused: ${JSON.stringify(opened.error).slice(0, 400)}`);
    return opened.value;
  };
  const journalPath = join(dir, "journal.jsonl");
  const base = {
    kind,
    variant,
    ...environment(),
    admission_history_verification_id: admission?.historyVerificationId ?? "production",
    fixture_bytes: dirBytes(join(fixture, "package")),
    journal_bytes: statSync(journalPath).size,
    journal_entries: readFileSync(journalPath, "utf8").split("\n").filter(Boolean).length,
    verification_policy_before: policyOf(dir),
  };
  try {
    const first = await timed("first-open", open);
    const policyAfterFirst = policyOf(dir);
    await first.value.close();
    const second = await timed("second-open", open);
    await second.value.close();
    const third = await timed("third-open", open);
    const campaign = third.value;
    const store = campaign.store;
    const violations = campaign.verify();
    const outcome = {
      head: store.head(),
      facts_sha256: sha(canonicalJson(store.listFacts())),
      journal_sha256: sha(readFileSync(journalPath)),
      owner_violations: violations.length,
    };
    await campaign.close();
    writeFileSync(
      out,
      JSON.stringify(
        {
          ...base,
          opened: true,
          verification_policy_after_first_open: policyAfterFirst,
          outcome_sha256: sha(canonicalJson(outcome)),
          outcome,
          passes: [first.row, second.row, third.row],
          peak_rss_kb: process.resourceUsage().maxRSS,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    // a build that refuses the package (BASE opening a v2 journal) is a result, recorded as one
    writeFileSync(
      out,
      JSON.stringify(
        { ...base, opened: false, refusal: String((e as Error).message).slice(0, 600) },
        null,
        2,
      ),
    );
  }
  rmSync(work, { recursive: true, force: true });
}

// -- the reducer ------------------------------------------------------------------------------------------------------------------------
function compare(evidenceDir: string, baseSha: string, headSha: string) {
  const rawDir = join(evidenceDir, "raw");
  const NAME = /^sample-(.+?)-(genuine|forced-cold)-(\d+)-(base|head)\.json$/;
  type Cell = { reps: any[]; refusal?: string };
  const cells = new Map<string, Cell>();
  for (const f of readdirSync(rawDir).sort()) {
    const m = NAME.exec(f);
    if (!m) continue;
    const data = JSON.parse(readFileSync(join(rawDir, f), "utf8"));
    const key = `${m[1]}|${m[2]}|${m[4]}`;
    const cell = cells.get(key) ?? { reps: [] };
    if (!data.opened) cell.refusal = data.refusal;
    else if (Number(m[3]) > 0) cell.reps.push(data); // rep 0 is the excluded warmup
    cells.set(key, cell);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length === 0
      ? NaN
      : s.length % 2
        ? s[(s.length - 1) / 2]!
        : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  const fmt = (x: number) => (Number.isNaN(x) ? "-" : x.toFixed(1));
  const lines: string[] = [
    `# F-014B A0 OB-030, series A (A0-specific journals): BASE ${baseSha} versus HEAD ${headSha}`,
    "",
    "median over the measured repetitions (rep 0 excluded); wall ms / CPU ms (user+system) / peak RSS MB; first = first open, second = immediate reopen, third = warm open",
    "",
    "| kind | variant | build | n | journal B | entries | first wall | first CPU | second wall | third wall | RSS MB | replay calls (first) | groups verified (first) | policy after first open |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const keys = [...cells.keys()].sort();
  for (const k of keys) {
    const [kind, variant, build] = k.split("|") as [string, string, string];
    const c = cells.get(k)!;
    if (c.reps.length === 0) {
      lines.push(
        `| ${kind} | ${variant} | ${build} | 0 | - | - | REFUSED | - | - | - | - | - | - | ${(c.refusal ?? "").replace(/\|/g, "/").slice(0, 160)} |`,
      );
      continue;
    }
    const col = (i: number, f: (r: any) => number) => median(c.reps.map((r) => f(r.passes[i])));
    lines.push(
      `| ${kind} | ${variant} | ${build} | ${c.reps.length} | ${c.reps[0].journal_bytes} | ${c.reps[0].journal_entries} | ${fmt(col(0, (p) => p.elapsed_ms))} | ${fmt(col(0, (p) => p.cpu_user_ms + p.cpu_system_ms))} | ${fmt(col(1, (p) => p.elapsed_ms))} | ${fmt(col(2, (p) => p.elapsed_ms))} | ${fmt(median(c.reps.map((r) => r.peak_rss_kb)) / 1024)} | ${col(0, (p) => p.replay_entries)} | ${col(0, (p) => p.groups_verified)} | ${String(c.reps[0].verification_policy_after_first_open).slice(-120)} |`,
    );
  }
  lines.push(
    "",
    "## Canonical outcome equality (facts, head, journal bytes, owner violations)",
    "",
  );
  lines.push("| kind | variant | BASE outcome | HEAD outcome | equal |", "|---|---|---|---|---|");
  const pairs = new Set(keys.map((k) => k.split("|").slice(0, 2).join("|")));
  for (const p of [...pairs].sort()) {
    const b = cells.get(`${p}|base`);
    const h = cells.get(`${p}|head`);
    const ids = (c?: Cell) => [...new Set((c?.reps ?? []).map((r) => r.outcome_sha256))];
    const bi = ids(b);
    const hi = ids(h);
    const stable = bi.length <= 1 && hi.length <= 1;
    const verdict =
      bi.length === 0 || hi.length === 0
        ? "n/a (one build refuses the package)"
        : stable && bi[0] === hi[0]
          ? "EQUAL"
          : "DIFFERENT";
    lines.push(
      `| ${p.replace("|", " | ")} | ${bi[0]?.slice(0, 16) ?? "-"} | ${hi[0]?.slice(0, 16) ?? "-"} | ${verdict} |`,
    );
  }
  writeFileSync(join(evidenceDir, "report-a.md"), lines.join("\n") + "\n");
  process.stdout.write(lines.join("\n") + "\n");
}

if (mode === "seed") {
  const [kind, out] = args as [string, string];
  await seed(kind, out);
} else if (mode === "sample") {
  const [kind, variant, fixture, out] = args as [string, string, string, string];
  await sample(kind, variant, fixture, out);
} else if (mode === "compare") {
  const [dir, baseSha, headSha] = args as [string, string, string];
  compare(dir, baseSha, headSha);
} else {
  throw new Error("usage: seed|sample|compare (see the header comment)");
}
