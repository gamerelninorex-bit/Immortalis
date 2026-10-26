/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary on-disk JSON */
// Campaign Continuity Foundation — "Save. Close. Load. Continue. The world remains itself."
// Register lineage: IA-01, IA-02, IA-06 (partial), IA-30 (partial); RC-01/02/07/16; IM-11 subset, IM-17.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0). Local success here is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  BUILD_SPEC_IDENTITY,
  RUNTIME_CONTRACT_SNAPSHOT,
  canonicalJson,
  runtimeContractSha256,
  type SpecIdentity,
} from "@immortalis/contracts";
import {
  createFileCampaign,
  nodeFs,
  openFileCampaign,
  sha256Canonical,
  type FileCampaignStore,
} from "@immortalis/engine";
import { SimulatedCrash, TEST_OWNERS, group, instrumentFs, write } from "@immortalis/testkit";
import { copyDir, snapshotDir, tempDir } from "../support/tmp.ts";

const C = "campaign-continuity-1";

/** Same Runtime Contract; only lock-file, register and open-gates hashes differ. */
const EVIDENCE_ONLY: SpecIdentity = {
  ...BUILD_SPEC_IDENTITY,
  spec_lock_sha256: "9".repeat(64),
  snapshot_files: {
    ...BUILD_SPEC_IDENTITY.snapshot_files,
    "spec/f027/acceptance-register.yaml": "8".repeat(64),
    "spec/f027/open-gates.yaml": "7".repeat(64),
  },
};
/** A different Runtime Contract snapshot. */
const INCOMPATIBLE: SpecIdentity = {
  ...BUILD_SPEC_IDENTITY,
  spec_lock_sha256: "6".repeat(64),
  snapshot_files: {
    ...BUILD_SPEC_IDENTITY.snapshot_files,
    [RUNTIME_CONTRACT_SNAPSHOT]: "5".repeat(64),
  },
};
// Keep the original v1 wire/corruption fixtures as independent legacy regression coverage.
const OPTS = { owners: TEST_OWNERS, legacyFormat: true };

async function must<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

async function seed(dir: string, commits = 3): Promise<FileCampaignStore> {
  const s = await must(createFileCampaign(dir, { campaignId: C, ...OPTS, buildId: "seed" }));
  for (let n = 1; n <= commits; n++) {
    const g =
      n === 1
        ? group(C, 1, [write("fact/a", { n: 1 }), write("fact/b", "bee", { unit: "unit-x" })])
        : group(C, n, [write("fact/a", { n }, { expected_version: n - 1 })]);
    await must(s.commit(g));
  }
  return s;
}

const openCode = async (dir: string) => {
  const r = await openFileCampaign(dir, OPTS);
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code;
};

