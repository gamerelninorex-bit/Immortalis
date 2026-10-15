/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// BLUE v5.2 — active-PC direct physical observation: the production command, end to end, with a SCRIPTED referee host.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. The scripted host is a policy the TEST wrote that reads the DELIVERED words by regular
// expression (plumbing only). So these tests prove the ENGINE's mechanism: that the receipt, the packet, the provenance and the delivery
// follow causally and in order from a retained, engine-derived reading and from nothing else; that an obstructed or unsettled reading
// earns no receipt and no packet; that time does not move; that nothing outside the owners' own records is written. They prove NOTHING
// about whether any AI reads any sentence correctly: the semantic positive and negative are the real-host exercise under
// docs/evidence/b52-direct-observation-live-host*, and it is the only thing that can establish them.
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  RefereeDecisionRecordSchema,
  SealedEngineProvenanceSchema,
  TemporalObjectSchema,
  TemporalStateSchema,
  ResolutionTransactionSchema,
  accessPacketStage,
  observationRegistrationIntentId,
  worldLocusKey,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_RULE,
  canonicalEqual,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import { readConfig, refereeDir } from "@immortalis/operator";
import { openOrdinary, LOCUS_ID, WORLD_ID } from "../support/locality.ts";
import {
  BASIS,
  LOCALITY_CAMPAIGN,
  PC_ID,
  PC_WORDS,
  SCENE,
  SCREEN,
  observationCampaign,
  observationPolicy,
  observe,
  redScene,
  screenScene,
  verbConsole,
} from "../support/observation.ts";

const keysOf = async (dir: string) => {
  const c = await openOrdinary(dir);
  try {
    return c.store.listFacts().map((f) => f.key);
  } finally {
    await c.close();
  }
};
const records = async (dir: string) => {
  const c = await openOrdinary(dir);
  try {
    return c.store.listFacts().flatMap((f) => {
      const r = RefereeDecisionRecordSchema.safeParse(f.value);
      return r.success && r.data.operation === "F014D_DIRECT_PERCEPTION" ? [r.data] : [];
    });
  } finally {
    await c.close();
  }
};
const headOf = async (dir: string) => {
  const c = await openOrdinary(dir);
  try {
    const h = c.store.head();
    return { revision: h.revision, state: h.state_sha256 };
  } finally {
    await c.close();
  }
};
const noAccessKeys = (keys: string[]) => keys.filter((k) => k.startsWith("access/"));

