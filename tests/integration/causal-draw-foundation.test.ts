// F-027-CD1 Causal Draw foundation — the primary path, the exact CDR-01 gate order and its refusals, replay and identity
// law (CDR-02), the substantive-slot boundary (CDR-01 step 4), secure entropy with no fallback (CDE-01), publication-time
// revalidation (CAL-08), and historical-algorithm verification (CDV-01), on one deliberately small deterministic fixture
// with a SYNTHETIC substantive owner. The Causal Draw layer selects an opaque candidate id only.
// Register lineage: IA-02, IA-03, IA-06, IA-30 (partial); RC-09, RC-16; IM-03, IM-11, IM-12, IM-17; F-027-CD1.
// Spec lock f027 + addendum F-027-CD1 (pin 2026-10-02T15:11:03.450Z). Local success is NOT provider/recovery acceptance.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  causalDrawId,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  causalDrawResultKey,
  type CausalDrawSpecification,
} from "@immortalis/contracts";
import {
  CAUSAL_DRAW_RULE,
  CausalDrawAdapter,
  cdDigest,
  deriveResultRecord,
  preparePrior,
} from "@immortalis/engine";
import {
  CAND_A,
  CAND_B,
  CAND_C,
  DRAW_CAMPAIGN,
  RESOLVER,
  SEED_1,
  SEED_2,
  SYNTH_DRAW_OPERATION,
  SYNTH_DRAW_OWNER,
  drawInputKey,
  drawOwnerGroup,
  drawSlotKey,
  drawSpecification,
  effectiveRules,
  seededEntropy,
} from "@immortalis/testkit";
import {
  causalDrawFacts,
  crashBefore,
  defaultSpecification,
  drawAdapter,
  isResultGroup,
  journalMark,
  must,
  reopenDraw,
  request,
  seededDrawCampaign,
} from "../support/causal-draw.ts";
import { snapshotDir, tempDir } from "../support/tmp.ts";

const draw = async (s: Awaited<ReturnType<typeof seededDrawCampaign>>, spec?: unknown) =>
  s.adapter.draw(request(spec ?? defaultSpecification(s)));
const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);
/** Proves a refusal created no seed, precommit, result or fallback candidate and wrote nothing at all. */
async function refused(
  s: Awaited<ReturnType<typeof seededDrawCampaign>>,
  spec: unknown,
  code: string,
) {
  const before = journalMark(s.campaign.store);
  const r = await s.adapter.draw(request(spec));
  expect(codeOf(r)).toBe(code);
  expect(s.entropy.calls(), `${code}: no entropy`).toBe(0);
  expect(journalMark(s.campaign.store), `${code}: nothing written`).toEqual(before);
  expect(causalDrawFacts(s.campaign.store)).toEqual([]);
}
const update = (key: string, version: number) =>
  drawOwnerGroup(key, `SYNTHETIC FIXTURE: ${key} advanced`, { expected_version: version });

