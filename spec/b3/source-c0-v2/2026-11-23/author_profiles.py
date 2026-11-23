#!/usr/bin/env python3
"""BLUE C0 source-input proposal authoring. Does not mint sovereign or runtime proofs."""
import json, hashlib, pathlib, copy
out=pathlib.Path('/mnt/data/b3_c0_authoring_v2')
src=pathlib.Path('/mnt/data/b3_custody_parts/raw')
MAIN='728104565662fece3e76be5b94c28f3c4201dbb7'
RAT='https://app.notion.com/p/42120af901e0811ca412e09374ae5c18'
RAT_PIN='2026-11-23T11:42:34.869Z'
CANON='b3-qualification-in-world-second-v1'
TIME=lambda n: {'unit':CANON,'value':n}

KEYS={
 'world':'world/b3-qualification-workshop-world/profile',
 'workshop_locus':'world/b3-qualification-workshop-world/locus/{profile_id}',
 'pc_host':'pc/{pc_id}/existence-contract',
 'native_compatibility_verdict':'referee/{auth_decision_sha256}/decision',
 'pc_binding':'role-registry/binding/role.player_character',
 'physical_placement_verdict':'referee/{physical_decision_sha256}/decision',
 'pc_placement':'world-state/pc/{pc_id}/locus-custody',
 'ms_issue':'world/{world_id}/locus/{locus_id}/initial-actor/{digest}/issue',
 'ms_response':'world/{world_id}/locus/{locus_id}/initial-actor/{digest}/response',
 'attendant_existence':'named-actor/{actor_id}/existence-basis',
 'actor_setup_placement':'world-state/actor/{actor_id}/setup-placement',
 'actor_setup_closure':'world/{world_id}/setup-closure',
 'attendant_presence':'world-state/actor/{actor_id}/presence',
 'institution':'gip/institution/{institution_id}/identity',
 'supervisor_office':'gip/institution/{institution_id}/office/{office_id}',
 'attendant_post':'gip/institution/{institution_id}/office/{office_id}',
 'local_scope':'gip/institution/{institution_id}/office/{office_id}/scope-binding/{scope_binding_id}',
 'charter':'gip/local-completion-notice/campaign/{campaign_id}/charter',
 'population_ledger':'population/{ledger_id}/ledger',
 'economy_request':'economy/request/{request_id}',
 'production_reserve':'production/reserve/{reserve_id}',
 'production_start':'production/operation/{request_id}',
 'production_temporal_enrolment':'temporal/object/{object_id}',
 'instruction':'gip/local-completion-notice/campaign/{campaign_id}/instruction/{instruction_id}',
 'accepted_standing_duty':'named-actor/{actor_id}/local-notice-duty/{instruction_id}',
 'glassbell_exposure':'world/{world_id}/opening-glassbell-exposure/{pc_id}',
 'auditory_condition':'health/pc/{pc_id}/relevant-condition/{condition_id}',
 'health_recovery_enrolment':'temporal/object/{object_id}',
 'coverage_anchor':'health/pc/{pc_id}/auditory/coverage-anchor/{anchor_id}',
}
# Warnings: kind schemas for prospective grants, M-S and World origin routes are not necessarily registered at MAIN.
# This proposal is a source RECIPE. Native owner acceptance is not asserted by it.