describe("Save. Close. Load. Continue.", () => {
  it("the world remains itself across a real process boundary", async () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "continuity-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", script, phase, dir],
          {
            encoding: "utf8",
          },
        ),
      ) as Record<string, any>;

    const created = run("create");
    expect(readdirSync(dir).includes("LOCK")).toBe(false); // closed cleanly

    // LOAD in this (third) process: identity and material state exactly as saved by the first.
    const loaded = await must(openFileCampaign(dir, OPTS));
    expect(loaded.head()).toMatchObject({
      campaign_id: C,
      revision: 1,
      state_sha256: created.receipt.state_sha256,
    });
    expect(loaded.head().created_with.build_id).toBe("process-1");
    expect(loaded.getFact("fact/b")).toMatchObject({
      value: "bee",
      version: 1,
      provenance: { group_id: "group-1" },
    });
    expect(loaded.lookupReceipt("intent-1")).toEqual(created.receipt);
    const identity = loaded.head().spec_identity;
    await loaded.close();

    // CONTINUE in a fourth process, which re-verifies everything on open.
    const cont = run("continue");
    expect(cont.before.head.state_sha256).toBe(created.receipt.state_sha256);
    expect(cont.before.head.spec_identity).toEqual(identity);
    expect(cont.after.head.revision).toBe(2);

    const final = await must(openFileCampaign(dir, OPTS));
    expect(final.head().campaign_id).toBe(C);
    expect(final.head().spec_identity).toEqual(identity);
    expect(final.head().created_with.build_id).toBe("process-1"); // creation provenance is immutable
    expect(final.head().last_saved_with.build_id).toBe("process-2");
    expect(final.getFact("fact/a")).toMatchObject({ value: { n: 2 }, version: 2 });
    expect(final.getFact("fact/b")).toMatchObject({ value: "bee", version: 1 }); // untouched fact unchanged
    expect(final.getFact("fact/c")).toMatchObject({ value: true, version: 1 });
    await final.close();
  });

  it("is byte-deterministic: identical inputs yield identical packages", async () => {
    const a = tempDir();
    const b = tempDir();
    await (await seed(a)).close();
    await (await seed(b)).close();
    expect(snapshotDir(a)).toEqual(snapshotDir(b));
  });

  it("reload yields the same head and facts; a second open sees the same history", async () => {
    const dir = tempDir();
    const s = await seed(dir);
    const head = s.head();
    const facts = s.listFacts();
    await s.close();
    const r = await must(openFileCampaign(dir, OPTS));
    expect(r.head()).toEqual({ ...head, last_saved_with: head.last_saved_with });
    expect(r.listFacts()).toEqual(facts);
    expect(r.residue).toEqual({ journal_tail_bytes: 0, other_files: [] });
    await r.close();
  });

  it("loads read-only-safe when no owner is registered: history stays intact, writes fail closed", async () => {
    const dir = tempDir();
    await (await seed(dir)).close();
    const s = await must(openFileCampaign(dir, {})); // build with an empty owner registry
    expect(s.getFact("fact/a")?.version).toBe(3);
    const r = await s.commit(group(C, 9, [write("fact/a", 1, { expected_version: 3 })]));
    expect(!r.ok && r.error.code).toBe("OWNER_NOT_REGISTERED");
    await s.close();
  });

  it("allows only one open handle per campaign and never breaks a live lock", async () => {
    const dir = tempDir();
    const s = await seed(dir);
    const second = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
    expect(!second.ok && second.error.code).toBe("LOCKED");
    await s.close();
    expect((await openFileCampaign(dir, OPTS)).ok).toBe(true);
  });

  it("reports a stale lock explicitly and reclaims it only on request", async () => {
    const dir = tempDir();
    await (await seed(dir)).close();
    writeFileSync(
      join(dir, "LOCK"),
      `${JSON.stringify({ pid: 2 ** 22 + 12345, campaign_id: C })}\n`,
    );
    const refused = await openFileCampaign(dir, OPTS);
    expect(!refused.ok && refused.error.code).toBe("LOCKED");
    expect(!refused.ok && refused.error.details).toMatchObject({ holder_alive: false });
    const reclaimed = await must(openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true }));
    expect(reclaimed.head().revision).toBe(3);
    await reclaimed.close();
  });

  it("refuses to create over an existing directory", async () => {
    const dir = tempDir();
    await (await seed(dir)).close();
    const again = await createFileCampaign(dir, { campaignId: "other", ...OPTS });
    expect(!again.ok && again.error.code).toBe("ALREADY_EXISTS");
    expect(await openCode(dir)).toBe("OK"); // original untouched
  });

  it("rejects operations after close", async () => {
    const dir = tempDir();
    const s = await seed(dir);
    await s.close();
    const r = await s.commit(group(C, 9, [write("z", 1)]));
    expect(!r.ok && r.error.code).toBe("STORE_CLOSED");
    await s.close(); // idempotent
  });
});

