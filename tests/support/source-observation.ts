/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents and read raw scripted-host documents */
// TEST SUPPORT for the SOURCE-QUALIFIED original-PC observation (BLUE v5.2-A1). Every campaign these tests read is built ONLY by the shipped
// paths: `establish-locality` has the World-State owner commit the world, the locus AND the finite Source Condition (the source is genuinely
// upstream, owner-written canon, authored in the operator's setup file as setting prose and numbers: it states NO perception, receipt, packet
// content or expected verdict), `author-character` releases and binds the character, `establish-character-locus` has World-State commit the
// custody, and the Temporal owner establishes canonical time.
//
// The scripted referee host below is a policy the TEST wrote that reads the DELIVERED words by rule. It is PLUMBING ONLY: it proves the
// engine enforces what it derives (quotes, premise kinds, scope, withheld values), vouches for the host, refuses forgeries and recovers. It
// proves NOTHING about whether an AI perceives or understands any sentence: that is genuine AI-host semantic evidence and is NOT claimed
// by any test that uses this file.
import {
  BASIS,
  PC_ID,
  SCENE,
  PC_WORDS,
  observationCampaign,
  observe,
  type ObservationCampaign,
} from "./observation.ts";
import { plainPolicy, type Policy, type ScriptedConsole } from "./original-pc.ts";
import { LOCALITY_CAMPAIGN, SOURCE_KEY, type LocalityDirs } from "./locality.ts";
import type { ObserveSurroundingsParams } from "@immortalis/operator";

export { BASIS, LOCALITY_CAMPAIGN, PC_ID, SOURCE_KEY };

/**
 * The secrets of the source, authored by the operator in the setup file: an exact quantity, a material, a key and a quantity-bearing
 * establishment statement. The tests assert that none of them ever reaches the host's document or the player's packet.
 */
export const SECRET = {
  key: SOURCE_KEY,
  amount: 120,
  unit: "sack",
  material: "raw-salt",
  dimension: "surface-crust",
  statement: "The first pan holds exactly 120 sacks of raw salt.",
} as const;

/** The owner-authored access/appearance circumstance of the source: ONE physical sentence. The positive and the negative differ only here. */
export const EXPOSED =
  "A low heap of pale crystalline crust lies bare on the floor at the foot of the north wall, in full view of the bench, with nothing laid over it.";
export const BURIED =
  "A closed slab of grey stone lies over the whole pale crystalline crust at the foot of the north wall; no part of the crust shows above the slab.";
/** a source fact that states nothing about whether the feature can be seen */
export const SILENT = "A low heap of pale crystalline crust lies at the foot of the north wall.";

type Mutate = (doc: any) => void;

/** The alcove (geometry, light, air and an affirmative open path), and a source whose access fact is `access` (a fresh doc each call). */
export const sourceScene =
  (
    access: readonly { aspect: string; statement: string }[] = [
      { aspect: "exposure", statement: EXPOSED },
    ],
    extra: Mutate = () => undefined,
  ): Mutate =>
  (doc) => {
    doc.locus.designation = "A stone alcove";
    doc.locus.constraints = [
      { aspect: "geometry", statement: SCENE.geometry },
      { aspect: "light", statement: SCENE.light },
      { aspect: "air", statement: SCENE.air },
      { aspect: "path", statement: SCENE.path },
    ];
    doc.source.dimension = SECRET.dimension;
    doc.source.material_class = SECRET.material;
    doc.source.quantity = { amount: SECRET.amount, unit: SECRET.unit };
    doc.source.statement = SECRET.statement;
    doc.source.access_facts = access.map((a) => ({ ...a }));
    extra(doc);
  };

// -- the scripted host (plumbing only) ----------------------------------------------------------------------------------------------

export interface SrcRule {
  readonly noFaculty?: boolean;
  readonly noPosition?: boolean;
  readonly pathUnknown?: boolean;
  /** state an appearance even when the answer is not an affirmative one (to exercise the engine's refusal) */
  readonly forcePayload?: boolean;
  /** the appearance text, in place of the neutral one */
  readonly referent?: string;
  readonly content?: string;
  /** the appearance is stated to be of this delivered fact, whatever it quotes */
  readonly ofFact?: string;
  /** a quotation the appearance is anchored to, in place of the source fact's own */
  readonly contradicts?: RegExp;
}

const quote = (text: string, re: RegExp): string => re.exec(text)![0];
const SIGHT = /ordinary, fully functioning colour vision/;
const POSE = /seated on the wooden viewing bench, facing the north wall with my eyes open/;
const OPEN = /Nothing solid stands between the bench and the north wall/;
const COVER = /closed slab of grey stone lies over the whole/;
const SCREEN = /continuous opaque wooden screen/;
const SHOWN = /lies bare on the floor at the foot of the north wall/;

