/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw fact values */
// Initial timed governance opening (@immortalis/operator `establish-timed-governance`): the positive path and the causal expiry witness.
//
// The witness is MECHANISM ONLY. The command commits the stipulated opening records and has the GIP owner enroll, and the Temporal owner
// register, one exact future sunset. A SEPARATE, scripted exact-target progression choice then engages the EXISTING Temporal route: the
// outcome (the Instrument's lifecycle) is computed by GIP's own stage from the committed term and canonical time, and every assertion
// below is made against values derived independently of that stage (the authored document and the target), never against a fixture that
// supplies `expired`. It proves no natural play, interpretation, legal validity, actor cognition, receipt, adoption or ordinary
// player-directed time.
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  gipSunsetRegistrationGroupId,
  gipSunsetStage,
  temporalObjectKey,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  BINDING_ID,
  DECISION_BODY_REF,
  INSTITUTION_ID,
  INSTRUMENT_ID,
  OFFICE_ID,
  PUBLICATION,
  T_AFTER,
  T_BEFORE,
  T_OPEN,
  T_SUNSET,
  addGovernance,
  advanceTo,
  governanceDoc,
  headOf,
  held,
  instrumentDoc,
  lifecycleOf,
  officeDoc,
  openOrdinary,
  openWitness,
  runGovernance,
  timedCampaign,
  writeGovernance,
} from "../support/initial-timed-governance.ts";
import { at } from "@immortalis/testkit";

const NEW_KEYS = [
  gipInstitutionIdentityKey(INSTITUTION_ID),
  gipOfficeAuthorityLocusKey(INSTITUTION_ID, OFFICE_ID),
  gipScopeBindingKey(INSTITUTION_ID, OFFICE_ID, BINDING_ID),
  gipInstrumentKey(INSTRUMENT_ID),
  GIP_SUNSET_ENROLLMENT_KEY,
  temporalObjectKey(gipSunsetObjectId(INSTRUMENT_ID)),
  TEMPORAL_BOUNDARY_INDEX_KEY,
].sort();

