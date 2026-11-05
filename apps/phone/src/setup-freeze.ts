import { activeSessions, scanInitialSetup } from "@immortalis/engine";
import { LocalOperatorSession, type SessionParams } from "@immortalis/operator";
import type { PhoneConfig } from "./config.ts";

/**
 * Has the locality's initial setup released its FREEZE (Initial Locality Bootstrap v0.9, "Admission and Freeze")? The freeze holds from a
 * validated Input until the locality has a Completion or the session has a terminal Disposition; a valid terminal result releases it and
 * approves nothing. Read from the owners through the same owner-verified open every other read uses; `null` when it cannot be established
 * (a held writer lock, an unverifiable package), which callers treat as "do not apply".
 */
export async function setupFreezeReleased(
  config: PhoneConfig,
  options: Pick<SessionParams, "extension" | "campaignFs" | "ledgerFs"> = {},
): Promise<boolean | null> {
  const opened = await LocalOperatorSession.open({
    campaignDir: config.campaignDir,
    expectedCampaignId: config.campaignId,
    operatorDir: config.operatorDir,
    buildId: "immortalis-chat-freeze-read",
    ...(config.operatorLedgerVersion === 2 ? { ledgerVersion: 2 as const } : {}),
    ...options,
  });
  if (!opened.ok) return null;
  const session = opened.value;
  try {
    const facts = new Map(session.campaign.store.listFacts().map((f) => [f.key, f]));
    return activeSessions(scanInitialSetup(facts)).length === 0;
  } finally {
    await session.close();
  }
}
