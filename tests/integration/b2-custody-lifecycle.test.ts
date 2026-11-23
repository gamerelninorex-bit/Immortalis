/* eslint-disable @typescript-eslint/no-explicit-any -- the harness pokes at raw groups, stores and facts */
// F-014B B2-T01 and B2-T02 — the GM-wait custody lifecycle and the common W2 fence. SCRIPTED TESTKIT MECHANISM ONLY.
//
// What is real here: the production commit core, the production canonical admission machinery (under the TESTKIT-ONLY fixture admission,
// whose distinct history identity keeps its journals from ever being mistaken for real evidence), the real file package and the real
// registry. What is a labelled double: the origin proof (a hand-minted session and request-id text), the preparation (a synthetic
// extension-owner fixture fact), and the synthetic extension owner that supplies the "stage". No genuine AI GM, no named client, no
// production file provider, no matched H-07 and no live first interruption are claimed or exercised: those remain UNRUN / HELD.
//
// Design rule: every negative is ONE change from an accepted control, and every refusal is asserted to change nothing.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
  type StageRecord,
} from "@immortalis/contracts";
import {
  buildMarkerGroup,
  buildOpenGroup,
  buildSealGroup,
  deriveGmWaitFence,
  gmWaitCustodyCheck,
  factKind,
  stageGroupId,
  stageIntentId,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  PUB,
  SYNTH_FACET,
  SYNTH_OWNER,
  SYNTH_RULE,
  T0,
  TARGET,
  authorityGroupOf,
  foreignGroup,
  lifecycle,
  markerInput,
  must,
  proofOf,
  reopen,
  seededRig,
  tempDir,
  txOf,
} from "./b2-support.ts";
import { fixtureWorld, publication } from "@immortalis/testkit";

/** A snapshot that a refusal must leave exactly as it found it. */
const witness = (store: CampaignStore) => ({
  head: store.head(),
  facts: JSON.stringify(store.listFacts()),
});
const refused = async (
  store: CampaignStore,
  group: CommitGroup,
): Promise<{ code: string; reason: string | undefined; message: string }> => {
  const before = witness(store);
  const r = await store.commit(group);
  expect(r.ok, "the group must be refused").toBe(false);
  if (r.ok) throw new Error("unreachable");
  expect(witness(store), "a refusal changes no state, clock, receipt or custody").toEqual(before);
  expect(store.lookupReceipt(group.intent_id)).toBeNull();
  return {
    code: r.error.code,
    message: r.error.message,
    reason: (r.error.details as { reason?: string } | undefined)?.reason,
  };
};

