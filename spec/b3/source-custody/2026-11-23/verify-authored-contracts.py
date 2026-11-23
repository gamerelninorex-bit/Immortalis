#!/usr/bin/env python3
"""Static source-input contract sanity / adversarial mutants. NOT a game-engine test."""
import copy, hashlib, json, pathlib, re
P=pathlib.Path(__file__).resolve().parent
DIGESTS={}
KEY_OLD_GIP=re.compile(r'^gip/instrument/[A-Za-z0-9][A-Za-z0-9._:-]*$')
KEY_RED_CHARTER=re.compile(r'^gip/local-completion-notice/campaign/[A-Za-z0-9][A-Za-z0-9._:-]*/charter$')
KEY_RED_INSTRUCTION=re.compile(r'^gip/local-completion-notice/campaign/[A-Za-z0-9][A-Za-z0-9._:-]*/instruction/[a-f0-9]{64}$')

WORLD_REQUIRED={'world_id','premise','reference_causal_basis','material_world_law_departures','insertion_supporting_constraints'}
LOCUS_REQUIRED={'locus_id','world','designation','constraints'}
INSTITUTION_REQUIRED={'institution_id','identity_label','continuity_status'}
OFFICE_REQUIRED={'office_id','institution_id','authority_source_ref','competence_scope','powers','duties','selection_rule','succession_rule','removal_rule','holder_ref'}
SCOPE_REQUIRED={'scope_binding_id','institution_id','office_id','scope_type','scope_ref','target_condition'}
RESERVE_REQUIRED={'reserve_id','material_class','established','quantity','consumed','condition','locality','holding','claims'}

SEQUENCE_QUIET=['world','workshop_locus','pc_host','native_compatibility_verdict','pc_binding','physical_placement_verdict','pc_placement','supervisor_existence','attendant_existence','actor_setup_placement','actor_setup_closure','attendant_presence','founding_order','institution','supervisor_office','attendant_post','local_scope','charter','economy_request','production_reserve','production_start','production_temporal_enrolment','instruction','accepted_standing_duty','coverage_anchor']
SEQUENCE_GLASS=SEQUENCE_QUIET[:-1]+['glassbell_exposure','auditory_condition','health_recovery_enrolment','coverage_anchor']

def is_valid(p):
 assert p['campaign_class']=='QUALIFICATION' and p['disposable_only'] and not p['admission_controls']['historical_world_reuse'], 'QO historical scope refused'
 gs=p['opening_contract']['owner_group_publications']
 assert len(gs)==p['opening_contract']['group_count'], 'count'
 expected=SEQUENCE_GLASS if p['id'].endswith('glassbell-v1') else SEQUENCE_QUIET
 assert [g['alias'] for g in gs]==expected, 'group ordering/route'
 assert [g['sequence'] for g in gs]==list(range(1,len(gs)+1)),'revisions'
 assert [g['phase'] for g in gs]==sorted(g['phase'] for g in gs),'phase order'
 seen=set()
 for g in gs:
  assert set(g['requires'])<=seen,(g['alias'],'unproduced predecessor')
  seen.add(g['alias'])
  assert g['payload_mode'] in ('EXACT_AUTHORED_VALUE','AUTHENTIC_OWNER_DERIVATION')
  if g['payload_mode']=='EXACT_AUTHORED_VALUE':
   assert isinstance(g['authored_value'],dict) and bool(g['authored_value']),(g['alias'],'missing authored input')
   needed={'world':WORLD_REQUIRED,'workshop_locus':LOCUS_REQUIRED,'institution':INSTITUTION_REQUIRED,'supervisor_office':OFFICE_REQUIRED,'attendant_post':OFFICE_REQUIRED,'local_scope':SCOPE_REQUIRED,'production_reserve':RESERVE_REQUIRED}.get(g['alias'])
   if needed:assert set(g['authored_value'])==needed,(g['alias'],'not exact base strict fields')
  else:
   d=g['producer_contract'];assert isinstance(d['operation'],str) and len(d['operation'])>4 and d['inputs'] and d['negative'] and d['source'],(g['alias'],'unsupported original producer')
  assert g['group_writes'] and g['owner'] and g['facet'] and g['kind']
 assert len([g for g in gs if g['kind']=='named_actor_existence_basis'])==2
 assert not any(g['kind'] in ('initial_actor_setup_response','initial_actor_setup_issue') for g in gs),'M-S one-leaf source cannot establish two actors'
 op=next(g for g in gs if g['alias']=='production_start')
 assert op['group_writes']==['production_reserve','production_claim','production_operation'], 'Production atomic start must have exactly three writes'
 assert next(g for g in gs if g['alias']=='charter')['group_writes']==['gip_governance_instrument']
 assert next(g for g in gs if g['alias']=='instruction')['group_writes']==['gip_governance_instrument']
 assert gs[-1]['alias']=='coverage_anchor'
 assert p['opening_contract']['canonical_time']=={'unit':'b3-qualification-in-world-second-v1','value':0}
 char='gip/local-completion-notice/campaign/demo/charter'
 inst='gip/local-completion-notice/campaign/demo/instruction/'+'a'*64
 assert KEY_RED_CHARTER.fullmatch(char) and KEY_RED_INSTRUCTION.fullmatch(inst)
 assert not KEY_OLD_GIP.fullmatch(char) and not KEY_OLD_GIP.fullmatch(inst),'old GIP regex must NOT silently accept RED keys'
 g=next(g for g in gs if g['alias']=='charter')
 assert g['producer_contract']['inputs']['exact_red_key']=='gip/local-completion-notice/campaign/{campaign_id}/charter'
 assert g['producer_contract']['inputs']['old_kind_rule_must_continue']=='gip/instrument/{instrument_id}'
 d=next(g for g in gs if g['alias']=='instruction')
 assert d['producer_contract']['inputs']['exact_red_key']=='gip/local-completion-notice/campaign/{campaign_id}/instruction/{instruction_id}'
 for x in p['profile_policy']['production_cases']:
  assert x['completion_at']['unit']=='b3-qualification-in-world-second-v1' and x['completion_at']['value']>0
 if 'glassbell' in p['id']:
  c=next(g for g in gs if g['alias']=='auditory_condition')
  assert c['producer_contract']['inputs']['recovery_at']=={'unit':'b3-qualification-in-world-second-v1','value':300}
  assert len(p['profile_policy']['production_cases'])==2
 else:assert 'auditory_condition' not in seen
 return True

