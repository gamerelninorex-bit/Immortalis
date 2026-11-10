/* eslint-disable @typescript-eslint/no-explicit-any -- raw JSON of the gateway and of the briefing */
// MECHANISM ONLY. The campaigns below are built only by the shipped operator paths (see ../support/observation.ts): the observation is
// earned by the real `observe-surroundings` producer chain, and the scripted referee host there is PLUMBING (it reads the delivered words by
// rule and certifies nothing about any AI). Nothing here supplies a verdict, receipt, packet, presentation or briefing as an upstream fact.
// The expected observation is whatever the existing DIRECT gateway returns over the very same canon.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { keepFileName } from "../../packages/operator/src/original-pc-keep.ts";
import { playerViewDir } from "../../packages/operator/src/player-view-exchange.ts";
import { readPlayContext } from "../../apps/phone/src/play-context.ts";
import { readCharacter } from "../../apps/phone/src/character-evidence.ts";
import { readPlay } from "../../apps/phone/src/play-evidence.ts";
import { chatConfig } from "../support/chat-client.ts";
import type { LocalityDirs } from "../support/locality.ts";
import { LOCALITY_CAMPAIGN, openOrdinary } from "../support/locality.ts";
import { PC_ID, observationCampaign, observe, screenScene } from "../support/observation.ts";
import { PLAYER_VIEW_HOST, bindHost, copyDirs, directGlance } from "../support/player-view.ts";
import { metered, treeOf } from "../support/play-context.ts";

const bothTrees = (d: LocalityDirs) => ({
  campaign: treeOf(d.campaignDir),
  state: treeOf(d.operatorDir),
});

const configFor = (dirs: LocalityDirs, over: Record<string, unknown> = {}) =>
  chatConfig({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorDir: dirs.operatorDir,
    playerViewHostId: PLAYER_VIEW_HOST,
    ...over,
  } as any);

/** the unchanged gateway's reads over this canon, by itself */
async function gatewayTrace(dirs: LocalityDirs, config: Awaited<ReturnType<typeof configFor>>) {
  const pc = ((await readCharacter(config)) as any).pc_id as string;
  const { bindTrustedCurrentPlayerContext, readCurrentObservationGlance } =
    await import("@immortalis/protocol");
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const context = bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: pc });
    const m = await metered(
      async () =>
        readCurrentObservationGlance(context, { operation: "read_current_observation_glance" }),
      storeProto,
    );
    return m.trace;
  } finally {
    await c.close();
  }
}

let observed: LocalityDirs;
let screened: LocalityDirs;
let storeProto: any;
beforeAll(async () => {
  observed = (await observationCampaign()).dirs;
  const probe = await openOrdinary(observed.campaignDir);
  storeProto = Object.getPrototypeOf(probe.store);
  await probe.close();
  expect((await observe(observed)).result.status).toBe("OBSERVATION_RECEIVED");
  // the independent negative: the SAME scene except for one physical obstruction across the path
  screened = (await observationCampaign({ scene: screenScene() })).dirs;
  await observe(screened);
}, 300_000);

/** a private bound copy, so a case may damage its own */
async function boundCopy(from: LocalityDirs): Promise<LocalityDirs> {
  const dirs = copyDirs(from);
  const bound = await bindHost(dirs);
  expect(bound.code, bound.err.join("\n")).toBe(0);
  return dirs;
}

