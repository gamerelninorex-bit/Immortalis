/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — clarification C-1 (Sovereign-ratified v0.4): the producer-input identity, byte-equal delivery, the
// task-id-only echo (INITIAL_LOCALITY_PARSER_V2), the context-manifest evidence and its terminal INVALID_OUTPUT, the immutable
// instruction registry and the frozen V1 fixture history. Each case changes ONE premise and asserts the real owner's or runner's refusal.
// MECHANISM ONLY (T1): the scripted driver and fixture proofs stand in for the isolated model and the message proofs; the manifest
// attests the declared visible context, not a provider's invisible behaviour. T2/T3 remain UNRUN (OB-030).
import { describe, expect, it } from "vitest";
import {
  INITIAL_LOCALITY_PARSER_V1,
  INITIAL_LOCALITY_PARSER_V2,
  CONTEXT_MANIFEST_MISMATCH,
  InitialSetupInputSchema,
  canonicalJson,
  type InitialSetupDisposition,
} from "@immortalis/contracts";
import {
  INSTRUCTIONS_V1,
  INSTRUCTIONS_V2,
  InitialSetupPublisher,
  buildProducerInput,
  contextManifestHashOf,
  deliveredProducerBytesViolation,
  genesisProjection,
  instructionMapHash,
  resolveInstructionMap,
  scanInitialSetup,
  sha256Bytes,
  allowedParsers,
  PRODUCTION_INITIAL_SETUP_POLICY,
  buildInputGroup,
  initialSetupGroupCheck,
} from "@immortalis/engine";
import {
  InitialSetupService,
  LEGACY_V1_RUNNER_PROFILE,
  PrivateRunner,
  authorizeOperatorDisposition,
} from "@immortalis/operator";
import {
  ScriptedIsolatedDriver,
  delegatingScene,
  delegatingScope,
  generateFixtureRunnerKeys,
} from "@immortalis/testkit";
import {
  BOOTSTRAP_CAMPAIGN,
  FIXTURE_POLICY,
  commitResponse,
  factsOf,
  harness,
  intakeRequest,
  reasonOf,
  reopenFixtureCampaign,
  responseFrom,
  scopeDispatchRequest,
  scratch,
  type Harness,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

const answers = { scope: delegatingScope(), scene: delegatingScene() };
const WRONG_MANIFEST = "a".repeat(64);

/** A fresh service + runner over the SAME campaign store, key and outbox: a process restart. */
const restart = (
  h: Harness,
  driver: ScriptedIsolatedDriver,
  extra: { profile?: typeof LEGACY_V1_RUNNER_PROFILE; policy?: any } = {},
): InitialSetupService =>
  new InitialSetupService({
    campaignId: BOOTSTRAP_CAMPAIGN,
    store: h.store,
    runner: new PrivateRunner({
      keyId: h.keys.keyId,
      privateKeyPkcs8Base64: h.keys.privateKeyPkcs8Base64,
      publicKeySpkiBase64: h.keys.publicKeySpkiBase64,
      driver,
      outboxDir: h.outboxDir,
      macKey: h.macKey,
      ...(extra.profile ? { profile: extra.profile } : {}),
    }),
    verifier: h.verifier as any,
    policy: extra.policy ?? FIXTURE_POLICY,
  });

/** A runner with its OWN empty outbox over the harness key: it has never seen the reservation, so any refusal is the pre-send check. */
const coldRunner = (h: Harness, driver: ScriptedIsolatedDriver, profile?: any) =>
  new PrivateRunner({
    keyId: h.keys.keyId,
    privateKeyPkcs8Base64: h.keys.privateKeyPkcs8Base64,
    publicKeySpkiBase64: h.keys.publicKeySpkiBase64,
    driver,
    outboxDir: scratch("immortalis-bootstrap-outbox-"),
    macKey: h.macKey,
    ...(profile ? { profile } : {}),
  });

/** A session whose SCOPE reservation is committed but whose send window never produced a Response. */
async function reservedScope() {
  const crashing = new ScriptedIsolatedDriver(answers, { throwAfterSend: true });
  const h = await harness({ driver: crashing });
  const intake = await h.service.intake(await intakeRequest(h));
  expect((await h.service.advance(intake.setup_id!)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
  return { h, setupId: intake.setup_id!, req: scopeDispatchRequest(h, intake.setup_id!) };
}

const dispositionFor = (
  h: Harness,
  setupId: string,
  over: Partial<InitialSetupDisposition>,
): InitialSetupDisposition => {
  const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
  const input = InitialSetupInputSchema.parse(session.input.value);
  return {
    world_id: input.world_id,
    locus_id: input.locus_id,
    setup_id: setupId,
    input: { fact_key: session.input.key, version: session.input.version },
    reason: "INVALID_OUTPUT",
    phase: "SCOPE",
    response: null,
    rejection_code: null,
    explanation: "forged for the falsifier",
    ...over,
  };
};

describe("C-1 identity: P, H, T and D are rebuilt, never trusted, and delivery is byte-equal", () => {
  it("D is canonical(P + task_id); H is the hash of P without task_id; T binds H; and the bytes the driver receives ARE D", async () => {
    const driver = new ScriptedIsolatedDriver(answers);
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    await h.service.advance(intake.setup_id!);
    const req = scopeDispatchRequest(h, intake.setup_id!);
    const delivered = driver.calls[0]!.producerInput;
    // the bytes handed to the isolated context are byte-identical to the engine-built D
    expect(Buffer.compare(Buffer.from(delivered), Buffer.from(req.producerInput))).toBe(0);
    const parsed = JSON.parse(Buffer.from(delivered).toString("utf8")) as Record<string, unknown>;
    const { task_id, ...p } = parsed;
    // H hashes P (task_id omitted); the reservation's input_hash is H, not the hash of D
    expect(sha256Bytes(Buffer.from(canonicalJson(p), "utf8"))).toBe(req.input_hash);
    expect(sha256Bytes(delivered)).not.toBe(req.input_hash);
    expect(task_id).toBe(req.task_id);
    expect(Buffer.from(delivered).toString("utf8")).toBe(canonicalJson({ ...p, task_id }));
    // and the producer object itself carries no input_hash member for the model to copy
    expect(Object.keys(parsed)).not.toContain("input_hash");
  });

  it("deliveredProducerBytesViolation: the exact bytes pass; a whitespace, key-order, changed-content or other-identity variant does not", async () => {
    const { h, req } = await reservedScope();
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(req.setup_id)!;
    const expected = {
      campaign_id: req.campaign_id,
      setup_id: req.setup_id,
      phase: req.phase,
      input: { fact_key: session.input.key, version: session.input.version },
      task_id: req.task_id,
      input_hash: req.input_hash,
    };
    expect(deliveredProducerBytesViolation(req.producerInput, expected)).toBeNull();
    const parsed = JSON.parse(Buffer.from(req.producerInput).toString("utf8"));
    const same = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v), "utf8"));
    // the same parsed object, whitespace-different
    const pretty = new Uint8Array(Buffer.from(JSON.stringify(parsed, null, 2), "utf8"));
    expect(deliveredProducerBytesViolation(pretty, expected)).toContain("exact canonical bytes");
    // the same parsed object, key order reversed (canonical-equivalent value, different bytes)
    const reordered = same(Object.fromEntries(Object.entries(parsed).reverse()));
    expect(deliveredProducerBytesViolation(reordered, expected)).toContain("exact canonical bytes");
    // changed content: the recomputed H no longer matches the reservation's
    const changed = same({ ...parsed, chronology: { ...parsed.chronology, statement: "another" } });
    expect(deliveredProducerBytesViolation(changed, expected)).toContain("pre-task hash");
    // a different task identity echoed inside the bytes
    const otherT = same({ ...parsed, task_id: "b".repeat(64) });
    expect(deliveredProducerBytesViolation(otherT, expected)).toContain("task identity");
    // an expected T that is not the one these bytes derive
    expect(
      deliveredProducerBytesViolation(req.producerInput, { ...expected, task_id: "c".repeat(64) }),
    ).toContain("task identity");
    // an expected Input pin that these bytes do not name
    expect(
      deliveredProducerBytesViolation(req.producerInput, {
        ...expected,
        input: { fact_key: expected.input.fact_key, version: expected.input.version + 1 },
      }),
    ).toBeTruthy();
    // a different phase changes T
    expect(
      deliveredProducerBytesViolation(req.producerInput, { ...expected, phase: "SCENE" }),
    ).toContain("task identity");
    // not UTF-8, not JSON, not an object
    expect(deliveredProducerBytesViolation(new Uint8Array([0xff, 0xfe]), expected)).toContain(
      "UTF-8",
    );
    expect(deliveredProducerBytesViolation(new Uint8Array(Buffer.from("{")), expected)).toContain(
      "JSON",
    );
    expect(deliveredProducerBytesViolation(new Uint8Array(Buffer.from("[]")), expected)).toContain(
      "object",
    );
  });

  it("the runner refuses non-D bytes BEFORE the send window opens: the driver is never called and nothing is marked started", async () => {
    const { h, req } = await reservedScope();
    const spy = new ScriptedIsolatedDriver(answers);
    const runner = coldRunner(h, spy);
    const parsed = JSON.parse(Buffer.from(req.producerInput).toString("utf8"));
    const variants: Record<string, Uint8Array> = {
      whitespace: new Uint8Array(Buffer.from(JSON.stringify(parsed, null, 1), "utf8")),
      keyOrder: new Uint8Array(
        Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse())), "utf8"),
      ),
      content: new Uint8Array(
        Buffer.from(
          canonicalJson({ ...parsed, chronology: { ...parsed.chronology, statement: "other" } }),
          "utf8",
        ),
      ),
    };
    for (const [label, producerInput] of Object.entries(variants)) {
      const forged = { ...req, producerInput };
      const cap = must_(runner.authorize(h.store, forged));
      const out = await runner.invokeOnce(cap, forged);
      expect(out.status, label).toBe("REFUSED");
    }
    expect(spy.calls).toEqual([]);
    // the refusal was retriable: the genuine bytes are still dispatchable by the same runner (nothing was marked started)
    const cap = must_(runner.authorize(h.store, req));
    expect((await runner.invokeOnce(cap, req)).status).toBe("RESPONDED");
    expect(spy.calls).toHaveLength(1);
    expect(
      Buffer.compare(Buffer.from(spy.calls[0]!.producerInput), Buffer.from(req.producerInput)),
    ).toBe(0);
  });
});

