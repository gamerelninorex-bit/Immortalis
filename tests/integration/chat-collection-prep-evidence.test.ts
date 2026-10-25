/* eslint-disable @typescript-eslint/no-explicit-any -- exercised scripted conversation evidence */
// A2 mechanism evidence. No genuine AI interpretation, real-client UX, latency or token-cost claim.
import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { expect, it } from "vitest";
import { PcCollectionAdapter } from "@immortalis/engine";
import { routeMeter, subtractWork } from "../support/route-meter.ts";
import { tempDir } from "../support/tmp.ts";
import { Chat, type Human } from "../support/chat-client.ts";
import {
  embodiment,
  hosts,
  resumed,
  slot,
  stage,
  reader,
  status,
  CYCLE,
  DECLARATION,
  HANDLING,
  MOMENT,
  preparation,
  openOrdinary,
  template,
  cloneSlot,
  converge,
} from "../support/chat-route.ts";
import { courtyard, run } from "../support/chat-setting.ts";
import { draft, WORDS } from "../support/chat-character.ts";

const BASE = "e8fd50b3de6f4f0f1e7be71fa97ff3b5434ea587";
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const root = process.cwd();
const environment = {
  node: process.version,
  pnpm: "10.33.0",
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  repetitions: 3,
};
function emit(name: string, value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value)).toString("base64");
  const parts = Math.ceil(bytes.length / 6000);
  for (let i = 0; i < parts; i++)
    console.log(`A2_EVIDENCE ${name} ${i + 1}/${parts} ${bytes.slice(i * 6000, (i + 1) * 6000)}`);
}

/** Unrelated authored loci and dormant closure history, through the ordinary owners.
 * No fact supplies any premise/result of the courtyard route being proved. */
