// BLUE v5.2-A1 conformance — the host-requested, independently operator-confirmed active-PC target-only OOC time advance (bounded brief
// "Host-Requested Active-PC Target-Only OOC Time", native pin 2026-10-15T15:46:04.940Z; exact base e799fb861c7495998c3a26413c017cc33d6a83d8).
// The slice adds operator-side modules, tests and documents. It moves no spec-lock pin, runtime-contract snapshot, acceptance-register row, status
// or open gate (OB-030 / F-028 stay Blocked; PF-6 stays unactivated), edits none of the gateway, Temporal, GIP, confirmation, command, session,
// observation-request, read-transport or referee modules it consumes or stands beside, and adds no owner, fact kind, schema, permission,
// persistent key, migration or dependency. Implementation pins change openly; frozen design, source lock, acceptance status and gates do not.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lock } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");

/** Byte-identical to the base e799fb8: the slice consumes or stands beside every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "packages/protocol/src/active-pc-target-advance.ts":
    "1339417f932845a5fc466560d6da35dfc2b11991ef11fadf7e49712f3963c268",
  "packages/protocol/src/index.ts":
    "bea2ba9f64fa7c761fa361632e7518d47f00f8ab42a25a3d22c9568b29214709",
  "packages/contracts/src/protocol-pc-target-advance.ts":
    "0e5db2b3506fcb6317b26a1b7e8707f0d456b444c4c6240be3ef2fdb378faf5f",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/gip-instrument.ts":
    "4506c97e3c80aa720d7576b8224bd3fd8a144661eb4ad5c8c9538178eca97d77",
  "packages/engine/src/temporal/coordinator.ts":
    "8223079f733f3e54737dd2cf356edabdddddce241c9aa6bd64104454afb33faf",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/engine/src/temporal/admission.ts":
    "69e027acb4c54b4a189bc6721f7cd733db57a356e4c3c889f6a489956a50a6e6",
  "packages/engine/src/gip/adapter.ts":
    "2b73b74c3f32d245d88999115a74f4804f8bdcb03d16f9a2793fe61c5d2e1f8b",
  "packages/engine/src/gip/provider.ts":
    "f1d6629d99aeb17f4f36265621fd6906447ef74336dd80b32e75c2561d874af5",
  "packages/operator/src/commands.ts":
    "467a877a789cbfbf973ddb734af1f009a74bf331156882e37b17c876e18589f2",
  "packages/operator/src/confirmation.ts":
    "7db72a424fe61265eaac40472db5b07010f9906722938d41ae5ba21d300a812c",
  "packages/operator/src/cli.ts":
    "5e04149c346496a178d6f3e2e0fc6570a11a881fea5579236150cefaec5df4e4",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/ledger.ts":
    "94092549ec67f9631f05fba78890775c45e574a1e9335a36daa3abe82921c3c9",
  "packages/operator/src/index.ts":
    "bd97f7c3b300ad48c80d25943aca1c7d9b0e14e930a650650044e2a3b97e16ba",
  "packages/operator/src/local-operator.ts":
    "1bf152e2a05e64474beb661b215c33b1e4ab318ceff845856aaef916de3250a8",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  "packages/operator/src/observation.ts":
    "148f9b0fca3bd33f4579ac913bd55c4c94cb6b843ebe1591be7eea72253b30c0",
  "packages/operator/src/original-pc.ts":
    "ea023957d3ddd4e8dbab14111213d2d46d057a27564f59a413bb65e18a0d3f55",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/original-pc-locus.ts":
    "28d6c27351747faec4f2632f024ef69413629f2cef0cf0f994cb5e2ae9f92397",
  "packages/operator/src/player-view.ts":
    "639b7e44e13f0467880f8e8e6b1943ce9ac57c298cec4cdddcf953fac9818d31",
  "packages/operator/src/player-view-exchange.ts":
    "0e14d3bca44157903579692a65e2c5762856653e7fbdaba3f2fd3f25352c991d",
  "packages/operator/src/player-view-mcp.ts":
    "3925495aa279995dc2fc2d41d9040089ab01dcce17eabb5521d75cca8eace6b4",
  "packages/operator/src/player-view-bin.ts":
    "72fe7c9e072dc00143772fdcaba21760648366a472b9e735c456a3b1a50d1952",
  "packages/operator/src/player-view-bind-bin.ts":
    "8d06bb0cc0e6b9ffedb38ff65c2f8569ab9cd39fcfcd78530dd027102ba40b2a",
  "packages/operator/src/observe-request.ts":
    "ff97b8f7cc4b4441af72d676b055146881270931c860ae7f9b87d326e5789880",
  "packages/operator/src/observe-request-exchange.ts":
    "e92b96cd575b4e6f63dff8c1a0d4888a207a0b01a14e131b123eecafe8d5bb54",
  "packages/operator/src/observe-request-mcp.ts":
    "e9eb04b34eb9a15f18d85bdd96c54151b3599e917be20a901edba741f08ad666",
  "packages/operator/src/observe-request-cli.ts":
    "5aaacfbf9a00c7433be36779a0c53902dbaa0f7462df6f9eb767f43501f0a734",
  "packages/operator/src/observe-request-answer.ts":
    "f8a337c2321371da6a294dbbdd259a2f9a6234f19eff38471d9d88049c4bc430",
  "packages/operator/src/observe-request-bin.ts":
    "3f9de33b12e95a757b99d37398fb2ea207988a8443f2acf972e87c4d7b96fe9d",
  "packages/operator/src/observe-request-bind-bin.ts":
    "863c3fa9650dbb8dddf1c2653e8a8a53ed3bac540447e36fcfd7e6fe8f6f683b",
  "packages/operator/src/observe-request-answer-bin.ts":
    "7b181279766a13d4a2235a0d1dcb4279a27f7bd3a96a63e591813597dbe9b23e",
  "packages/operator/src/referee-mcp.ts":
    "288de65f95267c91608e577c5d4a3338225a10a34b93db2f5d187786c56b22a9",
  "packages/operator/src/referee-exchange.ts":
    "9c9a628c2417a1d5277afc934a1989fd7a44bfae4a40d195f091f7c13e68d6a7",
  "packages/operator/src/referee-session.ts":
    "d6e1b40103abe3aaa8e894bed3d06bbc5d0fc912dd06129a53d8c4ae69ea1b9a",
};

const NEW_MODULES = [
  "advance-request-answer-bin.ts",
  "advance-request-answer.ts",
  "advance-request-bin.ts",
  "advance-request-bind-bin.ts",
  "advance-request-cli.ts",
  "advance-request-exchange.ts",
  "advance-request-mcp.ts",
  "advance-request.ts",
];

describe("existing owners, the gateway, the Temporal kernel, GIP, the command set and the specification are untouched: the slice consumes them, never edits or duplicates them", () => {
  it("the F-027 lock, runtime-contract snapshot, register and gates, the target-advance gateway and contract, the Temporal and GIP sunset owners, the command set, the confirmation module, the observation-request and read transports and the referee surface are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the spec lock is the same Git blob the PR #70 closeout verified, and the frozen pins are the brief's", () => {
    const blob = createHash("sha1")
      .update(`blob ${readFileSync("spec/f027/spec-lock.json").length}\0`)
      .update(readFileSync("spec/f027/spec-lock.json"))
      .digest("hex");
    expect(blob).toBe("43e4325789488e155c60f2deae5028e44286d795");
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!.native_pin;
    expect(pin("F-014B")).toBe("2026-09-25T23:42:29.547Z");
    expect(pin("I-001")).toBe("2026-09-25T00:17:49.551Z");
    expect(pin("F-014D")).toBe("2026-09-24T16:25:17.059Z");
    expect(pin("NPK")).toBe("2026-09-25T00:18:32.532Z");
  });

  it("the operator package gained exactly the eight request modules, and the engine, contracts, protocol and testkit packages gained nothing", () => {
    const operator = readdirSync("packages/operator/src").sort();
    for (const m of NEW_MODULES) expect(operator, m).toContain(m);
    expect(operator.filter((f) => f.startsWith("advance-request")).sort()).toEqual(
      [...NEW_MODULES].sort(),
    );
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "current-observation-glance.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
      "pc-collection.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    // no migration, schema or contract module was added
    expect(readdirSync("migrations").sort()).toEqual(["README.md", "manifests"]);
  });

  it("the operator package manifest gained exactly the three bin entries and no dependency", () => {
    const pkg = JSON.parse(readFileSync("packages/operator/package.json", "utf8"));
    expect(pkg.bin).toEqual({
      "immortalis-operator": "./src/bin.ts",
      "immortalis-referee": "./src/referee-bin.ts",
      "immortalis-player-view": "./src/player-view-bin.ts",
      "immortalis-player-view-bind": "./src/player-view-bind-bin.ts",
      "immortalis-observe-request": "./src/observe-request-bin.ts",
      "immortalis-observe-request-bind": "./src/observe-request-bind-bin.ts",
      "immortalis-observe-request-answer": "./src/observe-request-answer-bin.ts",
      "immortalis-advance-request": "./src/advance-request-bin.ts",
      "immortalis-advance-request-bind": "./src/advance-request-bind-bin.ts",
      "immortalis-advance-request-answer": "./src/advance-request-answer-bin.ts",
    });
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
      "@immortalis/protocol": "workspace:*",
      zod: "4.6.5",
    });
  });
});

describe("the slice makes no choice, grants no authority and moves no gate", () => {
  it("the existing confirmation and command modules are the only place a confirmation or an advance choice is made", () => {
    for (const f of NEW_MODULES) {
      const src = readFileSync(`packages/operator/src/${f}`, "utf8");
      // a token is made only by the unchanged confirmation module
      expect(src, f).not.toMatch(/Object\.freeze|new WeakSet|OperatorConfirmation\b/);
    }
  });

  it("the register has no row this slice moved: nothing is PASS on this slice's account", () => {
    const text = readFileSync("spec/f027/acceptance-register.yaml", "utf8");
    expect(text).not.toMatch(/advance-request|host-requested|host_requested|time-advance-request/i);
  });

  it("the brief's pin, the exact base and the governing documents are named by the foundation document, and the document claims no acceptance", () => {
    const doc = readFileSync("docs/protocol-host-advance-request-foundation.md", "utf8");
    expect(doc).toContain("3fa20af901e081ceb29ae14b8ab1aa93");
    expect(doc).toContain("2026-10-15T15:46:04.940Z");
    expect(doc).toContain("e799fb861c7495998c3a26413c017cc33d6a83d8");
    expect(doc).toContain("38756126058");
    expect(doc).toMatch(/\*\*No PASS acceptance is claimed here\.\*\*/);
    expect(doc).toMatch(/Which tests used a scripted console and which a genuine host/);
    expect(doc).toMatch(/nothing here certifies genuine human identity/);
    expect(doc).toMatch(/docs\/evidence\/host-advance-request-real-host\.md/);
    for (const f of NEW_MODULES.filter((m) => !m.endsWith("-bin.ts")))
      expect(doc, f).toContain(f.replace(/\.ts$/, ""));
  });
});
