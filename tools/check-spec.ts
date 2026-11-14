import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { renderSpecIdentity } from "./gen-spec-identity.ts";

const IDENTITY_MODULE = "packages/contracts/src/spec-identity.ts";

const STATUSES = ["NOT_IMPLEMENTED", "BLOCKED", "UNRUN", "PASS", "FAIL", "NOT_APPLICABLE"];
const REQUIRED_GATES = [
  ...Array.from({ length: 11 }, (_, i) => `CAL-${String(i + 1).padStart(2, "0")}`),
  "L-26",
  "L-29",
  "L-30",
  "L-31",
  "L-32",
  "L-41",
  "L-43",
  "L-48",
  "L-50",
  "L-59",
  "OB-015",
  "OB-016",
  "MIG-01..MIG-10",
  "PROVIDER",
  "DEPLOYMENT",
  "PF-6/F-028",
];
/**
 * Implementation-authority addenda the lock must pin, by id, at their exact native pin. An addendum COMPOSES with the
 * package it names (F-027 v1.0 + the addendum); it never rewrites or silently supersedes it.
 */
export const REQUIRED_ADDENDA: Readonly<Record<string, string>> = {
  "F-027-CD1": "2026-10-02T15:11:03.450Z",
};

/** Initial Locality Bootstrap v0.9 pins (paired semantic source, executable companion, Sovereign ratification). */
const BOOTSTRAP_V9 = {
  semantic: {
    url: "https://app.notion.com/p/40b20af901e081069bb7ce5118a047b1",
    pin: "2026-11-01T12:13:42.692Z",
  },
  contract: {
    url: "https://app.notion.com/p/40b20af901e08198abdacb340e3507df",
    pin: "2026-11-01T12:13:53.634Z",
  },
  ratification: {
    url: "https://app.notion.com/p/40c20af901e081d7999be2b4f317c70a",
    pin: "2026-11-02T15:46:21.719Z",
  },
  coreSections: [
    "Purpose",
    "Authority",
    "Initial Setup",
    "Authorship and Delegation",
    "Chronology",
    "Isolated Generation",
    "Scene Premises",
    "Placement and Preparation",
    "Pending Intent and Action",
    "Publication and Legacy Continuity",
    "Acceptance and Release",
  ],
  coreKinds: [
    "initial_setup_input",
    "initial_setup_invocation",
    "initial_setup_response",
    "initial_setup_grant",
    "initial_locality_completion",
    "initial_setup_disposition",
    "referee_decision",
    "temporal_state",
  ],
  coreDoesNot: [
    "does not inherit executable text from v0.1 through v0.8",
    "does not recover or re-pin frozen historical sources",
    "does not treat authenticated model arguments as original human-message evidence",
    "does not run a reserved invocation twice or use negative void proofs",
    "does not dispatch delayed actions from background or status reads",
    "does not pre-allocate collection act IDs or adopt same-shape orphan intents",
    "does not enable the separately optional F-1 exception without its ratification rows",
    "does not migrate or relabel old readers or promote IA/V/PF-6/F-028",
    "does not certify a production driver, original-message intake or deployed natural play",
  ],
} as const;
export const BOOTSTRAP_CORE_LINEAGE_ID = "GM-INITIAL-BOOTSTRAP-V9-LINEAGE";
export const BOOTSTRAP_CORE_LOWERING_ID = "GM-INITIAL-BOOTSTRAP-V9-LOWERING";
export const BOOTSTRAP_OPTION_A_LINEAGE_ID = "CPAA-C1-F1-INITIAL-COMPLETION-V9-LINEAGE";
export const BOOTSTRAP_OPTION_A_LOWERING_ID = "CPAA-C1-F1-INITIAL-COMPLETION-V9-LOWERING";
/** The additive registration of the Sovereign-adopted C-1/C-2 clarification (v0.4); validated by `checkBootstrapC1C2`, never by the required tables. */
export const BOOTSTRAP_C1C2_LINEAGE_ID = "GM-INITIAL-BOOTSTRAP-V9-C1C2-LINEAGE";
export const BOOTSTRAP_C1C2_LOWERING_ID = "GM-INITIAL-BOOTSTRAP-V9-C1C2-LOWERING";
/** The optional rows are validated by `checkBootstrapV9` (present exactly when option_a_status is ADOPTED), never by the required tables. */
const BOOTSTRAP_OPTIONAL_IDS: ReadonlySet<string> = new Set([
  BOOTSTRAP_OPTION_A_LINEAGE_ID,
  BOOTSTRAP_OPTION_A_LOWERING_ID,
  BOOTSTRAP_C1C2_LINEAGE_ID,
  BOOTSTRAP_C1C2_LOWERING_ID,
]);

/** The adopted C-1/C-2 clarification: the conformed page, the Sovereign's separate ratification and the closed identities it registers. */
const BOOTSTRAP_C1C2 = {
  url: "https://app.notion.com/p/40d20af901e081309889e8333d2a9286",
  pin: "2026-11-03T00:51:23.053Z",
  ratification: {
    url: "https://app.notion.com/p/40d20af901e081ea9235df051dbf9908",
    pin: "2026-11-03T00:54:41.601Z",
  },
  sections: [
    "C-1 — exact producer identity and one model echo",
    "C-2 — the v0.9 one-source Selection provenance",
  ],
  closed: [
    ["scope", "C1_C2_CLARIFICATION_V0_4"],
    ["status", "FROZEN_EXECUTABLE_LOWERING"],
    ["relation", "AMENDS_ADDITIVELY"],
    ["producer_identity", "P_H_T_D_NON_CIRCULAR_BYTE_EQUAL_DELIVERY"],
    ["model_echo", "TASK_ID_ONLY_NO_INPUT_HASH_HEADER"],
    ["parser_current", "INITIAL_LOCALITY_PARSER_V2"],
    ["parser_frozen", "INITIAL_LOCALITY_PARSER_V1"],
    ["parser_frozen_reader", "FIXTURE_NAMESPACED_JOURNALS_ONLY_VIA_TESTKIT_VERIFIER"],
    ["provenance_profile", "INITIAL_LOCALITY_PROVENANCE_V1"],
    ["instruction_registry", "IMMUTABLE_COMPLETE_MAPS_KEYED_BY_INSTRUCTION_HASH"],
    ["context_manifest", "SHA256_OF_EXACT_PHASE_INSTRUCTIONS_AND_SHA256_OF_D"],
    ["manifest_mismatch", "INVALID_OUTPUT_CONTEXT_MANIFEST_MISMATCH_RETAINS_RESPONSE"],
    ["unverifiable_source", "FAIL_CLOSED_NEVER_A_PROVED_MISMATCH"],
    [
      "selection_leaf_grammar",
      "CLOSED_INDEXED_TWELVE_PATHS_PLUS_ONE_PER_CONSTRAINT_AND_NON_NULL_CLAIMANT",
    ],
    ["chronology_exception", "COVERAGE_START_ONLY_EXACT_CAPTURED_STATEMENT"],
    [
      "fixed_source_feasibility",
      "SCOPE_VERDICT_AND_GRANT_ADMISSION_SCOPE_REFUSED_REJECTION_CODE_NULL",
    ],
    ["history_verification", "ONE_TRANSITION_PARSER_V2_PROVENANCE_V1_C1C2_PIN"],
  ] as const,
} as const;

