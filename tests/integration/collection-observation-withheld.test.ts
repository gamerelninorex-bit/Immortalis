/* eslint-disable @typescript-eslint/no-explicit-any -- corrupt-view tests mutate raw owner facts */
// N-1 (RED, #72): the question that cites the character's completed collection DELIVERS the sentence "The gathering of <amount> <unit> of
// <material> from the source at this place has been completed." to the bound referee. The delivered premise is not removed; what the
// referee may SAY about it is validated: no source identifier, material class or exact quantity the validated delivery and its Source
// Condition state may appear in the appearance, exactly as in the source-scoped variant. Real owners and a scripted host: MECHANISM
// evidence only. It shows the engine refuses these strings; it does not show that any host understood any sentence.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  productionExtractionKey,
  productionReserveKey,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  RefereeAdjudicationAdapter,
  formObservedPacket,
  observationWithheld,
  type CanonicalCampaign,
  type ObservationContext,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { LOCUS_ID, openOrdinary, SOURCE_KEY, WORLD_ID } from "../support/locality.ts";
import { BASIS, PC_ID } from "../support/observation.ts";
import {
  SALT,
  SALT_TAU,
  collectAndComplete,
  decideOutcome,
  originalCollectionCampaign,
  outcomeAnswer,
} from "../support/pc-collection-original.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";

const boundary = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const extractionId = `pc-collect:${PC_ID}:act-withheld`;
const deliveryKey = worldSourceDeliveryKey(WORLD_ID, extractionId);
const sourceKey = worldSourceConditionKey(WORLD_ID, SOURCE_KEY);
const INDEPENDENT = "a broad patch of bright red on pale plaster";

let c: CanonicalCampaign;
const attempt = 0;
const facts = (key: string) => c.store.getFact(key);
const head = () => c.store.head().state_sha256;

/** The delivery-citing question exactly as the engine builds it for the character now. */
function question(): ObservationContext {
  const task = new RefereeAdjudicationAdapter(c.store).observationTask({ pc_id: PC_ID, attempt });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  return task.value.context;
}

beforeAll(async () => {
  const { dirs } = await originalCollectionCampaign();
  c = await openOrdinary(dirs.campaignDir);
  await collectAndComplete(c, "act-withheld", 3, "tx-withheld", boundary);
});
afterAll(async () => {
  await c?.close();
});

