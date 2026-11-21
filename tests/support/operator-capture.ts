// TEST SUPPORT for the F-014B A1-1 operator-side strict version 2 chronology capture (T1 MECHANISM ONLY). The scripted console and every
// "verified" author or message proof used with it are labelled fixture doubles (the reserved `fixture:` namespace); nothing here is, or can
// be reported as, original-message authenticity, a genuine isolated driver, a named client or a production result.
//
// The expected capture is RECOMPUTED here from the source text of the contract (the literals and the canonical serialization are written out
// in this file, not imported from the code under test), so a production change to a format name, a version, the scale literal or the hash
// input is told apart from the contract rather than echoed back.
import { createHash } from "node:crypto";
import type { OperatorTerminal } from "@immortalis/operator";

/** What the author says: the words, the coordinate and its unit. Nothing else is the caller's. */
export interface Authored {
  readonly statement: string;
  readonly value: number;
  readonly unit: string;
}

export const AUTHORED: Authored = {
  statement: "SYNTHETIC FIXTURE: the first light of the first morning",
  value: 0,
  unit: "seconds",
};

/** The literal of the contract text: the author's declaration of one SI second per canonical unit. */
export const SI_LITERAL = "ONE_SI_SECOND_PER_CANONICAL_UNIT";

/** Canonical serialization: object keys in code-unit order, arrays in order, no whitespace. Independent of the code under test. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export const sha256 = (v: string): string => createHash("sha256").update(v, "utf8").digest("hex");

export interface Source {
  readonly client: string;
  readonly oauth_grant: string;
  readonly request_ref: string;
  readonly original_message_hash: string | null;
  readonly method_id: string;
  readonly attestation_hash: string;
}

/** An operator-confirmation source: no original message, a labelled method, a caller-chosen attestation. */
export const operatorSource = (method: string, n = 7): Source => ({
  client: "fixture:client:1",
  oauth_grant: "fixture:grant:1",
  request_ref: `fixture:request:${n}`,
  original_message_hash: null,
  method_id: method,
  attestation_hash: "a".repeat(64),
});

/** The version 2 document, written out from the contract text. */
export const expectedV2Document = (a: Authored) => ({
  format: "immortalis-starting-chronology",
  format_version: 2,
  time: { unit: a.unit, value: a.value },
  statement: a.statement,
  scale: SI_LITERAL,
});
/** The version 1 document, written out from the contract text. */
export const expectedV1Document = (a: Authored) => ({
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit: a.unit, value: a.value },
  statement: a.statement,
});

/** The complete strict capture of either arm, with both hashes, recomputed from the contract text. */
export function expectedCapture(o: {
  readonly arm: 1 | 2;
  readonly campaignId: string;
  readonly captureRef: string;
  readonly authored: Authored;
  readonly grade: string;
  readonly source: Source;
}) {
  const document = o.arm === 2 ? expectedV2Document(o.authored) : expectedV1Document(o.authored);
  const head = {
    format: "immortalis-record-only-chronology",
    format_version: o.arm,
    capture_ref: o.captureRef,
    campaign_id: o.campaignId,
    document,
    document_hash: sha256(canon(document)),
    grade: o.grade,
    source: o.source,
  };
  return { ...head, capture_hash: sha256(canon(head)) };
}

/** Rehashes a capture after a field of it was changed: the hashes of a forged-but-self-consistent capture are valid. */
export function reseal<T extends { document: unknown; capture_hash?: string }>(c: T): T {
  const rest = Object.fromEntries(
    Object.entries(c).filter(([k]) => k !== "capture_hash" && k !== "document_hash"),
  );
  const withDoc = { ...rest, document: c.document, document_hash: sha256(canon(c.document)) };
  return { ...withDoc, capture_hash: sha256(canon(withDoc)) } as unknown as T;
}

/** A scripted OperatorTerminal: reads the challenge phrase the service prints and either types it back or declines. */
export function scriptedConsole(answer: "confirm" | "decline"): OperatorTerminal & {
  readonly said: string[];
  readonly asks: () => number;
} {
  const said: string[] = [];
  let phrase = "";
  let asked = 0;
  return {
    said,
    asks: () => asked,
    say: (t) => {
      said.push(t);
      const m = /type exactly "([^"]+)"/.exec(t);
      if (m) phrase = m[1]!;
    },
    ask: async () => {
      asked += 1;
      return answer === "confirm" ? phrase : "no";
    },
    close: () => undefined,
  };
}
