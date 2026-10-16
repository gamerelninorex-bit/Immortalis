/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// CPAA-C1 v0.2 PROVISIONAL — canonical truth is not the character's knowledge. The completed collection's Production/World-State outcome
// (source 120 → 117, Reserve 0 → 3) reaches the character ONLY through the existing F-014D direct-perception receipt: the sealed
// World-State delivery is delivered to the referee host as one world fact at the character's locus, the host's quote-anchored reading
// decides whether it is perceivable (faculty, position, path), the engine derives the verdict, and only an ESTABLISHED reading earns
// the Epistemic owner's event, the packet and the I-001 accessible content. The contrast: the same completed collection, with an
// obstructed path, a host that cannot ground it, or no observation at all, leaves the character with nothing. The scripted host is a
// policy the test wrote (PLUMBING ONLY); the semantic claim is the retained live-host exercise's, not this suite's.
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  worldSourceDeliveryKey,
} from "@immortalis/contracts";
import {
  EpistemicAccessAdapter,
  formObservedPacket,
  verifyEpistemicIntegrity,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedCurrentPlayerContext,
  deliverCausalEventSignalPresentation,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { openOrdinary, SOURCE_KEY, WORLD_ID, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID, observe, screenScene, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import {
  SALT,
  SALT_TAU,
  collectAndComplete,
  decideOutcome,
  originalCollectionCampaign,
  outcomeAnswer,
} from "../support/pc-collection-original.ts";
import { CAUSAL_REQUEST, GLANCE_REQUEST } from "../support/protocol.ts";

const BOUNDARY = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const deliveryKeyOf = (act: string) =>
  worldSourceDeliveryKey(WORLD_ID, `pc-collect:${PC_ID}:${act}`);

async function reading<T>(dirs: LocalityDirs, fn: (c: CanonicalCampaign) => Promise<T> | T) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
const accessKeys = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .map((f) => f.key)
    .filter((k) => k.startsWith("access/"));
const glance = (c: CanonicalCampaign) =>
  JSON.parse(
    JSON.stringify(
      readCurrentObservationGlance(
        bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: PC_ID }),
        GLANCE_REQUEST(),
      ),
    ),
  );
