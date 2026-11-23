/* eslint-disable @typescript-eslint/no-explicit-any -- a seal value, a group and a refusal are edited and read field by field */
// F-014B B2-T01 / T04 / T06 / T09 (negatives that the lifecycle suites leave to the mutation record) — each case is the accepted lawful control with ONE
// change, every refusal changes nothing, and each is attributed to the rule that must speak. SCRIPTED TESTKIT MECHANISM ONLY.
//   1. a GM seal repeats EXACTLY what its own durable GM opening opened: one compared field changed at a time;
//   2. a NO_OPEN is valid only if it READS the opening and the seal at version 0: the witnesses that make it race-safe;
//   3. a package that holds custody opens writable only under an admission that carries the W2 verifier, in the legacy (v1) loader as in the checkpoint one.
import { describe, expect, it } from "vitest";
import {
  temporalGmWaitByPcKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  buildNoOpenGroup,
  buildSealGroup,
  factKind,
  openFileCampaign,
  storeBindings,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  FIXTURE_PC_ID,
  foreignGroup,
  manifestOf,
  SYNTH_EXTENSION,
  copyPackage,
  lifecycle,
  lowerToV1,
  must,
  seededRig,
  tempDir,
  txOf,
} from "./b2-support.ts";
import { stampCheckpointPolicy } from "../support/b1-s1-rigs.ts";

/** A snapshot that a refusal must leave exactly as it found it. */
const witness = (store: CampaignStore) => ({
  head: store.head(),
  facts: JSON.stringify(store.listFacts()),
});
const reasonOf = (r: { ok: boolean; error?: { details?: unknown } }): string | undefined =>
  (r.error?.details as { reason?: string } | undefined)?.reason;

const edit = (g: CommitGroup, x: string, f: (v: any, w: any) => void): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== temporalTransactionKey(txOf(x))) return w;
    const value = JSON.parse(JSON.stringify(w.value));
    const copy: any = { ...w, value };
    f(value, copy);
    return copy;
  }),
});

describe("B2-T01 a GM seal that departs from its opening in any compared field is refused", () => {
  const cases: readonly [string, (v: any, w: any) => void][] = [
    ["the trigger reference", (v) => (v.trigger.ref = `${v.trigger.ref}-x`)],
    ["the cause", (v) => (v.cause = `${v.cause}-x`)],
    ["the opening state version", (v) => (v.opening.state_version += 1)],
    ["the opening basis time", (v) => (v.opening.basis_time.value += 1)],
    [
      "the requested target (the stop is moved with it, so the value stays internally consistent)",
      (v) => {
        v.requested.target.value += 1;
        v.outcome.actual_stop.value += 1;
      },
    ],
    ["the publication basis of the seal write", (_v, w) => (w.basis = "another-basis")],
    ["the publication secrecy of the seal write", (_v, w) => (w.secrecy = "another-visibility")],
  ];
  for (const [name, change] of cases)
    it(`${name}`, async () => {
      const rig = await seededRig(tempDir());
      const { x } = await lifecycle(rig, "open");
      const seal = buildSealGroup(
        { get: (k) => rig.store.getFact(k) },
        x,
        factKind("temporal_state").rule,
      );
      if (!seal.ok) throw new Error(JSON.stringify(seal.error));
      const before = witness(rig.store);
      const r = await rig.store.commit(edit(seal.value, x, change));
      expect(r.ok, name).toBe(false);
      // the custody rule of the seal speaks, not a structural one: the group is a complete, well-shaped GM seal that merely departs from its opening
      expect(reasonOf(r as any), name).toBe("GM_WAIT_SEAL");
      expect(witness(rig.store)).toEqual(before);
      // control: the unedited seal IS admitted afterwards
      await must(rig.store.commit(seal.value));
    });
});

