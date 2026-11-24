/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// F-014B P-7 E1 - E1-01..E1-08: the native DIRECT_OBSERVATION receipt/latency witness (BLUE P7-E1 brief, Notion 42220af9-01e0-811b-8857-f7647cabc51d).
// TEST-ONLY, READ-ONLY, MECHANISM ONLY (T1): the scripted referee decision is a legitimate fixture of the shipped observation seam, not genuine
// LLM reasoning, an actual client or retained production storage; those stay UNRUN. Nothing here certifies a route member, an actionable
// knowledge time or a wait interruption; the aggregate stays NOT_ACCEPTED.
//
// Non-tautology: the receipt is produced by the SHIPPED `observeSurroundings` on a native campaign (locality, character, binding, placement,
// Temporal at BASIS); the independent negative is the SAME scene with only an opaque screen substituted; the helper never receives an
// expected verdict. Each twin varies one real thing (a cut, a hidden record, a forged field, a revision, a clock) and the witness reads the
// real journal with the owners' own verifiers.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  BoundaryIndexSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  observationTransactionId,
  temporalTransactionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { formObservedPacket, verifyEpistemicIntegrity } from "@immortalis/engine";
import { FIXTURE_PC_ID, pcAccessEvent } from "@immortalis/testkit";
import { observationEventId } from "../../packages/engine/src/epistemic/observation.ts";
import { stageGroupId } from "../../packages/engine/src/temporal/identity.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  NO_HEALTH_OWNER_AUTHORITY,
  NO_PROVEN_FIRST_OPTION_AUTHORITY,
  checkSection10,
  refOf,
  type NativeObservationWitness,
} from "../support/p7-section10/proof.ts";
import {
  ledgerAtCut,
  nativeObservationWitness,
  overlayStore,
  revisionOf,
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
const TX_KEY = temporalTransactionKey(observationTransactionId(EVENT_ID));
const STAGE = accessPacketStage(EVENT_ID, PC_ID);

let positive: ObservationCampaign;
let screened: ObservationCampaign;

beforeAll(async () => {
  positive = await observationCampaign();
  const received = await observe(positive.dirs);
  expect(received.result.status, JSON.stringify(received.result.details)).toBe(
    "OBSERVATION_RECEIVED",
  );
  screened = await observationCampaign({ scene: screenScene() });
  const refused = await observe(screened.dirs);
  expect(refused.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
}, 480_000);

/** Opens the positive (or another) campaign, runs `fn` against its REAL store, and closes it: the writer lock never has two holders. */
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

/** The route-specific knowledge/latency result of the E0 checker for this event, with an optional native witness. */
function route(
  store: ReadOnlyStore,
  event: OwnerFact,
  opts: {
    witness?: NativeObservationWitness;
    cut?: number;
    ledger?: { get: (k: string) => OwnerFact | undefined };
    pc?: string;
    claims?: Record<string, unknown>;
  } = {},
) {
  const ledger = opts.ledger ?? ledgerAtCut(store, opts.cut);
  const certificate = {
    format: "immortalis-p7-section10-proof",
    version: 1,
    catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    member: { family: "EPISTEMIC_ROUTE", id: "DIRECT_OBSERVATION" },
    claims: {
      RECIPIENT_KNOWLEDGE_LATENCY: { evidence: [refOf(event)] },
      ...(opts.claims ?? {}),
    },
  };
  const result = checkSection10({
    manifest: currentManifest(),
    authority: currentAuthority(),
    ledger,
    certificates: [certificate],
    pc: { entity_id: opts.pc ?? PC_ID },
    cut: BASIS,
    ...(opts.witness ? { nativeObservation: opts.witness } : {}),
  });
  const verdict = result.verdicts.get(MEMBER)!;
  const knowledge = verdict.obligations.find(
    (o) => o.obligation === "RECIPIENT_KNOWLEDGE_LATENCY",
  )!;
  return { result, verdict, knowledge };
}
const eventOf = (store: ReadOnlyStore): OwnerFact => store.getFact(EVENT_KEY)!;
const forge = (fact: OwnerFact, patch: (f: any) => void): OwnerFact => {
  const copy = structuredClone(fact) as any;
  patch(copy);
  return copy as OwnerFact;
};
const headOf = (store: ReadOnlyStore) => {
  const h = store.head();
  return { revision: h.revision, state: h.state_sha256, entries: h.journal_entries };
};

describe("E1-01 native positive: the committed receipt, not a derivable one, closes the route's knowledge/latency obligation", () => {
  it("the real original journal verifies, and the E0 checker closes ONLY that obligation, only with the native witness", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      expect(AccessEventSchema.parse(event.value).channel).toBe("PERCEPTION");
      const witness = nativeObservationWitness(store);
      expect(witness.verify({ event, pc_id: PC_ID })).toMatchObject({ ok: true });

      const closed = route(store, event, { witness });
      expect(closed.knowledge).toMatchObject({ status: "CLOSED", reason: "CLOSED" });
      // the member is NOT proved: default Health, first option and history, and every other claim, stay open
      expect(closed.verdict.status).toBe("NOT_PROVEN");
      expect(closed.verdict.fixture_dependent).toBe(false);

      // the SAME evidence without the native witness is derivable and still does not close: derivable is not committed
      const derivable = route(store, event);
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
});

describe("E1-02 independent negative: the same scene with only an opaque screen earns no receipt and the witness has nothing to close on", () => {
  it("the owner refuses; no event, packet, provenance or transaction exists; and the positive campaign's receipt is not this campaign's", async () => {
    const positiveEvent = await withPositive((store) => eventOf(store));
    await withStore(screened.dirs.campaignDir, (store) => {
      for (const k of [EVENT_KEY, PACKET_KEY, PROVENANCE_KEY, TX_KEY])
        expect(store.getFact(k), k).toBeUndefined();
      // cross-campaign: the positive campaign's event presented against the screened campaign's journal never closes
      const verdict = nativeObservationWitness(store).verify({
        event: positiveEvent,
        pc_id: PC_ID,
      });
      expect(verdict).toMatchObject({ ok: false, code: "EVENT_NOT_AT_CUT" });
      const r = route(store, positiveEvent, {
        witness: nativeObservationWitness(store),
        ledger: { get: (k) => (k === EVENT_KEY ? positiveEvent : store.getFact(k)) },
      });
      expect(r.knowledge.status).toBe("OPEN");
      expect(r.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
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
      const earlier = nativeObservationWitness(store, { cutRevision: eventRevision });
      const atEarlierCut = ledgerAtCut(store, eventRevision);
      expect(atEarlierCut.get(EVENT_KEY)).toBeDefined();
      expect(atEarlierCut.get(PACKET_KEY)).toBeUndefined();
      // the payload is perfectly derivable from the event alone, and the E0 checker would have stopped only at the native requirement...
      expect(route(store, event, { cut: eventRevision }).knowledge.reason).toBe(
        "NATIVE_RECEIPT_EVIDENCE_ABSENT",
      );
      // ...and with the witness at that cut it refuses for the missing committed receipt
      const r = route(store, event, { witness: earlier, cut: eventRevision });
      expect(r.knowledge.status).toBe("OPEN");
      expect(r.knowledge.reason).toBe("NATIVE_RECEIPT_NOT_PROVEN");
      expect(r.knowledge.detail).toContain("PACKET_ABSENT_AT_CUT");
      // the full cut, same campaign, same evidence reference, closes: the cut is the discriminating variable
      expect(
        route(store, event, { witness: nativeObservationWitness(store) }).knowledge.status,
      ).toBe("CLOSED");
    });
  });

  it("each committed record is individually required: no provenance, no seal, or a seal committed after the cut", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const verdictOf = (s: ReadOnlyStore, cut?: number) =>
        nativeObservationWitness(s, cut === undefined ? {} : { cutRevision: cut }).verify({
          event,
          pc_id: PC_ID,
        });
      expect(verdictOf(overlayStore(store, { facts: { [PROVENANCE_KEY]: null } }))).toMatchObject({
        ok: false,
        code: "PROVENANCE_ABSENT_AT_CUT",
      });
      expect(verdictOf(overlayStore(store, { facts: { [PACKET_KEY]: null } }))).toMatchObject({
        ok: false,
        code: "PACKET_ABSENT_AT_CUT",
      });
      expect(verdictOf(overlayStore(store, { facts: { [TX_KEY]: null } }))).toMatchObject({
        ok: false,
        code: "TRANSACTION_ABSENT_AT_CUT",
      });
      // a cut exactly at the formation group: packet and provenance are committed, the sealed transaction is not yet
      const formationRevision = revisionOf(store, store.getFact(PACKET_KEY)!)!;
      const sealRevision = revisionOf(store, store.getFact(TX_KEY)!)!;
      expect(sealRevision).toBeGreaterThan(formationRevision);
      expect(verdictOf(store, formationRevision)).toMatchObject({
        ok: false,
        code: "TRANSACTION_ABSENT_AT_CUT",
      });
    });
  });
});

describe("E1-04 wrong character, forged records and a record that is not the journal's are each refused [forged fixtures are read-only overlays]", () => {
  it("another character, an authored (non-observation) event and a broadcast are not this receipt", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const witness = nativeObservationWitness(store);
      expect(witness.verify({ event, pc_id: "some-other-character" })).toMatchObject({
        ok: false,
        code: "EVENT_IDENTITY_NOT_DERIVED",
      });
      // through the E0 checker the recipient guard refuses before the witness is consulted
      const other = route(store, event, { witness, pc: "some-other-character" });
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
    expect(
      nativeObservationWitness(s.campaign.store).verify({ event: fact, pc_id: FIXTURE_PC_ID }),
    ).toMatchObject({ ok: false, code: "EVENT_IDENTITY_NOT_DERIVED" });
    const asRoute = route(s.campaign.store, fact, {
      witness: nativeObservationWitness(s.campaign.store),
      pc: FIXTURE_PC_ID,
    });
    expect(asRoute.knowledge.reason).toBe("EVENT_NOT_OBSERVATION_EARNED");
  });

  it("a self-consistent forged event (version, committing group, source pin, basis) is not the journal's own fact", async () => {
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
        const witness = nativeObservationWitness(store);
        // the forged fact is self-consistent for the E0 re-read: only the journal can refuse it
        const ledger = { get: (k: string) => (k === EVENT_KEY ? forged : store.getFact(k)) };
        const r = route(store, forged, { witness, ledger });
        expect(r.knowledge.status, name).toBe("OPEN");
        expect(witness.verify({ event: forged, pc_id: PC_ID }).ok, name).toBe(false);
      }
    });
  });

  it("the formation must be the committed stage group, after the event, with the transaction linked to that group and receipt", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const formationGroup = store.committedGroupById!(stageGroupId(STAGE))!;
      const eventRevision = revisionOf(store, event)!;
      // formation before event: the journal revision of the formation group is moved at or before the event's
      const early = overlayStore(store, {
        revisions: { [formationGroup.intent_id]: eventRevision },
      });
      expect(nativeObservationWitness(early).verify({ event, pc_id: PC_ID })).toMatchObject({
        ok: false,
        code: "FORMATION_NOT_AFTER_EVENT",
      });
      // the sealed transaction names another receipt for that group
      const sealed = store.getFact(TX_KEY)!;
      const tampered = forge(sealed, (f) => (f.value.stages[0].group_sha256 = "0".repeat(64)));
      expect(
        nativeObservationWitness(overlayStore(store, { facts: { [TX_KEY]: tampered } })).verify({
          event,
          pc_id: PC_ID,
        }),
      ).toMatchObject({ ok: false, code: "TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP" });
      // the packet is not what the owner derives
      const altered = forge(
        store.getFact(PACKET_KEY)!,
        (f) => (f.value.payload.content = "unseen"),
      );
      expect(
        nativeObservationWitness(overlayStore(store, { facts: { [PACKET_KEY]: altered } })).verify({
          event,
          pc_id: PC_ID,
        }),
      ).toMatchObject({ ok: false, code: "PACKET_NOT_THE_OWNER_DERIVATION" });
    });
  });
});

