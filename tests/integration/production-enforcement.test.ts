/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Production & Resource Conservation Backbone — enforcement that does not depend on the coordinator or on the
// Production / custodian operations behaving. IM-11 admission holds for a raw `store.commit` and for a TAMPERED
// group; owner exclusivity holds for everyone (requester, Population, World-State's other facets, Production
// itself after acceptance); load-time verification fails closed on drift; a failure at every durable step of the
// completion transaction converges by identity with no duplicate consumption, output, completion or acceptance.
// Register lineage: IA-02, IA-03, IA-05 (bounded partial), IA-06, IA-30 (partial); RC-02, RC-06, RC-07, RC-10,
// RC-16; IM-02, IM-03, IM-05, IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07
// BLOCKED).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_PRODUCTION_STATE,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  productionClaimKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  ProductionAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  deriveAcceptedEntity,
  nodeFs,
  productionCompletionProvider,
  productionTemporalObject,
  stageIntentId,
  verifyProductionIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T1,
  PROD_TC,
  REQ_1,
  REQ_2,
  RESERVE_MAIN,
  SYNTH_REQUESTER_OWNER,
  at,
  continuationInput,
  instrumentFs,
  prodAdvanceRequest,
  prodPublication,
  productionProviders,
  requestGroup,
  startInput,
  temporalPublication,
} from "@immortalis/testkit";
import {
  prodCoordinator,
  prodSummary,
  registerOperation,
  reopenProduction,
  seededProductionCampaign,
  startAndRegister,
} from "../support/production.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir, legacyStateText } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };
const entityKey = (op: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, `durable:${op}`);
const reserveKey = productionReserveKey(RESERVE_MAIN);
const opKey = productionOperationKey(REQ_1);
const claimKey = productionClaimKey(`claim:${REQ_1}`);
const completionKey = productionCompletionKey(REQ_1);

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

const withWrite = (g: CommitGroup, key: string, f: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) =>
    w.key === key ? { ...w, value: f(structuredClone(w.value)) as never } : w,
  ),
});

const rawGroup = (
  n: number,
  owner: string,
  facet: string,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: FIXTURE_CAMPAIGN,
  group_id: `raw-group-${n}`,
  intent_id: `raw-intent-${n}`,
  owner,
  facet,
  cause: `raw-cause-${n}`,
  rule: {
    artifact: "test://raw",
    native_pin: "p",
    clause: "c",
    authority_lineage: ["l"],
    effective_basis: "b",
    supersedes: null,
  },
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes: writes.map((w) => ({
    ...w,
    owner,
    facet,
    value: w.value as never,
    unit: null,
    basis: "raw-basis",
    secrecy: "raw-secrecy",
  })),
  ...over,
});

