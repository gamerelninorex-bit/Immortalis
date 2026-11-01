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

  it("the referee vocabulary is the four operations of main plus the PC-only GM scene resolution: no actor-subject operation exists", () => {
    expect(RefereeOperationSchema.options).toEqual([
      "I002_CLASSIFY",
      "IR_NATIVE_COMPATIBILITY",
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
      "GM_SCENE_RESOLUTION",
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
      // S1-P1 W1: the actor's raw physical faculty and receptivity, a World-State fact; it is not an observation, a receipt or a packet
      "actor_raw_sensory_state",
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

describe("S1-P1 added physical source premises, not an observation route", () => {
  it("no registered kind or key space can state an observation, a perception, a receipt or a hearing: the observation vocabulary is exactly main's", () => {
    expect(
      ALL_FACT_KINDS.map((k) => k.id)
        .filter((id) => /observ|percept|receipt|hearing|heard|health/.test(id))
        .sort(),
    ).toEqual([]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "epistemic_access").map((k) => k.id)).toEqual([
      "epistemic_access_event",
      "epistemic_accessible_packet",
      "epistemic_sealed_provenance",
    ]);
  });

  it("the full P1 chain commits no referee decision, access event, packet or provenance, and the pure read cannot create one", async () => {
    const { p1Chain, p1Scene, evaluate } = await import("../support/auditory-premises.ts");
    const s = await p1Scene(tempDir());
    await p1Chain(s);
    const result = evaluate(s);
    expect(result.result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    const owners = new Set(s.campaign.store.listFacts().map((f) => f.owner));
    expect([...owners].sort()).toEqual(["named_actor", "temporal_kernel", "world_state"]);
    expect(
      s.campaign.store.listFacts().some((f) => /^(access|epistemic|referee)\//.test(f.key)),
    ).toBe(false);
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
