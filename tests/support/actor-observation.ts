/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw documents and read raw scripted-host documents */
// TEST SUPPORT for the NON-PC Named-Actor source-qualified direct perception (BLUE v5.2-A1, mechanism only). Every campaign these tests read is
// built ONLY by the shipped owner paths: the World-State owner commits the world, the locus and the finite Source Condition (genuinely upstream,
// owner-written canon, authored as setting prose and numbers: it states NO perception, receipt, packet content or expected verdict); the
// Named-Actor owner commits the actor's capability basis and, through a dependent consequence's declared close, the capability itself; the
// World-State owner couples the already-existing actor to the locus; the Temporal owner establishes canonical time.
//
// The scripted referee host below is a policy the TEST wrote that reads the DELIVERED words by rule. It is PLUMBING ONLY: it proves the engine
// enforces what it derives (quotes, premise kinds, scope, withheld values), vouches for the host, refuses forgeries and recovers. It proves
// NOTHING about whether any AI perceives or understands any sentence: that is genuine AI-host semantic evidence and is NOT claimed by any test
// that uses this file.
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  NamedActorAdapter,
  RefereeAdjudicationAdapter,
  TemporalCoordinator,
  type CampaignStore,
} from "@immortalis/engine";
import {
  REFEREE_AUTHORITY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  worldActorCouplingKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import {
  ACTOR_BOUNDARY_T,
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  T0,
  actorProviders,
  actorPublication,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  fixtureLocus,
  fixtureWorld,
  historyGroup,
  publication,
  sourceInput,
  temporalPublication,
} from "@immortalis/testkit";
import {
  bindHost,
  observeActor,
  pendingTasks,
  readTask,
  secretPath,
  submitDecision,
  type ObserveActorParams,
} from "@immortalis/operator";
import { defaultHistoryIds } from "./actor.ts";
import { freshDirs, type LocalityDirs } from "./locality.ts";
import { verbConsole } from "./observation.ts";
import type { ScriptedConsole } from "./original-pc.ts";
import { couplingInput } from "./existing-actor.ts";
import { must } from "./temporal.ts";

export { ACTOR_OTHER, ACTOR_SMITH, FIXTURE_CAMPAIGN, FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID };
export const ACTOR = ACTOR_SMITH;
export const BYSTANDER = ACTOR_OTHER;
/** the capability whose committed identity the scripted host reads as the actor's sight */
export const SIGHT = "keen-sight";
export const HEARING = "keen-hearing";
export const SOURCE = "source-main";
export const SOURCE_OTHER = "source-other";
export const SOURCE_ELSEWHERE = "source-elsewhere";
export const LOCUS_ELSEWHERE = "locus-elsewhere";

/** The ONLY thing the Source Condition's owner states about whether the feature can be seen: setting prose. */
export const EXPOSED =
  "A low heap of pale crystalline crust lies bare on the floor at the foot of the north wall, in full view of the doorway, with nothing laid over it.";
export const BURIED =
  "A closed slab of grey stone lies over the whole pale crystalline crust at the foot of the north wall; no part of the crust shows above the slab.";
export const SILENT = "A low heap of pale crystalline crust lies at the foot of the north wall.";

/** The secrets of the source: an exact quantity, a material, a key and a quantity-bearing statement. No host document or packet may carry one. */
export const SECRET = {
  key: SOURCE,
  amount: 120,
  unit: "sack",
  material: "raw-salt",
  dimension: "surface-crust",
  statement: "The first pan holds exactly 120 sacks of raw salt.",
} as const;

export const SCENE = {
  geometry:
    "The room is a stone hall six paces long. A doorway stands in its south wall, facing the north wall across the bare floor.",
  light:
    "Ordinary terrestrial daylight enters through a high window in the east wall and lights the north wall evenly.",
  air: "The air between the doorway and the north wall is clear: there is no smoke, mist or dust in it.",
  path: "Nothing solid stands between the doorway and the north wall: the floor between them is bare, and no screen, curtain, partition or other object crosses the line from the doorway to the wall.",
} as const;
export const SCREEN =
  "A continuous opaque wooden screen stands across the full width and height of the hall between the doorway and the north wall; it has no gap, and no other opening leads from the doorway to the north wall.";

export const sceneLocus = (path: string = SCENE.path) =>
  fixtureLocus({
    designation: "A stone hall",
    constraints: [
      { aspect: "geometry", statement: SCENE.geometry },
      { aspect: "light", statement: SCENE.light },
      { aspect: "air", statement: SCENE.air },
      { aspect: "path", statement: path },
    ],
  });

export interface ActorSceneOptions {
  /** the owner-authored access facts of the source */
  readonly access?: readonly { aspect: string; statement: string }[];
  /** the locus' path sentence */
  readonly path?: string;
  /** the capabilities to establish and close (default: the actor's sight) */
  readonly capabilities?: readonly string[];
  /** do not couple the actor */
  readonly noCoupling?: boolean;
  /** do not close the capability (leave only its basis) */
  readonly noClose?: boolean;
  readonly buildId?: string;
  /** also commit a second locus of the same world with a source at it (the actor stays coupled to the first) */
  readonly otherLocus?: boolean;
  /** also commit a second, ordinary source at the actor's own locus */
  readonly otherSource?: boolean;
}

export interface ActorScene {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly access: EpistemicAccessAdapter;
  readonly referee: RefereeAdjudicationAdapter;
}

export const wireScene = (campaign: CanonicalCampaign): ActorScene => ({
  campaign,
  coordinator: new TemporalCoordinator(campaign.store, actorProviders()),
  actors: new NamedActorAdapter(campaign.store),
  access: new EpistemicAccessAdapter(campaign.store),
  referee: new RefereeAdjudicationAdapter(campaign.store),
});

export const reopenScene = async (dir: string, buildId = "actor-observation-reopen") =>
  wireScene(
    await must(CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION })),
  );

