// Epistemic Access — the governing-rule provenance of the active-PC extension. New writes carry one truthful current
// citation covering the preserved Named-Actor path and the active-PC / PC Capability Close seam; every fact committed under
// the predecessor (tenth-slice) citation keeps loading unchanged, and only for the value class it governed; a PC recipient's
// fact can never carry the superseded citation. No fact is rewritten, migrated or re-cited.
// Register lineage: IA-01, IA-11 (partial), IA-14 (partial), IA-16 (partial); RC-01, RC-07, RC-11; IM-10, IM-11, IM-12.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ENGINE_SEALED,
  CANON_WRITE_AUTHORITY,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  EPISTEMIC_ACCESS_RULE,
  EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
  EpistemicAccessAdapter,
  createFileCampaign,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  EPISTEMIC_FIXTURE_EXTENSION,
  EVENT_COUNCIL,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  SOURCE_SPEAKER,
  accessEvent,
  accessPublication,
  packetAdvanceRequest,
  pcAccessEvent,
  pcCapabilityContract,
  sourceKey,
} from "@immortalis/testkit";
import {
  establishAccess,
  establishCapability,
  establishPcCapability,
  registerPacketConsumer,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const E = EVENT_COUNCIL;
const A = ACTOR_SMITH;
const PC = FIXTURE_PC_ID;
const C = CAP_METALWORKING;
const withCapability = { representation: { capability_id: C } };
const isAccess = (g: CommitGroup) => g.owner === "epistemic_access";

type Flow = "NAMED" | "PC" | "PC_PLAIN";

/** One complete lifecycle (event → formation → consumption) for a Named-Actor or an active-PC recipient, then saved. */
async function savedLifecycle(flow: Flow): Promise<string> {
  const dir = tempDir();
  const s: EpistemicSeeded = await seededEpistemicCampaign(dir, {
    pcContract: pcCapabilityContract(),
  });
  if (flow === "NAMED") {
    const basis = await establishCapability(s, 1);
    const event = await establishAccess(s, 2, E, A, withCapability);
    await registerPacketConsumer(s, "c1", event, basis, 3);
  } else if (flow === "PC") {
    const basis = await establishPcCapability(s, 1);
    const event = pcAccessEvent(E, PC, withCapability);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(2), event }));
    await registerPacketConsumer(s, "c1", event, basis, 3);
  } else {
    const event = pcAccessEvent(E, PC);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(2), event }));
    await registerPacketConsumer(s, "c1", event, null, 3);
  }
  await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
  await s.campaign.close();
  return dir;
}

/**
 * A package built by a store with NO admission: the committed groups of the closed package `srcDir`, replayed in journal
 * order with `mutate` applied (here: the citation stamped on each group), so that only the load verifiers can refuse it.
 */
async function replay(
  srcDir: string,
  mutate: (g: CommitGroup) => CommitGroup = (g) => g,
): Promise<string> {
  const entries = readFileSync(join(srcDir, "journal.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { group: CommitGroup; receipt: { group_sha256: string } });
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: new Map([...CANONICAL_OWNER_REGISTRY, ...EPISTEMIC_FIXTURE_EXTENSION.owners]),
    }),
  );
  // a mutated group has a new receipt digest; later groups that cite it (a transaction's stage references) follow it
  const renamed = new Map<string, string>();
  for (const e of entries) {
    let text = JSON.stringify(e.group);
    for (const [from, to] of renamed) text = text.replaceAll(from, to);
    const committed = await must(store.commit(mutate(JSON.parse(text) as CommitGroup)));
    if (committed.receipt.group_sha256 !== e.receipt.group_sha256) {
      renamed.set(e.receipt.group_sha256, committed.receipt.group_sha256);
    }
  }
  await store.close();
  return dir;
}

