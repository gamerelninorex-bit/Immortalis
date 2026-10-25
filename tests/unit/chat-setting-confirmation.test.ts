/* eslint-disable @typescript-eslint/no-explicit-any -- tests build raw setting documents */
// The pieces that make the human's review of an ORIGINAL setting complete: the confirmation is split into ordered parts without losing a
// character, it is judged whole or refused, and the retained document identity binds one campaign and one exact document.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalitySetupSchema, establishLocality, localitySetupId } from "@immortalis/operator";
import {
  LOCALITY_CONFIRMATION_FIRST,
  LOCALITY_CONFIRMATION_LAST,
} from "../../apps/phone/src/locality-evidence.ts";
import {
  completeSetupConfirmation,
  fitsConfirmation,
  splitConfirmation,
} from "../../apps/phone/src/chat-tools.ts";
import { captureSetup, validSetupIdentity } from "../../apps/phone/src/setup-recovery.ts";
import { createWebTerminal } from "../../apps/phone/src/web-terminal.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import type { Run } from "../../apps/phone/src/runs.ts";
import { courtyard } from "../support/chat-setting.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-unit";
const runOf = (): Run => ({
  id: "r",
  label: "establish-locality",
  terminal: createWebTerminal(),
  done: false,
  uncertain: false,
});
const present = (run: Run, lines: readonly string[]) => {
  for (const l of lines) run.terminal.say(l);
  run.terminal.say(
    'To confirm, type exactly "establish-locality 0123456789ab". Anything else declines.',
  );
  void run.terminal.ask(">");
};
/** exactly what the SHIPPED command shows the human to confirm this setting (read from a real run that is then declined) */
async function shown(doc: any = courtyard()): Promise<string[]> {
  const root = tempDir("immortalis-unit-confirmation-");
  chmodSync(root, 0o700);
  const file = join(root, "setup.json");
  writeFileSync(file, JSON.stringify(doc), { mode: 0o600 });
  const terminal = scriptedTerminal("decline");
  await establishLocality({
    campaignDir: join(root, "campaign"),
    campaignId: CAMPAIGN,
    setupFile: file,
    operatorDir: join(root, "operator"),
    terminal,
  });
  return terminal.said.slice(
    0,
    terminal.said.findIndex((l) => l.startsWith("To confirm, type exactly")),
  );
}

describe("splitConfirmation never loses or reorders a character", () => {
  const restore = (parts: string[], body: string) => {
    // a part cut at a line end is followed by one newline; a hard cut by nothing
    let at = 0;
    let out = "";
    for (const [i, p] of parts.entries()) {
      out += p;
      at += p.length;
      if (i < parts.length - 1 && body[at] === "\n") {
        out += "\n";
        at += 1;
      }
    }
    return out;
  };
  it("cuts at line ends, hard-cuts an overlong line, and never splits a surrogate pair", () => {
    const pair = "😀";
    const bodies = [
      "short",
      Array.from({ length: 400 }, (_, i) => `line ${i} ${"y".repeat(40)}`).join("\n"),
      "z".repeat(5_000),
      `${"a".repeat(999)}${pair.repeat(3_000)}`,
      `${"a\n".repeat(30)}${"b".repeat(5_000)}\n${"c\n".repeat(30)}`,
    ];
    for (const body of bodies)
      for (const size of [10, 64, 1_000]) {
        const parts = splitConfirmation(body, size);
        expect(parts.every((p) => p.length <= size)).toBe(true);
        expect(restore(parts, body)).toBe(body);
        for (const p of parts) {
          expect(p.charCodeAt(p.length - 1) >= 0xd800 && p.charCodeAt(p.length - 1) <= 0xdbff).toBe(
            false,
          );
        }
      }
  });
});