/**
 * R1 Stage-One v1.1 section-scoped DESIGN lineage the lock records (23 October 2026), by id. A design-lineage successor says that named
 * sections of an already-frozen source (or of an existing governance source) are Sovereign-ratified; it is never executable authority and
 * never replaces, narrows or supersedes a frozen pin. `of` is the frozen source id the page extends, or null for a governance source.
 */
export const REQUIRED_DESIGN_LINEAGE: Readonly<
  Record<
    string,
    {
      of: string | null;
      url: string;
      pin: string;
      sections: number;
      /** the exact section titles, for a row whose titles are part of its closed expectation (the 31 October 2026 row only) */
      titles?: readonly string[];
    }
  >
> = {
  "R1-WG-LINEAGE": {
    of: "WG",
    url: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
    pin: "2026-10-23T06:19:21.435Z",
    sections: 2,
  },
  "R1-TEMPORAL-LINEAGE": {
    of: "F-014B",
    url: "https://app.notion.com/p/3e020af901e081fb88e9f691748db990",
    pin: "2026-10-23T06:19:22.288Z",
    sections: 2,
  },
  "R1-EPISTEMIC-LINEAGE": {
    of: "F-014D",
    url: "https://app.notion.com/p/3e020af901e08103b81aec5f7119318e",
    pin: "2026-10-23T06:20:01.146Z",
    sections: 2,
  },
  // a governance-source page with no F-027 frozen-source entry: it is never added to the frozen pins or the addenda
  "R1-PC-CUSTODY-LINEAGE": {
    of: null,
    url: "https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d",
    pin: "2026-10-23T06:20:02.171Z",
    sections: 1,
  },
  // 31 October 2026: the Sovereign-ratified Active-PC Current-Look section of the SAME governance-source page, at its own later pin. It is
  // lineage only: the page is still no frozen source and no addendum, and its 8 October contract text is not re-pinned.
  "PC-CURRENT-LOOK-PREMISE-LINEAGE": {
    of: null,
    url: "https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d",
    pin: "2026-10-31T03:34:15.074Z",
    sections: 1,
    titles: [
      "Active-PC Current-Look Physical Premise — Sovereign-Ratified Additive Section — 31 October 2026",
    ],
  },
  // 2 November 2026: the CORE_V9 section-scoped design lineage of the Initial Locality Bootstrap. It excludes the separately headed Initial Scene
  // Exception (OPTION_A_V9), whose own row exists only when option_a_status is ADOPTED. Lineage only: no page is promoted into the frozen pins.
  [BOOTSTRAP_CORE_LINEAGE_ID]: {
    of: null,
    url: BOOTSTRAP_V9.semantic.url,
    pin: BOOTSTRAP_V9.semantic.pin,
    sections: BOOTSTRAP_V9.coreSections.length,
    titles: BOOTSTRAP_V9.coreSections,
  },
  "MS-SETUP-V08-LINEAGE": {
    of: null,
    url: "https://app.notion.com/p/41220af901e0810687b3c2ae39c69701",
    pin: "2026-11-08T23:36:18.355Z",
    sections: 1,
    titles: ["M-S v0.8 A–D — Design Only"],
  },
  // ROADBED (R2-D18 v1.2.1 / R3-T2 as corrected by R3-T17 / R3-T25): the page as fetched at Builder intake; the ratified pins it carries are in the section titles
  "ROADBED-FREIGHT-FI-LINEAGE": {
    of: null,
    url: "https://app.notion.com/p/41520af901e0816c9a1cf63ef4e15a97",
    pin: "2026-11-13T06:14:52.876Z",
    sections: 3,
    titles: [
      "R2-D18 v1.2.1 — Economy–Logistics–GIP Minimum Foundation (source pin 2026-11-11T16:11:26.161Z; Sovereign scoped source ratification R2-D22 at 2026-11-11T16:29:38.518Z)",
      "R3-T2 §§2–5 — scoped F-016 EL-01F / EL-02S and F-017 first-freight stage overlay as corrected by R3-T17 CT-1..CT-4 (Sovereign scoped source ratification R3-T20 at 2026-11-13T04:35:38.950Z; R3-T21 documentary re-freeze)",
      "R3-T25 — BLUE Formal Universal Hard Preflight v6.2, conditional-scope PASS and bounded Builder brief (13 November 2026)",
    ],
  },
};

/** The exclusions both current-look lowerings (31 October 2026) carry, as separate strings, in this order. */
const CURRENT_LOOK_COMMON_DOES_NOT: readonly string[] = [
  "does not replace, narrow, supersede or restate any of the 23 frozen F-027 source pins or the original WG/F-014D citations",
  "does not originate new GM-owned physical, position, target-visibility, Health, Epistemic, or intrinsic PC facts",
  "does not enable a legacy reader, a journal cutover, read-either acceptance, or a migration",
  "does not settle historical L5/F014D-6-MAIN, Health S1, H3/D-2, H-07, or live host, named-client and retained-storage acceptance",
];

/**
 * The executable lowerings the lock records, by id: an executable lowering composes with the F-027 package, cites the design lineage it
 * lowers and names its exact native pin. It is the only recorded executable authority for what it lowers.
 *
 * A row with a `closed` expectation (the two 31 October 2026 current-look lowerings only) is also held to its exact primary IM, its exact
 * section, its `operation` (a string, or ABSENT when `null`) and its `does_not` as one closed, exact, ordered array of strings: a missing,
 * changed, extra or reordered item falsifies it. The older R1 and S1-P1 rows carry no such expectation and are checked exactly as before.
 */
export const REQUIRED_EXECUTABLE_LOWERINGS: Readonly<
  Record<
    string,
    {
      url: string;
      pin: string;
      kinds: readonly string[];
      lineage: readonly string[];
      closed?: {
        im: string;
        section: string;
        operation: string | null;
        does_not: readonly string[];
      };
    }
  >
