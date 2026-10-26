// Test instrumentation only. Counts work, never records filesystem contents or hash inputs.
import crypto from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { performance } from "node:perf_hooks";
import { CampaignCore, CanonicalCampaign, nodeFs } from "@immortalis/engine";

export function routeMeter() {
  const counts = {
    opens: 0,
    open_ms: 0,
    verifies: 0,
    replay_groups: 0,
    prepare_groups: 0,
    prepare_ms: 0,
    fact_reads: 0,
    fact_listings: 0,
    copied_fact_rows: 0,
    fs_reads: 0,
    fs_read_bytes: 0,
    fs_writes: 0,
    fs_write_bytes: 0,
    sync_reads: 0,
    sync_read_bytes: 0,
    sync_writes: 0,
    sync_write_bytes: 0,
    sync_fsyncs: 0,
    sync_renames: 0,
    sync_links: 0,
    sync_removes: 0,
    hashes: 0,
    hash_input_bytes: 0,
    serializations: 0,
    serialized_bytes: 0,
  };
  let active = true;
  let stopped = false;
  const undo: (() => void)[] = [];
  const readSync = fs.readFileSync;
  fs.readFileSync = ((...args: Parameters<typeof readSync>) => {
    const result = readSync(...args);
    if (active) {
      counts.sync_reads++;
      counts.sync_read_bytes += Buffer.byteLength(result);
    }
    return result;
  }) as typeof readSync;
  const writeSync = fs.writeSync;
  fs.writeSync = ((...args: unknown[]) => {
    const bytes = Reflect.apply(writeSync, fs, args) as number;
    if (active) {
      counts.sync_writes++;
      counts.sync_write_bytes += bytes;
    }
    return bytes;
  }) as typeof writeSync;
  const sync = fs.fsyncSync,
    rename = fs.renameSync,
    link = fs.linkSync,
    remove = fs.rmSync;
  fs.fsyncSync = (...args) => {
    if (active) counts.sync_fsyncs++;
    return sync(...args);
  };
  fs.renameSync = (...args) => {
    if (active) counts.sync_renames++;
    return rename(...args);
  };
  fs.linkSync = (...args) => {
    if (active) counts.sync_links++;
    return link(...args);
  };
  fs.rmSync = (...args) => {
    if (active) counts.sync_removes++;
    return remove(...args);
  };
  syncBuiltinESMExports();
  undo.push(() => {
    fs.readFileSync = readSync;
    fs.writeSync = writeSync;
    fs.fsyncSync = sync;
    fs.renameSync = rename;
    fs.linkSync = link;
    fs.rmSync = remove;
    syncBuiltinESMExports();
  });
  const originalStringify = JSON.stringify;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    const result = originalStringify(...args);
    if (active) {
      counts.serializations++;
      counts.serialized_bytes += typeof result === "string" ? Buffer.byteLength(result) : 0;
    }
    return result;
  }) as typeof JSON.stringify;
  undo.push(() => {
    JSON.stringify = originalStringify;
  });
  const hash = crypto.createHash;
  crypto.createHash = (...args: Parameters<typeof hash>) => {
    if (active) counts.hashes++;
    const h = hash(...args);
    const update = h.update;
    h.update = function (data: crypto.BinaryLike, encoding?: crypto.Encoding) {
      if (active)
        counts.hash_input_bytes +=
          typeof data === "string" ? Buffer.byteLength(data, encoding) : data.byteLength;
      return update.call(this, data as string, encoding ?? "utf8");
    };
    return h;
  };
  syncBuiltinESMExports();
  undo.push(() => {
    crypto.createHash = hash;
    syncBuiltinESMExports();
  });
  const open = CanonicalCampaign.open;
  CanonicalCampaign.open = async (...args: Parameters<typeof open>) => {
    const start = performance.now();
    const result = await open.apply(CanonicalCampaign, args);
    if (active) {
      counts.opens++;
      counts.open_ms += performance.now() - start;
    }
    if (result.ok) {
      const store = result.value.store;
      const get = store.getFact.bind(store);
      store.getFact = (key) => {
        if (active) counts.fact_reads++;
        return get(key);
      };
      const list = store.listFacts.bind(store);
      store.listFacts = () => {
        const facts = list();
        if (active) {
          counts.fact_listings++;
          counts.copied_fact_rows += facts.length;
        }
        return facts;
      };
    }
    return result;
  };
  undo.push(() => {
    CanonicalCampaign.open = open;
  });
  const verify = CanonicalCampaign.prototype.verify;
  CanonicalCampaign.prototype.verify = function (...args: Parameters<typeof verify>) {
    if (active) counts.verifies++;
    return verify.apply(this, args);
  };
  undo.push(() => {
    CanonicalCampaign.prototype.verify = verify;
  });
  const replay = CampaignCore.prototype.replay;
  CampaignCore.prototype.replay = function (...args: Parameters<typeof replay>) {
    if (active) counts.replay_groups++;
    return replay.apply(this, args);
  };
  undo.push(() => {
    CampaignCore.prototype.replay = replay;
  });
  const prepare = CampaignCore.prototype.prepare;
  CampaignCore.prototype.prepare = function (...args: Parameters<typeof prepare>) {
    const start = performance.now();
    if (active) counts.prepare_groups++;
    const result = prepare.apply(this, args);
    if (active) counts.prepare_ms += performance.now() - start;
    return result;
  };
  undo.push(() => {
    CampaignCore.prototype.prepare = prepare;
  });
  const read = nodeFs.readFile;
  nodeFs.readFile = async (path) => {
    const bytes = await read(path);
    if (active) {
      counts.fs_reads++;
      counts.fs_read_bytes += bytes.byteLength;
    }
    return bytes;
  };
  undo.push(() => {
    nodeFs.readFile = read;
  });
  for (const key of ["writeFileDurable", "appendDurable", "createExclusive"] as const) {
    const method = nodeFs[key];
    nodeFs[key] = async (path, data) => {
      if (active) {
        counts.fs_writes++;
        counts.fs_write_bytes += Buffer.byteLength(data);
      }
      return method(path, data);
    };
    undo.push(() => {
      nodeFs[key] = method;
    });
  }
  return {
    counts,
    snapshot: () => ({ ...counts }),
    active: (value: boolean) => {
      active = value;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      active = false;
      for (const f of undo.reverse()) f();
    },
  };
}

export const subtractWork = <T extends Record<string, number>>(after: T, before: T): T =>
  Object.fromEntries(Object.keys(after).map((k) => [k, after[k]! - before[k]!])) as T;
