// Unit evidence for the KTI Managed Transfer Package / Result-Close Backbone Foundation (eleventh slice): the pure
// derivations, the registration rule and the one owner operation. Register lineage: IA-02, IA-03, IA-04 (partial), IA-16
// (partial); RC-03, RC-04, RC-11; IM-02, IM-09, IM-10. Local success is NOT provider/recovery acceptance.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  type AccessEvent,
  type AccessiblePacket,
  type KtiDevelopmentObject,
  type KtiTransferBasis,
  type OwnerFact,
  type SealedEngineProvenance,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  KTI_RULE,
  StageUnresolvedError,
  basisEvidenceViolation,
  deriveAccessProducts,
  deriveTransferPackage,
  ktiAccessClassViolation,
  ktiObjectViolation,
  ktiResultCloseRead,
  ktiTransferDeclaration,
  ktiTransferResultCloseProvider,
  packetSupportViolation,
  provenanceKeyOfPacket,
  transferPackageId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  ACTOR_SWORD,
  EVENT_COUNCIL,
  OBJECT_GATE_ROTA,
  OBJECT_OTHER,
  REFERENT_OTHER,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  accessEvent,
  ktiBasis,
  ktiConsumerDeclaration,
  ktiConsumerObject,
  ktiObject,
  sourceKey,
} from "@immortalis/testkit";

const A = ACTOR_SMITH;
const E = EVENT_COUNCIL;
const source = { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SPEAKER) };

