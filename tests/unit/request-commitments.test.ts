/* eslint-disable @typescript-eslint/no-explicit-any -- trust-boundary malformed fixtures */
import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RequestCommitments } from "../../apps/phone/src/request-commitments.ts";
import { consumeRequestEvidence } from "../../packages/operator/src/request-evidence.ts";
import { consumeReviewEvidence } from "../../packages/operator/src/review-evidence.ts";
import { courtyard } from "../support/chat-setting.ts";
import { tempDir } from "../support/tmp.ts";
const authority = {
  scopes: ["player"],
  client: "client",
  grant: "grant",
  canReview: false,
  supportsElicitation: false,
  request: {
    session: "session",
    id: '"request"',
    tool: "propose_original_setting",
    input: JSON.stringify(["propose_original_setting", courtyard()]),
  },
} as const;
const context = { authority, actor: null, runId: "original-run", active: () => true };
const request = {
  verb: "establish-locality",
  subject: JSON.stringify({
    verb: "establish-locality",
    campaign_id: "request-fixture",
    setup_id: "owner-hash",
  }),
  shown: [],
  proposal: courtyard(),
} as const;
function fixture() {
  const operatorDir = tempDir("request-origin-");
  const config = { operatorDir, campaignId: "request-fixture" } as any;
  const adapter = new RequestCommitments(config);
  const lines: string[] = [];
  const base = {
    say: (s: string) => lines.push(s),
    ask: async () => {
      throw new Error("no synthetic reply");
    },
    close: () => undefined,
  };
  return {
    config,
    adapter,
    lines,
    base,
    file: join(operatorDir, "chat-requests.request-fixture.json"),
  };
}
it("captures the original exact input before owner work and issues request evidence, never human-review evidence", async () => {
  const f = fixture();
  const terminal = f.adapter.terminal(f.base, context);
  expect(JSON.parse(readFileSync(f.file, "utf8")).receipts[0]).toMatchObject({
    run: "original-run",
    origin: "AUTHENTICATED_REQUEST",
    request: authority.request,
    meaning: "",
  });
  const evidence = await terminal.authorize!(request);
  expect(evidence).not.toBeNull();
  expect(consumeReviewEvidence(evidence as any, request.verb, request.subject)).toBe(false);
  expect(consumeRequestEvidence({ ...evidence! }, request.verb, request.subject)).toBe(false);
  expect(consumeRequestEvidence(evidence!, request.verb, request.subject)).toBe(true);
  expect(consumeRequestEvidence(evidence!, request.verb, request.subject)).toBe(false);
  expect(f.lines.join("\n")).toContain(courtyard().source.statement);
  expect(f.lines.join("\n")).not.toMatch(/type exactly|accept to read|confirm it/);
});
it.each(["client", "grant", "scopes", "actor", "campaign", "input", "run", "basis"])(
  "refuses changed %s without widening the captured authorization",
  async (change) => {
    const f = fixture();
    await f.adapter.terminal(f.base, context).authorize!(request);
    const ctx: any = {
      ...context,
      recover: true,
      originalRun: context.runId,
      authority: { ...authority },
    };
    let req: any = request;
    if (change === "client" || change === "grant") ctx.authority[change] = "other";
    if (change === "scopes") ctx.authority.scopes = ["referee"];
    if (change === "actor") ctx.actor = "another-actor";
    if (change === "campaign")
      req = { ...request, subject: request.subject.replace("request-fixture", "foreign") };
    if (change === "basis")
      req = { ...request, subject: request.subject.replace("owner-hash", "new-basis") };
    if (change === "input") {
      ctx.recover = false;
      ctx.authority.request = { ...authority.request, input: "changed input" };
    }
    if (change === "run") {
      ctx.recover = false;
      ctx.runId = "new-run";
    }
    const before = readFileSync(f.file, "utf8");
    expect(await f.adapter.terminal(f.base, ctx).authorize!(req)).toBeNull();
    expect(readFileSync(f.file, "utf8")).toBe(before);
  },
);
it("reopens the original captured request and reuses bound evidence without creating another commitment", async () => {
  const f = fixture();
  const t = f.adapter.terminal(f.base, context);
  expect(await t.authorize!(request)).not.toBeNull();
  const before = readFileSync(f.file, "utf8");
  const fresh = new RequestCommitments(f.config);
  expect(
    await fresh.terminal(f.base, {
      ...context,
      runId: "recovery-run",
      recover: true,
      originalRun: context.runId,
    }).authorize!(request),
  ).not.toBeNull();
  expect(readFileSync(f.file, "utf8")).toBe(before);
});
it("an interruption before binding preserves the original input/run and binds it during exact recovery", async () => {
  const f = fixture();
  f.adapter.terminal(f.base, context);
  const fresh = new RequestCommitments(f.config);
  expect(
    await fresh.terminal(f.base, {
      ...context,
      runId: "recovery-run",
      recover: true,
      originalRun: context.runId,
    }).authorize!(request),
  ).not.toBeNull();
  const receipts = JSON.parse(readFileSync(f.file, "utf8")).receipts;
  expect(receipts).toHaveLength(1);
  expect(receipts[0].run).toBe(context.runId);
  expect(receipts[0].request).toEqual(authority.request);
});
it("refuses tampered durable input rather than inventing acceptance", async () => {
  const f = fixture();
  f.adapter.terminal(f.base, context);
  const raw = readFileSync(f.file, "utf8").replace("original-run", "forged-run");
  writeFileSync(f.file, raw, { mode: 0o600 });
  expect(await f.adapter.terminal(f.base, context).authorize!(request)).toBeNull();
});
