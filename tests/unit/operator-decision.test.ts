import { describe, expect, it } from "vitest";
import {
  consumeConfirmation,
  requestOperatorDecision,
  type OperatorConfirmation,
  type OperatorTerminal,
} from "@immortalis/operator";

const CHALLENGE = /To confirm, type exactly "([^"]+)"/;
function terminal(reply: (phrase: string) => string | null): OperatorTerminal & { said: string[] } {
  const said: string[] = [];
  return {
    said,
    say: (t) => void said.push(t),
    ask: async () =>
      reply(
        said
          .map((l) => CHALLENGE.exec(l)?.[1])
          .filter(Boolean)
          .at(-1)!,
      ),
    close: () => undefined,
  };
}

describe("the console decision with one other lawful answer (keep or revise)", () => {
  it("confirms only the verb and the fresh challenge just printed, as a one-time token bound to its verb and subject", async () => {
    const t = terminal((p) => p);
    const d = await requestOperatorDecision(
      t,
      "keep-character",
      "subject-1",
      ["shown"],
      'Or type "change".',
    );
    expect(d.kind).toBe("CONFIRMED");
    if (d.kind !== "CONFIRMED") return;
    expect(t.said.at(-1)).toMatch(
      /^To confirm, type exactly "keep-character [0-9a-f]{12}"\. Or type "change"\.$/,
    );
    expect(consumeConfirmation(d.confirmation, "place-character", "subject-1")).toBe(false);
    expect(consumeConfirmation(d.confirmation, "keep-character", "subject-2")).toBe(false);
    expect(consumeConfirmation(d.confirmation, "keep-character", "subject-1")).toBe(true);
    expect(consumeConfirmation(d.confirmation, "keep-character", "subject-1")).toBe(false);
  });

  it("returns any other line untouched and never as a confirmation; end of input is reported as such", async () => {
    for (const line of ["change", "no", "", "keep-character 000000000000", "keep-character"]) {
      const d = await requestOperatorDecision(
        terminal(() => line),
        "keep-character",
        "s",
        [],
        "x",
      );
      expect(d).toEqual({ kind: "LINE", line });
    }
    expect(
      await requestOperatorDecision(
        terminal(() => null),
        "keep-character",
        "s",
        [],
        "x",
      ),
    ).toEqual({
      kind: "END_OF_INPUT",
    });
  });

  it("draws a fresh challenge for every display, and a phrase from an earlier display does not match", async () => {
    const seen: string[] = [];
    const first = await requestOperatorDecision(
      terminal((p) => (seen.push(p), "change")),
      "keep-character",
      "s",
      [],
      "x",
    );
    expect(first.kind).toBe("LINE");
    const second = await requestOperatorDecision(
      terminal((p) => (seen.push(p), seen[0]!)),
      "keep-character",
      "s",
      [],
      "x",
    );
    expect(seen[0]).not.toBe(seen[1]);
    expect(second.kind).toBe("LINE");
  });

  it("an object a caller writes is not a confirmation", () => {
    const forged: OperatorConfirmation = Object.freeze({ verb: "keep-character", subject: "s" });
    expect(consumeConfirmation(forged, "keep-character", "s")).toBe(false);
  });
});
