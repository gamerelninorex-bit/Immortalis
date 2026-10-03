/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor Unresolved Capability → PC Material-Trigger World-Prior Resolution Close (thirty-third bounded slice) — "a
// capability that was still UNRESOLVED when an existing actor was handed over stays unrepresented until a later material
// trigger requires it; the one PC owner then fixes it by the smallest established world/actor causes (WS-016 §16, nothing
// drawn) or, where genuine uncertainty remains, within the owner's branch-invariant bounded prior by a committed Causal Draw
// (F-027-CD1 CD-CC-01); the existing PC Capability Close then publishes it and cross-owner reads stay AS-OF-DECLARED-CLOSE."
// Register lineage: IA-01/02/03/14 (partial), IA-30 (partial); RC-02/03/04/09/13/16; IM-02, IM-03, IM-07, IM-11, IM-12, IM-17.
// Sources: spec/f027/spec-lock.json (F-027 v1.0 + F-027-CD1 v1.0) — WS-016 pin 2026-09-24T17:38:59.210Z (Integration Map §2 I-002
// amendment; Draft §§2, 3, 4, 16, 17, 25, 27.1, 28, 32), I-002 pin 2026-09-25T00:15:54.536Z with the v2.1 existing-actor overlay,
// WS-006 / F-014A pin 2026-09-25T00:18:36.828Z, IR pin 2026-09-25T00:17:26.287Z; PC-CONTROL HANDOVER CONTRACT v1 (observed pin
// 2026-09-25T00:16:16.544Z) "Existing Actor → PC" 2 and "Single Commit Point". All priors are SYNTHETIC test coordinates.
// CAL-01 stays UNCALIBRATED. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  capabilityCandidateId,
  causalDrawId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  parseCapabilityCandidateId,
  pcCapabilityBasisKey,
  pcCapabilityDrawKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  type ComparativeMarker,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  derivePcCapability,
  pcCapabilityDrawDigest,
  stageGroupId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  capabilityBasis,
  consumerResultKey,
  dominantPrior,
} from "@immortalis/testkit";
import {
  closePcCapability,
  establishWorldPrior,
  establishWorldPriorRandomized,
  handedOverWithUnresolvedCapability,
  readyForCarryForward,
  carryForward,
  handoverActor,
  seededExistingActorCampaign,
  worldPriorCauses,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const D = CAP_SWORDSMANSHIP; // never fixed before the handover
const basisKey = pcCapabilityBasisKey(A, D);
const capKey = pcCapabilityKey(A, D);
const digest = pcCapabilityDrawDigest(A, D);
const drawFacts = (s: Pick<ExistingActorSeeded, "campaign">) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"));
const revision = (s: Pick<ExistingActorSeeded, "campaign">, key: string) =>
  s.campaign.store.lookupReceipt(s.campaign.store.getFact(key)!.provenance.intent_id)!.revision;
const causeKeys = worldPriorCauses(A, D).map((c) => c.fact_key);

describe("a capability unresolved at handover is represented only when materially required, then fixed by its causes", () => {
  it("the full path: handover with nothing carried → deterministic establishment → PC Capability Close → AS-OF-DECLARED-CLOSE", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    // at handover the capability is unrepresented anywhere: no Named-Actor basis or capability, no PC basis or capability, no draw
    for (const key of [actorCapabilityBasisKey(A, D), actorCapabilityKey(A, D), basisKey, capKey])
      expect(s.campaign.store.getFact(key), key).toBeUndefined();
    expect(drawFacts(s)).toEqual([]);
    expect(s.pcs.basis(A, D)).toBeUndefined();
    expect(s.pcs.capability(A, D)).toBeUndefined();
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    const actorFactsBefore = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("actor/"))
      .map((f) => structuredClone(f));
    const entropyBefore = s.entropy.calls();
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));

    // -- the later material trigger: one create-only basis, the distinct establishment, exact references ----------------
    const received = await must(establishWorldPrior(s, 1, A, D, { marker: "B" }));
    expect(received.replayed).toBe(false);
    const basis = s.pcs.basis(A, D)!;
    expect(basis.fact).toMatchObject({
      key: basisKey,
      owner: "pc_existence",
      facet: "pc_capability_profile",
      version: 1,
    });
    expect(basis.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    expect(basis.value).toEqual({
      pc_id: A,
      capability_id: D,
      marker: "B",
      establishment: {
        method: "EXISTING_ACTOR_CAUSALLY_DETERMINED",
        handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
        causes: worldPriorCauses(A, D),
      },
    });
    // not generation history and not a carry: no contract pointer, claim locator, source capability or draw anywhere
    const text = JSON.stringify(basis.value);
    for (const absent of [
      "ACCEPTED_GENERATION_HISTORY",
      "EXISTING_ACTOR_CARRY_FORWARD",
      "claims",
      "contract",
      "source",
      "draw",
    ])
      expect(text).not.toContain(absent);
    // the group read and depended on exactly what it cites (references, never copies)
    const group = s.campaign.store.committedGroup(basis.fact.provenance.intent_id)!;
    expect(group.writes).toHaveLength(1);
    expect(group.reads).toEqual([
      { key: pcExistenceContractKey(A), version: 1 },
      { key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
      ...causeKeys.map((k) => ({ key: k, version: 1 })),
    ]);
    expect(group.depends_on).toEqual([
      ...new Set(
        [pcExistenceContractKey(A), PLAYER_CHARACTER_BINDING_KEY, ...causeKeys].map(
          (k) => s.campaign.store.getFact(k)!.provenance.group_id,
        ),
      ),
    ]);
    // nothing else was written, nothing was drawn, no entropy was asked for (deterministic path creates no draw evidence)
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => !keysBefore.has(f.key))
        .map((f) => f.key),
    ).toEqual([basisKey]);
    expect(drawFacts(s)).toEqual([]);
    expect(s.entropy.calls()).toBe(entropyBefore);
    // the basis is no capability and is not readable cross-owner
    expect(s.pcs.capability(A, D)).toBeUndefined();

    // -- close: the existing PC Capability Close, through the existing IM-02 temporal path -----------------------------
    const closed = await closePcCapability(s, 20, A, D);
    expect(closed.transaction.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    const stage = pcCapabilityStage(A, D);
    const stages = closed.transaction.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "pc_existence",
      "SYNTHETIC-CAPABILITY-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(stage);
    expect(stages[0]!.group_id).toBe(stageGroupId(stage));
    expect(stages[1]!.reads[0]!).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "pc_existence", fact_key: capKey },
      close_basis: {
        name: "PC Capability Close",
        producer: { owner: "pc_existence", operation: "pc-publish-capability-close" },
      },
    });
    const cap = s.pcs.capability(A, D)!;
    expect(cap.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    const derived = derivePcCapability({
      key: basisKey,
      owner: "pc_existence",
      version: 1,
      value: basis.value,
    });
    expect(derived.ok && cap.value).toEqual(derived.ok && derived.value);
    expect(cap.value.marker).toBe("B");
    // no same-resolution feedback: the consequence observed exactly the closed marker, committed by the close group
    expect(
      s.campaign.store.getFact(consumerResultKey(`pc-consumer-${A}-${D}`))!.value,
    ).toMatchObject({ observed_marker: "B", observed_close_group: cap.close_group });
    expect(drawFacts(s)).toEqual([]);

    // -- the predecessor stays exactly what it was: cold provenance, never writable again ---------------------------------
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("actor/"))
        .map((f) => structuredClone(f)),
    ).toEqual(actorFactsBefore);
    const late = await s.actors.establishCapabilityBasis({
      group_id: "late-group",
      intent_id: "late-intent",
      cause: "late-cause",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, D),
    });
    expect(!late.ok && late.error.code).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form is the owner's authored judgment, unchanged: each grade, EX with its descriptor and the explicit ungraded null", async () => {
    const markers: (ComparativeMarker | null)[] = [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ];
    for (const marker of markers) {
      const s = await seededExistingActorCampaign(tempDir());
      await handedOverWithUnresolvedCapability(s);
      await must(establishWorldPrior(s, 1, A, D, { marker }));
      expect(s.pcs.basis(A, D)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      await closePcCapability(s, 20, A, D);
      expect(s.pcs.capability(A, D)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      expect(s.campaign.verify()).toEqual([]);
    }
  });

  it("a capability stays unrepresented until it is required: the handover and another capability's establishment resolve nothing for it", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    const other = "capability-other";
    await must(establishWorldPrior(s, 1, A, other));
    expect(s.pcs.basis(A, D)).toBeUndefined();
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability"))
        .map((f) => f.key),
    ).toEqual([pcCapabilityBasisKey(A, other)]);
    expect(drawFacts(s)).toEqual([]);
  });

  it("the cutover is required: nothing is established for an actor before the handover, for another identity or with an ordinary PC", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    // not handed over yet
    expect(await codeOf(establishWorldPrior(s, 1, A, D))).toBe("PREREQUISITE_MISSING");
    expect(await codeOf(establishWorldPriorRandomized(s, 2, A, D))).toBe("PREREQUISITE_MISSING");
    expect(s.entropy.calls()).toBe(0);
    await handedOverWithUnresolvedCapability(s);
    // another identity was never handed over
    expect(await codeOf(establishWorldPrior(s, 3, "actor-other", D))).toBe("REFERENCE_INVALID");
    expect(await codeOf(establishWorldPriorRandomized(s, 4, "actor-other", D))).toBe(
      "REFERENCE_INVALID",
    );
    expect(s.entropy.calls()).toBe(0);
    expect(drawFacts(s)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a randomized world-prior establishment: the draw first, then the PC owner's own basis, then the unchanged close", () => {
  it("fixes the unresolved PC basis slot by a committed Causal Draw, then commits the owner's basis by reference to that exact result", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    expect(drawFacts(s)).toEqual([]);
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;

    const r = await must(
      establishWorldPriorRandomized(s, 1, A, D, {
        prior: [
          { marker: "C", weight: "6" },
          { marker: "B", weight: "2" },
        ],
      }),
    );
    expect(r.replayed).toBe(false);
    expect(s.entropy.calls()).toBe(1);

    // the draw evidence: exactly the two create-only records, committed BEFORE the owner's basis
    const precommit = s.campaign.store.getFact(causalDrawPrecommitKey(digest))!;
    const result = s.campaign.store.getFact(causalDrawResultKey(digest))!;
    const basis = s.pcs.basis(A, D)!;
    expect(drawFacts(s).map((f) => f.key)).toEqual([precommit.key, result.key].sort());
    expect(revision(s, precommit.key)).toBeLessThan(revision(s, result.key));
    expect(revision(s, result.key)).toBeLessThan(revision(s, basisKey));

    // the stable draw identity is rooted in the PC capability-basis slot and no incidental
    const spec = (precommit.value as any).normalized_spec;
    expect(spec.draw_key).toEqual(pcCapabilityDrawKey(A, D));
    expect(spec.draw_key).toEqual({
      causal_process_id: `pc-capability/${A}/${D}`,
      opportunity_id: "existing-actor-capability-establishment",
      owner_operation: { owner: "pc_existence", operation: "pc-establish-capability-basis" },
      prospective_result_id: basisKey,
    });
    expect(spec.owner_rule_ref).toEqual(PC_CAPABILITY_RULE);
    expect(spec.input_refs.map((x: any) => x.fact_key).sort()).toEqual([...causeKeys].sort());

    // the basis: the owner's reading of the selected candidate, a pointer to the committed result, no prior or weight stored
    const selected = (result.value as any).selected_candidate_id as string;
    expect(basis.value.marker).toEqual(parseCapabilityCandidateId(selected)!.marker);
    expect(basis.value.establishment).toEqual({
      method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
      handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
      causes: worldPriorCauses(A, D),
      draw: { draw_id: causalDrawId(digest), result: { fact_key: result.key, version: 1 } },
    });
    const text = JSON.stringify(basis.value);
    for (const absent of ["weight", "prior", "seed", "entropy", "candidates", "probab"])
      expect(text).not.toContain(absent);
    const group = s.campaign.store.committedGroup(basis.fact.provenance.intent_id)!;
    expect(group.reads).toContainEqual({ key: result.key, version: 1 });
    expect(group.depends_on).toContain(causalDrawResultGroupId(digest));
    expect(group.depends_on).toContain(
      s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!.provenance.group_id,
    );

    // the close publishes it exactly as for any PC basis; the capability record carries no draw field
    await closePcCapability(s, 20, A, D);
    const cap = s.pcs.capability(A, D)!;
    expect(cap.value.marker).toEqual(basis.value.marker);
    expect(Object.keys(cap.value).sort()).toEqual(
      ["basis", "capability_id", "close", "marker", "pc_id"].sort(),
    );
    expect(s.entropy.calls()).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form is reachable through the draw: each grade, EX with its descriptor, and ungraded null — never a default", async () => {
    const markers: (ComparativeMarker | null)[] = [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ];
    for (const marker of markers) {
      const s = await seededExistingActorCampaign(tempDir());
      await handedOverWithUnresolvedCapability(s);
      const others = [marker === "C" ? "B" : "C"] as ComparativeMarker[];
      await must(
        establishWorldPriorRandomized(s, 1, A, D, { prior: dominantPrior(marker, others) }),
      );
      expect(s.pcs.basis(A, D)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      await closePcCapability(s, 20, A, D);
      expect(s.pcs.capability(A, D)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      expect(s.campaign.verify()).toEqual([]);
    }
  });

  it("no prior is invented: an absent, empty or singleton prior is refused by the draw gate with nothing drawn or established", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    const head = s.campaign.store.head();
    expect(await codeOf(establishWorldPriorRandomized(s, 1, A, D, { prior: [] }))).toBe(
      "DRAW_CANDIDATE_SET_EMPTY",
    );
    expect(
      await codeOf(
        establishWorldPriorRandomized(s, 2, A, D, { prior: [{ marker: "B", weight: "5" }] }),
      ),
    ).toBe("DRAW_NOT_REQUIRED_SINGLETON");
    expect(
      await codeOf(
        establishWorldPriorRandomized(s, 3, A, D, {
          prior: [
            { marker: "B", weight: "1" },
            { marker: "B", weight: "2" },
          ],
        }),
      ),
    ).toBe("DRAW_CANDIDATE_DUPLICATE");
    expect(s.entropy.calls()).toBe(0);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });

  it("a request that could never be admitted consumes nothing: no entropy, no draw evidence, no basis", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    const head = s.campaign.store.head();
    // an uncommitted cause, a cause at a stale version, a foreign-kernel cause and a PC-capability cause
    const causes = worldPriorCauses(A, D);
    const refusals: [unknown, string][] = [
      [[{ ...causes[0]!, fact_key: "no-such-fact" }], "PREREQUISITE_MISSING"],
      [[{ ...causes[0]!, version: 7 }], "REFERENCE_INVALID"],
      [[{ ...causes[0]!, owner: "causal_draw_kernel" }], "REFERENCE_INVALID"],
      [
        [{ ...causes[0]!, owner: "temporal_kernel", fact_key: "temporal/state" }],
        "REFERENCE_INVALID",
      ],
    ];
    for (const [i, [bad, code]] of refusals.entries()) {
      const r = await codeOf(
        establishWorldPriorRandomized(s, 10 + i, A, D, { causes: bad as never }),
      );
      expect(r, JSON.stringify(bad)).toBe(code);
      expect(s.campaign.store.head()).toEqual(head);
    }
    expect(s.entropy.calls()).toBe(0);
    expect(drawFacts(s)).toEqual([]);
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });
});

