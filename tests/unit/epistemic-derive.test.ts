// Unit evidence for the Epistemic Access / Sealed Accessible Content Packet Backbone Foundation (tenth slice): the pure
// derivations, the registration rule and the one owner operation. Register lineage: IA-02, IA-03, IA-11 (partial),
// IA-16 (partial); RC-03, RC-04, RC-11, RC-14; IM-02, IM-10. Local success is NOT provider/recovery acceptance.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  type AccessEvent,
  type NamedActorCapability,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_RULE,
  StageUnresolvedError,
  deriveAccessProducts,
  deriveCapability,
  epistemicObjectViolation,
  epistemicPacketDeclaration,
  epistemicPacketProvider,
  epistemicPacketRead,
  eventRecipient,
  formationKeys,
  sourceOwnerViolation,
  stageGroupId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  SYNTH_ACCESS_SOURCE_OWNER,
  accessEvent,
  capabilityBasis,
  packetConsumerDeclaration,
  packetConsumerObject,
} from "@immortalis/testkit";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const capStage = actorCapabilityStage(A, C);
const closeGroup = stageGroupId(capStage);

const eventFact = (e: AccessEvent = accessEvent("e1", A), over: Partial<OwnerFact> = {}) =>
  ({
    key: accessEventKey(e.event_id),
    owner: "epistemic_access",
    facet: "epistemic_access",
    value: e,
    unit: null,
    basis: "b",
    secrecy: ACCESS_CLASS_ENGINE_SEALED,
    version: 1,
    provenance: {
      group_id: "g-event",
      intent_id: "i-event",
      cause: "c",
      rule: EPISTEMIC_ACCESS_RULE,
    },
    ...over,
  }) as OwnerFact;

const capability = (marker: unknown = "C"): NamedActorCapability => {
  const basis = { ...capabilityBasis(A, C), marker } as never;
  const d = deriveCapability({
    key: actorCapabilityBasisKey(A, C),
    owner: "named_actor",
    version: 1,
    value: basis,
  });
  if (!d.ok) throw new Error("fixture");
  return d.value;
};
const capRead = (over: Record<string, unknown> = {}, marker: unknown = "C") => ({
  fact: {
    key: actorCapabilityKey(A, C),
    owner: "named_actor",
    version: 1,
    value: capability(marker),
    ...over,
  },
  committed_by: closeGroup,
});
const needsCap = (over: Partial<AccessEvent> = {}) =>
  accessEvent("e1", A, { representation: { capability_id: C }, ...over });
const ev = (e: AccessEvent) => ({
  key: accessEventKey(e.event_id),
  owner: "epistemic_access",
  version: 1,
  value: e,
});