describe("Production-owned state cannot be authoritatively written by anyone else (IA-03; WS-003 §2)", () => {
  it("the test requester, Population, another World-State facet and a canonical owner cannot write any Production key space", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const reserve = s.campaign.store.getFact(reserveKey)!;
    const attempts: [string, string, string][] = [
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", reserveKey],
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", claimKey],
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", opKey],
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", completionKey],
      ["population", "population_state", reserveKey],
      [OWNER_WORLD_STATE, "world_profile", reserveKey],
      [OWNER_WORLD_STATE, "world_fallback_physical_entity", reserveKey],
      ["temporal_kernel", "temporal_coordination", opKey],
    ];
    for (const [i, [owner, facet, key]] of attempts.entries()) {
      const r = await s.campaign.store.commit(
        rawGroup(i, owner, facet, [
          {
            key,
            value: reserve.value,
            expected_version: s.campaign.store.getFact(key)?.version ?? 0,
          },
        ]),
      );
      expect(r.ok, `${owner}/${facet} → ${key}`).toBe(false);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("there is no fallback or generic owner: no Asset, Inventory, Labor or Logistics owner, and no unregistered key space (Economy is the sixth slice's own registered owner)", async () => {
    const s = await seededProductionCampaign(tempDir());
    const w = [{ key: "x/y", value: {}, expected_version: 0 }];
    for (const [i, owner] of ["asset", "inventory", "labor", "logistics", "kti"].entries()) {
      expect(await codeOf(s.campaign.store.commit(rawGroup(i, owner, "any", w)))).toBe(
        "OWNER_NOT_REGISTERED",
      );
    }
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawGroup(20, OWNER_PRODUCTION, "other-facet", [
            { key: "production/inventory/x", value: {}, expected_version: 0 },
          ]),
        ),
      ),
    ).toBe("OWNER_NOT_REGISTERED");
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawGroup(21, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
            { key: "production/inventory/x", value: {}, expected_version: 0 },
          ]),
        ),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("Production cannot write the World-State fallback entity's key space, before or after acceptance", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const entity = s.campaign.store.getFact(entityKey(REQ_1))!;
    const forged = { ...(entity.value as any), condition: "production-edited-condition" };
    for (const expected_version of [0, 1]) {
      const r = await s.campaign.store.commit(
        rawGroup(30 + expected_version, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
          { key: entityKey(REQ_1), value: forged, expected_version },
        ]),
      );
      expect(r.ok).toBe(false);
    }
    // the sealed completion record cannot be rewritten either, by Production or by anyone
    const sealed = await s.campaign.store.commit(
      rawGroup(33, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
        {
          key: completionKey,
          value: {
            ...(s.campaign.store.getFact(completionKey)!.value as any),
            conserved_reference: "durable:x",
          },
          expected_version: 1,
        },
      ]),
    );
    expect(!sealed.ok && sealed.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
    // and not even World-State itself can amend it: no amendment mechanism exists (sealed, create-only)
    const amend = await s.campaign.store.commit(
      rawGroup(32, OWNER_WORLD_STATE, FACET_WORLD_FALLBACK_ENTITY, [
        { key: entityKey(REQ_1), value: forged, expected_version: 1 },
      ]),
    );
    expect(!amend.ok && amend.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
    expect((s.campaign.store.getFact(entityKey(REQ_1))!.value as any).condition).toBe(
      "synthetic-condition-d",
    );
  });

  it("no raw store bypass into Production's key space: a Reserve cannot be edited, re-established, over-claimed or rewritten", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const reserve = s.campaign.store.getFact(reserveKey)!;
    const v = reserve.value as any;
    const edits: [string, unknown, number][] = [
      [
        "a quantity edit that breaks conservation",
        { ...v, quantity: { ...v.quantity, amount: 99 } },
        2,
      ],
      [
        "a schema-valid inflation of the Reserve",
        {
          ...v,
          established: { ...v.established, amount: 99 },
          quantity: { ...v.quantity, amount: 99 },
        },
        2,
      ],
      ["a re-establishment over an existing Reserve", { ...v, claims: [] }, 0],
      ["dropping the open claim", { ...v, claims: [] }, 2],
    ];
    for (const [i, [name, value, expected_version]] of edits.entries()) {
      const r = await s.campaign.store.commit(
        rawGroup(40 + i, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
          { key: reserveKey, value, expected_version },
        ]),
      );
      expect(r.ok, name).toBe(false);
    }
    // the claim cannot be released or rewritten by a raw commit either
    const claim = s.campaign.store.getFact(claimKey)!;
    const released = await s.campaign.store.commit(
      rawGroup(50, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
        {
          key: claimKey,
          value: { ...(claim.value as any), quantity: { amount: 1, unit: "synthetic-unit-m" } },
          expected_version: 1,
        },
      ]),
    );
    expect(released.ok).toBe(false);
    expect(s.production.reserve(RESERVE_MAIN)!.value.claims).toEqual([`claim:${REQ_1}`]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the adapter exposes no Reserve/claim/output writer, no release and no way to publish a durable", () => {
    const methods = adapterMethods(ProductionAdapter);
    expect(methods).toEqual(expectedAdapterMethods("ProductionAdapter"));
    expect(methods.filter((m) => /^(set|update|write|release|cancel|publish)/i.test(m))).toEqual(
      [],
    );
  });
});

