/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw scripted-host documents */
// BLUE v5.2-A1 — SOURCE-QUALIFIED original-PC observation: SECURITY. The hidden-information boundary: what the source's owner withholds (its
// exact quantity, recoverable amount, material class, key, establishment statement, deliveries) is never given to the host, never accepted
// back inside an appearance, never projected to the player, and cannot be selected, enumerated or probed by anything the host controls.
// The campaigns are built by the shipped commands over a real, owner-written Source Condition; the scripted referee host is PLUMBING ONLY
// (it proves what the ENGINE refuses and withholds, not whether any AI reads any sentence correctly).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RefereeAdjudicationAdapter, type CanonicalCampaign } from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { openOrdinary } from "../support/locality.ts";
import { observe } from "../support/observation.ts";
import { GLANCE_REQUEST } from "../support/protocol.ts";
import { plainPolicy, type Policy } from "../support/original-pc.ts";
import {
  EXPOSED,
  PC_ID,
  SOURCE_KEY,
  sourceAnswer,
  sourceCampaign,
} from "../support/source-observation.ts";

const bare = (text: string): string => text.replace(/[0-9a-f]{16,}/g, "");

/** A source authored with values of its own, so that no assertion can pass by coincidence with the default fixture. */
const VARIANTS = [
  {
    key: SOURCE_KEY,
    amount: 7381,
    unit: "basket",
    material: "grey-ore",
    dimension: "outcrop",
    statement: "The outcrop yields exactly 7381 baskets of grey ore, no more.",
  },
  {
    key: SOURCE_KEY,
    amount: 4096,
    unit: "ton",
    material: "river.clay",
    dimension: "bank-face",
    statement: "The bank holds 4096 tons of river clay, a figure the world never states aloud.",
  },
] as const;

describe("what the source's owner withholds never reaches the host's document or the player's packet, for sources of any values", () => {
  for (const v of VARIANTS)
    it(`source ${v.material} × ${v.amount}: absent from the host's task and from the player's read`, async () => {
      const { dirs } = await sourceCampaign({
        extra: (doc) => {
          doc.source.material_class = v.material;
          doc.source.dimension = v.dimension;
          doc.source.quantity = { amount: v.amount, unit: v.unit };
          doc.source.statement = v.statement;
        },
      });
      const docs: any[] = [];
      const policy: Policy = (doc) => {
        if (doc["operation"] !== "F014D_DIRECT_PERCEPTION") return plainPolicy(doc);
        docs.push(structuredClone(doc));
        return sourceAnswer(doc);
      };
      const r = await observe(dirs, undefined, { sourceKey: v.key }, policy);
      expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_RECEIVED");
      expect(docs.length).toBeGreaterThanOrEqual(1);
      const task = bare(JSON.stringify(docs[0]));
      const c: CanonicalCampaign = await openOrdinary(dirs.campaignDir);
      try {
        const out = bare(
          JSON.stringify(
            readCurrentObservationGlance(
              bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: PC_ID }),
              GLANCE_REQUEST(),
            ),
          ),
        );
        const packet = bare(
          JSON.stringify(c.store.listFacts().find((f) => /\/packet\//.test(f.key))!.value),
        );
        for (const hidden of [
          v.key,
          v.material,
          v.dimension,
          v.statement,
          "recoverable",
          "delivery_id",
          "exhaustion",
          "EXACT_FINITE",
          "INITIAL_SETTING_FACT",
        ]) {
          expect(task, `task: ${hidden}`).not.toContain(hidden);
          expect(out, `read: ${hidden}`).not.toContain(hidden);
          expect(packet, `packet: ${hidden}`).not.toContain(hidden);
        }
        // the exact quantity, as a whole number (a distinctive one, so that no rule id or version can be mistaken for it)
        for (const [where, text] of [
          ["task", task],
          ["read", out],
          ["packet", packet],
        ] as const)
          expect(text, `${where}: the exact quantity`).not.toMatch(
            new RegExp(`(?<![0-9])${v.amount}(?![0-9])`),
          );
        // the one thing delivered of the source is its owner-authored access fact, as a premise like any other
        expect(docs[0].context.facts.filter((f: any) => f.from === "source")).toEqual([
          {
            fact_id: "source.access.1",
            from: "source",
            label: "source access fact (exposure)",
            text: `exposure: ${EXPOSED}`,
          },
        ]);
        expect(docs[0].context.refs.at(-1).fact_key).toBe("(the scoped source: withheld)");
      } finally {
        await c.close();
      }
    });
});

