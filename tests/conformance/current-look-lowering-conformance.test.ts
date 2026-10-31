/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with arbitrary lock and citation values */
// F-027 v1.0 additive executable lowerings of the Active-PC Current-Look premise (31 October 2026, v0.8 carrier, native pin
// 2026-10-31T06:30:53.024Z): ONE non-executable lineage row and TWO executable lowering rows in the spec lock, the checker's closed tables
// for them, and the two registry citations they source-lock. MECHANISM ONLY. Nothing here shows Health clearance (Health S1), a real host,
// a named client, retained storage or the historical WG/F-014D wording (L5/F014D-6-MAIN): all of those stay open.
//
// The expectations below are written out literally from the ratified carrier (sections 2, 4 and 5), NOT derived from the constructor or the
// checker table under test, so a drift of either one is caught here.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  FACET_REFEREE_PROVENANCE,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_REFEREE_KERNEL,
  OWNER_WORLD_STATE,
  REFEREE_OP_SCENE,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  F027_CURRENT_LOOK_LOWERING_SOURCE,
  REFEREE_OBSERVATION_RULE,
  REFEREE_PHYSICAL_RULE,
  REFEREE_RULE,
  REFEREE_SCENE_RULE,
  WORLD_PC_CURRENT_VIEWING_RULE,
  factKind,
} from "@immortalis/engine";
import {
  REQUIRED_DESIGN_LINEAGE,
  REQUIRED_EXECUTABLE_LOWERINGS,
  checkSpec,
} from "../../tools/check-spec.ts";
import { expectNotALockPin } from "../support/lock.ts";
import { PRESENT_DAY_CODE_IDENTITIES } from "../support/present-day-identities.ts";
import {
  PRE_LOWERING_SCENE_RULE,
  PRE_LOWERING_SCENE_RULE_SHA256,
  PRE_LOWERING_VIEWING_RULE,
  PRE_LOWERING_VIEWING_RULE_SHA256,
} from "../support/pre-lowering-citations.ts";
import { tempDir } from "../support/tmp.ts";

const rawLock = readFileSync("spec/f027/spec-lock.json", "utf8");
const lock = JSON.parse(rawLock) as Record<string, any>;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex");

const PAGE = "https://app.notion.com/p/40a20af901e081ae900fe03017f25640";
const PIN = "2026-10-31T06:30:53.024Z";
const WORLD_ID = "PC-CURRENT-LOOK-WORLD-LOWERING";
const SCENE_ID = "GM-CURRENT-LOOK-SCENE-LOWERING";
const LINEAGE_ID = "PC-CURRENT-LOOK-PREMISE-LINEAGE";
const WORLD_SECTION = "§3A — Frozen executable lowering: World-State current-look premise";
const SCENE_SECTION = "§3B — Frozen executable lowering: Referee ordinary-look scene decision";

/** carrier section 2: the four exclusions both rows carry, each its own string, in this order */
const COMMON_DOES_NOT = [
  "does not replace, narrow, supersede or restate any of the 23 frozen F-027 source pins or the original WG/F-014D citations",
  "does not originate new GM-owned physical, position, target-visibility, Health, Epistemic, or intrinsic PC facts",
  "does not enable a legacy reader, a journal cutover, read-either acceptance, or a migration",
  "does not settle historical L5/F014D-6-MAIN, Health S1, H3/D-2, H-07, or live host, named-client and retained-storage acceptance",
];
/** carrier section 2: the scene row's additional, fifth exclusion */
const SCENE_ONLY_DOES_NOT =
  "does not lock the referee_decision kind-level REFEREE_RULE, its referee_adjudication_kernel owner, referee_provenance facet or key space, all of which remain under B61-A3 with the base rule sovereign-approved-not-native-pinned-not-spec-locked; does not modify REFEREE_PHYSICAL_RULE or REFEREE_OBSERVATION_RULE or license their operations through GM_SCENE_RESOLUTION";

const rows = (): any[] => lock["executable_lowerings"];
const row = (id: string): any => rows().find((r) => r.id === id);
const lineageRow = (): any =>
  lock["design_lineage_successors"].find((r: any) => r.id === LINEAGE_ID);

/** the lock, the register, the gates, the Runtime Contract snapshot and the generated identity, copied; `edit` alters the copied lock */
function mutate(edit: (l: any) => void): string[] {
  const root = tempDir("immortalis-lock-");
  for (const rel of [
    "spec/f027/spec-lock.json",
    "spec/f027/runtime-contract.md",
    "spec/f027/acceptance-register.yaml",
    "spec/f027/open-gates.yaml",
    "packages/contracts/src/spec-identity.ts",
  ]) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    cpSync(rel, join(root, rel));
  }
  const l = JSON.parse(readFileSync(join(root, "spec/f027/spec-lock.json"), "utf8"));
  edit(l);
  writeFileSync(join(root, "spec/f027/spec-lock.json"), JSON.stringify(l, null, 2) + "\n");
  return checkSpec(root);
}
const has = (errors: string[], text: RegExp) => expect(errors.join("\n")).toMatch(text);
/**
 * every error except the two that any edit of a COPIED lock necessarily causes: the generated identity no longer mirrors the edited lock,
 * and the temporary root holds only the spec files (not the tests the acceptance register names)
 */
const real = (errors: string[]) =>
  errors.filter((e) => !/spec-identity\.ts is out of date|partial_evidence test not found/.test(e));