/**
 * A world whose locus is the authored scene, a finite Source Condition at it, an already-existing non-PC Named Actor with a CLOSED capability
 * (the close resolved by a dependent consequence's declared stage, the only way a capability is committed), its World-State coupling to that
 * locus and the canonical basis the close resolved at. Nothing observed yet.
 */
export async function actorScene(dir: string, o: ActorSceneOptions = {}): Promise<ActorScene> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "actor-observation",
      extension: ACTOR_FIXTURE_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: sceneLocus(o.path) }));
  await must(
    campaign.establishSourceCondition({
      ...publication(3),
      source: sourceInput({
        source_key: SOURCE,
        dimension: SECRET.dimension,
        material_class: SECRET.material,
        quantity: { amount: SECRET.amount, unit: SECRET.unit },
        statement: SECRET.statement,
        access_facts: (o.access ?? [{ aspect: "exposure", statement: EXPOSED }]).map((a) => ({
          ...a,
        })),
      }),
    }),
  );
  if (o.otherSource)
    await must(
      campaign.establishSourceCondition({
        ...publication(4),
        source: sourceInput({
          source_key: SOURCE_OTHER,
          access_facts: [{ aspect: "exposure", statement: EXPOSED }],
        }),
      }),
    );
  if (o.otherLocus) {
    await must(
      campaign.establishLocus({
        ...publication(5),
        locus: fixtureLocus({ locus_id: LOCUS_ELSEWHERE, designation: "A second stone hall" }),
      }),
    );
    await must(
      campaign.establishSourceCondition({
        ...publication(6),
        source: sourceInput({
          source_key: SOURCE_ELSEWHERE,
          locus_id: LOCUS_ELSEWHERE,
          access_facts: [{ aspect: "exposure", statement: EXPOSED }],
        }),
      }),
    );
  }
  let n = 1;
  for (const actor of [ACTOR_SMITH, ACTOR_SWORD, ACTOR_OTHER])
    for (const id of defaultHistoryIds(actor))
      await must(campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, n++, id)));
  const s = wireScene(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  const caps = o.capabilities ?? [SIGHT];
  let tn = 10;
  for (const [i, cap] of caps.entries()) {
    const basis = capabilityBasis(ACTOR, cap);
    await must(
      s.actors.establishCapabilityBasis({ ...actorPublication(i + 1), capability: basis }),
    );
    if (o.noClose) continue;
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(tn++),
        object: capabilityConsumerObject(`c-${cap}`, basis),
      }),
    );
    // the advance targets the consumer's own boundary exactly, so no unresolved continuation remains for the observation to inherit
    await must(
      s.coordinator.advance(
        consumerAdvanceRequest(`tx-${cap}`, `c-${cap}`, {
          requested: { target: ACTOR_BOUNDARY_T, condition: null },
        }),
      ),
    );
  }
  if (!o.noCoupling) {
    const pins = caps.map((cap) => ({
      owner: "named_actor",
      fact_key: actorCapabilityBasisKey(ACTOR, cap),
      version: 1,
    }));
    await must(campaign.coupleExistingActor(couplingInput(1, ACTOR, { actor_state: pins })));
  }
  return s;
}

