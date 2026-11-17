/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary fact values */
// S-4 initial Standing Instruction ledger — LAWFUL POSITIVE and ISOLATION witnesses (BLUE brief B4: "Positive new", "Isolation").
// MECHANISM ONLY (T1): no AI GM, named client or retained storage is involved; those are UNRUN.
//
// None of these fixtures supplies the answer the test then proves. The world, locus, PC contract, setup chain and (for the handover)
// the actor's own state are committed through their own owners; the ledger is derived and committed by the engine's own initializer
// from those facts; the binding then CONSUMES that older head through its own admission; a cold reopen re-verifies the order and the
// active-PC consumer reports the committed binding. Removing a true prerequisite changes the result to a refusal (see the refusal suite).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
} from "@immortalis/contracts";
import { CanonicalCampaign, SETUP_ELIGIBLE_KIND_IDS } from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureLocus,
  publication,
} from "@immortalis/testkit";
import { A, L2, W2, commitClosure, commitPlacement, r1Scene } from "../support/actor-presence.ts";
import {
  existingActorSummary,
  handoverActor,
  readyForHandover,
  reopenExistingActor,
  seededExistingActorCampaign,
} from "../support/existing-actor.ts";
import {
  HEAD_KEY,
  L,
  PC,
  VERSION_KEY,
  W,
  activateWithLedger,
  bindInput,
  code,
  releasedCampaign,
  reopen,
  snapshot,
  target,
} from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const revisionOf = (c: CanonicalCampaign, key: string): number =>
  c.store.lookupReceipt(c.store.getFact(key)!.provenance.intent_id)!.revision;

