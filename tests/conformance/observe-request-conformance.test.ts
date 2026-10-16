// BLUE v5.2-A1 conformance — the host-requested, independently operator-confirmed active-PC observation (bounded brief 2026-10-15, native pin
// 2026-10-15T12:57:55.189Z; exact base d5d6ce52b86d98aff25e4b6e4768ea366452772b). The slice adds operator-side modules, tests and documents. It
// moves no spec-lock pin, runtime-contract snapshot, acceptance-register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays
// unactivated), edits none of the gateway, projection, presentation, producer, confirmation, read-transport or referee modules it consumes or
// stands beside, and adds no owner, fact kind, schema, permission, persistent key or dependency. Implementation pins change openly; frozen
// design, source lock, acceptance status and gates do not.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lock } from "../support/f027.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");

/** Byte-identical to the base d5d6ce5: the slice consumes or stands beside every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  // the frozen specification snapshot, the lock, the register and the gates
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  // the Glance gateway (IM-15), its contract, and the projection (IM-13) and presentation (IM-14) it composes
  "packages/protocol/src/current-observation-glance.ts":
    "24e49fff98b86cf6710ec3d3c81b83985fd67a92a710f35da96003acab1e85d5",
  "packages/contracts/src/protocol-current-glance.ts":
    "c51e39c962137b912e05ce24a6590038afead2b32a891e145a43ece1b909ccba",
  "packages/protocol/src/index.ts":
    "bea2ba9f64fa7c761fa361632e7518d47f00f8ab42a25a3d22c9568b29214709",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  // the observation producer and the confirmation module (the only place a confirmation is made), re-used without edit
  "packages/operator/src/observation.ts":
    "148f9b0fca3bd33f4579ac913bd55c4c94cb6b843ebe1591be7eea72253b30c0",
  "packages/operator/src/confirmation.ts":
    "12a6a291ca1f07472d2a2ed6b17157d37cb3d1b77a177b2c7e2958a6f5cdea41",
  "packages/operator/src/original-pc.ts":
    "ea023957d3ddd4e8dbab14111213d2d46d057a27564f59a413bb65e18a0d3f55",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/original-pc-locus.ts":
    "28d6c27351747faec4f2632f024ef69413629f2cef0cf0f994cb5e2ae9f92397",
  "packages/operator/src/local-operator.ts":
    "1bf152e2a05e64474beb661b215c33b1e4ab318ceff845856aaef916de3250a8",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  // the PR #69 read-only player-view transport: strict one-tool read, never converted into a command and never given a request authority
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
  // the interpreter-only referee surface (a distinct, independently authenticated authority) and the operator command set
  "packages/operator/src/referee-mcp.ts":
    "de0bb376deb35c9a3f12fa550a2332a3b601e4bb7cbadd26a1d36f814a4c62a8",
  "packages/operator/src/referee-exchange.ts":
    "e2575b3490d80ce5ece7a0027824762c99e1dbed7849571eaa3a9d15c0c40469",
  "packages/operator/src/referee-session.ts":
    "d6e1b40103abe3aaa8e894bed3d06bbc5d0fc912dd06129a53d8c4ae69ea1b9a",
  "packages/operator/src/cli.ts":
    "428fb144febf5ff007e16106f676a2f6b3dac6f812de57ceeaee95b3d943e46c",
  "packages/operator/src/index.ts":
    "633ce6f79dd9cdf5368e4c2b06b33bb92a989592e88a8ae96953b869cf15e5b7",
};

const NEW_MODULES = [
  "observe-request-answer-bin.ts",
  "observe-request-answer.ts",
  "observe-request-bin.ts",
  "observe-request-bind-bin.ts",
  "observe-request-cli.ts",
  "observe-request-exchange.ts",
  "observe-request-mcp.ts",
  "observe-request.ts",
];

/** BLUE v5.2-A1 (host-requested time advance): eight further modules, added mechanically and bound by advance-request-conformance.test.ts. */
const ADVANCE_MODULES = [
  "advance-request-answer-bin.ts",
  "advance-request-answer.ts",
  "advance-request-bin.ts",
  "advance-request-bind-bin.ts",
  "advance-request-cli.ts",
  "advance-request-exchange.ts",
  "advance-request-mcp.ts",
  "advance-request.ts",
];

