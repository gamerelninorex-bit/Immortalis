/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Governance Instrument Sunset (sunset slice) — legacy provenance and rule-citation conformance. Both genuine earlier
// Instrument value/citation classes (the sixteenth-slice core-only record, the twenty-first-slice core-plus-predecessor record) keep
// loading UNCHANGED, verify, save and reload byte-identically, and the campaign continues beside them with sunset-bearing Instruments
// under the current citation. Nothing is re-stamped, migrated or rewritten; the superseded citations are accepted only as the whole
// citation on the value class they governed and are never stamped on a new write.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  type CommitGroup,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
  GIP_OFFICE_RULE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  createFileCampaign,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  INSTRUMENT_B,
  INSTRUMENT_C,
  OFFICE_MAGISTRATE,
  PREDECESSOR_INSTRUMENT_REF_A,
  SCOPE_BINDING_A,
  gipPublication,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  scopeBinding,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import {
  SUNSET_AT,
  SUNSET_LATER,
  SUNSET_START,
  advanceTo,
  establishSunset,
  instrumentOf,
  sunsetCoordinator,
  sunsetInstrument,
  wireSunset,
} from "../support/gip-sunset.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const bindingKey = gipScopeBindingKey(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
const instrumentKey = (id = INSTRUMENT_A) => gipInstrumentKey(id);

const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
const openOutcome = async (dir: string) => {
  const r = await CanonicalCampaign.open(dir);
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code === "CANON_INTEGRITY"
    ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
    : r.error.code;
};

/** Independent v1 writer with NO admission: a consistent historical save of an earlier build. */
async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
  const dir = tempDir();
  const s = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: CANONICAL_OWNER_REGISTRY,
      legacyFormat: true,
    }),
  );
  await build(s);
  await s.close();
  return dir;
}
const put = (
  n: number,
  key: string,
  value: unknown,
  rule: unknown,
  groupOver: any = {},
  over: any = {},
) =>
  group(
    FIXTURE_CAMPAIGN,
    n,
    [write(key, value as never, { owner: "gip", facet: "gip_institution_identity", ...over })],
    { owner: "gip", facet: "gip_institution_identity", rule, ...groupOver },
  );
const instrumentPin = {
  reads: [
    { key: magistrateKey, version: 1 },
    { key: bindingKey, version: 1 },
  ],
  depends_on: ["group-2", "group-3"],
};
/** identity (group-1), office (group-2), binding (group-3) */
const lawful = async (s: CampaignStore) => {
  await must(s.commit(put(1, courtKey, institutionIdentity(), GIP_RULE)));
  await must(
    s.commit(
      put(2, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {
        reads: [{ key: courtKey, version: 1 }],
        depends_on: ["group-1"],
      }),
    ),
  );
  await must(
    s.commit(
      put(3, bindingKey, scopeBinding(), GIP_SCOPE_BINDING_RULE, {
        reads: [{ key: magistrateKey, version: 1 }],
        depends_on: ["group-2"],
      }),
    ),
  );
};
const instrument = (n: number, value: unknown, rule: unknown, key = instrumentKey()) =>
  put(n, key, value, rule, instrumentPin);

/** Both genuine historical classes, side by side: the sixteenth-slice core-only record and the twenty-first-slice predecessor record. */
const bothHistorical = () =>
  rogue(async (s) => {
    await lawful(s);
    await must(
      s.commit(
        instrument(4, governanceInstrument(INSTRUMENT_A), GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE),
      ),
    );
    await must(
      s.commit(
        instrument(
          5,
          governanceInstrumentWithPredecessor(INSTRUMENT_B, PREDECESSOR_INSTRUMENT_REF_A),
          GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
          instrumentKey(INSTRUMENT_B),
        ),
      ),
    );
  });

