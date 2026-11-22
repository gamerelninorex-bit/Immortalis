import { createHash } from "node:crypto";
import {
  BUILD_SPEC_IDENTITY,
  GM_ADJUDICATION_AUTHORITY,
  canonicalJson,
  fail,
  ok,
  type Result,
} from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import { authorizeGmWaitHost, GM_WAIT_OPERATION } from "./gm-wait-exchange.ts";
import { verifyLocalOperator } from "./local-operator.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";

/**
 * F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the trusted side of the authenticated GM waiting INGRESS. MECHANISM ONLY and
 * NON-WRITING.
 *
 * From a configured, operator-enrolled GM waiting host that has submitted one candidate GM waiting request, to either a clearly
 * NONCANONICAL readiness verdict (the strictly validated B0 request, with the source identities it was verified against) or a refusal.
 * It writes nothing: no canonical fact, receipt, journal entry, Temporal open or protected marker, no elapsed-time credit, no new player
 * decision, no retained cache and no second copy of any identity. It does not advance, decide, announce or perceive anything, it
 * qualifies no catalogue digest, observed basis, continuation link or transaction identity (those belong to the later owner admission),
 * and its result is not a receipt that anything was accepted.
 *
 * The host supplies no campaign, no character, no role, no permission, no source policy and no transport identity. Everything below is
 * selected and proved by the trusted side, afresh on EVERY call (nothing is cached or kept open between calls):
 *
 *   1. the invoking operating-system user owns the campaign package and the owner-only retained-state directory
 *      (`verifyLocalOperator`, the boundary the package already rests on);
 *   2. the host is one the operator enrolled for THIS campaign's GM waiting operation, holding its own secret (a referee host, `gm-scene`,
 *      a player-view, observation, time-advance or freight credential, a host name or a model name opens nothing here);
 *   3. the campaign opens through the engine's owner-verified re-open under its single-writer lock, is the campaign the host was enrolled
 *      for, has no uncommitted residue, and the enrolled character, the operator's retained keep and the canonical active-PC binding are
 *      ONE character (`openAuthorizedPlayerView`, the same proofs every read makes): a stale or replaced character, an unestablished
 *      owner setup or binding, another campaign or a writer already active fail closed;
 *   4. the authority is the EXISTING `role.gm` / `permission.rule.adjudicate` pair, stated here by the trusted code and never read from
 *      the request: a request that names a context, a role, a permission, a campaign, a character, a host or a transport identity of its
 *      own is an over-claim and is refused, never silently overwritten;
 *   5. the enrollment is read a second time after every proof, and a change between the two reads is a refusal (no authorization carries
 *      across a change of the operator's mind);
 *   6. only then is the candidate parsed, UNCHANGED, by the strict B0 request contract. The original human message is neither required
 *      nor claimed: the GM is trusted to interpret an ordinary wait, and this verdict is not an attestation of any player's words, of any
 *      setup input or of any player choice.
 *
 * A failure of 1 to 5 is the one opaque `GM_WAIT_UNAVAILABLE` refusal, byte for byte, so a caller cannot tell an unenrolled host from a
 * wrong secret, another campaign, a replaced character, an active writer or a changed enrollment. Only once the caller has been proved
 * the enrolled GM is a malformed or over-claiming REQUEST refused with the specific reason, so that the GM can correct it.
 */

export const GM_WAIT_UNAVAILABLE = "GM_WAIT_UNAVAILABLE";
export const GM_WAIT_UNAVAILABLE_MESSAGE = "no GM waiting readiness can be established";
export const GM_WAIT_REQUEST_REFUSED = "GM_WAIT_REQUEST_REFUSED";

/** Members the host may not name: each is selected and proved by the trusted side, so naming one is an over-claim. */
const OVERCLAIM_KEYS: readonly string[] = [
  "context",
  "role",
  "permission",
  "authority",
  "campaign",
  "campaign_id",
  "pc",
  "pc_id",
  "character",
  "host",
  "host_id",
  "client",
  "grant",
  "session",
  "scopes",
  "source",
  "source_policy",
  "original_message",
  "original_text",
  "setup_input",
  "attestation",
];

/** A ceiling on the canonical text of one candidate request (a strict B0 request is far smaller). */
const MAX_REQUEST_BYTES = 8 * 1024;

