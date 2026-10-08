/* eslint-disable @typescript-eslint/no-explicit-any -- tests present forged and tampered values on purpose */
// Active-PC Voluntary Movement — enforcement. Every refusal leaves the store untouched (no partial commitment, no invented
// willingness, route, duration, identity or authority), and a raw `store.commit` cannot bypass what the owner path refuses.
// Register lineage: IA-01/02/03/04/06/14 (partial); RC-02, RC-07, RC-13; IM-03, IM-05, IM-07, IM-11.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  PLAYER_CHOICE_AUTHORITY,
  logisticsCommitmentKey,
  logisticsTransferKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldEntityTransitionKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { ACTOR_OTHER, FIXTURE_CAMPAIGN, group, publication, write } from "@immortalis/testkit";
import { fixtureWorld } from "@immortalis/testkit";
import { factKind } from "@immortalis/engine";
import { handedOverCampaign } from "../support/pc-locus-custody.ts";
import {
  DEST_LOCUS_ID,
  OTHER_DEST,
  PC,
  W,
  advanceToDelivery,
  commitMove,
  commitRequestDispatchRegister,
  custodiedCampaign,
  logisticsCommit,
  logisticsDispatch,
  playerCommit,
  rawCommitment,
  rawRequest,
  registerPcTransfer,
  requestMove,
  snapshotFacts,
} from "../support/pc-movement.ts";
import { must } from "../support/temporal.ts";

type Seeded = Awaited<ReturnType<typeof custodiedCampaign>>;

/** the attempt is refused, and nothing at all changed: head, every fact, every receipt */
const refused = async (
  s: Pick<Seeded, "campaign">,
  attempt: () => Promise<{ ok: boolean; error?: { code: string } }>,
) => {
  const head = s.campaign.store.head();
  const facts = snapshotFacts(s);
  const r = await attempt();
  expect(r.ok).toBe(false);
  expect(s.campaign.store.head()).toEqual(head);
  expect(snapshotFacts(s)).toEqual(facts);
  return r.error?.code;
};
const rawCommit = (s: Seeded, g: ReturnType<typeof rawCommitment>) => s.campaign.store.commit(g);
/** the lawful group with ONLY its writes (and optionally its owner/facet) replaced: every other field is the lawful one */
const withWrites = (
  lawful: ReturnType<typeof rawCommitment>,
  writes: ReturnType<typeof rawCommitment>["writes"],
  over: Partial<ReturnType<typeof rawCommitment>> = {},
) => ({ ...lawful, writes, ...over });

describe("no active, handed-over PC with its custody, no commitment: wrong, inactive or unprepared PCs fail closed", () => {
  it("no PC at all (NULL binding), and a handed-over PC whose custody was never established", async () => {
    const handed = await handedOverCampaign(); // handed over, but PR #41's custody record is not established
    expect(
      await refused(handed, () =>
        handed.campaign.commitPcVoluntaryMovement(playerCommit(1) as never),
      ),
    ).toBe("PREREQUISITE_MISSING");
    // and a raw record naming the missing custody is refused by admission as well
    expect(handed.campaign.pcCurrentLocus(PC)).toBeUndefined();
  });

  it("a wrong PC (a different identity that is not the active PC) cannot commit, and neither can an actor that was never a PC", async () => {
    const s = await custodiedCampaign();
    for (const pc_id of [ACTOR_OTHER, "actor-nobody", "pc-x"])
      expect(await refused(s, () => commitMove(s, 1, { pc_id })), pc_id).toBe(
        "PREREQUISITE_MISSING",
      );
  });

  it("a raw commitment for another identity, or whose binding pin names another PC, is refused by admission", async () => {
    const s = await custodiedCampaign();
    const other = rawCommitment(s, 1, (v) => (v.pc_id = ACTOR_OTHER));
    expect(await refused(s, () => rawCommit(s, other))).toBeDefined();
    const wrongSlot = rawCommitment(s, 2, (v) => (v.commitment_id = "pc-move-commitment:other"));
    expect(await refused(s, () => rawCommit(s, wrongSlot))).toBeDefined();
  });
});

