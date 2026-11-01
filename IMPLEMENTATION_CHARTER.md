# IMMORTALIS Implementation Charter (Coding-Agent Charter)

This is the coding-era operating contract derived from F-027. It is **not** a design authority and adds no game-design tenets. Notion remains the design/governance source of truth; this repository is the implementation/version/review source of truth.

- Governing package, spec lock and pins: [`spec/f027/spec-lock.json`](spec/f027/spec-lock.json)
- Authority (Notion): F-027 package <https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639>; Bootstrap Plan <https://app.notion.com/p/3ea20af901e081ae8873e28d5290fc51>; Implementation Agent Operating Charter <https://app.notion.com/p/3ea20af901e0819a88b2c490ab874acc>

## Non-negotiable principles

1. **Specification fidelity.** Notion/F-027 governs design; repository artifacts compile it.
2. **Technical freedom only.** Names, helpers, internal structures, indexes and equivalent engineering choices are free only when semantics remain unchanged.
3. **No silent semantic invention.** Missing owner, mechanic, calibration, threshold, provider capability or permission remains explicit and blocks only dependent scope.
4. **Exact-version discipline.** Every substantive PR names the F-027 spec lock and exact reviewed commit.
5. **Bounded changes.** Prefer the smallest coherent PR that can be reviewed against named RC/IM/IA/V requirements.
6. **Protected integration.** Substantive main-branch changes arrive by PR; direct pushes are not the normal implementation path.
7. **Tests are evidence, not authority.** A green suite cannot legalize a specification violation.
8. **Deterministic authoritative boundary.** Where the contract specifies deterministic identity, validation, arithmetic, conservation, scheduling or state transition, authoritative behavior is code-owned and reproducible.
9. **LLM/host cannot mutate canon directly.** Hosts propose/interpret/present; validated engine services own authoritative mutation.
10. **Owner exclusivity.** Routers, caches, protocol layers, classifiers and persistence adapters do not acquire rival substantive ownership.
11. **Turnless/partial-order integrity.** No universal tick, fixed phase loop or horizon-as-identity shortcut.
12. **Causally engaged runtime.** Routine work remains bounded to relevant state/edges/history; whole-world/all-pairs/full-history scans are exceptional diagnostics, not a convenience path.
13. **Player and epistemic integrity.** Preserve PC authorship, hidden-state independence, trigger-source parity, observer-relative interpretation and projection-before-presentation.
14. **Trust boundary.** Treat external hosts/clients as potentially adversarial; authenticate/authorize/filter inside trusted code before exposure.
15. **Minimum-sufficient context.** Security removes unauthorized exposure, not information required for faithful play.
16. **No secrets in prompts or repository content.** Credentials, signing material, admin tokens and source credentials are never placed in prompts, examples, fixtures or committed configuration.
17. **Provider neutrality until adoption.** Prototype convenience does not constitute a production provider decision or guarantee.
18. **Single canon.** Caches, mirrors, projections and test fixtures cannot become alternate authoritative saves.
19. **Reproducibility and evidence.** Material probes record spec version, commit, fixture/input, environment/configuration, result and assertion scope.
20. **Explicit failure classes.** FAIL, BLOCKED, UNRUN, UNKNOWN infrastructure outcome and semantic escalation remain distinct.
21. **Implementation escalation.** Clear spec + bad code → repair code. Presentation-only issue → tune within the lawful envelope. Genuine semantic contradiction/ambiguity/missing owner → stop the affected scope and escalate to Blue; independent Red review/ratification only where the governance route requires it.
22. **Role/permission neutrality.** Persona, provider, model, tool or developer identity grants no runtime campaign authority.

## Standing construction requirement: GM-led natural chat play (effective 30 October 2026)

Canonical text: Implementation Agent Operating Charter section "30 October 2026 — Standing construction requirement: GM-led natural chat play" (native pin `2026-10-30T03:16:44.156Z`), <https://app.notion.com/p/3ea20af901e0819a88b2c490ab874acc>. This repository section only points at it and states how it binds a build here. It adds no game-design tenet, no substantive owner and no host write permission, and it does not weaken principles 1-22.

For every GM-facing change:

- **The LLM is an active Game Master, not a read-only narrator and not a clerk relaying player-authored facts into referee forms.** It interprets rules and intentions, infers mundane implied means, resolves legitimately open scene detail under the right world or actor authority, adjudicates bounded qualitative uncertainty, and supplies lawful initiative. The engine supplies authoritative memory, constraints, arithmetic, conservation, validation, publication and recovery. A validated GM ruling is a legitimate causal input; it is never an unchecked "GM says yes".
- **Routine implied means stay implicit.** A normal look includes ordinary attention, turning and opening one's eyes when physically possible; a normal collection goal includes routine reaching and handling. Do not turn them into player micro-commands, per-blink proof forms, copied confirmation phrases or manual owner sequencing. "The tool has no field" and "epistemics requires it" are not finished-product justifications for routine clerical friction: resolve the actual evidence or authority seam.
- **Record only what continuity needs.** Persist an ordinary detail only when uncertainty, cost of reconstruction, a material result or continuity needs it. Transient context is not a second canonical save.
- **Known constraints stay effective.** Blindness, impairment, restraint, deliberate closed eyes, actual darkness, obstruction, ownership, resource limits, timing and independent actor knowledge are real. Intention does not prove physical success. A material fork is resolved once through its owner, from priors independent of the desired player result, before its consequence is revealed; the result is preserved.
- **Provenance is honest.** Player choice, delegated selection, GM/world authorship, adjudication, mechanical resolution and narrative presentation stay distinct. Routine GM facts are not recorded as the player's own words; delegated content carries its delegation scope and executing role. Persona or conversational confidence confers no role or permission.
- **Player consequential choice is preserved.** Delegating routine selection never authorizes a new attack, theft, costly power or other materially distinct commitment.
- **Evidence is labelled.** The Engineering Acceptance section of the PR must state ordinary-language scenarios from sparse seeds with no micro-detail filing, a genuine GM selection and a falsifying constrained case, owner-verified consequences, another meaningful decision, recovery or reconnect evidence, and complete-operation interaction cost. Scripted referee or client doubles are labelled MECHANISM ONLY; genuine-host and named-client results are separate and stay UNRUN until witnessed. Where proactive GM or world capability is claimed, include a bounded causal event or initiative with no new player command and a genuine missing-cause refusal. A narrowed read-only relay, or a green fixture that bypasses these functions, is not natural-play acceptance.

Any real conflict with a source-defined owner, lifecycle, contract or calibrated mechanic uses the Implementation Escalation route below; this requirement never delegates open-ended rule invention to a coding agent.

## Implementation Escalation

When implementation exposes a genuine ambiguity, contradiction, missing substantive rule, ownership conflict or impossible approved constraint, **do not guess**. Stop only the affected scope and report:

- affected governing clause or contract;
- affected code/module/test;
- exact implementation obstacle;
- why the existing specification does not determine one faithful answer;
- technically plausible alternatives, if useful, without choosing a new game rule;
- smallest reproducible case or failing test where applicable.

Route: Implementation Agent → Blue/George → existing authority check → smallest design repair if genuinely required → independent Red review where governance requires it → Sovereign ratification where required → specification update → implementation resumes. Open a `blocked-spec` issue containing only the implementation-facing question and a pointer.
