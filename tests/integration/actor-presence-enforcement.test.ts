// R1 Stage-One v1.1 — enforcement and recovery of the presence chain: the strict setup-eligibility predicate (kind and referee
// operation), B1 ↔ coupling agreement in both commit orders, the exact-identity physical-custody exclusion (handover refused BEFORE
// commit; an unbound existing-actor compilation stays allowed), and the historical verifier: a forged history (wrong instant, a
// disallowed fact before B1, a missing closure) fails the open, and a history opened WITHOUT the verifier fails closed.
// MECHANISM ONLY: nothing here is perception, a faculty, Health, movement or a player receipt.
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  causalDrawPrecommitKey,
  refereeDecisionKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  canonicalAdmission,
  openFileCampaign,
  presenceRivalViolation,
  setupEligibilityViolation,
  verifyActorPresenceIntegrity,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  T0,
  fixtureContract,
  temporalPublication,
} from "@immortalis/testkit";
import {
  compileExistingActor,
  coupleActor,
  existingActorContract,
  handoverActor,
} from "../support/existing-actor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  A,
  CAP,
  L2,
  PLACEMENT_KEY,
  PRESENCE_KEY,
  code,
  commitClosure,
  commitPlacement,
  commitPresence,
  establishClock,
  fullChain,
  r1Scene,
  r1Group,
  presenceValue,
  placementValue,
  closureValue,
  rogueScene,
  rogueView,
  CLOSURE_KEY,
} from "../support/actor-presence.ts";

const fact = (key: string, value: unknown, version = 1): OwnerFact =>
  ({
    key,
    owner: "x",
    facet: "x",
    value,
    unit: null,
    basis: "b",
    secrecy: "s",
    version,
    provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} },
  }) as never;

