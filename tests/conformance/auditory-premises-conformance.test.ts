/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with arbitrary lock and fact values */
// S1-P1 — conformance: the two new kinds and the typed profile are exactly the frozen lowering (owner, facet, lifecycle, key space,
// governing citation); the F-027 lock records ONE additive executable lowering and leaves the 23 frozen pins, the R1 lowering and
// the R1 lineage byte-unchanged; the evaluator is pure and read-only; nothing outside the physical-source slice was built (no
// Health, no F-014D event, receipt or packet, no operator command, no endpoint); R1 is untouched; PR #72 and PR #73 are not carried.
// MECHANISM ONLY: no perception, no Health clearance, no individual hearing receipt.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AcousticProfileV1Schema,
  WorldLocusSchema,
  actorRawSensoryStateKey,
  worldAcousticEmissionKey,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  WG_SOURCE,
  WORLD_AUDITORY_PREMISES_FACT_KINDS,
  WORLD_AUDITORY_PREMISES_FACT_KIND_IDS,
  WORLD_AUDITORY_PREMISES_RULE,
  factKind,
  resolveKey,
} from "@immortalis/engine";
import { REQUIRED_EXECUTABLE_LOWERINGS, checkSpec } from "../../tools/check-spec.ts";
import { tempDir } from "../support/tmp.ts";

const rawLock = readFileSync("spec/f027/spec-lock.json", "utf8");
const lock = JSON.parse(rawLock) as Record<string, any>;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex");
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );
const treeSha = (d: string): string => {
  const h = createHash("sha256");
  for (const f of walk(d).sort()) h.update(`${f}\0${fileSha(f)}\n`);
  return h.digest("hex");
};
/** Source with comments removed, so that prose explaining a prohibition is not mistaken for code. */
const codeOf = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const P1_ENGINE = [
  "packages/engine/src/world/auditory-premises.ts",
  "packages/engine/src/world/auditory-premises-integrity.ts",
  "packages/engine/src/world/auditory-premises-evaluator.ts",
];
const P1_SOURCES = [...P1_ENGINE, "packages/contracts/src/auditory-premises.ts"];

