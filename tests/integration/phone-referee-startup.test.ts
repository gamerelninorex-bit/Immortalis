/* eslint-disable @typescript-eslint/no-explicit-any -- scripted authenticated client/referee and adversarial files */
// F-027 RC-14/15/16, IM-15/16; partial IA-05/06/17/20/21/22/28. MECHANISM ONLY: no AI or named-client claim.
import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { bindHost, readConfig, refereeDir, secretPath } from "@immortalis/operator";
import { expect, it } from "vitest";
import { loadConfig } from "../../apps/phone/src/config.ts";
import { FOUR_OPS } from "../support/chat-character.ts";
import { freePort, PLAYER } from "../support/chat-client.ts";
import { routePolicy } from "../support/chat-route.ts";
import { openOrdinary, slot } from "../support/chat-setting.ts";
import { boot, linked, snapshot } from "../support/phone-startup.ts";
import {
  journey,
  openingCharacter,
  openingSetting,
  openingSettled,
  reviewProposal,
} from "../support/two-review-opening.ts";

const params = (s: Awaited<ReturnType<typeof slot>>) => ({
  stateDir: s.operatorDir,
  campaignId: s.config.campaignId,
});
const noApproval = () => {
  throw new Error("startup/recovery must not add a player approval");
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function tasks(gm: Awaited<ReturnType<typeof linked>>, host_id = "gm-setup") {
  const r = await gm.call("referee_list_tasks", { host_id });
  expect(r.isError, "authenticated listing must succeed, not merely reach an HTTP listener").toBe(
    false,
  );
  expect(r.data?.tasks).toBeInstanceOf(Array);
  return r.data.tasks as any[];
}
async function pending(gm: Awaited<ReturnType<typeof linked>>) {
  for (let i = 0; i < 100; i++) {
    const list = await tasks(gm);
    if (list.length) return list[0];
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("engine-built character task was not dispatched");
}

it("real main: fresh bootstrap, authenticated pending task/read/answer, retained restart and exact-request replay; wiped storage is genuinely empty", async () => {
  const s = await slot({ playerViewHostId: "gm-setup" });
  let app = await boot(s);
  expect(app.ready, app.logs()).toBe(true);
  let pump: Promise<void> | undefined;
  let stopped = false;
  try {
    expect(existsSync(s.campaignDir)).toBe(false);
    const p = params(s);
    const cfg = await readConfig(p, process.getuid!());
    expect(cfg.ok && cfg.value.hosts.map((h) => [h.host_id, h.operations])).toEqual([
      ["gm-setup", [...FOUR_OPS]],
      ["gm-collection", ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"]],
    ]);
    const player = await linked(s, "player");
    const gm = await linked(s, "referee");
    const tools = (await player.rpc("tools/list")).json.result.tools.map((t: any) => t.name);
    expect(tools).not.toContain("referee_list_tasks");
    for (const name of [
      "referee_list_tasks",
      "referee_bind_host",
      "referee-bind-host",
      "referee-bind-collection-host",
    ])
      expect((await player.call(name, { host_id: "attacker" })).json.error).toBeDefined();
    // The browser player lane also cannot invoke the old operator-only registration commands.
    const login = await player.raw("POST", "/api/login", { role: "player", token: PLAYER });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    for (const command of ["referee-bind-host", "referee-bind-collection-host"])
      expect(
        (
          await player.raw(
            "POST",
            "/api/play/command",
            { command, options: { "host-id": "attacker" } },
            { cookie, "x-immortalis-csrf": login.json.csrf },
          )
        ).status,
      ).toBe(400);
    const j = journey();
    expect(
      (await reviewProposal(player, j, "propose_original_setting", openingSetting())).data
        .exit_code,
    ).toBe(0);
    const authored = await player.call(
      "propose_original_character",
      openingCharacter(),
      noApproval,
    );
    expect(authored.isError).toBe(false);
    const first = await pending(gm);
    const doc = await gm.call("referee_get_task", { host_id: "gm-setup", task_id: first.task_id });
    expect(doc.data?.operation).toBe("I002_CLASSIFY");
    expect(
      (await gm.call("referee_get_task", { host_id: "gm-collection", task_id: first.task_id }))
        .isError,
    ).toBe(true);
    expect(
      (
        await gm.call("referee_submit_decision", {
          host_id: "gm-setup",
          task_id: first.task_id,
          answer: {},
          proof: "forged",
        })
      ).isError,
    ).toBe(true);
    // Stop with an unanswered, engine-built question. The host has not manufactured a decision.
    await app.stop();
    const retained = snapshot(s.operatorDir);
    const canon = snapshot(s.campaignDir);
    app = await boot(s);
    expect(app.ready, app.logs()).toBe(true);
    expect(snapshot(s.operatorDir)).toEqual(retained);
    expect(snapshot(s.campaignDir)).toEqual(canon);
    await player.init({});
    await gm.init({});
    expect((await tasks(gm)).map((t) => t.task_id)).toContain(first.task_id);
    expect(
      digest(
        (await gm.call("referee_get_task", { host_id: "gm-setup", task_id: first.task_id })).data,
      ),
    ).toBe(digest(doc.data));
    const policy = routePolicy();
    const accepted = await gm.call("referee_submit_decision", {
      host_id: "gm-setup",
      task_id: first.task_id,
      answer: policy(doc.data),
      claimed_model: "MECHANISM ONLY: scripted fixture reading",
    });
    expect(accepted.isError, accepted.text).toBe(false);
    expect(
      (
        await gm.call("referee_submit_decision", {
          host_id: "gm-setup",
          task_id: first.task_id,
          answer: policy(doc.data),
        })
      ).isError,
    ).toBe(true);
    const answered: string[] = [first.task_id];
    pump = (async () => {
      while (!stopped) {
        for (const host_id of s.config.refereeHostIds)
          for (const task of await tasks(gm, host_id)) {
            const question = await gm.call("referee_get_task", { host_id, task_id: task.task_id });
            const answer = await gm.call("referee_submit_decision", {
              host_id,
              task_id: task.task_id,
              answer: policy(question.data),
              claimed_model: "MECHANISM ONLY: scripted fixture reading",
            });
            expect(answer.isError, answer.text).toBe(false);
            answered.push(task.task_id);
          }
        await new Promise((r) => setTimeout(r, 15));
      }
    })();
    expect((await player.call("reconcile_last_action", {}, noApproval)).isError).toBe(false);
    const resumed = await player.call("resume_original_character", {}, noApproval);
    expect(resumed.json?.error).toBeUndefined();
    expect(resumed.isError, resumed.text).toBe(false);
    let status = await openingSettled(player, j);
    if (status.state !== "PREPARED") {
      await player.call("reconcile_last_action", {}, noApproval);
      await player.call("resume_original_character", {}, noApproval);
      status = await openingSettled(player, j);
    }
    expect(status.state).toBe("PREPARED");
    stopped = true;
    await pump;
    pump = undefined;
    expect(answered.length).toBeGreaterThan(1);
    expect(j.reviews).toEqual([]);
    const readback = (await player.call("original_character_status")).result.structuredContent
      .request_readback;
    await app.stop();
    const before = snapshot(s.operatorDir);
    const world = snapshot(s.campaignDir);
    app = await boot(s);
    expect(app.ready, app.logs()).toBe(true);
    expect(snapshot(s.operatorDir)).toEqual(before);
    expect(snapshot(s.campaignDir)).toEqual(world);
    await player.init({});
    await gm.init({});
    expect(
      (await player.call("original_character_status")).result.structuredContent.request_readback,
    ).toEqual(readback);
    await player.call("reconcile_last_action", {}, noApproval);
    expect(await openingSettled(player, j)).toMatchObject({ state: "PREPARED" });
    expect(snapshot(s.campaignDir)).toEqual(world);
    const campaign = await openOrdinary(s.campaignDir);
    try {
      expect(campaign.binding()).not.toBeNull();
    } finally {
      await campaign.close();
    }
    await app.stop();
    // A real wipe of THIS disposable campaign/operator storage, preserving its configured identity and origin.
    rmSync(s.campaignDir, { recursive: true });
    rmSync(s.operatorDir, { recursive: true });
    const empty = await boot(s);
    try {
      expect(empty.ready, empty.logs()).toBe(true);
      expect(existsSync(s.campaignDir)).toBe(false);
      const fresh = await linked(s, "player");
      expect(JSON.stringify((await fresh.call("original_setting_status")).result)).toMatch(
        /NO_SETTING|not established|no setting/i,
      );
      expect(existsSync(s.campaignDir)).toBe(false);
    } finally {
      await empty.stop();
    }
  } finally {
    stopped = true;
    try {
      if (pump) await pump;
    } finally {
      await app.stop();
    }
  }
}, 180_000);

it("consistent partial registration reuses its exact secret and finishes only the missing infrastructure host", async () => {
  const s = await slot();
  const p = params(s);
  expect(
    (
      await bindHost({
        ...p,
        operatorUid: process.getuid!(),
        hostId: "gm-setup",
        operations: FOUR_OPS,
      })
    ).ok,
  ).toBe(true);
  const before = snapshot(refereeDir(p));
  const app = await boot(s);
  try {
    expect(app.ready, app.logs()).toBe(true);
    const after = snapshot(refereeDir(p));
    expect(after["/gm-setup.secret"]).toEqual(before["/gm-setup.secret"]);
    expect((await readConfig(p, process.getuid!())).ok).toBe(true);
    expect(existsSync(s.campaignDir)).toBe(false);
  } finally {
    await app.stop();
  }
}, 30_000);

for (const [label, change, code] of [
  [
    "corrupt config",
    (s: any, p: any) => writeFileSync(join(refereeDir(p), "config.json"), "{invalid"),
    "CONFIG_INVALID",
  ],
  [
    "wrong campaign",
    (s: any, p: any) =>
      editConfig(p, (c) => {
        c.campaign_id = "other";
      }),
    "CONFIG_INVALID",
  ],
  [
    "wrong operator",
    (s: any, p: any) =>
      editConfig(p, (c) => {
        c.operator_uid++;
      }),
    "CONFIG_INVALID",
  ],
  [
    "incompatible scope",
    (s: any, p: any) =>
      editConfig(p, (c) => {
        c.hosts[0].operations = ["PC_COLLECTION_REACH"];
      }),
    "BINDING_MISMATCH",
  ],
  [
    "duplicate host",
    (s: any, p: any) =>
      editConfig(p, (c) => {
        c.hosts.push(c.hosts[0]);
      }),
    "CONFIG_INVALID",
  ],
  ["missing secret", (s: any, p: any) => rmSync(secretPath(p, "gm-setup")), "SECRET_INVALID"],
  [
    "mismatched secret",
    (s: any, p: any) => writeFileSync(secretPath(p, "gm-setup"), `${"0".repeat(64)}\n`),
    "SECRET_INVALID",
  ],
  [
    "unsafe secret mode",
    (s: any, p: any) => chmodSync(secretPath(p, "gm-setup"), 0o644),
    "UNSAFE_PATH",
  ],
  [
    "unsafe config mode",
    (s: any, p: any) => chmodSync(join(refereeDir(p), "config.json"), 0o644),
    "UNSAFE_PATH",
  ],
  ["unsafe operator mode", (s: any) => chmodSync(s.operatorDir, 0o755), "UNSAFE_PATH"],
  [
    "symlink secret",
    (s: any, p: any) => {
      const f = secretPath(p, "gm-setup");
      rmSync(f);
      symlinkSync("gm-collection.secret", f);
    },
    "UNSAFE_PATH",
  ],
  [
    "orphan secret",
    (s: any, p: any) => {
      editConfig(p, (c) => {
        c.hosts = c.hosts.filter((h: any) => h.host_id !== "gm-setup");
      });
    },
    "ORPHAN_SECRET",
  ],
  [
    "partial config publication",
    (s: any, p: any) =>
      writeFileSync(join(refereeDir(p), "config.json.tmp"), "partial", { mode: 0o600 }),
    "PARTIAL_CONFIG",
  ],
] as const)
  it(`real main refuses ${label} before listening and leaves every private record unchanged`, async () => {
    const s = await slot();
    const initial = await boot(s);
    expect(initial.ready, initial.logs()).toBe(true);
    await initial.stop();
    const p = params(s);
    change(s, p);
    const before = snapshot(s.operatorDir);
    const app = await boot(s);
    expect(app.ready).toBe(false);
    expect(app.code).toBe(2);
    expect(app.logs()).toContain(`referee startup ${code}`);
    expect(app.logs()).not.toContain("listening on");
    expect(snapshot(s.operatorDir)).toEqual(before);
    expect(existsSync(s.campaignDir)).toBe(false);
  }, 30_000);
function editConfig(p: Parameters<typeof refereeDir>[0], edit: (c: any) => void) {
  const file = join(refereeDir(p), "config.json");
  const c = JSON.parse(readFileSync(file, "utf8"));
  edit(c);
  writeFileSync(file, JSON.stringify(c));
}

for (const cut of ["secret", "config"])
  for (const when of ["before", "after"])
    it(`process interruption ${when} ${cut} publication stops explicitly on restart without credential repair`, async () => {
      const s = await slot();
      const interrupted = await boot(s, { cut, when });
      expect(interrupted.ready).toBe(false);
      expect(interrupted.signal).toBe("SIGKILL");
      const before = snapshot(s.operatorDir);
      const retry = await boot(s);
      expect(retry.ready).toBe(false);
      expect(retry.logs()).toContain("referee startup REGISTRATION_BUSY");
      expect(snapshot(s.operatorDir)).toEqual(before);
      expect(existsSync(s.campaignDir)).toBe(false);
    }, 30_000);

it("concurrent main processes never lose or rotate another startup's registration", async () => {
  const s = await slot();
  const port = await freePort();
  const other = { ...s, config: { ...s.config, port }, base: `http://127.0.0.1:${port}` };
  const apps = await Promise.all([boot(s), boot(other)]);
  try {
    expect(apps.filter((a) => a.ready).length).toBeGreaterThanOrEqual(1);
    for (const a of apps) if (!a.ready) expect(a.logs()).toMatch(/REGISTRATION_BUSY|IO_FAILED/);
    const cfg = await readConfig(params(s), process.getuid!());
    expect(cfg.ok && cfg.value.hosts).toHaveLength(2);
    expect(readdirSync(refereeDir(params(s))).filter((n) => n.endsWith(".secret"))).toHaveLength(2);
  } finally {
    await Promise.all(apps.map((a) => a.stop()));
  }
  const before = snapshot(s.operatorDir);
  const retained = await boot(s);
  try {
    expect(retained.ready, retained.logs()).toBe(true);
    expect(snapshot(s.operatorDir)).toEqual(before);
  } finally {
    await retained.stop();
  }
}, 30_000);

it("unknown host layouts fail closed; explicit custom scopes stay narrow; malformed maps reveal no input", async () => {
  const s = await slot({ refereeHostIds: ["custom"] });
  const missing = await boot(s);
  expect(missing.ready).toBe(false);
  expect(missing.logs()).toContain("BINDINGS_REQUIRED");
  const custom = await boot(s, {
    env: { IMMORTALIS_REFEREE_BINDINGS: JSON.stringify({ custom: ["I002_CLASSIFY"] }) },
  });
  try {
    expect(custom.ready, custom.logs()).toBe(true);
    const cfg = await readConfig(params(s), process.getuid!());
    expect(cfg.ok && cfg.value.hosts.map((h) => h.operations)).toEqual([["I002_CLASSIFY"]]);
  } finally {
    await custom.stop();
  }
  for (const input of [
    "",
    "SECRET-PARSER-INPUT",
    '{"custom":[]}',
    '{"other":["I002_CLASSIFY"]}',
    '{"custom":["ALL"]}',
    '{"custom":["I002_CLASSIFY","I002_CLASSIFY"]}',
  ]) {
    const invalid = await boot(s, { env: { IMMORTALIS_REFEREE_BINDINGS: input } });
    expect(invalid.ready).toBe(false);
    expect(invalid.logs()).toContain("IMMORTALIS_REFEREE_BINDINGS must map");
    expect(invalid.logs()).not.toContain("SECRET-PARSER-INPUT");
  }
  expect(loadConfig({}).ok).toBe(false);
}, 30_000);
