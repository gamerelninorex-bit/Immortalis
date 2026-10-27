/* eslint-disable @typescript-eslint/no-explicit-any -- exercised scripted conversation and counters */
// A2 mechanism evidence only. Actual Work/Android rendering, human acceptance and genuine referee interpretation remain UNRUN.
import { execFileSync, spawn } from "node:child_process";
import { symlinkSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cpus, arch, platform } from "node:os";
import { expect, it, vi } from "vitest";
import { PcCollectionAdapter } from "@immortalis/engine";
import { createPhoneServer } from "../../apps/phone/src/server.ts";
import { routeMeter } from "../support/route-meter.ts";
import { tempDir } from "../support/tmp.ts";
import { hosts, slot, MOMENT, TAU, openOrdinary, stage } from "../support/chat-route.ts";
import {
  supportedOpening,
  completeOpening,
  UI_CAPS,
  openingCharacter,
  openingSetting,
  openingSettled,
  call,
} from "../support/two-review-opening.ts";
const BASE = "bb40fb2d2daf3661eb3407c1d3864797ef33162a";
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const root = process.cwd();
const environment = {
  node: process.version,
  pnpm: "10.33.0",
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  repetitions: 3,
};
function extract() {
  const dir = tempDir("pr91-whole-base-");
  const archive = join(dir, "source.tar");
  execFileSync("git", [
    "archive",
    `--output=${archive}`,
    BASE,
    "apps/phone/src",
    "packages/operator/src",
    "packages/operator/package.json",
  ]);
  execFileSync("tar", ["-xf", archive, "-C", dir]);
  // Each side must execute its own pinned operator, including the private ordinary-action capability module.
  // Sharing the current operator would reject the base adapter's otherwise lawful one-shot capability.
  mkdirSync(join(dir, "node_modules/@immortalis"), { recursive: true });
  for (const name of readdirSync(join(root, "node_modules")))
    if (name !== "@immortalis")
      symlinkSync(join(root, "node_modules", name), join(dir, "node_modules", name));
  for (const name of readdirSync(join(root, "node_modules/@immortalis")))
    symlinkSync(
      name === "operator"
        ? join(dir, "packages/operator")
        : join(root, "node_modules/@immortalis", name),
      join(dir, "node_modules/@immortalis", name),
      "dir",
    );
  symlinkSync(
    join(root, "packages/operator/node_modules"),
    join(dir, "packages/operator/node_modules"),
    "dir",
  );
  return dir;
}
async function probe(source: string, s: any, input: any) {
  const file = join(s.root, "probe.json");
  writeFileSync(file, JSON.stringify({ ...input, config: s.config }));
  return new Promise<any>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        join(root, "tests/integration/fixtures/two-review-journey-probe.ts"),
        source,
        file,
      ],
      { cwd: root },
    );
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || out));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(e);
      }
    });
  });
}
it("A2: fixed-input whole journeys compare real review controls and I/O across base/current, dormant state/history and genuine missing prerequisites", async () => {
  const base = extract();
  const evidence: any[] = [];
  for (const missing of [false, true])
    for (const variation of [
      { facts: 0, history: 0 },
      { facts: 12, history: 0 },
      { facts: 0, history: 20 },
    ])
      for (let repetition = 0; repetition < environment.repetitions; repetition++) {
        const pair: any = { missing, variation, repetition };
        const setting = openingSetting();
        const character = openingCharacter();
        if (missing) {
          delete setting.opening;
          delete character.opening.preparation;
          character.embodiment = character.embodiment.replace(
            "one chopped log every 12 second; ",
            "",
          );
        }
        for (const [mode, source] of [
          ["base", base],
          ["current", root],
        ] as const) {
          const s = await slot({ playerViewHostId: "view-host" });
          const hs = await hosts(s);
          try {
            pair[mode] = await probe(source, s, { setting, character, missing, variation, mode });
          } finally {
            for (const h of hs) await h.stop();
          }
        }
        const current = pair.current,
          prior = pair.base;
        expect(prior.inlineResource).toBe(false);
        expect(current.inlineResource).toBe(true); // falsifiable against the immutable base
        expect(prior.reviews).toHaveLength(missing ? 4 : 7);
        expect(prior.typedChallenges).toBe(prior.reviews.length);
        expect(current.reviews).toEqual([
          { channel: "ui", category: "setting" },
          { channel: "ui", category: "generation" },
        ]);
        expect(current.typedChallenges).toBe(0);
        expect(current.pageSwitches).toBe(0);
        expect(current.state).toEqual(prior.state);
        expect(current.state).toMatchObject(
          missing
            ? { source: 5, reserves: [], time: null, commitments: 0, custody: true }
            : {
                source: 0,
                reserves: [5],
                time: MOMENT.value + 5 * TAU,
                commitments: 1,
                custody: true,
              },
        );
        expect(current.work.prepare_groups).toBe(prior.work.prepare_groups); // same canonical operations, no alternate owner machinery
        for (const key of [
          "opens",
          "verifies",
          "fs_reads",
          "fs_writes",
          "sync_reads",
          "sync_writes",
        ])
          expect(Number.isFinite(current.work[key])).toBe(true);
        evidence.push(pair);
      }
  console.log(
    "PR91_WHOLE_JOURNEY",
    JSON.stringify({
      base: BASE,
      head: HEAD,
      environment,
      fixture:
        "independently authored five logs, claims, chronology, scene/workforce; missing branch omits chronology/cycle",
      fixtureCreation: "excluded symmetrically; full link/review/setup/action/reopen I/O included",
      limits: {
        receipts: 100,
        receiptBytes: 33554432,
        liveClient: "UNRUN",
        timings: "descriptive; no SLA",
      },
      evidence,
    }),
  );
}, 720_000);
it("A2: a grouped opening partial declaration reopens under the same grant/receipt, preserves the original owner intent and requires zero repeat review", async () => {
  const evidence: any[] = [];
  for (const variation of [0, 12]) {
    const r = await supportedOpening();
    let app = r.app;
    const meter = routeMeter();
    const proto = PcCollectionAdapter.prototype;
    const original = proto.establishWorkforceScope;
    let fail = true;
    const spy = vi.spyOn(proto, "establishWorkforceScope").mockImplementation(async function (
      this: PcCollectionAdapter,
      ...args
    ) {
      if (fail) {
        fail = false;
        return {
          ok: false,
          error: { code: "UNKNOWN_OUTCOME", message: "test reply lost before publication" },
        };
      }
      return original.apply(this, args);
    });
    try {
      await completeOpening(r).catch(() => undefined);
      spy.mockRestore();
      const before = await openOrdinary(r.s.campaignDir);
      let closureIntent: string;
      try {
        const owner = new PcCollectionAdapter(before.store);
        closureIntent = owner.sceneClosure("world-courtyard", "locus-courtyard")!.fact.provenance
          .intent_id;
        for (let n = 0; n < variation; n++) {
          const w = await before.establishLocus({
            group_id: `recovery-extra-${n}:g`,
            intent_id: `recovery-extra-${n}:i`,
            cause: `recovery-extra-${n}`,
            basis: "independent dormant fixture",
            secrecy: "local-operator-session",
            locus: {
              world: { fact_key: "world/world-courtyard/profile", entity_id: "world-courtyard" },
              locus_id: `recovery-unused-${n}`,
              designation: "Unused separate ground",
              constraints: [],
            },
          });
          expect(w.ok).toBe(true);
        }
      } finally {
        await before.close();
      }
      const accepted = r.j.reviews.length;
      expect(accepted).toBe(2);
      await app.close();
      app = createPhoneServer(r.s.config, { pollMs: 20 });
      await app.listen();
      await r.chat.init(UI_CAPS);
      await stage(r.chat, "reconcile_last_action", {}, () => {
        throw new Error("recovery cannot ask again");
      });
      expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "PREPARED" });
      expect(r.j.reviews).toHaveLength(accepted);
      const c = await openOrdinary(r.s.campaignDir);
      try {
        const owner = new PcCollectionAdapter(c.store);
        expect(
          owner.sceneClosure("world-courtyard", "locus-courtyard")!.fact.provenance.intent_id,
        ).toBe(closureIntent!);
        expect(owner.sceneClosure("world-courtyard", "locus-courtyard")!.fact.version).toBe(1);
        expect(owner.workforceScope("world-courtyard", "locus-courtyard")!.fact.version).toBe(1);
        expect((c.store.getFact("temporal/state")!.value as any).canonical_time.value).toBe(
          MOMENT.value,
        );
      } finally {
        await c.close();
      }
      evidence.push({ variation, reviews: accepted, repeatedReviews: 0, work: meter.snapshot() });
    } finally {
      spy.mockRestore();
      meter.stop();
      for (const h of r.hosts) await h.stop();
      await app.close();
    }
  }
  console.log("PR91_RECOVERY_A2", JSON.stringify({ head: HEAD, environment, evidence }));
}, 240_000);
void readFileSync;
void call;
