// Unit evidence for the PC capability derivations, the object registration rule and the one owner operation (twenty-eighth
// slice). Each derivation is the single statement of its rule: owner operation, IM-11 admission and load-time verification
// all use it. Register lineage: IA-02/IA-03/IA-14 (partial); RC-02/03/04; IM-02, IM-07.
import { describe, expect, it } from "vitest";
import {
  PC_CAPABILITY_CLOSE,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  derivePcCapability,
  isPcCapabilityKey,
  pcCapabilityBoundaryViolation,
  pcCapabilityCloseProvider,
  pcCapabilityCloseRead,
  pcCapabilityDeclaration,
  pcCapabilityEstablishmentViolation,
  pcCapabilityObjectViolation,
  pcCapabilityOfKey,
  pcClaimAt,
} from "@immortalis/engine";
import {
  CAP_SAILING,
  FIXTURE_PC_ID,
  pcCapabilityBasis,
  pcCapabilityConsumerObject,
  pcCapabilityContract,
  pcCloseConsumerDeclaration,
  pcNowConsumerDeclaration,
} from "@immortalis/testkit";

const P = FIXTURE_PC_ID;
const C = CAP_SAILING;
const basis = (over = {}) => pcCapabilityBasis(P, C, over);
const factOf = (key: string, value: unknown, over: Partial<OwnerFact> = {}): OwnerFact => ({
  key,
  owner: "pc_existence",
  facet: "pc_capability_profile",
  value: value as never,
  unit: null,
  basis: "b",
  secrecy: "s",
  version: 1,
  provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} as never },
  ...over,
});
const basisFact = (b = basis(), over: Partial<OwnerFact> = {}) =>
  factOf(pcCapabilityBasisKey(b.pc_id, b.capability_id), b, over);
const contractFact = (over: Partial<OwnerFact> = {}) =>
  factOf(pcExistenceContractKey(P), pcCapabilityContract(), {
    facet: "existence_contract",
    ...over,
  });
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));

describe("derivePcCapability: exactly what the basis determines", () => {
  const asFact = (b = basis(), over = {}) => ({
    key: pcCapabilityBasisKey(b.pc_id, b.capability_id),
    owner: "pc_existence",
    version: 1,
    value: b,
    ...over,
  });

  it("transcribes the received marker, pins the basis, names the PC Capability Close — and adds no other state", () => {
    const d = derivePcCapability(asFact());
    expect(d.ok && d.value).toEqual({
      pc_id: P,
      capability_id: C,
      marker: "C",
      basis: { fact_key: pcCapabilityBasisKey(P, C), version: 1 },
      close: { name: "PC Capability Close", stage: pcCapabilityStage(P, C) },
    });
    expect(PC_CAPABILITY_CLOSE).toBe("PC Capability Close");
  });

  it("carries every marker form unchanged: each grade, EX with its descriptor, and ungraded — no conversion", () => {
    for (const marker of [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ] as const) {
      const d = derivePcCapability(asFact(basis({ marker })));
      expect(d.ok && d.value.marker).toEqual(marker);
    }
  });

  it("is deterministic: identical input, identical output; no clock, randomness or counter participates", () => {
    expect(derivePcCapability(asFact())).toEqual(derivePcCapability(asFact()));
  });

  it("refuses a basis that is not the one PC owner's own, or not at the key derived from its identities", () => {
    expect(derivePcCapability(asFact(basis(), { owner: "named_actor" })).ok).toBe(false);
    expect(derivePcCapability(asFact(basis(), { owner: "world_state" })).ok).toBe(false);
    expect(derivePcCapability(asFact(basis(), { key: pcCapabilityBasisKey(P, "other") })).ok).toBe(
      false,
    );
    expect(derivePcCapability(asFact(basis(), { key: pcCapabilityBasisKey("pc-x", C) })).ok).toBe(
      false,
    );
  });
});

