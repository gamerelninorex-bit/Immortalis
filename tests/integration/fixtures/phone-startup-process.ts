/* eslint-disable @typescript-eslint/no-explicit-any -- isolated real-process instrumentation */
// Same probe at the pinned base and current source. No owner, referee answer or registration helper is installed.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const source = process.argv[2]!;
const input = JSON.parse(fs.readFileSync(process.argv[3]!, "utf8"));
const engine = await import(pathToFileURL(join(source, "packages/engine/src/index.ts")).href);
const counts = {
  reads: 0,
  readBytes: 0,
  writes: 0,
  writeBytes: 0,
  metadata: 0,
  lists: 0,
  campaignReads: 0,
  campaignWrites: 0,
};
const track = (path: unknown) => typeof path === "string" && path.startsWith(`${input.root}/`);
const campaign = (path: unknown) =>
  typeof path === "string" && path.startsWith(`${input.campaignDir}/`);
const fdPaths = new Map<number, string>();
let metering = true;
const recordRead = (path: unknown, data: string | Buffer) => {
  if (!metering || !track(path)) return;
  counts.reads++;
  counts.readBytes += Buffer.byteLength(data);
  if (campaign(path)) counts.campaignReads++;
};
const recordWrite = (path: unknown, data: string | Buffer = "") => {
  if (!metering || !track(path)) return;
  counts.writes++;
  counts.writeBytes += Buffer.byteLength(data);
  if (campaign(path)) counts.campaignWrites++;
};
const open = fs.openSync;
fs.openSync = ((...a: any[]) => {
  const fd = Reflect.apply(open, fs, a);
  if (typeof a[0] === "string") fdPaths.set(fd, a[0]);
  return fd;
}) as any;
const close = fs.closeSync;
fs.closeSync = (fd) => {
  fdPaths.delete(fd);
  return close(fd);
};
const read = fs.readFileSync;
fs.readFileSync = ((...a: any[]) => {
  const v = Reflect.apply(read, fs, a);
  recordRead(typeof a[0] === "number" ? fdPaths.get(a[0]) : a[0], v);
  return v;
}) as any;
for (const method of ["statSync", "lstatSync", "fstatSync"] as const) {
  const original = fs[method];
  (fs as any)[method] = (...a: any[]) => {
    const path = typeof a[0] === "number" ? fdPaths.get(a[0]) : a[0];
    if (metering && track(path)) counts.metadata++;
    return Reflect.apply(original, fs, a);
  };
}
for (const method of [
  "mkdirSync",
  "rmdirSync",
  "chmodSync",
  "renameSync",
  "unlinkSync",
  "rmSync",
  "writeFileSync",
] as const) {
  const original = fs[method];
  (fs as any)[method] = (...a: any[]) => {
    recordWrite(a[0], method === "writeFileSync" ? a[1] : "");
    return Reflect.apply(original, fs, a);
  };
}
syncBuiltinESMExports();
const readdir = fs.readdirSync;
fs.readdirSync = ((...a: any[]) => {
  if (metering && track(a[0])) counts.lists++;
  return Reflect.apply(readdir, fs, a);
}) as any;
syncBuiltinESMExports();
for (const method of ["readFile", "readRange"] as const) {
  const original = engine.nodeFs[method];
  engine.nodeFs[method] = async (...a: any[]) => {
    const v = await original(...a);
    recordRead(a[0], v);
    return v;
  };
}
for (const method of [
  "mkdirp",
  "writeFileDurable",
  "appendDurable",
  "createExclusive",
  "remove",
  "truncate",
] as const) {
  const original = engine.nodeFs[method];
  engine.nodeFs[method] = async (...a: any[]) => {
    const secret = String(a[0]).endsWith(".secret");
    const hit =
      input.cut &&
      ((input.cut === "secret" && method === "createExclusive" && secret) ||
        (input.cut === "config" &&
          method === "writeFileDurable" &&
          String(a[0]).endsWith("config.json")));
    if (hit && input.when === "before") process.kill(process.pid, "SIGKILL");
    recordWrite(a[0], typeof a[1] === "string" || Buffer.isBuffer(a[1]) ? a[1] : "");
    const v = await original(...a);
    if (hit && input.when === "after") process.kill(process.pid, "SIGKILL");
    return v;
  };
}
const list = engine.nodeFs.list;
engine.nodeFs.list = async (...a: any[]) => {
  if (metering && track(a[0])) counts.lists++;
  return list(...a);
};
const size = engine.nodeFs.fileSize;
engine.nodeFs.fileSize = async (...a: any[]) => {
  if (metering && track(a[0])) counts.metadata++;
  return size(...a);
};
const start = performance.now();
let phaseStart = start;
process.on("message", (message: any) => {
  if (message?.meter === "start") {
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = 0;
    phaseStart = performance.now();
    metering = true;
    process.send?.({ meter: "start", id: message.id });
  } else if (message?.meter === "stop") {
    metering = false;
    process.send?.({
      meter: "stop",
      id: message.id,
      counts,
      milliseconds: performance.now() - phaseStart,
    });
  }
});
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: any, ...a: any[]) => {
  const r = Reflect.apply(write, process.stdout, [chunk, ...a]);
  if (String(chunk).includes("immortalis-phone: listening")) {
    metering = false;
    process.send?.({ ready: true, counts, milliseconds: performance.now() - start });
  }
  return r;
}) as any;
process.argv = [process.execPath, join(source, "apps/phone/src/main.ts")];
await import(pathToFileURL(join(source, "apps/phone/src/main.ts")).href);
