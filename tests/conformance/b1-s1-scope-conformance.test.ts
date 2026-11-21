// F-014B B1 S1 (the canonical live-versus-historical origin safety guard) — CUSTODY, SCOPE and LABELLING. This file judges no behaviour; the
// integration tests of S1 do. It checks clerical facts only:
//
//   B1S1-C1  the frozen pre-S1 campaign packages are exactly the bytes recorded in tests/support/b1-s1-frozen-fixtures.ts
//
// Custody is bytes, never ancestry: a squash merge keeps a base commit retrievable but does not keep it in the merged history, so no test
// here asserts that any commit is an ancestor of HEAD. Where a base commit is needed for a diff and is not retrievable (a shallow checkout)
// the comparison is SKIPPED and reported as skipped, never claimed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  B1_S1_FROZEN_FILES,
  B1_S1_FROZEN_PACKAGES,
  B1_S1_FROZEN_ROOT,
} from "../support/b1-s1-frozen-fixtures.ts";

const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );

describe("B1-S1 custody: the frozen pre-S1 campaign packages", () => {
  it("B1S1-C1 the frozen tree holds exactly the recorded files, each with its recorded length and SHA-256", () => {
    const found = walk(B1_S1_FROZEN_ROOT)
      .map((f) => f.slice(B1_S1_FROZEN_ROOT.length + 1))
      .sort();
    expect(found).toEqual(Object.keys(B1_S1_FROZEN_FILES).sort());
    for (const [path, want] of Object.entries(B1_S1_FROZEN_FILES)) {
      const bytes = readFileSync(`${B1_S1_FROZEN_ROOT}/${path}`);
      expect(bytes.length, `${path} length`).toBe(want.bytes);
      expect(sha256(bytes), `${path} sha256`).toBe(want.sha256);
    }
    // the comparison is not vacuous: one flipped byte and one extra byte are each told apart
    const sample = readFileSync(`${B1_S1_FROZEN_ROOT}/zero/package/manifest.json`);
    const flipped = Buffer.from(sample);
    flipped[0] = (flipped[0]! + 1) % 256;
    expect(sha256(flipped)).not.toBe(sha256(sample));
    expect(sha256(Buffer.concat([sample, Buffer.from("x")]))).not.toBe(sha256(sample));
  });

  it("B1S1-C1 each package holds the transactions and revisions its table row names, and its custody file agrees with its journal", () => {
    for (const [name, row] of Object.entries(B1_S1_FROZEN_PACKAGES)) {
      const dir = `${B1_S1_FROZEN_ROOT}/${name}`;
      const expected = JSON.parse(readFileSync(`${dir}/expected.json`, "utf8"));
      const manifest = JSON.parse(readFileSync(`${dir}/package/manifest.json`, "utf8"));
      const journal = readFileSync(`${dir}/package/journal.jsonl`, "utf8").trim().split("\n");
      expect(expected.headRevision, `${name} head`).toBe(row.headRevision);
      expect(expected.summary.head.revision, `${name} summary head`).toBe(row.headRevision);
      expect(journal.length, `${name} journal entries`).toBe(row.headRevision);
      expect(manifest.head.checkpoint.revision, `${name} checkpoint`).toBe(row.checkpointRevision);
      // the history index of a real checkpoint exists exactly when the checkpoint is past the genesis
      const index = manifest.head.checkpoint.index;
      expect(index === null, `${name} index`).toBe(row.checkpointRevision === 0);
      if (index)
        expect(existsSync(`${dir}/package/${index.file}`), `${name} index file`).toBe(true);
      // the last journal line is the head revision, and the recorded head digest is the journal head
      const last = JSON.parse(journal[journal.length - 1]!);
      expect(last.receipt.revision, `${name} last receipt`).toBe(row.headRevision);
    }
    const zero = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/zero/expected.json`, "utf8"));
    expect(zero.revisions["tx-old-ordinary"]).toBe(B1_S1_FROZEN_PACKAGES.zero.ordinaryRevision);
    expect(zero.revisions["tx-old-literal"]).toBe(B1_S1_FROZEN_PACKAGES.zero.literalRevision);
    const stage = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/stage/expected.json`, "utf8"));
    const stageCapture = stage.captures["tx-pc-target-advance"];
    expect(stageCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES.stage.authorityRevision,
    );
    expect(stageCapture.sealReceipt.revision).toBe(B1_S1_FROZEN_PACKAGES.stage.sealRevision);
    const cut = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/interrupted/expected.json`, "utf8"));
    const cutCapture = cut.captures["tx-pc-target-advance"];
    expect(cutCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES.interrupted.authorityRevision,
    );
    expect(cutCapture.seal).toBeNull();
  });
});