describe("completeSetupConfirmation judges the transcript whole or refuses it", () => {
  it("returns every line of a complete confirmation, in order", async () => {
    const run = runOf();
    const lines = await shown();
    present(run, lines);
    const parts = completeSetupConfirmation(run)!;
    expect(parts).not.toBeNull();
    const all = parts.join("\n");
    for (const l of lines) if (l.trim() !== "") expect(all).toContain(l);
    expect(all.indexOf(LOCALITY_CONFIRMATION_FIRST)).toBeLessThan(
      all.indexOf(LOCALITY_CONFIRMATION_LAST),
    );
    expect(all).toMatch(/type exactly "establish-locality 0123456789ab"/);
  });

  it("refuses a transcript whose earliest lines were dropped, or one cut short of its closing line", async () => {
    const lines = await shown();
    const dropped = runOf();
    for (let i = 0; i < 2_100; i++) dropped.terminal.say(`filler ${i}`);
    present(dropped, lines);
    expect(completeSetupConfirmation(dropped)).toBeNull();

    const cut = runOf();
    present(cut, lines.slice(0, -3));
    expect(completeSetupConfirmation(cut)).toBeNull();

    const headless = runOf();
    present(headless, lines.slice(2));
    expect(completeSetupConfirmation(headless)).toBeNull();
  });

  it("judges only the lines since the last reply", async () => {
    const run = runOf();
    run.terminal.say("an earlier prompt");
    const asked = run.terminal.ask(">");
    const id = run.terminal.snapshot(0).pending!.id;
    run.terminal.reply(id, "no");
    void asked;
    present(run, await shown());
    expect(completeSetupConfirmation(run)).not.toBeNull();
  });
});

describe("the markers a front end uses to prove it holds the whole confirmation are the shipped command's own", () => {
  it("the real confirmation opens its block with the header and closes it with the closing line, directly before the challenge", async () => {
    const lines = await shown();
    expect(lines).toContain(LOCALITY_CONFIRMATION_FIRST);
    expect(lines.at(-1)).toBe(LOCALITY_CONFIRMATION_LAST);
    expect(lines.indexOf(LOCALITY_CONFIRMATION_FIRST)).toBeLessThan(lines.length - 1);
  });
});

describe("a setting too long to show whole is recognised before anything starts", () => {
  it("fits an ordinary setting and refuses one with more separate entries than the transcript can hold", () => {
    expect(fitsConfirmation(LocalitySetupSchema.parse(courtyard()))).toBe(true);
    const many = courtyard();
    many.locus.constraints = Array.from({ length: 1_960 }, () => ({ aspect: "a", statement: "s" }));
    expect(fitsConfirmation(LocalitySetupSchema.parse(many))).toBe(false);
    const wide = courtyard();
    wide.world.premise = "p".repeat(60_000); // one long entry: split across a few transcript lines, still whole
    expect(fitsConfirmation(LocalitySetupSchema.parse(wide))).toBe(true);
  });
});

describe("the retained identity of an original setting binds one campaign and one exact document", () => {
  const config = (campaignId = CAMPAIGN): PhoneConfig => ({ campaignId }) as PhoneConfig;
  const file = (text: string) => {
    const dir = tempDir("immortalis-setting-identity-");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "setup.json");
    writeFileSync(path, text);
    return path;
  };
  it("is captured from the document, validated, and refused when the document, campaign or digest differs", () => {
    const document = JSON.stringify(courtyard());
    const id = captureSetup(config(), "establish-locality", file(document))!;
    expect(id).toMatchObject({ command: "establish-locality", document });
    expect(id.publication_digest).toBe(
      localitySetupId(CAMPAIGN, LocalitySetupSchema.parse(courtyard())),
    );
    expect(validSetupIdentity(config(), "establish-locality", id)).toBe(true);
    expect(validSetupIdentity(config("another-campaign"), "establish-locality", id)).toBe(false);
    expect(validSetupIdentity(config(), "initialize-time", id)).toBe(false);
    expect(
      validSetupIdentity(config(), "establish-locality", { ...id, document: `${document} ` }),
    ).toBe(false);
    expect(
      validSetupIdentity(config(), "establish-locality", {
        ...id,
        publication_digest: "0".repeat(32),
      }),
    ).toBe(false);
    expect(
      validSetupIdentity(config(), "establish-locality", {
        ...id,
        document_sha256: "0".repeat(64),
      }),
    ).toBe(false);
  });
  it("captures nothing from a document that is not a strict original setup", () => {
    const extra = { ...courtyard(), confirmed: true };
    expect(captureSetup(config(), "establish-locality", file(JSON.stringify(extra)))).toBeNull();
    expect(captureSetup(config(), "establish-locality", file("{ not json"))).toBeNull();
    const other = courtyard();
    other.world.reference_causal_basis.mode = "FACTUAL";
    expect(captureSetup(config(), "establish-locality", file(JSON.stringify(other)))).toBeNull();
  });
});
