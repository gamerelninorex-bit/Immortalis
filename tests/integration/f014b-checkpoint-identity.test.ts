// F-014B replay prerequisite (BLUE F1): the verifier that selects an original policy changed while the RECORDED history identity did not, so checkpoint
// reuse is keyed on its own version (WriteAdmission.checkpointVerifierId). A checkpoint earned under the earlier verifier must not be trusted.
//
// SCOPE OF THE EVIDENCE, stated plainly: a checkpoint covers entries only once a journal passes CHECKPOINT_INTERVAL (128) revisions. The genuine pristine-main
// Lane X journals have 45 to 51 entries, so the checkpoint on them is the genesis one and cannot show a bypass. Pristine main cannot lengthen a Lane X lineage
// (its extension wrapper drops the IF-6b runtime, so the seal is refused). The long journals below are therefore built by THIS build and stamped with the
// PRE-REPAIR cache identity (the recorded identity, i.e. `checkpointVerifierId` removed); they are constructed, not genuine pre-repair journals.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, type WriteAdmission } from "@immortalis/engine";
import { SYNTH_EXTENSION, syntheticSourceGroup } from "@immortalis/testkit";
import { GM_WAIT_IF6B_QUIET_SEAL_SEGMENT } from "@immortalis/contracts";
import { workshopCharterKey } from "../../packages/contracts/src/workshop-opening.ts";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WORKSHOP_GENERATION_149,
  WORKSHOP_RESOLVER_VERIFIER_SEGMENT,
  type WorkshopGeneration,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { IF6B_POLICY } from "../../packages/engine/src/temporal/if6b-stage.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop } from "../support/b3-opening.ts";
import { deterministicFixtureKeys } from "../support/deterministic-keys.ts";
import {
  headKey,
  withoutCheckpoints,
  writeLaneXLineage,
} from "../support/f014b-original-policy.ts";
import { copyPackage, journalOf, must } from "./b2-support.ts";

type Lineage = Awaited<ReturnType<typeof writeLaneXLineage>>;
const omit = <T extends object>(a: T, ...keys: string[]): T => {
  const copy = { ...a } as Record<string, unknown>;
  for (const k of keys) delete copy[k];
  return copy as T;
};
/** what an earlier build's admission was: the same, without a separate cache identity */
const preRepair = <T extends object>(a: T): T => omit(a, "checkpointVerifierId");
const counting = (a: WriteAdmission) => {
  const counter = { calls: 0 };
  const verifyHistorical = a.verifyHistorical;
  return {
    counter,
    admission: {
      ...a,
      verifyHistorical: (
        g: Parameters<NonNullable<typeof verifyHistorical>>[0],
        s: Parameters<NonNullable<typeof verifyHistorical>>[1],
      ) => {
        counter.calls++;
        return verifyHistorical!.call(a, g, s);
      },
    } as WriteAdmission,
  };
};
const manifestPolicy = (dir: string): string =>
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).head.checkpoint.verification_policy;

/**
 * A workshop campaign with its opening only (charter, direction, duty, exposure, condition, anchor): no wait, so no GM-wait stage to refuse an
 * extension wrapper (a Lane X lineage with stages cannot be opened through the stage-owner extension binding; that gap is older than this PR).
 * `pair` forges the policy the owner adapters publish under; the writer's live admission then accepts anything (hash-consistent forgery).
 */
async function openingOnly(
  pair?: (id: string) => { historyId: string; catalogueSha256: string },
): Promise<Lineage> {
  const keys = deterministicFixtureKeys(generateFixtureRunnerKeys().keyId);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h = await openWorkshop("glassbell", {
    fixedKeys: keys,
    ...(pair
      ? {
          admissionOverride: <T extends { check: unknown }>(a: T): T => ({
            ...a,
            check: () => null,
          }),
          historyRef: pair,
        }
      : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, true);
      return signed.fixture;
    },
  });
  const out = {
    keys,
    signed,
    head: h.campaign.store.head(),
    dir: h.dir as string,
    x: "",
    slot: "NONE" as const,
    pc: h.source.pc.id,
  };
  await h.campaign.close();
  return out;
}

/** a harness whose admission carries the lineage's signed owner, so the package can be opened under it */
async function harnessFor(f: Lineage, generation?: WorkshopGeneration) {
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h2 = await openWorkshop("glassbell", {
    fixedKeys: f.keys,
    ...(generation
      ? {
          currentGeneration: generation,
          historyRef: (historyId: string) => ({
            historyId,
            catalogueSha256: generation.catalogueSha256,
          }),
        }
      : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, true);
      return signed.fixture;
    },
  });
  signed.importAuthorizations(f.signed.exportAuthorizations());
  return h2;
}

