// Conformance evidence for the Confirmed Original Locality & Finite Source Admission slice (@immortalis/operator `establish-locality`,
// `locality-status`). Governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged. Authority: BLUE v5
// bounded implementation brief (native pin 2026-10-10T11:45:43.936Z) on main 7fe37737165ce5085c89401cddf421a651441796. No register row,
// status, source pin, gate or lock moved: this slice adds operator code, tests and a document only. It composes the existing World-State
// operations and invents no simulation semantics. PF-6/F-028 stays BLOCKED / NOT ACTIVATED; IA/V rows are unpromoted.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const SRC = "packages/operator/src";
const DOC = "docs/original-locality-admission-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
  );
const importedNames = (file: string, from: string): string[] =>
  [
    ...readFileSync(file, "utf8").matchAll(
      new RegExp(`import (?:type )?\\{([^}]*)\\} from "${from}"`, "g"),
    ),
  ]
    .flatMap((m) => m[1]!.split(","))
    .map((n) => n.trim().replace(/^type /, ""))
    .filter(Boolean);

/** Everything the slice composes or must leave untouched, exactly as it stood at main 7fe37737165ce5085c89401cddf421a651441796. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "packages/contracts/src/world-foundation.ts":
    "c22e815d803c4c677db8d3c1d47c9ddf920ac386db2809de37dfd42d47ba9337",
  "packages/contracts/src/source-drawdown.ts":
    "a21f60796bf4cb188c755381d11ad097679530ee096018e14b6dd9608049d01e",
  "packages/contracts/src/production.ts":
    "40ff84c02029ecd43811eb8c8cd6b5d32e8e6e505953c9bd3e997a6ae8f41e4b",
  "packages/engine/src/world/canonical-campaign.ts":
    "227ea9fba026f5ac594a12ddc511901559dcd14a0bf29ec1578442063fff46a5",
  "packages/engine/src/persistence/file-package.ts":
    "9f503d0b219457f9086bf6963e774e3d5dcf74d18c4643a8c7658085ab8b6933",
  "packages/engine/src/owners/registry.ts":
    "15cefc0e7a70f61440536ac0e59326cad76889743d11396fbbcd7fda6f4639c3",
  "packages/engine/src/owners/admission.ts":
    "da6765cb36246da4363be0796a2438a301eff164f5e121977d125bca0291eec0",
  "packages/engine/src/source-drawdown/adapter.ts":
    "2c335aeda9944e9ce6d178b915580d65aa9d0693472b20fb486bd11c6f589626",
  "packages/engine/src/source-drawdown/admission.ts":
    "00b58b5cba3b0552afbeb95d7dd002ad6e6e7ce09795e9f5ef2ed113def09d85",
  "packages/engine/src/source-drawdown/integrity.ts":
    "4ab03e1cad8c8f09f5e748b9310503229e9adb01dc8b0aadc2101a98e9562f91",
  "packages/operator/src/bin.ts":
    "1b3f71e0f10cb036da1a505a3f26dce25f39957ae577efc5a8a0be7a9c184d4e",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/local-operator.ts":
    "1bf152e2a05e64474beb661b215c33b1e4ab318ceff845856aaef916de3250a8",
  "packages/operator/src/ledger.ts":
    "cecba030deca45997cfca4a4833f1f101c2797749cd58b036dbc01ac2683e79f",
  "packages/operator/src/commands.ts":
    "826a8d68e7151f7a69f5ceace19fdfbd03941c28d327de0b5dd3d5a2fbdacad7",
};

describe("the owners, contracts, shipped binary and frozen artifacts are untouched: the slice consumes them, never edits or duplicates them", () => {
  it("the strict world/source contracts, the World-State and package owners, Production's basis path, the existing operator modules, the shipped binary and the F-027 artifacts are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register) {
      const text = JSON.stringify(row);
      expect(text, row.id).not.toMatch(
        /packages\/operator|establish-locality|original-locality|locality-status/,
      );
    }
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });
});

describe("the shipped path composes only the existing World-State operations", () => {
  const locality = `${SRC}/locality.ts`;

  it("no engine, contracts, protocol or testkit module names the slice, and the operator depends on nothing new", () => {
    for (const f of ["engine", "contracts", "testkit", "protocol"].flatMap((p) =>
      walk(`packages/${p}/src`),
    ))
      expect(code(f), f).not.toMatch(/establishLocality|localityStatus|LocalitySetupSchema/);
    const pkg = JSON.parse(readFileSync("packages/operator/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "@immortalis/contracts",
      "@immortalis/engine",
      "@immortalis/protocol",
      "zod",
    ]);
  });

  it("takes from the engine nothing beyond the campaign, the file-system seam and canonical equality; and drives the owners only through CanonicalCampaign", () => {
    expect([...new Set(importedNames(locality, "@immortalis/engine"))].sort()).toEqual([
      "CanonicalCampaign",
      "FsOps",
      "canonicalEqual",
      "nodeFs",
    ]);
    const src = code(locality);
    for (const op of ["establishWorld", "establishLocus", "establishSourceCondition"])
      expect(src, op).toContain(op);
    // it commits through no other door: no raw store commit, no Production/Economy/Temporal/PC owner, no fixture
    expect(src).not.toMatch(
      /\.commit\(|SourceDrawdownAdapter|ProductionAdapter|establishBasis|startExtraction|TemporalCoordinator|bindPlayerCharacter|releasePlayerCharacter|coupleExistingActor|testkit|FIXTURE|historyGroup/,
    );
  });

  it("writes canon only through the three World-State operations and the standard package creation: nothing else is published, registered or advanced", () => {
    const src = code(locality)
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    expect(src).not.toMatch(
      /\.registerObject\(|\.advance\(|establishCanonicalTime|continueRemainder|commitPcVoluntaryMovement|establishPcMovementRequest|\.dispatch\(|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|establishPcPhysicalLocusCustody|createFileCampaign|CANON_WRITE_AUTHORITY|\bOWNER_|\bFACET_|\bfactKind\b|PLAYER_CHOICE_AUTHORITY|role\.|permission\./,
    );
    expect(src.match(/CanonicalCampaign\.create\(/g)).toHaveLength(2); // the package, and the scratch admission check
  });

  it("retains the confirmed setup identity in the owner-only retained-state directory, apart from the retained intents, before the package is created", () => {
    const pin = code(`${SRC}/locality-pin.ts`);
    expect(
      [...new Set(importedNames(`${SRC}/locality-pin.ts`, "@immortalis/engine"))].sort(),
    ).toEqual(["FsOps", "nodeFs"]);
    // it is not an intent of the ledger that `reconcile` replays and the unreconciled-choice gates scan
    expect(pin).not.toMatch(/IntentLedger|ledger\.ts|CONFIRMED|reconcile/);
    // first-writer-wins: the identity is published by one exclusive create, never by a bare read-then-write
    expect(pin).toMatch(/createExclusive/);
    expect(pin.indexOf("createExclusive")).toBeLessThan(pin.indexOf("writeFileDurable"));
    expect(pin.match(/createExclusive\(/g)).toHaveLength(1);
    expect(pin).not.toMatch(/rename|unlink|\.remove\(|truncate|appendDurable/);
    expect(pin).not.toMatch(/Math\.random|Date\.now|new Date|randomUUID/);
    // internal to the package: not part of the operator's exported surface
    expect(Object.keys(operator)).not.toEqual(expect.arrayContaining(["readPin"]));
    expect(code(`${SRC}/index.ts`)).not.toMatch(/locality-pin/);
    // ordering in establishLocality: the pin is read first, written before the package is created, and re-read after
    const src = code(`${SRC}/locality.ts`);
    const body = src.slice(src.indexOf("async function commitAndVerify"));
    expect(body.indexOf("writePin(")).toBeGreaterThan(-1);
    expect(body.indexOf("writePin(")).toBeLessThan(body.indexOf("createPackage("));
    expect(body.indexOf("createPackage(")).toBeLessThan(body.indexOf("readPin(pin)"));
    expect(src.indexOf("await readPin(")).toBeLessThan(src.indexOf("fs.list(campaignDir)"));
  });

  it("invents no quantity, estimate, default, clock or random value: identities are derived from the confirmed content alone", () => {
    const src = code(`${SRC}/locality.ts`);
    expect(src).not.toMatch(/Math\.random|Date\.now|new Date|randomUUID|randomBytes/);
    expect(src).not.toMatch(/amount:\s*\d/);
    expect(src).toMatch(/operator-locality:\$\{id\}/);
  });

  it("the shipped binary registers no owner extension and the closed command set gained exactly the two locality commands", () => {
    const bin = code(`${SRC}/bin.ts`);
    expect(bin).toMatch(/runCli\(process\.argv\.slice\(2\)\)/);
    expect(bin).not.toMatch(/extension|testkit|fixture/i);
    const cli = code(`${SRC}/cli.ts`);
    for (const c of ["establish-locality", "locality-status"]) expect(cli, c).toContain(`"${c}"`);
    expect(Object.keys(operator)).toEqual(
      expect.arrayContaining(["establishLocality", "localityStatus"]),
    );
  });

  it("no operator source reaches for the actor fixture extension or a synthetic history source", () => {
    for (const f of walk(SRC))
      expect(code(f), f).not.toMatch(/ACTOR_FIXTURE_EXTENSION|historyGroup/);
  });
});

describe("the document states the boundary, the limits and the untouched governance", () => {
  it("names the base, the brief pin, the owner operations, the refusals, the residual and what is not claimed", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");
    for (const must of [
      "7fe37737165ce5085c89401cddf421a651441796",
      "2026-10-10T11:45:43.936Z",
      "establishWorld",
      "establishLocus",
      "establishSourceCondition",
      "EXACT_FINITE",
      "INITIAL_SETTING_FACT",
      "ORIGINAL",
      "Surprise Me",
      "PACKAGE_UNUSABLE",
      "SETUP_CONFLICT",
      "LOCALITY_INCOMPLETE",
      "--reclaim-stale-lock",
      "SourceDrawdownAdapter.establishBasis",
      "scratch package",
      "Not claimed",
      "OB-030",
      "PF-6/F-028 remains BLOCKED / NOT ACTIVATED",
      "IA-07",
      "F60-R1",
      "2026-10-10T13:11:33.766Z",
      "locality-setup-<hash>.json",
      "PROGRESS setup PINNED",
      "F60-R2",
      "2026-10-10T13:48:40.111Z",
      "first-writer-wins",
    ])
      expect(doc, must).toContain(must);
    // BLUE F60-R1: a changed setup is never "simply a new setup" because nothing was committed yet
    expect(doc).not.toMatch(/changed setup is simply a new setup/);
    expect(doc).toMatch(/\*\*mechanism only\*\*/);
    expect(doc).toContain("remote authentication provider");
  });
});
