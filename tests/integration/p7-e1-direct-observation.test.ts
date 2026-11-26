/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and forge raw persisted records */
// F-014B P-7 E1 - E1-01..E1-10: the native DIRECT_OBSERVATION receipt/latency evidence (BLUE P7-E1 brief, Notion 42220af9-01e0-811b-8857-f7647cabc51d;
// BLUE HOLD F-1/F-2 repair, Notion 42320af9-01e0-81a0-9bed-f747340238).
// TEST-ONLY, READ-ONLY, MECHANISM ONLY (T1): the scripted referee decision is a legitimate fixture of the shipped observation seam, not genuine
// LLM reasoning, an actual client or retained production storage; those stay UNRUN. Nothing here certifies a route member, an actionable
// knowledge time or a wait interruption; the aggregate stays NOT_ACCEPTED.
//
// Non-tautology: the receipt is produced by the SHIPPED `observeSurroundings` on a native campaign (locality, character, binding, placement,
// Temporal at BASIS); the independent negative is the SAME scene with only an opaque screen substituted; the helper never receives an
// expected verdict. Each twin varies one real thing (a cut, a hidden record, a forged field, a revision, a clock, a receipt, a ledger) and the
// verifier reads the real journal with the owners' own verifiers. Forgeries are read-only overlays: the SELF-CONSISTENT ones (group and receipt
// hash rewritten to match) can be refused only by the layer under test; the INCONSISTENT ones are refused by the strict group/receipt layer.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  BoundaryIndexSchema,
  CANON_WRITE_AUTHORITY,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  observationTransactionId,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type OwnerFact,
} from "@immortalis/contracts";
import { formObservedPacket, verifyEpistemicIntegrity } from "@immortalis/engine";
import { FIXTURE_PC_ID, pcAccessEvent } from "@immortalis/testkit";
import { canonicalEqual } from "../../packages/engine/src/hash.ts";
import { observationEventId } from "../../packages/engine/src/epistemic/observation.ts";
import { EPISTEMIC_ACCESS_RULE_TENTH_SLICE } from "../../packages/engine/src/owners/registry.ts";
import {
  stageGroupId,
  transactionAuthorityGroupId,
  transactionGroupId,
} from "../../packages/engine/src/temporal/identity.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  NO_HEALTH_OWNER_AUTHORITY,
  NO_PROVEN_FIRST_OPTION_AUTHORITY,
  checkSection10,
  refOf,
} from "../support/p7-section10/proof.ts";
import {
  bindNativeEvidence,
  forgeConsistently,
  forgeGroupConsistently,
  overlayStore,
  revisionOf,
  verifyNativeReceipt,
  type NativeEvidence,
  type NativeLedger,
  type ReadOnlyStore,
} from "../support/p7-section10/native-observation.ts";
import { currentAuthority, currentManifest } from "../support/p7-section10/fixtures.ts";
import { openOrdinary } from "../support/locality.ts";
import {
  BASIS,
  PC_ID,
  observationCampaign,
  observe,
  screenScene,
  type ObservationCampaign,
} from "../support/observation.ts";
import { seededEpistemicCampaign } from "../support/epistemic.ts";
import { tempDir } from "../support/tmp.ts";

const MEMBER = "EPISTEMIC_ROUTE:DIRECT_OBSERVATION";
const EVENT_ID = observationEventId(PC_ID, BASIS);
const EVENT_KEY = accessEventKey(EVENT_ID);
const PACKET_KEY = accessPacketKey(EVENT_ID, PC_ID);
const PROVENANCE_KEY = accessProvenanceKey(EVENT_ID, PC_ID);
const TX_ID = observationTransactionId(EVENT_ID);
const TX_KEY = temporalTransactionKey(TX_ID);
const AUTH_KEY = temporalTransactionAuthorityKey(TX_ID);
const STAGE = accessPacketStage(EVENT_ID, PC_ID);
const FORMATION_GROUP = stageGroupId(STAGE);
const AUTH_GROUP = transactionAuthorityGroupId(TX_ID);
const SEAL_GROUP = transactionGroupId(TX_ID);

let positive: ObservationCampaign;
let twin: ObservationCampaign;
let screened: ObservationCampaign;

