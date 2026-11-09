/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial raw signed wire records */
import { createPrivateKey, sign } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  InitialActorSetupIssueSchema,
  msActorIssueKey,
  msActorResponseKey,
  type InitialActorSetupResponse,
} from "@immortalis/contracts";
import {
  MsSetupPublisher,
  planMsActor,
  sha256Bytes,
  qualifiedMsResponse,
} from "@immortalis/engine";
import { msHarness } from "../support/ms-setup.ts";

async function reserved() {
  const h = await msHarness(),
    p = new MsSetupPublisher(h.store),
    s = p.chain();
  expect(await p.issue()).toMatchObject({ ok: true });
  const qf = h.store.getFact(msActorIssueKey(s.c.world_id, s.c.locus_id, s.digest))!,
    q = InitialActorSetupIssueSchema.parse(qf.value),
    plan = planMsActor(h.state(), s.cf.key, s.c);
  if (!plan.ok) throw new Error(plan.error.code);
  const cap = h.actorRunner.authorize(h.store, { fact_key: qf.key, version: 1 })!;
  const answer = await h.actorRunner.dispatch(cap, plan.value.instructions, plan.value.bytes);
  if (answer.status !== "RESPONDED") throw new Error(JSON.stringify(answer));
  const response: InitialActorSetupResponse = {
    world_id: q.world_id,
    locus_id: q.locus_id,
    setup_id: q.setup_id,
    completion: q.completion,
    issue: { fact_key: qf.key, version: 1 },
    task_id: q.task_id,
    input_hash: q.input_hash,
    parser: q.parser,
    raw_response_base64: Buffer.from(answer.raw).toString("base64"),
    raw_response_hash: sha256Bytes(answer.raw),
    envelope: answer.envelope,
  };
  const resign = (r: any) => {
    r.envelope.signature = sign(
      null,
      Buffer.from(canonicalJson(r.envelope.body)),
      createPrivateKey({
        key: Buffer.from(h.keys.privateKeyPkcs8Base64, "base64"),
        format: "der",
        type: "pkcs8",
      }),
    ).toString("base64");
    return r;
  };
  return { h, p, s, qf, q, response, resign };
}
describe("MS ActorEnvelopeBody closed nineteen-field partition", () => {
  it("refuses each of eighteen altered fields even when authentically re-signed; context hash has its separate retained case", async () => {
    const { h, p, s, response, resign } = await reserved();
    const changes: Record<string, unknown> = {
      format: "alien",
      format_version: 2,
      runner_id: "alien",
      key_id: "fixture:other-key",
      campaign_id: "other",
      world_id: "other",
      locus_id: "other",
      setup_id: "1".repeat(64),
      phase: "SCENE",
      task_id: "1".repeat(64),
      reservation: { fact_key: "wrong", version: 1 },
      completion: { fact_key: "wrong", version: 1 },
      input_hash: "1".repeat(64),
      instruction_hash: "1".repeat(64),
      driver_id: "fixture:other-driver",
      driver_config_hash: "1".repeat(64),
      parser: "ALIEN_PARSER",
      raw_response_hash: "1".repeat(64),
    };
    expect(Object.keys(changes)).toHaveLength(18);
    for (const [field, value] of Object.entries(changes)) {
      const changed = structuredClone(response) as any;
      changed.envelope.body[field] = value;
      resign(changed);
      expect((await p.response(changed)).ok, field).toBe(false);
      expect(
        h.store.getFact(msActorResponseKey(s.c.world_id, s.c.locus_id, s.digest)),
        field,
      ).toBeUndefined();
    }
    expect(h.calls()).toBe(1);
    await h.campaign.close();
  });
  it("retains a well-typed different context manifest permanently without existence, B1 or time", async () => {
    const h = await msHarness({ manifest: () => "1".repeat(64) });
    expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
    expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
    expect(h.calls()).toBe(1);
    expect(h.store.getFact("temporal/state")).toBeUndefined();
    expect(h.store.listFacts().filter((f) => f.key.startsWith("named-actor/"))).toEqual([]);
    await h.campaign.close();
  });
  it("refuses malformed context, noncanonical raw base64/hash/oversize, signature origin and noncanonical signature", async () => {
    const { h, p, response, resign } = await reserved();
    const variants: (() => any)[] = [
      () => {
        const r = structuredClone(response);
        r.envelope.body.context_manifest_hash = "bad";
        return resign(r);
      },
      () => ({
        ...structuredClone(response),
        raw_response_base64: response.raw_response_base64 + "\n",
      }),
      () => ({ ...structuredClone(response), raw_response_base64: "Zh==" }),
      () => ({ ...structuredClone(response), raw_response_hash: "1".repeat(64) }),
      () => {
        const r = structuredClone(response),
          raw = Buffer.alloc(262145, 32);
        r.raw_response_base64 = raw.toString("base64");
        r.raw_response_hash = sha256Bytes(raw);
        r.envelope.body.raw_response_hash = r.raw_response_hash;
        return resign(r);
      },
      () => {
        const r = structuredClone(response);
        r.envelope.signature = Buffer.alloc(64).toString("base64");
        return r;
      },
      () => {
        const r = structuredClone(response);
        r.envelope.signature += "\n";
        return r;
      },
      () => {
        const r = structuredClone(response);
        r.envelope.signature = Buffer.alloc(63).toString("base64");
        return r;
      },
    ];
    for (const make of variants) expect((await p.response(make())).ok).toBe(false);
    expect(h.calls()).toBe(1);
    await h.campaign.close();
  });
  for (const [name, raw] of Object.entries({
    empty: () => Buffer.alloc(0),
    bom: (task: string) =>
      Buffer.from(
        "\ufeff" + JSON.stringify({ kind: "CONFIRM_INDEX", task_id: task, constraint_index: 0 }),
      ),
    duplicate: (task: string) =>
      Buffer.from(
        `{"kind":"CONFIRM_INDEX","task_id":"${task}","constraint_index":0,"constraint_index":0}`,
      ),
    malformed: () => Buffer.from([0xff]),
    trailing: (task: string) =>
      Buffer.from(
        JSON.stringify({ kind: "CONFIRM_INDEX", task_id: task, constraint_index: 0 }) + "{}",
      ),
    extra: (task: string) =>
      Buffer.from(
        JSON.stringify({
          kind: "CONFIRM_INDEX",
          task_id: task,
          constraint_index: 0,
          name: "Berto",
        }),
      ),
    wrongEcho: () =>
      Buffer.from(
        JSON.stringify({ kind: "CONFIRM_INDEX", task_id: "1".repeat(64), constraint_index: 0 }),
      ),
    nonzero: (task: string) =>
      Buffer.from(JSON.stringify({ kind: "CONFIRM_INDEX", task_id: task, constraint_index: 1 })),
    stringZero: (task: string) =>
      Buffer.from(JSON.stringify({ kind: "CONFIRM_INDEX", task_id: task, constraint_index: "0" })),
    inputHash: (task: string) =>
      Buffer.from(
        JSON.stringify({
          kind: "CONFIRM_INDEX",
          task_id: task,
          constraint_index: 0,
          input_hash: "1".repeat(64),
        }),
      ),
  }))
    it(
      "retains the first signed " + name + " answer as non-qualifying, without reroll",
      async () => {
        const h = await msHarness({ raw });
        expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
        expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
        expect(h.calls()).toBe(1);
        expect(h.store.getFact("temporal/state")).toBeUndefined();
        await h.campaign.close();
      },
    );
  for (const reason of [
    "INSUFFICIENT_CONSTRAINTS",
    "INCOMPATIBLE_CONSTRAINTS",
    "UNSUPPORTED_REFERENCE",
  ])
    it("retains signed UNRESOLVED " + reason + " with no downstream identity/time", async () => {
      const h = await msHarness({
        raw: (task) => Buffer.from(JSON.stringify({ kind: "UNRESOLVED", task_id: task, reason })),
      });
      expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
      expect(await h.actorService.advance()).toEqual({ status: "NON_PRODUCING" });
      expect(h.calls()).toBe(1);
      expect(h.store.getFact("temporal/state")).toBeUndefined();
      await h.campaign.close();
    });
  it("accepts the four source-prescribed numeric spellings of zero under the same engine identity", async () => {
    const { h, qf, q, response, resign } = await reserved();
    for (const spelling of ["0", "0.0", "-0", "0e0"]) {
      const r = structuredClone(response),
        raw = Buffer.from(
          `{"kind":"CONFIRM_INDEX","task_id":"${q.task_id}","constraint_index":${spelling}}`,
        );
      r.raw_response_base64 = raw.toString("base64");
      r.raw_response_hash = sha256Bytes(raw);
      r.envelope.body.raw_response_hash = r.raw_response_hash;
      resign(r);
      expect(qualifiedMsResponse(r, qf, h.campaignId), spelling).toBe(true);
    }
    await h.campaign.close();
  });
});
