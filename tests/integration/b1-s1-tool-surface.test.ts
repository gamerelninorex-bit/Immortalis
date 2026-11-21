/* eslint-disable @typescript-eslint/no-explicit-any -- evidence harness: JSON schemas, JSON-RPC replies and raw facts are untyped */
// F-014B B1 S1 — EVIDENCE E3: the bounded model-facing / GM-facing tool-surface audit as a TYPED, EXECUTABLE check, and the census it rests on.
//
// EVIDENCE ONLY. No production code is built or changed. "Textual absence is not enough" (BLUE): this file therefore
//   (A) walks the production TypeScript with the compiler's TYPE CHECKER (not grep) and pins the exact call/constructor census;
//   (B) loads every shipped tool definition (four stdio MCP servers over in-memory JSON-RPC, the referee MCP, the phone's `buildChatTools`),
//       walks each actual input schema, and asserts strictness and the absence of any member that can carry a Temporal request member;
//   (C) calls the REAL request tool (real stdio MCP process) and the REAL operator answer with injected `trigger` / `context` / `role` /
//       `permission` / `transaction` / `target` / `duration` / `condition` members, one change away from an accepted control;
//   (D) does the same against the REAL phone server's chat tools that reach a Temporal advance (`finish_collection`), over real owners;
//   (E) documents and demonstrates the direct-kernel admission, which is the trust-root limitation and is NOT claimed solved.
//
// What is NOT executed here is listed in the answer file and again at the end of each section. Nothing here claims a PASS or an eligibility.
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PassThrough } from "node:stream";
import ts from "typescript";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import {
  I002HostDecisionSchema,
  IrHostDecisionSchema,
  ObservationHostDecisionSchema,
  PLAYER_CHOICE_AUTHORITY,
  PhysicalHostDecisionSchema,
  SceneHostDecisionSchema,
} from "@immortalis/contracts";
import { CanonicalCampaign, StageProviderRegistry, TemporalCoordinator } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  T0,
  at,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import { buildChatTools } from "../../apps/phone/src/chat-tools.ts";
import { PLAYER_COMMANDS } from "../../apps/phone/src/commands.ts";
import { serveAdvanceRequestMcp } from "../../packages/operator/src/advance-request-mcp.ts";
import { serveGmFreightMcp } from "../../packages/operator/src/gm-freight-mcp.ts";
import { serveObserveRequestMcp } from "../../packages/operator/src/observe-request-mcp.ts";
import { servePlayerViewMcp } from "../../packages/operator/src/player-view-mcp.ts";
import { serveRefereeMcp } from "../../packages/operator/src/referee-mcp.ts";
import { GM_INTERPRETED_PC_WAIT } from "../../packages/contracts/src/temporal-gm-wait.ts";
import { type LocalityDirs } from "../support/locality.ts";
import {
  BEYOND_SUNSET,
  REQUEST_REFUSAL,
  REQUEST_TOOL,
  RequestClient,
  answer,
  answerAsProcess,
  askFiles,
  bindRequestHost,
  requestServerArgs,
  sunsetDirs,
  worldOf,
} from "../support/advance-request.ts";
import { copyDirs } from "../support/player-view.ts";
import { treeOf } from "../support/tree.ts";
import {
  cloneSlot,
  openOrdinary,
  resumed,
  stage,
  template,
  type Slot,
} from "../support/chat-route.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const ROOT = resolve(import.meta.dirname, "../..");
// zod is a dependency of packages/contracts only: resolve the very instance the shipped schemas were built with
const { z } = createRequire(join(ROOT, "packages/contracts/package.json"))("zod") as {
  z: { toJSONSchema: (schema: unknown, options: unknown) => any };
};
const PLAYER = { ...PLAYER_CHOICE_AUTHORITY };
const GM = { role: "role.gm", permission: "permission.rule.adjudicate" };
const log = (label: string, v: unknown) => {
  if (process.env["B1S1_LOG"])
    appendFileSync(process.env["B1S1_LOG"], `[E3] ${label} ${JSON.stringify(v)}\n`);
};

// ===========================================================================================================================
// A. CENSUS — type-resolved, over every production source file of packages/*/src and apps/*/src (testkit excluded: fixtures only)
// ===========================================================================================================================
const isProd = (f: string) =>
  /\/(packages|apps)\/[^/]+\/src\//.test(f) &&
  !f.includes("node_modules") &&
  !f.includes("/testkit/");
let program: ts.Program;
let checker: ts.TypeChecker;
const rel = (f: string) => relative(ROOT, f);

const declId = (decl: ts.Node | undefined): string | null => {
  if (!decl) return null;
  const sf = decl.getSourceFile();
  let name = "";
  if ((decl as any).name) name = (decl as any).name.getText();
  else if (ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) {
    const p = decl.parent;
    name =
      p &&
      (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))
        ? p.name.getText()
        : "(anonymous)";
  }
  return `${rel(sf.fileName)} ${name || "(anonymous)"}`;
};
const enclosingFn = (node: ts.Node): ts.Node | null => {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent)
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isConstructorDeclaration(n) ||
      ts.isGetAccessor(n)
    )
      return n;
  return null;
};

/** callee declaration id -> set of caller ids, over production sources (calls, `new`, and functions referenced as values) */
let callersOf: Map<string, Set<string>>;
let storeCommitCallers: Map<string, number>;
let triggerSites: string[];
let schemaRefs: string[];
let triggerKindReads: string[];

