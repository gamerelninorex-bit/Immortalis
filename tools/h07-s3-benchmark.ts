/* eslint-disable @typescript-eslint/no-explicit-any -- isolated benchmark instrumentation, never production */
// H-07 S3 MATCHED, REUSABLE cost evidence for the policy-transition first open (OB-030). MECHANISM / T1 only: no host, model or
// provider is involved; genuine model/client latency is T2/T3 UNRUN. The causal action (one ordinary accepted commit) is held fixed
// while unrelated history and state vary. The same file runs unchanged against the exact base and the exact head: it uses only the
// engine's public surface (a namespace import, so it also loads in the older tree that builds the old-policy fixtures).
//
//   seed   canonical <extraSources> <dir>   a campaign built by THIS checkout (the older tree builds the OLD-policy fixture; the head
//                                           tree builds the NATIVE fixture whose policy already matches this build)
//   seed   store <entries> <dir>            a one-fact package under the OLD history-verification policy (history grows, state does not)
//   seed   shape <early|middle|late|rotate> <coldFacts> <updates> <dir>
//                                           a package under the OLD policy whose state is `coldFacts` padded facts and whose history then
//                                           rewrites ONE EXISTING fact per entry at the named position of the key order (adversarial for any
//                                           reuse of a hashed prefix: early rewrites change the whole message, late ones almost none)
//   sample canonical|store <old|native> <n> <fixture> <out.json>
//                                           one fresh-process sample on a private copy: first open (the transition for `old`), the
//                                           identical accepted commit, a second open, a third open and an exact read-back digest
//   interrupted canonical|store <n> <fixture> <out.json>
//                                           the first open is killed just before the manifest publication, then the recovery open
//   profile canonical|store|shape <old|native> <n> <fixture> <out.json>
//                                           where the first open spends its time (inspector profile; kept out of the timed samples)
//   counters canonical|store|shape <old|native> <n> <fixture> <out.json>
//                                           heavier, UNTIMED instrumentation of the first open: JSON.stringify calls and characters, large
//                                           sorts, state-sized Map copies and Buffer encodings (it perturbs timing, so it is never mixed
//                                           with the timed samples)
import {
  cpSync,
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
import inspector from "node:inspector";
import { cpus, platform, arch, release, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import * as engine from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY, canonicalJson } from "@immortalis/contracts";
import * as kit from "@immortalis/testkit";

const [, , mode, ...args] = process.argv;
const exactSha = process.env["H07S3_EXACT_SHA"] ?? "unknown";
const E: any = engine;
const nodeFs: any = E.nodeFs;
const OLD_ID = "h07-s3-old-policy";
const NEW_ID = "h07-s3-new-policy";
const STORE_CAMPAIGN = "h07-s3-store";
const SHAPE_CAMPAIGN = "h07-s3-shape";
const SHAPE_COLD = Number(process.env["H07S3_SHAPE_COLD"] ?? "500");

const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (t, e) =>
      t + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

// -- counters ---------------------------------------------------------------------------------------------------------------------------
const counts = {
  read_calls: 0,
  read_bytes: 0,
  journal_full_reads: 0,
  index_reads: 0,
  index_read_bytes: 0,
  write_calls: 0,
  write_bytes: 0,
  fsyncs: 0,
  removes: 0,
  replay_entries: 0,
  groups_verified: 0,
  sha256_calls: 0,
  sha256_bytes: 0,
  // A full-state hash is one SHA-256 whose message begins {"campaign_id":..."facts":[ : the receipt digest of the whole canonical state.
  // `*_bytes` are the bytes the SHA-256 actually processed for those digests (physical); `*_logical_bytes` are the length of the message
  // each digest covers (what a from-scratch hash would have processed). The two differ only where a retained SHA-256 prefix state
  // (Hash#copy) stands in for already-hashed bytes.
  full_state_hashes: 0,
  full_state_hash_bytes: 0,
  full_state_logical_bytes: 0,
  hash_copies: 0,
};
const cores = new Map<unknown, number>();
function installMeters() {
  for (const m of ["readFile", "readRange", "readRangeSync"] as const) {
    const orig = nodeFs[m];
    const note = (path: string, b: Buffer) => {
      counts.read_calls++;
      counts.read_bytes += b.length;
      if (/history\/index\./.test(path)) {
        counts.index_reads++;
        counts.index_read_bytes += b.length;
      }
      if (m === "readRange" && path.endsWith("/journal.jsonl") && b.length > 1_000_000)
        counts.journal_full_reads++;
      return b;
    };
    nodeFs[m] =
      m === "readRangeSync"
        ? (path: string, ...a: any[]) => note(path, orig(path, ...a))
        : async (path: string, ...a: any[]) => note(path, await orig(path, ...a));
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
  // per Hash object: is it a full-state digest, and how many message bytes does it logically cover
  const states = new WeakMap<object, { state: boolean; logical: number }>();
  const instrument = (h: any, inherited?: { state: boolean; logical: number }) => {
    const info = inherited ? { ...inherited } : { state: false, logical: 0 };
    states.set(h, info);
    const update = h.update;
    const copy = h.copy;
    const digest = h.digest;
    h.update = function (data: any, ...rest: any[]) {
      const bytes = typeof data === "string" ? Buffer.byteLength(data) : (data?.length ?? 0);
      counts.sha256_bytes += bytes;
      if (
        !info.state &&
        info.logical === 0 &&
        typeof data === "string" &&
        data.startsWith('{"campaign_id":') &&
        data.slice(0, 160).includes('"facts":[')
      )
        info.state = true;
      if (info.state) counts.full_state_hash_bytes += bytes;
      info.logical += bytes;
      return Reflect.apply(update, this, [data, ...rest]);
    };
    h.copy = function (...a: any[]) {
      counts.hash_copies++;
      return instrument(Reflect.apply(copy, this, a), info);
    };
    h.digest = function (...a: any[]) {
      if (info.state) {
        counts.full_state_hashes++;
        counts.full_state_logical_bytes += info.logical;
      }
      return Reflect.apply(digest, this, a);
    };
    return h;
  };
  (crypto as any).createHash = (...a: any[]) => {
    counts.sha256_calls++;
    return instrument(Reflect.apply(originalHash, crypto, a));
  };
  syncBuiltinESMExports();
}
const snapshot = () => ({
  ...counts,
  strict_passes: [...cores.values()].filter((n) => n > 0).length,
});

/** The historical verifier, counted. Canonical series: the engine's own admission object; store series: this tool's. */
function storeAdmission(id: string) {
  return {
    historyVerificationId: id,
    check: () => null,
    verifyHistorical: () => {
      counts.groups_verified++;
      return null;
    },
  };
}
function countCanonicalAdmission() {
  const admission = E.canonicalAdmission;
  const verify = admission.verifyHistorical.bind(admission);
  admission.verifyHistorical = (g: any, s: any) => (counts.groups_verified++, verify(g, s));
}

// -- fixtures ---------------------------------------------------------------------------------------------------------------------------
const change = (n: number) =>
  kit.group(
    STORE_CAMPAIGN,
    n,
    [kit.write("fact/a", n, { expected_version: n - 1 })],
    n > 1 ? { depends_on: [`group-${n - 1}`] } : {},
  );
const must = async (p: Promise<any>) => {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

async function seedCanonical(extra: number, dir: string) {
  const c = await must(
    E.CanonicalCampaign.create(dir, { campaignId: "campaign-bench", buildId: "bench-seed" }),
  );
  await must(c.establishWorld({ ...kit.publication(1), world: kit.fixtureWorld() }));
  await must(c.establishLocus({ ...kit.publication(2), locus: kit.fixtureLocus() }));
  await must(c.establishSourceCondition({ ...kit.publication(3), source: kit.sourceInput() }));
  for (let i = 0; i < extra; i++)
    await must(
      c.establishSourceCondition({
        ...kit.publication(10 + i),
        source: kit.sourceInput({ source_key: `bench-source-${i}` }),
      }),
    );
  await c.close();
}
async function seedStore(entries: number, dir: string) {
  const s = await must(
    E.createFileCampaign(dir, {
      campaignId: STORE_CAMPAIGN,
      owners: kit.TEST_OWNERS,
      admission: storeAdmission(OLD_ID),
    }),
  );
  for (let n = 1; n <= entries; n++) await must(s.commit(change(n)));
  await s.close();
}

const shapePad = (i: number) => String(i).padStart(6, "0");
const shapeKey = (kind: string, cold: number, update: number) =>
  `shape/${shapePad(
    kind === "early"
      ? 0
      : kind === "middle"
        ? Math.floor(cold / 2)
        : kind === "late"
          ? cold - 1
          : (update * 7919) % cold,
  )}`;
/**
 * `cold` padded facts (one per entry), then `updates` entries that each rewrite ONE EXISTING fact at the named place of the key order.
 * The state stays the same size while history grows, and the rewritten position decides how much of the canonical message precedes the
 * first changed byte: nothing for `early`, almost everything for `late`, anything for `rotate`.
 */
async function seedShape(kind: string, cold: number, updates: number, dir: string) {
  if (!["early", "middle", "late", "rotate"].includes(kind)) throw new Error(`shape kind ${kind}`);
  const s = await must(
    E.createFileCampaign(dir, {
      campaignId: SHAPE_CAMPAIGN,
      owners: kit.TEST_OWNERS,
      admission: storeAdmission(OLD_ID),
    }),
  );
  const versions = new Map<string, number>();
  const put = async (n: number, key: string, value: unknown) => {
    const expected = versions.get(key) ?? 0;
    await must(
      s.commit(
        kit.group(
          SHAPE_CAMPAIGN,
          n,
          [kit.write(key, value as never, { expected_version: expected })],
          n > 1 ? { depends_on: [`group-${n - 1}`] } : {},
        ),
      ),
    );
    versions.set(key, expected + 1);
  };
  for (let i = 0; i < cold; i++)
    await put(i + 1, `shape/${shapePad(i)}`, { n: i, pad: "x".repeat(256) });
  for (let u = 1; u <= updates; u++)
    await put(cold + u, shapeKey(kind, cold, u), { n: u, pad: "y".repeat(256) });
  await s.close();
}

// -- the operation under test -----------------------------------------------------------------------------------------------------------
interface Handle {
  open(
    fs?: any,
  ): Promise<{ store: any; close(): Promise<void>; commit(): Promise<any>; verify?(): unknown[] }>;
}
function handle(series: string, variant: string, dir: string): Handle {
  if (series === "canonical") {
    countCanonicalAdmission();
    return {
      async open(fs) {
        const opened = await E.CanonicalCampaign.open(dir, fs ? { fs } : {});
        if (!opened.ok)
          throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
        const c = opened.value;
        return {
          store: c.store,
          close: () => c.close(),
          verify: () => c.verify(),
          commit: () =>
            c.establishSourceCondition({
              ...kit.publication(900000),
              source: kit.sourceInput({ source_key: "bench-hot-path-source" }),
            }),
        };
      },
    };
  }
  const id = variant === "old" ? NEW_ID : OLD_ID; // the old-policy fixture is opened by a build whose policy differs
  if (series.startsWith("shape-")) {
    const kind = series.slice("shape-".length);
    return {
      async open(fs) {
        const opened = await E.openFileCampaign(dir, {
          owners: kit.TEST_OWNERS,
          admission: storeAdmission(id),
          ...(fs ? { fs } : {}),
        });
        if (!opened.ok)
          throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
        const st = opened.value;
        return {
          store: st,
          close: () => st.close(),
          // the same accepted action on every build: rewrite the fact at this shape's position (one more update)
          commit: () => {
            const n = st.head().revision + 1;
            const key = shapeKey(kind, SHAPE_COLD, n);
            const current = st.getFact(key)?.version ?? 0;
            return st.commit(
              kit.group(
                SHAPE_CAMPAIGN,
                n,
                [
                  kit.write(key, { n, pad: "z".repeat(256) } as never, {
                    expected_version: current,
                  }),
                ],
                { depends_on: [`group-${n - 1}`] },
              ),
            );
          },
        };
      },
    };
  }
  return {
    async open(fs) {
      const opened = await E.openFileCampaign(dir, {
        owners: kit.TEST_OWNERS,
        admission: storeAdmission(id),
        ...(fs ? { fs } : {}),
      });
      if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.error).slice(0, 300)}`);
      const s = opened.value;
      return {
        store: s,
        close: () => s.close(),
        commit: () => s.commit(change(s.head().revision + 1)),
      };
    },
  };
}

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
  build: process.env["H07S3_BUILD"] ?? "unknown",
  exact_sha: exactSha,
  spec_lock_sha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
  node: process.version,
  platform: `${platform()} ${arch()} ${release()}`,
  cpu_model: cpus()[0]?.model,
  logical_cpus: cpus().length,
  fs_type: `0x${statfsSync(tmpdir()).type.toString(16)}`,
});
function privateCopy(fixture: string) {
  const work = mkdtempSync(join(tmpdir(), "immortalis-h07s3-"));
  const dir = join(work, "campaign");
  cpSync(fixture, dir, { recursive: true });
  return { work, dir };
}

async function sample(series: string, variant: string, n: number, fixture: string, out: string) {
  const { work, dir } = privateCopy(fixture);
  installMeters();
  const h = handle(series, variant, dir);
  const first = await timed("first-open", () => h.open());
  const handleOne = first.value;
  const policyAfterFirst = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head
    .checkpoint.verification_policy;
  const commit = await timed("accepted-commit", async () => handleOne.commit());
  if (!commit.value.ok) throw new Error(JSON.stringify(commit.value.error));
  const close = await timed("close", () => handleOne.close());
  const second = await timed("second-open", () => h.open());
  await second.value.close();
  const third = await timed("third-open", () => h.open());
  const store = third.value.store;
  // exact read-back digest, outside the timed passes: head, every fact, probe receipts/groups and the journal bytes
  const probes = [1, Math.ceil(store.head().journal_entries / 2), store.head().journal_entries - 1];
  const intentOf = (revision: number) => {
    const line = readFileSync(join(dir, "journal.jsonl"), "utf8").split("\n")[revision - 1]!;
    const e = JSON.parse(line);
    return [e.group.intent_id, e.group.group_id];
  };
  const readback = probes.map((r) => {
    const [intent, groupId] = intentOf(r);
    return [store.lookupReceipt(intent), store.committedGroupById?.(groupId) ?? null];
  });
  const owner = third.value.verify ? third.value.verify() : [];
  const outcome = {
    head: store.head(),
    facts_sha256: sha(canonicalJson(store.listFacts())),
    readback_sha256: sha(canonicalJson(readback)),
    journal_sha256: sha(readFileSync(join(dir, "journal.jsonl"))),
    commit_receipt: commit.value.value.receipt,
    owner_violations: owner.length,
  };
  await third.value.close();
  writeFileSync(
    out,
    JSON.stringify(
      {
        series,
        variant,
        entries: n,
        ...environment(),
        fixture_bytes: dirBytes(fixture),
        verification_policy_after_first_open: policyAfterFirst,
        outcome_sha256: sha(canonicalJson(outcome)),
        outcome,
        passes: [first.row, commit.row, close.row, second.row, third.row],
        peak_rss_kb: process.resourceUsage().maxRSS,
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

/** The first open dies just before the manifest publication (successor files exist, old manifest authoritative); then recovery. */
async function interrupted(series: string, n: number, fixture: string, out: string) {
  const { work, dir } = privateCopy(fixture);
  installMeters();
  const h = handle(series, "old", dir);
  const crash = {
    ...nodeFs,
    async writeFileDurable(path: string, data: any) {
      if (path.endsWith("/manifest.json"))
        throw new Error("simulated crash before manifest publication");
      return nodeFs.writeFileDurable(path, data);
    },
  };
  const killed = await timed("killed-first-open", async () => {
    try {
      await h.open(crash);
      return "opened";
    } catch (e) {
      return String(e);
    }
  });
  for (const name of readdirSync(dir))
    if (name === "LOCK" || name.startsWith("LOCK.")) rmSync(join(dir, name));
  const manifestAfterKill = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head
    .checkpoint.verification_policy;
  const recovery = await timed("recovery-open", () => h.open());
  const store = recovery.value.store;
  const outcome = {
    head: store.head(),
    facts_sha256: sha(canonicalJson(store.listFacts())),
    journal_sha256: sha(readFileSync(join(dir, "journal.jsonl"))),
  };
  await recovery.value.close();
  writeFileSync(
    out,
    JSON.stringify(
      {
        series,
        variant: "interrupted",
        entries: n,
        ...environment(),
        killed_outcome: killed.value,
        policy_after_kill: manifestAfterKill,
        policy_after_recovery: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head
          .checkpoint.verification_policy,
        outcome_sha256: sha(canonicalJson(outcome)),
        passes: [killed.row, recovery.row],
        peak_rss_kb: process.resourceUsage().maxRSS,
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

/** Inclusive profile time of named functions during the first open (the profiler perturbs timing; never mixed with samples). */
async function profile(series: string, variant: string, n: number, fixture: string, out: string) {
  const { work, dir } = privateCopy(fixture);
  const h = handle(series, variant, dir);
  const session = new inspector.Session();
  session.connect();
  const post = (method: string, params?: object) =>
    new Promise<any>((resolve, reject) =>
      session.post(method, params as any, (err: Error | null, result: unknown) =>
        err ? reject(err) : resolve(result),
      ),
    );
  await post("Profiler.enable");
  await post("Profiler.setSamplingInterval", { interval: 1000 });
  await post("Profiler.start");
  const t0 = performance.now();
  const opened = await h.open();
  const elapsed = performance.now() - t0;
  const { profile: p } = await post("Profiler.stop");
  await opened.close();
  const nodes = new Map<number, any>(p.nodes.map((x: any) => [x.id, x]));
  const parent = new Map<number, number>();
  for (const x of p.nodes) for (const c of x.children ?? []) parent.set(c, x.id);
  const self = new Map<number, number>();
  p.samples.forEach((id: number, i: number) => self.set(id, (self.get(id) ?? 0) + p.timeDeltas[i]));
  const inclusive = new Map<string, number>();
  let total = 0;
  let gc = 0;
  for (const [id, t] of self) {
    total += t;
    if (nodes.get(id).callFrame.functionName === "(garbage collector)") gc += t;
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const f = nodes.get(cur).callFrame;
      const key = `${f.functionName || "(anonymous)"} ${String(f.url).split("/").slice(-1)[0]}`;
      if (!seen.has(key)) {
        seen.add(key);
        inclusive.set(key, (inclusive.get(key) ?? 0) + t);
      }
    }
  }
  const want = [
    "replay campaign-core.ts",
    "stateSha256 campaign-core.ts",
    "canonicalJson json.ts",
    "verifyAll canonical-campaign.ts",
    "loadCheckpoint checkpoint-package.ts",
    "reconcileCheckpointStates checkpoint-package.ts",
    "proveSuccessor checkpoint-package.ts",
    "extend history-index.ts",
    "lookup history-index.ts",
    "#compute campaign-core.ts",
    "digest state-digest.ts",
    "#rebuild state-digest.ts",
    "#merge state-digest.ts",
    "#hash state-digest.ts",
  ];
  writeFileSync(
    out,
    JSON.stringify(
      {
        series,
        variant,
        entries: n,
        ...environment(),
        open_wall_ms_under_profiler: elapsed,
        profiled_ms: total / 1000,
        gc_ms: gc / 1000,
        inclusive_ms: Object.fromEntries(want.map((k) => [k, (inclusive.get(k) ?? 0) / 1000])),
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

/** Heavier UNTIMED instrumentation of the first open: what is serialised, sorted, copied and encoded. Never mixed with timed samples. */
async function counterPass(
  series: string,
  variant: string,
  n: number,
  fixture: string,
  out: string,
) {
  const { work, dir } = privateCopy(fixture);
  installMeters();
  const extra = {
    json_stringify_calls: 0,
    json_stringify_chars: 0,
    large_sorts: 0,
    large_sort_elements: 0,
    state_map_copies: 0,
    state_map_copy_entries: 0,
    buffer_from_string_calls: 0,
    buffer_from_string_bytes: 0,
  };
  const stringify = JSON.stringify;
  (JSON as any).stringify = function (...a: any[]) {
    const r = Reflect.apply(stringify, JSON, a);
    extra.json_stringify_calls++;
    if (typeof r === "string") extra.json_stringify_chars += r.length;
    return r;
  };
  const sort = Array.prototype.sort;
  Array.prototype.sort = function (this: unknown[], ...a: any[]) {
    if (this.length >= 64) {
      extra.large_sorts++;
      extra.large_sort_elements += this.length;
    }
    return Reflect.apply(sort, this, a);
  } as any;
  const NativeMap = globalThis.Map;
  (globalThis as any).Map = new Proxy(NativeMap, {
    construct(target, args, newTarget) {
      const source = args[0];
      if (source instanceof NativeMap && source.size >= 64) {
        extra.state_map_copies++;
        extra.state_map_copy_entries += source.size;
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
  const bufferFrom = Buffer.from;
  (Buffer as any).from = function (...a: any[]) {
    if (typeof a[0] === "string") {
      extra.buffer_from_string_calls++;
      extra.buffer_from_string_bytes += Buffer.byteLength(a[0]);
    }
    return Reflect.apply(bufferFrom, Buffer, a);
  };
  const h = handle(series, variant, dir);
  const before = snapshot();
  const first = await h.open();
  const after = snapshot();
  JSON.stringify = stringify;
  Array.prototype.sort = sort;
  (globalThis as any).Map = NativeMap;
  (Buffer as any).from = bufferFrom;
  const delta: Record<string, number> = {};
  for (const k of Object.keys(after) as (keyof typeof after)[]) delta[k] = after[k] - before[k];
  await first.close();
  writeFileSync(
    out,
    JSON.stringify(
      {
        series,
        variant,
        entries: n,
        ...environment(),
        first_open_counters: { ...delta, ...extra },
      },
      null,
      2,
    ),
  );
  rmSync(work, { recursive: true, force: true });
}

if (mode === "seed") {
  const [kind, count, dir] = args as [string, string, string];
  if (kind === "canonical") await seedCanonical(Number(count), dir);
  else if (kind === "store") await seedStore(Number(count), dir);
  else if (kind === "shape") {
    const [shape, cold, updates, shapeDir] = args.slice(1) as [string, string, string, string];
    await seedShape(shape, Number(cold), Number(updates), shapeDir);
  } else throw new Error("seed supports canonical, store and shape");
} else if (mode === "sample") {
  const [series, variant, n, fixture, out] = args as [string, string, string, string, string];
  await sample(series, variant, Number(n), fixture, out);
} else if (mode === "interrupted") {
  const [series, n, fixture, out] = args as [string, string, string, string];
  await interrupted(series, Number(n), fixture, out);
} else if (mode === "profile") {
  const [series, variant, n, fixture, out] = args as [string, string, string, string, string];
  await profile(series, variant, Number(n), fixture, out);
} else if (mode === "counters") {
  const [series, variant, n, fixture, out] = args as [string, string, string, string, string];
  await counterPass(series, variant, Number(n), fixture, out);
} else {
  throw new Error("usage: seed|sample|interrupted|profile|counters (see the header comment)");
}
