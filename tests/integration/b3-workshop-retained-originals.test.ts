import { generateKeyPairSync, sign } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, type OwnerFact } from "@immortalis/contracts";
import * as engine from "@immortalis/engine";
import * as operator from "@immortalis/operator";
import * as protocol from "@immortalis/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSHOP_NOTICE_CLASS,
  type WorkshopNoticeBinding,
} from "../../packages/contracts/src/workshop-opening.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import {
  openWorkshopArchive,
  publishWorkshopArchive,
  WorkshopArchiveError,
} from "../../packages/engine/host-storage/workshop-retained-originals.ts";
import { sha256Bytes } from "../../packages/engine/src/initial-setup/identity.ts";
import {
  createWorkshopAuthentication,
  productionWorkshopAuthentication,
  type WorkshopRetainedOriginals,
} from "../../packages/engine/src/owners/workshop/production-auth.ts";
import {
  workshopRef,
  type WorkshopView,
} from "../../packages/engine/src/owners/workshop/publication.ts";
import { WORKSHOP_NOTICE_RULE } from "../../packages/engine/src/owners/workshop/source.ts";
import { nodeFs } from "../../packages/engine/src/persistence/fs-ops.ts";
import { workshopRawProfile } from "../support/b3-opening.ts";

const directories: string[] = [];

