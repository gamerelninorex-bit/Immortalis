// The ORIGIN of canonical time (NEWLY AUTHORIZED by the Sovereign's bounded semantic delegation; independent BLUE review pending): the one
// operator module that may call `establishCanonicalTime` is bound by this narrower check. It writes the author's own stated coordinate,
// once, only after an owner-verified file and the operator's separate confirmation; it has no default epoch, no clock and no random value,
// and nothing a collection (or any result) could supply.
import { describe, expect, it } from "vitest";
import { code } from "../support/f027.ts";

const FILE = "packages/operator/src/time-initialization.ts";
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

describe("initialize-time is bound to the author's stated chronology, written once, after confirmation", () => {
  const src = identifiers(FILE);
  const raw = code(FILE);

  it("calls establishCanonicalTime exactly once, and only after the owner-verified file, the existence check and the confirmation", () => {
    expect(src.match(/establishCanonicalTime\(/g)).toHaveLength(1);
    const at = (needle: string) => raw.indexOf(needle);
    expect(at("readOwnedSetupFile(")).toBeGreaterThan(-1);
    expect(at("readOwnedSetupFile(")).toBeLessThan(at("requestOperatorConfirmation("));
    expect(at("coordinator.state()")).toBeLessThan(at("requestOperatorConfirmation("));
    expect(at("consumeConfirmation(")).toBeLessThan(at("coordinator.establishCanonicalTime("));
  });

  it("has no default epoch, clock, random value or collection input: the time is the author's, from a strict schema", () => {
    expect(src).not.toMatch(
      /\bDate\b|Date\.now|performance\.|Math\.random|randomUUID|randomBytes|process\.hrtime|defaultEpoch|DEFAULT_|EPOCH|Collection|collect|Reserve|Production/,
    );
    expect(raw).toMatch(/StartingChronologySchema = z\.strictObject\(/);
    expect(raw).toMatch(/time: CanonicalTimeSchema/);
  });

  it("derives its publication identities from the campaign and the exact chronology only, so a retry replays and a different chronology cannot overwrite", () => {
    expect(raw).toMatch(
      /campaign_id: session\.campaignId,\s*time: chronology\.time,\s*statement: chronology\.statement/,
    );
    expect(raw).toMatch(/starting-chronology:\$\{digest\}:intent/);
    expect(raw).toMatch(/canonical time already has another origin/);
  });
});
