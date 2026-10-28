import { canonicalJson } from "@immortalis/contracts";
import type { OperatorTerminal } from "@immortalis/operator";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  issueReviewEvidence,
  type ReviewRequest,
} from "../../../packages/operator/src/review-evidence.ts";
import type { PhoneConfig } from "./config.ts";
import type { ToolContext, ToolResult } from "./mcp-http.ts";
import { REVIEW_CALLBACK, REVIEW_URI } from "./review-card.ts";
import { projectReview } from "./review-projection.ts";

export type ReviewCategory = "setting" | "generation";
export type ReviewAuthority = Pick<
  ToolContext,
  "client" | "grant" | "scopes" | "canReview" | "supportsElicitation"
> &
  Pick<ToolContext, "request">;
export interface OpeningSources {
  readonly campaign?: string;
  readonly setting?: {
    readonly chronology?: unknown;
    readonly declaration?: unknown;
    readonly reserve_condition?: string;
  };
  readonly generation?: {
    readonly grouped?: true;
    readonly presence?: string;
    readonly preparation?: unknown;
    readonly pc?: string;
    readonly world?: string;
    readonly locus?: string;
  };
}
export interface ReviewContext {
  readonly recover?: boolean;
  readonly originalRun?: string;
  readonly internal?: boolean;
  readonly authority: ReviewAuthority;
  readonly runId: string;
  readonly actor: string | null;
  readonly sources?: OpeningSources;
  /** Created by the trusted planner from accepted-source receipts and owner-verified current input, never from a tool boolean. */
  readonly derived?: (request: ReviewRequest) => boolean;
  readonly active: () => boolean;
}
interface Receipt {
  readonly campaign: string;
  readonly actor: string | null;
  readonly client: string;
  readonly grant: string;
  readonly category: ReviewCategory;
  readonly subject: string;
  readonly material: string;
  readonly digest: string;
  readonly meaning?: string;
  readonly source: OpeningSources;
  readonly run: string;
  readonly acceptedAt: number;
}
interface Pending {
  readonly context: ReviewContext;
  readonly receipt: Receipt;
  readonly secret: string;
  readonly expires: number;
  readonly finish: (accepted: boolean) => void;
}
export const REVIEW_RECEIPT_LIMIT = 100;
export const REVIEW_RECEIPT_BYTES = 32 * 1024 * 1024;
export function ownedRead(path: string, maxBytes = REVIEW_RECEIPT_BYTES): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = fstatSync(fd);
    if (
      st.size > maxBytes ||
      !st.isFile() ||
      st.uid !== process.getuid?.() ||
      (st.mode & 0o077) !== 0
    )
      throw new Error("review evidence unavailable");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const hash = (x: unknown) => createHash("sha256").update(canonicalJson(x)).digest("hex");
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const categoryOf = (r: ReviewRequest): ReviewCategory =>
  [
    "keep-character",
    "place-character",
    "establish-character-locus",
    "accept-clarification",
  ].includes(r.verb)
    ? "generation"
    : "setting";
const json = (v: unknown, error = false): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(v) }],
  ...(error ? { isError: true } : {}),
});

function parseResult(result: ToolResult): Record<string, unknown> {
  try {
    const body = JSON.parse(result.content[0]?.text ?? "null");
    return record(body) ? body : {};
  } catch {
    return {};
  }
}

/** Verify a signed receipt written by the reviewed e23 adapter without making a presentation change a new choice. */
function legacyReceiptMatches(r: Receipt, request: ReviewRequest, source: OpeningSources): boolean {
  if (request.verb === "establish-locality") return true; // same owner-derived setup hash, campaign, source and actor checked by caller
  const supplied = request.shown
    .filter((line) => !/^\s*(campaign:|operator:|setup identity:|to commit,)/.test(line))
    .join("\n");
  const extra = source.generation?.presence
    ? `\nStarting presence (your authored Entry Envelope): ${source.generation.presence}\nNative binding and stationary physical custody will be recorded only if the owners establish exactly this presence; no perception, action or elapsed time is granted.`
    : "";
  const suffix =
    extra +
    (source.generation?.preparation
      ? `\nProjection of your accepted handling claims (no new faculty or material):\n${JSON.stringify(source.generation.preparation, null, 2)}`
      : "") +
    (source.setting
      ? `\nOther authored opening premises:\n${JSON.stringify(source.setting, null, 2)}`
      : "");
  const reading = request.interpretation
    ? `\nCurrent referee interpretation:\n${JSON.stringify(request.interpretation, null, 2)}`
    : "";
  return (
    r.material === supplied + reading + suffix ||
    (request.verb === "keep-character" && r.material === supplied + suffix)
  );
}

