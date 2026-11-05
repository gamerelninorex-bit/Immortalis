/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — clarification C-2 (Sovereign-ratified v0.4): the closed indexed Selection leaf grammar, the independent
// stateful INITIAL_LOCALITY_PROVENANCE_V1 profile, the exact chronology-statement exception for coverage.start, and fixed-source
// feasibility BEFORE any Grant or SCENE reservation (CE-3: SCOPE_REFUSED with rejection_code:null).
// MECHANISM ONLY (T1): the scripted driver and fixture proofs stand in for the isolated model and the message proofs. Verbatim matching
// is a mechanical floor, not proof that a quotation's meaning is right. No fixed-source POSITIVE is claimed except the one labelled
// below, whose canonical source genuinely contains the exact enum token; every other fixed-facet case is a refusal or a labelled
// guard-only counterfactual (never presented as an owner-backed positive). T2/T3 remain UNRUN (OB-030).
import { describe, expect, it } from "vitest";
import {
  InitialSetupInputSchema,
  InitialLocalityCompletionSchema,
  type FacetAuthority,
  type Selection,
} from "@immortalis/contracts";
import {
  InitialSetupPublisher,
  fixedSourceViolation,
  genesisValueIndex,
  leafFacet,
  provenanceViolation,
  scanInitialSetup,
  scopeDecisionRecord,
  selectionLeafPaths,
  sourceStringValues,
  sourceTextArrays,
} from "@immortalis/engine";
import {
  FIXTURE_DELEGATION_QUOTE,
  FIXTURE_SETUP_MESSAGE,
  ScriptedIsolatedDriver,
  delegatedSelection,
  delegatingScope,
  type SelectionOptions,
} from "@immortalis/testkit";
import {
  FIXTURE_POLICY,
  commitResponse,
  factsOf,
  harness,
  intakeRequest,
  openFixtureCampaign,
  reasonOf,
  reopenFixtureCampaign,
  responseFrom,
  scopeDispatchRequest,
  type Harness,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";
import { PrivateRunner } from "@immortalis/operator";
import { scratch } from "../support/initial-setup.ts";

type Entries = Selection["provenance"];

/** A SCENE script: the lawful delegated selection of the testkit, then one test-chosen transformation of it. */
const scene =
  (
    options: SelectionOptions = {},
    mutate: (sel: Selection, input: Record<string, unknown>) => Selection = (s) => s,
  ) =>
  (input: Record<string, unknown>): Record<string, unknown> => ({
    kind: "SELECTION",
    selection: mutate(delegatedSelection(input, options), input),
  });

async function run(
  answers: { scope?: any; scene: any },
  message = FIXTURE_SETUP_MESSAGE,
  open?: Awaited<ReturnType<typeof openFixtureCampaign>>,
) {
  const h = await harness({
    answers: { scope: answers.scope ?? delegatingScope(), scene: answers.scene },
    ...(open ? { open } : {}),
  });
  const intake = await h.service.intake(await intakeRequest(h, { message }));
  const result = await h.service.advance(intake.setup_id!);
  const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
  return { h, result, setupId: intake.setup_id!, session };
}

const refusalCode = (r: Awaited<ReturnType<typeof run>>): string | null | undefined => {
  expect(r.result).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
  return (r.session.disposition!.value as any).rejection_code;
};

const set = (e: Entries, path: string, over: Record<string, unknown>): Entries =>
  e.map((x) => (x.path === path ? ({ ...x, ...over } as any) : x));
const rename = (e: Entries, from: string, to: string): Entries => set(e, from, { path: to });
const without = (e: Entries, path: string): Entries => e.filter((x) => x.path !== path);

// ---------------------------------------------------------------------------------------------------------------------
// The twelve-constraint adverse actor branch: [2] and [10] are lexically adjacent and are both AUTHORED
// ---------------------------------------------------------------------------------------------------------------------

const CONSTRAINTS = [
  "a sawyer who keeps the stand",
  "a carter with a mule",
  "a charcoal burner",
  "a woodward",
  "a hurdle maker",
  "a swineherd",
  "a bark peeler",
  "a forester's boy",
  "a hedger",
  "a reeve",
  "a night watchman",
  "a tinker passing through",
];
const MESSAGE_12 = `Make a woodlot where ${CONSTRAINTS.join(", ")} work. ${FIXTURE_DELEGATION_QUOTE}`;
const AUTHORED_12 = new Set([2, 5, 10]);
const actors12 = {
  kind: "ACTOR_PRODUCER_REQUIRED" as const,
  constraints: CONSTRAINTS,
  ground: "the stand is worked",
};
const authored12 = Object.fromEntries(
  [...AUTHORED_12].map((i) => [`actors.constraints[${i}]`, [CONSTRAINTS[i]!]] as const),
);

describe("C-2 positives: the closed indexed grammar admits genuinely mixed text origins", () => {
  it("mixed text origin: one leaf is PLAYER_AUTHORED from an exact quote, the rest are PLAYER_DELEGATED; completion replays strictly", async () => {
    const r = await run({
      scene: scene({ designation: "woodlot", authored: { "domain.designation": ["a woodlot"] } }),
    });
    expect(r.result.status).toBe("COMPLETED");
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(r.h.store)).completion!.value,
    );
    const byPath = new Map(completion.selection.provenance.map((p) => [p.path, p]));
    expect(byPath.get("domain.designation")).toMatchObject({
      origin: "PLAYER_AUTHORED",
      grant: null,
      evidence_quotes: ["a woodlot"],
    });
    expect(byPath.get("domain.topology")).toMatchObject({ origin: "PLAYER_DELEGATED" });
    expect(byPath.get("coverage.start")).toMatchObject({ origin: "PLAYER_AUTHORED" });
    await r.h.campaign.close();
    const reopened = await must(reopenFixtureCampaign(r.h.dir));
    expect(scanInitialSetup(factsOf(reopened.store)).completion).toBeDefined();
    await reopened.close();
  });

  it("an authored text leaf may instead be an exact source-value witness: its string equals a string value of the fact it cites", async () => {
    const r = await run({
      scene: scene({}, (sel, input) => {
        const world = (input["genesis"] as any[]).find((g) => g.fact_key.includes("/profile"))!;
        const strings = [...sourceStringValues(world.value)].filter((s) => s.trim() === s);
        const value = strings.find((s) => s.length > 3)!;
        return {
          ...sel,
          domain: { ...sel.domain, topology: value },
          provenance: set(sel.provenance, "domain.topology", {
            origin: "PLAYER_AUTHORED",
            grant: null,
            evidence_quotes: [],
            source_refs: [{ fact_key: world.fact_key, version: world.version }],
          }),
        };
      }),
    });
    expect(r.result.status).toBe("COMPLETED");
  });

  it("twelve separately indexed actor constraints with authored [2], [5] and [10] and delegated others complete; the paths are the closed indexed set", async () => {
    const r = await run({ scene: scene({ actors: actors12, authored: authored12 }) }, MESSAGE_12);
    expect(r.result.status).toBe("COMPLETED");
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(r.h.store)).completion!.value,
    );
    const paths = completion.selection.provenance.map((p) => p.path);
    expect(paths.filter((p) => p.startsWith("actors.constraints"))).toEqual(
      CONSTRAINTS.map((_, i) => `actors.constraints[${i}]`),
    );
    expect(paths).not.toContain("actors.constraints");
    // index/value association survives: element i is authored exactly where the test authored it
    completion.selection.provenance
      .filter((p) => p.path.startsWith("actors.constraints["))
      .forEach((p) => {
        const i = Number(/\[(\d+)\]/.exec(p.path)![1]);
        expect(p.origin).toBe(AUTHORED_12.has(i) ? "PLAYER_AUTHORED" : "PLAYER_DELEGATED");
        expect(completion.selection.actors.constraints[i]).toBe(CONSTRAINTS[i]);
      });
  });

  it("provenance-array order is not significant to eligibility, and the signed raw order is retained unchanged", async () => {
    const reversed = (e: Entries): Entries => [...e].reverse();
    const r = await run({ scene: scene({ provenance: reversed }) });
    expect(r.result.status).toBe("COMPLETED");
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(r.h.store)).completion!.value,
    );
    const lexical = completion.selection.provenance.map((p) => p.path);
    // the signed answer's own (reversed) order is kept, not re-sorted
    expect(lexical).toEqual(selectionLeafPaths(completion.selection).slice().reverse());
    expect([...lexical].sort()).not.toEqual(lexical);
    const twelve = await run(
      { scene: scene({ actors: actors12, authored: authored12, provenance: reversed }) },
      MESSAGE_12,
    );
    expect(twelve.result.status).toBe("COMPLETED");
  });

  it("coverage.start is accepted with the captured chronology statement as its ONLY quote, although the statement is in neither the message nor genesis", async () => {
    const r = await run({ scene: scene() });
    expect(r.result.status).toBe("COMPLETED");
    const input = InitialSetupInputSchema.parse(r.session.input.value);
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(r.h.store)).completion!.value,
    );
    const start = completion.selection.provenance.find((p) => p.path === "coverage.start")!;
    expect(start.evidence_quotes).toEqual([input.chronology.document.statement]);
    expect(input.setup_message).not.toContain(input.chronology.document.statement);
  });

  it("CLAIM_REQUIRED adds exactly the claimant path; a null claimant adds none", async () => {
    const ok = await run({ scene: scene({ claimKind: "CLAIM_REQUIRED" }) });
    expect(ok.result.status).toBe("COMPLETED");
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(ok.h.store)).completion!.value,
    );
    expect(completion.selection.provenance.map((p) => p.path)).toContain(
      "source_claims[0].claimant",
    );
    const none = await run({ scene: scene() });
    const paths = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(none.h.store)).completion!.value,
    ).selection.provenance.map((p) => p.path);
    expect(paths).not.toContain("source_claims[0].claimant");
    expect(paths).toHaveLength(12); // the table's twelve unconditional paths; zero constraints and a null claimant add none
  });
});