EXTRA={
 'ms_issue':{'owner':'world_state','facet':'world_initial_actor_setup','kind':'initial_actor_setup_issue','requires':['pc_host','workshop_locus']},
 'ms_response':{'owner':'world_state','facet':'world_initial_actor_setup','kind':'initial_actor_setup_response','requires':['ms_issue']},
 'population_ledger':{'owner':'population','facet':'population_state','kind':'population_ledger','requires':['workshop_locus']},
}
NATIVE_INPUT_SCHEMAS={
 'pc_host':'PcExistenceOriginalAuthoringInputV1',
 'native_compatibility_verdict':'RefereeNativeCompatibilityRequestV1',
 'pc_binding':'RoleRegistryOriginalActivationRequestV1',
 'physical_placement_verdict':'RefereeOriginalPhysicalPlacementRequestV1',
 'pc_placement':'PcPhysicalLocusCustodyOriginalActivationInputV1',
 'ms_issue':'InitialActorSetupIssueSchema',
 'ms_response':'InitialActorSetupResponseSchema',
 'attendant_existence':'NamedActorExistenceBasisSchema',
 'actor_setup_placement':'ActorSetupPlacementSchema',
 'actor_setup_closure':'WorldSetupClosureSchema',
 'attendant_presence':'ActorPhysicalPresenceSchema',
 'institution':'InstitutionIdentitySchema',
 'supervisor_office':'OfficeAuthorityLocusHolderSchema',
 'attendant_post':'OfficeAuthorityLocusHolderSchema',
 'charter':'GipLocalCompletionNoticeCharterSchema (prospective AD-1)',
 'population_ledger':'EstablishLedgerInputSchema',
 'economy_request':'IssueDemandInputSchema',
 'production_start':'StartOperationInputSchema',
 'production_temporal_enrolment':'TemporalObjectSchema',
 'instruction':'GipLocalCompletionNoticeInstructionSchema (prospective AD-1)',
 'accepted_standing_duty':'NamedActorLocalNoticeDutySchema (prospective RD.6)',
 'glassbell_exposure':'WorldOpeningGlassbellExposureSchema (prospective Grant W)',
 'auditory_condition':'HealthPcRelevantConditionSchema (prospective Grant H)',
 'health_recovery_enrolment':'TemporalObjectSchema',
 'coverage_anchor':'HealthPcSensoryCoverageAnchorSchema (prospective Grant H)',
}
OPERATIONS={
 'pc_host':'PC_EXISTENCE_ORIGINAL_PLAYER_AUTHORED',
 'native_compatibility_verdict':'IR_NATIVE_COMPATIBILITY',
 'pc_binding':'ROLE_REGISTRY_ORIGINAL_PLAYER_ACTIVATION',
 'physical_placement_verdict':'IR_PHYSICAL_PLACEMENT',
 'pc_placement':'WORLD_PC_ORIGINAL_ACTIVATION',
 'ms_issue':'MS_BUILD_NATIVE_ACTOR_ISSUE',
 'ms_response':'MS_BUILD_SIGNED_ACTOR_RESPONSE',
 'attendant_existence':'MS_DERIVE_SINGLE_NAMED_ACTOR_EXISTENCE',
 'actor_setup_placement':'MS_R1_ACTOR_ORIGINAL_PLACEMENT',
 'actor_setup_closure':'MS_R1_WORLD_SETUP_CLOSE',
 'attendant_presence':'MS_R1_ACTOR_PHYSICAL_PRESENCE',
 'institution':'GIP_ESTABLISH_INSTITUTION_IDENTITY',
 'supervisor_office':'GIP_ESTABLISH_OFFICE_AUTHORITY_LOCUS',
 'attendant_post':'GIP_ESTABLISH_OFFICE_AUTHORITY_LOCUS',
 'charter':'GIP_AD1_SOURCE_AUTHORIZED_CHARTER',
 'population_ledger':'POPULATION_ESTABLISH_LEDGER',
 'economy_request':'ECONOMY_ISSUE_DEMAND_REQUEST_ATOMIC',
 'production_start':'PRODUCTION_START_RESERVE_CLAIM_OPERATION_ATOMIC',
 'production_temporal_enrolment':'TEMPORAL_REGISTER_NATIVE_PRODUCTION_OBJECT',
 'instruction':'GIP_AD1_SOURCE_AUTHORIZED_INSTRUCTION',
 'accepted_standing_duty':'NAMED_ACTOR_RD6_ORIGINAL_STANDING_DUTY',
 'glassbell_exposure':'WORLD_SOURCE_AUTHORIZED_OPENING_GLASSBELL_EXPOSURE',
 'auditory_condition':'HEALTH_ADMIT_RELEVANT_CONDITION_FROM_GLASSBELL',
 'health_recovery_enrolment':'TEMPORAL_REGISTER_NATIVE_HEALTH_RECOVERY',
 'coverage_anchor':'HEALTH_ORIGINAL_SENSORY_COVERAGE_ANCHOR',
}
# Runtime-bound values are represented as references to real, later owner commits, not substitute facts.
def bind(alias, field='fact_ref', dtype='FactRef'):
 return {'binding':'COMMITTED_ORIGINAL_OWNER_OUTPUT','source_alias':alias,'source_field':field,'expected_type':dtype,'required':True}

