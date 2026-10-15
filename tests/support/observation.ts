/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents and read raw scripted-host documents */
// TEST SUPPORT for the active-PC DIRECT PHYSICAL OBSERVATION (BLUE v5.2). The campaigns these tests read are built ONLY by the shipped
// paths: `establish-locality` commits the world and locus (the physical scene is authored there, as setting prose, and states NO
// perception, receipt, packet content or expected verdict), `author-character` releases and binds the character, `establish-character-
// locus` has World-State commit the qualified custody, and the Temporal owner establishes canonical time. The scripted referee host is a
// policy the TEST wrote that reads the DELIVERED words (PLUMBING ONLY: it proves nothing about whether any AI understood any sentence;
// the semantic positive and negative are the real-host exercise under docs/evidence).
import { expect } from "vitest";
import { CanonicalCampaign, StageProviderRegistry, TemporalCoordinator } from "@immortalis/engine";
import { observeSurroundings, type ObserveSurroundingsParams } from "@immortalis/operator";
import { at } from "./gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "./locality.ts";
import {
  PC_ID,
  STANDARD,
  plainPolicy,
  startScriptedHost,
  type Policy,
  type Responder,
  type ScriptedConsole,
} from "./original-pc.ts";
import { boundCampaign, establishLocus, locusConsole } from "./original-pc-locus.ts";
import { must } from "./temporal.ts";
import { temporalPublication } from "@immortalis/testkit";

export { PC_ID, LOCALITY_CAMPAIGN };

/** The canonical basis the Temporal owner is established at (fixture time unit); an observation never moves it. */
export const BASIS = at(100);

// -- the physical scene: setting prose only (no perception, receipt, packet content or expected verdict is stated anywhere) ----------

export const SCENE = {
  geometry:
    "The alcove is a stone room four paces wide. A wooden viewing bench stands against its south wall, facing the north wall three paces away.",
  surface:
    "The north wall is whitewashed plaster with one broad patch of bright red paint, about an arm-span wide, at the height of a seated person's eyes.",
  light:
    "Ordinary terrestrial daylight enters through a high window in the east wall and lights the north wall evenly.",
  air: "The air between the bench and the north wall is clear: there is no smoke, mist or dust in it.",
} as const;

/** The ONLY difference of the independent negative scene: a physical obstruction across the path, with no alternate optical route. */
export const SCREEN =
  "A continuous opaque wooden screen stands across the full width and height of the alcove between the bench and the north wall; it has no gap, and no other opening leads from the bench to the north wall.";

export const PC_WORDS = {
  embodiment: "One ordinary human body with ordinary, fully functioning colour vision",
  presence:
    "I have always lived here: I am originally present in the stone alcove, seated on the wooden viewing bench, facing the north wall with my eyes open.",
  /** a placement that states neither a direction nor open eyes */
  presenceBare: "I have always lived here: I am originally present in the stone alcove.",
  /** a body with no stated sight */
  embodimentBare: "One ordinary human body",
} as const;

type Mutate = (doc: any) => void;

export const redScene =
  (extra: readonly string[] = []): Mutate =>
  (doc) => {
    doc.locus.designation = "A stone alcove";
    doc.locus.constraints = [
      { aspect: "geometry", statement: SCENE.geometry },
      { aspect: "surface", statement: SCENE.surface },
      { aspect: "light", statement: SCENE.light },
      { aspect: "air", statement: SCENE.air },
      ...extra.map((statement, i) => ({ aspect: `obstruction-${i + 1}`, statement })),
    ];
  };

export const screenScene = (): Mutate => redScene([SCREEN]);

export const responderOf = (words: { embodiment?: string; presence?: string } = {}): Responder => ({
  ...STANDARD,
  presence: words.presence ?? PC_WORDS.presence,
  override: { "embodiment>": words.embodiment ?? PC_WORDS.embodiment },
});

// -- a SCRIPTED observation host (plumbing only) ---------------------------------------------------------------------------------

export interface ObsRule {
  /** do not establish the faculty (the scripted host cites no sight statement) */
  readonly noFaculty?: boolean;
  /** do not establish the position */
  readonly noPosition?: boolean;
  /** report the path as not established whatever the world says */
  readonly pathUnknown?: boolean;
  /** state an appearance even when the answer is not an affirmative one (to exercise the engine's refusal) */
  readonly forcePayload?: boolean;
  /** an appearance text that carries an engine reference */
  readonly leak?: string;
  /** a different appearance for the same question (a second, different reading) */
  readonly appearance?: string;
  /** a fact whose text, when matched, the scripted host contradicts */
  readonly contradicts?: RegExp;
}