describe("the primary path: one draw is exactly a precommit and a result through the ordinary journal", () => {
  it("commits two create-only provenance records under causal_draw_kernel / draw_provenance with the specified metadata", async () => {
    const s = await seededDrawCampaign(tempDir());
    const before = s.campaign.store.head().journal_entries;
    const out = await must(draw(s));
    const prior = preparePrior(defaultSpecification(s));
    expect(out.draw_id).toBe(causalDrawId(prior.draw_key_digest));
    expect(out.disposition).toBe("NEW_DRAW");
    expect(s.campaign.store.head().journal_entries).toBe(before + 2);
    expect(causalDrawFacts(s.campaign.store).map((f) => f.key)).toEqual(
      [
        causalDrawPrecommitKey(prior.draw_key_digest),
        causalDrawResultKey(prior.draw_key_digest),
      ].sort(),
    );

    const pre = s.campaign.store.getFact(causalDrawPrecommitKey(prior.draw_key_digest))!;
    const res = s.campaign.store.getFact(causalDrawResultKey(prior.draw_key_digest))!;
    for (const f of [pre, res]) {
      expect([f.owner, f.facet, f.unit, f.version]).toEqual([
        "causal_draw_kernel",
        "draw_provenance",
        null,
        1,
      ]);
      expect(f.secrecy).toBe("engine-internal");
      expect(f.provenance.rule).toEqual(CAUSAL_DRAW_RULE);
      expect(f.provenance.cause).toBe(out.draw_id);
    }
    expect(pre.basis).toBe("causal-draw-precommit");
    expect(res.basis).toBe("causal-draw-result");

    const p = CausalDrawPrecommitSchema.parse(pre.value);
    expect(p).toEqual({
      draw_id: out.draw_id,
      draw_key: prior.normalized.draw_key,
      spec_digest: prior.spec_digest,
      normalized_spec: prior.normalized,
      entropy_hex: SEED_1,
      entropy_source_class: "CSPRNG_256",
      algorithm_id: "IMMORTALIS_WEIGHTED_FINITE_V1",
    });
    // the record carries the NORMALIZED prior: gcd-reduced weights in canonical candidate order
    expect(p.normalized_spec.candidates).toEqual([
      { candidate_id: CAND_A, weight: "1" },
      { candidate_id: CAND_B, weight: "2" },
      { candidate_id: CAND_C, weight: "3" },
    ]);
    expect(cdDigest(p.normalized_spec)).toBe(p.spec_digest);
    await s.campaign.close();
  });

  it("uses the RC-16 identities, the F-027-CD1 SourceRef and the archivist authority; the result pins and depends on the precommit", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    const d = out.draw_key_digest;
    const store = s.campaign.store;
    const preGroup = store.committedGroup(causalDrawPrecommitIntentId(d))!;
    const resGroup = store.committedGroup(causalDrawResultIntentId(d))!;
    expect([preGroup.group_id, preGroup.intent_id, preGroup.cause]).toEqual([
      causalDrawPrecommitGroupId(d),
      causalDrawPrecommitIntentId(d),
      out.draw_id,
    ]);
    expect([resGroup.group_id, resGroup.intent_id, resGroup.cause]).toEqual([
      causalDrawResultGroupId(d),
      causalDrawResultIntentId(d),
      out.draw_id,
    ]);
    for (const g of [preGroup, resGroup]) {
      expect(g.rule).toEqual(CAUSAL_DRAW_RULE);
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.writes).toHaveLength(1);
      expect(g.writes[0]!.expected_version).toBe(0);
    }
    // CAL-08: the precommit group reads every declared input at its exact version; the result reads only the precommit
    expect(preGroup.reads).toEqual(
      s.inputs
        .map((f) => ({ key: f.key, version: f.version }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    expect(preGroup.depends_on).toEqual([]);
    expect(resGroup.reads).toEqual([{ key: out.precommit.key, version: 1 }]);
    expect(resGroup.depends_on).toEqual([causalDrawPrecommitGroupId(d)]);
    const receipt = store.lookupReceipt(causalDrawResultIntentId(d))!;
    expect(receipt.basis.authority).toEqual(CANON_WRITE_AUTHORITY);
    expect(receipt.basis.rule).toEqual(CAUSAL_DRAW_RULE);
    await s.campaign.close();
  });

  it("the selected candidate re-derives exactly from the committed seed, and the result carries the specified evidence", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    const pre = s.campaign.store.getFact(out.precommit.key)!;
    const expected = must(Promise.resolve(deriveResultRecord(pre, out.draw_key_digest)));
    const stored = CausalDrawResultSchema.parse(s.campaign.store.getFact(out.result.key)!.value);
    expect(stored).toEqual(await expected);
    expect(stored).toMatchObject({
      draw_id: out.draw_id,
      spec_digest: out.spec_digest,
      precommit_key: out.precommit.key,
      precommit_version: 1,
      precommit_committed_by: causalDrawPrecommitGroupId(out.draw_key_digest),
      algorithm_id: "IMMORTALIS_WEIGHTED_FINITE_V1",
      total_weight: "6",
    });
    expect(out.selected_candidate_id).toBe(stored.selected_candidate_id);
    expect([CAND_A, CAND_B, CAND_C]).toContain(out.selected_candidate_id);
    expect(out.result).toEqual({
      key: causalDrawResultKey(out.draw_key_digest),
      version: 1,
      group_id: causalDrawResultGroupId(out.draw_key_digest),
    });
    await s.campaign.close();
  });

  it("hands out no seed: the outcome and the typed reads never carry the entropy", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    const summary = s.adapter.precommit(out.draw_id)!;
    expect(JSON.stringify([out, summary])).not.toContain(SEED_1);
    expect(JSON.stringify(summary)).not.toContain("entropy_hex");
    expect(Object.keys(summary)).toEqual(["fact", "draw_id", "spec_digest", "normalized_spec"]);
    expect(summary.fact.secrecy).toBe("engine-internal");
    expect(summary.spec_digest).toBe(out.spec_digest);
    expect(s.adapter.result(out.draw_id)!.value.selected_candidate_id).toBe(
      out.selected_candidate_id,
    );
    expect(s.adapter.result(out.draw_id)!.group_id).toBe(out.result.group_id);
    expect(s.adapter.precommit("cdraw:v1:" + "0".repeat(64))).toBeUndefined();
    expect(s.adapter.result("not-a-draw-id")).toBeUndefined();
    await s.campaign.close();
  });

  it("a campaign holding the evidence verifies clean, and reopens", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    await must(draw(s));
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const again = await reopenDraw(dir);
    expect(again.campaign.verify()).toEqual([]);
    await again.campaign.close();
  });

  it("an owner's ordinary key is never a Causal Draw key, and the draw layer wrote only its two keys", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    expect(s.campaign.store.getFact(drawSlotKey("slot-1"))).toBeUndefined();
    const kernel = s.campaign.store.listFacts().filter((f) => f.owner === "causal_draw_kernel");
    expect(kernel.map((f) => f.key).sort()).toEqual([out.precommit.key, out.result.key].sort());
    await s.campaign.close();
  });
});

