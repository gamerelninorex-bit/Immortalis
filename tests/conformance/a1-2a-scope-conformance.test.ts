// F-014B A1-2a scope, import, write-freedom and labelling conformance (the authenticated configured-GM waiting ingress; MECHANISM ONLY, NON-WRITING).
// This file judges no behaviour (the integration suites do); it checks that the slice added exactly the paths its table declares, changed no
// forbidden file, uses no writer, invents no permission, and labels itself.
//
//   scope    the declared paths exist; they are the only source change under apps/ or packages/; every new one is absent from the base commit
//   forbid   every file and tree the brief forbids is byte-identical to the base commit, tracked or not
//   nowrite  the ingress and the tool import and call no writer of canon, time, journal or retained state; the exchange writes only through the
//            existing request-host binding; no new permission string or generic GM writer exists
//   b0       the unexported B0 module is imported by exactly the declared production files, and still not exported from the contracts index
//   labels   every A1-2a test title says what it is and that it is mechanism only
//
// Custody is bytes at the pinned base commit, never ancestry. Where that commit is not retrievable (a shallow checkout) the comparisons are
// SKIPPED and reported as skipped, never claimed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A1_2A_B0_PRODUCTION_USERS,
  A1_2A_BASE_COMMIT,
  A1_2A_CHANGED_PRODUCTION_PATHS,
  A1_2A_LITERAL_FILES,
  A1_2A_NEW_PRODUCTION_PATHS,
  A1_2A_PACKAGE_PATHS,
  A1_2A_UNTOUCHED,
} from "../support/a1-2a-scoped-deltas.ts";
import { B1_V2_PACKAGE_PATHS, B1_V2_WORKFLOW_PATH } from "../support/b1-s2s3-scoped-deltas.ts";

