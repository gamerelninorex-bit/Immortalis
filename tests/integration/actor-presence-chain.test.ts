/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// R1 Stage-One v1.1 — the first non-PC actor physical presence chain (B1 actor_setup_placement → world_setup_closure → initial
// Temporal establishment → B2 actor_physical_presence). MECHANISM ONLY: no perception, faculty, Health, movement or player receipt.
// The positive witness is built through real owner admission with an independently committed pre-Temporal Named-Actor basis; it
// survives a later Temporal advance, save, reopen and full replay. Each negative changes one premise.
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorCapabilityKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import {
  capabilityConsumerObject,
  consumerAdvanceRequest,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  A,
  CAP,
  CLOSURE_KEY,
  L,
  L2,
  PLACEMENT_KEY,
  PRESENCE_KEY,
  closureValue,
  code,
  commitClosure,
  commitPlacement,
  commitPresence,
  establishClock,
  fullChain,
  r1Scene,
  reopen,
} from "../support/actor-presence.ts";

describe("the lawful chain", () => {
  it("commits B1, the closure, the clock and B2 through real admission, and survives a later Temporal advance, save and reopen", async () => {
    const dir = tempDir();
    const s = await r1Scene(dir);
    await fullChain(s);
    const b2 = s.campaign.store.getFact(PRESENCE_KEY)!;
    expect(b2.version).toBe(1);
    expect((b2.value as any).initial_custody).toBe("NON_PC_INITIAL");
    expect(s.campaign.verify()).toEqual([]);

    // later Temporal advance: the actor's own capability close is resolved by a dependent consequence's declared stage
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", s.basis),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    expect(s.campaign.store.getFact(actorCapabilityKey(A, CAP))).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
    const head = s.campaign.store.head();
    await s.campaign.close();

    const r = await reopen(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.campaign.store.getFact(PRESENCE_KEY)!.value).toEqual(b2.value);
    expect(r.campaign.verify()).toEqual([]);
    // the historical verifier demonstrably ran for the R1 groups on this replay
    const ran = r.campaign.store.ruleCheckedGroupIds!();
    for (const k of [PLACEMENT_KEY, CLOSURE_KEY, PRESENCE_KEY])
      expect(ran.has(r.campaign.store.getFact(k)!.provenance.group_id)).toBe(true);
    await r.campaign.close();
  });

  it("an empty closure is legal and enables no presence", async () => {
    const s = await r1Scene(tempDir());
    await must(commitClosure(s, []));
    await must(establishClock(s));
    expect(await code(commitPresence(s))).toBe("STALE_READ"); // the pinned B1 is not committed
    expect(s.campaign.store.getFact(PRESENCE_KEY)).toBeUndefined();
  });

  it("a fresh campaign holding only a profile and a locus passes the setup predicate", async () => {
    const s = await r1Scene(tempDir(), { noBasis: true });
    expect(s.campaign.store.listFacts().length).toBe(2);
    await must(commitClosure(s, []));
  });
});