describe("C-2 path falsifiers: missing, extra, duplicate, catch-all, mis-indexed and foreign paths refuse", () => {
  const cases: [string, (e: Entries, sel: Selection) => Entries, any?][] = [
    ["an omitted path", (e) => without(e, "workforce.scope_statement")],
    ["a duplicate path", (e) => [...e, e.find((x) => x.path === "domain.topology")!]],
    [
      "the old actors.constraints catch-all",
      (e) => [...without(e, "actors.kind"), { ...e[0]!, path: "actors.constraints" }],
    ],
    [
      "a fact-key-derived source claim path",
      (e, sel) =>
        rename(
          e,
          "source_claims[0].kind",
          `source_claims.${sel.source_claims[0]!.source.fact_key}`,
        ),
    ],
    ["a whole-claim object path", (e) => rename(e, "source_claims[0].ground", "source_claims[0]")],
    ["a provenance-self path", (e) => [...e, { ...e[0]!, path: "provenance" }]],
    ["a non-leaf time component path", (e) => [...e, { ...e[0]!, path: "coverage.start.unit" }]],
    [
      "a claimant path when the claimant is null",
      (e) => [...e, { ...e[0]!, path: "source_claims[0].claimant" }],
    ],
  ];
  for (const [label, mutate] of cases)
    it(`refuses ${label} as COMPLETION_REFUSED PROVENANCE_PATHS (SCENE slot consumed, never rerun)`, async () => {
      const driver = new ScriptedIsolatedDriver({
        scope: delegatingScope(),
        scene: (input) => ({
          kind: "SELECTION",
          selection: (() => {
            const sel = delegatedSelection(input);
            return { ...sel, provenance: mutate(sel.provenance, sel) };
          })(),
        }),
      });
      const h = await harness({ driver });
      const intake = await h.service.intake(await intakeRequest(h));
      const result = await h.service.advance(intake.setup_id!);
      expect(result).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
      const d = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.disposition!;
      expect((d.value as any).rejection_code).toBe("PROVENANCE_PATHS");
      expect(driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);
    });

  it("refuses leading-zero, off-by-one and unindexed constraint paths among twelve", async () => {
    for (const [from, to] of [
      ["actors.constraints[1]", "actors.constraints[01]"],
      ["actors.constraints[11]", "actors.constraints[12]"],
      ["actors.constraints[2]", "actors.constraints[ 2]"],
      ["actors.constraints[10]", "actors.constraints[010]"],
    ] as const) {
      const r = await run(
        {
          scene: scene({
            actors: actors12,
            authored: authored12,
            provenance: (e) => rename(e, from, to),
          }),
        },
        MESSAGE_12,
      );
      expect(refusalCode(r), to).toBe("PROVENANCE_PATHS");
    }
  });
});

