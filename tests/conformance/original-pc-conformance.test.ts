// Conformance evidence for the Original Player-Character Authorship & Native First Activation slice (@immortalis/operator
// `author-character`, `character-status`) and, within the same PR #61, its provider-neutral host-callable AI referee (BLUE B61-A3).
// Governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged.
// Authority: BLUE v5 bounded implementation brief "Original PC Authorship & Native First Activation" (native pin 2026-10-10T15:13:41.323Z)
// on main 884d09e889d6908e0244a7dbdfb49bbdde060843, and BLUE B61-A3 (pin 2026-10-11T02:46:54.896Z) under the Sovereign's Option B approvals.
// SOURCE-BOUNDARY STORY (corrected, BLUE F61-R3): the original slice added operator code, tests and a document only. B61-A3 then
// LAWFULLY MODIFIED four engine files — canonical-campaign.ts, world/integrity.ts, owners/registry.ts and owners/admission.ts — and added
// the referee contract, engine module and operator modules; those four are listed below as SCOPED DELTAS, each with its base hash on main
// and the hash pinned at the PR #61 head. Every other listed file, and the frozen F-027 lock/gates/register/contract, is byte-identical
// to main. No register row, status, source pin, gate or lock moved. PF-6/F-028 stays BLOCKED / NOT ACTIVATED; IA/V rows are unpromoted.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { code, gates, register } from "../support/f027.ts";

const SRC = "packages/operator/src";
const MODULE = `${SRC}/original-pc.ts`;
const DOC = "docs/original-pc-authorship-foundation.md";
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

/** Everything the slice composes or must leave untouched, byte-identical to main 884d09e889d6908e0244a7dbdfb49bbdde060843. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/spec-lock.json": "1fbeb0edd93ea96eb03896eb8faf2eb2441a9991b24b1d85b2f0e6b164dcdfa6",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "packages/contracts/src/world-foundation.ts":
    "c22e815d803c4c677db8d3c1d47c9ddf920ac386db2809de37dfd42d47ba9337",
  "packages/engine/src/persistence/file-package.ts":
    "e2e769228499519fd0db5d287706ffcdd82e7c8b5cf8d5162c1f43ea94c0f518", // H-01 scoped delta (persistence/file-package.ts: single-writer lock safety): pinned at the H-01 head; main 9f503d0b219
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
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/locality-pin.ts":
    "df06db12a7ec3cb7ffe185701aa4ea4728adf9d28fac85d8c1dc54e0f52d6bd6",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
};

/**
 * The Sovereign-authorized B61-A3 SCOPED DELTAS to existing engine files (consumer enforcement `qualified_by`, the referee owner/kind
 * registration, its admission dispatch and integrity). `base` is the hash on main 884d09e; `head` is the hash pinned at the PR #61 head
 * reviewed by BLUE (any further edit to these files is a new, visible change to this table). BLUE v5.1 (original active-PC qualified
 * physical-locus custody) later modified canonical-campaign.ts and owners/registry.ts again: the `head` pins below follow that change, and the
 * v5.1 scoped deltas (with their own main and head hashes) are listed in original-pc-locus-conformance.test.ts.
 */
const B61_A3_SCOPED_DELTAS: Record<string, { base: string; head: string }> = {
  "packages/engine/src/world/canonical-campaign.ts": {
    base: "da14f15afdd6024e7d3ff3996fab0c1f711e013addda368aa38f92696608e761",
    head: "f0d5652625ae9b23de8485bdc7bac3dd68518bcd40d36c75631f0d7e75339639",
  },
  "packages/engine/src/world/integrity.ts": {
    base: "e46bc19a095111796e473c20cebcb20aac0445c3be7d3f56dfa9f67d3e2f24e3",
    head: "64889019dd2742948027a3232a0c19b63359f50657377ed7b051852e2930e4c5",
  },
  "packages/engine/src/owners/registry.ts": {
    base: "7ce3421f88478795adbd05bd8e6b43c5d31322420fc61748b0af43043598a1d9",
    head: "2247b43cde66b48295b8b5371a37e16d381c165ca82e2ed4afd33440f24a879a",
  },
  "packages/engine/src/owners/admission.ts": {
    base: "95846b5c2471939ffd8d2d968de19ba5fafafca8f142479976805953d7193272",
    head: "095d497523a354a87af742c93eef32ed9486407511202af0ef1025d7d26d150c",
  },
};

