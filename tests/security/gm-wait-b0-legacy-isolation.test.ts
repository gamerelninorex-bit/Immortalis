// B0-60..64 — legacy binder isolation control for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §3 B0-C5, §4 R08, §7; P3).
//
// This suite CHARACTERIZES EXISTING BEHAVIOUR ONLY. It is preparatory work under BLUE's 20 Nov 2026 gate interpretation (Issue #114,
// "Direct A0/B0 Source Decisions", native pin 2026-11-20T00:15:08.470Z: independent tests of presently existing code may be written now).
// It implements nothing: it adds no schema, module, writer, interface, rule, registry entry, pin or conformance expectation, and it
// changes no file under packages/ or apps/. It only CALLS the public binder and operation functions of the five legacy gateways,
// including the three D-3 protected ones, exactly as a host-side caller would. It is no B1 positive and no T0 PASS.
//
// What it records. Each legacy binder's docstring promises that a transaction "not stated under exactly role.player +
// permission.player_choice.commit ... yields an inert handle that the operation refuses without a read":
//   active-PC initial and held   protocol/src/active-pc-target-advance.ts:221–223
//   NULL-PC initial              protocol/src/null-pc-ooc-advance.ts:126–128
//   NULL-PC held                 protocol/src/null-pc-ooc-held-continuation.ts:134–136
//   PC transfer                  protocol/src/pc-transfer-advance.ts:134–136
// For each, a transaction stated under the GM pair {role:"role.gm", permission:"permission.rule.adjudicate"} — with the provisional
// source trigger GM_INTERPRETED_PC_WAIT and with every statically located existing trigger kind — binds a handle that the operation
// refuses with that binder's own refusal constant, and neither the binder nor the operation touches the campaign at all: the campaign
// is a Proxy whose every trap records the access and throws, and the trusted object hands the campaign out only through a recording
// getter. Since the store is reachable only through the campaign, an empty access record also shows that nothing was read or written.
//
// Control (cheap, no real campaign). The same call with ONLY the context changed to the player pair binds a live handle: the binder
// takes the campaign reference, and the operation's first act is to read `store` from it (which the tripwire refuses, so the public
// result is still the refusal). This proves the access record observes reads, so the empty record under the GM pair is not vacuous.
// No commit control is included: a commit needs a real Temporal campaign, and the existing integration suites
// (tests/integration/protocol-*.test.ts) already carry those positives; nothing here claims one.
//
// Observation for the record (R06, not a defect of these gateways): the binders' picked schema accepts the player pair with the
// GM_INTERPRETED_PC_WAIT trigger kind today, exactly as the legacy ResolutionRequestSchema does, so that pairing binds a live handle.
// The v0.6 §3 deny of that pairing is additive and belongs to B1's dispatcher and canonical admission, not to these gateways.
import { describe, expect, it } from "vitest";
import {
  AdvanceActivePcToTargetRequestSchema,
  AdvanceConfirmedPcTransferRequestSchema,
  AdvanceNullPcOocToTargetRequestSchema,
  GM_ADJUDICATION_AUTHORITY,
  NULL_PC_OOC_ADVANCE_UNAVAILABLE,
  NULL_PC_OOC_ADVANCE_UNAVAILABLE_MESSAGE,
  NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE,
  NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE_MESSAGE,
  OBSERVATION_TRIGGER_KIND,
  PC_TARGET_ADVANCE_UNAVAILABLE,
  PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE,
  PC_TRANSFER_ADVANCE_UNAVAILABLE,
  PC_TRANSFER_ADVANCE_UNAVAILABLE_MESSAGE,
  PLAYER_CHOICE_AUTHORITY,
  PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET,
  PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER,
  PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET,
  PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE,
  ResumeNullPcOocHeldAdvanceRequestSchema,
} from "@immortalis/contracts";
import {
  advanceActivePcToTarget,
  advanceConfirmedPcTransferToDelivery,
  advanceNullPcOocToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedConfirmedPcTransferAdvanceContext,
  bindTrustedNullPcOocHeldContinuationContext,
  bindTrustedNullPcOocTargetAdvanceContext,
  resumeNullPcOocHeldAdvance,
} from "@immortalis/protocol";

/** OSQ-1: the one provisional wire trigger, source-verbatim. It exists in no code; it is a plain string here. */
const GM_INTERPRETED_PC_WAIT = "GM_INTERPRETED_PC_WAIT";

/** v0.6 §3: the GM pair, written out literally and anchored to the existing constant (contracts/src/culture-adjudication.ts:31–34). */
const GM_PAIR = { role: "role.gm", permission: "permission.rule.adjudicate" } as const;
const PLAYER_PAIR = { role: "role.player", permission: "permission.player_choice.commit" } as const;