describe("C-2 value and evidence falsifiers", () => {
  const authoredDesignation = (
    value: string,
    quotes: string[],
    extra: Record<string, unknown> = {},
  ) =>
    scene({ designation: value }, (sel) => ({
      ...sel,
      provenance: set(sel.provenance, "domain.designation", {
        origin: "PLAYER_AUTHORED",
        grant: null,
        evidence_quotes: quotes,
        source_refs: [],
        ...extra,
      }),
    }));

  const cases: [string, any, string][] = [
    [
      "an unrelated authentic quote attached to an invented string",
      authoredDesignation("the sawmill", ["a woodlot"]),
      "PROVENANCE_VALUE",
    ],
    [
      "a paraphrase marked PLAYER_AUTHORED",
      authoredDesignation("the woodlot", ["a woodlot"]),
      "PROVENANCE_VALUE",
    ],
    [
      "an authored leaf with no evidence at all",
      authoredDesignation("the woodlot", []),
      "PROVENANCE_VALUE",
    ],
    [
      "a quote that occurs nowhere",
      authoredDesignation("the woodlot", ["a coppice"]),
      "PROVENANCE_QUOTE",
    ],
    [
      "one good quote that cannot excuse another bad one",
      authoredDesignation("woodlot", ["a coppice", "a woodlot"]),
      "PROVENANCE_QUOTE",
    ],
    [
      "a ref that is not an admitted Input-pinned fact",
      authoredDesignation("woodlot", ["a woodlot"], {
        source_refs: [{ fact_key: "world/none/profile", version: 1 }],
      }),
      "PROVENANCE_REF",
    ],
    [
      "an authored leaf that carries a grant",
      scene({ designation: "woodlot" }, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "domain.designation", {
          origin: "PLAYER_AUTHORED",
          evidence_quotes: ["a woodlot"],
        }),
      })),
      "PROVENANCE_GRANT",
    ],
    [
      "a delegated leaf under another grant pin",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "domain.topology", {
          grant: {
            ...sel.provenance.find((p) => p.path === "domain.topology")!.grant!,
            version: 99,
          },
        }),
      })),
      "PROVENANCE_GRANT",
    ],
    [
      "a delegated coverage.start",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.start", {
          origin: "PLAYER_DELEGATED",
          evidence_quotes: [],
          grant: sel.provenance.find((p) => p.path === "coverage.end")!.grant,
        }),
      })),
      "PROVENANCE_CHRONOLOGY",
    ],
    [
      "coverage.start with an additional quote",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.start", {
          evidence_quotes: [
            ...sel.provenance.find((p) => p.path === "coverage.start")!.evidence_quotes,
            "a woodlot",
          ].sort(),
        }),
      })),
      "PROVENANCE_CHRONOLOGY",
    ],
    [
      "coverage.start quoting the message instead of the captured statement",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.start", { evidence_quotes: ["a woodlot"] }),
      })),
      "PROVENANCE_CHRONOLOGY",
    ],
    [
      "a normalized (case-folded) chronology statement",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.start", {
          evidence_quotes: sel.provenance
            .find((p) => p.path === "coverage.start")!
            .evidence_quotes.map((q) => q.toLowerCase()),
        }),
      })),
      "PROVENANCE_CHRONOLOGY",
    ],
    [
      "an authored coverage.end",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.end", {
          origin: "PLAYER_AUTHORED",
          grant: null,
          evidence_quotes: ["a woodlot"],
        }),
      })),
      "PROVENANCE_ORIGIN",
    ],
    [
      "an authored coverage.ground with no supporting quote",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "coverage.ground", {
          origin: "PLAYER_AUTHORED",
          grant: null,
          evidence_quotes: [],
        }),
      })),
      "PROVENANCE_VALUE",
    ],
    [
      "WORLD_COMPLETION, ACTOR_DECISION or ENGINE_DERIVED origins",
      scene({}, (sel) => ({
        ...sel,
        provenance: set(sel.provenance, "domain.topology", { origin: "WORLD_COMPLETION" }),
      })),
      "PROVENANCE_ORIGIN",
    ],
  ];
  for (const [label, scenes, code] of cases)
    it(`refuses ${label} with ${code}`, async () => {
      const r = await run({ scene: scenes });
      expect(refusalCode(r)).toBe(code);
    });

  it("a quote taken from a genesis fact the entry does NOT cite is refused (an uncited fact is not an evidence haystack)", async () => {
    const r = await run({
      scene: scene({ designation: "woodlot" }, (sel, input) => {
        const world = (input["genesis"] as any[]).find((g) => g.fact_key.includes("/profile"))!;
        const text = [...sourceStringValues(world.value)].find(
          (s) => s.length > 3 && s.trim() === s,
        )!;
        return {
          ...sel,
          domain: { ...sel.domain, designation: text },
          provenance: set(sel.provenance, "domain.designation", {
            origin: "PLAYER_AUTHORED",
            grant: null,
            evidence_quotes: [text],
            source_refs: [],
          }),
        };
      }),
    });
    expect(refusalCode(r)).toBe("PROVENANCE_QUOTE");
  });

  it("a quoted enum token alone does not author a typed enum: closure.kind is PLAYER_AUTHORED only through a fixed facet's source witness", async () => {
    const message = `Make a woodlot where collection is possible, CLOSED. ${FIXTURE_DELEGATION_QUOTE}`;
    const r = await run(
      {
        scene: scene({}, (sel) => ({
          ...sel,
          provenance: set(sel.provenance, "closure.kind", {
            origin: "PLAYER_AUTHORED",
            grant: null,
            evidence_quotes: ["CLOSED"],
          }),
        })),
      },
      message,
    );
    expect(refusalCode(r)).toBe("PROVENANCE_ENUM");
  });

  it("[2] and [10] keep their own index/value association: swapping their evidence is refused", async () => {
    const r = await run(
      {
        scene: scene({ actors: actors12, authored: authored12 }, (sel) => ({
          ...sel,
          provenance: sel.provenance.map((p) =>
            p.path === "actors.constraints[2]"
              ? { ...p, evidence_quotes: [CONSTRAINTS[10]!] }
              : p.path === "actors.constraints[10]"
                ? { ...p, evidence_quotes: [CONSTRAINTS[2]!] }
                : p,
          ),
        })),
      },
      MESSAGE_12,
    );
    expect(refusalCode(r)).toBe("PROVENANCE_VALUE");
  });

  it("a changed source pin in source_claims[0] refuses as SOURCE_CLAIMS", async () => {
    const r = await run({
      scene: scene({}, (sel) => ({
        ...sel,
        source_claims: sel.source_claims.map((c) => ({
          ...c,
          source: { ...c.source, version: c.source.version + 1 },
        })),
      })),
    });
    expect(refusalCode(r)).toBe("SOURCE_CLAIMS");
  });

  it("a CLAIM_REQUIRED selection with its claimant path omitted refuses (nullability and path set must agree)", async () => {
    const r = await run({
      scene: scene({ claimKind: "CLAIM_REQUIRED" }, (sel) => ({
        ...sel,
        provenance: without(sel.provenance, "source_claims[0].claimant"),
      })),
    });
    expect(refusalCode(r)).toBe("PROVENANCE_PATHS");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Fixed-source feasibility (CE-3)
// ---------------------------------------------------------------------------------------------------------------------

const fixedDomainScope = (input: Record<string, unknown>) => {
  const source = (input["genesis"] as any[]).find((g) => g.fact_key.includes("/source/"))!;
  const base = delegatingScope()(input) as any;
  return {
    ...base,
    facets: base.facets.map((f: any) =>
      f.facet === "DOMAIN_BOUNDARY"
        ? {
            ...f,
            mode: "FIXED_BY_SOURCE",
            evidence_quotes: [],
            source_refs: [{ fact_key: source.fact_key, version: source.version }],
          }
        : f,
    ),
  };
};

describe("C-2 fixed-source feasibility: an unsupported fixed facet is SCOPE_REFUSED before any Grant or SCENE (rejection_code:null)", () => {
  it("a fixed DOMAIN_BOUNDARY whose cited source holds no legal enum witness refuses at SCOPE: no Grant, no SCENE reservation, no second generation", async () => {
    const driver = new ScriptedIsolatedDriver({ scope: fixedDomainScope, scene: scene() });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const result = await h.service.advance(intake.setup_id!);
    expect(result).toMatchObject({ status: "TERMINAL", reason: "SCOPE_REFUSED" });
    const facts = factsOf(h.store);
    const index = scanInitialSetup(facts);
    const session = index.sessions.get(intake.setup_id!)!;
    const d = session.disposition!.value as any;
    expect(d).toMatchObject({ reason: "SCOPE_REFUSED", phase: "SCOPE", rejection_code: null });
    expect(d.response).toEqual({
      fact_key: session.scopeResponse!.key,
      version: session.scopeResponse!.version,
    });
    expect(session.grant).toBeUndefined();
    expect(index.sceneReservation).toBeUndefined();
    expect(driver.calls.map((c) => c.phase)).toEqual(["SCOPE"]);
    // the Referee decision's stored verdict IS the canonically derived one
    const decision = [...facts.values()].find((f) => f.key.startsWith("referee/"))!;
    expect((decision.value as any).verdict).toBe("SCOPE_REFUSED");
    // identical input cannot retry; the engine never relabelled the facet DELEGATED to make it proceed
    const again = await h.service.advance(intake.setup_id!);
    expect(again.status).toBe("TERMINAL");
    expect(driver.calls).toHaveLength(1);
  });

  it("raw admission: a SCOPE_AUTHORIZED decision for the unsupported fixed facet is refused, so no Grant can follow", async () => {
    const crashing = new ScriptedIsolatedDriver(
      { scope: fixedDomainScope, scene: scene() },
      { throwAfterSend: true },
    );
    const h = await harness({ driver: crashing });
    const intake = await h.service.intake(await intakeRequest(h));
    await h.service.advance(intake.setup_id!);
    const req = scopeDispatchRequest(h, intake.setup_id!);
    const runner = new PrivateRunner({
      keyId: h.keys.keyId,
      privateKeyPkcs8Base64: h.keys.privateKeyPkcs8Base64,
      publicKeySpkiBase64: h.keys.publicKeySpkiBase64,
      driver: new ScriptedIsolatedDriver({ scope: fixedDomainScope, scene: scene() }),
      outboxDir: scratch("immortalis-bootstrap-outbox-"),
      macKey: h.macKey,
    });
    const cap = (runner.authorize(h.store, req) as any).value;
    const outcome = (await runner.invokeOnce(cap, req)) as any;
    expect((await commitResponse(h, responseFrom(req, outcome))).ok).toBe(true);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
    const input = InitialSetupInputSchema.parse(session.input.value);
    const decision = JSON.parse(Buffer.from(outcome.raw).toString("utf8"));
    const publisher = new InitialSetupPublisher(h.store);
    const forged = (verdict: "SCOPE_AUTHORIZED" | "SCOPE_REFUSED") =>
      scopeDecisionRecord({
        campaign_id: req.campaign_id,
        task_id: req.task_id,
        world_id: input.world_id,
        locus_id: input.locus_id,
        input_hash: req.input_hash,
        setup_input: { fact_key: session.input.key, version: session.input.version },
        reservation: req.reservation,
        response: { fact_key: session.scopeResponse!.key, version: session.scopeResponse!.version },
        decision,
        verdict,
        claimed_model: null,
      });
    expect((await publisher.scopeDecision(forged("SCOPE_AUTHORIZED"))).ok).toBe(false);
    expect((await publisher.scopeDecision(forged("SCOPE_REFUSED"))).ok).toBe(true);
    // and the refusal Disposition the service would write carries no rejection code
    const refused = await publisher.disposition({
      world_id: input.world_id,
      locus_id: input.locus_id,
      setup_id: intake.setup_id!,
      input: { fact_key: session.input.key, version: session.input.version },
      reason: "SCOPE_REFUSED",
      phase: "SCOPE",
      response: { fact_key: session.scopeResponse!.key, version: session.scopeResponse!.version },
      rejection_code: null,
      explanation: "FIXED_SOURCE_UNSUPPORTED",
    });
    expect(refused.ok).toBe(true);
    void reasonOf;
  });

  it("OWNER-BACKED FIXTURE positive, labelled: a canonical source whose own value is the exact token CLOSED supports a fixed DOMAIN_BOUNDARY end to end", async () => {
    // T1 fixture instance: the source's statement is literally the enum token. It proves the mechanism through the real owners and
    // strict replay; it does not claim that any real player-authored source supplies engine tokens.
    const open = await openFixtureCampaign("campaign-bootstrap-1", { statement: "CLOSED" });
    const fixedScene = scene({ closure: "CLOSED" }, (sel, input) => {
      const source = (input["genesis"] as any[]).find((g) => g.fact_key.includes("/source/"))!;
      const pin = { fact_key: source.fact_key, version: source.version };
      const strings = [...sourceStringValues(source.value)].filter(
        (s) => s.trim() === s && s !== "CLOSED",
      );
      const [a, b, c] = strings;
      let provenance = sel.provenance;
      const apply = (path: string) => {
        provenance = provenance.map((p) =>
          p.path === path
            ? ({
                ...p,
                origin: "PLAYER_AUTHORED",
                grant: null,
                evidence_quotes: [],
                source_refs: [pin],
              } as any)
            : p,
        );
      };
      ["domain.designation", "domain.topology", "closure.kind", "closure.ground"].forEach(apply);
      return {
        ...sel,
        domain: { designation: a!, topology: b! },
        closure: { kind: "CLOSED", ground: c! },
        provenance,
      };
    });
    const r = await run(
      { scope: fixedDomainScope, scene: fixedScene },
      FIXTURE_SETUP_MESSAGE,
      open,
    );
    expect(r.result.status).toBe("COMPLETED");
    // a correctly delegated end/ground is not refused merely because DOMAIN_BOUNDARY is fixed
    const completion = InitialLocalityCompletionSchema.parse(
      scanInitialSetup(factsOf(r.h.store)).completion!.value,
    );
    const byPath = new Map(completion.selection.provenance.map((p) => [p.path, p]));
    expect(byPath.get("coverage.end")).toMatchObject({ origin: "PLAYER_DELEGATED" });
    expect(byPath.get("coverage.ground")).toMatchObject({ origin: "PLAYER_DELEGATED" });
    expect(byPath.get("closure.kind")).toMatchObject({ origin: "PLAYER_AUTHORED", grant: null });
    await r.h.campaign.close();
    const reopened = await must(reopenFixtureCampaign(r.h.dir));
    expect(scanInitialSetup(factsOf(reopened.store)).completion).toBeDefined();
    await reopened.close();
  });

  it("on that same fixed basis a leaf different from its source value, a delegated fixed leaf and a missing enum witness are each refused", async () => {
    const make = (mutate: (sel: Selection, pin: any) => Selection) =>
      scene({ closure: "CLOSED" }, (sel, input) => {
        const source = (input["genesis"] as any[]).find((g) => g.fact_key.includes("/source/"))!;
        const pin = { fact_key: source.fact_key, version: source.version };
        const strings = [...sourceStringValues(source.value)].filter(
          (s) => s.trim() === s && s !== "CLOSED",
        );
        const fixedPaths = [
          "domain.designation",
          "domain.topology",
          "closure.kind",
          "closure.ground",
        ];
        const lawful: Selection = {
          ...sel,
          domain: { designation: strings[0]!, topology: strings[1]! },
          closure: { kind: "CLOSED", ground: strings[2]! },
          provenance: sel.provenance.map((p) =>
            fixedPaths.includes(p.path)
              ? ({
                  ...p,
                  origin: "PLAYER_AUTHORED",
                  grant: null,
                  evidence_quotes: [],
                  source_refs: [pin],
                } as any)
              : p,
          ),
        };
        return mutate(lawful, pin);
      });
    const open = () => openFixtureCampaign("campaign-bootstrap-1", { statement: "CLOSED" });
    const cases: [string, (sel: Selection, pin: any) => Selection, string][] = [
      [
        "a fixed leaf that is not a source value, even with a valid quote",
        (sel) => ({
          ...sel,
          domain: { ...sel.domain, designation: "woodlot" },
          provenance: set(sel.provenance, "domain.designation", { evidence_quotes: ["a woodlot"] }),
        }),
        "PROVENANCE_FIXED",
      ],
      [
        "a PLAYER_DELEGATED leaf of a fixed facet",
        (sel) => ({
          ...sel,
          provenance: set(sel.provenance, "domain.topology", {
            origin: "PLAYER_DELEGATED",
            source_refs: [],
            grant: sel.provenance.find((p) => p.path === "coverage.end")!.grant,
          }),
        }),
        "PROVENANCE_FACET",
      ],
      [
        "a fixed enum authored without its source witness",
        (sel) => ({ ...sel, provenance: set(sel.provenance, "closure.kind", { source_refs: [] }) }),
        "PROVENANCE_ENUM",
      ],
    ];
    for (const [label, mutate, code] of cases) {
      const r = await run(
        { scope: fixedDomainScope, scene: make(mutate) },
        FIXTURE_SETUP_MESSAGE,
        await open(),
      );
      expect(refusalCode(r), label).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Pure guards (labelled: GUARD-ONLY counterfactuals over synthetic pinned data, not owner-backed positives)
// ---------------------------------------------------------------------------------------------------------------------

const PIN = { fact_key: "world/w/locus/l/source/s", version: 1 };
const genesisOf = (value: unknown) => new Map([[`${PIN.fact_key}@${PIN.version}`, value]]);
const facets = (over: Partial<Record<string, Partial<FacetAuthority>>> = {}): FacetAuthority[] =>
  (["DOMAIN_BOUNDARY", "ACTOR_COVERAGE", "SOURCE_CLAIMS", "WORKFORCE_COVERAGE"] as const).map(
    (facet) =>
      ({
        facet,
        mode: "DELEGATED",
        evidence_quotes: [],
        source_refs: [],
        ...over[facet],
      }) as FacetAuthority,
  );
const fixed = (facet: string) => ({
  [facet]: { mode: "FIXED_BY_SOURCE" as const, source_refs: [PIN] },
});
const restriction = (predicate: string) => [{ predicate, evidence_quote: "q" }] as any;

describe("C-2 pure guards (GUARD-ONLY: synthetic pinned data, not owner-backed positives)", () => {
  it("sourceStringValues reads decoded string members at any depth - never object keys or wrapper metadata", () => {
    const v = { "key-not-a-value": ["a", { deep: ["b", 3, null] }], n: "c" };
    expect([...sourceStringValues(v)].sort()).toEqual(["a", "b", "c"]);
    expect(sourceTextArrays(v)).toEqual([]); // no array of solely Text strings, however deep
    expect(sourceTextArrays({ x: ["p", "q"], y: [["r"]], z: [] })).toEqual([["p", "q"], ["r"]]);
  });

  it("every path maps to exactly one facet except the three coverage paths", () => {
    expect(leafFacet("actors.constraints[3]")).toBe("ACTOR_COVERAGE");
    expect(leafFacet("source_claims[0].claimant")).toBe("SOURCE_CLAIMS");
    expect(leafFacet("closure.ground")).toBe("DOMAIN_BOUNDARY");
    expect(leafFacet("workforce.scope_statement")).toBe("WORKFORCE_COVERAGE");
    for (const p of ["coverage.start", "coverage.end", "coverage.ground"])
      expect(leafFacet(p)).toBeNull();
  });

  it("feasibility: a fixed closure needs exactly one legal enum value compatible with the restrictions (ambiguity refuses, a restriction can disambiguate)", () => {
    const both = genesisOf({ a: "CLOSED", b: "OPEN", c: "text" });
    expect(fixedSourceViolation(facets(fixed("DOMAIN_BOUNDARY")), [], both)).toContain("ambiguous");
    expect(
      fixedSourceViolation(
        facets(fixed("DOMAIN_BOUNDARY")),
        restriction("REQUIRE_CLOSED_DOMAIN"),
        both,
      ),
    ).toBeNull();
    expect(
      fixedSourceViolation(
        facets(fixed("DOMAIN_BOUNDARY")),
        restriction("REQUIRE_OPEN_DOMAIN"),
        genesisOf({ a: "CLOSED", c: "t" }),
      ),
    ).toContain("no legal enum");
    expect(
      fixedSourceViolation(facets(fixed("DOMAIN_BOUNDARY")), [], genesisOf({ c: "t" })),
    ).toContain("no legal enum");
    expect(fixedSourceViolation(facets(), [], genesisOf({}))).toBeNull(); // nothing fixed, nothing to support
  });

  it("feasibility: a non-empty fixed actor set needs ONE unambiguous actual ordered Text[]; identical arrays count once", () => {
    const f = facets(fixed("ACTOR_COVERAGE"));
    const one = genesisOf({
      k: "ACTOR_PRODUCER_REQUIRED",
      list: ["x", "y"],
      again: { list: ["x", "y"] },
    });
    expect(fixedSourceViolation(f, [], one)).toBeNull();
    expect(
      fixedSourceViolation(
        f,
        [],
        genesisOf({ k: "ACTOR_PRODUCER_REQUIRED", list: ["x", "y"], other: ["y", "x"] }),
      ),
    ).toContain("more than one distinct Text[]");
    expect(
      fixedSourceViolation(f, [], genesisOf({ k: "ACTOR_PRODUCER_REQUIRED", t: "x" })),
    ).toContain("actual ordered Text[]");
    // NONE_IN_DOMAIN forces zero constraints by schema: no array is needed
    expect(fixedSourceViolation(f, [], genesisOf({ k: "NONE_IN_DOMAIN", t: "x" }))).toBeNull();
    expect(
      fixedSourceViolation(
        f,
        restriction("NO_NON_PC_ACTORS"),
        genesisOf({ k: "NONE_IN_DOMAIN", j: "ACTOR_PRODUCER_REQUIRED" }),
      ),
    ).toBeNull();
  });

  it("feasibility: a source cited by a fixed facet must be an admitted Input-pinned fact", () => {
    expect(fixedSourceViolation(facets(fixed("WORKFORCE_COVERAGE")), [], new Map())).toContain(
      "not an admitted",
    );
    expect(
      fixedSourceViolation(facets(fixed("WORKFORCE_COVERAGE")), [], genesisOf({ t: "x" })),
    ).toBeNull();
    expect(
      fixedSourceViolation(facets(fixed("WORKFORCE_COVERAGE")), [], genesisOf({ n: 1 })),
    ).toContain("no Text string");
  });

  const baseSelection = (over: Partial<Selection> = {}): Selection => {
    const sel: Selection = {
      domain: { designation: "d", topology: "t" },
      closure: { kind: "CLOSED", ground: "g" },
      actors: { kind: "ACTOR_PRODUCER_REQUIRED", constraints: ["x", "y"], ground: "ag" },
      source_claims: [{ source: PIN, kind: "NONE_ESTABLISHED", claimant: null, ground: "sg" }],
      workforce: { scope_statement: "w" },
      coverage: {
        start: { unit: "seconds", value: 0 },
        end: { unit: "seconds", value: 9 },
        ground: "cg",
      },
      provenance: [],
      ...over,
    };
    const grant = { fact_key: "g", version: 1 };
    sel.provenance = selectionLeafPaths(sel).map((path) =>
      path === "coverage.start"
        ? {
            path,
            origin: "PLAYER_AUTHORED",
            source_refs: [],
            evidence_quotes: ["stmt"],
            grant: null,
          }
        : { path, origin: "PLAYER_DELEGATED", source_refs: [], evidence_quotes: [], grant },
    ) as any;
    return sel;
  };
  const ctx = (selection: Selection, f: FacetAuthority[], genesis = genesisOf({})) => ({
    selection,
    setupMessage: "msg",
    chronologyStatement: "stmt",
    grant: { fact_key: "g", version: 1 },
    facets: f,
    genesis,
  });

  it("a fixed DOMAIN_BOUNDARY basis does not refuse a correctly delegated coverage.end / coverage.ground / other-facet leaf", () => {
    const sel = baseSelection();
    const authoredFixed = {
      ...sel,
      provenance: sel.provenance.map((p) =>
        ["domain.designation", "domain.topology", "closure.kind", "closure.ground"].includes(p.path)
          ? { ...p, origin: "PLAYER_AUTHORED", grant: null, source_refs: [PIN] }
          : p,
      ),
    } as Selection;
    const g = genesisOf({ designation: "d", topology: "t", g: "g", k: "CLOSED" });
    expect(provenanceViolation(ctx(authoredFixed, facets(fixed("DOMAIN_BOUNDARY")), g))).toBeNull();
    // and a delegated leaf of the fixed facet is not a delegated selection
    expect(provenanceViolation(ctx(sel, facets(fixed("DOMAIN_BOUNDARY")), g))).toMatchObject({
      code: "PROVENANCE_FACET",
    });
  });

  it("a fixed actor set equals the one source array in order and cardinality: a permutation or a shorter set refuses", () => {
    const f = facets(fixed("ACTOR_COVERAGE"));
    const g = genesisOf({ k: "ACTOR_PRODUCER_REQUIRED", g: "ag", list: ["x", "y"] });
    const authoredActors = (sel: Selection): Selection =>
      ({
        ...sel,
        provenance: sel.provenance.map((p) =>
          p.path.startsWith("actors.")
            ? { ...p, origin: "PLAYER_AUTHORED", grant: null, source_refs: [PIN] }
            : p,
        ),
      }) as Selection;
    expect(provenanceViolation(ctx(authoredActors(baseSelection()), f, g))).toBeNull();
    const permuted = baseSelection({
      actors: { kind: "ACTOR_PRODUCER_REQUIRED", constraints: ["y", "x"], ground: "ag" },
    });
    expect(provenanceViolation(ctx(authoredActors(permuted), f, g))).toMatchObject({
      code: "PROVENANCE_FIXED",
    });
    const shorter = baseSelection({
      actors: { kind: "ACTOR_PRODUCER_REQUIRED", constraints: ["x"], ground: "ag" },
    });
    expect(provenanceViolation(ctx(authoredActors(shorter), f, g))).toMatchObject({
      code: "PROVENANCE_FIXED",
    });
  });

  it("a changed pin: a quote cited from a fact at another version is not the Input-pinned fact", () => {
    const sel = baseSelection();
    const stale = {
      ...sel,
      provenance: sel.provenance.map((p) =>
        p.path === "domain.designation"
          ? { ...p, origin: "PLAYER_AUTHORED", grant: null, source_refs: [{ ...PIN, version: 2 }] }
          : p,
      ),
    } as Selection;
    expect(provenanceViolation(ctx(stale, facets(), genesisOf({ d: "d" })))).toMatchObject({
      code: "PROVENANCE_REF",
    });
  });

  it("genesisValueIndex admits only Input-pinned facts at exactly their pinned version", () => {
    const m = genesisValueIndex({ genesis: [PIN] } as any, [
      { fact_key: PIN.fact_key, version: 1, value: "ok" },
      { fact_key: PIN.fact_key, version: 2, value: "newer" },
      { fact_key: "other", version: 1, value: "x" },
    ]);
    expect([...m.keys()]).toEqual([`${PIN.fact_key}@1`]);
  });
});

void FIXTURE_POLICY;
void ({} as Harness);