async function privateDirectory(): Promise<string> {
  const directory = await mkdtemp(join(await realpath(tmpdir()), "workshop-archive-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function fact(key: string, value: OwnerFact["value"] = null): OwnerFact {
  return {
    owner: "world_state",
    facet: "world_locus",
    key,
    version: 1,
    value,
    unit: null,
    basis: "archive-evidence",
    secrecy: "sealed",
    provenance: {
      group_id: `group-${key}`,
      intent_id: `intent-${key}`,
      cause: "archive-evidence",
      rule: WORKSHOP_NOTICE_RULE,
    },
  };
}

function corpus() {
  const campaign = "test-retained-archive";
  const profile = { id: "test-only-retained-profile", raw: workshopRawProfile("glassbell") };
  const history = "test-only-retained-history";
  const base = {
    domain: "IMMORTALIS:WORKSHOP:PRODUCTION:1",
    campaign,
    profile_sha256: sha256Bytes(profile.raw),
    source: WORKSHOP_NOTICE_RULE,
  };
  const purposes = [
    "GM_INITIAL",
    "C54_COVERAGE",
    "OFFICE_REVOCATION",
    "NOTICE_RECIPIENT",
    "PLAYER_CHOICE",
  ] as const;
  const keys = new Map(purposes.map((purpose) => [purpose, generateKeyPairSync("ed25519")]));
  const pins = purposes.map((purpose) => ({
    purpose,
    source: base.source,
    publicKeySpkiBase64: keys
      .get(purpose)!
      .publicKey.export({ format: "der", type: "spki" })
      .toString("base64"),
  }));
  const adoption = [
    {
      profile: profile.id,
      profile_sha256: base.profile_sha256,
      history_verification_id: history,
      pins,
    },
  ];
  const signed = (purpose: (typeof purposes)[number], fields: object) => {
    const message = { ...base, purpose, ...fields };
    const bytes = Buffer.from(`${JSON.stringify(message, null, 2)}\n`);
    return {
      message,
      ref: sha256Bytes(bytes),
      bytes,
      signature: sign(null, bytes, keys.get(purpose)!.privateKey),
    };
  };
  const session = "retained-gm-session";
  const rpc_id_serialized = '"retained-rpc-id"';
  const identity = gmWaitX(session, rpc_id_serialized);
  if (!identity.ok) throw new Error("bad test operation identity");
  const x = identity.x;
  const gm = signed("GM_INITIAL", {
    x,
    session,
    rpc_id_serialized,
    authenticated_host: "test-gm",
    request_sha256: "a".repeat(64),
  });
  const duty = fact("duty");
  const witness = fact("witness");
  const instruction = fact("instruction");
  const occurrence = fact("occurrence", { pc_id: "test-pc" });
  const witnessRef = workshopRef(witness);
  const dutyRef = workshopRef(duty);
  const occurrenceRef = workshopRef(occurrence);
  const facts = new Map([duty, witness, instruction, occurrence].map((f) => [f.key, f]));
  const view: WorkshopView = { campaign_id: campaign, revision: 2, get: (key) => facts.get(key) };
  const preparationFields = {
    x,
    duty: duty.key,
    phase: "PREPARATION",
    request_sha256: "b".repeat(64),
    proposal_sha256: "c".repeat(64),
    preparation_sha256: null,
    witnesses: [witnessRef],
  };
  const preparation = signed("C54_COVERAGE", preparationFields);
  const boundaryFields = {
    ...preparationFields,
    phase: "EARNED_BOUNDARY",
    preparation_sha256: preparation.ref,
  };
  const boundary = signed("C54_COVERAGE", boundaryFields);
  const revocation = signed("OFFICE_REVOCATION", {
    instruction: workshopRef(instruction),
    witnesses: [witnessRef],
  });
  const recipientFields = {
    occurrence: occurrenceRef,
    recipient: "test-pc",
    witnesses: [witnessRef],
  };
  const recipient = signed("NOTICE_RECIPIENT", recipientFields);
  const decision = {
    purpose: "CONTINUE_INTERRUPTED_WORKSHOP_WAIT",
    choice: "CONTINUE",
    confirmation: "d".repeat(64),
    opportunity: {
      x,
      campaign,
      pc: "test-pc",
      seal: witnessRef,
      clock: witnessRef,
      binding: witnessRef,
      packet: witnessRef,
    },
  };
  const choice = signed("PLAYER_CHOICE", { decision });
  const binding: WorkshopNoticeBinding = {
    schema_version: 1,
    class: WORKSHOP_NOTICE_CLASS,
    campaign_id: campaign,
    x,
    notice_id: "e".repeat(64),
    world_id: "world",
    locus_id: "locus",
    attendant_id: "attendant",
    pc_id: "test-pc",
    report: "COMPLETION_CONFIRMED",
    policy: {
      source_rule_ref: base.source,
      history_verification_id: history,
      catalogue_sha256: "f".repeat(64),
    },
    pc_binding: witnessRef,
    world: witnessRef,
    locus: witnessRef,
    cue_operation: witnessRef,
    acceptance_key: "acceptance",
    duty: dutyRef,
    root_request_sha256: preparationFields.request_sha256,
    proposal_sha256: preparationFields.proposal_sha256,
    t0_witness_sha256: preparation.ref,
  };
  const originals = [gm, preparation, boundary, revocation, recipient, choice];
  const archiveAuth = (archive: WorkshopRetainedOriginals) =>
    createWorkshopAuthentication(adoption, [profile.id], profile, campaign, archive)!;
  const metadata = Buffer.from(canonicalJson({ history, pins }));
  return {
    archiveAuth,
    binding,
    campaign,
    view,
    witness,
    duty,
    instruction,
    occurrence,
    occurrenceRef,
    decision,
    metadata,
    originals,
    gm,
    preparation,
    boundary,
    revocation,
    recipient,
    choice,
    prepareFork: () => signed("C54_COVERAGE", { ...preparationFields, witnesses: [dutyRef] }),
    boundaryFork: () => signed("C54_COVERAGE", { ...boundaryFields, witnesses: [dutyRef] }),
    recipientFork: () => signed("NOTICE_RECIPIENT", { ...recipientFields, witnesses: [dutyRef] }),
    unrelated: (index: number) =>
      signed("C54_COVERAGE", { ...preparationFields, campaign: `unrelated-${index}` }),
  };
}

describe("B3-T1 host-owned retained Workshop originals", () => {
  it("keeps archive reads and publication out of the public runtime surfaces", () => {
    for (const module of [engine, operator, protocol]) {
      expect(module).not.toHaveProperty("openWorkshopArchive");
      expect(module).not.toHaveProperty("publishWorkshopArchive");
    }
  });

  it("reopens exact independently signed originals for all purposes and both C54 phases", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const digest = await publishWorkshopArchive(directory, c.originals, c.metadata);
    const archive = await openWorkshopArchive(directory, digest);
    expect(archive.snapshotSha256).toBe(digest);
    for (const original of c.originals) {
      expect(archive.read(original.ref)).toEqual({
        bytes: original.bytes,
        signature: original.signature,
      });
    }
    const auth = c.archiveAuth(archive);
    expect(auth.originalGm(c.gm.ref)).toEqual(c.gm.message);
    expect(auth.noticeSource.prepare(c.view, c.binding.x, c.duty.key)).toEqual({
      rootRequestSha256: c.binding.root_request_sha256,
      proposalSha256: c.binding.proposal_sha256,
      t0WitnessSha256: c.preparation.ref,
      refs: [c.witness],
    });
    expect(auth.noticeSource.atBoundary(c.view, c.binding)).toEqual([c.witness]);
    expect(
      auth.noticeSource.revocationSource!.authorize(c.view, c.instruction, c.revocation.ref),
    ).toEqual([c.witness]);
    expect(auth.noticeSource.recipientSource!.recipient(c.view, c.occurrence)).toEqual({
      witnesses: [c.witness],
      capability: null,
    });
    expect(auth.choiceSource.read(c.choice.ref)).toEqual(c.decision);

    const invalidSignature = { bytes: c.gm.bytes, signature: Buffer.alloc(64) };
    const invalidDigest = await publishWorkshopArchive(directory, [invalidSignature]);
    const invalidArchive = await openWorkshopArchive(directory, invalidDigest);
    expect(invalidArchive.read(c.gm.ref)).toEqual(invalidSignature);
    expect(c.archiveAuth(invalidArchive).originalGm(c.gm.ref)).toBeUndefined();

    const guarded = {
      read: vi.fn(archive.read),
      prepare: vi.fn(archive.prepare),
      atBoundary: vi.fn(archive.atBoundary),
      recipient: vi.fn(archive.recipient),
    };
    for (const mode of ["quiet", "glassbell"] as const)
      expect(
        productionWorkshopAuthentication(
          { id: `workshop-opening-${mode}-v4`, raw: workshopRawProfile(mode) },
          c.campaign,
          guarded,
        ),
      ).toBeUndefined();
    for (const read of Object.values(guarded)) expect(read).not.toHaveBeenCalled();
  });

  it("indexes the entire selected scope and lets the existing verifier refuse all three forks", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const [prepareFork, boundaryFork, recipientFork] = [
      c.prepareFork(),
      c.boundaryFork(),
      c.recipientFork(),
    ];
    const invalidSignature = { bytes: c.unrelated(5).bytes, signature: Buffer.alloc(64) };
    const records = [...c.originals, prepareFork, boundaryFork, recipientFork, invalidSignature];
    const digest = await publishWorkshopArchive(directory, records);
    expect(
      await publishWorkshopArchive(directory, [...records].reverse().concat(c.recipient)),
    ).toBe(digest);
    expect(await readdir(directory)).toEqual([`${digest}.json`]);
    const archive = await openWorkshopArchive(directory, digest);
    const prepare = () => archive.prepare(c.campaign, c.binding.x, c.duty.key);
    expect(prepare()).toEqual([c.preparation.ref, prepareFork.ref].sort());
    expect(archive.atBoundary(c.campaign, c.binding.x, c.preparation.ref)).toEqual(
      [c.boundary.ref, boundaryFork.ref].sort(),
    );
    expect(archive.recipient(c.campaign, c.occurrenceRef)).toEqual(
      [c.recipient.ref, recipientFork.ref].sort(),
    );
    expect(archive.prepare("unrelated-5", c.binding.x, c.duty.key)).toEqual([
      sha256Bytes(invalidSignature.bytes),
    ]);
    expect(archive.prepare("foreign", c.binding.x, c.duty.key)).toEqual([]);
    expect(archive.atBoundary(c.campaign, c.binding.x, c.boundary.ref)).toEqual([]);
    expect(archive.recipient("foreign", c.occurrenceRef)).toEqual([]);
    for (const change of [
      { owner: "other" },
      { facet: "other" },
      { key: "other" },
      { version: 2 },
      { group_id: "other" },
    ])
      expect(archive.recipient(c.campaign, { ...c.occurrenceRef, ...change })).toEqual([]);
    const result = prepare() as string[];
    result.length = 0;
    expect(prepare()).toHaveLength(2);
    const auth = c.archiveAuth(archive);
    expect(auth.noticeSource.prepare(c.view, c.binding.x, c.duty.key)).toBeUndefined();
    expect(auth.noticeSource.atBoundary(c.view, c.binding)).toBeUndefined();
    expect(auth.noticeSource.recipientSource!.recipient(c.view, c.occurrence)).toBeUndefined();
  });

  it("preserves old public metadata and originals through a new snapshot and backing-file mutation", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const oldDigest = await publishWorkshopArchive(directory, c.originals, c.metadata);
    const newPublic = generateKeyPairSync("ed25519").publicKey.export({
      format: "der",
      type: "spki",
    });
    const newMetadata = Buffer.from(
      canonicalJson({
        previous: c.metadata.toString("base64"),
        additional: newPublic.toString("base64"),
      }),
    );
    const newDigest = await publishWorkshopArchive(
      directory,
      [...c.originals, c.unrelated(1)],
      newMetadata,
    );
    expect(oldDigest).not.toBe(newDigest);
    expect(
      (await openWorkshopArchive(directory, newDigest)).readPublicVerificationMetadata(),
    ).toEqual(newMetadata);
    const archive = await openWorkshopArchive(directory, oldDigest);
    expect(archive.readPublicVerificationMetadata()).toEqual(c.metadata);
    archive.readPublicVerificationMetadata()!.fill(0);
    archive.read(c.gm.ref)!.signature.fill(0);
    archive.read(c.gm.ref)!.bytes.fill(0);
    await writeFile(join(directory, `${oldDigest}.json`), "changed after open");
    expect(archive.readPublicVerificationMetadata()).toEqual(c.metadata);
    expect(c.archiveAuth(archive).originalGm(c.gm.ref)).toEqual(c.gm.message);
    await expect(openWorkshopArchive(directory, oldDigest)).rejects.toThrow("digest mismatch");
    expect((await openWorkshopArchive(directory, newDigest)).read(c.gm.ref)?.bytes).toEqual(
      c.gm.bytes,
    );
  });

  it("refuses entire malformed, stale, partial and path-unsafe snapshots", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const digest = await publishWorkshopArchive(directory, c.originals);
    const path = join(directory, `${digest}.json`);
    const valid = await readFile(path);
    const manifest = JSON.parse(valid.toString("utf8")) as {
      version: number;
      originals: { ref: string; bytes: string; signature: string }[];
      public_verification_metadata: string | null;
    };
    const [first, second] = manifest.originals;
    const malformedOriginal = Buffer.from("{}");
    for (const broken of [
      "{",
      canonicalJson({ ...manifest, version: 8 }),
      canonicalJson({ version: 1, public_verification_metadata: null }),
      canonicalJson({ ...manifest, public_verification_metadata: "invalid!" }),
      canonicalJson({ ...manifest, originals: [first, first] }),
      canonicalJson({ ...manifest, originals: [...manifest.originals].reverse() }),
      canonicalJson({ ...manifest, originals: [{ ...first, bytes: second!.bytes }] }),
      canonicalJson({ ...manifest, originals: [{ ...first, signature: "AA==" }] }),
      canonicalJson({ ...manifest, originals: [{ ...first, signature: "bad!" }] }),
      canonicalJson({
        ...manifest,
        originals: [
          {
            ...first,
            ref: sha256Bytes(malformedOriginal),
            bytes: malformedOriginal.toString("base64"),
          },
        ],
      }),
      JSON.stringify(manifest, null, 2),
    ]) {
      const exact = sha256Bytes(Buffer.from(broken));
      await writeFile(join(directory, `${exact}.json`), broken);
      await expect(openWorkshopArchive(directory, exact)).rejects.toBeInstanceOf(
        WorkshopArchiveError,
      );
    }
    await expect(
      publishWorkshopArchive(directory, [c.gm, { ...c.gm, signature: Buffer.alloc(64) }]),
    ).rejects.toThrow("conflicting retained originals");
    await expect(
      publishWorkshopArchive(directory, [
        { bytes: malformedOriginal, signature: Buffer.alloc(64) },
      ]),
    ).rejects.toThrow("invalid workshop original message");
    await expect(openWorkshopArchive(directory, "../escape")).rejects.toThrow(
      "invalid workshop archive snapshot digest",
    );

    const other = await privateDirectory();
    await writeFile(join(other, `${digest}.interrupted.tmp`), valid);
    await expect(openWorkshopArchive(other, digest)).rejects.toThrow(
      "missing, unreadable or unsafe",
    );
    await symlink(path, join(other, `${digest}.json`));
    await expect(openWorkshopArchive(other, digest)).rejects.toThrow(
      "missing, unreadable or unsafe",
    );
    await symlink(directory, join(other, "alias"));
    await expect(openWorkshopArchive(join(other, "alias"), digest)).rejects.toThrow(
      "directory is inaccessible or unsafe",
    );
    await chmod(other, 0o755);
    await expect(publishWorkshopArchive(other, c.originals)).rejects.toThrow(
      "directory is inaccessible or unsafe",
    );
  });

  it("retries a lost publication acknowledgment without overwriting an existing address", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const create = nodeFs.createExclusive;
    vi.spyOn(nodeFs, "createExclusive").mockImplementationOnce(async (path, manifest) => {
      await create(path, manifest);
      throw Object.assign(new Error("test lost acknowledgment"), { code: "EIO" });
    });
    await expect(publishWorkshopArchive(directory, c.originals)).rejects.toThrow(
      "could not be published",
    );
    const [left, right] = await Promise.all([
      publishWorkshopArchive(directory, c.originals),
      publishWorkshopArchive(directory, c.originals),
    ]);
    expect(left).toBe(right);
    expect(await readdir(directory)).toEqual([`${left}.json`]);
    expect(c.archiveAuth(await openWorkshopArchive(directory, left)).originalGm(c.gm.ref)).toEqual(
      c.gm.message,
    );
    const address = join(directory, `${left}.json`);
    await writeFile(address, "corrupt existing address");
    await expect(publishWorkshopArchive(directory, c.originals)).rejects.toThrow(
      "conflicting workshop archive snapshot",
    );
    expect(await readFile(address, "utf8")).toBe("corrupt existing address");
  });

  it("keeps incremental candidate work fixed as unrelated archive records grow", async () => {
    const c = corpus();
    const directory = await privateDirectory();
    const measurements = [];
    for (const unrelated of [0, 128, 512]) {
      const records = [
        ...c.originals,
        ...Array.from({ length: unrelated }, (_, i) => c.unrelated(i)),
      ];
      const start = performance.now();
      const digest = await publishWorkshopArchive(directory, records);
      const published = performance.now();
      const archive = await openWorkshopArchive(directory, digest);
      const opened = performance.now();
      let candidates = 0;
      let directBytes = 0;
      for (let i = 0; i < 1_000; i++) {
        candidates += archive.prepare(c.campaign, c.binding.x, c.duty.key).length;
        directBytes += archive.read(c.gm.ref)!.bytes.length;
      }
      const lookupMs = performance.now() - opened;
      expect(candidates).toBe(1_000);
      expect(directBytes).toBe(1_000 * c.gm.bytes.length);
      measurements.push({
        unrelated,
        records: records.length,
        snapshotBytes: (await stat(join(directory, `${digest}.json`))).size,
        publishMs: Number((published - start).toFixed(2)),
        reopenMs: Number((opened - published).toFixed(2)),
        lookupMs: Number(lookupMs.toFixed(2)),
        candidateRefs: candidates,
        directBytes,
      });
    }
    console.info(
      "B3-T1 local archive evidence (1,000 prepare/read calls per row)",
      JSON.stringify(measurements),
    );
  });
});
