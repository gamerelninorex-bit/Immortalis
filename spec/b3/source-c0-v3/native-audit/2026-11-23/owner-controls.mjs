import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = (path) => import(pathToFileURL(resolve(path)).href);
const c = await load('packages/contracts/src/index.ts');
const e = await load('packages/engine/src/index.ts');
const { genesisProjection } = await load('packages/engine/src/initial-setup/genesis.ts');
const { MsSetupPublisher } = await load('packages/engine/src/ms-setup/publisher.ts');
const { initializeCapturedChronology } = await load('packages/engine/src/temporal/captured-chronology.ts');
const { publication } = await load('packages/testkit/src/canonical-fixtures.ts');
const testControl = 'c0-control-opaque-authority';
function must(result) {
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}
function refusal(result, expected) {
  assert.ok(!result.ok, 'expected refusal: ' + JSON.stringify(result));
  if (expected) assert.equal(result.error.code, expected, JSON.stringify(result.error));
  return result.error;
}

for (const path of process.argv.slice(2)) {
  const profile = JSON.parse(readFileSync(path));
  const groups = Object.fromEntries(profile.opening_contract.groups.map((g) => [g.alias, g]));
  const a = (id) => groups[id].producer_instruction.input_contract.argument_object;
  const v = (id) => groups[id].authored_fact.value;
  const dir = mkdtempSync(join(tmpdir(),'b3-c0-owner-control-'));
  const options = { campaignId: 'c0-native-control-' + profile.id, buildId: 'c0-native-control' };
  const campaign = must(await e.CanonicalCampaign.create(dir, options));
  const store = campaign.store;
  let n = 0;
  const pub = () => publication(++n);
  const witnesses = [];
  const result = async (label, action, condition) => {
    const p = pub();
    const before = store.head();
    const r = await action(p);
    if (condition === true) {
      const receipt = must(r);
      const group = store.committedGroup(p.intent_id);
      assert.ok(group);
      witnesses.push({label, owner:group.owner, writes:group.writes.map((w) => [w.key, w.expected_version]), receipt:receipt.receipt });
    } else {
      witnesses.push({label, ...refusal(r, condition)});
      assert.deepEqual(store.head(),before);
      assert.equal(store.lookupReceipt(p.intent_id),null);
    }
    return r;
  };
  await result('manifest world body', (p) => campaign.establishWorld({...p, world:v('world')}), true);
  await result('manifest locus body', (p) => campaign.establishLocus({...p, locus:v('workshop_locus')}), true);
  const genesis = genesisProjection(new Map(store.listFacts().map(f => [f.key, f])));
  witnesses.push({label:'manifest genesis has no finite source',...refusal(genesis, 'GENESIS_SHAPE')});
  assert.throws(() => new MsSetupPublisher(store).issue(), /no source-qualified MS Completion/);
  witnesses.push({label:'M-S issue without Completion', error:'no source-qualified MS Completion'});
  witnesses.push({label:'captured chronology without Completion', ...refusal(await initializeCapturedChronology(store), 'CAPTURED_CHRONOLOGY_UNAVAILABLE')});
  // The ordinary clock is a control prerequisite only. The candidate cannot create its original paired clock.
  const t = new e.TemporalCoordinator(store, new e.StageProviderRegistry());
  await result('ordinary control clock', p => t.establishCanonicalTime({...p,time:profile.opening_contract.canonical_time}),true);
  const po = new e.PopulationAdapter(store);
  const ec = new e.EconomyAdapter(store);
  const pr = new e.ProductionAdapter(store);
  const gip = new e.GipAdapter(store);
  await result('Economy demand without ledger', p=>ec.issueDemand({...p,demand:a('economy_request')}), 'PREREQUISITE_MISSING');
  await result('manifest ledger', p=>po.establishLedger({...p,ledger:a('population_ledger')}),true);
  const demand = a('economy_request');
  await result('Economy demand with absent unit',p=>ec.issueDemand({...p,demand:{...demand,carrier:{...demand.carrier,unit_id:'absent-unit'}}}),false);
  await result('manifest Economy demand',p=>ec.issueDemand({...p,demand}),true);
  const reserve = v('production_reserve');
  const expectedReserveKey = groups.production_reserve.authored_fact.key;
  await result('reserve via native owner from exact authored fields', p=>pr.establishReserve({...p,reserve:{
    reserve_id:reserve.reserve_id, material_class:reserve.material_class, quantity:reserve.established, condition:reserve.condition,
    world_id:reserve.locality.world.entity_id, locus_id:reserve.locality.locus.entity_id,
  }}),true);
  assert.deepEqual(store.getFact(expectedReserveKey).value,reserve);
  await result('v3 Production request key',p=>pr.startOperation({...p,start:a('production_start')}),'PREREQUISITE_MISSING');
  const requestId = c.economyRequestId(demand.demand_envelope_id);
  const requestKey = c.economyRequestKey(requestId);
  await result('derived original Economy request key',p=>pr.startOperation({...p,start:{...a('production_start'),request_key:requestKey}}),true);
  const operation = pr.operation(requestId).value;
  await result('v3 Temporal registration shape',p=>t.registerObject({...p,object:a('production_temporal_enrolment')}),'INPUT_INVALID');
  await result('native Temporal owner recipe and index',p=>t.registerObject({...p,object:e.productionTemporalObject(operation,{
    worldId:v('world').world_id,locusId:v('workshop_locus').locus_id,
  })}),true);
  // An opaque test reference demonstrates the old GIP publisher without representing a Profile pin.
  await result('v3 Institution recipe passed literally',p=>gip.establishInstitution({...p,institution:a('institution')}),'INPUT_INVALID');
  await result('existing Institution route with opaque control reference',p=>gip.establishInstitution({...p,institution:{...a('institution'),constitutive_source_ref:testControl}}),true);
  await result('v3 office recipe passed literally',p=>gip.establishOffice({...p,office:a('supervisor_office')}),'INPUT_INVALID');
  const { no_actor_existence_dereference, ...office } = a('supervisor_office');
  const correctedOffice = {...office,authority_source_ref:testControl};
  await result('existing GIP opaque holder route', p=>gip.establishOffice({...p,office:correctedOffice}),true);
  await result('manifest GIP scope through owner',p=>gip.establishScopeBinding({...p,scope_binding:v('local_scope')}),true);
  assert.deepEqual(campaign.verify(),[]);
  const before = store.head();
  await campaign.close();
  const reopened = must(await e.CanonicalCampaign.open(dir,{buildId:options.buildId}));
  assert.deepEqual(reopened.verify(),[]);
  assert.deepEqual(reopened.store.head(),before);
  await reopened.close();
  console.log(JSON.stringify({id:profile.id, classification:'isolated component controls, no original signed setup', witnesses, replay:'PASS'}));
}