describe("the lock: one non-executable lineage row and two additive executable lowerings, appended", () => {
  it("the lineage row is the carrier's exact section 2 row: DESIGN_RATIFIED, non-executable, supersedes and narrows nothing, no frozen source", () => {
    const e = lineageRow();
    const { note, ...rest } = e;
    expect(typeof note).toBe("string");
    expect(rest).toEqual({
      id: LINEAGE_ID,
      of_frozen_source: null,
      url: "https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d",
      native_pin: "2026-10-31T03:34:15.074Z",
      sections: [
        "Active-PC Current-Look Physical Premise — Sovereign-Ratified Additive Section — 31 October 2026",
      ],
      status: "DESIGN_RATIFIED",
      executable: false,
      narrows_frozen_pin: false,
      supersedes: null,
      superseded_by: null,
    });
    // appended AFTER the four original rows, which are byte-identical and in order
    expect(lock["design_lineage_successors"].map((r: any) => r.id)).toEqual([
      "R1-WG-LINEAGE",
      "R1-TEMPORAL-LINEAGE",
      "R1-EPISTEMIC-LINEAGE",
      "R1-PC-CUSTODY-LINEAGE",
      LINEAGE_ID,
    ]);
    expect(sha(lock["design_lineage_successors"].slice(0, 4))).toBe(
      "194d76ee5c8c50d1475fd0de4d25b54f3e827b16bb1c21ee10a579e05a17fd9d",
    );
    expect(sha(lock["design_lineage_successors"][3])).toBe(
      "ac22e960da47e40713728a482ee4b40f5a9d71406d369e113662e15473c0fca6",
    );
  });

  it("the World-State lowering is IM-03, names exactly world_pc_current_viewing, carries NO operation key, and the four common exclusions in order", () => {
    const { title, scope, ...r } = row(WORLD_ID);
    expect(typeof title).toBe("string");
    expect(typeof scope).toBe("string");
    expect(r).toEqual({
      id: WORLD_ID,
      url: PAGE,
      native_pin: PIN,
      section: WORLD_SECTION,
      status: "FROZEN_EXECUTABLE_LOWERING",
      executable: true,
      relation: "COMPOSES_WITH",
      composed_with: {
        id: "F-027",
        version: "v1.0",
        package_native_pin: "2026-09-29T00:40:44.707Z",
      },
      cites_design_lineage: [LINEAGE_ID],
      supersedes: null,
      superseded_by: null,
      primary_im: "IM-03",
      fact_kinds: ["world_pc_current_viewing"],
      does_not: COMMON_DOES_NOT,
    });
    expect(Object.hasOwn(row(WORLD_ID), "operation")).toBe(false);
  });

  it("the scene lowering is IM-12, names exactly referee_decision at operation GM_SCENE_RESOLUTION only, and the same four plus the scene-only fifth exclusion in order", () => {
    const { title, scope, ...r } = row(SCENE_ID);
    expect(typeof title).toBe("string");
    expect(typeof scope).toBe("string");
    expect(r).toEqual({
      id: SCENE_ID,
      url: PAGE,
      native_pin: PIN,
      section: SCENE_SECTION,
      status: "FROZEN_EXECUTABLE_LOWERING",
      executable: true,
      relation: "COMPOSES_WITH",
      composed_with: {
        id: "F-027",
        version: "v1.0",
        package_native_pin: "2026-09-29T00:40:44.707Z",
      },
      cites_design_lineage: [LINEAGE_ID],
      supersedes: null,
      superseded_by: null,
      primary_im: "IM-12",
      fact_kinds: ["referee_decision"],
      operation: "GM_SCENE_RESOLUTION",
      does_not: [...COMMON_DOES_NOT, SCENE_ONLY_DOES_NOT],
    });
    // the lock's operation is the contracts' own constant, not a copy that could drift
    expect(row(SCENE_ID).operation).toBe(REFEREE_OP_SCENE);
  });

  it("they are the third and fourth executable lowerings, in this order; the original two rows, the 23 frozen pins and every other section are byte-identical", () => {
    expect(rows().map((r) => r.id)).toEqual([
      "R1-STAGE-ONE-V1.1-LOWERING",
      "S1-P1-WG-LOWERING",
      WORLD_ID,
      SCENE_ID,
    ]);
    expect(Object.keys(REQUIRED_EXECUTABLE_LOWERINGS)).toEqual(rows().map((r) => r.id));
    expect(Object.keys(REQUIRED_DESIGN_LINEAGE)).toEqual(
      lock["design_lineage_successors"].map((r: any) => r.id),
    );
    expect(sha(rows()[0])).toBe("1ddfb7f3773145f81ef3c2f43759682c444e636c430d428302e2440937ef51f8");
    expect(sha(rows()[1])).toBe("c9b62fd9505a5699c7a763c3b9383396be16212dc831bc96bf035326f49cad1e");
    expect(sha(lock["frozen_sources"])).toBe(
      "d12a4d73380f75d2594ed8aacf77ad6eb85d7679a235f37faa4412810d075de7",
    );
    expect(lock["frozen_sources"]).toHaveLength(23);
    expect(sha(lock["rules"])).toBe(
      "736a27bef959afbbc88266d6eab4ffc56892d8509aaa71054821e0dba037c53c",
    );
    expect(lock["implementation_authority_addenda"].map((a: any) => a.id)).toEqual(["F-027-CD1"]);
    expect(lock["package"].native_pin).toBe("2026-09-29T00:40:44.707Z");
  });

  it("the lowering page is in no frozen source, addendum, tranche or governance reference, and the 8 October contract page is still lineage only", () => {
    const page = "40a20af901e081ae900fe03017f25640";
    for (const section of [
      "frozen_sources",
      "implementation_authority_addenda",
      "incorporated_tranches",
      "governance_references",
    ])
      expect(JSON.stringify(lock[section]), section).not.toContain(page);
    expect(JSON.stringify(lock["design_lineage_successors"])).not.toContain(page);
    // the page appears in exactly the two executable lowering rows, by url
    expect(
      rows()
        .filter((r) => JSON.stringify(r).includes(page))
        .map((r) => r.id),
    ).toEqual([WORLD_ID, SCENE_ID]);
    expectNotALockPin(lock, "3f320af901e08166ad96ca0fc5e5069d", [
      "2026-10-08T01:25:36.611Z",
      "2026-10-08T01:30:19.780Z",
    ]);
  });

  it("the generated build identity mirrors this lock, and the three snapshot inputs are unchanged", () => {
    expect(checkSpec(".")).toEqual([]);
    expect(BUILD_SPEC_IDENTITY.spec_lock_sha256).toBe(
      createHash("sha256").update(rawLock.replace(/\r\n/g, "\n"), "utf8").digest("hex"),
    );
    expect(lock["snapshot_files"]).toEqual({
      "spec/f027/runtime-contract.md":
        "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
      "spec/f027/acceptance-register.yaml":
        "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
      "spec/f027/open-gates.yaml":
        "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    });
    expect(BUILD_SPEC_IDENTITY.snapshot_files).toEqual(lock["snapshot_files"]);
  });

  it("the new standalone test is NOT added to IA-01 partial_evidence: IA-01 covers the four frozen-source foundation kinds", () => {
    const text = readFileSync("spec/f027/acceptance-register.yaml", "utf8");
    expect(text).not.toContain("current-look-lowering-conformance");
    expect(text).not.toContain(PAGE);
  });
});

describe("the checker's closed tables hold the new rows exactly, and refuse each way of blurring them", () => {
  it("the unmutated lock is accepted", () => {
    expect(real(mutate(() => undefined))).toEqual([]);
  });

  it("the lineage row: wrong pin, wrong page, wrong titles, executable, narrowing, superseding, a frozen source, promotion, absent, duplicated", () => {
    const l = (x: any) => x.design_lineage_successors.find((e: any) => e.id === LINEAGE_ID);
    has(
      mutate((x) => (l(x).native_pin = "2026-10-31T03:34:15.075Z")),
      new RegExp(`${LINEAGE_ID} must be pinned at exactly`),
    );
    has(
      mutate((x) => (l(x).native_pin = "2026-10-08T01:25:36.611Z")),
      new RegExp(`${LINEAGE_ID} must be pinned at exactly`),
    );
    has(
      mutate((x) => (l(x).url = "https://app.notion.com/p/other")),
      new RegExp(`${LINEAGE_ID} must name`),
    );
    has(
      mutate((x) => (l(x).sections = ["Another section"])),
      new RegExp(`${LINEAGE_ID} must list exactly its ratified section title`),
    );
    has(
      mutate((x) => (l(x).sections = [...l(x).sections, "Another section"])),
      new RegExp(`${LINEAGE_ID} must list its 1 exact section`),
    );
    has(
      mutate((x) => (l(x).executable = true)),
      new RegExp(`${LINEAGE_ID} is DESIGN_RATIFIED and never executable`),
    );
    has(
      mutate((x) => (l(x).status = "FROZEN_EXECUTABLE_LOWERING")),
      new RegExp(`${LINEAGE_ID} is DESIGN_RATIFIED and never executable`),
    );
    has(
      mutate((x) => (l(x).narrows_frozen_pin = true)),
      new RegExp(`${LINEAGE_ID} may not supersede or narrow`),
    );
    has(
      mutate((x) => (l(x).supersedes = "WG")),
      new RegExp(`${LINEAGE_ID} may not supersede or narrow`),
    );
    has(
      mutate((x) => (l(x).superseded_by = "x")),
      new RegExp(`${LINEAGE_ID} may not supersede or narrow`),
    );
    has(
      mutate((x) => (l(x).of_frozen_source = "WG")),
      new RegExp(`${LINEAGE_ID} extends null`),
    );
    has(
      mutate((x) =>
        x.frozen_sources.push({ id: "CURRENT-LOOK", url: l(x).url, native_pin: l(x).native_pin }),
      ),
      /may not be promoted into the frozen sources/,
    );
    has(
      mutate((x) =>
        x.implementation_authority_addenda.push({
          ...x.implementation_authority_addenda[0],
          id: "X",
          url: l(x).url,
        }),
      ),
      /may not be promoted into the implementation authority addenda/,
    );
    has(
      mutate(
        (x) =>
          (x.design_lineage_successors = x.design_lineage_successors.filter(
            (e: any) => e.id !== LINEAGE_ID,
          )),
      ),
      new RegExp(`${LINEAGE_ID} appears 0 times`),
    );
    has(
      mutate((x) => x.design_lineage_successors.push({ ...l(x) })),
      new RegExp(`${LINEAGE_ID} appears 2 times`),
    );
  });

  for (const [id, label] of [
    [WORLD_ID, "World-State"],
    [SCENE_ID, "scene"],
  ] as const) {
    const r = (x: any) => x.executable_lowerings.find((e: any) => e.id === id);
    it(`the ${label} lowering: wrong page or pin, wrong section, wrong IM, wrong kinds or lineage, wrong status, supersession or composition, absent, duplicated`, () => {
      has(
        mutate((x) => (r(x).url = "https://app.notion.com/p/other")),
        new RegExp(`${id} must name`),
      );
      has(
        mutate((x) => (r(x).native_pin = "2026-10-31T06:30:53.025Z")),
        new RegExp(`${id} must be pinned at exactly`),
      );
      has(
        mutate((x) => (r(x).native_pin = "2026-10-31T06:22:46.921Z")),
        new RegExp(`${id} must be pinned at exactly`),
      );
      has(
        mutate((x) => (r(x).section = id === WORLD_ID ? SCENE_SECTION : WORLD_SECTION)),
        new RegExp(`${id} must name its exact section`),
      );
      has(
        mutate((x) => delete r(x).section),
        new RegExp(`${id} must name its exact section`),
      );
      has(
        mutate((x) => (r(x).primary_im = id === WORLD_ID ? "IM-12" : "IM-03")),
        new RegExp(`${id} must be primary IM-`),
      );
      has(
        mutate((x) => delete r(x).primary_im),
        new RegExp(`${id} must be primary IM-`),
      );
      has(
        mutate((x) => (r(x).fact_kinds = ["actor_physical_presence"])),
        /exactly its fact kinds/,
      );
      has(
        mutate((x) => r(x).fact_kinds.push("world_locus")),
        /exactly its fact kinds/,
      );
      has(
        mutate((x) => (r(x).cites_design_lineage = [])),
        /exactly the design lineage/,
      );
      has(
        mutate((x) => (r(x).cites_design_lineage = ["R1-PC-CUSTODY-LINEAGE"])),
        /exactly the design lineage/,
      );
      has(
        mutate((x) => (r(x).executable = false)),
        new RegExp(`${id} is the frozen executable lowering`),
      );
      has(
        mutate((x) => (r(x).status = "DESIGN_RATIFIED")),
        new RegExp(`${id} is the frozen executable lowering`),
      );
      has(
        mutate((x) => (r(x).supersedes = "F-027")),
        /COMPOSE with F-027/,
      );
      has(
        mutate((x) => (r(x).superseded_by = "x")),
        /COMPOSE with F-027/,
      );
      has(
        mutate((x) => (r(x).relation = "REPLACES")),
        /COMPOSE with F-027/,
      );
      has(
        mutate((x) => (r(x).composed_with.package_native_pin = "x")),
        /package version and native pin/,
      );
      has(
        mutate(
          (x) => (x.executable_lowerings = x.executable_lowerings.filter((e: any) => e.id !== id)),
        ),
        new RegExp(`${id} appears 0 times`),
      );
      has(
        mutate((x) => x.executable_lowerings.push({ ...r(x) })),
        new RegExp(`${id} appears 2 times`),
      );
    });

    it(`the ${label} lowering: a missing, changed, extra, reordered or non-array does_not is falsified`, () => {
      const ordered = (x: any): string[] => r(x).does_not;
      const wanted = /ordered does_not exclusions/;
      has(
        mutate((x) => ordered(x).pop()),
        wanted,
      );
      has(
        mutate((x) => ordered(x).shift()),
        wanted,
      );
      has(
        mutate((x) => (ordered(x)[1] = ordered(x)[1] + " ")),
        wanted,
      );
      has(
        mutate((x) => (ordered(x)[0] = ordered(x)[0]!.replace("does not", "does"))),
        wanted,
      );
      has(
        mutate((x) => ordered(x).push("does not do anything else")),
        wanted,
      );
      has(
        mutate((x) => ordered(x).push(ordered(x)[0]!)),
        wanted,
      );
      has(
        mutate((x) => ordered(x).reverse()),
        wanted,
      );
      has(
        mutate((x) => ([ordered(x)[0], ordered(x)[1]] = [ordered(x)[1]!, ordered(x)[0]!])),
        wanted,
      );
      has(
        mutate((x) => (r(x).does_not = ordered(x).join("\n"))),
        wanted,
      );
      has(
        mutate((x) => delete r(x).does_not),
        wanted,
      );
      has(
        mutate((x) => (r(x).does_not = [])),
        wanted,
      );
    });
  }

  it("the World-State lowering names NO operation: a spurious operation key, whatever its value, is falsified", () => {
    const w = (x: any) => x.executable_lowerings.find((e: any) => e.id === WORLD_ID);
    for (const value of ["GM_SCENE_RESOLUTION", "", null, "IR_PHYSICAL_PLACEMENT"])
      has(
        mutate((x) => (w(x).operation = value)),
        new RegExp(`${WORLD_ID} must carry no operation key`),
      );
    // the scene-only fifth exclusion on the World row is an extra item: falsified as well
    has(
      mutate((x) => w(x).does_not.push(SCENE_ONLY_DOES_NOT)),
      /ordered does_not exclusions/,
    );
  });

  it("the scene lowering names operation GM_SCENE_RESOLUTION, and nothing else: missing, wrong, empty, null or other-operation values are falsified", () => {
    const s = (x: any) => x.executable_lowerings.find((e: any) => e.id === SCENE_ID);
    has(
      mutate((x) => delete s(x).operation),
      /must name operation GM_SCENE_RESOLUTION/,
    );
    for (const value of [
      "",
      null,
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
      "IR_NATIVE_COMPATIBILITY",
      "I002_CHARACTER_CLAIM",
      "gm_scene_resolution",
      ["GM_SCENE_RESOLUTION"],
    ])
      has(
        mutate((x) => (s(x).operation = value)),
        /must name operation GM_SCENE_RESOLUTION/,
      );
    // without the scene-only fifth exclusion the scene row is the World row's list: falsified
    has(
      mutate((x) => s(x).does_not.pop()),
      /ordered does_not exclusions/,
    );
  });

  it("the OLDER R1 and S1-P1 rows' own does_not is NOT newly checker-locked (RED O-2); their existing expectations are unchanged", () => {
    for (const id of ["R1-STAGE-ONE-V1.1-LOWERING", "S1-P1-WG-LOWERING"]) {
      const o = (x: any) => x.executable_lowerings.find((e: any) => e.id === id);
      expect(real(mutate((x) => o(x).does_not.pop()))).toEqual([]);
      expect(real(mutate((x) => o(x).does_not.reverse()))).toEqual([]);
      expect(real(mutate((x) => o(x).does_not.push("added")))).toEqual([]);
      // ... while the expectations they always had still bind
      has(
        mutate((x) => (o(x).native_pin = "2026-01-01T00:00:00.000Z")),
        new RegExp(`${id} must be pinned at exactly`),
      );
    }
    for (const id of ["R1-STAGE-ONE-V1.1-LOWERING", "S1-P1-WG-LOWERING"]) {
      const closed = REQUIRED_EXECUTABLE_LOWERINGS[id]!;
      expect(Object.keys(closed).sort()).toEqual(["kinds", "lineage", "pin", "url"]);
    }
    for (const id of ["R1-WG-LINEAGE", "R1-TEMPORAL-LINEAGE", "R1-EPISTEMIC-LINEAGE"])
      expect(Object.keys(REQUIRED_DESIGN_LINEAGE[id]!).sort()).toEqual([
        "of",
        "pin",
        "sections",
        "url",
      ]);
  });
});

describe("the registry: the two citations are the lowering page itself, built by one dedicated constructor, in the carrier's exact words", () => {
  // carrier section 4, written out
  const LOWERING = (id: string, section: string) =>
    `F-027 v1.0 additive executable lowering ${id}, section '${section}' (native pin 2026-10-31T06:30:53.024Z, https://app.notion.com/p/40a20af901e081ae900fe03017f25640), COMPOSES_WITH F-027 v1.0 (native pin 2026-09-29T00:40:44.707Z, https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639); not a 2026-09-25 frozen-source quotation`;
  const ACTIVE_LOOK =
    "Sovereign-ratified Active-PC Current-Look Physical Premise — Additive Section — 31 October 2026 (native pin 2026-10-31T03:34:15.074Z, https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d); Sovereign ratification and narrow historical-exception record (native pin 2026-10-31T05:28:54.280Z, https://app.notion.com/p/40a20af901e081189358cb60bae11ccd); F-027 PC-CURRENT-LOOK-PREMISE-LINEAGE is non-executable, not a September frozen-source quote";
  const I002_VIEWING =
    "I-002 §4.3: position and local world-locus differences remain runtime physical state, not intrinsic PC state (native pin 2026-09-25T00:15:54.536Z, https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718); the F-016 v0.4 candidate manifest (native pin 2026-09-25T13:48:12.575Z, https://app.notion.com/p/3e620af901e0812bb807d234d88fadb6) is supporting conformance evidence, not itself ratification";
  // the lineage entries the carrier says stay UNCHANGED are the ones the pre-change citations already carried, byte for byte
  const oldWorld = PRE_LOWERING_VIEWING_RULE.authority_lineage; // [SPEC_LOCK_BASIS, RATIFICATION, GM_FIRST_PLAY, F016, RUNTIME_TRANSLATION]
  const GM_FIRST_PLAY = oldWorld[2]!;
  const F016 = oldWorld[3]!;
  const RUNTIME_TRANSLATION = oldWorld[4]!;
  const oldScene = PRE_LOWERING_SCENE_RULE.authority_lineage; // [REFEREE_LINEAGE, GM_FIRST_PLAY, RUNTIME_TRANSLATION]
  const REFEREE_LINEAGE = oldScene[0]!;

  it("the unchanged lineage strings are the very ones the hash-pinned pre-change citations carried (the test-only data is not drifting)", () => {
    expect(sha(PRE_LOWERING_VIEWING_RULE)).toBe(PRE_LOWERING_VIEWING_RULE_SHA256);
    expect(sha(PRE_LOWERING_SCENE_RULE)).toBe(PRE_LOWERING_SCENE_RULE_SHA256);
    expect(oldScene[1]).toBe(GM_FIRST_PLAY);
    expect(oldScene[2]).toBe(RUNTIME_TRANSLATION);
    expect(F016).toMatch(
      /^F-016 Integrated Review Candidate v0\.4 manifest, pin 2026-09-25T13:48:12\.575Z/,
    );
    expect(GM_FIRST_PLAY).toMatch(/NOT independently verified$/);
    expect(RUNTIME_TRANSLATION).toMatch(/pin 2026-09-29T00:33:04\.009Z/);
    expect(REFEREE_LINEAGE).toMatch(/^BLUE B61-A3 /);
  });

  it("WORLD_PC_CURRENT_VIEWING_RULE is exactly the carrier's SourceRef: this page at this pin, the 3A clause, the six ordered lineage entries, pinned by the spec lock", () => {
    expect(WORLD_PC_CURRENT_VIEWING_RULE).toEqual({
      artifact: PAGE,
      native_pin: PIN,
      clause: WORLD_SECTION,
      authority_lineage: [
        LOWERING(WORLD_ID, WORLD_SECTION),
        ACTIVE_LOOK,
        F016,
        I002_VIEWING,
        GM_FIRST_PLAY,
        RUNTIME_TRANSLATION,
      ],
      effective_basis: "pinned-by-spec-lock",
      supersedes: null,
    });
    // the generic helper's misleading 25 September basis and ratification strings are not on this October citation
    expect(JSON.stringify(WORLD_PC_CURRENT_VIEWING_RULE)).not.toContain("W3-CP3");
    expect(WORLD_PC_CURRENT_VIEWING_RULE.authority_lineage).not.toContain(oldWorld[0]);
    expect(WORLD_PC_CURRENT_VIEWING_RULE.authority_lineage).not.toContain(oldWorld[1]);
  });

  it("REFEREE_SCENE_RULE is exactly the carrier's SourceRef: this page at this pin, the 3B clause, the five ordered lineage entries, pinned by the spec lock", () => {
    expect(REFEREE_SCENE_RULE).toEqual({
      artifact: PAGE,
      native_pin: PIN,
      clause: SCENE_SECTION,
      authority_lineage: [
        LOWERING(SCENE_ID, SCENE_SECTION),
        ACTIVE_LOOK,
        REFEREE_LINEAGE,
        GM_FIRST_PLAY,
        RUNTIME_TRANSLATION,
      ],
      effective_basis: "pinned-by-spec-lock",
      supersedes: null,
    });
  });

  it("each citation's (artifact, native_pin) equals its lock row's (url, native_pin), and its kind's IM equals the row's primary_im", () => {
    for (const [rule, id, kindId] of [
      [WORLD_PC_CURRENT_VIEWING_RULE, WORLD_ID, "world_pc_current_viewing"],
      [REFEREE_SCENE_RULE, SCENE_ID, "referee_decision"],
    ] as const) {
      expect(rule.artifact).toBe(row(id).url);
      expect(rule.native_pin).toBe(row(id).native_pin);
      expect(rule.clause).toBe(row(id).section);
      expect(factKind(kindId).im).toBe(row(id).primary_im);
      expect(row(id).fact_kinds).toEqual([kindId]);
    }
    expect(F027_CURRENT_LOOK_LOWERING_SOURCE).toEqual({ artifact: PAGE, native_pin: PIN });
    expect(F027_CURRENT_LOOK_LOWERING_SOURCE.artifact).toBe(row(WORLD_ID).url);
    expect(F027_CURRENT_LOOK_LOWERING_SOURCE.native_pin).toBe(row(SCENE_ID).native_pin);
  });

  it("the kinds' owners, facets, lifecycle and key spaces are unchanged; the world kind's rule IS the new citation and the Referee kind's alternate scene rule is", () => {
    const viewing = factKind("world_pc_current_viewing");
    expect([viewing.owner, viewing.facet, viewing.lifecycle]).toEqual([
      OWNER_WORLD_STATE,
      FACET_WORLD_FALLBACK_ENTITY,
      "SEALED",
    ]);
    expect(viewing.rule).toBe(WORLD_PC_CURRENT_VIEWING_RULE);
    expect(viewing.keyPattern.source).toBe(
      "^world-state\\/pc\\/([A-Za-z0-9][A-Za-z0-9._:-]*)\\/current-viewing\\/([0-9a-f]{32})$",
    );
    const referee = factKind("referee_decision");
    expect([referee.owner, referee.facet, referee.lifecycle, referee.im]).toEqual([
      OWNER_REFEREE_KERNEL,
      FACET_REFEREE_PROVENANCE,
      "SEALED",
      "IM-12",
    ]);
    expect(referee.keyPattern.source).toBe("^referee\\/([0-9a-f]{64})\\/decision$");
    expect(referee.alternateRules!.map((a) => a.rule)).toEqual([
      REFEREE_PHYSICAL_RULE,
      REFEREE_OBSERVATION_RULE,
      REFEREE_SCENE_RULE,
    ]);
  });

  it("the kind-level REFEREE_RULE and the physical and observation citations are byte-identical to the pre-change head and carry neither the new page nor a spec-lock basis", () => {
    expect(sha(REFEREE_RULE)).toBe(
      "255404898fe15f18a64743a1b1fc9e96e25ed5fab86096798c260ce6728b5b61",
    );
    expect(sha(REFEREE_PHYSICAL_RULE)).toBe(
      "4e957200cf2c2369d4897f57e7e8e3b30da63c5ff7873583802e1059b37f6563",
    );
    expect(sha(REFEREE_OBSERVATION_RULE)).toBe(
      "60af31286c4c1875017b42ca2c8cc02c27e49f18999350a8ca78d49deb895e31",
    );
    expect(factKind("referee_decision").rule).toBe(REFEREE_RULE);
    for (const rule of [REFEREE_RULE, REFEREE_PHYSICAL_RULE, REFEREE_OBSERVATION_RULE]) {
      const text = JSON.stringify(rule);
      expect(text).not.toContain("40a20af901e081ae900fe03017f25640");
      expect(text).not.toContain("PC-CURRENT-LOOK");
      expect(text).not.toContain("2026-10-31T06:30:53.024Z");
      expect(rule.effective_basis).not.toBe("pinned-by-spec-lock");
    }
    expect(REFEREE_RULE.effective_basis).toBe(
      "sovereign-approved-not-native-pinned-not-spec-locked",
    );
  });

  it("exactly these two citations name the lowering page: no other kind, rule or alternate rule in the registry does", () => {
    const citing: string[] = [];
    for (const kind of ALL_FACT_KINDS)
      for (const rule of [kind.rule, ...(kind.alternateRules ?? []).map((a) => a.rule)]) {
        const text = JSON.stringify(rule);
        if (text.includes("40a20af901e081ae900fe03017f25640"))
          citing.push(`${kind.id}:${rule.clause}`);
        if (rule.native_pin === PIN) expect(rule.artifact).toBe(PAGE);
      }
    expect(citing.sort()).toEqual(
      [`referee_decision:${SCENE_SECTION}`, `world_pc_current_viewing:${WORLD_SECTION}`].sort(),
    );
  });

  it("the Referee scene citation is admitted for the scene operation only: the other operations' values, and anything that is not a decision record, are refused", () => {
    const scene = factKind("referee_decision").alternateRules![2]!;
    expect(scene.rule).toBe(REFEREE_SCENE_RULE);
    for (const operation of [
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
      "IR_NATIVE_COMPATIBILITY",
      "I002_CHARACTER_CLAIM",
      "GM_SCENE_RESOLUTION",
      "ANYTHING_ELSE",
    ])
      expect(scene.admits({ operation }), operation).toBe(false); // an incomplete value is not a record at all
    expect(scene.admits(null)).toBe(false);
    expect(scene.admits("GM_SCENE_RESOLUTION")).toBe(false);
    // (the positive, with a real retained scene record and the real physical, observation, I-002 and IR records, is the integration test)
  });

  it("the earlier citations are hash-pinned test data only: neither whole value, nor its distinguishing clause, is in any production module", () => {
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "dist") walk(p);
        } else if (/\.(ts|tsx|js|mjs|json)$/.test(e.name)) sources.push(p);
      }
    };
    for (const pkg of readdirSync("packages")) {
      const src = join("packages", pkg, "src");
      if (existsSync(src)) walk(src);
    }
    walk("apps");
    const all = sources.map((p) => readFileSync(p, "utf8")).join("\n");
    expect(sources.length).toBeGreaterThan(100);
    // the earlier scene clause and the earlier viewing clause (and their WG pin pairing) exist nowhere a production process could read
    expect(all).not.toContain(PRE_LOWERING_SCENE_RULE.clause);
    expect(all).not.toContain(PRE_LOWERING_VIEWING_RULE.clause);
    // and the new citations are different values from the earlier ones
    expect(sha(WORLD_PC_CURRENT_VIEWING_RULE)).not.toBe(PRE_LOWERING_VIEWING_RULE_SHA256);
    expect(sha(REFEREE_SCENE_RULE)).not.toBe(PRE_LOWERING_SCENE_RULE_SHA256);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// PROVENANCE (BLUE H-PROVENANCE hold, 31 October 2026). The F-027 lock and the owner registry were changed ON PURPOSE by this PR. An older
// suite or foundation document that says "unchanged since main" was true of ITS slice and stays a statement about that slice: it may not be
// quietly re-pinned to today's bytes. Original values are kept here as history; today's identities are asserted ONLY here, and labeled as such.
// ---------------------------------------------------------------------------------------------------------------------------------------

/** ORIGINAL values: what main (8fda533, and PR #94 up to 853f2da for the lock) carried. History, not expectations about the working tree. */
const ORIGINAL_MAIN_LOCK_BLOB = "2df29edfd08b1fb986666c94153f9432cf227324";
const ORIGINAL_MAIN_LOCK_SHA256 =
  "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6";
const ORIGINAL_MAIN_REGISTRY_SHA256 =
  "7450fe62f3201981918031bb98b5e49004de642f82eb0732348314a861a4d0a2";
/** CURRENT v0.8 HEAD expectations. NOT original-main pins and NOT PR #61 pins: a later change to either file must update them, here only. */
const CURRENT_V08_LOCK_SHA256 = "2133b8b80f3078c90d84d5d75845169164bafcd8541aa614981da63ac55af18c";
const CURRENT_V08_REGISTRY_SHA256 =
  "926aa1af36d783ef3760524ad36f3ebc6994f906bf9861bbbdc1e1adb8d97116";
const gitBlobOf = (text: string): string => {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
};
const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const lf = (text: string): string => text.replace(/\r\n/g, "\n");

/** The lock with exactly the three v0.8 rows removed and nothing else touched, serialised the way the lock is written. */
function lockWithoutV08Rows(): string {
  const copy = JSON.parse(rawLock) as Record<string, any>;
  copy["design_lineage_successors"] = copy["design_lineage_successors"].filter(
    (r: any) => r.id !== LINEAGE_ID,
  );
  copy["executable_lowerings"] = copy["executable_lowerings"].filter(
    (r: any) => r.id !== WORLD_ID && r.id !== SCENE_ID,
  );
  return JSON.stringify(copy, null, 2) + "\n";
}

const HISTORICAL_FOUNDATION_DOCS = [
  "docs/additional-locality-admission-foundation.md",
  "docs/additional-source-admission-foundation.md",
  "docs/initial-local-demand-admission-foundation.md",
  "docs/initial-population-admission-foundation.md",
  "docs/initial-timed-governance-admission-foundation.md",
  "docs/production-reserve-admission-foundation.md",
  "docs/protocol-pc-corridor-relocation-foundation.md",
  "docs/source-qualified-observation-foundation.md",
  "docs/world-corridor-logistics-read-foundation.md",
];

/** Every spot in a test or document that states one of TODAY'S lock or registry identities (the conflation this guard forbids elsewhere). */
function currentIdentitiesIn(text: string): string[] {
  const current = [
    CURRENT_V08_LOCK_SHA256,
    CURRENT_V08_REGISTRY_SHA256,
    gitBlobOf(lf(rawLock)),
    BUILD_SPEC_IDENTITY.spec_lock_sha256,
    ...Object.values(PRESENT_DAY_CODE_IDENTITIES),
  ];
  return [...new Set(current)].filter((c) => text.includes(c));
}

describe("provenance: original identities are history, today's are asserted only here and labeled as today's (H-PROVENANCE)", () => {
  it("the ORIGINAL main lock is exactly the current lock minus the three v0.8 rows: same git blob and SHA-256 as before this PR touched it", () => {
    const original = lockWithoutV08Rows();
    expect(gitBlobOf(original)).toBe(ORIGINAL_MAIN_LOCK_BLOB);
    expect(sha256Of(original)).toBe(ORIGINAL_MAIN_LOCK_SHA256);
    // ... and the current lock is a different file: the change is real and additive, not hidden by the reconstruction
    expect(sha256Of(lf(rawLock))).not.toBe(ORIGINAL_MAIN_LOCK_SHA256);
    expect(gitBlobOf(lf(rawLock))).not.toBe(ORIGINAL_MAIN_LOCK_BLOB);
  });

  it("CURRENT v0.8 head expectations (not original-main pins): the lock and the owner registry", () => {
    expect(sha256Of(lf(rawLock))).toBe(CURRENT_V08_LOCK_SHA256);
    expect(BUILD_SPEC_IDENTITY.spec_lock_sha256).toBe(CURRENT_V08_LOCK_SHA256);
    const registry = lf(readFileSync("packages/engine/src/owners/registry.ts", "utf8"));
    expect(sha256Of(registry)).toBe(CURRENT_V08_REGISTRY_SHA256);
    // the registry is no longer what main carried: PR #94 changed it on purpose, so no suite may call it unchanged since main
    expect(CURRENT_V08_REGISTRY_SHA256).not.toBe(ORIGINAL_MAIN_REGISTRY_SHA256);
  });

  it("the historical foundation documents keep their ORIGINAL time-scoped statements: each names the original lock blob and not today's", () => {
    const today = gitBlobOf(lf(rawLock));
    expect(today).not.toBe(ORIGINAL_MAIN_LOCK_BLOB);
    for (const doc of HISTORICAL_FOUNDATION_DOCS) {
      const text = readFileSync(doc, "utf8");
      expect(text, doc).toContain(ORIGINAL_MAIN_LOCK_BLOB);
      expect(text, doc).not.toContain(today);
      expect(currentIdentitiesIn(text), doc).toEqual([]);
    }
  });

  it("no older suite or document states today's lock or registry identity: they assert history, and today's identities live only in this test", () => {
    const here = "tests/conformance/current-look-lowering-conformance.test.ts";
    const table = "tests/support/present-day-identities.ts";
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|md)$/.test(entry.name) && path !== here && path !== table) {
          const hits = currentIdentitiesIn(readFileSync(path, "utf8"));
          // the generated build identity is the lock's own mirror, and the PR text may cite it: only suites and the historical documents are policed
          if (hits.length > 0 && path !== "packages/contracts/src/spec-identity.ts")
            found.push(`${path}: ${hits.join(", ")}`);
        }
      }
    };
    walk("tests");
    walk("docs");
    expect([...new Set(found)]).toEqual([]);
  });

  it("the guard is not vacuous: a suite that re-pinned today's lock or registry value into an old 'unchanged since main' map is caught", () => {
    const repinnedLock = `const UNCHANGED = { "spec/f027/spec-lock.json": "${CURRENT_V08_LOCK_SHA256}" }; // byte-identical to main`;
    const repinnedRegistry = `"packages/engine/src/owners/registry.ts": "${CURRENT_V08_REGISTRY_SHA256}", // exactly as it stood at the base`;
    const repinnedBlob = `expect(blob).toBe("${gitBlobOf(lf(rawLock))}"); // the spec lock is unchanged`;
    expect(currentIdentitiesIn(repinnedLock)).toEqual([CURRENT_V08_LOCK_SHA256]);
    expect(currentIdentitiesIn(repinnedRegistry)).toEqual([CURRENT_V08_REGISTRY_SHA256]);
    expect(currentIdentitiesIn(repinnedBlob)).toEqual([gitBlobOf(lf(rawLock))]);
    // the original values, which the old suites may keep stating as history, are not flagged
    expect(
      currentIdentitiesIn(
        `${ORIGINAL_MAIN_LOCK_BLOB} ${ORIGINAL_MAIN_LOCK_SHA256} ${ORIGINAL_MAIN_REGISTRY_SHA256}`,
      ),
    ).toEqual([]);
  });
});
