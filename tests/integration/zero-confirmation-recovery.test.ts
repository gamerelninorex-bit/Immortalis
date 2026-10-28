/* eslint-disable @typescript-eslint/no-explicit-any -- scripted client/referee and fault seams */
// Mechanism only, no live Work/human interpretation claim. Every fault interrupts the real existing owner operation.
import {
  CanonicalCampaign,
  nodeFs,
  PcCollectionAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
} from "@immortalis/engine";
import { spawn } from "node:child_process";
import fs, { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createPhoneServer } from "../../apps/phone/src/server.ts";
import {
  playerViewSecretPath,
  readPlayerViewSecretFile,
} from "../../packages/operator/src/player-view-exchange.ts";
import { shape } from "../support/chat-character.ts";
import { hosts, MOMENT, stage } from "../support/chat-route.ts";
import { openOrdinary, slot } from "../support/chat-setting.ts";
import {
  call,
  completeOpening,
  journey,
  openingCharacter,
  openingSetting,
  openingSettled,
  reviewProposal,
  supportedOpening,
} from "../support/two-review-opening.ts";
afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});
let reference: unknown;
beforeAll(async () => {
  const r = await supportedOpening();
  try {
    await completeOpening(r);
  } finally {
    await r.stop();
  }
  reference = await shape(r.s);
}, 120_000);
const UNKNOWN = {
  ok: false,
  error: { code: "UNKNOWN_OUTCOME", message: "test lost acknowledgement" },
} as const;
const operations: [{ prototype: object }, string][] = [
  [RefereeAdjudicationAdapter, "recordI002"],
  [CanonicalCampaign, "releasePlayerCharacter"],
  [RefereeAdjudicationAdapter, "recordIr"],
  [CanonicalCampaign, "bindPlayerCharacter"],
  [RefereeAdjudicationAdapter, "recordPhysical"],
  [CanonicalCampaign, "establishOriginalPcPhysicalLocusCustody"],
  [TemporalCoordinator, "establishCanonicalTime"],
  [PcCollectionAdapter, "establishMechanism"],
  [ProductionAdapter, "establishReserve"],
  [SourceDrawdownAdapter, "establishBasis"],
  [PcCollectionAdapter, "establishSceneClosure"],
  [PcCollectionAdapter, "establishWorkforceScope"],
  [PcCollectionAdapter, "attestCycle"],
];
for (const [owner, op] of operations)
  for (const landed of [false, true])
    it(`${op}: interruption ${landed ? "after" : "before"} publication recovers the unchanged accepted opening without another review`, async () => {
      const s = await slot({ playerViewHostId: "gm-setup" });
      const hs = await hosts(s);
      let app = createPhoneServer(s.config, { pollMs: 300 });
      await app.listen();
      // Use the helper only to establish the authenticated connection; its app is the service just created below.
      const { Chat, PLAYER } = await import("../support/chat-client.ts");
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      const j = journey();
      try {
        await reviewProposal(chat, j, "propose_original_setting", openingSetting());
        let faulted = false;
        const proto = owner.prototype as any;
        const original = proto[op];
        const spy = vi.spyOn(proto, op).mockImplementation(async function (
          this: object,
          ...args: any[]
        ) {
          if (faulted) return original.apply(this, args);
          faulted = true;
          if (landed) await original.apply(this, args);
          return UNKNOWN;
        });
        await reviewProposal(chat, j, "propose_original_character", openingCharacter());
        // Let the faulted run settle; recovery uses the same accepted-source receipt and original owner publication identities.
        await openingSettled(chat, j);
        spy.mockRestore();
        expect(faulted).toBe(true);
        await app.close();
        const prefix = await receiptPrefix(s);
        await freshProcess(s, chat, "OPENING");
        app = createPhoneServer(s.config, { pollMs: 300 });
        await app.listen();
        await chat.init({});
        for (let attempt = 0; attempt < 8; attempt++) {
          await call(chat, j, "reconcile_last_action");
          const o = await openingSettled(chat, j);
          if (o.state === "PREPARED") break;
          // Existing original-character resumption may finish a kept but unreleased contract; never submit new authoring input.
          if (o.state !== "REALIZING") await call(chat, j, "resume_original_character");
        }
        const o = await openingSettled(chat, j);
        await preservesPrefix(s, prefix);
        expect(await shape(s)).toEqual(reference);
        expect(o, op).toMatchObject({ state: "PREPARED" });
        expect(j.reviews).toEqual([]);
        const c = await openOrdinary(s.campaignDir);
        try {
          const facts = c.store.listFacts();
          expect(new Set(facts.map((f) => f.key)).size).toBe(facts.length);
          expect((c.store.getFact("temporal/state")!.value as any).canonical_time.value).toBe(
            MOMENT.value,
          );
          expect(
            (c.store.getFact("world/world-courtyard/source/src-loose-stones")!.value as any)
              .recoverable.amount,
          ).toBe(5);
          expect(
            facts
              .filter((f) => f.key.startsWith("production/reserve/"))
              .map((f) => (f.value as any).quantity.amount),
          ).toEqual([0]);
          expect(
            facts.filter((f) => f.key.includes("/collection/") && f.key.endsWith("/commitment")),
          ).toEqual([]);
        } finally {
          await c.close();
        }
      } finally {
        for (const h of hs) await h.stop();
        await app.close();
      }
    }, 120_000);

