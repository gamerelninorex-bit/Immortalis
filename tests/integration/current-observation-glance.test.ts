/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// The CURRENT OBSERVATION GLANCE read over the REAL observation path (BLUE v5.2 bounded brief 2026-10-15; I-001 §§3–5, 9–11; F-014D §§2,
// 4.1, 5, 6; F-014B §§4, 17). Every campaign here is built only by the shipped commands (`establish-locality`, `author-character`,
// `establish-character-locus`, the Temporal owner's establishment) and the shipped `observe-surroundings` observation. The referee host is
// a SCRIPTED policy the test wrote that reads the DELIVERED words (PLUMBING ONLY): it proves the mechanism — that a separate, trusted,
// event-ID-free read finds exactly the earned, still-current arrival, and nothing else — and certifies NOTHING about whether any AI reads
// any sentence correctly. The finite semantic support is the retained real-host exercise (docs/evidence/b52-direct-observation-live-host*).
// The source fixtures assert no verdict, receipt, packet or Glance success as an upstream fact: those are produced by the owners.
import { describe, expect, it } from "vitest";
import {
  EventSignalPresentationSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  accessEventKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import {
  EpistemicAccessAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  formObservedPacket,
  verifyEpistemicIntegrity,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedCurrentPlayerContext,
  bindTrustedEventSignalContext,
  deliverCausalEventSignalPresentation,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import {
  BASIS,
  PC_ID,
  decide,
  observationCampaign,
  observe,
  screenScene,
} from "../support/observation.ts";
import { CAUSAL_REQUEST, GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";

const LATER = at(150);
const ctxOf = (c: CanonicalCampaign, recipient = PC_ID) =>
  bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: recipient });
const glance = (c: CanonicalCampaign, recipient = PC_ID, ...request: unknown[]) =>
  JSON.stringify(
    readCurrentObservationGlance(
      ctxOf(c, recipient),
      request.length > 0 ? request[0] : GLANCE_REQUEST(),
    ),
  );

/** Opens the campaign for the length of one callback (a separate reader: it holds no event identity from any operator call). */
async function reading<T>(dirs: LocalityDirs, fn: (c: CanonicalCampaign) => Promise<T> | T) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}

const observed = async () => {
  const { dirs } = await observationCampaign();
  const r = await observe(dirs);
  expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_RECEIVED");
  return dirs;
};

const eventIdOf = (c: CanonicalCampaign): string =>
  c.store
    .listFacts()
    .find((f) => /^access\/[^/]+\/event$/.test(f.key))!
    .key.split("/")[1]!;

const headOf = (c: CanonicalCampaign) => {
  const h = c.store.head();
  return {
    revision: h.revision,
    state: h.state_sha256,
    facts: c.store.listFacts().length,
    journal: h.journal_head_sha256,
  };
};

describe("positive: the earned, still-current observation is read without any event identity", () => {
  it("a separate read returns exactly the lawful contact, referent, content and presented attribution, byte for byte as the existing causal path presents them", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      const out = glance(c);
      const parsed = JSON.parse(out);
      expect(parsed.ok, out).toBe(true);
      expect(EventSignalPresentationSchema.safeParse(parsed.value).success).toBe(true);
      expect(parsed.value.viewpoint).toEqual({ role: "role.player_character", entity_id: PC_ID });
      expect(parsed.value.elements).toEqual([
        { element: "CONTACT", channel: "PERCEPTION" },
        { element: "REFERENT", text: "a patch on the wall facing the character" },
        { element: "CONTENT", text: "a broad patch of bright red on pale plaster" },
      ]);
      // the existing, event-identity-carrying delivery presents the very same value
      const viaCausal = deliverCausalEventSignalPresentation(
        bindTrustedCausalEventSignalContext({
          view: c.store,
          recipient_id: PC_ID,
          event_id: eventIdOf(c),
        }),
        CAUSAL_REQUEST(),
      );
      expect(out).toBe(JSON.stringify(viaCausal));
      // and the host was handed nothing it could carry: no event id, owner key, basis, source or world/locus key
      expect(out).not.toContain(eventIdOf(c));
      expect(out).not.toMatch(
        /obs-|access\/|world\/|referee|source|locus_|decision|BOUNDED_SHARED|provenance|sealed/i,
      );
    });
  });

  it("is read-only and inert: repeated reads at the same basis are stable and change no head, fact, journal or canonical time", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      const before = headOf(c);
      const clock = JSON.stringify(c.store.getFact("temporal/state")?.value);
      const first = glance(c);
      for (let i = 0; i < 5; i += 1) {
        expect(glance(c)).toBe(first);
        glance(c, "no-such-entity");
        readCurrentObservationGlance(ctxOf(c), { operation: "listFacts" });
      }
      expect(headOf(c)).toEqual(before);
      expect(JSON.stringify(c.store.getFact("temporal/state")?.value)).toBe(clock);
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  });

  it("save and reopen at the same basis reproduces exactly what the current source permits", async () => {
    const dirs = await observed();
    const first = await reading(dirs, (c) => glance(c));
    expect(JSON.parse(first).ok).toBe(true);
    for (let i = 0; i < 2; i += 1) expect(await reading(dirs, (c) => glance(c))).toBe(first);
  });

  it("a replay of the same formation writes nothing and leaves the read unchanged", async () => {
    const dirs = await observed();
    await reading(dirs, async (c) => {
      const first = glance(c);
      const decisionKey = c.store
        .listFacts()
        .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
      const before = headOf(c);
      const replay = await formObservedPacket(c.store, decisionKey);
      expect(replay.ok && replay.value.replayed).toBe(true);
      expect(headOf(c)).toEqual(before);
      expect(glance(c)).toBe(first);
    });
  });
});