describe("IM-11 refuses an unlawful START — even a TAMPERED one (RC-06, WS-003 §§9, 14-15)", () => {
  const mutations: [string, (g: CommitGroup) => CommitGroup][] = [
    [
      "a claim smaller than the declared input",
      (g) => withWrite(g, claimKey, (c) => ((c.quantity.amount = 3), c)),
    ],
    [
      "a claim larger than the declared input",
      (g) => withWrite(g, claimKey, (c) => ((c.quantity.amount = 7), c)),
    ],
    [
      "a Reserve that does not hold the claim open",
      (g) => withWrite(g, reserveKey, (r) => ((r.claims = []), r)),
    ],
    [
      "consuming the input at start (the quantity is not consumed by a claim)",
      (g) =>
        withWrite(g, reserveKey, (r) => {
          r.quantity.amount = 4;
          r.consumed = [{ operation_id: REQ_1, quantity: { amount: 6, unit: "synthetic-unit-m" } }];
          return r;
        }),
    ],
    [
      "more output than was requested (ex nihilo)",
      (g) => withWrite(g, opKey, (o) => ((o.transformation.output.quantity.amount = 2), o)),
    ],
    [
      "an output reference that is not the one derived from the operation",
      (g) => withWrite(g, opKey, (o) => ((o.transformation.output.reference = "durable:other"), o)),
    ],
    [
      "a start time that is not the canonical time",
      (g) =>
        withWrite(g, opKey, (o) => {
          o.timing.started_at = at(110);
          return o;
        }),
    ],
    [
      "an undeclared completion boundary identity",
      (g) => withWrite(g, opKey, (o) => ((o.timing.completion.boundary_id = "b-other"), o)),
    ],
    [
      "a request pinned at the wrong version",
      (g) => withWrite(g, opKey, (o) => ((o.request.version = 9), o)),
    ],
    [
      "a labor-materiality claim (the support basis is Tier A only)",
      (g) => withWrite(g, opKey, (o) => ((o.support_basis.labor = "MATERIAL"), o)),
    ],
    [
      "an invented priority basis on the claim",
      (g) => withWrite(g, claimKey, (c) => ((c.priority_basis = "first-come"), c)),
    ],
    [
      "a claim interval that is not the operation's",
      (g) => withWrite(g, claimKey, (c) => ((c.interval.from = at(101)), c)),
    ],
    [
      "a claim already consumed",
      (g) =>
        withWrite(g, claimKey, (c) => {
          c.lifecycle = {
            status: "CONSUMED",
            at: PROD_TC,
            by_stage: {
              causal_process_id: "p",
              owner_operation: { owner: "o", operation: "x" },
              prospective_result_id: "r",
            },
          };
          return c;
        }),
    ],
    [
      "an operation that starts already completed",
      (g) =>
        withWrite(g, opKey, (o) => {
          o.status = {
            state: "COMPLETED",
            completed_at: PROD_TC,
            completion_fact_key: completionKey,
          };
          return o;
        }),
    ],
  ];
  const refusal = [
    "declared input quantity",
    "declared input quantity",
    "holding its claim open",
    "holding its claim open",
    "exactly the output the request",
    "identities are those derived",
    "starts at the canonical time",
    "identities are those derived",
    "pinned at its current version",
    "value violates the production_operation",
    "value violates the production_claim",
    "starts at the canonical time",
    "starts in progress with an active claim",
    "starts in progress with an active claim",
  ];
  it.each(mutations.map((m, i) => [...m, refusal[i]!] as const))(
    "refuses %s",
    async (_name, mutate, why) => {
      const s = await seededProductionCampaign(tempDir());
      const t = tamperStore(s.campaign.store, OWNER_PRODUCTION, mutate);
      const before = prodSummary(s.campaign, s.coordinator);
      const r = await new ProductionAdapter(t.store).startOperation({
        ...prodPublication(60),
        start: startInput(REQ_1),
      });
      expect(t.tampered()).toBe(1);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.message).toContain(why); // refused by the intended rule
      expect(prodSummary(s.campaign, s.coordinator)).toEqual(before); // nothing credited, nothing recorded
      // the honest start then commits
      expect(
        (
          await new ProductionAdapter(s.campaign.store).startOperation({
            ...prodPublication(61),
            start: startInput(REQ_1),
          })
        ).ok,
      ).toBe(true);
    },
  );

  it("a start for a request the source did not write, a foreign-locality request, or another output is refused", async () => {
    const s = await seededProductionCampaign(tempDir());
    // a request fact that Production itself wrote is not a request: it must be its source's own fact
    const wrongOutput = await s.campaign.store.commit(
      requestGroup(FIXTURE_CAMPAIGN, 90, "req-wrong-output", {
        request_id: "req-wrong-output",
        source: { owner: SYNTH_REQUESTER_OWNER, cause_ref: "c" },
        requested_output: {
          output_class: "synthetic-durable-d",
          quantity: { amount: 2, unit: "synthetic-unit-d" },
        },
        scope: {
          world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
          locus: {
            fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
            entity_id: FIXTURE_LOCUS_ID,
          },
        },
        priority_authority_ref: null,
      }),
    );
    expect(wrongOutput.ok).toBe(true);
    // the operation declares 1 unit of output, the request asked for 2
    const r = await s.production.startOperation({
      ...prodPublication(70),
      start: startInput("req-wrong-output"),
    });
    expect(r.ok).toBe(false);
    expect(s.production.operation("req-wrong-output")).toBeUndefined();
    // a request carrying a priority/authority reference is unrepresentable
    const withPriority = await s.campaign.store.commit(
      requestGroup(FIXTURE_CAMPAIGN, 91, "req-priority", {
        request_id: "req-priority",
        source: { owner: SYNTH_REQUESTER_OWNER, cause_ref: "c" },
        requested_output: {
          output_class: "synthetic-durable-d",
          quantity: { amount: 1, unit: "synthetic-unit-d" },
        },
        scope: {
          world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
          locus: {
            fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
            entity_id: FIXTURE_LOCUS_ID,
          },
        },
        priority_authority_ref: "authority-1",
      }),
    );
    expect(withPriority.ok).toBe(true); // the requester may write what it likes in ITS key space…
    expect(
      await codeOf(
        s.production.startOperation({ ...prodPublication(71), start: startInput("req-priority") }),
      ),
    ).toBe("PREREQUISITE_MISSING"); // …but Production consumes only a well-formed request
  });
});

