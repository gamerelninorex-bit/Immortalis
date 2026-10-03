/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// WS-016 Named-Actor "BOUNDED_PRIOR_RANDOMIZED" establishment over F-027-CD1 Causal Draw (twenty-seventh slice) — "where
// genuine uncertainty remains after the smallest established causes, the Named-Actor owner defines a branch-invariant
// bounded prior; the neutral Causal Draw fixes the unresolved basis slot; the committed draw result precedes the owner's own
// establishment, which reads that exact result and depends on its group; the existing capability close then publishes the
// capability exactly as before and cross-owner reads stay AS-OF-DECLARED-CLOSE."
// Register lineage: IA-01/02/03 (partial), IA-14 (partial), IA-30 (partial); RC-02/03/04/09/16; IM-02, IM-03, IM-07, IM-11,
// IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0 + F-027-CD1 v1.0): WS-016 §16–17, CD1 §17 CD-CC-01.
// All priors below are SYNTHETIC test coordinates; the engine reads no weight, grade table or default.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorCapabilityKey,
  capabilityCandidateId,
  causalDrawId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  namedActorCapabilityDrawKey,
  parseCapabilityCandidateId,
  type ComparativeMarker,
} from "@immortalis/contracts";
import {
  NAMED_ACTOR_RULE,
  capabilityDrawDigest,
  deriveCapability,
  stageGroupId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_COMMAND,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  RESOLVER,
  SEED_1,
  SEED_2,
  SEED_3,
  actorPublication,
  capabilityBasis,
  consumerAdvanceRequest,
  capabilityConsumerObject,
  consumerResultKey,
  dominantPrior,
  historyGroup,
  historyKey,
  randomizedEstablishment,
  seededEntropy,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishBasis,
  establishRandomized,
  registerConsumer,
  seededActorCampaign,
  type ActorSeeded,
} from "../support/actor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { journalMark } from "../support/causal-draw.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const basisKey = actorCapabilityBasisKey(A, C);
const capKey = actorCapabilityKey(A, C);
const digest = capabilityDrawDigest(A, C);
const advance = (s: ActorSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(consumerAdvanceRequest(id, consumer));
const revision = (s: ActorSeeded, key: string) =>
  s.campaign.store.lookupReceipt(s.campaign.store.getFact(key)!.provenance.intent_id)!.revision;
const drawFacts = (s: ActorSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"));

/** An independent statement of CDA-01 (F-027-CD1 §11), written from the addendum rather than read from the engine. */
function independentSelection(
  seedHex: string,
  drawKeyDigest: string,
  specDigest: string,
  candidates: readonly { candidate_id: string; weight: string }[],
): string {
  const ordered = [...candidates].sort((x, y) =>
    x.candidate_id < y.candidate_id ? -1 : x.candidate_id > y.candidate_id ? 1 : 0,
  );
  const total = ordered.reduce((n, c) => n + BigInt(c.weight), 0n);
  const bits = (total - 1n).toString(2).length;
  const bytes = Math.ceil(bits / 8);
  for (let attempt = 0; ; attempt++) {
    let material = Buffer.alloc(0);
    for (let j = 0; material.length < bytes; j++) {
      material = Buffer.concat([
        material,
        createHmac("sha256", Buffer.from(seedHex, "hex"))
          .update(
            `IMMORTALIS-CDRAW-WEIGHTED-FINITE-V1|${drawKeyDigest}|${specDigest}|${attempt}|${j}`,
          )
          .digest(),
      ]);
    }
    const sample = Buffer.from(material.subarray(0, bytes));
    if (bits % 8 !== 0) sample[0] = sample[0]! & (0xff >> (8 - (bits % 8)));
    const r = BigInt(`0x${sample.toString("hex")}`);
    if (r >= total) continue;
    let cumulative = 0n;
    for (const c of ordered) {
      cumulative += BigInt(c.weight);
      if (r < cumulative) return c.candidate_id;
    }
  }
}

describe("a randomized Named-Actor establishment: the draw first, then the owner's own basis, then the unchanged close", () => {
  it("fixes the unresolved basis slot by a committed Causal Draw, then commits the owner's basis by reference to that exact result", async () => {
    const s = await seededActorCampaign(tempDir());
    const before = drawFacts(s);
    expect(before).toEqual([]);
    const input = randomizedEstablishment(A, C, {
      prior: [
        { marker: "C", weight: "6" },
        { marker: "B", weight: "2" },
      ],
    });
    const r = await must(
      s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: input,
        resolution: RESOLVER,
      }),
    );
    expect(r.replayed).toBe(false);
    expect(s.entropy.calls()).toBe(1);

    // the draw evidence: exactly the two create-only records, in the one journal, committed BEFORE the owner's basis
    const precommit = s.campaign.store.getFact(causalDrawPrecommitKey(digest))!;
    const result = s.campaign.store.getFact(causalDrawResultKey(digest))!;
    const basis = s.actors.basis(A, C)!;
    expect(drawFacts(s).map((f) => f.key)).toEqual([precommit.key, result.key].sort());
    expect(revision(s, precommit.key)).toBeLessThan(revision(s, result.key));
    expect(revision(s, result.key)).toBeLessThan(revision(s, basisKey));

    // the draw identity is the slot's stable causal identity: four dimensions, the unresolved basis slot as the result
    const pre = precommit.value as any;
    expect(pre.draw_key).toEqual(namedActorCapabilityDrawKey(A, C));
    expect(Object.keys(pre.draw_key).sort()).toEqual([
      "causal_process_id",
      "opportunity_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(pre.draw_key.prospective_result_id).toBe(basisKey);
    expect(pre.draw_key.owner_operation).toEqual({
      owner: "named_actor",
      operation: "named-actor-establish-capability-basis",
    });
    expect(pre.draw_id).toBe(causalDrawId(digest));

    // the prior is the owner's own: its rule, its causes as the exact inputs, its possibilities exactly as authored
    // (the draw layer's CDS-02 only divides the common factor), with no candidate added, removed or defaulted
    expect(pre.normalized_spec.owner_rule_ref).toEqual(NAMED_ACTOR_RULE);
    expect(
      pre.normalized_spec.input_refs.map((x: any) => [x.owner, x.fact_key, x.version]).sort(),
    ).toEqual(input.causes.map((c) => [c.owner, c.fact_key, c.version]).sort());
    expect(
      pre.normalized_spec.candidates
        .map((c: any) => [
          JSON.stringify(parseCapabilityCandidateId(c.candidate_id)!.marker),
          c.weight,
        ])
        .sort(),
    ).toEqual([
      ['"B"', "1"],
      ['"C"', "3"],
    ]);

    // the selection is exactly the weighted selection CDA-01 makes from the committed seed
    const res = result.value as any;
    expect(res.selected_candidate_id).toBe(
      independentSelection(
        pre.entropy_hex,
        digest,
        pre.spec_digest,
        pre.normalized_spec.candidates,
      ),
    );

    // the owner's basis: the marker is the owner's reading of that selected candidate, and nothing else was copied in
    const selected = parseCapabilityCandidateId(res.selected_candidate_id)!;
    expect(basis.value.marker).toEqual(selected.marker);
    expect(basis.value).toEqual({
      actor_id: A,
      capability_id: C,
      marker: selected.marker,
      materiality: "ROLE_DEFINING",
      establishment: {
        method: "BOUNDED_PRIOR_RANDOMIZED",
        causes: input.causes,
        draw: {
          draw_id: causalDrawId(digest),
          result: { fact_key: result.key, version: result.version },
        },
      },
    });
    expect(basis.fact).toMatchObject({ owner: "named_actor", facet: "actor_profile", version: 1 });
    expect(basis.fact.provenance.rule).toEqual(NAMED_ACTOR_RULE);

    // it read the exact result fact/version and depends on its canonical result group, plus the pinned causes
    const group = s.campaign.store.committedGroup(basis.fact.provenance.intent_id)!;
    expect(group.reads).toContainEqual({ key: result.key, version: result.version });
    expect(group.depends_on).toContain(causalDrawResultGroupId(digest));
    expect(result.provenance.group_id).toBe(causalDrawResultGroupId(digest));
    for (const c of input.causes) {
      expect(group.reads).toContainEqual({ key: c.fact_key, version: c.version });
    }
    expect(group.writes).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the existing capability close then publishes the capability exactly as before, and the consequence reads it AS-OF-DECLARED-CLOSE", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishRandomized(s, 1, { prior: dominantPrior("A", ["B"]) });
    expect(basis.marker).toBe("A");
    // a sealed randomized basis alone is no capability
    expect(s.actors.capability(A, C)).toBeUndefined();
    await registerConsumer(s, "c1", basis, 2);
    const done = await must(advance(s));
    expect(done.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    expect(done.transaction.stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "named_actor",
      "SYNTHETIC-CAPABILITY-CONSUMER",
    ]);
    const cap = s.actors.capability(A, C)!;
    const derived = deriveCapability({
      key: basisKey,
      owner: "named_actor",
      version: 1,
      value: basis,
    });
    expect(derived.ok && cap.value).toEqual(derived.ok && derived.value);
    // exactly the minimal §3 record — no draw, prior, weight, seed or probability reaches the capability
    expect(Object.keys(cap.value).sort()).toEqual(
      ["actor_id", "basis", "capability_id", "close", "marker"].sort(),
    );
    expect(JSON.stringify(cap.value)).not.toMatch(/draw|seed|weight|prior|random/i);
    expect(cap.close_group).toBe(
      stageGroupId({
        causal_process_id: `actor-capability/${A}/${C}`,
        owner_operation: {
          owner: "named_actor",
          operation: "named-actor-publish-capability-close",
        },
        prospective_result_id: capKey,
      }),
    );
    expect(s.campaign.store.getFact(consumerResultKey("c1"))!.value).toMatchObject({
      observed_actor: A,
      observed_capability: C,
      observed_marker: "A",
      observed_close_group: cap.close_group,
    });
    // the close is no draw: it asked for no entropy and made no Causal Draw record
    expect(s.entropy.calls()).toBe(1);
    expect(drawFacts(s)).toHaveLength(2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form is a lawful possibility with its own meaning: C, B, A, S, EX with its descriptor, and ungraded — EX is not S+", async () => {
    const s = await seededActorCampaign(tempDir());
    const forms: [string, ComparativeMarker | null][] = [
      ["C", "C"],
      ["B", "B"],
      ["A", "A"],
      ["S", "S"],
      ["EX", { ex: "a causal descriptor the owner established" }],
      ["UNGRADED", null],
    ];
    for (const [i, [name, marker]] of forms.entries()) {
      const others: (ComparativeMarker | null)[] = marker === "C" ? ["B"] : ["C"];
      const cap = `capability-form-${name.toLowerCase()}`;
      const basis = await establishRandomized(
        s,
        i + 1,
        { capability_id: cap, prior: dominantPrior(marker, others) },
        A,
        cap,
      );
      expect(basis.marker, name).toEqual(marker);
      // the marker is parsed from, and only from, the candidate id's canonical encoding
      expect(parseCapabilityCandidateId(capabilityCandidateId(marker))).toEqual({ marker });
    }
    // EX survives the close untouched and is observed as such (no S+); ungraded likewise (no below-C rung)
    const closeAndObserve = async (t: ActorSeeded, cap: string, id: string) => {
      const basis = t.actors.basis(A, cap)!.value;
      await must(
        t.coordinator.registerObject({
          ...temporalPublication(2),
          object: capabilityConsumerObject(id, basis),
        }),
      );
      await must(advance(t, `tx-${id}`, id));
      expect(t.actors.capability(A, cap)!.value.marker).toEqual(basis.marker);
      expect(t.campaign.store.getFact(consumerResultKey(id))!.value).toMatchObject({
        observed_marker: basis.marker,
      });
      expect(t.campaign.verify()).toEqual([]);
    };
    await closeAndObserve(s, "capability-form-ex", "c-ex");
    expect(s.actors.capability(A, "capability-form-ex")!.value.marker).toEqual({
      ex: "a causal descriptor the owner established",
    });
    const u = await seededActorCampaign(tempDir());
    await establishRandomized(u, 1, { prior: dominantPrior(null, ["C"]) });
    await closeAndObserve(u, C, "c-ungraded");
    expect(u.actors.capability(A, C)!.value.marker).toBeNull();
  });

  it("a descriptor with any character an identifier forbids still has an unambiguous candidate meaning (opaque to the draw)", () => {
    for (const ex of ["plain", "tab\there", "del\u007fchar", "ünïcode ✦ 🜂", "a".repeat(5000)]) {
      const id = capabilityCandidateId({ ex });
      expect(parseCapabilityCandidateId(id)).toEqual({ marker: { ex } });
      expect(id).toMatch(/^capability-candidate:v1:[A-Za-z0-9_-]+$/);
    }
    for (const bad of [
      "C",
      "capability-candidate:v1:",
      "capability-candidate:v1:!!!",
      `capability-candidate:v1:${btoa('"S+"')}`,
      `capability-candidate:v1:${btoa("3")}`,
      `capability-candidate:v1:${btoa('{"ex":"x","level":1}')}`,
      // a non-canonical encoding of a lawful marker has no meaning: one marker, one candidate id
      `capability-candidate:v1:${btoa('"C"')}=`,
      `capability-candidate:v1:${btoa(' "C"')}`,
    ])
      expect(parseCapabilityCandidateId(bad), bad).toBeUndefined();
  });
});

describe("the prior is the owner's alone: nothing is defaulted, added or converted into ordinary/C weighting", () => {
  it("a prior without C is exactly that prior: the engine adds no C candidate and cannot select one", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1, {
      prior: [
        { marker: "B", weight: "1" },
        { marker: null, weight: "1" },
        { marker: { ex: "descriptor" }, weight: "1" },
      ],
    });
    const spec = (s.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
      .normalized_spec;
    const markers = spec.candidates.map(
      (c: any) => parseCapabilityCandidateId(c.candidate_id)!.marker,
    );
    expect(markers).toHaveLength(3);
    expect(markers).not.toContain("C");
    expect(markers).toContainEqual(null);
    expect(s.actors.basis(A, C)!.value.marker).not.toBe("C");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an absent, empty, singleton, duplicated or malformed prior is refused at the draw gate: no entropy, no write, and no stand-in", async () => {
    const s = await seededActorCampaign(tempDir());
    const mark = journalMark(s.campaign.store);
    const attempts: [string, unknown, string][] = [
      ["empty", [], "DRAW_CANDIDATE_SET_EMPTY"],
      ["singleton C", [{ marker: "C", weight: "1" }], "DRAW_NOT_REQUIRED_SINGLETON"],
      [
        "duplicate possibility",
        [
          { marker: "C", weight: "1" },
          { marker: "C", weight: "2" },
        ],
        "DRAW_CANDIDATE_DUPLICATE",
      ],
      ["absent", undefined, "INPUT_INVALID"],
    ];
    for (const [name, prior, code] of attempts) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: { ...randomizedEstablishment(A, C), prior },
        resolution: RESOLVER,
      });
      expect(r.ok, name).toBe(false);
      expect(r.ok ? "" : r.error.code, name).toBe(code);
    }
    for (const weight of ["0", "-1", "1.5", "1e3", "01", "", 3, null] as unknown[]) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: {
          ...randomizedEstablishment(A, C),
          prior: [
            { marker: "C", weight },
            { marker: "B", weight: "1" },
          ],
        },
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code, String(weight)).toBe("INPUT_INVALID");
    }
    for (const marker of ["S+", "D", 3, "EX", { ex: "" }, { ex: " x" }, { level: 3 }, undefined]) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: {
          ...randomizedEstablishment(A, C),
          prior: [
            { marker, weight: "1" },
            { marker: "C", weight: "1" },
          ],
        },
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code, JSON.stringify(marker)).toBe("INPUT_INVALID");
    }
    // no Potential, level, percentage or score can be supplied alongside the prior
    for (const extra of [
      "potential",
      "level",
      "percent",
      "score",
      "seed",
      "roll",
      "default_marker",
    ]) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: { ...randomizedEstablishment(A, C), [extra]: 1 },
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code, extra).toBe("INPUT_INVALID");
    }
    expect(s.entropy.calls()).toBe(0);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    expect(s.actors.basis(A, C)).toBeUndefined();
  });
});

