import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ChronologyCaptureSchema,
  ChronologyCaptureV2Schema,
  ChronologyDocumentSchema,
  ChronologyDocumentV2Schema,
  ChronologyEvidenceSchema,
  InitialSetupInputSchema,
  SI_SCALE_DECLARATION,
  canonicalJson,
} from "@immortalis/contracts";
import { chronologyEvidenceViolation } from "@immortalis/engine";
import { StartingChronologySchema } from "@immortalis/operator";
import { V1_DOCUMENT, V2_DOCUMENT, rehash, v1Capture, v2Capture } from "../support/clock-origin.ts";

/**
 * F-014B A0 (CAL-TIME T-1 §2, BLUE Alt I) — the strict two-arm ChronologyEvidence union. T1 MECHANISM ONLY.
 *
 * A0-T01: the v1 arm is the shipped schema object, unchanged; the A0-T00 corpus file is byte-identical to the accepted source-lock
 *         commit and is run unchanged against the union (it is its own file; this test only proves nothing moved under it).
 * A0-T02: the v2 contract table.
 * A0-T03: the legacy parsers refuse a v2 document.
 */
const CAMPAIGN = "campaign-a0-contract";
const ACCEPTED_LOCK_COMMIT = "37ba11bd0f0f068a22731f87351a0fd9a16a885b";
const CORPUS = "tests/contract/chronology-v1-baseline-corpus.test.ts";

const git = (...args: string[]): string | null => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return null;
  }
};

describe("A0-T01: the v1 arm is unchanged", () => {
  it("the A0-T00 corpus file is byte-identical to the accepted source-lock commit (where history is available)", () => {
    const accepted = git("rev-parse", `${ACCEPTED_LOCK_COMMIT}:${CORPUS}`);
    if (accepted === null) return; // a shallow checkout cannot prove it; it never claims it
    expect(git("hash-object", CORPUS)).toBe(accepted);
  });

  it("the union's v1 arm IS the shipped capture schema, and the v1 document schema is not widened", () => {
    expect(ChronologyEvidenceSchema.options[0]).toBe(ChronologyCaptureSchema);
    expect(ChronologyEvidenceSchema.options[1]).toBe(ChronologyCaptureV2Schema);
    expect(ChronologyEvidenceSchema.options).toHaveLength(2);
    expect(ChronologyDocumentSchema.safeParse(V2_DOCUMENT).success).toBe(false);
    expect(ChronologyDocumentSchema.safeParse(V1_DOCUMENT).success).toBe(true);
  });

  it("a v1 capture is accepted by the union exactly as by the v1 schema, with identical output and canonical JSON", () => {
    const c = v1Capture({ campaignId: CAMPAIGN });
    const viaUnion = ChronologyEvidenceSchema.parse(c);
    const viaV1 = ChronologyCaptureSchema.parse(c);
    expect(viaUnion).toEqual(viaV1);
    expect(canonicalJson(viaUnion)).toBe(canonicalJson(viaV1));
    expect(chronologyEvidenceViolation(viaUnion, CAMPAIGN)).toBeNull();
  });

  it("InitialSetupInput's outer shape is unchanged: format_version 1, the same field set, and a v1 chronology still parses", () => {
    const shape = Object.keys(InitialSetupInputSchema.shape);
    expect(shape).toEqual([
      "format",
      "format_version",
      "world_id",
      "locus_id",
      "source",
      "pc",
      "setup_id",
      "scope_fingerprint",
      "setup_message",
      "author",
      "chronology",
      "genesis",
      "projection_hash",
      "pre_state",
      "runner",
      "parser",
    ]);
    expect(InitialSetupInputSchema.shape.format_version.safeParse(1).success).toBe(true);
    expect(InitialSetupInputSchema.shape.format_version.safeParse(2).success).toBe(false);
    expect(InitialSetupInputSchema.shape.parser.options).toEqual([
      "INITIAL_LOCALITY_PARSER_V1",
      "INITIAL_LOCALITY_PARSER_V2",
    ]);
  });
});

