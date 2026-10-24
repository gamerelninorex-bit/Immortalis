// TEST SUPPORT for the original player-character authorship and first native ACTIVATION slice (`author-character`,
// `character-status`). The world and locus these tests start from are committed by the SHIPPED `establish-locality` path (an
// independent owner, with its own receipts), never by a fixture owner. Nothing here supplies the player's acceptance, a status or the
// expected binding: the scripted consoles only TYPE, in answer to the prompts and challenges the service printed, and the keep and
// placement phrases they type are the ones the service just printed.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  establish,
  openOrdinary,
  freshDirs,
  setupDoc,
  writeSetup,
  type LocalityDirs,
} from "./locality.ts";
import { SHIPPED_BIN, type ProcessRun } from "./operator.ts";
import { refereeCandidateItems, refereeTaskId, i002Context } from "@immortalis/engine";
import {
  authorCharacter,
  bindHost,
  pendingTasks,
  readTask,
  secretPath,
  submitDecision,
  type AuthorCharacterParams,
  type OperatorTerminal,
} from "@immortalis/operator";

export { LOCALITY_CAMPAIGN as CAMPAIGN, LOCUS_ID, WORLD_ID };
export const PC_ID = "pc-maren";

/** What the player types for the standard journey. The first identity is deliberately wrong in one material detail. */
export const WORDS = {
  identityFirst: "Maren Voss, a human salt-raker of about thirty winters",
  identityFinal: "Maren Voss, a human salt-raker of about forty winters",
  contact: "A weathered woman in a salt-stained coat who speaks the local tongue",
  embodiment: "One ordinary human body",
  continuity: "I remain myself for as long as I live; when my body dies I am dead.",
  possession: "A salt-raker's knife and a coil of rope",
  presence: "I have always lived here: I am originally present at the salt pans of Ashfall Marsh.",
} as const;

/** No classification prefix exists any more: the AI referee host classifies. Kept so scripts read the same. */
export const me = (text: string): string => text;

export const KEEP = { phrase: "keep-character" } as const;
export const PLACE = { phrase: "place-character" } as const;
export type Line =
  string | null | typeof KEEP | typeof PLACE | ((said: readonly string[]) => string | null);

const PHRASE = /To confirm, type exactly "([^"]+)"/;
const lastPhrase = (said: readonly string[], verb: string): string => {
  for (let i = said.length - 1; i >= 0; i--) {
    const m = PHRASE.exec(said[i]!);
    if (m && m[1]!.startsWith(`${verb} `)) return m[1]!;
  }
  throw new Error(`the service printed no ${verb} challenge before asking`);
};
const resolve = (line: Line, said: readonly string[]): string | null =>
  line === null
    ? null
    : typeof line === "string"
      ? line
      : typeof line === "function"
        ? line(said)
        : lastPhrase(said, line.phrase);

export interface ScriptedConsole extends OperatorTerminal {
  readonly said: string[];
  /** every line the console typed, in order */
  readonly typed: (string | null)[];
  readonly asked: () => number;
}

/** A console that types the given lines, in order, one per `ask`. KEEP/PLACE type the latest challenge of that verb. */
export function scriptedConsole(...script: Line[]): ScriptedConsole {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  let used = 0;
  return {
    said,
    typed,
    asked: () => used,
    say: (t) => {
      said.push(t);
    },
    ask: async () => {
      const line = script[used++];
      if (line === undefined) throw new Error("the service asked more than the test scripted");
      const out = resolve(line, said);
      typed.push(out);
      return out;
    },
    close: () => undefined,
  };
}

export interface Responder {
  /** lines typed at the `change>` prompt on the first Mirror decision (omit to keep the first display) */
  readonly revision?: readonly string[];
  readonly identity?: string;
  readonly presence?: string | null;
  /** type nothing but end of input at this prompt label */
  readonly eofAt?: string;
  /** answer a prompt label with a fixed line instead of the standard one */
  readonly override?: Readonly<Record<string, string | null>>;
  readonly skipPlace?: boolean;
  /** statements for the "differs from what would normally be expected" list, typed one per prompt */
  readonly exceptions?: readonly string[];
}

