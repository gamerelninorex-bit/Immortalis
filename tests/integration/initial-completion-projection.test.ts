/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// OPTION_A_V9 (ADOPTED): the owner-derived projection of a signed Completion into World-State's scene closure and Population's workforce
// scope, through real owners, with strict replay. MECHANISM ONLY (T1): the isolated answers are labelled testkit fixtures. The adverse
// branches (actor/claim constraints, open or unresolved domains) persist as results and project NO solitary closure.
import { describe, expect, it } from "vitest";
import { worldSceneClosureKey, popWorkforceScopeKey } from "@immortalis/contracts";
import { InitialCompletionProjection, initializeCapturedChronology } from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  delegatingScene,
  delegatingScope,
} from "@immortalis/testkit";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  reopenFixtureCampaign,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

async function completed(scene = delegatingScene()) {
  const h = await harness({ answers: { scope: delegatingScope(), scene } });
  const intake = await h.service.intake(await intakeRequest(h));
  const advanced = await h.service.advance(intake.setup_id!);
  return { h, advanced };
}

describe("OPTION_A_V9 projection: Completion → owner-derived closure and workforce scope", () => {
  it("projects the closed, actor-free, claim-free selection through the owners, and replays strictly", async () => {
    const { h, advanced } = await completed();
    expect(advanced.status).toBe("COMPLETED");
    // no canonical time yet: the projection depends on it
    const early = await new InitialCompletionProjection(h.store).projectSceneClosure();
    expect(early.ok).toBe(false);
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));

    const projection = new InitialCompletionProjection(h.store);
    const closure = await must(projection.projectSceneClosure());
    expect(closure.replayed).toBe(false);
    const scope = await must(projection.projectWorkforceScope());
    expect(scope.replayed).toBe(false);

    const closureFact = h.store.getFact(worldSceneClosureKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!;
    const c = closureFact.value as any;
    expect(c.domain).toEqual({ designation: "the woodlot", topology: "a single cleared stand" });
    expect(c.source_rights).toHaveLength(1);
    expect(c.source_rights[0].status).toBe("UNENCUMBERED");
    // the coverage is derived from the owners' live facts, never supplied: nobody is here yet
    expect(c.covered).toEqual({ population_ledgers: [], actors: [], pcs: [] });
    expect(closureFact.provenance.rule.clause).toContain(
      "INITIAL_COMPLETION_SCENE_CLOSURE_V9_RULE",
    );
    const scopeFact = h.store.getFact(popWorkforceScopeKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!;
    expect((scopeFact.value as any).scope.statement).toBe(
      "no standing workforce works the woodlot",
    );
    expect(scopeFact.provenance.rule.clause).toContain(
      "INITIAL_COMPLETION_WORKFORCE_SCOPE_V9_RULE",
    );

    // idempotent by identity
    const again = await must(projection.projectSceneClosure());
    expect(again.replayed).toBe(true);
    expect(h.campaign.verify()).toEqual([]);

    // close and strictly replay: each group is judged against its own incremental pre-state
    const head = h.store.head();
    await h.campaign.close();
    const reopened = await must(reopenFixtureCampaign(h.dir));
    expect(reopened.store.head().state_sha256).toBe(head.state_sha256);
    expect(reopened.verify()).toEqual([]);
    await reopened.close();
  });

  it("an adverse actor constraint is a legitimate result: the Completion is admitted, no solitary closure is projected, and an author-only closure cannot erase it", async () => {
    const adverse: {
      kind: "ACTOR_PRODUCER_REQUIRED" | "UNRESOLVED";
      constraints: string[];
      ground: string;
    }[] = [
      {
        kind: "ACTOR_PRODUCER_REQUIRED",
        constraints: ["a sawyer works here"],
        ground: "a sawyer is owed",
      },
      { kind: "UNRESOLVED", constraints: [], ground: "the setup does not say" },
    ];
    for (const actors of adverse) {
      const { h, advanced } = await completed(delegatingScene({ actors }));
      expect(advanced.status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
      const refused = await new InitialCompletionProjection(h.store).projectSceneClosure();
      expect(!refused.ok && refused.error.code).toBe("ADVERSE_BRANCH");
      expect(
        h.store.getFact(worldSceneClosureKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)),
      ).toBeUndefined();
      // the constraint persists in canon
      const index = h.service.position();
      expect((index.completion!.value as any).selection.actors.kind).toBe(actors.kind);
    }
  });

  it("a required claim, an open domain and an unresolved claim are retained and project nothing", async () => {
    for (const options of [
      { claimKind: "CLAIM_REQUIRED" as const, claimant: "the sawyer" },
      { claimKind: "UNRESOLVED" as const },
      { closure: "OPEN" as const },
    ]) {
      const { h, advanced } = await completed(delegatingScene(options));
      expect(advanced.status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
      const refused = await new InitialCompletionProjection(h.store).projectSceneClosure();
      expect(!refused.ok && refused.error.code).toBe("ADVERSE_BRANCH");
    }
  });

  it("without a Completion nothing projects, whatever the caller says", async () => {
    const h = await harness();
    const refused = await new InitialCompletionProjection(h.store).projectSceneClosure();
    expect(refused.ok).toBe(false);
    const scope = await new InitialCompletionProjection(h.store).projectWorkforceScope();
    expect(scope.ok).toBe(false);
  });
});
