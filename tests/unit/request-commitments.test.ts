import { HumanReviews } from "../../apps/phone/src/reviews.ts";
import {
  requestOperatorConfirmation,
  consumeConfirmation,
} from "../../packages/operator/src/confirmation.ts";
import { existsSync } from "node:fs";
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

it("readback preserves authored Review wording and long Unicode material verbatim", async () => {
  const f = fixture();
  const proposal = courtyard();
  proposal.world.premise =
    "Review my courtyard exactly as authored. " + "庭🌒é".repeat(9000) + " final field";
  const req = { ...request, proposal };
  const exact = {
    ...context,
    authority: {
      ...authority,
      request: { ...authority.request, input: JSON.stringify([authority.request.tool, proposal]) },
    },
  };
  expect(await f.adapter.terminal(f.base, exact).authorize!(req)).not.toBeNull();
  expect(f.lines.join("\n")).toContain(proposal.world.premise);
});

it("after owner-proven no effect clears the pending run, exact captured dispatch resumes without a new commitment", async () => {
  const f = fixture();
  const dispatch = { setup_id: "original-dispatch", document: "exact original document" };
  const original = { ...context, dispatch };
  f.adapter.terminal(f.base, original);
  const fresh = new RequestCommitments(f.config);
  const recovery = { ...original, runId: "new-recovery-run", recover: true };
  expect(
    await fresh.terminal(f.base, {
      ...recovery,
      dispatch: { ...dispatch, document: "changed input" },
    }).authorize!(request),
  ).toBeNull();
  expect(await fresh.terminal(f.base, recovery).authorize!(request)).not.toBeNull();
  const receipts = JSON.parse(readFileSync(f.file, "utf8")).receipts;
  expect(receipts).toHaveLength(1);
  expect(receipts[0].run).toBe(context.runId);
  expect(receipts[0].dispatch).toEqual(dispatch);
});

it("a scripted PR91-compatible accepted-review receipt retains its provenance without a new review or request commitment", async () => {
  const f = fixture();
  const old = new HumanReviews(f.config);
  const humanAuthority = { ...authority, canReview: true };
  const oldDecision = old.terminal(f.base, { ...context, authority: humanAuthority }).review!(
    request,
  );
  const card = (await old.decorate({ content: [] }, humanAuthority as any))._meta!.review as any;
  expect(
    old.submit(
      {
        proposal_id: card.proposal_id,
        digest: card.digest,
        capability: card.capability,
        decision: "accept",
      },
      humanAuthority,
    ).isError,
  ).not.toBe(true);
  expect(await oldDecision).not.toBeNull();
  const path = join(f.config.operatorDir, "chat-reviewed.request-fixture.json");
  const before = readFileSync(path, "utf8");
  const current = new RequestCommitments(f.config);
  const terminal = current.terminal(f.base, {
    ...context,
    recover: true,
    originalRun: context.runId,
    runId: "recovery-run",
  });
  const token = await requestOperatorConfirmation(
    terminal,
    request.verb,
    request.subject,
    request.shown,
    request.proposal,
  );
  expect(token).not.toBeNull();
  expect(consumeConfirmation(token!, request.verb, request.subject)).toBe(true);
  expect(old.pending()).toBe(false);
  expect(current.pending()).toBe(false);
  expect(existsSync(f.file)).toBe(false);
  expect(readFileSync(path, "utf8")).toBe(before);
  const changed = {
    ...request.proposal,
    world: { ...request.proposal.world, premise: "A different authored setting" },
  };
  expect(
    await requestOperatorConfirmation(
      terminal,
      request.verb,
      request.subject,
      request.shown,
      changed,
    ),
  ).toBeNull();
  expect(readFileSync(path, "utf8")).toBe(before);
});