def group_producer_input(alias,id_,isglass):
    world='b3-qualification-workshop-world';locus=id_;pc='b3-qualification-pc-bob'
    inst='b3-qualification-workshop-institution';att='b3-qualification-attendant-mara'
    if alias=='pc_host':return {'pc_id':pc,'claim_author':'PLAYER_AUTHORED_OR_PLAYER_DELEGATED','identity':'Bob, an ordinary embodied human workshop visitor','embodiment':'one ordinary human body','continuity':'one continuing physical life','physical_location':bind('workshop_locus'),'producer_mode':'DISPOSABLE_SYNTHETIC_TEST_AUTHORING_ONLY'}
    if alias=='native_compatibility_verdict':return {'operation':'IR_NATIVE_COMPATIBILITY','pc':bind('pc_host'),'world':bind('world'),'locus':bind('workshop_locus'),'referee_mode':'NATIVE_AUTHENTICATED_SIGNER_AT_ORIGINAL_CUT'}
    if alias=='pc_binding':return {'pc_id':pc,'existence':bind('pc_host'),'native_verdict':bind('native_compatibility_verdict'),'mode':'FIRST_NATIVE_ACTIVATION'}
    if alias=='physical_placement_verdict':return {'operation':'IR_PHYSICAL_PLACEMENT','pc_binding':bind('pc_binding'),'physical_locus':bind('workshop_locus'),'referee_mode':'NATIVE_AUTHENTICATED_SIGNER_AT_ORIGINAL_CUT'}
    if alias=='pc_placement':return {'pc_id':pc,'binding':bind('pc_binding'),'native_verdict':bind('native_compatibility_verdict'),'physical_verdict':bind('physical_placement_verdict'),'world':bind('world'),'locus':bind('workshop_locus'),'branch':'ORIGINAL_ACTIVATION'}
    if alias=='ms_issue':return {'world':bind('world'),'locus':bind('workshop_locus'),'initial_setup_input':bind('pc_host'),'actor_leaf_cardinality':1,'authoring_scope':'PLAYER_AUTHORED_OR_DELEGATED','runner_mode':'SOURCE_NATIVE_MS_SETUP','actor_id':att}
    if alias=='ms_response':return {'issue':bind('ms_issue'),'actor_id':att,'signature_requirement':'ED25519_VERIFIED_ORIGINAL_ACTOR_RESPONSE','raw_response_predeclared':False}
    if alias=='attendant_existence':return {'actor_id':att,'world':bind('world'),'locus':bind('workshop_locus'),'source_issue':bind('ms_issue'),'source_signed_response':bind('ms_response'),'actor_leaf_cardinality':1}
    if alias=='actor_setup_placement':return {'actor':bind('attendant_existence'),'world':bind('world'),'locus':bind('workshop_locus'),'placement_mode':'MS_NATIVE_ORIGINAL'}
    if alias=='actor_setup_closure':return {'world':bind('world'),'actor':bind('attendant_existence'),'placement':bind('actor_setup_placement'),'single_actor':True}
    if alias=='attendant_presence':return {'actor':bind('attendant_existence'),'closure':bind('actor_setup_closure'),'locus':bind('workshop_locus'),'presence_mode':'MS_R1_VERIFIED_ORIGINAL'}
    if alias=='institution':return {'institution_id':inst,'identity_label':'Workshop Qualification Institution','continuity_status':'continuing','constitutive_source_ref':{'derive':'ADOPTED_PROFILE_PIN','format':'profile:{profile_id}:{sha256}','never_self_hash':True}}
    if alias in ('supervisor_office','attendant_post'):
      office='b3-qualification-notice-supervisor' if alias=='supervisor_office' else 'b3-qualification-attendant-post'
      holder='b3-qualification-supervisor-rowan-opaque-holder' if alias=='supervisor_office' else att
      return {'institution_id':inst,'office_id':office,'holder_ref':holder,'authority_source_ref':{'derive':'ADOPTED_PROFILE_PIN','format':'profile:{profile_id}:{sha256}'},'competence_scope':'one disposable workshop','powers':[],'duties':['monitor one completion notice only'] if alias=='supervisor_office' else ['hold one accepted standing duty'],'selection_rule':'original seeded post','removal_rule':'holder change ends duty permanently','succession_rule':'no continuation','no_actor_existence_dereference':True}
    if alias=='charter':return {'campaign_id':bind('pc_host','campaign_id','CampaignId'),'source_profile_pin':{'derive':'ADOPTED_PROFILE_PIN','format':'profile:{profile_id}:{sha256}'},'institution':bind('institution'),'office':bind('supervisor_office'),'scope':bind('local_scope'),'world':bind('world'),'locus':bind('workshop_locus'),'attendant_existence':bind('attendant_existence'),'attendant_post':bind('attendant_post'),'designated_pc_binding':bind('pc_binding'),'future_production_operation':{'key':'production/operation/b3-qualification-bracket-job','must_exist_before_instruction':True,'no_present_fact_assertion':True},'power':'ISSUE_ONE_STANDING_COMPLETION_DIRECTION','operative_effect':'authority_grant','grant_id':'AD-1'}
    if alias=='population_ledger':return {'ledger_id':'b3-qualification-workshop-population','unit_class':'HUMAN_VISITOR','world_id':world,'locus_id':locus,'units':[{'unit_id':'b3-qualification-population-visitor','residence':locus,'presence':locus,'burden_allocation':None}],'point':TIME(0)}
    if alias=='economy_request':return {'demand_envelope_id':'b3-qualification-bracket-job','carrier':{'kind':'POPULATION_UNIT','ledger_id':'b3-qualification-workshop-population','unit_id':'b3-qualification-population-visitor'},'demand_entry':{'output_class':'bracket','quantity':{'amount':1,'unit':'unit'}},'source_carrier_must_match':bind('population_ledger')}
    if alias=='production_start':return {'request_key':'economy/request/b3-qualification-bracket-job','reserve_id':'b3-qualification-bracket-stock','transformation':{'input_quantity':{'amount':1,'unit':'unit'},'output_quantity':{'amount':1,'unit':'unit'},'output_class':'bracket','output_condition':'finished'},'completion_at':TIME(600),'requires_real_economy_request':bind('economy_request')}
    if alias=='production_temporal_enrolment':return {'operation':bind('production_start'),'completion_boundary':TIME(600),'temporal_owner_native':True,'fallback_acceptance_owner':'world_state'}
    if alias=='instruction':return {'campaign_id':bind('pc_host','campaign_id','CampaignId'),'charter':bind('charter'),'source_holder':bind('supervisor_office'),'operation':bind('production_start'),'pc_binding':bind('pc_binding'),'attendant':bind('attendant_existence'),'post':bind('attendant_post'),'scope':'MONITOR_ACCEPTED_COMPLETION','disclosure_scope':'COMPLETION_CONFIRMED_TO_DESIGNATED_PC','issued_basis':{'derive':'ADOPTED_PROFILE_PIN'},'operative_effect':'administrative_direction','grant_id':'AD-1'}
    if alias=='accepted_standing_duty':return {'actor':bind('attendant_existence'),'issued_instruction':bind('instruction'),'accepted_basis':'SEEDED_STANDING_POST_DUTY','no_npc_choice_receipt':True,'profile_pin':{'derive':'ADOPTED_PROFILE_PIN'}}
    if alias=='glassbell_exposure':return {'host':bind('pc_host'),'placement':bind('pc_placement'),'locus':bind('workshop_locus'),'at':TIME(0),'world_condition':'GLASSBELL_FIELD_V1','world_state_original_source':True}
    if alias=='auditory_condition':return {'host':bind('pc_host'),'cause':bind('glassbell_exposure'),'pc_binding':bind('pc_binding'),'effect':'HEARING_FUNCTION_LIMITATION','condition_class':'GLASSBELL_AFTEREFFECT_V1','recovery_duration':{'kind':'SI_SUBDAY_V1','count':5,'unit':'minute'},'require_representable_clock':True}
    if alias=='health_recovery_enrolment':return {'condition':bind('auditory_condition'),'recovery_boundary':{'derive':'siSubdayV1Target','source_alias':'glassbell_exposure','count':5,'unit':'minute'},'native_temporal_stage':True}
    if alias=='coverage_anchor':return {'host':bind('pc_host'),'pc_binding':bind('pc_binding'),'modality':'AUDITORY','scope_start':TIME(0),'source_classes':['health_pc_relevant_condition']+(['world_opening_glassbell_exposure'] if isglass else []),'inventory_aliases':(['glassbell_exposure','auditory_condition','health_recovery_enrolment'] if isglass else []),'source_segments':'EVERY_ORIGINAL_SEGMENT_FROM_ANCHOR','requires_full_owner_proof':True,'result_if_incomplete':'UNKNOWN'}
    raise ValueError(alias)

