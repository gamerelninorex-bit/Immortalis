/* eslint-disable @typescript-eslint/no-explicit-any -- scripted process/MCP evidence */
// Engineering Acceptance §1A: real serving main at immutable base and final source, with fixed author requests.
// Work/Android and genuine AI interpretation UNRUN. Logical FsOps + synchronous private-file I/O counts, not kernel syscall counts.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openOrdinary, slot } from "../support/chat-setting.ts";
import { BASE, boot, linked, snapshot } from "../support/phone-startup.ts";
import { tempDir } from "../support/tmp.ts";
import {
  journey,
  openingCharacter,
  openingSetting,
  reviewProposal,
} from "../support/two-review-opening.ts";

function baseline() {
  const root = process.cwd();
  const dir = tempDir("immortalis-startup-base-");
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
    );
  symlinkSync(
    join(root, "packages/operator/node_modules"),
    join(dir, "packages/operator/node_modules"),
  );
  // This PR changes no engine/contracts/protocol source; both sides execute those same unchanged packages.
  symlinkSync(join(root, "packages/engine"), join(dir, "packages/engine"));
  return dir;
}
async function dormant(s: Awaited<ReturnType<typeof slot>>, rows: number) {
  if (rows === 0) return;
  const c = await openOrdinary(s.campaignDir);
  try {
    const locus = c.locus("world-courtyard", "locus-courtyard")!.value;
    for (let n = 0; n < rows; n++) {
      const r = await c.establishLocus({
        group_id: `unrelated:${n}:group`,
        intent_id: `unrelated:${n}:intent`,
        cause: `unrelated:${n}`,
        basis: "independent dormant fixture",
        secrecy: "local-operator-session",
        locus: {
          ...locus,
          locus_id: `unused-startup-${n}`,
          designation: `Independent dormant location ${n}`,
        },
      });
      if (!r.ok) throw new Error(r.error.code);
    }
  } finally {
    await c.close();
  }
}

it("§1A before/after: actual fresh/retained main and authenticated task access, fixed action under unrelated dormant state/history", async () => {
  const base = baseline();
  const rows: any[] = [];
  for (const variation of [0, 12, 32])
    for (let repetition = 0; repetition < 3; repetition++)
      for (const [mode, source] of [
        ["base", base],
        ["current", process.cwd()],
      ] as const) {
        const s = await slot();
        let app = await boot(s, { source });
        try {
          expect(app.ready, app.logs()).toBe(true);
          expect(existsSync(s.campaignDir)).toBe(false);
          const fresh = { counts: app.counts, milliseconds: app.milliseconds };
          const player = await linked(s, "player");
          const j = journey();
          expect(
            (await reviewProposal(player, j, "propose_original_setting", openingSetting())).data
              .exit_code,
          ).toBe(0);
          await app.stop();
          await dormant(s, variation);
          const privateBefore = snapshot(s.operatorDir);
          const worldBefore = snapshot(s.campaignDir);
          app = await boot(s, { source });
          expect(app.ready, app.logs()).toBe(true);
          expect(snapshot(s.operatorDir)).toEqual(privateBefore);
          expect(snapshot(s.campaignDir)).toEqual(worldBefore);
          const retained = { counts: app.counts, milliseconds: app.milliseconds };
          await player.init({});
          const gm = await linked(s, "referee");
          const request = await player.call(
            "propose_original_character",
            openingCharacter(),
            () => {
              throw new Error("no second approval");
            },
          );
          let listed = await gm.call("referee_list_tasks", { host_id: "gm-setup" });
          if (mode === "current") {
            expect(request.isError).toBe(false);
            for (let n = 0; n < 100 && !listed.data?.tasks?.length; n++) {
              await new Promise((r) => setTimeout(r, 25));
              listed = await gm.call("referee_list_tasks", { host_id: "gm-setup" });
            }
            expect(listed.isError).toBe(false);
            expect(listed.data.tasks.length).toBeGreaterThan(0);
            const task = await gm.call("referee_get_task", {
              host_id: "gm-setup",
              task_id: listed.data.tasks[0].task_id,
            });
            expect(task.data?.operation).toBe("I002_CLASSIFY");
            expect(fresh.counts.campaignReads + fresh.counts.campaignWrites).toBe(0);
            expect(retained.counts.campaignReads + retained.counts.campaignWrites).toBe(0);
            expect(fresh.counts.lists + retained.counts.lists).toBe(0);
          } else {
            expect(request.isError).toBe(true);
            expect(request.text).toMatch(/no AI referee host is bound/);
            expect(listed.isError).toBe(true);
          }
          rows.push({
            mode,
            variation,
            repetition,
            fresh,
            retained,
            authenticatedTask:
              mode === "current" ? "I002_CLASSIFY_PENDING_READ" : "NO_HOST_REFUSAL",
          });
        } finally {
          await app.stop();
        }
      }
  for (const mode of ["base", "current"]) {
    const samples = rows.filter((r) => r.mode === mode);
    // Boot work is independent of dormant owner rows/journal groups. Timings are descriptive, never a fragile SLA.
    for (const sample of samples)
      expect(sample.retained.counts).toEqual(samples[0].retained.counts);
  }
  console.log(
    "REFEREE_STARTUP_EVIDENCE",
    JSON.stringify({
      base: BASE,
      head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      environment: {
        node: process.version,
        pnpm: "10.33.0 (CI packageManager)",
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        repetitions: 3,
      },
      fixture:
        "openingSetting/openingCharacter, authored test premises; unrelated locus rows each add an immutable history group (cardinality and journal depth vary together)",
      meter:
        "serving import through listener; logical FsOps data I/O + synchronous private-file I/O/mutations; no contents, credentials or sealed tasks recorded; not kernel syscall counts",
      rows,
      genuineAi: "UNRUN",
      supportedClient: "UNRUN",
      durableHosting: "UNRUN",
      fullFiveLogLoop: "UNRUN",
    }),
  );
}, 240_000);