describe("C-1 parser V2: the model copies task_id only", () => {
  it("a returned input_hash, a missing task_id and a wrong task_id are each a terminal INVALID_OUTPUT retained without a rerun", async () => {
    const base = delegatingScope()({} as any);
    const cases: Record<string, any> = {
      "returned input_hash": { driver: { echoInputHash: true } },
      "missing task_id": { raw: canonicalJson(base) },
      "wrong task_id": { raw: canonicalJson({ ...base, task_id: "b".repeat(64) }) },
    };
    for (const [label, c] of Object.entries(cases)) {
      const driver = new ScriptedIsolatedDriver(
        answers,
        c.raw ? { rawOverride: { SCOPE: new Uint8Array(Buffer.from(c.raw, "utf8")) } } : c.driver,
      );
      const h = await harness({ driver });
      const intake = await h.service.intake(await intakeRequest(h));
      const r = await h.service.advance(intake.setup_id!);
      expect(r, label).toMatchObject({ status: "TERMINAL", reason: "INVALID_OUTPUT" });
      await restart(h, driver).advance(intake.setup_id!);
      expect(driver.calls, label).toHaveLength(1);
      const d = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.disposition!;
      expect((d.value as any).rejection_code, label).toBeNull();
      expect((d.value as any).response, label).not.toBeNull();
    }
  });

  it("the current (V2) policy is the production default; the frozen V1 policy admits only fixture history", () => {
    expect(allowedParsers(PRODUCTION_INITIAL_SETUP_POLICY)).toEqual([INITIAL_LOCALITY_PARSER_V2]);
    expect(allowedParsers(FIXTURE_POLICY)).toEqual([
      INITIAL_LOCALITY_PARSER_V1,
      INITIAL_LOCALITY_PARSER_V2,
    ]);
    expect(
      allowedParsers({ syntheticEvidence: "REQUIRE", parsers: [INITIAL_LOCALITY_PARSER_V2] }),
    ).toEqual([INITIAL_LOCALITY_PARSER_V2]);
  });

  it("frozen V1 fixture history completes under the fixture policy, is refused under a V2-only policy, and replays byte-for-byte", async () => {
    const driver = new ScriptedIsolatedDriver(answers, { echoInputHash: true });
    const h = await harness({ driver });
    const v1 = restart(h, driver, { profile: LEGACY_V1_RUNNER_PROFILE });
    const intake = await v1.intake(await intakeRequest(h));
    expect(intake.status).toBe("ADMITTED");
    const input = InitialSetupInputSchema.parse(
      scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.input.value,
    );
    expect(input.parser).toBe(INITIAL_LOCALITY_PARSER_V1);
    expect(input.runner.instruction_hash).toBe(instructionMapHash(INSTRUCTIONS_V1));
    expect((await v1.advance(intake.setup_id!)).status).toBe("COMPLETED");

    // retained V1 history strictly replays under the fixture admission and its journal bytes do not change
    const snapshot = (store: Harness["store"]) =>
      canonicalJson(
        store
          .listFacts()
          .map((f) => [f.key, f.version, f.value] as const)
          .sort((a, b) => a[0].localeCompare(b[0])),
      );
    const before = snapshot(h.store);
    await h.campaign.close();
    const reopened = await must(reopenFixtureCampaign(h.dir));
    expect(snapshot(reopened.store)).toBe(before);
    await reopened.close();

    // the SAME V1 Input offered, as a new bootstrap Input, to a clean clone under each admission policy: only the fixture policy that
    // still lists the frozen V1 admits it; a V2-only fixture policy and the production policy refuse a new V1 route
    const clean = await harness();
    const state = {
      campaign_id: BOOTSTRAP_CAMPAIGN,
      revision: clean.store.head().revision,
      facts: factsOf(clean.store),
    };
    const group = buildInputGroup(
      BOOTSTRAP_CAMPAIGN,
      { get: (k: string) => clean.store.getFact(k) },
      input,
    );
    expect(initialSetupGroupCheck(group, state, FIXTURE_POLICY)).toBeNull();
    const v2Only = initialSetupGroupCheck(group, state, {
      syntheticEvidence: "REQUIRE",
      parsers: [INITIAL_LOCALITY_PARSER_V2],
    });
    expect(v2Only).not.toBeNull();
    expect((v2Only!.details as any)?.reason).toBe("PARSER");
    const production = initialSetupGroupCheck(group, state, PRODUCTION_INITIAL_SETUP_POLICY);
    expect(production).not.toBeNull();
    // and the same Input with parser V2 / the V2 map is the one a V2-only policy admits (the guard is the parser, not the fixture)
    const asV2 = {
      ...input,
      parser: INITIAL_LOCALITY_PARSER_V2 as typeof input.parser,
      runner: { ...input.runner, instruction_hash: instructionMapHash(INSTRUCTIONS_V2) },
    };
    const v2Group = buildInputGroup(
      BOOTSTRAP_CAMPAIGN,
      { get: (k: string) => clean.store.getFact(k) },
      asV2,
    );
    expect(
      initialSetupGroupCheck(v2Group, state, {
        syntheticEvidence: "REQUIRE",
        parsers: [INITIAL_LOCALITY_PARSER_V2],
      }),
    ).toBeNull();
  });

  it("the two parser profiles never mix: a V2 Input answered under V1 (or the reverse) is an invalid Response, and V1 needs the echoed hash", async () => {
    const { h, req } = await reservedScope();
    const right = coldRunner(h, new ScriptedIsolatedDriver(answers));
    const outcome = (await right.invokeOnce(must_(right.authorize(h.store, req)), req)) as any;
    const honest = responseFrom(req, outcome);
    expect(honest.parser).toBe(INITIAL_LOCALITY_PARSER_V2);
    const mixed = await commitResponse(h, { ...honest, parser: INITIAL_LOCALITY_PARSER_V1 });
    expect(mixed.ok).toBe(false);
    // a V1-profile driver that does not echo the hash produces an invalid V1 output, retained terminally
    const driver = new ScriptedIsolatedDriver(answers, { echoInputHash: false });
    const h2 = await harness({ driver });
    const v1 = restart(h2, driver, { profile: LEGACY_V1_RUNNER_PROFILE });
    const intake = await v1.intake(await intakeRequest(h2));
    expect(await v1.advance(intake.setup_id!)).toMatchObject({
      status: "TERMINAL",
      reason: "INVALID_OUTPUT",
    });
  });
});

