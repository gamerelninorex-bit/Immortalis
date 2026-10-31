/* eslint-disable @typescript-eslint/no-explicit-any -- scripted host answers and raw owner records */
// BLUE R-1 follow-up. MECHANISM ONLY. The typed ordinary-look feasibility premise carries its ruling pin (the decision key and group) as
// provenance. Like every cited fact key, those references are the engine's, never words of a stated appearance.
import { expect, it } from "vitest";
import { RefereeAdjudicationAdapter } from "@immortalis/engine";
import { openOrdinary } from "../support/locality.ts";
import { PC_ID, PC_WORDS, observe, redScene, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import { originalCollectionCampaign } from "../support/pc-collection-original.ts";
import {
  bindScene,
  perceptionAnswer,
  perceptionPolicy,
  scenePolicy,
  startScene,
} from "../support/scene.ts";

it("an appearance cannot carry the engine references the feasibility premise delivers (ruling key and group), as it cannot carry any cited fact key", async () => {
  const { dirs } = await originalCollectionCampaign({
    scene: redScene(),
    presence: PC_WORDS.presence, // independent affirmative placement: the lawful positive
  });
  await bindScene(dirs.operatorDir);
  const gm = startScene(dirs.operatorDir, scenePolicy());
  try {
    const r = await observe(
      dirs,
      verbConsole("observe-surroundings"),
      { attention: "at the pale material" },
      perceptionPolicy(plainPolicy),
    );
    expect(r.result.status).toBe("OBSERVATION_RECEIVED");
  } finally {
    await gm.stop();
  }
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const adapter = new RefereeAdjudicationAdapter(c.store);
    const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0 });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    const { context, task_id } = task.value;
    const doc = { task_id, context };
    const delivered = JSON.parse(context.facts.find((f) => f.from === "viewing")!.text);
    const good = perceptionAnswer(doc);
    // the control: the lawful positive is accepted
    expect(adapter.evaluateObservation(context, good)).toMatchObject({
      ok: true,
      value: { verdict: "OBSERVATION_ESTABLISHED" },
    });
    const viewingKey = context.refs.find((x) => /current-viewing/.test(x.fact_key))!.fact_key;
    for (const [name, leak] of [
      ["the ruling's decision key", delivered.ruling.fact_key],
      ["the ruling's group", delivered.ruling.group_id],
      ["the viewing fact's own key", viewingKey],
      ["the character identity", PC_ID],
    ] as const)
      for (const field of ["content", "referent"] as const) {
        const hostile: any = JSON.parse(JSON.stringify(good));
        hostile.payload[field] = `a small heap lying beside ${leak}`;
        expect(adapter.evaluateObservation(context, hostile), `${name} in ${field}`).toMatchObject({
          ok: false,
          error: { code: "GROUNDS_UNSUPPORTED" },
        });
      }
  } finally {
    await c.close();
  }
}, 300_000);
