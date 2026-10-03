// Unit evidence for the Epistemic Access active-PC recipient path: the pure classification of the recipient from the
// committed Role Registry binding, the capability read the event requires (never a fallback between owners), the
// source rule and the declaration. Register lineage: IA-11 (partial), IA-14 (partial), IA-16 (partial); RC-03, RC-11,
// RC-14; IM-02, IM-10. F-014D §2.1 R-T1 with F-016 Phase 2B PCC-02/PCC-03. Local success is NOT provider/recovery acceptance.
import { describe, expect, it } from "vitest";
import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  PC_CAPABILITY_CLOSE,
  PLAYER_CHARACTER_BINDING_KEY,
  accessEventKey,
  actorCapabilityKey,
  actorCapabilityStage,
  pcCapabilityKey,
  pcCapabilityStage,
  populationLedgerKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  deriveAccessProducts,
  epistemicPacketDeclaration,
  eventSourceViolation,
  pcCapabilityCloseRead,
  recipientBoundaryViolation,
  requiredCapability,
  stageGroupId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_PC_ID,
  SYNTH_ACCESS_SOURCE_OWNER,
  accessEvent,
  pcAccessEvent,
  sourceKey,
} from "@immortalis/testkit";

const PC = FIXTURE_PC_ID;
const C = CAP_METALWORKING;
const withCap = { representation: { capability_id: C } };
const pcEvent = pcAccessEvent("e1", PC, withCap);
const namedEvent = accessEvent("e1", ACTOR_SMITH, withCap);

const fact = (key: string, owner: string, value: unknown): OwnerFact =>
  ({ key, owner, facet: "f", value, unit: null, basis: "b", secrecy: "s", version: 1 }) as never;
const binding = (entity = PC, owner = "role_registry") =>
  fact(PLAYER_CHARACTER_BINDING_KEY, owner, {
    binding_slot: "role.player_character",
    active_pc: { fact_key: `pc/${entity}/existence-contract`, entity_id: entity },
    coupling: {
      world: { fact_key: "world/w/profile", entity_id: "w" },
      locus: { fact_key: "world/w/locus/l", entity_id: "l" },
    },
    transition: {
      type: "ACTIVATION",
      basis: {
        bridge: "NATIVE_ALREADY_THERE",
        established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
        statement: "x",
        pinned_versions: { pc: 1, world: 1, locus: 1 },
      },
    },
    prior_binding: null,
    replacement_binding: null,
    intrinsic_authority_migration: [],
    writer: { role: "role.archivist", permission: "permission.canon.write" },
  });
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));

describe("the recipient is the active PC only through the committed Role Registry binding, by identity", () => {
  it("an event asserting the role is lawful exactly for the entity the binding names, and a Population ledger identity never", () => {
    expect(recipientBoundaryViolation(facts(binding()), pcEvent)).toBeNull();
    for (const state of [
      facts(), // no binding: an Existence Contract alone is not enough
      facts(binding("pc-someone-else")),
      facts(binding(PC, "pc_existence")), // not the Role Registry's own fact
      facts(binding(), fact(populationLedgerKey(PC), "population", {})),
    ])
      expect(recipientBoundaryViolation(state, pcEvent)).not.toBeNull();
  });

  it("without the role assertion the existing Named-Actor boundary applies unchanged: the bound PC is refused, a plain actor is lawful", () => {
    expect(recipientBoundaryViolation(facts(binding()), accessEvent("e1", PC))).toMatch(
      /player-character control/,
    );
    expect(recipientBoundaryViolation(facts(binding()), accessEvent("e1", ACTOR_SMITH))).toBeNull();
  });
});

