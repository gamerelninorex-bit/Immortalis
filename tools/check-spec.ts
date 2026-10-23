import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { renderSpecIdentity } from "./gen-spec-identity.ts";

const IDENTITY_MODULE = "packages/contracts/src/spec-identity.ts";

const STATUSES = ["NOT_IMPLEMENTED", "BLOCKED", "UNRUN", "PASS", "FAIL", "NOT_APPLICABLE"];
const REQUIRED_GATES = [
  ...Array.from({ length: 11 }, (_, i) => `CAL-${String(i + 1).padStart(2, "0")}`),
  "L-26",
  "L-29",
  "L-30",
  "L-31",
  "L-32",
  "L-41",
  "L-43",
  "L-48",
  "L-50",
  "L-59",
  "OB-015",
  "OB-016",
  "MIG-01..MIG-10",
  "PROVIDER",
  "DEPLOYMENT",
  "PF-6/F-028",
];
/**
 * Implementation-authority addenda the lock must pin, by id, at their exact native pin. An addendum COMPOSES with the
 * package it names (F-027 v1.0 + the addendum); it never rewrites or silently supersedes it.
 */
export const REQUIRED_ADDENDA: Readonly<Record<string, string>> = {
  "F-027-CD1": "2026-10-02T15:11:03.450Z",
};
/**
 * R1 Stage-One v1.1 section-scoped DESIGN lineage the lock records (23 October 2026), by id. A design-lineage successor says that named
 * sections of an already-frozen source (or of an existing governance source) are Sovereign-ratified; it is never executable authority and
 * never replaces, narrows or supersedes a frozen pin. `of` is the frozen source id the page extends, or null for a governance source.
 */
export const REQUIRED_DESIGN_LINEAGE: Readonly<
  Record<string, { of: string | null; url: string; pin: string; sections: number }>
> = {
  "R1-WG-LINEAGE": {
    of: "WG",
    url: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
    pin: "2026-10-23T06:19:21.435Z",
    sections: 2,
  },
  "R1-TEMPORAL-LINEAGE": {
    of: "F-014B",
    url: "https://app.notion.com/p/3e020af901e081fb88e9f691748db990",
    pin: "2026-10-23T06:19:22.288Z",
    sections: 2,
  },
  "R1-EPISTEMIC-LINEAGE": {
    of: "F-014D",
    url: "https://app.notion.com/p/3e020af901e08103b81aec5f7119318e",
    pin: "2026-10-23T06:20:01.146Z",
    sections: 2,
  },
  // a governance-source page with no F-027 frozen-source entry: it is never added to the frozen pins or the addenda
  "R1-PC-CUSTODY-LINEAGE": {
    of: null,
    url: "https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d",
    pin: "2026-10-23T06:20:02.171Z",
    sections: 1,
  },
};

/**
 * The executable lowerings the lock records, by id: an executable lowering composes with the F-027 package, cites the design lineage it
 * lowers and names its exact native pin. It is the only recorded executable authority for what it lowers.
 */
export const REQUIRED_EXECUTABLE_LOWERINGS: Readonly<
  Record<string, { url: string; pin: string; kinds: readonly string[]; lineage: readonly string[] }>