describe("pcClaimAt: only accepted claims of a released Existence Contract can be located", () => {
  const contract = pcCapabilityContract();
  it("locates every claim-bearing place and nothing else", () => {
    expect(pcClaimAt(contract, { section: "identity_agency", index: 0 })).toBe(
      contract.identity_agency,
    );
    expect(pcClaimAt(contract, { section: "embodiment_topology", index: 0 })).toBe(
      contract.embodiment_topology,
    );
    expect(pcClaimAt(contract, { section: "continuity_rule", index: 0 })).toBe(
      contract.continuity_rule,
    );
    expect(pcClaimAt(contract, { section: "contact", index: 0 })).toBeDefined();
    expect(pcClaimAt(contract, { section: "baseline_exception.safely_inherited", index: 0 })).toBe(
      contract.baseline_exception.safely_inherited[0],
    );
    expect(pcClaimAt(contract, { section: "baseline_exception.player_overrides", index: 1 })).toBe(
      contract.baseline_exception.player_overrides[1],
    );
    expect(pcClaimAt(contract, { section: "entry_envelope", index: 0 })).toBe(
      contract.entry_envelope.items[0],
    );
  });

  it("a single-claim section has only index 0; a list has its length; a hypothesis or unresolved item has no locator", () => {
    expect(pcClaimAt(contract, { section: "identity_agency", index: 1 })).toBeUndefined();
    expect(pcClaimAt(contract, { section: "contact", index: 1 })).toBeUndefined();
    expect(
      pcClaimAt(contract, { section: "baseline_exception.player_overrides", index: 2 }),
    ).toBeUndefined();
    expect(pcClaimAt(contract, { section: "entry_envelope", index: 1 })).toBeUndefined();
    // the NO_CONTACT statement is the contact section's one claim
    const noContact = pcCapabilityContract(P, {
      contact: {
        kind: "NO_CONTACT",
        statement: { statement: "SYNTHETIC FIXTURE: no contact.", provenance: "PLAYER-AUTHORED" },
      },
    });
    expect(pcClaimAt(noContact, { section: "contact", index: 0 })).toBe(
      (noContact.contact as { statement: unknown }).statement,
    );
    expect(pcClaimAt(noContact, { section: "contact", index: 1 })).toBeUndefined();
  });
});

describe("pcCapabilityEstablishmentViolation: this PC's own accepted generation history, pinned", () => {
  it("is lawful for the committed released contract of this PC at the pinned version, citing accepted claims", () => {
    expect(pcCapabilityEstablishmentViolation(basis(), facts(contractFact()))).toBeNull();
  });

  it("refuses an absent contract, a contract of another owner, a contract of another PC, a wrong pin or a missing claim", () => {
    expect(pcCapabilityEstablishmentViolation(basis(), facts())).toMatch(/not committed/);
    expect(
      pcCapabilityEstablishmentViolation(basis(), facts(contractFact({ owner: "world_state" }))),
    ).toMatch(/not committed by the PC owner/);
    expect(
      pcCapabilityEstablishmentViolation(
        basis({
          establishment: {
            ...basis().establishment,
            contract: { fact_key: pcExistenceContractKey("pc-x"), version: 1 },
          },
        }),
        facts(contractFact()),
      ),
    ).toMatch(/own Existence Contract/);
    expect(
      pcCapabilityEstablishmentViolation(basis(), facts(contractFact({ version: 2 }))),
    ).toMatch(/exact version/);
    expect(
      pcCapabilityEstablishmentViolation(
        basis(),
        facts(contractFact({ value: pcCapabilityContract("pc-x") as never })),
      ),
    ).toMatch(/of this PC/);
    expect(
      pcCapabilityEstablishmentViolation(
        basis(),
        facts(contractFact({ value: { not: "a contract" } as never })),
      ),
    ).toMatch(/released Existence Contract/);
    expect(
      pcCapabilityEstablishmentViolation(
        basis({
          establishment: {
            ...basis().establishment,
            claims: [{ section: "entry_envelope", index: 4 }],
          },
        }),
        facts(contractFact()),
      ),
    ).toMatch(/not an accepted claim/);
  });

  it("reads one fact by identity", () => {
    const asked: string[] = [];
    pcCapabilityEstablishmentViolation(basis(), {
      get: (k: string) => (asked.push(k), contractFact()),
    });
    expect(asked).toEqual([pcExistenceContractKey(P)]);
  });
});

