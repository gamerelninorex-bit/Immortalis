/* eslint-disable @typescript-eslint/no-explicit-any -- tests forge arbitrary group and fact values */
// S-4 initial Standing Instruction ledger — FORGED INPUT presented RAW to a store that has admission but is reached WITHOUT the owner
// path (BLUE brief B4: "Forged input": direct raw store commit, false archivist/GM/player role, copied source pin, spoofed older
// citation, wrong origin, malformed digest, version beyond first, unqualified binding receipt, fake group or source type).
//
// Method: a genuine raw group is built mechanically from the committed facts (the control commits it and verifies), then each
// case alters it in exactly one way; `reseal` recomputes what is DERIVED from an edited body so the group differs from a genuine one
// only by the forgery under test. Every forgery must be REFUSED with the same canonical rejection as through the owner path, and
// must commit nothing.
import { describe, expect, it } from "vitest";
import { PC_LEDGER_BINDING_RULE, PC_MOVEMENT_RULE, factKind } from "@immortalis/engine";
import { fixtureContract, publication } from "@immortalis/testkit";
import {
  HEAD_KEY,
  PC,
  VERSION_KEY,
  bindInput,
  code,
  rawBinding,
  rawLedgerGroup,
  releasedCampaign,
  reseal,
  target,
} from "../support/ledger.ts";
import { commitClosure, commitPlacement, r1Scene } from "../support/actor-presence.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const version = (g: any) =>
  g.writes.find((w: any) => w.key === VERSION_KEY || w.key.includes("/version/"))!;
const head = (g: any) => g.writes.find((w: any) => w.key === HEAD_KEY)!;

