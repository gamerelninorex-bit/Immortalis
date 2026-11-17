#!/usr/bin/env python3
"""S-4 initial Standing Instruction ledger -- MUTATION SANITY CHECK (MECHANISM ONLY, T1).

Each mutation disables or weakens exactly one rule of the S-4 ledger in the working tree, runs the ledger test files, records which tests
fail, and RESTORES the file (a copy is kept and put back in a `finally`). A mutation that no test notices is a hole in the tests, not a
pass. Usage, from the repository root:   python3 tools/s4-ledger-mutation-check.py [name-prefix, e.g. M6]
Needs `pnpm`; writes `$TMPDIR/s4-mutation/*.json`. Never commits or stages anything.
"""
import json, os, shutil, subprocess, sys, tempfile, time
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
S=os.path.join(tempfile.gettempdir(),'s4-mutation')+'/'
os.makedirs(S,exist_ok=True)
LED='packages/engine/src/owners/pc-standing-ledger.ts'
ADM='packages/engine/src/owners/pc-standing-ledger-admission.ts'
OWN='packages/engine/src/owners/admission.ts'
INT='packages/engine/src/world/integrity.ts'
CAM='packages/engine/src/world/canonical-campaign.ts'
M=[
 ("M1 pair shape/digest/head/identity check disabled",LED,'  const head = PcStandingLedgerHeadSchema.safeParse(headFact.value);\n  const version = PcStandingLedgerVersionSchema.safeParse(versionFact.value);\n  if (!head.success','  if (Date.now() > 0) return null;\n  const head = PcStandingLedgerHeadSchema.safeParse(headFact.value);\n  const version = PcStandingLedgerVersionSchema.safeParse(versionFact.value);\n  if (!head.success'),
 ("M1b version digest not re-derived",LED,'if (ledgerVersionDigest(body) !== content_sha256) {','if (Date.now() < 0 && ledgerVersionDigest(body) !== content_sha256) {'),
 ("M1c head pointer not checked",LED,'if (!canonicalEqual(head.data, headOfVersion(version.data))) {','if (Date.now() < 0 && !canonicalEqual(head.data, headOfVersion(version.data))) {'),
 ("M1d derived operation identity not checked",LED,'  if (\n    identity.group_id !== expected.group_id ||','  if (\n    Date.now() < 0 &&\n    identity.group_id !== expected.group_id ||'),
 ("M2a binding prerequisite violation not applied",ADM,'  const violation = bindingLedgerViolation(binding, state.facts);\n  return violation\n    ? reject("REFERENCE_INVALID", violation, { key: PLAYER_CHARACTER_BINDING_KEY })','  const violation = null as string | null;\n  return violation\n    ? reject("REFERENCE_INVALID", violation, { key: PLAYER_CHARACTER_BINDING_KEY })'),
 ("M2b binding does not have to read/depend on the ledger",ADM,'    const pinned = requirePrerequisite(group, state, key, what);\n    if (isRejection(pinned)) return pinned;\n  }\n  const violation = bindingLedgerViolation(binding','    const pinned = Date.now() > 0 ? null : requirePrerequisite(group, state, key, what);\n    if (isRejection(pinned)) return pinned;\n  }\n  const violation = bindingLedgerViolation(binding'),
 ("M3 fresh binding may keep the original citation",OWN,'  if (!canonicalEqual(group.rule, PC_LEDGER_BINDING_RULE)) {\n    return reject(\n      "REFERENCE_INVALID",\n      "a new binding must cite','  if (Date.now() < 0 && !canonicalEqual(group.rule, PC_LEDGER_BINDING_RULE)) {\n    return reject(\n      "REFERENCE_INVALID",\n      "a new binding must cite'),
 ("M4 unclosed-setup scan disabled",LED,'export function unclosedSetupViolation(facts: WalkableLedgerFacts): string | null {\n','export function unclosedSetupViolation(facts: WalkableLedgerFacts): string | null {\n  if (Date.now() > 0) return null;\n'),
 ("M5a closure of the coupled world not required",LED,'  if (closure) {\n    if (cited === null || cited.fact_key !== closureKey) {','  if (Date.now() < 0 && closure) {\n    if (cited === null || cited.fact_key !== closureKey) {'),
 ("M5b foreign/unneeded closure tolerated",LED,'  return cited === null\n    ? null\n    : "the ledger cites a setup closure that is not the closure of the world being coupled";','  return null;'),
 ("M6 history verification id has no S-4 suffix",OWN,'${PC_LEDGER_HISTORY_POLICY_SUFFIX}`','`'),
 ("M7 reconcile disabled (retry after binding)",CAM,'reconcile ? "RECONCILE" : "CREATE"','"CREATE"'),
 ("M8 cold-open binding/ledger check disabled",INT,'const violation = bindingLedgerViolation(b, factsBefore(revisionOf(fact), facts, revisionOf));','const violation = null as string | null;'),
 ("M10 the setup scan dates every fact before filtering (cold-open cost regression)",INT,'        if (keyFilter && !keyFilter(f.key)) continue;\n','        if (keyFilter && Date.now() < 0) continue;\n'),
 ("N1 H-1: an explicit null is accepted although the target world has a committed closure",LED,'    if (o.setup_closure === null) {\n      return `the target world','    if (Date.now() < 0 && o.setup_closure === null) {\n      return `the target world'),
 ("N2 H-1: an explicit null need not pin the closure as absent (version-0 read) at admission",ADM,'      if (!group.reads.some((r) => r.key === absent && r.version === 0)) {','      if (Date.now() < 0 && !group.reads.some((r) => r.key === absent && r.version === 0)) {'),
 ("N3 H-1: the target world profile need not be read or depended on",ADM,'          [origin.target_world.fact_key, "the target world\'s profile"],\n','          ...([] as never[]),\n'),
 ("N4 H-1: a binding may couple a world other than the ledger's target world",LED,'  if (targetWorldIdOf(version.origin.target_world) !== coupledWorld) {','  if (Date.now() < 0 && targetWorldIdOf(version.origin.target_world) !== coupledWorld) {'),
 ("N5 H-1: cold-open verification does not require the absence pin of a null",INT,'          if (absent === null || !group?.reads.some((r) => r.key === absent && r.version === 0)) {','          if (Date.now() < 0) {'),
 ("N6 H-1: the operation identity ignores the target world",LED,'o.pc_creation, o.target_world, o.setup_closure]','o.pc_creation, o.setup_closure]'),
 ("N7 H-1: another world\'s closure is accepted for the target world",LED,'    if (o.setup_closure.fact_key !== closureKey) {','    if (Date.now() < 0 && o.setup_closure.fact_key !== closureKey) {'),
 ("N8 H-1: a closure is accepted for a target world that has none",LED,'  } else if (o.setup_closure !== null) {','  } else if (Date.now() < 0 && o.setup_closure !== null) {'),
 ("M9 replay (historical) ledger check disabled",ADM,'export function pcLedgerHistoricalCheck(group: CommitGroup, state: CampaignState): Rejection | null {\n','export function pcLedgerHistoricalCheck(group: CommitGroup, state: CampaignState): Rejection | null {\n  if (Date.now() > 0) return null;\n'),
]
FILES=sys.argv[2:] if len(sys.argv)>2 else None
only=sys.argv[1] if len(sys.argv)>1 else ''
TESTS=[ 'tests/integration/pc-standing-ledger-%s.test.ts'%n for n in ('foundation','refusals','legacy','recovery','history','scaling','operator','policy','closure-origin')]+['tests/security/pc-standing-ledger-security.test.ts','tests/conformance/pc-standing-ledger-conformance.test.ts','tests/unit/owner-admission.test.ts','tests/unit/pc-standing-ledger-binding-prerequisite.test.ts','tests/unit/pc-standing-ledger-origin.test.ts','tests/integration/world-foundation.test.ts']
out={}
for name,f,old,new in M:
    if only and not name.startswith(only): continue
    p=R+f; src=open(p).read()
    assert src.count(old)==1,(name,src.count(old))
    bak=S+'mut-bak-'+os.path.basename(f)
    shutil.copy(p,bak)
    try:
        open(p,'w').write(src.replace(old,new))
        t=time.time()
        subprocess.run(['pnpm','exec','vitest','run',*TESTS,'--reporter=json','--outputFile='+S+'mut.json'],cwd=R,capture_output=True,text=True)
        j=json.load(open(S+'mut.json'))
        fails=[(os.path.basename(r['name']),a['title'][:90]) for r in j['testResults'] for a in r['assertionResults'] if a['status']=='failed']
        suitefail=[os.path.basename(r['name']) for r in j['testResults'] if r['status']=='failed' and not any(a['status']=='failed' for a in r['assertionResults'])]
        out[name]={'failed_tests':len(fails),'suite_errors':suitefail,'files':sorted({a for a,_ in fails}),'sample':fails[:3],'secs':round(time.time()-t)}
        print(name,'->',out[name]['failed_tests'],'failing tests in',out[name]['files'],out[name]['suite_errors'],flush=True)
    finally:
        shutil.copy(bak,p)
json.dump(out,open(S+'mutation-results-%s.json'%(only or 'all'),'w'),indent=1)
print('DONE')