export const sourceFactKey = worldSourceConditionKey(FIXTURE_WORLD_ID, SOURCE);
export { REFEREE_AUTHORITY, actorCapabilityKey, worldActorCouplingKey };
export type { CampaignStore };

// -- the scripted host (plumbing only) ----------------------------------------------------------------------------------------------

export interface ActorRule {
  /** do not establish the faculty (cite no capability) */
  readonly noFaculty?: boolean;
  /** do not establish the position */
  readonly noPosition?: boolean;
  /** report the path as not established whatever the world says */
  readonly pathUnknown?: boolean;
  /** state an appearance even when the answer is not an affirmative one (to exercise the engine's refusal) */
  readonly forcePayload?: boolean;
  /** the appearance text, in place of the neutral one */
  readonly referent?: string;
  readonly content?: string;
  /** the appearance is stated to be of this delivered fact, whatever it quotes */
  readonly ofFact?: string;
  /** ground the faculty on a premise of this kind instead of the capability */
  readonly facultyFrom?: "COUPLING_STATEMENT" | "WORLD_FACT";
  /** a fact whose text, when matched, the scripted host contradicts */
  readonly contradicts?: RegExp;
}

const quote = (text: string, re: RegExp): string => re.exec(text)![0];
const CAP = /keen-sight/;
const COUPLED = /currently coupled to this locus/;
const OPEN = /Nothing solid stands between the doorway and the north wall/;
const COVER = /closed slab of grey stone lies over the whole/;
const SCREENED = /continuous opaque wooden screen/;
const SHOWN = /lies bare on the floor at the foot of the north wall/;

export const NEUTRAL_REFERENT = "a low pale heap at the foot of the north wall";
export const NEUTRAL_CONTENT = "a low heap of pale, crystalline crust lying bare on the floor";

/** The scripted host's actor direct-perception answer, by rules over the DELIVERED words (never a verdict). */
export function actorAnswer(doc: Record<string, any>, rule: ActorRule = {}): unknown {
  const ctx = doc["context"];
  const facts: any[] = ctx.facts;
  const cap = ctx.actor.find((i: any) => CAP.test(i.text));
  const cover = facts.find((f) => COVER.test(f.text) || SCREENED.test(f.text));
  const open = facts.find((f) => OPEN.test(f.text));
  const shown = facts.find((f) => f.fact_id.startsWith("source.") && SHOWN.test(f.text));
  const anySource = facts.find((f) => f.fact_id.startsWith("source."));
  const facultyOk = !rule.noFaculty && cap !== undefined;
  const positionOk = !rule.noPosition && COUPLED.test(ctx.statement);
  const base = { rule_ids: ["F014D-6"], grounds: "scripted host: reading of the delivered words" };
  const faculty = {
    ...base,
    state: facultyOk ? "ESTABLISHED" : "NOT_ESTABLISHED",
    premises: facultyOk
      ? rule.facultyFrom === "COUPLING_STATEMENT"
        ? [
            {
              from: "COUPLING_STATEMENT",
              ref: "coupling.statement",
              evidence_quote: quote(ctx.statement, COUPLED),
            },
          ]
        : rule.facultyFrom === "WORLD_FACT"
          ? [{ from: "WORLD_FACT", ref: open.fact_id, evidence_quote: quote(open.text, OPEN) }]
          : [{ from: "ACTOR_CAPABILITY", ref: cap.item_id, evidence_quote: quote(cap.text, CAP) }]
      : [],
  };
  const position = {
    ...base,
    state: positionOk ? "ESTABLISHED" : "NOT_ESTABLISHED",
    premises: positionOk
      ? [
          {
            from: "COUPLING_STATEMENT",
            ref: "coupling.statement",
            evidence_quote: quote(ctx.statement, COUPLED),
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
            evidence_quote: quote(cover.text, COVER.test(cover.text) ? COVER : SCREENED),
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
      ? quote(f.text, COVER.test(f.text) ? COVER : SCREENED)
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

// -- direct engine access, for the mechanism tests --------------------------------------------------------------------------------

/**
 * Retains an actor direct-perception decision through the engine's own adapter, answering from the DELIVERED words by the scripted rules
 * (plumbing only). The context is the engine's: the caller names the actor, the capability, the source and the attempt.
 */
export async function decide(
  s: ActorScene,
  rule: ActorRule = {},
  o: { attempt?: number; actor?: string; capability?: string; source?: string } = {},
) {
  const actor = o.actor ?? ACTOR;
  const task = s.referee.actorObservationTask({
    actor_id: actor,
    capability_id: o.capability ?? SIGHT,
    source_key: o.source ?? SOURCE,
    attempt: o.attempt ?? 0,
  });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const answer = actorAnswer({ task_id: task.value.task_id, context: task.value.context }, rule);
  const recorded = await s.referee.recordActorObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    actor_id: actor,
    capability_id: o.capability ?? SIGHT,
    source_key: o.source ?? SOURCE,
    attempt: o.attempt ?? 0,
    answer,
  });
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error));
  return { ...recorded.value, context: task.value.context, answer };
}