describe("forged and leaking answers to a real source-scoped question are refused by the engine, each by its own rule", () => {
  async function scoped() {
    const { dirs } = await sourceCampaign();
    const campaign = await openOrdinary(dirs.campaignDir);
    const adapter = new RefereeAdjudicationAdapter(campaign.store);
    const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: SOURCE_KEY });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    const doc = { task_id: task.value.task_id, context: task.value.context };
    const answer = (
      rule: Parameters<typeof sourceAnswer>[1],
      edit: (a: any) => void = () => {},
    ) => {
      const a: any = sourceAnswer(doc, rule);
      edit(a);
      return adapter.evaluateObservation(task.value.context, a);
    };
    return { campaign, answer, context: task.value.context };
  }
  const refusal = (r: { ok: boolean; error?: { code: string; message: string } }) =>
    r.ok ? "OK" : `${r.error!.code}`;

  it("the lawful answer is accepted, and each forgery is refused with the code of the rule it breaks", async () => {
    const { campaign, answer } = await scoped();
    try {
      expect(refusal(answer({}))).toBe("OK");
      const cases: [string, ReturnType<typeof answer>, string][] = [
        [
          "a leaked source key",
          answer({ referent: `the ${SOURCE_KEY} heap` }),
          "GROUNDS_UNSUPPORTED",
        ],
        [
          "a leaked material class",
          answer({ content: "a mound of raw salt lies bare" }),
          "GROUNDS_UNSUPPORTED",
        ],
        [
          "a leaked exact quantity",
          answer({ content: "exactly 120 lumps lie bare" }),
          "GROUNDS_UNSUPPORTED",
        ],
        [
          "a leaked engine reference",
          answer({ content: "see source.access.1" }),
          "GROUNDS_UNSUPPORTED",
        ],
        [
          "an appearance of a neighbouring fact",
          answer({ ofFact: "locus.designation" }),
          "DECISION_INCOHERENT",
        ],
        [
          "a quotation that is not in the premise",
          answer({}, (a) => (a.payload.basis[0].evidence_quote = "a buried deposit")),
          "GROUNDS_UNSUPPORTED",
        ],
        [
          "an undelivered source fact",
          answer({}, (a) => {
            a.payload.source_fact_id = "source.access.9";
            a.payload.basis[0].ref = "source.access.9";
          }),
          "COVERAGE_INCOMPLETE",
        ],
        [
          "a source fact offered as the character's own sight",
          answer({}, (a) => {
            a.faculty.premises = [
              { from: "WORLD_FACT", ref: "source.access.1", evidence_quote: "lies bare" },
            ];
          }),
          "DECISION_INCOHERENT",
        ],
        [
          "an answer for another question",
          answer({}, (a) => (a.task_id = "0".repeat(64))),
          "TASK_MISMATCH",
        ],
        [
          "an assessment of the source fact left out",
          answer(
            {},
            (a) =>
              (a.assessments = a.assessments.filter((x: any) => x.fact_id !== "source.access.1")),
          ),
          "COVERAGE_INCOMPLETE",
        ],
      ];
      for (const [name, r, code] of cases) expect(refusal(r), name).toBe(code);
      // a withheld value is refused with a reason that names what is withheld, never its value
      const leaked = answer({ content: "exactly 120 lumps lie bare" });
      expect(leaked.ok).toBe(false);
      if (!leaked.ok) {
        expect(leaked.error.message).toMatch(/withholds/);
        expect(leaked.error.message).not.toContain("120");
      }
    } finally {
      await campaign.close();
    }
  }, 120_000);
});

