import { randomUUID } from "node:crypto";
import { fail, ok, type Result } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  type FileCampaignOptions,
  type FsOps,
  type StageOwnerExtension,
} from "@immortalis/engine";
import { IntentLedger, type LedgerErrorCode } from "./ledger.ts";
import {
  ensureOperatorStateDirectory,
  verifyLocalOperator,
  type LocalOperator,
  type OperatorRefusalCode,
} from "./local-operator.ts";

export type SessionErrorCode =
  "OPERATOR_UNVERIFIED" | "CAMPAIGN_UNAVAILABLE" | "CAMPAIGN_MISMATCH" | "STATE_UNAVAILABLE";

export interface SessionParams {
  /** the campaign package directory the operator chose */
  readonly campaignDir: string;
  /** the campaign identity the operator believes this directory holds; any other identity is refused (no substitution) */
  readonly expectedCampaignId?: string;
  /** the owner-only directory for retained intents (default: `<campaignDir>.operator`, outside the package) */
  readonly operatorDir?: string;
  /** owner/facet registrations the saved campaign was written with, exactly as the engine's own open requires */
  readonly extension?: StageOwnerExtension;
  /** take over a LOCK whose holder process is provably dead (an explicit operator decision after a crash) */
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

export const defaultOperatorDir = (campaignDir: string): string =>
  `${campaignDir.replace(/[\\/]+$/, "")}.operator`;

/**
 * One local operator's session over ONE campaign: service-side state that exists only between a successful `open` and `close`.
 *
 * `open` verifies the local operator for the chosen campaign directory, takes the package's own single-writer lock and
 * re-verifies the whole package (journal replay, canonical integrity) through the engine's owner-verified re-open, checks the
 * campaign identity against the one the operator named, and loads that campaign's retained intents. Nothing survives a close:
 * every trusted context the commands bind afterwards is built afresh from this session's current campaign, so a handle from an
 * earlier session is bound to an earlier, closed campaign and cannot act on a reopened one.
 *
 * A session becomes `ambiguous` the moment any write has an unknown outcome; it then refuses every further command until it is
 * closed and the campaign reopened, which is how the unknown outcome is reconciled (by the original identity).
 */
export class LocalOperatorSession {
  readonly sessionId: string;
  readonly campaignId: string;
  readonly operator: LocalOperator;
  readonly ledger: IntentLedger;
  readonly #campaign: CanonicalCampaign;
  #open = true;
  #ambiguous = false;

  private constructor(
    campaign: CanonicalCampaign,
    operator: LocalOperator,
    ledger: IntentLedger,
    campaignId: string,
  ) {
    this.sessionId = randomUUID();
    this.campaignId = campaignId;
    this.operator = operator;
    this.ledger = ledger;
    this.#campaign = campaign;
  }

  static async open(
    params: SessionParams,
  ): Promise<Result<LocalOperatorSession, SessionErrorCode>> {
    const operator = verifyLocalOperator(params.campaignDir, "campaign");
    if (!operator.ok) return unverified(operator.error.code);
    const stateDir = params.operatorDir ?? defaultOperatorDir(params.campaignDir);
    try {
      ensureOperatorStateDirectory(stateDir);
    } catch {
      return fail("STATE_UNAVAILABLE", "the retained-intent directory cannot be prepared");
    }
    const stateOperator = verifyLocalOperator(stateDir, "operator-state");
    if (!stateOperator.ok || stateOperator.value.uid !== operator.value.uid)
      return unverified(stateOperator.ok ? "FOREIGN_OWNER" : stateOperator.error.code);

    const options: Pick<FileCampaignOptions, "buildId" | "fs" | "reclaimStaleLock"> & {
      extension?: StageOwnerExtension;
    } = {
      buildId: params.buildId ?? "immortalis-operator",
      ...(params.campaignFs ? { fs: params.campaignFs } : {}),
      ...(params.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
      ...(params.extension ? { extension: params.extension } : {}),
    };
    const opened = await CanonicalCampaign.open(params.campaignDir, options);
    if (!opened.ok)
      return fail("CAMPAIGN_UNAVAILABLE", "the campaign cannot be opened", {
        code: opened.error.code,
      });
    const campaign = opened.value;
    const campaignId = campaign.store.head().campaign_id;
    if (params.expectedCampaignId !== undefined && params.expectedCampaignId !== campaignId) {
      await campaign.close();
      return fail("CAMPAIGN_MISMATCH", "this is not the campaign the operator named");
    }
    const ledger = await IntentLedger.open({
      dir: stateDir,
      campaignId,
      operatorUid: operator.value.uid,
      ...(params.ledgerFs ? { fs: params.ledgerFs } : {}),
    });
    if (!ledger.ok) {
      await campaign.close();
      return fail("STATE_UNAVAILABLE", "the retained intents cannot be used", {
        code: ledger.error.code satisfies LedgerErrorCode,
      });
    }
    return ok(new LocalOperatorSession(campaign, operator.value, ledger.value, campaignId));
  }

  get isOpen(): boolean {
    return this.#open;
  }

  /** True once any write had an unknown outcome: only close-and-reopen reconciles it. */
  get isAmbiguous(): boolean {
    return this.#ambiguous;
  }

  markAmbiguous(): void {
    this.#ambiguous = true;
  }

  /** The open campaign (diagnostics and the commands in this package). Throws once the session is closed: no stale access. */
  get campaign(): CanonicalCampaign {
    if (!this.#open) throw new Error("the session is closed");
    return this.#campaign;
  }

  async close(): Promise<void> {
    if (!this.#open) return;
    this.#open = false;
    await this.#campaign.close();
  }
}

const unverified = (code: OperatorRefusalCode) =>
  fail("OPERATOR_UNVERIFIED", "the local operator is not verified for this campaign", { code });
