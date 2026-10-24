// What the trusted record and the owners say became of ONE exact confirmed ORIGINAL locality setup (`localityOutcome`): a read-only,
// owner-verified account that tells a proven absence of effect, a confirmed-but-incomplete (resumable) setup, a verified completion, an
// unreconcilable state and an unreadable one apart. Every campaign here is made by the SHIPPED `establish-locality` path with the
// ordinary canonical owner registry; the only simulation is a lost acknowledgement or a failed durable write, injected where a real one
// would arrive. Nothing here supplies an owner result, a status or a confirmation.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs, type FsOps } from "@immortalis/engine";
import { LocalitySetupSchema, localitySetupId } from "@immortalis/operator";
import {
  LOCALITY_STATUSES,
  localityOutcome,
  readLocality,
  type LocalityOutcome,
} from "../../apps/phone/src/locality-evidence.ts";
import { pinFileName, writePin } from "../../packages/operator/src/locality-pin.ts";
import {
  LOCALITY_CAMPAIGN,
  establish,
  freshDirs,
  headOf,
  openOrdinary,
  setupDoc,
  writeSetup,
  type LocalityDirs,
} from "../support/locality.ts";
import { loseReply } from "../support/chat-setting.ts";

afterEach(() => vi.restoreAllMocks());

const setupA = () => LocalitySetupSchema.parse(setupDoc());
const setupB = () => {
  const doc = setupDoc();
  doc.source.quantity.amount = 7;
  doc.source.statement = "The first pan holds exactly 7 sacks of raw salt.";
  return LocalitySetupSchema.parse(doc);
};
const read = (dirs: LocalityDirs, setup = setupA()): Promise<LocalityOutcome> =>
  localityOutcome({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorDir: dirs.operatorDir,
    setup,
  });
const uid = process.getuid!();
const pinPath = (dirs: LocalityDirs) => join(dirs.operatorDir, pinFileName(LOCALITY_CAMPAIGN));

/** a durable write of the retained identity that fails AFTER the exclusive create landed: the identity is on disk, nothing else exists */
const failingPinPublish: FsOps = {
  ...nodeFs,
  writeFileDurable: async (path, data) => {
    if (/locality-setup-[0-9a-f]+\.json$/.test(path)) throw new Error("disk failed");
    return nodeFs.writeFileDurable(path, data);
  },
};

const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

describe("localityOutcome: a proven absence of effect is not the same as unknown", () => {
  it("nothing confirmed: no identity and no package, reading creates nothing", async () => {
    const dirs = freshDirs();
    expect((await read(dirs)).kind).toBe("NO_EFFECT");
    expect(existsSync(dirs.campaignDir)).toBe(false);
    expect(existsSync(dirs.operatorDir)).toBe(false);
  });

  it("declined after the whole setting was shown: nothing was retained or created", async () => {
    const dirs = freshDirs();
    const { result } = await establish(dirs, writeSetup(setupDoc()), ["decline"]);
    expect(result.status).toBe("DECLINED");
    expect((await read(dirs)).kind).toBe("NO_EFFECT");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another setup holds the campaign's first-writer-wins identity: this one has no effect, with or without the package", async () => {
    const dirs = freshDirs();
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    const before = await headOf(dirs.campaignDir);
    expect(await read(dirs, setupB())).toMatchObject({ kind: "NO_EFFECT" });
    expect(await headOf(dirs.campaignDir)).toEqual(before);
    // the identity of A alone, no package yet
    const lone = freshDirs();
    await establish(lone, writeSetup(setupDoc()), ["confirm"], { ledgerFs: failingPinPublish });
    expect(await read(lone, setupB())).toMatchObject({ kind: "NO_EFFECT" });
    expect(await read(lone, setupA())).toMatchObject({ kind: "RESUMABLE" });
  });
});

