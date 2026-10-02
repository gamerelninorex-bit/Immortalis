import type { ExpectedAdapterSurface, ExpectedFactKind } from "./expected-surface.ts";

/**
 * Drift finders: pure comparisons between the independent oracle (./expected-surface.ts) and an observed surface.
 *
 * Each returns a list of human-readable drift findings; an empty list means "no drift". They take the observed
 * surface as an argument, so the unit suite can feed them synthetic drift and prove they report it, while the
 * central conformance suite feeds them the real production surface. Nothing here reads production itself.
 */

/** The slice of a production `FactKind` the comparisons need (structurally typed; no production import). */
export interface ObservedFactKind {
  readonly id: string;
  readonly owner: string;
  readonly facet: string;
  readonly keyPattern: RegExp;
  readonly legacyRule?: unknown;
}

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();
const diff = (expected: readonly string[], actual: readonly string[]) => ({
  missing: expected.filter((x) => !actual.includes(x)),
  extra: actual.filter((x) => !expected.includes(x)),
});

/** Own prototype methods of a class, constructor excluded, sorted. */
export const adapterMethods = (ctor: { prototype: object }): string[] =>
  sorted(Object.getOwnPropertyNames(ctor.prototype).filter((m) => m !== "constructor"));

/** Global inventory, per-kind owner/facet, and per-owner membership (ordered) and cardinality. */
export function findInventoryDrift(
  expected: readonly ExpectedFactKind[],
  actual: readonly ObservedFactKind[],
): string[] {
  const out: string[] = [];
  if (actual.length !== expected.length)
    out.push(`fact-kind count: expected ${expected.length}, found ${actual.length}`);
  const ids = actual.map((k) => k.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i)))
    out.push(`fact kind ${id} is registered more than once`);
  const { missing, extra } = diff(
    expected.map((k) => k.id),
    ids,
  );
  for (const id of missing) out.push(`expected fact kind ${id} is not registered (removal)`);
  for (const id of extra) out.push(`fact kind ${id} is registered but not expected (addition)`);
  for (const e of expected) {
    const a = actual.find((k) => k.id === e.id);
    if (!a) continue;
    if (a.owner !== e.owner) out.push(`${e.id}: owner expected ${e.owner}, found ${a.owner}`);
    if (a.facet !== e.facet) out.push(`${e.id}: facet expected ${e.facet}, found ${a.facet}`);
  }
  const owners = new Set([...expected.map((k) => k.owner), ...actual.map((k) => k.owner)]);
  for (const owner of owners) {
    const want = expected.filter((k) => k.owner === owner).map((k) => k.id);
    const have = actual.filter((k) => k.owner === owner).map((k) => k.id);
    if (want.length !== have.length)
      out.push(`owner ${owner}: expected ${want.length} kinds, found ${have.length}`);
    else if (want.some((id, i) => id !== have[i]))
      out.push(`owner ${owner}: kind order/membership expected [${want}], found [${have}]`);
  }
  return out;
}

/** The engine's per-group exports (`*_FACT_KINDS`) against the oracle's group assignment, order included. */
export function findGroupDrift(
  expected: readonly ExpectedFactKind[],
  groups: Readonly<Record<string, readonly { id: string }[]>>,
): string[] {
  const out: string[] = [];
  const names = new Set([...expected.map((k) => k.group), ...Object.keys(groups)]);
  for (const name of names) {
    const want = expected.filter((k) => k.group === name).map((k) => k.id);
    const have = groups[name]?.map((k) => k.id);
    if (!have) out.push(`registry group ${name} is expected but not exported`);
    else if (want.length === 0) out.push(`registry group ${name} is exported but not expected`);
    else if (want.length !== have.length || want.some((id, i) => id !== have[i]))
      out.push(`registry group ${name}: expected [${want}], found [${have}]`);
  }
  return out;
}

/** Owner → facet registration. */
export function findOwnerFacetDrift(
  expected: Readonly<Record<string, readonly string[]>>,
  actual: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const out: string[] = [];
  const { missing, extra } = diff(Object.keys(expected), [...actual.keys()]);
  for (const o of missing) out.push(`owner ${o} is expected but not registered`);
  for (const o of extra) out.push(`owner ${o} is registered but not expected`);
  for (const [owner, facets] of Object.entries(expected)) {
    const have = actual.get(owner);
    if (!have) continue;
    const d = diff(facets, [...have]);
    for (const f of d.missing) out.push(`owner ${owner}: expected facet ${f} is not registered`);
    for (const f of d.extra) out.push(`owner ${owner}: facet ${f} is registered but not expected`);
  }
  return out;
}