const decisionKeyOf = (c: CanonicalCampaign, n = 0): string =>
  c.store
    .listFacts()
    .filter((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")
    .map((f) => f.key)[n]!;
const sourceAmount = (c: CanonicalCampaign) =>
  (c.store.getFact(`world/${WORLD_ID}/source/${SOURCE_KEY}`)!.value as any).recoverable.amount;
const reserveAmount = (c: CanonicalCampaign) =>
  (c.store.getFact(`production/reserve/${SALT.reserve}`)!.value as any).quantity.amount;

describe("the positive: a perceivable completed gathering earns the receipt, the packet and the accessible content", () => {
  it("source 120→117 and Reserve 0→3 are canon; the character learns of the gathering only through the direct-perception receipt", async () => {
    const { dirs } = await originalCollectionCampaign();
    await reading(dirs, async (c) => {
      expect(sourceAmount(c)).toBe(120);
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      expect(sourceAmount(c)).toBe(117);
      expect(reserveAmount(c)).toBe(3);
      // canonical truth alone is not knowledge: the owners committed the outcome, and the character holds NOTHING of it
      expect(accessKeys(c)).toEqual([]);
      expect(glance(c)).toMatchObject({ ok: false });
    });

    await reading(dirs, async (c) => {
      const d = await decideOutcome(c, { of: "outcome" });
      expect(d.recorded.ok, JSON.stringify(d.recorded)).toBe(true);
      const record = (d.recorded as any).value;
      expect(record.verdict).toBe("OBSERVATION_ESTABLISHED");
      // the question delivered the sealed World-State delivery of the character's OWN collection, and cited it
      expect(d.context.facts.map((f) => f.fact_id)).toContain("outcome.collection");
      expect(d.context.refs.map((r) => r.fact_key)).toContain(deliveryKeyOf("act-1"));
      const decisionKey = decisionKeyOf(c);

      const event = await new EpistemicAccessAdapter(c.store).establishObservedAccess({
        decision_key: decisionKey,
      });
      expect(event.ok, JSON.stringify(event)).toBe(true);
      const formed = await formObservedPacket(c.store, decisionKey);
      expect(formed.ok, JSON.stringify(formed)).toBe(true);

      const eventFact = c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!;
      const e = AccessEventSchema.parse(eventFact.value);
      expect(e.participants).toEqual([PC_ID]);
      expect(e.channel).toBe("PERCEPTION");
      // the foreign physical source is the sealed World-State delivery, pinned at its version, never copied
      expect(e.source).toMatchObject({ owner: "world_state", fact_key: deliveryKeyOf("act-1") });
      expect(e.payload.content).toBe("a small heap of loose, pale grains lying gathered together");
      const packetFact = c.store.listFacts().find((f) => /^access\/[^/]+\/packet\//.test(f.key))!;
      const packet = AccessiblePacketSchema.parse(packetFact.value);
      expect(packet.payload.content).toBe(e.payload.content);
      // the accessible content is delivered by I-001's own causal Event-Signal delivery, the path the operator's observation uses: the
      // appearance only, never the number or any identity
      const seen = JSON.parse(
        JSON.stringify(
          deliverCausalEventSignalPresentation(
            bindTrustedCausalEventSignalContext({
              view: c.store,
              recipient_id: PC_ID,
              event_id: e.event_id,
            }),
            CAUSAL_REQUEST(),
          ),
        ),
      );
      expect(seen.ok, JSON.stringify(seen)).toBe(true);
      expect(JSON.stringify(seen)).toContain("pale grains");
      expect(JSON.stringify(seen)).not.toMatch(/117|120|reserve-salt|source-delivery|pc-collect/);
      // KNOWN LIMIT (fail-closed): the separate event-ID-free Glance read has one FIXED nine-read shape over exactly five cited premises
      // (RC-14); a record that also cites the delivery is not that shape, so the Glance refuses it rather than being widened here
      expect(glance(c)).toMatchObject({ ok: false });
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  }, 180_000);

  it("the SHIPPED observe-surroundings command carries it end to end: the player is shown the appearance the reading earned, and not the canon", async () => {
    const { dirs } = await originalCollectionCampaign();
    await reading(dirs, (c) => collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY));
    const out = await observe(dirs, verbConsole("observe-surroundings"), {}, (doc) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION"
        ? outcomeAnswer(doc, { of: "outcome" })
        : plainPolicy(doc),
    );
    expect(out.result.status, JSON.stringify(out.result.details)).toBe("OBSERVATION_RECEIVED");
    const shown = out.terminal.said.join("\n") + out.result.details.join("\n");
    expect(out.result.details).toContain(
      "content: a small heap of loose, pale grains lying gathered together",
    );
    // the console's one-time challenge and the progress digests are random hex: a canon number may not be matched inside them
    const withoutDigests = shown.replace(/[0-9a-f]{10,}/g, "");
    expect(withoutDigests).not.toMatch(/117|120|reserve-salt|source-delivery|pc-collect/);
    await reading(dirs, (c) => {
      expect(accessKeys(c).filter((k) => k.endsWith("/event"))).toHaveLength(1);
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  }, 180_000);

  it("a later completed gathering does not disturb the verification of the earlier receipt (the record cites its own delivery)", async () => {
    const { dirs } = await originalCollectionCampaign();
    await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      await decideOutcome(c, { of: "outcome" });
      const decisionKey = decisionKeyOf(c);
      await new EpistemicAccessAdapter(c.store).establishObservedAccess({
        decision_key: decisionKey,
      });
      await formObservedPacket(c.store, decisionKey);
    });
    await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-2", 2, "tx-collect-2", {
        unit: BASIS.unit,
        value: BOUNDARY.value + 2 * SALT_TAU,
      });
      expect(sourceAmount(c)).toBe(115);
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
    await reading(dirs, (c) => {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  }, 180_000);
});

describe("the contrasts: the same completed collection earns the character nothing", () => {
  it("an obstructed path earns no receipt and no packet: the reading is retained as audit evidence and nothing else", async () => {
    const { dirs } = await originalCollectionCampaign({ scene: screenScene() });
    await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      expect(reserveAmount(c)).toBe(3);
      const d = await decideOutcome(c, { of: "outcome" });
      expect((d.recorded as any).value.verdict).toBe("OBSERVATION_OBSTRUCTED");
      expect((d.recorded as any).value.record?.decision?.payload ?? null).toBeNull();
      const established = await new EpistemicAccessAdapter(c.store).establishObservedAccess({
        decision_key: decisionKeyOf(c),
      });
      expect(established.ok).toBe(false);
      expect(accessKeys(c)).toEqual([]);
      expect(glance(c)).toMatchObject({ ok: false });
    });
  }, 180_000);

  it("a host that does not ground the appearance in the delivered gathering is set aside; one that states an engine reference is refused", async () => {
    const { dirs } = await originalCollectionCampaign();
    await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      const head = c.store.head().state_sha256;
      for (const [name, over] of Object.entries({
        "a quotation the gathering fact does not contain": (a: any) => {
          a.payload.basis[0].evidence_quote = "a great stack of gold";
        },
        "an appearance of a fact that was never delivered": (a: any) => {
          a.payload.source_fact_id = "outcome.other";
        },
        "an appearance that names the delivery's identity": (a: any) => {
          a.payload.content = `a heap from pc-collect:${PC_ID}:act-1`;
        },
        "an appearance that names the fact id": (a: any) => {
          a.payload.content = "outcome.collection";
        },
      })) {
        const d = await decideOutcome(c, { of: "outcome" }, 0, over);
        expect(d.recorded.ok, name).toBe(false);
        expect(c.store.head().state_sha256, name).toBe(head);
      }
      expect(accessKeys(c)).toEqual([]);
    });
  }, 180_000);

  it("before the gathering completes the question delivers no outcome, and an appearance of it cannot be cited", async () => {
    const { dirs } = await originalCollectionCampaign();
    await reading(dirs, async (c) => {
      const d = await decideOutcome(c, { of: "outcome" });
      expect(d.context.facts.map((f) => f.fact_id)).not.toContain("outcome.collection");
      expect(d.context.refs).toHaveLength(5);
      // the ordinary scene reading is unchanged by the slice (no outcome fact, five citations)
      expect(d.recorded.ok).toBe(true);
      const forced = await decideOutcome(c, { of: "outcome" }, 1, (a: any) => {
        a.payload = {
          source_fact_id: "outcome.collection",
          referent: "the material the character worked",
          content: "a small heap of loose grains",
          basis: [
            { from: "WORLD_FACT", ref: "outcome.collection", evidence_quote: "gathering of 3" },
          ],
        };
      });
      expect(forced.recorded.ok).toBe(false);
    });
  }, 180_000);
});