describe("CDR-02 replay and identity: a committed draw is carried forward, never recomputed", () => {
  it("the same draw replays its committed result with no new entropy and no write, however many times it is asked", async () => {
    const s = await seededDrawCampaign(tempDir());
    const first = await must(draw(s));
    const mark = journalMark(s.campaign.store);
    for (let i = 0; i < 5; i++) {
      const again = await must(draw(s));
      expect(again).toEqual({ ...first, disposition: "REPLAYED_RESULT" });
    }
    expect(s.entropy.calls()).toBe(1);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    await s.campaign.close();
  });

  it("the same prior presented in another order or at another common scale is the same draw (same spec_digest) and replays", async () => {
    const s = await seededDrawCampaign(tempDir());
    const first = await must(draw(s));
    const reordered = drawSpecification([...s.inputs].reverse(), {
      candidates: [
        { candidate_id: CAND_B, weight: "40" },
        { candidate_id: CAND_C, weight: "60" },
        { candidate_id: CAND_A, weight: "20" },
      ],
    });
    const again = await must(draw(s, reordered));
    expect(again.disposition).toBe("REPLAYED_RESULT");
    expect(again.spec_digest).toBe(first.spec_digest);
    expect(again.selected_candidate_id).toBe(first.selected_candidate_id);
    await s.campaign.close();
  });

  it("a different prior under the same draw_id is DRAW_IDENTITY_CONFLICT, not a new draw, and writes nothing", async () => {
    const s = await seededDrawCampaign(tempDir());
    await must(draw(s));
    const mark = journalMark(s.campaign.store);
    for (const changed of [
      drawSpecification(s.inputs, {
        candidates: [
          { candidate_id: CAND_A, weight: "1" },
          { candidate_id: CAND_B, weight: "1" },
        ],
      }),
      drawSpecification(s.inputs, {
        candidates: [
          { candidate_id: CAND_A, weight: "1" },
          { candidate_id: CAND_B, weight: "2" },
          { candidate_id: "synthetic-candidate-d", weight: "3" },
        ],
      }),
      drawSpecification([s.inputs[0]!]),
      drawSpecification(s.inputs, {
        owner_rule_ref: { ...drawSpecification().owner_rule_ref, clause: "other" },
      }),
    ]) {
      const r = await draw(s, changed);
      expect(codeOf(r)).toBe("DRAW_IDENTITY_CONFLICT");
    }
    expect(s.entropy.calls()).toBe(1);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    await s.campaign.close();
  });

  it("an owner-defined distinct opportunity_id is the only way to draw again: it is a new draw with its own seed", async () => {
    const entropy = seededEntropy(SEED_1, SEED_2);
    const s = await seededDrawCampaign(tempDir(), { entropy });
    const a = await must(draw(s));
    const second = defaultSpecification(s);
    const b = await must(
      draw(s, {
        ...second,
        draw_key: { ...second.draw_key, opportunity_id: "synthetic-opportunity-2" },
      }),
    );
    expect(b.draw_id).not.toBe(a.draw_id);
    expect(b.disposition).toBe("NEW_DRAW");
    expect(entropy.calls()).toBe(2);
    expect(causalDrawFacts(s.campaign.store)).toHaveLength(4);
    await s.campaign.close();
  });

  it("save → close → load → ask again replays the same draw with no new entropy and an unchanged package", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    const first = await must(draw(s));
    await s.campaign.close();
    const bytes = snapshotDir(dir);
    const entropy = seededEntropy(SEED_2);
    const again = await reopenDraw(dir, { entropy });
    const replay = await must(draw(again));
    expect(replay).toEqual({ ...first, disposition: "REPLAYED_RESULT" });
    expect(entropy.calls()).toBe(0);
    await again.campaign.close();
    expect(snapshotDir(dir)).toEqual(bytes);
  });
});

