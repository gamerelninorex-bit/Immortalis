// F-014B A1-2a (the authenticated configured-GM waiting ingress; MECHANISM ONLY, NON-WRITING; BLUE v6.2 pinned brief, 22 Nov 2026): the paths this
// slice adds or changes, as a declared table. The older "nothing else changed" suites extend their allow-lists from `A1_2A_PACKAGE_PATHS`, and
// tests/conformance/a1-2a-scope-conformance.test.ts polices the table itself (every declared path exists; no other path under apps/ or packages/
// changed; nothing the brief forbids moved).
//
// A later change to a file below updates this table and nothing else.
export const A1_2A_BASE_COMMIT = "024b109ea7dad5c8428c77d627f36763a3d41829";

/** Production files this slice ADDS (each is absent from the base commit). */
export const A1_2A_NEW_PRODUCTION_PATHS: readonly string[] = [
  "apps/phone/src/gm-wait-tool.ts",
  "packages/operator/src/gm-wait-bind-bin.ts",
  "packages/operator/src/gm-wait-cli.ts",
  "packages/operator/src/gm-wait-exchange.ts",
  "packages/operator/src/gm-wait-ingress.ts",
];

/**
 * Existing files this slice CHANGES, each by an additive edit only: the optional configuration member and its parsing, the one optional
 * registration of the new tool beside the existing chat tools (a no-op unless a GM waiting host is listed). `chat-tools.ts` is NOT changed: the older A1-1 suite pins it byte-identical. The operator package manifest
 * is NOT changed: the bind action is a script, not a new bin entry.
 */
export const A1_2A_CHANGED_PRODUCTION_PATHS: readonly string[] = [
  "apps/phone/src/config.ts",
  "apps/phone/src/server.ts",
];

/** Every path under apps/ or packages/ this slice changes or adds. */
export const A1_2A_PACKAGE_PATHS: readonly string[] = [
  ...A1_2A_NEW_PRODUCTION_PATHS,
  ...A1_2A_CHANGED_PRODUCTION_PATHS,
];

/** Evidence written by this slice: any file under this prefix is declared. */
export const A1_2A_EVIDENCE_PREFIX = "docs/evidence/f014b-a1-2a/";

/**
 * The production files that may import the unexported B0 request module (`packages/contracts/src/temporal-gm-wait.ts`) besides its own
 * declaration. Declared supersession of the older "used by no production file" pins, for this slice only: the ingress parses the strict B0
 * request, and the enrollment names the one operation by its source-verbatim literal.
 */
export const A1_2A_B0_PRODUCTION_USERS: Readonly<Record<string, string>> = {
  "apps/phone/src/gm-wait-tool.ts":
    "hands the unchanged strict B0 request parser to the operator's ingress (the operator package may not import the unexported B0 module)",
};

/**
 * The one NEW production file that spells the B0 trigger literal, as a local copy pinned equal to the B0 constant by the A1-2a conformance suite
 * (the operator package may not import the unexported B0 module; the engine's S1 guard keeps the same kind of pinned copy).
 */
export const A1_2A_LITERAL_FILES: Readonly<Record<string, string>> = {
  "packages/operator/src/gm-wait-exchange.ts":
    "A1-2a: the one operation an enrolled host is enrolled for; a local copy pinned equal to the B0 constant",
};

/** Paths the brief forbids this slice to touch: each is byte-identical to the base commit (the changed set is checked as a whole as well). */
export const A1_2A_UNTOUCHED: readonly string[] = [
  "packages/contracts",
  "packages/engine",
  "packages/protocol",
  "packages/testkit",
  "packages/operator/src/referee-exchange.ts",
  "packages/operator/src/referee-mcp.ts",
  "packages/operator/src/request-host-binding.ts",
  "packages/operator/src/player-view.ts",
  "packages/operator/src/player-view-exchange.ts",
  "packages/operator/src/observe-request-exchange.ts",
  "packages/operator/src/advance-request-exchange.ts",
  "packages/operator/src/gm-freight-exchange.ts",
  "packages/operator/src/index.ts",
  "apps/phone/src/mcp-http.ts",
  "apps/phone/src/oauth.ts",
  "apps/phone/src/oauth-ledger.ts",
  "apps/phone/src/referee-tools.ts",
  "apps/phone/src/referee-startup.ts",
  "spec",
  "migrations",
  "releases",
  ".github",
];
