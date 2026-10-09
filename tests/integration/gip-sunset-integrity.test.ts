/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and receipt values */
// GIP Governance Instrument Sunset (sunset slice) — load-time verification fails closed on drift of the sunset-bearing
// Instrument, GIP's enrollment receipt, the Temporal object GIP's sunset earned and the expired Instrument's stage. Replay proves the
// HISTORY is intact and canonical integrity proves each fact's meaning; this proves the GIP facts still tell one story.
// Register lineage: IA-02, IA-03, IA-06 (partial); RC-07/10/16; IM-02, IM-06, IM-12.
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  gipInstrumentKey,
  gipSunsetObjectId,
  temporalObjectKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { verifyGipIntegrity, type CampaignStore } from "@immortalis/engine";
import { INSTRUMENT_A } from "@immortalis/testkit";
import {
  OTHER_SUNSET_AT,
  SUNSET_AT,
  SUNSET_LATER,
  advanceTo,
  establishSunset,
  seededSunsetCampaign,
  type SunsetSeeded,
} from "../support/gip-sunset.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const instrumentKey = gipInstrumentKey(INSTRUMENT_A);
const objectKey = temporalObjectKey(gipSunsetObjectId(INSTRUMENT_A));

/** The GIP verifier over a view of the campaign whose facts, journaled groups and receipts have drifted. */
function verified(
  s: SunsetSeeded,
  drift: {
    facts?: (facts: OwnerFact[]) => OwnerFact[];
    group?: (g: CommitGroup | null, intentId: string) => CommitGroup | null;
    revision?: (intentId: string, revision: number | undefined) => number | undefined;
  },
): string {
  const inner = s.campaign.store;
  const facts = (drift.facts ?? ((f) => f))(structuredClone([...inner.listFacts()]) as OwnerFact[]);
  const bound: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => facts.find((f) => f.key === k),
    listFacts: () => facts,
    lookupReceipt: (i) => {
      const r = inner.lookupReceipt(i);
      return r && drift.revision ? { ...r, revision: drift.revision(i, r.revision) as number } : r;
    },
    committedGroup: (i) => {
      const g = inner.committedGroup(i);
      return drift.group ? drift.group(g ? structuredClone(g) : g, i) : g;
    },
    commit: (g) => inner.commit(g),
    close: () => inner.close(),
  };
  return verifyGipIntegrity(bound)
    .map((v) => `${v.key}: ${v.message}`)
    .join(" | ");
}
const edit = (key: string, f: (fact: any) => void) => (facts: OwnerFact[]) => {
  const fact = facts.find((x) => x.key === key);
  if (fact) f(fact);
  return facts;
};
const drop = (key: string) => (facts: OwnerFact[]) => facts.filter((f) => f.key !== key);

async function registered(): Promise<SunsetSeeded> {
  const s = await seededSunsetCampaign(tempDir());
  await establishSunset(s);
  return s;
}
async function expired(): Promise<SunsetSeeded> {
  const s = await registered();
  await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
  return s;
}

describe("a healthy sunset-bearing campaign verifies, before and after the expiry", () => {
  it("active and enrolled, and expired, each verify clean", async () => {
    expect(verified(await registered(), {})).toBe("");
    expect(verified(await expired(), {})).toBe("");
  });
});