beforeAll(async () => {
  positive = await observationCampaign();
  const received = await observe(positive.dirs);
  expect(received.result.status, JSON.stringify(received.result.details)).toBe(
    "OBSERVATION_RECEIVED",
  );
  // a SECOND, separately committed positive campaign built the same way: same campaign id, same keys, same bytes
  twin = await observationCampaign();
  const again = await observe(twin.dirs);
  expect(again.result.status, JSON.stringify(again.result.details)).toBe("OBSERVATION_RECEIVED");
  screened = await observationCampaign({ scene: screenScene() });
  const refused = await observe(screened.dirs);
  expect(refused.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
}, 600_000);

/** Opens a campaign, runs `fn` against its REAL store, and closes it: the writer lock never has two holders per campaign. */
async function withStore<T>(
  dir: string,
  fn: (store: Awaited<ReturnType<typeof openOrdinary>>["store"]) => Promise<T> | T,
): Promise<T> {
  const c = await openOrdinary(dir);
  try {
    return await fn(c.store);
  } finally {
    await c.close();
  }
}
const withPositive = <T>(fn: Parameters<typeof withStore<T>>[1]) =>
  withStore(positive.dirs.campaignDir, fn);

const bind = (store: ReadOnlyStore, cut?: number): NativeEvidence =>
  bindNativeEvidence(store, cut === undefined ? {} : { cutRevision: cut });
const eventOf = (store: ReadOnlyStore): OwnerFact => store.getFact(EVENT_KEY)!;
/** The verifier's diagnostic verdict for the journal's event at a cut (or for another presented event / character). */
function verify(
  store: ReadOnlyStore,
  o: {
    cut?: number;
    event?: OwnerFact;
    pc?: string;
    /** the checker's explicit canonical cut (default: the observation's own basis); `null` supplies none */
    canonical_cut?: CanonicalTime | null;
  } = {},
) {
  const evidence = bind(store, o.cut);
  const canonical = o.canonical_cut === undefined ? BASIS : o.canonical_cut;
  return verifyNativeReceipt(evidence, {
    event: o.event ?? eventOf(store),
    pc_id: o.pc ?? PC_ID,
    ledger: evidence.ledger,
    ...(canonical === null ? {} : { canonical_cut: canonical }),
  });
}

/** The route-specific knowledge/latency result of the E0 checker for this event, with optional native evidence. */
function route(
  event: OwnerFact,
  o: {
    evidence?: NativeEvidence;
    ledger?: NativeLedger;
    pc?: string;
    /** the checker's canonical cut (default: the observation's own basis); `null` supplies none */
    cut?: CanonicalTime | null;
    claims?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  } = {},
) {
  const ledger = o.ledger ?? o.evidence?.ledger;
  if (ledger === undefined) throw new Error("a ledger is required");
  const certificate = {
    format: "immortalis-p7-section10-proof",
    version: 1,
    catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    member: { family: "EPISTEMIC_ROUTE", id: "DIRECT_OBSERVATION" },
    claims: {
      RECIPIENT_KNOWLEDGE_LATENCY: { evidence: [refOf(event)] },
      ...(o.claims ?? {}),
    },
  };
  const result = checkSection10({
    manifest: currentManifest(),
    authority: currentAuthority(),
    ledger,
    certificates: [certificate],
    pc: { entity_id: o.pc ?? PC_ID },
    ...(o.cut === null ? {} : { cut: o.cut ?? BASIS }),
    ...(o.evidence ? { nativeEvidence: o.evidence } : {}),
    ...(o.extra ?? {}),
  } as never);
  const verdict = result.verdicts.get(MEMBER)!;
  const knowledge = verdict.obligations.find(
    (x) => x.obligation === "RECIPIENT_KNOWLEDGE_LATENCY",
  )!;
  return { result, verdict, knowledge };
}
const forge = (fact: OwnerFact, patch: (f: any) => void): OwnerFact => {
  const copy = structuredClone(fact) as any;
  patch(copy);
  return copy as OwnerFact;
};
const headOf = (store: ReadOnlyStore) => {
  const h = store.head();
  return { revision: h.revision, state: h.state_sha256, entries: h.journal_entries };
};
const groupOf = (store: ReadOnlyStore, id: string) => store.committedGroupById!(id)!;

describe("E1-01 native positive: the committed receipt, not a derivable one, closes the route's knowledge/latency obligation", () => {
  it("the real original journal verifies, and the E0 checker closes ONLY that obligation, only with the issued evidence", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      expect(AccessEventSchema.parse(event.value).channel).toBe("PERCEPTION");
      const evidence = bind(store);
      expect(
        verifyNativeReceipt(evidence, {
          event,
          pc_id: PC_ID,
          ledger: evidence.ledger,
          canonical_cut: BASIS,
        }),
      ).toMatchObject({ ok: true, code: "NATIVE_RECEIPT_COMMITTED" });

      const closed = route(event, { evidence });
      expect(closed.knowledge).toMatchObject({ status: "CLOSED", reason: "CLOSED" });
      // the member is NOT proved: default Health, first option and history, and every other claim, stay open
      expect(closed.verdict.status).toBe("NOT_PROVEN");
      expect(closed.verdict.fixture_dependent).toBe(false);

      // the SAME ledger without the evidence is derivable and still does not close: derivable is not committed
      const derivable = route(event, { ledger: evidence.ledger });
      expect(derivable.knowledge).toMatchObject({
        status: "OPEN",
        reason: "NATIVE_RECEIPT_EVIDENCE_ABSENT",
      });
    });
  });

  it("the campaign's own verifiers agree before and after: the journal and the Epistemic integrity are clean", async () => {
    await withPositive((store) => {
      expect(verifyEpistemicIntegrity(store)).toEqual([]);
    });
    const c = await openOrdinary(positive.dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it("each record the verifier relies on is the exact write of its own committed group, in the order event < authority < formation < seal", async () => {
    await withPositive((store) => {
      const rev = (id: string) => store.lookupReceipt(groupOf(store, id).intent_id)!.revision;
      const eventGroup = eventOf(store).provenance.group_id;
      const chain = [eventGroup, AUTH_GROUP, FORMATION_GROUP, SEAL_GROUP];
      expect(new Set(chain).size, "four distinct committed groups").toBe(4);
      const revisions = chain.map(rev);
      expect(revisions, "event < authority < formation < seal").toEqual(
        [...revisions].sort((a, b) => a - b),
      );
      expect(new Set(revisions).size).toBe(4);
      for (const id of chain.slice(1))
        expect(groupOf(store, id).authority).toEqual(CANON_WRITE_AUTHORITY);
    });
  });
});

describe("E1-02 independent negative: the same scene with only an opaque screen earns no receipt and the evidence has nothing to close on", () => {
  it("the owner refuses; no event, packet, provenance or transaction exists; and the positive campaign's receipt is not this campaign's", async () => {
    const positiveEvent = await withPositive((store) => eventOf(store));
    await withStore(screened.dirs.campaignDir, (store) => {
      for (const k of [EVENT_KEY, PACKET_KEY, PROVENANCE_KEY, TX_KEY, AUTH_KEY])
        expect(store.getFact(k), k).toBeUndefined();
      // cross-campaign: the positive campaign's event presented against the screened campaign's journal never closes
      expect(verify(store, { event: positiveEvent })).toMatchObject({
        ok: false,
        code: "EVENT_NOT_AT_CUT",
      });
      const evidence = bind(store);
      const r = route(positiveEvent, {
        evidence,
        ledger: { get: (k) => (k === EVENT_KEY ? positiveEvent : evidence.ledger.get(k)) },
      });
      expect(r.knowledge.status).toBe("OPEN");
      expect(r.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
      expect(r.knowledge.detail).toContain("LEDGER_NOT_THE_BOUND_ONE");
    });
  });
});

describe("E1-03 an event without its committed receipt at the cut closes nothing, including an event-only re-derivable payload", () => {
  it("an EARLIER REAL journal cut: the event exists, the packet, provenance and seal do not yet", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const eventRevision = revisionOf(store, event)!;
      const packetRevision = revisionOf(store, store.getFact(PACKET_KEY)!)!;
      expect(eventRevision).toBeLessThan(packetRevision);
      const earlier = bind(store, eventRevision);
      expect(earlier.ledger.get(EVENT_KEY)).toBeDefined();
      expect(earlier.ledger.get(PACKET_KEY)).toBeUndefined();
      // the payload is perfectly derivable from the event alone, and the E0 checker would have stopped only at the native requirement...
      expect(route(event, { ledger: earlier.ledger }).knowledge.reason).toBe(
        "NATIVE_RECEIPT_EVIDENCE_ABSENT",
      );
      // ...and with the evidence of that very cut it refuses for the missing committed receipt
      const r = route(event, { evidence: earlier });
      expect(r.knowledge.status).toBe("OPEN");
      expect(r.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
      expect(r.knowledge.detail).toContain("PACKET_ABSENT_AT_CUT");
      // the full cut, same campaign, same evidence reference, closes: the cut is the discriminating variable
      expect(route(event, { evidence: bind(store) }).knowledge.status).toBe("CLOSED");
    });
  });

  it("each committed record is individually required: no provenance, no authority, no seal, or a seal committed after the cut", async () => {
    await withPositive((store) => {
      const hide = (key: string) => overlayStore(store, { facts: { [key]: null } });
      expect(verify(hide(PROVENANCE_KEY))).toMatchObject({
        ok: false,
        code: "PROVENANCE_ABSENT_AT_CUT",
      });
      expect(verify(hide(PACKET_KEY))).toMatchObject({ ok: false, code: "PACKET_ABSENT_AT_CUT" });
      expect(verify(hide(AUTH_KEY))).toMatchObject({ ok: false, code: "AUTHORITY_ABSENT_AT_CUT" });
      expect(verify(hide(TX_KEY))).toMatchObject({ ok: false, code: "TRANSACTION_ABSENT_AT_CUT" });
      // a cut exactly at the formation group: packet and provenance are committed, the sealed transaction is not yet
      const formationRevision = revisionOf(store, store.getFact(PACKET_KEY)!)!;
      const sealRevision = revisionOf(store, store.getFact(TX_KEY)!)!;
      expect(sealRevision).toBeGreaterThan(formationRevision);
      expect(verify(store, { cut: formationRevision })).toMatchObject({
        ok: false,
        code: "TRANSACTION_ABSENT_AT_CUT",
      });
      // a cut exactly at the seal closes
      expect(verify(store, { cut: sealRevision })).toMatchObject({ ok: true });
    });
  });
});

