import { ClosedSettingSchema } from "../../../packages/operator/src/closed-setting.ts";
import { CollectionPreparationSchema } from "../../../packages/operator/src/collection-preparation.ts";
import { StartingChronologySchema } from "../../../packages/operator/src/time-initialization.ts";
import { inOrder, splitConfirmation, wholeConfirmationBody } from "./confirm-text.ts";
import type { Run } from "./runs.ts";
import type { StageIdentity } from "./route-stages.ts";
import { TERMINAL_MAX_LINE, TERMINAL_MAX_LINES } from "./web-terminal.ts";

/**
 * What the HUMAN's confirmation of one stage must show whole, derived from the stage's retained identity and never from the transcript
 * (BLUE: no mandatory review text may be truncated, no field dropped, and no confirmation given on an incomplete display or channel
 * capacity). The text the player is asked to confirm is the engine's own lines since the last reply, in order and untruncated; it is
 * delivered in as many consecutive parts as the channel needs (a part confirms nothing), and it is judged here against what the retained
 * operation says it must contain. A confirmation that cannot be shown whole is DECLINED, never given.
 */
export interface StageExpectation {
  /** the line the review opens with */
  readonly first: string;
  /** everything else the review must carry, in the order the engine prints it */
  readonly then: readonly string[];
  /** the opening of the final line, the challenge */
  readonly last: string;
}

const pretty = (schema: { parse(v: unknown): unknown }, document: string): string =>
  JSON.stringify(schema.parse(JSON.parse(document)), null, 2);

/** the review each stage's shipped command prints, as it is printed (the lines are the operator's; these are what a faithful transcript of them contains) */
export function expectationOf(id: StageIdentity): StageExpectation | null {
  try {
    switch (id.kind) {
      case "LOCUS":
        return {
          first: "PHYSICAL LOCUS - a third, separate choice. Nothing physical is held yet.",
          then: [
            `world ${id.world_id}, locus ${id.locus_id}`,
            "native-presence statement, kept verbatim:",
            "+--- AI REFEREE FINDINGS: PHYSICAL PLACEMENT (",
            "CONFIRMATION - PHYSICAL LOCUS (the third, separate choice)",
            `character: ${id.pc_id}`,
            "native-presence statement, kept verbatim:",
            "Confirming records, in World-State's custody, that this ONE material character is physically at exactly this locus, stationary, on the reading above.",
            "It gives the character no perception, knowledge, action, capability, movement, elapsed time, access, rights or any non-player character's cooperation.",
          ],
          last: 'To confirm, type exactly "establish-character-locus ',
        };
      case "CHRONOLOGY":
        return {
          first:
            "STARTING CHRONOLOGY — OUT OF CHARACTER; the origin of this campaign's canonical time, established ONCE.",
          then: [
            pretty(StartingChronologySchema, id.setup.document),
            "These are the setting author's own words and coordinate. Nothing is defaulted or estimated; no time passes by establishing it.",
          ],
          last: 'To confirm, type exactly "initialize-time ',
        };
      case "CLARIFY":
        return {
          first:
            "ACCEPT A CLARIFICATION OF YOUR CHARACTER - a separate, fresh choice. Nothing is accepted yet.",
          then: [
            `your words: ${JSON.stringify(id.words)}`,
            "+--- AI REFEREE FINDINGS (",
            "branch reading: ",
            "scope reading: ",
            "Confirming makes these words an accepted claim of your character from the canonical time",
          ],
          last: 'To confirm, type exactly "accept-clarification ',
        };
      case "DELEGATE":
        return {
          first:
            "DELEGATE A CHOICE OF YOUR CHARACTER - a separate, fresh choice. Nothing is accepted yet.",
          then: [
            `character: ${id.pc_id}`,
            "the choice you delegate:",
            (id.shortest ?? 1) === 1 && id.longest === null
              ? "your limits: none given"
              : `your limits: at least ${id.shortest ?? 1} and ${id.longest === null ? "no upper limit given" : `at most ${id.longest}`}`,
            "who chooses: role.gm (the AI referee host), inside that scope, once;",
            "what is recorded: a Delegation Commit Record with provenance PLAYER-DELEGATED",
            "The referee has chosen inside your scope. The choice is sealed with the delegation and is not shown here",
            "Confirming delegates the choice and seals it from the canonical time",
          ],
          last: 'To confirm, type exactly "accept-delegation ',
        };
      case "PREPARE":
        return {
          first:
            "COLLECTION PREPARATION — OUT OF CHARACTER; not a player act or a successful collection.",
          then: [
            pretty(CollectionPreparationSchema, id.setup.document),
            "Only the quoted, already accepted PC claims may support this mechanism. A real referee must attest their meaning separately.",
            "This initializes no material, grants no rights, proves no scene/workforce closure, originates no time and advances none.",
          ],
          last: 'To confirm, type exactly "prepare-collection ',
        };
      case "DECLARE":
        return {
          first:
            "CLOSED-SETTING DECLARATION — OUT OF CHARACTER; the setting author's own canon, derived coverage added by the owners.",
          then: [
            pretty(ClosedSettingSchema, id.document),
            "You state the domain, its closure, and that no claim on each named source is established. You do NOT state who or what is present: World-State",
            "It is not the player's choice, grants no right beyond the grounds you state, suppresses no independent cause and advances no time.",
            "NEWLY AUTHORIZED under the bounded semantic delegation (independent BLUE review pending).",
          ],
          last: 'To confirm, type exactly "declare-closed-setting ',
        };
      case "FINISH":
        return null;
    }
  } catch {
    return null;
  }
}

/** The review, in as many consecutive parts as the channel needs, or null when this transcript no longer holds all of it. */
export function completeStageConfirmation(run: Run, expect: StageExpectation): string[] | null {
  const whole = wholeConfirmationBody(run);
  if (whole === null) return null;
  const lines = whole.split("\n");
  if (!(lines[lines.length - 1] ?? "").startsWith(expect.last)) return null;
  const head = whole.startsWith(expect.first) ? 0 : whole.indexOf(`\n${expect.first}`) + 1;
  if (head <= 0 && !whole.startsWith(expect.first)) return null;
  if (inOrder(whole, head, expect.then) < 0) return null;
  return splitConfirmation(whole);
}

/**
 * True when the whole review of this stage is sure to fit the transcript the human is shown (it keeps a bounded number of lines, and an
 * overlong one is split across several). An upper bound from the retained document alone.
 */
export function fitsReview(id: StageIdentity): boolean {
  const e = expectationOf(id);
  if (e === null) return id.kind === "FINISH";
  const chars = e.then.reduce((n, t) => n + t.length + 2, e.first.length + 4_000);
  return (
    Math.ceil(chars / (TERMINAL_MAX_LINE - 2)) + e.then.length + 120 <= TERMINAL_MAX_LINES - 100
  );
}