describe("C-1 instruction registry: the exact historical strings resolve by hash and fail closed otherwise", () => {
  it("both complete maps resolve under their own parser; an unknown hash does not resolve; the maps differ", () => {
    const v1 = resolveInstructionMap(instructionMapHash(INSTRUCTIONS_V1));
    const v2 = resolveInstructionMap(instructionMapHash(INSTRUCTIONS_V2));
    expect(v1).toMatchObject({ parser: INITIAL_LOCALITY_PARSER_V1 });
    expect(v2).toMatchObject({ parser: INITIAL_LOCALITY_PARSER_V2 });
    expect(v1!.map).toBe(INSTRUCTIONS_V1);
    expect(v2!.map).toBe(INSTRUCTIONS_V2);
    expect(instructionMapHash(INSTRUCTIONS_V1)).not.toBe(instructionMapHash(INSTRUCTIONS_V2));
    expect(resolveInstructionMap("0".repeat(64))).toBeNull();
    // the V2 strings never ask the model to copy an input hash; the V1 strings did (that is why V1 is frozen)
    expect(INSTRUCTIONS_V2.SCOPE).not.toContain("input_hash from");
    expect(INSTRUCTIONS_V1.SCOPE).toContain("input_hash from the dispatch header");
    // a frozen map cannot be edited in place
    expect(() => {
      (INSTRUCTIONS_V2 as any).SCOPE = "edited";
    }).toThrow();
  });

  it("the manifest binds the exact phase string AND the exact D bytes: either changing yields another manifest", async () => {
    const { req } = await reservedScope();
    const m = contextManifestHashOf(INSTRUCTIONS_V2.SCOPE, req.producerInput);
    expect(m).toBe(
      sha256Bytes(
        Buffer.from(
          canonicalJson({
            instructions: INSTRUCTIONS_V2.SCOPE,
            producer_input_sha: sha256Bytes(req.producerInput),
          }),
          "utf8",
        ),
      ),
    );
    expect(contextManifestHashOf(`${INSTRUCTIONS_V2.SCOPE} `, req.producerInput)).not.toBe(m);
    const flipped = new Uint8Array(req.producerInput);
    flipped[flipped.length - 2] = flipped[flipped.length - 2]! ^ 1;
    expect(contextManifestHashOf(INSTRUCTIONS_V2.SCOPE, flipped)).not.toBe(m);
  });

  it("an Input that pins an unregistered instruction hash, or another parser's map, is refused by the owner", async () => {
    const h = await harness();
    const intake = await h.service.intake(await intakeRequest(h));
    const input = InitialSetupInputSchema.parse(
      scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.input.value,
    );
    const fresh = async (runner: any) => {
      const other = await harness();
      return new InitialSetupPublisher(other.store).input({ ...input, runner } as any);
    };
    const unknown = await fresh({ ...input.runner, instruction_hash: "d".repeat(64) });
    expect(unknown.ok).toBe(false);
    expect(reasonOf(unknown as any)).toBe("INSTRUCTION_REGISTRY");
    const crossed = await fresh({
      ...input.runner,
      instruction_hash: instructionMapHash(INSTRUCTIONS_V1),
    });
    expect(crossed.ok).toBe(false);
    expect(reasonOf(crossed as any)).toBe("INSTRUCTION_REGISTRY");
  });
});