describe("CDR-01: the exact gate order, and every refusal before entropy", () => {
  it("step 1 refusals — invalid, duplicate, empty, singleton — create no hash-derived record, no entropy and no write", async () => {
    const s = await seededDrawCampaign(tempDir());
    const base = defaultSpecification(s);
    await refused(s, { ...base, algorithm_id: "x" }, "DRAW_INPUT_INVALID");
    await refused(
      s,
      { ...base, candidates: [...base.candidates, { candidate_id: CAND_A, weight: "9" }] },
      "DRAW_CANDIDATE_DUPLICATE",
    );
    await refused(s, { ...base, candidates: [] }, "DRAW_CANDIDATE_SET_EMPTY");
    await refused(s, { ...base, candidates: [base.candidates[0]!] }, "DRAW_NOT_REQUIRED_SINGLETON");
    await refused(
      s,
      { ...base, candidates: [{ candidate_id: "a\ud800", weight: "1" }, ...base.candidates] },
      "DRAW_INPUT_INVALID",
    );
    await s.campaign.close();
  });

  it("step 1 precedes the committed-result check: a malformed re-presentation of a committed draw is refused as malformed, not replayed", async () => {
    const s = await seededDrawCampaign(tempDir());
    await must(draw(s));
    const r = await draw(s, { ...defaultSpecification(s), candidates: [] });
    expect(codeOf(r)).toBe("DRAW_CANDIDATE_SET_EMPTY");
    await s.campaign.close();
  });

  it("step 6 — input proof: an unknown fact, an unreachable version, a wrong owner or a wrong committing group is DRAW_INPUT_REF_UNRESOLVED", async () => {
    const s = await seededDrawCampaign(tempDir());
    const [i1] = s.inputs;
    const ref = {
      owner: i1!.owner,
      fact_key: i1!.key,
      version: i1!.version,
      committed_by: i1!.provenance.group_id,
    };
    for (const bad of [
      { ...ref, fact_key: drawInputKey("never-committed") },
      { ...ref, version: 2 },
      { ...ref, owner: "someone-else" },
      { ...ref, committed_by: "not-the-committing-group" },
    ]) {
      await refused(
        s,
        defaultSpecification({ inputs: [] } as never) && {
          ...defaultSpecification(s),
          input_refs: [bad],
        },
        "DRAW_INPUT_REF_UNRESOLVED",
      );
    }
    await s.campaign.close();
  });

  it("step 6 — a declared version that existed historically but is no longer current is DRAW_INPUT_REF_STALE_AT_PRECOMMIT", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    await must(s.campaign.store.commit(update(drawInputKey("i1"), 1)));
    await refused(s, spec, "DRAW_INPUT_REF_STALE_AT_PRECOMMIT");
    await s.campaign.close();
  });

  it("an unresolvable input outranks a stale one, and an input proof precedes any entropy", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    await must(s.campaign.store.commit(update(drawInputKey("i1"), 1)));
    const withUnresolved = {
      ...spec,
      input_refs: [
        ...spec.input_refs,
        { owner: SYNTH_DRAW_OWNER, fact_key: drawInputKey("ghost"), version: 1, committed_by: "g" },
      ],
    };
    await refused(s, withUnresolved, "DRAW_INPUT_REF_UNRESOLVED");
    await s.campaign.close();
  });

  it("the committed-result check precedes the slot check and the input proof: a replay needs neither a current input nor a quiet slot", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    const first = await must(draw(s, spec));
    await must(s.campaign.store.commit(update(drawInputKey("i1"), 1)));
    // the owner establishes its slot BY REFERENCE to the draw (lawful linkage)
    await must(
      s.campaign.store.commit(
        drawOwnerGroup(
          drawSlotKey("slot-1"),
          { from_draw: first.draw_id },
          {
            reads: [{ key: first.result.key, version: first.result.version }],
            depends_on: [first.result.group_id],
          },
        ),
      ),
    );
    const again = await must(draw(s, spec));
    expect(again.disposition).toBe("REPLAYED_RESULT");
    expect(again.selected_candidate_id).toBe(first.selected_candidate_id);
    await s.campaign.close();
  });

  it("an identity conflict on a committed result outranks the substantive-slot check", async () => {
    const s = await seededDrawCampaign(tempDir());
    await must(draw(s));
    await must(s.campaign.store.commit(drawOwnerGroup(drawSlotKey("slot-1"), "independent")));
    const r = await draw(
      s,
      drawSpecification(s.inputs, {
        candidates: [
          { candidate_id: CAND_A, weight: "1" },
          { candidate_id: CAND_B, weight: "3" },
        ],
      }),
    );
    expect(codeOf(r)).toBe("DRAW_IDENTITY_CONFLICT");
    await s.campaign.close();
  });
});