/** Authenticated interface receipts, never canonical facts. One owner-only signed record; never persist a live acceptance secret. */
export class HumanReviews {
  readonly #file: string;
  readonly #keyFile: string;
  readonly #campaign: string;
  readonly #now: () => number;
  readonly #elicitMs: number;
  #pending: Pending | null = null;
  opening: { state: string; detail: string } | null = null;
  constructor(config: PhoneConfig, now: () => number = Date.now, elicitMs = 5 * 60_000) {
    this.#file = join(config.operatorDir, `chat-reviewed.${config.campaignId}.json`);
    this.#keyFile = join(config.operatorDir, `chat-review-key.${config.campaignId}`);
    this.#campaign = config.campaignId;
    this.#now = now;
    this.#elicitMs = elicitMs;
  }
  #key(create = false): Buffer {
    try {
      const key = Buffer.from(ownedRead(this.#keyFile, 64), "hex");
      if (key.length !== 32) throw new Error("review evidence unavailable");
      return key;
    } catch (e) {
      if (!create || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const key = randomBytes(32);
      const fd = openSync(this.#keyFile, "wx", 0o600);
      try {
        writeSync(fd, key.toString("hex"));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return key;
    }
  }
  #read(): Receipt[] {
    let raw: string;
    try {
      raw = ownedRead(this.#file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const parsed = JSON.parse(raw);
    if (!record(parsed) || !Array.isArray(parsed.receipts) || typeof parsed.mac !== "string")
      throw new Error("review evidence unavailable");
    const mac = createHmac("sha256", this.#key())
      .update(canonicalJson(parsed.receipts))
      .digest("hex");
    if (!equal(mac, parsed.mac)) throw new Error("review evidence unavailable");
    const receipts = parsed.receipts as Receipt[];
    if (
      receipts.some(
        (r) =>
          r.campaign !== this.#campaign ||
          r.digest !==
            hash({ subject: r.subject, material: r.material, source: r.source, actor: r.actor }),
      )
    )
      throw new Error("review evidence unavailable");
    return receipts;
  }
  #write(receipt: Receipt): void {
    const receipts = this.#read();
    if (receipts.length >= REVIEW_RECEIPT_LIMIT) throw new Error("review history full");
    receipts.push(receipt);
    mkdirSync(join(this.#file, ".."), { recursive: true, mode: 0o700 });
    const mac = createHmac("sha256", this.#key(true)).update(canonicalJson(receipts)).digest("hex");
    const temp = `${this.#file}.${randomBytes(8).toString("hex")}.tmp`;
    const fd = openSync(temp, "wx", 0o600);
    try {
      const body = JSON.stringify({ receipts, mac });
      if (Buffer.byteLength(body) > REVIEW_RECEIPT_BYTES) throw new Error("review history full");
      writeSync(fd, body);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, this.#file);
    const dir = openSync(
      dirname(this.#file),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
  /** Trusted recovery adapter only: exact signed acceptance, never a tool argument or new authority. */
  accepted(authority: ReviewAuthority, actor: string | null, subject: string): boolean {
    if (!authority.scopes.includes("player")) return false;
    return this.#read().some(
      (r) =>
        r.client === authority.client &&
        r.grant === authority.grant &&
        r.actor === actor &&
        r.subject === subject,
    );
  }
  sources(authority: ReviewAuthority): OpeningSources {
    const result: {
      setting?: OpeningSources["setting"];
      generation?: OpeningSources["generation"];
    } = {};
    for (const r of this.#read())
      if (r.client === authority.client && r.grant === authority.grant) {
        if (r.source.setting) result.setting = r.source.setting;
        if (r.source.generation) result.generation = r.source.generation;
      }
    return {
      campaign: this.#campaign,
      ...(result.setting ? { setting: result.setting } : {}),
      ...(result.generation ? { generation: result.generation } : {}),
    };
  }
  terminal(base: OperatorTerminal, context: ReviewContext): OperatorTerminal {
    return {
      say: (t) => base.say(t),
      ask: async () => null,
      close: () => base.close(),
      review: async (request) => {
        if (!context.active() || !context.authority.scopes.includes("player")) return null;
        // Only exact, already accepted material may authorize technical realisation. The planner supplies this predicate.
        if (context.derived?.(request)) return issueReviewEvidence(request.verb, request.subject);
        const category = categoryOf(request);
        const supplied = context.sources ?? {};
        const source: OpeningSources = {
          campaign: this.#campaign,
          ...(category === "setting" && supplied.setting ? { setting: supplied.setting } : {}),
          ...(category === "generation" && supplied.generation
            ? { generation: supplied.generation }
            : {}),
        };
        let material: string;
        try {
          material = projectReview(request, source);
        } catch {
          base.say("REVIEW_BLOCKED: the complete human review cannot be projected.");
          return null;
        }
        const subject = request.subject;
        const semanticSubject = (text: string): unknown => {
          const parsed = JSON.parse(text);
          return request.verb === "establish-locality"
            ? { verb: parsed.verb, campaign_id: parsed.campaign_id, setup_id: parsed.setup_id }
            : parsed;
        };
        const meaning = hash({
          subject: semanticSubject(subject),
          source,
          actor: context.actor,
          ...(request.verb === "establish-locality"
            ? { proposal: request.proposal }
            : { shown: request.shown, interpretation: request.interpretation ?? null }),
        });
        const digest = hash({ subject, material, source, actor: context.actor });
        let accepted: boolean;
        try {
          const prior = this.#read().find(
            (r) =>
              r.client === context.authority.client &&
              r.grant === context.authority.grant &&
              r.actor === context.actor &&
              canonicalJson(r.source) === canonicalJson(source) &&
              canonicalJson(semanticSubject(r.subject)) ===
                canonicalJson(semanticSubject(subject)) &&
              (r.meaning ? r.meaning === meaning : legacyReceiptMatches(r, request, source)),
          );
          if (prior) return issueReviewEvidence(request.verb, subject);
          if (context.internal) {
            base.say(
              "REVIEW_BLOCKED: the current material meaning is not covered by the accepted source review.",
            );
            return null;
          }
          if (!context.authority.canReview && !context.authority.supportsElicitation) {
            base.say("REVIEW_UNAVAILABLE: this client has no supported in-chat review surface.");
            return null;
          }

          accepted = await new Promise<boolean>((resolve) => {
            this.decline();
            const receipt: Receipt = {
              campaign: this.#campaign,
              actor: context.actor,
              client: context.authority.client,
              grant: context.authority.grant,
              category,
              subject,
              material,
              digest,
              meaning,
              source,
              run: context.runId,
              acceptedAt: this.#now(),
            };
            const timer = setTimeout(() => {
              if (this.#pending?.receipt.digest === digest) this.decline();
            }, 5 * 60_000);
            this.#pending = {
              context,
              receipt,
              secret: randomBytes(32).toString("hex"),
              expires: this.#now() + 5 * 60_000,
              finish: (ok) => {
                clearTimeout(timer);
                resolve(ok);
              },
            };
            base.say(
              `REVIEW_WAITING ${category}: the complete review is available in this conversation.`,
            );
          });
        } catch {
          base.say("REVIEW_BLOCKED: accepted-source evidence cannot be verified.");
          return null;
        }
        return accepted && context.active() ? issueReviewEvidence(request.verb, subject) : null;
      },
    };
  }
  pending(): boolean {
    return this.#pending !== null;
  }
  decline(): void {
    const p = this.#pending;
    this.#pending = null;
    p?.finish(false);
  }
  async decorate(result: ToolResult, authority: ToolContext): Promise<ToolResult> {
    const p = this.#pending;
    if (!p && this.opening) {
      let body: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(result.content[0]?.text ?? "null");
        if (record(parsed)) body = parsed;
      } catch {
        /* preserve non-JSON refusals */
      }
      const opening = this.opening;
      const next =
        opening.state === "REALIZING"
          ? "The accepted opening is continuing through its owners. Follow await_action; do not ask for another approval of the same starting presence or technical realization."
          : opening.detail;
      return {
        ...result,
        content: result.content[0]?.text?.startsWith("{")
          ? [{ type: "text", text: JSON.stringify({ ...body, opening, next }) }]
          : result.content,
        structuredContent: { ...result.structuredContent, opening },
      };
    }
    if (
      !p ||
      !p.context.active() ||
      p.context.authority.client !== authority.client ||
      p.context.authority.grant !== authority.grant
    )
      return result;
    if (!authority.canReview) {
      if (!authority.canElicit)
        return json({
          state: "AWAITING_REVIEW",
          category: p.receipt.category,
          next: "Call await_action for the in-chat human review.",
        });
      const answer = await authority.elicit(
        p.receipt.material,
        {
          type: "object",
          properties: { accept: { type: "boolean", title: "Accept the complete proposal" } },
          required: ["accept"],
          additionalProperties: false,
        },
        this.#elicitMs,
      );
      if (this.#pending !== p) return json({ state: "REVIEW_REFUSED" }, true);
      if (answer === null)
        return {
          ...result,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...parseResult(result),
                state: "AWAITING_CONFIRMATION",
                next: "The complete review still needs your response in this conversation. Call await_action to resume it.",
              }),
            },
          ],
          structuredContent: { state: "AWAITING_REVIEW", category: p.receipt.category },
        };
      return this.submit(
        {
          proposal_id: p.context.runId,
          digest: p.receipt.digest,
          capability: p.secret,
          decision:
            answer?.action === "accept" &&
            answer.content?.accept === true &&
            Object.keys(answer.content).length === 1
              ? "accept"
              : "decline",
        },
        authority,
        true,
      );
    }
    return {
      ...result,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...parseResult(result),
            state: "AWAITING_CONFIRMATION",
            next: "The complete review is displayed in this conversation. Only the person can accept, revise or decline it.",
          }),
        },
      ],
      structuredContent: {
        state: "AWAITING_REVIEW",
        category: p.receipt.category,
        proposal_id: p.context.runId,
      },
      _meta: {
        ui: { resourceUri: REVIEW_URI },
        review: {
          proposal_id: p.context.runId,
          digest: p.receipt.digest,
          category: p.receipt.category,
          material: p.receipt.material,
          capability: p.secret,
        },
      },
    };
  }
  submit(args: Record<string, unknown>, authority: ReviewAuthority, native = false): ToolResult {
    const p = this.#pending;
    const allowed = ["proposal_id", "digest", "capability", "decision"];
    if (
      !p ||
      Object.keys(args).length !== allowed.length ||
      Object.keys(args).some((k) => !allowed.includes(k)) ||
      !authority.scopes.includes("player") ||
      (!authority.canReview && !native) ||
      p.context.authority.client !== authority.client ||
      p.context.authority.grant !== authority.grant ||
      !p.context.active() ||
      this.#now() >= p.expires ||
      args.proposal_id !== p.context.runId ||
      args.digest !== p.receipt.digest ||
      typeof args.capability !== "string" ||
      !equal(args.capability, p.secret) ||
      !["accept", "revise", "decline"].includes(String(args.decision))
    )
      return json({ state: "REVIEW_REFUSED" }, true);
    this.#pending = null;
    try {
      if (args.decision === "accept") this.#write(p.receipt);
    } catch {
      p.finish(false);
      return json({ state: "REVIEW_BLOCKED" }, true);
    }
    p.finish(args.decision === "accept");
    return json({
      state: args.decision === "accept" ? "REVIEW_ACCEPTED" : "REVIEW_DECLINED",
      category: p.receipt.category,
    });
  }
  callback() {
    return {
      name: REVIEW_CALLBACK,
      replayable: true,
      title: "Respond to the displayed review",
      description: "UI-only authenticated response to one exact human review.",
      scope: "player" as const,
      inputSchema: {
        type: "object",
        properties: {
          proposal_id: { type: "string" },
          digest: { type: "string" },
          capability: { type: "string" },
          decision: { enum: ["accept", "revise", "decline"] },
        },
        required: ["proposal_id", "digest", "capability", "decision"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
      handler: async (args: Record<string, unknown>, ctx: ToolContext) => this.submit(args, ctx),
    };
  }
}