/**
 * A console that answers by what is being asked, so a rerun after an interruption (which asks for less) is answered the same way as a
 * first run. It types only what a person would: free text for the authoring prompts, and the exact phrase just printed for a keep or a
 * placement. `identity`/`presence` choose the free text; `revision` is the one change made at the first Mirror.
 */
export function respondingConsole(r: Responder = {}): ScriptedConsole {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  let used = 0;
  let contactDone = false;
  let revised = false;
  let editsSent = 0;
  let exceptionsSent = 0;
  const answer = (prompt: string): string | null => {
    const label = prompt.trim();
    if (r.eofAt === label) return null;
    if (r.override && label in r.override) return r.override[label]!;
    switch (label) {
      case "identity>":
        return me(r.identity ?? WORDS.identityFirst);
      case "contact>":
        if (contactDone) return "";
        contactDone = true;
        return me(WORDS.contact);
      case "embodiment>":
        return me(WORDS.embodiment);
      case "continuity>":
        return me(WORDS.continuity);
      case "exception>": {
        const list = r.exceptions ?? [];
        return exceptionsSent < list.length ? me(list[exceptionsSent++]!) : "";
      }
      case "open>":
      case "possession>":
        return "";
      case "presence>":
        return r.presence === undefined ? WORDS.presence : r.presence;
      case "change>": {
        const edits = r.revision ?? [];
        return editsSent < edits.length ? edits[editsSent++]! : "";
      }
      case ">": {
        let verb = "";
        for (let i = said.length - 1; i >= 0; i--) {
          const m = PHRASE.exec(said[i]!);
          if (m) {
            verb = m[1]!.split(" ")[0]!;
            break;
          }
        }
        if (verb === "keep-character") {
          if (r.revision && !revised) {
            revised = true;
            return "change";
          }
          return lastPhrase(said, "keep-character");
        }
        if (verb === "place-character")
          return r.skipPlace ? "no" : lastPhrase(said, "place-character");
        return "no";
      }
      default:
        throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
    }
  };
  return {
    said,
    typed,
    asked: () => used,
    say: (t) => {
      said.push(t);
    },
    ask: async (prompt) => {
      used++;
      const out = answer(prompt);
      typed.push(out);
      return out;
    },
    close: () => undefined,
  };
}

/** The whole standard journey: first display has the wrong age, one revision cycle corrects it and adds a possession, then keep. */
export const STANDARD: Responder = {
  revision: [`set identity ${me(WORDS.identityFinal)}`, `add possession ${me(WORDS.possession)}`],
};

/** A fresh campaign whose world, locus and finite source were committed by the shipped `establish-locality` path. */
export async function localityCampaign(
  mutate: (doc: ReturnType<typeof setupDoc>) => void = () => undefined,
): Promise<LocalityDirs> {
  const dirs = freshDirs();
  const doc = setupDoc();
  mutate(doc);
  const { result } = await establish(dirs, writeSetup(doc));
  if (result.status !== "LOCALITY_READY") throw new Error(`locality not ready: ${result.status}`);
  const bound = await bindHost({
    stateDir: dirs.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorUid: process.getuid!(),
    hostId: HOST_ID,
    operations: [
      "I002_CLASSIFY",
      "IR_NATIVE_COMPATIBILITY",
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
    ],
  });
  if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
  return dirs;
}

export const authorArgs = (dirs: LocalityDirs, over: string[] = [], pcId = PC_ID): string[] => [
  "author-character",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  "--world",
  WORLD_ID,
  "--locus",
  LOCUS_ID,
  "--player-character",
  pcId,
  ...over,
];

export const characterStatusArgs = (dirs: LocalityDirs, over: string[] = []): string[] => [
  "character-status",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  ...over,
];

export const HOST_ID = "scripted-test-host";

// -- a SCRIPTED referee host, for PLUMBING ONLY ------------------------------------------------------------------------------------
// It speaks the real file exchange (the same functions the stdio MCP server uses), with the real host secret, but its "judgments" are
// written by the TEST. It therefore demonstrates that the engine enforces what it derives, vouches for the host, refuses a forged or
// altered answer and recovers; it proves NOTHING about whether an AI understood any sentence. Live semantic evidence is separate.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Policy = (doc: Doc) => unknown | null;

