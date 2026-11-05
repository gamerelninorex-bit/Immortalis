/* eslint-disable @typescript-eslint/no-explicit-any -- tests corrupt raw protected records */
// Initial Locality Bootstrap v0.9 ("Queue command surface" / "Capability class and confirmation mapping"): the QueuedSetupEditStore, the
// distinct module-private QueuedSetupEditCapability and requestQueuedSetupAuthorization. MECHANISM ONLY.
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUEUED_COMMANDS,
  QUEUED_COMMAND_VERB,
  QueuedSetupEditStore,
  mintQueuedSetupEditCapability,
  queuedPayloadHash,
  requestQueuedSetupAuthorization,
  type QueuedCapabilityBinding,
  type QueuedEditIntake,
  type QueuedSetupCommand,
  type QueuedSetupEditRecord,
} from "../../apps/phone/src/queued-setup.ts";
// trusted-adapter functions are imported by path, exactly as the phone adapter does; they are not on the package surface
import {
  bindOrdinaryAction,
  consumeOrdinaryAction,
} from "../../packages/operator/src/ordinary-action.ts";
import { consumeRequestEvidence } from "../../packages/operator/src/request-evidence.ts";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-queue";
const live = { session: "session-1", id: "7" };

function rig(over: { t?: { now: number }; dir?: string; key?: Buffer } = {}) {
  const t = over.t ?? { now: 1_000 };
  const dir = over.dir ?? tempDir("queued-edit-");
  const macKey = over.key ?? randomBytes(32);
  const store = new QueuedSetupEditStore({
    campaignId: CAMPAIGN,
    dir,
    macKey,
    now: () => t.now,
    validPayload: {
      REVISE_PC: (p) => Array.isArray(p["edits"]),
      REVISE_SETUP: (p) => typeof p["setup"] === "object" && p["setup"] !== null,
    },
  });
  return { store, t, dir, macKey };
}
const pcEdit = (over: Partial<QueuedEditIntake> = {}): QueuedEditIntake => ({
  client: "client-1",
  oauth_grant: "grant-1",
  original_request_ref: "request-9",
  command: "REVISE_PC",
  payload: { edits: [{ op: "ADD", list: "possession", value: "a satchel" }] },
  retained_workflow_ref: "draft-pc-1",
  retained_revision: 4,
  access_expires_at_ms: 5_000,
  ...over,
});
const setupEdit = (over: Partial<QueuedEditIntake> = {}): QueuedEditIntake =>
  pcEdit({
    command: "REVISE_SETUP",
    payload: { setup: { name: "the pans" } },
    retained_workflow_ref: "draft-setup-1",
    retained_revision: 2,
    ...over,
  });
const must = async <T>(
  r: Promise<{ ok: boolean; value?: T | readonly string[] | null; error?: unknown }>,
): Promise<T> => {
  const v = await r;
  if (!v.ok) throw new Error(JSON.stringify(v.error));
  return v.value as T;
};
const code = async (r: Promise<{ ok: boolean; error?: any }>) => {
  const v = await r;
  return v.ok ? "OK" : v.error.code;
};
const bindingOf = (
  r: QueuedSetupEditRecord,
  over: Partial<QueuedCapabilityBinding> = {},
): QueuedCapabilityBinding => ({
  campaignId: r.campaign_id,
  client: r.client,
  grant: r.oauth_grant,
  queueId: r.queue_id,
  command: r.command,
  payloadHash: r.payload_hash,
  retainedWorkflowRef: r.retained_workflow_ref,
  retainedRevision: r.retained_revision,
  originalRequestRef: r.original_request_ref,
  expiresAtMs: r.expires_at_ms,
  live,
  ...over,
});

