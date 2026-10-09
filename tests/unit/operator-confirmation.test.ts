import { describe, expect, it } from "vitest";
import {
  consumeConfirmation,
  requestOperatorConfirmation,
  subjectOf,
  type OperatorConfirmation,
  type OperatorTerminal,
} from "@immortalis/operator";

const CHALLENGE = /To confirm, type exactly "([^"]+)"/;

/** A console whose reply is chosen from the printed phrase, and which records what it was shown. */
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

const request = (t: OperatorTerminal, verb: "relocate" | "advance" = "relocate", subject = "s") =>
  requestOperatorConfirmation(t, verb, subject, ["shown"]);

describe("the operator's explicit, bounded confirmation", () => {
  it("accepts exactly the verb and the fresh challenge just printed, typed back on the next line", async () => {
    const t = terminal((phrase) => phrase);
    const token = await request(t);
    expect(token).not.toBeNull();
    expect(t.said[0]).toBe("shown");
    expect(t.said.at(-1)).toMatch(
      /^To confirm, type exactly "relocate [0-9a-f]{12}"\. Anything else declines\.$/,
    );
  });

  it("tolerates only surrounding whitespace", async () => {
    expect(await request(terminal((p) => `  ${p}\t`))).not.toBeNull();
  });

  it("declines everything else: other words, another verb, a wrong or old challenge, case changes, extra text, empty lines and the end of input", async () => {
    const wrong: ((p: string) => string | null)[] = [
      () => "yes",
      () => "y",
      () => "confirm",
      () => "relocate",
      () => "",
      () => "   ",
      () => null,
      (p) => p.toUpperCase(),
      (p) => p.replace(/^relocate/, "advance"),
      (p) => `${p} please`,
      (p) => `${p}\n${p}`,
      (p) => p.slice(0, -1),
      (p) => p.replace(/[0-9a-f]$/, (c) => (c === "0" ? "1" : "0")),
      () => "relocate 000000000000",
    ];
    for (const reply of wrong) expect(await request(terminal(reply))).toBeNull();
  });

  it("uses a fresh unpredictable challenge each time and a different verb for the other choice", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t = terminal((p) => (seen.add(p), p));
      await request(t, i % 2 ? "advance" : "relocate");
    }
    expect(seen.size).toBe(20);
    expect([...seen].filter((p) => p.startsWith("advance ")).length).toBe(10);
  });

  it("a challenge replayed from an earlier prompt never confirms a later one", async () => {
    let first = "";
    await request(terminal((p) => ((first = p), p)));
    expect(await request(terminal(() => first))).toBeNull();
  });

  it("issues a token that is consumed once, only for the verb and the exact subject it was shown for", async () => {
    const subject = subjectOf({ a: 1 });
    const mint = async (): Promise<OperatorConfirmation> =>
      (await request(
        terminal((p) => p),
        "relocate",
        subject,
      ))!;
    const token = await mint();
    expect(consumeConfirmation(token, "advance", subject)).toBe(false);
    expect(consumeConfirmation(token, "relocate", subjectOf({ a: 2 }))).toBe(false);
    expect(consumeConfirmation(token, "relocate", subject)).toBe(true);
    expect(consumeConfirmation(token, "relocate", subject)).toBe(false);
  });

  it("a hand-made token is not a confirmation: only this module's own issue counts", () => {
    const forged = { verb: "relocate", subject: "s" } as OperatorConfirmation;
    expect(consumeConfirmation(forged, "relocate", "s")).toBe(false);
    expect(consumeConfirmation(Object.freeze({ ...forged }), "relocate", "s")).toBe(false);
  });
});
