import {
  CHECKLIST,
  CLAIM_KINDS,
  ACTOR_KINDS,
  CLOSURE_KINDS,
  type FacetAuthority,
  type InitialSetupInput,
  type Pin,
  type ProvenanceEntry,
  type Restriction,
  type Selection,
} from "@immortalis/contracts";

/**
 * INITIAL_LOCALITY_PROVENANCE_V1 - the independent, STATEFUL validation profile of the v0.9 one-source Selection (C-2, Sovereign-ratified
 * clarification v0.4, native pin 2026-11-03T00:51:23.053Z). It is not a JSON parser and is never implied by a parser version. It is a
 * PURE function of the canonical Input, the accepted Grant's facets, the Input-pinned genesis values and the Selection; the same rules
 * hold at the trusted service, in raw canonical admission and in incremental historical replay.
 *
 * What it proves is a mechanical floor: exact (not normalized) occurrence of quoted text and exact equality of a selected string with a
 * decoded string value of a cited pinned fact. It does NOT prove that a quotation's meaning, negation or entailment is correct, that a
 * source value was semantically associated with a facet (that is the signed SCOPE interpretation) or that a scene is favourable.
 */

type Facet = (typeof CHECKLIST)[number];
export type ProvenanceFailure = { readonly code: string; readonly message: string };

const fail = (code: string, message: string): ProvenanceFailure => ({ code, message });
export const pinKey = (p: Pin): string => `${p.fact_key}@${p.version}`;

// ---------------------------------------------------------------------------------------------------------------------
// The closed path grammar
// ---------------------------------------------------------------------------------------------------------------------

const CONSTRAINT_PATH = /^actors\.constraints\[(0|[1-9][0-9]*)\]$/;

/**
 * The closed leaf paths of a Selection: the twelve unconditional paths exactly once, one `actors.constraints[i]` for each existing
 * element (zero-based decimal index, no leading zeroes), and `source_claims[0].claimant` exactly when non-null. No catch-all, whole
 * object, fact-key-derived or provenance-self path exists. Canonical time values are atomic, not separate paths.
 */
export function selectionLeafPaths(s: Selection): string[] {
  const out = [
    "domain.designation",
    "domain.topology",
    "closure.kind",
    "closure.ground",
    "actors.kind",
    "actors.ground",
  ];
  s.actors.constraints.forEach((_, i) => out.push(`actors.constraints[${i}]`));
  out.push("source_claims[0].kind", "source_claims[0].ground");
  if (s.source_claims[0]?.claimant != null) out.push("source_claims[0].claimant");
  out.push("workforce.scope_statement", "coverage.start", "coverage.end", "coverage.ground");
  return out;
}

/** The governing facet of a path; `null` for the three coverage paths, which have no facet (the producer's finite horizon). */
export function leafFacet(path: string): Facet | null {
  if (path.startsWith("coverage.")) return null;
  if (path.startsWith("actors.")) return "ACTOR_COVERAGE";
  if (path.startsWith("source_claims[0].")) return "SOURCE_CLAIMS";
  if (path.startsWith("workforce.")) return "WORKFORCE_COVERAGE";
  return "DOMAIN_BOUNDARY";
}

const ENUM_PATHS: ReadonlySet<string> = new Set([
  "closure.kind",
  "actors.kind",
  "source_claims[0].kind",
]);