describe("localityOutcome: a confirmed setup that is not whole is RESUMABLE, at every structural cut", () => {
  it("the retained identity was written and nothing else (no package)", async () => {
    const dirs = freshDirs();
    const { result } = await establish(dirs, writeSetup(setupDoc()), ["confirm"], {
      ledgerFs: failingPinPublish,
    });
    expect(result.status).toBe("LOCALITY_OUTCOME_UNKNOWN");
    expect(existsSync(dirs.campaignDir)).toBe(false);
    expect(await read(dirs)).toEqual({ kind: "RESUMABLE", package: "ABSENT", committed: [] });
  });

  const cuts = [
    ["establishWorld", false, []],
    ["establishLocus", false, ["world"]],
    ["establishSourceCondition", false, ["world", "locus"]],
  ] as const;
  for (const [op, commit, committed] of cuts)
    it(`the package exists and ${committed.length === 0 ? "nothing" : committed.join(" + ")} is committed (${op} never reached the store)`, async () => {
      const dirs = freshDirs();
      loseReply(op, commit);
      const { result } = await establish(dirs, writeSetup(setupDoc()));
      expect(result.status).toBe("LOCALITY_OUTCOME_UNKNOWN");
      vi.restoreAllMocks();
      const head = await headOf(dirs.campaignDir);
      expect(await read(dirs)).toEqual({ kind: "RESUMABLE", package: "PRESENT", committed });
      // reading is not writing
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });

  it("a lost acknowledgement AFTER all three commits is a verified COMPLETE, not a failure", async () => {
    const dirs = freshDirs();
    loseReply("establishSourceCondition", true);
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe(
      "LOCALITY_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);
    const outcome = await read(dirs);
    expect(outcome.kind).toBe("COMPLETE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("localityOutcome: COMPLETE needs the retained identity, the exact publications and a fresh owner-verified open", () => {
  it("reads back the allowlisted setting from the owners, and matches the canon-only read", async () => {
    const dirs = freshDirs();
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    const outcome = await read(dirs);
    expect(outcome).toMatchObject({
      kind: "COMPLETE",
      readback: {
        world_id: "world-ashfall",
        locus_id: "locus-salt-pans",
        source_key: "src-salt-pan-1",
        established: { amount: 120, unit: "sack" },
      },
    });
    // the player-visible readback is the immutable authored setting only: never a current remainder
    if (outcome.kind === "COMPLETE") expect(outcome.readback).not.toHaveProperty("recoverable");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const id = localitySetupId(LOCALITY_CAMPAIGN, setupA());
      const canon = readLocality(c, LOCALITY_CAMPAIGN, id);
      expect(canon.kind).toBe("READY");
      // the retained confirmation identity is required: absent, different or malformed is never positive
      for (const pin of [null, "0".repeat(32), localitySetupId(LOCALITY_CAMPAIGN, setupB())])
        expect(readLocality(c, LOCALITY_CAMPAIGN, pin).kind).toBe("FAILED");
      expect(readLocality(c, "another-campaign", id).kind).toBe("FAILED");
      if (outcome.kind === "COMPLETE" && canon.kind === "READY")
        expect(canon.readback).toEqual(outcome.readback);
    } finally {
      await c.close();
    }
  });

  it("publications without the retained identity are not COMPLETE: the lone world/source or a matching hash proves nothing", async () => {
    const dirs = freshDirs();
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    writeFileSync(pinPath(dirs), "");
    expect(await read(dirs)).toMatchObject({ kind: "BLOCKED", code: "PIN_MALFORMED" });
    // an absent identity beside this setup's publications is unreconcilable too
    const gone = freshDirs();
    expect((await establish(gone, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    await nodeFs.remove(pinPath(gone));
    expect(await read(gone)).toMatchObject({ kind: "BLOCKED", code: "UNPINNED_COMMITS" });
  });
});

describe("localityOutcome: what cannot be reconciled by a rerun is BLOCKED and nothing is adopted, deleted or reclaimed", () => {
  it("a retained identity of another campaign or operator, or a malformed one", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.operatorDir, { recursive: true, mode: 0o700 });
    writeFileSync(pinPath(dirs), "{ not json");
    expect(await read(dirs)).toMatchObject({ kind: "BLOCKED", code: "PIN_MALFORMED" });
    writeFileSync(
      pinPath(dirs),
      JSON.stringify({
        format: "immortalis-operator-locality-setup-pin",
        format_version: 1,
        campaign_id: "another-campaign",
        operator_uid: uid,
        setup_id: "0".repeat(32),
      }),
    );
    expect(await read(dirs)).toMatchObject({ kind: "BLOCKED", code: "PIN_CAMPAIGN_MISMATCH" });
    writeFileSync(
      pinPath(dirs),
      JSON.stringify({
        format: "immortalis-operator-locality-setup-pin",
        format_version: 1,
        campaign_id: LOCALITY_CAMPAIGN,
        operator_uid: uid + 1,
        setup_id: "0".repeat(32),
      }),
    );
    expect(await read(dirs)).toMatchObject({ kind: "BLOCKED", code: "PIN_OPERATOR_MISMATCH" });
    expect(readFileSync(pinPath(dirs), "utf8")).toContain('"operator_uid"');
  });

  it("an interrupted creation or foreign content: a non-empty directory with no manifest is never adopted or cleared", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    mkdirSync(dirs.operatorDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dirs.campaignDir, "stray.txt"), "residue");
    const kept = await writePin({
      dir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: uid,
      setupId: localitySetupId(LOCALITY_CAMPAIGN, setupA()),
    });
    expect(kept.ok).toBe(true);
    expect(await read(dirs)).toMatchObject({ kind: "BLOCKED", code: "PACKAGE_UNUSABLE" });
    expect(readFileSync(join(dirs.campaignDir, "stray.txt"), "utf8")).toBe("residue");
  });

  it("the package holds a different setup under this setup's retained identity: a conflict, not a resumption", async () => {
    const dirs = freshDirs();
    expect((await establish(dirs, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    // a retained identity of B beside A's package cannot arise by the shipped path; if it is made, it is refused
    const forced = freshDirs();
    expect((await establish(forced, writeSetup(setupDoc()))).result.status).toBe("LOCALITY_READY");
    await nodeFs.remove(pinPath(forced));
    await writePin({
      dir: forced.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: uid,
      setupId: localitySetupId(LOCALITY_CAMPAIGN, setupB()),
    });
    expect(await read(forced, setupB())).toMatchObject({ kind: "BLOCKED", code: "SETUP_CONFLICT" });
  });
});

describe("localityOutcome: an unreadable package is UNAVAILABLE (neither done nor not done); a lock is never reclaimed", () => {
  it("a live lock held by another opener, then a stale lock left by a dead process", async () => {
    const dirs = freshDirs();
    loseReply("establishLocus", false);
    await establish(dirs, writeSetup(setupDoc()));
    vi.restoreAllMocks();
    const held = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "lock-holder" });
    if (!held.ok) throw new Error("did not open");
    const lock = join(dirs.campaignDir, "LOCK");
    const live = readFileSync(lock, "utf8");
    expect(await read(dirs)).toMatchObject({ kind: "UNAVAILABLE", code: "PACKAGE_UNAVAILABLE" });
    expect(readFileSync(lock, "utf8")).toBe(live);
    await held.value.close();
    // a crashed holder leaves its lock behind: still unavailable, still not reclaimed
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
    const stale = readFileSync(lock, "utf8");
    expect(await read(dirs)).toMatchObject({ kind: "UNAVAILABLE", code: "PACKAGE_UNAVAILABLE" });
    expect(readFileSync(lock, "utf8")).toBe(stale);
  });
});

describe("the statuses and markers the chat relays are the shipped command's own", () => {
  it("every status the command reports in these scenarios is in the relayed allowlist, and each of its markers appears in a real run", async () => {
    const seen = new Set<string>();
    const dirs = freshDirs();
    for (const [replies, file] of [
      [["decline"], writeSetup(setupDoc())],
      [["confirm"], writeSetup(setupDoc())],
      [["confirm"], writeSetup(setupDoc())],
      [["confirm"], writeSetup(setupB())],
      [["confirm"], writeSetup("{ not json")],
      [["confirm"], writeSetup(setupDoc(), 0o666)],
    ] as const) {
      const { result, terminal } = await establish(dirs, file, [...replies]);
      seen.add(result.status);
      if (result.status === "LOCALITY_READY" && replies[0] === "confirm" && terminal.asked() > 0) {
        expect(terminal.said).toContain("CONFIRMATION — ORIGINAL LOCALITY SETUP");
      }
    }
    expect([...seen].sort()).toEqual(
      expect.arrayContaining([
        "DECLINED",
        "INVALID_SETUP",
        "LOCALITY_READY",
        "SETUP_CONFLICT",
        "SETUP_FILE_UNTRUSTED",
      ]),
    );
    for (const status of seen) expect(LOCALITY_STATUSES as readonly string[]).toContain(status);
  });
});