describe("the positive: an established reading earns the receipt, the packet and the delivery, in causal order", () => {
  it("forms the event, its one-shot engagement and the packet; canonical time does not move", async () => {
    const { dirs } = await observationCampaign();
    const before = await keysOf(dirs.campaignDir);
    const { result, terminal } = await observe(dirs);
    expect(result.status, JSON.stringify(result.details)).toBe("OBSERVATION_RECEIVED");

    // exactly the owners' own records were added: the retained decision, the event, the engagement, the transaction (+ its authority),
    // the packet and its sealed provenance - nothing actor-side, world-side, economic or social
    const after = await keysOf(dirs.campaignDir);
    const added = after
      .filter((k) => !before.includes(k))
      .map((k) => k.replace(/[0-9a-f]{32,64}/g, "<id>"));
    expect(added.sort()).toEqual(
      [
        "access/obs-<id>/event",
        "access/obs-<id>/packet/pc-maren",
        "access/obs-<id>/provenance/pc-maren",
        "referee/<id>/decision",
        "temporal/boundary-index",
        "temporal/object/observation-obs-<id>",
        "temporal/transaction-authority/observation-tx-obs-<id>",
        "temporal/transaction/observation-tx-obs-<id>",
      ].sort(),
    );

    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      const f = (re: RegExp) => c.store.listFacts().filter((x) => re.test(x.key));
      const eventFact = f(/^access\/[^/]+\/event$/)[0]!;
      const packetFact = f(/^access\/[^/]+\/packet\//)[0]!;
      const provFact = f(/^access\/[^/]+\/provenance\//)[0]!;
      const event = AccessEventSchema.parse(eventFact.value);
      const packet = AccessiblePacketSchema.parse(packetFact.value);
      const prov = SealedEngineProvenanceSchema.parse(provFact.value);

      // the event: the observation-earned citation, the active PC, PERCEPTION, the foreign PHYSICAL source, a form that needs no capability
      expect(canonicalEqual(eventFact.provenance.rule, EPISTEMIC_ACCESS_OBSERVATION_RULE)).toBe(
        true,
      );
      expect(canonicalEqual(eventFact.provenance.rule, EPISTEMIC_ACCESS_RULE)).toBe(false);
      expect(event.mode).toBe("BOUNDED_SHARED_ACCESS");
      expect(event.participants).toEqual([PC_ID]);
      expect(event.recipient_role).toBe("role.player_character");
      expect(event.channel).toBe("PERCEPTION");
      expect(event.representation).toBeNull();
      expect(event.established_at).toEqual(BASIS);
      const locus = c.locus(WORLD_ID, LOCUS_ID)!;
      expect(event.source).toEqual({
        owner: "world_state",
        fact_key: worldLocusKey(WORLD_ID, LOCUS_ID),
        version: locus.fact.version,
      });
      expect(eventFact.secrecy).toBe("epistemic.engine-sealed");
      // it reads the decision first and every premise that decision cites
      const group = c.store.committedGroup(eventFact.provenance.intent_id)!;
      expect(group.reads.map((r) => r.key.replace(/[0-9a-f]{64}/, "<task>"))).toEqual([
        "referee/<task>/decision",
        `pc/${PC_ID}/existence-contract`,
        "role-registry/binding/role.player_character",
        `world-state/pc/${PC_ID}/locus-custody`,
        `world/${WORLD_ID}/profile`,
        `world/${WORLD_ID}/locus/${LOCUS_ID}`,
      ]);

      // the packet: actor-accessible, holds the payload and nothing of the source; the provenance is separate, sealed, and holds the source
      expect(packetFact.secrecy).toBe("epistemic.actor-accessible");
      expect(provFact.secrecy).toBe("epistemic.engine-sealed");
      expect(packet.payload).toEqual({
        referent: "a patch on the wall facing the character",
        content: "a broad patch of bright red on pale plaster",
      });
      expect(packet.presented_attribution).toBeNull();
      expect(packet.access).toEqual({
        result: "RECEIVED",
        channel: "PERCEPTION",
        established_at: BASIS,
      });
      expect(packet.intelligibility).toEqual({
        result: "REPRESENTATION_ACCESSIBLE",
        basis: "NO_CAPABILITY_DEPENDENCY",
      });
      const packetText = JSON.stringify(packetFact.value);
      expect(packetText).not.toContain(WORLD_ID);
      expect(packetText).not.toContain(LOCUS_ID);
      expect(packetText).not.toContain("world_state");
      expect(prov.source).toEqual(event.source);
      expect(prov.packet.fact_key).toBe(packetFact.key);
      expect(packetFact.provenance.group_id).toBe(provFact.provenance.group_id);

      // time: unchanged. The one transaction's target is the canonical time itself, it retired the earned boundary and spent the object
      const state = TemporalStateSchema.parse(c.store.getFact("temporal/state")!.value);
      expect(state.canonical_time).toEqual(BASIS);
      expect(state.continuation).toBeNull();
      const txFact = f(/^temporal\/transaction\//)[0]!;
      const tx = ResolutionTransactionSchema.parse(txFact.value);
      expect(state.last_transaction).toBe(tx.transaction_id);
      expect(tx.requested).toEqual({ target: BASIS, condition: null });
      expect(tx.outcome.actual_stop).toEqual(BASIS);
      expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
      expect(tx.outcome.remainder).toBeNull();
      expect(tx.outcome.unresolved_dependents).toEqual([]);
      expect(tx.context).toEqual({
        role: "role.player",
        permission: "permission.player_choice.commit",
      });
      expect(tx.stages).toHaveLength(1);
      expect(tx.stages[0]!.stage).toEqual(accessPacketStage(event.event_id, PC_ID));
      expect(tx.boundaries_crossed).toHaveLength(1);
      expect(tx.boundaries_crossed[0]!.at).toEqual(BASIS);
      expect(tx.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
      const obj = TemporalObjectSchema.parse(f(/^temporal\/object\//)[0]!.value);
      expect(obj.owning_ref.owner).toBe("epistemic_access");
      expect(obj.next_boundary).toBeNull();
      expect(obj.last_resolved_basis).toEqual(BASIS);
      expect(obj.dependencies).toHaveLength(1);
      expect(c.store.getFact("temporal/boundary-index")!.value).toEqual({ entries: [] });

      // committed-before-consumed: decision, event, engagement, transaction authority, packet, transaction
      const rev = (re: RegExp) => c.store.lookupReceipt(f(re)[0]!.provenance.intent_id)!.revision;
      const order = [
        rev(/^referee\/[0-9a-f]{64}\/decision$/),
        rev(/^access\/[^/]+\/event$/),
        // the engagement's own registration (its fact now points at the transaction that retired it)
        c.store.lookupReceipt(observationRegistrationIntentId(event.event_id))!.revision,
        rev(/^temporal\/transaction-authority\//),
        rev(/^access\/[^/]+\/packet\//),
        rev(/^temporal\/transaction\//),
      ];
      expect(order).toEqual([...order].sort((x, y) => x - y));
      expect(new Set(order).size).toBe(order.length);
    } finally {
      await c.close();
    }

    // what the player is shown: the raw appearance only, through the trusted delivery - never the setting, the reasoning or the verdict
    const shown = terminal.said.join("\n") + result.details.join("\n");
    expect(result.details).toContain("contact: PERCEPTION");
    expect(result.details).toContain("referent: a patch on the wall facing the character");
    expect(result.details).toContain("content: a broad patch of bright red on pale plaster");
    for (const hidden of [
      SCENE.geometry,
      SCENE.light,
      SCENE.air,
      SCENE.surface,
      WORLD_ID,
      LOCUS_ID,
      "scripted host",
      "OBSERVATION_",
      "SUPPORTS",
      "BLOCKED",
    ])
      expect(shown, hidden).not.toContain(hidden);
  }, 180_000);

  it("running it again at the same basis reaches the same records: nothing is asked, decided or written", async () => {
    const { dirs } = await observationCampaign();
    const first = await observe(dirs);
    expect(first.result.status).toBe("OBSERVATION_RECEIVED");
    const head = await headOf(dirs.campaignDir);
    const again = await observe(dirs, verbConsole("observe-surroundings"));
    expect(again.result.status).toBe("OBSERVATION_RECEIVED");
    expect(again.terminal.asked()).toBe(0);
    expect(again.result.details).toEqual(first.result.details);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);

  it("declining the separate confirmation leaves nothing observed and the host unasked", async () => {
    const { dirs } = await observationCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, host } = await observe(dirs, verbConsole("observe-surroundings", false));
    expect(result.status).toBe("DECLINED");
    expect(host!.answered).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const tasks = join(
      refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      "tasks",
    );
    const published = readdirSync(tasks).filter((n) => {
      const doc = JSON.parse(readFileSync(join(tasks, n), "utf8"));
      return doc.operation === "F014D_DIRECT_PERCEPTION";
    });
    expect(published).toEqual([]);
  }, 180_000);
});

describe("the independent negative: an otherwise identical scene with a continuous opaque screen earns no receipt and no packet", () => {
  it("the screen scene differs from the red scene by that one physical obstruction, and the patch is still committed", async () => {
    const red = await observationCampaign({ scene: redScene() });
    const screen = await observationCampaign({ scene: screenScene() });
    const locusOf = async (dir: string) => {
      const c = await openOrdinary(dir);
      try {
        return { locus: c.locus(WORLD_ID, LOCUS_ID)!.value, world: c.world(WORLD_ID)!.value };
      } finally {
        await c.close();
      }
    };
    const a = await locusOf(red.dirs.campaignDir);
    const b = await locusOf(screen.dirs.campaignDir);
    expect(b.world).toEqual(a.world);
    expect(
      b.locus.constraints.filter((x) => !a.locus.constraints.some((y) => canonicalEqual(x, y))),
    ).toEqual([{ aspect: "obstruction-1", statement: SCREEN }]);
    expect(
      a.locus.constraints.every((x) => b.locus.constraints.some((y) => canonicalEqual(x, y))),
    ).toBe(true);
    expect(b.locus.constraints.some((x) => x.statement === SCENE.surface)).toBe(true);
    // neither scene states a perception, a receipt, a packet or an expected result
    for (const x of b.locus.constraints)
      expect(x.statement).not.toMatch(
        /\b(sees?|seen|perceiv|receiv|visible|invisible|packet|expected|negative|positive|test)\b/i,
      );
  }, 240_000);

  it("runs the SAME production operation: the screen is a retained OBSTRUCTED reading and nothing else", async () => {
    const { dirs } = await observationCampaign({ scene: screenScene() });
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await observe(dirs);
    expect(result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    // no receipt, no packet, no provenance, no engagement, no transaction; canonical time did not move
    const keys = await keysOf(dirs.campaignDir);
    expect(noAccessKeys(keys)).toEqual([]);
    expect(
      keys.filter((k) => k.startsWith("temporal/object/") || k.startsWith("temporal/transaction")),
    ).toEqual([]);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const state = TemporalStateSchema.parse(c.store.getFact("temporal/state")!.value);
      expect(state).toEqual({ canonical_time: BASIS, last_transaction: null, continuation: null });
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
    // only the bounded sealed evaluation evidence was retained, with the engine-derived physical negative
    const rs = await records(dirs.campaignDir);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.verdict).toBe("OBSERVATION_OBSTRUCTED");
    expect(rs[0]!.decision.path.state).toBe("BLOCKED");
    expect(rs[0]!.decision.payload).toBeNull();
    expect((await headOf(dirs.campaignDir)).revision).toBe(before.revision + 1);
    // the player is told nothing of why, nor of the setting
    const shown = terminal.said.join("\n") + JSON.stringify(result);
    for (const hidden of [
      SCREEN,
      SCENE.surface,
      "red",
      "screen",
      "OBSTRUCTED",
      "BLOCKED",
      "opaque",
    ])
      expect(shown, hidden).not.toContain(hidden);
  }, 180_000);

  it("the interpreter is shown no expected verdict, no test label and no differing instruction in the negative", async () => {
    const red = await observationCampaign({ scene: redScene() });
    const screen = await observationCampaign({ scene: screenScene() });
    const docs: any[] = [];
    for (const { dirs } of [red, screen]) {
      await observe(dirs);
      const tasks = join(
        refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
        "tasks",
      );
      for (const n of readdirSync(tasks)) {
        const doc = JSON.parse(readFileSync(join(tasks, n), "utf8"));
        if (doc.operation === "F014D_DIRECT_PERCEPTION") docs.push(doc.document);
      }
    }
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      const text = JSON.stringify(d);
      expect(text).not.toMatch(
        /\b(expected|negative control|positive control|acceptance|falsif|test case|should be blocked|must be blocked)\b/i,
      );
    }
    // identical but for the facts and the task identity/nonce: the same purpose, rules, vocabulary and shape
    const strip = (d: any) => {
      const rest = { ...d };
      delete rest.task_id;
      delete rest.nonce;
      delete rest.context;
      return rest;
    };
    expect(strip(docs[0])).toEqual(strip(docs[1]));
    expect(docs[0].context.facts.length + 1).toBe(docs[1].context.facts.length);
  }, 240_000);
});

describe("an unsettled premise is UNRESOLVED - never credited as a proved obstruction - and earns no receipt", () => {
  const cases: [
    string,
    Parameters<typeof observationCampaign>[0],
    Parameters<typeof observationPolicy>[0],
  ][] = [
    [
      "a character whose own statements establish no sight",
      { words: { embodiment: PC_WORDS.embodimentBare } },
      {},
    ],
    [
      "a placement that states neither a direction nor open eyes",
      { words: { presence: PC_WORDS.presenceBare } },
      {},
    ],
    ["a path the host cannot settle", {}, { pathUnknown: true }],
  ];
  for (const [name, setup, rule] of cases)
    it(
      name,
      async () => {
        const { dirs } = await observationCampaign(setup);
        const { result } = await observe(dirs, undefined, {}, observationPolicy(rule));
        expect(result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
        expect(noAccessKeys(await keysOf(dirs.campaignDir))).toEqual([]);
        const rs = await records(dirs.campaignDir);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.verdict).toBe("OBSERVATION_UNRESOLVED");
        expect(rs[0]!.verdict).not.toBe("OBSERVATION_OBSTRUCTED");
      },
      180_000,
    );

  it("a contradicted world law (a fact that excludes the perception) is a conflict, not a receipt", async () => {
    const { dirs } = await observationCampaign();
    const { result } = await observe(
      dirs,
      undefined,
      {},
      observationPolicy({ contradicts: /ordinary terrestrial daylight/i }),
    );
    expect(result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect(noAccessKeys(await keysOf(dirs.campaignDir))).toEqual([]);
    expect((await records(dirs.campaignDir))[0]!.verdict).toBe("OBSERVATION_WORLD_CONFLICT");
  }, 180_000);

  it("a reading already retained is never rerolled: asking again at the same basis finds it", async () => {
    const { dirs } = await observationCampaign({ scene: screenScene() });
    await observe(dirs);
    const head = await headOf(dirs.campaignDir);
    const again = await observe(
      dirs,
      verbConsole("observe-surroundings"),
      {},
      observationPolicy({ pathUnknown: true }),
    );
    expect(again.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);
});

describe("the question is built only from committed facts, and only a bound host is asked", () => {
  it("is not available with no canonical basis, no custody, or an unbound character", async () => {
    const noTime = await observationCampaign({ time: false });
    expect((await observe(noTime.dirs)).result.status).toBe("OBSERVATION_NOT_AVAILABLE");
    expect(noAccessKeys(await keysOf(noTime.dirs.campaignDir))).toEqual([]);
    const ghost = await observationCampaign();
    const r = await observe(ghost.dirs, undefined, { pcId: "pc-nobody" });
    expect(r.result.status).toBe("CHARACTER_NONE");
  }, 240_000);

  it("a host bound only to the earlier operations is never asked the direct-perception question", async () => {
    const { dirs } = await observationCampaign();
    const p = { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN };
    const path = join(refereeDir(p), "config.json");
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    cfg.hosts[0].operations = ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY", "IR_PHYSICAL_PLACEMENT"];
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    expect((await readConfig(p, process.getuid!())).ok).toBe(true);
    const head = await headOf(dirs.campaignDir);
    const r = await observe(dirs, undefined, { refereePolls: 3, refereePollMs: 5 });
    expect(r.result.status).toBe("REFEREE_PENDING");
    expect(r.host!.answered).toEqual([]);
    expect((await headOf(dirs.campaignDir)).revision).toBe(head.revision);
  }, 180_000);

  it("a campaign with no host bound at all is unavailable, and writes nothing", async () => {
    const { dirs } = await observationCampaign();
    unlinkSync(
      join(
        refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
        "config.json",
      ),
    );
    const head = await headOf(dirs.campaignDir);
    const r = await observe(dirs, undefined, {}, null);
    expect(r.result.status).toBe("REFEREE_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);

  it("an answer that is invalid is set aside and the question is asked again; a persistent bad host is refused with nothing written", async () => {
    const { dirs } = await observationCampaign();
    const flaky = (doc: any) =>
      doc.context.attempt === 0
        ? observationPolicy({ forcePayload: true, pathUnknown: true })(doc)
        : observationPolicy()(doc);
    const ok = await observe(dirs, undefined, {}, flaky);
    expect(ok.result.status).toBe("OBSERVATION_RECEIVED");
    const bad = await observationCampaign();
    const never = await observe(
      bad.dirs,
      undefined,
      {},
      observationPolicy({ forcePayload: true, pathUnknown: true }),
    );
    expect(never.result.status).toBe("REFEREE_ANSWER_REFUSED");
    expect(noAccessKeys(await keysOf(bad.dirs.campaignDir))).toEqual([]);
    expect(await records(bad.dirs.campaignDir)).toEqual([]);
  }, 300_000);
});