describe("CDR-01 step 4: the substantive-slot boundary (IM-03 typed-owner interface)", () => {
  it("an independently established result with no precommit or result is DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED: no entropy, no write", async () => {
    const s = await seededDrawCampaign(tempDir());
    await must(s.campaign.store.commit(drawOwnerGroup(drawSlotKey("slot-1"), "decided causally")));
    const mark = journalMark(s.campaign.store);
    const r = await draw(s);
    expect(codeOf(r)).toBe("DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED");
    expect(s.entropy.calls()).toBe(0);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    await s.campaign.close();
  });

  it("an independent establishment while a precommit exists is DRAW_STATE_CONFLICT", async () => {
    const s = await seededDrawCampaign(tempDir());
    const crashed = drawAdapter(crashBefore(s.campaign.store, isResultGroup), s.entropy);
    expect(codeOf(await crashed.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
    expect(
      s.campaign.store.getFact(
        causalDrawPrecommitKey(preparePrior(defaultSpecification(s)).draw_key_digest),
      ),
    ).toBeDefined();
    await must(s.campaign.store.commit(drawOwnerGroup(drawSlotKey("slot-1"), "decided causally")));
    const fresh = drawAdapter(s.campaign.store, seededEntropy(SEED_2));
    expect(codeOf(await fresh.draw(request(defaultSpecification(s))))).toBe("DRAW_STATE_CONFLICT");
    await s.campaign.close();
  });

  it("a claimed linkage whose result record is absent is DRAW_STATE_CONFLICT", async () => {
    const s = await seededDrawCampaign(tempDir());
    const d = preparePrior(defaultSpecification(s)).draw_key_digest;
    // the owner's group claims to have read a draw result that was never committed (pinned at version 0)
    await must(
      s.campaign.store.commit(
        drawOwnerGroup(drawSlotKey("slot-1"), "claims a draw", {
          reads: [{ key: causalDrawResultKey(d), version: 0 }],
        }),
      ),
    );
    expect(codeOf(await draw(s))).toBe("DRAW_STATE_CONFLICT");
    expect(s.entropy.calls()).toBe(0);
    await s.campaign.close();
  });

  it("a substantive owner with no registered typed interface fails closed (there is no fallback owner), before entropy", async () => {
    const s = await seededDrawCampaign(tempDir());
    const adapter = drawAdapter(s.campaign.store, s.entropy, { slotInspectors: new Map() });
    const r = await adapter.draw(request(defaultSpecification(s)));
    expect(codeOf(r)).toBe("OWNER_NOT_REGISTERED");
    expect(s.entropy.calls()).toBe(0);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    await s.campaign.close();
  });

  it("the layer asks the owner by identity (its operation and the prospective result id) and never reads the slot itself", async () => {
    const s = await seededDrawCampaign(tempDir());
    const asked: unknown[] = [];
    const adapter = drawAdapter(s.campaign.store, s.entropy, {
      slotInspectors: new Map([
        [
          SYNTH_DRAW_OWNER,
          {
            inspectResultSlot: (slot) => {
              asked.push(slot);
              return { established: false };
            },
          },
        ],
      ]),
    });
    await must(adapter.draw(request(defaultSpecification(s))));
    expect(asked).toEqual([
      {
        owner_operation: { owner: SYNTH_DRAW_OWNER, operation: SYNTH_DRAW_OPERATION },
        prospective_result_id: drawSlotKey("slot-1"),
      },
    ]);
    await s.campaign.close();
  });

  it("the substantive write that follows a draw is the OWNER's: it reads the exact result fact/version and depends on the result group", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    const ownerWrite = await must(
      s.campaign.store.commit(
        drawOwnerGroup(
          drawSlotKey("slot-1"),
          { chosen: out.selected_candidate_id },
          {
            reads: [{ key: out.result.key, version: out.result.version }],
            depends_on: [out.result.group_id],
          },
        ),
      ),
    );
    expect(ownerWrite.replayed).toBe(false);
    const written = s.campaign.store.getFact(drawSlotKey("slot-1"))!;
    expect(written.owner).toBe(SYNTH_DRAW_OWNER);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });
});

describe("the resolver context (role.resolver + permission.resolution.execute)", () => {
  it("is required for entropy and sampling: any other context is AUTHORITY_DENIED, with no entropy and no write", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    for (const context of [
      CANON_WRITE_AUTHORITY,
      { role: "role.resolver", permission: "permission.canon.write" },
      { role: "role.archivist", permission: "permission.resolution.execute" },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.resolver" },
      { role: "role.resolver", permission: "permission.resolution.execute", persona: "narrator" },
      "role.resolver",
      null,
      undefined,
    ]) {
      const r = await s.adapter.draw({ specification: spec, resolution: context } as never);
      expect(codeOf(r), JSON.stringify(context)).toBe("AUTHORITY_DENIED");
    }
    expect(s.entropy.calls()).toBe(0);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    await s.campaign.close();
  });

  it("publication is by the archivist path regardless: the committed groups carry role.archivist + permission.canon.write", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    expect(
      s.campaign.store.lookupReceipt(causalDrawPrecommitIntentId(out.draw_key_digest))!.basis
        .authority,
    ).toEqual(CANON_WRITE_AUTHORITY);
    expect(RESOLVER).not.toEqual(CANON_WRITE_AUTHORITY);
    await s.campaign.close();
  });
});

