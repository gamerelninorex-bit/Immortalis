// Static trust-boundary evidence for the player-safe supported-play briefing. The briefing composes disclosures that already exist: it
// writes nothing, binds nothing, launches nothing, holds no clock, randomness, environment or network surface, and never calls the Glance
// gateway or builds its trusted context itself (the one binder call and the one gateway call stay in the player-view module, which the
// player-view security suite pins). Behavioural evidence is in tests/integration/play-context*.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { code } from "../support/f027.ts";

const MODULE = "apps/phone/src/play-context.ts";

describe("the briefing composer has no write, mint, launch or direct gateway surface", () => {
  const src = code(MODULE);

  it("writes nothing and mints no binding", () => {
    expect(src).not.toMatch(
      /\.commit\(|\.registerObject\(|\.advance\(|\.dispatch\(|\.launch\(|writeFile|appendFile|createExclusive|appendDurable|truncate|rmSync|unlink|establishCanonicalTime|establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|establishPcPhysicalLocusCustody|CanonicalCampaign\.create|createFileCampaign|bindPlayerViewHost|runPlayerViewBindCli|runPlayerViewMcpCli/,
    );
  });

  it("opens no network, process, dynamic code, clock, randomness or environment surface", () => {
    expect(src).not.toMatch(
      /\bfetch\b|node:(?:http|https|net|child_process|vm|worker_threads)|\beval\b|new Function|process\.env|\bDate\.now\b|new Date\(|Math\.random|randomBytes|randomUUID|setTimeout|setInterval/,
    );
  });

  it("neither builds the trusted context nor calls the gateway: those stay in the player-view module", () => {
    expect(src).not.toMatch(/bindTrustedCurrentPlayerContext\(|readCurrentObservationGlance\(/);
    expect(src).toMatch(/readPlayerViewGlanceOnOpen\(/);
    // the inner request is the one strict operation, and the host supplies nothing of it
    expect(src).toMatch(/playerViewRequestOf\(undefined\)/);
  });

  it("keeps no cache, summary or registry of its own", () => {
    expect(src).not.toMatch(/new Map\(|new Set\(|WeakMap|localStorage|\bcache\b|memoi[sz]e\(/i);
  });

  it("opens the campaign once, closes it, and reads the package through the existing readers", () => {
    expect(src.match(/openCharacterCampaign\(/g)).toHaveLength(1);
    expect(src.match(/CanonicalCampaign\.open/g) ?? []).toHaveLength(0);
    expect(src.match(/\.listFacts\(\)/g)).toHaveLength(1);
    expect(src.match(/campaign\.close\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/readLocality\(/);
    expect(src).toMatch(/characterStateOf\(/);
    expect(src).toMatch(/playOf\(/);
  });
});

describe("the tool declares itself read-only and is not a replayable action", () => {
  const tools = readFileSync("apps/phone/src/chat-tools.ts", "utf8");
  const at = tools.indexOf('name: "get_play_context"');
  const body = tools.slice(at, tools.indexOf("simple(", at));

  it("is a player-scope, read-only, idempotent tool with no arguments and is not an ordinary action", () => {
    expect(at).toBeGreaterThan(0);
    expect(body).toMatch(/inputSchema: NONE/);
    expect(body).toMatch(/readOnlyHint: true, idempotentHint: true, openWorldHint: false/);
    expect(body).toMatch(/scope: "player"/);
    expect(body).not.toMatch(/ordinaryAction|replayable/);
  });

  it("refuses any argument before it reads anything", () => {
    expect(body).toMatch(
      /onlyKeys\(args, \[\]\) \? playContext\(runs\) : text\("this tool takes no arguments", true\)/,
    );
  });
});