> = {
  "R1-STAGE-ONE-V1.1-LOWERING": {
    url: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
    pin: "2026-10-23T09:27:39.157Z",
    kinds: ["actor_setup_placement", "world_setup_closure", "actor_physical_presence"],
    lineage: Object.keys({
      "R1-WG-LINEAGE": 0,
      "R1-TEMPORAL-LINEAGE": 0,
      "R1-EPISTEMIC-LINEAGE": 0,
      "R1-PC-CUSTODY-LINEAGE": 0,
    }),
  },
  // S1-P1 (23 October 2026): one additive executable lowering of the BLUE-frozen S1 World-State physical-source owner boundary. It cites no
  // design-lineage row (none is recorded for the S1 freeze) and extends the existing world_locus without adding a fact kind for it.
  "S1-P1-WG-LOWERING": {
    url: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
    pin: "2026-10-23T12:26:49.599Z",
    kinds: ["actor_raw_sensory_state", "world_acoustic_emission"],
    lineage: [],
  },
  // 31 October 2026 (v0.8 carrier, native pin 2026-10-31T06:30:53.024Z): two additive lowerings of one ratified section. The World-State
  // row names NO operation (its absence is checked); the Referee row is the GM_SCENE_RESOLUTION value class of referee_decision only.
  "PC-CURRENT-LOOK-WORLD-LOWERING": {
    url: "https://app.notion.com/p/40a20af901e081ae900fe03017f25640",
    pin: "2026-10-31T06:30:53.024Z",
    kinds: ["world_pc_current_viewing"],
    lineage: ["PC-CURRENT-LOOK-PREMISE-LINEAGE"],
    closed: {
      im: "IM-03",
      section: "§3A — Frozen executable lowering: World-State current-look premise",
      operation: null,
      does_not: CURRENT_LOOK_COMMON_DOES_NOT,
    },
  },
  "GM-CURRENT-LOOK-SCENE-LOWERING": {
    url: "https://app.notion.com/p/40a20af901e081ae900fe03017f25640",
    pin: "2026-10-31T06:30:53.024Z",
    kinds: ["referee_decision"],
    lineage: ["PC-CURRENT-LOOK-PREMISE-LINEAGE"],
    closed: {
      im: "IM-12",
      section: "§3B — Frozen executable lowering: Referee ordinary-look scene decision",
      operation: "GM_SCENE_RESOLUTION",
      does_not: [
        ...CURRENT_LOOK_COMMON_DOES_NOT,
        "does not lock the referee_decision kind-level REFEREE_RULE, its referee_adjudication_kernel owner, referee_provenance facet or key space, all of which remain under B61-A3 with the base rule sovereign-approved-not-native-pinned-not-spec-locked; does not modify REFEREE_PHYSICAL_RULE or REFEREE_OBSERVATION_RULE or license their operations through GM_SCENE_RESOLUTION",
      ],
    },
  },
  // 2 November 2026: CORE_V9 of the Initial Locality Bootstrap. temporal_state is the additional state-dependent initial-write precondition and
  // referee_decision is a narrowed alternate value/rule branch; neither re-pins the full kind. Its closed core fields are checked by checkBootstrapV9.
  [BOOTSTRAP_CORE_LOWERING_ID]: {
    url: BOOTSTRAP_V9.contract.url,
    pin: BOOTSTRAP_V9.contract.pin,
    kinds: BOOTSTRAP_V9.coreKinds,
    lineage: [BOOTSTRAP_CORE_LINEAGE_ID],
    closed: {
      im: "IM-03",
      section: "Common Types through Verification",
      operation: "INITIAL_LOCALITY_COMPLETION_V9",
      does_not: BOOTSTRAP_V9.coreDoesNot,
    },
  },
  "MS-SETUP-V08-LOWERING": {
    url: "https://app.notion.com/p/41320af901e081d885d5f047b4e0b8bb",
    pin: "2026-11-09T00:43:08.394Z",
    kinds: [
      "initial_actor_setup_issue",
      "initial_actor_setup_response",
      "named_actor_existence_basis",
    ],
    lineage: ["MS-SETUP-V08-LINEAGE"],
  },
  "ROADBED-FREIGHT-FI-LOWERING": {
    url: "https://app.notion.com/p/41520af901e0816c9a1cf63ef4e15a97",
    pin: "2026-11-13T06:14:52.876Z",
    kinds: [
      "world_opening_attestation",
      "world_site_condition",
      "world_governing_premise",
      "world_governing_premise_head",
      "gip_opening_basis",
      "gip_instrument_clause",
      "gip_legal_readiness_seal",
      "production_material_specification",
      "production_input_lot",
      "economy_origin_allocation",
      "economy_origin_lot_slot",
      "economy_accepted_output_holding",
      "economy_freight_request",
      "economy_freight_allocation",
      "economy_freight_directive_use_slot",
      "economy_freight_cargo_slot",
      "economy_freight_requirement_slot",
      "economy_freight_withdrawal",
      "economy_freight_close",
      "economy_freight_use_consumption",
      "economy_freight_result",
      "economy_destination_adequacy",
      "logistics_service_basis",
      "logistics_service_slot",
      "logistics_unused_release",
      "logistics_freight_dispatch_enrollment",
    ],
    lineage: ["ROADBED-FREIGHT-FI-LINEAGE"],
  },
};
const pad = (n: number) => String(n).padStart(2, "0");
const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${pad(i + 1)}`);

export const REQUIRED_ACCEPTANCE_IDS = [...range("V", 14), ...range("IA", 30)];

export function hashFile(path: string): string {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

type Row = {
  id?: unknown;
  status?: unknown;
  evidence?: unknown;
  partial_evidence?: { scope?: unknown; tests?: unknown };
};
type Gate = { id?: unknown; status?: unknown };

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const keySet = (e: Record<string, unknown>): string => JSON.stringify(Object.keys(e).sort());

/**
 * Initial Locality Bootstrap v0.9: the closed core fields and the adoption-conditional optional rows (companion "Source Registration and
 * Reader Boundary"). It validates DECLARED strings and flags only: heading separation and the reviewed content are verified by BLUE/RED, and
 * the checker cannot authenticate old CPAA or WG page text. Every row is held to its EXACT key set (an absent, extra or renamed field falsifies
 * it) and every array to its exact ordered contents. option_a_status has no default: it must be ADOPTED or DECLINED; ADOPTED requires both
 * optional rows exactly once and DECLINED requires both absent (an optional branch running after a decline is a spec error). No input,
 * tool or model can toggle the flag.
 */
export function checkBootstrapV9(
  lineage: readonly Record<string, unknown>[],
  lowerings: readonly Record<string, unknown>[],
): string[] {
  const errors: string[] = [];
  const e = (m: string) => errors.push(`spec-lock.json: ${m}`);
  const one = (rows: readonly Record<string, unknown>[], id: string) =>
    rows.filter((r) => r["id"] === id);
  const core = one(lowerings, BOOTSTRAP_CORE_LOWERING_ID)[0];
  if (!core) return errors; // the generic required-table check already reported its absence
  const coreKeys = [
    "id",
    "title",
    "url",
    "native_pin",
    "section",
    "scope",
    "status",
    "executable",
    "relation",
    "composed_with",
    "cites_design_lineage",
    "supersedes",
    "superseded_by",
    "primary_im",
    "operation",
    "fact_kinds",
    "scope_operation",
    "scope_host",
    "scope_channel",
    "parser",
    "projection",
    "chronology",
    "temporal_owner",
    "temporal_precondition",
    "temporal_writer",
    "reservation",
    "dispatch_join",
    "dispatch_trigger",
    "expiry",
    "revocation",
    "option_a_status",
    "adoption_decision",
    "replay",
    "does_not",
  ];
  if (keySet(core) !== JSON.stringify([...coreKeys].sort()))
    e(
      `${BOOTSTRAP_CORE_LOWERING_ID} must carry exactly its closed core fields (no absent, extra or renamed field)`,
    );
  const closed: [string, unknown][] = [
    ["scope", "CORE_V9_EXCLUDING_OPTIONAL_SCENE_PROJECTION_RULES"],
    ["scope_operation", "WG_INITIAL_DELEGATION_CLASSIFY"],
    ["scope_host", "gm-initial-scope"],
    ["scope_channel", "PRIVATE_ISOLATED_RUNNER"],
    ["parser", "INITIAL_LOCALITY_PARSER_V1"],
    ["projection", "GENESIS_WHITELIST_NO_BOOTSTRAP_HISTORY"],
    ["chronology", "RECORD_ONLY_CAPTURE_AND_STATE_PRECONDITION_V9"],
    ["temporal_owner", "temporal_kernel/temporal_coordination"],
    ["temporal_precondition", "bootstrapInitialTimePrecondition"],
    ["temporal_writer", "initialize-captured-chronology"],
    ["reservation", "CANONICAL_BEFORE_INVOCATION_NO_NEGATIVE_VOID"],
    ["dispatch_join", "V2_COLLECTION_DISPATCH_REF_IN_SAME_RECORD"],
    ["dispatch_trigger", "LIVE_CONTINUE_PENDING_GOAL_ONLY"],
    ["expiry", "ORIGINAL_VERIFIED_ACCESS_TOKEN_EXPIRY_NO_REFRESH_EXTENSION"],
    ["revocation", "ALL_OAUTH_ACCESS_AND_REFRESH_FAIL_CLOSED"],
    ["replay", "CANONICAL_PREFIX_ENROLLMENT_AUTHENTICITY_NOT_INDEPENDENTLY_PROVEN"],
  ];
  for (const [k, want] of closed)
    if (core[k] !== want)
      e(`${BOOTSTRAP_CORE_LOWERING_ID} field ${k} must be exactly ${JSON.stringify(want)}`);

  const status = core["option_a_status"];
  if (status !== "ADOPTED" && status !== "DECLINED")
    e(
      `${BOOTSTRAP_CORE_LOWERING_ID} option_a_status must be ADOPTED or DECLINED (there is no default adoption)`,
    );
  const decision = core["adoption_decision"] as { url?: unknown; native_pin?: unknown } | undefined;
  if (
    status === "ADOPTED" &&
    (decision?.url !== BOOTSTRAP_V9.ratification.url ||
      decision?.native_pin !== BOOTSTRAP_V9.ratification.pin ||
      Object.keys(decision ?? {}).length !== 2)
  )
    e(
      `${BOOTSTRAP_CORE_LOWERING_ID} adoption_decision must be exactly the Sovereign ratification URL and pin`,
    );

  const optLineage = one(lineage, BOOTSTRAP_OPTION_A_LINEAGE_ID);
  const optLowering = one(lowerings, BOOTSTRAP_OPTION_A_LOWERING_ID);
  if (status === "DECLINED") {
    if (optLineage.length + optLowering.length > 0)
      e(
        "option_a_status is DECLINED: both optional rows and both new projection rules must be absent/disabled",
      );
    return errors;
  }
  if (status !== "ADOPTED") return errors;
  if (optLineage.length !== 1 || optLowering.length !== 1) {
    e("option_a_status is ADOPTED: both optional rows must appear exactly once");
    return errors;
  }
  const ol = optLineage[0]!;
  const lineageKeys = [
    "id",
    "of_frozen_source",
    "url",
    "native_pin",
    "sections",
    "status",
    "executable",
    "narrows_frozen_pin",
    "supersedes",
    "superseded_by",
    "related_cpaa",
    "scoped_precedence",
    "other_cpaa_clauses",
    "adoption_decision",
    "note",
  ];
  if (keySet(ol) !== JSON.stringify([...lineageKeys].sort()))
    e(`${BOOTSTRAP_OPTION_A_LINEAGE_ID} must carry exactly its closed fields`);
  if (
    ol["url"] !== BOOTSTRAP_V9.semantic.url ||
    ol["native_pin"] !== BOOTSTRAP_V9.semantic.pin ||
    ol["of_frozen_source"] !== null ||
    !sameJson(ol["sections"], ["Initial Scene Exception"])
  )
    e(
      `${BOOTSTRAP_OPTION_A_LINEAGE_ID} must name the paired source, pin and exactly the Initial Scene Exception section`,
    );
  if (
    ol["status"] !== "DESIGN_RATIFIED" ||
    ol["executable"] !== false ||
    ol["narrows_frozen_pin"] !== false ||
    ol["supersedes"] !== null ||
    ol["superseded_by"] !== null
  )
    e(
      `${BOOTSTRAP_OPTION_A_LINEAGE_ID} is DESIGN_RATIFIED lineage, never executable, and supersedes or narrows nothing`,
    );
  if (
    ol["scoped_precedence"] !== "INITIAL_COMPLETION_V9_ONLY" ||
    ol["other_cpaa_clauses"] !== "UNCHANGED"
  )
    e(
      `${BOOTSTRAP_OPTION_A_LINEAGE_ID} must scope precedence to INITIAL_COMPLETION_V9 only and leave every other CPAA clause UNCHANGED`,
    );
  if (
    !sameJson(ol["related_cpaa"], {
      url: "https://app.notion.com/p/3fb20af901e08115b141f5e2e55ca37e",
      native_pin: "2026-10-16T07:19:16.351Z",
      ratification: {
        url: "https://app.notion.com/p/3fb20af901e08124a6a8fe243b2ec351",
        native_pin: "2026-10-16T07:56:18.556Z",
      },
    })
  )
    e(
      `${BOOTSTRAP_OPTION_A_LINEAGE_ID} must name the original CPAA-C1 v0.3 page, pin and ratification exactly`,
    );
  if (!sameJson(ol["adoption_decision"], core["adoption_decision"]))
    e(
      `${BOOTSTRAP_OPTION_A_LINEAGE_ID} must cite the same independent exception-adoption decision as the core row`,
    );

  const ow = optLowering[0]!;
  const loweringKeys = [
    "id",
    "title",
    "url",
    "native_pin",
    "section",
    "scope",
    "status",
    "executable",
    "relation",
    "composed_with",
    "cites_design_lineage",
    "supersedes",
    "superseded_by",
    "primary_im",
    "operation",
    "fact_kinds",
    "sunset",
    "sunset_policy",
    "sunset_unknown",
    "sunset_missing_row",
    "policy_coverage",
  ];
  if (keySet(ow) !== JSON.stringify([...loweringKeys].sort()))
    e(`${BOOTSTRAP_OPTION_A_LOWERING_ID} must carry exactly its closed fields`);
  const optClosed: [string, unknown][] = [
    ["url", BOOTSTRAP_V9.contract.url],
    ["native_pin", BOOTSTRAP_V9.contract.pin],
    ["section", "CPAA Projection and Canonical Sunset"],
    ["scope", "OPTION_A_V9_ONLY"],
    ["status", "FROZEN_EXECUTABLE_LOWERING"],
    ["executable", true],
    ["relation", "COMPOSES_WITH"],
    ["primary_im", "IM-03"],
    ["operation", "INITIAL_COMPLETION_V9"],
    ["sunset", "REGISTRY_COMPLETE_FAIL_CLOSED_POLICY_AT_HISTORICAL_PREFIX"],
    ["sunset_policy", "BOOTSTRAP_SUNSET_POLICY_V9"],
    ["sunset_unknown", "UNREVIEWED_BLOCK"],
    ["sunset_missing_row", "VALIDATION_FAILURE"],
    ["policy_coverage", "ALL_FACT_KINDS_EXACT_SET_NO_SYNTHESIZED_ROWS"],
  ];
  for (const [k, want] of optClosed)
    if (ow[k] !== want)
      e(`${BOOTSTRAP_OPTION_A_LOWERING_ID} field ${k} must be exactly ${JSON.stringify(want)}`);
  if (
    !sameJson(ow["cites_design_lineage"], [
      BOOTSTRAP_CORE_LINEAGE_ID,
      BOOTSTRAP_OPTION_A_LINEAGE_ID,
    ]) ||
    !sameJson(ow["fact_kinds"], ["world_scene_closure", "population_workforce_scope"]) ||
    ow["supersedes"] !== null ||
    ow["superseded_by"] !== null ||
    !sameJson(ow["composed_with"], core["composed_with"])
  )
    e(
      `${BOOTSTRAP_OPTION_A_LOWERING_ID} must cite exactly both lineage rows and name exactly its two fact kinds, composing with F-027`,
    );
  return errors;
}

/**
 * The adopted C-1/C-2 clarification registered ADDITIVELY beside the ratified v0.9 rows. Both rows must appear exactly once with their exact
 * key sets and closed values; the amended core row is cited (not edited), nothing is superseded or narrowed, and the two instruction-map
 * hashes are well-formed SHA-256 digests (their equality with the engine's registry is a conformance test, not a checker claim). It validates
 * DECLARED strings only: heading separation and the reviewed content are verified by BLUE/RED.
 */
export function checkBootstrapC1C2(
  lineage: readonly Record<string, unknown>[],
  lowerings: readonly Record<string, unknown>[],
): string[] {
  const errors: string[] = [];
  const e = (m: string) => errors.push(`spec-lock.json: ${m}`);
  const rows = (list: readonly Record<string, unknown>[], id: string) =>
    list.filter((r) => r["id"] === id);
  const l = rows(lineage, BOOTSTRAP_C1C2_LINEAGE_ID);
  const w = rows(lowerings, BOOTSTRAP_C1C2_LOWERING_ID);
  if (l.length !== 1 || w.length !== 1) {
    e(
      "the C-1/C-2 clarification rows must appear exactly once each (the adopted clarification is registered, never defaulted)",
    );
    return errors;
  }
  const lr = l[0]!;
  const lineageKeys = [
    "id",
    "of_frozen_source",
    "url",
    "native_pin",
    "sections",
    "status",
    "executable",
    "narrows_frozen_pin",
    "supersedes",
    "superseded_by",
    "adoption_decision",
    "note",
  ];
  if (keySet(lr) !== JSON.stringify([...lineageKeys].sort()))
    e(`${BOOTSTRAP_C1C2_LINEAGE_ID} must carry exactly its closed fields`);
  const decision = lr["adoption_decision"] as { url?: unknown; native_pin?: unknown } | undefined;
  if (
    lr["of_frozen_source"] !== null ||
    lr["url"] !== BOOTSTRAP_C1C2.url ||
    lr["native_pin"] !== BOOTSTRAP_C1C2.pin ||
    !sameJson(lr["sections"], BOOTSTRAP_C1C2.sections) ||
    lr["status"] !== "DESIGN_RATIFIED" ||
    lr["executable"] !== false ||
    lr["narrows_frozen_pin"] !== false ||
    lr["supersedes"] !== null ||
    lr["superseded_by"] !== null ||
    decision?.url !== BOOTSTRAP_C1C2.ratification.url ||
    decision?.native_pin !== BOOTSTRAP_C1C2.ratification.pin ||
    Object.keys(decision ?? {}).length !== 2
  )
    e(
      `${BOOTSTRAP_C1C2_LINEAGE_ID} must name exactly the conformed clarification, its two sections and the Sovereign ratification, as ratified, non-executable lineage that supersedes and narrows nothing`,
    );
  const wr = w[0]!;
  const loweringKeys = [
    "id",
    "title",
    "url",
    "native_pin",
    "section",
    "scope",
    "status",
    "executable",
    "relation",
    "amends",
    "cites_design_lineage",
    "supersedes",
    "superseded_by",
    "primary_im",
    ...BOOTSTRAP_C1C2.closed
      .map(([k]) => k)
      .filter((k) => k !== "scope" && k !== "status" && k !== "relation"),
    "instruction_hashes",
    "does_not",
  ];
  if (keySet(wr) !== JSON.stringify([...loweringKeys].sort()))
    e(
      `${BOOTSTRAP_C1C2_LOWERING_ID} must carry exactly its closed fields (no absent, extra or renamed field)`,
    );
  for (const [k, want] of BOOTSTRAP_C1C2.closed)
    if (wr[k] !== want)
      e(`${BOOTSTRAP_C1C2_LOWERING_ID} field ${k} must be exactly ${JSON.stringify(want)}`);
  const amends = wr["amends"] as { id?: unknown; native_pin?: unknown } | undefined;
  if (
    wr["url"] !== BOOTSTRAP_C1C2.url ||
    wr["native_pin"] !== BOOTSTRAP_C1C2.pin ||
    wr["executable"] !== true ||
    wr["primary_im"] !== "IM-03" ||
    wr["supersedes"] !== null ||
    wr["superseded_by"] !== null ||
    !sameJson(wr["cites_design_lineage"], [BOOTSTRAP_C1C2_LINEAGE_ID]) ||
    amends?.id !== BOOTSTRAP_CORE_LOWERING_ID ||
    amends?.native_pin !== BOOTSTRAP_V9.contract.pin ||
    Object.keys(amends ?? {}).length !== 2
  )
    e(
      `${BOOTSTRAP_C1C2_LOWERING_ID} must cite the clarification and its lineage row and amend ${BOOTSTRAP_CORE_LOWERING_ID} additively at the companion pin, superseding nothing`,
    );
  const hashes = wr["instruction_hashes"] as Record<string, unknown> | undefined;
  const wantParsers = ["INITIAL_LOCALITY_PARSER_V1", "INITIAL_LOCALITY_PARSER_V2"];
  if (
    !hashes ||
    !sameJson(Object.keys(hashes).sort(), wantParsers) ||
    wantParsers.some(
      (p) => typeof hashes[p] !== "string" || !/^[0-9a-f]{64}$/.test(hashes[p] as string),
    ) ||
    hashes["INITIAL_LOCALITY_PARSER_V1"] === hashes["INITIAL_LOCALITY_PARSER_V2"]
  )
    e(
      `${BOOTSTRAP_C1C2_LOWERING_ID} must register one distinct SHA-256 instruction-map hash per parser version (V1 frozen, V2 current)`,
    );
  return errors;
}

/** Returns a list of consistency errors; an empty list means the spec snapshot is internally consistent. */
export function checkSpec(root: string): string[] {
  const errors: string[] = [];
  const at = (rel: string) => join(root, rel);
  const read = (rel: string) => readFileSync(at(rel), "utf8");

  let lock: {
    snapshot_files?: Record<string, string>;
    frozen_sources?: unknown[];
    package?: { version?: string; native_pin?: string };
    implementation_authority_addenda?: {
      id?: unknown;
      url?: unknown;
      native_pin?: unknown;
      relation?: unknown;
      supersedes?: unknown;
      superseded_by?: unknown;
      composed_with?: { id?: unknown; version?: unknown; package_native_pin?: unknown };
    }[];
    design_lineage_successors?: Record<string, unknown>[];
    executable_lowerings?: Record<string, unknown>[];
    supersedes?: unknown;
    superseded_by?: unknown;
  };
  try {
    lock = JSON.parse(read("spec/f027/spec-lock.json"));
  } catch (e) {
    return [`spec-lock.json unreadable: ${(e as Error).message}`];
  }

  if (!lock.package?.native_pin) errors.push("spec-lock.json: package.native_pin missing");
  if (!Array.isArray(lock.frozen_sources) || lock.frozen_sources.length !== 23) {
    errors.push("spec-lock.json: frozen_sources must list exactly the 23 frozen entrypoints");
  }

  const addenda = lock.implementation_authority_addenda ?? [];
  for (const [id, pin] of Object.entries(REQUIRED_ADDENDA)) {
    const matches = addenda.filter((a) => a.id === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: implementation authority addendum ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const a = matches[0]!;
    if (a.native_pin !== pin) errors.push(`spec-lock.json: ${id} must be pinned at exactly ${pin}`);
    if (typeof a.url !== "string" || a.url.length === 0)
      errors.push(`spec-lock.json: ${id} has no url`);
    if (a.relation !== "COMPOSES_WITH")
      errors.push(`spec-lock.json: ${id} must COMPOSE with F-027, not replace it`);
    if (a.supersedes !== null || a.superseded_by !== null) {
      errors.push(
        `spec-lock.json: ${id} may not supersede or be superseded (historical F-027 v1.0 stays authoritative)`,
      );
    }
    const w = a.composed_with;
    if (
      w?.id !== "F-027" ||
      w.version !== lock.package?.version ||
      w.package_native_pin !== lock.package?.native_pin
    ) {
      errors.push(
        `spec-lock.json: ${id} must name the F-027 package version and native pin it composes with`,
      );
    }
  }
  for (const a of addenda) {
    if (typeof a.id !== "string" || !(a.id in REQUIRED_ADDENDA)) {
      errors.push(`spec-lock.json: unexpected implementation authority addendum ${String(a.id)}`);
    }
  }
  if (addenda.length > 0 && (lock.supersedes != null || lock.superseded_by != null)) {
    errors.push(
      "spec-lock.json: the F-027 package is composed with its addenda and may not be superseded",
    );
  }

  // -- R1 Stage-One v1.1: section-scoped design lineage and the executable lowering, kept apart ---------------------------------
  const frozenById = new Map(
    (lock.frozen_sources as { id?: string; url?: string; native_pin?: string }[] | undefined)?.map(
      (f) => [f.id ?? "", f] as const,
    ) ?? [],
  );
  const lineage = lock.design_lineage_successors ?? [];
  for (const [id, want] of Object.entries(REQUIRED_DESIGN_LINEAGE)) {
    const matches = lineage.filter((e) => e["id"] === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: design lineage ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const e = matches[0]!;
    if (e["url"] !== want.url)
      errors.push(`spec-lock.json: design lineage ${id} must name ${want.url}`);
    if (e["native_pin"] !== want.pin)
      errors.push(`spec-lock.json: design lineage ${id} must be pinned at exactly ${want.pin}`);
    if (e["status"] !== "DESIGN_RATIFIED" || e["executable"] !== false)
      errors.push(`spec-lock.json: design lineage ${id} is DESIGN_RATIFIED and never executable`);
    if (
      e["narrows_frozen_pin"] !== false ||
      e["supersedes"] !== null ||
      e["superseded_by"] !== null
    )
      errors.push(
        `spec-lock.json: design lineage ${id} may not supersede or narrow any frozen pin`,
      );
    if (
      !Array.isArray(e["sections"]) ||
      e["sections"].length !== want.sections ||
      !e["sections"].every((t) => typeof t === "string" && t.length > 0)
    )
      errors.push(
        `spec-lock.json: design lineage ${id} must list its ${want.sections} exact section title(s)`,
      );
    else if (want.titles && JSON.stringify(e["sections"]) !== JSON.stringify(want.titles))
      errors.push(
        `spec-lock.json: design lineage ${id} must list exactly its ratified section title`,
      );
    if (e["of_frozen_source"] !== want.of)
      errors.push(`spec-lock.json: design lineage ${id} extends ${String(want.of)}`);
    if (want.of === null) {
      // a governance-source page is never promoted into the frozen pins or the implementation-authority addenda
      if ([...frozenById.values()].some((f) => f.url === want.url))
        errors.push(`spec-lock.json: ${id} may not be promoted into the frozen sources`);
      if (addenda.some((a) => a.url === want.url))
        errors.push(
          `spec-lock.json: ${id} may not be promoted into the implementation authority addenda`,
        );
    }
    if (want.of !== null) {
      const frozen = frozenById.get(want.of);
      if (!frozen || frozen.url !== want.url)
        errors.push(
          `spec-lock.json: design lineage ${id} must extend the frozen ${want.of} page, whose own pin stays unchanged`,
        );
      else if (frozen.native_pin === e["native_pin"])
        errors.push(
          `spec-lock.json: design lineage ${id} may not restate the frozen pin as its own`,
        );
    }
  }
  for (const e of lineage) {
    if (
      typeof e["id"] !== "string" ||
      !(e["id"] in REQUIRED_DESIGN_LINEAGE || BOOTSTRAP_OPTIONAL_IDS.has(e["id"]))
    )
      errors.push(`spec-lock.json: unexpected design lineage ${String(e["id"])}`);
  }
  const lowerings = lock.executable_lowerings ?? [];
  for (const [id, want] of Object.entries(REQUIRED_EXECUTABLE_LOWERINGS)) {
    const matches = lowerings.filter((e) => e["id"] === id);
    if (matches.length !== 1) {
      errors.push(
        `spec-lock.json: executable lowering ${id} appears ${matches.length} times (expected 1)`,
      );
      continue;
    }
    const e = matches[0]!;
    if (e["url"] !== want.url)
      errors.push(`spec-lock.json: executable lowering ${id} must name ${want.url}`);
    if (e["native_pin"] !== want.pin)
      errors.push(
        `spec-lock.json: executable lowering ${id} must be pinned at exactly ${want.pin}`,
      );
    if (e["status"] !== "FROZEN_EXECUTABLE_LOWERING" || e["executable"] !== true)
      errors.push(`spec-lock.json: ${id} is the frozen executable lowering`);
    if (
      e["relation"] !== "COMPOSES_WITH" ||
      e["supersedes"] !== null ||
      e["superseded_by"] !== null
    )
      errors.push(`spec-lock.json: ${id} must COMPOSE with F-027, never replace it`);
    const w = e["composed_with"] as {
      id?: unknown;
      version?: unknown;
      package_native_pin?: unknown;
    };
    if (
      w?.id !== "F-027" ||
      w.version !== lock.package?.version ||
      w.package_native_pin !== lock.package?.native_pin
    )
      errors.push(
        `spec-lock.json: ${id} must name the F-027 package version and native pin it composes with`,
      );
    if (JSON.stringify(e["cites_design_lineage"]) !== JSON.stringify(want.lineage))
      errors.push(`spec-lock.json: ${id} must cite exactly the design lineage it lowers`);
    if (JSON.stringify(e["fact_kinds"]) !== JSON.stringify(want.kinds))
      errors.push(`spec-lock.json: ${id} must name exactly its fact kinds`);
    if (want.closed) {
      const c = want.closed;
      if (e["primary_im"] !== c.im)
        errors.push(`spec-lock.json: executable lowering ${id} must be primary ${c.im}`);
      if (e["section"] !== c.section)
        errors.push(`spec-lock.json: executable lowering ${id} must name its exact section`);
      // the operation is a value-class restriction: required on the Referee row, absent (not merely empty) on the World-State row
      if (c.operation === null) {
        if (Object.hasOwn(e, "operation"))
          errors.push(`spec-lock.json: executable lowering ${id} must carry no operation key`);
      } else if (e["operation"] !== c.operation)
        errors.push(`spec-lock.json: executable lowering ${id} must name operation ${c.operation}`);
      if (JSON.stringify(e["does_not"]) !== JSON.stringify(c.does_not))
        errors.push(
          `spec-lock.json: executable lowering ${id} must carry exactly its ${c.does_not.length} ordered does_not exclusions`,
        );
    }
  }
  for (const e of lowerings) {
    if (
      typeof e["id"] !== "string" ||
      !(e["id"] in REQUIRED_EXECUTABLE_LOWERINGS || BOOTSTRAP_OPTIONAL_IDS.has(e["id"]))
    )
      errors.push(`spec-lock.json: unexpected executable lowering ${String(e["id"])}`);
  }
  errors.push(...checkBootstrapV9(lineage, lowerings));
  errors.push(...checkBootstrapC1C2(lineage, lowerings));
  const ms = lowerings.find((e) => e["id"] === "MS-SETUP-V08-LOWERING");
  const manifestPath = "spec/f027/ms-setup-v08-manifest.json";
  const manifestHash = "d5d3bf6d8226a511f2ef22d37877be55dd8575aa27362aa26df607be975724b2";
  if (!existsSync(at(manifestPath)) || hashFile(at(manifestPath)) !== manifestHash)
    errors.push("MS literal manifest bytes differ from the adopted identity-bound JSON");
  else {
    const manifest = JSON.parse(read(manifestPath));
    if (
      ms?.["manifest_file"] !== manifestPath ||
      ms["manifest_sha256"] !== manifestHash ||
      JSON.stringify(ms["rule_map"]) !== JSON.stringify(manifest.clause) ||
      JSON.stringify(ms["authority_lineage"]) !== JSON.stringify(manifest.authority_lineage) ||
      ms["history_policy_suffix"] !== manifest.historical_policy_suffix
    )
      errors.push(
        "MS lowering must bind the exact literal manifest, ordered lineage, rule map and historical policy",
      );
  }

  // -- ROADBED first-profile freight: the exclusions and encodings the lowering row must carry, kept literal ------------------------
  const freight = lowerings.find((e) => e["id"] === "ROADBED-FREIGHT-FI-LOWERING");
  if (freight) {
    if (freight["history_policy_suffix"] !== "+ROADBED-FREIGHT-FI@2026-11-13T06:14:52.876Z")
      errors.push(
        "ROADBED freight lowering must carry its exact historical-verification policy suffix",
      );
    if (
      freight["sunset_delta"] !==
      "TWENTY_SIX_EXPLICIT_UNREVIEWED_BLOCK_ROWS_119_TOTAL_ORIGINAL_93_UNCHANGED"
    )
      errors.push("ROADBED freight lowering must name its restrictive sunset delta");
    if (
      JSON.stringify(freight["rule_map"]) !==
      JSON.stringify([
        "FREIGHT_WORLD_RULE",
        "FREIGHT_GIP_RULE",
        "FREIGHT_PRODUCTION_RULE",
        "FREIGHT_ECONOMY_RULE",
        "FREIGHT_LOGISTICS_RULE",
      ])
    )
      errors.push("ROADBED freight lowering must name its five owner rule citations in order");
    const dn = freight["does_not"];
    if (
      !Array.isArray(dn) ||
      dn.length !== 6 ||
      !String(dn[0]).startsWith(
        "lower, persist or simulate a positive definitive F1 terminal refusal",
      ) ||
      !String(dn[1]).startsWith("admit withdrawal cause W1")
    )
      errors.push(
        "ROADBED freight lowering must keep positive F1 and W1/W4 out of its executable scope (six ordered exclusions)",
      );
    if (typeof freight["technical_encoding_review"] !== "string")
      errors.push(
        "ROADBED freight lowering must record that its technical encodings await BLUE review",
      );
  }

  const snapshot = lock.snapshot_files ?? {};
  for (const rel of [
    "spec/f027/runtime-contract.md",
    "spec/f027/acceptance-register.yaml",
    "spec/f027/open-gates.yaml",
  ]) {
    const expected = snapshot[rel];
    if (!expected) errors.push(`spec-lock.json: no hash recorded for ${rel}`);
    else if (expected !== hashFile(at(rel))) {
      errors.push(`spec-lock.json: hash mismatch for ${rel} (snapshot edited without lock update)`);
    }
  }

  const contract = read("spec/f027/runtime-contract.md");
  for (const id of range("RC", 16)) {
    if (!new RegExp(`^## ${id} — `, "m").test(contract)) {
      errors.push(`runtime-contract.md: missing heading for ${id}`);
    }
  }
  for (const id of range("IM", 17)) {
    if (!new RegExp(`^\\| ${id} `, "m").test(contract)) {
      errors.push(`runtime-contract.md: missing IM map row for ${id}`);
    }
  }

  const register = parse(read("spec/f027/acceptance-register.yaml")) as { rows?: Row[] };
  const seen = new Map<string, number>();
  for (const row of register.rows ?? []) {
    const id = String(row.id);
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (typeof row.status !== "string" || !STATUSES.includes(row.status)) {
      errors.push(`acceptance-register.yaml: ${id} has invalid status ${String(row.status)}`);
    }
    if (row.partial_evidence !== undefined) {
      const { scope, tests } = row.partial_evidence;
      if (typeof scope !== "string" || scope.length === 0) {
        errors.push(`acceptance-register.yaml: ${id} partial_evidence needs a scope statement`);
      }
      if (!Array.isArray(tests) || tests.length === 0) {
        errors.push(`acceptance-register.yaml: ${id} partial_evidence needs at least one test`);
      } else {
        for (const t of tests) {
          if (typeof t !== "string" || !existsSync(at(t))) {
            errors.push(
              `acceptance-register.yaml: ${id} partial_evidence test not found: ${String(t)}`,
            );
          }
        }
      }
    }
    if ((row.status === "PASS" || row.status === "FAIL") && !row.evidence) {
      errors.push(`acceptance-register.yaml: ${id} is ${String(row.status)} without evidence`);
    }
  }
  for (const id of REQUIRED_ACCEPTANCE_IDS) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) errors.push(`acceptance-register.yaml: ${id} appears ${n} times (expected 1)`);
  }
  for (const id of seen.keys()) {
    if (!REQUIRED_ACCEPTANCE_IDS.includes(id)) {
      errors.push(`acceptance-register.yaml: unexpected row ${id}`);
    }
  }

  const gates = parse(read("spec/f027/open-gates.yaml")) as { gates?: Gate[] };
  const gateIds = new Set<string>();
  for (const gate of gates.gates ?? []) {
    gateIds.add(String(gate.id));
    if (typeof gate.status !== "string" || gate.status.length === 0) {
      errors.push(`open-gates.yaml: ${String(gate.id)} has no status`);
    } else if (/^(PASS|RESOLVED|CLOSED)/.test(gate.status)) {
      errors.push(
        `open-gates.yaml: ${String(gate.id)} claims ${gate.status}; bootstrap resolves no gate`,
      );
    }
  }
  for (const id of REQUIRED_GATES) {
    if (!gateIds.has(id)) errors.push(`open-gates.yaml: missing gate ${id}`);
  }

  // The generated build identity must match the lock it claims to mirror.
  try {
    if (readFileSync(at(IDENTITY_MODULE), "utf8") !== renderSpecIdentity(root)) {
      errors.push(
        `${IDENTITY_MODULE} is out of date with spec-lock.json (run tools/gen-spec-identity.ts)`,
      );
    }
  } catch (e) {
    errors.push(`${IDENTITY_MODULE} unreadable: ${(e as Error).message}`);
  }

  return errors;
}

/** Rewrites the snapshot hashes in spec-lock.json (a substantive change; review the diff). */
export async function writeHashes(root: string): Promise<void> {
  const path = join(root, "spec/f027/spec-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  for (const rel of Object.keys(lock.snapshot_files)) {
    lock.snapshot_files[rel] = hashFile(join(root, rel));
  }
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.includes("--write-hashes")) {
    await writeHashes(root);
    writeFileSync(join(root, IDENTITY_MODULE), renderSpecIdentity(root));
    console.log("spec-lock.json snapshot hashes and generated build spec identity updated");
  }
  const errors = checkSpec(root);
  if (errors.length > 0) {
    console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
    console.error(`spec check FAILED (${errors.length})`);
    process.exit(1);
  }
  console.log("spec check OK: spec-lock, acceptance register and open gates are consistent");
}
