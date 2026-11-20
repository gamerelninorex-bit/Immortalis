// F-014B A0 (CAL-TIME T-1; BLUE S11 Q2) — the successor history-verification identity. T1 MECHANISM ONLY.
//
// The paired-genesis, arm / route / rule and MS clock-step / B2 / SEALED-history checks are new HISTORICAL validators, so a checkpoint
// earned under the previous identity must never be trusted: the first open under the new identity judges EVERY committed group strictly,
// once, and records the new identity. The old MS suffix literal is retained; two distinguishable segments are appended after
// `+POPULATION-STAGE-AUTHORITY-V2`; the production, MS, fixture, legacy and extension identities all change through the one base.
//
// A0-T15. (A0-T16, the legacy controls, is clock-origin-controls.test.ts.)
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import {
  CAL_TIME_T1_HISTORY_POLICY_SEGMENT,
  CanonicalCampaign,
  FREIGHT_HISTORY_POLICY_SUFFIX,
  MS_HISTORY_POLICY_SUFFIX,
  MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT,
  PC_LEDGER_HISTORY_POLICY_SUFFIX,
  canonicalAdmission,
  fixtureCanonicalAdmission,
  fixtureMsCanonicalAdmission,
  legacyContractAdmission,
  msCanonicalAdmission,
  sha256Canonical,
  storeBindings,
} from "@immortalis/engine";
import { PRODUCTION_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { CheckpointManifestSchema } from "../../packages/engine/src/persistence/checkpoint-package.ts";
import { harness } from "../support/initial-setup.ts";
import { admitInput } from "../support/clock-origin.ts";
import { countReplays } from "../support/policy-transition.ts";
import { must } from "../support/temporal.ts";

const BASE =
  "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1";
const A01 = "+POPULATION-STAGE-AUTHORITY-V2";
/** the exact segments this slice appends (pinned here and, as the lowering row's values, by tools/check-spec.ts) */
const T1_SEGMENT = "+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z";
const MS_SEGMENT = "+MS-V3-CLOCK-STEP-B2-ORIGIN";
/** the composition of the previous identity (main 8d25f90), as it was before this slice */
const previous = (suffix = "") =>
  `${BASE}${suffix}${MS_HISTORY_POLICY_SUFFIX}${FREIGHT_HISTORY_POLICY_SUFFIX}${PC_LEDGER_HISTORY_POLICY_SUFFIX}${A01}`;

const manifestOf = (dir: string) =>
  CheckpointManifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
/** Rewrites the checkpoint's recorded verification policy and re-seals the manifest, exactly as an older build would have left it. */
function earnedUnder(dir: string, policy: string): void {
  const m = manifestOf(dir);
  m.head.checkpoint.verification_policy = policy;
  const { self_sha256: old, ...body } = m;
  void old;
  writeFileSync(
    join(dir, "manifest.json"),
    `${canonicalJson({ ...body, self_sha256: sha256Canonical(body) })}\n`,
  );
}
const campaignOf = (r: Awaited<ReturnType<typeof CanonicalCampaign.open>>): CanonicalCampaign => {
  if (!r.ok) throw new Error(`did not open: ${JSON.stringify(r.error)}`);
  return r.value;
};

describe("A0-T15: the composed identity", () => {
  it("the segments are exactly the pinned spellings, the old MS suffix literal is retained, and they sit after the A01 suffix", () => {
    expect(CAL_TIME_T1_HISTORY_POLICY_SEGMENT).toBe(T1_SEGMENT);
    expect(MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT).toBe(MS_SEGMENT);
    expect(MS_HISTORY_POLICY_SUFFIX).toBe(
      "+MS-SETUP-V08@2026-11-09T00:43:08.394Z+MS_ACTOR_PARSER_V1",
    );
    expect(canonicalAdmission.historyVerificationId).toBe(
      `${previous()}${T1_SEGMENT}${MS_SEGMENT}`,
    );
    expect(canonicalAdmission.historyVerificationId).not.toBe(previous());
  });

  it("the MS, fixture and fixture-MS identities change together, each keeping its own suffix in place", () => {
    const binding = { key_id: "k", public_key: "p", driver_id: "d", driver_config_hash: "h" };
    expect(msCanonicalAdmission(binding).historyVerificationId).toBe(
      canonicalAdmission.historyVerificationId,
    );
    expect(fixtureCanonicalAdmission.historyVerificationId).toBe(
      `${previous("+fixture-evidence-t1")}${T1_SEGMENT}${MS_SEGMENT}`,
    );
    expect(fixtureMsCanonicalAdmission(binding).historyVerificationId).toBe(
      fixtureCanonicalAdmission.historyVerificationId,
    );
    // the fixture identity can never be the production identity
    expect(fixtureCanonicalAdmission.historyVerificationId).not.toBe(
      canonicalAdmission.historyVerificationId,
    );
  });

  it("the legacy wrapper and the extension wrapper derive their changed identities through the base", () => {
    for (const admission of [canonicalAdmission, fixtureCanonicalAdmission]) {
      expect(legacyContractAdmission(admission).historyVerificationId).toBe(
        `${admission.historyVerificationId}+LEGACY-PRE-V9-RUNTIME-CONTRACT`,
      );
      expect(legacyContractAdmission(admission).historyVerificationId).toContain(
        `${T1_SEGMENT}${MS_SEGMENT}+LEGACY-PRE-V9-RUNTIME-CONTRACT`,
      );
    }
    const extended = must_(storeBindings(PRODUCTION_FIXTURE_EXTENSION));
    expect(extended.admission.historyVerificationId).toBe(canonicalAdmission.historyVerificationId);
    const extendedFixture = must_(
      storeBindings(PRODUCTION_FIXTURE_EXTENSION, fixtureCanonicalAdmission),
    );
    expect(extendedFixture.admission.historyVerificationId).toBe(
      fixtureCanonicalAdmission.historyVerificationId,
    );
  });
});
function must_<T>(r: { ok: boolean; value?: T; error?: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value as T;
}

describe("A0-T15: the identity transition", () => {
  it("a checkpoint earned under the previous identity is never trusted: every group of a v2 package is re-judged strictly, once, then re-stamped", async () => {
    const h = await harness();
    const admitted = await admitInput(h);
    expect(admitted.ok).toBe(true);
    expect((await h.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
    const { initializeCapturedChronology } = await import("@immortalis/engine");
    await must(initializeCapturedChronology(h.store, { policy: { syntheticEvidence: "REQUIRE" } }));
    const groups = h.store.head().journal_entries;
    await h.campaign.close();
    const dir = h.dir;
    const current = fixtureCanonicalAdmission.historyVerificationId!;
    earnedUnder(dir, previous("+fixture-evidence-t1"));
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(
      previous("+fixture-evidence-t1"),
    );
    const opened = await countReplays(() =>
      CanonicalCampaign.open(dir, { testkitFixtureAdmission: fixtureCanonicalAdmission }),
    );
    const c = campaignOf(opened.result);
    expect(opened.entries).toBe(groups);
    expect(c.verify()).toEqual([]);
    await c.close();
    // the successor evidence names the new identity, so the NEXT open trusts it again
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(current);
    const again = await countReplays(() =>
      CanonicalCampaign.open(dir, { testkitFixtureAdmission: fixtureCanonicalAdmission }),
    );
    await campaignOf(again.result).close();
    expect(again.entries).toBe(0);
  });

  it("a pre-v0.9 legacy package from the exact base replays strictly under its changed derived identity, then is trusted again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "immortalis-a0-legacy-"));
    cpSync("tests/fixtures/legacy-base-eafbb127/package", dir, { recursive: true });
    mkdirSync(join(dir, "history"), { recursive: true });
    const legacyId = legacyContractAdmission(canonicalAdmission).historyVerificationId!;
    expect(legacyId).toBe(`${previous()}${T1_SEGMENT}${MS_SEGMENT}+LEGACY-PRE-V9-RUNTIME-CONTRACT`);
    expect(manifestOf(dir).head.checkpoint.verification_policy).not.toBe(legacyId);
    const journal = readFileSync(join(dir, "journal.jsonl"));
    const entries = journal.toString("utf8").split("\n").filter(Boolean).length;
    const opened = await countReplays(() => CanonicalCampaign.open(dir));
    const c = campaignOf(opened.result);
    expect(opened.entries).toBe(entries);
    expect(c.verify()).toEqual([]);
    await c.close();
    expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journal);
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(legacyId);
    const again = await countReplays(() => CanonicalCampaign.open(dir));
    await campaignOf(again.result).close();
    expect(again.entries).toBe(0);
  });
});
