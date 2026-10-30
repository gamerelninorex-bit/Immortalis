import { entryEvidence } from "./review-sources.ts";
import { canonicalJson } from "@immortalis/contracts";
import type { OperatorTerminal } from "@immortalis/operator";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { issueRequestEvidence } from "../../../packages/operator/src/request-evidence.ts";
import type { ReviewRequest } from "../../../packages/operator/src/review-evidence.ts";
import type { PhoneConfig } from "./config.ts";
import type { ToolContext, ToolResult } from "./mcp-http.ts";
import { projectReview } from "./review-projection.ts";
import {
  HumanReviews,
  ownedRead,
  REVIEW_RECEIPT_BYTES,
  REVIEW_RECEIPT_LIMIT,
  type OpeningSources,
  type ReviewAuthority,
  type ReviewContext,
} from "./reviews.ts";

const hash = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const tools: Readonly<Record<string, readonly string[]>> = {
  "establish-locality": ["propose_original_setting"],
  "keep-character": ["propose_original_character", "revise_original_character"],
  "place-character": ["place_original_character"],
  "establish-character-locus": ["establish_character_location"],
  "initialize-time": ["state_starting_moment"],
  "accept-clarification": ["state_handling_duration"],
  "prepare-collection": ["propose_collection_preparation"],
  "declare-closed-setting": ["declare_closed_setting"],
};
interface Receipt {
  readonly origin: "AUTHENTICATED_REQUEST";
  readonly parentRun?: string;
  readonly dispatch?: unknown;
  readonly campaign: string;
  readonly client: string;
  readonly grant: string;
  readonly actor: string | null;
  readonly run: string;
  readonly request: NonNullable<ToolContext["request"]>;
  readonly verb: ReviewRequest["verb"];
  readonly subject: string;
  readonly meaning: string;
  readonly source: OpeningSources;
  readonly material: string;
}
/** Request-origin interface evidence only. No human-review capability, acceptance, or receipt is issued here. */
export class RequestCommitments {
  readonly #file: string;
  readonly #keyFile: string;
  readonly #campaign: string;
  readonly #legacy: HumanReviews;
  opening: { state: string; detail: string } | null = null;
  constructor(config: PhoneConfig) {
    this.#campaign = config.campaignId;
    this.#legacy = new HumanReviews(config);
    this.#file = join(config.operatorDir, `chat-requests.${config.campaignId}.json`);
    this.#keyFile = join(config.operatorDir, `chat-request-key.${config.campaignId}`);
  }
  #key(create = false): Buffer {
    try {
      const key = Buffer.from(ownedRead(this.#keyFile, 64), "hex");
      if (key.length !== 32) throw new Error("request evidence unavailable");
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
    if (!Array.isArray(parsed.receipts) || typeof parsed.mac !== "string")
      throw new Error("request evidence unavailable");
    const mac = createHmac("sha256", this.#key())
      .update(canonicalJson(parsed.receipts))
      .digest("hex");
    if (!timingSafeEqual(Buffer.from(hash(mac)), Buffer.from(hash(parsed.mac))))
      throw new Error("request evidence unavailable");
    const receipts: Receipt[] = parsed.receipts;
    if (
      receipts.length > REVIEW_RECEIPT_LIMIT ||
      receipts.some(
        (r) =>
          r.origin !== "AUTHENTICATED_REQUEST" ||
          r.campaign !== this.#campaign ||
          !r.request ||
          !r.run,
      )
    )
      throw new Error("request evidence unavailable");
    return receipts;
  }
  #write(receipt: Receipt, receipts: Receipt[]): void {
    const replacing = receipts.findIndex((r) => r.run === receipt.run && r.verb === receipt.verb);
    if (replacing < 0 && receipts.length >= REVIEW_RECEIPT_LIMIT)
      throw new Error("request history full");
    const next = receipts.slice();
    if (replacing < 0) next.push(receipt);
    else next[replacing] = receipt;
    mkdirSync(dirname(this.#file), { recursive: true, mode: 0o700 });
    const mac = createHmac("sha256", this.#key(true)).update(canonicalJson(next)).digest("hex");
    const body = JSON.stringify({ receipts: next, mac });
    if (Buffer.byteLength(body) > REVIEW_RECEIPT_BYTES) throw new Error("request history full");
    const temp = `${this.#file}.${randomBytes(8).toString("hex")}.tmp`;
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeSync(fd, body);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
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
  #scoped(authority: ReviewAuthority): Receipt[] {
    if (!authority.scopes.includes("player") || !authority.client || !authority.grant) return [];
    return this.#read().filter((r) => r.client === authority.client && r.grant === authority.grant);
  }
  accepted(authority: ReviewAuthority, actor: string | null, subject: string): boolean {
    return (
      this.#scoped(authority).some((r) => r.actor === actor && r.subject === subject) ||
      this.#legacy.accepted(authority, actor, subject)
    );
  }
  sources(authority: ReviewAuthority): OpeningSources {
    const legacy = this.#legacy.sources(authority);
    let setting: OpeningSources["setting"] = legacy.setting;
    let generation: OpeningSources["generation"] = legacy.generation;
    for (const r of this.#scoped(authority)) {
      if (r.meaning && r.verb === "establish-locality" && r.source.setting)
        setting = r.source.setting;
      if (r.meaning && r.verb === "keep-character" && r.source.generation)
        generation = r.source.generation;
      if (r.meaning && !r.parentRun && r.verb === "place-character") {
        const placed = JSON.parse(r.subject);
        generation = {
          ...generation,
          presence: placed.statement,
          pc: placed.pc_id,
          world: placed.world_id,
          locus: placed.locus_id,
        };
      }
    }
    return {
      campaign: this.#campaign,
      ...(setting ? { setting } : {}),
      ...(generation ? { generation } : {}),
    };
  }
  hasOriginalRun(run: string, dispatch: unknown): boolean {
    return (
      this.#read().some(
        (r) => r.run === run && r.dispatch !== undefined && same(r.dispatch, dispatch),
      ) || this.#legacy.hasRun(run)
    );
  }
  runSources(authority: ReviewAuthority, run: string, dispatch?: unknown): OpeningSources {
    const receipts = this.#scoped(authority);
    // Before the first referee answer the original request is captured but has no bound meaning yet.
    // Reconciliation can clear its no-effect pending run. Recover ONLY the same private dispatch frame,
    // just as authorize() does below; never treat an unbound capture as general accepted-source authority.
    const original = run
      ? receipts.find(
          (r) =>
            r.run === run &&
            (dispatch === undefined || (r.dispatch !== undefined && same(r.dispatch, dispatch))),
        )
      : dispatch === undefined
        ? undefined
        : receipts.findLast(
            (r) => !r.parentRun && r.dispatch !== undefined && same(r.dispatch, dispatch),
          );
    return original?.source ?? this.#legacy.sources(authority);
  }
  ownsRun(authority: ReviewAuthority, run: string): boolean {
    const original = this.#read().find((r) => r.run === run);
    return original
      ? this.#scoped(authority).some((r) => r.run === run)
      : this.#legacy.ownsRun(authority, run);
  }
  ownsActor(authority: ReviewAuthority, actor: string): boolean {
    return (
      this.#scoped(authority).some((r) => r.actor === actor && r.verb === "keep-character") ||
      this.#legacy.ownsActor(authority, actor)
    );
  }
  /** Durable original tool/input capture before referee work or canonical publication. */
  capture(context: ReviewContext): boolean {
    if (context.internal || context.recover) return true;
    const captured = context.authority.request;
    const verb = Object.keys(tools).find((v) => tools[v]?.includes(captured?.tool ?? "")) as
      ReviewRequest["verb"] | undefined;
    if (
      !captured ||
      !verb ||
      !context.active() ||
      !context.authority.scopes.includes("player") ||
      !context.authority.client ||
      !context.authority.grant
    )
      return false;
    try {
      const receipts = this.#read();
      const reused = receipts.find(
        (r) =>
          !r.parentRun &&
          r.client === context.authority.client &&
          r.grant === context.authority.grant &&
          r.request.session === captured.session &&
          r.request.id === captured.id,
      );
      if (reused) return reused.run === context.runId && same(reused.request, captured);
      this.#write(
        {
          origin: "AUTHENTICATED_REQUEST",
          campaign: this.#campaign,
          client: context.authority.client,
          grant: context.authority.grant,
          actor: context.actor,
          run: context.runId,
          ...(context.dispatch !== undefined ? { dispatch: context.dispatch } : {}),
          request: captured,
          verb,
          subject: "",
          meaning: "",
          material: "",
          source: context.sources ?? { campaign: this.#campaign },
        },
        receipts,
      );
      return true;
    } catch {
      return false;
    }
  }
  terminal(base: OperatorTerminal, context: ReviewContext): OperatorTerminal {
    const captured = this.capture(context);
    let legacyReview: OperatorTerminal["review"];
    try {
      this.#scoped(context.authority); // Corrupt request evidence cannot be bypassed through legacy recovery.
      if (
        (context.internal || context.recover) &&
        (!context.originalRun || this.ownsRun(context.authority, context.originalRun)) &&
        this.#legacy.verified(context.authority)
      ) {
        const legacySource = this.#legacy.sources(context.authority);
        const old = this.#legacy.terminal(base, {
          ...context,
          internal: true,
          derived: (request) =>
            ["place-character", "establish-character-locus"].includes(request.verb)
              ? entryEvidence(legacySource, request)
              : (context.derived?.(request, legacySource) ?? false),
        });
        legacyReview = async (request) => {
          // A captured request for this operation retains its own origin and cannot fall back to a different old decision.
          if (
            this.#scoped(context.authority).some(
              (r) => r.verb === request.verb && r.actor === context.actor,
            )
          )
            return null;
          return old.review!(request);
        };
      }
    } catch {
      /* Both origins fail closed on unreadable evidence. */
    }
    return {
      ...(legacyReview ? { review: legacyReview } : {}),
      say: (text) => base.say(text),
      // Missing information is returned by the existing operator/referee projection. Never synthesize console replies.
      ask: async () => null,
      close: () => base.close(),
      authorize: async (request) => {
        if (
          !captured ||
          !context.active() ||
          !context.authority.scopes.includes("player") ||
          !context.authority.client ||
          !context.authority.grant
        )
          return null;
        try {
          // Internal realizations must prove the exact source-owned operation, never use the current tool call as standing consent.
          if ((context.internal || context.recover) && context.derived?.(request)) {
            const receipts = this.#read();
            const parent = receipts.findLast(
              (r) =>
                r.client === context.authority.client &&
                r.grant === context.authority.grant &&
                r.meaning &&
                (request.verb === "place-character" || request.verb === "establish-character-locus"
                  ? (r.verb === "keep-character" || r.verb === "place-character") &&
                    r.actor === context.actor
                  : r.verb === "establish-locality" || r.verb === "keep-character"),
            );
            if (!parent && (context.internal || context.recover))
              throw new Error("original request unavailable");
            if (parent) {
              const material = projectReview(request, this.sources(context.authority), "readback");
              const prior = receipts.find(
                (r) => r.run === context.runId && r.verb === request.verb,
              );
              if (prior && (prior.subject !== request.subject || prior.meaning !== hash(request)))
                throw new Error("changed derived input");
              if (!prior)
                this.#write(
                  {
                    ...parent,
                    parentRun: parent.run,
                    run: context.runId,
                    actor: context.actor,
                    verb: request.verb,
                    subject: request.subject,
                    meaning: hash(request),
                    material,
                  },
                  receipts,
                );
              base.say(projectReview(request, this.sources(context.authority), "readback"));
              return issueRequestEvidence(request.verb, request.subject);
            }
          }
          const supplied = context.sources ?? {};
          const generation = [
            "keep-character",
            "place-character",
            "establish-character-locus",
            "accept-clarification",
          ].includes(request.verb);
          const source: OpeningSources = {
            campaign: this.#campaign,
            ...(generation && supplied.generation ? { generation: supplied.generation } : {}),
            ...(!generation && supplied.setting ? { setting: supplied.setting } : {}),
          };
          const subject = JSON.parse(request.subject);
          if (
            subject.campaign_id !== this.#campaign ||
            (subject.pc_id !== undefined && subject.pc_id !== context.actor)
          )
            throw new Error("wrong subject authority");
          const semanticSubject = (s: string) => {
            const v = JSON.parse(s);
            return request.verb === "establish-locality"
              ? { verb: v.verb, campaign_id: v.campaign_id, setup_id: v.setup_id }
              : v;
          };
          const meaning = hash({
            subject: semanticSubject(request.subject),
            source,
            actor: context.actor,
            ...(request.verb === "establish-locality"
              ? { proposal: request.proposal }
              : { shown: request.shown, interpretation: request.interpretation ?? null }),
          });
          const receipts = this.#read();
          const prior = receipts.find(
            (r) =>
              r.client === context.authority.client &&
              r.grant === context.authority.grant &&
              r.actor === context.actor &&
              r.verb === request.verb &&
              r.meaning === meaning,
          );
          if (context.internal || context.recover) {
            const original = context.originalRun
              ? receipts.find(
                  (r) =>
                    r.run === context.originalRun &&
                    r.client === context.authority.client &&
                    r.grant === context.authority.grant &&
                    r.actor === context.actor &&
                    r.verb === request.verb,
                )
              : (prior ??
                receipts.findLast(
                  (r) =>
                    context.dispatch !== undefined &&
                    r.dispatch !== undefined &&
                    !r.parentRun &&
                    r.client === context.authority.client &&
                    r.grant === context.authority.grant &&
                    r.actor === context.actor &&
                    r.verb === request.verb &&
                    same(r.dispatch, context.dispatch),
                ));
            if (
              !original ||
              (original.meaning && original.meaning !== meaning) ||
              (!original.meaning &&
                original.dispatch !== undefined &&
                !same(original.dispatch, context.dispatch))
            )
              throw new Error("original exact request evidence unavailable");
            if (!original.meaning)
              this.#write(
                {
                  ...original,
                  subject: request.subject,
                  meaning,
                  source,
                  material: projectReview(request, source, "readback"),
                },
                receipts,
              );
            base.say(original.material || projectReview(request, source, "readback"));
            return issueRequestEvidence(request.verb, request.subject);
          }
          const captured = context.authority.request;
          if (!captured || !tools[request.verb]?.includes(captured.tool))
            throw new Error("no supported exact request");
          const reused = receipts.find(
            (r) =>
              r.client === context.authority.client &&
              r.grant === context.authority.grant &&
              r.request.session === captured.session &&
              r.request.id === captured.id,
          );
          if (reused?.meaning) {
            if (
              reused.run !== context.runId ||
              !same(reused.request, captured) ||
              reused.meaning !== meaning
            )
              throw new Error("changed request or interpretation");
          } else {
            const material = projectReview(request, source, "readback");
            this.#write(
              {
                origin: "AUTHENTICATED_REQUEST",
                campaign: this.#campaign,
                client: context.authority.client,
                grant: context.authority.grant,
                actor: context.actor,
                run: context.runId,
                ...(reused?.dispatch !== undefined ? { dispatch: reused.dispatch } : {}),
                request: captured,
                verb: request.verb,
                subject: request.subject,
                meaning,
                source,
                material,
              },
              receipts,
            );
          }
          if (!context.active()) return null;
          base.say(reused?.material || projectReview(request, source, "readback"));
          return issueRequestEvidence(request.verb, request.subject);
        } catch {
          if (!legacyReview)
            base.say(
              "REQUEST_BLOCKED: the original exact request, input or current interpretation cannot be verified. No new authorization was inferred.",
            );
          return null;
        }
      },
    };
  }
  pending(): boolean {
    return false;
  }
  decline(): void {
    /* No pending human approval exists. */
  }
  async decorate(result: ToolResult, authority: ToolContext): Promise<ToolResult> {
    // Readback is informational, not a success receipt. Keep full mandatory content visible even when internal runs replace the transcript.
    const receipts = this.#scoped(authority);
    const latest = (verb: string) =>
      receipts.findLast((r) => r.meaning && !r.parentRun && r.verb === verb)?.material;
    const readback = {
      setting: latest("establish-locality"),
      character: latest("keep-character"),
      operation: receipts.findLast((r) => r.meaning)?.material,
    };
    let body: Record<string, unknown> | undefined;
    try {
      const v: unknown = JSON.parse(result.content[0]?.text ?? "null");
      if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
    } catch {
      /* Preserve a plain refusal. */
    }
    if (body) {
      delete body.confirmation;
      delete body.confirm_page;
    }
    return {
      ...result,
      ...(body
        ? {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ...body,
                  request_readback: readback,
                  // A terminal opening state is a HISTORICAL receipt of the original grouped request, kept for correction and
                  // audit. It is not the current obstacle: later stages (a delegated cycle, an attestation, a declaration) can have
                  // completed since, so it never replaces the owner-grounded `next` the result itself carries.
                  ...(this.opening
                    ? this.opening.state === "REALIZING"
                      ? {
                          opening: this.opening,
                          next: "The requested opening is continuing through its owners. Follow await_action.",
                        }
                      : { opening: { ...this.opening, historical: true } }
                    : {}),
                }),
              },
            ],
          }
        : {}),
      structuredContent: {
        ...result.structuredContent,
        request_readback: readback,
        ...(this.opening
          ? {
              opening:
                this.opening.state === "REALIZING"
                  ? this.opening
                  : { ...this.opening, historical: true },
            }
          : {}),
      },
    };
  }
}