describe("C-1 manifest evidence: a proved mismatch is a terminal INVALID_OUTPUT that keeps the Response", () => {
  for (const phase of ["SCOPE", "SCENE"] as const) {
    it(`a ${phase} Response whose signed manifest differs from the recomputed one is INVALID_OUTPUT (${CONTEXT_MANIFEST_MISMATCH}), terminal through two restarts, with no second driver call`, async () => {
      const driver = new ScriptedIsolatedDriver(answers, { manifest: { [phase]: WRONG_MANIFEST } });
      const h = await harness({ driver });
      const intake = await h.service.intake(await intakeRequest(h));
      const setupId = intake.setup_id!;
      const r = await h.service.advance(setupId);
      expect(r).toMatchObject({ status: "TERMINAL", reason: "INVALID_OUTPUT" });
      const calls = phase === "SCOPE" ? ["SCOPE"] : ["SCOPE", "SCENE"];
      expect(driver.calls.map((c) => c.phase)).toEqual(calls);

      const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
      const d = session.disposition!.value as any;
      expect(d).toMatchObject({
        reason: "INVALID_OUTPUT",
        phase,
        rejection_code: CONTEXT_MANIFEST_MISMATCH,
      });
      // the Response is RETAINED and the disposition pins it
      const retained = phase === "SCOPE" ? session.scopeResponse : session.sceneResponse;
      expect(retained).toBeDefined();
      expect(d.response).toEqual({ fact_key: retained!.key, version: retained!.version });
      // nothing downstream of the unqualified answer exists
      expect(scanInitialSetup(factsOf(h.store)).completion).toBeUndefined();
      if (phase === "SCOPE") expect(session.grant).toBeUndefined();

      // terminal through two restarts: neither the driver nor a new reservation is touched
      for (let i = 0; i < 2; i += 1) {
        const again = restart(h, driver);
        expect(await again.advance(setupId)).toMatchObject({ status: "TERMINAL" });
      }
      expect(driver.calls.map((c) => c.phase)).toEqual(calls);

      // strict replay: the whole journal re-admits through the incremental replay path
      await h.campaign.close();
      const reopened = await must(reopenFixtureCampaign(h.dir));
      const replayed = scanInitialSetup(factsOf(reopened.store)).sessions.get(setupId)!;
      expect((replayed.disposition!.value as any).rejection_code).toBe(CONTEXT_MANIFEST_MISMATCH);
      await reopened.close();
    });
  }

  it("raw admission: a mismatched Response is retainable but cannot be classified, and only the mismatch disposition is lawful for it", async () => {
    const { h, setupId, req } = await reservedScope();
    const liar = coldRunner(
      h,
      new ScriptedIsolatedDriver(answers, { manifest: { SCOPE: WRONG_MANIFEST } }),
    );
    const outcome = (await liar.invokeOnce(must_(liar.authorize(h.store, req)), req)) as any;
    const committed = await commitResponse(h, responseFrom(req, outcome));
    expect(committed.ok).toBe(true);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
    const response = {
      fact_key: session.scopeResponse!.key,
      version: session.scopeResponse!.version,
    };
    const publisher = new InitialSetupPublisher(h.store);

    // it cannot be filed as a scope refusal / mixed input (qualifying classifications need the matching manifest)
    const refusedAsScope = await publisher.disposition(
      dispositionFor(h, setupId, { reason: "SCOPE_REFUSED", response, rejection_code: null }),
    );
    expect(refusedAsScope.ok).toBe(false);
    expect(reasonOf(refusedAsScope as any)).toBe(CONTEXT_MANIFEST_MISMATCH);
    // INVALID_OUTPUT without the mismatch code is not the lawful record of a manifest mismatch
    const wrongCode = await publisher.disposition(
      dispositionFor(h, setupId, { response, rejection_code: "SOMETHING_ELSE" }),
    );
    expect(wrongCode.ok).toBe(false);
    // the lawful record is admitted
    const lawful = await publisher.disposition(
      dispositionFor(h, setupId, { response, rejection_code: CONTEXT_MANIFEST_MISMATCH }),
    );
    expect(lawful.ok).toBe(true);
  });

  it("a MATCHING valid Response can never be misfiled as INVALID_OUTPUT, with or without the mismatch code", async () => {
    const { h, setupId, req } = await reservedScope();
    const honest = coldRunner(h, new ScriptedIsolatedDriver(answers));
    const outcome = (await honest.invokeOnce(must_(honest.authorize(h.store, req)), req)) as any;
    expect((await commitResponse(h, responseFrom(req, outcome))).ok).toBe(true);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
    const response = {
      fact_key: session.scopeResponse!.key,
      version: session.scopeResponse!.version,
    };
    const publisher = new InitialSetupPublisher(h.store);
    for (const rejection_code of [null, CONTEXT_MANIFEST_MISMATCH]) {
      const misfiled = await publisher.disposition(
        dispositionFor(h, setupId, { response, rejection_code }),
      );
      expect(misfiled.ok, String(rejection_code)).toBe(false);
    }
    expect(scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!.disposition).toBeUndefined();
  });
});