describe("the source choice is a trusted-side input: nothing a host controls names, selects, enumerates or probes a source", () => {
  const SRC = (rel: string) => readFileSync(rel, "utf8");
  const files = (dir: string) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(dir, f));
  const NAMES = /\b(sourceKey|source_key)\b/;

  it("the host-facing modules (the referee, request and read transports, the protocol gateways and their contracts) never mention a source selector", () => {
    const hostFacing = [
      ...files("packages/protocol/src"),
      ...files("packages/operator/src").filter((f) =>
        /(referee-mcp|referee-bin|player-view|observe-request|advance-request)/.test(f),
      ),
      "packages/contracts/src/protocol-current-glance.ts",
    ];
    expect(hostFacing.length).toBeGreaterThan(10);
    for (const f of hostFacing) {
      if (f === "packages/protocol/src/current-observation-glance.ts") {
        // The fixed consumer derives qualification keys from committed owner facts, never from the host request.
        const body = SRC(f).slice(SRC(f).indexOf("export function readCurrentObservationGlance"));
        expect(body).not.toMatch(/request\.source|request\[/);
        expect(body).toMatch(
          /ReadCurrentObservationGlanceRequestSchema.safeParse\(request\).success/,
        );
        expect(SRC("packages/contracts/src/protocol-current-glance.ts")).not.toMatch(NAMES);
      } else if (f === "packages/protocol/src/pc-collection.ts") {
        // The previously authorized collection gateway reads the source of its committed choice; it adds no observation selector.
        expect(SRC(f)).toContain("adapter.commitment(pcId, actId)?.value.intent.source.fact_key");
        expect(SRC(f)).not.toMatch(/request\.(sourceKey|source_key)|parsed\.data\.source_key/);
      } else expect(SRC(f), f).not.toMatch(NAMES);
    }
  });

  it("the trusted operator side that names one: the observation command, its referee session and the console — and `locality.ts`, `additional-source.ts` and `additional-locality.ts`, which ESTABLISH a source from the operator's own file", () => {
    const naming = files("packages/operator/src").filter((f) => NAMES.test(SRC(f)));
    expect(naming.map((f) => f.replace(/^.*\//, "")).sort()).toEqual([
      "additional-locality.ts",
      "additional-source.ts",
      "cli.ts",
      "closed-setting.ts",
      "commands.ts",
      "locality.ts",
      "observation.ts",
      "referee-session.ts",
      "scene-resolution.ts",
    ]);
  });

  it("the source scope is ONE read by a derived identity: no listing, scan, search, loop, clock, random or network in the scope or the withheld set", () => {
    const text = SRC("packages/engine/src/referee/derive.ts");
    const scope = text.slice(
      text.indexOf("function sourceScope("),
      text.indexOf("export function observationContext("),
    );
    const withheld = text.slice(
      text.indexOf("export function observationWithheld("),
      text.indexOf("/** Case-folded text"),
    );
    expect(scope.match(/\bfacts\(/g)).toHaveLength(1);
    expect(withheld.match(/\bfacts\(/g)).toHaveLength(1);
    for (const body of [scope, withheld])
      expect(body).not.toMatch(
        /\blistFacts\b|\bfor\s*\(|\bwhile\b|Object\.(keys|values|entries)|\.find\(|\.filter\(|\.some\(|Date|Math\.random|randomBytes|fetch\(|node:/,
      );
    for (const f of [
      "packages/engine/src/referee/derive.ts",
      "packages/engine/src/referee/adapter.ts",
      "packages/engine/src/epistemic/observation.ts",
      "packages/protocol/src/current-observation-glance.ts",
    ])
      expect(SRC(f), f).not.toMatch(
        /\blistFacts\b|Date\.now|new Date|Math\.random|randomBytes|\bfetch\(/,
      );
  });

  it("the completed-collection withheld set is TWO reads at identities the delivery itself derives: the delivery its citation names and the source that delivery names — no listing, scan, search, loop, clock, random or network", () => {
    const text = SRC("packages/engine/src/referee/derive.ts");
    const body = text.slice(
      text.indexOf("function deliveryWithheld("),
      text.indexOf("export function observationWithheld("),
    );
    expect(body.match(/\bfacts\(/g)).toHaveLength(2);
    expect(body).toMatch(/facts\(key\)/);
    expect(body).toMatch(/facts\(sourceKey\)/);
    expect(body).toMatch(
      /const sourceKey = worldSourceConditionKey\(worldId, d\.source\.source_key\)/,
    );
    expect(body).not.toMatch(
      /\blistFacts\b|\bfor\s*\(|\bwhile\b|Object\.(keys|values|entries)|\.find\(|\.filter\(|\.some\(|Date|Math\.random|randomBytes|fetch\(|node:/,
    );
  });

  it("an unavailable source has one message: absent, malformed, foreign, mislocated, exhausted and undescribed sources cannot be told apart", () => {
    const text = SRC("packages/engine/src/referee/derive.ts");
    expect(text.match(/SOURCE_UNAVAILABLE/g)!.length).toBeGreaterThanOrEqual(3);
    // the refusal text exists once, as a constant; no per-cause message is built for a source
    expect(text.match(/no source is available to this observation/g)).toHaveLength(1);
    expect(
      SRC("packages/engine/src/referee/adapter.ts").match(/no source is available/g),
    ).toHaveLength(1);
  });
});
