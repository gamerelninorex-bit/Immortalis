import * as engine from "@immortalis/engine";
import { EXPECTED_ADAPTER_SURFACES } from "./expected-surface.ts";
import { code } from "./f027.ts";
import {
  adapterMethods,
  type ObservedAdapterSource,
  type ObservedAdmissionSource,
} from "./surface-checks.ts";

/**
 * Reads the REAL production surface for comparison against the oracle. This is the only support module that imports
 * the engine; the oracle (./expected-surface.ts) and the drift finders (./surface-checks.ts) never do.
 *
 * Adapter and coordinator classes are discovered from the engine's exports, not looked up by an expected name, so an
 * unauthorized new class is observed and reported rather than silently ignored.
 */

const isClass = (v: unknown): v is { prototype: object } => typeof v === "function";

export function observeAdapterMethods(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(engine)
      .filter(([name, v]) => /(Adapter|Coordinator)$/.test(name) && isClass(v))
      .map(([name, v]) => [name, adapterMethods(v as { prototype: object })]),
  );
}

export function observeAdapterSources(): Record<string, ObservedAdapterSource> {
  const out: Record<string, ObservedAdapterSource> = {};
  for (const [name, want] of Object.entries(EXPECTED_ADAPTER_SURFACES)) {
    if (!want.source) continue;
    const text = code(want.source.file);
    out[name] = {
      commitCalls: text.match(/\.commit\(/g)?.length ?? 0,
      establishWriters: [...text.matchAll(/async (establish\w+)\(/g)].map((m) => m[1]!).sort(),
    };
  }
  return out;
}

export function observeAdmissions(): Record<string, ObservedAdmissionSource> {
  const out: Record<string, ObservedAdmissionSource> = {};
  for (const [name, want] of Object.entries(EXPECTED_ADAPTER_SURFACES)) {
    if (!want.admission) continue;
    const text = code(want.admission.file);
    out[name] = {
      createOnlyGuards: text.match(/expected_version !== 0/g)?.length ?? 0,
      amendmentRefusals: text.match(/AMENDMENT_NOT_SUPPORTED/g)?.length ?? 0,
    };
  }
  return out;
}

/** Engine registry group exports (`FACT_KINDS`, `GIP_FACT_KINDS`, …), keyed by export name. */
export function observeKindGroups(): Record<string, readonly { id: string }[]> {
  return Object.fromEntries(
    Object.entries(engine).filter(
      ([name, v]) =>
        /^([A-Z_]+_)?FACT_KINDS$/.test(name) && name !== "ALL_FACT_KINDS" && Array.isArray(v),
    ),
  ) as Record<string, readonly { id: string }[]>;
}
