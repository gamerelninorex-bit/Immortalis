// The positive contrast of the original player-character authorship and first native ACTIVATION slice, as REAL processes of the SHIPPED
// binary (no owner extension, no fixture): the world and locus are committed first by the independent `establish-locality` path; the
// human then authors a character, sees the whole Mirror, corrects one material detail, sees the corrected whole and keeps it; and
// SEPARATELY states and confirms native presence. A separate ordinary process then reads the persisted owner facts.
//
// Before the valid whole-Mirror keep and the separately explicit placement, the complete outcome must not exist: that is checked at
// the first display and again between the release and the binding, both by killing the real process there.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { mirrorItems, releaseIdOf } from "@immortalis/operator";
import { readKeep } from "../../packages/operator/src/original-pc-keep.ts";
import {
  establishArgs,
  headOf,
  openOrdinary,
  runShipped,
  setupDoc,
  writeSetup,
  freshDirs,
} from "../support/locality.ts";
import {
  CAMPAIGN,
  KEEP,
  LOCUS_ID,
  PC_ID,
  PLACE,
  WORDS,
  WORLD_ID,
  authorArgs,
  characterStatusArgs,
  localityCampaign,
  runAuthor,
  shapeOf,
  standardScript,
} from "../support/original-pc.ts";

const phrases = (stdout: string, verb: string): string[] =>
  [...stdout.matchAll(new RegExp(`type exactly "(${verb} [0-9a-f]{12})"`, "g"))].map((m) => m[1]!);

async function reference() {
  const dirs = await localityCampaign();
  const run = await runAuthor(authorArgs(dirs), standardScript());
  expect(run.stdout).toContain("STATUS CHARACTER_BOUND");
  return { dirs, shape: await shapeOf(dirs) };
}

