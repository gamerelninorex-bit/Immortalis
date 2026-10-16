import { fail, ok, type Result } from "@immortalis/contracts";
import type { OwnerRegistry, WriteAdmission } from "../commit/campaign-core.ts";
import { canonicalAdmission } from "./admission.ts";
import { CANONICAL_OWNER_REGISTRY, resolveKey } from "./registry.ts";
import { reject } from "./rejection.ts";

/**
 * Additional owner/facet pairs a build registers beside the canonical and IM-02 kernel ones — the
 * owner adapters whose operations the temporal coordinator resolves (IM-03). The Turnless Temporal
 * Foundation needs one only to prove the coordinator against a substantive owner that is not the
 * kernel: the acceptance fixture registers a SYNTHETIC one from the testkit. Production code never
 * does so, and registering an extension grants no role or permission.
 *
 * An extension may not reuse a canonical/kernel owner name, and it cannot write into a canonical or
 * kernel key space (so it can neither shadow a world/PC/binding fact nor forge kernel state): those
 * key spaces stay bound to their one owner, for a raw `store.commit` as much as for the coordinator.
 */
export interface StageOwnerExtension {
  readonly owners: OwnerRegistry;
  /** Consulted for groups written by an extension owner only. Pure: a function of (group, state). */
  readonly admission?: WriteAdmission;
}

export type ExtensionErrorCode = "EXTENSION_INVALID";

export interface StoreBindings {
  readonly owners: OwnerRegistry;
  readonly admission: WriteAdmission;
}

export function storeBindings(
  extension?: StageOwnerExtension,
): Result<StoreBindings, ExtensionErrorCode> {
  if (!extension) return ok({ owners: CANONICAL_OWNER_REGISTRY, admission: canonicalAdmission });
  for (const [owner, facets] of extension.owners) {
    if (CANONICAL_OWNER_REGISTRY.has(owner)) {
      return fail("EXTENSION_INVALID", "an extension may not reuse a canonical or kernel owner", {
        owner,
      });
    }
    if (facets.size === 0)
      return fail("EXTENSION_INVALID", "an extension owner needs at least one facet", { owner });
  }
  const owners = new Map([...CANONICAL_OWNER_REGISTRY, ...extension.owners]);
  const admission: WriteAdmission = {
    check(group, state) {
      if (!extension.owners.has(group.owner)) return canonicalAdmission.check(group, state);
      for (const w of group.writes) {
        if (resolveKey(w.key)) {
          return reject(
            "KEY_NOT_ADMITTED",
            "an extension owner may not write a canonical or kernel key space",
            { key: w.key },
          );
        }
      }
      return extension.admission?.check(group, state) ?? null;
    },
  };
  return ok({ owners, admission });
}
