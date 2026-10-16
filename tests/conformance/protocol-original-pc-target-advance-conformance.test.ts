// PR #67 H-1 recovery: re-pin the affected event-trigger/strict-boundary implementation; no frozen artifact or gate changes.
// Conformance evidence for the ORIGINAL active-PC target-only temporal advance (BLUE v5.2 bounded implementation brief, native pin
// 2026-10-14T18:01:29.811Z) on main dacda593b5a349805eab51e7c46da182a251fef1. Governing lock: spec/f027/spec-lock.json (F-027 v1.0
// composed with F-027-CD1), unchanged. The slice extends ONE production file, packages/protocol/src/active-pc-target-advance.ts, so that
// the existing stationary active-PC gateway also accepts the qualified ORIGINAL first-activation custody; no register row, status,
// source pin, gate or lock moved. PF-6/F-028 stays BLOCKED / NOT ACTIVATED; OB-030 stays blocked; IA/V rows are unpromoted. The brief is a
// construction source and is NOT a spec-lock pin.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { code, gates, lock, register } from "../support/f027.ts";

const MODULE = "packages/protocol/src/active-pc-target-advance.ts";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const BRIEF_ID = "3f920af901e081898168eef701fe0ea2";
const BRIEF_PIN = "2026-10-14T18:01:29.811Z";

describe("F-027 spec-lock and the frozen source pointers are exactly the brief's", () => {
  it("the spec-lock is byte-identical to the base, with the package and the CD1 addendum at their pins", () => {
    expect(sha("spec/f027/spec-lock.json")).toBe(
      "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
    );
    const raw = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as {
      package: { native_pin: string; url: string };
      implementation_authority_addenda: { id: string; native_pin: string }[];
    };
    expect(raw.package).toMatchObject({
      native_pin: "2026-09-29T00:40:44.707Z",
      url: "https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639",
    });
    expect(raw.implementation_authority_addenda.map((a) => [a.id, a.native_pin])).toEqual([
      ["F-027-CD1", "2026-10-02T15:11:03.450Z"],
    ]);
  });

  it("each frozen source the brief names is pinned at the brief's native pin and page", () => {
    const expected: Record<string, [string, string]> = {
      "F-014B": ["3e020af901e081fb88e9f691748db990", "2026-09-25T23:42:29.547Z"],
      "I-001": ["3e220af901e081c6b0f2edcfefe9e4d2", "2026-09-25T00:17:49.551Z"],
      IR: ["3e320af901e081a3a669c1c0b842c9df", "2026-09-25T00:17:26.287Z"],
      "I-002": ["5a520af901e0829eadb201bccd6c4718", "2026-09-25T00:15:54.536Z"],
      WG: ["3e120af901e081ec9de8fea870221a0d", "2026-09-25T13:44:22.668Z"],
      "WS-007": ["3e120af901e081c7ad5ecba62e11f521", "2026-09-24T01:42:24.952Z"],
    };
    for (const [id, [page, native]] of Object.entries(expected)) {
      expect(pin(id).url, id).toBe(`https://app.notion.com/p/${page}`);
      expect(pin(id).native_pin, id).toBe(native);
    }
  });

  it("the brief is recorded as a construction source and is NOT a spec-lock pin", () => {
    expect(JSON.stringify(lock)).not.toContain(BRIEF_ID);
    expect(JSON.stringify(lock)).not.toContain(BRIEF_PIN);
    expect(readFileSync("docs/protocol-active-pc-target-advance-foundation.md", "utf8")).toContain(
      BRIEF_PIN,
    );
  });
});