/** Every existing trigger kind located statically (B0 contract §3), plus the test-support kinds these binders' own suites state. */
const TRIGGER_KINDS = [
  GM_INTERPRETED_PC_WAIT,
  OBSERVATION_TRIGGER_KIND,
  "operator-progression-choice",
  "operator-null-pc-advance-choice",
  "operator-null-pc-resume-choice",
  "operator-pc-target-advance-choice",
  "operator-pc-target-resume-choice",
  "fixture-advance-request",
  "player-advance-choice",
  "player-ooc-advance-choice",
  "player-pc-target-choice",
  "fixture-continue",
] as const;

const PC_ID = "actor-b0-probe-pc";
const HELD_TX = "tx-b0-probe-held";
const TARGET = { unit: "t", value: 300 };

/** The trusted side's authored identity and provenance; only `context` and `trigger.kind` vary between calls. */
const stated = (context: object, kind: string) => ({
  transaction_id: "tx-b0-probe",
  cause: "cause-tx-b0-probe",
  trigger: { kind, ref: "ref-tx-b0-probe" },
  context: { ...context },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});

/**
 * A campaign double that may not be touched: every Proxy trap records the access and throws. The trusted object hands it out only
 * through a recording getter, so even taking the campaign reference is observed.
 */
function tripwire(): { readonly touched: string[]; trusted(fields: object): object } {
  const touched: string[] = [];
  const trip = (what: string): never => {
    touched.push(what);
    throw new Error(`campaign accessed: ${what}`);
  };
  const campaign = new Proxy(
    {},
    {
      get: (_t, p) => trip(`get ${String(p)}`),
      set: (_t, p) => trip(`set ${String(p)}`),
      has: (_t, p) => trip(`has ${String(p)}`),
      deleteProperty: (_t, p) => trip(`deleteProperty ${String(p)}`),
      defineProperty: (_t, p) => trip(`defineProperty ${String(p)}`),
      getOwnPropertyDescriptor: (_t, p) => trip(`getOwnPropertyDescriptor ${String(p)}`),
      ownKeys: () => trip("ownKeys"),
      getPrototypeOf: () => trip("getPrototypeOf"),
      setPrototypeOf: () => trip("setPrototypeOf"),
      isExtensible: () => trip("isExtensible"),
      preventExtensions: () => trip("preventExtensions"),
    },
  );
  return {
    touched,
    trusted: (fields) => {
      const t: Record<string, unknown> = { ...fields };
      Object.defineProperty(t, "campaign", {
        enumerable: true,
        get: () => {
          touched.push("trusted.campaign");
          return campaign;
        },
      });
      return t;
    },
  };
}

interface Gateway {
  readonly id: string;
  readonly name: string;
  readonly bind: (trusted: object) => object;
  readonly run: (handle: object, request: unknown) => Promise<unknown>;
  readonly request: unknown;
  readonly requestSchema: { safeParse(v: unknown): { success: boolean } };
  /** the trusted fields other than `campaign` and `transaction`, valid for this binder */
  readonly fields: object;
  readonly refusal: { readonly ok: false; readonly error: { code: string; message: string } };
}

const refusal = (code: string, message: string) =>
  ({ ok: false, error: { code, message } }) as const;

const GATEWAYS: readonly Gateway[] = [
  {
    id: "B0-60",
    name: "active-PC initial (bindTrustedActivePcTargetAdvanceContext)",
    bind: (t) => bindTrustedActivePcTargetAdvanceContext(t as never),
    run: (h, r) => advanceActivePcToTarget(h as never, r),
    request: { operation: PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET },
    requestSchema: AdvanceActivePcToTargetRequestSchema,
    fields: { pc_id: PC_ID, target: TARGET },
    refusal: refusal(PC_TARGET_ADVANCE_UNAVAILABLE, PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE),
  },
  {
    id: "B0-61",
    name: "active-PC held (bindTrustedActivePcHeldTargetAdvanceContext)",
    bind: (t) => bindTrustedActivePcHeldTargetAdvanceContext(t as never),
    run: (h, r) => advanceActivePcToTarget(h as never, r),
    request: { operation: PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET },
    requestSchema: AdvanceActivePcToTargetRequestSchema,
    fields: { pc_id: PC_ID, held: { from_transaction: HELD_TX, target: TARGET } },
    refusal: refusal(PC_TARGET_ADVANCE_UNAVAILABLE, PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE),
  },
  {
    id: "B0-62",
    name: "NULL-PC initial (bindTrustedNullPcOocTargetAdvanceContext)",
    bind: (t) => bindTrustedNullPcOocTargetAdvanceContext(t as never),
    run: (h, r) => advanceNullPcOocToTarget(h as never, r),
    request: { operation: PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET },
    requestSchema: AdvanceNullPcOocToTargetRequestSchema,
    fields: { target: TARGET },
    refusal: refusal(NULL_PC_OOC_ADVANCE_UNAVAILABLE, NULL_PC_OOC_ADVANCE_UNAVAILABLE_MESSAGE),
  },
  {
    id: "B0-63",
    name: "NULL-PC held (bindTrustedNullPcOocHeldContinuationContext)",
    bind: (t) => bindTrustedNullPcOocHeldContinuationContext(t as never),
    run: (h, r) => resumeNullPcOocHeldAdvance(h as never, r),
    request: { operation: PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE },
    requestSchema: ResumeNullPcOocHeldAdvanceRequestSchema,
    fields: { held: { from_transaction: HELD_TX, target: TARGET } },
    refusal: refusal(
      NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE,
      NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE_MESSAGE,
    ),
  },
  {
    id: "B0-64",
    name: "PC transfer (bindTrustedConfirmedPcTransferAdvanceContext)",
    bind: (t) => bindTrustedConfirmedPcTransferAdvanceContext(t as never),
    run: (h, r) => advanceConfirmedPcTransferToDelivery(h as never, r),
    request: { operation: PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER },
    requestSchema: AdvanceConfirmedPcTransferRequestSchema,
    fields: { pc_id: PC_ID },
    refusal: refusal(PC_TRANSFER_ADVANCE_UNAVAILABLE, PC_TRANSFER_ADVANCE_UNAVAILABLE_MESSAGE),
  },
];