describe("the two kinds are exactly the frozen lowering", () => {
  it("W1 is the World-State fallback-custodian ADVANCING kind and the emission is the World-State locus-facet SEALED kind; no new owner or facet", () => {
    expect(WORLD_AUDITORY_PREMISES_FACT_KIND_IDS).toEqual([
      "actor_raw_sensory_state",
      "world_acoustic_emission",
    ]);
    expect(
      WORLD_AUDITORY_PREMISES_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle]),
    ).toEqual([
      ["actor_raw_sensory_state", "world_state", "world_fallback_physical_entity", "ADVANCING"],
      ["world_acoustic_emission", "world_state", "world_locus", "SEALED"],
    ]);
    for (const k of WORLD_AUDITORY_PREMISES_FACT_KINDS) {
      expect(k.im).toBe("IM-03");
      expect(k.rc).toEqual(["RC-02"]);
      expect(k.rule).toBe(WORLD_AUDITORY_PREMISES_RULE);
      expect(ALL_FACT_KINDS).toContain(k);
    }
    // every owner/facet pair of the build predates this slice: no owner and no facet was added
    const pairs = new Set(ALL_FACT_KINDS.map((k) => `${k.owner}/${k.facet}`));
    for (const k of WORLD_AUDITORY_PREMISES_FACT_KINDS) {
      expect(
        ALL_FACT_KINDS.filter((o) => !WORLD_AUDITORY_PREMISES_FACT_KINDS.includes(o)).map(
          (o) => `${o.owner}/${o.facet}`,
        ),
      ).toContain(`${k.owner}/${k.facet}`);
    }
    expect(pairs.has("world_state/world_locus")).toBe(true);
  });

  it("each key space is exact, disjoint from every other registered key space and from the locus's own", () => {
    expect(actorRawSensoryStateKey("a1")).toBe("world-state/actor/a1/raw-sensory/AIRBORNE_HEARING");
    expect(worldAcousticEmissionKey("w1", "l1", "e1")).toBe(
      "world/w1/locus/l1/acoustic-emission/e1",
    );
    for (const [key, id] of [
      [actorRawSensoryStateKey("a1"), "actor_raw_sensory_state"],
      [worldAcousticEmissionKey("w1", "l1", "e1"), "world_acoustic_emission"],
    ] as const) {
      expect(resolveKey(key)!.kind.id).toBe(id);
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
    }
    // the locus key space still resolves to the locus alone, and no other modality or a slot suffix is a key of this build
    expect(resolveKey("world/w1/locus/l1")!.kind.id).toBe("world_locus");
    expect(resolveKey("world-state/actor/a1/raw-sensory/SIGHT")).toBeNull();
    expect(resolveKey("world-state/actor/a1/raw-sensory/AIRBORNE_HEARING/2")).toBeNull();
    expect(resolveKey("world/w1/locus/l1/acoustic-emission")).toBeNull();
    expect(resolveKey("world/w1/locus/l1/acoustic-emission/e1/x")).toBeNull();
  });

  it("the governing citation is the frozen WG pin with the S1-P1 lowering and the consumer boundary cited as NOT a frozen pin, and moves no pin", () => {
    const text = WORLD_AUDITORY_PREMISES_RULE.authority_lineage.join("\n");
    expect(text).toContain("NOT as a frozen spec-lock pin");
    expect(text).toContain("2026-10-23T12:26:49.599Z");
    expect(text).toContain("2026-10-23T12:28:14.041Z");
    expect(text).toContain("S1-P1 emitter-source executability clarification");
    expect(WORLD_AUDITORY_PREMISES_RULE.artifact).toBe(
      lock.frozen_sources.find((s: any) => s.id === "WG").url,
    );
    expect(WORLD_AUDITORY_PREMISES_RULE.native_pin).toBe(WG_SOURCE.native_pin);
    expect(WORLD_AUDITORY_PREMISES_RULE.native_pin).toBe(
      lock.frozen_sources.find((s: any) => s.id === "WG").native_pin,
    );
  });

  it("the world_locus kind is the same owner, facet, lifecycle, key space and citation; only its value gained the one optional typed field", () => {
    const locus = factKind("world_locus");
    expect([locus.owner, locus.facet, locus.lifecycle]).toEqual([
      "world_state",
      "world_locus",
      "SEALED",
    ]);
    expect(locus.keyPattern.source).toBe(
      "^world\\/([A-Za-z0-9][A-Za-z0-9._:-]*)\\/locus\\/([A-Za-z0-9][A-Za-z0-9._:-]*)$",
    );
    expect(Object.keys(WorldLocusSchema.shape)).toEqual([
      "locus_id",
      "world",
      "designation",
      "constraints",
      "acoustic_profile_v1",
    ]);
    expect(WorldLocusSchema.shape.acoustic_profile_v1.safeParse(undefined).success).toBe(true);
    expect(Object.keys(AcousticProfileV1Schema.shape)).toEqual([
      "channel",
      "scope",
      "coverage",
      "coverage_basis",
      "exclusions",
      "environmental_emitter_basis",
    ]);
  });
});