const quoteOf = (text: string, re: RegExp): string => re.exec(text)![0];

/** The scripted host's direct-perception answer: derived from the DELIVERED words by the test's rules, never a verdict. */
export function observationAnswer(doc: Record<string, any>, rule: ObsRule = {}): unknown {
  const ctx = doc["context"];
  const facts: any[] = ctx.facts;
  const pcSight = ctx.pc.find((i: any) => /colour vision/.test(i.text));
  const pose = /seated on the wooden viewing bench, facing the north wall with my eyes open/.test(
    ctx.statement,
  );
  const screen = facts.find((f) => /continuous opaque wooden screen/.test(f.text));
  const air = facts.find((f) =>
    /The air between the bench and the north wall is clear/.test(f.text),
  );
  const surface = facts.find((f) => /one broad patch of bright red paint/.test(f.text));
  const facultyOk = !rule.noFaculty && pcSight !== undefined;
  const positionOk = !rule.noPosition && pose;
  const base = { rule_ids: ["F014D-6"], grounds: "scripted host: reading of the delivered words" };
  const faculty = {
    ...base,
    state: facultyOk ? "ESTABLISHED" : "NOT_ESTABLISHED",
    premises: facultyOk
      ? [
          {
            from: "PC_STATEMENT",
            ref: pcSight.item_id,
            evidence_quote: quoteOf(pcSight.text, /ordinary, fully functioning colour vision/),
          },
        ]
      : [],
  };
  const position = {
    ...base,
    state: positionOk ? "ESTABLISHED" : "NOT_ESTABLISHED",
    premises: positionOk
      ? [
          {
            from: "PLACEMENT_STATEMENT",
            ref: "placement.statement",
            evidence_quote: quoteOf(
              ctx.statement,
              /seated on the wooden viewing bench, facing the north wall with my eyes open/,
            ),
          },
        ]
      : [],
  };
  const path =
    screen && !rule.pathUnknown
      ? {
          ...base,
          state: "BLOCKED",
          premises: [
            {
              from: "WORLD_FACT",
              ref: screen.fact_id,
              evidence_quote: quoteOf(screen.text, /continuous opaque wooden screen/),
            },
          ],
        }
      : air && !rule.pathUnknown
        ? {
            ...base,
            state: "OPEN",
            premises: [
              {
                from: "WORLD_FACT",
                ref: air.fact_id,
                evidence_quote: quoteOf(
                  air.text,
                  /The air between the bench and the north wall is clear/,
                ),
              },
            ],
          }
        : { ...base, state: "NOT_ESTABLISHED", premises: [] };
  const contradicted = facts.some((f) => rule.contradicts?.test(f.text));
  const affirmative =
    facultyOk && positionOk && path.state === "OPEN" && surface !== undefined && !contradicted;
  const payload =
    (affirmative || rule.forcePayload) && surface
      ? {
          source_fact_id: surface.fact_id,
          referent: rule.leak ?? "a patch on the wall facing the character",
          content: rule.appearance ?? "a broad patch of bright red on pale plaster",
          basis: [
            {
              from: "WORLD_FACT",
              ref: surface.fact_id,
              evidence_quote: quoteOf(surface.text, /one broad patch of bright red paint/),
            },
          ],
        }
      : null;
  const assessments = facts.map((f) => {
    if (rule.contradicts?.test(f.text))
      return {
        fact_id: f.fact_id,
        relation: "CONTRADICTS",
        rule_ids: ["IR-7"],
        grounds: "scripted host: the fact excludes the perception",
        evidence_quote: quoteOf(f.text, rule.contradicts),
      };
    const relevant = f === screen || f === air || f === surface;
    return {
      fact_id: f.fact_id,
      relation: relevant ? "SUPPORTS" : "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "scripted host: reading of the fact",
      evidence_quote: relevant
        ? f === screen
          ? quoteOf(f.text, /continuous opaque wooden screen/)
          : f === air
            ? quoteOf(f.text, /The air between the bench and the north wall is clear/)
            : quoteOf(f.text, /one broad patch of bright red paint/)
        : null,
    };
  });
  return {
    task_id: doc["task_id"],
    faculty,
    position,
    path,
    payload,
    assessments,
    unresolved_forks: [],
  };
}