describe("the draw identity is the slot's causal identity: no request, retry, consequence, model, narration, clock or partition", () => {
  it("two campaigns that differ in every incidental — publication ids, cause text, entropy, build, resolver run — draw under one identity", async () => {
    const one = await seededActorCampaign(tempDir(), { entropy: seededEntropy(SEED_1) });
    const two = await seededActorCampaign(tempDir(), {
      entropy: seededEntropy(SEED_3),
      buildId: "another-build",
    });
    await establishRandomized(one, 1);
    await must(
      two.actors.establishRandomizedCapabilityBasis({
        group_id: "another-group",
        intent_id: "another-intent",
        cause: "another-cause",
        basis: "another-basis",
        secrecy: "another-secrecy",
        capability: randomizedEstablishment(A, C),
        resolution: RESOLVER,
      }),
    );
    const p1 = one.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any;
    const p2 = two.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any;
    expect(p1.draw_id).toBe(p2.draw_id);
    expect(p1.draw_key).toEqual(p2.draw_key);
    expect(p1.spec_digest).toBe(p2.spec_digest);
    expect(p1.entropy_hex).not.toBe(p2.entropy_hex);
  });

  it("a different actor, or a different capability of the same actor, is a different slot and so a different draw; the same pair is never two", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1, {}, A, C);
    await establishRandomized(s, 2, {}, ACTOR_SWORD, C);
    await establishRandomized(s, 3, { capability_id: CAP_COMMAND }, A, CAP_COMMAND);
    const ids = drawFacts(s)
      .filter((f) => f.key.endsWith("/precommit"))
      .map((f) => (f.value as any).draw_id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(causalDrawId(capabilityDrawDigest(A, C)));
    expect(ids).toContain(causalDrawId(capabilityDrawDigest(ACTOR_SWORD, C)));
    expect(ids).toContain(causalDrawId(capabilityDrawDigest(A, CAP_COMMAND)));
  });
});

