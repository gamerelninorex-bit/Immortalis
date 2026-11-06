/* eslint-disable @typescript-eslint/no-explicit-any -- isolated scripted process evidence */
// SCRIPTED MECHANISM only. No genuine-host, named-client or retained-storage acceptance.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { authoredCharacter } from "../support/authored-handling.ts";
import { MOMENT, TAU, hosts } from "../support/chat-route.ts";
import { slot } from "../support/chat-setting.ts";
import { tempDir } from "../support/tmp.ts";
import { openingSetting } from "../support/two-review-opening.ts";
const BASE = "d0b010135679fac753de48dcead359a92bcd5051";
const ROOT = process.cwd();
function extract() {
  const dir = tempDir("handling-exact-base-");
  const archive = join(dir, "base.tar");
  execFileSync("git", ["archive", `--output=${archive}`, BASE, "apps/phone/src"]);
  execFileSync("tar", ["-xf", archive, "-C", dir]);
  // The candidate changes only the adapter. Both sides use the identical, unchanged owner/operator packages and dependencies.
  symlinkSync(join(ROOT, "packages"), join(dir, "packages"), "dir");
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}
async function probe(
  source: string,
  s: Awaited<ReturnType<typeof slot>>,
  omission: boolean,
  dormant: number,
) {
  const file = join(s.root, "handling-probe.json");
  writeFileSync(
    file,
    JSON.stringify({
      config: s.config,
      setting: openingSetting(),
      character: authoredCharacter(),
      omission,
      dormant,
    }),
  );
  return new Promise<any>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      join(ROOT, "tests/integration/fixtures/authored-handling-probe.ts"),
      source,
      file,
    ]);
    let out = "",
      err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || out));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(e);
      }
    });
  });
}
it("exact-base/candidate complete and omission/correction journeys record bounded refusal work and unchanged successful owner consequences", async () => {
  const base = extract(),
    evidence: any[] = [];
  for (const dormant of [0, 12])
    for (const omission of [false, true]) {
      const pair: any = { dormant, omission, repetition: 1 };
      for (const [mode, source] of [
        ["base", base],
        ["candidate", ROOT],
      ] as const) {
        const s = await slot({ playerViewHostId: "view-host" }),
          hs = await hosts(s);
        try {
          pair[mode] = await probe(source, s, omission, dormant);
          pair[mode].refereeRoundTrips = hs.reduce((n, h) => n + h.answered.length, 0);
        } finally {
          for (const h of hs) await h.stop();
        }
      }
      expect(pair.candidate.approvals).toBe(0);
      expect(pair.base.approvals).toBe(0);
      const ready = { source: 5, reserves: [0], time: MOMENT.value, characters: 1, commitments: 0 };
      const moved = {
        source: 4,
        reserves: [1],
        time: MOMENT.value + TAU,
        characters: 1,
        commitments: 1,
      };
      expect(pair.candidate.prepared).toMatchObject(ready);
      expect(pair.candidate.final).toMatchObject(moved);
      if (omission) {
        expect(pair.base.attempt.value.refused).toBe(false);
        expect(pair.base.afterAttempt.characters).toBe(1); // the base seals before discovering the missing preparation claims
        expect(pair.base.move).toBeNull();
        expect(pair.candidate.attempt.value.refused).toBe(true);
        expect(pair.candidate.afterAttempt.characters).toBe(0);
        expect(pair.candidate.attempt.traffic.tools).toBe(1);
        expect(pair.candidate.attempt.work).toMatchObject({
          opens: 0,
          prepare_groups: 0,
          fs_writes: 0,
        });
        expect(pair.candidate.correction.value).toBe("PREPARED");
      } else {
        expect(pair.candidate.attempt.value).toEqual(pair.base.attempt.value);
        expect(pair.candidate.final).toEqual(pair.base.final);
        expect(pair.candidate.refereeRoundTrips).toBe(pair.base.refereeRoundTrips);
      }
      evidence.push(pair);
    }
  const report = {
    base: BASE,
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    adapterMatchesHead:
      execFileSync("git", ["show", "HEAD:apps/phone/src/chat-tools.ts"], { encoding: "utf8" }) ===
      readFileSync(join(ROOT, "apps/phone/src/chat-tools.ts"), "utf8"),
    environment: {
      node: process.version,
      pnpm: "10.33.0",
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
    },
    fixture:
      "independently authored actuator, traversal and one-cycle words; 5 logs; exact chronology; one separately chosen log move",
    measurement:
      "one repetition per cell; source establishment/link/fixture creation and owner verification reads excluded symmetrically; character request through opening settlement, correction and separate move measured by phase; HTTP JSON body/readback bytes, canonical opens/publication work and descriptive elapsed time",
    dormant:
      "0 or 12 independently published unrelated remote loci; grows both state and journal history, not an isolated history-depth claim",
    labels: {
      scriptedMechanism: "PASS",
      genuineHost: "UNRUN",
      namedClient: "UNRUN",
      retainedStorage: "UNRUN",
      retainedRestartAndPostRestartAction: "OPEN under OB-030",
    },
    evidence,
  };
  if (process.env["HANDLING_EVIDENCE_DIR"]) {
    mkdirSync(process.env["HANDLING_EVIDENCE_DIR"], { recursive: true });
    writeFileSync(
      join(process.env["HANDLING_EVIDENCE_DIR"], "authored-handling.json"),
      JSON.stringify(report, null, 2),
    );
  }
  console.log("AUTHORED_HANDLING_EVIDENCE", JSON.stringify(report));
}, 240_000);