/** The scripted host's policy: the ordinary answers for the earlier questions, the scripted direct-perception answer for this one. */
export const observationPolicy =
  (rule: ObsRule = {}): Policy =>
  (doc) =>
    doc["operation"] === "F014D_DIRECT_PERCEPTION"
      ? observationAnswer(doc, rule)
      : plainPolicy(doc);

// -- the campaign --------------------------------------------------------------------------------------------------------------------

export interface ObservationCampaign {
  readonly dirs: LocalityDirs;
}

/**
 * An original character, authored, bound and given its qualified physical locus through the shipped commands, in a world whose locus is
 * the authored scene; canonical time established at BASIS (the Temporal owner's own establishment). Nothing observed yet.
 */
export async function observationCampaign(
  o: {
    scene?: Mutate;
    words?: { embodiment?: string; presence?: string };
    time?: boolean;
  } = {},
): Promise<ObservationCampaign> {
  const dirs = await boundCampaign({
    mutate: o.scene ?? redScene(),
    responder: responderOf(o.words),
  });
  const located = await establishLocus(dirs, locusConsole());
  expect(located.result.status, JSON.stringify(located.result.details)).toBe("LOCUS_ESTABLISHED");
  if (o.time !== false) await establishTime(dirs);
  return { dirs };
}

/** The Temporal owner establishes the campaign's canonical basis. */
export async function establishTime(dirs: LocalityDirs, time = BASIS): Promise<void> {
  const campaign: CanonicalCampaign = await openOrdinary(dirs.campaignDir);
  try {
    await must(
      new TemporalCoordinator(campaign.store, new StageProviderRegistry()).establishCanonicalTime({
        ...temporalPublication(1),
        time,
      }),
    );
  } finally {
    await campaign.close();
  }
}

/** A console that types the confirmation phrase the service just printed for `verb` (or declines). */
export function verbConsole(verb: string, confirm = true): ScriptedConsole {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  let used = 0;
  const PHRASE = /To confirm, type exactly "([^"]+)"/;
  return {
    said,
    typed,
    asked: () => used,
    say: (t) => {
      said.push(t);
    },
    ask: async (prompt) => {
      used++;
      if (prompt.trim() !== ">") throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
      let line = "no";
      if (confirm)
        for (let i = said.length - 1; i >= 0; i--) {
          const m = PHRASE.exec(said[i]!);
          if (m && m[1]!.startsWith(`${verb} `)) {
            line = m[1]!;
            break;
          }
        }
      typed.push(line);
      return line;
    },
    close: () => undefined,
  };
}

/** Drives the shipped `observe-surroundings` in-process with a console, a scripted host (plumbing only) and optional fault seams. */
export async function observe(
  dirs: LocalityDirs,
  terminal: ScriptedConsole = verbConsole("observe-surroundings"),
  over: Partial<ObserveSurroundingsParams> = {},
  host: Policy | null = observationPolicy(),
) {
  const h = host ? startScriptedHost(dirs, host) : null;
  try {
    const result = await observeSurroundings({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
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

export const observeArgs = (dirs: LocalityDirs, over: string[] = [], pcId = PC_ID): string[] => [
  "observe-surroundings",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  "--player-character",
  pcId,
  ...over,
];

// -- direct engine access, for the mechanism tests (the shipped command is the production path; these exercise the owners' own refusals) --

import { REFEREE_AUTHORITY } from "@immortalis/contracts";
import { RefereeAdjudicationAdapter } from "@immortalis/engine";

/**
 * Retains a direct-perception decision through the engine's own adapter, answering from the DELIVERED words by the scripted rules
 * (plumbing only). The context is the engine's: the caller names the character and the attempt.
 */
export async function decide(
  campaign: CanonicalCampaign,
  rule: ObsRule = {},
  attempt = 0,
  pcId = PC_ID,
) {
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const task = adapter.observationTask({ pc_id: pcId, attempt });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const answer = observationAnswer(
    { task_id: task.value.task_id, context: task.value.context },
    rule,
  );
  const recorded = await adapter.recordObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: pcId,
    attempt,
    answer,
  });
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error));
  return { ...recorded.value, adapter, context: task.value.context };
}
