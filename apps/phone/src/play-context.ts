import {
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
  type OwnerFact,
} from "@immortalis/contracts";
import type { ReadCurrentObservationGlanceResult } from "@immortalis/protocol";
import {
  playerViewSecretPath,
  readPlayerViewSecretFile,
} from "../../../packages/operator/src/player-view-exchange.ts";
import { playerViewRequestOf } from "../../../packages/operator/src/player-view-mcp.ts";
import { readPlayerViewGlanceOnOpen } from "../../../packages/operator/src/player-view.ts";
import { characterStateOf, openCharacterCampaign, readbackOf } from "./character-evidence.ts";
import type { CharacterReadback } from "./character-evidence.ts";
import type { PhoneConfig } from "./config.ts";
import { readLocality, type LocalityReadback } from "./locality-evidence.ts";
import { playOf, playUnavailable, type PlayRead } from "./play-evidence.ts";

/**
 * The PLAYER-SAFE SUPPORTED-PLAY BRIEFING: one compact, transient, read-only composition of disclosures that already exist, so a Game Master
 * that resumes (or has just seen a material operation finish) does not have to read the setting, the character, the play state and the
 * earned Glance one after another. It is NOT a new owner, a new fact, a cache, a summary or a second save; it is recomputed from the
 * owners on every call and nothing in it is kept. It creates no perception: the current observation is exactly what the UNCHANGED
 * Glance gateway allows now, or its unchanged opaque refusal, and nothing here infers an eye, a facing, a posture or a verdict.
 *
 * What it carries, and what each part is:
 *
 *   authored starting context   the immutable ORIGINAL-setting readback and the kept Character Mirror with its accepted presence statement.
 *                               Authored information. The setting's `established` quantity is the authored starting quantity, never the
 *                               current source remainder; neither part is a current sensory, Health or rights clearance.
 *   out of character            the owner-grounded play state (phase, committed requested quantity, canonical time, applicable safe next
 *                               step). Engine information for the Game Master: not automatically known to the character.
 *   character awareness         the current earned observation presentation, byte for byte, or its unchanged opaque refusal.
 *
 * ONE composition per call, from ONE owner-verified open of the campaign (`openCharacterCampaign`: operator, retained setup identity,
 * retained KEEP and the package's own journal replay and canonical verification). The readers share one fact listing; the complete
 * open verification's exact inputs are freshly re-authenticated at each proof use, rather than repeating its owner derivations.
 * The existing readers (`readLocality`, `characterStateOf`, `playOf`) judge exactly as they always did, handed the
 * facts they would have listed themselves. The Glance runs through `readPlayerViewGlanceOnOpen`: the authentication, host binding, KEEP,
 * canonical-binding, residue, integrity, release and binding proofs of the standalone player-view read, then the unchanged gateway with
 * its fixed read trace. A player-view authorization the operator never made is that component's refusal; this read binds nothing.
 *
 * The result is a point-in-time read and a lease for nothing: every later write is revalidated by its own owner.
 */

/** What is said, once, about every briefing. */
export const SCOPE_NOTICE =
  "This briefing is limited to the information it carries. The setting and character are authored starting context (the setting's established quantity is not what remains now) and clear no sense, health condition or right. Play state and time are for the Game Master, not automatically known to the character; only current_observation is what it has perceived. It does not establish any constraint, permission or fact it does not state, and grants no action authority.";

/**
 * QUALIFIED: the ORIGINAL setting and the active PC are established and verified, so the briefing is a supported-play briefing. It says
 * nothing about whether any action is prepared or permitted (setup readiness is `collection_setup_status`'s, and an owner decides every
 * action). NOT_QUALIFIED: the campaign is readable but is not (yet) at that point. BLOCKED: an owner-verified part is present but cannot be
 * reconciled (an operator must inspect it). UNAVAILABLE: it cannot be read now.
 */
export type ContextStatus = "QUALIFIED" | "NOT_QUALIFIED" | "BLOCKED" | "UNAVAILABLE";

export type SettingPart =
  | { readonly state: "ESTABLISHED"; readonly readback: LocalityReadback }
  | { readonly state: "NOT_ESTABLISHED" | "BLOCKED" | "UNAVAILABLE" };

export type CharacterPart =
  | { readonly state: "BOUND"; readonly readback: CharacterReadback }
  | { readonly state: "NOT_BOUND" | "BLOCKED" | "UNAVAILABLE" };

/** One composition: the parts as the existing readers judged them, from one open. */
export interface PlayContextRead {
  readonly status: ContextStatus;
  readonly setting: SettingPart;
  readonly character: CharacterPart;
  readonly play: PlayRead;
  /** the unchanged Glance gateway result, or its unchanged refusal */
  readonly observation: ReadCurrentObservationGlanceResult;
}

const refusal = (): ReadCurrentObservationGlanceResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/** The whole briefing could not be read now (the server is closing, a goal holds the owners, the package is not readable). */
export function unavailableContext(
  play: Extract<PlayRead, { readonly kind: "UNAVAILABLE" }> = playUnavailable(false),
): PlayContextRead {
  return {
    status: "UNAVAILABLE",
    setting: { state: "UNAVAILABLE" },
    character: { state: "UNAVAILABLE" },
    play,
    observation: refusal(),
  };
}

