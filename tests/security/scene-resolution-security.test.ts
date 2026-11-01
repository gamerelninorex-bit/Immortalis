// Trust boundary of the GM scene step of a natural look (GM-led first play). The operator module that publishes a scene ruling has no ambient
// authority and only ONE owner publication (the current viewing circumstance), only from a retained ruling by task identity; no host-facing
// surface can create, name, select or probe a scene fact; the scene fact carries no quantity, material, ownership or Source/Reserve value;
// and the viewing circumstance is not an intrinsic I-002 branch, a Role Registry binding or a Production result. There is no appearance
// fact (31 October 2026 Stage A): the description of a gathered output is narration, never an owner publication. Static checks over source: the behaviour
// they bound is exercised in tests/integration/gm-scene.test.ts and tests/integration/chat-scene.test.ts (MECHANISM ONLY).
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PcCurrentViewingSchema, REFEREE_OP_SCENE, SCENE_KINDS } from "@immortalis/contracts";
import { ALL_FACT_KINDS, factKind, resolveKey } from "@immortalis/engine";
import { code } from "../support/f027.ts";

const MODULE = "packages/operator/src/scene-resolution.ts";
const src = code(MODULE);

describe("the operator module has no ambient authority", () => {
  it("reaches no network, child process, environment, global state, clock or randomness", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm|fs)|\bfetch\(|process\.env|globalThis|eval\(|new Function|Date\b|Math\.random|randomBytes|setTimeout|setInterval/,
    );
  });

  it("publishes through exactly the one existing-owner operation and no other write, commit, clock, advance or registration", () => {
    expect(src.match(/\.establish[A-Za-z]+\(/g)?.sort()).toEqual([".establishPcCurrentViewing("]);
    expect(src).not.toMatch(
      /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|\.dispatch\(|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|\bOWNER_|\bFACET_|Reserve|Source|quantity|amount/,
    );
  });

  it("names a ruling only by the task identity the engine derived, and publishes only from the engine's own verdict", () => {
    // the publication takes `ruling_task_id`; nothing here takes a verdict, a statement or an aspect from the caller or the host
    expect(src.match(/ruling_task_id: (?:physical\.)?taskId/g)).toHaveLength(1);
    // the physical question is asked of the basis alone: no wording reaches it, so wording cannot reopen a result
    expect(src).toMatch(/await viewing\(null\)/);
    expect(src).toMatch(/await viewing\(p\.attention\)/);
    expect(src).toMatch(/verdict !== "VIEWING_SUPPORTED"/);
    expect(src).not.toMatch(/\.statement\b.*establish|aspects\s*:/);
  });

  it("asks nobody anything: no terminal, confirmation or prompt, and the request text goes to the host only as the bounded plain look", () => {
    expect(src).not.toMatch(/terminal|confirm|\.ask\(|prompt|requestOperatorConfirmation/i);
  });
});

describe("no host-facing surface can create, name or probe a scene fact", () => {
  const host = [
    "referee-mcp.ts",
    "referee-exchange.ts",
    "player-view-mcp.ts",
    "player-view.ts",
    "observe-request-mcp.ts",
    "advance-request-mcp.ts",
  ];
  for (const file of host)
    it(`${file} does not import the publishing module or call a scene publication`, () => {
      const text = readFileSync(`packages/operator/src/${file}`, "utf8");
      expect(text).not.toMatch(
        /scene-resolution|establishPcCurrentViewing|worldPcCurrentViewingKey/,
      );
    });

  it("only the operator's observation command imports the publishing module", () => {
    const users = readdirSync("packages/operator/src").filter((f) =>
      /scene-resolution/.test(readFileSync(`packages/operator/src/${f}`, "utf8")),
    );
    expect(users.sort()).toEqual(["observation.ts"]);
  });

  it("the chat tool surface passes the look's words only as the bounded `attention` text; it can name no fact, key, ruling or verdict", () => {
    const tools = readFileSync("apps/phone/src/chat-tools.ts", "utf8");
    expect(tools).not.toMatch(/establishPcCurrentViewing|REFEREE_OP_SCENE|ruling_task_id/);
    const commands = readFileSync("apps/phone/src/commands.ts", "utf8");
    // 240 characters, no control characters, no leading hyphen (an option-like word), no surrounding whitespace
    expect(commands).toMatch(/ATTENTION = /);
    expect(commands).toMatch(/\{0,238\}/);
  });
});

describe("the scene facts are physical-custodian records, not other owners' results", () => {
  it("the one kind is a World-State fallback-custodian SEALED kind: no new owner or facet, not a Role Registry, Production, Epistemic or I-002 kind", () => {
    const kind = factKind("world_pc_current_viewing");
    expect([kind.owner, kind.facet, kind.lifecycle]).toEqual([
      "world_state",
      "world_fallback_physical_entity",
      "SEALED",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).not.toContain(
      "world_pc_current_viewing",
    );
  });

  it("there is no output-appearance kind, rule, scene question or key: the retired route is unrepresentable", () => {
    expect(ALL_FACT_KINDS.map((k) => k.id).filter((id) => /appearance/i.test(id))).toEqual([]);
    expect([...SCENE_KINDS]).toEqual(["CURRENT_VIEWING"]);
    // no registered key space can hold such a record: a commit group writing one is not a registered fact
    expect(
      resolveKey("world/world-ashfall/output-appearance/pc-collect:pc-maren:act-scene"),
    ).toBeNull();
  });

  it("the scene fact has no field that could carry a quantity, material, ownership, count, Source/Reserve value or a perception", () => {
    const forbidden =
      /quantity|amount|count|material|owner(?!$)|reserve|source_key|recoverable|ledger|stock|perceiv|knowledge|receipt|recogni|identity|name/i;
    expect(Object.keys(PcCurrentViewingSchema.shape).filter((k) => forbidden.test(k))).toEqual([]);
  });

  it("the scene operation is its own separately bound operation: the setup and collection hosts' layouts are unchanged", () => {
    const startup = readFileSync("apps/phone/src/referee-startup.ts", "utf8");
    expect(startup).toMatch(/"gm-scene": \[REFEREE_OP_SCENE\]/);
    expect(startup).toMatch(
      /"gm-setup": \[REFEREE_OP_I002, REFEREE_OP_IR, REFEREE_OP_PHYSICAL, REFEREE_OP_OBSERVATION\]/,
    );
    expect(REFEREE_OP_SCENE).toBe("GM_SCENE_RESOLUTION");
  });
});