/** The fact kinds carrying a `legacyRule`, and the count of the `legacyRule` slot in the registry source text. */
export function findLegacyRuleDrift(
  expectedIds: readonly string[],
  expectedSourceSlots: number,
  actual: readonly ObservedFactKind[],
  registrySource: string,
): string[] {
  const out: string[] = [];
  const have = actual.filter((k) => k.legacyRule).map((k) => k.id);
  if (have.length !== expectedIds.length || have.some((id, i) => id !== expectedIds[i]))
    out.push(`legacy-rule kinds: expected [${expectedIds}], found [${have}]`);
  const slots = registrySource.match(/legacyRule\s*[?]?:/g)?.length ?? 0;
  if (slots !== expectedSourceSlots)
    out.push(
      `legacyRule slots in registry source: expected ${expectedSourceSlots}, found ${slots}`,
    );
  return out;
}

/**
 * Key-space exclusivity: each canonical example key resolves to exactly its own kind, and each unregistered probe
 * resolves to none.
 */
export function findKeySpaceDrift(
  expected: readonly ExpectedFactKind[],
  actual: readonly ObservedFactKind[],
  unregisteredProbes: readonly string[],
): string[] {
  const out: string[] = [];
  const resolve = (key: string) => actual.filter((k) => k.keyPattern.test(key)).map((k) => k.id);
  for (const e of expected) {
    const got = resolve(e.exampleKey);
    if (got.length !== 1 || got[0] !== e.id)
      out.push(`key ${JSON.stringify(e.exampleKey)}: expected only [${e.id}], resolved [${got}]`);
  }
  for (const key of unregisteredProbes) {
    const got = resolve(key);
    if (got.length !== 0)
      out.push(`key ${JSON.stringify(key)} is expected to be unregistered, resolved [${got}]`);
  }
  return out;
}

/** Observed source-text facts about one adapter module (comment-stripped by the caller). */
export interface ObservedAdapterSource {
  readonly commitCalls: number;
  readonly establishWriters: readonly string[];
}
export interface ObservedAdmissionSource {
  readonly createOnlyGuards: number;
  readonly amendmentRefusals: number;
}

/** The set of adapter/coordinator classes, each one's whole method surface, and the source-text cardinalities. */
export function findAdapterSurfaceDrift(
  expected: Readonly<Record<string, ExpectedAdapterSurface>>,
  actualMethods: Readonly<Record<string, readonly string[]>>,
  actualSources: Readonly<Record<string, ObservedAdapterSource>>,
  actualAdmissions: Readonly<Record<string, ObservedAdmissionSource>>,
): string[] {
  const out: string[] = [];
  const { missing, extra } = diff(Object.keys(expected), Object.keys(actualMethods));
  for (const c of missing) out.push(`adapter class ${c} is expected but not exported`);
  for (const c of extra) out.push(`adapter class ${c} is exported but not expected`);
  for (const [name, want] of Object.entries(expected)) {
    const have = actualMethods[name];
    if (have) {
      const d = diff(want.methods, have);
      for (const m of d.missing) out.push(`${name}: expected method ${m} is absent (removal)`);
      for (const m of d.extra)
        out.push(`${name}: method ${m} is exposed but not expected (addition)`);
    }
    if (want.source) {
      const src = actualSources[name];
      if (!src) out.push(`${name}: source module ${want.source.file} was not observed`);
      else {
        if (src.commitCalls !== want.source.commitCalls)
          out.push(
            `${name}: .commit( calls expected ${want.source.commitCalls}, found ${src.commitCalls}`,
          );
        const w = diff(want.source.establishWriters, src.establishWriters);
        for (const m of w.missing) out.push(`${name}: expected writer ${m} is not declared`);
        for (const m of w.extra) out.push(`${name}: writer ${m} is declared but not expected`);
        if (src.establishWriters.length !== new Set(src.establishWriters).size)
          out.push(`${name}: an establish writer is declared more than once`);
      }
    }
    if (want.admission) {
      const adm = actualAdmissions[name];
      if (!adm) out.push(`${name}: admission module ${want.admission.file} was not observed`);
      else {
        if (adm.createOnlyGuards !== want.admission.createOnlyGuards)
          out.push(
            `${name}: create-only guards expected ${want.admission.createOnlyGuards}, found ${adm.createOnlyGuards}`,
          );
        if (adm.amendmentRefusals !== want.admission.amendmentRefusals)
          out.push(
            `${name}: amendment refusals expected ${want.admission.amendmentRefusals}, found ${adm.amendmentRefusals}`,
          );
      }
    }
  }
  return out;
}