describe("E1-04 wrong character, forged records and a record that is not the journal's are each refused [forged fixtures are read-only overlays]", () => {
  it("another character, an authored (non-observation) event and a broadcast are not this receipt", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      expect(verify(store, { pc: "some-other-character" })).toMatchObject({
        ok: false,
        code: "EVENT_IDENTITY_NOT_DERIVED",
      });
      // through the E0 checker the recipient guard refuses before the evidence is consulted
      const other = route(event, { evidence: bind(store), pc: "some-other-character" });
      expect(other.knowledge.status).toBe("OPEN");
      expect(other.knowledge.reason).toBe("WRONG_RECIPIENT");
    });
    // an authored bounded event on an unrelated campaign is not an observation-earned receipt
    const s = await seededEpistemicCampaign(tempDir());
    const authored = pcAccessEvent("event-authored", FIXTURE_PC_ID);
    const committed = await s.access.establishBoundedSharedAccess({
      group_id: "access-group-1",
      intent_id: "access-intent-1",
      cause: "access-cause-1",
      basis: "access-fixture-basis",
      event: authored,
    } as never);
    expect(committed.ok).toBe(true);
    const fact = s.campaign.store.getFact(accessEventKey("event-authored"))!;
    expect(verify(s.campaign.store, { event: fact, pc: FIXTURE_PC_ID })).toMatchObject({
      ok: false,
      code: "EVENT_IDENTITY_NOT_DERIVED",
    });
    const asRoute = route(fact, { evidence: bind(s.campaign.store), pc: FIXTURE_PC_ID });
    expect(asRoute.knowledge.reason).toBe("EVENT_NOT_OBSERVATION_EARNED");
  });

  it("a presented event that is not the journal's own fact (version, committing group, source pin, basis, payload) never closes", async () => {
    await withPositive((store) => {
      const real = eventOf(store);
      const forgeries: [string, OwnerFact][] = [
        ["version", forge(real, (f) => (f.version += 1))],
        ["committing group", forge(real, (f) => (f.provenance.group_id = "another-group"))],
        ["source pin", forge(real, (f) => (f.value.source.version += 1))],
        ["basis", forge(real, (f) => (f.basis = "another-basis"))],
        ["payload", forge(real, (f) => (f.value.payload.content = "something else was seen"))],
      ];
      for (const [name, forged] of forgeries) {
        const evidence = bind(store);
        expect(
          verifyNativeReceipt(evidence, {
            event: forged,
            pc_id: PC_ID,
            ledger: evidence.ledger,
            canonical_cut: BASIS,
          }).ok,
          name,
        ).toBe(false);
        // the checker's own ledger is the evidence's, and E0 re-reads the event from it by owner, facet, version, committing group and
        // value digest: a forged reference is refused by that re-read. The basis LABEL is not part of that reference, and the checker
        // closes only on the JOURNAL's own event (never on the presented one), so a basis-only forgery changes nothing the checker uses.
        if (name !== "basis")
          expect(route(forged, { evidence }).knowledge.status, name).toBe("OPEN");
      }
    });
  });

  it("a self-consistent forged JOURNAL record (the group and receipt agree with it) is still refused by the owner's own verifier", async () => {
    await withPositive((store) => {
      const cases: [string, ReadOnlyStore][] = [
        ["basis", forgeConsistently(store, [[EVENT_KEY, (f) => (f.basis = "another-basis")]])],
        [
          "source pin",
          forgeConsistently(store, [[EVENT_KEY, (f: any) => (f.value.source.version += 1)]]),
        ],
        [
          "payload",
          forgeConsistently(store, [
            [EVENT_KEY, (f: any) => (f.value.payload.content = "something else was seen")],
          ]),
        ],
      ];
      for (const [name, view] of cases) {
        const verdict = verify(view, { event: view.getFact(EVENT_KEY)! });
        expect(verdict.ok, name).toBe(false);
        expect(verdict.code, name).toBe("OWNER_EVENT_VERIFIER_REFUSED");
      }
    });
  });

  it("the formation must be the committed stage group, after the event, with the transaction linked to that group and receipt", async () => {
    await withPositive((store) => {
      const formationGroup = groupOf(store, FORMATION_GROUP);
      const eventRevision = revisionOf(store, eventOf(store))!;
      // formation before event: the journal revision of the formation group is moved at or before the event's
      const early = overlayStore(store, {
        revisions: { [formationGroup.intent_id]: eventRevision },
      });
      expect(verify(early)).toMatchObject({ ok: false, code: "FORMATION_NOT_AFTER_EVENT" });
      // the sealed transaction names another receipt for that group
      expect(
        verify(
          forgeConsistently(store, [
            [TX_KEY, (f: any) => (f.value.stages[0].group_sha256 = "0".repeat(64))],
          ]),
        ),
      ).toMatchObject({ ok: false, code: "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP" });
      // the packet is not what the owner derives
      expect(
        verify(
          forgeConsistently(store, [
            [PACKET_KEY, (f: any) => (f.value.payload.content = "unseen")],
          ]),
        ),
      ).toMatchObject({ ok: false, code: "PACKET_NOT_THE_OWNER_DERIVATION" });
    });
  });
});

describe("E1-04 every guard of the verifier has its own falsifier [forged overlays are read-only]", () => {
  it("each single forged or displaced record is refused for its own reason", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const packet = store.getFact(PACKET_KEY)!;
      const provenance = store.getFact(PROVENANCE_KEY)!;
      const sealed = store.getFact(TX_KEY)!;
      const binding =
        store.getFact("role/player-character-binding") ??
        store
          .listFacts()
          .find((f: OwnerFact) => (f.value as any)?.binding_slot === "role.player_character")!;
      const eventGroup = groupOf(store, event.provenance.group_id);
      const formationRevision = revisionOf(store, packet)!;
      type Case = [string, ReadOnlyStore, string];
      const cases: Case[] = [
        [
          "the event group does not read the retained decision",
          forgeGroupConsistently(store, eventGroup.group_id, (g) => (g.reads = [])),
          "OWNER_EVENT_VERIFIER_REFUSED",
        ],
        [
          "the event group is not the journal's: it does not write the event",
          forgeGroupConsistently(store, eventGroup.group_id, (g) => {
            g.writes = g.writes.map((w) => ({ ...w, key: "access/not-the-event/event" }));
          }),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the Role Registry binding names another character",
          forgeConsistently(store, [
            [binding.key, (f: any) => (f.value.active_pc.entity_id = "someone-else")],
          ]),
          "PC_NOT_BOUND",
        ],
        [
          "the sealed provenance is not what the owner derives",
          forgeConsistently(store, [[PROVENANCE_KEY, (f: any) => (f.value.event.version += 1)]]),
          "PROVENANCE_NOT_THE_OWNER_DERIVATION",
        ],
        [
          "the secrecy classes of packet and provenance are swapped",
          forgeConsistently(store, [
            [PACKET_KEY, (f) => (f.secrecy = provenance.secrecy)],
            [PROVENANCE_KEY, (f) => (f.secrecy = packet.secrecy)],
          ]),
          "SECRECY_CLASS_NOT_SEPARATED",
        ],
        [
          "the provenance names the EVENT's real group, which never wrote it",
          forgeConsistently(store, [
            [
              PROVENANCE_KEY,
              (f) => {
                f.provenance.group_id = eventGroup.group_id;
                f.provenance.intent_id = eventGroup.intent_id;
              },
            ],
          ]),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the formation group writes another key too",
          forgeGroupConsistently(store, FORMATION_GROUP, (g) => {
            g.writes = [...g.writes, { ...g.writes[0]!, key: "extra/key" }];
          }),
          "FORMATION_GROUP_WRITES_OTHER_KEYS",
        ],
        [
          "the formation group belongs to another campaign",
          forgeGroupConsistently(
            store,
            FORMATION_GROUP,
            (g) => (g.campaign_id = "another-campaign"),
          ),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the journal is another campaign's",
          overlayStore(store, { campaignId: "another-campaign" }),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the seal is not the observation trigger",
          forgeConsistently(store, [
            [TX_KEY, (f: any) => (f.value.trigger.kind = "fixture-advance-request")],
          ]),
          "TRANSACTION_NOT_THE_OBSERVATION_TRIGGER",
        ],
        [
          "the seal names another stage",
          forgeConsistently(store, [
            [TX_KEY, (f: any) => (f.value.stages[0].stage.causal_process_id = "another-process")],
          ]),
          "TRANSACTION_STAGE_NOT_THE_PACKET_FORMATION",
        ],
        [
          "the seal records other writes",
          forgeConsistently(store, [
            [TX_KEY, (f: any) => (f.value.stages[0].writes[0].version = 9)],
          ]),
          "TRANSACTION_WRITES_NOT_THE_FORMATION",
        ],
        [
          "the seal engaged a temporal object: the transaction schema itself refuses it before the explicit check (which stays as a backstop)",
          forgeConsistently(store, [
            [
              TX_KEY,
              (f: any) =>
                f.value.engaged.push({
                  boundary: "STILL_ACTIVE",
                  object_id: "an-engaged-object",
                  fact_key: "temporal/object/an-engaged-object",
                  version_before: 1,
                }),
            ],
          ]),
          "TRANSACTION_INVALID",
        ],
        [
          "the seal engaged a PCB-01 due object, which the transaction schema admits in a zero-span seal: only the explicit observation guard refuses it",
          forgeConsistently(store, [
            [
              TX_KEY,
              (f: any) =>
                f.value.engaged.push({
                  boundary: "DUE_UNRESOLVED",
                  object_id: "an-engaged-object",
                  fact_key: "temporal/object/an-engaged-object",
                  version_before: 1,
                  due_for: STAGE,
                  trigger: "PCB-01",
                }),
            ],
          ]),
          "TRANSACTION_ENGAGES_OBJECT_OR_BOUNDARY",
        ],
        [
          "the seal retired an object and crossed a boundary, which the schema also admits: only the explicit observation guard refuses it",
          forgeConsistently(store, [
            [
              TX_KEY,
              (f: any) => {
                f.value.engaged.push({
                  boundary: "RETIRED",
                  object_id: "a-retired-object",
                  fact_key: "temporal/object/a-retired-object",
                  version_before: 1,
                  version_after: 2,
                });
                f.value.boundaries_crossed.push({
                  object_id: "a-retired-object",
                  boundary_id: "a-boundary",
                  at: f.value.opening.basis_time,
                });
              },
            ],
          ]),
          "TRANSACTION_ENGAGES_OBJECT_OR_BOUNDARY",
        ],
        [
          "the seal's cause, trigger reference and continuation are each the observation's own",
          forgeConsistently(store, [[TX_KEY, (f: any) => (f.value.cause = "another-cause")]]),
          "TRANSACTION_NOT_THE_OBSERVATION_TRIGGER",
        ],
        [
          "the seal's trigger names another event",
          forgeConsistently(store, [[TX_KEY, (f: any) => (f.value.trigger.ref = "another-event")]]),
          "TRANSACTION_NOT_THE_OBSERVATION_TRIGGER",
        ],
        [
          "the seal continues another transaction",
          forgeConsistently(store, [
            [TX_KEY, (f: any) => (f.value.continues = "another-transaction")],
          ]),
          "TRANSACTION_NOT_THE_OBSERVATION_TRIGGER",
        ],
        [
          "the event's own group belongs to another campaign",
          forgeGroupConsistently(
            store,
            eventGroup.group_id,
            (g) => (g.campaign_id = "another-campaign"),
          ),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the seal was committed before the formation",
          overlayStore(store, {
            revisions: { [sealed.provenance.intent_id]: formationRevision - 1 },
          }),
          "TRANSACTION_NOT_SEALED_AFTER_FORMATION",
        ],
      ];
      for (const [name, view, code] of cases) {
        const verdict = verify(view, { event });
        expect(verdict, name).toMatchObject({ ok: false, code });
      }
    });
  });

  it("an event committed under another governing rule is not observation-earned, and a provenance written by a SECOND real group is not the packet's stage group", async () => {
    await withPositive((store) => {
      const eventGroup = groupOf(store, eventOf(store).provenance.group_id);
      const formation = groupOf(store, FORMATION_GROUP);
      // the event group re-published under the superseded rule: the event it wrote now carries that rule, self-consistently
      const reruled = forgeGroupConsistently(
        store,
        eventGroup.group_id,
        (g) => (g.rule = EPISTEMIC_ACCESS_RULE_TENTH_SLICE),
      );
      expect(verify(reruled, { event: reruled.getFact(EVENT_KEY)! })).toMatchObject({
        ok: false,
        code: "EVENT_NOT_OBSERVATION_EARNED",
      });
      // the provenance claims the EVENT's group as its writer, and that group (consistently) also writes it
      const provenance = forge(store.getFact(PROVENANCE_KEY)!, (f) => {
        f.provenance = structuredClone(eventOf(store).provenance);
      });
      const twice = forgeGroupConsistently(
        store,
        eventGroup.group_id,
        (g) =>
          g.writes.push(structuredClone(formation.writes.find((w) => w.key === PROVENANCE_KEY)!)),
        { facts: { [PROVENANCE_KEY]: provenance } },
      );
      expect(verify(twice)).toMatchObject({ ok: false, code: "FORMATION_NOT_ONE_STAGE_GROUP" });
    });
  });
});

