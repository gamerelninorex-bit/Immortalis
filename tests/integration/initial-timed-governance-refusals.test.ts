/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw governance documents */
// Refusals of the initial timed governance opening. Each case independently refutes a false success claim: the status is a refusal, the
// console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and journal hashes) is exactly
// what it was — no owner write of any kind, in particular no half-built chain, no invented expiry, no phantom registration and no
// Temporal object.
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TEMPORAL_BOUNDARY_INDEX_KEY } from "@immortalis/contracts";
import {
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  CanonicalCampaign,
} from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { at, gipPublication as publicationFor, temporalPublication } from "@immortalis/testkit";
import {
  BINDING_ID,
  INSTITUTION_ID,
  LOCALITY_CAMPAIGN,
  OFFICE_ID,
  T_OPEN,
  T_SUNSET,
  addGovernance,
  bindPlayer,
  freshDirs,
  governanceDoc,
  headOf,
  held,
  institutionDoc,
  instrumentDoc,
  localityCampaign,
  openOrdinary,
  timedCampaign,
  writeGovernance,
} from "../support/initial-timed-governance.ts";

const without = (path: string[]) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  delete o[path.at(-1)!];
};
const set = (path: string[], value: unknown) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path.at(-1)!] = value;
};

const NOTHING = {
  institution: false,
  office: false,
  scope_binding: false,
  instrument: false,
  registered: false,
  violations: [],
};