describe("no player authority, no commitment (frozen contract §4, §14)", () => {
  it("a commitment is fixed only by role.player + permission.player_choice.commit, supplied and never defaulted", async () => {
    const s = await custodiedCampaign();
    const variants: unknown[] = [
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.player", permission: "permission.canon.write" },
      { role: "role.persona", permission: "permission.player_choice.commit" },
      { role: "role.player" },
      {},
      null,
      undefined,
    ];
    for (const authored_under of variants)
      expect(
        await refused(s, () => commitMove(s, 1, { authored_under })),
        JSON.stringify(authored_under),
      ).toBe("INPUT_INVALID");
  });

  it("the caller cannot smuggle a route, duration, arrival, pins, a request, a delivery boundary or any world result into the commitment", async () => {
    const s = await custodiedCampaign();
    for (const extra of [
      { route: ["l1", DEST_LOCUS_ID] },
      { duration: 10 },
      { arrival: true },
      { result: "SUCCESS" },
      { pinned_versions: { pc: 1 } },
      { request: {} },
      { delivery_at: { unit: "x", value: 1 } },
      { current_locus: DEST_LOCUS_ID },
    ])
      expect(
        await refused(s, () =>
          s.campaign.commitPcVoluntaryMovement({ ...playerCommit(1), ...extra } as never),
        ),
        JSON.stringify(extra),
      ).toBe("INPUT_INVALID");
  });

  it("a raw commitment with a forged authority, persona or extra field is refused; so is a group published under the player's own authority", async () => {
    const s = await custodiedCampaign();
    for (const edit of [
      (v: any) => (v.authored_under.role = "role.archivist"),
      (v: any) => (v.authored_under.permission = "permission.canon.write"),
      (v: any) => delete v.authored_under,
      (v: any) => (v.intent.kind = "FORCED_RELOCATION"),
      (v: any) => (v.intent.duration = 5),
      (v: any) => (v.arrival = { at: 1 }),
      (v: any) => (v.committer.owner = "logistics"),
    ])
      expect(await refused(s, () => rawCommit(s, rawCommitment(s, 1, edit)))).toBeDefined();
    // canonical publication is the archivist's: a group carrying the player's authority is not a canonical write
    const asPlayer = rawCommitment(s, 2, () => undefined, {
      authority: { ...PLAYER_CHOICE_AUTHORITY },
    });
    expect(await refused(s, () => rawCommit(s, asPlayer))).toBe("AUTHORITY_DENIED");
  });
});

describe("the destination must be an established, distinct lawful locus of the PC's own world", () => {
  it("an unknown locus, an unknown world, the PC's own current locus and another world's locus are each refused", async () => {
    const s = await custodiedCampaign();
    expect(await refused(s, () => commitMove(s, 1, { locus_id: "locus-nowhere" }))).toBe(
      "PREREQUISITE_MISSING",
    );
    expect(await refused(s, () => commitMove(s, 2, { world_id: "world-nowhere" }))).toBe(
      "PREREQUISITE_MISSING",
    );
    // where the PC already is: a relocation changes the locus
    expect(await refused(s, () => commitMove(s, 3, { locus_id: "locus-fixture-1" }))).toBeDefined();
    // another established world and its locus: a single-leg movement stays within the PC's world
    await must(
      s.campaign.establishWorld({
        ...publication(901),
        world: { ...fixtureWorld(), world_id: "world-two" },
      }),
    );
    await must(
      s.campaign.establishLocus({
        ...publication(902),
        locus: {
          locus_id: "locus-two",
          world: { fact_key: "world/world-two/profile", entity_id: "world-two" },
          designation: "SYNTHETIC FIXTURE: a locus of another world.",
          constraints: [],
        },
      }),
    );
    expect(
      await refused(s, () => commitMove(s, 4, { world_id: "world-two", locus_id: "locus-two" })),
    ).toBeDefined();
  });

  it("a raw commitment whose destination references do not match their key identities is refused", async () => {
    const s = await custodiedCampaign();
    for (const edit of [
      (v: any) => (v.intent.destination.locus.fact_key = `world/${W}/locus/${OTHER_DEST}`),
      (v: any) => (v.intent.destination.world.fact_key = "world/world-x/profile"),
      (v: any) => (v.intent.destination.locus.entity_id = OTHER_DEST),
    ])
      expect(await refused(s, () => rawCommit(s, rawCommitment(s, 1, edit)))).toBeDefined();
  });
});