describe("the capability read follows the recipient and is never a fallback between owners", () => {
  it("a PC event requires the PC owner's capability at the PC Capability Close; a Named-Actor event the Named-Actor owner's; no representation requires none", () => {
    expect(requiredCapability(pcEvent)).toEqual({
      owner: "pc_existence",
      key: pcCapabilityKey(PC, C),
      close_name: PC_CAPABILITY_CLOSE,
      close_stage: pcCapabilityStage(PC, C),
    });
    expect(requiredCapability(namedEvent)).toEqual({
      owner: "named_actor",
      key: actorCapabilityKey(ACTOR_SMITH, C),
      close_name: ACTOR_PROFILE_CAPABILITY_CLOSE,
      close_stage: actorCapabilityStage(ACTOR_SMITH, C),
    });
    expect(requiredCapability(pcAccessEvent("e1", PC))).toBeNull();
  });

  it("the formation stage reads the PC capability through the existing PC close-read builder only", () => {
    const decl = epistemicPacketDeclaration(pcEvent);
    expect(decl.reads[1]).toEqual(pcCapabilityCloseRead(PC, C));
    expect(decl.reads[1]!.source.owner).toBe("pc_existence");
    expect(decl.declares_close).toBeNull();
    expect(epistemicPacketDeclaration(namedEvent).reads[1]!.source.owner).toBe("named_actor");
  });

  const eventFact = (e: typeof pcEvent) => ({
    key: accessEventKey(e.event_id),
    owner: "epistemic_access",
    version: 1,
    value: e,
  });
  const pcCap = {
    pc_id: PC,
    capability_id: C,
    marker: "C",
    basis: { fact_key: "b", version: 1 },
    close: { name: PC_CAPABILITY_CLOSE, stage: pcCapabilityStage(PC, C) },
  };
  const read = (key: string, owner: string, value: unknown, by: string) => ({
    fact: { key, owner, version: 1, value: value as never },
    committed_by: by,
  });

  it("the PC packet references the exact PC capability fact, version and PC Capability Close, and never the marker; a Named-Actor fact in its place is refused", () => {
    const ok = deriveAccessProducts({
      event: eventFact(pcEvent),
      capability: read(
        pcCapabilityKey(PC, C),
        "pc_existence",
        pcCap,
        stageGroupId(pcCapabilityStage(PC, C)),
      ),
    });
    if (!ok.ok) throw new Error("fixture");
    expect(ok.value.packet.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: C,
        fact_key: pcCapabilityKey(PC, C),
        version: 1,
        close: { name: PC_CAPABILITY_CLOSE, group_id: stageGroupId(pcCapabilityStage(PC, C)) },
      },
    });
    expect(JSON.stringify(ok.value)).not.toContain('"marker"');
    const named = {
      actor_id: PC,
      capability_id: C,
      marker: "C",
      basis: { fact_key: "b", version: 1 },
      close: { name: ACTOR_PROFILE_CAPABILITY_CLOSE, stage: actorCapabilityStage(PC, C) },
    };
    const fallback = deriveAccessProducts({
      event: eventFact(pcEvent),
      capability: read(
        actorCapabilityKey(PC, C),
        "named_actor",
        named,
        stageGroupId(actorCapabilityStage(PC, C)),
      ),
    });
    expect(fallback).toMatchObject({ ok: false, error: { code: "CAPABILITY_INVALID" } });
    // and the reverse: a Named-Actor event never accepts the PC owner's capability
    const reverse = deriveAccessProducts({
      event: eventFact(namedEvent),
      capability: read(
        pcCapabilityKey(ACTOR_SMITH, C),
        "pc_existence",
        {
          ...pcCap,
          pc_id: ACTOR_SMITH,
          close: { ...pcCap.close, stage: pcCapabilityStage(ACTOR_SMITH, C) },
        },
        stageGroupId(pcCapabilityStage(ACTOR_SMITH, C)),
      ),
    });
    expect(reverse).toMatchObject({ ok: false, error: { code: "CAPABILITY_INVALID" } });
    // wrong version-at-close: not the group of the PC Capability Close
    expect(
      deriveAccessProducts({
        event: eventFact(pcEvent),
        capability: read(pcCapabilityKey(PC, C), "pc_existence", pcCap, "g-later"),
      }),
    ).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_AT_CLOSE" } });
  });
});

describe("an active-PC event never rests on a PC capability as its information source", () => {
  it("the PC owner's capability and basis key spaces are refused as a source of a PC event; ordinary foreign carriers stand", () => {
    const rest = (owner: string, key: string) =>
      eventSourceViolation(
        pcAccessEvent("e1", PC, { source: { owner, fact_key: key, version: 1 } }),
      );
    expect(rest("pc_existence", pcCapabilityKey(PC, C))).toMatch(/PC Capability Close/);
    expect(rest("pc_existence", `pc/${PC}/capability-basis/${C}`)).toMatch(/PC Capability Close/);
    expect(rest("epistemic_access", "access/x/event")).not.toBeNull();
    expect(rest(SYNTH_ACCESS_SOURCE_OWNER, sourceKey("speaker"))).toBeNull();
    // the Named-Actor event's source rule is the unchanged owner-level rule
    expect(
      eventSourceViolation(
        accessEvent("e1", ACTOR_SMITH, {
          source: { owner: "pc_existence", fact_key: pcCapabilityKey(PC, C), version: 1 },
        }),
      ),
    ).toBeNull();
  });
});