const ADMITTED: Record<string, string> = {
  identity: "INTRINSIC_PC",
  embodiment: "INTRINSIC_PC",
  continuity: "INTRINSIC_PC",
  contact: "INTRINSIC_PC",
  no_contact: "INTRINSIC_PC",
  exception: "INTRINSIC_PC",
  possession: "ENTRY_ENVELOPE_FINITE",
  open: "UNRESOLVED_PC",
};

export interface ClassifyRule {
  /** a text the scripted host treats as NOT the player's own */
  readonly match: RegExp;
  readonly class: string;
}
export interface IrRule {
  /** the statement reads as this bridge when it matches */
  readonly bridge?: { readonly match: RegExp; readonly mode: string };
  /** a delivered fact text that matching contradicts the presence */
  readonly contradicts?: RegExp;
  /** a delivered fact text that makes the host unable to tell */
  readonly unclear?: RegExp;
}

export interface PhysicalRule {
  /** a character statement that, when matched, makes the scripted host read the form as this mode (default SINGLE_MATERIAL_BODY) */
  readonly embodiment?: { readonly match: RegExp; readonly mode: string };
  /** a statement text that, when matched, makes the scripted host read the presence as this mode (default NATIVE_AT_THIS_LOCUS) */
  readonly presence?: { readonly match: RegExp; readonly mode: string };
  /**
   * a statement text that, when matched, is a claim about something external. A CONTINGENT claim is one the presence is said to rest on;
   * a CONJUNCTIVE one is stated beside a presence its own words establish, and then `presenceQuote` selects ONLY those words.
   */
  readonly claim?: {
    readonly match: RegExp;
    readonly kind: string;
    readonly bearing: "CONTINGENT" | "CONJUNCTIVE";
    readonly presenceQuote?: RegExp;
  };
  /** a delivered fact text that, when matched, contradicts a material body being there */
  readonly contradicts?: RegExp;
  /** a delivered fact text that, when matched, leaves the host unable to tell */
  readonly unclear?: RegExp;
}

/** The scripted host's physical-placement answer (plumbing only): derived from the DELIVERED words by the test's rules, never a verdict. */
function physicalAnswer(doc: Doc, rule: PhysicalRule): unknown {
  const ctx = doc["context"];
  const pcItems: Doc[] = ctx.pc;
  const hitItem = rule.embodiment
    ? pcItems.find((i) => rule.embodiment!.match.test(i["text"]))
    : undefined;
  const item = hitItem ?? pcItems.find((i) => i["slot"] === "embodiment") ?? pcItems[0]!;
  const embMode = hitItem ? rule.embodiment!.mode : "SINGLE_MATERIAL_BODY";
  const presHit = rule.presence?.match.test(ctx.statement) ? rule.presence : undefined;
  const presMode = presHit ? presHit.mode : "NATIVE_AT_THIS_LOCUS";
  const dep = rule.claim?.match.test(ctx.statement) ? rule.claim : undefined;
  const unclearAny = ctx.facts.some((f: Doc) => rule.unclear?.test(f["text"]));
  const assessments = ctx.facts.map((f: Doc) => {
    if (rule.contradicts?.test(f["text"]))
      return {
        fact_id: f["fact_id"],
        relation: "CONTRADICTS",
        rule_ids: ["IR-7"],
        grounds: "scripted host: the fact excludes a material body there",
        evidence_quote: rule.contradicts.exec(f["text"])![0],
      };
    if (rule.unclear?.test(f["text"]))
      return {
        fact_id: f["fact_id"],
        relation: "UNCLEAR",
        rule_ids: ["IR-7"],
        grounds: "scripted host: cannot tell",
        evidence_quote: null,
      };
    return {
      fact_id: f["fact_id"],
      relation: "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "scripted host: does not bear on this",
      evidence_quote: null,
    };
  });
  const ambiguous = embMode === "AMBIGUOUS" || presMode === "AMBIGUOUS" || unclearAny;
  return {
    task_id: doc["task_id"],
    embodiment: {
      mode: embMode,
      item_id: item["item_id"],
      rule_ids: ["I002-4.3"],
      grounds: "scripted host: reading of the character's form",
      evidence_quote: hitItem ? rule.embodiment!.match.exec(item["text"])![0] : item["text"],
    },
    presence: {
      mode: presMode,
      rule_ids: ["IR-7"],
      grounds: "scripted host: reading of the presence",
      evidence_quote: presHit
        ? presHit.match.exec(ctx.statement)![0]
        : dep?.presenceQuote
          ? dep.presenceQuote.exec(ctx.statement)![0]
          : ctx.statement,
    },
    external_claims: dep
      ? [
          {
            kind: dep.kind,
            bearing: dep.bearing,
            rule_ids: ["IR-12"],
            grounds: "scripted host: a claim about something external",
            evidence_quote: dep.match.exec(ctx.statement)![0],
          },
        ]
      : [],
    assessments,
    clarification: ambiguous ? "Please say more." : null,
  };
}