describe("scope: only capability genuinely unfixed at handover; the predecessor's authoritative or begun state is never re-resolved", () => {
  it("an already-authoritative pre-handover capability is carry-forward territory: never rerolled, regraded or re-established", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s, A, CAP_METALWORKING, { marker: "A" });
    await must(handoverActor(s, 1));
    const sourceKey = actorCapabilityKey(A, CAP_METALWORKING);
    const head = s.campaign.store.head();
    const calls = s.entropy.calls();
    expect(await codeOf(establishWorldPrior(s, 1, A, CAP_METALWORKING, { marker: "S" }))).toBe(
      "KEY_NOT_ADMITTED",
    );
    expect(await codeOf(establishWorldPriorRandomized(s, 2, A, CAP_METALWORKING))).toBe(
      "KEY_NOT_ADMITTED",
    );
    expect(s.entropy.calls()).toBe(calls);
    expect(s.campaign.store.head()).toEqual(head);
    // the carry-forward is unchanged and still carries it exactly
    await must(carryForward(s, 1));
    expect(s.pcs.basis(A, CAP_METALWORKING)!.value).toMatchObject({
      marker: "A",
      establishment: { method: "EXISTING_ACTOR_CARRY_FORWARD" },
    });
    expect(s.campaign.store.getFact(sourceKey)!.version).toBe(1);
    expect(drawFacts(s)).toEqual([]);
  });

  it("a predecessor Named-Actor basis that fixed the slot without its close fails closed: no PC establishment, no draw", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    // the actor's basis for D committed before the cutover, never closed (the interrupted pre-handover establishment)
    await must(
      s.actors.establishCapabilityBasis({
        group_id: "d-group",
        intent_id: "d-intent",
        cause: "d-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        capability: capabilityBasis(A, D),
      }),
    );
    await handedOverWithUnresolvedCapability(s);
    const head = s.campaign.store.head();
    expect(await codeOf(establishWorldPrior(s, 1, A, D))).toBe("KEY_NOT_ADMITTED");
    expect(await codeOf(establishWorldPriorRandomized(s, 2, A, D))).toBe("KEY_NOT_ADMITTED");
    expect(s.entropy.calls()).toBe(0);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });

  it("predecessor Named-Actor draw evidence that fixed the slot without its basis fails closed rather than reroll", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    // the actor owner's own randomized draw committed (precommit and result) but its establishment never landed
    const { RESOLVER } = await import("@immortalis/testkit");
    const { namedActorCapabilityDrawKey } = await import("@immortalis/contracts");
    const {
      capabilityDrawSpecification,
      CausalDrawAdapter,
      namedActorRuleAuthority,
      namedActorSlotInspector,
    } = await import("@immortalis/engine");
    const refs = worldPriorCauses(A, D).map((c) => ({
      owner: c.owner,
      fact_key: c.fact_key,
      version: c.version,
      committed_by: s.campaign.store.getFact(c.fact_key)!.provenance.group_id,
    }));
    const adapter = new CausalDrawAdapter(s.campaign.store, {
      slotInspectors: new Map([["named_actor", namedActorSlotInspector(s.campaign.store)]]),
      ruleAuthority: namedActorRuleAuthority,
      entropy: s.entropy,
    });
    await must(
      adapter.draw({
        specification: capabilityDrawSpecification(
          {
            actor_id: A,
            capability_id: D,
            materiality: "ROLE_DEFINING",
            causes: worldPriorCauses(A, D),
            prior: [
              { marker: "C", weight: "1" },
              { marker: "B", weight: "1" },
            ],
          },
          refs,
        ),
        resolution: RESOLVER,
      }),
    );
    expect(namedActorCapabilityDrawKey(A, D).prospective_result_id).toBe(
      actorCapabilityBasisKey(A, D),
    );
    await handedOverWithUnresolvedCapability(s);
    const head = s.campaign.store.head();
    const calls = s.entropy.calls();
    expect(await codeOf(establishWorldPrior(s, 1, A, D))).toBe("KEY_NOT_ADMITTED");
    expect(await codeOf(establishWorldPriorRandomized(s, 2, A, D))).toBe("KEY_NOT_ADMITTED");
    expect(s.entropy.calls()).toBe(calls);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.pcs.basis(A, D)).toBeUndefined();
  });

  it("the PC capability close and the consumer are unchanged for a world-prior basis: a capability resolves only inside a dependent consequence", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await handedOverWithUnresolvedCapability(s);
    await must(establishWorldPriorRandomized(s, 1, A, D));
    expect(s.pcs.capability(A, D)).toBeUndefined();
    expect(capabilityCandidateId("C").startsWith("capability-candidate:v1:")).toBe(true);
    await closePcCapability(s, 20, A, D);
    expect(s.pcs.capability(A, D)!.fact.version).toBe(1);
    // the close slot is sealed
    expect(s.pcs.basis(A, D)!.fact.version).toBe(1);
  });
});
