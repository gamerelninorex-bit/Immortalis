// B0-20..B0-25 — the origin-pairing table for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §2.1, §2.5 step 1, §4 R01-R07, §7).
//
// T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no B1 positive, no T0 PASS, no production capability; F-014B LC closures unchanged.
//
// What it exercises: temporalOriginPairing and the first step of parseGmWaitRequest in packages/contracts/src/temporal-gm-wait.ts, imported by relative
// path. Both are pure functions of the values handed to them. The classification is a table lookup over a context and a trigger kind; GM_WAIT means
// only "this is the one pairing the GM waiting shape may be parsed under", never that a GM was authenticated or a request accepted. LEGACY_PLAYER
// makes no claim of legality either: the player pair keeps only its own, separately authorized source rules.
//
// Non-tautology. Every DENY specimen below differs from a classified control by exactly one change (the context, or the trigger kind), and the
// expected table is written out by hand rather than computed by the code under test.
import { describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  OBSERVATION_TRIGGER_KIND,
  PLAYER_CHOICE_AUTHORITY,
} from "@immortalis/contracts";
import {
  GM_INTERPRETED_PC_WAIT,
  parseGmWaitRequest,
  temporalOriginPairing,
} from "../../packages/contracts/src/temporal-gm-wait.ts";

type Value = Record<string, unknown>;

const GM = { role: "role.gm", permission: "permission.rule.adjudicate" } as const;
const GM_ROLE_PLAYER_PERMISSION = {
  role: "role.gm",
  permission: "permission.player_choice.commit",
} as const;
const PLAYER_ROLE_GM_PERMISSION = {
  role: "role.player",
  permission: "permission.rule.adjudicate",
} as const;
const PLAYER = { role: "role.player", permission: "permission.player_choice.commit" } as const;

/** Every existing trigger kind located statically (contract §3). `trigger.kind` is an open Id, so this is a lower bound. */
const EXISTING_TRIGGER_KINDS = [
  OBSERVATION_TRIGGER_KIND,
  "operator-progression-choice",
  "operator-null-pc-advance-choice",
  "operator-null-pc-resume-choice",
  "operator-pc-target-advance-choice",
  "operator-pc-target-resume-choice",
  "fixture-advance-request",
  "player-advance-choice",
  "player-ooc-advance-choice",
  "player-pc-target-choice",
  "fixture-continue",
] as const;

/** A valid INITIAL (2 minute, basis 1000, target 1120) or CONTINUATION body under a chosen context and trigger kind. */
const request = (phase: "INITIAL" | "CONTINUATION", context: unknown, kind: unknown): Value => ({
  transaction_id: "gm-wait-tx-1",
  cause: "cause-gm-wait-1",
  trigger: { kind, ref: "ref-gm-wait-1" },
  continues: phase === "INITIAL" ? null : "gm-wait-tx-0",
  requested: { target: { unit: "time-unit-fixture", value: 1120 }, condition: null },
  context,
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait:
    phase === "INITIAL"
      ? {
          phase: "INITIAL",
          duration_value: 2,
          duration_unit: "minute",
          observed_basis: { unit: "time-unit-fixture", value: 1000 },
          interpretation_mode: "EXPLICIT_DURATION",
          conversion_rule_version: "SI_SUBDAY_V1",
          catalogue_sha256: "0123456789abcdef".repeat(4),
        }
      : { phase: "CONTINUATION", from_transaction: "gm-wait-tx-0" },
});