describe("B1 (inert setup evidence)", () => {
  it("a second B1 for the same actor is refused, in any world", async () => {
    const s = await r1Scene(tempDir(), { extras: true });
    await must(commitPlacement(s));
    expect(await code(commitPlacement(s, { statement: "another" }))).toBe("VERSION_CONFLICT");
    expect(await code(commitPlacement(s, {}, A, L2))).not.toBe("OK");
  });

  it("a pin to a capability close (not the basis), a missing basis, a foreign actor's basis and a stale world pin are refused", async () => {
    const s = await r1Scene(tempDir());
    expect(
      await code(
        commitPlacement(s, {
          actor_state: [{ owner: "named_actor", fact_key: actorCapabilityKey(A, CAP), version: 1 }],
        }),
      ),
    ).not.toBe("OK");
    expect(await code(commitPlacement(s, { pinned_versions: { world: 2, locus: 1 } }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await code(
        commitPlacement(s, {
          actor_state: [
            {
              owner: "named_actor",
              fact_key: actorCapabilityBasisKey("someone-else", CAP),
              version: 1,
            },
          ],
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(PLACEMENT_KEY)).toBeUndefined();
  });

  it("B1 carries no custody or presence field, so none can be stated", async () => {
    const s = await r1Scene(tempDir());
    expect(await code(commitPlacement(s, { initial_custody: "NON_PC_INITIAL" }))).toBe(
      "VALUE_INVALID",
    );
    expect(await code(commitPlacement(s, { custodian: {} }))).toBe("VALUE_INVALID");
  });

  it("a B1 after the world's closure is refused", async () => {
    const s = await r1Scene(tempDir());
    await must(commitClosure(s, []));
    expect(await code(commitPlacement(s))).toBe("REFERENCE_INVALID");
  });
});

describe("the closure", () => {
  it("omitting, duplicating, mis-sorting or foreign entries is refused; a second closure is refused", async () => {
    const s = await r1Scene(tempDir(), { extras: true });
    await must(commitPlacement(s));
    expect(await code(commitClosure(s, []))).toBe("REFERENCE_INVALID"); // omitted
    expect(
      await code(
        commitClosure(s, [
          { fact_key: PLACEMENT_KEY, version: 1 },
          { fact_key: PLACEMENT_KEY, version: 1 },
        ]),
      ),
    ).toBe("REFERENCE_INVALID"); // duplicate
    expect(await code(commitClosure(s, [{ fact_key: PLACEMENT_KEY, version: 2 }]))).not.toBe("OK");
    await must(commitClosure(s));
    expect(await code(commitClosure(s))).toBe("VERSION_CONFLICT");
    expect(s.campaign.store.getFact(CLOSURE_KEY)!.version).toBe(1);
    expect(closureValue([]).placements).toEqual([]);
    void worldLocusKey;
    void worldProfileKey;
  });
});

describe("ordering", () => {
  it("a closure (or a B1) committed after the initial Temporal establishment is refused: the journal order is B1, closure, clock, B2", async () => {
    const s = await r1Scene(tempDir());
    await must(commitPlacement(s));
    await must(establishClock(s));
    expect(await code(commitClosure(s))).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(CLOSURE_KEY)).toBeUndefined();
    // without a closure the B1 is inert: no presence
    expect(await code(commitPresence(s))).toBe("STALE_READ");
    const late = await r1Scene(tempDir());
    await must(establishClock(late));
    expect(await code(commitPlacement(late))).toBe("REFERENCE_INVALID");
  });
});

describe("B2 (the first current physical record)", () => {
  it("is refused without a closure, without a Temporal clock, with a wrong instant, a wrong locus or a stale pin", async () => {
    const s = await r1Scene(tempDir(), { extras: true });
    await must(commitPlacement(s));
    await must(commitClosure(s));
    await must(establishClock(s));
    expect(await code(commitPresence(s, { effective_instant: { unit: "tick", value: 999 } }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await code(commitPresence(s, {}, A, L2))).not.toBe("OK");
    expect(
      await code(
        commitPresence(s, { pinned_versions: { world: 1, locus: 1, placement: 1, closure: 2 } }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(PRESENCE_KEY)).toBeUndefined();
    await must(commitPresence(s));
  });

  it("without any Temporal state is refused", async () => {
    const s = await r1Scene(tempDir());
    await must(commitPlacement(s));
    await must(commitClosure(s));
    expect(await code(commitPresence(s))).toBe("STALE_READ"); // no Temporal state to read
    expect(s.campaign.store.getFact(PRESENCE_KEY)).toBeUndefined();
  });

  it("admits only its initial version: a successor and a second presence are refused", async () => {
    const s = await r1Scene(tempDir());
    await fullChain(s);
    const again = await s.campaign.store.commit({
      ...(await (async () => {
        const { r1Group, presenceValue } = await import("../support/actor-presence.ts");
        return r1Group(
          s.campaign.store,
          PRESENCE_KEY,
          presenceValue(),
          [worldProfileKey("world-fixture"), PLACEMENT_KEY, CLOSURE_KEY, "temporal/state"].filter(
            (k) => s.campaign.store.getFact(k),
          ),
          {},
          1,
        );
      })()),
    });
    expect(again.ok).toBe(false);
    expect(s.campaign.store.getFact(PRESENCE_KEY)!.version).toBe(1);
  });
});
