/* eslint-disable @typescript-eslint/no-explicit-any -- tests build malformed requests and read raw records */
// F-014B A1-1 — the operator-side STRICT version 2 chronology capture: derive, hash, persist, deduplicate, read and re-validate. T1
// MECHANISM ONLY: the operator console is scripted and every "verified" proof is a labelled fixture double; this is NOT original-message
// authenticity, NOT a production result, NOT a named client and NOT first-playable waiting. A1-2 (host tool, author proof, driver) is untouched.
//
// Every negative differs from its accepted control by exactly ONE change, and every expected value is recomputed in
// tests/support/operator-capture.ts from the contract text, never read back from the code under test.
//   A1-T01  the version 2 request: derived capture, whole-document confirmation, durable acceptance BEFORE the token is consumed, refusals
//   A1-T02  the protected store: version 1 and version 2 side by side, strict re-validation, safe retry, no cross-version reuse, tampering
//   A1-T03a hash and grade forgery against the trusted-intake verification
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  ChronologyCaptureV2Schema,
  canonicalJson,
  type ChronologyCapture,
  type ChronologyCaptureV2,
  type ChronologyEvidence,
} from "@immortalis/contracts";
import { PRODUCTION_INITIAL_SETUP_POLICY, nodeFs } from "@immortalis/engine";
import {
  ChronologyCaptureStore,
  ProtectedStore,
  UnavailableEvidenceVerifier,
  captureStartingChronology,
  verifyCaptureForIntake,
  type CaptureContext,
  type CaptureRequest,
  type CaptureRequestV2,
  type IntakeRequest,
} from "@immortalis/operator";
import {
  FIXTURE_MESSAGE_METHOD,
  FixtureEvidenceVerifier,
  fixtureProofHash,
} from "@immortalis/testkit";
import {
  AUTHORED,
  SI_LITERAL,
  canon,
  expectedCapture,
  expectedV1Document,
  expectedV2Document,
  operatorSource,
  reseal,
  scriptedConsole,
  sha256,
  type Source,
} from "../support/operator-capture.ts";
import { FIXTURE_POLICY } from "../support/initial-setup.ts";
import { snapshotDir, tempDir } from "../support/tmp.ts";

// The order in which the acceptance is stored and the ephemeral token is consumed is observed by wrapping the confirmation module's
// consume function (a pass-through spy: it changes nothing about the confirmation itself).
const seen = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock("../../packages/operator/src/confirmation.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../packages/operator/src/confirmation.ts")>();
  return {
    ...real,
    consumeConfirmation: (...args: Parameters<typeof real.consumeConfirmation>) => {
      seen.order.push("consume");
      return real.consumeConfirmation(...args);
    },
  };
});

const CAMPAIGN = "campaign-a1-1";
const MAC = Buffer.alloc(32, 21); // public deterministic test data
const STORE_FORMAT = "immortalis-chronology-capture-store"; // the on-disk store's envelope format name

const rig = (campaignId = CAMPAIGN) => {
  const dir = tempDir("a1-1-capture-");
  const store = new ChronologyCaptureStore({ dir, macKey: MAC });
  const ctx = (extra: Partial<CaptureContext> = {}): CaptureContext => ({
    campaignId,
    store,
    verifier: new FixtureEvidenceVerifier() as any,
    policy: FIXTURE_POLICY,
    ...extra,
  });
  return { dir, store, ctx };
};
/** The raw protected store under the capture store: the way a test writes a record the operator would never write. */
const rawStore = (dir: string) =>
  new ProtectedStore({
    dir: join(dir, "chronology-captures"),
    format: STORE_FORMAT,
    macKey: MAC,
  });