> = {
  "R1-STAGE-ONE-V1.1-LOWERING": {
    url: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
    pin: "2026-10-23T09:27:39.157Z",
    kinds: ["actor_setup_placement", "world_setup_closure", "actor_physical_presence"],
    lineage: Object.keys({
      "R1-WG-LINEAGE": 0,
      "R1-TEMPORAL-LINEAGE": 0,
      "R1-EPISTEMIC-LINEAGE": 0,
      "R1-PC-CUSTODY-LINEAGE": 0,
    }),
  },
};
const pad = (n: number) => String(n).padStart(2, "0");
const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${pad(i + 1)}`);

export const REQUIRED_ACCEPTANCE_IDS = [...range("V", 14), ...range("IA", 30)];

export function hashFile(path: string): string {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

type Row = {
  id?: unknown;
  status?: unknown;
  evidence?: unknown;
  partial_evidence?: { scope?: unknown; tests?: unknown };
};
type Gate = { id?: unknown; status?: unknown };

/** Returns a list of consistency errors; an empty list means the spec snapshot is internally consistent. */
export function checkSpec(root: string): string[] {
  const errors: string[] = [];
  const at = (rel: string) => join(root, rel);
  const read = (rel: string) => readFileSync(at(rel), "utf8");

  let lock: {
    snapshot_files?: Record<string, string>;
    frozen_sources?: unknown[];
    package?: { version?: string; native_pin?: string };
    implementation_authority_addenda?: {
      id?: unknown;
      url?: unknown;
      native_pin?: unknown;
      relation?: unknown;
      supersedes?: unknown;
      superseded_by?: unknown;
      composed_with?: { id?: unknown; version?: unknown; package_native_pin?: unknown };
    }[];
    design_lineage_successors?: Record<string, unknown>[];
    executable_lowerings?: Record<string, unknown>[];
    supersedes?: unknown;
    superseded_by?: unknown;
  };
  try {
    lock = JSON.parse(read("spec/f027/spec-lock.json"));
  } catch (e) {
    return [`spec-lock.json unreadable: ${(e as Error).message}`];
  }

  if (!lock.package?.native_pin) errors.push("spec-lock.json: package.native_pin missing");
  if (!Array.isArray(lock.frozen_sources) || lock.frozen_sources.length !== 23) {
    errors.push("spec-lock.json: frozen_sources must list exactly the 23 frozen entrypoints");
  }

  const addenda = lock.implementation_authority_addenda ?? [];
  for (const [id, pin] of Object.entries(REQUIRED_ADDENDA)) {
    const matches = addenda.filter((a) => a.id === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: implementation authority addendum ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const a = matches[0]!;
    if (a.native_pin !== pin) errors.push(`spec-lock.json: ${id} must be pinned at exactly ${pin}`);
    if (typeof a.url !== "string" || a.url.length === 0)
      errors.push(`spec-lock.json: ${id} has no url`);
    if (a.relation !== "COMPOSES_WITH")
      errors.push(`spec-lock.json: ${id} must COMPOSE with F-027, not replace it`);
    if (a.supersedes !== null || a.superseded_by !== null) {
      errors.push(
        `spec-lock.json: ${id} may not supersede or be superseded (historical F-027 v1.0 stays authoritative)`,
      );
    }
    const w = a.composed_with;
    if (
      w?.id !== "F-027" ||
      w.version !== lock.package?.version ||
      w.package_native_pin !== lock.package?.native_pin
    ) {
      errors.push(
        `spec-lock.json: ${id} must name the F-027 package version and native pin it composes with`,
      );
    }
  }
  for (const a of addenda) {
    if (typeof a.id !== "string" || !(a.id in REQUIRED_ADDENDA)) {
      errors.push(`spec-lock.json: unexpected implementation authority addendum ${String(a.id)}`);
    }
  }
  if (addenda.length > 0 && (lock.supersedes != null || lock.superseded_by != null)) {
    errors.push(
      "spec-lock.json: the F-027 package is composed with its addenda and may not be superseded",
    );
  }

  // -- R1 Stage-One v1.1: section-scoped design lineage and the executable lowering, kept apart ---------------------------------
  const frozenById = new Map(
    (lock.frozen_sources as { id?: string; url?: string; native_pin?: string }[] | undefined)?.map(
      (f) => [f.id ?? "", f] as const,
    ) ?? [],
  );
  const lineage = lock.design_lineage_successors ?? [];
  for (const [id, want] of Object.entries(REQUIRED_DESIGN_LINEAGE)) {
    const matches = lineage.filter((e) => e["id"] === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: design lineage ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const e = matches[0]!;
    if (e["url"] !== want.url)
      errors.push(`spec-lock.json: design lineage ${id} must name ${want.url}`);
    if (e["native_pin"] !== want.pin)
      errors.push(`spec-lock.json: design lineage ${id} must be pinned at exactly ${want.pin}`);
    if (e["status"] !== "DESIGN_RATIFIED" || e["executable"] !== false)
      errors.push(`spec-lock.json: design lineage ${id} is DESIGN_RATIFIED and never executable`);
    if (
      e["narrows_frozen_pin"] !== false ||
      e["supersedes"] !== null ||
      e["superseded_by"] !== null
    )
      errors.push(
        `spec-lock.json: design lineage ${id} may not supersede or narrow any frozen pin`,
      );
    if (
      !Array.isArray(e["sections"]) ||
      e["sections"].length !== want.sections ||
      !e["sections"].every((t) => typeof t === "string" && t.length > 0)
    )
      errors.push(
        `spec-lock.json: design lineage ${id} must list its ${want.sections} exact section title(s)`,
      );
    if (e["of_frozen_source"] !== want.of)
      errors.push(`spec-lock.json: design lineage ${id} extends ${String(want.of)}`);
    if (want.of === null) {
      // a governance-source page is never promoted into the frozen pins or the implementation-authority addenda
      if ([...frozenById.values()].some((f) => f.url === want.url))
        errors.push(`spec-lock.json: ${id} may not be promoted into the frozen sources`);
      if (addenda.some((a) => a.url === want.url))
        errors.push(
          `spec-lock.json: ${id} may not be promoted into the implementation authority addenda`,
        );
    }
    if (want.of !== null) {
      const frozen = frozenById.get(want.of);
      if (!frozen || frozen.url !== want.url)
        errors.push(
          `spec-lock.json: design lineage ${id} must extend the frozen ${want.of} page, whose own pin stays unchanged`,
        );
      else if (frozen.native_pin === e["native_pin"])
        errors.push(
          `spec-lock.json: design lineage ${id} may not restate the frozen pin as its own`,
        );
    }
  }
  for (const e of lineage) {
    if (typeof e["id"] !== "string" || !(e["id"] in REQUIRED_DESIGN_LINEAGE))
      errors.push(`spec-lock.json: unexpected design lineage ${String(e["id"])}`);
  }
  const lowerings = lock.executable_lowerings ?? [];
  for (const [id, want] of Object.entries(REQUIRED_EXECUTABLE_LOWERINGS)) {
    const matches = lowerings.filter((e) => e["id"] === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: executable lowering ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const e = matches[0]!;
    if (e["url"] !== want.url)
      errors.push(`spec-lock.json: executable lowering ${id} must name ${want.url}`);
    if (e["native_pin"] !== want.pin)
      errors.push(
        `spec-lock.json: executable lowering ${id} must be pinned at exactly ${want.pin}`,
      );
    if (e["status"] !== "FROZEN_EXECUTABLE_LOWERING" || e["executable"] !== true)
      errors.push(`spec-lock.json: ${id} is the frozen executable lowering`);
    if (
      e["relation"] !== "COMPOSES_WITH" ||
      e["supersedes"] !== null ||
      e["superseded_by"] !== null
    )
      errors.push(`spec-lock.json: ${id} must COMPOSE with F-027, never replace it`);
    const w = e["composed_with"] as {
      id?: unknown;
      version?: unknown;
      package_native_pin?: unknown;
    };
    if (
      w?.id !== "F-027" ||
      w.version !== lock.package?.version ||
      w.package_native_pin !== lock.package?.native_pin
    )
      errors.push(
        `spec-lock.json: ${id} must name the F-027 package version and native pin it composes with`,
      );
    if (JSON.stringify(e["cites_design_lineage"]) !== JSON.stringify(want.lineage))
      errors.push(`spec-lock.json: ${id} must cite exactly the design lineage it lowers`);
    if (JSON.stringify(e["fact_kinds"]) !== JSON.stringify(want.kinds))
      errors.push(`spec-lock.json: ${id} must name exactly its fact kinds`);
  }
  for (const e of lowerings) {
    if (typeof e["id"] !== "string" || !(e["id"] in REQUIRED_EXECUTABLE_LOWERINGS))
      errors.push(`spec-lock.json: unexpected executable lowering ${String(e["id"])}`);
  }

  const snapshot = lock.snapshot_files ?? {};
  for (const rel of [
    "spec/f027/runtime-contract.md",
    "spec/f027/acceptance-register.yaml",
    "spec/f027/open-gates.yaml",
  ]) {
    const expected = snapshot[rel];
    if (!expected) errors.push(`spec-lock.json: no hash recorded for ${rel}`);
    else if (expected !== hashFile(at(rel))) {
      errors.push(`spec-lock.json: hash mismatch for ${rel} (snapshot edited without lock update)`);
    }
  }

  const contract = read("spec/f027/runtime-contract.md");
  for (const id of range("RC", 16)) {
    if (!new RegExp(`^## ${id} — `, "m").test(contract)) {
      errors.push(`runtime-contract.md: missing heading for ${id}`);
    }
  }
  for (const id of range("IM", 17)) {
    if (!new RegExp(`^\\| ${id} `, "m").test(contract)) {
      errors.push(`runtime-contract.md: missing IM map row for ${id}`);
    }
  }

  const register = parse(read("spec/f027/acceptance-register.yaml")) as { rows?: Row[] };
  const seen = new Map<string, number>();
  for (const row of register.rows ?? []) {
    const id = String(row.id);
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (typeof row.status !== "string" || !STATUSES.includes(row.status)) {
      errors.push(`acceptance-register.yaml: ${id} has invalid status ${String(row.status)}`);
    }
    if (row.partial_evidence !== undefined) {
      const { scope, tests } = row.partial_evidence;
      if (typeof scope !== "string" || scope.length === 0) {
        errors.push(`acceptance-register.yaml: ${id} partial_evidence needs a scope statement`);
      }
      if (!Array.isArray(tests) || tests.length === 0) {
        errors.push(`acceptance-register.yaml: ${id} partial_evidence needs at least one test`);
      } else {
        for (const t of tests) {
          if (typeof t !== "string" || !existsSync(at(t))) {
            errors.push(
              `acceptance-register.yaml: ${id} partial_evidence test not found: ${String(t)}`,
            );
          }
        }
      }
    }
    if ((row.status === "PASS" || row.status === "FAIL") && !row.evidence) {
      errors.push(`acceptance-register.yaml: ${id} is ${String(row.status)} without evidence`);
    }
  }
  for (const id of REQUIRED_ACCEPTANCE_IDS) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) errors.push(`acceptance-register.yaml: ${id} appears ${n} times (expected 1)`);
  }
  for (const id of seen.keys()) {
    if (!REQUIRED_ACCEPTANCE_IDS.includes(id)) {
      errors.push(`acceptance-register.yaml: unexpected row ${id}`);
    }
  }

  const gates = parse(read("spec/f027/open-gates.yaml")) as { gates?: Gate[] };
  const gateIds = new Set<string>();
  for (const gate of gates.gates ?? []) {
    gateIds.add(String(gate.id));
    if (typeof gate.status !== "string" || gate.status.length === 0) {
      errors.push(`open-gates.yaml: ${String(gate.id)} has no status`);
    } else if (/^(PASS|RESOLVED|CLOSED)/.test(gate.status)) {
      errors.push(
        `open-gates.yaml: ${String(gate.id)} claims ${gate.status}; bootstrap resolves no gate`,
      );
    }
  }
  for (const id of REQUIRED_GATES) {
    if (!gateIds.has(id)) errors.push(`open-gates.yaml: missing gate ${id}`);
  }

  // The generated build identity must match the lock it claims to mirror.
  try {
    if (readFileSync(at(IDENTITY_MODULE), "utf8") !== renderSpecIdentity(root)) {
      errors.push(
        `${IDENTITY_MODULE} is out of date with spec-lock.json (run tools/gen-spec-identity.ts)`,
      );
    }
  } catch (e) {
    errors.push(`${IDENTITY_MODULE} unreadable: ${(e as Error).message}`);
  }

  return errors;
}

/** Rewrites the snapshot hashes in spec-lock.json (a substantive change; review the diff). */
export async function writeHashes(root: string): Promise<void> {
  const path = join(root, "spec/f027/spec-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  for (const rel of Object.keys(lock.snapshot_files)) {
    lock.snapshot_files[rel] = hashFile(join(root, rel));
  }
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.includes("--write-hashes")) {
    await writeHashes(root);
    writeFileSync(join(root, IDENTITY_MODULE), renderSpecIdentity(root));
    console.log("spec-lock.json snapshot hashes and generated build spec identity updated");
  }
  const errors = checkSpec(root);
  if (errors.length > 0) {
    console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
    console.error(`spec check FAILED (${errors.length})`);
    process.exit(1);
  }
  console.log("spec check OK: spec-lock, acceptance register and open gates are consistent");
}