describe("a technical retry converges on the same draw and the same establishment", () => {
  it("re-presenting the identical request is the original receipt: no new entropy, no new record", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1);
    const head = s.campaign.store.head();
    const facts = s.campaign.store.listFacts();
    const again = await must(
      s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: randomizedEstablishment(A, C),
        resolution: RESOLVER,
      }),
    );
    expect(again.replayed).toBe(true);
    expect(s.entropy.calls()).toBe(1);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.listFacts()).toEqual(facts);
  });

  it("a retry after a cause moved on still reaches the original receipt (the committed prior keeps its own committers)", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1);
    const committed = s.actors.basis(A, C)!;
    await must(
      s.campaign.store.commit(
        historyGroup(FIXTURE_CAMPAIGN, 90, `${A}-biography`, "SYNTHETIC FIXTURE: moved on", 1),
      ),
    );
    expect(s.campaign.store.getFact(historyKey(`${A}-biography`))!.version).toBe(2);
    const head = s.campaign.store.head();
    const again = await must(
      s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: randomizedEstablishment(A, C),
        resolution: RESOLVER,
      }),
    );
    expect(again.replayed).toBe(true);
    expect(s.entropy.calls()).toBe(1);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.actors.basis(A, C)).toEqual(committed);
  });

  it("a NEW request for the same slot reuses the committed draw (no new seed) and cannot establish a second basis", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1);
    const marker = s.actors.basis(A, C)!.value.marker;
    const head = s.campaign.store.head();
    const second = await s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(2),
      capability: randomizedEstablishment(A, C),
      resolution: RESOLVER,
    });
    expect(second.ok).toBe(false);
    expect(s.entropy.calls()).toBe(1);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.actors.basis(A, C)!.value.marker).toEqual(marker);
  });

  it("a changed prior, changed causes or changed materiality under the same slot is a conflict, never a second draw", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1);
    const head = s.campaign.store.head();
    const changed: [string, Parameters<typeof randomizedEstablishment>[2]][] = [
      ["prior", { prior: dominantPrior("S", ["A"]) }],
      [
        "weights",
        {
          prior: [
            { marker: "C", weight: "3" },
            { marker: "B", weight: "2" },
          ],
        },
      ],
    ];
    for (const [name, over] of changed) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: randomizedEstablishment(A, C, over),
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code, name).toBe("DRAW_IDENTITY_CONFLICT");
    }
    const fewerCauses = await s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(1),
      capability: randomizedEstablishment(A, C, {}, [`${A}-biography`]),
      resolution: RESOLVER,
    });
    expect(fewerCauses.ok ? "" : fewerCauses.error.code).toBe("DRAW_IDENTITY_CONFLICT");
    expect(s.entropy.calls()).toBe(1);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("a scaled prior is the same prior (CDS-02): common weight scaling and caller order cannot make a new draw", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishRandomized(s, 1, {
      prior: [
        { marker: "C", weight: "6" },
        { marker: "B", weight: "2" },
      ],
    });
    const again = await must(
      s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: randomizedEstablishment(A, C, {
          prior: [
            { marker: "B", weight: "1" },
            { marker: "C", weight: "3" },
          ],
        }),
        resolution: RESOLVER,
      }),
    );
    expect(again.replayed).toBe(true);
    expect(s.entropy.calls()).toBe(1);
  });

  it("the resolver context is a precondition of the draw: any other authority is refused before anything is written", async () => {
    const s = await seededActorCampaign(tempDir());
    const mark = journalMark(s.campaign.store);
    for (const resolution of [
      undefined,
      {},
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.resolver", permission: "permission.canon.write" },
    ]) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability: randomizedEstablishment(A, C),
        resolution,
      });
      expect(r.ok ? "" : r.error.code).toBe("AUTHORITY_DENIED");
    }
    expect(s.entropy.calls()).toBe(0);
    expect(journalMark(s.campaign.store)).toEqual(mark);
  });

  it("secure entropy that is unavailable means no draw and no establishment, and a later lawful attempt starts clean", async () => {
    const failing = Object.assign(
      (): Uint8Array => {
        throw new Error("no entropy");
      },
      { calls: () => 0 },
    );
    const s = await seededActorCampaign(tempDir(), { entropy: failing as never });
    const mark = journalMark(s.campaign.store);
    const r = await s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(1),
      capability: randomizedEstablishment(A, C),
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("DRAW_ENTROPY_UNAVAILABLE");
    expect(journalMark(s.campaign.store)).toEqual(mark);
    expect(drawFacts(s)).toEqual([]);
    expect(s.actors.basis(A, C)).toBeUndefined();
  });
});