describe("forged and stale commitments (every pin must be the exact current version)", () => {
  it("each stale or forged pin is refused: contract, binding, custody, world, locus", async () => {
    const s = await custodiedCampaign();
    for (const pin of ["pc", "binding", "custody", "world", "locus"])
      for (const wrong of [0, 2, 99])
        expect(
          await refused(s, () =>
            rawCommit(
              s,
              rawCommitment(s, 1, (v) => (v.basis.pinned_versions[pin] = wrong)),
            ),
          ),
          `${pin}=${wrong}`,
        ).toBeDefined();
  });

  it("a raw commitment that does not read and depend on what it pins is refused", async () => {
    const s = await custodiedCampaign();
    expect(
      await refused(s, () => rawCommit(s, rawCommitment(s, 1, undefined, { reads: [] }))),
    ).toBe("REFERENCE_INVALID");
    expect(
      await refused(s, () => rawCommit(s, rawCommitment(s, 2, undefined, { depends_on: [] }))),
    ).toBe("REFERENCE_INVALID");
  });
});

describe("the PC-owned request exists only for a committed commitment, and is exactly what it determines", () => {
  it("no request without the commitment-of-record; a request is never created by Logistics or World-State", async () => {
    const s = await custodiedCampaign();
    expect(await refused(s, () => requestMove(s, 1))).toBe("PREREQUISITE_MISSING");
    // a hand-built request for a PC that never committed is refused as well
    const handBuilt = withWrites(
      group(FIXTURE_CAMPAIGN, 7600, [], {
        owner: "pc_existence",
        facet: "pc_voluntary_commitment",
        rule: factKind("pc_movement_request").rule,
      }),
      [
        write(
          pcMovementRequestKey(PC),
          {
            request_id: `pc-move:${PC}`,
            source: { owner: "pc_existence", cause_ref: pcMovementCommitmentKey(PC) },
            subject: { fact_key: worldPcLocusCustodyKey(PC), entity_id: PC },
            destination: {
              world: { fact_key: `world/${W}/profile`, entity_id: W },
              locus: { fact_key: `world/${W}/locus/${DEST_LOCUS_ID}`, entity_id: DEST_LOCUS_ID },
            },
            priority_authority_ref: null,
          } as never,
          { owner: "pc_existence", facet: "pc_voluntary_commitment" },
        ),
      ],
    );
    expect(await refused(s, () => s.campaign.store.commit(handBuilt))).toBeDefined();
  });

  it("every forged request value is refused: another destination, subject, source, id, priority reference, extra field", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    const edits: Record<string, (v: any) => void> = {
      "destination moved": (v) => {
        v.destination.locus.entity_id = OTHER_DEST;
        v.destination.locus.fact_key = `world/${W}/locus/${OTHER_DEST}`;
      },
      "subject moved": (v) => (v.subject.entity_id = ACTOR_OTHER),
      "subject key moved": (v) => (v.subject.fact_key = "world-state/pc/other/locus-custody"),
      "source owner changed": (v) => (v.source.owner = "logistics"),
      "cause moved": (v) => (v.source.cause_ref = "synthetic-need"),
      "request id changed": (v) => (v.request_id = "pc-move:other"),
      "priority authority smuggled": (v) => (v.priority_authority_ref = "priority-1"),
      "route smuggled": (v) => (v.route = []),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await refused(s, () => s.campaign.store.commit(rawRequest(s, 1, edit))),
        name,
      ).toBeDefined();
    // the lawful request still commits afterwards
    await must(requestMove(s, 3));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request must read and depend on the commitment it derives from", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    expect(
      await refused(s, () => s.campaign.store.commit(rawRequest(s, 1, undefined, { reads: [] }))),
    ).toBe("REFERENCE_INVALID");
    expect(
      await refused(s, () =>
        s.campaign.store.commit(rawRequest(s, 2, undefined, { depends_on: [] })),
      ),
    ).toBe("REFERENCE_INVALID");
  });
});

