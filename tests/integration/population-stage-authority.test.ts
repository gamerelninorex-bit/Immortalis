// A01: real owner-produced groups, canonical raw admission and verified reopening. No helper-only pass.
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_TEMPORAL_COORDINATION,
  OWNER_POPULATION,
  OWNER_TEMPORAL_KERNEL,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  populationCloseKey,
  populationLedgerKey,
  temporalTransactionAuthorityKey,
  type CommitGroup,
  type JournalEntry,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  POPULATION_RULE,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalAdmission,
  createFileCampaign,
  factKind,
  openFileCampaign,
  populationBarrierEvaluator,
  populationStageProvider,
  stageGroupId,
  stageIntentId,
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
  verifyPopulationIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  CRITERION_KEY,
  FIXTURE_CAMPAIGN,
  LEDGER_MAIN,
  LEDGER_OTHER,
  POPULATION_FIXTURE_EXTENSION,
  POP_TC,
  POP_TP,
  SYNTH_CRITERION_OWNER,
  SYNTH_CAUSE_OWNER,
  SYNTH_RULE,
  advanceToRequest,
  at,
  criterion,
  popClose1Object,
  popClose2Object,
  populationProviders,
  registerKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  commitCriterion,
  commitRegister,
  PENDING_ENVELOPE,
  popCoordinator,
  seededPendingConsumer,
  seededPopulationCampaign,
} from "../support/population.ts";
import { codeOf, must } from "../support/temporal.ts";
import { snapshotDir, tempDir } from "../support/tmp.ts";

// Exact policy before A01; an old checkpoint is not evidence that the new rule ran.
const OLD_POLICY =
  "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+MS-SETUP-V08@2026-11-09T00:43:08.394Z+MS_ACTOR_PARSER_V1+ROADBED-FREIGHT-FI@2026-11-13T06:14:52.876Z";
const ledgerKey = populationLedgerKey(LEDGER_MAIN);

/** The real sealed kernel opening, subject to canonical Temporal admission. */
async function openAuthority(
  store: CampaignStore,
  id = "tx-a01",
  target = POP_TP,
  condition: ResolutionRequest["requested"]["condition"] = null,
) {
  const clock = store.getFact(TEMPORAL_STATE_KEY)!;
  const request = { ...advanceToRequest(id, target), requested: { target, condition } };
  await must(
    store.commit({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: transactionAuthorityGroupId(id),
      intent_id: transactionAuthorityIntentId(id),
      cause: transactionCause(id),
      owner: OWNER_TEMPORAL_KERNEL,
      facet: FACET_TEMPORAL_COORDINATION,
      rule: factKind("temporal_state").rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: clock.key, version: clock.version }],
      depends_on: [clock.provenance.group_id],
      writes: [
        {
          key: temporalTransactionAuthorityKey(id),
          owner: OWNER_TEMPORAL_KERNEL,
          facet: FACET_TEMPORAL_COORDINATION,
          expected_version: 0,
          unit: null,
          ...request.publication,
          value: {
            ...request,
            opening: {
              basis_time: TemporalStateSchema.parse(clock.value).canonical_time,
              state_version: clock.version,
            },
          },
        },
      ],
    }),
  );
}

/** Actual Population provider; caller-controlled identity is the attack, not fabricated arithmetic. */
function groupFor(
  store: CampaignStore,
  object = popClose1Object(),
  point = POP_TP,
  tx = "tx-a01",
): CommitGroup {
  const d = object.dependencies[0]!;
  const reads = d.reads.map((r) => {
    const fact = store.getFact(r.source.fact_key)!;
    return {
      fact,
      read: {
        ...r,
        source_basis: { version: fact.version, committed_by: fact.provenance.group_id },
      },
    };
  });
  const prior = new Map(
    d.produces.flatMap((key) => {
      const fact = store.getFact(key);
      return fact ? [[key, fact] as const] : [];
    }),
  );
  const writes = populationStageProvider.compute({
    stage: d.stage,
    produces: d.produces,
    span: {
      from: object.last_resolved_basis,
      to: point,
      elapsed: point.value - object.last_resolved_basis.value,
    },
    reads,
    prior,
  });
  const authority = store.getFact(temporalTransactionAuthorityKey(tx));
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: stageGroupId(d.stage),
    intent_id: stageIntentId(d.stage),
    cause: transactionCause(tx),
    owner: populationStageProvider.owner,
    facet: populationStageProvider.facet,
    rule: POPULATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: reads.map(({ fact }) => ({ key: fact.key, version: fact.version })),
    depends_on: [
      ...reads.map(({ fact }) => fact.provenance.group_id),
      ...(authority ? [authority.provenance.group_id] : []),
    ],
    writes: writes.map((w) => ({
      ...w,
      owner: OWNER_POPULATION,
      facet: populationStageProvider.facet,
      expected_version: prior.get(w.key)?.version ?? 0,
    })),
  };
}

