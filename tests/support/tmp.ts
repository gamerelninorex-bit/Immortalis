import {
  CampaignCore,
  emptyState,
  stateSha256,
  stateToFile,
  sha256Canonical,
} from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY, JournalEntrySchema } from "@immortalis/contracts";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll } from "vitest";

const made: string[] = [];

/** Registers a fresh temp directory that is removed after the test file finishes. */
export function tempDir(prefix = "immortalis-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

export function copyDir(from: string): string {
  const to = tempDir("immortalis-copy-");
  cpSync(from, to, { recursive: true });
  return to;
}

/** name -> content for every file in a package directory, including derived index packs. */
export function snapshotDir(dir: string): Record<string, string> {
  const entries: [string, string][] = [];
  const walk = (base: string, prefix: string) => {
    for (const name of readdirSync(base).sort()) {
      const full = join(base, name),
        relative = prefix + name;
      if (statSync(full).isDirectory()) walk(full, relative + "/");
      else entries.push([relative, readFileSync(full, "utf8")]);
    }
  };
  walk(dir, "");
  return Object.fromEntries(entries);
}

/**
 * Existing byte-edit owner fixtures deliberately exercise the independent v1 loader. A v2 state
 * file is a historical checkpoint, so explicitly lower the isolated test save to an equivalent
 * v1 snapshot before those fixtures edit its current facts. Journal bytes/receipts stay unchanged.
 * This helper is test-only and never runs against an operator or player save.
 */
export function legacyStateFixture(path: string) {
  if (!/^state\.[0-9]+\.json$/.test(basename(path))) return JSON.parse(readFileSync(path, "utf8"));
  const dir = dirname(path);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if (manifest.format_version === 2) {
    const core = new CampaignCore({
      campaignId: manifest.campaign_id,
      specLockSha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
      owners: new Map(),
      state: emptyState(manifest.campaign_id),
      headSha256: manifest.genesis_sha256,
    });
    const journal = readFileSync(join(dir, "journal.jsonl"))
      .subarray(0, manifest.head.journal_bytes)
      .toString("utf8");
    for (const line of journal.split("\n").filter(Boolean)) {
      const replayed = core.replay(JournalEntrySchema.parse(JSON.parse(line)));
      if (!replayed.ok) throw new Error(JSON.stringify(replayed.error));
    }
    if (stateSha256(core.state) !== manifest.head.state_sha256)
      throw new Error("invalid test snapshot");
    writeFileSync(path, JSON.stringify(stateToFile(core.state), null, 2));
    manifest.format_version = 1;
    delete manifest.genesis_format_version;
    delete manifest.head.checkpoint;
    manifest.head.state_file = basename(path);
    delete manifest.self_sha256;
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ ...manifest, self_sha256: sha256Canonical(manifest) }),
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Text form of the independent v1 corruption fixture. */
export function legacyStateText(path: string): string {
  if (/^state\.[0-9]+\.json$/.test(basename(path))) legacyStateFixture(path);
  return readFileSync(path, "utf8");
}
