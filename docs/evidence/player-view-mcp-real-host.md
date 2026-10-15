# Local player-view MCP transport — one real configured host call (retained, not acceptance proof)

Reported **separately** from the scripted transport tests, as the BLUE v5.2 bounded brief (native pin `2026-10-15T09:56:12.551Z`) requires. It is a single exercise, run once, by one host, and it is not acceptance, not a semantic validation and not a claim about any model's understanding.

## What was run

- **Host:** the Claude Code CLI (2.1.300) in non-interactive print mode (run against the transport as repaired for the BLUE H-1 admission and lifecycle hold, so the real client's own `initialize` / `notifications/initialized` satisfy the strict lifecycle), started with `--mcp-config` (one stdio server, `--strict-mcp-config`) and told to call the single tool once with no arguments and reply with the returned text. The host used the credentials already present in the session that ran it; this slice adds, holds and reads no provider credential, API key or paid service.
- **Campaign:** built only by the shipped commands (`establish-locality` → `author-character` → `establish-character-locus` → Temporal establishment → `observe-surroundings`), exactly as the integration tests build theirs. The referee host that qualified the observation there is the **scripted, plumbing-only** policy the tests use (it reads the delivered words by rule and certifies nothing about any AI). The observation producer's semantic support remains the retained exercise in [`b52-direct-observation-live-host.md`](b52-direct-observation-live-host.md), neither repeated nor extended here.
- **Binding:** the shipped `immortalis-player-view-bind` binary bound the host identity `claude-code-host` (the character was not named: it is proved against canon). The server was `immortalis-player-view` with the five flags that action prints.

## What it shows

Curated from the two sessions' stream-json output (the raw traces carry local paths and session metadata and are not retained): [`player-view-mcp-real-host/host-calls.json`](player-view-mcp-real-host/host-calls.json).

1. **Bound host, one call.** The host reported the server `connected`, exposing exactly one tool of this server (`read_current_observation_glance`). It called it with `{}`; the tool result was the existing presentation, unchanged — contact `PERCEPTION`, referent "a patch on the wall facing the character", content "a broad patch of bright red on pale plaster", viewpoint `role.player_character` — and the host relayed it verbatim.
2. **Unbound host identity, one call.** The same campaign with a host identity the operator never bound: the tool result carried the MCP error flag and exactly `{"ok":false,"error":{"code":"PROJECTION_UNAVAILABLE","message":"no projection is available"}}`, which the host relayed. Nothing distinguishes it from a campaign that never earned an observation.

## What it does not show

That the host model understood, interpreted or correctly relayed the scene beyond echoing the returned text; that any natural play loop exists (no look intent, confirmation, action, duration, actor or movement exists); that the OS-owner binding identifies a person or a remote account; or that any other MCP client behaves the same. It demonstrates only that a real, locally configured MCP client can start the server, list its one tool and call it, and that the unbound case is refused.
