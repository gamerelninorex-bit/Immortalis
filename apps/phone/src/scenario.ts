import { lstatSync, readFileSync } from "node:fs";

/**
 * The chat scenario file: the engineering-owned identities (character, world, source, reserve, unit, mechanism, basis) that the player
 * never has to name. It is read from the operator's own file and from nowhere else: no tool argument, no request and no model supplies any
 * of it. This module only READS it; a defect is described in words for the OPERATOR (the preflight and the service log), never for the
 * player or the assistant, who are told only that the scenario is not configured.
 */
export interface Scenario {
  readonly player_character: string;
  readonly world: string;
  readonly source: string;
  readonly reserve: string;
  readonly quantity_unit: string;
  readonly mechanism: string;
  readonly basis: string;
}

export const SCENARIO_KEYS = [
  "player_character",
  "world",
  "source",
  "reserve",
  "quantity_unit",
  "mechanism",
  "basis",
] as const;

// an identity begins with a letter or digit (the engine's EntityId rule): a value the commands would refuse is refused here, early and by name
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNIT = /^[A-Za-z0-9._ :-]{1,64}$/;
const MAX_BYTES = 4096;

/** True for exactly the seven keys of the scenario, each a valid identity (and the unit a valid unit): the same rule the file check applies, for a scenario held in memory. */
export function isScenario(v: unknown): v is Scenario {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r);
  return (
    keys.length === SCENARIO_KEYS.length &&
    SCENARIO_KEYS.every(
      (k) =>
        Object.hasOwn(r, k) &&
        typeof r[k] === "string" &&
        (k === "quantity_unit" ? UNIT : ID).test(r[k]),
    )
  );
}

export type ScenarioCheck =
  | { readonly ok: true; readonly scenario: Scenario }
  | { readonly ok: false; readonly defect: string };

const no = (defect: string): ScenarioCheck => ({ ok: false, defect });

/**
 * Reads and validates the scenario file and names the FIRST defect. `strict` additionally demands what the documentation says of the file —
 * a regular file (not a link) owned by the user that runs the service and not writable by anyone else — which the preflight enforces; the
 * running service does not (an existing deployment's file is read as before).
 */
export function checkScenarioFile(
  file: string,
  opts: { readonly strict?: boolean; readonly uid?: number | null } = {},
): ScenarioCheck {
  let st;
  try {
    st = lstatSync(file);
  } catch (e) {
    return no(
      (e as NodeJS.ErrnoException).code === "ENOENT"
        ? "the scenario file does not exist"
        : "the scenario file cannot be examined",
    );
  }
  if (st.isSymbolicLink()) return no("the scenario file is a symbolic link");
  if (!st.isFile()) return no("the scenario file is not a regular file");
  if (st.size > MAX_BYTES) return no(`the scenario file is larger than ${MAX_BYTES} bytes`);
  if (opts.strict === true) {
    const uid = opts.uid === undefined ? (process.getuid?.() ?? null) : opts.uid;
    if (uid !== null && st.uid !== uid)
      return no("the scenario file is not owned by the user that runs the service");
    if ((st.mode & 0o022) !== 0)
      return no(
        `the scenario file is writable by its group or by others (mode ${(st.mode & 0o777).toString(8).padStart(3, "0")})`,
      );
  }
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return no("the scenario file is not valid JSON");
  }
  if (v === null || typeof v !== "object" || Array.isArray(v))
    return no("the scenario file is not a JSON object");
  const r = v as Record<string, unknown>;
  const missing = SCENARIO_KEYS.filter((k) => !Object.hasOwn(r, k));
  if (missing.length > 0) return no(`the scenario file lacks: ${missing.join(", ")}`);
  const extra = Object.keys(r).filter((k) => !(SCENARIO_KEYS as readonly string[]).includes(k));
  if (extra.length > 0)
    return no(`the scenario file has keys that are not offered: ${extra.join(", ")}`);
  for (const k of SCENARIO_KEYS) {
    const x = r[k];
    if (typeof x !== "string") return no(`the scenario value for ${k} is not text`);
    if (!(k === "quantity_unit" ? UNIT : ID).test(x))
      return no(
        `the scenario value for ${k} is not a valid ${k === "quantity_unit" ? "unit" : "identity"}`,
      );
  }
  return { ok: true, scenario: r as unknown as Scenario };
}

/** The service's read: the scenario, or null (the collection tools then fail closed with one cause-free text). */
export function readScenario(file: string): Scenario | null {
  const c = checkScenarioFile(file);
  return c.ok ? c.scenario : null;
}