const fact = <T>(key: string, owner: string, value: T, version = 1) => ({
  key,
  owner,
  version,
  value,
});
const packetValue = (referent = "the gate rota", recipient = A): AccessiblePacket => ({
  recipient,
  payload: { referent, content: "SYNTHETIC FIXTURE: content." },
  presented_attribution: null,
  access: { result: "RECEIVED", channel: "SPEECH", established_at: { unit: "u", value: 1 } },
  intelligibility: { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" },
});
const inputs = (
  over: {
    basis?: Partial<KtiTransferBasis>;
    packet?: ReturnType<typeof fact<AccessiblePacket>>;
    object?: ReturnType<typeof fact<KtiDevelopmentObject>>;
    basisOwner?: string;
  } = {},
) => {
  const b = ktiBasis(A, E, OBJECT_GATE_ROTA, over.basis);
  return {
    basis: fact(ktiTransferBasisKey(b.package_id), over.basisOwner ?? "kti", b),
    packet: over.packet ?? fact(accessPacketKey(E, A), "epistemic_access", packetValue()),
    object: over.object ?? fact(ktiDevelopmentObjectKey(OBJECT_GATE_ROTA), "kti", ktiObject()),
  };
};

describe("transferPackageId: one deterministic identity per source × recipient × development object (acceptance 3)", () => {
  it("is derived from exactly those three and nothing else, and is stable", () => {
    const id = transferPackageId(source, A, OBJECT_GATE_ROTA);
    expect(id).toMatch(/^transfer-[0-9a-f]{64}$/);
    expect(transferPackageId({ ...source }, A, OBJECT_GATE_ROTA)).toBe(id);
    expect(transferPackageId(source, ACTOR_SWORD, OBJECT_GATE_ROTA)).not.toBe(id);
    expect(transferPackageId(source, A, OBJECT_OTHER)).not.toBe(id);
    expect(
      transferPackageId({ ...source, fact_key: sourceKey(SOURCE_SCROLL) }, A, OBJECT_GATE_ROTA),
    ).not.toBe(id);
    expect(transferPackageId({ ...source, owner: "other-owner" }, A, OBJECT_GATE_ROTA)).not.toBe(
      id,
    );
    // an extra property on the source (a version, say) is not an identity dimension
    expect(transferPackageId({ ...source, version: 7 } as never, A, OBJECT_GATE_ROTA)).toBe(id);
  });

  it("the identity is a valid entity identifier, safe to embed in a key", () => {
    const b = ktiBasis(A, E);
    expect(ktiTransferBasisKey(b.package_id)).toBe(`kti/transfer/${b.package_id}/basis`);
    expect(ktiTransferPackageKey(b.package_id)).toBe(`kti/transfer/${b.package_id}/package`);
    expect(ktiTransferStage(b.package_id)).toEqual({
      causal_process_id: `kti-transfer/${b.package_id}`,
      owner_operation: { owner: "kti", operation: "kti-publish-transfer-result-close" },
      prospective_result_id: ktiTransferPackageKey(b.package_id),
    });
  });
});

describe("packetSupportViolation: packet-to-object linkage is explicit and exact (acceptance 3)", () => {
  it("supports an object only when the packet's subject is the referent the object is identified by, exactly", () => {
    expect(packetSupportViolation(packetValue("the gate rota"), ktiObject())).toBeNull();
    expect(packetSupportViolation(packetValue("The gate rota"), ktiObject())).toMatch(
      /does not support/,
    );
    expect(packetSupportViolation(packetValue(REFERENT_OTHER), ktiObject())).toMatch(
      /does not support/,
    );
    expect(packetSupportViolation(packetValue("the gate rota "), ktiObject())).toMatch(
      /does not support/,
    );
  });
});

describe("deriveTransferPackage: the package is exactly what the basis, the sealed packet and the object determine (acceptance 3, 4, 5)", () => {
  it("derives the ACTIVE package with references only", () => {
    const d = deriveTransferPackage(inputs());
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const b = ktiBasis(A, E);
    expect(d.value).toEqual({
      package_id: b.package_id,
      status: "ACTIVE",
      source,
      recipient: A,
      development_object: {
        object_id: OBJECT_GATE_ROTA,
        fact_key: ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
        version: 1,
      },
      packet: { fact_key: accessPacketKey(E, A), version: 1 },
      basis: { fact_key: ktiTransferBasisKey(b.package_id), version: 1 },
      close: { name: "kti-result-close", stage: ktiTransferStage(b.package_id) },
    });
    // nothing of the packet's content, attribution, access or intelligibility travels
    expect(JSON.stringify(d.value)).not.toContain("SYNTHETIC FIXTURE: content.");
  });

  it("fails closed on every foreign or stale reference: wrong owners, keys, versions, recipients and identities", () => {
    const code = (r: ReturnType<typeof deriveTransferPackage>) => (r.ok ? "OK" : r.error.code);
    expect(code(deriveTransferPackage(inputs({ basisOwner: "world_state" })))).toBe(
      "BASIS_INVALID",
    );
    expect(
      code(deriveTransferPackage({ ...inputs(), basis: { ...inputs().basis, key: "kti/x" } })),
    ).toBe("BASIS_INVALID");
    expect(code(deriveTransferPackage(inputs({ basis: { package_id: "transfer-forged" } })))).toBe(
      "BASIS_INVALID",
    );
    // the packet: not the Epistemic owner's, at a different key or version, or another recipient's
    const p = inputs().packet;
    for (const packet of [
      { ...p, owner: "named_actor" },
      { ...p, key: accessPacketKey("e2", A) },
      { ...p, version: 2 },
      { ...p, value: packetValue("the gate rota", ACTOR_SWORD) },
    ])
      expect(code(deriveTransferPackage({ ...inputs(), packet })), JSON.stringify(packet)).toBe(
        "PACKET_INVALID",
      );
    // the object: not KTI's, at another key or version, or another identity
    const o = inputs().object;
    for (const object of [
      { ...o, owner: "world_state" },
      { ...o, key: ktiDevelopmentObjectKey("other") },
      { ...o, version: 2 },
      { ...o, value: ktiObject("another-id") },
    ])
      expect(code(deriveTransferPackage({ ...inputs(), object })), JSON.stringify(object)).toBe(
        "OBJECT_INVALID",
      );
    // the packet does not support the object
    expect(
      code(
        deriveTransferPackage({
          ...inputs(),
          packet: fact(accessPacketKey(E, A), "epistemic_access", packetValue(REFERENT_OTHER)),
        }),
      ),
    ).toBe("PACKET_OBJECT_UNSUPPORTED");
  });

  it("is deterministic: identical input, identical package", () => {
    expect(deriveTransferPackage(inputs())).toEqual(deriveTransferPackage(inputs()));
  });
});

describe("basisEvidenceViolation: KTI discriminates the event mode and takes only what the sealed provenance records (acceptance 5, 9)", () => {
  const basis = ktiBasis(A, E);
  const provenance = (over: Partial<SealedEngineProvenance> = {}): SealedEngineProvenance => ({
    event: { fact_key: accessEventKey(E), version: 1 },
    recipient: A,
    packet: { fact_key: accessPacketKey(E, A) },
    source: { ...source, version: 1 },
    channel: "SPEECH",
    capability_close: null,
    ...over,
  });
  const event = (over: Record<string, unknown> = {}) =>
    fact(accessEventKey(E), "epistemic_access", { ...accessEvent(E, A), ...over } as AccessEvent);

  it("accepts a BOUNDED_SHARED_ACCESS event naming the one recipient, the recorded packet and the recorded source", () => {
    expect(basisEvidenceViolation({ basis, provenance: provenance(), event: event() })).toBeNull();
  });

  it("refuses an unlowered BROADCAST_EXPOSURE event, any other mode, a wider participant set and a different recipient: broadcast is never receipt", () => {
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance(),
        event: event({ mode: "BROADCAST_EXPOSURE" }),
      }),
    ).toMatch(/BOUNDED_SHARED_ACCESS evidence/);
    expect(
      basisEvidenceViolation({ basis, provenance: provenance(), event: event({ mode: "OTHER" }) }),
    ).toMatch(/BOUNDED_SHARED_ACCESS evidence/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance(),
        event: event({ participants: [A, ACTOR_SWORD] }),
      }),
    ).toMatch(/one named participant/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance(),
        event: event({ participants: [ACTOR_SWORD] }),
      }),
    ).toMatch(/one named participant/);
  });

  it("refuses provenance of another packet or recipient, an event that is not the provenance's own and a source the provenance does not record", () => {
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance({ packet: { fact_key: accessPacketKey("e2", A) } }),
        event: event(),
      }),
    ).toMatch(/exactly this packet and recipient/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance({ recipient: ACTOR_SWORD }),
        event: event(),
      }),
    ).toMatch(/exactly this packet and recipient/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance(),
        event: { ...event(), owner: "world_state" },
      }),
    ).toMatch(/own committed Epistemic access event/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance({ event: { fact_key: accessEventKey("e2"), version: 1 } }),
        event: event(),
      }),
    ).toMatch(/own committed Epistemic access event/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance({
          source: { ...source, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
        }),
        event: event(),
      }),
    ).toMatch(/true source the sealed provenance records/);
    expect(
      basisEvidenceViolation({
        basis,
        provenance: provenance({
          source: { owner: "someone", fact_key: source.fact_key, version: 1 },
        }),
        event: event(),
      }),
    ).toMatch(/true source the sealed provenance records/);
  });

  it("the provenance key is derived from the packet key alone, and a non-packet key has none", () => {
    expect(provenanceKeyOfPacket(accessPacketKey(E, A))).toBe(accessProvenanceKey(E, A));
    expect(provenanceKeyOfPacket(accessEventKey(E))).toBeNull();
    expect(provenanceKeyOfPacket(accessProvenanceKey(E, A))).toBeNull();
    expect(provenanceKeyOfPacket("kti/object/x")).toBeNull();
  });

  it("KTI never needs the packet's own provenance fields: the formed provenance is consistent with this derivation", () => {
    const e = accessEvent(E, A);
    const d = deriveAccessProducts({
      event: fact(accessEventKey(E), "epistemic_access", e),
      capability: null,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(
      basisEvidenceViolation({
        basis,
        provenance: d.value.provenance,
        event: fact(accessEventKey(E), "epistemic_access", e),
      }),
    ).toBeNull();
  });
});