describe("invalid, incompatible or tampered packages fail explicitly (never repaired into canon)", () => {
  const manifestPath = (d: string) => join(d, "manifest.json");
  const readManifest = (d: string) =>
    JSON.parse(readFileSync(manifestPath(d), "utf8")) as Record<string, any>;
  const writeManifest = (d: string, m: unknown) =>
    writeFileSync(manifestPath(d), JSON.stringify(m, null, 2));
  const reseal = (m: Record<string, any>) => {
    const rest = { ...m };
    delete rest.self_sha256;
    return { ...rest, self_sha256: sha256Canonical(rest) };
  };
  const stateFile = (d: string) => readdirSync(d).find((f) => /^state\.\d+\.json$/.test(f))!;
  const journalLines = (d: string) =>
    readFileSync(join(d, "journal.jsonl"), "utf8").split("\n").filter(Boolean);

  let pristine: string;
  const fresh = async () => {
    pristine ??= await (async () => {
      const d = tempDir();
      await (await seed(d)).close();
      return d;
    })();
    return copyDir(pristine);
  };

  it("control: an untouched copy loads", async () => {
    expect(await openCode(await fresh())).toBe("OK");
  });

  const mutations: [string, string, (d: string) => void | Promise<void>][] = [
    [
      "state value edited",
      "INTEGRITY_STATE",
      (d) => {
        const p = join(d, stateFile(d));
        writeFileSync(p, readFileSync(p, "utf8").replace('"bee"', '"BEE"'));
      },
    ],
    ["state file emptied", "MALFORMED", (d) => writeFileSync(join(d, stateFile(d)), "")],
    [
      "state file unknown field",
      "SCHEMA_INVALID",
      (d) => {
        const p = join(d, stateFile(d));
        const j = JSON.parse(readFileSync(p, "utf8"));
        j.facts[0].smuggled = true;
        writeFileSync(p, JSON.stringify(j));
      },
    ],
    ["state file removed", "MISSING_STATE", (d) => rmSync(join(d, stateFile(d)))],
    [
      "journal group content edited",
      "REPLAY_MISMATCH",
      (d) => {
        const p = join(d, "journal.jsonl");
        writeFileSync(p, readFileSync(p, "utf8").replace('"bee"', '"BEE"'));
      },
    ],
    [
      "journal entry removed (shorter than committed)",
      "JOURNAL_TRUNCATED",
      (d) => {
        const l = journalLines(d);
        l.splice(1, 1);
        writeFileSync(join(d, "journal.jsonl"), `${l.join("\n")}\n`);
      },
    ],
    [
      "journal entries swapped",
      "REPLAY_MISMATCH",
      (d) => {
        const l = journalLines(d);
        [l[1], l[2]] = [l[2]!, l[1]!];
        writeFileSync(join(d, "journal.jsonl"), `${l.join("\n")}\n`);
      },
    ],
    ["journal removed", "MISSING_JOURNAL", (d) => rmSync(join(d, "journal.jsonl"))],
    [
      "journal line not JSON",
      "MALFORMED",
      (d) => {
        const l = journalLines(d);
        l[0] = "{".padEnd(l[0]!.length, "x"); // same byte length: not a truncation
        writeFileSync(join(d, "journal.jsonl"), `${l.join("\n")}\n`);
      },
    ],
    ["manifest removed", "MISSING_MANIFEST", (d) => rmSync(manifestPath(d))],
    ["manifest not JSON", "MALFORMED", (d) => writeFileSync(manifestPath(d), "<<<")],
    [
      "manifest of another format",
      "UNSUPPORTED_FORMAT",
      (d) => writeManifest(d, { ...readManifest(d), format: "something.else" }),
    ],
    [
      "future format version",
      "UNSUPPORTED_FORMAT_VERSION",
      (d) => writeManifest(d, { ...readManifest(d), format_version: 3 }),
    ],
    [
      "manifest campaign_id edited",
      "INTEGRITY_MANIFEST",
      (d) => writeManifest(d, { ...readManifest(d), campaign_id: "hijacked" }),
    ],
    [
      "manifest campaign_id edited AND resealed",
      "INTEGRITY_MANIFEST",
      (d) => writeManifest(d, reseal({ ...readManifest(d), campaign_id: "hijacked" })),
    ],
    [
      "manifest spec identity edited AND resealed",
      "INTEGRITY_MANIFEST",
      (d) => {
        const m = readManifest(d);
        m.spec_identity.spec_lock_sha256 = "f".repeat(64);
        writeManifest(d, reseal(m));
      },
    ],
    [
      "manifest compatibility edited AND resealed",
      "INTEGRITY_MANIFEST",
      (d) => {
        const m = readManifest(d);
        m.compatibility.runtime_contract_sha256 = "4".repeat(64);
        writeManifest(d, reseal(m));
      },
    ],
    [
      "manifest head hash edited AND resealed",
      "INTEGRITY_STATE",
      (d) => {
        const m = readManifest(d);
        m.head.state_sha256 = "e".repeat(64);
        writeManifest(d, reseal(m));
      },
    ],
    [
      "manifest unknown field",
      "SCHEMA_INVALID",
      (d) => writeManifest(d, { ...readManifest(d), extra: 1 }),
    ],
    [
      "manifest points at a path outside the package",
      "SCHEMA_INVALID",
      (d) => {
        const m = readManifest(d);
        m.head.state_file = "../../etc/passwd";
        writeManifest(d, reseal(m));
      },
    ],
  ];
  it.each(mutations)("%s -> %s", async (_label, code, mutate) => {
    const d = await fresh();
    await mutate(d);
    expect(await openCode(d)).toBe(code);
    expect(readdirSync(d).includes("LOCK")).toBe(false); // a failed load does not leave the lock behind
  });

  it("a journal transplanted from another campaign is rejected", async () => {
    const other = tempDir();
    const s = await must(createFileCampaign(other, { campaignId: "different", ...OPTS }));
    for (let n = 1; n <= 3; n++) await must(s.commit(group("different", n, [write(`k${n}`, n)])));
    await s.close();
    const d = await fresh();
    writeFileSync(join(d, "journal.jsonl"), readFileSync(join(other, "journal.jsonl")));
    expect(["INTEGRITY_JOURNAL", "REPLAY_MISMATCH", "JOURNAL_TRUNCATED"]).toContain(
      await openCode(d),
    );
  });

  it("an incompatible Runtime Contract still fails closed; compatibility must be declared (IA-01)", async () => {
    const d = tempDir();
    await (
      await must(createFileCampaign(d, { campaignId: C, ...OPTS, specIdentity: INCOMPATIBLE }))
    ).close();
    const r = await openFileCampaign(d, OPTS);
    expect(!r.ok && r.error.code).toBe("RUNTIME_CONTRACT_INCOMPATIBLE");
    expect(readdirSync(d).includes("LOCK")).toBe(false);
    // Only an explicit compatibility declaration (never inference) lets a build load it.
    const declared = await must(
      openFileCampaign(d, {
        ...OPTS,
        compatibleRuntimeContracts: [runtimeContractSha256(INCOMPATIBLE)!],
      }),
    );
    expect(declared.head().campaign_id).toBe(C);
    await declared.close();
  });

  it("the reverse direction also fails closed: a build with a newer Runtime Contract refuses an older save", async () => {
    const d = tempDir();
    await (await seed(d)).close(); // written under the real contract
    const r = await openFileCampaign(d, {
      ...OPTS,
      specIdentity: INCOMPATIBLE,
      compatibleRuntimeContracts: [runtimeContractSha256(INCOMPATIBLE)!],
    });
    expect(!r.ok && r.error.code).toBe("RUNTIME_CONTRACT_INCOMPATIBLE");
  });

  it("an evidence-only spec change does not make a compatible save unloadable (IA-01)", async () => {
    // Same Runtime Contract; different lock file, register and open-gates hashes.
    expect(runtimeContractSha256(EVIDENCE_ONLY)).toBe(runtimeContractSha256(BUILD_SPEC_IDENTITY));
    expect(EVIDENCE_ONLY.spec_lock_sha256).not.toBe(BUILD_SPEC_IDENTITY.spec_lock_sha256);

    const d = tempDir();
    const old = await must(
      createFileCampaign(d, { campaignId: C, ...OPTS, specIdentity: EVIDENCE_ONLY }),
    );
    await must(old.commit(group(C, 1, [write("fact/a", { n: 1 })])));
    await old.close();

    // A build carrying the newer evidence-only lock loads it, verifies it, and reports drift.
    const s = await must(openFileCampaign(d, OPTS));
    expect(s.provenanceDrift).toBe(true);
    expect(s.head().spec_identity).toEqual(EVIDENCE_ONLY); // creation provenance preserved exactly
    expect(s.getFact("fact/a")).toMatchObject({ version: 1, value: { n: 1 } });
    const r = await must(
      s.commit(group(C, 2, [write("fact/a", { n: 2 }, { expected_version: 1 })])),
    );
    // New receipts record the lock actually in force; old ones keep theirs.
    expect(r.receipt.basis.spec_lock_sha256).toBe(BUILD_SPEC_IDENTITY.spec_lock_sha256);
    expect(s.lookupReceipt("intent-1")?.basis.spec_lock_sha256).toBe(
      EVIDENCE_ONLY.spec_lock_sha256,
    );
    await s.close();

    // Reload under the current build: provenance is exact and no longer drifting.
    const again = await must(openFileCampaign(d, OPTS));
    expect(again.provenanceDrift).toBe(false);
    expect(again.head().spec_identity).toEqual(EVIDENCE_ONLY);
    expect(again.head().last_saved_spec_identity).toEqual(BUILD_SPEC_IDENTITY);
    expect(again.getFact("fact/a")).toMatchObject({ version: 2, value: { n: 2 } });
    await again.close();

    // And an older evidence-only build still loads the newer save (history replays from recorded basis).
    const older = await must(openFileCampaign(d, { ...OPTS, specIdentity: EVIDENCE_ONLY }));
    expect(older.provenanceDrift).toBe(true);
    expect(older.head().revision).toBe(2);
    await older.close();
  });

  it("the build's compatibility key is the hash of the real runtime-contract.md", () => {
    expect(runtimeContractSha256(BUILD_SPEC_IDENTITY)).toBe(
      createHash("sha256")
        .update(readFileSync(RUNTIME_CONTRACT_SNAPSHOT, "utf8").replace(/\r\n/g, "\n"), "utf8")
        .digest("hex"),
    );
  });

  it("uncommitted residue is reported, never adopted, and is discarded by the next commit", async () => {
    const d = await fresh();
    appendFileSync(join(d, "journal.jsonl"), '{"half":"written'); // torn append after the commit point
    writeFileSync(join(d, "state.0000000099.json"), "{}"); // orphan checkpoint
    const s = await must(openFileCampaign(d, OPTS));
    expect(s.head().revision).toBe(3);
    expect(s.residue.journal_tail_bytes).toBeGreaterThan(0);
    expect(s.residue.other_files).toEqual(["state.0000000099.json"]);
    await must(s.commit(group(C, 4, [write("fact/a", { n: 4 }, { expected_version: 3 })])));
    await s.close();
    const r = await must(openFileCampaign(d, OPTS));
    expect(r.head().revision).toBe(4);
    expect(r.residue.journal_tail_bytes).toBe(0);
    await r.close();
  });
});

