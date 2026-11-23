/* eslint-disable @typescript-eslint/no-explicit-any -- raw groups, manifests and journal bytes */
// F-014B B2-T06 — cold strict journal replay of the protected interval, warm checkpoint equivalence, overwritten-index equivalence, tamper and
// forgery that must fail closed, and strict preservation of older valid history. SCRIPTED TESTKIT MECHANISM ONLY.
//
// The comparison that matters is INDEPENDENT: `activeFromJournal` below reads journal.jsonl directly and derives, per revision, whether a GM wait was
// ACTIVE from the groups alone (a GM-variant opening committed and its seal not yet). It is never given a state, an index label or a checkpoint. The
// engine's derived fence is compared with it at every revision of a strict replay, and again after the by-PC index has been OVERWRITTEN to its terminal
// state (an index label alone could not reconstruct the interval).
import { readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  temporalGmWaitByPcKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
  type JournalEntry,
} from "@immortalis/contracts";
import {
  CampaignCore,
  buildOpenGroup,
  canonicalAdmission,
  deriveGmWaitFence,
  factKind,
  verifyTemporalIntegrity,
} from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  copyPackage,
  forgeAppend,
  foreignGroup,
  journalOf,
  lifecycle,
  manifestOf,
  markerInput,
  must,
  openCounting,
  reopen,
  seededRig,
  tempDir,
  txOf,
} from "./b2-support.ts";
import { copyOf, openUnder, reopenMatrix, thaw } from "../support/b1-s1-rigs.ts";

const GM = "GM_INTERPRETED_PC_WAIT";
/** ACTIVE per revision, derived from the journal's GROUPS alone */
function activeFromJournal(entries: readonly JournalEntry[]): (string | null)[] {
  const opened = new Map<string, string>(); // authority key -> x
  const sealed = new Set<string>();
  const out: (string | null)[] = [];
  for (const e of entries) {
    for (const w of e.group.writes) {
      const v = w.value as any;
      if (w.key.startsWith("temporal/transaction-authority/") && v?.origin === GM)
        opened.set(w.key, v.x);
      if (w.key.startsWith("temporal/transaction/") && v?.origin === GM)
        sealed.add(temporalTransactionAuthorityKey(v.transaction_id));
    }
    const active = [...opened].filter(([k]) => !sealed.has(k)).map(([, x]) => x);
    out.push(active.length === 1 ? active[0]! : null);
  }
  return out;
}

/**
 * A wait opened and left ACTIVE exactly AT the revision-128 checkpoint: the marker is the 127th commit and the OPEN the 128th. No owner stage can be
 * credited while a GM wait is ACTIVE (BLUE F-1: there is no source witness for one), so the campaign cannot be advanced INSIDE the interval; the padding
 * goes BEFORE the opening, with ordinary traffic the fence does not touch until a wait is open.
 */
async function activeAcrossCheckpoint() {
  const rig = await seededRig(tempDir());
  for (let n = rig.store.head().revision; n < 126; n++)
    await must(rig.store.commit(foreignGroup(1000 + n)));
  const { x } = await lifecycle(rig, "open");
  expect(rig.store.head().revision, "the OPEN is the 128th commit").toBe(128);
  return { rig, x };
}