# Source authorship qualification. Never use an arbitrary prose-only producer requirement.
def producer(g,id_,glass):
    alias=g['alias']; outkind=g['kind']; base_schema=NATIVE_INPUT_SCHEMAS.get(alias, outkind+'Schema')
    key=KEYS.get(alias)
    if not key: raise ValueError('no key '+alias)
    inputv=group_producer_input(alias,id_,glass)
    return {
        'kind':'PRODUCER_ORIGINAL',
        'input_contract':{'schema':base_schema,'operation':OPERATIONS[alias], 'source_owner':g['owner'], 'argument_object':inputv},
        'producer_resolution':{'owner':g['owner'],'facet':g['facet'],'owner_registered_writer_required':True,'original_cut':TIME(0),'policy_identity':{'Sovereign_B3_D1_D4_ratification':RAT,'ratification_pin':RAT_PIN},'required_predecessor_aliases':g.get('requires',[]),'result_must_be_derived_not_assumed':True},
        'expected_output':{'kind':outkind,'owner':g['owner'],'facet':g['facet'],'key_derivation':{'pattern':key,'profile_id':id_},'write_kinds':g.get('group_writes',[outkind]),'strict_result_schema':outkind+'Schema'},
        'independent_falsifier':{'positive':'ACTUAL_OWNER_ADMISSION_WITH_NATIVE_OWNER_PROVENANCE_AND_ALL_REQUIRED_PREDECESSORS','negative_cases':['CALLER_ASSERTS_OUTPUT_WITHOUT_OWNER_WRITE','UNQUALIFIED_OR_STALE_PREDECESSOR','INCORRECT_OWNER_OR_KEY_OR_POLICY','MISSING_SOURCE_SIGNATURE_OR_REAL_RECEIPT'],'required_negative_result':'REJECT_NO_QUALIFIED_OUTPUT'},
        'activation':'TEST_SEAM_ONLY_UNTIL_EXACT_PROFILE_SHA_ADOPTED',
    }