const OP = "OPERATOR_CONFIRMED_RECORD_ONLY" as const;
const requestV2 = (over: Partial<CaptureRequestV2> = {}): CaptureRequestV2 => ({
  capture_ref: "fixture:capture:v2-1",
  authored: AUTHORED,
  declares_one_si_second_per_unit: true,
  grade: OP,
  source: operatorSource(FIXTURE_MESSAGE_METHOD),
  ...over,
});
const requestV1 = (over: Partial<CaptureRequest> = {}): CaptureRequest => ({
  capture_ref: "fixture:capture:v1-1",
  document: expectedV1Document(AUTHORED),
  grade: OP,
  source: operatorSource(FIXTURE_MESSAGE_METHOD),
  ...over,
});
const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);
const allOf = async (store: ChronologyCaptureStore) => {
  const r = await store.all();
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("A1-T01 [mechanism only] the version 2 request: the operator derives the complete strict capture", () => {
  it("A1-T01 [mechanism only] derives format, versions, scale, both hashes and the campaign binding; the console is shown the WHOLE document once; the record equals the test's own recomputation", async () => {
    const { store, ctx } = rig();
    const term = scriptedConsole("confirm");
    const captured = must(await captureStartingChronology(ctx({ terminal: term }), requestV2()));
    const expected = expectedCapture({
      arm: 2,
      campaignId: CAMPAIGN,
      captureRef: "fixture:capture:v2-1",
      authored: AUTHORED,
      grade: OP,
      source: operatorSource(FIXTURE_MESSAGE_METHOD),
    });
    expect(captured).toEqual(expected);
    expect(ChronologyCaptureV2Schema.safeParse(captured).success).toBe(true);
    expect(captured.document).toMatchObject({ format_version: 2, scale: SI_LITERAL });
    // the console was asked exactly once and shown every member of the document, the declared scale among them
    expect(term.asks()).toBe(1);
    expect(term.said).toContain(JSON.stringify(expectedV2Document(AUTHORED), null, 2));
    expect(term.said.join("\n")).toContain(`"scale": "${SI_LITERAL}"`);
    // the acceptance is durable and reads back identically
    expect(must(await store.read("fixture:capture:v2-1"))).toEqual(expected);
    expect(await allOf(store)).toEqual([expected]);
    // the grade is the one mechanism that ran: a confirmation is not authorship of the original message
    expect(captured.grade).toBe(OP);
    expect(captured.source.original_message_hash).toBeNull();
  });

  it("A1-T01 [mechanism only] the independent canonical serialization used for the recomputation agrees with the contract's on the specimens", () => {
    for (const specimen of [
      expectedV2Document(AUTHORED),
      expectedV1Document(AUTHORED),
      expectedCapture({
        arm: 2,
        campaignId: CAMPAIGN,
        captureRef: "r",
        authored: AUTHORED,
        grade: OP,
        source: operatorSource(FIXTURE_MESSAGE_METHOD),
      }),
    ])
      expect(canon(specimen)).toBe(canonicalJson(specimen));
  });

  it("A1-T01 [mechanism only] the acceptance is stored BEFORE the ephemeral token is consumed; a failed store write consumes nothing and records nothing", async () => {
    // control: the store write happens, then the token is consumed
    const lawful = rig();
    seen.order.length = 0;
    const writes = {
      ...nodeFs,
      createExclusive: async (...args: Parameters<typeof nodeFs.createExclusive>) => {
        seen.order.push("store-create");
        return nodeFs.createExclusive(...args);
      },
    };
    const ordered = new ChronologyCaptureStore({ dir: lawful.dir, macKey: MAC, fs: writes });
    must(
      await captureStartingChronology(
        { ...lawful.ctx({ terminal: scriptedConsole("confirm") }), store: ordered },
        requestV2(),
      ),
    );
    expect(seen.order).toEqual(["store-create", "consume"]);

    // one change: the store write fails
    const broken = rig();
    seen.order.length = 0;
    const failing = new ChronologyCaptureStore({
      dir: broken.dir,
      macKey: MAC,
      fs: {
        ...nodeFs,
        createExclusive: async () => {
          seen.order.push("store-create");
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        },
      },
    });
    const refused = await captureStartingChronology(
      { ...broken.ctx({ terminal: scriptedConsole("confirm") }), store: failing },
      requestV2(),
    );
    expect(codeOf(refused)).toBe("STORE_WRITE_FAILED");
    expect(seen.order).toEqual(["store-create"]); // the token was never consumed
    expect(await allOf(broken.store)).toEqual([]);
  });

  it("A1-T01 [mechanism only] no default scale and no default unit: each missing or wrong declaration is refused, never a version 2 and never a quiet version 1", async () => {
    const control = rig();
    expect(
      codeOf(
        await captureStartingChronology(
          control.ctx({ terminal: scriptedConsole("confirm") }),
          requestV2(),
        ),
      ),
    ).toBe("OK");

    const without = (k: string) => {
      const r: any = { ...requestV2() };
      delete r[k];
      return r;
    };
    const cases: [string, any][] = [
      ["declaration absent", without("declares_one_si_second_per_unit")],
      ["declaration false", requestV2({ declares_one_si_second_per_unit: false as any })],
      [
        "declaration the string true",
        requestV2({ declares_one_si_second_per_unit: "true" as any }),
      ],
      ["declaration the number one", requestV2({ declares_one_si_second_per_unit: 1 as any })],
      [
        "declaration is the scale literal instead of the declaration",
        requestV2({ declares_one_si_second_per_unit: SI_LITERAL as any }),
      ],
      [
        "authored carries a scale",
        requestV2({ authored: { ...AUTHORED, scale: SI_LITERAL } as any }),
      ],
      [
        "authored carries a different scale literal",
        requestV2({ authored: { ...AUTHORED, scale: "ONE_DAY_PER_CANONICAL_UNIT" } as any }),
      ],
      [
        "authored carries a format_version",
        requestV2({ authored: { ...AUTHORED, format_version: 2 } as any }),
      ],
      [
        "authored carries a format",
        requestV2({ authored: { ...AUTHORED, format: "immortalis-starting-chronology" } as any }),
      ],
      [
        "authored has no unit",
        requestV2({ authored: { statement: AUTHORED.statement, value: 0 } as any }),
      ],
      [
        "authored has no value",
        requestV2({ authored: { statement: AUTHORED.statement, unit: "seconds" } as any }),
      ],
      ["authored has no statement", requestV2({ authored: { value: 0, unit: "seconds" } as any })],
      ["authored unit is empty", requestV2({ authored: { ...AUTHORED, unit: "" } })],
      ["authored value is negative", requestV2({ authored: { ...AUTHORED, value: -1 } })],
      ["authored value is fractional", requestV2({ authored: { ...AUTHORED, value: 1.5 } })],
      ["authored is an array", requestV2({ authored: [AUTHORED.statement, 0, "seconds"] as any })],
      ["authored is null", requestV2({ authored: null as any })],
      [
        "authored is an array that carries the three members",
        requestV2({ authored: Object.assign([], AUTHORED) as any }),
      ],
      ["authored is undefined", requestV2({ authored: undefined as any })],
      ["authored is a string", requestV2({ authored: AUTHORED.statement as any })],
      [
        "a version 1 document is also named",
        { ...requestV2(), document: expectedV1Document(AUTHORED) },
      ],
    ];
    for (const [name, req] of cases) {
      const t = rig();
      const term = scriptedConsole("confirm");
      const r = await captureStartingChronology(t.ctx({ terminal: term }), req);
      expect(codeOf(r), name).toBe("DOCUMENT_INVALID");
      expect(await allOf(t.store), name).toEqual([]); // no record of either arm
      expect(term.asks(), name).toBe(0); // and nobody was asked to confirm something the operator could not derive
    }
  });

  it("A1-T01 [mechanism only] the order of the authored members is not part of the words: the same capture results", async () => {
    const t = rig();
    const reordered = { value: AUTHORED.value, unit: AUTHORED.unit, statement: AUTHORED.statement };
    const captured = must(
      await captureStartingChronology(
        t.ctx({ terminal: scriptedConsole("confirm") }),
        requestV2({ authored: reordered }),
      ),
    );
    expect(captured).toEqual(
      expectedCapture({
        arm: 2,
        campaignId: CAMPAIGN,
        captureRef: "fixture:capture:v2-1",
        authored: AUTHORED,
        grade: OP,
        source: operatorSource(FIXTURE_MESSAGE_METHOD),
      }),
    );
  });

  it("A1-T01 [mechanism only] the envelope the operator seals is itself checked against the strict contract: a malformed reference or source is refused unasked", async () => {
    const cases: [string, Partial<CaptureRequestV2>][] = [
      ["an empty capture reference", { capture_ref: "" }],
      [
        "an attestation that is not a SHA-256",
        { source: { ...operatorSource(FIXTURE_MESSAGE_METHOD), attestation_hash: "not-a-hash" } },
      ],
      ["an empty client", { source: { ...operatorSource(FIXTURE_MESSAGE_METHOD), client: "" } }],
    ];
    for (const [name, over] of cases) {
      const t = rig();
      const term = scriptedConsole("confirm");
      const r = await captureStartingChronology(t.ctx({ terminal: term }), requestV2(over));
      expect(codeOf(r), name).toBe("DOCUMENT_INVALID");
      expect(term.asks(), name).toBe(0);
      expect(await allOf(t.store), name).toEqual([]);
    }
  });

  it("A1-T01 [mechanism only] the document keeps its transport bound: a statement over it is refused unasked, and one under it is the control", async () => {
    const under = rig();
    const small = await captureStartingChronology(
      under.ctx({ terminal: scriptedConsole("confirm") }),
      requestV2({ authored: { ...AUTHORED, statement: "x".repeat(60_000) } }),
    );
    expect(codeOf(small)).toBe("OK");
    const over = rig();
    const term = scriptedConsole("confirm");
    const big = await captureStartingChronology(
      over.ctx({ terminal: term }),
      requestV2({ authored: { ...AUTHORED, statement: "x".repeat(70_000) } }),
    );
    expect(codeOf(big)).toBe("DOCUMENT_OVERSIZE");
    expect(term.asks()).toBe(0);
    expect(await allOf(over.store)).toEqual([]);
  });

  it("A1-T01 [mechanism only] a declining console records nothing; no console is an unresolved authority; the confirming console is the control", async () => {
    const t = rig();
    const declined = await captureStartingChronology(
      t.ctx({ terminal: scriptedConsole("decline") }),
      requestV2(),
    );
    expect(codeOf(declined)).toBe("DECLINED");
    const none = await captureStartingChronology(t.ctx(), requestV2());
    expect(codeOf(none)).toBe("UNRESOLVED_AUTHORITY");
    expect(await allOf(t.store)).toEqual([]);
    const confirmed = await captureStartingChronology(
      t.ctx({ terminal: scriptedConsole("confirm") }),
      requestV2(),
    );
    expect(codeOf(confirmed)).toBe("OK");
    expect(await allOf(t.store)).toHaveLength(1);
  });

  it("A1-T01 [mechanism only] TOOL_CALL_ONLY is capturable for diagnostics, asks nobody, and never passes trusted-intake verification", async () => {
    const t = rig();
    const term = scriptedConsole("confirm");
    const tool = must(
      await captureStartingChronology(
        t.ctx({ terminal: term }),
        requestV2({ capture_ref: "fixture:capture:tool", grade: "TOOL_CALL_ONLY" }),
      ),
    );
    expect(tool.grade).toBe("TOOL_CALL_ONLY");
    expect(term.asks()).toBe(0);
    const verify = (c: ChronologyEvidence) =>
      verifyCaptureForIntake(
        { campaignId: CAMPAIGN, verifier: t.ctx().verifier, policy: FIXTURE_POLICY },
        c,
      );
    const refused = await verify(tool);
    expect(codeOf(refused)).toBe("DOCUMENT_INVALID");
    expect(JSON.stringify(refused)).toContain("TOOL_CALL_ONLY");
    // one change: the same chronology with the grade a confirmation establishes
    const confirmed = must(
      await captureStartingChronology(t.ctx({ terminal: scriptedConsole("confirm") }), requestV2()),
    );
    expect(codeOf(await verify(confirmed))).toBe("OK");
  });

  it("A1-T01 [mechanism only] a fixture method id is refused under the production policy, a real one under the fixture policy; the matching pair is the control", async () => {
    const prod = rig();
    const realSource = operatorSource("operator-console-1");
    const asProd = (over: Partial<CaptureRequestV2>) =>
      captureStartingChronology(
        prod.ctx({
          policy: PRODUCTION_INITIAL_SETUP_POLICY,
          verifier: UnavailableEvidenceVerifier,
          terminal: scriptedConsole("confirm"),
        }),
        requestV2({ source: realSource, ...over }),
      );
    expect(codeOf(await asProd({}))).toBe("OK"); // control: the chronology half works under the production policy
    expect(
      codeOf(
        await asProd({ capture_ref: "cap-2", source: operatorSource(FIXTURE_MESSAGE_METHOD) }),
      ),
    ).toBe("RESERVED_NAMESPACE");
    const fixture = rig();
    expect(
      codeOf(
        await captureStartingChronology(
          fixture.ctx({ terminal: scriptedConsole("confirm") }),
          requestV2({ source: realSource }),
        ),
      ),
    ).toBe("RESERVED_NAMESPACE");
    expect(await allOf(fixture.store)).toEqual([]);
  });

  it("A1-T01 [mechanism only] an original-message grade needs the verifier: the unavailable production verifier refuses, the fixture proof is the control, and no original hash is refused", async () => {
    const message = "SYNTHETIC FIXTURE: a setup message";
    const hash = sha256(message);
    const originalSource: Source = {
      ...operatorSource(FIXTURE_MESSAGE_METHOD),
      original_message_hash: hash,
      attestation_hash: fixtureProofHash(hash),
    };
    const original = (over: Partial<CaptureRequestV2> = {}) =>
      requestV2({ grade: "ORIGINAL_MESSAGE_VERIFIED", source: originalSource, ...over });
    const t = rig();
    const ok = must(await captureStartingChronology(t.ctx(), original()));
    expect(ok.grade).toBe("ORIGINAL_MESSAGE_VERIFIED");
    expect(ok.source.original_message_hash).toBe(hash);
    // one change: the production verifier (a real policy and a real method id so only the verifier differs)
    const prod = rig();
    const refused = await captureStartingChronology(
      prod.ctx({ policy: PRODUCTION_INITIAL_SETUP_POLICY, verifier: UnavailableEvidenceVerifier }),
      original({ source: { ...originalSource, method_id: "message-method-1" } }),
    );
    expect(codeOf(refused)).toBe("UNRESOLVED_AUTHORITY");
    expect(await allOf(prod.store)).toEqual([]);
    // one change: no original message is named
    const noHash = await captureStartingChronology(
      rig().ctx(),
      original({ source: { ...originalSource, original_message_hash: null } }),
    );
    expect(codeOf(noHash)).toBe("UNRESOLVED_AUTHORITY");
    // one change: the proof does not match the message
    const wrong = await captureStartingChronology(
      rig().ctx(),
      original({ source: { ...originalSource, attestation_hash: "0".repeat(64) } }),
    );
    expect(codeOf(wrong)).toBe("UNRESOLVED_AUTHORITY");
  });
});

describe("A1-T02 [mechanism only] the protected store: both arms side by side, strict re-validation, safe retry", () => {
  it("A1-T02 [mechanism only] a version 1 and a version 2 capture of the same words coexist; all() and read() return each exactly; neither reuses the other", async () => {
    const t = rig();
    const term = scriptedConsole("confirm");
    const v1 = must(await captureStartingChronology(t.ctx({ terminal: term }), requestV1()));
    expect(term.asks()).toBe(1);
    const v2 = must(await captureStartingChronology(t.ctx({ terminal: term }), requestV2()));
    expect(term.asks()).toBe(2); // the version 2 request was its own question: a version 1 record of the same words and time is not reused
    expect(v1.format_version).toBe(1);
    expect(v2.format_version).toBe(2);
    expect(v1.document_hash).not.toBe(v2.document_hash);
    const all = await allOf(t.store);
    expect(all).toHaveLength(2);
    expect(all).toContainEqual(
      expectedCapture({
        arm: 1,
        campaignId: CAMPAIGN,
        captureRef: "fixture:capture:v1-1",
        authored: AUTHORED,
        grade: OP,
        source: operatorSource(FIXTURE_MESSAGE_METHOD),
      }),
    );
    expect(all).toContainEqual(
      expectedCapture({
        arm: 2,
        campaignId: CAMPAIGN,
        captureRef: "fixture:capture:v2-1",
        authored: AUTHORED,
        grade: OP,
        source: operatorSource(FIXTURE_MESSAGE_METHOD),
      }),
    );
    expect(must(await t.store.read("fixture:capture:v1-1"))).toEqual(v1);
    expect(must(await t.store.read("fixture:capture:v2-1"))).toEqual(v2);
    // the version 1 path still works with a version 2 record present (it failed closed on any non-v1 record before)
    expect(
      codeOf(
        await captureStartingChronology(
          t.ctx({ terminal: term }),
          requestV1({
            capture_ref: "fixture:capture:v1-2",
            document: expectedV1Document({ ...AUTHORED, value: 3 }),
          }),
        ),
      ),
    ).toBe("OK");
  });

  it("A1-T02 [mechanism only] an identical retry returns the stored capture and asks nobody; a changed word is a new question", async () => {
    const t = rig();
    const first = scriptedConsole("confirm");
    const stored = must(await captureStartingChronology(t.ctx({ terminal: first }), requestV2()));
    // the retry arrives with a console that would DECLINE: it is never consulted because the stored capture is reused
    const retryConsole = scriptedConsole("decline");
    const again = await captureStartingChronology(t.ctx({ terminal: retryConsole }), requestV2());
    expect(again).toEqual({ ok: true, value: stored });
    expect(retryConsole.asks()).toBe(0);
    expect(retryConsole.said).toEqual([]);
    expect(await allOf(t.store)).toEqual([stored]);
    // one change: a different statement is not the stored document, so the declining console is consulted and nothing is recorded
    const other = await captureStartingChronology(
      t.ctx({ terminal: retryConsole }),
      requestV2({
        capture_ref: "fixture:capture:v2-2",
        authored: { ...AUTHORED, statement: `${AUTHORED.statement}, again` },
      }),
    );
    expect(codeOf(other)).toBe("DECLINED");
    expect(retryConsole.asks()).toBe(1);
    expect(await allOf(t.store)).toEqual([stored]);
    // and a retry for a DIFFERENT campaign is not the stored capture of this one
    const elsewhere = must(
      await captureStartingChronology(
        { ...t.ctx({ terminal: scriptedConsole("confirm") }), campaignId: "campaign-elsewhere" },
        requestV2({ capture_ref: "fixture:capture:v2-elsewhere" }),
      ),
    );
    expect(elsewhere.campaign_id).toBe("campaign-elsewhere");
    expect(elsewhere.capture_hash).not.toBe(stored.capture_hash);
  });

  it("A1-T02 [mechanism only] a diagnostic TOOL_CALL_ONLY capture is never reused: the same words under two references are two records", async () => {
    const t = rig();
    const first = must(
      await captureStartingChronology(
        t.ctx(),
        requestV2({ capture_ref: "tool-a", grade: "TOOL_CALL_ONLY" }),
      ),
    );
    const second = must(
      await captureStartingChronology(
        t.ctx(),
        requestV2({ capture_ref: "tool-b", grade: "TOOL_CALL_ONLY" }),
      ),
    );
    expect(second.capture_ref).toBe("tool-b");
    expect(second.document_hash).toBe(first.document_hash);
    expect(second.capture_hash).not.toBe(first.capture_hash);
    expect(await allOf(t.store)).toHaveLength(2);
  });

  it("A1-T02 [mechanism only] a stored capture is reused only for its own grade: the same words requested under another grade are a new question to that grade's mechanism", async () => {
    const t = rig();
    const stored = must(
      await captureStartingChronology(t.ctx({ terminal: scriptedConsole("confirm") }), requestV2()),
    );
    expect(stored.grade).toBe(OP);
    // one change: the original-message grade (a fixture proof for a message); the stored operator-confirmed record is not reused for it
    const hash = sha256("SYNTHETIC FIXTURE: message");
    const verifier = new FixtureEvidenceVerifier();
    const spy = vi.spyOn(verifier, "verifyOriginalMessage");
    const original = must(
      await captureStartingChronology(
        t.ctx({ verifier: verifier as any }),
        requestV2({
          capture_ref: "fixture:capture:v2-original",
          grade: "ORIGINAL_MESSAGE_VERIFIED",
          source: {
            ...operatorSource(FIXTURE_MESSAGE_METHOD),
            original_message_hash: hash,
            attestation_hash: fixtureProofHash(hash),
          },
        }),
      ),
    );
    expect(original.grade).toBe("ORIGINAL_MESSAGE_VERIFIED");
    expect(original.capture_hash).not.toBe(stored.capture_hash);
    expect(spy).toHaveBeenCalledTimes(1); // the grade's own mechanism ran
    expect(await allOf(t.store)).toHaveLength(2);
  });

  it("A1-T02 [mechanism only] the same capture reference with different content is a conflict for every grade, in both directions between the arms, and overwrites nothing", async () => {
    // TOOL_CALL_ONLY and original-message grades converge on an identical retry and report CAPTURE_CONFLICT on different content
    for (const grade of ["TOOL_CALL_ONLY", "ORIGINAL_MESSAGE_VERIFIED"] as const) {
      const t = rig();
      const hash = sha256("SYNTHETIC FIXTURE: message");
      const source: Source =
        grade === "ORIGINAL_MESSAGE_VERIFIED"
          ? {
              ...operatorSource(FIXTURE_MESSAGE_METHOD),
              original_message_hash: hash,
              attestation_hash: fixtureProofHash(hash),
            }
          : operatorSource(FIXTURE_MESSAGE_METHOD);
      const base = { capture_ref: "fixture:capture:dup", grade, source };
      const first = must(await captureStartingChronology(t.ctx(), requestV2(base)));
      expect(must(await captureStartingChronology(t.ctx(), requestV2(base)))).toEqual(first); // control: the identical retry
      const changed = await captureStartingChronology(
        t.ctx(),
        requestV2({ ...base, authored: { ...AUTHORED, statement: "a different morning" } }),
      );
      expect(codeOf(changed), grade).toBe("CAPTURE_CONFLICT");
      // the same reference, the arm swapped
      const v1Over = await captureStartingChronology(
        t.ctx(),
        requestV1({ ...base, document: expectedV1Document(AUTHORED) }),
      );
      expect(codeOf(v1Over), grade).toBe("CAPTURE_CONFLICT");
      expect(await allOf(t.store)).toEqual([first]);
    }
    // the other direction: a stored version 1 capture, then a version 2 request on the same reference
    const t = rig();
    const v1 = must(
      await captureStartingChronology(
        t.ctx(),
        requestV1({ grade: "TOOL_CALL_ONLY", capture_ref: "fixture:capture:dup" }),
      ),
    );
    expect(
      codeOf(
        await captureStartingChronology(
          t.ctx(),
          requestV2({ grade: "TOOL_CALL_ONLY", capture_ref: "fixture:capture:dup" }),
        ),
      ),
    ).toBe("CAPTURE_CONFLICT");
    expect(await allOf(t.store)).toEqual([v1]);
  });

  it("A1-T02 [mechanism only] an operator-confirmed request on a taken reference fails exactly as the version 1 request does, after its question, and overwrites nothing", async () => {
    const outcome = async (arm: 1 | 2) => {
      const t = rig();
      const first = must(
        await captureStartingChronology(
          t.ctx({ terminal: scriptedConsole("confirm") }),
          arm === 1 ? requestV1({ capture_ref: "ref" }) : requestV2({ capture_ref: "ref" }),
        ),
      );
      const changed = { ...AUTHORED, statement: "a different morning" };
      const term = scriptedConsole("confirm");
      const second = await captureStartingChronology(
        t.ctx({ terminal: term }),
        arm === 1
          ? requestV1({ capture_ref: "ref", document: expectedV1Document(changed) })
          : requestV2({ capture_ref: "ref", authored: changed }),
      );
      expect(await allOf(t.store)).toEqual([first]);
      return [codeOf(second), term.asks()];
    };
    expect(await outcome(2)).toEqual(await outcome(1));
    expect(await outcome(2)).toEqual(["STORE_EXISTS", 1]);
  });

  it("A1-T02 [mechanism only] a captured document of another campaign is told apart at trusted-intake verification", async () => {
    const t = rig();
    const mine = must(
      await captureStartingChronology(t.ctx({ terminal: scriptedConsole("confirm") }), requestV2()),
    );
    const verify = (campaignId: string) =>
      verifyCaptureForIntake(
        { campaignId, verifier: t.ctx().verifier, policy: FIXTURE_POLICY },
        mine,
      );
    expect(codeOf(await verify(CAMPAIGN))).toBe("OK");
    const other = await verify("campaign-other");
    expect(codeOf(other)).toBe("DOCUMENT_INVALID");
    expect(JSON.stringify(other)).toContain("another campaign");
  });

  it("A1-T02 [mechanism only] a stored record is re-validated under the strict two-arm union: each one-change corruption is STORE_CORRUPT for read, all() and the next request", async () => {
    const valid = expectedCapture({
      arm: 2,
      campaignId: CAMPAIGN,
      captureRef: "fixture:capture:raw",
      authored: AUTHORED,
      grade: OP,
      source: operatorSource(FIXTURE_MESSAGE_METHOD),
    });
    const v1Valid = expectedCapture({
      arm: 1,
      campaignId: CAMPAIGN,
      captureRef: "fixture:capture:raw",
      authored: AUTHORED,
      grade: OP,
      source: operatorSource(FIXTURE_MESSAGE_METHOD),
    });
    // control: the raw writer reproduces the store's own envelope, so the strict readers accept it (both arms)
    for (const record of [valid, v1Valid]) {
      const t = rig();
      await rawStore(t.dir).create("capture:fixture:capture:raw", record);
      expect(must(await t.store.read("fixture:capture:raw"))).toEqual(record);
      expect(await allOf(t.store)).toEqual([record]);
    }
    const doc = valid.document as any;
    const corruptions: [string, unknown][] = [
      ["an extra member on the capture", { ...valid, extra: 1 }],
      ["an extra member on the document", { ...valid, document: { ...doc, extra: 1 } }],
      [
        "a different scale literal (resealed)",
        reseal({ ...valid, document: { ...doc, scale: "ONE_DAY_PER_CANONICAL_UNIT" } }),
      ],
      [
        "a missing scale (resealed)",
        reseal({
          ...valid,
          document: Object.fromEntries(Object.entries(doc).filter(([k]) => k !== "scale")),
        }),
      ],
      ["format_version 3", reseal({ ...valid, format_version: 3 })],
      [
        "a version 1 envelope around a version 2 document (resealed)",
        reseal({ ...valid, format_version: 1 }),
      ],
      [
        "a version 2 envelope around a version 1 document (resealed)",
        reseal({ ...v1Valid, format_version: 2 }),
      ],
      [
        "a missing member",
        Object.fromEntries(Object.entries(valid).filter(([k]) => k !== "campaign_id")),
      ],
    ];
    for (const [name, record] of corruptions) {
      const t = rig();
      await rawStore(t.dir).create("capture:fixture:capture:raw", record);
      const before = snapshotDir(t.dir);
      expect(codeOf(await t.store.read("fixture:capture:raw")), name).toBe("STORE_CORRUPT");
      expect(codeOf(await t.store.all()), name).toBe("STORE_CORRUPT");
      const next = await captureStartingChronology(
        t.ctx({ terminal: scriptedConsole("confirm") }),
        requestV2({ capture_ref: "fixture:capture:next" }),
      );
      expect(codeOf(next), name).toBe("STORE_CORRUPT"); // it fails closed: nothing is created beside a record that cannot be read
      expect(snapshotDir(t.dir), name).toEqual(before);
    }
  });

  it("A1-T02 [mechanism only] a truncated or tampered protected record is never repaired, adopted or guessed", async () => {
    const files = (dir: string) => {
      const d = join(dir, "chronology-captures");
      return readdirSync(d).map((f) => join(d, f));
    };
    const stored = async () => {
      const t = rig();
      must(
        await captureStartingChronology(
          t.ctx({ terminal: scriptedConsole("confirm") }),
          requestV2(),
        ),
      );
      return t;
    };
    const control = await stored();
    expect(codeOf(await control.store.all())).toBe("OK");
    const edits: [string, (text: string) => string][] = [
      ["truncated to half", (s) => s.slice(0, Math.floor(s.length / 2))],
      ["truncated to nothing", () => ""],
      [
        "one byte of the statement changed (valid JSON, wrong MAC)",
        (s) => s.replace("first light", "first night"),
      ],
      [
        "the declared scale rewritten (valid JSON, wrong MAC)",
        (s) => s.replace(SI_LITERAL, "ONE_DAY_PER_CANONICAL_UNIT"),
      ],
    ];
    for (const [name, edit] of edits) {
      const t = await stored();
      const [file] = files(t.dir);
      writeFileSync(file!, edit(readFileSync(file!, "utf8")));
      const before = snapshotDir(t.dir);
      expect(codeOf(await t.store.all()), name).toBe("STORE_CORRUPT");
      expect(codeOf(await t.store.read("fixture:capture:v2-1")), name).toBe("STORE_CORRUPT");
      const next = await captureStartingChronology(
        t.ctx({ terminal: scriptedConsole("confirm") }),
        requestV2(),
      );
      expect(codeOf(next), name).toBe("STORE_CORRUPT");
      expect(snapshotDir(t.dir), name).toEqual(before);
    }
  });
});

describe("A1-T03a [mechanism only] hash and grade forgery against the trusted-intake verification", () => {
  const settle = async (c: ChronologyEvidence, over: { verifier?: any; policy?: any } = {}) =>
    verifyCaptureForIntake(
      {
        campaignId: CAMPAIGN,
        verifier: over.verifier ?? new FixtureEvidenceVerifier(),
        policy: over.policy ?? FIXTURE_POLICY,
      },
      c,
    );
  const lawful = async () => {
    const t = rig();
    return must(
      await captureStartingChronology(t.ctx({ terminal: scriptedConsole("confirm") }), requestV2()),
    );
  };
  const flip = (hex: string) => `${hex[0] === "0" ? "1" : "0"}${hex.slice(1)}`;

  it("A1-T03a [mechanism only] the lawful capture verifies; a changed hash or a changed grade does not, whether or not the forger recomputes the hashes", async () => {
    const good = await lawful();
    expect(codeOf(await settle(good))).toBe("OK");
    const refusedWith = async (c: any, text: string) => {
      const r = await settle(c);
      expect(codeOf(r)).toBe("DOCUMENT_INVALID");
      expect(JSON.stringify(r)).toContain(text);
    };
    await refusedWith({ ...good, capture_hash: flip(good.capture_hash) }, "capture_hash");
    await refusedWith({ ...good, document_hash: flip(good.document_hash) }, "document_hash");
    // a grade changed WITHOUT recomputing the hashes: the capture hash covers the grade
    await refusedWith({ ...good, grade: "ORIGINAL_MESSAGE_VERIFIED" }, "capture_hash");
    // a document changed without recomputing the document hash
    await refusedWith(
      { ...good, document: { ...good.document, time: { ...good.document.time, value: 9 } } },
      "document_hash",
    );
    // a grade changed and RESEALED: now self-consistent, so only the grade's own mechanism can refuse it
    const hash = sha256("SYNTHETIC FIXTURE: message");
    const promoted = reseal({
      ...good,
      grade: "ORIGINAL_MESSAGE_VERIFIED" as const,
      source: { ...good.source, original_message_hash: hash },
    });
    expect(promoted.grade).toBe("ORIGINAL_MESSAGE_VERIFIED");
    // under the unavailable production verifier a promoted grade is an unresolved authority, never an original message
    const prod = await settle(promoted, {
      verifier: UnavailableEvidenceVerifier,
      policy: FIXTURE_POLICY,
    });
    expect(codeOf(prod)).toBe("UNRESOLVED_AUTHORITY");
    // and a capture demoted to TOOL_CALL_ONLY and resealed is diagnostic only
    const demoted = reseal({ ...good, grade: "TOOL_CALL_ONLY" as const });
    await refusedWith(demoted, "TOOL_CALL_ONLY");
  });

  it("A1-T03a [mechanism only] the arm and the document must agree, the scale must be the contract's literal, and no member may be added", async () => {
    const good = (await lawful()) as any;
    const refused = async (c: unknown) => codeOf(await settle(c as ChronologyEvidence));
    expect(await refused(good)).toBe("OK");
    // a version 2 document inside a version 1 envelope, and a version 1 document inside a version 2 envelope (both resealed)
    expect(await refused(reseal({ ...good, format_version: 1 }))).toBe("DOCUMENT_INVALID");
    const v1doc = expectedV1Document(AUTHORED);
    expect(await refused(reseal({ ...good, document: v1doc }))).toBe("DOCUMENT_INVALID");
    // the scale: another literal, absent, and an extra member on the capture
    expect(
      await refused(
        reseal({ ...good, document: { ...good.document, scale: "ONE_DAY_PER_CANONICAL_UNIT" } }),
      ),
    ).toBe("DOCUMENT_INVALID");
    const noScale = Object.fromEntries(
      Object.entries(good.document).filter(([k]) => k !== "scale"),
    );
    expect(await refused(reseal({ ...good, document: noScale }))).toBe("DOCUMENT_INVALID");
    expect(await refused({ ...good, extra: 1 })).toBe("DOCUMENT_INVALID");
    expect(await refused(null)).toBe("DOCUMENT_INVALID");
  });
});

describe("A1-T03b [mechanism only] the intake request type is the existing two-arm union", () => {
  it("A1-T03b [mechanism only] IntakeRequest.chronology is exactly ChronologyEvidence (checked by the typecheck gate, which is the gate that kills a narrowed type)", () => {
    expectTypeOf<IntakeRequest["chronology"]>().toEqualTypeOf<ChronologyEvidence>();
    expectTypeOf<ChronologyEvidence["format_version"]>().toEqualTypeOf<1 | 2>();
    expect(true).toBe(true);
  });

  it("A1-T03b [mechanism only] the capture returned for a version 2 request is the version 2 arm, and for a version 1 request the version 1 arm (type level)", () => {
    const typeOnly = async () => {
      const ctx = rig().ctx();
      const v1 = await captureStartingChronology(ctx, requestV1());
      if (v1.ok) expectTypeOf(v1.value).toEqualTypeOf<ChronologyCapture>();
      const v2 = await captureStartingChronology(ctx, requestV2());
      if (v2.ok) expectTypeOf(v2.value).toEqualTypeOf<ChronologyCaptureV2>();
    };
    expect(typeof typeOnly).toBe("function"); // never run: the assertions above are checked by the typecheck gate
  });
});
