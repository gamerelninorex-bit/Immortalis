#!/usr/bin/env python3
"""BLUE static draft guard; not Zod or owner-authenticated QV-1!"""
import json, pathlib, copy, re, sys, hashlib
p=pathlib.Path('/mnt/data/b3_c0_authoring_v2')
STATIC_REQ={
 'world_profile':{'world_id','premise','reference_causal_basis','material_world_law_departures','insertion_supporting_constraints'},
 'world_locus':{'locus_id','world','designation','constraints'},
 'gip_scope_binding':{'scope_binding_id','institution_id','office_id','scope_type','scope_ref','target_condition'},
 'production_reserve':{'reserve_id','material_class','established','quantity','consumed','condition','locality','holding','claims'},
}
ALLOWED_OPTIONAL={'world_profile':set(),'world_locus':{'acoustic_profile_v1'},'gip_scope_binding':{'inheritance_rule','exception_refs','priority_or_conflict_rule_ref'},'production_reserve':{'inflows'}}
MS={'ms_issue','ms_response','attendant_existence'}
class Invalid(Exception): pass
def guard(g,reason):
 if not g:raise Invalid(reason)
def verify(j):
 g=j['opening_contract']['groups'];alias={x['alias']:x for x in g}
 guard(j['status'].endswith('NOT_ADOPTED'),'cannot imply adoption')
 guard(len(alias)==len(g) and all(x['sequence']==i for i,x in enumerate(g,1)), 'duplicate/out of order')
 guard(j['opening_contract']['group_count']==len(g),'incorrect count')
 guard([x['phase'] for x in g]==sorted(x['phase'] for x in g),'non-monotone phase')
 guard(set(x['phase'] for x in g)<=set(range(1,10)) and {1,2,3,4,5,6,9}<=set(x['phase'] for x in g),'invalid ordered opening phases')
 guard('supervisor_existence' not in alias and 'founding_order' not in alias, 'disallowed second actor/founding kind')
 guard(all(x in alias for x in MS),'missing original M-S chain')
 guard(alias['ms_issue']['kind']=='initial_actor_setup_issue' and alias['ms_issue']['owner']=='world_state','M-S source owner/kind incorrect')
 guard(alias['ms_response']['kind']=='initial_actor_setup_response' and alias['ms_response']['owner']=='world_state','M-S response owner incorrect')
 guard(alias['charter']['kind']=='gip_local_completion_notice_charter','wrong charter kind')
 guard(alias['instruction']['kind']=='gip_local_completion_notice_instruction','wrong instruction kind')
 guard(alias['population_ledger']['owner']=='population' and alias['population_ledger']['sequence']<alias['economy_request']['sequence']<alias['production_start']['sequence']<alias['production_temporal_enrolment']['sequence'],'bad Population/Economy/Production/Temporal order')
 guard(alias['economy_request']['group_writes']==['economy_demand','economy_request'],'economy group is two-write atomic')
 guard(alias['production_start']['group_writes']==['production_reserve','production_claim','production_operation'],'production start is three-write atomic')
 for x in g:
  for req in x.get('requires',[]): guard(req in alias and alias[req]['sequence']<x['sequence'],f"{x['alias']} absent/future req {req}")
  guard(x['source_form'] in {'STATIC_EXACT','PRODUCER_ORIGINAL'},'source form')
  if x['source_form']=='STATIC_EXACT':
   a=x.get('authored_fact');guard(isinstance(a,dict) and isinstance(a.get('key'),str) and isinstance(a.get('value'),dict),x['alias']+' missing exact key/value')
   required=STATIC_REQ.get(x['kind']);guard(required is not None,x['alias']+' unrecognized static schema')
   fields=set(a['value']);guard(required<=fields and fields<=required|ALLOWED_OPTIONAL.get(x['kind'],set()),x['alias']+' strict fields mismatch')
   guard(not re.search(r'[{}]',a['key']),x['alias']+' key unresolved')
  else:
   o=x.get('producer_instruction');guard(isinstance(o,dict),x['alias']+' no producer contract')
   v=o.get('input_contract',{});a=v.get('argument_object');guard(isinstance(a,dict) and a and isinstance(v.get('operation'),str) and v['operation'],x['alias']+' input absent')
   guard(v.get('source_owner')==x['owner'],x['alias']+' input owner mismatch')
   r=o.get('producer_resolution',{});guard(r.get('owner')==x['owner'] and r.get('facet')==x['facet'] and r.get('owner_registered_writer_required') is True,x['alias']+' native origin missing')
   e=o.get('expected_output',{});guard(e.get('kind')==x['kind'] and e.get('owner')==x['owner'] and e.get('facet')==x['facet'],x['alias']+' output attribution incorrect')
   guard(e.get('write_kinds')==x['group_writes'],x['alias']+' write cardinality mismatch')
   guard(isinstance(e.get('key_derivation',{}).get('pattern'),str) and e['key_derivation']['pattern'],x['alias']+' key derivation missing')
   guard(isinstance(o.get('independent_falsifier',{}).get('negative_cases'),list) and len(o['independent_falsifier']['negative_cases'])>=3,x['alias']+' falsifiers absent')
   guard(o.get('activation')=='TEST_SEAM_ONLY_UNTIL_EXACT_PROFILE_SHA_ADOPTED','unexpected production activation')
 return True
if __name__=='__main__':
 for fn in ['workshop-opening-quiet-v2.json','workshop-opening-glassbell-v2.json']:
  o=json.loads((p/fn).read_text());verify(o);print(fn,'SOURCE SHAPE PASS (NOT strict engine QV-1)')
  g=o['opening_contract']['groups'];mutants=[]
  def m(name,modify):
   b=copy.deepcopy(o);modify(b);mutants.append((name,b))
  m('no M-S issue',lambda j:j['opening_contract']['groups'].__setitem__(next(i for i,x in enumerate(j['opening_contract']['groups']) if x['alias']=='ms_issue'),dict(j['opening_contract']['groups'][0])))
  m('wrong charter kind',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='charter').update(kind='gip_governance_instrument'))
  m('invent supervisor actor',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='attendant_existence').update(alias='supervisor_existence'))
  m('fake Economy one-write',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='economy_request').update(group_writes=['economy_request']))
  m('split Production triple',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='production_start').update(group_writes=['production_operation']))
  m('predeclare owner output',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='ms_response').update(source_form='STATIC_EXACT'))
  m('missing static fact',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='world').pop('authored_fact'))
  m('future dependency',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='pc_host').update(requires=['instruction']))
  m('production allowlist leak',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='charter')['producer_instruction'].update(activation='LIVE'))
  m('no output key derivation',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='instruction')['producer_instruction']['expected_output'].pop('key_derivation'))
  m('wrong GIP owner',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='instruction')['producer_instruction']['expected_output'].update(owner='world_state'))
  m('wrong phase',lambda j:next(x for x in j['opening_contract']['groups'] if x['alias']=='coverage_anchor').update(phase=1))
  for name,b in mutants:
   try:verify(b)
   except (Invalid,KeyError):pass
   else:raise AssertionError('FALSE-POSITIVE acceptance on '+name)
  print(fn, '12/12 static mutants rejected')
