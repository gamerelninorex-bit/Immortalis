import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Existing-Actor Capability → PC Capability Carry-Forward — save → close → load → continue preserves the same result and the same
// ownership story at every durable cut (the handed-over actor, the received carry-forward basis, the published PC capability),
// converging on the uninterrupted run; a lost reply or a crash converges by identity (RC-16); and a loaded campaign whose
// carry-forward was tampered with, or was built outside admission (a post-handover actor source, an altered marker, a fabricated
// or stale reference), fails closed with a precise integrity code. The slice adds no persistence path: the basis is one ordinary
// OwnerFact, so the existing journal, receipts, replay and package integrity are the ones in force.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-02, IM-03, IM-07, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  NAMED_ACTOR_RULE,
  PcCapabilityAdapter,
  deriveCapability,
  openFileCampaign,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  capabilityBasis,
  group,
  write,
} from "@immortalis/testkit";
import {
  carryForward,
  carryInput,
  closePcCapability,
  establishActorBasis,
  existingActorSummary,
  handoverActor,
  rawCarryBasis,
  readyForCarryForward,
  reopenExistingActor,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const sourceKey = actorCapabilityKey(A, C);
const basisKey = pcCapabilityBasisKey(A, C);
const capKey = pcCapabilityKey(A, C);

type UpTo = "ready" | "handed" | "carried" | "closed";
/** The uninterrupted lifecycle: authoritative actor capability, handover, carry-forward, PC Capability Close. */
async function lifecycle(s: ExistingActorSeeded, upTo: UpTo) {
  await readyForCarryForward(s);
  if (upTo === "ready") return;
  await must(handoverActor(s, 1));
  if (upTo === "handed") return;
  await must(carryForward(s, 1));
  if (upTo === "carried") return;
  await closePcCapability(s, 20);
}

async function referenceRun() {
  const s = await seededExistingActorCampaign(tempDir());
  await lifecycle(s, "closed");
  const head = s.campaign.store.head();
  const summary = existingActorSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};

/** The ownership story, at any cut, before or after a reload: one writer, never two, never none; the predecessor is cold. */
async function expectOwnership(s: ExistingActorSeeded, upTo: UpTo) {
  expect(s.campaign.verify()).toEqual([]);
  const handed = upTo !== "ready";
  const head = s.campaign.store.head();
  const write = await s.actors.establishCapabilityBasis({
    group_id: "probe-group",
    intent_id: "probe-intent",
    cause: "probe-cause",
    basis: "fixture-basis",
    secrecy: "fixture-visibility",
    capability: capabilityBasis(A, "capability-probe"),
  });
  if (handed) {
    expect(!write.ok && write.error.code).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
  } else {
    expect(write.ok).toBe(true);
    return;
  }
  // the predecessor stays committed, immutable cold provenance
  expect(s.campaign.store.getFact(sourceKey)).toMatchObject({ owner: "named_actor", version: 1 });
  expect(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))).toMatchObject({ version: 1 });
  const carried = upTo === "carried" || upTo === "closed";
  expect(s.pcs.basis(A, C) !== undefined).toBe(carried);
  expect(s.pcs.capability(A, C) !== undefined).toBe(upTo === "closed");
  if (carried) {
    expect(s.pcs.basis(A, C)!.value.establishment.method).toBe("EXISTING_ACTOR_CARRY_FORWARD");
    expect(s.pcs.basis(A, C)!.value.marker).toBe(s.actors.capability(A, C)!.value.marker);
  }
  if (upTo === "closed") {
    expect(s.pcs.capability(A, C)!.value.marker).toBe(s.actors.capability(A, C)!.value.marker);
    expect(s.pcs.capability(A, C)!.fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_capability_profile",
    });
  }
}

