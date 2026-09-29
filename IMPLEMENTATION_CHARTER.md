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

## Implementation Escalation

When implementation exposes a genuine ambiguity, contradiction, missing substantive rule, ownership conflict or impossible approved constraint, **do not guess**. Stop only the affected scope and report:

- affected governing clause or contract;
- affected code/module/test;
- exact implementation obstacle;
- why the existing specification does not determine one faithful answer;
- technically plausible alternatives, if useful, without choosing a new game rule;
- smallest reproducible case or failing test where applicable.

Route: Implementation Agent → Blue/George → existing authority check → smallest design repair if genuinely required → independent Red review where governance requires it → Sovereign ratification where required → specification update → implementation resumes. Open a `blocked-spec` issue containing only the implementation-facing question and a pointer.
