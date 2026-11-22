import {
  gmWaitSecretPath,
  readGmWaitSecretFile,
} from "../../../packages/operator/src/gm-wait-exchange.ts";
import { GM_WAIT_OPERATION } from "../../../packages/operator/src/gm-wait-exchange.ts";
import {
  GM_WAIT_REQUEST_REFUSED,
  verifyGmWaitIngress as verifyIngress,
} from "../../../packages/operator/src/gm-wait-ingress.ts";
import { parseGmWaitRequest } from "../../../packages/contracts/src/temporal-gm-wait.ts";
import type { McpTool, ToolContext, ToolResult } from "./mcp-http.ts";
import type { PhoneConfig } from "./config.ts";
import type { GrantStatus } from "./oauth-ledger.ts";

/**
 * F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the ONE trusted connected-client ingress through which the configured Game Master
 * submits a waiting request for VERIFICATION. MECHANISM ONLY and NON-WRITING: it advances nothing, records nothing, decides nothing and
 * announces nothing. Its answer is a noncanonical readiness verdict or a refusal, never an admission or a receipt.
 *
 * The tool is registered only when the operator has listed an enrolled GM waiting host (`IMMORTALIS_GM_WAIT_HOST_IDS`); otherwise nothing
 * of it exists and every existing route is byte-for-byte what it was. It is offered to a grant that holds the `referee` transport scope
 * and to no other, but that scope is NOT the Game Master's authority: it only says which transport lane the grant was issued on. The
 * authority is the operator's enrollment of the named host for this operation (never the host's name, never a model-supplied role) and the
 * trusted verification in the operator's ingress, proved afresh on every call.
 *
 * What this transport adds to the ingress, and the only thing it adds, is the current authority of THIS call: the client, the
 * authorization grant and the session were verified by the MCP transport from the bearer token, and the grant is consulted again here
 * in the authoritative revocation ledger BEFORE and AFTER the ingress runs, so a grant revoked or expired while the call was in flight
 * is a refusal and not a verdict. The arguments supply no campaign, no character, no role, no permission and no transport identity.
 */

export const GM_WAIT_TOOL = "gm_wait_readiness";

export interface GmWaitToolDeps {
  readonly config: PhoneConfig;
  readonly now: () => number;
  /** the authoritative OAuth grant ledger's verdict (UNAVAILABLE for a missing or corrupt initialised ledger) */
  readonly oauthStatus: (client: string, grant: string) => GrantStatus;
  /** tests substitute nothing about authority; this only lets them observe the one call and inject faults */
  readonly verify?: (
    p: Parameters<typeof verifyIngress>[0],
    transport: Parameters<typeof verifyIngress>[1],
    request: unknown,
  ) => ReturnType<typeof verifyIngress>;
}

const OPAQUE = "no GM waiting readiness can be established";

const text = (value: string | Record<string, unknown>, isError = false): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});
const opaque = (): ToolResult => text(OPAQUE, true);

const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((k) => allowed.includes(k)) &&
  allowed.every((k) => Object.hasOwn(value, k));

const DESCRIPTION =
  "Submit ONE waiting request for verification, as the configured Game Master. Use it when the player's character waits and YOU have interpreted how long (an ordinary phrase such as 'waits two minutes' is enough: you choose the whole number, the unit second, minute or hour, and whether it was the player's explicit duration or your routine estimate; never ask the player for it). Give the request exactly as the engine's strict GM waiting contract states it, WITHOUT a `context` member: the trusted side states your one existing authority itself, and naming a context, role, permission, campaign, character, host or any original human message is refused. The answer is a verdict that the request is well formed and that you, the campaign and the character verify; it is NOT an admission. Nothing is recorded, no time passes and the character perceives nothing from it, so do not tell the player that time passed or that anything happened because you called it. It never chooses for the player: a new consequential choice of the player's own stays theirs.";

export function buildGmWaitTool(d: GmWaitToolDeps): McpTool {
  // the unchanged strict B0 parser is handed to the operator's ingress: the operator package may not import the unexported B0 module
  const verify = d.verify ?? ((p, t, r) => verifyIngress(p, t, r, parseGmWaitRequest));
  const hostIds = [...(d.config.gmWaitHostIds ?? [])];
  const current = (ctx: ToolContext): boolean =>
    ctx.accessExpiresAtMs !== undefined &&
    ctx.accessExpiresAtMs > d.now() &&
    d.oauthStatus(ctx.client, ctx.grant) === "ISSUED";
  return {
    name: GM_WAIT_TOOL,
    title: "Verify a GM waiting request",
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", enum: hostIds },
        request: {
          type: "object",
          description: `The strict GM waiting request without a \`context\` member: transaction_id, cause, trigger {kind: ${GM_WAIT_OPERATION}, ref}, continues, requested {target, condition: null}, publication {basis, secrecy}, and gm_wait (INITIAL with phase, duration_value, duration_unit, observed_basis, interpretation_mode, conversion_rule_version, catalogue_sha256; or CONTINUATION with phase and from_transaction).`,
        },
      },
      required: ["host_id", "request"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    scope: "referee",
    handler: async (args, ctx) => {
      const req = ctx.request;
      if (
        req === undefined ||
        req.tool !== GM_WAIT_TOOL ||
        !ctx.scopes.includes("referee") ||
        !onlyKeys(args, ["host_id", "request"]) ||
        typeof args["host_id"] !== "string" ||
        !hostIds.includes(args["host_id"]) ||
        !current(ctx)
      )
        return opaque();
      const hostId = args["host_id"];
      const stateDir = d.config.operatorDir;
      const secret = readGmWaitSecretFile(
        gmWaitSecretPath({ stateDir, campaignId: d.config.campaignId }, hostId),
      );
      if (secret === null) return opaque();
      const result = await verify(
        {
          campaignDir: d.config.campaignDir,
          campaignId: d.config.campaignId,
          stateDir,
          hostId,
          secret,
        },
        { client: ctx.client, grant: ctx.grant, session: req.session, requestId: req.id },
        args["request"],
      );
      // the authority of THIS call is consulted again after the work: a grant revoked or expired meanwhile yields no verdict
      if (!current(ctx)) return opaque();
      if (result.ok) return text({ ...result.value });
      if (result.error.code === GM_WAIT_REQUEST_REFUSED)
        return text({ status: result.error.code, ...result.error.details }, true);
      return opaque();
    },
  };
}