describe("save → close → load → continue preserves the carry-forward at every durable cut", () => {
  const cuts: { name: string; upTo: UpTo }[] = [
    {
      name: "actor capability authoritative, compiled and coupled, not yet handed over",
      upTo: "ready",
    },
    { name: "handed over, nothing carried yet", upTo: "handed" },
    { name: "carried forward, the PC Capability Close not yet resolved", upTo: "carried" },
    { name: "the PC Capability Close published", upTo: "closed" },
  ];
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, keeps the same ownership result, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededExistingActorCampaign(dir);
      await lifecycle(s, cut.upTo);
      const before = existingActorSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenExistingActor(dir);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(before);
      expect(r.campaign.verify()).toEqual([]);
      await expectOwnership(r, cut.upTo);
      if (cut.upTo === "ready") {
        // the probe above committed a pre-cutover actor write the reference never made: judge only the ownership result
        await must(handoverActor(r, 1));
        await must(carryForward(r, 1));
        await closePcCapability(r, 20);
        expect(r.pcs.capability(A, C)!.value.marker).toBe("C");
        await r.campaign.close();
        return;
      }
      if (cut.upTo === "handed") await must(carryForward(r, 1));
      else expect((await must(carryForward(r, 1))).replayed).toBe(true);
      if (cut.upTo !== "closed") await closePcCapability(r, 20);
      same(r.campaign.store.head(), ref.head);
      expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      await r.campaign.close();
    });
  }

  it("the carried basis, the published capability and the predecessor survive two reloads byte-for-byte with provenance and receipts", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "closed");
    const keys = [
      basisKey,
      capKey,
      sourceKey,
      actorCapabilityBasisKey(A, C),
      PLAYER_CHARACTER_BINDING_KEY,
    ];
    const facts = keys.map((k) => structuredClone(s.campaign.store.getFact(k)!));
    const receipts = facts.map((f) => s.campaign.store.lookupReceipt(f.provenance.intent_id)!);
    await s.campaign.close();
    for (const round of [1, 2]) {
      const r = await reopenExistingActor(dir, `existing-actor-reopen-${round}`);
      expect(keys.map((k) => r.campaign.store.getFact(k))).toEqual(facts);
      expect(facts.map((f) => r.campaign.store.lookupReceipt(f.provenance.intent_id))).toEqual(
        receipts,
      );
      await expectOwnership(r, "closed");
      await r.campaign.close();
    }
  });

  it("after a reload the carried capability is adopted, never recomputed or re-received: a replay is a no-op, a second carry is refused, no draw is made", async () => {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, "closed");
    await s.campaign.close();
    const r = await reopenExistingActor(dir);
    const head = r.campaign.store.head();
    expect((await must(carryForward(r, 1))).replayed).toBe(true);
    expect((await r.pcs.carryForwardActorCapability(carryInput(2))).ok).toBe(false);
    expect(r.campaign.store.head()).toEqual(head);
    expect(r.entropy.calls()).toBe(0);
    await r.campaign.close();
  });
});

describe("a lost reply or a crash converges by identity (RC-16)", () => {
  /** A PC adapter whose store commits the carry-forward group and then loses the reply, or crashes before committing it. */
  const faulty = (inner: CampaignStore, mode: "lost" | "crash"): CampaignStore => ({
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: CommitGroup) => {
      if (!g.writes.some((w) => w.key === basisKey)) return inner.commit(g);
      if (mode === "crash")
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never;
      await inner.commit(g);
      return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never;
    },
  });

  it("the carry-forward committed with the reply lost is reconciled by identity: replayed, never a second basis", async () => {
    const ref = await referenceRun();
    const s = await seededExistingActorCampaign(tempDir());
    await lifecycle(s, "handed");
    const lostAdapter = new PcCapabilityAdapter(faulty(s.campaign.store, "lost"));
    const lost = await lostAdapter.carryForwardActorCapability(carryInput(1));
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    const committed = structuredClone(s.campaign.store.getFact(basisKey)!);
    const head = s.campaign.store.head();
    const retry = await must(carryForward(s, 1));
    expect(retry.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(basisKey)).toEqual(committed);
    await closePcCapability(s, 20);
    same(s.campaign.store.head(), ref.head);
    await expectOwnership(s, "closed");
    await s.campaign.close();
  });

  it("a crash before the commit leaves no trace, and the retry under the same identity then commits and converges", async () => {
    const ref = await referenceRun();
    const s = await seededExistingActorCampaign(tempDir());
    await lifecycle(s, "handed");
    const head = s.campaign.store.head();
    const crashed = await new PcCapabilityAdapter(
      faulty(s.campaign.store, "crash"),
    ).carryForwardActorCapability(carryInput(1));
    expect(!crashed.ok && crashed.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.pcs.basis(A, C)).toBeUndefined();
    expect((await must(carryForward(s, 1))).replayed).toBe(false);
    await closePcCapability(s, 20);
    same(s.campaign.store.head(), ref.head);
    await s.campaign.close();
  });

  it("a carry-forward refused at admission leaves no trace, and the corrected publication under the same identity then commits", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await lifecycle(s, "ready");
    const head = s.campaign.store.head();
    // before the handover: refused (no cutover), nothing written
    expect((await carryForward(s, 1)).ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(handoverActor(s, 1));
    await must(carryForward(s, 1));
    expect(s.pcs.basis(A, C)!.fact.version).toBe(1);
    await expectOwnership(s, "carried");
  });
});