// -- the operator command (plumbing only) -----------------------------------------------------------------------------------------------

/** Fresh campaign and operator-state paths; the operator-state directory exists and is owner-only, as the local operator verifies. */
export function freshActorDirs(): LocalityDirs {
  const dirs = freshDirs();
  mkdirSync(dirs.operatorDir, { recursive: true, mode: 0o700 });
  chmodSync(dirs.operatorDir, 0o700);
  return dirs;
}

export { verbConsole };
export type { LocalityDirs, ScriptedConsole };
export const ACTOR_HOST_ID = "scripted-actor-host";

/** The five operations a host may be bound to; the actor's is the fifth. */
export const ALL_OPERATIONS = [
  "I002_CLASSIFY",
  "IR_NATIVE_COMPATIBILITY",
  "IR_PHYSICAL_PLACEMENT",
  "F014D_DIRECT_PERCEPTION",
  "F014D_ACTOR_DIRECT_PERCEPTION",
] as const;

/** Binds the scripted host to the actor operation (and optionally others) through the shipped trusted action. */
export async function bindActorHost(
  dirs: LocalityDirs,
  operations: readonly (typeof ALL_OPERATIONS)[number][] = ["F014D_ACTOR_DIRECT_PERCEPTION"],
  hostId = ACTOR_HOST_ID,
  campaignId = FIXTURE_CAMPAIGN,
) {
  const bound = await bindHost({
    stateDir: dirs.operatorDir,
    campaignId,
    operatorUid: process.getuid!(),
    hostId,
    operations,
  });
  if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
  return bound.value;
}

export type ActorPolicy = (doc: Record<string, any>) => unknown;

export interface ActorHost {
  readonly answered: string[];
  stop(): Promise<void>;
}

/** Runs the scripted host concurrently: it answers each pending question through the REAL exchange until stopped. */
export function startActorHost(
  dirs: LocalityDirs,
  policy: ActorPolicy,
  hostId = ACTOR_HOST_ID,
  campaignId = FIXTURE_CAMPAIGN,
): ActorHost {
  const p = { stateDir: dirs.operatorDir, campaignId, operatorUid: process.getuid!() };
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
            claimed_model: "scripted-test-policy (NOT an AI)",
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

export const actorPolicy =
  (rule: ActorRule = {}): ActorPolicy =>
  (doc) =>
    doc["operation"] === "F014D_ACTOR_DIRECT_PERCEPTION" ? actorAnswer(doc, rule) : null;

/** Drives the shipped `observe-actor` in-process with a console, a scripted host (plumbing only) and optional fault seams. */
export async function observeActorCommand(
  dirs: LocalityDirs,
  terminal: ScriptedConsole = verbConsole("observe-actor"),
  over: Partial<ObserveActorParams> = {},
  host: ActorPolicy | null = actorPolicy(),
) {
  const h = host ? startActorHost(dirs, host) : null;
  try {
    const result = await observeActor({
      campaignDir: dirs.campaignDir,
      campaignId: FIXTURE_CAMPAIGN,
      actorId: ACTOR,
      capabilityId: SIGHT,
      sourceKey: SOURCE,
      operatorDir: dirs.operatorDir,
      terminal,
      extension: ACTOR_FIXTURE_EXTENSION,
      refereePolls: 400,
      refereePollMs: 10,
      ...over,
    });
    return { result, terminal, host: h };
  } finally {
    await h?.stop();
  }
}