describe("a human authors, reviews, revises and keeps a character, then separately places it: real processes of the shipped binary", () => {
  it("author-character (process 1) → character-status (process 2) → an ordinary open (process 3) reads the persisted owner facts", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);

    const one = await runAuthor(authorArgs(dirs), standardScript());
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS CHARACTER_BOUND");

    // the WHOLE Mirror was displayed twice; the second display is the corrected whole, not a patch
    const displays = one.stdout.split("+--- CHARACTER MIRROR").slice(1);
    expect(displays).toHaveLength(2);
    expect(displays[0]).toContain(WORDS.identityFirst);
    expect(displays[0]).not.toContain(WORDS.possession);
    expect(displays[1]).toContain(WORDS.identityFinal);
    expect(displays[1]).not.toContain(WORDS.identityFirst);
    for (const d of displays)
      for (const shown of [
        WORDS.contact,
        WORDS.embodiment,
        WORDS.continuity,
        "No claim about the wider world",
      ])
        expect(d, shown).toContain(shown);
    expect(displays[1]).toContain(WORDS.possession);
    // each display carried its OWN fresh keep phrase, and the keep that was typed is the second (last) one
    const keeps = phrases(one.stdout, "keep-character");
    expect(keeps).toHaveLength(2);
    expect(new Set(keeps).size).toBe(2);
    expect(one.stdout.indexOf(keeps[1]!)).toBeGreaterThan(one.stdout.indexOf(WORDS.identityFinal));
    // placement is a separate choice with its own phrase, offered only after the character was released
    const places = phrases(one.stdout, "place-character");
    expect(places).toHaveLength(1);
    const order = [...one.stdout.matchAll(/PROGRESS (\w+) (RETAINED|RELEASED|COMMITTED)/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["keep", "character", "binding"]);
    expect(one.stdout.indexOf("PROGRESS character RELEASED")).toBeLessThan(
      one.stdout.indexOf("PLACEMENT"),
    );
    expect(one.stdout.indexOf("PLACEMENT")).toBeLessThan(one.stdout.indexOf(places[0]!));

    const two = await runShipped(characterStatusArgs(dirs));
    expect(two.code).toBe(0);
    expect(two.stdout).toContain("STATUS CHARACTER_BOUND");

    // an ordinary process: the canonical owner registry only
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.verify()).toEqual([]);
    expect(campaign.store.head().revision).toBe(before.revision + 2);
    const pc = campaign.playerCharacter(PC_ID)!;
    expect(pc.fact).toMatchObject({
      owner: "pc_existence",
      facet: "existence_contract",
      version: 1,
    });
    expect(pc.value.identity_agency).toEqual({
      statement: WORDS.identityFinal,
      provenance: "PLAYER-AUTHORED",
    });
    expect(pc.value.contact).toEqual({
      kind: "CONTACT_ANCHOR",
      surfaces: [{ statement: WORDS.contact, provenance: "PLAYER-AUTHORED" }],
    });
    expect(pc.value.entry_envelope.items).toEqual([
      { statement: WORDS.possession, provenance: "PLAYER-AUTHORED" },
    ]);
    expect(pc.value.baseline_exception).toEqual({
      safely_inherited: [],
      player_overrides: [],
      hypotheses: [],
      unresolved: [],
    });
    // the recorded acceptance is exactly the Mirror of the FINAL content, derived independently of the command here
    expect(pc.value.release.mirror_acceptance.accepted_by).toEqual(PLAYER_CHOICE_AUTHORITY);
    expect(pc.value.release.mirror_acceptance.items_displayed_and_accepted).toEqual(
      mirrorItems(pc.value).map((i) => i.id),
    );
    expect(
      pc.value.release.mirror_acceptance.items_displayed_and_accepted.join("\n"),
    ).not.toContain(WORDS.identityFirst);
    // the keep retained at the console BEFORE the release is exactly what the owner holds; the secret that keys the publication
    // identities exists only in that owner-only record and appears nowhere in canon
    const read = await readKeep({
      dir: dirs.operatorDir,
      campaignId: CAMPAIGN,
      operatorUid: process.getuid!(),
    });
    if (!read.ok || read.value === null) throw new Error("the keep was not retained");
    const record = read.value;
    expect(record.contract).toEqual(pc.value);
    expect(pc.fact.provenance.group_id).toBe(
      `operator-pc:${releaseIdOf(record.secret, CAMPAIGN, pc.value)}:release`,
    );
    expect(JSON.stringify(campaign.store.listFacts())).not.toContain(record.secret);

    const binding = campaign.binding()!;
    expect(binding.fact).toMatchObject({
      owner: "role_registry",
      facet: "player_character_binding",
      version: 1,
    });
    const pcKey = pcExistenceContractKey(PC_ID);
    expect(binding.value).toEqual({
      binding_slot: "role.player_character",
      active_pc: { fact_key: pcKey, entity_id: PC_ID },
      coupling: {
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        locus: { fact_key: worldLocusKey(WORLD_ID, LOCUS_ID), entity_id: LOCUS_ID },
      },
      transition: {
        type: "ACTIVATION",
        basis: {
          bridge: "NATIVE_ALREADY_THERE",
          established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
          authored_under: PLAYER_CHOICE_AUTHORITY,
          statement: WORDS.presence,
          pinned_versions: {
            pc: pc.fact.version,
            world: campaign.world(WORLD_ID)!.fact.version,
            locus: campaign.locus(WORLD_ID, LOCUS_ID)!.fact.version,
          },
        },
      },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    });
    // two owners, two publications, dependency edges pc → binding ← world, locus; nothing else was written
    const pcGroup = campaign.store.committedGroup(pc.fact.provenance.intent_id)!;
    const bindGroup = campaign.store.committedGroup(binding.fact.provenance.intent_id)!;
    expect(pcGroup.depends_on).toEqual([]);
    expect(bindGroup.depends_on).toContain(pc.fact.provenance.group_id);
    expect(bindGroup.writes).toHaveLength(1);
    expect(
      campaign.store
        .listFacts()
        .map((f) => f.owner)
        .sort(),
    ).toEqual(["pc_existence", "role_registry", "world_state", "world_state", "world_state"]);
    // the binding is NOT a physical location, perception or time
    expect(campaign.pcPhysicalLocusCustody(PC_ID)).toBeUndefined();
    expect(campaign.pcCurrentLocus(PC_ID)).toBeUndefined();
    await campaign.close();

    // a fourth process repeats the command: it reads what is held, asks nothing and writes nothing
    const head = await headOf(dirs.campaignDir);
    const four = await runAuthor(authorArgs(dirs), []);
    expect(four.code).toBe(0);
    expect(four.stdout).toContain("STATUS CHARACTER_BOUND");
    expect(four.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("before the valid whole-Mirror keep and the separate placement, the complete outcome does not exist", () => {
  it("a process killed at the first Mirror leaves the campaign exactly as the locality left it", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const run = await runAuthor(authorArgs(dirs), standardScript(), {
      killAfter: /Keep this character, or change/,
    });
    expect(run.signal).toBe("SIGKILL");
    // the killed process left its package lock; the operator reclaims it explicitly, and nothing of the character exists
    const status = await runShipped(characterStatusArgs(dirs, ["--reclaim-stale-lock"]));
    expect(status.stdout).toContain("STATUS CHARACTER_NONE");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a process killed after the release and before the binding leaves a released but UNBOUND character; the same command resumes at placement only", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const killed = await runAuthor(authorArgs(dirs), standardScript(), {
      killAfter: /PROGRESS character RELEASED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const status = await runShipped(characterStatusArgs(dirs, ["--reclaim-stale-lock"]));
    expect(status.stdout).toContain("STATUS CHARACTER_RELEASED_UNBOUND");
    expect(status.stdout).toContain("no player character is operative");
    const held = await openOrdinary(dirs.campaignDir);
    expect(held.playerCharacter(PC_ID)).toBeDefined();
    expect(held.binding()).toBeUndefined();
    expect(held.store.head().revision).toBe(4);
    await held.close();

    // the rerun is asked for the placement alone: no authoring prompt, no second keep, no second release
    const resumed = await runAuthor(authorArgs(dirs), [WORDS.presence, PLACE]);
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("RESUMING");
    expect(resumed.stdout).not.toContain("identity>");
    expect(resumed.stdout).not.toContain("keep-character");
    expect(resumed.stdout).toContain("STATUS CHARACTER_BOUND");
    expect(await shapeOf(dirs)).toEqual(expected.shape);
  }, 180_000);

  it("a process killed after the keep and before the release leaves nothing released; the same command releases exactly what was kept and asks for the placement alone", async () => {
    const dirs = await localityCampaign();
    const killed = await runAuthor(authorArgs(dirs), standardScript(), {
      killAfter: /PROGRESS keep RETAINED/,
    });
    expect(killed.signal).toBe("SIGKILL");
    const kept = await readKeep({
      dir: dirs.operatorDir,
      campaignId: CAMPAIGN,
      operatorUid: process.getuid!(),
    });
    if (!kept.ok || kept.value === null) throw new Error("the keep was not retained");
    const resumed = await runAuthor(authorArgs(dirs, ["--reclaim-stale-lock"]), [
      WORDS.presence,
      PLACE,
    ]);
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("releasing exactly what was kept");
    expect(resumed.stdout).not.toContain("identity>");
    expect(resumed.stdout).toContain("STATUS CHARACTER_BOUND");
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.playerCharacter(PC_ID)!.value).toEqual(kept.value.contract);
    expect(campaign.playerCharacter(PC_ID)!.value.identity_agency.statement).toBe(
      WORDS.identityFinal,
    );
    await campaign.close();
  }, 180_000);

  it("the unplaced state is honest: declining placement leaves the character released and unbound, and says so", async () => {
    const dirs = await localityCampaign();
    const run = await runAuthor(authorArgs(dirs), [...standardScript().slice(0, 13), ""]);
    expect(run.code).toBe(3);
    expect(run.stdout).toContain("STATUS CHARACTER_RELEASED_UNBOUND");
    expect(run.stdout).toContain("NOT bound");
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.binding()).toBeUndefined();
    expect(campaign.playerCharacter(PC_ID)).toBeDefined();
    await campaign.close();
  }, 120_000);
});

describe("the locality it builds on is the independent shipped path", () => {
  it("establish-locality is a separate command and its facts predate the character by their own receipts", async () => {
    const dirs = freshDirs();
    const one = await runShipped(establishArgs(dirs, writeSetup(setupDoc())), ["confirm"]);
    expect(one.stdout).toContain("STATUS LOCALITY_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.playerCharacter(PC_ID)).toBeUndefined();
    expect(campaign.binding()).toBeUndefined();
    await campaign.close();
  }, 120_000);
});
// KEEP is typed only as the latest keep phrase; this keeps the import used for readers of the script.
void KEEP;