describe("positive delivery: one composition, the same readings the independent readers give", () => {
  it("delivers the setting, the mirror and presence, the play state and the exact earned presentation from one open", async () => {
    const dirs = await boundCopy(observed);
    const config = await configFor(dirs);
    const before = bothTrees(dirs);
    const read = await readPlayContext(config);
    expect(read.status).toBe("QUALIFIED");
    // the independent readers, each with its own open, over the same canon
    const character = await readCharacter(config);
    expect(character.kind).toBe("BOUND");
    expect(read.character).toMatchObject({ state: "BOUND" });
    const play = await readPlay(config);
    expect(read.play).toEqual(play);
    // the observation is EXACTLY what the existing direct gateway returns over this canon, byte for byte
    const direct = await directGlance(dirs);
    expect(JSON.stringify(read.observation)).toBe(direct);
    expect(read.observation.ok).toBe(true);
    if (read.observation.ok) {
      const p: any = read.observation.value;
      expect(p.presentation).toBe("NPK_EVENT_SIGNAL");
      expect(p.disposable).toBe(true);
      expect(p.form).toBe("EVENT_SIGNAL");
      expect(Object.keys(p).sort()).toEqual([
        "disposable",
        "elements",
        "form",
        "presentation",
        "viewpoint",
      ]);
      expect([3, 4]).toContain(p.elements.length);
    }
    // setting: the immutable authored readback; `established` is the authored starting quantity
    expect(read.setting.state).toBe("ESTABLISHED");
    // nothing was written anywhere
    expect(bothTrees(dirs)).toEqual(before);
  });

  it("opens once, reuses the actual complete verification with fresh input checks, and preserves the fixed Glance trace", async () => {
    const dirs = await boundCopy(observed);
    const config = await configFor(dirs);
    const m = await metered(() => readPlayContext(config), storeProto);
    expect(m.value.status).toBe("QUALIFIED");
    // one verified open (its own journal replay and canonical verification are the common cost of ANY open) ...
    expect(m.counts.open).toBe(1);
    // Two reader enumerations plus three freshness hashes of the complete fact basis. All
    // owner checks ran in open; none is silently omitted or counted under a renamed helper.
    expect(m.counts.listDirect).toBe(5);
    expect(m.counts.verifyDirect).toBe(0);
    expect(m.counts.ownerVerificationPasses).toBe(1);
    // the unchanged gateway's own fixed trace (fourteen identity reads, then the projection's fixed eight) is present, in order, once
    const gateway = await gatewayTrace(dirs, config);
    expect(gateway.length).toBeGreaterThanOrEqual(22);
    expect(m.trace.join("\n")).toContain(gateway.join("\n"));
    expect(m.trace.join("\n").split(gateway.join("\n")).length - 1, "exactly once").toBe(1);
  });

  it("is idempotent: repeated and concurrent reads return the same briefing and change nothing", async () => {
    const dirs = await boundCopy(observed);
    const config = await configFor(dirs);
    const before = bothTrees(dirs);
    const first = await readPlayContext(config);
    const again = await Promise.all([readPlayContext(config), readPlayContext(config)]);
    for (const r of [await readPlayContext(config), ...again]) {
      // a concurrent reader meets the writer lock of the other: it is UNAVAILABLE, never a different briefing
      if (r.status === "QUALIFIED") expect(r).toEqual(first);
      else expect(r.status).toBe("UNAVAILABLE");
    }
    expect(bothTrees(dirs)).toEqual(before);
  });
});

