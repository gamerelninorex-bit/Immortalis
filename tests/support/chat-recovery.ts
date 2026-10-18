import type { PhoneDeps } from "../../apps/phone/src/server.ts";
import type { CollectionIdentity } from "../../apps/phone/src/collection-recovery.ts";
import { buildPlayerCommand } from "../../apps/phone/src/commands.ts";
import { runCli } from "@immortalis/operator";

/** Transport-only stand-ins. Canonical recovery is tested separately against isolated real campaigns. */
export const stubCollectionIdentity = (uid: string): CollectionIdentity => ({
  uid,
  pc_id: "pc-test-1",
  basis: { unit: "fixture-time-unit", value: 100 },
  temporal: "test",
  revision: 1,
  ledger: [],
  collection_id: null,
  act_id: null,
  target: null,
  task_ids: [],
  reach_digest: null,
  held: [],
});

export const stubCollectionRecovery = (
  cli: NonNullable<PhoneDeps["runCli"]> = runCli,
): NonNullable<PhoneDeps["recovery"]> => ({
  captureCollection: async (_c, uid) => stubCollectionIdentity(uid),
  runCollection: async (config, p, env, recovering) => {
    const represented = p.command === "collect-continue" || p.command === "settle-collection-lapse";
    const built = buildPlayerCommand(
      config,
      recovering && !represented
        ? { command: "reconcile" }
        : { command: p.command, options: p.options },
    );
    if (!built.ok) throw new Error(built.reason);
    const statuses: string[] = [];
    const say = (line: string) => {
      if (line.startsWith("STATUS ")) statuses.push(line);
      env.out?.(line);
    };
    const code = await cli(built.value.argv, {
      ...env,
      out: say,
      terminal: { ...env.terminal!, say },
    });
    if (!recovering) return code;
    if (
      code === 0 &&
      statuses.length > 0 &&
      statuses.every((s) =>
        represented
          ? /^STATUS \S*COMMITTED\b/.test(s)
          : /^STATUS (NOTHING_TO_RECONCILE|\S*COMMITTED)\b/.test(s),
      )
    )
      return 0;
    env.out?.(
      `RECOVERY BLOCKED: ${p.command} did not settle the operation (${statuses.join("; ") || `exit ${code}`})`,
    );
    return 4;
  },
});
