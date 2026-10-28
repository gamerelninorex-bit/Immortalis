/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The chat-requested ORIGINAL locality setup (BLUE v5.2-A1): an authenticated chat host proposes ONE original world + ONE locality + ONE exact
// finite source; the human independently confirms it through the client's own surface; the shipped `establish-locality` path and the real
// World-State owners commit it; a fresh owner-verified reopen reads it back.
//
// EVERYTHING HERE IS A MECHANISM TEST. The "assistant" is a script that calls typed tools; the "human" is a script that answers the
// elicitation only where a test says so. It proves transport, authority and recovery over the real service and the real owners; it is not a
// chat host, a model, a person or a client UI, and it proves nothing about the quality of any authored setting.
import { CanonicalCampaign } from "@immortalis/engine";
import { runCli } from "@immortalis/operator";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER, REFEREE, type Human } from "../support/chat-client.ts";
import {
  LOCALITY_CAMPAIGN,
  LOCUS,
  SOURCE,
  STONES,
  WORLD,
  courtyard,
  establishViaChat,
  facts,
  follow,
  headOf,
  loseReply,
  openOrdinary,
  pendingPath,
  pinFiles,
  pinPublishFails,
  reference,
  run,
  slot,
} from "../support/chat-setting.ts";
import { SOURCE_KEY, WORLD_ID } from "../support/locality.ts";
import { BASIS } from "../support/observation.ts";
import {
  collectAndComplete,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import { Browser } from "../support/phone-browser.ts";

afterEach(() => vi.restoreAllMocks());

describe("MECHANISM: a chat host proposes, the human confirms, the owners commit, a fresh reopen reads it back", () => {
  it("twelve loose stone units: propose → the player's own confirmation → owner publications → fresh reopen → OOC readback; no JSON, path or phrase crosses the model", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      expect(existsSync(s.campaignDir)).toBe(false);
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "NOT_STARTED", barrier: "NONE" });
      const { proposed, finished } = await establishViaChat(r.chat);
      expect(proposed.isError).toBe(false);
      expect(finished.data.state).toBe("FINISHED");
      expect(finished.data.exit_code).toBe(0);
      expect(finished.data.result.status).toBe("LOCALITY_READY");
      expect(finished.data.setting.state).toBe("ESTABLISHED");
      expect(finished.data.setting.readback).toMatchObject({
        world_id: WORLD,
        source_key: SOURCE,
        established: { amount: STONES, unit: "stone" },
      });
      // only the immutable authored setting is shown to the player: the owner's current remainder is verified, never exported
      expect(finished.data.setting.readback).not.toHaveProperty("recoverable");
      expect(JSON.stringify(finished.data)).not.toMatch(/recoverable/);
      expect(finished.data.readiness).toEqual({
        setting_established: true,
        campaign_ready_for_play: false,
      });
      // One complete native review control carries the full readable setting, with no copied code.
      expect(finished.elicited).toHaveLength(0);
      expect(finished.result.structuredContent.request_readback.setting).not.toMatch(
        /type exactly|"format_version"|"world_id"/,
      );
      expect(finished.result.structuredContent.request_readback.setting).toContain(
        "Twelve loose stones lie on the courtyard floor.",
      );
      for (const t of [proposed.text, finished.text]) {
        expect(t).not.toMatch(/establish-locality [0-9a-f]{12}/);
      }
      // the actual owner publications, read with the ordinary registry after the service is done
      const held = await facts(s);
      expect([...held.keys].sort()).toEqual(
        [
          `world/${WORLD}/profile`,
          `world/${WORLD}/locus/${LOCUS}`,
          `world/${WORLD}/source/${SOURCE}`,
        ].sort(),
      );
      expect(held.source?.recoverable.amount).toBe(STONES);
      expect(held.source?.depth).toBe("EXACT_FINITE");
      // nothing is pending, the pasted file is gone, and status reads the same from canon alone
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect(readdirSync(s.config.setupDir)).toEqual([]);
      const after = await r.chat.call("original_setting_status");
      expect(after.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
      expect(after.data.setting.readback.established).toEqual({ amount: STONES, unit: "stone" });
      expect(JSON.stringify(after.data)).not.toMatch(/recoverable/);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

/** nothing was confirmed, retained, created or recorded for this slot */
const untouched = (sl: Awaited<ReturnType<typeof slot>>) => {
  expect(existsSync(sl.campaignDir)).toBe(false);
  expect(pinFiles(sl)).toEqual([]);
  expect(existsSync(pendingPath(sl.config))).toBe(false);
};

let uninterrupted: Awaited<ReturnType<typeof headOf>> | undefined;
const expectedHead = async () => (uninterrupted ??= await reference());

describe("MECHANISM: the same committed setup is returned, a different one is refused, and nothing is replaced", () => {
  it("the same setup returns the verified existing result without a new question or write; a different setup after the original conflicts and changes nothing", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      await establishViaChat(r.chat);
      const head = await headOf(s.campaignDir);
      const never = () => {
        throw new Error("the human must not be asked again");
      };
      const again = await establishViaChat(r.chat, courtyard(), never as any);
      expect(again.finished.elicited).toEqual([]);
      expect(again.finished.data.result.status).toBe("LOCALITY_READY");
      expect(again.finished.data.setting.state).toBe("ESTABLISHED");
      expect(await headOf(s.campaignDir)).toEqual(head);

      const other = courtyard();
      other.source.quantity.amount = 13;
      other.source.statement = "Thirteen loose stones lie on the courtyard floor.";
      const conflicted = await establishViaChat(r.chat, other, never as any);
      expect(conflicted.finished.elicited).toEqual([]);
      expect(conflicted.finished.data.result.status).toBe("SETUP_CONFLICT");
      expect(conflicted.finished.data.setting).toMatchObject({
        state: "ESTABLISHED",
        barrier: "NONE",
      });
      expect(await headOf(s.campaignDir)).toEqual(head);
      expect((await facts(s)).source?.recoverable.amount).toBe(STONES);
      expect(existsSync(pendingPath(s.config))).toBe(false);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM: refusals leave the slot exactly as it was", () => {
  const invalid: [string, (d: any) => void][] = [
    ["a model-supplied confirmation flag", (d) => (d.confirmed = true)],
    [
      "a model-supplied confirmation phrase",
      (d) => (d.confirmation = "establish-locality 123456789abc"),
    ],
    ["a reply", (d) => (d.reply = "establish-locality 123456789abc")],
    ["a campaign selection", (d) => (d.campaign_id = "another-campaign")],
    ["a path", (d) => (d.path = "/etc/passwd")],
    ["an owner", (d) => (d.world.owner = "world_state")],
    ["a nested extra field in the source", (d) => (d.source.estimate = "about twelve")],
    ["a mismatched world in the locus", (d) => (d.locus.world_id = "world-elsewhere")],
    ["a mismatched world in the source", (d) => (d.source.world_id = "world-elsewhere")],
    ["a mismatched locus in the source", (d) => (d.source.locus_id = "locus-elsewhere")],
    ["a factual reference mode", (d) => (d.world.reference_causal_basis.mode = "FACTUAL")],
    ["a delegated reference mode", (d) => (d.world.reference_causal_basis.mode = "DELEGATED")],
    ["a missing source", (d) => delete d.source],
    ["a zero quantity", (d) => (d.source.quantity.amount = 0)],
    ["a fractional quantity", (d) => (d.source.quantity.amount = 12.5)],
    ["the acoustic profile this command does not admit", (d) => (d.locus.acoustic = { x: 1 })],
  ];
  for (const [name, mutate] of invalid)
    it(`${name} is refused before anything is started`, async () => {
      const s = await slot();
      const r = await run(s);
      try {
        const doc = courtyard();
        mutate(doc);
        const proposed = await r.chat.call("propose_original_setting", doc);
        expect(proposed.isError).toBe(true);
        expect(r.app.server.listening).toBe(true);
        // no run exists to await, and no human was asked
        const waiting = await r.chat.call("await_action", { wait_seconds: 1 });
        expect(waiting.isError).toBe(true);
        untouched(s);
      } finally {
        await r.app.close();
      }
    });

  it("a setting the strict schema admits but the owner path refuses (duplicate access aspects) is reported INVALID_SETUP before any question; nothing is created or left pending", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const doc = courtyard();
      doc.source.access_facts.push({ ...doc.source.access_facts[0] });
      const { finished } = await establishViaChat(r.chat, doc, (() => {
        throw new Error("the human must not be asked about a setting the owners refuse");
      }) as any);
      expect(finished.elicited).toEqual([]);
      expect(finished.data.result.status).toBe("INVALID_SETUP");
      expect(finished.data.result.details?.join(" ")).toMatch(/source/);
      expect(finished.data.setting).toMatchObject({ state: "NOT_STARTED", barrier: "NONE" });
      untouched(s);
    } finally {
      await r.app.close();
    }
  });

  it("a referee-only grant cannot propose, resume or read the setting; the three tools are the player's", async () => {
    const s = await slot();
    const r = await run(s, {}, { scope: "referee", referee: REFEREE });
    try {
      const listed = (await r.chat.rpc("tools/list")).json.result.tools.map((t: any) => t.name);
      for (const name of [
        "propose_original_setting",
        "resume_original_setting",
        "original_setting_status",
      ]) {
        expect(listed).not.toContain(name);
        expect(
          (await r.chat.call(name, name === "propose_original_setting" ? courtyard() : {})).json
            .error.code,
        ).toBe(-32602);
      }
      untouched(s);
    } finally {
      await r.app.close();
    }
  });

  it("a document beyond the setting size, and a setting too long to show whole, are refused before anything starts", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const huge = courtyard();
      huge.world.premise = "p".repeat(70_000);
      const tooBig = await r.chat.call("propose_original_setting", huge);
      expect(tooBig.isError).toBe(true);
      const many = courtyard();
      many.locus.constraints = Array.from({ length: 1960 }, () => ({
        aspect: "a",
        statement: "s",
      }));
      const tooMany = await r.chat.call("propose_original_setting", many);
      expect(tooMany.isError).toBe(true);
      expect(tooMany.text).toMatch(/too many separate entries/);
      untouched(s);
    } finally {
      await r.app.close();
    }
  });
});

