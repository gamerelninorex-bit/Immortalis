/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary host answers */
// The authenticated exchange carrying the CPAA-C1 v0.3 cycle and reach/scene questions to a bound referee host. A scripted responder
// proves TRANSPORT and enforcement only: the bound operations are checked before anything is disclosed or accepted, a question never
// aliases another, an answer the engine refuses is set aside and the question is asked afresh, and a negative reading is retained.
// It is not evidence that an AI understood a sentence.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bindHost,
  collectionRefereeHosts,
  collectionTaskDocument,
  collectionTaskId,
  pendingTasks,
  publishRefereeDocument,
  readTask,
  secretPath,
  submitDecision,
} from "@immortalis/operator";
import { MECH, PC, collectionCampaign, cycleAnswer } from "../support/pc-collection.ts";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "exchange-campaign";
const uid = process.getuid!();
const base = () => ({ stateDir: tempDir("immortalis-collection-exchange-"), campaignId: CAMPAIGN });
const withUid = (p: ReturnType<typeof base>) => ({ ...p, operatorUid: uid });
const secretOf = (p: ReturnType<typeof base>, host: string) =>
  readFileSync(secretPath(p, host), "utf8").trim();

async function bound() {
  const p = base();
  const collection = await bindHost({
    ...withUid(p),
    hostId: "gm-collection",
    operations: ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"],
  });
  const setup = await bindHost({
    ...withUid(p),
    hostId: "gm-setup",
    operations: ["I002_CLASSIFY"],
  });
  expect(collection.ok && setup.ok).toBe(true);
  return p;
}

describe("the collection referee exchange", () => {
  it("discloses and accepts only for a host bound to the operation; a refused answer is set aside and asked afresh; the answer returned is the one the engine accepts", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const p = await bound();
    const hosts = collectionRefereeHosts({ ...withUid(p), polls: 400, pollMs: 5 });
    const asked = hosts.attestHost(task);

    const seen: string[] = [];
    const responder = (async () => {
      for (let i = 0; i < 2000 && seen.length < 2; i++) {
        const pending = (await pendingTasks(p)).filter((t) => !seen.includes(t.task_id));
        if (pending.length === 0) {
          await new Promise((r) => setTimeout(r, 5));
          continue;
        }
        const t = pending[0]!;
        expect(t.operation).toBe("PC_COLLECTION_CYCLE");
        if (seen.length === 0) {
          // a host bound only to another operation can neither answer nor read it
          const refused = await submitDecision(withUid(p), {
            host_id: "gm-setup",
            secret: secretOf(p, "gm-setup"),
            task_id: t.task_id,
            claimed_model: null,
            answer: cycleAnswer(task),
          });
          expect(refused.ok ? "ACCEPTED" : refused.error.code).toBe("OPERATION_NOT_ALLOWED");
          // a task that does not exist is not aliased to this one
          const unknown = await submitDecision(withUid(p), {
            host_id: "gm-collection",
            secret: secretOf(p, "gm-collection"),
            task_id: "0".repeat(64),
            claimed_model: null,
            answer: cycleAnswer(task),
          });
          expect(unknown.ok ? "ACCEPTED" : unknown.error.code).toBe("TASK_UNKNOWN");
          // a reading that answers another task is vouched for but refused by the engine: set aside
          const wrong = await submitDecision(withUid(p), {
            host_id: "gm-collection",
            secret: secretOf(p, "gm-collection"),
            task_id: t.task_id,
            claimed_model: "scripted",
            answer: cycleAnswer(task, { task_digest: "f".repeat(64) }),
          });
          expect(wrong.ok).toBe(true);
        } else {
          const good = await submitDecision(withUid(p), {
            host_id: "gm-collection",
            secret: secretOf(p, "gm-collection"),
            task_id: t.task_id,
            claimed_model: "scripted",
            answer: cycleAnswer(task),
          });
          expect(good.ok).toBe(true);
        }
        seen.push(t.task_id);
      }
    })();

    const answer = (await asked) as any;
    await responder;
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]).toBe(collectionTaskId("PC_COLLECTION_CYCLE", task, 0));
    expect(seen[1]).toBe(collectionTaskId("PC_COLLECTION_CYCLE", task, 1));
    expect(answer.task_digest).toBe(task.digest);
    // and the owner, not the host, still decides: the faithful reading is what the engine then attests
    expect((await s.collect.attestCycle({ pc_id: PC, mechanism_id: MECH, answer })).ok).toBe(true);
  }, 120_000);

  it("a task identity never aliases a changed question or another operation; a retry keeps the original nonce", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const p = await bound();
    const id = collectionTaskId("PC_COLLECTION_CYCLE", task);
    const publish = (
      operation: "PC_COLLECTION_CYCLE" | "PC_COLLECTION_REACH",
      context: any = task,
    ) =>
      publishRefereeDocument(p, {
        task_id: id,
        operation,
        document: (nonce) => collectionTaskDocument(operation, id, context, nonce),
      });
    const first = await publish("PC_COLLECTION_CYCLE");
    expect(first.ok).toBe(true);
    const again = await publish("PC_COLLECTION_CYCLE");
    expect(again.ok && first.ok && again.value.nonce === first.value.nonce).toBe(true);
    const other = await publish("PC_COLLECTION_REACH");
    expect(other.ok ? "ACCEPTED" : other.error.code).toBe("TASK_CONFLICT");
    const changed = await publish("PC_COLLECTION_CYCLE", {
      ...task,
      cycle: { unit: "x", value: 1 },
    });
    expect(changed.ok ? "ACCEPTED" : changed.error.code).toBe("TASK_CONFLICT");
    const stored = await readTask(p, id);
    expect(stored.ok && stored.value.operation).toBe("PC_COLLECTION_CYCLE");
  }, 120_000);

  it("with no host bound to the operation nothing is published and nothing is attested", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const none = base();
    await expect(
      collectionRefereeHosts({ ...withUid(none), polls: 1, pollMs: 1 }).attestHost(task),
    ).rejects.toThrow(/no referee is bound/);
    const onlySetup = base();
    await bindHost({ ...withUid(onlySetup), hostId: "gm-setup", operations: ["I002_CLASSIFY"] });
    await expect(
      collectionRefereeHosts({ ...withUid(onlySetup), polls: 1, pollMs: 1 }).attestHost(task),
    ).rejects.toThrow(/no referee is bound/);
    expect(await pendingTasks(onlySetup)).toEqual([]);
    expect(s.collect.attestation(PC, MECH)).toBeUndefined();
  }, 120_000);

  it("an unanswered question is never defaulted: the bounded wait ends with nothing supplied", async () => {
    const s = await collectionCampaign({ noAttestation: true });
    const task = s.collect.cycleTask(PC, MECH)!;
    const p = await bound();
    await expect(
      collectionRefereeHosts({ ...withUid(p), polls: 2, pollMs: 1 }).attestHost(task),
    ).rejects.toThrow(/has not supplied a valid reading/);
    expect(s.collect.attestation(PC, MECH)).toBeUndefined();
  }, 120_000);
});
