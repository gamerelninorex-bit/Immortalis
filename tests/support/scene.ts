/* eslint-disable @typescript-eslint/no-explicit-any -- scripted host documents are untyped JSON */
// TEST SUPPORT for the GM scene step of a natural look (GM-led first play). MECHANISM ONLY: the "Game Master" here is a script whose rules
// the test wrote; it demonstrates what the engine ENFORCES about an answer (verbatim anchoring, kinds of premise, withheld values, the derived
// verdict), never that any AI host reads a request as a Game Master would. Genuine-host behaviour is UNRUN.
import { REFEREE_OP_SCENE } from "@immortalis/contracts";
import { bindHost } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN } from "./locality.ts";
import { observationAnswer, redScene, type ObsRule } from "./observation.ts";
import { startScriptedHost, type Policy, type ScriptedHost } from "./original-pc.ts";

export const SCENE_HOST = "gm-scene";

/** The pale granular loose material of the fixture: the ONLY world statement an appearance may be resolved from. */
export const GRANULES =
  "The loose material that lies on the flat is pale, dry and granular: small crystals that cling together in loose lumps.";

/** The fixture setting with a world-authored statement of how the loose material looks (an appearance's branch-invariant ground). */
export const withGranules =
  (extra: readonly string[] = []) =>
  (doc: any): void => {
    redScene(extra)(doc);
    doc.locus.constraints.push({ aspect: "loose material", statement: GRANULES });
  };

/** The operator's step: a separate, least-privilege host bound for the scene operation only. */
export async function bindScene(
  operatorDir: string,
  hostId: string = SCENE_HOST,
  campaignId: string = LOCALITY_CAMPAIGN,
): Promise<void> {
  const bound = await bindHost({
    stateDir: operatorDir,
    campaignId,
    operatorUid: process.getuid!(),
    hostId,
    operations: [REFEREE_OP_SCENE] as any,
  });
  if (!bound.ok) throw new Error(`scene host not bound: ${bound.error.code}`);
}

export function startScene(
  operatorDir: string,
  policy: Policy,
  hostId: string = SCENE_HOST,
): ScriptedHost {
  return startScriptedHost({ operatorDir } as any, policy, hostId);
}

export interface SceneRule {
  /** WORDS that carry a materially new commitment (default: a movement, an opening, a taking) */
  readonly material?: RegExp;
  /** the character's own words veto any look (a stated blindness) */
  readonly vetoes?: RegExp;
  /** rest the ruling on the request alone (no premise of the character): to exercise the engine's refusal */
  readonly requestOnly?: boolean;
  /** state the viewing circumstance with this text (e.g. one that carries an engine reference) */
  readonly statement?: string;
  /** do not resolve the appearance whatever the world says */
  readonly unresolvedAppearance?: boolean;
  /** state this as the appearance instead of the world's (e.g. one that carries a count or the material) */
  readonly appearance?: string;
  /** a different, equally valid ordinary reading of the same look (a second reading of one question) */
  readonly viewing?: string;
}

const MATERIAL =
  /\b(climb|clamber|leap|jump|run|sprint|walk|step|approach|enter|unlock|open the|break|take|pick up|lift|grab)\b/i;
const quoteOf = (text: string, re: RegExp): string => re.exec(text)![0];
const NOT_RELEVANT = (f: any) => ({
  fact_id: f.fact_id,
  relation: "NOT_RELEVANT",
  rule_ids: ["IR-7"],
  grounds: "scripted host: does not bear on this",
  evidence_quote: null,
});

