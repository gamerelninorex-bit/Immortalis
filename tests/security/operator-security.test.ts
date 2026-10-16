// Security and trust-boundary evidence for the local operator command-and-reopen mechanism. Static checks over the package's own
// source plus bounded behavioural checks over a real journey. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED);
// no remote authentication is implemented or claimed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { advance, relocate } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import {
  RELOCATE_INPUT,
  copyCampaign,
  ctxOf,
  openSession,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";

const SRC = "packages/operator/src";
const files = readdirSync(SRC).map((f) => `${SRC}/${f}`);
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);

let template: string;
beforeAll(async () => {
  template = await seedTemplate();
}, 120_000);

describe("the mechanism cannot reach authority it was not given", () => {
  it("imports only node built-ins, zod and the contracts, engine and protocol packages: no fixture, testkit or test support", () => {
    for (const f of files)
      for (const s of specifiers(f))
        expect(
          s.startsWith("node:") ||
            s.startsWith("./") ||
            ["zod", "@immortalis/contracts", "@immortalis/engine", "@immortalis/protocol"].includes(
              s,
            ),
          `${f} imports ${s}`,
        ).toBe(true);
    for (const f of files) expect(code(f), f).not.toMatch(/SYNTH|FIXTURE|testkit|fixture/);
  });

  it("opens no network, process, dynamic-code or environment surface", () => {
    for (const f of files)
      expect(identifiers(f), f).not.toMatch(
        /\bfetch\b|node:(?:http|https|net|tls|dgram|child_process|vm|worker_threads|cluster)|\beval\b|new Function|process\.env|\brequire\(|import\(/,
      );
  });

  it("never writes canon itself: no owner publication, store commit, temporal registration, clock or advance outside the two gateways", () => {
    // `locality.ts` is the one module the original-locality brief authorizes to create the package and to call the three existing
    // World-State operations; it is bound by its own, narrower check (tests/conformance/original-locality-conformance.test.ts).
    // `original-pc.ts` is likewise the one module the original-PC brief authorizes to call `releasePlayerCharacter` and
    // `bindPlayerCharacter`; it is bound by its own, narrower checks (tests/conformance/original-pc-conformance.test.ts and
    // tests/security/original-pc-security.test.ts).
    // `time-initialization.ts` is the one module the bounded semantic delegation authorizes to call `establishCanonicalTime` (once, from the
    // author's owner-verified, separately confirmed starting chronology); it is bound by its own, narrower check
    // (tests/conformance/time-initialization-conformance.test.ts).
    for (const f of files.filter(
      (x) =>
        !x.endsWith("/locality.ts") &&
        !x.endsWith("/original-pc.ts") &&
        !x.endsWith("/time-initialization.ts"),
    ))
      expect(identifiers(f), f).not.toMatch(
        /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|continueRemainder|commitPcVoluntaryMovement|establishPcMovementRequest|commitMovement|\.dispatch\(|establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|establishPcPhysicalLocusCustody|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bfactKind\b/,
      );
  });

  it("uses exactly the five existing host operations (two stop-at-delivery, two NULL-PC, one active-PC target) and the five PROVISIONAL CPAA-C1 collection operations (commit, reach task, reach reading, start, and the unadopted D-1 cessation), each once, and no other protocol entry", () => {
    const all = files.map((f) => identifiers(f)).join("\n");
    expect(all.match(/commitConfirmedPcRelocation\(/g)).toHaveLength(1);
    expect(all.match(/advanceConfirmedPcTransferToDelivery\(/g)).toHaveLength(1);
    expect(all.match(/advanceNullPcOocToTarget\(/g)).toHaveLength(1);
    expect(all.match(/resumeNullPcOocHeldAdvance\(/g)).toHaveLength(1);
    expect(all.match(/bindTrustedNullPcOocTargetAdvanceContext\(/g)).toHaveLength(1);
    expect(all.match(/bindTrustedNullPcOocHeldContinuationContext\(/g)).toHaveLength(1);
    expect(all.match(/advanceActivePcToTarget\(/g)).toHaveLength(1);
    expect(all.match(/bindTrustedActivePcTargetAdvanceContext\(/g)).toHaveLength(1);
    expect(all.match(/bindTrustedActivePcHeldTargetAdvanceContext\(/g)).toHaveLength(1);
    // CPAA-C1 v0.2 PROVISIONAL: the confirmed collection path, each operation once, bound only from what the operator's own console confirmed
    expect(all.match(/commitConfirmedPcCollection\(/g)).toHaveLength(1);
    expect(all.match(/getPcCollectionReachTask\(/g)).toHaveLength(1);
    expect(all.match(/submitPcCollectionReach\(/g)).toHaveLength(1);
    expect(all.match(/startConfirmedPcCollection\(/g)).toHaveLength(1);
    expect(all.match(/bindTrustedConfirmedPcCollectionContext\(/g)).toHaveLength(1);
    expect(all).not.toMatch(/readCurrentEventSignalPresentation|bindTrustedEventSignalContext/);
    // BLUE v5.2: the trusted-side-only causal Event-Signal delivery is used exactly once, by the observation command, for the ONE event that
    // command itself just earned (the binder's own contract: "TRUSTED-SIDE ONLY - never reachable from a host request"); no other operator
    // module touches it, and a host's request names nothing but the operation
    expect(all.match(/bindTrustedCausalEventSignalContext\(/g)).toHaveLength(1);
    expect(all.match(/deliverCausalEventSignalPresentation\(/g)).toHaveLength(1);
    for (const f of files.filter((x) => !x.endsWith("/observation.ts")))
      expect(identifiers(f), f).not.toMatch(
        /deliverCausalEventSignalPresentation|bindTrustedCausalEventSignalContext/,
      );
    // the local player-view transport (BLUE v5.2 bounded brief 2026-10-15) names exactly one further operation, the read-only current
    // observation Glance, and is bound by its own checks (tests/security/player-view-mcp-security.test.ts)
    const playerView = files
      .filter((f) => f.includes("/player-view"))
      .map((f) => code(f))
      .join("\n");
    expect([...new Set(playerView.match(/PROTOCOL_OP_[A-Z_]+/g))]).toEqual([
      "PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE",
    ]);
    const src = files
      .filter((f) => !f.includes("/player-view"))
      .map((f) => code(f))
      .join("\n");
    expect(src.match(/PROTOCOL_OP_[A-Z_]+/g)?.sort()).toEqual([
      "PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET",
      "PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET",
      "PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER",
      "PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER",
      "PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET",
      "PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET",
      "PROTOCOL_OP_CEASE_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_CEASE_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION",
      "PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION",
      "PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK",
      "PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK",
      "PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE",
      "PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE",
      "PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION",
      "PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH",
      "PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH",
    ]);
  });

  it("states the player's authority only through the contracts' own constant, never as a literal, and never takes one from input", () => {
    for (const f of files) {
      expect(code(f), f).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
    }
    const commands = code(`${SRC}/commands.ts`);
    expect(commands.match(/PLAYER_CHOICE_AUTHORITY/g)?.length).toBe(7);
    const cli = identifiers(`${SRC}/cli.ts`);
    expect(cli).not.toMatch(
      /\brole\b|\bpermission\b|PLAYER_CHOICE_AUTHORITY|authored_under|transaction_id|\bpc_id\b/,
    );
  });

  it("invents no delivery boundary: no default, literal time, unit or arithmetic on the declared value anywhere in the package", () => {
    for (const f of files) {
      const src = identifiers(f);
      // the declared value is only parsed from input, retained, compared for equality and handed on
      expect(src, f).not.toMatch(
        /delivery_at\s*[:=]\s*\d|delivery_at[^\n;]*[-+*/]\s*\d|\bLOG_T|\bat\(\d|\bdefault[A-Za-z]*(Delivery|Boundary|Duration|Eta)/i,
      );
      expect(src, f).not.toMatch(/\bDate\.now\b|new Date\(|performance\.now|Math\.random/);
    }
    // no module of the package states a duration, speed, distance or route
    for (const f of files)
      expect(identifiers(f), f).not.toMatch(
        /\b(duration|speed|distance|pathfind|routeFind|travelTime)\b/i,
      );
  });

  it("offers no flag, field or word that can pre-confirm, skip or script a confirmation", () => {
    const cli = readFileSync(`${SRC}/cli.ts`, "utf8");
    expect(cli).not.toMatch(
      /--yes|--confirm\b|--force|--assume|--non-interactive|--auto|--confirmed/,
    );
    for (const f of files)
      expect(identifiers(f), f).not.toMatch(/\bconfirmed\s*[:=?]|\bconfirmed:\s*(true|boolean)/);
  });
});

describe("a real journey stays inside its bounds", () => {
  it("writes only the owners' own facts, in their key spaces: nothing is added that the five existing paths do not publish", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    await advance(ctxOf(s, scriptedTerminal("confirm")));
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !before.has(k));
    const allowed = [
      /^pc\/[^/]+\/movement\/(commitment|request)$/,
      /^logistics\/(commitment|transfer|delivery)\//,
      /^temporal\/(object\/|transaction\/|transaction-authority\/|boundary-index$)/,
      /^world\/[^/]+\/entity\/[^/]+\/transition$/,
    ];
    expect(added.length).toBeGreaterThan(5);
    for (const key of added)
      expect(
        allowed.some((r) => r.test(key)),
        key,
      ).toBe(true);
    // every group the journey published carries the canon-write authority the owners' paths use, authored by no host input
    const stray = s.campaign.store
      .listFacts()
      .filter((f) => !before.has(f.key))
      .map((f) => s.campaign.store.committedGroup(f.provenance.intent_id)!)
      .filter((g) => g.authority.role !== "role.archivist");
    expect(stray).toEqual([]);
    await s.close();
  }, 120_000);

  it("shows the operator only permitted status: no fact key, revision, hash, group or hidden-state identity", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    const t1 = scriptedTerminal("confirm");
    const t2 = scriptedTerminal("confirm");
    const a = await relocate(ctxOf(s, t1), RELOCATE_INPUT);
    const b = await advance(ctxOf(s, t2));
    const shown = [...t1.said, ...t2.said, a.message, b.message].join("\n");
    expect(shown).not.toMatch(
      /sha256|state_sha|revision|journal|group_id|intent_id|operator-advance|operator-intent|operator-confirmation|pc\/|logistics\/|temporal\/|obj-logistics|DEPENDENCY_UNRESOLVED|STOP_AFTER|continuation|held|unresolved/i,
    );
    await s.close();
  }, 120_000);

  it("keeps the retained intents owner-only and outside the campaign package, holding no secret or world fact", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    await advance(ctxOf(s, scriptedTerminal("confirm")));
    await s.close();
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    expect(readdirSync(dirs.campaignDir)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/intents/)]),
    );
    const [file] = readdirSync(dirs.operatorDir);
    const text = readFileSync(join(dirs.operatorDir, file!), "utf8");
    expect(text).not.toMatch(/sha256|state_sha|token|password|secret|credential/i);
    const parsed = JSON.parse(text) as { intents: { kind: string; status: string }[] };
    expect(parsed.intents.map((i) => [i.kind, i.status])).toEqual([
      ["RELOCATION", "COMMITTED"],
      ["ADVANCE", "COMMITTED"],
    ]);
  }, 120_000);
});