describe("QueuedSetupEditStore: a legitimate edit made during the freeze is retained exactly as authored", () => {
  it("retains the whole command, payload and target binding with a derived identity and the ORIGINAL access expiry", async () => {
    const { store, dir } = rig();
    const rec = await must<QueuedSetupEditRecord>(store.enqueue(pcEdit()));
    expect(rec).toMatchObject({
      format: "immortalis-queued-setup-edit",
      command: "REVISE_PC",
      phase: "QUEUED",
      reason: null,
      expires_at_ms: 5_000,
      retained_workflow_ref: "draft-pc-1",
      retained_revision: 4,
      revision: 0,
    });
    expect(rec.queue_id).toMatch(/^queue-[0-9a-f]{32}$/);
    expect(rec.payload_hash).toBe(
      queuedPayloadHash("REVISE_PC", pcEdit().payload, "draft-pc-1", 4),
    );
    expect(readFileSync(join(dir, readdirSync(dir)[0]!), "utf8")).not.toMatch(
      /bearer|token|secret/i,
    );
  });

  it("an identical repeat is recognised and its deadline is NOT moved; a changed payload, target or revision is another entry", async () => {
    const { store } = rig();
    const first = await must<QueuedSetupEditRecord>(store.enqueue(pcEdit()));
    const again = await must<QueuedSetupEditRecord>(
      store.enqueue(pcEdit({ access_expires_at_ms: 99_999 })),
    );
    expect(again.queue_id).toBe(first.queue_id);
    expect(again.expires_at_ms).toBe(5_000);
    const other = [
      pcEdit({ payload: { edits: [{ op: "ADD", list: "possession", value: "a lantern" }] } }),
      pcEdit({ retained_workflow_ref: "draft-pc-2" }),
      pcEdit({ retained_revision: 5 }),
      pcEdit({ original_request_ref: "request-10" }),
    ];
    const ids = new Set([first.queue_id]);
    for (const o of other) ids.add((await must<QueuedSetupEditRecord>(store.enqueue(o))).queue_id);
    expect(ids.size).toBe(5);
  });

  it("refuses a payload that is not the command's exact argument branch, and an expired authority", async () => {
    const { store, t } = rig();
    expect(await code(store.enqueue(pcEdit({ payload: { edits: "no" } })))).toBe("QUEUE_INVALID");
    expect(await code(store.enqueue(setupEdit({ payload: { edits: [] } })))).toBe("QUEUE_INVALID");
    expect(await code(store.enqueue(pcEdit({ command: "NOT_A_COMMAND" as any })))).toBe(
      "QUEUE_INVALID",
    );
    t.now = 5_000;
    expect(await code(store.enqueue(pcEdit()))).toBe("QUEUE_EXPIRED");
  });

  it("the queued commands are internal tags mapped to the EXISTING confirmation boundary, never added to OrdinaryVerb or ConfirmationVerb", () => {
    expect([...QUEUED_COMMANDS]).toEqual(["REVISE_PC", "REVISE_SETUP"]);
    expect(QUEUED_COMMAND_VERB).toEqual({
      REVISE_PC: "keep-character",
      REVISE_SETUP: "establish-locality",
    });
    for (const file of ["confirmation.ts", "ordinary-action.ts", "request-evidence.ts"])
      expect(readFileSync(join("packages/operator/src", file), "utf8")).not.toMatch(
        /REVISE_(PC|SETUP)/,
      );
  });
});