describe("positive: a newly created PC receives its engine-origin ledger BEFORE its ACTIVATION binding", () => {
  it("the head and sealed version are one atomic PC-owner group, source-labelled, empty, and strictly older than the binding", async () => {
    const dir = tempDir();
    const c = await releasedCampaign(dir);
    const before = snapshot(c.store);
    const init = await must(c.initializePcStandingInstructionLedger(target()));
    expect(init.replayed).toBe(false);

    // exactly the two ledger keys were added; every other committed fact is byte-identical (Isolation)
    const after = snapshot(c.store);
    expect(Object.keys(after).filter((k) => !(k in before))).toEqual([HEAD_KEY, VERSION_KEY]);
    for (const [k, f] of Object.entries(before)) expect(after[k]).toEqual(f);

    const head = c.store.getFact(HEAD_KEY)!;
    const version = c.store.getFact(VERSION_KEY)!;
    expect([head.owner, head.facet, version.owner, version.facet]).toEqual([
      "pc_existence",
      "standing_instruction_ledger",
      "pc_existence",
      "standing_instruction_ledger",
    ]);
    // one atomic group: the same commit identity, the same receipt
    expect(head.provenance.group_id).toBe(version.provenance.group_id);
    expect(head.provenance.intent_id).toBe(version.provenance.intent_id);
    expect(head.version).toBe(1);
    expect(version.version).toBe(1);

    const v = version.value as any;
    expect(v.sequence).toBe(1);
    expect(v.instructions).toEqual([]); // the empty ARRAY, not an absence
    expect(v.previous).toBeNull(); // the explicit null, not an absence
    expect(v.origin.kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
    expect(v.origin.setup_closure).toBeNull(); // this world's route uses no setup closure
    // the origin is DERIVED from the committed PC contract: its exact key, version and commit identity
    const pc = c.store.getFact(pcExistenceContractKey(PC))!;
    expect(v.origin.pc_creation).toEqual({
      fact_key: pc.key,
      version: pc.version,
      commit: { group_id: pc.provenance.group_id, intent_id: pc.provenance.intent_id },
    });
    expect((head.value as any).current).toEqual({ fact_key: VERSION_KEY, version: 1 });
    expect((head.value as any).content_sha256).toBe(v.content_sha256);

    // NO player authorship, instruction, consent or time is anywhere in the carrier
    const text = JSON.stringify(version.value);
    for (const forbidden of ["PLAYER", "player_choice", "timestamp", "session", "nonce", "consent"])
      expect(text).not.toContain(forbidden);

    // the binding then consumes the OLDER head: it reads both facts at their exact versions and depends on their group
    await must(c.bindPlayerCharacter(bindInput()));
    const binding = c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    const group = c.store.committedGroup(binding.provenance.intent_id)!;
    expect(group.reads).toEqual(
      expect.arrayContaining([
        { key: HEAD_KEY, version: 1 },
        { key: VERSION_KEY, version: 1 },
      ]),
    );
    expect(group.depends_on).toContain(head.provenance.group_id);
    expect(group.writes.map((w) => w.key)).toEqual([PLAYER_CHARACTER_BINDING_KEY]); // still ONE separate role_registry group
    expect(group.owner).toBe("role_registry");
    expect(revisionOf(c, HEAD_KEY)).toBeLessThan(revisionOf(c, PLAYER_CHARACTER_BINDING_KEY));
    // the binding value keeps its existing shape: no ledger field was added to it
    expect(Object.keys(binding.value as object).sort()).toEqual(
      [
        "active_pc",
        "binding_slot",
        "coupling",
        "intrinsic_authority_migration",
        "prior_binding",
        "replacement_binding",
        "transition",
        "writer",
      ].sort(),
    );
    expect(c.verify()).toEqual([]);
    await c.close();

    // cold reopen: the head-before-binding order is re-verified and the active-PC consumer reports the committed binding
    const r = await reopen(dir);
    expect(r.verify()).toEqual([]);
    expect(r.binding()!.value.active_pc.entity_id).toBe(PC);
    expect(r.standingInstructionLedger(PC)!.version.value.origin.kind).toBe(
      LEDGER_ORIGIN_ENGINE_CLOSURE,
    );
    await r.close();

    // the journal is hash-chained and was written in the lawful order: PC contract < ledger < binding
    const lines = readFileSync(join(dir, "journal.jsonl"), "utf8").trim().split("\n");
    const written = lines.map((l) => JSON.parse(l).group.writes.map((w: any) => w.key as string));
    const order = (k: string) => written.findIndex((ks) => ks.includes(k));
    expect(order(pcExistenceContractKey(PC))).toBeLessThan(order(HEAD_KEY));
    expect(order(HEAD_KEY)).toBe(order(VERSION_KEY));
    expect(order(HEAD_KEY)).toBeLessThan(order(PLAYER_CHARACTER_BINDING_KEY));
  });

  it("an EXISTING_ACTOR_HANDOVER consumes the same older head, over the actor's own committed chain", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await readyForHandover(s); // the actor's state, its coupling, its I-002 compilation: each through its own owner
    const ledgerKey = (k: string) => `pc/${ACTOR_SMITH}/standing-instruction-ledger/${k}`;
    const init = await must(
      s.campaign.initializePcStandingInstructionLedger({
        pc_id: ACTOR_SMITH,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
      }),
    );
    expect(init.replayed).toBe(false);
    const ledger = s.campaign.standingInstructionLedger(ACTOR_SMITH)!;
    const origin = ledger.version.value.origin;
    expect(origin.kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
    // the compiled contract is the creation source; nothing of the actor's state is copied into the ledger
    if (origin.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) throw new Error("unreachable");
    expect(origin.pc_creation.fact_key).toBe(pcExistenceContractKey(ACTOR_SMITH));
    expect(JSON.stringify(ledger.version.value)).not.toContain("capability");
    expect(s.campaign.store.getFact(ledgerKey("head"))).toBeDefined();

    // the handover itself is unchanged: the same single Role Registry commit, now preceded by the older head
    const handed = await must(handoverActor(s, 1));
    expect(handed.replayed).toBe(false);
    const binding = s.campaign.binding()!;
    expect(binding.value.transition.type).toBe("EXISTING_ACTOR_HANDOVER");
    const group = s.campaign.store.committedGroup(binding.fact.provenance.intent_id)!;
    expect(group.reads.map((r) => r.key)).toEqual(
      expect.arrayContaining([ledgerKey("head"), ledgerKey("version/1")]),
    );
    expect(revisionOf(s.campaign, ledgerKey("head"))).toBeLessThan(
      revisionOf(s.campaign, PLAYER_CHARACTER_BINDING_KEY),
    );
    expect(s.campaign.verify()).toEqual([]);
    const summary = existingActorSummary(s.campaign, s.coordinator);
    await s.campaign.close();

    const r = await reopenExistingActor(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.binding()!.value.active_pc.entity_id).toBe(ACTOR_SMITH);
    // the actor's own pre-handover facts are exactly as they were (nothing migrated, copied or rewritten by the ledger)
    expect(existingActorSummary(r.campaign, r.coordinator).actor).toEqual(summary.actor);
    expect(existingActorSummary(r.campaign, r.coordinator).coupling).toEqual(summary.coupling);
    await r.campaign.close();
  });
});

describe("positive: the ledger FOLLOWS a real world_setup_closure where the setup predicate is used", () => {
  it("cites the genuine closure by exact key, version and commit; the closure still verifies at its own pre-state after reopen", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir);
    await must(commitPlacement(s)); // a real B1 setup placement of a non-PC actor, through the R1 owner path
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );

    // the world has a placement but no closure yet: the ledger would end setup eligibility and strand it, so it is REFUSED
    const premature = await s.campaign.initializePcStandingInstructionLedger(target());
    expect(premature.ok).toBe(false);
    expect(!premature.ok && premature.error.code).toBe("REFERENCE_INVALID");
    expect(!premature.ok && premature.error.message).toContain("world_setup_closure");
    expect(s.campaign.standingInstructionLedger(PC)).toBeUndefined();

    await must(commitClosure(s)); // the closure, through the R1 owner path
    const init = await must(s.campaign.initializePcStandingInstructionLedger(target()));
    expect(init.replayed).toBe(false);
    const closure = s.campaign.store.getFact(worldSetupClosureKey(W))!;
    const origin = s.campaign.standingInstructionLedger(PC)!.version.value.origin;
    expect(origin.kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
    if (origin.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) throw new Error("unreachable");
    expect(origin.setup_closure).toEqual({
      fact_key: closure.key,
      version: closure.version,
      commit: { group_id: closure.provenance.group_id, intent_id: closure.provenance.intent_id },
    });
    expect(revisionOf(s.campaign, closure.key)).toBeLessThan(revisionOf(s.campaign, HEAD_KEY));
    await must(s.campaign.bindPlayerCharacter(bindInput(41)));
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();

    // cold reopen: the closure (and the placement it lists) is re-verified against ITS OWN pre-state, which the later ledger and
    // binding do not disturb; the whole order closure < head < binding is re-verified too
    const r = await must(
      CanonicalCampaign.open(dir, {
        buildId: "s4-closure-reopen",
        extension: ACTOR_FIXTURE_EXTENSION,
      }),
    );
    expect(r.verify()).toEqual([]);
    expect(r.binding()!.value.active_pc.entity_id).toBe(PC);
    await r.close();
  });

  it("a ledger committed BEFORE the closure makes the closure impossible (setup eligibility is not widened)", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir);
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    // no placement exists, so the route uses no closure and the ledger is lawful, with an explicit null closure
    await must(s.campaign.initializePcStandingInstructionLedger(target()));
    const origin = s.campaign.standingInstructionLedger(PC)!.version.value.origin;
    if (origin.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) throw new Error("unreachable");
    expect(origin.setup_closure).toBeNull();
    // the closure now refuses: a ledger kind is not a setup kind
    const late = await code(commitClosure(s, []) as never); // an empty inventory is legal; only eligibility refuses it
    expect(late).toBe("REFERENCE_INVALID");
    expect(worldSetupClosureKey(W) in snapshot(s.campaign.store)).toBe(false);
    // and the frozen setup-eligibility set is exactly what it was: neither ledger kind was added to it
    expect([...SETUP_ELIGIBLE_KIND_IDS].sort()).toEqual(
      [
        "actor_setup_placement",
        "named_actor_capability_basis",
        "pc_capability_basis",
        "pc_existence_contract",
        "world_actor_coupling",
        "world_corridor",
        "world_locus",
        "world_profile",
        "world_setup_closure",
      ].sort(),
    );
    await s.campaign.close();
  });

  it("the closure applicable to a binding is the closure of THE WORLD IT COUPLES: a closure of another world is refused in both directions", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir, { extras: true, noBasis: true });
    const C = s.campaign;
    const wRef = (w: string) => ({ fact_key: worldProfileKey(w), entity_id: w });
    await must(
      C.establishLocus({
        ...publication(50),
        locus: fixtureLocus({ locus_id: "locus-w2", world: wRef(W2) }),
      }),
    );
    await must(C.releasePlayerCharacter({ ...publication(51), contract: fixtureContract() }));
    await must(commitClosure(s, [], W2)); // only the SECOND world is closed (an empty inventory is legal)

    // (1) a ledger for the closed world W2 cites W2's closure; binding the PC into the UNCLOSED world W is refused
    await must(
      C.initializePcStandingInstructionLedger(target({ world_id: W2, locus_id: "locus-w2" })),
    );
    const origin = C.standingInstructionLedger(PC)!.version.value.origin;
    if (origin.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) throw new Error("unreachable");
    expect(origin.setup_closure!.fact_key).toBe(worldSetupClosureKey(W2));
    const wrong = await C.bindPlayerCharacter(bindInput(52));
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.error.code).toBe("REFERENCE_INVALID");
    expect(!wrong.ok && wrong.error.message).toContain(
      "not the closure of the world being coupled",
    );
    expect(C.binding()).toBeUndefined(); // refused without creating a binding

    // (2) the lawful target of THAT ledger binds (control: the refusal above was about the world, not the PC or the ledger)
    await must(C.bindPlayerCharacter(bindInput(53, { world_id: W2, locus_id: "locus-w2" })));
    expect(C.verify()).toEqual([]);
    await C.close();

    // (3) the reverse: a ledger written for the UNCLOSED world W cannot bind into the CLOSED world W2
    const dir2 = tempDir();
    const s2 = await r1Scene(dir2, { extras: true, noBasis: true });
    const C2 = s2.campaign;
    await must(
      C2.establishLocus({
        ...publication(50),
        locus: fixtureLocus({ locus_id: "locus-w2", world: wRef(W2) }),
      }),
    );
    await must(C2.releasePlayerCharacter({ ...publication(51), contract: fixtureContract() }));
    await must(commitClosure(s2, [], W2));
    await must(C2.initializePcStandingInstructionLedger(target())); // world W: no closure, so an explicit null
    const reverse = await C2.bindPlayerCharacter(
      bindInput(53, { world_id: W2, locus_id: "locus-w2" }),
    );
    expect(reverse.ok).toBe(false);
    expect(!reverse.ok && reverse.error.code).toBe("REFERENCE_INVALID");
    expect(!reverse.ok && reverse.error.message).toContain(
      "without the closure of the world being coupled",
    );
    expect(C2.binding()).toBeUndefined();
    await C2.close();
    void [A, L2, L, worldLocusKey, FIXTURE_WORLD_ID];
  });
});

