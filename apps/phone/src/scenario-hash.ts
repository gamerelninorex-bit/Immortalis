import { createHash } from "node:crypto";
import { canonicalJson } from "@immortalis/contracts";

/** The identity of a value as the canonical-JSON SHA-256 (used to bind a delayed action to the exact installed Scenario). */
export const sha256Of = (v: unknown): string =>
  createHash("sha256").update(canonicalJson(v), "utf8").digest("hex");