describe("the slice is one scoped delta: every owner, contract, predecessor gateway and the handover-only movement boundary is byte-identical to main", () => {
  /** Everything the original branch consumes and must leave untouched, byte-identical to main dacda593b5a349805eab51e7c46da182a251fef1. */
  const UNCHANGED: Record<string, string> = {
    "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
    "spec/f027/runtime-contract.md":
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    "spec/f027/acceptance-register.yaml":
      "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
    "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    // the shared predicate and the handover-only movement branch
    "packages/engine/src/world/pc-locus-custody.ts":
      "2fd911ec1abfcfba49055fb5ff266d86ff79b45197fc7493215f840e43f41eed",
    "packages/engine/src/pc-movement/derive.ts":
      "636f161378d319702782860ba99f70db62ac37887feb975c188681b05e7bfe15",
    "packages/contracts/src/pc-locus-custody.ts":
      "181218063894d0458e8143ac7a4866d70732ff967410b18846a78cc457b30a0a",
    // the kernel, GIP's own sunset expiry and enrollment, the owner registry and the canonical campaign
    "packages/engine/src/temporal/coordinator.ts":
      "8223079f733f3e54737dd2cf356edabdddddce241c9aa6bd64104454afb33faf",
    "packages/engine/src/temporal/providers.ts":
      "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
    "packages/engine/src/gip/provider.ts":
      "f1d6629d99aeb17f4f36265621fd6906447ef74336dd80b32e75c2561d874af5",
    "packages/engine/src/gip/adapter.ts":
      "2b73b74c3f32d245d88999115a74f4804f8bdcb03d16f9a2793fe61c5d2e1f8b",
    "packages/engine/src/owners/registry.ts":
      "bdba96b219e7107dd950c0f5f4026d47dce855d16aa89a108df8f4ccc20708fe",
    "packages/engine/src/world/canonical-campaign.ts":
      "18fa5e9ea8c632d7aca468e08ce53e8ee513fe603ef73db9de5aa525f65c214c",
    // the host contract (strict one-field request, one-status receipt), the sibling gateways and the operator
    "packages/contracts/src/protocol-pc-target-advance.ts":
      "0e5db2b3506fcb6317b26a1b7e8707f0d456b444c4c6240be3ef2fdb378faf5f",
    "packages/protocol/src/index.ts":
      "bea2ba9f64fa7c761fa361632e7518d47f00f8ab42a25a3d22c9568b29214709",
    "packages/protocol/src/pc-transfer-advance.ts":
      "92ac714a567384f2e4c4410f1525b9f803ea3821b5deee22da3e7ab5c3af6ee1",
    "packages/protocol/src/pc-relocation.ts":
      "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
    "packages/protocol/src/null-pc-ooc-advance.ts":
      "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68",
    "packages/protocol/src/null-pc-ooc-held-continuation.ts":
      "4040a181a8b081d5d9a8c265185b13a4d559e829500a5c5986e776e4b703343c",
    "packages/operator/src/commands.ts":
      "4f7004444ed9ac5530c8759ce7696264b8345a808916f638c1388f20c36e9766",
  };

  it("each is byte-identical to main", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the gateway module is the one scoped delta, pinned at the slice head (any further edit is a new, visible change to this table)", () => {
    const delta = {
      base: "50b828821ecd6218502113d31e9cf74985bc297ff1c776069c9545696439735c",
      head: "1339417f932845a5fc466560d6da35dfc2b11991ef11fadf7e49712f3963c268",
    };
    expect(delta.base).not.toBe(delta.head);
    expect(sha(MODULE)).toBe(delta.head);
  });
});