describe("B2-T04 a NO_OPEN carries its race-safe witnesses", () => {
  const lawful = async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "marker");
    const built = buildNoOpenGroup(
      { get: (k) => rig.store.getFact(k) },
      x,
      rig.store.head().revision,
    );
    if (!built.ok) throw new Error(JSON.stringify(built.error));
    return { rig, x, group: built.value };
  };
  const authorityKey = (x: string) => `temporal/transaction-authority/${txOf(x)}`;
  const sealKey = (x: string) => temporalTransactionKey(txOf(x));

  it("[control] the lawful NO_OPEN reads the opening and the seal at version 0 and is admitted through the writer", async () => {
    const { rig, x, group } = await lawful();
    expect(group.reads).toEqual(
      expect.arrayContaining([
        { key: authorityKey(x), version: 0 },
        { key: sealKey(x), version: 0 },
      ]),
    );
    await must(rig.custody.markNoOpen(rig.proof));
    expect((rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.value as any).state).toBe(
      "NO_OPEN",
    );
  });

  for (const [name, drop] of [
    ["the opening", (x: string) => authorityKey(x)],
    ["the seal", (x: string) => sealKey(x)],
  ] as const)
    it(`a NO_OPEN that does not read ${name} at version 0 is refused by the witness rule (not merely for want of a proof)`, async () => {
      const { rig, x, group } = await lawful();
      const weakened: CommitGroup = {
        ...group,
        reads: group.reads.filter((r) => r.key !== drop(x)),
      };
      const before = witness(rig.store);
      const r = await rig.store.commit(weakened);
      expect(r.ok).toBe(false);
      expect(reasonOf(r as any)).toBe("GM_WAIT_WITNESS");
      expect(witness(rig.store)).toEqual(before);
    });
});

describe("B2-T06 a package that holds custody opens writable only under the W2 admission, in the legacy loader too", () => {
  it("the v1 loader refuses a custody-holding package under an admission without the verifier, and opens it under the W2 admission (control)", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "reconcile");
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    lowerToV1(dir);
    const bindings = storeBindings(SYNTH_EXTENSION, FIXTURE_ADMISSION);
    if (!bindings.ok) throw new Error(JSON.stringify(bindings.error));
    const without = await openFileCampaign(copyPackage(dir), {
      buildId: "b2-v1-without",
      owners: bindings.value.owners,
      admission: { check: () => null, verifyHistorical: () => null },
    });
    expect(without.ok).toBe(false);
    if (!without.ok) expect(without.error.code).toBe("PROTECTED_STORE_REQUIRES_ADMISSION");
    const withIt = await openFileCampaign(copyPackage(dir), {
      buildId: "b2-v1-with",
      owners: bindings.value.owners,
      admission: bindings.value.admission,
    });
    expect(withIt.ok, JSON.stringify(withIt.ok ? null : withIt.error)).toBe(true);
    if (withIt.ok) await withIt.value.close();
  });

  it("a checkpoint re-stamped with the identity of an admission that LACKS the verifier is trusted warm, and the post-replay check still refuses to open the custody-holding store writable", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "reconcile");
    const custodyRevision = rig.store.head().revision;
    // pad past the checkpoint interval, so the checkpoint covers the whole custody lifecycle and the warm tail holds none of it
    for (let n = 0; n < 130; n++) await must(rig.store.commit(foreignGroup(n)));
    await rig.campaign.close();
    expect(manifestOf(rig.dir).head.checkpoint.revision).toBeGreaterThan(custodyRevision);
    const downgraded = copyPackage(rig.dir);
    // an attacker with file access and a build without the W2 verifier re-seals the manifest under that build's own identity, so the open is NOT a
    // policy transition (no forced strict replay) and every custody entry lies BEFORE the checkpoint (no tail entry for the per-entry refusal to meet)
    const identity = "b2-downgraded-admission";
    stampCheckpointPolicy(downgraded, identity);
    const bindings = storeBindings(SYNTH_EXTENSION, FIXTURE_ADMISSION);
    if (!bindings.ok) throw new Error(JSON.stringify(bindings.error));
    const opened = await openFileCampaign(downgraded, {
      buildId: "b2-downgraded",
      owners: bindings.value.owners,
      admission: {
        historyVerificationId: identity,
        check: () => null,
        verifyHistorical: () => null,
      },
    });
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.error.code).toBe("PROTECTED_STORE_REQUIRES_ADMISSION");
    // control: the same package, not re-stamped, opens under the real admission
    const control = await openFileCampaign(copyPackage(rig.dir), {
      buildId: "b2-control",
      owners: bindings.value.owners,
      admission: bindings.value.admission,
    });
    expect(control.ok, JSON.stringify(control.ok ? null : control.error)).toBe(true);
    if (control.ok) await control.value.close();
  });
});
