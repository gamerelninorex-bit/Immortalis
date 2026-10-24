// Scripted host, protocol collection fixture and scripted OAuth client: actual stack mechanism evidence, not a live human/AI witness.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPhoneServer } from "../../apps/phone/src/server.ts";
import { Chat, PLAYER, chatConfig } from "../support/chat-client.ts";
import {
  LOCALITY_CAMPAIGN,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  openOrdinary,
} from "../support/locality.ts";
import { BASIS, PC_ID, observe, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import {
  SALT,
  SALT_TAU,
  collectAndComplete,
  originalCollectionCampaign,
  outcomeAnswer,
} from "../support/pc-collection-original.ts";
import { tempDir } from "../support/tmp.ts";

describe("earned collection-context observation through native chat and reconnect", () => {
  it("delivers independently grounded appearance unchanged after reconnect, then offers a distinct choice requiring its own confirmation", async () => {
    const { dirs } = await originalCollectionCampaign();
    const campaign = await openOrdinary(dirs.campaignDir);
    await collectAndComplete(campaign, "native-glance", 3, "tx-native-glance", {
      unit: BASIS.unit,
      value: BASIS.value + 3 * SALT_TAU,
    });
    await campaign.close();
    const observation = await observe(dirs, verbConsole("observe-surroundings"), {}, (doc) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION"
        ? outcomeAnswer(doc, { of: "scene" })
        : plainPolicy(doc),
    );
    expect(observation.result.status).toBe("OBSERVATION_RECEIVED");
    const dir = tempDir("immortalis-native-collection-glance-");
    const scenarioFile = join(dir, "scenario.json");
    writeFileSync(
      scenarioFile,
      JSON.stringify({
        player_character: PC_ID,
        world: WORLD_ID,
        source: SOURCE_KEY,
        reserve: SALT.reserve,
        quantity_unit: SOURCE_UNIT,
        mechanism: SALT.mechanism,
        basis: SALT.basis,
      }),
      { mode: 0o600 },
    );
    const config = await chatConfig({
      ...dirs,
      campaignId: LOCALITY_CAMPAIGN,
      scenarioFile,
      setupDir: join(dir, "setup"),
      playerViewHostId: "native-glance",
    });
    let app = createPhoneServer(config);
    await app.listen();
    const chat = new Chat(`http://127.0.0.1:${config.port}`);
    try {
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      const first = await chat.call("read_current_observation_glance");
      expect(first.isError, JSON.stringify(first)).toBe(false);
      expect(JSON.stringify(first.data)).toContain("a broad patch of bright red on pale plaster");
      expect(JSON.stringify(first.data)).not.toMatch(
        /117|120|gathering|source-delivery|reserve-salt/,
      );
      await app.close();
      app = createPhoneServer(config);
      await app.listen();
      await chat.init({});
      expect((await chat.call("read_current_observation_glance")).data).toEqual(first.data);
      const before = await openOrdinary(dirs.campaignDir);
      const head = before.store.head().state_sha256;
      await before.close();
      const next = await chat.call("collect", { amount: 1 });
      expect(next.isError, JSON.stringify(next)).toBe(false);
      expect(next.data.state).toBe("AWAITING_CONFIRMATION");
      expect(next.elicited).toEqual([]); // no native input capability was declared and no one confirmed for the human
      await chat.call("cancel_action");
      await chat.call("await_action", { wait_seconds: 1 });
      const after = await openOrdinary(dirs.campaignDir);
      expect(after.store.head().state_sha256).toBe(head);
      await after.close();
    } finally {
      await app.close();
    }
  });
});