describe("both genuine historical Instrument classes load, verify and reload unchanged", () => {
  it("v1 sixteenth-slice core-only and twenty-first-slice core-plus-predecessor records keep their state bytes, citations, values and versions", async () => {
    const dir = await bothHistorical();
    const before = readFileSync(join(dir, stateFile(dir)), "utf8");
    expect(JSON.parse(before).facts.length).toBeGreaterThan(0);
    const journalBefore = readFileSync(join(dir, "journal.jsonl"));
    expect(await openOutcome(dir)).toBe("OK");
    expect(readFileSync(join(dir, stateFile(dir)), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journalBefore);

    const c = await must(CanonicalCampaign.open(dir));
    expect(c.verify()).toEqual([]);
    expect(verifyGipIntegrity(c.store)).toEqual([]);
    const a = structuredClone(c.store.getFact(instrumentKey(INSTRUMENT_A))!);
    const b = structuredClone(c.store.getFact(instrumentKey(INSTRUMENT_B))!);
    expect(a.provenance.rule).toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    expect(b.provenance.rule).toEqual(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE);
    expect([a.version, b.version]).toEqual([1, 1]);
    expect(a.value).toEqual(governanceInstrument(INSTRUMENT_A));
    expect(b.value).toEqual(
      governanceInstrumentWithPredecessor(INSTRUMENT_B, PREDECESSOR_INSTRUMENT_REF_A),
    );
    const gip = new GipAdapter(c.store);
    expect(gip.governanceInstrument(INSTRUMENT_A)?.value.lifecycle_status).toBe("active");
    expect(gip.governanceInstrument(INSTRUMENT_B)?.value.predecessor_instrument_ref).toBe(
      PREDECESSOR_INSTRUMENT_REF_A,
    );
    await c.close();

    const again = await must(CanonicalCampaign.open(dir));
    expect(again.store.getFact(instrumentKey(INSTRUMENT_A))).toEqual(a);
    expect(again.store.getFact(instrumentKey(INSTRUMENT_B))).toEqual(b);
    await again.close();
  });

  it("the campaign continues beside both: a sunset-bearing Instrument is enrolled and expires under the current citation, and the historical records are untouched however far time moves", async () => {
    const dir = await bothHistorical();
    const c = await must(CanonicalCampaign.open(dir));
    const a = structuredClone(c.store.getFact(instrumentKey(INSTRUMENT_A))!);
    const b = structuredClone(c.store.getFact(instrumentKey(INSTRUMENT_B))!);
    const coordinator = sunsetCoordinator(c.store);
    await must(
      coordinator.establishCanonicalTime({ ...temporalPublication(1), time: SUNSET_START }),
    );
    const s = { ...wireSunset(c), coordinator };
    await establishSunset(s, 10, sunsetInstrument(INSTRUMENT_C));
    expect(c.store.getFact(instrumentKey(INSTRUMENT_C))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE,
    );
    await must(coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));

    const expired = instrumentOf(s, INSTRUMENT_C)!;
    expect((expired.value as GovernanceInstrument).lifecycle_status).toBe("expired");
    expect(expired.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    // the historical facts: byte-identical, same citation, same version - never re-stamped, never touched
    expect(c.store.getFact(instrumentKey(INSTRUMENT_A))).toEqual(a);
    expect(c.store.getFact(instrumentKey(INSTRUMENT_B))).toEqual(b);
    expect(c.verify()).toEqual([]);
    await c.close();

    // the mixed-provenance campaign reloads and verifies
    const mixed = await must(CanonicalCampaign.open(dir));
    expect(mixed.verify()).toEqual([]);
    expect(mixed.store.getFact(instrumentKey(INSTRUMENT_A))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
    );
    expect(mixed.store.getFact(instrumentKey(INSTRUMENT_B))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
    );
    expect(mixed.store.getFact(instrumentKey(INSTRUMENT_C))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE,
    );
    await mixed.close();
  });

  it("an Instrument of either historical class is never expired: it carries no sunset_condition, so nothing is enrolled and no stage can run for it", async () => {
    const dir = await bothHistorical();
    const c = await must(CanonicalCampaign.open(dir));
    const coordinator = sunsetCoordinator(c.store);
    await must(
      coordinator.establishCanonicalTime({ ...temporalPublication(1), time: SUNSET_START }),
    );
    const head = c.store.head();
    await must(coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(c.store.getFact(instrumentKey(INSTRUMENT_A))!.version).toBe(1);
    expect(c.store.getFact(instrumentKey(INSTRUMENT_B))!.version).toBe(1);
    expect(c.store.head().revision).toBe(head.revision + 1); // the transaction record only
    // a raw expiry of a historical record is refused: no sunset, so no lifecycle transition exists for it
    const fact = c.store.getFact(instrumentKey(INSTRUMENT_B))!;
    const raw = (n: number, rule: unknown): CommitGroup =>
      ({
        ...put(
          n,
          fact.key,
          { ...(fact.value as object), lifecycle_status: "expired" },
          rule,
          instrumentPin,
          {
            expected_version: 1,
          },
        ),
        campaign_id: c.store.head().campaign_id,
        authority: { ...CANON_WRITE_AUTHORITY },
      }) as CommitGroup;
    for (const rule of [GIP_INSTRUMENT_RULE, GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE])
      expect(await codeOf(c.store.commit(raw(50, rule)))).not.toBe("OK");
    expect(c.store.getFact(fact.key)!.version).toBe(1);
    await c.close();
  });
});

describe("the superseded citations are accepted only as the whole citation on the value class they governed", () => {
  it("a twenty-first-slice-citation Instrument carrying sunset_condition is rule drift: that rule never authorized the term", async () => {
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await lawful(s);
          await must(
            s.commit(
              instrument(4, sunsetInstrument(INSTRUMENT_A), GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
    // …nor does the sixteenth-slice citation, with or without a predecessor reference
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await lawful(s);
          await must(
            s.commit(
              instrument(4, sunsetInstrument(INSTRUMENT_A), GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await lawful(s);
          await must(
            s.commit(
              instrument(
                4,
                governanceInstrumentWithPredecessor(),
                GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
              ),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
  });

  it("the controls pass: each class under its own citation, and the current citation on every class, is canonical", async () => {
    for (const [value, rule] of [
      [governanceInstrument(), GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE],
      [governanceInstrumentWithPredecessor(), GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE],
      [governanceInstrument(), GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE],
      [governanceInstrument(), GIP_INSTRUMENT_RULE],
      [governanceInstrumentWithPredecessor(), GIP_INSTRUMENT_RULE],
    ] as const)
      expect(
        await openOutcome(
          await rogue(async (s) => {
            await lawful(s);
            await must(s.commit(instrument(4, value, rule)));
          }),
        ),
      ).toBe("OK");
  });

  it("the compatibility is not an escape hatch: any altered, partial or foreign twenty-first citation is rule drift, and it is accepted on no other kind", async () => {
    const h = GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE;
    for (const [name, rule] of Object.entries({
      "clause altered": { ...h, clause: h.clause.replace("not implemented", "implemented") },
      "native pin altered": { ...h, native_pin: "2026-09-25T00:00:00.000Z" },
      "artifact altered": { ...h, artifact: "https://example.invalid/other" },
      "lineage truncated": { ...h, authority_lineage: h.authority_lineage.slice(1) },
      "effective basis altered": { ...h, effective_basis: "drifted" },
      "binding citation": GIP_SCOPE_BINDING_RULE,
      "office citation": GIP_OFFICE_RULE,
      "identity citation": GIP_RULE,
    }))
      expect(
        await openOutcome(
          await rogue(async (s) => {
            await lawful(s);
            await must(s.commit(instrument(4, governanceInstrument(), rule)));
          }),
        ),
        name,
      ).toMatch(/RULE_DRIFT/);
    // the twenty-first-slice Instrument citation on an Institution Identity (another kind) is not accepted
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, courtKey, institutionIdentity(), h)));
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
  });

  it("neither superseded citation is ever stamped on a new write: the adapter and admission use the current citation only", async () => {
    const s = await (async () => {
      const dir = await bothHistorical();
      return { dir, c: await must(CanonicalCampaign.open(dir)) };
    })();
    const store = s.c.store;
    const head = store.head();
    for (const rule of [
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
      GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
    ]) {
      const g: CommitGroup = {
        ...instrument(20, governanceInstrument(INSTRUMENT_C), rule, instrumentKey(INSTRUMENT_C)),
        campaign_id: head.campaign_id,
        authority: { ...CANON_WRITE_AUTHORITY },
      } as CommitGroup;
      expect(await codeOf(store.commit(g))).toBe("REFERENCE_INVALID");
    }
    expect(store.head()).toEqual(head);
    await s.c.close();
  });

  it("a historical record can never become a sunset-bearing one: the key is create-only and a re-establishment under another term is refused", async () => {
    const dir = await bothHistorical();
    const c = await must(CanonicalCampaign.open(dir));
    const coordinator = sunsetCoordinator(c.store);
    await must(
      coordinator.establishCanonicalTime({ ...temporalPublication(1), time: SUNSET_START }),
    );
    const head = c.store.head();
    const gip = new GipAdapter(c.store);
    expect(
      await codeOf(
        gip.establishSunsetInstrument({
          ...gipPublication(30),
          instrument: sunsetInstrument(INSTRUMENT_A, SUNSET_AT),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(c.store.head()).toEqual(head);
    expect(c.store.getFact(instrumentKey(INSTRUMENT_A))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
    );
    await c.close();
  });
});