async function freshProcess(
  s: Awaited<ReturnType<typeof slot>>,
  chat: import("../support/chat-client.ts").Chat,
  mode: "SETTING" | "OPENING" | "RECONCILE_ONLY",
) {
  const file = join(s.root, "reopen-fixture.json");
  writeFileSync(
    file,
    JSON.stringify({
      config: s.config,
      client: { access: chat.access, refresh: chat.refresh, clientId: chat.clientId },
      mode,
    }),
    { mode: 0o600 },
  );
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      join(process.cwd(), "tests/integration/fixtures/recover-opening-probe.ts"),
      file,
    ]);
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
  });
  expect(JSON.parse(result)).toEqual({ mode, freshProcess: true, reviews: 0, state: "RECOVERED" });
}
async function receiptPrefix(s: Awaited<ReturnType<typeof slot>>) {
  const c = await openOrdinary(s.campaignDir);
  try {
    return c.store.listFacts().map((f) => ({
      key: f.key,
      version: f.version,
      intent: f.provenance.intent_id,
      sha: c.store.lookupReceipt(f.provenance.intent_id)!.group_sha256,
    }));
  } finally {
    await c.close();
  }
}
async function preservesPrefix(
  s: Awaited<ReturnType<typeof slot>>,
  prefix: Awaited<ReturnType<typeof receiptPrefix>>,
) {
  const c = await openOrdinary(s.campaignDir);
  try {
    for (const f of prefix) {
      const held = c.store.getFact(f.key)!;
      expect(held.version, f.key).toBe(f.version);
      expect(held.provenance.intent_id, f.key).toBe(f.intent);
      expect(c.store.lookupReceipt(f.intent)!.group_sha256).toBe(f.sha);
    }
  } finally {
    await c.close();
  }
}
async function recoverOpening(
  chat: import("../support/chat-client.ts").Chat,
  j: ReturnType<typeof journey>,
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await stage(chat, "reconcile_last_action", {}, () => {
      throw new Error("no new recovery approval");
    });
    const o = await openingSettled(chat, j);
    if (o.state === "PREPARED") return;
    await call(chat, j, "resume_original_character");
  }
  throw new Error("unchanged opening did not recover");
}
async function recoverSetting(
  chat: import("../support/chat-client.ts").Chat,
  j: ReturnType<typeof journey>,
) {
  await stage(chat, "reconcile_last_action", {}, () => {
    throw new Error("no duplicate setting review");
  });
  const status = await chat.call("original_setting_status");
  if (status.data?.setting?.state !== "ESTABLISHED" && status.data?.state !== "ESTABLISHED") {
    const resumed = await call(chat, j, "resume_original_setting");
    if (!resumed.isError)
      await stage(chat, "await_action", { wait_seconds: 1 }, () => {
        throw new Error("no repeat acceptance");
      });
  }
  // Finish the same retained action without ever supplying a decision.
  for (let n = 0; n < 30; n++) {
    const state = await chat.call("original_setting_status");
    if (state.data?.setting?.state === "ESTABLISHED" || state.data?.state === "ESTABLISHED") return;
    const r = await call(chat, j, "await_action", { wait_seconds: 1 });
    expect(r.result?._meta?.review).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("original setting did not recover");
}
for (const op of ["establishWorld", "establishLocus", "establishSourceCondition"] as const)
  for (const landed of [false, true])
    it(`setting ${op}: interruption ${landed ? "after" : "before"} publication preserves the original setting review and intent`, async () => {
      const r = await supportedOpening();
      let app = r.app;
      const scratch = new WeakSet<object>();
      const create = CanonicalCampaign.create;
      const createSpy = vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir, p) => {
        const result = await create.call(CanonicalCampaign, dir, p);
        if (result.ok && dir.includes("dry-run")) scratch.add(result.value);
        return result;
      });
      const original = CanonicalCampaign.prototype[op] as any;
      let fired = false;
      const fault = vi.spyOn(CanonicalCampaign.prototype, op).mockImplementation(async function (
        this: object,
        ...args: any[]
      ) {
        if (scratch.has(this) || fired) return original.apply(this, args);
        fired = true;
        if (landed) await original.apply(this, args);
        return UNKNOWN;
      });
      try {
        await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
        fault.mockRestore();
        createSpy.mockRestore();
        expect(fired).toBe(true);
        await app.close();
        const prefix = await receiptPrefix(r.s);
        await freshProcess(r.s, r.chat, "SETTING");
        app = createPhoneServer(r.s.config, { pollMs: 20 });
        await app.listen();
        await r.chat.init({});
        await recoverSetting(r.chat, r.j);
        expect(r.j.reviews).toHaveLength(0);
        await preservesPrefix(r.s, prefix);
        await reviewProposal(r.chat, r.j, "propose_original_character", openingCharacter());
        expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "PREPARED" });
        expect(r.j.reviews).toEqual([]);
        expect(await shape(r.s)).toEqual(reference);
      } finally {
        fault.mockRestore();
        createSpy.mockRestore();
        for (const h of r.hosts) await h.stop();
        await app.close();
      }
    }, 120_000);