describe("C-1 malformed driver return: the exact bytes are retained and the task parks; nothing is fabricated or rerolled", () => {
  it("a manifest that is not a SHA-256 leaves no Response, parks as PARKED_UNKNOWN with response:null, and is never regenerated", async () => {
    const driver = new ScriptedIsolatedDriver(answers, { manifest: { SCOPE: "MALFORMED" } });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const setupId = intake.setup_id!;
    expect((await h.service.advance(setupId)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect((await restart(h, driver).advance(setupId)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect(driver.calls).toHaveLength(1);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
    expect(session.scopeReservation).toBeDefined();
    expect(session.scopeResponse).toBeUndefined();
    const parked = await h.service.parkUnknown(setupId, authorizeOperatorDisposition());
    expect(parked).toMatchObject({ status: "TERMINAL", reason: "PARKED_UNKNOWN" });
    const d = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!.disposition!.value as any;
    expect(d.response).toBeNull();
    expect(driver.calls).toHaveLength(1);
  });

  it("an oversize raw answer is held the same way (retained in the outbox, no Response, no reroll)", async () => {
    const huge = new Uint8Array(Buffer.alloc(1_100_000, 0x20));
    const driver = new ScriptedIsolatedDriver(answers, { rawOverride: { SCOPE: huge } });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    expect((await h.service.advance(intake.setup_id!)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect((await restart(h, driver).advance(intake.setup_id!)).status).toBe(
      "SCOPE_RESERVED_UNRESOLVED",
    );
    expect(driver.calls).toHaveLength(1);
    expect(
      scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.scopeResponse,
    ).toBeUndefined();
  });
});

describe("C-1 projection of the identity chain on real genesis", () => {
  it("buildProducerInput is a pure function of the canonical Input and the projection: two builds give identical P, H, T and D", async () => {
    const { h, setupId } = await reservedScope();
    const facts = factsOf(h.store);
    const session = scanInitialSetup(facts).sessions.get(setupId)!;
    const input = InitialSetupInputSchema.parse(session.input.value);
    const projection = genesisProjection(facts);
    if (!projection.ok) throw new Error("genesis projection unavailable");
    const args = {
      campaign_id: BOOTSTRAP_CAMPAIGN,
      phase: "SCOPE" as const,
      input_pin: { fact_key: session.input.key, version: session.input.version },
      input,
      genesis: projection.value.facts,
    };
    const a = must_(buildProducerInput(args));
    const b = must_(buildProducerInput(args));
    expect(Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes))).toBe(0);
    expect([a.task_id, a.input_hash]).toEqual([b.task_id, b.input_hash]);
    // another Input pin version yields another T (the identity is bound to the pin)
    const moved = must_(
      buildProducerInput({ ...args, input_pin: { ...args.input_pin, version: 7 } }),
    );
    expect(moved.task_id).not.toBe(a.task_id);
    void generateFixtureRunnerKeys;
  });
});

function must_<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