const blockedContext = (): PlayContextRead => ({
  status: "BLOCKED",
  setting: { state: "BLOCKED" },
  character: { state: "BLOCKED" },
  play: playUnavailable(false),
  observation: refusal(),
});

const notYetContext = (): PlayContextRead => ({
  status: "NOT_QUALIFIED",
  setting: { state: "NOT_ESTABLISHED" },
  character: { state: "NOT_BOUND" },
  play: playUnavailable(true),
  observation: refusal(),
});

/** The Glance for a campaign whose setting and character are both qualified, on the open the briefing already holds. */
async function observationOf(
  config: PhoneConfig,
  held: Parameters<typeof readPlayerViewGlanceOnOpen>[0],
  stateDir: string,
  note: ((message: string) => void) | undefined,
): Promise<ReadCurrentObservationGlanceResult> {
  const host = config.playerViewHostId;
  if (host === null) {
    note?.(
      "IMMORTALIS_PLAYER_VIEW_HOST_ID is not set: the briefing's current observation is disabled and is always the opaque refusal",
    );
    return refusal();
  }
  const secret = readPlayerViewSecretFile(
    playerViewSecretPath({ stateDir, campaignId: config.campaignId }, host),
  );
  if (secret === null) {
    note?.(
      `the player-view host ${host} is not bound, so the briefing's current observation is the opaque refusal (the briefing binds nothing)`,
    );
    return refusal();
  }
  return readPlayerViewGlanceOnOpen(
    held,
    {
      campaignDir: config.campaignDir,
      campaignId: config.campaignId,
      stateDir,
      hostId: host,
      secret,
    },
    // the host supplies nothing: the inner request is the one strict operation
    playerViewRequestOf(undefined),
  );
}

const BUILD_ID = "immortalis-chat-context-readback";

/**
 * Reads the briefing: ONE owner-verified open, closed before this returns. A package a command holds, an unverifiable package, an
 * unreadable record or a missing retained identity is the corresponding status; nothing is repaired, adopted or written to make it read.
 */
export async function readPlayContext(
  config: PhoneConfig,
  o: { readonly note?: (message: string) => void } = {},
): Promise<PlayContextRead> {
  let open: Awaited<ReturnType<typeof openCharacterCampaign>>;
  try {
    open = await openCharacterCampaign(config, BUILD_ID, true);
  } catch {
    return unavailableContext();
  }
  if (!open.ok) {
    const s = open.state;
    if (s.kind === "NO_SETTING") return notYetContext();
    if (s.kind === "BLOCKED") return blockedContext();
    return unavailableContext();
  }
  const { campaign, pin, keep, stateDir } = open;
  try {
    return await campaign.withReadVerification(async (verify) => {
      // campaign isolation: a package that holds another campaign is not this campaign's briefing
      if (campaign.store.head().campaign_id !== config.campaignId) return blockedContext();
      // One shared reader listing; verify re-authenticates this open's actual verification inputs.
      const facts: readonly OwnerFact[] = campaign.store.listFacts();
      const shared = { facts, verify };

      const found = readLocality(campaign, config.campaignId, pin, shared);
      const state = characterStateOf(campaign, config, pin, keep, { ...shared, setting: found });
      const play = playOf(campaign, facts);

      const setting: SettingPart =
        found.kind === "READY"
          ? { state: "ESTABLISHED", readback: found.readback }
          : found.kind === "FAILED"
            ? { state: "BLOCKED" }
            : { state: "NOT_ESTABLISHED" };
      const character: CharacterPart =
        state.kind === "BOUND"
          ? { state: "BOUND", readback: readbackOf(state) }
          : state.kind === "BLOCKED"
            ? { state: "BLOCKED" }
            : state.kind === "UNAVAILABLE"
              ? { state: "UNAVAILABLE" }
              : { state: "NOT_BOUND" };
      const status: ContextStatus =
        setting.state === "BLOCKED" || character.state === "BLOCKED"
          ? "BLOCKED"
          : character.state === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : setting.state === "ESTABLISHED" && character.state === "BOUND"
              ? "QUALIFIED"
              : "NOT_QUALIFIED";
      // the Glance is read only for a campaign that is a supported-play campaign; everything else is the same refusal it would be
      const observation =
        status === "QUALIFIED"
          ? await observationOf(config, { campaign, keep, verify }, stateDir, o.note)
          : refusal();
      return { status, setting, character, play, observation };
    });
  } catch {
    return unavailableContext();
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

/** The owner-grounded account of the player's gathering that `play_status` has always carried, and that the briefing's out-of-character part repeats. */
export interface PlayAccount {
  readonly play: PlayRead | null;
  readonly next: string;
}

/**
 * The briefing as a model reads it. `observation` is embedded exactly as the Glance gateway returned it (its own `JSON.stringify` is what the
 * player-view tool prints), with nothing added to it.
 */
export function assembleBriefing(read: PlayContextRead, account: PlayAccount) {
  return {
    status: read.status,
    authored_starting_context: {
      setting: read.setting,
      character: read.character,
    },
    out_of_character: { play: account.play, next: account.next },
    character_awareness: { current_observation: read.observation },
    scope_notice: SCOPE_NOTICE,
  };
}