describe("independently falsifying negative: the identical premises with an opaque screen earn nothing and read as nothing", () => {
  it("the optical swap earns no event, packet or provenance, and the read is the same opaque refusal as a missing event", async () => {
    const swapped = await observationCampaign({ scene: screenScene() });
    const r = await observe(swapped.dirs);
    expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_NOT_ESTABLISHED");

    const never = await observationCampaign();
    await reading(swapped.dirs, async (a) => {
      expect(a.store.listFacts().filter((f) => f.key.startsWith("access/"))).toEqual([]);
      expect(glance(a)).toBe(PROTOCOL_REFUSAL);
      await reading(never.dirs, (b) => expect(glance(b)).toBe(glance(a)));
    });
  });

  it("before any observation, and with no canonical time yet established, the read is the opaque refusal", async () => {
    const fresh = await observationCampaign();
    await reading(fresh.dirs, (c) => expect(glance(c)).toBe(PROTOCOL_REFUSAL));
    const timeless = await observationCampaign({ time: false });
    await reading(timeless.dirs, (c) => expect(glance(c)).toBe(PROTOCOL_REFUSAL));
  });
});

describe("recipient, binding and trusted-handle failures read as the same opaque refusal", () => {
  it("a wrong client recipient, an unknown entity and an absent binding are refused while the genuine PC is served", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      expect(JSON.parse(glance(c)).ok).toBe(true);
      for (const other of ["no-such-entity", "pc-someone-else", "-", "", "../x"])
        expect(glance(c, other), other).toBe(PROTOCOL_REFUSAL);
    });
  });

  it("an absent role binding, custody, temporal state or Epistemic record is refused although everything else is committed", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      const hiding = (hidden: (key: string) => boolean) =>
        JSON.stringify(
          readCurrentObservationGlance(
            bindTrustedCurrentPlayerContext({
              view: {
                getFact: (k) => (hidden(k) ? undefined : c.store.getFact(k)),
                committedGroup: (id) => c.store.committedGroup(id),
              },
              recipient_id: PC_ID,
            }),
            GLANCE_REQUEST(),
          ),
        );
      expect(hiding(() => false)).toBe(glance(c));
      expect(JSON.parse(hiding(() => false)).ok).toBe(true);
      expect(hiding((k) => k === PLAYER_CHARACTER_BINDING_KEY)).toBe(PROTOCOL_REFUSAL);
      expect(hiding((k) => k === TEMPORAL_STATE_KEY)).toBe(PROTOCOL_REFUSAL);
      expect(hiding((k) => k.startsWith("access/"))).toBe(PROTOCOL_REFUSAL);
      expect(hiding((k) => k === worldPcLocusCustodyKey(PC_ID))).toBe(PROTOCOL_REFUSAL);
    });
  });

  it("a fabricated, parsed, copied or foreign-operation handle is not a context", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      const real = ctxOf(c);
      const copies: unknown[] = [
        {},
        Object.freeze({}),
        JSON.parse(JSON.stringify(real)),
        { ...(real as object) },
        Object.create(real as object),
        { view: c.store, recipient_id: PC_ID },
        null,
        undefined,
        "ctx",
        // handles of the sibling read-only operations are not this operation's context
        bindTrustedEventSignalContext({ view: c.store, recipient_id: PC_ID }),
        bindTrustedCausalEventSignalContext({
          view: c.store,
          recipient_id: PC_ID,
          event_id: eventIdOf(c),
        }),
      ];
      for (const fake of copies)
        expect(
          JSON.stringify(readCurrentObservationGlance(fake as any, GLANCE_REQUEST())),
          String(fake),
        ).toBe(PROTOCOL_REFUSAL);
      expect(JSON.parse(glance(c)).ok).toBe(true);
    });
  });
});