const changedDeclaration = (
  change: (d: TemporalObject["dependencies"][number]) => TemporalObject["dependencies"][number],
): TemporalObject => {
  const o = popClose1Object();
  return { ...o, dependencies: [change(o.dependencies[0]!)] };
};

async function refuseWithoutMutation(dir: string, store: CampaignStore, group: CommitGroup) {
  const head = store.head(),
    facts = store.listFacts(),
    bytes = snapshotDir(dir);
  expect(await codeOf(store.commit(group))).not.toBe("OK");
  expect(store.head()).toEqual(head);
  expect(store.listFacts()).toEqual(facts);
  expect(store.lookupReceipt(group.intent_id)).toBeNull();
  expect(snapshotDir(dir)).toEqual(bytes);
}

describe("A01 Population stage admission is independent of an honest coordinator", () => {
  for (const attack of [
    "arbitrary identity",
    "ghost transaction",
    "no authority dependency",
    "wrong target",
    "unreachable condition",
    "unengaged dormant close",
    "skipped earlier close",
    "undeclared result",
    "omitted declared input",
    "omitted cohort write",
    "wrong resolution point",
    "stale opening",
    "closed transaction",
    "missing predecessor",
    "stale read",
    "stale write",
  ] as const) {
    it(`refuses ${attack} atomically`, async () => {
      const dir = tempDir(),
        s = await seededPopulationCampaign(dir),
        store = s.campaign.store;
      if (attack === "closed transaction") {
        await must(
          new TemporalCoordinator(store, new StageProviderRegistry()).advance(
            advanceToRequest("tx-a01", POP_TP),
          ),
        );
      } else if (attack !== "arbitrary identity" && attack !== "ghost transaction") {
        await openAuthority(
          store,
          "tx-a01",
          attack === "wrong target" ? at(110) : at(300),
          attack === "unreachable condition"
            ? {
                kind: "STOP_AFTER_BOUNDARY",
                object_id: "unrelated-object",
                boundary_id: "unrelated-boundary",
              }
            : null,
        );
      }
      if (attack === "stale opening")
        await must(s.coordinator.advance(advanceToRequest("tx-other", at(110))));
      if (attack === "missing predecessor") {
        const original = popClose1Object();
        await must(
          s.coordinator.registerObject({
            ...temporalPublication(99),
            object: {
              ...original,
              object_id: "criterion-producer",
              owning_ref: { owner: SYNTH_CRITERION_OWNER, process_id: "criterion-producer" },
              dependencies: [
                {
                  stage: {
                    causal_process_id: "criterion-producer",
                    owner_operation: { owner: SYNTH_CRITERION_OWNER, operation: "criterion-close" },
                    prospective_result_id: "criterion-at-tp",
                  },
                  reads: [],
                  produces: [CRITERION_KEY],
                  declares_close: null,
                },
              ],
            },
          }),
        );
      }
      let object = popClose1Object();
      if (attack === "unengaged dormant close" || attack === "skipped earlier close")
        object = popClose2Object();
      if (attack === "undeclared result")
        object = changedDeclaration((d) => ({
          ...d,
          stage: { ...d.stage, prospective_result_id: "undeclared" },
        }));
      if (attack === "omitted declared input")
        object = changedDeclaration((d) => ({ ...d, reads: d.reads.slice(0, 1) }));
      if (attack === "omitted cohort write")
        object = changedDeclaration((d) => ({
          ...d,
          produces: d.produces.filter((k) => !k.endsWith(`/cohort/${COHORT_BURDEN_L}`)),
        }));
      const point =
        attack === "wrong resolution point"
          ? at(121)
          : attack === "skipped earlier close"
            ? POP_TC
            : POP_TP;
      if (attack === "wrong resolution point" || attack === "skipped earlier close")
        await commitCriterion(store, 98, point, ["u-1", "u-2", "u-5"]);
      let group = groupFor(store, object, point);
      if (attack === "arbitrary identity")
        group = { ...group, group_id: "forged", intent_id: "forged", cause: "not-a-transaction" };
      if (attack === "no authority dependency")
        group = { ...group, depends_on: group.depends_on.slice(0, -1) };
      if (attack === "stale read") await commitCriterion(store, 99, POP_TP, ["u-1", "u-2", "u-5"]);
      if (attack === "stale write")
        group = {
          ...group,
          writes: group.writes.map((w, i) =>
            i === 0 ? { ...w, expected_version: w.expected_version + 1 } : w,
          ),
        };
      await refuseWithoutMutation(dir, store, group);
      await s.campaign.close();
    });
  }

  it("admits the real declared stage before the global clock advances; exact replay keeps its receipt and changed content conflicts", async () => {
    const dir = tempDir(),
      s = await seededPopulationCampaign(dir),
      store = s.campaign.store;
    await openAuthority(store);
    const group = groupFor(store),
      first = await must(store.commit(group)),
      head = store.head();
    expect(s.coordinator.state()!.value.canonical_time.value).toBe(100);
    expect(s.campaign.verify()).toEqual([]);
    expect(await must(store.commit(group))).toEqual({ receipt: first.receipt, replayed: true });
    expect(await codeOf(store.commit({ ...group, cause: "changed-content" }))).toBe(
      "INTENT_CONFLICT",
    );
    expect(store.head()).toEqual(head);
    await s.campaign.close();
    const re = await must(CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }));
    expect(re.store.lookupReceipt(group.intent_id)).toEqual(first.receipt);
    expect(await must(re.store.commit(group))).toEqual({ receipt: first.receipt, replayed: true });
    const recovered = await must(
      popCoordinator(re.store).advance(advanceToRequest("tx-a01", POP_TP)),
    );
    // The raw opening uses a different request target only in negative cases; this one is exact.
    expect(recovered.adopted).toContainEqual(popClose1Object().dependencies[0]!.stage);
    expect(re.store.getFact(ledgerKey)!.version).toBe(2);
    await re.close();
  });

  it("preserves a real condition-bounded transaction without using its requested horizon as stage identity", async () => {
    const dir = tempDir(),
      s = await seededPopulationCampaign(dir);
    const object = popClose1Object();
    const request = advanceToRequest("tx-condition", at(300));
    const result = await must(
      s.coordinator.advance({
        ...request,
        requested: {
          ...request.requested,
          condition: {
            kind: "STOP_AFTER_BOUNDARY",
            object_id: object.object_id,
            boundary_id: object.next_boundary!.boundary_id,
          },
        },
      }),
    );
    expect(result.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(result.transaction.stages[0]!.stage).toEqual(object.dependencies[0]!.stage);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const re = await must(CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }));
    expect(re.verify()).toEqual([]);
    await re.close();
  });

  for (const mode of ["AS-OF-NOW", "AS-OF-DECLARED-CLOSE"] as const) {
    it(`preserves a genuinely committed engaged ${mode} source predecessor through strict reopen`, async () => {
      const key = mode === "AS-OF-NOW" ? CRITERION_KEY : registerKey(LEDGER_MAIN);
      const owner = mode === "AS-OF-NOW" ? SYNTH_CRITERION_OWNER : SYNTH_CAUSE_OWNER;
      const operation = { owner, operation: "a01-source-close" };
      const sourceStage = {
        causal_process_id: "a01-source",
        owner_operation: operation,
        prospective_result_id: "source-result",
      };
      const basis = { name: "a01-source-close", producer: operation };
      const ordinary = changedDeclaration((d) => ({
        ...d,
        reads: d.reads.map((r) =>
          r.source.fact_key === key && mode === "AS-OF-DECLARED-CLOSE"
            ? { ...r, mode, close_basis: basis }
            : r,
        ),
      }));
      const dir = tempDir(),
        s = await seededPopulationCampaign(dir, { ordinaryObject: ordinary }),
        store = s.campaign.store;
      const source = store.getFact(key)!;
      await must(
        s.coordinator.registerObject({
          ...temporalPublication(99),
          object: {
            ...popClose1Object(),
            object_id: "a01-source-object",
            owning_ref: { owner, process_id: "a01-source" },
            dependencies: [
              {
                stage: sourceStage,
                reads: [],
                produces: [key],
                declares_close: { name: basis.name },
              },
            ],
          },
        }),
      );
      const providers = populationProviders();
      providers.register({
        owner,
        facet: source.facet,
        operation: operation.operation,
        rule: SYNTH_RULE,
        compute: () => [
          {
            key,
            value: source.value,
            unit: source.unit,
            basis: source.basis,
            secrecy: source.secrecy,
          },
        ],
      });
      const result = await must(
        new TemporalCoordinator(store, providers, populationBarrierEvaluator).advance(
          advanceToRequest("tx-source-predecessor", POP_TP),
        ),
      );
      expect(result.rejections).toEqual([]);
      expect(result.transaction.stages.map((s) => s.stage)).toEqual([
        sourceStage,
        ordinary.dependencies[0]!.stage,
      ]);
      expect(
        store
          .committedGroup(stageIntentId(ordinary.dependencies[0]!.stage))!
          .reads.find((r) => r.key === key)!.version,
      ).toBe(source.version + 1);
      const head = store.head();
      await s.campaign.close();
      const strict = await must(
        openFileCampaign(dir, { audit: true, admission: canonicalAdmission }),
      );
      expect(verifyPopulationIntegrity(strict)).toEqual([]);
      expect(strict.head()).toEqual(head);
      await strict.close();
      const verified = await must(
        CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
      );
      expect(verified.verify()).toEqual([]);
      await verified.close();
    });
  }

  it("preserves two ordered closes of one ledger inside one open transaction, including strict historical replay", async () => {
    const dir = tempDir(),
      s = await seededPopulationCampaign(dir),
      store = s.campaign.store;
    await commitRegister(store, 10, [PENDING_ENVELOPE()]);
    const operation = { owner: SYNTH_CRITERION_OWNER, operation: "a01-sequential-criteria" };
    for (const [name, point] of [
      ["first", POP_TP],
      ["later", POP_TC],
    ] as const) {
      const object = popClose1Object();
      await must(
        s.coordinator.registerObject({
          ...temporalPublication(name === "first" ? 98 : 99),
          object: {
            ...object,
            object_id: `a01-criterion-${name}`,
            owning_ref: { owner: SYNTH_CRITERION_OWNER, process_id: `a01-criterion-${name}` },
            next_boundary: { boundary_id: `a01-criterion-${name}`, at: point },
            invalidators: [],
            dependencies: [
              {
                stage: {
                  causal_process_id: `a01-criterion-${name}`,
                  owner_operation: operation,
                  prospective_result_id: `criterion-${name}`,
                },
                reads: [],
                produces: [CRITERION_KEY],
                declares_close: null,
              },
            ],
          },
        }),
      );
    }
    const source = store.getFact(CRITERION_KEY)!;
    const providers = populationProviders();
    providers.register({
      owner: source.owner,
      facet: source.facet,
      operation: operation.operation,
      rule: SYNTH_RULE,
      compute: (input) => [
        {
          key: CRITERION_KEY,
          value: criterion(
            input.span.to,
            input.stage.prospective_result_id === "criterion-first"
              ? ["u-1", "u-2", "u-5"]
              : ["u-1", "u-3", "u-5"],
          ) as never,
          unit: source.unit,
          basis: source.basis,
          secrecy: source.secrecy,
        },
      ],
    });
    const request = advanceToRequest("tx-two-closes", POP_TC);
    const done = await must(
      new TemporalCoordinator(store, providers, populationBarrierEvaluator).advance(request),
    );
    expect(done.rejections).toEqual([]);
    expect(
      done.transaction.stages.filter((r) => r.stage.owner_operation.owner === OWNER_POPULATION),
    ).toHaveLength(2);
    expect(store.getFact(ledgerKey)!.version).toBe(3);
    expect(s.campaign.verify()).toEqual([]);
    const head = store.head();
    await s.campaign.close();
    const strict = await must(
      openFileCampaign(dir, { audit: true, admission: canonicalAdmission }),
    );
    expect(strict.head()).toEqual(head);
    expect(verifyPopulationIntegrity(strict)).toEqual([]);
    await strict.close();
    const verified = await must(
      CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
    );
    expect(
      (
        await must(
          new TemporalCoordinator(verified.store, providers, populationBarrierEvaluator).advance(
            request,
          ),
        )
      ).replayed,
    ).toBe(true);
    expect(verified.store.head()).toEqual(head);
    await verified.close();
  });
});