/**
 * R-5 scripted reading of a CLARIFICATION scope (PLUMBING ONLY: it proves what the engine enforces, nothing about whether an AI
 * understood any sentence). By default the branch was unresolved and the words state only the duration of the baseline's actuator.
 */
export interface ClarifyRule {
  /** the baseline already states the answer / a prior closure exists */
  readonly branch?:
    "UNRESOLVED_BEFORE" | "ALREADY_STATED_IN_BASELINE" | "CONTRADICTS_PRIOR_CLOSURE";
  /** words matching this add or change a capability or an actuator */
  readonly adds?: RegExp;
  /** words matching this the host cannot place */
  readonly unclear?: RegExp;
}

function clarificationReading(ctx: Doc, rule: ClarifyRule): Doc {
  const text: string = ctx.candidate.map((c: Doc) => c["text"]).join(" ");
  const baseline: Doc =
    ctx.clarification.baseline.find((b: Doc) => /hand|grasp|lift|carry|gather/i.test(b["text"])) ??
    ctx.clarification.baseline[0];
  const adds = rule.adds?.test(text) ?? false;
  const unclear = !adds && (rule.unclear?.test(text) ?? false);
  return {
    branch: rule.branch ?? "UNRESOLVED_BEFORE",
    scope: adds
      ? "ADDS_OR_CHANGES_A_CAPABILITY_OR_ACTUATOR"
      : unclear
        ? "UNCLEAR"
        : "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
    baseline_ground: unclear ? null : String(baseline["text"]).slice(0, 500),
    candidate_ground: text.slice(0, 500),
    clarification: unclear ? "Which handling cycle do you mean?" : null,
  };
}