beforeAll(() => {
  const cfg = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  checker = program.getTypeChecker();
  callersOf = new Map();
  storeCommitCallers = new Map();
  const sites = new Set<string>();
  const refs = new Set<string>();
  const reads = new Set<string>();
  const record = (callee: string | null, caller: string | null) => {
    if (!callee || !caller || callee === caller) return;
    if (!callersOf.has(callee)) callersOf.set(callee, new Set());
    callersOf.get(callee)!.add(caller);
  };
  const fnName = (n: ts.Node | null) => (n ? declId(n) : null);
  for (const sf of program.getSourceFiles()) {
    if (!isProd(sf.fileName)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        let decl: ts.Declaration | undefined;
        try {
          decl = checker.getResolvedSignature(node)?.declaration as ts.Declaration | undefined;
        } catch {
          decl = undefined;
        }
        if (decl && isProd(decl.getSourceFile().fileName))
          record(declId(decl), fnName(enclosingFn(node)) ?? `${rel(sf.fileName)} (module level)`);
        // a store-like `.commit(...)`
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "commit"
        ) {
          const recv = checker.typeToString(checker.getTypeAtLocation(node.expression.expression));
          const dfile = decl ? rel(decl.getSourceFile().fileName) : "?";
          if (
            /persistence\/store\.ts|persistence\/.*package\.ts|campaign-core/.test(dfile) ||
            /CampaignStore|FileCampaignStore|CheckpointStore/.test(recv)
          )
            storeCommitCallers.set(
              rel(sf.fileName),
              (storeCommitCallers.get(rel(sf.fileName)) ?? 0) + 1,
            );
        }
      }
      if (ts.isIdentifier(node) && !ts.isCallExpression(node.parent)) {
        const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (
          decl &&
          (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) &&
          isProd(decl.getSourceFile().fileName) &&
          !ts.isFunctionDeclaration(node.parent) &&
          !ts.isImportSpecifier(node.parent) &&
          !ts.isExportSpecifier(node.parent)
        ) {
          const caller = enclosingFn(node);
          if (caller && decl !== caller) record(declId(decl), fnName(caller));
        }
        if (
          (node.text === "ResolutionRequestSchema" || node.text === "TriggerSchema") &&
          !ts.isImportSpecifier(node.parent) &&
          !ts.isExportSpecifier(node.parent)
        )
          refs.add(
            `${rel(sf.fileName)} ${node.text}${ts.isVariableDeclaration(node.parent) ? " (declaration)" : ""}`,
          );
      }
      if (
        (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
        node.name.getText() === "trigger"
      ) {
        let kind = "(pass-through)";
        if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
          const k = node.initializer.properties.find((p) => p.name && p.name.getText() === "kind");
          kind = k
            ? ts.isPropertyAssignment(k)
              ? k.initializer.getText()
              : k.name!.getText()
            : "(no kind member)";
        } else if (ts.isPropertyAssignment(node))
          kind = `(expression) ${node.initializer.getText().replace(/\s+/g, " ").slice(0, 60)}`;
        sites.add(
          `${rel(sf.fileName)} ${fnName(enclosingFn(node)) ? fnName(enclosingFn(node))!.split(" ").slice(1).join(" ") : "(module level)"} => ${kind}`,
        );
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "kind" &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "trigger"
      )
        reads.add(
          `${rel(sf.fileName)} ${fnName(enclosingFn(node)) ? fnName(enclosingFn(node))!.split(" ").slice(1).join(" ") : "(module level)"}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  triggerSites = [...sites].sort();
  schemaRefs = [...refs].sort();
  triggerKindReads = [...reads].sort();
}, 240_000);

/** the transitive callers of a function, as `file name` ids with their depth (1 = direct caller) */
function reverseClosure(seed: RegExp, maxDepth = 12): Map<string, number> {
  const seeds = [...callersOf.keys()].filter((k) => seed.test(k));
  const depth = new Map<string, number>(seeds.map((s) => [s, 0]));
  let frontier = seeds;
  for (let d = 1; frontier.length && d <= maxDepth; d++) {
    const next: string[] = [];
    for (const f of frontier)
      for (const c of callersOf.get(f) ?? [])
        if (!depth.has(c)) {
          depth.set(c, d);
          next.push(c);
        }
    frontier = next;
  }
  return depth;
}
const idsAt = (m: Map<string, number>, d: number) =>
  [...m.entries()]
    .filter(([, x]) => x === d)
    .map(([k]) => k)
    .sort();

const ADVANCE_SEED = /packages\/engine\/src\/temporal\/coordinator\.ts advance$/;

describe("A. [census] type-resolved census of every production site that constructs, states or forwards a Temporal request / trigger", () => {
  it("[census] exactly six functions call TemporalCoordinator.advance; continueRemainder has no production caller at all", () => {
    const closure = reverseClosure(ADVANCE_SEED);
    expect(idsAt(closure, 1)).toEqual([
      "packages/engine/src/epistemic/direct-observation.ts formObservedPacket",
      "packages/engine/src/temporal/coordinator.ts continueRemainder",
      "packages/protocol/src/active-pc-target-advance.ts advanceActivePcToTarget",
      "packages/protocol/src/null-pc-ooc-advance.ts advanceNullPcOocToTarget",
      "packages/protocol/src/null-pc-ooc-held-continuation.ts resumeNullPcOocHeldAdvance",
      "packages/protocol/src/pc-transfer-advance.ts advanceConfirmedPcTransferToDelivery",
    ]);
    expect([
      ...(callersOf.get("packages/engine/src/temporal/coordinator.ts continueRemainder") ?? []),
    ]).toEqual([]);
  });

  it("[census] the callers of those entry points: only the operator's confirmed-choice commands, the observation producer and the phone's recovery", () => {
    const closure = reverseClosure(ADVANCE_SEED);
    log(
      "A.closure",
      Object.fromEntries([...closure.entries()].filter(([, d]) => d >= 2 && d <= 8)),
    );
    expect(idsAt(closure, 2)).toEqual([
      "apps/phone/src/recovery.ts completeObservation",
      "packages/operator/src/commands.ts presentAdvance",
      "packages/operator/src/commands.ts presentNullChoice",
      "packages/operator/src/commands.ts presentPcTargetChoice",
      "packages/operator/src/observation.ts run",
    ]);
    // depth 3: the operator commands and the phone's recovery entry (each is a typed, confirmed-choice command or a recovery)
    expect(idsAt(closure, 3)).toEqual([
      "apps/phone/src/server.ts recoverPending",
      "packages/operator/src/commands.ts advance",
      "packages/operator/src/commands.ts collectFinish",
      "packages/operator/src/commands.ts nullAdvance",
      "packages/operator/src/commands.ts nullResume",
      "packages/operator/src/commands.ts pcTargetAdvance",
      "packages/operator/src/commands.ts pcTargetResume",
      "packages/operator/src/commands.ts reconcile",
      "packages/operator/src/observation.ts observeSurroundings",
    ]);
    // the whole closure, by FILE: a NEW way to reach the kernel's advance appears as a new file here and forces a review
    const files = [...new Set([...closure.keys()].map((k) => k.split(" ")[0]!))].sort();
    expect(files).toEqual([
      "apps/phone/src/collection-recovery.ts",
      "apps/phone/src/main.ts",
      "apps/phone/src/recovery.ts",
      "apps/phone/src/server.ts",
      "packages/engine/src/epistemic/direct-observation.ts",
      "packages/engine/src/temporal/coordinator.ts",
      "packages/operator/src/advance-request-answer-bin.ts",
      "packages/operator/src/advance-request-answer.ts",
      "packages/operator/src/advance-request-cli.ts",
      "packages/operator/src/bin.ts",
      "packages/operator/src/cli.ts",
      "packages/operator/src/commands.ts",
      "packages/operator/src/observation.ts",
      "packages/operator/src/observe-request-answer-bin.ts",
      "packages/operator/src/observe-request-answer.ts",
      "packages/operator/src/observe-request-cli.ts",
      "packages/protocol/src/active-pc-target-advance.ts",
      "packages/protocol/src/null-pc-ooc-advance.ts",
      "packages/protocol/src/null-pc-ooc-held-continuation.ts",
      "packages/protocol/src/pc-transfer-advance.ts",
    ]);
    const all = [...closure.keys()];
    // NOT a claim about the chat adapter: `PlayerRuns.launch` is an interface call, which the type checker cannot follow to its
    // implementation, so the phone's tool handlers do not appear above. The chat lane is bounded by the closed command set (below)
    // and by the executable checks of sections C and D, never by this graph alone.
    for (const f of all)
      expect(
        f,
        "no stdio MCP module or chat tool module is an ancestor in the type-resolved graph",
      ).not.toMatch(
        /-mcp\.ts|chat-tools\.ts|mcp-http\.ts|referee-tools\.ts|play-context\.ts|play-evidence\.ts/,
      );
  });

  it("[census] every production statement of a Temporal `trigger` member, and every consumer of `trigger.kind`", () => {
    log("A.triggerSites", triggerSites);
    log("A.schemaRefs", schemaRefs);
    log("A.triggerKindReads", triggerKindReads);
    const nonSchema = triggerSites.filter(
      (s) =>
        !s.startsWith("packages/contracts/src/freight-profile.ts") &&
        !s.startsWith("packages/engine/src/freight/economy-derive.ts"),
    );
    expect(nonSchema).toEqual(
      [
        "packages/contracts/src/temporal-gm-wait.ts (module level) => (expression) GmWaitTriggerSchema",
        "packages/contracts/src/temporal.ts (module level) => (expression) TriggerSchema",
        'packages/contracts/src/temporal.ts (module level) => (expression) z.literal("PCB-01")',
        "packages/engine/src/epistemic/direct-observation.ts formObservedPacket => OBSERVATION_TRIGGER_KIND",
        "packages/engine/src/pc-collection/admission.ts pcCollectionLapseGroupCheck => (expression) tx.trigger",
        "packages/engine/src/temporal/coordinator.ts #authorityValue => (expression) req.trigger",
        "packages/engine/src/temporal/coordinator.ts #commitTransaction => (expression) req.trigger",
        'packages/engine/src/temporal/coordinator.ts (anonymous) => (expression) "PCB-01" as const',
        'packages/operator/src/commands.ts advance => "operator-progression-choice"',
        "packages/operator/src/commands.ts canonStanding => (expression) t.trigger",
        "packages/operator/src/commands.ts nullTransaction => `operator-null-pc-${kind}-choice`",
        "packages/operator/src/commands.ts pcTargetTransaction => `operator-pc-target-${kind}-choice`",
        "packages/operator/src/ledger.ts (module level) => (expression) true",
        "packages/protocol/src/active-pc-target-advance.ts (module level) => (expression) true",
        "packages/protocol/src/null-pc-ooc-advance.ts (module level) => (expression) true",
        "packages/protocol/src/null-pc-ooc-held-continuation.ts (module level) => (expression) true",
        "packages/protocol/src/pc-transfer-advance.ts (module level) => (expression) true",
      ].sort(),
    );
    // the only statements of a trigger KIND (a string, a constant or a template over a closed 2-member union) outside schemas are operator/commands.ts x3 and the observation constant
    expect(schemaRefs).toEqual(
      [
        "packages/contracts/src/temporal.ts ResolutionRequestSchema (declaration)",
        "packages/contracts/src/temporal.ts ResolutionRequestSchema",
        "packages/contracts/src/temporal.ts TriggerSchema (declaration)",
        "packages/contracts/src/temporal.ts TriggerSchema",
        "packages/engine/src/temporal/coordinator.ts ResolutionRequestSchema",
        "packages/operator/src/ledger.ts ResolutionRequestSchema",
        "packages/protocol/src/active-pc-target-advance.ts ResolutionRequestSchema",
        "packages/protocol/src/null-pc-ooc-advance.ts ResolutionRequestSchema",
        "packages/protocol/src/null-pc-ooc-held-continuation.ts ResolutionRequestSchema",
        "packages/protocol/src/pc-transfer-advance.ts ResolutionRequestSchema",
      ].sort(),
    );
    expect(triggerKindReads).toEqual(
      [
        "packages/engine/src/epistemic/declaration.ts observationTriggerViolation",
        "packages/engine/src/temporal/admission.ts checkAuthority",
        "packages/engine/src/temporal/admission.ts checkTransaction",
        "packages/engine/src/temporal/coordinator.ts advance",
        "packages/engine/src/temporal/integrity.ts (anonymous)",
        "packages/engine/src/temporal/integrity.ts verifyTemporalIntegrity",
      ].sort(),
    );
  });

  it("[census] the literal GM_INTERPRETED_PC_WAIT appears in exactly one production source file", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          /\.(ts|tsx|js|mjs|cjs|json|html)$/.test(e.name) &&
          readFileSync(p, "utf8").includes(GM_INTERPRETED_PC_WAIT)
        )
          hits.push(rel(p));
      }
    };
    for (const top of ["packages", "apps"])
      for (const pkg of readdirSync(join(ROOT, top))) {
        try {
          walk(join(ROOT, top, pkg, "src"));
        } catch {
          /* none */
        }
      }
    expect(hits).toEqual(["packages/contracts/src/temporal-gm-wait.ts"]);
  });

  it("[census] the phone's closed command sets: the chat lane can start only seven commands, and none is an advance, resume or NULL-PC command", () => {
    const CHAT = chatCommandsOfServer();
    expect(CHAT).toEqual([
      "cease",
      "collect",
      "collect-continue",
      "collect-finish",
      "observe-surroundings",
      "reconcile",
      "settle-collection-lapse",
    ]);
    expect(Object.keys(PLAYER_COMMANDS).sort()).toEqual([
      "attest-cycle",
      "author-character",
      "cease",
      "character-status",
      "clarify-collection-cycle",
      "collect",
      "collect-continue",
      "collect-finish",
      "declare-closed-setting",
      "delegate-collection-cycle",
      "establish-character-locus",
      "establish-locality",
      "initialize-time",
      "locality-status",
      "observe-surroundings",
      "prepare-collection",
      "reconcile",
      "settle-collection-lapse",
      "status",
    ]);
    for (const c of CHAT) expect(Object.keys(PLAYER_COMMANDS)).toContain(c);
    for (const c of Object.keys(PLAYER_COMMANDS))
      expect(
        c,
        "no phone command is the operator's advance / resume / NULL-PC / relocation",
      ).not.toMatch(/^(advance|pc-target|null|relocat|resume|corridor)/);
    // the commands of that set that DO reach a Temporal advance (type-resolved closure above): collect-finish -> collectFinish, observe-surroundings -> observeSurroundings,
    // reconcile -> reconcile. Their trigger kinds are fixed by operator/commands.ts and observation (section D executes collect-finish and reconcile).
  });

  it("[census] no production file under apps/ or packages/operator/ calls CampaignStore.commit, and no model-facing module constructs a coordinator", () => {
    const callers = [...storeCommitCallers.keys()].sort();
    log("A.commitCallers", callers);
    for (const f of callers) {
      expect(f, "store.commit callers are engine owners and protocol gateways only").toMatch(
        /^packages\/(engine|protocol)\/src\//,
      );
    }
    expect(
      callers.filter((f) => f.startsWith("apps/") || f.startsWith("packages/operator/")),
    ).toEqual([]);
    // the stdio MCP modules and the phone's tool modules neither call store.commit nor name a coordinator
    const facing =
      /(^packages\/operator\/src\/(advance-request|observe-request|player-view|gm-freight|referee)-mcp\.ts$|^apps\/phone\/src\/(chat-tools|mcp-http|referee-tools|play-context|play-evidence)\.ts$)/;
    for (const sf of program.getSourceFiles()) {
      if (!facing.test(rel(sf.fileName))) continue;
      const text = sf.getFullText();
      expect(
        /\bTemporalCoordinator\b/.test(text),
        `${rel(sf.fileName)} names TemporalCoordinator`,
      ).toBe(false);
      expect(/\.commit\(/.test(text), `${rel(sf.fileName)} calls .commit(`).toBe(false);
    }
  });
});

/** the literal member list of the phone server's `CHAT_COMMANDS` set, read from the AST (it is a private const of the server closure) */
function chatCommandsOfServer(): string[] {
  const sf = program.getSourceFile(join(ROOT, "apps/phone/src/server.ts"))!;
  let out: string[] | undefined;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText() === "CHAT_COMMANDS" &&
      n.initializer &&
      ts.isNewExpression(n.initializer)
    ) {
      const arg = n.initializer.arguments?.[0];
      if (arg && ts.isArrayLiteralExpression(arg))
        out = arg.elements.map((e) => (e as ts.StringLiteral).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!out) throw new Error("CHAT_COMMANDS not found");
  return out.sort();
}

// ===========================================================================================================================
// B. TYPED SCHEMA WALK over every shipped tool definition
// ===========================================================================================================================
const rpcList = async (
  serve: (i: PassThrough, o: PassThrough) => Promise<void>,
): Promise<any[]> => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (c) => chunks.push(String(c)));
  const done = serve(input, output);
  input.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e3", version: "0" } } })}\n`,
  );
  input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  input.end();
  await done;
  const reply = chunks
    .join("")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .find((l) => l.id === 2);
  return reply.result.tools;
};

interface Listed {
  readonly surface: string;
  readonly name: string;
  readonly schema: any;
}
let LISTED: Listed[] = [];

const stub = async () => ({ ok: true }) as any;
const collectionSchemas = (): { name: string; schema: any }[] =>
  Object.entries({
    I002HostDecisionSchema,
    IrHostDecisionSchema,
    ObservationHostDecisionSchema,
    PhysicalHostDecisionSchema,
    SceneHostDecisionSchema,
  }).map(([name, s]) => ({
    name,
    schema: z.toJSONSchema(s as any, { io: "input", unrepresentable: "any" }),
  }));

beforeAll(async () => {
  const surfaces: [string, any[]][] = [
    [
      "stdio:advance-request",
      await rpcList((i, o) => serveAdvanceRequestMcp({ request: stub, input: i, output: o })),
    ],
    [
      "stdio:observe-request",
      await rpcList((i, o) =>
        serveObserveRequestMcp({ request: stub, input: i, output: o } as any),
      ),
    ],
    [
      "stdio:player-view",
      await rpcList((i, o) =>
        servePlayerViewMcp({ read: stub, request: stub, input: i, output: o } as any),
      ),
    ],
    [
      "stdio:gm-freight",
      await rpcList((i, o) => serveGmFreightMcp({ call: stub, input: i, output: o })),
    ],
    [
      "stdio:referee",
      await rpcList((i, o) =>
        serveRefereeMcp({
          stateDir: tempDir(),
          campaignId: "e3",
          operatorUid: 0,
          hostId: "h",
          secret: "s",
          input: i,
          output: o,
        } as any),
      ),
    ],
  ];
  const reviews: any = { decorate: async (x: any) => x, pending: () => false, opening: undefined };
  const chat = buildChatTools({
    config: { scenarioFile: "x", refereeHostIds: ["h1"] } as any,
    runs: { goal: {} } as any,
    reviews,
    delayed: { queue: {} } as any,
    glance: stub,
    callReferee: stub,
  } as any);
  LISTED = [
    ...surfaces.flatMap(([surface, tools]) =>
      tools.map((t) => ({ surface, name: t.name as string, schema: t.inputSchema })),
    ),
    ...chat.map((t) => ({ surface: `chat:${t.scope}`, name: t.name, schema: t.inputSchema })),
  ];
}, 120_000);

/** every property name at every depth, with its dotted path; plus every object node that is not strict and every unconstrained node */
function walkSchema(root: any) {
  const members: { path: string; leaf: string; node: any }[] = [];
  const open: string[] = [];
  const unconstrained: string[] = [];
  const visit = (s: any, path: string): void => {
    if (!s || typeof s !== "object") return;
    if (s.type === "object" && s.additionalProperties !== false) open.push(path || "(root)");
    if (s.properties)
      for (const [k, v] of Object.entries<any>(s.properties)) {
        members.push({ path: path + k, leaf: k, node: v });
        if (
          v &&
          typeof v === "object" &&
          !("type" in v) &&
          !("$ref" in v) &&
          !v.anyOf &&
          !v.oneOf &&
          !v.allOf &&
          !("enum" in v) &&
          !("const" in v)
        )
          unconstrained.push(path + k);
        visit(v, `${path}${k}.`);
      }
    if (s.items) visit(s.items, `${path}[].`);
    for (const key of ["anyOf", "oneOf", "allOf"])
      if (Array.isArray(s[key])) s[key].forEach((x: any) => visit(x, path));
    if (s.$defs) for (const [k, v] of Object.entries(s.$defs)) visit(v, `${path}$${k}.`);
  };
  visit(root, "");
  return { members, open, unconstrained };
}

/** tokens of a member name: snake_case / kebab / camelCase / dotted */
const tokensOf = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const FORBIDDEN_TOKENS = new Set([
  "trigger",
  "context",
  "role",
  "permission",
  "permissions",
  "transaction",
  "target",
  "duration",
  "condition",
  "continues",
  "requested",
  "publication",
  "coordinator",
  "store",
  "commit",
  "campaign",
  "authority",
]);

/** token hits that were READ and are not a Temporal request member (each with its reason); anything else fails the walk */
const REVIEWED_TOKEN_HITS: Readonly<Record<string, string>> = {
  "chat:player/propose_original_setting:reserve_condition":
    "an authored description of a Production reserve's state inside opening.preparation (preparation owners); never a stop condition",
  "chat:player/propose_original_character:reserve_condition":
    "same member inside opening.preparation",
  "chat:player/revise_original_character:reserve_condition":
    "same member inside opening.preparation",
  "chat:player/propose_collection_preparation:reserve_condition":
    "same member, top level of the preparation tool",
  "stdio:gm-freight/gm_freight_report_site_change:condition_id":
    "the identity of a standing SITE condition (World-State), a closed id pattern, not a Temporal stop condition",
  "stdio:gm-freight/gm_freight_attest_opening:condition_id":
    "same site-condition identity inside a premise",
  "stdio:gm-freight/gm_freight_attest_opening:condition":
    "free text of a site-condition or output-condition premise (GM-authored setting data)",
  "stdio:gm-freight/gm_freight_attest_opening:authority_locus":
    "closed object {office_id, competence}: the GIP legal authority of an order, not a Temporal authority",
  "stdio:gm-freight/gm_freight_attest_opening:trigger":
    "a clause term whose schema is a single string CONST (one of two Economy freight-profile literals), not an object: it cannot carry {kind, ref}",
  "stdio:gm-freight/gm_freight_attest_opening:target_condition":
    "free text of a legal scope qualification",
  "stdio:gm-freight/gm_freight_attest_opening:target":
    "closed object of ids and strings (world, origin, destination, material class, purpose): a freight scope target, not a time",
  "stdio:gm-freight/gm_freight_attest_opening:reaches_transaction":
    "a boolean on a legal exception determination: whether an exception reaches a FREIGHT transaction, not a Temporal one",
  "stdio:gm-freight/gm_freight_establish_legal:authority_source_ref":
    "an id string: the source of an office's authority (GIP)",
  "stdio:gm-freight/gm_freight_establish_legal:target_condition":
    "free text of a legal scope qualification",
};

describe("B. [typed schema walk] every shipped tool input schema is strict and carries no Temporal request member", () => {
  it("[typed] the tool inventory is exactly this (a new tool, anywhere, fails here and needs this audit)", () => {
    const inventory = LISTED.map((t) => `${t.surface}/${t.name}`).sort();
    log("B.inventory", inventory);
    expect(inventory).toEqual(
      [
        "stdio:advance-request/request_active_pc_target_advance",
        "stdio:observe-request/request_active_pc_observation",
        "stdio:player-view/read_current_observation_glance",
        ...[
          "gm_freight_status",
          "gm_freight_establish_setting",
          "gm_freight_attest_opening",
          "gm_freight_establish_legal",
          "gm_freight_initiate",
          "gm_freight_report_site_change",
          "gm_freight_withdraw",
          "gm_freight_reconcile",
        ].map((n) => `stdio:gm-freight/${n}`),
        ...["referee_list_tasks", "referee_get_task", "referee_submit_decision"].map(
          (n) => `stdio:referee/${n}`,
        ),
        ...[
          "read_current_observation_glance",
          "observe_surroundings",
          "collect",
          "gather",
          "play_status",
          "get_play_context",
          "continue_collection",
          "finish_collection",
          "cease_collection",
          "settle_collection_lapse",
          "reconcile_last_action",
          "propose_original_setting",
          "original_setting_status",
          "resume_original_setting",
          "propose_original_character",
          "revise_original_character",
          "place_original_character",
          "original_character_status",
          "resume_original_character",
          "collection_setup_status",
          "establish_character_location",
          "state_starting_moment",
          "state_handling_duration",
          "delegate_handling_duration",
          "propose_collection_preparation",
          "declare_closed_setting",
          "finish_collection_setup",
          "resume_collection_setup",
          "await_action",
          "cancel_action",
          "continue_pending_goal",
          "continue_queued_setup_edit",
        ].map((n) => `chat:player/${n}`),
        ...["referee_list_tasks", "referee_get_task", "referee_submit_decision"].map(
          (n) => `chat:referee/${n}`,
        ),
      ].sort(),
    );
  });

  it("[typed] every input schema is a strict object: top level and every nested object closes with additionalProperties:false, except the ONE named open member", () => {
    const openMembers: string[] = [];
    for (const t of LISTED) {
      expect(t.schema.type, `${t.surface}/${t.name}`).toBe("object");
      expect(t.schema.additionalProperties, `${t.surface}/${t.name}`).toBe(false);
      for (const o of walkSchema(t.schema).open) openMembers.push(`${t.surface}/${t.name}:${o}`);
    }
    log("B.open", openMembers);
    // the single free-form member of the whole shipped surface: the referee's interpretation document. It is validated per task operation
    // by the strict *HostDecisionSchema of that operation (see the next case), never by this schema.
    expect(openMembers.sort()).toEqual(
      [
        "chat:referee/referee_submit_decision:answer.",
        "stdio:referee/referee_submit_decision:answer.",
      ].sort(),
    );
  });

  it("[typed] no member of any tool is unconstrained (`{}`), so nothing arbitrary can ride in a typed-looking field", () => {
    const loose: string[] = [];
    for (const t of LISTED)
      for (const u of walkSchema(t.schema).unconstrained) loose.push(`${t.surface}/${t.name}:${u}`);
    log("B.unconstrained", loose);
    expect(loose).toEqual([]);
  });

  it("[typed] no member name, at any depth of any tool, is or contains a Temporal request token (trigger, context, role, permission, transaction, target, duration, condition, continues, requested, publication, coordinator, store, commit, campaign, authority) except the reviewed hits", () => {
    const hits: Record<string, string[]> = {};
    for (const t of LISTED) {
      for (const m of walkSchema(t.schema).members) {
        const bad = tokensOf(m.leaf).filter((x) => FORBIDDEN_TOKENS.has(x));
        if (bad.length) (hits[`${t.surface}/${t.name}:${m.leaf}`] ??= []).push(...bad);
      }
    }
    log("B.tokenHits", hits);
    // a member literally named `trigger` is admissible only as a single string CONST (an Economy freight-profile literal), never an object that could carry {kind, ref}
    const FREIGHT_LITERALS = [
      "ONE_UNIQUE_DEDICATED_LOT_AND_ONE_FIXED_UNMET_REQUIREMENT",
      "ONE_OPEN_WHOLE_REQUIREMENT_AND_ONE_UNIQUE_ACCEPTED_WHOLE_OUTPUT",
    ];
    for (const t of LISTED)
      for (const m of walkSchema(t.schema).members.filter((x) => x.leaf === "trigger")) {
        expect(m.node.type, `${t.name}:${m.path}`).toBe("string");
        expect(FREIGHT_LITERALS, `${t.name}:${m.path}`).toContain(m.node.const);
        expect(m.node.const).not.toBe(GM_INTERPRETED_PC_WAIT);
      }
    const unreviewed = Object.keys(hits).filter((k) => !(k in REVIEWED_TOKEN_HITS));
    expect(unreviewed, JSON.stringify(unreviewed.map((k) => [k, hits[k]]))).toEqual([]);
    // the reviewed hits still exist (an allowlist entry that matches nothing is a stale exemption)
    for (const k of Object.keys(REVIEWED_TOKEN_HITS)) expect(Object.keys(hits), k).toContain(k);
  });

  it("[typed] the referee's free-form `answer` is checked per operation by five strict decision schemas, none of which has a Temporal request member", () => {
    const rows: Record<string, unknown> = {};
    for (const { name, schema } of collectionSchemas()) {
      const w = walkSchema(schema);
      rows[name] = { open: w.open, members: w.members.length };
      expect(w.open, name).toEqual([]);
      const bad = w.members
        .filter((m) => tokensOf(m.leaf).some((x) => FORBIDDEN_TOKENS.has(x)))
        .map((m) => m.path);
      expect(bad, name).toEqual([]);
    }
    log("B.refereeAnswerSchemas", rows);
    // NOT covered here: the three collection operations (PC_COLLECTION_CYCLE / REACH / DELEGATE) are validated by validateCollectionReading, a
    // function, not a schema; its answer shapes are not walked in this file.
  });
});

// ===========================================================================================================================
// C. the REAL request tool (real stdio MCP process) and the REAL operator answer, with injected Temporal members
// ===========================================================================================================================
const INJECTED: { label: string; args: unknown }[] = [
  {
    label: "trigger (the GM wait literal)",
    args: { trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-injected" } },
  },
  { label: "context (the GM pair)", args: { context: GM } },
  { label: "context (the player pair)", args: { context: PLAYER } },
  { label: "role", args: { role: "role.gm" } },
  { label: "permission", args: { permission: "permission.rule.adjudicate" } },
  { label: "role + permission", args: { ...GM } },
  {
    label: "transaction",
    args: {
      transaction: {
        transaction_id: "tx-forged",
        cause: "c",
        trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "r" },
        context: GM,
      },
    },
  },
  { label: "transaction_id", args: { transaction_id: "tx-forged" } },
  { label: "target", args: { target: { unit: "t", value: 999 } } },
  { label: "duration", args: { duration: 3600 } },
  { label: "condition", args: { condition: { object_id: "o", boundary_id: "b" } } },
  { label: "continues", args: { continues: "tx-held" } },
  {
    label: "requested",
    args: { requested: { target: { unit: "t", value: 999 }, condition: null } },
  },
  { label: "publication", args: { publication: { basis: "b", secrecy: "s" } } },
  {
    label: "gm_wait",
    args: { gm_wait: { phase: "INITIAL", duration_value: 1, duration_unit: "hour" } },
  },
  { label: "kind", args: { kind: GM_INTERPRETED_PC_WAIT } },
  {
    label: "everything at once",
    args: {
      trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "r" },
      context: GM,
      role: GM.role,
      permission: GM.permission,
      transaction: { transaction_id: "t" },
      target: { unit: "t", value: 9 },
      duration: 1,
      condition: null,
    },
  },
];

describe("C. [executable] request_active_pc_target_advance and the operator's answer, real processes, real owners", () => {
  let fresh: LocalityDirs;
  beforeAll(async () => {
    fresh = await sunsetDirs();
  }, 240_000);

  it("[executable] every injected Temporal member is refused with the one opaque refusal; the package and the retained state are untouched; the accepted control (no members) leaves exactly one ask", async () => {
    const dirs = copyDirs(fresh);
    const bound = await bindRequestHost(dirs);
    expect(bound.code, bound.out.join("\n")).toBe(0);
    const before = treeOf(dirs.campaignDir);
    const world = await worldOf(dirs);
    const c = new RequestClient(requestServerArgs(dirs, bound.secretFile));
    await c.handshake();
    for (const { label, args } of INJECTED) {
      const r = await c.call(args, REQUEST_TOOL);
      expect(r.isError, label).toBe(true);
      expect(r.text, label).toBe(REQUEST_REFUSAL);
    }
    expect(askFiles(dirs)).toEqual([]); // no hostile ask was retained
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(await worldOf(dirs)).toEqual(world);
    // ONE change from every case above: the empty argument object
    const ok = JSON.parse((await c.call({}, REQUEST_TOOL)).text);
    expect(ok.ok).toBe(true);
    expect(askFiles(dirs)).toHaveLength(1);
    c.end();
    await c.exit();
    // the retained ask carries no member the host could have chosen
    const retained = readFileSync(askFiles(dirs)[0]!, "utf8");
    for (const needle of [
      GM_INTERPRETED_PC_WAIT,
      "role.gm",
      "permission.rule.adjudicate",
      "tx-forged",
      "ref-injected",
    ])
      expect(retained.includes(needle), needle).toBe(false);
    log("C.retainedAskKeys", Object.keys(JSON.parse(retained)));
    expect(treeOf(dirs.campaignDir)).toEqual(before); // asking wrote nothing canonical
  });

  it("[executable] the operator's answer commits one transaction whose trigger kind is the fixed operator constant and whose context is the PLAYER pair: nothing of the host's request is carried", async () => {
    const dirs = copyDirs(fresh);
    const bound = await bindRequestHost(dirs);
    const c = new RequestClient(requestServerArgs(dirs, bound.secretFile));
    await c.handshake();
    for (const { args } of INJECTED) await c.call(args, REQUEST_TOOL);
    expect(JSON.parse((await c.call({}, REQUEST_TOOL)).text).ok).toBe(true);
    c.end();
    await c.exit();
    const done = await answer(dirs, BEYOND_SUNSET);
    expect(done.result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    const world = await worldOf(dirs);
    expect(world.transactions).toHaveLength(1);
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      const tx: any = campaign.store.getFact(world.transactions[0]!)!.value;
      const auth: any = campaign.store
        .listFacts()
        .find((f) => f.key.startsWith("temporal/transaction-authority/"))!.value;
      log("C.committed", {
        trigger: tx.trigger,
        context: tx.context,
        authorityTrigger: auth.trigger,
        authorityContext: auth.context,
      });
      expect(tx.trigger.kind).toBe("operator-pc-target-advance-choice");
      expect(tx.trigger.ref).toMatch(/^operator-confirmation:/);
      expect(tx.context).toEqual(PLAYER);
      expect(auth.trigger).toEqual(tx.trigger);
      expect(auth.context).toEqual(PLAYER);
      const blob = JSON.stringify([tx, auth]);
      for (const needle of [
        GM_INTERPRETED_PC_WAIT,
        "role.gm",
        "permission.rule.adjudicate",
        "tx-forged",
        "ref-injected",
      ])
        expect(blob.includes(needle), needle).toBe(false);
    } finally {
      await campaign.close();
    }
  });

  it("[executable] hostile flags on the operator's answer binary (`--trigger-kind`, `--context-role`, `--role`, `--permission`) are a usage error; the ask stays pending and nothing is committed", async () => {
    const dirs = copyDirs(fresh);
    const bound = await bindRequestHost(dirs);
    const c = new RequestClient(requestServerArgs(dirs, bound.secretFile));
    await c.handshake();
    expect(JSON.parse((await c.call({}, REQUEST_TOOL)).text).ok).toBe(true);
    c.end();
    await c.exit();
    const before = treeOf(dirs.campaignDir);
    const out: Record<string, unknown> = {};
    for (const extra of [
      ["--trigger-kind", GM_INTERPRETED_PC_WAIT],
      ["--context-role", "role.gm"],
      ["--role", "role.gm"],
      ["--permission", "permission.rule.adjudicate"],
      ["--transaction-id", "tx-forged"],
    ]) {
      const r = await answerAsProcess(dirs, { confirm: true, extra });
      out[extra[0]!] = { code: r.code, typed: r.typed.length };
      expect(r.code, extra[0]).not.toBe(0);
      expect(r.typed, extra[0]).toEqual([]); // the service never even drew a challenge
      expect(treeOf(dirs.campaignDir), extra[0]).toEqual(before);
    }
    log("C.answerFlags", out);
    expect(askFiles(dirs)).toHaveLength(1);
    // ONE change away: the same invocation without the extra flag is accepted and commits the fixed-kind transaction
    const ok = await answerAsProcess(dirs, { confirm: true });
    expect(ok.code).toBe(0);
    expect((await worldOf(dirs)).transactions).toHaveLength(1);
  });
});

// ===========================================================================================================================
// D. the REAL phone server's chat tools (real MCP over HTTP, real operator CLI, real gateway, real owners)
// ===========================================================================================================================
const noHuman = () => {
  throw new Error("ordinary gameplay must not elicit a second confirmation");
};

describe("D. [executable] chat tools that reach a Temporal advance, with injected members, over the real phone server", () => {
  let ready: Slot;
  beforeAll(async () => {
    ready = await template("READY", { cycle: true });
  }, 300_000);

  const transactionsOf = async (s: Slot) => {
    const c = await openOrdinary(s.campaignDir);
    try {
      return {
        head: c.store.head().state_sha256,
        revision: c.store.head().revision,
        transactions: c.store
          .listFacts()
          .filter((f) => f.key.startsWith("temporal/transaction/"))
          .map((f) => f.value as any),
        authorities: c.store
          .listFacts()
          .filter((f) => f.key.startsWith("temporal/transaction-authority/"))
          .map((f) => f.value as any),
        time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      };
    } finally {
      await c.close();
    }
  };

  it("[executable] finish_collection / reconcile_last_action / continue / cease / collect / gather / observe_surroundings refuse every injected Temporal member and change nothing; the accepted control commits ONE transaction with the fixed kind and the PLAYER pair", async () => {
    const s = await cloneSlot(ready);
    const r = await resumed(s);
    try {
      await r.chat.init({});
      // arrange an in-flight collection so that finish_collection is a REAL advance (an idle campaign would refuse for state, not for the member)
      expect((await stage(r.chat, "collect", { amount: 2 }, noHuman)).finished.data.exit_code).toBe(
        0,
      );
      expect(
        (await stage(r.chat, "continue_collection", {}, noHuman)).finished.data.exit_code,
      ).toBe(0);
      const before = await transactionsOf(s);
      expect(before.transactions).toEqual([]); // no time has passed yet
      const refused: Record<string, number> = {};
      const texts: Record<string, Set<string>> = {};
      for (const tool of [
        "finish_collection",
        "reconcile_last_action",
        "continue_collection",
        "cease_collection",
        "settle_collection_lapse",
        "collect",
        "gather",
        "observe_surroundings",
      ]) {
        const base =
          tool === "gather"
            ? { amount: 1, until: "start" }
            : tool === "collect"
              ? { amount: 1 }
              : tool === "observe_surroundings"
                ? { attention: "the yard" }
                : {};
        for (const { label, args } of INJECTED) {
          const out = await r.chat.call(tool, { ...base, ...(args as object) });
          expect(out.isError, `${tool} / ${label}`).toBe(true);
          refused[tool] = (refused[tool] ?? 0) + 1;
          (texts[tool] ??= new Set()).add(String(out.text).slice(0, 120));
        }
      }
      log("D.refused", refused);
      log("D.refusalTexts", Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, [...v]])));
      // a refusal by ARGUMENT, not by state: the tools that take nothing say so; the two that take an amount or a look name the unaccepted member
      for (const tool of [
        "finish_collection",
        "reconcile_last_action",
        "continue_collection",
        "cease_collection",
        "settle_collection_lapse",
      ])
        expect([...texts[tool]!], tool).toEqual(["this tool takes no arguments"]);
      const after = await transactionsOf(s);
      expect(after.head).toBe(before.head); // not one revision, receipt or fact
      expect(after.transactions).toEqual([]);
      expect(after.time).toBe(before.time);
      // ONE change away: the same tool, no members
      const finished = await stage(r.chat, "finish_collection", {}, noHuman);
      expect(finished.finished.data.exit_code).toBe(0);
      const done = await transactionsOf(s);
      expect(done.time).toBeGreaterThan(before.time);
      expect(done.transactions).toHaveLength(1);
      const tx = done.transactions[0];
      log("D.committed", {
        trigger: tx.trigger,
        context: tx.context,
        authorities: done.authorities.map((a: any) => a.trigger),
      });
      expect(tx.trigger.kind).toBe("operator-pc-target-advance-choice");
      expect(tx.trigger.ref).toMatch(/^operator-confirmation:/);
      expect(tx.context).toEqual(PLAYER);
      for (const a of done.authorities) {
        expect(a.trigger).toEqual(tx.trigger);
        expect(a.context).toEqual(PLAYER);
      }
      expect(
        JSON.stringify([done.transactions, done.authorities]).includes(GM_INTERPRETED_PC_WAIT),
      ).toBe(false);
      // reconcile re-presents by identity; hostile members on it were refused above, and the plain call changes nothing
      await stage(r.chat, "reconcile_last_action", {}, noHuman);
      expect((await transactionsOf(s)).head).toBe(done.head);
    } finally {
      await r.stop();
    }
  }, 300_000);

  // NOT executed here (stated, not hidden): observe_surroundings and gather(until: "complete") were exercised only to their REFUSAL for injected members;
  // their accepted control needs a scripted GM scene reading / goal run (see tests/integration/chat-scene.test.ts and chat-goal.test.ts, which this file
  // does not rerun). request_active_pc_observation (the observation twin of the request tool) is checked at the schema level only.
});