describe("the opening is committed in dependency order and read back after a fresh owner-verified reopen", () => {
  it("commits exactly the four records, GIP's receipt and the Temporal registration — and nothing else, with time unmoved", async () => {
    const dirs = await timedCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    const revisionBefore = before.store.head().revision;
    await before.close();

    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()));
    expect(result.status, JSON.stringify(result)).toBe("GOVERNANCE_READY");
    expect(terminal.asked()).toBe(1);
    // the order the console reported, which is the order of commit
    const progress = terminal.said
      .filter((l) => l.startsWith("PROGRESS "))
      .map((l) => l.split(" ")[1]);
    expect(progress).toEqual(["institution", "office", "scope_binding", "instrument", "sunset"]);

    const c = await openOrdinary(dirs.campaignDir);
    try {
      const after = c.store.listFacts();
      // exactly the expected keys were added (and the boundary index, new in this campaign) and every earlier fact is byte-identical
      expect(
        after
          .filter((f) => !factsBefore.some((b) => b.key === f.key))
          .map((f) => f.key)
          .sort(),
      ).toEqual(NEW_KEYS);
      for (const f of factsBefore) expect(c.store.getFact(f.key), f.key).toEqual(f);
      // five commits: four GIP publications (the last with the receipt), one Temporal registration
      expect(c.store.head().revision).toBe(revisionBefore + 5);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 120_000);

  it("reads every committed owner fact back at version 1 with the owner's own typed reads and the authored provenance", async () => {
    const dirs = await timedCampaign();
    expect((await addGovernance(dirs, writeGovernance(governanceDoc()))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      const doc = governanceDoc();
      const i = w.gip.institutionIdentity(INSTITUTION_ID)!;
      const o = w.gip.officeAuthorityLocus(INSTITUTION_ID, OFFICE_ID)!;
      const b = w.gip.scopeBinding(INSTITUTION_ID, OFFICE_ID, BINDING_ID)!;
      const n = w.gip.governanceInstrument(INSTRUMENT_ID)!;
      expect(i.value).toEqual(doc.institution);
      expect(o.value).toEqual(doc.office);
      expect(b.value).toEqual(doc.scope_binding);
      expect(n.value).toEqual(doc.instrument);
      for (const f of [i.fact, o.fact, b.fact, n.fact]) {
        expect([f.owner, f.facet, f.version]).toEqual(["gip", "gip_institution_identity", 1]);
        expect([f.basis, f.secrecy]).toEqual([PUBLICATION.basis, PUBLICATION.secrecy]);
        expect(f.provenance.group_id).toMatch(/^operator-initial-timed-governance:[0-9a-f]{32}:/);
      }
      // the prerequisite order is the owner's own: each record pinned the group that committed the one before
      const store = w.campaign.store;
      expect(store.committedGroup(o.fact.provenance.intent_id)!.depends_on).toEqual([
        i.fact.provenance.group_id,
      ]);
      expect(store.committedGroup(b.fact.provenance.intent_id)!.depends_on).toEqual([
        o.fact.provenance.group_id,
      ]);
      expect([...store.committedGroup(n.fact.provenance.intent_id)!.depends_on].sort()).toEqual(
        [o.fact.provenance.group_id, b.fact.provenance.group_id].sort(),
      );

      // GIP's receipt: which Instrument, the exact sunset, and the canonical time the opening was established at
      const receipt = w.gip.sunsetEnrollment()!;
      expect(receipt.value).toEqual({
        instrument_id: INSTRUMENT_ID,
        sunset_at: T_SUNSET,
        basis_time: T_OPEN,
      });
      expect(receipt.registered).toBe(true);
      expect(receipt.fact.provenance.group_id).toBe(n.fact.provenance.group_id);

      // the Temporal owner's registration: its object, its one earned boundary at the sunset, and the index entry
      const object = store.getFact(temporalObjectKey(gipSunsetObjectId(INSTRUMENT_ID)))!;
      expect([object.owner, object.version]).toEqual(["temporal_kernel", 1]);
      expect(object.provenance.group_id).toBe(gipSunsetRegistrationGroupId(INSTRUMENT_ID));
      expect((object.value as any).next_boundary).toEqual({
        boundary_id: gipSunsetBoundaryId(INSTRUMENT_ID),
        at: T_SUNSET,
      });
      expect((object.value as any).dependencies.map((d: any) => d.stage)).toEqual([
        gipSunsetStage(INSTRUMENT_ID),
      ]);
      expect((store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!.value as any).entries).toEqual([
        {
          object_id: gipSunsetObjectId(INSTRUMENT_ID),
          boundary_id: gipSunsetBoundaryId(INSTRUMENT_ID),
          at: T_SUNSET,
        },
      ]);

      // an opening is not an execution: canonical time did not move, no resolution transaction exists and nothing is expired
      expect((store.getFact(TEMPORAL_STATE_KEY)!.value as any).canonical_time).toEqual(T_OPEN);
      expect(store.listFacts().filter((f) => f.key.startsWith("temporal/transaction"))).toEqual([]);
      expect(lifecycleOf(w)).toBe("active");
      expect(w.campaign.verify()).toEqual([]);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);

  it("a repeat of the confirmed proposal is verified and reported without asking again and without a write", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
    const head = await headOf(dirs.campaignDir);
    const again = await addGovernance(dirs, file, []);
    expect(again.result.status).toBe("GOVERNANCE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("the shipped binary, as a real process, lands on exactly the campaign the in-process command does", async () => {
    const inProcess = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(inProcess, file)).result.status).toBe("GOVERNANCE_READY");
    const shipped = await timedCampaign();
    const run = await runGovernance(shipped, file, ["confirm"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("STATUS GOVERNANCE_READY");
    expect(await headOf(shipped.campaignDir)).toEqual(await headOf(inProcess.campaignDir));
  }, 120_000);

  it("admits the decision-body branch, every optional field omitted, and an authored predecessor reference exactly as authored", async () => {
    const dirs = await timedCampaign();
    const doc = governanceDoc();
    delete doc.institution.constitutive_source_ref;
    doc.office = officeDoc();
    delete doc.office.holder_ref;
    doc.office.decision_body_ref = DECISION_BODY_REF;
    doc.scope_binding = {
      scope_binding_id: BINDING_ID,
      institution_id: INSTITUTION_ID,
      office_id: OFFICE_ID,
      scope_type: "the salt pans",
      scope_ref: "scope-ref-hamlet-pans",
      target_condition: "Applies to any household that works a pan.",
    };
    doc.instrument = instrumentDoc({
      predecessor_instrument_ref: "instrument-ref-earlier-custom",
      validity_by_order: [],
    });
    const { result } = await addGovernance(dirs, writeGovernance(doc));
    expect(result.status, JSON.stringify(result)).toBe("GOVERNANCE_READY");
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.gip.institutionIdentity(INSTITUTION_ID)!.value).toEqual(doc.institution);
      expect(w.gip.officeAuthorityLocus(INSTITUTION_ID, OFFICE_ID)!.value).toEqual(doc.office);
      expect(w.gip.scopeBinding(INSTITUTION_ID, OFFICE_ID, BINDING_ID)!.value).toEqual(
        doc.scope_binding,
      );
      expect(w.gip.governanceInstrument(INSTRUMENT_ID)!.value).toEqual(doc.instrument);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});

describe("the independent-world causal witness: the owner, not the operator or a fixture, expires the Instrument at the earned boundary", () => {
  const authored = (): GovernanceInstrument => governanceDoc().instrument;

  it("short of the sunset the Instrument is untouched; at it, GIP's own stage — and only it — changes lifecycle_status from active to expired", async () => {
    const dirs = await timedCampaign();
    expect((await addGovernance(dirs, writeGovernance(governanceDoc()))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      const store = w.campaign.store;
      // one tick short: the boundary is not reached, nothing resolves and the Instrument is exactly as committed
      const early = await w.coordinator.advance(advanceTo("tx-early", T_BEFORE));
      expect(early.ok, JSON.stringify(early)).toBe(true);
      if (early.ok) {
        expect(early.value.transaction.engaged).toEqual([]);
        expect(early.value.transaction.stages).toEqual([]);
      }
      expect(lifecycleOf(w)).toBe("active");
      expect(store.getFact(gipInstrumentKey(INSTRUMENT_ID))!.version).toBe(1);
      expect(w.gip.governanceInstrument(INSTRUMENT_ID)!.value).toEqual(authored());

      // exactly at the earned boundary (the comparison is inclusive): the registered boundary resolves GIP's one stage
      const at200 = await w.coordinator.advance(advanceTo("tx-at", T_SUNSET));
      expect(at200.ok, JSON.stringify(at200)).toBe(true);
      if (at200.ok) {
        const tx = at200.value.transaction;
        expect(tx.outcome.actual_stop).toEqual(T_SUNSET);
        expect(tx.boundaries_crossed).toEqual([
          {
            object_id: gipSunsetObjectId(INSTRUMENT_ID),
            boundary_id: gipSunsetBoundaryId(INSTRUMENT_ID),
            at: T_SUNSET,
          },
        ]);
        expect(tx.stages.map((s) => s.stage)).toEqual([gipSunsetStage(INSTRUMENT_ID)]);
        expect(tx.stages[0]!.writes).toEqual([
          { key: gipInstrumentKey(INSTRUMENT_ID), version: 2 },
        ]);
      }

      // the observable result, read back through the GIP owner's typed read after a reopen
      await w.campaign.close();
      const reopened = await openWitness(dirs.campaignDir);
      try {
        const n = reopened.gip.governanceInstrument(INSTRUMENT_ID)!;
        expect([n.fact.owner, n.fact.facet, n.fact.version]).toEqual([
          "gip",
          "gip_institution_identity",
          2,
        ]);
        // independently derived from the AUTHORED document and the lifecycle transition alone
        expect(n.value).toEqual({ ...authored(), lifecycle_status: "expired" });
        // validity is order-relative and untouched by lifecycle; the operative effect and the authority premises are untouched
        expect(n.value.validity_by_order).toEqual(authored().validity_by_order);
        expect(n.value.operative_effect).toBe(authored().operative_effect);
        expect(n.value.source_authority_ref).toBe(authored().source_authority_ref);
        expect(n.value.scope_binding_ref).toBe(authored().scope_binding_ref);
        expect(n.value.sunset_condition).toEqual(T_SUNSET);
        // the stage's own group committed it, not the operator's
        expect(n.fact.provenance.group_id).not.toMatch(/^operator-/);
        // the opening records themselves are untouched
        expect(reopened.gip.institutionIdentity(INSTITUTION_ID)!.fact.version).toBe(1);
        expect(reopened.gip.officeAuthorityLocus(INSTITUTION_ID, OFFICE_ID)!.fact.version).toBe(1);
        expect(reopened.gip.scopeBinding(INSTITUTION_ID, OFFICE_ID, BINDING_ID)!.fact.version).toBe(
          1,
        );
        expect(reopened.campaign.verify()).toEqual([]);
        // setup is closed once the owner has advanced the Instrument: a rerun of the same proposal neither asks nor writes
      } finally {
        await reopened.campaign.close();
      }
    } catch (e) {
      await w.campaign.close().catch(() => undefined);
      throw e;
    }
    const head = await headOf(dirs.campaignDir);
    const rerun = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(rerun.result.status).toBe("PRE_PLAY_CLOSED");
    expect(rerun.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);

  it("falsification: the same opening, canonical time carried past the sunset, expires; carried only to a boundary that is not the sunset, it does not", async () => {
    // reached: advancing beyond the sunset passes the earned boundary on the way (the kernel never skips a registered boundary)
    const reached = await timedCampaign();
    expect((await addGovernance(reached, writeGovernance(governanceDoc()))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const r = await openWitness(reached.campaignDir);
    try {
      const out = await r.coordinator.advance(advanceTo("tx-after", T_AFTER));
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(lifecycleOf(r)).toBe("expired");
    } finally {
      await r.campaign.close();
    }

    // not reached: an identical opening whose authored sunset is later; the same advance leaves it active
    const notReached = await timedCampaign();
    const later = governanceDoc();
    later.instrument = instrumentDoc({ sunset_condition: at(300) });
    expect((await addGovernance(notReached, writeGovernance(later))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const n = await openWitness(notReached.campaignDir);
    try {
      const out = await n.coordinator.advance(advanceTo("tx-after", T_AFTER));
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(lifecycleOf(n)).toBe("active");
      expect(n.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_ID))!.version).toBe(1);
      // and the outcome then follows the term the opening registered, not a flag: it expires only on reaching 300
      const finish = await n.coordinator.advance(advanceTo("tx-300", at(300)));
      expect(finish.ok, JSON.stringify(finish)).toBe(true);
      expect(lifecycleOf(n)).toBe("expired");
    } finally {
      await n.campaign.close();
    }
  }, 240_000);

  it("the operator command never advances anything itself: the persisted canonical time is T0 whenever the command last ran", async () => {
    const dirs = await timedCampaign();
    expect((await addGovernance(dirs, writeGovernance(governanceDoc()))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect((c.store.getFact(TEMPORAL_STATE_KEY)!.value as any).canonical_time).toEqual(T_OPEN);
      expect(c.store.listFacts().some((f) => f.key.startsWith("temporal/transaction"))).toBe(false);
    } finally {
      await c.close();
    }
    expect((await held(dirs.campaignDir)).registered).toBe(true);
  }, 120_000);

  it("is unaffected by what the document says about validity: an authored `void` or `invalid` entry still expires by lifecycle only", async () => {
    const dirs = await timedCampaign();
    const doc = governanceDoc();
    doc.instrument = instrumentDoc({
      validity_by_order: [
        { governing_order_ref: "order-ref-a", validity_status: "void" },
        { governing_order_ref: "order-ref-a", validity_status: "invalid" },
        { governing_order_ref: "order-ref-b", validity_status: "unresolved" },
      ],
    });
    expect((await addGovernance(dirs, writeGovernance(doc))).result.status).toBe(
      "GOVERNANCE_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      expect((await w.coordinator.advance(advanceTo("tx-at", T_SUNSET))).ok).toBe(true);
      const n = w.gip.governanceInstrument(INSTRUMENT_ID)!;
      expect(n.value.lifecycle_status).toBe("expired");
      expect(n.value.validity_by_order).toEqual(doc.instrument.validity_by_order);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});