const invalid: [string, (d: any) => void][] = [
  // the envelope of the document
  ["no format", without(["format"])],
  ["another format", set(["format"], "immortalis-initial-population")],
  ["another format version", set(["format_version"], 2)],
  ["no publication (basis and secrecy are never defaulted)", without(["publication"])],
  ["no basis", without(["publication", "basis"])],
  ["no secrecy", without(["publication", "secrecy"])],
  ["an empty basis", set(["publication", "basis"], "")],
  ["a basis with surrounding whitespace", set(["publication", "basis"], " x")],
  ["a publication extra field", set(["publication", "owner"], "gip")],
  ["no canonical time (the opening time is never defaulted)", without(["canonical_time"])],
  ["a canonical time without its unit", without(["canonical_time", "unit"])],
  ["a negative canonical time", set(["canonical_time", "value"], -1)],
  ["a non-integer canonical time", set(["canonical_time", "value"], 100.5)],
  ["no institution section", without(["institution"])],
  ["no office section", without(["office"])],
  ["no scope binding section", without(["scope_binding"])],
  ["no instrument section", without(["instrument"])],
  ["a top-level extra field", set(["receipt"], {})],
  ["an owner claimed at the top level", set(["owner"], "gip")],
  ["a confirmed claim", set(["confirmed"], true)],
  ["an expiry claimed at the top level", set(["expired"], true)],
  ["a Temporal object claimed at the top level", set(["temporal_object"], {})],
  // the institution: exactly InstitutionIdentity
  ["no institution id", without(["institution", "institution_id"])],
  ["an institution id that is a key path", set(["institution", "institution_id"], "inst/1")],
  ["no label", without(["institution", "identity_label"])],
  ["an empty label", set(["institution", "identity_label"], "")],
  ["a transition continuity status", set(["institution", "continuity_status"], "renamed")],
  ["no continuity status", without(["institution", "continuity_status"])],
  [
    "a null constitutive source (omit it, never null)",
    set(["institution", "constitutive_source_ref"], null),
  ],
  ["a successor field", set(["institution", "successor_ids"], ["x"])],
  ["a predecessor field", set(["institution", "predecessor_ids"], ["x"])],
  ["an institution extra field", set(["institution", "members"], ["x"])],
  // the office: exactly OfficeAuthorityLocus
  ["no office id", without(["office", "office_id"])],
  [
    "an office of another institution (no join)",
    set(["office", "institution_id"], "institution-other"),
  ],
  ["no authority source", without(["office", "authority_source_ref"])],
  ["no competence scope", without(["office", "competence_scope"])],
  ["no powers array", without(["office", "powers"])],
  ["powers that are not text", set(["office", "powers"], [{ power: "x" }])],
  ["no duties array", without(["office", "duties"])],
  ["no selection rule", without(["office", "selection_rule"])],
  ["no succession rule", without(["office", "succession_rule"])],
  ["no removal rule", without(["office", "removal_rule"])],
  ["a structured removal rule", set(["office", "removal_rule"], { by: "moot" })],
  ["neither a holder nor a decision body", without(["office", "holder_ref"])],
  [
    "both a holder and a decision body",
    set(["office", "decision_body_ref"], "decision-body-ref-moot-table"),
  ],
  ["a null holder", set(["office", "holder_ref"], null)],
  ["an empty holder", set(["office", "holder_ref"], "")],
  ["a delegation list", set(["office", "delegations"], [])],
  ["a discriminator field", set(["office", "kind"], "holder")],
  // the Scope Binding: exactly ScopeBinding
  ["no binding id", without(["scope_binding", "scope_binding_id"])],
  ["a binding of another office", set(["scope_binding", "office_id"], "office-other")],
  [
    "a binding of another institution",
    set(["scope_binding", "institution_id"], "institution-other"),
  ],
  ["no scope type", without(["scope_binding", "scope_type"])],
  ["no scope reference", without(["scope_binding", "scope_ref"])],
  ["no target condition", without(["scope_binding", "target_condition"])],
  ["a null inheritance rule", set(["scope_binding", "inheritance_rule"], null)],
  ["exception references that are not an array", set(["scope_binding", "exception_refs"], "x")],
  ["a binding extra field", set(["scope_binding", "holder_ref"], "x")],
  // the Instrument: exactly GovernanceInstrument, and this path's bounded family
  ["no instrument id", without(["instrument", "instrument_id"])],
  [
    "an Instrument that carries no sunset (this path opens a timed one)",
    without(["instrument", "sunset_condition"]),
  ],
  [
    "a sunset equal to the canonical time (not in the future)",
    set(["instrument", "sunset_condition"], { ...T_OPEN }),
  ],
  ["a sunset before the canonical time", set(["instrument", "sunset_condition"], at(50))],
  [
    "a sunset in another unit",
    set(["instrument", "sunset_condition"], { unit: "other-unit", value: 500 }),
  ],
  [
    "a sunset that is a date string",
    set(["instrument", "sunset_condition"], "2026-12-01T00:00:00Z"),
  ],
  [
    "a sunset that is a duration",
    set(["instrument", "sunset_condition"], { amount: 5, unit: "day" }),
  ],
  [
    "a sunset with a fractional value",
    set(["instrument", "sunset_condition"], { ...T_SUNSET, value: 200.5 }),
  ],
  ["a null sunset", set(["instrument", "sunset_condition"], null)],
  [
    "an expired lifecycle (the downstream result may not be asserted)",
    set(["instrument", "lifecycle_status"], "expired"),
  ],
  ["a pending lifecycle", set(["instrument", "lifecycle_status"], "pending")],
  ["a suspended lifecycle", set(["instrument", "lifecycle_status"], "suspended")],
  ["no lifecycle", without(["instrument", "lifecycle_status"])],
  [
    "a source authority that is another office",
    set(
      ["instrument", "source_authority_ref"],
      `gip/institution/${INSTITUTION_ID}/office/office-other`,
    ),
  ],
  [
    "a source authority that is not an office address",
    set(["instrument", "source_authority_ref"], "office-pan-warden"),
  ],
  [
    "a Scope Binding of another binding",
    set(
      ["instrument", "scope_binding_ref"],
      `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}/scope-binding/other`,
    ),
  ],
  [
    "a Scope Binding of another office",
    set(
      ["instrument", "scope_binding_ref"],
      `gip/institution/${INSTITUTION_ID}/office/office-other/scope-binding/${BINDING_ID}`,
    ),
  ],
  ["no authority basis", without(["instrument", "authority_basis_ref"])],
  ["an operative effect that is an array", set(["instrument", "operative_effect"], ["obligation"])],
  ["an unknown operative effect", set(["instrument", "operative_effect"], "decree")],
  ["no validity array", without(["instrument", "validity_by_order"])],
  [
    "a validity status outside the five literals",
    set(["instrument", "validity_by_order", "0", "validity_status"], "lawful"),
  ],
  ["a validity entry extra field", set(["instrument", "validity_by_order", "0", "reason"], "x")],
  ["a null predecessor", set(["instrument", "predecessor_instrument_ref"], null)],
  ["a clause list", set(["instrument", "clauses"], [])],
  ["a renewal rule", set(["instrument", "renewal_rule"], "x")],
  ["an expires_at field", set(["instrument", "expires_at"], { ...T_SUNSET })],
  ["a due flag", set(["instrument", "due"], true)],
  ["an institution id on the Instrument", set(["instrument", "institution_id"], INSTITUTION_ID)],
  // the console is never reachable by a control sequence
  [
    "a label with a line break",
    set(["institution", "identity_label"], "a\nSTATUS GOVERNANCE_READY"),
  ],
  ["a rule with an escape sequence", set(["office", "removal_rule"], "x\u001b[2J")],
  ["a rule with a C1 control (CSI)", set(["office", "succession_rule"], "x\u009b2J")],
  ["a rule with a line separator", set(["scope_binding", "target_condition"], "x y")],
  [
    "an identifier with a control character",
    set(["instrument", "authority_basis_ref"], "basis\u0007"),
  ],
];

