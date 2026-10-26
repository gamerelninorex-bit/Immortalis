import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type { PhoneConfig } from "./config.ts";
import {
  parseChronology,
  parseDeclare,
  parseHandling,
  parsePrepare,
  type ChronologyInput,
  type DeclareInput,
  type PrepareInput,
} from "./route-stages.ts";

/**
 * The chat adapter's retained, NONCANONICAL record of the player's own latest INPUTS to the stages that follow the character: the
 * starting moment they stated, their account of one handling cycle, the preparation they offered and the closed-setting declaration they
 * wrote. It exists so that an interruption, a decline or a restart costs the player nothing they already said: a stage is offered again
 * from exactly these words and asks only what is still missing. It is bookkeeping in the operator directory, never an owner fact, never
 * model-readable, and NOT consent: every stage's confirmation is typed only at the trusted terminal, afresh, over what the shipped command
 * shows. Campaign-bound, strictly validated, atomically replaced; a record that cannot be read keeps the route closed (it is never
 * repaired, adopted or deleted by the adapter).
 */
export const ROUTE_RECORD_FORMAT = "immortalis-chat-route-inputs";

export interface RouteRecord {
  readonly format: typeof ROUTE_RECORD_FORMAT;
  readonly format_version: 1;
  readonly campaign_id: string;
  readonly chronology: ChronologyInput | null;
  readonly handling: string | null;
  readonly preparation: PrepareInput | null;
  readonly declaration: DeclareInput | null;
}

export const routeRecordPath = (config: Pick<PhoneConfig, "operatorDir" | "campaignId">): string =>
  join(config.operatorDir, `chat-route.${config.campaignId}.json`);

export const emptyRoute = (config: Pick<PhoneConfig, "campaignId">): RouteRecord => ({
  format: ROUTE_RECORD_FORMAT,
  format_version: 1,
  campaign_id: config.campaignId,
  chronology: null,
  handling: null,
  preparation: null,
  declaration: null,
});

export type RouteRecordRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "UNREADABLE" }
  | { readonly kind: "RECORD"; readonly record: RouteRecord };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function readRouteRecord(
  config: Pick<PhoneConfig, "operatorDir" | "campaignId">,
): RouteRecordRead {
  let text: string;
  try {
    text = readFileSync(routeRecordPath(config), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "NONE" }
      : { kind: "UNREADABLE" };
  }
  try {
    const v: unknown = JSON.parse(text);
    if (
      !record(v) ||
      v["format"] !== ROUTE_RECORD_FORMAT ||
      v["format_version"] !== 1 ||
      v["campaign_id"] !== config.campaignId ||
      Object.keys(v).length !== 7
    )
      return { kind: "UNREADABLE" };
    // every retained input is re-judged by exactly the parser that admitted it: a record is never more than what a tool call could carry
    const take = <T>(
      k: string,
      parse: (a: Record<string, unknown>) => { ok: true; value: T } | { ok: false },
      wrap: (x: unknown) => Record<string, unknown> = (x) => x as Record<string, unknown>,
    ): { ok: true; value: T | null } | { ok: false } => {
      const x = v[k];
      if (x === null) return { ok: true, value: null };
      if (x === undefined) return { ok: false };
      const parsed = parse(wrap(x));
      return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
    };
    const chronology = take("chronology", parseChronology);
    const handling = take("handling", parseHandling, (x) => ({ words: x }));
    const preparation = take("preparation", parsePrepare);
    const declaration = take("declaration", parseDeclare);
    if (!chronology.ok || !handling.ok || !preparation.ok || !declaration.ok)
      return { kind: "UNREADABLE" };
    return {
      kind: "RECORD",
      record: {
        format: ROUTE_RECORD_FORMAT,
        format_version: 1,
        campaign_id: config.campaignId,
        chronology: chronology.value,
        handling: handling.value,
        preparation: preparation.value,
        declaration: declaration.value,
      },
    };
  } catch {
    return { kind: "UNREADABLE" };
  }
}

/** Atomic replace (write a sibling, fsync, rename): a reader sees the old record or the new one, never a torn one. false = not retained. */
export function writeRouteRecord(
  config: Pick<PhoneConfig, "operatorDir" | "campaignId">,
  r: RouteRecord,
): boolean {
  const target = routeRecordPath(config);
  const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(r)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, target);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      // nothing more to do: the record was not retained
    }
    return false;
  }
}

/** Retains one input (the others kept as they are); false when it could not be retained, or the record is unreadable. */
export function retainInput(
  config: Pick<PhoneConfig, "operatorDir" | "campaignId">,
  change: Partial<Pick<RouteRecord, "chronology" | "handling" | "preparation" | "declaration">>,
): boolean {
  const held = readRouteRecord(config);
  if (held.kind === "UNREADABLE") return false;
  const base = held.kind === "RECORD" ? held.record : emptyRoute(config);
  return writeRouteRecord(config, { ...base, ...change });
}

/** Drops the retained inputs of stages that are complete; the record is removed once nothing is left to retain. */
export function dropInputs(
  config: Pick<PhoneConfig, "operatorDir" | "campaignId">,
  which: readonly ("chronology" | "handling" | "preparation" | "declaration")[],
): boolean {
  const held = readRouteRecord(config);
  if (held.kind === "NONE") return true;
  if (held.kind === "UNREADABLE") return false;
  const next: RouteRecord = {
    ...held.record,
    ...Object.fromEntries(which.map((k) => [k, null])),
  };
  const empty =
    next.chronology === null &&
    next.handling === null &&
    next.preparation === null &&
    next.declaration === null;
  if (!empty) return writeRouteRecord(config, next);
  try {
    rmSync(routeRecordPath(config), { force: true });
    return true;
  } catch {
    return false;
  }
}
