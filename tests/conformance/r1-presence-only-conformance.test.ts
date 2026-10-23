// R1 Stage-One foundation ONLY (BLUE order on PR #84, 23 October 2026): the actor-observation route is not part of this PR and is
// unreachable on this head. A negative reachability proof from the source and from the owner path: no PR-added `observe-actor` host
// operation, referee decision, receipt or packet can produce a positive observation. H1 and the S1 sensory design are UNBUILT, not
// passed; presence at a locus (B2) is not a viewpoint.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RefereeDecisionRecordSchema,
  RefereeOperationSchema,
  refereeDecisionKey,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, factKind } from "@immortalis/engine";
import { CANON_WRITE_AUTHORITY } from "@immortalis/contracts";
import { r1Scene } from "../support/actor-presence.ts";
import { tempDir } from "../support/tmp.ts";

const tree = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (e === "node_modules" || e === "dist") return [];
    return statSync(p).isDirectory() ? tree(p) : [p];
  });
const sources = [
  "packages/contracts/src",
  "packages/engine/src",
  "packages/operator/src",
  "packages/protocol/src",
]
  .flatMap(tree)
  .filter((f) => f.endsWith(".ts"));
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("negative reachability: no actor observation can be produced on this head", () => {
  it("no source file of any package carries the observe-actor route (command, flag, host operation, event id, packet formation)", () => {
    const route =
      /observe-actor|observeActor|F014D_ACTOR_DIRECT_PERCEPTION|REFEREE_OP_ACTOR_OBSERVATION|actor-perception|actorObservation|ActorObservation|actor-obs-|ACTOR_OBSERVATION_/;
    expect(sources.filter((f) => route.test(code(f)))).toEqual([]);
    expect(sources.filter((f) => /actor-observation/.test(f))).toEqual([]);
  });

  it("the referee vocabulary is the four operations of main: no fifth, actor-subject operation exists", () => {
    expect(RefereeOperationSchema.options).toEqual([
      "I002_CLASSIFY",
      "IR_NATIVE_COMPATIBILITY",
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
    ]);
    const record = { operation: "F014D_ACTOR_DIRECT_PERCEPTION", subject: { actor_id: "a1" } };
    expect(RefereeDecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it("the referee_decision and epistemic_access_event kinds carry no actor-observation governing citation", () => {
    for (const id of ["referee_decision", "epistemic_access_event"] as const) {
      const kind = factKind(id);
      const citations = [kind.rule, ...(kind.alternateRules ?? []).map((a) => a.rule)];
      for (const c of citations)
        expect(JSON.stringify(c), id).not.toMatch(/actor.?(direct|observ)/i);
    }
    expect(
      ALL_FACT_KINDS.map((k) => k.id)
        .filter((id) => /actor/.test(id))
        .sort(),
    ).toEqual([
      "actor_physical_presence",
      "actor_setup_placement",
      "named_actor_capability",
      "named_actor_capability_basis",
      "world_actor_coupling",
    ]);
  });

  it("the owner path refuses a fabricated actor-observation referee decision: nothing is written", async () => {
    const s = await r1Scene(tempDir());
    const kind = factKind("referee_decision");
    const key = refereeDecisionKey("a".repeat(64));
    const head = s.campaign.store.head();
    const forged = await s.campaign.store.commit({
      campaign_id: head.campaign_id,
      group_id: "forged-g",
      intent_id: "forged-i",
      owner: kind.owner,
      facet: kind.facet,
      cause: "forged",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: {
            operation: "F014D_ACTOR_DIRECT_PERCEPTION",
            subject: { actor_id: "actor-smith" },
            verdict: "OBSERVATION_ESTABLISHED",
          } as never,
          unit: null,
          basis: "forged",
          secrecy: "forged",
          expected_version: 0,
        },
      ],
    });
    expect(forged.ok).toBe(false);
    expect(s.campaign.store.getFact(key)).toBeUndefined();
    expect(s.campaign.store.head()).toEqual(head);
    await s.campaign.close();
  });
});

describe("R1 presence is not sensory clearance", () => {
  it("the foundation document says H1 and the S1 sensory design are unbuilt, not passed", () => {
    const doc = readFileSync("docs/actor-presence-foundation.md", "utf8");
    expect(doc).toContain("H1 and the S1 sensory design");
    expect(doc).toContain("unbuilt, not passed");
    expect(doc).toContain("presence at a locus (B2) is not a viewpoint");
  });
});