describe("pcCapabilityBoundaryViolation: one owner per capability, never an aggregate", () => {
  const has = (...keys: string[]) => ({ has: (k: string) => keys.includes(k) });
  it("a free PC capability is lawful", () => {
    expect(pcCapabilityBoundaryViolation(has(), P, C)).toBeNull();
  });
  it("a capability the Named-Actor owner already holds — basis or persisted — is refused: no duplicate owner", () => {
    expect(pcCapabilityBoundaryViolation(has(actorCapabilityBasisKey(P, C)), P, C)).toMatch(
      /Named-Actor owner/,
    );
    expect(pcCapabilityBoundaryViolation(has(actorCapabilityKey(P, C)), P, C)).toMatch(
      /Named-Actor owner/,
    );
    // another capability of the same identity is not this capability
    expect(pcCapabilityBoundaryViolation(has(actorCapabilityKey(P, "other")), P, C)).toBeNull();
  });
  it("a Population ledger's identity is an aggregate: it never receives an individual mastery record", () => {
    expect(pcCapabilityBoundaryViolation(has(populationLedgerKey(P)), P, C)).toMatch(
      /Population ledger/,
    );
  });
  it("is by identity only: it asks three keys and scans nothing", () => {
    const asked: string[] = [];
    pcCapabilityBoundaryViolation({ has: (k: string) => (asked.push(k), false) }, P, C);
    expect(asked.sort()).toEqual(
      [actorCapabilityBasisKey(P, C), actorCapabilityKey(P, C), populationLedgerKey(P)].sort(),
    );
  });
});