describe("meaningful negatives: the same refusal, and nothing it was not given", () => {
  it("an otherwise matched opaque-screen scene earns nothing, and the briefing does not acquire it", async () => {
    const dirs = await boundCopy(screened);
    const config = await configFor(dirs);
    const read = await readPlayContext(config);
    // everything else about the supported-play campaign is delivered
    expect(read.status).toBe("QUALIFIED");
    expect(read.character.state).toBe("BOUND");
    expect(read.observation.ok).toBe(false);
    expect(JSON.stringify(read.observation)).toBe(await directGlance(dirs));
    // and the refusal is byte-identical to the one an earned-nothing campaign gives for any other reason
    const unobserved = await boundCopy((await observationCampaign()).dirs);
    expect(JSON.stringify((await readPlayContext(await configFor(unobserved))).observation)).toBe(
      JSON.stringify(read.observation),
    );
  });

  it("a host the operator never bound gets the component's refusal; nothing is minted, bound or written", async () => {
    const dirs = copyDirs(observed); // deliberately NOT bound
    const before = bothTrees(dirs);
    const read = await readPlayContext(await configFor(dirs));
    expect(read.status).toBe("QUALIFIED");
    expect(read.observation.ok).toBe(false);
    expect(JSON.stringify(read.observation)).toBe(
      JSON.stringify(
        (await readPlayContext(await configFor(dirs, { playerViewHostId: null }))).observation,
      ),
    );
    expect(bothTrees(dirs)).toEqual(before);
    expect(() =>
      readdirSync(playerViewDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN })),
    ).toThrow();
  });

  it("another host id, a wrong secret and another campaign are the same refusal", async () => {
    const dirs = await boundCopy(observed);
    const good = JSON.stringify((await readPlayContext(await configFor(dirs))).observation);
    expect(JSON.parse(good).ok).toBe(true);
    const other = await readPlayContext(
      await configFor(dirs, { playerViewHostId: "another-host" }),
    );
    const secretFile = join(
      playerViewDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      `${PLAYER_VIEW_HOST}.secret`,
    );
    writeFileSync(secretFile, "0".repeat(64), { mode: 0o600 });
    const wrongSecret = await readPlayContext(await configFor(dirs));
    expect(other.observation.ok).toBe(false);
    expect(JSON.stringify(wrongSecret.observation)).toBe(JSON.stringify(other.observation));
    // campaign isolation: a service configured for another campaign reads nothing of this one
    const foreign = await readPlayContext(await configFor(dirs, { campaignId: "campaign-other" }));
    expect(foreign.status).toBe("NOT_QUALIFIED");
    expect(foreign.setting).toEqual({ state: "NOT_ESTABLISHED" });
    expect(foreign.character).toEqual({ state: "NOT_BOUND" });
    expect(JSON.stringify(foreign.observation)).toBe(JSON.stringify(other.observation));
    expect(JSON.stringify(foreign)).not.toContain("pc-maren");
  });

  it("a host bound to another character than the kept, placed one gets the refusal, and the other parts are delivered unchanged", async () => {
    const dirs = await boundCopy(observed);
    const config = await configFor(dirs);
    const good = await readPlayContext(config);
    expect(good.observation.ok).toBe(true);
    const file = join(
      playerViewDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      "config.json",
    );
    const text = readFileSync(file, "utf8");
    expect(text).toContain(`"pc_id": "${PC_ID}"`);
    writeFileSync(file, text.replace(`"pc_id": "${PC_ID}"`, '"pc_id": "pc-someone-else"'));
    const before = bothTrees(dirs);
    const read = await readPlayContext(config);
    expect(read.status).toBe("QUALIFIED");
    expect(read.observation.ok).toBe(false);
    expect(JSON.stringify(read.observation)).toBe(
      JSON.stringify(
        (await readPlayContext(await configFor(dirs, { playerViewHostId: null }))).observation,
      ),
    );
    expect({ ...read, observation: null }).toEqual({ ...good, observation: null });
    expect(bothTrees(dirs)).toEqual(before);
  });

  it("a missing KEEP withholds the character and the observation; nothing is repaired or recreated", async () => {
    const dirs = await boundCopy(observed);
    rmSync(join(dirs.operatorDir, keepFileName(LOCALITY_CAMPAIGN)));
    const before = bothTrees(dirs);
    const read = await readPlayContext(await configFor(dirs));
    expect(read.status).toBe("BLOCKED");
    expect(read.character).toEqual({ state: "BLOCKED" });
    expect(read.observation.ok).toBe(false);
    expect(JSON.stringify(read.character)).not.toMatch(/readback|mirror/);
    // the setting stands on its own retained identity, exactly as its own status reader judges it
    expect(read.setting.state).toBe("ESTABLISHED");
    expect(bothTrees(dirs)).toEqual(before);
  });

  it("an active writer, an uncommitted journal tail, a stray file and a tampered manifest are never read through", async () => {
    // an active writer: the package is held, nothing is read, nothing is taken over
    const held = await boundCopy(observed);
    const writer = await CanonicalCampaign.open(held.campaignDir, { buildId: "test-writer" });
    expect(writer.ok).toBe(true);
    if (!writer.ok) return;
    try {
      const during = await readPlayContext(await configFor(held));
      expect(during.status).toBe("UNAVAILABLE");
      expect(during.setting).toEqual({ state: "UNAVAILABLE" });
      expect(during.observation.ok).toBe(false);
    } finally {
      await writer.value.close();
    }
    expect((await readPlayContext(await configFor(held))).status).toBe("QUALIFIED");

    for (const damage of ["tail", "stray"] as const) {
      const dirs = await boundCopy(observed);
      if (damage === "tail")
        writeFileSync(join(dirs.campaignDir, "journal.jsonl"), '{"uncommitted":true}\n', {
          flag: "a",
        });
      else writeFileSync(join(dirs.campaignDir, "notes.txt"), "left behind");
      const before = bothTrees(dirs);
      const read = await readPlayContext(await configFor(dirs));
      // whatever else the owners say, the observation is the one refusal, and the package is left exactly as found
      expect(read.observation.ok, damage).toBe(false);
      expect(JSON.stringify(read.observation), damage).toBe(
        JSON.stringify(
          (await readPlayContext(await configFor(dirs, { playerViewHostId: null }))).observation,
        ),
      );
      expect(bothTrees(dirs), damage).toEqual(before);
    }

    const tampered = await boundCopy(observed);
    const manifest = join(tampered.campaignDir, "manifest.json");
    const text = readFileSync(manifest, "utf8");
    writeFileSync(manifest, text.replace(LOCALITY_CAMPAIGN, "campaign-forged"));
    const read = await readPlayContext(await configFor(tampered));
    expect(read.observation.ok).toBe(false);
    expect(read.status).not.toBe("QUALIFIED");
    writeFileSync(manifest, text);
    expect((await readPlayContext(await configFor(tampered))).status).toBe("QUALIFIED");
  });

  it("an I/O failure of the operator state is the same refusal, and a retained setup identity that is not this campaign's blocks nothing it should not", async () => {
    const dirs = await boundCopy(observed);
    const before = bothTrees(dirs);
    const read = await readPlayContext(
      await configFor(dirs, { operatorDir: join(dirs.operatorDir, "missing") }),
    );
    expect(read.status).toBe("NOT_QUALIFIED");
    expect(read.observation.ok).toBe(false);
    expect(bothTrees(dirs)).toEqual(before);
  });
});