describe("A01 preserves pre-S-4 records and post-S-4 seeds independently", () => {
  // Captured by the disposable baseline source investigation, before any implementation edits.
  const golden = {
    ordinary: [
      "6101bfd0fcd5ac37887f19853400b7dabd3f3e397381d544b9901de8e545df91",
      "dfbd13d02efeaa703922eefcc97a3eec400ea176bbb7029608f45314a96de819",
    ],
    pcb: [
      "710e868d55b2882cc7656b5e4989be194ee0b47db3869a3281081ec0c50bbced",
      "76eecf5e73f095143d8fe3d96ed7ffb5b6c380f4cc52017404b3c31fe0dabc8a",
    ],
    interrupted: [
      "793fd9f8eb36783193e1e99f5fa119d7e51fac62ba072b53acaa4dc2ded7fee6",
      "6528409b884cfdb634e188c458011e58c1bcce72c121e9b80d6aba1b989666ed",
    ],
  };
  for (const mode of ["ordinary", "pcb", "interrupted"] as const) {
    it(`preserves the retained pre-S-4 ${mode} package and every original receipt without re-citing or backfilling`, async () => {
      const dir = tempDir();
      cpSync(join(import.meta.dirname, "../fixtures/r02-a01-pre-s4", mode), dir, {
        recursive: true,
      });
      mkdirSync(join(dir, "history"), { recursive: true });
      const journal = readFileSync(join(dir, "journal.jsonl"));
      const entries = entriesOf(dir);
      const c = await must(
        CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
      );
      expect([c.store.head().state_sha256, c.store.head().journal_head_sha256]).toEqual(
        golden[mode],
      );
      expect(c.verify()).toEqual([]);
      expect(c.standingInstructionLedger(c.binding()!.value.active_pc.entity_id)).toBeUndefined();
      for (const e of entries) expect(c.store.lookupReceipt(e.group.intent_id)).toEqual(e.receipt);
      await c.close();
      expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journal);
      const re = await must(
        CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
      );
      expect([re.store.head().state_sha256, re.store.head().journal_head_sha256]).toEqual(
        golden[mode],
      );
      if (mode === "interrupted") {
        const resumed = await must(
          popCoordinator(re.store).advance(advanceToRequest("tx-baseline-interrupted", POP_TP)),
        );
        expect(resumed.adopted).toContainEqual(popClose1Object().dependencies[0]!.stage);
        expect(re.store.getFact(ledgerKey)!.version).toBe(2);
        expect(re.verify()).toEqual([]);
      }
      await re.close();
    });
  }

  // Independently measured on pristine merged main bdc46e7: S-4 adds a ledger and cites its binding rule.
  // These new-seed identities do not replace the old goldens checked against retained packages above.
  // F-014B A0 (declared re-pin): a NEW campaign's journal head commits to the build's spec identity (file-package.ts passes
  // `spec_lock_sha256` into the genesis), and A0's two additive lock rows changed that identity. The canonical STATE hashes below are
  // exactly the ones measured on main (the seeds' state is unchanged); only the three journal heads were re-measured at the A0 head.
  // The retained pre-S-4 packages above are old journals and keep their original goldens.
  const currentGolden = {
    ordinary: [
      "ed7f4c62d0e4958b89cce8800d46125fc06eed81110636dd1ef3c8ed5f93db8e",
      "261749e43b43c759c900a8d1f0f45b2b1432752ebed9802bf32ce54ff790d43f",
    ],
    pcb: [
      "8a5a1de9c255d364117c9576aba2ad6af0d2849c49f6a46a0183be34409cd028",
      "258dfaa591df832be84a91a90d772f7234464e0e9dfaeafe1576c1a01c450d71",
    ],
    interrupted: [
      "b863a5e1945c9ae735cc30daa88580b0edd8aa3d067f7f0b945f90acc5b22507",
      "335308c1abbf96c9f01e111b16a8ad6e61525640d001f232507f71028473daea",
    ],
  };
  for (const mode of ["ordinary", "pcb", "interrupted"] as const) {
    it(`keeps the post-S-4 ${mode} seed identical to pristine merged main`, async () => {
      const dir = tempDir(),
        s = mode === "pcb" ? await seededPendingConsumer(dir) : await seededPopulationCampaign(dir);
      if (mode === "interrupted") {
        const store = s.campaign.store;
        const interrupted = new Proxy(store, {
          get(target, key) {
            if (key === "commit")
              return async (group: CommitGroup) => {
                const result = await target.commit(group);
                if (group.owner === OWNER_POPULATION && result.ok)
                  throw new Error("interrupted after Population commit");
                return result;
              };
            const value: unknown = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        await expect(
          popCoordinator(interrupted).advance(advanceToRequest("tx-baseline-interrupted", POP_TP)),
        ).rejects.toThrow("interrupted after Population commit");
      } else
        await must(
          s.coordinator.advance(
            advanceToRequest(
              mode === "pcb" ? "tx-consumer-1" : "tx-baseline-ordinary",
              mode === "pcb" ? POP_TC : POP_TP,
            ),
          ),
        );
      const head = s.campaign.store.head();
      expect([head.state_sha256, head.journal_head_sha256]).toEqual(currentGolden[mode]);
      expect(s.campaign.verify()).toEqual([]);
      const entries = entriesOf(dir),
        journal = readFileSync(join(dir, "journal.jsonl"));
      await s.campaign.close();
      const re = await must(
        CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
      );
      for (const e of entries) expect(re.store.lookupReceipt(e.group.intent_id)).toEqual(e.receipt);
      expect(re.store.head().state_sha256).toBe(head.state_sha256);
      if (mode === "interrupted") {
        const recovered = await must(
          popCoordinator(re.store).advance(advanceToRequest("tx-baseline-interrupted", POP_TP)),
        );
        expect(recovered.adopted).toContainEqual(popClose1Object().dependencies[0]!.stage);
        expect(re.store.getFact(ledgerKey)!.version).toBe(2);
      } else expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journal);
      await re.close();
    });
  }
});

const entriesOf = (dir: string): JournalEntry[] =>
  readFileSync(join(dir, "journal.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s) as JournalEntry);

/** Reconstruct an earlier policy's package, with real groups/receipts and optional bounded corruption. */
async function oldPolicyCopy(source: string, badFirstClose: boolean, checkpoint: boolean) {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "pop-seed",
      owners: new Map([...CANONICAL_OWNER_REGISTRY, ...POPULATION_FIXTURE_EXTENSION.owners]),
      admission: {
        historyVerificationId: OLD_POLICY,
        check: () => null,
        verifyHistorical: () => null,
      },
    }),
  );
  const renamed = new Map<string, string>();
  let changed = false;
  for (const e of entriesOf(source)) {
    let text = JSON.stringify(e.group);
    for (const [old, next] of renamed) text = text.replaceAll(old, next);
    let group = JSON.parse(text) as CommitGroup;
    if (
      badFirstClose &&
      !changed &&
      group.owner === OWNER_POPULATION &&
      group.writes.some((w) => w.key === populationCloseKey(LEDGER_MAIN))
    ) {
      group = { ...group, cause: "transaction:ghost" };
      changed = true;
    }
    const { receipt } = await must(store.commit(group));
    renamed.set(e.receipt.group_sha256, receipt.group_sha256);
  }
  if (checkpoint)
    for (let i = 0; i < 130; i++) await commitRegister(store, 1000 + i, [], LEDGER_OTHER);
  const head = store.head(),
    facts = store.listFacts();
  await store.close();
  return { dir, head, facts };
}