describe("an unauthored, over-claiming or ineligible proposal is refused before the console is asked", () => {
  for (const [name, mutate] of invalid)
    it(name, async () => {
      const dirs = await timedCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = governanceDoc();
      mutate(doc);
      const { result, terminal } = await addGovernance(dirs, writeGovernance(doc), []);
      expect(result.status, JSON.stringify(result.details)).toBe("INVALID_GOVERNANCE");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
      expect(await held(dirs.campaignDir)).toEqual(NOTHING);
    });

  it("a file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"institutions"']) {
      const { result, terminal } = await addGovernance(dirs, writeGovernance(text), []);
      expect(result.status, text).toBe("INVALID_GOVERNANCE");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a bare Instrument (no chain, no envelope) is not a governance opening", async () => {
    const dirs = await timedCampaign();
    const { result } = await addGovernance(dirs, writeGovernance(instrumentDoc()), []);
    expect(result.status).toBe("INVALID_GOVERNANCE");
  });
});

describe("an untrusted, unreadable, oversized or changed file is refused", () => {
  it("a file others can write, a link, a directory, a missing file", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writeGovernance(governanceDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addGovernance(dirs, writable, [])).result.status).toBe(
      "GOVERNANCE_FILE_UNTRUSTED",
    );

    const real = writeGovernance(governanceDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect((await addGovernance(dirs, link, [])).result.status).toBe("GOVERNANCE_FILE_UNREADABLE");

    expect((await addGovernance(dirs, dirname(real), [])).result.status).toBe(
      "GOVERNANCE_FILE_UNTRUSTED",
    );

    const gone = writeGovernance(governanceDoc());
    rmSync(gone);
    expect((await addGovernance(dirs, gone, [])).result.status).toBe("GOVERNANCE_FILE_UNREADABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file larger than an opening can be", async () => {
    const dirs = await timedCampaign();
    const doc = governanceDoc();
    doc.office.powers = Array.from({ length: 4000 }, (_, i) => `Power number ${i} of the warden.`);
    const { result } = await addGovernance(dirs, writeGovernance(doc), []);
    expect(result.status).toBe("INVALID_GOVERNANCE");
  });

  it("a file changed after it was read cannot change what was confirmed: the shown proposal is the committed proposal", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    const tampered = governanceDoc();
    tampered.institution.institution_id = "institution-tampered";
    const { result } = await addGovernance(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("GOVERNANCE_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      const gip = new GipAdapter(campaign.store);
      expect(gip.institutionIdentity(INSTITUTION_ID)).toBeDefined();
      expect(gip.institutionIdentity("institution-tampered")).toBeUndefined();
    } finally {
      await campaign.close();
    }
  });
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()), [], {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a campaign holding nothing is not an established locality (even with a canonical time)", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "initial-timed-governance-test",
    });
    if (!created.ok) throw new Error("create");
    const t = await new TemporalCoordinator(
      created.value.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({ ...temporalPublication(1), time: T_OPEN });
    expect(t.ok).toBe(true);
    await created.value.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("the canonical time the opening is established at must exist and be the campaign's", () => {
  it("a campaign that holds no canonical time is refused as a missing prerequisite — never as a success, and no time is created", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("TIME_NOT_ESTABLISHED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.store.getFact("temporal/state")).toBeUndefined();
    expect(c.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)).toBeUndefined();
    await c.close();
  });

  it.each([
    ["an earlier time", (d: any) => (d.canonical_time = { unit: T_OPEN.unit, value: 99 })],
    ["a later time", (d: any) => (d.canonical_time = { unit: T_OPEN.unit, value: 101 })],
    [
      "a time in another unit",
      (d: any) => {
        // internally consistent in another unit, so only the campaign's own time can refuse it
        d.canonical_time = { unit: "other-unit", value: 100 };
        d.instrument.sunset_condition = { unit: "other-unit", value: 200 };
      },
    ],
    ["the zero time", (d: any) => (d.canonical_time = { unit: T_OPEN.unit, value: 0 })],
  ])(
    "%s is not the campaign's canonical time: refused before the console is asked",
    async (_n, mutate) => {
      const dirs = await timedCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = governanceDoc();
      mutate(doc);
      const { result, terminal } = await addGovernance(dirs, writeGovernance(doc), []);
      expect(result.status).toBe("TIME_MISMATCH");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );

  it("a canonical time that has since moved on makes a stale proposal unadmissible: refused, nothing written", async () => {
    const dirs = await timedCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const moved = await new TemporalCoordinator(c.store, new StageProviderRegistry()).advance({
      transaction_id: "tx-move",
      cause: "cause-tx-move",
      trigger: { kind: "player-ooc-advance-choice", ref: "choice-tx-move" },
      continues: null,
      requested: { target: at(150), condition: null },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("TIME_MISMATCH");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("governance state that already exists, or identities that collide, are never built beside or replaced", () => {
  /** Someone else establishes GIP state through the owner's own operations. */
  async function elsewhere(
    dirs: Awaited<ReturnType<typeof timedCampaign>>,
    run: (gip: GipAdapter) => Promise<unknown>,
  ) {
    const c = await openOrdinary(dirs.campaignDir);
    try {
      await run(new GipAdapter(c.store));
    } finally {
      await c.close();
    }
  }

  it("an unrelated institution already held closes this path: one initial opening per campaign", async () => {
    const dirs = await timedCampaign();
    await elsewhere(dirs, async (gip) => {
      const r = await gip.establishInstitution({
        ...publicationFor(1),
        institution: institutionDoc({ institution_id: "institution-other" }),
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    });
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the same institution id held with different content is a conflict: it is neither adopted nor replaced", async () => {
    const dirs = await timedCampaign();
    await elsewhere(dirs, async (gip) => {
      const r = await gip.establishInstitution({
        ...publicationFor(1),
        institution: institutionDoc({ identity_label: "A different assembly with the same id" }),
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    });
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const c = await openOrdinary(dirs.campaignDir);
    expect(
      (c.store.getFact(`gip/institution/${INSTITUTION_ID}/identity`)!.value as any).identity_label,
    ).toBe("A different assembly with the same id");
    await c.close();
  });

  it("the identical institution held by another writer is not adopted either: this identity's own stage group is absent", async () => {
    const dirs = await timedCampaign();
    await elsewhere(dirs, async (gip) => {
      const r = await gip.establishInstitution({
        ...publicationFor(1),
        institution: institutionDoc(),
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    });
    const head = await headOf(dirs.campaignDir);
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the same Instrument id held already (with its chain) is a conflict", async () => {
    const dirs = await timedCampaign();
    await elsewhere(dirs, async (gip) => {
      const doc = governanceDoc();
      for (const [name, run] of [
        [
          "i",
          () => gip.establishInstitution({ ...publicationFor(1), institution: doc.institution }),
        ],
        ["o", () => gip.establishOffice({ ...publicationFor(2), office: doc.office })],
        [
          "b",
          () =>
            gip.establishScopeBinding({ ...publicationFor(3), scope_binding: doc.scope_binding }),
        ],
        [
          "n",
          () =>
            gip.establishSunsetInstrument({
              ...publicationFor(4),
              instrument: { ...doc.instrument, validity_by_order: [] },
            }),
        ],
      ] as const) {
        const r = (await run()) as { ok: boolean };
        expect(r.ok, name).toBe(true);
      }
    });
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("GOVERNANCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  const altered: [string, (d: any) => void][] = [
    ["an altered institution label", set(["institution", "identity_label"], "Another label")],
    ["an altered office rule", set(["office", "removal_rule"], "Removable by the county.")],
    [
      "a holder swapped for a decision body",
      (d) => {
        delete d.office.holder_ref;
        d.office.decision_body_ref = "decision-body-ref-other";
      },
    ],
    [
      "an altered binding condition",
      set(["scope_binding", "target_condition"], "Applies to every household."),
    ],
    ["an altered operative effect", set(["instrument", "operative_effect"], "obligation")],
    [
      "an altered validity entry",
      set(["instrument", "validity_by_order", "0", "validity_status"], "void"),
    ],
    ["a later sunset", set(["instrument", "sunset_condition"], at(250))],
    ["other publication labels", set(["publication", "secrecy"], "operator-session-public")],
  ];
  for (const [name, mutate] of altered)
    it(`${name} under the same targets, after the original committed, is refused and replaces nothing`, async () => {
      const dirs = await timedCampaign();
      expect((await addGovernance(dirs, writeGovernance(governanceDoc()))).result.status).toBe(
        "GOVERNANCE_READY",
      );
      const head = await headOf(dirs.campaignDir);
      const doc = governanceDoc();
      mutate(doc);
      const { result, terminal } = await addGovernance(dirs, writeGovernance(doc), []);
      expect(result.status).toBe("GOVERNANCE_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });
});

describe("the operator's confirmation is required and exact", () => {
  it.each([
    ["decline", "decline" as const],
    ["end of input", "eof" as const],
    ["a stale (previous prompt's) phrase", "stale" as const],
    [
      "another verb's phrase",
      (c: string) => c.replace("establish-timed-governance", "establish-population"),
    ],
    [
      "the locality verb's phrase",
      (c: string) => c.replace("establish-timed-governance", "establish-locality"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await held(dirs.campaignDir)).toEqual(NOTHING);
  });
});

describe("the owner path is proved before anything is written", () => {
  it("a later owner refusal found by the scratch check leaves the campaign untouched and the console unasked", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const spy = vi.spyOn(GipAdapter.prototype, "establishScopeBinding").mockResolvedValue({
      ok: false,
      error: { code: "VALUE_INVALID", message: "refused" },
    } as any);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    spy.mockRestore();
    expect(result.status).toBe("INVALID_GOVERNANCE");
    expect(result.details.join("\n")).toContain("scope_binding: VALUE_INVALID");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await held(dirs.campaignDir)).toEqual(NOTHING);
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await timedCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a bound player character closes the path even for an identical replay of a committed opening", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addGovernance(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it.each([
    ["the first source", "/source/"],
    ["the first locus", "/locus/"],
    ["the world", "/profile"],
  ])(
    "%s advanced by a later owner write closes the path: refused with nothing written",
    async (_name, part) => {
      const dirs = await timedCampaign();
      const head = await headOf(dirs.campaignDir);
      const open = LocalOperatorSession.open;
      vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
        const opened = await open.call(LocalOperatorSession, p);
        if (opened.ok) {
          const store = opened.value.campaign.store;
          const advance = (f: any) => (f && f.key.includes(part) ? { ...f, version: 2 } : f);
          const getFact = store.getFact.bind(store);
          vi.spyOn(store, "getFact").mockImplementation((key: string) => advance(getFact(key)));
          const listFacts = store.listFacts.bind(store);
          vi.spyOn(store, "listFacts").mockImplementation(() => listFacts().map(advance));
        }
        return opened;
      });
      const { result, terminal } = await addGovernance(dirs, writeGovernance(governanceDoc()), []);
      vi.restoreAllMocks();
      expect(result.status).toBe("PRE_PLAY_CLOSED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );

  it("a committed record advanced by a later owner write makes an identical rerun PRE_PLAY_CLOSED, never READY or a conflict", async () => {
    const dirs = await timedCampaign();
    const file = writeGovernance(governanceDoc());
    expect((await addGovernance(dirs, file)).result.status).toBe("GOVERNANCE_READY");
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const advance = (f: any) =>
          f && f.key.startsWith("gip/instrument/") ? { ...f, version: 2 } : f;
        const getFact = store.getFact.bind(store);
        vi.spyOn(store, "getFact").mockImplementation((key: string) => advance(getFact(key)));
        const listFacts = store.listFacts.bind(store);
        vi.spyOn(store, "listFacts").mockImplementation(() => listFacts().map(advance));
      }
      return opened;
    });
    const { result, terminal } = await addGovernance(dirs, file, []);
    vi.restoreAllMocks();
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});
