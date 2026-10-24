# Phone bridge: a mobile-browser chat over the shipped operator and referee commands (R-5 enablement)

> **OOC DEVELOPMENT INSTRUMENT.** This is a transport and a front end, nothing else. It adds no gameplay, no model, no paid API and no engine rule: it shows the shipped commands' own prompts on a phone and returns what the authenticated person types. **Nothing in the repository's tests of it is a real player or a real game master**; every test is labelled a MECHANISM test. It claims no First Playable PASS, gate, source-lock change or merge readiness. Built on a separate branch because the Sovereign has no computer (BLUE comment 6221232360 on PR #72).

## AI host connection repair — 17 October 2026

The authenticated `/referee` page now registers `referee_list_tasks`, `referee_get_task` and `referee_submit_decision` as browser WebMCP tools where that browser API is supported. A compatible **active AI session** reads the actual task and supplies its own interpretation and optional self-reported `claimed_model`. No player copies tasks or JSON. Registration starts no model, background worker or inference service. This is a session-based host connection, not an unattended deployment.

The tools POST to `/api/ref/tool` under the existing referee cookie, request token, JSON/same-origin/TLS checks, expiry and lane separation. The route accepts only configured host identities, the three operation names and their bounded arguments, with at most eight calls in flight. Campaign/directory/secret-file paths come only from server configuration. Each request runs the unchanged `runRefereeMcpCli` in process over streams: the existing owner-only host secret, operation binding, task/nonce proof, source coverage/quotation checks, write-once decision and downstream owner validation remain authoritative. The browser receives no secret. An offered but unbound host fails closed; listing a host in the environment does not bind it. The tool cannot issue player commands or confirmations. A submission with an uncertain outcome must be inspected before any retry.

The console remains an optional developer fallback and still labels its typed readings as human declarations. AI tool submissions retain the supplied provenance label instead. The player page exposes no referee tools. Browsers without WebMCP report that limitation explicitly; there is no scripted semantic fallback, paid API or hidden credential use. HTTP 200 can contain an MCP `isError` refusal; it does not itself mean a ruling was accepted or canonical facts committed.

Tests in `phone-bridge.test.ts` exercise the actual MCP task exchange with **explicitly scripted mechanism answers**, incomplete-answer and duplicate refusals, authentication/lane/path/authority checks, and tool registration without automatic submission. They do not prove AI judgment. Live semantic acceptance requires an actual AI session interpreting genuine pending tasks and the engine independently validating/committing them. Keep PR #72 and PR #73 unmerged; no gate or First Playable claim follows from this connection.

The sections below describe the original console bridge and its historical evidence. They do not supersede this repair or turn the console into an autonomous referee.

## What it is

`apps/phone` is a small Node HTTP service (`node:http`, no new dependency). It runs the **unchanged** `immortalis-operator` command line (`runCli`) and the **unchanged** human referee console (`runRefereeConsole`) in its own process, with a browser-backed `OperatorTerminal`:

- every prompt the command prints is shown in a chat transcript; the **only** thing that can answer a prompt is a line the signed-in person types and sends;
- the typed challenge phrases are the operator's own (for example `To confirm, type exactly "establish-locality 6af718b395fa"`); a different line is a decline and nothing is written;
- an unanswered prompt expires after 15 minutes as a **decline**, never as a confirmation; **Stop** declines the pending prompt;
- one command runs at a time per lane; the campaign is opened, locked and closed by the command exactly as on a terminal, so reopen and crash recovery are the operator's own.

The repository's existing guards still decide everything that matters: the operator's owner-only files, the referee exchange's host proofs and nonces, and the owners' admission. `apps/phone` is the only code that opens a network socket; the packages' no-network security tests are unchanged and still hold.

## Two lanes, two secrets

| Lane                          | Secret                     | What it can do                                                                                        | What it cannot do                                              |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Player** (`/play`)          | `IMMORTALIS_PLAYER_TOKEN`  | Run the closed command set below, paste the author's setting documents, type the confirmations.       | Reach any referee call, read a referee task, submit a reading. |
| **Referee / GM** (`/referee`) | `IMMORTALIS_REFEREE_TOKEN` | Open the bound referee console for one configured host, read that host's tasks, type its own reading. | Run any player command or confirm anything for the player.     |

The two secrets must differ (the service refuses to start otherwise). A reading copied from BLUE or anyone else reaches the engine **only** if the referee-lane person types it into the referee page; a GitHub or chat message is not authentication.

**Closed player command set** (built from the configured campaign; the phone cannot name a campaign, directory, role, permission or "confirmed" flag): `establish-locality`, `locality-status`, `referee-bind-host`, `referee-bind-collection-host`, `author-character`, `establish-character-locus`, `character-status`, `initialize-time`, `clarify-collection-cycle`, `prepare-collection`, `declare-closed-setting`, `attest-cycle`, `collect`, `collect-continue`, `collect-finish`, `cease`, `settle-collection-lapse`, `observe-surroundings`, `reconcile`, `status`. A pasted setting document (JSON, at most 64 KB) is written to a fresh `0600` file in a `0700` directory the server names, passed as `--setup`, and removed afterwards. There is no shell, no free-text command and no file path from the phone.

> **Ordinary-chat play.** The phone console is development and recovery instrumentation. The intended player interface is an ordinary chat host linked through the remote MCP/OAuth adapter in [`chat-adapter.md`](chat-adapter.md) (off unless `IMMORTALIS_PUBLIC_URL` is set).

## Authentication and transport

- **Sign-in:** the page posts the lane's secret once; the server compares SHA-256 digests in constant time, then issues a random 256-bit session id in an `HttpOnly; SameSite=Strict` cookie (`Secure` behind the proxy) and a separate per-session request token. Sessions are in memory, idle out after 30 minutes **of human inactivity** and end after 8 hours (the page's automatic polling does not count as activity; a person's own page load, command, reply or stop does, and the limits are checked on every request, polls included); **signing in again ends that lane's earlier session**. A restart signs everyone out; campaign state is durable and is not affected.
- **Every POST** needs the session's request token, `application/json` and (when the browser sends one) a same-origin `Origin`.
- **Brute force:** five wrong secrets lock that address for 15 minutes. A global cap refuses bad credentials for a while; it cannot exclude an unrelated address presenting a valid lane secret, for either page sign-in or OAuth consent. Valid credentials do not clear the global failure budget. A wrong role, wrong lane secret and wrong secret are one identical refusal.
- **TLS** ends at the platform edge (Railway or any reverse proxy). In the default `proxy` transport the service answers **421** to anything that does not carry `x-forwarded-proto: https` (only `/healthz` is exempt for the platform's probe), and it sets the `Secure` cookie flag. Plain HTTP is accepted **only** with `IMMORTALIS_TRANSPORT=insecure-loopback` on a loopback address, for local development.
- **Headers:** `no-store`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a CSP that allows only the page's own nonce-protected script. Server text is only ever inserted into the page as text.
- **Secrets** are read once from the environment, never logged, never placed in a URL, never echoed and never written to the repository, a comment or Notion. There are **no defaults**: a missing, short (<32), spaced or shared secret makes the service refuse to start.

**Honest limits:** both lanes run in one process with both secrets in one environment, so whoever administers the service can act as either lane. Stronger separation (two services, each holding one secret) is possible and is not built. The rate limiter and sessions are in memory (one replica only). This is not a login system for the game: it admits a person to an out-of-character test instrument.

## How the Sovereign enters by phone

1. A deployed instance's HTTPS URL is opened in the phone's browser (Chrome on Android). No install, terminal, repository or IDE is needed.
2. Choose **Player**, type the player secret, **Sign in**.
3. Under **Choose a command**: pick `establish-locality`, paste (or write) the setting document; the **Show format example** button fills a format guide that is never sent until you edit and press **Run**. Press **Run**.
4. The command's prompt appears as a chat bubble. To confirm, **type the exact phrase it shows** in the reply box and press **Send**. Anything else declines.
5. Continue with the sequence in [`pc-collection-play.md`](pc-collection-play.md): `referee-bind-host`, `author-character`, `establish-character-locus`, `initialize-time`, (only if your accepted character states no duration for one handling cycle: `clarify-collection-cycle`, below) `prepare-collection`, `declare-closed-setting`, `referee-bind-collection-host`, `attest-cycle`, `collect`, `collect-continue`, `collect-finish`, `observe-surroundings`, then close and reopen (sign out, sign in, `status`) and make a second, different `collect`.
6. The game master opens `/referee` (their own phone or browser), signs in with the **referee** secret, picks the bound host, **Open console**, then types `list`, a task id, and their own reading as one JSON object.

## Deploying (NOT done by this change)

Nothing is deployed or billable from this repository. **Do not overwrite the unrelated `immortalis-ob027-eval` Railway project**: create a **new, separate project and service**.

1. New Railway project → deploy from this repository's branch with **config file path `apps/phone/railway.json`** (Dockerfile `apps/phone/Dockerfile`, build context = repository root; health check `/healthz`; one replica).
2. Attach **one persistent Volume** mounted at `/data` (campaign and retained intents live there; use disposable ORIGINAL-world data only).
3. Set variables (generate each secret as 40+ random characters in a password manager; never reuse one for both lanes):

   | Variable                      | Value                                                                                                                                                                       |
   | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `IMMORTALIS_PLAYER_TOKEN`     | the player secret                                                                                                                                                           |
   | `IMMORTALIS_REFEREE_TOKEN`    | a different referee secret                                                                                                                                                  |
   | `IMMORTALIS_CAMPAIGN_ID`      | the playtest campaign identity (for example `campaign-first-play`)                                                                                                          |
   | `IMMORTALIS_REFEREE_HOST_IDS` | the host identities the GM will use, comma separated, at most 8 (for example `gm-setup,gm-collection`); bind each with `referee-bind-host` / `referee-bind-collection-host` |
   | `IMMORTALIS_DATA_DIR`         | `/data` (default)                                                                                                                                                           |

   `PORT` is supplied by the platform; `IMMORTALIS_TRANSPORT` defaults to `proxy`.

4. Generate the public domain only after the secrets are set and checked. **Cost caveat:** Railway bills a running service and a volume by usage on the workspace's plan; this change does not verify the plan, credits or price, and launching it is a billing decision for the account owner. Remove the service and volume when the playtest ends.
5. Never expose an instance with default, short, shared or example secrets: the service will not start with them.

Local trial (no deployment): `IMMORTALIS_TRANSPORT=insecure-loopback IMMORTALIS_CAMPAIGN_DIR=… IMMORTALIS_CAMPAIGN_ID=… IMMORTALIS_OPERATOR_DIR=… IMMORTALIS_PLAYER_TOKEN=… IMMORTALIS_REFEREE_TOKEN=… IMMORTALIS_REFEREE_HOST_IDS=gm-setup pnpm phone`.

## Clarifying the handling cycle from the phone (R-5, when the accepted character states no duration)

Only when `prepare-collection` cannot quote any accepted claim for the exact cycle, and **before any `collect`**:

1. Player lane → **Choose a command** → `clarify-collection-cycle`. Fill **player-character** (the id your character was authored under); **referee-wait** is optional (seconds to wait for the referee host, default 600). Press **Run**.
2. The chat shows the engine's fixed question and asks for **your character's own account**. Type it in your own words in the reply box with **the number in digits and the unit of time the campaign uses** (for example "It takes me 12 second to lift and carry one lump"), then **Send**. Nothing is suggested to you and nothing is chosen for you; an empty reply stops.
3. The referee host (a real GM, or the bound AI host, on the referee lane/tools) classifies exactly those words. The referee host is shown what your character already has and the one open question, and must read your words as only how long ONE handling cycle of the hands your character already has takes; words that also add a limb, a power or a reach are not accepted. If it does not accept them, the chat says why (including its branch and scope readings) and **nothing is written**; change your words and run the command again.
4. If it accepts them, the chat shows its findings and asks for a **separate typed confirmation**: type the exact `accept-clarification …` phrase it shows. Anything else declines.
5. The chat then reports `CLARIFICATION_ACCEPTED` with the clarification id and claim 0, and the exact line to add to the preparation document's `mechanism`: `"clarified": [{"clarification_id": "<id>", "index": 0}]`, with a `cycle_quote` that is a verbatim part of claim 0 stating the number and unit, and a `cycle_duration` equal to what those words state. Then continue with `prepare-collection` and `attest-cycle`.

The phone cannot supply the words in the request (they are typed at the prompt), cannot choose a rate for you, cannot confirm for you, and cannot clarify after your first `collect` commitment. The question can be closed once: different words after an accepted clarification are refused. A restart ends the signed-in session and the local prompt, but does not establish whether any accepted choice committed. The pending-operation barrier survives. Clarification has no supported automatic readback: do not re-run it on the strength of a restart; the operator must inspect the original retained records. Only `initialize-time` and `prepare-collection` have document-derived setup readback, and partial setup remains blocked. See [the supported recovery boundary](chat-adapter.md).

## Operator preflight (24 October repair): name every configuration defect before a long setup

A misconfigured chat route used to show only as a cause-free refusal in the middle of play: a missing or malformed scenario file, a campaign that did not match it, an unbound referee host or an unset player-view host all looked the same, and an unset view host looked exactly like a genuine non-receipt. The operator now has a read-only preflight, run with the service's own environment and **never reachable by the player or the assistant** (it is not a player command, not a chat tool, and no module of the service imports it):

```
node --experimental-strip-types apps/phone/src/main.ts preflight [--phase A|B|all] [--verbatim] [--probe]
```

Exit `0` all clear, `1` a defect, `3` the campaign was busy (a check that could not be made is never a pass), `64` usage. It prints no secret and writes nothing to the campaign.

- **Phase A (no campaign opened):** the operator and campaign directories; the ordinary-chat route on or off; the scenario file named defect by defect (missing, a link, not JSON, not an object, a missing key, a key that is not offered, a value the engine would refuse, a file writable by its group or others or not owned by the service user, oversized); an unset `IMMORTALIS_PLAYER_VIEW_HOST_ID`, with the reason it matters; with `--probe`, that an unauthenticated call to `<public origin>/mcp` is answered `401` (`421` means the origin and the host disagree). Phase A also runs at boot when the route is on; its findings go to the service log and never stop the service.
- **Phase B (the campaign opened read-only under its writer lock):** each of the seven scenario identities against canon, by name (the character's existence contract, active binding and physical-locus custody; the world profile; the Source Condition and its unit; the Reserve's world, locus and unit; the extraction basis's world, source and unit; the mechanism and its attested cycle); every listed referee host bound and the listed hosts covering the observation and both collection readings (`B14`); the player-view host bound to the scenario character with a private secret file that matches its binding (`B16`, `B17`); and a **dry run of what the observation question would deliver**: its basis, the number and kind of statements, the placement statement's length, the world fact ids, the fact that a reading is already retained for that exact question (never what it says) and what the evaluator requires. `--verbatim` prints the statements themselves, at the operator's own console only.
- **The running service** also tells the operator, in its log and once per distinct line, the cause of a refusal it must keep cause-free for the player and the assistant (a defective scenario file; an unset or unusable player-view host).
- **Identities** (`IMMORTALIS_REFEREE_HOST_IDS`, `IMMORTALIS_PLAYER_VIEW_HOST_ID`) must now be ones the exchanges accept (a letter or digit first; letters, digits, `.`, `_`, `-`; at most 64): a looser one used to bind nowhere and leave every read refused, and the service now refuses to start with it.

What it does **not** do: it does not write or repair anything, does not decide whether the character's words establish a sense or whether the scene's prose states a light, air or path (that is the referee's reading of the delivered words), and does not make a saved campaign able to gain a premise it cannot already hold (see `docs/active-pc-direct-observation-foundation.md`). Tests: `tests/integration/phone-preflight.test.ts` (mechanism; each check mutation-checked).

## What is verified, and what a real human must still do

- **Verified (MECHANISM tests, `tests/integration/phone-bridge.test.ts`):** fail-closed configuration; the closed command set builds its argument vector from the configuration; a reply is accepted once for the current prompt and an unanswered or stopped prompt is a decline; sign-in, lockout, one session per lane, lane separation, request token, JSON-only, same-origin, logout; proxy mode refuses non-HTTPS and sets a `Secure` cookie; the SHIPPED `establish-locality` runs behind the front end and creates the campaign **only** when the exact challenge phrase is typed (a different line declines and writes nothing, and the pasted file is removed); the SHIPPED referee console opens for a really bound host; no process execution, dynamic code, provider reference or environment read outside `main.ts`. A script typed those replies.
- **Verified after BLUE's PR #73 review (P-1, P-2):** the transcript's sequence numbers restart with every run, so the server issues a unique id for each run and the page sends it with its cursor — a cursor belonging to an earlier run is discarded and the new run is replayed from its first line, for successive player commands and successive referee sessions on one signed-in session (the page's own script, run against the real server). An idle lane, or a finished run with nothing new, holds a poll open (20 s) until a new run starts instead of answering at once, and the page backs off (1, 2, 4, 8, then 10 s while idle; answers new output at once; at most 2 s while a run is live): over ten virtual minutes of an idle lane the page made about 65 requests, asserted at 70 or fewer. Polling no longer refreshes the inactivity clock: with a poll every minute the session still ends 30 minutes after the person's last action.
- **Verified after the first live session (long referee task):** a say, ask or typed reply longer than one transcript line (8192 characters) is no longer cut. It is carried as consecutive, ordered lines (each but the last marked `more`, never split inside a character) and the page shows them as one continuous text, so a complete referee task — every candidate item, its exact identifier and its quoted evidence — reaches the GM's phone. Only a single text beyond 1 MiB is shortened, and then a visible line says how many characters were not shown. The prompt shown above the reply box and the 16 kB reply limit are unchanged, and the GM's text is still readable only through the referee lane.
- **Not verified:** that any person used it; a real transcript; the deployed service (no deployment was made); TLS (the platform's); Android browser behaviour beyond standard responsive HTML.
- **A real human must:** deploy and set the secrets; type every setting document and confirmation; play the real sequence above with a separately authenticated game master; and record the genuine task/answer/transcript (credentials withheld) for BLUE's acceptance. Until then R-5 is open.
