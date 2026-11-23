import json, subprocess, sys, os
# run from the repository root:  python3 -I docs/evidence/f014b-b2/run-mutants.py [M01 M02 ...] > mutation-results.jsonl
SP=os.environ.get("B2_MUTATION_OUT", "/tmp/b2-mutation"); os.makedirs(SP, exist_ok=True)
HERE=os.path.dirname(os.path.abspath(__file__))
TESTS=["tests/integration/b2-custody-lifecycle.test.ts","tests/integration/b2-identity.test.ts","tests/integration/b2-crash-recovery.test.ts","tests/integration/b2-two-process.test.ts","tests/integration/b2-history-replay.test.ts","tests/integration/b2-production-denial.test.ts","tests/integration/b2-cost.test.ts","tests/security/b2-static-boundary.test.ts","tests/integration/b2-fence-layers.test.ts","tests/integration/b2-custody-negatives.test.ts","tests/integration/b2-stage-claims.test.ts","tests/contract/b2-gm-wait-contracts.test.ts"]
CORE="packages/engine/src/commit/campaign-core.ts"; ADM="packages/engine/src/owners/admission.ts"; EXT="packages/engine/src/owners/extension.ts"
CUS="packages/engine/src/gm-wait-custody.ts"; CKP="packages/engine/src/persistence/checkpoint-package.ts"; FP="packages/engine/src/persistence/file-package.ts"; IDN="packages/engine/src/gm-wait-identity.ts"
L_CORE=("    const fenced = gmWaitFenceViolation(group, this.#fence, this.#params.admission, checkRegistry);","    const fenced = null;")
L_ADM=("      const w2 = gmWaitFenceViolation(group, gmWaitFenceOf(state), { historyVerificationId }, true);","      const w2 = null;")
L_EXT=("      const w2 = gmWaitFenceViolation(group, gmWaitFenceOf(state), base, true);","      const w2 = null;")
H_ADM=("        gmWaitFenceViolation(group, gmWaitFenceOf(state), { historyVerificationId }, false) ??","        null ??")
H_EXT=("      const w2 = gmWaitFenceViolation(group, gmWaitFenceOf(state), base, false);","      const w2 = null;")
M=[
 ("M01","live fence in the COMMIT CORE removed",[(CORE,)+L_CORE]),
 ("M02","live fence in the BASE owner admission removed",[(ADM,)+L_ADM]),
 ("M03","live fence in the EXTENSION binding removed",[(EXT,)+L_EXT]),
 ("M04","ALL THREE live fences removed",[(CORE,)+L_CORE,(ADM,)+L_ADM,(EXT,)+L_EXT]),
 ("M05","the ACTIVE branch never refuses (foreign groups admitted during a wait)",[(CUS,"  if (isSeal) return null;\n  return refuse(\n    \"REFERENCE_INVALID\",\n    \"GM_WAIT_ACTIVE_FOREIGN\",","  return null;\n  return refuse(\n    \"REFERENCE_INVALID\",\n    \"GM_WAIT_ACTIVE_FOREIGN\",")]),
 ("M06","original-policy HISTORICAL fence removed from the base admission",[(ADM,)+H_ADM]),
 ("M07","original-policy HISTORICAL fence removed from the extension binding",[(EXT,)+H_EXT]),
 ("M08","ALL historical fences removed (base and extension)",[(ADM,)+H_ADM,(EXT,)+H_EXT]),
 ("M09","historical custody-transition check removed (replay trusts any well-shaped custody group)",[(ADM,"        gmWaitCustodyCheck(group, state, { policy: custody, live: false }) ??","        null ??")]),
 ("M10","ephemeral origin-proof check removed",[(CUS,"function proofViolation(group: CommitGroup, marker: GmWaitMarker, live: boolean): Rejection | null {\n  if (!live) return null;","function proofViolation(group: CommitGroup, marker: GmWaitMarker, live: boolean): Rejection | null {\n  if (true) return null;")]),
 ("M11","preparation qualification removed (the NONE policy no longer refuses)",[(CUS,"  if (ctx.policy.preparation === \"NONE\")\n    return unqualified(","  if (false)\n    return unqualified(")]),
 ("M12","the production admission qualifies a fixture preparation",[(ADM,"    preparation: policy.syntheticEvidence === \"REQUIRE\" ? \"FIXTURE\" : \"NONE\",","    preparation: \"FIXTURE\",")]),
 ("M13","a seal may depart from the authority it completes",[(CUS,"    gmWaitSealDepartsFromAuthority(tx, authority.data, sealWrite)\n  )\n    return bad(\n      \"GM_WAIT_SEAL\",","    false\n  )\n    return bad(\n      \"GM_WAIT_SEAL\",")]),
 ("M14","NO_OPEN need not pin the opening and the seal at version 0",[(CUS,"    !sameReads(group.reads, reads) ||\n    !sameDeps(group.depends_on, [next.marker.group_id, priorFact.provenance.group_id])\n  )\n    return bad(\n      \"GM_WAIT_WITNESS\",\n      \"NO_OPEN pins","    false ||\n    !sameDeps(group.depends_on, [next.marker.group_id, priorFact.provenance.group_id])\n  )\n    return bad(\n      \"GM_WAIT_WITNESS\",\n      \"NO_OPEN pins")]),
 ("M15","a checkpoint that holds an ACTIVE wait is trusted warm (no forced strict replay)",[(CKP,"  if (!options.audit && gmWaitCheckpointNeedsStrictReplay(state))","  if (false && gmWaitCheckpointNeedsStrictReplay(state))")]),
 ("M16","a protected journal replays without the W2 admission (file package, per entry)",[(FP,"    if (gmWaitIsCustodyGroup(entry.data.group) && !gmWaitAdmissionInstalled(options.admission)) {","    if (false) {")]),
 ("M17","a protected store opens writable without the W2 admission (file package, post-replay)",[(FP,"  if (core.gmWaitFence.protected && !gmWaitAdmissionInstalled(options.admission)) {","  if (false) {")]),
 ("M13b","the Temporal kernel's OWN transaction admission no longer compares a GM seal with its opening (the custody rule still does)",[("packages/engine/src/temporal/admission.ts","            gmWaitSealDepartsFromAuthority(stored as GmWaitResolutionTransaction, a.data, txWrite)","            false")]),
 ("M16b","a protected journal replays without the W2 admission (checkpoint package, per tail entry)",[(CKP,"      if (gmWaitIsCustodyGroup(entry.group) && !gmWaitAdmissionInstalled(options.admission)) {","      if (false) {")]),
 ("M17b","a protected checkpoint store opens writable without the W2 admission (checkpoint package, post-replay)",[(CKP,"    if (core.gmWaitFence.protected && !gmWaitAdmissionInstalled(options.admission)) {","    if (false) {")]),
 ("M18","the fence view is never re-derived after a custody group is adopted",[(CUS,"  if (!changes) return { ...prior, revision: next.revision };\n  gmWaitFenceMetrics.rederivations++;\n  return deriveGmWaitFence(next);","  return { ...prior, revision: next.revision };")]),
 ("M19","X is derived without length delimiting (parts concatenated)",[(IDN,"  return Buffer.concat(chunks);","  return Buffer.from(parts.join(\"\"), \"utf8\");")]),
 ("M21","the claim check is removed (a stage-shaped group carrying X's cause and dependency is no longer refused as a claim; the stage branch stays closed)",[(CUS,"    const claim = gmWaitClaimOf(group, live);","    const claim: string | null = null;")]),
 ("M22","the claim check is LIVE only (replay no longer judges a claim at the incremental prestate)",[(CUS,"function gmWaitClaimOf(group: CommitGroup, live: boolean): string | null {\n","function gmWaitClaimOf(group: CommitGroup, live: boolean): string | null {\n  if (!live) return null;\n")]),
 ("M23","a claim by DEPENDENCY alone (ordinary cause, dependency on X's kernel groups) is no longer a claim",[(CUS,"  return dependency === undefined ? null : `dependency ${dependency}`;","  void dependency;\n  return null;")]),
 ("M24","a claim by CAUSE alone (no dependency) is no longer a claim",[(CUS,"  if (causeClaims) return `cause ${group.cause}`;","  void causeClaims;")]),
 ("M25","the ORIGINAL F-1 defect restored: the stage branch is reopened (cause + dependency on the opening) and the claim check removed",[(CUS,"  if (isSeal) return null;\n  return refuse(","  const isStage =\n    group.owner !== OWNER_TEMPORAL_KERNEL &&\n    group.cause === transactionCause(active.transactionId) &&\n    group.depends_on.includes(active.authorityGroupId);\n  if (isSeal || isStage) return null;\n  return refuse("),(CUS,"    const claim = gmWaitClaimOf(group, live);","    const claim: string | null = null;")]),
 ("M26","the GM seal contract admits credited stages again (the strict zero-stage tuple replaced by the legacy stages array)",[("packages/contracts/src/temporal-custody.ts","    stages: z.tuple([]),","    stages: ResolutionTransactionSchema.shape.stages,")]),
 ("M20","the W2 verifier segment is dropped from the composed history identity",[(ADM,"${MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT}${GM_WAIT_W2_HISTORY_POLICY_SEGMENT}`","${MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT}`")]),
]
only=sys.argv[1:] 
for mid,desc,edits in M:
    if only and mid not in only: continue
    spec={"id":mid,"description":desc,"edits":[{"file":f,"old":o,"new":n} for f,o,n in edits],"tests":TESTS}
    p=f"{SP}/spec-{mid}.json"; json.dump(spec,open(p,"w"))
    r=subprocess.run(["python3","-I",f"{HERE}/mutate.py",p],capture_output=True,text=True)
    line=r.stdout.strip().splitlines()[-1] if r.stdout.strip() else json.dumps({"id":mid,"error":r.stderr[-300:]})
    print(line,flush=True)