describe("deriveAccessProducts: the packet and the sealed provenance are exactly what the event determines (acceptance 3, 4, 6, 8)", () => {
  it("a payload whose form depends on no capability needs no capability read, and reads none", () => {
    const d = deriveAccessProducts({ event: ev(accessEvent("e1", A)), capability: null });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.packet).toEqual({
      recipient: A,
      payload: { referent: "the gate rota", content: expect.any(String) },
      presented_attribution: expect.any(String),
      access: { result: "RECEIVED", channel: "SPEECH", established_at: expect.any(Object) },
      intelligibility: { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" },
    });
    expect(d.value.provenance).toEqual({
      event: { fact_key: accessEventKey("e1"), version: 1 },
      recipient: A,
      packet: { fact_key: accessPacketKey("e1", A) },
      source: accessEvent("e1", A).source,
      channel: "SPEECH",
      capability_close: null,
    });
  });

  it("a payload whose form depends on a capability references that capability at its declared close, both in the packet and in the provenance", () => {
    const d = deriveAccessProducts({ event: ev(needsCap()), capability: capRead() });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.packet.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: C,
        fact_key: actorCapabilityKey(A, C),
        version: 1,
        close: { name: "actor-profile-capability-close", group_id: closeGroup },
      },
    });
    expect(d.value.provenance.capability_close).toEqual({
      fact_key: actorCapabilityKey(A, C),
      version: 1,
      committed_by: closeGroup,
    });
  });

  it("the marker is never read: every marker form yields byte-identical products (no grade comparison, conversion or threshold)", () => {
    const results = ["C", "B", "A", "S", { ex: "SYNTHETIC FIXTURE: descriptor" }, null].map((m) =>
      JSON.stringify(deriveAccessProducts({ event: ev(needsCap()), capability: capRead({}, m) })),
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]).not.toMatch(/marker|grade|"ex"|"S"|"A"|"B"/);
  });

  it("the packet never carries the true source, holder, carrier or any engine reference; the provenance does", () => {
    const d = deriveAccessProducts({ event: ev(needsCap()), capability: capRead() });
    if (!d.ok) throw new Error("fixture");
    const packetText = JSON.stringify(d.value.packet);
    for (const secret of [
      SYNTH_ACCESS_SOURCE_OWNER,
      accessEvent("e1", A).source.fact_key,
      accessEventKey("e1"),
      accessPacketKey("e1", A),
      accessProvenanceKey("e1", A),
      "g-event",
    ])
      expect(packetText).not.toContain(secret);
    expect(JSON.stringify(d.value.provenance)).toContain(accessEvent("e1", A).source.fact_key);
  });

  it("a presented attribution that differs from the true source stays presented in the packet and true in the provenance", () => {
    const e = accessEvent("e1", A, {
      payload: { ...accessEvent("e1", A).payload, presented_attribution: "claims to be the Duke" },
    });
    const d = deriveAccessProducts({ event: ev(e), capability: null });
    if (!d.ok) throw new Error("fixture");
    expect(d.value.packet.presented_attribution).toBe("claims to be the Duke");
    expect(d.value.provenance.source.owner).toBe(SYNTH_ACCESS_SOURCE_OWNER);
    expect(JSON.stringify(d.value.packet)).not.toContain(SYNTH_ACCESS_SOURCE_OWNER);
  });

  it("is deterministic and a pure function of its inputs", () => {
    const a = deriveAccessProducts({ event: ev(needsCap()), capability: capRead() });
    const b = deriveAccessProducts({ event: ev(needsCap()), capability: capRead() });
    expect(a).toEqual(b);
  });

  it("fails closed — never a partial or best-effort packet — when the capability a payload needs is absent, foreign, not the recipient's, not for the faculty, or not at its close", () => {
    const code = (r: ReturnType<typeof deriveAccessProducts>) => (r.ok ? "OK" : r.error.code);
    const e = needsCap();
    expect(code(deriveAccessProducts({ event: ev(e), capability: null }))).toBe(
      "CAPABILITY_ABSENT",
    );
    expect(
      code(deriveAccessProducts({ event: ev(accessEvent("e1", A)), capability: capRead() })),
    ).toBe("CAPABILITY_NOT_REQUIRED");
    expect(
      code(deriveAccessProducts({ event: ev(e), capability: capRead({ owner: "world_state" }) })),
    ).toBe("CAPABILITY_INVALID");
    expect(
      code(
        deriveAccessProducts({
          event: ev(e),
          capability: capRead({ key: actorCapabilityKey(ACTOR_SWORD, C) }),
        }),
      ),
    ).toBe("CAPABILITY_INVALID");
    expect(
      code(
        deriveAccessProducts({
          event: ev(needsCap({ participants: [ACTOR_SWORD] })),
          capability: capRead(),
        }),
      ),
    ).toBe("CAPABILITY_INVALID");
    expect(
      code(
        deriveAccessProducts({
          event: ev(needsCap({ representation: { capability_id: "capability-other" } })),
          capability: capRead(),
        }),
      ),
    ).toBe("CAPABILITY_INVALID");
    expect(
      code(
        deriveAccessProducts({
          event: ev(e),
          capability: { ...capRead(), committed_by: "stage-group:some-later-group" },
        }),
      ),
    ).toBe("CAPABILITY_NOT_AT_CLOSE");
    const tampered = capRead();
    (tampered.fact.value as { close: { stage: { causal_process_id: string } } }).close.stage = {
      ...capStage,
      causal_process_id: "elsewhere",
    } as never;
    expect(code(deriveAccessProducts({ event: ev(e), capability: tampered }))).toBe(
      "CAPABILITY_INVALID",
    );
  });

  it("fails closed on an event that is not the Epistemic owner's own or not at its own key", () => {
    const code = (r: ReturnType<typeof deriveAccessProducts>) => (r.ok ? "OK" : r.error.code);
    expect(
      code(
        deriveAccessProducts({
          event: { ...ev(accessEvent("e1", A)), owner: "world_state" },
          capability: null,
        }),
      ),
    ).toBe("EVENT_INVALID");
    expect(
      code(
        deriveAccessProducts({
          event: { ...ev(accessEvent("e1", A)), key: accessEventKey("e2") },
          capability: null,
        }),
      ),
    ).toBe("EVENT_INVALID");
  });

  it("names the one recipient and the two formation keys (packet first, sealed provenance second)", () => {
    expect(eventRecipient(accessEvent("e1", A))).toBe(A);
    expect(formationKeys("e1", A)).toEqual([
      accessPacketKey("e1", A),
      accessProvenanceKey("e1", A),
    ]);
  });
});