type Violation = { code: string; message: string; key?: string };
async function violationsOf(dir: string): Promise<Violation[]> {
  const r = await CanonicalCampaign.open(dir, { extension: EPISTEMIC_FIXTURE_EXTENSION });
  if (r.ok) {
    await r.value.close();
    return [];
  }
  return r.error.code === "CANON_INTEGRITY"
    ? (r.error.details?.["violations"] as Violation[])
    : [{ code: r.error.code, message: r.error.message }];
}

const legacy =
  (when: (g: CommitGroup) => boolean = isAccess) =>
  (g: CommitGroup) =>
    when(g) ? { ...g, rule: EPISTEMIC_ACCESS_RULE_TENTH_SLICE } : g;

describe("new Epistemic writes carry the one current citation, for both recipient classes", () => {
  it("the Named-Actor and the active-PC event, packet and provenance are stamped with the current rule, which extends the superseded one", async () => {
    for (const flow of ["NAMED", "PC"] as const) {
      const dir = await savedLifecycle(flow);
      const r = await must(CanonicalCampaign.open(dir, { extension: EPISTEMIC_FIXTURE_EXTENSION }));
      const recipient = flow === "NAMED" ? A : PC;
      for (const key of [
        accessEventKey(E),
        accessPacketKey(E, recipient),
        accessProvenanceKey(E, recipient),
      ])
        expect(r.store.getFact(key)!.provenance.rule, `${flow} ${key}`).toEqual(
          EPISTEMIC_ACCESS_RULE,
        );
      await r.close();
    }
    expect(EPISTEMIC_ACCESS_RULE).not.toEqual(EPISTEMIC_ACCESS_RULE_TENTH_SLICE);
    expect(EPISTEMIC_ACCESS_RULE.clause.startsWith(EPISTEMIC_ACCESS_RULE_TENTH_SLICE.clause)).toBe(
      true,
    );
    expect(EPISTEMIC_ACCESS_RULE.clause).toMatch(/PC Capability Close/);
    expect(EPISTEMIC_ACCESS_RULE_TENTH_SLICE.clause).not.toMatch(/PC Capability Close/);
  });

  it("a raw commit cannot stamp the superseded citation on a new event or formation: admission refuses it", async () => {
    const s = await seededEpistemicCampaign(tempDir(), { pcContract: pcCapabilityContract() });
    const source = s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!;
    const rawEvent = (rule: CommitGroup["rule"], n: number) =>
      ({
        campaign_id: FIXTURE_CAMPAIGN,
        owner: "epistemic_access",
        facet: "epistemic_access",
        group_id: `raw-rule-group-${n}`,
        intent_id: `raw-rule-intent-${n}`,
        cause: `raw-rule-cause-${n}`,
        rule,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [{ key: source.key, version: source.version }],
        depends_on: [source.provenance.group_id],
        writes: [
          {
            key: accessEventKey(`e-raw-${n}`),
            owner: "epistemic_access",
            facet: "epistemic_access",
            value: pcAccessEvent(`e-raw-${n}`, PC) as never,
            unit: null,
            basis: "fixture-basis",
            secrecy: ACCESS_CLASS_ENGINE_SEALED,
            expected_version: 0,
          },
        ],
      }) as CommitGroup;
    expect(
      await codeOf(s.campaign.store.commit(rawEvent(EPISTEMIC_ACCESS_RULE_TENTH_SLICE, 1))),
    ).toBe("REFERENCE_INVALID");
    expect(await codeOf(s.campaign.store.commit(rawEvent(EPISTEMIC_ACCESS_RULE, 2)))).toBe("OK");
    // the same holds for a Named-Actor event: the superseded citation is never stamped on a new write
    const named = rawEvent(EPISTEMIC_ACCESS_RULE_TENTH_SLICE, 3);
    named.writes = [
      {
        ...named.writes[0]!,
        key: accessEventKey("e-raw-3"),
        value: accessEvent("e-raw-3", A) as never,
      },
    ];
    expect(await codeOf(s.campaign.store.commit(named))).toBe("REFERENCE_INVALID");
  });
});