if __name__=='__main__':
 for name in ['workshop-opening-quiet-v1.json','workshop-opening-glassbell-v1.json']:
  file=P/name;b=file.read_bytes();p=json.loads(b)
  assert b==(json.dumps(p,sort_keys=True,indent=2,ensure_ascii=False,allow_nan=False)+'\n').encode()
  assert is_valid(p)
  digest=hashlib.sha256(b).hexdigest();DIGESTS[name]=(len(b),digest)
  # Independent static negative tests (NOT game engine): reject known previous authoring defects.
  negative={}
  def fails(test, label):
   try:is_valid(test)
   except AssertionError: negative[label]='REJECTED'
   else:raise AssertionError(f'NEGATIVE UNEXPECTED PASS {label}')
  t=copy.deepcopy(p);t['campaign_class']='HISTORICAL';fails(t,'historical_profile_import')
  t=copy.deepcopy(p);t['opening_contract']['owner_group_publications'][3]['producer_contract']['operation']='';fails(t,'missing_native_referee_producer')
  t=copy.deepcopy(p);g=next(g for g in t['opening_contract']['owner_group_publications'] if g['alias']=='production_start');g['group_writes']=['production_claim'];fails(t,'split_production_start_claim')
  t=copy.deepcopy(p);g=next(g for g in t['opening_contract']['owner_group_publications'] if g['alias']=='charter');g['producer_contract']['inputs']['exact_red_key']='gip/instrument/fiction';fails(t,'GIP_key_rewrite')
  t=copy.deepcopy(p);g=next(g for g in t['opening_contract']['owner_group_publications'] if g['alias']=='attendant_existence');g['kind']='initial_actor_setup_response';fails(t,'M-S_duplicate_actor_source')
  t=copy.deepcopy(p);g=next(g for g in t['opening_contract']['owner_group_publications'] if g['alias']=='production_reserve');g['authored_value']['extra_untyped_field']='bad';fails(t,'strict_source_value_extra_field')
  print(name,'STATIC SOURCE INPUT PASS;',len(p['opening_contract']['owner_group_publications']),'owner groups;',len(negative),'mutants rejected; SHA-256',digest)
 print('EXPLICITLY NOT TESTED: live game-engine owner admission, signed referee host, actual GIP source group, exact true Health Close, B2 stage, D3(b), full CI or cold history. A static PASS is NOT constructor authorization.')
