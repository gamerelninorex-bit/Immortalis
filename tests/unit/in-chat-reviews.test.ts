// MECHANISM ONLY: real review/evidence code, simulated human controls. No actual Work client or human provenance attestation.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { HumanReviews, type ReviewAuthority } from "../../apps/phone/src/reviews.ts";
import { REVIEW_HTML } from "../../apps/phone/src/review-card.ts";
import { compileContract } from "../../packages/operator/src/original-pc.ts";
import { consumeReviewEvidence } from "../../packages/operator/src/review-evidence.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import type { ToolContext } from "../../apps/phone/src/mcp-http.ts";
import { tempDir } from "../support/tmp.ts";
import { scriptedTerminal } from "../support/operator.ts";
const authority: ToolContext = {
  client: "client",
  grant: "grant",
  scopes: ["player"],
  canReview: true,
  supportsElicitation: false,
  canElicit: false,
  elicit: async () => null,
};
const request = {
  verb: "keep-character" as const,
  subject: JSON.stringify({
    campaign_id: "review-test",
    pc_id: "pc",
    contract: compileContract("pc", {
      identity: "Bob",
      contact: { kind: "CONTACT_ANCHOR", surfaces: ["A visible human body"] },
      embodiment: "One human body",
      continuity: "The same person through life",
      exceptions: [],
      open: [],
      possessions: [],
    }),
  }),
  shown: [
    "IDENTITY Bob",
    "AGENCY player",
    "EMBODIMENT normal human",
    "CONTINUITY same person",
    "LIMITS no exceptional faculties",
  ],
};
function fixture() {
  const operatorDir = tempDir("two-review-security-");
  const config = { operatorDir, campaignId: "review-test" } as PhoneConfig;
  let time = 100;
  const reviews = new HumanReviews(config, () => time);
  let active = true;
  const context = {
    authority,
    runId: "original-run",
    actor: "pc",
    active: () => active,
    sources: { generation: { presence: "I am originally at the yard." } },
  };
  const pending = reviews.terminal(scriptedTerminal(), context).review!(request);
  const view = async (a: ReviewAuthority = authority) =>
    reviews.decorate({ content: [{ type: "text", text: "review pending" }] }, a as ToolContext);
  const args = async () => {
    const result = await view();
    const r = result._meta!.review as Record<string, unknown>;
    return {
      proposal_id: r.proposal_id,
      digest: r.digest,
      capability: r.capability,
      decision: "accept",
    };
  };
  return {
    operatorDir,
    config,
    reviews,
    context,
    pending,
    view,
    args,
    expire: () => {
      time += 300_001;
    },
    stale: () => {
      active = false;
    },
  };
}

describe("authenticated private review receipts", () => {
  it("hides its one-use capability from model content and static resources, rejects forged/wrong contexts, and records only a genuine callback", async () => {
    const f = fixture();
    try {
      const args = await f.args();
      const secret = String(args.capability);
      const view = await f.view();
      expect(JSON.stringify(view.content)).not.toContain(secret);
      expect(JSON.stringify(view.structuredContent)).not.toContain(secret);
      expect(REVIEW_HTML).not.toContain(secret);
      expect(f.reviews.submit({ ...args, capability: "forged" }, authority).isError).toBe(true);
      for (const a of [
        { ...authority, grant: "other" },
        { ...authority, client: "other" },
        { ...authority, scopes: ["referee"] as const },
        { ...authority, canReview: false },
      ])
        expect(f.reviews.submit(args, a).isError).toBe(true);
      for (const change of [
        { proposal_id: "other" },
        { digest: "other" },
        { actor: "other" },
        { campaign: "other" },
        { decision: "yes" },
      ])
        expect(f.reviews.submit({ ...args, ...change }, authority).isError).toBe(true);
      expect(existsSync(join(f.operatorDir, "chat-reviewed.review-test.json"))).toBe(false);
      expect(f.reviews.submit(args, authority).isError).not.toBe(true);
      const evidence = await f.pending;
      expect(evidence).not.toBeNull();
      expect(consumeReviewEvidence({ ...evidence! }, request.verb, request.subject)).toBe(false);
      expect(consumeReviewEvidence(evidence!, request.verb, request.subject)).toBe(true);
      expect(consumeReviewEvidence(evidence!, request.verb, request.subject)).toBe(false);
      expect(f.reviews.submit(args, authority).isError).toBe(true);
      expect(
        readFileSync(join(f.operatorDir, "chat-reviewed.review-test.json"), "utf8"),
      ).not.toContain(secret);
    } finally {
      f.reviews.decline();
    }
  });
  it("decline, revision, stale and expired callbacks cannot publish an acceptance", async () => {
    for (const decision of ["decline", "revise", "stale", "expired"]) {
      const f = fixture();
      const args = await f.args();
      if (decision === "stale") f.stale();
      if (decision === "expired") f.expire();
      const result = f.reviews.submit(
        {
          ...args,
          decision: decision === "decline" || decision === "revise" ? decision : "accept",
        },
        authority,
      );
      if (decision === "stale" || decision === "expired") expect(result.isError).toBe(true);
      f.reviews.decline();
      expect(await f.pending).toBeNull();
      expect(existsSync(join(f.operatorDir, "chat-reviewed.review-test.json"))).toBe(false);
    }
  });
  it("restarts from the original authenticated receipt without another review; tampering fails closed", async () => {
    const f = fixture();
    const args = await f.args();
    f.reviews.submit(args, authority);
    await f.pending;
    const fresh = new HumanReviews(f.config);
    const evidence = await fresh.terminal(scriptedTerminal(), {
      ...f.context,
      runId: "recovery-run",
    }).review!(request);
    expect(evidence).not.toBeNull();
    expect(fresh.pending()).toBe(false);
    const path = join(f.operatorDir, "chat-reviewed.review-test.json");
    const data = JSON.parse(readFileSync(path, "utf8"));
    data.receipts[0].actor = "other";
    writeFileSync(path, JSON.stringify(data));
    expect(
      await new HumanReviews(f.config).terminal(scriptedTerminal(), f.context).review!(request),
    ).toBeNull();
  });
});

