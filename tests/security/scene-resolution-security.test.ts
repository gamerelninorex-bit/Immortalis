// Trust boundary of the GM scene step of a natural look (GM-led first play). The operator module that publishes a scene ruling has no ambient
// authority and only two owner publications, each only from a retained ruling by task identity; no host-facing surface can create, name,
// select or probe a scene fact; the scene facts carry no quantity, material, ownership or Source/Reserve value; and the viewing
// circumstance is not an intrinsic I-002 branch, a Role Registry binding or a Production result. Static checks over source: the behaviour
// they bound is exercised in tests/integration/gm-scene.test.ts and tests/integration/chat-scene.test.ts (MECHANISM ONLY).
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PcCurrentViewingSchema,
  REFEREE_OP_SCENE,
  WorldOutputAppearanceSchema,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, factKind } from "@immortalis/engine";
import { code } from "../support/f027.ts";

const MODULE = "packages/operator/src/scene-resolution.ts";
const src = code(MODULE);

describe("the operator module has no ambient authority", () => {
  it("reaches no network, child process, environment, global state, clock or randomness", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm|fs)|\bfetch\(|process\.env|globalThis|eval\(|new Function|Date\b|Math\.random|randomBytes|setTimeout|setInterval/,
    );
  });

  it("publishes through exactly the two existing-owner operations and no other write, commit, clock, advance or registration", () => {
    expect(src.match(/\.establish[A-Za-z]+\(/g)?.sort()).toEqual([
      ".establishPcCurrentViewing(",
      ".establishWorldOutputAppearance(",
    ]);
    expect(src).not.toMatch(
      /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|\.dispatch\(|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|\bOWNER_|\bFACET_|Reserve|Source|quantity|amount/,
    );
  });

  it("names a ruling only by the task identity the engine derived, and publishes only from the engine's own verdict", () => {
    // the two publications take `ruling_task_id`; nothing here takes a verdict, a statement or an aspect from the caller or the host
    expect(src.match(/ruling_task_id: (?:physical\.)?taskId/g)).toHaveLength(2);
    // the physical question is asked of the basis alone: no wording reaches it, so wording cannot reopen a result
    expect(src).toMatch(/await viewing\(null\)/);
    expect(src).toMatch(/await viewing\(p\.attention\)/);
    expect(src).toMatch(/verdict === "APPEARANCE_RESOLVED"/);
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
        /scene-resolution|establishPcCurrentViewing|establishWorldOutputAppearance|worldPcCurrentViewingKey|worldOutputAppearanceKey/,
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
    expect(tools).not.toMatch(
      /establishPcCurrentViewing|establishWorldOutputAppearance|REFEREE_OP_SCENE|ruling_task_id/,
    );
    const commands = readFileSync("apps/phone/src/commands.ts", "utf8");
    // 240 characters, no control characters, no leading hyphen (an option-like word), no surrounding whitespace
    expect(commands).toMatch(/ATTENTION = /);
    expect(commands).toMatch(/\{0,238\}/);
  });
});

describe("the scene facts are physical-custodian records, not other owners' results", () => {
  it("both kinds are World-State fallback-custodian SEALED kinds: no new owner or facet, not a Role Registry, Production, Epistemic or I-002 kind", () => {
    for (const id of ["world_pc_current_viewing", "world_output_appearance"] as const) {
      const kind = factKind(id);
      expect([kind.owner, kind.facet, kind.lifecycle]).toEqual([
        "world_state",
        "world_fallback_physical_entity",
        "SEALED",
      ]);
    }
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).not.toContain(
      "world_pc_current_viewing",
    );
  });

  it("neither schema has a field that could carry a quantity, material, ownership, count, Source/Reserve value or a perception", () => {
    const forbidden =
      /quantity|amount|count|material|owner(?!$)|reserve|source_key|recoverable|ledger|stock|perceiv|knowledge|receipt|recogni|identity|name/i;
    for (const shape of [PcCurrentViewingSchema.shape, WorldOutputAppearanceSchema.shape])
      expect(Object.keys(shape).filter((k) => forbidden.test(k))).toEqual([]);
    expect(Object.keys(WorldOutputAppearanceSchema.shape.aspects.element.shape).sort()).toEqual([
      "aspect",
      "statement",
    ]);
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