describe("nothing is drawn for an establishment that could never be committed (a draw is irreversible)", () => {
  it("a Player Character identity, a foreign-kernel or draw-evidence cause, a missing cause and a stale pin are each refused before any draw state", async () => {
    const s = await seededActorCampaign(tempDir());
    const mark = journalMark(s.campaign.store);
    const base = randomizedEstablishment(A, C);
    const cause0 = base.causes[0]!;
    const attempts: [string, unknown, string][] = [
      [
        "PC identity",
        randomizedEstablishment(FIXTURE_PC_ID, C, {}, [`${A}-biography`]),
        "KEY_NOT_ADMITTED",
      ],
      [
        "kernel cause",
        { ...base, causes: [{ ...cause0, owner: "temporal_kernel", fact_key: "temporal/state" }] },
        "REFERENCE_INVALID",
      ],
      [
        "draw evidence as a cause",
        { ...base, causes: [{ ...cause0, owner: "causal_draw_kernel" }] },
        "REFERENCE_INVALID",
      ],
      [
        "the actor's own state as a cause",
        { ...base, causes: [{ ...cause0, owner: "named_actor" }] },
        "REFERENCE_INVALID",
      ],
      [
        "missing cause",
        { ...base, causes: [{ ...cause0, fact_key: "synthetic-actor-history/never-committed" }] },
        "PREREQUISITE_MISSING",
      ],
      ["stale pin", { ...base, causes: [{ ...cause0, version: 2 }] }, "REFERENCE_INVALID"],
      [
        "wrong owner",
        { ...base, causes: [{ ...cause0, owner: "some-other-owner" }] },
        "REFERENCE_INVALID",
      ],
    ];
    for (const [name, capability, code] of attempts) {
      const r = await s.actors.establishRandomizedCapabilityBasis({
        ...actorPublication(1),
        capability,
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code, name).toBe(code);
    }
    expect(s.entropy.calls()).toBe(0);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    expect(drawFacts(s)).toEqual([]);
    // the slot is still free for the lawful request
    await establishRandomized(s, 1);
    expect(s.actors.basis(A, C)).toBeDefined();
  });

  it("an already-established slot needs no draw: the owner's independent establishment stands, and no entropy is asked", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    const mark = journalMark(s.campaign.store);
    const r = await s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(2),
      capability: randomizedEstablishment(A, C),
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED");
    expect(s.entropy.calls()).toBe(0);
    expect(journalMark(s.campaign.store)).toEqual(mark);
  });
});

describe("the CAUSALLY_DETERMINED path is unchanged: it never touches the draw or its entropy", () => {
  it("a deterministic establishment, close and consumption asks for no entropy and writes no Causal Draw record", async () => {
    const s = await seededActorCampaign(tempDir(), { entropy: seededEntropy(SEED_2) });
    const basis = await establishBasis(s, 1);
    expect(basis).toEqual(capabilityBasis(A, C));
    await registerConsumer(s, "c1", basis, 2);
    await must(advance(s));
    expect(s.entropy.calls()).toBe(0);
    expect(drawFacts(s)).toEqual([]);
    expect(s.actors.capability(A, C)!.value.marker).toBe("C");
    expect(s.campaign.verify()).toEqual([]);
  });
});
