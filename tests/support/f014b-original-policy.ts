// Shared fixtures for the F-014B original-policy tests: the vendored genuine journals and the helpers that reopen them.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  composeWorkshopIdentity,
  type WorkshopGeneration,
  type WorkshopIdentityInputs,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { IF6B_POLICY } from "../../packages/engine/src/temporal/if6b-stage.ts";
import { signedWorkshopLaneX, type RetainedLaneXAuthorizations } from "./b3-lane-x.ts";
import { openWorkshop } from "./b3-opening.ts";
import { deterministicFixtureKeys } from "./deterministic-keys.ts";
import { copyPackage } from "../integration/b2-support.ts";

export const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/f014b-original-policy",
);
export const JOURNALS = {
  active: "lane-x-active-quiet-target",
  staged: "lane-x-staged-seal-900",
  occurred: "lane-x-occurred-aftermath-600",
  resumed: "lane-x-interrupted-resumed-900",
  b2: "b2-zero-stage-reconciled",
  b2Prior: "b2-zero-stage-reconciled-at-7281045",
} as const;
export const LANE_X = [
  JOURNALS.active,
  JOURNALS.staged,
  JOURNALS.occurred,
  JOURNALS.resumed,
] as const;

export const metaOf = (name: string) =>
  JSON.parse(readFileSync(join(FIX, "journals", name, "meta.json"), "utf8"));
const retainedOf = (name: string): RetainedLaneXAuthorizations => {
  const meta = metaOf(name);
  if (meta.retainedAuthorizations) return meta.retainedAuthorizations;
  return JSON.parse(readFileSync(join(FIX, "journals", name, "authorizations.json"), "utf8"))
    .retainedAuthorizations;
};
export const headKey = (h: {
  revision: number;
  journal_head_sha256: string;
  state_sha256: string;
}) => ({
  revision: h.revision,
  journal: h.journal_head_sha256,
  state: h.state_sha256,
});

/** A SYNTHETIC successor generation: another identity segment and another catalogue digest. */
export const SUCCESSOR: WorkshopGeneration = Object.freeze({
  id: "SYNTHETIC-SUCCESSOR",
  catalogueSha256: "ab".repeat(32),
  identity: (i: WorkshopIdentityInputs) =>
    composeWorkshopIdentity(i, { if6bPolicy: "SYNTHETIC-SUCCESSOR-SEGMENT+" + IF6B_POLICY }),
});

/**
 * A scratch copy of a vendored package. Git cannot store the empty `history/` directory a closed package carries, and a strict replay writes its
 * history index there, so it is recreated (an empty directory carries no evidence).
 */
export function fixtureCopy(name: string): string {
  return withoutCheckpoints(copyPackage(join(FIX, "journals", name, "package")));
}
/** a package with no checkpoint in its history: whatever opens it can only REPLAY it, group by group, under its own historical verifier */
export function withoutCheckpoints(dir: string): string {
  rmSync(join(dir, "history"), { recursive: true, force: true });
  mkdirSync(join(dir, "history"), { recursive: true });
  return dir;
}

/** reopen a copy of a genuine Lane X journal under a build whose CURRENT generation is `generation` (default: this build's own) */
export async function openGenuineLaneX(name: string, generation?: WorkshopGeneration) {
  const meta = metaOf(name);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h2 = await openWorkshop("glassbell", {
    fixedKeys: deterministicFixtureKeys(meta.keyDerivation.keyId),
    ...(generation
      ? {
          currentGeneration: generation,
          // the harness's own (new) opening is published under the successor's pair, as a successor build would
          historyRef: (id: string) => ({
            historyId: id,
            catalogueSha256: generation.catalogueSha256,
          }),
        }
      : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, true);
      return signed.fixture;
    },
  });
  signed.importAuthorizations(retainedOf(name));
  const dir = fixtureCopy(name);
  const opened = await CanonicalCampaign.open(dir, {
    testkitFixtureAdmission: h2.admission,
  });
  return { meta, h2, signed, opened, dir };
}