/**
 * The transport identity of THIS call: the verified client, the authorization grant, the MCP session and the request identity, taken by
 * the Phone's transport and its grant ledger and never from a tool argument. Opaque here: the ledger and the token are the Phone's.
 */
export interface GmWaitTransport {
  readonly client: string;
  readonly grant: string;
  readonly session: string;
  readonly requestId: string;
}

/**
 * The strict B0 request parser, handed in by the trusted caller. The operator package may not import the unexported B0 module, so the
 * phone service, which may, passes `parseGmWaitRequest` UNCHANGED; the ingress then re-checks the parts of its verdict that carry
 * authority (the context pair, the trigger literal and the phase) itself, so a permissive parser cannot widen what is accepted.
 */
export type GmWaitRequestParser = (raw: unknown) =>
  | {
      readonly ok: true;
      readonly value: {
        readonly context: { readonly role: string; readonly permission: string };
        readonly trigger: { readonly kind: string };
        readonly gm_wait: { readonly phase: string };
      } & Readonly<Record<string, unknown>>;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };

export interface GmWaitIngressParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly secret: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

/** What is NOT established by a readiness verdict. Each belongs to the later owner admission; none is claimed here. */
export const GM_WAIT_UNQUALIFIED = [
  "observed_basis_against_the_canonical_clock",
  "catalogue_sha256",
  "continuation_link",
  "transaction_identity",
  "temporal_admission",
  "player_choice",
] as const;

export interface GmWaitReadiness {
  readonly status: "GM_WAIT_REQUEST_READY";
  /** literal: this verdict is not canonical, not a receipt and not an admission */
  readonly canonical: false;
  readonly effects: "NONE";
  /** the strictly validated B0 request, with the one existing GM context pair the trusted side stated */
  readonly request: Readonly<Record<string, unknown>>;
  readonly request_sha256: string;
  readonly source: {
    readonly operation: typeof GM_WAIT_OPERATION;
    readonly role: typeof GM_ADJUDICATION_AUTHORITY.role;
    readonly permission: typeof GM_ADJUDICATION_AUTHORITY.permission;
    readonly campaign_id: string;
    readonly pc_id: string;
    readonly host_id: string;
    /** the operative binding fact the character was proved against */
    readonly binding: { readonly key: string; readonly version: number };
    readonly campaign_spec_lock_sha256: string;
    readonly build_spec_lock_sha256: string;
  };
  /** digest of the transport identity of this call (client, grant, session, request): a reference, not a credential */
  readonly transport_ref_sha256: string;
  readonly unqualified: typeof GM_WAIT_UNQUALIFIED;
  readonly message: string;
}

export type GmWaitRefusalReason =
  "NOT_AN_OBJECT" | "TOO_LARGE" | "OVERCLAIM" | "INVALID_B0_REQUEST";

export type GmWaitIngressResult = Result<
  GmWaitReadiness,
  typeof GM_WAIT_UNAVAILABLE | typeof GM_WAIT_REQUEST_REFUSED
>;

export const GM_WAIT_READY_MESSAGE =
  "This request is well formed and the configured GM, the campaign and the character are verified. Nothing was recorded, advanced, decided or announced: it is not an admission, not a receipt and no time has passed. The player's character has perceived nothing from it.";

const unavailable = (): GmWaitIngressResult =>
  fail(GM_WAIT_UNAVAILABLE, GM_WAIT_UNAVAILABLE_MESSAGE);

const refused = (reason: GmWaitRefusalReason, issues?: readonly string[]): GmWaitIngressResult =>
  fail(GM_WAIT_REQUEST_REFUSED, "the GM waiting request is refused", {
    reason,
    ...(issues && issues.length > 0 ? { issues } : {}),
  });

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const wellFormedTransport = (t: GmWaitTransport): boolean =>
  [t.client, t.grant, t.session, t.requestId].every(
    (v) => typeof v === "string" && v.length > 0 && v.length <= 512,
  );