describe("nothing outside the physical-source slice was built", () => {
  const tree = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? tree(join(dir, e.name)) : [join(dir, e.name)],
    );

  it("no operator command, host operation, endpoint or protocol surface names the chain: the composed baseline remains pinned", () => {
    expect(treeSha("packages/operator/src")).toBe(
      // A2 preparation composition: only the equivalent typed R-5 input seam changed.
      // The absence-of-auditory-ingress assertion below remains operative.
      // H-07 changes only the existing scratch-package copy to follow verified checkpoints.
      // Ordinary-action repair adds only the private capability; no sensory/world producer.
      "ffcf32b877fe84d7c748cbe365649f2ad7043ffdd194d796bc8f590a357b9baf",
    );
    expect(treeSha("packages/protocol/src")).toBe(
      "3c895a7bad2214abd044d4be8283fc885bdd7bc0998974e9e4b194935501720b",
    );
    const surface = [...tree("packages/operator/src"), ...tree("packages/protocol/src")]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(surface).not.toMatch(
      /raw-sensory|raw_sensory|acoustic|AIRBORNE|evaluateAuditoryPremises|auditory-premises/i,
    );
  });

  it("the composed predecessor modules are pinned; P1 adds no Health, F-014D, referee or Temporal producer", () => {
    const expected: Record<string, string> = {
      "packages/engine/src/actor":
        "d79ba9f8d376c92586ce34ad2013137b5c624b0ff6ff37469b374169bd8e4d21",
      "packages/engine/src/epistemic":
        "31ded7151880f89175058634615bad2d7352ee9d3eedaa3ea5349f42c0ce6186",
      // adjusted openly for N-1 (RED, #72): referee/derive.ts gains `deliveryWithheld` and comment-only authority-label corrections
      "packages/engine/src/referee":
        "0037364e047b70c865f68962f9e0fecc517c18a887c17a5958f7225ba8363098",
      "packages/engine/src/temporal":
        "6f99e3e3ebd4c9286d3d25f1c012c2084a26826e46ebed73fc5811c2bf1e59a7",
      "packages/engine/src/persistence":
        // H-07 R-01: verify and reconcile obsolete checkpoint snapshots after interruption.
        "e1436cd128b3989b25a6cfdeb029db55ecdaa4ec5c146c993ee37a8365f3591b",
      "packages/engine/src/commit":
        "ccfb7305301424c71d8e0d79a314729adb8d00b739cf933bdc9ca1bbd1209f5b",
    };
    for (const [dir, hash] of Object.entries(expected)) expect(treeSha(dir), dir).toBe(hash);
  });

  it("R1 is preserved: its contract, rules, verifier and eligibility predicate are byte-identical to the merged foundation", () => {
    const expected: Record<string, string> = {
      "packages/contracts/src/actor-presence.ts":
        "828ef1ea9d36376d3179ed5765e78b3a9cdd8a984220faf17e00387913576a26",
      "packages/engine/src/world/actor-presence.ts":
        "e26e2cc5018c36a1dc401de2fb3545171f8684570ade41ff595247c6ca29d46e",
      "packages/engine/src/world/actor-presence-integrity.ts":
        "65c230148f0499cefd115a42987261af528fc76eed97dc62159f2632e08d4e18",
      "packages/engine/src/world/setup-eligibility.ts":
        "6a8b584be266f78c80cb087569e455d2ca399da00a0fea16866e9d5072be4738",
      "docs/actor-presence-foundation.md":
        "aa9d2a85ca959ba5b25d8e85ebd36c4f776c696e6687e826d7c2bc44ccb49087",
      "packages/engine/src/world/actor-coupling.ts":
        "19091c16a325fc8e51e26f4bb628f41525598d2ae6342f8f48b6b57771ff8aaa",
      "packages/engine/src/world/entity-transition.ts":
        "6eba3057099b2d331e4f846498bb9d3f6275fdabf1c76c23ed267795aa809e2b",
      "packages/engine/src/world/pc-locus-custody.ts":
        "d54ee795a20712fc64f01c85a86d9de602e87a161b21af35c6610bcbb006ab9f",
    };
    for (const [file, hash] of Object.entries(expected)) expect(fileSha(file), file).toBe(hash);
  });

  it("the world module set gained exactly the three P1 modules and nothing else", () => {
    expect(
      readdirSync("packages/engine/src/world")
        .filter((f) => /auditory|acoustic|sensory|hearing/.test(f))
        .sort(),
    ).toEqual([
      "auditory-premises-evaluator.ts",
      "auditory-premises-integrity.ts",
      "auditory-premises.ts",
    ]);
    expect(
      readdirSync("packages/engine/src").filter((f) => /health|auditory|sensory/.test(f)),
    ).toEqual([]);
  });
});