describe("the original branch is read as itself and widens nothing", () => {
  const src = code(MODULE);

  it("the shared predicate is not broadened: it stays the exact handover test and the original basis is its own, exclusive test", () => {
    expect(code("packages/engine/src/world/pc-locus-custody.ts")).toMatch(
      /export const isPostHandoverCustody = \(c: PcPhysicalLocusCustody\): boolean =>\s*c\.basis\.established_from === EXISTING_ACTOR_HANDOVER;/,
    );
    expect(src).toMatch(/const handover = isPostHandoverCustody\(custody\.value\)/);
    expect(src).toMatch(/custody\.value\.basis\.established_from === ORIGINAL_ACTIVATION/);
    // the original custody must rest on the ACTIVATION binding; a custody on one basis never stands on the other's binding
    expect(src).toMatch(/campaign\.binding\(\)\?\.value\.transition\.type === ORIGINAL_ACTIVATION/);
    expect(src).toMatch(/if \(!handover && !original\) return false;/);
  });

  it("the original custody has the stationary-at-origin arm only: the settled single-leg arm is the handover branch's alone", () => {
    const origin = src.match(
      /case "STATIONARY_AT_ORIGIN":[\s\S]*?case "DESTINATION_COMMITTED":/,
    )![0];
    expect(origin).toMatch(
      /return !willingness && !request && !commitment && !transfer && !object;/,
    );
    expect(origin).not.toMatch(/handover|original/);
    const settled = src.match(/case "DESTINATION_COMMITTED":[\s\S]*?default:/)![0];
    expect(settled).toMatch(/return \(\s*handover &&/);
    expect(src).toMatch(/default:\s*return false;/);
  });

  it("no new input, authority, writer, provider, fact kind or Temporal entry was added to the gateway", () => {
    expect(src.match(/new StageProviderRegistry\(/g)).toHaveLength(1);
    expect(src.match(/new TemporalCoordinator\(/g)).toHaveLength(1);
    expect(src.match(/\.advance\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /\.commit\(|\.registerObject\(|establishCanonicalTime|PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|role\.player|permission\./,
    );
    // the only new contract import is the exclusive basis name; no world, GIP or referee vocabulary entered the module
    const contractImport = readFileSync(MODULE, "utf8").match(
      /import \{([^}]*)\} from "@immortalis\/contracts"/,
    )![1]!;
    expect(contractImport).toContain("ORIGINAL_ACTIVATION,");
    expect(src.replace(/gipSunsetExpiryProvider/g, "")).not.toMatch(
      /expired|lifecycle|sunset|instrument|\bgip\w*|governance|referee|qualified_by|PHYSICAL_/i,
    );
  });
});

describe("the witness is not tautological: the positive test file and its support author no upstream outcome", () => {
  const strip = (file: string) => code(file);

  it("the support builds the campaign only through shipped owners and states no `expired`, lifecycle, due flag, custody or verdict", () => {
    const support = strip("tests/support/original-pc-target.ts");
    expect(support).not.toMatch(
      /expired|lifecycle_status|due_flag|\bverdict\b|sunset_condition\s*:/,
    );
    // the antecedents come from the shipped operator commands and the owners' own adapters
    expect(support).toMatch(/boundCampaign\(\)/);
    expect(support).toMatch(/establishLocus\(dirs, locusConsole\(\)\)/);
    expect(support).toMatch(/establishSunsetInstrument/);
    expect(support).toMatch(/establishCanonicalTime/);
    // no raw store write, no hand-made custody or referee decision
    expect(support).not.toMatch(
      /\.commit\(|worldPcLocusCustodyKey|deriveOriginalPcPhysicalLocusCustody|refereeDecisionKey/,
    );
  });

  it("the positive and refusal tests read the result back from GIP's owner read, and pair it with the unqualified-custody refusal and the not-due control", () => {
    const test = strip("tests/integration/protocol-original-pc-target-advance.test.ts");
    expect(test).toMatch(/gipOf\(s\)\.governanceInstrument\(INSTRUMENT_A\)/);
    expect(test).toMatch(/custody: false/);
    expect(test).toMatch(/target: SUNSET_MID,\s*transaction: pcTargetTransaction\("tx-before"\)/);
    expect(test).toMatch(/not\.toMatch\(\/"lifecycle_status":/);
    // the test never writes the Instrument or the lifecycle itself
    expect(test).not.toMatch(/\.commit\(|lifecycle_status:\s*"expired"\s*[,}]\s*as\b/);
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no register row was promoted or mentions this slice, and PF-6/F-028 stays NOT_ACTIVATED_BLOCKED", () => {
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(/original-pc-target|ORIGINAL_ACTIVATION/);
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });
});
