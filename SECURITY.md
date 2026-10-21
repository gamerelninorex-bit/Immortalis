# Security

## Trust boundary

- The external LLM host and any client are **untrusted / potentially adversarial**. Security never depends on a prompt asking the host not to reveal something.
- Authentication, authorization, campaign isolation and epistemic/hidden-state filtering happen inside trusted code **before** any host exposure.
- Hosts receive only allowlisted, typed operations and lawful projections — no raw repository, filesystem, shell or database access.
- Host assertions, persona labels, tool names and model identities carry no authority. Development identities (Sovereign, Blue, George, Red, Claude, providers) confer no runtime campaign authority.
- Client-shipped code is inspectable; authoritative implementation stays server-side where secrecy matters.
- Gameplay fidelity outranks security theater: a control that materially degrades lawful play must be redesigned, reduced or isolated.

## Secrets

No credentials, signing material, admin tokens or source credentials in the repository, prompts, fixtures, examples or committed configuration. Bootstrap uses placeholders only. `.env*` files are git-ignored except `*.example`. `tests/security/repo-hygiene.test.ts` checks for obvious credential material.

## Production separation

Production runtime must not contain design/governance material, developer rationale, repository credentials or debug assets.

## Reporting a vulnerability

Report vulnerabilities privately to the repository owner using GitHub's private vulnerability reporting or security-advisory workflow where available, or another private channel agreed with the owner. Do not disclose an unpatched vulnerability or credentials in a public issue or pull request. Include the affected commit SHA and a minimal reproduction without real credentials.