describe("E1-05 one clock: event, packet and seal share the same basis and unit; no object, boundary or time advance exists", () => {
  it("the committed records agree on one coordinate, and the transaction registered no object or boundary and moved no time", async () => {
    await withPositive((store) => {
      const event = AccessEventSchema.parse(eventOf(store).value);
      const packet = AccessiblePacketSchema.parse(store.getFact(PACKET_KEY)!.value);
      const tx = ResolutionTransactionSchema.parse(store.getFact(TX_KEY)!.value);
      for (const t of [
        packet.access.established_at,
        tx.opening.basis_time,
        tx.requested.target!,
        tx.outcome.actual_stop,
      ])
        expect(t).toEqual(event.established_at);
      expect(event.established_at).toEqual(BASIS);
      expect(tx.engaged).toEqual([]);
      expect(tx.boundaries_crossed).toEqual([]);
      expect(store.listFacts().filter((f) => f.key.startsWith("temporal/object/"))).toEqual([]);
      expect(
        BoundaryIndexSchema.parse(
          store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value ?? { entries: [] },
        ).entries,
      ).toEqual([]);
      expect(
        TemporalStateSchema.parse(store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time,
      ).toEqual(BASIS);
    });
  });

  it("an incompatible unit or an advanced stop (a forged seal) never closes; a changed basis is a different event", async () => {
    await withPositive((store) => {
      const advanced = forgeConsistently(store, [
        [
          TX_KEY,
          (f: any) => {
            f.value.requested.target = { unit: f.value.requested.target.unit, value: 101 };
            f.value.outcome.actual_stop = { unit: f.value.outcome.actual_stop.unit, value: 101 };
          },
        ],
      ]);
      const otherUnit = forgeConsistently(store, [
        [TX_KEY, (f: any) => (f.value.opening.basis_time.unit = "another-clock")],
      ]);
      for (const [name, view] of [
        ["advanced stop", advanced],
        ["other unit", otherUnit],
      ] as const) {
        const verdict = verify(view);
        expect(verdict.ok, name).toBe(false);
        expect(
          ["CLOCK_NOT_ONE_BASIS", "TRANSACTION_INVALID"],
          `${name}: ${verdict.code}`,
        ).toContain(verdict.code);
      }
      // the event identity is derived from the basis: the same character at another instant is another key
      expect(observationEventId(PC_ID, { unit: BASIS.unit, value: 101 })).not.toBe(EVENT_ID);
    });
  });

  it("the checker's canonical cut binds the evidence's time: a cut before the access, or in another unit, never closes", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const evidence = bind(store);
      expect(route(event, { evidence, cut: BASIS }).knowledge.status).toBe("CLOSED");
      // a later canonical cut is lawful: the receipt was committed before it
      expect(
        route(event, { evidence, cut: { unit: BASIS.unit, value: BASIS.value + 5 } }).knowledge
          .status,
      ).toBe("CLOSED");
      const before = route(event, { evidence, cut: { unit: BASIS.unit, value: BASIS.value - 1 } });
      expect(before.knowledge.status).toBe("OPEN");
      expect(before.knowledge.detail).toContain("EVIDENCE_AFTER_CANONICAL_CUT");
      const unit = route(event, { evidence, cut: { unit: "another-clock", value: BASIS.value } });
      expect(unit.knowledge.status).toBe("OPEN");
      expect(unit.knowledge.detail).toContain("CLOCK_NOT_ONE_BASIS");
    });
  });
});

describe("E1-06 the actor packet stays actor-safe, the route proves nothing beyond its own obligation, and the defaults stay absent", () => {
  it("the packet carries no event, source, provenance or engine reference; the sealed record stays engine-side", async () => {
    await withPositive((store) => {
      const packet = store.getFact(PACKET_KEY)!;
      const provenance = store.getFact(PROVENANCE_KEY)!;
      const shown = JSON.stringify(packet.value);
      const event = AccessEventSchema.parse(eventOf(store).value);
      for (const hidden of [
        EVENT_ID,
        event.source.fact_key,
        PROVENANCE_KEY,
        "capability_close",
        "engine",
      ])
        expect(shown, hidden).not.toContain(hidden);
      expect(packet.secrecy).toBe("epistemic.actor-accessible");
      expect(provenance.secrecy).toBe("epistemic.engine-sealed");
      // the verifier answers with a diagnostic and no payload or hidden timing
      expect(JSON.stringify(verify(store))).not.toContain(
        AccessiblePacketSchema.parse(packet.value).payload.content,
      );
    });
  });

  it("with the default Health, first-option and history authorities the member is still NOT_PROVEN: no substitution, no visual inference", async () => {
    await withPositive((store) => {
      const r = route(eventOf(store), {
        evidence: bind(store),
        claims: {
          RECIPIENT_ABILITY: {
            evidence: [
              {
                kind: "AUTHORITY_READING",
                authority_id: NO_HEALTH_OWNER_AUTHORITY.id,
                obligation: "RECIPIENT_ABILITY",
              },
            ],
          },
          FIRST_PC_OPTION: {
            evidence: [
              {
                kind: "AUTHORITY_READING",
                authority_id: NO_PROVEN_FIRST_OPTION_AUTHORITY.id,
                obligation: "FIRST_PC_OPTION",
              },
            ],
          },
          HISTORICAL_POLICY: { evidence: [{ kind: "HISTORY_SEGMENT", segment_id: "any-segment" }] },
        },
      });
      const open = Object.fromEntries(
        r.verdict.obligations
          .filter((o) => o.status === "OPEN")
          .map((o) => [o.obligation, o.reason]),
      );
      expect(open).toMatchObject({
        RECIPIENT_ABILITY: "ABILITY_UNKNOWN",
        FIRST_PC_OPTION: "FIRST_OPTION_UNPROVEN",
        HISTORICAL_POLICY: "HISTORY_NOT_RETIRED",
        SOURCE_POLICY: "CLAIM_ABSENT",
        NEGATIVE_TWINS: "CLAIM_ABSENT",
      });
      expect(r.knowledge.status).toBe("CLOSED");
      expect(r.verdict.status).toBe("NOT_PROVEN");
    });
  });
});