describe("A01 historical authority is checked at each incremental pre-state", () => {
  it("fails closed when a loaded Population history has no owner-rule verification evidence", async () => {
    const dir = tempDir(),
      s = await seededPopulationCampaign(dir);
    await must(s.coordinator.advance(advanceToRequest("tx-unverified", POP_TP)));
    await s.campaign.close();
    const store = await must(openFileCampaign(dir, { audit: true }));
    expect(
      verifyPopulationIntegrity(store).some((v) =>
        v.message.includes("no current historical-verification or admission evidence"),
      ),
    ).toBe(true);
    await store.close();
  });

  it("continues a held same-basis Population boundary across restart, strict replay and verified reopen", async () => {
    const dir = tempDir(),
      s = await seededPopulationCampaign(dir);
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    await commitRegister(s.campaign.store, 10, [PENDING_ENVELOPE()]);
    const request = advanceToRequest("tx-held", POP_TC);
    const held = await must(s.coordinator.advance(request));
    expect(held.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    await s.campaign.close();
    const re = await must(CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }));
    await commitCriterion(re.store, 11, POP_TC, ["u-1", "u-3", "u-5"]);
    const continuing = { ...request, transaction_id: "tx-continued", continues: "tx-held" };
    const done = await must(popCoordinator(re.store).advance(continuing));
    expect(done.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(re.store.getFact(ledgerKey)!.version).toBe(3);
    const head = re.store.head();
    await re.close();
    const strict = await must(
      openFileCampaign(dir, { audit: true, admission: canonicalAdmission }),
    );
    expect(strict.head()).toEqual(head);
    expect(verifyPopulationIntegrity(strict)).toEqual([]);
    await strict.close();
    const verified = await must(
      CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION }),
    );
    expect((await must(popCoordinator(verified.store).advance(continuing))).replayed).toBe(true);
    expect(verified.store.head()).toEqual(head);
    expect(verified.verify()).toEqual([]);
    await verified.close();
  });

  for (const checkpoint of [false, true]) {
    it(`refuses an earlier bad close hidden by a later lawful PCB-01 close (${checkpoint ? "checkpoint" : "strict journal"})`, async () => {
      const original = tempDir(),
        s = await seededPendingConsumer(original);
      await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
      await s.campaign.close();
      const saved = await oldPolicyCopy(original, true, checkpoint);
      expect(
        saved.facts.find((f) => f.key === populationCloseKey(LEDGER_MAIN))!.provenance.cause,
      ).toBe("transaction:tx-consumer-1");
      const before = snapshotDir(saved.dir);
      const r = await CanonicalCampaign.open(saved.dir, {
        extension: POPULATION_FIXTURE_EXTENSION,
      });
      if (r.ok) await r.value.close();
      expect(r).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
      expect(snapshotDir(saved.dir)).toEqual(before);
    });
  }

  it("changes the historical policy identity and preserves lawful old checkpoint facts, journal bytes, digests and every original receipt", async () => {
    expect(canonicalAdmission.historyVerificationId).not.toBe(OLD_POLICY);
    const original = tempDir(),
      s = await seededPendingConsumer(original);
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    await s.campaign.close();
    const saved = await oldPolicyCopy(original, false, true),
      entries = entriesOf(saved.dir);
    const journal = readFileSync(join(saved.dir, "journal.jsonl"));
    for (const audit of [false, true, false]) {
      const store = await must(
        openFileCampaign(saved.dir, { admission: canonicalAdmission, audit }),
      );
      expect(store.head()).toEqual(saved.head);
      expect(store.listFacts()).toEqual(saved.facts);
      expect(verifyPopulationIntegrity(store)).toEqual([]);
      for (const e of entries) expect(store.lookupReceipt(e.group.intent_id)).toEqual(e.receipt);
      const stage = entries.find(
        (e) =>
          e.group.owner === OWNER_POPULATION &&
          e.group.writes.some((w) => w.key === populationCloseKey(LEDGER_MAIN)),
      )!;
      expect(await must(store.commit(stage.group))).toEqual({
        receipt: stage.receipt,
        replayed: true,
      });
      await store.close();
      expect(readFileSync(join(saved.dir, "journal.jsonl"))).toEqual(journal);
    }
    const re = await must(
      CanonicalCampaign.open(saved.dir, { extension: POPULATION_FIXTURE_EXTENSION }),
    );
    expect(re.verify()).toEqual([]);
    await re.close();
  }, 30_000);
});