describe("the declaration and the registration rule: a PC capability is read only at its close", () => {
  const objectOf = (over: Partial<TemporalObject> = {}) =>
    pcCapabilityConsumerObject("c1", basis(), over);
  const bf = () => facts(basisFact());

  it("the close stage reads exactly its received basis NOW and produces exactly one capability, declaring the PC Capability Close", () => {
    const d = pcCapabilityDeclaration(basis());
    expect(d.stage).toEqual(pcCapabilityStage(P, C));
    expect(d.reads).toHaveLength(1);
    expect(d.reads[0]).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "pc_existence", fact_key: pcCapabilityBasisKey(P, C) },
    });
    expect(d.produces).toEqual([pcCapabilityKey(P, C)]);
    expect(d.declares_close).toEqual({ name: "PC Capability Close" });
  });

  it("the consumer's read is AS-OF-DECLARED-CLOSE naming the PC Capability Close and the PC owner's operation", () => {
    expect(pcCapabilityCloseRead(P, C)).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "pc_existence", fact_key: pcCapabilityKey(P, C) },
      close_basis: {
        name: "PC Capability Close",
        producer: { owner: "pc_existence", operation: "pc-publish-capability-close" },
      },
    });
  });

  it("the key helpers recognise exactly the two PC capability key spaces, never the Existence Contract", () => {
    expect(isPcCapabilityKey(pcCapabilityKey(P, C))).toBe(true);
    expect(isPcCapabilityKey(pcCapabilityBasisKey(P, C))).toBe(true);
    expect(isPcCapabilityKey(pcExistenceContractKey(P))).toBe(false);
    expect(isPcCapabilityKey(actorCapabilityKey(P, C))).toBe(false);
    expect(pcCapabilityOfKey(pcCapabilityKey(P, C))).toEqual({ pcId: P, capabilityId: C });
    expect(pcCapabilityOfKey(pcCapabilityBasisKey(P, C))).toBeNull();
    expect(pcCapabilityOfKey(actorCapabilityKey(P, C))).toBeNull();
  });

  it("the derived object passes; the stage and the close read of one capability are lawful together", () => {
    expect(pcCapabilityObjectViolation(objectOf(), { facts: bf() })).toBeNull();
  });

  it("refuses a consumer that reads the capability AS-OF-NOW: a later effective time cannot bypass the close", () => {
    const o = objectOf({
      dependencies: [objectOf().dependencies[0]!, pcNowConsumerDeclaration("c1", P, C)],
    });
    expect(pcCapabilityObjectViolation(o, { facts: bf() })).toMatch(/AS-OF-DECLARED-CLOSE/);
  });

  it("refuses any cross-owner read of the uncommitted received basis", () => {
    const decl = pcCloseConsumerDeclaration("c1", P, C);
    const o = objectOf({
      dependencies: [
        objectOf().dependencies[0]!,
        {
          ...decl,
          reads: [
            {
              mode: "AS-OF-NOW",
              source: { owner: "pc_existence", fact_key: pcCapabilityBasisKey(P, C) },
              invalidators: [],
            },
          ],
        },
      ],
    });
    expect(pcCapabilityObjectViolation(o, { facts: bf() })).toMatch(/not a cross-owner read/);
  });

  it("refuses a CLOSE read that names another close, producer or invalidator shape", () => {
    const decl = pcCloseConsumerDeclaration("c1", P, C);
    const read = pcCapabilityCloseRead(P, C);
    if (read.mode !== "AS-OF-DECLARED-CLOSE") throw new Error("the PC close read is a CLOSE read");
    const variants = [
      { ...read, close_basis: { ...read.close_basis, name: "actor-profile-capability-close" } },
      { ...read, close_basis: { ...read.close_basis, name: "pc-capability-close" } },
      {
        ...read,
        close_basis: {
          ...read.close_basis,
          producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
        },
      },
      { ...read, invalidators: [] },
      { ...read, source: { ...read.source, owner: "named_actor" } },
    ];
    for (const v of variants)
      expect(
        pcCapabilityObjectViolation(
          objectOf({
            dependencies: [objectOf().dependencies[0]!, { ...decl, reads: [v as never] }],
          }),
          { facts: bf() },
        ),
        JSON.stringify(v),
      ).toMatch(/AS-OF-DECLARED-CLOSE/);
  });

  it("refuses a close declared for a basis that is not committed: a consequence cannot conjure the capability it needs", () => {
    expect(pcCapabilityObjectViolation(objectOf(), { facts: facts() })).toMatch(
      /committed received basis/,
    );
    // a fact at the basis key that is another owner's, or malformed, is no basis
    expect(
      pcCapabilityObjectViolation(objectOf(), {
        facts: facts(basisFact(basis(), { owner: "world_state" })),
      }),
    ).toMatch(/committed received basis/);
    expect(
      pcCapabilityObjectViolation(objectOf(), {
        facts: facts(basisFact(basis(), { value: { marker: "S" } as never })),
      }),
    ).toMatch(/committed received basis/);
    expect(
      pcCapabilityObjectViolation(objectOf(), {
        facts: facts(basisFact(basis(), { facet: "existence_contract" })),
      }),
    ).toMatch(/committed received basis/);
  });

  it("refuses a PC stage that is not exactly the one derived from its basis (a smuggled read, produce or close)", () => {
    const d = pcCapabilityDeclaration(basis());
    for (const smuggled of [
      { ...d, declares_close: { name: "other-close" } },
      { ...d, declares_close: null },
      { ...d, produces: [pcCapabilityKey(P, "other")] },
      { ...d, reads: [] },
      { ...d, reads: [{ ...d.reads[0]!, mode: "AS-OF-DECLARED-CLOSE" }] },
    ])
      expect(
        pcCapabilityObjectViolation(
          objectOf({ dependencies: [smuggled as never, objectOf().dependencies[1]!] }),
          { facts: bf() },
        ),
        JSON.stringify(smuggled),
      ).toMatch(/exactly the declaration derived from its received basis/);
  });

  it("refuses a second PC operation, a foreign stage that produces a PC capability key, and a PC-owned object", () => {
    const d = pcCapabilityDeclaration(basis());
    expect(
      pcCapabilityObjectViolation(
        objectOf({
          dependencies: [
            {
              ...d,
              stage: {
                ...d.stage,
                owner_operation: { owner: "pc_existence", operation: "pc-develop-capability" },
              },
            },
          ],
        }),
        { facts: bf() },
      ),
    ).toMatch(/exactly one stage/);
    const consumer = objectOf().dependencies[1]!;
    for (const key of [pcCapabilityKey(P, C), pcCapabilityBasisKey(P, "other")])
      expect(
        pcCapabilityObjectViolation(
          objectOf({ dependencies: [d, { ...consumer, produces: [key] }] }),
          { facts: bf() },
        ),
      ).toMatch(/only the PC owner's capability close stage produces/);
    expect(
      pcCapabilityObjectViolation(
        objectOf({ owning_ref: { owner: "pc_existence", process_id: "p" } }),
        { facts: bf() },
      ),
    ).toMatch(/no standalone PC capability object/);
  });

  it("an object that touches no PC capability key space is not this rule's concern — including a read of the Existence Contract", () => {
    const consumer = objectOf().dependencies[1]!;
    expect(
      pcCapabilityObjectViolation(
        objectOf({
          dependencies: [
            {
              ...consumer,
              reads: [
                {
                  mode: "AS-OF-NOW",
                  source: { owner: "pc_existence", fact_key: pcExistenceContractKey(P) },
                  invalidators: [],
                },
              ],
            },
          ],
        }),
        { facts: facts() },
      ),
    ).toBeNull();
    expect(
      pcCapabilityObjectViolation(
        objectOf({
          owning_ref: { owner: "pc_existence", process_id: "p" },
          dependencies: [
            {
              ...consumer,
              reads: [
                {
                  mode: "AS-OF-NOW",
                  source: { owner: "pc_existence", fact_key: pcExistenceContractKey(P) },
                  invalidators: [],
                },
              ],
            },
          ],
        }),
        { facts: facts() },
      ),
    ).toBeNull();
  });
});