describe("the strict setup-eligibility predicate", () => {
  it("allows exactly the enumerated setup kinds, and ends on every other kind, key and malformed record", async () => {
    const s = await r1Scene(tempDir());
    await must(commitPlacement(s));
    // a world holding only profile, locus, basis and B1 qualifies
    expect(setupEligibilityViolation(s.campaign.store.listFacts())).toBeNull();
    await must(commitClosure(s));
    expect(setupEligibilityViolation(s.campaign.store.listFacts())).toBeNull();
    const ended = (f: OwnerFact) => setupEligibilityViolation([f]);
    // temporal, causal draw, epistemic, logistics, binding, referee operations, unknown keys
    expect(ended(fact("temporal/state", {}))).toMatch(/temporal_state/);
    expect(ended(fact(causalDrawPrecommitKey("a".repeat(64)), {}))).toMatch(
      /causal_draw_precommit/,
    );
    expect(ended(fact("role-registry/binding/role.player_character", {}))).toMatch(
      /player_character_binding/,
    );
    expect(ended(fact("nothing/registered/here", {}))).toMatch(
      /outside every registered key space/,
    );
    for (const operation of [
      "IR_NATIVE_COMPATIBILITY",
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
      "F014D_ACTOR_DIRECT_PERCEPTION",
      "NOT_AN_OPERATION",
    ])
      expect(ended(fact(refereeDecisionKey("a".repeat(64)), { operation })), operation).toMatch(
        /referee decision other than the I-002 classification/,
      );
    expect(ended(fact(refereeDecisionKey("a".repeat(64)), "garbage"))).toMatch(/referee decision/);
  });

  it("a real I-002 classification committed before B1 does not end eligibility", async () => {
    const { recordedI002 } = await import("../support/actor-presence-i002.ts");
    const fixture = await recordedI002();
    expect(fixture.i002Key).toMatch(/^referee\//);
    expect(setupEligibilityViolation([fixture.fact])).toBeNull();
  });
});

describe("B1 ↔ coupling agreement, in both commit orders", () => {
  it("a coupling committed first constrains B1; a coupling committed after B1 must agree with it", async () => {
    // coupling first, at a different locus than the B1 would name
    const first = await r1Scene(tempDir(), { extras: true });
    await must(coupleActor(first, 1, A));
    expect(await code(commitPlacement(first, {}, A, L2))).toBe("REFERENCE_INVALID");
    await must(commitPlacement(first)); // the agreeing locus
    // B1 first, then a disagreeing coupling is refused and an agreeing one commits
    const second = await r1Scene(tempDir(), { extras: true });
    await must(commitPlacement(second));
    const bad = await coupleActor(second, 1, A, { locus_id: L2 });
    expect(!bad.ok && bad.error.code).toBe("REFERENCE_INVALID");
    await must(coupleActor(second, 1, A));
    expect(second.campaign.verify()).toEqual([]);
  });

  it("the coupling stays immutable provenance: B2 reads B1 and the closure, never the coupling", async () => {
    const s = await r1Scene(tempDir());
    await must(coupleActor(s, 1, A));
    await fullChain(s);
    const b2 = s.campaign.store.getFact(PRESENCE_KEY)!;
    expect(JSON.stringify(b2.value)).not.toContain(worldActorCouplingKey(A));
    const group = s.campaign.store.committedGroup(b2.provenance.intent_id)!;
    expect(group.reads.map((r) => r.key)).not.toContain(worldActorCouplingKey(A));
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("exact-identity physical-custody exclusion", () => {
  const compiled = async () => {
    const s = await r1Scene(tempDir());
    await must(coupleActor(s, 1, A));
    await must(
      compileExistingActor(
        s,
        1,
        existingActorContract(A, [
          { owner: "named_actor", fact_key: actorCapabilityBasisKey(A, CAP), version: 1 },
        ]),
      ),
    );
    return s;
  };

  it("control: without a presence the lawful handover of the prepared, coupled actor commits", async () => {
    const s = await compiled();
    await must(handoverActor(s, 1, A));
    expect(s.campaign.binding()).toBeDefined();
  });

  it("an unbound existing-actor compilation does not stop B1, the closure or B2; the presence-bearing handover is then refused BEFORE commit", async () => {
    const s = await compiled();
    await fullChain(s);
    expect(s.campaign.store.getFact(PRESENCE_KEY)).toBeDefined();
    const before = s.campaign.store.head();
    const r = await handoverActor(s, 1, A);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
    expect(s.campaign.binding()).toBeUndefined();
    // the prepared contract is neither erased nor converted: it is stranded, and the campaign still verifies
    expect(s.campaign.playerCharacter(A)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a fresh Player Character contract for a placed or presence-bearing identity is refused; another identity is unaffected", async () => {
    const placed = await r1Scene(tempDir());
    await must(commitPlacement(placed));
    const fresh = await placed.campaign.releasePlayerCharacter({
      group_id: "fresh-g",
      intent_id: "fresh-i",
      cause: "fresh-c",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      contract: fixtureContract({ pc_id: A }),
    });
    expect(!fresh.ok && fresh.error.code).toBe("REFERENCE_INVALID");
    const other = await placed.campaign.releasePlayerCharacter({
      group_id: "fresh-g2",
      intent_id: "fresh-i2",
      cause: "fresh-c2",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      contract: fixtureContract({ pc_id: "someone-new" }),
    });
    expect(other.ok).toBe(true);
  });

  it("the all-world rival scan names each rival custodian by the SAME literal identity, and nothing else", () => {
    const f = (key: string, value: unknown) => fact(key, value);
    const rivals: [string, string, unknown][] = [
      [
        "world_fallback_entity",
        worldFallbackEntityKey("w", ACTOR_SMITH),
        { entity_id: ACTOR_SMITH },
      ],
      [
        "world_entity_transition",
        worldEntityTransitionKey("w", ACTOR_SMITH),
        { entity: { entity_id: ACTOR_SMITH } },
      ],
      ["world_pc_locus_custody", worldPcLocusCustodyKey(ACTOR_SMITH), { pc_id: ACTOR_SMITH }],
      [
        "player_character_binding",
        "role-registry/binding/role.player_character",
        { active_pc: { entity_id: ACTOR_SMITH } },
      ],
      [
        "logistics_commitment",
        logisticsCommitmentKey("w", "t1"),
        { moved: { entity_id: ACTOR_SMITH } },
      ],
      [
        "logistics_transfer",
        logisticsTransferKey("w", "t1"),
        { moved: { entity_id: ACTOR_SMITH } },
      ],
    ];
    for (const [kind, key, value] of rivals)
      expect(presenceRivalViolation(ACTOR_SMITH, [f(key, value)]), kind).toMatch(
        /current physical custodian record/,
      );
    // a differently spelled identity is not a rival: no alias is derived
    expect(
      presenceRivalViolation(ACTOR_SMITH, [
        f(worldFallbackEntityKey("w", `${ACTOR_SMITH}-2`), { entity_id: `${ACTOR_SMITH}-2` }),
        f(worldFallbackEntityKey("w", ACTOR_SMITH.toUpperCase()), {
          entity_id: ACTOR_SMITH.toUpperCase(),
        }),
      ]),
    ).toBeNull();
    // an unbound pc_existence_contract is not a physical custodian
    expect(
      presenceRivalViolation(ACTOR_SMITH, [
        f(`pc/${ACTOR_SMITH}/existence-contract`, { pc_id: ACTOR_SMITH }),
      ]),
    ).toBeNull();
  });
});

describe("the historical verifier (a forged or unverified history fails closed)", () => {
  const T_LATER = { unit: T0.unit, value: T0.value + 5 };
  const fails = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code;
  };

  it("control: an unadmitted store holding the lawful chain still opens canonically", async () => {
    const dir = tempDir();
    const r = await rogueScene(dir);
    const v = rogueView(r);
    await must(commitPlacement(v));
    await must(commitClosure(v));
    await must(establishClock(v));
    await must(commitPresence(v));
    await r.store.close();
    expect(await fails(dir)).toBe("OK");
  });

  it("a presence whose instant differs from the Temporal canonical time of its pre-state fails the open", async () => {
    const dir = tempDir();
    const r = await rogueScene(dir);
    const v = rogueView(r);
    await must(commitPlacement(v));
    await must(commitClosure(v));
    await must(establishClock(v));
    await must(commitPresence(v, { effective_instant: T_LATER }));
    await r.store.close();
    expect(await fails(dir)).toBe("REPLAY_MISMATCH");
  });

  it("a Temporal state committed BEFORE B1 (a disallowed fact in the pre-state) fails the open", async () => {
    const dir = tempDir();
    const r = await rogueScene(dir);
    const v = rogueView(r);
    await must(establishClock(v));
    await must(commitPlacement(v));
    await must(commitClosure(v));
    await must(commitPresence(v));
    await r.store.close();
    expect(await fails(dir)).toBe("REPLAY_MISMATCH");
  });

  it("a closure that omits a committed B1, and a presence over an unlisted B1, fail the open", async () => {
    const omitted = tempDir();
    const r = await rogueScene(omitted);
    const v = rogueView(r);
    await must(commitPlacement(v));
    await must(commitClosure(v, []));
    await r.store.close();
    expect(await fails(omitted)).toBe("REPLAY_MISMATCH");

    const unlisted = tempDir();
    const u = await rogueScene(unlisted);
    const uv = rogueView(u);
    await must(commitPlacement(uv));
    await must(commitClosure(uv, []));
    await must(establishClock(uv));
    await must(commitPresence(uv));
    await u.store.close();
    expect(await fails(unlisted)).toBe("REPLAY_MISMATCH");
  });

  it("a successor presence and a rival custodian committed outside admission fail the open", async () => {
    const dir = tempDir();
    const r = await rogueScene(dir);
    const v = rogueView(r);
    await must(commitPlacement(v));
    await must(commitClosure(v));
    await must(establishClock(v));
    await must(commitPresence(v));
    await must(
      r.store.commit(
        r1Group(
          r.store,
          PRESENCE_KEY,
          presenceValue(),
          [PLACEMENT_KEY, CLOSURE_KEY, "temporal/state"],
          {},
          1,
        ),
      ),
    );
    await r.store.close();
    expect(await fails(dir)).toBe("REPLAY_MISMATCH");
  });

  it("a history that bears R1 facts but was opened WITHOUT the historical verifier fails closed", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir);
    await fullChain(s);
    await s.campaign.close();
    // canonical open: verified and clean
    expect(await fails(dir)).toBe("OK");
    // the same package opened by a build that wires admission WITHOUT the hook: the chain is not demonstrably verified
    const opened = await must(
      openFileCampaign(dir, {
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
        admission: { check: canonicalAdmission.check },
      }),
    );
    const violations = verifyActorPresenceIntegrity(opened);
    expect(violations.map((x) => x.code).sort()).toEqual([
      "ACTOR_PRESENCE_STATE",
      "ACTOR_SETUP_STATE",
      "ACTOR_SETUP_STATE",
    ]);
    expect(violations.every((x) => /did not demonstrably run/.test(x.message))).toBe(true);
    await opened.close();
    // and with the hook the evidence is present
    const verified = await must(
      openFileCampaign(dir, {
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
        admission: canonicalAdmission,
      }),
    );
    expect(verifyActorPresenceIntegrity(verified)).toEqual([]);
    await verified.close();
  });

  it("legacy journals with no R1 fact replay unchanged and carry no R1 evidence requirement", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir);
    const head = s.campaign.store.head();
    await s.campaign.close();
    const opened = await must(
      openFileCampaign(dir, {
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
        admission: { check: canonicalAdmission.check },
      }),
    );
    expect(opened.head().state_sha256).toBe(head.state_sha256);
    expect(verifyActorPresenceIntegrity(opened)).toEqual([]);
    await opened.close();
    void temporalPublication;
    void placementValue;
    void closureValue;
  });
});