describe("the evaluator is pure and read-only, and every P1 source is free of clocks, randomness and I/O", () => {
  it("no P1 source reads a clock, draws randomness, touches the file system, the network or the environment", () => {
    for (const f of P1_SOURCES) {
      expect(codeOf(f), f).not.toMatch(
        /\bDate\b|Math\.random|performance\.now|process\.(hrtime|env)|setTimeout|setInterval|\bfetch\(|node:fs|node:net|node:http|readFileSync|writeFileSync|crypto\.random/,
      );
    }
  });

  it("the evaluator takes a reader and calls nothing that could write: no commit, set, delete or listing", () => {
    const text = codeOf("packages/engine/src/world/auditory-premises-evaluator.ts");
    expect(text).not.toMatch(
      /\.commit\(|\.set\(|\.delete\(|\.write\(|\.accept\(|\.adopt\(|\.prepare\(|\.listFacts\(|\.close\(/,
    );
    expect(text).toMatch(/Pick<CampaignStore, "getFact" \| "lookupReceipt">/);
  });

  it("no P1 source imports an owner this slice may not write or read: Health, Epistemic, Named-Actor adapters, referee, Culture, KTI, operator or protocol", () => {
    for (const f of P1_SOURCES) {
      const imports = [...readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      for (const i of imports) {
        expect(i, `${f} imports ${i}`).not.toMatch(
          /epistemic|referee|culture|kti|economy|logistics|population|production|gip|diplomacy|operator|protocol|actor\/adapter|actor\/admission|actor\/provider|health/i,
        );
      }
    }
    // the only foreign engine reads are the Named-Actor boundary helper, the shared hash and the R1 rules
    const evaluator = [...readFileSync(P1_ENGINE[2]!, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(evaluator.sort()).toEqual(
      [
        "../actor/derive.ts",
        "../hash.ts",
        "../persistence/store.ts",
        "./auditory-premises.ts",
      ].sort(),
    );
  });

  // (`lookupReceipt` is the journal COMMIT receipt, from which the evaluator reads a revision; it is not an individual hearing receipt)
  it("no P1 source can state a perception, a Health verdict, an access event, an individual receipt or a packet", () => {
    for (const f of P1_SOURCES) {
      expect(codeOf(f), f).not.toMatch(
        /PERCEIVED|\bAVAILABLE\b|IMPAIRED|BOUNDED_SHARED_ACCESS|BROADCAST_EXPOSURE|AccessEvent|AccessPacket|AccessReceipt|IndividualReceipt|individual_receipt|HearingReceipt|retention|ActorObservation|actor-perception/,
      );
    }
  });

  it("no public make-actor-hear command, host flag or fixture shortcut exists: no 'can hear' field anywhere in the contracts", () => {
    for (const f of P1_SOURCES) {
      expect(codeOf(f), f).not.toMatch(
        /can_hear|canHear|make_actor_hear|makeActorHear|force_hear|heard_by|hears\b/i,
      );
    }
  });
});

describe("the F-027 lock: one additive executable lowering, apart from everything that was already in it", () => {
  const rows: any[] = lock["executable_lowerings"];
  const p1 = rows.find((r) => r.id === "S1-P1-WG-LOWERING");

  it("every pre-existing section is byte-unchanged: the 23 frozen pins, the addendum, the tranches, the R1 lineage, the R1 lowering and the rules", () => {
    expect(lock["frozen_sources"]).toHaveLength(23);
    expect(sha(lock["frozen_sources"])).toBe(
      "d12a4d73380f75d2594ed8aacf77ad6eb85d7679a235f37faa4412810d075de7",
    );
    expect(sha(lock["design_lineage_successors"])).toBe(
      "194d76ee5c8c50d1475fd0de4d25b54f3e827b16bb1c21ee10a579e05a17fd9d",
    );
    expect(sha(rows[0])).toBe("1ddfb7f3773145f81ef3c2f43759682c444e636c430d428302e2440937ef51f8");
    expect(rows[0].id).toBe("R1-STAGE-ONE-V1.1-LOWERING");
    expect(sha(lock["rules"])).toBe(
      "736a27bef959afbbc88266d6eab4ffc56892d8509aaa71054821e0dba037c53c",
    );
    expect(lock["implementation_authority_addenda"].map((a: any) => a.id)).toEqual(["F-027-CD1"]);
    expect(lock["design_lineage_successors"]).toHaveLength(4);
  });

  it("the R1 lowering is the first row and the P1 lowering is the one row after it: exactly two executable lowerings exist", () => {
    expect(rows.map((r) => r.id)).toEqual(["R1-STAGE-ONE-V1.1-LOWERING", "S1-P1-WG-LOWERING"]);
    expect(Object.keys(REQUIRED_EXECUTABLE_LOWERINGS)).toEqual(rows.map((r) => r.id));
  });

  it("the P1 lowering cites the WG native pin, composes with F-027, supersedes nothing and names exactly its kinds", () => {
    expect(p1.url).toBe("https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d");
    expect(p1.native_pin).toBe("2026-10-23T12:26:49.599Z");
    expect(p1.status).toBe("FROZEN_EXECUTABLE_LOWERING");
    expect(p1.executable).toBe(true);
    expect(p1.relation).toBe("COMPOSES_WITH");
    expect(p1.composed_with).toEqual({
      id: "F-027",
      version: "v1.0",
      package_native_pin: "2026-09-29T00:40:44.707Z",
    });
    expect(p1.supersedes).toBeNull();
    expect(p1.superseded_by).toBeNull();
    expect(p1.primary_im).toBe("IM-03");
    expect(p1.fact_kinds).toEqual([...WORLD_AUDITORY_PREMISES_FACT_KIND_IDS]);
    expect(p1.extends_fact_kinds).toEqual([
      { kind: "world_locus", field: "acoustic_profile_v1", optional: true },
    ]);
    expect(p1.cites_design_lineage).toEqual([]);
    expect(p1.consumer_boundary.native_pin).toBe("2026-10-23T12:28:14.041Z");
    // its native pin is not the frozen WG pin restated, and the frozen WG pin did not move
    expect(p1.native_pin).not.toBe(
      lock["frozen_sources"].find((s: any) => s.id === "WG").native_pin,
    );
    expect(JSON.stringify(lock["implementation_authority_addenda"])).not.toContain("S1-P1");
  });

  it("it disclaims every consumer it does not build", () => {
    const text = (p1.does_not as string[]).join("\n");
    for (const phrase of [
      "Health Sensory Function Close",
      "access or dissemination event",
      "BOUNDED_SHARED_ACCESS",
      "actor eyesight",
      "operator command",
      "R1 Stage-One lowering",
      "PR #72 and PR #73",
    ])
      expect(text, phrase).toContain(phrase);
  });

  it("the checker accepts the lock and rejects each way of blurring the new row", () => {
    expect(checkSpec(".")).toEqual([]);
    const mutate = (edit: (l: any) => void): string[] => {
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
    };
    const has = (errors: string[], text: RegExp) => expect(errors.join("\n")).toMatch(text);
    const row = (l: any) => l.executable_lowerings.find((r: any) => r.id === "S1-P1-WG-LOWERING");
    has(
      mutate((l) => (row(l).native_pin = "2026-10-23T12:26:49.600Z")),
      /S1-P1-WG-LOWERING must be pinned at exactly/,
    );
    has(
      mutate((l) => (row(l).url = "https://app.notion.com/p/other")),
      /S1-P1-WG-LOWERING must name/,
    );
    has(
      mutate((l) => (row(l).executable = false)),
      /S1-P1-WG-LOWERING is the frozen executable lowering/,
    );
    has(
      mutate((l) => (row(l).status = "DESIGN_RATIFIED")),
      /S1-P1-WG-LOWERING is the frozen executable lowering/,
    );
    has(
      mutate((l) => (row(l).supersedes = "F-027")),
      /COMPOSE with F-027/,
    );
    has(
      mutate((l) => (row(l).composed_with.package_native_pin = "x")),
      /package version and native pin/,
    );
    has(
      mutate((l) => (row(l).fact_kinds = ["actor_raw_sensory_state"])),
      /exactly its fact kinds/,
    );
    has(
      mutate((l) => (row(l).cites_design_lineage = ["R1-WG-LINEAGE"])),
      /exactly the design lineage/,
    );
    has(
      mutate(
        (l) =>
          (l.executable_lowerings = l.executable_lowerings.filter(
            (r: any) => r.id !== "S1-P1-WG-LOWERING",
          )),
      ),
      /S1-P1-WG-LOWERING appears 0 times/,
    );
    has(
      mutate((l) => l.executable_lowerings.push({ ...row(l) })),
      /S1-P1-WG-LOWERING appears 2 times/,
    );
    has(
      mutate((l) => l.executable_lowerings.push({ ...row(l), id: "S1-P2-OTHER" })),
      /unexpected executable lowering/,
    );
    has(
      mutate((l) => l.implementation_authority_addenda.push({ id: "S1-P1-WG-LOWERING" })),
      /unexpected implementation authority addendum/,
    );
  });

  it("the gates, the register and the Runtime Contract snapshot are byte-unchanged: nothing was promoted and no gate was activated", () => {
    expect(fileSha("spec/f027/open-gates.yaml")).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(fileSha("spec/f027/acceptance-register.yaml")).toBe(
      "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
    );
    expect(fileSha("spec/f027/runtime-contract.md")).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });
});

describe("the foundation document says what the slice is and is not", () => {
  const doc = readFileSync("docs/auditory-premises-foundation.md", "utf8");
  it("pins the authority and states mechanism-only, no receipt, and the remaining gates as unbuilt, not passed", () => {
    for (const phrase of [
      "2026-10-23T12:26:49.599Z",
      "2026-10-23T12:28:14.041Z",
      "mechanism only. No receipt",
      "SOURCE_PREMISES_READY_FOR_HEALTH",
      "a proposal to run Health later",
      "Health event-basis forced Sensory Function Close",
      "unbuilt, not passed",
      "First Playable is not reached by this slice",
      "PR #72 and PR #73 (held, untouched)",
    ])
      expect(doc, phrase).toContain(phrase);
  });
});

describe("the integrated stack supplies no dependency to auditory premises", () => {
  // The heads the brief pins at construction: #72 CPAA-C1 b9d51deab5485a84165f77dec8b6fbf70d50c99b and #73 R-5 phone bridge
  // 87aed41af5099bd1d49dc99823937daaaf9edc77. Forward integration brings #72 into this tree; P1 must remain independent of both.
  const PR72_ADDED: readonly string[] = [
    "docs/pc-collection-foundation.md",
    "docs/pc-collection-play.md",
    "packages/contracts/src/pc-collection.ts",
    "packages/contracts/src/protocol-pc-collection.ts",
    "packages/engine/src/pc-collection/adapter.ts",
    "packages/engine/src/pc-collection/admission.ts",
    "packages/engine/src/pc-collection/cessation.ts",
    "packages/engine/src/pc-collection/clarification.ts",
    "packages/engine/src/pc-collection/derive.ts",
    "packages/engine/src/pc-collection/determinations.ts",
    "packages/engine/src/pc-collection/integrity.ts",
    "packages/engine/src/pc-collection/lapse.ts",
    "packages/engine/src/pc-collection/state.ts",
    "packages/operator/src/closed-setting.ts",
    "packages/operator/src/collection-clarification.ts",
    "packages/operator/src/collection-preparation.ts",
    "packages/operator/src/collection-referee.ts",
    "packages/operator/src/referee-console-bin.ts",
    "packages/operator/src/referee-console.ts",
    "packages/operator/src/time-initialization.ts",
    "packages/protocol/src/pc-collection.ts",
    "tests/conformance/pc-collection-conformance.test.ts",
    "tests/conformance/time-initialization-conformance.test.ts",
    "tests/conformance/workforce-carriers-conformance.test.ts",
    "tests/integration/operator-closed-setting.test.ts",
    "tests/integration/operator-collection-clarification.test.ts",
    "tests/integration/operator-collection-cli.test.ts",
    "tests/integration/operator-collection-lapse.test.ts",
    "tests/integration/operator-pc-attestation.test.ts",
    "tests/integration/operator-pc-cessation.test.ts",
    "tests/integration/operator-pc-collection.test.ts",
    "tests/integration/operator-pc-preparation.test.ts",
    "tests/integration/operator-time-initialization.test.ts",
    "tests/integration/pc-collection-bootstrap-loop.test.ts",
    "tests/integration/pc-collection-cessation-integrity.test.ts",
    "tests/integration/pc-collection-cessation.test.ts",
    "tests/integration/pc-collection-clarification.test.ts",
    "tests/integration/pc-collection-closure-falsifiers.test.ts",
    "tests/integration/pc-collection-enforcement.test.ts",
    "tests/integration/pc-collection-foundation.test.ts",
    "tests/integration/pc-collection-hold.test.ts",
    "tests/integration/pc-collection-lapse-integrity.test.ts",
    "tests/integration/pc-collection-lapse.test.ts",
    "tests/integration/pc-collection-perception.test.ts",
    "tests/integration/pc-collection-recovery.test.ts",
    "tests/integration/pc-collection-reentry.test.ts",
    "tests/integration/pc-collection-v03-integrity.test.ts",
    "tests/integration/pc-collection-v03.test.ts",
    "tests/integration/referee-collection-exchange.test.ts",
    "tests/support/pc-cessation.ts",
    "tests/support/pc-clarification.ts",
    "tests/support/pc-collection-original.ts",
    "tests/support/pc-collection.ts",
    "tests/support/pc-lapse.ts",
    "tests/unit/pc-collection-engagement.test.ts",
    "tests/unit/pc-collection.test.ts",
  ];

  const PR73_ADDED: readonly string[] = [
    ".dockerignore",
    "apps/phone/Dockerfile",
    "apps/phone/entrypoint.sh",
    "apps/phone/railway.json",
    "apps/phone/src/chat-tools.ts",
    "apps/phone/src/collection-recovery.ts",
    "apps/phone/src/commands.ts",
    "apps/phone/src/config.ts",
    "apps/phone/src/main.ts",
    "apps/phone/src/mcp-http.ts",
    "apps/phone/src/oauth.ts",
    "apps/phone/src/pages.ts",
    "apps/phone/src/recovery.ts",
    "apps/phone/src/referee-tools.ts",
    "apps/phone/src/runs.ts",
    "apps/phone/src/server.ts",
    "apps/phone/src/web-terminal.ts",
    "docs/chat-adapter.md",
    "docs/phone-bridge.md",
    "tests/integration/chat-adapter.test.ts",
    "tests/integration/chat-collection-recovery.test.ts",
    "tests/integration/chat-recovery-readback.test.ts",
    "tests/integration/chat-tool-registration.test.ts",
    "tests/integration/phone-bridge.test.ts",
    "tests/support/chat-client.ts",
    "tests/support/chat-recovery.ts",
    "tests/support/phone-browser.ts",
  ];

  it("no auditory-premises source imports a PR72 collection mechanism", () => {
    for (const source of P1_SOURCES)
      for (const path of PR72_ADDED) expect(codeOf(source)).not.toContain(path);
  });
  it("no auditory-premises source imports a PR73 phone/chat mechanism", () => {
    for (const source of P1_SOURCES)
      for (const path of PR73_ADDED) expect(codeOf(source)).not.toContain(path);
  });
  it("no P1 source or test refers to either held PR's mechanism: no collection, phone, chat or MCP bridge", () => {
    for (const f of [
      ...P1_SOURCES,
      ...readdirSync("tests/integration")
        .filter((n) => /^auditory-premises/.test(n))
        .map((n) => `tests/integration/${n}`),
    ]) {
      expect(codeOf(f), f).not.toMatch(
        /pc-collection|pcCollection|phone-bridge|chat-adapter|referee-console|CPAA|R-5 phone/i,
      );
    }
  });
});