describe("the owners, contracts, shipped binary and frozen artifacts: untouched except the four B61-A3 scoped deltas", () => {
  it("the PC/binding contracts, the persistence package, the existing operator modules, the shipped binary and the F-027 lock, gates, register and runtime contract are byte-identical to main", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the engine files B61-A3 modified are exactly the four scoped deltas: each differs from main and is pinned at the PR head (no silent further change)", () => {
    expect(Object.keys(B61_A3_SCOPED_DELTAS).sort()).toEqual([
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/world/canonical-campaign.ts",
      "packages/engine/src/world/integrity.ts",
    ]);
    for (const [file, { base, head }] of Object.entries(B61_A3_SCOPED_DELTAS)) {
      expect(base, file).not.toBe(head);
      expect(sha(file), file).toBe(head);
    }
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register) {
      const text = JSON.stringify(row);
      expect(text, row.id).not.toMatch(
        /original-pc|author-character|character-status|packages\/operator\/src\/original-pc/,
      );
    }
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });
});

describe("the shipped path composes only the two existing owner operations", () => {
  it("no engine, contracts, protocol or testkit module names the slice, and the operator depends on nothing new", () => {
    for (const f of ["engine", "contracts", "testkit", "protocol"].flatMap((p) =>
      walk(`packages/${p}/src`),
    ))
      expect(code(f), f).not.toMatch(/authorCharacter|characterStatus|compileContract|mirrorItems/);
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

  it("takes from the engine nothing beyond the campaign, the file-system seam and canonical equality", () => {
    expect([...new Set(importedNames(MODULE, "@immortalis/engine"))].sort()).toEqual([
      "CanonicalCampaign",
      "FsOps",
      "RefereeAdjudicationAdapter",
      "canonicalEqual",
      "refereeCandidateItems",
      "refereeQualificationViolation",
    ]);
  });

  it("writes canon through releasePlayerCharacter and bindPlayerCharacter alone: no raw commit, no other owner, no fixture, no time, custody or movement", () => {
    const src = code(MODULE);
    for (const op of ["releasePlayerCharacter", "bindPlayerCharacter"])
      expect(src, op).toContain(op);
    expect(src).not.toMatch(
      /\.commit\(|establishWorld|establishLocus|establishSourceCondition|handoverExistingActor|coupleExistingActor|establishPcPhysicalLocusCustody|commitPcVoluntaryMovement|establishPcMovementRequest|TemporalCoordinator|establishCanonicalTime|\.advance\(|LogisticsAdapter|EpistemicAdapter|KtiAdapter|testkit|FIXTURE|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY/,
    );
  });

  it("each owner write is reachable only after the player's own console confirmation of exactly what is written", () => {
    const src = code(MODULE);
    const release = src.indexOf("releasePlayerCharacter({");
    const bind = src.indexOf("bindPlayerCharacter({");
    const keep = src.lastIndexOf(
      'consumeConfirmation(decision.confirmation, "keep-character"',
      release,
    );
    const place = src.lastIndexOf(
      'consumeConfirmation(decision.confirmation, "place-character"',
      bind,
    );
    expect(release).toBeGreaterThan(0);
    expect(keep).toBeGreaterThan(0);
    expect(place).toBeGreaterThan(0);
    // the release is written from the contract the keep returned; the binding from the statement the placement confirmed
    expect(src).toContain("contract: retained.contract");
    // every publication identity is keyed by the secret retained with the keep, which no public content can reproduce
    expect(src).toContain("retained.secret");
    expect(src).toContain("keep.secret");
    expect(src).toContain("writeKeep(");
    expect(src).toMatch(/pins,\s*statement,?\s*\}\);/);
    expect(src).toContain("keep.secret");
    // no code path writes a caller-supplied acceptance: the accepted set comes from the Mirror of the contract's own content
    expect(src).toContain("items_displayed_and_accepted: mirrorItems(body).map((i) => i.id)");
    expect(src).not.toMatch(/items_displayed_and_accepted:\s*(input|params|p\.|args)/);
  });

  it("the binding is only ever the native, explicit player-authored first ACTIVATION", () => {
    const src = code(MODULE);
    expect(src).toContain('bridge: "NATIVE_ALREADY_THERE"');
    expect(src).toContain('established_by: "EXPLICIT_PLAYER_AUTHORED_FACT"');
    expect(src).not.toMatch(
      /EXISTING_ACTOR_HANDOVER|"PORTAL"|SUMMONING|EXPLICIT_DELEGATION|STRONG_SEMANTIC_IMPLICATION/,
    );
  });
});

describe("the retained keep module is the only place the secret is drawn", () => {
  const keepModule = `${SRC}/original-pc-keep.ts`;
  it("imports only node built-ins, zod and the contracts and engine packages, and takes the engine's file-system seam and canonical equality", () => {
    expect([...new Set(importedNames(keepModule, "@immortalis/engine"))].sort()).toEqual([
      "FsOps",
      "canonicalEqual",
      "nodeFs",
    ]);
    expect(code(keepModule)).toMatch(/randomBytes\(32\)/);
    expect(code(MODULE)).not.toMatch(/randomBytes|randomUUID|Math\.random|Date\.now|new Date/);
  });
  it("never writes canon and never replaces a retained record", () => {
    const src = code(keepModule);
    expect(src).not.toMatch(
      /CanonicalCampaign|\.commit\(|releasePlayerCharacter|bindPlayerCharacter/,
    );
    expect(src).toContain("createExclusive");
  });
});

describe("the document states the mechanism and what it does not establish", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("names its authority, the owners, the order, the refusals and the truth boundary", () => {
    for (const s of [
      "884d09e889d6908e0244a7dbdfb49bbdde060843",
      "2026-10-10T15:13:41.323Z",
      "pc_existence/existence_contract",
      "role_registry/player_character_binding",
      "NATIVE_ALREADY_THERE",
      "EXPLICIT_PLAYER_AUTHORED_FACT",
      "released but unbound",
      "first-ACTIVATION physical custody",
      "PF-6/F-028",
    ])
      expect(doc, s).toContain(s);
  });

  it("claims no physical location, perception, movement or First Playable", () => {
    expect(doc).toMatch(/not .*First Playable/i);
    expect(doc).toMatch(/physical (position|location|custody)/i);
    expect(doc).not.toMatch(/First Playable (passes|is achieved|is met)/i);
  });
});

describe("the retained live-host evidence the documents cite is actually in the repository", () => {
  it("every evidence file named in docs/evidence/b61-a3-live-host-exercise.md exists, and no evidence is a git-ignored file", () => {
    const doc = readFileSync("docs/evidence/b61-a3-live-host-exercise.md", "utf8");
    const base = "docs/evidence/b61-a3-live-host";
    const names = [
      ...new Set(
        [
          ...doc.matchAll(/`((?:registered-client\/)?(?:player|host|client)-[A-Za-z0-9*._-]+)`/g),
        ].map((m) => m[1]!),
      ),
    ];
    expect(names.length).toBeGreaterThan(3);
    const files = readdirSync(`${base}/registered-client`).map((n) => `registered-client/${n}`);
    const top = readdirSync(base);
    const all = new Set([...top, ...files]);
    for (const n of names) {
      const re = new RegExp(`^${n.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      expect(
        [...all].some((x) => re.test(x)),
        n,
      ).toBe(true);
    }
    expect([...all].filter((x) => x.endsWith(".log"))).toEqual([]);
  });
});