describe("B0 refusal-only: the origin-pairing table", () => {
  it("B0 refusal-only: the full four-pair by trigger matrix yields GM_WAIT only for the GM pair with GM_INTERPRETED_PC_WAIT", () => {
    expect(GM).toEqual(GM_ADJUDICATION_AUTHORITY);
    expect(PLAYER).toEqual(PLAYER_CHOICE_AUTHORITY);
    const FUTURE = "x-future-trigger";
    // the expected table, written out by hand (contract §2.1): columns are the GM trigger, an existing kind, an unknown kind
    const expected: ReadonlyArray<readonly [string, unknown, readonly [string, string, string]]> = [
      ["GM pair", GM, ["GM_WAIT", "DENY", "DENY"]],
      ["GM role with the player permission", GM_ROLE_PLAYER_PERMISSION, ["DENY", "DENY", "DENY"]],
      ["player role with the GM permission", PLAYER_ROLE_GM_PERMISSION, ["DENY", "DENY", "DENY"]],
      ["player pair", PLAYER, ["DENY", "LEGACY_PLAYER", "LEGACY_PLAYER"]],
    ];
    let gmWait = 0;
    for (const [name, context, row] of expected) {
      const got = [GM_INTERPRETED_PC_WAIT, OBSERVATION_TRIGGER_KIND, FUTURE].map((kind) =>
        temporalOriginPairing(context, kind),
      );
      expect(got, name).toEqual(row);
      gmWait += got.filter((c) => c === "GM_WAIT").length;
    }
    // exactly one cell of the whole matrix is GM_WAIT
    expect(gmWait).toBe(1);
  });

  it("B0 refusal-only: every statically located existing trigger kind under the GM pair is denied (R01)", () => {
    expect(temporalOriginPairing(GM, GM_INTERPRETED_PC_WAIT)).toBe("GM_WAIT");
    for (const kind of EXISTING_TRIGGER_KINDS) {
      // the control is one change away: the same kind under the player pair is the legacy origin
      expect(temporalOriginPairing(PLAYER, kind), `${kind} player control`).toBe("LEGACY_PLAYER");
      expect(temporalOriginPairing(GM, kind), kind).toBe("DENY");
    }
  });

  it("B0 refusal-only: unknown and future trigger names under the GM pair are denied, and the provisional knowledge and resume names are presently unavailable (R02, R03)", () => {
    const names = [
      "x-future-trigger",
      "gm_interpreted_pc_wait",
      "Gm_Interpreted_Pc_Wait",
      "GM_INTERPRETED_PC_WAIT ",
      " GM_INTERPRETED_PC_WAIT",
      "GM_INTERPRETED_PC_WAIT\n",
      // the last letter is Cyrillic capital A (U+0410)
      "GM_INTERPRETED_PC_WАIT",
      "GM_INTERPRETED_PC_WAIT_",
      "GM_INTERPRETED_PC",
      "GM_ADJUDICATE_WAIT_KNOWLEDGE",
      "GM_RESUME_ADJUDICATED_WAIT",
      "",
    ];
    expect(temporalOriginPairing(GM, GM_INTERPRETED_PC_WAIT)).toBe("GM_WAIT");
    for (const name of names)
      expect(temporalOriginPairing(GM, name), JSON.stringify(name)).toBe("DENY");
    // not a trigger name at all
    for (const kind of [undefined, null, 0, true, {}, [], [GM_INTERPRETED_PC_WAIT]])
      expect(temporalOriginPairing(GM, kind), JSON.stringify(kind)).toBe("DENY");
  });

  it("B0 refusal-only: the player pair with GM_INTERPRETED_PC_WAIT is denied (R06)", () => {
    // controls, each one change away: the same pair with a legacy kind, and the GM pair with the GM trigger
    expect(temporalOriginPairing(PLAYER, "direct-observation")).toBe("LEGACY_PLAYER");
    expect(temporalOriginPairing(GM, GM_INTERPRETED_PC_WAIT)).toBe("GM_WAIT");
    expect(temporalOriginPairing(PLAYER, GM_INTERPRETED_PC_WAIT)).toBe("DENY");
    // and a player-pair legacy origin needs a well-formed trigger kind
    for (const kind of [undefined, null, "", " padded", "tab\tkind", 7])
      expect(temporalOriginPairing(PLAYER, kind), JSON.stringify(kind)).toBe("DENY");
  });

  it("B0 refusal-only: mixed and spoofed contexts are denied with the GM trigger and with a legacy trigger (R04, R05, R07)", () => {
    const spoofs: ReadonlyArray<readonly [string, unknown]> = [
      ["GM role with the player permission", GM_ROLE_PLAYER_PERMISSION],
      ["player role with the GM permission", PLAYER_ROLE_GM_PERMISSION],
      ["trailing space in the role", { ...GM, role: "role.gm " }],
      ["leading space in the permission", { ...GM, permission: " permission.rule.adjudicate" }],
      ["case variant of the role", { ...GM, role: "Role.GM" }],
      ["case variant of the permission", { ...GM, permission: "PERMISSION.RULE.ADJUDICATE" }],
      // the second letter of the role is Cyrillic small o (U+043E)
      ["homoglyph in the role", { ...GM, role: "rоle.gm" }],
      // the first letter after the dot is Cyrillic small a (U+0430)
      ["homoglyph in the permission", { ...GM, permission: "permission.rule.аdjudicate" }],
      ["role only", { role: "role.gm" }],
      ["permission only", { permission: "permission.rule.adjudicate" }],
      ["extra session member", { ...GM, session: "session-1" }],
      ["extra authored_under member", { ...GM, authored_under: "x" }],
      ["extra member that is undefined", { ...GM, session: undefined }],
      ["roles array in place of role", { roles: ["role.gm"], permission: GM.permission }],
      ["archivist pair", { role: "role.archivist", permission: "permission.canon.write" }],
      [
        "narrator role with the GM permission",
        { role: "role.narrator", permission: GM.permission },
      ],
      ["empty object", {}],
      ["empty array", []],
      ["array holding the pair", [GM]],
      ["null", null],
      ["undefined", undefined],
      ["the role as a string", "role.gm"],
      ["a number", 1],
    ];
    expect(temporalOriginPairing(GM, GM_INTERPRETED_PC_WAIT)).toBe("GM_WAIT");
    expect(temporalOriginPairing(PLAYER, "direct-observation")).toBe("LEGACY_PLAYER");
    for (const [name, context] of spoofs)
      for (const kind of [GM_INTERPRETED_PC_WAIT, "direct-observation"])
        expect(temporalOriginPairing(context, kind), `${name} / ${kind}`).toBe("DENY");
    // the strict player pair too: an extra member or a spoofed value is not the legacy origin
    expect(temporalOriginPairing({ ...PLAYER, session: "s" }, "direct-observation")).toBe("DENY");
    expect(temporalOriginPairing({ ...PLAYER, role: "role.player " }, "direct-observation")).toBe(
      "DENY",
    );
  });

  it("B0 refusal-only: parseGmWaitRequest refuses every non-GM_WAIT pairing before the shape parse and never returns ok for one", () => {
    const denied = (r: ReturnType<typeof parseGmWaitRequest>) =>
      !r.ok &&
      r.error.code === "INPUT_INVALID" &&
      r.error.details?.["reason"] === "ORIGIN_PAIRING_DENIED" &&
      r.error.details?.["issues"] === undefined;
    // controls: the GM pairing with an otherwise valid body parses, for both phases
    expect(parseGmWaitRequest(request("INITIAL", GM, GM_INTERPRETED_PC_WAIT)).ok).toBe(true);
    expect(parseGmWaitRequest(request("CONTINUATION", GM, GM_INTERPRETED_PC_WAIT)).ok).toBe(true);
    const pairings: ReadonlyArray<readonly [string, unknown, string]> = [
      ["GM pair with an existing kind", GM, "direct-observation"],
      ["GM pair with an unknown kind", GM, "x-future-trigger"],
      ["GM pair with the lowercase alias", GM, "gm_interpreted_pc_wait"],
      ["GM pair with a provisional resume name", GM, "GM_RESUME_ADJUDICATED_WAIT"],
      ["GM role with the player permission", GM_ROLE_PLAYER_PERMISSION, GM_INTERPRETED_PC_WAIT],
      ["player role with the GM permission", PLAYER_ROLE_GM_PERMISSION, GM_INTERPRETED_PC_WAIT],
      ["player pair with the GM trigger", PLAYER, GM_INTERPRETED_PC_WAIT],
      ["player pair with a legacy kind", PLAYER, "direct-observation"],
      ["spoofed role", { ...GM, role: "role.gm " }, GM_INTERPRETED_PC_WAIT],
      ["extra context member", { ...GM, session: "s" }, GM_INTERPRETED_PC_WAIT],
    ];
    for (const [name, context, kind] of pairings)
      for (const phase of ["INITIAL", "CONTINUATION"] as const) {
        const v = request(phase, context, kind);
        expect(denied(parseGmWaitRequest(v)), `${name} / ${phase}`).toBe(true);
        // the body is not what is refused: the same body under the GM pairing parses
        expect(
          parseGmWaitRequest({
            ...v,
            context: GM,
            trigger: { ...(v["trigger"] as Value), kind: GM_INTERPRETED_PC_WAIT },
          }).ok,
          `${name} body control`,
        ).toBe(true);
      }
    // before the shape parse: a body that is also shape-broken is refused for its pairing alone, not for its shape
    const broken = { ...request("INITIAL", PLAYER, GM_INTERPRETED_PC_WAIT), gm_wait: undefined };
    expect(denied(parseGmWaitRequest(broken))).toBe(true);
    // and with the right pairing the same break is a shape refusal, carrying issues and no pairing reason
    const shapeOnly = parseGmWaitRequest({
      ...request("INITIAL", GM, GM_INTERPRETED_PC_WAIT),
      gm_wait: undefined,
    });
    expect(!shapeOnly.ok && shapeOnly.error.details?.["reason"] === undefined).toBe(true);
    expect(!shapeOnly.ok && Array.isArray(shapeOnly.error.details?.["issues"])).toBe(true);
    // not an object at all
    for (const raw of [null, undefined, 0, "GM_INTERPRETED_PC_WAIT", [], true])
      expect(denied(parseGmWaitRequest(raw)), JSON.stringify(raw)).toBe(true);
  });

  it("B0 refusal-only: a denied pairing is decided from the context and trigger alone, with no other member read, and a hostile value is refused rather than thrown", () => {
    const read = (v: object): { keys: string[]; result: ReturnType<typeof parseGmWaitRequest> } => {
      const keys: string[] = [];
      const spy = new Proxy(v, {
        get(target, key, receiver) {
          keys.push(String(key));
          return Reflect.get(target, key, receiver) as unknown;
        },
        ownKeys(target) {
          keys.push("<ownKeys>");
          return Reflect.ownKeys(target);
        },
      });
      return { keys, result: parseGmWaitRequest(spy) };
    };
    // the denied pairing reads the context and the trigger only: the body, and the ownership of its members, are never examined
    const denied = read(request("INITIAL", PLAYER, GM_INTERPRETED_PC_WAIT));
    expect(denied.result.ok).toBe(false);
    expect([...new Set(denied.keys)].sort()).toEqual(["context", "trigger"]);
    // the control is one change away (the context): the shape parse then does read the body
    const allowed = read(request("INITIAL", GM, GM_INTERPRETED_PC_WAIT));
    expect(allowed.result.ok).toBe(true);
    expect(allowed.keys).toContain("gm_wait");
    expect(allowed.keys).toContain("<ownKeys>");
    // a getter that throws is a refusal, never an exception
    const throwing = (member: string): Value => {
      const v = request("INITIAL", GM, GM_INTERPRETED_PC_WAIT);
      Object.defineProperty(v, member, {
        enumerable: true,
        get(): never {
          throw new Error("hostile getter");
        },
      });
      return v;
    };
    for (const member of ["context", "trigger", "gm_wait", "requested", "transaction_id"]) {
      const r = parseGmWaitRequest(throwing(member));
      expect(r.ok, member).toBe(false);
      expect(!r.ok && r.error.code, member).toBe("INPUT_INVALID");
    }
  });
});
