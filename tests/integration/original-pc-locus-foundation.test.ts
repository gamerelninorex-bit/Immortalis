/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary owner fact values */
// Original active-PC qualified physical-locus custody (BLUE v5.1), through the SHIPPED `establish-character-locus` command.
//
// TRUTH LEVEL. Every "host" in this file is a SCRIPTED policy the test wrote (tests/support/original-pc.ts `physicalAnswer`): it reads
// the DELIVERED words and applies the test's regular expressions, so no physical verdict is ever supplied as an input fact: the engine
// asks, vouches for the host, validates the answer against the delivered text, DERIVES the verdict and commits (or refuses) from that.
// These tests prove PLUMBING and ENFORCEMENT only, not that any AI understood any sentence; the live-host evidence is separate
// (docs/evidence/b51-physical-locus-live-host).
import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  REFEREE_AUTHORITY,
  RefereeDecisionRecordSchema,
  pcMovementCommitmentKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE } from "@immortalis/engine";
import { bindHost, refereeDir } from "@immortalis/operator";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  headOf,
  openOrdinary,
  type LocalityDirs,
} from "../support/locality.ts";
import {
  HOST_ID,
  PC_ID,
  STANDARD,
  WORDS,
  author,
  localityCampaign,
  respondingConsole,
  scriptedPolicy,
  type PhysicalRule,
} from "../support/original-pc.ts";
import { boundCampaign, establishLocus, locusConsole } from "../support/original-pc-locus.ts";

const physical = (physicalRule: PhysicalRule) => scriptedPolicy({ physical: physicalRule });
const text = (said: readonly string[]) => said.join("\n");

async function facts(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return {
      all: c.store.listFacts().map((f) => structuredClone(f)),
      custody: c.pcPhysicalLocusCustody(PC_ID),
      binding: structuredClone(c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)),
      verify: c.verify(),
      head: c.store.head(),
    };
  } finally {
    await c.close();
  }
}
const physicalDecisions = (all: { value: unknown }[]) =>
  all.flatMap((f) => {
    const r = RefereeDecisionRecordSchema.safeParse(f.value);
    return r.success && r.data.operation === "IR_PHYSICAL_PLACEMENT" ? [r.data] : [];
  });