describe("E1-04 every guard of the witness has its own falsifier [forged overlays are read-only]", () => {
  it("each single forged or displaced record is refused for its own reason", async () => {
    await withPositive((store) => {
      const event = eventOf(store);
      const packet = store.getFact(PACKET_KEY)!;
      const provenance = store.getFact(PROVENANCE_KEY)!;
      const sealed = store.getFact(TX_KEY)!;
      const binding =
        store.getFact("role/player-character-binding") ??
        store.listFacts().find((f) => (f.value as any)?.binding_slot === "role.player_character")!;
      const eventGroup = store.committedGroupById!(event.provenance.group_id)!;
      const formationGroup = store.committedGroupById!(stageGroupId(STAGE))!;
      const formationRevision = revisionOf(store, packet)!;
      type Case = [string, ReadOnlyStore, string];
      const cases: Case[] = [
        [
          "the event group does not read the retained decision",
          overlayStore(store, { groups: { [eventGroup.group_id]: { ...eventGroup, reads: [] } } }),
          "OWNER_EVENT_VERIFIER_REFUSED",
        ],
        [
          "the event group is not the journal's: it does not write the event",
          overlayStore(store, { groups: { [eventGroup.group_id]: { ...eventGroup, writes: [] } } }),
          "EVENT_GROUP_DOES_NOT_WRITE_IT",
        ],
        [
          "the Role Registry binding names another character",
          overlayStore(store, {
            facts: {
              [binding.key]: forge(binding, (f) => (f.value.active_pc.entity_id = "someone-else")),
            },
          }),
          "PC_NOT_BOUND",
        ],
        [
          "the sealed provenance is not what the owner derives",
          overlayStore(store, {
            facts: { [PROVENANCE_KEY]: forge(provenance, (f) => (f.value.event.version += 1)) },
          }),
          "PROVENANCE_NOT_THE_OWNER_DERIVATION",
        ],
        [
          "the secrecy classes of packet and provenance are swapped",
          overlayStore(store, {
            facts: {
              [PACKET_KEY]: forge(packet, (f) => (f.secrecy = provenance.secrecy)),
              [PROVENANCE_KEY]: forge(provenance, (f) => (f.secrecy = packet.secrecy)),
            },
          }),
          "SECRECY_CLASS_NOT_SEPARATED",
        ],
        [
          "the provenance was committed by another REAL group (the event's), not the packet's stage group",
          overlayStore(store, {
            facts: {
              [PROVENANCE_KEY]: forge(
                provenance,
                (f) => (f.provenance.group_id = eventGroup.group_id),
              ),
            },
          }),
          "FORMATION_NOT_ONE_STAGE_GROUP",
        ],
        [
          "the formation group writes another key too",
          overlayStore(store, {
            groups: {
              [formationGroup.group_id]: {
                ...formationGroup,
                writes: [
                  ...formationGroup.writes,
                  { ...formationGroup.writes[0]!, key: "extra/key" },
                ],
              },
            },
          }),
          "FORMATION_GROUP_WRITES_OTHER_KEYS",
        ],
        [
          "the formation group belongs to another campaign",
          overlayStore(store, {
            groups: {
              [formationGroup.group_id]: { ...formationGroup, campaign_id: "another-campaign" },
            },
          }),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the journal is another campaign's",
          overlayStore(store, { campaignId: "another-campaign" }),
          "CAMPAIGN_MISMATCH",
        ],
        [
          "the seal is not the observation trigger",
          overlayStore(store, {
            facts: {
              [TX_KEY]: forge(sealed, (f) => (f.value.trigger.kind = "fixture-advance-request")),
            },
          }),
          "TRANSACTION_NOT_THE_OBSERVATION_TRIGGER",
        ],
        [
          "the seal names another stage",
          overlayStore(store, {
            facts: {
              [TX_KEY]: forge(
                sealed,
                (f) => (f.value.stages[0].stage.causal_process_id = "another-process"),
              ),
            },
          }),
          "TRANSACTION_STAGE_NOT_THE_PACKET_FORMATION",
        ],
        [
          "the seal records other writes",
          overlayStore(store, {
            facts: { [TX_KEY]: forge(sealed, (f) => (f.value.stages[0].writes[0].version = 9)) },
          }),
          "TRANSACTION_WRITES_NOT_THE_FORMATION",
        ],
        [
          "the seal engaged a temporal object: the transaction schema itself refuses it before the witness's explicit check (a backstop)",
          overlayStore(store, {
            facts: {
              [TX_KEY]: forge(sealed, (f) =>
                f.value.engaged.push({
                  boundary: "STILL_ACTIVE",
                  object_id: "an-engaged-object",
                  fact_key: "temporal/object/an-engaged-object",
                  version_before: 1,
                }),
              ),
            },
          }),
          "TRANSACTION_INVALID",
        ],
        [
          "the event's own group belongs to another campaign",
          overlayStore(store, {
            groups: { [eventGroup.group_id]: { ...eventGroup, campaign_id: "another-campaign" } },
          }),
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
        const verdict = nativeObservationWitness(view).verify({ event, pc_id: PC_ID });
        expect(verdict, name).toMatchObject({ ok: false, code });
      }
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
      const event = eventOf(store);
      const sealed = store.getFact(TX_KEY)!;
      const advanced = forge(sealed, (f) => {
        f.value.requested.target = { unit: f.value.requested.target.unit, value: 101 };
        f.value.outcome.actual_stop = { unit: f.value.outcome.actual_stop.unit, value: 101 };
      });
      const otherUnit = forge(sealed, (f) => (f.value.opening.basis_time.unit = "another-clock"));
      for (const [name, fact] of [
        ["advanced stop", advanced],
        ["other unit", otherUnit],
      ] as const) {
        const verdict = nativeObservationWitness(
          overlayStore(store, { facts: { [TX_KEY]: fact } }),
        ).verify({
          event,
          pc_id: PC_ID,
        });
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
      // the witness answers with a diagnostic and no payload or hidden timing
      const verdict = nativeObservationWitness(store).verify({
        event: eventOf(store),
        pc_id: PC_ID,
      });
      expect(JSON.stringify(verdict)).not.toContain(
        AccessiblePacketSchema.parse(packet.value).payload.content,
      );
    });
  });

  it("with the default Health, first-option and history authorities the member is still NOT_PROVEN: no substitution, no visual inference", async () => {
    await withPositive((store) => {
      const r = route(store, eventOf(store), {
        witness: nativeObservationWitness(store),
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
      const witness = nativeObservationWitness(store);
      witness.verify({ event, pc_id: PC_ID });
      route(store, event, { witness });
      route(store, event);
      nativeObservationWitness(store, { cutRevision: 1 }).verify({ event, pc_id: PC_ID });
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
      expect(
        route(store, eventOf(store), { witness: nativeObservationWitness(store) }).knowledge.status,
      ).toBe("CLOSED");
    });
  });
});

describe("E1-08 nothing is promoted: the catalogue is unchanged, no member is proof-closed, the aggregate stays NOT_ACCEPTED", () => {
  it("with the witness and the receipt present, the whole real catalogue is still 0 proof-closed and every sentinel is unchanged", async () => {
    await withPositive((store) => {
      const { result } = route(store, eventOf(store), { witness: nativeObservationWitness(store) });
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

afterAll(() => undefined);