describe("E1-07 read-only: checking writes nothing, the native replay is a no-op, and a reopened campaign still shows the receipt", () => {
  it("head revision, state hash, journal length, fact count and boundary index are identical before and after every check", async () => {
    await withPositive((store) => {
      const before = {
        head: headOf(store),
        facts: store.listFacts().length,
        index: store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value,
      };
      const event = eventOf(store);
      const evidence = bind(store);
      verifyNativeReceipt(evidence, {
        event,
        pc_id: PC_ID,
        ledger: evidence.ledger,
        canonical_cut: BASIS,
      });
      route(event, { evidence });
      route(event, { ledger: evidence.ledger });
      verify(store, { cut: 1 });
      verify(store, { cut: 10_000 });
      const after = {
        head: headOf(store),
        facts: store.listFacts().length,
        index: store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value,
      };
      expect(after).toEqual(before);
    });
  });

  it("the native replay of the formation writes nothing, and after close and reopen the same evidence still closes without a re-roll", async () => {
    const first = await withPositive(async (store) => {
      const decisionKey = store
        .listFacts()
        .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
      const head = headOf(store);
      const replay = await formObservedPacket(store, decisionKey);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.value.replayed).toBe(true);
      expect(headOf(store)).toEqual(head);
      return { head, event: structuredClone(eventOf(store)) };
    });
    await withPositive((store) => {
      expect(headOf(store)).toEqual(first.head);
      expect(eventOf(store)).toEqual(first.event);
      expect(route(eventOf(store), { evidence: bind(store) }).knowledge.status).toBe("CLOSED");
    });
  });

  it("the verification is deterministic exact-key work: the same counters on a second run, and the store type has no listing", async () => {
    await withPositive((store) => {
      const count = () => {
        const n = {
          head: 0,
          getFact: 0,
          lookupReceipt: 0,
          committedGroup: 0,
          committedGroupById: 0,
        };
        const counting: ReadOnlyStore = {
          head: () => (n.head++, store.head()),
          getFact: (k) => (n.getFact++, store.getFact(k)),
          lookupReceipt: (i) => (n.lookupReceipt++, store.lookupReceipt(i)),
          committedGroup: (i) => (n.committedGroup++, store.committedGroup(i)),
          committedGroupById: (g) => (n.committedGroupById++, store.committedGroupById!(g)),
        };
        expect(verify(counting)).toMatchObject({ ok: true });
        return n;
      };
      const a = count();
      const b = count();
      expect(a).toEqual(b);
      expect(Object.keys(a).sort()).toEqual(
        ["committedGroup", "committedGroupById", "getFact", "head", "lookupReceipt"].sort(),
      );
    });
  });
});

describe("E1-08 nothing is promoted: the catalogue is unchanged, no member is proof-closed, the aggregate stays NOT_ACCEPTED", () => {
  it("with the evidence and the receipt present, the whole real catalogue is still 0 proof-closed and every sentinel is unchanged", async () => {
    await withPositive((store) => {
      const { result } = route(eventOf(store), { evidence: bind(store) });
      expect(result.report.totals.proof_closed_candidate).toBe(0);
      expect(result.report.totals.not_proven).toBe(result.report.totals.members);
      expect(result.report.aggregate).toMatchObject({ accepted: false, status: "NOT_ACCEPTED" });
      expect(result.report.catalogue.sentinels).toEqual({
        epistemic: "ACTIONABLE_OR_UNSAFE",
        default_disposition: "UNDECLARED",
        evaluator_id: "NONE_SECTION_10_NOT_ACCEPTED",
        live_admission_id: "NOT_INSTALLED_NO_GM_WRITER",
        extension_historical_coverage: "UNRETIRED_DENY",
      });
      expect(result.report.catalogue.sha256).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    });
  });
});