it("renders the actual inline component and complete long Unicode content; only an explicit trusted control gesture calls the private callback", async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const messages: Record<string, unknown>[] = [];
  const nodes = new Map<
    string,
    {
      textContent: string;
      disabled: boolean;
      addEventListener: (name: string, handler: (event: unknown) => void) => void;
    }
  >();
  for (const id of ["title", "material", "controls", "status", "accept", "revise", "decline"])
    nodes.set(id, {
      textContent: "",
      disabled: true,
      addEventListener: (name, h) => {
        handlers.set(`${id}:${name}`, h);
      },
    });
  let listener: (event: unknown) => void = () => undefined;
  const parent = { postMessage: (m: Record<string, unknown>) => messages.push(m) };
  runInNewContext(REVIEW_HTML.match(/<script>([\s\S]*)<\/script>/)![1]!, {
    parent,
    document: { getElementById: (id: string) => nodes.get(id) },
    addEventListener: (_name: string, h: (event: unknown) => void) => {
      listener = h;
    },
    Map,
    Promise,
  });
  expect(messages).toHaveLength(1);
  expect(messages[0]!.method).toBe("ui/initialize");
  listener({ source: parent, data: { jsonrpc: "2.0", id: messages[0]!.id, result: {} } });
  await Promise.resolve();
  await Promise.resolve();
  const material =
    "身份 / character 😀\n".repeat(9000) + "FINAL MANDATORY LIMIT <script>untrusted()</script>";
  listener({
    source: parent,
    data: {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        _meta: {
          review: {
            proposal_id: "proposal",
            digest: "digest",
            capability: "private-capability",
            category: "generation",
            material,
          },
        },
      },
    },
  });
  expect(nodes.get("material")!.textContent).toBe(material);
  expect(nodes.get("controls")!.disabled).toBe(false);
  expect(messages.filter((m) => m.method === "tools/call")).toHaveLength(0);
  handlers.get("accept:click")!({ isTrusted: false });
  expect(messages.filter((m) => m.method === "tools/call")).toHaveLength(0);
  handlers.get("accept:click")!({ isTrusted: true });
  const call = messages.find((m) => m.method === "tools/call")!;
  expect(call.params).toEqual({
    name: "submit_review_decision",
    arguments: {
      proposal_id: "proposal",
      digest: "digest",
      capability: "private-capability",
      decision: "accept",
    },
  });
  expect(nodes.get("controls")!.disabled).toBe(true);
  listener({ source: parent, data: { jsonrpc: "2.0", id: call.id, result: { content: [] } } });
  await Promise.resolve();
  handlers.get("accept:click")!({ isTrusted: true });
  expect(messages.filter((m) => m.method === "tools/call")).toHaveLength(1);
});