describe("drift of the registered sunset-bearing Instrument, its receipt and its Temporal object is detected", () => {
  it("an object whose boundary, stage or ownership no longer matches the Instrument is detected", async () => {
    const s = await registered();
    expect(
      verified(s, {
        facts: edit(
          objectKey,
          (f) => (f.value.next_boundary.at = { ...SUNSET_AT, value: SUNSET_AT.value + 1 }),
        ),
      }),
    ).toMatch(/boundary is the Instrument's exact sunset instant/);
    expect(
      verified(s, {
        facts: edit(
          objectKey,
          (f) => (f.value.dependencies[0].produces = ["gip/instrument/other"]),
        ),
      }),
    ).toMatch(/exactly the object derived from its committed Instrument/);
    expect(
      verified(s, { facts: edit(objectKey, (f) => (f.value.owning_ref.owner = "production")) }),
    ).toMatch(/no stage, close or operation/);
    expect(
      verified(s, { facts: edit(objectKey, (f) => (f.value.owning_ref.process_id = "p-x")) }),
    ).toMatch(/exactly the object derived from its committed Instrument/);
  });

  it("a sunset object whose Instrument is gone, or carries no sunset, is detected", async () => {
    const s = await registered();
    expect(verified(s, { facts: drop(instrumentKey) })).toMatch(
      /names a committed Instrument that carries a sunset_condition/,
    );
    expect(
      verified(s, { facts: edit(instrumentKey, (f) => delete f.value.sunset_condition) }),
    ).toMatch(/names a committed Instrument that carries a sunset_condition/);
  });

  it("a receipt that no longer names a committed Instrument at that exact sunset is detected", async () => {
    const s = await registered();
    expect(
      verified(s, {
        facts: edit(GIP_SUNSET_ENROLLMENT_KEY, (f) => (f.value.sunset_at = OTHER_SUNSET_AT)),
      }),
    ).toMatch(/names a committed Instrument that carries exactly that sunset/);
    expect(
      verified(s, {
        facts: edit(GIP_SUNSET_ENROLLMENT_KEY, (f) => (f.value.instrument_id = "instrument-x")),
      }),
    ).toMatch(/names a committed Instrument that carries exactly that sunset/);
    expect(
      verified(s, {
        facts: edit(GIP_SUNSET_ENROLLMENT_KEY, (f) => (f.value.basis_time = { ...SUNSET_AT })),
      }),
    ).toMatch(/committed strictly before it/);
  });

  it("a sunset-bearing Instrument that was not established together with its receipt, or is no longer the active record it was, is detected", async () => {
    const s = await registered();
    const establishing = s.campaign.store.getFact(instrumentKey)!.provenance.intent_id;
    expect(
      verified(s, {
        group: (g, i) => (g && i === establishing ? { ...g, writes: [g.writes[0]!] } : g),
      }),
    ).toMatch(/with GIP's enrollment receipt when it carries a sunset/);
    expect(
      verified(s, {
        group: (g, i) =>
          g && i === establishing
            ? { ...g, writes: [g.writes[0]!, { ...g.writes[1]!, key: "gip/sunset-enrollment-2" }] }
            : g,
      }),
    ).toMatch(/with GIP's enrollment receipt when it carries a sunset/);
    expect(
      verified(s, { facts: edit(instrumentKey, (f) => (f.value.lifecycle_status = "suspended")) }),
    ).toMatch(/with GIP's enrollment receipt when it carries a sunset/);
  });

  it("a third Instrument version, or a second version of an Instrument with no sunset, is not a transition GIP implements", async () => {
    const s = await registered();
    expect(verified(s, { facts: edit(instrumentKey, (f) => (f.version = 3)) })).toMatch(
      /the only Instrument transition is the one sunset expiry/,
    );
    expect(
      verified(s, {
        facts: edit(instrumentKey, (f) => {
          f.version = 2;
          delete f.value.sunset_condition;
        }),
      }),
    ).toMatch(/the only Instrument transition is the one sunset expiry/);
  });

  it("a sunset object recorded as registered no later than the Instrument it enrolls is detected (source order)", async () => {
    const s = await registered();
    const objectIntent = s.campaign.store.getFact(objectKey)!.provenance.intent_id;
    const instrumentRev = s.campaign.store.lookupReceipt(
      s.campaign.store.getFact(instrumentKey)!.provenance.intent_id,
    )!.revision;
    expect(verified(s, { revision: (i, r) => (i === objectIntent ? instrumentRev : r) })).toMatch(
      /registered with the Temporal kernel after GIP committed the Instrument/,
    );
    expect(verified(s, {})).toBe("");
  });
});

describe("drift of an expired Instrument and its stage is detected", () => {
  it("an expired Instrument whose journaled stage group is missing, lacks its authority, or pins the wrong sources is detected", async () => {
    const s = await expired();
    const stageIntent = s.campaign.store.getFact(instrumentKey)!.provenance.intent_id;
    const withGroup = (f: (g: CommitGroup) => CommitGroup | null) => ({
      group: (g: CommitGroup | null, i: string) => (g && i === stageIntent ? f(g) : g),
    });
    expect(
      verified(
        s,
        withGroup(() => null),
      ),
    ).toMatch(/has its journaled group|stage/);
    expect(
      verified(
        s,
        withGroup((g) => ({ ...g, depends_on: g.depends_on.slice(0, 2) })),
      ),
    ).not.toBe("");
    expect(
      verified(
        s,
        withGroup((g) => ({ ...g, reads: [g.reads[1]!, g.reads[0]!] })),
      ),
    ).toMatch(/pinned exactly its committed source office and Scope Binding/);
    expect(
      verified(
        s,
        withGroup((g) => ({ ...g, reads: [] })),
      ),
    ).toMatch(/pinned exactly its committed source office and Scope Binding/);
    expect(
      verified(
        s,
        withGroup((g) => ({ ...g, writes: [{ ...g.writes[0]!, expected_version: 5 }] })),
      ),
    ).toMatch(/pinned exactly its committed source office and Scope Binding/);
  });

  it("an expired Instrument that did not come from a StageKey-identified stage under an opened transaction is detected", async () => {
    const s = await expired();
    expect(
      verified(s, {
        facts: edit(instrumentKey, (f) => (f.provenance.group_id = "some-other-group")),
      }),
    ).toMatch(/IM-02 stage/);
    expect(
      verified(s, {
        facts: edit(instrumentKey, (f) => (f.provenance.cause = "not-a-transaction")),
      }),
    ).not.toBe("");
  });

  it("an expired Instrument whose Temporal object is gone, or whose value is not exactly an expiry, is detected", async () => {
    const s = await expired();
    expect(verified(s, { facts: drop(objectKey) })).toMatch(
      /names a committed Instrument|held by a registered Temporal object|object/,
    );
    expect(
      verified(s, { facts: edit(instrumentKey, (f) => (f.value.lifecycle_status = "repealed")) }),
    ).toMatch(/exactly the sunset expiry active to expired/);
  });
});