describe("existing owners, the gateway, the read transport, the referee surface and the specification are untouched: the slice consumes them, never edits or duplicates them", () => {
  it("the F-027 lock, runtime-contract snapshot, register and gates, IM-13/IM-14/IM-15, the observation producer, the confirmation module, the read transport and the referee surface are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the spec lock is the same Git blob the PR #68/#69 closeouts verified, and the frozen pins are the brief's", () => {
    const blob = createHash("sha1")
      .update(`blob ${readFileSync("spec/f027/spec-lock.json").length}\0`)
      .update(readFileSync("spec/f027/spec-lock.json"))
      .digest("hex");
    expect(blob).toBe("43e4325789488e155c60f2deae5028e44286d795");
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!.native_pin;
    expect(pin("I-001")).toBe("2026-09-25T00:17:49.551Z");
    expect(pin("F-014D")).toBe("2026-09-24T16:25:17.059Z");
    expect(pin("F-014B")).toBe("2026-09-25T23:42:29.547Z");
    expect(pin("I-002")).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("NPK")).toBe("2026-09-25T00:18:32.532Z");
  });

  it("the operator package gained exactly the eight request modules, and the engine, contracts, protocol and testkit packages gained nothing", () => {
    expect(readdirSync("packages/operator/src").sort()).toEqual(
      [
        "bin.ts",
        "cli.ts",
        "closed-setting.ts",
        "collection-preparation.ts",
        "collection-referee.ts",
        "commands.ts",
        "confirmation.ts",
        "index.ts",
        "ledger.ts",
        "local-operator.ts",
        "locality-pin.ts",
        "locality.ts",
        "observation.ts",
        "ooc.ts",
        "original-pc-keep.ts",
        "original-pc-locus.ts",
        "original-pc.ts",
        "player-view-bin.ts",
        "player-view-bind-bin.ts",
        "player-view-exchange.ts",
        "player-view-mcp.ts",
        "player-view.ts",
        "referee-bin.ts",
        "referee-console-bin.ts",
        "referee-console.ts",
        "referee-exchange.ts",
        "referee-mcp.ts",
        "referee-session.ts",
        "session.ts",
        "terminal.ts",
        "time-initialization.ts",
        ...NEW_MODULES,
        ...ADVANCE_MODULES,
      ].sort(),
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
  });

  it("the operator package manifest gained exactly the three bin entries and no dependency", () => {
    const pkg = JSON.parse(readFileSync("packages/operator/package.json", "utf8"));
    expect(pkg.bin).toEqual({
      "immortalis-operator": "./src/bin.ts",
      "immortalis-referee": "./src/referee-bin.ts",
      "immortalis-referee-console": "./src/referee-console-bin.ts",
      "immortalis-player-view": "./src/player-view-bin.ts",
      "immortalis-player-view-bind": "./src/player-view-bind-bin.ts",
      "immortalis-observe-request": "./src/observe-request-bin.ts",
      "immortalis-observe-request-bind": "./src/observe-request-bind-bin.ts",
      "immortalis-observe-request-answer": "./src/observe-request-answer-bin.ts",
      // BLUE v5.2-A1 (host-requested time advance): three further entry points, added mechanically; the entries above are unchanged
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
  it("the existing confirmation, observation and referee modules are the only place a confirmation, a referee question or a receipt is made", () => {
    for (const f of NEW_MODULES) {
      const src = readFileSync(`packages/operator/src/${f}`, "utf8");
      // a token is made only by the unchanged confirmation module
      expect(src, f).not.toMatch(/Object\.freeze|new WeakSet|OperatorConfirmation\b/);
    }
  });

  it("the register has no row this slice moved: nothing is PASS on this slice's account", () => {
    const text = readFileSync("spec/f027/acceptance-register.yaml", "utf8");
    expect(text).not.toMatch(/observe-request|host-requested|host_requested/i);
  });

  it("the brief's pin, the exact base and the governing documents are named by the foundation document, and the document claims no acceptance", () => {
    const doc = readFileSync("docs/protocol-host-observation-request-foundation.md", "utf8");
    expect(doc).toContain("3fa20af901e08103819ed4c336ebea03");
    expect(doc).toContain("2026-10-15T12:57:55.189Z");
    expect(doc).toContain("d5d6ce52b86d98aff25e4b6e4768ea366452772b");
    expect(doc).toContain("38733763289");
    expect(doc).toMatch(/\*\*No PASS acceptance is claimed here\.\*\*/);
    expect(doc).toMatch(/Which tests used a scripted host and which a genuine host/);
    expect(doc).toMatch(/nothing here certifies live-model perception/);
    expect(doc).toMatch(/docs\/evidence\/host-observation-request-real-host\.md/);
    for (const f of NEW_MODULES.filter((m) => !m.endsWith("-bin.ts")))
      expect(doc, f).toContain(f.replace(/\.ts$/, ""));
  });
});
