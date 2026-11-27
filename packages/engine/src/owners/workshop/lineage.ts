import type { CommitGroup } from "@immortalis/contracts";
import {
  WorkshopCharterSchema,
  workshopCharterKey,
} from "../../../../contracts/src/workshop-opening.ts";
import type { CampaignState } from "../../commit/campaign-core.ts";
import { selectWorkshopGeneration, type WorkshopGenerationCandidate } from "./generation.ts";
import { resolveWorkshopKey } from "./registry.ts";
import { WORKSHOP_CHARTER_RULE } from "./source.ts";

/**
 * Where a workshop lineage's original policy comes from. It is read from the committed charter and from nothing else:
 *   BOUND/STATE   the lineage already has its charter; the generation that charter recomputes to governs every later group.
 *   BOUND/CHARTER the group being judged IS the lineage's first charter; the generation its recorded policy recomputes to is
 *                 selected here, and the charter's own derivation then has to reproduce that group byte for byte under it.
 *   UNBOUND       no charter exists and none is being written: there is no recorded policy to honour.
 *   UNKNOWN       a charter exists (or is being written) whose recorded policy no candidate recomputes to: refused, not interpreted.
 */
export type WorkshopLineage =
  | {
      readonly status: "BOUND";
      readonly by: "STATE" | "CHARTER";
      readonly candidate: WorkshopGenerationCandidate;
    }
  | { readonly status: "UNBOUND" }
  | { readonly status: "UNKNOWN"; readonly by: "STATE" | "CHARTER" };

export function bindWorkshopLineage(
  candidates: readonly WorkshopGenerationCandidate[],
  group: CommitGroup,
  state: CampaignState,
): WorkshopLineage {
  const committed = WorkshopCharterSchema.safeParse(
    state.facts.get(workshopCharterKey(state.campaign_id))?.value,
  );
  // a lineage's generation is immutable: once a charter is committed, no later group (a second charter included) can choose another
  if (committed.success) {
    const candidate = selectWorkshopGeneration(
      candidates,
      committed.data.policy,
      WORKSHOP_CHARTER_RULE,
    );
    return candidate
      ? { status: "BOUND", by: "STATE", candidate }
      : { status: "UNKNOWN", by: "STATE" };
  }
  const own = group.writes.find(
    (w) => resolveWorkshopKey(w.key)?.id === "gip_local_completion_notice_charter",
  );
  if (!own) return { status: "UNBOUND" };
  const parsed = WorkshopCharterSchema.safeParse(own.value);
  const candidate = parsed.success
    ? selectWorkshopGeneration(candidates, parsed.data.policy, WORKSHOP_CHARTER_RULE)
    : undefined;
  return candidate
    ? { status: "BOUND", by: "CHARTER", candidate }
    : { status: "UNKNOWN", by: "CHARTER" };
}