describe("what may be an information source (acceptance 9)", () => {
  it("refuses the Epistemic owner's own state, kernel coordination state and a Named-Actor capability; allows a foreign owner", () => {
    expect(sourceOwnerViolation("epistemic_access")).toMatch(/foreign fact/);
    expect(sourceOwnerViolation("temporal_kernel")).toMatch(/no information source/);
    expect(sourceOwnerViolation("named_actor")).toMatch(/never as an information source/);
    expect(sourceOwnerViolation(SYNTH_ACCESS_SOURCE_OWNER)).toBeNull();
    expect(sourceOwnerViolation("world_state")).toBeNull();
  });
});

describe("the packet-formation declaration and the registration rule (acceptance 2, 5, 9, 12, 15)", () => {
  const facts = (e: AccessEvent = accessEvent("e1", A)) => ({
    facts: new Map([[accessEventKey(e.event_id), eventFact(e)]]),
  });
  const objectOf = (e: AccessEvent, over: Partial<TemporalObject> = {}) =>
    ({ ...packetConsumerObject("c1", e), ...over }) as TemporalObject;

  it("a formation reads its event NOW and, where required, the recipient's capability AS-OF-DECLARED-CLOSE naming the actor close; it writes exactly the packet and the sealed provenance", () => {
    const plain = epistemicPacketDeclaration(accessEvent("e1", A));
    expect(plain.reads).toHaveLength(1);
    expect(plain.reads[0]!.mode).toBe("AS-OF-NOW");
    expect(plain.produces).toEqual([accessPacketKey("e1", A), accessProvenanceKey("e1", A)]);
    expect(plain.declares_close).toBeNull();
    expect(plain.stage).toEqual(accessPacketStage("e1", A));
    const capDecl = epistemicPacketDeclaration(needsCap());
    expect(capDecl.reads).toHaveLength(2);
    expect(capDecl.reads[1]).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "named_actor", fact_key: actorCapabilityKey(A, C) },
      close_basis: {
        name: "actor-profile-capability-close",
        producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
      },
    });
  });

  it("accepts the derived object, and an object that touches no Epistemic key space is not this rule's concern", () => {
    expect(epistemicObjectViolation(objectOf(accessEvent("e1", A)), facts())).toBeNull();
    const unrelated = {
      ...objectOf(accessEvent("e1", A)),
      dependencies: [
        { ...packetConsumerDeclaration("c1", "e1", A), reads: [], produces: ["synthetic/x"] },
      ],
    } as TemporalObject;
    expect(epistemicObjectViolation(unrelated, { facts: new Map() })).toBeNull();
  });

  it("refuses a standalone Epistemic object: a packet is formed only inside a dependent consequence's object", () => {
    expect(
      epistemicObjectViolation(
        objectOf(accessEvent("e1", A), {
          owning_ref: { owner: "epistemic_access", process_id: "p" },
        }),
        facts(),
      ),
    ).toMatch(/no standalone Epistemic object/);
  });

  it("refuses a formation for an event that is not committed: a consequence cannot create the access it needs", () => {
    expect(epistemicObjectViolation(objectOf(accessEvent("e1", A)), { facts: new Map() })).toMatch(
      /committed access event/,
    );
    expect(
      epistemicObjectViolation(objectOf(accessEvent("e1", A)), {
        facts: new Map([
          [accessEventKey("e1"), eventFact(accessEvent("e1", A), { owner: "world_state" })],
        ]),
      }),
    ).toMatch(/committed access event/);
  });

  it("refuses an Epistemic stage that is not exactly the declaration derived from its committed event", () => {
    const e = accessEvent("e1", A);
    const decl = epistemicPacketDeclaration(e);
    for (const bad of [
      { ...decl, reads: [] },
      { ...decl, produces: [decl.produces[0]!, accessProvenanceKey("e1", "other")] },
      { ...decl, declares_close: { name: "a-close" } },
      { ...decl, reads: [{ ...decl.reads[0]!, invalidators: [] }] },
    ])
      expect(
        epistemicObjectViolation(objectOf(e, { dependencies: [bad as never] }), facts()),
      ).toMatch(/exactly the declaration derived/);
    expect(
      epistemicObjectViolation(
        objectOf(e, {
          dependencies: [
            {
              ...decl,
              stage: {
                ...decl.stage,
                owner_operation: { owner: "epistemic_access", operation: "something-else" },
              },
            },
          ],
        }),
        facts(),
      ),
    ).toMatch(/exactly one stage/);
  });

  it("a capability requirement is read only AS-OF-DECLARED-CLOSE: a NOW read of the capability is not the derived declaration", () => {
    const e = needsCap();
    const decl = epistemicPacketDeclaration(e);
    const nowRead = {
      mode: "AS-OF-NOW",
      source: { owner: "named_actor", fact_key: actorCapabilityKey(A, C) },
      invalidators: [],
    };
    expect(
      epistemicObjectViolation(
        objectOf(e, { dependencies: [{ ...decl, reads: [decl.reads[0]!, nowRead] } as never] }),
        facts(e),
      ),
    ).toMatch(/exactly the declaration derived/);
  });

  it("the engine-side event and the sealed provenance are never cross-owner reads; only the formed packet is, AS-OF-NOW", () => {
    const e = accessEvent("e1", A);
    const consumer = (read: unknown) =>
      objectOf(e, {
        dependencies: [
          epistemicPacketDeclaration(e),
          { ...packetConsumerDeclaration("c1", "e1", A), reads: [read as never] },
        ],
      });
    const read = (key: string, over: Record<string, unknown> = {}) => ({
      mode: "AS-OF-NOW",
      source: { owner: "epistemic_access", fact_key: key },
      invalidators: [],
      ...over,
    });
    expect(epistemicObjectViolation(consumer(epistemicPacketRead("e1", A)), facts())).toBeNull();
    expect(epistemicObjectViolation(consumer(read(accessEventKey("e1"))), facts())).toMatch(
      /engine-side/,
    );
    expect(epistemicObjectViolation(consumer(read(accessProvenanceKey("e1", A))), facts())).toMatch(
      /never an actor-admissible input/,
    );
    expect(
      epistemicObjectViolation(
        consumer(read(accessPacketKey("e1", A), { invalidators: [{ fact_key: "x" }] })),
        facts(),
      ),
    ).toMatch(/only AS-OF-NOW/);
    expect(
      epistemicObjectViolation(
        consumer({
          mode: "AS-OF-DECLARED-CLOSE",
          source: { owner: "epistemic_access", fact_key: accessPacketKey("e1", A) },
          close_basis: { name: "x", producer: { owner: "epistemic_access", operation: "y" } },
          invalidators: [],
        }),
        facts(),
      ),
    ).toMatch(/only AS-OF-NOW/);
    expect(epistemicObjectViolation(consumer(read("access/e1/other", {})), facts())).toMatch(
      /names the packet/,
    );
    expect(
      epistemicObjectViolation(
        consumer(
          read(accessPacketKey("e1", A), {
            source: { owner: "someone_else", fact_key: accessPacketKey("e1", A) },
          }),
        ),
        facts(),
      ),
    ).toMatch(/read as its owner's fact/);
  });

  it("no stage outside the Epistemic owner declares that it produces an Epistemic key", () => {
    const e = accessEvent("e1", A);
    const d = { ...packetConsumerDeclaration("c1", "e1", A), produces: [accessPacketKey("e1", A)] };
    expect(
      epistemicObjectViolation(
        objectOf(e, { dependencies: [epistemicPacketDeclaration(e), d] }),
        facts(),
      ),
    ).toMatch(/only the Epistemic owner's stage produces/);
  });
});