describe("the withheld set of the delivery-citing question is built from its validated delivery and source", () => {
  it("is the source identifier, the material class and every exact quantity the delivery and its source state — and the question is the delivery variant", () => {
    const ctx = question();
    expect(ctx.refs).toHaveLength(6);
    expect(ctx.refs[5]?.fact_key).toBe(deliveryKey);
    // the premise really is delivered to the host: this is what the withheld set exists to keep out of the appearance
    const delivered = ctx.facts.find((f) => f.fact_id === "outcome.collection");
    expect(delivered?.text).toMatch(/gathering of 3 sack of raw-salt/);
    const w = observationWithheld(facts, ctx);
    expect(w).not.toBeNull();
    expect(w!.names).toEqual([SOURCE_KEY, "raw-salt"]);
    // delivered 3, recoverable before 120 and after 117 — nothing else, once each
    expect([...w!.amounts].sort((a, b) => a - b)).toEqual([3, 117, 120]);
  });

  it("is derived from exactly the delivery and the source that delivery names — two reads, in that order, and no other", () => {
    const ctx = question();
    const reads: string[] = [];
    observationWithheld((k) => {
      reads.push(k);
      return facts(k);
    }, ctx);
    expect(reads).toEqual([deliveryKey, sourceKey]);
  });

  it("an ordinary question withholds nothing; a delivery whose delivery or source cannot be read as such is withheld-unknown (fail closed), never withheld-nothing", () => {
    const ctx = question();
    const corruptions: [string, string, (f: OwnerFact) => OwnerFact | undefined][] = [
      ...[deliveryKey, sourceKey].flatMap(
        (key): [string, string, (f: OwnerFact) => OwnerFact | undefined][] => [
          ["absent", key, () => undefined],
          ["malformed", key, (f) => ({ ...f, value: {} })],
          ["foreign-owned", key, (f) => ({ ...f, owner: "foreign-owner" })],
          ["under another key", key, (f) => ({ ...f, key: "world/foreign/source/foreign" })],
        ],
      ),
      [
        "naming another source",
        deliveryKey,
        (f) => ({
          ...f,
          value: {
            ...(f.value as any),
            source: { ...(f.value as any).source, source_key: "src-other" },
          },
        }),
      ],
      [
        "naming a source key other than its own source",
        deliveryKey,
        (f) => ({
          ...f,
          value: {
            ...(f.value as any),
            source: {
              ...(f.value as any).source,
              fact_key: worldSourceConditionKey(WORLD_ID, "src-other"),
            },
          },
        }),
      ],
      ["of another facet", sourceKey, (f) => ({ ...f, facet: "foreign_facet" })],
      [
        "stating another source key",
        sourceKey,
        (f) => ({ ...f, value: { ...(f.value as any), source_key: "src-other" } }),
      ],
      [
        "located at another locus",
        sourceKey,
        (f) => ({
          ...f,
          value: {
            ...(f.value as any),
            locality: {
              ...(f.value as any).locality,
              locus: { ...(f.value as any).locality.locus, entity_id: "locus-elsewhere" },
            },
          },
        }),
      ],
      [
        "located in another world",
        sourceKey,
        (f) => ({
          ...f,
          value: {
            ...(f.value as any),
            locality: {
              world: {
                fact_key: worldProfileKey("world-elsewhere"),
                entity_id: "world-elsewhere",
              },
              locus: {
                fact_key: worldLocusKey("world-elsewhere", LOCUS_ID),
                entity_id: LOCUS_ID,
              },
            },
          },
        }),
      ],
      [
        "of another delivery id",
        deliveryKey,
        (f) => ({
          ...f,
          value: {
            ...(f.value as any),
            delivery_id: "pc-collect:other:act",
            contribution: {
              ...(f.value as any).contribution,
              extraction_id: "pc-collect:other:act",
            },
          },
        }),
      ],
    ];
    for (const [what, key, corrupt] of corruptions) {
      const w = observationWithheld((k) => {
        const f = facts(k);
        return k === key && f ? corrupt(f) : f;
      }, ctx);
      expect(w, `${what} ${key}`).toBeNull();
    }
    // a delivery filed in another world's key space is not this world's delivery, however its value reads
    const elsewhereKey = worldSourceDeliveryKey("world-elsewhere", extractionId);
    expect(
      observationWithheld(
        (k) => {
          const f = facts(k === elsewhereKey ? deliveryKey : k);
          return k === elsewhereKey && f ? { ...f, key: elsewhereKey } : f;
        },
        {
          ...ctx,
          refs: [...ctx.refs.slice(0, 5), { ...ctx.refs[5]!, fact_key: elsewhereKey }],
        },
      ),
    ).toBeNull();
    // a delivery cited by another character, or in another world, is never read as this character's
    expect(
      observationWithheld(facts, {
        ...ctx,
        subject: { ...ctx.subject, pc_id: "pc-someone-else" },
      }),
    ).toBeNull();
    expect(
      observationWithheld(facts, {
        ...ctx,
        subject: { ...ctx.subject, world_id: "world-elsewhere" },
      }),
    ).toBeNull();
    expect(observationWithheld(facts, { ...ctx, refs: ctx.refs.slice(0, 5) })).toEqual({
      names: [],
      amounts: [],
    });
  });

  it("follows the delivery and the source as they now stand: the delivered amount is the delivery's own, and a later extraction's quantities are withheld too", () => {
    const ctx = question();
    const amounts = (change: (f: OwnerFact) => OwnerFact) =>
      [
        ...observationWithheld((k) => {
          const f = facts(k);
          return k === sourceKey && f ? change(f) : f;
        }, ctx)!.amounts,
      ].sort((a, b) => a - b);
    // a source that does not list this delivery: the delivery's own 3, 117 and the source's 120
    expect(
      amounts((f) => ({
        ...f,
        value: { ...(f.value as any), delivered: [], recoverable: { amount: 120, unit: "sack" } },
      })),
    ).toEqual([3, 117, 120]);
    // a later extraction from the same source (7 sacks): its quantity and the net it left are withheld as well
    expect(
      amounts((f) => ({
        ...f,
        value: {
          ...(f.value as any),
          delivered: [
            { delivery_id: "ex-later", quantity: { amount: 7, unit: "sack" } },
            ...(f.value as any).delivered,
          ],
          recoverable: { amount: 110, unit: "sack" },
        },
      })),
    ).toEqual([3, 7, 110, 117, 120]);
  });
});