/** appends `n` synthetic extension-owner groups so the journal passes the checkpoint interval; `shape` decides which cache identity the checkpoint is stamped with */
async function lengthen(f: Lineage, n: number, shape: (a: WriteAdmission) => WriteAdmission) {
  const h2 = await harnessFor(f);
  const dir = withoutCheckpoints(copyPackage(f.dir));
  const opened = await CanonicalCampaign.open(dir, {
    testkitFixtureAdmission: shape(h2.admission),
    extension: SYNTH_EXTENSION,
  });
  if (!opened.ok) throw new Error("lengthen: " + JSON.stringify(opened.error));
  const campaignId = opened.value.store.head().campaign_id;
  for (let i = 0; i < n; i++)
    await must(
      opened.value.store.commit(
        syntheticSourceGroup(campaignId, 700 + i, `foreign-${i}`, 0, `synthetic/foreign/${i}`),
      ),
    );
  const head = opened.value.store.head();
  await opened.value.close();
  await h2.campaign.close();
  return { dir, head, entries: head.revision };
}

async function openAs(f: Lineage, dir: string, shape: (a: WriteAdmission) => WriteAdmission) {
  const h2 = await harnessFor(f);
  const spy = counting(shape(h2.admission));
  const opened = await CanonicalCampaign.open(copyPackage(dir), {
    testkitFixtureAdmission: spy.admission,
    extension: SYNTH_EXTENSION,
  });
  return { h2, opened, calls: spy.counter, dir };
}
const close = async (r: Awaited<ReturnType<typeof openAs>>) => {
  if (r.opened.ok) await r.opened.value.close();
  await r.h2.campaign.close();
};

