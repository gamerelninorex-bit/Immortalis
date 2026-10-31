/* eslint-disable @typescript-eslint/no-explicit-any -- scripted hostile hosts and retained owner records */
// BLUE R-1 (6538562410), ratified current-look clauses 4, 6, 8. MECHANISM ONLY; no genuine-host or Health-completeness claim.
import { expect, it } from "vitest";
import { RefereeAdjudicationAdapter } from "@immortalis/engine";
import { taskDocument } from "../../packages/operator/src/referee-exchange.ts";
import {
  contextDigest,
  observationContext,
  recordContextViolation,
  refereeTaskId,
} from "../../packages/engine/src/referee/derive.ts";
import { openOrdinary } from "../support/locality.ts";
import { BASIS, PC_ID, PC_WORDS, observe, redScene, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import { originalCollectionCampaign } from "../support/pc-collection-original.ts";
import {
  bindScene,
  perceptionAnswer,
  perceptionPolicy,
  scenePolicy,
  startScene,
} from "../support/scene.ts";

const explanation = "facing the woodpile, eyes open";

it("GM prose supplies no viewing position; typed feasibility cannot be laundered into sensory evidence, and same-basis rewording retains the unresolved reading", async () => {
  const { dirs } = await originalCollectionCampaign({
    scene: redScene(),
    presence: PC_WORDS.presenceBare,
  });
  await bindScene(dirs.operatorDir);
  const gm = startScene(dirs.operatorDir, scenePolicy({ statement: explanation }));
  try {
    const policy = perceptionPolicy(plainPolicy);
    const first = await observe(
      dirs,
      verbConsole("observe-surroundings"),
      { attention: "at the woodpile" },
      policy,
    );
    expect(first.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    let c = await openOrdinary(dirs.campaignDir);
    let held: readonly any[];
    try {
      held = c.store.listFacts();
      const viewing = held.find((f) => f.key.includes("/current-viewing/"));
      expect(viewing.value.circumstance.statement).toBe(explanation); // journal explanation remains untouched
      const adapter = new RefereeAdjudicationAdapter(c.store);
      const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0 });
      if (!task.ok) throw new Error(JSON.stringify(task.error));
      const { context, task_id } = task.value;
      expect(JSON.stringify(context)).not.toContain(explanation);
      const delivered = context.facts.find((f) => f.from === "viewing")!;
      expect(JSON.parse(delivered.text)).toEqual({
        state: "SUPPORTED",
        observed_at: BASIS,
        basis: viewing.value.basis,
        ruling: viewing.value.ruling,
        ruled_by: viewing.value.ruled_by,
        custodian: viewing.value.custodian,
      });
      const doc = { task_id, context };
      const hostDocument = taskDocument(task_id, context, "fixture-nonce");
      expect(JSON.stringify(hostDocument)).not.toContain(explanation);
      expect(hostDocument.purpose).toContain("position is NOT_ESTABLISHED");
      expect(hostDocument.premise_kinds).toMatchObject({
        CURRENT_VIEWING: expect.stringContaining(
          "Cannot establish faculty, position, path or payload",
        ),
      });
      const honest = perceptionAnswer(doc);
      expect(honest.position.state).toBe("NOT_ESTABLISHED");
      expect(adapter.evaluateObservation(context, honest)).toMatchObject({
        ok: true,
        value: { verdict: "OBSERVATION_UNRESOLVED" },
      });
      const hostile = perceptionAnswer(doc, { useViewingAsPosition: true });
      expect(adapter.evaluateObservation(context, hostile)).toMatchObject({
        ok: false,
        error: { code: "DECISION_INCOHERENT" },
      });
      hostile.position.premises[0].from = "WORLD_FACT";
      expect(adapter.evaluateObservation(context, hostile)).toMatchObject({
        ok: false,
        error: { code: "COVERAGE_INCOMPLETE" },
      });
      hostile.position.premises[0] = {
        from: "CURRENT_VIEWING",
        ref: "viewing.current",
        evidence_quote: explanation,
      };
      expect(adapter.evaluateObservation(context, hostile)).toMatchObject({
        ok: false,
        error: { code: "GROUNDS_UNSUPPORTED" },
      });

      // Old reference semantics cannot be silently accepted by weakening exact-context verification.
      const current = held.find((f) => f.value.operation === "F014D_DIRECT_PERCEPTION").value;
      const oldContext = {
        ...context,
        facts: context.facts.map((f) =>
          f.from === "viewing"
            ? {
                ...f,
                label: "current viewing circumstance (published by the physical custodian)",
                text: explanation,
              }
            : f,
        ),
      };
      const oldTask = refereeTaskId(oldContext);
      const oldRecord = {
        ...current,
        task_id: oldTask,
        input: { ...current.input, digest: contextDigest(oldContext) },
        decision: { ...current.decision, task_id: oldTask },
      };
      expect(recordContextViolation(oldRecord, (k) => c.store.getFact(k))).toMatchObject({
        code: "DECISION_INCOHERENT",
        message: "the record's digests are not those of the context built from the cited facts",
      });

      const facts = new Map(held.map((f) => [f.key, f]));
      const measure = () => {
        const reads: string[] = [];
        const built = observationContext(
          (k) => {
            reads.push(k);
            return facts.get(k);
          },
          { campaign_id: context.campaign_id, pc_id: PC_ID, attempt: 0, observed_at: BASIS },
        );
        return { reads, built };
      };
      const small = measure();
      for (let i = 0; i < 40; i++)
        facts.set(`unrelated/${i}`, { ...viewing, key: `unrelated/${i}` });
      expect(measure()).toEqual(small); // no growth with unrelated retained history; identical reads and context
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
    const asked = gm.answered.length;
    for (const words of ["look at the same pile", "look around again"]) {
      const again = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: words },
        policy,
      );
      expect(again.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    }
    expect(gm.answered.length).toBe(asked + 2); // wording classifications only; physical and perception decisions stay sealed
    c = await openOrdinary(dirs.campaignDir);
    try {
      const after = c.store.listFacts();
      for (const f of held!) expect(c.store.getFact(f.key)).toEqual(f);
      expect(after.filter((f) => /^access\/[^/]+\/event$/.test(f.key))).toHaveLength(0);
      expect(
        after.filter((f) => f.value && (f.value as any).operation === "F014D_DIRECT_PERCEPTION"),
      ).toHaveLength(1);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  } finally {
    await gm.stop();
  }
}, 300_000);

for (const body of [
  "One ordinary human body; I am permanently blind and have no visual faculty",
  "One ordinary human body; visual faculty is unresolved",
])
  it(`a sensor-limited PC receives no sight despite favourable GM prose: ${body}`, async () => {
    const { dirs } = await originalCollectionCampaign({
      scene: redScene(),
      body,
      presence: PC_WORDS.presence,
    });
    await bindScene(dirs.operatorDir);
    // Even an over-permissive scripted scene ruling cannot supply the missing sight to the perception decision.
    const gm = startScene(dirs.operatorDir, scenePolicy({ statement: explanation }));
    try {
      const r = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        {},
        perceptionPolicy(plainPolicy),
      );
      expect(r.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
      const c = await openOrdinary(dirs.campaignDir);
      try {
        const all = c.store.listFacts();
        const decision: any = all.find(
          (f) => (f.value as any).operation === "F014D_DIRECT_PERCEPTION",
        )!.value;
        expect(decision.decision.faculty.state).toBe("NOT_ESTABLISHED");
        expect(decision.verdict).toBe("OBSERVATION_UNRESOLVED");
        expect(all.some((f) => /^access\/[^/]+\/event$/.test(f.key))).toBe(false);
        expect(c.verify()).toEqual([]);
      } finally {
        await c.close();
      }
    } finally {
      await gm.stop();
    }
  }, 300_000);