describe("what the referee may say about the delivered gathering", () => {
  const REFERENTS: [string, string][] = [
    ["the material class, as written", "raw-salt"],
    ["the material class, spaced and re-cased", "Raw Salt"],
    ["the material class, with underscores", "RAW_SALT"],
    ["the material class inside a phrase", "a heap of raw salt on the floor"],
    ["the source identifier", SOURCE_KEY],
    ["the source identifier, spaced", "src salt pan 1"],
  ];
  const CONTENTS: [string, string][] = [
    ["the delivered numeral alone", "a heap of 3 grains"],
    ["the recoverable numeral after the delivery", "117 left over"],
    ["the established numeral", "120 in all"],
    ["numeral and material together", "3 sacks of raw salt"],
    ["numeral and material, separators spelled differently", "the raw-salt: 3 sack"],
  ];

  it("refuses an appearance whose referent carries the material or the source key, retaining nothing", async () => {
    for (const [what, referent] of REFERENTS) {
      const before = head();
      const r = await decideOutcome(c, { of: "scene", leak: referent }, attempt);
      expect(r.recorded.ok, what).toBe(false);
      if (!r.recorded.ok) expect(r.recorded.error.code, what).toBe("GROUNDS_UNSUPPORTED");
      expect(head(), what).toBe(before);
    }
  });

  it("refuses an appearance whose content carries an exact quantity or the material, retaining nothing", async () => {
    for (const [what, content] of CONTENTS) {
      const before = head();
      const r = await decideOutcome(c, { of: "scene", appearance: content }, attempt);
      expect(r.recorded.ok, what).toBe(false);
      if (!r.recorded.ok) expect(r.recorded.error.code, what).toBe("GROUNDS_UNSUPPORTED");
      expect(head(), what).toBe(before);
    }
  });

  it("refuses the same strings on the engine's evaluation path, with the same code, before anything is written", () => {
    const adapter = new RefereeAdjudicationAdapter(c.store);
    const task = adapter.observationTask({ pc_id: PC_ID, attempt });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    const before = head();
    for (const rule of [
      { of: "scene" as const, leak: "raw-salt" },
      { of: "scene" as const, appearance: "3" },
      { of: "scene" as const, appearance: "3 sacks of raw salt" },
    ]) {
      const answer = outcomeAnswer(
        { task_id: task.value.task_id, context: task.value.context },
        rule,
      );
      const evaluated = adapter.evaluateObservation(task.value.context, answer);
      expect(evaluated.ok).toBe(false);
      if (!evaluated.ok) expect(evaluated.error.code).toBe("GROUNDS_UNSUPPORTED");
    }
    expect(head()).toBe(before);
  });

  it("still accepts the independent appearance, and a grounded appearance of the gathered material that names none of it", () => {
    const adapter = new RefereeAdjudicationAdapter(c.store);
    const task = adapter.observationTask({ pc_id: PC_ID, attempt });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    const doc = { task_id: task.value.task_id, context: task.value.context };
    const before = head();
    for (const of of ["scene", "outcome"] as const) {
      const evaluated = adapter.evaluateObservation(task.value.context, outcomeAnswer(doc, { of }));
      expect(evaluated.ok, `${of} ${JSON.stringify(evaluated)}`).toBe(true);
      if (evaluated.ok) expect(evaluated.value.verdict).toBe("OBSERVATION_ESTABLISHED");
    }
    expect(head()).toBe(before);
  });
});

describe("a retained reading that carries a withheld value no longer re-derives, through the fixed Glance consumer", () => {
  const keys = [
    sourceKey,
    productionExtractionKey(extractionId),
    productionReserveKey(SALT.reserve),
  ];

  /**
   * Reads the Glance over a view in which the retained reading's appearance is replaced wherever the campaign carries it — the retained
   * decision, the event it determines and the packet formed from that event — so that the only thing that can fail is what the
   * replacement says. `null` is the untouched view.
   */
  function read(content: string | null) {
    const calls: { method: string; key: string }[] = [];
    const swap = (fact: OwnerFact | undefined): OwnerFact | undefined => {
      if (!fact || content === null) return fact;
      const text = JSON.stringify(fact.value);
      return text.includes(INDEPENDENT)
        ? { ...fact, value: JSON.parse(text.replaceAll(INDEPENDENT, content)) }
        : fact;
    };
    const view: ProjectionStateView = {
      getFact: (key) => {
        calls.push({ method: "getFact", key });
        return swap(c.store.getFact(key));
      },
      committedGroup: (key) => {
        calls.push({ method: "committedGroup", key });
        return c.store.committedGroup(key);
      },
    };
    const out = readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view, recipient_id: PC_ID }),
      GLANCE_REQUEST(),
    );
    return { out, calls };
  }

  beforeAll(async () => {
    const decision = await decideOutcome(c, { of: "scene" }, attempt);
    expect(decision.recorded.ok, JSON.stringify(decision.recorded)).toBe(true);
    const record = c.store
      .listFacts()
      .find((f) => (f.value as any).operation === "F014D_DIRECT_PERCEPTION")!;
    expect((await formObservedPacket(c.store, record.key)).ok).toBe(true);
  });

  it("delivers the independent appearance, and a harmless replacement of it, over the same ordered reads (the control)", () => {
    const real = read(null);
    expect(real.out.ok, JSON.stringify(real.out)).toBe(true);
    expect(JSON.stringify(real.out)).toContain(INDEPENDENT);
    expect(real.calls).toHaveLength(22);
    expect(real.calls.slice(9, 14).map((r) => r.key)).toEqual([deliveryKey, "-", ...keys]);
    const harmless = read("a broad patch of bright red on plaster");
    expect(harmless.out.ok, JSON.stringify(harmless.out)).toBe(true);
    expect(harmless.calls).toEqual(real.calls);
  });

  it("refuses opaquely, over the identical ordered reads and with nothing committed, when the reading carries the material, the key, a numeral, or numeral and material", () => {
    const real = read(null);
    const before = head();
    for (const content of [
      "a heap of raw salt",
      `a heap by ${SOURCE_KEY}`,
      "3 grains",
      "117 grains",
      "120 grains",
      "3 sacks of raw salt",
    ]) {
      const result = read(content);
      expect(JSON.stringify(result.out), content).toBe(PROTOCOL_REFUSAL);
      expect(result.calls, content).toEqual(real.calls);
    }
    expect(head()).toBe(before);
  });
});