describe("CDE-01: secure 32-byte entropy, no fallback", () => {
  it("the committed seed is exactly the 32 bytes the trusted source delivered, labelled CSPRNG_256", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(draw(s));
    const p = CausalDrawPrecommitSchema.parse(s.campaign.store.getFact(out.precommit.key)!.value);
    expect(p.entropy_hex).toBe(SEED_1);
    expect(p.entropy_hex).toMatch(/^[0-9a-f]{64}$/);
    expect(p.entropy_source_class).toBe("CSPRNG_256");
    expect(s.entropy.calls()).toBe(1);
    await s.campaign.close();
  });

  it("an unavailable source is DRAW_ENTROPY_UNAVAILABLE and writes nothing; there is no fallback, and a later working source draws normally", async () => {
    const s = await seededDrawCampaign(tempDir());
    const mark = journalMark(s.campaign.store);
    const throwing = drawAdapter(s.campaign.store, s.entropy, {
      entropy: () => {
        throw new Error("no secure randomness");
      },
    });
    expect(codeOf(await throwing.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_ENTROPY_UNAVAILABLE",
    );
    for (const short of [
      new Uint8Array(0),
      new Uint8Array(31),
      new Uint8Array(33),
      "x" as never,
      null as never,
    ]) {
      const a = drawAdapter(s.campaign.store, s.entropy, { entropy: () => short });
      expect(codeOf(await a.draw(request(defaultSpecification(s))))).toBe(
        "DRAW_ENTROPY_UNAVAILABLE",
      );
    }
    expect(journalMark(s.campaign.store)).toEqual(mark);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    expect(codeOf(await draw(s))).toBe("OK");
    await s.campaign.close();
  });

  it("the default source is the operating-system CSPRNG: fresh, distinct 32-byte seeds with no input from the draw identity", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    const plain = new CausalDrawAdapter(s.campaign.store, {
      slotInspectors: drawAdapterInspectors(s),
      ruleAuthority: effectiveRules(),
    });
    const seeds = new Set<string>();
    for (let n = 1; n <= 4; n++) {
      const spec = defaultSpecification(s);
      const out = await must(
        plain.draw(
          request({ ...spec, draw_key: { ...spec.draw_key, opportunity_id: `os-entropy-${n}` } }),
        ),
      );
      seeds.add(
        CausalDrawPrecommitSchema.parse(s.campaign.store.getFact(out.precommit.key)!.value)
          .entropy_hex,
      );
    }
    expect(seeds.size).toBe(4);
    for (const seed of seeds) expect(seed).toMatch(/^[0-9a-f]{64}$/);
    await s.campaign.close();
  });
});

