// TEST SUPPORT: one REAL I-002 classification decision retained by the referee owner path (scripted host answer, PLUMBING ONLY),
// on a campaign whose world and locus came from the shipped `establish-locality`. Used to show that the one referee operation the
// R1 setup-eligibility predicate admits really is admitted, while the same record with another operation is not.
import { REFEREE_AUTHORITY, refereeDecisionKey, type OwnerFact } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  refereeCandidateItems,
} from "@immortalis/engine";
import { EMPTY_DRAFT, compileContract } from "@immortalis/operator";
import { HOST_ID, PC_ID, WORDS, localityCampaign, plainPolicy } from "./original-pc.ts";

export async function recordedI002(): Promise<{
  readonly i002Key: string;
  readonly fact: OwnerFact;
  readonly all: readonly OwnerFact[];
}> {
  const dirs = await localityCampaign();
  const opened = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "r1-i002" });
  if (!opened.ok) throw new Error("did not open");
  const c = opened.value;
  try {
    const a = new RefereeAdjudicationAdapter(c.store);
    const items = refereeCandidateItems(
      compileContract(PC_ID, {
        ...EMPTY_DRAFT,
        identity: WORDS.identityFinal,
        contact: { kind: "CONTACT_ANCHOR", surfaces: [WORDS.contact] },
        embodiment: WORDS.embodiment,
        continuity: WORDS.continuity,
      })!,
    );
    const { context, task_id } = a.i002Task({ pc_id: PC_ID, attempt: 0, items });
    const answer = plainPolicy({ operation: "I002_CLASSIFY", task_id, context }) as never;
    const r = await a.recordI002({
      operation: { ...REFEREE_AUTHORITY },
      host: { host_id: HOST_ID, claimed_model: null },
      pc_id: PC_ID,
      attempt: 0,
      items,
      answer,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const key = refereeDecisionKey(task_id);
    return { i002Key: key, fact: c.store.getFact(key)!, all: [...c.store.listFacts()] };
  } finally {
    await c.close();
  }
}