async function unrelated(s: any, extra: number, history: number) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const publication = (n: number) => ({
      group_id: `unrelated:${n}:group`,
      intent_id: `unrelated:${n}:intent`,
      cause: `unrelated:${n}:cause`,
      basis: "authored unrelated measurement fixture",
      secrecy: "local-operator-session",
    });
    const original = c.locus("world-courtyard", "locus-courtyard")!.value;
    for (let i = 0; i <= extra; i++) {
      const result = await c.establishLocus({
        ...publication(i),
        locus: {
          ...original,
          locus_id: `unused-${i}`,
          designation: `An unused, separate locality ${i}`,
        },
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
    for (let i = 0; i <= history; i++) {
      const result = await new PcCollectionAdapter(c.store).establishSceneClosure({
        ...publication(1000 + i),
        world_id: "world-courtyard",
        locus_id: "unused-0",
        domain: { designation: "The unused remote locality", topology: "A separate empty place" },
        closure: { statement: "The remote domain has only its owner's stated facts" },
        source_rights: [],
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
  } finally {
    await c.close();
  }
}

function extractBase() {
  const dir = tempDir("immortalis-a2-base-");
  const archive = join(dir, "baseline.tar");
  execFileSync("git", [
    "archive",
    `--output=${archive}`,
    BASE,
    "apps/phone/src",
    "packages/operator/src",
  ]);
  execFileSync("tar", ["-xf", archive, "-C", dir]);
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

it("A2: exercised whole-path conversations and before/after work measurements with fixed causal input and unrelated state/history", async () => {
  const base = extractBase();
  const results: any[] = [];
  const originalCall = Chat.prototype.call;
  for (const cycle of [true, false])
    for (const variation of [
      { facts: 0, history: 0 },
      { facts: 20, history: 0 },
      { facts: 0, history: 40 },
    ])
      for (let repetition = 0; repetition < 3; repetition++) {
        const transcript: string[] = [
          "MECHANISM ONLY: scripted authenticated MCP host, scripted test-human input/consent, scripted referee policy, real canonical owners. This is not an actual human/client or AI-language-understanding witness.",
        ];
        const s = await slot({
          refereeHostIds: ["gm-setup", "gm-collection"],
          playerViewHostId: "view-host",
        });
        const referees = await hosts(s);
        const meter = routeMeter();
        const toolCounts: Record<string, number> = {};
        const transport = { requests: 0, request_body_bytes: 0 };
        const nativeFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          transport.requests++;
          if (typeof init?.body === "string" || init?.body instanceof URLSearchParams)
            transport.request_body_bytes += Buffer.byteLength(String(init.body));
          return nativeFetch(input, init);
        };
        let hostBytes = 0,
          humanReviews = 0,
          humanParts = 0,
          requests = 0;
        let excludedFixtureMs = 0;
        const phases: any[] = [];
        Chat.prototype.call = async function (...args: Parameters<typeof originalCall>) {
          const out = await originalCall.apply(this, args);
          toolCounts[args[0]] = (toolCounts[args[0]] ?? 0) + 1;
          hostBytes += Buffer.byteLength(out.text ?? "");
          return out;
        };
        const sanitize = (text: string) =>
          text
            .replaceAll(s.root, "<private-root>")
            .replace(
              /(?:establish-locality|keep-character|place-character|establish-character-locus|initialize-time|accept-clarification|prepare-collection|declare-closed-setting) [0-9a-f]{12}/g,
              "<human-only challenge>",
            )
            .replace(/[0-9a-f]{64}/g, "<digest>");
        const human: Human = (e) => {
          humanParts++;
          transcript.push(
            `HUMAN REVIEW (complete delivered part ${humanParts}):\n${sanitize(e.message)}`,
          );
          if (/type exactly "/.test(e.message)) {
            humanReviews++;
            transcript.push(
              "TEST HUMAN: confirms this displayed operation only. [Challenge/reply redacted; never visible to the host.]",
            );
          } else
            transcript.push(
              "TEST HUMAN: acknowledges receipt of this review part; grants no consent yet.",
            );
          return reader(e);
        };
        const phase = async (label: string, words: string, tool: string, args: any = {}) => {
          requests++;
          transcript.push(
            `TEST HUMAN REQUEST: ${words}\nSCRIPTED HOST TOOL: ${tool} (typed mapping of authored input; no genuine model interpretation claimed)`,
          );
          const before = meter.snapshot();
          const start = performance.now();
          const out = await stage(chat, tool, args, human);
          phases.push({
            label,
            ms: performance.now() - start,
            work: subtractWork(meter.snapshot(), before),
          });
          expect(out.finished.isError, out.finished.text).toBe(false);
          // The shipped KEEP operation deliberately ends at RELEASED_UNBOUND
          // (exit 3): native placement is a separate human choice, not a failure
          // to be retried or silently combined with KEEP.
          if (label === "KEEP") {
            expect(out.finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
            expect(out.finished.data.character).toMatchObject({
              state: "RELEASED_UNBOUND",
              barrier: "NONE",
            });
          }
          expect(
            out.finished.data.exit_code,
            `${label}: ${sanitize(out.finished.text ?? "")}`,
          ).toBe(label === "KEEP" ? 3 : 0);
          transcript.push(
            `SERVICE OUTCOME: ${out.finished.data.result?.status ?? out.finished.data.state}`,
          );
          const route = (await status(chat)).route;
          transcript.push(`READ-ONLY NEXT STEP: ${sanitize(JSON.stringify(route.next))}`);
        };
        const begin = performance.now();
        const r = await run(s, { pollMs: 20, chat: { settleMs: 30 } });
        const chat = r.chat;
        try {
          await phase(
            "setting",
            "Create my invented walled courtyard with twelve loose stones on the floor, reachable by walking across its flags.",
            "propose_original_setting",
            courtyard(),
          );
          await phase(
            "KEEP",
            `My character is ${WORDS.identity}. ${WORDS.contact}. ${embodiment(cycle)}. ${WORDS.continuity} I carry ${WORDS.possession}.`,
            "propose_original_character",
            draft({ embodiment: embodiment(cycle) }),
          );
          await phase("native", WORDS.presence, "place_original_character", {
            statement: WORDS.presence,
          });
          await phase(
            "physical",
            "Establish my character's physical location here.",
            "establish_character_location",
          );
          await phase(
            "chronology",
            `Begin at ${MOMENT.statement}, at exactly ${MOMENT.value} ${MOMENT.unit}.`,
            "state_starting_moment",
            MOMENT,
          );
          meter.active(false);
          const fixtureStart = performance.now();
          await unrelated(s, variation.facts, variation.history);
          excludedFixtureMs += performance.now() - fixtureStart;
          meter.active(true);
          if (!cycle) await phase("R5", HANDLING, "state_handling_duration", { words: HANDLING });
          await phase(
            "preparation",
            "Prepare gathering by my already accepted handling words; keep the empty Reserve dry.",
            "propose_collection_preparation",
            preparation(cycle ? CYCLE : HANDLING),
          );
          await phase(
            "declaration",
            Object.values(DECLARATION).join(". "),
            "declare_closed_setting",
            DECLARATION,
          );
          await phase(
            "trusted finish",
            "[Automatic service/referee work after the confirmed preparation; no player approval.]",
            "finish_collection_setup",
          );
          expect(humanReviews).toBe(cycle ? 7 : 8);
          const setupWork = meter.snapshot();
          const setupMs = performance.now() - begin - excludedFixtureMs;
          const setupHostBytes = hostBytes;
          const stable = (await status(chat)).route;
          const reads = [];
          for (let n = 0; n < 3; n++) {
            const before = meter.snapshot(),
              start = performance.now();
            expect((await status(chat)).route).toEqual(stable);
            reads.push({
              ms: performance.now() - start,
              work: subtractWork(meter.snapshot(), before),
            });
          }
          expect(stable.readiness.prepared_to_request_collection).toBe(true);
          expect(reads.every((m) => m.work.prepare_groups === 0)).toBe(true);
          // LOCK bookkeeping is included in fs_writes; no canonical group is prepared by status.
          meter.active(false);
          const c = await openOrdinary(s.campaignDir);
          const head = c.store.head();
          const facts = c.store.listFacts();
          const causal = {
            source: c.sourceCondition("world-courtyard", "src-loose-stones")!.value.recoverable,
            time: (c.store.getFact("temporal/state")!.value as any).canonical_time,
            reserves: facts
              .filter((f) => f.key.startsWith("production/reserve/"))
              .map((f) => (f.value as any).quantity),
            commitments: facts.filter((f) => f.key.includes("/collection/")).length,
          };
          await c.close();
          expect(causal).toEqual({
            source: { amount: 12, unit: "stone" },
            time: { value: MOMENT.value, unit: MOMENT.unit },
            reserves: [{ amount: 0, unit: "stone" }],
            commitments: 0,
          });
          await r.app.close();
          const file = join(s.root, "probe.json");
          writeFileSync(file, JSON.stringify(s.config), { mode: 0o600 });
          const probe = (source: string, operation = "character") =>
            JSON.parse(
              execFileSync(
                process.execPath,
                [
                  "--experimental-strip-types",
                  "--no-warnings",
                  join(root, "tests/integration/fixtures/chat-route-probe.ts"),
                  source,
                  file,
                  operation,
                ],
                { encoding: "utf8", timeout: 120_000 },
              ),
            );
          const commonBefore = probe(base),
            commonAfter = probe(root),
            addedRouteRead = probe(root, "route");
          expect(commonBefore.map((v: any) => v.outcome)).toEqual(["BOUND", "BOUND", "BOUND"]);
          expect(commonAfter.map((v: any) => v.outcome)).toEqual(["BOUND", "BOUND", "BOUND"]);
          expect(commonAfter.map((v: any) => v.continuity_sha)).toEqual(
            commonBefore.map((v: any) => v.continuity_sha),
          );
          results.push({
            cycle: cycle ? "accepted" : "R5",
            variation,
            repetition,
            phases,
            setup_ms: setupMs,
            elapsed_ms_including_fixture_and_probe_work: performance.now() - begin,
            setup_work: setupWork,
            status: reads,
            tool_counts: toolCounts,
            transport,
            oauth_link_decisions: 1,
            emitted_allowlisted_bytes: hostBytes,
            setup_allowlisted_bytes: setupHostBytes,
            human_confirmations: humanReviews,
            human_display_parts: humanParts,
            scripted_requests_including_service_finish: requests,
            canonical_revision: head.revision,
            current_facts: facts.length,
            causal,
            common_before: commonBefore,
            common_after: commonAfter,
            added_route_read: addedRouteRead,
          });
          if (repetition === 0 && variation.facts === 0 && variation.history === 0)
            emit(`transcript-${cycle ? "accepted" : "r5"}`, {
              base: BASE,
              head: HEAD,
              environment,
              transcript,
              confirmations: humanReviews,
              requests,
              toolCounts,
            });
        } finally {
          meter.stop();
          Chat.prototype.call = originalCall;
          globalThis.fetch = nativeFetch;
          await r.app.close().catch(() => undefined);
          for (const h of referees) await h.stop();
        }
      }
  for (const cycle of ["accepted", "R5"]) {
    const rows = results.filter((r) => r.cycle === cycle);
    expect(new Set(rows.map((r) => r.setup_work.prepare_groups)).size).toBe(1);
    for (const row of rows) {
      expect(row.status.every((r: any) => r.work.opens === 1 && r.work.prepare_groups === 0)).toBe(
        true,
      );
      for (const key of ["common_before", "common_after", "added_route_read"])
        expect(row[key].every((r: any) => r.work.opens === 1)).toBe(true);
      expect(row.common_after.map((r: any) => r.work.replay_groups)).toEqual(
        row.common_before.map((r: any) => r.work.replay_groups),
      );
    }
  }
  emit("measurements", {
    base: BASE,
    head: HEAD,
    environment,
    baseline_end_to_end_chat: "UNAVAILABLE: ingress did not exist",
    measured: results,
    limits:
      "Mechanism wall times only. Global filesystem/hash/serialization totals include scripted referee polling; canonical opens/replays and human confirmations are deterministic work counters. H-07 full history replay and state copies/hashes are inherited and measured by the common read probe; adapter overhead is the additional route work. No persistence repair, model latency, token cost or client UX claim.",
  });
}, 1_200_000);

it("A2: interruption recovery with fixed input across unrelated state and history", async () => {
  const prepared = await template("PREPARED");
  const measured: any[] = [];
  for (const variation of [
    { facts: 0, history: 0 },
    { facts: 20, history: 0 },
    { facts: 0, history: 40 },
  ])
    for (let repetition = 0; repetition < 3; repetition++) {
      const s = await cloneSlot(prepared);
      await unrelated(s, variation.facts, variation.history);
      const r = await resumed(s);
      const transcript = [
        "MECHANISM ONLY: scripted test-human and referee; real authenticated service shutdown/restart.",
      ];
      try {
        transcript.push(`TEST HUMAN: ${Object.values(DECLARATION).join(". ")}`);
        await stage(r.chat, "declare_closed_setting", DECLARATION, null);
        transcript.push(
          "INTERRUPTION: service stopped before the human answered the mandatory declaration review. No consent was submitted.",
        );
      } finally {
        await r.stop();
      }
      const fresh = await resumed(s);
      const call = fresh.chat.call.bind(fresh.chat);
      const toolCounts: Record<string, number> = {};
      let emittedBytes = 0;
      fresh.chat.call = async (...args: Parameters<typeof call>) => {
        const result = await call(...args);
        toolCounts[args[0]] = (toolCounts[args[0]] ?? 0) + 1;
        emittedBytes += Buffer.byteLength(result.text ?? "");
        return result;
      };
      const meter = routeMeter();
      const begin = performance.now();
      let confirms = 0;
      try {
        const one = (await status(fresh.chat)).route;
        expect((await status(fresh.chat)).route).toEqual(one);
        expect(one.readiness.prepared_to_request_collection).toBe(false);
        transcript.push(
          `READ-ONLY STATUS x2: ${JSON.stringify(one.next)}. No question or confirmation was recreated.`,
        );
        const trail = await converge(fresh, {
          until: (route) =>
            route.barrier === "NONE" &&
            route.stages.some((l: any) => l.stage === "closed_setting" && l.state === "DONE"),
          human: (e) => {
            transcript.push(
              `COMPLETE RESUMED HUMAN REVIEW:\n${e.message.replace(/declare-closed-setting [0-9a-f]{12}/g, "<human-only challenge>").replace(/[0-9a-f]{64}/g, "<digest>")}`,
            );
            if (/type exactly "/.test(e.message)) {
              confirms++;
              transcript.push(
                "TEST HUMAN: confirms this retained, still-incomplete declaration afresh. [Challenge and reply redacted.]",
              );
            }
            return reader(e);
          },
        });
        expect(confirms).toBe(1);
        expect(
          trail.some(
            (t) => t.includes("+retained") || t.startsWith("RESUME/resume_collection_setup"),
          ),
        ).toBe(true);
        const ms = performance.now() - begin;
        meter.stop();
        transcript.push(
          `SERVICE RECOVERY: ${trail.join(" -> ")}; only the original retained declaration was completed.`,
        );
        measured.push({
          variation,
          repetition,
          ms,
          work: meter.snapshot(),
          trail,
          fresh_confirmations: confirms,
          reasked_authored_inputs: 0,
          tool_counts: toolCounts,
          emitted_allowlisted_bytes: emittedBytes,
        });
        if (variation.facts === 0 && variation.history === 0 && repetition === 0)
          emit("transcript-resumed", {
            base: BASE,
            head: HEAD,
            environment,
            transcript,
            ...measured.at(-1),
          });
      } finally {
        meter.stop();
        await fresh.stop();
      }
    }
  emit("recovery-measurements", { base: BASE, head: HEAD, environment, measured });
}, 900_000);
