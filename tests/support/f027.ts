import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

/**
 * Shared test-side readers for the F-027 evidence files (spec lock, acceptance register, open gates) and for the
 * production source text that conformance suites scan.
 *
 * These are plumbing only: they read the committed files and return them unchanged. They carry no expectation. Every
 * assertion about what the lock, register or gates must say stays in the conformance suite that owns that claim.
 */

export interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
  governance_references: { title: string; url: string; native_pin: string }[];
  incorporated_tranches: { title: string; url: string; native_pin: string }[];
  snapshot_files: Record<string, string>;
}

export type Row = {
  id: string;
  status: string;
  evidence: unknown;
  partial_evidence?: { scope: string; tests: string[] };
};

export const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Lock;

export const register = (
  parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as { rows: Row[] }
).rows;

export const gates = (
  parse(readFileSync("spec/f027/open-gates.yaml", "utf8")) as {
    gates: { id: string; status: string }[];
  }
).gates;

/** Source with comments removed, so that prose explaining a prohibition is not mistaken for code. */
export const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

export const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