def main(glass):
    name='glassbell' if glass else 'quiet'; oldid='workshop-opening-'+name+'-v1';id_='workshop-opening-'+name+'-v2'
    j=json.load(open(src/(oldid+'.json')))
    groups=copy.deepcopy(j['opening_contract']['owner_group_publications'])
    # RED CB-4 remove unsupported second actor and CB-5 remove speculative founding-order writer.
    groups=[g for g in groups if g['alias'] not in ('supervisor_existence','founding_order')]
    for g in groups:
        g['requires']=[x for x in g.get('requires',[]) if x not in ('supervisor_existence','founding_order')]
        if g['alias']=='actor_setup_closure':g['requires']=['actor_setup_placement','attendant_existence']
        if g['alias']=='institution':g['requires']=['workshop_locus']
        if g['alias']=='supervisor_office':g['requires']=['institution']
        if g['alias']=='attendant_post':g['requires']=['institution','attendant_existence']
        if g['alias']=='charter':g['requires']=['institution','supervisor_office','attendant_post','attendant_existence','pc_binding','local_scope']
        if g['alias']=='economy_request':g['requires']=['population_ledger']
        if g['alias']=='production_reserve':g['requires']=['workshop_locus']
        if g['alias']=='production_start':g['requires']=['economy_request','production_reserve']
    def newgroup(alias,phase,requires):
        e=EXTRA[alias]
        return {'alias':alias,'owner':e['owner'],'facet':e['facet'],'kind':e['kind'],'phase':phase,'requires':requires,'source_scope':'QUALIFICATION_ONLY','source_contract_refs':['RED CB-3/CB-4','Sovereign D-4'], 'group_writes':[e['kind']]}
    ind=next(i for i,g in enumerate(groups) if g['alias']=='attendant_existence')
    groups[ind:ind]=[newgroup('ms_issue',3,['pc_host','workshop_locus']),newgroup('ms_response',3,['ms_issue'])]
    ind=next(i for i,g in enumerate(groups) if g['alias']=='economy_request')
    groups.insert(ind,newgroup('population_ledger',5,['workshop_locus']))
    for idx,g in enumerate(groups,1):
        g['sequence']=idx
        if g['alias']=='supervisor_office':g['owner']='gip'
        if g['alias']=='charter':g['kind']='gip_local_completion_notice_charter';g['group_writes']=['gip_local_completion_notice_charter']
        if g['alias']=='instruction':g['kind']='gip_local_completion_notice_instruction';g['group_writes']=['gip_local_completion_notice_instruction']
        if g['alias']=='economy_request':g['group_writes']=['economy_demand','economy_request']
        if g['alias']=='production_start':g['group_writes']=['production_reserve','production_claim','production_operation']
        if g['alias'] in ('production_temporal_enrolment','health_recovery_enrolment'):g['kind']='temporal_object'
        if g['alias'] in ('supervisor_office','attendant_post','institution'):g['authored_value']=None
        if 'producer_contract' in g:g.pop('producer_contract',None)
        val=g.pop('authored_value',None)
        g.pop('payload_mode',None)
        # source authored facts are literal, except owner inputs needing adopted profile pin or real actor provenance
        if val is not None and g['alias'] in ('world','workshop_locus','local_scope','production_reserve'):
            ss=json.dumps(val);ss=ss.replace(oldid,id_).replace('two originally authored attendant/supervisor role existences','one originally issued M-S attendant and one opaque supervisor office holder');val=json.loads(ss)
            g['source_form']='STATIC_EXACT';g['authored_fact']={'key':KEYS[g['alias']].replace('{profile_id}',id_).replace('{reserve_id}','b3-qualification-bracket-stock').replace('{institution_id}','b3-qualification-workshop-institution').replace('{office_id}','b3-qualification-notice-supervisor').replace('{scope_binding_id}','b3-qualification-local-notice-scope'),'strict_schema':g['kind']+'Schema','value':val}
        else:
            g['source_form']='PRODUCER_ORIGINAL';g['producer_instruction']=producer(g,id_,glass)
        # source contract names and comments from v1 may be contradicted by ratified CB-3..5
        g['source_contract_refs']=['BLUE v2.0 RED CB-1..CB-9','SOVEREIGN D1..D4',MAIN]
    # Manual source correspondence correction for exact current owner registry key spaces
    for g in groups:
        if g['alias']=='local_scope':
            g['authored_fact']['key']=f'gip/institution/b3-qualification-workshop-institution/office/b3-qualification-notice-supervisor/scope-binding/b3-qualification-local-notice-scope'
        if g['alias']=='production_reserve':
            g['authored_fact']['key']='production/reserve/b3-qualification-bracket-stock'
        if g['alias']=='world':
            g['authored_fact']['value']['reference_causal_basis']['established_canon']='One bounded fictional workshop with one operative PC, one original M-S named attendant, and one opaque GIP supervisor-office holder. No historical world is modified.'
        if g['alias']=='workshop_locus':
            g['authored_fact']['value']['locus_id']=id_
        if g['alias']=='population_ledger':
            g['producer_instruction']['expected_output']['key_derivation']['pattern']='population/{ledger_id}/ledger'
        if g['alias']=='economy_request':
            g['producer_instruction']['expected_output']['key_derivation']['pattern']='economy/request/{request_id}'
            g['producer_instruction']['expected_output']['write_kinds']=['economy_demand','economy_request']
        if g['alias']=='production_start':
            g['producer_instruction']['expected_output']['write_kinds']=['production_reserve','production_claim','production_operation']
        if g['alias']=='ms_issue' or g['alias']=='ms_response':
            # Work tied to M-S real signed grant. The exact key is code-derived at original cut; never synthesize digest.
            g['producer_instruction']['expected_output']['key_derivation']['derived_by']='MS_SOURCE_DERIVATION_FROM_ACTUAL_SIGNED_ORIGINAL_INPUTS'
        if g['alias']=='attendant_existence':
            g['requires']=['ms_issue','ms_response']
    j['id']=id_
    j['schema']='immortalis.blue.b3.c0.typed-original-producer-source-candidate.v4'
    j['status']='SOURCE_INPUT_CANDIDATE_QV1_STATIC_AND_TYPED_PRODUCER_VALIDATION_REQUIRED_NOT_ADOPTED'
    j['source_law']={'base_main':MAIN,'sovereign_D1_D4':RAT,'sovereign_pin':RAT_PIN,'blue_plan_v2':'https://app.notion.com/p/42120af901e081fdac32e51c3350e5ce','blue_plan_pin':'2026-11-23T10:14:06.394Z'}
    j['profile_policy']={'only':'DISPOSABLE_QUALIFICATION','actor_origin':'ONE_M_S_PLAYER_AUTHORED_OR_DELEGATED_ACTOR_LEAF','supervisor':'OPAQUE_GIP_OFFICE_HOLDER_NO_NAMED_ACTOR_EXISTENCE','authority':'TWO_NEW_GIP_GRANT_G_KINDS_AD1','government_founding':'OPAQUE_CONSTITUTIVE_PROFILE_PIN_DERIVED_AFTER_ADOPTION','requester':'POPULATION_UNIT_TO_ECONOMY_DEMAND_AND_REQUEST_ATOMIC','production':'RESERVE_CREATE_THEN_RESERVE_ADVANCE_CLAIM_CREATE_OPERATION_CREATE_ATOMIC','health':('GLASSBELL_HEARING_CONDITION_AND_GENERIC_TEMPORAL_RECOVERY' if glass else 'NO_OPENING_GLASSBELL_NO_ASSUMED_HEARING_NORMALITY'),'production_allowlist':'EMPTY_UNTIL_SEPARATE_SOVEREIGN_AD4B_EXACT_DIGEST_ADOPTION','b2_if6b':'SOURCE_APPROVED_IN_SEPARATE_ISSUE_138_NOT_IMPLEMENTED'}
    j['source_census']={'main':MAIN,'status':'EXISTING_OWNER_SCHEMAS_LITERALS_VERIFIED_SELECTIVELY; PROSPECTIVE_KIND_SCHEMAS_NEED_C1_C2_ENGINE_PARSER_VALIDATION','group_count':len(groups),'group_write_count':sum(len(g['group_writes']) for g in groups),'static_count':sum(g['source_form']=='STATIC_EXACT' for g in groups),'producer_count':sum(g['source_form']=='PRODUCER_ORIGINAL' for g in groups),'note':'C0 candidate source recipe is not an engine-accepted original publication or exact Sovereign adoption.'}
    j['opening_contract']={'schema':'C0_TYPED_ORIGINAL_INPUTS_V4','nine_phase_order':[1,2,3,4,5,6,7,8,9],'groups':groups,'group_count':len(groups),'all_groups_at_original_t0':True,'canonical_time':TIME(0),'allowlist':'EMPTY','original_owner_writes_only':True,'source_execution':'C1_C2_OWNER_MODULES_AND_AUTHENTIC_NATIVE_PRODUCERS_REQUIRED','fail_closed':'any non-owner-generated result unqualified, no live fact writes','original_signature':'independent signed M-S and referee outputs never predeclared','clock':'SI_SUBDAY_V1_COMPUTATION_ONLY_FOR_RECOVERY_5_MINUTES','source_adoption':'FUTURE_AD4B_EXACT_ID_AND_DIGEST', 'physical_world_fields':'bounded fictional testkit scope only'}
    j['sha256_binding']={'calculated_externally_on_full_UTF8_BYTES':True,'no_self_referential_hash_inside_static_values':True,'adoption':'PENDING_SOVEREIGN_AD4B','present_candidate_not_legal_source':True}
    # Remove claims of old binding and retired plan fields elsewhere that are not primary source model.
    j.pop('acceptance_proofs',None)
    j.pop('post_opening_contract',None)
    j['admission_controls']={'no_historical_world_reuse':True,'no_forged_referee_or_M_S':True,'no_prior_owner_output_predeclared':True,'no_dynamic_result_without_real_registered_owner':True,'no_automatic_health_clearance':True,'no_positive_Lane_X_without_B2_IF6B':True,'no_production_allowlist_until_Ad4B':True}
    data=(json.dumps(j,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode('utf8')
    path=out/(id_+'.json');path.write_bytes(data)
    return {'id':id_,'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'groups':len(groups),'static':j['source_census']['static_count'],'original_producer':j['source_census']['producer_count'],'group_writes':j['source_census']['group_write_count']}
if __name__=='__main__':
 m=[main(False),main(True)];(out/'manifest-v2.json').write_text(json.dumps(m,indent=2)+'\n')
 for x in m:print(x)