describe("B2-T06 the protected interval is rebuilt from the journal, cold, warm and after the index was overwritten", () => {
  it("the derived fence equals the INDEPENDENT journal reconstruction at EVERY revision of a strict replay, including after the index was overwritten to its terminal state", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    await must(rig.custody.sealOwn(x));
    await must(rig.custody.reconcile(rig.proof)); // the index, once OPEN, is now overwritten: SEALED_RECONCILED
    expect((rig.store.getFact(temporalGmWaitByPcKey("pc-fixture-1"))!.value as any).state).toBe(
      "SEALED_RECONCILED",
    );
    await rig.campaign.close();

    const entries = journalOf(rig.dir);
    const independent = activeFromJournal(entries);
    expect(
      independent.filter(Boolean).length,
      "the interval is non-empty (the OPEN) and ends at the seal",
    ).toBeGreaterThanOrEqual(1);
    const manifest = manifestOf(rig.dir);
    const core = new CampaignCore({
      campaignId: manifest.campaign_id,
      specLockSha256: entries[0]!.receipt.basis.spec_lock_sha256,
      owners: new Map(),
      admission: FIXTURE_ADMISSION,
      state: { campaign_id: manifest.campaign_id, revision: 0, facts: new Map() },
      headSha256: manifest.genesis_sha256,
    });
    const derived: (string | null)[] = [];
    for (const e of entries) {
      const r = core.replay(e);
      expect(r.ok, `revision ${e.revision}`).toBe(true);
      derived.push(core.gmWaitFence.active?.x ?? null);
      expect(core.gmWaitFence.unknown).toBeNull();
    }
    expect(derived).toEqual(independent);
    expect(derived.at(-1)).toBeNull();
  });

  it("[control] a campaign that is NOT active at its checkpoint reopens WARM: only the tail is judged", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "open");
    await must(rig.custody.sealOwn(x));
    await must(rig.custody.reconcile(rig.proof));
    for (let n = 0; n < 130; n++) await must(rig.store.commit(foreignGroup(n + 10)));
    await rig.campaign.close();
    expect(manifestOf(rig.dir).head.checkpoint.revision).toBe(128);
    const c = await openCounting(rig.dir);
    if (!c.opened.ok) throw new Error(JSON.stringify(c.opened.error));
    expect(c.calls(), "warm: only the entries after the checkpoint are re-judged").toBe(
      manifestOf(rig.dir).head.revision - 128,
    );
    await c.opened.value.close();
  });

  it("an ACTIVE interval that spans a checkpoint carries no ordered interval proof, so the open is forced into ONE strict whole-journal replay before any write", async () => {
    const { rig } = await activeAcrossCheckpoint();
    await rig.campaign.close();
    const cp = manifestOf(rig.dir).head.checkpoint;
    const head = manifestOf(rig.dir).head.revision;
    expect(cp.revision).toBe(128);
    // the OPEN is the checkpoint's own revision, so the checkpoint STATE holds the ACTIVE wait and no entry follows it (nothing but the seal can be published)
    expect(head).toBe(cp.revision);
    const c = await openCounting(rig.dir);
    if (!c.opened.ok) throw new Error(JSON.stringify(c.opened.error));
    const store = c.opened.value;
    expect(c.calls(), "every entry of the journal was judged again, from genesis").toBe(head);
    expect(deriveGmWaitFence(store.canonicalState!()).active).not.toBeNull();
    // and it is writable only for the lawful continuation: a foreign group is refused
    expect((await store.commit(foreignGroup(900))).ok).toBe(false);
    await store.close();
  }, 300_000);

  it("the strict cold replay and the warm-checkpoint path agree on the whole campaign (the equivalence of the checkpoint to the journal)", async () => {
    const { rig } = await activeAcrossCheckpoint();
    await rig.campaign.close();
    const warm = await must(reopen(copyPackage(rig.dir)));
    const cold = await must(reopen(copyPackage(rig.dir), FIXTURE_ADMISSION, { audit: true }));
    expect(warm.store.head().state_sha256).toBe(cold.store.head().state_sha256);
    expect(warm.store.head().journal_head_sha256).toBe(cold.store.head().journal_head_sha256);
    expect(deriveGmWaitFence(warm.store.canonicalState!())).toEqual(
      deriveGmWaitFence(cold.store.canonicalState!()),
    );
    await warm.close();
    await cold.close();
  }, 300_000);
});