describe("positive: an ordinary embodied native character gets ONE canonical stationary physical locus, read back after a fresh open", () => {
  it("world, contract, native statement, referee records and binding exist first; the custody is committed by World-State alone and answers the current locus", async () => {
    const dirs = await boundCampaign();
    const before = await facts(dirs);
    expect(before.custody).toBeUndefined();
    expect(physicalDecisions(before.all)).toHaveLength(0);

    const { result, terminal } = await establishLocus(dirs, locusConsole());
    expect(result.status, JSON.stringify(result.details) + text(terminal.said)).toBe(
      "LOCUS_ESTABLISHED",
    );
    // the physical question was asked of the host, its findings were shown, and the confirmation was a separate third phrase
    const said = text(terminal.said);
    expect(said).toContain("AI REFEREE FINDINGS: PHYSICAL PLACEMENT");
    expect(said).toContain("SINGLE_MATERIAL_BODY");
    expect(said).toContain("CONFIRMATION - PHYSICAL LOCUS");
    expect(said).toMatch(/type exactly "establish-character-locus [0-9a-f]{12}"/);

    const after = await facts(dirs);
    expect(after.verify).toEqual([]);
    // exactly two new facts: the immutable physical-placement decision and the one custody; nothing else changed
    expect(after.head.revision).toBe(before.head.revision + 2);
    const byKey = new Map(before.all.map((f) => [f.key, f]));
    const added = after.all.filter((f) => !byKey.has(f.key)).map((f) => f.key);
    expect(added.sort()).toEqual(
      [
        worldPcLocusCustodyKey(PC_ID),
        expect.stringMatching(/^referee\/[0-9a-f]{64}\/decision$/),
      ].sort(),
    );
    for (const f of before.all)
      expect(
        after.all.find((x) => x.key === f.key),
        f.key,
      ).toEqual(f);
    // the binding keeps its serialization, version and receipt: it is a binding-time referent, not the current position
    expect(after.binding).toEqual(before.binding);

    const custody = after.custody!;
    expect(custody.value.pc_id).toBe(PC_ID);
    expect(custody.value.stationary_locus.world.entity_id).toBe(WORLD_ID);
    expect(custody.value.stationary_locus.locus.entity_id).toBe(LOCUS_ID);
    expect(custody.value.basis.established_from).toBe("ACTIVATION");
    expect(custody.value.custodian).toEqual({
      owner: "world_state",
      facet: "world_fallback_physical_entity",
      basis: expect.any(String),
    });
    expect(custody.fact.owner).toBe("world_state");
    expect(custody.fact.version).toBe(1);
    // under its own, exclusive governing citation
    expect(custody.fact.provenance.rule).toEqual(WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE);

    // the qualification is two retained, engine-derived referee records; the verdicts are derived, never submitted
    const basis = custody.value.basis;
    if (basis.established_from !== "ACTIVATION") throw new Error("unreachable");
    const [phys] = physicalDecisions(after.all);
    expect(phys!.verdict).toBe("PHYSICAL_ELIGIBLE");
    expect(phys!.authority).toEqual(REFEREE_AUTHORITY);
    expect(phys!.host.host_id).toBe(HOST_ID);
    expect(basis.qualified_by.physical.fact_key).toBe(`referee/${phys!.task_id}/decision`);
    const native = after.all.find((f) => f.key === basis.qualified_by.native.fact_key)!;
    expect((native.value as any).operation).toBe("IR_NATIVE_COMPATIBILITY");
    expect((native.value as any).verdict).toBe("BIND_ELIGIBLE");
    // the physical record cites the contract, the binding, the world and the locus at the custody's pins
    expect(phys!.input.refs.map((r) => r.version)).toEqual([
      basis.pinned_versions.pc,
      basis.pinned_versions.binding,
      basis.pinned_versions.world,
      basis.pinned_versions.locus,
    ]);
    expect(phys!.input.statement).toBe(WORDS.presence);
    // the custody group is an ordinary archivist publication (the host's role.gm is applied to the DECISION, not the physical write)
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const g = c.store.committedGroup(custody.fact.provenance.intent_id)!;
      expect(g.authority).toEqual({ role: "role.archivist", permission: "permission.canon.write" });
      expect(g.writes).toHaveLength(1);
      // the answer to "where is the PC now" comes from the custody alone
      expect(c.pcCurrentLocus(PC_ID)?.stationary?.locus.entity_id).toBe(LOCUS_ID);
      expect(c.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
    } finally {
      await c.close();
    }
  }, 120_000);

  it("running the command again reports the verified custody and writes nothing (identical retry converges, no second placement, no re-refereeing)", async () => {
    const dirs = await boundCampaign();
    const first = await establishLocus(dirs, locusConsole());
    expect(first.result.status).toBe("LOCUS_ESTABLISHED");
    const head = await headOf(dirs.campaignDir);
    const again = await establishLocus(dirs, locusConsole(), {}, null);
    expect(again.result.status).toBe("LOCUS_ESTABLISHED");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("character-status of the bound character names the custody this later command made", async () => {
    const dirs = await boundCampaign();
    await establishLocus(dirs, locusConsole());
    const { characterStatus } = await import("@immortalis/operator");
    const { LocalOperatorSession } = await import("@immortalis/operator");
    const opened = await LocalOperatorSession.open({
      campaignDir: dirs.campaignDir,
      expectedCampaignId: LOCALITY_CAMPAIGN,
      operatorDir: dirs.operatorDir,
    });
    if (!opened.ok) throw new Error("did not open");
    try {
      const r = await characterStatus(opened.value, dirs.operatorDir);
      expect(r.status).toBe("CHARACTER_BOUND");
      expect(r.details.join("\n")).toContain("made by establish-character-locus");
    } finally {
      await opened.value.close();
    }
  }, 120_000);
});

describe("the player's separate confirmation: no physical fact exists before it", () => {
  it("a declined confirmation leaves the campaign byte-for-byte as it was (no decision record, no custody)", async () => {
    const dirs = await boundCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await establishLocus(dirs, locusConsole(false));
    expect(result.status).toBe("DECLINED");
    expect(text(terminal.said)).toContain("SINGLE_MATERIAL_BODY");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("end of input at the confirmation also changes nothing", async () => {
    const dirs = await boundCampaign();
    const before = await headOf(dirs.campaignDir);
    const eof = respondingConsole({ override: { ">": null } });
    const { result } = await establishLocus(dirs, eof);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);
});

describe("falsifying contrasts: the same binding and world, without an independently qualified physical single-locus reading, hold NO physical fact", () => {
  const refused = async (
    build: Parameters<typeof boundCampaign>[0],
    rule: PhysicalRule,
    expectIn: RegExp,
  ) => {
    const dirs = await boundCampaign(build);
    const before = await facts(dirs);
    const { result, terminal } = await establishLocus(dirs, locusConsole(), {}, physical(rule));
    expect(result.status, JSON.stringify(result.details)).toBe("LOCUS_NOT_QUALIFIED");
    expect(text(terminal.said)).toMatch(expectIn);
    // the confirmation was never offered, and nothing was written: no custody, no physical decision
    expect(text(terminal.said)).not.toMatch(/type exactly "establish-character-locus/);
    expect(terminal.asked()).toBe(0);
    const after = await facts(dirs);
    expect(after.custody).toBeUndefined();
    expect(physicalDecisions(after.all)).toHaveLength(0);
    expect(after.head).toEqual(before.head);
    return result;
  };

  it("an incorporeal character (the form is read from the character's own statement)", async () => {
    const r = await refused(
      { responder: { ...STANDARD, override: { "embodiment>": "A drifting spirit with no body" } } },
      { embodiment: { match: /drifting spirit with no body/, mode: "INCORPOREAL" } },
      /INCORPOREAL/,
    );
    expect(r.details.join("\n")).toContain("NOT_PHYSICAL_SINGLE_LOCUS");
  }, 120_000);

  for (const [name, statement, mode] of [
    ["coextensive with the world", "I am the whole marsh itself", "TOTAL_DOMAIN_COEXTENSIVE"],
    ["several same-agency bodies", "Nine bodies that share one mind", "SEVERAL_SAME_AGENCY_BODIES"],
    ["a distributed substrate", "A swarm of tide-flies acting as one", "DISTRIBUTED_SUBSTRATE"],
    ["no current body", "I have no body at present", "NO_CURRENT_BODY"],
  ] as const)
    it(`${name}: not one material body`, async () => {
      await refused(
        { responder: { ...STANDARD, override: { "embodiment>": statement } } },
        { embodiment: { match: new RegExp(statement), mode } },
        new RegExp(mode),
      );
    }, 120_000);

  it("an ambiguous embodiment is unresolved and the host's one question is put to the player, with no confirmation", async () => {
    await refused(
      { responder: { ...STANDARD, override: { "embodiment>": "Something like a body, perhaps" } } },
      { embodiment: { match: /Something like a body, perhaps/, mode: "AMBIGUOUS" } },
      /question for you/,
    );
  }, 120_000);

  it("a presence somewhere else than the established locus (the native/compatibility reading cannot see this; the physical one does)", async () => {
    await refused(
      {
        responder: { ...STANDARD, presence: "I have always lived in the far hill-town of Karth." },
      },
      { presence: { match: /far hill-town of Karth/, mode: "ELSEWHERE" } },
      /ELSEWHERE/,
    );
  }, 120_000);

  it("a presence in several places, in no place, or by arrival", async () => {
    for (const [statement, match, mode] of [
      [
        "I have always lived at the salt pans and at the harbour both.",
        /salt pans and at the harbour both/,
        "SEVERAL_LOCI",
      ],
      ["I have always been, though not anywhere.", /not anywhere/, "NON_SPATIAL"],
      [
        "I walked in from the hills at dawn and now stand at the salt pans.",
        /walked in from the hills/,
        "BRIDGE_OR_ARRIVAL",
      ],
    ] as const)
      await refused(
        { responder: { ...STANDARD, presence: statement } },
        { presence: { match, mode } },
        new RegExp(mode),
      );
  }, 240_000);

  it("a presence that rests on an independent actor's consent or an external right", async () => {
    for (const [statement, match, kind] of [
      [
        "I have always lived at the salt pans, where the harbour guard has agreed to let me stay.",
        /the harbour guard has agreed to let me stay/,
        "INDEPENDENT_ACTOR_COOPERATION",
      ],
      [
        "I have always lived at the salt pans, by right of the pan-master's lease.",
        /by right of the pan-master's lease/,
        "EXTERNAL_RIGHT_OR_ACCESS",
      ],
    ] as const)
      await refused(
        { responder: { ...STANDARD, presence: statement } },
        { claim: { match, kind, bearing: "CONTINGENT" } },
        new RegExp(kind),
      );
  }, 240_000);

  it("a committed world constraint that excludes a material body at that locus", async () => {
    const r = await refused(
      {
        mutate: (doc) => {
          doc.world.insertion_supporting_constraints = [
            {
              aspect: "matter",
              statement: "Nothing material can exist here; only wind-spirits dwell in this marsh.",
            },
          ];
        },
      },
      { contradicts: /Nothing material can exist here/ },
      /CONTRADICTS/,
    );
    expect(r.details.join("\n")).toContain("PHYSICAL_WORLD_CONFLICT");
  }, 120_000);

  it("a world fact the host cannot read is unresolved and asks its question", async () => {
    await refused(
      {
        mutate: (doc) => {
          doc.world.insertion_supporting_constraints = [
            { aspect: "matter", statement: "What the marsh permits to stand is not settled." },
          ];
        },
      },
      { unclear: /not settled/ },
      /UNCLEAR/,
    );
  }, 120_000);
});

describe("preconditions: only a verified character this command's path released AND bound can be placed", () => {
  it("no character", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result } = await establishLocus(dirs, locusConsole(), {}, null);
    expect(result.status).toBe("CHARACTER_NONE");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("another character identity", async () => {
    const dirs = await boundCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result } = await establishLocus(dirs, locusConsole(), { pcId: "pc-other" }, null);
    expect(result.status).toBe("CHARACTER_NONE");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a released but unbound character (placement was never confirmed): no physical question is even asked", async () => {
    const dirs = await localityCampaign();
    const authored = await author(dirs, respondingConsole({ ...STANDARD, skipPlace: true }));
    expect(authored.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await establishLocus(dirs, locusConsole(), {}, null);
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a portal/arrival statement never binds, so it never reaches the physical question", async () => {
    const dirs = await localityCampaign();
    const authored = await author(
      dirs,
      respondingConsole({
        ...STANDARD,
        presence: "I arrived at the salt pans yesterday through a portal.",
      }),
      {},
      scriptedPolicy({ ir: { bridge: { match: /through a portal/, mode: "PORTAL" } } }),
    );
    expect(authored.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const { result } = await establishLocus(dirs, locusConsole(), {}, null);
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
  }, 120_000);
});

describe("the referee seam fails closed for the physical question", () => {
  it("no host bound: nothing is asked of the player and nothing is written", async () => {
    const dirs = await boundCampaign();
    rmSync(refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }), {
      recursive: true,
    });
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await establishLocus(dirs, locusConsole(), {}, null);
    expect(result.status).toBe("REFEREE_UNAVAILABLE");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a host bound only to the two earlier operations cannot answer the physical question: PENDING, never a verdict", async () => {
    const dirs = await boundCampaign();
    rmSync(refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }), {
      recursive: true,
    });
    const bound = await bindHost({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: HOST_ID,
      operations: ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY"],
    });
    expect(bound.ok).toBe(true);
    const before = await headOf(dirs.campaignDir);
    const { result } = await establishLocus(dirs, locusConsole(), {
      refereePolls: 2,
      refereePollMs: 1,
    });
    expect(result.status).toBe("REFEREE_PENDING");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a silent host is PENDING; the same question is found again, with the answer it later receives", async () => {
    const dirs = await boundCampaign();
    const before = await headOf(dirs.campaignDir);
    const silent = await establishLocus(
      dirs,
      locusConsole(),
      { refereePolls: 2, refereePollMs: 1 },
      null,
    );
    expect(silent.result.status).toBe("REFEREE_PENDING");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
    const later = await establishLocus(dirs, locusConsole());
    expect(later.result.status).toBe("LOCUS_ESTABLISHED");
  }, 120_000);

  it("an answer that quotes words which are not in the delivered text is set aside and asked again; the later valid answer is the one used", async () => {
    const dirs = await boundCampaign();
    let first = true;
    const { result } = await establishLocus(dirs, locusConsole(), {}, (doc) => {
      const a = scriptedPolicy()(doc) as any;
      if (doc["operation"] === "IR_PHYSICAL_PLACEMENT" && first) {
        first = false;
        a.embodiment.evidence_quote = "words nobody wrote";
      }
      return a;
    });
    expect(result.status).toBe("LOCUS_ESTABLISHED");
  }, 120_000);
});

describe("the post-handover consumers do not take an original-activation custody", () => {
  it("voluntary movement and the stationary active-PC target advance stay limited to the handover branch", async () => {
    const dirs = await boundCampaign();
    await establishLocus(dirs, locusConsole());
    const { pcMovementCommitmentViolation, derivePcMovementCommitment } =
      await import("@immortalis/engine");
    const { PLAYER_CHOICE_AUTHORITY } = await import("@immortalis/contracts");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const facts = new Map(c.store.listFacts().map((f) => [f.key, f]));
      const commitment = derivePcMovementCommitment(
        {
          pc_id: PC_ID,
          destination: { world_id: WORLD_ID, locus_id: "locus-elsewhere" },
          authored_under: { ...PLAYER_CHOICE_AUTHORITY },
        },
        c.store,
      );
      if (!commitment.ok) throw new Error("unreachable");
      const why = pcMovementCommitmentViolation(
        pcMovementCommitmentKey(PC_ID),
        commitment.value,
        facts,
      );
      expect(why).toMatch(/limited to the post-handover branch/);
    } finally {
      await c.close();
    }
  }, 120_000);
});

describe("a claim stated BESIDE an independently established presence is not accepted, and does not defeat the custody (BLUE hold on 792a42e)", () => {
  const OATH = "the harbour guard has sworn to let me stay and to protect me there";
  const PRESENCE_ONLY = "I am originally present at the salt pans of Ashfall Marsh";
  const withOath = `I have always lived here: ${PRESENCE_ONLY}, and ${OATH}.`;
  const conjunctive = (match: RegExp, kind: string): PhysicalRule => ({
    claim: { match, kind, bearing: "CONJUNCTIVE", presenceQuote: new RegExp(PRESENCE_ONLY) },
  });

  it("the guard's oath is retained as an unaccepted claim; the custody holds ONLY the locus and nothing of the guard", async () => {
    const dirs = await boundCampaign({ responder: { ...STANDARD, presence: withOath } });
    const before = await facts(dirs);
    const { result, terminal } = await establishLocus(
      dirs,
      locusConsole(),
      {},
      physical(conjunctive(new RegExp(OATH), "INDEPENDENT_ACTOR_COOPERATION")),
    );
    expect(result.status, JSON.stringify(result.details) + text(terminal.said)).toBe(
      "LOCUS_ESTABLISHED",
    );
    const said = text(terminal.said);
    // the player is told, twice, that the claim is not accepted and not committed
    expect(said).toContain("NOT ACCEPTED, NOT COMMITTED");
    expect(said).toContain("NOT recorded or accepted by this confirmation");
    expect(said).toContain(OATH);

    const after = await facts(dirs);
    expect(after.verify).toEqual([]);
    expect(after.head.revision).toBe(before.head.revision + 2);
    const [phys] = physicalDecisions(after.all);
    expect(phys!.verdict).toBe("PHYSICAL_ELIGIBLE");
    // the retained decision is the reviewable record of exactly what was read and refused to accept
    expect(phys!.decision.external_claims).toHaveLength(1);
    expect(phys!.decision.external_claims[0]!.bearing).toBe("CONJUNCTIVE");
    expect(phys!.decision.presence.evidence_quote).toBe(PRESENCE_ONLY);
    expect(phys!.decision.presence.evidence_quote).not.toContain("guard");
    // nothing about the guard is committed by the custody, the world, the locus or the contract
    const custody = after.custody!;
    expect(JSON.stringify(custody.value)).not.toMatch(/guard|sworn|protect|stay/i);
    expect(custody.value.stationary_locus.locus.entity_id).toBe(LOCUS_ID);
    for (const f of after.all.filter(
      (x) => x.owner !== "referee_adjudication_kernel" && x.key !== PLAYER_CHARACTER_BINDING_KEY,
    ))
      expect(JSON.stringify(f.value), f.key).not.toMatch(/harbour guard|sworn/i);
    // the binding is exactly what the earlier, separately confirmed command wrote
    expect(after.binding).toEqual(before.binding);
    // no actor, relation or state of the guard exists anywhere in canon
    expect(after.all.filter((f) => f.owner === "named_actor")).toEqual([]);
  }, 120_000);

  it("an external RIGHT stated beside the presence is likewise not accepted", async () => {
    const statement = `I have always lived here: ${PRESENCE_ONLY}, and I hold the pan-master's lease on the first pan.`;
    const dirs = await boundCampaign({ responder: { ...STANDARD, presence: statement } });
    const { result, terminal } = await establishLocus(
      dirs,
      locusConsole(),
      {},
      physical(
        conjunctive(/I hold the pan-master's lease on the first pan/, "EXTERNAL_RIGHT_OR_ACCESS"),
      ),
    );
    expect(result.status).toBe("LOCUS_ESTABLISHED");
    expect(text(terminal.said)).toContain("NOT ACCEPTED, NOT COMMITTED");
    const after = await facts(dirs);
    expect(JSON.stringify(after.custody!.value)).not.toMatch(/lease|pan-master/i);
  }, 120_000);

  it("contrast: the SAME guard, but the presence is stated to hold only through its leave, is contingent and refused with nothing written", async () => {
    const statement =
      "I am originally present at the salt pans of Ashfall Marsh only because the harbour guard lets me stay there by its leave.";
    const dirs = await boundCampaign({ responder: { ...STANDARD, presence: statement } });
    const before = await facts(dirs);
    const { result, terminal } = await establishLocus(
      dirs,
      locusConsole(),
      {},
      physical({
        claim: {
          match: /only because the harbour guard lets me stay there by its leave/,
          kind: "INDEPENDENT_ACTOR_COOPERATION",
          bearing: "CONTINGENT",
        },
      }),
    );
    expect(result.status).toBe("LOCUS_NOT_QUALIFIED");
    expect(text(terminal.said)).toContain("hold only through something outside you");
    expect(text(terminal.said)).not.toContain("NOT ACCEPTED, NOT COMMITTED");
    expect(terminal.asked()).toBe(0);
    const after = await facts(dirs);
    expect(after.custody).toBeUndefined();
    expect(physicalDecisions(after.all)).toHaveLength(0);
    expect(after.head).toEqual(before.head);
  }, 120_000);

  it("a host that calls a claim conjunctive while its presence quotation contains the claim is set aside and asked again; the grounded answer is the one used", async () => {
    const dirs = await boundCampaign({ responder: { ...STANDARD, presence: withOath } });
    let first = true;
    const policy = (doc: Record<string, any>) => {
      const a = scriptedPolicy(
        physicalOnly(conjunctive(new RegExp(OATH), "INDEPENDENT_ACTOR_COOPERATION")),
      )(doc) as any;
      if (doc["operation"] === "IR_PHYSICAL_PLACEMENT" && first) {
        first = false;
        a.presence.evidence_quote = doc["context"].statement; // the claim is inside the words said to establish the presence
      }
      return a;
    };
    const { result } = await establishLocus(dirs, locusConsole(), {}, policy);
    expect(result.status).toBe("LOCUS_ESTABLISHED");
    const after = await facts(dirs);
    expect(physicalDecisions(after.all)[0]!.decision.presence.evidence_quote).toBe(PRESENCE_ONLY);
  }, 120_000);
});

const physicalOnly = (p: PhysicalRule) => ({ physical: p });