describe("A0-T02: the strict v2 contract table", () => {
  it("accepts a valid strict v2 capture, whose hashes are self-consistent and version-distinct from v1", () => {
    const c = v2Capture({ campaignId: CAMPAIGN });
    expect(ChronologyEvidenceSchema.safeParse(c).success).toBe(true);
    expect(ChronologyCaptureV2Schema.safeParse(c).success).toBe(true);
    expect(c.document.scale).toBe(SI_SCALE_DECLARATION);
    expect(chronologyEvidenceViolation(c, CAMPAIGN)).toBeNull();
    const v1 = v1Capture({ campaignId: CAMPAIGN });
    expect(c.document_hash).not.toBe(v1.document_hash);
    expect(c.capture_hash).not.toBe(v1.capture_hash);
  });

  it("each arm refuses the other arm's document: no cross-arm acceptance", () => {
    const v2 = v2Capture({ campaignId: CAMPAIGN });
    const v1 = v1Capture({ campaignId: CAMPAIGN });
    // a v2 document inside a v1 capture fails the v1 arm's literal-1 document
    expect(ChronologyEvidenceSchema.safeParse({ ...v1, document: V2_DOCUMENT }).success).toBe(false);
    // a v1 document inside a v2 capture fails scale and the v2 document version
    expect(ChronologyEvidenceSchema.safeParse({ ...v2, document: V1_DOCUMENT }).success).toBe(false);
    // the version literal and the document version must agree
    expect(ChronologyEvidenceSchema.safeParse({ ...v1, format_version: 2 }).success).toBe(false);
    expect(ChronologyEvidenceSchema.safeParse({ ...v2, format_version: 1 }).success).toBe(false);
    expect(ChronologyDocumentV2Schema.safeParse(V1_DOCUMENT).success).toBe(false);
    for (const bad of [0, 3, "2", null, undefined])
      expect(ChronologyEvidenceSchema.safeParse({ ...v2, format_version: bad }).success).toBe(false);
  });

  it("a v2 document with no scale, an extra field, or any other scale value is refused", () => {
    const { scale: _scale, ...noScale } = V2_DOCUMENT;
    expect(ChronologyDocumentV2Schema.safeParse(noScale).success).toBe(false);
    expect(ChronologyDocumentV2Schema.safeParse({ ...V2_DOCUMENT, epoch: "default" }).success).toBe(
      false,
    );
    for (const scale of [
      "ONE_SI_SECOND_PER_CANONICAL_UNIT ",
      "one_si_second_per_canonical_unit",
      "ONE_SI_MINUTE_PER_CANONICAL_UNIT",
      "ONE_SI_SECOND_PER_UNIT",
      "",
      1,
      true,
      null,
      { v: SI_SCALE_DECLARATION },
    ])
      expect(ChronologyDocumentV2Schema.safeParse({ ...V2_DOCUMENT, scale }).success, String(scale)).toBe(
        false,
      );
    // every v2 capture field is closed too
    const v2 = v2Capture({ campaignId: CAMPAIGN });
    expect(ChronologyEvidenceSchema.safeParse({ ...v2, extra: 1 }).success).toBe(false);
    expect(
      ChronologyEvidenceSchema.safeParse({ ...v2, document: { ...V2_DOCUMENT, scale: undefined } })
        .success,
    ).toBe(false);
    const { capture_hash: _h, ...noHash } = v2;
    expect(ChronologyEvidenceSchema.safeParse(noHash).success).toBe(false);
  });

  it("a v2 capture with the wrong document_hash or capture_hash is refused by the shared capture check", () => {
    const v2 = v2Capture({ campaignId: CAMPAIGN });
    const flip = (h: string) => (h[0] === "0" ? "1" : "0") + h.slice(1);
    expect(chronologyEvidenceViolation({ ...v2, document_hash: flip(v2.document_hash) }, CAMPAIGN))
      .toMatchObject({ reason: "CHRONOLOGY_HASH" });
    expect(chronologyEvidenceViolation({ ...v2, capture_hash: flip(v2.capture_hash) }, CAMPAIGN))
      .toMatchObject({ reason: "CHRONOLOGY_HASH" });
    // a document change that keeps the old document_hash is also caught
    expect(
      chronologyEvidenceViolation(
        { ...v2, document: { ...V2_DOCUMENT, statement: "SYNTHETIC FIXTURE: another" } },
        CAMPAIGN,
      ),
    ).toMatchObject({ reason: "CHRONOLOGY_HASH" });
    // the v2 bytes cannot be re-labelled as v1 and keep a valid capture hash
    expect(chronologyEvidenceViolation({ ...v2, format_version: 1 } as never, CAMPAIGN)).not.toBeNull();
    expect(chronologyEvidenceViolation(v2, "campaign-other")).toMatchObject({
      reason: "CHRONOLOGY_CAMPAIGN",
    });
  });

  it("TOOL_CALL_ONLY is refused by the shared check on both arms, and an ORIGINAL_MESSAGE_VERIFIED capture must name its message", () => {
    for (const make of [v1Capture, v2Capture] as const) {
      expect(
        chronologyEvidenceViolation(
          make({ campaignId: CAMPAIGN, grade: "TOOL_CALL_ONLY" } as never),
          CAMPAIGN,
        ),
      ).toMatchObject({ reason: "CHRONOLOGY_GRADE" });
      expect(
        chronologyEvidenceViolation(
          rehash(make({ campaignId: CAMPAIGN, originalMessageHash: null } as never)),
          CAMPAIGN,
        ),
      ).toMatchObject({ reason: "CHRONOLOGY_GRADE" });
    }
  });
});

describe("A0-T03: the legacy parsers stay strictly v1 and refuse a v2 document", () => {
  it("StartingChronologySchema (initialize-time and the phone parsers' shared schema) refuses every v2 shape", () => {
    expect(StartingChronologySchema.safeParse(V1_DOCUMENT).success).toBe(true);
    expect(StartingChronologySchema.safeParse(V2_DOCUMENT).success).toBe(false);
    expect(
      StartingChronologySchema.safeParse({ ...V1_DOCUMENT, scale: SI_SCALE_DECLARATION }).success,
    ).toBe(false);
    expect(StartingChronologySchema.safeParse({ ...V2_DOCUMENT, format_version: 1 }).success).toBe(
      false,
    );
  });
});