describe("owner exclusivity: the PC-state owner's movement facet is the only writer of its key spaces", () => {
  it("Logistics, World-State, the Temporal kernel, the Role Registry and the PC capability facet cannot write the commitment or the request", async () => {
    const s = await custodiedCampaign();
    const lawful = rawCommitment(s, 1);
    const value = lawful.writes[0]!.value;
    for (const [owner, facet] of [
      ["logistics", "logistics_state"],
      ["world_state", "world_fallback_physical_entity"],
      ["temporal_kernel", "temporal_coordination"],
      ["role_registry", "player_character_binding"],
      ["pc_existence", "pc_capability_profile"],
      ["pc_existence", "existence_contract"],
    ] as const) {
      const g = withWrites(
        lawful,
        [write(pcMovementCommitmentKey(PC), value as never, { owner, facet })],
        { owner, facet },
      );
      expect(await refused(s, () => s.campaign.store.commit(g)), `${owner}/${facet}`).toBeDefined();
    }
  });

  it("the PC-state owner's movement facet cannot write any other key space", async () => {
    const s = await custodiedCampaign();
    const lawful = rawCommitment(s, 1);
    for (const key of [
      "pc/pc-x/existence-contract",
      worldPcLocusCustodyKey(PC),
      logisticsCommitmentKey(W, PC),
      logisticsTransferKey(W, PC),
      worldEntityTransitionKey(W, PC),
      "pc/pc-x/movement/other",
    ]) {
      const g = withWrites(lawful, [
        write(key, lawful.writes[0]!.value as never, {
          owner: "pc_existence",
          facet: "pc_voluntary_commitment",
        }),
      ]);
      expect(await refused(s, () => s.campaign.store.commit(g)), key).toBeDefined();
    }
  });

  it("a sealed commitment and request cannot be amended, overwritten or advanced", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    const amend = rawCommitment(s, 3, (v) => (v.intent.destination.locus.entity_id = OTHER_DEST));
    amend.writes[0]!.expected_version = 1;
    expect(await refused(s, () => s.campaign.store.commit(amend))).toBeDefined();
    const amendRequest = rawRequest(s, 4);
    amendRequest.writes[0]!.expected_version = 1;
    expect(await refused(s, () => s.campaign.store.commit(amendRequest))).toBeDefined();
  });
});