describe("B0 refusal-only (legacy control): B0-60..64, the legacy binders isolate a GM-pair transaction", () => {
  it("B0 refusal-only (legacy control): the literal pairs are the existing constants, and the refusal codes are the contracts' own", () => {
    expect(GM_PAIR).toEqual(GM_ADJUDICATION_AUTHORITY);
    expect(PLAYER_PAIR).toEqual(PLAYER_CHOICE_AUTHORITY);
    expect(GATEWAYS.map((g) => [g.id, g.refusal.error.code])).toEqual([
      ["B0-60", "PC_TARGET_ADVANCE_UNAVAILABLE"],
      ["B0-61", "PC_TARGET_ADVANCE_UNAVAILABLE"],
      ["B0-62", "NULL_PC_ADVANCE_UNAVAILABLE"],
      ["B0-63", "NULL_PC_HELD_ADVANCE_UNAVAILABLE"],
      ["B0-64", "ADVANCE_UNAVAILABLE"],
    ]);
    // the host request each operation is called with is that operation's own accepted request, so it is never what is refused
    for (const g of GATEWAYS) expect(g.requestSchema.safeParse(g.request).success, g.id).toBe(true);
  });

  for (const g of GATEWAYS) {
    it(`B0 refusal-only (legacy control): ${g.id} ${g.name} — a GM-pair transaction binds an inert handle, the operation returns ${g.refusal.error.code}, and the campaign is never touched`, async () => {
      for (const kind of TRIGGER_KINDS) {
        const probe = tripwire();
        const handle = g.bind(probe.trusted({ ...g.fields, transaction: stated(GM_PAIR, kind) }));
        expect(Object.isFrozen(handle) && Reflect.ownKeys(handle).length === 0, kind).toBe(true);
        // the binder did not even take the campaign reference
        expect(probe.touched, `${g.id} ${kind} bind`).toEqual([]);
        expect(await g.run(handle, g.request), `${g.id} ${kind}`).toEqual(g.refusal);
        // nothing was read or written: the store is reachable only through the untouched campaign
        expect(probe.touched, `${g.id} ${kind} operation`).toEqual([]);
        // a second presentation of the same inert handle is the same refusal, still with no access
        expect(await g.run(handle, g.request), `${g.id} ${kind} again`).toEqual(g.refusal);
        expect(probe.touched, `${g.id} ${kind} again`).toEqual([]);
      }
    });

    it(`B0 refusal-only (legacy control): ${g.id} control — with only the context changed to the player pair, the handle is live and the operation reads the campaign`, async () => {
      for (const kind of TRIGGER_KINDS) {
        const probe = tripwire();
        const handle = g.bind(
          probe.trusted({ ...g.fields, transaction: stated(PLAYER_PAIR, kind) }),
        );
        // the binder took the campaign reference (and read nothing through it)
        expect(probe.touched, `${g.id} ${kind} bind`).toEqual(["trusted.campaign"]);
        // the operation's first act is to read the store from the campaign; the tripwire throws, the gateway refuses
        expect(await g.run(handle, g.request), `${g.id} ${kind}`).toEqual(g.refusal);
        expect(probe.touched, `${g.id} ${kind} operation`).toEqual([
          "trusted.campaign",
          "get store",
        ]);
      }
    });
  }
});