/** The candidate must be plain, owned data of a bounded size; never an exotic object whose members a getter could change between reads. */
function plainCandidate(
  request: unknown,
): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false } {
  try {
    if (typeof request !== "object" || request === null || Array.isArray(request))
      return { ok: false };
    const text = JSON.stringify(request);
    if (text === undefined) return { ok: false };
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * The one trusted ingress. `request` is the host's untrusted candidate: the strict B0 request WITHOUT its `context` member, which the
 * trusted side states. Writes nothing, whatever it returns.
 */
export async function verifyGmWaitIngress(
  p: GmWaitIngressParams,
  transport: GmWaitTransport,
  request: unknown,
  parseRequest: GmWaitRequestParser,
): Promise<GmWaitIngressResult> {
  try {
    if (!wellFormedTransport(transport)) return unavailable();
    const owner = verifyLocalOperator(p.campaignDir, "campaign");
    if (!owner.ok) return unavailable();
    const exchange = {
      stateDir: p.stateDir,
      campaignId: p.campaignId,
      ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
    };
    const enrolled = await authorizeGmWaitHost(exchange, owner.value.uid, p.hostId, p.secret);
    if (!enrolled.ok || enrolled.value.operation !== GM_WAIT_OPERATION) return unavailable();
    const view = await openAuthorizedPlayerView({
      campaignDir: p.campaignDir,
      campaignId: p.campaignId,
      stateDir: p.stateDir,
      boundPcId: enrolled.value.pc_id,
      ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
      ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
      ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
    });
    if (!view.ok) return unavailable();
    try {
      const { campaign, pcId } = view.value;
      const binding = campaign.binding();
      if (!binding || pcId !== enrolled.value.pc_id) return unavailable();
      // the enrollment is read again after every proof: a change in between is no authorization at all
      const again = await authorizeGmWaitHost(exchange, owner.value.uid, p.hostId, p.secret);
      if (!again.ok || again.value.pc_id !== enrolled.value.pc_id) return unavailable();

      // from here the caller is the proved, enrolled GM: a refusal of the REQUEST may say what is wrong with it
      const plain = plainCandidate(request);
      if (!plain.ok) return refused("NOT_AN_OBJECT");
      if (canonicalJson(plain.value).length > MAX_REQUEST_BYTES) return refused("TOO_LARGE");
      const claimed = Object.keys(plain.value).filter((k) => OVERCLAIM_KEYS.includes(k));
      if (claimed.length > 0) return refused("OVERCLAIM", claimed);
      const candidate = {
        ...plain.value,
        context: {
          role: GM_ADJUDICATION_AUTHORITY.role,
          permission: GM_ADJUDICATION_AUTHORITY.permission,
        },
      };
      const parsed = parseRequest(candidate);
      if (!parsed.ok) {
        const detail = parsed.error.details as { issues?: readonly string[] } | undefined;
        return refused("INVALID_B0_REQUEST", [parsed.error.message, ...(detail?.issues ?? [])]);
      }
      // the authority-bearing parts of the verdict are re-checked here, whatever parser was handed in
      if (
        parsed.value.trigger.kind !== GM_WAIT_OPERATION ||
        parsed.value.context.role !== GM_ADJUDICATION_AUTHORITY.role ||
        parsed.value.context.permission !== GM_ADJUDICATION_AUTHORITY.permission ||
        (parsed.value.gm_wait.phase !== "INITIAL" && parsed.value.gm_wait.phase !== "CONTINUATION")
      )
        return unavailable();

      const head = campaign.store.head();
      const readiness: GmWaitReadiness = {
        status: "GM_WAIT_REQUEST_READY",
        canonical: false,
        effects: "NONE",
        request: parsed.value,
        request_sha256: sha256(canonicalJson(parsed.value)),
        source: {
          operation: GM_WAIT_OPERATION,
          role: GM_ADJUDICATION_AUTHORITY.role,
          permission: GM_ADJUDICATION_AUTHORITY.permission,
          campaign_id: p.campaignId,
          pc_id: pcId,
          host_id: p.hostId,
          binding: { key: binding.fact.key, version: binding.fact.version },
          campaign_spec_lock_sha256: head.spec_identity.spec_lock_sha256,
          build_spec_lock_sha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
        },
        transport_ref_sha256: sha256(
          canonicalJson({
            client: transport.client,
            grant: transport.grant,
            session: transport.session,
            request: transport.requestId,
          }),
        ),
        unqualified: GM_WAIT_UNQUALIFIED,
        message: GM_WAIT_READY_MESSAGE,
      };
      return ok(readiness);
    } finally {
      await view.value.campaign.close().catch(() => undefined);
    }
  } catch {
    return unavailable();
  }
}
