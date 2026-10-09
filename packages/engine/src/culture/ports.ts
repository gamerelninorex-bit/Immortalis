import {
  OWNER_CULTURE,
  cultureUpdateContextKey,
  CultureUpdateContextSchema,
  type CjaContextAttestation,
} from "@immortalis/contracts";
import type {
  CultureAdjudicationContextPort,
  CultureContextLookup,
} from "../culture-adjudication/ports.ts";
import type { CampaignStore } from "../persistence/store.ts";

/**
 * The REAL PORT A (F-027-CJA1 §9.1) — `CultureAdjudicationContextPort`: given ONE `culture_update_id`, the committed sealed
 * Social Update Context of the Culture owner, projected as the attestation CJA1 verifies — the context fact's own owner, key,
 * version and committing group, and the sealed references it holds. It attests provenance and identity; it claims nothing
 * about what the sources establish. It is a CLAIM: the adjudication adapter re-verifies it against the committed store and the
 * journal and never trusts it. A context that is absent or malformed is ABSENT (dependent work stops), never repaired.
 */
export class CultureContextAttestor implements CultureAdjudicationContextPort {
  readonly #store: Pick<CampaignStore, "getFact">;

  constructor(store: Pick<CampaignStore, "getFact">) {
    this.#store = store;
  }

  attest(cultureUpdateId: string): CultureContextLookup {
    const fact = this.#store.getFact(cultureUpdateContextKey(cultureUpdateId));
    if (!fact || fact.owner !== OWNER_CULTURE) return { status: "ABSENT" };
    const parsed = CultureUpdateContextSchema.safeParse(fact.value);
    if (!parsed.success) return { status: "ABSENT" };
    const c = parsed.data;
    const attestation: CjaContextAttestation = {
      context: {
        owner: fact.owner,
        fact_key: fact.key,
        version: fact.version,
        committed_by_group_id: fact.provenance.group_id,
      },
      distinction: c.distinction,
      trigger_ref: c.trigger_ref,
      causal_process_id: c.causal_process_id,
      opportunity_id: c.opportunity_id,
      owner_operation_id: c.owner_operation_id,
      inputs: c.inputs,
      constituency: c.constituency,
      consumer_question: c.consumer_question,
    };
    return { status: "ATTESTED", attestation };
  }
}