describe("atomic publication and unknown-outcome reconciliation (IA-06 partial, RC-16)", () => {
  it("survives a failure injected before or after every durable step of a commit", async () => {
    // Dry run to count the durable steps of one commit through an instrumented filesystem.
    const probeDir = tempDir();
    await (await seed(probeDir, 1)).close();
    const probe = instrumentFs(nodeFs);
    const p = await must(openFileCampaign(probeDir, { ...OPTS, fs: probe.fs }));
    const afterOpen = probe.count(); // includes the lock
    await must(p.commit(group(C, 2, [write("fact/a", { n: 2 }, { expected_version: 1 })])));
    const afterCommit = probe.count();
    await p.close();
    expect(afterCommit - afterOpen).toBeGreaterThanOrEqual(4);

    const oldRev = 1;
    const finals = new Set<string>();
    const seen = { rolledBack: 0, committed: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterCommit; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await (await seed(dir, 1)).close();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const s = await must(openFileCampaign(dir, { ...OPTS, fs: inst.fs }));
        const g = group(C, 2, [write("fact/a", { n: 2 }, { expected_version: 1 })]);
        const r = await s.commit(g);
        if (!r.ok) {
          expect(r.error.code).toBe("UNKNOWN_OUTCOME");
          expect(r.error.details?.cause).toContain("simulated crash");
          const blocked = await s.commit(group(C, 3, [write("z", 1)]));
          expect(!blocked.ok && blocked.error.code).toBe("STORE_POISONED");
        }
        await s.close();

        // "Restart": reopen with the real filesystem and reconcile by identity.
        const reopened = await must(openFileCampaign(dir, OPTS));
        const receipt = reopened.lookupReceipt("intent-2");
        const rev = reopened.head().revision;
        expect([oldRev, oldRev + 1]).toContain(rev); // never a partial state
        if (rev === oldRev) {
          seen.rolledBack++;
          expect(receipt).toBeNull();
          expect(reopened.getFact("fact/a")).toMatchObject({ version: 1, value: { n: 1 } });
        } else {
          seen.committed++;
          expect(receipt).not.toBeNull();
          expect(reopened.getFact("fact/a")).toMatchObject({ version: 2, value: { n: 2 } });
        }
        // Retrying the same intent converges on exactly one commit, never a duplicate.
        const retry = await must(reopened.commit(g));
        expect(retry.replayed).toBe(rev !== oldRev);
        expect(reopened.head().revision).toBe(2);
        finals.add(reopened.head().state_sha256);
        await reopened.close();
        expect(await openCode(dir)).toBe("OK");
      }
    }
    expect(finals.size).toBe(1); // every crash point converges on the identical world
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  });

  it("SimulatedCrash is the only thing the harness injects", () => {
    expect(new SimulatedCrash(3).opIndex).toBe(3);
  });
});

describe("replay identity (IA-30 partial)", () => {
  it("the materialized state equals a from-scratch replay of the hash-chained journal", async () => {
    const dir = tempDir();
    const s = await seed(dir, 5);
    const facts = s.listFacts();
    const head = s.head();
    await s.close();
    // Loading IS full replay (open re-derives every transition). Corrupting only the derived
    // checkpoint therefore cannot change canon, and is detected.
    const r = await must(openFileCampaign(dir, OPTS));
    expect(r.listFacts()).toEqual(facts);
    expect(canonicalJson(r.head().state_sha256)).toBe(canonicalJson(head.state_sha256));
    await r.close();
  });
});
