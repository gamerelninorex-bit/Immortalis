import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  EstablishExtractionBasisInputSchema,
  EstablishPcCollectionMechanismInputSchema,
  EstablishReserveInputSchema,
  canonicalJson,
} from "@immortalis/contracts";
import {
  PcCollectionAdapter,
  ProductionAdapter,
  SourceDrawdownAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
} from "@immortalis/engine";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import type { CommandContext, CommandResult } from "./commands.ts";

/**
 * Preparation projects existing accepted claims and physical source facts. It grants no scene, rights or workforce premise, and it
 * does not originate canonical time: how a real campaign originates its time is undecided (the Temporal coordinator says so), so the
 * operator never authors an origin. Time must already be established, or nothing is written.
 */
export const CollectionPreparationSchema = z.strictObject({
  format: z.literal("immortalis-collection-preparation"),
  format_version: z.literal(1),
  mechanism: EstablishPcCollectionMechanismInputSchema,
  extraction_basis: EstablishExtractionBasisInputSchema,
  reserve: EstablishReserveInputSchema.refine(
    (r) => r.quantity.amount === 0,
    "only an empty Reserve may be initialized",
  ),
});

const unavailable = (): CommandResult => ({
  status: "UNAVAILABLE",
  message: "collection preparation is unavailable",
});

/** One descriptor, owner-verified regular file; no symlink, shared writable file, script or arbitrary owner write. */
export function readOwnedSetupFile(path: string): unknown {
  const uid = process.getuid?.();
  if (uid === undefined) return undefined;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = fstatSync(fd);
      if (!st.isFile() || st.uid !== uid || (st.mode & 0o022) !== 0 || st.size > 65_536)
        return undefined;
      return JSON.parse(readFileSync(fd, "utf8"));
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/**
 * A separately confirmed setup operation, not a PC action. The accepted character must already exist. The exact cycle is not attested
 * here: the actual bound GM must still interpret it BEFORE a player act. The empty Reserve creates no material. Publication identities
 * derive from the exact confirmed setup and campaign; a partial preparation replays the same stages on a repeat of the identical setup.
 */
export async function prepareCollection(ctx: CommandContext, path: string): Promise<CommandResult> {
  const { session, terminal } = ctx;
  if (!session.isOpen || session.isAmbiguous) return unavailable();
  const parsed = CollectionPreparationSchema.safeParse(readOwnedSetupFile(path));
  if (!parsed.success)
    return { status: "INVALID_INPUT", message: "the preparation file is not a valid owned setup" };
  const setup = parsed.data;
  const campaign = session.campaign;
  if (campaign.binding()?.value.active_pc.entity_id !== setup.mechanism.pc_id) return unavailable();
  if (
    setup.reserve.world_id !== setup.extraction_basis.world_id ||
    setup.reserve.material_class !== setup.extraction_basis.material_class ||
    setup.reserve.quantity.unit !== setup.extraction_basis.unit
  )
    return unavailable();
  // every precondition is checked BEFORE the first write, so a refusal leaves nothing behind
  if (!new TemporalCoordinator(campaign.store, new StageProviderRegistry()).state())
    return unavailable();
  const subject = subjectOf({ campaign_id: session.campaignId, setup });
  const confirmation = await requestOperatorConfirmation(terminal, "prepare-collection", subject, [
    "COLLECTION PREPARATION — OUT OF CHARACTER; not a player act or a successful collection.",
    JSON.stringify(setup, null, 2),
    "Only the quoted, already accepted PC claims may support this mechanism. A real referee must attest their meaning separately.",
    "This initializes no material, grants no rights, proves no scene/workforce closure, originates no time and advances none.",
  ]);
  if (!confirmation) return { status: "DECLINED", message: "not confirmed; nothing was changed" };
  if (!consumeConfirmation(confirmation, "prepare-collection", subject)) return unavailable();
  const digest = createHash("sha256")
    .update(canonicalJson({ campaign_id: session.campaignId, setup }))
    .digest("hex");
  const publication = (step: string) => ({
    group_id: `collection-preparation:${digest}:${step}:group`,
    intent_id: `collection-preparation:${digest}:${step}:intent`,
    cause: `collection-preparation:${digest}:${step}:cause`,
    basis: "operator-confirmed-original-collection-preparation",
    secrecy: "local-operator-session",
  });
  const collection = new PcCollectionAdapter(campaign.store);
  const drawdown = new SourceDrawdownAdapter(campaign.store);
  const production = new ProductionAdapter(campaign.store);
  const steps = [
    // Validate the PC projection first: an invented cycle can never mint any starting stock or reset time.
    () =>
      collection.establishMechanism({ ...publication("mechanism"), mechanism: setup.mechanism }),
    () => production.establishReserve({ ...publication("reserve"), reserve: setup.reserve }),
    () =>
      drawdown.establishBasis({
        ...publication("basis"),
        extraction_basis: setup.extraction_basis,
      }),
  ];
  for (const step of steps) {
    const written = await step();
    if (!written.ok) {
      if (written.error.code === "UNKNOWN_OUTCOME") {
        session.markAmbiguous();
        return {
          status: "COLLECTION_OUTCOME_UNKNOWN",
          message: "reopen and repeat the identical preparation to reconcile its retained stages",
        };
      }
      return unavailable();
    }
  }
  return {
    status: "COLLECTION_COMMITTED",
    message:
      "preparation committed; referee attestation and owner admission remain required, and nothing was collected",
  };
}