export const NEUTRAL_REFERENT = "a low pale heap at the foot of the north wall";
export const NEUTRAL_CONTENT = "a low heap of pale, crystalline crust lying bare on the floor";

/** The scripted host's direct-perception answer to a (source-scoped or ordinary) question, by rules over the DELIVERED words. */
export function sourceAnswer(doc: Record<string, any>, rule: SrcRule = {}): unknown {
  const ctx = doc["context"];
  const facts: any[] = ctx.facts;
  const sight = ctx.pc.find((i: any) => SIGHT.test(i.text));
  const posed = POSE.test(ctx.statement);
  const cover = facts.find((f) => COVER.test(f.text) || SCREEN.test(f.text));
  const open = facts.find((f) => OPEN.test(f.text));
  const shown = facts.find((f) => f.fact_id.startsWith("source.") && SHOWN.test(f.text));
  const anySource = facts.find((f) => f.fact_id.startsWith("source."));
  const facultyOk = !rule.noFaculty && sight !== undefined;
  const positionOk = !rule.noPosition && posed;
  const base = { rule_ids: ["F014D-6"], grounds: "scripted host: reading of the delivered words" };
  const faculty = {
    ...base,
    state: facultyOk ? "ESTABLISHED" : "NOT_ESTABLISHED",
    premises: facultyOk
      ? [{ from: "PC_STATEMENT", ref: sight.item_id, evidence_quote: quote(sight.text, SIGHT) }]
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
            evidence_quote: quote(ctx.statement, POSE),
          },
        ]
      : [],
  };
  const pathOf = (): any => {
    if (rule.pathUnknown) return { ...base, state: "NOT_ESTABLISHED", premises: [] };
    if (cover)
      return {
        ...base,
        state: "BLOCKED",
        premises: [
          {
            from: "WORLD_FACT",
            ref: cover.fact_id,
            evidence_quote: quote(cover.text, COVER.test(cover.text) ? COVER : SCREEN),
          },
        ],
      };
    if (open)
      return {
        ...base,
        state: "OPEN",
        premises: [
          { from: "WORLD_FACT", ref: open.fact_id, evidence_quote: quote(open.text, OPEN) },
        ],
      };
    return { ...base, state: "NOT_ESTABLISHED", premises: [] };
  };
  const path = pathOf();
  const contradicted = facts.some((f) => rule.contradicts?.test(f.text));
  // what the scripted host would state an appearance of: the fact it was told to (`ofFact`), else the source fact that says it lies in view
  const wanted = rule.ofFact ? facts.find((f) => f.fact_id === rule.ofFact) : shown;
  const affirmative =
    facultyOk && positionOk && path.state === "OPEN" && wanted !== undefined && !contradicted;
  const target = wanted ?? anySource ?? facts.find((f) => f.fact_id === "locus.designation");
  const payload =
    (affirmative || rule.forcePayload) && target
      ? {
          source_fact_id: target.fact_id,
          referent: rule.referent ?? NEUTRAL_REFERENT,
          content: rule.content ?? NEUTRAL_CONTENT,
          basis: [
            {
              from: "WORLD_FACT",
              ref: target.fact_id,
              evidence_quote: target.text.slice(0, Math.min(40, target.text.length)),
            },
          ],
        }
      : null;
  const relevant = new Set([cover, open, shown].filter(Boolean).map((f) => f.fact_id));
  const quoteFor = (f: any): string | null =>
    f === cover
      ? quote(f.text, COVER.test(f.text) ? COVER : SCREEN)
      : f === open
        ? quote(f.text, OPEN)
        : f === shown
          ? quote(f.text, SHOWN)
          : null;
  const assessments = facts.map((f) => {
    if (rule.contradicts?.test(f.text))
      return {
        fact_id: f.fact_id,
        relation: "CONTRADICTS",
        rule_ids: ["IR-7"],
        grounds: "scripted host: the fact excludes the perception",
        evidence_quote: quote(f.text, rule.contradicts),
      };
    const isRelevant = relevant.has(f.fact_id);
    return {
      fact_id: f.fact_id,
      relation: isRelevant ? "SUPPORTS" : "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "scripted host: reading of the fact",
      evidence_quote: isRelevant ? quoteFor(f) : null,
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

export const sourcePolicy =
  (rule: SrcRule = {}): Policy =>
  (doc) =>
    doc["operation"] === "F014D_DIRECT_PERCEPTION" ? sourceAnswer(doc, rule) : plainPolicy(doc);

// -- the campaign --------------------------------------------------------------------------------------------------------------------

export interface SourceCampaignOptions {
  readonly access?: readonly { aspect: string; statement: string }[];
  readonly words?: { embodiment?: string; presence?: string };
  readonly extra?: Mutate;
  readonly time?: boolean;
}

/** An original character in a world whose locus holds ONE genuinely owner-authored finite source, canonical time established. */
export function sourceCampaign(o: SourceCampaignOptions = {}): Promise<ObservationCampaign> {
  return observationCampaign({
    scene: sourceScene(o.access, o.extra),
    ...(o.words ? { words: o.words } : {}),
    ...(o.time !== undefined ? { time: o.time } : {}),
  });
}

/** `observe-surroundings --source`, driven in-process with the scripted host (plumbing only). */
export const observeSource = (
  dirs: LocalityDirs,
  terminal?: ScriptedConsole,
  rule: SrcRule | null = {},
  over: Partial<ObserveSurroundingsParams> = {},
) =>
  observe(
    dirs,
    terminal,
    { sourceKey: SOURCE_KEY, ...over },
    rule === null ? null : sourcePolicy(rule),
  );

export { PC_WORDS };

// -- a REAL later mutation of the source, by the owners' own drawdown path (never a hand-edited fact) --------------------------------

import {
  CanonicalCampaign,
  ProductionAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
} from "@immortalis/engine";
import {
  PRODUCTION_FIXTURE_EXTENSION,
  SRC_RESERVE,
  basisInput,
  drawdownAdvanceRequest,
  drawdownProviders,
  drawdownPublication,
  prodPublication,
  productionRequest,
  requestGroup,
  reserveRawInput,
  startExtractionInput,
  temporalPublication,
} from "@immortalis/testkit";
import { at } from "./gip-sunset.ts";
import { LOCUS_ID, WORLD_ID } from "./locality.ts";
import { must } from "./temporal.ts";

export interface Draw {
  /** a distinct number per drawdown in one campaign (it keys the fixture's publication identities) */
  readonly n: number;
  readonly amount: number;
  readonly boundary: number;
  readonly target: number;
  /** the first drawdown of a campaign also establishes Production's basis and the destination Reserve */
  readonly first?: boolean;
}

/**
 * Draws `amount` from the campaign's source through the real chain: the synthetic requester's request, Production's own basis, a started
 * extraction, and — as the Temporal kernel resolves its declared boundary — Production's Source Delta, World-State's delivery (the net
 * Source Condition, and PHYSICAL exhaustion when nothing remains) and Production's Reserve inflow. The source's committed fact changes
 * version only by that delivery, and canonical time moves to `target`.
 */
export async function drawFromSource(dirs: LocalityDirs, d: Draw): Promise<void> {
  const c = await must(
    Promise.resolve(
      CanonicalCampaign.open(dirs.campaignDir, {
        buildId: "source-observation-drawdown",
        extension: PRODUCTION_FIXTURE_EXTENSION,
      }),
    ),
  );
  try {
    const store = c.store;
    const campaignId = store.head().campaign_id;
    const requestId = `req-${d.n}`;
    const scope = {
      world: { fact_key: `world/${WORLD_ID}/profile`, entity_id: WORLD_ID },
      locus: { fact_key: `world/${WORLD_ID}/locus/${LOCUS_ID}`, entity_id: LOCUS_ID },
    };
    await must(
      store.commit(
        requestGroup(
          campaignId,
          d.n,
          requestId,
          productionRequest(requestId, {
            requested_output: {
              output_class: SECRET.material,
              quantity: { amount: d.amount, unit: SECRET.unit },
            },
            scope,
          }),
        ),
      ),
    );
    const drawdown = new SourceDrawdownAdapter(store);
    if (d.first) {
      await must(
        drawdown.establishBasis({
          ...drawdownPublication(1),
          extraction_basis: basisInput({
            world_id: WORLD_ID,
            source_key: SOURCE_KEY,
            material_class: SECRET.material,
            unit: SECRET.unit,
            relies_on: { aspect: "exposure", statement: EXPOSED },
          }),
        }),
      );
      await must(
        new ProductionAdapter(store).establishReserve({
          ...prodPublication(1),
          reserve: {
            ...reserveRawInput(),
            material_class: SECRET.material,
            quantity: { amount: 0, unit: SECRET.unit },
            world_id: WORLD_ID,
            locus_id: LOCUS_ID,
          },
        }),
      );
    }
    await must(
      drawdown.startExtraction({
        ...drawdownPublication(10 + d.n),
        start: startExtractionInput(`synthetic-request/${requestId}`, {
          world_id: WORLD_ID,
          source_key: SOURCE_KEY,
          reserve_id: SRC_RESERVE,
          boundary_at: at(d.boundary),
        }),
      }),
    );
    const coordinator = new TemporalCoordinator(store, drawdownProviders());
    await must(
      coordinator.registerObject({
        ...temporalPublication(20 + d.n),
        object: drawdown.temporalObject(requestId)!,
      }),
    );
    await must(coordinator.advance(drawdownAdvanceRequest(`adv-${d.n}`, at(d.target))));
  } finally {
    await c.close();
  }
}