function drawAdapterInspectors(s: Awaited<ReturnType<typeof seededDrawCampaign>>) {
  return (
    drawAdapter(s.campaign.store) &&
    new Map([
      [
        SYNTH_DRAW_OWNER,
        {
          inspectResultSlot: ({ prospective_result_id }: { prospective_result_id: string }) => {
            const f = s.campaign.store.getFact(prospective_result_id);
            return f
              ? { established: true as const, establishing_intent_id: f.provenance.intent_id }
              : { established: false as const };
          },
        },
      ],
    ])
  );
}

describe("CAL-08: revalidation at precommit publication — and its deliberate absence at result publication", () => {
  it("an owner rule that is no longer effective is DRAW_OWNER_RULE_STALE_AT_PRECOMMIT: no precommit, no draw, no world state", async () => {
    const s = await seededDrawCampaign(tempDir());
    const stale = drawAdapter(s.campaign.store, s.entropy, {
      ruleAuthority: effectiveRules(false),
    });
    const mark = journalMark(s.campaign.store);
    expect(codeOf(await stale.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_OWNER_RULE_STALE_AT_PRECOMMIT",
    );
    expect(journalMark(s.campaign.store)).toEqual(mark);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    await s.campaign.close();
  });

  it("the rule seam is asked about the owner's own SourceRef and draw key", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    const asked: unknown[] = [];
    const a = drawAdapter(s.campaign.store, s.entropy, {
      ruleAuthority: {
        isEffectiveForPriorCreation: (rule, key) => {
          asked.push([rule, key]);
          return true;
        },
      },
    });
    await must(a.draw(request(spec)));
    expect(asked).toEqual([[spec.owner_rule_ref, spec.draw_key]]);
    await s.campaign.close();
  });

  it("an input that changes before the precommit publishes is DRAW_INPUT_REF_STALE_AT_PRECOMMIT and writes no precommit", async () => {
    const s = await seededDrawCampaign(tempDir());
    // the input advances in the instant between the gate and publication: the group's reads then fail STALE_READ
    const racing = {
      ...crashBefore(s.campaign.store, () => false),
      commit: async (g: { group_id: string }) => {
        if (g.group_id.startsWith("cdraw:precommit:group:v1:")) {
          await must(s.campaign.store.commit(update(drawInputKey("i2"), 1)));
        }
        return s.campaign.store.commit(g);
      },
    };
    const a = drawAdapter(racing, s.entropy);
    expect(codeOf(await a.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
    );
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    await s.campaign.close();
  });

  it("result publication does NOT revalidate owner_rule_ref or input currency: a resumed draw completes although both have since changed", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    const d = preparePrior(spec).draw_key_digest;
    // the precommit commits, the result does not
    const crashed = drawAdapter(crashBefore(s.campaign.store, isResultGroup), s.entropy);
    expect(codeOf(await crashed.draw(request(spec)))).toBe("UNKNOWN_OUTCOME");
    const committedSeed = CausalDrawPrecommitSchema.parse(
      s.campaign.store.getFact(causalDrawPrecommitKey(d))!.value,
    ).entropy_hex;
    expect(committedSeed).toBe(SEED_1);
    // the world moves on: an input advances and the owner rule is no longer effective
    await must(s.campaign.store.commit(update(drawInputKey("i1"), 1)));
    const later = seededEntropy(SEED_2);
    const resumed = drawAdapter(s.campaign.store, later, { ruleAuthority: effectiveRules(false) });
    const out = await must(resumed.draw(request(spec)));
    expect(out.disposition).toBe("RESUMED_PRECOMMIT");
    // the result is exactly what the COMMITTED seed determines; the later source was never consulted
    const expected = await must(
      Promise.resolve(deriveResultRecord(s.campaign.store.getFact(causalDrawPrecommitKey(d))!, d)),
    );
    expect(out.selected_candidate_id).toBe(expected.selected_candidate_id);
    expect(
      CausalDrawResultSchema.parse(s.campaign.store.getFact(causalDrawResultKey(d))!.value),
    ).toEqual(expected);
    expect(later.calls()).toBe(0);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });
});