describe("a malformed or over-claiming host request is refused and never honoured", () => {
  it("any field beyond the operation name — event, basis, time, role, permission, availability — is the opaque refusal", async () => {
    const dirs = await observed();
    await reading(dirs, (c) => {
      expect(JSON.parse(glance(c)).ok).toBe(true);
      const e = eventIdOf(c);
      for (const claim of [
        { event_id: e },
        { eventId: e },
        { recipient_id: "pc-other" },
        { campaign_id: "other" },
        { at: BASIS },
        { time: 100 },
        { canonical_time: BASIS },
        { basis: "direct-perception-observation" },
        { role: "role.archivist" },
        { permission: "permission.canon.write" },
        { available: true },
        { receipt: true },
        { source: "world/x/profile" },
        { limit: 1 },
      ])
        expect(glance(c, PC_ID, GLANCE_REQUEST(claim)), JSON.stringify(claim)).toBe(
          PROTOCOL_REFUSAL,
        );
      for (const bad of [
        null,
        undefined,
        [],
        "read_current_observation_glance",
        42,
        {},
        { operation: "read_current_event_signal_presentation" },
        { operation: "deliver_causal_event_signal_presentation" },
        { operation: "READ_CURRENT_OBSERVATION_GLANCE" },
        { operation: ["read_current_observation_glance"] },
      ])
        expect(glance(c, PC_ID, bad), JSON.stringify(bad)).toBe(PROTOCOL_REFUSAL);
    });
  });
});

describe("seal, order and supersession: no Glance before the whole causal chain, and an old arrival is never revived", () => {
  it("an event committed without its packet and sealed transaction reads as nothing, and the retry that seals it makes the read succeed", async () => {
    const { dirs } = await observationCampaign();
    await reading(dirs, async (c) => {
      await decide(c);
      const decisionKey = c.store
        .listFacts()
        .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
      // the Epistemic owner's event only: no packet, no sealed player-facing transaction yet
      const event = await new EpistemicAccessAdapter(c.store).establishObservedAccess({
        decision_key: decisionKey,
      });
      expect(event.ok, JSON.stringify(event)).toBe(true);
      expect(c.store.getFact(accessEventKey(eventIdOf(c)))).toBeDefined();
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
      const before = headOf(c);
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
      expect(headOf(c)).toEqual(before);

      // recovery: the shipped formation resumes by identity and seals; only then is the arrival readable
      const formed = await formObservedPacket(c.store, decisionKey);
      expect(formed.ok, JSON.stringify(formed)).toBe(true);
      expect(JSON.parse(glance(c)).ok).toBe(true);
    });
  });

  it("after canonical time advances past the observation the old packet exists but is not revived; a new look is its own current arrival", async () => {
    const dirs = await observed();
    const original = await reading(dirs, (c) => glance(c));
    expect(JSON.parse(original).ok).toBe(true);

    await reading(dirs, async (c) => {
      await must(
        new TemporalCoordinator(c.store, new StageProviderRegistry()).advance(
          stopAtBoundaryRequest("tx-after-glance", {
            requested: { target: LATER, condition: null },
          }),
        ),
      );
    });
    // the historical event and packet are still held …
    await reading(dirs, (c) => {
      expect(c.store.listFacts().some((f) => /^access\/[^/]+\/packet\//.test(f.key))).toBe(true);
      // … but storage is no recall basis: the read does not revive it, in this process or after a reopen
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
    });
    expect(await reading(dirs, (c) => glance(c))).toBe(PROTOCOL_REFUSAL);

    // a new observation at the new basis is a separately caused operation and is then the current arrival
    expect((await observe(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    await reading(dirs, (c) => {
      const next = JSON.parse(glance(c));
      expect(next.ok).toBe(true);
      expect(next.value.elements).toEqual(JSON.parse(original).value.elements);
      expect(c.verify()).toEqual([]);
    });
  });

  it("a newer sealed transaction at the same basis supersedes the arrival: the read fails closed", async () => {
    const dirs = await observed();
    await reading(dirs, async (c) => {
      expect(JSON.parse(glance(c)).ok).toBe(true);
      const advanced = await new TemporalCoordinator(c.store, new StageProviderRegistry()).advance(
        stopAtBoundaryRequest("tx-same-basis", { requested: { target: BASIS, condition: null } }),
      );
      // the kernel seals a newer player-facing transaction at the same basis: the old arrival is no longer the current one
      expect(advanced.ok).toBe(true);
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
    });
  });
});

describe("campaign isolation: each trusted context reads only its own campaign", () => {
  it("an observation in one campaign is invisible to the other, with identical PC and world identities", async () => {
    const a = await observed();
    const b = await observationCampaign();
    await reading(a, async (ca) => {
      await reading(b.dirs, (cb) => {
        expect(JSON.parse(glance(ca)).ok).toBe(true);
        expect(glance(cb)).toBe(PROTOCOL_REFUSAL);
        // a context bound to the empty campaign cannot be pointed at the other one by any request field
        expect(
          JSON.stringify(
            readCurrentObservationGlance(
              ctxOf(cb),
              GLANCE_REQUEST({ view: ca.store, campaign_id: "a" }),
            ),
          ),
        ).toBe(PROTOCOL_REFUSAL);
      });
    });
  });
});
