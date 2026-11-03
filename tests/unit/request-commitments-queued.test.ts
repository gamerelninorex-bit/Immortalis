/* eslint-disable @typescript-eslint/no-explicit-any -- tests build review requests and a scripted terminal */
// Initial Locality Bootstrap v0.9: the trusted RequestCommitments terminal has an EXPLICIT queue-source/target path for a queued setup edit
// applied by a NEW continue_queued_setup_edit request. Adding the tool to the generic allowlist would be insufficient (and is not done): the
// ordinary capture finds no ordinary tool and issues nothing. MECHANISM ONLY.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { QueuedSetupEditStore, type QueuedSetupEditRecord } from "@immortalis/operator";
import { consumeRequestEvidence } from "../../packages/operator/src/request-evidence.ts";
import { mintQueuedSetupEditCapability } from "../../packages/operator/src/queued-setup.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import { RequestCommitments } from "../../apps/phone/src/request-commitments.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-queued-terminal";
const LIVE = { session: "session-1", id: "11" };
const config = () => ({ operatorDir: tempDir("rc-queued-"), campaignId: CAMPAIGN }) as PhoneConfig;
const authority = (over: Record<string, unknown> = {}) =>
  ({
    client: "client-1",
    grant: "grant-1",
    scopes: ["player"],
    canReview: false,
    supportsElicitation: false,
    request: {
      session: LIVE.session,
      id: LIVE.id,
      tool: "continue_queued_setup_edit",
      input: "{}",
    },
    ...over,
  }) as any;

async function entry(command: "REVISE_PC" | "REVISE_SETUP" = "REVISE_PC") {
  const store = new QueuedSetupEditStore({
    campaignId: CAMPAIGN,
    dir: tempDir("rc-queue-store-"),
    macKey: randomBytes(32),
    now: () => 1_000,
    validPayload: { REVISE_PC: () => true, REVISE_SETUP: () => true },
  });
  const r = await store.enqueue({
    client: "client-1",
    oauth_grant: "grant-1",
    original_request_ref: "request-9",
    command,
    payload: { edits: [] },
    retained_workflow_ref: "pc-1",
    retained_revision: 3,
    access_expires_at_ms: 5_000,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
const cap = (r: QueuedSetupEditRecord) =>
  mintQueuedSetupEditCapability({
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
    live: LIVE,
  });
const keepSubject = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ campaign_id: CAMPAIGN, pc_id: "pc-1", contract: { identity: "Bob" }, ...over });
const asked = (subject = keepSubject(), verb = "keep-character") =>
  ({ verb, subject, shown: [] }) as any;

function terminalFor(
  rc: RequestCommitments,
  r: QueuedSetupEditRecord,
  over: {
    active?: boolean;
    authority?: any;
    capability?: ReturnType<typeof cap>;
    now?: number;
  } = {},
) {
  const base = scriptedTerminal();
  const capability = over.capability ?? cap(r);
  const t = rc.terminal(base, {
    authority: over.authority ?? authority(),
    runId: "run-queued",
    actor: "pc-1",
    active: () => over.active ?? true,
    queued: { capability, record: r, live: LIVE, now: () => over.now ?? 1_000 },
  });
  return { t, base };
}

describe("RequestCommitments: the queue-source terminal", () => {
  it("issues exact one-use request evidence for the retained target's keep subject - once - with no challenge and no human-review claim", async () => {
    const rc = new RequestCommitments(config());
    const r = await entry();
    const { t, base } = terminalFor(rc, r);
    const evidence = await t.authorize!(asked());
    expect(evidence).toMatchObject({ origin: "AUTHENTICATED_REQUEST", verb: "keep-character" });
    expect(consumeRequestEvidence(evidence!, "keep-character", keepSubject())).toBe(true);
    // the capability is spent: the same terminal issues nothing again
    expect(await t.authorize!(asked())).toBeNull();
    expect(base.said.join("\n")).toContain("REQUEST_BLOCKED");
    expect(await t.ask("any")).toBeNull();
  });

  it("refuses another PC, another campaign, an unparsable subject, the wrong confirmation class and a run that is no longer active - and burns the capability", async () => {
    const rc = new RequestCommitments(config());
    const cases: Record<
      string,
      (r: QueuedSetupEditRecord) => { subject?: string; verb?: string; active?: boolean }
    > = {
      "another PC": () => ({ subject: keepSubject({ pc_id: "pc-2" }) }),
      "another campaign": () => ({ subject: keepSubject({ campaign_id: "elsewhere" }) }),
      "not JSON": () => ({ subject: "{" }),
      "wrong verb for REVISE_PC": () => ({ verb: "establish-locality" }),
      "inactive run": () => ({ active: false }),
    };
    for (const [name, make] of Object.entries(cases)) {
      const r = await entry();
      const o = make(r);
      const capability = cap(r);
      const { t } = terminalFor(rc, r, {
        capability,
        ...(o.active === undefined ? {} : { active: o.active }),
      });
      expect([name, await t.authorize!(asked(o.subject, o.verb))]).toEqual([name, null]);
      // burned: even the EXACT lawful ask now fails with the same capability
      const second = terminalFor(rc, r, { capability });
      expect([name, await second.t.authorize!(asked())]).toEqual([name, null]);
    }
  });

  it("refuses another client or grant, a non-player scope, a past deadline and a capability minted for another live request", async () => {
    const rc = new RequestCommitments(config());
    const mismatches: Record<string, (r: QueuedSetupEditRecord) => any> = {
      "another client": () => ({ authority: authority({ client: "client-2" }) }),
      "another grant": () => ({ authority: authority({ grant: "grant-2" }) }),
      "no player scope": () => ({ authority: authority({ scopes: ["referee"] }) }),
      "past the original deadline": () => ({ now: 5_000 }),
      "another live request": (r: QueuedSetupEditRecord) => ({
        capability: mintQueuedSetupEditCapability({
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
          live: { session: "session-1", id: "12" },
        }),
      }),
    };
    for (const [name, make] of Object.entries(mismatches)) {
      const r = await entry();
      const { t } = terminalFor(rc, r, make(r));
      expect([name, await t.authorize!(asked())]).toEqual([name, null]);
    }
  });

  it("without the queue-source binding the same tool call is NOT an ordinary request: capture finds no ordinary tool and nothing is issued", async () => {
    const rc = new RequestCommitments(config());
    const base = scriptedTerminal();
    const t = rc.terminal(base, {
      authority: authority(),
      runId: "run-plain",
      actor: "pc-1",
      active: () => true,
    });
    expect(await t.authorize!(asked())).toBeNull();
  });
});