const clockOf = (store: CampaignStore) =>
  TemporalStateSchema.parse(store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time;
const keysOf = (g: CommitGroup) => g.writes.map((w) => w.key).sort();

describe("B2-T01 — marker, separate OPEN, own zero-stage seal and sealed reconciliation are distinct committed groups", () => {
  it("[B2-T01 positive, testkit only] four distinct groups; the marker and OPEN move no time; only the own seal does; the index ends terminal", async () => {
    const rig = await seededRig(tempDir());
    const { store, custody, proof } = rig;
    const rev0 = store.head().revision;
    const clock0 = store.getFact(TEMPORAL_STATE_KEY)!;
    expect(clockOf(store)).toEqual(T0);

    const m = await must(custody.publishMarker(markerInput(rig)));
    const markerClock = store.getFact(TEMPORAL_STATE_KEY)!;
    expect(markerClock.version, "the marker credits no time").toBe(clock0.version);
    expect(custody.status(FIXTURE_PC_ID)).toEqual({ state: "MARKED" });
    const o = await must(custody.open(proof));
    expect(store.getFact(TEMPORAL_STATE_KEY)!.version, "OPEN credits no time").toBe(clock0.version);
    expect(custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
    const s = await must(custody.sealOwn(m.x));
    expect(clockOf(store), "the own seal lands the canonical time on the requested target").toEqual(
      TARGET,
    );
    expect(custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_UNRECONCILED" });
    const r = await must(custody.reconcile(proof));
    expect(custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_RECONCILED" });

    // four DISTINCT committed groups, one revision apiece, in this order
    const receipts = [m, o, s, r].map((c) => c.receipt);
    expect(receipts.map((x) => x.revision)).toEqual([rev0 + 1, rev0 + 2, rev0 + 3, rev0 + 4]);
    expect(new Set(receipts.map((x) => x.group_id)).size).toBe(4);
    expect(new Set(receipts.map((x) => x.intent_id)).size).toBe(4);
    const groups = receipts.map((x) => store.committedGroup(x.intent_id)!);
    const idx = temporalGmWaitByPcKey(FIXTURE_PC_ID);
    const auth = temporalTransactionAuthorityKey(txOf(m.x));
    const seal = temporalTransactionKey(txOf(m.x));
    expect(groups.map(keysOf)).toEqual([
      [idx, temporalGmWaitMarkerKey(m.x)].sort(),
      [auth, idx].sort(),
      [TEMPORAL_STATE_KEY, seal].sort(),
      [idx],
    ]);
    // the immutable marker stays at version 1; the index advanced monotonically (marker v1, OPEN v2, reconciled v3: the seal never writes it)
    expect(store.getFact(temporalGmWaitMarkerKey(m.x))!.version).toBe(1);
    expect(store.getFact(idx)!.version).toBe(3);
    expect(store.getFact(auth)!.version).toBe(1);
    expect(store.getFact(seal)!.version).toBe(1);
    expect(store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(clock0.version + 1);
    // the whole thing coheres on load, and again cold from the journal
    expect([...rig.campaign.verify(), ...verifyTemporalIntegrity(store)]).toEqual([]);
    expect(deriveGmWaitFence(store.canonicalState!()).active).toBeNull();
    await rig.campaign.close();
    const cold = await must(reopen(rig.dir, FIXTURE_ADMISSION, { audit: true }));
    expect([...cold.verify(), ...verifyTemporalIntegrity(cold.store)]).toEqual([]);
    expect(cold.store.getFact(idx)!.version).toBe(3);
    await cold.close();
  });

  describe("[negative] each refusal is one change from the accepted lifecycle and changes nothing", () => {
    /** the lawful seal of a campaign that HAS the opening, with its read of and dependency on that opening removed: a group the core's structural checks accept */
    const withoutAuthorityPin = (g: CommitGroup, x: string): CommitGroup => ({
      ...g,
      reads: g.reads.filter((r) => r.key !== temporalTransactionAuthorityKey(txOf(x))),
      depends_on: g.depends_on.filter((d) => d !== `gm-wait-open-group:${x}`),
    });
    const lawfulSealOf = async (): Promise<{ x: string; seal: CommitGroup }> => {
      const full = await seededRig(tempDir());
      const { x } = await lifecycle(full, "open");
      const seal = buildSealGroup(
        { get: (k) => full.store.getFact(k) },
        x,
        factKind("temporal_state").rule,
      );
      if (!seal.ok) throw new Error(JSON.stringify(seal.error));
      // the control: that very group IS accepted where the opening exists
      await must(full.store.commit(seal.value));
      return { x, seal: seal.value };
    };

    it("an old-style raw GM seal with no original OPEN is refused by the custody rules: the structurally valid seal, committed on a campaign that only has the marker", async () => {
      const { x, seal } = await lawfulSealOf();
      const markerOnly = await seededRig(tempDir());
      await lifecycle(markerOnly, "marker");
      // as-is, the core refuses it first (its read of, and dependency on, an opening that was never committed): a structural refusal, not the custody rule
      const structural = await refused(markerOnly.store, seal);
      expect(["STALE_READ", "MISSING_DEPENDENCY"]).toContain(structural.code);
      // with that pin removed, nothing structural remains: the CUSTODY rule alone refuses a GM seal that has no durable opening of its own X
      const r = await refused(markerOnly.store, withoutAuthorityPin(seal, x));
      expect(r.reason).toBe("GM_WAIT_SEAL");
      expect(markerOnly.store.getFact(temporalTransactionKey(txOf(x)))).toBeUndefined();
      expect(clockOf(markerOnly.store)).toEqual(T0);
    });

    it("a seal whose authority is borrowed from another X (the key and the X name a wait that was never opened) is refused by the custody rules", async () => {
      const { x, seal } = await lawfulSealOf();
      const markerOnly = await seededRig(tempDir());
      await lifecycle(markerOnly, "marker");
      const y = "b".repeat(64);
      const borrowed: CommitGroup = {
        ...withoutAuthorityPin(seal, x),
        group_id: `transaction-group:${txOf(y)}`,
        intent_id: `transaction-intent:${txOf(y)}`,
        cause: `transaction:${txOf(y)}`,
        writes: seal.writes.map((w) =>
          w.key === temporalTransactionKey(txOf(x))
            ? {
                ...w,
                key: temporalTransactionKey(txOf(y)),
                value: { ...(w.value as any), x: y, transaction_id: txOf(y) },
              }
            : w,
        ),
      };
      expect((await refused(markerOnly.store, borrowed)).reason).toBe("GM_WAIT_SEAL");
    });

    it("while another X is ACTIVE, a seal borrowed for a different X is refused earlier still, by the W2 fence: it is not that X's seal", async () => {
      const full = await seededRig(tempDir());
      const { x } = await lifecycle(full, "open");
      const seal = buildSealGroup(
        { get: (k) => full.store.getFact(k) },
        x,
        factKind("temporal_state").rule,
      );
      if (!seal.ok) throw new Error("seal");
      const y = "b".repeat(64);
      const borrowed: CommitGroup = {
        ...seal.value,
        group_id: `transaction-group:${txOf(y)}`,
        intent_id: `transaction-intent:${txOf(y)}`,
        cause: `transaction:${txOf(y)}`,
        writes: seal.value.writes.map((w) =>
          w.key === temporalTransactionKey(txOf(x))
            ? {
                ...w,
                key: temporalTransactionKey(txOf(y)),
                value: { ...(w.value as any), x: y, transaction_id: txOf(y) },
              }
            : w,
        ),
      };
      expect((await refused(full.store, borrowed)).reason).toBe("GM_WAIT_ACTIVE_FOREIGN");
    });

    it("an OPEN and a seal in ONE group (the same-group shortcut) is refused: by the governing-rule citation at admission, and by the custody shape rule when judged alone", async () => {
      const full = await seededRig(tempDir());
      const { x } = await lifecycle(full, "open");
      const seal = buildSealGroup(
        { get: (k) => full.store.getFact(k) },
        x,
        factKind("temporal_state").rule,
      );
      if (!seal.ok) throw new Error("seal");

      const markerOnly = await seededRig(tempDir());
      await lifecycle(markerOnly, "marker");
      const open = buildOpenGroup({ get: (k) => markerOnly.store.getFact(k) }, x);
      if (!open.ok) throw new Error("open");
      const shortcut: CommitGroup = {
        ...open.value,
        writes: [...open.value.writes, ...seal.value.writes],
      };
      const r = await refused(markerOnly.store, shortcut);
      expect(r.code).toBe("REFERENCE_INVALID");
      expect(r.message).toMatch(/current governing-rule citation/);
      // the custody layer, called directly with a policy and the prestate, refuses the SHAPE independently of any citation
      const verdict = gmWaitCustodyCheck(shortcut, markerOnly.store.canonicalState!(), {
        policy: {
          preparation: "FIXTURE",
          historyVerificationId: "h",
          isCanonicalOwner: () => false,
        },
        live: false,
      });
      expect((verdict?.details as any)?.reason).toBe("GM_WAIT_GROUP_SHAPE");
      // the control: the OPEN alone, from the same state, is lawful when it is published with the verified origin proof (a raw commit is held)
      await must(markerOnly.custody.open(markerOnly.proof));
    });

    it("a raw LEGACY-shaped seal that states the GM trigger is refused: at the reserved GM transaction namespace, under the player pair at an ordinary key (the existing S1 guard), and under the GM pair by the legacy schema", async () => {
      const rig = await seededRig(tempDir());
      const { x } = await lifecycle(rig, "marker"); // no wait is ACTIVE, so these reach the rules under test rather than the fence
      const clock = rig.store.getFact(TEMPORAL_STATE_KEY)!;
      const legacyShaped = (id: string, context: unknown): any => ({
        transaction_id: id,
        cause: "c",
        trigger: { kind: "GM_INTERPRETED_PC_WAIT", ref: "r" },
        continues: null,
        opening: { basis_time: T0, state_version: clock.version },
        requested: { target: TARGET, condition: null },
        context,
        engaged: [],
        boundaries_crossed: [],
        stages: [],
        rule_versions: [],
        outcome: {
          actual_stop: TARGET,
          stop_reason: "TARGET_REACHED",
          remainder: null,
          unresolved_dependents: [],
        },
      });
      const group = (id: string, context: unknown): CommitGroup => ({
        campaign_id: FIXTURE_CAMPAIGN,
        group_id: `transaction-group:${id}`,
        intent_id: `transaction-intent:${id}`,
        owner: clock.owner,
        facet: clock.facet,
        cause: `transaction:${id}`,
        rule: factKind("temporal_state").rule,
        authority: { role: "role.archivist", permission: "permission.canon.write" },
        reads: [{ key: TEMPORAL_STATE_KEY, version: clock.version }],
        depends_on: [clock.provenance.group_id],
        writes: [
          {
            key: TEMPORAL_STATE_KEY,
            owner: clock.owner,
            facet: clock.facet,
            unit: null,
            ...PUB,
            expected_version: clock.version,
            value: { canonical_time: TARGET, last_transaction: id, continuation: null } as never,
          },
          {
            key: temporalTransactionKey(id),
            owner: clock.owner,
            facet: clock.facet,
            unit: null,
            ...PUB,
            expected_version: 0,
            value: legacyShaped(id, context) as never,
          },
        ],
      });
      const player = { ...PLAYER_CHOICE_AUTHORITY };
      const squat = await refused(rig.store, group(txOf(x), player));
      expect(squat.reason).toBe("GM_WAIT_RESERVED_NAMESPACE");
      const ordinary = await refused(rig.store, group("ordinary-tx-1", player));
      expect(ordinary.message).toMatch(/reserved for GM-interpreted waiting/);
      const gmPair = await refused(
        rig.store,
        group("ordinary-tx-2", { role: "role.gm", permission: "permission.rule.adjudicate" }),
      );
      expect(gmPair.code).toBe("VALUE_INVALID");
    });

    it("the fresh seal of the control is lawful only once: a second seal of the same X is the same identity (a replay), never a second transaction", async () => {
      const rig = await seededRig(tempDir());
      const { x } = await lifecycle(rig, "seal");
      const again = await must(rig.custody.sealOwn(x));
      expect(again.replayed).toBe(true);
      expect(rig.store.getFact(temporalTransactionKey(txOf(x)))!.version).toBe(1);
      expect(rig.store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(2);
    });
  });
});

describe("B2-T02 — the common W2 fence while a wait is ACTIVE", () => {
  const stageKey = {
    causal_process_id: "b2-process-1",
    owner_operation: { owner: SYNTH_OWNER, operation: "b2-stage-op" },
    prospective_result_id: "b2-result-1",
  };
  /** the genuine owner stage of the open transaction: the cause every stage carries, a dependency on its durable opening, its derived identity */
  const stageOf = (x: string, authorityGroupId: string): CommitGroup => ({
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: stageGroupId(stageKey),
    intent_id: stageIntentId(stageKey),
    owner: SYNTH_OWNER,
    facet: SYNTH_FACET,
    cause: `transaction:${txOf(x)}`,
    rule: SYNTH_RULE,
    authority: { role: "role.archivist", permission: "permission.canon.write" },
    reads: [],
    depends_on: [authorityGroupId],
    writes: [
      {
        key: "synthetic/stage/b2-result",
        owner: SYNTH_OWNER,
        facet: SYNTH_FACET,
        unit: null,
        basis: "synthetic-basis",
        secrecy: "synthetic-secrecy",
        expected_version: 0,
        value: "stage-result" as never,
      },
    ],
  });
  const stageRecord = (
    g: CommitGroup,
    r: { revision: number; group_sha256: string; invariants: readonly { name: string }[] },
  ): StageRecord => ({
    stage: stageKey,
    reads: [],
    group_id: g.group_id,
    intent_id: g.intent_id,
    revision: r.revision,
    group_sha256: r.group_sha256,
    writes: g.writes.map((w) => ({ key: w.key, version: w.expected_version + 1 })),
    validation: { invariants: r.invariants.map((i) => i.name) },
  });

  it("[control + negatives] a zero-credit ACTIVE wait refuses a foreign canonical owner write, a foreign extension write, a raw kernel registration and a second operation; each refusal changes nothing", async () => {
    const rig = await seededRig(tempDir());
    const { store, campaign } = rig;
    // control: before OPEN, ordinary traffic is not fenced (the marker alone activates nothing)
    await lifecycle(rig, "marker");
    await must(store.commit(foreignGroup(0)));

    await must(rig.custody.open(rig.proof));
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
    const fence = deriveGmWaitFence(store.canonicalState!());
    expect(fence.active).not.toBeNull();
    expect(fence.active!.transactionId).toBe(txOf(fence.active!.x));

    // foreign extension owner, an otherwise lawful disjoint group
    expect((await refused(store, foreignGroup(1))).reason).toBe("GM_WAIT_ACTIVE_FOREIGN");
    // foreign CANONICAL owner, through the shipped owner API (it publishes through `store.commit`)
    const before = witness(store);
    const canonical = await campaign.establishWorld({
      ...publication(90),
      world: fixtureWorld({ world_id: "world-other-1" }),
    });
    expect(canonical.ok).toBe(false);
    expect(witness(store)).toEqual(before);
    // a raw kernel group of the Temporal owner that is neither a stage nor this X's seal (a second operation's marker)
    const other = proofOf("session-other", "2");
    const second = buildMarkerGroup(
      { get: (k) => store.getFact(k) },
      {
        ...markerInput({ proof: other, prep: rig.prep }),
        campaignId: FIXTURE_CAMPAIGN,
        policy: {
          catalogueSha256: "0".repeat(64),
          historyVerificationId: FIXTURE_ADMISSION.historyVerificationId!,
        },
      },
    );
    if (!second.ok) throw new Error("second");
    expect((await refused(store, second.value.group)).reason).toBe("GM_WAIT_ACTIVE_FOREIGN");
  });

  it("[control + positive] an owner stage of that exact X is admitted, X's own seal citing it is admitted, and the same group refused during ACTIVE is newly evaluated afterwards", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const authGroup = authorityGroupOf(rig.store, x);

    // negatives, one change from the stage: a stage that does not depend on X's opening, and one that carries another transaction's cause
    const stage = stageOf(x, authGroup);
    expect((await refused(rig.store, { ...stage, depends_on: [] })).reason).toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    expect((await refused(rig.store, { ...stage, cause: "transaction:another-tx" })).reason).toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    // the foreign group is refused while ACTIVE
    expect((await refused(rig.store, foreignGroup(2))).reason).toBe("GM_WAIT_ACTIVE_FOREIGN");

    // the genuine stage of X
    const staged = await must(rig.store.commit(stage));
    const record = stageRecord(stage, staged.receipt);
    // the own seal, citing the stage
    const sealed = await must(rig.custody.sealOwn(x, [{ record, groupId: stage.group_id }]));
    expect(clockOf(rig.store)).toEqual(TARGET);
    expect(
      JSON.parse(JSON.stringify(rig.store.getFact(temporalTransactionKey(txOf(x)))!.value)).stages,
    ).toHaveLength(1);
    expect(sealed.receipt.revision).toBeGreaterThan(staged.receipt.revision);
    expect([...rig.campaign.verify(), ...verifyTemporalIntegrity(rig.store)]).toEqual([]);

    // W2 ended at the seal: the previously refused group is NOW evaluated afresh under its own owner's law (it is not auto-passed by W2 ending)
    expect(deriveGmWaitFence(rig.store.canonicalState!()).active).toBeNull();
    await must(rig.store.commit(foreignGroup(2)));
    const refusedByOwner = await rig.store.commit(foreignGroup(3, "not-a-synthetic-key/3"));
    expect(
      refusedByOwner.ok,
      "the synthetic owner's own admission still refuses a key outside its space: W2 ending grants nothing",
    ).toBe(false);
    expect((refusedByOwner as any).error.code).toBe("KEY_NOT_ADMITTED");
    expect(((refusedByOwner as any).error.details ?? {}).reason).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
  });

  it("[control + negative] an identical already-committed group replays as a READ: it publishes nothing and cannot clear custody", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const committed = (intent: string) => rig.store.committedGroup(intent)!;
    const markerGroup = committed(`gm-wait-marker-intent:${x}`);
    const openGroup = committed(`gm-wait-open-intent:${x}`);
    const before = witness(rig.store);
    for (const g of [markerGroup, openGroup]) {
      const again = await must(rig.store.commit(g));
      expect(again.replayed).toBe(true);
    }
    expect(witness(rig.store), "a replay writes nothing").toEqual(before);
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
    // the control for "changed content": the same intent with a different write is a conflict, never a replay
    const conflicting = { ...openGroup, writes: openGroup.writes.slice(0, 1) };
    expect(((await rig.store.commit(conflicting)) as any).error.code).toBe("INTENT_CONFLICT");
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
  });

  it("[AM-3.P non-interference, bounded claim] ending W2 at the seal changes exactly the Temporal seal's own facts and releases nothing else", async () => {
    // AM-3.P (player-choice custody) has NO executable implementation in this build: it is a ratified design source only, and it stays UNRUN. What this
    // test can and does show is the mechanical half of "W2 ends at the seal independently of any AM-3.P custody": the seal group writes the Temporal state
    // and its own transaction and nothing else, the by-PC slot is NOT released by it, and no foreign fact moves.
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    const factsBefore = new Map(rig.store.listFacts().map((f) => [f.key, f.version]));
    await must(rig.custody.sealOwn(x));
    const changed = rig.store
      .listFacts()
      .filter((f) => factsBefore.get(f.key) !== f.version)
      .map((f) => f.key)
      .sort();
    expect(changed).toEqual([TEMPORAL_STATE_KEY, temporalTransactionKey(txOf(x))].sort());
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "SEALED_UNRECONCILED" });
    // the slot is still held after W2 ended: a new X cannot take it before the reconciliation
    const next = await rig.custody.publishMarker(
      markerInput({ proof: proofOf("session-next", "7"), prep: rig.prep }),
    );
    expect(next.ok).toBe(false);
  });
});