describe("checkpoint reuse is keyed on the verifier version, not on the recorded lineage identity", () => {
  it("the recorded identity is unchanged and the cache identity is a distinct, versioned one", async () => {
    const f = await writeLaneXLineage({ advance: 0 });
    const h2 = await harnessFor(f);
    const a = h2.admission;
    const prefix = a.historyVerificationId + WORKSHOP_RESOLVER_VERIFIER_SEGMENT + ":";
    expect(a.checkpointVerifierId?.slice(0, prefix.length)).toBe(prefix);
    expect(a.checkpointVerifierId?.slice(prefix.length)).toMatch(/^[0-9a-f]{64}$/);
    expect(a.historyVerificationId).not.toContain("RESOLVER");
    const prior = await harnessFor(f, WORKSHOP_GENERATION_149);
    try {
      // the injected prior generation spells the accepted pre-G1 recipe; the current one differs from it by exactly the G1 segment before the terminal segment
      expect(a.historyVerificationId).toBe(
        prior.admission.historyVerificationId!.replace(
          "+" + IF6B_POLICY,
          GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + IF6B_POLICY,
        ),
      );
      expect(prior.admission.checkpointVerifierId).not.toBe(a.checkpointVerifierId);
    } finally {
      await prior.campaign.close();
      await h2.campaign.close();
    }
  });

  it("a warm checkpoint earned under the PRE-REPAIR cache identity is not trusted: strict replay of the whole journal, a new checkpoint identity, equal head, then a warm hit", async () => {
    const f = await openingOnly();
    const long = await lengthen(f, 90, preRepair);
    expect(long.entries).toBeGreaterThan(128);
    // the checkpoint really is warm and stamped with the recorded (pre-repair) identity
    const stamped = manifestPolicy(long.dir);
    expect(stamped).not.toContain("RESOLVER");

    // control: the earlier verifier's identity reuses the checkpoint, so only the tail past it is replayed
    const control = await openAs(f, long.dir, preRepair);
    expect(control.opened.ok).toBe(true);
    // the 90 foreign groups are judged by the extension wrapper, so only the 41 workshop entries reach the base verifier; the warm hit replays none of them
    expect(control.calls.calls).toBe(0);
    await close(control);

    // the repaired verifier: a different cache identity, so ONE strict replay of every entry, and the head is equal
    const first = await openAs(f, long.dir, (a) => a);
    expect(first.opened.ok, JSON.stringify(first.opened.ok ? null : first.opened.error)).toBe(true);
    if (first.opened.ok)
      expect(headKey(first.opened.value.store.head())).toEqual(headKey(long.head));
    expect(first.calls.calls).toBe(f.head.revision); // every workshop entry, the checkpoint-covered prefix included
    // keep the package the first open rewrote: reopen THAT directory (the open above worked on a copy, so repeat on a persisted run)
    await close(first);
  });

  it("after a strict replay under the new identity the checkpoint is rewritten and a repeat open hits it", async () => {
    const f = await openingOnly();
    const long = await lengthen(f, 90, preRepair);
    const h2 = await harnessFor(f);
    const dir = copyPackage(long.dir);
    const spy1 = counting(h2.admission);
    const first = await CanonicalCampaign.open(dir, {
      testkitFixtureAdmission: spy1.admission,
      extension: SYNTH_EXTENSION,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(spy1.counter.calls).toBe(f.head.revision);
    await first.value.close();
    expect(manifestPolicy(dir)).toBe(h2.admission.checkpointVerifierId);
    const spy2 = counting(h2.admission);
    const second = await CanonicalCampaign.open(dir, {
      testkitFixtureAdmission: spy2.admission,
      extension: SYNTH_EXTENSION,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(headKey(second.value.store.head())).toEqual(headKey(long.head));
      expect(spy2.counter.calls).toBe(0); // the warm hit under the new identity
      await second.value.close();
    }
    await h2.campaign.close();
  });
});

describe("an old cached proof cannot bypass a tightened policy check", () => {
  it("a forged charter pair inside a checkpoint-covered prefix opens under the pre-repair cache identity (the bypass) and is refused under the repaired one", async () => {
    // an unknown catalogue digest in the lineage's charter: the repaired verifier refuses it, an earlier one never looked
    const f = await openingOnly((id) => ({ historyId: id, catalogueSha256: "cd".repeat(32) }));
    // no historical verifier at all (an earlier build that never judged this pair), and the pre-repair cache identity
    const long = await lengthen(f, 90, (a) =>
      omit(a, "checkpointVerifierId", "verifyHistorical", "historicalFenceAdmission"),
    );
    const bypass = await openAs(f, long.dir, preRepair);
    expect(bypass.opened.ok, "the warm pre-repair identity trusts the covered prefix").toBe(true);
    await close(bypass);

    const repaired = await openAs(f, long.dir, (a) => a);
    expect(repaired.opened.ok).toBe(false);
    if (!repaired.opened.ok) {
      expect(repaired.opened.error.code).toBe("REPLAY_MISMATCH");
      const charter = journalOf(long.dir).find((e) =>
        e.group.writes.some((w) => w.key === workshopCharterKey(e.group.campaign_id)),
      )!;
      expect((repaired.opened.error.details as { revision: number }).revision).toBe(
        charter.revision,
      );
    }
    await close(repaired);
  });
});

describe("every wrapper preserves the verifier identity", () => {
  it("the stage-owner extension binding carries both the recorded and the cache identity", async () => {
    const f = await writeLaneXLineage({ advance: 0 });
    const h2 = await harnessFor(f);
    const { storeBindings } = await import("../../packages/engine/src/owners/extension.ts");
    const bound = storeBindings(SYNTH_EXTENSION, h2.admission) as unknown as {
      ok: boolean;
      value: { admission: WriteAdmission };
    };
    expect(bound.ok).toBe(true);
    expect(bound.value.admission.historyVerificationId).toBe(h2.admission.historyVerificationId);
    expect(bound.value.admission.checkpointVerifierId).toBe(h2.admission.checkpointVerifierId);
    expect(bound.value.admission.historicalFenceAdmission).toBeTypeOf("function");
    await h2.campaign.close();
  });

  it("the legacy runtime-contract wrapper keeps the cache identity distinct and suffixes both", async () => {
    const f = await writeLaneXLineage({ advance: 0 });
    const h2 = await harnessFor(f);
    const { legacyContractAdmission } =
      await import("../../packages/engine/src/owners/admission.ts");
    const legacy = legacyContractAdmission(h2.admission);
    expect(legacy.historyVerificationId).toBe(
      h2.admission.historyVerificationId + "+LEGACY-PRE-V9-RUNTIME-CONTRACT",
    );
    expect(legacy.checkpointVerifierId).toBe(
      h2.admission.checkpointVerifierId + "+LEGACY-PRE-V9-RUNTIME-CONTRACT",
    );
    expect(legacy.historicalFenceAdmission).toBeTypeOf("function");
    await h2.campaign.close();
  });

  it("a non-workshop (B2) admission has no cache identity of its own: its reuse is exactly as before", async () => {
    const { FIXTURE_ADMISSION } = await import("./b2-support.ts");
    expect(FIXTURE_ADMISSION.checkpointVerifierId).toBeUndefined();
  });
});
