/* eslint-disable @typescript-eslint/no-explicit-any -- exact archived adapter and scripted UI fixture */
// Mechanism only. Canonical Mirror generation and real receipt/callback implementation; no live Work evidence.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { refereeCandidateItems } from "@immortalis/engine";
import {
  compileContract,
  mirrorItems,
  mirrorPanel,
} from "../../packages/operator/src/original-pc.ts";
import { projectReview } from "../../apps/phone/src/review-projection.ts";
import {
  HumanReviews,
  REVIEW_RECEIPT_LIMIT,
  type OpeningSources,
} from "../../apps/phone/src/reviews.ts";
import type { ToolContext } from "../../apps/phone/src/mcp-http.ts";
import { tempDir } from "../support/tmp.ts";
const authority: ToolContext = {
  client: "fixture-client",
  grant: "fixture-grant",
  scopes: ["player"],
  canReview: true,
  supportsElicitation: false,
  canElicit: false,
  elicit: async () => null,
};
const contract = compileContract("pc-portrait", {
  identity: "Bob, an ordinary human",
  contact: { kind: "CONTACT_ANCHOR", surfaces: ["Normal speech and a visible body"] },
  embodiment:
    "One human body; hands gather one log every 12 second; hands cannot pass a sealed barrier",
  continuity: "The same living person; death ends this life",
  exceptions: ["An old injury limits my left hand"],
  possessions: ["A rope"],
  open: ["My occupation remains open"],
})!;
const source: OpeningSources = {
  campaign: "projection",
  generation: {
    grouped: true,
    pc: "pc-portrait",
    world: "world",
    locus: "yard",
    presence: "I am originally present in the yard.",
    preparation: {
      actuator_quote: "hands gather",
      traversal_quote: "hands cannot pass a sealed barrier",
      cycle_quote: "one log every 12 second",
      cycle_value: 12,
      reserve_condition: "dry",
    },
  },
};
const candidate = refereeCandidateItems(contract);
const admitted: Record<string, string> = {
  identity: "INTRINSIC_PC",
  contact: "INTRINSIC_PC",
  embodiment: "INTRINSIC_PC",
  continuity: "INTRINSIC_PC",
  exception: "INTRINSIC_PC",
  possession: "ENTRY_ENVELOPE_FINITE",
  open: "UNRESOLVED_PC",
};
const request = {
  verb: "keep-character" as const,
  subject: JSON.stringify({
    campaign_id: "projection",
    pc_id: "pc-portrait",
    contract,
    referee_task: "immutable-task",
  }),
  shown: mirrorPanel("pc-portrait", mirrorItems(contract), "display 1", []),
  interpretation: {
    task_id: "immutable-task",
    items: candidate.map((i) => ({
      item_id: i.item_id,
      slot: i.slot,
      class: admitted[i.slot],
      grounds: "The delivered words concern this character.",
    })),
  },
};
const base = { say: () => undefined, ask: async () => null, close: () => undefined };
const context = {
  authority,
  runId: "proposal",
  actor: "pc-portrait",
  sources: source,
  active: () => true,
};
const args = async (r: HumanReviews) => {
  const view = await r.decorate({ content: [{ type: "text", text: "pending" }] }, authority);
  const v = view._meta!.review as any;
  return {
    proposal_id: v.proposal_id,
    digest: v.digest,
    capability: v.capability,
    decision: "accept",
  };
};
it("preserves every owner-generated Mirror item and material finding, while keeping the source recipe, references and schema private", () => {
  const text = projectReview(request, source);
  for (const item of mirrorItems(contract)) expect(text).toContain(item.text);
  expect(text).toContain("Still open");
  expect(text).toContain(source.generation!.presence);
  expect(text).toContain("one log every 12 second");
  expect(text).not.toMatch(
    /"(?:task_id|cycle_value|actuator_quote|world_id|fact_key)"\s*:|pc-portrait|immutable-task|INTRINSIC_PC|ENTRY_ENVELOPE_FINITE/,
  );
});
it("a real archived e23 card fails the readable-projection predicate; its signed unchanged receipt survives the presentation repair", async () => {
  const exact = "e23dec036291364df4a522fd294065e80722dfb3";
  const tree = "1ff595a58d514dff0c7bbcf6c35ffa7fe538f609";
  let object = exact;
  try {
    execFileSync("git", ["cat-file", "-e", exact], { stdio: "ignore" });
  } catch {
    object = tree;
  }
  expect(execFileSync("git", ["rev-parse", `${object}^{tree}`], { encoding: "utf8" }).trim()).toBe(
    tree,
  );
  const extracted = tempDir("pr91-reviewed-projection-");
  const archive = join(extracted, "source.tar");
  execFileSync("git", [
    "archive",
    `--output=${archive}`,
    object,
    "apps/phone/src",
    "packages/operator/src",
  ]);
  execFileSync("tar", ["-xf", archive, "-C", extracted]);
  symlinkSync(join(process.cwd(), "node_modules"), join(extracted, "node_modules"), "dir");
  symlinkSync(
    join(process.cwd(), "packages/operator/node_modules"),
    join(extracted, "packages/operator/node_modules"),
    "dir",
  );
  const operatorDir = tempDir("pr91-upgrade-receipt-");
  chmodSync(operatorDir, 0o700);
  const config = { operatorDir, campaignId: "projection" };
  const file = join(extracted, "fixture.json");
  writeFileSync(file, JSON.stringify({ config, context, request }));
  const old = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(process.cwd(), "tests/integration/fixtures/review-projection-probe.ts"),
        extracted,
        file,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  );
  const isReadable = (text: string) => !/"(?:cycle_value|actuator_quote|task_id)"\s*:/.test(text);
  expect(isReadable(old.material)).toBe(false);
  expect(isReadable(projectReview(request, source))).toBe(true);
  const fresh = new HumanReviews(config as any);
  expect(
    await fresh.terminal(base, { ...context, runId: "reopened" }).review!(request),
  ).not.toBeNull();
  expect(fresh.pending()).toBe(false);
  console.log(
    "PR91_PROJECTION_REGRESSION",
    JSON.stringify({
      reviewedHead: exact,
      reviewedTree: tree,
      oldReadable: false,
      currentReadable: true,
      unchangedReceiptReused: true,
    }),
  );
});
it("same readable words cannot authorize a changed actor, source/basis, subject or later referee interpretation", async () => {
  const operatorDir = tempDir("pr91-exact-meaning-");
  const config = { operatorDir, campaignId: "projection" } as any;
  const reviews = new HumanReviews(config);
  const accepted = reviews.terminal(base, context).review!(request);
  reviews.submit(await args(reviews), authority);
  await accepted;
  for (const [patch, altered] of [
    [{ actor: "other" }, request],
    [{ sources: { ...source, generation: { ...source.generation, pc: "other" } } }, request],
    [{}, { ...request, subject: request.subject.replace("immutable-task", "changed-basis") }],
    [
      {},
      {
        ...request,
        interpretation: {
          ...request.interpretation,
          items: request.interpretation.items.map((i) => ({
            ...i,
            grounds: "A materially different interpretation.",
          })),
        },
      },
    ],
  ] as any) {
    const fresh = new HumanReviews(config);
    const waiting = fresh.terminal(base, { ...context, ...patch, runId: "new-run" }).review!(
      altered,
    );
    expect(fresh.pending()).toBe(true);
    fresh.decline();
    expect(await waiting).toBeNull();
  }
});
it("receipt capacity is explicit and fails closed without evicting a prior human decision", async () => {
  const operatorDir = tempDir("pr91-bounded-receipts-");
  const config = { operatorDir, campaignId: "projection" } as any;
  const reviews = new HumanReviews(config);
  for (let n = 0; n <= REVIEW_RECEIPT_LIMIT; n++) {
    const next = {
      ...request,
      subject: JSON.stringify({ ...JSON.parse(request.subject), referee_task: `task-${n}` }),
    };
    const waiting = reviews.terminal(base, { ...context, runId: `run-${n}` }).review!(next);
    const response = reviews.submit(await args(reviews), authority);
    expect(response.isError === true).toBe(n === REVIEW_RECEIPT_LIMIT);
    expect((await waiting) !== null).toBe(n < REVIEW_RECEIPT_LIMIT);
  }
  expect(
    JSON.parse(readFileSync(join(operatorDir, "chat-reviewed.projection.json"), "utf8")).receipts,
  ).toHaveLength(REVIEW_RECEIPT_LIMIT);
});
void mkdirSync;
