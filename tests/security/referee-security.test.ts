// Security and trust-boundary evidence for the provider-neutral, host-callable AI referee (PR #61, BLUE B61-A3). Static checks over the
// new modules' own source. They establish what the mechanism CANNOT reach; they say nothing about the quality of any model's reading.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { code } from "../support/f027.ts";

const ENGINE_DIR = "packages/engine/src/referee";
const CONTRACT = "packages/contracts/src/referee.ts";
const OPERATOR = [
  "packages/operator/src/referee-cancellation.ts",
  "packages/operator/src/referee-exchange.ts",
  "packages/operator/src/referee-mcp.ts",
  "packages/operator/src/referee-bin.ts",
  "packages/operator/src/referee-session.ts",
];
const ENGINE = readdirSync(ENGINE_DIR).map((f) => join(ENGINE_DIR, f));
const ALL = [CONTRACT, ...ENGINE, ...OPERATOR];

const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);

describe("no model, provider, credential or network is reachable from the referee mechanism", () => {
  it("opens no network, process, dynamic-code or environment surface", () => {
    for (const f of ALL)
      expect(identifiers(f), f).not.toMatch(
        /\bfetch\b|node:(?:http|https|http2|net|tls|dgram|child_process|vm|worker_threads|cluster|dns)|\beval\b|new Function|process\.env|\brequire\(|import\(|XMLHttpRequest|WebSocket/,
      );
  });

  it("names no provider SDK, API key, bearer token or credential store, in code or in text", () => {
    for (const f of ALL) {
      const raw = readFileSync(f, "utf8");
      expect(raw, f).not.toMatch(
        /ANTHROPIC|OPENAI|api[_-]?key|sk-ant|bearer\s|Authorization|\.claude\/|credentials?\.json|keychain/i,
      );
      for (const s of specifiers(f))
        expect(/anthropic|openai|sdk|axios|undici|node-fetch/i.test(s), `${f} imports ${s}`).toBe(
          false,
        );
    }
  });

  it("the whole repository's package manifests add no provider dependency", () => {
    for (const p of ["contracts", "engine", "operator", "protocol", "testkit"]) {
      const pkg = JSON.parse(readFileSync(`packages/${p}/package.json`, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      expect(
        Object.keys(pkg.dependencies ?? {}).filter((d) => /anthropic|openai|sdk|ai$/i.test(d)),
      ).toEqual([]);
    }
  });
});

describe("the engine side is pure: no file system, clock or randomness", () => {
  it("reads no clock and draws no random value; opens no file", () => {
    for (const f of [CONTRACT, ...ENGINE])
      expect(identifiers(f), f).not.toMatch(
        /Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|node:fs|node:os|node:child_process/,
      );
  });

  it("imports only the contracts package, sibling engine modules and zod", () => {
    for (const f of [CONTRACT, ...ENGINE])
      for (const s of specifiers(f))
        expect(
          s.startsWith("./") || s.startsWith("../") || ["@immortalis/contracts", "zod"].includes(s),
          `${f} imports ${s}`,
        ).toBe(true);
  });

  it("the verdict is never read from an answer: the derivation functions never take a verdict field from the host", () => {
    const derive = identifiers(join(ENGINE_DIR, "derive.ts"));
    expect(derive).not.toMatch(
      /decision\.verdict|answer\.verdict|\.verdict\s*===\s*"CLOSED"\s*\?\s*decision/,
    );
    const contract = readFileSync(CONTRACT, "utf8");
    // the host-answer schemas carry no verdict, role or authority field
    const hostSchemas = contract.slice(
      contract.indexOf("export const I002ItemDecisionSchema"),
      contract.indexOf("// The verdicts"),
    );
    expect(hostSchemas).not.toMatch(/verdict|authority|\brole\b|permission/);
  });
});

describe("the host-callable server exposes a closed, bounded surface", () => {
  const mcp = identifiers("packages/operator/src/referee-mcp.ts");
  const raw = readFileSync("packages/operator/src/referee-mcp.ts", "utf8");

  it("offers exactly three tools and no shell, file, database or game tool", () => {
    const names = [...raw.matchAll(/name:\s*"([a-z_]+)"/g)]
      .map((m) => m[1])
      .filter((n) => n?.startsWith("referee_"));
    expect(names).toEqual(["referee_list_tasks", "referee_get_task", "referee_submit_decision"]);
    expect(raw).not.toMatch(
      /name:\s*"(?:run|exec|shell|bash|read_file|write_file|query|sql|command)/,
    );
  });

  it("never opens the campaign package or calls an owner operation", () => {
    expect(mcp).not.toMatch(
      /CanonicalCampaign|openCampaign|createFileCampaign|\.commit\(|releasePlayerCharacter|bindPlayerCharacter|RefereeAdjudicationAdapter|FilePackageStore/,
    );
  });

  it("authenticates the host before disclosing any context, and reads the secret only from an owner-only file", () => {
    const authAt = raw.indexOf("authorizeHost(p, o.hostId, o.secret, task.ok");
    const disclose = raw.indexOf("text(task.value.document)");
    expect(authAt).toBeGreaterThan(0);
    expect(disclose).toBeGreaterThan(authAt);
    expect(raw).toContain("O_NOFOLLOW");
    expect(raw).toMatch(/st\.mode & 0o077/);
    expect(mcp).not.toMatch(/process\.argv.*secret|--secret\b/);
  });

  it("the exchange compares secrets and proofs in constant time and writes answers exclusively", () => {
    const ex = identifiers("packages/operator/src/referee-exchange.ts");
    expect(ex).toContain("timingSafeEqual");
    expect(ex).toContain("createExclusive");
    expect(ex).toMatch(/createHmac/);
  });
});

describe("the operator treats a host's answer as untrusted input", () => {
  it("the engine side, not the host, supplies the authority of the retained decision", () => {
    const session = identifiers("packages/operator/src/original-pc.ts");
    expect(session).toContain("REFEREE_AUTHORITY");
    expect(identifiers("packages/operator/src/referee-mcp.ts")).not.toMatch(
      /REFEREE_AUTHORITY|GM_ADJUDICATION_AUTHORITY|CANON_WRITE_AUTHORITY/,
    );
  });
});
