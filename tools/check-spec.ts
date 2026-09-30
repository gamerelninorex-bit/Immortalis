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
    package?: { native_pin?: string };
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