describe("QueuedSetupEditStore: tombstones, expiry and corruption", () => {
  it("a long freeze can exhaust the ORIGINAL deadline: the edit becomes a REJECTED EXPIRED tombstone and nothing is refreshed", async () => {
    const { store, t } = rig();
    const live1 = await must<QueuedSetupEditRecord>(store.enqueue(pcEdit()));
    const keep = await must<QueuedSetupEditRecord>(
      store.enqueue(setupEdit({ access_expires_at_ms: 50_000 })),
    );
    t.now = 5_000;
    expect(await must<string[]>(store.sweepExpired())).toEqual([live1.queue_id]);
    expect(await must<QueuedSetupEditRecord>(store.get(live1.queue_id))).toMatchObject({
      phase: "REJECTED",
      reason: "EXPIRED",
    });
    expect((await must<QueuedSetupEditRecord>(store.get(keep.queue_id))).phase).toBe("QUEUED");
    expect(await must<string[]>(store.sweepExpired())).toEqual([]);
    // a tombstone is final: it cannot be applied, re-queued with a longer life, or cancelled
    expect(await code(store.markApplied(live1.queue_id))).toBe("QUEUE_STATE");
    expect(await code(store.cancel(live1.queue_id))).toBe("QUEUE_STATE");
    t.now = 6_000;
    expect(
      (await must<QueuedSetupEditRecord>(store.enqueue(pcEdit({ access_expires_at_ms: 99_999 }))))
        .phase,
    ).toBe("REJECTED");
  });

  it("applied, rejected (with the owner's reason) and cancelled are terminal and idempotent; an unknown entry is not found", async () => {
    const { store } = rig();
    const a = await must<QueuedSetupEditRecord>(store.enqueue(pcEdit()));
    const b = await must<QueuedSetupEditRecord>(store.enqueue(setupEdit()));
    const c = await must<QueuedSetupEditRecord>(
      store.enqueue(setupEdit({ original_request_ref: "request-77" })),
    );
    expect((await must<QueuedSetupEditRecord>(store.markApplied(a.queue_id))).phase).toBe(
      "APPLIED",
    );
    expect((await must<QueuedSetupEditRecord>(store.markApplied(a.queue_id))).phase).toBe(
      "APPLIED",
    );
    expect(await code(store.markRejected(a.queue_id, "late"))).toBe("QUEUE_STATE");
    const rej = await must<QueuedSetupEditRecord>(
      store.markRejected(b.queue_id, "the setup is sealed"),
    );
    expect(rej).toMatchObject({ phase: "REJECTED", reason: "the setup is sealed" });
    expect((await must<QueuedSetupEditRecord>(store.cancel(c.queue_id))).phase).toBe("CANCELLED");
    expect(await code(store.markApplied("queue-nope"))).toBe("QUEUE_NOT_FOUND");
  });

  it("a tampered, truncated or foreign entry cannot be read, listed or used (fail closed, never repaired)", async () => {
    const { store, dir, macKey } = rig();
    const a = await must<QueuedSetupEditRecord>(store.enqueue(pcEdit()));
    const file = join(dir, readdirSync(dir)[0]!);
    const original = readFileSync(file, "utf8");
    const env = JSON.parse(original);
    env.record.payload = { edits: [{ op: "ADD", list: "possession", value: "a sword" }] };
    writeFileSync(file, JSON.stringify(env));
    expect(await code(store.get(a.queue_id))).toBe("QUEUE_STORE");
    expect(await code(store.list())).toBe("QUEUE_STORE");
    expect(await code(store.markApplied(a.queue_id))).toBe("QUEUE_STORE");
    writeFileSync(file, original.slice(0, 30));
    expect(await code(store.get(a.queue_id))).toBe("QUEUE_STORE");
    writeFileSync(file, original);
    expect(await code(store.get(a.queue_id))).toBe("OK");
    const foreign = new QueuedSetupEditStore({
      campaignId: "another-campaign",
      dir,
      macKey,
      now: () => 1_000,
      validPayload: { REVISE_PC: () => true, REVISE_SETUP: () => true },
    });
    expect(await code(foreign.get(a.queue_id))).toBe("QUEUE_STORE");
  });
});