/** The selected string value at a text/enum/claimant/constraint path, or `undefined` for the two atomic time paths. */
export function leafString(s: Selection, path: string): string | undefined {
  switch (path) {
    case "domain.designation":
      return s.domain.designation;
    case "domain.topology":
      return s.domain.topology;
    case "closure.kind":
      return s.closure.kind;
    case "closure.ground":
      return s.closure.ground;
    case "actors.kind":
      return s.actors.kind;
    case "actors.ground":
      return s.actors.ground;
    case "source_claims[0].kind":
      return s.source_claims[0]?.kind;
    case "source_claims[0].ground":
      return s.source_claims[0]?.ground;
    case "source_claims[0].claimant":
      return s.source_claims[0]?.claimant ?? undefined;
    case "workforce.scope_statement":
      return s.workforce.scope_statement;
    case "coverage.ground":
      return s.coverage.ground;
    default: {
      const m = CONSTRAINT_PATH.exec(path);
      return m ? s.actors.constraints[Number(m[1])] : undefined;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Source values: decoded string members and actual ordered Text arrays of a cited pinned fact
// ---------------------------------------------------------------------------------------------------------------------

const isText = (s: string): boolean => s.length > 0 && s === s.trim();

/** Every decoded string-valued member at any depth (including nested array elements); never an object key or wrapper metadata. */
export function sourceStringValues(value: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(value);
  return out;
}

/** Every actual ordered array, at any depth, consisting solely of Text strings (empty arrays are not candidates). */
export function sourceTextArrays(value: unknown): string[][] {
  const out: string[][] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      if (v.length > 0 && v.every((x) => typeof x === "string" && isText(x)))
        out.push(v as string[]);
      else v.forEach(walk);
    } else if (v !== null && typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(value);
  return out;
}

/** The Input-pinned genesis values by `fact_key@version`: only pins the Input admitted, at exactly their pinned version. */
export function genesisValueIndex(
  input: Pick<InitialSetupInput, "genesis">,
  projected: readonly { fact_key: string; version: number; value: unknown }[],
): Map<string, unknown> {
  const admitted = new Set(input.genesis.map(pinKey));
  const out = new Map<string, unknown>();
  for (const f of projected) {
    const k = `${f.fact_key}@${f.version}`;
    if (admitted.has(k)) out.set(k, f.value);
  }
  return out;
}

class SourceCache {
  readonly #values: ReadonlyMap<string, unknown>;
  readonly #strings = new Map<string, Set<string>>();
  readonly #arrays = new Map<string, string[][]>();
  constructor(values: ReadonlyMap<string, unknown>) {
    this.#values = values;
  }
  has(p: Pin): boolean {
    return this.#values.has(pinKey(p));
  }
  strings(p: Pin): Set<string> {
    const k = pinKey(p);
    let s = this.#strings.get(k);
    if (!s) this.#strings.set(k, (s = sourceStringValues(this.#values.get(k))));
    return s;
  }
  arrays(p: Pin): string[][] {
    const k = pinKey(p);
    let a = this.#arrays.get(k);
    if (!a) this.#arrays.set(k, (a = sourceTextArrays(this.#values.get(k))));
    return a;
  }
}

const sameArray = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Distinct (by value and order) candidate arrays; identical arrays count once. */
function distinctArrays(lists: string[][]): string[][] {
  const out: string[][] = [];
  for (const l of lists) if (!out.some((o) => sameArray(o, l))) out.push(l);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Fixed-source feasibility (before SCENE)
// ---------------------------------------------------------------------------------------------------------------------

/** The enum values a source can fix for a mapped enum leaf, compatible with the accepted normalized restrictions. */
function legalEnumValues(
  facet: Facet,
  restrictions: readonly Restriction[],
  present: ReadonlySet<string>,
): string[] {
  const has = (p: string): boolean => restrictions.some((r) => r.predicate === p);
  let domain: readonly string[];
  if (facet === "DOMAIN_BOUNDARY") {
    domain = CLOSURE_KINDS.filter(
      (k) =>
        (!has("REQUIRE_CLOSED_DOMAIN") || k === "CLOSED") &&
        (!has("REQUIRE_OPEN_DOMAIN") || k === "OPEN"),
    );
  } else if (facet === "ACTOR_COVERAGE") {
    domain = ACTOR_KINDS.filter((k) => !has("NO_NON_PC_ACTORS") || k === "NONE_IN_DOMAIN");
  } else {
    domain = CLAIM_KINDS.filter((k) => !has("NO_SOURCE_CLAIMS") || k === "NONE_ESTABLISHED");
  }
  return domain.filter((k) => present.has(k));
}

/**
 * The pure support check a FIXED_BY_SOURCE facet must pass BEFORE any SCENE reservation: the cited admitted sources' own decoded
 * values must supply every mapped Text leaf, exactly one unambiguous legal enum value compatible with the accepted restrictions and,
 * for a non-empty actor set, exactly one unambiguous actual ordered Text[] source value. It never reads a model's claim that a witness
 * exists, never synthesizes, merges or sorts an array, and never turns a fixed facet into a delegated one. Returns a reason (the SCOPE
 * explanation may name FIXED_SOURCE_UNSUPPORTED; it is not a SCOPE rejection code) or `null` when every fixed facet is supported.
 */
export function fixedSourceViolation(
  facets: readonly FacetAuthority[],
  restrictions: readonly Restriction[],
  genesis: ReadonlyMap<string, unknown>,
): string | null {
  const cache = new SourceCache(genesis);
  for (const f of facets) {
    if (f.mode !== "FIXED_BY_SOURCE") continue;
    const tag = `FIXED_SOURCE_UNSUPPORTED (${f.facet})`;
    if (f.source_refs.length === 0) return `${tag}: no cited source`;
    if (f.source_refs.some((p) => !cache.has(p)))
      return `${tag}: a cited source is not an admitted Input-pinned fact`;
    const strings = new Set<string>();
    for (const p of f.source_refs) for (const s of cache.strings(p)) if (isText(s)) strings.add(s);
    if (strings.size === 0)
      return `${tag}: the cited sources hold no Text string to witness a leaf`;
    if (f.facet === "WORKFORCE_COVERAGE") continue;
    const enumValues = legalEnumValues(f.facet, restrictions, strings);
    if (enumValues.length === 0)
      return `${tag}: no legal enum value is witnessed by the cited sources`;
    if (enumValues.length > 1)
      return `${tag}: the cited sources witness more than one legal enum value (ambiguous)`;
    if (f.facet === "ACTOR_COVERAGE" && enumValues[0] !== "NONE_IN_DOMAIN") {
      const arrays = distinctArrays(f.source_refs.flatMap((p) => cache.arrays(p)));
      if (arrays.length === 0)
        return `${tag}: the fixed actor set needs an actual ordered Text[] source value`;
      if (arrays.length > 1)
        return `${tag}: more than one distinct Text[] source value (ambiguous)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The Selection validation profile
// ---------------------------------------------------------------------------------------------------------------------

export interface ProvenanceContext {
  readonly selection: Selection;
  /** the accepted setup message (Input.setup_message) */
  readonly setupMessage: string;
  /** Input.chronology.document.statement: an admitted evidence source for coverage.start ONLY */
  readonly chronologyStatement: string;
  /** the exact Grant pin of this session */
  readonly grant: Pin;
  /** the accepted Grant's facet authorities */
  readonly facets: readonly FacetAuthority[];
  /** Input-pinned genesis values by `fact_key@version` (see genesisValueIndex) */
  readonly genesis: ReadonlyMap<string, unknown>;
}

const samePin = (a: Pin, b: Pin): boolean => a.fact_key === b.fact_key && a.version === b.version;

/**
 * Validates the Selection's provenance array against the closed path set and the value/evidence rules. Provenance-array order is NOT
 * significant to eligibility (the signed raw order is retained elsewhere); the path SET must match with multiplicity one. Every entry is
 * validated at its actual path and value; every listed quote and ref must be valid.
 */
export function provenanceViolation(ctx: ProvenanceContext): ProvenanceFailure | null {
  const { selection } = ctx;
  const expected = selectionLeafPaths(selection).sort();
  const actual = selection.provenance.map((p) => p.path).sort();
  if (actual.length !== expected.length || actual.some((p, i) => p !== expected[i]))
    return fail(
      "PROVENANCE_PATHS",
      "provenance has exactly one entry per closed selected leaf path: no omitted, duplicate, foreign, catch-all or mis-indexed path",
    );
  const cache = new SourceCache(ctx.genesis);
  for (const entry of selection.provenance) {
    const bad = entryViolation(ctx, cache, entry);
    if (bad) return bad;
  }
  // a fixed actor set is the one actual source array, element for element (the source array length IS the cardinality)
  const actors = ctx.facets.find((f) => f.facet === "ACTOR_COVERAGE");
  if (actors?.mode === "FIXED_BY_SOURCE" && selection.actors.kind !== "NONE_IN_DOMAIN") {
    const arrays = distinctArrays(actors.source_refs.flatMap((p) => cache.arrays(p)));
    if (arrays.length !== 1 || !sameArray(arrays[0]!, selection.actors.constraints))
      return fail(
        "PROVENANCE_FIXED",
        "a fixed actor set equals the one unambiguous actual ordered Text[] source value, in order and cardinality",
      );
  }
  return null;
}

function entryViolation(
  ctx: ProvenanceContext,
  cache: SourceCache,
  e: ProvenanceEntry,
): ProvenanceFailure | null {
  const { selection } = ctx;
  if (e.origin !== "PLAYER_AUTHORED" && e.origin !== "PLAYER_DELEGATED")
    return fail(
      "PROVENANCE_ORIGIN",
      "only PLAYER_AUTHORED and PLAYER_DELEGATED are emitted by selection; WORLD_COMPLETION, ACTOR_DECISION and ENGINE_DERIVED are not",
    );
  const facetName = leafFacet(e.path);
  const authority = facetName ? ctx.facets.find((f) => f.facet === facetName) : undefined;

  // coverage.start: the captured chronology statement is the ONLY quote, for this path only
  if (e.path === "coverage.start") {
    if (
      e.origin !== "PLAYER_AUTHORED" ||
      e.grant !== null ||
      e.source_refs.length !== 0 ||
      e.evidence_quotes.length !== 1 ||
      e.evidence_quotes[0] !== ctx.chronologyStatement
    )
      return fail(
        "PROVENANCE_CHRONOLOGY",
        "coverage.start is PLAYER_AUTHORED, grant:null, no source refs, with exactly the captured chronology statement as its only quote",
      );
    return null;
  }

  // every listed ref must be an admitted Input-pinned fact; every listed quote an exact occurrence in the message or in a string
  // value of a fact THIS entry cites (a pin merely being in Input.genesis does not make its text available)
  for (const s of e.source_refs)
    if (!cache.has(s))
      return fail(
        "PROVENANCE_REF",
        "a provenance source ref is not an admitted Input-pinned genesis fact",
      );
  for (const q of e.evidence_quotes) {
    const inMessage = ctx.setupMessage.includes(q);
    const inCited = e.source_refs.some((s) => [...cache.strings(s)].some((v) => v.includes(q)));
    if (!inMessage && !inCited)
      return fail(
        "PROVENANCE_QUOTE",
        "a provenance quote is an exact occurrence in neither the accepted instruction nor a string value of a fact this entry cites",
      );
  }

  if (e.origin === "PLAYER_DELEGATED") {
    if (e.grant === null || !samePin(e.grant, ctx.grant))
      return fail("PROVENANCE_GRANT", "PLAYER_DELEGATED needs this session's exact grant");
    if (facetName && authority?.mode !== "DELEGATED")
      return fail(
        "PROVENANCE_FACET",
        "a leaf of a facet fixed by source or not authorized is not a delegated selection",
      );
    return null;
  }

  // PLAYER_AUTHORED
  if (e.grant !== null) return fail("PROVENANCE_GRANT", "PLAYER_AUTHORED carries no grant");
  if (e.path === "coverage.end")
    return fail(
      "PROVENANCE_ORIGIN",
      "coverage.end is the producer's horizon: PLAYER_DELEGATED only",
    );
  const value = leafString(selection, e.path);
  if (value === undefined)
    return fail("PROVENANCE_PATHS", "an authored entry names no selected value");
  // the source pins that may witness this value: the entry's own cited pins and, for a fixed facet, also the facet's accepted pins
  const fixed = authority?.mode === "FIXED_BY_SOURCE";
  const witnessing = e.source_refs.filter(
    (s) => !fixed || authority!.source_refs.some((a) => samePin(a, s)),
  );
  const witnessed = witnessing.some((s) => cache.strings(s).has(value));
  if (ENUM_PATHS.has(e.path)) {
    // a typed enum is authored only by an exact source-value witness through a FIXED facet's cited pin; a quoted token alone is not one
    if (!fixed || !witnessed)
      return fail(
        "PROVENANCE_ENUM",
        "an enum leaf is PLAYER_AUTHORED only when its facet is FIXED_BY_SOURCE and the exact enum value is a decoded string value of that facet's cited pin",
      );
    return null;
  }
  if (fixed) {
    // every mapped leaf of a fixed facet must equal the actual fixed source value; a valid quote about another value cannot replace it
    if (CONSTRAINT_PATH.test(e.path)) return null; // equality is checked against the one source array, element for element
    if (!witnessed)
      return fail(
        "PROVENANCE_FIXED",
        "a leaf of a fixed facet equals a decoded string value of the facet's accepted source pin",
      );
    return null;
  }
  // text leaf: the whole selected string occurs within a valid quote of this entry, or is an exact source-value witness
  const inQuote = e.evidence_quotes.some((q) => q.includes(value));
  if (!inQuote && !witnessed)
    return fail(
      "PROVENANCE_VALUE",
      "PLAYER_AUTHORED text is wholly contained in a valid quote of its own entry or equals a string value of a fact it cites",
    );
  return null;
}