// ===========================================================================================================================
// E. direct kernel admission: the trust-root limitation, shown and NOT claimed solved
// ===========================================================================================================================
describe("E. [existing law] direct kernel admission: a trusted writer holding the archivist write authority can commit the player+literal record through store.commit", () => {
  it("[existing law] no tool exposes campaign.store, store.commit or a coordinator (sections A and B), while the kernel itself admits the record from a raw store.commit of a group the coordinator did not build", async () => {
    const dir = tempDir();
    const campaign = await must(
      CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "b1s1-e3" }),
    );
    await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
    await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
    await must(
      campaign.initializePcStandingInstructionLedger({
        pc_id: FIXTURE_PC_ID,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
      }),
    );
    await must(
      campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: FIXTURE_PC_ID,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        insertion: fixtureInsertionFact(),
      }),
    );
    // the raw path: whatever group reaches `store.commit` is judged by the kernel's admission and nothing else. This wrapper rewrites the
    // coordinator's ordinary-kind seal into the literal IN FLIGHT, i.e. the kernel receives a group the coordinator did not build.
    const inner = campaign.store;
    const raw = {
      ...inner,
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k: string) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i: string) => inner.lookupReceipt(i),
      committedGroup: (i: string) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: (g: any) =>
        inner.commit(
          g.group_id === "transaction-group:tx-raw-literal"
            ? {
                ...g,
                writes: g.writes.map((w: any) =>
                  w.key === "temporal/transaction/tx-raw-literal"
                    ? {
                        ...w,
                        value: {
                          ...w.value,
                          trigger: { ...w.value.trigger, kind: GM_INTERPRETED_PC_WAIT },
                        },
                      }
                    : w,
                ),
              }
            : g,
        ),
    } as any;
    const c = new TemporalCoordinator(raw, new StageProviderRegistry([]));
    await must(c.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    const req = (id: string, target: number) => ({
      transaction_id: id,
      cause: `cause-${id}`,
      trigger: { kind: "operator-progression-choice", ref: `ref-${id}` },
      continues: null,
      requested: { target: at(target), condition: null },
      context: PLAYER,
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    const control = await c.advance(req("tx-raw-control", 150));
    const literal = await c.advance(req("tx-raw-literal", 200));
    const sealed: any = inner.getFact("temporal/transaction/tx-raw-literal")?.value;
    const shown = {
      control: { ok: control.ok },
      literal: { ok: literal.ok, error: literal.ok ? null : (literal.error as any).code },
      sealedKind: sealed?.trigger?.kind,
      sealedContext: sealed?.context,
    };
    log("E.raw", shown);
    expect(control.ok).toBe(true);
    expect(literal.ok, JSON.stringify(shown)).toBe(true);
    expect(sealed.trigger.kind).toBe(GM_INTERPRETED_PC_WAIT);
    expect(sealed.context).toEqual(PLAYER);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
    // THE LIMITATION, stated: this needs a writer that can reach store.commit (the archivist write authority). Section A shows that only
    // packages/engine and packages/protocol call it, section B that no shipped tool schema names a store, a commit or a coordinator, and
    // C and D that the tools which do reach a Temporal advance state their own fixed kind. It is NOT solved by any of that: a trusted writer, a
    // test, or a chain-valid hand-written journal (E1 case H1-F2) can still produce a player+literal record, which S1's live deny must refuse
    // and whose history S1 must preserve.
  });
});