describe("CDV-01: algorithm identity and historical verification", () => {
  it("an unsupported algorithm creates no new draw (before entropy); a committed draw is still replayed only by verification", async () => {
    const s = await seededDrawCampaign(tempDir());
    const none = new Map();
    const noAlgo = drawAdapter(s.campaign.store, s.entropy, { algorithms: none });
    expect(codeOf(await noAlgo.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_ALGORITHM_UNSUPPORTED",
    );
    expect(s.entropy.calls()).toBe(0);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);

    const first = await must(draw(s));
    const mark = journalMark(s.campaign.store);
    // the committed v1 draw can no longer be verified by this build: fail closed, never resample
    expect(codeOf(await noAlgo.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_ALGORITHM_UNSUPPORTED",
    );
    expect(s.entropy.calls()).toBe(1);
    expect(journalMark(s.campaign.store)).toEqual(mark);
    // and the build that supports it still replays the very same candidate
    expect((await must(draw(s))).selected_candidate_id).toBe(first.selected_candidate_id);
    await s.campaign.close();
  });

  it("a precommit whose algorithm is unsupported is not resumed and never resampled", async () => {
    const s = await seededDrawCampaign(tempDir());
    const crashed = drawAdapter(crashBefore(s.campaign.store, isResultGroup), s.entropy);
    await crashed.draw(request(defaultSpecification(s)));
    const noAlgo = drawAdapter(s.campaign.store, seededEntropy(SEED_2), { algorithms: new Map() });
    expect(codeOf(await noAlgo.draw(request(defaultSpecification(s))))).toBe(
      "DRAW_ALGORITHM_UNSUPPORTED",
    );
    expect(
      s.campaign.store.getFact(
        causalDrawResultKey(preparePrior(defaultSpecification(s)).draw_key_digest),
      ),
    ).toBeUndefined();
    await s.campaign.close();
  });
});

describe("no draw is created for what a draw does not decide", () => {
  it("the layer never writes the substantive slot, and an unrelated owner key is untouched by a draw", async () => {
    const s = await seededDrawCampaign(tempDir());
    const before = s.inputs.map((f) => f.version);
    await must(draw(s));
    expect(s.inputs.map((f) => s.campaign.store.getFact(f.key)!.version)).toEqual(before);
    expect(s.campaign.store.getFact(drawSlotKey("slot-1"))).toBeUndefined();
    await s.campaign.close();
  });
});

// keeps the unused-import linter honest for helpers referenced only in some branches
void ({} as CausalDrawSpecification);
void DRAW_CAMPAIGN;
