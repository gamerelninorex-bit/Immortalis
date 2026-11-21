// Hand-built SOURCES for the B1 S3 suites: a Map-backed fact source, a tripwire that throws on anything but `getFact`, and valid values for the
// simple owner schemas. TEST fixtures only: they establish nothing and are never an authenticated binding.
import { createHash } from "node:crypto";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
  SI_SCALE_DECLARATION,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  type CanonicalTime,
  type OwnerFact,
} from "@immortalis/contracts";
import { sha256Canonical } from "../../packages/engine/src/hash.ts";
import type { FactSource } from "../../packages/engine/src/gm-wait-present-reader.ts";

export const CAMPAIGN = "camp-s3";
export const PC = "pc-s3";
export const TX = "tx-s3-1";
export const at = (value: number, unit = "u"): CanonicalTime => ({ unit, value });
export const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export const fact = (
  key: string,
  value: unknown,
  o: { owner?: string; facet?: string; version?: number } = {},
): OwnerFact =>
  ({
    key,
    owner: o.owner ?? "test_owner",
    facet: o.facet ?? "test_facet",
    value,
    unit: null,
    basis: "test-basis",
    secrecy: "test-secrecy",
    version: o.version ?? 1,
    provenance: {
      group_id: "g",
      intent_id: "i",
      cause: "c",
      rule: {
        artifact: "a",
        native_pin: "p",
        clause: "c",
        authority_lineage: ["l"],
        effective_basis: "e",
        supersedes: null,
      },
    },
  }) as unknown as OwnerFact;

/** A Map-backed source that records every key asked for. */
export class MapSource implements FactSource {
  readonly facts = new Map<string, OwnerFact>();
  readonly asked: string[] = [];
  constructor(entries: Iterable<OwnerFact> = []) {
    for (const f of entries) this.facts.set(f.key, f);
  }
  put(f: OwnerFact): this {
    this.facts.set(f.key, f);
    return this;
  }
  drop(key: string): this {
    this.facts.delete(key);
    return this;
  }
  getFact(key: string): OwnerFact | undefined {
    this.asked.push(key);
    return this.facts.get(key);
  }
  clone(): MapSource {
    return new MapSource([...this.facts.values()].map((f) => structuredClone(f)));
  }
}

/** A source that throws on ANY access other than `getFact` (list, iterate, boundary index, size...) and on a forbidden key. */
export function tripwire(inner: FactSource, forbidden: (key: string) => boolean = () => false) {
  const calls: string[] = [];
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "getFact")
          return (key: string) => {
            calls.push(key);
            if (forbidden(key)) throw new Error(`TRIPWIRE: forbidden key ${key}`);
            return inner.getFact(key);
          };
        throw new Error(`TRIPWIRE: access to ${String(prop)}`);
      },
    },
  );
  return { source: proxy as unknown as FactSource, calls };
}

export const stateFact = (value = 100, unit = "u"): OwnerFact =>
  fact(
    TEMPORAL_STATE_KEY,
    { canonical_time: at(value, unit), last_transaction: null, continuation: null },
    { owner: "temporal_kernel", facet: "temporal_coordination" },
  );

export const gipReceiptFact = (instrumentId = "inst-1", sunset = 500, basis = 10): OwnerFact =>
  fact(
    GIP_SUNSET_ENROLLMENT_KEY,
    { instrument_id: instrumentId, sunset_at: at(sunset), basis_time: at(basis) },
    { owner: "gip", facet: "gip_institution_identity" },
  );

export const freightReceiptFact = (delivery = 700): OwnerFact =>
  fact(
    LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
    {
      request_id: "req-1",
      transfer: { fact_key: "logistics/x/transfer/y", transfer_id: "tr-1" },
      directive_use_id: "use-1",
      delivery: { boundary_id: "b-1", at: at(delivery) },
      dispatched_at: at(5),
    },
    { owner: "logistics", facet: "logistics_state" },
  );

export const originFact = (
  o: { campaign?: string; unit?: string; scale?: string } = {},
): OwnerFact =>
  fact(
    TEMPORAL_ORIGIN_KEY,
    {
      format: "immortalis-temporal-origin",
      format_version: 1,
      campaign_id: o.campaign ?? CAMPAIGN,
      origin: at(100, o.unit ?? "u"),
      scale: o.scale ?? SI_SCALE_DECLARATION,
      chronology: {
        capture_format_version: 2,
        capture_ref: "cap-1",
        capture_hash: sha("capture"),
        document_hash: sha("document"),
        grade: "ORIGINAL_MESSAGE_VERIFIED",
      },
      governing: {
        completion: { fact_key: "k-completion", version: 1 },
        input: { fact_key: "k-input", version: 1 },
      },
    },
    { owner: "temporal_kernel", facet: "temporal_coordination" },
  );

/** The PC's sequence-1 standing-instruction ledger version (honest empty carrier) and its head, consistent with each other. */
export const ledgerVersionBody = (pcId: string) => ({
  pc_id: pcId,
  sequence: 1,
  origin: {
    kind: "START_OF_LEDGER",
    operative_binding: {
      fact_key: "role-registry/binding/role.player_character",
      version: 1,
      commit: { group_id: "g-b", intent_id: "i-b" },
    },
  },
  instructions: [] as never[],
  previous: null,
});
export function ledgerVersionFact(pcId: string, o: { tamper?: boolean } = {}): OwnerFact {
  const body = ledgerVersionBody(pcId);
  const digest = sha256Canonical(body);
  return fact(
    pcStandingLedgerVersionKey(pcId, 1),
    { ...body, content_sha256: o.tamper ? sha("tampered") : digest },
    { owner: "pc_existence", facet: "standing_instruction_ledger" },
  );
}
export function ledgerHeadFact(pcId: string, version: number, headPc: string = pcId): OwnerFact {
  return fact(
    pcStandingLedgerHeadKey(pcId),
    {
      pc_id: headPc,
      current: { fact_key: pcStandingLedgerVersionKey(pcId, 1), version },
      content_sha256: sha256Canonical(ledgerVersionBody(pcId)),
    },
    { owner: "pc_existence", facet: "standing_instruction_ledger" },
  );
}