describe("QueuedSetupEditCapability and requestQueuedSetupAuthorization", () => {
  const ask = (verb: any = "keep-character", subject = "SUBJECT-1") => ({ verb, subject });
  async function minted(command: QueuedSetupCommand = "REVISE_PC") {
    const r = rig();
    const rec = await must<QueuedSetupEditRecord>(
      r.store.enqueue(command === "REVISE_PC" ? pcEdit() : setupEdit()),
    );
    const cap = mintQueuedSetupEditCapability(bindingOf(rec));
    return { ...r, rec, cap };
  }

  it("issues exact ONE-USE request evidence for the existing subject, with no chat challenge, and only once", async () => {
    const { rec, cap } = await minted();
    const evidence = requestQueuedSetupAuthorization({
      capability: cap,
      record: rec,
      live,
      now: 1_000,
      asked: ask(),
    });
    expect(evidence).not.toBeNull();
    expect(evidence).toMatchObject({
      origin: "AUTHENTICATED_REQUEST",
      verb: "keep-character",
      subject: "SUBJECT-1",
    });
    // the evidence is a request-origin receipt consumed exactly once for exactly that subject
    expect(consumeRequestEvidence(evidence!, "keep-character", "OTHER")).toBe(false);
    expect(consumeRequestEvidence(evidence!, "keep-character", "SUBJECT-1")).toBe(true);
    expect(consumeRequestEvidence(evidence!, "keep-character", "SUBJECT-1")).toBe(false);
    // the capability is spent: a second request finds nothing
    expect(
      requestQueuedSetupAuthorization({
        capability: cap,
        record: rec,
        live,
        now: 1_000,
        asked: ask(),
      }),
    ).toBeNull();
  });

  it("REVISE_SETUP authorizes only establish-locality, REVISE_PC only keep-character - a wrong confirmation subject class refuses (and burns)", async () => {
    const pc = await minted("REVISE_PC");
    expect(
      requestQueuedSetupAuthorization({
        capability: pc.cap,
        record: pc.rec,
        live,
        now: 1_000,
        asked: ask("establish-locality"),
      }),
    ).toBeNull();
    expect(
      requestQueuedSetupAuthorization({
        capability: pc.cap,
        record: pc.rec,
        live,
        now: 1_000,
        asked: ask("keep-character"),
      }),
    ).toBeNull(); // burned by the failed use
    const setup = await minted("REVISE_SETUP");
    expect(
      requestQueuedSetupAuthorization({
        capability: setup.cap,
        record: setup.rec,
        live,
        now: 1_000,
        asked: ask("establish-locality"),
      }),
    ).not.toBeNull();
    for (const verb of [
      "collect",
      "cease",
      "observe-surroundings",
      "place-character",
      "initialize-time",
    ]) {
      const m = await minted("REVISE_SETUP");
      expect(
        requestQueuedSetupAuthorization({
          capability: m.cap,
          record: m.rec,
          live,
          now: 1_000,
          asked: ask(verb),
        }),
      ).toBeNull();
    }
  });

  it("refuses every mismatch of the binding: altered payload/target/revision, another client or grant, another live request, expiry", async () => {
    const attempts: Record<
      string,
      (r: QueuedSetupEditRecord) => {
        record?: QueuedSetupEditRecord;
        live?: typeof live;
        now?: number;
      }
    > = {
      "altered payload": (r) => ({
        record: { ...r, payload: { edits: [{ op: "ADD", list: "possession", value: "x" }] } },
      }),
      "altered target": (r) => ({ record: { ...r, retained_workflow_ref: "draft-other" } }),
      "altered revision": (r) => ({ record: { ...r, retained_revision: r.retained_revision + 1 } }),
      "another client": (r) => ({ record: { ...r, client: "client-2" } }),
      "another oauth grant": (r) => ({ record: { ...r, oauth_grant: "grant-2" } }),
      "another original request": (r) => ({ record: { ...r, original_request_ref: "request-0" } }),
      "another live request": () => ({ live: { session: "session-1", id: "8" } }),
      "another live session": () => ({ live: { session: "session-2", id: "7" } }),
      "a moved deadline": (r) => ({ record: { ...r, expires_at_ms: r.expires_at_ms + 1_000 } }),
      "past the original deadline": () => ({ now: 5_000 }),
      "an applied entry": (r) => ({ record: { ...r, phase: "APPLIED" } }),
      "a rejected entry": (r) => ({ record: { ...r, phase: "REJECTED", reason: "x" } }),
    };
    for (const [name, make] of Object.entries(attempts)) {
      const m = await minted();
      const o = make(m.rec);
      const got = requestQueuedSetupAuthorization({
        capability: m.cap,
        record: o.record ?? m.rec,
        live: o.live ?? live,
        now: o.now ?? 1_000,
        asked: ask(),
      });
      expect([name, got]).toEqual([name, null]);
    }
  });

  it("a forged or copied capability, another capability class and a capability for another queue entry cannot be used", async () => {
    const m = await minted();
    const copy = { queueId: m.rec.queue_id } as any;
    expect(
      requestQueuedSetupAuthorization({
        capability: copy,
        record: m.rec,
        live,
        now: 1_000,
        asked: ask(),
      }),
    ).toBeNull();
    // an OrdinaryAction capability is a different class and is not accepted here (and the reverse)
    const ordinary = bindOrdinaryAction({
      campaignId: CAMPAIGN,
      pcId: "pc",
      operationId: "op",
      client: "client-1",
      grant: "grant-1",
      verb: "collect",
      action: {},
    });
    expect(
      requestQueuedSetupAuthorization({
        capability: ordinary as any,
        record: m.rec,
        live,
        now: 1_000,
        asked: ask(),
      }),
    ).toBeNull();
    expect(consumeOrdinaryAction(m.cap as any, {} as any, "collect", {})).toBe(false);
    // a capability minted for ANOTHER entry fails against this one
    const other = await must<QueuedSetupEditRecord>(
      m.store.enqueue(setupEdit({ original_request_ref: "request-55" })),
    );
    const foreign = mintQueuedSetupEditCapability(bindingOf(other));
    expect(
      requestQueuedSetupAuthorization({
        capability: foreign,
        record: m.rec,
        live,
        now: 1_000,
        asked: ask(),
      }),
    ).toBeNull();
  });
});
