import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const c = await load('packages/contracts/src/index.ts');
const { ALL_FACT_KINDS, factKind, resolveKey } = await load('packages/engine/src/owners/registry.ts');
const byKind = new Map(ALL_FACT_KINDS.map((r) => [r.id, r]));
const direct = {
  institution: c.InstitutionIdentitySchema,
  supervisor_office: c.OfficeAuthorityLocusSchema,
  attendant_post: c.OfficeAuthorityLocusSchema,
  setup_input: c.InitialSetupInputSchema,
  scope_invocation: c.InitialSetupInvocationSchema,
  scope_response: c.InitialSetupResponseSchema,
  setup_grant: c.InitialSetupGrantSchema,
  scene_invocation: c.InitialSetupInvocationSchema,
  scene_response: c.InitialSetupResponseSchema,
  locality_completion: c.InitialLocalityCompletionSchema,
  population_ledger: c.EstablishLedgerInputSchema,
  economy_request: c.IssueDemandInputSchema,
  production_start: c.StartOperationInputSchema,
  production_temporal_enrolment: c.TemporalObjectSchema,
  health_recovery_enrolment: c.TemporalObjectSchema,
};
function errors(parsed) {
  return parsed.success ? [] : parsed.error.issues.map((i) => (
    [i.path.join('.') || '$', i.code, i.code === 'unrecognized_keys' ? i.keys.join(',') : i.message].join(' ')
  ));
}
function sampleKey(pattern, aliases, g) {
  if (pattern === 'temporal/state + temporal/origin') return pattern.split(' + ');
  if (!pattern) return [];
  return [pattern.replace(/\{([^}]+)\}/g, (_, id) => (
    /^(setup_id|digest|task_id)$/.test(id) ? 'a'.repeat(64) :
      id === 'world' || id === 'world_id' ? aliases.world.authored_fact.value.world_id :
      id === 'locus' || id === 'locus_id' ? aliases.workshop_locus.authored_fact.value.locus_id : 'example-id'
  ))];
}
const profiles = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path)));
for (const profile of profiles) {
  const groups = profile.opening_contract.groups;
  const aliases = Object.fromEntries(groups.map((g) => [g.alias, g]));
  const rows = [];
  for (const g of groups) {
    const result = g.producer_instruction?.expected_output;
    const reg = byKind.get(g.kind);
    const missing = g.group_writes.filter((write) => !byKind.has(write));
    const args = g.producer_instruction?.input_contract.argument_object;
    const candidateKeys = g.authored_fact ? [g.authored_fact.key] : sampleKey(result?.key_derivation?.pattern, aliases, g);
    const normalizedKeys = candidateKeys.map((key) => [key, resolveKey(key)?.kind.id ?? 'UNREGISTERED']);
    const ast = g.authored_fact && reg ? errors(reg.valueSchema.safeParse(g.authored_fact.value)) : null;
    const inp = args && direct[g.alias] ? errors(direct[g.alias].safeParse(args)) : null;
    const unresolvedFields = args ? Object.entries(args).filter(([, v]) => v && typeof v === 'object' && v.binding === 'PRODUCE_FROM_ORIGINAL_SOURCE_NOT_A_PREDECLARED_OUTPUT').map(([k]) => k) : [];
    rows.push({
      seq:g.sequence, alias:g.alias, kind:g.kind, declared:[g.owner,g.facet],
      registered:reg ? [reg.owner,reg.facet,reg.keyPattern.source,reg.lifecycle] : null,
      missing, keys:normalizedKeys, staticErrors:ast, nativeInputErrors:inp, unresolvedFields,
      ownerFacetMatches: Boolean(reg && reg.owner === g.owner && reg.facet === g.facet),
    });
  }
  // Same manifest literals are checked against the production-registered TypeScript schemas.
  const falsifiers = [
    ['world/extra-field', 'world', (v) => ({...v, unsupported_fact_field:true})],
    ['locus/wrong-key', 'workshop_locus', (v) => v],
    ['GIP scope/extra-field', 'local_scope', (v) => ({...v, invented_competence:true})],
    ['reserve/extra-field', 'production_reserve', (v) => ({...v, invented_owner_claim:true})],
  ];
  for (const [test, alias, modify] of falsifiers) {
    const g = aliases[alias], fact = g.authored_fact;
    const native = byKind.get(g.kind);
    const refused = alias === 'workshop_locus' ? !native.keyPattern.test(fact.key + '/invalid') : !native.valueSchema.safeParse(modify(fact.value)).success;
    assert.ok(refused, test);
  }
  assert.throws(() => factKind('gip_local_completion_notice_charter'), /unregistered/);
  assert.throws(() => factKind('health_pc_relevant_condition'), /unregistered/);
  assert.throws(() => factKind('world_opening_glassbell_exposure'), /unregistered/);
  const e = aliases.economy_request.producer_instruction.input_contract.argument_object;
  const p = aliases.production_start.producer_instruction.input_contract.argument_object;
  assert.ok(!c.IssueDemandInputSchema.safeParse({...e, source_carrier_must_match: true}).success);
  assert.ok(!c.StartOperationInputSchema.safeParse({...p, requires_real_economy_request: true}).success);
  console.log(JSON.stringify({ id:profile.id, rows, negativeAssertions:9 }, null, 2));
}
