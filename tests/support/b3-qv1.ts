import { expect } from "vitest";
import { groupSha256, resolveKey } from "@immortalis/engine";
import { resolveWorkshopKey } from "../../packages/engine/src/owners/workshop/registry.ts";
import type { openWorkshop } from "./b3-opening.ts";

export const WORKSHOP_QV1_DIGESTS = {
  quiet: "d2c99d0834b274a2f58dadd21aaf488d794228815751207f4474cbcfeb04c7ee",
  glassbell: "cb39da2c4099526954ae182e4a206a627ad62cbb47f760b1c14c2d4612a4007b",
} as const;

// Branch-local opening recipes, in the Profile's order. Reservation/response pairs
// stay distinct even where the native owner publishes them under one key family.
const beforeCoverage = {
  world: ["world_profile"],
  workshop_locus: ["world_locus"],
  finite_world_source: ["world_source_condition"],
  pc_classification: ["referee_decision"],
  pc_host: ["pc_existence_contract"],
  setup_input: ["initial_setup_input"],
  scope_invocation: ["initial_setup_invocation"],
  scope_response: ["initial_setup_response"],
  scope_delegation: ["referee_decision"],
  setup_grant: ["initial_setup_grant"],
  scene_invocation: ["initial_setup_invocation"],
  scene_response: ["initial_setup_response"],
  locality_completion: ["initial_locality_completion"],
  ms_issue: ["initial_actor_setup_issue"],
  ms_response: ["initial_actor_setup_response"],
  attendant_existence: ["named_actor_existence_basis"],
  actor_setup_placement: ["actor_setup_placement"],
  actor_setup_closure: ["world_setup_closure"],
  temporal_genesis: ["temporal_state", "temporal_origin"],
  attendant_presence: ["actor_physical_presence"],
  native_compatibility_verdict: ["referee_decision"],
  pc_standing_ledger: [
    "pc_standing_instruction_ledger_head",
    "pc_standing_instruction_ledger_version",
  ],
  pc_binding: ["player_character_binding"],
  physical_placement_verdict: ["referee_decision"],
  pc_placement: ["world_pc_locus_custody"],
  institution: ["gip_institution_identity"],
  supervisor_office: ["gip_office_authority_locus"],
  attendant_post: ["gip_office_authority_locus"],
  local_scope: ["gip_scope_binding"],
  population_ledger: ["population_ledger"],
  economy_request: ["economy_demand", "economy_request"],
  production_reserve: ["production_reserve"],
  production_start: ["production_operation", "production_claim", "production_reserve"],
  production_temporal_enrolment: ["temporal_object", "temporal_boundary_index"],
  charter: ["gip_local_completion_notice_charter"],
  instruction: ["gip_local_completion_notice_instruction"],
  accepted_standing_duty: ["named_actor_local_notice_duty"],
};
const glassbellOnly = {
  glassbell_exposure: ["world_opening_glassbell_exposure"],
  auditory_condition: ["health_pc_relevant_condition"],
  health_recovery_enrolment: ["temporal_object", "temporal_boundary_index"],
};
const staticRows = new Set(["world", "workshop_locus"]);

export function verifyWorkshopOpeningQV1(
  mode: keyof typeof WORKSHOP_QV1_DIGESTS,
  opening: Awaited<ReturnType<typeof openWorkshop>>,
) {
  const expected = Object.entries({
    ...beforeCoverage,
    ...(mode === "glassbell" ? glassbellOnly : {}),
    coverage_anchor: ["health_pc_sensory_coverage_anchor"],
  });
  expect(opening.profile.sha256).toBe(WORKSHOP_QV1_DIGESTS[mode]);
  expect(opening.source.native_publication_order).toEqual(expected.map(([label]) => label));
  expect(opening.trace).toHaveLength(expected.length);
  const seen = new Set<string>();
  const policy = opening.admission;
  for (const [[label, output], { group, before, after }] of expected.map(
    (row, i) => [row, opening.trace[i]!] as const,
  )) {
    const receipt = opening.store.lookupReceipt(group.intent_id);
    expect(receipt, label).toMatchObject({
      group_id: group.group_id,
      group_sha256: groupSha256(group),
      revision: after.revision,
    });
    expect(opening.store.committedGroup(group.intent_id), label).toEqual(group);
    expect(policy.verifyHistorical?.(group, before), label).toBeNull();
    expect(
      group.depends_on.every((id) => seen.has(id)),
      label,
    ).toBe(true);
    for (const read of group.reads) {
      expect(before.facts.get(read.key)?.version ?? 0, label).toBe(read.version);
    }
    expect(
      group.writes.map((write) => {
        const kind = resolveKey(write.key)?.kind ?? resolveWorkshopKey(write.key);
        const fact = after.facts.get(write.key);
        expect(kind, label).toBeDefined();
        expect(kind?.valueSchema.safeParse(write.value).success, label).toBe(true);
        expect(fact, label).toMatchObject({
          owner: write.owner,
          facet: write.facet,
          value: write.value,
          version: write.expected_version + 1,
          provenance: { group_id: group.group_id, rule: group.rule },
        });
        return kind?.id;
      }),
      label,
    ).toEqual(output);
    if (staticRows.has(label)) {
      const value = label === "world" ? opening.source.world : opening.source.locus;
      expect(group.writes[0]!.value, label).toEqual(value);
    }
    seen.add(group.group_id);
  }
}