describe("the KTI access class (acceptance 4)", () => {
  it("every KTI fact is engine-side: no other label is lawful", () => {
    expect(ktiAccessClassViolation(ACCESS_CLASS_KTI_ENGINE_SIDE)).toBeNull();
    for (const bad of [ACCESS_CLASS_ACTOR_ACCESSIBLE, ACCESS_CLASS_ENGINE_SEALED, "", "public"])
      expect(ktiAccessClassViolation(bad)).toMatch(/engine-side/);
  });
});

describe("the temporal declaration and registration rule (acceptance 6, 7, 10)", () => {
  const basis = ktiBasis(A, E);
  const facts = (b: KtiTransferBasis | null = basis, over: Partial<OwnerFact> = {}) =>
    ({
      facts: new Map(
        b
          ? [
              [
                ktiTransferBasisKey(b.package_id),
                {
                  key: ktiTransferBasisKey(b.package_id),
                  owner: "kti",
                  facet: "kti_development",
                  value: b,
                  unit: null,
                  basis: "b",
                  secrecy: ACCESS_CLASS_KTI_ENGINE_SIDE,
                  version: 1,
                  provenance: { group_id: "g", intent_id: "i", cause: "c", rule: KTI_RULE },
                  ...over,
                } as OwnerFact,
              ],
            ]
          : [],
      ),
    }) as { facts: ReadonlyMap<string, OwnerFact> };
  const objectOf = (over: Partial<TemporalObject> = {}) => ktiConsumerObject("k1", basis, over);

  it("the stage reads its basis, the sealed packet and the object — all NOW — writes the package and declares the KTI result close", () => {
    const d = ktiTransferDeclaration(basis)!;
    expect(d.stage).toEqual(ktiTransferStage(basis.package_id));
    expect(d.reads.map((r) => [r.mode, r.source.owner, r.source.fact_key])).toEqual([
      ["AS-OF-NOW", "kti", ktiTransferBasisKey(basis.package_id)],
      ["AS-OF-NOW", "epistemic_access", accessPacketKey(E, A)],
      ["AS-OF-NOW", "kti", ktiDevelopmentObjectKey(OBJECT_GATE_ROTA)],
    ]);
    expect(d.produces).toEqual([ktiTransferPackageKey(basis.package_id)]);
    expect(d.declares_close).toEqual({ name: "kti-result-close" });
    // a basis that names no packet has no declaration
    expect(
      ktiTransferDeclaration({ ...basis, packet: { fact_key: "kti/object/x", version: 1 } }),
    ).toBeNull();
  });

  it("the only cross-owner read is the close, naming the KTI owner's declared result close", () => {
    const r = ktiResultCloseRead(basis.package_id);
    expect(r).toEqual({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "kti", fact_key: ktiTransferPackageKey(basis.package_id) },
      close_basis: {
        name: "kti-result-close",
        producer: { owner: "kti", operation: "kti-publish-transfer-result-close" },
      },
      invalidators: [{ fact_key: ktiTransferPackageKey(basis.package_id) }],
    });
  });

  it("accepts the derived object, and an object that touches no KTI key space is not this rule's concern", () => {
    expect(ktiObjectViolation(objectOf(), facts())).toBeNull();
    const unrelated = {
      ...objectOf(),
      dependencies: [
        { ...ktiConsumerDeclaration("k1", basis.package_id), reads: [], produces: ["synthetic/x"] },
      ],
    } as TemporalObject;
    expect(ktiObjectViolation(unrelated, { facts: new Map() })).toBeNull();
  });

  it("refuses a standalone KTI object, and a KTI stage for a basis that is not committed", () => {
    expect(
      ktiObjectViolation(objectOf({ owning_ref: { owner: "kti", process_id: "p" } }), facts()),
    ).toMatch(/no standalone KTI object/);
    expect(ktiObjectViolation(objectOf(), facts(null))).toMatch(/committed transfer basis/);
    expect(ktiObjectViolation(objectOf(), facts(basis, { owner: "world_state" }))).toMatch(
      /committed transfer basis/,
    );
  });

  it("refuses a KTI stage that is not exactly the declaration derived from its committed basis, and a second KTI operation", () => {
    const decl = ktiTransferDeclaration(basis)!;
    for (const bad of [
      { ...decl, reads: [] },
      { ...decl, reads: [decl.reads[0]!, decl.reads[2]!, decl.reads[1]!] },
      { ...decl, produces: [ktiTransferPackageKey("other")] },
      { ...decl, declares_close: null },
      { ...decl, declares_close: { name: "a-close" } },
      { ...decl, reads: [{ ...decl.reads[0]!, invalidators: [] }, decl.reads[1]!, decl.reads[2]!] },
    ])
      expect(
        ktiObjectViolation(
          objectOf({
            dependencies: [bad as never, ktiConsumerDeclaration("k1", basis.package_id)],
          }),
          facts(),
        ),
      ).toMatch(/exactly the declaration derived/);
    expect(
      ktiObjectViolation(
        objectOf({
          dependencies: [
            {
              ...decl,
              stage: {
                ...decl.stage,
                owner_operation: { owner: "kti", operation: "something-else" },
              },
            },
          ],
        }),
        facts(),
      ),
    ).toMatch(/exactly one stage/);
  });

  it("the basis and the development object are never cross-owner reads; the package is read only AS-OF-DECLARED-CLOSE, naming the KTI result close", () => {
    const consumer = (read: unknown) =>
      objectOf({
        dependencies: [
          ktiTransferDeclaration(basis)!,
          { ...ktiConsumerDeclaration("k1", basis.package_id), reads: [read as never] },
        ],
      });
    const nowRead = (key: string, over: Record<string, unknown> = {}) => ({
      mode: "AS-OF-NOW",
      source: { owner: "kti", fact_key: key },
      invalidators: [],
      ...over,
    });
    expect(ktiObjectViolation(consumer(ktiResultCloseRead(basis.package_id)), facts())).toBeNull();
    expect(
      ktiObjectViolation(consumer(nowRead(ktiTransferBasisKey(basis.package_id))), facts()),
    ).toMatch(/not cross-owner reads/);
    expect(
      ktiObjectViolation(consumer(nowRead(ktiDevelopmentObjectKey(OBJECT_GATE_ROTA))), facts()),
    ).toMatch(/not cross-owner reads/);
    expect(
      ktiObjectViolation(consumer(nowRead(ktiTransferPackageKey(basis.package_id))), facts()),
    ).toMatch(/only AS-OF-DECLARED-CLOSE/);
    const close = ktiResultCloseRead(basis.package_id) as unknown as {
      close_basis: { name: string; producer: unknown };
    };
    expect(
      ktiObjectViolation(
        consumer({ ...close, close_basis: { ...close.close_basis, name: "another" } }),
        facts(),
      ),
    ).toMatch(/only AS-OF-DECLARED-CLOSE/);
    expect(ktiObjectViolation(consumer(nowRead("kti/other")), facts())).toMatch(
      /names the package, its basis or its development object/,
    );
    expect(
      ktiObjectViolation(
        consumer(
          nowRead(ktiTransferPackageKey(basis.package_id), {
            source: { owner: "someone_else", fact_key: ktiTransferPackageKey(basis.package_id) },
          }),
        ),
        facts(),
      ),
    ).toMatch(/read as its owner's fact/);
  });

  it("no stage outside the KTI owner declares that it produces a KTI key", () => {
    const d = {
      ...ktiConsumerDeclaration("k1", basis.package_id),
      produces: [ktiTransferPackageKey(basis.package_id)],
    };
    expect(
      ktiObjectViolation(objectOf({ dependencies: [ktiTransferDeclaration(basis)!, d] }), facts()),
    ).toMatch(/only the KTI owner's stage produces/);
  });
});

describe("the result-close owner operation: pure, fail-closed, inventing nothing (acceptance 3, 10)", () => {
  const b = ktiBasis(A, E);
  const asFact = (key: string, owner: string, value: unknown, version = 1): OwnerFact =>
    ({
      key,
      owner,
      facet: "f",
      value,
      unit: null,
      basis: "b",
      secrecy: "s",
      version,
      provenance: { group_id: `g-${key}`, intent_id: "i", cause: "c", rule: KTI_RULE },
    }) as unknown as OwnerFact;
  const input = (over: Record<string, unknown> = {}) => ({
    stage: ktiTransferStage(b.package_id),
    produces: [ktiTransferPackageKey(b.package_id)],
    span: { from: { unit: "u", value: 1 }, to: { unit: "u", value: 2 }, elapsed: 1 },
    reads: [
      { read: {} as never, fact: asFact(ktiTransferBasisKey(b.package_id), "kti", b) },
      {
        read: {} as never,
        fact: asFact(accessPacketKey(E, A), "epistemic_access", packetValue()),
      },
      {
        read: {} as never,
        fact: asFact(ktiDevelopmentObjectKey(OBJECT_GATE_ROTA), "kti", ktiObject()),
      },
    ],
    prior: new Map<string, OwnerFact>(),
    ...over,
  });
  const reason = (f: () => unknown) => {
    try {
      f();
    } catch (err) {
      if (err instanceof StageUnresolvedError) return err.reason;
      throw err;
    }
    return "RESOLVED";
  };

  it("writes one engine-side package, inheriting the basis's authored label and stamping the owner's class", () => {
    const [pkg, ...rest] = ktiTransferResultCloseProvider.compute(input());
    expect(rest).toEqual([]);
    expect(pkg).toMatchObject({
      key: ktiTransferPackageKey(b.package_id),
      unit: null,
      basis: "b",
      secrecy: ACCESS_CLASS_KTI_ENGINE_SIDE,
    });
    expect((pkg!.value as { status: string }).status).toBe("ACTIVE");
  });

  it("is deterministic and independent of the span (a requested horizon or elapsed amount changes nothing)", () => {
    const a = ktiTransferResultCloseProvider.compute(input());
    const c = ktiTransferResultCloseProvider.compute(
      input({
        span: { from: { unit: "u", value: 0 }, to: { unit: "u", value: 999 }, elapsed: 999 },
      }),
    );
    expect(a).toEqual(c);
  });

  it("is unresolved — publishing nothing — on a missing, extra or malformed source, a wrong slot, an unsupporting packet or a package already published", () => {
    expect(reason(() => ktiTransferResultCloseProvider.compute(input({ reads: [] })))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(input({ reads: input().reads.slice(0, 2) })),
      ),
    ).toBe("SOURCE_ABSENT");
    const reads = input().reads;
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: asFact("k", "kti", { nope: 1 }) },
              reads[1]!,
              reads[2]!,
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({
            reads: [
              reads[0]!,
              { read: {} as never, fact: asFact("p", "epistemic_access", { x: 1 }) },
              reads[2]!,
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({
            reads: [
              reads[0]!,
              reads[1]!,
              { read: {} as never, fact: asFact("o", "kti", { x: 1 }) },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({ produces: [ktiTransferPackageKey("another-package")] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({ produces: [ktiTransferPackageKey(b.package_id), "kti/extra"] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({
            prior: new Map([[ktiTransferPackageKey(b.package_id), asFact("x", "kti", {})]]),
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    // a packet that does not support the object
    expect(
      reason(() =>
        ktiTransferResultCloseProvider.compute(
          input({
            reads: [
              reads[0]!,
              {
                read: {} as never,
                fact: asFact(
                  accessPacketKey(E, A),
                  "epistemic_access",
                  packetValue(REFERENT_OTHER),
                ),
              },
              reads[2]!,
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
  });
});