const git = (...args: string[]): Buffer | null => {
  try {
    return execFileSync("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};
const lines = (b: Buffer | null): string[] =>
  (b?.toString("utf8") ?? "").split("\n").filter(Boolean);
const baseReachable = git("cat-file", "-e", `${A1_2A_BASE_COMMIT}^{commit}`) !== null;
const changedSince = (...paths: string[]): string[] =>
  lines(git("-c", "core.fileMode=false", "diff", "--name-only", A1_2A_BASE_COMMIT, "--", ...paths));
const untrackedIn = (...paths: string[]): string[] =>
  lines(git("ls-files", "--others", "--exclude-standard", "--", ...paths));
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules"
      ? []
      : e.isDirectory()
        ? walk(join(dir, e.name))
        : [join(dir, e.name)],
  );

/** Strips line and block comments so the code scanners judge code, not prose. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const read = (p: string): string => readFileSync(p, "utf8");
const productionFiles = (): string[] =>
  ["apps", "packages"]
    .flatMap((root) => walk(root))
    .filter((f) => /\.ts$/.test(f) && f.includes("/src/"));

const READ_SIDE = [
  "packages/operator/src/gm-wait-ingress.ts",
  "apps/phone/src/gm-wait-tool.ts",
] as const;

/** Names that write canon, time, the journal, a checkpoint, a keep or any retained file. None may appear in the read side. */
const WRITERS =
  /\b(commit|commitGroup|establishCanonicalTime|TemporalCoordinator|StageProviderRegistry|writeKeep|writeFile|writeFileSync|writeFileDurable|createExclusive|appendFile|appendFileSync|rename|renameSync|unlink|unlinkSync|rmSync|mkdirSync|mkdirp|chmod|chmodSync|linkSync|fsyncSync|openOAuthGrantLedger|register|revoke|revokeGrant)\s*\(/;

describe("[A1-2a] [mechanism only] [scope] declared scope", () => {
  it("[A1-2a] [mechanism only] [scope] every declared path exists, and the table has no duplicate", () => {
    for (const p of A1_2A_PACKAGE_PATHS) expect(existsSync(p), p).toBe(true);
    expect(new Set(A1_2A_PACKAGE_PATHS).size).toBe(A1_2A_PACKAGE_PATHS.length);
  });

  it.skipIf(!baseReachable)(
    "[A1-2a] [mechanism only] [scope] the declared paths are the only source change under apps/ or packages/ (tracked or not), and each new one really is new",
    () => {
      const touched = [...changedSince("apps", "packages"), ...untrackedIn("apps", "packages")];
      expect([...new Set(touched)].sort()).toEqual(
        [...A1_2A_PACKAGE_PATHS, ...B1_V2_PACKAGE_PATHS].sort(),
      );
      for (const p of A1_2A_NEW_PRODUCTION_PATHS)
        expect(git("cat-file", "-e", `${A1_2A_BASE_COMMIT}:${p}`), `${p} is new`).toBeNull();
      for (const p of A1_2A_CHANGED_PRODUCTION_PATHS)
        expect(git("cat-file", "-e", `${A1_2A_BASE_COMMIT}:${p}`), `${p} existed`).not.toBeNull();
    },
  );

  it.skipIf(!baseReachable)(
    "[A1-2a] [mechanism only] [scope] every file and tree the brief forbids is byte-identical to the base commit",
    () => {
      const successorPaths = new Set([...B1_V2_PACKAGE_PATHS, B1_V2_WORKFLOW_PATH]);
      for (const p of A1_2A_UNTOUCHED) {
        expect(
          changedSince(p).filter((x) => !successorPaths.has(x)),
          p,
        ).toEqual([]);
        expect(
          untrackedIn(p).filter((x) => !successorPaths.has(x)),
          p,
        ).toEqual([]);
      }
    },
  );

  it.skipIf(!baseReachable)(
    "[A1-2a] [mechanism only] [scope] the changes to existing production files are additive: no line of the base is removed from the two phone files, ignoring indentation",
    () => {
      for (const p of A1_2A_CHANGED_PRODUCTION_PATHS.filter((x) => x.startsWith("apps/"))) {
        const numstat = lines(
          git("-c", "core.fileMode=false", "diff", "-w", "--numstat", A1_2A_BASE_COMMIT, "--", p),
        )[0]!.split("\t");
        // ignoring indentation, `server.ts` replaces one line (the opening of the tool list); nothing else is removed
        expect(Number(numstat[1]), p).toBeLessThanOrEqual(1);
      }
    },
  );
});

describe("[A1-2a] [mechanism only] [nowrite] the ingress writes nothing and invents no authority", () => {
  it("[A1-2a] [mechanism only] [nowrite] the ingress and the tool call no writer of canon, time, journal, keep, ledger or retained state", () => {
    for (const f of READ_SIDE) expect(code(read(f)), f).not.toMatch(WRITERS);
    // and the scanner is not blind: it flags a specimen it must flag and passes one it must not
    expect(WRITERS.test("await campaign.store.commit(group)")).toBe(true);
    expect(WRITERS.test("fs.createExclusive(path, text)")).toBe(true);
    expect(WRITERS.test("const ok = verify(x)")).toBe(false);
  });

  it("[A1-2a] [mechanism only] [nowrite] the read side opens the campaign only through the existing authorized player view and closes it", () => {
    const ingress = code(read("packages/operator/src/gm-wait-ingress.ts"));
    expect(ingress).toMatch(/openAuthorizedPlayerView\(/);
    expect(ingress).toMatch(/campaign\.close\(\)/);
    expect(ingress).not.toMatch(/CanonicalCampaign\.(open|create)/);
    expect(ingress).not.toMatch(/Temporal|StageProvider|commit/);
  });

  it("[A1-2a] [mechanism only] [nowrite] the operator modules never call the read gateway, its binder, its tool name or its credential, and reach no referee, observation or time-advance surface", () => {
    for (const f of A1_2A_NEW_PRODUCTION_PATHS.filter((x) => x.startsWith("packages/operator/"))) {
      const text = code(read(f));
      expect(text, f).not.toMatch(
        /readCurrentObservationGlance|bindTrustedCurrentPlayerContext|read_current_observation_glance|PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE|authorizePlayerViewHost|observe-request|advance-request|referee-exchange|referee-mcp/,
      );
    }
  });

  it("[A1-2a] [mechanism only] [nowrite] the exchange reads with read-only file calls; its only writes are the existing request-host binding and the operator's own client action, to its own file", () => {
    const exchange = code(read("packages/operator/src/gm-wait-exchange.ts"));
    expect(exchange).toMatch(/bindRequestHost</);
    // the one function that writes is the operator's `bindGmWaitClient`; it writes the client binding file and nothing else
    const start = exchange.indexOf("export async function bindGmWaitClient");
    const end = exchange.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(0);
    const action = exchange.slice(start, end);
    const rest = exchange.slice(0, start) + exchange.slice(end);
    expect(rest).not.toMatch(WRITERS);
    expect(rest).not.toMatch(/writeFileSync|mkdirSync|chmodSync|renameSync|unlinkSync/);
    const targets = [...action.matchAll(/\b(?:writeFileDurable|chmod)\(\s*([A-Za-z]+)\(/g)].map(
      (m) => m[1],
    );
    expect(targets).toEqual(["clientsPath", "clientsPath"]);
    expect(action).not.toMatch(/createExclusive|remove\(|appendDurable|truncate/);
    // the client action is reachable from no read path: the ingress and the tool never name it
    for (const f of READ_SIDE)
      expect(code(read(f)), f).not.toMatch(/bindGmWaitClient|bindGmWaitHost/);
  });

  it("[A1-2a] [mechanism only] [nowrite] no new permission or role string, no generic GM writer, no scene-event grant and no override flag exists", () => {
    for (const f of A1_2A_NEW_PRODUCTION_PATHS) {
      const text = code(read(f));
      expect(text, f).not.toMatch(/["'`](role|permission)\.[a-z_.]+["'`]/);
      expect(text, f).not.toMatch(
        /permission\.scene_event|gm_override|gmOverride|force_wait|ORIGINAL_MESSAGE_VERIFIED/,
      );
    }
    // the one authority the ingress states is the EXISTING pair, by its existing constant
    expect(code(read("packages/operator/src/gm-wait-ingress.ts"))).toMatch(
      /GM_ADJUDICATION_AUTHORITY/,
    );
  });

  it("[A1-2a] [mechanism only] [nowrite] the tool is read-only, referee-lane, never replayable and never an ordinary action", () => {
    const tool = code(read("apps/phone/src/gm-wait-tool.ts"));
    expect(tool).toMatch(/scope: "referee"/);
    expect(tool).toMatch(/readOnlyHint: true/);
    expect(tool).not.toMatch(/replayable|ordinaryAction|mayElicit|elicit\(/);
  });
});

describe("[A1-2a] [mechanism only] [b0] the unexported B0 module", () => {
  it("[A1-2a] [mechanism only] [b0] is imported by exactly the declared production files and is still not exported from the contracts index or package", () => {
    const b0 = "packages/contracts/src/temporal-gm-wait.ts";
    const users = productionFiles()
      .filter((f) => f !== b0 && /temporal-gm-wait/.test(code(read(f))))
      .sort();
    expect(users).toEqual(Object.keys(A1_2A_B0_PRODUCTION_USERS).sort());
    expect(read("packages/contracts/src/index.ts")).not.toMatch(/temporal-gm-wait/);
    expect(read("packages/contracts/package.json")).not.toMatch(/temporal-gm-wait/);
  });
});

describe("[A1-2a] [mechanism only] [literal] the one local copy of the trigger literal", () => {
  it("[A1-2a] [mechanism only] [literal] exactly the declared new production file spells the literal, and its local copy equals the B0 constant", async () => {
    const spellers = productionFiles()
      .filter((f) => f !== "packages/contracts/src/temporal-gm-wait.ts")
      .filter((f) => /GM_INTERPRETED_PC_WAIT/.test(code(read(f))))
      .filter(
        (f) => A1_2A_NEW_PRODUCTION_PATHS.includes(f) || A1_2A_CHANGED_PRODUCTION_PATHS.includes(f),
      )
      .sort();
    expect(spellers).toEqual(Object.keys(A1_2A_LITERAL_FILES).sort());
    const b0 = await import("../../packages/contracts/src/temporal-gm-wait.ts");
    const exchange = await import("../../packages/operator/src/gm-wait-exchange.ts");
    expect(exchange.GM_WAIT_OPERATION).toBe(b0.GM_INTERPRETED_PC_WAIT);
  });
});

describe("[A1-2a] [mechanism only] [labels] the tests say what they are", () => {
  it("[A1-2a] [mechanism only] [labels] every A1-2a test title carries both labels and claims nothing more", () => {
    const files = [
      "tests/unit/gm-wait-exchange.test.ts",
      "tests/integration/gm-wait-ingress.test.ts",
      "tests/integration/gm-wait-tool.test.ts",
      "tests/conformance/a1-2a-scope-conformance.test.ts",
    ];
    for (const f of files) {
      const titles = [
        ...read(f).matchAll(/\b(?:it|describe)(?:\.skipIf\([^)]*\))?\(\s*"([^"]+)"/g),
      ].map((m) => m[1]!);
      expect(titles.length, f).toBeGreaterThan(0);
      for (const t of titles) {
        expect(t, `${f}: ${t}`).toContain("[A1-2a]");
        expect(t, `${f}: ${t}`).toContain("[mechanism only]");
        expect(t, `${f}: ${t}`).not.toMatch(
          /\b(T2|T3|retained|genuine AI|live GM|production)\b.*\b(pass|accepted)\b/i,
        );
      }
    }
  });
});