describe("a second journey fails closed under this slice's one-journey constraint (acceptance 8)", () => {
  it("a second commitment, with the same or another destination, is a version conflict — before, during and after the journey", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    expect(await refused(s, () => commitMove(s, 2))).toBe("VERSION_CONFLICT");
    expect(await refused(s, () => commitMove(s, 3, { locus_id: OTHER_DEST }))).toBeDefined();
    await must(requestMove(s, 4));
    expect(await refused(s, () => requestMove(s, 5))).toBe("VERSION_CONFLICT");
    await must(logisticsCommit(s, 6));
    await must(logisticsDispatch(s, 7));
    // while in transfer
    expect(await refused(s, () => commitMove(s, 8))).toBe("VERSION_CONFLICT");
    expect(await refused(s, () => logisticsCommit(s, 9))).toBe("VERSION_CONFLICT");
    expect(await refused(s, () => logisticsDispatch(s, 10))).toBe("VERSION_CONFLICT");
    await registerPcTransfer(s, 11);
    await must(advanceToDelivery(s));
    // after the journey is complete
    expect(await refused(s, () => commitMove(s, 12))).toBe("VERSION_CONFLICT");
    expect(await refused(s, () => commitMove(s, 13, { locus_id: OTHER_DEST }))).toBeDefined();
    expect(await refused(s, () => requestMove(s, 14))).toBe("VERSION_CONFLICT");
    expect(await refused(s, () => logisticsCommit(s, 15))).toBe("VERSION_CONFLICT");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("Logistics cannot be driven out of order: no early dispatch, delivery, destination commit or retirement", () => {
  it("no Logistics commitment without the PC-owned request, no dispatch without a commitment", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    expect(await refused(s, () => logisticsCommit(s, 2))).toBe("PREREQUISITE_MISSING");
    await must(requestMove(s, 3));
    expect(await refused(s, () => logisticsDispatch(s, 4))).toBe("PREREQUISITE_MISSING");
  });

  it("a hand-written retirement or destination commit before the lawful chain exists is refused", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    const t = LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value);
    const commitmentFact = s.logistics.commitment(W, PC)!.fact;
    const transferFact = s.logistics.transfer(W, PC)!.fact;
    const retire = group(
      FIXTURE_CAMPAIGN,
      7300,
      [
        write(
          logisticsCommitmentKey(W, PC),
          {
            ...c,
            state: {
              status: "RELEASED",
              released_at: c.delivery.at,
              destination_commit: { fact_key: worldEntityTransitionKey(W, PC), version: 1 },
              by_stage: {
                causal_process_id: "p",
                owner_operation: { owner: "logistics", operation: "logistics-retire-transfer" },
                prospective_result_id: "r",
              },
            },
          } as never,
          {
            owner: "logistics",
            facet: "logistics_state",
            expected_version: commitmentFact.version,
          },
        ),
        write(
          logisticsTransferKey(W, PC),
          {
            ...t,
            state: {
              status: "RETIRED",
              movement_locus: "CLOSED",
              delivery: { fact_key: "logistics/delivery/w/p", version: 1 },
              destination_commit: { fact_key: worldEntityTransitionKey(W, PC), version: 1 },
              retired_at: c.delivery.at,
              by_stage: {
                causal_process_id: "p",
                owner_operation: { owner: "logistics", operation: "logistics-retire-transfer" },
                prospective_result_id: "r",
              },
            },
          } as never,
          { owner: "logistics", facet: "logistics_state", expected_version: transferFact.version },
        ),
      ],
      { owner: "logistics", facet: "logistics_state", rule: factKind("logistics_commitment").rule },
    );
    expect(await refused(s, () => s.campaign.store.commit(retire))).toBeDefined();
    expect(
      LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value).state.status,
    ).toBe("IN_TRANSFER");
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
  });

  it("a hand-written destination commit for the PC with a forged cause is refused: only its own Logistics delivery moves it", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    const forged = group(
      FIXTURE_CAMPAIGN,
      7400,
      [
        write(
          worldEntityTransitionKey(W, PC),
          {
            transition_id: "transition:delivery:pc-move:actor-smith",
            entity: { fact_key: worldPcLocusCustodyKey(PC), entity_id: PC, version: 1 },
            continuity: {
              relation: "SAME_ENTITY_CONTINUES",
              predecessor: PC,
              successor: PC,
              existence: "CONTINUES",
              form: "UNCHANGED",
              conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
              basis: "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
            },
            locus: {
              from: s.logistics.commitment(W, PC)!.value.origin,
              to: s.logistics.commitment(W, PC)!.value.destination,
            },
            cause: {
              owner: "logistics",
              fact_key: `logistics/delivery/${W}/${PC}`,
              version: 1,
              cause_id: "delivery:pc-move:actor-smith",
            },
            custodian: {
              owner: "world_state",
              facet: "world_fallback_physical_entity",
              basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
            },
            closed_at: s.logistics.commitment(W, PC)!.value.delivery.at,
            close: { name: "Entity Transition Close", stage: {} },
          } as never,
          { owner: "world_state", facet: "world_fallback_physical_entity" },
        ),
      ],
      {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        rule: factKind("world_entity_transition").rule,
      },
    );
    expect(await refused(s, () => s.campaign.store.commit(forged))).toBeDefined();
    expect(s.campaign.pcCurrentLocus(PC)!.authority).toBe("LOGISTICS");
  });
});

describe("the Role Registry binding-time referent and the consumed coupling are never read as current physical truth", () => {
  it("a handed-over PC with no custody has NO current-locus answer: the binding's referent is not a fallback", async () => {
    const handed = await handedOverCampaign();
    expect(handed.campaign.binding()!.value.coupling.locus.entity_id).toBe("locus-fixture-1");
    expect(handed.campaign.existingActorCoupling(PC)).toBeDefined();
    expect(handed.campaign.pcPhysicalLocusCustody(PC)).toBeUndefined();
    expect(handed.campaign.pcCurrentLocus(PC)).toBeUndefined();
  });

  it("the resolver answers from the custody/Logistics/World-State chain only, ignoring the binding's referent in every phase", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    await must(advanceToDelivery(s));
    // the binding still says "origin" while the physical owner says "destination": the answer is the physical owner's
    expect(s.campaign.binding()!.value.coupling.locus.entity_id).toBe("locus-fixture-1");
    expect(s.campaign.pcCurrentLocus(PC)!.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
  });
});

describe("no authority beyond the archivist path is accepted for canonical publication", () => {
  it("the canon write authority is the only authority a canonical group may carry", async () => {
    const s = await custodiedCampaign();
    const g = rawCommitment(s, 1, undefined, {
      authority: { ...CANON_WRITE_AUTHORITY, role: "role.player" },
    });
    expect(await refused(s, () => rawCommit(s, g))).toBe("AUTHORITY_DENIED");
  });
});