describe("IM-11 refuses an unlawful COMPLETION or ACCEPTANCE — even a TAMPERED one (CG-2; WS-003 §15)", () => {
  async function tampered(owner: string, mutate: (g: CommitGroup) => CommitGroup) {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const before = prodSummary(s.campaign, s.coordinator);
    const t = tamperStore(s.campaign.store, owner, mutate);
    const coordinator = new TemporalCoordinator(t.store, productionProviders());
    const r = await must(coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    return { s, before, r, t };
  }

  const completion: [string, (g: CommitGroup) => CommitGroup][] = [
    [
      "an inflated output quantity",
      (g) => withWrite(g, completionKey, (e) => ((e.completed.quantity.amount = 5), e)),
    ],
    [
      "a Reserve that was not debited (input never consumed)",
      (g) => withWrite(g, reserveKey, (r) => ((r.quantity.amount = 10), r)),
    ],
    [
      "input consumed twice",
      (g) =>
        withWrite(g, reserveKey, (r) => {
          r.quantity.amount = 0;
          r.consumed[0].quantity.amount = 10;
          return r;
        }),
    ],
    [
      "a claim left active after consumption",
      (g) => withWrite(g, claimKey, (c) => ((c.lifecycle = { status: "ACTIVE" }), c)),
    ],
    [
      "a completion stamped at a requested horizon, not the boundary",
      (g) => withWrite(g, completionKey, (e) => ((e.completed_at = at(300)), e)),
    ],
    [
      "an operation that never became completed",
      (g) => withWrite(g, opKey, (o) => ((o.status = { state: "IN_PROGRESS" }), o)),
    ],
    [
      "a second conserved reference",
      (g) => withWrite(g, completionKey, (e) => ((e.conserved_reference = "durable:other"), e)),
    ],
    [
      "a delta that does not match the Reserve it consumed from",
      (g) => withWrite(g, completionKey, (e) => ((e.delta.before.amount = 9), e)),
    ],
  ];
  it.each(completion)(
    "Production's completion with %s is refused: nothing is credited and the durable is not available",
    async (_n, mutate) => {
      const { s, before, r, t } = await tampered(OWNER_PRODUCTION, (g) =>
        g.writes.some((w) => w.key === completionKey) ? mutate(g) : g,
      );
      expect(t.tampered()).toBeGreaterThan(0);
      expect(r.rejections.map((x) => x.stage.owner_operation.operation)).toEqual([
        "production-complete-operation",
      ]);
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(r.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toEqual([
        "VALIDATION_REJECTED",
        "PREDECESSOR_BLOCKED",
      ]);
      const after = prodSummary(s.campaign, s.coordinator);
      expect(after.production).toEqual(before.production);
      expect(after.entities).toEqual([]);
      expect(s.production.availability(REQ_1).state).toBe("NOT_COMPLETED");
      // the honest re-presentation (same transaction identity's continuation) then completes exactly once
      const honest = await must(
        new TemporalCoordinator(s.campaign.store, productionProviders()).continueRemainder({
          transaction_id: "tx-honest",
          cause: "c",
          trigger: { kind: "k", ref: "r" },
          context: { role: "role.player", permission: "permission.player_choice.commit" },
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        }),
      );
      expect(honest.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
      expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
      expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
      expect(s.campaign.verify()).toEqual([]);
    },
  );

  const acceptance: [string, (g: CommitGroup) => CommitGroup][] = [
    [
      "an inflated quantity",
      (g) => withWrite(g, entityKey(REQ_1), (e) => ((e.quantity.amount = 2), e)),
    ],
    [
      "a different physical condition",
      (g) => withWrite(g, entityKey(REQ_1), (e) => ((e.condition = "other"), e)),
    ],
    [
      "a different class",
      (g) => withWrite(g, entityKey(REQ_1), (e) => ((e.entity_class = "other"), e)),
    ],
    [
      "a completion pinned at the wrong version",
      (g) => withWrite(g, entityKey(REQ_1), (e) => ((e.accepted_from.version = 2), e)),
    ],
    [
      "a locality the completion did not name",
      (g) => withWrite(g, entityKey(REQ_1), (e) => ((e.locality.locus.entity_id = "elsewhere"), e)),
    ],
    [
      "no pinned completion read",
      (g) => ({
        ...g,
        reads: g.reads.filter((r) => !r.key.startsWith("production/")),
        depends_on: [],
      }),
    ],
  ];
  const acceptanceCode = [
    "VALUE_INVALID",
    "VALUE_INVALID",
    "VALUE_INVALID",
    "VALUE_INVALID",
    "REFERENCE_INVALID",
    "REFERENCE_INVALID",
  ];
  it.each(acceptance.map((a, i) => [...a, acceptanceCode[i]!] as const))(
    "the custodian's acceptance with %s is refused: the completed durable stays unavailable",
    async (_n, mutate, code) => {
      const { s, r } = await tampered(OWNER_WORLD_STATE, (g) =>
        g.facet === FACET_WORLD_FALLBACK_ENTITY ? mutate(g) : g,
      );
      expect(r.rejections.map((x) => [x.stage.owner_operation.operation, x.code])).toEqual([
        ["world-state-accept-fallback-durable", code],
      ]);
      expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
      expect(s.campaign.store.getFact(entityKey(REQ_1))).toBeUndefined();
      // the input was consumed ONCE by the committed completion; the retry accepts without re-consuming
      expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    },
  );

  it("a raw acceptance, a duplicate and an acceptance with no completion are all refused; the lawful acceptance is the custodian's stage", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    // the completion genuinely commits (a stage), but the custodian is absent: completed, NOT available
    const blocked = new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionCompletionProvider]),
    );
    await must(blocked.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const completion = s.campaign.store.getFact(completionKey)!;
    const world = s.campaign.store.getFact(worldProfileKey(FIXTURE_WORLD_ID))!;
    const locus = s.campaign.store.getFact(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!;
    const entity = deriveAcceptedEntity(completion.value as any, completion.version);
    const accept = (n: number, value: unknown, expected_version = 0) =>
      rawGroup(
        n,
        OWNER_WORLD_STATE,
        FACET_WORLD_FALLBACK_ENTITY,
        [{ key: entityKey(REQ_1), value, expected_version }],
        {
          reads: [completion, world, locus].map((f) => ({ key: f.key, version: f.version })),
          depends_on: [completion, world, locus].map((f) => f.provenance.group_id),
        },
      );
    // a raw acceptance of the EXACT derived entity is not the custodian's stage: refused, nothing available
    const raw = await s.campaign.store.commit(accept(100, entity, 0));
    expect(!raw.ok && raw.error.code).toBe("REFERENCE_INVALID");
    expect(s.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    // the lawful acceptance: the custodian's stage, resolved by the coordinator's continuation
    await must(
      new TemporalCoordinator(s.campaign.store, productionProviders()).continueRemainder(
        continuationInput("tx-honest"),
      ),
    );
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    const dup = await s.campaign.store.commit(accept(101, entity, 0));
    expect(dup.ok).toBe(false); // a second acceptance of the same reference is not credited
    expect(s.campaign.store.listFacts().filter((f) => f.key.includes("/entity/"))).toHaveLength(1);

    const s2 = await seededProductionCampaign(tempDir());
    await startAndRegister(s2, REQ_1, 1);
    const fabricated = await s2.campaign.store.commit(
      rawGroup(102, OWNER_WORLD_STATE, FACET_WORLD_FALLBACK_ENTITY, [
        { key: entityKey(REQ_1), value: entity, expected_version: 0 },
      ]),
    );
    expect(!fabricated.ok && fabricated.error.code).toBe("PREREQUISITE_MISSING");
  });

  it("a completion commits only for an engaged operation: no completion without a registered, unretired boundary", async () => {
    const s = await seededProductionCampaign(tempDir());
    await must(s.production.startOperation({ ...prodPublication(110), start: startInput(REQ_1) }));
    // honest group, raw-committed, but the operation has NO temporal object (not engaged)
    const op = s.production.operation(REQ_1)!.value;
    const { deriveCompletion } = await import("@immortalis/engine");
    const reserve = s.campaign.store.getFact(reserveKey)!;
    const derived = deriveCompletion({
      operation: op,
      reserve: reserve.value as any,
      reserveVersion: reserve.version,
      claim: s.production.claim(`claim:${REQ_1}`)!.value,
    });
    expect(derived.ok).toBe(true);
    const d = derived.ok ? derived.value : (null as never);
    const group = rawGroup(111, OWNER_PRODUCTION, FACET_PRODUCTION_STATE, [
      {
        key: opKey,
        value: d.operation,
        expected_version: s.campaign.store.getFact(opKey)!.version,
      },
      { key: reserveKey, value: d.reserve, expected_version: reserve.version },
      {
        key: claimKey,
        value: d.claim,
        expected_version: s.campaign.store.getFact(claimKey)!.version,
      },
      { key: completionKey, value: d.envelope, expected_version: 0 },
    ]);
    const r = await s.campaign.store.commit(group);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(s.production.operation(REQ_1)!.value.status).toEqual({ state: "IN_PROGRESS" });
    // once the boundary is retired by its transaction, a second completion cannot be raw-committed either
    await registerOperation(s, REQ_1, 40);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const again = await s.campaign.store.commit(
      rawGroup(
        112,
        OWNER_PRODUCTION,
        FACET_PRODUCTION_STATE,
        group.writes.map((w) => ({
          key: w.key,
          value: w.value,
          expected_version: s.campaign.store.getFact(w.key)?.version ?? 0,
        })),
      ),
    );
    expect(again.ok).toBe(false);
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
  });
});

describe("RC-10: a Production temporal object is exactly the one derived from its committed operation", () => {
  it("a hand-written object — another boundary, an extra stage, a missing stage, another owner, no operation — is refused at registration", async () => {
    const s = await seededProductionCampaign(tempDir());
    await must(s.production.startOperation({ ...prodPublication(120), start: startInput(REQ_1) }));
    const op = s.production.operation(REQ_1)!.value;
    const honest = productionTemporalObject(op, LOCALITY);
    const variants: [string, unknown][] = [
      [
        "a different boundary",
        { ...honest, next_boundary: { ...honest.next_boundary!, at: at(150) } },
      ],
      [
        "a different boundary id",
        { ...honest, next_boundary: { ...honest.next_boundary!, boundary_id: "b-x" } },
      ],
      ["no custodian stage", { ...honest, dependencies: [honest.dependencies[0]] }],
      [
        "an extra stage",
        {
          ...honest,
          dependencies: [
            ...honest.dependencies,
            {
              ...honest.dependencies[0],
              stage: { ...honest.dependencies[0]!.stage, prospective_result_id: "x" },
            },
          ],
        },
      ],
      [
        "another owner",
        {
          ...honest,
          owning_ref: { owner: "someone-else", process_id: honest.owning_ref.process_id },
        },
      ],
      ["no earned boundary (a dormant completion)", { ...honest, next_boundary: null }],
      [
        "an object for an operation that is not committed",
        { ...honest, object_id: "obj-production-req-none" },
      ],
      ["an object that is not named for its operation", { ...honest, object_id: "obj-other" }],
    ];
    for (const [name, object] of variants) {
      const r = await s.coordinator.registerObject({ ...temporalPublication(60), object });
      expect(r.ok, name).toBe(false);
    }
    expect(s.coordinator.object(`obj-production-${REQ_1}`)).toBeUndefined();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    // the honest object registers; a second registration is not an amendment
    await must(s.coordinator.registerObject({ ...temporalPublication(61), object: honest }));
    expect(
      await codeOf(s.coordinator.registerObject({ ...temporalPublication(62), object: honest })),
    ).toBe("VERSION_CONFLICT");
  });
});

describe("load-time verification fails closed on Production drift (IA-30 partial)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    if (opts.complete !== false)
      await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyProductionIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify, before and after completion", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });
  it("detects a claim set back to active after it was consumed", async () => {
    expect(await drifted(edit(claimKey, (c) => (c.lifecycle = { status: "ACTIVE" })))).toMatch(
      /active claim is held open/,
    );
  });
  it("detects a consumption record that has no completed operation behind it", async () => {
    expect(
      await drifted(
        edit(reserveKey, (r) => {
          r.consumed.push({
            operation_id: "zzz-ghost",
            quantity: { amount: 1, unit: "synthetic-unit-m" },
          });
          r.established.amount += 1;
          r.quantity.amount = r.established.amount - 7;
        }),
      ),
    ).toMatch(/consumption by zzz-ghost/);
  });
  it("detects open claims that exceed what the Reserve holds (one quantity, two committed uses)", async () => {
    expect(
      await drifted(
        edit(reserveKey, (r) => {
          r.established.amount = 5;
          r.quantity.amount = 5;
          r.consumed = [];
          r.claims = [`claim:${REQ_1}`];
        }),
        { complete: false },
      ),
    ).toMatch(/exceed the held quantity/);
  });
  it("detects an envelope that is not the declared transformation, and an entity that is not the completed durable", async () => {
    expect(await drifted(edit(completionKey, (e) => (e.completed.quantity.amount = 3)))).toMatch(
      /declared transformation/,
    );
    expect(await drifted(edit(entityKey(REQ_1), (e) => (e.condition = "edited")))).toMatch(
      /exactly the completed durable/,
    );
  });
  it("detects an entity whose completion is gone, and a completion not credited by any transaction", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== completionKey))).toMatch(
      /completion that does not exist|sealed envelope/,
    );
    expect(
      await drifted((f) => f.filter((x) => !x.key.startsWith("temporal/transaction/"))),
    ).toMatch(/credited by no resolution transaction/);
  });
  it("detects an operation, claim and envelope that were not published atomically", async () => {
    expect(
      await drifted(edit(completionKey, (_e, fact) => (fact.provenance.group_id = "other-group"))),
    ).toMatch(/atomically/);
  });

  it("tampering with the persisted journal fails the open under the existing integrity model", async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("synthetic-condition-d");
    writeFileSync(journal, text.replace("synthetic-condition-d", "synthetic-condition-x"));
    const opened = await CanonicalCampaign.open(dir, { extension: PRODUCTION_FIXTURE_EXTENSION });
    expect(opened.ok).toBe(false);
  });

  it("a Production fact edited in the persisted state without its journal fails the open", async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    await s.campaign.close();
    const { readdirSync } = await import("node:fs");
    const stateFile = readdirSync(dir)
      .filter((f) => /^state\./.test(f))
      .sort()
      .pop()!;
    const text = legacyStateText(join(dir, stateFile));
    expect(text).toMatch(/"amount": 10/);
    writeFileSync(join(dir, stateFile), text.replace(/"amount": 10/g, '"amount": 11'));
    expect(
      (await CanonicalCampaign.open(dir, { extension: PRODUCTION_FIXTURE_EXTENSION })).ok,
    ).toBe(false);
  });
});