describe("E1-09 BLUE F-1: a spoofed success, a swapped ledger or cut, an invalid cut and a same-key event of another campaign never close the obligation", () => {
  it("a caller-supplied success callback is not evidence: the retired field is ignored and a look-alike is never issued", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const early = bind(store, revisionOf(store, event)!);
      let called = 0;
      const callback = () => {
        called += 1;
        return { ok: true, code: "SPOOF", detail: "" };
      };
      // the old structural witness is not part of the checker context any more: it is ignored, so the route stays fail-closed
      const retired = route(event, {
        ledger: early.ledger,
        extra: { nativeObservation: { id: "SPOOF", verify: callback } },
      });
      expect(retired.knowledge).toMatchObject({
        status: "OPEN",
        reason: "NATIVE_RECEIPT_EVIDENCE_ABSENT",
      });
      const lookalikes: [string, unknown][] = [
        [
          "plain literal",
          { campaign_id: early.campaign_id, cut_revision: 99, ledger: early.ledger },
        ],
        ["spread clone of real evidence", { ...early }],
        ["prototype clone of real evidence", Object.create(early)],
        ["real shape plus a verdict callback", { ...early, verify: callback, ok: true }],
        ["a frozen forgery", Object.freeze({ ...early })],
      ];
      for (const [name, fake] of lookalikes) {
        const r = route(event, { ledger: early.ledger, evidence: fake as NativeEvidence });
        expect(r.knowledge.status, name).toBe("OPEN");
        expect(r.knowledge.reason, name).toBe("NATIVE_RECEIPT_NOT_PROVEN");
        expect(r.knowledge.detail, name).toContain("NATIVE_EVIDENCE_NOT_ISSUED");
      }
      expect(called, "no caller-supplied callback is ever invoked").toBe(0);
    });
  });

  it("there is no installer to pre-empt: in a FRESH module graph that imports only the checker, an always-success callback has no door and the genuine verifier refuses", async () => {
    await withPositive(async (store) => {
      const event = eventOf(store);
      const real = bind(store);
      let called = 0;
      const callback = () => {
        called += 1;
        return { ok: true, code: "SPOOF", detail: "" };
      };
      // a fresh graph: the checker is imported ALONE, before anything has had a chance to install or register anything
      vi.resetModules();
      const fresh: any = await import("../support/p7-section10/proof.ts");
      expect(
        Object.keys(fresh).filter((k) => /install|regist|setNative|verifier/i.test(k)),
        "no installer, setter or registrar is exported by the checker",
      ).toEqual([]);
      const knowledge = (extra: Record<string, unknown>) => {
        const result = fresh.checkSection10({
          manifest: currentManifest(),
          authority: currentAuthority(),
          ledger: real.ledger,
          certificates: [
            {
              format: "immortalis-p7-section10-proof",
              version: 1,
              catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
              member: { family: "EPISTEMIC_ROUTE", id: "DIRECT_OBSERVATION" },
              claims: { RECIPIENT_KNOWLEDGE_LATENCY: { evidence: [refOf(event)] } },
            },
          ],
          pc: { entity_id: PC_ID },
          cut: BASIS,
          ...extra,
        });
        return result.verdicts
          .get(MEMBER)
          .obligations.find((x: any) => x.obligation === "RECIPIENT_KNOWLEDGE_LATENCY");
      };
      // the attacker offers an always-success callback in every slot the context could have: none is a door
      for (const [name, extra] of [
        [
          "a callback in the retired witness field",
          { nativeObservation: { id: "S", verify: callback } },
        ],
        ["a callback as a verifier", { nativeVerifier: callback, verify: callback }],
        [
          "look-alike evidence carrying a callback",
          { nativeEvidence: { ...real, verify: callback, ok: true } },
        ],
        ["the real evidence of ANOTHER module graph", { nativeEvidence: real }],
      ] as const) {
        const k = knowledge(extra);
        expect(k.status, name).toBe("OPEN");
        expect(k.reason, name).toBe(
          name.startsWith("a callback")
            ? "NATIVE_RECEIPT_EVIDENCE_ABSENT"
            : "NATIVE_RECEIPT_NOT_PROVEN",
        );
        if (k.reason === "NATIVE_RECEIPT_NOT_PROVEN")
          expect(
            k.detail,
            `${name}: the GENUINE verifier answered, with no install step`,
          ).toContain("NATIVE_EVIDENCE_NOT_ISSUED");
      }
      expect(called, "no callback was ever consulted").toBe(0);
    });
  });

  it("the checker's canonical cut is explicit and valid: an absent or invalid cut refuses, a past observation at a later cut closes", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const evidence = bind(store);
      const absent = route(event, { evidence, cut: null });
      expect(absent.knowledge.status).toBe("OPEN");
      expect(absent.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
      expect(absent.knowledge.detail).toContain("CANONICAL_CUT_ABSENT");
      const invalid: [string, unknown][] = [
        ["a non-integer value", { unit: BASIS.unit, value: BASIS.value + 0.5 }],
        ["a negative value", { unit: BASIS.unit, value: -1 }],
        ["a missing unit", { value: BASIS.value }],
        ["an extra field", { unit: BASIS.unit, value: BASIS.value, extra: true }],
        ["not an object", BASIS.value],
      ];
      for (const [name, cut] of invalid) {
        const r = route(event, { evidence, cut: cut as CanonicalTime });
        expect(r.knowledge.status, name).toBe("OPEN");
        expect(r.knowledge.detail, name).toContain("CANONICAL_CUT_INVALID");
      }
      expect(verify(store, { canonical_cut: null })).toMatchObject({
        ok: false,
        code: "CANONICAL_CUT_ABSENT",
      });
      // lawful evidence of a PAST observation at a LATER canonical cut still closes; the same journal head is the pinned one
      expect(
        route(event, { evidence, cut: { unit: BASIS.unit, value: BASIS.value + 50 } }).knowledge
          .status,
      ).toBe("CLOSED");
    });
  });

  it("the ledger, the campaign and the cut are one bound value: a later complete evidence with an earlier ledger (and the reverse) is refused", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const full = bind(store);
      const early = bind(store, revisionOf(store, event)!);
      const refusedAs = (r: ReturnType<typeof route>) => {
        expect(r.knowledge.status).toBe("OPEN");
        expect(r.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
        expect(r.knowledge.detail).toContain("LEDGER_NOT_THE_BOUND_ONE");
      };
      // the exact counterexample: the event is visible at the earlier cut, the receipt only at the later one
      refusedAs(route(event, { evidence: full, ledger: early.ledger }));
      refusedAs(route(event, { evidence: early, ledger: full.ledger }));
      // a ledger rebuilt over the same store and the same cut is ANOTHER ledger: bound by identity, not by look
      refusedAs(route(event, { evidence: full, ledger: bind(store).ledger }));
      // the matched pairs: each is judged at its own cut
      expect(route(event, { evidence: early }).knowledge.detail).toContain("PACKET_ABSENT_AT_CUT");
      expect(route(event, { evidence: full }).knowledge.status).toBe("CLOSED");
    });
  });

  it("an invalid cut (future, negative, fractional, non-numeric) is refused, never clamped; the head and the genuine boundary cuts are valid", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const head = store.head().revision;
      const invalid: [string, number][] = [
        ["one beyond the head", head + 1],
        ["far beyond the head", head + 1000],
        ["negative", -1],
        ["fractional", head - 0.5],
        ["NaN", Number.NaN],
        ["infinite", Number.POSITIVE_INFINITY],
        ["a string", "5" as unknown as number],
      ];
      for (const [name, cut] of invalid) {
        const evidence = bind(store, cut);
        const r = route(event, { evidence });
        expect(r.knowledge.status, name).toBe("OPEN");
        expect(r.knowledge.reason, name).toBe("NATIVE_RECEIPT_NOT_PROVEN");
        expect(r.knowledge.detail, name).toContain("CUT_INVALID");
        expect(
          verifyNativeReceipt(evidence, {
            event,
            pc_id: PC_ID,
            ledger: evidence.ledger,
            canonical_cut: BASIS,
          }).code,
          name,
        ).toBe("CUT_INVALID");
      }
      expect(route(event, { evidence: bind(store, head) }).knowledge.status).toBe("CLOSED");
      // the cut before the journal began shows nothing: the event is not at the cut
      const empty = route(event, { evidence: bind(store, 0) });
      expect(empty.knowledge.status).toBe("OPEN");
    });
  });

  it("a SAME-KEY, byte-identical event of another separately committed positive campaign cannot be substituted", async () => {
    await withPositive((a) =>
      withStore(twin.dirs.campaignDir, (b) => {
        const eventA = eventOf(a);
        const eventB = eventOf(b);
        // the premise that makes this twin sharp: same campaign id, same key, same bytes; only the journal differs
        expect(eventB.key).toBe(eventA.key);
        expect(a.head().campaign_id).toBe(b.head().campaign_id);
        expect(canonicalEqual(eventA, eventB)).toBe(true);
        expect(a.head().journal_head_sha256).not.toBe(b.head().journal_head_sha256);
        const evA = bind(a);
        const evB = bind(b);
        // each campaign closes on ITS OWN evidence...
        expect(route(eventA, { evidence: evA }).knowledge.status).toBe("CLOSED");
        expect(route(eventB, { evidence: evB }).knowledge.status).toBe("CLOSED");
        // ...and neither can borrow the other's: campaign B's event and ledger against campaign A's evidence
        const swapped = route(eventB, { evidence: evA, ledger: evB.ledger });
        expect(swapped.knowledge.status).toBe("OPEN");
        expect(swapped.knowledge.detail).toContain("LEDGER_NOT_THE_BOUND_ONE");
        expect(
          verifyNativeReceipt(evA, {
            event: eventB,
            pc_id: PC_ID,
            ledger: evB.ledger,
            canonical_cut: BASIS,
          }).code,
        ).toBe("LEDGER_NOT_THE_BOUND_ONE");
        // and campaign A's ledger cannot be presented with campaign B's evidence either
        expect(route(eventA, { evidence: evB, ledger: evA.ledger }).knowledge.status).toBe("OPEN");
      }),
    );
  });

  it("the evidence is valid for the ONE journal head it was issued at: ANY changed head (advanced, foreign, rewound, another hash) refuses, and reissue on the new head closes", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const real = store.head();
      const swappable = {
        journal: real.journal_head_sha256,
        state: real.state_sha256,
        revision: real.revision,
        campaign: real.campaign_id,
      };
      const wrapped: ReadOnlyStore = {
        ...overlayStore(store, {}),
        head: () => ({
          ...store.head(),
          journal_head_sha256: swappable.journal,
          state_sha256: swappable.state,
          revision: swappable.revision,
          campaign_id: swappable.campaign,
        }),
      };
      const evidence = bind(wrapped);
      const ask = (e: NativeEvidence = evidence) =>
        verifyNativeReceipt(e, {
          event,
          pc_id: PC_ID,
          ledger: e.ledger,
          canonical_cut: BASIS,
        });
      expect(ask()).toMatchObject({ ok: true });
      // another hash at the same revision
      swappable.journal = "0".repeat(64);
      expect(ask()).toMatchObject({ ok: false, code: "JOURNAL_NOT_THE_PINNED_ONE" });
      swappable.journal = real.journal_head_sha256;
      swappable.state = "1".repeat(64);
      expect(ask()).toMatchObject({ ok: false, code: "JOURNAL_NOT_THE_PINNED_ONE" });
      swappable.state = real.state_sha256;
      // a rewound journal
      swappable.revision = real.revision - 1;
      expect(ask()).toMatchObject({ ok: false, code: "JOURNAL_REWOUND" });
      // a HIGHER-revision foreign head (another journal that shares nothing but the keys): no ancestry is proven, so it refuses, whatever
      // the cached view would still show, and through the checker the route does not close either
      swappable.revision = real.revision + 7;
      swappable.journal = "2".repeat(64);
      swappable.state = "3".repeat(64);
      expect(ask()).toMatchObject({ ok: false, code: "JOURNAL_HEAD_ADVANCED" });
      const viaChecker = route(event, { evidence });
      expect(viaChecker.knowledge.status).toBe("OPEN");
      expect(viaChecker.knowledge.detail).toContain("JOURNAL_HEAD_ADVANCED");
      // even the SAME hashes at a higher revision are not trusted: ancestry is never inferred
      swappable.journal = real.journal_head_sha256;
      swappable.state = real.state_sha256;
      expect(ask()).toMatchObject({ ok: false, code: "JOURNAL_HEAD_ADVANCED" });
      // reissuing on the changed head is the only way forward, and it verifies the journal as it now is
      const reissued = bind(wrapped);
      expect(ask(reissued)).toMatchObject({ ok: true });
      expect(route(event, { evidence: reissued }).knowledge.status).toBe("CLOSED");
      // the old evidence never recovers by the head changing back to a different journal's identity
      swappable.revision = real.revision;
      expect(ask(reissued)).toMatchObject({ ok: false, code: "JOURNAL_REWOUND" });
      // the campaign swapped between issue and verify
      swappable.campaign = "another-campaign";
      swappable.revision = real.revision + 7;
      expect(ask(bind(wrapped))).toMatchObject({ ok: false });
      expect(ask(evidence)).toMatchObject({ ok: false, code: "CAMPAIGN_MISMATCH" });
    });
  });
});