describe("load fails closed on a corrupted saved carry-forward", () => {
  async function saved(upTo: UpTo = "closed"): Promise<string> {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await lifecycle(s, upTo);
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const violations = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return [] as { code: string; message: string }[];
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string; message: string }[])
      : [{ code: r.error.code, message: r.error.message }];
  };
  const openOutcome = async (dir: string) => {
    const v = await violations(dir);
    return v.length === 0 ? "OK" : v.map((x) => x.code).join(",");
  };
  const edit = async (upTo: UpTo, change: (j: any) => void) => {
    const dir = await saved(upTo);
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    change(j);
    writeFileSync(p, JSON.stringify(j));
    return dir;
  };
  const fact = (j: any, key: string) => j.facts.find((f: any) => f.key === key);

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
    expect(await openOutcome(await saved("carried"))).toBe("OK");
  });

  it("an edit of the saved carry-forward basis — marker, method, pins, references, extras — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "marker regraded": (f) => (f.value.marker = "S"),
      "marker dropped to null": (f) => (f.value.marker = null),
      "marker EX invented": (f) => (f.value.marker = { ex: "invented" }),
      "downgraded to generation history": (f) =>
        (f.value.establishment = {
          method: "ACCEPTED_GENERATION_HISTORY",
          contract: { fact_key: "pc/actor-smith/existence-contract", version: 1 },
          claims: [{ section: "identity_agency", index: 0 }],
        }),
      "handover version moved": (f) => (f.value.establishment.handover.version = 2),
      "source version moved": (f) => (f.value.establishment.source.version = 2),
      "source moved to the basis": (f) =>
        (f.value.establishment.source.fact_key = actorCapabilityBasisKey(A, C)),
      "source moved to another capability": (f) =>
        (f.value.establishment.source.fact_key = actorCapabilityKey(A, D)),
      "source moved to another identity": (f) =>
        (f.value.establishment.source.fact_key = actorCapabilityKey("actor-other", C)),
      "marker smuggled into the establishment": (f) => (f.value.establishment.marker = "C"),
      "prior smuggled in": (f) => (f.value.establishment.prior = []),
      "pc identity moved": (f) => (f.value.pc_id = "actor-other"),
      "owner changed": (f) => (f.owner = "named_actor"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
    };
    for (const [name, change] of Object.entries(edits)) {
      const dir = await edit("carried", (j) => change(fact(j, basisKey)));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of the published PC capability — marker, basis pointer, close — is not accepted", async () => {
    const edits: Record<string, (f: any) => void> = {
      "marker regraded": (f) => (f.value.marker = "S"),
      "basis pointer moved": (f) => (f.value.basis.version = 2),
      "close renamed": (f) => (f.value.close.name = "actor-profile-capability-close"),
      "close stage moved": (f) => (f.value.close.stage.causal_process_id = "elsewhere"),
      "establishment smuggled in": (f) =>
        (f.value.establishment = { method: "EXISTING_ACTOR_CARRY_FORWARD" }),
    };
    for (const [name, change] of Object.entries(edits)) {
      const dir = await edit("closed", (j) => change(fact(j, capKey)));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of what the carry-forward cites — the actor's capability, the binding, the contract — is not accepted", async () => {
    const edits: Record<string, (j: any) => void> = {
      "actor capability marker changed": (j) => (fact(j, sourceKey).value.marker = "S"),
      "actor capability removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== sourceKey)),
      "binding downgraded to a first ACTIVATION": (j) => {
        const b = fact(j, PLAYER_CHARACTER_BINDING_KEY);
        b.value.transition = { type: "ACTIVATION", basis: {} };
        b.value.intrinsic_authority_migration = [];
      },
      "binding removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY)),
      "binding version moved": (j) => (fact(j, PLAYER_CHARACTER_BINDING_KEY).version = 2),
      "contract classification removed": (j) =>
        delete fact(j, "pc/actor-smith/existence-contract").value.existing_actor_compilation,
    };
    for (const [name, change] of Object.entries(edits)) {
      const dir = await edit("carried", change);
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("removing the saved carry-forward basis while keeping the published capability fails: a capability never exists without its basis", async () => {
    const dir = await edit(
      "closed",
      (j) => (j.facts = j.facts.filter((f: any) => f.key !== basisKey)),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a journal edit of the carry-forward's committed group fails replay", async () => {
    const dir = await saved("carried");
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("EXISTING_ACTOR_CARRY_FORWARD");
    writeFileSync(journal, text.replace('"marker":"C"', '"marker":"S"'));
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});

describe("load verification proves the carry-forward from committed history alone, including histories built outside admission", () => {
  /**
   * A lawful package up to the handover (an authoritative C, a basis-only D), reopened as a store with NO admission, to which a
   * test appends what no lawful path could write.
   */
  async function rogue(
    append: (s: CampaignStore, ctx: { carried: boolean }) => Promise<void>,
  ): Promise<{ dir: string; violations: { code: string; message: string }[] }> {
    const dir = tempDir();
    const s = await seededExistingActorCampaign(dir);
    await readyForCarryForward(s);
    await establishActorBasis(s, 3, A, D);
    await must(handoverActor(s, 1));
    await s.campaign.close();
    const store = await must(
      openFileCampaign(dir, {
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
      }),
    );
    await append(store, { carried: false });
    await store.close();
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return { dir, violations: [] };
    }
    return {
      dir,
      violations:
        r.error.code === "CANON_INTEGRITY"
          ? (r.error.details?.["violations"] as { code: string; message: string }[])
          : [{ code: r.error.code, message: r.error.message }],
    };
  }
  const via = (store: CampaignStore) =>
    ({ campaign: { store } }) as unknown as Pick<ExistingActorSeeded, "campaign">;
  /** The actor-side capability of D as the actor owner's close would write it, appended AFTER the cutover. */
  const lateActorCapability = (store: CampaignStore, n: number): CommitGroup => {
    const basis = store.getFact(actorCapabilityBasisKey(A, D))!;
    const derived = deriveCapability({
      key: basis.key,
      owner: basis.owner,
      version: basis.version,
      value: basis.value as never,
    });
    if (!derived.ok) throw new Error("fixture");
    return group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(actorCapabilityKey(A, D), derived.value as never, {
          owner: "named_actor",
          facet: "actor_profile",
        }),
      ],
      {
        owner: "named_actor",
        facet: "actor_profile",
        rule: NAMED_ACTOR_RULE,
        reads: [{ key: basis.key, version: basis.version }],
        depends_on: [basis.provenance.group_id],
      },
    );
  };

  it("a carried actor capability committed AFTER the handover — the post-cutover source — fails the open at the PC verifier", async () => {
    const { violations } = await rogue(async (store) => {
      await must(store.commit(lateActorCapability(store, 900)));
      await must(store.commit(rawCarryBasis(via(store), 901, A, D)));
    });
    expect(
      violations.some(
        (v) => v.code === "PC_CAPABILITY_STATE" && /before the handover/.test(v.message),
      ),
    ).toBe(true);
    // and the actor verifier independently refuses the post-cutover actor write itself
    expect(violations.some((v) => v.code === "NAMED_ACTOR_STATE")).toBe(true);
  });

  it("a carry-forward whose marker was altered, built outside admission, fails the open at the PC verifier", async () => {
    const { violations } = await rogue(async (store) => {
      await must(store.commit(rawCarryBasis(via(store), 900, A, C, (v) => (v.marker = "S"))));
    });
    expect(
      violations.some(
        (v) => v.code === "PC_CAPABILITY_STATE" && /exactly the source/.test(v.message),
      ),
    ).toBe(true);
  });

  it("a carry-forward of a capability whose actor-side close never happened (a mere basis) fails the open", async () => {
    const { violations } = await rogue(async (store) => {
      await must(
        store.commit(
          rawCarryBasis(
            via(store),
            900,
            A,
            D,
            (v) => {
              v.marker = "C";
              v.establishment.source = { fact_key: actorCapabilityBasisKey(A, D), version: 1 };
            },
            {
              reads: [
                { key: "pc/actor-smith/existence-contract", version: 1 },
                { key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
                { key: actorCapabilityBasisKey(A, D), version: 1 },
              ],
            },
          ),
        ),
      );
    });
    expect(violations.some((v) => v.code === "PC_CAPABILITY_STATE")).toBe(true);
  });

  it("a carry-forward that did not read and depend on what it cites, or cites stale versions, fails the open", async () => {
    const variants: Record<string, [(v: any) => void, Partial<CommitGroup>]> = {
      "no reads": [() => undefined, { reads: [], depends_on: [] }],
      "stale source": [(v) => (v.establishment.source.version = 2), {}],
      "stale handover": [(v) => (v.establishment.handover.version = 2), {}],
    };
    for (const [name, [change, over]] of Object.entries(variants)) {
      const { violations } = await rogue(async (store) => {
        await must(store.commit(rawCarryBasis(via(store), 900, A, C, change, over)));
      });
      expect(
        violations.some((v) => v.code === "PC_CAPABILITY_STATE"),
        name,
      ).toBe(true);
    }
  });

  it("the lawful carry-forward appended the same way loads (so the refusals above are the carry-forward rules, not the harness)", async () => {
    const { violations } = await rogue(async (store) => {
      await must(store.commit(rawCarryBasis(via(store), 900)));
    });
    expect(violations.filter((v) => v.code === "PC_CAPABILITY_STATE")).toEqual([]);
  });
});