describe("the packet-formation owner operation: pure, fail-closed, inventing nothing (acceptance 3, 12, 13)", () => {
  const e = accessEvent("e1", A);
  const input = (over: Record<string, unknown> = {}) => ({
    stage: accessPacketStage("e1", A),
    produces: [...formationKeys("e1", A)],
    span: { from: { unit: "u", value: 1 }, to: { unit: "u", value: 2 }, elapsed: 1 },
    reads: [{ read: {} as never, fact: eventFact(e) }],
    prior: new Map<string, OwnerFact>(),
    ...over,
  });
  const capInput = (over: Record<string, unknown> = {}) =>
    input({
      reads: [
        { read: {} as never, fact: eventFact(needsCap()) },
        {
          read: {} as never,
          fact: {
            key: actorCapabilityKey(A, C),
            owner: "named_actor",
            facet: "actor_profile",
            value: capability(),
            unit: null,
            basis: "b",
            secrecy: "s",
            version: 1,
            provenance: {
              group_id: closeGroup,
              intent_id: "i",
              cause: "c",
              rule: EPISTEMIC_ACCESS_RULE,
            },
          } as OwnerFact,
        },
      ],
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

  it("writes two surfaces with two access classes — the actor-accessible packet and the engine-sealed provenance — inheriting the event's authored basis", () => {
    const [packet, provenance, ...rest] = epistemicPacketProvider.compute(input());
    expect(rest).toEqual([]);
    expect(packet).toMatchObject({
      key: accessPacketKey("e1", A),
      unit: null,
      basis: "b",
      secrecy: ACCESS_CLASS_ACTOR_ACCESSIBLE,
    });
    expect(provenance).toMatchObject({
      key: accessProvenanceKey("e1", A),
      unit: null,
      basis: "b",
      secrecy: ACCESS_CLASS_ENGINE_SEALED,
    });
    expect(JSON.stringify(packet!.value)).not.toContain(e.source.fact_key);
    expect(JSON.stringify(provenance!.value)).toContain(e.source.fact_key);
  });

  it("with a capability requirement, the same operation references the capability at its close", () => {
    const [packet] = epistemicPacketProvider.compute(capInput());
    expect(JSON.stringify(packet!.value)).toContain(closeGroup);
  });

  it("is deterministic and independent of the span (a requested horizon or elapsed amount changes nothing)", () => {
    const a = epistemicPacketProvider.compute(input());
    const b = epistemicPacketProvider.compute(
      input({
        span: { from: { unit: "u", value: 0 }, to: { unit: "u", value: 999 }, elapsed: 999 },
      }),
    );
    expect(a).toEqual(b);
  });

  it("is unresolved — publishing nothing — on a missing, extra or malformed source, a wrong slot, a missing capability or a packet already formed", () => {
    expect(reason(() => epistemicPacketProvider.compute(input({ reads: [] })))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() =>
        epistemicPacketProvider.compute(
          input({ reads: [...input().reads, ...input().reads, ...input().reads] }),
        ),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        epistemicPacketProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: eventFact({ ...e, mode: "BROADCAST_EXPOSURE" } as never) },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        epistemicPacketProvider.compute(input({ produces: [accessPacketKey("e1", A)] })),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        epistemicPacketProvider.compute(
          input({ produces: [accessPacketKey("e1", A), accessProvenanceKey("e1", "other")] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        epistemicPacketProvider.compute(
          input({ prior: new Map([[accessPacketKey("e1", A), eventFact(e)]]) }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    // the event needs a capability but only the event was read
    expect(
      reason(() =>
        epistemicPacketProvider.compute(
          input({ reads: [{ read: {} as never, fact: eventFact(needsCap()) }] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    // the capability read is not at its declared close
    const notAtClose = capInput();
    (notAtClose.reads[1] as { fact: OwnerFact }).fact = {
      ...(notAtClose.reads[1] as { fact: OwnerFact }).fact,
      provenance: {
        ...(notAtClose.reads[1] as { fact: OwnerFact }).fact.provenance,
        group_id: "later",
      },
    };
    expect(reason(() => epistemicPacketProvider.compute(notAtClose))).toBe("SOURCE_INVALID");
    // a malformed capability
    const malformed = capInput();
    (malformed.reads[1] as { fact: OwnerFact }).fact = {
      ...(malformed.reads[1] as { fact: OwnerFact }).fact,
      value: { marker: "S" } as never,
    };
    expect(reason(() => epistemicPacketProvider.compute(malformed))).toBe("SOURCE_INVALID");
  });
});
