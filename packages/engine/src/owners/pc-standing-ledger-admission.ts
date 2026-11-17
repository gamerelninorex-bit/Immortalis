import {
  FACET_PC_STANDING_INSTRUCTION_LEDGER,
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  OWNER_PC_EXISTENCE,
  OWNER_ROLE_REGISTRY,
  PLAYER_CHARACTER_BINDING_KEY,
  PcStandingLedgerHeadSchema,
  PcStandingLedgerVersionSchema,
  PlayerCharacterBindingSchema,
  pcExistenceContractKey,
  worldSetupClosureKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  PC_LEDGER_FIRST_SEQUENCE,
  type CommitGroup,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { PC_LEDGER_BINDING_RULE, resolveKey } from "./registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "./rejection.ts";
import {
  PC_LEDGER_BASIS,
  PC_LEDGER_SECRECY,
  bindingLedgerViolation,
  ledgerPairViolation,
  targetWorldIdOf,
} from "./pc-standing-ledger.ts";

/**
 * IM-11/IM-03 admission of the S-4 initial Standing Instruction ledger (a fifth facet of the one PC owner, `pc_existence`).
 *
 * ONE group writes exactly two facts, the sealed sequence-1 version and the PC's head, both created (expected version 0): the
 * head is ADVANCING by registration, but this package admits only initialization, so every later mutation of either fact is
 * refused until the separately selected instruction-writing package exists. The group reads and depends on the committed facts its
 * origin rests on, at their exact versions, and is re-judged against them by `ledgerPairViolation`: the same rule replay applies to
 * the pre-state it was committed on and cold-open verification applies again, for a raw `store.commit` as much as for the owner
 * path. The fixed publication identity is derived from the PC and its source facts, so a retry converges and a changed payload
 * under the same identity conflicts.
 */
export function pcLedgerGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 2) {
    return reject(
      "VALUE_INVALID",
      "one initialization publishes exactly the PC's ledger head and its sequence-1 version",
    );
  }
  const head = group.writes.find(
    (w) => resolveKey(w.key)?.kind.id === "pc_standing_instruction_ledger_head",
  );
  const version = group.writes.find(
    (w) => resolveKey(w.key)?.kind.id === "pc_standing_instruction_ledger_version",
  );
  if (!head || !version) {
    return reject("VALUE_INVALID", "the ledger group holds one head and one version, nothing else");
  }
  if (head.expected_version !== 0 || version.expected_version !== 0) {
    return reject(
      "AMENDMENT_NOT_SUPPORTED",
      "only initialization is admitted: a later head advance or any further ledger version needs the separately selected instruction-writing package",
      { key: head.expected_version !== 0 ? head.key : version.key },
    );
  }
  for (const w of group.writes) {
    if (w.basis !== PC_LEDGER_BASIS || w.secrecy !== PC_LEDGER_SECRECY) {
      return reject(
        "VALUE_INVALID",
        "a ledger write carries the canonical ledger basis and secrecy",
        {
          key: w.key,
        },
      );
    }
  }
  const parsedVersion = PcStandingLedgerVersionSchema.safeParse(version.value);
  const parsedHead = PcStandingLedgerHeadSchema.safeParse(head.value);
  if (!parsedVersion.success || !parsedHead.success) {
    return reject("VALUE_INVALID", "the ledger head or version violates its typed contract");
  }
  const origin = parsedVersion.data.origin;
  // every foreign fact the origin rests on is read at its exact current version and depended on, never copied
  const pins =
    origin.kind === LEDGER_ORIGIN_ENGINE_CLOSURE
      ? [
          [
            pcExistenceContractKey(parsedVersion.data.pc_id),
            "the PC's released Existence Contract",
          ],
          [origin.target_world.fact_key, "the target world's profile"],
          ...(origin.setup_closure
            ? [[origin.setup_closure.fact_key, "the target world's setup closure"] as const]
            : []),
        ]
      : [[PLAYER_CHARACTER_BINDING_KEY, "the operative player-character binding"]];
  for (const [key, what] of pins) {
    const pinned = requirePrerequisite(group, state, key, what);
    if (isRejection(pinned)) return pinned;
  }
  // An explicit null is a claim of ABSENCE about the target world's closure. It is never taken on trust: the group must READ that
  // closure key at version 0 (so a closure can never slip in beneath it: the store refuses a stale read), and the origin rule below
  // is judged against the actual pre-state, in normal admission, in a raw `store.commit` and in historical replay alike.
  if (origin.kind === LEDGER_ORIGIN_ENGINE_CLOSURE && origin.setup_closure === null) {
    const worldId = targetWorldIdOf(origin.target_world);
    if (worldId !== null) {
      const absent = worldSetupClosureKey(worldId);
      if (!group.reads.some((r) => r.key === absent && r.version === 0)) {
        return reject(
          "REFERENCE_INVALID",
          "an explicit null closure is a claim that the target world has none: the group must read that world's setup-closure key at version 0",
          { key: absent },
        );
      }
    }
  }
  const violation = ledgerPairViolation(head, version, group, state.facts);
  return violation ? reject("REFERENCE_INVALID", violation, { key: head.key }) : null;
}

/**
 * The S-4 binding prerequisite as an admission result: the PC's committed ledger head and version are READ at their exact
 * versions and DEPENDED on (a binding can neither create nor precede them), and the sealed pair qualifies this binding. Applies to
 * a fresh binding and, on replay, to every binding committed under the S-4 citation.
 */
export function bindingLedgerCheck(
  group: CommitGroup,
  state: CampaignState,
  binding: PlayerCharacterBinding,
): Rejection | null {
  const pcId = binding.active_pc.entity_id;
  for (const [key, what] of [
    [pcStandingLedgerHeadKey(pcId), "the PC's qualified Standing Instruction ledger head"],
    [
      pcStandingLedgerVersionKey(pcId, PC_LEDGER_FIRST_SEQUENCE),
      "the PC's sealed sequence-1 ledger version",
    ],
  ] as const) {
    const pinned = requirePrerequisite(group, state, key, what);
    if (isRejection(pinned)) return pinned;
  }
  const violation = bindingLedgerViolation(binding, state.facts);
  return violation
    ? reject("REFERENCE_INVALID", violation, { key: PLAYER_CHARACTER_BINDING_KEY })
    : null;
}

/**
 * Historical verification (replay, against the ACTUAL incremental pre-state): a ledger group is judged by exactly the rule it was
 * admitted under, and a binding committed under the S-4 citation must have consumed its older head. A binding committed under the
 * ORIGINAL citation is an authentic old headless binding and replays under its original policy, with no ledger requirement. Any other
 * group returns at once, so legacy journals replay exactly as before.
 */
export function pcLedgerHistoricalCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_STANDING_INSTRUCTION_LEDGER) {
    return pcLedgerGroupCheck(group, state);
  }
  if (group.owner !== OWNER_ROLE_REGISTRY || !canonicalEqual(group.rule, PC_LEDGER_BINDING_RULE)) {
    return null;
  }
  const w = group.writes.find((x) => x.key === PLAYER_CHARACTER_BINDING_KEY);
  if (!w) return null;
  const binding = PlayerCharacterBindingSchema.safeParse(w.value);
  if (!binding.success) {
    return reject("VALUE_INVALID", "the binding violates its typed contract", {
      key: PLAYER_CHARACTER_BINDING_KEY,
    });
  }
  return bindingLedgerCheck(group, state, binding.data);
}