describe("E1-10 BLUE F-2: the formation and the seal are the exact writes of their own committed groups, receipts, realized reads and durable authority", () => {
  it("INCONSISTENT journal slices are refused by the strict group/receipt layer: a changed payload with the receipt unchanged, a foreign receipt, a fact that is not its group's write", async () => {
    await withPositive((store) => {
      const formation = groupOf(store, FORMATION_GROUP);
      const receipt = store.lookupReceipt(formation.intent_id)!;
      const packet = store.getFact(PACKET_KEY)!;
      const patch = (r: Record<string, unknown>) =>
        overlayStore(store, { receipts: { [formation.intent_id]: r } });
      const cases: [string, ReadOnlyStore, string][] = [
        [
          "a formation write payload changed, the receipt unchanged",
          overlayStore(store, {
            groups: {
              [FORMATION_GROUP]: {
                ...formation,
                writes: formation.writes.map((w, i) =>
                  i === 0 ? { ...w, value: { tampered: true } as never } : w,
                ),
              },
            },
          }),
          "GROUP_HASH_MISMATCH",
        ],
        [
          "a bogus group hash recorded on the receipt",
          patch({ group_sha256: "f".repeat(64) }),
          "GROUP_HASH_MISMATCH",
        ],
        [
          "the same bogus hash on the receipt AND in the seal's record of it is still not the recomputed one",
          overlayStore(store, {
            receipts: { [formation.intent_id]: { group_sha256: "f".repeat(64) } },
            facts: {
              [TX_KEY]: forge(
                store.getFact(TX_KEY)!,
                (f) => (f.value.stages[0].group_sha256 = "f".repeat(64)),
              ),
            },
          }),
          "GROUP_HASH_MISMATCH",
        ],
        [
          "a foreign campaign on the receipt",
          patch({ campaign_id: "foreign" }),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the receipt names another group",
          patch({ group_id: "stage-group:another" }),
          "RECEIPT_NOT_THIS_GROUP",
        ],
        [
          "the receipt names another intent",
          patch({ intent_id: "stage-intent:another" }),
          "RECEIPT_NOT_THIS_GROUP",
        ],
        [
          "the receipt records another governing rule",
          patch({ basis: { ...receipt.basis, rule: EPISTEMIC_ACCESS_RULE_TENTH_SLICE } }),
          "RECEIPT_BASIS_NOT_THE_GROUP",
        ],
        [
          "the receipt records another authority than the group's",
          patch({
            basis: { ...receipt.basis, authority: { role: "role.someone-else", permission: "x" } },
          }),
          "RECEIPT_BASIS_NOT_THE_GROUP",
        ],
        ["an impossible receipt revision", patch({ revision: 0 }), "RECEIPT_REVISION_INVALID"],
        [
          "the journal returns another group than the one asked for (another group id)",
          overlayStore(store, {
            groups: { [FORMATION_GROUP]: { ...formation, group_id: "stage-group:another" } },
          }),
          "GROUP_IDENTITY_MISMATCH",
        ],
        [
          "the intent index returns another group than the group-by-id read",
          overlayStore(store, {
            indexGroups: { [formation.intent_id]: { ...formation, cause: "transaction:another" } },
          }),
          "GROUP_INDEX_DISAGREES",
        ],
        [
          "the committed group is not a well-formed group",
          overlayStore(store, {
            groups: { [FORMATION_GROUP]: { ...formation, writes: [] } },
          }),
          "GROUP_INVALID",
        ],
        [
          "the journal cannot show the formation group at all",
          overlayStore(store, { groups: { [FORMATION_GROUP]: null } }),
          "GROUP_NOT_COMMITTED",
        ],
        [
          "the packet is not its group's write: another payload",
          overlayStore(store, {
            facts: { [PACKET_KEY]: forge(packet, (f) => (f.value.payload.content = "unseen")) },
          }),
          "WRITE_PAYLOAD_MISMATCH",
        ],
        [
          "the packet is not its group's write: another version",
          overlayStore(store, { facts: { [PACKET_KEY]: forge(packet, (f) => (f.version += 1)) } }),
          "WRITE_VERSION_MISMATCH",
        ],
        [
          "the packet is not its group's write: another owner",
          overlayStore(store, {
            facts: { [PACKET_KEY]: forge(packet, (f) => (f.owner = "another_owner")) },
          }),
          "WRITE_OWNER_FACET_MISMATCH",
        ],
        [
          "the packet is not its group's write: another facet",
          overlayStore(store, {
            facts: { [PACKET_KEY]: forge(packet, (f) => (f.facet = "another-facet")) },
          }),
          "WRITE_OWNER_FACET_MISMATCH",
        ],
        [
          "the packet is not its group's write: another basis label",
          overlayStore(store, {
            facts: { [PACKET_KEY]: forge(packet, (f) => (f.basis = "another-basis")) },
          }),
          "WRITE_PAYLOAD_MISMATCH",
        ],
        [
          "the packet's provenance names another cause",
          overlayStore(store, {
            facts: { [PACKET_KEY]: forge(packet, (f) => (f.provenance.cause = "another-cause")) },
          }),
          "PROVENANCE_NOT_THE_GROUP",
        ],
      ];
      for (const [name, view, code] of cases) {
        expect(verify(view), name).toMatchObject({ ok: false, code });
      }
    });
  });

  it("the formation's declared reads, dependencies, rule, authority and cause are exactly the stage's", async () => {
    await withPositive((store) => {
      const cases: [string, ReadOnlyStore, string][] = [
        [
          "the formation read nothing",
          forgeGroupConsistently(store, FORMATION_GROUP, (g) => (g.reads = [])),
          "FORMATION_READS_NOT_THE_EVENT",
        ],
        [
          "the formation read another version of the event",
          forgeGroupConsistently(store, FORMATION_GROUP, (g) => (g.reads[0]!.version += 1)),
          "FORMATION_READS_NOT_THE_EVENT",
        ],
        [
          "the formation does not depend on the durable authority group",
          forgeGroupConsistently(
            store,
            FORMATION_GROUP,
            (g) => (g.depends_on = g.depends_on.filter((d) => d !== AUTH_GROUP)),
          ),
          "FORMATION_DEPENDENCIES_NOT_EVENT_AND_AUTHORITY",
        ],
        [
          "the formation does not depend on the group that committed the event",
          forgeGroupConsistently(
            store,
            FORMATION_GROUP,
            (g) => (g.depends_on = g.depends_on.slice().reverse()),
          ),
          "FORMATION_DEPENDENCIES_NOT_EVENT_AND_AUTHORITY",
        ],
        [
          "the formation is published under the superseded governing rule",
          forgeGroupConsistently(
            store,
            FORMATION_GROUP,
            (g) => (g.rule = EPISTEMIC_ACCESS_RULE_TENTH_SLICE),
          ),
          "FORMATION_NOT_THE_EPISTEMIC_STAGE",
        ],
        [
          "the formation is published under another authority",
          forgeGroupConsistently(
            store,
            FORMATION_GROUP,
            (g) => (g.authority = { role: "role.someone-else", permission: "permission.anything" }),
          ),
          "FORMATION_NOT_THE_EPISTEMIC_STAGE",
        ],
        [
          "the formation is caused by another transaction",
          forgeGroupConsistently(store, FORMATION_GROUP, (g) => (g.cause = "transaction:another")),
          "FORMATION_NOT_THE_EPISTEMIC_STAGE",
        ],
      ];
      for (const [name, view, code] of cases)
        expect(verify(view), name).toMatchObject({ ok: false, code });
    });
  });

  it("the durable transaction authority exists, is its own group's write, lies between the event and the formation, and is what the seal repeats", async () => {
    await withPositive((store) => {
      const auth = store.getFact(AUTH_KEY)!;
      const formation = groupOf(store, FORMATION_GROUP);
      const eventRevision = revisionOf(store, eventOf(store))!;
      const formationRevision = store.lookupReceipt(formation.intent_id)!.revision;
      const authorityIntent = groupOf(store, AUTH_GROUP).intent_id;
      const cases: [string, ReadOnlyStore, string][] = [
        [
          "the authority is absent",
          overlayStore(store, { facts: { [AUTH_KEY]: null } }),
          "AUTHORITY_ABSENT_AT_CUT",
        ],
        [
          "the authority's group does not write it",
          forgeGroupConsistently(store, AUTH_GROUP, (g) => {
            g.writes = g.writes.map((w) => ({
              ...w,
              key: "temporal/transaction-authority/not-it",
            }));
          }),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the authority was committed at the formation's revision, not before it",
          overlayStore(store, { revisions: { [authorityIntent]: formationRevision } }),
          "AUTHORITY_NOT_BETWEEN_EVENT_AND_FORMATION",
        ],
        [
          "the authority was committed at the event's revision, not after it",
          overlayStore(store, { revisions: { [authorityIntent]: eventRevision } }),
          "AUTHORITY_NOT_BETWEEN_EVENT_AND_FORMATION",
        ],
        [
          "the authority's group read another state version than the one it opened at",
          forgeGroupConsistently(store, AUTH_GROUP, (g) => (g.reads[0]!.version += 1)),
          "AUTHORITY_GROUP_NOT_THE_KERNEL_OPENING",
        ],
        [
          "the authority's group is caused by another transaction",
          forgeGroupConsistently(store, AUTH_GROUP, (g) => (g.cause = "transaction:another")),
          "AUTHORITY_GROUP_NOT_THE_KERNEL_OPENING",
        ],
        [
          "the authority's group is published under another authority",
          forgeGroupConsistently(
            store,
            AUTH_GROUP,
            (g) => (g.authority = { role: "role.someone-else", permission: "permission.anything" }),
          ),
          "AUTHORITY_GROUP_NOT_THE_KERNEL_OPENING",
        ],
        [
          "the authority's group is published under another governing rule",
          forgeGroupConsistently(
            store,
            AUTH_GROUP,
            (g) => (g.rule = EPISTEMIC_ACCESS_RULE_TENTH_SLICE),
          ),
          "AUTHORITY_GROUP_NOT_THE_KERNEL_OPENING",
        ],
        [
          "the authority opened another request (another target)",
          forgeConsistently(store, [
            [
              AUTH_KEY,
              (f: any) =>
                (f.value.requested.target = {
                  unit: f.value.requested.target.unit,
                  value: f.value.requested.target.value + 1,
                }),
            ],
          ]),
          "OWNER_TRIGGER_REFUSED",
        ],
        [
          "the authority carries other publication labels than the seal and itself",
          forgeConsistently(store, [
            [AUTH_KEY, (f: any) => (f.value.publication.secrecy = "another-secrecy")],
          ]),
          "AUTHORITY_NOT_WHAT_THE_SEAL_REPEATS",
        ],
        [
          "the authority carries another basis label than the seal and itself",
          forgeConsistently(store, [
            [AUTH_KEY, (f: any) => (f.value.publication.basis = "another-basis")],
          ]),
          "AUTHORITY_NOT_WHAT_THE_SEAL_REPEATS",
        ],
        [
          "the authority opened under another role context: the authority schema itself admits only the player-choice pair",
          forgeConsistently(store, [
            [AUTH_KEY, (f: any) => (f.value.context.permission = "permission.another")],
          ]),
          "AUTHORITY_INVALID",
        ],
      ];
      expect(auth.version).toBe(1);
      for (const [name, view, code] of cases)
        expect(verify(view), name).toMatchObject({ ok: false, code });
    });
  });

  it("the seal is its OWN committed group, strictly after the formation, that really wrote it: displaced provenance, an aliased revision or a missing write all refuse", async () => {
    await withPositive((store) => {
      const formation = groupOf(store, FORMATION_GROUP);
      const authority = groupOf(store, AUTH_GROUP);
      const seal = groupOf(store, SEAL_GROUP);
      const formationRevision = store.lookupReceipt(formation.intent_id)!.revision;
      const displaced = (group: typeof formation) =>
        forgeConsistently(store, [
          [
            TX_KEY,
            (f) => {
              f.provenance.group_id = group.group_id;
              f.provenance.intent_id = group.intent_id;
            },
          ],
        ]);
      const cases: [string, ReadOnlyStore, string][] = [
        [
          "the seal's provenance points at the formation group, which never wrote it",
          displaced(formation),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the seal's provenance points at the authority group, which never wrote it",
          displaced(authority),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the seal's group does not write the seal",
          forgeGroupConsistently(store, SEAL_GROUP, (g) => {
            g.writes = g.writes.filter((w) => w.key !== TX_KEY);
          }),
          "GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the seal was committed at the formation's revision (an alias, not strictly after)",
          overlayStore(store, { revisions: { [seal.intent_id]: formationRevision } }),
          "TRANSACTION_NOT_SEALED_AFTER_FORMATION",
        ],
        [
          "the seal was committed before the formation",
          overlayStore(store, { revisions: { [seal.intent_id]: formationRevision - 1 } }),
          "TRANSACTION_NOT_SEALED_AFTER_FORMATION",
        ],
        [
          "the seal's group read another state version than the transaction opened at",
          forgeGroupConsistently(store, SEAL_GROUP, (g) => (g.reads[0]!.version += 1)),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group does not read the durable authority",
          forgeGroupConsistently(store, SEAL_GROUP, (g) => (g.reads = g.reads.slice(0, 1))),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group does not depend on the formation group",
          forgeGroupConsistently(
            store,
            SEAL_GROUP,
            (g) => (g.depends_on = g.depends_on.filter((d) => d !== FORMATION_GROUP)),
          ),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group does not depend on the durable authority group",
          forgeGroupConsistently(
            store,
            SEAL_GROUP,
            (g) => (g.depends_on = g.depends_on.filter((d) => d !== AUTH_GROUP)),
          ),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group is published under another governing rule",
          forgeGroupConsistently(
            store,
            SEAL_GROUP,
            (g) => (g.rule = EPISTEMIC_ACCESS_RULE_TENTH_SLICE),
          ),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group is caused by another transaction",
          forgeGroupConsistently(store, SEAL_GROUP, (g) => (g.cause = "transaction:another")),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group is published under another authority",
          forgeGroupConsistently(
            store,
            SEAL_GROUP,
            (g) => (g.authority = { role: "role.someone-else", permission: "permission.anything" }),
          ),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
        [
          "the seal's group does not move the temporal state",
          forgeGroupConsistently(store, SEAL_GROUP, (g) => {
            g.writes = g.writes.filter((w) => w.key !== TEMPORAL_STATE_KEY);
          }),
          "SEAL_GROUP_NOT_THE_KERNEL_SEAL",
        ],
      ];
      for (const [name, view, code] of cases)
        expect(verify(view), name).toMatchObject({ ok: false, code });
    });
  });

  it("the seal's realized stage matches the journal: reads (missing, other version, other committing group), writes, invariants, group, receipt and hash", async () => {
    await withPositive((store) => {
      const stage = (patch: (s: any) => void) =>
        forgeConsistently(store, [[TX_KEY, (f: any) => patch(f.value.stages[0])]]);
      const cases: [string, ReadOnlyStore, string][] = [
        [
          "the realized reads are missing",
          stage((s) => (s.reads = [])),
          "TRANSACTION_STAGE_READS_NOT_REALIZED",
        ],
        [
          "a realized read names another source version",
          stage((s) => (s.reads[0].source_basis.version = 7)),
          "TRANSACTION_STAGE_READS_NOT_REALIZED",
        ],
        [
          "a realized read names another committing group",
          stage((s) => (s.reads[0].source_basis.committed_by = "another-group")),
          "TRANSACTION_STAGE_READS_NOT_REALIZED",
        ],
        [
          "a realized read names another source fact",
          stage((s) => (s.reads[0].source.fact_key = "access/another/event")),
          "TRANSACTION_STAGE_READS_NOT_REALIZED",
        ],
        [
          "a second realized read is invented",
          stage((s) => s.reads.push(structuredClone(s.reads[0]))),
          "TRANSACTION_STAGE_READS_NOT_REALIZED",
        ],
        [
          "the recorded invariants are not the receipt's",
          stage((s) => (s.validation.invariants = ["an-invented-invariant"])),
          "TRANSACTION_VALIDATION_NOT_THE_RECEIPT",
        ],
        [
          "the recorded group hash is not the committed group's",
          stage((s) => (s.group_sha256 = "a".repeat(64))),
          "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP",
        ],
        [
          "the recorded receipt revision is not the receipt's",
          stage((s) => (s.revision += 1)),
          "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP",
        ],
        [
          "the recorded group is another group",
          stage((s) => (s.group_id = "stage-group:another")),
          "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP",
        ],
        [
          "the recorded intent is another intent",
          stage((s) => (s.intent_id = "stage-intent:another")),
          "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP",
        ],
        [
          "the recorded writes name another fact",
          stage((s) => (s.writes[0].key = "access/another/packet/x")),
          "TRANSACTION_WRITES_NOT_THE_FORMATION",
        ],
        [
          "a recorded write is dropped",
          stage((s) => (s.writes = s.writes.slice(0, 1))),
          "TRANSACTION_WRITES_NOT_THE_FORMATION",
        ],
      ];
      for (const [name, view, code] of cases)
        expect(verify(view), name).toMatchObject({ ok: false, code });
    });
  });
});

afterAll(() => undefined);