/** The scripted Game Master's scene ruling: derived from the DELIVERED words by the test's rules, never a verdict. */
export function sceneAnswer(doc: Record<string, any>, rule: SceneRule = {}): unknown {
  const ctx = doc["context"];
  const facts: any[] = ctx.facts;
  const assessments = facts.map(NOT_RELEVANT);
  const common = { task_id: doc["task_id"], assessments, unresolved_forks: [] as unknown[] };
  if (ctx.kind === "OUTPUT_APPEARANCE") {
    const outcome = facts.find((f) => f.fact_id === "outcome.collection");
    const granules = facts.find((f) => /pale, dry and granular/.test(f.text));
    const resolved = outcome && granules && !rule.unresolvedAppearance;
    return {
      ...common,
      kind: "OUTPUT_APPEARANCE",
      viewing: null,
      appearance: resolved
        ? {
            state: "RESOLVED",
            aspects: [
              {
                aspect: "colour and grain",
                statement:
                  rule.appearance ??
                  "pale, dry, granular crystals that cling together in loose lumps",
              },
            ],
            basis: [
              {
                from: "WORLD_FACT",
                ref: outcome.fact_id,
                evidence_quote: quoteOf(outcome.text, /has been completed/),
              },
              {
                from: "WORLD_FACT",
                ref: granules.fact_id,
                evidence_quote: quoteOf(granules.text, /pale, dry and granular/),
              },
            ],
            rule_ids: ["WG-RESOLUTION"],
            grounds: "scripted host: the world states how the loose material looks",
          }
        : {
            state: "NOT_RESOLVED",
            aspects: [],
            basis: [],
            rule_ids: ["WG-RESOLUTION"],
            grounds: "scripted host: the world states nothing of how the loose material looks",
          },
    };
  }
  const asked: string | null = ctx.request.statement;
  if (asked !== null) {
    // the player's WORDS are only CLASSIFIED; the physical circumstance is the basis's own, separate question
    const material = (rule.material ?? MATERIAL).test(asked);
    return {
      ...common,
      kind: "CURRENT_VIEWING",
      viewing: {
        request: {
          classification: material ? "MATERIAL_NEW_COMMITMENT" : "ORDINARY_LOOK",
          rule_ids: ["I001-8"],
          grounds: material
            ? "scripted host: the request names a movement or an act beyond routine attention"
            : "scripted host: routine attention, turning and opening of the eyes",
          evidence_quote: material ? quoteOf(asked, rule.material ?? MATERIAL) : asked,
        },
        state: "NOT_ESTABLISHED",
        premises: [],
        rule_ids: ["I001-8"],
        grounds:
          "scripted host: the words are classified; the physical circumstance is ruled separately",
        statement: null,
      },
      appearance: null,
    };
  }
  const request = {
    classification: "ORDINARY_LOOK",
    rule_ids: ["I001-8"],
    grounds: "scripted host: a bare look is routine attention, turning and opening of the eyes",
    evidence_quote: null,
  };
  const body = ctx.pc.find((i: any) => /ordinary human body/.test(i.text));
  const veto = rule.vetoes ? ctx.pc.find((i: any) => rule.vetoes!.test(i.text)) : undefined;
  const premise = (item: any, re: RegExp) => ({
    from: "PC_STATEMENT",
    ref: item.item_id,
    evidence_quote: quoteOf(item.text, re),
  });
  let viewing: any;
  if (veto)
    viewing = {
      request,
      state: "NOT_SUPPORTED",
      premises: [premise(veto, rule.vetoes!)],
      rule_ids: ["I001-8", "F014D-21"],
      grounds: "scripted host: the character's own words veto any look",
      statement: null,
    };
  else
    viewing = {
      request,
      state: "SUPPORTED",
      premises: rule.requestOnly
        ? facts.slice(0, 1).map((f) => ({
            from: "WORLD_FACT",
            ref: f.fact_id,
            evidence_quote: f.text.slice(0, 12),
          }))
        : body
          ? [premise(body, /ordinary human body/)]
          : [],
      rule_ids: ["I001-8", "F014D-21"],
      grounds: "scripted host: an ordinary look is routine attention, turning and opening the eyes",
      statement:
        rule.statement ??
        rule.viewing ??
        "The character's attention can turn, and their eyes can open and rest on what lies before them: nothing prevents an ordinary look now.",
    };
  return { ...common, kind: "CURRENT_VIEWING", viewing, appearance: null };
}

/** The scene host's policy: scene rulings only (every other question is for the setup and collection hosts). */
export const scenePolicy =
  (rule: SceneRule = {}): Policy =>
  (doc) =>
    doc["operation"] === REFEREE_OP_SCENE ? sceneAnswer(doc, rule) : null;

export interface PerceptionRule extends ObsRule {
  /** reason from the confirmed placement alone, ignoring the owner-published viewing circumstance (to exercise the engine's refusal) */
  readonly ignoreViewing?: boolean;
}

const sentence = (text: string): string => /^[^.]+\./.exec(text)?.[0].trim() ?? text.trim();

/**
 * The scripted direct-perception reading that CONSUMES what the owners published: the position rests on the owner-published current
 * viewing circumstance, and the appearance stated is of the owner-resolved appearance of the gathered output. Where nothing was
 * published it is the earlier scripted reading, unchanged.
 */
export function perceptionAnswer(doc: Record<string, any>, rule: PerceptionRule = {}): any {
  const base: any = observationAnswer(doc, rule);
  const facts: any[] = doc["context"].facts;
  const viewing = facts.find((f) => f.fact_id === "viewing.current");
  const seen = facts.filter((f) => String(f.fact_id).startsWith("appearance."));
  if (viewing && !rule.ignoreViewing)
    base.position = {
      rule_ids: ["F014D-6"],
      grounds: "scripted host: the owner published the circumstance of this look",
      state: "ESTABLISHED",
      premises: [
        { from: "CURRENT_VIEWING", ref: viewing.fact_id, evidence_quote: sentence(viewing.text) },
      ],
    };
  const affirmative =
    base.faculty.state === "ESTABLISHED" &&
    base.position.state === "ESTABLISHED" &&
    base.path.state === "OPEN" &&
    !rule.noFaculty &&
    !rule.noPosition;
  if (!affirmative || rule.forcePayload) {
    if (!rule.forcePayload) base.payload = null;
    return base;
  }
  if (seen.length > 0) {
    const text = String(seen[0].text);
    base.payload = {
      source_fact_id: seen[0].fact_id,
      referent: "what the character gathered",
      content: text.slice(text.indexOf(": ") + 2),
      basis: [
        {
          from: "WORLD_FACT",
          ref: seen[0].fact_id,
          evidence_quote: text.slice(text.indexOf(": ") + 2),
        },
      ],
    };
  } else if (base.payload === null) {
    const surface = facts.find((f) => /one broad patch of bright red paint/.test(f.text));
    if (surface)
      base.payload = {
        source_fact_id: surface.fact_id,
        referent: "a patch on the wall facing the character",
        content: "a broad patch of bright red on pale plaster",
        basis: [
          {
            from: "WORLD_FACT",
            ref: surface.fact_id,
            evidence_quote: quoteOf(surface.text, /one broad patch of bright red paint/),
          },
        ],
      };
  }
  return base;
}

/** The setup host's policy: the earlier plumbing answers, with the direct-perception question read by `perceptionAnswer`. */
export const perceptionPolicy =
  (base: Policy, rule: PerceptionRule = {}): Policy =>
  (doc) =>
    doc["operation"] === "F014D_DIRECT_PERCEPTION" ? perceptionAnswer(doc, rule) : base(doc);