/** The scripted host's policy: ordinary answers unless a rule says otherwise. */
export function scriptedPolicy(
  rules: {
    classify?: readonly ClassifyRule[];
    ir?: IrRule;
    physical?: PhysicalRule;
    clarify?: ClarifyRule;
  } = {},
): Policy {
  return (doc) => {
    if (doc["operation"] === "IR_PHYSICAL_PLACEMENT")
      return physicalAnswer(doc, rules.physical ?? {});
    if (doc["operation"] === "I002_CLASSIFY") {
      return {
        task_id: doc["task_id"],
        ...(doc["context"].clarification
          ? { clarification: clarificationReading(doc["context"], rules.clarify ?? {}) }
          : {}),
        items: doc["context"].candidate.map((i: Doc) => {
          const hit = (rules.classify ?? []).find((r) => r.match.test(i["text"]));
          if (!hit)
            return {
              item_id: i["item_id"],
              slot: i["slot"],
              class: ADMITTED[i["slot"]],
              rule_ids: ["I002-7"],
              grounds: "scripted host: an ordinary character-local statement",
              evidence_quote: null,
              intrinsic_excerpt: null,
              other_classes: [],
              clarification: null,
            };
          const m = hit.match.exec(i["text"])![0];
          return {
            item_id: i["item_id"],
            slot: i["slot"],
            class: hit.class,
            rule_ids: ["I002-6.6"],
            grounds: "scripted host: asserts something beyond the character",
            evidence_quote: m,
            intrinsic_excerpt: null,
            other_classes: [],
            clarification: hit.class === "AMBIGUOUS" ? "Which do you mean?" : null,
          };
        }),
      };
    }
    const ctx = doc["context"];
    const ir = rules.ir ?? {};
    const bridge = ir.bridge && ir.bridge.match.test(ctx.statement) ? ir.bridge : undefined;
    const unclearAny = ctx.facts.some((f: Doc) => ir.unclear?.test(f["text"]));
    const assessments = ctx.facts.map((f: Doc) => {
      if (ir.contradicts?.test(f["text"]))
        return {
          fact_id: f["fact_id"],
          relation: "CONTRADICTS",
          rule_ids: ["IR-7"],
          grounds: "scripted host: the fact excludes the described character",
          evidence_quote: ir.contradicts.exec(f["text"])![0],
        };
      if (ir.unclear?.test(f["text"]))
        return {
          fact_id: f["fact_id"],
          relation: "UNCLEAR",
          rule_ids: ["IR-7"],
          grounds: "scripted host: cannot tell",
          evidence_quote: null,
        };
      return {
        fact_id: f["fact_id"],
        relation: "NOT_RELEVANT",
        rule_ids: ["IR-7"],
        grounds: "scripted host: does not bear on this",
        evidence_quote: null,
      };
    });
    return {
      task_id: doc["task_id"],
      reading: {
        mode: bridge ? bridge.mode : unclearAny ? "NATIVE_ALREADY_THERE" : "NATIVE_ALREADY_THERE",
        rule_ids: ["IR-3"],
        grounds: "scripted host: reading of the statement",
        evidence_quote: bridge ? bridge.match.exec(ctx.statement)![0] : ctx.statement,
      },
      assessments,
      clarification: unclearAny ? "Please say more." : null,
    };
  };
}

export const plainPolicy: Policy = scriptedPolicy();

export interface ScriptedHost {
  readonly answered: string[];
  stop(): Promise<void>;
}