describe("a raw ledger group is admitted only when genuine (control) and every forgery is refused with a canonical code", () => {
  it("control: the mechanically built raw group is admitted, is byte-equal to the owner path's, and the campaign verifies", async () => {
    const owner = await releasedCampaign(tempDir());
    await must(owner.initializePcStandingInstructionLedger(target()));
    const ownerGroup = owner.store.committedGroup(
      owner.store.getFact(HEAD_KEY)!.provenance.intent_id,
    );
    const raw = await releasedCampaign(tempDir());
    const g = await rawLedgerGroup(raw);
    await must(raw.store.commit(g));
    expect(raw.verify()).toEqual([]);
    // the owner path and a hand-built raw commit are the same group: the owner path has no private power
    expect(g).toEqual(ownerGroup);
    expect(raw.store.head().state_sha256).toBe(owner.store.head().state_sha256);
    await owner.close();
    await raw.close();
  });

  type Forgery = readonly [string, (g: any) => void, string, boolean?];
  const SHA = "ab".repeat(32);
  const forgeries: readonly Forgery[] = [
    // -- false roles and wrong owners (host assertions carry no authority) ------------------------------------------------------
    [
      "a false role.player authority",
      (g) => (g.authority = { role: "role.player", permission: "permission.player_choice.commit" }),
      "AUTHORITY_DENIED",
    ],
    [
      "a false role.gm authority",
      (g) => (g.authority = { role: "role.gm", permission: "permission.rule.adjudicate" }),
      "AUTHORITY_DENIED",
    ],
    [
      "role.archivist with a player permission",
      (g) =>
        (g.authority = { role: "role.archivist", permission: "permission.player_choice.commit" }),
      "AUTHORITY_DENIED",
    ],
    [
      "a persona in place of a role",
      (g) => (g.authority = { role: "george", permission: "permission.canon.write" }),
      "AUTHORITY_DENIED",
    ],
    [
      "the Role Registry claiming the ledger keys",
      (g) => {
        g.owner = "role_registry";
        g.facet = "player_character_binding";
        for (const w of g.writes)
          Object.assign(w, { owner: "role_registry", facet: "player_character_binding" });
      },
      "KEY_NOT_ADMITTED",
    ],
    [
      "the intrinsic existence_contract facet claiming the ledger keys",
      (g) => {
        g.facet = "existence_contract";
        for (const w of g.writes) w.facet = "existence_contract";
      },
      "KEY_NOT_ADMITTED",
    ],
    [
      "an unregistered facet",
      (g) => (g.facet = "standing_instruction_ledger_2"),
      "OWNER_NOT_REGISTERED",
    ],
    // -- copied / spoofed source citations ---------------------------------------------------------------------------------------
    [
      "the binding's S-4 citation copied onto the ledger",
      (g) => (g.rule = PC_LEDGER_BINDING_RULE),
      "REFERENCE_INVALID",
    ],
    [
      "the original binding (IR) citation",
      (g) => (g.rule = factKind("player_character_binding").rule),
      "REFERENCE_INVALID",
    ],
    ["another kind's citation", (g) => (g.rule = PC_MOVEMENT_RULE), "REFERENCE_INVALID"],
    [
      "the S-4 citation with an altered native pin",
      (g) => (g.rule = { ...g.rule, native_pin: "2026-11-15T14:02:45.230Z" }),
      "REFERENCE_INVALID",
    ],
    [
      "the S-4 citation claiming to be spec-locked",
      (g) => (g.rule = { ...g.rule, effective_basis: "pinned-by-spec-lock" }),
      "REFERENCE_INVALID",
    ],
    // -- digests ----------------------------------------------------------------------------------------------------------------
    [
      "an uppercase digest",
      (g) => (version(g).value.content_sha256 = version(g).value.content_sha256.toUpperCase()),
      "VALUE_INVALID",
    ],
    [
      "a truncated digest",
      (g) => (version(g).value.content_sha256 = version(g).value.content_sha256.slice(0, 63)),
      "VALUE_INVALID",
    ],
    [
      "a well-formed digest that is not the content's",
      (g) => {
        version(g).value.content_sha256 = SHA;
        head(g).value.content_sha256 = SHA;
      },
      "REFERENCE_INVALID",
    ],
    [
      "a head that carries another digest than its version",
      (g) => (head(g).value.content_sha256 = SHA),
      "REFERENCE_INVALID",
    ],
    // -- the head's pointer --------------------------------------------------------------------------------------------------------
    [
      "a head pointing at version 2",
      (g) => (head(g).value.current.version = 2),
      "REFERENCE_INVALID",
    ],
    [
      "a head pointing at another key",
      (g) => (head(g).value.current.fact_key = `pc/${PC}/standing-instruction-ledger/version/2`),
      "REFERENCE_INVALID",
    ],
    ["a head naming another PC", (g) => (head(g).value.pc_id = "someone-else"), "VALUE_INVALID"],
    // -- versions beyond the first ----------------------------------------------------------------------------------------------------
    ["a sequence-2 version", (g) => (version(g).value.sequence = 2), "VALUE_INVALID"],
    [
      "a version under the sequence-2 key",
      (g) => (version(g).key = `pc/${PC}/standing-instruction-ledger/version/2`),
      "VALUE_INVALID",
    ],
    [
      "a non-canonical sequence key (leading zero)",
      (g) => (version(g).key = `pc/${PC}/standing-instruction-ledger/version/01`),
      "KEY_NOT_ADMITTED",
    ],
    [
      "an alias key outside the key space",
      (g) => (head(g).key = `pc/${PC}/standing-instruction-ledger`),
      "KEY_NOT_ADMITTED",
    ],
    // -- the carrier holds no instruction and no authorship -----------------------------------------------------------------------------
    [
      "an affirmative instruction labelled empty",
      (g) => (version(g).value.instructions = [{ text: "if distress arrives, divert" }]),
      "VALUE_INVALID",
    ],
    [
      "a previous version",
      (g) => (version(g).value.previous = { fact_key: VERSION_KEY, version: 1 }),
      "VALUE_INVALID",
    ],
    [
      "a PLAYER_AUTHORED origin",
      (g) => (version(g).value.origin = { kind: "PLAYER_AUTHORED" }),
      "VALUE_INVALID",
    ],
    [
      "an unknown origin member",
      (g) => (version(g).value.origin.directive = "divert"),
      "VALUE_INVALID",
    ],
    ["an unknown version member", (g) => (version(g).value.consent = true), "VALUE_INVALID"],
    [
      "an omitted setup_closure (it must be an explicit null)",
      (g) => delete version(g).value.origin.setup_closure,
      "VALUE_INVALID",
    ],
    // -- fake sources ------------------------------------------------------------------------------------------------------------------
    [
      "a PC creation cited at another version",
      (g) => (version(g).value.origin.pc_creation.version = 2),
      "REFERENCE_INVALID",
      true,
    ],
    [
      "a PC creation cited with another commit identity",
      (g) => (version(g).value.origin.pc_creation.commit.group_id = "wf-group-99"),
      "REFERENCE_INVALID",
      true,
    ],
    [
      "a PC creation citing another PC's contract",
      (g) => (version(g).value.origin.pc_creation.fact_key = "pc/pc-b/existence-contract"),
      "REFERENCE_INVALID",
      true,
    ],
    [
      "START_OF_LEDGER for a PC with no operative binding (wrong origin)",
      (g) => {
        version(g).value.origin = {
          kind: "START_OF_LEDGER",
          operative_binding: {
            fact_key: "role-registry/binding/role.player_character",
            version: 1,
            commit: { group_id: "g", intent_id: "i" },
          },
        };
        g.reads = [{ key: "role-registry/binding/role.player_character", version: 0 }];
        g.depends_on = [];
      },
      "PREREQUISITE_MISSING",
      true,
    ],
    // -- the group itself ----------------------------------------------------------------------------------------------------------------
    [
      "a fake group that does not read the PC contract",
      (g) => (g.reads = g.reads.filter((r: any) => !r.key.endsWith("/existence-contract"))),
      "REFERENCE_INVALID",
    ],
    [
      "a fake group that does not depend on the PC contract's group",
      (g) => (g.depends_on = []),
      "REFERENCE_INVALID",
    ],
    ["a non-canonical basis", (g) => (version(g).basis = "my-basis"), "VALUE_INVALID"],
    ["a non-canonical secrecy", (g) => (head(g).secrecy = "public"), "VALUE_INVALID"],
    ["a head alone (no sealed version)", (g) => (g.writes = [head(g)]), "VALUE_INVALID"],
    [
      "a non-canonical operation identity",
      (g) => (g.group_id = "my-own-group"),
      "REFERENCE_INVALID",
    ],
    [
      "a non-canonical intent identity",
      (g) => (g.intent_id = "my-own-intent"),
      "REFERENCE_INVALID",
    ],
    [
      "a head created at a non-zero expected version (an advance of nothing)",
      (g) => (head(g).expected_version = 1),
      "VERSION_CONFLICT",
    ],
  ];
  for (const [what, edit, expected, resealAfter] of forgeries) {
    it(`${what} → ${expected}, and nothing is committed`, async () => {
      const c = await releasedCampaign(tempDir());
      // a second PC so that "another PC's contract" is a real, committed fact and not merely an absent one
      await must(
        c.releasePlayerCharacter({
          ...publication(60),
          contract: fixtureContract({ pc_id: "pc-b" }),
        }),
      );
      const g = await rawLedgerGroup(c, (x) => {
        edit(x);
        if (resealAfter) reseal(x);
      });
      const before = c.store.head();
      expect(await code(c.store.commit(g) as never)).toBe(expected);
      expect(c.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
      expect(c.standingInstructionLedger(PC)).toBeUndefined();
      expect(c.verify()).toEqual([]);
      await c.close();
    });
  }

  it("later mutation of a committed ledger is refused: no advance, overwrite or second version is supported", async () => {
    const c = await releasedCampaign(tempDir());
    await must(c.initializePcStandingInstructionLedger(target()));
    const before = c.store.head();
    // advancing the head (the registered lifecycle is ADVANCING, but only initialization is supported)
    const advance = await rawLedgerGroup(c, (g) => {
      g.group_id = "advance-group";
      g.intent_id = "advance-intent";
      head(g).expected_version = 1;
      version(g).expected_version = 1;
    });
    expect(await code(c.store.commit(advance) as never)).toBe("AMENDMENT_NOT_SUPPORTED");
    // a second initialization under new identities collides with the existing keys
    const dup = await rawLedgerGroup(c, (g) => {
      g.group_id = "dup-group";
      g.intent_id = "dup-intent";
    });
    expect(await code(c.store.commit(dup) as never)).toBe("VERSION_CONFLICT");
    // the sealed version cannot be overwritten
    const over = await rawLedgerGroup(c, (g) => {
      g.group_id = "over-group";
      g.intent_id = "over-intent";
      g.writes = [version(g)];
      version(g).expected_version = 1;
    });
    expect(await code(c.store.commit(over) as never)).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(c.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  it("a genuine ledger group built before a setup placement existed is REFUSED when presented after one (raw parity with the owner path)", async () => {
    const s = await r1Scene(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    const stale = await rawLedgerGroup(s.campaign); // genuine against the state it was built on: no placement, so a null closure
    await must(commitPlacement(s)); // a real B1 setup placement now enters through the R1 owner path: a closure is owed
    const before = s.campaign.store.head();
    // the pre-built group is no longer true of the state: committing it would end setup eligibility and strand the owed closure
    expect(await code(s.campaign.store.commit(stale) as never)).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
    // and the owner path agrees, with the same code
    expect(await code(s.campaign.initializePcStandingInstructionLedger(target()))).toBe(
      "REFERENCE_INVALID",
    );
    // once the closure is committed the ledger is lawful again (control)
    await must(commitClosure(s));
    await must(s.campaign.initializePcStandingInstructionLedger(target()));
    await s.campaign.close();
  });
});

describe("a raw BINDING group is judged by the same rule as the owner path", () => {
  it("control: a mechanically built raw binding that cites S-4 and reads/depends on the head is admitted", async () => {
    const c = await releasedCampaign(tempDir());
    await must(c.initializePcStandingInstructionLedger(target()));
    await must(c.store.commit(rawBinding(c, 1)));
    expect(c.verify()).toEqual([]);
    await c.close();
  });

  const bindingForgeries: readonly [string, boolean, Parameters<typeof rawBinding>[2], string][] = [
    ["a headless binding that cites S-4 (no head committed)", false, {}, "PREREQUISITE_MISSING"],
    [
      "a headless binding that cites the ORIGINAL citation (fresh old-cited writes fail closed)",
      false,
      { citation: "ORIGINAL" },
      "REFERENCE_INVALID",
    ],
    [
      "a binding that cites the ORIGINAL citation even with a head committed",
      true,
      { citation: "ORIGINAL" },
      "REFERENCE_INVALID",
    ],
    [
      "a binding that does not read the head and version it consumes",
      true,
      { withLedgerReads: false },
      "REFERENCE_INVALID",
    ],
    [
      "a binding that does not depend on the group that committed the head",
      true,
      {
        edit: (_v, g) =>
          (g.depends_on = g.depends_on.filter((d: string) => !d.startsWith("s4-ledger-group:"))),
      },
      "REFERENCE_INVALID",
    ],
    [
      "a binding that reads the head at a stale version",
      true,
      {
        edit: (_v, g) =>
          (g.reads = g.reads.map((r: any) => (r.key === HEAD_KEY ? { ...r, version: 0 } : r))),
      },
      "STALE_READ",
    ],
    [
      "a binding that spoofs the S-4 citation with another pin",
      true,
      { edit: (_v, g) => (g.rule = { ...g.rule, native_pin: "2026-11-15T13:54:22.607Z" }) },
      "REFERENCE_INVALID",
    ],
  ];
  for (const [what, withHead, opts, expected] of bindingForgeries) {
    it(`${what} → ${expected}, and creates no binding`, async () => {
      const c = await releasedCampaign(tempDir());
      if (withHead) await must(c.initializePcStandingInstructionLedger(target()));
      const g = rawBinding(c, 1, { withLedgerReads: withHead, ...opts });
      const before = c.store.head();
      expect(await code(c.store.commit(g) as never)).toBe(expected);
      expect(c.binding()).toBeUndefined();
      expect(c.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
      expect(c.verify()).toEqual([]);
      await c.close();
    });
  }

  it("the raw refusal of a headless binding is the SAME canonical code as the owner path's", async () => {
    const a = await releasedCampaign(tempDir());
    const viaOwner = await code(a.bindPlayerCharacter(bindInput()));
    const b = await releasedCampaign(tempDir());
    const viaRaw = await code(
      b.store.commit(rawBinding(b, 1, { withLedgerReads: false })) as never,
    );
    expect(viaRaw).toBe(viaOwner);
    expect(viaOwner).toBe("PREREQUISITE_MISSING");
    await a.close();
    await b.close();
  });
});
