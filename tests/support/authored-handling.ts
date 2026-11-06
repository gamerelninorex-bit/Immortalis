/* eslint-disable @typescript-eslint/no-explicit-any -- scripted fixture and owner facts */
// SCRIPTED MECHANISM ONLY: independently authored handling words; no genuine host interpretation claim.
import { WORDS } from "./chat-character.ts";
import { ACTUATOR, TAU, TRAVERSAL } from "./chat-route.ts";
import { openOrdinary, slot } from "./chat-setting.ts";
import { openingCharacter } from "./two-review-opening.ts";

export const cycle = `I lift and carry one chopped log in ${TAU} second`;
// The first-turn handling words are distinct from the baseline-human seed. The GM must carry them into the first proposal.
export const authoredCharacter = () => {
  const c = openingCharacter();
  c.embodiment = WORDS.embodiment;
  c.exceptions = [ACTUATOR, TRAVERSAL, cycle];
  c.opening.preparation.cycle_quote = cycle;
  return c;
};

export async function ownerState(s: Awaited<ReturnType<typeof slot>>) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    const pc = facts.find((f) => f.owner === "pc_existence" && f.facet === "existence_contract");
    const mechanism = facts.find((f) => f.key.includes("/collection-mechanism/"));
    return {
      head: c.store.head().state_sha256,
      revision: c.store.head().revision,
      source: c.sourceCondition("world-courtyard", "src-loose-stones")!.value.recoverable.amount,
      reserves: facts
        .filter((f) => f.key.startsWith("production/reserve/"))
        .map((f) => (f.value as any).quantity.amount),
      time: (c.store.getFact("temporal/state")?.value as any)?.canonical_time.value ?? null,
      commitments: facts.filter((f) => f.key.endsWith("/commitment")).length,
      pc: pc?.value,
      mechanism: mechanism?.value as any,
      order: [
        pc,
        c.binding()?.fact,
        pc && c.pcPhysicalLocusCustody((pc.value as any).pc_id)?.fact,
      ].map((f) => f && c.store.lookupReceipt(f.provenance.intent_id)!.revision),
    };
  } finally {
    await c.close();
  }
}
