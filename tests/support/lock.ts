import { expect } from "vitest";

/**
 * The F-027 lock as it stood before the R1 Stage-One v1.1 transition: every key except the two additive blocks that record the
 * section-scoped design lineage and the executable lowering.
 */
export const withoutR1Blocks = (lock: unknown): Record<string, unknown> => {
  const rest = { ...(lock as Record<string, unknown>) };
  delete rest["design_lineage_successors"];
  delete rest["executable_lowerings"];
  return rest;
};

/**
 * "The frozen contract is not a lock pin", stated exactly. The contract's page id may appear in the lock ONLY as a non-executable
 * design-lineage row (R1 Stage-One v1.1, BLUE ruling on PR #84): it is in no frozen source, no implementation-authority addendum, no
 * governance reference, no tranche and no rule, it is in no executable lowering, and the frozen contract's own native pins appear
 * nowhere in the lock. Every other section of the lock is searched exactly as before.
 */
export const expectNotALockPin = (
  lock: unknown,
  id: string,
  pins: readonly string[] = [],
): void => {
  const whole = JSON.stringify(lock);
  expect(JSON.stringify(withoutR1Blocks(lock)), `${id} outside the R1 blocks`).not.toContain(id);
  const l = lock as {
    design_lineage_successors?: { url: string; executable: boolean; status: string }[];
    executable_lowerings?: unknown[];
  };
  expect(
    JSON.stringify(l.executable_lowerings ?? []),
    `${id} in an executable lowering`,
  ).not.toContain(id);
  for (const row of l.design_lineage_successors ?? []) {
    if (row.url.includes(id)) {
      expect(row.executable, `${id} lineage row is not executable`).toBe(false);
      expect(row.status).toBe("DESIGN_RATIFIED");
    }
  }
  for (const pin of pins) expect(whole, pin).not.toContain(pin);
};