describe("B2-T06 / B2-T09 tamper and forgery fail CLOSED (structurally perfect, rule-wise unlawful)", () => {
  /** reopens a forged package: it must NOT open, and the failure is the strict replay's own refusal */
  const mustNotOpen = async (dir: string, what: string) => {
    const r = await reopen(dir);
    expect(r.ok, what).toBe(false);
    return (r as any).error as { code: string; message: string };
  };

  it("[control] the forging helper itself produces a package that reopens when the appended group is LAWFUL", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "marker");
    const open = buildOpenGroup(
      { get: (k) => rig.store.getFact(k) },
      (await import("@immortalis/engine")).gmWaitX("session-original-1", "1").ok
        ? (rig.store.getFact(temporalGmWaitByPcKey("pc-fixture-1"))!.value as any).x
        : "",
    );
    if (!open.ok) throw new Error("open");
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [open.value]);
    const r = await reopen(dir);
    expect(r.ok, JSON.stringify((r as any).error)).toBe(true);
    if (r.ok) {
      expect(deriveGmWaitFence(r.value.store.canonicalState!()).active).not.toBeNull();
      await r.value.close();
    }
  });

  it("an interposed foreign group inside the ACTIVE interval, with a correct hash chain, receipt and state digest, is refused by the historical verifier on its own rules", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "open");
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [foreignGroup(77)]);
    // the forged package is internally consistent: the journal, receipts and head agree
    const forged = journalOf(dir);
    expect(forged.at(-1)!.group.writes[0]!.key).toBe("synthetic/foreign/77");
    const error = await mustNotOpen(dir, "an interposed foreign group");
    expect(error.code).toBe("REPLAY_MISMATCH");
    expect(error.message).toMatch(/not a valid transition: REFERENCE_INVALID/);
  });

  it("[control] the very same foreign group, forged AFTER the seal, is lawful history and the package opens", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "seal");
    void x;
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    forgeAppend(dir, [foreignGroup(77)]);
    const r = await reopen(dir);
    expect(r.ok, JSON.stringify((r as any).error)).toBe(true);
    if (r.ok) await r.value.close();
  });

  it("a forged index that jumps MARKED to SEALED_RECONCILED with no opening, and a forged OPEN that borrows another X's authority, are refused", async () => {
    // reconciliation without an OPEN
    const a = await seededRig(tempDir());
    await lifecycle(a, "marker");
    const idx = a.store.getFact(temporalGmWaitByPcKey("pc-fixture-1"))!;
    const jump: CommitGroup = {
      campaign_id: a.store.head().campaign_id,
      group_id: `gm-wait-reconcile-group:${(idx.value as any).x}`,
      intent_id: `gm-wait-reconcile-intent:${(idx.value as any).x}`,
      owner: idx.owner,
      facet: idx.facet,
      cause: `gm-wait:${(idx.value as any).x}`,
      rule: idx.provenance.rule,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [{ key: idx.key, version: idx.version }],
      depends_on: [idx.provenance.group_id],
      writes: [
        {
          key: idx.key,
          owner: idx.owner,
          facet: idx.facet,
          unit: null,
          basis: idx.basis,
          secrecy: idx.secrecy,
          expected_version: idx.version,
          value: {
            ...(idx.value as any),
            state: "SEALED_RECONCILED",
            predecessor_index_version: idx.version,
            open_authority: { key: "k", version: 1, group_id: "g" },
            sealed_result: { key: "s", version: 1, group_id: "g2" },
          } as never,
        },
      ],
    };
    await a.campaign.close();
    const dirA = copyPackage(a.dir);
    forgeAppend(dirA, [jump]);
    expect((await mustNotOpen(dirA, "MARKED -> SEALED_RECONCILED")).code).toBe("REPLAY_MISMATCH");

    // an OPEN group whose authority names the transaction of ANOTHER X
    const b = await seededRig(tempDir());
    const { x } = await lifecycle(b, "marker");
    const open = buildOpenGroup({ get: (k) => b.store.getFact(k) }, x);
    if (!open.ok) throw new Error("open");
    const y = "c".repeat(64);
    const borrowed: CommitGroup = {
      ...open.value,
      writes: open.value.writes.map((w) =>
        w.key.startsWith("temporal/transaction-authority/")
          ? {
              ...w,
              key: temporalTransactionAuthorityKey(txOf(y)),
              value: { ...(w.value as any), x: y, transaction_id: txOf(y) },
            }
          : w,
      ),
    };
    await b.campaign.close();
    const dirB = copyPackage(b.dir);
    forgeAppend(dirB, [borrowed]);
    expect((await mustNotOpen(dirB, "borrowed authority")).code).toBe("REPLAY_MISMATCH");
  });

  it("a package whose custody was written under the FIXTURE policy does not open under the PRODUCTION admission (wrong build source / unqualified original records)", async () => {
    const rig = await seededRig(tempDir());
    await lifecycle(rig, "marker");
    await rig.campaign.close();
    const dir = copyPackage(rig.dir);
    const r = await reopen(dir, canonicalAdmission);
    expect(r.ok).toBe(false);
    expect((r as any).error.code).toBe("REPLAY_MISMATCH");
    expect((r as any).error.message).toMatch(
      /GM_WAIT_PREPARATION_UNQUALIFIED|not a valid transition|historical verification/,
    );
  });

  it("a truncated journal, a flipped byte inside the interval, a missing state file and a corrupted index value each fail closed and never open writable", async () => {
    const { rig } = await activeAcrossCheckpoint();
    await rig.campaign.close();
    const m = manifestOf(rig.dir);

    const truncated = copyPackage(rig.dir);
    truncateSync(join(truncated, "journal.jsonl"), m.head.journal_bytes - 400);
    expect(["JOURNAL_TRUNCATED", "INTEGRITY_JOURNAL", "REPLAY_MISMATCH"]).toContain(
      (await mustNotOpen(truncated, "truncated")).code,
    );

    const flipped = copyPackage(rig.dir);
    const bytes = readFileSync(join(flipped, "journal.jsonl"));
    const at = Math.floor(bytes.length / 2);
    bytes[at] = bytes[at] === 0x61 ? 0x62 : 0x61;
    writeFileSync(join(flipped, "journal.jsonl"), bytes);
    await mustNotOpen(flipped, "a flipped byte");

    const stateless = copyPackage(rig.dir);
    rmSync(join(stateless, m.head.state_file));
    expect((await mustNotOpen(stateless, "missing state")).code).toBe("MISSING_STATE");
  });

  it("[B2-T06] older valid player-only, pre-S1 and Q-HIST-1 history is preserved: every frozen pre-S1 package reopens, warm and cold, under the new verifier with the identical transactions", async () => {
    for (const name of [
      "zero",
      "stage",
      "interrupted",
      "authority-only",
      "authority-then-stage-free-seal",
    ] as const) {
      const old = thaw(name);
      const ids = Object.keys(old.captures);
      const matrix = await reopenMatrix(old.dir, canonicalAdmission, ids);
      for (const mode of ["warm", "coldAudit", "coldInvalidated"] as const) {
        const o = matrix[mode];
        expect(o.ok, `${name}/${mode}: ${JSON.stringify(o.error)}`).toBe(true);
        expect(o.violations, `${name}/${mode}`).toEqual([]);
        for (const id of ids)
          expect(o.captures![id], `${name}/${mode}/${id}`).toEqual(old.captures[id]);
      }
      // The matrix above judges an open whose checkpoint evidence is TRUSTED (its helper re-stamps a private copy with the identity under test).
      // The declared transition is the UNTOUCHED frozen package: its checkpoint was earned under the identity before B2's segment, so the FIRST
      // open under the new verifier judges every entry once (every verdict admitted) and re-stamps; the NEXT open trusts it and judges none.
      const copy = copyOf(old.dir);
      const first = await openUnder(copy, canonicalAdmission);
      expect(first.ok, `${name}: first open`).toBe(true);
      if (!first.ok) throw new Error("unreachable");
      expect(first.calls, `${name}: one strict replay on the policy transition`).toBe(
        old.headRevision,
      );
      expect(
        [...first.verdicts.values()].every((v) => v === null),
        `${name}: the new verifier admits every entry of the older journal`,
      ).toBe(true);
      expect(first.verdicts.size, `${name}: every entry was judged`).toBe(old.headRevision);
      await first.campaign.close();
      const second = await openUnder(copy, canonicalAdmission);
      expect(second.ok, `${name}: second open`).toBe(true);
      if (!second.ok) throw new Error("unreachable");
      expect(second.calls, `${name}: trusted again, nothing is re-judged`).toBe(0);
      await second.campaign.close();
    }
  }, 600_000);
});

void [
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  temporalTransactionKey,
  factKind,
  markerInput,
  verifyTemporalIntegrity,
];