/** a setting whose confirmation is far longer than the 6,000 characters an ordinary proposal's confirmation keeps */
const longSetting = (entries: number, width: number) => {
  const doc = courtyard();
  doc.locus.constraints = Array.from({ length: entries }, (_, i) => ({
    aspect: `aspect-${i}`,
    statement: `Constraint ${i}: ${"x".repeat(width)}`,
  }));
  return doc;
};

describe("MECHANISM: the confirmation shows the WHOLE of the authored setting, never the last 6,000 characters of it", () => {
  it("a confirmation of more than 6,000 characters carries its first and its last field", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const doc = longSetting(25, 250);
      const { finished } = await establishViaChat(r.chat, doc);
      expect(finished.data.result.status).toBe("LOCALITY_READY");
      expect(finished.elicited).toHaveLength(0);
      const shown = finished.result.structuredContent.request_readback.setting;
      expect(shown.length).toBeGreaterThan(6_000);
      expect(shown).toContain(doc.world.premise); // the first field
      expect(shown).toContain(doc.world.reference_causal_basis.established_canon);
      expect(shown).toContain("Constraint 0:");
      expect(shown).toContain("Constraint 24:");
      expect(shown).toContain(doc.source.statement); // the last field
      expect(shown).toContain(doc.source.access_facts[0].statement);
      expect((await facts(s)).locus?.constraints).toHaveLength(25);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("a long setting is one complete readable review with a single explicit control and all fields retained", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const doc = longSetting(150, 250);
      const { finished } = await establishViaChat(r.chat, doc);
      expect(finished.data.result.status).toBe("LOCALITY_READY");
      expect(finished.elicited).toHaveLength(0);
      const all = finished.result.structuredContent.request_readback.setting;
      expect(all).not.toMatch(/type exactly|"format_version"|"world_id"/);
      expect(all).toContain(doc.world.premise);
      for (let i = 0; i < 150; i++) expect(all).toContain(`Constraint ${i}: `);
      expect(all).toContain(doc.source.statement);
      expect((await facts(s)).locus?.constraints).toHaveLength(150);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM: recovery of the SAME interrupted setup, by owner evidence about THAT document", () => {
  const cuts: [
    string,
    "establishWorld" | "establishLocus" | "establishSourceCondition",
    string[],
  ][] = [
    ["after the package was created, before the world", "establishWorld", []],
    ["after the world, before the locus", "establishLocus", ["world"]],
    [
      "after the world and the locus, before the source",
      "establishSourceCondition",
      ["world", "locus"],
    ],
  ];
  for (const [name, op, committed] of cuts)
    it(`${name}: UNCERTAIN, everything else blocked, status reads the retained document, and only resume_original_setting (using the exact original accepted receipt) finishes it — equal to an uninterrupted run`, async () => {
      const expected = await expectedHead();
      const s = await slot();
      const r = await run(s);
      try {
        loseReply(op, false);
        const doc = courtyard();
        const { finished } = await establishViaChat(r.chat, doc);
        vi.restoreAllMocks();
        expect(finished.data.state).toBe("FINISHED");
        expect(finished.data.outcome).toBe("UNCERTAIN");
        expect(finished.data.setting).toMatchObject({
          state: "RESUMABLE",
          barrier: "RESUME",
          committed,
        });
        expect(finished.data.readiness.setting_established).toBe(false);
        expect(finished.data.recovery).toMatch(/resume_original_setting/);
        expect(finished.data.recovery).not.toMatch(/call reconcile_last_action/i);
        // never reported ready, and nothing unrelated may start from the page or the chat
        const blocked = await r.chat.call("cease_collection");
        expect(blocked.isError).toBe(true);
        expect(blocked.text).toMatch(/resume_original_setting/);
        const replacement = courtyard();
        replacement.source.quantity.amount = 99;
        for (const d of [doc, replacement]) {
          const refused = await r.chat.call("propose_original_setting", d);
          expect(refused.isError).toBe(true);
          expect(refused.text).toMatch(/UNCERTAIN|not yet resolved/);
        }
        // status reads the retained original proposal exactly, from the owners' records
        const status = await r.chat.call("original_setting_status");
        expect(status.data.setting).toMatchObject({
          state: "RESUMABLE",
          barrier: "RESUME",
          committed,
        });
        expect(status.data.setting.proposal).toEqual(doc);
        expect(status.data.readiness).toEqual({
          setting_established: false,
          campaign_ready_for_play: false,
        });
        // a generic reconcile cannot settle it: it names the resumption
        await r.chat.call("reconcile_last_action");
        const reconciled = await follow(r.chat, null);
        expect(reconciled.data.outcome).toBe("UNCERTAIN");
        expect(reconciled.data.recovery).toMatch(/resume_original_setting/);
        // The retained document and authenticated original acceptance authorize only the unfinished publications.
        const withData = await r.chat.call("resume_original_setting", { setting: replacement });
        expect(withData.isError).toBe(true);
        const resumed = await r.chat.call("resume_original_setting");
        expect(resumed.isError).toBe(false);
        const done = await follow(r.chat);
        expect(done.elicited).toEqual([]);
        expect(done.data.result.status).toBe("LOCALITY_READY");
        expect(done.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
        expect(existsSync(pendingPath(s.config))).toBe(false);
        expect(await headOf(s.campaignDir)).toEqual(expected);
        expect((await facts(s)).keys).toHaveLength(3);
      } finally {
        await r.app.close();
      }
    }, 120_000);

  it("after the retained identity but before the package exists: resumable by the same document", async () => {
    const expected = await expectedHead();
    const s = await slot();
    const state = { broken: true };
    const r = await run(s, { runCli: pinPublishFails(state) });
    try {
      const { finished } = await establishViaChat(r.chat);
      expect(finished.data.outcome).toBe("UNCERTAIN");
      expect(pinFiles(s)).toHaveLength(1);
      expect(existsSync(s.campaignDir)).toBe(false);
      expect(finished.data.setting).toMatchObject({
        state: "RESUMABLE",
        barrier: "RESUME",
        committed: [],
      });
      state.broken = false;
      expect((await r.chat.call("resume_original_setting")).isError).toBe(false);
      const done = await follow(r.chat);
      expect(done.elicited).toEqual([]);
      expect(done.data.result.status).toBe("LOCALITY_READY");
      expect(await headOf(s.campaignDir)).toEqual(expected);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("all three facts committed, the reply lost: settled by the owners' readback with no further write", async () => {
    const expected = await expectedHead();
    const s = await slot();
    const r = await run(s);
    try {
      loseReply("establishSourceCondition", true);
      const { finished } = await establishViaChat(r.chat);
      vi.restoreAllMocks();
      expect(finished.data.exit_code).toBe(4);
      expect(finished.data.result).toBeUndefined();
      expect(finished.data.settled_by).toMatch(/read back/);
      expect(finished.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
      expect(finished.data.outcome).toBeUndefined();
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect(await headOf(s.campaignDir)).toEqual(expected);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("the process step throws after a complete commit: the owners' evidence settles it at once, with nothing written again", async () => {
    const expected = await expectedHead();
    const s = await slot();
    const r = await run(s, {
      runCli: async (argv, env) => {
        const code = await runCli(argv, env);
        throw new Error(`failure after the commit (${code})`);
      },
    });
    try {
      const { finished } = await establishViaChat(r.chat);
      expect(finished.data.outcome).toBeUndefined();
      expect(finished.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect(await headOf(s.campaignDir)).toEqual(expected);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("a complete commit whose evidence could not be read: the block survives a restart and the owners' readback then settles it with no further write", async () => {
    const expected = await expectedHead();
    const s = await slot();
    let r = await run(s, {
      recovery: {
        localityEvidence: async () => ({ kind: "UNAVAILABLE", code: "X", detail: "unreadable" }),
      },
    });
    try {
      const { finished } = await establishViaChat(r.chat);
      expect(finished.data.outcome).toBe("UNCERTAIN");
      expect(existsSync(pendingPath(s.config))).toBe(true);
      await r.app.close();
      r = await run(s);
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "RECONCILE" });
      expect((await r.chat.call("propose_original_setting", courtyard())).isError).toBe(true);
      await r.chat.call("reconcile_last_action");
      const settled = await follow(r.chat, null);
      expect(settled.data.exit_code).toBe(0);
      expect(settled.data.outcome).toBeUndefined();
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect(await headOf(s.campaignDir)).toEqual(expected);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("a pending record that cannot be cleared keeps the uncertainty (structural), and the operator's removal lifts it", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const jam: Human = (e) => {
        if (e.requestedSchema.properties.accept) {
          rmSync(pendingPath(s.config), { force: true });
          mkdirSync(pendingPath(s.config));
          writeFileSync(join(pendingPath(s.config), "x"), "");
          return { action: "accept", content: { accept: true } };
        }
        return { action: "accept", content: {} };
      };
      const { finished } = await establishViaChat(r.chat, courtyard(), jam);
      expect(finished.data.setting.state).toBe("BLOCKED");
      expect(finished.data.outcome).toBe("UNCERTAIN");
      expect(finished.data.recovery).toMatch(/operator must inspect/);
      expect((await r.chat.call("propose_original_setting", courtyard())).isError).toBe(true);
      rmSync(pendingPath(s.config), { recursive: true, force: true });
      await r.chat.call("reconcile_last_action");
      const lifted = await follow(r.chat, null);
      expect(lifted.data.exit_code).toBe(0);
      expect((await r.chat.call("original_setting_status")).data.setting).toMatchObject({
        state: "ESTABLISHED",
        barrier: "NONE",
      });
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

/** a restarted service over a slot whose pending record holds an unconfirmed proposal (the most ordinary record to tamper with) */
async function withPendingProposal(): Promise<{
  s: Awaited<ReturnType<typeof slot>>;
  doc: any;
  file: string;
}> {
  const s = await slot();
  const r = await run(s, { chat: { elicitMs: 300 } });
  const doc = courtyard();
  await r.chat.call("propose_original_setting", doc);
  await r.chat.call("await_action", { wait_seconds: 5 }, () => null);
  await r.app.close();
  return { s, doc, file: pendingPath(s.config) };
}

describe("MECHANISM: a replaced, malformed, foreign or legacy pending record is never trusted, adopted or cleared by the adapter", () => {
  const tampered: [string, (file: string, record: any) => void][] = [
    [
      "a different valid proposal substituted under the old digest",
      (file, record) => {
        const other = courtyard();
        other.source.quantity.amount = 99;
        record.setup.document = JSON.stringify(other);
        writeFileSync(file, JSON.stringify(record));
      },
    ],
    [
      "a document whose bytes were changed but not its hash",
      (file, record) => {
        record.setup.document = `${record.setup.document} `;
        writeFileSync(file, JSON.stringify(record));
      },
    ],
    [
      "missing original bytes",
      (file, record) => {
        record.setup.document = "";
        writeFileSync(file, JSON.stringify(record));
      },
    ],
    ["malformed JSON", (file) => writeFileSync(file, "{ not json")],
    [
      "another campaign's record under this campaign's name",
      (file, record) =>
        writeFileSync(file, JSON.stringify({ ...record, campaign_id: "other-campaign" })),
    ],
    [
      "a record whose setup identity belongs to another campaign",
      (file, record) => {
        record.setup.publication_digest = "0".repeat(32);
        writeFileSync(file, JSON.stringify(record));
      },
    ],
    [
      "a directory in its place",
      (file) => {
        rmSync(file, { force: true });
        mkdirSync(file);
      },
    ],
  ];
  for (const [name, tamper] of tampered)
    it(`${name}: blocked for engineering, nothing removed, nothing started`, async () => {
      const { s, doc, file } = await withPendingProposal();
      tamper(file, JSON.parse(readFileSync(file, "utf8")));
      const before = existsSync(file) && !readdirSyncSafe(file) ? readFileSync(file, "utf8") : null;
      const r = await run(s);
      try {
        const status = await r.chat.call("original_setting_status");
        expect(status.data.setting).toMatchObject({ state: "BLOCKED", barrier: "ENGINEERING" });
        expect(status.data.setting.proposal).toBeUndefined();
        expect((await r.chat.call("propose_original_setting", doc)).isError).toBe(true);
        expect((await r.chat.call("resume_original_setting")).isError).toBe(true);
        await r.chat.call("reconcile_last_action");
        const blocked = await follow(r.chat, null);
        expect(blocked.data.outcome).toBe("UNCERTAIN");
        expect(blocked.data.recovery).toMatch(/operator must inspect/);
        expect(existsSync(file)).toBe(true);
        if (before !== null) expect(readFileSync(file, "utf8")).toBe(before);
        expect(existsSync(s.campaignDir)).toBe(false);
        expect(pinFiles(s)).toEqual([]);
      } finally {
        await r.app.close();
      }
    }, 60_000);

  it("a legacy establish-locality record with no retained document: blocked for engineering, no guess", async () => {
    const { s, doc, file } = await withPendingProposal();
    const record = JSON.parse(readFileSync(file, "utf8"));
    delete record.setup;
    writeFileSync(file, JSON.stringify(record));
    const r = await run(s);
    try {
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "BLOCKED", barrier: "ENGINEERING" });
      expect((await r.chat.call("propose_original_setting", doc)).isError).toBe(true);
      const resume = await r.chat.call("resume_original_setting");
      expect(resume.isError).toBe(true);
      await r.chat.call("reconcile_last_action");
      const blocked = await follow(r.chat, null);
      expect(blocked.data.blocker).toMatch(/identity was not recorded/);
      expect(blocked.data.recovery).toMatch(/operator must inspect/);
      expect(existsSync(file)).toBe(true);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("another class of pending record and the record of another command keep their own protections", async () => {
    const { s, doc, file } = await withPendingProposal();
    const record = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...record, command: "author-character", setup: null }));
    const r = await run(s);
    try {
      // the setting tools do not take over another command's barrier
      expect((await r.chat.call("propose_original_setting", doc)).isError).toBe(true);
      const resume = await r.chat.call("resume_original_setting");
      expect(resume.isError).toBe(true);
      expect(resume.text).toMatch(/no interrupted original setup/);
      await r.chat.call("reconcile_last_action");
      const blocked = await follow(r.chat, null);
      expect(blocked.data.blocker).toBe("no supported owner readback exists for author-character");
    } finally {
      await r.app.close();
    }
  }, 60_000);
});

function readdirSyncSafe(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

describe("MECHANISM: locks, residue and foreign identities stay blocked and are never reclaimed, adopted or deleted", () => {
  it("a live lock and a stale lock leave a resumable setup unavailable; the lock files are untouched; resumption works once the package is free", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      loseReply("establishLocus", false);
      const { finished } = await establishViaChat(r.chat);
      vi.restoreAllMocks();
      expect(finished.data.setting.state).toBe("RESUMABLE");
      const lock = join(s.campaignDir, "LOCK");
      const held = await CanonicalCampaign.open(s.campaignDir, { buildId: "lock-holder" });
      if (!held.ok) throw new Error("did not open");
      const live = readFileSync(lock, "utf8");
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "UNAVAILABLE", barrier: "RECONCILE" });
      expect((await r.chat.call("resume_original_setting")).isError).toBe(true);
      await r.chat.call("reconcile_last_action");
      const blocked = await follow(r.chat, null);
      expect(blocked.data.outcome).toBe("UNCERTAIN");
      expect(readFileSync(lock, "utf8")).toBe(live);
      await held.value.close();
      // a crashed holder's lock is not reclaimed by the adapter either
      writeFileSync(
        lock,
        `${JSON.stringify({ pid: 2 ** 22 + 7, campaign_id: LOCALITY_CAMPAIGN })}\n`,
      );
      const stale = readFileSync(lock, "utf8");
      expect((await r.chat.call("original_setting_status")).data.setting.state).toBe("UNAVAILABLE");
      expect((await r.chat.call("resume_original_setting")).isError).toBe(true);
      expect(readFileSync(lock, "utf8")).toBe(stale);
      rmSync(lock);
      expect((await r.chat.call("resume_original_setting")).isError).toBe(false);
      const done = await follow(r.chat);
      expect(done.data.setting.state).toBe("ESTABLISHED");
    } finally {
      await r.app.close();
    }
  }, 120_000);

  it("a confirmed identity beside a package that is neither empty nor complete (ambiguous creation) is blocked for engineering; the residue is kept", async () => {
    const s = await slot();
    const r = await run(s, { runCli: pinPublishFails({ broken: true }) });
    try {
      const { finished } = await establishViaChat(r.chat);
      expect(finished.data.setting.state).toBe("RESUMABLE");
      mkdirSync(s.campaignDir, { mode: 0o700 });
      writeFileSync(join(s.campaignDir, "half-written.tmp"), "residue");
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "BLOCKED", barrier: "ENGINEERING" });
      expect((await r.chat.call("resume_original_setting")).isError).toBe(true);
      await r.chat.call("reconcile_last_action");
      const blocked = await follow(r.chat, null);
      expect(blocked.data.recovery).toMatch(/operator must inspect/);
      expect(readFileSync(join(s.campaignDir, "half-written.tmp"), "utf8")).toBe("residue");
      expect(existsSync(join(s.campaignDir, "manifest.json"))).toBe(false);
    } finally {
      await r.app.close();
    }
  }, 120_000);

  for (const [name, content] of [
    ["malformed", () => "{ not json"],
    [
      "another campaign's",
      (uid: number) =>
        JSON.stringify({
          format: "immortalis-operator-locality-setup-pin",
          format_version: 1,
          campaign_id: "another-campaign",
          operator_uid: uid,
          setup_id: "0".repeat(32),
        }),
    ],
  ] as const)
    it(`a ${name} retained identity beside a confirmed setup blocks it for engineering; it is neither adopted nor replaced`, async () => {
      const s = await slot();
      const r = await run(s, { runCli: pinPublishFails({ broken: true }) });
      try {
        const { finished } = await establishViaChat(r.chat);
        expect(finished.data.setting.state).toBe("RESUMABLE");
        const [pin] = pinFiles(s);
        const file = join(s.operatorDir, pin!);
        writeFileSync(file, content(process.getuid!()));
        const before = readFileSync(file, "utf8");
        expect((await r.chat.call("original_setting_status")).data.setting).toMatchObject({
          state: "BLOCKED",
          barrier: "ENGINEERING",
        });
        expect((await r.chat.call("resume_original_setting")).isError).toBe(true);
        await r.chat.call("reconcile_last_action");
        expect((await follow(r.chat, null)).data.recovery).toMatch(/operator must inspect/);
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(existsSync(s.campaignDir)).toBe(false);
      } finally {
        await r.app.close();
      }
    }, 60_000);
});

describe("MECHANISM: one setup at a time, and a shutdown leaves a consistent record", () => {
  it("a racing changed proposal is refused while the first is in progress; the retained document stays the first", async () => {
    const s = await slot();
    const r = await run(s, { chat: { elicitMs: 300 } });
    try {
      const first = courtyard();
      const second = courtyard();
      second.source.quantity.amount = 99;
      second.source.statement = "Ninety-nine loose stones lie on the courtyard floor.";
      const [a, b] = await Promise.all([
        r.chat.call("propose_original_setting", first),
        r.chat.call("propose_original_setting", second),
      ]);
      expect([a.isError, b.isError].filter(Boolean)).toHaveLength(1);
      const won = a.isError ? second : first;
      const record = JSON.parse(readFileSync(pendingPath(s.config), "utf8"));
      expect(JSON.parse(record.setup.document)).toEqual(won);
      // a changed proposal later, while the first is still awaiting its confirmation, is refused as well
      expect(
        (await r.chat.call("propose_original_setting", a.isError ? first : second)).isError,
      ).toBe(true);
      expect(JSON.parse(readFileSync(pendingPath(s.config), "utf8")).setup.document).toBe(
        record.setup.document,
      );
      // reach the pending confirmation (nobody answers), then withdraw it
      await r.chat.call("await_action", { wait_seconds: 5 }, () => null);
      expect((await r.chat.call("cancel_action")).isError).toBe(false);
      await follow(r.chat, null);
      untouched(s);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a shutdown that races a proposal leaves either nothing or a record the owners' evidence settles; no package is created", async () => {
    const s = await slot();
    const r = await run(s);
    const racing = r.chat.call("propose_original_setting", courtyard()).catch(() => undefined);
    await r.app.close();
    await racing;
    expect(existsSync(s.campaignDir)).toBe(false);
    expect(pinFiles(s)).toEqual([]);
    const again = await run(s);
    try {
      if (existsSync(pendingPath(s.config))) {
        expect((await again.chat.call("original_setting_status")).data.setting.state).toBe(
          "NOT_CONFIRMED",
        );
        await again.chat.call("reconcile_last_action");
        expect((await follow(again.chat, null)).data.exit_code).toBe(0);
      }
      expect(existsSync(pendingPath(s.config))).toBe(false);
      expect((await again.chat.call("original_setting_status")).data.setting.state).toBe(
        "NOT_STARTED",
      );
    } finally {
      await again.app.close();
    }
  }, 60_000);

  it("a record that cannot be written dispatches nothing", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      mkdirSync(pendingPath(s.config)); // a directory where the record file must go
      const refused = await r.chat.call("propose_original_setting", courtyard());
      expect(refused.isError).toBe(true);
      expect(refused.text).toMatch(
        /recovery record could not be maintained; nothing was dispatched|unreadable/,
      );
      expect(existsSync(s.campaignDir)).toBe(false);
      expect(pinFiles(s)).toEqual([]);
    } finally {
      await r.app.close();
    }
  }, 60_000);
});

describe("MECHANISM: no secret, path, challenge or internal identity crosses the model, in a result, a refusal or a schema", () => {
  it("canaries planted in the lane secrets, the directories and the retained state never appear in any tool result of a full journey", async () => {
    const s = await slot();
    const r = await run(s, {}, { scope: "player referee", player: PLAYER, referee: REFEREE });
    const seen: string[] = [];
    const record = (x: { text?: string | undefined }) => void seen.push(x.text ?? "");
    try {
      seen.push(JSON.stringify((await r.chat.rpc("tools/list")).json.result.tools));
      record(await r.chat.call("original_setting_status"));
      record(
        await r.chat.call("propose_original_setting", { ...courtyard(), path: s.campaignDir }),
      );
      record(await r.chat.call("resume_original_setting"));
      loseReply("establishLocus", false);
      const { proposed, finished } = await establishViaChat(r.chat);
      vi.restoreAllMocks();
      record(proposed);
      record(finished);
      record(await r.chat.call("original_setting_status"));
      record(await r.chat.call("reconcile_last_action"));
      record(await r.chat.call("await_action", { wait_seconds: 2 }));
      record(await r.chat.call("resume_original_setting"));
      record(await follow(r.chat));
      record(await r.chat.call("original_setting_status"));
      const joined = seen.join("\n");
      for (const secret of [
        PLAYER,
        REFEREE,
        s.root,
        s.operatorDir,
        s.campaignDir,
        s.config.setupDir,
      ])
        expect(joined).not.toContain(secret);
      expect(joined).not.toMatch(/chat-pending-operation|locality-setup-|manifest\.json|LOCK\b/);
      expect(joined).not.toMatch(/establish-locality [0-9a-f]{12}/);
      expect(joined).not.toMatch(/To confirm, type exactly "/);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

/** follows the page's lane to the end of its run (the cursor advances; a poll holds until something new happens) */
async function finishRun(page: Browser) {
  let after = 0;
  let last: any;
  for (let i = 0; i < 400; i++) {
    last = (await page.req("GET", `/api/play/poll?after=${after}`)).json;
    after = last.seq ?? after;
    if (last.running === false) break;
  }
  const all = (await page.req("GET", "/api/play/poll?after=0")).json;
  return { ...all, running: last.running };
}

describe("MECHANISM: the phone page keeps its setup behaviour, now with the retained document and owner evidence", () => {
  it("an invalid pasted setting is refused before dispatch with the shipped schema's bounded reasons; nothing is recorded", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const page = new Browser(s.base);
      await page.login("player", PLAYER);
      const bad = courtyard();
      bad.world.reference_causal_basis.mode = "FACTUAL";
      const refused = await page.req("POST", "/api/play/command", {
        command: "establish-locality",
        setup: JSON.stringify(bad),
      });
      expect(refused.status).toBe(400);
      expect(refused.json.error).toMatch(/not a complete, valid ORIGINAL locality setup/);
      expect(refused.json.error).toMatch(/nothing was dispatched/);
      expect(readdirSync(s.config.setupDir)).toEqual([]);
      untouched(s);
    } finally {
      await r.app.close();
    }
  });

  it("a page-launched setup interrupted part-way is settled by evidence: reconcile names the resumption, and the page lane's gate refuses a second setup", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      const page = new Browser(s.base);
      await page.login("player", PLAYER);
      loseReply("establishLocus", false);
      const doc = JSON.stringify(courtyard());
      expect(
        (await page.req("POST", "/api/play/command", { command: "establish-locality", setup: doc }))
          .status,
      ).toBe(200);
      const step = await page.untilPrompt("play");
      const phrase = /type exactly "([^"]+)"/.exec(
        step.seen.map((l: any) => l.text).join("\n"),
      )![1]!;
      await page.req("POST", "/api/play/reply", { prompt_id: step.snap.pending.id, text: phrase });
      await finishRun(page);
      vi.restoreAllMocks();
      const record = JSON.parse(readFileSync(pendingPath(s.config), "utf8"));
      expect(record).toMatchObject({ command: "establish-locality", state: "UNCERTAIN" });
      expect(JSON.parse(record.setup.document)).toEqual(courtyard());
      const gated = await page.req("POST", "/api/play/command", {
        command: "establish-locality",
        setup: doc,
      });
      expect(gated.status).toBe(409);
      expect(gated.json.error).toMatch(/Only the same retained setup/);
      await page.req("POST", "/api/play/command", { command: "reconcile" });
      const ended = await finishRun(page);
      expect(ended.lines.map((l: any) => l.text).join("\n")).toMatch(
        /owner readback: the original setup is confirmed; 1 of 3 publications are committed[\s\S]*RECOVERY BLOCKED/,
      );
      expect(existsSync(pendingPath(s.config))).toBe(true);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

describe("static: the evidence module only reads, and the three tools carry no confirmation channel", () => {
  const code = (f: string) =>
    readFileSync(join("apps/phone/src", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  it("locality-evidence.ts writes, removes, creates and reclaims nothing", () => {
    expect(code("locality-evidence.ts")).not.toMatch(
      /writeFile|appendFile|rmSync|unlink|mkdir|\.remove\(|createExclusive|truncate|rename|reclaimStaleLock|\.establish(World|Locus|SourceCondition)|writePin|\.close\(\)(?!\.catch)/,
    );
  });
  it("the proposal's schema and the three tools name no reply, answer, challenge, campaign, path, role or permission field", () => {
    const tools = code("chat-tools.ts");
    for (const name of [
      "propose_original_setting",
      "original_setting_status",
      "resume_original_setting",
    ])
      expect(tools).toContain(`name: "${name}"`);
    const schema = tools.slice(
      tools.indexOf("const SETTING_SCHEMA"),
      tools.indexOf("export function fitsConfirmation"),
    );
    expect(schema).not.toMatch(
      /reply|answer|challenge|phrase|campaign|path|role|permission|secret|token|confirm/i,
    );
  });
});

describe("MECHANISM (BLUE H1): the status without a pending operation requires the trusted original confirmation identity", () => {
  it("after the ordinary pending record cleared, a missing, mismatched, malformed or other-campaign retained identity is never ESTABLISHED; canon and consent are untouched; the original positive stays", async () => {
    const s = await slot();
    const r = await run(s);
    try {
      await establishViaChat(r.chat);
      expect(existsSync(pendingPath(s.config))).toBe(false);
      const head = await headOf(s.campaignDir);
      const file = join(s.operatorDir, pinFiles(s)[0]!);
      const original = readFileSync(file, "utf8");
      const positive = await r.chat.call("original_setting_status");
      expect(positive.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });

      const wrong = (over: Record<string, unknown>) =>
        JSON.stringify({ ...JSON.parse(original), ...over });
      const cases: [string, string | null][] = [
        ["missing", null],
        ["a well-formed but different setup identity", wrong({ setup_id: "0".repeat(32) })],
        ["another campaign's", wrong({ campaign_id: "another-campaign" })],
        ["another operator's", wrong({ operator_uid: process.getuid!() + 1 })],
        ["malformed", "{ not json"],
        ["empty", ""],
      ];
      for (const [name, content] of cases) {
        if (content === null) rmSync(file);
        else writeFileSync(file, content);
        const status = await r.chat.call("original_setting_status");
        expect(status.data.setting.state, name).toBe("BLOCKED");
        expect(status.data.setting.barrier, name).toBe("ENGINEERING");
        expect(status.data.setting.readback, name).toBeUndefined();
        expect(status.data.readiness.setting_established, name).toBe(false);
        // no mutation, no inferred consent: the canon is as it was, and no identity was recreated or adopted
        expect(await headOf(s.campaignDir)).toEqual(head);
        expect(existsSync(file)).toBe(content !== null);
        if (content !== null) expect(readFileSync(file, "utf8")).toBe(content);
      }
      // restoring the original identity restores the original positive
      writeFileSync(file, original);
      const restored = await r.chat.call("original_setting_status");
      expect(restored.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
      expect(await headOf(s.campaignDir)).toEqual(head);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});

describe("MECHANISM (BLUE H2): the player's setup output never carries a later current source remainder", () => {
  it("120 authored sacks, 117 after a real collection with no access fact: the status still shows the authored 120 and exports no remainder; owner quantity is asserted separately", async () => {
    const { dirs } = await originalCollectionCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    try {
      await collectAndComplete(c, "blue-current-stock", 3, "blue-current-stock-tx", {
        unit: BASIS.unit,
        value: BASIS.value + 21,
      });
      // the owner's truth is 117 and nothing has made it knowable: no access fact exists
      expect(c.sourceCondition(WORLD_ID, SOURCE_KEY)!.value.recoverable.amount).toBe(117);
      expect(c.store.listFacts().filter((f) => f.key.startsWith("access/"))).toEqual([]);
    } finally {
      await c.close();
    }
    const sl = await slot({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
    });
    const r = await run(sl);
    try {
      const status = await r.chat.call("original_setting_status");
      expect(status.data.setting).toMatchObject({ state: "ESTABLISHED", barrier: "NONE" });
      expect(status.data.setting.readback.established).toEqual({ amount: 120, unit: "sack" });
      expect(status.data.setting.readback).not.toHaveProperty("recoverable");
      // neither 117 nor any remainder, anywhere in the payload
      expect(status.text).not.toMatch(/117|recoverable|remainder|delivered/);
      // the same allowlist on the completion / recovery returns of the same campaign
      await r.chat.call("reconcile_last_action");
      const reconciled = await follow(r.chat, null);
      expect(JSON.stringify(reconciled.data)).not.toMatch(/117|recoverable/);
    } finally {
      await r.app.close();
    }
  }, 180_000);
});