for (const publication of [
  "binding intent",
  "view credential",
  "credential digest",
  "view binding",
  "scenario installation",
] as const)
  for (const landed of [false, true])
    it(`${publication}: interruption ${landed ? "after" : "before"} publication recovers the same configured actor without another human choice`, async () => {
      const r = await supportedOpening();
      let app = r.app;
      let fired = false;
      let restore: () => void;
      if (publication === "scenario installation") {
        const original = fs.linkSync;
        const fault = vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
          if (String(to) === r.s.config.scenarioFile && !fired) {
            fired = true;
            if (landed) original(from, to);
            throw new Error("lost installation acknowledgement");
          }
          return original(from, to);
        });
        restore = () => fault.mockRestore();
        syncBuiltinESMExports();
      } else {
        const method =
          publication === "view binding" || publication === "credential digest"
            ? "writeFileDurable"
            : "createExclusive";
        const original = nodeFs[method];
        const fault = vi
          .spyOn(nodeFs, method)
          .mockImplementation(async (path: string, data: any) => {
            const target =
              publication === "view binding"
                ? /player-view-[^/]+\/config\.json$/
                : publication === "binding intent" || publication === "credential digest"
                  ? /view-host\.bind-intent\.json$/
                  : /view-host\.secret$/;
            if (target.test(path) && !fired) {
              fired = true;
              if (landed) await original(path, data);
              throw new Error("lost binding acknowledgement");
            }
            return original(path, data);
          });
        restore = () => fault.mockRestore();
      }
      try {
        await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
        await reviewProposal(r.chat, r.j, "propose_original_character", openingCharacter());
        await openingSettled(r.chat, r.j);
        restore();
        syncBuiltinESMExports();
        expect(fired).toBe(true);
        await app.close();
        const prefix = await receiptPrefix(r.s);
        const credential = readPlayerViewSecretFile(
          playerViewSecretPath(
            { stateDir: r.s.operatorDir, campaignId: r.s.config.campaignId },
            "view-host",
          ),
        );
        await freshProcess(r.s, r.chat, "OPENING");
        app = createPhoneServer(r.s.config, { pollMs: 20 });
        await app.listen();
        await r.chat.init({});
        await recoverOpening(r.chat, r.j);
        expect(r.j.reviews).toHaveLength(0);
        if (credential !== null)
          expect(
            readPlayerViewSecretFile(
              playerViewSecretPath(
                { stateDir: r.s.operatorDir, campaignId: r.s.config.campaignId },
                "view-host",
              ),
            ),
          ).toBe(credential);
        await preservesPrefix(r.s, prefix);
        expect(await shape(r.s)).toEqual(reference);
        const scenario = JSON.parse(readFileSync(r.s.config.scenarioFile, "utf8"));
        const c = await openOrdinary(r.s.campaignDir);
        try {
          expect(scenario.player_character).toBe(c.binding()!.value.active_pc.entity_id);
        } finally {
          await c.close();
        }
      } finally {
        restore();
        syncBuiltinESMExports();
        for (const h of r.hosts) await h.stop();
        await app.close();
      }
    }, 120_000);

