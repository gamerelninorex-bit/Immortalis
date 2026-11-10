import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { pcExistenceContractKey } from "@immortalis/contracts";
import { MsSetupPublisher, GipAdapter, resolveKey, canonicalAdmission } from "@immortalis/engine";
import {
  gipPublication,
  institutionIdentity,
  fixtureContract,
  publication,
} from "@immortalis/testkit";
import { msHarness } from "../support/ms-setup.ts";

describe("MS owners, fixture boundary, raw entry and reverse PC identity", () => {
  it("refuses an unrelated raw owner write in the active window without changing canon, and production still refuses synthetic Input evidence", async () => {
    const h = await msHarness(),
      head = h.store.head();
    const refused = await new GipAdapter(h.store).establishInstitution({
      ...gipPublication(99),
      institution: institutionIdentity("ms-blocked"),
    });
    expect(refused).toMatchObject({ ok: false, error: { details: { reason: "MS_PHASE_FENCE" } } });
    expect(h.store.head()).toEqual(head);
    const input = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_setup_input",
    )!;
    expect(canonicalAdmission.check(input.group, input.before)).toMatchObject({
      details: { reason: "FIXTURE_NAMESPACE" },
    });
    await h.campaign.close();
  });
  it("refuses PC appropriation after MS release independently of the temporary fence", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const s = new MsSetupPublisher(h.store).chain(),
      head = h.store.head();
    expect(
      await h.campaign.releasePlayerCharacter({
        ...publication(990),
        contract: fixtureContract({ pc_id: s.actor }),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "REFERENCE_INVALID",
        message: "an MS existence-bearing identity cannot be appropriated as a PC",
      },
    });
    expect(h.store.getFact(pcExistenceContractKey(s.actor))).toBeUndefined();
    expect(h.store.head()).toEqual(head);
    await h.campaign.close();
  });
  it("keeps the operator sequencer from direct canon publication and limits it to the isolated actor operation", () => {
    const source = readFileSync("packages/operator/src/ms-initial-actor.ts", "utf8");
    expect(source).not.toMatch(
      /\.store\.commit\(|CANON_WRITE_AUTHORITY|permission\.canon\.write|\.registerObject\(|establishWorld\(|releasePlayerCharacter\(/,
    );
    expect(source.match(/this\.runner\.dispatch\(/g)).toHaveLength(1);
    const runner = readFileSync("packages/operator/src/ms-actor-runner.ts", "utf8");
    expect(runner).not.toMatch(/@immortalis\/testkit|SCOPE|SCENE|Math\.random|setTimeout|fetch\(/);
    expect(runner).toContain('format: "immortalis-ms-actor-outbox-v1"');
  });
});
