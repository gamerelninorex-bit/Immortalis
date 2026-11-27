import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson, Sha256, z } from "@immortalis/contracts";
import { sha256Bytes } from "../initial-setup/identity.ts";
import {
  WorkshopProductionMessageSchema,
  type WorkshopRetainedOriginals,
} from "../owners/workshop/production-auth.ts";
import { nodeFs } from "../persistence/fs-ops.ts";

const ArchiveV1Schema = z.strictObject({
  version: z.literal(1),
  originals: z.array(z.strictObject({ ref: Sha256, bytes: z.string(), signature: z.string() })),
  public_verification_metadata: z.string().nullable(),
});

type Original = NonNullable<ReturnType<WorkshopRetainedOriginals["read"]>>;
type Message = z.infer<typeof WorkshopProductionMessageSchema>;

export interface OpenWorkshopArchive extends WorkshopRetainedOriginals {
  readonly snapshotSha256: string;
  readPublicVerificationMetadata(): Uint8Array | undefined;
}

/** A host-side failure. A successfully opened archive can separately report an empty lookup. */
export class WorkshopArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkshopArchiveError";
  }
}

async function openPrivateDirectory(directory: string): Promise<{
  path: string;
  handle: FileHandle;
}> {
  const path = resolve(directory);
  try {
    if ((await realpath(path)) !== path) throw new Error();
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error();
      return { path, handle };
    } catch (error) {
      await handle.close();
      throw error;
    }
  } catch {
    throw new WorkshopArchiveError("workshop archive directory is inaccessible or unsafe");
  }
}

async function readSnapshot(path: string): Promise<Buffer> {
  try {
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      if (!(await handle.stat()).isFile()) throw new Error();
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch {
    throw new WorkshopArchiveError("workshop archive snapshot is missing, unreadable or unsafe");
  }
}

function decodeBase64(encoded: string): Buffer {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded)
    throw new WorkshopArchiveError("malformed workshop archive byte encoding");
  return bytes;
}

function jsonFromBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new WorkshopArchiveError("malformed workshop archive JSON");
  }
}

function originalMessage(original: Original): Message {
  if (original.bytes.length > 65_536 || original.signature.length !== 64)
    throw new WorkshopArchiveError("invalid workshop original or detached signature length");
  const parsed = WorkshopProductionMessageSchema.safeParse(jsonFromBytes(original.bytes));
  if (!parsed.success) throw new WorkshopArchiveError("invalid workshop original message");
  return parsed.data;
}

function candidateKey(message: Message): string | undefined {
  if (message.purpose === "C54_COVERAGE") {
    return message.phase === "PREPARATION"
      ? canonicalJson(["prepare", message.campaign, message.x, message.duty])
      : canonicalJson(["boundary", message.campaign, message.x, message.preparation_sha256]);
  }
  if (message.purpose === "NOTICE_RECIPIENT")
    return canonicalJson(["recipient", message.campaign, message.occurrence]);
  return undefined;
}

/** Publish explicitly supplied originals in an existing owner-only local directory. */
export async function publishWorkshopArchive(
  directory: string,
  source: readonly Original[],
  publicVerificationMetadata?: Uint8Array,
): Promise<string> {
  const records = new Map<string, { ref: string; bytes: string; signature: string }>();
  for (const original of source) {
    const bytes = Buffer.from(original.bytes);
    const signature = Buffer.from(original.signature);
    originalMessage({ bytes, signature });
    const ref = sha256Bytes(bytes);
    const record = {
      ref,
      bytes: bytes.toString("base64"),
      signature: signature.toString("base64"),
    };
    const existing = records.get(ref);
    if (existing && (existing.bytes !== record.bytes || existing.signature !== record.signature))
      throw new WorkshopArchiveError("conflicting retained originals for one content digest");
    records.set(ref, record);
  }
  const manifest = canonicalJson({
    version: 1,
    originals: [...records.keys()].sort().map((ref) => records.get(ref)!),
    public_verification_metadata: publicVerificationMetadata
      ? Buffer.from(publicVerificationMetadata).toString("base64")
      : null,
  });
  const bytes = Buffer.from(manifest, "utf8");
  const snapshotSha256 = sha256Bytes(bytes);
  const root = await openPrivateDirectory(directory);
  try {
    const path = join(root.path, `${snapshotSha256}.json`);
    try {
      await nodeFs.createExclusive(path, manifest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        throw new WorkshopArchiveError("workshop archive snapshot could not be published");
      // A retry after an unknown outcome succeeds only for the same complete snapshot.
      if (!(await readSnapshot(path)).equals(bytes))
        throw new WorkshopArchiveError("conflicting workshop archive snapshot at content address");
    }
    try {
      await root.handle.sync();
    } catch {
      throw new WorkshopArchiveError("workshop archive publication durability is unconfirmed");
    }
    return snapshotSha256;
  } finally {
    await root.handle.close();
  }
}

/** Open exactly the independently selected snapshot and validate it before serving any lookup. */
export async function openWorkshopArchive(
  directory: string,
  expectedSha256: string,
): Promise<OpenWorkshopArchive> {
  if (!Sha256.safeParse(expectedSha256).success)
    throw new WorkshopArchiveError("invalid workshop archive snapshot digest");
  const root = await openPrivateDirectory(directory);
  let bytes: Buffer;
  try {
    bytes = await readSnapshot(join(root.path, `${expectedSha256}.json`));
  } finally {
    await root.handle.close();
  }
  if (sha256Bytes(bytes) !== expectedSha256)
    throw new WorkshopArchiveError("workshop archive snapshot digest mismatch");

  const parsed = ArchiveV1Schema.safeParse(jsonFromBytes(bytes));
  if (!parsed.success || canonicalJson(parsed.data) !== bytes.toString("utf8"))
    throw new WorkshopArchiveError("invalid workshop archive manifest");

  const originals = new Map<string, Original>();
  const candidates = new Map<string, string[]>();
  let previous = "";
  for (const record of parsed.data.originals) {
    const original = {
      bytes: decodeBase64(record.bytes),
      signature: decodeBase64(record.signature),
    };
    if (record.ref <= previous || sha256Bytes(original.bytes) !== record.ref)
      throw new WorkshopArchiveError("invalid workshop archive content digest or record order");
    const key = candidateKey(originalMessage(original));
    originals.set(record.ref, original);
    if (key !== undefined) {
      const refs = candidates.get(key);
      if (refs) refs.push(record.ref);
      else candidates.set(key, [record.ref]);
    }
    previous = record.ref;
  }
  const metadata = parsed.data.public_verification_metadata;
  const retainedMetadata = metadata === null ? undefined : decodeBase64(metadata);
  const lookup = (key: readonly unknown[]) => [...(candidates.get(canonicalJson(key)) ?? [])];

  // Lookups use only validated memory and return defensive copies of retained data.
  return Object.freeze<OpenWorkshopArchive>({
    snapshotSha256: expectedSha256,
    read(ref) {
      const original = originals.get(ref);
      return (
        original && {
          bytes: Buffer.from(original.bytes),
          signature: Buffer.from(original.signature),
        }
      );
    },
    prepare: (campaign, x, duty) => lookup(["prepare", campaign, x, duty]),
    atBoundary: (campaign, x, preparation) => lookup(["boundary", campaign, x, preparation]),
    recipient: (campaign, occurrence) => lookup(["recipient", campaign, occurrence]),
    readPublicVerificationMetadata: () => retainedMetadata && Buffer.from(retainedMetadata),
  });
}