describe("a head with no binding is inert, and the binding consumes it later", () => {
  it("a refused binding leaves the PC unbound and the head untouched; the lawful binding then succeeds on the SAME head", async () => {
    const dir = tempDir();
    const c = await releasedCampaign(dir);
    await must(c.initializePcStandingInstructionLedger(target()));
    const headBefore = c.store.getFact(HEAD_KEY)!;
    // an existing, unrelated refusal of the binding (no insertion fact) still refuses exactly as before the ledger existed
    expect(await code(c.bindPlayerCharacter(bindInput(4, { insertion: null })))).toBe(
      "INPUT_INVALID",
    );
    expect(c.binding()).toBeUndefined();
    expect(c.store.getFact(HEAD_KEY)).toEqual(headBefore); // inert, unchanged
    expect(c.verify()).toEqual([]);
    await must(c.bindPlayerCharacter(bindInput(5)));
    expect(c.store.getFact(HEAD_KEY)).toEqual(headBefore); // the binding consumed it without advancing it
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  it("activateWithLedger helper convention: the whole lawful sequence reopens cleanly twice", async () => {
    const dir = tempDir();
    const c = await releasedCampaign(dir);
    await activateWithLedger(c);
    await c.close();
    for (let i = 0; i < 2; i++) {
      const r = await reopen(dir, `s4-twice-${i}`);
      expect(r.verify()).toEqual([]);
      await r.close();
    }
    void [pcExistenceContractKey];
  });
});