describe("unknown outcome is reconciled by identity: a failure at EVERY durable step of the completion transaction", () => {
  it("converges on the identical campaign with one consumption, one output, one completion and one acceptance", async () => {
    const seed = async (dir: string) => {
      const s = await seededProductionCampaign(dir);
      await startAndRegister(s, REQ_1, 1);
      await s.campaign.close();
    };
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenProduction(refDir, "ref");
    const refResult = await must(
      ref.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)),
    );
    const refHead = ref.campaign.store.head();
    const refSummary = prodSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, { fs: probe.fs, extension: PRODUCTION_FIXTURE_EXTENSION }),
    );
    const afterOpen = probe.count();
    await must(prodCoordinator(p.store).advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const afterAdvance = probe.count();
    await p.close();
    // Production stage + custodian stage + kernel group: three commits of at least four durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(6);

    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    const finals = new Set<string>();
    const stage1 = stageIntentId({
      causal_process_id: `production-operation:${REQ_1}`,
      owner_operation: { owner: "production", operation: "production-complete-operation" },
      prospective_result_id: `completion:${REQ_1}`,
    });
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: PRODUCTION_FIXTURE_EXTENSION }),
        );
        const r = await prodCoordinator(campaign.store).advance(
          prodAdvanceRequest("tx-complete", PROD_T1),
        );
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        const re = await reopenProduction(dir, "restart");
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const stageCommitted = re.campaign.store.lookupReceipt(stage1);
        if (re.coordinator.transaction("tx-complete")) seen.committed++;
        else if (stageCommitted) seen.partial++;
        else seen.rolledBack++;
        // never consumed twice or before completion lands: at most one consumption at any point
        expect(re.production.reserve(RESERVE_MAIN)!.value.consumed.length).toBeLessThanOrEqual(1);

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted
        const again = await must(
          re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)),
        );
        if (stageCommitted && !re.coordinator.transaction("tx-complete")) {
          expect(again.recomputed_in_place).toEqual([]);
        }
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        expect(prodSummary(re.campaign, re.coordinator).production).toEqual(refSummary.production);
        expect(prodSummary(re.campaign, re.coordinator).entities).toEqual(refSummary.entities);
        expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
        expect(re.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
        expect(again.transaction.stages.map((s) => s.group_id)).toEqual(
          refResult.transaction.stages.map((s) => s.group_id),
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenProduction(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 240_000);
});

describe("a failed start leaves nothing behind: no immortal pending object for a failed claim (RC-10 guard)", () => {
  it("a refused claim creates no operation, claim, object or boundary, and a later honest claim is unaffected", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const before = prodSummary(s.campaign, s.coordinator);
    const r = await s.production.startOperation({
      ...prodPublication(130),
      start: startInput(REQ_2, { input: 9 }),
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(prodSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    // the refused request can be presented again later, once material is free — it was never recorded
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const later = await s.production.startOperation({
      ...prodPublication(131),
      start: startInput(REQ_2, { input: 4, completion_at: at(400) }),
    });
    expect(later.ok).toBe(true);
  });
});