describe("the PC Capability Close owner operation: pure, fail-closed, inventing nothing", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    stage: pcCapabilityStage(P, C),
    produces: [pcCapabilityKey(P, C)],
    span: { from: { unit: "u", value: 1 }, to: { unit: "u", value: 2 }, elapsed: 1 },
    reads: [{ read: {} as never, fact: basisFact() }],
    prior: new Map<string, OwnerFact>(),
    ...over,
  });
  const reason = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      if (e instanceof StageUnresolvedError) return e.reason;
      throw e;
    }
    return "RESOLVED";
  };

  it("is registered under the one PC owner's capability facet and the PC operation", () => {
    expect(pcCapabilityCloseProvider.owner).toBe("pc_existence");
    expect(pcCapabilityCloseProvider.facet).toBe("pc_capability_profile");
    expect(pcCapabilityCloseProvider.operation).toBe("pc-publish-capability-close");
  });

  it("publishes the one capability the basis determines and inherits the basis' authored labels", () => {
    const [w, ...rest] = pcCapabilityCloseProvider.compute(input());
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ key: pcCapabilityKey(P, C), unit: null, basis: "b", secrecy: "s" });
    expect(w!.value).toMatchObject({ pc_id: P, capability_id: C, marker: "C" });
  });

  it("is deterministic and independent of the span (a requested horizon or elapsed amount changes nothing)", () => {
    const a = pcCapabilityCloseProvider.compute(input());
    const b = pcCapabilityCloseProvider.compute(
      input({
        span: { from: { unit: "u", value: 0 }, to: { unit: "u", value: 999 }, elapsed: 999 },
      }),
    );
    expect(a).toEqual(b);
  });

  it("is unresolved — publishing nothing — on a missing, extra or malformed source, a wrong slot, or a capability already published", () => {
    expect(reason(() => pcCapabilityCloseProvider.compute(input({ reads: [] })))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() =>
        pcCapabilityCloseProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: basisFact() },
              { read: {} as never, fact: basisFact() },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        pcCapabilityCloseProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: basisFact(basis(), { value: { marker: "S" } as never }) },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        pcCapabilityCloseProvider.compute(input({ produces: [pcCapabilityKey(P, "other")] })),
      ),
    ).toBe("SOURCE_INVALID");
    expect(reason(() => pcCapabilityCloseProvider.compute(input({ produces: [] })))).toBe(
      "SOURCE_INVALID",
    );
    expect(
      reason(() =>
        pcCapabilityCloseProvider.compute(
          input({ prior: new Map([[pcCapabilityKey(P, C), basisFact()]]) }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        pcCapabilityCloseProvider.compute(
          input({
            reads: [{ read: {} as never, fact: basisFact(basis(), { owner: "world_state" }) }],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
  });
});