/** Runs the scripted host concurrently: it answers each pending question through the real exchange until stopped. */
export function startScriptedHost(
  dirs: LocalityDirs,
  policy: Policy = plainPolicy,
  hostId = HOST_ID,
  claimedModel: string | null = "scripted-test-policy (NOT an AI)",
): ScriptedHost {
  const p = {
    stateDir: dirs.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorUid: process.getuid!(),
  };
  let stopped = false;
  const answered: string[] = [];
  const loop = (async () => {
    while (!stopped) {
      try {
        for (const t of await pendingTasks(p)) {
          const task = await readTask(p, t.task_id);
          if (!task.ok) continue;
          const answer = policy(task.value.document);
          if (answer === null) continue;
          const secret = readFileSync(secretPath(p, hostId), "utf8").trim();
          const w = await submitDecision(p, {
            host_id: hostId,
            secret,
            task_id: t.task_id,
            claimed_model: claimedModel,
            answer,
          });
          if (w.ok) answered.push(t.task_id);
        }
      } catch {
        // a directory that does not exist yet
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
  return {
    answered,
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

/** Drives the shipped command in-process with a console, a scripted host (plumbing only) and (optionally) a fault-injecting file system. */
export async function author(
  dirs: LocalityDirs,
  terminal: ScriptedConsole,
  over: Partial<AuthorCharacterParams> = {},
  host: Policy | null = plainPolicy,
) {
  const h = host ? startScriptedHost(dirs, host) : null;
  try {
    const result = await authorCharacter({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      worldId: WORLD_ID,
      locusId: LOCUS_ID,
      pcId: PC_ID,
      operatorDir: dirs.operatorDir,
      terminal,
      refereePolls: 400,
      refereePollMs: 10,
      ...over,
    });
    return { result, terminal, host: h };
  } finally {
    await h?.stop();
  }
}

/**
 * The shipped binary as a real process, typed at through its standard input: whenever the process is waiting at a prompt (its output
 * ends with "> "), the next entry is typed. KEEP/PLACE type the phrase of that verb the process most recently printed.
 */
export function runAuthor(
  args: string[],
  script: Line[],
  o: { killAfter?: RegExp; host?: { dirs: LocalityDirs; policy?: Policy } | null } = {},
): Promise<ProcessRun> {
  const dirIndex = args.indexOf("--operator-dir");
  const hostDirs =
    o.host === null
      ? null
      : (o.host?.dirs ??
        (dirIndex >= 0 ? ({ operatorDir: args[dirIndex + 1]! } as LocalityDirs) : null));
  const scripted = hostDirs ? startScriptedHost(hostDirs, o.host?.policy ?? plainPolicy) : null;
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", SHIPPED_BIN, ...args],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let answered = 0;
  let answeredAt = 0;
  let killed = false;
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  child.stdout.on("data", (d: Buffer) => {
    stdout += d.toString();
    if (o.killAfter && !killed && o.killAfter.test(stdout)) {
      killed = true;
      child.kill("SIGKILL");
      return;
    }
    if (stdout.length > answeredAt && stdout.endsWith("> ")) {
      answeredAt = stdout.length;
      const next = script[answered++];
      const said = stdout.split("\n");
      const line = next === undefined ? null : resolve(next, said);
      if (line === null) child.stdin.end();
      else child.stdin.write(`${line}\n`);
    }
  });
  if (script.length === 0 && o.killAfter === undefined) child.stdin.end();
  return new Promise((res) => {
    child.on("close", (code, signal) => {
      void (scripted?.stop() ?? Promise.resolve()).then(() =>
        res({ code, signal, stdout, stderr }),
      );
    });
  });
}

/** The script of the standard journey for a process (one entry per prompt, in the order the service asks). */
export const standardScript = (): Line[] => [
  me(WORDS.identityFirst),
  me(WORDS.contact),
  "",
  me(WORDS.embodiment),
  me(WORDS.continuity),
  "",
  "",
  "",
  "change",
  `set identity ${me(WORDS.identityFinal)}`,
  `add possession ${me(WORDS.possession)}`,
  "",
  KEEP,
  WORDS.presence,
  PLACE,
];

/**
 * What a finished campaign holds, without the publication identities (they are keyed by a per-keep secret, so two independent runs
 * of the same journey legitimately differ there): the owner facts' values, versions and keys, and the number of commits.
 */
export async function shapeOf(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return {
      revision: c.store.head().revision,
      facts: c.store
        .listFacts()
        .map((f) => ({
          key: f.key.replace(/^referee\/[0-9a-f]{64}\//, "referee/<task>/"),
          owner: f.owner,
          facet: f.facet,
          version: f.version,
          ...(f.owner === "referee_adjudication_kernel"
            ? {
                referee: [
                  (f.value as { operation: string }).operation,
                  (f.value as { verdict: string }).verdict,
                ],
              }
            : {}),
        }))
        // referee task identities differ between runs (they derive from keyed item identities), so order by the normalized key and then what the decision decides
        .sort(
          (a, b) =>
            a.key.localeCompare(b.key) ||
            JSON.stringify((a as { referee?: unknown }).referee).localeCompare(
              JSON.stringify((b as { referee?: unknown }).referee),
            ),
        ),
      character: c.playerCharacter(PC_ID)?.value,
      binding: c.binding()?.value,
    };
  } finally {
    await c.close();
  }
}

/** A scripted-host I-002 answer (plumbing only) for a contract, in the shape the keep record retains. */
export function keepRefereeFor(
  contract: Parameters<typeof refereeCandidateItems>[0] & { pc_id: string },
) {
  const items = refereeCandidateItems(contract);
  const ctx = i002Context({
    campaign_id: LOCALITY_CAMPAIGN,
    attempt: 0,
    pc_id: contract.pc_id,
    items,
  });
  const doc = { operation: "I002_CLASSIFY", task_id: refereeTaskId(ctx), context: ctx };
  return {
    host_id: HOST_ID,
    claimed_model: null,
    attempt: 0,
    answer: plainPolicy(doc) as never,
  };
}
