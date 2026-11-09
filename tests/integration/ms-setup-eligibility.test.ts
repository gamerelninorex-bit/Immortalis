/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial source/provenance records */
import { generateKeyPairSync } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  MsSetupPublisher,
  resolveKey,
  INITIAL_SETUP_RULES,
  INITIAL_LOCALITY_COMPLETION_MS_V3_RULE,
  initialSetupGroupCheck,
  strictEd25519Key,
  msActorGroupCheck,
  msEarlierSessionViolation,
  msGenesis,
  msActorEligibility,
  genesisProjection,
  existingActorSourceViolation,
} from "@immortalis/engine";
import { InitialSetupInputSchema } from "@immortalis/contracts";
import { msHarness } from "../support/ms-setup.ts";
import { FIXTURE_POLICY } from "../support/initial-setup.ts";

describe("C1/C2 exact route and pre-Completion deterministic eligibility", () => {
  it("refuses a candidate whose world/locus differs from its actual original Input and Grant", async () => {
    const h = await msHarness(),
      s = new MsSetupPublisher(h.store).chain();
    for (const field of ["world_id", "locus_id"] as const) {
      const c = structuredClone(s.c);
      c[field] = "foreign";
      expect(msActorEligibility(h.state(), c)).toMatchObject({ code: "MS_ACTOR_SCOPE" });
    }
    await h.campaign.close();
  });
  it("refuses an oversized planned actor producer before Completion with the existing deterministic Disposition", async () => {
    const h = await msHarness({
      sourceOver: { statement: "SYNTHETIC FIXTURE: " + "x".repeat(1_930_000) },
      actors: {
        kind: "ACTOR_PRODUCER_REQUIRED",
        constraints: ["A".repeat(200_000)],
        ground: "one licensed leaf",
      },
    });
    expect(h.setup).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
    const d = h.store
      .listFacts()
      .find((f) => resolveKey(f.key)?.kind.id === "initial_setup_disposition")!;
    expect((d.value as any).rejection_code).toBe("PRODUCER_INPUT_OVERSIZE");
    expect(h.calls()).toBe(0);
    expect(h.store.getFact("temporal/state")).toBeUndefined();
    await h.campaign.close();
  }, 30000);
  for (const [actors, code] of [
    [{ kind: "NONE_IN_DOMAIN", constraints: [], ground: "no actor" }, "MS_ACTOR_BRANCH_REQUIRED"],
    [{ kind: "UNRESOLVED", constraints: [], ground: "unresolved" }, "MS_ACTOR_BRANCH_REQUIRED"],
    [
      {
        kind: "ACTOR_PRODUCER_REQUIRED",
        constraints: ["one", "two"],
        ground: "two licensed leaves",
      },
      "MS_ACTOR_CARDINALITY",
    ],
  ] as const)
    it(
      "refuses " +
        actors.kind +
        "/" +
        actors.constraints.length +
        " before Completion and recomputes its terminal Disposition",
      async () => {
        const h = await msHarness({ actors: { ...actors, constraints: [...actors.constraints] } });
        expect(h.setup).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
        const d = h.trace.find(
          (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_setup_disposition",
        )!;
        expect((d.group.writes[0]!.value as any).rejection_code).toBe(code);
        const wrong = structuredClone(d.group);
        (wrong.writes[0]!.value as any).rejection_code = "invented";
        expect(initialSetupGroupCheck(wrong, d.before, FIXTURE_POLICY)).not.toBeNull();
        expect(h.calls()).toBe(0);
        expect(h.store.getFact("temporal/state")).toBeUndefined();
        expect(
          h.store
            .listFacts()
            .some((f) => resolveKey(f.key)?.kind.id === "initial_locality_completion"),
        ).toBe(false);
        await h.campaign.close();
      },
    );
  it("allows a separate, source-qualified terminal same-MS SCOPE predecessor and rejects its legacy/unknown/active counterparts", async () => {
    const h = await msHarness({ priorScopeTerminal: true });
    expect(h.setup).toMatchObject({ status: "COMPLETED" });
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const inputs = h.trace.filter(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_setup_input",
    );
    expect(inputs).toHaveLength(2);
    const next = inputs[1]!,
      input = InitialSetupInputSchema.parse(next.group.writes[0]!.value);
    expect(msEarlierSessionViolation(next.before.facts, input, false)).toBeNull();
    const firstKey = inputs[0]!.group.writes[0]!.key,
      first = next.before.facts.get(firstKey)!;
    const legacy = new Map(next.before.facts).set(firstKey, {
      ...first,
      provenance: { ...first.provenance, rule: INITIAL_SETUP_RULES.initial_setup_input },
    });
    expect(msEarlierSessionViolation(legacy, input, false)).toBe("MS_PRIOR_LEGACY_INPUT");
    const active = new Map(next.before.facts);
    for (const [key, f] of active)
      if (resolveKey(f.key)?.kind.id === "initial_setup_disposition") active.delete(key);
    expect(msEarlierSessionViolation(active, input, false)).toBe("MS_PRIOR_SESSION");
    await h.campaign.close();
  });
  it("refuses both mixed full-citation pairs without inventing a Selection failure", async () => {
    const h = await msHarness(),
      t = h.trace.find(
        (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_locality_completion",
      )!;
    const mixed = structuredClone(t.group);
    mixed.rule = INITIAL_SETUP_RULES.initial_locality_completion;
    expect(initialSetupGroupCheck(mixed, t.before, FIXTURE_POLICY)).toMatchObject({
      details: { reason: "MS_ROUTE_PAIR" },
    });
    const pin = (t.group.writes[0]!.value as any).input,
      key = pin.fact_key,
      input = t.before.facts.get(key)!;
    const legacy = {
      ...t.before,
      facts: new Map(t.before.facts).set(key, {
        ...input,
        provenance: { ...input.provenance, rule: INITIAL_SETUP_RULES.initial_setup_input },
      }),
    };
    expect(initialSetupGroupCheck(t.group, legacy, FIXTURE_POLICY)).toMatchObject({
      details: { reason: "MS_ROUTE_PAIR" },
    });
    const altered = structuredClone(t.group);
    altered.rule = { ...INITIAL_LOCALITY_COMPLETION_MS_V3_RULE, authority_lineage: [] };
    expect(initialSetupGroupCheck(altered, t.before, FIXTURE_POLICY)).toMatchObject({
      details: { reason: "RULE" },
    });
    await h.campaign.close();
  });
  it("requires the strict key/profile at Input before a reservation and repeats it at issue", async () => {
    const h = await msHarness(),
      t = h.trace.find(
        (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_setup_input",
      )!;
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .publicKey.export({ format: "der", type: "spki" })
      .toString("base64");
    const original = (t.group.writes[0]!.value as any).runner.public_key;
    for (const public_key of [
      rsa,
      original + "\n",
      Buffer.concat([Buffer.from(original, "base64"), Buffer.from([0])]).toString("base64"),
      "AAAA",
    ]) {
      expect(strictEd25519Key(public_key)).toBe(false);
      const g = structuredClone(t.group);
      (g.writes[0]!.value as any).runner.public_key = public_key;
      expect(
        initialSetupGroupCheck(g, t.before, {
          ...FIXTURE_POLICY,
          msActorBinding: h.actorRunner.binding,
        }),
      ).not.toBeNull();
    }
    expect(initialSetupGroupCheck(t.group, t.before, FIXTURE_POLICY)).toMatchObject({
      details: { reason: "MS_ACTOR_PROFILE" },
    });
    const unsupported = structuredClone(t.group);
    (unsupported.writes[0]!.value as any).runner.driver_id = "fixture:unsupported";
    expect(
      initialSetupGroupCheck(unsupported, t.before, {
        ...FIXTURE_POLICY,
        msActorBinding: h.actorRunner.binding,
      }),
    ).toMatchObject({ details: { reason: "MS_ACTOR_PROFILE" } });
    expect(h.calls()).toBe(0);
    await h.campaign.close();
  });
  it("keeps the original projection and shared capability-source predicate restrictive while MS uses its separate source oracle", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const p = new MsSetupPublisher(h.store),
      s = p.chain();
    expect(genesisProjection(h.state().facts).ok).toBe(false);
    expect(msGenesis(h.state().facts).ok).toBe(true);
    const b = h.store
      .listFacts()
      .find((f) => resolveKey(f.key)?.kind.id === "named_actor_existence_basis")!;
    expect(
      existingActorSourceViolation(
        s.actor,
        [{ owner: "named_actor", fact_key: b.key, version: 1 }],
        h.state().facts,
      ),
    ).not.toBeNull();
    const issue = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_actor_setup_issue",
    )!;
    for (const field of ["leaf_sha256", "input_hash", "completion_digest"]) {
      const g = structuredClone(issue.group);
      (g.writes[0]!.value as any)[field] = "1".repeat(64);
      expect(msActorGroupCheck(g, issue.before), field).not.toBeNull();
    }
    for (const field of ["input", "grant", "completion"]) {
      const g = structuredClone(issue.group);
      (g.writes[0]!.value as any)[field].version = 2;
      expect(msActorGroupCheck(g, issue.before), field).not.toBeNull();
    }
    await h.campaign.close();
  });
});