describe("every save written under the superseded citation still loads unchanged, and no fact is rewritten", () => {
  it("a Named-Actor event, packet and provenance committed under the superseded citation load with no violation", async () => {
    const src = await savedLifecycle("NAMED");
    expect(await violationsOf(await replay(src, legacy()))).toEqual([]);
    // the faithful history, under the current citation, is clean as well
    expect(await violationsOf(await replay(src))).toEqual([]);
  });

  it("re-presenting an already-committed superseded-citation event is reconciled by identity: the same receipt, nothing new committed", async () => {
    const src = await savedLifecycle("NAMED");
    const dir = await replay(src, legacy());
    const r = await must(CanonicalCampaign.open(dir, { extension: EPISTEMIC_FIXTURE_EXTENSION }));
    const before = r.store.head();
    const committed = r.store.getFact(accessEventKey(E))!;
    expect(committed.provenance.rule).toEqual(EPISTEMIC_ACCESS_RULE_TENTH_SLICE);
    const again = await must(
      new EpistemicAccessAdapter(r.store).establishBoundedSharedAccess({
        ...accessPublication(2),
        event: committed.value,
      }),
    );
    expect(again.receipt.group_sha256).toBe(r.store.lookupReceipt("access-intent-2")!.group_sha256);
    expect(r.store.head()).toEqual(before);
    expect(r.store.getFact(accessEventKey(E))).toEqual(committed);
    await r.close();
  });
});

describe("the superseded citation never covers an active-PC recipient's facts, nor any other drift", () => {
  const drift = (vs: Violation[]) => vs.filter((v) => v.code === "RULE_DRIFT");

  it("an active-PC event, or a PC packet and provenance referencing the PC Capability Close, under the superseded citation are RULE_DRIFT", async () => {
    const src = await savedLifecycle("PC");
    const event = (g: CommitGroup) => g.writes.some((w) => w.key === accessEventKey(E));
    const formation = (g: CommitGroup) => g.writes.some((w) => w.key === accessPacketKey(E, PC));
    expect(drift(await violationsOf(await replay(src, legacy(event)))).length).toBeGreaterThan(0);
    expect(drift(await violationsOf(await replay(src, legacy(formation)))).length).toBeGreaterThan(
      0,
    );
    expect(drift(await violationsOf(await replay(src)))).toEqual([]);
  });

  it("an active-PC packet with no capability dependency is indistinguishable by value, so the load verifier refuses the superseded citation on it", async () => {
    const src = await savedLifecycle("PC_PLAIN");
    const formation = (g: CommitGroup) => g.writes.some((w) => w.key === accessPacketKey(E, PC));
    const violations = await violationsOf(await replay(src, legacy(formation)));
    expect(drift(violations)).toEqual([]);
    expect(
      violations.some(
        (v) => v.code === "EPISTEMIC_ACCESS_STATE" && /never the superseded one/.test(v.message),
      ),
    ).toBe(true);
    expect(await violationsOf(await replay(src))).toEqual([]);
  });

  it("any other citation is RULE_DRIFT: an altered current rule, an altered superseded rule and a foreign rule", async () => {
    const src = await savedLifecycle("NAMED");
    for (const rule of [
      { ...EPISTEMIC_ACCESS_RULE, clause: `${EPISTEMIC_ACCESS_RULE.clause}!` },
      {
        ...EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
        clause: `${EPISTEMIC_ACCESS_RULE_TENTH_SLICE.clause}!`,
      },
      { ...EPISTEMIC_ACCESS_RULE_TENTH_SLICE, native_pin: "2026-01-01T00:00:00.000Z" },
    ])
      expect(
        drift(await violationsOf(await replay(src, (g) => (isAccess(g) ? { ...g, rule } : g))))
          .length,
      ).toBeGreaterThan(0);
  });
});