it("an authenticated different grant cannot resume the captured character request; the original grant recovers without approval", async () => {
  const r = await supportedOpening();
  const original = CanonicalCampaign.prototype.releasePlayerCharacter;
  let fired = false;
  const fault = vi
    .spyOn(CanonicalCampaign.prototype, "releasePlayerCharacter")
    .mockImplementation(async function (
      this: CanonicalCampaign,
      ...args: Parameters<typeof original>
    ) {
      if (!fired) {
        fired = true;
        return UNKNOWN;
      }
      return original.apply(this, args);
    });
  try {
    await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
    await reviewProposal(r.chat, r.j, "propose_original_character", openingCharacter());
    await openingSettled(r.chat, r.j);
    expect(fired).toBe(true);
    fault.mockRestore();
    const prefix = await receiptPrefix(r.s);
    const { Chat, PLAYER } = await import("../support/chat-client.ts");
    const foreign = new Chat(r.s.base);
    expect((await foreign.link("player", { player: PLAYER })).ok).toBe(true);
    await foreign.init({});
    const refused = await foreign.call("resume_original_character");
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/another authority|original.*request/);
    await preservesPrefix(r.s, prefix);
    await recoverOpening(r.chat, r.j);
    expect(await shape(r.s)).toEqual(reference);
    expect(r.j.reviews).toEqual([]);
  } finally {
    fault.mockRestore();
    await r.stop();
  }
}, 120_000);

it("a captured setting request interrupted before engine work reopens with its original input/run and no new commitment", async () => {
  const { runCli } = await import("@immortalis/operator");
  let fired = false;
  const r = await supportedOpening({
    runCli: async (argv, env) => {
      if (!fired && argv.includes("establish-locality")) {
        fired = true;
        throw new Error("interrupted before engine work");
      }
      return runCli(argv, env);
    },
  });
  let app = r.app;
  try {
    await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
    expect(fired).toBe(true);
    const file = join(r.s.operatorDir, `chat-requests.${r.s.config.campaignId}.json`);
    const captured = JSON.parse(readFileSync(file, "utf8")).receipts[0];
    expect(captured.meaning).toBe("");
    await app.close();
    await freshProcess(r.s, r.chat, "SETTING");
    const recovered = JSON.parse(readFileSync(file, "utf8")).receipts;
    expect(recovered).toHaveLength(1);
    expect(recovered[0].run).toBe(captured.run);
    expect(recovered[0].request).toEqual(captured.request);
    expect(recovered[0].meaning).not.toBe("");
    app = createPhoneServer(r.s.config, { pollMs: 20 });
    await app.listen();
    await r.chat.init({});
    await reviewProposal(r.chat, r.j, "propose_original_character", openingCharacter());
    expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "PREPARED" });
    expect(await shape(r.s)).toEqual(reference);
    expect(r.j.reviews).toEqual([]);
  } finally {
    for (const h of r.hosts) await h.stop();
    await app.close();
  }
}, 120_000);
